# 🍲 KURO POS — ระบบจัดการร้านบุฟเฟต์ชาบู

> **ระบบบริหารจัดการร้านอาหารบุฟเฟต์ชาบู (รูปแบบเดียวกับสุกี้ตี๋น้อย)**  
> **แนวคิดหลัก:** บุฟเฟต์ราคาเดียวต่อหัว ไม่มีราคาอาหารแยกรายจาน ลูกค้าสั่งอาหารเองผ่าน QR ประจำโต๊ะ (ไม่ต้องใช้ PIN) พนักงานและครัวใช้งานผ่านหน้าจอเฉพาะทางแบบเรียลไทม์ (Realtime Web Application)

---

[![Frontend: Next.js](https://img.shields.io/badge/Frontend-Next.js%2016+-black?logo=next.js)](https://nextjs.org)
[![Database: Supabase](https://img.shields.io/badge/Database-Supabase%20PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com)
[![CSS: Tailwind CSS](https://img.shields.io/badge/CSS-Tailwind%20CSS%20v4-38B2AC?logo=tailwind-css)](https://tailwindcss.com)
[![Realtime: Supabase](https://img.shields.io/badge/Realtime-WebSockets-3ECF8E)](#)

---

## 📚 เอกสารสถาปัตยกรรมระบบ (Documentation Hub)

| เอกสาร | รายละเอียด | ลิงก์ |
|---|---|---|
| **🏗️ Agent Blueprint** | คู่มือหลักสำหรับ AI Agent & Developer (โฟลเดอร์, Routes, กฎเหล็ก 8 ข้อ, Task T-01 ถึง T-10) | [`AGENTS.md`](AGENTS.md) |
| **📋 SRS v1.8** | ข้อกำหนดความต้องการทางซอฟต์แวร์ฉบับสมบูรณ์ (75 FRs, NFRs, Workflows) | [`docs/01-requirements/SRS.md`](docs/01-requirements/SRS.md) |
| **🗃️ Data Dictionary** | พจนานุกรมข้อมูลฐานข้อมูล 28 ตาราง (Schema, Constraints, Triggers) | [`docs/02-database/data_dictionary.md`](docs/02-database/data_dictionary.md) |
| **🛡️ Audit Matrix** | เมทริกซ์การตรวจสอบความปลอดภัย, RLS 5 บทบาท, และ Audit Trail | [`docs/03-audit/audit_matrix.md`](docs/03-audit/audit_matrix.md) |
| **💾 Database Schema** | สคริปต์ SQL Migration สมบูรณ์ (Schema + RLS + Triggers) | [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql) |

---

## 👥 ผู้ใช้งาน อุปกรณ์ และสถานะหลัก (Actors & Shared States)

### ผู้ใช้งานและอุปกรณ์ (Users & Devices)
* 📱 **ลูกค้า (Customer):** มือถือ (สแกน QR บนบัตรคิว/โต๊ะ) $\rightarrow$ **ไม่ต้องล็อกอิน** ดูคิว, สั่งอาหาร, จับเวลา, เรียกพนักงาน
* 🛎️ **พนักงานหน้าร้าน (Staff):** แท็บเล็ต/มือถือ $\rightarrow$ ออกบัตรคิว, จัดการผังโต๊ะ (เปิด/ปิด/ย้าย/รวม/แยก), คิดเงิน, ชั่งเนื้อเหลือ
* 🍳 **ครัว (Kitchen):** จอใหญ่/แท็บเล็ตติดผนัง (KDS) $\rightarrow$ หน้าจอแยก 4 สถานี (*ของสด, เครื่องดื่ม, ปิ้งย่าง, ครัวร้อน*), ปุ่มใหญ่เปลี่ยนสถานะ, Override ของหมด
* 💼 **ผู้จัดการ / เจ้าของ (Manager / Admin):** คอมพิวเตอร์ Desktop $\rightarrow$ เมนู, ราคา, สต็อก, ตรวจนับสต็อกหลังปิดร้าน, รายงานยอดขาย, Audit Log

### สถานะสากลที่ใช้ร่วมกัน (Shared Global States)
* 🪑 **สถานะโต๊ะ (Table Status):** `available` (ว่าง) • `occupied` (มีลูกค้า) • `cleaning` (รอทำความสะอาด) • `disabled` (ปิดใช้งาน)
* 🎫 **สถานะคิว (Queue Status):** `waiting` (รอ) • `called` (เรียกแล้ว) • `seated` (เข้าโต๊ะ) • `skipped` (ข้าม) • `cancelled` (ยกเลิก)
* 🍳 **สถานะอาหาร (Order Item Status):** `pending` (รอทำ) • `cooking` (กำลังทำ - ตัดสต็อก BOM) • `served` (เสิร์ฟแล้ว) • `cancelled` (ยกเลิก)
* 📖 **สถานะเมนู (Menu Availability):** `available` (พร้อมขาย) • `out_of_stock` (หมดอัตโนมัติ/ซ่อนจากลูกค้า) • `manual_off` (ปิดด้วยมือ)
* ⏳ **สถานะรอบ (Session Status):** `draft` $\rightarrow$ `active` $\rightarrow$ `expired` $\rightarrow$ `closing` $\rightarrow$ `billed` $\rightarrow$ `closed`

---

## 🖥️ สรุปรายการหน้าจอระบบ (Screen Overview)

### 1. ฝั่งลูกค้า (Mobile Web App — ไม่ต้องล็อกอิน)
* `/queue/[queueId]` — **1.1 หน้าดูคิว:** แสดงหมายเลขคิวตัวเอง, คิวปัจจุบัน, จำนวนคิวที่เหลือ, แจ้งเตือนเมื่อถึงคิว
* `/order/[tableNumber]` — **1.2 หน้าสั่งอาหาร + ตัวจับเวลา:** ตัวจับเวลานับถอยหลังตลอดเวลา, ค้นหาเมนู, ตะกร้าสั่งอาหาร, ล็อกเมื่อหมดเวลา
* `/order/[tableNumber]/status` — **1.3 ติดตามสถานะอาหาร:** รายการที่สั่งแยกรอบและสถานะ Realtime (`pending` $\rightarrow$ `cooking` $\rightarrow$ `served`)
* `/order/[tableNumber]/call-staff` — **1.4 เรียกพนักงาน:** ปุ่มด่วน 5 แบบ (*เรียกพนักงาน, ขอน้ำ, ขอเปลี่ยนเตา/หม้อ, ขอเช็คบิล, อื่นๆ*) มีระบบกันกดซ้ำ
* `/order/[tableNumber]/summary` — **1.5 สรุปรายการอาหาร:** รายการและจำนวนรวมทั้งหมดในรอบ (ไม่แสดงราคาอาหารเพราะเป็นบุฟเฟต์)

### 2. ฝั่งพนักงานหน้าร้าน (Tablet / Mobile POS)
* `/(pos)/queues` — **2.1 จัดการคิวและออกบัตรคิว:** ระบุจำนวนคน $\rightarrow$ ระบบเลือกขนาดโต๊ะอัตโนมัติ $\rightarrow$ พิมพ์บัตรคิวพร้อม QR ดูคิว
* `/(pos)/tables` — **2.2 จัดการผังโต๊ะ:** ผังโต๊ะ 20 โต๊ะ, สีสถานะ, เวลานับถอยหลัง, ฟังก์ชัน: *เปิดโต๊ะ, ปิดโต๊ะ, ย้ายโต๊ะ, รวมโต๊ะ, แยกโต๊ะ*
* `/(pos)/billing` — **2.3 คิดเงินและชำระเงิน:** สรุปยอด, ค่าปรับเนื้อเหลือ, ส่วนลด, ช่องทาง: เงินสด/PromptPay/บัตรเครดิต/Split Payment, คำนวณเงินทอน
* `/(pos)/billing/tax-invoice` — **2.4 ใบเสร็จและใบกำกับภาษี:** พรีวิวใบเสร็จ, ฟอร์มกรอกใบกำกับภาษีเต็มรูป 13 หลัก, พิมพ์ซ้ำ/ส่งอีเมล
* `/(pos)/service-requests` — **2.5 แจ้งเตือนเรียกพนักงาน:** แจ้งเตือนโต๊ะที่กดเรียกแบบ Realtime พร้อมเสียง/สีเตือน และปุ่มกดรับเรื่อง/เสร็จสิ้น

### 3. ฝั่งครัว (KDS จอใหญ่ / Tablet ติดผนัง)
* `/(kitchen)/kds` — **3.1 KDS แยกสถานี:** เลือกสถานี (*ของสด, เครื่องดื่ม, ปิ้งย่าง, ครัวร้อน*), การ์ดออเดอร์เรียงตามเวลา, ปุ่มใหญ่ `cooking` $\rightarrow$ `served`
* `/(kitchen)/stock-override` — **3.2 แจ้งของหมด (Override):** สวิตช์เปิด/ปิดขายเมนูด้วยตนเองทันทีเมื่อสต็อกจริงในครัวหมด

### 4. ฝั่งหลังบ้าน (Desktop PC)
* `/(auth)/login` — **4.1 เข้าสู่ระบบ:** ล็อกอินพนักงานด้วย Email/Password หรือ Staff PIN (bcrypt)
* `/(admin)/menu` — **4.2 จัดการเมนู:** เมนู, หมวดหมู่, สถานีครัว, สูตรตัดสต็อก (BOM), จำกัดจำนวนสั่งต่อรอบ
* `/(admin)/packages` — **4.3 ตั้งค่าราคา:** ราคาผู้ใหญ่/เด็ก, ระยะเวลาบุฟเฟต์, VAT 7%, Service Charge
* `/(admin)/inventory` — **4.4 สต็อกวัตถุดิบ:** ยอดคงเหลือ, Reorder Point, รับเข้า, ของเสีย, ตรวจนับสต็อกหลังปิดร้าน
* `/(admin)/reports` — **4.5 รายงานยอดขาย:** รายงานยอดขายรายวัน/เดือน, เมนูขายดี, จำนวนลูกค้า, Export Excel/PDF
* `/(admin)/staff` — **4.6 จัดการพนักงาน:** ข้อมูลพนักงาน, บทบาท (`admin`, `manager`, `staff`, `kitchen`, `cashier`)
* `/(admin)/audit-logs` — **4.7 ประวัติการทำงาน:** ตรวจสอบย้อนหลัง (*ใคร ทำอะไร เมื่อไหร่ เหตุผล*)
* `/(admin)/settings` — **4.8 ตั้งค่าร้านค้า:** ข้อมูลร้าน, ผังโต๊ะ, เครื่องพิมพ์, รูปแบบใบเสร็จ

---

## ⚖️ กฎเหล็กสำคัญทางธุรกิจ (Core Principles)

* 🔒 **Snapshot Immobility:** ล็อกจำนวนลูกค้าและราคาต่อหัวทันทีที่เปิดรอบ (`draft` $\rightarrow$ `active`) ห้ามแก้ไขย้อนหลัง
* 🥩 **Leftover Penalty:** คิดค่าปรับเนื้อสัตว์เหลือ 100 บาท ต่อทุก 100 กรัม (ปัดเศษขึ้น) ชั่งเฉพาะเนื้อสัตว์ที่รับประทานได้
* 📦 **Stock Deduct on Cooking:** ตัดสต็อกจริงตาม BOM ทันทีที่ครัวกด `กำลังทำ (cooking)` พร้อมระบบป้องกันตัดซ้ำ (Idempotency)
* 🛑 **Auto & Manual Menu Control:** วัตถุดิบหมดระบบปิดเมนูอัตโนมัติ (`out_of_stock`) ส่วนเมนูปิดด้วยมือ (`manual_off`) ต้องเปิดด้วยมือเท่านั้น
* 🧽 **Table Sanitization Cycle:** ปิดรอบหรือย้ายโต๊ะ สถานะต้องเป็น `cleaning` เสมอ พนักงานทำความสะอาดเสร็จจึงกลับเป็น `available`
* 🧾 **Flexible Settlement:** รองรับการชำระเงินเต็มจำนวนด้วยเงินสด, PromptPay, บัตรเครดิต, และการแบ่งจ่ายหลายวิธี (Split Payment)

---

## 🚫 ขอบเขตที่ตัดออกในเฟสแรก (Phase 1 Out of Scope)
* ❌ หน้าเลือกแพ็กเกจ (เป็นบุฟเฟต์ราคาเดียวต่อหัว)
* ❌ ระบบโปรโมชั่น / คูปองส่วนลดซับซ้อน
* ❌ ระบบสมาชิก / แต้มสะสม
* ❌ ระบบรีวิวและให้คะแนนอาหาร
* ❌ การจองโต๊ะล่วงหน้า (ให้บริการเฉพาะ Walk-in)
* ❌ การจองคิวออนไลน์ฝั่งลูกค้า (ต้องออกบัตรคิวที่เคาน์เตอร์หน้าร้านเท่านั้น)

---

## 🚀 การรันโปรเจกต์สำหรับนักพัฒนา (Getting Started)

### 1. ติดตั้ง Dependencies
```bash
npm install
```

### 2. ตั้งค่า Environment Variables
คัดลอกไฟล์ `.env.example` เป็น `.env.local` (มี Key Supabase ส่วนกลางพร้อมใช้งาน):
```powershell
Copy-Item .env.example .env.local
```

### 3. รันเซิร์ฟเวอร์สำหรับพัฒนา
```bash
npm run dev
```
เปิดเบราว์เซอร์ไปที่: [**http://localhost:3000**](http://localhost:3000)
