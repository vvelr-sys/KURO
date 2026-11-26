-- ============================================================
-- KURO POS — Migration 032: หน้าดูคิวของลูกค้า (T-03 ฝั่งลูกค้า /queue/[queueId])
-- ------------------------------------------------------------
-- ต้องรันหลัง 031_customer_service_requests.sql
-- รันซ้ำได้ (DROP ... IF EXISTS / CREATE OR REPLACE) และอยู่ใน Transaction เดียว ไม่แก้/ลบข้อมูล
--
-- ลูกค้าสแกน QR บนบัตรคิว → /queue/<queue id> (UUID สุ่ม เดาไม่ได้ ใช้แทนรหัสผ่าน)
--
-- สิ่งที่แก้/เพิ่ม:
--   1) ปิดช่องโหว่ RLS: เดิม queues อ่านได้ทุกแถวโดยไม่ต้องล็อกอิน (policy "queues_select_all" USING true)
--      → ใครมี anon key อ่านคิวทั้งหมดได้ รวม "เบอร์โทรลูกค้า" (phone_number)
--      ใหม่: อ่านตรงได้เฉพาะพนักงานที่ล็อกอิน (staff ต้องอ่านคิวที่เรียกแล้วในหน้าผังโต๊ะ /tables)
--      policy "queues_manage" ของ cashier / manager / admin ยังอยู่ ไม่แตะ
--   2) fn_customer_get_queue(queue_id)  (anon เรียกได้)
--      คืนข้อมูลบัตรคิวใบนั้น + จำนวนคิวก่อนหน้า + คิวที่กำลังเรียก (ขนาดโต๊ะเดียวกัน) — ไม่คืนเบอร์โทร
--
-- นิยาม (ตรงกับบัตรคิวที่หน้า /queues พิมพ์ — src/app/(pos)/queues/actions.js buildQueueTicket):
--   คิวก่อนหน้า   = คิวขนาดโต๊ะเดียวกัน ของวันนี้ (เวลาไทย) ที่ยังรอเรียก (waiting) และรับคิวก่อนใบนี้
--   คิวที่กำลังเรียก = คิวขนาดเดียวกันของวันนี้ที่สถานะ called และเรียกล่าสุด
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) RLS: queues — เลิกให้ anon อ่านตรง
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "queues_select_all" ON queues;
DROP POLICY IF EXISTS "staff_read_queues" ON queues;
CREATE POLICY "staff_read_queues" ON queues
    FOR SELECT
    TO authenticated
    USING (fn_my_role() IS NOT NULL);

-- ------------------------------------------------------------
-- 2) ข้อมูลบัตรคิวสำหรับลูกค้า
--   คืน { queue_number, table_size, status, adult_count, child_count, created_at, called_at,
--         queues_ahead, now_calling }
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_customer_get_queue(p_queue_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_queue       queues%ROWTYPE;
    v_today_start TIMESTAMPTZ;
    v_ahead       INT := 0;
    v_now_calling TEXT;
BEGIN
    SELECT * INTO v_queue FROM queues WHERE id = p_queue_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบบัตรคิวนี้ กรุณาติดต่อเคาน์เตอร์';
    END IF;

    -- เริ่มต้นวันตามเวลาไทย (เหมือน fn_issue_queue ใน migration 006)
    v_today_start := date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok';

    IF v_queue.status = 'waiting' THEN
        SELECT count(*) INTO v_ahead
        FROM queues AS other
        WHERE other.table_size = v_queue.table_size
          AND other.status = 'waiting'
          AND other.created_at >= v_today_start
          AND other.created_at < v_queue.created_at;
    END IF;

    SELECT other.queue_number INTO v_now_calling
    FROM queues AS other
    WHERE other.table_size = v_queue.table_size
      AND other.status = 'called'
      AND other.created_at >= v_today_start
    ORDER BY other.called_at DESC NULLS LAST
    LIMIT 1;

    RETURN jsonb_build_object(
        'queue_number', v_queue.queue_number,
        'table_size', v_queue.table_size,
        'status', v_queue.status,
        'adult_count', v_queue.adult_count,
        'child_count', v_queue.child_count,
        'created_at', v_queue.created_at,
        'called_at', v_queue.called_at,
        'queues_ahead', v_ahead,
        'now_calling', v_now_calling
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION fn_customer_get_queue(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_customer_get_queue(UUID) TO anon, authenticated;

COMMIT;
