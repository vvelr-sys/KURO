import { StaffShell } from '@/components/layout';

/**
 * Layout ของกลุ่มครัว (จอครัว KDS, เปิด/ปิดเมนู) — ใช้โครงหน้าเดียวกับหน้าอื่นของพนักงาน
 * ⚠️ ไม่ได้ตรวจสิทธิ์ที่นี่ — แต่ละ page ต้องเรียก requireRole() เอง
 */
export default function KitchenLayout({ children }) {
  return <StaffShell>{children}</StaffShell>;
}
