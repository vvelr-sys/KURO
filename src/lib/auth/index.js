// รวมฟังก์ชันเรื่องล็อกอินและสิทธิ์ไว้ที่เดียว
// ⚠️ ไฟล์นี้ดึง session.js (ฝั่ง Server เท่านั้น) — Client Component ให้ import จาก '@/lib/auth/permissions' แทน
export { getCurrentStaff, requireRole } from './session';
export {
  getAllowedRoles,
  canAccessPath,
  getHomePath,
  getPathAfterLogin,
  toSafeInternalPath,
} from './permissions';
