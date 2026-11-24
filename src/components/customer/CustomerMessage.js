import { QrCode } from 'lucide-react';
import BrandLogo from '@/components/layout/BrandLogo';

/**
 * หน้าข้อความเต็มจอของลูกค้า (ยังไม่สแกน QR / QR ใช้ไม่ได้ / โหลดไม่สำเร็จ)
 * @param {Object} props
 * @param {string} props.title
 * @param {import('react').ReactNode} props.children - รายละเอียด
 */
export default function CustomerMessage({ title, children }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 p-4">
      <header className="pt-2">
        <BrandLogo />
      </header>
      <section className="flex flex-col items-center gap-4 rounded-3xl bg-white p-8 text-center shadow-sm">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/5 text-primary">
          <QrCode className="size-8" aria-hidden />
        </span>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-ink-muted">{children}</p>
      </section>
    </main>
  );
}
