'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ChevronDown, ChevronUp, Check, X, Ban } from 'lucide-react';
import { getMenuItemsWithAvailability, toggleMenuAvailability } from './actions';
import { cn } from '@/lib/utils';

/**
 * ชื่อสถานีภาษาไทย
 */
const STATION_LABELS = {
  fresh: { label: 'ของสด', emoji: '🥩' },
  beverage: { label: 'เครื่องดื่ม', emoji: '🧃' },
  grill: { label: 'ปิ้งย่าง', emoji: '🔥' },
  hot_kitchen: { label: 'ครัวร้อน', emoji: '🍜' },
};

/**
 * ป้ายสถานะเมนู (Clean Minimal)
 */
function AvailabilityBadge({ availability }) {
  if (availability === 'available') {
    return (
      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        พร้อมขาย
      </span>
    );
  }
  if (availability === 'out_of_stock') {
    return (
      <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
        สต็อกหมด
      </span>
    );
  }
  if (availability === 'manual_off') {
    return (
      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
        ปิดชั่วคราว
      </span>
    );
  }
  return null;
}

/**
 * Section เมนูแยกตามสถานี — Clean Structure
 */
function StationSection({ stationKey, items, onToggle, pendingIds }) {
  const [isOpen, setIsOpen] = useState(true);
  const stationInfo = STATION_LABELS[stationKey] || { label: stationKey, emoji: '🍽️' };

  const closedCount = items.filter(
    (i) => i.availability_status === 'manual_off' || i.availability_status === 'out_of_stock'
  ).length;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Header สถานี */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50/80 hover:bg-gray-100/70 border-b border-gray-200 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{stationInfo.emoji}</span>
          <span className="text-base font-bold text-gray-800">{stationInfo.label}</span>
          <span className="text-xs text-gray-400 font-medium">({items.length} รายการ)</span>
          {closedCount > 0 && (
            <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
              ปิด {closedCount}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp size={18} className="text-gray-400" />
        ) : (
          <ChevronDown size={18} className="text-gray-400" />
        )}
      </button>

      {/* รายการเมนู */}
      {isOpen && (
        <ul className="divide-y divide-gray-100">
          {items.map((item) => {
            const isManualOff = item.availability_status === 'manual_off';
            const isOutOfStock = item.availability_status === 'out_of_stock';
            const isPending = pendingIds.has(item.id);
            const isDisabled = isOutOfStock || isPending;

            // out_of_stock = ระบบจัดการอัตโนมัติ — ห้าม Toggle ด้วยมือ
            const toggleNext = isManualOff ? 'available' : 'manual_off';

            return (
              <li
                key={item.id}
                className={cn(
                  'flex items-center gap-4 px-5 py-3.5 transition-colors',
                  isManualOff && 'bg-red-50/40',
                  isOutOfStock && 'bg-gray-50/60 opacity-60'
                )}
              >
                {/* ชื่อเมนู */}
                <div className="flex-1 min-w-0">
                  <span className={cn(
                    'text-base font-semibold block leading-snug',
                    isManualOff ? 'text-red-600' : isOutOfStock ? 'text-gray-400' : 'text-gray-900'
                  )}>
                    {item.name}
                  </span>
                  {item.categories?.name && (
                    <span className="text-xs text-gray-400 mt-0.5 block">{item.categories.name}</span>
                  )}
                </div>

                {/* Badge สถานะ */}
                <AvailabilityBadge availability={item.availability_status} />

                {/* ปุ่มสวิตช์ Toggle สะอาดตาและแตะง่าย */}
                <button
                  onClick={() => !isDisabled && onToggle(item.id, toggleNext)}
                  disabled={isDisabled}
                  title={
                    isOutOfStock
                      ? 'สต็อกหมด — จัดการโดยระบบอัตโนมัติ'
                      : isManualOff
                      ? 'แตะเพื่อเปิดขาย'
                      : 'แตะเพื่อปิดขายชั่วคราว'
                  }
                  className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all font-bold',
                    isDisabled
                      ? 'bg-gray-100 text-gray-300 cursor-not-allowed border border-gray-200'
                      : isManualOff
                      ? 'bg-red-500 text-white hover:bg-red-600 active:scale-95 shadow-sm'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 shadow-sm'
                  )}
                >
                  {isPending ? (
                    <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  ) : isOutOfStock ? (
                    <Ban size={18} className="text-gray-400" />
                  ) : isManualOff ? (
                    <X size={20} strokeWidth={2.5} />
                  ) : (
                    <Check size={20} strokeWidth={2.5} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * หน้า Stock Override — จัดการเปิด/ปิดเมนูด้วยมือ
 * ดึงและอัปเดตตรงไปยัง Supabase Database 100%
 */
export default function StockOverridePage() {
  const [menuItems, setMenuItems] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingIds, setPendingIds] = useState(new Set());

  // ดึงข้อมูลเมนูจริงจาก Database
  const loadMenuItems = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    try {
      const { menuItems: items, error } = await getMenuItemsWithAvailability();
      setMenuItems(items || []);
      setLoadError(error);
    } catch {
      setLoadError('เกิดข้อผิดพลาดในการโหลดข้อมูลเมนู');
    } finally {
      setIsLoading(false);
      if (isManualRefresh) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    getMenuItemsWithAvailability().then(({ menuItems: items, error }) => {
      if (!isMounted) return;
      setMenuItems(items || []);
      setLoadError(error);
      setIsLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Toggle เมนู
  const handleToggle = useCallback(async (menuItemId, newAvailability) => {
    if (pendingIds.has(menuItemId)) return;

    setPendingIds((prev) => new Set([...prev, menuItemId]));

    // Optimistic UI
    setMenuItems((prev) =>
      prev.map((item) =>
        item.id === menuItemId ? { ...item, availability_status: newAvailability } : item
      )
    );

    const { error } = await toggleMenuAvailability(menuItemId, newAvailability);

    if (error) {
      console.error('[StockOverridePage] Toggle Error:', error);
      await loadMenuItems(false);
    }

    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(menuItemId);
      return next;
    });
  }, [pendingIds, loadMenuItems]);

  // จัดกลุ่มตามสถานี
  const itemsByStation = menuItems.reduce((acc, item) => {
    const station = item.kitchen_station || 'other';
    if (!acc[station]) acc[station] = [];
    acc[station].push(item);
    return acc;
  }, {});

  const stationOrder = ['fresh', 'beverage', 'grill', 'hot_kitchen'];
  const sortedStations = [
    ...stationOrder.filter((s) => itemsByStation[s]),
    ...Object.keys(itemsByStation).filter((s) => !stationOrder.includes(s)),
  ];

  const totalClosedCount = menuItems.filter(
    (i) => i.availability_status === 'manual_off' || i.availability_status === 'out_of_stock'
  ).length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Clean Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span>🔧</span> จัดการเปิด/ปิดเมนู
              </h1>
            </div>
            {totalClosedCount > 0 ? (
              <p className="text-xs text-red-600 font-semibold mt-0.5">
                ปิดขายอยู่ {totalClosedCount} รายการ
              </p>
            ) : (
              <p className="text-xs text-emerald-600 font-medium mt-0.5">
                ทุกเมนูเปิดขายปกติ
              </p>
            )}
          </div>

          <button
            onClick={() => loadMenuItems(true)}
            disabled={isLoading || isRefreshing}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40"
            title="รีเฟรชข้อมูลจากฐานข้อมูล"
          >
            <RefreshCw size={16} className={cn(isRefreshing && 'animate-spin')} />
          </button>
        </div>

        {/* Legend อธิบายสัญลักษณ์ */}
        <div className="max-w-3xl mx-auto px-4 py-2 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5 font-medium text-emerald-700">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> เปิดขาย
          </span>
          <span className="flex items-center gap-1.5 font-medium text-red-600">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> ปิดชั่วคราว
          </span>
          <span className="flex items-center gap-1.5 text-gray-400">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" /> สต็อกหมด (ออโต้)
          </span>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 space-y-4">
        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin mb-3" />
            <p className="text-sm">กำลังโหลดข้อมูลเมนู...</p>
          </div>
        )}

        {/* Error */}
        {!isLoading && loadError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center max-w-md mx-auto my-10">
            <span className="text-3xl block mb-2">⚠️</span>
            <p className="text-sm font-semibold text-red-700 mb-4">{loadError}</p>
            <button
              onClick={() => loadMenuItems(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700"
            >
              ลองใหม่
            </button>
          </div>
        )}

        {/* ไม่มีเมนูใน Database */}
        {!isLoading && !loadError && menuItems.length === 0 && (
          <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center bg-white my-8">
            <span className="text-4xl block mb-2">📋</span>
            <p className="text-sm font-medium text-gray-600">ไม่พบรายการเมนูในฐานข้อมูล</p>
            <p className="text-xs text-gray-400 mt-1">กรุณาเพิ่มเมนูในตาราง menu_items</p>
          </div>
        )}

        {/* รายการเมนูแยกตามสถานี */}
        {!isLoading && !loadError && sortedStations.map((station) => (
          <StationSection
            key={station}
            stationKey={station}
            items={itemsByStation[station]}
            onToggle={handleToggle}
            pendingIds={pendingIds}
          />
        ))}
      </main>
    </div>
  );
}
