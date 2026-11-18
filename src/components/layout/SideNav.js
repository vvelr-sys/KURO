'use client';

import { memo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './navItems';

/**
 * แถบเมนูด้านซ้าย (ไอคอน + ชื่อสั้น ตาม Figma)
 * รับเฉพาะรายชื่อ path ที่ตำแหน่งนี้เข้าได้จาก Server — ไอคอนดึงจาก NAV_ITEMS ฝั่ง Client เอง
 * @param {Object} props
 * @param {string[]} props.allowedPaths
 */
function SideNav({ allowedPaths }) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => allowedPaths.includes(item.path));

  return (
    <nav aria-label="เมนูหลัก" className="flex flex-col gap-1">
      {visibleItems.map(({ path, label, icon: Icon }) => {
        const isActive = pathname === path || pathname.startsWith(`${path}/`);
        return (
          <Link
            key={path}
            href={path}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-center text-xs font-medium transition-colors',
              isActive ? 'bg-primary text-white' : 'text-ink-muted hover:bg-primary/5 hover:text-primary'
            )}
          >
            <Icon className="size-6" aria-hidden />
            <span className="leading-tight">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default memo(SideNav);
