'use client';

import { useState } from 'react';
import { CircleCheck, Plus, Trash2 } from 'lucide-react';
import { AlertMessage, Button } from '@/components/ui';
import { parseBahtInput, toBaht, toSatang } from '@/lib/money';
import { cn, formatCurrency } from '@/lib/utils';
import CashKeypad from './CashKeypad';
import { PAYMENT_METHOD_LABELS } from './paymentLabels';

const SINGLE_METHODS = ['cash', 'promptpay', 'credit_card'];
let nextRowId = 1;

/** แถวแบ่งชำระว่าง 1 แถว */
function createSplitRow(method = 'cash', amountText = '') {
  nextRowId += 1;
  return { id: nextRowId, method, amountText, cashTenderedText: '', reference: '' };
}

/**
 * เลือกวิธีชำระเงินและยืนยันรับเงิน (FR-042, FR-043)
 * - เงินสด: กดรับเงิน → คำนวณเงินทอน
 * - พร้อมเพย์ / บัตร: แคชเชียร์ตรวจยอดเข้าเอง แล้วกดยืนยัน (กรอกเลขอ้างอิงได้ ไม่บังคับ)
 * - แบ่งชำระ: หลายช่องทาง ยอดรวมต้องเท่ายอดบิลพอดี
 * @param {Object} props
 * @param {number} props.totalAmount - ยอดที่ต้องชำระ (บาท)
 * @param {(payments: { method: string, amount: number, cashTendered?: number|null, reference?: string }[], options: { printReceipt: boolean }) => Promise<string|null>} props.onPay - คืน error หรือ null
 */
export default function PaymentPanel({ totalAmount, onPay }) {
  const [mode, setMode] = useState(/** @type {'cash'|'promptpay'|'credit_card'|'split'} */ ('cash'));
  const [cashText, setCashText] = useState('');
  const [reference, setReference] = useState('');
  const [splitRows, setSplitRows] = useState(() => [createSplitRow('cash'), createSplitRow('promptpay')]);
  const [printReceipt, setPrintReceipt] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const totalSatang = toSatang(totalAmount);

  // ===== เงินสดจ่ายทั้งหมด =====
  const cashReceived = parseBahtInput(cashText);
  const changeSatang = cashReceived === null ? null : toSatang(cashReceived) - totalSatang;

  // ===== แบ่งชำระ =====
  const splitPaidSatang = splitRows.reduce((sum, row) => sum + toSatang(parseBahtInput(row.amountText) ?? 0), 0);
  const splitRemainingSatang = totalSatang - splitPaidSatang;
  const splitRowsValid = splitRows.every((row) => {
    const amount = parseBahtInput(row.amountText);
    if (amount === null || amount <= 0) return false;
    if (row.method !== 'cash' || row.cashTenderedText === '') return true;
    const tendered = parseBahtInput(row.cashTenderedText);
    return tendered !== null && tendered >= amount;
  });

  const isZeroBill = totalSatang === 0;
  const canConfirm =
    isZeroBill ||
    (mode === 'cash' && changeSatang !== null && changeSatang >= 0) ||
    mode === 'promptpay' ||
    mode === 'credit_card' ||
    (mode === 'split' && splitRows.length >= 2 && splitRowsValid && splitRemainingSatang === 0);

  /** แปลงสิ่งที่กรอกเป็นรายการชำระที่ส่งให้เซิร์ฟเวอร์ */
  const buildPayments = () => {
    if (isZeroBill) return [];
    if (mode === 'cash') return [{ method: 'cash', amount: totalAmount, cashTendered: cashReceived }];
    if (mode === 'promptpay' || mode === 'credit_card') return [{ method: mode, amount: totalAmount, reference }];
    return splitRows.map((row) => ({
      method: row.method,
      amount: parseBahtInput(row.amountText),
      cashTendered: row.method === 'cash' ? parseBahtInput(row.cashTenderedText) : null,
      reference: row.reference,
    }));
  };

  const handleConfirm = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    const error = await onPay(buildPayments(), { printReceipt });
    // สำเร็จ → หน้าเปลี่ยนเป็นใบเสร็จเอง (ข้อมูลใหม่จาก refresh)
    if (error) {
      setErrorMessage(error);
      setIsSaving(false);
    }
  };

  const updateSplitRow = (rowId, changes) =>
    setSplitRows((rows) => rows.map((row) => (row.id === rowId ? { ...row, ...changes } : row)));

  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">เลือกวิธีชำระเงิน</h2>

      <div className="grid grid-cols-2 gap-2">
        {[...SINGLE_METHODS, 'split'].map((method) => {
          const { label, hint, icon: Icon } = PAYMENT_METHOD_LABELS[method];
          return (
            <button
              key={method}
              type="button"
              onClick={() => setMode(method)}
              aria-pressed={mode === method}
              className={cn(
                'flex items-center gap-3 rounded-2xl p-3 text-left ring-1 transition-colors',
                mode === method ? 'bg-primary text-white ring-primary' : 'bg-surface ring-transparent hover:bg-primary/5'
              )}
            >
              <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', mode === method ? 'bg-white/15' : 'bg-white')}>
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="leading-tight">
                <span className="block font-bold">{label}</span>
                <span className="text-xs opacity-80">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {isZeroBill && <AlertMessage tone="success">ยอดชำระ 0 บาท (ส่วนลดเต็มจำนวน) กดยืนยันเพื่อปิดบิลได้เลย</AlertMessage>}

      {/* ===== เงินสด ===== */}
      {!isZeroBill && mode === 'cash' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-surface p-3">
              <p className="text-sm text-ink-muted">รับเงินสด</p>
              <p className="text-2xl font-bold tabular-nums">{cashReceived === null ? '-' : formatCurrency(cashReceived)}</p>
            </div>
            <div className={cn('rounded-2xl p-3', changeSatang !== null && changeSatang < 0 ? 'bg-danger-soft' : 'bg-emerald-100')}>
              <p className="text-sm text-ink-muted">{changeSatang !== null && changeSatang < 0 ? 'ยังขาด' : 'เงินทอน'}</p>
              <p className="text-2xl font-bold tabular-nums">
                {changeSatang === null ? '-' : formatCurrency(toBaht(Math.abs(changeSatang)))}
              </p>
            </div>
          </div>
          <CashKeypad value={cashText} onChange={setCashText} amountDue={totalAmount} />
        </>
      )}

      {/* ===== พร้อมเพย์ / บัตร ===== */}
      {!isZeroBill && (mode === 'promptpay' || mode === 'credit_card') && (
        <div className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
          <p className="font-semibold">
            {mode === 'promptpay'
              ? `ให้ลูกค้าโอน ${formatCurrency(totalAmount)} แล้วตรวจยอดเงินเข้าในแอปธนาคารก่อนกดยืนยัน`
              : `รูดบัตร ${formatCurrency(totalAmount)} ที่เครื่อง EDC ให้ผ่านก่อนกดยืนยัน`}
          </p>
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            maxLength={100}
            placeholder={mode === 'promptpay' ? 'เลขอ้างอิงสลิป (ไม่บังคับ)' : 'เลขอนุมัติบัตร (ไม่บังคับ)'}
            className="h-11 rounded-xl border border-line bg-white px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      )}

      {/* ===== แบ่งชำระ ===== */}
      {!isZeroBill && mode === 'split' && (
        <div className="flex flex-col gap-3">
          {splitRows.map((row, index) => (
            <div key={row.id} className="flex flex-col gap-2 rounded-2xl bg-surface p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink-muted">#{index + 1}</span>
                <select
                  value={row.method}
                  onChange={(event) => updateSplitRow(row.id, { method: event.target.value })}
                  aria-label={`วิธีชำระรายการที่ ${index + 1}`}
                  className="h-11 rounded-xl border border-line bg-white px-3 font-semibold"
                >
                  {SINGLE_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {PAYMENT_METHOD_LABELS[method].label}
                    </option>
                  ))}
                </select>
                <input
                  inputMode="decimal"
                  value={row.amountText}
                  onChange={(event) => updateSplitRow(row.id, { amountText: event.target.value })}
                  placeholder="จำนวนเงิน"
                  aria-label={`จำนวนเงินรายการที่ ${index + 1}`}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-right font-bold tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => updateSplitRow(row.id, { amountText: String(toBaht(Math.max(0, splitRemainingSatang + toSatang(parseBahtInput(row.amountText) ?? 0)))) })}
                  className="h-11 rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-line"
                >
                  ที่เหลือ
                </button>
                {splitRows.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setSplitRows((rows) => rows.filter((item) => item.id !== row.id))}
                    className="rounded-xl p-2 text-danger hover:bg-danger-soft"
                    aria-label={`ลบรายการที่ ${index + 1}`}
                  >
                    <Trash2 className="size-5" aria-hidden />
                  </button>
                )}
              </div>
              {row.method === 'cash' ? (
                <input
                  inputMode="decimal"
                  value={row.cashTenderedText}
                  onChange={(event) => updateSplitRow(row.id, { cashTenderedText: event.target.value })}
                  placeholder="รับเงินสดมา (ไม่บังคับ ใช้คำนวณเงินทอน)"
                  className="h-10 rounded-xl border border-line bg-white px-3 text-sm"
                />
              ) : (
                <input
                  value={row.reference}
                  onChange={(event) => updateSplitRow(row.id, { reference: event.target.value })}
                  maxLength={100}
                  placeholder="เลขอ้างอิง (ไม่บังคับ)"
                  className="h-10 rounded-xl border border-line bg-white px-3 text-sm"
                />
              )}
              {row.method === 'cash' && parseBahtInput(row.cashTenderedText) !== null && parseBahtInput(row.amountText) !== null && (
                <p className="text-right text-sm text-emerald-800">
                  เงินทอน {formatCurrency(toBaht(toSatang(parseBahtInput(row.cashTenderedText)) - toSatang(parseBahtInput(row.amountText))))}
                </p>
              )}
            </div>
          ))}
          {splitRows.length < 10 && (
            <Button variant="secondary" icon={Plus} onClick={() => setSplitRows((rows) => [...rows, createSplitRow('cash')])}>
              เพิ่มช่องทาง
            </Button>
          )}
          <p className={cn('flex justify-between rounded-xl px-4 py-2 font-bold', splitRemainingSatang === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-50 text-amber-800')}>
            <span>{splitRemainingSatang >= 0 ? 'ยังเหลือ' : 'เกินยอด'}</span>
            <span className="tabular-nums">{formatCurrency(toBaht(Math.abs(splitRemainingSatang)))}</span>
          </p>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={printReceipt} onChange={(event) => setPrintReceipt(event.target.checked)} className="size-5 accent-primary" />
        พิมพ์ใบเสร็จทันทีหลังรับเงิน
      </label>

      <AlertMessage>{errorMessage}</AlertMessage>

      <Button size="lg" icon={CircleCheck} onClick={handleConfirm} isLoading={isSaving} disabled={!canConfirm}>
        ยืนยันรับชำระ {formatCurrency(totalAmount)} & ปิดบิล
      </Button>
    </section>
  );
}
