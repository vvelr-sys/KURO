/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  cacheComponents: true,
  // ตอน npm run dev: ยอมให้เปิดผ่าน Cloudflare Quick Tunnel (https://xxxx.trycloudflare.com)
  // เพื่อทดสอบสแกน QR ด้วยมือถือ — มีผลเฉพาะ dev server ไม่กระทบตอน deploy
  allowedDevOrigins: ['*.trycloudflare.com'],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
