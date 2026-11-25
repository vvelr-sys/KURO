'use client';

import { useState } from 'react';
import { Baby, Clock, Percent, Save, User } from 'lucide-react';
import { saveBuffetPackage } from '@/app/(admin)/packages/actions';
import { AlertMessage, Button } from '@/components/ui';
import { cn, formatCurrency } from '@/lib/utils';

const INPUT_CLASS =
  'h-12 w-full rounded-xl border border-line bg-white px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

/** VAT แบบรวมในราคา (ถอด VAT ออกจากยอด) — สูตรเดียวกับ fn_calc_bill_vat */
function calcIncludedVat(total, ratePercent) {
  if (!(total > 0) || !(ratePercent >= 0)) return 0;
  return Math.round(((total * ratePercent) / (100 + ratePercent)) * 100) / 100;
}

/**
 * ฟอร์มราคาบุฟเฟต์ + VAT พร้อมตัวอย่างบิล (ผู้ใหญ่ 2 + เด็ก 1)
 * @param {Object} props
 * @param {import('@/app/(admin)/packages/data').BuffetPackage|null} props.initialPackage
 * @param {number} props.initialVatRatePercent
 */
export default function BuffetPackageForm({ initialPackage, initialVatRatePercent }) {
  const [values, setValues] = useState(() => ({
    name: initialPackage?.name ?? 'บุฟเฟต์ชาบู',
    adultPrice: String(initialPackage?.adultPrice ?? ''),
    childPrice: String(initialPackage?.childPrice ?? ''),
    durationMinutes: String(initialPackage?.durationMinutes ?? 90),
    vatRatePercent: String(initialVatRatePercent),
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(/** @type {{ tone: 'error'|'success', text: string } | null} */ (null));
  const [fieldErrors, setFieldErrors] = useState({});

  const setValue = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    const result = await saveBuffetPackage({ packageId: initialPackage?.id ?? null, ...values });
    setIsSaving(false);
    setFieldErrors(result.fieldErrors ?? {});
    setMessage(result.error ? { tone: 'error', text: result.error } : { tone: 'success', text: 'บันทึกแล้ว — โต๊ะที่เปิดใหม่ใช้ราคานี้ทันที' });
  };

  // ตัวอย่างบิล: ผู้ใหญ่ 2 + เด็ก 1
  const adultPrice = Number(values.adultPrice) || 0;
  const childPrice = Number(values.childPrice) || 0;
  const sampleTotal = adultPrice * 2 + childPrice;
  const sampleVat = calcIncludedVat(sampleTotal, Number(values.vatRatePercent));

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 xl:flex-row xl:items-start" noValidate>
      <section className="flex min-w-0 flex-1 flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm">
        <Field label="ชื่อแพ็กเกจ (แสดงในบิล)" error={fieldErrors.name}>
          <input value={values.name} onChange={setValue('name')} maxLength={100} className={INPUT_CLASS} />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field icon={User} label="ราคาผู้ใหญ่ (บาท/คน)" error={fieldErrors.adultPrice}>
            <input inputMode="decimal" value={values.adultPrice} onChange={setValue('adultPrice')} className={cn(INPUT_CLASS, 'text-right text-lg font-bold')} />
          </Field>
          <Field icon={Baby} label="ราคาเด็ก ส่วนสูงต่ำกว่า 120 ซม. (บาท/คน)" error={fieldErrors.childPrice}>
            <input inputMode="decimal" value={values.childPrice} onChange={setValue('childPrice')} className={cn(INPUT_CLASS, 'text-right text-lg font-bold')} />
          </Field>
          <Field icon={Clock} label="เวลาต่อรอบ (นาที)" error={fieldErrors.durationMinutes}>
            <input inputMode="numeric" value={values.durationMinutes} onChange={setValue('durationMinutes')} className={cn(INPUT_CLASS, 'text-right text-lg font-bold')} />
          </Field>
          <Field icon={Percent} label="VAT % (รวมอยู่ในราคาแล้ว)" error={fieldErrors.vatRatePercent}>
            <input inputMode="decimal" value={values.vatRatePercent} onChange={setValue('vatRatePercent')} className={cn(INPUT_CLASS, 'text-right text-lg font-bold')} />
          </Field>
        </div>

        <p className="text-sm text-ink-muted">ไม่มีค่าบริการ (Service Charge) · ราคาที่กรอกคือราคาที่ลูกค้าจ่าย ระบบถอด VAT ออกมาแสดงในใบเสร็จ</p>

        {message && <AlertMessage tone={message.tone}>{message.text}</AlertMessage>}
        <Button type="submit" size="lg" icon={Save} isLoading={isSaving} className="self-end">
          บันทึกราคา
        </Button>
      </section>

      <aside className="w-full rounded-3xl bg-white p-5 shadow-sm xl:sticky xl:top-24 xl:w-[22rem]">
        <p className="mb-3 font-bold">ตัวอย่างบิล: ผู้ใหญ่ 2 + เด็ก 1</p>
        <dl className="flex flex-col gap-2 rounded-2xl bg-surface p-4 text-sm">
          <Row label={`ผู้ใหญ่ 2 × ${formatCurrency(adultPrice)}`} value={formatCurrency(adultPrice * 2)} />
          <Row label={`เด็ก 1 × ${formatCurrency(childPrice)}`} value={formatCurrency(childPrice)} />
          <div className="my-1 border-t border-line" />
          <Row label="ยอดรวม" value={formatCurrency(sampleTotal)} isStrong />
          <Row label={`รวม VAT ${values.vatRatePercent || 0}% แล้ว`} value={formatCurrency(sampleVat)} />
          <Row label="เวลาทาน" value={`${values.durationMinutes || 0} นาที`} />
        </dl>
      </aside>
    </form>
  );
}

function Field({ icon: Icon, label, error, children }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-center gap-2 font-semibold">
        {Icon && <Icon className="size-4 text-primary" aria-hidden />}
        {label}
      </span>
      {children}
      {error && <span className="text-sm font-semibold text-danger">{error}</span>}
    </label>
  );
}

function Row({ label, value, isStrong = false }) {
  return (
    <div className={cn('flex justify-between gap-3', isStrong && 'text-base font-bold')}>
      <dt className={cn(!isStrong && 'text-ink-muted')}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
