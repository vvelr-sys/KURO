'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { Lock, Search, ShoppingBasket, X } from 'lucide-react';
import { AlertMessage } from '@/components/ui';
import BrandLogo from '@/components/layout/BrandLogo';
import { useCurrentTimeSelector } from '@/hooks/useCurrentTime';
import { useDebounce } from '@/hooks/useDebounce';
import { useMenuAvailabilityRealtime } from '@/hooks/useMenuAvailabilityRealtime';
import { placeCustomerOrder } from '@/app/order/[tableNumber]/actions';
import { cn } from '@/lib/utils';
import { changeCartQuantity, countByMenuItem, makeCartKey, mergeCarts } from './cart';
import CartSheet from './CartSheet';
import MenuCard from './MenuCard';
import OptionPickerModal from './OptionPickerModal';
import OrderTimer from './OrderTimer';

/**
 * หน้าจอสั่งอาหารของลูกค้า (1.2): ตัวนับเวลา + ค้นหา + หมวดหมู่ + การ์ดเมนู + ตะกร้า
 * - ล็อกการสั่งทันทีเมื่อครบเวลา (FR-015) หรือรอบไม่ active แล้ว (เชิญออก / ออกบิล)
 * - เมนูหมดเปลี่ยนป้าย "หมด" แบบ Realtime
 * - ส่งออเดอร์แบบ Optimistic: ล้างตะกร้าทันที ถ้าส่งไม่สำเร็จคืนรายการกลับเข้าตะกร้า
 * @param {Object} props
 * @param {string} props.tableNumber
 * @param {import('@/lib/customer-session').CustomerSession} props.session
 * @param {import('@/app/order/[tableNumber]/data').CustomerMenuCategory[]} props.categories
 */
export default function OrderScreen({ tableNumber, session, categories }) {
  // ---------- เมนู + สถานะล่าสุดจาก Realtime ----------
  const menuById = useMemo(() => {
    const map = new Map();
    for (const category of categories) for (const item of category.items) map.set(item.id, item);
    return map;
  }, [categories]);

  const [availabilityById, setAvailabilityById] = useState(/** @type {Record<string, string>} */ ({}));
  const handleAvailabilityChange = useCallback((menuItemId, availability) => {
    setAvailabilityById((current) =>
      current[menuItemId] === availability ? current : { ...current, [menuItemId]: availability }
    );
  }, []);
  useMenuAvailabilityRealtime(handleAvailabilityChange);

  const getAvailability = useCallback(
    (menuItemId) => availabilityById[menuItemId] ?? menuById.get(menuItemId)?.availability ?? 'manual_off',
    [availabilityById, menuById]
  );

  // ---------- เวลา / การล็อก ----------
  const expiresAtMs = session.expiresAt ? Date.parse(session.expiresAt) : null;
  // render ใหม่เฉพาะตอน "ยังไม่หมด → หมดเวลา" ไม่ใช่ทุกวินาที
  const isExpired = useCurrentTimeSelector((now) => now !== null && expiresAtMs !== null && now >= expiresAtMs);
  const isClosedByStaff = session.status !== 'active';
  const isLocked = isClosedByStaff || isExpired || expiresAtMs === null;

  // ---------- ค้นหา + หมวดหมู่ ----------
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounce(searchText.trim().toLowerCase(), 200);
  const [selectedCategoryId, setSelectedCategoryId] = useState(/** @type {string|null} */ (null));

  const visibleCategories = useMemo(() => {
    return categories
      .filter((category) => debouncedSearch || !selectedCategoryId || category.id === selectedCategoryId)
      .map((category) => ({
        ...category,
        items: debouncedSearch
          ? category.items.filter((item) => item.name.toLowerCase().includes(debouncedSearch))
          : category.items,
      }))
      .filter((category) => category.items.length > 0);
  }, [categories, debouncedSearch, selectedCategoryId]);

  // ---------- ตะกร้า ----------
  const [cart, setCart] = useState(/** @type {Record<string, import('./cart').CartLine>} */ ({}));
  const [pickerItem, setPickerItem] = useState(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const countsByMenu = useMemo(() => countByMenuItem(cart), [cart]);

  const handleAdd = useCallback((item) => {
    if (item.options.length > 0) {
      setPickerItem(item);
      return;
    }
    setCart((current) =>
      changeCartQuantity(current, { key: item.id, menuItemId: item.id, optionIds: [], optionLabel: '' }, 1)
    );
  }, []);

  const handleRemove = useCallback((item) => {
    setCart((current) =>
      changeCartQuantity(current, { key: item.id, menuItemId: item.id, optionIds: [], optionLabel: '' }, -1)
    );
  }, []);

  const handleOptionConfirm = (optionIds, optionLabel) => {
    const sortedIds = [...optionIds].sort();
    const line = { key: makeCartKey(pickerItem.id, sortedIds), menuItemId: pickerItem.id, optionIds: sortedIds, optionLabel };
    setCart((current) => changeCartQuantity(current, line, 1));
    setPickerItem(null);
  };

  const handleChangeQuantity = useCallback((line, change) => {
    setCart((current) => changeCartQuantity(current, line, change));
  }, []);

  /** @type {import('./CartSheet').CartViewLine[]} */
  const cartViewLines = Object.values(cart).map((line) => {
    const item = menuById.get(line.menuItemId);
    const optionPrice = (item?.options ?? [])
      .filter((option) => line.optionIds.includes(option.id))
      .reduce((sum, option) => sum + option.additionalPrice, 0);
    return {
      key: line.key,
      name: item?.name ?? 'เมนูนี้ถูกนำออกแล้ว',
      optionLabel: line.optionLabel,
      quantity: line.quantity,
      unitExtraPrice: (item?.extraPrice ?? 0) + optionPrice,
      isSoldOut: !item || getAvailability(line.menuItemId) !== 'available',
      line,
    };
  });
  const totalInCart = cartViewLines.reduce((sum, line) => sum + line.quantity, 0);

  // ---------- ส่งออเดอร์ ----------
  const [isSubmitting, startSubmit] = useTransition();
  const [notice, setNotice] = useState(/** @type {{ tone: 'error'|'success', text: string }|null} */ (null));

  const handleSubmit = () => {
    const submittedCart = cart;
    const lines = Object.values(submittedCart).map((line) => ({
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      optionIds: line.optionIds,
    }));
    if (lines.length === 0) return;

    // Optimistic UI: ปิดตะกร้าและล้างรายการทันที ลูกค้าสั่งรอบต่อไปได้เลย
    setCart({});
    setIsCartOpen(false);
    setNotice({ tone: 'success', text: 'กำลังส่งออเดอร์เข้าครัว…' });

    startSubmit(async () => {
      const result = await placeCustomerOrder(tableNumber, lines);
      if (result.error) {
        // คืนรายการเดิมกลับเข้าตะกร้า (รวมกับที่เพิ่งเพิ่มระหว่างรอ) แล้วเปิดตะกร้าให้แก้
        setCart((current) => mergeCarts(current, submittedCart));
        setIsCartOpen(true);
        setNotice({ tone: 'error', text: result.error });
        return;
      }
      setNotice({
        tone: 'success',
        text: `ส่งเข้าครัวแล้ว ${result.itemCount} รายการ (ออเดอร์ ${result.orderNumber})`,
      });
    });
  };

  const tableLabel = session.tableNumbers.length > 0 ? session.tableNumbers.join(' + ') : tableNumber;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      {/* หัวหน้า: โลโก้ + โต๊ะ + เวลา (ติดด้านบนตลอด) */}
      <header className="sticky top-0 z-20 flex flex-col gap-3 bg-surface/95 px-4 pb-3 pt-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <BrandLogo subtitle={`โต๊ะ ${tableLabel}`} />
          <OrderTimer expiresAtMs={expiresAtMs} />
        </div>

        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="ค้นหาเมนู"
            className="h-11 w-full rounded-xl border border-line bg-white pl-10 pr-10 outline-none focus:border-primary"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => setSearchText('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-ink-muted"
              aria-label="ล้างคำค้นหา"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </label>

        {!debouncedSearch && (
          <nav className="-mx-4 flex gap-2 overflow-x-auto px-4" aria-label="หมวดหมู่เมนู">
            {[{ id: null, name: 'ทั้งหมด' }, ...categories].map((category) => (
              <button
                key={category.id ?? 'all'}
                type="button"
                onClick={() => setSelectedCategoryId(category.id)}
                className={cn(
                  'shrink-0 rounded-full px-4 py-2 text-sm font-bold',
                  selectedCategoryId === category.id ? 'bg-primary text-white' : 'bg-white text-ink'
                )}
              >
                {category.name}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main className="flex flex-1 flex-col gap-4 px-4 pb-28 pt-1">
        {isLocked && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl bg-danger px-4 py-3 text-white">
            <Lock className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-bold">{isClosedByStaff ? 'ปิดรับออเดอร์แล้ว' : 'หมดเวลาสั่งอาหารแล้ว'}</p>
              <p className="text-sm text-white/90">อาหารที่สั่งไว้ก่อนหน้า ครัวยังทำและเสิร์ฟให้ตามปกติ</p>
            </div>
          </div>
        )}

        {notice && <AlertMessage tone={notice.tone}>{notice.text}</AlertMessage>}

        {visibleCategories.length === 0 && (
          <p className="py-10 text-center text-ink-muted">ไม่พบเมนู “{searchText.trim()}”</p>
        )}

        {visibleCategories.map((category) => (
          <section key={category.id} className="flex flex-col gap-2">
            <h2 className="text-lg font-bold">{category.name}</h2>
            {category.items.map((item) => (
              <MenuCard
                key={item.id}
                item={item}
                availability={getAvailability(item.id)}
                quantityInCart={countsByMenu.get(item.id) ?? 0}
                isLocked={isLocked}
                onAdd={handleAdd}
                onRemove={handleRemove}
              />
            ))}
          </section>
        ))}
      </main>

      {/* แถบตะกร้าด้านล่าง */}
      {totalInCart > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md p-4">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="flex h-14 w-full items-center gap-3 rounded-2xl bg-primary px-5 text-white shadow-lg active:scale-[0.99]"
          >
            <ShoppingBasket className="size-6" aria-hidden />
            <span className="flex-1 text-left text-lg font-bold">ดูตะกร้า</span>
            <span className="rounded-full bg-white px-3 py-0.5 text-base font-bold text-primary tabular-nums">
              {totalInCart}
            </span>
          </button>
        </div>
      )}

      {pickerItem && (
        <OptionPickerModal
          key={pickerItem.id}
          item={pickerItem}
          onClose={() => setPickerItem(null)}
          onConfirm={handleOptionConfirm}
        />
      )}

      <CartSheet
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        lines={cartViewLines}
        onChangeQuantity={handleChangeQuantity}
        onSubmit={handleSubmit}
        isLocked={isLocked}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
