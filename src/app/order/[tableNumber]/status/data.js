import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { toDisplayError } from '@/lib/action-helpers';

/**
 * @typedef {Object} CustomerOrderItem
 * @property {string} id
 * @property {string} name
 * @property {number} quantity
 * @property {'pending'|'cooking'|'served'|'cancelled'} status
 * @property {string[]} options - ตัวเลือกที่เลือก เช่น ["น้ำจิ้มงา"]
 */

/**
 * @typedef {Object} CustomerOrderRound
 * @property {string} orderId
 * @property {string} orderNumber
 * @property {number} roundNumber - รอบที่สั่ง เริ่ม 1 (เรียงตามเวลา)
 * @property {string} createdAt - ISO
 * @property {CustomerOrderItem[]} items
 */

/**
 * ออเดอร์ทุกรอบของโต๊ะนี้ (ใหม่สุดอยู่บน) — ไม่มีราคาอาหาร
 * @param {string} tokenHash
 * @param {string} tableNumber
 * @returns {Promise<{ rounds: CustomerOrderRound[], error: string|null }>}
 */
export async function getCustomerOrders(tokenHash, tableNumber) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_customer_get_orders', {
    p_token_hash: tokenHash,
    p_table_number: tableNumber,
  });
  if (error) return { rounds: [], error: toDisplayError(error, 'customer orders') };

  // ฐานข้อมูลส่งมาเก่า → ใหม่ ใส่เลขรอบก่อน แล้วกลับลำดับให้รอบล่าสุดอยู่บน
  const rounds = (data ?? [])
    .map((order, index) => ({
      orderId: order.order_id,
      orderNumber: order.order_number,
      roundNumber: index + 1,
      createdAt: order.created_at,
      items: (order.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        status: item.status,
        options: item.options ?? [],
      })),
    }))
    .reverse();

  return { rounds, error: null };
}
