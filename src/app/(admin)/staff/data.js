import 'server-only';
import { connection } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * @typedef {Object} StaffAccount
 * @property {string} id
 * @property {string} fullName
 * @property {string|null} email - null เมื่อยังไม่ได้ตั้ง SUPABASE_SERVICE_ROLE_KEY
 * @property {'admin'|'manager'|'cashier'|'staff'|'kitchen'} role
 * @property {boolean} isActive
 * @property {string} createdAt
 */

/** มี Service Role Key ไหม (จำเป็นสำหรับสร้างบัญชี / อ่านอีเมล / ตั้งรหัสผ่าน) */
export function hasServiceRoleKey() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * ดึงอีเมลของทุกบัญชีจาก Supabase Auth (ไล่ทีละหน้า)
 * @param {import('@supabase/supabase-js').SupabaseClient} adminClient
 * @returns {Promise<Map<string, string>>} userId → email
 */
async function fetchEmailsById(adminClient) {
  const emailsById = new Map();
  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const user of data.users) emailsById.set(user.id, user.email ?? null);
    if (data.users.length < perPage) break;
  }
  return emailsById;
}

/**
 * ข้อมูลหน้าพนักงาน: รายชื่อทุกบัญชี + อีเมล
 * @returns {Promise<{ accounts: StaffAccount[], canManageAccounts: boolean, error: string|null }>}
 */
export async function getStaffPageData() {
  await connection();
  const canManageAccounts = hasServiceRoleKey();

  try {
    if (!canManageAccounts) {
      // ไม่มี Service Role Key → อ่านได้แค่ข้อมูลพื้นฐาน (ไม่มีอีเมล)
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, is_active, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return {
        accounts: data.map((row) => toAccount(row, null)),
        canManageAccounts,
        error: null,
      };
    }

    const adminClient = createAdminClient();
    const [{ data, error }, emailsById] = await Promise.all([
      adminClient.from('profiles').select('id, full_name, role, is_active, created_at').order('created_at', { ascending: true }),
      fetchEmailsById(adminClient),
    ]);
    if (error) throw error;
    return {
      accounts: data.map((row) => toAccount(row, emailsById.get(row.id) ?? null)),
      canManageAccounts,
      error: null,
    };
  } catch (err) {
    console.error('[staff data]', err?.message);
    return { accounts: [], canManageAccounts, error: 'โหลดรายชื่อพนักงานไม่สำเร็จ กรุณารีเฟรชหน้า' };
  }
}

/** แปลงแถว profiles เป็นข้อมูลที่หน้าเว็บใช้ */
function toAccount(row, email) {
  return {
    id: row.id,
    fullName: row.full_name,
    email,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}
