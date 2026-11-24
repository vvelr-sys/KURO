-- ============================================================
-- KURO POS — Migration 020: Kitchen cancel-return & audit insert
-- อ้างอิง: SRS FR-048 (ยกเลิก cooking คืนสต็อกตาม BOM), FR-050 (Audit Log ผู้ดำเนินการ)
-- ============================================================

-- ------------------------------------------------------------
-- 1. คืนสต็อกอัตโนมัติเมื่อรายการเปลี่ยนจาก 'cooking' -> 'cancelled'
--    คืนตามยอดที่ถูกตัดจริง (actual_consumption) ของรายการนั้น
--    ใช้ SECURITY DEFINER เพื่อให้ role kitchen คืนสต็อกได้ (RLS ingredients/stock_movements จำกัด manager/admin)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_return_stock_on_cancel()
RETURNS TRIGGER AS $$
DECLARE
    rec RECORD;
    v_new_stock NUMERIC(12,3);
    v_actor UUID;
BEGIN
    IF OLD.status = 'cooking' AND NEW.status = 'cancelled' THEN
        v_actor := COALESCE(auth.uid(), NEW.cancelled_by);

        FOR rec IN
            SELECT sm.ingredient_id, SUM(-sm.quantity) AS qty_to_return
            FROM stock_movements sm
            WHERE sm.order_item_id = NEW.id
              AND sm.movement_type = 'actual_consumption'
            GROUP BY sm.ingredient_id
        LOOP
            UPDATE ingredients
            SET current_stock = current_stock + rec.qty_to_return
            WHERE id = rec.ingredient_id
            RETURNING current_stock INTO v_new_stock;

            INSERT INTO stock_movements (
                ingredient_id,
                order_item_id,
                movement_type,
                quantity,
                balance_after,
                reason,
                created_by
            ) VALUES (
                rec.ingredient_id,
                NEW.id,
                'cancel_return',
                rec.qty_to_return,
                v_new_stock,
                'Kitchen cancel: ' || COALESCE(NEW.cancelled_reason, '-'),
                COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid)
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_return_stock_on_cancel ON order_items;
CREATE TRIGGER trg_return_stock_on_cancel
AFTER UPDATE OF status ON order_items
FOR EACH ROW EXECUTE FUNCTION fn_return_stock_on_cancel();

-- ------------------------------------------------------------
-- 2. อนุญาตพนักงานที่ล็อกอินบันทึก Audit Log ของตัวเองได้
--    (actor_id ต้องตรงกับผู้ใช้ปัจจุบัน ป้องกันการปลอมชื่อผู้กระทำ)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "audit_logs_insert_own" ON audit_logs;
CREATE POLICY "audit_logs_insert_own" ON audit_logs FOR INSERT
    WITH CHECK (fn_my_role() IS NOT NULL AND actor_id = auth.uid());
