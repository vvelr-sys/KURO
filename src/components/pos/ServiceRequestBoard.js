'use client';

import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react';
import { AlarmClock, BellRing, CircleCheck, Hourglass, Inbox, Volume2, VolumeX } from 'lucide-react';
import { acceptServiceRequest, completeServiceRequest } from '@/app/(pos)/service-requests/actions';
import { AlertMessage } from '@/components/ui';
import { useCurrentTimeSelector } from '@/hooks/useCurrentTime';
import { useServiceRequestRealtime } from '@/hooks/useServiceRequestRealtime';
import { useStoredToggle } from '@/hooks/useStoredToggle';
import { playChime } from '@/lib/chime';
import { SERVICE_REQUEST_OVERDUE_MINUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import ServiceRequestCard from './ServiceRequestCard';
import { SERVICE_REQUEST_TYPES } from './serviceRequestTypes';

const OVERDUE_MS = SERVICE_REQUEST_OVERDUE_MINUTES * 60 * 1000;

/** อัปเดตหน้าจอทันทีก่อนเซิร์ฟเวอร์ตอบ (Optimistic UI) */
function applyRequestChange(requests, change) {
  if (change.type === 'complete') return requests.filter((request) => request.id !== change.requestId);
  return requests.map((request) =>
    request.id === change.requestId ? { ...request, status: 'in_progress', handlerName: change.handlerName } : request
  );
}

/**
 * หน้ารายการเรียกพนักงาน (ฝั่ง Client) — เสียงเตือนเมื่อมีคำขอใหม่ + สีแดงเมื่อรอนาน
 * @param {Object} props
 * @param {import('@/app/(pos)/service-requests/data').ServiceRequestItem[]} props.requests - คำขอที่ยังไม่เสร็จ
 * @param {number} props.completedTodayCount
 * @param {string} props.currentStaffName - ชื่อผู้ใช้ (แสดงทันทีตอนกดรับเรื่อง)
 */
export default function ServiceRequestBoard({ requests, completedTodayCount, currentStaffName }) {
  useServiceRequestRealtime();

  const [optimisticRequests, applyOptimistic] = useOptimistic(requests, applyRequestChange);
  const [, startTransition] = useTransition();
  const [typeFilter, setTypeFilter] = useState('all');
  const [busy, setBusy] = useState(/** @type {{ requestId: string, action: string } | null} */ (null));
  const [pageError, setPageError] = useState(null);
  const [isSoundOn, setIsSoundOn] = useStoredToggle('kuro.serviceRequestSound', true);

  // ===== เสียงเตือนเมื่อมีคำขอใหม่ (ไม่ดังตอนเปิดหน้าครั้งแรก) =====
  const seenRequestIdsRef = useRef(null);
  useEffect(() => {
    const currentIds = new Set(requests.map((request) => request.id));
    const seenIds = seenRequestIdsRef.current;
    const hasNewPending = seenIds !== null && requests.some((request) => request.status === 'pending' && !seenIds.has(request.id));
    seenRequestIdsRef.current = currentIds;
    if (hasNewPending && isSoundOn) playChime();
  }, [requests, isSoundOn]);

  // ===== จัดกลุ่ม (render ใหม่เมื่อมีคำขอข้ามเกณฑ์ "รอนาน" เท่านั้น ไม่ใช่ทุกวินาที) =====
  const overdueIdsText = useCurrentTimeSelector((now) =>
    now === null
      ? ''
      : optimisticRequests
          .filter((request) => request.status === 'pending' && now - new Date(request.createdAt).getTime() >= OVERDUE_MS)
          .map((request) => request.id)
          .join(',')
  );

  const groups = useMemo(() => {
    const overdueIds = new Set(overdueIdsText ? overdueIdsText.split(',') : []);
    const visible = optimisticRequests.filter((request) => typeFilter === 'all' || request.requestType === typeFilter);
    return {
      overdue: visible.filter((request) => overdueIds.has(request.id)),
      fresh: visible.filter((request) => request.status === 'pending' && !overdueIds.has(request.id)),
      inProgress: visible.filter((request) => request.status === 'in_progress'),
      overdueAll: optimisticRequests.filter((request) => overdueIds.has(request.id)),
    };
  }, [optimisticRequests, typeFilter, overdueIdsText]);

  const countsByType = useMemo(() => {
    const result = { all: optimisticRequests.length };
    for (const request of optimisticRequests) result[request.requestType] = (result[request.requestType] ?? 0) + 1;
    return result;
  }, [optimisticRequests]);

  const pendingCount = optimisticRequests.filter((request) => request.status === 'pending').length;
  const inProgressCount = optimisticRequests.length - pendingCount;

  // ===== การทำงาน =====
  const runAction = useCallback(
    (request, action) => {
      setBusy({ requestId: request.id, action });
      setPageError(null);
      startTransition(async () => {
        applyOptimistic(
          action === 'complete'
            ? { type: 'complete', requestId: request.id }
            : { type: 'accept', requestId: request.id, handlerName: currentStaffName }
        );
        const result =
          action === 'complete'
            ? await completeServiceRequest({ requestId: request.id, hasHandler: request.status === 'in_progress' })
            : await acceptServiceRequest({ requestId: request.id });
        setBusy(null);
        if (result.error) setPageError(result.error);
      });
    },
    [applyOptimistic, currentStaffName]
  );

  const handleAccept = useCallback((request) => runAction(request, 'accept'), [runAction]);
  const handleComplete = useCallback((request) => runAction(request, 'complete'), [runAction]);

  const renderCards = (list) => (
    <div className="grid gap-3 xl:grid-cols-2">
      {list.map((request) => (
        <ServiceRequestCard
          key={request.id}
          request={request}
          busyAction={busy?.requestId === request.id ? busy.action : null}
          onAccept={handleAccept}
          onComplete={handleComplete}
        />
      ))}
    </div>
  );

  const summaryCards = [
    { label: 'คำขอใหม่', value: pendingCount, icon: Inbox, iconClass: 'bg-danger-soft text-danger' },
    { label: 'กำลังดำเนินการ', value: inProgressCount, icon: Hourglass, iconClass: 'bg-surface text-ink' },
    {
      label: `รอนานเกิน ${SERVICE_REQUEST_OVERDUE_MINUTES} นาที`,
      value: groups.overdueAll.length,
      icon: AlarmClock,
      iconClass: 'bg-danger text-white',
      highlight: groups.overdueAll.length > 0,
    },
    { label: 'เสร็จแล้ววันนี้', value: completedTodayCount, icon: CircleCheck, iconClass: 'bg-emerald-100 text-emerald-800' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setIsSoundOn(!isSoundOn)}
          aria-pressed={isSoundOn}
          className="flex h-11 items-center gap-2 rounded-full bg-white px-4 font-semibold shadow-sm hover:bg-surface"
        >
          {isSoundOn ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
          เสียงเตือนคำขอใหม่: {isSoundOn ? 'เปิด' : 'ปิด'}
        </button>
      </div>

      {groups.overdueAll.length > 0 && (
        <div role="alert" className="flex items-center gap-3 rounded-2xl bg-danger-soft px-5 py-4 text-danger">
          <BellRing className="size-6 shrink-0" aria-hidden />
          <p className="font-bold">
            มี {groups.overdueAll.length} คำขอรอเกิน {SERVICE_REQUEST_OVERDUE_MINUTES} นาที: โต๊ะ{' '}
            {groups.overdueAll.map((request) => request.tableNumber).join(', ')}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {summaryCards.map(({ label, value, icon: Icon, iconClass, highlight }) => (
          <div key={label} className={cn('flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm', highlight && 'ring-2 ring-danger')}>
            <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl', iconClass)}>
              <Icon className="size-6" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-sm text-ink-muted">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 rounded-3xl bg-white p-3 shadow-sm">
        {[['all', { label: 'ทั้งหมด' }], ...Object.entries(SERVICE_REQUEST_TYPES)].map(([key, type]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTypeFilter(key)}
            aria-pressed={typeFilter === key}
            className={cn(
              'flex h-11 items-center gap-1.5 rounded-full px-4 font-semibold transition-colors',
              typeFilter === key ? 'bg-primary text-white' : 'bg-surface text-ink hover:bg-primary/5'
            )}
          >
            {type.icon && <type.icon className="size-4" aria-hidden />}
            {type.label}
            <span className="text-sm opacity-80">({countsByType[key] ?? 0})</span>
          </button>
        ))}
      </div>

      <AlertMessage>{pageError}</AlertMessage>

      {optimisticRequests.length === 0 ? (
        <p className="rounded-3xl bg-white p-10 text-center text-ink-muted">ตอนนี้ไม่มีคำขอเรียกพนักงาน</p>
      ) : (
        <>
          {groups.overdue.length > 0 && (
            <Section title={`เตือนด่วน: รอนานเกิน ${SERVICE_REQUEST_OVERDUE_MINUTES} นาที`} count={groups.overdue.length} tone="danger">
              {renderCards(groups.overdue)}
            </Section>
          )}
          {groups.fresh.length > 0 && (
            <Section title="คำขอใหม่ (รอรับเรื่อง)" count={groups.fresh.length}>
              {renderCards(groups.fresh)}
            </Section>
          )}
          {groups.inProgress.length > 0 && (
            <Section title="กำลังดำเนินการ" count={groups.inProgress.length}>
              {renderCards(groups.inProgress)}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, count, tone, children }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className={cn('flex items-center gap-2 text-xl font-bold', tone === 'danger' && 'text-danger')}>
        {title}
        <span className="rounded-full bg-white px-3 py-0.5 text-sm font-semibold shadow-sm">{count} รายการ</span>
      </h2>
      {children}
    </section>
  );
}
