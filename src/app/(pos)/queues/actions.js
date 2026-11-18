'use server';

import { refresh } from 'next/cache';
import { getRequestOrigin, toDisplayError } from '@/lib/action-helpers';
import { checkActionRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getBangkokDayStartIso } from '@/lib/utils';

// Server Actions ของหน้าจัดการคิว (งานจริงทำในฟังก์ชันฐานข้อมูล migration 006)

/** ตำแหน่งที่จัดการคิวได้ (staff ออก/เรียกคิวไม่ได้ ตาม FR-066, FR-068) */
const QUEUE_ROLES = ['admin', 'manager', 'cashier'];
const QUEUE_ACTIONS = ['call', 'recall', 'skip', 'cancel'];

/**
 * @typedef {Object} QueueTicket
 * @property {string} queueId
 * @property {string} queueNumber
 * @property {'small'|'medium'|'large'} tableSize
 * @property {number} adultCount
 * @property {number} childCount
 * @property {string} createdAt - เวลารับคิว (ISO)
 * @property {number} queuesAhead - จำนวนคิวขนาดเดียวกันที่รออยู่ก่อนหน้า
 * @property {string} url - URL หน้าดูคิวของลูกค้า (อยู่ใน QR)
 */

/**
 * ประกอบข้อมูลบัตรคิวจากฐานข้อมูล (นับคิวก่อนหน้า ณ ตอนนี้)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} queueId
 * @returns {Promise<QueueTicket|null>}
 */
async function buildQueueTicket(supabase, queueId) {
  const { data: queue } = await supabase
    .from('queues')
    .select('id, queue_number, table_size, adult_count, child_count, created_at')
    .eq('id', queueId)
    .maybeSingle();
  if (!queue) return null;

  // คิวก่อนหน้า = คิวขนาดเดียวกันของวันนี้ที่ยังรอเรียก และรับคิวก่อนคิวนี้
  const { count } = await supabase
    .from('queues')
    .select('id', { count: 'exact', head: true })
    .eq('table_size', queue.table_size)
    .eq('status', 'waiting')
    .gte('created_at', getBangkokDayStartIso())
    .lt('created_at', queue.created_at);

  return {
    queueId: queue.id,
    queueNumber: queue.queue_number,
    tableSize: queue.table_size,
    adultCount: queue.adult_count,
    childCount: queue.child_count,
    createdAt: queue.created_at,
    queuesAhead: count ?? 0,
    url: new URL(`/queue/${queue.id}`, await getRequestOrigin()).toString(),
  };
}

/**
 * ออกบัตรคิวใหม่
 * @param {{ adultCount: number, childCount: number, tableSize: 'small'|'medium'|'large' }} input
 * @returns {Promise<{ error: string|null, ticket: QueueTicket|null }>}
 */
export async function issueQueue({ adultCount, childCount, tableSize }) {
  const { error: roleError } = await checkActionRole(QUEUE_ROLES);
  if (roleError) return { error: roleError, ticket: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_issue_queue', {
    p_adult_count: adultCount,
    p_child_count: childCount,
    p_table_size: tableSize,
  });
  if (error) return { error: toDisplayError(error, 'queues action'), ticket: null };

  refresh();
  const ticket = await buildQueueTicket(supabase, data[0].queue_id);
  if (!ticket) return { error: 'ออกคิวแล้ว แต่สร้างบัตรไม่สำเร็จ กรุณากดพิมพ์ซ้ำ', ticket: null };
  return { error: null, ticket };
}

/**
 * ข้อมูลบัตรคิวสำหรับพิมพ์ซ้ำ
 * @param {{ queueId: string }} input
 * @returns {Promise<{ error: string|null, ticket: QueueTicket|null }>}
 */
export async function getQueueTicket({ queueId }) {
  const { error: roleError } = await checkActionRole(QUEUE_ROLES);
  if (roleError) return { error: roleError, ticket: null };

  const supabase = await createClient();
  const ticket = await buildQueueTicket(supabase, queueId);
  if (!ticket) return { error: 'ไม่พบคิวนี้', ticket: null };
  return { error: null, ticket };
}

/**
 * เรียก / เรียกซ้ำ / ข้าม / ยกเลิกคิว
 * @param {{ queueId: string, action: 'call'|'recall'|'skip'|'cancel' }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function updateQueueStatus({ queueId, action }) {
  const { error: roleError } = await checkActionRole(QUEUE_ROLES);
  if (roleError) return { error: roleError };
  if (!QUEUE_ACTIONS.includes(action)) return { error: 'คำสั่งไม่ถูกต้อง' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('fn_update_queue_status', { p_queue_id: queueId, p_action: action });
  if (error) return { error: toDisplayError(error, 'queues action') };

  refresh();
  return { error: null };
}
