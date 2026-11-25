import 'server-only';
import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * @typedef {Object} MenuCategory
 * @property {string} id
 * @property {string} name
 * @property {number} displayOrder
 * @property {boolean} isActive
 */

/**
 * @typedef {Object} ManagedMenuItem
 * @property {string} id
 * @property {string} categoryId
 * @property {string} name
 * @property {string|null} description
 * @property {string|null} imageUrl
 * @property {number} extraPrice - 0 = รวมในบุฟเฟต์ / มากกว่า 0 = เมนูสั่งเพิ่มคิดเงินแยก
 * @property {'fresh'|'beverage'|'grill'|'hot_kitchen'} kitchenStation
 * @property {'available'|'out_of_stock'|'manual_off'} availabilityStatus
 * @property {number|null} maxQuantityPerOrder - null = ไม่จำกัด
 * @property {number} bomCount - จำนวนวัตถุดิบในสูตรตัดสต็อก
 */

/**
 * ข้อมูลหน้าจัดการเมนู: หมวดหมู่ทั้งหมด (รวมที่ปิด) + เมนูทั้งหมด
 * @returns {Promise<{ categories: MenuCategory[], menuItems: ManagedMenuItem[], error: string|null }>}
 */
export async function getMenuPageData() {
  await connection();
  const supabase = await createClient();

  const [categoryResult, menuResult] = await Promise.all([
    supabase.from('categories').select('id, name, display_order, is_active').order('display_order').order('name'),
    supabase
      .from('menu_items')
      .select(
        'id, category_id, name, description, image_url, extra_price, kitchen_station, availability_status, max_quantity_per_order, menu_ingredients(count)'
      )
      .order('name'),
  ]);

  if (categoryResult.error || menuResult.error) {
    console.error('[menu data]', (categoryResult.error || menuResult.error).message);
    return { categories: [], menuItems: [], error: 'โหลดเมนูไม่สำเร็จ (ถ้าเพิ่งอัปเดตระบบ ให้รัน migration 025 ก่อน) กรุณารีเฟรชหน้า' };
  }

  return {
    categories: categoryResult.data.map((row) => ({
      id: row.id,
      name: row.name,
      displayOrder: row.display_order,
      isActive: row.is_active,
    })),
    menuItems: menuResult.data.map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      name: row.name,
      description: row.description,
      imageUrl: row.image_url,
      extraPrice: Number(row.extra_price),
      kitchenStation: row.kitchen_station,
      availabilityStatus: row.availability_status,
      maxQuantityPerOrder: row.max_quantity_per_order,
      bomCount: row.menu_ingredients?.[0]?.count ?? 0,
    })),
    error: null,
  };
}
