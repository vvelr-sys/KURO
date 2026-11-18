'use client';

import { memo } from 'react';
import { Armchair, Brush, Plus, UsersRound, UtensilsCrossed } from 'lucide-react';
import { useCurrentTimeSelector } from '@/hooks/useCurrentTime';
import { cn, formatCurrency } from '@/lib/utils';
import { ElapsedBar, RemainingTimeBadge } from './TableTimer';
import { TABLE_DISPLAY_STYLES, getTableDisplay } from './tableDisplay';

/**
 * การ์ดโต๊ะ 1 ใบบนผังโต๊ะ (React.memo — render ใหม่เฉพาะเมื่อข้อมูลโต๊ะนี้เปลี่ยน)
 * @param {Object} props
 * @param {import('@/app/(pos)/tables/data').TableItem} props.table
 * @param {boolean} props.isSelected
 * @param {boolean} props.canOpenTable - ตำแหน่งนี้เปิดโต๊ะได้ไหม
 * @param {(tableId: string) => void} props.onSelect
 * @param {(tableId: string) => void} props.onQuickOpen - ปุ่ม "เปิดโต๊ะนี้"
 * @param {(tableId: string) => void} props.onQuickClean - ปุ่ม "เก็บโต๊ะเสร็จ"
 */
function TableCard({ table, isSelected, canOpenTable, onSelect, onQuickOpen, onQuickClean }) {
  // render ใหม่เฉพาะตอนสถานะเปลี่ยน (เช่น เข้าช่วงใกล้หมดเวลา) ไม่ใช่ทุกวินาที
  const displayKey = useCurrentTimeSelector((now) => getTableDisplay(table, now).key);
  const style = TABLE_DISPLAY_STYLES[displayKey];
  const session = table.session;

  return (
    <article
      className={cn(
        'relative flex min-h-48 flex-col rounded-3xl border-2 bg-white p-4 shadow-sm transition-shadow',
        style.card,
        isSelected && 'border-primary ring-4 ring-primary/10'
      )}
    >
      {/* กดที่การ์ด = เลือกโต๊ะ (ปุ่มด้านในทำงานแยก) */}
      <button
        type="button"
        onClick={() => onSelect(table.id)}
        className="absolute inset-0 rounded-3xl"
        aria-label={`ดูรายละเอียดโต๊ะ ${table.tableNumber}`}
      />

      <header className="pointer-events-none relative flex items-start justify-between gap-2">
        <h3 className={cn('text-3xl font-bold', displayKey === 'expired' ? 'text-danger' : 'text-ink')}>
          {table.tableNumber}
        </h3>
        {session && (displayKey === 'active' || displayKey === 'nearExpiry' || displayKey === 'expired') ? (
          <RemainingTimeBadge table={table} />
        ) : (
          <span className={cn('rounded-full px-2.5 py-1 text-sm font-bold', style.badge)}>{style.label}</span>
        )}
      </header>

      <p className="pointer-events-none relative mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
        {session ? (
          <>
            <UsersRound className="size-4" aria-hidden />
            {session.adultCount + session.childCount} ท่าน
            {session.childCount > 0 && ` (ผญ ${session.adultCount} / ด ${session.childCount})`}
          </>
        ) : (
          <>
            <Armchair className="size-4" aria-hidden />
            {table.capacity} ที่นั่ง
          </>
        )}
      </p>

      <div className="pointer-events-none relative mt-auto pt-3">
        {session ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-sm">
              <span className="flex items-center gap-1.5 text-ink-muted">
                <UtensilsCrossed className="size-4" aria-hidden />
                สั่งแล้ว
              </span>
              <span className="font-semibold">
                {session.orderedCount} จาน
                {session.pendingCount > 0 && <span className="text-amber-700"> (รอ {session.pendingCount})</span>}
              </span>
            </div>
            {(displayKey === 'active' || displayKey === 'nearExpiry' || displayKey === 'expired') && (
              <ElapsedBar table={table} />
            )}
            {displayKey === 'closing' && (
              <p className="text-sm font-semibold text-primary">
                {session.leftover ? `ชั่งเนื้อแล้ว ${session.leftover.weightGrams} กรัม` : 'รอชั่งเนื้อเหลือ'}
              </p>
            )}
            <p className="text-right font-bold">{formatCurrency(session.buffetTotal)}</p>
          </div>
        ) : null}
      </div>

      {/* ปุ่มลัดบนการ์ด (อยู่เหนือปุ่มเลือกการ์ด) */}
      {!session && table.status === 'available' && canOpenTable && (
        <button
          type="button"
          onClick={() => onQuickOpen(table.id)}
          className="relative mt-3 flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-800 font-bold text-white hover:bg-emerald-900"
        >
          <Plus className="size-5" aria-hidden />
          เปิดโต๊ะนี้
        </button>
      )}
      {table.status === 'cleaning' && (
        <button
          type="button"
          onClick={() => onQuickClean(table.id)}
          className="relative mt-3 flex h-12 items-center justify-center gap-2 rounded-xl bg-line font-bold text-ink hover:bg-ink/10"
        >
          <Brush className="size-5" aria-hidden />
          เก็บโต๊ะเสร็จ
        </button>
      )}
    </article>
  );
}

export default memo(TableCard);
