import { Suspense } from 'react';
import { connection } from 'next/server';
import { QueueScreen, CustomerMessage } from '@/components/customer';
import { getCustomerQueue } from './data';

export const metadata = { title: 'บัตรคิว | KURO SHABU' };

/**
 * หน้า 1.1 ดูคิว (ลูกค้าสแกน QR บนบัตรคิว — ไม่ต้องล็อกอิน)
 * เลขคิวตัวเอง, คิวที่กำลังเรียก, จำนวนคิวที่เหลือ, แจ้งเตือนเมื่อถึงคิว
 * ลูกค้าอ่านตาราง queues ตรงไม่ได้ (RLS migration 028) → หน้าจอดึงข้อมูลซ้ำเป็นระยะแทน Realtime
 */
export default function QueuePage({ params }) {
  return (
    <Suspense fallback={<QueueSkeleton />}>
      <QueueContent params={params} />
    </Suspense>
  );
}

async function QueueContent({ params }) {
  await connection();
  const { queueId } = await params;

  const { queue, error } = await getCustomerQueue(decodeURIComponent(queueId));
  if (error) return <CustomerMessage title="เปิดบัตรคิวไม่ได้">{error}</CustomerMessage>;

  return <QueueScreen queue={queue} />;
}

function QueueSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-md animate-pulse flex-col gap-3 p-4" aria-hidden>
      <div className="h-16 rounded-3xl bg-white" />
      <div className="h-56 rounded-3xl bg-white" />
      <div className="h-32 rounded-3xl bg-white" />
    </div>
  );
}
