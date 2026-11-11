[🏠 หน้าหลัก (README)](README.md) • [📋 SRS (v1.7)](docs/01-requirements/SRS.md) • [🗃️ Data Dictionary](docs/02-database/data_dictionary.md) • [🛡️ Audit Matrix](docs/03-audit/audit_matrix.md) • [🏗️ Agent Blueprint](agent.md)

---

# 🏗️ Agent Development Guideline & Architecture Blueprint
## BBQ Buffet POS & Inventory Management System

**Document Version:** 1.0 (Accompanying SRS v1.7 & Schema v1.7)  
**Date:** 11 พฤศจิกายน 2026  
**Status:** Active Production Blueprint for AI & Human Developers

---

## 1. เทคโนโลยีและสถาปัตยกรรมระบบ (Technology Stack)

* **Framework:** Next.js (App Router, Server Actions, Route Handlers)
* **Language:** JavaScript (ES2022+, JSDoc สำหรับ Type Hints)
* **Styling & UI:** Tailwind CSS v4, Lucide React (Icons)
* **Backend & Database:** Supabase PostgreSQL
* **Authentication:** Supabase Auth (Email/Password for Staff roles)
* **Realtime Communication:** Supabase Realtime Channels (Broadcast & Postgres Changes)

---

## 2. กฎเหล็กทางธุรกิจที่ Agent ต้องปฏิบัติตาม (Non-Negotiable Business Rules)

> [!IMPORTANT]
> เมื่อเขียนโค้ด ฟังก์ชัน Server Actions หรือ API ผู้พัฒนาและ AI Agent **ต้องปฏิบัติตามกฎเหล็กเหล่านี้โดยไม่มีข้อยกเว้น** เพื่อรักษาความสอดคล้องของข้อมูลและการเงิน:

### 2.1 Session & Customer Snapshot (BR-027, BR-031, FR-059, FR-061)
* **Session Lifecycle มี 6 สถานะ ตามลำดับ:**

  ```
  draft → active → expired → closing → billed → closed
  ```

  | สถานะ | ความหมาย | จุดสำคัญ |
  | :--- | :--- | :--- |
  | `draft` | Staff กรอกข้อมูลเบื้องต้น | ยังแก้ไขจำนวนลูกค้าและแพ็กเกจได้ |
  | `active` | เปิดรอบบริการ | **ล็อก Snapshot ทันที + เริ่มนับเวลาถอยหลัง** |
  | `expired` | ครบเวลาบุฟเฟต์ | ระบบปิดรับออเดอร์ใหม่อัตโนมัติ |
  | `closing` | Staff ชั่งเนื้อเหลือและกำลังปิด Session | ยังไม่ออกบิล |
  | `billed` | ออกบิลเดี่ยวแล้ว รอ Cashier รับเงิน | บิล Locked ห้ามแก้ |
  | `closed` | Cashier รับเงินและปิดบิลสำเร็จ | โต๊ะเปลี่ยนเป็น `cleaning` |

* **ห้ามแก้ไขจำนวนลูกค้าหรือราคาต่อหัวหลังเปิดรอบ:** เมื่อ Session เปลี่ยนสถานะจาก `draft` เข้าสู่ `active` จำนวนลูกค้า (`adult_guest_count`, `child_guest_count`, `free_guest_count`) และราคา Snapshot (`adult_price_snapshot`, `child_price_snapshot`, **`free_price_snapshot`**, `duration_minutes_snapshot`) จะถูกล็อกทันทีโดย PostgreSQL Trigger ห้ามสร้าง API endpoint หรือ UI ที่ยอมให้แก้ไขค่าเหล่านี้ย้อนหลัง
* **ล็อก Timestamp คู่กัน:** Trigger จะ SET `guest_count_locked_at = now()` **และ** `package_price_locked_at = now()` พร้อมกันเมื่อ `draft → active` — ทั้งสองฟิลด์ต้องมีค่าเสมอเมื่อ Session เป็น `active` ขึ้นไป
* **นับเวลาถอยหลัง:** เริ่มนับทันทีเมื่อเปลี่ยนเป็น `active` (`started_at = now()`, `expires_at = started_at + duration_minutes_snapshot`)

### 2.2 การจัดการโต๊ะและรอบบริการ (A2, BR-038)
* สถานะโต๊ะมี 3 สถานะ: `available` (ว่าง), `occupied` (มีลูกค้า), `cleaning` (รอทำความสะอาด)
* เมื่อลูกค้าย้ายโต๊ะ หรือจบ Session โต๊ะต้องเปลี่ยนเป็น `cleaning` เสมอ ห้ามเปลี่ยนเป็น `available` โดยตรงจนกว่าพนักงานจะกดยืนยันทำความสะอาดเสร็จ

### 2.3 การสั่งอาหารและการตัดสต็อก (FR-033, BR-011, NFR-010)
* **ตัดสต็อกจริง (Actual Consumption) เมื่อครัวกด `accepted` เท่านั้น:** การส่งออเดอร์ (`submitted`) ยังไม่ตัดสต็อก
* **ป้องกันการตัดสต็อกซ้ำ (Idempotency):** มี Unique Constraint `(order_item_id, ingredient_id)` กำกับใน `stock_movements`
* **การยกเลิก:** กระทำที่ระดับ `order_items`:
  - `submitted`: ยกเลิกได้โดย Staff หรือครัวปฏิเสธ (ไม่ต้องคืนสต็อก)
  - `accepted`: ยกเลิกโดย Manager (คืนสต็อกส่วนที่ยังไม่ปรุง)
  - `cooking` หรือ `ready`: ยกเลิกโดย Manager (ไม่คืนสต็อก บันทึกเป็น `kitchen_waste`; หากเป็นเมนูสั่งเพิ่มยังคงคิดเงินในบิล)

### 2.4 การเปิด/ปิดเมนูตามสต็อก (A3, OI-019, BR-010)
* เมนูมี 3 สถานะความพร้อม: `available`, `manual_off`, `auto_off`
* **ห้ามเปิดเมนูที่ปิดด้วยมืออัตโนมัติ:** เมื่อสต็อกวัตถุดิบกลับมาเพียงพอ ระบบจะเปิดกลับอัตโนมัติเฉพาะเมนูที่มีสถานะ `auto_off` เท่านั้น เมนูที่เป็น `manual_off` ต้องรอ Manager หรือ Admin เปิดด้วยตนเอง

### 2.5 ค่าปรับอาหารเหลือและบิลเดี่ยว (FR-042, FR-054, BR-020)
* ชั่งเฉพาะเนื้อสัตว์ที่รับประทานได้และเหลือจริง (ไม่รวมกระดูก/เปลือก)
* อัตราค่าปรับ: **100 บาทต่อทุก 100 กรัม** ปัดเศษขึ้นเป็นหน่วย 100 กรัม (`CEIL(weight_grams / 100.0) * 100.00`)
* **หนึ่ง Session มีบิลเดียว และชำระเต็มจำนวนครั้งเดียว** (`bills` 1:1 กับ `sessions`, `payments` 1:1 กับ `bills`)

### 2.6 การชำระเงินและบันทึกความพยายาม (FR-043, OI-020, A7)
* รองรับช่องทาง `cash` และ `promptpay`; Cashier ตรวจหลักฐาน PromptPay ด้วยตนเองและกดยืนยันใน POS
* **ความพยายามที่ไม่สำเร็จ** (สลิปไม่ถูกต้อง, ยอดไม่ตรง) ให้บันทึกลง `payment_attempts` ไม่ใช่ใน `payments` — เพื่อไม่กระทบ UNIQUE Constraint ของ `payments.bill_id`
* เมื่อชำระสำเร็จ บันทึกลง `payments` ครั้งเดียว พร้อมระบุ `verified_by` (Cashier UUID) และ `verified_at`

### 2.7 การเพิกถอน QR Token อัตโนมัติ (NFR-008, BR-030, OI-012)
* PostgreSQL Trigger `fn_revoke_qr_on_session_close` จะ SET `qr_access_tokens.is_revoked = true` และ `expires_at = now()` **ทันที** เมื่อ `sessions.status` เปลี่ยนเป็น `closed`
* Application Layer **ต้องตรวจ `is_revoked = false`** ทุกครั้งที่ลูกค้าใช้ Token สั่งอาหาร (อย่า trust token ที่ยังไม่หมดอายุตาม `expires_at` อย่างเดียว)

---

## 3. โครงสร้างโฟลเดอร์มาตรฐาน (Folder Structure)

```text
KURO/
├── docs/                          # เอกสารข้อกำหนด (SRS, Data Dictionary, Audit Matrix)
│   ├── 01-requirements/
│   ├── 02-database/
│   └── 03-audit/
├── public/                        # Static Assets & Icons
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/             # หน้าล็อกอินพนักงาน (Supabase Auth)
│   │   ├── (pos)/
│   │   │   ├── tables/            # แผนผังโต๊ะ 20 โต๊ะ & เปิด/ย้ายรอบบริการ
│   │   │   ├── orders/            # จอครัว (Kitchen Display System - KDS)
│   │   │   ├── billing/           # จุดคิดเงิน Cashier & สรุปบิล/ชำระเงิน
│   │   │   ├── inventory/         # จัดการวัตถุดิบ & ตรวจนับสต็อกประจำวัน
│   │   │   └── reports/           # รายงานสำหรับ Manager / Admin
│   │   ├── order/                 # หน้าสั่งอาหารสำหรับลูกค้า (สแกน QR โต๊ะ)
│   │   │   └── [tableNumber]/
│   │   ├── api/                   # Route Handlers & Webhooks
│   │   ├── globals.css            # Tailwind CSS v4 styling
│   │   └── layout.js              # Root Layout
│   ├── components/
│   │   ├── ui/                    # Reusable UI primitives (Buttons, Modals, Badges)
│   │   ├── pos/                   # POS domain-specific widgets
│   │   └── order/                 # Customer ordering widgets
│   └── lib/
│       ├── supabase/
│       │   ├── client.js          # Browser Supabase client
│       │   ├── server.js          # Server-side Supabase client (cookies)
│       │   └── admin.js           # Service-role client for privileged actions
│       ├── utils/                 # Formatters, calculations (VAT, Penalties)
│       └── constants/             # Roles, statuses, system defaults
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql # Master DDL Schema v1.7 (28 tables)
```

---

## 4. มาตรฐานการเขียนโค้ดและ Type-Safety (Coding Standard)

1. **ใช้ JSDoc annotations สำหรับ Type Hints:**  
   ฟังก์ชันและ Server Actions สำคัญควรมี JSDoc กำกับ เช่น:
   ```js
   /**
    * @param {string} sessionId
    * @returns {Promise<import('@/lib/supabase/types').Session>}
    */
   export async function getSession(sessionId) { ... }
   ```
2. **Server Actions vs Client Components:**
   - ข้อมูลที่ต้องการสิทธิ์ระดับ Staff/Manager ให้ดึงผ่าน Server Component หรือเรียก Server Actions ที่มีการตรวจสอบ Session และ Role ด้วย `fn_my_role()` เสมอ
   - Realtime Listeners ให้ทำใน Client Component ผ่าน Supabase Realtime Channel
3. **การคำนวณเงินและภาษี:**
   - คำนวณ VAT 7% ถอดในด้วยสูตร: `Math.round((totalAmount * 7 / 107) * 100) / 100`
   - ค่าปรับอาหารเหลือ (บาท): `Math.ceil(weightGrams / 100) * 100.00`

---

## 5. แนวทางการสั่งงาน AI Agent (Agent Prompts & Tasks Checklist)

เมื่อมอบหมายให้ AI ดำเนินการต่อ ให้ใช้ขอบเขตของ Module ต่อไปนี้:
* **Task 1: Supabase Setup & Client Helpers** (เชื่อมต่อฐานข้อมูล รัน Migration Script และสร้าง Client Helpers ใน `src/lib/supabase/`)
* **Task 2: Staff Authentication & RBAC Layouts** (ระบบล็อกอินและ Layout แยกตาม Role: Admin, Manager, Staff, Kitchen, Cashier)
* **Task 3: Table Management & Session Lifecycle** (จอผังโต๊ะ 20 โต๊ะ, เปิด Session, ล็อก Snapshot, ออก QR/PIN)
* **Task 4: Customer QR Ordering App** (หน้ารับ PIN, ตรวจสิทธิ์ Token, ดูเมนู, สั่งอาหาร, แจ้งเตือนหมดเวลา)
* **Task 5: Kitchen Display System (KDS)** (รับออเดอร์, ตัดสต็อกจริง, เปลี่ยนสถานะ, ปฏิเสธออเดอร์)
* **Task 6: Cashier Billing, Leftover Meat & Payment** (บันทึกชั่งเนื้อเหลือ, ออกบิลเดียว, รับเงินสด/ตรวจสลิป PromptPay)
* **Task 7: Daily Stock Count & Adjustment** (ระบบตรวจนับสต็อกหลังปิดร้าน, คำนวณผลต่าง, อนุมัติปรับยอด)

