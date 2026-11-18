'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Hook สำหรับเชื่อมต่อ Supabase Realtime เพื่อรับสัญญาณอัปเดตสดในครัว
 * 1. ถ้ามีลูกค้าสั่งอาหารใหม่เข้ามา ➔ เรียก onNewOrder (หน้าจอเป็นผู้เล่นเสียงเอง)
 * 2. ถ้าสถานะอาหารเปลี่ยน ➔ อัปเดตหน้าจอทันที
 * 3. ถ้าเมนูถูกเปิดหรือปิดขาย ➔ อัปเดตหน้าจอทันที
 *
 * @param {object} options
 * @param {string|null} options.station - สถานีครัวที่เลือก (fresh, beverage, grill, hot_kitchen) หรือ null = ทั้งหมด
 * @param {() => void} options.onNewOrder - ฟังก์ชันที่ให้ทำงานเมื่อมีออเดอร์ใหม่เข้ามา
 * @param {() => void} options.onOrderChange - ฟังก์ชันที่ให้ทำงานเมื่อออเดอร์เปลี่ยนสถานะ
 * @param {() => void} options.onMenuChange - ฟังก์ชันที่ให้ทำงานเมื่อเมนูอาหารเปลี่ยนสถานะ
 */
export function useKitchenRealtime({ station, onNewOrder, onOrderChange, onMenuChange }) {
  const supabase = createClient();

  // เก็บตัวแปรไว้ไม่ให้ฟังก์ชันรีเซ็ตค่าระหว่างทำงาน
  const channelRef = useRef(null);
  const onNewOrderRef = useRef(onNewOrder);
  const onOrderChangeRef = useRef(onOrderChange);
  const onMenuChangeRef = useRef(onMenuChange);

  useEffect(() => {
    onNewOrderRef.current = onNewOrder;
    onOrderChangeRef.current = onOrderChange;
    onMenuChangeRef.current = onMenuChange;
  }, [onNewOrder, onOrderChange, onMenuChange]);

  useEffect(() => {
    // ตั้งชื่อช่องสัญญาณ Realtime ตามสถานีครัว
    const channelName = station ? `kitchen-station-${station}` : 'kitchen-all-stations';

    channelRef.current = supabase
      .channel(channelName)
      // 1. ดักฟังการเปลี่ยนแปลงในตารางรายการอาหาร (order_items)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_items',
        },
        (changeData) => {
          const { eventType, new: newRecord, old: oldRecord } = changeData;

          // กรณีที่ 1: ลูกค้าสั่งอาหารใหม่เข้ามา (INSERT)
          if (eventType === 'INSERT') {
            onNewOrderRef.current?.();
          } 
          // กรณีที่ 2: มีการเปลี่ยนสถานะอาหาร (UPDATE)
          else if (eventType === 'UPDATE') {
            // ถ้าเปลี่ยนมาเป็น 'pending' (รอทำ) ให้ถือว่าเป็นออเดอร์ที่ต้องส่งเสียงเตือน
            if (newRecord.status === 'pending' && oldRecord?.status !== 'pending') {
              onNewOrderRef.current?.();
            } else {
              onOrderChangeRef.current?.();
            }
          }
        }
      )
      // 2. ดักฟังการเปลี่ยนแปลงในตารางเมนู (menu_items) เช่น เมนูหมด หรือ ปิดขาย
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'menu_items',
        },
        () => {
          onMenuChangeRef.current?.();
        }
      )
      .subscribe();

    // เมื่อปิดหน้าจอ ให้ตัดการเชื่อมต่อสัญญาณ Realtime ออก
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [station]); // eslint-disable-line react-hooks/exhaustive-deps

  return {};
}
