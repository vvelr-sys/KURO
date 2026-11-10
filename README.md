# KURO - Next.js Project

โปรเจกต์เริ่มต้นพัฒนาด้วย **Next.js (App Router)**, **JavaScript** และ **Tailwind CSS**

---

## 🚀 โครงสร้างโฟลเดอร์ (Project Structure)

```text
KURO/
├── public/                 # ไฟล์ Static เช่น รูปภาพ, favicon
├── src/
│   ├── app/                # App Router (Next.js)
│   │   ├── favicon.ico
│   │   ├── globals.css     # Tailwind CSS styles
│   │   ├── layout.js       # Root Layout
│   │   └── page.js         # หน้าแรก (Home Page)
│   ├── components/         # คอมโพเนนต์ที่ใช้ซ้ำ (Reusable Components)
│   │   └── Button.js
│   └── lib/                # Utility functions หรือ helper ต่างๆ
│       └── utils.js
├── .gitignore
├── eslint.config.mjs       # การตั้งค่า ESLint
├── jsconfig.json           # การตั้งค่า Path Alias (@/*)
├── next.config.mjs         # การตั้งค่า Next.js
└── package.json
```

---

## 🛠️ คำสั่งที่ใช้งานบ่อย (Scripts)

| คำสั่ง | รายละเอียด |
|---|---|
| `npm run dev` | เริ่มต้น Development Server ที่ `http://localhost:3000` |
| `npm run build` | สร้าง Production Build |
| `npm run start` | รันเซิร์ฟเวอร์สำหรับ Production (ต้องรัน build ก่อน) |
| `npm run lint` | ตรวจสอบโค้ดด้วย ESLint |
