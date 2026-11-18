'use client';

import { useRealtimeRefresh } from './useRealtimeRefresh';

/** ตารางที่มีผลกับหน้าคิว (ประกาศนอก Component เพื่อไม่ให้ต่อ channel ใหม่ทุก render) */
const QUEUE_WATCHED_TABLES = [
  { table: 'queues' }, // ออก/เรียก/ข้าม/ยกเลิก/เข้าโต๊ะ
  { table: 'dining_tables', event: 'UPDATE' }, // จำนวนโต๊ะว่าง
];

/**
 * Realtime ของหน้าจัดการคิว (channel "queue-updates" ตาม AGENTS ส่วน 6.4)
 * แคชเชียร์อีกเครื่องออก/เรียกคิว หรือมีโต๊ะว่างเพิ่ม → หน้านี้อัปเดตเอง
 */
export function useQueueRealtime() {
  useRealtimeRefresh('queue-updates', QUEUE_WATCHED_TABLES);
}
