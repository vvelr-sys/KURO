'use client';

import { useState } from 'react';
import { Percent, Tag } from 'lucide-react';
import { AlertMessage, Button } from '@/components/ui';
import { parseBahtInput } from '@/lib/money';
import { cn, formatCurrency } from '@/lib/utils';
import { DISCOUNT_REASON_PRESETS } from './paymentLabels';

/**
 * กรอกส่วนลด (FR-041): เป็นบาท หรือ % (แปลงเป็นบาทให้) + บังคับเหตุผล
 * บันทึกแล้วแก้ได้จนกว่าจะรับชำระ / กด "ลบส่วนลด" เพื่อยกเลิก
 * @param {Object} props
 * @param {number} props.subtotal - ยอดก่อนลด (บาท)
 * @param {number} props.currentAmount - ส่วนลดที่บันทึกไว้ (บาท)
 * @param {string|null} props.currentReason
 * @param {(amount: number, reason: string) => Promise<string|null>} props.onSave - คืน error หรือ null
 */
export default function DiscountEditor({ subtotal, currentAmount, currentReason, onSave }) {
  const [mode, setMode] = useState(/** @type {'baht'|'percent'} */ ('baht'));
  const [valueText, setValueText] = useState(currentAmount > 0 ? String(currentAmount) : '');
  const [reason, setReason] = useState(currentReason ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(/** @type {{ tone: 'error'|'success', text: string } | null} */ (null));

  const inputValue = parseBahtInput(valueText);
  // แปลง % เป็นบาท (ปัด 2 ตำแหน่ง) — ฐานข้อมูลเก็บเป็นบาทเสมอ
  const discountBaht =
    inputValue === null ? null : mode === 'percent' ? Math.round(subtotal * inputValue) / 100 : inputValue;
  const isTooMuch = discountBaht !== null && discountBaht > subtotal;
  const isPercentInvalid = mode === 'percent' && inputValue !== null && inputValue > 100;
  const canSave = discountBaht !== null && discountBaht > 0 && !isTooMuch && !isPercentInvalid && reason.trim() !== '';

  const save = async (amount, reasonText) => {
    setIsSaving(true);
    setMessage(null);
    const error = await onSave(amount, reasonText);
    setIsSaving(false);
    setMessage(error ? { tone: 'error', text: error } : { tone: 'success', text: amount > 0 ? 'บันทึกส่วนลดแล้ว' : 'ลบส่วนลดแล้ว' });
    if (!error && amount === 0) {
      setValueText('');
      setReason('');
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Tag className="size-5 text-primary" aria-hidden />
        ส่วนลด
        {currentAmount > 0 && (
          <span className="ml-auto rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-800">
            ใช้อยู่ −{formatCurrency(currentAmount)}
          </span>
        )}
      </h2>

      <div className="flex gap-2">
        <div className="flex rounded-xl bg-surface p-1">
          {[
            { key: 'baht', label: '฿ บาท' },
            { key: 'percent', label: '% เปอร์เซ็นต์' },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setMode(option.key)}
              aria-pressed={mode === option.key}
              className={cn('rounded-lg px-3 py-2 text-sm font-semibold', mode === option.key ? 'bg-white shadow-sm' : 'text-ink-muted')}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="relative flex-1">
          <input
            inputMode="decimal"
            value={valueText}
            onChange={(event) => setValueText(event.target.value)}
            placeholder="0"
            aria-label={mode === 'percent' ? 'ส่วนลด (เปอร์เซ็นต์)' : 'ส่วนลด (บาท)'}
            className="h-12 w-full rounded-xl border border-line px-4 pr-10 text-right text-lg font-bold tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted">
            {mode === 'percent' ? <Percent className="size-4" aria-hidden /> : '฿'}
          </span>
        </label>
      </div>
      {mode === 'percent' && discountBaht !== null && !isPercentInvalid && (
        <p className="text-sm text-ink-muted">= ส่วนลด {formatCurrency(discountBaht)}</p>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">
          เหตุผล <span className="text-danger">*</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {DISCOUNT_REASON_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setReason(preset)}
              aria-pressed={reason === preset}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm ring-1',
                reason === preset ? 'bg-primary text-white ring-primary' : 'bg-white ring-line hover:bg-primary/5'
              )}
            >
              {preset}
            </button>
          ))}
        </div>
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={300}
          placeholder="หรือพิมพ์เหตุผลเอง"
          className="h-11 rounded-xl border border-line px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {isTooMuch && <AlertMessage>ส่วนลดเกินยอดก่อนลด ({formatCurrency(subtotal)})</AlertMessage>}
      {isPercentInvalid && <AlertMessage>เปอร์เซ็นต์ต้องไม่เกิน 100</AlertMessage>}
      {message && <AlertMessage tone={message.tone}>{message.text}</AlertMessage>}

      <div className="flex gap-2">
        {currentAmount > 0 && (
          <Button variant="secondary" onClick={() => save(0, '')} disabled={isSaving}>
            ลบส่วนลด
          </Button>
        )}
        <Button className="flex-1" onClick={() => save(discountBaht, reason.trim())} isLoading={isSaving} disabled={!canSave}>
          {currentAmount > 0 ? 'บันทึกส่วนลดใหม่' : 'ใช้ส่วนลด'}
        </Button>
      </div>
    </section>
  );
}
