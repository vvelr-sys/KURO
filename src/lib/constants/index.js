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


