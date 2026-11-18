'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * ดึงรายการออเดอร์ทั้งหมดสำหรับแสดงบนจอครัว KDS
 * ดึงเฉพาะรายการที่สถานะเป็น 'pending' (รอทำ), 'cooking' (กำลังทำ) หรือ 'served' (เสิร์ฟแล้ว)
 *
 * @param {string|null} selectedStation - สถานีครัว เช่น 'fresh', 'hot_kitchen' หรือ null = ทั้งหมด
 * @returns {Promise<{ orders: Array, error: string|null }>}
 */
export async function getKitchenOrders(selectedStation = null) {
  try {
    const supabase = await createClient();

    // 1. ดึงข้อมูลรายการอาหารที่สั่ง พร้อมข้อมูลเมนู และข้อมูลโต๊ะ
    let query = supabase
      .from('order_items')
      .select(`
        id,
        order_id,
        menu_item_id,
        quantity,
        status,
        cancelled_reason,
        created_at,
        menu_items!inner (
          name,
          kitchen_station
        ),
        orders!inner (
          id,
          session_id,
          sessions!inner (
            id,
            status,
            session_tables (
              is_active,
              dining_tables (
                table_number
              )
            )
          )
        )
      `)
      .in('status', ['pending', 'cooking', 'served'])
      .order('created_at', { ascending: true });

    // ถ้าเลือกกรองตามสถานีครัว ให้เลือกเฉพาะของสถานีนั้น
    if (selectedStation) {
      query = query.eq('menu_items.kitchen_station', selectedStation);
    }

    const { data: rawItems, error } = await query;

    if (error) {
      console.error('เกิดข้อผิดพลาดในการดึงข้อมูล:', error.message);
      return { orders: [], error: error.message };
    }

    if (!rawItems || rawItems.length === 0) {
      return { orders: [], error: null };
    }

    // 2. จัดกลุ่มรายการอาหารแยกตามใบออเดอร์ (แต่ละโต๊ะ)
    const ordersGrouped = {};

    for (const item of rawItems) {
      const orderId = item.order_id;

      // หาเลขโต๊ะ (รองรับกรณีรวมโต๊ะ เช่น โต๊ะ 01 + 02)
      const sessionTables = item.orders?.sessions?.session_tables || [];
      const tableNumbers = [];
      for (const st of sessionTables) {
        if (st.is_active && st.dining_tables?.table_number) {
          tableNumbers.push(st.dining_tables.table_number);
        }
      }

      const tableLabel = tableNumbers.length > 0 
        ? tableNumbers.join(' + ') 
        : 'ไม่ระบุโต๊ะ';

      // ถ้ายังไม่มีบิลนี้ในกลุ่ม ให้สร้างกล่องรอไว้
      if (!ordersGrouped[orderId]) {
        ordersGrouped[orderId] = {
          order_id: orderId,
          table_number: tableLabel,
          session_id: item.orders?.session_id,
          items: [],
        };
      }

      // ใส่รายการอาหารลงในบิลของโต๊ะนั้น
      ordersGrouped[orderId].items.push({
        id: item.id,
        menu_item_id: item.menu_item_id,
        menu_item_name: item.menu_items?.name || 'ไม่มีชื่อเมนู',
        quantity: item.quantity,
        status: item.status,
        cancel_reason: item.cancelled_reason,
        created_at: item.created_at,
        station: item.menu_items?.kitchen_station,
      });
    }

    // แปลงข้อมูลจาก Object ให้เป็น Array เพื่อส่งให้หน้าจอใช้งาน
    return {
      orders: Object.values(ordersGrouped),
      error: null,
    };
  } catch (err) {
    console.error('เกิดข้อผิดพลาดไม่คาดคิด:', err.message);
    return {
      orders: [],
      error: 'เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล',
    };
  }
}

/**
 * เปลี่ยนสถานะของอาหารแต่ละจาน (กดทำเสร็จ หรือ กดย้อนกลับ)
 * 
 * @param {string} itemId - รหัสรายการอาหาร
 * @param {string} newStatus - สถานะใหม่ ('pending', 'cooking', 'served', 'cancelled')
 * @param {string|null} cancelReason - เหตุผลกรณียกเลิก
 */
export async function updateOrderItemStatus(itemId, newStatus, cancelReason) {
  try {
    const supabase = await createClient();

    // กฎธุรกิจ: ถ้ากด 'served' (เสิร์ฟแล้ว) ให้แวะสถานะ 'cooking' ก่อน เพื่อให้ระบบตัดสต็อกวัตถุดิบ
    if (newStatus === 'served') {
      await supabase
        .from('order_items')
        .update({ status: 'cooking' })
        .eq('id', itemId)
        .eq('status', 'pending');
    }

    // ข้อมูลที่จะอัปเดต
    const updatePayload = { status: newStatus };

    // ถ้าเป็นการยกเลิก ให้บันทึกเหตุผลและเวลาที่ยกเลิกด้วย
    if (newStatus === 'cancelled') {
      updatePayload.cancelled_reason = cancelReason ? cancelReason.trim() : 'ไม่ระบุเหตุผล';
      updatePayload.cancelled_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('order_items')
      .update(updatePayload)
      .eq('id', itemId);

    if (error) {
      console.error('ไม่สามารถอัปเดตสถานะอาหารได้:', error.message);
      return { success: false, error: error.message };
    }

    // แจ้ง Next.js ให้รีเฟรชข้อมูลหน้า KDS
    revalidatePath('/(kitchen)/kds');
    return { success: true, error: null };
  } catch (err) {
    console.error('เกิดข้อผิดพลาด:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * กดทำเสร็จทั้งหมดทุกจานในโต๊ะนี้ (จบทั้งบิลในคลิกเดียว)
 *
 * @param {string} orderId - รหัสบิลออเดอร์
 */
export async function markAllServed(orderId) {
  try {
    const supabase = await createClient();

    // 1. ตัดสต็อกวัตถุดิบสำหรับจานที่ยังรอทำอยู่
    await supabase
      .from('order_items')
      .update({ status: 'cooking' })
      .eq('order_id', orderId)
      .eq('status', 'pending');

    // 2. เปลี่ยนสถานะทุกจานในบิลนี้ให้เป็น 'served' (เสร็จทั้งหมด)
    const { error } = await supabase
      .from('order_items')
      .update({ status: 'served' })
      .eq('order_id', orderId)
      .in('status', ['pending', 'cooking']);

    if (error) {
      console.error('ไม่สามารถทำเสร็จทั้งหมดได้:', error.message);
      return { success: false, error: error.message };
    }

    revalidatePath('/(kitchen)/kds');
    return { success: true, error: null };
  } catch (err) {
    console.error('เกิดข้อผิดพลาด:', err.message);
    return { success: false, error: err.message };
  }
}
