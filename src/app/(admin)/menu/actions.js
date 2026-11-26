'use server';

import { refresh } from 'next/cache';
import { toggleMenuAvailability } from '@/app/(kitchen)/stock-override/actions';
import { toDisplayError } from '@/lib/action-helpers';
import { checkActionRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { KITCHEN_STATION_LABELS, ROUTE_PERMISSIONS } from '@/lib/constants';
import { removeStoredImage, toStoragePath } from '@/lib/storage-image';

// Server Action ของหน้าจัดการเมนู (manager, admin — RLS manager_manage_menu / manager_manage_categories ตรวจซ้ำ)
const MENU_ROLES = ROUTE_PERMISSIONS['/menu'];
const VALID_STATIONS = Object.keys(KITCHEN_STATION_LABELS);

/**
 * เพิ่ม/แก้หมวดหมู่
 * @param {{ id?: string|null, name: string, displayOrder: number|string, isActive: boolean }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function saveCategory(input) {
  const { error: roleError } = await checkActionRole(MENU_ROLES);
  if (roleError) return { error: roleError };

  const name = String(input?.name ?? '').trim();
  const displayOrder = Number(input?.displayOrder);
  if (!name || name.length > 100) return { error: 'กรอกชื่อหมวดหมู่ 1 - 100 ตัวอักษร' };
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 999) return { error: 'ลำดับการแสดงเป็นเลข 0 - 999' };

  const row = { name, display_order: displayOrder, is_active: input?.isActive !== false };
  const supabase = await createClient();
  const { error } = input?.id
    ? await supabase.from('categories').update(row).eq('id', input.id)
    : await supabase.from('categories').insert(row);
  if (error) return { error: toDisplayError(error, 'menu category') };

  refresh();
  return { error: null };
}

/**
 * เพิ่ม/แก้เมนู (สถานะเปิด/ปิดขายเปลี่ยนที่ setMenuAvailability · สูตร BOM แก้ที่หน้า /inventory)
 * @param {{ id?: string|null, categoryId: string, name: string, description?: string, imageUrl?: string|null,
 *           extraPrice: number|string, kitchenStation: string, maxQuantityPerOrder?: number|string|null }} input
 * @returns {Promise<{ error: string|null, fieldErrors: Record<string, string> }>}
 */
export async function saveMenuItem(input) {
  const { error: roleError } = await checkActionRole(MENU_ROLES);
  if (roleError) return { error: roleError, fieldErrors: {} };

  const name = String(input?.name ?? '').trim();
  const description = String(input?.description ?? '').trim();
  const extraPrice = Number(input?.extraPrice || 0);
  const maxText = String(input?.maxQuantityPerOrder ?? '').trim();
  const maxQuantity = maxText === '' ? null : Number(maxText);
  const imageUrl = input?.imageUrl || null;

  const fieldErrors = {};
  if (!name || name.length > 150) fieldErrors.name = 'กรอกชื่อเมนู 1 - 150 ตัวอักษร';
  if (description.length > 300) fieldErrors.description = 'ยาวเกิน 300 ตัวอักษร';
  if (!input?.categoryId) fieldErrors.categoryId = 'กรุณาเลือกหมวดหมู่';
  if (!VALID_STATIONS.includes(input?.kitchenStation)) fieldErrors.kitchenStation = 'กรุณาเลือกสถานีครัว';
  if (!Number.isFinite(extraPrice) || extraPrice < 0 || extraPrice > 10000) fieldErrors.extraPrice = 'กรอก 0 - 10,000 บาท';
  if (maxQuantity !== null && (!Number.isInteger(maxQuantity) || maxQuantity < 1 || maxQuantity > 99)) {
    fieldErrors.maxQuantityPerOrder = 'กรอกจำนวนเต็ม 1 - 99 หรือเว้นว่าง = ไม่จำกัด';
  }
  if (imageUrl && !toStoragePath(imageUrl)) fieldErrors.imageUrl = 'รูปต้องอัปโหลดผ่านหน้านี้เท่านั้น';
  if (Object.keys(fieldErrors).length > 0) return { error: 'กรุณาตรวจสอบข้อมูลที่กรอก', fieldErrors };

  const row = {
    category_id: input.categoryId,
    name,
    description: description || null,
    image_url: imageUrl,
    extra_price: Math.round(extraPrice * 100) / 100,
    kitchen_station: input.kitchenStation,
    max_quantity_per_order: maxQuantity,
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();

  if (!input?.id) {
    const { error } = await supabase.from('menu_items').insert({ ...row, availability_status: 'available' });
    if (error) return { error: toDisplayError(error, 'menu save'), fieldErrors: {} };
    refresh();
    return { error: null, fieldErrors: {} };
  }

  const { data: before } = await supabase.from('menu_items').select('image_url').eq('id', input.id).maybeSingle();
  if (!before) return { error: 'ไม่พบเมนูนี้', fieldErrors: {} };

  const { error } = await supabase.from('menu_items').update(row).eq('id', input.id);
  if (error) return { error: toDisplayError(error, 'menu save'), fieldErrors: {} };

  // เปลี่ยน/ลบรูป → ลบไฟล์เก่าออกจาก Storage
  if (before.image_url && before.image_url !== imageUrl) await removeStoredImage(supabase, before.image_url);

  refresh();
  return { error: null, fieldErrors: {} };
}

/**
 * ลบเมนู — ได้เฉพาะเมนูที่ยังไม่เคยถูกสั่ง (เคยสั่งแล้วให้ปิดขายแทน เพื่อเก็บประวัติออเดอร์/รายงาน)
 * @param {{ id: string }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function deleteMenuItem({ id }) {
  const { error: roleError } = await checkActionRole(MENU_ROLES);
  if (roleError) return { error: roleError };

  const supabase = await createClient();
  const { data: before } = await supabase.from('menu_items').select('image_url').eq('id', id).maybeSingle();
  if (!before) return { error: 'ไม่พบเมนูนี้' };

  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) {
    // 23503 = มีออเดอร์อ้างถึงเมนูนี้อยู่
    if (error.code === '23503') return { error: 'เมนูนี้เคยถูกสั่งแล้ว ลบไม่ได้ — ให้ปิดขายแทน' };
    return { error: toDisplayError(error, 'menu delete') };
  }

  await removeStoredImage(supabase, before.image_url);
  refresh();
  return { error: null };
}

/**
 * เปิด/ปิดขายเมนู — ใช้กฎเดียวกับหน้า "เปิด/ปิดเมนู" ของครัว
 * (ปิดต้องมีเหตุผล + Audit MANUAL_OFF_MENU · เมนู out_of_stock เปลี่ยนด้วยมือไม่ได้)
 * @param {{ id: string, isOpen: boolean, reason?: string|null }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function setMenuAvailability({ id, isOpen, reason = null }) {
  const { error: roleError } = await checkActionRole(MENU_ROLES);
  if (roleError) return { error: roleError };

  const result = await toggleMenuAvailability(id, isOpen ? 'available' : 'manual_off', reason);
  if (!result.success) return { error: result.error };

  refresh();
  return { error: null };
}
