import { Suspense } from 'react';
import { BillWorkspace, BillingQueueList } from '@/components/billing';
import { AlertMessage } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getBillingDetail, getBillingQueue, getStoreInfo } from './data';

export const metadata = { title: 'คิดเงิน | KURO SHABU POS' };

/**
 * หน้า 2.3 คิดเงินและชำระเงิน (cashier, manager, admin — staff เข้าไม่ได้)
 *   /billing                  รายการโต๊ะที่รอคิดเงิน
 *   /billing?sessionId=<id>   บิลของโต๊ะนั้น (มาจากปุ่ม "ไปหน้าคิดเงิน" ที่ผังโต๊ะ)
 */
export default function BillingPage({ searchParams }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">คิดเงินและชำระเงิน</h1>
      <Suspense fallback={<BillingSkeleton />}>
        <BillingContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function BillingContent({ searchParams }) {
  await requireRole('/billing');
  const { sessionId } = await searchParams;

  if (!sessionId) {
    const { items, error } = await getBillingQueue();
    if (error) return <AlertMessage>{error}</AlertMessage>;
    return <BillingQueueList items={items} />;
  }

  const [{ detail, error }, store] = await Promise.all([getBillingDetail(String(sessionId)), getStoreInfo()]);
  if (error) return <AlertMessage>{error}</AlertMessage>;
  return <BillWorkspace detail={detail} store={store} />;
}

function BillingSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-hidden>
      <div className="h-24 rounded-3xl bg-white" />
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="h-96 flex-1 rounded-3xl bg-white" />
        <div className="h-96 rounded-3xl bg-white lg:w-[28rem]" />
      </div>
    </div>
  );
}
