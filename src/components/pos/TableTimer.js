'use client';

import { memo } from 'react';
import { Timer } from 'lucide-react';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { cn, formatDuration } from '@/lib/utils';
import { getElapsedPercent, getTableDisplay } from './tableDisplay';

// แยกส่วนที่ต้องอัปเดตทุกวินาทีออกมาเป็น Component เล็กๆ
// → ทุกวินาทีจะ render ใหม่แค่ตัวนับเวลา ไม่ใช่การ์ดโต๊ะทั้งใบ (ประหยัด CPU แท็บเล็ต)
// ทุกตัวใช้ตัวจับเวลากลาง (useCurrentTime) ร่วมกัน ไม่มี setInterval แยกต่อโต๊ะ

const BADGE_TONES = {
  active: 'bg-surface text-ink',
  nearExpiry: 'bg-amber-100 text-amber-800',
  expired: 'bg-danger text-white',
};

/**
 * ป้ายเวลาคงเหลือบนการ์ดโต๊ะ (หมดเวลาแล้วขึ้น "หมดเวลา")
 * @param {Object} props
 * @param {import('@/app/(pos)/tables/data').TableItem} props.table
 * @param {string} [props.className]
 */
export const RemainingTimeBadge = memo(function RemainingTimeBadge({ table, className }) {
  const now = useCurrentTime();
  const { key, remainingMs } = getTableDisplay(table, now);
  if (!(key in BADGE_TONES)) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums',
        BADGE_TONES[key],
        className
      )}
    >
      <Timer className="size-4" aria-hidden />
      {key === 'expired' ? 'หมดเวลา' : remainingMs === null ? '--:--' : formatDuration(remainingMs)}
    </span>
  );
});

/**
 * แถบความคืบหน้าของเวลาบุฟเฟต์
 * @param {Object} props
 * @param {import('@/app/(pos)/tables/data').TableItem} props.table
 * @param {string} [props.className]
 */
export const ElapsedBar = memo(function ElapsedBar({ table, className }) {
  const now = useCurrentTime();
  if (!table.session) return null;
  const { key } = getTableDisplay(table, now);
  const percent = getElapsedPercent(table.session, now);

  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-line', className)} aria-hidden>
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-1000',
          key === 'expired' ? 'bg-danger' : key === 'nearExpiry' ? 'bg-amber-500' : 'bg-primary'
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
});

/**
 * ตัวเลขเวลาคงเหลือตัวใหญ่ (แผงรายละเอียดโต๊ะ)
 * @param {Object} props
 * @param {import('@/app/(pos)/tables/data').TableItem} props.table
 */
export const RemainingTimeLarge = memo(function RemainingTimeLarge({ table }) {
  const now = useCurrentTime();
  const { key, remainingMs } = getTableDisplay(table, now);

  return (
    <p
      className={cn(
        'text-4xl font-bold tabular-nums',
        key === 'expired' ? 'text-danger' : key === 'nearExpiry' ? 'text-amber-700' : 'text-primary'
      )}
    >
      {key === 'expired' ? 'หมดเวลา' : remainingMs === null ? '--:--' : formatDuration(remainingMs)}
    </p>
  );
});
