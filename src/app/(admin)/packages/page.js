import { Suspense } from 'react';
import { BuffetPackageForm } from '@/components/admin';
import { AlertMessage } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getPackagesPageData } from './data';

export const metadata = { title: 'ราคาบุฟเฟต์ | KURO SHABU POS' };

/**
 * หน้า 4.3 ราคาบุฟเฟต์ (admin เท่านั้น): ราคาผู้ใหญ่/เด็ก, เวลาต่อรอบ, VAT % (ไม่มี Service Charge)
 */
export default function PackagesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">ราคาบุฟเฟต์</h1>
        <p className="text-ink-muted">ราคาเดียวต่อหัว — เปลี่ยนแล้วมีผลกับโต๊ะที่เปิดใหม่เท่านั้น โต๊ะที่เปิดอยู่ใช้ราคาเดิมจนจบรอบ</p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-white" aria-hidden />}>
        <PackagesContent />
      </Suspense>
    </div>
  );
}

async function PackagesContent() {
  await requireRole('/packages');
  const { buffetPackage, activeCount, vatRatePercent, error } = await getPackagesPageData();
  if (error) return <AlertMessage>{error}</AlertMessage>;

  return (
    <div className="flex flex-col gap-4">
      {activeCount > 1 && (
        <AlertMessage>
          มีแพ็กเกจเปิดใช้งาน {activeCount} รายการ ระบบเปิดโต๊ะไม่ได้จนกว่าจะเหลือรายการเดียว — กรุณาติดต่อผู้ดูแลฐานข้อมูล
        </AlertMessage>
      )}
      {activeCount === 0 && <AlertMessage>ยังไม่มีราคาบุฟเฟต์ — กรอกแล้วกดบันทึก ระบบจึงเปิดโต๊ะได้</AlertMessage>}
      <BuffetPackageForm initialPackage={buffetPackage} initialVatRatePercent={vatRatePercent} />
    </div>
  );
}
