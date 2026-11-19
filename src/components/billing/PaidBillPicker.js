'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, FileCheck2, Search } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { cn, formatClockTime, formatCurrency } from '@/lib/utils';

/**
 * เลือกบิลที่ชำระแล้ววันนี้เพื่อออกใบกำกับภาษี (ค้นหาเลขบิล/เลขโต๊ะได้)
 * @param {Object} props
 * @param {import('@/app/(pos)/billing/tax-invoice/data').PaidBillItem[]} props.bills
 */
export default function PaidBillPicker({ bills }) {
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounce(searchText.trim().toUpperCase(), 200);

  const visibleBills = useMemo(
    () =>
      debouncedSearch === ''
        ? bills
        : bills.filter(
            (bill) =>
              bill.billNumber.toUpperCase().includes(debouncedSearch) ||
              bill.tableNumbers.toUpperCase().includes(debouncedSearch)
          ),
    [bills, debouncedSearch]
  );

  return (
    <div className="flex flex-col gap-3">
      <label className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="ค้นหาเลขบิล หรือเลขโต๊ะ…"
          aria-label="ค้นหาบิล"
          className="h-12 w-full rounded-full bg-white pl-10 pr-4 shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
        />
      </label>

      {visibleBills.length === 0 ? (
        <p className="rounded-3xl bg-white p-8 text-center text-ink-muted">
          {bills.length === 0 ? 'วันนี้ยังไม่มีบิลที่ชำระแล้ว' : 'ไม่พบบิลที่ค้นหา'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibleBills.map((bill) => (
            <li key={bill.billId}>
              <Link
                href={`/billing/tax-invoice?billId=${bill.billId}`}
                className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm hover:shadow-md"
              >
                <span className="flex h-12 min-w-12 items-center justify-center rounded-xl bg-surface px-3 font-bold">
                  {bill.tableNumbers}
                </span>
                <div className="flex-1">
                  <p className="font-bold">{bill.billNumber}</p>
                  <p className="text-sm text-ink-muted">ชำระเมื่อ {formatClockTime(bill.paidAt)}</p>
                </div>
                <span
                  className={cn(
                    'flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold',
                    bill.invoiceNumber ? 'bg-emerald-100 text-emerald-800' : 'bg-surface text-ink-muted'
                  )}
                >
                  {bill.invoiceNumber && <FileCheck2 className="size-4" aria-hidden />}
                  {bill.invoiceNumber ?? 'ยังไม่ออกใบกำกับ'}
                </span>
                <span className="w-28 text-right font-bold tabular-nums">{formatCurrency(bill.totalAmount)}</span>
                <ChevronRight className="size-5 text-ink-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
