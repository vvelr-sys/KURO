import { NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

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
 * @param {import('next/server').NextRequest} request
 */
export async function proxy(request) {
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
