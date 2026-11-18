import { StaffShell } from '@/components/layout';

/**
 * Layout ของกลุ่มหลังบ้าน (เมนู, ราคา, สต็อก, รายงาน, พนักงาน, ประวัติ, ตั้งค่า)
 * ⚠️ ไม่ได้ตรวจสิทธิ์ที่นี่ — แต่ละ page ต้องเรียก requireRole() เอง
 */
export default function AdminLayout({ children }) {
  return <StaffShell>{children}</StaffShell>;
}
