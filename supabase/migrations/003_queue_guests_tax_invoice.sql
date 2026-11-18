-- ============================================================
-- KURO POS — Migration 003: แยกผู้ใหญ่/เด็กในคิว + เลขที่ใบกำกับภาษี + อีเมลผู้รับ
-- ------------------------------------------------------------
-- ต้องรันหลัง 002_v18_fixes.sql
-- รันซ้ำได้ (IF NOT EXISTS / DROP ... IF EXISTS / CREATE OR REPLACE) และอยู่ใน Transaction เดียว
--
-- สิ่งที่เพิ่ม:
--   1) queues: adult_count, child_count (บัตรคิวแสดงผู้ใหญ่/เด็กแยกกัน และส่งต่อไปตอนเปิดโต๊ะ)
--      บังคับ guest_count = adult_count + child_count เสมอ
--   2) tax_invoices: invoice_number (เลขที่ใบกำกับภาษีเรียงต่อกัน สร้างอัตโนมัติ)
--   3) tax_invoices: email (อีเมลผู้รับเอกสาร ไม่บังคับ)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) queues: จำนวนผู้ใหญ่และเด็ก
--    แถวเดิม (ถ้ามี) ถือว่าเป็นผู้ใหญ่ทั้งหมด เพราะไม่เคยเก็บแยกไว้
-- ------------------------------------------------------------
ALTER TABLE queues ADD COLUMN IF NOT EXISTS adult_count INT;
ALTER TABLE queues ADD COLUMN IF NOT EXISTS child_count INT;

UPDATE queues
SET adult_count = COALESCE(adult_count, guest_count - COALESCE(child_count, 0)),
    child_count = COALESCE(child_count, 0)
WHERE adult_count IS NULL OR child_count IS NULL;

-- ค่าเริ่มต้นตรงกับ guest_count DEFAULT 1 เดิม (ผู้ใหญ่ 1 เด็ก 0)
ALTER TABLE queues ALTER COLUMN adult_count SET DEFAULT 1;
ALTER TABLE queues ALTER COLUMN adult_count SET NOT NULL;
ALTER TABLE queues ALTER COLUMN child_count SET DEFAULT 0;
ALTER TABLE queues ALTER COLUMN child_count SET NOT NULL;

ALTER TABLE queues DROP CONSTRAINT IF EXISTS chk_queues_adult_count;
ALTER TABLE queues ADD  CONSTRAINT chk_queues_adult_count CHECK (adult_count >= 0);
ALTER TABLE queues DROP CONSTRAINT IF EXISTS chk_queues_child_count;
ALTER TABLE queues ADD  CONSTRAINT chk_queues_child_count CHECK (child_count >= 0);
-- ยอดรวมต้องตรงกันเสมอ: แอปต้องส่งทั้ง 3 ค่า (guest_count ยังใช้เลือกขนาดโต๊ะเหมือนเดิม)
ALTER TABLE queues DROP CONSTRAINT IF EXISTS chk_queues_guest_count_sum;
ALTER TABLE queues ADD  CONSTRAINT chk_queues_guest_count_sum CHECK (guest_count = adult_count + child_count);

COMMENT ON COLUMN queues.adult_count IS 'จำนวนผู้ใหญ่ (guest_count = adult_count + child_count)';
COMMENT ON COLUMN queues.child_count IS 'จำนวนเด็ก ส่วนสูงต่ำกว่า 120 ซม.';

-- ------------------------------------------------------------
-- 2) tax_invoices.invoice_number: เลขที่ใบกำกับภาษีเต็มรูป
--    รูปแบบ TAX-YYYYMMDD-NNNN (เริ่ม 0001 ใหม่ทุกวัน ตามเวลาไทย)
--    สร้างโดย Trigger ตอน INSERT ถ้าแอปไม่ได้ส่งมา → แอปไม่ต้องคำนวณเลขเอง
--    ใช้ advisory lock กันแคชเชียร์ 2 เครื่องออกพร้อมกันแล้วได้เลขซ้ำ
-- ------------------------------------------------------------
ALTER TABLE tax_invoices ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(30);

-- เติมเลขให้แถวเดิม (ถ้ามี) เรียงตามเวลาที่ออกในแต่ละวัน
UPDATE tax_invoices AS invoice
SET invoice_number = numbered.new_number
FROM (
    SELECT id,
           'TAX-' || to_char(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYYMMDD') || '-' ||
           lpad(row_number() OVER (
                    PARTITION BY (created_at AT TIME ZONE 'Asia/Bangkok')::date
                    ORDER BY created_at, id
                )::text, 4, '0') AS new_number
    FROM tax_invoices
) AS numbered
WHERE invoice.id = numbered.id
  AND invoice.invoice_number IS NULL;

ALTER TABLE tax_invoices ALTER COLUMN invoice_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_tax_invoice_number ON tax_invoices(invoice_number);

CREATE OR REPLACE FUNCTION fn_set_tax_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
    v_prefix      TEXT;
    v_next_number INT;
BEGIN
    IF NEW.invoice_number IS NULL THEN
        -- ล็อกเฉพาะการออกเลขใบกำกับภาษี จนจบ Transaction
        PERFORM pg_advisory_xact_lock(hashtext('kuro_tax_invoice_number'));

        v_prefix := 'TAX-' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYYYMMDD') || '-';

        SELECT COALESCE(MAX(substring(invoice_number FROM length(v_prefix) + 1)::int), 0) + 1
        INTO v_next_number
        FROM public.tax_invoices
        WHERE invoice_number LIKE v_prefix || '%';

        NEW.invoice_number := v_prefix || lpad(v_next_number::text, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_set_tax_invoice_number ON tax_invoices;
CREATE TRIGGER trg_set_tax_invoice_number
BEFORE INSERT ON tax_invoices
FOR EACH ROW EXECUTE FUNCTION fn_set_tax_invoice_number();

COMMENT ON COLUMN tax_invoices.invoice_number IS 'เลขที่ใบกำกับภาษี TAX-YYYYMMDD-NNNN (Trigger สร้างให้อัตโนมัติ)';

-- ------------------------------------------------------------
-- 3) tax_invoices.email: อีเมลผู้รับเอกสาร (ไม่บังคับ)
--    ตรวจรูปแบบอย่างง่ายเท่านั้น
-- ------------------------------------------------------------
ALTER TABLE tax_invoices ADD COLUMN IF NOT EXISTS email VARCHAR(255);

ALTER TABLE tax_invoices DROP CONSTRAINT IF EXISTS chk_tax_invoices_email;
ALTER TABLE tax_invoices ADD  CONSTRAINT chk_tax_invoices_email
    CHECK (email IS NULL OR email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

COMMENT ON COLUMN tax_invoices.email IS 'อีเมลผู้รับใบกำกับภาษี (ไม่บังคับ)';

COMMIT;
