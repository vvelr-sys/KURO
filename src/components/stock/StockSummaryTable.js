'use client';

import React from 'react';
import { AlertOctagon, AlertTriangle, ChartLine, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatStockNumber } from '@/lib/stock';

// สถานะสต็อก: สี + ไอคอน + ข้อความเสมอ (ไม่ใช้สีอย่างเดียว)
const STATUS_DISPLAY = {
  out: { label: 'หมด', icon: AlertOctagon, className: 'text-[#b42318] bg-danger-soft border-danger-soft' },
  reorder: { label: 'ต้องซื้อ', icon: AlertTriangle, className: 'text-[#8a4b00] bg-amber-50 border-amber-200' },
  ok: { label: 'พอ', icon: CheckCircle2, className: 'text-[#006300] bg-emerald-50 border-emerald-200' },
};

/**
 * แถววัตถุดิบ 1 รายการ (memo ไว้ — Realtime อัปเดตบ่อย)
 */
const StockSummaryRow = React.memo(function StockSummaryRow({ row, isSelected, onSelect }) {
  const status = STATUS_DISPLAY[row.status];
  const StatusIcon = status.icon;

  return (
    <tr
      onClick={() => onSelect(row.id)}
      className={cn('cursor-pointer transition-colors', isSelected ? 'bg-danger-soft' : 'hover:bg-surface')}
    >
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(row.id);
          }}
          aria-pressed={isSelected}
          title={isSelected ? 'ปิดกราฟ' : 'ดูกราฟ'}
          className="group text-left font-semibold text-ink hover:underline flex items-center gap-2"
        >
          <svg width="10" height="10" aria-hidden="true">
            {row.startSource === 'counted' ? (
              <circle cx="5" cy="5" r="4" fill="#2a78d6" />
            ) : (
              <circle cx="5" cy="5" r="3.5" fill="#fcfcfb" stroke="#2a78d6" strokeWidth="1.5" />
            )}
          </svg>
          {row.name}
          {/* ไอคอนกราฟ: บอกว่ากดชื่อแล้วจะเห็นกราฟ (เข้มขึ้นเมื่อเลือกอยู่) */}
          <ChartLine
            size={15}
            aria-hidden="true"
            className={cn(isSelected ? 'text-[#2a78d6]' : 'text-ink-muted group-hover:text-[#2a78d6]')}
          />
        </button>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatStockNumber(row.startValue)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatStockNumber(row.usedTotal)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatStockNumber(row.wasteTotal)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatStockNumber(row.restockTotal)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-ink">
        {row.adjustTotal === 0 ? '—' : `${row.adjustTotal > 0 ? '+' : ''}${formatStockNumber(row.adjustTotal)}`}
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-bold text-ink">
        {formatStockNumber(row.remaining)} <span className="text-xs font-normal text-ink-muted">{row.unit}</span>
      </td>
      <td className="px-4 py-3">
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold', status.className)}>
          <StatusIcon size={14} />
          {status.label}
        </span>
      </td>
    </tr>
  );
});

/**
 * ตารางสรุปสต็อกวันนี้: เริ่มต้น / ใช้ไป / ของเสีย / รับเข้า / ปรับยอด / เหลือ / สถานะ
 * กดแถวเพื่อดูกราฟของวัตถุดิบนั้น
 *
 * @param {object} props
 * @param {Array<object>} props.rows - เรียงแล้ว (หมด → ต้องซื้อ → พอ)
 * @param {string|null} props.selectedId
 * @param {(id: string) => void} props.onSelect
 */
const StockSummaryTable = React.memo(function StockSummaryTable({ rows, selectedId, onSelect }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full text-sm">
        <thead className="bg-surface text-ink-muted">
          <tr className="text-left">
            <th className="px-4 py-3 font-semibold">วัตถุดิบ</th>
            <th className="px-4 py-3 font-semibold text-right">เริ่มต้น</th>
            <th className="px-4 py-3 font-semibold text-right">ใช้ไป</th>
            <th className="px-4 py-3 font-semibold text-right">ของเสีย</th>
            <th className="px-4 py-3 font-semibold text-right">รับเข้า</th>
            <th className="px-4 py-3 font-semibold text-right">ปรับยอด</th>
            <th className="px-4 py-3 font-semibold text-right">เหลือ</th>
            <th className="px-4 py-3 font-semibold">สถานะ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <StockSummaryRow key={row.id} row={row} isSelected={row.id === selectedId} onSelect={onSelect} />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-ink-muted">ไม่มีรายการ</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});

export default StockSummaryTable;
