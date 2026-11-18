import 'server-only';
import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBangkokDayStartIso } from '@/lib/utils';

/**
 * @typedef {Object} QueueItem
 * @property {string} id
 * @property {string} queueNumber - เช่น B025
 * @property {'small'|'medium'|'large'} tableSize
 * @property {number} adultCount
 * @property {number} childCount
 * @property {'waiting'|'called'|'seated'|'skipped'|'cancelled'} status
 * @property {string} createdAt - เวลารับคิว (ISO)
 * @property {string|null} calledAt - เวลาเรียกล่าสุด (ISO)
 */

/**
 * ข้อมูลหน้าจัดการคิว: คิวของวันนี้ทั้งหมด (เวลาไทย) + จำนวนโต๊ะว่างแยกตามความจุ
 * @returns {Promise<{ queues: QueueItem[], availableTableCapacities: number[], totalTableCount: number, error: string|null }>}
 */
export async function getQueuePageData() {
  // ข้อมูลต้องสดทุกครั้ง + Supabase ใช้ Date.now() (ดูหมายเหตุใน tables/data.js)
  await connection();
  const supabase = await createClient();

  const [queuesResult, tablesResult] = await Promise.all([
    supabase
      .from('queues')
      .select('id, queue_number, table_size, adult_count, child_count, status, created_at, called_at')
      .gte('created_at', getBangkokDayStartIso())
      .order('created_at'),
    supabase.from('dining_tables').select('capacity, status'),
  ]);

  if (queuesResult.error || tablesResult.error) {
    return { queues: [], availableTableCapacities: [], totalTableCount: 0, error: 'โหลดข้อมูลคิวไม่สำเร็จ กรุณารีเฟรชหน้า' };
  }

  const queues = queuesResult.data.map((queue) => ({
    id: queue.id,
    queueNumber: queue.queue_number,
    tableSize: queue.table_size,
    adultCount: queue.adult_count,
    childCount: queue.child_count,
    status: queue.status,
    createdAt: queue.created_at,
    calledAt: queue.called_at,
  }));

  return {
    queues,
    availableTableCapacities: tablesResult.data.filter((table) => table.status === 'available').map((table) => table.capacity),
    totalTableCount: tablesResult.data.length,
    error: null,
  };
}
