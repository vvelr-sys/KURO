'use client';

import React from 'react';
import { cn } from '@/lib/utils';

// ─── ข้อมูลสถานีครัว ────────────────────────────────────────────────────────
const STATION_OPTIONS = [
  {
    value: null,
    label: 'ทุกสถานี',
    labelShort: 'ทั้งหมด',
    emoji: '🍲',
    desc: 'ของสด & ชาบู',
  },
  {
    value: 'fresh',
    label: 'ของสด & ชาบู',
    labelShort: 'ของสด & ชาบู',
    emoji: '🥩',
    desc: 'เนื้อวัว, ผัก, อาหารทะเล, รอทำ',
  },
  {
    value: 'beverage',
    label: 'เครื่องดื่ม & บาร์',
    labelShort: 'เครื่องดื่ม & บาร์',
    emoji: '🧃',
    desc: 'ชา, กาแฟ, น้ำผลไม้, โกโก้กรีม',
  },
  {
    value: 'grill',
    label: 'ปิ้งย่าง & ของทอด',
    labelShort: 'ปิ้งย่าง & ของทอด',
    emoji: '🔥',
    desc: 'เกี๋ยวซ่า, เทมปุระ, เนื้อปิ้งย่าง',
  },
  {
    value: 'hot_kitchen',
    label: 'ครัวร้อน & ซูชิ',
    labelShort: 'ครัวร้อน & ซูชิ',
    emoji: '🍜',
    desc: 'ข้าวหน้าต่างๆ, ซูชิ, ของหวาน',
  },
];

/**
 * StationFilter — การ์ดสถานีครัวแบบ KURO SHABU
 * แสดงจำนวนออเดอร์รอทำในแต่ละสถานี
 *
 * @param {string|null} selectedStation - สถานีที่เลือกอยู่
 * @param {Function} onSelect - callback เมื่อเลือกสถานี
 * @param {Object} orderCountByStation - จำนวนออเดอร์รอทำแยกตามสถานี { fresh: 12, beverage: 4, ... }
 */
const StationFilter = React.memo(function StationFilter({
  selectedStation,
  onSelect,
  orderCountByStation = {},
}) {
  // คำนวณจำนวนรวมทุกสถานี
  const totalCount = Object.values(orderCountByStation).reduce((sum, n) => sum + n, 0);

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
      {STATION_OPTIONS.map((station) => {
        const isActive = selectedStation === station.value;
        // จำนวนออเดอร์รอทำในสถานีนี้
        const count = station.value === null
          ? totalCount
          : (orderCountByStation[station.value] ?? 0);

        return (
          <button
            key={station.value ?? 'all'}
            onClick={() => onSelect(station.value)}
            className={cn(
              'flex-shrink-0 flex flex-col items-start gap-1 px-4 py-3 rounded-xl text-left transition-all border min-w-[140px]',
              isActive
                ? 'bg-[#7F1D1D] border-[#7F1D1D] text-white shadow-md'
                : 'bg-white border-gray-200 text-gray-700 hover:border-red-300 hover:bg-red-50'
            )}
          >
            {/* ไอคอน + ชื่อสถานี */}
            <div className="flex items-center gap-2 w-full">
              <span className="text-lg">{station.emoji}</span>
              <span className="text-xs font-bold leading-tight flex-1">
                {station.labelShort}
              </span>
            </div>

            {/* จำนวนออเดอร์รอทำ */}
            <div className="flex items-baseline gap-1">
              <span className={cn(
                'text-2xl font-black leading-none',
                isActive ? 'text-white' : 'text-[#7F1D1D]'
              )}>
                {count}
              </span>
              <span className={cn(
                'text-xs font-medium',
                isActive ? 'text-red-200' : 'text-gray-400'
              )}>
                รอทำ
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
});

export default StationFilter;
