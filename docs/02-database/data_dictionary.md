[🏠 หน้าหลัก (README)](../../README.md) • [📋 SRS (v1.7)](../01-requirements/SRS.md) • [🗃️ Data Dictionary](data_dictionary.md) • [🛡️ Audit Matrix](../03-audit/audit_matrix.md) • [🏗️ Agent Blueprint](../../agent.md) • [💾 Database Schema](../../supabase/migrations/001_initial_schema.sql)

---

# 🗃️ KURO POS - Data Dictionary
> **พจนานุกรมข้อมูลระบบบริหารจัดการร้านอาหารบุฟเฟต์ปิ้งย่าง**  
> **เวอร์ชัน:** 1.7 (รองรับ 28 ตาราง ครบถ้วนตามข้อกำหนด SRS v1.7 และ Migration Script)  
> **ฐานข้อมูล:** Supabase PostgreSQL

---

### สารบัญโครงสร้างตาราง (28 ตาราง ครบถ้วนตาม SRS v1.7)

1. **หมวดผู้ใช้และความปลอดภัย (Identity & Access):** `profiles`, `audit_logs`, `app_settings`
2. **หมวดโต๊ะและรอบบริการ (Tables & Sessions):** `dining_tables`, `packages`, `sessions`, `session_tables`, `qr_access_tokens`, `qr_pin_attempts`
3. **หมวดเมนูและสินค้า (Menu & Catalog):** `categories`, `menu_items`, `package_menu_items`, `menu_item_options`, `menu_ingredients`
4. **หมวดการสั่งอาหาร (Ordering & Kitchen):** `orders`, `order_items`, `order_item_options`
5. **หมวดบิล ชำระเงิน และค่าปรับ (Billing, Payments & Penalties):** `bills`, `bill_items`, `payments`, `payment_attempts`, `leftover_records`
6. **หมวดสต็อกและการวิเคราะห์วัตถุดิบ (Inventory & Analysis):** `ingredients`, `stock_movements`, `stock_counts`, `stock_count_items`, `usage_rates`, `head_usage_estimates`

---

## 1. หมวดผู้ใช้และความปลอดภัย (Identity & Access)

### 1.1 `profiles`
ตารางข้อมูลพนักงาน เชื่อมโยงกับระบบพิสูจน์ตัวตน Supabase Auth (`auth.users`)
* **Primary Key:** `id` (UUID references `auth.users.id` ON DELETE CASCADE)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | - | รหัสผู้ใช้ตรงกับ Supabase Auth ID |
| `full_name` | VARCHAR(100) | NO | - | ชื่อ-นามสกุลพนักงาน |
| `role` | VARCHAR(20) | NO | - | บทบาทผู้ใช้งาน: `admin`, `manager`, `staff`, `kitchen`, `cashier` |
| `is_active` | BOOLEAN | NO | `true` | สถานะเปิด/ปิดการใช้งานบัญชี (Admin จัดการ) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่สร้างบัญชี |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่แก้ไขล่าสุด |

### 1.2 `audit_logs`
ตารางบันทึก Audit Trail ของธุรกรรมสำคัญและการกระทำที่ต้องตรวจสอบย้อนหลังได้ (NFR-012, NFR-022)
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `actor_id` | UUID | YES | - | FK -> `profiles.id` (ผู้กระทำ; NULL ได้กรณี System Action) |
| `action` | VARCHAR(100) | NO | - | ชื่อกิจกรรม เช่น `EMERGENCY_OVERRIDE`, `APPROVE_DISCOUNT`, `CANCEL_ORDER` |
| `target_entity` | VARCHAR(50) | NO | - | ชื่อตารางเป้าหมาย เช่น `orders`, `stock_counts`, `bills` |
| `target_id` | VARCHAR(100) | YES | - | ID ของแถวที่ได้รับผลกระทบ |
| `payload_before` | JSONB | YES | - | ข้อมูลเดิมก่อนการเปลี่ยนแปลง |
| `payload_after` | JSONB | YES | - | ข้อมูลใหม่หลังการเปลี่ยนแปลง |
| `reason` | TEXT | YES | - | เหตุผลประกอบ (บังคับมีเมื่อเป็น Override หรือ Discount) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่เกิดกิจกรรม |

### 1.3 `app_settings`
ตารางการตั้งค่าระบบ (System Configuration)
* **Primary Key:** `key` (VARCHAR(50))

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `key` | VARCHAR(50) | NO | - | Primary Key รหัสการตั้งค่า เช่น `max_pin_attempts`, `penalty_rate_per_100g` |
| `value` | TEXT | NO | - | ค่าของการตั้งค่า |
| `description` | TEXT | YES | - | คำอธิบาย |
| `updated_by` | UUID | YES | - | FK -> `profiles.id` (Admin ผู้แก้ไขล่าสุด) |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่แก้ไขล่าสุด |

---

## 2. หมวดโต๊ะและรอบบริการ (Tables & Sessions)

### 2.1 `dining_tables`
ตารางข้อมูลโต๊ะอาหารประจำร้าน (BR-001 รองรับ 20 โต๊ะ)
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `table_number` | VARCHAR(10) | NO | - | หมายเลขโต๊ะ เช่น `T01` ถึง `T20` (UNIQUE) |
| `capacity` | INT | NO | 4 | จำนวนที่นั่งรองรับ (CHECK `capacity > 0`) |
| `status` | VARCHAR(20) | NO | `'available'` | สถานะโต๊ะ: `available` (ว่าง), `occupied` (มีลูกค้า), `cleaning` (รอทำความสะอาด) |
| `qr_code_url` | TEXT | NO | - | URL ประจำโต๊ะ (เช่น `https://pos.domain/order?table=T01`) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่สร้าง |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่แก้ไขล่าสุด |

### 2.2 `packages`
ตารางแพ็กเกจบุฟเฟต์
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `name` | VARCHAR(100) | NO | - | ชื่อแพ็กเกจ เช่น "Standard Buffet", "Premium Beef" |
| `adult_price` | NUMERIC(10,2) | NO | - | ราคาต่อหัวผู้ใหญ่ (รวม VAT 7% แล้ว) |
| `child_price` | NUMERIC(10,2) | NO | - | ราคาต่อหัวเด็ก (ส่วนสูง 120-139 ซม.) |
| `free_price` | NUMERIC(10,2) | NO | 0.00 | ราคาต่อหัวลูกค้าฟรี (ส่วนสูงต่ำกว่า 120 ซม.) |
| `duration_minutes` | INT | NO | 90 | ระยะเวลารับประทานบุฟเฟต์เป็นนาที (CHECK `duration_minutes > 0`) |
| `is_active` | BOOLEAN | NO | `true` | เปิด/ปิดการใช้งานแพ็กเกจ |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่สร้าง |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่แก้ไขล่าสุด |

### 2.3 `sessions`
ตารางรอบการใช้บริการ (หัวใจหลักของข้อมูลรอบลูกค้า)
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `package_id` | UUID | NO | - | FK -> `packages.id` (แพ็กเกจที่เลือก) |
| `status` | VARCHAR(20) | NO | `'draft'` | สถานะ: `draft`, `active`, `expired`, `closing`, `billed`, `closed` |
| `pin_hash` | VARCHAR(255) | NO | - | แฮชของ PIN 6 หลักสำหรับรอบบริการนี้ (NFR-006) |
| `pin_plain` | VARCHAR(6) | YES | - | รหัส PIN 6 หลักสำหรับแสดงผลให้ Staff ตอนเปิดรอบ (ลบ/ซ่อนได้) |
| `failed_pin_attempts` | INT | NO | 0 | จำนวนครั้งที่กรอก PIN ผิดสะสม |
| `is_locked` | BOOLEAN | NO | `false` | ถูกล็อกเมื่อกรอก PIN ผิดเกิน 5 ครั้ง (FR-016) |
| `adult_guest_count` | INT | NO | 0 | Snapshot จำนวนผู้ใหญ่ (CHECK `>= 0`) |
| `child_guest_count` | INT | NO | 0 | Snapshot จำนวนเด็ก (CHECK `>= 0`) |
| `free_guest_count` | INT | NO | 0 | Snapshot จำนวนลูกค้าฟรี (CHECK `>= 0`) |
| `adult_price_snapshot` | NUMERIC(10,2) | NO | 0.00 | Snapshot ราคาผู้ใหญ่ ณ เวลาเปิด Session (FR-029, FR-059) |
| `child_price_snapshot` | NUMERIC(10,2) | NO | 0.00 | Snapshot ราคาเด็ก ณ เวลาเปิด Session |
| `free_price_snapshot` | NUMERIC(10,2) | NO | 0.00 | Snapshot ราคาฟรี (0.00) |
| `duration_minutes_snapshot` | INT | NO | 90 | Snapshot ระยะเวลารับประทาน (นาที) |
| `guest_count_locked_at` | TIMESTAMPTZ | YES | - | เวลาที่ล็อก Snapshot (เมื่อเปลี่ยนสถานะเป็น `active`) |
| `started_at` | TIMESTAMPTZ | YES | - | เวลาเริ่มเปิดบริการจริงและเริ่มนับเวลาถอยหลัง |
| `expires_at` | TIMESTAMPTZ | YES | - | เวลาหมดรอบบริการคำนวณจาก `started_at + duration_minutes` |
| `closed_at` | TIMESTAMPTZ | YES | - | เวลาปิดรอบบริการ (หลังชำระเงินปิดบิล) |
| `created_by` | UUID | NO | - | FK -> `profiles.id` (Staff ผู้เปิดรอบบริการ) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่สร้าง |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่แก้ไขล่าสุด |

* **Trigger Enforcement:** มี PostgreSQL Trigger ป้องกันการ `UPDATE` คอลัมน์ Snapshot (`adult_guest_count`, `child_guest_count`, `free_guest_count`, `adult_price_snapshot`, `child_price_snapshot`) เมื่อ `status != 'draft'`

### 2.4 `session_tables`
ตารางความสัมพันธ์การผูกโต๊ะกับรอบบริการและประวัติการย้ายโต๊ะ (FR-011, OI-007)
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `session_id` | UUID | NO | - | FK -> `sessions.id` ON DELETE CASCADE |
| `table_id` | UUID | NO | - | FK -> `dining_tables.id` |
| `is_active` | BOOLEAN | NO | `true` | โต๊ะที่กำลังใช้งานอยู่ปัจจุบันของ Session นั้น |
| `assigned_at` | TIMESTAMPTZ | NO | `now()` | เวลาที่เริ่มใช้โต๊ะนี้ |
| `released_at` | TIMESTAMPTZ | YES | - | เวลาที่ย้ายออกจากโต๊ะนี้ (หรือปิดรอบ) |
| `transferred_by` | UUID | YES | - | FK -> `profiles.id` (Staff ผู้ทำรายการย้ายโต๊ะ) |

* **Partial Unique Indexes:**
  - `CREATE UNIQUE INDEX unique_active_session_per_table ON session_tables(table_id) WHERE is_active = true;` (1 โต๊ะมี active session ได้ไม่เกิน 1)
  - `CREATE UNIQUE INDEX unique_active_table_per_session ON session_tables(session_id) WHERE is_active = true;` (1 session ผูก active table ได้ไม่เกิน 1)

### 2.5 `qr_access_tokens`
ตารางจัดเก็บ Access Token ที่แจกให้ Client/มือถือลูกค้าหลังยืนยัน PIN สำเร็จ (FR-015, NFR-007)
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `session_id` | UUID | NO | - | FK -> `sessions.id` ON DELETE CASCADE |
| `token_hash` | VARCHAR(255) | NO | - | ค่า Hash ของ JWT/Token (UNIQUE) |
| `is_revoked` | BOOLEAN | NO | `false` | ถูกเพิกถอนทันทีเมื่อปิดรอบบริการ (NFR-008) |
| `expires_at` | TIMESTAMPTZ | NO | - | เวลาหมดอายุของ Token (อ้างอิง `sessions.expires_at`) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่สร้าง |

### 2.6 `qr_pin_attempts`
ตารางประวัติการกรอก PIN เข้าสั่งอาหาร เพื่อป้องกัน Brute-Force (FR-016)
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `session_id` | UUID | NO | - | FK -> `sessions.id` ON DELETE CASCADE |
| `is_successful` | BOOLEAN | NO | - | ผลการกรอก PIN (`true`/`false`) |
| `client_ip` | VARCHAR(50) | YES | - | IP Address ของ Client |
| `user_agent` | TEXT | YES | - | ข้อมูล Browser ของ Client |
| `attempted_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่กรอก PIN |

---

## 3. หมวดเมนูและสินค้า (Menu & Catalog)

### 3.1 `categories`
ตารางหมวดหมู่อาหาร
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `name` | VARCHAR(100) | NO | - | ชื่อหมวดหมู่ เช่น "เนื้อวัว", "หมู", "ซีฟู้ด", "เครื่องดื่ม" |
| `display_order` | INT | NO | 0 | ลำดับการแสดงผลบนหน้าจอ |
| `is_active` | BOOLEAN | NO | `true` | เปิด/ปิดการแสดงผลหมวดหมู่ |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่สร้าง |

### 3.2 `menu_items`
ตารางรายการอาหาร
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `category_id` | UUID | NO | - | FK -> `categories.id` |
| `name` | VARCHAR(150) | NO | - | ชื่อรายการอาหาร |
| `description` | TEXT | YES | - | รายละเอียด |
| `image_url` | TEXT | YES | - | รูปภาพอาหาร |
| `extra_price` | NUMERIC(10,2) | NO | 0.00 | ราคาคิดเงินเพิ่มสำหรับเมนูที่ไม่รวมในบุฟเฟต์ (รวม VAT 7%) |
| `availability_status` | VARCHAR(20) | NO | `'available'` | สถานะ: `available` (พร้อมขาย), `manual_off` (ปิดด้วยมือ), `auto_off` (ปิดอัตโนมัติจากสต็อกหมด) |
| `disabled_reason` | TEXT | YES | - | เหตุผลที่ปิดการจำหน่าย |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่สร้าง |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่แก้ไขล่าสุด |

### 3.3 `package_menu_items`
ตารางจับคู่รายการอาหารที่รวมอยู่ในแต่ละแพ็กเกจ (FR-027)
* **Primary Key:** (`package_id`, `menu_item_id`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `package_id` | UUID | NO | - | FK -> `packages.id` ON DELETE CASCADE |
| `menu_item_id` | UUID | NO | - | FK -> `menu_items.id` ON DELETE CASCADE |
| `is_included` | BOOLEAN | NO | `true` | รวมอยู่ในแพ็กเกจหรือไม่ |

### 3.4 `menu_item_options`
ตารางตัวเลือกเพิ่มเติมของเมนู เช่น ระดับความเผ็ด, ขนาดจาน
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `menu_item_id` | UUID | NO | - | FK -> `menu_items.id` ON DELETE CASCADE |
| `option_group_name` | VARCHAR(100) | NO | - | ชื่อกลุ่มตัวเลือก เช่น "ระดับความเผ็ด" |
| `option_name` | VARCHAR(100) | NO | - | ชื่อตัวเลือก เช่น "เผ็ดน้อย", "เผ็ดมาก" |
| `additional_price` | NUMERIC(10,2) | NO | 0.00 | ราคาคิดเพิ่มของตัวเลือก |
| `is_active` | BOOLEAN | NO | `true` | สถานะเปิด/ปิดตัวเลือก |

### 3.5 `menu_ingredients`
ตารางสูตรอาหาร (BOM - Bill of Materials) สำหรับตัดสต็อกจริง (Actual Consumption)
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)
* **Unique Key:** (`menu_item_id`, `ingredient_id`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `menu_item_id` | UUID | NO | - | FK -> `menu_items.id` ON DELETE CASCADE |
| `ingredient_id` | UUID | NO | - | FK -> `ingredients.id` |
| `quantity_required` | NUMERIC(10,3) | NO | - | ปริมาณวัตถุดิบที่ต้องใช้ต่อ 1 จาน (CHECK `quantity_required > 0`) |

---

## 4. หมวดการสั่งอาหาร (Ordering & Kitchen)

### 4.1 `orders`
ตารางหัวเอกสารการสั่งอาหารในรอบบริการ
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `session_id` | UUID | NO | - | FK -> `sessions.id` ON DELETE CASCADE |
| `order_number` | VARCHAR(30) | NO | - | หมายเลขคำสั่งซื้อ เช่น `ORD-20261111-001` (UNIQUE) |
| `order_source` | VARCHAR(20) | NO | `'customer_qr'` | ช่องทางที่สั่ง: `customer_qr`, `staff_assist` |
| `created_by` | UUID | YES | - | FK -> `profiles.id` (Staff ผู้รับออเดอร์แทน; NULL หากลูกค้าสั่งเอง) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่สั่ง |

### 4.2 `order_items`
ตารางรายการอาหารในแต่ละออเดอร์ (สถานะการปรุงและตัดสต็อกคุมที่ระดับนี้)
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `order_id` | UUID | NO | - | FK -> `orders.id` ON DELETE CASCADE |
| `menu_item_id` | UUID | NO | - | FK -> `menu_items.id` |
| `quantity` | INT | NO | 1 | จำนวนจานที่สั่ง (CHECK `quantity > 0`) |
| `unit_price_snapshot` | NUMERIC(10,2) | NO | 0.00 | ราคาต่อหน่วย ณ เวลาสั่ง (สำหรับเมนูคิดเงินเพิ่ม) |
| `status` | VARCHAR(20) | NO | `'submitted'` | สถานะ: `submitted`, `accepted`, `cooking`, `ready`, `served`, `cancelled` |
| `cancelled_by` | UUID | YES | - | FK -> `profiles.id` (ผู้ทำการยกเลิก) |
| `cancelled_reason` | TEXT | YES | - | เหตุผลการยกเลิก |
| `cancelled_at` | TIMESTAMPTZ | YES | - | เวลาที่ยกเลิก |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่ส่งรายการ |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่อัปเดตสถานะล่าสุด |

### 4.3 `order_item_options`
ตารางตัวเลือกที่ลูกค้าเลือกในแต่ละรายการอาหาร
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `order_item_id` | UUID | NO | - | FK -> `order_items.id` ON DELETE CASCADE |
| `menu_item_option_id`| UUID | NO | - | FK -> `menu_item_options.id` |
| `option_price_snapshot`| NUMERIC(10,2) | NO | 0.00 | Snapshot ราคาเพิ่มของตัวเลือก ณ เวลาสั่ง |

---

## 5. หมวดบิล ชำระเงิน และค่าปรับ (Billing, Payments & Penalties)

### 5.1 `bills`
ตารางบิลเดี่ยวของรอบบริการ (FR-042: 1 Session มีได้เพียง 1 Bill)
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)
* **Unique Key:** `session_id` (รับประกันหนึ่งรอบบริการมีบิลเดียว)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `session_id` | UUID | NO | - | FK -> `sessions.id` (UNIQUE) |
| `bill_number` | VARCHAR(30) | NO | - | หมายเลขบิล เช่น `INV-20261111-001` (UNIQUE) |
| `buffet_subtotal` | NUMERIC(10,2) | NO | 0.00 | ยอดรวมค่าบุฟเฟต์จาก Snapshot |
| `extra_items_subtotal` | NUMERIC(10,2) | NO | 0.00 | ยอดรวมอาหารสั่งเพิ่ม |
| `leftover_penalty_subtotal` | NUMERIC(10,2) | NO | 0.00 | ยอดรวมค่าปรับอาหารเหลือ (ดึงจาก `leftover_records`) |
| `discount_amount` | NUMERIC(10,2) | NO | 0.00 | จำนวนเงินส่วนลด (FR-040) |
| `discount_reason` | TEXT | YES | - | เหตุผลการให้ส่วนลด |
| `discount_approved_by`| UUID | YES | - | FK -> `profiles.id` (Manager หรือ Admin ผู้อนุมัติ) |
| `total_amount` | NUMERIC(10,2) | NO | - | ยอดสุทธิที่ต้องชำระ (CHECK `total_amount >= 0`) |
| `vat_amount` | NUMERIC(10,2) | NO | 0.00 | ภาษีมูลค่าเพิ่ม 7% ถอดใน (`total_amount * 7 / 107`) |
| `status` | VARCHAR(20) | NO | `'unpaid'` | สถานะบิล: `unpaid` (ยังไม่ชำระ), `paid` (ชำระเต็มจำนวนแล้ว) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่ออกบิล |
| `paid_at` | TIMESTAMPTZ | YES | - | วันเวลาที่ชำระเงินสำเร็จ |

### 5.2 `bill_items`
ตารางแสดงรายการแจกแจงในใบเสร็จ
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `bill_id` | UUID | NO | - | FK -> `bills.id` ON DELETE CASCADE |
| `item_type` | VARCHAR(30) | NO | - | ชนิดรายการ: `buffet_adult`, `buffet_child`, `buffet_free`, `extra_item`, `leftover_penalty`, `discount` |
| `description` | VARCHAR(200) | NO | - | คำอธิบายรายการ เช่น "บุฟเฟต์ผู้ใหญ่ x 4", "ค่าปรับเนื้อเหลือ 200g" |
| `quantity` | NUMERIC(10,2) | NO | 1 | ปริมาณหรือจำนวนคน |
| `unit_price` | NUMERIC(10,2) | NO | - | ราคาต่อหน่วย |
| `total_price` | NUMERIC(10,2) | NO | - | ราคารวมรายการ |

### 5.3 `payments`
ตารางบันทึกการชำระเงินที่สำเร็จเรียบร้อยแล้ว (Settled Transaction)
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)
* **Unique Key:** `bill_id` (รับประกันชำระเต็มจำนวนในครั้งเดียว BR-020)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `bill_id` | UUID | NO | - | FK -> `bills.id` (UNIQUE) |
| `payment_method` | VARCHAR(20) | NO | - | ช่องทางชำระเงิน: `cash`, `promptpay` |
| `amount_paid` | NUMERIC(10,2) | NO | - | จำนวนเงินที่ชำระ (ต้องเท่ากับ `bills.total_amount`) |
| `status` | VARCHAR(20) | NO | `'settled'` | สถานะธุรกรรมสำเร็จ |
| `verified_by` | UUID | NO | - | FK -> `profiles.id` (Cashier ผู้รับเงินและตรวจสลิป) |
| `verified_at` | TIMESTAMPTZ | NO | `now()` | เวลาที่กดยืนยันชำระเงิน |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่บันทึก |

### 5.4 `payment_attempts`
ตารางบันทึกประวัติการตรวจสอบหรือความพยายามชำระเงินที่ไม่สำเร็จ (A7)
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `bill_id` | UUID | NO | - | FK -> `bills.id` ON DELETE CASCADE |
| `payment_method` | VARCHAR(20) | NO | - | ช่องทาง: `cash`, `promptpay` |
| `attempt_status` | VARCHAR(30) | NO | - | สถานะ: `pending_verification`, `rejected`, `failed` |
| `rejection_reason` | TEXT | YES | - | เหตุผลที่ไม่ผ่าน เช่น "ยอดเงินในสลิปไม่ตรง", "สลิปซ้ำ" |
| `slip_reference` | VARCHAR(100) | YES | - | รหัสอ้างอิงสลิปที่ตรวจ |
| `attempted_by` | UUID | NO | - | FK -> `profiles.id` (Cashier ผู้ดำเนินการตรวจ) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่บันทึก |

### 5.5 `leftover_records`
ตารางบันทึกการชั่งน้ำหนักเนื้อสัตว์ที่เหลือจริงและค่าปรับ (FR-053, FR-054, OI-015)
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)
* **Unique Key:** `session_id` (1 Session บันทึกชั่งรวม 1 ครั้งก่อนออกบิล)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `session_id` | UUID | NO | - | FK -> `sessions.id` (UNIQUE) |
| `bill_id` | UUID | YES | - | FK -> `bills.id` (ผูกกับบิลเมื่อออกบิล) |
| `weight_grams` | INT | NO | 0 | น้ำหนักเนื้อสัตว์เหลือจริงเป็นกรัม (ชั่งเฉพาะเนื้อทานได้) |
| `penalty_rate_per_100g`| NUMERIC(10,2)| NO| 100.00 | อัตราค่าปรับ 100 บาท ต่อทุก 100 กรัม |
| `penalty_amount` | NUMERIC(10,2) | NO | 0.00 | ค่าปรับคำนวณ: `CEILING(weight_grams / 100.0) * 100` |
| `weighed_by` | UUID | NO | - | FK -> `profiles.id` (Staff ผู้ชั่งและบันทึก) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่บันทึก |

---

## 6. หมวดสต็อกและการวิเคราะห์วัตถุดิบ (Inventory & Analysis)

### 6.1 `ingredients`
ตารางข้อมูลวัตถุดิบและสต็อกคงเหลือปัจจุบัน
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `name` | VARCHAR(100) | NO | - | ชื่อวัตถุดิบ เช่น "เนื้อสันคอสไลซ์", "กุ้งสด", "ซอสบาร์บีคิว" |
| `unit` | VARCHAR(20) | NO | - | หน่วยนับ เช่น `g`, `ml`, `piece` |
| `current_stock` | NUMERIC(12,3) | NO | 0.000 | สต็อกคงเหลือจริง (CHECK `current_stock >= 0`) |
| `minimum_threshold` | NUMERIC(12,3)| NO | 0.000 | จุดเตือนสต็อกใกล้หมด |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่สร้าง |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่แก้ไขล่าสุด |

### 6.2 `stock_movements`
ตารางบันทึกประวัติความเคลื่อนไหวสต็อกวัตถุดิบ (Actual Ledger)
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `ingredient_id` | UUID | NO | - | FK -> `ingredients.id` |
| `order_item_id` | UUID | YES | - | FK -> `order_items.id` (ผูกกับจานที่ตัด/คืนสต็อก NFR-010) |
| `stock_count_id` | UUID | YES | - | FK -> `stock_counts.id` (ผูกกับการปรับยอดตรวจนับ) |
| `movement_type` | VARCHAR(30) | NO | - | ประเภท: `actual_consumption`, `stock_count_adjustment`, `cancellation_return`, `kitchen_waste`, `manual_restock` |
| `quantity` | NUMERIC(12,3) | NO | - | ปริมาณ (ค่าลบ = ตัดออก, ค่าบวก = เพิ่มเข้า) |
| `balance_after` | NUMERIC(12,3) | NO | - | ยอดคงเหลือในสต็อกหลังทำรายการนี้ |
| `reason` | TEXT | YES | - | เหตุผลประกอบ |
| `created_by` | UUID | NO | - | FK -> `profiles.id` (ผู้กระทำหรือบันทึก) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่บันทึก |

* **Unique Constraint กันตัดสต็อกซ้ำ:**
  `CREATE UNIQUE INDEX unique_order_item_consumption ON stock_movements(order_item_id, ingredient_id) WHERE movement_type = 'actual_consumption';`

### 6.3 `stock_counts`
ตารางรอบการตรวจนับสต็อกประจำวันหลังปิดร้าน (FR-060, FR-064, OI-016)
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `count_date` | DATE | NO | `CURRENT_DATE` | วันที่ทำการตรวจนับ |
| `status` | VARCHAR(20) | NO | `'pending_review'`| สถานะ: `pending_review`, `approved`, `rejected` |
| `counted_by` | UUID | NO | - | FK -> `profiles.id` (Manager ผู้ตรวจนับ) |
| `approved_by` | UUID | YES | - | FK -> `profiles.id` (Manager หรือ Admin ผู้อนุมัติ) |
| `approved_at` | TIMESTAMPTZ | YES | - | วันเวลาที่อนุมัติปรับยอด |
| `rejection_reason` | TEXT | YES | - | เหตุผลที่ไม่อนุมัติ (หาก rejected) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่สร้าง |

### 6.4 `stock_count_items`
ตารางรายการวัตถุดิบในรอบการตรวจนับ
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `stock_count_id` | UUID | NO | - | FK -> `stock_counts.id` ON DELETE CASCADE |
| `ingredient_id` | UUID | NO | - | FK -> `ingredients.id` |
| `system_stock` | NUMERIC(12,3) | NO | - | ยอดคงเหลือในระบบ ณ เวลาตรวจนับ |
| `counted_stock` | NUMERIC(12,3) | NO | - | ยอดที่นับได้จริงที่หน้างาน |
| `discrepancy` | NUMERIC(12,3) | NO | - | ผลต่าง: `counted_stock - system_stock` |
| `adjustment_reason` | TEXT | YES | - | คำชี้แจงสาเหตุของผลต่าง |

### 6.5 `usage_rates`
ตารางอัตราการใช้วัตถุดิบโดยประมาณต่อหัวลูกค้า (เพื่อการวิเคราะห์ ไม่ตัดสต็อกจริง FR-035, BR-012)
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)
* **Unique Key:** (`package_id`, `ingredient_id`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `package_id` | UUID | NO | - | FK -> `packages.id` ON DELETE CASCADE |
| `ingredient_id` | UUID | NO | - | FK -> `ingredients.id` ON DELETE CASCADE |
| `estimated_grams_per_adult` | NUMERIC(10,2)| NO | 0.00 | ปริมาณประมาณการที่ผู้ใหญ่ 1 คนบริโภค (กรัม) |
| `estimated_grams_per_child` | NUMERIC(10,2)| NO | 0.00 | ปริมาณประมาณการที่เด็ก 1 คนบริโภค (กรัม) |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่แก้ไขล่าสุด |

### 6.6 `head_usage_estimates`
ตารางคำนวณปริมาณการใช้วัตถุดิบโดยประมาณของแต่ละ Session (เปรียบเทียบกับ Actual Consumption)
* **Primary Key:** `id` (UUID DEFAULT `gen_random_uuid()`)

| Field Name | Data Type | Nullable | Default | Constraints & Description |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | Primary Key |
| `session_id` | UUID | NO | - | FK -> `sessions.id` ON DELETE CASCADE |
| `ingredient_id` | UUID | NO | - | FK -> `ingredients.id` |
| `estimated_quantity` | NUMERIC(12,3) | NO | - | ปริมาณประมาณการรวมของ Session (`adult * rate + child * rate`) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | วันเวลาที่คำนวณ |

