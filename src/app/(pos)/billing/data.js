import 'server-only';
import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @typedef {Object} BillingQueueItem - โต๊ะที่รอคิดเงิน
 * @property {string} sessionId
 * @property {string} tableNumbers - เช่น "T03"
 * @property {'closing'|'billed'} status
 * @property {number} guestCount
 * @property {boolean} hasLeftover - ชั่งเนื้อแล้วหรือยัง
 * @property {number|null} billTotal - ยอดบิล (null = ยังไม่ออกบิล)
 */

/**
 * @typedef {Object} BillLine
 * @property {string} itemType - buffet_adult / buffet_child / extra_item / leftover_penalty / discount
 * @property {string} description
 * @property {number} quantity
 * @property {number} unitPrice
 * @property {number} totalPrice
 */

/**
 * @typedef {Object} BillPayment
 * @property {'cash'|'promptpay'|'credit_card'} method
 * @property {number} amount
 * @property {number|null} cashTendered
 * @property {string|null} reference
 */

/**
 * @typedef {Object} BillingDetail
 * @property {string} sessionId
 * @property {'closing'|'billed'|'closed'|'active'|'expired'|'draft'} sessionStatus
 * @property {string} tableNumbers
 * @property {number} adultCount
 * @property {number} childCount
 * @property {string|null} startedAt
 * @property {{ weightGrams: number, penaltyAmount: number } | null} leftover
 * @property {BillLine[]} previewLines - รายการคำนวณล่วงหน้า (ก่อนออกบิล)
 * @property {{ id: string, billNumber: string, status: 'unpaid'|'paid', subtotal: number, discountAmount: number,
 *   discountReason: string|null, totalAmount: number, vatAmount: number, createdAt: string, paidAt: string|null,
 *   cashierName: string|null, lines: BillLine[], payments: BillPayment[] } | null} bill
 */

/**
 * @typedef {Object} StoreInfo - ข้อมูลร้านบนใบเสร็จ (จาก app_settings)
 * @property {string} name
 * @property {string} branch
 * @property {string} address
 * @property {string} taxId
 * @property {string} phone
 * @property {string} headerMessage - ข้อความต้อนรับหัวใบเสร็จ (ว่างได้)
 * @property {string} footerMessage - ข้อความขอบคุณท้ายใบเสร็จ (ว่างได้)
 * @property {number} vatRatePercent
 */

/**
 * รายการโต๊ะที่รอคิดเงิน (เชิญออกแล้ว / ออกบิลแล้วรอชำระ)
 * @returns {Promise<{ items: BillingQueueItem[], error: string|null }>}
 */
export async function getBillingQueue() {
  // ข้อมูลต้องสดทุกครั้ง + Supabase ใช้ Date.now() (ดูหมายเหตุใน tables/data.js)
  await connection();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('session_tables')
    .select(
      'dining_tables!inner(table_number), sessions!inner(id, status, adult_guest_count, child_guest_count, leftover_records(id), bills(total_amount))'
    )
    .eq('is_active', true)
    .in('sessions.status', ['closing', 'billed']);

  if (error) return { items: [], error: 'โหลดรายการโต๊ะรอคิดเงินไม่สำเร็จ กรุณารีเฟรชหน้า' };

  // 1 รอบอาจผูกหลายโต๊ะ (ข้อมูลเก่า) → รวมเลขโต๊ะไว้ในรายการเดียว
  const bySession = new Map();
  for (const row of data) {
    const session = row.sessions;
    const existing = bySession.get(session.id);
    if (existing) {
      existing.tableNumbers = `${existing.tableNumbers}, ${row.dining_tables.table_number}`;
      continue;
    }
    const bill = Array.isArray(session.bills) ? session.bills[0] : session.bills;
    const leftover = Array.isArray(session.leftover_records) ? session.leftover_records[0] : session.leftover_records;
    bySession.set(session.id, {
      sessionId: session.id,
      tableNumbers: row.dining_tables.table_number,
      status: session.status,
      guestCount: session.adult_guest_count + session.child_guest_count,
      hasLeftover: Boolean(leftover),
      billTotal: bill ? Number(bill.total_amount) : null,
    });
  }

  const items = [...bySession.values()].sort((first, second) => first.tableNumbers.localeCompare(second.tableNumbers));
  return { items, error: null };
}

/**
 * ข้อมูลบิลของรอบบริการ 1 รอบ (ใช้ทั้งก่อนออกบิล, ระหว่างรอชำระ และหลังชำระแล้ว)
 * @param {string} sessionId
 * @returns {Promise<{ detail: BillingDetail|null, error: string|null }>}
 */
export async function getBillingDetail(sessionId) {
  await connection();
  if (!UUID_PATTERN.test(sessionId ?? '')) return { detail: null, error: 'ไม่พบรอบบริการนี้' };
  const supabase = await createClient();

  const [sessionResult, tablesResult, leftoverResult, billResult, extrasResult] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, status, adult_guest_count, child_guest_count, adult_price_snapshot, child_price_snapshot, started_at')
      .eq('id', sessionId)
      .maybeSingle(),
    supabase
      .from('session_tables')
      .select('is_active, assigned_at, dining_tables!inner(table_number)')
      .eq('session_id', sessionId)
      .order('assigned_at', { ascending: false }),
    supabase.from('leftover_records').select('weight_grams, penalty_amount').eq('session_id', sessionId).maybeSingle(),
    supabase
      .from('bills')
      .select(
        'id, bill_number, status, buffet_subtotal, extra_items_subtotal, leftover_penalty_subtotal, discount_amount, discount_reason, total_amount, vat_amount, created_at, paid_at, bill_items(item_type, description, quantity, unit_price, total_price), payments(payment_method, amount_paid, cash_tendered, reference_note, created_at, profiles!payments_verified_by_fkey(full_name))'
      )
      .eq('session_id', sessionId)
      .maybeSingle(),
    // เมนูนอกบุฟเฟต์ที่ลูกค้าสั่ง (ราคา > 0) — ใช้แสดงตัวอย่างก่อนออกบิล
    supabase
      .from('order_items')
      .select('quantity, unit_price_snapshot, menu_items(name), orders!inner(session_id)')
      .eq('orders.session_id', sessionId)
      .neq('status', 'cancelled')
      .gt('unit_price_snapshot', 0),
  ]);

  const firstError = sessionResult.error || tablesResult.error || leftoverResult.error || billResult.error || extrasResult.error;
  if (firstError) {
    console.error('[billing data]', firstError.message);
    return { detail: null, error: 'โหลดข้อมูลบิลไม่สำเร็จ กรุณารีเฟรชหน้า' };
  }
  const session = sessionResult.data;
  if (!session) return { detail: null, error: 'ไม่พบรอบบริการนี้' };

  // โต๊ะที่ใช้อยู่ตอนนี้ ถ้าปิดรอบแล้ว (ปล่อยโต๊ะแล้ว) ใช้โต๊ะล่าสุด
  const activeTables = tablesResult.data.filter((row) => row.is_active);
  const tableRows = activeTables.length > 0 ? activeTables : tablesResult.data.slice(0, 1);
  const tableNumbers = tableRows.map((row) => row.dining_tables.table_number).join(', ') || '-';

  const leftover = leftoverResult.data
    ? { weightGrams: leftoverResult.data.weight_grams, penaltyAmount: Number(leftoverResult.data.penalty_amount) }
    : null;

  const adultPrice = Number(session.adult_price_snapshot);
  const childPrice = Number(session.child_price_snapshot);
  const previewLines = buildPreviewLines(session, adultPrice, childPrice, extrasResult.data, leftover);

  const billRow = billResult.data;
  const bill = billRow && {
    id: billRow.id,
    billNumber: billRow.bill_number,
    status: billRow.status,
    subtotal: Number(billRow.buffet_subtotal) + Number(billRow.extra_items_subtotal) + Number(billRow.leftover_penalty_subtotal),
    discountAmount: Number(billRow.discount_amount),
    discountReason: billRow.discount_reason,
    totalAmount: Number(billRow.total_amount),
    vatAmount: Number(billRow.vat_amount),
    createdAt: billRow.created_at,
    paidAt: billRow.paid_at,
    cashierName: billRow.payments[0]?.profiles?.full_name ?? null,
    lines: sortLines(
      billRow.bill_items.map((item) => ({
        itemType: item.item_type,
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        totalPrice: Number(item.total_price),
      }))
    ),
    payments: [...billRow.payments]
      .sort((first, second) => new Date(first.created_at) - new Date(second.created_at))
      .map((payment) => ({
        method: payment.payment_method,
        amount: Number(payment.amount_paid),
        cashTendered: payment.cash_tendered === null ? null : Number(payment.cash_tendered),
        reference: payment.reference_note,
      })),
  };

  return {
    detail: {
      sessionId: session.id,
      sessionStatus: session.status,
      tableNumbers,
      adultCount: session.adult_guest_count,
      childCount: session.child_guest_count,
      startedAt: session.started_at,
      leftover,
      previewLines,
      bill,
    },
    error: null,
  };
}

/** ลำดับรายการบนใบเสร็จ */
const LINE_ORDER = ['buffet_adult', 'buffet_child', 'extra_item', 'leftover_penalty', 'discount'];
function sortLines(lines) {
  return [...lines].sort((first, second) => LINE_ORDER.indexOf(first.itemType) - LINE_ORDER.indexOf(second.itemType));
}

/** คำนวณรายการล่วงหน้าแบบเดียวกับ fn_create_bill (ใช้แสดงก่อนกดออกบิล — ยอดจริงคำนวณในฐานข้อมูล) */
function buildPreviewLines(session, adultPrice, childPrice, extraItems, leftover) {
  const lines = [];
  if (session.adult_guest_count > 0) {
    lines.push({ itemType: 'buffet_adult', description: 'บุฟเฟต์ผู้ใหญ่', quantity: session.adult_guest_count, unitPrice: adultPrice, totalPrice: session.adult_guest_count * adultPrice });
  }
  if (session.child_guest_count > 0) {
    lines.push({ itemType: 'buffet_child', description: 'บุฟเฟต์เด็ก (ต่ำกว่า 120 ซม.)', quantity: session.child_guest_count, unitPrice: childPrice, totalPrice: session.child_guest_count * childPrice });
  }
  const extrasByKey = new Map();
  for (const item of extraItems) {
    const unitPrice = Number(item.unit_price_snapshot);
    const name = item.menu_items?.name ?? 'เมนูนอกบุฟเฟต์';
    const key = `${name}|${unitPrice}`;
    const line = extrasByKey.get(key) ?? { itemType: 'extra_item', description: name, quantity: 0, unitPrice, totalPrice: 0 };
    line.quantity += item.quantity;
    line.totalPrice = line.quantity * unitPrice;
    extrasByKey.set(key, line);
  }
  lines.push(...extrasByKey.values());
  if (leftover && leftover.penaltyAmount > 0) {
    lines.push({ itemType: 'leftover_penalty', description: `ค่าปรับเนื้อเหลือ ${leftover.weightGrams} กรัม`, quantity: 1, unitPrice: leftover.penaltyAmount, totalPrice: leftover.penaltyAmount });
  }
  return lines;
}

/**
 * ข้อมูลร้านสำหรับหัวใบเสร็จ (migration 007/008 เปิดให้พนักงานอ่านเฉพาะคีย์เหล่านี้)
 * @returns {Promise<StoreInfo>}
 */
export async function getStoreInfo() {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['store_name', 'store_branch', 'store_address', 'store_tax_id', 'store_phone', 'receipt_header_message', 'receipt_footer_message', 'vat_rate_percent']);

  const settings = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
  return {
    name: settings.store_name ?? 'KURO SHABU',
    branch: settings.store_branch ?? '',
    address: settings.store_address ?? '',
    taxId: settings.store_tax_id ?? '',
    phone: settings.store_phone ?? '',
    headerMessage: settings.receipt_header_message ?? '',
    footerMessage: settings.receipt_footer_message ?? '',
    vatRatePercent: Number(settings.vat_rate_percent ?? 7),
  };
}
