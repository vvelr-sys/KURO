'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** รอให้ event ที่มาติดๆ กันจบก่อนค่อยดึงข้อมูลใหม่ครั้งเดียว (เช่น เปิดโต๊ะ 1 ครั้งเกิดหลาย event) */
const REFRESH_DELAY_MS = 400;

/**
 * ฟังการเปลี่ยนแปลงแบบ Realtime ของผังโต๊ะ (channel "table-status" ตาม AGENTS ส่วน 6.4)
 * เมื่อมีเครื่องอื่นเปิด/ย้าย/เก็บโต๊ะ, ลูกค้าสั่งอาหาร, หรือเรียกคิว → ดึงข้อมูลหน้านี้ใหม่จากเซิร์ฟเวอร์
 * (ข้อมูลจริงมาจากเซิร์ฟเวอร์เสมอ ไม่ประกอบข้อมูลเองจาก event เพื่อไม่ให้ผิดพลาด)
 */
export function useTableRealtime() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let refreshTimer = null;

    const scheduleRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), REFRESH_DELAY_MS);
    };

    const channel = supabase
      .channel('table-status')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dining_tables' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queues' }, scheduleRefresh)
      .subscribe();

    return () => {
      clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [router]);
}
