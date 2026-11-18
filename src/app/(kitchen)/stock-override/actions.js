'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * ดึงรายการเมนูทั้งหมดพร้อมสถานะ availability_status จาก Database จริง
 * @returns {Promise<{ menuItems: Array, error: string|null }>}
 */
export async function getMenuItemsWithAvailability() {
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
 *
 * @param {string} menuItemId - UUID ของเมนูอาหาร
 * @param {string} newAvailability - สถานะใหม่ ('available' หรือ 'manual_off')
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function toggleMenuAvailability(menuItemId, newAvailability) {
  try {
    const allowedValues = ['available', 'manual_off'];
    if (!allowedValues.includes(newAvailability)) {
      return { success: false, error: `ค่า '${newAvailability}' ไม่ถูกต้องสำหรับ Override` };
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from('menu_items')
      .update({ availability_status: newAvailability })
      .eq('id', menuItemId);

    if (error) {
      console.error('[toggleMenuAvailability] Database Error:', error.message);
      return { success: false, error: error.message };
    }

    revalidatePath('/(kitchen)/stock-override');
    return { success: true, error: null };
  } catch (err) {
    console.error('[toggleMenuAvailability] Exception:', err.message);
    return { success: false, error: err.message };
  }
}
