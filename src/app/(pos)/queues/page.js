import { Suspense } from 'react';
import { QueueBoard } from '@/components/pos';
import { AlertMessage } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getQueuePageData } from './data';

export const metadata = { title: 'จัดการคิว | KURO SHABU POS' };

/**
 * หน้า 2.1 จัดการคิวหน้าร้าน (cashier, manager, admin — staff เข้าไม่ได้)
 */
export default function QueuesPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">จัดการคิวหน้าร้าน</h1>
      <Suspense fallback={<QueueBoardSkeleton />}>
        <QueueBoardContent />
      </Suspense>
    </div>
  );
}

async function QueueBoardContent() {
  await requireRole('/queues');
  const { queues, availableTableCapacities, totalTableCount, error } = await getQueuePageData();
  if (error) return <AlertMessage>{error}</AlertMessage>;

  return (
    <QueueBoard queues={queues} availableTableCapacities={availableTableCapacities} totalTableCount={totalTableCount} />
  );
}

function QueueBoardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-hidden>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className="h-20 rounded-2xl bg-white" />
        ))}
      </div>
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="h-[32rem] rounded-3xl bg-white lg:w-[26rem]" />
        <div className="flex flex-1 flex-col gap-3">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-24 rounded-2xl bg-white" />
          ))}
        </div>
      </div>
    </div>
  );
}
