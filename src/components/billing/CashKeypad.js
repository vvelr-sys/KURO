'use client';

import { memo } from 'react';
import { Delete } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const DIGIT_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0', '.'];

/**
 * ปุ่มตัวเลขรับเงินสด (กดง่ายบนแท็บเล็ต ตาม Figma) + ปุ่มจำนวนเงินด่วน
 * @param {Object} props
 * @param {string} props.value - ข้อความจำนวนเงินที่รับมา
 * @param {(nextValue: string) => void} props.onChange
 * @param {number} props.amountDue - ยอดที่ต้องจ่าย (บาท) ใช้สร้างปุ่ม "พอดี" และปัดขึ้น
 */
function CashKeypad({ value, onChange, amountDue }) {
  const pressKey = (key) => {
    if (key === '.' && value.includes('.')) return;
    const [, decimals = ''] = value.split('.');
    if (value.includes('.') && decimals.length >= 2) return; // ทศนิยมไม่เกิน 2 ตำแหน่ง
    const nextValue = value === '0' && key !== '.' ? key : value + key;
    if (nextValue.replace('.', '').length > 9) return;
    onChange(nextValue);
  };

  // ปุ่มด่วน: พอดี + ปัดขึ้นเป็นหลัก 100 / 500 / 1,000 ที่ไม่ซ้ำกัน
  const quickAmounts = [...new Set([
    amountDue,
    Math.ceil(amountDue / 100) * 100,
    Math.ceil(amountDue / 500) * 500,
    Math.ceil(amountDue / 1000) * 1000,
  ])].filter((amount) => amount > 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2">
        {quickAmounts.map((amount, index) => (
          <button
            key={amount}
            type="button"
            onClick={() => onChange(String(amount))}
            className="h-11 rounded-xl bg-surface text-sm font-bold hover:bg-primary/5"
          >
            {index === 0 ? 'พอดี' : formatCurrency(amount).replace('.00', '')}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div className="col-span-3 grid grid-cols-3 gap-2">
          {DIGIT_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => pressKey(key)}
              className="h-14 rounded-xl bg-surface text-2xl font-semibold hover:bg-line active:scale-95"
            >
              {key}
            </button>
          ))}
        </div>
        <div className="grid grid-rows-4 gap-2">
          {[1000, 500, 100].map((step) => (
            <button
              key={step}
              type="button"
              onClick={() => onChange(String(Math.round(((Number(value) || 0) + step) * 100) / 100))}
              className="h-14 rounded-xl bg-line font-bold hover:bg-ink/10"
            >
              +{step.toLocaleString('th-TH')}
            </button>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChange('')}
              className="h-14 rounded-xl bg-danger-soft font-bold text-danger"
              aria-label="ล้างจำนวนเงิน"
            >
              C
            </button>
            <button
              type="button"
              onClick={() => onChange(value.slice(0, -1))}
              className="flex h-14 items-center justify-center rounded-xl bg-surface"
              aria-label="ลบตัวเลขล่าสุด"
            >
              <Delete className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(CashKeypad);
