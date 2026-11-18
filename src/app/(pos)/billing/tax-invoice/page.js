import { Suspense } from 'react';
import { ComingSoonPage, PageSkeleton } from '@/components/layout';

export const metadata = { title: 'ใบกำกับภาษี | KURO SHABU POS' };

// หน้าชั่วคราว — แทนที่ทั้งไฟล์เมื่อเริ่มทำหน้าจริง (ต้องเรียก requireRole('/billing/tax-invoice') ในหน้าใหม่)
export default function TaxInvoicePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ComingSoonPage path="/billing/tax-invoice" title="ใบกำกับภาษี" />
    </Suspense>
  );
}
