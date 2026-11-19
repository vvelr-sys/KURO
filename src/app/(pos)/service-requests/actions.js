'use server';

import { refresh } from 'next/cache';
import { toDisplayError } from '@/lib/action-helpers';
import { checkActionRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

// Server Actions ของหน้าเรียกพนักงาน (ตาราง service_requests — RLS ให้ staff / manager / admin แก้ได้)
// ใช้เงื่อนไขสถานะเดิมใน UPDATE กันพนักงาน 2 คนกดพร้อมกัน: ถ้าคนอื่นทำไปแล้ว จะไม่มีแถวถูกแก้

const SERVICE_ROLES = ['admin', 'manager', 'staff'];

/**
 * รับเรื่อง: รอดำเนินการ → กำลังดำเนินการ (บันทึกว่าใครรับ)
 * @param {{ requestId: string }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function acceptServiceRequest({ requestId }) {
  const { staff, error: roleError } = await checkActionRole(SERVICE_ROLES);
  if (roleError) return { error: roleError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('service_requests')
    .update({ status: 'in_progress', handled_by: staff.id })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id');

  if (error) return { error: toDisplayError(error, 'service-requests action') };
  if (data.length === 0) return { error: 'มีพนักงานคนอื่นรับเรื่องนี้ไปแล้ว' };

  refresh();
  return { error: null };
}

/**
 * เสร็จสิ้น: รอดำเนินการ / กำลังดำเนินการ → เสร็จแล้ว
 * (ถ้ายังไม่มีคนรับ จะบันทึกว่าคนที่กดเสร็จเป็นผู้รับเรื่อง)
 * @param {{ requestId: string, hasHandler: boolean }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function completeServiceRequest({ requestId, hasHandler }) {
  const { staff, error: roleError } = await checkActionRole(SERVICE_ROLES);
  if (roleError) return { error: roleError };

  const changes = { status: 'completed', completed_at: new Date().toISOString() };
  if (!hasHandler) changes.handled_by = staff.id;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('service_requests')
    .update(changes)
    .eq('id', requestId)
    .in('status', ['pending', 'in_progress'])
    .select('id');

  if (error) return { error: toDisplayError(error, 'service-requests action') };
  if (data.length === 0) return { error: 'เรื่องนี้เสร็จไปแล้ว' };

  refresh();
  return { error: null };
}
