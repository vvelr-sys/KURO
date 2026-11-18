import { CircleAlert, CircleCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * กล่องข้อความแจ้งผล (error สีแดง / สำเร็จสีเขียว)
 * @param {Object} props
 * @param {'error'|'success'} [props.tone='error']
 * @param {import('react').ReactNode} props.children
 * @param {string} [props.className]
 */
export default function AlertMessage({ tone = 'error', children, className }) {
  if (!children) return null;
  const isError = tone === 'error';
  const Icon = isError ? CircleAlert : CircleCheck;

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold',
        isError ? 'bg-danger-soft text-danger' : 'bg-emerald-50 text-emerald-800',
        className
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
