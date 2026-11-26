'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * ดึงข้อมูลหน้านี้ใหม่จากเซิร์ฟเวอร์ทุก N วินาที (router.refresh — ไม่โหลดทั้งหน้า ไม่ทำ state ในหน้าหาย)
 * ใช้กับหน้าลูกค้าที่รับ Realtime ไม่ได้ (สถานะอาหาร / เรียกพนักงาน / ดูคิว — RLS migration 029, 031, 032)
 * - ค่าเริ่มต้น: หยุดดึงตอนแท็บถูกซ่อน/จอปิด (ประหยัดแบตมือถือและโควตาฐานข้อมูล) กลับมาที่แท็บ → ดึงใหม่ทันที
 * @param {number} intervalMs - เช่น 10000 = ทุก 10 วินาที
 * @param {Object} [options]
 * @param {boolean} [options.enabled=true] - false = หยุดดึง (เช่น คิวเข้าโต๊ะ/ยกเลิกแล้ว ไม่มีอะไรเปลี่ยนอีก)
 * @param {boolean} [options.pauseWhenHidden=true] - false = ดึงต่อแม้สลับไปแอปอื่น
 *        (หน้าดูคิว: ลูกค้ามักสลับไปเล่นมือถือระหว่างรอ — เบราว์เซอร์อาจหน่วงให้ช้าลงเอง)
 */
export function usePeriodicRefresh(intervalMs, { enabled = true, pauseWhenHidden = true } = {}) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return undefined;
    let timerId = null;

    const start = () => {
      clearInterval(timerId);
      timerId = setInterval(() => router.refresh(), intervalMs);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        router.refresh();
        start();
      } else if (pauseWhenHidden) {
        clearInterval(timerId);
      }
    };

    if (!pauseWhenHidden || document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(timerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [router, intervalMs, enabled, pauseWhenHidden]);
}
