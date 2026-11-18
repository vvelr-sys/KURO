import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

/**
 * ต่ออายุ session ของ Supabase ทุก request (เรียกจาก src/proxy.js เท่านั้น)
 * Supabase เก็บ token ใน cookie — ถ้า token ใกล้หมดอายุ จะได้ token ใหม่และเขียน cookie กลับให้
 * @param {import('next/server').NextRequest} request
 * @returns {Promise<{ response: NextResponse, userId: string|null }>}
 */
export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // เขียน cookie ใหม่ทั้งใน request (ให้หน้าเว็บรอบนี้เห็น) และ response (ให้เบราว์เซอร์เก็บ)
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // ⚠️ ห้ามแทรกโค้ดอื่นระหว่างสร้าง client กับ getClaims — ไม่อย่างนั้น session อาจไม่ถูกต่ออายุ
  const { data } = await supabase.auth.getClaims();

  return { response, userId: data?.claims?.sub ?? null };
}
