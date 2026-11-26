'use client';

import { memo, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CircleCheck,
  CircleOff,
  FolderCog,
  ListChecks,
  PackageX,
  Pencil,
  Plus,
  Search,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import { deleteMenuItem, saveCategory, saveMenuItem, setMenuAvailability } from '@/app/(admin)/menu/actions';
import { AlertMessage, Button, ImagePickerField, MenuImage, Modal } from '@/components/ui';
import { useDebounce } from '@/hooks/useDebounce';
import { useImageUpload } from '@/hooks/useImageUpload';
import { KITCHEN_STATION_LABELS } from '@/lib/constants';
import { cn, formatCurrency } from '@/lib/utils';

const INPUT_CLASS =
  'h-11 w-full rounded-xl border border-line bg-white px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

// สถานะเมนู: สี + ข้อความเสมอ (ไม่ใช้สีอย่างเดียว)
const STATUS_DISPLAY = {
  available: { label: 'พร้อมขาย', className: 'bg-emerald-100 text-emerald-800' },
  out_of_stock: { label: 'หมด (วัตถุดิบไม่พอ)', className: 'bg-danger-soft text-danger' },
  manual_off: { label: 'ปิดขาย', className: 'bg-line text-ink-muted' },
};

/**
 * หน้าจัดการเมนู (4.2): สรุปสถานะ, กรองหมวด/ค้นหา, เพิ่ม/แก้/ลบเมนู, เปิด/ปิดขาย, จัดการหมวดหมู่
 * สูตรตัดสต็อก (BOM) แก้ที่หน้า /inventory แท็บ "สูตรตัดสต็อก"
 * @param {Object} props
 * @param {import('@/app/(admin)/menu/data').MenuCategory[]} props.categories
 * @param {import('@/app/(admin)/menu/data').ManagedMenuItem[]} props.menuItems
 */
export default function MenuManager({ categories, menuItems }) {
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebounce(keyword, 200);
  const [editingItem, setEditingItem] = useState(null); // null = ปิด, {} = เพิ่มใหม่
  const [closingItem, setClosingItem] = useState(null);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);

  const categoryNameById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);

  const counts = useMemo(
    () => ({
      total: menuItems.length,
      available: menuItems.filter((item) => item.availabilityStatus === 'available').length,
      outOfStock: menuItems.filter((item) => item.availabilityStatus === 'out_of_stock').length,
      manualOff: menuItems.filter((item) => item.availabilityStatus === 'manual_off').length,
      noBom: menuItems.filter((item) => item.bomCount === 0).length,
    }),
    [menuItems]
  );

  const visibleItems = useMemo(() => {
    const search = debouncedKeyword.trim().toLowerCase();
    return menuItems.filter((item) => {
      if (categoryFilter && item.categoryId !== categoryFilter) return false;
      return !search || item.name.toLowerCase().includes(search);
    });
  }, [menuItems, categoryFilter, debouncedKeyword]);

  const openItem = async (item) => {
    setBusyId(item.id);
    setMessage(null);
    const result = await setMenuAvailability({ id: item.id, isOpen: true });
    setBusyId(null);
    setMessage(result.error ? { tone: 'error', text: result.error } : { tone: 'success', text: `เปิดขาย ${item.name} แล้ว` });
  };

  const hasCategories = categories.some((category) => category.isActive);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <SummaryCard icon={UtensilsCrossed} label="เมนูทั้งหมด" value={counts.total} isPrimary />
        <SummaryCard icon={CircleCheck} label="พร้อมขาย" value={counts.available} />
        <SummaryCard icon={PackageX} label="หมด (วัตถุดิบไม่พอ)" value={counts.outOfStock} />
        <SummaryCard icon={CircleOff} label="ปิดขาย" value={counts.manualOff} />
        <SummaryCard icon={ListChecks} label="ยังไม่มีสูตรตัดสต็อก" value={counts.noBom} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-3xl bg-white p-3 shadow-sm">
        <FilterPill isActive={categoryFilter === null} onClick={() => setCategoryFilter(null)}>
          ทุกหมวด
        </FilterPill>
        {categories.map((category) => (
          <FilterPill key={category.id} isActive={categoryFilter === category.id} onClick={() => setCategoryFilter(category.id)}>
            {category.name}
            {!category.isActive && ' (ปิด)'}
          </FilterPill>
        ))}
        <label className="relative ml-auto min-w-56 flex-1 md:flex-none">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="ค้นหาชื่อเมนู"
            aria-label="ค้นหาเมนู"
            className={cn(INPUT_CLASS, 'pl-9')}
          />
        </label>
        <Button variant="secondary" icon={FolderCog} onClick={() => setIsCategoryOpen(true)}>
          หมวดหมู่
        </Button>
        <Button icon={Plus} onClick={() => setEditingItem({})} disabled={!hasCategories} title={hasCategories ? undefined : 'เพิ่มหมวดหมู่ก่อน'}>
          เพิ่มเมนู
        </Button>
      </div>

      <p className="text-sm text-ink-muted">
        สูตรตัดสต็อก (BOM) แก้ที่หน้า{' '}
        <Link href="/inventory" className="font-semibold text-primary underline-offset-2 hover:underline">
          สต็อก
        </Link>{' '}
        แท็บ &ldquo;สูตรตัดสต็อก&rdquo; · เมนูที่วัตถุดิบไม่พอทำ 1 จาน ระบบเปลี่ยนเป็น &ldquo;หมด&rdquo; ให้เอง
      </p>

      {!hasCategories && <AlertMessage>ยังไม่มีหมวดหมู่ที่เปิดใช้งาน — กดปุ่ม &ldquo;หมวดหมู่&rdquo; เพื่อเพิ่มก่อน แล้วจึงเพิ่มเมนูได้</AlertMessage>}
      <AlertMessage tone={message?.tone}>{message?.text}</AlertMessage>

      {visibleItems.length === 0 ? (
        <p className="rounded-3xl bg-white p-10 text-center text-ink-muted">ไม่พบเมนูตามเงื่อนไข</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((item) => (
            <MenuCard
              key={item.id}
              item={item}
              categoryName={categoryNameById.get(item.categoryId) ?? '—'}
              isBusy={busyId === item.id}
              onEdit={setEditingItem}
              onOpen={openItem}
              onClose={setClosingItem}
            />
          ))}
        </ul>
      )}

      {editingItem && (
        <MenuFormModal
          item={editingItem}
          categories={categories}
          onClose={() => setEditingItem(null)}
          onDone={(text) => setMessage({ tone: 'success', text })}
        />
      )}
      {closingItem && (
        <CloseReasonModal item={closingItem} onClose={() => setClosingItem(null)} onDone={(text) => setMessage({ tone: 'success', text })} />
      )}
      {isCategoryOpen && <CategoryModal categories={categories} menuItems={menuItems} onClose={() => setIsCategoryOpen(false)} />}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, isPrimary = false }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm">
      <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-2xl', isPrimary ? 'bg-primary text-white' : 'bg-primary/5 text-primary')}>
        <Icon className="size-6" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm text-ink-muted">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function FilterPill({ isActive, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={cn('h-11 rounded-full px-4 font-semibold transition-colors', isActive ? 'bg-primary text-white' : 'bg-surface text-ink hover:bg-line')}
    >
      {children}
    </button>
  );
}

const MenuCard = memo(function MenuCard({ item, categoryName, isBusy, onEdit, onOpen, onClose }) {
  const status = STATUS_DISPLAY[item.availabilityStatus];
  return (
    <li className="flex gap-3 rounded-3xl bg-white p-3 shadow-sm">
      <MenuImage src={item.imageUrl} className="size-24" isDimmed={item.availabilityStatus !== 'available'} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="truncate font-bold">{item.name}</p>
        <p className="truncate text-sm text-ink-muted">
          {categoryName} · {KITCHEN_STATION_LABELS[item.kitchenStation]}
        </p>
        <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
          <span className={cn('rounded-full px-2 py-0.5', status.className)}>{status.label}</span>
          {item.extraPrice > 0 ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">สั่งเพิ่ม +{formatCurrency(item.extraPrice)}</span>
          ) : (
            <span className="rounded-full bg-surface px-2 py-0.5">รวมในบุฟเฟต์</span>
          )}
          {item.maxQuantityPerOrder && <span className="rounded-full bg-surface px-2 py-0.5">สั่งได้ {item.maxQuantityPerOrder}/ครั้ง</span>}
          {item.bomCount === 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">ยังไม่มีสูตร</span>}
        </div>
        {item.availabilityStatus === 'manual_off' && item.disabledReason && (
          <p className="truncate text-xs font-semibold text-danger" title={item.disabledReason}>
            ปิดเพราะ: {item.disabledReason}
          </p>
        )}
        {item.ingredientNames.length > 0 && (
          <p className="truncate text-xs text-ink-muted" title={item.ingredientNames.join(', ')}>
            วัตถุดิบ: {item.ingredientNames.join(', ')}
          </p>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="secondary" icon={Pencil} onClick={() => onEdit(item)}>
            แก้ไข
          </Button>
          {item.availabilityStatus === 'manual_off' ? (
            <Button size="sm" variant="success" isLoading={isBusy} onClick={() => onOpen(item)}>
              เปิดขาย
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={item.availabilityStatus === 'out_of_stock' || isBusy}
              title={item.availabilityStatus === 'out_of_stock' ? 'ระบบปิดให้เพราะวัตถุดิบไม่พอ — เติมสต็อกแล้วจะเปิดเอง' : undefined}
              onClick={() => onClose(item)}
            >
              ปิดขาย
            </Button>
          )}
        </div>
      </div>
    </li>
  );
});

function Field({ label, hint, error, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-semibold">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-ink-muted">{hint}</span>}
      {error && <span className="text-sm font-semibold text-danger">{error}</span>}
    </label>
  );
}

/** หน้าต่างกรอกเหตุผลปิดขาย (บังคับ — Audit MANUAL_OFF_MENU) */
function CloseReasonModal({ item, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleConfirm = async () => {
    setIsSaving(true);
    setFormError(null);
    const result = await setMenuAvailability({ id: item.id, isOpen: false, reason });
    setIsSaving(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    onDone(`ปิดขาย ${item.name} แล้ว`);
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      isCloseDisabled={isSaving}
      title={`ปิดขาย ${item.name}`}
      description="ลูกค้าจะเห็นว่า &quot;หมด&quot; และกดสั่งไม่ได้ จนกว่าจะกดเปิดขายเอง"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isSaving}>
            ยกเลิก
          </Button>
          <Button variant="danger" className="flex-1" isLoading={isSaving} disabled={!reason.trim()} onClick={handleConfirm}>
            ปิดขาย
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="เหตุผล (บังคับ)">
          <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} placeholder="เช่น ของไม่สด, เครื่องเสีย" className={INPUT_CLASS} autoFocus />
        </Field>
        <AlertMessage>{formError}</AlertMessage>
      </div>
    </Modal>
  );
}

/** หน้าต่างเพิ่ม/แก้เมนู + อัปโหลดรูป + ลบเมนู */
function MenuFormModal({ item, categories, onClose, onDone }) {
  const isNew = !item.id;
  const formId = useId();
  const activeCategories = categories.filter((category) => category.isActive || category.id === item.categoryId);

  const [values, setValues] = useState(() => ({
    name: item.name ?? '',
    description: item.description ?? '',
    categoryId: item.categoryId ?? activeCategories[0]?.id ?? '',
    kitchenStation: item.kitchenStation ?? 'fresh',
    extraPrice: String(item.extraPrice ?? 0),
    maxQuantityPerOrder: item.maxQuantityPerOrder ? String(item.maxQuantityPerOrder) : '',
  }));
  const imageUpload = useImageUpload({ initialUrl: item.imageUrl ?? null, folder: 'items' });
  const [busyAction, setBusyAction] = useState(null);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const setValue = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const isBusy = busyAction !== null || imageUpload.isUploading;

  const handleClose = () => {
    imageUpload.discardUnsaved();
    onClose();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusyAction('save');
    setFormError(null);
    const result = await saveMenuItem({ id: item.id ?? null, ...values, imageUrl: imageUpload.imageUrl });
    setBusyAction(null);
    setFieldErrors(result.fieldErrors ?? {});
    if (result.error) {
      setFormError(result.error);
      return;
    }
    imageUpload.markSaved(); // บันทึกแล้ว ไม่ต้องลบรูป
    onDone(isNew ? `เพิ่มเมนู ${values.name.trim()} แล้ว` : `บันทึก ${values.name.trim()} แล้ว`);
    onClose();
  };

  const handleDelete = async () => {
    setBusyAction('delete');
    setFormError(null);
    const result = await deleteMenuItem({ id: item.id });
    setBusyAction(null);
    if (result.error) {
      setFormError(result.error);
      setIsConfirmingDelete(false);
      return;
    }
    await imageUpload.discardUnsaved();
    onDone(`ลบเมนู ${item.name} แล้ว`);
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={handleClose}
      isCloseDisabled={isBusy}
      title={isNew ? 'เพิ่มเมนู' : `แก้ไข ${item.name}`}
      className="max-w-2xl"
      footer={
        <>
          {!isNew &&
            (isConfirmingDelete ? (
              <Button variant="danger" icon={Trash2} isLoading={busyAction === 'delete'} disabled={isBusy} onClick={handleDelete}>
                ยืนยันลบ
              </Button>
            ) : (
              <Button variant="ghost" icon={Trash2} disabled={isBusy} onClick={() => setIsConfirmingDelete(true)}>
                ลบเมนู
              </Button>
            ))}
          <Button variant="secondary" className="ml-auto" onClick={handleClose} disabled={isBusy}>
            ยกเลิก
          </Button>
          <Button type="submit" form={formId} isLoading={busyAction === 'save'} disabled={isBusy}>
            {isNew ? 'เพิ่มเมนู' : 'บันทึก'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <ImagePickerField upload={imageUpload} isDisabled={busyAction !== null} error={fieldErrors.imageUrl} />

        <Field label="ชื่อเมนู" error={fieldErrors.name}>
          <input value={values.name} onChange={setValue('name')} maxLength={150} className={INPUT_CLASS} />
        </Field>
        <Field label="คำอธิบาย (ไม่บังคับ)" error={fieldErrors.description}>
          <input value={values.description} onChange={setValue('description')} maxLength={300} className={INPUT_CLASS} />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="หมวดหมู่" error={fieldErrors.categoryId}>
            <select value={values.categoryId} onChange={setValue('categoryId')} className={INPUT_CLASS}>
              {activeCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="สถานีครัว (ส่งออเดอร์ไปจอไหน)" error={fieldErrors.kitchenStation}>
            <select value={values.kitchenStation} onChange={setValue('kitchenStation')} className={INPUT_CLASS}>
              {Object.entries(KITCHEN_STATION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ราคาสั่งเพิ่ม (บาท)" hint="0 = รวมในบุฟเฟต์ · มากกว่า 0 = คิดเงินเพิ่มในบิล" error={fieldErrors.extraPrice}>
            <input inputMode="decimal" value={values.extraPrice} onChange={setValue('extraPrice')} className={cn(INPUT_CLASS, 'text-right')} />
          </Field>
          <Field label="สั่งได้สูงสุดต่อครั้ง" hint="เว้นว่าง = ไม่จำกัด · นับต่อการกดสั่ง 1 ครั้ง" error={fieldErrors.maxQuantityPerOrder}>
            <input
              inputMode="numeric"
              value={values.maxQuantityPerOrder}
              onChange={(event) => setValues((current) => ({ ...current, maxQuantityPerOrder: event.target.value.replace(/\D/g, '').slice(0, 2) }))}
              placeholder="ไม่จำกัด"
              className={cn(INPUT_CLASS, 'text-right')}
            />
          </Field>
        </div>

        {isConfirmingDelete && <AlertMessage>ลบแล้วกู้คืนไม่ได้ — ถ้าเมนูนี้เคยถูกสั่งแล้ว ระบบจะไม่ให้ลบ (ให้ปิดขายแทน)</AlertMessage>}
        <AlertMessage>{formError}</AlertMessage>
      </form>
    </Modal>
  );
}

/** หน้าต่างจัดการหมวดหมู่: เพิ่ม, เปลี่ยนชื่อ, ลำดับการแสดง, เปิด/ปิด */
function CategoryModal({ categories, menuItems, onClose }) {
  const nextOrder = categories.reduce((max, category) => Math.max(max, category.displayOrder), 0) + 1;
  const [newName, setNewName] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);

  const run = async (key, input, successText) => {
    setBusyId(key);
    setMessage(null);
    const result = await saveCategory(input);
    setBusyId(null);
    setMessage(result.error ? { tone: 'error', text: result.error } : { tone: 'success', text: successText });
    return !result.error;
  };

  const handleAdd = async (event) => {
    event.preventDefault();
    const name = newName.trim();
    if (await run('new', { name, displayOrder: nextOrder, isActive: true }, `เพิ่มหมวด ${name} แล้ว`)) setNewName('');
  };

  return (
    <Modal isOpen onClose={onClose} isCloseDisabled={busyId !== null} title="หมวดหมู่เมนู" description="หมวดที่ปิด ลูกค้าจะไม่เห็นเมนูในหมวดนั้น" className="max-w-2xl">
      <div className="flex flex-col gap-4">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={100} placeholder="ชื่อหมวดใหม่ เช่น เนื้อสัตว์" aria-label="ชื่อหมวดใหม่" className={INPUT_CLASS} />
          <Button type="submit" icon={Plus} isLoading={busyId === 'new'} disabled={!newName.trim() || busyId !== null}>
            เพิ่ม
          </Button>
        </form>

        <AlertMessage tone={message?.tone}>{message?.text}</AlertMessage>

        {categories.length === 0 ? (
          <p className="rounded-2xl bg-surface p-6 text-center text-ink-muted">ยังไม่มีหมวดหมู่</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {categories.map((category) => (
              <CategoryRow
                key={`${category.id}-${category.name}-${category.displayOrder}-${category.isActive}`}
                category={category}
                menuCount={menuItems.filter((item) => item.categoryId === category.id).length}
                isBusy={busyId === category.id}
                isDisabled={busyId !== null}
                onSave={(input, text) => run(category.id, { id: category.id, ...input }, text)}
              />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function CategoryRow({ category, menuCount, isBusy, isDisabled, onSave }) {
  const [name, setName] = useState(category.name);
  const [displayOrder, setDisplayOrder] = useState(String(category.displayOrder));
  const isChanged = name.trim() !== category.name || Number(displayOrder) !== category.displayOrder;

  return (
    <li className={cn('flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3', !category.isActive && 'opacity-70')}>
      <input
        type="number"
        min={0}
        max={999}
        value={displayOrder}
        onChange={(event) => setDisplayOrder(event.target.value)}
        aria-label={`ลำดับของ ${category.name}`}
        title="ลำดับการแสดง (น้อยขึ้นก่อน)"
        className="h-10 w-16 rounded-xl border border-line bg-white px-2 text-right"
      />
      <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} aria-label="ชื่อหมวด" className="h-10 min-w-40 flex-1 rounded-xl border border-line bg-white px-3" />
      <span className="text-sm text-ink-muted">{menuCount} เมนู</span>
      {isChanged && (
        <Button size="sm" isLoading={isBusy} disabled={isDisabled} onClick={() => onSave({ name, displayOrder: Number(displayOrder), isActive: category.isActive }, `บันทึกหมวด ${name.trim()} แล้ว`)}>
          บันทึก
        </Button>
      )}
      <Button
        size="sm"
        variant={category.isActive ? 'ghost' : 'success'}
        isLoading={isBusy && !isChanged}
        disabled={isDisabled}
        onClick={() =>
          onSave(
            { name: category.name, displayOrder: category.displayOrder, isActive: !category.isActive },
            category.isActive ? `ปิดหมวด ${category.name} แล้ว` : `เปิดหมวด ${category.name} แล้ว`
          )
        }
      >
        {category.isActive ? 'ปิดหมวด' : 'เปิดหมวด'}
      </Button>
    </li>
  );
}
