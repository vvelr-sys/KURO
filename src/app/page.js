import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentStaff, getHomePath } from '@/lib/auth';

// หน้าแรก "/" ไม่มีเนื้อหา — ส่งต่อไปหน้าที่เหมาะกับผู้ใช้
// ยังไม่ล็อกอิน → /login (proxy ส่งไปให้ก่อนถึงหน้านี้อยู่แล้ว) / ล็อกอินแล้ว → หน้าแรกของตำแหน่ง
export default function HomePage() {
  return (
    <Suspense fallback={<p className="p-6 text-ink-muted">กำลังโหลด…</p>}>
      <RedirectToRoleHome />
    </Suspense>
  );
}

async function RedirectToRoleHome() {
  const staff = await getCurrentStaff();
  redirect(staff ? getHomePath(staff.role) : '/login');
}
