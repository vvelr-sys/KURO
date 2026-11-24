'use client';

import { memo } from 'react';
import { Minus, Plus, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatExtraPrice } from './cart';

/**
 * การ์ดเมนู 1 รายการ + ปุ่ม +/-
 * - เมนูหมด (out_of_stock / manual_off) แสดงป้าย "หมด" และกดสั่งไม่ได้ — ไม่ซ่อนการ์ด (กฎข้อ 7)
 * - เมนูมีตัวเลือก: ปุ่ม + เปิดหน้าต่างเลือก / ปรับจำนวนต่อในตะกร้า
 * - เมนูสั่งเพิ่ม (extraPrice > 0) แสดงป้าย "สั่งเพิ่ม +159฿"
 * React.memo: เมื่อเปลี่ยนจำนวนเมนูหนึ่ง การ์ดอื่น render ใหม่ไม่ได้
 * @param {Object} props
 * @param {import('@/app/order/[tableNumber]/data').CustomerMenuItem} props.item
 * @param {'available'|'out_of_stock'|'manual_off'} props.availability - สถานะล่าสุด (รวม Realtime แล้ว)
 * @param {number} props.quantityInCart
 * @param {boolean} props.isLocked - หมดเวลา/รอบปิดรับออเดอร์
 * @param {(item: import('@/app/order/[tableNumber]/data').CustomerMenuItem) => void} props.onAdd
 * @param {(item: import('@/app/order/[tableNumber]/data').CustomerMenuItem) => void} props.onRemove
 */
function MenuCard({ item, availability, quantityInCart, isLocked, onAdd, onRemove }) {
  const isSoldOut = availability !== 'available';
  const hasOptions = item.options.length > 0;
  const canAdd = !isSoldOut && !isLocked;

  return (
    <article
      className={cn(
        'flex gap-3 rounded-2xl bg-white p-3 shadow-sm',
        quantityInCart > 0 && 'ring-2 ring-primary',
        isSoldOut && 'opacity-60'
      )}
    >
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-surface">
        {item.imageUrl ? (
          // รูปเมนูมาจาก URL ภายนอกที่ผู้จัดการใส่ — ใช้ <img> ธรรมดา (next/image ต้องตั้งโดเมนล่วงหน้า)
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <UtensilsCrossed className="absolute inset-0 m-auto size-8 text-ink-muted/40" aria-hidden />
        )}
        {isSoldOut && (
          <span className="absolute inset-0 flex items-center justify-center bg-ink/50 text-lg font-bold text-white">
            หมด
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="font-bold leading-snug">{item.name}</h3>
        {item.description && <p className="line-clamp-2 text-sm text-ink-muted">{item.description}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          {item.extraPrice > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
              สั่งเพิ่ม {formatExtraPrice(item.extraPrice)}
            </span>
          )}
          {hasOptions && (
            <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-ink-muted">มีตัวเลือก</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center justify-end gap-1">
        {quantityInCart > 0 && !hasOptions && (
          <>
            <button
              type="button"
              onClick={() => onRemove(item)}
              disabled={isLocked}
              className="flex size-9 items-center justify-center rounded-full bg-line text-ink disabled:opacity-40"
              aria-label={`ลด ${item.name}`}
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <span className="min-w-6 text-center text-lg font-bold tabular-nums" aria-label={`จำนวน ${quantityInCart}`}>
              {quantityInCart}
            </span>
          </>
        )}
        {quantityInCart > 0 && hasOptions && (
          <span className="rounded-full bg-primary px-2 text-sm font-bold text-white tabular-nums">{quantityInCart}</span>
        )}
        <button
          type="button"
          onClick={() => onAdd(item)}
          disabled={!canAdd}
          className="flex size-9 items-center justify-center rounded-full bg-primary text-white active:scale-95 disabled:bg-line disabled:text-ink-muted"
          aria-label={isSoldOut ? `${item.name} หมด` : `เพิ่ม ${item.name}`}
        >
          <Plus className="size-5" aria-hidden />
        </button>
      </div>
    </article>
  );
}

export default memo(MenuCard);
