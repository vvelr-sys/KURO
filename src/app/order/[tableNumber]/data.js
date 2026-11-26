import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { toDisplayError } from '@/lib/action-helpers';

/**
 * @typedef {Object} MenuOption
 * @property {string} id
 * @property {string} groupName - ชื่อกลุ่ม เช่น "น้ำจิ้ม"
 * @property {string} name - ชื่อตัวเลือก เช่น "น้ำจิ้มงา"
 * @property {number} additionalPrice
 */

/**
 * @typedef {Object} CustomerMenuItem
 * @property {string} id
 * @property {string} name
 * @property {string|null} description
 * @property {string|null} imageUrl
 * @property {number} extraPrice - 0 = อยู่ในบุฟเฟต์ / มากกว่า 0 = สั่งเพิ่ม คิดเงินแยก
 * @property {'available'|'out_of_stock'|'manual_off'} availability
 * @property {MenuOption[]} options
 */

/**
 * @typedef {Object} CustomerMenuCategory
 * @property {string} id
 * @property {string} name
 * @property {CustomerMenuItem[]} items
 */

/**
 * เมนูทั้งหมดแยกหมวด (ทุกสถานะ — เมนูที่หมดยังแสดงแต่กดสั่งไม่ได้, กฎข้อ 7)
 * @param {string} tokenHash
 * @returns {Promise<{ categories: CustomerMenuCategory[], error: string|null }>}
 */
export async function getCustomerMenu(tokenHash) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_customer_get_menu', { p_token_hash: tokenHash });
  if (error) return { categories: [], error: toDisplayError(error, 'customer menu') };

  const categories = (data ?? []).map((category) => ({
    id: category.id,
    name: category.name,
    items: (category.items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      imageUrl: item.image_url,
      extraPrice: Number(item.extra_price) || 0,
      availability: item.availability_status,
      options: (item.options ?? []).map((option) => ({
        id: option.id,
        groupName: option.group_name,
        name: option.name,
        additionalPrice: Number(option.additional_price) || 0,
      })),
    })),
  }));

  return { categories, error: null };
}
