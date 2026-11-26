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

  // สูตรที่บันทึกไว้ของเมนูที่เลือก → เทียบกับที่แก้อยู่ เพื่อบอกว่า "ยังไม่บันทึก"
  const hasUnsavedChanges = useMemo(() => {
    if (!selectedMenuId) return false;
    const toKey = (list) =>
      list
        .map((row) => `${row.ingredientId}:${Number(row.quantity)}`)
        .sort()
        .join('|');
    const savedRows = bomRows
      .filter((row) => row.menu_item_id === selectedMenuId)
      .map((row) => ({ ingredientId: row.ingredient_id, quantity: row.quantity_required }));
    return toKey(savedRows) !== toKey(draftRows);
  }, [bomRows, draftRows, selectedMenuId]);

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
    <div className="grid items-start gap-4 lg:grid-cols-[20rem_1fr]">
      {/* ─── รายการเมนู (ติดอยู่กับที่ตอนเลื่อนหน้า) ─── */}
      <section className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm lg:sticky lg:top-24">
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
        <p className="px-1 text-sm text-ink-muted">{visibleMenus.length} เมนู</p>
        <ul className="-mx-1 flex max-h-[60vh] flex-col gap-1 overflow-y-auto px-1">
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
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate font-semibold">{menu.name}</span>
                    {menu.categories?.name && (
                      <span className={cn('block truncate text-xs', isSelected ? 'text-white/75' : 'text-ink-muted')}>{menu.categories.name}</span>
                    )}
                  </span>
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
            <div className="flex flex-wrap items-start gap-3 border-b border-line pb-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold">{selectedMenu.name}</h2>
                <p className="text-sm text-ink-muted">
                  {selectedMenu.categories?.name && `${selectedMenu.categories.name} · `}ปริมาณวัตถุดิบที่ใช้ต่อ 1 จาน · ระบบตัดสต็อกตามนี้เมื่อครัวกดเริ่มทำ
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {portionsAvailable !== null && (
                  <span
                    className={cn(
                      'rounded-full px-3 py-1 text-sm font-bold tabular-nums',
                      portionsAvailable < 1 ? 'bg-danger-soft text-danger' : 'bg-surface text-ink'
                    )}
                    title="คำนวณจากวัตถุดิบที่เหลือน้อยที่สุดในสูตร"
                  >
                    ทำได้ ~{formatStockNumber(portionsAvailable)} จาน
                  </span>
                )}
                <span
                  className={cn(
                    'rounded-full px-3 py-1 text-sm font-bold',
                    AVAILABILITY_DISPLAY[selectedMenu.availability_status]?.className
                  )}
                >
                  {AVAILABILITY_DISPLAY[selectedMenu.availability_status]?.label}
                </span>
              </div>
            </div>

            {draftRows.length === 0 ? (
              <p className="rounded-2xl bg-surface p-6 text-center text-ink-muted">
                เมนูนี้ยังไม่มีสูตร — ครัวกดทำแล้วจะไม่ตัดสต็อก
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {/* หัวคอลัมน์ (จอกว้าง) */}
                <div className="hidden grid-cols-[minmax(0,1fr)_10rem_9rem_2.5rem] gap-3 px-3 text-xs font-semibold text-ink-muted md:grid">
                  <span>วัตถุดิบ</span>
                  <span className="text-right">ใช้ต่อจาน</span>
                  <span className="text-right">คงเหลือ / ทำได้</span>
                  <span />
                </div>
                <ul className="flex flex-col gap-2">
                  {draftRows.map((row) => {
                    const ingredient = ingredientById.get(row.ingredientId);
                    const quantity = Number(row.quantity);
                    // วัตถุดิบตัวนี้ตัวเดียวพอทำกี่จาน
                    const portionsFromThis = ingredient && quantity > 0 ? Math.floor(Number(ingredient.current_stock) / quantity) : null;
                    return (
                      <li
                        key={row.key}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl bg-surface p-2 md:grid-cols-[minmax(0,1fr)_10rem_9rem_2.5rem] md:gap-3"
                      >
                        <select
                          aria-label="วัตถุดิบ"
                          value={row.ingredientId}
                          onChange={(e) => updateDraftRow(row.key, 'ingredientId', e.target.value)}
                          className="col-span-2 h-11 w-full rounded-xl border border-line bg-white px-3 outline-none focus:border-primary md:col-span-1"
                        >
                          <option value="">— เลือกวัตถุดิบ —</option>
                          {ingredients.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ({item.unit})
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-2">
                          <input
                            aria-label="ปริมาณต่อจาน"
                            inputMode="decimal"
                            value={row.quantity}
                            onChange={(e) => updateDraftRow(row.key, 'quantity', e.target.value)}
                            className="h-11 w-full min-w-0 rounded-xl border border-line bg-white px-3 text-right tabular-nums outline-none focus:border-primary"
                            placeholder="0"
                          />
                          <span className="w-10 shrink-0 text-sm text-ink-muted">{ingredient?.unit ?? ''}</span>
                        </label>
                        <p className="text-right text-sm leading-tight tabular-nums">
                          {ingredient ? (
                            <>
                              <span className="block text-ink-muted">
                                เหลือ {formatStockNumber(ingredient.current_stock)} {ingredient.unit}
                              </span>
                              {portionsFromThis !== null && (
                                <span className={cn('block font-semibold', portionsFromThis < 1 ? 'text-danger' : 'text-ink')}>
                                  ทำได้ {formatStockNumber(portionsFromThis)} จาน
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-ink-muted">—</span>
                          )}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeDraftRow(row.key)}
                          className="flex size-10 items-center justify-center justify-self-end rounded-full text-ink-muted hover:bg-danger-soft hover:text-danger"
                          aria-label="ลบแถวนี้"
                          title="ลบแถวนี้"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {portionsAvailable !== null && portionsAvailable < 1 && (
              <p className="text-sm font-semibold text-danger">วัตถุดิบไม่พอทำ 1 จาน — เมนูจะแสดง &ldquo;หมด&rdquo; ให้ลูกค้าอัตโนมัติ</p>
            )}

            <AlertMessage>{pageError}</AlertMessage>
            <AlertMessage tone="success">{notice}</AlertMessage>

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <Button variant="secondary" icon={Plus} onClick={addDraftRow}>
                เพิ่มวัตถุดิบ
              </Button>
              {hasUnsavedChanges && <span className="ml-auto rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">ยังไม่บันทึก</span>}
              <Button icon={Save} className={cn(!hasUnsavedChanges && 'ml-auto')} isLoading={isSaving} disabled={!hasUnsavedChanges} onClick={handleSave}>
                บันทึกสูตร
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
