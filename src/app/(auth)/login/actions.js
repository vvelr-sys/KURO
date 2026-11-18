'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPathAfterLogin } from '@/lib/auth/permissions';

/**
 * @typedef {Object} SignInState
 * @property {string|null} error - ข้อความ error ภาษาไทย (null = ไม่มี error)
 * @property {string} email - อีเมลที่กรอกไว้ (ให้ฟอร์มไม่ต้องพิมพ์ใหม่เมื่อผิด)
 */

/**
 * แปลง error ของ Supabase เป็นข้อความภาษาไทยที่พนักงานเข้าใจ
 * @param {{ code?: string, status?: number }} error
 * @returns {string}
 */
function toThaiErrorMessage(error) {
  if (error.code === 'over_request_rate_limit' || error.status === 429) {
    return 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่';
  }
  if (error.code === 'email_not_confirmed') {
    return 'บัญชีนี้ยังไม่ได้ยืนยันอีเมล กรุณาติดต่อผู้ดูแลระบบ';
  }
  // รวมกรณีอีเมลไม่มีในระบบและรหัสผิดเป็นข้อความเดียว ไม่บอกว่าผิดช่องไหน (กันการเดาอีเมล)
  return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
}

/**
 * เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน (ใช้กับ useActionState ในฟอร์ม)
 * สำเร็จ → redirect ไปหน้าที่ขอไว้ (?next=) ถ้ามีสิทธิ์ ไม่อย่างนั้นไปหน้าแรกของตำแหน่ง
 * @param {SignInState} previousState
 * @param {FormData} formData - email, password, next
 * @returns {Promise<SignInState>}
 */
export async function signIn(previousState, formData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const requestedPath = formData.get('next');

  if (!email || !password) {
    return { error: 'กรุณากรอกอีเมลและรหัสผ่าน', email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: toThaiErrorMessage(error), email };
  }

  // รหัสถูก แต่ต้องเป็นพนักงานที่มี profile และยังเปิดใช้งานอยู่
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { error: 'บัญชีนี้ถูกปิดใช้งาน หรือยังไม่ได้กำหนดตำแหน่ง กรุณาติดต่อผู้ดูแลระบบ', email };
  }

  // redirect ต้องอยู่นอก try/catch เพราะทำงานด้วยการ throw
  redirect(getPathAfterLogin(profile.role, requestedPath));
}

/**
 * ออกจากระบบ แล้วกลับไปหน้า /login
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
