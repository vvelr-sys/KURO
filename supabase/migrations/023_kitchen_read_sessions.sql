-- ============================================================
-- KURO POS — Migration 023: ให้ครัว (kitchen) อ่านรอบบริการและการผูกโต๊ะได้
-- ------------------------------------------------------------
-- ต้องรันหลัง 001 (รันก่อนหรือหลัง 020–022 ก็ได้)
-- รันซ้ำได้ (DROP ... IF EXISTS) ไม่แก้ข้อมูลในตาราง
--
-- ปัญหาเดิม:
--   RLS ของ sessions / session_tables ใน 001 ให้เฉพาะ admin, manager, cashier, staff
--   จอครัว /kds ดึงออเดอร์แบบ orders!inner → sessions!inner (เพื่อหาเลขโต๊ะ)
--   ถ้าล็อกอินเป็น kitchen จะอ่าน sessions ไม่ได้ → ออเดอร์ถูกกรองทิ้งหมด → จอครัวว่างเปล่า
--
-- สิ่งที่แก้:
--   เพิ่มสิทธิ์ "อ่านอย่างเดียว" ให้ kitchen — แก้ไข/เปิด/ปิดโต๊ะยังทำไม่ได้เหมือนเดิม
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS "kitchen_read_sessions" ON sessions;
CREATE POLICY "kitchen_read_sessions" ON sessions
    FOR SELECT
    TO authenticated
    USING (fn_my_role() = 'kitchen');

DROP POLICY IF EXISTS "kitchen_read_session_tables" ON session_tables;
CREATE POLICY "kitchen_read_session_tables" ON session_tables
    FOR SELECT
    TO authenticated
    USING (fn_my_role() = 'kitchen');

COMMIT;
