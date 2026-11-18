'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * รวมจำนวนอาหารชื่อเดียวกันข้ามทุกโต๊ะ
 * เพื่อให้คนในครัวรู้ว่าต้องเตรียมอาหารชนิดนี้ทั้งหมดกี่จาน
 *
 * @param {Array} orderList - รายการออเดอร์ทั้งหมด
 * @returns {Array} รายการเมนูที่รวมจำนวนแล้ว
 */
function groupMenuForKitchen(orderList) {
  const summary = {};

  for (const order of orderList) {
    for (const item of order.items) {
      // ไม่ต้องนับจานที่เสิร์ฟไปแล้ว หรือจานที่ถูกยกเลิก
      if (item.status === 'served' || item.status === 'cancelled') {
        continue;
      }

      const menuId = item.menu_item_id;

      // ถ้ายังไม่เคยนับเมนูนี้ ให้เริ่มตั้งต้นไว้ที่ 0
      if (!summary[menuId]) {
        summary[menuId] = {
          menuItemId: menuId,
          menuItemName: item.menu_item_name,
          station: item.station,
          totalQuantity: 0,
        };
      }

      // บวกจำนวนจานเพิ่มเข้าไป
      summary[menuId].totalQuantity += item.quantity;
    }
  }

  // แปลงเป็น Array แล้วเรียงตามชื่อเมนูภาษาไทย ก-ฮ
  return Object.values(summary).sort((dishA, dishB) =>
    dishA.menuItemName.localeCompare(dishB.menuItemName, 'th')
  );
}

/**
 * หน้าจอแสดงรายการอาหารที่ต้องเตรียมรวมข้ามทุกโต๊ะ
 * ให้คนเตรียมของสามารถติ๊กช่วยจำได้ว่าหยิบของชิ้นไหนไปแล้วบ้าง
 */
const ConsolidatedPrepList = React.memo(function ConsolidatedPrepList({ orders }) {
  // เก็บรายการที่ติ๊กเสร็จแล้ว (เป็นแค่การติ๊กช่วยจำในหน้าจอ ไม่กระทบข้อมูลจริง)
  const [checkedDishIds, setCheckedDishIds] = useState(new Set());

  // คำนวณสรุปยอดอาหารที่ต้องเตรียม
  const prepList = useMemo(() => groupMenuForKitchen(orders), [orders]);

  // ฟังก์ชันติ๊ก / ยกเลิกการติ๊ก
  const toggleCheckDish = useCallback((menuItemId) => {
    setCheckedDishIds((previousSet) => {
      const updatedSet = new Set(previousSet);
      if (updatedSet.has(menuItemId)) {
        updatedSet.delete(menuItemId);
      } else {
        updatedSet.add(menuItemId);
      }
      return updatedSet;
    });
  }, []);

  // ฟังก์ชันล้างที่ติ๊กไว้ทั้งหมด เริ่มต้นใหม่
  const resetAllChecks = useCallback(() => {
    setCheckedDishIds(new Set());
  }, []);

  // ถ้าไม่มีอาหารที่ต้องเตรียม
  if (prepList.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
        <span className="text-4xl block mb-2">✅</span>
        <h3 className="text-base font-bold text-gray-800">ไม่มีรายการที่ต้องเตรียม</h3>
        <p className="text-xs text-gray-400 mt-1">ทุกออเดอร์ในครัวทำเสร็จหมดแล้ว</p>
      </div>
    );
  }

  const finishedCount = checkedDishIds.size;
  const totalDishes = prepList.length;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      {/* ส่วนหัวแสดงสรุป */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50/90 border-b border-gray-200">
        <div>
          <h2 className="text-base font-bold text-gray-900">รวมรายการเตรียมอาหาร</h2>
          <p className="text-xs text-gray-500 mt-0.5">รวมทุกโต๊ะ — แตะเพื่อติ๊กช่วยจำ</p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-700">
            เตรียมแล้ว {finishedCount} จาก {totalDishes} เมนู
          </span>

          {finishedCount > 0 && (
            <button
              onClick={resetAllChecks}
              className="p-1 text-gray-400 hover:text-gray-700 rounded-lg transition-colors"
              title="ล้างที่ติ๊กไว้ทั้งหมด"
            >
              <RotateCcw size={15} />
            </button>
          )}
        </div>
      </div>

      {/* รายการอาหาร */}
      <ul className="divide-y divide-gray-100">
        {prepList.map((dish) => {
          const isDone = checkedDishIds.has(dish.menuItemId);
          return (
            <li key={dish.menuItemId}>
              <div
                onClick={() => toggleCheckDish(dish.menuItemId)}
                className={cn(
                  'flex items-center gap-4 px-5 py-3.5 transition-colors cursor-pointer select-none',
                  isDone ? 'bg-emerald-50/40 hover:bg-emerald-50/70' : 'bg-white hover:bg-gray-50'
                )}
              >
                {/* ช่องติ๊กถูก */}
                <div
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all border',
                    isDone
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'border-gray-300 bg-white'
                  )}
                >
                  {isDone && <Check size={18} strokeWidth={2.5} />}
                </div>

                {/* ชื่ออาหาร */}
                <div className="flex-1 min-w-0">
                  <span
                    className={cn(
                      'text-base font-semibold leading-snug block',
                      isDone ? 'line-through text-gray-400' : 'text-gray-900'
                    )}
                  >
                    {dish.menuItemName}
                  </span>
                  {isDone && (
                    <span className="text-xs text-emerald-600 font-medium inline-flex items-center gap-1 mt-0.5">
                      <RotateCcw size={11} /> แตะซ้ำเพื่อยกเลิก
                    </span>
                  )}
                </div>

                {/* จำนวนจานทั้งหมดที่ต้องเตรียม */}
                <span
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-sm font-bold flex-shrink-0',
                    isDone ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-800'
                  )}
                >
                  × {dish.totalQuantity}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* คำแนะนำด้านล่าง */}
      <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          💡 การติ๊กนี้เป็นบันทึกช่วยจำสำหรับคนหยิบเตรียมในครัว (ไม่มีผลต่อสถานะบิลจริง)
        </p>
      </div>
    </div>
  );
});

export default ConsolidatedPrepList;
