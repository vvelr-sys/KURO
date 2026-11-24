'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATION_DISPLAY = {
  fresh: 'ของสด',
  beverage: 'เครื่องดื่ม',
  grill: 'ปิ้งย่าง',
  hot_kitchen: 'ครัวร้อน',
};

/**
 * รวมจำนวนอาหารชื่อเดียวกันข้ามทุกโต๊ะ (ไม่นับจานที่เสิร์ฟแล้วหรือยกเลิก)
 * เพื่อให้คนในครัวรู้ว่าต้องเตรียมอาหารชนิดนี้ทั้งหมดกี่จาน
 *
 * @param {Array} orderList - รายการออเดอร์ทั้งหมด
 * @returns {Array<{ menuItemId: string, menuItemName: string, station: string, totalQuantity: number }>}
 */
function groupMenuForKitchen(orderList) {
  const summary = {};

  for (const order of orderList) {
    for (const item of order.items) {
      if (item.status === 'served' || item.status === 'cancelled') continue;

      const menuId = item.menu_item_id;
      if (!summary[menuId]) {
        summary[menuId] = {
          menuItemId: menuId,
          menuItemName: item.menu_item_name,
          station: item.station,
          totalQuantity: 0,
        };
      }
      summary[menuId].totalQuantity += item.quantity;
    }
  }

  // เรียงตามชื่อเมนูภาษาไทย ก-ฮ
  return Object.values(summary).sort((dishA, dishB) => dishA.menuItemName.localeCompare(dishB.menuItemName, 'th'));
}

/**
 * มุมมองรวมรายการเตรียมข้ามทุกโต๊ะ (Consolidated Prep To-Do View — FR-021)
 * การติ๊กเป็นตัวช่วยจำบนจอเท่านั้น ไม่เปลี่ยนสถานะออเดอร์จริง
 *
 * @param {{ orders: Array }} props
 */
const ConsolidatedPrepList = React.memo(function ConsolidatedPrepList({ orders }) {
  const [checkedDishIds, setCheckedDishIds] = useState(new Set());
  const prepList = useMemo(() => groupMenuForKitchen(orders), [orders]);

  const toggleCheckDish = useCallback((menuItemId) => {
    setCheckedDishIds((previousSet) => {
      const updatedSet = new Set(previousSet);
      if (updatedSet.has(menuItemId)) updatedSet.delete(menuItemId);
      else updatedSet.add(menuItemId);
      return updatedSet;
    });
  }, []);

  const resetAllChecks = useCallback(() => setCheckedDishIds(new Set()), []);

  const finishedCount = prepList.filter((dish) => checkedDishIds.has(dish.menuItemId)).length;

  if (prepList.length === 0) {
    return <p className="rounded-3xl bg-white p-10 text-center text-ink-muted">ไม่มีรายการที่ต้องเตรียมในขณะนี้</p>;
  }

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-bold">รวมรายการเตรียม</h2>
          <p className="text-sm text-ink-muted">รวมทุกโต๊ะ · แตะเพื่อติ๊กช่วยจำ (ไม่เปลี่ยนสถานะออเดอร์จริง)</p>
        </div>
        <span className="rounded-full bg-surface px-3 py-1 text-sm font-semibold">
          เตรียมแล้ว {finishedCount} / {prepList.length} เมนู
        </span>
        {finishedCount > 0 && (
          <button
            type="button"
            onClick={resetAllChecks}
            className="flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface"
            aria-label="ล้างที่ติ๊กไว้ทั้งหมด"
            title="ล้างที่ติ๊กไว้ทั้งหมด"
          >
            <RotateCcw className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <ul className="flex flex-col gap-1.5">
        {prepList.map((dish) => {
          const isDone = checkedDishIds.has(dish.menuItemId);
          return (
            <li key={dish.menuItemId}>
              <button
                type="button"
                onClick={() => toggleCheckDish(dish.menuItemId)}
                aria-pressed={isDone}
                className={cn(
                  'flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left transition-colors',
                  isDone ? 'bg-emerald-50' : 'bg-surface hover:bg-primary/5'
                )}
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-xl border-2',
                    isDone ? 'border-emerald-800 bg-emerald-800 text-white' : 'border-line bg-white'
                  )}
                >
                  {isDone && <Check className="size-5" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className={cn('block text-lg font-bold', isDone && 'text-ink-muted line-through')}>
                    {dish.menuItemName}
                  </span>
                  {STATION_DISPLAY[dish.station] && (
                    <span className="text-sm text-ink-muted">{STATION_DISPLAY[dish.station]}</span>
                  )}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1 text-lg font-bold tabular-nums',
                    isDone ? 'bg-white text-ink-muted' : 'bg-primary text-white'
                  )}
                >
                  ×{dish.totalQuantity}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
});

export default ConsolidatedPrepList;
