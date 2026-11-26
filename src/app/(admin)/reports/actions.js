'use server';

import { toDisplayError } from '@/lib/action-helpers';
import { checkActionRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ROUTE_PERMISSIONS } from '@/lib/constants';

// Server Action ของหน้ารายงานยอดขาย (manager, admin)
const REPORT_ROLES = ROUTE_PERMISSIONS['/reports'];

// Supabase ส่งได้ครั้งละไม่เกิน 1,000 แถว — ดึงทีละหน้า และหยุดที่เพดานกันหน้าค้าง
const PAGE_SIZE = 1000;
const MAX_ROWS = 20000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ดึงทุกแถวของ query ทีละหน้า
 * @param {(from: number, to: number) => PromiseLike<{ data: Array|null, error: object|null }>} fetchPage
 */
async function fetchAllRows(fetchPage) {
  const rows = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

/** วันที่ YYYY-MM-DD ตามเวลาไทยของเวลา ISO */
function toBangkokDate(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(iso));
}

/**
 * รายงานยอดขายช่วงวันที่ (นับเฉพาะบิลที่ชำระแล้ว ตามเวลาชำระ)
 * - สรุป: ยอดขายสุทธิ, จำนวนบิล, ลูกค้าผู้ใหญ่/เด็ก, ส่วนลด, VAT, ค่าปรับเนื้อเหลือ, เมนูสั่งเพิ่ม
 * - ยอดรายวัน (ช่วงยาวกว่า 62 วัน รวมเป็นรายเดือน)
 * - เมนูขายดี 10 อันดับ (จำนวนจานที่สั่งและไม่ถูกยกเลิก)
 * - แยกตามช่องทางชำระเงิน
 *
 * @param {{ fromDate: string, toDate: string }} range - YYYY-MM-DD ตามเวลาไทย
 * @returns {Promise<{ report: object|null, error: string|null }>}
 */
export async function getSalesReport({ fromDate, toDate }) {
  const { error: roleError } = await checkActionRole(REPORT_ROLES);
  if (roleError) return { report: null, error: roleError };

  if (!DATE_PATTERN.test(fromDate ?? '') || !DATE_PATTERN.test(toDate ?? '')) {
    return { report: null, error: 'กรุณาเลือกช่วงวันที่ให้ถูกต้อง' };
  }
  if (fromDate > toDate) return { report: null, error: 'วันเริ่มต้องไม่หลังวันสิ้นสุด' };

  const startIso = `${fromDate}T00:00:00+07:00`;
  const endIso = `${toDate}T23:59:59.999+07:00`;
  const supabase = await createClient();

  try {
    const [bills, payments, orderItems] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase
          .from('bills')
          .select(`
            id, total_amount, vat_amount, discount_amount, extra_items_subtotal, leftover_penalty_subtotal, paid_at,
            sessions ( adult_guest_count, child_guest_count )
          `)
          .eq('status', 'paid')
          .gte('paid_at', startIso)
          .lte('paid_at', endIso)
          .order('paid_at', { ascending: true })
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from('payments')
          .select('payment_method, amount_paid, bills!inner ( status, paid_at )')
          .eq('bills.status', 'paid')
          .gte('bills.paid_at', startIso)
          .lte('bills.paid_at', endIso)
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from('order_items')
          .select('quantity, menu_items ( name )')
          .neq('status', 'cancelled')
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .range(from, to)
      ),
    ]);

    // ─── สรุปภาพรวม ───
    const summary = {
      totalSales: 0,
      billCount: bills.length,
      adultGuests: 0,
      childGuests: 0,
      discountTotal: 0,
      vatTotal: 0,
      leftoverPenaltyTotal: 0,
      extraItemsTotal: 0,
    };

    // ─── ยอดตามช่วงเวลา (รายวัน หรือรายเดือนถ้าช่วงยาว) ───
    const dayCount = Math.round((new Date(`${toDate}T00:00:00Z`) - new Date(`${fromDate}T00:00:00Z`)) / 86400000) + 1;
    const groupBy = dayCount > 62 ? 'month' : 'day';
    const periods = new Map();

    // ใส่ทุกวัน/เดือนในช่วงไว้ก่อน (วันที่ไม่มียอดแสดงเป็น 0 ไม่หายไปจากกราฟ)
    for (let offset = 0; offset < dayCount; offset += 1) {
      const dateText = new Date(Date.parse(`${fromDate}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
      const key = groupBy === 'month' ? dateText.slice(0, 7) : dateText;
      if (!periods.has(key)) periods.set(key, { period: key, sales: 0, bills: 0, guests: 0 });
    }

    for (const bill of bills) {
      const total = Number(bill.total_amount);
      const adults = bill.sessions?.adult_guest_count ?? 0;
      const children = bill.sessions?.child_guest_count ?? 0;

      summary.totalSales += total;
      summary.adultGuests += adults;
      summary.childGuests += children;
      summary.discountTotal += Number(bill.discount_amount);
      summary.vatTotal += Number(bill.vat_amount);
      summary.leftoverPenaltyTotal += Number(bill.leftover_penalty_subtotal);
      summary.extraItemsTotal += Number(bill.extra_items_subtotal);

      const dateText = toBangkokDate(bill.paid_at);
      const key = groupBy === 'month' ? dateText.slice(0, 7) : dateText;
      const period = periods.get(key) ?? { period: key, sales: 0, bills: 0, guests: 0 };
      period.sales += total;
      period.bills += 1;
      period.guests += adults + children;
      periods.set(key, period);
    }

    // ปัดเศษสตางค์ (กันทศนิยมเพี้ยนจากการบวกหลายครั้ง)
    const roundMoney = (value) => Math.round(value * 100) / 100;
    for (const key of ['totalSales', 'discountTotal', 'vatTotal', 'leftoverPenaltyTotal', 'extraItemsTotal']) {
      summary[key] = roundMoney(summary[key]);
    }
    const guestTotal = summary.adultGuests + summary.childGuests;
    summary.averagePerBill = summary.billCount > 0 ? roundMoney(summary.totalSales / summary.billCount) : 0;
    summary.averagePerGuest = guestTotal > 0 ? roundMoney(summary.totalSales / guestTotal) : 0;

    // ─── ช่องทางชำระเงิน ───
    const paymentTotals = new Map();
    for (const payment of payments) {
      paymentTotals.set(payment.payment_method, (paymentTotals.get(payment.payment_method) ?? 0) + Number(payment.amount_paid));
    }

    // ─── เมนูขายดี ───
    const menuTotals = new Map();
    for (const item of orderItems) {
      const name = item.menu_items?.name ?? 'ไม่ทราบชื่อเมนู';
      menuTotals.set(name, (menuTotals.get(name) ?? 0) + item.quantity);
    }

    return {
      report: {
        fromDate,
        toDate,
        groupBy,
        summary,
        periods: [...periods.values()].map((row) => ({ ...row, sales: roundMoney(row.sales) })),
        payments: [...paymentTotals.entries()]
          .map(([method, amount]) => ({ method, amount: roundMoney(amount) }))
          .sort((a, b) => b.amount - a.amount),
        topMenus: [...menuTotals.entries()]
          .map(([name, quantity]) => ({ name, quantity }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 10),
        isTruncated: bills.length >= MAX_ROWS || orderItems.length >= MAX_ROWS,
      },
      error: null,
    };
  } catch (err) {
    return { report: null, error: toDisplayError(err, 'reports sales') };
  }
}
