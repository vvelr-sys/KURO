-- ============================================================
-- KURO POS — Migration 033: ตัดระบบ "จำกัดจำนวนสั่งต่อครั้ง" ออก
-- ------------------------------------------------------------
-- ต้องรันหลัง 032_customer_queue_view.sql
-- รันซ้ำได้ (IF EXISTS) อยู่ใน Transaction เดียว
--
-- ผู้ใช้ตัดสินใจ (26 พ.ย. 2026): ไม่ใช้ระบบจำกัดจำนวนสั่ง ลูกค้าสั่งได้ไม่จำกัด
-- → ลบคอลัมน์ menu_items.max_quantity_per_order ที่ migration 025 เพิ่มไว้ (ไม่มีฟังก์ชันไหนใช้คอลัมน์นี้)
-- ============================================================

BEGIN;

ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_max_quantity_per_order_check;
ALTER TABLE menu_items DROP COLUMN IF EXISTS max_quantity_per_order;

COMMIT;
