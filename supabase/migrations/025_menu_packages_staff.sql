-- ============================================================
-- KURO POS — Migration 025: จัดการเมนู / ราคาบุฟเฟต์ / พนักงาน (T-10)
-- ------------------------------------------------------------
-- ต้องรันหลัง 024_inventory_reports_audit.sql
-- รันซ้ำได้ (IF NOT EXISTS / DROP ... IF EXISTS / ON CONFLICT) อยู่ใน Transaction เดียว
--
-- สิ่งที่เพิ่ม:
--   1) menu_items.max_quantity_per_order — จำกัดจำนวนต่อการกดสั่ง 1 ครั้ง (NULL = ไม่จำกัด)
--   2) Manager เพิ่ม/แก้หมวดหมู่เมนู (categories) ได้ — เดิมให้เฉพาะ admin
--   3) ที่เก็บรูปเมนู Supabase Storage bucket "menu-images"
--      ทุกคนดูรูปได้ (หน้าลูกค้าไม่ต้องล็อกอิน) · อัปโหลด/ลบได้เฉพาะ manager, admin
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) จำกัดจำนวนต่อการกดสั่ง 1 ครั้ง
-- ------------------------------------------------------------
ALTER TABLE menu_items
    ADD COLUMN IF NOT EXISTS max_quantity_per_order INT;

ALTER TABLE menu_items
    DROP CONSTRAINT IF EXISTS menu_items_max_quantity_per_order_check;
ALTER TABLE menu_items
    ADD CONSTRAINT menu_items_max_quantity_per_order_check
    CHECK (max_quantity_per_order IS NULL OR max_quantity_per_order BETWEEN 1 AND 99);

COMMENT ON COLUMN menu_items.max_quantity_per_order IS
    'จำนวนสูงสุดที่ลูกค้าสั่งได้ต่อการกดสั่ง 1 ครั้ง (NULL = ไม่จำกัด)';

-- ------------------------------------------------------------
-- 2) Manager จัดการหมวดหมู่เมนูได้
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "manager_manage_categories" ON categories;
CREATE POLICY "manager_manage_categories" ON categories
    FOR ALL
    USING (fn_my_role() IN ('admin', 'manager'))
    WITH CHECK (fn_my_role() IN ('admin', 'manager'));

-- ------------------------------------------------------------
-- 3) ที่เก็บรูปเมนู (public bucket จำกัดขนาด 2 MB และชนิดไฟล์รูป)
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('menu-images', 'menu-images', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "menu_images_public_read" ON storage.objects;
CREATE POLICY "menu_images_public_read" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'menu-images');

DROP POLICY IF EXISTS "menu_images_manager_insert" ON storage.objects;
CREATE POLICY "menu_images_manager_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'menu-images' AND public.fn_my_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "menu_images_manager_update" ON storage.objects;
CREATE POLICY "menu_images_manager_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'menu-images' AND public.fn_my_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "menu_images_manager_delete" ON storage.objects;
CREATE POLICY "menu_images_manager_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'menu-images' AND public.fn_my_role() IN ('admin', 'manager'));

COMMIT;
