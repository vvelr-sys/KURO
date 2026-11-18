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

      // ใส่รายการอาหารเข้าไปในการ์ดโต๊ะนั้น
      ordersGrouped[orderId].items.push({
        id: item.id,
        menu_item_id: item.menu_item_id,
        menu_item_name: item.menu_items?.name || 'ไม่ทราบชื่อเมนู',
        quantity: item.quantity,
        status: item.status,
        cancel_reason: item.cancelled_reason,
        created_at: item.created_at,
        station: item.menu_items?.kitchen_station,
      });
    }

    // กรองเอาเฉพาะบิลที่ยังมีรายการค้างอยู่ (ยังไม่เสร็จทั้งหมด)
    const activeOrders = Object.values(ordersGrouped).filter((order) => {
      return order.items.some((item) => item.status === 'pending' || item.status === 'cooking');
    });

    return { orders: activeOrders, error: null };
  } catch (err) {
    console.error('เกิดข้อผิดพลาด:', err.message);
    return { orders: [], error: err.message };
  }
}

/**
 * ดึงรายการออเดอร์ที่เพิ่งเสิร์ฟล่าสุด (Recall Panel)
 * @param {number} limit
 */
export async function getRecentlyServedOrders(limit = 6) {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('order_items')
      .select(`
        id,
        order_id,
        quantity,
        status,
        created_at,
        menu_items!inner (
          name
        ),
        orders!inner (
          id,
          sessions!inner (
            session_tables (
              is_active,
              dining_tables (
                table_number
              )
            )
          )
        )
      `)
      .eq('status', 'served')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { items: [], error: error.message };
    }

    const formatted = (data || []).map((item) => {
      const sessionTables = item.orders?.sessions?.session_tables || [];
      const tables = sessionTables
        .filter((st) => st.is_active && st.dining_tables?.table_number)
        .map((st) => st.dining_tables.table_number);
      const tableLabel = tables.length > 0 ? tables.join(' + ') : 'ไม่ระบุ';

      return {
        id: item.id,
        order_id: item.order_id,
        table_number: tableLabel,
        menu_name: item.menu_items?.name || 'เมนู',
        quantity: item.quantity,
        created_at: item.created_at,
      };
    });

    return { items: formatted, error: null };
  } catch (err) {
    return { items: [], error: err.message };
  }
}

/**
 * อัปเดตสถานะของอาหารแต่ละจาน
 * 
 * @param {string} itemId - รหัสรายการอาหาร
 * @param {string} newStatus - สถานะใหม่ ('pending', 'cooking', 'served', 'cancelled')
 * @param {string|null} cancelReason - เหตุผลกรณียกเลิก
 */
export async function updateOrderItemStatus(itemId, newStatus, cancelReason) {
  try {
    const supabase = await createClient();

    // ดึงสถานะเดิมเพื่อนำมาตรวจสอบเงื่อนไขธุรกิจ
    const { data: currentItem } = await supabase
      .from('order_items')
      .select('status, menu_item_id, quantity')
      .eq('id', itemId)
      .single();

    // กฎธุรกิจ: ถ้ากด 'served' (เสิร์ฟแล้ว) ให้แวะสถานะ 'cooking' ก่อน เพื่อให้ระบบตัดสต็อกวัตถุดิบ (BOM)
    if (newStatus === 'served' && currentItem?.status === 'pending') {
      await supabase
        .from('order_items')
        .update({ status: 'cooking' })
        .eq('id', itemId);
    }

    // ข้อมูลที่จะอัปเดต
    const updatePayload = { status: newStatus };

    // ถ้าเป็นการยกเลิก (cancelled)
    if (newStatus === 'cancelled') {
      updatePayload.cancelled_reason = cancelReason ? cancelReason.trim() : 'ไม่ระบุเหตุผล';
      updatePayload.cancelled_at = new Date().toISOString();

      // กฎธุรกิจ FR-033: หากเดิมอยู่ในสถานะ 'cooking' (ตัดสต็อกไปแล้ว) ต้องคืนสต็อกตามสูตร BOM (cancel_return)
      if (currentItem && currentItem.status === 'cooking') {
        const { data: boms } = await supabase
          .from('menu_ingredients')
          .select('ingredient_id, quantity_required')
          .eq('menu_item_id', currentItem.menu_item_id);

        if (boms && boms.length > 0) {
          for (const bom of boms) {
            const returnQty = bom.quantity_required * currentItem.quantity;

            const { data: ing } = await supabase
              .from('ingredients')
              .select('current_stock')
              .eq('id', bom.ingredient_id)
              .single();

            if (ing) {
              const newBalance = Number(ing.current_stock) + Number(returnQty);
              await supabase
                .from('ingredients')
                .update({ current_stock: newBalance })
                .eq('id', bom.ingredient_id);

              await supabase.from('stock_movements').insert({
                ingredient_id: bom.ingredient_id,
                order_item_id: itemId,
                movement_type: 'cancel_return',
                quantity: returnQty,
                balance_after: newBalance,
                reason: `ยกเลิกออเดอร์ในครัว: ${cancelReason || 'ไม่ระบุเหตุผล'}`,
              });
            }
          }
        }
      }

      // บันทึก Audit Log (CANCEL_ORDER_ITEM) ตาม Audit Matrix
      await supabase.from('audit_logs').insert({
        action: 'CANCEL_ORDER_ITEM',
        target_entity: 'order_items',
        target_id: itemId,
        reason: cancelReason || 'ยกเลิกรายการอาหารในครัว',
        payload_after: { status: 'cancelled', reason: cancelReason },
      });
    }

    const { error } = await supabase
      .from('order_items')
      .update(updatePayload)
      .eq('id', itemId);

    if (error) {
      console.error('ไม่สามารถอัปเดตสถานะอาหารได้:', error.message);
      return { success: false, error: error.message };
    }

    revalidatePath('/(kitchen)/kds');
    return { success: true, error: null };
  } catch (err) {
    console.error('เกิดข้อผิดพลาด:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * เรียกคืนรายการที่เสิร์ฟไปแล้วกลับมาเป็น cooking / pending
 */
export async function recallOrderItem(itemId) {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from('order_items')
      .update({ status: 'cooking' })
      .eq('id', itemId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/(kitchen)/kds');
    return { success: true, error: null };
  } catch (err) {
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

    // 1. ตัดสต็อกวัตถุดิบสำหรับจานที่ยังรอทำอยู่ (pending -> cooking)
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
