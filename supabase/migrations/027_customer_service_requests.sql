-- ============================================================
-- KURO POS — Migration 027: หน้าเรียกพนักงานของลูกค้า (T-05 /order/[tableNumber]/call-staff)
-- ------------------------------------------------------------
-- ต้องรันหลัง 026_customer_order_status.sql
-- รันซ้ำได้ (DROP ... IF EXISTS / CREATE OR REPLACE) และอยู่ใน Transaction เดียว ไม่แก้/ลบข้อมูล
--
-- สิ่งที่แก้/เพิ่ม:
--   1) ปิดช่องโหว่ RLS (แบบเดียวกับ orders ใน migration 025):
--      เดิม service_requests ให้ใครก็ได้ INSERT (WITH CHECK true) และอ่านทุกแถว (USING true)
--      → ใครมี anon key แจ้งเรียกพนักงานให้โต๊ะไหนก็ได้ / อ่านคำขอทุกโต๊ะได้
--      ใหม่: อ่านได้เฉพาะพนักงานที่ล็อกอิน · ลูกค้าแจ้งผ่าน fn_customer_create_service_request เท่านั้น
--      (policy "service_requests_staff_manage" ของ staff/manager/admin ยังอยู่ ไม่แตะ)
--   2) ฟังก์ชันฝั่งลูกค้า (anon เรียกได้ ต้องส่ง hash ของ QR token):
--        fn_customer_get_service_requests     คำขอที่ยังไม่เสร็จของโต๊ะนี้ (pending / in_progress)
--        fn_customer_create_service_request   แจ้งเรียกพนักงาน 5 ประเภท (FR-069)
--
-- กันกดซ้ำ (FR-069): ประเภทเดียวกันที่ยังไม่เสร็จ (pending / in_progress) ของรอบนี้มีได้ 1 รายการ
--   กดซ้ำ → ไม่สร้างใหม่ คืนรายการเดิมพร้อม already_requested = true
--   ประเภทต่างกันแจ้งพร้อมกันได้ (เช่น ขอน้ำ + ขอเช็คบิล) · พนักงานกด "เสร็จ" แล้วแจ้งประเภทนั้นใหม่ได้
-- ใช้ได้ทุกสถานะรอบยกเว้น draft / closed (หมดเวลาแล้วยังขอเช็คบิล/ขอน้ำได้)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) RLS: service_requests — เลิกให้ anon เขียน/อ่านตรง
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "service_requests_insert_customer" ON service_requests;
DROP POLICY IF EXISTS "service_requests_select" ON service_requests;
DROP POLICY IF EXISTS "staff_read_service_requests" ON service_requests;
CREATE POLICY "staff_read_service_requests" ON service_requests
    FOR SELECT
    TO authenticated
    USING (fn_my_role() IS NOT NULL);

-- ------------------------------------------------------------
-- 2.1) คำขอที่ยังไม่เสร็จของโต๊ะนี้
--   คืน [{ id, request_type, status, created_at }] เรียงเก่า → ใหม่
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_customer_get_service_requests(p_token_hash TEXT, p_table_number TEXT)
RETURNS JSONB AS $$
DECLARE
    v_session_id UUID;
    v_requests   JSONB;
BEGIN
    v_session_id := (fn_customer_get_session(p_token_hash, p_table_number)->>'session_id')::uuid;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', request.id,
               'request_type', request.request_type,
               'status', request.status,
               'created_at', request.created_at
           ) ORDER BY request.created_at), '[]'::jsonb)
    INTO v_requests
    FROM service_requests AS request
    WHERE request.session_id = v_session_id
      AND request.status IN ('pending', 'in_progress');

    RETURN v_requests;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 2.2) แจ้งเรียกพนักงาน
--   p_request_type: call_staff / water / change_pot / check_bill / other
--   คืน { id, request_type, status, created_at, already_requested }
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_customer_create_service_request(p_token_hash TEXT, p_table_number TEXT, p_request_type TEXT)
RETURNS JSONB AS $$
DECLARE
    v_session_id   UUID;
    v_table_id     UUID;
    v_request_type service_request_type;
    v_request      service_requests%ROWTYPE;
BEGIN
    -- ตรวจ token + เลขโต๊ะ (เลขโต๊ะต้องผูกกับรอบนี้อยู่ — รวมโต๊ะแล้วใช้เลขไหนก็ได้)
    v_session_id := (fn_customer_get_session(p_token_hash, p_table_number)->>'session_id')::uuid;

    IF p_request_type IS NULL OR p_request_type NOT IN ('call_staff', 'water', 'change_pot', 'check_bill', 'other') THEN
        RAISE EXCEPTION 'ประเภทคำขอไม่ถูกต้อง';
    END IF;
    v_request_type := p_request_type::service_request_type;

    -- ล็อกรอบไว้ กันกด 2 ครั้งพร้อมกันแล้วได้ 2 รายการ
    PERFORM 1 FROM sessions WHERE id = v_session_id FOR UPDATE;

    -- กันกดซ้ำ: ประเภทเดิมยังไม่เสร็จ → คืนรายการเดิม
    SELECT * INTO v_request
    FROM service_requests
    WHERE session_id = v_session_id
      AND request_type = v_request_type
      AND status IN ('pending', 'in_progress')
    ORDER BY created_at
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'id', v_request.id,
            'request_type', v_request.request_type,
            'status', v_request.status,
            'created_at', v_request.created_at,
            'already_requested', true
        );
    END IF;

    SELECT dining.id INTO v_table_id
    FROM dining_tables AS dining
    WHERE dining.table_number = upper(p_table_number);

    INSERT INTO service_requests (table_id, session_id, request_type, status)
    VALUES (v_table_id, v_session_id, v_request_type, 'pending')
    RETURNING * INTO v_request;

    RETURN jsonb_build_object(
        'id', v_request.id,
        'request_type', v_request.request_type,
        'status', v_request.status,
        'created_at', v_request.created_at,
        'already_requested', false
    );
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 3) สิทธิ์เรียกฟังก์ชัน
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION fn_customer_get_service_requests(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_customer_create_service_request(TEXT, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION fn_customer_get_service_requests(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_customer_create_service_request(TEXT, TEXT, TEXT) TO anon, authenticated;

COMMIT;
