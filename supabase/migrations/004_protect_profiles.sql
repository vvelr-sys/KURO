-- ============================================================
-- KURO POS — Migration 004: ปิดช่องโหว่ตาราง profiles
-- ------------------------------------------------------------
-- ต้องรันหลัง 003_queue_guests_tax_invoice.sql
-- รันซ้ำได้ และอยู่ใน Transaction เดียว ไม่แก้/ลบข้อมูล
--
-- ปัญหาเดิม:
--   Policy "profiles_select_all_staff" ใช้ USING (true) → ใครก็ได้ที่มี publishable key
--   (ซึ่งอยู่ในหน้าเว็บอยู่แล้ว) อ่าน profiles ได้ทั้งตาราง รวมถึง pin_hash
--   PIN มีแค่ 4-6 หลัก ถ้าได้ hash ไปจะเดาย้อนกลับได้ในเวลาไม่นาน
--
-- สิ่งที่แก้:
--   1) อ่าน profiles ได้เฉพาะพนักงานที่ล็อกอินและบัญชียังเปิดใช้งาน (ลูกค้า/คนนอกอ่านไม่ได้)
--   2) ไม่มีใครอ่านคอลัมน์ pin_hash ผ่าน API ได้ (anon / authenticated)
--      การตรวจ PIN ต้องทำฝั่งเซิร์ฟเวอร์ด้วย service role เท่านั้น
--
-- ⚠️ ผลต่อโค้ด: ห้ามใช้ .select('*') กับ profiles — ต้องระบุคอลัมน์เสมอ
--    เช่น .select('id, full_name, role, is_active')
--    (ถ้าใช้ * จะได้ error "permission denied for table profiles")
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) RLS: อ่านได้เฉพาะพนักงานที่ล็อกอินและยังเปิดใช้งาน
--    fn_my_role() คืน NULL ถ้าไม่ได้ล็อกอิน / ไม่มี profile / is_active = false
--    (fn_my_role เป็น SECURITY DEFINER จึงไม่วนเรียก policy ตัวเอง)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_all_staff" ON profiles;
DROP POLICY IF EXISTS "profiles_select_active_staff" ON profiles;
CREATE POLICY "profiles_select_active_staff" ON profiles
    FOR SELECT
    TO authenticated
    USING (fn_my_role() IS NOT NULL);
-- policy "profiles_admin_all" (admin จัดการได้ทั้งหมด) คงไว้เหมือนเดิม

-- ------------------------------------------------------------
-- 2) สิทธิ์ระดับคอลัมน์: ซ่อน pin_hash
--    ต้องถอนสิทธิ์ SELECT ทั้งตารางก่อน แล้วให้คืนเฉพาะคอลัมน์ที่อ่านได้
--    (ถอนแค่คอลัมน์เดียวไม่ได้ผล ถ้ายังมีสิทธิ์ SELECT ทั้งตาราง)
--    INSERT / UPDATE / DELETE ไม่แตะ — ยังถูกคุมด้วย RLS เหมือนเดิม
-- ------------------------------------------------------------
REVOKE SELECT ON profiles FROM anon, authenticated;
GRANT SELECT (id, full_name, role, is_active, created_at, updated_at) ON profiles TO authenticated;

COMMIT;
