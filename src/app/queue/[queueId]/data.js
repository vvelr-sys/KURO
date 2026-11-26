import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { toDisplayError } from '@/lib/action-helpers';

/**
 * @typedef {Object} CustomerQueue
 * @property {string} queueNumber - เช่น A001
 * @property {'small'|'medium'|'large'} tableSize
 * @property {'waiting'|'called'|'seated'|'skipped'|'cancelled'} status
 * @property {number} adultCount
 * @property {number} childCount
 * @property {string} createdAt - ISO
 * @property {string|null} calledAt - เวลาที่เรียกล่าสุด (เรียกซ้ำ = เวลาเปลี่ยน)
 * @property {number} queuesAhead - คิวขนาดเดียวกันที่รออยู่ก่อนหน้า (0 ถ้าไม่ได้รออยู่)
 * @property {string|null} nowCalling - คิวขนาดเดียวกันที่กำลังเรียก
 */

// queue id ใน URL ต้องเป็น UUID (กันส่งค่ามั่วเข้าฐานข้อมูลแล้วได้ error ภาษาอังกฤษ)
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ข้อมูลบัตรคิวสำหรับลูกค้า (fn_customer_get_queue — migration 032) ไม่ต้องล็อกอิน ไม่มีเบอร์โทร
 * @param {string} queueId
 * @returns {Promise<{ queue: CustomerQueue|null, error: string|null }>}
 */
export async function getCustomerQueue(queueId) {
  if (!UUID_PATTERN.test(queueId)) {
    return { queue: null, error: 'ไม่พบบัตรคิวนี้ กรุณาสแกน QR บนบัตรคิวอีกครั้ง' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_customer_get_queue', { p_queue_id: queueId });
  if (error) return { queue: null, error: toDisplayError(error, 'customer queue') };

  return {
    error: null,
    queue: {
      queueNumber: data.queue_number,
      tableSize: data.table_size,
      status: data.status,
      adultCount: data.adult_count,
      childCount: data.child_count,
      createdAt: data.created_at,
      calledAt: data.called_at,
      queuesAhead: data.queues_ahead ?? 0,
      nowCalling: data.now_calling,
    },
  };
}
