'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Radio, RefreshCw, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStockRealtime } from '@/hooks/useStockRealtime';
import { formatBangkokTime, formatStockNumber } from '@/lib/stock';
import { AlertMessage } from '@/components/ui';
import PendingCountList from './PendingCountList';
import StockSummaryTable from './StockSummaryTable';
import StockLineChart from './StockLineChart';

/**
 * เลือกวัตถุดิบที่จะเปิดกราฟให้อัตโนมัติตอนเข้าหน้า
 * 1. ตัวแรกที่ "หมด" หรือ "ต้องซื้อ" (ตารางเรียงสถานะไว้แล้ว)  2. ตัวแรกที่มีความเคลื่อนไหววันนี้  3. ตัวแรกในตาราง
 * @param {Array<object>} rows - แถวสรุปที่เรียงแล้ว (ต้องมีอย่างน้อย 1 แถว)
 * @returns {object}
 */
function pickDefaultChartRow(rows) {
  const needToBuy = rows.find((row) => row.status !== 'ok');
  if (needToBuy) return needToBuy;
  const hasActivity = rows.find(
    (row) => row.usedTotal !== 0 || row.wasteTotal !== 0 || row.restockTotal !== 0 || row.adjustTotal !== 0
  );
  return hasActivity ?? rows[0];
}

/**
 * หน้าจอสต็อกของ Manager/Admin (/inventory)
 * 1. ผลนับรออนุมัติ  2. ตารางสรุปสต็อกวันนี้  3. กราฟของวัตถุดิบที่เลือก (เรียลไทม์)
 *
 * แสดงภายในโครงหน้า StaffShell
 *
 * @param {object} props
 * @param {string} props.staffRole
 * @param {(selectedId: string|null) => Promise<{ rows: Array, dayStartIso: string, error: string|null }>} props.loadSummaryAction
 * @param {() => Promise<{ counts: Array, error: string|null }>} props.loadPendingAction
 * @param {(id: string, approve: boolean, reason: string|null) => Promise<{ success: boolean, error: string|null }>} props.reviewAction
 */
export default function InventoryScreen({
  staffRole,
  loadSummaryAction,
  loadPendingAction,
  reviewAction,
}) {
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [pendingCounts, setPendingCounts] = useState([]);
  const [busyIds, setBusyIds] = useState(new Set());
  const [onlyNeedToBuy, setOnlyNeedToBuy] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // ตัวจับเวลากลางของหน้า: ขยับปลายกราฟ "ตอนนี้" ทุก 1 นาที (ไม่ต้องจับเวลาทุกวินาที)
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const applySummary = useCallback((result) => {
    setRows(result.rows);
    setErrorMessage(result.error);
    setIsLoading(false);
    setLastUpdated(new Date().toISOString());
    setNowMs(Date.now());
  }, []);

  const loadSummary = useCallback(
    async (ingredientId) => applySummary(await loadSummaryAction(ingredientId)),
    [loadSummaryAction, applySummary]
  );

  const loadPending = useCallback(async () => {
    const result = await loadPendingAction();
    setPendingCounts(result.counts);
    if (result.error) setErrorMessage(result.error);
  }, [loadPendingAction]);

  // เลือกวัตถุดิบให้อัตโนมัติแค่ครั้งแรกที่เปิดหน้า (ถ้าผู้ใช้กดปิดกราฟเอง จะไม่เลือกให้ซ้ำ)
  const hasAutoSelectedRef = useRef(false);

  // โหลดครั้งแรก + โหลดใหม่เมื่อเลือกวัตถุดิบอื่น (เพื่อเอาจุดกราฟของตัวนั้น)
  useEffect(() => {
    let isCurrent = true;
    loadSummaryAction(selectedId).then((result) => {
      if (!isCurrent) return;
      applySummary(result);

      if (!hasAutoSelectedRef.current && result.rows.length > 0) {
        hasAutoSelectedRef.current = true;
        setSelectedId(pickDefaultChartRow(result.rows).id);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [loadSummaryAction, applySummary, selectedId]);

  useEffect(() => {
    let isCurrent = true;
    loadPendingAction().then((result) => {
      if (!isCurrent) return;
      setPendingCounts(result.counts);
      if (result.error) setErrorMessage(result.error);
    });
    return () => {
      isCurrent = false;
    };
  }, [loadPendingAction]);

  // Realtime: สต็อกขยับ → โหลดสรุปใหม่ / ผลนับเปลี่ยน → โหลดรายการรออนุมัติใหม่
  useStockRealtime({
    onStockChange: () => loadSummary(selectedId),
    onCountChange: () => {
      loadPending();
      loadSummary(selectedId);
    },
  });

  // อนุมัติ/ปฏิเสธ แบบ Optimistic: ซ่อนการ์ดทันที ถ้าพลาดค่อยแสดงกลับ
  const handleReview = useCallback(
    async (countId, approve, reason) => {
      const reviewedCount = pendingCounts.find((count) => count.id === countId);
      setBusyIds((prev) => new Set(prev).add(countId));
      setPendingCounts((prev) => prev.filter((count) => count.id !== countId));
      setErrorMessage(null);

      const result = await reviewAction(countId, approve, reason);

      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(countId);
        return next;
      });

      if (!result.success) {
        setErrorMessage(result.error);
        if (reviewedCount) {
          setPendingCounts((prev) =>
            [...prev, reviewedCount].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          );
        }
        return;
      }
      loadSummary(selectedId);
    },
    [pendingCounts, reviewAction, loadSummary, selectedId]
  );

  const handleSelect = useCallback((ingredientId) => {
    setSelectedId((current) => (current === ingredientId ? null : ingredientId));
  }, []);

  const visibleRows = useMemo(
    () => (onlyNeedToBuy ? rows.filter((row) => row.status !== 'ok') : rows),
    [rows, onlyNeedToBuy]
  );

  const selectedRow = rows.find((row) => row.id === selectedId) || null;
  const lowStockRows = rows.filter((row) => row.status !== 'ok');
  const needToBuyCount = lowStockRows.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">ภาพรวมวันนี้</h2>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-ink-muted">
            <Radio size={16} className="text-emerald-500" />
            เรียลไทม์{lastUpdated && ` · อัปเดต ${formatBangkokTime(lastUpdated)}`}
          </span>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              loadSummary(selectedId);
              loadPending();
            }}
            className="p-2 rounded-xl text-ink-muted hover:bg-surface"
            aria-label="โหลดข้อมูลใหม่"
          >
            <RefreshCw size={20} className={cn(isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="space-y-8">
        <AlertMessage>{errorMessage}</AlertMessage>

        {/* FR-034: แจ้งเตือนวัตถุดิบที่ต่ำกว่าจุดสั่งซื้อ/หมด */}
        {lowStockRows.length > 0 && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl bg-danger-soft px-5 py-4 text-danger">
            <TriangleAlert className="mt-0.5 size-6 shrink-0" aria-hidden />
            <p className="font-bold">
              ต้องสั่งซื้อ {lowStockRows.length} รายการ:{' '}
              <span className="font-semibold">
                {lowStockRows.map((row) => `${row.name} (${row.status === 'out' ? 'หมด' : `เหลือ ${formatStockNumber(row.remaining)} ${row.unit}`})`).join(', ')}
              </span>
            </p>
          </div>
        )}

        <section aria-labelledby="pending-heading" className="space-y-3">
          <h2 id="pending-heading" className="text-base font-bold text-ink">
            ผลนับรออนุมัติ {pendingCounts.length > 0 && `(${pendingCounts.length})`}
          </h2>
          <PendingCountList
            counts={pendingCounts}
            isAdmin={staffRole === 'admin'}
            busyIds={busyIds}
            onReview={handleReview}
          />
        </section>

        <section aria-labelledby="summary-heading" className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="summary-heading" className="text-base font-bold text-ink">
              สรุปสต็อกวันนี้
            </h2>
            <span className="text-sm text-ink-muted">ต้องซื้อ/หมด {needToBuyCount} รายการ · กดชื่อเพื่อดูกราฟ</span>
            <label className="ml-auto flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={onlyNeedToBuy}
                onChange={(event) => setOnlyNeedToBuy(event.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              เฉพาะที่ต้องซื้อ
            </label>
          </div>

          {selectedRow?.points && (
            <div className="bg-white rounded-2xl border border-line p-5 space-y-3">
              <div className="flex items-baseline gap-3">
                <h3 className="font-bold text-ink">{selectedRow.name}</h3>
                <p className="text-sm text-ink-muted">ยอดคงเหลือวันนี้ ({selectedRow.unit})</p>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="ml-auto text-sm font-semibold text-ink-muted hover:text-ink"
                >
                  ปิดกราฟ
                </button>
              </div>
              <StockLineChart row={selectedRow} nowMs={nowMs} />
            </div>
          )}

          {isLoading && rows.length === 0 ? (
            <p className="p-8 text-center text-ink-muted">กำลังโหลดสต็อก...</p>
          ) : (
            <StockSummaryTable rows={visibleRows} selectedId={selectedId} onSelect={handleSelect} />
          )}

          <p className="text-xs text-ink-muted">
            ● เริ่มต้นจากยอดนับจริงตอนเปิดร้าน (อนุมัติแล้ว) · ○ เริ่มต้นจากยอดระบบตอน 00:00 (ยังไม่ได้นับหรือยังไม่อนุมัติ)
            · &quot;ใช้ไป&quot; หักรายการที่ครัวยกเลิกแล้ว
          </p>
        </section>
      </div>
    </div>
  );
}
