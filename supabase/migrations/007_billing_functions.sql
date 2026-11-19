-- ============================================================
-- KURO POS — Migration 007: คิดเงิน / ส่วนลด / รับชำระ (หน้า /billing, T-07)
-- ------------------------------------------------------------
-- ต้องรันหลัง 006_queue_functions.sql
-- รันซ้ำได้ และอยู่ใน Transaction เดียว ไม่แก้/ลบข้อมูลเดิม
--
-- สิ่งที่เพิ่ม:
--   1) Policy app_settings: พนักงานที่ล็อกอินอ่าน "ข้อมูลร้าน" ได้ (ชื่อ/ที่อยู่/เลขผู้เสียภาษี/โทร/VAT)
--      สำหรับพิมพ์ใบเสร็จ — คีย์อื่นยังอ่านได้เฉพาะ admin เหมือนเดิม
--   2) payments: คอลัมน์ reference_note (เลขอ้างอิงสลิป/บัตร ไม่บังคับ) และ cash_tendered (เงินสดที่ลูกค้ายื่น)
--   3) ฟังก์ชัน (ยอดเงินคำนวณในฐานข้อมูลเสมอ ไม่เชื่อตัวเลขจากหน้าจอ)
--        fn_create_bill     ออกบิล: closing → billed (ต้องชั่งเนื้อเหลือก่อน)
--        fn_apply_discount  ให้/แก้/ลบส่วนลด (บังคับเหตุผล) + Audit Log APPROVE_DISCOUNT
--        fn_pay_bill        รับชำระ (แบ่งจ่ายได้) → บิล paid → รอบ closed (QR ถูกยกเลิก) → โต๊ะรอเก็บ
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) อ่านข้อมูลร้านสำหรับใบเสร็จ (พนักงานที่ล็อกอินทุกตำแหน่ง)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "staff_read_receipt_settings" ON app_settings;
CREATE POLICY "staff_read_receipt_settings" ON app_settings
    FOR SELECT
    TO authenticated
    USING (
        fn_my_role() IS NOT NULL
        AND key IN ('store_name', 'store_branch', 'store_address', 'store_tax_id', 'store_phone',
                    'vat_rate_percent', 'penalty_rate_per_100g')
    );

-- ------------------------------------------------------------
-- 2) payments: ข้อมูลประกอบใบเสร็จ
--    amount_paid ยังคงเป็น "ยอดที่หักจากบิล" (ผลรวมต้องเท่ายอดบิล)
--    cash_tendered = เงินสดที่ลูกค้ายื่นจริง (เงินทอน = cash_tendered - amount_paid) เก็บไว้พิมพ์ใบเสร็จซ้ำ
-- ------------------------------------------------------------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reference_note VARCHAR(100);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cash_tendered NUMERIC(10,2);
ALTER TABLE payments DROP CONSTRAINT IF EXISTS chk_payments_cash_tendered;
ALTER TABLE payments ADD CONSTRAINT chk_payments_cash_tendered
    CHECK (cash_tendered IS NULL OR (payment_method = 'cash' AND cash_tendered >= amount_paid));

COMMENT ON COLUMN payments.reference_note IS 'เลขอ้างอิงสลิป PromptPay / เลขอนุมัติบัตร (ไม่บังคับ)';
COMMENT ON COLUMN payments.cash_tendered IS 'เงินสดที่ลูกค้ายื่น (เฉพาะเงินสด) — เงินทอน = cash_tendered - amount_paid';

-- ------------------------------------------------------------
-- 3.1) ออกบิล (cashier / manager / admin)
--   - รอบต้องอยู่ในสถานะ closing และชั่งเนื้อเหลือแล้ว (กฎข้อ 6: บันทึกก่อนออกบิลเสมอ ไม่มีเนื้อเหลือ = 0 กรัม)
--   - ถ้าออกบิลไปแล้ว (billed) คืนบิลเดิม (กดซ้ำได้ ไม่เกิดบิลซ้ำ — กฎข้อ 4)
--   - ยอด: ค่าบุฟเฟต์ (ราคาที่ล็อกไว้) + เมนูนอกบุฟเฟต์ที่ลูกค้าสั่ง (ไม่นับที่ยกเลิก) + ค่าปรับเนื้อเหลือ
--   - เลขที่บิล INV-YYYYMMDD-NNN (เริ่ม 001 ทุกวัน เวลาไทย)
--   คืนค่า: id ของบิล
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_create_bill(p_session_id UUID)
RETURNS UUID AS $$
DECLARE
    v_session     sessions%ROWTYPE;
    v_leftover    leftover_records%ROWTYPE;
    v_bill_id     UUID;
    v_buffet      NUMERIC(10,2);
    v_extra       NUMERIC(10,2);
    v_prefix      TEXT;
    v_next_number INT;
BEGIN
    PERFORM fn_require_role(ARRAY['admin', 'manager', 'cashier']::user_role[], 'ออกบิล');

    SELECT * INTO v_session FROM sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบรอบบริการนี้';
    END IF;

    IF v_session.status = 'billed' THEN
        SELECT id INTO v_bill_id FROM bills WHERE session_id = p_session_id;
        RETURN v_bill_id;
    END IF;
    IF v_session.status <> 'closing' THEN
        RAISE EXCEPTION 'ออกบิลได้เฉพาะโต๊ะที่เชิญลูกค้าออกแล้ว (สถานะ: %)', v_session.status;
    END IF;

    SELECT * INTO v_leftover FROM leftover_records WHERE session_id = p_session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ยังไม่ได้ชั่งเนื้อเหลือ — ชั่งที่หน้าผังโต๊ะก่อน (ไม่มีเนื้อเหลือให้กรอก 0 กรัม)';
    END IF;

    v_buffet := v_session.adult_guest_count * v_session.adult_price_snapshot
              + v_session.child_guest_count * v_session.child_price_snapshot;

    SELECT COALESCE(SUM(item.quantity * item.unit_price_snapshot), 0) INTO v_extra
    FROM order_items AS item
    JOIN orders AS ord ON ord.id = item.order_id
    WHERE ord.session_id = p_session_id AND item.status <> 'cancelled';

    -- เลขที่บิล (ล็อกกันเลขซ้ำเมื่อ 2 เครื่องออกบิลพร้อมกัน)
    PERFORM pg_advisory_xact_lock(hashtext('kuro_bill_number'));
    v_prefix := 'INV-' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYYYMMDD') || '-';
    SELECT COALESCE(MAX(NULLIF(regexp_replace(substring(bill_number FROM length(v_prefix) + 1), '\D', '', 'g'), '')::int), 0) + 1
    INTO v_next_number
    FROM bills
    WHERE bill_number LIKE v_prefix || '%';

    INSERT INTO bills (session_id, bill_number, buffet_subtotal, extra_items_subtotal,
                       leftover_penalty_subtotal, discount_amount, total_amount, status)
    VALUES (p_session_id,
            v_prefix || CASE WHEN v_next_number > 999 THEN v_next_number::text ELSE lpad(v_next_number::text, 3, '0') END,
            v_buffet, v_extra, v_leftover.penalty_amount, 0,
            v_buffet + v_extra + v_leftover.penalty_amount, 'unpaid')
    RETURNING id INTO v_bill_id;
    -- vat_amount คำนวณโดย Trigger fn_calc_bill_vat

    -- รายการแจกแจงบนใบเสร็จ
    IF v_session.adult_guest_count > 0 THEN
        INSERT INTO bill_items (bill_id, item_type, description, quantity, unit_price, total_price)
        VALUES (v_bill_id, 'buffet_adult', 'บุฟเฟต์ผู้ใหญ่', v_session.adult_guest_count,
                v_session.adult_price_snapshot, v_session.adult_guest_count * v_session.adult_price_snapshot);
    END IF;
    IF v_session.child_guest_count > 0 THEN
        INSERT INTO bill_items (bill_id, item_type, description, quantity, unit_price, total_price)
        VALUES (v_bill_id, 'buffet_child', 'บุฟเฟต์เด็ก (ต่ำกว่า 120 ซม.)', v_session.child_guest_count,
                v_session.child_price_snapshot, v_session.child_guest_count * v_session.child_price_snapshot);
    END IF;

    -- เมนูนอกบุฟเฟต์ที่ลูกค้าสั่งเอง (ราคา > 0) รวมตามเมนูและราคา
    INSERT INTO bill_items (bill_id, item_type, description, quantity, unit_price, total_price)
    SELECT v_bill_id, 'extra_item', menu.name, SUM(item.quantity), item.unit_price_snapshot,
           SUM(item.quantity) * item.unit_price_snapshot
    FROM order_items AS item
    JOIN orders AS ord ON ord.id = item.order_id
    JOIN menu_items AS menu ON menu.id = item.menu_item_id
    WHERE ord.session_id = p_session_id AND item.status <> 'cancelled' AND item.unit_price_snapshot > 0
    GROUP BY menu.name, item.unit_price_snapshot;

    IF v_leftover.penalty_amount > 0 THEN
        INSERT INTO bill_items (bill_id, item_type, description, quantity, unit_price, total_price)
        VALUES (v_bill_id, 'leftover_penalty', 'ค่าปรับเนื้อเหลือ ' || v_leftover.weight_grams || ' กรัม',
                1, v_leftover.penalty_amount, v_leftover.penalty_amount);
    END IF;

    UPDATE leftover_records SET bill_id = v_bill_id WHERE id = v_leftover.id;
    UPDATE sessions SET status = 'billed' WHERE id = p_session_id;

    RETURN v_bill_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

-- ------------------------------------------------------------
-- 3.2) ให้ / แก้ / ลบส่วนลด (cashier / manager / admin) — แก้ได้จนกว่าจะรับชำระ
--   p_amount = 0 คือลบส่วนลด / มากกว่า 0 ต้องมีเหตุผล / ห้ามเกินยอดก่อนลด
--   บันทึก Audit Log ทุกครั้ง (FR-041, NFR-005)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_apply_discount(p_bill_id UUID, p_amount NUMERIC, p_reason TEXT)
RETURNS VOID AS $$
DECLARE
    v_bill     bills%ROWTYPE;
    v_subtotal NUMERIC(10,2);
    v_amount   NUMERIC(10,2);
    v_reason   TEXT;
BEGIN
    PERFORM fn_require_role(ARRAY['admin', 'manager', 'cashier']::user_role[], 'ให้ส่วนลด');

    SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบบิลนี้';
    END IF;
    IF v_bill.status <> 'unpaid' THEN
        RAISE EXCEPTION 'บิลนี้ชำระเงินแล้ว แก้ส่วนลดไม่ได้';
    END IF;

    v_amount := ROUND(COALESCE(p_amount, 0), 2);
    v_reason := NULLIF(trim(COALESCE(p_reason, '')), '');
    v_subtotal := v_bill.buffet_subtotal + v_bill.extra_items_subtotal + v_bill.leftover_penalty_subtotal;

    IF v_amount < 0 THEN
        RAISE EXCEPTION 'ส่วนลดติดลบไม่ได้';
    END IF;
    IF v_amount > v_subtotal THEN
        RAISE EXCEPTION 'ส่วนลด % บาท เกินยอดก่อนลด % บาท', v_amount, v_subtotal;
    END IF;
    IF v_amount > 0 AND v_reason IS NULL THEN
        RAISE EXCEPTION 'กรุณาระบุเหตุผลของส่วนลด';
    END IF;

    UPDATE bills
    SET discount_amount      = v_amount,
        discount_reason      = CASE WHEN v_amount > 0 THEN v_reason END,
        discount_approved_by = CASE WHEN v_amount > 0 THEN auth.uid() END,
        total_amount         = v_subtotal - v_amount
    WHERE id = p_bill_id;
    -- vat_amount คำนวณใหม่โดย Trigger fn_calc_bill_vat

    DELETE FROM bill_items WHERE bill_id = p_bill_id AND item_type = 'discount';
    IF v_amount > 0 THEN
        INSERT INTO bill_items (bill_id, item_type, description, quantity, unit_price, total_price)
        VALUES (p_bill_id, 'discount', 'ส่วนลด (' || v_reason || ')', 1, -v_amount, -v_amount);
    END IF;

    INSERT INTO audit_logs (actor_id, action, target_entity, target_id, payload_before, payload_after, reason)
    VALUES (auth.uid(),
            CASE WHEN v_amount > 0 THEN 'APPROVE_DISCOUNT' ELSE 'REMOVE_DISCOUNT' END,
            'bills', p_bill_id::text,
            jsonb_build_object('bill_number', v_bill.bill_number, 'subtotal', v_subtotal,
                               'discount_amount', v_bill.discount_amount, 'total_amount', v_bill.total_amount),
            jsonb_build_object('bill_number', v_bill.bill_number, 'subtotal', v_subtotal,
                               'discount_amount', v_amount, 'total_amount', v_subtotal - v_amount),
            COALESCE(v_reason, 'ลบส่วนลด'));
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

-- ------------------------------------------------------------
-- 3.3) รับชำระเงิน + ปิดรอบ (cashier / manager / admin)
--   p_payments: JSON array เช่น
--     [{"method":"cash","amount":500,"cash_tendered":1000},
--      {"method":"promptpay","amount":1154,"reference":"ABC123"}]
--   - ผลรวม amount ต้องเท่ายอดบิลพอดี (Trigger fn_check_bill_fully_paid ตรวจซ้ำอีกชั้น)
--   - สำเร็จ: บิล paid → รอบ closed (Trigger ยกเลิก QR) → ปล่อยโต๊ะ (Trigger → รอเก็บโต๊ะ)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_pay_bill(p_bill_id UUID, p_payments JSONB)
RETURNS VOID AS $$
DECLARE
    v_bill       bills%ROWTYPE;
    v_payment    JSONB;
    v_method     TEXT;
    v_amount     NUMERIC(10,2);
    v_tendered   NUMERIC(10,2);
    v_total_paid NUMERIC(10,2) := 0;
BEGIN
    PERFORM fn_require_role(ARRAY['admin', 'manager', 'cashier']::user_role[], 'รับชำระเงิน');

    SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบบิลนี้';
    END IF;
    IF v_bill.status <> 'unpaid' THEN
        RAISE EXCEPTION 'บิล % ชำระเงินไปแล้ว', v_bill.bill_number;
    END IF;
    IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' THEN
        RAISE EXCEPTION 'ข้อมูลการชำระเงินไม่ถูกต้อง';
    END IF;
    IF jsonb_array_length(p_payments) = 0 AND v_bill.total_amount > 0 THEN
        RAISE EXCEPTION 'กรุณาเลือกวิธีชำระเงิน';
    END IF;
    IF jsonb_array_length(p_payments) > 10 THEN
        RAISE EXCEPTION 'แบ่งจ่ายได้ไม่เกิน 10 รายการ';
    END IF;

    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
        v_method := v_payment ->> 'method';
        v_amount := ROUND((v_payment ->> 'amount')::numeric, 2);
        v_tendered := ROUND((v_payment ->> 'cash_tendered')::numeric, 2);

        IF v_method NOT IN ('cash', 'promptpay', 'credit_card') THEN
            RAISE EXCEPTION 'วิธีชำระเงินไม่ถูกต้อง';
        END IF;
        IF v_amount IS NULL OR v_amount <= 0 THEN
            RAISE EXCEPTION 'ยอดชำระแต่ละรายการต้องมากกว่า 0 บาท';
        END IF;
        IF v_method = 'cash' AND v_tendered IS NOT NULL AND v_tendered < v_amount THEN
            RAISE EXCEPTION 'เงินสดที่รับมา (% บาท) น้อยกว่ายอดที่ต้องจ่าย (% บาท)', v_tendered, v_amount;
        END IF;

        INSERT INTO payments (bill_id, payment_method, amount_paid, verified_by, reference_note, cash_tendered)
        VALUES (p_bill_id, v_method::payment_method, v_amount, auth.uid(),
                NULLIF(left(trim(COALESCE(v_payment ->> 'reference', '')), 100), ''),
                CASE WHEN v_method = 'cash' THEN v_tendered END);

        v_total_paid := v_total_paid + v_amount;
    END LOOP;

    IF v_total_paid <> v_bill.total_amount THEN
        RAISE EXCEPTION 'ยอดชำระรวม % บาท ไม่เท่ากับยอดบิล % บาท', v_total_paid, v_bill.total_amount;
    END IF;

    UPDATE bills SET status = 'paid' WHERE id = p_bill_id;          -- Trigger ตรวจยอด + ใส่ paid_at
    UPDATE sessions SET status = 'closed' WHERE id = v_bill.session_id; -- Trigger ยกเลิก QR + ใส่ closed_at
    UPDATE session_tables                                             -- Trigger เปลี่ยนโต๊ะเป็น cleaning
    SET is_active = false, released_at = now()
    WHERE session_id = v_bill.session_id AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

REVOKE ALL ON FUNCTION fn_create_bill(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_apply_discount(UUID, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_pay_bill(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_create_bill(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_apply_discount(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_pay_bill(UUID, JSONB) TO authenticated;

COMMIT;
