-- ============================================================
-- KURO POS — Migration 029: หน้าสั่งอาหารของลูกค้า (T-05 /order/[tableNumber])
-- ------------------------------------------------------------
-- ต้องรันหลัง 028_fix_permissions_review.sql (เดิมเลข 025 — เปลี่ยนเลขตอนรวมกับงานสต็อก/เมนู ที่ใช้ 025–028 ไปแล้ว)
-- รันซ้ำได้ (DROP ... IF EXISTS / CREATE OR REPLACE) และอยู่ใน Transaction เดียว ไม่แก้/ลบข้อมูล
--
-- ลูกค้าไม่ได้ล็อกอิน (บทบาท anon) จึงเข้าถึงข้อมูลผ่าน "ฟังก์ชันที่ต้องส่ง QR token มาด้วย" เท่านั้น
-- เซิร์ฟเวอร์ Next.js hash token (SHA-256 hex) ก่อนส่ง → ฐานข้อมูลไม่เคยเห็น token จริง
--
-- สิ่งที่แก้/เพิ่ม:
--   1) ปิดช่องโหว่ RLS: เดิม orders / order_items ให้ใครก็ได้ INSERT (WITH CHECK true)
--      และอ่านได้ทุกแถว (USING true) → ใครมี anon key ยิงออเดอร์เข้าโต๊ะไหนก็ได้ / อ่านออเดอร์ทุกโต๊ะได้
--      ใหม่: อ่านได้เฉพาะพนักงานที่ล็อกอิน · ลูกค้าสั่งผ่าน fn_customer_place_order เท่านั้น
--   2) พนักงานที่ล็อกอินอ่าน menu_item_options / order_item_options ได้ (จอครัวแสดงตัวเลือกที่ลูกค้าเลือก)
--   3) ฟังก์ชันฝั่งลูกค้า (anon เรียกได้):
--        fn_customer_get_session   ตรวจ token + เลขโต๊ะ → ข้อมูลรอบ (สถานะ, เวลาหมด, เลขโต๊ะ)
--        fn_customer_get_menu      หมวด + เมนู (ทุกสถานะ เพื่อแสดง "หมด") + ตัวเลือก
--        fn_customer_place_order   ส่งออเดอร์: ตรวจเวลา / เมนูพร้อมขาย / ตัวเลือก แล้วสร้าง orders + order_items
--
-- หมายเหตุ:
--   - "หมดเวลา" ใช้ expires_at ตรงๆ (ฐานข้อมูลไม่ได้เปลี่ยน status เป็น expired เอง — เหมือนหน้าผังโต๊ะ)
--   - unit_price_snapshot = extra_price ของเมนู + ราคาเพิ่มของตัวเลือก (เมนูในบุฟเฟต์ = 0)
--     ตรงกับที่ fn_create_bill (migration 007) ใช้คิดยอด "สั่งเพิ่ม"
--   - ลูกค้าเห็น Realtime ของ order_items ไม่ได้แล้ว (RLS) — หน้าติดตามสถานะต้องดึงผ่านฟังก์ชัน
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) RLS: orders / order_items — เลิกให้ anon เขียน/อ่านตรง
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "customer_insert_orders" ON orders;
DROP POLICY IF EXISTS "customer_insert_order_items" ON order_items;

DROP POLICY IF EXISTS "kitchen_read_orders" ON orders;
DROP POLICY IF EXISTS "staff_read_orders" ON orders;
CREATE POLICY "staff_read_orders" ON orders
    FOR SELECT
    TO authenticated
    USING (fn_my_role() IS NOT NULL);

DROP POLICY IF EXISTS "kitchen_read_items" ON order_items;
DROP POLICY IF EXISTS "staff_read_order_items" ON order_items;
CREATE POLICY "staff_read_order_items" ON order_items
    FOR SELECT
    TO authenticated
    USING (fn_my_role() IS NOT NULL);
-- policy "kitchen_update_items" (UPDATE) ของเดิมยังอยู่ ไม่แตะ

-- ------------------------------------------------------------
-- 2) ตัวเลือกเมนู: พนักงานที่ล็อกอินอ่านได้ (เดิม admin เท่านั้น / order_item_options ไม่มี policy เลย)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "staff_read_menu_options" ON menu_item_options;
CREATE POLICY "staff_read_menu_options" ON menu_item_options
    FOR SELECT
    TO authenticated
    USING (fn_my_role() IS NOT NULL);

DROP POLICY IF EXISTS "staff_read_order_item_options" ON order_item_options;
CREATE POLICY "staff_read_order_item_options" ON order_item_options
    FOR SELECT
    TO authenticated
    USING (fn_my_role() IS NOT NULL);

-- ------------------------------------------------------------
-- ตัวช่วยภายใน: หา session จาก token hash (ไม่ให้ anon เรียกตรง)
--   ผ่านเมื่อ: token มีอยู่, ยังไม่ถูกเพิกถอน, ยังไม่หมดอายุ (ถ้ามี expires_at), รอบยังไม่ closed
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_customer_session_id(p_token_hash TEXT)
RETURNS UUID AS $$
DECLARE
    v_session_id UUID;
    v_status     session_status;
BEGIN
    IF p_token_hash IS NULL OR length(p_token_hash) <> 64 THEN
        RAISE EXCEPTION 'QR ไม่ถูกต้อง กรุณาสแกน QR ที่โต๊ะอีกครั้ง';
    END IF;

    SELECT token.session_id, session.status
    INTO v_session_id, v_status
    FROM qr_access_tokens AS token
    JOIN sessions AS session ON session.id = token.session_id
    WHERE token.token_hash = p_token_hash
      AND token.is_revoked = false
      AND (token.expires_at IS NULL OR token.expires_at > now());

    IF v_session_id IS NULL OR v_status IN ('draft', 'closed') THEN
        RAISE EXCEPTION 'QR นี้ใช้งานไม่ได้แล้ว กรุณาติดต่อพนักงาน';
    END IF;

    RETURN v_session_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 3.1) ข้อมูลรอบของลูกค้า
--   p_table_number ต้องเป็นโต๊ะที่ผูกกับรอบนี้อยู่ (รองรับรวมโต๊ะ: เลขไหนในกลุ่มก็ได้)
--   คืน { session_id, status, started_at, expires_at, table_numbers[], adult_guest_count, child_guest_count }
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_customer_get_session(p_token_hash TEXT, p_table_number TEXT)
RETURNS JSONB AS $$
DECLARE
    v_session_id    UUID;
    v_session       sessions%ROWTYPE;
    v_table_numbers TEXT[];
BEGIN
    v_session_id := fn_customer_session_id(p_token_hash);
    SELECT * INTO v_session FROM sessions WHERE id = v_session_id;

    SELECT array_agg(dining.table_number ORDER BY dining.table_number)
    INTO v_table_numbers
    FROM session_tables AS link
    JOIN dining_tables AS dining ON dining.id = link.table_id
    WHERE link.session_id = v_session_id AND link.is_active = true;

    IF v_table_numbers IS NULL OR NOT (upper(p_table_number) = ANY (v_table_numbers)) THEN
        RAISE EXCEPTION 'QR นี้ไม่ใช่ของโต๊ะ % กรุณาสแกน QR ที่โต๊ะของคุณ', p_table_number;
    END IF;

    RETURN jsonb_build_object(
        'session_id', v_session.id,
        'status', v_session.status,
        'started_at', v_session.started_at,
        'expires_at', v_session.expires_at,
        'table_numbers', to_jsonb(v_table_numbers),
        'adult_guest_count', v_session.adult_guest_count,
        'child_guest_count', v_session.child_guest_count
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 3.2) เมนูสำหรับลูกค้า (ทุกสถานะ — หน้าลูกค้าแสดง "หมด" เอง, กฎข้อ 7)
--   คืน array หมวด: [{ id, name, items: [{ id, name, description, image_url, extra_price,
--                    availability_status, options: [{ id, group_name, name, additional_price }] }] }]
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_customer_get_menu(p_token_hash TEXT)
RETURNS JSONB AS $$
DECLARE
    v_menu JSONB;
BEGIN
    PERFORM fn_customer_session_id(p_token_hash);

    SELECT COALESCE(jsonb_agg(category_row ORDER BY category_order, category_name), '[]'::jsonb)
    INTO v_menu
    FROM (
        SELECT category.display_order AS category_order,
               category.name AS category_name,
               jsonb_build_object(
                   'id', category.id,
                   'name', category.name,
                   'items', (
                       SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                  'id', menu.id,
                                  'name', menu.name,
                                  'description', menu.description,
                                  'image_url', menu.image_url,
                                  'extra_price', menu.extra_price,
                                  'availability_status', menu.availability_status,
                                  'options', (
                                      SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                                 'id', opt.id,
                                                 'group_name', opt.option_group_name,
                                                 'name', opt.option_name,
                                                 'additional_price', opt.additional_price
                                             ) ORDER BY opt.option_group_name, opt.option_name), '[]'::jsonb)
                                      FROM menu_item_options AS opt
                                      WHERE opt.menu_item_id = menu.id AND opt.is_active = true
                                  )
                              ) ORDER BY menu.name), '[]'::jsonb)
                       FROM menu_items AS menu
                       WHERE menu.category_id = category.id
                   )
               ) AS category_row
        FROM categories AS category
        WHERE category.is_active = true
          AND EXISTS (SELECT 1 FROM menu_items AS menu WHERE menu.category_id = category.id)
    ) AS grouped;

    RETURN v_menu;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 3.3) ส่งออเดอร์ของลูกค้า (ลูกค้าสั่งเอง 100%, order_source = 'customer_qr')
--   p_items: [{ "menu_item_id": uuid, "quantity": int > 0, "option_ids": [uuid, ...] }]
--   ตรวจ: รอบ active และยังไม่เลย expires_at (FR-015, FR-062) / เมนู available (กฎข้อ 7)
--         ตัวเลือกต้องเป็นของเมนูนั้น เลือกกลุ่มละ 1 ตัว และครบทุกกลุ่ม
--   คืน { order_id, order_number, item_count }
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_customer_place_order(p_token_hash TEXT, p_table_number TEXT, p_items JSONB)
RETURNS JSONB AS $$
DECLARE
    v_session_info  JSONB;
    v_session       sessions%ROWTYPE;
    v_line          JSONB;
    v_menu          menu_items%ROWTYPE;
    v_quantity      INT;
    v_option_ids    UUID[];
    v_valid_options INT;
    v_group_count   INT;
    v_chosen_groups INT;
    v_option_price  NUMERIC(10,2);
    v_order_id      UUID;
    v_order_item_id UUID;
    v_prefix        TEXT;
    v_next_number   INT;
    v_order_number  TEXT;
    v_item_count    INT := 0;
BEGIN
    -- ตรวจ token + เลขโต๊ะ (error ภาษาไทยจากฟังก์ชันนี้แสดงบนหน้าจอได้เลย)
    v_session_info := fn_customer_get_session(p_token_hash, p_table_number);

    -- ล็อกรอบไว้ระหว่างสร้างออเดอร์ (กันพนักงานเชิญออก/ปิดรอบพร้อมกัน)
    SELECT * INTO v_session FROM sessions
    WHERE id = (v_session_info->>'session_id')::uuid
    FOR UPDATE;

    IF v_session.status <> 'active' OR v_session.expires_at IS NULL OR now() >= v_session.expires_at THEN
        RAISE EXCEPTION 'หมดเวลาสั่งอาหารแล้ว';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'ยังไม่มีรายการในตะกร้า';
    END IF;

    -- เลขออเดอร์ ORD-YYYYMMDD-NNN (เริ่ม 001 ใหม่ทุกวันตามเวลาไทย · ล็อกกันเลขซ้ำเมื่อหลายโต๊ะสั่งพร้อมกัน)
    PERFORM pg_advisory_xact_lock(hashtext('kuro_order_number'));
    v_prefix := 'ORD-' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYYYMMDD') || '-';
    SELECT COALESCE(MAX(NULLIF(regexp_replace(substring(order_number FROM length(v_prefix) + 1), '\D', '', 'g'), '')::int), 0) + 1
    INTO v_next_number
    FROM orders
    WHERE order_number LIKE v_prefix || '%';
    v_order_number := v_prefix || CASE WHEN v_next_number > 999 THEN v_next_number::text
                                       ELSE lpad(v_next_number::text, 3, '0') END;

    INSERT INTO orders (session_id, order_number, order_source)
    VALUES (v_session.id, v_order_number, 'customer_qr')
    RETURNING id INTO v_order_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- จำนวนต้องเป็นจำนวนเต็มบวก
        IF COALESCE(jsonb_typeof(v_line->'quantity'), '') <> 'number'
           OR (v_line->>'quantity')::numeric <> floor((v_line->>'quantity')::numeric)
           OR (v_line->>'quantity')::numeric <= 0 THEN
            RAISE EXCEPTION 'จำนวนที่สั่งไม่ถูกต้อง';
        END IF;
        v_quantity := (v_line->>'quantity')::int;

        SELECT menu.* INTO v_menu
        FROM menu_items AS menu
        JOIN categories AS category ON category.id = menu.category_id AND category.is_active = true
        WHERE menu.id = NULLIF(v_line->>'menu_item_id', '')::uuid;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ไม่พบเมนูที่สั่ง กรุณารีเฟรชหน้า';
        END IF;
        IF v_menu.availability_status <> 'available' THEN
            RAISE EXCEPTION 'เมนู "%" หมดแล้ว กรุณานำออกจากตะกร้า', v_menu.name;
        END IF;

        -- ตัวเลือก: ต้องเป็นของเมนูนี้ เปิดใช้งาน กลุ่มละ 1 ตัว และครบทุกกลุ่ม
        SELECT COALESCE(array_agg(DISTINCT value::uuid), ARRAY[]::uuid[])
        INTO v_option_ids
        FROM jsonb_array_elements_text(COALESCE(v_line->'option_ids', '[]'::jsonb));

        SELECT count(*), count(DISTINCT opt.option_group_name), COALESCE(SUM(opt.additional_price), 0)
        INTO v_valid_options, v_chosen_groups, v_option_price
        FROM menu_item_options AS opt
        WHERE opt.id = ANY (v_option_ids) AND opt.menu_item_id = v_menu.id AND opt.is_active = true;

        SELECT count(DISTINCT opt.option_group_name) INTO v_group_count
        FROM menu_item_options AS opt
        WHERE opt.menu_item_id = v_menu.id AND opt.is_active = true;

        IF v_valid_options <> cardinality(v_option_ids)
           OR v_valid_options <> v_chosen_groups
           OR v_chosen_groups <> v_group_count THEN
            RAISE EXCEPTION 'กรุณาเลือกตัวเลือกของ "%" ให้ครบ (กลุ่มละ 1 อย่าง)', v_menu.name;
        END IF;

        INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_snapshot, status)
        VALUES (v_order_id, v_menu.id, v_quantity, v_menu.extra_price + v_option_price, 'pending')
        RETURNING id INTO v_order_item_id;

        INSERT INTO order_item_options (order_item_id, menu_item_option_id, option_price_snapshot)
        SELECT v_order_item_id, opt.id, opt.additional_price
        FROM menu_item_options AS opt
        WHERE opt.id = ANY (v_option_ids);

        v_item_count := v_item_count + v_quantity;
    END LOOP;

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'item_count', v_item_count
    );
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 4) สิทธิ์เรียกฟังก์ชัน
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION fn_customer_session_id(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_customer_get_session(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_customer_get_menu(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_customer_place_order(TEXT, TEXT, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION fn_customer_get_session(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_customer_get_menu(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_customer_place_order(TEXT, TEXT, JSONB) TO anon, authenticated;

COMMIT;
