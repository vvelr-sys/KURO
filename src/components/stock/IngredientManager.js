'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, ShieldAlert } from 'lucide-react';
import { AlertMessage, Button, Modal } from '@/components/ui';
import { useDebounce } from '@/hooks/useDebounce';
import { formatStockNumber, getStockStatus } from '@/lib/stock';
import { cn } from '@/lib/utils';

// สถานะสต็อก: สี + ข้อความเสมอ (ไม่ใช้สีอย่างเดียว)
const STATUS_DISPLAY = {
  out: { label: 'หมด', className: 'bg-danger-soft text-danger' },
  reorder: { label: 'ต่ำกว่าจุดสั่งซื้อ', className: 'bg-amber-100 text-amber-900' },
  ok: { label: 'พอ', className: 'bg-emerald-100 text-emerald-800' },
};

const INPUT_CLASS =
  'h-11 w-full rounded-xl border border-line px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

/**
 * หน้าต่างเพิ่ม/แก้วัตถุดิบ (ยอดคงเหลือแก้ที่นี่ไม่ได้ — มีประวัติทุกครั้งผ่านรับเข้า/ของเสีย/นับ)
 * @param {{ ingredient: object|null, onSave: (input: object) => Promise<{ success: boolean, error: string|null }>, onClose: () => void }} props
 */
function IngredientFormModal({ ingredient, onSave, onClose }) {
  const isNew = !ingredient?.id;
  const [name, setName] = useState(ingredient?.name ?? '');
  const [unit, setUnit] = useState(ingredient?.unit ?? 'g');
  const [threshold, setThreshold] = useState(String(ingredient?.minimum_threshold ?? 0));
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setFormError(null);
    const result = await onSave({ id: ingredient?.id ?? null, name, unit, minimumThreshold: threshold });
    setIsSaving(false);
    if (result.success) onClose();
    else setFormError(result.error);
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      isCloseDisabled={isSaving}
      title={isNew ? 'เพิ่มวัตถุดิบ' : 'แก้ไขวัตถุดิบ'}
      description={isNew ? 'ยอดเริ่มต้นเป็น 0 — เพิ่มยอดด้วย "รับของเข้า"' : 'ยอดคงเหลือแก้ที่นี่ไม่ได้'}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isSaving}>
            ยกเลิก
          </Button>
          <Button type="submit" form="ingredient-form" className="flex-1" isLoading={isSaving}>
            บันทึก
          </Button>
        </>
      }
    >
      <form id="ingredient-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">ชื่อวัตถุดิบ</span>
          <input className={INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น หมูสามชั้นสไลซ์" autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">หน่วยนับ</span>
            <input className={INPUT_CLASS} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="g, ml, ชิ้น" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">จุดสั่งซื้อ (Reorder Point)</span>
            <input
              className={cn(INPUT_CLASS, 'text-right tabular-nums')}
              inputMode="decimal"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </label>
        </div>
        <AlertMessage>{formError}</AlertMessage>
      </form>
    </Modal>
  );
}

/**
 * หน้าต่าง Admin ปรับยอดฉุกเฉิน (ตั้งยอดใหม่ + เหตุผลบังคับ — บันทึก EMERGENCY_OVERRIDE)
 * @param {{ ingredient: object, onAdjust: (id: string, newStock: number, reason: string) => Promise<object>, onClose: () => void }} props
 */
function EmergencyAdjustModal({ ingredient, onAdjust, onClose }) {
  const [newStock, setNewStock] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const canSubmit = newStock.trim() !== '' && reason.trim() !== '';

  const handleSubmit = async () => {
    setIsSaving(true);
    setFormError(null);
    const result = await onAdjust(ingredient.id, Number(newStock), reason);
    setIsSaving(false);
    if (result.success) onClose();
    else setFormError(result.error);
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      isCloseDisabled={isSaving}
      title="ปรับยอดฉุกเฉิน (แอดมิน)"
      description={`${ingredient.name} · ยอดในระบบ ${formatStockNumber(ingredient.current_stock)} ${ingredient.unit}`}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isSaving}>
            ยกเลิก
          </Button>
          <Button variant="danger" className="flex-1" onClick={handleSubmit} disabled={!canSubmit} isLoading={isSaving}>
            ยืนยันปรับยอด
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
          ใช้เฉพาะกรณีจำเป็นแทนผู้จัดการ — ปกติให้ปรับยอดผ่านการนับสต็อกและการอนุมัติ ทุกครั้งถูกบันทึกใน Audit Log
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">ยอดใหม่ ({ingredient.unit})</span>
          <input
            className={cn(INPUT_CLASS, 'text-right tabular-nums')}
            inputMode="decimal"
            value={newStock}
            onChange={(e) => setNewStock(e.target.value)}
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">
            เหตุผล <span className="text-danger">*</span>
          </span>
          <textarea
            className="h-20 resize-none rounded-xl border border-line px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น ผู้จัดการไม่อยู่ ของเข้าจริงไม่ตรงใบส่งของ"
          />
        </label>
        <AlertMessage>{formError}</AlertMessage>
      </div>
    </Modal>
  );
}

/**
 * แท็บ "วัตถุดิบ" ของหน้าสต็อก: ค้นหา, เพิ่ม/แก้วัตถุดิบ, ดูสถานะเทียบจุดสั่งซื้อ (FR-030, FR-034)
 * Admin มีปุ่มปรับยอดฉุกเฉินเพิ่ม
 *
 * @param {object} props
 * @param {string} props.staffRole
 * @param {() => Promise<{ ingredients: Array, error: string|null }>} props.loadAction
 * @param {(input: object) => Promise<{ success: boolean, error: string|null }>} props.saveAction
 * @param {(id: string, newStock: number, reason: string) => Promise<{ success: boolean, error: string|null }>} props.adjustAction
 */
export default function IngredientManager({ staffRole, loadAction, saveAction, adjustAction }) {
  const [ingredients, setIngredients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounce(searchText, 200);
  const [editing, setEditing] = useState(null); // null = ปิด, {} = เพิ่มใหม่, object = แก้ไข
  const [adjusting, setAdjusting] = useState(null);

  const reload = useCallback(async () => {
    const result = await loadAction();
    setIngredients(result.ingredients);
    setPageError(result.error);
    setIsLoading(false);
  }, [loadAction]);

  useEffect(() => {
    let isCurrent = true;
    loadAction().then((result) => {
      if (!isCurrent) return;
      setIngredients(result.ingredients);
      setPageError(result.error);
      setIsLoading(false);
    });
    return () => {
      isCurrent = false;
    };
  }, [loadAction]);

  const handleSave = useCallback(
    async (input) => {
      const result = await saveAction(input);
      if (result.success) reload();
      return result;
    },
    [saveAction, reload]
  );

  const handleAdjust = useCallback(
    async (id, newStock, reason) => {
      const result = await adjustAction(id, newStock, reason);
      if (result.success) reload();
      return result;
    },
    [adjustAction, reload]
  );

  const visibleRows = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    return ingredients
      .map((ingredient) => ({
        ...ingredient,
        status: getStockStatus(Number(ingredient.current_stock), Number(ingredient.minimum_threshold)),
      }))
      .filter((ingredient) => !query || ingredient.name.toLowerCase().includes(query));
  }, [ingredients, debouncedSearch]);

  const lowStockCount = visibleRows.filter((row) => row.status !== 'ok').length;

  return (
    <div className="flex flex-col gap-4">
      {editing && <IngredientFormModal ingredient={editing} onSave={handleSave} onClose={() => setEditing(null)} />}
      {adjusting && <EmergencyAdjustModal ingredient={adjusting} onAdjust={handleAdjust} onClose={() => setAdjusting(null)} />}

      <div className="flex flex-wrap items-center gap-2 rounded-3xl bg-white p-3 shadow-sm">
        <label className="relative min-w-60 flex-1">
          <span className="sr-only">ค้นหาวัตถุดิบ</span>
          <Search className="absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            type="search"
            className="h-11 w-full rounded-xl border border-line pl-11 pr-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="ค้นหาชื่อวัตถุดิบ..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </label>
        <span className="text-sm text-ink-muted">ต่ำกว่าจุดสั่งซื้อ/หมด {lowStockCount} รายการ</span>
        <Button icon={Plus} onClick={() => setEditing({})}>
          เพิ่มวัตถุดิบ
        </Button>
      </div>

      <AlertMessage>{pageError}</AlertMessage>

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-3xl bg-white" aria-hidden />
      ) : visibleRows.length === 0 ? (
        <p className="rounded-3xl bg-white p-10 text-center text-ink-muted">ไม่พบวัตถุดิบ</p>
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">วัตถุดิบ</th>
                <th className="px-4 py-3 text-right font-semibold">คงเหลือ</th>
                <th className="px-4 py-3 text-right font-semibold">จุดสั่งซื้อ</th>
                <th className="px-4 py-3 font-semibold">สถานะ</th>
                <th className="px-4 py-3" aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visibleRows.map((row) => {
                const status = STATUS_DISPLAY[row.status];
                return (
                  <tr key={row.id}>
                    <td className="px-4 py-3 font-semibold">{row.name}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                      {formatStockNumber(row.current_stock)} <span className="text-xs font-normal text-ink-muted">{row.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-muted">{formatStockNumber(row.minimum_threshold)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', status.className)}>{status.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing(row)}>
                          แก้ไข
                        </Button>
                        {staffRole === 'admin' && (
                          <Button size="sm" variant="danger" icon={ShieldAlert} onClick={() => setAdjusting(row)}>
                            ปรับฉุกเฉิน
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
