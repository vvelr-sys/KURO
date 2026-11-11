<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

[README](README.md) • [SRS v1.8](docs/01-requirements/SRS.md) • [Data Dictionary](docs/02-database/data_dictionary.md) • [Audit Matrix](docs/03-audit/audit_matrix.md) • [Agent Blueprint](AGENTS.md)

---

# KURO POS — Agent Blueprint & Development Guide
> **ระบบ POS ร้านบุฟเฟต์ชาบู (สุกี้ตี๋น้อย Model)**  
> **Version:** 1.8 | **Date:** 12 พฤศจิกายน 2026  
> **สำหรับ:** AI Agent & Developer — ใช้เอกสารนี้เป็น Single Source of Truth ก่อนเขียนโค้ดทุกครั้ง

> [!CAUTION]
> ### 🛑 กฎเหล็กสูงสุดสำหรับ AI Agent: ห้ามเดาข้อกำหนดเองเด็ดขาด ("ห้ามเดา")
> 1. **ห้ามคาดเดา คิดเอง หรือทึกทักฟีเจอร์/ขั้นตอนการทำงานขึ้นมาเองเด็ดขาด:** หากพบประเด็นใดที่ไม่ชัดเจน หรือไม่มีระบุไว้ในเอกสารนี้ ให้ **หยุดและถามผู้ใช้ก่อนเสมอ**
> 2. **ต้องรอจนกว่าผู้ใช้จะตัดสินใจและยืนยัน:** ห้ามเริ่มเขียนโค้ดหรือสร้างโครงสร้างนอกเหนือจากที่ผู้ใช้เห็นชอบ
> 3. **ยึดตามข้อกำหนด UX/UI v1.8 เป็นหลัก 100%:** ห้ามแอบใส่ฟีเจอร์ในส่วน Out of Scope หรือกฎระบบเก่ากลับเข้ามา

> [!IMPORTANT]
> อ่านทุกส่วนก่อนเริ่ม Task ใดๆ เพราะแต่ละส่วนมีกฎที่ต้องบังคับใช้ในโค้ดโดยตรง

---

## ส่วนที่ 1 — ภาพรวมระบบและโมเดลธุรกิจ

### 1.1 Business Model

| รายการ | รายละเอียด |
|---|---|
| **ประเภทธุรกิจ** | ร้านบุฟเฟต์ชาบู รูปแบบเดียวกับสุกี้ตี๋น้อย |
| **โมเดลราคา** | ราคาเดียวต่อหัว — ไม่มีราคาอาหารแยกรายจาน |
| **โต๊ะ** | 20 โต๊ะ (รองรับย้าย, รวม Merge, แยก Split) |
| **ระยะเวลาบริการ** | กำหนดเป็น `duration_minutes` ต่อ Session เช่น 90 นาที |
| **ค่าปรับอาหารเหลือ** | 100 บาทต่อทุก 100 กรัม (ปัดขึ้น) ชั่งเฉพาะเนื้อสัตว์ที่กินได้ |

### 1.2 ผู้ใช้งานและอุปกรณ์

| ผู้ใช้ | อุปกรณ์ | หน้าที่หลัก |
|---|---|---|
| **Customer** | มือถือ (สแกน QR) | ดูคิว, สั่งอาหาร, ดูสถานะ, เรียกพนักงาน — **ไม่ต้องล็อกอิน** |
| **Staff** | Tablet / มือถือ | จัดการคิว, ผังโต๊ะ, รับชำระเงิน, รับแจ้งเตือน |
| **Kitchen** | จอใหญ่ / Tablet ติดผนัง (KDS) | รับ-เปลี่ยนสถานะออเดอร์ แยกสถานี, Override เมนูหมด |
| **Manager / Admin** | Desktop | จัดการหลังบ้านทั้งหมด: เมนู, ราคา, สต็อก, รายงาน, Audit |

---

## ส่วนที่ 2 — Tech Stack และสถาปัตยกรรม

### 2.1 Technology Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router, Server Actions, Route Handlers) |
| **Language** | JavaScript ES2022+ พร้อม JSDoc (ห้ามใช้ TypeScript) |
| **Styling** | Tailwind CSS v4, Lucide React, clsx, tailwind-merge |
| **Database** | Supabase PostgreSQL (28+ ตาราง) |
| **Auth** | Supabase Auth — Email/Password สำหรับ Staff เท่านั้น |
| **Realtime** | Supabase Realtime Channels (Broadcast + Postgres Changes) |
| **QR Code** | qrcode.react สำหรับ QR โต๊ะและบัตรคิว |
| **Security** | bcryptjs สำหรับ Staff PIN hashing |

> [!NOTE]
> ลูกค้า **ไม่มี** Auth — เข้าสู่หน้าสั่งอาหารด้วย QR Token ของ Session โดยตรง ไม่ต้องกรอก PIN

### 2.2 โครงสร้างโฟลเดอร์ (Next.js 16 App Router)

```text
KURO/
├── docs/                              # เอกสาร SRS, Data Dictionary, Audit Matrix
├── public/                            # Static Assets, Icons, Logos
├── src/
│   ├── app/
│   │   │
│   │   ├── (auth)/                    # ═══ กลุ่ม: Staff Login ═══
│   │   │   └── login/                 # 4.1 หน้าล็อกอิน (Supabase Auth + Staff PIN)
│   │   │
│   │   ├── (pos)/                     # ═══ กลุ่ม: พนักงานหน้าร้าน (Tablet/Mobile) ═══
│   │   │   ├── queues/                # 2.1 จัดการคิวและออกบัตรคิว
│   │   │   ├── tables/                # 2.2 ผังโต๊ะ (เปิด/ปิด/ย้าย/รวม/แยก)
│   │   │   ├── billing/               # 2.3 คิดเงินและชำระเงิน
│   │   │   │   └── tax-invoice/       # 2.4 พิมพ์ใบเสร็จ / ใบกำกับภาษีเต็มรูป
│   │   │   └── service-requests/      # 2.5 แจ้งเตือนเรียกพนักงาน (Realtime)
│   │   │
│   │   ├── (kitchen)/                 # ═══ กลุ่ม: ครัว KDS (จอใหญ่/Tablet) ═══
│   │   │   ├── kds/                   # 3.1 KDS แยกสถานี (ของสด/เครื่องดื่ม/ปิ้งย่าง/ครัวร้อน)
│   │   │   └── stock-override/        # 3.2 Override เปิด/ปิดเมนูด้วยตนเอง
│   │   │
│   │   ├── (admin)/                   # ═══ กลุ่ม: หลังบ้าน (Desktop) ═══
│   │   │   ├── menu/                  # 4.2 จัดการเมนู + สูตรตัดสต็อก (BOM)
│   │   │   ├── packages/              # 4.3 ตั้งค่าราคาบุฟเฟต์ + VAT + Service Charge
│   │   │   ├── inventory/             # 4.4 จัดการสต็อกวัตถุดิบ
│   │   │   ├── reports/               # 4.5 รายงานยอดขาย
│   │   │   ├── staff/                 # 4.6 จัดการพนักงานและสิทธิ์
│   │   │   ├── audit-logs/            # 4.7 ประวัติการทำงาน (Audit Log)
│   │   │   └── settings/              # 4.8 ตั้งค่าร้านค้า
│   │   │
│   │   ├── queue/[queueId]/           # ═══ กลุ่ม: ลูกค้า (Mobile) ═══
│   │   ├── order/[tableNumber]/        # 1.2 สั่งอาหาร + ตัวจับเวลา
│   │   │   ├── status/                # 1.3 ติดตามสถานะอาหาร
│   │   │   ├── call-staff/            # 1.4 เรียกพนักงาน
│   │   │   └── summary/               # 1.5 สรุปรายการที่สั่งในรอบ
│   │   │
│   │   ├── api/                       # Route Handlers & Webhooks
│   │   ├── globals.css                # Tailwind CSS v4
│   │   └── layout.js                  # Root Layout
│   │
│   ├── components/
│   │   ├── ui/                        # Reusable UI: Buttons, Modals, Badges, Cards
│   │   ├── customer/                  # Customer: MenuCard, OrderCart, Timer
│   │   ├── pos/                       # POS: TableMap, QueueList, BillingForm
│   │   └── kitchen/                   # Kitchen: OrderCard, StationFilter, StatusButton
│   │
│   └── lib/
│       ├── supabase/                  # client.js, server.js, admin.js
│       ├── utils.js                   # cn(), formatCurrency(), calcVAT(), calcPenalty()
│       └── constants/                 # index.js — Enums & State Values
│
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql     # Migration สมบูรณ์ (28 ตาราง + RLS + Triggers)
```

---

## ส่วนที่ 3 — Global States (สถานะที่ใช้ร่วมทุกหน้าจอ)

> [!IMPORTANT]
> สถานะเหล่านี้ต้องซิงค์ผ่าน Supabase Realtime — ห้ามใช้ค่าอื่นนอกจากที่ระบุด้านล่าง

### 3.1 Table Status — สถานะโต๊ะ (4 ค่า)

```
available  →  occupied  →  cleaning  →  available
                              ↑
                           disabled (ปิดใช้งาน เช่น เตาชำรุด)
```

| ค่า | ความหมาย | เงื่อนไขการเปลี่ยน |
|---|---|---|
| `available` | โต๊ะว่าง พร้อมเปิดบริการ | Staff กดทำความสะอาดเสร็จ |
| `occupied` | มีลูกค้า Session กำลังรัน | Staff เปิดโต๊ะ |
| `cleaning` | รอทำความสะอาด | ปิดรอบหรือย้ายโต๊ะ |
| `disabled` | ปิดใช้งานชั่วคราว | Manager/Admin สั่งปิด |

### 3.2 Queue Status — สถานะคิว (5 ค่า)

```
waiting → called → seated
              ↓
           skipped / cancelled
```

| ค่า | ความหมาย |
|---|---|
| `waiting` | รอเรียก |
| `called` | Staff กดเรียกแล้ว |
| `seated` | ลูกค้าเข้าโต๊ะแล้ว (Session เปิด) |
| `skipped` | เรียกแล้วไม่มา Staff กดข้าม |
| `cancelled` | ยกเลิกคิว |

### 3.3 Order Item Status — สถานะอาหาร (4 ค่า เท่านั้น)

```
pending  →  cooking  →  served
               ↓
           cancelled
```

| ค่า | ความหมาย | ผลต่อสต็อก |
|---|---|---|
| `pending` | รอทำ ออเดอร์ส่งเข้าครัวแล้ว | ยังไม่ตัดสต็อก |
| `cooking` | ครัวกดรับ กำลังปรุง | **ตัดสต็อกทันที (BOM)** |
| `served` | ปรุงเสร็จ เสิร์ฟแล้ว | — |
| `cancelled` | ยกเลิก (ระบุเหตุผล) | คืนสต็อกตามสูตร BOM (ถ้าตัดไปแล้ว) |

> [!WARNING]
> ห้ามใช้สถานะเก่า: `submitted`, `accepted`, `ready` — ถูกตัดออกจากระบบแล้ว

### 3.4 Menu Availability — สถานะเมนู (3 ค่า)

| ค่า | ความหมาย | ใครเปลี่ยน |
|---|---|---|
| `available` | พร้อมขาย | ระบบ / Manager / Admin |
| `out_of_stock` | สต็อกหมด แสดงสถานะ "หมด" บนหน้าลูกค้า สั่งไม่ได้ | ระบบอัตโนมัติ |
| `manual_off` | ปิดด้วยมือ | Kitchen Override / Manager / Admin |

### 3.5 Session Status — สถานะรอบบริการ (6 ค่า)

```
draft → active → expired → closing → billed → closed
```

| ค่า | ความหมาย |
|---|---|
| `draft` | สร้างแล้ว ยังไม่เริ่ม (แก้จำนวนลูกค้าได้) |
| `active` | เริ่มรอบ นับเวลา ล็อก Snapshot แล้ว |
| `expired` | หมดเวลา ปิดรับออเดอร์ใหม่ |
| `closing` | Staff เชิญลูกค้าออก กำลังชั่งเนื้อเหลือ |
| `billed` | ออกบิลแล้ว รอชำระเงิน |
| `closed` | ชำระเงินและปิดรอบสมบูรณ์ |

---

## ส่วนที่ 4 — Route Architecture (แผนผังหน้าจอ)

### 4.1 ฝั่งลูกค้า — Mobile Web (ไม่ต้อง Auth)

| Route | หน้าจอ | สิ่งที่ต้องมี |
|---|---|---|
| `/queue/[queueId]` | **1.1 ดูคิว** | เลขคิวตัวเอง, คิวที่กำลังเรียก, จำนวนคิวที่เหลือ, แจ้งเตือนเมื่อถึงคิว (Realtime) |
| `/order/[tableNumber]` | **1.2 สั่งอาหาร + จับเวลา** | Timer นับถอยหลัง, หมวดหมู่เมนู, ค้นหา, Card +/-, ตะกร้า, ล็อกเมื่อหมดเวลา |
| `/order/[tableNumber]/status` | **1.3 ติดตามสถานะ** | รายการอาหารแยกรอบ + สถานะ Realtime |
| `/order/[tableNumber]/call-staff` | **1.4 เรียกพนักงาน** | ปุ่มด่วน 5 ประเภท, สถานะ "แจ้งแล้ว", กันกดซ้ำ |
| `/order/[tableNumber]/summary` | **1.5 สรุปรายการ** | รายการ + จำนวนรวม **(ไม่แสดงราคาอาหาร)** |

### 4.2 ฝั่งพนักงาน — Tablet/Mobile POS (ต้อง Auth: staff, cashier)

| Route | หน้าจอ | สิ่งที่ต้องมี |
|---|---|---|
| `/(pos)/queues` | **2.1 จัดการคิว** | ออกบัตรคิว (จำนวนคน → ขนาดโต๊ะอัตโนมัติ → พิมพ์ QR), รายการคิว, ปุ่มเรียก/ข้าม/ยกเลิก/พิมพ์ซ้ำ |
| `/(pos)/tables` | **2.2 ผังโต๊ะ** | ผัง + สี + Timer, ฟังก์ชัน: เปิด/ปิด/ย้าย/รวม/แยกโต๊ะ |
| `/(pos)/billing` | **2.3 ชำระเงิน** | สรุปยอด, เพิ่มรายการพิเศษ, ส่วนลด, เงินสด/PromptPay/บัตร/Split |
| `/(pos)/billing/tax-invoice` | **2.4 ใบกำกับภาษี** | พรีวิวใบเสร็จ, ฟอร์มข้อมูลนิติบุคคล/บุคคล, เลขผู้เสียภาษี 13 หลัก, พิมพ์/อีเมล |
| `/(pos)/service-requests` | **2.5 แจ้งเตือน** | รายการ Realtime (โต๊ะ+ประเภท+เวลารอ), เสียง/สี, ปุ่มรับเรื่อง/เสร็จ |

### 4.3 ฝั่งครัว — KDS (ต้อง Auth: kitchen)

| Route | หน้าจอ | สิ่งที่ต้องมี |
|---|---|---|
| `/(kitchen)/kds` | **3.1 KDS แยกสถานี** | เลือกสถานี (ของสด/เครื่องดื่ม/ปิ้งย่าง/ครัวร้อน), Card เรียงตามเวลา, สีเตือนรอนาน, ปุ่มใหญ่ `cooking` → `served` |
| `/(kitchen)/stock-override` | **3.2 Override เมนูหมด** | รายการเมนูพร้อมสวิตช์ manual_off |

### 4.4 ฝั่งหลังบ้าน — Desktop (ต้อง Auth: admin, manager)

| Route | หน้าจอ | สิ่งที่ต้องมี |
|---|---|---|
| `/(auth)/login` | **4.1 Login** | Email/Password หรือ Staff PIN, Redirect ตาม Role |
| `/(admin)/menu` | **4.2 จัดการเมนู** | ชื่อ, รูป, หมวดหมู่, `kitchen_station`, สูตร BOM, เปิด/ปิดขาย, จำกัดจำนวนสั่งต่อรอบ |
| `/(admin)/packages` | **4.3 ราคา/แพ็กเกจ** | ราคาผู้ใหญ่/เด็ก, duration, VAT %, Service Charge % |
| `/(admin)/inventory` | **4.4 สต็อก** | ของคงเหลือ, Reorder point, รับเข้า, ของเสีย, ตรวจนับรายวัน |
| `/(admin)/reports` | **4.5 รายงาน** | ยอดขายวัน/เดือน, เมนูขายดี, จำนวนลูกค้า, Export Excel/PDF |
| `/(admin)/staff` | **4.6 พนักงาน** | เพิ่ม/แก้ไข/ปิดใช้งาน, กำหนด Role |
| `/(admin)/audit-logs` | **4.7 Audit** | ค้นหา/กรองประวัติ (ใคร ทำอะไร เมื่อไหร่ เหตุผล) |
| `/(admin)/settings` | **4.8 ตั้งค่า** | ข้อมูลร้าน, ผังโต๊ะ, เครื่องพิมพ์, รูปแบบใบเสร็จ |

---

## ส่วนที่ 5 — กฎเหล็กทางธุรกิจ (ต้องบังคับใช้ในโค้ด)

> [!IMPORTANT]
> กฎเหล่านี้ต้องถูก enforce ในระดับ Database (Trigger/RLS) และ Application Logic พร้อมกัน

### กฎที่ 0 — ห้าม AI คาดเดาเด็ดขาด (Strict No-Guessing Rule)
- ❌ **ห้ามคาดเดาความต้องการเอง:** หากเจอจุดที่สงสัย กำกวม หรือไม่มีในเอกสาร **ต้องหยุดถามผู้ใช้เสมอ**
- ❌ **ห้ามตัดสินใจแทนผู้ใช้:** ห้ามคิดฟีเจอร์เพิ่ม ห้ามเปลี่ยนโฟลว์การทำงานเอง จนกว่าผู้ใช้จะตัดสินใจและยืนยัน
- ✅ **Single Source of Truth:** ทุกฟังก์ชันต้องตรงตามเอกสาร UX/UI v1.8 เท่านั้น

### กฎที่ 1 — ลูกค้าสแกน QR เข้าได้ทันที (Zero-friction)
- ลูกค้าสแกน QR โต๊ะ → เข้าหน้าสั่งอาหารได้ทันที **ไม่ต้องล็อกอิน ไม่มี PIN**
- ระบบตรวจสิทธิ์ด้วย `qr_access_tokens` ที่ผูกกับ Session
- เมื่อ Session `closed` → Token ต้องถูกยกเลิก (`is_revoked = true`) ทันที

### กฎที่ 2 — Snapshot ล็อกทันทีที่เปิดโต๊ะ
- เมื่อ Session เปลี่ยนจาก `draft → active` ระบบต้องล็อก:
  - `adult_guest_count`, `child_guest_count`
  - `adult_price_snapshot`, `child_price_snapshot`
  - `duration_minutes_snapshot`, `started_at`, `expires_at`
- **ห้ามแก้ไขค่าเหล่านี้หลัง `active`** — บังคับด้วย PostgreSQL Trigger `fn_protect_session_snapshot`

### กฎที่ 3 — ตัดสต็อกเมื่อกด "กำลังทำ" เท่านั้น
```
pending → [ครัวกดปุ่ม cooking] → ตัดสต็อกตาม BOM ทันที → cooking
```
- Trigger: `fn_deduct_stock_on_cooking`
- ต้องมี Idempotency: `UNIQUE INDEX unique_order_item_consumption ON stock_movements(order_item_id, ingredient_id) WHERE movement_type = 'actual_consumption'`
- ยกเลิกรายการที่เป็น `cooking` → คืนสต็อกตามสูตร BOM

### กฎที่ 4 — 1 Session มี 1 บิลเดียว
- `bills.session_id` เป็น UNIQUE — ป้องกันบิลซ้ำ
- บิลต้องรอบรมข้อมูลทั้งหมดก่อนออก: ค่าบุฟเฟต์ + เนื้อเหลือ (ถ้ามี) + ส่วนลด + VAT

### กฎที่ 5 — โต๊ะต้องผ่าน "cleaning" เสมอ
- ปิดรอบหรือย้ายโต๊ะ → `status = 'cleaning'` ทันที
- กลับเป็น `available` ได้ต่อเมื่อ Staff กดยืนยันทำความสะอาดเสร็จเท่านั้น

### กฎที่ 6 — ค่าปรับเนื้อเหลือ
```js
penaltyAmount = Math.ceil(weightGrams / 100) * 100  // หน่วย: บาท
```
- ชั่งเฉพาะเนื้อสัตว์ที่กินได้จริง ไม่รวมกระดูก/เปลือก
- บันทึกใน `leftover_records` ก่อนออกบิลเสมอ

### กฎที่ 7 — เมนูหมดแสดงสถานะ "หมด" อัตโนมัติ
- สต็อกหมด → `availability_status = 'out_of_stock'` → หน้าลูกค้าแสดงสถานะ "หมด" กดสั่งไม่ได้
- Kitchen/Manager เปิด Override → `manual_off` → แสดงสถานะ "หมด" เช่นกัน แต่ต้องกดเปิดด้วยมือ

### กฎที่ 8 — ลูกค้าออกบัตรคิวที่เคาน์เตอร์เท่านั้น
- **ไม่มีระบบจองคิวออนไลน์** — ลูกค้าต้องมาที่ร้าน Staff กดออกบัตรคิวให้
- ลูกค้าสแกน QR บนบัตรคิวเพื่อดูสถานะผ่านมือถือ `/queue/[queueId]`

---

## ส่วนที่ 6 — มาตรฐานการเขียนโค้ด

### 6.1 JSDoc Type Hints (บังคับสำหรับ Function และ Server Action)

```js
/**
 * เปิดรอบบริการ Session และล็อก Snapshot
 * @param {string} tableId - UUID ของโต๊ะ
 * @param {{ adult: number, child: number }} guestCount
 * @param {string} packageId - UUID ของแพ็กเกจ
 * @returns {Promise<{ session: object, error: string|null }>}
 */
export async function openSession(tableId, guestCount, packageId) { ... }
```

### 6.2 Server vs Client Pattern

| งานประเภท | วิธี |
|---|---|
| ดึงข้อมูลที่ต้องการ Role Check | Server Component + Server Action + `fn_my_role()` |
| Realtime (สถานะโต๊ะ, ออเดอร์, คิว) | Client Component + `supabase.channel().on(...)` |
| ฟอร์ม Submit ที่ต้องการ Auth | Server Action ที่ตรวจสอบ Session ก่อนเสมอ |

### 6.3 การคำนวณสำคัญ (ใช้ใน `src/lib/utils.js`)

```js
// VAT 7% ถอดใน (Inclusive VAT)
export const calcVAT = (totalAmount) =>
  Math.round((totalAmount * 7 / 107) * 100) / 100

// ค่าปรับเนื้อเหลือ
export const calcLeftoverPenalty = (weightGrams) =>
  weightGrams > 0 ? Math.ceil(weightGrams / 100) * 100 : 0

// ราคาบุฟเฟต์รวม
export const calcBuffetTotal = (session) =>
  session.adult_guest_count * session.adult_price_snapshot +
  session.child_guest_count * session.child_price_snapshot
```

### 6.4 Realtime Channels ที่ต้องใช้

| Channel | ใช้ใน | Event ที่ Subscribe |
|---|---|---|
| `table-status` | ผังโต๊ะ, ลูกค้า | `UPDATE` บน `dining_tables` |
| `order-items:{sessionId}` | หน้าลูกค้า + KDS | `INSERT/UPDATE` บน `order_items` |
| `queue-updates` | หน้าคิวลูกค้า + พนักงาน | `UPDATE` บน `queues` |
| `service-requests` | พนักงาน + ลูกค้า | `INSERT/UPDATE` บน `service_requests` |

---

## ส่วนที่ 7 — ขอบเขตที่ตัดออก (Phase 1 Out of Scope)

> [!CAUTION]
> ห้ามสร้าง Feature เหล่านี้แม้จะมีการขอในระหว่าง Development — ต้องรอ Phase 2

| รายการ | เหตุผล |
|---|---|
| หน้าเลือกแพ็กเกจ | เป็นบุฟเฟต์ราคาเดียว ไม่มีตัวเลือก |
| ระบบโปรโมชั่น/คูปอง | Phase 2 |
| ระบบสมาชิก/สะสมแต้ม | Phase 2 |
| ระบบรีวิว/ให้คะแนน | Phase 2 |
| จองโต๊ะล่วงหน้า | Phase 2 |
| จองคิวออนไลน์ | ต้องมาเคาน์เตอร์เท่านั้น |
| ค่าปรับนั่งเกินเวลา | ไม่มีในเฟสแรก |

---

## ส่วนที่ 8 — Task Breakdown สำหรับ AI Agent

> ใช้ส่วนนี้เมื่อต้องสั่ง AI ทำงานเป็น Module — แต่ละ Task เป็นอิสระต่อกัน

| Task | ชื่องาน | ไฟล์/ส่วนที่เกี่ยวข้อง |
|:---:|---|---|
| **T-01** | Supabase Client Helpers | `src/lib/supabase/client.js`, `server.js`, `admin.js` |
| **T-02** | Staff Auth + RBAC Layouts | `(auth)/login`, Layout ตาม Role, Middleware |
| **T-03** | Queue System | `(pos)/queues`, `queue/[queueId]`, ตาราง `queues` |
| **T-04** | Table Map + Session Lifecycle | `(pos)/tables`, Session CRUD, Snapshot Lock, QR Generation |
| **T-05** | Customer Ordering App | `order/[tableNumber]/*`, Timer, Menu, Cart, Call Staff |
| **T-06** | Kitchen KDS | `(kitchen)/kds`, `stock-override`, Realtime + Stock Deduct |
| **T-07** | Billing + Payment + Invoice | `(pos)/billing/*`, Bill Calc, Split Payment, Tax Invoice |
| **T-08** | Inventory + Stock Count | `(admin)/inventory`, BOM, Stock Movement, Adjust |
| **T-09** | Reports + Audit Log | `(admin)/reports`, `(admin)/audit-logs` |
| **T-10** | Settings + Menu Management | `(admin)/settings`, `(admin)/menu`, `(admin)/packages`, `(admin)/staff` |

### วิธีใช้ Task Breakdown

เมื่อสั่ง AI ให้ระบุ Task เสมอ เช่น:

```
ทำ T-04: Table Map + Session Lifecycle
- อ่าน AGENTS.md ส่วนที่ 2-5 ก่อน
- สร้างหน้า /(pos)/tables ที่แสดงผังโต๊ะ 20 โต๊ะ
- รองรับ Merge/Split ตาม Business Rule กฎที่ 2 และ 5
- ใช้ Supabase Realtime subscribe `table-status`
```

---

## ส่วนที่ 9 — เอกสารอ้างอิง

| เอกสาร | เนื้อหา | ลิงก์ |
|---|---|---|
| **SRS v1.8** | Functional Requirements ครบ 75 ข้อ + Business Rules | [`docs/01-requirements/SRS.md`](docs/01-requirements/SRS.md) |
| **Data Dictionary v1.8** | โครงสร้างตารางทั้ง 28 ตาราง + Field Descriptions | [`docs/02-database/data_dictionary.md`](docs/02-database/data_dictionary.md) |
| **Audit Matrix v1.8** | ประวัติการตัดสินใจสถาปัตยกรรม + UX/UI Alignment | [`docs/03-audit/audit_matrix.md`](docs/03-audit/audit_matrix.md) |
| **Database Schema** | Migration SQL สมบูรณ์ (28 Tables + RLS + Triggers) | [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql) |
| **Constants** | Enum ค่าสถานะทั้งหมดในโค้ด | [`src/lib/constants/index.js`](src/lib/constants/index.js) |

---

## ส่วนที่ 10 — ข้อตัดสินใจเพิ่มเติมตาม PDF UX/UI (12 พฤศจิกายน 2026)

> ตัดสินใจแล้ว แต่ schema/SQL/trigger อาจยังไม่ปรับตาม — ตรวจและเพิ่ม migration ก่อนเขียนโค้ดที่เกี่ยวข้อง

| เรื่อง | ข้อตัดสินใจ | งานที่ตามมา / ข้อสงสัย |
|---|---|---|
| เมนูหมด | หน้าลูกค้าแสดงสถานะ "หมด" กดสั่งไม่ได้ (ไม่ซ่อน) | — |
| ยกเลิกรายการ `cooking` | คืนสต็อกตามสูตร BOM | เพิ่ม movement_type สำหรับการคืน (เสนอชื่อ `cancel_return`) และ logic/trigger คืนสต็อก |
| ส่วนลด | พนักงานคิดเงิน (Cashier/Manager/Admin) กรอกเองได้ ไม่ต้องรออนุมัติ ยังต้องระบุเหตุผลและบันทึก audit | ทบทวนชื่อ action `APPROVE_DISCOUNT` และคอลัมน์ `bills.discount_approved_by` (ตอนนี้ความหมายคือผู้ให้ส่วนลด) |
| กลุ่มลูกค้า | เหลือผู้ใหญ่/เด็ก ตัดกลุ่ม "ฟรี" | migration ลบ `packages.free_price`, `sessions.free_guest_count`, `sessions.free_price_snapshot`, `usage_rates.estimated_grams_per_free`; ยังไม่ได้กำหนดว่าเด็กต่ำกว่า 120 ซม. คิดอย่างไร → ถามก่อน |
| QR token | เพิกถอนตอน `closed` เท่านั้น ช่วง `expired` เปิดหน้าได้แต่สั่งไม่ได้ | `qr_access_tokens.expires_at` ปัจจุบันอ้าง `sessions.expires_at` ต้องกำหนดใหม่ไม่ให้หมดอายุก่อน `closed` |
| ค่าปรับนั่งเกินเวลา | ไม่มีในเฟสแรก | — |
| แจ้งเตือนก่อนหมดเวลา | แจ้งเฉพาะตอนครบเวลา (คงตามเดิม ไม่ทำตาม PDF 1.2) | — |
| สิทธิ์รายหน้าจอ | ต้องกำหนดสิทธิ์เข้าถึงรายหน้าจอได้ (PDF 4.6) นอกเหนือจาก role | ยังไม่กำหนดโครงสร้างตาราง (รายคนหรือรายบทบาท) และ RLS → ถามก่อนทำ |
| ชื่อบทบาทใน PDF | เจ้าของ=`admin`, ผู้จัดการ=`manager`, แคชเชียร์=`cashier`, ครัว=`kitchen`, เสิร์ฟ=`staff` | — |
