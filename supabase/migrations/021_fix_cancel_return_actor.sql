-- ============================================================
-- KURO POS — Migration 021: แก้ fn_return_stock_on_cancel ที่ 020 เขียนทับ 002
-- ------------------------------------------------------------
-- ต้องรันหลัง 020_kitchen_cancel_return_and_audit.sql
-- รันซ้ำได้ (CREATE OR REPLACE / DROP ... IF EXISTS) ไม่แก้ข้อมูลในตาราง
--
-- ปัญหาของ 020:
--   1) ถ้าไม่รู้ผู้ทำรายการ ใช้ UUID 0000… เป็น created_by → ไม่มีใน profiles → FK พัง
--      (002 เอาออกไปแล้ว แต่ 020 ใส่กลับมา)
--   2) ไม่มี SET search_path ในฟังก์ชัน SECURITY DEFINER (เสี่ยงถูกแทรก object ปลอม)
--
-- สิ่งที่คงไว้จาก 020 (ดีกว่า 002):
--   คืนสต็อกตาม "ยอดที่ถูกตัดจริง" ใน stock_movements (actual_consumption)
--   แทนการคำนวณจากสูตร BOM ปัจจุบัน — ถ้าสูตรถูกแก้ระหว่างนั้น ยอดคืนก็ยังถูก
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION fn_return_stock_on_cancel()
RETURNS TRIGGER AS $$
DECLARE
    rec         RECORD;
    v_new_stock NUMERIC(12,3);
    v_actor     UUID;
BEGIN
    IF OLD.status = 'cooking' AND NEW.status = 'cancelled' THEN
        -- ผู้ทำรายการ = ผู้ใช้ที่ล็อกอิน หรือผู้ยกเลิกที่บันทึกไว้ในแถว
        v_actor := COALESCE(auth.uid(), NEW.cancelled_by);
        IF v_actor IS NULL THEN
            RAISE EXCEPTION 'ยกเลิกรายการไม่ได้: ต้องระบุผู้ยกเลิก (cancelled_by) หรือทำผ่านผู้ใช้ที่ล็อกอิน';
        END IF;

        -- คืนตามยอดที่ตัดจริงของจานนี้ (รวมต่อวัตถุดิบ)
        FOR rec IN
            SELECT sm.ingredient_id, SUM(-sm.quantity) AS qty_to_return
            FROM public.stock_movements sm
            WHERE sm.order_item_id = NEW.id
              AND sm.movement_type = 'actual_consumption'
            GROUP BY sm.ingredient_id
        LOOP
            UPDATE public.ingredients
            SET current_stock = current_stock + rec.qty_to_return
            WHERE id = rec.ingredient_id
            RETURNING current_stock INTO v_new_stock;

            -- Unique Index idx_unique_order_item_cancel_return (จาก 002) กันคืนซ้ำ
            INSERT INTO public.stock_movements (
                ingredient_id, order_item_id, movement_type,
                quantity, balance_after, reason, created_by
            ) VALUES (
                rec.ingredient_id, NEW.id, 'cancel_return',
                rec.qty_to_return, v_new_stock,
                COALESCE(NEW.cancelled_reason, 'ยกเลิกรายการระหว่างทำ'), v_actor
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_return_stock_on_cancel ON order_items;
CREATE TRIGGER trg_return_stock_on_cancel
AFTER UPDATE OF status ON order_items
FOR EACH ROW EXECUTE FUNCTION fn_return_stock_on_cancel();

COMMIT;
