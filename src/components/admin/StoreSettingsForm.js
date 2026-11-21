'use client';

import { useState } from 'react';
import { Eye, Receipt, Save, Scale, Store } from 'lucide-react';
import { saveStoreSettings } from '@/app/(admin)/settings/actions';
import { ReceiptDocument } from '@/components/billing';
import { AlertMessage, Button } from '@/components/ui';
import { isValidThaiTaxId, normalizeTaxId } from '@/lib/tax-id';
import { cn } from '@/lib/utils';

const INPUT_CLASS =
  'h-12 w-full rounded-xl border border-line bg-white px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

/** ใบเสร็จตัวอย่าง (ข้อมูลสมมติ) สำหรับดูหน้าตาหัว/ท้ายใบเสร็จขณะแก้ */
const SAMPLE_SESSION = { tableNumbers: 'T01', adultCount: 2, childCount: 1 };
const SAMPLE_BILL = {
  billNumber: 'INV-ตัวอย่าง-001',
  issuedAt: '2026-01-01T12:00:00+07:00',
  lines: [
    { itemType: 'buffet_adult', description: 'บุฟเฟต์ผู้ใหญ่', quantity: 2, unitPrice: 299, totalPrice: 598 },
    { itemType: 'buffet_child', description: 'บุฟเฟต์เด็ก (ต่ำกว่า 120 ซม.)', quantity: 1, unitPrice: 149, totalPrice: 149 },
  ],
  totalAmount: 747,
  vatAmount: 48.87,
  payments: [{ method: 'cash', amount: 747, cashTendered: 1000, reference: null }],
  cashierName: 'ชื่อแคชเชียร์',
};

/**
 * ฟอร์มข้อมูลร้าน + ข้อความใบเสร็จ + อัตราค่าปรับ พร้อมตัวอย่างใบเสร็จสด (ตาม Figma)
 * @param {Object} props
 * @param {Record<string, string>} props.initialSettings
 */
export default function StoreSettingsForm({ initialSettings }) {
  const [values, setValues] = useState(initialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(/** @type {{ tone: 'error'|'success', text: string } | null} */ (null));
  const [fieldErrors, setFieldErrors] = useState({});

  const setValue = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const taxIdDigits = normalizeTaxId(values.store_tax_id);
  const isTaxIdInvalid = taxIdDigits.length === 13 && !isValidThaiTaxId(taxIdDigits);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    const result = await saveStoreSettings(values);
    setIsSaving(false);
    setFieldErrors(result.fieldErrors ?? {});
    setMessage(result.error ? { tone: 'error', text: result.error } : { tone: 'success', text: 'บันทึกการตั้งค่าแล้ว — ใบเสร็จใบถัดไปใช้ข้อมูลใหม่ทันที' });
  };

  // ข้อมูลร้านสำหรับตัวอย่างใบเสร็จ (อัปเดตตามที่พิมพ์)
  const previewStore = {
    name: values.store_name || 'ชื่อร้าน',
    branch: values.store_branch,
    address: values.store_address,
    taxId: values.store_tax_id,
    phone: values.store_phone,
    headerMessage: values.receipt_header_message,
    footerMessage: values.receipt_footer_message,
    vatRatePercent: 7,
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 xl:flex-row xl:items-start" noValidate>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Section icon={Store} title="ข้อมูลร้าน" description="แสดงบนใบเสร็จและใบกำกับภาษี (ต้องตรงกับทะเบียนภาษีมูลค่าเพิ่ม)">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="ชื่อร้าน *" error={fieldErrors.store_name}>
              <input value={values.store_name} onChange={setValue('store_name')} maxLength={100} className={INPUT_CLASS} />
            </Field>
            <Field label="สาขา" error={fieldErrors.store_branch}>
              <input value={values.store_branch} onChange={setValue('store_branch')} maxLength={60} placeholder="สำนักงานใหญ่" className={INPUT_CLASS} />
            </Field>
            <Field label="เลขประจำตัวผู้เสียภาษี 13 หลัก *" error={fieldErrors.store_tax_id ?? (isTaxIdInvalid ? 'เลขไม่ถูกต้อง (ตรวจหลักสุดท้ายไม่ผ่าน)' : null)}>
              <input
                inputMode="numeric"
                value={values.store_tax_id}
                onChange={setValue('store_tax_id')}
                maxLength={17}
                className={cn(INPUT_CLASS, 'font-mono tracking-wider')}
              />
            </Field>
            <Field label="เบอร์โทรร้าน" error={fieldErrors.store_phone}>
              <input value={values.store_phone} onChange={setValue('store_phone')} maxLength={30} className={INPUT_CLASS} />
            </Field>
            <div className="md:col-span-2">
              <Field label="ที่อยู่ตามทะเบียนภาษี *" error={fieldErrors.store_address}>
                <textarea
                  value={values.store_address}
                  onChange={setValue('store_address')}
                  maxLength={300}
                  rows={2}
                  className="w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </Field>
            </div>
          </div>
        </Section>

        <Section icon={Receipt} title="ข้อความบนใบเสร็จ" description="ไม่บังคับ — เว้นว่างได้">
          <div className="grid gap-4">
            <Field label="ข้อความต้อนรับ (หัวใบเสร็จ)" error={fieldErrors.receipt_header_message}>
              <input value={values.receipt_header_message} onChange={setValue('receipt_header_message')} maxLength={200} className={INPUT_CLASS} />
            </Field>
            <Field label="ข้อความขอบคุณ (ท้ายใบเสร็จ)" error={fieldErrors.receipt_footer_message}>
              <input
                value={values.receipt_footer_message}
                onChange={setValue('receipt_footer_message')}
                maxLength={200}
                placeholder="ขอบคุณที่ใช้บริการ"
                className={INPUT_CLASS}
              />
            </Field>
          </div>
        </Section>

        <Section icon={Scale} title="ค่าปรับเนื้อสัตว์เหลือ" description="คิดทุก 100 กรัม ปัดขึ้น (กฎข้อ 6) — มีผลกับการชั่งครั้งถัดไป ไม่กระทบที่ชั่งไปแล้ว">
          <Field label="บาท ต่อ 100 กรัม" error={fieldErrors.penalty_rate_per_100g}>
            <input
              inputMode="decimal"
              value={values.penalty_rate_per_100g}
              onChange={setValue('penalty_rate_per_100g')}
              className={cn(INPUT_CLASS, 'max-w-48 text-right text-lg font-bold')}
            />
          </Field>
        </Section>

        {message && <AlertMessage tone={message.tone}>{message.text}</AlertMessage>}
        <Button type="submit" size="lg" icon={Save} isLoading={isSaving} className="self-end">
          บันทึกการตั้งค่า
        </Button>
      </div>

      <aside className="w-full rounded-3xl bg-white p-5 shadow-sm xl:sticky xl:top-24 xl:w-[24rem]">
        <p className="mb-3 flex items-center gap-2 font-bold">
          <Eye className="size-5 text-primary" aria-hidden />
          ตัวอย่างใบเสร็จ (80 มม.)
        </p>
        <div className="rounded-2xl bg-surface p-4">
          <ReceiptDocument variant="receipt" store={previewStore} session={SAMPLE_SESSION} bill={SAMPLE_BILL} />
        </div>
      </aside>
    </form>
  );
}

function Section({ icon: Icon, title, description, children }) {
  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary">
          <Icon className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {description && <p className="text-sm text-ink-muted">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, error, children }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-semibold">{label}</span>
      {children}
      {error && <span className="text-sm font-semibold text-danger">{error}</span>}
    </label>
  );
}
