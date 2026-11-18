-- ============================================================
-- KURO POS — Migration 006: ฟังก์ชันคิวหน้าร้าน (หน้า /queues, T-03)
-- ------------------------------------------------------------
-- ต้องรันหลัง 005_table_session_functions.sql
-- รันซ้ำได้ (CREATE OR REPLACE) และอยู่ใน Transaction เดียว ไม่แก้/ลบข้อมูล
--
--   fn_issue_queue          ออกบัตรคิว: สร้างเลขคิวอัตโนมัติ (กันเลขซ้ำเมื่อ 2 เครื่องกดพร้อมกัน)
--   fn_update_queue_status  เรียก / เรียกซ้ำ / ข้าม / ยกเลิก (ตรวจว่าเปลี่ยนสถานะได้จริง)
--
-- เลขคิว: ตัวอักษรขนาดโต๊ะ + เลข 3 หลัก เริ่ม 001 ใหม่ทุกวัน (เวลาไทย) แต่ละขนาดนับแยกกัน
--   small = A (1-2 คน) / medium = B (3-4 คน) / large = C (5 คนขึ้นไป)   เช่น A001, B025
--   (เข้าคิว "เข้าโต๊ะ" ทำผ่าน fn_open_table ของ migration 005)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) ออกบัตรคิว (cashier / manager / admin — staff ออกบัตรคิวไม่ได้ ตาม FR-066)
--    คืนค่า: id และเลขคิวที่สร้าง
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_issue_queue(p_adult_count INT, p_child_count INT, p_table_size TEXT)
RETURNS TABLE (queue_id UUID, queue_number VARCHAR) AS $$
DECLARE
    v_prefix      TEXT;
    v_today_start TIMESTAMPTZ;
    v_next_number INT;
    v_number      TEXT;
    v_id          UUID;
BEGIN
    PERFORM fn_require_role(ARRAY['admin', 'manager', 'cashier']::user_role[], 'ออกบัตรคิว');

    IF p_adult_count IS NULL OR p_child_count IS NULL OR p_adult_count < 0 OR p_child_count < 0
       OR p_adult_count + p_child_count < 1 THEN
        RAISE EXCEPTION 'จำนวนลูกค้าไม่ถูกต้อง (ต้องมีอย่างน้อย 1 คน)';
    END IF;
    IF p_adult_count + p_child_count > 50 THEN
        RAISE EXCEPTION 'จำนวนลูกค้าเกิน 50 คน กรุณาตรวจสอบอีกครั้ง';
    END IF;

    v_prefix := CASE p_table_size
        WHEN 'small'  THEN 'A'
        WHEN 'medium' THEN 'B'
        WHEN 'large'  THEN 'C'
    END;
    IF v_prefix IS NULL THEN
        RAISE EXCEPTION 'ขนาดโต๊ะไม่ถูกต้อง';
    END IF;

    -- ล็อกการออกเลขของขนาดนี้จนจบ Transaction (กันเลขซ้ำ)
    PERFORM pg_advisory_xact_lock(hashtext('kuro_queue_number_' || v_prefix));

    -- เริ่มต้นวันตามเวลาไทย
    v_today_start := date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok';

    SELECT COALESCE(MAX(NULLIF(regexp_replace(substring(q.queue_number FROM 2), '\D', '', 'g'), '')::int), 0) + 1
    INTO v_next_number
    FROM queues AS q
    WHERE q.created_at >= v_today_start
      AND q.queue_number LIKE v_prefix || '%';

    -- 3 หลัก (001-999) ถ้าเกินวันละ 999 คิวก็ใช้เลขเต็มต่อไป (lpad จะตัดเลขถ้าไม่เช็ค)
    v_number := v_prefix || CASE WHEN v_next_number > 999 THEN v_next_number::text
                                 ELSE lpad(v_next_number::text, 3, '0') END;

    INSERT INTO queues (queue_number, guest_count, adult_count, child_count, table_size, status)
    VALUES (v_number, p_adult_count + p_child_count, p_adult_count, p_child_count, p_table_size, 'waiting')
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, v_number::VARCHAR;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

-- ------------------------------------------------------------
-- 2) เปลี่ยนสถานะคิว (cashier / manager / admin)
--    p_action:
--      'call'   รอเรียก / ข้ามแล้ว → เรียกแล้ว (เรียกอีกครั้งได้ เพราะลูกค้ามักกลับมาทีหลัง)
--      'recall' เรียกแล้ว → เรียกแล้ว (เรียกซ้ำ อัปเดตเวลาเรียก)
--      'skip'   รอเรียก / เรียกแล้ว → ข้ามแล้ว
--      'cancel' รอเรียก / เรียกแล้ว / ข้ามแล้ว → ยกเลิก
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_update_queue_status(p_queue_id UUID, p_action TEXT)
RETURNS VOID AS $$
DECLARE
    v_queue queues%ROWTYPE;
BEGIN
    PERFORM fn_require_role(ARRAY['admin', 'manager', 'cashier']::user_role[], 'จัดการคิว');

    SELECT * INTO v_queue FROM queues WHERE id = p_queue_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบคิวนี้';
    END IF;

    IF p_action = 'call' THEN
        IF v_queue.status NOT IN ('waiting', 'skipped') THEN
            RAISE EXCEPTION 'เรียกคิว % ไม่ได้ (สถานะ: %)', v_queue.queue_number, v_queue.status;
        END IF;
        UPDATE queues SET status = 'called', called_at = now() WHERE id = p_queue_id;

    ELSIF p_action = 'recall' THEN
        IF v_queue.status <> 'called' THEN
            RAISE EXCEPTION 'เรียกซ้ำได้เฉพาะคิวที่เรียกแล้ว (คิว %: %)', v_queue.queue_number, v_queue.status;
        END IF;
        UPDATE queues SET called_at = now() WHERE id = p_queue_id;

    ELSIF p_action = 'skip' THEN
        IF v_queue.status NOT IN ('waiting', 'called') THEN
            RAISE EXCEPTION 'ข้ามคิว % ไม่ได้ (สถานะ: %)', v_queue.queue_number, v_queue.status;
        END IF;
        UPDATE queues SET status = 'skipped' WHERE id = p_queue_id;

    ELSIF p_action = 'cancel' THEN
        IF v_queue.status NOT IN ('waiting', 'called', 'skipped') THEN
            RAISE EXCEPTION 'ยกเลิกคิว % ไม่ได้ (สถานะ: %)', v_queue.queue_number, v_queue.status;
        END IF;
        UPDATE queues SET status = 'cancelled' WHERE id = p_queue_id;

    ELSE
        RAISE EXCEPTION 'คำสั่งไม่ถูกต้อง';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

REVOKE ALL ON FUNCTION fn_issue_queue(INT, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_update_queue_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_issue_queue(INT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_update_queue_status(UUID, TEXT) TO authenticated;

COMMIT;
