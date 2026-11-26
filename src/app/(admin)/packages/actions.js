'use server';

import { refresh } from 'next/cache';
import { toDisplayError } from '@/lib/action-helpers';
import { checkActionRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ROUTE_PERMISSIONS } from '@/lib/constants';

// Server Action ของหน้าราคาบุฟเฟต์ (admin เท่านั้น — RLS admin_full_packages / admin_full_app_settings ตรวจซ้ำ)
const PACKAGE_ROLES = ROUTE_PERMISSIONS['/packages'];

/** ปัดเป็นสตางค์ */
const roundMoney = (value) => Math.round(value * 100) / 100;

/**
 * บันทึกราคาบุฟเฟต์ + VAT แล้วบันทึก Audit UPDATE_PACKAGE เฉพาะค่าที่เปลี่ยน
 * - มีผลกับโต๊ะที่เปิด "หลังบันทึก" เท่านั้น (โต๊ะที่เปิดอยู่ล็อกราคาไว้แล้ว — กฎข้อ 2)
 * - ยังไม่มีแพ็กเกจ → สร้างใหม่ 1 ตัว (ระบบเปิดโต๊ะได้เมื่อมีแพ็กเกจเปิดใช้งาน 1 ตัวพอดี)
 *
 * @param {{ packageId: string|null, name: string, adultPrice: number|string, childPrice: number|string, durationMinutes: number|string, vatRatePercent: number|string }} input
 * @returns {Promise<{ error: string|null, fieldErrors: Record<string, string> }>}
 */
export async function saveBuffetPackage(input) {
  const { staff, error: roleError } = await checkActionRole(PACKAGE_ROLES);
  if (roleError) return { error: roleError, fieldErrors: {} };

  // ===== ตรวจข้อมูล =====
  const name = String(input?.name ?? '').trim();
  const adultPrice = Number(input?.adultPrice);
  const childPrice = Number(input?.childPrice);
  const durationMinutes = Number(input?.durationMinutes);
  const vatRatePercent = Number(input?.vatRatePercent);

  const fieldErrors = {};
  if (!name || name.length > 100) fieldErrors.name = 'กรอกชื่อแพ็กเกจ 1 - 100 ตัวอักษร';
  if (!Number.isFinite(adultPrice) || adultPrice < 0 || adultPrice > 100000) fieldErrors.adultPrice = 'กรอกราคา 0 - 100,000 บาท';
  if (!Number.isFinite(childPrice) || childPrice < 0 || childPrice > 100000) fieldErrors.childPrice = 'กรอกราคา 0 - 100,000 บาท';
  else if (Number.isFinite(adultPrice) && childPrice > adultPrice) fieldErrors.childPrice = 'ราคาเด็กต้องไม่มากกว่าราคาผู้ใหญ่';
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 600) fieldErrors.durationMinutes = 'กรอกเป็นนาที 15 - 600 (จำนวนเต็ม)';
  if (!Number.isFinite(vatRatePercent) || vatRatePercent < 0 || vatRatePercent > 30) fieldErrors.vatRatePercent = 'กรอก 0 - 30 %';
  if (Object.keys(fieldErrors).length > 0) return { error: 'กรุณาตรวจสอบข้อมูลที่กรอก', fieldErrors };

  const after = {
    name,
    adult_price: roundMoney(adultPrice),
    child_price: roundMoney(childPrice),
    duration_minutes: durationMinutes,
    vat_rate_percent: String(roundMoney(vatRatePercent)),
  };

  const supabase = await createClient();

  // ===== ค่าเดิม =====
  const [{ data: activePackages, error: packageError }, { data: vatRow }] = await Promise.all([
    supabase.from('packages').select('id, name, adult_price, child_price, duration_minutes').eq('is_active', true),
    supabase.from('app_settings').select('value').eq('key', 'vat_rate_percent').maybeSingle(),
  ]);
  if (packageError) return { error: toDisplayError(packageError, 'packages action'), fieldErrors: {} };
  if ((activePackages ?? []).length > 1) {
    return { error: 'มีแพ็กเกจเปิดใช้งานมากกว่า 1 รายการ กรุณาให้ผู้ดูแลฐานข้อมูลปิดให้เหลือรายการเดียว', fieldErrors: {} };
  }

  const current = activePackages?.[0] ?? null;
  if (current && input?.packageId && current.id !== input.packageId) {
    return { error: 'ข้อมูลแพ็กเกจเปลี่ยนไปแล้ว กรุณารีเฟรชหน้า', fieldErrors: {} };
  }

  const before = {
    name: current?.name ?? null,
    adult_price: current ? Number(current.adult_price) : null,
    child_price: current ? Number(current.child_price) : null,
    duration_minutes: current?.duration_minutes ?? null,
    vat_rate_percent: vatRow?.value ?? null,
  };
  const changedKeys = Object.keys(after).filter((key) => String(before[key] ?? '') !== String(after[key]));
  if (changedKeys.length === 0) return { error: null, fieldErrors: {} };

  // ===== บันทึกแพ็กเกจ =====
  const packageRow = {
    name: after.name,
    adult_price: after.adult_price,
    child_price: after.child_price,
    duration_minutes: after.duration_minutes,
    updated_at: new Date().toISOString(),
  };
  const packageSave = current
    ? await supabase.from('packages').update(packageRow).eq('id', current.id).select('id').single()
    : await supabase.from('packages').insert({ ...packageRow, is_active: true }).select('id').single();
  if (packageSave.error) return { error: toDisplayError(packageSave.error, 'packages action'), fieldErrors: {} };

  // ===== บันทึก VAT (ใช้กับบิลที่ออกใหม่) =====
  if (changedKeys.includes('vat_rate_percent')) {
    const { error: vatError } = await supabase
      .from('app_settings')
      .upsert({ key: 'vat_rate_percent', value: after.vat_rate_percent, updated_by: staff.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (vatError) return { error: toDisplayError(vatError, 'packages action'), fieldErrors: {} };
  }

  await supabase.from('audit_logs').insert({
    actor_id: staff.id,
    action: 'UPDATE_PACKAGE',
    target_entity: 'packages',
    target_id: packageSave.data.id,
    payload_before: Object.fromEntries(changedKeys.map((key) => [key, before[key]])),
    payload_after: Object.fromEntries(changedKeys.map((key) => [key, after[key]])),
  });

  refresh();
  return { error: null, fieldErrors: {} };
}
