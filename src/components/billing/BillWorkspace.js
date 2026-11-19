'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Printer, ReceiptText, Scale, UsersRound } from 'lucide-react';
import { applyDiscount, createBill, payBill } from '@/app/(pos)/billing/actions';
import { AlertMessage, Button, PrintPortal } from '@/components/ui';
import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import { calculateIncludedVat } from '@/lib/money';
import { cn, formatClockTime, formatCurrency } from '@/lib/utils';
import DiscountEditor from './DiscountEditor';
import PaymentPanel from './PaymentPanel';
import ReceiptDocument from './ReceiptDocument';

/** รอให้ใบเสร็จในพื้นที่พิมพ์ render และโหลดรูปก่อนเปิดหน้าต่างพิมพ์ */
const PRINT_DELAY_MS = 300;

/**
 * หน้าคิดเงินของโต๊ะ 1 โต๊ะ (ตาม Figma) — แสดงต่างกันตามขั้น:
 *   1) เชิญออกแล้ว ยังไม่ออกบิล  → ตัวอย่างยอด + ปุ่มออกบิล
 *   2) ออกบิลแล้ว รอชำระ       → ส่วนลด + เลือกวิธีชำระ + ยืนยันรับเงิน
 *   3) ชำระแล้ว                → ใบเสร็จ + พิมพ์ + ไปออกใบกำกับภาษี
 * @param {Object} props
 * @param {import('@/app/(pos)/billing/data').BillingDetail} props.detail
 * @param {import('@/app/(pos)/billing/data').StoreInfo} props.store
 */
export default function BillWorkspace({ detail, store }) {
  useBillingRealtime();

  const bill = detail.bill;
  const isPaid = bill?.status === 'paid';
  const canCreateBill = detail.sessionStatus === 'closing';

  const [pageError, setPageError] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [printRequest, setPrintRequest] = useState(/** @type {{ variant: 'temporary'|'receipt', count: number }} */ ({ variant: 'receipt', count: 0 }));
  // id ของบิลที่รอพิมพ์ใบเสร็จอัตโนมัติหลังรับเงิน (ติ๊ก "พิมพ์ใบเสร็จทันที")
  const [autoPrintBillId, setAutoPrintBillId] = useState(null);

  // ===== ข้อมูลที่ใช้แสดง/พิมพ์ (ก่อนออกบิลใช้ยอดคำนวณล่วงหน้า) =====
  const previewTotal = detail.previewLines.reduce((sum, line) => sum + line.totalPrice, 0);
  const receiptBill = bill
    ? {
        billNumber: bill.billNumber,
        issuedAt: bill.paidAt ?? bill.createdAt,
        lines: bill.lines,
        totalAmount: bill.totalAmount,
        vatAmount: bill.vatAmount,
        payments: bill.payments,
        cashierName: bill.cashierName,
      }
    : {
        billNumber: null,
        issuedAt: new Date().toISOString(),
        lines: detail.previewLines,
        totalAmount: previewTotal,
        vatAmount: calculateIncludedVat(previewTotal, store.vatRatePercent),
      };
  const totalToShow = receiptBill.totalAmount;

  const requestPrint = useCallback((variant) => {
    setPrintRequest((request) => ({ variant, count: request.count + 1 }));
  }, []);

  // สั่งพิมพ์หลังใบเสร็จถูกวางในพื้นที่พิมพ์แล้ว
  useEffect(() => {
    if (printRequest.count === 0) return undefined;
    const timerId = setTimeout(() => window.print(), PRINT_DELAY_MS);
    return () => clearTimeout(timerId);
  }, [printRequest]);

  // รับเงินสำเร็จ → ข้อมูลใหม่มาถึง (บิล paid) → สั่งพิมพ์ใบเสร็จครั้งเดียว
  // (ปรับ state ระหว่าง render ตามแนวทาง React แทนการใช้ effect)
  if (isPaid && autoPrintBillId === bill.id) {
    setAutoPrintBillId(null);
    setPrintRequest((request) => ({ variant: 'receipt', count: request.count + 1 }));
  }

  const handleCreateBill = async () => {
    setIsCreating(true);
    setPageError(null);
    const result = await createBill({ sessionId: detail.sessionId });
    setIsCreating(false);
    if (result.error) setPageError(result.error);
  };

  const handleSaveDiscount = async (amount, reason) => {
    const result = await applyDiscount({ billId: bill.id, amount, reason });
    return result.error;
  };

  const handlePay = async (payments, { printReceipt }) => {
    setAutoPrintBillId(printReceipt ? bill.id : null);
    const result = await payBill({ billId: bill.id, payments });
    if (result.error) setAutoPrintBillId(null);
    return result.error;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ===== หัวบิล ===== */}
      <header className="flex flex-wrap items-center gap-4 rounded-3xl bg-white p-4 shadow-sm">
        <Link href="/billing" className="rounded-full p-2 text-ink-muted hover:bg-surface" aria-label="กลับไปรายการโต๊ะรอคิดเงิน">
          <ArrowLeft className="size-6" aria-hidden />
        </Link>
        <span className="flex h-14 min-w-14 items-center justify-center rounded-2xl bg-primary px-4 text-2xl font-bold text-white">
          {detail.tableNumbers}
        </span>
        <div className="flex-1">
          <p className="flex items-center gap-2 font-bold">
            <UsersRound className="size-5 text-ink-muted" aria-hidden />
            {detail.adultCount + detail.childCount} ท่าน (ผู้ใหญ่ {detail.adultCount}
            {detail.childCount > 0 && `, เด็ก ${detail.childCount}`})
          </p>
          <p className="text-sm text-ink-muted">
            {detail.startedAt && `เข้าโต๊ะ ${formatClockTime(detail.startedAt)}`}
            {bill && ` · บิล ${bill.billNumber}`}
          </p>
        </div>
        <span
          className={cn(
            'rounded-full px-3 py-1 text-sm font-bold',
            isPaid ? 'bg-emerald-100 text-emerald-800' : bill ? 'bg-primary/10 text-primary' : 'bg-amber-100 text-amber-800'
          )}
        >
          {isPaid ? 'ชำระแล้ว' : bill ? 'รอชำระเงิน' : 'ยังไม่ออกบิล'}
        </span>
        {!isPaid && (
          <Button variant="secondary" icon={Printer} onClick={() => requestPrint('temporary')}>
            พิมพ์ใบแจ้งค่าอาหาร
          </Button>
        )}
      </header>

      <AlertMessage>{pageError}</AlertMessage>

      {isPaid ? (
        <PaidView bill={bill} detail={detail} store={store} receiptBill={receiptBill} onPrint={() => requestPrint('receipt')} />
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* ===== ซ้าย: รายการในบิล + ส่วนลด ===== */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <section className="rounded-3xl bg-white p-5 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
                <ReceiptText className="size-5 text-primary" aria-hidden />
                รายการในบิล
                {!bill && <span className="text-sm font-normal text-ink-muted">(ตัวอย่าง — ยอดจริงคำนวณตอนออกบิล)</span>}
              </h2>
              <ul className="flex flex-col gap-2">
                {receiptBill.lines.map((line, index) => (
                  <li key={`${line.itemType}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
                    <div>
                      <p className={cn('font-semibold', line.itemType === 'discount' && 'text-emerald-800')}>{line.description}</p>
                      {line.quantity !== 1 && (
                        <p className="text-sm text-ink-muted">
                          {formatCurrency(line.unitPrice)} × {line.quantity}
                        </p>
                      )}
                    </div>
                    <p className={cn('font-bold tabular-nums', line.itemType === 'discount' && 'text-emerald-800')}>
                      {formatCurrency(line.totalPrice)}
                    </p>
                  </li>
                ))}
              </ul>

              <div className={cn('mt-3 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold', detail.leftover ? 'bg-surface' : 'bg-amber-50 text-amber-800')}>
                <Scale className="size-4" aria-hidden />
                {detail.leftover
                  ? `ชั่งเนื้อเหลือ ${detail.leftover.weightGrams} กรัม → ค่าปรับ ${formatCurrency(detail.leftover.penaltyAmount)}`
                  : 'ยังไม่ได้ชั่งเนื้อเหลือ — ชั่งที่หน้าผังโต๊ะก่อนออกบิล (ไม่มีเนื้อเหลือให้กรอก 0 กรัม)'}
              </div>
            </section>

            {bill && (
              <DiscountEditor
                key={bill.id}
                subtotal={bill.subtotal}
                currentAmount={bill.discountAmount}
                currentReason={bill.discountReason}
                onSave={handleSaveDiscount}
              />
            )}
          </div>

          {/* ===== ขวา: ยอดสุทธิ + ชำระเงิน ===== */}
          <div className="flex w-full flex-col gap-4 lg:w-[28rem] lg:shrink-0">
            <section className="rounded-3xl bg-primary p-6 text-white shadow-sm">
              <p className="text-sm opacity-80">ยอดชำระสุทธิ (รวม VAT แล้ว)</p>
              <p className="text-5xl font-bold tabular-nums">{formatCurrency(totalToShow)}</p>
              <dl className="mt-3 flex flex-col gap-1 text-sm opacity-90">
                {bill && bill.discountAmount > 0 && (
                  <div className="flex justify-between">
                    <dt>ยอดก่อนลด / ส่วนลด</dt>
                    <dd className="tabular-nums">
                      {formatCurrency(bill.subtotal)} / −{formatCurrency(bill.discountAmount)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt>มูลค่าก่อน VAT</dt>
                  <dd className="tabular-nums">{formatCurrency(totalToShow - receiptBill.vatAmount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>VAT {store.vatRatePercent}% (รวมในยอด)</dt>
                  <dd className="tabular-nums">{formatCurrency(receiptBill.vatAmount)}</dd>
                </div>
              </dl>
            </section>

            {bill ? (
              <PaymentPanel key={`${bill.id}-${bill.totalAmount}`} totalAmount={bill.totalAmount} onPay={handlePay} />
            ) : (
              <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
                <p className="text-sm text-ink-muted">
                  ออกบิลแล้วจะล็อกค่าปรับเนื้อเหลือ (ชั่งใหม่ไม่ได้) จากนั้นใส่ส่วนลดและรับชำระเงินได้
                </p>
                <Button size="lg" icon={FileText} onClick={handleCreateBill} isLoading={isCreating} disabled={!canCreateBill || !detail.leftover}>
                  ออกบิล
                </Button>
                {!canCreateBill && <AlertMessage>รอบนี้ยังไม่ได้เชิญลูกค้าออก — กด &ldquo;เชิญลูกค้าออก&rdquo; ที่หน้าผังโต๊ะก่อน</AlertMessage>}
              </section>
            )}
          </div>
        </div>
      )}

      {/* สำเนาสำหรับพิมพ์ (มองไม่เห็นบนจอ) */}
      <PrintPortal>
        <ReceiptDocument
          variant={printRequest.variant === 'receipt' && isPaid ? 'receipt' : 'temporary'}
          store={store}
          session={detail}
          bill={receiptBill}
        />
      </PrintPortal>
    </div>
  );
}

/** หลังชำระเงินแล้ว: ตัวอย่างใบเสร็จ + ปุ่มต่อไป */
function PaidView({ bill, detail, store, receiptBill, onPrint }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <section className="w-full rounded-3xl bg-white p-6 shadow-sm lg:w-[26rem]">
        <ReceiptDocument variant="receipt" store={store} session={detail} bill={receiptBill} />
      </section>
      <section className="flex flex-1 flex-col gap-3 rounded-3xl bg-white p-6 shadow-sm">
        <AlertMessage tone="success">
          ชำระเงินเรียบร้อย บิล {bill.billNumber} · โต๊ะ {detail.tableNumbers} เปลี่ยนเป็น &ldquo;รอเก็บโต๊ะ&rdquo; และ QR สั่งอาหารใช้ไม่ได้แล้ว
        </AlertMessage>
        <Button size="lg" icon={Printer} onClick={onPrint}>
          พิมพ์ใบเสร็จ
        </Button>
        <Link
          href={`/billing/tax-invoice?billId=${bill.id}`}
          className="flex h-14 items-center justify-center gap-2 rounded-xl bg-line text-lg font-bold hover:bg-ink/10"
        >
          <FileText className="size-5" aria-hidden />
          ออกใบกำกับภาษีเต็มรูป
        </Link>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/billing" className="flex h-12 items-center justify-center rounded-xl bg-surface font-semibold hover:bg-line">
            โต๊ะรอคิดเงินอื่น
          </Link>
          <Link href="/tables" className="flex h-12 items-center justify-center rounded-xl bg-surface font-semibold hover:bg-line">
            กลับผังโต๊ะ
          </Link>
        </div>
      </section>
    </div>
  );
}
