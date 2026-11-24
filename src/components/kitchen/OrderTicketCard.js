"use client";

import React, { useState, useCallback } from "react";
import { CheckCheck, Check, Flame, X } from "lucide-react";
import { AlertMessage, Button, Modal } from "@/components/ui";
import { cn } from "@/lib/utils";
import { updateOrderItemStatus, markAllServed } from "@/app/(kitchen)/kds/actions";

// ─── เกณฑ์เวลารอ (วินาที) ────────────────────────────────────────────────────
const WARNING_SECONDS = 8 * 60;   // 8 นาที: เริ่มเตือน (ขอบส้ม)
const OVERDUE_SECONDS = 15 * 60;  // 15 นาที: เกินเกณฑ์ (ขอบแดง)

// ─── ชื่อสถานีภาษาไทย ──────────────────────────────────────────────────────
const STATION_DISPLAY = {
  fresh: "ของสด",
  beverage: "เครื่องดื่ม",
  grill: "ปิ้งย่าง",
  hot_kitchen: "ครัวร้อน",
};

// ─── ลำดับสถานะเมื่อแตะ (served เป็นสถานะสุดท้าย ย้อนกลับไม่ได้ — FR-049) ──────
const NEXT_STATUS = {
  pending: "cooking",
  cooking: "served",
};

/**
 * จัดรูปแบบเวลาเป็น นาที:วินาที เช่น 05:30
 * @param {number} totalSeconds
 */
function formatWaitTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * หน้าต่างกรอกเหตุผลยกเลิกอาหาร (บังคับเหตุผล — FR-050)
 * @param {{ dishName: string, onConfirm: (reason: string) => void, onClose: () => void }} props
 */
function CancelDishModal({ dishName, onConfirm, onClose }) {
  const [reasonText, setReasonText] = useState("");
  const trimmedReason = reasonText.trim();

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="ยกเลิกรายการอาหาร"
      description={dishName}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            ไม่ยกเลิก
          </Button>
          <Button variant="danger" className="flex-1" disabled={!trimmedReason} onClick={() => onConfirm(trimmedReason)}>
            ยืนยันยกเลิก
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5">
        <span className="font-semibold">
          เหตุผลในการยกเลิก <span className="text-danger">*</span>
        </span>
        <textarea
          className="h-24 resize-none rounded-xl border border-line px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="เช่น ของหมด, ลูกค้าขอยกเลิก..."
          value={reasonText}
          onChange={(event) => setReasonText(event.target.value)}
          autoFocus
        />
      </label>
    </Modal>
  );
}

/**
 * การ์ดออเดอร์ 1 บิล (แบบเดียวกับการ์ดหน้าเรียกพนักงาน: ป้ายโต๊ะ + เวลารอตัวใหญ่)
 * แตะช่องหน้ารายการเพื่อเลื่อนสถานะ: รอทำ → กำลังทำ (ตัดสต็อก) → เสิร์ฟแล้ว
 *
 * @param {Object} props
 * @param {{ order_id: string, table_number: string, items: Array<object> }} props.order
 * @param {number} props.nowTimestamp - เวลาปัจจุบันจากตัวจับเวลากลางของหน้า
 * @param {() => void} props.onStatusChange - เรียกเมื่อสถานะเปลี่ยนสำเร็จ (ให้หน้าโหลดใหม่)
 */
const OrderTicketCard = React.memo(function OrderTicketCard({ order, nowTimestamp, onStatusChange }) {
  // รายการที่กำลังบันทึก (กันกดซ้ำ)
  const [savingItemIds, setSavingItemIds] = useState(new Set());
  // รายการที่กดยกเลิก (แสดงหน้าต่างกรอกเหตุผล)
  const [dishToCancel, setDishToCancel] = useState(null); // { itemId, itemName }
  const [isFinishingAll, setIsFinishingAll] = useState(false);
  // ข้อความ error ล่าสุด (เช่น วัตถุดิบไม่พอตัดสต็อก)
  const [actionError, setActionError] = useState(null);

  // ─── เวลารอนับจากรายการที่สั่งเก่าสุด ──────────────────────────────────────
  const earliestItemTime = order.items.reduce((earliest, item) => {
    const itemTime = new Date(item.created_at).getTime();
    return !earliest || itemTime < earliest ? itemTime : earliest;
  }, null);
  const waitingSeconds = nowTimestamp && earliestItemTime ? Math.max(Math.floor((nowTimestamp - earliestItemTime) / 1000), 0) : 0;
  const isOverdue = waitingSeconds >= OVERDUE_SECONDS;
  const isWarning = !isOverdue && waitingSeconds >= WARNING_SECONDS;

  const activeDishes = order.items.filter((dish) => dish.status !== "cancelled");
  const hasRemainingDishes = activeDishes.some((dish) => dish.status !== "served");

  const markSaving = (itemId, isSaving) =>
    setSavingItemIds((prev) => {
      const next = new Set(prev);
      if (isSaving) next.add(itemId);
      else next.delete(itemId);
      return next;
    });

  // ─── แตะอาหารเพื่อเลื่อนสถานะ (FR-021) ─────────────────────────────────────
  const handleDishTap = useCallback(
    async (dish) => {
      if (savingItemIds.has(dish.id)) return;
      const nextStatus = NEXT_STATUS[dish.status];
      if (!nextStatus) return;

      setActionError(null);
      markSaving(dish.id, true);
      const result = await updateOrderItemStatus(dish.id, nextStatus, null);
      markSaving(dish.id, false);

      if (result.success) onStatusChange?.();
      else setActionError(`${dish.menu_item_name}: ${result.error}`);
    },
    [savingItemIds, onStatusChange]
  );

  // ─── ยืนยันยกเลิกอาหาร ─────────────────────────────────────────────────────
  const handleCancelConfirm = useCallback(
    async (reason) => {
      if (!dishToCancel) return;
      const { itemId, itemName } = dishToCancel;

      setActionError(null);
      setDishToCancel(null);
      markSaving(itemId, true);
      const result = await updateOrderItemStatus(itemId, "cancelled", reason);
      markSaving(itemId, false);

      if (result.success) onStatusChange?.();
      else setActionError(`${itemName}: ${result.error}`);
    },
    [dishToCancel, onStatusChange]
  );

  // ─── ทำเสร็จทั้งหมดในบิลนี้ ─────────────────────────────────────────────────
  const handleCompleteAllDishes = useCallback(async () => {
    if (isFinishingAll) return;
    setActionError(null);
    setIsFinishingAll(true);
    const result = await markAllServed(order.order_id);
    setIsFinishingAll(false);

    if (result.success) onStatusChange?.();
    else setActionError(result.error);
  }, [isFinishingAll, order.order_id, onStatusChange]);

  const tableLabel = order.table_number || "-";

  return (
    <>
      {dishToCancel && (
        <CancelDishModal
          dishName={dishToCancel.itemName}
          onConfirm={handleCancelConfirm}
          onClose={() => setDishToCancel(null)}
        />
      )}

      <article
        className={cn(
          "flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm",
          isOverdue && "ring-2 ring-danger",
          isWarning && "ring-2 ring-amber-400"
        )}
      >
        {/* ─── หัวการ์ด: ป้ายโต๊ะ + เลขบิล + เวลารอ ─── */}
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex h-16 min-w-16 flex-col items-center justify-center rounded-2xl px-2",
              isOverdue ? "bg-danger-soft text-danger" : "bg-primary text-white"
            )}
          >
            <span className="text-xs opacity-80">โต๊ะ</span>
            <span className="text-2xl font-bold leading-none">{tableLabel}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">{activeDishes.length} รายการ</p>
            <p className="font-mono text-sm text-ink-muted">#{order.order_id?.toString().slice(-4)}</p>
          </div>
          <div className="text-right">
            <p className={cn("text-2xl font-bold tabular-nums", isOverdue ? "text-danger" : "text-ink")}>
              {formatWaitTime(waitingSeconds)}
            </p>
            <p className="text-xs text-ink-muted">{isOverdue ? "เกินเกณฑ์" : "รอมาแล้ว"}</p>
          </div>
        </div>

        {/* ─── รายการอาหาร ─── */}
        <ul className="flex flex-col gap-1.5">
          {activeDishes.map((dish) => {
            const isServed = dish.status === "served";
            const isCooking = dish.status === "cooking";
            const isSaving = savingItemIds.has(dish.id);
            const canTap = !isServed && !isSaving;

            return (
              <li
                key={dish.id}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2",
                  isServed ? "bg-emerald-50" : isCooking ? "bg-primary/5" : "bg-surface"
                )}
              >
                <button
                  type="button"
                  onClick={() => canTap && handleDishTap(dish)}
                  disabled={!canTap}
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl border-2 transition-colors",
                    isServed && "border-emerald-800 bg-emerald-800 text-white",
                    isCooking && "border-primary bg-primary text-white hover:bg-primary-deep",
                    dish.status === "pending" && "border-line bg-white hover:border-primary",
                    isSaving && "cursor-wait opacity-60"
                  )}
                  aria-label={
                    dish.status === "pending"
                      ? `เริ่มทำ ${dish.menu_item_name}`
                      : isCooking
                        ? `เสิร์ฟ ${dish.menu_item_name}`
                        : `${dish.menu_item_name} เสิร์ฟแล้ว`
                  }
                >
                  {isSaving ? (
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                  ) : isServed ? (
                    <Check className="size-5" aria-hidden />
                  ) : isCooking ? (
                    <Flame className="size-5" aria-hidden />
                  ) : null}
                </button>

                <div className="min-w-0 flex-1 leading-tight">
                  <p className={cn("font-semibold", isServed && "text-ink-muted line-through")}>{dish.menu_item_name}</p>
                  {dish.options?.length > 0 && (
                    <p className="text-sm font-semibold text-ink">{dish.options.join(", ")}</p>
                  )}
                  <p className={cn("text-xs", isCooking ? "font-semibold text-primary" : "text-ink-muted")}>
                    {dish.status === "pending" && "รอทำ — แตะเพื่อเริ่มทำ"}
                    {isCooking && "กำลังทำ — แตะเมื่อเสิร์ฟ"}
                    {isServed && "เสิร์ฟแล้ว"}
                    {STATION_DISPLAY[dish.station] && ` · ${STATION_DISPLAY[dish.station]}`}
                  </p>
                </div>

                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums",
                    isServed ? "bg-white text-ink-muted" : "bg-white text-ink shadow-sm"
                  )}
                >
                  ×{dish.quantity}
                </span>

                {!isServed && (
                  <button
                    type="button"
                    onClick={() => setDishToCancel({ itemId: dish.id, itemName: dish.menu_item_name })}
                    disabled={isSaving}
                    className="shrink-0 rounded-full p-1.5 text-ink-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                    aria-label={`ยกเลิก ${dish.menu_item_name}`}
                    title="ยกเลิกรายการนี้"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <AlertMessage>{actionError}</AlertMessage>

        {/* ─── ทำเสร็จทั้งหมดในบิลนี้ (FR-021 Batch Action) ─── */}
        {hasRemainingDishes && (
          <Button variant="success" icon={CheckCheck} isLoading={isFinishingAll} onClick={handleCompleteAllDishes}>
            ทำเสร็จทั้งหมดในบิลนี้
          </Button>
        )}
      </article>
    </>
  );
});

export default OrderTicketCard;
