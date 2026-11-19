import { Bell, CircleAlert, CookingPot, Droplets, ReceiptText } from 'lucide-react';

/**
 * ชื่อและไอคอนของประเภทคำขอ 5 แบบ (ตรงกับ enum service_request_type ในฐานข้อมูล)
 * ลำดับนี้ใช้เป็นลำดับปุ่มกรองด้วย
 */
export const SERVICE_REQUEST_TYPES = {
  water: { label: 'ขอน้ำ / ซุป', icon: Droplets },
  call_staff: { label: 'เรียกพนักงาน', icon: Bell },
  change_pot: { label: 'เปลี่ยนเตา / หม้อ', icon: CookingPot },
  check_bill: { label: 'ขอเช็คบิล', icon: ReceiptText },
  other: { label: 'อื่นๆ / แจ้งปัญหา', icon: CircleAlert },
};
