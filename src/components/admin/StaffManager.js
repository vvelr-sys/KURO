'use client';

import { memo, useId, useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, Search, ShieldCheck, UserRound, Users } from 'lucide-react';
import { createStaffAccount, resetStaffPassword, setStaffPin, updateStaffAccount } from '@/app/(admin)/staff/actions';
import { AlertMessage, Button, Modal } from '@/components/ui';
import { useDebounce } from '@/hooks/useDebounce';
import { ROLE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';

const INPUT_CLASS =
  'h-11 w-full rounded-xl border border-line bg-white px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

/** ตำแหน่งเรียงจากสิทธิ์มากไปน้อย + คำอธิบายสั้นๆ ว่าทำอะไรได้ */
const ROLE_OPTIONS = [
  { value: 'admin', hint: 'ทุกอย่าง รวมตั้งราคา พนักงาน ตั้งค่าร้าน' },
  { value: 'manager', hint: 'เมนู สต็อก รายงาน และช่วยงานหน้าร้าน/ครัว' },
  { value: 'cashier', hint: 'ออกบัตรคิว เปิดโต๊ะ คิดเงิน' },
  { value: 'staff', hint: 'ย้าย/รวมโต๊ะ ทำความสะอาด ชั่งเนื้อ นับสต็อก' },
  { value: 'kitchen', hint: 'จอครัว และเปิด/ปิดเมนู' },
];

/**
 * จัดการพนักงาน: สรุปจำนวนตามตำแหน่ง, ค้นหา, เพิ่ม, แก้ไข, ปิดใช้งาน, ตั้งรหัสผ่าน/PIN
 * @param {Object} props
 * @param {import('@/app/(admin)/staff/data').StaffAccount[]} props.accounts
 * @param {boolean} props.canManageAccounts - false = ยังไม่มี Service Role Key (ดูได้อย่างเดียว)
 * @param {string} props.currentStaffId
 */
export default function StaffManager({ accounts, canManageAccounts, currentStaffId }) {
  const [roleFilter, setRoleFilter] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebounce(keyword, 200);
  const [editingAccount, setEditingAccount] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState(null);

  const activeAccounts = accounts.filter((account) => account.isActive);
  const inactiveCount = accounts.length - activeAccounts.length;

  const visibleAccounts = useMemo(() => {
    const search = debouncedKeyword.trim().toLowerCase();
    return accounts.filter((account) => {
      if (!showInactive && !account.isActive) return false;
      if (roleFilter && account.role !== roleFilter) return false;
      if (!search) return true;
      return account.fullName.toLowerCase().includes(search) || (account.email ?? '').toLowerCase().includes(search);
    });
  }, [accounts, debouncedKeyword, roleFilter, showInactive]);

  return (
    <div className="flex flex-col gap-4">
      {!canManageAccounts && (
        <AlertMessage>
          ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY ใน .env.local — ดูรายชื่อได้อย่างเดียว เพิ่มบัญชี / แก้ไข / ตั้งรหัสผ่านไม่ได้
        </AlertMessage>
      )}

      {/* สรุปจำนวนตามตำแหน่ง (นับเฉพาะบัญชีที่เปิดใช้งาน) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard icon={Users} label="ใช้งานอยู่" value={activeAccounts.length} isPrimary />
        {ROLE_OPTIONS.map((option) => (
          <SummaryCard
            key={option.value}
            icon={option.value === 'admin' ? ShieldCheck : UserRound}
            label={ROLE_LABELS[option.value]}
            value={activeAccounts.filter((account) => account.role === option.value).length}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-3xl bg-white p-3 shadow-sm">
        <FilterPill isActive={roleFilter === null} onClick={() => setRoleFilter(null)}>
          ทุกตำแหน่ง
        </FilterPill>
        {ROLE_OPTIONS.map((option) => (
          <FilterPill key={option.value} isActive={roleFilter === option.value} onClick={() => setRoleFilter(option.value)}>
            {ROLE_LABELS[option.value]}
          </FilterPill>
        ))}
        <label className="relative ml-auto min-w-56 flex-1 md:flex-none">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="ค้นหาชื่อหรืออีเมล"
            aria-label="ค้นหาพนักงาน"
            className={cn(INPUT_CLASS, 'pl-9')}
          />
        </label>
        <Button icon={Plus} onClick={() => setIsCreating(true)} disabled={!canManageAccounts}>
          เพิ่มพนักงาน
        </Button>
      </div>

      {inactiveCount > 0 && (
        <label className="flex items-center gap-2 self-start text-sm font-semibold text-ink-muted">
          <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} className="size-4 accent-primary" />
          แสดงบัญชีที่ปิดใช้งาน ({inactiveCount})
        </label>
      )}

      <AlertMessage tone={message?.tone}>{message?.text}</AlertMessage>

      {visibleAccounts.length === 0 ? (
        <p className="rounded-3xl bg-white p-10 text-center text-ink-muted">ไม่พบพนักงานตามเงื่อนไข</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleAccounts.map((account) => (
            <StaffCard
              key={account.id}
              account={account}
              isSelf={account.id === currentStaffId}
              canEdit={canManageAccounts}
              onEdit={setEditingAccount}
            />
          ))}
        </ul>
      )}

      {isCreating && (
        <CreateStaffModal
          onClose={() => setIsCreating(false)}
          onCreated={(name) => setMessage({ tone: 'success', text: `เพิ่มบัญชี ${name} แล้ว — ล็อกอินด้วยอีเมลและรหัสผ่านที่ตั้งไว้ได้ทันที` })}
        />
      )}
      {editingAccount && (
        <EditStaffModal
          account={editingAccount}
          isSelf={editingAccount.id === currentStaffId}
          onClose={() => setEditingAccount(null)}
          onSaved={(text) => setMessage({ tone: 'success', text })}
        />
      )}
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

const StaffCard = memo(function StaffCard({ account, isSelf, canEdit, onEdit }) {
  return (
    <li className={cn('flex items-start gap-3 rounded-3xl bg-white p-4 shadow-sm', !account.isActive && 'opacity-60')}>
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-lg font-bold text-primary">
        {account.fullName.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-bold">
          <span className="truncate">{account.fullName}</span>
          {isSelf && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">คุณ</span>}
        </p>
        <p className="truncate text-sm text-ink-muted">{account.email ?? '—'}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
          <span className="rounded-full bg-primary/5 px-2 py-0.5 text-primary">{ROLE_LABELS[account.role] ?? account.role}</span>
          <span className={cn('rounded-full px-2 py-0.5', account.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-line text-ink-muted')}>
            {account.isActive ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
          </span>
          {canEdit && (
            <span className={cn('rounded-full px-2 py-0.5', account.hasPin ? 'bg-surface text-ink' : 'bg-amber-100 text-amber-900')}>
              {account.hasPin ? 'มี PIN' : 'ยังไม่มี PIN'}
            </span>
          )}
        </div>
      </div>
      <Button variant="ghost" size="sm" icon={Pencil} onClick={() => onEdit(account)} disabled={!canEdit} aria-label={`แก้ไข ${account.fullName}`}>
        แก้ไข
      </Button>
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

function RoleSelect({ value, onChange, disabled }) {
  const selected = ROLE_OPTIONS.find((option) => option.value === value);
  return (
    <Field label="ตำแหน่ง" hint={selected?.hint}>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={cn(INPUT_CLASS, 'disabled:bg-surface')}>
        {ROLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {ROLE_LABELS[option.value]}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** หน้าต่างเพิ่มพนักงาน */
function CreateStaffModal({ onClose, onCreated }) {
  const formId = useId();
  const [values, setValues] = useState({ fullName: '', email: '', password: '', role: 'staff', pin: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const setValue = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setFormError(null);
    const result = await createStaffAccount(values);
    setIsSaving(false);
    setFieldErrors(result.fieldErrors ?? {});
    if (result.error) {
      setFormError(result.error);
      return;
    }
    onCreated(values.fullName.trim());
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      isCloseDisabled={isSaving}
      title="เพิ่มพนักงาน"
      description="บัญชีใช้ได้ทันที ไม่ต้องยืนยันอีเมล"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isSaving}>
            ยกเลิก
          </Button>
          <Button type="submit" form={formId} className="flex-1" icon={Plus} isLoading={isSaving}>
            เพิ่มพนักงาน
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="ชื่อ-นามสกุล" error={fieldErrors.fullName}>
          <input value={values.fullName} onChange={setValue('fullName')} maxLength={100} className={INPUT_CLASS} autoFocus />
        </Field>
        <Field label="อีเมล (ใช้ล็อกอิน)" error={fieldErrors.email}>
          <input type="email" value={values.email} onChange={setValue('email')} autoComplete="off" className={INPUT_CLASS} />
        </Field>
        <Field label="รหัสผ่าน" hint="อย่างน้อย 8 ตัวอักษร — แจ้งพนักงานด้วยตัวเอง" error={fieldErrors.password}>
          <input type="password" value={values.password} onChange={setValue('password')} autoComplete="new-password" className={INPUT_CLASS} />
        </Field>
        <RoleSelect value={values.role} onChange={(role) => setValues((current) => ({ ...current, role }))} />
        <Field label="PIN (ไม่บังคับ)" hint="ตัวเลข 4 - 6 หลัก เก็บแบบเข้ารหัส ดูย้อนหลังไม่ได้" error={fieldErrors.pin}>
          <input
            inputMode="numeric"
            value={values.pin}
            onChange={(event) => setValues((current) => ({ ...current, pin: event.target.value.replace(/\D/g, '').slice(0, 6) }))}
            autoComplete="off"
            className={cn(INPUT_CLASS, 'max-w-40 font-mono tracking-widest')}
          />
        </Field>
        <AlertMessage>{formError}</AlertMessage>
      </form>
    </Modal>
  );
}

/** หน้าต่างแก้ไขพนักงาน: ข้อมูลทั่วไป + รหัสผ่าน + PIN (บันทึกแยกกันทีละส่วน) */
function EditStaffModal({ account, isSelf, onClose, onSaved }) {
  const [fullName, setFullName] = useState(account.fullName);
  const [role, setRole] = useState(account.role);
  const [isActive, setIsActive] = useState(account.isActive);
  const [newPassword, setNewPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const [busyPart, setBusyPart] = useState(null);
  const [formError, setFormError] = useState(null);

  const run = async (part, task, successText) => {
    setBusyPart(part);
    setFormError(null);
    const result = await task();
    setBusyPart(null);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    onSaved(successText);
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} isCloseDisabled={busyPart !== null} title={`แก้ไข ${account.fullName}`} description={account.email ?? undefined}>
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-4">
          <Field label="ชื่อ-นามสกุล">
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={100} className={INPUT_CLASS} />
          </Field>
          <RoleSelect value={role} onChange={setRole} disabled={isSelf} />
          <label className={cn('flex items-center gap-3 rounded-2xl bg-surface p-3', isSelf && 'opacity-60')}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              disabled={isSelf}
              className="size-5 accent-primary"
            />
            <span>
              <span className="block font-semibold">เปิดใช้งานบัญชี</span>
              <span className="text-sm text-ink-muted">ปิดแล้วล็อกอินไม่ได้ทันที แต่ประวัติการทำงานยังอยู่ครบ</span>
            </span>
          </label>
          {isSelf && <p className="text-sm text-ink-muted">เปลี่ยนตำแหน่งหรือปิดบัญชีของตัวเองไม่ได้ (กันล็อกตัวเองออกจากระบบ)</p>}
          <Button
            className="self-end"
            isLoading={busyPart === 'profile'}
            disabled={busyPart !== null}
            onClick={() => run('profile', () => updateStaffAccount({ id: account.id, fullName, role, isActive }), `บันทึกข้อมูล ${fullName.trim()} แล้ว`)}
          >
            บันทึกข้อมูล
          </Button>
        </section>

        <section className="flex flex-col gap-3 border-t border-line pt-4">
          <p className="flex items-center gap-2 font-bold">
            <KeyRound className="size-4 text-primary" aria-hidden />
            ตั้งรหัสผ่านใหม่
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="อย่างน้อย 8 ตัวอักษร"
              autoComplete="new-password"
              aria-label="รหัสผ่านใหม่"
              className={INPUT_CLASS}
            />
            <Button
              variant="secondary"
              isLoading={busyPart === 'password'}
              disabled={busyPart !== null || newPassword.length === 0}
              onClick={() => run('password', () => resetStaffPassword({ id: account.id, password: newPassword }), `ตั้งรหัสผ่านใหม่ให้ ${account.fullName} แล้ว`)}
            >
              ตั้งรหัส
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-3 border-t border-line pt-4">
          <p className="font-bold">PIN {account.hasPin ? '(ตั้งไว้แล้ว)' : '(ยังไม่มี)'}</p>
          <div className="flex flex-wrap gap-2">
            <input
              inputMode="numeric"
              value={newPin}
              onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="4 - 6 หลัก"
              autoComplete="off"
              aria-label="PIN ใหม่"
              className={cn(INPUT_CLASS, 'max-w-40 font-mono tracking-widest')}
            />
            <Button
              variant="secondary"
              isLoading={busyPart === 'pin'}
              disabled={busyPart !== null || newPin.length === 0}
              onClick={() => run('pin', () => setStaffPin({ id: account.id, pin: newPin }), `ตั้ง PIN ให้ ${account.fullName} แล้ว`)}
            >
              ตั้ง PIN
            </Button>
            {account.hasPin && (
              <Button
                variant="danger"
                isLoading={busyPart === 'clearPin'}
                disabled={busyPart !== null}
                onClick={() => run('clearPin', () => setStaffPin({ id: account.id, pin: null }), `ล้าง PIN ของ ${account.fullName} แล้ว`)}
              >
                ล้าง PIN
              </Button>
            )}
          </div>
        </section>

        <AlertMessage>{formError}</AlertMessage>
      </div>
    </Modal>
  );
}
