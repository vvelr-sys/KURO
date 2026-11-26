/**
 * Core System Constants for KURO POS
 * Synced with UX/UI System Specification (Shabu Buffet Model)
 */

export const USER_ROLES = {
  ADMIN: 'admin',
  OWNER: 'admin',
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

// ชื่อสถานีครัวภาษาไทย (ใช้ในฟอร์มเมนูและป้ายต่างๆ)
export const KITCHEN_STATION_LABELS = {
  fresh: 'ของสด',
  beverage: 'เครื่องดื่ม',
  grill: 'ปิ้งย่าง',
  hot_kitchen: 'ครัวร้อน',
};

// ชื่อ bucket รูปเมนูใน Supabase Storage (migration 025)
export const MENU_IMAGE_BUCKET = 'menu-images';

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

// รอบการตรวจนับสต็อก (stock_counts.count_round — migration 022)
export const STOCK_COUNT_ROUNDS = {
  OPENING: 'opening',   // ก่อนเปิดร้าน (เช้า)
  CLOSING: 'closing',   // หลังปิดร้าน (เย็น)
};

export const STOCK_COUNT_ROUND_LABELS = {
  opening: 'รอบเปิดร้าน',
  closing: 'รอบปิดร้าน',
};

// สถานะผลตรวจนับ (stock_counts.status)
export const STOCK_COUNT_STATUS = {
  PENDING_REVIEW: 'pending_review', // รอผู้จัดการอนุมัติ
  APPROVED: 'approved',             // อนุมัติแล้ว (ปรับยอดแล้ว)
  REJECTED: 'rejected',             // ปฏิเสธ (นับใหม่ได้)
};

// ประเภทความเคลื่อนไหวสต็อก (stock_movements.movement_type)
export const STOCK_MOVEMENT_TYPES = {
  ACTUAL_CONSUMPTION: 'actual_consumption',         // ครัวกด cooking ตัดตาม BOM
  CANCEL_RETURN: 'cancel_return',                   // คืนสต็อกเมื่อยกเลิกรายการที่กำลังทำ
  MANUAL_RESTOCK: 'manual_restock',                 // รับของเข้า
  KITCHEN_WASTE: 'kitchen_waste',                   // ของเสีย
  STOCK_COUNT_ADJUSTMENT: 'stock_count_adjustment', // ปรับยอดจากการตรวจนับ
};

// ชื่อเหตุการณ์ใน audit_logs.action (audit_matrix.md ส่วนที่ 1) — ที่ไม่อยู่ในรายการแสดงรหัสเดิม
export const AUDIT_ACTION_LABELS = {
  OPEN_SESSION: 'เปิดโต๊ะ/รอบบริการ',
  MOVE_TABLE: 'ย้ายโต๊ะ',
  TRANSFER_TABLE: 'ย้ายโต๊ะ',
  MERGE_TABLES: 'รวมโต๊ะ',
  SPLIT_TABLES: 'แยกโต๊ะ',
  ENABLE_TABLE: 'เปิดใช้งานโต๊ะ',
  DISABLE_TABLE: 'ปิดใช้งานโต๊ะ',
  CANCEL_ORDER_ITEM: 'ยกเลิกรายการอาหาร',
  MANUAL_OFF_MENU: 'ปิดเมนูด้วยมือ',
  CREATE_MENU: 'เพิ่มเมนู',
  UPDATE_MENU: 'แก้ไขเมนู',
  DELETE_MENU: 'ลบเมนู',
  CREATE_CATEGORY: 'เพิ่มหมวดหมู่',
  UPDATE_CATEGORY: 'แก้ไขหมวดหมู่',
  REORDER_CATEGORY: 'เรียงลำดับหมวดหมู่',
  DELETE_CATEGORY: 'ลบหมวดหมู่',
  APPROVE_DISCOUNT: 'ให้ส่วนลด',
  REMOVE_DISCOUNT: 'ยกเลิกส่วนลด',
  RECORD_LEFTOVER: 'ชั่งเนื้อเหลือ',
  SUBMIT_STOCK_COUNT: 'ส่งผลนับสต็อก',
  ADJUST_STOCK_COUNT: 'อนุมัติผลนับ/ปรับยอด',
  REJECT_STOCK_COUNT: 'ปฏิเสธผลนับ',
  UPDATE_SETTINGS: 'แก้ตั้งค่าร้าน',
  UPDATE_PACKAGE: 'แก้ราคาบุฟเฟต์/VAT',
  CREATE_STAFF: 'เพิ่มพนักงาน',
  UPDATE_STAFF: 'แก้ข้อมูลพนักงาน',
  EMERGENCY_OVERRIDE: 'แอดมินทำแทน (ฉุกเฉิน)',
};

export const STOCK_MOVEMENT_LABELS = {
  actual_consumption: 'ครัวใช้',
  cancel_return: 'คืนจากการยกเลิก',
  manual_restock: 'รับของเข้า',
  kitchen_waste: 'ของเสีย',
  stock_count_adjustment: 'ปรับยอดตรวจนับ',
};

/**
 * Route access permissions per role (Item 12: Route -> Allowed Roles)
 * Server-side & layout checks enforce these without "Admin passes everything" rule
 */
export const ROUTE_PERMISSIONS = {
  '/queues': ['cashier', 'manager', 'admin'],
  '/tables': ['cashier', 'staff', 'manager', 'admin'],
  '/billing': ['cashier', 'manager', 'admin'],
  '/billing/tax-invoice': ['cashier', 'manager', 'admin'],
  '/service-requests': ['staff', 'manager', 'admin'],
  '/stock-count': ['staff', 'manager', 'admin'],      // นับสต็อกเช้า-เย็น, รับของเข้า, ของเสีย
  '/kds': ['kitchen', 'manager', 'admin'],
  '/stock-override': ['kitchen', 'manager', 'admin'],
  '/menu': ['manager', 'admin'],
  '/packages': ['admin'],
  '/inventory': ['manager', 'admin'],
  '/reports': ['manager', 'admin'],
  '/staff': ['admin'],
  '/audit-logs': ['admin', 'manager'],
  '/settings': ['admin'],
};

/**
 * ขนาดโต๊ะ 3 แบบ (ตรงกับ queues.table_size และตัวอักษรนำหน้าเลขคิว A/B/C)
 * ใช้จัดกลุ่มผังโต๊ะจาก dining_tables.capacity และเลือกขนาดโต๊ะตอนออกบัตรคิว
 */
export const TABLE_SIZES = [
  { key: 'small', label: 'โต๊ะเล็ก', seatLabel: '1-2 ที่นั่ง', queuePrefix: 'A', minSeats: 1, maxSeats: 2 },
  { key: 'medium', label: 'โต๊ะกลาง', seatLabel: '3-4 ที่นั่ง', queuePrefix: 'B', minSeats: 3, maxSeats: 4 },
  { key: 'large', label: 'โต๊ะใหญ่', seatLabel: '5 ที่นั่งขึ้นไป', queuePrefix: 'C', minSeats: 5, maxSeats: Infinity },
];

/**
 * หาขนาดโต๊ะจากจำนวนที่นั่ง (หรือจำนวนลูกค้า)
 * @param {number} seatCount
 * @returns {'small'|'medium'|'large'}
 */
export function getTableSizeKey(seatCount) {
  return (TABLE_SIZES.find((size) => seatCount <= size.maxSeats) ?? TABLE_SIZES[TABLE_SIZES.length - 1]).key;
}

/** คำขอเรียกพนักงานที่รอเกินกี่นาทีถือว่า "รอนาน" (ขึ้นสีแดงและอยู่ในส่วนเตือนด่วน) */
export const SERVICE_REQUEST_OVERDUE_MINUTES = 3;

/** เหลือเวลาไม่เกินกี่นาทีถึงขึ้นสีเตือน "ใกล้หมดเวลา" บนผังโต๊ะ */
export const NEAR_EXPIRY_MINUTES = 10;

/**
 * หน้าแรกหลังล็อกอินของแต่ละตำแหน่ง (ใช้ตอนล็อกอินสำเร็จ และตอนเข้าหน้าที่ไม่มีสิทธิ์)
 */
export const ROLE_HOME_PATH = {
  admin: '/reports',
  manager: '/reports',
  cashier: '/tables',
  staff: '/tables',
  kitchen: '/kds',
};

/**
 * ชื่อตำแหน่งภาษาไทยสำหรับแสดงบนหน้าจอ
 */
export const ROLE_LABELS = {
  admin: 'ผู้ดูแลระบบ',
  manager: 'ผู้จัดการ',
  cashier: 'แคชเชียร์',
  staff: 'พนักงานบริการ',
  kitchen: 'ครัว',
};


