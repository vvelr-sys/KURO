import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { LoginForm } from '@/components/auth';
import { BrandLogo } from '@/components/layout';
import { getCurrentStaff, getPathAfterLogin, toSafeInternalPath } from '@/lib/auth';
import { signIn } from './actions';

export const metadata = {
  title: 'เข้าสู่ระบบ | KURO SHABU POS',
};

/**
 * หน้า 4.1 เข้าสู่ระบบ (ทุกตำแหน่ง) — ตอนนี้ใช้อีเมล + รหัสผ่าน, Staff PIN จะเพิ่มทีหลัง
 * โครงหน้าโหลดทันที ส่วนที่ต้องอ่าน cookie อยู่ใน <Suspense>
 */
export default function LoginPage({ searchParams }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-white px-6 py-4">
        <BrandLogo subtitle="ระบบจัดการร้านบุฟเฟต์ชาบู" />
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <section className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-sm sm:p-10">
          <div className="mb-8 flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/5 text-primary">
              <ShieldCheck className="size-6" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-bold">เข้าสู่ระบบพนักงาน</h1>
              <p className="text-ink-muted">ใช้อีเมลและรหัสผ่านที่ได้รับจากผู้ดูแลระบบ</p>
            </div>
          </div>

          <Suspense fallback={<LoginFormSkeleton />}>
            <LoginFormGate searchParams={searchParams} />
          </Suspense>
        </section>
      </main>
    </div>
  );
}

/**
 * ถ้าล็อกอินอยู่แล้ว → ข้ามไปหน้าที่ควรไปเลย ไม่ต้องเห็นฟอร์ม
 */
async function LoginFormGate({ searchParams }) {
  const { next } = await searchParams;
  const staff = await getCurrentStaff();
  if (staff) redirect(getPathAfterLogin(staff.role, next));

  return <LoginForm signInAction={signIn} nextPath={toSafeInternalPath(next)} />;
}

/** โครงฟอร์มระหว่างรอ (ขนาดเท่าฟอร์มจริง หน้าจะไม่กระตุก) */
function LoginFormSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-5" aria-hidden>
      <div className="h-6 w-16 rounded bg-line" />
      <div className="h-14 rounded-xl bg-surface" />
      <div className="h-6 w-20 rounded bg-line" />
      <div className="h-14 rounded-xl bg-surface" />
      <div className="mt-2 h-14 rounded-xl bg-primary/30" />
    </div>
  );
}
