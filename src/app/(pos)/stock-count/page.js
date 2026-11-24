import { Suspense } from 'react';
import { StockCountScreen } from '@/components/stock';
import { PageSkeleton } from '@/components/layout';
import { requireRole } from '@/lib/auth';
import { getCountSheet, recordStockMovement, submitStockCount } from './actions';

export const metadata = { title: 'นับสต็อก | KURO SHABU POS' };

/**
 * หน้านับสต็อกเช้า-เย็น (staff, manager, admin)
 * นับทุกวัตถุดิบแบบไม่เห็นยอดในระบบ → ส่งให้ผู้จัดการอนุมัติที่หน้า /inventory
 * มีแท็บรับของเข้า และบันทึกของเสีย (ระบุเหตุผล)
 */
export default function StockCountPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StockCountContent />
    </Suspense>
  );
}

async function StockCountContent() {
  await requireRole('/stock-count');

  return (
    <StockCountScreen
      loadSheetAction={getCountSheet}
      submitCountAction={submitStockCount}
      recordMovementAction={recordStockMovement}
    />
  );
}
