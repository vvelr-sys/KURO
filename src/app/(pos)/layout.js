import { StaffShell } from '@/components/layout';

/**
 * Layout ของกลุ่มหน้าร้าน (คิว, โต๊ะ, คิดเงิน, เรียกพนักงาน)
 * ⚠️ ไม่ได้ตรวจสิทธิ์ที่นี่ — แต่ละ page ต้องเรียก requireRole() เอง
 */
export default function PosLayout({ children }) {
  return <StaffShell>{children}</StaffShell>;
}
