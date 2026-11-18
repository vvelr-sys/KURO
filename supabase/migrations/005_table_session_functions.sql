-- ============================================================
-- KURO POS — Migration 005: ฟังก์ชันจัดการโต๊ะ/รอบบริการ (หน้า /tables, T-04)
-- ------------------------------------------------------------
-- ต้องรันหลัง 004_protect_profiles.sql
-- รันซ้ำได้ (DROP ... IF EXISTS / CREATE OR REPLACE) และอยู่ใน Transaction เดียว ไม่แก้/ลบข้อมูล
--
-- สิ่งที่เพิ่ม:
--   1) Policy qr_access_tokens: พนักงานหน้าร้านสร้าง/อ่าน token ได้ (เดิมไม่มี policy เลย → สร้าง QR ไม่ได้)
--   2) Policy audit_logs: พนักงานที่ล็อกอินบันทึก log ในนามตัวเองได้ (เดิมบันทึกไม่ได้เลย)
--   3) ฟังก์ชันงานหลายขั้นตอน — สำเร็จทั้งหมดหรือไม่เกิดอะไรเลย (อยู่ใน Transaction เดียวของฟังก์ชัน)
--        fn_open_table          เปิดโต๊ะ: สร้างรอบ + ล็อกราคา/เวลา + ผูกโต๊ะ + QR + คิว seated + log
--        fn_issue_qr_token      พิมพ์ QR ซ้ำ: สร้าง token ใหม่ (token เดิมยังใช้ได้จนปิดรอบ)
--        fn_move_table          ย้ายโต๊ะ: โต๊ะเดิม → cleaning, โต๊ะใหม่ → occupied + log
--        fn_mark_table_cleaned  เก็บโต๊ะเสร็จ: cleaning → available
--        fn_set_table_disabled  เปิด/ปิดใช้งานโต๊ะ (manager/admin) + log
--        fn_start_closing       เชิญลูกค้าออก: active/expired → closing
--        fn_record_leftover     บันทึกน้ำหนักเนื้อเหลือ (กรัม) → ค่าปรับคำนวณโดย Trigger เดิม
--
-- ทุกฟังก์ชันตรวจตำแหน่งผู้ใช้เองด้วย fn_my_role() (ไม่พึ่ง RLS อย่างเดียว เพราะ RLS ของ sessions
-- ให้ staff เขียนได้ แต่กฎธุรกิจห้าม staff เปิดโต๊ะ) และ error เป็นภาษาไทยให้แสดงบนหน้าจอได้ทันที
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) qr_access_tokens: พนักงานหน้าร้านอ่าน/สร้างได้
--    (ลูกค้าไม่ได้อ่านตารางนี้ตรงๆ — หน้าสั่งอาหาร T-05 จะตรวจ token ผ่านฟังก์ชันฝั่งเซิร์ฟเวอร์)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "staff_manage_qr_tokens" ON qr_access_tokens;
CREATE POLICY "staff_manage_qr_tokens" ON qr_access_tokens
    FOR ALL
    TO authenticated
    USING (fn_my_role() IN ('admin', 'manager', 'cashier', 'staff'))
    WITH CHECK (fn_my_role() IN ('admin', 'manager', 'cashier', 'staff'));

-- ------------------------------------------------------------
-- 2) audit_logs: บันทึกได้เฉพาะในนามตัวเอง (actor_id = ผู้ล็อกอิน) และต้องเป็นพนักงานที่เปิดใช้งาน
--    ยังอ่านได้เฉพาะ admin/manager เหมือนเดิม และไม่มีใครแก้/ลบ log ได้
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "staff_insert_own_audit_logs" ON audit_logs;
CREATE POLICY "staff_insert_own_audit_logs" ON audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (actor_id = auth.uid() AND fn_my_role() IS NOT NULL);

-- ------------------------------------------------------------
-- ตัวช่วย: บังคับตำแหน่ง (ใช้ภายในฟังก์ชันด้านล่าง)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_require_role(p_allowed_roles user_role[], p_action_name TEXT)
RETURNS user_role AS $$
DECLARE
    v_role user_role;
BEGIN
    v_role := fn_my_role();
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'กรุณาเข้าสู่ระบบใหม่ (ไม่พบบัญชีพนักงานที่ใช้งานได้)';
    END IF;
    IF NOT (v_role = ANY (p_allowed_roles)) THEN
        RAISE EXCEPTION 'ตำแหน่งของคุณไม่มีสิทธิ์%', p_action_name;
    END IF;
    RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- ------------------------------------------------------------
-- 3.1) เปิดโต๊ะ (cashier / manager / admin)
--   p_token_hash: SHA-256 (hex) ของ token ที่แอปสุ่มขึ้น — ฐานข้อมูลไม่เคยเห็น token จริง
--   p_queue_id:   (ไม่บังคับ) คิวที่ "เรียกแล้ว" → เปลี่ยนเป็น seated
--   คืนค่า: id ของ session ใหม่
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_open_table(
    p_table_id    UUID,
    p_adult_count INT,
    p_child_count INT,
    p_token_hash  TEXT,
    p_queue_id    UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_table      dining_tables%ROWTYPE;
    v_package    packages%ROWTYPE;
    v_package_count INT;
    v_session_id UUID;
    v_session    sessions%ROWTYPE;
    v_queue      queues%ROWTYPE;
BEGIN
    PERFORM fn_require_role(ARRAY['admin', 'manager', 'cashier']::user_role[], 'เปิดโต๊ะ');

    IF p_adult_count IS NULL OR p_child_count IS NULL OR p_adult_count < 0 OR p_child_count < 0
       OR p_adult_count + p_child_count < 1 THEN
        RAISE EXCEPTION 'จำนวนลูกค้าไม่ถูกต้อง (ต้องมีอย่างน้อย 1 คน)';
    END IF;
    IF p_token_hash IS NULL OR length(p_token_hash) <> 64 THEN
        RAISE EXCEPTION 'รหัส QR ไม่ถูกต้อง กรุณาลองใหม่';
    END IF;

    -- ล็อกแถวโต๊ะ กันแคชเชียร์ 2 เครื่องเปิดโต๊ะเดียวกันพร้อมกัน
    SELECT * INTO v_table FROM dining_tables WHERE id = p_table_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบโต๊ะนี้';
    END IF;
    IF v_table.status <> 'available' THEN
        RAISE EXCEPTION 'โต๊ะ % ไม่ว่าง (สถานะ: %)', v_table.table_number, v_table.status;
    END IF;

    -- บุฟเฟต์ราคาเดียว → ต้องมีแพ็กเกจที่เปิดใช้งานอยู่ 1 ตัวพอดี
    SELECT count(*) INTO v_package_count FROM packages WHERE is_active = true;
    IF v_package_count <> 1 THEN
        RAISE EXCEPTION 'ต้องมีแพ็กเกจที่เปิดใช้งาน 1 รายการพอดี (ตอนนี้มี % รายการ) กรุณาติดต่อผู้ดูแลระบบ', v_package_count;
    END IF;
    SELECT * INTO v_package FROM packages WHERE is_active = true;

    -- คิว (ถ้ามี) ต้องอยู่ในสถานะ "เรียกแล้ว"
    IF p_queue_id IS NOT NULL THEN
        SELECT * INTO v_queue FROM queues WHERE id = p_queue_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'ไม่พบคิวนี้';
        END IF;
        IF v_queue.status <> 'called' THEN
            RAISE EXCEPTION 'คิว % ไม่ได้อยู่ในสถานะ "เรียกแล้ว" (สถานะ: %)', v_queue.queue_number, v_queue.status;
        END IF;
    END IF;

    -- สร้างรอบเป็น draft ก่อน แล้วเปลี่ยนเป็น active ทันที
    -- (Trigger fn_protect_session_snapshot ล็อก snapshot และคำนวณ expires_at ตอน draft → active)
    INSERT INTO sessions (package_id, status, adult_guest_count, child_guest_count,
                          adult_price_snapshot, child_price_snapshot, duration_minutes_snapshot, created_by)
    VALUES (v_package.id, 'draft', p_adult_count, p_child_count,
            v_package.adult_price, v_package.child_price, v_package.duration_minutes, auth.uid())
    RETURNING id INTO v_session_id;

    UPDATE sessions SET status = 'active' WHERE id = v_session_id
    RETURNING * INTO v_session;

    -- ผูกโต๊ะ (Trigger fn_sync_table_status_on_assign เปลี่ยนโต๊ะเป็น occupied)
    INSERT INTO session_tables (session_id, table_id, transferred_by)
    VALUES (v_session_id, p_table_id, auth.uid());

    INSERT INTO qr_access_tokens (session_id, token_hash) VALUES (v_session_id, p_token_hash);

    IF p_queue_id IS NOT NULL THEN
        UPDATE queues SET status = 'seated', seated_at = now() WHERE id = p_queue_id;
    END IF;

    INSERT INTO audit_logs (actor_id, action, target_entity, target_id, payload_after)
    VALUES (auth.uid(), 'OPEN_SESSION', 'sessions', v_session_id::text,
            jsonb_build_object(
                'table_number', v_table.table_number,
                'adult_guest_count', p_adult_count,
                'child_guest_count', p_child_count,
                'adult_price_snapshot', v_session.adult_price_snapshot,
                'child_price_snapshot', v_session.child_price_snapshot,
                'expires_at', v_session.expires_at,
                'queue_number', v_queue.queue_number));

    RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

-- ------------------------------------------------------------
-- 3.2) พิมพ์ QR ซ้ำ: สร้าง token ใหม่ให้รอบที่ยังไม่ปิด (token เดิมยังใช้ได้จนปิดรอบ)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_issue_qr_token(p_session_id UUID, p_token_hash TEXT)
RETURNS VOID AS $$
DECLARE
    v_status session_status;
BEGIN
    PERFORM fn_require_role(ARRAY['admin', 'manager', 'cashier', 'staff']::user_role[], 'พิมพ์ QR');

    IF p_token_hash IS NULL OR length(p_token_hash) <> 64 THEN
        RAISE EXCEPTION 'รหัส QR ไม่ถูกต้อง กรุณาลองใหม่';
    END IF;

    SELECT status INTO v_status FROM sessions WHERE id = p_session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบรอบบริการนี้';
    END IF;
    IF v_status NOT IN ('active', 'expired') THEN
        RAISE EXCEPTION 'พิมพ์ QR ได้เฉพาะรอบที่ยังให้บริการอยู่ (สถานะ: %)', v_status;
    END IF;

    INSERT INTO qr_access_tokens (session_id, token_hash) VALUES (p_session_id, p_token_hash);
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

-- ------------------------------------------------------------
-- 3.3) ย้ายโต๊ะ (cashier / staff / manager / admin)
--   โต๊ะปลายทางต้องว่าง / โต๊ะเดิม → cleaning (กฎข้อ 5) / ใช้ได้กับรอบ active, expired, closing
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_move_table(p_session_id UUID, p_from_table_id UUID, p_to_table_id UUID)
RETURNS VOID AS $$
DECLARE
    v_status     session_status;
    v_from_table dining_tables%ROWTYPE;
    v_to_table   dining_tables%ROWTYPE;
    v_link_id    UUID;
BEGIN
    PERFORM fn_require_role(ARRAY['admin', 'manager', 'cashier', 'staff']::user_role[], 'ย้ายโต๊ะ');

    IF p_from_table_id = p_to_table_id THEN
        RAISE EXCEPTION 'โต๊ะต้นทางและปลายทางต้องเป็นคนละโต๊ะ';
    END IF;

    SELECT status INTO v_status FROM sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบรอบบริการนี้';
    END IF;
    IF v_status NOT IN ('active', 'expired', 'closing') THEN
        RAISE EXCEPTION 'ย้ายโต๊ะได้เฉพาะรอบที่ยังให้บริการอยู่ (สถานะ: %)', v_status;
    END IF;

    SELECT id INTO v_link_id FROM session_tables
    WHERE session_id = p_session_id AND table_id = p_from_table_id AND is_active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'รอบบริการนี้ไม่ได้อยู่ที่โต๊ะต้นทาง (ข้อมูลอาจเปลี่ยนจากเครื่องอื่น กรุณารีเฟรช)';
    END IF;

    SELECT * INTO v_from_table FROM dining_tables WHERE id = p_from_table_id;
    SELECT * INTO v_to_table FROM dining_tables WHERE id = p_to_table_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบโต๊ะปลายทาง';
    END IF;
    IF v_to_table.status <> 'available' THEN
        RAISE EXCEPTION 'โต๊ะ % ไม่ว่าง (สถานะ: %)', v_to_table.table_number, v_to_table.status;
    END IF;

    -- ปล่อยโต๊ะเดิม (Trigger → cleaning) แล้วผูกโต๊ะใหม่ (Trigger → occupied)
    UPDATE session_tables
    SET is_active = false, released_at = now(), transferred_by = auth.uid()
    WHERE id = v_link_id;

    INSERT INTO session_tables (session_id, table_id, transferred_by)
    VALUES (p_session_id, p_to_table_id, auth.uid());

    INSERT INTO audit_logs (actor_id, action, target_entity, target_id, payload_before, payload_after)
    VALUES (auth.uid(), 'MOVE_TABLE', 'sessions', p_session_id::text,
            jsonb_build_object('table_number', v_from_table.table_number),
            jsonb_build_object('table_number', v_to_table.table_number));
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

-- ------------------------------------------------------------
-- 3.4) เก็บโต๊ะเสร็จ: cleaning → available (staff / cashier / manager / admin)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_mark_table_cleaned(p_table_id UUID)
RETURNS VOID AS $$
DECLARE
    v_table dining_tables%ROWTYPE;
BEGIN
    PERFORM fn_require_role(ARRAY['admin', 'manager', 'cashier', 'staff']::user_role[], 'ยืนยันเก็บโต๊ะ');

    SELECT * INTO v_table FROM dining_tables WHERE id = p_table_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบโต๊ะนี้';
    END IF;
    IF v_table.status <> 'cleaning' THEN
        RAISE EXCEPTION 'โต๊ะ % ไม่ได้อยู่ในสถานะรอเก็บโต๊ะ (สถานะ: %)', v_table.table_number, v_table.status;
    END IF;

    UPDATE dining_tables SET status = 'available' WHERE id = p_table_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

-- ------------------------------------------------------------
-- 3.5) เปิด/ปิดใช้งานโต๊ะ (manager / admin เท่านั้น)
--   ปิดได้เฉพาะโต๊ะที่ว่างหรือรอเก็บ (ไม่มีลูกค้า) / เปิดใช้งานกลับเป็น available
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_table_disabled(p_table_id UUID, p_disabled BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
    v_table      dining_tables%ROWTYPE;
    v_new_status table_status;
BEGIN
    PERFORM fn_require_role(ARRAY['admin', 'manager']::user_role[], 'เปิด/ปิดใช้งานโต๊ะ');

    SELECT * INTO v_table FROM dining_tables WHERE id = p_table_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบโต๊ะนี้';
    END IF;

    IF p_disabled THEN
        IF v_table.status NOT IN ('available', 'cleaning') THEN
            RAISE EXCEPTION 'ปิดใช้งานได้เฉพาะโต๊ะที่ไม่มีลูกค้า (สถานะ: %)', v_table.status;
        END IF;
        v_new_status := 'disabled';
    ELSE
        IF v_table.status <> 'disabled' THEN
            RAISE EXCEPTION 'โต๊ะ % ไม่ได้ถูกปิดใช้งาน', v_table.table_number;
        END IF;
        v_new_status := 'available';
    END IF;

    UPDATE dining_tables SET status = v_new_status WHERE id = p_table_id;

    INSERT INTO audit_logs (actor_id, action, target_entity, target_id, payload_before, payload_after, reason)
    VALUES (auth.uid(), CASE WHEN p_disabled THEN 'DISABLE_TABLE' ELSE 'ENABLE_TABLE' END,
            'dining_tables', p_table_id::text,
            jsonb_build_object('table_number', v_table.table_number, 'status', v_table.status),
            jsonb_build_object('table_number', v_table.table_number, 'status', v_new_status),
            NULLIF(trim(p_reason), ''));
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

-- ------------------------------------------------------------
-- 3.6) เชิญลูกค้าออก: active / expired → closing (staff / cashier / manager / admin)
--   หลังจากนี้ย้อนกลับไม่ได้ (Phase 1)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_start_closing(p_session_id UUID)
RETURNS VOID AS $$
DECLARE
    v_status session_status;
BEGIN
    PERFORM fn_require_role(ARRAY['admin', 'manager', 'cashier', 'staff']::user_role[], 'เชิญลูกค้าออก');

    SELECT status INTO v_status FROM sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบรอบบริการนี้';
    END IF;
    IF v_status NOT IN ('active', 'expired') THEN
        RAISE EXCEPTION 'รอบนี้เชิญออกไปแล้วหรือปิดไปแล้ว (สถานะ: %)', v_status;
    END IF;

    UPDATE sessions SET status = 'closing' WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

-- ------------------------------------------------------------
-- 3.7) บันทึกน้ำหนักเนื้อเหลือ (กรัม) ของรอบที่กำลังเชิญออก (staff / cashier / manager / admin)
--   ชั่งใหม่ได้ (บันทึกทับ) จนกว่าจะออกบิล / ค่าปรับคำนวณโดย Trigger fn_calc_leftover_penalty
--   SECURITY DEFINER: ต้องอ่านอัตราค่าปรับจาก app_settings ซึ่ง RLS ให้อ่านเฉพาะ admin
--   (ตรวจตำแหน่งด้วย fn_require_role ก่อนทำอะไรทุกครั้ง)
--   คืนค่า: ค่าปรับ (บาท)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_record_leftover(p_session_id UUID, p_weight_grams INT)
RETURNS NUMERIC AS $$
DECLARE
    v_status  session_status;
    v_rate    NUMERIC(10,2);
    v_penalty NUMERIC(10,2);
BEGIN
    PERFORM fn_require_role(ARRAY['admin', 'manager', 'cashier', 'staff']::user_role[], 'บันทึกเนื้อเหลือ');

    IF p_weight_grams IS NULL OR p_weight_grams < 0 OR p_weight_grams > 100000 THEN
        RAISE EXCEPTION 'น้ำหนักไม่ถูกต้อง (0 - 100,000 กรัม)';
    END IF;

    SELECT status INTO v_status FROM sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบรอบบริการนี้';
    END IF;
    IF v_status <> 'closing' THEN
        RAISE EXCEPTION 'บันทึกเนื้อเหลือได้เฉพาะรอบที่กำลังเชิญออก (สถานะ: %)', v_status;
    END IF;

    v_rate := COALESCE(
        (SELECT value::numeric FROM app_settings WHERE key = 'penalty_rate_per_100g'),
        100
    );

    INSERT INTO leftover_records (session_id, weight_grams, penalty_rate_per_100g, weighed_by)
    VALUES (p_session_id, p_weight_grams, v_rate, auth.uid())
    ON CONFLICT (session_id) DO UPDATE
    SET weight_grams = EXCLUDED.weight_grams,
        penalty_rate_per_100g = EXCLUDED.penalty_rate_per_100g,
        weighed_by = EXCLUDED.weighed_by,
        created_at = now()
    RETURNING penalty_amount INTO v_penalty;

    RETURN v_penalty;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 4) สิทธิ์เรียกใช้: เฉพาะผู้ที่ล็อกอิน (ตำแหน่งตรวจซ้ำภายในฟังก์ชัน)
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION fn_require_role(user_role[], TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_open_table(UUID, INT, INT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_issue_qr_token(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_move_table(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_mark_table_cleaned(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_set_table_disabled(UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_start_closing(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_record_leftover(UUID, INT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION fn_require_role(user_role[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_open_table(UUID, INT, INT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_issue_qr_token(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_move_table(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_mark_table_cleaned(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_set_table_disabled(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_start_closing(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_record_leftover(UUID, INT) TO authenticated;

COMMIT;
