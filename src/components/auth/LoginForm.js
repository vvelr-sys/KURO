'use client';

import { useActionState, useState } from 'react';
import { CircleAlert, Eye, EyeOff, LoaderCircle, Lock, Mail, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** @type {import('@/app/(auth)/login/actions').SignInState} */
const INITIAL_STATE = { error: null, email: '' };

/**
 * ฟอร์มเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน (ตาม Figma ฝั่งขวา)
 * @param {Object} props
 * @param {(state: any, formData: FormData) => Promise<any>} props.signInAction - Server Action signIn
 * @param {string|null} props.nextPath - หน้าที่จะพากลับไปหลังล็อกอิน (จาก ?next=)
 */
export default function LoginForm({ signInAction, nextPath }) {
  const [state, formAction, isPending] = useActionState(signInAction, INITIAL_STATE);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  // เก็บว่าผู้ใช้กดปิดกล่อง error ของผลลัพธ์รอบไหนไปแล้ว (ลองใหม่แล้วผิดอีก กล่องจะขึ้นอีกครั้ง)
  const [dismissedState, setDismissedState] = useState(null);

  const isErrorVisible = Boolean(state.error) && dismissedState !== state;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {nextPath && <input type="hidden" name="next" value={nextPath} />}

      {isErrorVisible && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl bg-danger-soft p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger text-white">
            <CircleAlert className="size-5" aria-hidden />
          </span>
          <p className="flex-1 pt-1.5 font-semibold text-danger">{state.error}</p>
          <button
            type="button"
            onClick={() => setDismissedState(state)}
            className="rounded-full p-1 text-danger hover:bg-danger/10"
            aria-label="ปิดข้อความแจ้งเตือน"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="font-semibold">
          อีเมล
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            // key ทำให้ช่องกลับไปใช้ค่าที่กรอกไว้ทุกครั้งที่ได้ผลลัพธ์ใหม่จากเซิร์ฟเวอร์
            key={state.email}
            defaultValue={state.email}
            placeholder="name@kuro.test"
            className="h-14 w-full rounded-xl border border-line bg-white pl-12 pr-4 text-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="password" className="font-semibold">
            รหัสผ่าน
          </label>
          <span className="text-sm text-primary">ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบ</span>
        </div>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            id="password"
            name="password"
            type={isPasswordVisible ? 'text' : 'password'}
            autoComplete="current-password"
            required
            className="h-14 w-full rounded-xl border border-line bg-white pl-12 pr-14 text-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={() => setIsPasswordVisible((visible) => !visible)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-ink-muted hover:bg-surface"
            aria-label={isPasswordVisible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
          >
            {isPasswordVisible ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className={cn(
          'mt-2 flex h-14 items-center justify-center gap-2 rounded-xl bg-primary text-lg font-bold text-white shadow-md transition-colors',
          'hover:bg-primary-deep active:scale-[0.99] disabled:cursor-wait disabled:opacity-70'
        )}
      >
        {isPending && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
        {isPending ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
      </button>
    </form>
  );
}
