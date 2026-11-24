'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
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
      .select('id, name, kitchen_station, availability_status, category_id, categories(name)')
      .order('kitchen_station', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('[getMenuItemsWithAvailability] Database Error:', error.message);
      return { menuItems: [], error: error.message };
    }

    return { menuItems: data || [], error: null };
  } catch (err) {
    console.error('[getMenuItemsWithAvailability] Exception:', err.message);
    return { menuItems: [], error: 'เกิดข้อผิดพลาดในการดึงข้อมูลเมนู' };
  }
}

/**
 * เปลี่ยนสถานะ availability_status ของเมนูใน Database จริง
 * (Toggle ระหว่าง 'available' ↔ 'manual_off')
 * การปิดเมนู (manual_off) ต้องระบุเหตุผลและบันทึก Audit Log MANUAL_OFF_MENU (audit_matrix.md)
 *
 * @param {string} menuItemId - UUID ของเมนูอาหาร
 * @param {string} newAvailability - สถานะใหม่ ('available' หรือ 'manual_off')
 * @param {string|null} reason - เหตุผลการปิดเมนู (บังคับเมื่อ manual_off)
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function toggleMenuAvailability(menuItemId, newAvailability, reason = null) {
  const { staff, error: roleError } = await checkActionRole(OVERRIDE_ROLES);
  if (roleError) return { success: false, error: roleError };

  try {
    const allowedValues = ['available', 'manual_off'];
    if (!allowedValues.includes(newAvailability)) {
      return { success: false, error: `ค่า '${newAvailability}' ไม่ถูกต้องสำหรับ Override` };
    }

    const trimmedReason = reason?.trim() || null;
    if (newAvailability === 'manual_off' && !trimmedReason) {
      return { success: false, error: 'กรุณาระบุเหตุผลในการปิดเมนู' };
    }

    const supabase = await createClient();

    const { data: before, error: fetchError } = await supabase
      .from('menu_items')
      .select('name, availability_status')
      .eq('id', menuItemId)
      .single();

    if (fetchError || !before) {
      return { success: false, error: 'ไม่พบเมนูนี้' };
    }
    if (before.availability_status === 'out_of_stock') {
      return { success: false, error: 'เมนูนี้หมดสต็อกในระบบ ไม่สามารถเปิด/ปิดด้วยมือได้' };
    }

    const { error } = await supabase
      .from('menu_items')
      .update({ availability_status: newAvailability })
      .eq('id', menuItemId);

    if (error) {
      console.error('[toggleMenuAvailability] Database Error:', error.message);
      return { success: false, error: error.message };
    }

    // บันทึก Audit Log เมื่อทำการปิดเมนูด้วยมือ (MANUAL_OFF_MENU)
    if (newAvailability === 'manual_off') {
      const { error: auditError } = await supabase.from('audit_logs').insert({
        actor_id: staff.id,
        action: 'MANUAL_OFF_MENU',
        target_entity: 'menu_items',
        target_id: menuItemId,
        reason: trimmedReason,
        payload_before: { availability_status: before.availability_status },
        payload_after: { availability_status: 'manual_off', menu_item_name: before.name },
      });
      if (auditError) {
        console.error('[toggleMenuAvailability] Audit Log Error:', auditError.message);
      }
    }

    revalidatePath('/stock-override');
    return { success: true, error: null };
  } catch (err) {
    console.error('[toggleMenuAvailability] Exception:', err.message);
    return { success: false, error: err.message };
  }
}
