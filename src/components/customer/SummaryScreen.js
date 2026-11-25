import Link from 'next/link';
import { UtensilsCrossed } from 'lucide-react';
import BrandLogo from '@/components/layout/BrandLogo';
import CustomerTabs from './CustomerTabs';
import OrderTimer from './OrderTimer';

/**
 * หน้าจอสรุปรายการที่สั่งในรอบ (1.5): จำนวนรวมต่อเมนู — ไม่แสดงราคาอาหาร (บุฟเฟต์ราคาเดียว)
 * ไม่ต้องดึงข้อมูลซ้ำเป็นระยะ: สลับแท็บกลับมาหน้านี้ = โหลดใหม่จากเซิร์ฟเวอร์ทุกครั้ง
 * @param {Object} props
 * @param {string} props.tableNumber
 * @param {import('@/lib/customer-session').CustomerSession} props.session
 * @param {import('@/app/order/[tableNumber]/summary/data').OrderSummary} props.summary
 */
export default function SummaryScreen({ tableNumber, session, summary }) {
  const expiresAtMs = session.expiresAt ? Date.parse(session.expiresAt) : null;
  const tableLabel = session.tableNumbers.length > 0 ? session.tableNumbers.join(' + ') : tableNumber;
  const guestText = [
    session.adultCount > 0 && `ผู้ใหญ่ ${session.adultCount}`,
    session.childCount > 0 && `เด็ก ${session.childCount}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      <header className="sticky top-0 z-20 flex flex-col gap-3 bg-surface/95 px-4 pb-3 pt-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <BrandLogo subtitle={`โต๊ะ ${tableLabel}`} />
          <OrderTimer expiresAtMs={expiresAtMs} />
        </div>
        <CustomerTabs tableNumber={tableNumber} current="summary" />
      </header>

      <main className="flex flex-1 flex-col gap-4 px-4 pb-8 pt-1">
        <section className="grid grid-cols-2 gap-2 text-center">
          <div className="flex flex-col rounded-2xl bg-white px-2 py-3">
            <span className="text-3xl font-bold tabular-nums text-primary">{summary.totalQuantity}</span>
            <span className="text-xs font-semibold text-ink-muted">จานทั้งหมด</span>
          </div>
          <div className="flex flex-col rounded-2xl bg-white px-2 py-3">
            <span className="text-3xl font-bold tabular-nums">{summary.roundCount}</span>
            <span className="text-xs font-semibold text-ink-muted">รอบที่สั่ง</span>
          </div>
        </section>

        {guestText && <p className="text-center text-sm text-ink-muted">ลูกค้า {guestText}</p>}

        {summary.lines.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center">
            <UtensilsCrossed className="size-10 text-ink-muted/40" aria-hidden />
            <p className="font-semibold">ยังไม่ได้สั่งอาหาร</p>
            <Link
              href={`/order/${encodeURIComponent(tableNumber)}`}
              className="rounded-xl bg-primary px-5 py-2.5 font-bold text-white"
            >
              ไปหน้าสั่งอาหาร
            </Link>
          </div>
        ) : (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-1 text-lg font-bold">รายการที่สั่ง</h2>
            <ul className="flex flex-col divide-y divide-line">
              {summary.lines.map((line) => (
                <li key={line.name} className="flex items-start gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{line.name}</p>
                    {line.options.length > 0 && (
                      <p className="text-sm text-ink-muted">
                        {line.options.map((option) => `${option.label} ×${option.quantity}`).join(' · ')}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-lg font-bold tabular-nums">×{line.quantity}</span>
                </li>
              ))}
            </ul>

            <div className="mt-2 flex flex-col gap-1 border-t border-line pt-3 text-sm text-ink-muted">
              <p className="flex justify-between">
                <span>เสิร์ฟแล้ว</span>
                <span className="font-semibold tabular-nums">
                  {summary.servedQuantity} / {summary.totalQuantity} จาน
                </span>
              </p>
              {summary.cancelledQuantity > 0 && (
                <p className="flex justify-between">
                  <span>ยกเลิก (ไม่นับรวม)</span>
                  <span className="font-semibold tabular-nums">{summary.cancelledQuantity} จาน</span>
                </p>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
