-- ============================================================
-- KURO POS — Migration 028: แก้สิทธิ์ที่พบจากการตรวจระบบ (26 พ.ย. 2026)
-- ------------------------------------------------------------
-- ต้องรันหลัง 027_staff_read_order_options.sql · รันซ้ำได้ · ไม่แก้ข้อมูล · อยู่ใน Transaction เดียว
--
-- 1) ครัวเปิด/ปิดเมนูไม่ได้จริง: menu_items ให้แก้เฉพาะ admin/manager → ครัวกดแล้วแก้ 0 แถวแต่ไม่ error
--    แก้: ฟังก์ชัน fn_set_menu_availability (SECURITY DEFINER) ให้ kitchen/manager/admin
--         แก้ได้แค่สถานะ + เหตุผล (ชื่อ/ราคาเมนูยังแก้ไม่ได้) และบันทึก Audit ในฟังก์ชันเดียวกัน
-- 2) คนไม่ล็อกอินเพิ่ม/อ่านออเดอร์ได้ทุกโต๊ะ (policy เดิมใน 001: WITH CHECK (true) / USING (true))
--    แก้: อ่านได้เฉพาะพนักงานที่ล็อกอิน · ลบสิทธิ์ INSERT ตรงของคนไม่ล็อกอิน
--    → ลูกค้ายังสแกน QR สั่งได้เหมือนเดิม แต่หน้าลูกค้า (T-05) ต้องตรวจ QR token ที่เซิร์ฟเวอร์ก่อนอ่าน/บันทึก
--      (SEED.md ข้อ 5) ด้วยฟังก์ชัน SECURITY DEFINER ที่รับ token หรือ Server Action + createAdminClient()
-- 3) ครัว/staff แก้ทุกช่องของ order_items ผ่าน API ได้ (เช่น จำนวน, ราคา)
--    แก้: ให้แก้ได้เฉพาะช่องสถานะและช่องการยกเลิก (column-level GRANT)
-- 4) พนักงานเห็นหมวดหมู่ที่ปิดอยู่ (เดิมเห็นเฉพาะหมวดที่เปิด → เมนูในหมวดที่ปิดขึ้นเป็น "อื่นๆ" บนจอครัว)
-- 5) fn_ingredients_for_count: เมนูที่ใช้วัตถุดิบเท่ากัน เรียงตาม id (ให้ตรงกับหน้า /inventory เสมอ)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) เปิด/ปิดเมนูด้วยมือ (ใช้จากหน้า /stock-override และ /menu)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_menu_availability(
    p_menu_item_id UUID,
    p_status       TEXT,
    p_reason       TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_role   user_role := fn_my_role();
    v_menu   menu_items%ROWTYPE;
    v_reason TEXT := NULLIF(btrim(p_reason), '');
BEGIN
    IF v_role IS NULL OR v_role NOT IN ('kitchen', 'manager', 'admin') THEN
        RAISE EXCEPTION 'ตำแหน่งของคุณไม่มีสิทธิ์เปิด/ปิดเมนู';
    END IF;
    IF p_status NOT IN ('available', 'manual_off') THEN
        RAISE EXCEPTION 'สถานะเมนูไม่ถูกต้อง';
    END IF;
    IF p_status = 'manual_off' AND v_reason IS NULL THEN
        RAISE EXCEPTION 'กรุณาระบุเหตุผลในการปิดเมนู';
    END IF;

    -- ล็อกแถว กันกดพร้อมกันหลายจอ
    SELECT * INTO v_menu FROM public.menu_items WHERE id = p_menu_item_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบเมนูนี้';
    END IF;
    IF v_menu.availability_status = 'out_of_stock' THEN
        RAISE EXCEPTION 'เมนูนี้วัตถุดิบไม่พอ ระบบปิดให้อัตโนมัติ — เติมสต็อกแล้วจะเปิดเอง';
    END IF;
    IF v_menu.availability_status::TEXT = p_status THEN
        RETURN; -- สถานะเดิมอยู่แล้ว ไม่ต้องทำอะไร
    END IF;

    UPDATE public.menu_items
    SET availability_status = p_status::menu_availability,
        disabled_reason     = CASE WHEN p_status = 'manual_off' THEN v_reason ELSE NULL END
    WHERE id = p_menu_item_id;

    -- Audit เฉพาะการปิด (audit_matrix: MANUAL_OFF_MENU) — ทำในฟังก์ชันเดียวกัน จึงไม่มีบันทึกปลอม
    IF p_status = 'manual_off' THEN
        INSERT INTO public.audit_logs (actor_id, action, target_entity, target_id, reason, payload_before, payload_after)
        VALUES (auth.uid(), 'MANUAL_OFF_MENU', 'menu_items', p_menu_item_id::TEXT, v_reason,
                jsonb_build_object('availability_status', v_menu.availability_status),
                jsonb_build_object('availability_status', 'manual_off', 'menu_item_name', v_menu.name));
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION fn_set_menu_availability(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_set_menu_availability(UUID, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 2) ออเดอร์: อ่านได้เฉพาะพนักงาน · คนไม่ล็อกอินเพิ่มตรงไม่ได้
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "kitchen_read_orders" ON orders;
DROP POLICY IF EXISTS "customer_insert_orders" ON orders;
DROP POLICY IF EXISTS "staff_read_orders" ON orders;
CREATE POLICY "staff_read_orders" ON orders
    FOR SELECT TO authenticated
    USING (fn_my_role() IS NOT NULL);

DROP POLICY IF EXISTS "kitchen_read_items" ON order_items;
DROP POLICY IF EXISTS "customer_insert_order_items" ON order_items;
DROP POLICY IF EXISTS "staff_read_order_items" ON order_items;
CREATE POLICY "staff_read_order_items" ON order_items
    FOR SELECT TO authenticated
    USING (fn_my_role() IS NOT NULL);

-- ------------------------------------------------------------
-- 3) order_items: พนักงานแก้ได้เฉพาะสถานะและข้อมูลการยกเลิก
--    (updated_at ตั้งโดย Trigger ไม่ต้องให้สิทธิ์ · ฟังก์ชันคิดเงิน/สั่งอาหารเป็น SECURITY DEFINER ไม่กระทบ)
-- ------------------------------------------------------------
REVOKE UPDATE ON order_items FROM anon, authenticated;
GRANT UPDATE (status, cancelled_by, cancelled_reason, cancelled_at) ON order_items TO authenticated;

-- ------------------------------------------------------------
-- 4) พนักงานเห็นทุกหมวดหมู่ (รวมที่ปิด) — ลูกค้ายังเห็นเฉพาะหมวดที่เปิด (policy เดิม)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "staff_read_categories" ON categories;
CREATE POLICY "staff_read_categories" ON categories
    FOR SELECT TO authenticated
    USING (fn_my_role() IS NOT NULL);

-- ------------------------------------------------------------
-- 5) รายการวัตถุดิบสำหรับนับ: เมนูที่ใช้วัตถุดิบเท่ากัน เรียงตาม id (ตรงกับ /inventory)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_ingredients_for_count()
RETURNS TABLE (id UUID, name VARCHAR, unit VARCHAR, image_url TEXT) AS $$
BEGIN
    IF fn_my_role() IS NULL OR fn_my_role() NOT IN ('staff', 'manager', 'admin') THEN
        RAISE EXCEPTION 'ไม่มีสิทธิ์ดูรายการวัตถุดิบสำหรับตรวจนับ';
    END IF;

    RETURN QUERY
    SELECT i.id, i.name, i.unit,
           COALESCE(
               i.image_url,
               (SELECT m.image_url
                FROM public.menu_ingredients link
                JOIN public.menu_items m ON m.id = link.menu_item_id
                WHERE link.ingredient_id = i.id AND m.image_url IS NOT NULL
                ORDER BY (SELECT count(*) FROM public.menu_ingredients other WHERE other.menu_item_id = m.id), m.id
                LIMIT 1)
           )
    FROM public.ingredients i
    ORDER BY i.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION fn_ingredients_for_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_ingredients_for_count() TO authenticated;

COMMIT;
