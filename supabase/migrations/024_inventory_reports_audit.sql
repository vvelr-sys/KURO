-- ============================================================
-- KURO POS — Migration 024: สต็อก (T-08) + รายงาน/ประวัติ (T-09)
-- ------------------------------------------------------------
-- ต้องรันหลัง 022_staff_stock_counting.sql
-- รันซ้ำได้ (CREATE OR REPLACE / DROP ... IF EXISTS) อยู่ใน Transaction เดียว
--
-- สิ่งที่เพิ่ม:
--   1) FR-024 ปิด/เปิดเมนูอัตโนมัติ: วัตถุดิบในสูตรตัวใดตัวหนึ่ง "ไม่พอทำ 1 จาน" → out_of_stock
--      เติมของครบ → กลับเป็น available เอง (เมนูที่ปิดด้วยมือ manual_off ไม่ถูกแตะ)
--   2) Manager อ่าน/แก้สูตร BOM (menu_ingredients) ได้ — เดิมให้เฉพาะ admin
--   3) Admin ปรับยอดสต็อกฉุกเฉิน (ต้องมีเหตุผล) → stock_movements + Audit EMERGENCY_OVERRIDE
--   4) Audit Log: Manager เห็นทุกรายการ ยกเว้นรายการที่ Admin เป็นผู้ทำ
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) FR-024: คำนวณสถานะเมนูจากสต็อกวัตถุดิบในสูตร
-- ------------------------------------------------------------

-- ปรับสถานะเมนูที่ระบุ (NULL = ทุกเมนูที่มีสูตร)
CREATE OR REPLACE FUNCTION fn_refresh_menu_availability(p_menu_item_ids UUID[] DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    -- วัตถุดิบไม่พอทำ 1 จาน → หมด (เฉพาะเมนูที่ยังเปิดขายอยู่)
    UPDATE public.menu_items mi
    SET availability_status = 'out_of_stock'
    WHERE mi.availability_status = 'available'
      AND (p_menu_item_ids IS NULL OR mi.id = ANY (p_menu_item_ids))
      AND EXISTS (
          SELECT 1
          FROM public.menu_ingredients bom
          JOIN public.ingredients i ON i.id = bom.ingredient_id
          WHERE bom.menu_item_id = mi.id
            AND i.current_stock < bom.quantity_required
      );

    -- เติมของครบทุกตัวแล้ว → เปิดขายอีกครั้ง (เฉพาะที่ระบบปิดเอง ไม่แตะ manual_off)
    UPDATE public.menu_items mi
    SET availability_status = 'available'
    WHERE mi.availability_status = 'out_of_stock'
      AND (p_menu_item_ids IS NULL OR mi.id = ANY (p_menu_item_ids))
      AND NOT EXISTS (
          SELECT 1
          FROM public.menu_ingredients bom
          JOIN public.ingredients i ON i.id = bom.ingredient_id
          WHERE bom.menu_item_id = mi.id
            AND i.current_stock < bom.quantity_required
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- สต็อกวัตถุดิบเปลี่ยน → ตรวจเมนูที่ใช้วัตถุดิบนั้น
CREATE OR REPLACE FUNCTION fn_on_ingredient_stock_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.current_stock IS DISTINCT FROM OLD.current_stock THEN
        PERFORM fn_refresh_menu_availability(
            ARRAY(SELECT menu_item_id FROM public.menu_ingredients WHERE ingredient_id = NEW.id)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_ingredient_stock_menu_availability ON ingredients;
CREATE TRIGGER trg_ingredient_stock_menu_availability
AFTER UPDATE OF current_stock ON ingredients
FOR EACH ROW EXECUTE FUNCTION fn_on_ingredient_stock_change();

-- สูตร BOM เปลี่ยน → ตรวจเมนูนั้นใหม่
CREATE OR REPLACE FUNCTION fn_on_bom_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM fn_refresh_menu_availability(ARRAY[COALESCE(NEW.menu_item_id, OLD.menu_item_id)]);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_bom_menu_availability ON menu_ingredients;
CREATE TRIGGER trg_bom_menu_availability
AFTER INSERT OR UPDATE OR DELETE ON menu_ingredients
FOR EACH ROW EXECUTE FUNCTION fn_on_bom_change();

-- ปรับสถานะทุกเมนูให้ตรงกับสต็อกปัจจุบันครั้งแรก
SELECT fn_refresh_menu_availability(NULL);

-- ------------------------------------------------------------
-- 2) Manager จัดการสูตร BOM ได้ (สเปก 4.2/4.4: Manager, Admin)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "manager_manage_menu_ingredients" ON menu_ingredients;
CREATE POLICY "manager_manage_menu_ingredients" ON menu_ingredients
    FOR ALL
    TO authenticated
    USING (fn_my_role() IN ('admin', 'manager'))
    WITH CHECK (fn_my_role() IN ('admin', 'manager'));

-- ------------------------------------------------------------
-- 3) Admin ปรับยอดสต็อกฉุกเฉิน (ตั้งยอดใหม่ + เหตุผลบังคับ)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_emergency_adjust_stock(
    p_ingredient_id UUID,
    p_new_stock     NUMERIC,
    p_reason        TEXT
)
RETURNS VOID AS $$
DECLARE
    v_actor     UUID := auth.uid();
    v_reason    TEXT := NULLIF(btrim(p_reason), '');
    v_old_stock NUMERIC(12,3);
    v_name      TEXT;
BEGIN
    IF fn_my_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'เฉพาะแอดมินเท่านั้นที่ปรับยอดสต็อกฉุกเฉินได้';
    END IF;
    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'กรุณาระบุเหตุผลการปรับยอดฉุกเฉิน';
    END IF;
    IF p_new_stock IS NULL OR p_new_stock < 0 THEN
        RAISE EXCEPTION 'ยอดใหม่ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป';
    END IF;

    SELECT current_stock, name INTO v_old_stock, v_name
    FROM public.ingredients WHERE id = p_ingredient_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบวัตถุดิบนี้';
    END IF;
    IF v_old_stock = p_new_stock THEN
        RAISE EXCEPTION 'ยอดใหม่เท่ากับยอดเดิม ไม่ต้องปรับ';
    END IF;

    UPDATE public.ingredients SET current_stock = p_new_stock WHERE id = p_ingredient_id;

    INSERT INTO public.stock_movements (ingredient_id, movement_type, quantity, balance_after, reason, created_by)
    VALUES (p_ingredient_id, 'stock_count_adjustment', p_new_stock - v_old_stock, p_new_stock,
            'ปรับยอดฉุกเฉิน: ' || v_reason, v_actor);

    INSERT INTO public.audit_logs (actor_id, action, target_entity, target_id, reason, payload_before, payload_after)
    VALUES (v_actor, 'EMERGENCY_OVERRIDE', 'ingredients', p_ingredient_id::text, v_reason,
            jsonb_build_object('ingredient', v_name, 'current_stock', v_old_stock),
            jsonb_build_object('ingredient', v_name, 'current_stock', p_new_stock));
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION fn_emergency_adjust_stock(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_emergency_adjust_stock(UUID, NUMERIC, TEXT) TO authenticated;

-- ฟังก์ชันภายใน (เรียกจาก Trigger เท่านั้น) ไม่เปิดให้เรียกผ่าน API
REVOKE EXECUTE ON FUNCTION fn_refresh_menu_availability(UUID[]) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 4) Audit Log: Admin เห็นทั้งหมด / Manager เห็นทั้งหมดยกเว้นรายการของ Admin
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_is_admin_profile(p_profile_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id AND role = 'admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs
    FOR SELECT
    TO authenticated
    USING (
        fn_my_role() = 'admin'
        OR (fn_my_role() = 'manager' AND NOT fn_is_admin_profile(actor_id))
    );

COMMIT;
