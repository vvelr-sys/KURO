-- ============================================================
-- KURO POS — Migration 008: หน้าตั้งค่าร้าน (/settings)
-- ------------------------------------------------------------
-- ต้องรันหลัง 007_billing_functions.sql
-- รันซ้ำได้ และอยู่ใน Transaction เดียว ไม่แก้/ลบข้อมูล
--
-- สิ่งที่แก้:
--   ให้พนักงานที่ล็อกอินอ่านคีย์ข้อความหัว/ท้ายใบเสร็จได้ด้วย (ใช้ตอนพิมพ์ใบเสร็จ)
--     receipt_header_message  ข้อความต้อนรับบนหัวใบเสร็จ
--     receipt_footer_message  ข้อความขอบคุณท้ายใบเสร็จ
--   (การแก้ไข app_settings ยังทำได้เฉพาะ admin ตาม policy เดิม admin_full_app_settings)
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS "staff_read_receipt_settings" ON app_settings;
CREATE POLICY "staff_read_receipt_settings" ON app_settings
    FOR SELECT
    TO authenticated
    USING (
        fn_my_role() IS NOT NULL
        AND key IN ('store_name', 'store_branch', 'store_address', 'store_tax_id', 'store_phone',
                    'receipt_header_message', 'receipt_footer_message',
                    'vat_rate_percent', 'penalty_rate_per_100g')
    );

COMMIT;
