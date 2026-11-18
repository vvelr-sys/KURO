'use client';

import React from 'react';
import { cn } from '@/lib/utils';

const STATION_OPTIONS = [
  { value: null, label: 'ทั้งหมด', emoji: '🍲' },
  { value: 'fresh', label: 'ของสด', emoji: '🥩' },
  { value: 'beverage', label: 'เครื่องดื่ม', emoji: '🧃' },
  { value: 'grill', label: 'ปิ้งย่าง', emoji: '🔥' },
  { value: 'hot_kitchen', label: 'ครัวร้อน', emoji: '🍜' },
];

/**
 * StationFilter — แถบกรองสถานีครัวแบบ Clean Minimal
 */
const StationFilter = React.memo(function StationFilter({ selectedStation, onSelect }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {STATION_OPTIONS.map((station) => {
        const isActive = selectedStation === station.value;
        return (
          <button
            key={station.value ?? 'all'}
            onClick={() => onSelect(station.value)}
            className={cn(
              'flex-shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all',
              isActive
                ? 'bg-gray-900 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400 hover:text-gray-900'
            )}
          >
            <span>{station.emoji}</span>
            <span>{station.label}</span>
          </button>
        );
      })}
    </div>
  );
});

export default StationFilter;
