'use client';

import { memo } from 'react';
import { Clock } from 'lucide-react';
import { useCurrentTime } from '@/hooks/useCurrentTime';

const timeFormatter = new Intl.DateTimeFormat('th-TH', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'Asia/Bangkok',
});

/**
 * นาฬิกามุมขวาบน (ใช้ตัวจับเวลากลาง ไม่สร้าง interval ของตัวเอง)
 */
function LiveClock() {
  const now = useCurrentTime();

  return (
    <div className="flex items-center gap-2 rounded-full bg-surface px-4 py-2 font-bold tabular-nums">
      <Clock className="size-5 text-ink-muted" aria-hidden />
      <time suppressHydrationWarning>{now ? timeFormatter.format(now) : '--:--:--'}</time>
    </div>
  );
}

export default memo(LiveClock);
