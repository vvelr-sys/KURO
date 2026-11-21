import Image from 'next/image';
import { formatCurrency } from '@/lib/utils';
import { PAYMENT_METHOD_LABELS } from './paymentLabels';

const dateTimeFormatter = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
});

/**
 * ใบเสร็จ (ใช้ทั้งตัวอย่างบนจอและตอนพิมพ์) — ขนาดพอดีสลิป 80 มม. ขยายเองบน A4
 * variant:
 *   'temporary' ใบแจ้งค่าอาหาร (ยังไม่ชำระ) — ใช้ก่อนรับเงิน
 *   'receipt'   ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ — หลังชำระแล้ว
 * @param {Object} props
 * @param {'temporary'|'receipt'} props.variant
 * @param {import('@/app/(pos)/billing/data').StoreInfo} props.store
 * @param {{ tableNumbers: string, adultCount: number, childCount: number }} props.session
 * @param {{ billNumber?: string|null, issuedAt: string, lines: import('@/app/(pos)/billing/data').BillLine[],
 *   totalAmount: number, vatAmount: number, payments?: import('@/app/(pos)/billing/data').BillPayment[],
 *   cashierName?: string|null }} props.bill
 */
export default function ReceiptDocument({ variant, store, session, bill }) {
  const isReceipt = variant === 'receipt';
  const priceBeforeVat = bill.totalAmount - bill.vatAmount;

  return (
    <div className="mx-auto flex w-full max-w-[72mm] flex-col gap-2 text-sm text-ink">
      <div className="flex flex-col items-center text-center">
        {/* eager: สำเนาสำหรับพิมพ์ถูกซ่อนบนจอ ถ้า lazy รูปจะไม่โหลดทันพิมพ์ */}
        <Image src="/images/kuro-logo.png" alt="" width={440} height={420} loading="eager" className="h-14 w-auto" />
        <p className="text-base font-bold">{store.name}</p>
        {store.branch && <p className="text-xs">{store.branch}</p>}
        {store.address && <p className="text-xs">{store.address}</p>}
        {store.taxId && <p className="text-xs">เลขประจำตัวผู้เสียภาษี {store.taxId}</p>}
        {store.phone && <p className="text-xs">โทร {store.phone}</p>}
        {store.headerMessage && <p className="mt-1 text-xs italic">{store.headerMessage}</p>}
        <p className="mt-2 w-full rounded-md bg-surface py-1 text-xs font-bold">
          {isReceipt ? 'ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ' : 'ใบแจ้งค่าอาหาร (ยังไม่ใช่ใบเสร็จ)'}
        </p>
      </div>

      <dl className="border-t border-dashed border-ink-muted/40 pt-2 text-xs">
        {bill.billNumber && <Row label="เลขที่" value={bill.billNumber} />}
        <Row label="โต๊ะ" value={session.tableNumbers} />
        <Row label="วันที่-เวลา" value={dateTimeFormatter.format(new Date(bill.issuedAt))} />
        <Row
          label="จำนวนลูกค้า"
          value={`${session.adultCount + session.childCount} ท่าน${session.childCount > 0 ? ` (ผู้ใหญ่ ${session.adultCount}, เด็ก ${session.childCount})` : ''}`}
        />
        {isReceipt && bill.cashierName && <Row label="แคชเชียร์" value={bill.cashierName} />}
      </dl>

      <ul className="flex flex-col gap-1 border-t border-dashed border-ink-muted/40 pt-2">
        {bill.lines.map((line, index) => (
          <li key={`${line.itemType}-${index}`}>
            <p className="flex justify-between gap-2">
              <span className={line.itemType === 'discount' ? 'text-emerald-800' : ''}>{line.description}</span>
              <span className="whitespace-nowrap tabular-nums">{formatCurrency(line.totalPrice)}</span>
            </p>
            {line.quantity !== 1 && (
              <p className="text-xs text-ink-muted">
                {line.quantity} × {formatCurrency(line.unitPrice)}
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="border-t border-dashed border-ink-muted/40 pt-2">
        <p className="flex justify-between text-base font-bold">
          <span>ยอดสุทธิ</span>
          <span className="tabular-nums">{formatCurrency(bill.totalAmount)}</span>
        </p>
        <Row label="มูลค่าก่อน VAT" value={formatCurrency(priceBeforeVat)} small />
        <Row label="VAT (รวมในยอดแล้ว)" value={formatCurrency(bill.vatAmount)} small />
      </div>

      {isReceipt && bill.payments?.length > 0 && (
        <div className="border-t border-dashed border-ink-muted/40 pt-2 text-xs">
          {bill.payments.map((payment, index) => (
            <div key={index}>
              <Row label={PAYMENT_METHOD_LABELS[payment.method]?.label ?? payment.method} value={formatCurrency(payment.amount)} />
              {payment.cashTendered !== null && payment.cashTendered !== undefined && (
                <>
                  <Row label="  รับเงินสด" value={formatCurrency(payment.cashTendered)} />
                  <Row label="  เงินทอน" value={formatCurrency(payment.cashTendered - payment.amount)} />
                </>
              )}
              {payment.reference && <Row label="  อ้างอิง" value={payment.reference} />}
            </div>
          ))}
        </div>
      )}

      <p className="border-t border-dashed border-ink-muted/40 pt-2 text-center text-xs text-ink-muted">
        {isReceipt ? store.footerMessage || 'ขอบคุณที่ใช้บริการ' : 'กรุณาชำระเงินที่แคชเชียร์'}
      </p>
    </div>
  );
}

function Row({ label, value, small = false }) {
  return (
    <p className={`flex justify-between gap-2 ${small ? 'text-xs text-ink-muted' : ''}`}>
      <span className="whitespace-pre">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </p>
  );
}
