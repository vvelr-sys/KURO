'use client';

import { useRealtimeRefresh } from './useRealtimeRefresh';

/** ตารางที่มีผลกับผังโต๊ะ (ประกาศนอก Component เพื่อไม่ให้ต่อ channel ใหม่ทุก render) */
const TABLE_MAP_WATCHED_TABLES = [
  { table: 'dining_tables', event: 'UPDATE' }, // เปิด/ย้าย/เก็บ/ปิดใช้งานโต๊ะ
  { table: 'sessions' }, // สถานะรอบ (เชิญออก, ออกบิล, ปิดรอบ)
  { table: 'order_items' }, // จำนวนจานที่สั่ง/ที่รอ
  { table: 'queues' }, // คิวที่เรียกแล้ว (ใช้ตอนเปิดโต๊ะจากคิว)
];

/**
 * Realtime ของผังโต๊ะ (channel "table-status" ตาม AGENTS ส่วน 6.4)
 * เครื่องอื่นเปิด/ย้าย/เก็บโต๊ะ, ลูกค้าสั่งอาหาร, หรือเรียกคิว → หน้านี้อัปเดตเอง
 */
export function useTableRealtime() {
  useRealtimeRefresh('table-status', TABLE_MAP_WATCHED_TABLES);
}
