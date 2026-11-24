'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * ฟังสถานะเมนูเปลี่ยนแบบ Realtime (หมด / ปิดด้วยมือ / กลับมาพร้อมขาย) สำหรับหน้าลูกค้า
 * ลูกค้า (anon) อ่าน menu_items ได้ตาม RLS (migration 002) จึงรับ event ได้โดยตรง
 * ส่งค่าใหม่ให้หน้าจอแก้เฉพาะเมนูนั้น ไม่ต้องโหลดเมนูทั้งหมดใหม่
 * @param {(menuItemId: string, availability: 'available'|'out_of_stock'|'manual_off') => void} onAvailabilityChange
 */
export function useMenuAvailabilityRealtime(onAvailabilityChange) {
  const callbackRef = useRef(onAvailabilityChange);

  useEffect(() => {
    callbackRef.current = onAvailabilityChange;
  }, [onAvailabilityChange]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('customer-menu-availability')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'menu_items' }, (change) => {
        const { id, availability_status: availability } = change.new ?? {};
        if (id && availability) callbackRef.current?.(id, availability);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
