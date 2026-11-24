import { Suspense } from 'react';
import { connection } from 'next/server';
import { OrderScreen, CustomerMessage } from '@/components/customer';
import { getCustomerSession } from '@/lib/customer-session';
import { getCustomerMenu } from './data';

export const metadata = { title: 'สั่งอาหาร | KURO SHABU' };

/**
 * หน้า 1.2 สั่งอาหาร + ตัวจับเวลา (ลูกค้า — ไม่ต้องล็อกอิน ไม่มี PIN)
 *   QR โต๊ะ: /order/T01?t=<token> → src/proxy.js เก็บ token ใน cookie แล้วพามาที่ /order/T01
 */
export default function OrderPage({ params }) {
  return (
    <Suspense fallback={<OrderSkeleton />}>
      <OrderContent params={params} />
    </Suspense>
  );
}

async function OrderContent({ params }) {
  // Supabase ใช้ Date.now() → ต้องบอก Next ว่าหน้านี้สร้างตอนมี request จริงเท่านั้น (ดู docs/SEED.md 2.4)
  await connection();
  const { tableNumber: rawTableNumber } = await params;
  const tableNumber = decodeURIComponent(rawTableNumber).toUpperCase();

  const { session, tokenHash, error } = await getCustomerSession(tableNumber);
  if (error) return <CustomerMessage title="เปิดหน้าสั่งอาหารไม่ได้">{error}</CustomerMessage>;

  const { categories, error: menuError } = await getCustomerMenu(tokenHash);
  if (menuError) return <CustomerMessage title="โหลดเมนูไม่สำเร็จ">{menuError}</CustomerMessage>;

  return <OrderScreen tableNumber={tableNumber} session={session} categories={categories} />;
}

function OrderSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-md animate-pulse flex-col gap-3 p-4" aria-hidden>
      <div className="h-20 rounded-3xl bg-white" />
      <div className="h-12 rounded-2xl bg-white" />
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-24 rounded-2xl bg-white" />
      ))}
    </div>
  );
}
