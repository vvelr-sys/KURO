'use client';

import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from 'react';
import { Armchair, Hourglass, Megaphone, Printer, UserCheck, Volume2, VolumeX } from 'lucide-react';
import { getQueueTicket, issueQueue, updateQueueStatus } from '@/app/(pos)/queues/actions';
import { AlertMessage, Button, PrintPortal } from '@/components/ui';
import { useQueueAnnouncer } from '@/hooks/useQueueAnnouncer';
import { useQueueRealtime } from '@/hooks/useQueueRealtime';
import { TABLE_SIZES, getTableSizeKey } from '@/lib/constants';
import { cn } from '@/lib/utils';
import ConfirmDialog from './ConfirmDialog';
import QueueIssueForm from './QueueIssueForm';
import QueueRow from './QueueRow';
import QueueTicket from './QueueTicket';

/** ลำดับการแสดง: คิวที่เรียกอยู่ขึ้นก่อน → คิวที่รอ (มาก่อนอยู่บน) → คิวที่ข้าม */
const STATUS_ORDER = { called: 0, waiting: 1, skipped: 2 };
const ACTIVE_STATUSES = ['waiting', 'called', 'skipped'];
const STATUS_AFTER_ACTION = { call: 'called', recall: 'called', skip: 'skipped', cancel: 'cancelled' };
/** รอให้ตั๋วในพื้นที่พิมพ์ render และโหลดรูปก่อนเปิดหน้าต่างพิมพ์ */
const PRINT_DELAY_MS = 300;

/** อัปเดตสถานะคิวบนหน้าจอทันทีก่อนเซิร์ฟเวอร์ตอบ (Optimistic UI) */
function applyQueueChange(queues, change) {
  return queues.map((queue) =>
    queue.id === change.queueId
      ? { ...queue, status: change.status, calledAt: change.status === 'called' ? new Date().toISOString() : queue.calledAt }
      : queue
  );
}

/**
 * หน้าจัดการคิวทั้งหน้า (ฝั่ง Client)
 * @param {Object} props
 * @param {import('@/app/(pos)/queues/data').QueueItem[]} props.queues - คิวของวันนี้ทั้งหมด
 * @param {number[]} props.availableTableCapacities - ความจุของโต๊ะที่ว่างอยู่
 * @param {number} props.totalTableCount
 */
export default function QueueBoard({ queues, availableTableCapacities, totalTableCount }) {
  useQueueRealtime();
  const announcer = useQueueAnnouncer();

  const [optimisticQueues, applyOptimistic] = useOptimistic(queues, applyQueueChange);
  const [, startTransition] = useTransition();
  const [sizeFilter, setSizeFilter] = useState('all');
  const [busy, setBusy] = useState(/** @type {{ queueId: string, action: string } | null} */ (null));
  const [pageMessage, setPageMessage] = useState(/** @type {{ tone: 'error'|'success', text: string } | null} */ (null));
  const [ticket, setTicket] = useState(null);
  const [printRequestCount, setPrintRequestCount] = useState(0);
  const [queueToCancel, setQueueToCancel] = useState(null);

  // สั่งพิมพ์หลังตั๋วใหม่ถูกวางในพื้นที่พิมพ์แล้ว
  useEffect(() => {
    if (printRequestCount === 0) return undefined;
    const timerId = setTimeout(() => window.print(), PRINT_DELAY_MS);
    return () => clearTimeout(timerId);
  }, [printRequestCount]);

  const printTicket = useCallback((nextTicket) => {
    setTicket(nextTicket);
    setPrintRequestCount((count) => count + 1);
  }, []);

  // ===== ตัวเลขสรุป =====
  const summary = useMemo(() => {
    const result = { waiting: 0, called: 0, seated: 0 };
    const waitingBySize = {};
    for (const queue of optimisticQueues) {
      if (queue.status in result) result[queue.status] += 1;
      if (queue.status === 'waiting') waitingBySize[queue.tableSize] = (waitingBySize[queue.tableSize] ?? 0) + 1;
    }
    return { ...result, waitingBySize };
  }, [optimisticQueues]);

  const availableBySize = useMemo(() => {
    const result = {};
    for (const capacity of availableTableCapacities) {
      const key = getTableSizeKey(capacity);
      result[key] = (result[key] ?? 0) + 1;
    }
    return result;
  }, [availableTableCapacities]);

  // ===== รายการคิวที่ยังต้องจัดการ (เรียก/รอ/ข้าม) =====
  const activeQueues = useMemo(
    () =>
      optimisticQueues
        .filter((queue) => ACTIVE_STATUSES.includes(queue.status))
        .sort((first, second) => {
          const statusDiff = STATUS_ORDER[first.status] - STATUS_ORDER[second.status];
          if (statusDiff !== 0) return statusDiff;
          if (first.status === 'called') return new Date(second.calledAt) - new Date(first.calledAt);
          return new Date(first.createdAt) - new Date(second.createdAt);
        }),
    [optimisticQueues]
  );

  const activeCountBySize = useMemo(() => {
    const result = { all: activeQueues.length };
    for (const queue of activeQueues) result[queue.tableSize] = (result[queue.tableSize] ?? 0) + 1;
    return result;
  }, [activeQueues]);

  // คิวถัดไป = คิวที่รอเรียกและมาก่อนสุดของแต่ละขนาด
  const nextQueueIds = useMemo(() => {
    const ids = new Set();
    const seenSizes = new Set();
    for (const queue of activeQueues) {
      if (queue.status === 'waiting' && !seenSizes.has(queue.tableSize)) {
        ids.add(queue.id);
        seenSizes.add(queue.tableSize);
      }
    }
    return ids;
  }, [activeQueues]);

  const visibleQueues = sizeFilter === 'all' ? activeQueues : activeQueues.filter((queue) => queue.tableSize === sizeFilter);

  // คิวที่เรียกล่าสุด (สำหรับปุ่มประกาศซ้ำด้านบน)
  const latestCalledQueue = useMemo(
    () =>
      optimisticQueues
        .filter((queue) => queue.status === 'called')
        .sort((first, second) => new Date(second.calledAt) - new Date(first.calledAt))[0] ?? null,
    [optimisticQueues]
  );

  // ===== การทำงาน =====
  const announceQueue = useCallback(
    async (queueNumber) => {
      const { spoke } = await announcer.announce(queueNumber);
      if (!spoke) {
        setPageMessage({
          tone: 'error',
          text: 'เบราว์เซอร์นี้ไม่มีเสียงพูดภาษาไทย จึงได้ยินแค่เสียงติ๊ง-ต่อง — เปิดหน้านี้ด้วย Microsoft Edge หรือติดตั้งเสียงพูดภาษาไทยใน Windows (Settings → Time & language → Speech)',
        });
      }
    },
    [announcer]
  );

  const runQueueAction = useCallback(
    (queue, action) =>
      new Promise((resolve) => {
        setBusy({ queueId: queue.id, action });
        setPageMessage(null);
        startTransition(async () => {
          applyOptimistic({ queueId: queue.id, status: STATUS_AFTER_ACTION[action] });
          const result = await updateQueueStatus({ queueId: queue.id, action });
          setBusy(null);
          if (result.error) setPageMessage({ tone: 'error', text: result.error });
          else if (action === 'call' || action === 'recall') announceQueue(queue.queueNumber);
          resolve(result.error);
        });
      }),
    [applyOptimistic, announceQueue]
  );

  const handleRowAction = useCallback(
    (queue, action) => {
      if (action === 'cancel') setQueueToCancel(queue); // ยกเลิกต้องยืนยันก่อน
      else runQueueAction(queue, action);
    },
    [runQueueAction]
  );

  const handleReprint = useCallback(
    async (queue) => {
      setPageMessage(null);
      const result = await getQueueTicket({ queueId: queue.id });
      if (result.error) setPageMessage({ tone: 'error', text: result.error });
      else printTicket(result.ticket);
    },
    [printTicket]
  );

  const handleIssue = async (input) => {
    const result = await issueQueue(input);
    if (result.error) return result.error;
    printTicket(result.ticket);
    setPageMessage({ tone: 'success', text: `ออกบัตรคิว ${result.ticket.queueNumber} แล้ว` });
    return null;
  };

  const summaryCards = [
    { label: 'รอคิว', value: summary.waiting, unit: 'คิว', icon: Hourglass, iconClass: 'bg-surface text-ink' },
    { label: 'กำลังเรียก', value: summary.called, unit: 'คิว', icon: Megaphone, iconClass: 'bg-primary text-white' },
    { label: 'เข้าโต๊ะแล้ววันนี้', value: summary.seated, unit: 'คิว', icon: UserCheck, iconClass: 'bg-emerald-800 text-white' },
    {
      label: 'โต๊ะว่างตอนนี้',
      value: availableTableCapacities.length,
      unit: `/ ${totalTableCount} โต๊ะ`,
      icon: Armchair,
      iconClass: 'bg-emerald-100 text-emerald-800',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* การ์ดสรุป + ปุ่มประกาศ */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {summaryCards.map(({ label, value, unit, icon: Icon, iconClass }) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
            <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl', iconClass)}>
              <Icon className="size-6" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-sm text-ink-muted">{label}</p>
              <p className="text-2xl font-bold">
                {value} <span className="text-sm font-normal text-ink-muted">{unit}</span>
              </p>
            </div>
          </div>
        ))}
        <div className="col-span-2 flex flex-col gap-2 rounded-2xl bg-primary p-3 xl:col-span-1">
          <Button
            variant="secondary"
            icon={Megaphone}
            className="bg-white"
            onClick={() => latestCalledQueue && announceQueue(latestCalledQueue.queueNumber)}
            disabled={!latestCalledQueue || !announcer.isEnabled}
          >
            ประกาศ {latestCalledQueue?.queueNumber ?? 'คิว'}
          </Button>
          <button
            type="button"
            onClick={() => announcer.setIsEnabled(!announcer.isEnabled)}
            aria-pressed={announcer.isEnabled}
            className="flex items-center justify-center gap-2 rounded-xl py-1.5 text-sm font-semibold text-white hover:bg-white/10"
          >
            {announcer.isEnabled ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
            เสียงประกาศ: {announcer.isEnabled ? 'เปิด' : 'ปิด'}
          </button>
        </div>
      </div>

      {pageMessage && <AlertMessage tone={pageMessage.tone}>{pageMessage.text}</AlertMessage>}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* ซ้าย: ออกบัตรคิว + ตัวอย่างบัตรล่าสุด */}
        <div className="flex w-full flex-col gap-4 lg:w-[26rem] lg:shrink-0">
          <QueueIssueForm waitingCountBySize={summary.waitingBySize} onIssue={handleIssue} />
          {ticket && (
            <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">บัตรคิวล่าสุด</h2>
                <Button variant="secondary" size="sm" icon={Printer} onClick={() => printTicket(ticket)}>
                  พิมพ์ซ้ำ
                </Button>
              </div>
              <div className="rounded-2xl bg-surface p-4">
                <QueueTicket ticket={ticket} />
              </div>
            </section>
          )}
        </div>

        {/* ขวา: รายการคิว */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap gap-2 rounded-3xl bg-white p-3 shadow-sm">
            {[{ key: 'all', label: 'ทั้งหมด' }, ...TABLE_SIZES].map((size) => (
              <button
                key={size.key}
                type="button"
                onClick={() => setSizeFilter(size.key)}
                aria-pressed={sizeFilter === size.key}
                className={cn(
                  'h-11 rounded-full px-4 font-semibold transition-colors',
                  sizeFilter === size.key ? 'bg-primary text-white' : 'bg-surface text-ink hover:bg-primary/5'
                )}
              >
                {size.queuePrefix ? `${size.queuePrefix} · ${size.label}` : size.label}
                <span className="ml-1.5 rounded-full bg-black/10 px-2 text-sm">{activeCountBySize[size.key] ?? 0}</span>
                {size.queuePrefix && (
                  <span className="ml-1 text-xs font-normal opacity-80">ว่าง {availableBySize[size.key] ?? 0} โต๊ะ</span>
                )}
              </button>
            ))}
          </div>

          {visibleQueues.length === 0 ? (
            <p className="rounded-3xl bg-white p-8 text-center text-ink-muted">ไม่มีคิวที่รออยู่</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {visibleQueues.map((queue) => (
                <QueueRow
                  key={queue.id}
                  queue={queue}
                  isNext={nextQueueIds.has(queue.id)}
                  busyAction={busy?.queueId === queue.id ? busy.action : null}
                  onAction={handleRowAction}
                  onReprint={handleReprint}
                />
              ))}
            </ul>
          )}
          <p className="text-sm text-ink-muted">พาลูกค้าเข้าโต๊ะ: ไปหน้า &ldquo;โต๊ะ&rdquo; → เปิดโต๊ะ → เลือกคิวที่เรียกแล้ว</p>
        </div>
      </div>

      {queueToCancel && (
        <ConfirmDialog
          title={`ยกเลิกคิว ${queueToCancel.queueNumber}`}
          message="คิวนี้จะถูกนำออกจากรายการ และเรียกกลับมาไม่ได้"
          confirmLabel="ยกเลิกคิว"
          confirmVariant="danger"
          onClose={() => setQueueToCancel(null)}
          onConfirm={async () => {
            const error = await runQueueAction(queueToCancel, 'cancel');
            if (!error) setQueueToCancel(null);
            return error;
          }}
        />
      )}

      {/* สำเนาบัตรคิวสำหรับพิมพ์ (มองไม่เห็นบนจอ) */}
      {ticket && (
        <PrintPortal>
          <QueueTicket ticket={ticket} />
        </PrintPortal>
      )}
    </div>
  );
}
