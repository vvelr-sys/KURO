'use client';

import { createPortal } from 'react-dom';

/**
 * พื้นที่สำหรับสั่งพิมพ์ (window.print)
 * วางเนื้อหาไว้ใต้ <body> โดยตรง — ตอนพิมพ์ CSS จะซ่อนทุกอย่างใต้ body ยกเว้นส่วนนี้ (ดู globals.css)
 * บนหน้าจอปกติส่วนนี้มองไม่เห็น
 * ⚠️ ใช้ได้เฉพาะหลังผู้ใช้กดปุ่ม (ต้องมี document แล้ว) เช่น ในหน้าต่างที่เปิดจากการกด
 * @param {Object} props
 * @param {import('react').ReactNode} props.children
 */
export default function PrintPortal({ children }) {
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="print-root">{children}</div>, document.body);
}
