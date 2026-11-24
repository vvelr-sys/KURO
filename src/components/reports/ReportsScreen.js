'use client';

import { useCallback, useEffect, useState } from 'react';
import { Banknote, Download, Printer, ReceiptText, TicketPercent, UsersRound } from 'lucide-react';
import { AlertMessage, Button, PrintPortal } from '@/components/ui';
import { PAYMENT_METHOD_LABELS } from '@/components/billing/paymentLabels';
import { cn, formatCurrency } from '@/lib/utils';
import SalesBarChart from './SalesBarChart';

/** วันที่ YYYY-MM-DD ตามเวลาไทย */
function bangkokDateText(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date);
}

/** ช่วงวันที่สำเร็จรูป */
function getPresetRange(preset) {
  const today = bangkokDateText();
  const [year, month] = today.split('-').map(Number);
  const pad = (value) => String(value).padStart(2, '0');
  if (preset === 'today') return { fromDate: today, toDate: today };
  if (preset === '7days') {
    return { fromDate: bangkokDateText(new Date(Date.now() - 6 * 86400000)), toDate: today };
  }
  if (preset === 'thisMonth') return { fromDate: `${year}-${pad(month)}-01`, toDate: today };
  // เดือนที่แล้ว
  const lastMonthYear = month === 1 ? year - 1 : year;
  const lastMonth = month === 1 ? 12 : month - 1;
  const lastDay = new Date(Date.UTC(lastMonthYear, lastMonth, 0)).getUTCDate();
  return { fromDate: `${lastMonthYear}-${pad(lastMonth)}-01`, toDate: `${lastMonthYear}-${pad(lastMonth)}-${pad(lastDay)}` };
}

const PRESETS = [
  { key: 'today', label: 'วันนี้' },
  { key: '7days', label: '7 วันล่าสุด' },
  { key: 'thisMonth', label: 'เดือนนี้' },
  { key: 'lastMonth', label: 'เดือนที่แล้ว' },
];

const INPUT_CLASS = 'h-11 rounded-xl border border-line bg-white px-3 outline-none focus:border-primary';

/** ข้อความในเซลล์ CSV (ครอบ " และ escape) */
function toCsvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * สร้างไฟล์ CSV ของรายงาน (เปิดด้วย Excel ได้ ภาษาไทยไม่เพี้ยนเพราะมี BOM)
 * @param {object} report
 */
function downloadReportCsv(report) {
  const { summary } = report;
  const lines = [
    ['รายงานยอดขาย KURO SHABU', `${report.fromDate} ถึง ${report.toDate}`],
    [],
    ['สรุป'],
    ['ยอดขายสุทธิ (บาท)', summary.totalSales],
    ['จำนวนบิล', summary.billCount],
    ['ลูกค้าผู้ใหญ่', summary.adultGuests],
    ['ลูกค้าเด็ก', summary.childGuests],
    ['เฉลี่ยต่อบิล (บาท)', summary.averagePerBill],
    ['เฉลี่ยต่อคน (บาท)', summary.averagePerGuest],
    ['ส่วนลดรวม (บาท)', summary.discountTotal],
    ['ค่าปรับเนื้อเหลือ (บาท)', summary.leftoverPenaltyTotal],
    ['เมนูสั่งเพิ่ม (บาท)', summary.extraItemsTotal],
    ['VAT 7% ในยอดขาย (บาท)', summary.vatTotal],
    [],
    [report.groupBy === 'month' ? 'เดือน' : 'วันที่', 'ยอดขาย (บาท)', 'จำนวนบิล', 'จำนวนลูกค้า'],
    ...report.periods.map((row) => [row.period, row.sales, row.bills, row.guests]),
    [],
    ['เมนูขายดี', 'จำนวนจาน'],
    ...report.topMenus.map((row) => [row.name, row.quantity]),
    [],
    ['ช่องทางชำระเงิน', 'ยอด (บาท)'],
    ...report.payments.map((row) => [PAYMENT_METHOD_LABELS[row.method]?.label ?? row.method, row.amount]),
  ];
  const csv = '﻿' + lines.map((line) => line.map(toCsvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `kuro-sales-${report.fromDate}_${report.toDate}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * เอกสารสำหรับพิมพ์ / บันทึกเป็น PDF (A4)
 * @param {{ report: object }} props
 */
function PrintableReport({ report }) {
  const { summary } = report;
  const rows = [
    ['ยอดขายสุทธิ', formatCurrency(summary.totalSales)],
    ['จำนวนบิล', `${summary.billCount} บิล`],
    ['ลูกค้า', `ผู้ใหญ่ ${summary.adultGuests} · เด็ก ${summary.childGuests} คน`],
    ['เฉลี่ยต่อบิล / ต่อคน', `${formatCurrency(summary.averagePerBill)} / ${formatCurrency(summary.averagePerGuest)}`],
    ['ส่วนลดรวม', formatCurrency(summary.discountTotal)],
    ['ค่าปรับเนื้อเหลือ', formatCurrency(summary.leftoverPenaltyTotal)],
    ['VAT 7% ในยอดขาย', formatCurrency(summary.vatTotal)],
  ];
  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 12, color: '#1b1c1c' }}>
      <h1 style={{ fontSize: 18, margin: 0 }}>รายงานยอดขาย KURO SHABU</h1>
      <p style={{ margin: '4px 0 12px' }}>
        ช่วงวันที่ {report.fromDate} ถึง {report.toDate}
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td style={{ border: '1px solid #ccc', padding: 4 }}>{label}</td>
              <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
        <thead>
          <tr>
            {[report.groupBy === 'month' ? 'เดือน' : 'วันที่', 'ยอดขาย', 'บิล', 'ลูกค้า'].map((title) => (
              <th key={title} style={{ border: '1px solid #ccc', padding: 4, background: '#f6f3f2' }}>
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.periods.map((row) => (
            <tr key={row.period}>
              <td style={{ border: '1px solid #ccc', padding: 4 }}>{row.period}</td>
              <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>{formatCurrency(row.sales)}</td>
              <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>{row.bills}</td>
              <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>{row.guests}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontWeight: 700, margin: '0 0 4px' }}>เมนูขายดี</p>
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {report.topMenus.map((row) => (
          <li key={row.name}>
            {row.name} — {row.quantity} จาน
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * หน้า 4.5 รายงานยอดขาย (Manager, Admin)
 * เลือกช่วงวันที่ → การ์ดสรุป, กราฟแท่งยอดขาย, เมนูขายดี, ช่องทางชำระเงิน · ส่งออก CSV (Excel) / พิมพ์เป็น PDF
 *
 * @param {{ loadReportAction: (range: { fromDate: string, toDate: string }) => Promise<{ report: object|null, error: string|null }> }} props
 */
export default function ReportsScreen({ loadReportAction }) {
  const [activePreset, setActivePreset] = useState('7days');
  const [range, setRange] = useState(() => getPresetRange('7days'));
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState(null);

  const loadReport = useCallback(
    async (nextRange) => {
      setIsLoading(true);
      const result = await loadReportAction(nextRange);
      setReport(result.report);
      setPageError(result.error);
      setIsLoading(false);
    },
    [loadReportAction]
  );

  useEffect(() => {
    let isCurrent = true;
    loadReportAction(getPresetRange('7days')).then((result) => {
      if (!isCurrent) return;
      setReport(result.report);
      setPageError(result.error);
      setIsLoading(false);
    });
    return () => {
      isCurrent = false;
    };
  }, [loadReportAction]);

  const choosePreset = (preset) => {
    const nextRange = getPresetRange(preset);
    setActivePreset(preset);
    setRange(nextRange);
    loadReport(nextRange);
  };

  const summary = report?.summary;
  const summaryCards = summary
    ? [
        { label: 'ยอดขายสุทธิ', value: formatCurrency(summary.totalSales), icon: Banknote, iconClass: 'bg-primary text-white' },
        { label: 'จำนวนบิล', value: `${summary.billCount} บิล`, sub: `เฉลี่ย ${formatCurrency(summary.averagePerBill)}/บิล`, icon: ReceiptText, iconClass: 'bg-surface text-ink' },
        {
          label: 'ลูกค้า',
          value: `${summary.adultGuests + summary.childGuests} คน`,
          sub: `ผู้ใหญ่ ${summary.adultGuests} · เด็ก ${summary.childGuests} · เฉลี่ย ${formatCurrency(summary.averagePerGuest)}/คน`,
          icon: UsersRound,
          iconClass: 'bg-emerald-800 text-white',
        },
        {
          label: 'ส่วนลดรวม',
          value: formatCurrency(summary.discountTotal),
          sub: `ค่าปรับเนื้อเหลือ ${formatCurrency(summary.leftoverPenaltyTotal)}`,
          icon: TicketPercent,
          iconClass: 'bg-danger-soft text-danger',
        },
      ]
    : [];

  const maxMenuQuantity = report?.topMenus[0]?.quantity ?? 0;
  const paymentTotal = report?.payments.reduce((sum, row) => sum + row.amount, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">รายงานยอดขาย</h1>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" icon={Download} disabled={!report} onClick={() => downloadReportCsv(report)}>
            ส่งออก Excel (CSV)
          </Button>
          <Button variant="secondary" icon={Printer} disabled={!report} onClick={() => window.print()}>
            พิมพ์ / PDF
          </Button>
        </div>
      </div>

      {/* ─── เลือกช่วงวันที่ ─── */}
      <form
        className="flex flex-wrap items-end gap-2 rounded-3xl bg-white p-3 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setActivePreset(null);
          loadReport(range);
        }}
      >
        {PRESETS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => choosePreset(key)}
            aria-pressed={activePreset === key}
            className={cn(
              'flex h-11 items-center rounded-full px-4 font-semibold transition-colors',
              activePreset === key ? 'bg-primary text-white' : 'bg-surface text-ink hover:bg-primary/5'
            )}
          >
            {label}
          </button>
        ))}
        <label className="ml-auto flex flex-col gap-1 text-sm">
          <span className="font-semibold">ตั้งแต่</span>
          <input type="date" className={INPUT_CLASS} value={range.fromDate} onChange={(e) => setRange((r) => ({ ...r, fromDate: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">ถึง</span>
          <input type="date" className={INPUT_CLASS} value={range.toDate} onChange={(e) => setRange((r) => ({ ...r, toDate: e.target.value }))} />
        </label>
        <Button type="submit" isLoading={isLoading}>
          ดูรายงาน
        </Button>
      </form>

      <AlertMessage>{pageError}</AlertMessage>
      {report?.isTruncated && <AlertMessage>ข้อมูลมากเกินไป ตัวเลขอาจไม่ครบ — กรุณาเลือกช่วงวันที่ให้สั้นลง</AlertMessage>}

      {isLoading && !report ? (
        <div className="h-96 animate-pulse rounded-3xl bg-white" aria-hidden />
      ) : report ? (
        <>
          {/* ─── การ์ดสรุป ─── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map(({ label, value, sub, icon: Icon, iconClass }) => (
              <div key={label} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
                <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl', iconClass)}>
                  <Icon className="size-6" aria-hidden />
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="text-sm text-ink-muted">{label}</p>
                  <p className="text-2xl font-bold tabular-nums">{value}</p>
                  {sub && <p className="truncate text-xs text-ink-muted">{sub}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* ─── กราฟยอดขาย ─── */}
          <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">ยอดขาย{report.groupBy === 'month' ? 'รายเดือน' : 'รายวัน'}</h2>
            {summary.billCount === 0 ? (
              <p className="p-8 text-center text-ink-muted">ยังไม่มีบิลที่ชำระแล้วในช่วงนี้</p>
            ) : (
              <SalesBarChart periods={report.periods} />
            )}
            <p className="text-xs text-ink-muted">นับเฉพาะบิลที่ชำระเงินแล้ว ตามวันเวลาที่ชำระ · ยอดรวม VAT 7% แล้ว ({formatCurrency(summary.vatTotal)})</p>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* ─── เมนูขายดี ─── */}
            <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold">เมนูขายดี 10 อันดับ</h2>
              {report.topMenus.length === 0 ? (
                <p className="p-6 text-center text-ink-muted">ยังไม่มีออเดอร์ในช่วงนี้</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {report.topMenus.map((row, index) => (
                    <li key={row.name} className="flex items-center gap-3">
                      <span className="w-6 text-right font-bold text-ink-muted">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between gap-2 text-sm">
                          <span className="truncate font-semibold">{row.name}</span>
                          <span className="shrink-0 tabular-nums">{row.quantity} จาน</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-surface">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${(row.quantity / maxMenuQuantity) * 100}%` }} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* ─── ช่องทางชำระเงิน ─── */}
            <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold">ช่องทางชำระเงิน</h2>
              {report.payments.length === 0 ? (
                <p className="p-6 text-center text-ink-muted">ยังไม่มีการชำระเงินในช่วงนี้</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {report.payments.map((row) => {
                    const method = PAYMENT_METHOD_LABELS[row.method];
                    const Icon = method?.icon ?? Banknote;
                    const percent = paymentTotal > 0 ? Math.round((row.amount / paymentTotal) * 100) : 0;
                    return (
                      <li key={row.method} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
                        <Icon className="size-5 shrink-0 text-ink-muted" aria-hidden />
                        <span className="flex-1 font-semibold">{method?.label ?? row.method}</span>
                        <span className="text-sm text-ink-muted">{percent}%</span>
                        <span className="font-bold tabular-nums">{formatCurrency(row.amount)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <PrintPortal paper="a4">
            <PrintableReport report={report} />
          </PrintPortal>
        </>
      ) : null}
    </div>
  );
}
