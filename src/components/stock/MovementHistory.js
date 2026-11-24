'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AlertMessage, Button } from '@/components/ui';
import { STOCK_MOVEMENT_LABELS } from '@/lib/constants';
import { formatStockNumber } from '@/lib/stock';
import { cn } from '@/lib/utils';

const SELECT_CLASS = 'h-11 rounded-xl border border-line bg-white px-3 outline-none focus:border-primary';

/** วันที่ YYYY-MM-DD ตามเวลาไทย */
function bangkokDateText(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date);
}

/** วันเวลาไทยแบบสั้น เช่น 25/11 14:05 */
function formatDateTime(iso) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

/**
 * แท็บ "ประวัติความเคลื่อนไหว" (Stock Movement Ledger — FR-033)
 * กรองตามวัตถุดิบ ประเภท และช่วงวันที่ (ค่าเริ่มต้น 7 วันล่าสุด)
 *
 * @param {object} props
 * @param {() => Promise<{ ingredients: Array, error: string|null }>} props.loadIngredientsAction
 * @param {(filters: object) => Promise<{ movements: Array, isTruncated: boolean, error: string|null }>} props.loadMovementsAction
 */
export default function MovementHistory({ loadIngredientsAction, loadMovementsAction }) {
  const [ingredients, setIngredients] = useState([]);
  const [filters, setFilters] = useState(() => ({
    ingredientId: '',
    movementType: '',
    fromDate: bangkokDateText(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)),
    toDate: bangkokDateText(),
  }));
  const [movements, setMovements] = useState([]);
  const [isTruncated, setIsTruncated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState(null);

  useEffect(() => {
    let isCurrent = true;
    loadIngredientsAction().then((result) => {
      if (isCurrent) setIngredients(result.ingredients);
    });
    return () => {
      isCurrent = false;
    };
  }, [loadIngredientsAction]);

  const runSearch = useCallback(
    async (activeFilters) => {
      setIsLoading(true);
      const result = await loadMovementsAction({
        ingredientId: activeFilters.ingredientId || null,
        movementType: activeFilters.movementType || null,
        fromDate: activeFilters.fromDate || null,
        toDate: activeFilters.toDate || null,
      });
      setMovements(result.movements);
      setIsTruncated(result.isTruncated);
      setPageError(result.error);
      setIsLoading(false);
    },
    [loadMovementsAction]
  );

  useEffect(() => {
    let isCurrent = true;
    loadMovementsAction({
      fromDate: filters.fromDate,
      toDate: filters.toDate,
    }).then((result) => {
      if (!isCurrent) return;
      setMovements(result.movements);
      setIsTruncated(result.isTruncated);
      setPageError(result.error);
      setIsLoading(false);
    });
    return () => {
      isCurrent = false;
    };
    // โหลดครั้งแรกครั้งเดียว — หลังจากนั้นโหลดเมื่อกดปุ่มค้นหา
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMovementsAction]);

  const setFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-2 rounded-3xl bg-white p-3 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          runSearch(filters);
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">วัตถุดิบ</span>
          <select className={SELECT_CLASS} value={filters.ingredientId} onChange={(e) => setFilter('ingredientId', e.target.value)}>
            <option value="">ทั้งหมด</option>
            {ingredients.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">ประเภท</span>
          <select className={SELECT_CLASS} value={filters.movementType} onChange={(e) => setFilter('movementType', e.target.value)}>
            <option value="">ทั้งหมด</option>
            {Object.entries(STOCK_MOVEMENT_LABELS).map(([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">ตั้งแต่</span>
          <input type="date" className={SELECT_CLASS} value={filters.fromDate} onChange={(e) => setFilter('fromDate', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">ถึง</span>
          <input type="date" className={SELECT_CLASS} value={filters.toDate} onChange={(e) => setFilter('toDate', e.target.value)} />
        </label>
        <Button type="submit" icon={RefreshCw} isLoading={isLoading}>
          ค้นหา
        </Button>
      </form>

      <AlertMessage>{pageError}</AlertMessage>
      {isTruncated && (
        <AlertMessage tone="success">แสดง 300 รายการล่าสุด — เลือกช่วงวันที่หรือวัตถุดิบให้แคบลงเพื่อดูทั้งหมด</AlertMessage>
      )}

      {isLoading && movements.length === 0 ? (
        <div className="h-64 animate-pulse rounded-3xl bg-white" aria-hidden />
      ) : movements.length === 0 ? (
        <p className="rounded-3xl bg-white p-10 text-center text-ink-muted">ไม่มีความเคลื่อนไหวในช่วงนี้</p>
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">เวลา</th>
                <th className="px-4 py-3 font-semibold">วัตถุดิบ</th>
                <th className="px-4 py-3 font-semibold">ประเภท</th>
                <th className="px-4 py-3 text-right font-semibold">เปลี่ยน</th>
                <th className="px-4 py-3 text-right font-semibold">คงเหลือ</th>
                <th className="px-4 py-3 font-semibold">ผู้ทำรายการ / เหตุผล</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">{formatDateTime(movement.createdAt)}</td>
                  <td className="px-4 py-2.5 font-semibold">{movement.ingredientName}</td>
                  <td className="px-4 py-2.5">{STOCK_MOVEMENT_LABELS[movement.movementType] ?? movement.movementType}</td>
                  <td
                    className={cn(
                      'px-4 py-2.5 text-right font-bold',
                      movement.quantity > 0 ? 'text-emerald-800' : 'text-danger'
                    )}
                  >
                    {movement.quantity > 0 ? '+' : '−'}
                    {formatStockNumber(Math.abs(movement.quantity))}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {formatStockNumber(movement.balanceAfter)} <span className="text-xs text-ink-muted">{movement.unit}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold">{movement.creatorName}</span>
                    {movement.reason && <span className="block text-xs text-ink-muted">{movement.reason}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
