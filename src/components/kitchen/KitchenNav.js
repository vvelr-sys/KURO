'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChefHat, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * KitchenNav — แถบนำทางด้านล่างแบบ Clean Minimal
 */
export default function KitchenNav() {
  const pathname = usePathname();

  const navItems = [
    {
      href: '/kds',
      label: 'จอออเดอร์ KDS',
      emoji: '🍲',
      icon: ChefHat,
      isActive: pathname.startsWith('/kds'),
    },
    {
      href: '/stock-override',
      label: 'เปิด/ปิดเมนู',
      emoji: '🔧',
      icon: SlidersHorizontal,
      isActive: pathname.startsWith('/stock-override'),
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-md mx-auto flex items-center justify-around px-4 py-2 gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all select-none',
                item.isActive
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              )}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
