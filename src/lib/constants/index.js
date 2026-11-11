/**
 * Core System Constants for KURO POS
 * Synced with UX/UI System Specification (Shabu Buffet Model)
 */

export const USER_ROLES = {
  OWNER: 'owner',
  MANAGER: 'manager',
  CASHIER: 'cashier',
  KITCHEN: 'kitchen',
  STAFF: 'staff',
};

export const TABLE_STATUS = {
  AVAILABLE: 'available',   // ว่าง
  OCCUPIED: 'occupied',     // มีลูกค้า
  CLEANING: 'cleaning',     // รอเก็บโต๊ะ
  DISABLED: 'disabled',     // ปิดใช้งาน
};

export const QUEUE_STATUS = {
  WAITING: 'waiting',       // รอ
  CALLED: 'called',         // เรียกแล้ว
  SEATED: 'seated',         // เข้าโต๊ะแล้ว
  SKIPPED: 'skipped',       // ข้าม
  CANCELLED: 'cancelled',   // ยกเลิก
};

export const ORDER_ITEM_STATUS = {
  PENDING: 'pending',       // รอทำ
  COOKING: 'cooking',       // กำลังทำ (ตัดสต็อกจริง)
  SERVED: 'served',         // เสิร์ฟแล้ว
  CANCELLED: 'cancelled',   // ยกเลิก
};

export const MENU_AVAILABILITY = {
  AVAILABLE: 'available',       // พร้อมขาย
  OUT_OF_STOCK: 'out_of_stock', // หมด (ซ่อนจากหน้าลูกค้าอัตโนมัติ)
  MANUAL_OFF: 'manual_off',     // ปิดด้วยมือ (Override)
};

export const KITCHEN_STATIONS = {
  FRESH: 'fresh',               // ของสด
  BEVERAGE: 'beverage',         // เครื่องดื่ม
  GRILL: 'grill',               // ปิ้งย่าง
  HOT_KITCHEN: 'hot_kitchen',   // ครัวร้อน
};

export const CALL_STAFF_TYPES = {
  CALL_STAFF: 'call_staff',     // เรียกพนักงาน
  WATER: 'water',               // ขอน้ำ
  CHANGE_POT: 'change_pot',     // ขอเปลี่ยนเตา/หม้อ
  CHECK_BILL: 'check_bill',     // ขอเช็คบิล
  OTHER: 'other',               // อื่นๆ
};

export const PAYMENT_METHODS = {
  CASH: 'cash',
  PROMPTPAY: 'promptpay',
  CREDIT_CARD: 'credit_card',
  SPLIT: 'split',               // แบ่งจ่ายหลายวิธี
};

export const PENALTY_RATE_PER_100G = 100.00;


