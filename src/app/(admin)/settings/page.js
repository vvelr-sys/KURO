import { Suspense } from 'react';
import { StoreSettingsForm, TableSettingsPanel } from '@/components/admin';
import { AlertMessage } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getSettingsPageData } from './data';

export const metadata = { title: 'ตั้งค่าร้าน | KURO SHABU POS' };

/**
 * หน้า 4.8 ตั้งค่าร้าน (admin เท่านั้น): ข้อมูลร้าน, ข้อความใบเสร็จ, ค่าปรับเนื้อเหลือ, ผังโต๊ะ
 * (VAT / ราคาบุฟเฟต์ อยู่ที่หน้า /packages)
 */
export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">ตั้งค่าร้าน</h1>
        <p className="text-ink-muted">ข้อมูลบนใบเสร็จ ค่าปรับเนื้อเหลือ และผังโต๊ะ — ราคาบุฟเฟต์และ VAT แก้ที่หน้า &ldquo;ราคาบุฟเฟต์&rdquo;</p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-white" aria-hidden />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}

async function SettingsContent() {
  await requireRole('/settings');
  const { settings, tables, error } = await getSettingsPageData();
  if (error) return <AlertMessage>{error}</AlertMessage>;

  return (
    <div className="flex flex-col gap-4">
      <StoreSettingsForm initialSettings={settings} />
      <TableSettingsPanel tables={tables} />
    </div>
  );
}
