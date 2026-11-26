import { Suspense } from 'react';
import { MenuManager } from '@/components/admin';
import { AlertMessage } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getMenuPageData } from './data';

export const metadata = { title: 'จัดการเมนู | KURO SHABU POS' };

/**
 * หน้า 4.2 จัดการเมนู (manager, admin): ชื่อ, รูป, หมวดหมู่, สถานีครัว, ราคาสั่งเพิ่ม, เปิด/ปิดขาย
 * สูตรตัดสต็อก (BOM) อยู่ที่หน้า /inventory
 */
export default function MenuPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">จัดการเมนู</h1>
        <p className="text-ink-muted">เพิ่ม/แก้เมนูและหมวดหมู่ — การเปลี่ยนแปลงขึ้นหน้าลูกค้าและจอครัวทันที</p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-white" aria-hidden />}>
        <MenuContent />
      </Suspense>
    </div>
  );
}

async function MenuContent() {
  await requireRole('/menu');
  const { categories, menuItems, error } = await getMenuPageData();
  if (error) return <AlertMessage>{error}</AlertMessage>;

  return <MenuManager categories={categories} menuItems={menuItems} />;
}
