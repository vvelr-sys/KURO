import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { TABLE_SIZES } from '@/lib/constants';
import { formatClockTime } from '@/lib/utils';

/**
 * เนื้อหาบัตรคิว (ใช้ทั้งตัวอย่างบนหน้าจอและตอนพิมพ์) — ขนาดพอดีสลิป 80 มม. ขยายเองบน A4
 * @param {Object} props
 * @param {import('@/app/(pos)/queues/actions').QueueTicket} props.ticket
 */
export default function QueueTicket({ ticket }) {
  const size = TABLE_SIZES.find((tableSize) => tableSize.key === ticket.tableSize);

  return (
    <div className="mx-auto flex w-full max-w-[72mm] flex-col items-center gap-2 text-center text-ink">
      {/* eager: สำเนาสำหรับพิมพ์ถูกซ่อนบนจอ ถ้า lazy รูปจะไม่โหลดทันพิมพ์ */}
      <Image src="/images/kuro-logo.png" alt="" width={440} height={420} loading="eager" className="h-14 w-auto" />
      <p className="text-sm text-ink-muted">หมายเลขคิวของคุณ</p>
      <p className="text-6xl font-bold leading-none text-primary">{ticket.queueNumber}</p>
      <p className="text-lg font-bold">
        {size?.label} ({size?.seatLabel})
      </p>
      <p className="text-sm text-ink-muted">
        ผู้ใหญ่ {ticket.adultCount} ท่าน{ticket.childCount > 0 && `, เด็ก ${ticket.childCount} ท่าน`}
      </p>

      <div className="w-full border-t border-dashed border-ink-muted/40 pt-2 text-sm">
        <p className="flex justify-between">
          <span>เวลารับคิว</span>
          <span className="font-semibold">{formatClockTime(ticket.createdAt)}</span>
        </p>
        <p className="flex justify-between">
          <span>คิวก่อนหน้า</span>
          <span className="font-bold text-primary">{ticket.queuesAhead} คิว</span>
        </p>
      </div>

      <div className="rounded-xl bg-white p-2 ring-1 ring-line">
        <QRCodeSVG value={ticket.url} size={150} marginSize={1} level="M" />
      </div>
      <p className="text-xs text-ink-muted">สแกนเพื่อดูสถานะคิวบนมือถือ</p>
    </div>
  );
}
