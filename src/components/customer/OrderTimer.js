'use client';

import { memo } from 'react';
import { Timer } from 'lucide-react';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { cn, formatDuration } from '@/lib/utils';

/**
 * ตัวนับถอยหลังเวลาบุฟเฟต์ (แยกเป็น Component เล็ก → ทุกวินาที render ใหม่แค่ตัวนี้ ไม่ใช่ทั้งหน้า)
 * ใช้ตัวจับเวลากลาง useCurrentTime() · ไม่มีสีเตือนล่วงหน้า (FR-056 แจ้งเตือนเมื่อครบเวลาเท่านั้น)
 * @param {Object} props
 * @param {number|null} props.expiresAtMs
 * @param {boolean} [props.compact=false] - แบบบรรทัดเดียว สูงเท่าช่องค้นหา (ใช้ในแถบที่ติดด้านบนของหน้าสั่งอาหาร)
 */
function OrderTimer({ expiresAtMs, compact = false }) {
  const now = useCurrentTime();
  const remainingMs = now === null || expiresAtMs === null ? null : expiresAtMs - now;
  const isExpired = remainingMs !== null && remainingMs <= 0;
  const timeText = isExpired ? 'หมดเวลา' : remainingMs === null ? '--:--' : formatDuration(remainingMs);

  if (compact) {
    return (
      <div
        className={cn(
          'flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 font-bold tabular-nums',
          isExpired ? 'bg-danger text-white' : 'bg-primary text-white'
        )}
        role="timer"
        aria-live="off"
        aria-label={`เวลาที่เหลือ ${timeText}`}
      >
        <Timer className="size-4 shrink-0" aria-hidden />
        {timeText}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-2xl px-3 py-2',
        isExpired ? 'bg-danger text-white' : 'bg-primary/5 text-primary'
      )}
      role="timer"
      aria-live="off"
    >
      <Timer className="size-5 shrink-0" aria-hidden />
      <div className="leading-tight">
        <p className={cn('text-xs font-semibold', isExpired ? 'text-white/80' : 'text-ink-muted')}>เวลาที่เหลือ</p>
        <p className="text-xl font-bold tabular-nums">{timeText}</p>
      </div>
    </div>
  );
}

export default memo(OrderTimer);
