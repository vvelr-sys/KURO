'use server';

import { refresh } from 'next/cache';
import { toDisplayError } from '@/lib/action-helpers';
import { checkActionRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isValidThaiTaxId, normalizeTaxId } from '@/lib/tax-id';

/** ตำแหน่งที่ออกใบกำกับภาษีได้ */
const TAX_INVOICE_ROLES = ['admin', 'manager', 'cashier'];
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * ออกใบกำกับภาษีเต็มรูป (FR-045) — 1 บิลออกได้ 1 ใบ (bill_id UNIQUE) เลขที่สร้างโดย Trigger (migration 003)
 * @param {{
 *   billId: string,
 *   customerType: 'company'|'person',
 *   taxId: string,
 *   branchType: 'head_office'|'branch',
 *   branchCode: string,
 *   customerName: string,
 *   address: string,
 *   email: string,
 * }} input
 * @returns {Promise<{ error: string|null, fieldErrors: Record<string, string> }>}
 */
export async function issueTaxInvoice(input) {
  const { staff, error: roleError } = await checkActionRole(TAX_INVOICE_ROLES);
  if (roleError) return { error: roleError, fieldErrors: {} };

  // ===== ตรวจข้อมูลฝั่งเซิร์ฟเวอร์ (ไม่เชื่อหน้าจออย่างเดียว) =====
  const taxId = normalizeTaxId(input.taxId);
  const customerName = String(input.customerName ?? '').trim();
  const address = String(input.address ?? '').trim();
  const email = String(input.email ?? '').trim();
  const branchCode = String(input.branchCode ?? '').trim();
  const isCompany = input.customerType === 'company';

  const fieldErrors = {};
  if (!isValidThaiTaxId(taxId)) fieldErrors.taxId = 'เลข 13 หลักไม่ถูกต้อง (ตรวจหลักสุดท้ายไม่ผ่าน)';
  if (customerName.length < 2) fieldErrors.customerName = 'กรุณากรอกชื่อ';
  if (customerName.length > 200) fieldErrors.customerName = 'ชื่อยาวเกิน 200 ตัวอักษร';
  if (address.length < 10) fieldErrors.address = 'กรุณากรอกที่อยู่ให้ครบ';
  if (email && !EMAIL_PATTERN.test(email)) fieldErrors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
  if (isCompany && input.branchType === 'branch' && !/^\d{5}$/.test(branchCode)) {
    fieldErrors.branchCode = 'รหัสสาขาต้องเป็นตัวเลข 5 หลัก';
  }
  if (Object.keys(fieldErrors).length > 0) return { error: 'กรุณาตรวจสอบข้อมูลที่กรอก', fieldErrors };

  // สาขาของผู้ซื้อ: นิติบุคคลต้องระบุ สำนักงานใหญ่/สาขาที่ / บุคคลธรรมดาไม่มีสาขา
  const branch = !isCompany ? '-' : input.branchType === 'branch' ? `สาขาที่ ${branchCode}` : 'สำนักงานใหญ่';

  const supabase = await createClient();

  // ออกได้เฉพาะบิลที่ชำระแล้ว
  const { data: bill } = await supabase.from('bills').select('status').eq('id', input.billId).maybeSingle();
  if (!bill) return { error: 'ไม่พบบิลนี้', fieldErrors: {} };
  if (bill.status !== 'paid') return { error: 'บิลนี้ยังไม่ได้ชำระเงิน', fieldErrors: {} };

  const { error } = await supabase.from('tax_invoices').insert({
    bill_id: input.billId,
    customer_name: customerName,
    tax_id: taxId,
    branch,
    address: address.slice(0, 1000),
    email: email || null,
    issued_by: staff.id,
  });

  if (error) {
    // 23505 = ข้อมูลซ้ำ (บิลนี้ออกใบกำกับภาษีไปแล้ว)
    if (error.code === '23505') return { error: 'บิลนี้ออกใบกำกับภาษีไปแล้ว', fieldErrors: {} };
    return { error: toDisplayError(error, 'tax-invoice action'), fieldErrors: {} };
  }

  refresh();
  return { error: null, fieldErrors: {} };
}
