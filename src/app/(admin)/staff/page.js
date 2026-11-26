import { Suspense } from 'react';
import { StaffManager } from '@/components/admin';
import { AlertMessage } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getStaffPageData } from './data';

export const metadata = { title: 'พนักงาน | KURO SHABU POS' };

/**
 * หน้า 4.6 จัดการพนักงานและสิทธิ์ (admin เท่านั้น): เพิ่ม / แก้ไข / ปิดใช้งาน, กำหนดตำแหน่ง, ตั้งรหัสผ่านและ PIN
 */
export default function StaffPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">พนักงาน</h1>
        <p className="text-ink-muted">เพิ่มบัญชี กำหนดตำแหน่ง และปิดใช้งานเมื่อพนักงานลาออก (ไม่ลบ เพื่อเก็บประวัติการทำงาน)</p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-white" aria-hidden />}>
        <StaffContent />
      </Suspense>
    </div>
  );
}

async function StaffContent() {
  const currentStaff = await requireRole('/staff');
  const { accounts, canManageAccounts, error } = await getStaffPageData();
  if (error) return <AlertMessage>{error}</AlertMessage>;

  return <StaffManager accounts={accounts} canManageAccounts={canManageAccounts} currentStaffId={currentStaff.id} />;
}
