import { Suspense } from 'react';
import { KdsScreen } from '@/components/kitchen';
import { PageSkeleton } from '@/components/layout';
import { requireRole } from '@/lib/auth';

export const metadata = { title: 'จอครัว | KURO SHABU POS' };

/**
 * หน้า 3.1 KDS แยกสถานี + To-Do List เตรียมอาหาร (kitchen, manager, admin)
 */
export default function KdsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <KdsContent />
    </Suspense>
  );
}

async function KdsContent() {
  await requireRole('/kds');
  return <KdsScreen />;
}
