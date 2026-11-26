import { Suspense } from 'react';
import { StockOverrideScreen } from '@/components/kitchen';
import { PageSkeleton } from '@/components/layout';
import { requireRole } from '@/lib/auth';

export const metadata = { title: 'เปิด/ปิดเมนู | KURO SHABU POS' };

/**
 * หน้า 3.2 Override เปิด/ปิดเมนูด้วยตนเอง (kitchen, manager, admin)
 */
export default function StockOverridePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StockOverrideContent />
    </Suspense>
  );
}

async function StockOverrideContent() {
  await requireRole('/stock-override');
  return <StockOverrideScreen />;
}
