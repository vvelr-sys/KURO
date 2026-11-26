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

// ช่องที่เก็บลง Audit Log (ก่อน/หลังแก้)
const CATEGORY_AUDIT_COLUMNS = 'name, display_order, is_active';
const MENU_AUDIT_COLUMNS = 'category_id, name, description, image_url, extra_price, kitchen_station, max_quantity_per_order';

/**
 * บันทึก Audit Log ของหน้าเมนู (ไม่ใช้ .select() ต่อท้าย เพราะคนบันทึกไม่จำเป็นต้องมีสิทธิ์อ่าน audit_logs)
 * บันทึกไม่สำเร็จจะไม่ยกเลิกรายการหลัก แค่เขียน log ฝั่งเซิร์ฟเวอร์ไว้ตรวจสอบ
 * @param {any} supabase
 * @param {{ actorId: string, action: string, targetEntity: 'menu_items'|'categories', targetId: string, before?: object|null, after?: object|null }} entry
 */
async function writeMenuAudit(supabase, { actorId, action, targetEntity, targetId, before = null, after = null }) {
  const { error } = await supabase.from('audit_logs').insert({
    actor_id: actorId,
    action,
    target_entity: targetEntity,
    target_id: targetId,
    payload_before: before,
    payload_after: after,
  });
  if (error) console.error('[menu audit]', action, error.message);
}

/** เอาเฉพาะช่องที่ค่าเปลี่ยน (ให้ Audit Log อ่านง่าย) */
function pickChanged(before, after) {
  const changedKeys = Object.keys(after).filter((key) => String(before?.[key] ?? '') !== String(after[key] ?? ''));
  return {
    before: Object.fromEntries(changedKeys.map((key) => [key, before?.[key] ?? null])),
    after: Object.fromEntries(changedKeys.map((key) => [key, after[key]])),
    hasChanges: changedKeys.length > 0,
  };
}

/**
 * เพิ่ม/แก้หมวดหมู่
 * @param {{ id?: string|null, name: string, displayOrder: number|string, isActive: boolean }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function saveCategory(input) {
  const { staff, error: roleError } = await checkActionRole(MENU_ROLES);
  if (roleError) return { error: roleError };

  const name = String(input?.name ?? '').trim();
  const displayOrder = Number(input?.displayOrder);
  if (!name || name.length > 100) return { error: 'กรอกชื่อหมวดหมู่ 1 - 100 ตัวอักษร' };
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 999) return { error: 'ลำดับการแสดงเป็นเลข 0 - 999' };

  const row = { name, display_order: displayOrder, is_active: input?.isActive !== false };
  const supabase = await createClient();

  // ===== เพิ่มหมวดใหม่ =====
  if (!input?.id) {
    const { data: created, error } = await supabase.from('categories').insert(row).select('id').single();
    if (error) return { error: toDisplayError(error, 'menu category') };
    await writeMenuAudit(supabase, { actorId: staff.id, action: 'CREATE_CATEGORY', targetEntity: 'categories', targetId: created.id, after: row });
    refresh();
    return { error: null };
  }

  // ===== แก้หมวดเดิม (บันทึก Audit เฉพาะช่องที่เปลี่ยน) =====
  const { data: before } = await supabase.from('categories').select(CATEGORY_AUDIT_COLUMNS).eq('id', input.id).maybeSingle();
  if (!before) return { error: 'ไม่พบหมวดหมู่นี้' };

  const { error } = await supabase.from('categories').update(row).eq('id', input.id);
  if (error) return { error: toDisplayError(error, 'menu category') };

  const changes = pickChanged(before, row);
  if (changes.hasChanges) {
    await writeMenuAudit(supabase, {
      actorId: staff.id,
      action: 'UPDATE_CATEGORY',
      targetEntity: 'categories',
      targetId: input.id,
      before: { name: before.name, ...changes.before },
      after: { name: row.name, ...changes.after },
    });
  }

  refresh();
  return { error: null };
}

/**
 * เลื่อนลำดับหมวดหมู่ขึ้น/ลง 1 ตำแหน่ง (ลำดับเดียวกับหน้าลูกค้า)
 * เรียงเลขใหม่ทั้งชุดเป็น 1, 2, 3, ... กันเลขซ้ำ แล้วอัปเดตเฉพาะแถวที่เลขเปลี่ยน
 * @param {{ id: string, direction: 'up'|'down' }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function moveCategory({ id, direction }) {
  const { staff, error: roleError } = await checkActionRole(MENU_ROLES);
  if (roleError) return { error: roleError };

  const supabase = await createClient();
  const { data: rows, error: loadError } = await supabase.from('categories').select('id, name, display_order').order('display_order').order('name');
  if (loadError) return { error: toDisplayError(loadError, 'menu category move') };

  const ordered = [...rows];
  const index = ordered.findIndex((row) => row.id === id);
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0) return { error: 'ไม่พบหมวดหมู่นี้' };
  if (targetIndex < 0 || targetIndex >= ordered.length) return { error: null };
  [ordered[index], ordered[targetIndex]] = [ordered[targetIndex], ordered[index]];

  for (const [position, row] of ordered.entries()) {
    if (row.display_order === position + 1) continue;
    const { error } = await supabase.from('categories').update({ display_order: position + 1 }).eq('id', row.id);
    if (error) return { error: toDisplayError(error, 'menu category move') };
  }

  await writeMenuAudit(supabase, {
    actorId: staff.id,
    action: 'REORDER_CATEGORY',
    targetEntity: 'categories',
    targetId: id,
    before: { order: rows.map((row) => row.name) },
    after: { order: ordered.map((row) => row.name) },
  });

  refresh();
  return { error: null };
}

/**
 * ลบหมวดหมู่ — ได้เฉพาะหมวดที่ไม่มีเมนูอยู่ (มีเมนูให้ปิดหมวดแทน)
 * @param {{ id: string }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function deleteCategory({ id }) {
  const { staff, error: roleError } = await checkActionRole(MENU_ROLES);
  if (roleError) return { error: roleError };

  const supabase = await createClient();
  const { count, error: countError } = await supabase.from('menu_items').select('id', { count: 'exact', head: true }).eq('category_id', id);
  if (countError) return { error: toDisplayError(countError, 'menu category delete') };
  if ((count ?? 0) > 0) return { error: 'หมวดนี้ยังมีเมนูอยู่ ลบไม่ได้ — ย้ายเมนูออกก่อน หรือปิดหมวดแทน' };

  const { data: before } = await supabase.from('categories').select(CATEGORY_AUDIT_COLUMNS).eq('id', id).maybeSingle();
  if (!before) return { error: 'ไม่พบหมวดหมู่นี้' };

  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) {
    // 23503 = มีข้อมูลอื่นอ้างถึงหมวดนี้อยู่
    if (error.code === '23503') return { error: 'หมวดนี้ยังมีเมนูอยู่ ลบไม่ได้ — ย้ายเมนูออกก่อน หรือปิดหมวดแทน' };
    return { error: toDisplayError(error, 'menu category delete') };
  }

  await writeMenuAudit(supabase, { actorId: staff.id, action: 'DELETE_CATEGORY', targetEntity: 'categories', targetId: id, before });

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
  const { staff, error: roleError } = await checkActionRole(MENU_ROLES);
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
    const { data: created, error } = await supabase.from('menu_items').insert({ ...row, availability_status: 'available' }).select('id').single();
    if (error) return { error: toDisplayError(error, 'menu save'), fieldErrors: {} };
    const { updated_at: _skip, ...auditRow } = row;
    await writeMenuAudit(supabase, { actorId: staff.id, action: 'CREATE_MENU', targetEntity: 'menu_items', targetId: created.id, after: auditRow });
    refresh();
    return { error: null, fieldErrors: {} };
  }

  const { data: before } = await supabase.from('menu_items').select(MENU_AUDIT_COLUMNS).eq('id', input.id).maybeSingle();
  if (!before) return { error: 'ไม่พบเมนูนี้', fieldErrors: {} };

  const { error } = await supabase.from('menu_items').update(row).eq('id', input.id);
  if (error) return { error: toDisplayError(error, 'menu save'), fieldErrors: {} };

  // Audit เฉพาะช่องที่เปลี่ยน (ใส่ชื่อเมนูไว้เสมอ ให้รู้ว่าแก้เมนูไหน)
  const { updated_at: _skip, ...auditRow } = row;
  const changes = pickChanged(before, auditRow);
  if (changes.hasChanges) {
    await writeMenuAudit(supabase, {
      actorId: staff.id,
      action: 'UPDATE_MENU',
      targetEntity: 'menu_items',
      targetId: input.id,
      before: { name: before.name, ...changes.before },
      after: { name: auditRow.name, ...changes.after },
    });
  }

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
  const { staff, error: roleError } = await checkActionRole(MENU_ROLES);
  if (roleError) return { error: roleError };

  const supabase = await createClient();
  const { data: before } = await supabase.from('menu_items').select(MENU_AUDIT_COLUMNS).eq('id', id).maybeSingle();
  if (!before) return { error: 'ไม่พบเมนูนี้' };

  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) {
    // 23503 = มีออเดอร์อ้างถึงเมนูนี้อยู่
    if (error.code === '23503') return { error: 'เมนูนี้เคยถูกสั่งแล้ว ลบไม่ได้ — ให้ปิดขายแทน' };
    return { error: toDisplayError(error, 'menu delete') };
  }

  await writeMenuAudit(supabase, { actorId: staff.id, action: 'DELETE_MENU', targetEntity: 'menu_items', targetId: id, before });
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
