import { Suspense } from 'react';
import { ComingSoonPage, PageSkeleton } from '@/components/layout';

export const metadata = { title: 'ผังโต๊ะ | KURO SHABU POS' };

// หน้าชั่วคราว — แทนที่ทั้งไฟล์เมื่อเริ่มทำหน้าจริง (ต้องเรียก requireRole('/tables') ในหน้าใหม่)
export default function TablesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ComingSoonPage path="/tables" title="ผังโต๊ะ" />
    </Suspense>
  );
}
