'use client';

import { KITCHEN_STATION_LABELS, ROLE_LABELS, STOCK_COUNT_ROUND_LABELS } from '@/lib/constants';
import { MenuImage } from '@/components/ui';
import { cn } from '@/lib/utils';

// ชื่อช่องภาษาไทย (ช่องที่ไม่อยู่ในรายการแสดงชื่อเดิม)
const FIELD_LABELS = {
  name: 'ชื่อ',
  full_name: 'ชื่อ-นามสกุล',
  menu_item_name: 'เมนู',
  description: 'คำอธิบาย',
  image_url: 'รูปเมนู',
  category_id: 'หมวดหมู่',
  kitchen_station: 'สถานีครัว',
  extra_price: 'ราคาสั่งเพิ่ม',
  max_quantity_per_order: 'สั่งได้สูงสุดต่อครั้ง',
  availability_status: 'สถานะการขาย',
  disabled_reason: 'เหตุผลที่ปิดขาย',
  recipe: 'สูตรตัดสต็อก',
  adult_price: 'ราคาผู้ใหญ่',
  child_price: 'ราคาเด็ก',
  duration_minutes: 'เวลาต่อรอบ (นาที)',
  vat_rate_percent: 'VAT %',
  email: 'อีเมล',
  role: 'ตำแหน่ง',
  is_active: 'เปิดใช้งาน',
  has_pin: 'มี PIN',
  password: 'รหัสผ่าน',
  pin: 'PIN',
  status: 'สถานะ',
  quantity: 'จำนวน',
  reason: 'เหตุผล',
  count_round: 'รอบนับ',
  current_stock: 'ยอดคงเหลือ',
  minimum_threshold: 'จุดสั่งซื้อ',
  unit: 'หน่วย',
  store_name: 'ชื่อร้าน',
  store_branch: 'สาขา',
  store_address: 'ที่อยู่',
  store_tax_id: 'เลขผู้เสียภาษี',
  store_phone: 'เบอร์โทร',
  receipt_header_message: 'ข้อความหัวใบเสร็จ',
  receipt_footer_message: 'ข้อความท้ายใบเสร็จ',
  penalty_rate_per_100g: 'ค่าปรับ (บาท/100 กรัม)',
  discount_amount: 'ส่วนลด',
  total_amount: 'ยอดสุทธิ',
};

// ค่าที่เป็นรหัส → ข้อความไทย
const VALUE_LABELS = {
  kitchen_station: KITCHEN_STATION_LABELS,
  role: ROLE_LABELS,
  count_round: STOCK_COUNT_ROUND_LABELS,
  availability_status: { available: 'พร้อมขาย', out_of_stock: 'หมด (วัตถุดิบไม่พอ)', manual_off: 'ปิดขาย' },
  status: {
    pending: 'รอทำ',
    cooking: 'กำลังทำ',
    served: 'เสิร์ฟแล้ว',
    cancelled: 'ยกเลิก',
    pending_review: 'รออนุมัติ',
    approved: 'อนุมัติแล้ว',
    rejected: 'ปฏิเสธ',
  },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ข้อความของค่า 1 ค่า (ไม่รวมรูป) */
function formatValue(field, value, nameById) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'ใช่' : 'ไม่';
  if (typeof value === 'string' && UUID_PATTERN.test(value)) return nameById[value] ?? `รหัส …${value.slice(-4)}`;
  if (VALUE_LABELS[field]?.[value]) return VALUE_LABELS[field][value];
  if (Array.isArray(value)) {
    if (value.length === 0) return '(ว่าง)';
    return value.map((item) => formatListItem(item, nameById)).join(' · ');
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${FIELD_LABELS[key] ?? key}: ${formatValue(key, item, nameById)}`)
      .join(', ');
  }
  return String(value);
}

/** 1 รายการใน array เช่น สูตร BOM { ingredient_id, quantity } → "หมูสันคอ (g) × 100" */
function formatListItem(item, nameById) {
  if (item && typeof item === 'object' && 'ingredient_id' in item) {
    return `${formatValue('ingredient_id', item.ingredient_id, nameById)} × ${item.quantity ?? item.quantity_required ?? '?'}`;
  }
  return formatValue('', item, nameById);
}

/** ค่าในตาราง: ช่องรูปแสดงภาพเล็ก ช่องอื่นเป็นข้อความ */
function ValueCell({ field, value, nameById, isOld }) {
  const isImage = field === 'image_url' || field.endsWith('_image_url');
  if (isImage && value) {
    return <MenuImage src={value} alt={isOld ? 'รูปเดิม' : 'รูปใหม่'} className={cn('size-12', isOld && 'opacity-50')} />;
  }
  return (
    <span className={cn('break-words', isOld ? 'text-ink-muted line-through decoration-ink-muted/50' : 'font-semibold')}>
      {formatValue(field, value, nameById)}
    </span>
  );
}

/**
 * ตารางแสดง "อะไรเปลี่ยนไปบ้าง" ของ Audit Log 1 รายการ — แสดงเฉพาะช่องที่ค่าต่างกัน
 * ช่องที่ไม่เปลี่ยนสรุปเป็นบรรทัดเดียว · มีปุ่มดูข้อมูลดิบ (JSON) สำหรับผู้พัฒนา
 * @param {{ before: object|null, after: object|null, nameById: Record<string, string> }} props
 */
export default function AuditChangeTable({ before, after, nameById }) {
  const beforeData = before && typeof before === 'object' ? before : {};
  const afterData = after && typeof after === 'object' ? after : {};
  const hasBefore = Boolean(before);
  const hasAfter = Boolean(after);
  const fields = [...new Set([...Object.keys(beforeData), ...Object.keys(afterData)])];

  // มีทั้งก่อนและหลัง → แสดงเฉพาะที่ต่าง / มีฝั่งเดียว (เช่น เพิ่มใหม่) → แสดงทุกช่อง
  const isComparing = hasBefore && hasAfter;
  const changedFields = isComparing
    ? fields.filter((field) => JSON.stringify(beforeData[field] ?? null) !== JSON.stringify(afterData[field] ?? null))
    : fields;
  const unchangedFields = isComparing ? fields.filter((field) => !changedFields.includes(field)) : [];

  return (
    <div className="flex flex-col gap-3">
      {changedFields.length === 0 ? (
        <p className="text-sm text-ink-muted">ไม่มีช่องไหนเปลี่ยน</p>
      ) : (
        <table className="w-full overflow-hidden rounded-xl bg-white text-sm">
          <thead className="text-left text-xs text-ink-muted">
            <tr className="border-b border-line">
              <th className="w-44 px-3 py-2 font-semibold">ช่อง</th>
              {isComparing ? (
                <>
                  <th className="px-3 py-2 font-semibold">ก่อน</th>
                  <th className="px-3 py-2 font-semibold">หลัง</th>
                </>
              ) : (
                <th className="px-3 py-2 font-semibold">{hasAfter ? 'ข้อมูล' : 'ข้อมูลเดิม'}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {changedFields.map((field) => (
              <tr key={field} className="align-top">
                <td className="px-3 py-2 text-ink-muted">{FIELD_LABELS[field] ?? field}</td>
                {isComparing ? (
                  <>
                    <td className="px-3 py-2">
                      <ValueCell field={field} value={beforeData[field]} nameById={nameById} isOld />
                    </td>
                    <td className="px-3 py-2">
                      <ValueCell field={field} value={afterData[field]} nameById={nameById} />
                    </td>
                  </>
                ) : (
                  <td className="px-3 py-2">
                    <ValueCell field={field} value={(hasAfter ? afterData : beforeData)[field]} nameById={nameById} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {unchangedFields.length > 0 && (
        <p className="text-xs text-ink-muted">
          ไม่เปลี่ยน: {unchangedFields.map((field) => FIELD_LABELS[field] ?? field).join(', ')}
        </p>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer font-semibold text-ink-muted hover:text-ink">ดูข้อมูลดิบ (สำหรับผู้พัฒนา)</summary>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {[
            ['ก่อน', before],
            ['หลัง', after],
          ].map(([title, payload]) => (
            <div key={title}>
              <p className="mb-1 font-bold text-ink-muted">{title}</p>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-white p-3 font-mono">
                {payload ? JSON.stringify(payload, null, 2) : '—'}
              </pre>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
