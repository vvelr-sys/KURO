import { ROUTE_PERMISSIONS, ROLE_HOME_PATH } from '@/lib/constants';

// ฟังก์ชันในไฟล์นี้ไม่แตะ cookie / ฐานข้อมูล จึงใช้ได้ทั้งฝั่ง Server และ Client

/**
 * หาว่าหน้านี้ตำแหน่งไหนเข้าได้บ้าง
 * จับคู่แบบ "path ที่ยาวที่สุดที่ตรงกัน" เช่น /billing/tax-invoice ใช้สิทธิ์ของตัวเอง
 * ส่วน /billing/อะไรก็ได้ ที่ไม่มีในตาราง จะใช้สิทธิ์ของ /billing
 * @param {string} path - เช่น '/billing/tax-invoice'
 * @returns {string[] | null} รายชื่อตำแหน่ง หรือ null ถ้าหน้านี้ไม่อยู่ในตารางสิทธิ์
 */
export function getAllowedRoles(path) {
  let matchedKey = null;
  for (const routeKey of Object.keys(ROUTE_PERMISSIONS)) {
    const isMatch = path === routeKey || path.startsWith(`${routeKey}/`);
    if (isMatch && (!matchedKey || routeKey.length > matchedKey.length)) {
      matchedKey = routeKey;
    }
  }
  return matchedKey ? ROUTE_PERMISSIONS[matchedKey] : null;
}

/**
 * ตำแหน่งนี้เข้าหน้านี้ได้ไหม (หน้าที่ไม่อยู่ในตารางสิทธิ์ = เข้าไม่ได้ เพื่อความปลอดภัย)
 * @param {string} role
 * @param {string} path
 * @returns {boolean}
 */
export function canAccessPath(role, path) {
  const allowedRoles = getAllowedRoles(path);
  return Boolean(allowedRoles && allowedRoles.includes(role));
}

/**
 * หน้าแรกของตำแหน่ง (ถ้าไม่รู้จักตำแหน่ง ส่งกลับหน้าล็อกอิน)
 * @param {string} role
 * @returns {string}
 */
export function getHomePath(role) {
  return ROLE_HOME_PATH[role] ?? '/login';
}

/**
 * ตรวจ path ที่ส่งมากับ ?next= ว่าเป็นหน้าภายในเว็บจริง (กันการพาไปเว็บอื่น)
 * @param {unknown} value
 * @returns {string | null}
 */
export function toSafeInternalPath(value) {
  if (typeof value !== 'string') return null;
  // ต้องขึ้นต้นด้วย / ตัวเดียว ห้าม // หรือ /\ ซึ่งเบราว์เซอร์ตีความเป็นโดเมนอื่นได้
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  return value;
}

/**
 * เลือกหน้าที่จะไปหลังล็อกอิน: ไปหน้าที่ขอไว้ถ้ามีสิทธิ์ ไม่อย่างนั้นไปหน้าแรกของตำแหน่ง
 * @param {string} role
 * @param {unknown} requestedPath - ค่า ?next= จาก URL
 * @returns {string}
 */
export function getPathAfterLogin(role, requestedPath) {
  const safePath = toSafeInternalPath(requestedPath);
  if (safePath && canAccessPath(role, safePath)) return safePath;
  return getHomePath(role);
}
