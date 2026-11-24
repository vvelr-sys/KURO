'use server';

import { toDisplayError } from '@/lib/action-helpers';
import { checkActionRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ROUTE_PERMISSIONS, STOCK_COUNT_ROUNDS, STOCK_MOVEMENT_TYPES } from '@/lib/constants';

// Server Actions ของหน้านับสต็อก (staff, manager, admin)
// ทุกงานเรียกฟังก์ชันในฐานข้อมูล (migration 022) ซึ่งตรวจ role ซ้ำอีกชั้น
// staff ไม่ได้สิทธิ์อ่านตารางสต็อกตรงๆ → นับแบบไม่เห็นยอดในระบบได้จริง

const STOCK_COUNT_ROLES = ROUTE_PERMISSIONS['/stock-count'];

/**
 * ดึงข้อมูลสำหรับหน้านับสต็อก: รายชื่อวัตถุดิบ (ไม่มียอดคงเหลือ) และสถานะรอบนับของวันนี้
 * @returns {Promise<{ ingredients: Array<{ id: string, name: string, unit: string }>, todayRounds: Array<{ count_round: string, status: string, counted_at: string }>, error: string|null }>}
 */
export async function getCountSheet() {
  const { error: roleError } = await checkActionRole(STOCK_COUNT_ROLES);
  if (roleError) return { ingredients: [], todayRounds: [], error: roleError };

  const supabase = await createClient();
  const [ingredientsResult, roundsResult] = await Promise.all([
    supabase.rpc('fn_ingredients_for_count'),
    supabase.rpc('fn_today_stock_count_rounds'),
  ]);

  const firstError = ingredientsResult.error ?? roundsResult.error;
  if (firstError) {
    return { ingredients: [], todayRounds: [], error: toDisplayError(firstError, 'stock-count load') };
  }

  return {
    ingredients: ingredientsResult.data ?? [],
    todayRounds: roundsResult.data ?? [],
    error: null,
  };
}

/**
 * ส่งผลนับสต็อก
 * ถ้ามีรายการที่ต่างจากระบบเกิน 10% และยังไม่ยืนยันนับซ้ำ ระบบจะยังไม่บันทึก
 * แต่ส่งรายชื่อวัตถุดิบที่ควรนับซ้ำกลับมา (ไม่บอกยอดในระบบ)
 *
 * @param {'opening'|'closing'} countRound - รอบการนับ
 * @param {Array<{ ingredient_id: string, counted_stock: number, reason?: string }>} items - ผลนับทุกวัตถุดิบ
 * @param {boolean} confirmRecount - true = นับซ้ำแล้ว ยืนยันส่ง
 * @returns {Promise<{ status: 'submitted'|'need_recount'|null, recountIds: string[], error: string|null }>}
 */
export async function submitStockCount(countRound, items, confirmRecount = false) {
  const { error: roleError } = await checkActionRole(STOCK_COUNT_ROLES);
  if (roleError) return { status: null, recountIds: [], error: roleError };

  if (!Object.values(STOCK_COUNT_ROUNDS).includes(countRound)) {
    return { status: null, recountIds: [], error: 'กรุณาเลือกรอบการนับ' };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { status: null, recountIds: [], error: 'ยังไม่มีผลนับ' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_submit_stock_count', {
    p_count_round: countRound,
    p_items: items,
    p_confirm_recount: Boolean(confirmRecount),
  });

  if (error) return { status: null, recountIds: [], error: toDisplayError(error, 'stock-count submit') };

  if (data?.status === 'need_recount') {
    return { status: 'need_recount', recountIds: data.ingredient_ids ?? [], error: null };
  }
  return { status: 'submitted', recountIds: [], error: null };
}

/**
 * บันทึกรับของเข้า หรือ ของเสีย
 * @param {string} ingredientId - UUID วัตถุดิบ
 * @param {'manual_restock'|'kitchen_waste'} movementType
 * @param {number} quantity - จำนวน (ค่าบวกเสมอ)
 * @param {string|null} reason - เหตุผล (บังคับเมื่อเป็นของเสีย)
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function recordStockMovement(ingredientId, movementType, quantity, reason = null) {
  const { error: roleError } = await checkActionRole(STOCK_COUNT_ROLES);
  if (roleError) return { success: false, error: roleError };

  const allowedTypes = [STOCK_MOVEMENT_TYPES.MANUAL_RESTOCK, STOCK_MOVEMENT_TYPES.KITCHEN_WASTE];
  if (!allowedTypes.includes(movementType)) {
    return { success: false, error: 'ประเภทรายการไม่ถูกต้อง' };
  }

  const amount = Number(quantity);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: 'จำนวนต้องมากกว่า 0' };
  }

  const trimmedReason = reason?.trim() || null;
  if (movementType === STOCK_MOVEMENT_TYPES.KITCHEN_WASTE && !trimmedReason) {
    return { success: false, error: 'กรุณาระบุเหตุผลของเสีย' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('fn_record_stock_movement', {
    p_ingredient_id: ingredientId,
    p_movement_type: movementType,
    p_quantity: amount,
    p_reason: trimmedReason,
  });

  if (error) return { success: false, error: toDisplayError(error, 'stock-count movement') };
  return { success: true, error: null };
}
