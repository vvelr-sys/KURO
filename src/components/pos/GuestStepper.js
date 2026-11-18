'use client';

import { memo } from 'react';
import { Minus, Plus } from 'lucide-react';

/**
 * ตัวเพิ่ม/ลดจำนวน (ผู้ใหญ่ / เด็ก) แบบปุ่มใหญ่ กดง่ายบนแท็บเล็ต ตาม Figma
 * @param {Object} props
 * @param {string} props.label
 * @param {string} [props.hint]
 * @param {number} props.value
 * @param {(nextValue: number) => void} props.onChange
 * @param {number} [props.min=0]
 * @param {number} [props.max=50]
 */
function GuestStepper({ label, hint, value, onChange, min = 0, max = 50 }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-surface p-4">
      <div className="flex-1">
        <p className="font-bold">{label}</p>
        {hint && <p className="text-sm text-ink-muted">{hint}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex size-12 items-center justify-center rounded-xl bg-white text-ink shadow-sm disabled:opacity-40"
        aria-label={`ลด${label}`}
      >
        <Minus className="size-5" aria-hidden />
      </button>
      <span className="w-10 text-center text-3xl font-bold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex size-12 items-center justify-center rounded-xl bg-primary text-white shadow-sm disabled:opacity-40"
        aria-label={`เพิ่ม${label}`}
      >
        <Plus className="size-5" aria-hidden />
      </button>
    </div>
  );
}

export default memo(GuestStepper);
