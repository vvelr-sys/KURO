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
| **เปิดโต๊ะ/รอบบริการ** | `OPEN_SESSION` | Staff | `sessions` | ไม่ | Snapshot จำนวนลูกค้า, ราคาต่อหัว, เวลาเริ่ม |
| **ย้ายโต๊ะ** | `TRANSFER_TABLE` | Staff | `session_tables` | ใช่ | โต๊ะต้นทาง, โต๊ะปลายทาง, รอบบริการ |
| **รวมโต๊ะ (Merge)** | `MERGE_TABLES` | Staff | `session_tables` | ใช่ | โต๊ะหลัก, โต๊ะที่นำมารวม |
| **แยกโต๊ะ (Split)** | `SPLIT_TABLES` | Staff | `session_tables` | ใช่ | โต๊ะที่แยกออก, รายการแยก |
| **ยกเลิกออเดอร์** | `CANCEL_ORDER_ITEM` | Staff / Kitchen / Manager | `order_items` | **ใช่** | รายการ, จำนวน, สถานะขณะยกเลิก |
| **Override ปิดเมนู** | `MANUAL_OFF_MENU` | Kitchen / Manager / Admin | `menu_items` | ใช่ | เมนูที่ปิด, เหตุผลของหมดจริง |
| **ให้ส่วนลด** | `APPROVE_DISCOUNT` | Cashier / Manager / Admin | `bills` | **ใช่** | ยอดเงินก่อนลด, จำนวนเงินส่วนลด, ยอดสุทธิ |
| **ชั่งเนื้อสัตว์เหลือ** | `RECORD_LEFTOVER` | Staff | `leftover_records` | ไม่ | น้ำหนักเป็นกรัม, ค่าปรับที่คำนวณได้ |
| **ปรับยอดสต็อก** | `ADJUST_STOCK_COUNT` | Manager (Admin Override) | `stock_counts` | **ใช่** | ยอดระบบ, ยอดนับจริง, ผลต่าง |
| **Emergency Override** | `EMERGENCY_OVERRIDE` | Admin | Any | **ใช่** | เหตุจำเป็นที่ต้องทำแทน Manager |

---

## ส่วนที่ 2 — เมทริกซ์สิทธิ์การเข้าถึงข้อมูล (RLS Matrix)

สิทธิ์การเข้าถึงข้อมูลตาม 5 บทบาทของระบบ (ควบคุมด้วย Supabase Row Level Security และ `fn_my_role()`):

| ฟังก์ชัน / ข้อมูล | Admin | Manager | Cashier | Kitchen | Staff | Customer (No Auth) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **จัดการผู้ใช้และสิทธิ์ร้าน** | ✅ เต็มสิทธิ์ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **เปิด/ปิด/ย้าย/รวม/แยกโต๊ะ** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **ออกบัตรคิว/เรียกคิว** | ✅ | ✅ | ✅ | ❌ | ✅ | ดูคิวตัวเองได้เท่านั้น |
| **สั่งอาหาร** | ✅ | ✅ | ❌ | ❌ | ✅ (รับแทน) | ✅ (ผ่าน QR โต๊ะ) |
| **ดูจอครัว KDS / ปรับสถานะ** | ✅ | ✅ | ❌ | ✅ เต็มสิทธิ์ | ❌ | ดูสถานะของตนเอง |
| **Override ปิดเมนูด้วยมือ** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **ชั่งน้ำหนักเนื้อสัตว์เหลือ** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **คิดเงิน/รับชำระ/ออกใบกำกับภาษี** | ✅ | ✅ | ✅ เต็มสิทธิ์ | ❌ | ❌ | ❌ |
| **กรอกส่วนลด** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **ตรวจนับสต็อกประจำวัน** | Emergency | ✅ หน้าที่หลัก | ❌ | ❌ | ❌ | ❌ |
| **อนุมัติปรับยอดสต็อก** | Emergency | ✅ หน้าที่หลัก | ❌ | ❌ | ❌ | ❌ |
| **ดูรายงานยอดขาย & Audit Log** | ✅ เต็มสิทธิ์ | ✅ ตามสิทธิ์ | ❌ | ❌ | ❌ | ❌ |

---

## ส่วนที่ 3 — กฎความถูกต้องของข้อมูลและ Triggers

ระบบควบคุมความถูกต้องของข้อมูลระดับลึกผ่าน PostgreSQL Triggers และ Constraints:

| กลไกความปลอดภัย (Constraint / Trigger) | ตารางที่บังคับใช้ | วัตถุประสงค์และการป้องกัน |
|---|---|---|
| `fn_protect_session_snapshot` | `sessions` | ล็อก Snapshot จำนวนลูกค้าและราคาต่อหัวทันทีเมื่อ Session เปลี่ยนเป็น `active` ห้ามแก้ไขย้อนหลังโดยเด็ดขาด |
| `fn_calc_bill_vat` | `bills` | คำนวณ VAT 7% ถอดใน (`ROUND(total_amount * 7.0 / 107.0, 2)`) อัตโนมัติทุกครั้งที่ยอดเงินเปลี่ยน |
| `fn_revoke_qr_on_session_close` | `qr_access_tokens` | เพิกถอน Token (`is_revoked = true`) ทันทีเมื่อ Session เปลี่ยนสถานะเป็น `closed` |
| `unique_order_item_consumption` | `stock_movements` | Partial Unique Index ป้องกันการตัดสต็อกซ้ำซ้อนสำหรับจานอาหารเดียวกัน (Idempotency) |
| `unique_active_session_per_table` | `session_tables` | รับประกันว่า 1 โต๊ะจะมีรอบบริการที่ Active ได้ไม่เกิน 1 รอบในเวลาเดียวกัน |
| `unique_active_table_per_session` | `session_tables` | รับประกันว่า 1 รอบบริการจะผูกกับโต๊ะที่ Active ได้ไม่เกิน 1 โต๊ะ (เว้นแต่รวมโต๊ะ) |
| `bills.session_id UNIQUE` | `bills` | รับประกันหลักการ 1 รอบบริการ มีได้เพียง 1 บิลเดี่ยวเท่านั้น (One Bill Principle) |

---

## ส่วนที่ 4 — สรุปการปรับปรุงตามข้อกำหนด UX/UI v1.8

| หัวข้อ | ข้อกำหนดเดิม (v1.7) | ข้อกำหนดใหม่ v1.8 (Approved) | เอกสารที่เกี่ยวข้อง |
|---|---|---|---|
| **โมเดลธุรกิจ** | บุฟเฟต์ปิ้งย่างทั่วไป | บุฟเฟต์ชาบู ราคาเดียวต่อหัว รูปแบบเดียวกับสุกี้ตี๋น้อย | `README.md`, `agent.md`, `SRS.md` |
| **PIN ฝั่งลูกค้า** | สแกน QR แล้วต้องกรอก PIN 6 หลัก | **ตัดระบบ PIN ฝั่งลูกค้าออก 100%** (สแกนแล้วสั่งได้ทันที) | `SRS.md`, `agent.md`, `data_dictionary.md` |
| **สถานะอาหาร** | 6 สถานะ (submitted $\rightarrow$ accepted $\rightarrow$ cooking $\rightarrow$ ready $\rightarrow$ served) | **4 สถานะมาตรฐาน:** `pending` $\rightarrow$ `cooking` (ตัดสต็อก BOM) $\rightarrow$ `served` [หรือ `cancelled`] | `SRS.md`, `constants/index.js`, `agent.md` |
| **สถานะโต๊ะ** | 3 สถานะ (available, occupied, cleaning) | **4 สถานะ:** `available`, `occupied`, `cleaning`, `disabled` | `constants/index.js`, `SRS.md` |
| **ระบบคิว** | ยังไม่มีระบุ | **ระบบคิวหน้าร้านครบวงจร:** ออกบัตรคิวที่เคาน์เตอร์ + QR ดูคิวผ่านมือถือ | `SRS.md`, `data_dictionary.md` (`queues`) |
| **เรียกพนักงาน** | ไม่มีปุ่มด่วน | **ระบบเรียกพนักงานเรียลไทม์:** ปุ่มด่วน 5 แบบ + หน้าจอ Staff Realtime | `SRS.md`, `data_dictionary.md` (`service_requests`) |
| **จอครัว (KDS)** | หน้าจอรวม | **KDS แยก 4 สถานี:** ของสด, เครื่องดื่ม, ปิ้งย่าง, ครัวร้อน พร้อมปุ่ม Override | `SRS.md`, `agent.md` |
| **การบริหารโต๊ะ** | เปิด ปิด ย้าย | **เปิด, ปิด, ย้าย, รวมโต๊ะ (Merge), แยกโต๊ะ (Split)** | `SRS.md`, `agent.md` |
| **การเงิน/ภาษี** | ชำระเงินสด/PromptPay บิลเดี่ยว | **เงินสด, PromptPay, บัตรเครดิต, Split Payment, ใบกำกับภาษีเต็มรูป** | `SRS.md`, `data_dictionary.md` (`tax_invoices`) |
