'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, PackagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STOCK_MOVEMENT_TYPES } from '@/lib/constants';
import StockCountSheet from './StockCountSheet';
import StockMovementForm from './StockMovementForm';

const TABS = [
  { key: 'count', label: 'นับสต็อก', icon: ClipboardCheck },
  { key: STOCK_MOVEMENT_TYPES.MANUAL_RESTOCK, label: 'รับของเข้า', icon: PackagePlus },
  { key: STOCK_MOVEMENT_TYPES.KITCHEN_WASTE, label: 'ของเสีย', icon: Trash2 },
];

/**
 * หน้าจอนับสต็อกของ staff (/stock-count) — แสดงภายในโครงหน้า StaffShell
 * รับ Server Action ผ่าน props จาก page.js เพื่อให้ Component ไม่ผูกกับโฟลเดอร์ route
 *
 * @param {object} props
 * @param {() => Promise<{ ingredients: Array, todayRounds: Array, error: string|null }>} props.loadSheetAction
 * @param {(round: string, items: Array, confirmRecount: boolean) => Promise<object>} props.submitCountAction
 * @param {(ingredientId: string, movementType: string, quantity: number, reason: string|null) => Promise<object>} props.recordMovementAction
 */
export default function StockCountScreen({
  loadSheetAction,
  submitCountAction,
  recordMovementAction,
}) {
  const [activeTab, setActiveTab] = useState('count');
  const [ingredients, setIngredients] = useState([]);
  const [todayRounds, setTodayRounds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const loadSheet = useCallback(async () => {
    const result = await loadSheetAction();
    setIngredients(result.ingredients);
    setTodayRounds(result.todayRounds);
    setLoadError(result.error);
    setIsLoading(false);
  }, [loadSheetAction]);

  useEffect(() => {
    let isCurrent = true;
    loadSheetAction().then((result) => {
      if (!isCurrent) return;
      setIngredients(result.ingredients);
      setTodayRounds(result.todayRounds);
      setLoadError(result.error);
      setIsLoading(false);
    });
    return () => {
      isCurrent = false;
    };
  }, [loadSheetAction]);

  // ส่งผลนับแล้วโหลดสถานะรอบใหม่
  const handleSubmitCount = useCallback(
    async (round, items, confirmRecount) => {
      const result = await submitCountAction(round, items, confirmRecount);
      if (result.status === 'submitted') loadSheet();
      return result;
    },
    [submitCountAction, loadSheet]
  );

  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">นับสต็อก</h1>
        <button
          type="button"
          onClick={() => {
            setIsLoading(true);
            loadSheet();
          }}
          className="p-2 rounded-xl text-ink-muted hover:bg-surface"
          aria-label="โหลดข้อมูลใหม่"
        >
          <RefreshCw size={20} className={cn(isLoading && 'animate-spin')} />
        </button>
      </div>

      <nav className="grid grid-cols-3 gap-2" aria-label="เลือกงาน">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              aria-pressed={activeTab === tab.key}
              className={cn(
                'py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all',
                activeTab === tab.key
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-white text-ink border border-line hover:bg-surface'
              )}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <section className="pb-12">
        {isLoading && ingredients.length === 0 ? (
          <p className="p-8 text-center text-ink-muted">กำลังโหลดรายการวัตถุดิบ...</p>
        ) : loadError ? (
          <p className="p-4 rounded-xl bg-danger-soft border border-danger-soft text-danger" role="alert">
            {loadError}
          </p>
        ) : activeTab === 'count' ? (
          <StockCountSheet
            ingredients={ingredients}
            todayRounds={todayRounds}
            onSubmit={handleSubmitCount}
          />
        ) : (
          <StockMovementForm
            key={activeTab}
            movementType={activeTab}
            ingredients={ingredients}
            onSubmit={recordMovementAction}
          />
        )}
      </section>
    </div>
  );
}
