'use server';

import { refresh } from 'next/cache';
import { getRequestOrigin, toDisplayError } from '@/lib/action-helpers';
import { checkActionRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { buildOrderUrl, createQrToken } from '@/lib/qr-token';

// Server Actions ของหน้าผังโต๊ะ
// งานจริงทำในฟังก์ชันฐานข้อมูล (migration 005) ซึ่งตรวจสิทธิ์ซ้ำและทำทุกขั้นตอนใน Transaction เดียว
// ที่นี่ตรวจสิทธิ์ก่อนอีกชั้น (ตอบ error เร็ว ไม่ต้องยิงฐานข้อมูล) แล้วสั่ง refresh() ให้หน้าเว็บดึงข้อมูลใหม่

/** ตำแหน่งที่ทำงานหน้าร้านได้ (ย้ายโต๊ะ, เก็บโต๊ะ, เชิญออก, ชั่งเนื้อ, พิมพ์ QR) */
const FLOOR_ROLES = ['admin', 'manager', 'cashier', 'staff'];
/** ตำแหน่งที่เปิดโต๊ะได้ */
const OPEN_TABLE_ROLES = ['admin', 'manager', 'cashier'];
/** ตำแหน่งที่เปิด/ปิดใช้งานโต๊ะได้ */
const DISABLE_TABLE_ROLES = ['admin', 'manager'];

/**
 * @typedef {Object} QrTicket
 * @property {string} url - URL ที่อยู่ใน QR
 * @property {string} tableNumber
 * @property {number} adultCount
 * @property {number} childCount
 * @property {number} adultPrice - ราคาผู้ใหญ่ที่ล็อกไว้
 * @property {number} childPrice
 * @property {number} buffetTotal - ค่าบุฟเฟต์รวม (รวม VAT แล้ว)
 * @property {string} startedAt - ISO time
 * @property {string} expiresAt - ISO time
 * @property {number} durationMinutes
 */

/**
 * ประกอบข้อมูลตั๋ว QR จากรอบบริการ (ใช้ค่าที่ล็อกไว้ในฐานข้อมูล ไม่ใช่ค่าที่หน้าจอส่งมา)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} sessionId
 * @param {string} tableNumber
 * @param {string} token
 * @returns {Promise<QrTicket|null>}
 */
async function buildTicket(supabase, sessionId, tableNumber, token) {
  const { data: session } = await supabase
    .from('sessions')
    .select('adult_guest_count, child_guest_count, adult_price_snapshot, child_price_snapshot, duration_minutes_snapshot, started_at, expires_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return null;

  const adultPrice = Number(session.adult_price_snapshot);
  const childPrice = Number(session.child_price_snapshot);
  return {
    url: buildOrderUrl(await getRequestOrigin(), tableNumber, token),
    tableNumber,
    adultCount: session.adult_guest_count,
    childCount: session.child_guest_count,
    adultPrice,
    childPrice,
    buffetTotal: session.adult_guest_count * adultPrice + session.child_guest_count * childPrice,
    startedAt: session.started_at,
    expiresAt: session.expires_at,
    durationMinutes: session.duration_minutes_snapshot,
  };
}

/**
 * เปิดโต๊ะ: สร้างรอบ + ล็อกราคา/เวลา + QR (+ เปลี่ยนคิวเป็น seated ถ้าเลือกคิว)
 * @param {{ tableId: string, tableNumber: string, adultCount: number, childCount: number, queueId?: string|null }} input
 * @returns {Promise<{ error: string|null, ticket: QrTicket|null }>}
 */
export async function openTable({ tableId, tableNumber, adultCount, childCount, queueId = null }) {
  const { error: roleError } = await checkActionRole(OPEN_TABLE_ROLES);
  if (roleError) return { error: roleError, ticket: null };

  const { token, tokenHash } = createQrToken();
  const supabase = await createClient();
  const { data: sessionId, error } = await supabase.rpc('fn_open_table', {
    p_table_id: tableId,
    p_adult_count: adultCount,
    p_child_count: childCount,
    p_token_hash: tokenHash,
    p_queue_id: queueId,
  });
  if (error) return { error: toDisplayError(error, 'tables action'), ticket: null };

  refresh();
  const ticket = await buildTicket(supabase, sessionId, tableNumber, token);
  if (!ticket) return { error: 'เปิดโต๊ะแล้ว แต่สร้าง QR ไม่สำเร็จ กรุณากด "พิมพ์ QR" อีกครั้ง', ticket: null };
  return { error: null, ticket };
}

/**
 * พิมพ์ QR ซ้ำ: สร้าง token ใหม่ (QR เดิมยังใช้ได้จนปิดรอบ)
 * @param {{ sessionId: string, tableNumber: string }} input
 * @returns {Promise<{ error: string|null, ticket: QrTicket|null }>}
 */
export async function reissueQr({ sessionId, tableNumber }) {
  const { error: roleError } = await checkActionRole(FLOOR_ROLES);
  if (roleError) return { error: roleError, ticket: null };

  const { token, tokenHash } = createQrToken();
  const supabase = await createClient();
  const { error } = await supabase.rpc('fn_issue_qr_token', { p_session_id: sessionId, p_token_hash: tokenHash });
  if (error) return { error: toDisplayError(error, 'tables action'), ticket: null };

  const ticket = await buildTicket(supabase, sessionId, tableNumber, token);
  if (!ticket) return { error: 'สร้าง QR ไม่สำเร็จ กรุณาลองใหม่', ticket: null };
  return { error: null, ticket };
}

/**
 * ย้ายโต๊ะ: โต๊ะเดิม → รอเก็บโต๊ะ, โต๊ะใหม่ → มีลูกค้า
 * @param {{ sessionId: string, fromTableId: string, toTableId: string }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function moveTable({ sessionId, fromTableId, toTableId }) {
  const { error: roleError } = await checkActionRole(FLOOR_ROLES);
  if (roleError) return { error: roleError };

  const supabase = await createClient();
  const { error } = await supabase.rpc('fn_move_table', {
    p_session_id: sessionId,
    p_from_table_id: fromTableId,
    p_to_table_id: toTableId,
  });
  if (error) return { error: toDisplayError(error, 'tables action') };

  refresh();
  return { error: null };
}

/**
 * เก็บโต๊ะเสร็จ: รอเก็บโต๊ะ → ว่าง
 * @param {{ tableId: string }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function markTableCleaned({ tableId }) {
  const { error: roleError } = await checkActionRole(FLOOR_ROLES);
  if (roleError) return { error: roleError };

  const supabase = await createClient();
  const { error } = await supabase.rpc('fn_mark_table_cleaned', { p_table_id: tableId });
  if (error) return { error: toDisplayError(error, 'tables action') };

  refresh();
  return { error: null };
}

/**
 * เปิด/ปิดใช้งานโต๊ะ (manager / admin)
 * @param {{ tableId: string, disabled: boolean, reason?: string }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function setTableDisabled({ tableId, disabled, reason = '' }) {
  const { error: roleError } = await checkActionRole(DISABLE_TABLE_ROLES);
  if (roleError) return { error: roleError };

  const supabase = await createClient();
  const { error } = await supabase.rpc('fn_set_table_disabled', {
    p_table_id: tableId,
    p_disabled: disabled,
    p_reason: reason.trim().slice(0, 500),
  });
  if (error) return { error: toDisplayError(error, 'tables action') };

  refresh();
  return { error: null };
}

/**
 * เชิญลูกค้าออก (ย้อนกลับไม่ได้) → เปิดให้ชั่งเนื้อเหลือ
 * @param {{ sessionId: string }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function startClosing({ sessionId }) {
  const { error: roleError } = await checkActionRole(FLOOR_ROLES);
  if (roleError) return { error: roleError };

  const supabase = await createClient();
  const { error } = await supabase.rpc('fn_start_closing', { p_session_id: sessionId });
  if (error) return { error: toDisplayError(error, 'tables action') };

  refresh();
  return { error: null };
}

/**
 * บันทึกน้ำหนักเนื้อเหลือ (กรัม) — ชั่งใหม่ได้จนกว่าจะออกบิล
 * @param {{ sessionId: string, weightGrams: number }} input
 * @returns {Promise<{ error: string|null, penaltyAmount: number|null }>}
 */
export async function recordLeftover({ sessionId, weightGrams }) {
  const { error: roleError } = await checkActionRole(FLOOR_ROLES);
  if (roleError) return { error: roleError, penaltyAmount: null };

  if (!Number.isInteger(weightGrams) || weightGrams < 0) {
    return { error: 'กรุณากรอกน้ำหนักเป็นจำนวนเต็ม (กรัม)', penaltyAmount: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_record_leftover', {
    p_session_id: sessionId,
    p_weight_grams: weightGrams,
  });
  if (error) return { error: toDisplayError(error, 'tables action'), penaltyAmount: null };

  refresh();
  return { error: null, penaltyAmount: Number(data) };
}
