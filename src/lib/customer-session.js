import 'server-only';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { toDisplayError } from '@/lib/action-helpers';
import { CUSTOMER_TOKEN_COOKIE } from '@/lib/constants';
import { hashQrToken } from '@/lib/qr-token';

// ตัวช่วยฝั่งเซิร์ฟเวอร์ของหน้าลูกค้า /order/[tableNumber]/* (ใช้ร่วมทุกหน้าย่อย)
// ลูกค้าไม่ล็อกอิน → ทุกอย่างผ่านฟังก์ชันในฐานข้อมูลที่รับ hash ของ QR token (migration 025)
// token จริงอยู่ใน cookie httpOnly เท่านั้น ไม่ส่งไปฝั่งเบราว์เซอร์และไม่ส่งเข้าฐานข้อมูล

/**
 * @typedef {Object} CustomerSession
 * @property {string} sessionId
 * @property {'active'|'expired'|'closing'|'billed'} status
 * @property {string|null} expiresAt - เวลาหมดรอบ (ISO)
 * @property {string[]} tableNumbers - โต๊ะที่ผูกกับรอบนี้ (รวมโต๊ะแล้วมีหลายตัว)
 * @property {number} adultCount
 * @property {number} childCount
 */

/**
 * hash ของ token ใน cookie (null = ยังไม่ได้สแกน QR)
 * @returns {Promise<string|null>}
 */
export async function getCustomerTokenHash() {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_TOKEN_COOKIE)?.value;
  return token ? hashQrToken(token) : null;
}

/**
 * ตรวจ token + เลขโต๊ะ แล้วคืนข้อมูลรอบ
 * @param {string} tableNumber - เลขโต๊ะจาก URL เช่น T01
 * @returns {Promise<{ session: CustomerSession|null, tokenHash: string|null, error: string|null }>}
 */
export async function getCustomerSession(tableNumber) {
  const tokenHash = await getCustomerTokenHash();
  if (!tokenHash) {
    return { session: null, tokenHash: null, error: 'กรุณาสแกน QR ที่โต๊ะเพื่อเริ่มสั่งอาหาร' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_customer_get_session', {
    p_token_hash: tokenHash,
    p_table_number: tableNumber,
  });
  if (error) {
    return { session: null, tokenHash, error: toDisplayError(error, 'customer session') };
  }

  return {
    tokenHash,
    error: null,
    session: {
      sessionId: data.session_id,
      status: data.status,
      expiresAt: data.expires_at,
      tableNumbers: data.table_numbers ?? [],
      adultCount: data.adult_guest_count,
      childCount: data.child_guest_count,
    },
  };
}
