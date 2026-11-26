import 'server-only';
import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * @typedef {Object} BuffetPackage
 * @property {string} id
 * @property {string} name
 * @property {number} adultPrice
 * @property {number} childPrice - เด็กส่วนสูงต่ำกว่า 120 ซม.
 * @property {number} durationMinutes
 */

/**
 * ข้อมูลหน้าราคาบุฟเฟต์: แพ็กเกจที่เปิดใช้งาน (ระบบใช้ได้ 1 ตัวพอดี) + อัตรา VAT
 * @returns {Promise<{ buffetPackage: BuffetPackage|null, activeCount: number, vatRatePercent: number, error: string|null }>}
 */
export async function getPackagesPageData() {
  // ข้อมูลต้องสดทุกครั้ง (ดูหมายเหตุใน tables/data.js)
  await connection();
  const supabase = await createClient();

  const [packageResult, vatResult] = await Promise.all([
    supabase
      .from('packages')
      .select('id, name, adult_price, child_price, duration_minutes')
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    supabase.from('app_settings').select('value').eq('key', 'vat_rate_percent').maybeSingle(),
  ]);

  if (packageResult.error || vatResult.error) {
    console.error('[packages data]', (packageResult.error || vatResult.error).message);
    return { buffetPackage: null, activeCount: 0, vatRatePercent: 7, error: 'โหลดราคาบุฟเฟต์ไม่สำเร็จ กรุณารีเฟรชหน้า' };
  }

  const firstPackage = packageResult.data[0];
  return {
    buffetPackage: firstPackage
      ? {
          id: firstPackage.id,
          name: firstPackage.name,
          adultPrice: Number(firstPackage.adult_price),
          childPrice: Number(firstPackage.child_price),
          durationMinutes: firstPackage.duration_minutes,
        }
      : null,
    activeCount: packageResult.data.length,
    vatRatePercent: Number(vatResult.data?.value ?? 7),
    error: null,
  };
}
