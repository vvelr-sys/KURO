-- ============================================================
-- KURO POS — Migration 022: ตรวจนับสต็อกเปิด/ปิดร้าน โดย Staff + รับของเข้า/ของเสีย
-- ------------------------------------------------------------
-- ต้องรันหลัง 001–008 (ไม่ต้องเพิ่ม role ใหม่ — ใช้ role staff ที่มีอยู่แล้ว)
-- รันซ้ำได้ ไม่ลบข้อมูล อยู่ใน Transaction เดียว
--
-- หลักการ:
--   * staff ไม่ได้รับสิทธิ์อ่าน/เขียนตารางสต็อกตรงๆ — ทำผ่านฟังก์ชันด้านล่างเท่านั้น
--     เพื่อให้ "นับแบบไม่เห็นยอด" ได้จริง (RLS ซ่อนคอลัมน์ current_stock ไม่ได้)
--   * ยอดในระบบ (system_stock) ถูกบันทึกโดยฐานข้อมูล ณ เวลาส่ง ไม่รับค่าจากหน้าจอ
--   * ตอนอนุมัติ ปรับยอดเฉพาะ "ผลต่าง" เพราะระหว่างรออนุมัติ ครัวอาจตัดสต็อกไปอีก
--
-- ฟังก์ชันที่เพิ่ม:
--   fn_bangkok_today()               วันที่ปัจจุบันตามเวลาไทย
--   fn_ingredients_for_count()       รายการวัตถุดิบ (ไม่มียอดคงเหลือ) สำหรับหน้านับ
--   fn_today_stock_count_rounds()    สถานะรอบนับของวันนี้
--   fn_submit_stock_count(...)       ส่งผลนับ (มีขั้นเตือนให้นับซ้ำ)
--   fn_review_stock_count(...)       Manager อนุมัติ/ปฏิเสธ → ปรับยอด + Audit Log
--   fn_record_stock_movement(...)    รับของเข้า (manual_restock) / ของเสีย (kitchen_waste)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) รอบการนับ: opening (เปิดร้าน) / closing (ปิดร้าน)
--    แถวเดิมทั้งหมดถือเป็นรอบปิดร้าน (FR-060 เดิม)
--    1 วัน 1 รอบ นับได้ครั้งเดียว ยกเว้นรอบที่ถูกปฏิเสธ (นับใหม่ได้)
-- ------------------------------------------------------------
ALTER TABLE stock_counts
    ADD COLUMN IF NOT EXISTS count_round VARCHAR(10) NOT NULL DEFAULT 'closing';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'stock_counts_count_round_check'
    ) THEN
        ALTER TABLE stock_counts
            ADD CONSTRAINT stock_counts_count_round_check
            CHECK (count_round IN ('opening', 'closing'));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_stock_count_round
    ON stock_counts (count_date, count_round)
    WHERE status <> 'rejected';

-- ------------------------------------------------------------
-- 2) วันที่ตามเวลาไทย (ฐานข้อมูล Supabase ใช้เวลา UTC — CURRENT_DATE ตอนตี 6 ไทยยังเป็นเมื่อวาน)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_bangkok_today()
RETURNS DATE AS $$
    SELECT (now() AT TIME ZONE 'Asia/Bangkok')::date;
$$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------
-- 3) รายการวัตถุดิบสำหรับหน้านับ — ส่งเฉพาะชื่อและหน่วย (ไม่ส่งยอดคงเหลือ)
-- ------------------------------------------------------------
-- DROP ก่อน: ฐานข้อมูลที่รัน 026/028 ไปแล้วมีเวอร์ชันที่คืน image_url ด้วย (ชนิดผลลัพธ์ต่างกัน
-- CREATE OR REPLACE จะ error "cannot change return type") — รัน 026, 028 ต่อจะได้เวอร์ชันล่าสุดกลับมา
DROP FUNCTION IF EXISTS fn_ingredients_for_count();
CREATE FUNCTION fn_ingredients_for_count()
RETURNS TABLE (id UUID, name VARCHAR, unit VARCHAR) AS $$
BEGIN
    IF fn_my_role() IS NULL OR fn_my_role() NOT IN ('staff', 'manager', 'admin') THEN
        RAISE EXCEPTION 'ไม่มีสิทธิ์ดูรายการวัตถุดิบสำหรับตรวจนับ';
    END IF;

    RETURN QUERY
    SELECT i.id, i.name, i.unit
    FROM public.ingredients i
    ORDER BY i.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 4) สถานะรอบนับของวันนี้ (ใช้ปิดปุ่มรอบที่ส่งไปแล้ว)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_today_stock_count_rounds()
RETURNS TABLE (count_round VARCHAR, status stock_count_status, counted_at TIMESTAMPTZ) AS $$
BEGIN
    IF fn_my_role() IS NULL OR fn_my_role() NOT IN ('staff', 'manager', 'admin') THEN
        RAISE EXCEPTION 'ไม่มีสิทธิ์ดูรอบการตรวจนับ';
    END IF;

    RETURN QUERY
    SELECT sc.count_round, sc.status, sc.created_at
    FROM public.stock_counts sc
    WHERE sc.count_date = fn_bangkok_today()
    ORDER BY sc.created_at;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 5) ส่งผลนับสต็อก
--    p_items = [{ "ingredient_id": "...", "counted_stock": 1234.5, "reason": "..." }, ...]
--    ต้องนับครบทุกวัตถุดิบ (เพื่อให้ซื้อของได้ถูกต้อง)
--
--    ขั้นเตือนนับซ้ำ: ถ้ามีรายการที่ต่างจากระบบเกิน 10% และ p_confirm_recount = false
--    จะ "ยังไม่บันทึก" แต่ส่งกลับรายชื่อวัตถุดิบที่ควรนับซ้ำ (ไม่บอกยอดในระบบ)
--    เมื่อนับซ้ำแล้วส่งอีกครั้งด้วย p_confirm_recount = true จึงบันทึกจริง
--
--    คืนค่า: { "status": "need_recount", "ingredient_ids": [...] }
--         หรือ { "status": "submitted", "stock_count_id": "..." }
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_submit_stock_count(
    p_count_round       TEXT,
    p_items             JSONB,
    p_confirm_recount   BOOLEAN DEFAULT false
)
RETURNS JSONB AS $$
DECLARE
    -- เกณฑ์ผลต่างที่ต้องเตือนให้นับซ้ำ (ร้อยละของยอดในระบบ)
    c_recount_percent CONSTANT NUMERIC := 10;

    v_actor            UUID := auth.uid();
    v_today            DATE := fn_bangkok_today();
    v_ingredient_count INT;
    v_item_count       INT;
    v_flagged_ids      UUID[];
    v_stock_count_id   UUID;
BEGIN
    IF fn_my_role() IS NULL OR fn_my_role() NOT IN ('staff', 'manager', 'admin') THEN
        RAISE EXCEPTION 'ไม่มีสิทธิ์ส่งผลตรวจนับสต็อก';
    END IF;

    IF p_count_round NOT IN ('opening', 'closing') THEN
        RAISE EXCEPTION 'รอบการนับไม่ถูกต้อง: %', p_count_round;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.stock_counts
        WHERE count_date = v_today AND count_round = p_count_round AND status <> 'rejected'
    ) THEN
        RAISE EXCEPTION 'รอบนี้ของวันนี้ส่งผลนับไปแล้ว (ถ้าต้องการนับใหม่ ให้ผู้จัดการปฏิเสธรอบเดิมก่อน)';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION 'ข้อมูลผลนับไม่ถูกต้อง';
    END IF;

    -- แปลง JSON เป็นตารางชั่วคราว พร้อมยอดในระบบ ณ เวลานี้ (ล็อกแถววัตถุดิบไว้ระหว่างทำรายการ)
    DROP TABLE IF EXISTS tmp_count_items;
    CREATE TEMP TABLE tmp_count_items ON COMMIT DROP AS
    SELECT
        (item ->> 'ingredient_id')::uuid           AS ingredient_id,
        (item ->> 'counted_stock')::numeric(12,3)  AS counted_stock,
        NULLIF(btrim(item ->> 'reason'), '')       AS adjustment_reason
    FROM jsonb_array_elements(p_items) AS item;

    IF EXISTS (SELECT 1 FROM tmp_count_items WHERE counted_stock IS NULL OR counted_stock < 0) THEN
        RAISE EXCEPTION 'ยอดที่นับได้ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป';
    END IF;

    SELECT count(*) INTO v_ingredient_count FROM public.ingredients;
    SELECT count(DISTINCT t.ingredient_id) INTO v_item_count
    FROM tmp_count_items t
    JOIN public.ingredients i ON i.id = t.ingredient_id;

    IF v_item_count <> v_ingredient_count
       OR (SELECT count(*) FROM tmp_count_items) <> v_ingredient_count THEN
        RAISE EXCEPTION 'ต้องนับให้ครบทุกวัตถุดิบ (นับแล้ว % จาก % รายการ)', v_item_count, v_ingredient_count;
    END IF;

    PERFORM 1 FROM public.ingredients FOR UPDATE;

    -- หารายการที่ต่างจากระบบมาก
    SELECT array_agg(t.ingredient_id) INTO v_flagged_ids
    FROM tmp_count_items t
    JOIN public.ingredients i ON i.id = t.ingredient_id
    WHERE abs(t.counted_stock - i.current_stock) > 0
      AND abs(t.counted_stock - i.current_stock) > i.current_stock * c_recount_percent / 100;

    IF NOT p_confirm_recount AND v_flagged_ids IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'need_recount', 'ingredient_ids', to_jsonb(v_flagged_ids));
    END IF;

    INSERT INTO public.stock_counts (count_date, count_round, status, counted_by)
    VALUES (v_today, p_count_round, 'pending_review', v_actor)
    RETURNING id INTO v_stock_count_id;

    INSERT INTO public.stock_count_items (
        stock_count_id, ingredient_id, system_stock, counted_stock, discrepancy, adjustment_reason
    )
    SELECT v_stock_count_id, t.ingredient_id, i.current_stock, t.counted_stock,
           t.counted_stock - i.current_stock, t.adjustment_reason
    FROM tmp_count_items t
    JOIN public.ingredients i ON i.id = t.ingredient_id;

    INSERT INTO public.audit_logs (actor_id, action, target_entity, target_id, payload_after)
    VALUES (
        v_actor, 'SUBMIT_STOCK_COUNT', 'stock_counts', v_stock_count_id::text,
        jsonb_build_object(
            'count_round', p_count_round,
            'count_date', v_today,
            'item_count', v_item_count,
            'flagged_count', COALESCE(array_length(v_flagged_ids, 1), 0)
        )
    );

    RETURN jsonb_build_object('status', 'submitted', 'stock_count_id', v_stock_count_id);
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 6) อนุมัติ / ปฏิเสธผลนับ (Manager; Admin เฉพาะ Emergency พร้อมเหตุผล — FR-064)
--    อนุมัติ: ปรับยอดตาม "ผลต่าง" (counted - system ณ เวลาส่ง) ไม่ใช่ตั้งยอดเท่ากับที่นับ
--    เพราะระหว่างรออนุมัติ ครัวอาจตัดสต็อกไปแล้ว
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_review_stock_count(
    p_stock_count_id UUID,
    p_approve        BOOLEAN,
    p_reason         TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_actor      UUID := auth.uid();
    v_role       user_role := fn_my_role();
    v_reason     TEXT := NULLIF(btrim(p_reason), '');
    v_count      RECORD;
    rec          RECORD;
    v_old_stock  NUMERIC(12,3);
    v_new_stock  NUMERIC(12,3);
    v_changes    JSONB := '[]'::jsonb;
BEGIN
    IF v_role IS NULL OR v_role NOT IN ('manager', 'admin') THEN
        RAISE EXCEPTION 'เฉพาะผู้จัดการ (หรือแอดมินกรณีฉุกเฉิน) เท่านั้นที่อนุมัติผลนับได้';
    END IF;

    IF v_role = 'admin' AND v_reason IS NULL THEN
        RAISE EXCEPTION 'แอดมินอนุมัติแทนผู้จัดการได้เฉพาะกรณีฉุกเฉิน — กรุณาระบุเหตุผล';
    END IF;

    IF NOT p_approve AND v_reason IS NULL THEN
        RAISE EXCEPTION 'กรุณาระบุเหตุผลที่ปฏิเสธผลนับ';
    END IF;

    SELECT * INTO v_count FROM public.stock_counts WHERE id = p_stock_count_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบรอบการตรวจนับนี้';
    END IF;
    IF v_count.status <> 'pending_review' THEN
        RAISE EXCEPTION 'รอบนี้ถูกตรวจสอบไปแล้ว (สถานะ: %)', v_count.status;
    END IF;

    IF NOT p_approve THEN
        UPDATE public.stock_counts
        SET status = 'rejected', rejection_reason = v_reason, approved_by = v_actor, approved_at = now()
        WHERE id = p_stock_count_id;

        INSERT INTO public.audit_logs (actor_id, action, target_entity, target_id, reason, payload_before, payload_after)
        VALUES (v_actor, 'REJECT_STOCK_COUNT', 'stock_counts', p_stock_count_id::text, v_reason,
                jsonb_build_object('status', 'pending_review'),
                jsonb_build_object('status', 'rejected', 'count_round', v_count.count_round));
        RETURN;
    END IF;

    -- อนุมัติ: ปรับยอดทีละวัตถุดิบที่มีผลต่าง
    FOR rec IN
        SELECT sci.ingredient_id, sci.system_stock, sci.counted_stock, sci.discrepancy
        FROM public.stock_count_items sci
        WHERE sci.stock_count_id = p_stock_count_id AND sci.discrepancy <> 0
    LOOP
        SELECT current_stock INTO v_old_stock
        FROM public.ingredients WHERE id = rec.ingredient_id FOR UPDATE;

        -- ยอดติดลบไม่ได้ (CHECK current_stock >= 0)
        v_new_stock := GREATEST(v_old_stock + rec.discrepancy, 0);

        UPDATE public.ingredients SET current_stock = v_new_stock WHERE id = rec.ingredient_id;

        INSERT INTO public.stock_movements (
            ingredient_id, stock_count_id, movement_type, quantity, balance_after, reason, created_by
        ) VALUES (
            rec.ingredient_id, p_stock_count_id, 'stock_count_adjustment',
            v_new_stock - v_old_stock, v_new_stock,
            CASE v_count.count_round WHEN 'opening' THEN 'ปรับยอดตรวจนับเปิดร้าน' ELSE 'ปรับยอดตรวจนับปิดร้าน' END
                || ' ' || v_count.count_date,
            v_actor
        );

        v_changes := v_changes || jsonb_build_object(
            'ingredient_id', rec.ingredient_id,
            'system_stock', rec.system_stock,
            'counted_stock', rec.counted_stock,
            'discrepancy', rec.discrepancy
        );
    END LOOP;

    UPDATE public.stock_counts
    SET status = 'approved', approved_by = v_actor, approved_at = now()
    WHERE id = p_stock_count_id;

    -- Audit Log: ADJUST_STOCK_COUNT (audit_matrix.md) + EMERGENCY_OVERRIDE เมื่อเป็นแอดมิน
    INSERT INTO public.audit_logs (actor_id, action, target_entity, target_id, reason, payload_before, payload_after)
    VALUES (v_actor, 'ADJUST_STOCK_COUNT', 'stock_counts', p_stock_count_id::text, v_reason,
            jsonb_build_object('status', 'pending_review'),
            jsonb_build_object('status', 'approved', 'count_round', v_count.count_round, 'changes', v_changes));

    IF v_role = 'admin' THEN
        INSERT INTO public.audit_logs (actor_id, action, target_entity, target_id, reason)
        VALUES (v_actor, 'EMERGENCY_OVERRIDE', 'stock_counts', p_stock_count_id::text, v_reason);
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 7) รับของเข้า / บันทึกของเสีย
--    p_quantity เป็นค่าบวกเสมอ ระบบใส่เครื่องหมายให้ตามประเภท
--    ของเสียต้องระบุเหตุผล
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_record_stock_movement(
    p_ingredient_id UUID,
    p_movement_type TEXT,
    p_quantity      NUMERIC,
    p_reason        TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_actor     UUID := auth.uid();
    v_reason    TEXT := NULLIF(btrim(p_reason), '');
    v_old_stock NUMERIC(12,3);
    v_change    NUMERIC(12,3);
    v_new_stock NUMERIC(12,3);
BEGIN
    IF fn_my_role() IS NULL OR fn_my_role() NOT IN ('staff', 'manager', 'admin') THEN
        RAISE EXCEPTION 'ไม่มีสิทธิ์บันทึกรับของเข้า/ของเสีย';
    END IF;

    IF p_movement_type NOT IN ('manual_restock', 'kitchen_waste') THEN
        RAISE EXCEPTION 'ประเภทรายการไม่ถูกต้อง: %', p_movement_type;
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'จำนวนต้องมากกว่า 0';
    END IF;

    IF p_movement_type = 'kitchen_waste' AND v_reason IS NULL THEN
        RAISE EXCEPTION 'กรุณาระบุเหตุผลของเสีย';
    END IF;

    SELECT current_stock INTO v_old_stock
    FROM public.ingredients WHERE id = p_ingredient_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบวัตถุดิบนี้';
    END IF;

    v_change := CASE p_movement_type WHEN 'manual_restock' THEN p_quantity ELSE -p_quantity END;
    v_new_stock := v_old_stock + v_change;

    IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'บันทึกของเสียไม่ได้: จำนวนมากกว่ายอดคงเหลือในระบบ กรุณาแจ้งผู้จัดการตรวจสอบ';
    END IF;

    UPDATE public.ingredients SET current_stock = v_new_stock WHERE id = p_ingredient_id;

    INSERT INTO public.stock_movements (ingredient_id, movement_type, quantity, balance_after, reason, created_by)
    VALUES (p_ingredient_id, p_movement_type::stock_movement_type, v_change, v_new_stock, v_reason, v_actor);
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 8) สิทธิ์เรียกฟังก์ชัน: เฉพาะผู้ใช้ที่ล็อกอิน (ลูกค้า anon เรียกไม่ได้)
--    ข้างในฟังก์ชันตรวจ role ซ้ำอีกชั้น
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION fn_ingredients_for_count() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_today_stock_count_rounds() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_submit_stock_count(TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_review_stock_count(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_record_stock_movement(UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION fn_ingredients_for_count() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_today_stock_count_rounds() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_submit_stock_count(TEXT, JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_review_stock_count(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_record_stock_movement(UUID, TEXT, NUMERIC, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 9) Realtime: ให้หน้าสต็อกของ Manager อัปเดตทันทีเมื่อสต็อกขยับ / มีผลนับใหม่
--    (Realtime ยังเคารพ RLS — เฉพาะ manager/admin ที่อ่าน 2 ตารางนี้ได้จะได้รับข้อมูล)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_table TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH v_table IN ARRAY ARRAY['stock_movements', 'stock_counts'] LOOP
            IF NOT EXISTS (
                SELECT 1 FROM pg_publication_tables
                WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_table
            ) THEN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
            END IF;
        END LOOP;
    END IF;
END $$;

COMMIT;
