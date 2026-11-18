import Image from 'next/image';

/**
 * โลโก้ร้าน (รูปโลโก้ + ชื่อร้าน) ใช้ที่แถบบนของทุกหน้าพนักงานและหน้าล็อกอิน
 * ไฟล์รูป: public/images/kuro-logo.png (PNG พื้นใส 440×420) — เปลี่ยนรูปที่ไฟล์นั้นที่เดียว
 * @param {Object} props
 * @param {string} [props.subtitle] - ข้อความบรรทัดล่าง
 */
export default function BrandLogo({ subtitle }) {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/images/kuro-logo.png"
        alt="โลโก้ร้านคุโระ ชาบู"
        width={440}
        height={420}
        // โลโก้อยู่บนสุดของทุกหน้า → โหลดทันที ไม่รอเลื่อนจอ (Next 16 เลิกใช้ prop "priority" แล้ว)
        loading="eager"
        className="h-12 w-auto shrink-0"
      />
      <div className="leading-tight">
        <p className="text-lg font-bold text-primary">
          KURO SHABU <span className="ml-1 rounded-md bg-line px-1.5 py-0.5 text-xs font-semibold text-ink-muted">POS</span>
        </p>
        {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
      </div>
    </div>
  );
}
