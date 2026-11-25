-- ============================================================
-- KURO POS — Migration 026: หน้าติดตามสถานะอาหารของลูกค้า (T-05 /order/[tableNumber]/status)
-- ------------------------------------------------------------
-- ต้องรันหลัง 025_customer_ordering.sql
-- รันซ้ำได้ (CREATE OR REPLACE) และอยู่ใน Transaction เดียว ไม่แก้/ลบข้อมูล
--
-- migration 025 ปิดไม่ให้ลูกค้า (anon) อ่าน orders / order_items ตรง → ลูกค้ารับ Realtime ของตารางนี้ไม่ได้
-- หน้าสถานะจึงดึงผ่านฟังก์ชันนี้ (ต้องส่ง hash ของ QR token) และดึงซ้ำเป็นระยะจากฝั่งหน้าเว็บ
--
-- เพิ่ม:
--   fn_customer_get_orders(token_hash, table_number)
--     ออเดอร์ทุกรอบของ session นี้ (เก่า → ใหม่) พร้อมรายการ สถานะ และตัวเลือกที่เลือก
--     ไม่ส่งราคา และไม่ส่งเหตุผลยกเลิก (เหตุผลเป็นข้อมูลภายในร้าน)
--     ใช้ได้ทุกสถานะรอบยกเว้น draft / closed (ช่วง expired ยังดูสถานะได้ — FR-014)
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION fn_customer_get_orders(p_token_hash TEXT, p_table_number TEXT)
RETURNS JSONB AS $$
DECLARE
    v_session_id UUID;
    v_orders     JSONB;
BEGIN
    -- ตรวจ token + เลขโต๊ะ (error ภาษาไทยแสดงบนหน้าจอได้เลย)
    v_session_id := (fn_customer_get_session(p_token_hash, p_table_number)->>'session_id')::uuid;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'order_id', ord.id,
               'order_number', ord.order_number,
               'created_at', ord.created_at,
               'items', (
                   SELECT COALESCE(jsonb_agg(jsonb_build_object(
                              'id', item.id,
                              'name', menu.name,
                              'quantity', item.quantity,
                              'status', item.status,
                              'updated_at', item.updated_at,
                              'options', (
                                  SELECT COALESCE(jsonb_agg(opt.option_name ORDER BY opt.option_group_name), '[]'::jsonb)
                                  FROM order_item_options AS chosen
                                  JOIN menu_item_options AS opt ON opt.id = chosen.menu_item_option_id
                                  WHERE chosen.order_item_id = item.id
                              )
                          ) ORDER BY item.created_at, menu.name), '[]'::jsonb)
                   FROM order_items AS item
                   JOIN menu_items AS menu ON menu.id = item.menu_item_id
                   WHERE item.order_id = ord.id
               )
           ) ORDER BY ord.created_at, ord.order_number), '[]'::jsonb)
    INTO v_orders
    FROM orders AS ord
    WHERE ord.session_id = v_session_id;

    RETURN v_orders;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION fn_customer_get_orders(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_customer_get_orders(TEXT, TEXT) TO anon, authenticated;

COMMIT;
