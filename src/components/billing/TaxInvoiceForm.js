'use client';

import { useState } from 'react';
import { Building2, CircleCheck, FileText, UserRound } from 'lucide-react';
import { AlertMessage, Button } from '@/components/ui';
import { isValidThaiTaxId, normalizeTaxId } from '@/lib/tax-id';
import { cn, formatCurrency } from '@/lib/utils';

const INPUT_CLASS =
  'h-12 w-full rounded-xl border border-line bg-white px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

/**
 * ฟอร์มข้อมูลผู้ซื้อสำหรับใบกำกับภาษีเต็มรูป (FR-045)
 * นิติบุคคล: เลขผู้เสียภาษี + สำนักงานใหญ่/สาขา (5 หลัก) / บุคคลธรรมดา: เลขบัตรประชาชน
 * @param {Object} props
 * @param {{ totalAmount: number, vatAmount: number }} props.bill
 * @param {(input: object) => Promise<{ error: string|null, fieldErrors: Record<string, string> }>} props.onSubmit
 */
export default function TaxInvoiceForm({ bill, onSubmit }) {
  const [customerType, setCustomerType] = useState(/** @type {'company'|'person'} */ ('company'));
  const [taxId, setTaxId] = useState('');
  const [branchType, setBranchType] = useState(/** @type {'head_office'|'branch'} */ ('head_office'));
  const [branchCode, setBranchCode] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const isCompany = customerType === 'company';
  const taxIdDigits = normalizeTaxId(taxId);
  const isTaxIdComplete = taxIdDigits.length === 13;
  const isTaxIdValid = isTaxIdComplete && isValidThaiTaxId(taxIdDigits);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    const result = await onSubmit({ customerType, taxId: taxIdDigits, branchType, branchCode, customerName, address, email });
    setIsSaving(false);
    setErrorMessage(result.error);
    setFieldErrors(result.fieldErrors ?? {});
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm" noValidate>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <FileText className="size-5 text-primary" aria-hidden />
        ข้อมูลผู้ซื้อ
      </h2>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface p-1">
        {[
          { key: 'company', label: 'นิติบุคคล / บริษัท', icon: Building2 },
          { key: 'person', label: 'บุคคลธรรมดา', icon: UserRound },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setCustomerType(key)}
            aria-pressed={customerType === key}
            className={cn(
              'flex h-11 items-center justify-center gap-2 rounded-xl font-semibold',
              customerType === key ? 'bg-white text-primary shadow-sm' : 'text-ink-muted'
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <Field
        label={isCompany ? 'เลขประจำตัวผู้เสียภาษี 13 หลัก' : 'เลขบัตรประชาชน 13 หลัก'}
        error={fieldErrors.taxId ?? (isTaxIdComplete && !isTaxIdValid ? 'เลขไม่ถูกต้อง (ตรวจหลักสุดท้ายไม่ผ่าน)' : null)}
      >
        <input
          inputMode="numeric"
          value={taxId}
          onChange={(event) => setTaxId(event.target.value.replace(/[^\d-]/g, '').slice(0, 17))}
          placeholder="0000000000000"
          className={cn(INPUT_CLASS, 'font-mono text-lg tracking-wider')}
        />
        {isTaxIdValid && (
          <p className="flex items-center gap-1 text-sm text-emerald-800">
            <CircleCheck className="size-4" aria-hidden />
            รูปแบบเลขถูกต้อง
          </p>
        )}
      </Field>

      {isCompany && (
        <Field label="สำนักงานใหญ่ / สาขา" error={fieldErrors.branchCode}>
          <div className="flex gap-2">
            {[
              { key: 'head_office', label: 'สำนักงานใหญ่' },
              { key: 'branch', label: 'สาขาที่' },
            ].map((option) => (
              <label
                key={option.key}
                className={cn(
                  'flex h-12 flex-1 cursor-pointer items-center gap-2 rounded-xl px-4 ring-1',
                  branchType === option.key ? 'bg-primary/5 ring-primary' : 'ring-line'
                )}
              >
                <input
                  type="radio"
                  name="branchType"
                  checked={branchType === option.key}
                  onChange={() => setBranchType(option.key)}
                  className="accent-primary"
                />
                {option.label}
              </label>
            ))}
            {branchType === 'branch' && (
              <input
                inputMode="numeric"
                value={branchCode}
                onChange={(event) => setBranchCode(event.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="00001"
                aria-label="รหัสสาขา 5 หลัก"
                className={cn(INPUT_CLASS, 'w-32 font-mono')}
              />
            )}
          </div>
        </Field>
      )}

      <Field label={isCompany ? 'ชื่อบริษัท / นิติบุคคล' : 'ชื่อ-นามสกุล'} error={fieldErrors.customerName}>
        <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={200} className={INPUT_CLASS} />
      </Field>

      <Field label="ที่อยู่ (ตามทะเบียนภาษี)" error={fieldErrors.address}>
        <textarea
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
          className="w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </Field>

      <Field label="อีเมล (ไม่บังคับ — เก็บไว้ก่อน ระบบยังไม่ส่งอีเมลอัตโนมัติ)" error={fieldErrors.email}>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={255} className={INPUT_CLASS} />
      </Field>

      <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3 text-sm">
        <span className="text-ink-muted">
          มูลค่าก่อน VAT {formatCurrency(bill.totalAmount - bill.vatAmount)} · VAT {formatCurrency(bill.vatAmount)}
        </span>
        <span className="text-lg font-bold text-primary">{formatCurrency(bill.totalAmount)}</span>
      </div>

      <AlertMessage>{errorMessage}</AlertMessage>
      <p className="text-sm text-ink-muted">ออกแล้วแก้ไขไม่ได้ — ตรวจข้อมูลกับลูกค้าก่อนกดออก</p>

      <Button type="submit" size="lg" icon={FileText} isLoading={isSaving}>
        ออกใบกำกับภาษี
      </Button>
    </form>
  );
}

/** ช่องกรอก + ชื่อช่อง + ข้อความ error */
function Field({ label, error, children }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-semibold">{label}</span>
      {children}
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
