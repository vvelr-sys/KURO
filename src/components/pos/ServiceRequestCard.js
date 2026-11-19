'use client';

import { memo } from 'react';
import { CircleCheck, Hand, UserRound } from 'lucide-react';
import { Button } from '@/components/ui';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { SERVICE_REQUEST_OVERDUE_MINUTES } from '@/lib/constants';
import { cn, formatClockTime, formatDuration } from '@/lib/utils';
import { SERVICE_REQUEST_TYPES } from './serviceRequestTypes';

/**
 * การ์ดคำขอ 1 รายการ (React.memo) — ตัวนับเวลารอใช้ตัวจับเวลากลาง
 * @param {Object} props
 * @param {import('@/app/(pos)/service-requests/data').ServiceRequestItem} props.request
 * @param {string|null} props.busyAction - ปุ่มที่กำลังทำงาน (กันกดซ้ำ)
 * @param {(request: object) => void} props.onAccept
 * @param {(request: object) => void} props.onComplete
 */
function ServiceRequestCard({ request, busyAction, onAccept, onComplete }) {
  const now = useCurrentTime();
  const waitedMs = now === null ? null : now - new Date(request.createdAt).getTime();
  const isOverdue = waitedMs !== null && waitedMs >= SERVICE_REQUEST_OVERDUE_MINUTES * 60 * 1000;
  const isInProgress = request.status === 'in_progress';
  const type = SERVICE_REQUEST_TYPES[request.requestType] ?? SERVICE_REQUEST_TYPES.other;
  const TypeIcon = type.icon;
  const isBusy = busyAction !== null;

  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm',
        isOverdue && !isInProgress && 'ring-2 ring-danger'
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            'flex h-16 min-w-16 flex-col items-center justify-center rounded-2xl px-2',
            isOverdue && !isInProgress ? 'bg-danger-soft text-danger' : isInProgress ? 'bg-surface text-ink' : 'bg-primary text-white'
          )}
        >
          <span className="text-xs opacity-80">โต๊ะ</span>
          <span className="text-2xl font-bold leading-none">{request.tableNumber}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-lg font-bold">
            <TypeIcon className="size-5 shrink-0" aria-hidden />
            {type.label}
          </p>
          <p className="text-sm text-ink-muted">เรียกเมื่อ {formatClockTime(request.createdAt)}</p>
        </div>
        <div className="text-right">
          <p className={cn('text-2xl font-bold tabular-nums', isOverdue && !isInProgress ? 'text-danger' : 'text-ink')}>
            {waitedMs === null ? '--:--' : formatDuration(waitedMs)}
          </p>
          <p className="text-xs text-ink-muted">{isOverdue && !isInProgress ? `เกิน ${SERVICE_REQUEST_OVERDUE_MINUTES} นาที` : 'รอมาแล้ว'}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface px-3 py-2">
        <p className="flex flex-1 items-center gap-1.5 text-sm">
          <UserRound className="size-4 text-ink-muted" aria-hidden />
          {isInProgress ? (
            <span>
              รับเรื่องโดย <span className="font-semibold">{request.handlerName ?? '-'}</span>
            </span>
          ) : (
            <span className="font-semibold text-danger">ยังไม่มีพนักงานรับเรื่อง</span>
          )}
        </p>
        {!isInProgress && (
          <Button size="sm" icon={Hand} onClick={() => onAccept(request)} isLoading={busyAction === 'accept'} disabled={isBusy}>
            รับเรื่อง
          </Button>
        )}
        <Button size="sm" variant="success" icon={CircleCheck} onClick={() => onComplete(request)} isLoading={busyAction === 'complete'} disabled={isBusy}>
          เสร็จสิ้น
        </Button>
      </div>
    </article>
  );
}

export default memo(ServiceRequestCard);
