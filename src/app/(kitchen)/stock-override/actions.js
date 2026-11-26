'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { toDisplayError } from '@/lib/action-helpers';
import { checkActionRole } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/constants';

// ตำแหน่งที่เปิด/ปิดเมนูได้ (kitchen, manager, admin)
const OVERRIDE_ROLES = ROUTE_PERMISSIONS['/stock-override'];

/**
 * ดึงรายการเมนูทั้งหมดพร้อมสถานะ availability_status จาก Database จริง
 * @returns {Promise<{ menuItems: Array, error: string|null }>}
 */
export async function getMenuItemsWithAvailability() {
  const { error: roleError } = await checkActionRole(OVERRIDE_ROLES);
  if (roleError) return { menuItems: [], error: roleError };

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name, image_url, kitchen_station, availability_status, disabled_reason, category_id, categories(name)')
      .order('kitchen_station', { ascending: true })
      .order('name', { ascending: true });

    if (error) return { menuItems: [], error: toDisplayError(error, 'stock-override load') };
    return { menuItems: data || [], error: null };
  } catch (err) {
    return { menuItems: [], error: toDisplayError(err, 'stock-override load') };
  }
}

/**
 * เปิด/ปิดขายเมนูด้วยมือ ('available' ↔ 'manual_off') — ใช้ร่วมกับหน้า /menu
 * ทำผ่านฟังก์ชัน fn_set_menu_availability (migration 028) เพราะ role ครัวไม่มีสิทธิ์แก้ตาราง menu_items ตรง
 * ฟังก์ชันตรวจ: ตำแหน่ง, เหตุผล (บังคับตอนปิด), เมนู out_of_stock เปลี่ยนด้วยมือไม่ได้
 * แล้วบันทึก disabled_reason + Audit MANUAL_OFF_MENU ในคราวเดียว
 *
 * @param {string} menuItemId - UUID ของเมนูอาหาร
 * @param {'available'|'manual_off'} newAvailability - สถานะใหม่
 * @param {string|null} reason - เหตุผลการปิดเมนู (บังคับเมื่อ manual_off)
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function toggleMenuAvailability(menuItemId, newAvailability, reason = null) {
  const { error: roleError } = await checkActionRole(OVERRIDE_ROLES);
  if (roleError) return { success: false, error: roleError };

  if (!['available', 'manual_off'].includes(newAvailability)) {
    return { success: false, error: 'สถานะเมนูไม่ถูกต้อง' };
  }
  const trimmedReason = reason?.trim() || null;
  if (newAvailability === 'manual_off' && !trimmedReason) {
    return { success: false, error: 'กรุณาระบุเหตุผลในการปิดเมนู' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('fn_set_menu_availability', {
    p_menu_item_id: menuItemId,
    p_status: newAvailability,
    p_reason: trimmedReason,
  });

  if (error) {
    // ยังไม่ได้รัน migration 028 → แจ้งให้ชัด แทนที่จะสำเร็จหลอกๆ
    if (error.code === 'PGRST202' || /fn_set_menu_availability/.test(error.message ?? '')) {
      return { success: false, error: 'ระบบยังไม่ได้อัปเดตฐานข้อมูล (รัน migration 028) — แจ้งผู้ดูแลระบบ' };
    }
    return { success: false, error: toDisplayError(error, 'stock-override toggle') };
  }

  revalidatePath('/stock-override');
  return { success: true, error: null };
}
