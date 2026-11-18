'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** รอให้ event ที่มาติดๆ กันจบก่อนค่อยดึงข้อมูลใหม่ครั้งเดียว (เช่น เปิดโต๊ะ 1 ครั้งเกิดหลาย event) */
const REFRESH_DELAY_MS = 400;

/**
 * ฟังการเปลี่ยนแปลงของตารางผ่าน Supabase Realtime แล้วดึงข้อมูลหน้านี้ใหม่จากเซิร์ฟเวอร์ (router.refresh)
 * ข้อมูลจริงมาจากเซิร์ฟเวอร์เสมอ ไม่ประกอบข้อมูลเองจาก event → ไม่มีปัญหาข้อมูลเพี้ยน
 * @param {string} channelName - ชื่อ channel ตาม AGENTS ส่วน 6.4 เช่น 'table-status', 'queue-updates'
 * @param {{ table: string, event?: '*'|'INSERT'|'UPDATE'|'DELETE' }[]} watchedTables - ตารางที่ต้องฟัง
 *        ⚠️ ส่งเป็นค่าคงที่ที่ประกาศนอก Component (ถ้าสร้างใหม่ทุก render จะต่อ channel ใหม่ทุกครั้ง)
 */
export function useRealtimeRefresh(channelName, watchedTables) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let refreshTimer = null;

    const scheduleRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), REFRESH_DELAY_MS);
    };

    let channel = supabase.channel(channelName);
    for (const { table, event = '*' } of watchedTables) {
      channel = channel.on('postgres_changes', { event, schema: 'public', table }, scheduleRefresh);
    }
    channel.subscribe();

    return () => {
      clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [router, channelName, watchedTables]);
}
