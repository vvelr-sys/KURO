'use client';

import { useRealtimeRefresh } from './useRealtimeRefresh';

/** ตารางที่มีผลกับหน้าเรียกพนักงาน (ประกาศนอก Component เพื่อไม่ให้ต่อ channel ใหม่ทุก render) */
const SERVICE_REQUEST_WATCHED_TABLES = [{ table: 'service_requests' }];

/**
 * Realtime ของหน้าเรียกพนักงาน (channel "service-requests" ตาม AGENTS ส่วน 6.4)
 * ลูกค้ากดเรียก / พนักงานคนอื่นรับเรื่อง → หน้านี้อัปเดตเอง
 */
export function useServiceRequestRealtime() {
  useRealtimeRefresh('service-requests', SERVICE_REQUEST_WATCHED_TABLES);
}
