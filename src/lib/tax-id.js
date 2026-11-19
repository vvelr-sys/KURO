/**
 * ตรวจเลขประจำตัวผู้เสียภาษี / เลขบัตรประชาชนไทย 13 หลัก (ใช้สูตรหลักตรวจสอบเดียวกัน)
 * สูตร: คูณหลักที่ 1-12 ด้วย 13 ถึง 2 แล้วรวมกัน → หลักที่ 13 ต้องเท่ากับ (11 - ผลรวม mod 11) mod 10
 * ใช้ได้ทั้งฝั่ง Server และ Client (ไม่แตะฐานข้อมูล)
 * @param {string} value - ตัวเลข 13 หลัก (มีขีด/ช่องว่างได้)
 * @returns {boolean}
 */
export function isValidThaiTaxId(value) {
  const digits = String(value ?? '').replace(/[\s-]/g, '');
  if (!/^\d{13}$/.test(digits)) return false;
  let sum = 0;
  for (let index = 0; index < 12; index += 1) sum += Number(digits[index]) * (13 - index);
  return (11 - (sum % 11)) % 10 === Number(digits[12]);
}

/**
 * เอาขีด/ช่องว่างออก เหลือแต่ตัวเลข
 * @param {string} value
 * @returns {string}
 */
export function normalizeTaxId(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * จัดรูปแบบเลข 13 หลักให้อ่านง่าย: 0-1055-58123-45-6
 * @param {string} value
 * @returns {string}
 */
export function formatTaxId(value) {
  const digits = normalizeTaxId(value);
  if (digits.length !== 13) return value;
  return `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`;
}
