import Button from "@/components/Button";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white">
      <main className="max-w-2xl w-full text-center space-y-8 p-8 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 shadow-2xl">
        <div className="inline-block px-3 py-1 text-xs font-semibold tracking-wider text-cyan-400 uppercase rounded-full bg-cyan-950/60 border border-cyan-800/50">
          Next.js + Tailwind CSS
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
          ยินดีต้อนรับสู่โปรเจกต์ KURO
        </h1>

        <p className="text-slate-300 text-base sm:text-lg leading-relaxed">
          โครงสร้างโปรเจกต์เริ่มต้นด้วย Next.js (App Router), JavaScript และ Tailwind CSS พร้อมใช้งานแล้ว
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
            <h3 className="font-semibold text-cyan-300 text-sm mb-1">📁 โครงสร้างโปรเจกต์</h3>
            <p className="text-xs text-slate-400">
              โค้ดหลักอยู่ในโฟลเดอร์ <code className="text-white font-mono bg-black/40 px-1 py-0.5 rounded">src/app</code> และคอมโพเนนต์อยู่ใน <code className="text-white font-mono bg-black/40 px-1 py-0.5 rounded">src/components</code>
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
            <h3 className="font-semibold text-cyan-300 text-sm mb-1">⚡ รันเซิร์ฟเวอร์</h3>
            <p className="text-xs text-slate-400">
              เริ่มพัฒนาด้วยคำสั่ง <code className="text-white font-mono bg-black/40 px-1 py-0.5 rounded">npm run dev</code> แล้วเปิด <code className="text-white font-mono bg-black/40 px-1 py-0.5 rounded">http://localhost:3000</code>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Button onClick={undefined}>
            เริ่มต้นพัฒนา
          </Button>
          <a
            href="https://nextjs.org/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg font-medium text-slate-300 hover:text-white border border-white/10 hover:border-white/30 transition-all duration-200"
          >
            Next.js Docs
          </a>
        </div>
      </main>
    </div>
  );
}
