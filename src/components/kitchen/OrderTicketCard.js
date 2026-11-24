"use client";

import React, { useState, useCallback } from "react";
import { Clock, CheckCheck, X, Check, Flame, ChevronDown, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  updateOrderItemStatus,
  markAllServed,
} from "@/app/(kitchen)/kds/actions";

// ─── ฟังก์ชันช่วยคำนวณเวลา ────────────────────────────────────────────────────

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
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * เลือกสีการ์ดตามระยะเวลาที่รอ
 * - น้อยกว่า 8 นาที: สีขาว (ปกติ)
 * - 8-15 นาที: สีส้ม (เตือน)
 * - มากกว่า 15 นาที: สีแดง (เกินเกณฑ์ด่วน)
 */
function getCardUrgencyStyle(seconds) {
  if (seconds < 480) {
    // น้อยกว่า 8 นาที — ปกติ
    return {
      border: 'border-gray-200',
      header: 'bg-gray-50',
      headerText: 'text-gray-800',
      timerBg: 'bg-gray-100 text-gray-700',
      urgencyLabel: null,
    };
  }
  if (seconds < 900) {
    // 8-15 นาที — เตือน
    return {
      border: 'border-orange-400',
      header: 'bg-orange-500',
      headerText: 'text-white',
      timerBg: 'bg-orange-100 text-orange-800',
      urgencyLabel: null,
    };
  }
  // มากกว่า 15 นาที — ด่วนมาก
  return {
    border: 'border-red-700',
    header: 'bg-[#7F1D1D]',
    headerText: 'text-white',
    timerBg: 'bg-red-100 text-red-800 animate-pulse font-bold',
    urgencyLabel: '⚠ เกินเกณฑ์',
  };
}

// ─── หน้าต่างกรอกเหตุผลยกเลิกอาหาร ──────────────────────────────────────────

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-full max-w-sm">
        <h3 className="text-base font-bold text-gray-900 mb-1">ยกเลิกรายการอาหาร</h3>
        <p className="text-sm text-gray-600 mb-4">
          รายการ: <span className="font-semibold text-gray-900">{dishName}</span>
        </p>

        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          เหตุผลในการยกเลิก <span className="text-red-500">*</span>
        </label>
        <textarea
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400 h-24"
          placeholder="เช่น ของหมด, ลูกค้าขอยกเลิก..."
          value={cancelReasonText}
          onChange={(e) => setCancelReasonText(e.target.value)}
          autoFocus
        />

        <div className="flex gap-2 mt-4">
          <button
            onClick={onCloseModal}
            disabled={isSaving}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleConfirm}
            disabled={!cancelReasonText.trim() || isSaving}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'กำลังบันทึก...' : 'ยืนยันยกเลิก'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ชื่อสถานีภาษาไทย ──────────────────────────────────────────────────────
const STATION_DISPLAY = {
  fresh: 'สายไลน์ 1',
  beverage: 'สายไลน์ 2',
  grill: 'สายไลน์ 3',
  hot_kitchen: 'สายไลน์ 4',
};

// ─── ลำดับสถานะเมื่อแตะ (served เป็นสถานะสุดท้าย) ─────────────────────────
const NEXT_STATUS = {
  pending: 'cooking',
  cooking: 'served',
};

// ─── การ์ดออเดอร์แต่ละโต๊ะ ───────────────────────────────────────────────────

/**
 * OrderTicketCard — การ์ดแสดงออเดอร์แต่ละโต๊ะแบบ KURO SHABU
 *
 * @param {Object} order - ข้อมูลออเดอร์ { order_id, table_number, items }
 * @param {number} nowTimestamp - timestamp ปัจจุบัน (อัปเดตทุก 1 วินาที)
 * @param {Function} onStatusChange - callback เมื่อสถานะอาหารเปลี่ยน
 */
const OrderTicketCard = React.memo(function OrderTicketCard({
  order,
  nowTimestamp,
  onStatusChange,
}) {
  // ─── State ───────────────────────────────────────────────────────────────
  // รายการที่กำลังบันทึก (Optimistic UI)
  const [savingItemIds, setSavingItemIds] = useState(new Set());
  // รายการที่กดยกเลิก (แสดง Modal)
  const [dishToCancel, setDishToCancel] = useState(null); // { itemId, itemName }
  // กำลังกด "ทำเสร็จทั้งหมด"
  const [isFinishingAll, setIsFinishingAll] = useState(false);
  // เปิด/ปิดรายการอาหาร
  const [isExpanded, setIsExpanded] = useState(true);
  // ข้อความ error ล่าสุด (เช่น วัตถุดิบไม่พอตัดสต็อก)
  const [actionError, setActionError] = useState(null);

  // ─── คำนวณเวลา ───────────────────────────────────────────────────────────
  // หาเวลาเก่าสุดของออเดอร์นี้ (item แรกสุดที่ส่งเข้ามา)
  const earliestItemTime = order.items.reduce((earliest, item) => {
    const itemTime = new Date(item.created_at).getTime();
    return !earliest || itemTime < earliest ? itemTime : earliest;
  }, null);

  const waitingSeconds = getWaitingSeconds(earliestItemTime, nowTimestamp);
  const timeText = formatTimeText(waitingSeconds);
  const urgencyStyle = getCardUrgencyStyle(waitingSeconds);

  // ─── รายการอาหารที่ยังไม่เสร็จ ──────────────────────────────────────────
  const activeDishes = order.items.filter(
    (d) => d.status !== 'cancelled'
  );
  const remainingDishes = activeDishes.filter(
    (d) => d.status !== 'served'
  );
  const hasRemainingDishes = remainingDishes.length > 0;

  // ─── Handler: แตะอาหารเพื่อเลื่อนสถานะ (FR-021) ──────────────────────────
  // pending → cooking (ตัดสต็อก BOM) → served (สถานะสุดท้าย ย้อนกลับไม่ได้)
  const handleDishTap = useCallback(async (dish) => {
    if (savingItemIds.has(dish.id)) return; // กำลังบันทึกอยู่ ห้ามกดซ้ำ

    const nextStatus = NEXT_STATUS[dish.status];
    if (!nextStatus) return;

    setActionError(null);
    setSavingItemIds((prev) => new Set(prev).add(dish.id));

    const result = await updateOrderItemStatus(dish.id, nextStatus, null);

    setSavingItemIds((prev) => {
      const next = new Set(prev);
      next.delete(dish.id);
      return next;
    });

    if (result.success) {
      onStatusChange?.();
    } else {
      setActionError(`${dish.menu_item_name}: ${result.error}`);
    }
  }, [savingItemIds, onStatusChange]);

  // ─── Handler: ยืนยันยกเลิกอาหาร ─────────────────────────────────────────
  const handleCancelConfirm = useCallback(async (reason) => {
    if (!dishToCancel) return;

    const { itemId, itemName } = dishToCancel;
    setActionError(null);
    setSavingItemIds((prev) => new Set(prev).add(itemId));
    setDishToCancel(null);

    const result = await updateOrderItemStatus(itemId, 'cancelled', reason);

    setSavingItemIds((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });

    if (result.success) {
      onStatusChange?.();
    } else {
      setActionError(`${itemName}: ${result.error}`);
    }
  }, [dishToCancel, onStatusChange]);

  // ─── Handler: ทำเสร็จทั้งหมดในบิลนี้ ─────────────────────────────────────
  const handleCompleteAllDishes = useCallback(async () => {
    if (isFinishingAll) return;
    setActionError(null);
    setIsFinishingAll(true);

    const result = await markAllServed(order.order_id);

    setIsFinishingAll(false);
    if (result.success) {
      onStatusChange?.();
    } else {
      setActionError(result.error);
    }
  }, [isFinishingAll, order.order_id, onStatusChange]);

  // ─── หัวการ์ด ─────────────────────────────────────────────────────────────
  const tableLabel = order.table_number || 'ไม่ระบุโต๊ะ';
  const isMultiTable = tableLabel.includes('+');

  return (
    <>
      {/* Modal ยกเลิกอาหาร */}
      {dishToCancel && (
        <CancelModal
          dishName={dishToCancel.itemName}
          onConfirmCancel={handleCancelConfirm}
          onCloseModal={() => setDishToCancel(null)}
        />
      )}

      {/* การ์ดออเดอร์ */}
      <div
        className={cn(
          'bg-white rounded-2xl border-2 overflow-hidden shadow-sm transition-all',
          urgencyStyle.border
        )}
      >
        {/* ─── หัวการ์ด: โต๊ะ + เวลา + สถานะ ─────────────────────────────── */}
        <div
          className={cn(
            'flex items-center justify-between px-4 py-3 cursor-pointer',
            urgencyStyle.header
          )}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          {/* ซ้าย: หมายเลขโต๊ะ */}
          <div className="flex items-center gap-2">
            <span className={cn('text-lg font-black', urgencyStyle.headerText)}>
              {isMultiTable ? '🔗 ' : ''}โต๊ะ {tableLabel}
            </span>
            {/* badge เลขออเดอร์ */}
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-mono',
              urgencyStyle.header === 'bg-gray-50'
                ? 'bg-gray-200 text-gray-600'
                : 'bg-black/20 text-white/90'
            )}>
              #{order.order_id?.toString().slice(-4)}
            </span>
            {urgencyStyle.urgencyLabel && (
              <span className="flex items-center gap-1 text-xs font-bold text-yellow-200">
                <AlertTriangle size={12} />
                {urgencyStyle.urgencyLabel}
              </span>
            )}
          </div>

          {/* ขวา: นาฬิกาจับเวลา + ลูกศร */}
          <div className="flex items-center gap-2">
            <span className={cn(
              'flex items-center gap-1.5 text-sm font-black px-3 py-1 rounded-full border',
              urgencyStyle.timerBg
            )}>
              <Clock size={13} />
              {timeText} น.
            </span>
            <ChevronDown
              size={16}
              className={cn(
                'transition-transform',
                urgencyStyle.headerText,
                isExpanded ? 'rotate-180' : ''
              )}
            />
          </div>
        </div>

        {/* ─── รายการอาหาร ───────────────────────────────────────────────── */}
        {isExpanded && (
          <div className="divide-y divide-gray-100">
            {activeDishes.map((dish) => {
              const isServed = dish.status === 'served';
              const isCooking = dish.status === 'cooking';
              const isCancelled = dish.status === 'cancelled';
              const isSavingThisDish = savingItemIds.has(dish.id);
              const canTap = !isServed && !isCancelled && !isSavingThisDish;
              const stationLabel = STATION_DISPLAY[dish.station] ?? dish.station;

              return (
                <div
                  key={dish.id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 transition-colors',
                    isServed && 'bg-emerald-50/60',
                    isCancelled && 'bg-gray-50/60 opacity-60',
                    !isServed && !isCancelled && 'hover:bg-gray-50'
                  )}
                >
                  {/* ─── กล่องติ๊กถูก ─────────────────────────────────── */}
                  <button
                    onClick={() => canTap && handleDishTap(dish)}
                    disabled={!canTap}
                    className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all border-2',
                      isServed && 'bg-emerald-600 border-emerald-600 text-white cursor-default',
                      isCooking && 'bg-orange-500 border-orange-500 text-white hover:bg-orange-600',
                      dish.status === 'pending' && 'border-gray-300 bg-white hover:border-[#7F1D1D] hover:bg-red-50',
                      isCancelled && 'border-gray-200 bg-gray-100 cursor-not-allowed',
                      isSavingThisDish && 'opacity-60 cursor-wait'
                    )}
                    title={
                      dish.status === 'pending'
                        ? 'แตะเพื่อเริ่มทำ (ตัดสต็อก)'
                        : isCooking
                          ? 'แตะเมื่อเสิร์ฟแล้ว'
                          : undefined
                    }
                  >
                    {isSavingThisDish ? (
                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    ) : isServed ? (
                      <Check size={18} strokeWidth={2.5} />
                    ) : isCooking ? (
                      <Flame size={16} />
                    ) : isCancelled ? (
                      <X size={14} className="text-gray-400" />
                    ) : null}
                  </button>

                  {/* ─── ชื่ออาหาร ───────────────────────────────────── */}
                  <div className="flex-1 min-w-0">
                    {/* ชื่อภาษาไทย */}
                    <span className={cn(
                      'text-sm font-bold leading-snug block',
                      isServed ? 'line-through text-gray-400' : 'text-gray-900',
                      isCancelled && 'line-through text-gray-400'
                    )}>
                      {dish.menu_item_name}
                    </span>

                    {/* ป้ายสถานะ */}
                    {dish.status === 'pending' && (
                      <span className="text-xs text-gray-400 font-medium block mt-0.5">
                        รอทำ — แตะเพื่อเริ่มทำ
                      </span>
                    )}
                    {isCooking && (
                      <span className="text-xs text-orange-600 font-semibold block mt-0.5">
                        กำลังทำ — แตะเมื่อเสิร์ฟ
                      </span>
                    )}
                    {isServed && (
                      <span className="text-xs text-emerald-600 font-medium block mt-0.5">
                        เสิร์ฟแล้ว
                      </span>
                    )}

                    {/* เหตุผลยกเลิก */}
                    {isCancelled && dish.cancel_reason && (
                      <span className="text-xs text-red-500 mt-0.5 block">
                        ยกเลิก: {dish.cancel_reason}
                      </span>
                    )}
                  </div>

                  {/* ─── สายไลน์ ─────────────────────────────────────── */}
                  <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
                    {stationLabel}
                  </span>

                  {/* ─── จำนวนจาน (badge แดง) ────────────────────────── */}
                  <span className={cn(
                    'px-2.5 py-1 rounded-full text-sm font-black flex-shrink-0',
                    isServed || isCancelled
                      ? 'bg-gray-100 text-gray-400'
                      : 'bg-[#7F1D1D] text-white'
                  )}>
                    x {dish.quantity}
                  </span>

                  {/* ─── ปุ่มยกเลิกรายการ ────────────────────────────── */}
                  {!isServed && !isCancelled && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDishToCancel({ itemId: dish.id, itemName: dish.menu_item_name });
                      }}
                      disabled={isSavingThisDish}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                      title="ยกเลิกรายการนี้"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ─── ข้อความ error (เช่น วัตถุดิบไม่พอ) ─────────────────────────── */}
        {actionError && (
          <div className="px-4 py-2.5 bg-red-50 border-t border-red-200 flex items-start justify-between gap-2">
            <span className="text-xs text-red-700 font-semibold flex items-start gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
              {actionError}
            </span>
            <button
              onClick={() => setActionError(null)}
              className="text-red-400 hover:text-red-700 flex-shrink-0"
              title="ปิด"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* ─── ปุ่มด้านล่างการ์ด ─────────────────────────────────────────── */}
        {isExpanded && hasRemainingDishes && (
          <div className="p-3 bg-gray-50 border-t border-gray-100 flex gap-2">
            {/* ปุ่มเสิร์ฟแล้ว (Bump) ทั้งหมด */}
            <button
              onClick={handleCompleteAllDishes}
              disabled={isFinishingAll}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50 transition-all shadow-sm"
            >
              <CheckCheck size={16} />
              <span>{isFinishingAll ? 'กำลังอัปเดต...' : 'ทำเสร็จทั้งหมดในบิลนี้'}</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
});

export default OrderTicketCard;
