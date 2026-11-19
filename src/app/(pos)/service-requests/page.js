import { Suspense } from 'react';
import { ServiceRequestBoard } from '@/components/pos';
import { AlertMessage } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getServiceRequestData } from './data';

export const metadata = { title: 'เรียกพนักงาน | KURO SHABU POS' };

/**
 * หน้า 2.5 แจ้งเตือนเรียกพนักงาน Realtime (staff, manager, admin)
 */
export default function ServiceRequestsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">รายการเรียกพนักงาน</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-white" aria-hidden />}>
        <ServiceRequestContent />
      </Suspense>
    </div>
  );
}

async function ServiceRequestContent() {
  const staff = await requireRole('/service-requests');
  const { requests, completedTodayCount, error } = await getServiceRequestData();
  if (error) return <AlertMessage>{error}</AlertMessage>;

  return <ServiceRequestBoard requests={requests} completedTodayCount={completedTodayCount} currentStaffName={staff.fullName} />;
}
