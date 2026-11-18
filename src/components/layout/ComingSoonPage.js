import { Construction } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/constants';

/**
 * หน้าชั่วคราว "กำลังพัฒนา" — ตรวจสิทธิ์จริงแล้ว ใช้ทดสอบการล็อกอิน/เด้งหน้า
 * คนที่ทำหน้านั้นให้แทนที่ทั้งไฟล์ page.js ได้เลย (อย่าลืมเรียก requireRole ในหน้าใหม่)
 * ⚠️ อ่าน cookie → ต้องอยู่ใน <Suspense>
 * @param {Object} props
 * @param {string} props.path - path ของหน้า ตรงกับคีย์ใน ROUTE_PERMISSIONS
 * @param {string} props.title - ชื่อหน้า
 */
export default async function ComingSoonPage({ path, title }) {
  const staff = await requireRole(path);

  return (
    <section className="flex flex-col items-center justify-center gap-4 rounded-3xl bg-white p-12 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/5 text-primary">
        <Construction className="size-8" aria-hidden />
      </span>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-ink-muted">หน้านี้กำลังพัฒนา</p>
      <p className="text-sm text-ink-muted">
        เข้าสู่ระบบในฐานะ {staff.fullName} ({ROLE_LABELS[staff.role]}) · <code className="font-mono">{path}</code>
      </p>
    </section>
  );
}

/** โครงหน้าระหว่างรอตรวจสิทธิ์ */
export function PageSkeleton() {
  return <div className="h-64 animate-pulse rounded-3xl bg-white" aria-hidden />;
}
