'use client';

import { useEffect, useRef, useState } from 'react';
import { BellRing, CircleCheck, CircleX, Clock, RefreshCw, Users, Volume2, VolumeX } from 'lucide-react';
import BrandLogo from '@/components/layout/BrandLogo';
import { usePeriodicRefresh } from '@/hooks/usePeriodicRefresh';
import { playChime } from '@/lib/chime';
import { TABLE_SIZES } from '@/lib/constants';
import { cn, formatClockTime } from '@/lib/utils';

/** ดึงสถานะคิวใหม่ทุก 5 วินาที (ลูกค้ารับ Realtime ของ queues ไม่ได้ — RLS migration 032) */
const REFRESH_INTERVAL_MS = 5_000;
const ORIGINAL_TITLE = 'บัตรคิว | KURO SHABU';

/**
 * หน้าจอบัตรคิวของลูกค้า (1.1)
 * - รอเรียก: จำนวนคิวก่อนหน้า + คิวที่กำลังเรียก (ขนาดโต๊ะเดียวกัน)
 * - ถึงคิว (called): แถบเต็มจอ + เสียง + สั่น + ชื่อแท็บกะพริบ (เรียกซ้ำ = เตือนอีกครั้ง)
 * - เข้าโต๊ะ / ยกเลิกแล้ว: หยุดดึงข้อมูล
 * @param {Object} props
 * @param {import('@/app/queue/[queueId]/data').CustomerQueue} props.queue
 */
export default function QueueScreen({ queue }) {
  const isFinished = queue.status === 'seated' || queue.status === 'cancelled';
  usePeriodicRefresh(REFRESH_INTERVAL_MS, { enabled: !isFinished, pauseWhenHidden: false });

  // เบราว์เซอร์มือถือเล่นเสียง/สั่นได้หลังผู้ใช้แตะหน้าจอก่อน 1 ครั้ง → ให้ลูกค้ากดเปิดเสียงเอง
  const [isSoundOn, setIsSoundOn] = useState(false);
  const handleToggleSound = () => {
    const next = !isSoundOn;
    setIsSoundOn(next);
    if (next) {
      playChime(); // เสียงทดสอบ (และปลดล็อกเสียงของเบราว์เซอร์)
      navigator.vibrate?.(200);
    }
  };

  // แจ้งเตือนเมื่อ "เพิ่งถูกเรียก" หรือ "ถูกเรียกซ้ำ" (called_at เปลี่ยน) — เปิดหน้ามาตอนถูกเรียกอยู่แล้วไม่ต้องดัง
  const lastAlertedCalledAtRef = useRef(queue.calledAt);
  useEffect(() => {
    if (queue.status !== 'called' || !queue.calledAt) return;
    if (queue.calledAt === lastAlertedCalledAtRef.current) return;
    lastAlertedCalledAtRef.current = queue.calledAt;
    if (isSoundOn) playChime();
    navigator.vibrate?.([400, 200, 400, 200, 400]);
  }, [queue.status, queue.calledAt, isSoundOn]);

  // ชื่อแท็บ: ถึงคิวแล้วขึ้นข้อความเตือน (เห็นได้แม้สลับไปแท็บอื่น)
  useEffect(() => {
    document.title = queue.status === 'called' ? `🔔 ถึงคิว ${queue.queueNumber} แล้ว!` : ORIGINAL_TITLE;
    return () => {
      document.title = ORIGINAL_TITLE;
    };
  }, [queue.status, queue.queueNumber]);

  const tableSize = TABLE_SIZES.find((size) => size.key === queue.tableSize);
  const guestText = [
    queue.adultCount > 0 && `ผู้ใหญ่ ${queue.adultCount}`,
    queue.childCount > 0 && `เด็ก ${queue.childCount}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <BrandLogo subtitle="บัตรคิว" />
        {!isFinished && (
          <button
            type="button"
            onClick={handleToggleSound}
            aria-pressed={isSoundOn}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold',
              isSoundOn ? 'bg-primary text-white' : 'bg-white text-ink'
            )}
          >
            {isSoundOn ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
            {isSoundOn ? 'เสียงเปิด' : 'เปิดเสียง'}
          </button>
        )}
      </header>

      {/* เลขคิวของฉัน */}
      <section
        className={cn(
          'flex flex-col items-center gap-1 rounded-3xl p-6 text-center shadow-sm',
          queue.status === 'called' ? 'bg-primary text-white' : 'bg-white'
        )}
      >
        <p className={cn('text-sm font-semibold', queue.status === 'called' ? 'text-white/80' : 'text-ink-muted')}>
          คิวของคุณ
        </p>
        <p className="font-mono text-7xl font-bold tracking-wider">{queue.queueNumber}</p>
        <p className={cn('flex items-center gap-1.5 text-sm', queue.status === 'called' ? 'text-white/90' : 'text-ink-muted')}>
          <Users className="size-4" aria-hidden />
          {tableSize ? `${tableSize.label} (${tableSize.seatLabel})` : queue.tableSize}
          {guestText && ` · ${guestText}`}
        </p>
        <p className={cn('text-xs', queue.status === 'called' ? 'text-white/70' : 'text-ink-muted')}>
          รับคิวเมื่อ {formatClockTime(queue.createdAt)}
        </p>
      </section>

      <QueueStatusPanel queue={queue} />

      {!isFinished && (
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
          <RefreshCw className="size-3.5" aria-hidden />
          อัปเดตอัตโนมัติทุก 5 วินาที · เปิดหน้านี้ค้างไว้ ระบบจะแจ้งเมื่อถึงคิว
        </p>
      )}
    </div>
  );
}

/**
 * กล่องสถานะตามสถานะคิว
 * @param {{ queue: import('@/app/queue/[queueId]/data').CustomerQueue }} props
 */
function QueueStatusPanel({ queue }) {
  if (queue.status === 'called') {
    return (
      <section role="alert" className="flex flex-col items-center gap-2 rounded-3xl bg-emerald-700 p-6 text-center text-white">
        <BellRing className="size-12 animate-bounce" aria-hidden />
        <p className="text-2xl font-bold">ถึงคิวของคุณแล้ว!</p>
        <p>กรุณามาที่เคาน์เตอร์ พนักงานจะพาไปที่โต๊ะ</p>
        {queue.calledAt && <p className="text-sm text-white/80">เรียกเมื่อ {formatClockTime(queue.calledAt)}</p>}
      </section>
    );
  }

  if (queue.status === 'waiting') {
    return (
      <section className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center gap-1 rounded-3xl bg-white p-5 text-center shadow-sm">
          <Clock className="size-6 text-primary" aria-hidden />
          <p className="text-4xl font-bold tabular-nums">{queue.queuesAhead}</p>
          <p className="text-sm font-semibold text-ink-muted">{queue.queuesAhead === 0 ? 'คุณเป็นคิวถัดไป' : 'คิวก่อนหน้า'}</p>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-3xl bg-white p-5 text-center shadow-sm">
          <BellRing className="size-6 text-primary" aria-hidden />
          <p className="font-mono text-4xl font-bold">{queue.nowCalling ?? '-'}</p>
          <p className="text-sm font-semibold text-ink-muted">กำลังเรียก</p>
        </div>
      </section>
    );
  }

  const finishedStates = {
    seated: { icon: CircleCheck, title: 'เข้าโต๊ะเรียบร้อยแล้ว', text: 'ขอให้อร่อยกับมื้อนี้ สแกน QR ที่โต๊ะเพื่อสั่งอาหาร', tone: 'bg-emerald-50 text-emerald-800' },
    skipped: { icon: CircleX, title: 'เลยคิวแล้ว', text: 'กรุณาติดต่อพนักงานที่เคาน์เตอร์', tone: 'bg-amber-100 text-amber-800' },
    cancelled: { icon: CircleX, title: 'บัตรคิวนี้ถูกยกเลิกแล้ว', text: 'สอบถามเพิ่มเติมที่เคาน์เตอร์', tone: 'bg-danger-soft text-danger' },
  };
  const state = finishedStates[queue.status] ?? finishedStates.cancelled;
  const Icon = state.icon;

  return (
    <section className={cn('flex flex-col items-center gap-2 rounded-3xl p-6 text-center', state.tone)}>
      <Icon className="size-10" aria-hidden />
      <p className="text-xl font-bold">{state.title}</p>
      <p className="text-sm">{state.text}</p>
    </section>
  );
}
