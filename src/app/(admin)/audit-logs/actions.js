'use server';

import { toDisplayError } from '@/lib/action-helpers';
import { checkActionRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ROUTE_PERMISSIONS } from '@/lib/constants';

// Server Action ของหน้าประวัติการทำงาน (admin เห็นทั้งหมด / manager เห็นทั้งหมดยกเว้นรายการของ admin — RLS migration 024)
const AUDIT_ROLES = ROUTE_PERMISSIONS['/audit-logs'];
const MAX_ROWS = 300;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** เก็บ UUID ทุกตัวที่อยู่ในข้อมูลก่อน/หลัง (ไล่ลงไปใน array/object) */
function collectUuids(value, found) {
  if (typeof value === 'string') {
    if (UUID_PATTERN.test(value)) found.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectUuids(item, found);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectUuids(item, found);
  }
}

/**
 * แปลง UUID ในข้อมูลก่อน/หลังเป็นชื่อที่อ่านออก (หมวดหมู่ / วัตถุดิบ / เมนู / พนักงาน / โต๊ะ)
 * หาไม่เจอ (ถูกลบไปแล้ว หรือไม่มีสิทธิ์อ่าน) → หน้าจอแสดงรหัสย่อแทน
 * @param {Awaited<ReturnType<typeof createClient>>} supabase
 * @param {Array<object>} rows
 * @returns {Promise<Record<string, string>>} uuid → ชื่อ
 */
async function lookupNames(supabase, rows) {
  const found = new Set();
  for (const row of rows) {
    collectUuids(row.payload_before, found);
    collectUuids(row.payload_after, found);
  }
  const ids = [...found].slice(0, 500);
  if (ids.length === 0) return {};

  const [categories, ingredients, menuItems, people, tables] = await Promise.all([
    supabase.from('categories').select('id, name').in('id', ids),
    supabase.from('ingredients').select('id, name, unit').in('id', ids),
    supabase.from('menu_items').select('id, name').in('id', ids),
    supabase.from('profiles').select('id, full_name').in('id', ids),
    supabase.from('dining_tables').select('id, table_number').in('id', ids),
  ]);

  const names = {};
  for (const row of categories.data ?? []) names[row.id] = row.name;
  for (const row of ingredients.data ?? []) names[row.id] = `${row.name} (${row.unit})`;
  for (const row of menuItems.data ?? []) names[row.id] = row.name;
  for (const row of people.data ?? []) names[row.id] = row.full_name;
  for (const row of tables.data ?? []) names[row.id] = `โต๊ะ ${row.table_number}`;
  return names;
}

/**
 * รายชื่อพนักงานสำหรับตัวกรอง "ผู้ทำรายการ"
 * @returns {Promise<{ staff: Array<{ id: string, full_name: string, role: string }>, error: string|null }>}
 */
export async function getAuditActors() {
  const { error: roleError } = await checkActionRole(AUDIT_ROLES);
  if (roleError) return { staff: [], error: roleError };

  const supabase = await createClient();
  // ระบุคอลัมน์เสมอ (migration 004 ห้าม select('*') กับ profiles)
  const { data, error } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
  if (error) return { staff: [], error: toDisplayError(error, 'audit actors') };
  return { staff: data ?? [], error: null };
}

/**
 * ค้นหาประวัติการทำงาน ล่าสุดก่อน
 * @param {{ fromDate?: string|null, toDate?: string|null, action?: string|null, actorId?: string|null, keyword?: string|null }} filters
 *        fromDate / toDate รูปแบบ YYYY-MM-DD (วันตามเวลาไทย), keyword ค้นในเหตุผล
 * @returns {Promise<{ logs: Array<object>, nameById: Record<string, string>, isTruncated: boolean, error: string|null }>}
 */
export async function getAuditLogs({ fromDate = null, toDate = null, action = null, actorId = null, keyword = null } = {}) {
  const { error: roleError } = await checkActionRole(AUDIT_ROLES);
  if (roleError) return { logs: [], nameById: {}, isTruncated: false, error: roleError };

  const supabase = await createClient();
  let query = supabase
    .from('audit_logs')
    .select(`
      id, action, target_entity, target_id, reason, payload_before, payload_after, created_at,
      actor:profiles!audit_logs_actor_id_fkey ( full_name, role )
    `)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS + 1);

  if (fromDate && DATE_PATTERN.test(fromDate)) query = query.gte('created_at', `${fromDate}T00:00:00+07:00`);
  if (toDate && DATE_PATTERN.test(toDate)) query = query.lte('created_at', `${toDate}T23:59:59.999+07:00`);
  if (action) query = query.eq('action', action);
  if (actorId) query = query.eq('actor_id', actorId);
  const trimmedKeyword = keyword?.trim();
  // ตัดอักขระพิเศษของรูปแบบค้นหาออก กันผลค้นหาเพี้ยน
  if (trimmedKeyword) query = query.ilike('reason', `%${trimmedKeyword.replace(/[%_\\]/g, '')}%`);

  const { data, error } = await query;
  if (error) return { logs: [], nameById: {}, isTruncated: false, error: toDisplayError(error, 'audit logs') };

  const rows = data ?? [];
  const pageRows = rows.slice(0, MAX_ROWS);
  return {
    nameById: await lookupNames(supabase, pageRows),
    logs: pageRows.map((row) => ({
      id: row.id,
      action: row.action,
      targetEntity: row.target_entity,
      targetId: row.target_id,
      reason: row.reason,
      payloadBefore: row.payload_before,
      payloadAfter: row.payload_after,
      createdAt: row.created_at,
      actorName: row.actor?.full_name ?? 'ระบบ',
      actorRole: row.actor?.role ?? null,
    })),
    isTruncated: rows.length > MAX_ROWS,
    error: null,
  };
}
