import 'server-only';

/**
 * @typedef {Object} SummaryOptionCount
 * @property {string} label - ตัวเลือก เช่น "น้ำจิ้มงา" (หลายกลุ่มต่อด้วย ", ")
 * @property {number} quantity
 */

/**
 * @typedef {Object} SummaryLine
 * @property {string} name - ชื่อเมนู
 * @property {number} quantity - จำนวนรวมทุกรอบ (ไม่นับที่ยกเลิก)
 * @property {SummaryOptionCount[]} options - แยกจำนวนตามตัวเลือก (ว่าง = เมนูไม่มีตัวเลือก)
 */

/**
 * @typedef {Object} OrderSummary
 * @property {SummaryLine[]} lines - เรียงจากสั่งมากสุด
 * @property {number} totalQuantity - จำนวนจานรวม (ไม่นับที่ยกเลิก)
 * @property {number} servedQuantity - ในนั้นเสิร์ฟแล้วกี่จาน
 * @property {number} cancelledQuantity - จานที่ยกเลิก (ไม่นับรวม)
 * @property {number} roundCount - สั่งไปกี่รอบ
 */

/**
 * รวมรายการทุกรอบเป็นสรุปต่อเมนู (หน้า 1.5 — ไม่มีราคา)
 * ใช้ข้อมูลชุดเดียวกับหน้าสถานะ (fn_customer_get_orders — migration 030) จึงไม่ต้องมีฟังก์ชันใหม่ในฐานข้อมูล
 * @param {import('../status/data').CustomerOrderRound[]} rounds
 * @returns {OrderSummary}
 */
export function buildOrderSummary(rounds) {
  /** @type {Map<string, { name: string, quantity: number, options: Map<string, number> }>} */
  const byMenu = new Map();
  let totalQuantity = 0;
  let servedQuantity = 0;
  let cancelledQuantity = 0;

  for (const round of rounds) {
    for (const item of round.items) {
      if (item.status === 'cancelled') {
        cancelledQuantity += item.quantity;
        continue;
      }
      totalQuantity += item.quantity;
      if (item.status === 'served') servedQuantity += item.quantity;

      if (!byMenu.has(item.name)) byMenu.set(item.name, { name: item.name, quantity: 0, options: new Map() });
      const line = byMenu.get(item.name);
      line.quantity += item.quantity;
      if (item.options.length > 0) {
        const optionLabel = item.options.join(', ');
        line.options.set(optionLabel, (line.options.get(optionLabel) ?? 0) + item.quantity);
      }
    }
  }

  const lines = [...byMenu.values()]
    .map((line) => ({
      name: line.name,
      quantity: line.quantity,
      options: [...line.options].map(([label, quantity]) => ({ label, quantity })),
    }))
    .sort((lineA, lineB) => lineB.quantity - lineA.quantity || lineA.name.localeCompare(lineB.name, 'th'));

  return { lines, totalQuantity, servedQuantity, cancelledQuantity, roundCount: rounds.length };
}
