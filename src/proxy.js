import { NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';
import { CUSTOMER_TOKEN_COOKIE, CUSTOMER_TOKEN_MAX_AGE_SECONDS } from '@/lib/constants';

// Proxy (ชื่อเดิมใน Next 15 คือ Middleware) ทำงานก่อนทุกหน้า
// หน้าที่: 1) ต่ออายุ session  2) ยังไม่ล็อกอินแต่เข้าหน้าพนักงาน → ส่งไป /login
// การตรวจ "ตำแหน่ง" ไม่ทำที่นี่ (ต้องค้นฐานข้อมูล ช้าเกินไปสำหรับทุก request)
// แต่ทำใน requireRole() ของแต่ละหน้า + RLS ในฐานข้อมูลอีกชั้น

/**
 * หน้าที่เปิดได้โดยไม่ต้องล็อกอิน
 * - /login
 * - /order/... หน้าสั่งอาหารของลูกค้า (ตรวจด้วย QR Token แทน)
 * - /queue/... หน้าดูคิวของลูกค้า (ระวัง: /queues ของพนักงานต้องล็อกอิน)
 * @param {string} path
 * @returns {boolean}
 */
function isPublicPath(path) {
  return (
    path === '/login' ||
    path === '/order' ||
    path.startsWith('/order/') ||
    path.startsWith('/queue/')
  );
}

/**
 * ลูกค้าสแกน QR โต๊ะ: /order/T01?t=<token> → เก็บ token ใน cookie (httpOnly) แล้วพาไป /order/T01
 * แถบ URL จะไม่มี token (กันลูกค้าแชร์ลิงก์/ภาพหน้าจอแล้ว token หลุด)
 * ตรงนี้ยังไม่ตรวจกับฐานข้อมูล — หน้า /order ตรวจ token ทุกครั้งที่โหลดผ่าน fn_customer_get_session
 * @param {import('next/server').NextRequest} request
 * @returns {NextResponse|null} null = ไม่ใช่ลิงก์จาก QR
 */
function storeCustomerTokenFromQr(request) {
  const path = request.nextUrl.pathname;
  const token = request.nextUrl.searchParams.get('t');
  if (!token || !path.startsWith('/order/')) return null;

  const cleanUrl = request.nextUrl.clone();
  cleanUrl.searchParams.delete('t');

  const redirectResponse = NextResponse.redirect(cleanUrl);
  redirectResponse.cookies.set(CUSTOMER_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/order',
    maxAge: CUSTOMER_TOKEN_MAX_AGE_SECONDS,
  });
  return redirectResponse;
}

/**
 * @param {import('next/server').NextRequest} request
 */
export async function proxy(request) {
  // ลูกค้าไม่ต้องต่ออายุ session พนักงาน → ทำก่อน updateSession ให้เร็วที่สุด
  const qrRedirect = storeCustomerTokenFromQr(request);
  if (qrRedirect) return qrRedirect;

  const { response, userId } = await updateSession(request);
  const path = request.nextUrl.pathname;

  if (!userId && !isPublicPath(path)) {
    const loginUrl = new URL('/login', request.url);
    // จำหน้าที่ตั้งใจจะเข้า เพื่อพากลับไปหลังล็อกอิน (หน้าแรก / ไม่ต้องจำ)
    if (path !== '/') loginUrl.searchParams.set('next', path);

    const redirectResponse = NextResponse.redirect(loginUrl);
    // คัด cookie ที่เพิ่งต่ออายุ/ล้างไปด้วย ไม่อย่างนั้นเบราว์เซอร์จะไม่ได้รับ
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return response;
}

export const config = {
  // ไม่ต้องรันกับไฟล์ระบบ / รูปภาพ / API
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
