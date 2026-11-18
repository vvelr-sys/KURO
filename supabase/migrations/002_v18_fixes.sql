-- ============================================================
-- KURO POS — Migration 002: แก้ schema ให้ตรงกับเอกสาร v1.8
-- ------------------------------------------------------------
-- ต้องรันหลัง 001_initial_schema.sql เท่านั้น
-- ไฟล์นี้ไม่แก้/ลบข้อมูลในตารางใดๆ เปลี่ยนเฉพาะ Policy, Function, Trigger และเพิ่ม Index 1 ตัว
-- รันซ้ำได้ (DROP ... IF EXISTS / CREATE OR REPLACE / IF NOT EXISTS) และอยู่ใน Transaction เดียว
--
-- สิ่งที่แก้:
--   1) ลูกค้าเห็นเมนูทุกสถานะ เพื่อแสดง "หมด" ได้ (กฎข้อ 7)
--   2) VAT อ่านอัตราจาก app_settings แทนการฝัง 7%
--   3) Trigger ตัดสต็อก: ไม่ใช้ UUID 0000… อีก (เดิมทำให้ FK พัง) → แจ้ง error ชัดเจนแทน
--   4) Trigger ใหม่: คืนสต็อกตาม BOM เมื่อยกเลิกรายการที่กำลังทำ (cooking → cancelled)
--   5) Trigger ใหม่: ตรวจยอดชำระรวม = ยอดบิล ก่อนเปลี่ยนบิลเป็น paid (รองรับแบ่งจ่าย)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) RLS: ลูกค้าเห็นเมนูทุกสถานะ (available / out_of_stock / manual_off)
--    เดิมเห็นเฉพาะ available ตามกฎเก่า "ซ่อนเมนูหมด" แต่ v1.8 ให้แสดงสถานะ "หมด" กดสั่งไม่ได้
--    (การกันไม่ให้สั่งเมนูที่หมด ต้องตรวจซ้ำในฝั่ง Server Action ตอนรับออเดอร์ด้วย)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "customer_view_active_menu" ON menu_items;
DROP POLICY IF EXISTS "customer_view_menu" ON menu_items;
CREATE POLICY "customer_view_menu" ON menu_items FOR SELECT USING (true);

-- ------------------------------------------------------------
-- 2) VAT แบบรวมในราคา (Inclusive) อ่านอัตราจาก app_settings.vat_rate_percent
--    สูตร: vat = ROUND(total × rate / (100 + rate), 2) → rate 7 ได้ผลเท่าสูตรเดิม total × 7 / 107
--    SECURITY DEFINER: แคชเชียร์อ่าน app_settings ไม่ได้ตาม RLS (เฉพาะ admin)
--    ถ้าไม่ใส่ ฟังก์ชันจะอ่านค่าไม่เจอแล้วใช้ 7% เงียบๆ
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_calc_bill_vat()
RETURNS TRIGGER AS $$
DECLARE
    v_vat_rate NUMERIC;
BEGIN
    v_vat_rate := COALESCE(
        (SELECT value::numeric FROM public.app_settings WHERE key = 'vat_rate_percent'),
        7
    );
    NEW.vat_amount := ROUND(NEW.total_amount * v_vat_rate / (100 + v_vat_rate), 2);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- Trigger trg_calc_bill_vat เดิมเรียกฟังก์ชันนี้อยู่แล้ว ไม่ต้องสร้างใหม่

-- ------------------------------------------------------------
-- 3) ตัดสต็อกเมื่อ pending → cooking (เหมือนเดิมทุกอย่าง ยกเว้นเรื่องผู้ทำรายการ)
--    เดิม: auth.uid() เป็น NULL → ใช้ cancelled_by → ใช้ UUID 0000… → FK ของ created_by พัง
--    ใหม่: บังคับให้เปลี่ยนสถานะผ่านผู้ใช้ที่ล็อกอิน (Server Action ต้องใช้ client ที่มี session ผู้ใช้
--          ไม่ใช่ service role) ถ้าไม่มี จะแจ้ง error ภาษาไทยที่อ่านเข้าใจ
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_deduct_stock_on_cooking()
RETURNS TRIGGER AS $$
DECLARE
    rec          RECORD;
    v_qty_needed NUMERIC(12,3);
    v_new_stock  NUMERIC(12,3);
    v_actor      UUID;
BEGIN
    IF OLD.status = 'pending' AND NEW.status = 'cooking' THEN
        v_actor := auth.uid();
        IF v_actor IS NULL THEN
            RAISE EXCEPTION 'เปลี่ยนสถานะเป็น cooking ไม่ได้: ไม่พบผู้ใช้ที่ล็อกอิน (auth.uid() เป็น NULL) — ต้องเรียกผ่าน client ที่มี session ของพนักงาน';
        END IF;

        FOR rec IN
            SELECT mi.ingredient_id, mi.quantity_required, i.current_stock
            FROM menu_ingredients mi
            JOIN ingredients i ON i.id = mi.ingredient_id
            WHERE mi.menu_item_id = NEW.menu_item_id
            FOR UPDATE OF i
        LOOP
            v_qty_needed := rec.quantity_required * NEW.quantity;

            IF rec.current_stock < v_qty_needed THEN
                RAISE EXCEPTION 'Insufficient stock for ingredient % (available: %, needed: %)',
                    rec.ingredient_id, rec.current_stock, v_qty_needed;
            END IF;

            v_new_stock := rec.current_stock - v_qty_needed;

            UPDATE ingredients SET current_stock = v_new_stock WHERE id = rec.ingredient_id;

            INSERT INTO stock_movements (ingredient_id, order_item_id, movement_type, quantity, balance_after, reason, created_by)
            VALUES (rec.ingredient_id, NEW.id, 'actual_consumption', -v_qty_needed, v_new_stock,
                    'Kitchen order cooking: ' || NEW.id, v_actor);
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- Trigger trg_deduct_stock_on_cooking เดิมเรียกฟังก์ชันนี้อยู่แล้ว ไม่ต้องสร้างใหม่

-- ------------------------------------------------------------
-- 4) คืนสต็อกตาม BOM เมื่อยกเลิกรายการที่ "กำลังทำ" (FR-048, cooking → cancelled)
--    รายการที่ยกเลิกจาก pending ยังไม่ถูกตัดสต็อก จึงไม่ต้องคืน (FR-047)
--    กันคืนซ้ำด้วย Unique Index แบบเดียวกับการตัดสต็อก
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_order_item_cancel_return
    ON stock_movements(order_item_id, ingredient_id)
    WHERE movement_type = 'cancel_return';

CREATE OR REPLACE FUNCTION fn_return_stock_on_cancel()
RETURNS TRIGGER AS $$
DECLARE
    rec          RECORD;
    v_return_qty NUMERIC(12,3);
    v_new_stock  NUMERIC(12,3);
    v_actor      UUID;
BEGIN
    IF OLD.status = 'cooking' AND NEW.status = 'cancelled' THEN
        -- ผู้ทำรายการ = ผู้ใช้ที่ล็อกอิน หรือผู้ยกเลิกที่บันทึกไว้ในแถว
        v_actor := COALESCE(auth.uid(), NEW.cancelled_by);
        IF v_actor IS NULL THEN
            RAISE EXCEPTION 'ยกเลิกรายการไม่ได้: ต้องระบุผู้ยกเลิก (cancelled_by) หรือทำผ่านผู้ใช้ที่ล็อกอิน';
        END IF;

        FOR rec IN
            SELECT ingredient_id, quantity_required
            FROM menu_ingredients
            WHERE menu_item_id = NEW.menu_item_id
        LOOP
            v_return_qty := rec.quantity_required * NEW.quantity;

            UPDATE ingredients
            SET current_stock = current_stock + v_return_qty
            WHERE id = rec.ingredient_id
            RETURNING current_stock INTO v_new_stock;

            INSERT INTO stock_movements (ingredient_id, order_item_id, movement_type, quantity, balance_after, reason, created_by)
            VALUES (rec.ingredient_id, NEW.id, 'cancel_return', v_return_qty, v_new_stock,
                    COALESCE(NEW.cancelled_reason, 'ยกเลิกรายการระหว่างทำ'), v_actor);
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_return_stock_on_cancel ON order_items;
CREATE TRIGGER trg_return_stock_on_cancel
AFTER UPDATE OF status ON order_items
FOR EACH ROW EXECUTE FUNCTION fn_return_stock_on_cancel();

-- ------------------------------------------------------------
-- 5) ตรวจยอดชำระก่อนปิดบิล: SUM(payments.amount_paid) ต้องเท่ากับ bills.total_amount
--    ตรวจตอนเปลี่ยน status เป็น paid (ไม่ตรวจตอนบันทึกการชำระแต่ละแถว เพราะแบ่งจ่ายจะไม่ผ่านแถวแรก)
--    หมายเหตุ: amount_paid = ยอดที่หักจากบิล ไม่ใช่เงินสดที่ลูกค้ายื่น (เงินทอนคำนวณบนหน้าจอ)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_check_bill_fully_paid()
RETURNS TRIGGER AS $$
DECLARE
    v_total_paid NUMERIC(10,2);
BEGIN
    IF NEW.status = 'paid' AND OLD.status <> 'paid' THEN
        SELECT COALESCE(SUM(amount_paid), 0) INTO v_total_paid
        FROM public.payments
        WHERE bill_id = NEW.id;

        IF v_total_paid <> NEW.total_amount THEN
            RAISE EXCEPTION 'ปิดบิลไม่ได้: ยอดชำระรวม % บาท ไม่เท่ากับยอดบิล % บาท', v_total_paid, NEW.total_amount;
        END IF;

        NEW.paid_at := COALESCE(NEW.paid_at, now());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_check_bill_fully_paid ON bills;
CREATE TRIGGER trg_check_bill_fully_paid
BEFORE UPDATE OF status ON bills
FOR EACH ROW EXECUTE FUNCTION fn_check_bill_fully_paid();

COMMIT;
