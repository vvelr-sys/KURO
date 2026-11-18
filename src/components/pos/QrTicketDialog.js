'use client';

import { Printer } from 'lucide-react';
import { Button, Modal, PrintPortal } from '@/components/ui';
import QrTicket from './QrTicket';

/**
 * แสดงตั๋ว QR สั่งอาหารของโต๊ะ + ปุ่มพิมพ์ (พิมพ์เฉพาะตั๋ว ไม่พิมพ์ทั้งหน้า)
 * ⚠️ token อยู่ในหน้าต่างนี้ที่เดียว (ฐานข้อมูลเก็บแค่ hash) ปิดแล้วต้องกด "พิมพ์ QR" เพื่อสร้างใหม่
 * @param {Object} props
 * @param {import('@/app/(pos)/tables/actions').QrTicket | null} props.ticket
 * @param {string} [props.note] - ข้อความเพิ่มเติม เช่น "ย้ายโต๊ะแล้ว"
 * @param {() => void} props.onClose
 */
export default function QrTicketDialog({ ticket, note, onClose }) {
  if (!ticket) return null;

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        title={`QR สั่งอาหาร โต๊ะ ${ticket.tableNumber}`}
        description="พิมพ์ให้ลูกค้าก่อนปิดหน้าต่างนี้ (ปิดแล้วดู QR นี้อีกไม่ได้ ต้องพิมพ์ใหม่)"
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              ปิด
            </Button>
            <Button icon={Printer} className="flex-1" onClick={() => window.print()}>
              พิมพ์ QR
            </Button>
          </>
        }
      >
        {note && <p className="mb-3 rounded-xl bg-amber-50 px-4 py-2 text-center font-semibold text-amber-800">{note}</p>}
        <QrTicket ticket={ticket} />
      </Modal>

      {/* สำเนาตั๋วสำหรับพิมพ์ (มองไม่เห็นบนจอ) */}
      <PrintPortal>
        <QrTicket ticket={ticket} />
      </PrintPortal>
    </>
  );
}
