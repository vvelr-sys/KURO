// ตัวช่วยตะกร้าของหน้าสั่งอาหาร (ฟังก์ชันล้วน ไม่มี state — ทดสอบ/ใช้ซ้ำได้ง่าย)

/**
 * @typedef {Object} CartLine
 * @property {string} key - menuItemId + ตัวเลือก (เมนูเดียวกันแต่ตัวเลือกต่างกัน = คนละบรรทัด)
 * @property {string} menuItemId
 * @property {string[]} optionIds - เรียงแล้ว
 * @property {string} optionLabel - ข้อความตัวเลือก เช่น "น้ำจิ้มงา" (ว่าง = ไม่มีตัวเลือก)
 * @property {number} quantity
 */

/**
 * สร้างรหัสบรรทัดตะกร้าจากเมนู + ตัวเลือก
 * @param {string} menuItemId
 * @param {string[]} optionIds
 * @returns {string}
 */
export function makeCartKey(menuItemId, optionIds) {
  return optionIds.length > 0 ? `${menuItemId}|${[...optionIds].sort().join(',')}` : menuItemId;
}

/**
 * เพิ่ม/ลดจำนวนในตะกร้า (เหลือ 0 = ลบบรรทัดนั้น) — คืน object ใหม่เสมอ
 * @param {Record<string, CartLine>} cart
 * @param {Omit<CartLine, 'quantity'>} line
 * @param {number} change - เช่น +1 / -1
 * @returns {Record<string, CartLine>}
 */
export function changeCartQuantity(cart, line, change) {
  const nextQuantity = (cart[line.key]?.quantity ?? 0) + change;
  const nextCart = { ...cart };
  if (nextQuantity <= 0) {
    delete nextCart[line.key];
  } else {
    nextCart[line.key] = { ...line, quantity: nextQuantity };
  }
  return nextCart;
}

/**
 * รวมตะกร้า 2 ใบ (ใช้คืนรายการเมื่อส่งออเดอร์ไม่สำเร็จ โดยไม่ทับของที่ลูกค้าเพิ่งเพิ่มระหว่างรอ)
 * @param {Record<string, CartLine>} baseCart
 * @param {Record<string, CartLine>} extraCart
 * @returns {Record<string, CartLine>}
 */
export function mergeCarts(baseCart, extraCart) {
  const merged = { ...baseCart };
  for (const line of Object.values(extraCart)) {
    merged[line.key] = { ...line, quantity: (merged[line.key]?.quantity ?? 0) + line.quantity };
  }
  return merged;
}

/**
 * จำนวนในตะกร้าแยกตามเมนู (รวมทุกตัวเลือก) — ใช้แสดงตัวเลขบนการ์ดเมนู
 * @param {Record<string, CartLine>} cart
 * @returns {Map<string, number>}
 */
export function countByMenuItem(cart) {
  const counts = new Map();
  for (const line of Object.values(cart)) {
    counts.set(line.menuItemId, (counts.get(line.menuItemId) ?? 0) + line.quantity);
  }
  return counts;
}

const bahtFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });

/**
 * ราคาเมนูสั่งเพิ่ม เช่น "+159฿"
 * @param {number} amount
 * @returns {string}
 */
export function formatExtraPrice(amount) {
  return `+${bahtFormatter.format(amount)}฿`;
}
