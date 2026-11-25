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
| **📋 SRS v1.8** | ข้อกำหนดความต้องการทางซอฟต์แวร์ฉบับสมบูรณ์ (รวม 57 FRs, NFRs, Workflows) | [`docs/01-requirements/SRS.md`](docs/01-requirements/SRS.md) |
| **🗃️ Data Dictionary** | พจนานุกรมข้อมูลฐานข้อมูล 30 ตาราง (Schema, Constraints, Triggers) | [`docs/02-database/data_dictionary.md`](docs/02-database/data_dictionary.md) |
| **🛡️ Audit Matrix** | เมทริกซ์การตรวจสอบความปลอดภัย, RLS Matrix 18 รายการ, และ Audit Trail | [`docs/03-audit/audit_matrix.md`](docs/03-audit/audit_matrix.md) |
| **💾 Database Schema** | สคริปต์ SQL Migration สมบูรณ์ (30 ตาราง + RLS + Triggers) | [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql) |

---

## 👥 ผู้ใช้งาน อุปกรณ์ และสถานะหลัก (Actors & Shared States)

### ผู้ใช้งานและอุปกรณ์ (Users & Devices)
* 📱 **ลูกค้า (Customer):** มือถือ (สแกน QR บนบัตรคิว/โต๊ะ) $\rightarrow$ **ไม่ต้องล็อกอิน** ดูคิวตัวเอง, สั่งอาหารเอง 100%, จับเวลานับถอยหลัง, เรียกพนักงาน
* 💳 **แคชเชียร์ (Cashier):** แท็บเล็ต / Desktop $\rightarrow$ ออกบัตรคิว/เรียกคิว, เปิดโต๊ะ, คิดเงิน, กรอกส่วนลด (ระบุเหตุผล), ออกใบเสร็จและใบกำกับภาษีเต็มรูป
* 🛎️ **พนักงานหน้าร้าน (Staff):** แท็บเล็ต / มือถือ $\rightarrow$ ย้าย/รวม/แยกโต๊ะ, ยืนยันทำความสะอาดโต๊ะเสร็จ (`cleaning` $\rightarrow$ `available`), ชั่งเนื้อเหลือ, รับแจ้งเตือนเรียกพนักงาน, **นับสต็อกเช้า-เย็น / รับของเข้า / ของเสีย** *(หมายเหตุ: Staff ไม่สามารถออกบัตรคิว เปิดโต๊ะ หรือคิดเงินได้)*
* 🍳 **ครัว (Kitchen):** จอใหญ่ / แท็บเล็ตติดผนัง (KDS) $\rightarrow$ หน้าจอแยก 4 สถานี (*ของสด, เครื่องดื่ม, ปิ้งย่าง, ครัวร้อน*) พร้อม 2 มุมมอง (Ticket View และ Consolidated Prep To-Do View), แตะเปลี่ยนสถานะ `cooking` (ตัดสต็อก BOM) $\rightarrow$ `served`, ยกเลิกพร้อมเหตุผล, Override เปิด/ปิดเมนู (ปิดต้องใส่เหตุผล), หน้าต่างวิธีใช้จอครัว
* 👔 **ผู้จัดการ (Manager):** คอมพิวเตอร์ Desktop $\rightarrow$ จัดการเมนูประจำวันและสูตร BOM, จัดการสต็อกวัตถุดิบ, อนุมัติผลนับสต็อกเช้า-เย็นของ Staff, สรุปสต็อกวันนี้ + กราฟ, รายงานยอดขาย, ช่วยงานหน้าร้าน/ครัว/แคชเชียร์
* 💼 **เจ้าของ / แอดมิน (Admin):** คอมพิวเตอร์ Desktop $\rightarrow$ สิทธิ์สูงสุด: จัดการบัญชีพนักงานและบทบาท, ตั้งค่าราคาบุฟเฟต์/VAT (ไม่มี Service Charge), ตั้งค่าร้านค้า, ดู Audit Log เต็มสิทธิ์, ปรับปรุงสต็อกฉุกเฉิน (Emergency พร้อมเหตุผล)

### สถานะสากลที่ใช้ร่วมกัน (Shared Global States)
* 🪑 **สถานะโต๊ะ (Table Status):** `available` (ว่าง) • `occupied` (มีลูกค้า) • `cleaning` (รอทำความสะอาด) • `disabled` (ปิดใช้งาน) — รองรับ 30 โต๊ะ
* 🎫 **สถานะคิว (Queue Status):** `waiting` (รอ) • `called` (เรียกแล้ว) • `seated` (เข้าโต๊ะ) • `skipped` (ข้าม) • `cancelled` (ยกเลิก)
* 🍳 **สถานะอาหาร (Order Item Status):** `pending` (รอทำ) • `cooking` (กำลังทำ - ตัดสต็อก BOM) • `served` (เสิร์ฟแล้ว) • `cancelled` (ยกเลิก คืนสต็อกตามสูตร)
* 📖 **สถานะเมนู (Menu Availability):** `available` (พร้อมขาย) • `out_of_stock` (หมดอัตโนมัติ/แสดงสถานะ "หมด" บนหน้าลูกค้า สั่งไม่ได้) • `manual_off` (ปิดด้วยมือ)
* ⏳ **สถานะรอบ (Session Status):** `draft` $\rightarrow$ `active` $\rightarrow$ `expired` $\rightarrow$ `closing` $\rightarrow$ `billed` $\rightarrow$ `closed`

---

## 🖥️ สรุปรายการหน้าจอระบบ (Screen Overview)

### 1. ฝั่งลูกค้า (Mobile Web App — ไม่ต้องล็อกอิน)
* `/queue/[queueId]` — **1.1 หน้าดูคิว:** แสดงหมายเลขคิวตัวเอง, คิวปัจจุบัน, จำนวนคิวที่เหลือ, แจ้งเตือนเมื่อถึงคิว
* `/order/[tableNumber]` — **1.2 หน้าสั่งอาหาร + ตัวจับเวลา:** ตัวจับเวลานับถอยหลังตลอดเวลา, ค้นหาเมนู, ตะกร้าสั่งอาหาร, ล็อกเมื่อหมดเวลา (ลูกค้าสั่งเอง 100%)
* `/order/[tableNumber]/status` — **1.3 ติดตามสถานะอาหาร:** รายการที่สั่งแยกรอบและสถานะ Realtime (`pending` $\rightarrow$ `cooking` $\rightarrow$ `served`)
* `/order/[tableNumber]/call-staff` — **1.4 เรียกพนักงาน:** ปุ่มด่วน 5 แบบ (*เรียกพนักงาน, ขอน้ำ, ขอเปลี่ยนเตา/หม้อ, ขอเช็คบิล, อื่นๆ*) มีระบบกันกดซ้ำ
* `/order/[tableNumber]/summary` — **1.5 สรุปรายการอาหาร:** รายการและจำนวนรวมทั้งหมดในรอบ (ไม่แสดงราคาอาหารเพราะเป็นบุฟเฟต์)

### 2. ฝั่งพนักงานหน้าร้าน (Tablet / Mobile POS)
* `/(pos)/queues` — **2.1 จัดการคิวและออกบัตรคิว (Cashier, Manager, Admin):** ระบุจำนวนคน $\rightarrow$ ระบบเลือกขนาดโต๊ะอัตโนมัติ $\rightarrow$ พิมพ์บัตรคิวพร้อม QR ดูคิว
* `/(pos)/tables` — **2.2 จัดการผังโต๊ะ (Cashier, Staff, Manager, Admin):** ผังโต๊ะ 30 โต๊ะ, สีสถานะ, เวลานับถอยหลัง, ฟังก์ชัน: *เปิดโต๊ะ (Cashier), ย้ายโต๊ะ, รวมโต๊ะ (Merge), แยกโต๊ะ (Split), ยืนยันทำความสะอาดเสร็จ (Staff)*
* `/(pos)/billing` — **2.3 คิดเงินและชำระเงิน (Cashier, Manager, Admin):** สรุปยอด, ค่าปรับเนื้อเหลือ, กรอกส่วนลด (ระบุเหตุผล), ช่องทาง: เงินสด/PromptPay/บัตรเครดิต/Split Payment, คำนวณเงินทอน
* `/(pos)/billing/tax-invoice` — **2.4 ใบเสร็จและใบกำกับภาษี (Cashier, Manager, Admin):** พรีวิวใบเสร็จ, ฟอร์มกรอกใบกำกับภาษีเต็มรูป 13 หลัก, พิมพ์ซ้ำ/ส่งอีเมล
* `/(pos)/service-requests` — **2.5 แจ้งเตือนเรียกพนักงาน (Staff, Manager, Admin):** แจ้งเตือนโต๊ะที่กดเรียกแบบ Realtime พร้อมเสียง/สีเตือน และปุ่มกดรับเรื่อง/เสร็จสิ้น
* `/(pos)/stock-count` — **2.6 นับสต็อกเช้า-เย็น (Staff, Manager, Admin):** นับทุกวัตถุดิบแบบไม่เห็นยอดในระบบ (รอบเปิดร้าน/ปิดร้าน) พร้อมรูปวัตถุดิบ (ไม่มีรูปใช้รูปเมนูแทน), เตือนนับซ้ำเมื่อต่างเกิน 10%, ส่งให้ Manager อนุมัติ, แท็บรับของเข้า / ของเสีย

### 3. ฝั่งครัว (KDS จอใหญ่ / Tablet ติดผนัง)
* `/(kitchen)/kds` — **3.1 KDS แยกสถานี (Kitchen, Manager, Admin):** เลือกสถานี (*ของสด, เครื่องดื่ม, ปิ้งย่าง, ครัวร้อน*), การ์ดออเดอร์เรียงตามเวลา พร้อม 2 มุมมอง (Ticket View รายโต๊ะ และ Consolidated Prep To-Do View รวมรายการเตรียมข้ามโต๊ะ), แตะ 2 ครั้ง: เริ่มทำ → เสิร์ฟ, การ์ดมีรูปเมนู + ตัวเลือกที่ลูกค้าเลือก (เช่น เผ็ดน้อย) + สีเตือนรอนาน, เสียงเตือนออเดอร์ใหม่, ปุ่ม "วิธีใช้"
* `/(kitchen)/stock-override` — **3.2 แจ้งของหมด (Kitchen, Manager, Admin):** สวิตช์เปิด/ปิดขายเมนูด้วยตนเองทันที (`manual_off` / `available`) — ปิดเมนูต้องกรอกเหตุผล (เก็บไว้ที่เมนูและ Audit Log)

### 4. ฝั่งหลังบ้าน (Desktop PC)
* `/(auth)/login` — **4.1 เข้าสู่ระบบ:** ล็อกอินพนักงานด้วย Email/Password หรือ Staff PIN (bcrypt)
* `/(admin)/menu` — **4.2 จัดการเมนู (Manager, Admin):** เมนู + รูป, หมวดหมู่, สถานีครัว, ราคาสั่งเพิ่ม, จำกัดจำนวนต่อการกดสั่ง 1 ครั้ง, เปิด/ปิดขาย, แสดงวัตถุดิบในสูตร (แก้สูตร BOM ที่หน้าสต็อก)
* `/(admin)/packages` — **4.3 ตั้งค่าราคา (Admin เท่านั้น):** ราคาผู้ใหญ่/เด็ก (เกณฑ์ส่วนสูงต่ำกว่า 120 ซม.), ระยะเวลาบุฟเฟต์, VAT % Inclusive (ไม่มี Service Charge) พร้อมตัวอย่างบิล — มีผลกับโต๊ะที่เปิดใหม่เท่านั้น
* `/(admin)/inventory` — **4.4 สต็อกวัตถุดิบ (Manager หน้าที่หลัก, Admin เฉพาะ Emergency):** 4 แท็บ: ภาพรวมวันนี้ (ตารางสรุป + กราฟเส้นคลื่น + อนุมัติ/ปฏิเสธผลนับ) · วัตถุดิบ (รูป, Reorder Point, ใช้ในเมนูไหน) · สูตรตัดสต็อก (BOM) · ประวัติความเคลื่อนไหว — Admin ปรับยอดฉุกเฉินได้พร้อมเหตุผล
* `/(admin)/reports` — **4.5 รายงานยอดขาย (Manager, Admin):** รายงานยอดขายรายวัน/เดือน, เมนูขายดี, จำนวนลูกค้า, ช่องทางชำระ, ส่งออก CSV (เปิดด้วย Excel ได้) / พิมพ์-บันทึก PDF
* `/(admin)/staff` — **4.6 จัดการพนักงาน (Admin เท่านั้น):** เพิ่มบัญชี, กำหนดบทบาท (`admin`, `manager`, `cashier`, `kitchen`, `staff`), ปิดใช้งาน (ไม่ลบ), ตั้งรหัสผ่านใหม่, ตั้ง/ล้าง Staff PIN — ต้องมี `SUPABASE_SERVICE_ROLE_KEY`
* `/(admin)/audit-logs` — **4.7 ประวัติการทำงาน (Admin เต็มสิทธิ์, Manager ตามสิทธิ์):** ตรวจสอบย้อนหลัง (*ใคร ทำอะไร เมื่อไหร่ เหตุผล*) รายละเอียดเป็นตาราง "ก่อน / หลัง" เฉพาะช่องที่เปลี่ยน
* `/(admin)/settings` — **4.8 ตั้งค่าร้านค้า (Admin เท่านั้น):** ข้อมูลร้าน, ผัง 30 โต๊ะ, เครื่องพิมพ์, รูปแบบใบเสร็จ

---

## ⚖️ กฎเหล็กสำคัญทางธุรกิจ (Core Principles)

* 🔒 **Snapshot Immobility:** ล็อกจำนวนลูกค้าและราคาต่อหัวทันทีที่เปิดรอบ (`draft` $\rightarrow$ `active`) ห้ามแก้ไขย้อนหลัง
* 🥩 **Leftover Penalty:** คิดค่าปรับเนื้อสัตว์เหลือ 100 บาท ต่อทุก 100 กรัม (ปัดเศษขึ้น) ชั่งเฉพาะเนื้อสัตว์ที่รับประทานได้
* 📦 **Stock Deduct on Cooking:** ตัดสต็อกจริงตาม BOM ทันทีที่ครัวกด `กำลังทำ (cooking)` พร้อมระบบป้องกันตัดซ้ำ (Idempotency) และคืนสต็อก (`cancel_return`) เมื่อยกเลิก
* 🛑 **Auto & Manual Menu Control:** วัตถุดิบหมดระบบปิดเมนูอัตโนมัติ (`out_of_stock`) แสดงสถานะ "หมด" บนหน้าลูกค้า (สั่งไม่ได้) ส่วนเมนูปิดด้วยมือ (`manual_off`) ต้องเปิดด้วยมือเท่านั้น
* 🧽 **Table Sanitization Cycle:** ปิดรอบหรือย้ายโต๊ะ สถานะต้องเป็น `cleaning` เสมอ พนักงานทำความสะอาดเสร็จจึงกลับเป็น `available`
* 🧾 **Flexible Settlement:** รองรับการชำระเงินเต็มจำนวนด้วยเงินสด, PromptPay, บัตรเครดิต, และการแบ่งจ่ายหลายวิธี (Split Payment บันทึกหลายรายการต่อ 1 บิล)

---

## 🚫 ขอบเขตที่ตัดออกในเฟสแรก (Phase 1 Out of Scope)
* ❌ การรับออเดอร์แทนลูกค้า (`staff_assist`) (ลูกค้าสั่งเองผ่าน QR โต๊ะ 100% ในเฟสแรก)
* ❌ ค่าบริการ (Service Charge) ตัดออกจากระบบถาวร
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
แล้วใส่ `SUPABASE_SERVICE_ROLE_KEY` (Secret key ขอจากเพื่อนในทีมทางแชตส่วนตัว — **ห้าม commit**) จำเป็นสำหรับหน้า `/staff`

### 2.1 อัปเดตฐานข้อมูล
รันไฟล์ใน `supabase/migrations/` ที่ยังไม่เคยรัน ตามลำดับเลข (ล่าสุดถึง `028`) ผ่าน Supabase SQL Editor — รายละเอียดและลำดับครบอยู่ใน [`docs/SEED.md`](docs/SEED.md)

### 3. รันเซิร์ฟเวอร์สำหรับพัฒนา
```bash
npm run dev
```
เปิดเบราว์เซอร์ไปที่: [**http://localhost:3000**](http://localhost:3000)

### 4. เปิดจากมือถือ (Cloudflare Quick Tunnel)
ติดตั้งครั้งเดียว: `winget install --id Cloudflare.cloudflared` (ติดตั้งแล้วปิด-เปิด VS Code ใหม่)

ทุกครั้งที่ใช้ — เปิด terminal 2 อัน:
```bash
npm run dev
cloudflared tunnel --url http://localhost:3000
```
เปิดลิงก์ `https://xxxx.trycloudflare.com` ที่ขึ้นใน terminal อันที่ 2 แล้วล็อกอินใหม่ — QR โต๊ะ/บัตรคิวที่ออกจากลิงก์นี้มือถือสแกนได้เลย
ลิงก์เปลี่ยนทุกครั้งที่รันใหม่ และปิด terminal เมื่อไหร่มือถือเข้าไม่ได้ทันที (ส่งลิงก์ให้เฉพาะคนในทีม)
