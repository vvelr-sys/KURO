import { memo } from 'react';
import { Armchair, Brush, LayoutGrid, UsersRound, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

const SUMMARY_ITEMS = [
  { key: 'total', label: 'โต๊ะทั้งหมด', icon: LayoutGrid, iconClass: 'bg-surface text-ink' },
  { key: 'occupied', label: 'มีลูกค้า', icon: UsersRound, iconClass: 'bg-primary text-white' },
  { key: 'available', label: 'โต๊ะว่าง', icon: Armchair, iconClass: 'bg-emerald-800 text-white' },
  { key: 'cleaning', label: 'รอเก็บโต๊ะ', icon: Brush, iconClass: 'bg-danger-soft text-danger' },
  { key: 'disabled', label: 'ปิดใช้งาน', icon: Wrench, iconClass: 'bg-line text-ink-muted' },
];

/**
 * การ์ดสรุปจำนวนโต๊ะตามสถานะ (แถวบนสุดของผังโต๊ะ)
 * @param {Object} props
 * @param {{ total: number, occupied: number, available: number, cleaning: number, disabled: number }} props.counts
 */
function TableSummaryCards({ counts }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {SUMMARY_ITEMS.map(({ key, label, icon: Icon, iconClass }) => (
        <div key={key} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl', iconClass)}>
            <Icon className="size-6" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-sm text-ink-muted">{label}</p>
            <p className="text-2xl font-bold">
              {counts[key]} <span className="text-sm font-normal text-ink-muted">โต๊ะ</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default memo(TableSummaryCards);
