'use client';

import Link from 'next/link';
import { RefreshCw, UtensilsCrossed } from 'lucide-react';
import BrandLogo from '@/components/layout/BrandLogo';
import { usePeriodicRefresh } from '@/hooks/usePeriodicRefresh';
import CustomerTabs from './CustomerTabs';
import OrderRoundCard from './OrderRoundCard';
import OrderTimer from './OrderTimer';
import { cn } from '@/lib/utils';

/** ดึงสถานะใหม่ทุก 10 วินาที (ลูกค้ารับ Realtime ของ order_items ไม่ได้ — RLS migration 029) */
const REFRESH_INTERVAL_MS = 10_000;

/**
 * หน้าจอติดตามสถานะอาหาร (1.3): สรุปจำนวนตามสถานะ + การ์ดแยกรอบ (รอบล่าสุดอยู่บน)
 * @param {Object} props
 * @param {string} props.tableNumber
 * @param {import('@/lib/customer-session').CustomerSession} props.session
 * @param {import('@/app/order/[tableNumber]/status/data').CustomerOrderRound[]} props.rounds
 */
export default function StatusScreen({ tableNumber, session, rounds }) {
  usePeriodicRefresh(REFRESH_INTERVAL_MS);

  const expiresAtMs = session.expiresAt ? Date.parse(session.expiresAt) : null;
  const tableLabel = session.tableNumbers.length > 0 ? session.tableNumbers.join(' + ') : tableNumber;

  // นับเป็นจำนวนจาน (quantity) ไม่ใช่จำนวนบรรทัด
  const counts = { pending: 0, cooking: 0, served: 0 };
  for (const round of rounds) {
    for (const item of round.items) {
      if (item.status in counts) counts[item.status] += item.quantity;
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      <header className="sticky top-0 z-20 flex flex-col gap-3 bg-surface/95 px-4 pb-3 pt-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <BrandLogo subtitle={`โต๊ะ ${tableLabel}`} />
          <OrderTimer expiresAtMs={expiresAtMs} />
        </div>
        <CustomerTabs tableNumber={tableNumber} current="status" />
      </header>

      <main className="flex flex-1 flex-col gap-4 px-4 pb-8 pt-1">
        <div className="grid grid-cols-3 gap-2 text-center">
          <SummaryTile label="รอครัวรับ" value={counts.pending} className="bg-white text-ink" />
          <SummaryTile label="กำลังทำ" value={counts.cooking} className="bg-amber-100 text-amber-800" />
          <SummaryTile label="เสิร์ฟแล้ว" value={counts.served} className="bg-emerald-50 text-emerald-800" />
        </div>

        <p className="flex items-center justify-center gap-1.5 text-xs text-ink-muted">
          <RefreshCw className="size-3.5" aria-hidden />
          อัปเดตอัตโนมัติทุก 10 วินาที
        </p>

        {rounds.length === 0 ? (
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
          rounds.map((round) => <OrderRoundCard key={round.orderId} round={round} />)
        )}
      </main>
    </div>
  );
}

/**
 * @param {{ label: string, value: number, className: string }} props
 */
function SummaryTile({ label, value, className }) {
  return (
    <div className={cn('flex flex-col rounded-2xl px-2 py-3', className)}>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-xs font-semibold">{label}</span>
    </div>
  );
}
