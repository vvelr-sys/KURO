'use server';

import { refresh } from 'next/cache';
import { toDisplayError } from '@/lib/action-helpers';
import { checkActionRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

// Server Actions ของหน้าคิดเงิน (งานจริง + การคำนวณเงินทั้งหมดทำในฟังก์ชันฐานข้อมูล migration 007)

/** ตำแหน่งที่คิดเงินได้ (staff คิดเงินไม่ได้) */
const BILLING_ROLES = ['admin', 'manager', 'cashier'];
const PAYMENT_METHODS = ['cash', 'promptpay', 'credit_card'];

/**
 * ออกบิล (ต้องชั่งเนื้อเหลือแล้ว) — กดซ้ำได้ ได้บิลเดิม
 * @param {{ sessionId: string }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function createBill({ sessionId }) {
  const { error: roleError } = await checkActionRole(BILLING_ROLES);
  if (roleError) return { error: roleError };

  const supabase = await createClient();
  const { error } = await supabase.rpc('fn_create_bill', { p_session_id: sessionId });
  if (error) return { error: toDisplayError(error, 'billing action') };

  refresh();
  return { error: null };
}

/**
 * ให้ / แก้ / ลบส่วนลด (amount = 0 คือลบ) — มากกว่า 0 ต้องมีเหตุผล
 * @param {{ billId: string, amount: number, reason: string }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function applyDiscount({ billId, amount, reason }) {
  const { error: roleError } = await checkActionRole(BILLING_ROLES);
  if (roleError) return { error: roleError };
  if (!Number.isFinite(amount) || amount < 0) return { error: 'จำนวนส่วนลดไม่ถูกต้อง' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('fn_apply_discount', {
    p_bill_id: billId,
    p_amount: Math.round(amount * 100) / 100,
    p_reason: String(reason ?? '').slice(0, 300),
  });
  if (error) return { error: toDisplayError(error, 'billing action') };

  refresh();
  return { error: null };
}

/**
 * รับชำระเงิน (แบ่งจ่ายได้) แล้วปิดรอบ → โต๊ะเปลี่ยนเป็นรอเก็บ / QR ใช้ไม่ได้
 * @param {{ billId: string, payments: { method: string, amount: number, cashTendered?: number|null, reference?: string }[] }} input
 * @returns {Promise<{ error: string|null }>}
 */
export async function payBill({ billId, payments }) {
  const { error: roleError } = await checkActionRole(BILLING_ROLES);
  if (roleError) return { error: roleError };

  if (!Array.isArray(payments) || payments.some((payment) => !PAYMENT_METHODS.includes(payment.method))) {
    return { error: 'ข้อมูลการชำระเงินไม่ถูกต้อง' };
  }

  // ส่งเฉพาะข้อมูลที่จำเป็น ในรูปแบบที่ fn_pay_bill อ่าน
  const paymentRows = payments.map((payment) => ({
    method: payment.method,
    amount: Math.round(Number(payment.amount) * 100) / 100,
    cash_tendered:
      payment.method === 'cash' && payment.cashTendered ? Math.round(Number(payment.cashTendered) * 100) / 100 : null,
    reference: payment.method === 'cash' ? null : String(payment.reference ?? '').slice(0, 100),
  }));

  const supabase = await createClient();
  const { error } = await supabase.rpc('fn_pay_bill', { p_bill_id: billId, p_payments: paymentRows });
  if (error) return { error: toDisplayError(error, 'billing action') };

  refresh();
  return { error: null };
}
