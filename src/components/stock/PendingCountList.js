'use client';

import React, { useState } from 'react';
import { Check, ClipboardList, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STOCK_COUNT_ROUND_LABELS } from '@/lib/constants';
import { formatBangkokTime, formatStockNumber } from '@/lib/stock';

/**
 * การ์ดผลนับ 1 รอบ ที่รออนุมัติ
 */
const PendingCountCard = React.memo(function PendingCountCard({ count, isAdmin, isBusy, onReview }) {
  // 'approve' | 'reject' | null — กำลังกรอกเหตุผลของการกระทำไหน
  const [reasonFor, setReasonFor] = useState(null);
  const [reasonText, setReasonText] = useState('');

  const changedItems = count.items.filter((item) => item.discrepancy !== 0);
  // แอดมินอนุมัติได้เฉพาะ Emergency ต้องมีเหตุผล / ปฏิเสธต้องมีเหตุผลเสมอ
  const needsReason = reasonFor === 'reject' || (reasonFor === 'approve' && isAdmin);

  const handleAction = (action) => {
    if (action === 'approve' && !isAdmin) {
      onReview(count.id, true, null);
      return;
    }
    if (reasonFor !== action) {
      setReasonFor(action);
      return;
    }
    if (needsReason && reasonText.trim() === '') return;
    onReview(count.id, action === 'approve', reasonText.trim());
  };

  return (
    <article className="bg-white rounded-2xl border border-line overflow-hidden">
      <header className="px-5 py-4 border-b border-line flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-bold text-ink">{STOCK_COUNT_ROUND_LABELS[count.countRound]}</h3>
        <p className="text-sm text-ink-muted">
          {count.countDate} · ส่งเวลา {formatBangkokTime(count.createdAt)} · โดย {count.counterName}
        </p>
        <p className="ml-auto text-sm font-semibold text-ink">
          ต่างจากระบบ {changedItems.length}/{count.items.length} รายการ
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-ink-muted">
            <tr className="text-left">
              <th className="px-5 py-2 font-semibold">วัตถุดิบ</th>
              <th className="px-5 py-2 font-semibold text-right">ยอดระบบ</th>
              <th className="px-5 py-2 font-semibold text-right">นับได้</th>
              <th className="px-5 py-2 font-semibold text-right">ผลต่าง</th>
              <th className="px-5 py-2 font-semibold">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {count.items.map((item) => (
              <tr key={item.id}>
                <td className="px-5 py-2 text-ink">{item.name}</td>
                <td className="px-5 py-2 text-right text-ink-muted">{formatStockNumber(item.systemStock)}</td>
                <td className="px-5 py-2 text-right text-ink">{formatStockNumber(item.countedStock)}</td>
                <td
                  className={cn(
                    'px-5 py-2 text-right font-bold',
                    item.discrepancy < 0 && 'text-[#b42318]',
                    item.discrepancy > 0 && 'text-[#006300]',
                    item.discrepancy === 0 && 'text-ink-muted'
                  )}
                >
                  {item.discrepancy === 0
                    ? '0'
                    : `${item.discrepancy > 0 ? '+' : '−'}${formatStockNumber(Math.abs(item.discrepancy))}`}{' '}
                  <span className="text-xs font-normal text-ink-muted">{item.unit}</span>
                </td>
                <td className="px-5 py-2 text-ink-muted">{item.reason || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="px-5 py-4 border-t border-line space-y-3">
        {reasonFor && (needsReason || reasonFor === 'reject') && (
          <label className="block">
            <span className="block text-sm font-semibold text-ink mb-1">
              {reasonFor === 'reject' ? 'เหตุผลที่ปฏิเสธ (นับใหม่ได้)' : 'เหตุผลฉุกเฉิน (แอดมินอนุมัติแทนผู้จัดการ)'}
            </span>
            <input
              type="text"
              value={reasonText}
              onChange={(event) => setReasonText(event.target.value)}
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-line focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            disabled={isBusy || (reasonFor === 'reject' && reasonText.trim() === '')}
            onClick={() => handleAction('reject')}
            className="flex-1 py-2.5 rounded-xl border border-line font-bold text-ink hover:bg-surface disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <X size={18} /> {reasonFor === 'reject' ? 'ยืนยันปฏิเสธ' : 'ปฏิเสธ'}
          </button>
          <button
            type="button"
            disabled={isBusy || (reasonFor === 'approve' && needsReason && reasonText.trim() === '')}
            onClick={() => handleAction('approve')}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white font-bold hover:bg-[#991B1B] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Check size={18} /> {reasonFor === 'approve' ? 'ยืนยันอนุมัติ' : 'อนุมัติ · ปรับยอดตามผลต่าง'}
          </button>
        </div>
      </footer>
    </article>
  );
});

/**
 * รายการผลนับที่รออนุมัติ (Manager; Admin เฉพาะ Emergency)
 *
 * @param {object} props
 * @param {Array<object>} props.counts
 * @param {boolean} props.isAdmin
 * @param {Set<string>} props.busyIds - รอบที่กำลังส่งคำสั่งอยู่
 * @param {(id: string, approve: boolean, reason: string|null) => void} props.onReview
 */
const PendingCountList = React.memo(function PendingCountList({ counts, isAdmin, busyIds, onReview }) {
  if (counts.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-white border border-line text-center text-ink-muted">
        <ClipboardList className="mx-auto mb-2 text-ink-muted" size={28} />
        ไม่มีผลนับที่รออนุมัติ
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {counts.map((count) => (
        <PendingCountCard
          key={count.id}
          count={count}
          isAdmin={isAdmin}
          isBusy={busyIds.has(count.id)}
          onReview={onReview}
        />
      ))}
    </div>
  );
});

export default PendingCountList;
