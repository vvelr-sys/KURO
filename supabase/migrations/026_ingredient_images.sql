-- ============================================================
-- KURO POS — Migration 026: รูปวัตถุดิบ (ช่วย staff นับสต็อก)
-- ------------------------------------------------------------
-- ต้องรันหลัง 025_menu_packages_staff.sql (ใช้ Storage bucket "menu-images" เดิม โฟลเดอร์ ingredients/)
-- รันซ้ำได้ อยู่ใน Transaction เดียว
--
-- สิ่งที่เพิ่ม:
--   1) ingredients.image_url
--   2) fn_ingredients_for_count() คืน image_url ด้วย (ยังไม่คืนยอดคงเหลือ — staff นับแบบไม่เห็นยอดเหมือนเดิม)
--      ไม่มีรูปวัตถุดิบ → ใช้รูปเมนูที่มีวัตถุดิบนี้ในสูตรแทน (เลือกเมนูที่ใช้วัตถุดิบน้อยที่สุด เช่น
--      "หมูสันคอ" ได้รูปจากเมนู "หมูสันคอสไลซ์" ที่ใช้หมูสันคออย่างเดียว) — ไม่คัดลอกไฟล์ คำนวณตอนอ่าน
-- ============================================================

BEGIN;

ALTER TABLE ingredients
    ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN ingredients.image_url IS
    'รูปวัตถุดิบ — URL สาธารณะของไฟล์ใน Storage bucket menu-images/ingredients (NULL = ไม่มีรูป)';

-- ชนิดผลลัพธ์เปลี่ยน → ต้อง DROP ก่อนสร้างใหม่
DROP FUNCTION IF EXISTS fn_ingredients_for_count();

CREATE FUNCTION fn_ingredients_for_count()
RETURNS TABLE (id UUID, name VARCHAR, unit VARCHAR, image_url TEXT) AS $$
BEGIN
    IF fn_my_role() IS NULL OR fn_my_role() NOT IN ('staff', 'manager', 'admin') THEN
        RAISE EXCEPTION 'ไม่มีสิทธิ์ดูรายการวัตถุดิบสำหรับตรวจนับ';
    END IF;

    RETURN QUERY
    SELECT i.id, i.name, i.unit,
           COALESCE(
               i.image_url,
               -- รูปจากเมนูที่ใช้วัตถุดิบนี้ (สูตรสั้นสุดก่อน แล้วเรียงตามชื่อ)
               (SELECT m.image_url
                FROM public.menu_ingredients link
                JOIN public.menu_items m ON m.id = link.menu_item_id
                WHERE link.ingredient_id = i.id AND m.image_url IS NOT NULL
                ORDER BY (SELECT count(*) FROM public.menu_ingredients other WHERE other.menu_item_id = m.id), m.name
                LIMIT 1)
           )
    FROM public.ingredients i
    ORDER BY i.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- สิทธิ์เหมือน migration 022: คนไม่ล็อกอินเรียกไม่ได้
REVOKE EXECUTE ON FUNCTION fn_ingredients_for_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_ingredients_for_count() TO authenticated;

COMMIT;
