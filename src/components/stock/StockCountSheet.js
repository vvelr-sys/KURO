'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Search, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { STOCK_COUNT_ROUNDS, STOCK_COUNT_ROUND_LABELS } from '@/lib/constants';

/**
 * แถววัตถุดิบ 1 รายการในใบนับ — แสดงแค่ชื่อและหน่วย (ไม่แสดงยอดในระบบ)
 */
const IngredientCountRow = React.memo(function IngredientCountRow({
  ingredient,
  value,
  reason,
  needsRecount,
  onValueChange,
  onReasonChange,
}) {
  return (
    <li
      className={cn(
        'p-4 border-b border-line last:border-b-0',
        needsRecount && 'bg-amber-50'
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink truncate">{ingredient.name}</p>
          {needsRecount && (
            <p className="text-xs font-semibold text-amber-800 flex items-center gap-1 mt-0.5">
              <AlertTriangle size={14} /> ต่างจากระบบมาก — กรุณานับซ้ำ
            </p>
          )}
        </div>
        <label className="flex items-center gap-2">
          <span className="sr-only">ยอดที่นับได้ของ {ingredient.name}</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={value}
            onChange={(event) => onValueChange(ingredient.id, event.target.value)}
            className={cn(
              'w-32 px-3 py-2.5 rounded-xl border text-right text-lg font-semibold tabular-nums',
              'focus:outline-none focus:ring-2 focus:ring-primary/40',
              value === '' ? 'border-line' : 'border-emerald-400 bg-emerald-50/40'
            )}
            placeholder="0"
          />
          <span className="w-12 text-sm text-ink-muted">{ingredient.unit}</span>
        </label>
      </div>
      {needsRecount && (
        <input
          type="text"
          value={reason}
          onChange={(event) => onReasonChange(ingredient.id, event.target.value)}
          placeholder="หมายเหตุ (ถ้ามี) เช่น ทำหล่น, ของเสียไม่ได้บันทึก"
          className="mt-2 w-full px-3 py-2 rounded-lg border border-amber-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50"
        />
      )}
    </li>
  );
});

/**
 * ใบตรวจนับสต็อกแบบไม่เห็นยอด (Blind Count)
 * ต้องนับครบทุกวัตถุดิบก่อนส่ง → รอผู้จัดการอนุมัติ
 *
 * @param {object} props
 * @param {Array<{ id: string, name: string, unit: string }>} props.ingredients
 * @param {Array<{ count_round: string, status: string }>} props.todayRounds - รอบที่ส่งไปแล้ววันนี้
 * @param {(round: string, items: Array, confirmRecount: boolean) => Promise<{ status: string|null, recountIds: string[], error: string|null }>} props.onSubmit
 */
const StockCountSheet = React.memo(function StockCountSheet({ ingredients, todayRounds, onSubmit }) {
  // รอบที่ส่งไปแล้ว (ยกเว้นที่ถูกปฏิเสธ นับใหม่ได้)
  const submittedRounds = useMemo(() => {
    const rounds = new Map();
    for (const round of todayRounds) {
      if (round.status !== 'rejected') rounds.set(round.count_round, round.status);
    }
    return rounds;
  }, [todayRounds]);

  const [selectedRound, setSelectedRound] = useState(() =>
    new Date().getHours() < 15 ? STOCK_COUNT_ROUNDS.OPENING : STOCK_COUNT_ROUNDS.CLOSING
  );
  const [countedValues, setCountedValues] = useState({});
  const [reasons, setReasons] = useState({});
  const [recountIds, setRecountIds] = useState(new Set());
  const [searchText, setSearchText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const debouncedSearch = useDebounce(searchText, 200);
  const isRoundLocked = submittedRounds.has(selectedRound);

  const handleValueChange = useCallback((ingredientId, nextValue) => {
    setCountedValues((prev) => ({ ...prev, [ingredientId]: nextValue }));
  }, []);

  const handleReasonChange = useCallback((ingredientId, nextReason) => {
    setReasons((prev) => ({ ...prev, [ingredientId]: nextReason }));
  }, []);

  const countedTotal = ingredients.filter((item) => (countedValues[item.id] ?? '') !== '').length;
  const isComplete = ingredients.length > 0 && countedTotal === ingredients.length;

  // รายการที่ต้องนับซ้ำขึ้นก่อน แล้วกรองตามคำค้นหา
  const visibleIngredients = useMemo(() => {
    const keyword = debouncedSearch.trim().toLowerCase();
    const filtered = keyword
      ? ingredients.filter((item) => item.name.toLowerCase().includes(keyword))
      : ingredients;
    if (recountIds.size === 0) return filtered;
    return [...filtered].sort((a, b) => Number(recountIds.has(b.id)) - Number(recountIds.has(a.id)));
  }, [ingredients, debouncedSearch, recountIds]);

  const handleSubmit = async () => {
    if (!isComplete || isRoundLocked || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const items = ingredients.map((item) => ({
      ingredient_id: item.id,
      counted_stock: Number(countedValues[item.id]),
      reason: reasons[item.id]?.trim() || null,
    }));

    // ถ้าเคยถูกเตือนให้นับซ้ำแล้ว การกดส่งครั้งนี้ถือว่ายืนยัน
    const confirmRecount = recountIds.size > 0;
    const result = await onSubmit(selectedRound, items, confirmRecount);

    setIsSubmitting(false);

    if (result.error) {
      setErrorMessage(result.error);
      return;
    }
    if (result.status === 'need_recount') {
      setRecountIds(new Set(result.recountIds));
      setSearchText('');
      return;
    }

    // ส่งสำเร็จ → ล้างใบนับ
    setCountedValues({});
    setReasons({});
    setRecountIds(new Set());
    setSuccessMessage(`ส่งผลนับ${STOCK_COUNT_ROUND_LABELS[selectedRound]}แล้ว รอผู้จัดการอนุมัติ`);
  };

  return (
    <section className="space-y-4">
      {/* เลือกรอบการนับ */}
      <div className="grid grid-cols-2 gap-3">
        {Object.values(STOCK_COUNT_ROUNDS).map((round) => {
          const roundStatus = submittedRounds.get(round);
          return (
            <button
              key={round}
              type="button"
              onClick={() => {
                setSelectedRound(round);
                setRecountIds(new Set());
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={cn(
                'p-4 rounded-2xl border-2 text-left transition-all',
                selectedRound === round
                  ? 'border-primary bg-danger-soft'
                  : 'border-line bg-white hover:border-line'
              )}
            >
              <p className="font-bold text-ink">{STOCK_COUNT_ROUND_LABELS[round]}</p>
              <p className="text-sm text-ink-muted mt-0.5">
                {roundStatus === 'pending_review' && 'ส่งแล้ว · รออนุมัติ'}
                {roundStatus === 'approved' && 'อนุมัติแล้ว'}
                {!roundStatus && 'ยังไม่ได้นับ'}
              </p>
            </button>
          );
        })}
      </div>

      {isRoundLocked ? (
        <div className="p-6 rounded-2xl bg-white border border-line text-center text-ink-muted">
          <CheckCircle2 className="mx-auto text-emerald-600 mb-2" size={32} />
          {STOCK_COUNT_ROUND_LABELS[selectedRound]}ของวันนี้ส่งผลนับไปแล้ว
          <p className="text-sm text-ink-muted mt-1">ถ้าต้องนับใหม่ ให้ผู้จัดการปฏิเสธผลนับเดิมก่อน</p>
        </div>
      ) : (
        <>
          {recountIds.size > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900" role="alert">
              <p className="font-bold flex items-center gap-2">
                <AlertTriangle size={18} /> มี {recountIds.size} รายการที่ต่างจากระบบมาก
              </p>
              <p className="text-sm mt-1">
                กรุณานับรายการสีเหลืองซ้ำอีกครั้ง แก้ตัวเลขถ้าผิด แล้วกด &quot;ยืนยันส่งผลนับ&quot;
              </p>
            </div>
          )}

          {/* ค้นหา + ความคืบหน้า */}
          <div className="flex items-center gap-3">
            <label className="flex-1 relative">
              <span className="sr-only">ค้นหาวัตถุดิบ</span>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" size={18} />
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="ค้นหาวัตถุดิบ"
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-line bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <p className="text-sm font-semibold text-ink whitespace-nowrap tabular-nums">
              นับแล้ว {countedTotal}/{ingredients.length}
            </p>
          </div>

          <ul className="bg-white rounded-2xl border border-line overflow-hidden">
            {visibleIngredients.map((ingredient) => (
              <IngredientCountRow
                key={ingredient.id}
                ingredient={ingredient}
                value={countedValues[ingredient.id] ?? ''}
                reason={reasons[ingredient.id] ?? ''}
                needsRecount={recountIds.has(ingredient.id)}
                onValueChange={handleValueChange}
                onReasonChange={handleReasonChange}
              />
            ))}
            {visibleIngredients.length === 0 && (
              <li className="p-6 text-center text-ink-muted">ไม่พบวัตถุดิบที่ค้นหา</li>
            )}
          </ul>
        </>
      )}

      {errorMessage && (
        <p className="p-3 rounded-xl bg-danger-soft border border-danger-soft text-danger text-sm" role="alert">
          {errorMessage}
        </p>
      )}
      {successMessage && (
        <p className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm" role="status">
          {successMessage}
        </p>
      )}

      {!isRoundLocked && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isComplete || isSubmitting}
          className={cn(
            'w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all',
            isComplete && !isSubmitting
              ? 'bg-primary text-white hover:bg-[#991B1B] active:scale-[0.99]'
              : 'bg-line text-ink-muted cursor-not-allowed'
          )}
        >
          <Send size={20} />
          {isSubmitting
            ? 'กำลังส่ง...'
            : !isComplete
              ? `นับให้ครบก่อน (เหลือ ${ingredients.length - countedTotal} รายการ)`
              : recountIds.size > 0
                ? 'ยืนยันส่งผลนับ'
                : 'ส่งผลนับ'}
        </button>
      )}
    </section>
  );
});

export default StockCountSheet;
