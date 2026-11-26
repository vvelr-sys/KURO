'use server';

import { createClient } from '@/lib/supabase/server';
import { toDisplayError } from '@/lib/action-helpers';
import { getCustomerTokenHash } from '@/lib/customer-session';

/**
 * @typedef {Object} OrderLineInput
 * @property {string} menuItemId
 * @property {number} quantity
 * @property {string[]} optionIds
 */

/**
 * ส่งออเดอร์ของลูกค้าเข้าครัว (FR-018)
 * ฐานข้อมูลตรวจซ้ำทั้งหมด: token, โต๊ะ, หมดเวลาหรือยัง, เมนูยังพร้อมขาย, ตัวเลือกครบ (fn_customer_place_order)
 * ออเดอร์ที่สร้างเป็นสถานะ pending → จอครัวรับผ่าน Realtime ของ order_items เอง
 * @param {string} tableNumber
 * @param {OrderLineInput[]} lines
 * @returns {Promise<{ orderNumber: string|null, itemCount: number, error: string|null }>}
 */
export async function placeCustomerOrder(tableNumber, lines) {
  const tokenHash = await getCustomerTokenHash();
  if (!tokenHash) {
    return { orderNumber: null, itemCount: 0, error: 'กรุณาสแกน QR ที่โต๊ะอีกครั้ง' };
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return { orderNumber: null, itemCount: 0, error: 'ยังไม่มีรายการในตะกร้า' };
  }

  // ส่งเฉพาะช่องที่ฐานข้อมูลต้องใช้ (กันค่าแปลกปลอมจากเบราว์เซอร์)
  const items = lines.map((line) => ({
    menu_item_id: String(line.menuItemId),
    quantity: Number(line.quantity),
    option_ids: Array.isArray(line.optionIds) ? line.optionIds.map(String) : [],
  }));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_customer_place_order', {
    p_token_hash: tokenHash,
    p_table_number: String(tableNumber),
    p_items: items,
  });
  if (error) {
    return { orderNumber: null, itemCount: 0, error: toDisplayError(error, 'customer place order') };
  }

  return { orderNumber: data.order_number, itemCount: data.item_count, error: null };
}
