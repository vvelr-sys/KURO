'use client';

import { useRealtimeRefresh } from './useRealtimeRefresh';

/** ตารางที่มีผลกับหน้าคิดเงิน (ประกาศนอก Component เพื่อไม่ให้ต่อ channel ใหม่ทุก render) */
const BILLING_WATCHED_TABLES = [
  { table: 'sessions' }, // เชิญออก / ออกบิล / ปิดรอบ
  { table: 'bills' }, // ส่วนลด / ชำระแล้ว (จากเครื่องอื่น)
  { table: 'order_items' }, // เมนูนอกบุฟเฟต์ที่ลูกค้าสั่งเพิ่ม (ก่อนออกบิล)
];

/**
 * Realtime ของหน้าคิดเงิน — แคชเชียร์หลายเครื่องเห็นสถานะบิลตรงกัน
 */
export function useBillingRealtime() {
  useRealtimeRefresh('billing-updates', BILLING_WATCHED_TABLES);
}
