[README](../../README.md) • [SRS v1.8](../01-requirements/SRS.md) • [Data Dictionary](data_dictionary.md) • [Audit Matrix](../03-audit/audit_matrix.md) • [Agent Blueprint](../../AGENTS.md)

---

# KURO POS — Data Dictionary
> **พจนานุกรมข้อมูลฐานข้อมูล Supabase PostgreSQL (28 ตาราง)**  
> **โมเดลธุรกิจ:** ร้านบุฟเฟต์ชาบู (สุกี้ตี๋น้อย Model) | **Version:** 1.8

---

> หมายเหตุ: ตารางที่ระบุ `PK: id (UUID DEFAULT gen_random_uuid())` มีฟิลด์ `id` UUID NOT NULL default `gen_random_uuid()` เป็น Primary Key (ตัดแถวซ้ำออก)

## สารบัญโครงสร้างตาราง (7 หมวดหมู่)
1. [หมวดที่ 1: ผู้ใช้และความปลอดภัย (Identity & Access)](#1-หมวดผู้ใช้และความปลอดภัย) — `profiles`, `audit_logs`, `app_settings`
2. [หมวดที่ 2: โต๊ะและรอบบริการ (Tables & Sessions)](#2-หมวดโต๊ะและรอบบริการ) — `dining_tables`, `packages`, `sessions`, `session_tables`, `qr_access_tokens`, `qr_pin_attempts`
3. [หมวดที่ 3: เมนูและสูตรตัดสต็อก (Menu & BOM)](#3-หมวดเมนูและสูตรตัดสต็อก) — `categories`, `menu_items`, `package_menu_items`, `menu_item_options`, `menu_ingredients`
4. [หมวดที่ 4: การสั่งอาหารและครัว (Ordering & Kitchen)](#4-หมวดการสั่งอาหารและครัว) — `orders`, `order_items`, `order_item_options`
5. [หมวดที่ 5: บิล ชำระเงิน ค่าปรับ และภาษี (Billing & Tax)](#5-หมวดบิล-ชำระเงิน-ค่าปรับ-และภาษี) — `bills`, `bill_items`, `payments`, `payment_attempts`, `leftover_records`, `tax_invoices`
6. [หมวดที่ 6: สต็อกและการวิเคราะห์ (Inventory & Analysis)](#6-หมวดสต็อกและการวิเคราะห์) — `ingredients`, `stock_movements`, `stock_counts`, `stock_count_items`, `usage_rates`, `head_usage_estimates`
7. [หมวดที่ 7: คิวและคำขอเรียกพนักงาน (Queue & Requests)](#7-หมวดคิวและคำขอเรียกพนักงาน) — `queues`, `service_requests`

---

## 1. หมวดผู้ใช้และความปลอดภัย

### 1.1 `profiles` (ข้อมูลพนักงาน เชื่อมกับ `auth.users`)
* **PK:** `id` (UUID references `auth.users.id` ON DELETE CASCADE)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `id` | UUID | NO | - | รหัสผู้ใช้ตรงกับ Supabase Auth ID |
| `full_name` | VARCHAR(100) | NO | - | ชื่อ-นามสกุลพนักงาน |
| `role` | VARCHAR(20) | NO | - | บทบาท: `admin`, `manager`, `staff`, `kitchen`, `cashier` |
| `is_active` | BOOLEAN | NO | `true` | สถานะเปิด/ปิดการใช้งานบัญชี |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่สร้าง |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่แก้ไขล่าสุด |

### 1.2 `audit_logs` (ประวัติการตรวจสอบย้อนหลัง)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `actor_id` | UUID | YES | - | FK $\rightarrow$ `profiles.id` (ผู้กระทำ; NULL กรณีระบบ) |
| `action` | VARCHAR(100) | NO | - | กิจกรรม: `EMERGENCY_OVERRIDE`, `APPROVE_DISCOUNT`, `CANCEL_ORDER`, etc. |
| `target_entity` | VARCHAR(50) | NO | - | ชื่อตารางเป้าหมาย เช่น `orders`, `bills`, `stock_counts` |
| `target_id` | VARCHAR(100) | YES | - | รหัสแถวที่ได้รับผลกระทบ |
| `payload_before` | JSONB | YES | - | ข้อมูลก่อนเปลี่ยนแปลง |
| `payload_after` | JSONB | YES | - | ข้อมูลหลังเปลี่ยนแปลง |
| `reason` | TEXT | YES | - | เหตุผลประกอบ (บังคับมีเมื่อ Override/ส่วนลด/ยกเลิก) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่เกิดกิจกรรม |

### 1.3 `app_settings` (ตั้งค่าระบบส่วนกลาง)
* **PK:** `key` (VARCHAR(50))

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `key` | VARCHAR(50) | NO | - | รหัสตั้งค่า เช่น `buffet_price_adult`, `penalty_rate_per_100g` |
| `value` | TEXT | NO | - | ค่าของการตั้งค่า |
| `description` | TEXT | YES | - | คำอธิบาย |
| `updated_by` | UUID | YES | - | FK $\rightarrow$ `profiles.id` (Admin ผู้แก้ไข) |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่แก้ไข |

---

## 2. หมวดโต๊ะและรอบบริการ

### 2.1 `dining_tables` (ข้อมูลโต๊ะอาหาร 20 โต๊ะ)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `table_number` | VARCHAR(10) | NO | - | หมายเลขโต๊ะ เช่น `T01` ถึง `T20` (UNIQUE) |
| `capacity` | INT | NO | 4 | จำนวนที่นั่ง (CHECK `capacity > 0`) |
| `status` | VARCHAR(20) | NO | `'available'` | สถานะ: `available`, `occupied`, `cleaning`, `disabled` |
| `qr_code_url` | TEXT | NO | - | URL สั่งอาหารประจำโต๊ะ |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่สร้าง |

### 2.2 `packages` (แพ็กเกจบุฟเฟต์)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `name` | VARCHAR(100) | NO | - | ชื่อแพ็กเกจ เช่น "Standard Shabu Buffet" |
| `adult_price` | NUMERIC(10,2) | NO | - | ราคาผู้ใหญ่ (รวม VAT 7% แล้ว) |
| `child_price` | NUMERIC(10,2) | NO | - | ราคาเด็ก (120-139 ซม.) |
| `duration_minutes` | INT | NO | 90 | ระยะเวลาบุฟเฟต์ (นาที) |
| `is_active` | BOOLEAN | NO | `true` | เปิด/ปิดการใช้งาน |

### 2.3 `sessions` (รอบการใช้บริการและ Snapshot)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)
* **Trigger:** `fn_protect_session_snapshot` ล็อก Snapshot ทันทีเมื่อ `status = 'active'`

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `package_id` | UUID | NO | - | FK $\rightarrow$ `packages.id` |
| `status` | VARCHAR(20) | NO | `'draft'` | สถานะ: `draft`, `active`, `expired`, `closing`, `billed`, `closed` |
| `adult_guest_count` | INT | NO | 0 | Snapshot จำนวนผู้ใหญ่ (CHECK `>= 0`) |
| `child_guest_count` | INT | NO | 0 | Snapshot จำนวนเด็ก (CHECK `>= 0`) |
| `adult_price_snapshot`| NUMERIC(10,2)| NO| 0.00 | Snapshot ราคาผู้ใหญ่ ณ เวลาเปิด Session |
| `child_price_snapshot`| NUMERIC(10,2)| NO| 0.00 | Snapshot ราคาเด็ก ณ เวลาเปิด Session |
| `duration_minutes_snapshot`| INT | NO | 90 | Snapshot ระยะเวลา (นาที) |
| `guest_count_locked_at`| TIMESTAMPTZ| YES | - | เวลาล็อก Snapshot จำนวนลูกค้า |
| `package_price_locked_at`| TIMESTAMPTZ| YES| - | เวลาล็อก Snapshot ราคาแพ็กเกจ |
| `started_at` | TIMESTAMPTZ | YES | - | เวลาเริ่มเปิดบริการจริงและเริ่มนับเวลาถอยหลัง |
| `expires_at` | TIMESTAMPTZ | YES | - | เวลาหมดรอบคำนวณจาก `started_at + duration` |
| `closed_at` | TIMESTAMPTZ | YES | - | เวลาปิดรอบหลังชำระเงิน |
| `created_by` | UUID | NO | - | FK $\rightarrow$ `profiles.id` (Staff ผู้เปิดรอบ) |

### 2.4 `session_tables` (การผูกโต๊ะและประวัติย้าย/รวม/แยกโต๊ะ)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)
* **Partial Unique Indexes:** 1 โต๊ะมี active session ได้ $\le$ 1, 1 session มี active table ได้ $\le$ 1

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `session_id` | UUID | NO | - | FK $\rightarrow$ `sessions.id` ON DELETE CASCADE |
| `table_id` | UUID | NO | - | FK $\rightarrow$ `dining_tables.id` |
| `is_active` | BOOLEAN | NO | `true` | โต๊ะที่กำลังใช้งานอยู่ปัจจุบันของ Session |
| `assigned_at` | TIMESTAMPTZ | NO | `now()` | เวลาเริ่มผูกโต๊ะนี้ |
| `released_at` | TIMESTAMPTZ | YES | - | เวลาปล่อยโต๊ะ (ย้ายออกหรือปิดรอบ) |
| `transferred_by` | UUID | YES | - | FK $\rightarrow$ `profiles.id` (Staff ผู้ทำรายการย้าย) |

### 2.5 `qr_access_tokens` (Token ตรวจสอบสิทธิ์สั่งอาหารของลูกค้า)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `session_id` | UUID | NO | - | FK $\rightarrow$ `sessions.id` ON DELETE CASCADE |
| `token_hash` | VARCHAR(255) | NO | - | Hash Token (UNIQUE) ไม่ต้องใช้ PIN |
| `is_revoked` | BOOLEAN | NO | `false` | เพิกถอนทันทีเมื่อปิด Session (`closed`) |
| `expires_at` | TIMESTAMPTZ | NO | - | เวลาหมดอายุ อ้างอิง `sessions.expires_at` |

### 2.6 `qr_pin_attempts` (ประวัติการเข้าถึง Audit Trail)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `session_id` | UUID | NO | - | FK $\rightarrow$ `sessions.id` ON DELETE CASCADE |
| `is_successful` | BOOLEAN | NO | - | ผลการตรวจสอบ |
| `client_ip` | VARCHAR(50) | YES | - | IP Address ลูกค้า |
| `user_agent` | TEXT | YES | - | Browser Client |
| `attempted_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่เรียกเข้าถึง |

---

## 3. หมวดเมนูและสูตรตัดสต็อก

### 3.1 `categories` (หมวดหมู่อาหาร)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `name` | VARCHAR(100) | NO | - | ชื่อหมวด เช่น "เนื้อสัตว์", "ผัก", "เครื่องดื่ม" |
| `display_order` | INT | NO | 0 | ลำดับการแสดงผลบนหน้าจอ |
| `is_active` | BOOLEAN | NO | `true` | เปิด/ปิดการแสดงผล |

### 3.2 `menu_items` (รายการอาหาร)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `category_id` | UUID | NO | - | FK $\rightarrow$ `categories.id` |
| `name` | VARCHAR(150) | NO | - | ชื่อเมนูอาหาร |
| `image_url` | TEXT | YES | - | รูปภาพอาหาร |
| `extra_price` | NUMERIC(10,2) | NO | 0.00 | ราคาคิดเงินเพิ่มสำหรับเมนูนอกบุฟเฟต์ |
| `kitchen_station` | VARCHAR(30) | NO | `'hot_kitchen'` | สถานี KDS: `fresh`, `beverage`, `grill`, `hot_kitchen` |
| `availability_status`| VARCHAR(20)| NO | `'available'` | สถานะ: `available`, `out_of_stock`, `manual_off` |
| `disabled_reason` | TEXT | YES | - | เหตุผลที่ปิดการจำหน่าย |

### 3.3 `package_menu_items` (จับคู่เมนูในแพ็กเกจ)
* **PK:** (`package_id`, `menu_item_id`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `package_id` | UUID | NO | - | FK $\rightarrow$ `packages.id` ON DELETE CASCADE |
| `menu_item_id` | UUID | NO | - | FK $\rightarrow$ `menu_items.id` ON DELETE CASCADE |
| `is_included` | BOOLEAN | NO | `true` | รวมในแพ็กเกจหรือไม่ |

### 3.4 `menu_item_options` (ตัวเลือกเพิ่มเติมของเมนู)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `menu_item_id` | UUID | NO | - | FK $\rightarrow$ `menu_items.id` ON DELETE CASCADE |
| `option_group_name`| VARCHAR(100)| NO | - | ชื่อกลุ่มตัวเลือก เช่น "ระดับความเผ็ด" |
| `option_name` | VARCHAR(100) | NO | - | ชื่อตัวเลือก เช่น "เผ็ดน้อย", "เผ็ดมาก" |
| `additional_price` | NUMERIC(10,2)| NO | 0.00 | ราคาคิดเพิ่ม (ถ้ามี) |
| `is_active` | BOOLEAN | NO | `true` | เปิด/ปิดตัวเลือก |

### 3.5 `menu_ingredients` (สูตรตัดสต็อก BOM ต่อจาน)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`) | **UK:** (`menu_item_id`, `ingredient_id`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `menu_item_id` | UUID | NO | - | FK $\rightarrow$ `menu_items.id` ON DELETE CASCADE |
| `ingredient_id` | UUID | NO | - | FK $\rightarrow$ `ingredients.id` |
| `quantity_required`| NUMERIC(10,3)| NO | - | ปริมาณวัตถุดิบต่อ 1 จาน (CHECK `> 0`) |

---

## 4. หมวดการสั่งอาหารและครัว

### 4.1 `orders` (หัวเอกสารออเดอร์)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `session_id` | UUID | NO | - | FK $\rightarrow$ `sessions.id` ON DELETE CASCADE |
| `order_number` | VARCHAR(30) | NO | - | เลขคำสั่งซื้อ เช่น `ORD-20261112-001` (UNIQUE) |
| `order_source` | VARCHAR(20) | NO | `'customer_qr'` | ช่องทาง: `customer_qr`, `staff_assist` |
| `created_by` | UUID | YES | - | FK $\rightarrow$ `profiles.id` (Staff ผู้รับแทน; NULL หากลูกค้าสั่ง) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่สั่ง |

### 4.2 `order_items` (รายการอาหารในออเดอร์และสถานะ KDS)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `order_id` | UUID | NO | - | FK $\rightarrow$ `orders.id` ON DELETE CASCADE |
| `menu_item_id` | UUID | NO | - | FK $\rightarrow$ `menu_items.id` |
| `quantity` | INT | NO | 1 | จำนวนจาน (CHECK `quantity > 0`) |
| `unit_price_snapshot`| NUMERIC(10,2)| NO | 0.00 | ราคาต่อหน่วย ณ เวลาสั่ง (สำหรับเมนูสั่งเพิ่ม) |
| `status` | VARCHAR(20) | NO | `'pending'` | สถานะ: `pending`, `cooking`, `served`, `cancelled` |
| `cancelled_by` | UUID | YES | - | FK $\rightarrow$ `profiles.id` (ผู้ยกเลิก) |
| `cancelled_reason` | TEXT | YES | - | เหตุผลการยกเลิก |
| `cancelled_at` | TIMESTAMPTZ | YES | - | เวลาที่ยกเลิก |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | เวลาที่อัปเดตสถานะล่าสุด |

### 4.3 `order_item_options` (ตัวเลือกที่ลูกค้าเลือกในจาน)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `order_item_id` | UUID | NO | - | FK $\rightarrow$ `order_items.id` ON DELETE CASCADE |
| `menu_item_option_id`| UUID | NO | - | FK $\rightarrow$ `menu_item_options.id` |
| `option_price_snapshot`| NUMERIC(10,2)| NO | 0.00 | Snapshot ราคาเพิ่มของตัวเลือก |

---

## 5. หมวดบิล ชำระเงิน ค่าปรับ และภาษี

### 5.1 `bills` (บิลเดี่ยวของรอบบริการ)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`) | **UK:** `session_id` (1 Session มี 1 Bill)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `session_id` | UUID | NO | - | FK $\rightarrow$ `sessions.id` (UNIQUE) |
| `bill_number` | VARCHAR(30) | NO | - | เลขที่บิล เช่น `INV-20261112-001` (UNIQUE) |
| `buffet_subtotal` | NUMERIC(10,2) | NO | 0.00 | ยอดรวมค่าบุฟเฟต์จาก Snapshot |
| `extra_items_subtotal`| NUMERIC(10,2)| NO | 0.00 | ยอดรวมอาหารสั่งเพิ่มนอกบุฟเฟต์ |
| `leftover_penalty_subtotal`| NUMERIC(10,2)| NO | 0.00 | ยอดรวมค่าปรับเนื้อเหลือ |
| `discount_amount` | NUMERIC(10,2) | NO | 0.00 | จำนวนเงินส่วนลด |
| `discount_reason` | TEXT | YES | - | เหตุผลส่วนลด |
| `discount_approved_by`| UUID | YES | - | FK $\rightarrow$ `profiles.id` (ผู้ให้ส่วนลด) |
| `total_amount` | NUMERIC(10,2) | NO | - | ยอดสุทธิที่ต้องชำระ (CHECK `total_amount >= 0`) |
| `vat_amount` | NUMERIC(10,2) | NO | 0.00 | VAT 7% Inclusive (`total_amount * 7 / 107`) |
| `status` | VARCHAR(20) | NO | `'unpaid'` | สถานะบิล: `unpaid`, `paid` |
| `paid_at` | TIMESTAMPTZ | YES | - | วันเวลาที่ชำระเงินสำเร็จ |

### 5.2 `bill_items` (รายการแจกแจงในใบเสร็จ)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `bill_id` | UUID | NO | - | FK $\rightarrow$ `bills.id` ON DELETE CASCADE |
| `item_type` | VARCHAR(30) | NO | - | ประเภท: `buffet_adult`, `buffet_child`, `extra_item`, `leftover_penalty`, `discount` |
| `description` | VARCHAR(200) | NO | - | คำอธิบายรายการ เช่น "บุฟเฟต์ผู้ใหญ่ x 3" |
| `quantity` | NUMERIC(10,2) | NO | 1 | ปริมาณหรือจำนวนคน |
| `unit_price` | NUMERIC(10,2) | NO | - | ราคาต่อหน่วย |
| `total_price` | NUMERIC(10,2) | NO | - | ราคารวมรายการ |

### 5.3 `payments` (ประวัติการชำระเงินสำเร็จ)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`) | **UK:** `bill_id`

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `bill_id` | UUID | NO | - | FK $\rightarrow$ `bills.id` (UNIQUE) |
| `payment_method` | VARCHAR(20) | NO | - | ช่องทาง: `cash`, `promptpay`, `credit_card`, `split` |
| `amount_paid` | NUMERIC(10,2) | NO | - | จำนวนเงินที่ชำระ |
| `status` | VARCHAR(20) | NO | `'settled'` | สถานะ: `settled` |
| `verified_by` | UUID | NO | - | FK $\rightarrow$ `profiles.id` (Cashier ผู้รับเงิน) |
| `verified_at` | TIMESTAMPTZ | NO | `now()` | เวลาที่ยืนยันชำระเงิน |

### 5.4 `payment_attempts` (ประวัติการตรวจสลิปไม่ผ่าน/ลองซ้ำ)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `bill_id` | UUID | NO | - | FK $\rightarrow$ `bills.id` ON DELETE CASCADE |
| `payment_method` | VARCHAR(20) | NO | - | ช่องทางชำระเงิน |
| `attempt_status` | VARCHAR(30) | NO | - | สถานะ: `pending_verification`, `rejected`, `failed` |
| `rejection_reason` | TEXT | YES | - | เหตุผลที่ไม่ผ่าน เช่น "สลิปซ้ำ", "ยอดเงินไม่ตรง" |
| `slip_reference` | VARCHAR(100) | YES | - | รหัสอ้างอิงสลิป |
| `attempted_by` | UUID | NO | - | FK $\rightarrow$ `profiles.id` (Cashier ผู้ตรวจ) |

### 5.5 `leftover_records` (น้ำหนักเนื้อสัตว์เหลือจริงและค่าปรับ)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`) | **UK:** `session_id`

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `session_id` | UUID | NO | - | FK $\rightarrow$ `sessions.id` (UNIQUE) |
| `bill_id` | UUID | YES | - | FK $\rightarrow$ `bills.id` (ผูกเมื่อออกบิล) |
| `weight_grams` | INT | NO | 0 | น้ำหนักเนื้อสัตว์เหลือจริงเป็นกรัม |
| `penalty_rate_per_100g`| NUMERIC(10,2)| NO | 100.00 | อัตรา 100 บาทต่อทุก 100 กรัม |
| `penalty_amount` | NUMERIC(10,2) | NO | 0.00 | คำนวณ: `CEIL(weight_grams / 100.0) * 100` |
| `weighed_by` | UUID | NO | - | FK $\rightarrow$ `profiles.id` (Staff ผู้ชั่ง) |

### 5.6 `tax_invoices` (ใบกำกับภาษีเต็มรูป)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`) | **UK:** `bill_id`

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `bill_id` | UUID | NO | - | FK $\rightarrow$ `bills.id` ON DELETE CASCADE (UNIQUE) |
| `customer_name` | VARCHAR(200) | NO | - | ชื่อบุคคลหรือชื่อนิติบุคคล |
| `tax_id` | VARCHAR(20) | NO | - | เลขประจำตัวผู้เสียภาษี 13 หลัก |
| `branch` | VARCHAR(50) | NO | `'สำนักงานใหญ่'` | สาขาที่ออก |
| `address` | TEXT | NO | - | ที่อยู่ตามทะเบียนภาษี |
| `issued_by` | UUID | NO | - | FK $\rightarrow$ `profiles.id` (Cashier ผู้ออกเอกสาร) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่ออกเอกสาร |

---

## 6. หมวดสต็อกและการวิเคราะห์

### 6.1 `ingredients` (ข้อมูลวัตถุดิบและยอดคงเหลือ)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `name` | VARCHAR(100) | NO | - | ชื่อวัตถุดิบ เช่น "เนื้อสันคอสไลซ์", "กุ้งสด" |
| `unit` | VARCHAR(20) | NO | - | หน่วยนับ เช่น `g`, `ml`, `piece` |
| `current_stock` | NUMERIC(12,3) | NO | 0.000 | สต็อกคงเหลือจริง (CHECK `current_stock >= 0`) |
| `minimum_threshold`| NUMERIC(12,3)| NO | 0.000 | จุดเตือนสต็อกใกล้หมด (Reorder Point) |

### 6.2 `stock_movements` (สมุดบัญชีความเคลื่อนไหวสต็อก)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)
* **Unique Index กันตัดซ้ำ:** `UNIQUE (order_item_id, ingredient_id) WHERE movement_type = 'actual_consumption'`

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `ingredient_id` | UUID | NO | - | FK $\rightarrow$ `ingredients.id` |
| `order_item_id` | UUID | YES | - | FK $\rightarrow$ `order_items.id` (ผูกกับจานที่ตัด/คืนสต็อก) |
| `stock_count_id` | UUID | YES | - | FK $\rightarrow$ `stock_counts.id` (ผูกกับการปรับยอดตรวจนับ) |
| `movement_type` | VARCHAR(30) | NO | - | ประเภท: `actual_consumption`, `stock_count_adjustment`, `kitchen_waste`, `manual_restock`, `cancel_return` (ชื่อเสนอใหม่ สำหรับคืนสต็อกเมื่อยกเลิก) |
| `quantity` | NUMERIC(12,3) | NO | - | ปริมาณ (ค่าลบ = ตัดออก, ค่าบวก = เพิ่มเข้า) |
| `balance_after` | NUMERIC(12,3) | NO | - | ยอดคงเหลือหลังทำรายการ |
| `reason` | TEXT | YES | - | เหตุผลประกอบ |
| `created_by` | UUID | NO | - | FK $\rightarrow$ `profiles.id` (ผู้บันทึก) |

### 6.3 `stock_counts` (รอบการตรวจนับสต็อกประจำวันหลังปิดร้าน)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `count_date` | DATE | NO | `CURRENT_DATE` | วันที่ตรวจนับ |
| `status` | VARCHAR(20) | NO | `'pending_review'` | สถานะ: `pending_review`, `approved`, `rejected` |
| `counted_by` | UUID | NO | - | FK $\rightarrow$ `profiles.id` (Manager ผู้ตรวจนับ) |
| `approved_by` | UUID | YES | - | FK $\rightarrow$ `profiles.id` (Manager/Admin ผู้อนุมัติ) |
| `approved_at` | TIMESTAMPTZ | YES | - | เวลาอนุมัติ |

### 6.4 `stock_count_items` (รายการวัตถุดิบที่ตรวจนับ)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `stock_count_id` | UUID | NO | - | FK $\rightarrow$ `stock_counts.id` ON DELETE CASCADE |
| `ingredient_id` | UUID | NO | - | FK $\rightarrow$ `ingredients.id` |
| `system_stock` | NUMERIC(12,3) | NO | - | ยอดในระบบ ณ เวลาตรวจนับ |
| `counted_stock` | NUMERIC(12,3) | NO | - | ยอดที่นับได้จริง |
| `discrepancy` | NUMERIC(12,3) | NO | - | ผลต่าง: `counted_stock - system_stock` |
| `adjustment_reason`| TEXT | YES | - | คำชี้แจงสาเหตุของผลต่าง |

### 6.5 `usage_rates` (อัตราประมาณการบริโภคต่อหัวลูกค้า)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`) | **UK:** (`package_id`, `ingredient_id`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `package_id` | UUID | NO | - | FK $\rightarrow$ `packages.id` ON DELETE CASCADE |
| `ingredient_id` | UUID | NO | - | FK $\rightarrow$ `ingredients.id` ON DELETE CASCADE |
| `estimated_grams_per_adult`| NUMERIC(10,2)| NO | 0.00 | ปริมาณประมาณการต่อผู้ใหญ่ 1 คน (กรัม) |
| `estimated_grams_per_child`| NUMERIC(10,2)| NO | 0.00 | ปริมาณประมาณการต่อเด็ก 1 คน (กรัม) |

### 6.6 `head_usage_estimates` (ประมาณการใช้วัตถุดิบของ Session)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`) | **UK:** (`session_id`, `ingredient_id`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `session_id` | UUID | NO | - | FK $\rightarrow$ `sessions.id` ON DELETE CASCADE |
| `ingredient_id` | UUID | NO | - | FK $\rightarrow$ `ingredients.id` |
| `estimated_quantity`| NUMERIC(12,3)| NO | - | ปริมาณประมาณการรวมของ Session |

---

## 7. หมวดคิวและคำขอเรียกพนักงาน

### 7.1 `queues` (คิวลูกค้าหน้าร้าน)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `queue_number` | VARCHAR(10) | NO | - | หมายเลขคิว เช่น `A01`, `B05` |
| `guest_count` | INT | NO | 1 | จำนวนลูกค้า (CHECK `> 0`) |
| `table_size` | VARCHAR(10) | NO | `'small'` | ขนาดโต๊ะ: `small` (1-2), `medium` (3-4), `large` (5+) |
| `status` | VARCHAR(20) | NO | `'waiting'` | สถานะ: `waiting`, `called`, `seated`, `skipped`, `cancelled` |
| `phone_number` | VARCHAR(20) | YES | - | เบอร์โทรศัพท์ลูกค้า (สำหรับ SMS/LINE ไม่บังคับ) |
| `called_at` | TIMESTAMPTZ | YES | - | เวลาพนักงานกดเรียกคิว |
| `seated_at` | TIMESTAMPTZ | YES | - | เวลาลูกค้าเข้าโต๊ะ |

### 7.2 `service_requests` (คำขอเรียกพนักงานจากโต๊ะอาหาร)
* **PK:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field | Type | Null | Default | Description & Constraints |
|---|---|---|---|---|
| `table_id` | UUID | NO | - | FK $\rightarrow$ `dining_tables.id` |
| `session_id` | UUID | NO | - | FK $\rightarrow$ `sessions.id` ON DELETE CASCADE |
| `request_type` | VARCHAR(30) | NO | `'call_staff'` | ประเภท: `call_staff`, `water`, `change_pot`, `check_bill`, `other` |
| `status` | VARCHAR(20) | NO | `'pending'` | สถานะ: `pending`, `in_progress`, `completed` |
| `handled_by` | UUID | YES | - | FK $\rightarrow$ `profiles.id` (Staff ผู้รับเรื่อง) |
| `completed_at` | TIMESTAMPTZ | YES | - | เวลาที่เสร็จสิ้น |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่ลูกค้ากดเรียก |
