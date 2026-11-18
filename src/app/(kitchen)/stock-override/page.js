'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  Search,
  RotateCcw,
  Clock,
  AlertTriangle,
  SlidersHorizontal,
  Eye,
} from 'lucide-react';
import { getMenuItemsWithAvailability, toggleMenuAvailability } from './actions';
import { useKitchenRealtime } from '@/hooks/useKitchenRealtime';
import { cn } from '@/lib/utils';

// ─── รูปภาพตัวอย่างสำหรับเมนูชาบู (Fallback / Default Image) ───────────────
const PLACEHOLDER_IMAGES = {
  fresh: '🥩',
  beverage: '🧃',
  grill: '🔥',
  hot_kitchen: '🍜',
};

/**
 * ป้ายสถานะเมนู (KURO SHABU Style)
 */
function StatusBadge({ availability }) {
  if (availability === 'available') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        พร้อมขาย (In Stock)
      </span>
    );
  }
  if (availability === 'out_of_stock') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        สินค้าหมด (Out of Stock)
      </span>
    );
  }
  if (availability === 'manual_off') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        ปิดด้วยมือ (Manual Off)
      </span>
    );
  }
  return null;
}

/**
 * สวิตช์เปิด/ปิดเมนูแบบ Toggle Switch
 */
function ToggleSwitch({ isAvailable, isOutOfStock, isPending, onToggle }) {
  if (isOutOfStock) {
    return (
      <div
        className="w-14 h-8 rounded-full bg-gray-200 flex items-center justify-start px-1.5 cursor-not-allowed opacity-50"
        title="สต็อกหมดในระบบ ไม่สามารถเปิดขายได้"
      >
        <span className="w-5 h-5 rounded-full bg-white shadow-sm flex items-center justify-center text-[10px] text-gray-400 font-bold">
          ✕
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isPending}
      className={cn(
        'w-14 h-8 rounded-full transition-colors flex items-center px-1 shadow-inner relative',
        isAvailable ? 'bg-emerald-600 justify-end' : 'bg-gray-300 justify-start',
        isPending && 'opacity-60 cursor-wait'
      )}
      title={isAvailable ? 'กดเพื่อปิดขายเมนูนี้' : 'กดเพื่อเปิดขายเมนูนี้'}
    >
      <span
        className={cn(
          'w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center text-xs font-black transition-all transform',
          isAvailable ? 'text-emerald-600' : 'text-gray-400'
        )}
      >
        {isPending ? '…' : isAvailable ? '✓' : '✕'}
      </span>
    </button>
  );
}

/**
 * การ์ดเมนูอาหารแต่ละรายการ (Menu Item Card)
 */
function MenuItemCard({ item, isPending, onToggle }) {
  const isAvailable = item.availability_status === 'available';
  const isOutOfStock = item.availability_status === 'out_of_stock';
  const isManualOff = item.availability_status === 'manual_off';

  // รหัสเมนูสมมุติ หรือใช้ 3 ตัวแรก
  const itemCode = item.code || `M${item.id.slice(0, 3).toUpperCase()}`;
  const categoryName = item.categories?.name || 'เมนูบุฟเฟต์';
  const emoji = PLACEHOLDER_IMAGES[item.kitchen_station] || '🍲';

  return (
    <div
      className={cn(
        'bg-white rounded-2xl border p-4 shadow-sm transition-all flex flex-col justify-between gap-3',
        isAvailable
          ? 'border-gray-200 hover:border-emerald-200'
          : 'border-red-200 bg-red-50/20'
      )}
    >
      <div className="flex gap-4 items-start">
        {/* รูปอาหาร / รหัส */}
        <div className="relative w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center text-3xl flex-shrink-0 overflow-hidden border border-gray-200">
          <span>{emoji}</span>

          {/* ป้ายรหัสสินค้า */}
          <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-mono font-bold px-1.5 py-0.2 rounded">
            {itemCode}
          </span>

          {/* ป้ายทับเมื่อหมด */}
          {(isOutOfStock || isManualOff) && (
            <div className="absolute inset-0 bg-red-950/60 flex items-center justify-center">
              <span className="text-[10px] font-black text-white bg-red-600 px-2 py-0.5 rounded-full shadow">
                หมด
              </span>
            </div>
          )}
        </div>

        {/* ข้อมูลเมนู */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <StatusBadge availability={item.availability_status} />
          </div>

          <h3
            className={cn(
              'text-base font-bold leading-tight truncate',
              isAvailable ? 'text-gray-900' : 'text-gray-500'
            )}
            title={item.name}
          >
            {item.name}
          </h3>

          <p className="text-xs text-gray-400 mt-0.5 truncate">
            {categoryName}
          </p>

          {/* สถานะสต็อกโดยประมาณ */}
          <div className="mt-2 text-xs">
            {isAvailable ? (
              <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md inline-block">
                📦 สต็อกพร้อมเสิร์ฟ
              </span>
            ) : isManualOff ? (
              <span className="text-red-700 font-medium bg-red-50 px-2 py-0.5 rounded-md inline-block">
                🚫 ปิดด้วยมือชั่วคราว
              </span>
            ) : (
              <span className="text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded-md inline-block">
                ⚠️ วัตถุดิบหมด (ระบบตัดอัตโนมัติ)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* แถบด้านล่าง: สวิตช์เปิด/ปิด */}
      <div className="flex items-center justify-between border-t border-gray-100 pt-3 mt-1">
        <span className="text-xs text-gray-500 font-medium">
          {isAvailable ? 'เปิดขายอยู่' : 'ระงับการสั่ง'}
        </span>
        <ToggleSwitch
          isAvailable={isAvailable}
          isOutOfStock={isOutOfStock}
          isPending={isPending}
          onToggle={() => onToggle(item)}
        />
      </div>
    </div>
  );
}

/**
 * หน้าต่างกรอกเหตุผลก่อนปิดเมนู (บังคับตาม audit_matrix: MANUAL_OFF_MENU)
 */
function TurnOffReasonModal({ menuName, onConfirm, onClose }) {
  const [reasonText, setReasonText] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-full max-w-sm">
        <h3 className="text-base font-bold text-gray-900 mb-1">ปิดขายเมนู</h3>
        <p className="text-sm text-gray-600 mb-4">
          เมนู: <span className="font-semibold text-gray-900">{menuName}</span>
        </p>

        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          เหตุผลในการปิดเมนู <span className="text-red-500">*</span>
        </label>
        <textarea
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400 h-24"
          placeholder="เช่น วัตถุดิบหมดจริง, ของไม่สด..."
          value={reasonText}
          onChange={(e) => setReasonText(e.target.value)}
          autoFocus
        />

        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => onConfirm(reasonText.trim())}
            disabled={!reasonText.trim()}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ยืนยันปิดเมนู
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * หน้าจัดการเปิด/ปิดเมนูอาหาร (Stock Override) — KURO SHABU
 */
export default function StockOverridePage() {
  const [menuItems, setMenuItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // การค้นหาและตัวกรอง
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [onlyOutOfStock, setOnlyOutOfStock] = useState(false);

  // ชุด ID ที่กำลังบันทึก (Optimistic UI)
  const [pendingIds, setPendingIds] = useState(new Set());

  // เมนูที่กำลังจะปิด (แสดง Modal กรอกเหตุผล)
  const [itemToTurnOff, setItemToTurnOff] = useState(null);

  // นาฬิกา
  const [clockString, setClockString] = useState('');
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setClockString(
        now.toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // โหลดข้อมูลเมนู
  const loadMenuItems = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    setLoadError(null);

    const { menuItems: fetchedItems, error } = await getMenuItemsWithAvailability();

    if (error) {
      setLoadError(error);
    } else {
      setMenuItems(fetchedItems || []);
    }

    setIsLoading(false);
    if (isManual) setIsRefreshing(false);
  }, []);

  useEffect(() => {
    let isCurrent = true;
    getMenuItemsWithAvailability().then(({ menuItems: fetchedItems, error }) => {
      if (!isCurrent) return;
      if (error) {
        setLoadError(error);
      } else {
        setMenuItems(fetchedItems || []);
      }
      setIsLoading(false);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  // ดักฟัง Realtime การเปลี่ยนแปลงเมนู
  useKitchenRealtime({
    onMenuChange: () => loadMenuItems(false),
  });

  // บันทึกสถานะใหม่ลง DB (Optimistic UI)
  const applyAvailability = useCallback(
    async (item, nextStatus, reason = null) => {
      setPendingIds((prev) => new Set(prev).add(item.id));
      setMenuItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, availability_status: nextStatus } : i
        )
      );

      const { success, error } = await toggleMenuAvailability(item.id, nextStatus, reason);

      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });

      if (!success) {
        // คืนค่าเดิมถ้า error
        setMenuItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, availability_status: item.availability_status } : i
          )
        );
        alert(error || 'ไม่สามารถอัปเดตสถานะเมนูได้');
      }
    },
    []
  );

  // Toggle เปิด/ปิดเมนู — ปิดเมนูต้องกรอกเหตุผลก่อน (MANUAL_OFF_MENU)
  const handleToggle = useCallback(
    (item) => {
      if (item.availability_status === 'out_of_stock') return;
      if (pendingIds.has(item.id)) return;

      if (item.availability_status === 'manual_off') {
        applyAvailability(item, 'available');
      } else {
        setItemToTurnOff(item);
      }
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

  // ─── คำนวณสรุปสถิติตัวเลข ──────────────────────────────────────
  const stats = useMemo(() => {
    const total = menuItems.length;
    const ready = menuItems.filter((i) => i.availability_status === 'available').length;
    const outOfStock = menuItems.filter(
      (i) => i.availability_status === 'out_of_stock' || i.availability_status === 'manual_off'
    ).length;

    return { total, ready, outOfStock };
  }, [menuItems]);

  // หมวดหมู่ทั้งหมดสำหรับทำแถบ Filter Pills
  const categories = useMemo(() => {
    const map = new Map();
    for (const item of menuItems) {
      const cat = item.categories?.name || 'อื่นๆ';
      map.set(cat, (map.get(cat) || 0) + 1);
    }
    return Array.from(map.entries());
  }, [menuItems]);

  // กรองรายการเมนูตาม Search, Category, OutOfStock
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      // ค้นหาตามชื่อ
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = item.name?.toLowerCase().includes(query);
        if (!nameMatch) return false;
      }

      // กรองหมวดหมู่
      if (selectedCategory !== 'all') {
        const itemCat = item.categories?.name || 'อื่นๆ';
        if (itemCat !== selectedCategory) return false;
      }

      // กรองเฉพาะที่หมด
      if (onlyOutOfStock) {
        if (item.availability_status === 'available') return false;
      }

      return true;
    });
  }, [menuItems, searchQuery, selectedCategory, onlyOutOfStock]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-24 flex flex-col font-sans">
      {/* Modal กรอกเหตุผลปิดเมนู */}
      {itemToTurnOff && (
        <TurnOffReasonModal
          menuName={itemToTurnOff.name}
          onConfirm={handleConfirmTurnOff}
          onClose={() => setItemToTurnOff(null)}
        />
      )}

      {/* ═══ 1. แถบหัวเว็บ KURO SHABU (Crimson Bar) ═══ */}
      <header className="bg-[#7F1D1D] text-white shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl shadow-inner">
              🍲
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-base tracking-wide">
                  คุโระ ชาบู (KURO SHABU)
                </span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-bold">
                  ● ออนไลน์
                </span>
              </div>
              <p className="text-xs text-red-200">ครัว — เปิด/ปิดเมนู</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-xl border border-white/10">
              <Clock size={16} className="text-red-300" />
              <span className="font-mono font-bold text-sm text-white tracking-wider">
                {clockString || '00:00:00'}
              </span>
            </div>

            <button
              onClick={() => loadMenuItems(true)}
              disabled={isLoading || isRefreshing}
              className="p-2 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors disabled:opacity-40"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw
                size={18}
                className={cn(isRefreshing && 'animate-spin')}
              />
            </button>
          </div>
        </div>
      </header>

      {/* ═══ 2. แบนเนอร์หัวเรื่องการจัดการเมนู ═══ */}
      <section className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-2xl flex-shrink-0">
              🚫
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-gray-900">
                  จัดการเมนูอาหารหมด ({stats.total} Items Management)
                </h1>
                <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                  ● ซิงค์ระบบลูกค้า: อัตโนมัติ (Online)
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">
                ระบบตัดสต็อกและระงับการสั่งอัตโนมัติแบบเรียลไทม์; เมื่อปิดเมนู หน้าสั่งอาหารของลูกค้าจะแสดงสถานะ &quot;หมด&quot; และกดสั่งไม่ได้ทันที
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 3. แถบสรุปสถิติตัวเลข (Stats Row) ═══ */}
      <section className="max-w-7xl mx-auto px-4 pt-4 w-full">
        <div className="grid grid-cols-3 gap-3">
          {/* ทั้งหมด */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
            <span className="text-xs text-gray-500 font-medium block">
              เมนูทั้งหมดในระบบ
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-gray-900">
                {stats.total}
              </span>
              <span className="text-xs text-gray-400">รายการ</span>
            </div>
          </div>

          {/* พร้อมเสิร์ฟ */}
          <div className="bg-white border border-emerald-200 bg-emerald-50/20 rounded-2xl p-4 shadow-sm">
            <span className="text-xs text-emerald-700 font-bold block">
              พร้อมเสิร์ฟปกติ
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-emerald-600">
                {stats.ready}
              </span>
              <span className="text-xs text-emerald-500">รายการ</span>
            </div>
          </div>

          {/* สินค้าหมด */}
          <div
            className={cn(
              'border rounded-2xl p-4 shadow-sm transition-all',
              stats.outOfStock > 0
                ? 'bg-red-50 border-red-300'
                : 'bg-white border-gray-200'
            )}
          >
            <span
              className={cn(
                'text-xs font-bold block',
                stats.outOfStock > 0 ? 'text-red-700' : 'text-gray-500'
              )}
            >
              สินค้าหมด / ปิดขาย
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span
                className={cn(
                  'text-3xl font-black',
                  stats.outOfStock > 0 ? 'text-red-600' : 'text-gray-400'
                )}
              >
                {stats.outOfStock}
              </span>
              <span
                className={cn(
                  'text-xs',
                  stats.outOfStock > 0 ? 'text-red-500 font-semibold' : 'text-gray-400'
                )}
              >
                รายการ
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 4. ช่องค้นหา & แถบกรองหมวดหมู่ (Search & Filters) ═══ */}
      <section className="max-w-7xl mx-auto px-4 pt-4 w-full space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* ช่องค้นหา */}
          <div className="relative flex-1 max-w-md">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="ค้นหาชื่อเมนู, รหัสอาหาร เช่น วากิว, ลิ้นวัว..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#7F1D1D] focus:border-[#7F1D1D] shadow-sm"
            />
          </div>

          {/* ปุ่มตัวกรองเฉพาะสินค้าหมด */}
          <button
            onClick={() => setOnlyOutOfStock((prev) => !prev)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border shadow-sm',
              onlyOutOfStock
                ? 'bg-red-600 border-red-600 text-white'
                : 'bg-white border-gray-200 text-gray-700 hover:border-red-300'
            )}
          >
            <AlertTriangle size={15} />
            <span>แสดงเฉพาะรายการที่หมด ({stats.outOfStock})</span>
          </button>
        </div>

        {/* แถบ Category Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('all')}
            className={cn(
              'flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all border',
              selectedCategory === 'all'
                ? 'bg-[#7F1D1D] border-[#7F1D1D] text-white shadow-sm'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            )}
          >
            ทั้งหมด ({stats.total})
          </button>
          {categories.map(([catName, count]) => (
            <button
              key={catName}
              onClick={() => setSelectedCategory(catName)}
              className={cn(
                'flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all border',
                selectedCategory === catName
                  ? 'bg-[#7F1D1D] border-[#7F1D1D] text-white shadow-sm'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              )}
            >
              {catName} ({count})
            </button>
          ))}
        </div>
      </section>

      {/* ═══ 5. รายการเมนูแบบ Grid (Menu Grid) ═══ */}
      <main className="max-w-7xl w-full mx-auto p-4 flex-1">
        {/* กำลังโหลด */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-[#7F1D1D] rounded-full animate-spin mb-3" />
            <p className="text-sm font-semibold text-gray-600">
              กำลังโหลดข้อมูลเมนู...
            </p>
          </div>
        )}

        {/* ข้อผิดพลาด */}
        {!isLoading && loadError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center max-w-md mx-auto my-10">
            <p className="text-sm font-bold text-red-700 mb-4">{loadError}</p>
            <button
              onClick={() => loadMenuItems(true)}
              className="px-4 py-2 bg-[#7F1D1D] text-white rounded-xl text-xs font-bold hover:bg-red-800"
            >
              ลองใหม่
            </button>
          </div>
        )}

        {/* ผลการค้นหาว่างเปล่า */}
        {!isLoading && !loadError && filteredItems.length === 0 && (
          <div className="border-2 border-dashed border-gray-200 rounded-3xl p-16 text-center bg-white my-8">
            <span className="text-4xl block mb-2">📋</span>
            <p className="text-sm font-bold text-gray-700">
              ไม่พบรายการเมนูที่ตรงกับเงื่อนไข
            </p>
            <p className="text-xs text-gray-400 mt-1">
              ลองเปลี่ยนคำค้นหา หรือรีเซ็ตตัวกรอง
            </p>
          </div>
        )}

        {/* Grid เมนู 2 คอลัมน์บนจอใหญ่ */}
        {!isLoading && !loadError && filteredItems.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredItems.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                isPending={pendingIds.has(item.id)}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
