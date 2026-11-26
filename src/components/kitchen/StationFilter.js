'use client';

import React from 'react';
import { Beef, CookingPot, CupSoda, Flame, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── สถานีครัว 4 สถานี + ทั้งหมด (ตาม SRS FR-017) ─────────────────────────────
const STATION_OPTIONS = [
  { value: null, label: 'ทุกสถานี', icon: LayoutGrid },
  { value: 'fresh', label: 'ของสด', icon: Beef },
  { value: 'beverage', label: 'เครื่องดื่ม', icon: CupSoda },
  { value: 'grill', label: 'ปิ้งย่าง', icon: Flame },
  { value: 'hot_kitchen', label: 'ครัวร้อน', icon: CookingPot },
];

/**
 * แถบเลือกสถานีครัว (ปุ่มแคปซูลแบบเดียวกับตัวกรองหน้าเรียกพนักงาน) พร้อมจำนวนจานที่รอทำ
 *
 * @param {object} props
 * @param {string|null} props.selectedStation - สถานีที่เลือกอยู่ (null = ทุกสถานี)
 * @param {(station: string|null) => void} props.onSelect
 * @param {Record<string, number>} props.orderCountByStation - จำนวนจานรอทำ/กำลังทำ แยกสถานี
 */
const StationFilter = React.memo(function StationFilter({ selectedStation, onSelect, orderCountByStation = {} }) {
  const totalCount = Object.values(orderCountByStation).reduce((sum, count) => sum + count, 0);

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="เลือกสถานีครัว">
      {STATION_OPTIONS.map(({ value, label, icon: Icon }) => {
        const isActive = selectedStation === value;
        const count = value === null ? totalCount : orderCountByStation[value] ?? 0;

        return (
          <button
            key={value ?? 'all'}
            type="button"
            onClick={() => onSelect(value)}
            aria-pressed={isActive}
            className={cn(
              'flex h-11 items-center gap-1.5 rounded-full px-4 font-semibold transition-colors',
              isActive ? 'bg-primary text-white' : 'bg-surface text-ink hover:bg-primary/5'
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
            <span className="text-sm opacity-80">({count})</span>
          </button>
        );
      })}
    </div>
  );
});

export default StationFilter;
