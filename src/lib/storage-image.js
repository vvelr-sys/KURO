import 'server-only';
import { MENU_IMAGE_BUCKET } from '@/lib/constants';

// ตัวช่วยฝั่งเซิร์ฟเวอร์สำหรับรูปใน Storage bucket menu-images (รูปเมนู + รูปวัตถุดิบ)

/**
 * path ของไฟล์ใน bucket จาก public URL
 * ต้องขึ้นต้นด้วย URL ของโปรเจกต์ Supabase เราเท่านั้น (ลิงก์เว็บอื่นที่หน้าตาคล้ายกัน → null)
 * กันการใส่ลิงก์ปลอม แล้วตอนเปลี่ยนรูประบบไปลบไฟล์รูปของเมนูอื่น
 * @param {string|null|undefined} imageUrl
 * @returns {string|null} เช่น 'items/xxxx.jpg'
 */
export function toStoragePath(imageUrl) {
  const projectUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const prefix = `${projectUrl}/storage/v1/object/public/${MENU_IMAGE_BUCKET}/`;
  if (!projectUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith(prefix)) return null;

  const path = imageUrl.slice(prefix.length);
  // อนุญาตเฉพาะ 2 โฟลเดอร์ที่ระบบอัปโหลดเอง และห้ามมี ../ หรือ query string
  return /^(items|ingredients)\/[\w-]+\.(jpg|png|webp)$/.test(path) ? path : null;
}

/**
 * ลบรูปเก่าออกจาก Storage (ลบไม่สำเร็จไม่เป็นไร — ไม่กระทบข้อมูลหลัก)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string|null|undefined} imageUrl
 */
export async function removeStoredImage(supabase, imageUrl) {
  const path = toStoragePath(imageUrl);
  if (!path) return;
  const { error } = await supabase.storage.from(MENU_IMAGE_BUCKET).remove([path]);
  if (error) console.error('[storage image remove]', error.message);
}
