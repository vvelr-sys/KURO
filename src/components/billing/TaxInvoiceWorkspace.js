'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { issueTaxInvoice } from '@/app/(pos)/billing/tax-invoice/actions';
import { AlertMessage, Button, PrintPortal } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import ReceiptDocument from './ReceiptDocument';
import TaxInvoiceDocument from './TaxInvoiceDocument';
import TaxInvoiceForm from './TaxInvoiceForm';

/** รอให้เอกสารในพื้นที่พิมพ์ render และโหลดรูปก่อนเปิดหน้าต่างพิมพ์ */
const PRINT_DELAY_MS = 300;

/**
 * หน้า 2.4 ใบกำกับภาษีเต็มรูปของบิล 1 ใบ
 *   ยังไม่ออก → ตัวอย่างใบเสร็จ (ซ้าย) + ฟอร์มผู้ซื้อ (ขวา)
 *   ออกแล้ว   → ตัวอย่างใบกำกับภาษี A4 + ปุ่มพิมพ์ (แก้ไขไม่ได้)
 * @param {Object} props
 * @param {import('@/app/(pos)/billing/data').BillingDetail} props.detail
 * @param {import('@/app/(pos)/billing/tax-invoice/data').IssuedTaxInvoice|null} props.invoice
 * @param {import('@/app/(pos)/billing/data').StoreInfo} props.store
 */
export default function TaxInvoiceWorkspace({ detail, invoice, store }) {
  const bill = detail.bill;
  const [printCount, setPrintCount] = useState(0);
  const [justIssued, setJustIssued] = useState(false);

  useEffect(() => {
    if (printCount === 0) return undefined;
    const timerId = setTimeout(() => window.print(), PRINT_DELAY_MS);
    return () => clearTimeout(timerId);
  }, [printCount]);

  const handleIssue = async (input) => {
    const result = await issueTaxInvoice({ billId: bill.id, ...input });
    if (!result.error) setJustIssued(true);
    return result;
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-4 rounded-3xl bg-white p-4 shadow-sm">
        <Link href="/billing/tax-invoice" className="rounded-full p-2 text-ink-muted hover:bg-surface" aria-label="กลับไปรายการบิล">
          <ArrowLeft className="size-6" aria-hidden />
        </Link>
        <div className="flex-1">
          <p className="font-bold">
            บิล {bill.billNumber} · โต๊ะ {detail.tableNumbers}
          </p>
          <p className="text-sm text-ink-muted">ยอดชำระ {formatCurrency(bill.totalAmount)}</p>
        </div>
        {invoice && (
          <Button icon={Printer} onClick={() => setPrintCount((count) => count + 1)}>
            พิมพ์ใบกำกับภาษี (A4)
          </Button>
        )}
      </header>

      {invoice ? (
        <>
          {justIssued && <AlertMessage tone="success">ออกใบกำกับภาษีเลขที่ {invoice.invoiceNumber} แล้ว</AlertMessage>}
          <section className="overflow-x-auto rounded-3xl bg-white p-6 shadow-sm">
            <TaxInvoiceDocument store={store} detail={detail} invoice={invoice} />
          </section>
          <PrintPortal paper="a4">
            <TaxInvoiceDocument store={store} detail={detail} invoice={invoice} />
          </PrintPortal>
        </>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <section className="w-full rounded-3xl bg-white p-6 shadow-sm lg:w-[24rem]">
            <ReceiptDocument
              variant="receipt"
              store={store}
              session={detail}
              bill={{
                billNumber: bill.billNumber,
                issuedAt: bill.paidAt ?? bill.createdAt,
                lines: bill.lines,
                totalAmount: bill.totalAmount,
                vatAmount: bill.vatAmount,
                payments: bill.payments,
                cashierName: bill.cashierName,
              }}
            />
          </section>
          <div className="min-w-0 flex-1">
            <TaxInvoiceForm bill={bill} onSubmit={handleIssue} />
          </div>
        </div>
      )}
    </div>
  );
}
