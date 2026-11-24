'use client';

import React, { useState } from 'react';
import { PackagePlus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STOCK_MOVEMENT_LABELS, STOCK_MOVEMENT_TYPES } from '@/lib/constants';
import { formatBangkokTime, formatStockNumber } from '@/lib/stock';

const FORM_SETTINGS = {
  [STOCK_MOVEMENT_TYPES.MANUAL_RESTOCK]: {
    icon: PackagePlus,
    reasonLabel: 'หมายเหตุ (ไม่บังคับ)',
    reasonPlaceholder: 'เช่น ผู้ส่งของ, เลขใบส่งของ',
    reasonRequired: false,
    buttonText: 'บันทึกรับของเข้า',
  },
  [STOCK_MOVEMENT_TYPES.KITCHEN_WASTE]: {
    icon: Trash2,
    reasonLabel: 'เหตุผล (บังคับ)',
    reasonPlaceholder: 'เช่น หมดอายุ, เน่าเสีย, ทำหล่น',
    reasonRequired: true,
    buttonText: 'บันทึกของเสีย',
  },
};

/**
 * ฟอร์มรับของเข้า / บันทึกของเสีย
 * หลังบันทึกแสดงประวัติที่บันทึกในเครื่องนี้ (ไม่แสดงยอดคงเหลือ — คงหลักนับแบบไม่เห็นยอด)
 *
 * @param {object} props
 * @param {'manual_restock'|'kitchen_waste'} props.movementType
 * @param {Array<{ id: string, name: string, unit: string }>} props.ingredients
 * @param {(ingredientId: string, movementType: string, quantity: number, reason: string|null) => Promise<{ success: boolean, error: string|null }>} props.onSubmit
 */
const StockMovementForm = React.memo(function StockMovementForm({ movementType, ingredients, onSubmit }) {
  const settings = FORM_SETTINGS[movementType];
  const Icon = settings.icon;

  const [ingredientId, setIngredientId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [savedEntries, setSavedEntries] = useState([]);

  const selectedIngredient = ingredients.find((item) => item.id === ingredientId);
  const canSave =
    ingredientId !== '' &&
    Number(quantity) > 0 &&
    (!settings.reasonRequired || reason.trim() !== '') &&
    !isSaving;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSave) return;

    setIsSaving(true);
    setErrorMessage(null);

    const result = await onSubmit(ingredientId, movementType, Number(quantity), reason.trim() || null);
    setIsSaving(false);

    if (!result.success) {
      setErrorMessage(result.error);
      return;
    }

    setSavedEntries((prev) => [
      {
        key: `${Date.now()}-${ingredientId}`,
        name: selectedIngredient?.name ?? '-',
        unit: selectedIngredient?.unit ?? '',
        quantity: Number(quantity),
        reason: reason.trim(),
        time: new Date().toISOString(),
      },
      ...prev,
    ]);
    setQuantity('');
    setReason('');
  };

  return (
    <section className="space-y-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-line p-5 space-y-4">
        <label className="block">
          <span className="block text-sm font-semibold text-ink mb-1">วัตถุดิบ</span>
          <select
            value={ingredientId}
            onChange={(event) => setIngredientId(event.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-line bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">— เลือกวัตถุดิบ —</option>
            {ingredients.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.unit})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-sm font-semibold text-ink mb-1">จำนวน</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="flex-1 px-3 py-2.5 rounded-xl border border-line text-right text-lg font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="0"
            />
            <span className="w-12 text-sm text-ink-muted">{selectedIngredient?.unit ?? ''}</span>
          </div>
        </label>

        <label className="block">
          <span className="block text-sm font-semibold text-ink mb-1">{settings.reasonLabel}</span>
          <input
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={settings.reasonPlaceholder}
            className="w-full px-3 py-2.5 rounded-xl border border-line focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>

        {errorMessage && (
          <p className="p-3 rounded-xl bg-danger-soft border border-danger-soft text-danger text-sm" role="alert">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSave}
          className={cn(
            'w-full py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all',
            canSave
              ? 'bg-primary text-white hover:bg-[#991B1B] active:scale-[0.99]'
              : 'bg-line text-ink-muted cursor-not-allowed'
          )}
        >
          <Icon size={20} />
          {isSaving ? 'กำลังบันทึก...' : settings.buttonText}
        </button>
      </form>

      {savedEntries.length > 0 && (
        <div className="bg-white rounded-2xl border border-line p-5">
          <h3 className="font-bold text-ink mb-3">
            {STOCK_MOVEMENT_LABELS[movementType]}ที่บันทึกจากเครื่องนี้
          </h3>
          <ul className="divide-y divide-line">
            {savedEntries.map((entry) => (
              <li key={entry.key} className="py-2 flex items-baseline gap-3 text-sm">
                <span className="text-ink-muted tabular-nums">{formatBangkokTime(entry.time)}</span>
                <span className="flex-1 text-ink">
                  {entry.name}
                  {entry.reason && <span className="text-ink-muted"> · {entry.reason}</span>}
                </span>
                <span className="font-semibold tabular-nums text-ink">
                  {formatStockNumber(entry.quantity)} {entry.unit}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
});

export default StockMovementForm;
