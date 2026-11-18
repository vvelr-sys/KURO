'use client';

import { useEffect, useId } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * หน้าต่างป๊อปอัป (กด Esc หรือกดพื้นหลังเพื่อปิด)
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {string} props.title
 * @param {string} [props.description]
 * @param {import('react').ReactNode} props.children
 * @param {import('react').ReactNode} [props.footer] - ปุ่มด้านล่าง
 * @param {boolean} [props.isCloseDisabled] - ห้ามปิดระหว่างกำลังบันทึก
 * @param {string} [props.className]
 */
export default function Modal({ isOpen, onClose, title, description, children, footer, isCloseDisabled = false, className }) {
  const titleId = useId();

  // ปิดด้วยปุ่ม Esc
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isCloseDisabled) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isCloseDisabled, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="ปิดหน้าต่าง"
        tabIndex={-1}
        onClick={() => !isCloseDisabled && onClose()}
        className="absolute inset-0 bg-ink/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-xl',
          className
        )}
      >
        <div className="flex items-start gap-3 border-b border-line px-6 py-4">
          <div className="flex-1">
            <h2 id={titleId} className="text-xl font-bold">
              {title}
            </h2>
            {description && <p className="text-sm text-ink-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isCloseDisabled}
            className="rounded-full p-2 text-ink-muted hover:bg-surface disabled:opacity-40"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex gap-3 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
