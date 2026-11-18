import { Suspense } from 'react';
import { ComingSoonPage, PageSkeleton } from '@/components/layout';

export const metadata = { title: 'จัดการคิว | KURO SHABU POS' };

// หน้าชั่วคราว — แทนที่ทั้งไฟล์เมื่อเริ่มทำหน้าจริง (ต้องเรียก requireRole('/queues') ในหน้าใหม่)
export default function QueuesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ComingSoonPage path="/queues" title="จัดการคิว" />
    </Suspense>
  );
}
