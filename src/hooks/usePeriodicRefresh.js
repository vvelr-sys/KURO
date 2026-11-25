'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * ดึงข้อมูลหน้านี้ใหม่จากเซิร์ฟเวอร์ทุก N วินาที (router.refresh — ไม่โหลดทั้งหน้า ไม่ทำ state ในหน้าหาย)
 * ใช้กับหน้าลูกค้าที่รับ Realtime ไม่ได้ (เช่น สถานะอาหาร — RLS migration 025)
 * - หยุดดึงตอนแท็บถูกซ่อน/จอปิด (ประหยัดแบตมือถือและโควตาฐานข้อมูล)
 * - กลับมาที่แท็บ → ดึงใหม่ทันที
 * @param {number} intervalMs - เช่น 10000 = ทุก 10 วินาที
 */
export function usePeriodicRefresh(intervalMs) {
  const router = useRouter();

  useEffect(() => {
    let timerId = null;

    const start = () => {
      clearInterval(timerId);
      timerId = setInterval(() => router.refresh(), intervalMs);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        router.refresh();
        start();
      } else {
        clearInterval(timerId);
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(timerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [router, intervalMs]);
}
