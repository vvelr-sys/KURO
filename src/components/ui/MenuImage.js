import { UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * รูปเมนู (สี่เหลี่ยมมุมมน) — ไม่มีรูปแสดงไอคอนจานแทน
 * ใช้ <img> ธรรมดาเพราะรูปอยู่ใน Supabase Storage (ไม่ผ่านตัวย่อรูปของ Next)
 * @param {{ src?: string|null, alt?: string, className?: string, isDimmed?: boolean }} props
 */
export default function MenuImage({ src, alt = '', className, isDimmed = false }) {
  return (
    <div className={cn('shrink-0 overflow-hidden rounded-2xl bg-surface', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" className={cn('size-full object-cover', isDimmed && 'opacity-40 grayscale')} />
      ) : (
        <span className="flex size-full items-center justify-center text-ink-muted/60">
          <UtensilsCrossed className="size-1/2 max-h-10 max-w-10" aria-hidden />
        </span>
      )}
    </div>
  );
}
