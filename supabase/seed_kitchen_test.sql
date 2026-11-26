-- ============================================================
-- KURO POS — ข้อมูลทดสอบจอครัว (KDS) แบบ "เพิ่มอย่างเดียว ไม่ลบของเดิม"
-- ------------------------------------------------------------
-- ใช้ทดสอบ: /kds (การ์ดออเดอร์, สีเตือนรอนาน, ปุ่มเริ่มทำ/เสิร์ฟ, ยกเลิก, รวมรายการเตรียม)
--
-- สิ่งที่ไฟล์นี้ทำ:
--   1) ถ้ายังไม่มีโต๊ะที่มีลูกค้า → เปิดรอบทดสอบ 3 โต๊ะจากโต๊ะที่ว่าง (ผู้ใหญ่ 2-4 คน)
--   2) ใส่ออเดอร์ใหม่ 3 ใบ ให้โต๊ะที่มีลูกค้า (สูงสุด 3 โต๊ะ)
--        ใบที่ 1 สั่งเมื่อ 1 นาทีที่แล้ว  → การ์ดสีปกติ
--        ใบที่ 2 สั่งเมื่อ 10 นาทีที่แล้ว → การ์ดสีส้ม (เตือน)
--        ใบที่ 3 สั่งเมื่อ 18 นาทีที่แล้ว → การ์ดสีแดง (เกินเกณฑ์)
--   3) ทุกรายการเป็น "รอทำ" (pending) → ยังไม่ตัดสต็อก ให้ไปกดเริ่มทำเองบนจอครัว
--
-- ไม่แตะ: เมนู, สต็อก, บิล, ประวัติ — รันซ้ำได้ (ได้ออเดอร์ชุดใหม่ทุกครั้ง)
-- ต้องมีก่อน: แพ็กเกจที่เปิดใช้งาน 1 ตัว, เมนูพร้อมขายอย่างน้อย 3 รายการ, บัญชี cashier
-- วิธีลบข้อมูลทดสอบ: ดูท้ายไฟล์
-- ============================================================

BEGIN;

DO $$
DECLARE
    v_cashier_id   UUID := (SELECT id FROM profiles WHERE role = 'cashier' AND is_active ORDER BY created_at LIMIT 1);
    v_package      packages%ROWTYPE;
    v_table        RECORD;
    v_session_ids  UUID[];
    v_session_id   UUID;
    v_order_id     UUID;
    v_menu_ids     UUID[];
    v_menu_count   INT;
    v_test_number  INT := 0;
    v_round        INT := 0;
    v_minutes_ago  INT[] := ARRAY[1, 10, 18];
    v_stamp        TEXT := to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYYYMMDDHH24MISS');
BEGIN
    IF v_cashier_id IS NULL THEN
        RAISE EXCEPTION 'ไม่พบบัญชี cashier ที่เปิดใช้งาน — สร้างบัญชีก่อน (หน้า /staff หรือ scripts/seed-users.mjs)';
    END IF;

    -- เมนูพร้อมขาย (สลับสถานี: ของสด / ปิ้งย่าง / ครัวร้อน / เครื่องดื่ม)
    SELECT array_agg(id ORDER BY kitchen_station, name) INTO v_menu_ids
    FROM menu_items WHERE availability_status = 'available';
    v_menu_count := coalesce(array_length(v_menu_ids, 1), 0);
    IF v_menu_count < 3 THEN
        RAISE EXCEPTION 'มีเมนูพร้อมขายแค่ % รายการ — ต้องมีอย่างน้อย 3 (เปิดขายที่หน้า /menu)', v_menu_count;
    END IF;

    -- โต๊ะที่มีลูกค้าอยู่แล้ว (active)
    SELECT array_agg(session.id ORDER BY session.started_at) INTO v_session_ids
    FROM sessions AS session
    WHERE session.status = 'active'
      AND EXISTS (SELECT 1 FROM session_tables AS link WHERE link.session_id = session.id AND link.is_active);

    -- ยังไม่มีเลย → เปิดรอบทดสอบ 3 โต๊ะจากโต๊ะว่าง
    IF v_session_ids IS NULL THEN
        IF (SELECT count(*) FROM packages WHERE is_active) <> 1 THEN
            RAISE EXCEPTION 'ต้องมีแพ็กเกจเปิดใช้งาน 1 รายการพอดี (ตั้งที่หน้า /packages)';
        END IF;
        SELECT * INTO v_package FROM packages WHERE is_active;

        FOR v_table IN
            SELECT id FROM dining_tables WHERE status = 'available' ORDER BY table_number LIMIT 3
        LOOP
            v_test_number := v_test_number + 1;
            INSERT INTO sessions (package_id, status, adult_guest_count, child_guest_count,
                                  adult_price_snapshot, child_price_snapshot, duration_minutes_snapshot,
                                  guest_count_locked_at, package_price_locked_at, started_at, expires_at, created_by)
            VALUES (v_package.id, 'active', 1 + v_test_number, 0,
                    v_package.adult_price, v_package.child_price, v_package.duration_minutes,
                    now() - interval '20 minutes', now() - interval '20 minutes', now() - interval '20 minutes',
                    now() - interval '20 minutes' + make_interval(mins => v_package.duration_minutes), v_cashier_id)
            RETURNING id INTO v_session_id;

            -- ผูกโต๊ะ → Trigger เปลี่ยนโต๊ะเป็น occupied ให้เอง
            INSERT INTO session_tables (session_id, table_id, is_active, assigned_at)
            VALUES (v_session_id, v_table.id, true, now() - interval '20 minutes');

            v_session_ids := array_append(v_session_ids, v_session_id);
        END LOOP;

        IF v_session_ids IS NULL THEN
            RAISE EXCEPTION 'ไม่มีโต๊ะว่างให้เปิดรอบทดสอบ — เคลียร์โต๊ะที่หน้า /tables ก่อน';
        END IF;
    END IF;

    -- ออเดอร์ 3 ใบ วนใส่ให้โต๊ะที่มีลูกค้า (เวลาสั่ง 1 / 10 / 18 นาทีที่แล้ว)
    FOR v_round IN 1..3 LOOP
        v_session_id := v_session_ids[1 + ((v_round - 1) % array_length(v_session_ids, 1))];

        INSERT INTO orders (session_id, order_number, order_source, created_at)
        VALUES (v_session_id, 'TEST-' || v_stamp || '-' || v_round, 'customer_qr',
                now() - make_interval(mins => v_minutes_ago[v_round]))
        RETURNING id INTO v_order_id;

        -- ใบละ 3-4 รายการ เลือกเมนูต่างกันในแต่ละใบ
        INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_snapshot, status, created_at)
        SELECT v_order_id, menu.id, 1 + (pick.position % 3), menu.extra_price, 'pending',
               now() - make_interval(mins => v_minutes_ago[v_round])
        FROM generate_series(0, 2 + (v_round % 2)) AS pick(position)
        JOIN menu_items AS menu
          ON menu.id = v_menu_ids[1 + ((pick.position + (v_round - 1) * 3) % v_menu_count)]
        ON CONFLICT DO NOTHING;
    END LOOP;

    RAISE NOTICE 'ใส่ออเดอร์ทดสอบ 3 ใบแล้ว (เลขออเดอร์ขึ้นต้น TEST-%) — เปิดหน้า /kds ได้เลย', v_stamp;
END $$;

COMMIT;

-- ============================================================
-- ลบข้อมูลทดสอบ (เลือกคลุมเฉพาะส่วนนี้แล้วกด Run)
-- ------------------------------------------------------------
-- ลบเฉพาะออเดอร์ที่เลขขึ้นต้น TEST- (รายการอาหารหายตาม)
-- ⚠️ รายการที่กด "เริ่มทำ" ไปแล้ว สต็อกถูกตัดไปแล้วและจะไม่คืน — ถ้าอยากได้คืน ให้กด "ยกเลิก" บนจอครัวก่อนลบ
--
-- DELETE FROM orders WHERE order_number LIKE 'TEST-%';
--
-- โต๊ะทดสอบที่ไฟล์นี้เปิดให้ ปิดได้ตามขั้นตอนปกติที่หน้า /tables และ /billing
-- ============================================================
