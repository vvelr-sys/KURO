import Image from 'next/image';
import { formatTaxId } from '@/lib/tax-id';
import { formatCurrency } from '@/lib/utils';

const dateFormatter = new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone: 'Asia/Bangkok' });

/**
 * ใบกำกับภาษีเต็มรูป / ใบเสร็จรับเงิน ขนาด A4 (ใช้ทั้งตัวอย่างบนจอและตอนพิมพ์)
 * @param {Object} props
 * @param {import('@/app/(pos)/billing/data').StoreInfo} props.store - ผู้ขาย
 * @param {import('@/app/(pos)/billing/data').BillingDetail} props.detail - บิลที่ชำระแล้ว
 * @param {import('@/app/(pos)/billing/tax-invoice/data').IssuedTaxInvoice} props.invoice - ผู้ซื้อ + เลขที่
 */
export default function TaxInvoiceDocument({ store, detail, invoice }) {
  const bill = detail.bill;
  const priceBeforeVat = bill.totalAmount - bill.vatAmount;
  const itemLines = bill.lines.filter((line) => line.itemType !== 'discount');

  return (
    <article className="mx-auto flex w-full max-w-[190mm] flex-col gap-5 bg-white p-2 text-sm text-ink">
      {/* หัวเอกสาร: ผู้ขาย + ชื่อเอกสาร */}
      <header className="flex items-start justify-between gap-6 border-b border-ink pb-4">
        <div className="flex gap-3">
          {/* eager: สำเนาสำหรับพิมพ์ถูกซ่อนบนจอ ถ้า lazy รูปจะไม่โหลดทันพิมพ์ */}
          <Image src="/images/kuro-logo.png" alt="" width={440} height={420} loading="eager" className="h-16 w-auto" />
          <div className="leading-relaxed">
            <p className="text-base font-bold">{store.name}</p>
            <p>{store.address}</p>
            <p>
              เลขประจำตัวผู้เสียภาษี {formatTaxId(store.taxId)} · {store.branch}
            </p>
            {store.phone && <p>โทร {store.phone}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold">ใบกำกับภาษี / ใบเสร็จรับเงิน</p>
          <p className="text-xs text-ink-muted">TAX INVOICE / RECEIPT</p>
          <p className="mt-1 text-xs">ต้นฉบับ</p>
        </div>
      </header>

      {/* ผู้ซื้อ + ข้อมูลเอกสาร */}
      <section className="grid grid-cols-[1fr_auto] gap-6">
        <div className="leading-relaxed">
          <p className="text-xs font-bold text-ink-muted">ผู้ซื้อ</p>
          <p className="font-bold">{invoice.customerName}</p>
          <p className="whitespace-pre-line">{invoice.address}</p>
          <p>
            เลขประจำตัวผู้เสียภาษี {formatTaxId(invoice.taxId)}
            {invoice.branch !== '-' && ` · ${invoice.branch}`}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 self-start">
          <dt className="text-ink-muted">เลขที่</dt>
          <dd className="font-bold">{invoice.invoiceNumber}</dd>
          <dt className="text-ink-muted">วันที่</dt>
          <dd>{dateFormatter.format(new Date(invoice.issuedAt))}</dd>
          <dt className="text-ink-muted">อ้างอิงใบเสร็จ</dt>
          <dd>{bill.billNumber}</dd>
          <dt className="text-ink-muted">โต๊ะ</dt>
          <dd>{detail.tableNumbers}</dd>
        </dl>
      </section>

      {/* รายการ */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-ink text-left">
            <th className="py-2 pr-2 font-semibold">ลำดับ</th>
            <th className="py-2 pr-2 font-semibold">รายการ</th>
            <th className="py-2 pr-2 text-right font-semibold">จำนวน</th>
            <th className="py-2 pr-2 text-right font-semibold">ราคาต่อหน่วย</th>
            <th className="py-2 text-right font-semibold">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {itemLines.map((line, index) => (
            <tr key={`${line.itemType}-${index}`} className="border-b border-line">
              <td className="py-2 pr-2">{index + 1}</td>
              <td className="py-2 pr-2">{line.description}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{line.quantity}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatCurrency(line.unitPrice)}</td>
              <td className="py-2 text-right tabular-nums">{formatCurrency(line.totalPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* สรุปยอด (ราคารวม VAT แล้ว) */}
      <section className="ml-auto grid w-80 grid-cols-[1fr_auto] gap-y-1">
        <span>รวมเป็นเงิน</span>
        <span className="text-right tabular-nums">{formatCurrency(bill.subtotal)}</span>
        {bill.discountAmount > 0 && (
          <>
            <span>ส่วนลด</span>
            <span className="text-right tabular-nums">−{formatCurrency(bill.discountAmount)}</span>
          </>
        )}
        <span>มูลค่าสินค้า/บริการ (ก่อน VAT)</span>
        <span className="text-right tabular-nums">{formatCurrency(priceBeforeVat)}</span>
        <span>ภาษีมูลค่าเพิ่ม {store.vatRatePercent}%</span>
        <span className="text-right tabular-nums">{formatCurrency(bill.vatAmount)}</span>
        <span className="border-t border-ink pt-1 font-bold">จำนวนเงินรวมทั้งสิ้น</span>
        <span className="border-t border-ink pt-1 text-right font-bold tabular-nums">{formatCurrency(bill.totalAmount)}</span>
      </section>

      <footer className="mt-10 grid grid-cols-2 gap-10 text-center">
        <div>
          <div className="mx-auto h-10 w-48 border-b border-ink" />
          <p className="mt-1">ผู้รับเงิน {invoice.issuedByName && `(${invoice.issuedByName})`}</p>
        </div>
        <div>
          <div className="mx-auto h-10 w-48 border-b border-ink" />
          <p className="mt-1">ผู้รับสินค้า/บริการ</p>
        </div>
      </footer>
    </article>
  );
}
