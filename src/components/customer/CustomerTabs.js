import Link from 'next/link';
import { ClipboardList, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/utils';

// แท็บสลับหน้าของลูกค้า (เพิ่มหน้า "เรียกพนักงาน" / "สรุปรายการ" ที่นี่เมื่อสร้างหน้าเสร็จ)
const CUSTOMER_TABS = [
  { key: 'order', label: 'สั่งอาหาร', path: '', icon: UtensilsCrossed },
  { key: 'status', label: 'สถานะอาหาร', path: '/status', icon: ClipboardList },
];

/**
 * แท็บด้านบนของหน้าลูกค้า
 * @param {Object} props
 * @param {string} props.tableNumber
 * @param {'order'|'status'} props.current
 */
export default function CustomerTabs({ tableNumber, current }) {
  const basePath = `/order/${encodeURIComponent(tableNumber)}`;

  return (
    <nav className="grid grid-cols-2 gap-1 rounded-2xl bg-line p-1" aria-label="เมนูลูกค้า">
      {CUSTOMER_TABS.map((tab) => {
        const isCurrent = tab.key === current;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.key}
            href={basePath + tab.path}
            aria-current={isCurrent ? 'page' : undefined}
            className={cn(
              'flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-bold',
              isCurrent ? 'bg-white text-primary shadow-sm' : 'text-ink-muted'
            )}
          >
            <Icon className="size-4" aria-hidden />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
