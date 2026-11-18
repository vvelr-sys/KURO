-- ############################################################
-- ##                                                        ##
-- ##   ⛔ ห้ามรันไฟล์นี้บนระบบจริง (PRODUCTION) เด็ดขาด ⛔     ##
-- ##   ไฟล์นี้ "ลบข้อมูลการใช้งานทั้งหมด" (Session, ออเดอร์,    ##
-- ##   บิล, การชำระเงิน, คิว, สต็อก movement, audit_logs)      ##
-- ##   แล้วใส่ข้อมูลจำลองแทน — ใช้สำหรับพัฒนา/ทดสอบเท่านั้น   ##
-- ##                                                        ##
-- ############################################################
--
-- KURO POS — Seed ข้อมูลจำลองการใช้งาน (Demo Data) v1.8
-- ลำดับการรัน: migrations/002 → 003 → 004 → สร้างบัญชี (seed_profiles.sql หรือ scripts/seed-users.mjs) → seed_master.sql → seed_demo.sql (ไฟล์นี้)
-- รีเซ็ตข้อมูลเมื่อทดสอบจนเละ: รันไฟล์นี้ซ้ำได้ทันที (ทั้งไฟล์อยู่ใน Transaction เดียว
--   ถ้าผิดพลาดตรงไหนจะ ROLLBACK ทั้งหมด ข้อมูลเดิมไม่เสีย)
--
-- รูปแบบ UUID คงที่ (8 หลักแรกบอกตาราง; Session ประวัติใช้เลขท้าย 101-115):
--   a1… queues            a2… sessions          a3… qr_access_tokens   a4… orders
--   a5… order_items       a6… order_item_options a7… leftover_records  a8… bills
--   a9… bill_items        aa… payments          ab… service_requests   ac… stock_counts
--   ad… stock_count_items ae… audit_logs        af… session_tables
--   (stock_movements ใช้ id อัตโนมัติ เพราะ Trigger ตัดสต็อกเป็นผู้สร้าง)
-- ============================================================

BEGIN;

-- pgcrypto บน Supabase อยู่ใน schema "extensions" — เพิ่มเข้า search_path เฉพาะ Transaction นี้
SET LOCAL search_path = public, extensions;

-- ============================================================
-- ขั้นที่ 1: ตรวจข้อมูลที่ต้องมีก่อน (ผู้ใช้ 5 ตำแหน่ง + ข้อมูลหลัก)
-- ============================================================
DO $$
DECLARE
    v_role user_role;
BEGIN
    -- migration 003 ต้องรันแล้ว (คิวแยกผู้ใหญ่/เด็ก)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'queues' AND column_name = 'adult_count') THEN
        RAISE EXCEPTION 'ยังไม่ได้รัน "supabase/migrations/003_queue_guests_tax_invoice.sql" — รันก่อนแล้วค่อยรันไฟล์นี้ใหม่';
    END IF;

    FOREACH v_role IN ARRAY ARRAY['admin', 'manager', 'cashier', 'staff', 'kitchen']::user_role[] LOOP
        IF NOT EXISTS (SELECT 1 FROM profiles WHERE role = v_role) THEN
            RAISE EXCEPTION 'ไม่พบผู้ใช้ตำแหน่ง "%" ในตาราง profiles — ต้องสร้างบัญชีทดสอบก่อน (supabase/seed_profiles.sql หรือ node scripts/seed-users.mjs ดู docs/SEED.md ข้อ 2) แล้วค่อยรันไฟล์นี้ใหม่', v_role;
        END IF;
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM packages WHERE id = '10000000-0000-4000-8000-000000000001')
       OR (SELECT count(*) FROM dining_tables WHERE table_number IN ('T01','T02','T03','T04','T05','T06','T07','T08')) <> 8
       OR (SELECT count(*) FROM ingredients WHERE id::text LIKE '40000000-0000-4000-8000-0000000000%') <> 12
       OR (SELECT count(*) FROM menu_items  WHERE id::text LIKE '50000000-0000-4000-8000-0000000000%'
                                              AND id <> '50000000-0000-4000-8000-000000000012') <> 11
       OR (SELECT count(*) FROM menu_item_options WHERE id::text LIKE '60000000-0000-4000-8000-0000000000%') <> 6 THEN
        RAISE EXCEPTION 'ข้อมูลหลักไม่ครบ (แพ็กเกจ/โต๊ะ T01-T08/วัตถุดิบ/เมนู/ตัวเลือก) — ต้องรัน "supabase/seed_master.sql" ก่อน';
    END IF;
END $$;

-- ============================================================
-- ขั้นที่ 2: ล้างข้อมูลที่เกิดจากการใช้งาน (เรียงลูก → แม่ ตาม FK)
--   audit_logs: schema ไม่มี Trigger ห้ามลบ จึงล้างได้
--   head_usage_estimates / payment_attempts / tax_invoices: ล้างอย่างเดียว ไม่ seed ใหม่
-- ============================================================
DELETE FROM audit_logs;
DELETE FROM stock_movements;
DELETE FROM stock_count_items;
DELETE FROM stock_counts;
DELETE FROM tax_invoices;
DELETE FROM payment_attempts;
DELETE FROM payments;
DELETE FROM bill_items;
DELETE FROM leftover_records;
DELETE FROM bills;
DELETE FROM service_requests;
DELETE FROM head_usage_estimates;
DELETE FROM order_item_options;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM qr_access_tokens;
DELETE FROM session_tables;
DELETE FROM sessions;
DELETE FROM queues;

-- รีเซ็ตทุกโต๊ะเป็นว่าง
UPDATE dining_tables SET status = 'available' WHERE status <> 'available';

-- รีเซ็ตสต็อกวัตถุดิบกลับเป็นค่าตั้งต้น (⚠️ ต้องตรงกับ seed_master.sql ข้อ 5)
-- เพราะ Trigger ตัดสต็อกจะหักสต็อกทุกครั้งที่รัน ถ้าไม่รีเซ็ต สต็อกจะลดลงเรื่อยๆ จนติดลบ
UPDATE ingredients AS ingredient
SET current_stock = baseline.stock
FROM (VALUES
    ('40000000-0000-4000-8000-000000000001'::uuid, 20000),  -- หมูสันคอสไลซ์
    ('40000000-0000-4000-8000-000000000002'::uuid, 15000),  -- เนื้อวัวสไลซ์
    ('40000000-0000-4000-8000-000000000003'::uuid, 12000),  -- หมูสามชั้น
    ('40000000-0000-4000-8000-000000000004'::uuid,  2600),  -- กุ้งขาว (ใกล้เกณฑ์ 2,500)
    ('40000000-0000-4000-8000-000000000005'::uuid,  3000),  -- เนื้อวากิว
    ('40000000-0000-4000-8000-000000000006'::uuid, 10000),  -- ผักกาดขาว
    ('40000000-0000-4000-8000-000000000007'::uuid,  6000),  -- เห็ดเข็มทอง
    ('40000000-0000-4000-8000-000000000008'::uuid,     0),  -- ผักบุ้ง (หมด → เมนู out_of_stock)
    ('40000000-0000-4000-8000-000000000009'::uuid,  8000),  -- ลูกชิ้นหมู
    ('40000000-0000-4000-8000-000000000010'::uuid,  6000),  -- เต้าหู้ปลา
    ('40000000-0000-4000-8000-000000000011'::uuid,  4000),  -- เกี๊ยวกุ้ง
    ('40000000-0000-4000-8000-000000000012'::uuid,  3000)   -- ผงชาไทย (เครื่องดื่มบริการตนเอง ไม่มีเมนู)
) AS baseline(id, stock)
WHERE ingredient.id = baseline.id;

-- ============================================================
-- ขั้นที่ 3: จำลองว่า "ผู้ใช้ครัว" เป็นคนกดปุ่ม cooking
--   Trigger fn_deduct_stock_on_cooking ใช้ auth.uid() เป็น created_by ของ stock_movements
--   ถ้ารันใน SQL Editor auth.uid() จะเป็น NULL → Trigger ใช้ UUID 0000… ซึ่งไม่มีใน profiles → FK ล้ม
--   จึงตั้งค่า JWT claim แบบ LOCAL (หมดผลเมื่อจบ Transaction นี้) ให้ auth.uid() = ผู้ใช้ครัว
-- ============================================================
SELECT set_config('request.jwt.claim.sub',
                  (SELECT id::text FROM profiles WHERE role = 'kitchen' ORDER BY created_at LIMIT 1),
                  true);
SELECT set_config('request.jwt.claims',
                  json_build_object('sub',  (SELECT id FROM profiles WHERE role = 'kitchen' ORDER BY created_at LIMIT 1),
                                    'role', 'authenticated')::text,
                  true);

DO $$
BEGIN
    IF auth.uid() IS DISTINCT FROM (SELECT id FROM profiles WHERE role = 'kitchen' ORDER BY created_at LIMIT 1) THEN
        RAISE EXCEPTION 'จำลอง auth.uid() เป็นผู้ใช้ครัวไม่สำเร็จ — Trigger ตัดสต็อกจะบันทึก created_by ไม่ได้';
    END IF;
END $$;

-- ============================================================
-- ขั้นที่ 4: ประวัติย้อนหลัง 7 วัน — Session ปิดแล้ว 15 รอบ (สำหรับหน้ารายงาน)
--   วันที่ 7 วันก่อน: 3 รอบ (11:30, 18:00, 20:15) / วันอื่น: 2 รอบ (11:30, 18:00) เวลาไทย
--   ทุกรอบ: ออเดอร์ 1 ใบ → ผ่าน Trigger pending → cooking (ตัดสต็อก) → served
--   บิลจ่ายแล้วทุกใบ: ช่องทางวน cash / promptpay / credit_card
--   รอบที่ 10 = แบ่งจ่าย (Split): เงินสด 500 + PromptPay ส่วนที่เหลือ (2 แถวใน payments)
--   รอบที่ 1, 5, 9, 13 = มีค่าปรับเนื้อเหลือ / รอบที่ 7 = มีส่วนลด 100 บาท (Manager อนุมัติ)
--   ทำตามลำดับเวลาเก่า → ใหม่ เพื่อให้ balance_after ใน stock_movements เรียงถูกต้อง
-- ============================================================
DO $$
DECLARE
    -- ผู้ใช้อ้างอิงตามตำแหน่ง (ตรวจแล้วในขั้นที่ 1)
    v_cashier_id   UUID := (SELECT id FROM profiles WHERE role = 'cashier' ORDER BY created_at LIMIT 1);
    v_manager_id   UUID := (SELECT id FROM profiles WHERE role = 'manager' ORDER BY created_at LIMIT 1);
    v_staff_id     UUID := (SELECT id FROM profiles WHERE role = 'staff'   ORDER BY created_at LIMIT 1);
    v_package      packages%ROWTYPE;
    v_penalty_rate NUMERIC(10,2) := COALESCE((SELECT value::numeric FROM app_settings WHERE key = 'penalty_rate_per_100g'), 100);
    v_slot_times   CONSTANT TEXT[] := ARRAY['11:30', '18:00', '20:15'];

    v_days_ago     INT;
    v_slot         INT;
    v_round        INT := 0;   -- ลำดับรอบประวัติ 1..15
    v_started_at   TIMESTAMPTZ;
    v_ordered_at   TIMESTAMPTZ;
    v_paid_at      TIMESTAMPTZ;
    v_closed_at    TIMESTAMPTZ;
    v_date_code    TEXT;       -- YYYYMMDD ตามเวลาไทย ใช้ในเลขออเดอร์/เลขบิล
    v_session_id   UUID;
    v_order_id     UUID;
    v_bill_id      UUID;
    v_table_id     UUID;
    v_adults       INT;
    v_children     INT;
    v_weight_grams INT;
    v_buffet       NUMERIC(10,2);
    v_extra        NUMERIC(10,2);
    v_penalty      NUMERIC(10,2);
    v_discount     NUMERIC(10,2);
    v_discount_reason TEXT;
    v_total        NUMERIC(10,2);
BEGIN
    SELECT * INTO v_package FROM packages WHERE id = '10000000-0000-4000-8000-000000000001';

    FOR v_days_ago IN REVERSE 7..1 LOOP
        FOR v_slot IN 1..(CASE WHEN v_days_ago = 7 THEN 3 ELSE 2 END) LOOP
            v_round := v_round + 1;

            -- เวลาเริ่มรอบ = เที่ยงคืนเวลาไทยของวันนั้น + เวลาช่วง + ขยับนาทีเล็กน้อยให้ไม่ซ้ำกัน
            v_started_at := (date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok')
                             - make_interval(days => v_days_ago)
                             + v_slot_times[v_slot]::interval
                             + make_interval(mins => v_days_ago * 3)) AT TIME ZONE 'Asia/Bangkok';
            v_ordered_at := v_started_at + interval '10 minutes';
            v_paid_at    := v_started_at + interval '94 minutes';
            v_closed_at  := v_started_at + interval '95 minutes';
            v_date_code  := to_char(v_started_at AT TIME ZONE 'Asia/Bangkok', 'YYYYMMDD');

            v_adults   := 1 + v_round % 4;   -- 1-4 คน
            v_children := v_round % 3;       -- 0-2 คน
            v_session_id := format('a2000000-0000-4000-8000-%s', lpad((100 + v_round)::text, 12, '0'))::uuid;
            v_order_id   := format('a4000000-0000-4000-8000-%s', lpad((100 + v_round)::text, 12, '0'))::uuid;
            v_bill_id    := format('a8000000-0000-4000-8000-%s', lpad((100 + v_round)::text, 12, '0'))::uuid;
            SELECT id INTO v_table_id FROM dining_tables WHERE table_number = 'T0' || (4 + v_round % 5);  -- T04-T08

            -- Session ปิดแล้ว (INSERT ตรงๆ ได้ เพราะ Trigger ล็อก Snapshot ทำงานเฉพาะ UPDATE)
            INSERT INTO sessions (id, package_id, status, adult_guest_count, child_guest_count,
                                  adult_price_snapshot, child_price_snapshot, duration_minutes_snapshot,
                                  guest_count_locked_at, package_price_locked_at, started_at, expires_at, closed_at,
                                  created_by, created_at)
            VALUES (v_session_id, v_package.id, 'closed', v_adults, v_children,
                    v_package.adult_price, v_package.child_price, v_package.duration_minutes,
                    v_started_at, v_started_at, v_started_at,
                    v_started_at + make_interval(mins => v_package.duration_minutes), v_closed_at,
                    v_cashier_id, v_started_at - interval '2 minutes')
            ON CONFLICT (id) DO NOTHING;

            -- ผูกโต๊ะแบบปล่อยแล้ว (is_active = false) — ไม่กระทบสถานะโต๊ะปัจจุบัน
            INSERT INTO session_tables (id, session_id, table_id, is_active, assigned_at, released_at)
            VALUES (format('af000000-0000-4000-8000-%s', lpad((100 + v_round)::text, 12, '0'))::uuid,
                    v_session_id, v_table_id, false, v_started_at, v_closed_at)
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO orders (id, session_id, order_number, order_source, created_at)
            VALUES (v_order_id, v_session_id, 'ORD-' || v_date_code || '-' || lpad(v_slot::text, 3, '0'),
                    'customer_qr', v_ordered_at)
            ON CONFLICT (id) DO NOTHING;

            -- รายการอาหาร: บางเมนูสั่งเฉพาะบางรอบ เพื่อให้ "เมนูขายดี" มีอันดับต่างกัน
            INSERT INTO order_items (id, order_id, menu_item_id, quantity, unit_price_snapshot, status, created_at)
            SELECT format('a5000000-0000-4000-8000-%s', lpad((v_round * 100 + item.line_no)::text, 12, '0'))::uuid,
                   v_order_id, item.menu_item_id, item.quantity, menu.extra_price, 'pending', v_ordered_at
            FROM (VALUES
                (1, '50000000-0000-4000-8000-000000000001'::uuid, v_adults,         true),               -- หมูสันคอ
                (2, '50000000-0000-4000-8000-000000000002'::uuid, 1 + v_round % 2,  true),               -- เนื้อวัว
                (3, '50000000-0000-4000-8000-000000000006'::uuid, 1,                true),               -- ผักรวม
                (4, '50000000-0000-4000-8000-000000000004'::uuid, 1,                v_round % 3 = 0),    -- กุ้ง
                (5, '50000000-0000-4000-8000-000000000005'::uuid, 1,                v_round % 4 = 0),    -- วากิว (สั่งเพิ่ม)
                (6, '50000000-0000-4000-8000-000000000009'::uuid, 2,                v_round % 5 = 0)     -- ลูกชิ้นหมู
            ) AS item(line_no, menu_item_id, quantity, is_ordered)
            JOIN menu_items AS menu ON menu.id = item.menu_item_id
            WHERE item.is_ordered
            ON CONFLICT (id) DO NOTHING;

            -- ผ่าน Trigger ตัดสต็อกจริง แล้วเสิร์ฟ
            UPDATE order_items SET status = 'cooking' WHERE order_id = v_order_id AND status = 'pending';
            UPDATE order_items SET status = 'served'  WHERE order_id = v_order_id AND status = 'cooking';

            -- ย้อนเวลา stock_movements ให้ตรงกับเวลาที่ครัวรับออเดอร์จริง (เพื่อรายงานสต็อก)
            UPDATE stock_movements
            SET created_at = v_ordered_at + interval '3 minutes'
            WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = v_order_id);

            -- คำนวณบิลตามสูตร SRS: ค่าบุฟเฟต์ + สั่งเพิ่ม + ค่าปรับเนื้อเหลือ − ส่วนลด (VAT ถอดในโดย Trigger)
            v_buffet := v_adults * v_package.adult_price + v_children * v_package.child_price;
            SELECT COALESCE(SUM(quantity * unit_price_snapshot), 0) INTO v_extra
            FROM order_items WHERE order_id = v_order_id AND status <> 'cancelled';

            v_penalty := 0;
            IF v_round % 4 = 1 THEN
                v_weight_grams := 50 + v_round * 20;   -- 70 / 150 / 230 / 310 กรัม
                INSERT INTO leftover_records (id, session_id, weight_grams, penalty_rate_per_100g, weighed_by, created_at)
                VALUES (format('a7000000-0000-4000-8000-%s', lpad((100 + v_round)::text, 12, '0'))::uuid,
                        v_session_id, v_weight_grams, v_penalty_rate, v_staff_id, v_started_at + interval '91 minutes')
                ON CONFLICT (id) DO NOTHING
                RETURNING penalty_amount INTO v_penalty;   -- Trigger คำนวณ CEIL(g/100) × อัตรา
                v_penalty := COALESCE(v_penalty, 0);
            END IF;

            v_discount := 0;
            v_discount_reason := NULL;
            IF v_round = 7 THEN
                v_discount := 100;
                v_discount_reason := 'ชดเชยอาหารออกล่าช้า';
            END IF;

            v_total := v_buffet + v_extra + v_penalty - v_discount;

            INSERT INTO bills (id, session_id, bill_number, buffet_subtotal, extra_items_subtotal,
                               leftover_penalty_subtotal, discount_amount, discount_reason, discount_approved_by,
                               total_amount, status, created_at, paid_at)
            VALUES (v_bill_id, v_session_id, 'INV-' || v_date_code || '-' || lpad(v_slot::text, 3, '0'),
                    v_buffet, v_extra, v_penalty, v_discount, v_discount_reason,
                    CASE WHEN v_discount > 0 THEN v_manager_id END,
                    v_total, 'paid', v_started_at + interval '92 minutes', v_paid_at)
            ON CONFLICT (id) DO NOTHING;

            UPDATE leftover_records SET bill_id = v_bill_id WHERE session_id = v_session_id;

            -- รายการในใบเสร็จ (item_type ตาม Data Dictionary 5.2)
            INSERT INTO bill_items (id, bill_id, item_type, description, quantity, unit_price, total_price)
            SELECT format('a9000000-0000-4000-8000-%s', lpad((v_round * 100 + line.line_no)::text, 12, '0'))::uuid,
                   v_bill_id, line.item_type, line.description, line.quantity, line.unit_price, line.total_price
            FROM (
                SELECT 1::bigint AS line_no, 'buffet_adult' AS item_type, 'บุฟเฟต์ผู้ใหญ่ x ' || v_adults AS description,
                       v_adults::numeric AS quantity, v_package.adult_price AS unit_price, v_adults * v_package.adult_price AS total_price
                UNION ALL
                SELECT 2, 'buffet_child', 'บุฟเฟต์เด็ก (ต่ำกว่า 120 ซม.) x ' || v_children,
                       v_children, v_package.child_price, v_children * v_package.child_price
                WHERE v_children > 0
                UNION ALL
                SELECT 10 + row_number() OVER (ORDER BY oi.id), 'extra_item', menu.name || ' x ' || oi.quantity,
                       oi.quantity, oi.unit_price_snapshot, oi.quantity * oi.unit_price_snapshot
                FROM order_items AS oi JOIN menu_items AS menu ON menu.id = oi.menu_item_id
                WHERE oi.order_id = v_order_id AND oi.unit_price_snapshot > 0 AND oi.status <> 'cancelled'
                UNION ALL
                SELECT 30, 'leftover_penalty', 'ค่าปรับเนื้อเหลือ ' || v_weight_grams || ' กรัม', 1, v_penalty, v_penalty
                WHERE v_penalty > 0
                UNION ALL
                SELECT 40, 'discount', 'ส่วนลด: ' || v_discount_reason, 1, -v_discount, -v_discount
                WHERE v_discount > 0
            ) AS line
            ON CONFLICT (id) DO NOTHING;

            -- การชำระเงิน (ผลรวม amount_paid = total_amount เสมอ)
            IF v_round = 10 THEN
                INSERT INTO payments (id, bill_id, payment_method, amount_paid, verified_by, verified_at, created_at) VALUES
                    (format('aa000000-0000-4000-8000-%s', lpad((v_round * 10 + 1)::text, 12, '0'))::uuid,
                     v_bill_id, 'cash', 500, v_cashier_id, v_paid_at, v_paid_at),
                    (format('aa000000-0000-4000-8000-%s', lpad((v_round * 10 + 2)::text, 12, '0'))::uuid,
                     v_bill_id, 'promptpay', v_total - 500, v_cashier_id, v_paid_at, v_paid_at)
                ON CONFLICT (id) DO NOTHING;
            ELSE
                INSERT INTO payments (id, bill_id, payment_method, amount_paid, verified_by, verified_at, created_at)
                VALUES (format('aa000000-0000-4000-8000-%s', lpad((v_round * 10 + 1)::text, 12, '0'))::uuid,
                        v_bill_id,
                        ((ARRAY['cash', 'promptpay', 'credit_card'])[1 + v_round % 3])::payment_method,
                        v_total, v_cashier_id, v_paid_at, v_paid_at)
                ON CONFLICT (id) DO NOTHING;
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- ============================================================
-- ขั้นที่ 5: คิวหน้าร้าน 3 รายการ (waiting / called / seated)
--   เลขคิว: A = โต๊ะเล็ก (1-2), B = กลาง (3-4), C = ใหญ่ (5+)
-- ============================================================
--   B01 = ผู้ใหญ่ 2 เด็ก 1 ตรงกับ Session A (T01) ที่เปิดจากคิวนี้
INSERT INTO queues (id, queue_number, guest_count, adult_count, child_count, table_size, status, phone_number, called_at, seated_at, created_at) VALUES
    ('a1000000-0000-4000-8000-000000000001', 'B01', 3, 2, 1, 'medium', 'seated',  NULL,         now() - interval '5 minutes', now(), now() - interval '30 minutes'),
    ('a1000000-0000-4000-8000-000000000002', 'A01', 2, 2, 0, 'small',  'called',  NULL,         now() - interval '2 minutes', NULL,  now() - interval '20 minutes'),
    ('a1000000-0000-4000-8000-000000000003', 'C01', 6, 4, 2, 'large',  'waiting', '0800000000', NULL,                         NULL,  now() - interval '8 minutes')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ขั้นที่ 6: Session ปัจจุบัน 3 โต๊ะ
--   A (T01): active ผู้ใหญ่ 2 เด็ก 1 เริ่มตอนนี้ หมดเวลาอีก 90 นาที
--   B (T02): active ผู้ใหญ่ 4 เริ่มมา 85 นาที → หมดเวลาในอีก 5 นาที (ทดสอบตัวจับเวลา)
--   C (T03): billed ผู้ใหญ่ 3 เด็ก 2 หมดเวลาแล้ว ออกบิลแล้วรอชำระ (ทดสอบหน้าแคชเชียร์)
--   Snapshot ราคา/เวลาดึงจาก packages; locked_at = started_at (INSERT ไม่ผ่าน Trigger ล็อก)
-- ============================================================
INSERT INTO sessions (id, package_id, status, adult_guest_count, child_guest_count,
                      adult_price_snapshot, child_price_snapshot, duration_minutes_snapshot,
                      guest_count_locked_at, package_price_locked_at, started_at, expires_at,
                      created_by, created_at)
SELECT plan.id::uuid, pkg.id, plan.status::session_status, plan.adults, plan.children,
       pkg.adult_price, pkg.child_price, pkg.duration_minutes,
       now() - plan.started_ago, now() - plan.started_ago, now() - plan.started_ago,
       now() - plan.started_ago + make_interval(mins => pkg.duration_minutes),
       (SELECT id FROM profiles WHERE role = 'cashier' ORDER BY created_at LIMIT 1),
       now() - plan.started_ago - interval '2 minutes'
FROM packages AS pkg
CROSS JOIN (VALUES
    ('a2000000-0000-4000-8000-000000000001', 'active', 2, 1, interval '0 minutes'),    -- A
    ('a2000000-0000-4000-8000-000000000002', 'active', 4, 0, interval '85 minutes'),   -- B
    ('a2000000-0000-4000-8000-000000000003', 'billed', 3, 2, interval '100 minutes')   -- C
) AS plan(id, status, adults, children, started_ago)
WHERE pkg.id = '10000000-0000-4000-8000-000000000001'
ON CONFLICT (id) DO NOTHING;

-- ผูกโต๊ะ (is_active = true) → Trigger fn_sync_table_status_on_assign เปลี่ยนโต๊ะเป็น occupied
INSERT INTO session_tables (id, session_id, table_id, is_active, assigned_at)
SELECT link.id::uuid, link.session_id::uuid, dining_table.id, true, session.started_at
FROM (VALUES
    ('af000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'T01'),
    ('af000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'T02'),
    ('af000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000003', 'T03')
) AS link(id, session_id, table_number)
JOIN dining_tables AS dining_table ON dining_table.table_number = link.table_number
JOIN sessions AS session ON session.id = link.session_id::uuid
ON CONFLICT (id) DO NOTHING;

-- QR Token: เก็บเฉพาะ SHA-256 (hex) ของ token จริง; expires_at = NULL (ใช้ is_revoked อย่างเดียว)
INSERT INTO qr_access_tokens (id, session_id, token_hash, is_revoked, expires_at)
SELECT token.id::uuid, token.session_id::uuid, encode(digest(token.plain_token, 'sha256'), 'hex'), false, NULL
FROM (VALUES
    ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'demo-token-t01'),
    ('a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'demo-token-t02'),
    ('a3000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000003', 'demo-token-t03')
) AS token(id, session_id, plain_token)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ขั้นที่ 7: ออเดอร์ของ Session ปัจจุบัน (ลูกค้าสั่งเองผ่าน QR: order_source = customer_qr)
-- ============================================================
INSERT INTO orders (id, session_id, order_number, order_source, created_at)
SELECT batch.id::uuid, batch.session_id::uuid,
       'ORD-' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYYYMMDD') || '-' || batch.sequence_no,
       'customer_qr', now() - batch.ordered_ago
FROM (VALUES
    ('a4000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000003', '001', interval '95 minutes'),  -- C รอบ 1
    ('a4000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000002', '002', interval '80 minutes'),  -- B รอบ 1
    ('a4000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000002', '003', interval '20 minutes'),  -- B รอบ 2
    ('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', '004', interval '0 minutes'),   -- A รอบ 1
    ('a4000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', '005', interval '0 minutes')    -- A รอบ 2
) AS batch(id, session_id, sequence_no, ordered_ago)
ON CONFLICT (id) DO NOTHING;

-- ทุกรายการเริ่มที่ pending (สถานะเริ่มต้น) แล้วค่อย UPDATE ด้านล่างเพื่อให้ Trigger ตัดสต็อกทำงาน
-- unit_price_snapshot = extra_price ของเมนู (0 สำหรับเมนูในบุฟเฟต์)
INSERT INTO order_items (id, order_id, menu_item_id, quantity, unit_price_snapshot, status, created_at)
SELECT item.id::uuid, item.order_id::uuid, menu.id, item.quantity, menu.extra_price, 'pending', parent_order.created_at
FROM (VALUES
    -- C รอบ 1 (ทั้งหมด → served)
    ('a5000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000001', 3),  -- หมูสันคอ
    ('a5000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000002', 2),  -- เนื้อวัว
    ('a5000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000006', 2),  -- ผักรวม
    ('a5000000-0000-4000-8000-000000000004', 'a4000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005', 1),  -- วากิว (สั่งเพิ่ม 159)
    -- B รอบ 1 (ทั้งหมด → served)
    ('a5000000-0000-4000-8000-000000000005', 'a4000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000001', 3),  -- หมูสันคอ
    ('a5000000-0000-4000-8000-000000000006', 'a4000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000002', 2),  -- เนื้อวัว + น้ำจิ้มสุกี้
    ('a5000000-0000-4000-8000-000000000007', 'a4000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000007', 1),  -- เห็ดเข็มทอง
    -- B รอบ 2 (รอนาน 20 นาที — ทดสอบสีเตือน KDS)
    ('a5000000-0000-4000-8000-000000000008', 'a4000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', 2),  -- กุ้ง → cooking
    ('a5000000-0000-4000-8000-000000000009', 'a4000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000003', 2),  -- หมูสามชั้นย่าง → cooking → cancelled (คืนสต็อก)
    ('a5000000-0000-4000-8000-000000000010', 'a4000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000006', 1),  -- ผักรวม → pending
    ('a5000000-0000-4000-8000-000000000011', 'a4000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000009', 2),  -- ลูกชิ้นหมู → cooking
    -- A รอบ 1 (ทั้งหมด → served)
    ('a5000000-0000-4000-8000-000000000012', 'a4000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 2),  -- หมูสันคอ
    ('a5000000-0000-4000-8000-000000000013', 'a4000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 1),  -- เนื้อวัว + น้ำจิ้มงา
    ('a5000000-0000-4000-8000-000000000014', 'a4000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000006', 1),  -- ผักรวม
    -- A รอบ 2
    ('a5000000-0000-4000-8000-000000000015', 'a4000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000003', 1),  -- หมูสามชั้นย่าง + เผ็ดน้อย → cooking
    ('a5000000-0000-4000-8000-000000000016', 'a4000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000009', 1),  -- ลูกชิ้นหมู → pending
    ('a5000000-0000-4000-8000-000000000017', 'a4000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000010', 2),  -- เต้าหู้ปลาทอด → pending (ครัวร้อน)
    ('a5000000-0000-4000-8000-000000000018', 'a4000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 1)   -- กุ้ง → cancelled จาก pending
) AS item(id, order_id, menu_item_id, quantity)
JOIN menu_items AS menu ON menu.id = item.menu_item_id::uuid
JOIN orders AS parent_order ON parent_order.id = item.order_id::uuid
ON CONFLICT (id) DO NOTHING;

-- ตัวเลือกที่ลูกค้าเลือก (ราคาเพิ่ม snapshot จาก menu_item_options)
INSERT INTO order_item_options (id, order_item_id, menu_item_option_id, option_price_snapshot)
SELECT chosen.id::uuid, chosen.order_item_id::uuid, menu_option.id, menu_option.additional_price
FROM (VALUES
    ('a6000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000006', '60000000-0000-4000-8000-000000000001'),  -- B: น้ำจิ้มสุกี้
    ('a6000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000013', '60000000-0000-4000-8000-000000000002'),  -- A: น้ำจิ้มงา
    ('a6000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000015', '60000000-0000-4000-8000-000000000005')   -- A: เผ็ดน้อย
) AS chosen(id, order_item_id, option_id)
JOIN menu_item_options AS menu_option ON menu_option.id = chosen.option_id::uuid
ON CONFLICT (id) DO NOTHING;

-- ---------- เปลี่ยนสถานะตามลำดับเวลา (Trigger ตัดสต็อกเมื่อ pending → cooking) ----------

-- C รอบ 1: cooking → served
UPDATE order_items SET status = 'cooking' WHERE order_id = 'a4000000-0000-4000-8000-000000000005' AND status = 'pending';
UPDATE order_items SET status = 'served'  WHERE order_id = 'a4000000-0000-4000-8000-000000000005' AND status = 'cooking';

-- B รอบ 1: cooking → served
UPDATE order_items SET status = 'cooking' WHERE order_id = 'a4000000-0000-4000-8000-000000000003' AND status = 'pending';
UPDATE order_items SET status = 'served'  WHERE order_id = 'a4000000-0000-4000-8000-000000000003' AND status = 'cooking';

-- B รอบ 2: กุ้ง, หมูสามชั้น, ลูกชิ้น → cooking (ผักรวมค้าง pending)
UPDATE order_items SET status = 'cooking'
WHERE id IN ('a5000000-0000-4000-8000-000000000008',
             'a5000000-0000-4000-8000-000000000009',
             'a5000000-0000-4000-8000-000000000011')
  AND status = 'pending';

-- B รอบ 2: ครัวยกเลิกหมูสามชั้นย่างที่กำลังทำ (FR-048) → คืนสต็อกตาม BOM เป็น cancel_return
-- ถ้ายังไม่ได้รัน migration 002 (ไม่มี Trigger คืนสต็อก) จะบันทึกการคืนสต็อกเองตรงนี้
DO $$
DECLARE
    v_kitchen_id   UUID := (SELECT id FROM profiles WHERE role = 'kitchen' ORDER BY created_at LIMIT 1);
    v_cancelled_at TIMESTAMPTZ := now() - interval '15 minutes';
    v_item         order_items%ROWTYPE;
    v_recipe       RECORD;
    v_return_qty   NUMERIC(12,3);
    v_new_stock    NUMERIC(12,3);
BEGIN
    UPDATE order_items
    SET status = 'cancelled',
        cancelled_by = v_kitchen_id,
        cancelled_reason = 'ลูกค้าขอเปลี่ยนเมนู (ครัวยกเลิกระหว่างทำ)',
        cancelled_at = v_cancelled_at
    WHERE id = 'a5000000-0000-4000-8000-000000000009' AND status = 'cooking'
    RETURNING * INTO v_item;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบรายการหมูสามชั้นย่างของโต๊ะ T02 ในสถานะ cooking — ยกเลิกเพื่อคืนสต็อกไม่ได้';
    END IF;

    -- ถ้ารัน migration 002 แล้ว Trigger fn_return_stock_on_cancel จะคืนสต็อกให้เอง
    -- → แค่ย้อนเวลาของ movement ให้ตรงกับเวลายกเลิก แล้วจบ (กันคืนสต็อกซ้ำ 2 รอบ)
    IF EXISTS (SELECT 1 FROM stock_movements
               WHERE order_item_id = v_item.id AND movement_type = 'cancel_return') THEN
        UPDATE stock_movements SET created_at = v_cancelled_at
        WHERE order_item_id = v_item.id AND movement_type = 'cancel_return';
        RETURN;
    END IF;

    -- ยังไม่ได้รัน migration 002: คืนสต็อกเองตาม BOM
    FOR v_recipe IN
        SELECT ingredient_id, quantity_required FROM menu_ingredients WHERE menu_item_id = v_item.menu_item_id
    LOOP
        v_return_qty := v_recipe.quantity_required * v_item.quantity;

        UPDATE ingredients SET current_stock = current_stock + v_return_qty
        WHERE id = v_recipe.ingredient_id
        RETURNING current_stock INTO v_new_stock;

        INSERT INTO stock_movements (ingredient_id, order_item_id, movement_type, quantity, balance_after, reason, created_by, created_at)
        VALUES (v_recipe.ingredient_id, v_item.id, 'cancel_return', v_return_qty, v_new_stock,
                'คืนสต็อกจากการยกเลิกรายการ: ' || v_item.id, v_kitchen_id, v_cancelled_at);
    END LOOP;
END $$;

-- A รอบ 1: cooking → served
UPDATE order_items SET status = 'cooking' WHERE order_id = 'a4000000-0000-4000-8000-000000000001' AND status = 'pending';
UPDATE order_items SET status = 'served'  WHERE order_id = 'a4000000-0000-4000-8000-000000000001' AND status = 'cooking';

-- A รอบ 2: หมูสามชั้นย่าง → cooking
UPDATE order_items SET status = 'cooking' WHERE id = 'a5000000-0000-4000-8000-000000000015' AND status = 'pending';

-- A รอบ 2: Staff ยกเลิกกุ้งที่ยัง pending (FR-047 ยังไม่ตัดสต็อก ไม่ต้องคืน)
UPDATE order_items
SET status = 'cancelled',
    cancelled_by = (SELECT id FROM profiles WHERE role = 'staff' ORDER BY created_at LIMIT 1),
    cancelled_reason = 'ลูกค้ากดสั่งซ้ำ ขอยกเลิก 1 รายการ',
    cancelled_at = now()
WHERE id = 'a5000000-0000-4000-8000-000000000018' AND status = 'pending';

-- ย้อนเวลา stock_movements (ตัดสต็อก) ให้ตรงกับช่วงที่ครัวรับออเดอร์ (ไม่เกินเวลาปัจจุบัน)
UPDATE stock_movements AS movement
SET created_at = LEAST(oi.created_at + interval '2 minutes', now())
FROM order_items AS oi
WHERE movement.order_item_id = oi.id
  AND movement.movement_type = 'actual_consumption'
  AND oi.order_id IN ('a4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002',
                      'a4000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000004',
                      'a4000000-0000-4000-8000-000000000005');

-- ============================================================
-- ขั้นที่ 8: Session C — ชั่งเนื้อเหลือ + บิลรอชำระ (unpaid)
--   สูตร SRS: total = บุฟเฟต์ (Snapshot) + สั่งเพิ่ม + ค่าปรับเนื้อเหลือ − ส่วนลด
--   ค่าที่คาดไว้: 3×299 + 2×149 = 1,195 | วากิว 159 | เนื้อเหลือ 250 g → 300
--                 total = 1,654.00 | VAT ถอดใน (Trigger) = 108.21
-- ============================================================
INSERT INTO leftover_records (id, session_id, weight_grams, penalty_rate_per_100g, weighed_by, created_at)
VALUES ('a7000000-0000-4000-8000-000000000003',
        'a2000000-0000-4000-8000-000000000003',
        250,
        COALESCE((SELECT value::numeric FROM app_settings WHERE key = 'penalty_rate_per_100g'), 100),
        (SELECT id FROM profiles WHERE role = 'staff' ORDER BY created_at LIMIT 1),
        now() - interval '8 minutes')
ON CONFLICT (id) DO NOTHING;
-- penalty_amount คำนวณโดย Trigger fn_calc_leftover_penalty

INSERT INTO bills (id, session_id, bill_number, buffet_subtotal, extra_items_subtotal,
                   leftover_penalty_subtotal, discount_amount, total_amount, status, created_at)
SELECT 'a8000000-0000-4000-8000-000000000003',
       session.id,
       'INV-' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYYYMMDD') || '-001',
       buffet.amount,
       extra.amount,
       leftover.penalty_amount,
       0,
       buffet.amount + extra.amount + leftover.penalty_amount - 0,
       'unpaid',
       now() - interval '3 minutes'
FROM sessions AS session
JOIN leftover_records AS leftover ON leftover.session_id = session.id
CROSS JOIN LATERAL (
    SELECT session.adult_guest_count * session.adult_price_snapshot
         + session.child_guest_count * session.child_price_snapshot AS amount
) AS buffet
CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(oi.quantity * oi.unit_price_snapshot), 0) AS amount
    FROM orders AS o JOIN order_items AS oi ON oi.order_id = o.id
    WHERE o.session_id = session.id AND oi.status <> 'cancelled'
) AS extra
WHERE session.id = 'a2000000-0000-4000-8000-000000000003'
ON CONFLICT (id) DO NOTHING;

UPDATE leftover_records SET bill_id = 'a8000000-0000-4000-8000-000000000003'
WHERE session_id = 'a2000000-0000-4000-8000-000000000003';

INSERT INTO bill_items (id, bill_id, item_type, description, quantity, unit_price, total_price)
SELECT line.id::uuid, 'a8000000-0000-4000-8000-000000000003', line.item_type, line.description,
       line.quantity, line.unit_price, line.quantity * line.unit_price
FROM (
    SELECT 'a9000000-0000-4000-8000-000000000001' AS id, 'buffet_adult' AS item_type,
           'บุฟเฟต์ผู้ใหญ่ x ' || s.adult_guest_count AS description,
           s.adult_guest_count::numeric AS quantity, s.adult_price_snapshot AS unit_price
    FROM sessions AS s WHERE s.id = 'a2000000-0000-4000-8000-000000000003'
    UNION ALL
    SELECT 'a9000000-0000-4000-8000-000000000002', 'buffet_child',
           'บุฟเฟต์เด็ก (ต่ำกว่า 120 ซม.) x ' || s.child_guest_count,
           s.child_guest_count, s.child_price_snapshot
    FROM sessions AS s WHERE s.id = 'a2000000-0000-4000-8000-000000000003'
    UNION ALL
    SELECT 'a9000000-0000-4000-8000-000000000003', 'extra_item',
           menu.name || ' x ' || oi.quantity, oi.quantity, oi.unit_price_snapshot
    FROM order_items AS oi JOIN menu_items AS menu ON menu.id = oi.menu_item_id
    WHERE oi.id = 'a5000000-0000-4000-8000-000000000004'
    UNION ALL
    SELECT 'a9000000-0000-4000-8000-000000000004', 'leftover_penalty',
           'ค่าปรับเนื้อเหลือ ' || lr.weight_grams || ' กรัม', 1, lr.penalty_amount
    FROM leftover_records AS lr WHERE lr.session_id = 'a2000000-0000-4000-8000-000000000003'
) AS line
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ขั้นที่ 9: เรียกพนักงาน — 1 รอรับเรื่อง (T01) + 1 เสร็จแล้ว (T02)
-- ============================================================
INSERT INTO service_requests (id, table_id, session_id, request_type, status, handled_by, completed_at, created_at)
SELECT request.id::uuid, dining_table.id, request.session_id::uuid,
       request.request_type::service_request_type, request.status::service_request_status,
       CASE WHEN request.status = 'completed'
            THEN (SELECT id FROM profiles WHERE role = 'staff' ORDER BY created_at LIMIT 1) END,
       request.completed_at, request.created_at
FROM (VALUES
    ('ab000000-0000-4000-8000-000000000001', 'T01', 'a2000000-0000-4000-8000-000000000001', 'water',      'pending',   NULL::timestamptz,             now()),
    ('ab000000-0000-4000-8000-000000000002', 'T02', 'a2000000-0000-4000-8000-000000000002', 'change_pot', 'completed', now() - interval '30 minutes', now() - interval '35 minutes')
) AS request(id, table_number, session_id, request_type, status, completed_at, created_at)
JOIN dining_tables AS dining_table ON dining_table.table_number = request.table_number
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ขั้นที่ 10: ตรวจนับสต็อก 1 รอบ รออนุมัติ (pending_review) พร้อมผลต่าง
--   system_stock = ยอดในระบบ ณ ตอนนี้ (หลังตัดสต็อกทั้งหมดด้านบน)
--   discrepancy = counted_stock − system_stock
-- ============================================================
INSERT INTO stock_counts (id, count_date, status, counted_by, created_at)
VALUES ('ac000000-0000-4000-8000-000000000001',
        (now() AT TIME ZONE 'Asia/Bangkok')::date,
        'pending_review',
        (SELECT id FROM profiles WHERE role = 'manager' ORDER BY created_at LIMIT 1),
        now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO stock_count_items (id, stock_count_id, ingredient_id, system_stock, counted_stock, discrepancy, adjustment_reason)
SELECT counted.id::uuid,
       'ac000000-0000-4000-8000-000000000001',
       ingredient.id,
       ingredient.current_stock,
       GREATEST(ingredient.current_stock + counted.difference, 0),
       GREATEST(ingredient.current_stock + counted.difference, 0) - ingredient.current_stock,
       counted.reason
FROM (VALUES
    ('ad000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', -150, 'ตัดแต่งไขมันทิ้งระหว่างเตรียม ไม่ได้บันทึกของเสีย'),
    ('ad000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002',  -80, 'ทำหล่นระหว่างสไลซ์'),
    ('ad000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000006',  200, 'รับของเข้าแล้วยังไม่ได้บันทึกในระบบ'),
    ('ad000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000007',    0, NULL)
) AS counted(id, ingredient_id, difference, reason)
JOIN ingredients AS ingredient ON ingredient.id = counted.ingredient_id::uuid
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ขั้นที่ 11: audit_logs ตัวอย่าง 5 แถว (Action ตาม Audit Matrix ส่วนที่ 1)
-- ============================================================
INSERT INTO audit_logs (id, actor_id, action, target_entity, target_id, payload_before, payload_after, reason, created_at)
SELECT log.id::uuid, profile.id, log.action, log.target_entity, log.target_id,
       log.payload_before, log.payload_after, log.reason, log.created_at
FROM (VALUES
    ('ae000000-0000-4000-8000-000000000001', 'kitchen', 'MANUAL_OFF_MENU', 'menu_items',
     '50000000-0000-4000-8000-000000000011',
     '{"availability_status": "available"}'::jsonb,
     '{"availability_status": "manual_off"}'::jsonb,
     'หม้อทอดชำรุด รอช่างซ่อม', now() - interval '3 hours'),
    ('ae000000-0000-4000-8000-000000000002', 'cashier', 'OPEN_SESSION', 'sessions',
     'a2000000-0000-4000-8000-000000000001',
     NULL,
     NULL,   -- เติม Snapshot จาก Session จริงด้านล่าง
     NULL, now()),
    ('ae000000-0000-4000-8000-000000000003', 'kitchen', 'CANCEL_ORDER_ITEM', 'order_items',
     'a5000000-0000-4000-8000-000000000009',
     '{"status": "cooking", "menu": "หมูสามชั้นย่าง", "quantity": 2}'::jsonb,
     '{"status": "cancelled", "stock_returned": true}'::jsonb,
     'ลูกค้าขอเปลี่ยนเมนู (ครัวยกเลิกระหว่างทำ)', now() - interval '15 minutes'),
    ('ae000000-0000-4000-8000-000000000004', 'staff', 'CANCEL_ORDER_ITEM', 'order_items',
     'a5000000-0000-4000-8000-000000000018',
     '{"status": "pending", "menu": "กุ้งขาว", "quantity": 1}'::jsonb,
     '{"status": "cancelled", "stock_returned": false}'::jsonb,
     'ลูกค้ากดสั่งซ้ำ ขอยกเลิก 1 รายการ', now()),
    ('ae000000-0000-4000-8000-000000000005', 'manager', 'APPROVE_DISCOUNT', 'bills',
     'a8000000-0000-4000-8000-000000000107',
     NULL, NULL,   -- เติมจากบิลจริงด้านล่าง
     'ชดเชยอาหารออกล่าช้า', now())
) AS log(id, actor_role, action, target_entity, target_id, payload_before, payload_after, reason, created_at)
JOIN LATERAL (
    SELECT id FROM profiles WHERE role = log.actor_role::user_role ORDER BY created_at LIMIT 1
) AS profile ON true
ON CONFLICT (id) DO NOTHING;

-- เติม payload ของ APPROVE_DISCOUNT จากบิลประวัติรอบที่ 7 (ยอดก่อนลด / ส่วนลด / ยอดสุทธิ)
UPDATE audit_logs AS log
SET payload_before = jsonb_build_object('total_before_discount', bill.total_amount + bill.discount_amount),
    payload_after  = jsonb_build_object('discount_amount', bill.discount_amount, 'total_amount', bill.total_amount),
    created_at     = bill.created_at
FROM bills AS bill
WHERE log.id = 'ae000000-0000-4000-8000-000000000005'
  AND bill.id = 'a8000000-0000-4000-8000-000000000107';

-- เติม payload ของ OPEN_SESSION จาก Snapshot ของ Session A จริง
UPDATE audit_logs AS log
SET payload_after = jsonb_build_object(
        'table',                     'T01',
        'adult_guest_count',         session.adult_guest_count,
        'child_guest_count',         session.child_guest_count,
        'adult_price_snapshot',      session.adult_price_snapshot,
        'child_price_snapshot',      session.child_price_snapshot,
        'duration_minutes_snapshot', session.duration_minutes_snapshot,
        'started_at',                session.started_at)
FROM sessions AS session
WHERE log.id = 'ae000000-0000-4000-8000-000000000002'
  AND session.id = 'a2000000-0000-4000-8000-000000000001';

-- ============================================================
-- ขั้นที่ 12: เก็บกวาด — คืนค่า JWT claim (LOCAL อยู่แล้ว แต่ล้างให้ชัดเจน)
-- ============================================================
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

COMMIT;

-- ============================================================
-- สรุปผล (อ่านอย่างเดียว) — แสดงเป็นผลลัพธ์สุดท้ายใน SQL Editor
-- ============================================================
SELECT 'โต๊ะ occupied (ควรเป็น T01,T02,T03)' AS check_item,
       string_agg(table_number, ',' ORDER BY table_number) AS result
FROM dining_tables WHERE status = 'occupied'
UNION ALL
SELECT 'Session (active/billed/closed)',
       count(*) FILTER (WHERE status = 'active') || ' / ' ||
       count(*) FILTER (WHERE status = 'billed') || ' / ' ||
       count(*) FILTER (WHERE status = 'closed')
FROM sessions
UNION ALL
SELECT 'order_items (pending/cooking/served/cancelled)',
       count(*) FILTER (WHERE status = 'pending') || ' / ' ||
       count(*) FILTER (WHERE status = 'cooking') || ' / ' ||
       count(*) FILTER (WHERE status = 'served')  || ' / ' ||
       count(*) FILTER (WHERE status = 'cancelled')
FROM order_items
UNION ALL
SELECT 'บิล T03 (ควรเป็น 1654.00 / VAT 108.21 / unpaid)',
       total_amount || ' / VAT ' || vat_amount || ' / ' || status
FROM bills WHERE id = 'a8000000-0000-4000-8000-000000000003'
UNION ALL
SELECT 'วัตถุดิบต่ำกว่าเกณฑ์',
       COALESCE(string_agg(name || ' ' || current_stock::int || '/' || minimum_threshold::int, ', '), '-')
FROM ingredients WHERE current_stock < minimum_threshold;
