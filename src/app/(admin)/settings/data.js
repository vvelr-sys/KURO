import 'server-only';
import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * คีย์ใน app_settings ที่หน้าตั้งค่าร้านแก้ได้ (VAT แก้ที่หน้าราคาบุฟเฟต์ /packages ตามสเปก 4.3)
 * ใช้ร่วมกันระหว่าง data.js และ actions.js
 */
export const STORE_SETTING_KEYS = [
  'store_name',
  'store_branch',
  'store_address',
  'store_tax_id',
  'store_phone',
  'receipt_header_message',
  'receipt_footer_message',
  'penalty_rate_per_100g',
];

/**
 * @typedef {Object} SettingsTable
 * @property {string} id
 * @property {string} tableNumber
 * @property {number} capacity
 * @property {'available'|'occupied'|'cleaning'|'disabled'} status
 * @property {boolean} hasHistory - เคยมีลูกค้าใช้แล้ว (ลบไม่ได้ ให้ปิดใช้งานแทน)
 */

/**
 * ข้อมูลหน้าตั้งค่าร้าน: ค่าตั้งค่าปัจจุบัน + รายการโต๊ะ
 * @returns {Promise<{ settings: Record<string, string>, tables: SettingsTable[], error: string|null }>}
 */
export async function getSettingsPageData() {
  // ข้อมูลต้องสดทุกครั้ง + Supabase ใช้ Date.now() (ดูหมายเหตุใน tables/data.js)
  await connection();
  const supabase = await createClient();

  const [settingsResult, tablesResult] = await Promise.all([
    supabase.from('app_settings').select('key, value').in('key', STORE_SETTING_KEYS),
    supabase.from('dining_tables').select('id, table_number, capacity, status, session_tables(count)').order('table_number'),
  ]);

  if (settingsResult.error || tablesResult.error) {
    console.error('[settings data]', (settingsResult.error || tablesResult.error).message);
    return { settings: {}, tables: [], error: 'โหลดการตั้งค่าไม่สำเร็จ กรุณารีเฟรชหน้า' };
  }

  const settings = Object.fromEntries(STORE_SETTING_KEYS.map((key) => [key, '']));
  for (const row of settingsResult.data) settings[row.key] = row.value;

  const tables = tablesResult.data.map((table) => ({
    id: table.id,
    tableNumber: table.table_number,
    capacity: table.capacity,
    status: table.status,
    hasHistory: (table.session_tables?.[0]?.count ?? 0) > 0,
  }));

  return { settings, tables, error: null };
}
