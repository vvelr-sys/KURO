import { Suspense } from 'react';
import { AuditLogScreen } from '@/components/reports';
import { PageSkeleton } from '@/components/layout';
import { requireRole } from '@/lib/auth';
import { getAuditActors, getAuditLogs } from './actions';

export const metadata = { title: 'ประวัติการทำงาน | KURO SHABU POS' };

/**
 * หน้า 4.7 ประวัติการทำงาน Audit Log (admin เต็มสิทธิ์, manager ไม่เห็นรายการของ admin)
 */
export default function AuditLogsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AuditLogsContent />
    </Suspense>
  );
}

async function AuditLogsContent() {
  const staff = await requireRole('/audit-logs');
  return <AuditLogScreen staffRole={staff.role} loadActorsAction={getAuditActors} loadLogsAction={getAuditLogs} />;
}
