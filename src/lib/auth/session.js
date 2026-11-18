import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canAccessPath, getHomePath } from './permissions';

/**
 * @typedef {Object} CurrentStaff
 * @property {string} id - UUID ของพนักงาน (= auth.users.id)
 * @property {string} fullName
 * @property {'admin'|'manager'|'cashier'|'staff'|'kitchen'} role
 * @property {string|null} email
 */

/**
 * อ่านพนักงานที่ล็อกอินอยู่ (จุดตรวจสิทธิ์จุดเดียวของระบบ — Data Access Layer)
 * - ไม่ได้ล็อกอิน / ไม่มี profile / บัญชีถูกปิดใช้งาน → คืน null
 * - "use cache: private": เรียกซ้ำหลายจุดในหน้าเดียวก็ยิงฐานข้อมูลครั้งเดียว และจำเป็นเพราะ
 *   Supabase เทียบเวลาหมดอายุ token ด้วย Date.now() ซึ่ง cacheComponents ไม่ยอมให้เรียก
 *   ระหว่างเตรียมหน้าล่วงหน้า (prefetch) นอก scope ของ cache
 * - ผลลัพธ์เก็บในเบราว์เซอร์ของผู้ใช้คนนั้นเท่านั้น ไม่เก็บบนเซิร์ฟเวอร์ (ค่าเริ่มต้น 5 นาที)
 *   ออกจากระบบ (ลบ cookie ใน Server Action) จะล้าง cache ฝั่งเบราว์เซอร์ให้เอง
 * ⚠️ อ่าน cookie → ต้องเรียกจาก Component ที่อยู่ใน <Suspense> (เพราะเปิด cacheComponents)
 * @returns {Promise<CurrentStaff|null>}
 */
export async function getCurrentStaff() {
  'use cache: private';
  return readStaffFromDatabase();
}

/**
 * อ่านพนักงานที่ล็อกอินจากฐานข้อมูลตรงๆ (ไม่มี cache) — ใช้ร่วมกันระหว่างหน้าเว็บและ Server Action
 * @returns {Promise<CurrentStaff|null>}
 */
async function readStaffFromDatabase() {
  const supabase = await createClient();

  // getClaims ตรวจลายเซ็น JWT ให้ด้วย (ไม่เชื่อค่าใน cookie ตรงๆ)
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  // ระบุคอลัมน์เสมอ — migration 004 ห้ามอ่าน pin_hash จึงใช้ select('*') ไม่ได้
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, is_active')
    .eq('id', userId)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;

  return {
    id: profile.id,
    fullName: profile.full_name,
    role: profile.role,
    email: claimsData.claims.email ?? null,
  };
}

/**
 * ตรวจสิทธิ์ใน Server Action (อ่านสดจากฐานข้อมูลทุกครั้ง ไม่ใช้ cache)
 * ไม่ redirect แต่คืน error ให้ Action ส่งกลับไปแสดงบนหน้าจอ
 * @param {string[]} allowedRoles - ตำแหน่งที่ทำงานนี้ได้
 * @returns {Promise<{ staff: CurrentStaff, error: null } | { staff: null, error: string }>}
 */
export async function checkActionRole(allowedRoles) {
  const staff = await readStaffFromDatabase();
  if (!staff) return { staff: null, error: 'กรุณาเข้าสู่ระบบใหม่' };
  if (!allowedRoles.includes(staff.role)) return { staff: null, error: 'ตำแหน่งของคุณไม่มีสิทธิ์ทำรายการนี้' };
  return { staff, error: null };
}

/**
 * บังคับว่าต้องเป็นพนักงานที่มีสิทธิ์เข้าหน้านี้ (ใช้ในทุกหน้าของพนักงาน — Server Action ใช้ checkActionRole)
 * - ไม่ได้ล็อกอิน → ไปหน้า /login
 * - ไม่มีสิทธิ์ → ไปหน้าแรกของตำแหน่งตัวเอง
 * @param {string} path - path ของหน้า ตรงกับคีย์ใน ROUTE_PERMISSIONS เช่น '/tables'
 * @returns {Promise<CurrentStaff>}
 */
export async function requireRole(path) {
  const staff = await getCurrentStaff();
  if (!staff) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (!canAccessPath(staff.role, path)) redirect(getHomePath(staff.role));
  return staff;
}
