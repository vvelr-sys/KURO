// คำนวณเงินเป็น "สตางค์" (จำนวนเต็ม) เพื่อเลี่ยงทศนิยมเพี้ยนของ JavaScript เช่น 0.1 + 0.2 = 0.30000000000000004
// ใช้ฝั่งหน้าจอเท่านั้น (แสดงเงินทอน/ยอดคงเหลือ) — ยอดจริงคำนวณในฐานข้อมูลเสมอ

/**
 * บาท → สตางค์ (ปัดเศษ)
 * @param {number|string} baht
 * @returns {number}
 */
export function toSatang(baht) {
  const value = Number(baht);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/**
 * สตางค์ → บาท
 * @param {number} satang
 * @returns {number}
 */
export function toBaht(satang) {
  return satang / 100;
}

/**
 * แปลงข้อความที่ผู้ใช้พิมพ์เป็นจำนวนเงิน (บาท) — ว่าง/ผิดรูปแบบ คืน null
 * @param {string} text
 * @returns {number|null}
 */
export function parseBahtInput(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const value = Number(text.replace(/,/g, ''));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
}

/**
 * VAT ที่รวมอยู่ในยอด (Inclusive) — สูตรเดียวกับ fn_calc_bill_vat ในฐานข้อมูล
 * @param {number} totalBaht
 * @param {number} vatRatePercent
 * @returns {number}
 */
export function calculateIncludedVat(totalBaht, vatRatePercent) {
  if (!totalBaht || totalBaht <= 0) return 0;
  return Math.round((totalBaht * vatRatePercent) / (100 + vatRatePercent) * 100) / 100;
}
