[README](../../README.md) • [SRS v1.8](../01-requirements/SRS.md) • [Data Dictionary](../02-database/data_dictionary.md) • [Audit Matrix](audit_matrix.md) • [Agent Blueprint](../../AGENTS.md)

---

# KURO POS — Audit Matrix & Security Controls
> **เมทริกซ์การตรวจสอบย้อนหลัง (Audit Trail) และการควบคุมสิทธิ์ความปลอดภัย**  
> **โมเดลธุรกิจ:** ร้านบุฟเฟต์ชาบู (สุกี้ตี๋น้อย Model) | **Version:** 1.8 | **Date:** 12 พฤศจิกายน 2026

---

## สารบัญส่วนต่างๆ (Document Sections)
1. [ส่วนที่ 1: ตารางบันทึก Audit Trail (Audit Event Matrix)](#ส่วนที่-1--ตารางบันทึก-audit-trail)
2. [ส่วนที่ 2: เมทริกซ์สิทธิ์การเข้าถึงข้อมูล (Supabase RLS Matrix)](#ส่วนที่-2--เมทริกซ์สิทธิ์การเข้าถึงข้อมูล)
3. [ส่วนที่ 3: กฎความถูกต้องของข้อมูลและ Triggers (Data Integrity Matrix)](#ส่วนที่-3--กฎความถูกต้องของข้อมูลและ-triggers)
4. [ส่วนที่ 4: สรุปการปรับปรุงตามข้อกำหนด UX/UI v1.8 (UX/UI Alignment)](#ส่วนที่-4--สรุปการปรับปรุงตามข้อกำหนด-uxui-v18)

---

## ส่วนที่ 1 — ตารางบันทึก Audit Trail

ทุกธุรกรรมสำคัญต้องบันทึกประวัติลงตาราง `audit_logs` เพื่อให้ตรวจสอบย้อนหลังได้ (NFR-005, NFR-022):

| เหตุการณ์ (Event) | Action Name | ผู้กระทำ (Actor) | ตารางเป้าหมาย (Target) | บังคับระบุเหตุผล (Reason) | ข้อมูลใน Payload |
|---|---|---|---|:---:|---|
| **เปิดโต๊ะ/รอบบริการ** | `OPEN_SESSION` | Cashier / Manager / Admin | `sessions` | ไม่ | Snapshot จำนวนลูกค้า, ราคาต่อหัว, เวลาเริ่ม |
| **ย้ายโต๊ะ** | `TRANSFER_TABLE` | Cashier / Staff | `session_tables` | ใช่ | โต๊ะต้นทาง, โต๊ะปลายทาง, รอบบริการ |
| **รวมโต๊ะ (Merge)** | `MERGE_TABLES` | Cashier / Staff | `session_tables` | ใช่ | โต๊ะหลัก, โต๊ะที่นำมารวม |
| **แยกโต๊ะ (Split)** | `SPLIT_TABLES` | Cashier / Staff | `session_tables` | ใช่ | โต๊ะที่แยกออก, รายการแยก |
| **ยกเลิกออเดอร์** | `CANCEL_ORDER_ITEM` | Staff / Kitchen / Manager | `order_items` | **ใช่** | รายการ, จำนวน, สถานะขณะยกเลิก |
| **Override ปิดเมนู** | `MANUAL_OFF_MENU` | Kitchen / Manager / Admin | `menu_items` | ใช่ | เมนูที่ปิด, เหตุผลของหมดจริง, สถานะก่อน/หลัง |
| **ส่งผลนับสต็อก** | `SUBMIT_STOCK_COUNT` | Staff / Manager / Admin | `stock_counts` | ไม่ | รอบ (เช้า/เย็น), วันที่, จำนวนรายการ, จำนวนที่ต่างเกิน 10% |
| **ปฏิเสธผลนับสต็อก** | `REJECT_STOCK_COUNT` | Manager (Admin Emergency) | `stock_counts` | **ใช่** | สถานะก่อน/หลัง, รอบการนับ |
| **ให้ส่วนลด** | `APPROVE_DISCOUNT` | Cashier / Manager / Admin | `bills` | **ใช่** | ยอดเงินก่อนลด, จำนวนเงินส่วนลด, ยอดสุทธิ |
| **ชั่งเนื้อสัตว์เหลือ** | `RECORD_LEFTOVER` | Staff | `leftover_records` | ไม่ | น้ำหนักเป็นกรัม, ค่าปรับที่คำนวณได้ |
| **ปรับยอดสต็อก** (อนุมัติผลนับ) | `ADJUST_STOCK_COUNT` | Manager (Admin Emergency) | `stock_counts` | Admin **ใช่** | ยอดระบบ, ยอดนับจริง, ผลต่าง (ปรับยอดตามผลต่าง) |
| **แก้ราคาบุฟเฟต์ / VAT** | `UPDATE_PACKAGE` | Admin | `packages` (+ `app_settings.vat_rate_percent`) | ไม่ | เฉพาะค่าที่เปลี่ยน ก่อน/หลัง (ชื่อ, ราคาผู้ใหญ่/เด็ก, เวลา, VAT) |
| **เพิ่มพนักงาน** | `CREATE_STAFF` | Admin | `profiles` | ไม่ | ชื่อ, อีเมล, ตำแหน่ง, มี PIN หรือไม่ (ไม่เก็บรหัสผ่าน/PIN) |
| **แก้ข้อมูลพนักงาน** | `UPDATE_STAFF` | Admin | `profiles` | ไม่ | ชื่อ/ตำแหน่ง/สถานะเปิดใช้งาน ก่อน/หลัง หรือ "ตั้งรหัสผ่านใหม่" / "ตั้ง PIN ใหม่" / "ล้าง PIN" |
| **Emergency Override** | `EMERGENCY_OVERRIDE` | Admin | Any (เช่น `ingredients` ปรับยอดฉุกเฉิน, `stock_counts` อนุมัติแทน) | **ใช่** | เหตุจำเป็นที่ต้องทำแทน Manager, ยอดก่อน/หลัง |

---

## ส่วนที่ 2 — เมทริกซ์สิทธิ์การเข้าถึงข้อมูล (Supabase RLS Matrix ฉบับปรับปรุง)

> ร่างตามมติการตัดสินใจสถาปัตยกรรม v1.8 (18 พฤศจิกายน 2026) เพื่อควบคุมความปลอดภัยผ่าน Supabase RLS และ Route Protection:

| ลำดับ | ฟังก์ชัน | ตำแหน่งที่เข้าถึงได้ | หมายเหตุ |
|:---:|---|---|---|
| 1 | **จัดการพนักงานและสิทธิ์** | `Admin` | |
| 2 | **ตั้งราคา / แพ็กเกจ / VAT** | `Admin` | ไม่มี Service Charge |
| 3 | **ตั้งค่าร้าน** | `Admin` | |
| 4 | **ออกบัตรคิว / เรียกคิว** | `Cashier`, `Manager`, `Admin` | *Staff ทำไม่ได้* |
| 5 | **เปิดโต๊ะ / เริ่มรอบ** | `Cashier`, `Manager`, `Admin` | |
| 6 | **ย้าย / รวม / แยกโต๊ะ** | `Cashier`, `Staff`, `Manager`, `Admin` | |
| 7 | **ยืนยันทำความสะอาดโต๊ะเสร็จ** | `Staff`, `Manager`, `Admin` | |
| 8 | **สั่งอาหาร** | `Customer` (ผ่าน QR โต๊ะ) | ลูกค้าสั่งเองอย่างเดียว การรับแทนอยู่ใน Phase 2 |
| 9 | **KDS / ปรับสถานะอาหาร** | `Kitchen`, `Manager`, `Admin` | |
| 10 | **Override ปิดเมนู** | `Kitchen`, `Manager`, `Admin` | |
| 11 | **จัดการเมนู / สต็อก** | `Manager`, `Admin` | |
| 12 | **ชั่งเนื้อเหลือ** | `Staff`, `Manager`, `Admin` | |
| 13 | **รับแจ้งเรียกพนักงาน** | `Staff`, `Manager`, `Admin` | |
| 14 | **คิดเงิน / รับชำระ / ใบกำกับภาษี** | `Cashier`, `Manager`, `Admin` | |
| 15 | **กรอกส่วนลด** | `Cashier`, `Manager`, `Admin` | ต้องระบุเหตุผลและบันทึก Audit |
| 16 | **ตรวจนับสต็อกเช้า-เย็น / รับของเข้า / ของเสีย** | `Staff`, `Manager`, `Admin` | ผ่านฟังก์ชัน SECURITY DEFINER เท่านั้น — Staff ไม่เห็นยอดในระบบ (migration 022) |
| 16.1 | **อนุมัติ / ปฏิเสธผลนับและปรับยอด** | `Manager` | Admin เฉพาะ Emergency พร้อมเหตุผล |
| 16.2 | **อ่านรอบบริการ / การผูกโต๊ะ (หาเลขโต๊ะบนจอครัว)** | `Kitchen` (อ่านอย่างเดียว) | migration 023 |
| 17 | **ดูรายงานยอดขาย** | `Manager`, `Admin` | |
| 18 | **ดู Audit Log** | `Admin` (เต็มสิทธิ์), `Manager` (ตามสิทธิ์) | Manager ไม่เห็นรายการที่ Admin เป็นผู้ทำ (RLS migration 024) |
| 19 | **แก้สูตร BOM / เพิ่ม-แก้วัตถุดิบ** | `Manager`, `Admin` | ยอดคงเหลือแก้ตรงไม่ได้ (migration 024) |
| 20 | **เพิ่ม/แก้หมวดหมู่เมนู** | `Manager`, `Admin` | policy `manager_manage_categories` (migration 025) |
| 21 | **อัปโหลด/ลบรูปเมนู** | `Manager`, `Admin` | Storage bucket `menu-images` — ทุกคน (รวมลูกค้า) ดูรูปได้ (migration 025) |
| 10.1 | **เปิด/ปิดเมนูด้วยมือ (ทางเทคนิค)** | `Kitchen`, `Manager`, `Admin` | ผ่าน `fn_set_menu_availability` เท่านั้น (migration 028) — ครัวไม่มีสิทธิ์แก้ตาราง `menu_items` ตรง |
| 14.1 | **อ่านออเดอร์ / รายการอาหาร** | พนักงานทุกตำแหน่งที่ล็อกอิน | migration 028 — คนไม่ล็อกอินอ่าน/เพิ่มตรงไม่ได้ · ลูกค้ายังสั่งผ่าน QR ได้ แต่หน้าลูกค้าต้องตรวจ QR token ที่เซิร์ฟเวอร์ก่อน (SEED.md ข้อ 5: ฟังก์ชัน SECURITY DEFINER หรือ Server Action + `createAdminClient()`) · พนักงานแก้ได้เฉพาะ `status` และข้อมูลการยกเลิก |
| 21.1 | **อ่านตัวเลือกเมนู / ตัวเลือกที่ลูกค้าเลือก** | พนักงานทุกตำแหน่งที่ล็อกอิน (อ่านอย่างเดียว) | migration 027 — จอครัวต้องเห็น "เผ็ดน้อย" ฯลฯ · แก้ไขยังเป็น Admin |
| 22 | **สร้างบัญชี / ตั้งรหัสผ่าน / ตั้ง PIN** | `Admin` | ทำฝั่งเซิร์ฟเวอร์ด้วย Service Role Key เท่านั้น — `pin_hash` ไม่ถูกส่งไปหน้าเว็บ |

> **หมายเหตุสำหรับลูกค้า:** ลูกค้า (ไม่ต้องล็อกอิน) ดูคิวตัวเอง ดูสถานะอาหารของโต๊ะตัวเอง และเรียกพนักงานได้เท่านั้น

---

## ส่วนที่ 3 — กฎความถูกต้องของข้อมูลและ Triggers

ระบบควบคุมความถูกต้องของข้อมูลระดับลึกผ่าน PostgreSQL Triggers และ Constraints:

| กลไกความปลอดภัย (Constraint / Trigger) | ตารางที่บังคับใช้ | วัตถุประสงค์และการป้องกัน |
|---|---|---|
| `fn_protect_session_snapshot` | `sessions` | ล็อก Snapshot จำนวนลูกค้าและราคาต่อหัวทันทีเมื่อ Session เปลี่ยนเป็น `active` ห้ามแก้ไขย้อนหลังโดยเด็ดขาด |
| `fn_calc_bill_vat` | `bills` | คำนวณ VAT 7% ถอดใน (`ROUND(total_amount * 7.0 / 107.0, 2)`) อัตโนมัติทุกครั้งที่ยอดเงินเปลี่ยน (ไม่มี Service Charge) |
| `fn_revoke_qr_on_session_close` | `qr_access_tokens` | เพิกถอน Token (`is_revoked = true`) ทันทีเมื่อ Session เปลี่ยนสถานะเป็น `closed` เท่านั้น |
| `unique_order_item_consumption` | `stock_movements` | Partial Unique Index ป้องกันการตัดสต็อกซ้ำซ้อนสำหรับจานอาหารเดียวกัน (Idempotency) |
| `unique_active_session_per_table` | `session_tables` | รับประกันว่า 1 โต๊ะจะมีรอบบริการที่ Active ได้ไม่เกิน 1 รอบในเวลาเดียวกัน |
| `session_tables (Merge Support)` | `session_tables` | รองรับการรวมโต๊ะ (Merge Tables) โดย 1 รอบบริการสามารถมีหลายโต๊ะที่ Active ได้พร้อมกัน |
| `bills.session_id UNIQUE` | `bills` | รับประกันหลักการ 1 รอบบริการ มีได้เพียง 1 บิลเดี่ยวเท่านั้น (One Bill Principle) |
| `fn_return_stock_on_cancel` | `order_items` → `ingredients`, `stock_movements` | ยกเลิกรายการ `cooking` → คืนสต็อกตามยอดที่ตัดจริง (`cancel_return`) ต้องรู้ผู้ทำรายการเสมอ (migration 020 + 021) |
| `trg_ingredient_stock_menu_availability` / `trg_bom_menu_availability` | `ingredients`, `menu_ingredients` → `menu_items` | FR-024: วัตถุดิบไม่พอทำ 1 จาน → `out_of_stock` · เติมครบ → `available` (ไม่แตะ `manual_off`) |
| `idx_unique_stock_count_round` | `stock_counts` | 1 วันมีผลนับรอบเช้าและรอบเย็นได้อย่างละ 1 ครั้ง (ยกเว้นรอบที่ถูกปฏิเสธ นับใหม่ได้) |
| `payments (Split Payment)` | `payments` | ปลด UNIQUE บน `bill_id` เพื่อรองรับการชำระเงินหลายรายการต่อ 1 บิล โดยมี Trigger ตรวจสอบ `SUM(amount_paid) = bills.total_amount` |
| `profiles.pin_hash` | `profiles` | เข้ารหัส Staff PIN ด้วย bcrypt เพื่อความปลอดภัยสูงสุดในการล็อกอินหน้าร้าน |

---

## ส่วนที่ 4 — สรุปการปรับปรุงตามข้อกำหนด UX/UI v1.8

| หัวข้อ | ข้อกำหนดเดิม (v1.7) | ข้อกำหนดใหม่ v1.8 (Approved) | เอกสารที่เกี่ยวข้อง |
|---|---|---|---|
| **โมเดลธุรกิจ** | บุฟเฟต์ปิ้งย่างทั่วไป | บุฟเฟต์ชาบู ราคาเดียวต่อหัว รูปแบบเดียวกับสุกี้ตี๋น้อย | `README.md`, `AGENTS.md`, `SRS.md` |
| **PIN ฝั่งลูกค้า** | สแกน QR แล้วต้องกรอก PIN 6 หลัก | **ตัดระบบ PIN ฝั่งลูกค้าออก 100%** (สแกนแล้วสั่งได้ทันที) | `SRS.md`, `AGENTS.md`, `data_dictionary.md` |
| **สถานะอาหาร** | 6 สถานะ (submitted $\rightarrow$ accepted $\rightarrow$ cooking $\rightarrow$ ready $\rightarrow$ served) | **4 สถานะมาตรฐาน:** `pending` $\rightarrow$ `cooking` (ตัดสต็อก BOM) $\rightarrow$ `served` [หรือ `cancelled`] | `SRS.md`, `constants/index.js`, `AGENTS.md` |
| **สถานะโต๊ะ** | 3 สถานะ (available, occupied, cleaning) | **4 สถานะ:** `available`, `occupied`, `cleaning`, `disabled` (30 โต๊ะ) | `constants/index.js`, `SRS.md` |
| **ระบบคิว** | ยังไม่มีระบุ | **ระบบคิวหน้าร้านครบวงจร:** Cashier ออกบัตรคิวที่เคาน์เตอร์ + QR ดูคิวผ่านมือถือ | `SRS.md`, `data_dictionary.md` (`queues`) |
| **เรียกพนักงาน** | ไม่มีปุ่มด่วน | **ระบบเรียกพนักงานเรียลไทม์:** ปุ่มด่วน 5 แบบ + หน้าจอ Staff Realtime | `SRS.md`, `data_dictionary.md` (`service_requests`) |
| **จอครัว (KDS)** | หน้าจอรวม | **KDS แยก 4 สถานี:** ของสด, เครื่องดื่ม, ปิ้งย่าง, ครัวร้อน พร้อม Consolidated Prep To-Do List | `SRS.md`, `AGENTS.md` |
| **การบริหารโต๊ะ** | เปิด ปิด ย้าย | **เปิด (Cashier), ปิด, ย้าย, รวมโต๊ะ (Merge), แยกโต๊ะ (Split)** | `SRS.md`, `AGENTS.md` |
| **การเงิน/ภาษี** | ชำระเงินสด/PromptPay บิลเดี่ยว | **เงินสด, PromptPay, บัตรเครดิต, Split Payment, ใบกำกับภาษีเต็มรูป (ไม่มี Service Charge)** | `SRS.md`, `data_dictionary.md` (`tax_invoices`) |
| **การปรับปรุง 18 พ.ย. 2026** | ข้อกำหนดเบื้องต้น | **เกณฑ์เด็ก < 120 ซม., บทบาท Cashier ชัดเจน, ลูกค้าสั่งอาหารเอง 100% (staff_assist ย้ายไป Phase 2), 30 ตาราง 30 โต๊ะ** | ทุกไฟล์ Markdown |
