'use client';

import Link from 'next/link';
import { ChevronRight, Receipt, Scale } from 'lucide-react';
import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import { cn, formatCurrency } from '@/lib/utils';

/**
 * รายการโต๊ะที่รอคิดเงิน (หน้า /billing ตอนยังไม่เลือกโต๊ะ)
 * @param {Object} props
 * @param {import('@/app/(pos)/billing/data').BillingQueueItem[]} props.items
 */
export default function BillingQueueList({ items }) {
  useBillingRealtime();

  if (items.length === 0) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-3xl bg-white p-10 text-center text-ink-muted shadow-sm">
        <Receipt className="size-10" aria-hidden />
        <p>ยังไม่มีโต๊ะรอคิดเงิน</p>
        <p className="text-sm">โต๊ะจะขึ้นที่นี่เมื่อพนักงานกด &ldquo;เชิญลูกค้าออก&rdquo; ที่หน้าผังโต๊ะ</p>
      </section>
    );
  }

  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <li key={item.sessionId}>
          <Link
            href={`/billing?sessionId=${item.sessionId}`}
            className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="flex h-16 min-w-16 items-center justify-center rounded-2xl bg-primary px-3 text-2xl font-bold text-white">
              {item.tableNumbers}
            </span>
            <div className="flex-1">
              <p className="font-bold">{item.guestCount} ท่าน</p>
              {item.status === 'billed' ? (
                <p className="text-sm font-semibold text-primary">ออกบิลแล้ว · {formatCurrency(item.billTotal ?? 0)}</p>
              ) : (
                <p className={cn('flex items-center gap-1 text-sm font-semibold', item.hasLeftover ? 'text-emerald-800' : 'text-amber-700')}>
                  <Scale className="size-4" aria-hidden />
                  {item.hasLeftover ? 'ชั่งเนื้อแล้ว พร้อมออกบิล' : 'ยังไม่ได้ชั่งเนื้อเหลือ'}
                </p>
              )}
            </div>
            <ChevronRight className="size-6 text-ink-muted" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
