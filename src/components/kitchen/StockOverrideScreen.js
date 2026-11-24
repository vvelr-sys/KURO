'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CircleCheck, CircleOff, LayoutGrid, PackageX, RefreshCw, Search } from 'lucide-react';
import { AlertMessage, Button, Modal } from '@/components/ui';
import { getMenuItemsWithAvailability, toggleMenuAvailability } from '@/app/(kitchen)/stock-override/actions';
import { useKitchenRealtime } from '@/hooks/useKitchenRealtime';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';

const STATION_DISPLAY = {
  fresh: 'ของสด',
  beverage: 'เครื่องดื่ม',
  grill: 'ปิ้งย่าง',
  hot_kitchen: 'ครัวร้อน',
};

// ป้ายสถานะเมนู: สี + ข้อความเสมอ (ไม่ใช้สีอย่างเดียว)
const AVAILABILITY_DISPLAY = {
  available: { label: 'พร้อมขาย', className: 'bg-emerald-100 text-emerald-800' },
  manual_off: { label: 'ปิดด้วยมือ', className: 'bg-danger-soft text-danger' },
  out_of_stock: { label: 'วัตถุดิบหมด', className: 'bg-line text-ink-muted' },
};

/**
 * สวิตช์เปิด/ปิดเมนู (เมนูที่วัตถุดิบหมด ระบบปิดเอง — กดไม่ได้)
 * @param {{ item: object, isPending: boolean, onToggle: (item: object) => void }} props
 */
function AvailabilitySwitch({ item, isPending, onToggle }) {
  const isAvailable = item.availability_status === 'available';
  const isOutOfStock = item.availability_status === 'out_of_stock';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isAvailable}
      aria-label={`${isAvailable ? 'ปิดขาย' : 'เปิดขาย'} ${item.name}`}
      onClick={() => onToggle(item)}
      disabled={isOutOfStock || isPending}
      title={isOutOfStock ? 'วัตถุดิบหมดในระบบ เปิดขายด้วยมือไม่ได้' : undefined}
      className={cn(
        'relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed',
        isAvailable ? 'bg-emerald-800' : 'bg-line',
        isOutOfStock && 'opacity-50',
        isPending && 'cursor-wait opacity-60'
      )}
    >
      <span
        className={cn(
          'absolute top-1 size-6 rounded-full bg-white shadow transition-all',
          isAvailable ? 'left-7' : 'left-1'
        )}
      />
    </button>
  );
}

/**
 * การ์ดเมนู 1 รายการ (memo ไว้ — Realtime อัปเดตบ่อย)
 * @param {{ item: object, isPending: boolean, onToggle: (item: object) => void }} props
 */
const MenuItemCard = React.memo(function MenuItemCard({ item, isPending, onToggle }) {
  const status = AVAILABILITY_DISPLAY[item.availability_status] ?? AVAILABILITY_DISPLAY.available;
  const isAvailable = item.availability_status === 'available';

  return (
    <article className={cn('flex items-center gap-4 rounded-3xl bg-white p-4 shadow-sm', !isAvailable && 'ring-1 ring-danger-soft')}>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-lg font-bold', !isAvailable && 'text-ink-muted')} title={item.name}>
          {item.name}
        </p>
        <p className="text-sm text-ink-muted">
          {item.categories?.name ?? 'อื่นๆ'}
          {STATION_DISPLAY[item.kitchen_station] && ` · ${STATION_DISPLAY[item.kitchen_station]}`}
        </p>
        <span className={cn('mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold', status.className)}>
          {status.label}
        </span>
      </div>
      <AvailabilitySwitch item={item} isPending={isPending} onToggle={onToggle} />
    </article>
  );
});

/**
 * หน้าต่างกรอกเหตุผลก่อนปิดเมนู (บังคับตาม audit_matrix: MANUAL_OFF_MENU)
 * @param {{ menuName: string, onConfirm: (reason: string) => void, onClose: () => void }} props
 */
function TurnOffReasonModal({ menuName, onConfirm, onClose }) {
  const [reasonText, setReasonText] = useState('');
  const trimmedReason = reasonText.trim();

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="ปิดขายเมนู"
      description={menuName}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button variant="danger" className="flex-1" disabled={!trimmedReason} onClick={() => onConfirm(trimmedReason)}>
            ยืนยันปิดเมนู
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5">
        <span className="font-semibold">
          เหตุผลในการปิดเมนู <span className="text-danger">*</span>
        </span>
        <textarea
          className="h-24 resize-none rounded-xl border border-line px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="เช่น วัตถุดิบหมดจริง, ของไม่สด..."
          value={reasonText}
          onChange={(event) => setReasonText(event.target.value)}
          autoFocus
        />
      </label>
    </Modal>
  );
}

/**
 * หน้าเปิด/ปิดเมนู (Stock Override — FR-023) แสดงภายในโครงหน้า StaffShell
 * ตรวจสิทธิ์ที่ page.js แล้ว (requireRole) — Server Action ตรวจซ้ำอีกชั้น
 */
export default function StockOverrideScreen() {
  const [menuItems, setMenuItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pageError, setPageError] = useState(null);

  // การค้นหาและตัวกรอง (ค้นหาหน่วง 200ms ตามกฎ Web Performance)
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounce(searchText, 200);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [onlyUnavailable, setOnlyUnavailable] = useState(false);

  // ชุด ID ที่กำลังบันทึก (Optimistic UI) และเมนูที่กำลังจะปิด
  const [pendingIds, setPendingIds] = useState(new Set());
  const [itemToTurnOff, setItemToTurnOff] = useState(null);

  // โหลดข้อมูลเมนู
  const loadMenuItems = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    const { menuItems: fetchedItems, error } = await getMenuItemsWithAvailability();
    if (error) setPageError(error);
    else {
      setPageError(null);
      setMenuItems(fetchedItems || []);
    }
    setIsLoading(false);
    if (isManual) setIsRefreshing(false);
  }, []);

  useEffect(() => {
    let isCurrent = true;
    getMenuItemsWithAvailability().then(({ menuItems: fetchedItems, error }) => {
      if (!isCurrent) return;
      if (error) setPageError(error);
      else setMenuItems(fetchedItems || []);
      setIsLoading(false);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  // Realtime: เมนูเปลี่ยนสถานะ (จากเครื่องอื่น / ระบบตัดอัตโนมัติ) → โหลดใหม่
  useKitchenRealtime({ onMenuChange: () => loadMenuItems(false) });

  // บันทึกสถานะใหม่ลง DB (Optimistic UI — ถ้าพลาดคืนค่าเดิมและแจ้งในหน้า)
  const applyAvailability = useCallback(async (item, nextStatus, reason = null) => {
    setPageError(null);
    setPendingIds((prev) => new Set(prev).add(item.id));
    setMenuItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, availability_status: nextStatus } : i)));

    const { success, error } = await toggleMenuAvailability(item.id, nextStatus, reason);

    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });

    if (!success) {
      setMenuItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, availability_status: item.availability_status } : i))
      );
      setPageError(`${item.name}: ${error || 'ไม่สามารถอัปเดตสถานะเมนูได้'}`);
    }
  }, []);

  // เปิดเมนูกดได้ทันที / ปิดเมนูต้องกรอกเหตุผลก่อน (MANUAL_OFF_MENU)
  const handleToggle = useCallback(
    (item) => {
      if (item.availability_status === 'out_of_stock' || pendingIds.has(item.id)) return;
      if (item.availability_status === 'manual_off') applyAvailability(item, 'available');
      else setItemToTurnOff(item);
    },
    [pendingIds, applyAvailability]
  );

  const handleConfirmTurnOff = useCallback(
    async (reason) => {
      if (!itemToTurnOff) return;
      const item = itemToTurnOff;
      setItemToTurnOff(null);
      await applyAvailability(item, 'manual_off', reason);
    },
    [itemToTurnOff, applyAvailability]
  );

  // ─── สรุปตัวเลข ────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = menuItems.length;
    const ready = menuItems.filter((i) => i.availability_status === 'available').length;
    return { total, ready, unavailable: total - ready };
  }, [menuItems]);

  // หมวดหมู่สำหรับตัวกรอง
  const categories = useMemo(() => {
    const map = new Map();
    for (const item of menuItems) {
      const categoryName = item.categories?.name || 'อื่นๆ';
      map.set(categoryName, (map.get(categoryName) || 0) + 1);
    }
    return Array.from(map.entries());
  }, [menuItems]);

  // กรองตามคำค้น หมวดหมู่ และเฉพาะที่ปิดขาย
  const filteredItems = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    return menuItems.filter((item) => {
      if (query && !item.name?.toLowerCase().includes(query)) return false;
      if (selectedCategory !== 'all' && (item.categories?.name || 'อื่นๆ') !== selectedCategory) return false;
      if (onlyUnavailable && item.availability_status === 'available') return false;
      return true;
    });
  }, [menuItems, debouncedSearch, selectedCategory, onlyUnavailable]);

  const summaryCards = [
    { label: 'เมนูทั้งหมด', value: stats.total, icon: LayoutGrid, iconClass: 'bg-surface text-ink' },
    { label: 'พร้อมขาย', value: stats.ready, icon: CircleCheck, iconClass: 'bg-emerald-800 text-white' },
    {
      label: 'หมด / ปิดขาย',
      value: stats.unavailable,
      icon: PackageX,
      iconClass: 'bg-danger-soft text-danger',
      highlight: stats.unavailable > 0,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {itemToTurnOff && (
        <TurnOffReasonModal
          menuName={itemToTurnOff.name}
          onConfirm={handleConfirmTurnOff}
          onClose={() => setItemToTurnOff(null)}
        />
      )}

      {/* ═══ หัวเรื่อง + ปุ่มโหลดใหม่ ═══ */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">เปิด/ปิดเมนู</h1>
          <p className="text-sm text-ink-muted">
            ปิดเมนูแล้ว หน้าสั่งอาหารของลูกค้าจะแสดง &quot;หมด&quot; และกดสั่งไม่ได้ทันที · เมนูที่วัตถุดิบหมด ระบบปิดให้อัตโนมัติ
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadMenuItems(true)}
          disabled={isLoading || isRefreshing}
          className="flex size-11 items-center justify-center rounded-full bg-white shadow-sm hover:bg-surface disabled:opacity-40"
          aria-label="โหลดข้อมูลใหม่"
          title="โหลดข้อมูลใหม่"
        >
          <RefreshCw className={cn('size-5', isRefreshing && 'animate-spin')} aria-hidden />
        </button>
      </div>

      {/* ═══ การ์ดสรุป ═══ */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summaryCards.map(({ label, value, icon: Icon, iconClass, highlight }) => (
          <div key={label} className={cn('flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm', highlight && 'ring-2 ring-danger')}>
            <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl', iconClass)}>
              <Icon className="size-6" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-sm text-ink-muted">{label}</p>
              <p className="text-2xl font-bold">
                {value} <span className="text-sm font-normal text-ink-muted">เมนู</span>
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ ค้นหา + ตัวกรอง ═══ */}
      <div className="flex flex-col gap-3 rounded-3xl bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-60 flex-1">
            <span className="sr-only">ค้นหาเมนู</span>
            <Search className="absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input
              type="search"
              placeholder="ค้นหาชื่อเมนู..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="h-11 w-full rounded-xl border border-line pl-11 pr-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <button
            type="button"
            onClick={() => setOnlyUnavailable((prev) => !prev)}
            aria-pressed={onlyUnavailable}
            className={cn(
              'flex h-11 items-center gap-1.5 rounded-full px-4 font-semibold transition-colors',
              onlyUnavailable ? 'bg-danger text-white' : 'bg-surface text-ink hover:bg-primary/5'
            )}
          >
            <CircleOff className="size-4" aria-hidden />
            เฉพาะที่หมด/ปิดขาย ({stats.unavailable})
          </button>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="เลือกหมวดหมู่">
          {[['all', stats.total], ...categories].map(([categoryName, count]) => (
            <button
              key={categoryName}
              type="button"
              onClick={() => setSelectedCategory(categoryName)}
              aria-pressed={selectedCategory === categoryName}
              className={cn(
                'flex h-11 items-center gap-1.5 rounded-full px-4 font-semibold transition-colors',
                selectedCategory === categoryName ? 'bg-primary text-white' : 'bg-surface text-ink hover:bg-primary/5'
              )}
            >
              {categoryName === 'all' ? 'ทั้งหมด' : categoryName}
              <span className="text-sm opacity-80">({count})</span>
            </button>
          ))}
        </div>
      </div>

      <AlertMessage>{pageError}</AlertMessage>

      {/* ═══ รายการเมนู ═══ */}
      {isLoading ? (
        <div className="h-64 animate-pulse rounded-3xl bg-white" aria-hidden />
      ) : filteredItems.length === 0 ? (
        <p className="rounded-3xl bg-white p-10 text-center text-ink-muted">ไม่พบเมนูที่ตรงกับเงื่อนไข</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map((item) => (
            <MenuItemCard key={item.id} item={item} isPending={pendingIds.has(item.id)} onToggle={handleToggle} />
          ))}
        </div>
      )}
    </div>
  );
}
