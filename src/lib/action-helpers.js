import 'server-only';
import { headers } from 'next/headers';

// ตัวช่วยที่ Server Action ทุกหน้าใช้ร่วมกัน

/**
 * แปลง error จากฐานข้อมูลเป็นข้อความที่แสดงบนหน้าจอได้
 * error ที่ฟังก์ชันของเรา RAISE เป็นภาษาไทยอยู่แล้ว → แสดงตรงๆ / error อื่น (ภาษาอังกฤษ/ทางเทคนิค) ใช้ข้อความกลาง
 * @param {{ message?: string } | null} error
 * @param {string} [logLabel] - ป้ายใน log ฝั่งเซิร์ฟเวอร์ เพื่อหาที่มาของ error
 * @returns {string}
 */
export function toDisplayError(error, logLabel = 'action') {
  const message = error?.message ?? '';
  if (/[฀-๿]/.test(message)) return message;
  console.error(`[${logLabel}]`, message);
  return 'ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
}

/**
 * origin ของเว็บที่ผู้ใช้เปิดอยู่ (ใช้สร้าง URL ใน QR ให้ตรงกับโดเมนจริง)
 * @returns {Promise<string>} เช่น http://localhost:3000
 */
export async function getRequestOrigin() {
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host');
  const protocol = headerList.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}
