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
> ### 🛑 กฎเหล็กสูงสุดสำหรับ AI Agent: ห้ามเดาข้อกำหนดเองเด็ดขาด ("ห้ามเดา") & กฎคุณภาพโค้ด
> 1. **ห้ามคาดเดา คิดเอง หรือทึกทักฟีเจอร์/ขั้นตอนการทำงานขึ้นมาเองเด็ดขาด:** หากพบประเด็นใดที่ไม่ชัดเจน หรือไม่มีระบุไว้ในเอกสารนี้ ให้ **หยุดและถามผู้ใช้ก่อนเสมอ**
> 2. **ต้องรอจนกว่าผู้ใช้จะตัดสินใจและยืนยัน:** ห้ามเริ่มเขียนโค้ดหรือสร้างโครงสร้างนอกเหนือจากที่ผู้ใช้เห็นชอบ
> 3. **ยึดตามข้อกำหนด UX/UI v1.8 เป็นหลัก 100%:** ห้ามแอบใส่ฟีเจอร์ในส่วน Out of Scope หรือกฎระบบเก่ากลับเข้ามา
> 4. **ความหาง่ายของไฟล์ & แบ่งเป็นสัดส่วนเข้าใจง่าย:** แยก UI (`components/`), Logic/Realtime (`hooks/`), Server Actions (`actions.js`) ชัดเจน และใช้ Barrel Export (`index.js`) เพื่อให้เรียกใช้ง่ายจากจุดเดียว
> 5. **คำนึงถึงความเร็วเว็บเป็นหลัก (Web Performance First):** ป้องกัน Re-render ด้วย `React.memo`, รวม Timer ซ้ำซ้อนเป็น Centralized Timer ระดับหน้า, ใส่ Debounce ช่องค้นหา, และใช้ Optimistic UI (ตอบสนองทันที 0ms) พร้อม Realtime Sync
> 6. **โค้ดอ่านง่าย ไม่ใช้ศัพท์ยาก:** ตั้งชื่อตัวแปรและฟังก์ชันตรงไปตรงมา สื่อความหมายชัดเจน และมี Comment ภาษาไทยกำกับจุดสำคัญ
> 7. **ถามก่อนแก้ไขเสมอ:** ก่อนจะลงมือแก้ไขหรือ Refactor โค้ดใดๆ ให้ตรงตามหลักการข้างต้น **ต้องสรุปแนวทางและถามผู้ใช้ก่อนเสมอ**

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
| **Customer** | มือถือ (สแกน QR) | ดูคิว, สั่งอาหารเองผ่าน QR โต๊ะ, ดูสถานะ, เรียกพนักงาน — **ไม่ต้องล็อกอิน** |
| **Cashier** | Tablet / Desktop เคาน์เตอร์ | ออกบัตรคิว, เรียกคิว, เปิดโต๊ะ, ย้าย/รวม/แยกโต๊ะ, คิดเงิน, รับชำระ, พิมพ์ใบเสร็จ/ใบกำกับภาษี, กรอกส่วนลด |
| **Staff** | Tablet / มือถือ | ย้าย/รวม/แยกโต๊ะ, ยืนยันทำความสะอาดโต๊ะเสร็จ, ชั่งเนื้อเหลือ, รับแจ้งเตือนเรียกพนักงาน (**ออกบัตรคิวไม่ได้**) |
| **Kitchen** | จอใหญ่ / Tablet ติดผนัง (KDS) | รับ-เปลี่ยนสถานะออเดอร์ แยกสถานี, Override เมนูหมด |
| **Manager** | Desktop / Tablet | จัดการเมนู, สต็อกวัตถุดิบ, ตรวจนับและอนุมัติปรับยอดสต็อก, ดูรายงานยอดขาย, ช่วยงานหน้าร้านและครัว |
| **Admin** | Desktop | จัดการหลังบ้านทั้งหมด: พนักงานและสิทธิ์, ตั้งราคาบุฟเฟต์/VAT, ตั้งค่าร้านค้า, Audit Log เต็มสิทธิ์ |

---

## ส่วนที่ 2 — Tech Stack และสถาปัตยกรรม

### 2.1 Technology Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router, Server Actions, Route Handlers) |
| **Language** | JavaScript ES2022+ พร้อม JSDoc (ห้ามใช้ TypeScript) |
| **Styling** | Tailwind CSS v4, Lucide React, clsx, tailwind-merge |
| **Database** | Supabase PostgreSQL (30 ตาราง) |
| **Auth** | Supabase Auth — Email/Password และ Staff PIN (bcrypt) สำหรับพนักงานเท่านั้น |
| **Realtime** | Supabase Realtime Channels (Broadcast + Postgres Changes) |
| **QR Code** | qrcode.react สำหรับ QR โต๊ะและบัตรคิว |
| **Security** | bcryptjs สำหรับ Staff PIN hashing |

> [!NOTE]
> ลูกค้า **ไม่มี** Auth และ **ไม่มี PIN** — เข้าสู่หน้าสั่งอาหารด้วย QR Token ของ Session โดยตรง ไม่ต้องกรอก PIN

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
│   │   │   ├── queues/                # 2.1 จัดการคิวและออกบัตรคิว (Cashier, Manager, Admin)
│   │   │   ├── tables/                # 2.2 ผังโต๊ะ (Cashier, Staff, Manager, Admin)
│   │   │   ├── billing/               # 2.3 คิดเงินและชำระเงิน (Cashier, Manager, Admin)
│   │   │   │   └── tax-invoice/       # 2.4 พิมพ์ใบเสร็จ / ใบกำกับภาษีเต็มรูป (Cashier, Manager, Admin)
│   │   │   ├── service-requests/      # 2.5 แจ้งเตือนเรียกพนักงาน Realtime (Staff, Manager, Admin)
│   │   │   └── stock-count/           # 2.6 นับสต็อกเช้า-เย็น, รับของเข้า, ของเสีย (Staff, Manager, Admin)
│   │   │
│   │   ├── (kitchen)/                 # ═══ กลุ่ม: ครัว KDS (จอใหญ่/Tablet) — layout ใช้ StaffShell ═══
│   │   │   ├── kds/                   # 3.1 KDS แยกสถานี (Kitchen, Manager, Admin)
│   │   │   └── stock-override/        # 3.2 Override เปิด/ปิดเมนูด้วยตนเอง (Kitchen, Manager, Admin)
│   │   │
│   │   ├── (admin)/                   # ═══ กลุ่ม: หลังบ้าน (Desktop) ═══
│   │   │   ├── menu/                  # 4.2 จัดการเมนู + สูตรตัดสต็อก BOM (Manager, Admin)
│   │   │   ├── packages/              # 4.3 ตั้งค่าราคาบุฟเฟต์ + VAT (Admin เท่านั้น)
│   │   │   ├── inventory/             # 4.4 สต็อก: แท็บภาพรวมวันนี้ / วัตถุดิบ / สูตร BOM / ประวัติ (Manager; Admin เฉพาะ Emergency)
│   │   │   ├── reports/               # 4.5 รายงานยอดขาย + ส่งออก CSV / พิมพ์ PDF (Manager, Admin)
│   │   │   ├── staff/                 # 4.6 จัดการพนักงานและสิทธิ์ (Admin เท่านั้น)
│   │   │   ├── audit-logs/            # 4.7 ประวัติการทำงาน Audit Log (Admin เต็มสิทธิ์, Manager ตามสิทธิ์)
│   │   │   └── settings/              # 4.8 ตั้งค่าร้านค้า (Admin เท่านั้น)
│   │   │
│   │   ├── queue/[queueId]/           # ═══ กลุ่ม: ลูกค้า (Mobile) ═══
│   │   ├── order/[tableNumber]/        # 1.2 สั่งอาหารเอง + ตัวจับเวลา (Customer ผ่าน QR โต๊ะ)
│   │   │   ├── status/                # 1.3 ติดตามสถานะอาหาร (Customer)
│   │   │   ├── call-staff/            # 1.4 เรียกพนักงาน (Customer)
│   │   │   └── summary/               # 1.5 สรุปรายการที่สั่งในรอบ (Customer)
│   │   │
│   │   ├── api/                       # Route Handlers & Webhooks
│   │   ├── globals.css                # Tailwind CSS v4
│   │   └── layout.js                  # Root Layout
│   │
│   ├── hooks/                         # Custom Hooks: useKitchenRealtime, useAudioAlert, useStockRealtime, useDebounce, useStoredToggle, useRealtimeRefresh
│   │
│   ├── components/
│   │   ├── ui/                        # Reusable UI: Buttons, Modals, Badges, Cards
│   │   ├── customer/                  # Customer: MenuCard, OrderCart, Timer
│   │   ├── pos/                       # POS: TableMap, QueueList, BillingForm
│   │   ├── kitchen/                   # Kitchen: KdsScreen, StockOverrideScreen, OrderTicketCard, ConsolidatedPrepList, StationFilter, KitchenGuideModal, index.js
│   │   ├── reports/                   # Reports: ReportsScreen, SalesBarChart, AuditLogScreen, index.js
│   │   └── stock/                     # Stock: InventoryWorkspace, IngredientManager, BomEditor, MovementHistory, StockCountScreen, StockCountSheet, StockMovementForm, InventoryScreen, PendingCountList, StockSummaryTable, StockLineChart, index.js
│   │
│   └── lib/
│       ├── supabase/                  # client.js, server.js, admin.js
│       ├── utils.js                   # cn(), formatCurrency(), calcVAT(), calcPenalty()
│       ├── auth/                      # requireRole() (หน้า), checkActionRole() (Server Action), getCurrentStaff()
│       ├── stock.js                   # คำนวณสรุปสต็อกรายวัน/จุดกราฟ (ใช้ร่วม Server/Client)
│       └── constants/                 # index.js — Enums, State Values & Route Permissions
│
└── supabase/
    └── migrations/
        ├── 001_initial_schema.sql     # Migration สมบูรณ์ (30 ตาราง + RLS + Triggers)
        ├── 002–008_*.sql              # แก้ schema v1.8, คิว, โต๊ะ, บิล, ตั้งค่า (ดูรายละเอียดใน docs/SEED.md)
        ├── 020_kitchen_cancel_return_and_audit.sql  # คืนสต็อกตอนยกเลิกรายการ cooking (ตามยอดที่ตัดจริง)
        ├── 021_fix_cancel_return_actor.sql          # แก้ผู้ทำรายการของ 020 + SET search_path
        ├── 022_staff_stock_counting.sql             # นับสต็อกเช้า-เย็นโดย staff + รับของเข้า/ของเสีย + อนุมัติ
        ├── 023_kitchen_read_sessions.sql            # ให้ kitchen อ่าน sessions/session_tables (จอครัวหาเลขโต๊ะ)
        └── 024_inventory_reports_audit.sql          # FR-024 ปิด/เปิดเมนูอัตโนมัติ, Manager แก้ BOM, Admin ปรับยอดฉุกเฉิน, สิทธิ์อ่าน Audit Log
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

| Route | หน้าจอ | บทบาทที่เข้าถึงได้ | สิ่งที่ต้องมี |
|---|---|---|---|
| `/(pos)/queues` | **2.1 จัดการคิว** | `cashier`, `manager`, `admin` *(staff ทำไม่ได้)* | ออกบัตรคิว (จำนวนคน → ขนาดโต๊ะอัตโนมัติ → พิมพ์ QR), รายการคิว, ปุ่มเรียก/ข้าม/ยกเลิก/พิมพ์ซ้ำ |
| `/(pos)/tables` | **2.2 ผังโต๊ะ** | `cashier`, `staff`, `manager`, `admin` | ผัง 30 โต๊ะ + สี + Timer, ฟังก์ชัน: เปิดโต๊ะ (Cashier), ย้าย/รวม/แยกโต๊ะ (Cashier/Staff), ยืนยันทำความสะอาดเสร็จ (Staff) |
| `/(pos)/billing` | **2.3 ชำระเงิน** | `cashier`, `manager`, `admin` *(staff ทำไม่ได้)* | สรุปยอด, เพิ่มรายการพิเศษ/ค่าปรับเนื้อเหลือ, กรอกส่วนลด (ระบุเหตุผล), เงินสด/PromptPay/บัตร/Split Payment |
| `/(pos)/billing/tax-invoice` | **2.4 ใบกำกับภาษี** | `cashier`, `manager`, `admin` | พรีวิวใบเสร็จ, ฟอร์มข้อมูลนิติบุคคล/บุคคล, เลขผู้เสียภาษี 13 หลัก, พิมพ์/อีเมล |
| `/(pos)/service-requests` | **2.5 แจ้งเตือน** | `staff`, `manager`, `admin` | รายการ Realtime (โต๊ะ+ประเภท+เวลารอ), เสียง/สี, ปุ่มรับเรื่อง/เสร็จ |
| `/(pos)/stock-count` | **2.6 นับสต็อกเช้า-เย็น** | `staff`, `manager`, `admin` | เลือกรอบ (เปิดร้าน/ปิดร้าน), ใบนับทุกวัตถุดิบ **ไม่แสดงยอดในระบบ**, เตือนนับซ้ำรายการที่ต่างเกิน 10%, ส่งรอ Manager อนุมัติที่ `/inventory`, แท็บรับของเข้า / ของเสีย (ระบุเหตุผล) |

### 4.3 ฝั่งครัว — KDS (ต้อง Auth: kitchen)

| Route | หน้าจอ | บทบาทที่เข้าถึงได้ | สิ่งที่ต้องมี |
|---|---|---|---|
| `/(kitchen)/kds` | **3.1 KDS แยกสถานี + To-Do List เตรียมอาหาร** | `kitchen`, `manager`, `admin` | • เลือกสถานี (ของสด/เครื่องดื่ม/ปิ้งย่าง/ครัวร้อน)<br>• **2 โหมดมุมมอง:**<br>&nbsp;&nbsp;1. **Ticket View (การ์ดตามโต๊ะ):** รายการอาหารแต่ละรายการมี Checklist ติ๊กถูกรายเมนู (`pending` → `cooking` → `served`), ปุ่ม "ทำเสร็จทั้งหมดในบิลนี้", ตัวจับเวลารายบิล + สีเตือนรอนาน<br>&nbsp;&nbsp;2. **Consolidated Prep To-Do View (รายการเตรียมรวม):** รวมจำนวนเมนูที่ต้องเตรียมข้ามทุกโต๊ะ (เช่น หมูสไลซ์ รวม 8 ถาด) ให้ครัวหยิบเตรียมและติ๊กทำเสร็จทีละรายการได้สะดวกรวดเร็ว<br>• เสียงแจ้งเตือน Realtime เมื่อมีออเดอร์ใหม่เข้า (ปุ่มเปิด/ปิดเสียง)<br>• ปุ่มยกเลิกรายการอาหาร (พร้อมระบุเหตุผล)<br>• **แตะ 2 ครั้ง:** แตะแรก = เริ่มทำ (ตัดสต็อก) · แตะสอง = เสิร์ฟแล้ว (ย้อนกลับไม่ได้ — ไม่มี Recall)<br>• หน้าต่าง **"วิธีใช้จอครัว"** เปิดเองครั้งแรกของแต่ละเครื่อง (จำใน localStorage `kuro.kdsGuideSeen`) และเปิดซ้ำได้จากปุ่ม "วิธีใช้" |
| `/(kitchen)/stock-override` | **3.2 Override เมนูหมด** | `kitchen`, `manager`, `admin` | รายการเมนูพร้อมสวิตช์ `manual_off` / `available` แยกตามหมวดหมู่/สถานี · **ปิดเมนูต้องกรอกเหตุผล** (Audit `MANUAL_OFF_MENU`) · เปิดกลับไม่ต้องใส่เหตุผล · เมนู `out_of_stock` กดสวิตช์ไม่ได้ |

### 4.4 ฝั่งหลังบ้าน — Desktop (ต้อง Auth: admin, manager)

| Route | หน้าจอ | บทบาทที่เข้าถึงได้ | สิ่งที่ต้องมี |
|---|---|---|---|
| `/(auth)/login` | **4.1 Login** | ทุก Role | Email/Password หรือ Staff PIN (bcrypt), Redirect ตาม Role |
| `/(admin)/menu` | **4.2 จัดการเมนู** | `manager`, `admin` | ชื่อ, รูป, หมวดหมู่, `kitchen_station`, สูตร BOM, เปิด/ปิดขาย, จำกัดจำนวนสั่งต่อรอบ |
| `/(admin)/packages` | **4.3 ราคา/แพ็กเกจ** | `admin` เท่านั้น | ราคาผู้ใหญ่/เด็ก (ต่ำกว่า 120 ซม.), duration, VAT % (ไม่มี Service Charge) |
| `/(admin)/inventory` | **4.4 สต็อก** | `manager` (Admin เฉพาะ Emergency) | ของคงเหลือ, Reorder point, รับเข้า, ของเสีย, **อนุมัติ/ปฏิเสธผลนับเช้า-เย็นของ staff** (ปรับยอดตามผลต่าง), **ตารางสรุปสต็อกวันนี้ + กราฟเส้นคลื่นเรียลไทม์** (เลือกวัตถุดิบที่หมด/ต้องซื้อให้อัตโนมัติ, สัญลักษณ์รับเข้า/ของเสีย/ปรับยอด) |
| `/(admin)/reports` | **4.5 รายงาน** | `manager`, `admin` | ยอดขายวัน/เดือน, เมนูขายดี, จำนวนลูกค้า, Export Excel/PDF |
| `/(admin)/staff` | **4.6 พนักงาน** | `admin` เท่านั้น | เพิ่ม/แก้ไข/ปิดใช้งาน, กำหนด Role (Staff PIN bcrypt) |
| `/(admin)/audit-logs` | **4.7 Audit** | `admin` (เต็มสิทธิ์), `manager` (ตามสิทธิ์) | ค้นหา/กรองประวัติ (ใคร ทำอะไร เมื่อไหร่ เหตุผล) |
| `/(admin)/settings` | **4.8 ตั้งค่า** | `admin` เท่านั้น | ข้อมูลร้าน, ผังโต๊ะ (30 โต๊ะ), เครื่องพิมพ์, รูปแบบใบเสร็จ |

---

## ส่วนที่ 5 — กฎเหล็กทางธุรกิจ (ต้องบังคับใช้ในโค้ด)

> [!IMPORTANT]
> กฎเหล่านี้ต้องถูก enforce ในระดับ Database (Trigger/RLS) และ Application Logic พร้อมกัน

### กฎที่ 0 — ห้าม AI คาดเดาเด็ดขาด & กฎคุณภาพการเขียนโค้ด
- ❌ **ห้ามคาดเดาความต้องการเอง:** หากเจอจุดที่สงสัย กำกวม หรือไม่มีในเอกสาร **ต้องหยุดถามผู้ใช้เสมอ**
- ❌ **ห้ามตัดสินใจแทนผู้ใช้:** ห้ามคิดฟีเจอร์เพิ่ม ห้ามเปลี่ยนโฟลว์การทำงานเอง จนกว่าผู้ใช้จะตัดสินใจและยืนยัน
- ❓ **ถามก่อนแก้ไขเสมอ (Ask Before Editing):** หากพบจุดที่ต้องปรับปรุงสถาปัตยกรรมหรือโค้ด ให้สรุปแนวทางและ **ถามผู้ใช้เพื่อขอยืนยันก่อนลงมือแก้ไขทุกครั้ง**
- 📁 **ความหาง่ายของไฟล์ & การแบ่งสัดส่วน (Modularity):**
  - แยก UI Component (`src/components/`), Business Logic / Server Actions (`actions.js`), และ State / Realtime (`src/hooks/`) ชัดเจน
  - สร้างไฟล์ Barrel Export (`index.js`) รวม Component ในแต่ละโฟลเดอร์เสมอ เพื่อให้ Import เรียกใช้งานสั้นและหาง่าย
- ⚡ **คำนึงถึงความเร็วเว็บเป็นหลัก (Web Performance First):**
  - ใส่ `React.memo` ให้ Component ที่แสดงผลจำนวนมาก ป้องกัน Unnecessary Re-renders
  - รวม Timer/Loop ซ้ำซ้อนให้เป็น **Centralized Timer** ระดับบน เพื่อประหยัด CPU ของแท็บเล็ตและอุปกรณ์หน้าร้าน
  - ใช้ **Debounce** (150-200ms) สำหรับช่อง Input ค้นหา เพื่อไม่ให้คำนวณซ้ำซ้อนขณะพิมพ์
  - ใช้ **Optimistic UI (0ms response)** ควบคู่กับ Supabase Realtime Sync เพื่อให้ปุ่มกดตอบสนองทันทีโดยไม่ต้องรอโหลด
- 📖 **โค้ดอ่านง่าย ไม่ใช้ศัพท์ยาก (Readable & Plain Code):**
  - ตั้งชื่อตัวแปร ฟังก์ชัน และ Props อย่างตรงไปตรงมา สื่อความหมายชัดเจน ไม่ใช้ตัวย่อหรือศัพท์เทคนิคที่เข้าใจยาก
  - มี Comment ภาษาไทยอธิบายจุดสำคัญในโค้ดเสมอ
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
| `kitchen-all-stations` / `kitchen-station-{station}` | จอครัว, หน้าเปิด/ปิดเมนู | `*` บน `order_items`, `UPDATE` บน `menu_items` |
| `stock-updates` | หน้าสต็อก `/inventory` (Manager/Admin) | `INSERT` บน `stock_movements`, `*` บน `stock_counts` (รวมสัญญาณที่มาติดกันเป็นโหลดครั้งเดียว 800ms) |

---

## ส่วนที่ 7 — ขอบเขตที่ตัดออก (Phase 1 Out of Scope)

> [!CAUTION]
> ห้ามสร้าง Feature เหล่านี้แม้จะมีการขอในระหว่าง Development — ต้องรอ Phase 2

| รายการ | เหตุผล |
|---|---|
| การรับออเดอร์แทนลูกค้า (`staff_assist`) | ลูกค้าสั่งเองผ่าน QR โต๊ะ 100% — การสั่งแทนย้ายไป Phase 2 |
| หน้าเลือกแพ็กเกจ | เป็นบุฟเฟต์ราคาเดียว ไม่มีตัวเลือก |
| ค่าบริการ (Service Charge) | ตัดออกจากระบบถาวร (ไม่มี Service Charge) |
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
| **T-06** | Kitchen KDS + Prep To-Do List | `(kitchen)/kds`, `stock-override`, Realtime + Stock Deduct, Checklist รายจาน และ Consolidated Prep To-Do List |
| **T-07** | Billing + Payment + Invoice | `(pos)/billing/*`, Bill Calc, Split Payment, Tax Invoice |
| **T-08** | Inventory + Stock Count | `(admin)/inventory`, BOM, Stock Movement, Adjust |
| **T-09** | Reports + Audit Log | `(admin)/reports`, `(admin)/audit-logs` |
| **T-10** | Settings + Menu Management | `(admin)/settings`, `(admin)/menu`, `(admin)/packages`, `(admin)/staff` |

### วิธีใช้ Task Breakdown

เมื่อสั่ง AI ให้ระบุ Task เสมอ เช่น:

```
ทำ T-04: Table Map + Session Lifecycle
- อ่าน AGENTS.md ส่วนที่ 2-5 ก่อน
- สร้างหน้า /(pos)/tables ที่แสดงผังโต๊ะ 30 โต๊ะ
- รองรับ Merge/Split ตาม Business Rule กฎที่ 2 และ 5
- ใช้ Supabase Realtime subscribe `table-status`
```

---

## ส่วนที่ 9 — เอกสารอ้างอิง

| เอกสาร | เนื้อหา | ลิงก์ |
|---|---|---|
| **SRS v1.8** | Functional Requirements รวม 57 ข้อ (FR-001 ถึง FR-075 โดยมี 18 ข้อข้าม) + Business Rules | [`docs/01-requirements/SRS.md`](docs/01-requirements/SRS.md) |
| **Data Dictionary v1.8** | โครงสร้างตารางทั้ง 30 ตาราง + Field Descriptions | [`docs/02-database/data_dictionary.md`](docs/02-database/data_dictionary.md) |
| **Audit Matrix v1.8** | ประวัติการตัดสินใจสถาปัตยกรรม + RLS Matrix ฉบับปรับปรุงใหม่ | [`docs/03-audit/audit_matrix.md`](docs/03-audit/audit_matrix.md) |
| **Database Schema** | Migration SQL สมบูรณ์ (30 Tables + RLS + Triggers) | [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql) |
| **Constants** | Enum ค่าสถานะทั้งหมดในโค้ด | [`src/lib/constants/index.js`](src/lib/constants/index.js) |

---

## ส่วนที่ 10 — ข้อตัดสินใจทางสถาปัตยกรรม (อัปเดต 25 พฤศจิกายน 2026)

> ยึดตามข้อสรุปการทบทวนเอกสารและมติระบบ v1.8 (Single Source of Truth)

| เรื่อง | ข้อตัดสินใจที่ยืนยันแล้ว | รายละเอียดทางเทคนิค / การบังคับใช้ |
|---|---|---|
| **โต๊ะในร้าน** | 30 โต๊ะ (รองรับ ย้าย / รวม Merge / แยก Split) | รองรับ `session_tables` แบบ 1 session มีได้หลายโต๊ะเมื่อทำการรวมโต๊ะ (Merge) |
| **เกณฑ์ราคาเด็ก** | ส่วนสูงต่ำกว่า 120 ซม. | คิดราคาเด็กตาม `packages.child_price` (ตัดกลุ่ม "ฟรี" ออกจากระบบ) |
| **สิทธิ์ตามบทบาท (Role-based)** | กำหนดสิทธิ์ตาม Role โดยตรง ไม่ต้องมีตาราง per-screen granular | `admin`, `manager`, `cashier`, `kitchen`, `staff` อิงตาม RLS Matrix ฉบับใหม่ |
| **ออกบัตรคิว / เปิดโต๊ะ / คิดเงิน** | หน้าที่ของ `cashier`, `manager`, `admin` | `staff` ทำหน้าที่บริการ: ย้าย/รวม/แยกโต๊ะ, ทำความสะอาด, ชั่งเนื้อเหลือ, รับแจ้งเตือน |
| **การรับออเดอร์แทนลูกค้า** | ย้ายไป Phase 2 (Out of Scope) | Phase 1 ลูกค้าสั่งอาหารผ่าน Mobile Web สแกน QR โต๊ะ 100% |
| **ค่าบริการ (Service Charge)** | ตัดออกจากระบบถาวร (ไม่มี Service Charge) | ใน `packages`, `bills`, UI ไม่มีฟิลด์ Service Charge |
| **เมนูหมด** | หน้าลูกค้าแสดงสถานะ "หมด" กดสั่งไม่ได้ (ไม่ซ่อนการ์ด) | `availability_status` = `'out_of_stock'` หรือ `'manual_off'` |
| **ยกเลิกรายการ `cooking`** | คืนสต็อกตามสูตร BOM | ใช้ `movement_type = 'cancel_return'` ในตาราง `stock_movements` |
| **การให้ส่วนลด** | `cashier`, `manager`, `admin` กรอกได้เอง | ต้องระบุเหตุผลและบันทึกลงใน Audit Log เสมอ |
| **อายุ QR Token** | เพิกถอนตอน Session สถานะ `closed` เท่านั้น | `is_revoked = true` โดย Trigger เมื่อ Session ปิดรอบ ช่วง `expired` ยังดูสถานะและสรุปรายการได้ |
| **Split Payment** | บันทึกแยกรายการชำระเงินหลายรูปแบบได้ | ตาราง `payments` ปลด UNIQUE บน `bill_id` เพื่อรองรับหลายแถวต่อ 1 บิล และตรวจ `SUM(amount) = bills.total_amount` |
| **นับสต็อกเช้า-เย็น** (25 พ.ย. 2026) | `staff` เป็นผู้นับ วันละ 2 รอบ (`opening` / `closing`) แบบไม่เห็นยอดในระบบ + รับของเข้า / ของเสีย — Manager อนุมัติ (FR-064) | ทำผ่านฟังก์ชัน SECURITY DEFINER ใน migration 022 (staff ไม่ได้สิทธิ์อ่านตารางสต็อกตรง) · `system_stock` บันทึกโดยฐานข้อมูลตอนส่ง · ตอนอนุมัติปรับยอดตามผลต่าง ไม่ตั้งยอดเท่ากับที่นับ |
| **จอครัว: แตะเลื่อนสถานะ** (25 พ.ย. 2026) | แตะ 2 ครั้ง `pending → cooking → served` · `served` เป็นสถานะสุดท้าย ไม่มีปุ่ม Recall/ย้อนกลับ (FR-049) | Server Action ตรวจลำดับสถานะ + อัปเดตแบบมีเงื่อนไขสถานะเดิม (กันกดพร้อมกันหลายจอ) · การติ๊กใน "รวมรายการเตรียม" เป็นตัวช่วยจำเท่านั้น ไม่เปลี่ยนสถานะจริง |
| **คืนสต็อกเมื่อยกเลิก `cooking`** (25 พ.ย. 2026) | คืนตาม "ยอดที่ถูกตัดจริง" ใน `stock_movements` (ไม่คำนวณจากสูตร BOM ปัจจุบัน) | Trigger `fn_return_stock_on_cancel` (migration 020 + 021, SECURITY DEFINER) — ครัวไม่ต้องมีสิทธิ์แก้ตารางสต็อก |
| **ปิดเมนูด้วยมือ** (25 พ.ย. 2026) | ต้องกรอกเหตุผลทุกครั้ง · เปิดกลับไม่ต้อง · เมนู `out_of_stock` เปิด/ปิดด้วยมือไม่ได้ | ตรวจทั้งหน้าจอและ Server Action · Audit `MANUAL_OFF_MENU` เก็บเหตุผล, ชื่อเมนู, สถานะก่อน/หลัง |
| **สิทธิ์อ่านของครัว** (25 พ.ย. 2026) | `kitchen` อ่าน `sessions` / `session_tables` ได้ (อ่านอย่างเดียว) | migration 023 — จอครัวต้องใช้หาเลขโต๊ะ (เดิม RLS ไม่ให้ จอครัวว่างเมื่อล็อกอินเป็น kitchen) |
| **หน้าครัวใช้โครงหน้าเดียวกับพนักงาน** (25 พ.ย. 2026) | `(kitchen)/layout.js` ใช้ `StaffShell` · ทุกหน้าเรียก `requireRole()` · ทุก Server Action เรียก `checkActionRole()` | ใช้สี/ปุ่ม/หน้าต่างกลาง (`primary`, `Button`, `Modal`, `AlertMessage`) ห้ามใส่สีแบบ hex ตรงๆ |
| **กราฟสต็อกวันนี้** (25 พ.ย. 2026) | เส้นคลื่น (Monotone Cubic — ไม่พุ่งเกินค่าจริง) + พื้นไล่สี · 1 กราฟ 1 วัตถุดิบ · แกน Y เริ่มที่ 0 · เฉพาะ Manager/Admin | วาดด้วย SVG ไม่ใช้ไลบรารีกราฟ · เริ่มจากยอดนับเปิดร้านที่อนุมัติแล้ว ถ้ายังไม่มีใช้ยอดระบบตอน 00:00 · ไม่มีระบบพยากรณ์/แนะนำจำนวนสั่งซื้อ |
| **ปิด/เปิดเมนูอัตโนมัติ (FR-024)** (25 พ.ย. 2026) | วัตถุดิบตัวใดในสูตรเหลือ "ไม่พอทำ 1 จาน" → `out_of_stock` · เติมของครบ → `available` เอง · ไม่แตะ `manual_off` | Trigger บน `ingredients.current_stock` และ `menu_ingredients` (migration 024) |
| **สูตร BOM อยู่ที่หน้าสต็อก** (25 พ.ย. 2026) | แก้สูตรตัดสต็อกที่ `/inventory` แท็บ "สูตรตัดสต็อก (BOM)" (Manager, Admin) | หน้า `/menu` (T-10) ไม่ต้องทำ BOM ซ้ำ ให้ลิงก์มาที่นี่ |
| **ยอดคงเหลือแก้ตรงไม่ได้** (25 พ.ย. 2026) | หน้าวัตถุดิบแก้ได้แค่ชื่อ/หน่วย/จุดสั่งซื้อ · ยอดเปลี่ยนผ่านรับเข้า/ของเสีย/อนุมัติผลนับ/Admin ปรับฉุกเฉินเท่านั้น | ทุกการเปลี่ยนยอดมีแถวใน `stock_movements` · ปรับฉุกเฉินใช้ `fn_emergency_adjust_stock` + Audit `EMERGENCY_OVERRIDE` |
| **รายงานยอดขาย** (25 พ.ย. 2026) | นับเฉพาะบิล `paid` ตามเวลาชำระ (เวลาไทย) · ช่วงเกิน 62 วันรวมเป็นรายเดือน · เมนูขายดีนับจานที่ไม่ถูกยกเลิก | Export = CSV (มี BOM เปิดด้วย Excel ได้) + พิมพ์/บันทึก PDF ผ่าน `PrintPortal` ไม่ลง package เพิ่ม |
| **สิทธิ์ดู Audit Log** (25 พ.ย. 2026) | Admin เห็นทั้งหมด · Manager เห็นทั้งหมดยกเว้นรายการที่ Admin เป็นผู้ทำ | บังคับใน RLS (`fn_is_admin_profile`, migration 024) |
