import { Suspense } from 'react';
import { ComingSoonPage, PageSkeleton } from '@/components/layout';

export const metadata = { title: 'ประวัติการทำงาน | KURO SHABU POS' };

// หน้าชั่วคราว — แทนที่ทั้งไฟล์เมื่อเริ่มทำหน้าจริง (ต้องเรียก requireRole('/audit-logs') ในหน้าใหม่)
export default function AuditLogsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ComingSoonPage path="/audit-logs" title="ประวัติการทำงาน" />
    </Suspense>
  );
}
