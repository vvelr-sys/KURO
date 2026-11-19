import { Banknote, CreditCard, QrCode, Split } from 'lucide-react';

/** ชื่อ/ไอคอนของวิธีชำระเงิน (ใช้ทั้งหน้าคิดเงินและใบเสร็จ) */
export const PAYMENT_METHOD_LABELS = {
  cash: { label: 'เงินสด', hint: 'คำนวณเงินทอน', icon: Banknote },
  promptpay: { label: 'พร้อมเพย์', hint: 'ตรวจยอดเข้าแล้วกดยืนยัน', icon: QrCode },
  credit_card: { label: 'บัตรเครดิต', hint: 'รูดที่เครื่อง EDC', icon: CreditCard },
  split: { label: 'แบ่งชำระ', hint: 'หลายช่องทางรวมกัน', icon: Split },
};

/** เหตุผลส่วนลดที่ใช้บ่อย (กดเลือกได้เร็ว) */
export const DISCOUNT_REASON_PRESETS = ['อาหารออกช้า', 'อาหารมีปัญหา', 'ลูกค้าประจำ', 'ชดเชยบริการ'];
