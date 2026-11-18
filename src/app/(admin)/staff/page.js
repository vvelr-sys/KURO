import { Suspense } from 'react';
import { ComingSoonPage, PageSkeleton } from '@/components/layout';

export const metadata = { title: 'จัดการพนักงาน | KURO SHABU POS' };

// หน้าชั่วคราว — แทนที่ทั้งไฟล์เมื่อเริ่มทำหน้าจริง (ต้องเรียก requireRole('/staff') ในหน้าใหม่)
export default function StaffPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ComingSoonPage path="/staff" title="จัดการพนักงาน" />
    </Suspense>
  );
}
