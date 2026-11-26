import { memo } from 'react';
import { Check, ChefHat, Clock, X } from 'lucide-react';
import { cn, formatClockTime } from '@/lib/utils';

// ป้ายสถานะอาหารสำหรับลูกค้า (4 สถานะตาม AGENTS ส่วน 3.3)
export const CUSTOMER_ITEM_STATUS = {
  pending: { label: 'รอครัวรับ', icon: Clock, badge: 'bg-surface text-ink-muted' },
  cooking: { label: 'กำลังทำ', icon: ChefHat, badge: 'bg-amber-100 text-amber-800' },
  served: { label: 'เสิร์ฟแล้ว', icon: Check, badge: 'bg-emerald-50 text-emerald-800' },
  cancelled: { label: 'ยกเลิก', icon: X, badge: 'bg-danger-soft text-danger' },
};

/**
 * การ์ดออเดอร์ 1 รอบ: รายการอาหาร + สถานะแต่ละจาน (ไม่แสดงราคา)
 * React.memo: ดึงข้อมูลซ้ำทุก 10 วินาที — การ์ดที่ข้อมูลไม่เปลี่ยนไม่ต้อง render ใหม่
 * (ต้องส่ง round เป็น object เดิมไม่ได้เพราะมาจากเซิร์ฟเวอร์ใหม่ทุกครั้ง → เทียบด้วย signature ด้านล่าง)
 * @param {Object} props
 * @param {import('@/app/order/[tableNumber]/status/data').CustomerOrderRound} props.round
 */
function OrderRoundCard({ round }) {
  const activeItems = round.items.filter((item) => item.status !== 'cancelled');
  const isAllServed = activeItems.length > 0 && activeItems.every((item) => item.status === 'served');

  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">รอบที่ {round.roundNumber}</h2>
        <p className="text-sm text-ink-muted">
          สั่งเมื่อ {formatClockTime(round.createdAt)}
          {isAllServed && <span className="ml-2 font-semibold text-emerald-800">· ครบแล้ว</span>}
        </p>
      </header>

      <ul className="flex flex-col divide-y divide-line">
        {round.items.map((item) => {
          const status = CUSTOMER_ITEM_STATUS[item.status] ?? CUSTOMER_ITEM_STATUS.pending;
          const Icon = status.icon;
          const isCancelled = item.status === 'cancelled';
          return (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className={cn('font-semibold', isCancelled && 'text-ink-muted line-through')}>
                  {item.name} <span className="font-bold tabular-nums">×{item.quantity}</span>
                </p>
                {item.options.length > 0 && <p className="text-sm text-ink-muted">{item.options.join(', ')}</p>}
              </div>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold',
                  status.badge
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {status.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** render ใหม่เฉพาะเมื่อสถานะ/จำนวนในรอบนี้เปลี่ยนจริง */
function isSameRound(previous, next) {
  const signature = (round) =>
    `${round.roundNumber}|${round.items.map((item) => `${item.id}:${item.status}:${item.quantity}`).join(',')}`;
  return signature(previous.round) === signature(next.round);
}

export default memo(OrderRoundCard, isSameRound);
