"use client";

import React, { useState, useCallback } from "react";
import { Clock, CheckCheck, X, Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  updateOrderItemStatus,
  markAllServed,
} from "@/app/(kitchen)/kds/actions";

// ─── ฟังก์ชันช่วยคำนวณเวลา ───────────────────────────────────────────────

/**
 * คำนวณว่ารอนานกี่วินาทีแล้ว นับตั้งแต่ลูกค้าสั่งเข้ามา
 */
function getWaitingSeconds(orderTime, currentTime) {
  if (!orderTime || !currentTime) return 0;
  const timeDifferenceMs = currentTime - new Date(orderTime).getTime();
  return Math.floor(timeDifferenceMs / 1000);
}

/**
 * จัดรูปแบบเวลาให้ออกมาเป็น นาที:วินาที (เช่น 05:30)
 */
function formatTimeText(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const minutesText = String(minutes).padStart(2, '0');
  const secondsText = String(seconds).padStart(2, '0');
  return `${minutesText}:${secondsText}`;
}

/**
 * เลือกสีแจ้งเตือนตามระยะเวลาที่รอนาน
 * - น้อยกว่า 10 นาที: สีเทาปกติ
 * - 10 - 15 นาที: สีเหลืองเตือน
 * - มากกว่า 15 นาที: สีแดงเตือนด่วน
 */
function getTimerColorStyle(seconds) {
  if (seconds < 600) {
    return 'bg-gray-100 text-gray-700 border-gray-200';
  }
  if (seconds < 900) {
    return 'bg-amber-50 text-amber-800 border-amber-200';
  }
  return 'bg-red-50 text-red-700 border-red-200 animate-pulse font-bold';
}

// ─── หน้าต่างกรอกเหตุผลเวลายกเลิกอาหาร ─────────────────────────────────────

function CancelModal({ dishName, onConfirmCancel, onCloseModal }) {
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleConfirm = async () => {
    if (!cancelReasonText.trim()) return;
    setIsSaving(true);
    await onConfirmCancel(cancelReasonText.trim());
    setIsSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 w-full max-w-sm">
        <h3 className="text-base font-bold text-gray-900 mb-1">
          ยกเลิกรายการอาหาร
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          รายการ: <span className="font-semibold text-gray-900">{dishName}</span>
        </p>

        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          เหตุผลในการยกเลิก <span className="text-red-500">*</span>
        </label>
        <textarea
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
          rows={3}
          placeholder="เช่น วัตถุดิบหมด, ลูกค้าขอยกเลิก..."
          value={cancelReasonText}
          onChange={(e) => setCancelReasonText(e.target.value)}
          autoFocus
        />

        <div className="flex gap-2 mt-4">
          <button
            onClick={onCloseModal}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            ย้อนกลับ
          </button>
          <button
            onClick={handleConfirm}
            disabled={!cancelReasonText.trim() || isSaving}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50 hover:bg-red-700 transition-colors"
          >
            {isSaving ? 'กำลังดำเนินการ...' : 'ยืนยันยกเลิก'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── การ์ดออเดอร์ของแต่ละโต๊ะ ─────────────────────────────────────────────

const OrderTicketCard = React.memo(function OrderTicketCard({
  order,
  nowTimestamp,
  onStatusChange,
}) {
  // เก็บรายการอาหารที่กำลังจะกดยกเลิก
  const [dishToCancel, setDishToCancel] = useState(null);

  // เก็บรายการที่กำลังรอเซฟข้อมูล เพื่อป้องกันการกดซ้ำรัวๆ
  const [savingItemIds, setSavingItemIds] = useState(new Set());
  const [isFinishingAll, setIsFinishingAll] = useState(false);

  // หาจานแรกที่ยังทำไม่เสร็จ เพื่อเอาเวลามานับถอยหลัง
  const unfinishedDish = order.items.find((item) => item.status !== 'served' && item.status !== 'cancelled');
  const waitingSeconds = unfinishedDish ? getWaitingSeconds(unfinishedDish.created_at, nowTimestamp) : 0;
  const timerStyleClass = getTimerColorStyle(waitingSeconds);

  // คำนวณจำนวนจานที่เสร็จแล้วเทียบกับทั้งหมด
  const completedDishesCount = order.items.filter((item) => item.status === 'served').length;
  const totalDishesCount = order.items.filter((item) => item.status !== 'cancelled').length;
  const hasRemainingDishes = order.items.some((item) => item.status !== 'served' && item.status !== 'cancelled');

  /**
   * แตะที่แถวอาหารเพื่อสลับสถานะ:
   * - ถ้ายังไม่เสร็จ ➔ แตะทีเดียว กลายเป็น "เสิร์ฟแล้ว" (served)
   * - ถ้าเสิร์ฟแล้ว ➔ แตะซ้ำเพื่อ "ย้อนกลับ" เป็นรอทำ (pending)
   */
  const toggleDishDone = useCallback(async (dish) => {
    // ถ้าอาหารยกเลิกไปแล้ว หรือกำลังบันทึกอยู่ ให้ข้ามไป
    if (dish.status === 'cancelled' || savingItemIds.has(dish.id)) return;

    const nextStatus = dish.status === 'served' ? 'pending' : 'served';

    // ล็อกไอดีนี้ไว้ไม่ให้กดซ้ำ
    setSavingItemIds((prev) => new Set([...prev, dish.id]));

    // ส่งไปอัปเดตที่ฐานข้อมูล
    await updateOrderItemStatus(dish.id, nextStatus);
    onStatusChange?.();

    // ปลดล็อกให้กดได้ใหม่
    setSavingItemIds((prev) => {
      const next = new Set(prev);
      next.delete(dish.id);
      return next;
    });
  }, [savingItemIds, onStatusChange]);

  /**
   * ทำเสร็จทั้งหมดทุกจานในโต๊ะนี้
   */
  const handleCompleteAllDishes = useCallback(async () => {
    if (isFinishingAll) return;
    setIsFinishingAll(true);
    await markAllServed(order.order_id);
    onStatusChange?.();
    setIsFinishingAll(false);
  }, [isFinishingAll, order.order_id, onStatusChange]);

  /**
   * ยืนยันการยกเลิกอาหารจานนั้น
   */
  const handleConfirmCancelDish = useCallback(async (reason) => {
    if (!dishToCancel) return;
    await updateOrderItemStatus(dishToCancel.itemId, 'cancelled', reason);
    setDishToCancel(null);
    onStatusChange?.();
  }, [dishToCancel, onStatusChange]);

  return (
    <>
      {/* หน้าต่างกรอกเหตุผลยกเลิก */}
      {dishToCancel && (
        <CancelModal
          dishName={dishToCancel.itemName}
          onConfirmCancel={handleConfirmCancelDish}
          onCloseModal={() => setDishToCancel(null)}
        />
      )}

      {/* การ์ดออเดอร์ของโต๊ะ */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        {/* ส่วนหัวของการ์ด: แสดงเลขโต๊ะ และ เวลารอ */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50/90 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-semibold text-gray-500 uppercase">
                โต๊ะ
              </span>
              <span className="text-2xl font-black text-gray-900">
                {order.table_number}
              </span>
            </div>

            {/* จำนวนจานที่เสร็จ */}
            <span className={cn(
              'text-xs font-semibold px-2.5 py-0.5 rounded-full border',
              completedDishesCount === totalDishesCount
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-white text-gray-700 border-gray-200'
            )}>
              {completedDishesCount}/{totalDishesCount} เสร็จ
            </span>
          </div>

          {/* เวลาที่รอ */}
          {unfinishedDish ? (
            <div className={cn('flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border', timerStyleClass)}>
              <Clock size={13} />
              <span>{formatTimeText(waitingSeconds)}</span>
            </div>
          ) : (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1">
              <Check size={14} strokeWidth={2.5} />
              เสิร์ฟครบแล้ว
            </span>
          )}
        </div>

        {/* รายการอาหารในบิล (แตะได้ทั้งแถว 1-Tap) */}
        <div className="divide-y divide-gray-100">
          {order.items.map((dish) => {
            const isCancelled = dish.status === 'cancelled';
            const isServed = dish.status === 'served';
            const isSavingThisDish = savingItemIds.has(dish.id);

            return (
              <div
                key={dish.id}
                onClick={() => !isCancelled && toggleDishDone(dish)}
                className={cn(
                  "flex items-center gap-3.5 px-5 py-3.5 transition-colors select-none",
                  !isCancelled &&
                    "cursor-pointer hover:bg-gray-50 active:bg-gray-100/70",
                  isServed && "bg-emerald-50/40 hover:bg-emerald-50/70",
                  isCancelled && "opacity-40 cursor-not-allowed bg-gray-50",
                )}
                title={
                  isServed
                    ? "แตะซ้ำเพื่อย้อนกลับเป็นรอทำ"
                    : "แตะเพื่อเปลี่ยนเป็นเสร็จทันที"
                }
              >
                {/* กล่องติ๊กถูก */}
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all border",
                    isServed
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : "border-gray-300 bg-white hover:border-gray-400",
                    isCancelled && "border-gray-200 bg-gray-100",
                  )}
                >
                  {isServed && <Check size={18} strokeWidth={2.5} />}
                  {isCancelled && <X size={14} className="text-gray-400" />}
                </div>

                {/* ชื่ออาหาร */}
                <div className="flex-1 min-w-0">
                  <span
                    className={cn(
                      "text-base font-semibold leading-snug block",
                      isServed ? "line-through text-gray-400" : "text-gray-900",
                      isCancelled && "line-through text-gray-400",
                    )}
                  >
                    {dish.menu_item_name}
                  </span>

                  {isServed && (
                    <span className="text-xs text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
                      <RotateCcw size={11} /> แตะซ้ำเพื่อย้อนกลับ
                    </span>
                  )}

                  {isCancelled && dish.cancel_reason && (
                    <span className="text-xs text-red-500 mt-0.5 block">ยกเลิก: {dish.cancel_reason}</span>
                  )}
                </div>

                {/* จำนวนจาน */}
                <span
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-sm font-bold flex-shrink-0",
                    isServed
                      ? "bg-gray-100 text-gray-400"
                      : "bg-gray-100 text-gray-800",
                  )}
                >
                  ×{dish.quantity}
                </span>

                {/* ปุ่มยกเลิกอาหาร */}
                {!isServed && !isCancelled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation(); // ไม่ให้ไปทริกเกอร์การแตะทั้งแถว
                      setDishToCancel({ itemId: dish.id, itemName: dish.menu_item_name });
                    }}
                    disabled={isSavingThisDish}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                    title="ยกเลิกรายการนี้"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* ปุ่มทำเสร็จทั้งโต๊ะ */}
        {hasRemainingDishes && (
          <div className="p-3 bg-gray-50 border-t border-gray-100">
            <button
              onClick={handleCompleteAllDishes}
              disabled={isFinishingAll}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 active:scale-[0.99] disabled:opacity-50 transition-all shadow-sm"
            >
              <CheckCheck size={18} />
              <span>{isFinishingAll ? 'กำลังอัปเดต...' : 'ทำเสร็จทั้งหมดในโต๊ะนี้'}</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
});

export default OrderTicketCard;
