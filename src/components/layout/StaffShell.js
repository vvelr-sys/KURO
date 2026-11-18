import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { LogOut, UserRound } from 'lucide-react';
import { signOut } from '@/app/(auth)/login/actions';
import { getCurrentStaff, canAccessPath } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/constants';
import BrandLogo from './BrandLogo';
import LiveClock from './LiveClock';
import SideNav from './SideNav';
import { NAV_ITEMS } from './navItems';

/**
 * โครงหน้าของพนักงาน (แถบบน + เมนูซ้าย) ใช้ร่วมกันใน layout ของ (pos) และ (admin)
 * ตัวโครงเป็นส่วนคงที่ โหลดทันที — ส่วนที่ต้องรู้ว่าใครล็อกอิน (เมนู, ชื่อผู้ใช้) อยู่ใน <Suspense>
 * ⚠️ layout ไม่ได้ตรวจสิทธิ์ของหน้า — ทุก page ต้องเรียก requireRole() เอง
 * @param {Object} props
 * @param {import('react').ReactNode} props.children
 */
export default function StaffShell({ children }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-line bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <BrandLogo />
        <div className="ml-auto flex items-center gap-3">
          <LiveClock />
          <Suspense fallback={<UserBadgeSkeleton />}>
            <UserBadge />
          </Suspense>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="sticky top-[73px] h-[calc(100vh-73px)] w-24 shrink-0 overflow-y-auto border-r border-line bg-white p-2">
          <Suspense fallback={<SideNavSkeleton />}>
            <StaffSideNav />
          </Suspense>
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

/** เมนูซ้ายเฉพาะหน้าที่ตำแหน่งนี้เข้าได้ */
async function StaffSideNav() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login');

  const allowedPaths = NAV_ITEMS.map((item) => item.path).filter((path) => canAccessPath(staff.role, path));
  return <SideNav allowedPaths={allowedPaths} />;
}

/** ชื่อ + ตำแหน่ง + ปุ่มออกจากระบบ (มุมขวาบน) */
async function UserBadge() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login');

  return (
    <div className="flex items-center gap-3 rounded-full bg-surface py-1.5 pl-4 pr-1.5">
      <div className="text-right leading-tight">
        <p className="font-semibold">{staff.fullName}</p>
        <p className="text-sm text-ink-muted">{ROLE_LABELS[staff.role] ?? staff.role}</p>
      </div>
      <span className="flex size-10 items-center justify-center rounded-full bg-primary text-white">
        <UserRound className="size-5" aria-hidden />
      </span>
      <form action={signOut}>
        <button
          type="submit"
          className="flex size-10 items-center justify-center rounded-full text-ink-muted hover:bg-danger-soft hover:text-danger"
          aria-label="ออกจากระบบ"
          title="ออกจากระบบ"
        >
          <LogOut className="size-5" aria-hidden />
        </button>
      </form>
    </div>
  );
}

function UserBadgeSkeleton() {
  return <div className="h-[52px] w-56 animate-pulse rounded-full bg-surface" aria-hidden />;
}

function SideNavSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-1" aria-hidden>
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="h-[68px] rounded-2xl bg-surface" />
      ))}
    </div>
  );
}
