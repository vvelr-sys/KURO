'use client';

import { useState } from 'react';
import { LayoutGrid, Plus, Trash2 } from 'lucide-react';
import { addDiningTable, deleteDiningTable, updateTableCapacity } from '@/app/(admin)/settings/actions';
import { AlertMessage, Button } from '@/components/ui';
import { TABLE_SIZES, getTableSizeKey } from '@/lib/constants';
import { cn } from '@/lib/utils';

const STATUS_LABELS = { available: 'ว่าง', occupied: 'มีลูกค้า', cleaning: 'รอเก็บโต๊ะ', disabled: 'ปิดใช้งาน' };

/**
 * เดาเลขโต๊ะถัดไปจากโต๊ะที่มีอยู่ เช่น มี T01-T09 → แนะนำ "T10"
 * ใช้ตัวอักษรนำหน้าที่ใช้บ่อยที่สุด และจำนวนหลักเท่าเดิม (อย่างน้อย 2 หลัก)
 * @param {{ tableNumber: string }[]} tables
 * @returns {string}
 */
function suggestNextTableNumber(tables) {
  const parsed = tables
    .map((table) => table.tableNumber.match(/^([A-Z-]*)(\d+)$/))
    .filter(Boolean)
    .map(([, prefix, digits]) => ({ prefix, number: Number(digits), width: digits.length }));
  if (parsed.length === 0) return 'T01';

  const prefixCounts = new Map();
  for (const { prefix } of parsed) prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  const mainPrefix = [...prefixCounts.entries()].sort((first, second) => second[1] - first[1])[0][0];

  const samePrefix = parsed.filter((item) => item.prefix === mainPrefix);
  const nextNumber = Math.max(...samePrefix.map((item) => item.number)) + 1;
  const width = Math.max(2, ...samePrefix.map((item) => item.width));
  return `${mainPrefix}${String(nextNumber).padStart(width, '0')}`;
}

/**
 * จัดการโต๊ะ (สเปก 4.8 ผังโต๊ะ): เพิ่มโต๊ะ, แก้จำนวนที่นั่ง, ลบโต๊ะที่ไม่เคยใช้
 * การปิดใช้งานโต๊ะทำที่หน้าผังโต๊ะ (/tables)
 * @param {Object} props
 * @param {import('@/app/(admin)/settings/data').SettingsTable[]} props.tables
 */
export default function TableSettingsPanel({ tables }) {
  const [newNumber, setNewNumber] = useState('');
  const [newCapacity, setNewCapacity] = useState('4');
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(/** @type {{ tone: 'error'|'success', text: string } | null} */ (null));

  const sizeCounts = TABLE_SIZES.map((size) => ({
    ...size,
    count: tables.filter((table) => getTableSizeKey(table.capacity) === size.key).length,
  }));
  const totalSeats = tables.reduce((sum, table) => sum + table.capacity, 0);
  // เว้นช่องว่างไว้ = ใช้เลขที่ระบบแนะนำ / พิมพ์เอง = ใช้เลขที่พิมพ์
  const suggestedNumber = suggestNextTableNumber(tables);

  const run = async (busyKey, task, successText) => {
    setBusyId(busyKey);
    setMessage(null);
    const result = await task();
    setBusyId(null);
    setMessage(result.error ? { tone: 'error', text: result.error } : { tone: 'success', text: successText });
    return !result.error;
  };

  const handleAdd = async (event) => {
    event.preventDefault();
    const number = (newNumber.trim() || suggestedNumber).toUpperCase();
    const succeeded = await run('new', () => addDiningTable({ tableNumber: number, capacity: Number(newCapacity) }), `เพิ่มโต๊ะ ${number} แล้ว`);
    if (succeeded) setNewNumber('');
  };

  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary">
          <LayoutGrid className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-bold">ผังโต๊ะ</h2>
          <p className="text-sm text-ink-muted">เพิ่มโต๊ะและกำหนดจำนวนที่นั่ง — ขนาดโต๊ะ (เล็ก/กลาง/ใหญ่) คำนวณจากจำนวนที่นั่ง</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="โต๊ะทั้งหมด" value={`${tables.length} โต๊ะ`} />
        <Stat label="ที่นั่งรวม" value={`${totalSeats} ที่`} />
        {sizeCounts.map((size) => (
          <Stat key={size.key} label={`${size.label} (${size.seatLabel})`} value={`${size.count} โต๊ะ`} />
        ))}
      </div>

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 rounded-2xl bg-surface p-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">เลขโต๊ะใหม่</span>
          <input
            value={newNumber}
            onChange={(event) => setNewNumber(event.target.value.toUpperCase())}
            maxLength={10}
            placeholder={suggestedNumber}
            className="h-11 w-32 rounded-xl border border-line bg-white px-3 font-bold uppercase"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">ที่นั่ง</span>
          <input
            type="number"
            min={1}
            max={50}
            value={newCapacity}
            onChange={(event) => setNewCapacity(event.target.value)}
            className="h-11 w-24 rounded-xl border border-line bg-white px-3 text-right"
          />
        </label>
        <Button type="submit" icon={Plus} isLoading={busyId === 'new'}>
          เพิ่มโต๊ะ {newNumber.trim() ? newNumber.trim().toUpperCase() : suggestedNumber}
        </Button>
        <p className="w-full text-xs text-ink-muted">เว้นช่องเลขโต๊ะว่างไว้ = ใช้เลขถัดไปที่ระบบแนะนำ ({suggestedNumber})</p>
      </form>

      {message && <AlertMessage tone={message.tone}>{message.text}</AlertMessage>}

      <ul className="grid gap-2 md:grid-cols-2">
        {tables.map((table) => (
          <li key={table.id} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
            <span className="w-16 text-xl font-bold">{table.tableNumber}</span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-semibold',
                table.status === 'disabled' ? 'bg-line text-ink-muted' : table.status === 'available' ? 'bg-emerald-100 text-emerald-800' : 'bg-primary/10 text-primary'
              )}
            >
              {STATUS_LABELS[table.status]}
            </span>
            <label className="ml-auto flex items-center gap-2 text-sm">
              ที่นั่ง
              <select
                value={table.capacity}
                disabled={busyId === table.id}
                onChange={(event) =>
                  run(table.id, () => updateTableCapacity({ tableId: table.id, capacity: Number(event.target.value) }), `แก้ที่นั่งโต๊ะ ${table.tableNumber} แล้ว`)
                }
                aria-label={`จำนวนที่นั่งโต๊ะ ${table.tableNumber}`}
                className="h-10 rounded-xl border border-line bg-white px-2 font-semibold"
              >
                {Array.from({ length: 12 }, (_, index) => index + 1)
                  .concat(table.capacity > 12 ? [table.capacity] : [])
                  .map((seats) => (
                    <option key={seats} value={seats}>
                      {seats}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => run(table.id, () => deleteDiningTable({ tableId: table.id }), `ลบโต๊ะ ${table.tableNumber} แล้ว`)}
              disabled={table.hasHistory || busyId === table.id}
              title={table.hasHistory ? 'เคยมีลูกค้าใช้แล้ว ลบไม่ได้ (ปิดใช้งานที่หน้าผังโต๊ะแทน)' : 'ลบโต๊ะ'}
              aria-label={`ลบโต๊ะ ${table.tableNumber}`}
              className="rounded-xl p-2 text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:text-ink-muted/40 disabled:hover:bg-transparent"
            >
              <Trash2 className="size-5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl bg-surface p-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
