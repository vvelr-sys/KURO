'use server';

import { refresh } from 'next/cache';
import { toDisplayError } from '@/lib/action-helpers';
import { checkActionRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isValidThaiTaxId, normalizeTaxId } from '@/lib/tax-id';
import { STORE_SETTING_KEYS } from './data';

// Server Actions ของหน้าตั้งค่าร้าน (admin เท่านั้น — RLS ของ app_settings / dining_tables ตรวจซ้ำ)

const ADMIN_ONLY = ['admin'];
const TABLE_NUMBER_PATTERN = /^[A-Z0-9-]{1,10}$/;

/** ความยาวสูงสุดของแต่ละช่อง (กันข้อมูลยาวเกินใบเสร็จ) */
const MAX_LENGTH = {
  store_name: 100,
  store_branch: 60,
  store_address: 300,
  store_phone: 30,
  receipt_header_message: 200,
  receipt_footer_message: 200,
};

/**
 * บันทึกข้อมูลร้าน / ข้อความใบเสร็จ / อัตราค่าปรับ + บันทึก Audit Log เฉพาะค่าที่เปลี่ยน
 * @param {Record<string, string>} values - key ตาม STORE_SETTING_KEYS
 * @returns {Promise<{ error: string|null, fieldErrors: Record<string, string> }>}
 */
export async function saveStoreSettings(values) {
  const { staff, error: roleError } = await checkActionRole(ADMIN_ONLY);
  if (roleError) return { error: roleError, fieldErrors: {} };

  // ===== ตรวจข้อมูล =====
  const cleaned = {};
  const fieldErrors = {};
  for (const key of STORE_SETTING_KEYS) cleaned[key] = String(values?.[key] ?? '').trim();

  if (!cleaned.store_name) fieldErrors.store_name = 'กรุณากรอกชื่อร้าน';
  if (!cleaned.store_address) fieldErrors.store_address = 'กรุณากรอกที่อยู่ (ต้องมีบนใบกำกับภาษี)';
  cleaned.store_tax_id = normalizeTaxId(cleaned.store_tax_id);
  if (!isValidThaiTaxId(cleaned.store_tax_id)) fieldErrors.store_tax_id = 'เลขผู้เสียภาษีไม่ถูกต้อง (13 หลัก ตรวจหลักสุดท้ายไม่ผ่าน)';
  for (const [key, maxLength] of Object.entries(MAX_LENGTH)) {
    if (cleaned[key].length > maxLength) fieldErrors[key] = `ยาวเกิน ${maxLength} ตัวอักษร`;
  }
  const penaltyRate = Number(cleaned.penalty_rate_per_100g);
  if (!Number.isFinite(penaltyRate) || penaltyRate < 0 || penaltyRate > 10000) {
    fieldErrors.penalty_rate_per_100g = 'กรอกจำนวนเงิน 0 - 10,000 บาท';
  } else {
    cleaned.penalty_rate_per_100g = String(Math.round(penaltyRate * 100) / 100);
  }
  if (Object.keys(fieldErrors).length > 0) return { error: 'กรุณาตรวจสอบข้อมูลที่กรอก', fieldErrors };

  const supabase = await createClient();

  // ค่าเดิม (เพื่อบันทึกเฉพาะที่เปลี่ยนลง Audit Log)
  const { data: currentRows } = await supabase.from('app_settings').select('key, value').in('key', STORE_SETTING_KEYS);
  const before = Object.fromEntries((currentRows ?? []).map((row) => [row.key, row.value]));
  const changedKeys = STORE_SETTING_KEYS.filter((key) => (before[key] ?? '') !== cleaned[key]);
  if (changedKeys.length === 0) return { error: null, fieldErrors: {} };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('app_settings')
    .upsert(changedKeys.map((key) => ({ key, value: cleaned[key], updated_by: staff.id, updated_at: now })), { onConflict: 'key' });
  if (error) return { error: toDisplayError(error, 'settings action'), fieldErrors: {} };

  await supabase.from('audit_logs').insert({
    actor_id: staff.id,
    action: 'UPDATE_SETTINGS',
    target_entity: 'app_settings',
    target_id: changedKeys.join(','),
    payload_before: Object.fromEntries(changedKeys.map((key) => [key, before[key] ?? null])),
    payload_after: Object.fromEntries(changedKeys.map((key) => [key, cleaned[key]])),
  });

  refresh();
  return { error: null, fieldErrors: {} };
}

/**
 * เพิ่มโต๊ะใหม่
 * @param {{ tableNumber: string, capacity: number }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function addDiningTable({ tableNumber, capacity }) {
  const { error: roleError } = await checkActionRole(ADMIN_ONLY);
  if (roleError) return { error: roleError };

  const number = String(tableNumber ?? '').trim().toUpperCase();
  if (!TABLE_NUMBER_PATTERN.test(number)) return { error: 'เลขโต๊ะใช้ได้เฉพาะ A-Z, 0-9 และ - ไม่เกิน 10 ตัว เช่น T09' };
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) return { error: 'จำนวนที่นั่ง 1 - 50' };

  const supabase = await createClient();
  const { error } = await supabase.from('dining_tables').insert({
    table_number: number,
    capacity,
    status: 'available',
    qr_code_url: `/order/${number}`,
  });
  if (error) {
    if (error.code === '23505') return { error: `มีโต๊ะ ${number} อยู่แล้ว` };
    return { error: toDisplayError(error, 'settings action') };
  }

  refresh();
  return { error: null };
}

/**
 * แก้จำนวนที่นั่งของโต๊ะ
 * @param {{ tableId: string, capacity: number }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function updateTableCapacity({ tableId, capacity }) {
  const { error: roleError } = await checkActionRole(ADMIN_ONLY);
  if (roleError) return { error: roleError };
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) return { error: 'จำนวนที่นั่ง 1 - 50' };

  const supabase = await createClient();
  const { error } = await supabase.from('dining_tables').update({ capacity }).eq('id', tableId);
  if (error) return { error: toDisplayError(error, 'settings action') };

  refresh();
  return { error: null };
}

/**
 * ลบโต๊ะ — ได้เฉพาะโต๊ะที่ไม่เคยมีลูกค้าใช้ (ถ้าเคยใช้แล้วให้ปิดใช้งานที่หน้าผังโต๊ะแทน เพื่อเก็บประวัติบิล)
 * @param {{ tableId: string }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function deleteDiningTable({ tableId }) {
  const { error: roleError } = await checkActionRole(ADMIN_ONLY);
  if (roleError) return { error: roleError };

  const supabase = await createClient();
  const { count } = await supabase.from('session_tables').select('id', { count: 'exact', head: true }).eq('table_id', tableId);
  if ((count ?? 0) > 0) return { error: 'โต๊ะนี้เคยมีลูกค้าใช้แล้ว ลบไม่ได้ — ปิดใช้งานที่หน้าผังโต๊ะแทน' };

  const { error } = await supabase.from('dining_tables').delete().eq('id', tableId);
  if (error) return { error: toDisplayError(error, 'settings action') };

  refresh();
  return { error: null };
}
