'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * ดักฟัง Supabase Realtime ของสต็อก (ใช้ในหน้า /inventory ของ Manager/Admin)
 * 1. stock_movements มีรายการใหม่ (ครัวตัดสต็อก, รับของเข้า, ของเสีย, ปรับยอด) → onStockChange
 * 2. stock_counts มีผลนับใหม่ หรือถูกอนุมัติ/ปฏิเสธ → onCountChange
 *
 * ช่วงขายดีครัวกด cooking ถี่มาก จึงรวมสัญญาณที่มาติดๆ กันเป็นการโหลดครั้งเดียว (หน่วง 800ms)
 * เพื่อไม่ให้แท็บเล็ตโหลดข้อมูลซ้ำทุกจาน
 *
 * @param {object} options
 * @param {() => void} options.onStockChange
 * @param {() => void} options.onCountChange
 * @param {number} [options.batchDelayMs=800]
 */
export function useStockRealtime({ onStockChange, onCountChange, batchDelayMs = 800 }) {
  const onStockChangeRef = useRef(onStockChange);
  const onCountChangeRef = useRef(onCountChange);

  useEffect(() => {
    onStockChangeRef.current = onStockChange;
    onCountChangeRef.current = onCountChange;
  }, [onStockChange, onCountChange]);

  useEffect(() => {
    const supabase = createClient();
    let stockTimer = null;
    let countTimer = null;

    const channel = supabase
      .channel('stock-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stock_movements' },
        () => {
          clearTimeout(stockTimer);
          stockTimer = setTimeout(() => onStockChangeRef.current?.(), batchDelayMs);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_counts' },
        () => {
          clearTimeout(countTimer);
          countTimer = setTimeout(() => onCountChangeRef.current?.(), batchDelayMs);
        }
      )
      .subscribe();

    // ปิดหน้าจอ → ยกเลิกการเชื่อมต่อและตัวหน่วงเวลา
    return () => {
      clearTimeout(stockTimer);
      clearTimeout(countTimer);
      supabase.removeChannel(channel);
    };
  }, [batchDelayMs]);
}
