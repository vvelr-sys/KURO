import Link from 'next/link';
import { LogOut, SearchX } from 'lucide-react';
import { signOut } from '@/app/(auth)/login/actions';
import { BrandLogo } from '@/components/layout';

export const metadata = {
  title: 'ไม่พบหน้านี้ | KURO SHABU POS',
};

/**
 * หน้า 404 ของทั้งเว็บ
 * มีปุ่มออกจากระบบด้วย เพราะหน้านี้ไม่มีเมนูของพนักงาน — ถ้าไม่มีปุ่มนี้ คนที่หลงมาจะออกไม่ได้
 * (เช่น บัญชีครัวที่ล็อกอินก่อนหน้า /kds จะถูกรวมเข้าโปรเจกต์)
 */
export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-white px-6 py-4">
        <BrandLogo />
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <section className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl bg-white p-10 text-center shadow-sm">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/5 text-primary">
            <SearchX className="size-8" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold">ไม่พบหน้านี้</h1>
          <p className="text-ink-muted">หน้านี้ยังไม่มีในระบบ หรือที่อยู่ไม่ถูกต้อง</p>

          <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row">
            <Link
              href="/"
              className="flex h-12 flex-1 items-center justify-center rounded-xl bg-primary font-bold text-white hover:bg-primary-deep"
            >
              กลับหน้าหลัก
            </Link>
            <form action={signOut} className="flex-1">
              <button
                type="submit"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-line font-bold text-ink hover:bg-danger-soft hover:text-danger"
              >
                <LogOut className="size-5" aria-hidden />
                ออกจากระบบ
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
