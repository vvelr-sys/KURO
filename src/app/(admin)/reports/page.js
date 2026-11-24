import { Suspense } from 'react';
import { ReportsScreen } from '@/components/reports';
import { PageSkeleton } from '@/components/layout';
import { requireRole } from '@/lib/auth';
import { getSalesReport } from './actions';

export const metadata = { title: 'รายงานยอดขาย | KURO SHABU POS' };

/**
 * หน้า 4.5 รายงานยอดขาย (manager, admin)
 * ยอดขายรายวัน/เดือน, เมนูขายดี, จำนวนลูกค้า, ช่องทางชำระเงิน, ส่งออก CSV (Excel) / พิมพ์ PDF
 */
export default function ReportsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReportsContent />
    </Suspense>
  );
}

async function ReportsContent() {
  await requireRole('/reports');
  return <ReportsScreen loadReportAction={getSalesReport} />;
}
