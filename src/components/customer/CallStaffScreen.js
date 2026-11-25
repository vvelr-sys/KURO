'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { Bell, CircleAlert, CookingPot, Droplets, LoaderCircle, ReceiptText, RefreshCw, UserCheck } from 'lucide-react';
import { AlertMessage } from '@/components/ui';
import BrandLogo from '@/components/layout/BrandLogo';
import { usePeriodicRefresh } from '@/hooks/usePeriodicRefresh';
import { createCustomerServiceRequest } from '@/app/order/[tableNumber]/call-staff/actions';
import { cn, formatClockTime } from '@/lib/utils';
import CustomerTabs from './CustomerTabs';
import OrderTimer from './OrderTimer';

/** ดึงสถานะคำขอใหม่ทุก 10 วินาที (พนักงานกดรับเรื่อง/เสร็จ → ปุ่มกลับมากดได้) */
const REFRESH_INTERVAL_MS = 10_000;

/** ปุ่มด่วน 5 ประเภท (FR-069) เรียงตาม README */
const CALL_BUTTONS = [
  { type: 'call_staff', label: 'เรียกพนักงาน', icon: Bell },
  { type: 'water', label: 'ขอน้ำ / ซุป', icon: Droplets },
  { type: 'change_pot', label: 'เปลี่ยนเตา / หม้อ', icon: CookingPot },
  { type: 'check_bill', label: 'ขอเช็คบิล', icon: ReceiptText },
  { type: 'other', label: 'อื่นๆ', icon: CircleAlert },
];

/**
 * หน้าจอเรียกพนักงาน (1.4)
 * - กดแล้วปุ่มเปลี่ยนเป็น "แจ้งแล้ว" ทันที (Optimistic UI) และกดซ้ำไม่ได้จนพนักงานกดเสร็จ
 * - ฐานข้อมูลกันซ้ำอีกชั้น (ประเภทเดิมที่ยังไม่เสร็จ ไม่สร้างใหม่)
 * @param {Object} props
 * @param {string} props.tableNumber
 * @param {import('@/lib/customer-session').CustomerSession} props.session
 * @param {import('@/app/order/[tableNumber]/call-staff/data').CustomerServiceRequest[]} props.requests
 */
export default function CallStaffScreen({ tableNumber, session, requests }) {
  usePeriodicRefresh(REFRESH_INTERVAL_MS);

  // คำขอที่เพิ่งกด แสดงเป็น "กำลังแจ้ง" จนเซิร์ฟเวอร์ส่งข้อมูลจริงกลับมา (React คืนค่าเองเมื่อจบ transition)
  const [optimisticRequests, addOptimisticRequest] = useOptimistic(requests, (current, requestType) => [
    ...current,
    { id: `sending-${requestType}`, requestType, status: 'sending', createdAt: new Date().toISOString() },
  ]);
  const [, startSending] = useTransition();
  const [notice, setNotice] = useState(/** @type {{ tone: 'error'|'success', text: string }|null} */ (null));

  const requestByType = new Map(optimisticRequests.map((request) => [request.requestType, request]));

  const handleCall = (requestType, label) => {
    if (requestByType.has(requestType)) return; // กันกดซ้ำฝั่งหน้าจอ
    setNotice(null);
    startSending(async () => {
      addOptimisticRequest(requestType);
      const result = await createCustomerServiceRequest(tableNumber, requestType);
      if (result.error) {
        setNotice({ tone: 'error', text: result.error });
        return;
      }
      setNotice({
        tone: 'success',
        text: result.alreadyRequested ? `แจ้ง "${label}" ไว้แล้ว รอพนักงานสักครู่` : `แจ้ง "${label}" แล้ว พนักงานจะมาที่โต๊ะ`,
      });
    });
  };

  const expiresAtMs = session.expiresAt ? Date.parse(session.expiresAt) : null;
  const tableLabel = session.tableNumbers.length > 0 ? session.tableNumbers.join(' + ') : tableNumber;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      <header className="sticky top-0 z-20 flex flex-col gap-3 bg-surface/95 px-4 pb-3 pt-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <BrandLogo subtitle={`โต๊ะ ${tableLabel}`} />
          <OrderTimer expiresAtMs={expiresAtMs} />
        </div>
        <CustomerTabs tableNumber={tableNumber} current="call-staff" />
      </header>

      <main className="flex flex-1 flex-col gap-4 px-4 pb-8 pt-1">
        <p className="text-center text-ink-muted">กดปุ่มด้านล่าง พนักงานจะมาที่โต๊ะ {tableLabel}</p>

        {notice && <AlertMessage tone={notice.tone}>{notice.text}</AlertMessage>}

        <div className="grid grid-cols-2 gap-3">
          {CALL_BUTTONS.map((button) => (
            <CallButton
              key={button.type}
              button={button}
              request={requestByType.get(button.type) ?? null}
              onCall={handleCall}
            />
          ))}
        </div>

        <p className="flex items-center justify-center gap-1.5 text-xs text-ink-muted">
          <RefreshCw className="size-3.5" aria-hidden />
          อัปเดตสถานะอัตโนมัติทุก 10 วินาที
        </p>
      </main>
    </div>
  );
}

/**
 * ปุ่มเรียก 1 ประเภท: ว่าง / กำลังแจ้ง / แจ้งแล้ว (รอพนักงาน) / พนักงานรับเรื่องแล้ว
 * @param {Object} props
 * @param {{ type: string, label: string, icon: import('react').ComponentType<any> }} props.button
 * @param {{ status: 'sending'|'pending'|'in_progress', createdAt: string }|null} props.request
 * @param {(requestType: string, label: string) => void} props.onCall
 */
function CallButton({ button, request, onCall }) {
  const Icon = button.icon;
  const isWaiting = request !== null;

  let statusText = 'กดเพื่อแจ้ง';
  if (request?.status === 'sending') statusText = 'กำลังแจ้ง…';
  if (request?.status === 'pending') statusText = `แจ้งแล้ว ${formatClockTime(request.createdAt)} · รอพนักงาน`;
  if (request?.status === 'in_progress') statusText = 'พนักงานรับเรื่องแล้ว กำลังมา';

  return (
    <button
      type="button"
      onClick={() => onCall(button.type, button.label)}
      disabled={isWaiting}
      aria-label={isWaiting ? `${button.label} — ${statusText}` : button.label}
      className={cn(
        'flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl p-3 text-center shadow-sm transition-colors active:scale-[0.98]',
        button.type === 'other' && 'col-span-2 min-h-20 flex-row',
        isWaiting
          ? request.status === 'in_progress'
            ? 'cursor-default bg-emerald-50 text-emerald-800 active:scale-100'
            : 'cursor-default bg-primary/10 text-primary active:scale-100'
          : 'bg-white text-ink'
      )}
    >
      {request?.status === 'sending' ? (
        <LoaderCircle className="size-8 animate-spin" aria-hidden />
      ) : request?.status === 'in_progress' ? (
        <UserCheck className="size-8" aria-hidden />
      ) : (
        <Icon className={cn('size-8', !isWaiting && 'text-primary')} aria-hidden />
      )}
      <span className="flex flex-col">
        <span className="font-bold">{button.label}</span>
        <span className={cn('text-xs', isWaiting ? 'font-semibold' : 'text-ink-muted')}>{statusText}</span>
      </span>
    </button>
  );
}
