import { Suspense } from 'react';
import { ComingSoonPage, PageSkeleton } from '@/components/layout';

export const metadata = { title: 'เรียกพนักงาน | KURO SHABU POS' };

// หน้าชั่วคราว — แทนที่ทั้งไฟล์เมื่อเริ่มทำหน้าจริง (ต้องเรียก requireRole('/service-requests') ในหน้าใหม่)
export default function ServiceRequestsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ComingSoonPage path="/service-requests" title="เรียกพนักงาน" />
    </Suspense>
  );
}
