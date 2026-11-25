'use server';

import bcrypt from 'bcryptjs';
import { refresh } from 'next/cache';
import { toDisplayError } from '@/lib/action-helpers';
import { checkActionRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ROLE_LABELS, ROUTE_PERMISSIONS } from '@/lib/constants';
import { hasServiceRoleKey } from './data';

// Server Action ของหน้าพนักงาน (admin เท่านั้น)
// สร้างบัญชี / เปลี่ยนรหัสผ่าน / ตั้ง PIN ต้องใช้ Service Role Key (ฝั่งเซิร์ฟเวอร์เท่านั้น)
const STAFF_ROLES = ROUTE_PERMISSIONS['/staff'];
const VALID_ROLES = Object.keys(ROLE_LABELS);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_PATTERN = /^\d{4,6}$/;
const BCRYPT_ROUNDS = 10;
const NO_KEY_ERROR = 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY ในไฟล์ .env.local — ติดต่อผู้ดูแลระบบ';

/**
 * ตรวจสิทธิ์ admin + ต้องมี Service Role Key
 * @returns {Promise<{ staff: object|null, adminClient: import('@supabase/supabase-js').SupabaseClient|null, error: string|null }>}
 */
async function prepareAdminAction() {
  const { staff, error } = await checkActionRole(STAFF_ROLES);
  if (error) return { staff: null, adminClient: null, error };
  if (!hasServiceRoleKey()) return { staff: null, adminClient: null, error: NO_KEY_ERROR };
  return { staff, adminClient: createAdminClient(), error: null };
}

/** บันทึก Audit Log (ไม่บันทึกรหัสผ่าน/PIN ลง payload) */
async function writeAudit(adminClient, actorId, action, targetId, payloadBefore, payloadAfter) {
  const { error } = await adminClient.from('audit_logs').insert({
    actor_id: actorId,
    action,
    target_entity: 'profiles',
    target_id: targetId,
    payload_before: payloadBefore,
    payload_after: payloadAfter,
  });
  if (error) console.error('[staff audit]', error.message);
}

/**
 * สร้างบัญชีพนักงานใหม่ (Supabase Auth + profiles) — ยืนยันอีเมลให้ทันที ล็อกอินได้เลย
 * @param {{ fullName: string, email: string, password: string, role: string, pin?: string }} input
 * @returns {Promise<{ error: string|null, fieldErrors: Record<string, string> }>}
 */
export async function createStaffAccount(input) {
  const { staff, adminClient, error: prepareError } = await prepareAdminAction();
  if (prepareError) return { error: prepareError, fieldErrors: {} };

  const fullName = String(input?.fullName ?? '').trim();
  const email = String(input?.email ?? '').trim().toLowerCase();
  const password = String(input?.password ?? '');
  const role = String(input?.role ?? '');
  const pin = String(input?.pin ?? '').trim();

  const fieldErrors = {};
  if (!fullName || fullName.length > 100) fieldErrors.fullName = 'กรอกชื่อ 1 - 100 ตัวอักษร';
  if (!EMAIL_PATTERN.test(email)) fieldErrors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
  if (password.length < 8) fieldErrors.password = 'รหัสผ่านอย่างน้อย 8 ตัวอักษร';
  if (!VALID_ROLES.includes(role)) fieldErrors.role = 'กรุณาเลือกตำแหน่ง';
  if (pin && !PIN_PATTERN.test(pin)) fieldErrors.pin = 'PIN เป็นตัวเลข 4 - 6 หลัก';
  if (Object.keys(fieldErrors).length > 0) return { error: 'กรุณาตรวจสอบข้อมูลที่กรอก', fieldErrors };

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });
  if (createError) {
    if (createError.code === 'email_exists' || /already/i.test(createError.message)) {
      return { error: 'อีเมลนี้มีบัญชีอยู่แล้ว', fieldErrors: { email: 'อีเมลนี้มีบัญชีอยู่แล้ว' } };
    }
    if (createError.code === 'weak_password') {
      return { error: 'รหัสผ่านง่ายเกินไป', fieldErrors: { password: 'รหัสผ่านง่ายเกินไป ลองเพิ่มตัวอักษร/ตัวเลข' } };
    }
    return { error: toDisplayError(createError, 'staff create'), fieldErrors: {} };
  }

  const userId = created.user.id;
  const profileRow = { id: userId, full_name: fullName, role, is_active: true };
  if (pin) profileRow.pin_hash = await bcrypt.hash(pin, BCRYPT_ROUNDS);

  const { error: profileError } = await adminClient.from('profiles').upsert(profileRow, { onConflict: 'id' });
  if (profileError) {
    // บันทึก profiles ไม่ได้ → ลบบัญชี Auth ที่เพิ่งสร้าง ไม่ให้มีบัญชีค้าง
    await adminClient.auth.admin.deleteUser(userId);
    return { error: toDisplayError(profileError, 'staff create profile'), fieldErrors: {} };
  }

  await writeAudit(adminClient, staff.id, 'CREATE_STAFF', userId, null, { full_name: fullName, email, role, has_pin: Boolean(pin) });
  refresh();
  return { error: null, fieldErrors: {} };
}

/**
 * แก้ชื่อ / ตำแหน่ง / เปิด-ปิดใช้งาน (ปิดใช้งาน = ล็อกอินไม่ได้และทุกหน้าปฏิเสธทันที ประวัติยังอยู่ครบ)
 * Admin แก้ตำแหน่งหรือปิดบัญชีตัวเองไม่ได้ (กันล็อกตัวเองออกจากระบบ)
 * @param {{ id: string, fullName: string, role: string, isActive: boolean }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function updateStaffAccount(input) {
  const { staff, adminClient, error: prepareError } = await prepareAdminAction();
  if (prepareError) return { error: prepareError };

  const fullName = String(input?.fullName ?? '').trim();
  const role = String(input?.role ?? '');
  const isActive = input?.isActive === true;
  if (!fullName || fullName.length > 100) return { error: 'กรอกชื่อ 1 - 100 ตัวอักษร' };
  if (!VALID_ROLES.includes(role)) return { error: 'กรุณาเลือกตำแหน่ง' };

  const { data: before, error: fetchError } = await adminClient
    .from('profiles')
    .select('full_name, role, is_active')
    .eq('id', input?.id)
    .maybeSingle();
  if (fetchError) return { error: toDisplayError(fetchError, 'staff update') };
  if (!before) return { error: 'ไม่พบพนักงานคนนี้' };

  if (input.id === staff.id && (role !== before.role || !isActive)) {
    return { error: 'เปลี่ยนตำแหน่งหรือปิดบัญชีของตัวเองไม่ได้ — ให้ผู้ดูแลระบบคนอื่นทำแทน' };
  }

  const after = { full_name: fullName, role, is_active: isActive };
  const changedKeys = Object.keys(after).filter((key) => before[key] !== after[key]);
  if (changedKeys.length === 0) return { error: null };

  const { error } = await adminClient
    .from('profiles')
    .update({ ...after, updated_at: new Date().toISOString() })
    .eq('id', input.id);
  if (error) return { error: toDisplayError(error, 'staff update') };

  await writeAudit(
    adminClient,
    staff.id,
    'UPDATE_STAFF',
    input.id,
    Object.fromEntries(changedKeys.map((key) => [key, before[key]])),
    Object.fromEntries(changedKeys.map((key) => [key, after[key]]))
  );
  refresh();
  return { error: null };
}

/**
 * ตั้งรหัสผ่านใหม่ให้พนักงาน (กรณีลืมรหัส)
 * @param {{ id: string, password: string }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function resetStaffPassword(input) {
  const { staff, adminClient, error: prepareError } = await prepareAdminAction();
  if (prepareError) return { error: prepareError };

  const password = String(input?.password ?? '');
  if (password.length < 8) return { error: 'รหัสผ่านอย่างน้อย 8 ตัวอักษร' };

  const { error } = await adminClient.auth.admin.updateUserById(input?.id, { password });
  if (error) {
    if (error.code === 'weak_password') return { error: 'รหัสผ่านง่ายเกินไป ลองเพิ่มตัวอักษร/ตัวเลข' };
    return { error: toDisplayError(error, 'staff password') };
  }

  await writeAudit(adminClient, staff.id, 'UPDATE_STAFF', input.id, null, { password: 'ตั้งรหัสผ่านใหม่' });
  return { error: null };
}

/**
 * ตั้ง / ล้าง PIN พนักงาน (เก็บเป็น bcrypt hash — ไม่มีใครอ่าน PIN จริงได้)
 * @param {{ id: string, pin: string|null }} input - pin ว่าง/null = ล้าง PIN
 * @returns {Promise<{ error: string|null }>}
 */
export async function setStaffPin(input) {
  const { staff, adminClient, error: prepareError } = await prepareAdminAction();
  if (prepareError) return { error: prepareError };

  const pin = String(input?.pin ?? '').trim();
  if (pin && !PIN_PATTERN.test(pin)) return { error: 'PIN เป็นตัวเลข 4 - 6 หลัก' };

  const pinHash = pin ? await bcrypt.hash(pin, BCRYPT_ROUNDS) : null;
  const { error } = await adminClient
    .from('profiles')
    .update({ pin_hash: pinHash, updated_at: new Date().toISOString() })
    .eq('id', input?.id);
  if (error) return { error: toDisplayError(error, 'staff pin') };

  await writeAudit(adminClient, staff.id, 'UPDATE_STAFF', input.id, null, { pin: pin ? 'ตั้ง PIN ใหม่' : 'ล้าง PIN' });
  refresh();
  return { error: null };
}
