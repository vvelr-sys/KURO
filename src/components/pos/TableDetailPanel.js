'use client';

import { memo } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, Brush, DoorOpen, MousePointerClick, Plus, Power, QrCode, Receipt, Wrench } from 'lucide-react';
import { Button } from '@/components/ui';
import { useCurrentTimeSelector } from '@/hooks/useCurrentTime';
import { cn, formatClockTime, formatCurrency } from '@/lib/utils';
import LeftoverForm from './LeftoverForm';
import { ElapsedBar, RemainingTimeLarge } from './TableTimer';
import { TABLE_DISPLAY_STYLES, formatGuestCount, getTableDisplay } from './tableDisplay';

/**
 * แผงรายละเอียดโต๊ะที่เลือก (ด้านขวาของผังโต๊ะ) — ปุ่มที่แสดงขึ้นกับสถานะโต๊ะและตำแหน่งผู้ใช้
 * @param {Object} props
 * @param {import('@/app/(pos)/tables/data').TableItem | null} props.table
 * @param {{ canOpenTable: boolean, canDisableTable: boolean, canBill: boolean }} props.permissions
 * @param {{
 *   onOpen: () => void, onMove: () => void, onReprintQr: () => void, onStartClosing: () => void,
 *   onClean: () => void, onToggleDisabled: () => void, onRecordLeftover: (weightGrams: number) => Promise<string|null>
 * }} props.handlers
 * @param {boolean} props.isQrLoading
 */
function TableDetailPanel({ table, permissions, handlers, isQrLoading }) {
  if (!table) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-3xl bg-white p-8 text-center text-ink-muted shadow-sm">
        <MousePointerClick className="size-10" aria-hidden />
        <p>เลือกโต๊ะเพื่อดูรายละเอียด</p>
      </section>
    );
  }

  return <SelectedTablePanel table={table} permissions={permissions} handlers={handlers} isQrLoading={isQrLoading} />;
}

function SelectedTablePanel({ table, permissions, handlers, isQrLoading }) {
  const displayKey = useCurrentTimeSelector((now) => getTableDisplay(table, now).key);
  const style = TABLE_DISPLAY_STYLES[displayKey];
  const session = table.session;
  const isServing = displayKey === 'active' || displayKey === 'nearExpiry' || displayKey === 'expired';

  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm">
      <header className="flex items-center gap-3">
        <span className="flex h-16 min-w-16 items-center justify-center rounded-2xl bg-primary px-3 text-2xl font-bold text-white">
          {table.tableNumber}
        </span>
        <div>
          <p className="text-xl font-bold">โต๊ะ {table.tableNumber}</p>
          <p className="text-sm text-ink-muted">{table.capacity} ที่นั่ง</p>
        </div>
        <span className={cn('ml-auto rounded-full px-3 py-1 text-sm font-bold', style.badge)}>{style.label}</span>
      </header>

      {session && (
        <>
          {isServing && (
            <div className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
              <p className="text-sm text-ink-muted">เวลาคงเหลือ</p>
              <RemainingTimeLarge table={table} />
              <ElapsedBar table={table} />
              <p className="flex justify-between text-sm text-ink-muted">
                <span>เริ่ม {formatClockTime(session.startedAt)}</span>
                <span>หมดเวลา {formatClockTime(session.expiresAt)}</span>
              </p>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-surface p-3">
              <dt className="text-ink-muted">ลูกค้า</dt>
              <dd className="font-bold">{formatGuestCount(session)}</dd>
            </div>
            <div className="rounded-2xl bg-surface p-3">
              <dt className="text-ink-muted">สั่งอาหารแล้ว</dt>
              <dd className="font-bold">
                {session.orderedCount} จาน
                {session.pendingCount > 0 && <span className="text-amber-700"> (รอ {session.pendingCount})</span>}
              </dd>
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-2xl bg-surface p-3">
              <dt className="text-ink-muted">
                ค่าบุฟเฟต์ ({session.adultCount} × {formatCurrency(session.adultPrice)}
                {session.childCount > 0 && ` + ${session.childCount} × ${formatCurrency(session.childPrice)}`})
              </dt>
              <dd className="text-lg font-bold">{formatCurrency(session.buffetTotal)}</dd>
            </div>
          </dl>
        </>
      )}

      {/* ===== ปุ่มตามสถานะ ===== */}
      <div className="flex flex-col gap-2">
        {displayKey === 'available' && permissions.canOpenTable && (
          <Button variant="success" size="lg" icon={Plus} onClick={handlers.onOpen}>
            เปิดโต๊ะนี้
          </Button>
        )}

        {isServing && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" icon={QrCode} onClick={handlers.onReprintQr} isLoading={isQrLoading}>
                พิมพ์ QR
              </Button>
              <Button variant="secondary" icon={ArrowLeftRight} onClick={handlers.onMove}>
                ย้ายโต๊ะ
              </Button>
            </div>
            <Button size="lg" icon={DoorOpen} onClick={handlers.onStartClosing}>
              เชิญลูกค้าออก / ชั่งเนื้อ
            </Button>
          </>
        )}

        {displayKey === 'closing' && (
          <>
            <LeftoverForm key={session.id} savedLeftover={session.leftover} onSave={handlers.onRecordLeftover} />
            <Button variant="secondary" icon={ArrowLeftRight} onClick={handlers.onMove}>
              ย้ายโต๊ะ
            </Button>
          </>
        )}

        {(displayKey === 'closing' || displayKey === 'billed') &&
          (permissions.canBill ? (
            <Link
              href={`/billing?sessionId=${session.id}`}
              className="flex h-14 items-center justify-center gap-2 rounded-xl bg-primary text-lg font-bold text-white hover:bg-primary-deep"
            >
              <Receipt className="size-5" aria-hidden />
              ไปหน้าคิดเงิน
            </Link>
          ) : (
            <p className="rounded-xl bg-surface px-4 py-3 text-center text-sm text-ink-muted">รอแคชเชียร์คิดเงิน</p>
          ))}

        {displayKey === 'cleaning' && (
          <Button variant="success" size="lg" icon={Brush} onClick={handlers.onClean}>
            เก็บโต๊ะเสร็จ
          </Button>
        )}

        {permissions.canDisableTable && (displayKey === 'available' || displayKey === 'cleaning') && (
          <Button variant="ghost" icon={Wrench} onClick={handlers.onToggleDisabled}>
            ปิดใช้งานโต๊ะ
          </Button>
        )}
        {permissions.canDisableTable && displayKey === 'disabled' && (
          <Button variant="success" icon={Power} onClick={handlers.onToggleDisabled}>
            เปิดใช้งานโต๊ะ
          </Button>
        )}
        {!permissions.canDisableTable && displayKey === 'disabled' && (
          <p className="rounded-xl bg-surface px-4 py-3 text-center text-sm text-ink-muted">
            โต๊ะนี้ถูกปิดใช้งาน (ผู้จัดการเปิดใช้งานได้)
          </p>
        )}
      </div>
    </section>
  );
}

export default memo(TableDetailPanel);
