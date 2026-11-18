import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { formatClockTime, formatCurrency } from '@/lib/utils';

/**
 * เนื้อหาตั๋ว QR สั่งอาหาร (ใช้ทั้งแสดงบนหน้าจอและตอนพิมพ์)
 * ขนาดออกแบบให้พอดีกระดาษสลิป 80 มม. และพิมพ์บน A4 ได้
 * @param {Object} props
 * @param {import('@/app/(pos)/tables/actions').QrTicket} props.ticket
 */
export default function QrTicket({ ticket }) {
  const guestTotal = ticket.adultCount + ticket.childCount;

  return (
    <div className="mx-auto flex w-full max-w-[72mm] flex-col items-center gap-2 text-center text-ink">
      {/* eager: สำเนาสำหรับพิมพ์ถูกซ่อนบนจอ ถ้า lazy รูปจะไม่โหลดทันพิมพ์ */}
      <Image src="/images/kuro-logo.png" alt="" width={440} height={420} loading="eager" className="h-16 w-auto" />
      <p className="text-3xl font-bold">โต๊ะ {ticket.tableNumber}</p>

      <div className="rounded-xl bg-white p-2 ring-1 ring-line">
        <QRCodeSVG value={ticket.url} size={200} marginSize={1} level="M" />
      </div>
      <p className="font-bold">สแกนเพื่อสั่งอาหาร</p>

      {/* เวลา */}
      <div className="w-full border-t border-dashed border-ink-muted/40 pt-2 text-sm">
        <Row label="เริ่ม" value={formatClockTime(ticket.startedAt)} />
        <Row label={`หมดเวลา (${ticket.durationMinutes} นาที)`} value={formatClockTime(ticket.expiresAt)} strong />
      </div>

      {/* ค่าบุฟเฟต์ */}
      <div className="w-full border-t border-dashed border-ink-muted/40 pt-2 text-sm">
        <Row label={`ผู้ใหญ่ ${ticket.adultCount} × ${formatCurrency(ticket.adultPrice)}`} value={formatCurrency(ticket.adultCount * ticket.adultPrice)} />
        {ticket.childCount > 0 && (
          <Row label={`เด็ก ${ticket.childCount} × ${formatCurrency(ticket.childPrice)}`} value={formatCurrency(ticket.childCount * ticket.childPrice)} />
        )}
        <Row label={`รวม ${guestTotal} ท่าน`} value={formatCurrency(ticket.buffetTotal)} strong />
        <p className="text-right text-xs text-ink-muted">ราคารวม VAT แล้ว · ยังไม่รวมค่าปรับ/ส่วนลด (ถ้ามี)</p>
      </div>

      <p className="border-t border-dashed border-ink-muted/40 pt-2 text-xs text-ink-muted">
        ไม่ต้องล็อกอิน · QR ใช้ได้จนกว่าจะชำระเงิน
      </p>
    </div>
  );
}

/** แถว "ชื่อรายการ ........ ค่า" */
function Row({ label, value, strong = false }) {
  return (
    <p className={`flex justify-between gap-2 ${strong ? 'text-base font-bold' : ''}`}>
      <span className="text-left">{label}</span>
      <span className="whitespace-nowrap tabular-nums">{value}</span>
    </p>
  );
}
