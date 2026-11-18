'use client';

import { useState } from 'react';
import { Scale } from 'lucide-react';
import { AlertMessage, Button } from '@/components/ui';
import { calculateLeftoverPenalty, formatCurrency } from '@/lib/utils';

/**
 * ฟอร์มชั่งเนื้อเหลือ (กฎข้อ 6: 100 บาทต่อทุก 100 กรัม ปัดขึ้น ชั่งเฉพาะเนื้อสัตว์ที่กินได้)
 * ชั่งใหม่ได้ (บันทึกทับ) จนกว่าจะออกบิล
 * @param {Object} props
 * @param {{ weightGrams: number, penaltyAmount: number } | null} props.savedLeftover - ค่าที่บันทึกไว้แล้ว
 * @param {(weightGrams: number) => Promise<string|null>} props.onSave - คืน error หรือ null
 */
export default function LeftoverForm({ savedLeftover, onSave }) {
  const [weightText, setWeightText] = useState(savedLeftover ? String(savedLeftover.weightGrams) : '');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(/** @type {{ tone: 'error'|'success', text: string } | null} */ (null));

  const weightGrams = weightText === '' ? null : Number(weightText);
  const isValidWeight = weightGrams !== null && Number.isInteger(weightGrams) && weightGrams >= 0;
  // ตัวอย่างค่าปรับก่อนบันทึก — ค่าจริงคำนวณในฐานข้อมูลตามอัตราที่ตั้งไว้
  const previewPenalty = isValidWeight ? calculateLeftoverPenalty(weightGrams) : 0;

  const handleSave = async (event) => {
    event.preventDefault();
    if (!isValidWeight) return;
    setIsSaving(true);
    setMessage(null);
    const error = await onSave(weightGrams);
    setIsSaving(false);
    setMessage(error ? { tone: 'error', text: error } : { tone: 'success', text: 'บันทึกน้ำหนักแล้ว' });
  };

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <p className="flex items-center gap-2 font-bold">
        <Scale className="size-5 text-primary" aria-hidden />
        ชั่งเนื้อสัตว์เหลือ
      </p>
      <p className="text-sm text-ink-muted">ชั่งเฉพาะเนื้อที่กินได้ ไม่รวมกระดูก/เปลือก · ไม่มีเนื้อเหลือให้กรอก 0</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={weightText}
          onChange={(event) => setWeightText(event.target.value)}
          placeholder="0"
          aria-label="น้ำหนักเนื้อเหลือ (กรัม)"
          className="h-12 w-full rounded-xl border border-line bg-white px-4 text-right text-xl font-bold tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <span className="font-semibold text-ink-muted">กรัม</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-muted">ค่าปรับ (100 บาท / 100 กรัม ปัดขึ้น)</span>
        <span className="text-lg font-bold text-primary">{formatCurrency(previewPenalty)}</span>
      </div>
      <Button type="submit" isLoading={isSaving} disabled={!isValidWeight}>
        {savedLeftover ? 'บันทึกน้ำหนักใหม่' : 'บันทึกน้ำหนัก'}
      </Button>
      {message && <AlertMessage tone={message.tone}>{message.text}</AlertMessage>}
    </form>
  );
}
