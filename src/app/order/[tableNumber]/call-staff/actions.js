'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { toDisplayError } from '@/lib/action-helpers';
import { getCustomerTokenHash } from '@/lib/customer-session';

const REQUEST_TYPES = ['call_staff', 'water', 'change_pot', 'check_bill', 'other'];

/**
 * ลูกค้าแจ้งเรียกพนักงาน (FR-069) — ฐานข้อมูลกันกดซ้ำ: ประเภทเดิมที่ยังไม่เสร็จจะไม่สร้างใหม่
 * หน้าพนักงาน /service-requests รับรายการใหม่ผ่าน Realtime เอง
 * @param {string} tableNumber
 * @param {'call_staff'|'water'|'change_pot'|'check_bill'|'other'} requestType
 * @returns {Promise<{ alreadyRequested: boolean, error: string|null }>}
 */
export async function createCustomerServiceRequest(tableNumber, requestType) {
  if (!REQUEST_TYPES.includes(requestType)) {
    return { alreadyRequested: false, error: 'ประเภทคำขอไม่ถูกต้อง' };
  }
  const tokenHash = await getCustomerTokenHash();
  if (!tokenHash) {
    return { alreadyRequested: false, error: 'กรุณาสแกน QR ที่โต๊ะอีกครั้ง' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_customer_create_service_request', {
    p_token_hash: tokenHash,
    p_table_number: String(tableNumber),
    p_request_type: requestType,
  });
  if (error) {
    return { alreadyRequested: false, error: toDisplayError(error, 'customer create service request') };
  }

  // ส่งข้อมูลหน้าใหม่กลับไปพร้อมผลลัพธ์ → ปุ่มเปลี่ยนเป็น "แจ้งแล้ว" ทันทีโดยไม่ต้องรอรอบดึงข้อมูลถัดไป
  revalidatePath(`/order/${encodeURIComponent(String(tableNumber))}/call-staff`);
  return { alreadyRequested: Boolean(data?.already_requested), error: null };
}
