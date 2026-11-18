import {
  Armchair,
  BellRing,
  Boxes,
  ChartColumn,
  ChefHat,
  History,
  Receipt,
  Settings,
  Tags,
  ToggleRight,
  UserPlus,
  Users,
  UtensilsCrossed,
} from 'lucide-react';

/**
 * รายการเมนูด้านซ้ายของหน้าพนักงาน เรียงตามลำดับที่แสดง
 * ใครเห็นเมนูไหน คำนวณจาก ROUTE_PERMISSIONS (src/lib/constants) — ไม่ต้องกำหนดตำแหน่งซ้ำที่นี่
 * หน้าย่อย เช่น /billing/tax-invoice ไม่ต้องใส่ (ไฮไลต์เมนู /billing ให้อัตโนมัติ)
 * @type {{ path: string, label: string, icon: import('react').ComponentType<any> }[]}
 */
export const NAV_ITEMS = [
  // หน้าร้าน
  { path: '/tables', label: 'โต๊ะ', icon: Armchair },
  { path: '/queues', label: 'คิว', icon: UserPlus },
  { path: '/billing', label: 'คิดเงิน', icon: Receipt },
  { path: '/service-requests', label: 'เรียกพนักงาน', icon: BellRing },
  // ครัว
  { path: '/kds', label: 'จอครัว', icon: ChefHat },
  { path: '/stock-override', label: 'เปิด/ปิดเมนู', icon: ToggleRight },
  // หลังบ้าน
  { path: '/menu', label: 'เมนู', icon: UtensilsCrossed },
  { path: '/packages', label: 'ราคาบุฟเฟต์', icon: Tags },
  { path: '/inventory', label: 'สต็อก', icon: Boxes },
  { path: '/reports', label: 'รายงาน', icon: ChartColumn },
  { path: '/staff', label: 'พนักงาน', icon: Users },
  { path: '/audit-logs', label: 'ประวัติ', icon: History },
  { path: '/settings', label: 'ตั้งค่า', icon: Settings },
];
