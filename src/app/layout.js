import { Noto_Sans, Noto_Sans_Thai, Geist_Mono } from "next/font/google";
import "./globals.css";

// ฟอนต์ตาม Figma: Noto Sans (ภาษาไทยใช้ Noto Sans Thai ตระกูลเดียวกัน)
const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-sans-thai",
  subsets: ["thai"],
  weight: ["400", "500", "600", "700"],
});

const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// ตัวเลขเลขที่บิล / รหัส ใช้ฟอนต์ความกว้างเท่ากัน
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "KURO SHABU POS",
  description: "ระบบ POS ร้านบุฟเฟต์ชาบู KURO SHABU",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="th"
      className={`${notoSansThai.variable} ${notoSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
