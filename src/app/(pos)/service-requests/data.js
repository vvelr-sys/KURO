import 'server-only';
import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBangkokDayStartIso } from '@/lib/utils';

/**
 * @typedef {Object} ServiceRequestItem
 * @property {string} id
 * @property {string} tableNumber
 * @property {'call_staff'|'water'|'change_pot'|'check_bill'|'other'} requestType
 * @property {'pending'|'in_progress'|'completed'} status
 * @property {string} createdAt - เวลาที่ลูกค้ากดเรียก (ISO)
 * @property {string|null} handlerName - พนักงานที่รับเรื่อง
 */

/**
 * คำขอที่ยังไม่เสร็จ (ทุกวัน — ไม่ให้ตกหล่น) + จำนวนที่เสร็จแล้ววันนี้
 * @returns {Promise<{ requests: ServiceRequestItem[], completedTodayCount: number, error: string|null }>}
 */
export async function getServiceRequestData() {
  // ข้อมูลต้องสดทุกครั้ง + Supabase ใช้ Date.now() (ดูหมายเหตุใน tables/data.js)
  await connection();
  const supabase = await createClient();

  const [openResult, completedResult] = await Promise.all([
    supabase
      .from('service_requests')
      .select('id, request_type, status, created_at, dining_tables(table_number), profiles!service_requests_handled_by_fkey(full_name)')
      .in('status', ['pending', 'in_progress'])
      .order('created_at'),
    supabase
      .from('service_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', getBangkokDayStartIso()),
  ]);

  if (openResult.error || completedResult.error) {
    console.error('[service-requests data]', (openResult.error || completedResult.error).message);
    return { requests: [], completedTodayCount: 0, error: 'โหลดรายการเรียกพนักงานไม่สำเร็จ กรุณารีเฟรชหน้า' };
  }

  const requests = openResult.data.map((request) => ({
    id: request.id,
    tableNumber: request.dining_tables?.table_number ?? '-',
    requestType: request.request_type,
    status: request.status,
    createdAt: request.created_at,
    handlerName: request.profiles?.full_name ?? null,
  }));

  return { requests, completedTodayCount: completedResult.count ?? 0, error: null };
}
