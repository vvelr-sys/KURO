'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { checkActionRole } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/constants';

// ตำแหน่งที่ใช้จอครัวได้ (kitchen, manager, admin) — ตรวจทุก Action เพราะ Action ถูกเรียกตรงผ่าน POST ได้
const KITCHEN_ROLES = ROUTE_PERMISSIONS['/kds'];

/**
 * ดึงรายการออเดอร์ทั้งหมดสำหรับแสดงบนจอครัว KDS
 * ดึงเฉพาะรายการที่สถานะเป็น 'pending' (รอทำ), 'cooking' (กำลังทำ) หรือ 'served' (เสิร์ฟแล้ว)
 *
 * @param {string|null} selectedStation - สถานีครัว เช่น 'fresh', 'hot_kitchen' หรือ null = ทั้งหมด
 * @returns {Promise<{ orders: Array, error: string|null }>}
 */
export async function getKitchenOrders(selectedStation = null) {
  const { error: roleError } = await checkActionRole(KITCHEN_ROLES);
  if (roleError) return { orders: [], error: roleError };

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
        order_item_options (
          menu_item_options (
            option_name
          )
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
        // ตัวเลือกที่ลูกค้าเลือก เช่น "น้ำจิ้มงา", "เผ็ดน้อย" (migration 025 ให้พนักงานอ่านได้)
        options: (item.order_item_options || [])
          .map((chosen) => chosen.menu_item_options?.option_name)
          .filter(Boolean),
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

// การเปลี่ยนสถานะที่อนุญาตบนจอครัว (SRS FR-021, FR-047–049)
// served เป็นสถานะสุดท้าย ย้อนกลับหรือยกเลิกไม่ได้
const ALLOWED_TRANSITIONS = {
  pending: ['cooking', 'cancelled'],
  cooking: ['served', 'cancelled'],
};

/**
 * อัปเดตสถานะของอาหารแต่ละจาน
 * - pending → cooking : ตัดสต็อกตาม BOM (DB trigger fn_deduct_stock_on_cooking)
 * - cooking → served
 * - pending/cooking → cancelled : ต้องมีเหตุผล, ถ้าเป็น cooking ระบบคืนสต็อกอัตโนมัติ
 *   (DB trigger fn_return_stock_on_cancel) และบันทึก Audit Log
 *
 * @param {string} itemId - รหัสรายการอาหาร
 * @param {'cooking'|'served'|'cancelled'} newStatus - สถานะใหม่
 * @param {string|null} cancelReason - เหตุผลกรณียกเลิก (บังคับเมื่อ cancelled)
 */
export async function updateOrderItemStatus(itemId, newStatus, cancelReason = null) {
  try {
    const { staff, error: roleError } = await checkActionRole(KITCHEN_ROLES);
    if (roleError) return { success: false, error: roleError };

    const supabase = await createClient();

    const { data: currentItem, error: fetchError } = await supabase
      .from('order_items')
      .select('status, quantity, menu_items(name)')
      .eq('id', itemId)
      .single();

    if (fetchError || !currentItem) {
      return { success: false, error: 'ไม่พบรายการอาหารนี้' };
    }

    const allowed = ALLOWED_TRANSITIONS[currentItem.status] || [];
    if (!allowed.includes(newStatus)) {
      return {
        success: false,
        error: `ไม่สามารถเปลี่ยนสถานะจาก '${currentItem.status}' เป็น '${newStatus}' ได้`,
      };
    }

    const updatePayload = { status: newStatus };

    if (newStatus === 'cancelled') {
      const reason = cancelReason?.trim();
      if (!reason) {
        return { success: false, error: 'กรุณาระบุเหตุผลในการยกเลิก' };
      }
      updatePayload.cancelled_reason = reason;
      updatePayload.cancelled_at = new Date().toISOString();
      updatePayload.cancelled_by = staff.id;
    }

    // อัปเดตแบบมีเงื่อนไขสถานะเดิม กันกรณีมีคนกดพร้อมกันหลายจอ
    const { data: updated, error } = await supabase
      .from('order_items')
      .update(updatePayload)
      .eq('id', itemId)
      .eq('status', currentItem.status)
      .select('id');

    if (error) {
      console.error('ไม่สามารถอัปเดตสถานะอาหารได้:', error.message);
      return { success: false, error: error.message };
    }
    if (!updated || updated.length === 0) {
      return { success: false, error: 'รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรช' };
    }

    if (newStatus === 'cancelled') {
      // Audit Log: CANCEL_ORDER_ITEM (audit_matrix.md)
      const { error: auditError } = await supabase.from('audit_logs').insert({
        actor_id: staff.id,
        action: 'CANCEL_ORDER_ITEM',
        target_entity: 'order_items',
        target_id: itemId,
        reason: updatePayload.cancelled_reason,
        payload_before: { status: currentItem.status },
        payload_after: {
          status: 'cancelled',
          menu_item_name: currentItem.menu_items?.name ?? null,
          quantity: currentItem.quantity,
        },
      });
      if (auditError) {
        console.error('บันทึก Audit Log ไม่สำเร็จ:', auditError.message);
      }
    }

    revalidatePath('/kds');
    return { success: true, error: null };
  } catch (err) {
    console.error('เกิดข้อผิดพลาด:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * ทำเสร็จทั้งหมดในบิลนี้ (Batch Action — FR-021)
 * จานที่ยัง pending จะผ่าน cooking ก่อนเพื่อให้ตัดสต็อกตาม BOM แล้วจึงเป็น served
 *
 * @param {string} orderId - รหัสบิลออเดอร์
 */
export async function markAllServed(orderId) {
  const { error: roleError } = await checkActionRole(KITCHEN_ROLES);
  if (roleError) return { success: false, error: roleError };

  try {
    const supabase = await createClient();

    // 1. pending -> cooking (trigger ตัดสต็อก)
    const { error: cookingError } = await supabase
      .from('order_items')
      .update({ status: 'cooking' })
      .eq('order_id', orderId)
      .eq('status', 'pending');

    if (cookingError) {
      console.error('ตัดสต็อกไม่สำเร็จ:', cookingError.message);
      return { success: false, error: cookingError.message };
    }

    // 2. cooking -> served
    const { error } = await supabase
      .from('order_items')
      .update({ status: 'served' })
      .eq('order_id', orderId)
      .eq('status', 'cooking');

    if (error) {
      console.error('ไม่สามารถทำเสร็จทั้งหมดได้:', error.message);
      return { success: false, error: error.message };
    }

    revalidatePath('/kds');
    return { success: true, error: null };
  } catch (err) {
    console.error('เกิดข้อผิดพลาด:', err.message);
    return { success: false, error: err.message };
  }
}
