import { Suspense } from 'react';
import { connection } from 'next/server';
import { SummaryScreen, CustomerMessage } from '@/components/customer';
import { getCustomerSession } from '@/lib/customer-session';
import { getCustomerOrders } from '../status/data';
import { buildOrderSummary } from './data';

export const metadata = { title: 'สรุปรายการ | KURO SHABU' };

/**
 * หน้า 1.5 สรุปรายการที่สั่งในรอบ (ลูกค้า) — รายการ + จำนวนรวม ไม่แสดงราคาอาหาร
 */
export default function OrderSummaryPage({ params }) {
  return (
    <Suspense fallback={<SummarySkeleton />}>
      <SummaryContent params={params} />
    </Suspense>
  );
}

async function SummaryContent({ params }) {
  await connection();
  const { tableNumber: rawTableNumber } = await params;
  const tableNumber = decodeURIComponent(rawTableNumber).toUpperCase();

  const { session, tokenHash, error } = await getCustomerSession(tableNumber);
  if (error) return <CustomerMessage title="เปิดหน้าสรุปรายการไม่ได้">{error}</CustomerMessage>;

  const { rounds, error: ordersError } = await getCustomerOrders(tokenHash, tableNumber);
  if (ordersError) return <CustomerMessage title="โหลดสรุปรายการไม่สำเร็จ">{ordersError}</CustomerMessage>;

  return <SummaryScreen tableNumber={tableNumber} session={session} summary={buildOrderSummary(rounds)} />;
}

function SummarySkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-md animate-pulse flex-col gap-3 p-4" aria-hidden>
      <div className="h-20 rounded-3xl bg-white" />
      <div className="h-12 rounded-2xl bg-white" />
      <div className="h-24 rounded-2xl bg-white" />
      <div className="h-72 rounded-2xl bg-white" />
    </div>
  );
}
