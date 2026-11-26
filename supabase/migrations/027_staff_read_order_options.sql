-- ============================================================
-- KURO POS — Migration 027: พนักงานอ่านตัวเลือกเมนูที่ลูกค้าเลือกได้ (จอครัวแสดง "เผ็ดน้อย", "น้ำจิ้มงา")
-- ------------------------------------------------------------
-- ต้องรันหลัง 026_ingredient_images.sql · รันซ้ำได้ · ไม่แก้ข้อมูล
--
-- ปัญหาเดิม (migration 001):
--   order_item_options เปิด RLS แต่ไม่มี policy เลย → ไม่มีพนักงานคนไหนอ่านได้
--   menu_item_options อ่านได้เฉพาะ admin → ครัวไม่รู้ชื่อตัวเลือก
-- แก้: พนักงานที่ล็อกอินและเปิดใช้งาน (fn_my_role() ไม่เป็น NULL) อ่านได้อย่างเดียว
--   การเพิ่ม/แก้ยังเป็นสิทธิ์เดิม (admin) — ลูกค้าบันทึกตัวเลือกผ่านฟังก์ชันสั่งอาหารของหน้าลูกค้า (T-05)
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS "staff_read_order_item_options" ON order_item_options;
CREATE POLICY "staff_read_order_item_options" ON order_item_options
    FOR SELECT TO authenticated
    USING (fn_my_role() IS NOT NULL);

DROP POLICY IF EXISTS "staff_read_menu_item_options" ON menu_item_options;
CREATE POLICY "staff_read_menu_item_options" ON menu_item_options
    FOR SELECT TO authenticated
    USING (fn_my_role() IS NOT NULL);

COMMIT;
