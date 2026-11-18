'use client';

import { memo } from 'react';
import { Megaphone, Printer, RotateCcw, SkipForward, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useCurrentTimeSelector } from '@/hooks/useCurrentTime';
import { TABLE_SIZES } from '@/lib/constants';
import { cn } from '@/lib/utils';

/** นาทีที่ผ่านมาตั้งแต่เวลานั้น (null ระหว่างโหลดหน้า) */
function minutesSince(isoTime, now) {
  if (now === null || !isoTime) return null;
  return Math.max(0, Math.floor((now - new Date(isoTime).getTime()) / 60000));
}

/**
 * คิว 1 แถวในรายการ (React.memo — render ใหม่เฉพาะคิวนี้เปลี่ยน / ตัวนับนาทีอัปเดตนาทีละครั้ง)
 * @param {Object} props
 * @param {import('@/app/(pos)/queues/data').QueueItem} props.queue
 * @param {boolean} props.isNext - เป็นคิวถัดไปของขนาดนี้
 * @param {string|null} props.busyAction - ปุ่มที่กำลังทำงานของแถวนี้ (กันกดซ้ำ)
 * @param {(queue: object, action: 'call'|'recall'|'skip'|'cancel') => void} props.onAction
 * @param {(queue: object) => void} props.onReprint
 */
function QueueRow({ queue, isNext, busyAction, onAction, onReprint }) {
  const size = TABLE_SIZES.find((tableSize) => tableSize.key === queue.tableSize);
  const waitedMinutes = useCurrentTimeSelector((now) => minutesSince(queue.createdAt, now));
  const calledMinutes = useCurrentTimeSelector((now) => minutesSince(queue.calledAt, now));
  const isCalled = queue.status === 'called';
  const isSkipped = queue.status === 'skipped';
  const isBusy = busyAction !== null;

  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 shadow-sm',
        isCalled && 'border-l-8 border-primary',
        isSkipped && 'opacity-70'
      )}
    >
      <div
        className={cn(
          'flex w-24 flex-col items-center rounded-xl py-2',
          isCalled ? 'bg-primary text-white' : 'bg-surface text-ink'
        )}
      >
        <span className="text-2xl font-bold">{queue.queueNumber}</span>
        <span className="text-xs opacity-80">{size?.label}</span>
      </div>

      <div className="min-w-40 flex-1">
        <p className="text-lg font-bold">
          {queue.adultCount + queue.childCount} ท่าน
          <span className="ml-1 text-base font-normal text-ink-muted">
            (ผู้ใหญ่ {queue.adultCount}
            {queue.childCount > 0 && `, เด็ก ${queue.childCount}`})
          </span>
        </p>
        <p className="flex flex-wrap gap-2 text-sm">
          {isCalled && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
              เรียกแล้ว{calledMinutes !== null && ` ${calledMinutes} นาทีที่แล้ว`}
            </span>
          )}
          {isSkipped && <span className="rounded-full bg-danger-soft px-2 py-0.5 font-semibold text-danger">ข้ามแล้ว</span>}
          {isNext && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">คิวถัดไป</span>}
          {waitedMinutes !== null && <span className="text-ink-muted">รอมา {waitedMinutes} นาที</span>}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {queue.status === 'waiting' && (
          <Button icon={Megaphone} onClick={() => onAction(queue, 'call')} isLoading={busyAction === 'call'} disabled={isBusy}>
            เรียกคิว
          </Button>
        )}
        {isCalled && (
          <Button variant="secondary" icon={Megaphone} onClick={() => onAction(queue, 'recall')} isLoading={busyAction === 'recall'} disabled={isBusy}>
            เรียกซ้ำ
          </Button>
        )}
        {isSkipped && (
          <Button variant="secondary" icon={RotateCcw} onClick={() => onAction(queue, 'call')} isLoading={busyAction === 'call'} disabled={isBusy}>
            เรียกอีกครั้ง
          </Button>
        )}
        {(queue.status === 'waiting' || isCalled) && (
          <Button variant="secondary" icon={SkipForward} onClick={() => onAction(queue, 'skip')} isLoading={busyAction === 'skip'} disabled={isBusy}>
            ข้าม
          </Button>
        )}
        <Button variant="danger" icon={X} onClick={() => onAction(queue, 'cancel')} disabled={isBusy}>
          ยกเลิก
        </Button>
        {!isSkipped && (
          <Button variant="ghost" onClick={() => onReprint(queue)} disabled={isBusy} aria-label={`พิมพ์บัตรคิว ${queue.queueNumber} ซ้ำ`}>
            <Printer className="size-5" aria-hidden />
          </Button>
        )}
      </div>
    </li>
  );
}

export default memo(QueueRow);
