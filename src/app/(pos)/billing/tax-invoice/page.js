import { Suspense } from 'react';
import { PaidBillPicker, TaxInvoiceWorkspace } from '@/components/billing';
import { AlertMessage } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getStoreInfo } from '../data';
import { getPaidBillsToday, getTaxInvoiceContext } from './data';

export const metadata = { title: 'ใบกำกับภาษี | KURO SHABU POS' };

/**
 * หน้า 2.4 ใบกำกับภาษีเต็มรูป (cashier, manager, admin)
 *   /billing/tax-invoice               เลือกบิลที่ชำระแล้ววันนี้
 *   /billing/tax-invoice?billId=<id>   ออก/พิมพ์ใบกำกับภาษีของบิลนั้น (มาจากปุ่มหลังรับชำระ)
 */
export default function TaxInvoicePage({ searchParams }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">ใบกำกับภาษีเต็มรูป</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-white" aria-hidden />}>
        <TaxInvoiceContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function TaxInvoiceContent({ searchParams }) {
  await requireRole('/billing/tax-invoice');
  const { billId } = await searchParams;

  if (!billId) {
    const { bills, error } = await getPaidBillsToday();
    if (error) return <AlertMessage>{error}</AlertMessage>;
    return <PaidBillPicker bills={bills} />;
  }

  const [{ detail, invoice, error }, store] = await Promise.all([getTaxInvoiceContext(String(billId)), getStoreInfo()]);
  if (error) return <AlertMessage>{error}</AlertMessage>;
  return <TaxInvoiceWorkspace detail={detail} invoice={invoice} store={store} />;
}
