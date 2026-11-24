'use client';

import { AlarmClock, CheckCheck, Flame, LayoutGrid, List, PackageX, X } from 'lucide-react';
import { Button, Modal } from '@/components/ui';

/**
 * ขั้นตอนหลักของจอครัว (เรียงตามงานจริง: เลือกสถานี → เริ่มทำ → เสิร์ฟ / ยกเลิก)
 * อ้างอิง SRS FR-020–FR-024, FR-047–FR-050
 */
const MAIN_STEPS = [
  {
    icon: LayoutGrid,
    title: 'เลือกสถานีของคุณ',
    detail: 'กดปุ่มสถานีด้านบน (ของสด / เครื่องดื่ม / ปิ้งย่าง / ครัวร้อน) จะเห็นเฉพาะจานของสถานีนั้น การ์ดเรียงจากโต๊ะที่สั่งก่อน',
  },
  {
    icon: Flame,
    title: 'แตะช่องหน้าเมนู = เริ่มทำ',
    detail: 'ช่องเปลี่ยนเป็นไอคอนไฟ ระบบตัดวัตถุดิบตามสูตรทันที — แตะเมื่อเริ่มลงมือจริงเท่านั้น',
  },
  {
    icon: CheckCheck,
    title: 'แตะอีกครั้ง = เสิร์ฟแล้ว',
    detail: 'ใช้ปุ่ม "ทำเสร็จทั้งหมดในบิลนี้" ถ้าจัดครบทั้งโต๊ะ — เสิร์ฟแล้วย้อนกลับไม่ได้ ตรวจให้แน่ใจก่อนแตะ',
  },
  {
    icon: X,
    title: 'ยกเลิกต้องใส่เหตุผล',
    detail: 'กดกากบาทท้ายรายการ ถ้ารายการนั้นกำลังทำอยู่ ระบบคืนวัตถุดิบให้อัตโนมัติ ทุกการยกเลิกถูกบันทึกชื่อผู้ทำ',
  },
];

/** เกร็ดที่ควรรู้ระหว่างทำงาน */
const TIPS = [
  { icon: AlarmClock, text: 'ขอบการ์ดสีส้ม = รอเกิน 8 นาที · สีแดง = เกิน 15 นาที ให้ทำโต๊ะนั้นก่อน' },
  { icon: List, text: 'มุมมอง "รวมรายการเตรียม" รวมจำนวนจากทุกโต๊ะ เช่น หมูสไลซ์รวม 8 ถาด — การติ๊กเป็นตัวช่วยจำ ไม่เปลี่ยนสถานะจริง' },
  { icon: PackageX, text: 'ถ้าขึ้นว่าวัตถุดิบไม่พอ ให้แจ้งผู้จัดการ และไปหน้า "เปิด/ปิดเมนู" เพื่อปิดเมนูนั้น (ต้องใส่เหตุผล) ลูกค้าจะเห็นว่า "หมด"' },
];

/**
 * หน้าต่าง "วิธีใช้จอครัว" — เปิดเองครั้งแรกบนแท็บเล็ตแต่ละเครื่อง และเปิดดูซ้ำได้จากปุ่ม ?
 * @param {{ isOpen: boolean, onClose: () => void }} props
 */
export default function KitchenGuideModal({ isOpen, onClose }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="วิธีใช้จอครัว"
      description="4 ขั้นตอนหลัก · กดปุ่ม ? มุมขวาบนเพื่อเปิดดูอีกครั้ง"
      className="max-w-2xl"
      footer={
        <Button className="flex-1" onClick={onClose}>
          เข้าใจแล้ว เริ่มทำงาน
        </Button>
      }
    >
      <ol className="flex flex-col gap-3">
        {MAIN_STEPS.map(({ icon: Icon, title, detail }, index) => (
          <li key={title} className="flex items-start gap-3 rounded-2xl bg-surface p-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="leading-snug">
              <p className="font-bold">
                {index + 1}. {title}
              </p>
              <p className="text-sm text-ink-muted">{detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <h3 className="mb-2 mt-5 font-bold">ควรรู้</h3>
      <ul className="flex flex-col gap-2">
        {TIPS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2 text-sm">
            <Icon className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
