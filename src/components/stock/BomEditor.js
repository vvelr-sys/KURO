'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Save, Search, Trash2 } from 'lucide-react';
import { AlertMessage, Button } from '@/components/ui';
import { useDebounce } from '@/hooks/useDebounce';
import { formatStockNumber } from '@/lib/stock';
import { cn } from '@/lib/utils';

const AVAILABILITY_DISPLAY = {
  available: { label: 'พร้อมขาย', className: 'bg-emerald-100 text-emerald-800' },
  out_of_stock: { label: 'วัตถุดิบหมด', className: 'bg-line text-ink-muted' },
  manual_off: { label: 'ปิดด้วยมือ', className: 'bg-danger-soft text-danger' },
};

/**
 * แท็บ "สูตรตัดสต็อก (BOM)" — เลือกเมนู แล้วกำหนดวัตถุดิบและปริมาณต่อ 1 จาน (FR-031)
 * บันทึกแล้วฐานข้อมูลตรวจสถานะเมนูใหม่ให้เอง (FR-024: วัตถุดิบไม่พอ 1 จาน → หมด)
 *
 * @param {object} props
 * @param {() => Promise<{ menus: Array, bomRows: Array, ingredients: Array, error: string|null }>} props.loadAction
 * @param {(menuItemId: string, rows: Array<{ ingredientId: string, quantity: number }>) => Promise<{ success: boolean, error: string|null }>} props.saveAction
 */
export default function BomEditor({ loadAction, saveAction }) {
  const [menus, setMenus] = useState([]);
  const [bomRows, setBomRows] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounce(searchText, 200);
  const [selectedMenuId, setSelectedMenuId] = useState(null);
  const [draftRows, setDraftRows] = useState([]); // [{ key, ingredientId, quantity }]
  const [isSaving, setIsSaving] = useState(false);

  const applyData = useCallback((result) => {
    setMenus(result.menus);
    setBomRows(result.bomRows);
    setIngredients(result.ingredients);
    setPageError(result.error);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let isCurrent = true;
    loadAction().then((result) => {
      if (isCurrent) applyData(result);
    });
    return () => {
      isCurrent = false;
    };
  }, [loadAction, applyData]);

  const ingredientById = useMemo(() => new Map(ingredients.map((item) => [item.id, item])), [ingredients]);

  // จำนวนวัตถุดิบในสูตรของแต่ละเมนู (โชว์ในรายการซ้าย)
  const bomCountByMenu = useMemo(() => {
    const counts = new Map();
    for (const row of bomRows) counts.set(row.menu_item_id, (counts.get(row.menu_item_id) ?? 0) + 1);
    return counts;
  }, [bomRows]);

  const visibleMenus = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    return menus.filter((menu) => !query || menu.name.toLowerCase().includes(query));
  }, [menus, debouncedSearch]);

  const selectedMenu = menus.find((menu) => menu.id === selectedMenuId) ?? null;

  const selectMenu = (menuId) => {
    setSelectedMenuId(menuId);
    setNotice(null);
    setPageError(null);
    setDraftRows(
      bomRows
        .filter((row) => row.menu_item_id === menuId)
        .map((row) => ({ key: row.ingredient_id, ingredientId: row.ingredient_id, quantity: String(row.quantity_required) }))
    );
  };

  const updateDraftRow = (key, field, value) =>
    setDraftRows((rows) => rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)));

  const addDraftRow = () =>
    setDraftRows((rows) => [...rows, { key: `new-${Date.now()}`, ingredientId: '', quantity: '' }]);

  const removeDraftRow = (key) => setDraftRows((rows) => rows.filter((row) => row.key !== key));

  // จำนวนจานที่ทำได้จากสต็อกตอนนี้ (ตัวที่น้อยสุดในสูตร)
  const portionsAvailable = useMemo(() => {
    const counts = draftRows
      .map((row) => {
        const ingredient = ingredientById.get(row.ingredientId);
        const quantity = Number(row.quantity);
        if (!ingredient || !(quantity > 0)) return null;
        return Math.floor(Number(ingredient.current_stock) / quantity);
      })
      .filter((count) => count !== null);
    return counts.length > 0 ? Math.min(...counts) : null;
  }, [draftRows, ingredientById]);

  const handleSave = async () => {
    if (!selectedMenu) return;
    setIsSaving(true);
    setPageError(null);
    setNotice(null);
    const result = await saveAction(
      selectedMenu.id,
      draftRows.map((row) => ({ ingredientId: row.ingredientId, quantity: Number(row.quantity) }))
    );
    if (result.success) {
      const refreshed = await loadAction();
      applyData(refreshed);
      setNotice(`บันทึกสูตร "${selectedMenu.name}" แล้ว`);
    } else {
      setPageError(result.error);
    }
    setIsSaving(false);
  };

  if (isLoading) return <div className="h-64 animate-pulse rounded-3xl bg-white" aria-hidden />;

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      {/* ─── รายการเมนู ─── */}
      <section className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm">
        <label className="relative">
          <span className="sr-only">ค้นหาเมนู</span>
          <Search className="absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            type="search"
            className="h-11 w-full rounded-xl border border-line pl-11 pr-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="ค้นหาเมนู..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </label>
        <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
          {visibleMenus.map((menu) => {
            const isSelected = menu.id === selectedMenuId;
            const bomCount = bomCountByMenu.get(menu.id) ?? 0;
            return (
              <li key={menu.id}>
                <button
                  type="button"
                  onClick={() => selectMenu(menu.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left transition-colors',
                    isSelected ? 'bg-primary text-white' : 'hover:bg-surface'
                  )}
                >
                  <span className="min-w-0 flex-1 truncate font-semibold">{menu.name}</span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-xs font-bold',
                      isSelected ? 'bg-white/20' : bomCount === 0 ? 'bg-danger-soft text-danger' : 'bg-surface text-ink-muted'
                    )}
                  >
                    {bomCount === 0 ? 'ยังไม่มีสูตร' : `${bomCount} วัตถุดิบ`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ─── สูตรของเมนูที่เลือก ─── */}
      <section className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm">
        {!selectedMenu ? (
          <p className="p-10 text-center text-ink-muted">เลือกเมนูทางซ้ายเพื่อดู/แก้สูตรตัดสต็อก</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1">
                <h2 className="text-xl font-bold">{selectedMenu.name}</h2>
                <p className="text-sm text-ink-muted">ปริมาณวัตถุดิบที่ใช้ต่อ 1 จาน · ระบบตัดสต็อกตามนี้เมื่อครัวกดเริ่มทำ</p>
              </div>
              <span
                className={cn(
                  'rounded-full px-3 py-1 text-sm font-bold',
                  AVAILABILITY_DISPLAY[selectedMenu.availability_status]?.className
                )}
              >
                {AVAILABILITY_DISPLAY[selectedMenu.availability_status]?.label}
              </span>
            </div>

            {draftRows.length === 0 ? (
              <p className="rounded-2xl bg-surface p-6 text-center text-ink-muted">
                เมนูนี้ยังไม่มีสูตร — ครัวกดทำแล้วจะไม่ตัดสต็อก
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {draftRows.map((row) => {
                  const ingredient = ingredientById.get(row.ingredientId);
                  return (
                    <li key={row.key} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-2">
                      <select
                        aria-label="วัตถุดิบ"
                        value={row.ingredientId}
                        onChange={(e) => updateDraftRow(row.key, 'ingredientId', e.target.value)}
                        className="h-11 min-w-48 flex-1 rounded-xl border border-line bg-white px-3 outline-none focus:border-primary"
                      >
                        <option value="">— เลือกวัตถุดิบ —</option>
                        {ingredients.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.unit})
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label="ปริมาณต่อจาน"
                        inputMode="decimal"
                        value={row.quantity}
                        onChange={(e) => updateDraftRow(row.key, 'quantity', e.target.value)}
                        className="h-11 w-28 rounded-xl border border-line bg-white px-3 text-right tabular-nums outline-none focus:border-primary"
                        placeholder="0"
                      />
                      <span className="w-14 text-sm text-ink-muted">{ingredient?.unit ?? ''}/จาน</span>
                      <span className="hidden text-xs text-ink-muted sm:inline">
                        {ingredient && `คงเหลือ ${formatStockNumber(ingredient.current_stock)}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeDraftRow(row.key)}
                        className="ml-auto flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-danger-soft hover:text-danger"
                        aria-label="ลบแถวนี้"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {portionsAvailable !== null && (
              <p className={cn('text-sm font-semibold', portionsAvailable < 1 ? 'text-danger' : 'text-ink-muted')}>
                สต็อกตอนนี้ทำได้ประมาณ {formatStockNumber(portionsAvailable)} จาน
                {portionsAvailable < 1 && ' — เมนูจะแสดง "หมด" ให้ลูกค้าอัตโนมัติ'}
              </p>
            )}

            <AlertMessage>{pageError}</AlertMessage>
            <AlertMessage tone="success">{notice}</AlertMessage>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={Plus} onClick={addDraftRow}>
                เพิ่มวัตถุดิบ
              </Button>
              <Button icon={Save} className="ml-auto" isLoading={isSaving} onClick={handleSave}>
                บันทึกสูตร
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
