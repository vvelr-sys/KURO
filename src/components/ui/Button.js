import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/** สีปุ่มแต่ละแบบ (ตามธีม Figma) */
const VARIANT_CLASSES = {
  primary: 'bg-primary text-white hover:bg-primary-deep',
  success: 'bg-emerald-800 text-white hover:bg-emerald-900',
  secondary: 'bg-line text-ink hover:bg-ink/10',
  danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-white',
  ghost: 'text-ink-muted hover:bg-surface',
};

const SIZE_CLASSES = {
  md: 'h-11 px-4 text-base',
  lg: 'h-14 px-5 text-lg',
  sm: 'h-9 px-3 text-sm',
};

/**
 * ปุ่มมาตรฐานของระบบ
 * @param {Object} props
 * @param {'primary'|'success'|'secondary'|'danger'|'ghost'} [props.variant='primary']
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {boolean} [props.isLoading] - แสดงไอคอนหมุน และกดซ้ำไม่ได้
 * @param {import('react').ComponentType<any>} [props.icon] - ไอคอน lucide ด้านหน้าข้อความ
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon: Icon,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    >
      {isLoading ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : Icon && <Icon className="size-5" aria-hidden />}
      {children}
    </button>
  );
}
