import { Suspense } from 'react';
import { ComingSoonPage, PageSkeleton } from '@/components/layout';

export const metadata = { title: 'สต็อกวัตถุดิบ | KURO SHABU POS' };

// หน้าชั่วคราว — แทนที่ทั้งไฟล์เมื่อเริ่มทำหน้าจริง (ต้องเรียก requireRole('/inventory') ในหน้าใหม่)
export default function InventoryPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ComingSoonPage path="/inventory" title="สต็อกวัตถุดิบ" />
    </Suspense>
  );
}
