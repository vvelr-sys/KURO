import { Suspense } from 'react';
import { ComingSoonPage, PageSkeleton } from '@/components/layout';

export const metadata = { title: 'จัดการเมนู | KURO SHABU POS' };

// หน้าชั่วคราว — แทนที่ทั้งไฟล์เมื่อเริ่มทำหน้าจริง (ต้องเรียก requireRole('/menu') ในหน้าใหม่)
export default function MenuPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ComingSoonPage path="/menu" title="จัดการเมนู" />
    </Suspense>
  );
}
