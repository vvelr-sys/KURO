'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChefHat, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * KitchenNav — แถบนำทางด้านล่างสำหรับครัว
 * ธีม KURO SHABU สีแดงเข้ม
 */
export default function KitchenNav() {
  const pathname = usePathname();

  const navItems = [
    {
      href: '/kds',
      label: 'จอออเดอร์ KDS',
      icon: ChefHat,
      isActive: pathname.startsWith('/kds'),
    },
    {
      href: '/stock-override',
      label: 'เปิด/ปิดเมนู',
      icon: SlidersHorizontal,
      isActive: pathname.startsWith('/stock-override'),
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-[#1a0a0a] border-t border-red-900/50 shadow-2xl">
      <div className="flex items-center justify-around px-4 py-2 gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition-all select-none',
                item.isActive
                  ? 'bg-[#7F1D1D] text-white shadow-md'
                  : 'text-red-300 hover:text-white hover:bg-red-900/40'
              )}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
