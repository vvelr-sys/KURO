"use client";

import React, { useState, useCallback } from "react";
import { CheckCheck, Check, ChefHat, Clock, Flame, X } from "lucide-react";
import { AlertMessage, Button, MenuImage, Modal } from "@/components/ui";
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

// ลำดับแสดงรายการในการ์ด: กำลังทำ → รอทำ → เสิร์ฟแล้ว
const DISH_SORT_ORDER = { cooking: 0, pending: 1, served: 2 };

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
    // ส่งเฉพาะรายการที่ค้างอยู่บนการ์ดนี้ (ตอนกรองสถานี = เฉพาะของสถานีนั้น)
    const pendingOrCookingIds = activeDishes
      .filter((dish) => dish.status === "pending" || dish.status === "cooking")
      .map((dish) => dish.id);
    const result = await markAllServed(order.order_id, pendingOrCookingIds);
    setIsFinishingAll(false);

    if (result.success) onStatusChange?.();
    else setActionError(result.error);
  }, [isFinishingAll, order.order_id, activeDishes, onStatusChange]);

  const tableLabel = order.table_number || "-";
  const servedCount = activeDishes.filter((dish) => dish.status === "served").length;
  const progressPercent = activeDishes.length > 0 ? Math.round((servedCount / activeDishes.length) * 100) : 0;
  const orderedAtText = earliestItemTime
    ? new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(earliestItemTime)
    : "-";

  // เรียงรายการ: กำลังทำ → รอทำ → เสิร์ฟแล้ว (ของที่ต้องทำอยู่บนสุด)
  const sortedDishes = [...activeDishes].sort((first, second) => DISH_SORT_ORDER[first.status] - DISH_SORT_ORDER[second.status]);

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
          "flex flex-col overflow-hidden rounded-3xl bg-white shadow-sm",
          isOverdue && "ring-2 ring-danger",
          isWarning && "ring-2 ring-amber-400"
        )}
      >
        {/* ─── หัวการ์ด: แถบสีตามเวลารอ + เลขโต๊ะ + เวลา ─── */}
        <header
          className={cn(
            "flex items-center gap-3 px-4 py-3",
            isOverdue ? "bg-danger text-white" : isWarning ? "bg-amber-400 text-ink" : "bg-primary text-white"
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold opacity-80">โต๊ะ</p>
            <p className="truncate text-3xl font-bold leading-none">{tableLabel}</p>
          </div>
          <div className="text-right">
            <p className="flex items-center justify-end gap-1 text-2xl font-bold tabular-nums leading-none">
              <Clock className="size-5" aria-hidden />
              {formatWaitTime(waitingSeconds)}
            </p>
            <p className="mt-1 text-xs font-semibold opacity-80">
              สั่ง {orderedAtText} น. · #{order.order_id?.toString().slice(-4)}
            </p>
          </div>
        </header>

        {/* ─── ความคืบหน้า ─── */}
        <div className="flex items-center gap-3 px-4 pt-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface" aria-hidden>
            <div className="h-full rounded-full bg-emerald-700 transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
          <span className="text-sm font-semibold tabular-nums text-ink-muted">
            เสร็จ {servedCount}/{activeDishes.length}
          </span>
        </div>

        {/* ─── รายการอาหาร ─── */}
        <ul className="flex flex-col gap-2 p-3">
          {sortedDishes.map((dish) => {
            const isServed = dish.status === "served";
            const isCooking = dish.status === "cooking";
            const isSaving = savingItemIds.has(dish.id);

            return (
              <li
                key={dish.id}
                className={cn(
                  "flex items-center gap-3 rounded-2xl p-2",
                  isServed ? "bg-emerald-50" : isCooking ? "bg-primary/5 ring-1 ring-primary/20" : "bg-surface"
                )}
              >
                <MenuImage src={dish.image_url} className="size-14" isDimmed={isServed} />

                <div className="min-w-0 flex-1 leading-tight">
                  <p className={cn("truncate text-lg font-bold", isServed && "text-ink-muted line-through")}>{dish.menu_item_name}</p>
                  {/* ตัวเลือกที่ลูกค้าเลือก (เช่น เผ็ดน้อย, น้ำจิ้มงา) — เด่นให้ครัวไม่พลาด */}
                  {dish.options?.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {dish.options.map((optionName) => (
                        <span
                          key={optionName}
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-xs font-bold",
                            isServed ? "bg-line text-ink-muted" : "bg-amber-100 text-amber-900"
                          )}
                        >
                          {optionName}
                        </span>
                      ))}
                    </p>
                  )}
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 font-semibold",
                        isServed ? "bg-emerald-100 text-emerald-800" : isCooking ? "bg-primary text-white" : "bg-white text-ink-muted"
                      )}
                    >
                      {isServed ? "เสิร์ฟแล้ว" : isCooking ? "กำลังทำ" : "รอทำ"}
                    </span>
                    {STATION_DISPLAY[dish.station] && <span className="text-ink-muted">{STATION_DISPLAY[dish.station]}</span>}
                  </p>
                </div>

                <span className={cn("shrink-0 text-2xl font-bold tabular-nums", isServed && "text-ink-muted")}>×{dish.quantity}</span>

                {/* ปุ่มเลื่อนสถานะ: รอทำ → เริ่มทำ (ตัดสต็อก) → เสิร์ฟ (ย้อนกลับไม่ได้ — FR-049) */}
                {isServed ? (
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-800 text-white" aria-label="เสิร์ฟแล้ว">
                    <Check className="size-6" aria-hidden />
                  </span>
                ) : (
                  <Button
                    variant={isCooking ? "success" : "primary"}
                    icon={isCooking ? Check : Flame}
                    isLoading={isSaving}
                    onClick={() => handleDishTap(dish)}
                    className="shrink-0"
                    aria-label={isCooking ? `เสิร์ฟ ${dish.menu_item_name}` : `เริ่มทำ ${dish.menu_item_name}`}
                  >
                    {isCooking ? "เสิร์ฟ" : "เริ่มทำ"}
                  </Button>
                )}

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

        <div className="flex flex-col gap-2 px-3 pb-3">
          <AlertMessage>{actionError}</AlertMessage>

          {/* ─── ทำเสร็จทั้งหมดในบิลนี้ (FR-021 Batch Action) ─── */}
          {hasRemainingDishes ? (
            <Button variant="success" icon={CheckCheck} isLoading={isFinishingAll} onClick={handleCompleteAllDishes}>
              ทำเสร็จทั้งหมดในบิลนี้
            </Button>
          ) : (
            <p className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 py-2.5 font-semibold text-emerald-800">
              <ChefHat className="size-5" aria-hidden />
              เสิร์ฟครบทุกรายการแล้ว
            </p>
          )}
        </div>
      </article>
    </>
  );
});

export default OrderTicketCard;
