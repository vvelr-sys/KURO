import 'server-only';
import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBangkokDayStartIso } from '@/lib/utils';
import { getBillingDetail } from '../data';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @typedef {Object} PaidBillItem - บิลที่ชำระแล้ว (ให้เลือกออกใบกำกับภาษี)
 * @property {string} billId
 * @property {string} billNumber
 * @property {string} tableNumbers
 * @property {number} totalAmount
 * @property {string} paidAt
 * @property {string|null} invoiceNumber - เลขใบกำกับภาษี (null = ยังไม่ได้ออก)
 */

/**
 * @typedef {Object} IssuedTaxInvoice
 * @property {string} invoiceNumber
 * @property {string} customerName
 * @property {string} taxId
 * @property {string} branch - "สำนักงานใหญ่" / "สาขาที่ 00001" / "-" (บุคคลธรรมดา)
 * @property {string} address
 * @property {string|null} email
 * @property {string} issuedAt
 * @property {string|null} issuedByName
 */

/**
 * บิลที่ชำระแล้วของวันนี้ (เวลาไทย) ใหม่สุดอยู่บน
 * @returns {Promise<{ bills: PaidBillItem[], error: string|null }>}
 */
export async function getPaidBillsToday() {
  // ข้อมูลต้องสดทุกครั้ง + Supabase ใช้ Date.now() (ดูหมายเหตุใน tables/data.js)
  await connection();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('bills')
    .select(
      'id, bill_number, total_amount, paid_at, tax_invoices(invoice_number), sessions!inner(session_tables(assigned_at, dining_tables(table_number)))'
    )
    .eq('status', 'paid')
    .gte('paid_at', getBangkokDayStartIso())
    .order('paid_at', { ascending: false });

  if (error) {
    console.error('[tax-invoice data]', error.message);
    return { bills: [], error: 'โหลดรายการบิลไม่สำเร็จ กรุณารีเฟรชหน้า' };
  }

  const bills = data.map((bill) => {
    const tables = [...(bill.sessions?.session_tables ?? [])].sort(
      (first, second) => new Date(second.assigned_at) - new Date(first.assigned_at)
    );
    const invoice = Array.isArray(bill.tax_invoices) ? bill.tax_invoices[0] : bill.tax_invoices;
    return {
      billId: bill.id,
      billNumber: bill.bill_number,
      tableNumbers: tables[0]?.dining_tables?.table_number ?? '-',
      totalAmount: Number(bill.total_amount),
      paidAt: bill.paid_at,
      invoiceNumber: invoice?.invoice_number ?? null,
    };
  });

  return { bills, error: null };
}

/**
 * ข้อมูลสำหรับออก/พิมพ์ใบกำกับภาษีของบิล 1 ใบ
 * @param {string} billId
 * @returns {Promise<{ detail: import('../data').BillingDetail|null, invoice: IssuedTaxInvoice|null, error: string|null }>}
 */
export async function getTaxInvoiceContext(billId) {
  await connection();
  if (!UUID_PATTERN.test(billId ?? '')) return { detail: null, invoice: null, error: 'ไม่พบบิลนี้' };
  const supabase = await createClient();

  const { data: bill, error } = await supabase
    .from('bills')
    .select(
      'session_id, status, tax_invoices(invoice_number, customer_name, tax_id, branch, address, email, created_at, profiles!tax_invoices_issued_by_fkey(full_name))'
    )
    .eq('id', billId)
    .maybeSingle();

  if (error) {
    console.error('[tax-invoice data]', error.message);
    return { detail: null, invoice: null, error: 'โหลดข้อมูลบิลไม่สำเร็จ กรุณารีเฟรชหน้า' };
  }
  if (!bill) return { detail: null, invoice: null, error: 'ไม่พบบิลนี้' };
  if (bill.status !== 'paid') {
    return { detail: null, invoice: null, error: 'บิลนี้ยังไม่ได้ชำระเงิน — ออกใบกำกับภาษีได้หลังรับชำระแล้ว' };
  }

  const { detail, error: detailError } = await getBillingDetail(bill.session_id);
  if (detailError) return { detail: null, invoice: null, error: detailError };

  const row = Array.isArray(bill.tax_invoices) ? bill.tax_invoices[0] : bill.tax_invoices;
  const invoice = row
    ? {
        invoiceNumber: row.invoice_number,
        customerName: row.customer_name,
        taxId: row.tax_id,
        branch: row.branch,
        address: row.address,
        email: row.email,
        issuedAt: row.created_at,
        issuedByName: row.profiles?.full_name ?? null,
      }
    : null;

  return { detail, invoice, error: null };
}
