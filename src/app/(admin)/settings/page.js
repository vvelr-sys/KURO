import { Suspense } from 'react';
import { ComingSoonPage, PageSkeleton } from '@/components/layout';

export const metadata = { title: 'ตั้งค่าร้าน | KURO SHABU POS' };

// หน้าชั่วคราว — แทนที่ทั้งไฟล์เมื่อเริ่มทำหน้าจริง (ต้องเรียก requireRole('/settings') ในหน้าใหม่)
export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ComingSoonPage path="/settings" title="ตั้งค่าร้าน" />
    </Suspense>
  );
}
