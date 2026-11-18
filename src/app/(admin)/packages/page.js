import { Suspense } from 'react';
import { ComingSoonPage, PageSkeleton } from '@/components/layout';

export const metadata = { title: 'ราคาบุฟเฟต์ | KURO SHABU POS' };

// หน้าชั่วคราว — แทนที่ทั้งไฟล์เมื่อเริ่มทำหน้าจริง (ต้องเรียก requireRole('/packages') ในหน้าใหม่)
export default function PackagesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ComingSoonPage path="/packages" title="ราคาบุฟเฟต์" />
    </Suspense>
  );
}
