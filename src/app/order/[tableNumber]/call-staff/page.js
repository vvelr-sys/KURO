import { Suspense } from 'react';
import { connection } from 'next/server';
import { CallStaffScreen, CustomerMessage } from '@/components/customer';
import { getCustomerSession } from '@/lib/customer-session';
import { getCustomerServiceRequests } from './data';

export const metadata = { title: 'เรียกพนักงาน | KURO SHABU' };

/**
 * หน้า 1.4 เรียกพนักงาน (ลูกค้า — อ่าน QR token จาก cookie ที่ตั้งตอนสแกน)
 * ปุ่มด่วน 5 ประเภท + สถานะ "แจ้งแล้ว" + กันกดซ้ำ (FR-069)
 */
export default function CallStaffPage({ params }) {
  return (
    <Suspense fallback={<CallStaffSkeleton />}>
      <CallStaffContent params={params} />
    </Suspense>
  );
}

async function CallStaffContent({ params }) {
  await connection();
  const { tableNumber: rawTableNumber } = await params;
  const tableNumber = decodeURIComponent(rawTableNumber).toUpperCase();

  const { session, tokenHash, error } = await getCustomerSession(tableNumber);
  if (error) return <CustomerMessage title="เปิดหน้าเรียกพนักงานไม่ได้">{error}</CustomerMessage>;

  const { requests, error: requestsError } = await getCustomerServiceRequests(tokenHash, tableNumber);
  if (requestsError) return <CustomerMessage title="โหลดข้อมูลไม่สำเร็จ">{requestsError}</CustomerMessage>;

  return <CallStaffScreen tableNumber={tableNumber} session={session} requests={requests} />;
}

function CallStaffSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-md animate-pulse flex-col gap-3 p-4" aria-hidden>
      <div className="h-20 rounded-3xl bg-white" />
      <div className="h-12 rounded-2xl bg-white" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-32 rounded-2xl bg-white" />
        ))}
      </div>
    </div>
  );
}
