import { Suspense } from 'react';
import { ComingSoonPage, PageSkeleton } from '@/components/layout';

export const metadata = { title: 'รายงานยอดขาย | KURO SHABU POS' };

// หน้าชั่วคราว — แทนที่ทั้งไฟล์เมื่อเริ่มทำหน้าจริง (ต้องเรียก requireRole('/reports') ในหน้าใหม่)
export default function ReportsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ComingSoonPage path="/reports" title="รายงานยอดขาย" />
    </Suspense>
  );
}
