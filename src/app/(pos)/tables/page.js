import { Suspense } from 'react';
import { TableMap } from '@/components/pos';
import { AlertMessage } from '@/components/ui';
import { canAccessPath, requireRole } from '@/lib/auth';
import { getTableMapData } from './data';

export const metadata = { title: 'ผังโต๊ะ | KURO SHABU POS' };

/**
 * หน้า 2.2 ผังโต๊ะ (cashier, staff, manager, admin)
 * โครงหน้าโหลดทันที ข้อมูลโต๊ะ (อ่าน session + ฐานข้อมูล) โหลดใน <Suspense>
 */
export default function TablesPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">ผังโต๊ะอาหาร</h1>
      <Suspense fallback={<TableMapSkeleton />}>
        <TableMapContent />
      </Suspense>
    </div>
  );
}

async function TableMapContent() {
  const staff = await requireRole('/tables');
  const { tables, calledQueues, activePackage, error } = await getTableMapData();

  if (error) return <AlertMessage>{error}</AlertMessage>;

  // สิทธิ์ของปุ่มต่างๆ (ฐานข้อมูลตรวจซ้ำอีกชั้นเสมอ)
  const permissions = {
    canOpenTable: ['admin', 'manager', 'cashier'].includes(staff.role),
    canDisableTable: ['admin', 'manager'].includes(staff.role),
    canBill: canAccessPath(staff.role, '/billing'),
  };

  return (
    <TableMap tables={tables} calledQueues={calledQueues} activePackage={activePackage} permissions={permissions} />
  );
}

function TableMapSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-hidden>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className="h-20 rounded-2xl bg-white" />
        ))}
      </div>
      <div className="h-16 rounded-3xl bg-white" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div key={index} className="h-48 rounded-3xl bg-white" />
        ))}
      </div>
    </div>
  );
}
