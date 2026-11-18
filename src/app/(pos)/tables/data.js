import 'server-only';
import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * @typedef {Object} TableSession
 * @property {string} id
 * @property {'active'|'expired'|'closing'|'billed'} status
 * @property {number} adultCount
 * @property {number} childCount
 * @property {number} adultPrice - ราคาผู้ใหญ่ที่ล็อกไว้ตอนเปิดโต๊ะ
 * @property {number} childPrice
 * @property {number} buffetTotal - ค่าบุฟเฟต์รวม (ยังไม่รวมค่าปรับ/ส่วนลด)
 * @property {string} startedAt - ISO time
 * @property {string} expiresAt - ISO time
 * @property {number} orderedCount - จำนวนจานที่สั่ง (ไม่นับที่ยกเลิก)
 * @property {number} pendingCount - จำนวนจานที่ยังไม่เสิร์ฟ (pending + cooking)
 * @property {{ weightGrams: number, penaltyAmount: number } | null} leftover
 */

/**
 * @typedef {Object} TableItem
 * @property {string} id
 * @property {string} tableNumber
 * @property {number} capacity
 * @property {'available'|'occupied'|'cleaning'|'disabled'} status
 * @property {TableSession|null} session - รอบที่กำลังใช้โต๊ะนี้ (null = ไม่มี)
 */

/**
 * @typedef {Object} CalledQueue
 * @property {string} id
 * @property {string} queueNumber
 * @property {number} adultCount
 * @property {number} childCount
 * @property {string} tableSize
 */

/**
 * ดึงข้อมูลทั้งหมดของหน้าผังโต๊ะในครั้งเดียว (ยิงพร้อมกัน 4 คำสั่ง)
 * ใช้ client ที่มี session พนักงาน → RLS ทำงานตามปกติ
 * @returns {Promise<{ tables: TableItem[], calledQueues: CalledQueue[], activePackage: { name: string, adultPrice: number, childPrice: number, durationMinutes: number } | null, error: string|null }>}
 */
export async function getTableMapData() {
  // ข้อมูลโต๊ะต้องสดทุกครั้ง ห้ามเตรียมล่วงหน้า (prefetch) — และ Supabase เช็คอายุ token ด้วย Date.now()
  // ซึ่ง cacheComponents ไม่ยอมให้เรียกตอนเตรียมหน้าล่วงหน้า → connection() บอกให้รอ request จริงก่อน
  await connection();
  const supabase = await createClient();

  const [tablesResult, linksResult, queuesResult, packageResult] = await Promise.all([
    supabase.from('dining_tables').select('id, table_number, capacity, status').order('table_number'),
    // รอบที่ผูกกับโต๊ะอยู่ตอนนี้ (is_active) พร้อมข้อมูลรอบ
    supabase
      .from('session_tables')
      .select(
        'table_id, sessions!inner(id, status, adult_guest_count, child_guest_count, adult_price_snapshot, child_price_snapshot, started_at, expires_at)'
      )
      .eq('is_active', true),
    supabase
      .from('queues')
      .select('id, queue_number, adult_count, child_count, table_size')
      .eq('status', 'called')
      .order('called_at'),
    supabase
      .from('packages')
      .select('name, adult_price, child_price, duration_minutes')
      .eq('is_active', true),
  ]);

  const firstError = tablesResult.error || linksResult.error || queuesResult.error || packageResult.error;
  if (firstError) {
    return { tables: [], calledQueues: [], activePackage: null, error: 'โหลดข้อมูลโต๊ะไม่สำเร็จ กรุณารีเฟรชหน้า' };
  }

  const sessionIds = linksResult.data.map((link) => link.sessions.id);
  const { orderCounts, leftovers } = await getSessionExtras(supabase, sessionIds);

  // จับคู่ table_id → ข้อมูลรอบ
  const sessionByTableId = new Map();
  for (const link of linksResult.data) {
    const session = link.sessions;
    const adultPrice = Number(session.adult_price_snapshot);
    const childPrice = Number(session.child_price_snapshot);
    const counts = orderCounts.get(session.id) ?? { orderedCount: 0, pendingCount: 0 };
    sessionByTableId.set(link.table_id, {
      id: session.id,
      status: session.status,
      adultCount: session.adult_guest_count,
      childCount: session.child_guest_count,
      adultPrice,
      childPrice,
      buffetTotal: session.adult_guest_count * adultPrice + session.child_guest_count * childPrice,
      startedAt: session.started_at,
      expiresAt: session.expires_at,
      orderedCount: counts.orderedCount,
      pendingCount: counts.pendingCount,
      leftover: leftovers.get(session.id) ?? null,
    });
  }

  const tables = tablesResult.data.map((table) => ({
    id: table.id,
    tableNumber: table.table_number,
    capacity: table.capacity,
    status: table.status,
    session: sessionByTableId.get(table.id) ?? null,
  }));

  const calledQueues = queuesResult.data.map((queue) => ({
    id: queue.id,
    queueNumber: queue.queue_number,
    adultCount: queue.adult_count,
    childCount: queue.child_count,
    tableSize: queue.table_size,
  }));

  // ต้องมีแพ็กเกจเปิดใช้งาน 1 ตัวพอดี (ตรงกับที่ fn_open_table ตรวจ)
  const onlyPackage = packageResult.data.length === 1 ? packageResult.data[0] : null;
  const activePackage = onlyPackage && {
    name: onlyPackage.name,
    adultPrice: Number(onlyPackage.adult_price),
    childPrice: Number(onlyPackage.child_price),
    durationMinutes: onlyPackage.duration_minutes,
  };

  return { tables, calledQueues, activePackage, error: null };
}

/**
 * นับจานที่สั่ง + ดึงน้ำหนักเนื้อเหลือ ของรอบที่กำลังใช้โต๊ะ
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} sessionIds
 */
async function getSessionExtras(supabase, sessionIds) {
  const orderCounts = new Map();
  const leftovers = new Map();
  if (sessionIds.length === 0) return { orderCounts, leftovers };

  const [itemsResult, leftoverResult] = await Promise.all([
    supabase
      .from('order_items')
      .select('quantity, status, orders!inner(session_id)')
      .in('orders.session_id', sessionIds)
      .neq('status', 'cancelled'),
    supabase
      .from('leftover_records')
      .select('session_id, weight_grams, penalty_amount')
      .in('session_id', sessionIds),
  ]);

  for (const item of itemsResult.data ?? []) {
    const sessionId = item.orders.session_id;
    const counts = orderCounts.get(sessionId) ?? { orderedCount: 0, pendingCount: 0 };
    counts.orderedCount += item.quantity;
    if (item.status === 'pending' || item.status === 'cooking') counts.pendingCount += item.quantity;
    orderCounts.set(sessionId, counts);
  }

  for (const record of leftoverResult.data ?? []) {
    leftovers.set(record.session_id, {
      weightGrams: record.weight_grams,
      penaltyAmount: Number(record.penalty_amount),
    });
  }

  return { orderCounts, leftovers };
}
