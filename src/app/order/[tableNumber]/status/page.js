import { Suspense } from 'react';
import { connection } from 'next/server';
import { StatusScreen, CustomerMessage } from '@/components/customer';
import { getCustomerSession } from '@/lib/customer-session';
import { getCustomerOrders } from './data';

export const metadata = { title: 'สถานะอาหาร | KURO SHABU' };

/**
 * หน้า 1.3 ติดตามสถานะอาหาร (ลูกค้า — อ่าน QR token จาก cookie ที่ตั้งตอนสแกน)
 * รายการแยกตามรอบที่สั่ง + สถานะ pending → cooking → served / cancelled
 * ลูกค้ารับ Realtime ของ order_items ไม่ได้ (RLS migration 025) → หน้าจอดึงข้อมูลซ้ำเป็นระยะ
 */
export default function OrderStatusPage({ params }) {
  return (
    <Suspense fallback={<StatusSkeleton />}>
      <StatusContent params={params} />
    </Suspense>
  );
}

async function StatusContent({ params }) {
  await connection();
  const { tableNumber: rawTableNumber } = await params;
  const tableNumber = decodeURIComponent(rawTableNumber).toUpperCase();

  const { session, tokenHash, error } = await getCustomerSession(tableNumber);
  if (error) return <CustomerMessage title="เปิดหน้าสถานะอาหารไม่ได้">{error}</CustomerMessage>;

  const { rounds, error: ordersError } = await getCustomerOrders(tokenHash, tableNumber);
  if (ordersError) return <CustomerMessage title="โหลดสถานะอาหารไม่สำเร็จ">{ordersError}</CustomerMessage>;

  return <StatusScreen tableNumber={tableNumber} session={session} rounds={rounds} />;
}

function StatusSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-md animate-pulse flex-col gap-3 p-4" aria-hidden>
      <div className="h-20 rounded-3xl bg-white" />
      <div className="h-12 rounded-2xl bg-white" />
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="h-40 rounded-2xl bg-white" />
      ))}
    </div>
  );
}
