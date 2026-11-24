'use client';

import { Minus, Plus, Trash2 } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { formatExtraPrice } from './cart';

/**
 * @typedef {Object} CartViewLine
 * @property {string} key
 * @property {string} name
 * @property {string} optionLabel
 * @property {number} quantity
 * @property {number} unitExtraPrice - ราคาสั่งเพิ่มต่อจาน (รวมตัวเลือก) 0 = อยู่ในบุฟเฟต์
 * @property {boolean} isSoldOut - เมนูหมดระหว่างอยู่ในตะกร้า
 * @property {import('./cart').CartLine} line
 */

/**
 * หน้าต่างตะกร้า: ปรับจำนวน / ลบ / ส่งเข้าครัว
 * แสดงยอด "สั่งเพิ่ม" ให้ลูกค้ารู้ก่อนส่ง (เมนูในบุฟเฟต์ไม่มีราคา)
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {CartViewLine[]} props.lines
 * @param {(line: import('./cart').CartLine, change: number) => void} props.onChangeQuantity
 * @param {() => void} props.onSubmit
 * @param {boolean} props.isLocked
 * @param {boolean} props.isSubmitting
 */
export default function CartSheet({ isOpen, onClose, lines, onChangeQuantity, onSubmit, isLocked, isSubmitting }) {
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const extraTotal = lines.reduce((sum, line) => sum + line.unitExtraPrice * line.quantity, 0);
  const hasSoldOut = lines.some((line) => line.isSoldOut);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="ตะกร้าของฉัน"
      description={`${totalQuantity} รายการ`}
      className="self-end sm:self-center"
      footer={
        <div className="flex w-full flex-col gap-2">
          {extraTotal > 0 && (
            <p className="text-center text-sm font-semibold text-amber-800">
              มีเมนูสั่งเพิ่ม คิดเงินเพิ่ม {formatExtraPrice(extraTotal)} ตอนชำระเงิน
            </p>
          )}
          {hasSoldOut && (
            <p className="text-center text-sm font-semibold text-danger">มีเมนูที่หมดแล้ว กรุณานำออกก่อนส่ง</p>
          )}
          <Button
            size="lg"
            className="w-full"
            onClick={onSubmit}
            disabled={lines.length === 0 || isLocked || hasSoldOut}
            isLoading={isSubmitting}
          >
            {isLocked ? 'หมดเวลาสั่งอาหาร' : 'ยืนยันส่งเข้าครัว'}
          </Button>
        </div>
      }
    >
      {lines.length === 0 ? (
        <p className="py-6 text-center text-ink-muted">ยังไม่มีรายการในตะกร้า</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {lines.map((line) => (
            <li key={line.key} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className={cn('font-bold', line.isSoldOut && 'text-ink-muted line-through')}>{line.name}</p>
                {line.optionLabel && <p className="text-sm text-ink-muted">{line.optionLabel}</p>}
                {line.isSoldOut && <p className="text-sm font-semibold text-danger">หมดแล้ว</p>}
                {!line.isSoldOut && line.unitExtraPrice > 0 && (
                  <p className="text-sm font-semibold text-amber-800">สั่งเพิ่ม {formatExtraPrice(line.unitExtraPrice)} / จาน</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChangeQuantity(line.line, -1)}
                  className="flex size-9 items-center justify-center rounded-full bg-line"
                  aria-label={line.quantity === 1 ? `ลบ ${line.name}` : `ลด ${line.name}`}
                >
                  {line.quantity === 1 ? <Trash2 className="size-4 text-danger" aria-hidden /> : <Minus className="size-4" aria-hidden />}
                </button>
                <span className="min-w-6 text-center text-lg font-bold tabular-nums">{line.quantity}</span>
                <button
                  type="button"
                  onClick={() => onChangeQuantity(line.line, 1)}
                  disabled={line.isSoldOut || isLocked}
                  className="flex size-9 items-center justify-center rounded-full bg-primary text-white disabled:bg-line disabled:text-ink-muted"
                  aria-label={`เพิ่ม ${line.name}`}
                >
                  <Plus className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
