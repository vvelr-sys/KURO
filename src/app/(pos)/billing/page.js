import { Suspense } from 'react';
import { ComingSoonPage, PageSkeleton } from '@/components/layout';

export const metadata = { title: 'คิดเงิน | KURO SHABU POS' };

// หน้าชั่วคราว — แทนที่ทั้งไฟล์เมื่อเริ่มทำหน้าจริง (ต้องเรียก requireRole('/billing') ในหน้าใหม่)
export default function BillingPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ComingSoonPage path="/billing" title="คิดเงิน" />
    </Suspense>
  );
}
