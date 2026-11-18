import 'server-only';
import { createHash, randomBytes } from 'node:crypto';

// QR Token ของโต๊ะ (กฎข้อ 1: ลูกค้าสแกนแล้วเข้าได้ทันที ไม่มี PIN)
// - token จริงอยู่ใน QR เท่านั้น ฐานข้อมูลเก็บแค่ SHA-256 (hex) → ใครเห็นฐานข้อมูลก็สร้าง QR ปลอมไม่ได้
// - เพราะเก็บแค่ hash จึงดึง QR เดิมกลับมาไม่ได้ พิมพ์ซ้ำ = สร้าง token ใหม่

/**
 * แปลง token เป็น hash สำหรับเก็บ/ค้นในตาราง qr_access_tokens (หน้าสั่งอาหาร T-05 ใช้ตัวนี้ตรวจด้วย)
 * @param {string} token
 * @returns {string} SHA-256 แบบ hex 64 ตัวอักษร
 */
export function hashQrToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * สุ่ม token ใหม่ (24 bytes ≈ 192 bit เดาไม่ได้) พร้อม hash
 * @returns {{ token: string, tokenHash: string }}
 */
export function createQrToken() {
  const token = randomBytes(24).toString('base64url');
  return { token, tokenHash: hashQrToken(token) };
}

/**
 * URL ที่อยู่ใน QR: /order/T01?t=<token>
 * @param {string} origin - เช่น https://kuro.example.com
 * @param {string} tableNumber
 * @param {string} token
 * @returns {string}
 */
export function buildOrderUrl(origin, tableNumber, token) {
  const url = new URL(`/order/${encodeURIComponent(tableNumber)}`, origin);
  url.searchParams.set('t', token);
  return url.toString();
}
