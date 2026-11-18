import { NEAR_EXPIRY_MINUTES } from '@/lib/constants';

// คำนวณ "สิ่งที่ต้องแสดง" ของโต๊ะจากสถานะในฐานข้อมูล + เวลาปัจจุบัน (ไม่มี state ใช้ได้ทั้ง Server/Client)

/**
 * @typedef {'available'|'active'|'nearExpiry'|'expired'|'closing'|'billed'|'cleaning'|'disabled'} TableDisplayKey
 */

/** ป้ายและสีของแต่ละสถานะ (class Tailwind) */
export const TABLE_DISPLAY_STYLES = {
  available: { label: 'ว่าง', badge: 'bg-emerald-100 text-emerald-800', card: 'border-transparent' },
  active: { label: 'มีลูกค้า', badge: 'bg-surface text-ink', card: 'border-transparent' },
  nearExpiry: { label: 'ใกล้หมดเวลา', badge: 'bg-amber-100 text-amber-800', card: 'border-amber-400' },
  expired: { label: 'หมดเวลา', badge: 'bg-danger text-white', card: 'border-danger' },
  closing: { label: 'เชิญออกแล้ว', badge: 'bg-primary/10 text-primary', card: 'border-primary/40' },
  billed: { label: 'ออกบิลแล้ว', badge: 'bg-primary text-white', card: 'border-primary/40' },
  cleaning: { label: 'รอเก็บโต๊ะ', badge: 'bg-danger-soft text-danger', card: 'border-transparent' },
  disabled: { label: 'ปิดใช้งาน', badge: 'bg-line text-ink-muted', card: 'border-transparent opacity-60' },
};

/**
 * หาสถานะที่ต้องแสดงของโต๊ะ
 * "หมดเวลา" คำนวณจาก expires_at บนหน้าจอเอง (ฐานข้อมูลไม่ได้เปลี่ยนสถานะเป็น expired อัตโนมัติ)
 * @param {import('@/app/(pos)/tables/data').TableItem} table
 * @param {number|null} now - เวลาปัจจุบัน (ms) หรือ null ระหว่างโหลดหน้า
 * @returns {{ key: TableDisplayKey, remainingMs: number|null }}
 */
export function getTableDisplay(table, now) {
  if (table.status === 'disabled') return { key: 'disabled', remainingMs: null };
  if (table.status === 'cleaning') return { key: 'cleaning', remainingMs: null };
  const session = table.session;
  if (!session) return { key: 'available', remainingMs: null };

  if (session.status === 'billed') return { key: 'billed', remainingMs: null };
  if (session.status === 'closing') return { key: 'closing', remainingMs: null };

  const remainingMs = now === null ? null : new Date(session.expiresAt).getTime() - now;
  if (session.status === 'expired' || (remainingMs !== null && remainingMs <= 0)) {
    return { key: 'expired', remainingMs: 0 };
  }
  if (remainingMs !== null && remainingMs <= NEAR_EXPIRY_MINUTES * 60 * 1000) {
    return { key: 'nearExpiry', remainingMs };
  }
  return { key: 'active', remainingMs };
}

/**
 * สัดส่วนเวลาที่ใช้ไปแล้ว (0-100) สำหรับแถบความคืบหน้า
 * @param {import('@/app/(pos)/tables/data').TableSession} session
 * @param {number|null} now
 * @returns {number}
 */
export function getElapsedPercent(session, now) {
  if (now === null) return 0;
  const start = new Date(session.startedAt).getTime();
  const end = new Date(session.expiresAt).getTime();
  if (end <= start) return 100;
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

/**
 * ข้อความจำนวนลูกค้า เช่น "4 ท่าน (ผู้ใหญ่ 3 / เด็ก 1)"
 * @param {{ adultCount: number, childCount: number }} guests
 * @returns {string}
 */
export function formatGuestCount({ adultCount, childCount }) {
  const total = adultCount + childCount;
  return childCount > 0 ? `${total} ท่าน (ผู้ใหญ่ ${adultCount} / เด็ก ${childCount})` : `${total} ท่าน (ผู้ใหญ่ ${adultCount})`;
}
