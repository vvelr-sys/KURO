[README](../README.md) • [SRS v1.8](01-requirements/SRS.md) • [Data Dictionary](02-database/data_dictionary.md) • [Audit Matrix](03-audit/audit_matrix.md) • [Agent Blueprint](../AGENTS.md)

---

# KURO POS — คู่มือข้อมูลทดสอบ (Seed Data)

> [!CAUTION]
> `supabase/seed_demo.sql` **ลบข้อมูลการใช้งานทั้งหมด** (Session, ออเดอร์, บิล, การชำระเงิน, คิว, stock movement, audit_logs) แล้วใส่ข้อมูลจำลองแทน — **ห้ามรันบนระบบจริงเด็ดขาด**

## 1. ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ | รันซ้ำได้ |
|---|---|---|
| [`supabase/seed_profiles.sql`](../supabase/seed_profiles.sql) | ผูกบัญชีทดสอบที่สร้างใน Dashboard เข้ากับ `profiles` (วิธี A ไม่ต้องใช้ Service Role Key) | ✅ upsert ตาม id |
| [`scripts/seed-users.mjs`](../scripts/seed-users.mjs) | สร้างบัญชีพนักงานทดสอบ 5 ตำแหน่งใน Supabase Auth + `profiles` (วิธี B ต้องใช้ Service Role Key) | ✅ บัญชีที่มีอยู่แล้วจะข้าม (ไม่เปลี่ยนรหัสผ่าน) แต่ upsert `profiles` ทุกครั้ง |
| [`supabase/migrations/002_v18_fixes.sql`](../supabase/migrations/002_v18_fixes.sql) | แก้ schema ให้ตรง v1.8: ลูกค้าเห็นเมนู "หมด", VAT อ่านจาก app_settings, Trigger คืนสต็อกตอนยกเลิก, ตรวจยอดชำระก่อนปิดบิล | ✅ รันซ้ำได้ ไม่แก้ข้อมูล |
| [`supabase/migrations/003_queue_guests_tax_invoice.sql`](../supabase/migrations/003_queue_guests_tax_invoice.sql) | คิวแยกผู้ใหญ่/เด็ก (`adult_count`, `child_count`), เลขที่ใบกำกับภาษีอัตโนมัติ (`invoice_number`), อีเมลผู้รับใบกำกับภาษี | ✅ รันซ้ำได้ แถวคิวเดิมถือเป็นผู้ใหญ่ทั้งหมด |
| [`supabase/migrations/004_protect_profiles.sql`](../supabase/migrations/004_protect_profiles.sql) | ปิดช่องโหว่ `profiles`: อ่านได้เฉพาะพนักงานที่ล็อกอิน และไม่มีใครอ่าน `pin_hash` ผ่าน API ได้ | ✅ รันซ้ำได้ ไม่แก้ข้อมูล |
| [`supabase/migrations/005_table_session_functions.sql`](../supabase/migrations/005_table_session_functions.sql) | ฟังก์ชันหน้าผังโต๊ะ (เปิด/ย้าย/เก็บ/ปิดใช้งานโต๊ะ, เชิญออก, ชั่งเนื้อ, พิมพ์ QR) + policy ให้สร้าง QR token และบันทึก audit_logs ได้ | ✅ รันซ้ำได้ ไม่แก้ข้อมูล |
| [`supabase/migrations/006_queue_functions.sql`](../supabase/migrations/006_queue_functions.sql) | ฟังก์ชันคิว: ออกบัตรคิว (เลขคิว A/B/C + 3 หลัก เริ่ม 001 ทุกวัน กันเลขซ้ำ), เรียก/เรียกซ้ำ/ข้าม/ยกเลิก | ✅ รันซ้ำได้ ไม่แก้ข้อมูล |
| [`supabase/migrations/007_billing_functions.sql`](../supabase/migrations/007_billing_functions.sql) | ฟังก์ชันคิดเงิน: ออกบิล (เลข INV-YYYYMMDD-NNN), ส่วนลด + Audit Log, รับชำระ/แบ่งจ่าย แล้วปิดรอบ · `payments` เพิ่ม `reference_note`, `cash_tendered` · พนักงานอ่านข้อมูลร้านใน `app_settings` ได้ | ✅ รันซ้ำได้ ไม่แก้ข้อมูลเดิม |
| [`supabase/migrations/008_settings_receipt_messages.sql`](../supabase/migrations/008_settings_receipt_messages.sql) | ให้พนักงานอ่านข้อความหัว/ท้ายใบเสร็จ (`receipt_header_message`, `receipt_footer_message`) | ✅ รันซ้ำได้ ไม่แก้ข้อมูล |
| [`supabase/migrations/020_kitchen_cancel_return_and_audit.sql`](../supabase/migrations/020_kitchen_cancel_return_and_audit.sql) | ครัว: คืนสต็อกตอนยกเลิกรายการ `cooking` ตามยอดที่ตัดจริง + policy บันทึก audit_logs ในนามตัวเอง | ✅ รันซ้ำได้ ไม่แก้ข้อมูล |
| [`supabase/migrations/021_fix_cancel_return_actor.sql`](../supabase/migrations/021_fix_cancel_return_actor.sql) | แก้ 020: ต้องรู้ผู้ยกเลิกเสมอ (ไม่ใช้ UUID 0000) + `SET search_path` | ✅ รันซ้ำได้ ต้องรันหลัง 020 |
| [`supabase/migrations/022_staff_stock_counting.sql`](../supabase/migrations/022_staff_stock_counting.sql) | นับสต็อกเช้า-เย็นโดย Staff (ไม่เห็นยอด) + `stock_counts.count_round` + รับของเข้า/ของเสีย + Manager อนุมัติ/ปฏิเสธ + Realtime สต็อก | ✅ รันซ้ำได้ ไม่ลบข้อมูล (ผลนับเดิมถือเป็นรอบปิดร้าน) |
| [`supabase/migrations/023_kitchen_read_sessions.sql`](../supabase/migrations/023_kitchen_read_sessions.sql) | ให้ `kitchen` อ่าน `sessions` / `session_tables` (จอครัวหาเลขโต๊ะ) | ✅ รันซ้ำได้ ไม่แก้ข้อมูล |
| [`supabase/migrations/024_inventory_reports_audit.sql`](../supabase/migrations/024_inventory_reports_audit.sql) | FR-024 ปิด/เปิดเมนูอัตโนมัติตามสต็อก, Manager แก้สูตร BOM ได้, Admin ปรับยอดฉุกเฉิน (`fn_emergency_adjust_stock`), Manager ไม่เห็น Audit Log ของ Admin | ✅ รันซ้ำได้ (ปรับสถานะเมนูให้ตรงสต็อกทันทีที่รัน) |
| [`supabase/migrations/025_customer_ordering.sql`](../supabase/migrations/025_customer_ordering.sql) | หน้าสั่งอาหารลูกค้า: ปิด RLS ที่ให้ anon เขียน/อ่าน `orders` `order_items` ตรง, ฟังก์ชัน `fn_customer_get_session` / `fn_customer_get_menu` / `fn_customer_place_order` (anon เรียกได้ ต้องส่ง hash ของ QR token), พนักงานอ่านตัวเลือกเมนูได้ (จอครัวแสดงตัวเลือก) | ✅ รันซ้ำได้ ไม่แก้ข้อมูล |
| [`supabase/migrations/026_customer_order_status.sql`](../supabase/migrations/026_customer_order_status.sql) | หน้าสถานะอาหารลูกค้า: `fn_customer_get_orders` อ่านออเดอร์โต๊ะตัวเองผ่าน QR token (ไม่มีราคา/เหตุผลยกเลิก) | ✅ รันซ้ำได้ ไม่แก้ข้อมูล |
| [`supabase/migrations/027_customer_service_requests.sql`](../supabase/migrations/027_customer_service_requests.sql) | หน้าเรียกพนักงานลูกค้า: ปิด RLS ที่ให้ anon เขียน/อ่าน `service_requests` ตรง, `fn_customer_get_service_requests` / `fn_customer_create_service_request` (กันกดซ้ำ: ประเภทเดิมที่ยังไม่เสร็จไม่สร้างใหม่) | ✅ รันซ้ำได้ ไม่แก้ข้อมูล |
| [`supabase/seed_master.sql`](../supabase/seed_master.sql) | ข้อมูลหลัก: ตั้งค่า VAT/ค่าปรับ, แพ็กเกจ, โต๊ะ T01-T08, หมวด, วัตถุดิบ, เมนู, ตัวเลือก, BOM, อัตราใช้ต่อหัว | ✅ รันซ้ำ = รีเซ็ตข้อมูลหลักกลับค่าตั้งต้น (ยกเว้นสถานะโต๊ะ) |
| [`supabase/seed_demo.sql`](../supabase/seed_demo.sql) | ล้างข้อมูลการใช้งาน แล้วใส่ข้อมูลจำลอง (คิว, 3 โต๊ะกำลังใช้งาน, ออเดอร์, บิล, ประวัติ 7 วัน ฯลฯ) | ✅ ทั้งไฟล์อยู่ใน Transaction เดียว ผิดพลาดตรงไหน ROLLBACK ทั้งหมด |

## 2. วิธีรัน (ตามลำดับ)

ทำครั้งเดียวต่อ Supabase โปรเจกต์ — ถ้าทีมใช้โปรเจกต์เดียวกัน คนเดียวรันพอ ทุกคนเห็นข้อมูลชุดเดียวกัน

| ลำดับ | ทำอะไร | ที่ไหน |
|:---:|---|---|
| 0 | `supabase/migrations/002_v18_fixes.sql` → `003_queue_guests_tax_invoice.sql` → `004_protect_profiles.sql` → `005_table_session_functions.sql` → `006_queue_functions.sql` → `007_billing_functions.sql` → `008_settings_receipt_messages.sql` → `020_kitchen_cancel_return_and_audit.sql` → `021_fix_cancel_return_actor.sql` → `022_staff_stock_counting.sql` → `023_kitchen_read_sessions.sql` → `024_inventory_reports_audit.sql` → `025_customer_ordering.sql` → `026_customer_order_status.sql` → `027_customer_service_requests.sql` (แก้ schema ครั้งเดียว หลัง `001_initial_schema.sql`) | SQL Editor |
| 1 | สร้างบัญชีทดสอบ 5 ตำแหน่ง — เลือก **วิธี A** หรือ **วิธี B** ด้านล่าง | Dashboard / Terminal |
| 2 | `supabase/seed_master.sql` | SQL Editor |
| 3 | `supabase/seed_demo.sql` (เฉพาะฐานข้อมูลพัฒนา/ทดสอบ) | SQL Editor |

**วิธีรันไฟล์ใน SQL Editor:** เปิดไฟล์ใน VS Code → `Ctrl+A` → `Ctrl+C` → Supabase Dashboard → **SQL Editor** → **New query** → วาง → **Run**
(หรือใช้ psql: `psql "<connection string>" -f <ไฟล์>`)

### 2.1 สร้างบัญชีทดสอบ — วิธี A: ผ่าน Dashboard (แนะนำ ไม่ต้องใช้ Service Role Key)

1. Supabase Dashboard → **Authentication** → **Users** → **Add user** → **Create new user** ทำ 5 ครั้ง:
   - Email: `admin@kuro.test`, `manager@kuro.test`, `cashier@kuro.test`, `staff@kuro.test`, `kitchen@kuro.test`
   - Password: ตั้งเอง (ใช้รหัสเดียวกันทุกบัญชีได้) แล้วแจ้งเพื่อนในทีมทางช่องทางส่วนตัว
   - ✅ ติ๊ก **Auto Confirm User** (ไม่ติ๊กจะล็อกอินไม่ได้)
2. SQL Editor → รัน [`supabase/seed_profiles.sql`](../supabase/seed_profiles.sql) — ผูกบัญชีเข้ากับตาราง `profiles` (ตำแหน่ง + ชื่อ)
   ผลตรวจท้ายไฟล์ต้องได้ **5 แถว** ครบทุกตำแหน่ง
3. (ไม่บังคับ) ตั้ง Staff PIN: เอา `--` ออกจากคำสั่ง `UPDATE ... pin_hash` ในไฟล์เดียวกัน แล้วรันซ้ำ

### 2.2 สร้างบัญชีทดสอบ — วิธี B: สคริปต์ (ต้องมี Service Role Key)

ใส่ค่าใน `.env.local` (ดูตัวอย่างใน [`.env.example`](../.env.example); ไฟล์นี้ถูก gitignore ไว้แล้ว ห้าม commit):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
# Project Settings > API Keys > Secret key (sb_secret_...) หรือ Legacy "service_role" — ต้องลบ # ด้านหน้าออก
SUPABASE_SERVICE_ROLE_KEY=<secret key>
# รหัสผ่านร่วมของบัญชีทดสอบ ตั้งเองได้ อย่างน้อย 8 ตัวอักษร
SEED_PASSWORD=<รหัสผ่าน>

# (ไม่บังคับ) Staff PIN ตัวเลข 4-6 หลัก ซ้ำกันได้ — เว้นว่าง = ไม่ตั้ง PIN
SEED_PIN_ADMIN=
SEED_PIN_MANAGER=
SEED_PIN_CASHIER=
SEED_PIN_STAFF=
SEED_PIN_KITCHEN=
```

แล้วรัน (ต้องใช้ Node.js 20.12+):

```bash
node scripts/seed-users.mjs
```

> [!CAUTION]
> Service Role Key / Secret key ข้าม RLS ได้ทั้งหมด — ห้ามส่งในแชตกลุ่ม ห้าม commit และห้ามใช้ในโค้ดฝั่ง Browser

### 2.3 ตรวจผล

ผลลัพธ์สุดท้ายของ `seed_demo.sql` เป็นตารางสรุปให้ตรวจทันที:

| check_item | ค่าที่ถูกต้อง |
|---|---|
| โต๊ะ occupied | `T01,T02,T03` |
| Session (active/billed/closed) | `2 / 1 / 15` |
| order_items (pending/cooking/served/cancelled) | `3 / 3 / 66 / 2` |
| บิล T03 | `1654.00 / VAT 108.21 / unpaid` |
| วัตถุดิบต่ำกว่าเกณฑ์ | `ผักบุ้ง 0/1000, กุ้งขาว 1900/2500` |

ตรวจภายหลัง (ใครในทีมก็รันได้) — นับจำนวนแถวแต่ละตาราง:

```sql
select 'profiles' as table_name, count(*) as rows from profiles
union all select 'dining_tables', count(*) from dining_tables
union all select 'menu_items', count(*) from menu_items
union all select 'ingredients', count(*) from ingredients
union all select 'queues', count(*) from queues
union all select 'sessions', count(*) from sessions
union all select 'order_items', count(*) from order_items
union all select 'bills', count(*) from bills
union all select 'payments', count(*) from payments
union all select 'service_requests', count(*) from service_requests
union all select 'stock_counts', count(*) from stock_counts
union all select 'audit_logs', count(*) from audit_logs;
```

ค่าที่ควรได้: profiles 5, dining_tables 8, menu_items 11, ingredients 12, queues 3, sessions 18, order_items 74, bills 16, payments 16, service_requests 2, stock_counts 1, audit_logs 5
(dining_tables / menu_items อาจมากกว่านี้ถ้ามีข้อมูลที่ทีมใส่ไว้ก่อน)

> [!NOTE]
> - seed ทั้งสองไฟล์ทำงานได้ทั้งก่อนและหลังรัน `002_v18_fixes.sql` (ถ้ารัน 002 แล้ว Trigger จะคืนสต็อกตอนยกเลิกรายการให้เอง และ seed จะไม่คืนซ้ำ)
> - ถ้ารัน `seed_demo.sql` ก่อนสร้างบัญชีครบ 5 ตำแหน่ง ไฟล์จะหยุดพร้อมข้อความ "ไม่พบผู้ใช้ตำแหน่ง ..." และไม่มีข้อมูลใดถูกลบ
> - ใช้ฐานข้อมูลร่วมกัน: ถ้าใครรัน `seed_demo.sql` ข้อมูลทดสอบของทุกคนถูกรีเซ็ตพร้อมกัน — บอกทีมก่อนรัน

### 2.4 ข้อตกลงสำหรับคนเขียนโค้ด (ผลจาก migration 002-007)

- Server Action ที่เปลี่ยนสถานะอาหารเป็น `cooking` ต้องใช้ Supabase client ที่มี session ของพนักงาน (`src/lib/supabase/server.js`) — **ห้ามใช้ admin/service role** เพราะ Trigger ตัดสต็อกต้องรู้ว่าใครกด (ถ้าไม่มีจะ error)
- `payments.amount_paid` = ยอดที่หักจากบิล (ไม่ใช่เงินสดที่ลูกค้ายื่น) และเปลี่ยนบิลเป็น `paid` ได้เมื่อผลรวมการชำระเท่ากับ `total_amount` เท่านั้น
- ลูกค้าอ่านเมนูได้ทุกสถานะ — หน้าลูกค้าต้องแสดง "หมด" เอง และ Server Action รับออเดอร์ต้องตรวจซ้ำว่าเมนู `available`
- ออกบัตรคิวต้องส่ง `adult_count`, `child_count` และ `guest_count` (= ผลรวม) ครบทั้ง 3 ค่า ถ้าไม่ตรงกันฐานข้อมูลจะไม่รับ
- **ห้ามใช้ `.select('*')` กับตาราง `profiles`** — ต้องระบุคอลัมน์ เช่น `.select('id, full_name, role, is_active')` (migration 004 ซ่อน `pin_hash` ถ้าใช้ `*` จะได้ error "permission denied")
- **Server Component ที่ดึงข้อมูลด้วย Supabase ต้อง `await connection()` (จาก `next/server`) ก่อนเรียก Supabase** — Supabase เช็คอายุ token ด้วย `Date.now()` ซึ่ง `cacheComponents` ไม่ยอมให้เรียกตอนเตรียมหน้าล่วงหน้า จะขึ้น error "Next.js encountered the unstable value Date.now()" (ตัวอย่าง: `src/app/(pos)/tables/data.js` · Server Action ไม่ต้องใส่)
- งานโต๊ะ/รอบบริการ **ต้องเรียกผ่านฟังก์ชัน** `supabase.rpc('fn_open_table' | 'fn_move_table' | 'fn_mark_table_cleaned' | 'fn_set_table_disabled' | 'fn_start_closing' | 'fn_record_leftover' | 'fn_issue_qr_token', …)` ห้ามแก้ตาราง `sessions` / `session_tables` / `dining_tables` ตรงๆ — ฟังก์ชันตรวจตำแหน่งและทำทุกขั้นใน Transaction เดียว (error เป็นภาษาไทย แสดงบนหน้าจอได้เลย)
- บันทึก `audit_logs` ได้เฉพาะในนามตัวเอง (`actor_id` = ผู้ล็อกอิน) และ **ห้ามต่อ `.select()`** หลัง insert (พนักงานทั่วไปอ่าน log ไม่ได้ จะ error)
- งานคิวเรียกผ่าน `supabase.rpc('fn_issue_queue' | 'fn_update_queue_status', …)` — เลขคิวสร้างในฐานข้อมูล ห้าม insert ตาราง `queues` เอง
- งานสต็อกของ Staff เรียกผ่าน `supabase.rpc('fn_ingredients_for_count' | 'fn_today_stock_count_rounds' | 'fn_submit_stock_count' | 'fn_record_stock_movement', …)` และ Manager อนุมัติผ่าน `fn_review_stock_count` — **ห้ามให้หน้า Staff อ่าน `ingredients.current_stock` / `stock_count_items.system_stock`** (นับแบบไม่เห็นยอด)
- ยกเลิกรายการอาหาร: แค่อัปเดต `order_items.status = 'cancelled'` พร้อม `cancelled_by`, `cancelled_reason` — Trigger คืนสต็อกให้เอง ห้ามแก้ `ingredients` / `stock_movements` ใน Server Action
- คิดเงินเรียกผ่าน `supabase.rpc('fn_create_bill' | 'fn_apply_discount' | 'fn_pay_bill', …)` — ยอดเงินทั้งหมดคำนวณในฐานข้อมูล ห้าม insert/update `bills` `bill_items` `payments` เอง
- ข้อมูลร้านบนใบเสร็จอยู่ใน `app_settings` คีย์ `store_name`, `store_branch`, `store_address`, `store_tax_id`, `store_phone` (seed เป็นค่าตัวอย่าง)
- ออกใบกำกับภาษี **ไม่ต้องส่ง** `invoice_number` — Trigger สร้างเลข `TAX-YYYYMMDD-NNNN` ให้เอง (เริ่ม 0001 ใหม่ทุกวัน ตามเวลาไทย)
- หน้าลูกค้า `/order/*` **ห้ามอ่าน/เขียน `orders` `order_items` ตรง** (migration 025 ปิด RLS แล้ว) — เรียก `supabase.rpc('fn_customer_get_session' | 'fn_customer_get_menu' | 'fn_customer_place_order' | 'fn_customer_get_orders' | 'fn_customer_get_service_requests' | 'fn_customer_create_service_request', { p_token_hash, … })` · anon อ่าน/เขียน `service_requests` ตรงไม่ได้แล้วด้วย (migration 027) โดยใช้ `getCustomerTokenHash()` / `getCustomerSession()` จาก `src/lib/customer-session.js` · ลูกค้ารับ Realtime ของ `order_items` ไม่ได้แล้ว (หน้า `/status` ดึงผ่าน `fn_customer_get_orders` ซ้ำทุก 10 วินาทีด้วย `usePeriodicRefresh`)

## 3. วิธีรีเซ็ตเมื่อทดสอบจนข้อมูลเละ

| ต้องการ | ทำอย่างไร |
|---|---|
| รีเซ็ตข้อมูลการใช้งาน (Session/ออเดอร์/บิล/คิว/สต็อก) | รัน `supabase/seed_demo.sql` ซ้ำ — สต็อกวัตถุดิบจะถูกรีเซ็ตเป็นค่าตั้งต้นก่อนตัดใหม่ |
| รีเซ็ตเมนู/ราคา/สถานะเมนูที่ถูกแก้ระหว่างทดสอบ | รัน `supabase/seed_master.sql` แล้ว **ตามด้วย** `supabase/seed_demo.sql` |
| สร้างบัญชีที่ถูกลบไปคืน / แก้ role ใน profiles ให้ถูก | วิธี A: สร้างบัญชีใน Dashboard แล้วรัน `supabase/seed_profiles.sql` ซ้ำ / วิธี B: รัน `node scripts/seed-users.mjs` ซ้ำ |

## 4. บัญชีทดสอบ

รหัสผ่าน = รหัสที่ตั้งตอนสร้างบัญชีใน Dashboard (วิธี A) หรือค่า `SEED_PASSWORD` (วิธี B) — ขอจากคนที่สร้างบัญชีทางช่องทางส่วนตัว

| อีเมล | ตำแหน่ง (`role`) | ชื่อ (`full_name`) | ใช้ทดสอบหน้า |
|---|---|---|---|
| `admin@kuro.test` | `admin` | สมชาย ใจดี (ผู้ดูแลระบบ) | ทุกหน้า โดยเฉพาะ `/packages`, `/staff`, `/settings`, `/audit-logs` |
| `manager@kuro.test` | `manager` | สมหญิง รักร้าน (ผู้จัดการ) | `/menu`, `/inventory` (อนุมัติผลนับ + สรุปสต็อก + กราฟ), `/reports`, `/audit-logs` |
| `cashier@kuro.test` | `cashier` | มานี มีเงิน (แคชเชียร์) | `/queues`, `/tables`, `/billing`, `/billing/tax-invoice` |
| `staff@kuro.test` | `staff` | มานะ ขยันดี (พนักงานบริการ) | `/tables`, `/service-requests`, `/stock-count` (นับสต็อกเช้า-เย็น, รับของเข้า, ของเสีย) |
| `kitchen@kuro.test` | `kitchen` | ชูใจ ทำอร่อย (ครัว) | `/kds`, `/stock-override` |

## 5. Token ทดสอบฝั่งลูกค้า (ไม่ต้องล็อกอิน)

ฐานข้อมูลเก็บเฉพาะ `token_hash = SHA-256 (hex)` ของ token จริงด้านล่าง (`encode(digest(token, 'sha256'), 'hex')`), `expires_at = NULL`, `is_revoked = false`

| โต๊ะ | Session | สถานะ | Token จริง | URL ฝั่งลูกค้า (AGENTS.md 4.1) |
|---|---|---|---|---|
| T01 | `a2000000-0000-4000-8000-000000000001` | `active` เหลือ ~90 นาที | `demo-token-t01` | `/order/T01?t=demo-token-t01` |
| T02 | `a2000000-0000-4000-8000-000000000002` | `active` เหลือ ~5 นาที | `demo-token-t02` | `/order/T02?t=demo-token-t02` |
| T03 | `a2000000-0000-4000-8000-000000000003` | `billed` (หมดเวลาแล้ว) | `demo-token-t03` | `/order/T03?t=demo-token-t03` |

**ขั้นตอนเมื่อลูกค้าสแกน QR (แนวทางที่ตกลงกันแล้ว — แอปต้องทำตามนี้ในงาน T-05):**
1. QR พาไปที่ `/order/T01?t=<token>`
2. เซิร์ฟเวอร์ hash token ด้วย SHA-256 แล้วหาใน `qr_access_tokens` (ต้อง `is_revoked = false` และ Session ยังไม่ `closed`)
3. ถ้าผ่าน: เก็บ token ไว้ใน cookie แบบ httpOnly แล้ว redirect ไปที่ `/order/T01` (แถบ URL ไม่มี token)
4. หน้าย่อย `/order/T01/status`, `/call-staff`, `/summary` อ่าน token จาก cookie ไม่ต้องมี `?t=`

ไม่ได้เก็บรหัสเครื่องของลูกค้าในฐานข้อมูล (ไม่ต้องแก้ schema)

### หน้าดูคิวของลูกค้า `/queue/[queueId]`

| เลขคิว | สถานะ | ผู้ใหญ่ + เด็ก / ขนาดโต๊ะ | URL |
|---|---|---|---|
| `C001` | `waiting` | 4 + 2 / large | `/queue/a1000000-0000-4000-8000-000000000003` |
| `A001` | `called` | 2 + 0 / small | `/queue/a1000000-0000-4000-8000-000000000002` |
| `B001` | `seated` | 2 + 1 / medium | `/queue/a1000000-0000-4000-8000-000000000001` |

## 6. ข้อมูลที่ seed ไว้ และใช้ทดสอบหน้าไหน

### 6.1 ข้อมูลหลัก (`seed_master.sql`)

| ข้อมูล | รายละเอียด | ใช้ทดสอบ |
|---|---|---|
| `app_settings` | `vat_rate_percent = 7`, `penalty_rate_per_100g = 100` | `/settings`, `/packages`, `/billing` |
| `packages` | บุฟเฟต์ชาบูมาตรฐาน: ผู้ใหญ่ 299 / เด็ก (<120 ซม.) 149 / 90 นาที (ราคาตัวอย่าง) | `/packages`, เปิดโต๊ะใน `/tables` |
| `dining_tables` | T01-T08 ความจุ 2,2,4,4,4,6,6,8 | `/tables`, `/queues` (จับคู่ขนาดโต๊ะ) |
| `categories` | เนื้อสัตว์และอาหารทะเล / ผักและเห็ด / ลูกชิ้นและของทานเล่น | `/menu`, `/order/[tableNumber]` |
| `menu_items` (11) | สถานี fresh / grill / hot_kitchen (**ไม่มีเมนูเครื่องดื่ม** — ลูกค้าหยิบเครื่องดื่มเอง); **เกี๊ยวกุ้งทอด = `manual_off`** (หม้อทอดชำรุด), **ผักบุ้ง = `out_of_stock`**, **เนื้อวากิว = สั่งเพิ่ม 159 บาท** | `/menu`, `/stock-override`, หน้าลูกค้า (สถานะ "หมด"), `/kds` แยกสถานี |
| `menu_item_options` | กลุ่ม "น้ำจิ้ม" (เนื้อวัวสไลซ์) และ "ระดับความเผ็ด" (หมูสามชั้นย่าง) | หน้าสั่งอาหาร, การ์ด KDS |
| `ingredients` (12, หน่วย g) | **กุ้งขาว** 2,600/เกณฑ์ 2,500 (หลัง seed_demo เหลือ 1,900 → ต่ำกว่าเกณฑ์), **ผักบุ้ง** 0 (หมด → เมนู out_of_stock), **ผงชาไทย** 3,000 (เครื่องดื่มบริการตนเอง: มีในสต็อกแต่ไม่มีเมนูให้สั่ง) | `/inventory` แจ้งเตือนสต็อกต่ำ |
| `menu_ingredients`, `package_menu_items`, `usage_rates` | BOM ต่อจาน, เมนูในบุฟเฟต์ (ทุกเมนูยกเว้นวากิว), อัตราใช้ต่อหัว | `/menu` (สูตร BOM), ตัดสต็อกเมื่อ cooking |

### 6.2 ข้อมูลจำลอง (`seed_demo.sql`)

| ข้อมูล | รายละเอียด | ใช้ทดสอบ / ใคร |
|---|---|---|
| **Session A — T01** | `active` ผู้ใหญ่ 2 เด็ก 1 เพิ่งเปิด; ออเดอร์ 2 รอบ: served 3, cooking 1 (หมูสามชั้น+เผ็ดน้อย), pending 2 (ลูกชิ้น, เต้าหู้ปลาทอด), cancelled 1 (กุ้ง ยกเลิกจาก pending โดย Staff) | ลูกค้า: สั่งอาหาร/สถานะ/สรุป · ครัว: `/kds` · Cashier/Staff: `/tables` |
| **Session B — T02** | `active` ผู้ใหญ่ 4 **หมดเวลาในอีก 5 นาที**; รอบ 2 สั่งมา 20 นาที: cooking 2, pending 1, cancelled 1 (หมูสามชั้นย่าง ยกเลิกระหว่าง cooking → คืนสต็อก `cancel_return`) | ตัวจับเวลา/ล็อกสั่งเมื่อหมดเวลา, สีเตือนรอนานใน KDS |
| **Session C — T03** | `billed` ผู้ใหญ่ 3 เด็ก 2; ชั่งเนื้อเหลือ 250 g → ค่าปรับ 300; บิล `unpaid` = 1,195 + วากิว 159 + 300 = **1,654.00** (VAT ถอดใน 108.21) พร้อม `bill_items` 4 บรรทัด | Cashier: `/billing`, `/billing/tax-invoice` (รับชำระ, Split, ใบกำกับภาษี) |
| `queues` | C001 waiting, A001 called, B001 seated | Cashier: `/queues` · ลูกค้า: `/queue/[queueId]` |
| `service_requests` | T01 ขอน้ำ (`pending`), T02 ขอเปลี่ยนหม้อ (`completed` โดย Staff) | Staff: `/service-requests` · ลูกค้า: `/order/T01/call-staff` |
| `stock_counts` | 1 รอบ `pending_review` (ผู้ตรวจนับ = manager) ผลต่าง: หมูสันคอ −150, เนื้อวัว −80, ผักกาดขาว +200, เห็ด 0 | Manager: `/inventory` (หน้าอนุมัติปรับยอด) |
| ประวัติ 7 วัน | Session `closed` 15 รอบ (7 วันก่อน 3 รอบ, วันอื่นวันละ 2 รอบ เวลาไทย 11:30/18:00/20:15) บิล `paid` ทุกใบ ชำระ cash / promptpay / credit_card; **1 บิลแบ่งจ่าย** (เงินสด 500 + PromptPay); 4 บิลมีค่าปรับเนื้อเหลือ; 1 บิลมีส่วนลด 100 บาท; 3 บิลมีวากิวสั่งเพิ่ม | Manager/Admin: `/reports` (ยอดขายรายวัน, เมนูขายดี, จำนวนลูกค้า) |
| `stock_movements` | สร้างโดย Trigger ตัดสต็อกจริงทุกจานที่ผ่าน cooking (เวลาถูกย้อนให้ตรงกับเวลาออเดอร์) + `cancel_return` 1 รายการ | Manager: `/inventory` (Ledger) |
| `audit_logs` (5) | MANUAL_OFF_MENU, OPEN_SESSION, CANCEL_ORDER_ITEM ×2, APPROVE_DISCOUNT | Admin/Manager: `/audit-logs` |

## 7. หมายเหตุทางเทคนิค

- **รูปแบบ UUID คงที่:** 8 หลักแรกบอกตาราง (เช่น `a2…` = sessions, `a8…` = bills) ดูรายการเต็มที่หัวไฟล์ SQL; Session ประวัติใช้เลขท้าย `…101` ถึง `…115`
- **จำลองผู้ใช้ครัวตอนตัดสต็อก:** Trigger `fn_deduct_stock_on_cooking` ใช้ `auth.uid()` เป็น `created_by` ซึ่งเป็น NULL ใน SQL Editor; `seed_demo.sql` จึงตั้ง `request.jwt.claim.sub` แบบ `LOCAL` (หมดผลเมื่อจบ Transaction) ให้เป็นผู้ใช้ `kitchen`
- **สต็อกตั้งต้นอยู่ 2 ที่:** `seed_master.sql` ข้อ 5 และส่วนรีเซ็ตสต็อกใน `seed_demo.sql` ขั้นที่ 2 — ถ้าแก้ต้องแก้ทั้งสองที่ให้ตรงกัน
- **เวลา:** ประวัติ 7 วันคำนวณตามเวลาไทย (`Asia/Bangkok`); Session ปัจจุบันอิงจาก `now()` ขณะรัน — ถ้าทิ้งไว้นาน B จะหมดเวลา (สถานะยังเป็น `active` จนกว่าแอปจะเปลี่ยน) ให้รัน `seed_demo.sql` ซ้ำเพื่อเริ่มใหม่
