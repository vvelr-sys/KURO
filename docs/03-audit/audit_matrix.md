[🏠 หน้าหลัก (README)](../../README.md) • [📋 SRS (v1.7)](../01-requirements/SRS.md) • [🗃️ Data Dictionary](../02-database/data_dictionary.md) • [🛡️ Audit Matrix](audit_matrix.md) • [🏗️ Agent Blueprint](../../agent.md) • [💾 Database Schema](../../supabase/migrations/001_initial_schema.sql)

---

# 🛡️ KURO POS - Audit Matrix & Consistency Report
> **รายงานการตรวจสอบความสอดคล้องเชิงสถาปัตยกรรมและตารางบันทึก Audit Logs**  
> **เวอร์ชัน:** 1.7 (มติการแก้ไขข้อขัดแย้ง A1–A8, B9–B16 และ C สมบูรณ์ 100%)  
> **วันที่:** 11 พฤศจิกายน 2026

---

## 1. บทสรุปสำหรับผู้บริหารและทีมงาน (Executive Summary)

จากการตรวจสอบความสอดคล้องเชิงลึกของเอกสาร SRS v1.6 พบประเด็นสำคัญที่ต้องปรับปรุงก่อนเข้าสู่ขั้นตอนพัฒนาจริง 3 กลุ่มหลัก ได้แก่:
1. **หมวด A: ข้อขัดแย้งโดยตรง (Direct Inconsistencies) จำนวน 8 ข้อ** ที่ทำให้กฎทางธุรกิจและการทำงานขัดแย้งกันเอง
2. **หมวด B: ช่องว่างและความคลุมเครือ (Architectural Gaps & Ambiguities) จำนวน 8 ข้อ** ที่ยังขาดนิยามเชิงเทคนิค เช่น State Machine, Timers, และสิทธิ์การ Override
3. **หมวด C: งานเก็บรายละเอียดเอกสาร (Document Cleanup)** เช่น ข้อความซ้ำซ้อน และเลขเวอร์ชัน

ทีมงานได้ดำเนินการตัดสินใจทางเทคนิคและสถาปัตยกรรมระบบ (Architectural Decisions) และนำเข้าสู่เอกสาร **SRS v1.7** และ **Data Dictionary v1.7** ครบถ้วนทุกข้อแล้ว ดังมีรายละเอียดสรุปเปรียบเทียบในหัวข้อถัดไป

---

## 2. ตารางเปรียบเทียบการแก้ไข หมวด A: ข้อขัดแย้งโดยตรง (Direct Inconsistencies)

| ข้อ | ประเด็นปัญหาใน v1.6 | มติและการแก้ไขใน v1.7 (Resolution) | ส่วนที่ปรับปรุงใน SRS | ผลต่อ Database Schema |
|:---:|---|---|---|---|
| **A1** | **ใครจัดประเภทความสูง:**<br>BR-004/005 บอก "ระบบ" จัดประเภท แต่ OI-017/FR-008 บอก Staff วัดหน้างาน ระบบเก็บแค่จำนวน | ปรับให้ชัดเจนว่าเกณฑ์ความสูงเป็น **"เกณฑ์ที่ Staff ใช้ตรวจวัดหน้างาน"** เพื่อกรอกจำนวนแยกประเภทเข้าสู่ระบบ โดยระบบไม่เก็บส่วนสูงรายคน | BR-004, BR-005, ท้ายหัวข้อ 3.5 | ตาราง `sessions` เก็บเฉพาะ `adult_guest_count`, `child_guest_count`, `free_guest_count` ไม่มีฟิลด์ส่วนสูง |
| **A2** | **ลำดับการชั่งเนื้อเหลือ:**<br>Diagram 7 ให้ปิด Session ก่อนแล้วค่อยชั่งเนื้อเหลือ แต่ FR-063 บอกปิด Session แล้วออกบิลทันที และสถานะโต๊ะยังไม่ชัดเจน | เรียงลำดับใหม่: **ลูกค้าออก → Staff ตรวจโต๊ะและชั่งเนื้อเหลือบันทึกเข้าระบบ → ปิด Session → ออกบิล → Cashier รับเงินปิดบิล → โต๊ะเปลี่ยนเป็น Cleaning → ทำความสะอาดเสร็จจึงเป็น Available** | หัวข้อ 2.3 (ข้อ 15-18), FR-063, BR-033, Diagram 7 | เพิ่มสถานะ `cleaning` ใน `dining_tables.status` และผูก `leftover_records` ก่อนสรุปยอดใน `bills` |
| **A3** | **ใครเปิดเมนูที่ปิดด้วยมือ:**<br>FR-017 ให้ Manager/Admin ปิดได้ แต่ BR-010 และ 12.4 พูดถึงเฉพาะ Manager | ระบุให้ **"Manager หรือ Admin"** มีสิทธิ์เปิดและปิดเมนูด้วยมือ (`manual_off`) ได้เหมือนกัน เพื่อให้สอดคล้องกับ FR-065 | BR-010, ข้อ 12.4, Mermaid Diagram 12.4 | ฟิลด์ `menu_items.availability_status` รองรับ: `available`, `manual_off`, `auto_off` |
| **A4** | **ครัวปฏิเสธออเดอร์ได้หรือไม่:**<br>Diagram 8 มีกิ่งครัวไม่กดรับ แต่ FR-047 บอก Staff เท่านั้นที่ยกเลิก Submitted ได้ และไม่ระบุว่าของหมดทำอย่างไร | ระบุชัดเจนว่า **ครัวมีสิทธิ์ปฏิเสธรับรายการ Submitted ได้ (กรณีของหมดกะทันหัน/เหตุสุดวิสัย)** โดยระบบเปลี่ยนสถานะเป็น `Cancelled` อัตโนมัติ พร้อม Realtime แจ้งลูกค้าและ Staff | FR-024, FR-047, BR-014, Diagram 8, Diagram 9 | บันทึก `order_items.cancelled_by` และ `cancelled_reason` พร้อมยิง Supabase Realtime Broadcast |
| **A5** | **ERD ไม่ตรงกับ Mermaid และขาด FK/Audit:**<br>SVG ขาด 7 ตาราง, ไม่มี FK กันตัดสต็อกซ้ำ และขาด Audit ผู้กระทำ | ซิงค์ Mermaid ERD ให้ครบ 28 ตาราง, **ผูก `order_items ||--o{ stock_movements` โดยตรง** และเพิ่ม FK ไปยัง `profiles` ในทุกจุดสำคัญ | หัวข้อ 10.1, 10.2, 10.4 | เพิ่ม Foreign Key ไปยัง `profiles` ในตาราง `leftover_records`, `bills`, `order_items`, `payments`, `session_tables` |
| **A6** | **เอกสารอ้างถึงสิ่งที่ไม่มีอยู่:**<br>อ้างตาราง 2.1.1 และตกหล่น FR-065, BR-036, UC18 ใน Traceability | ซิงค์การอ้างอิงตารางสิทธิ์ 2.1.1 ให้ถูกต้อง และ**เพิ่ม FR-065, BR-036, UC18 ลงในตาราง Traceability** ครบถ้วน | หัวข้อ 10.4, 15, 17.2, 18.2 | สิทธิ์ในตาราง 2.1.1 แปลงเป็น Supabase RLS Policies ที่สมบูรณ์ |
| **A7** | **การชำระเงินและการลองซ้ำ (Attempts):**<br>ERD ให้ `bills` กับ `payments` เป็น 1:1 แต่ Flow มีการรอตรวจ/สลิปไม่ผ่าน | แยกตาราง: **`payments` เก็บเฉพาะรายการที่ชำระสำเร็จ (Settled)** และเพิ่ม **`payment_attempts` เก็บประวัติความพยายามตรวจสลิป PromptPay ที่ไม่ผ่าน/รอตรวจ** | หัวข้อ 10.2, 10.4, 11.3, Diagram 11.3 | สร้างตาราง `payment_attempts` มี FK ชี้ไปที่ `bills.id` |
| **A8** | **PIN และ QR Code (Lockout & Move):**<br>Diagram 7 วนลูปไม่จำกัด และสถาปัตยกรรม QR ประจำโต๊ะกับ Token ยังไม่ชัด | • กำหนดเพดาน: **กรอกผิดเกิน 5 ครั้ง ระบบล็อกทันที** ต้องให้ Staff ปลดล็อก<br>• สถาปัตยกรรม: QR ประจำโต๊ะเปิดหน้าขอ PIN เมื่อยืนยันถูก Client ได้รับ JWT ประจำรอบ เมื่อย้ายโต๊ะยังใช้ Session เดิมได้ | FR-016, Diagram 7, หัวข้อ 2.3 | เพิ่ม `sessions.failed_pin_attempts` และ `sessions.is_locked` ในฐานข้อมูล |

---

## 3. ตารางเปรียบเทียบการแก้ไข หมวด B: ช่องว่างและความคลุมเครือ (Architectural Gaps)

| ข้อ | ช่องว่างใน v1.6 | มติและการแก้ไขใน v1.7 (Resolution) | ส่วนที่ปรับปรุงใน SRS | ผลต่อ Database Schema |
|:---:|---|---|---|---|
| **B9** | **ระยะเวลาบุฟเฟต์:**<br>ไม่มีฟิลด์เวลารับประทานในแพ็กเกจ ไม่ระบุเวลาเริ่มนับ และจัดการออเดอร์ค้างอย่างไร | • เพิ่มฟิลด์ **`duration_minutes` ในแพ็กเกจ (เช่น 90 นาที)**<br>• **เริ่มนับเวลาทันทีเมื่อเปิด Session (`sessions.started_at`)**<br>• ออเดอร์ที่ส่งเข้ามาก่อนครบเวลา ครัวปรุงและเสิร์ฟต่อจนเสร็จ แต่ปิดรับสั่งใหม่ | FR-010, FR-025, หัวข้อ 2.3 | เพิ่ม `packages.duration_minutes`, `sessions.duration_minutes_snapshot`, `sessions.started_at`, `expires_at` |
| **B10** | **Session Lifecycle State Machine:**<br>ไม่มีนิยามสถานะของ Session ที่ชัดเจน | กำหนด 6 สถานะมาตรฐาน:<br>**`draft` → `active` → `expired` → `closing` → `billed` → `closed`** พร้อมล็อก Snapshot เมื่อเข้าสู่ `active` | BR-037, หัวข้อ 2.3, 10.4 | กำหนด Enum `session_status` และเขียน Trigger ป้องกันแก้ Snapshot เมื่อพ้นสถานะ `draft` |
| **B11** | **Diagram 7 วาดเป็นเส้นตรง:**<br>ขาดลูปการสั่งอาหารซ้ำ และการหมดเวลาตัดเข้ามาไม่ได้ | ปรับ Diagram 7 ให้การสั่งอาหารเป็น **Loop (สั่งอาหารเพิ่มได้เรื่อยๆ)** และมี Timer Event เข้ามาตัดวงจรปิดรับออเดอร์เมื่อครบเวลา | Diagram 7 (System Workflow) | สอดคล้องกับ State Transition ของแอปพลิเคชัน |
| **B12** | **ระดับการยกเลิกออเดอร์:**<br>ไม่ชัดเจนว่ายกเลิกระดับ order หรือ item และอาหารสั่งเพิ่มที่ทำแล้วคิดเงินไหม | • การยกเลิกทำที่ระดับ **`order_items`**<br>• เมนูสั่งเพิ่ม (Ala-carte) ที่ Cooking/Ready หากลูกค้ายกเลิกเอง **ยังคงคิดเงินในบิล** และตัดสต็อกเป็น Kitchen Waste | หัวข้อ 3.8, FR-047–FR-052, BR-016, Diagram 9 | เพิ่มสถานะ `cancelled` ใน `order_items` พร้อมฟิลด์ `cancelled_by`, `cancelled_reason` |
| **B13** | **Workflow ส่วนลด:**<br>ข้อ 11.1 ยังบอกรอกำหนดนโยบาย และ Use Case ขาดความเชื่อมโยง | • ปรับข้อ 11.1 ให้พร้อมใช้งาน (Manager/Admin อนุมัติ)<br>• ใน Use Case กำหนดให้ **`UC9 (จัดการบิล) <<extend>> UC14 (ขออนุมัติส่วนลด)`** | หัวข้อ 11.1, Use Case 6.1, 6.2 | เพิ่มฟิลด์ `bills.discount_amount`, `discount_reason`, `discount_approved_by` |
| **B14** | **ผู้ยืนยันการชำระเงิน:**<br>FR-043 ใช้คำว่า "พนักงาน" ไม่ระบุบทบาท | ระบุบทบาทชัดเจนเป็น **"Cashier"** (หรือ Staff ที่ได้รับมอบหมายหน้าที่ Cashier) | FR-043, ข้อ 11.3, Diagram 11.3 | ตาราง `payments.verified_by` และ `payment_attempts.attempted_by` ชี้ไปที่ Cashier ID |
| **B15** | **ข้อยกเว้น Manager-only:**<br>หาก Manager ไม่อยู่ ร้านจะติดคอขวดเพราะ Admin ทำแทนไม่ได้ | กำหนดสิทธิ์ **Emergency Override ให้ Admin สามารถทำแทน Manager ได้ในกรณีฉุกเฉินเร่งด่วน** โดยระบบบังคับบันทึก Audit Trail ชัดเจน | ตาราง 2.1.1, 3.10, 3.11, BR-039 | บันทึก Log การ Override ลงใน `audit_logs` |
| **B16** | **Use Case ที่ตกหล่น:**<br>ขาด UC สแกน QR/PIN, ระบบเปิดเมนูอัตโนมัติ และระบบตัดเวลา | เพิ่ม 3 Use Cases ให้สมบูรณ์:<br>• **UC19:** สแกน QR และกรอก PIN (Customer)<br>• **UC20:** ปิด/เปิดเมนูอัตโนมัติตามสต็อก (System)<br>• **UC21:** แจ้งเตือนหมดเวลาและระงับสั่งอาหาร (System) | Use Case 6.1, 6.2 (Diagram) | ครอบคลุม Actor ทั้งพนักงาน ลูกค้า และระบบ Background Worker |

---

## 4. สรุปงานจัดเก็บรายละเอียด หมวด C (Document Cleanup)

1. **ลบหัวข้อซ้ำซ้อน:** ลบบรรทัด `18. ผลการตรวจความสอดคล้อง...` ที่แทรกอยู่ใต้หัวข้อ 17 ออกเรียบร้อย
2. **แก้ไขตาราง Markdown ใน 3.9:** นำหมายเหตุ FR-053 ออกมาไว้ใต้ตาราง ทำให้แถวตาราง FR-053 ถึง FR-063 ไม่ขาดตอน
3. **ปรับปรุงเลขเวอร์ชัน:** ปรับการอ้างอิงเป็น **v1.7** สอดคล้องกันทั้งเอกสาร
4. **ระบุเครื่องมือสร้าง Diagram:** ปรับเป็น Mermaid / Graphviz / Figma ให้ตรงกับความเป็นจริง

---

## 5. แผนผังความพร้อมในการพัฒนา (Development Blueprint)

```
[SRS v1.7 Specification] ───► [Data Dictionary v1.7 (28 Tables)] ───► [Supabase PostgreSQL Migration SQL]
           │                                                                        │
           ├────────────────────────► [Next.js API & Server Actions] ◄──────────────┤
           │                                         ▲                              │
           ▼                                         │                              ▼
 [Use Cases & Workflows] ────────────► [Tailwind UI Components] ──────────► [Supabase RLS & Triggers]
```

---

## 6. บันทึกผลการตรวจทานเชิงลึกก่อนเริ่มเขียนโค้ด (Pre-Implementation Deep Audit)

จากการ Audit รอบสุดท้ายก่อนเริ่มพัฒนา ได้ดำเนินการตรวจสอบและปรับปรุงเพิ่มเติมดังนี้:

| รหัส | ระดับ | ปัญหาที่พบ | ผลการแก้ไข (Resolution) |
|:---:|:---:|---|---|
| **C-01** | 🔴 Critical | ฟังก์ชันตัดสต็อกครัว `fn_deduct_stock_on_accepted` ใช้ `v_actor := COALESCE(auth.uid(), NEW.cancelled_by)` ซึ่งผิด Context | แก้ไขให้ใช้ `auth.uid()` และมี Check ไม่ให้ดำเนินการหากผู้ใช้ไม่ได้ผ่านการพิสูจน์ตัวตน |
| **C-02** | 🔴 Critical | Trigger `fn_protect_session_snapshot` ไม่ได้บันทึก `package_price_locked_at` ตอน `draft → active` | เพิ่มคำสั่งให้บันทึก `NEW.package_price_locked_at = now()` พร้อมกับ `guest_count_locked_at` |
| **C-03** | 🔴 Critical | ตาราง `bills` ไม่มีกลไกคำนวณ VAT 7% Inclusive อัตโนมัติในระดับ Database | เพิ่ม Trigger `fn_calc_bill_vat` คำนวณ `vat_amount = ROUND(total_amount * 7.0 / 107.0, 2)` ทุกครั้งที่ total_amount เปลี่ยนแปลง |
| **C-04** | 🔴 Critical | ไม่มีกลไกเพิกถอน Token อัตโนมัติเมื่อ Session ปิด | เพิ่ม Trigger `fn_revoke_qr_on_session_close` ทำการเพิกถอน Token ทันทีเมื่อ Session กลายเป็น `closed` |
| **M-01** | 🟡 Major | ฟิลด์ `pin_plain` ในตาราง `sessions` สุ่มเสี่ยงเรื่องความปลอดภัย | ลบฟิลด์ `pin_plain` ออกจาก Schema โดยให้คงไว้เฉพาะ `pin_hash` ตามข้อกำหนด NFR-006 |
| **M-02** | 🟡 Major | ตาราง `usage_rates` ขาดการกำหนดค่าประมาณการสำหรับลูกค้าประเภทฟรี | เพิ่มคอลัมน์ `estimated_grams_per_free` พร้อมคำอธิบายใน Data Dictionary |
| **M-04** | 🟡 Major | ฟิลด์ `orders.order_source` ขาด CHECK Constraint | เพิ่ม `CHECK (order_source IN ('customer_qr', 'staff'))` ใน DDL |
| **M-05** | 🟡 Major | ฟิลด์ `bills.status` และ `payments.status` ขาด CHECK Constraint | เพิ่ม CHECK กำกับค่าที่เป็นไปได้ (`unpaid`, `paid` สำหรับ bills และ `settled` สำหรับ payments) |
| **G-03** | 🟢 Minor | ตาราง `head_usage_estimates` ไม่มี Unique Constraint | เพิ่ม `UNIQUE (session_id, ingredient_id)` ป้องกันข้อมูลประมาณการซ้ำซ้อน |

---

## 7. สถานะการส่งมอบงานและการดำเนินการถัดไป (Delivery Status & Next Steps)

1. [x] **สร้างไฟล์ Supabase Migration Script (`001_initial_schema.sql`):** ครบถ้วน 28 ตาราง, Enums, Triggers ล็อก Snapshot/VAT/QR Token Revoke, และ RLS Policies ทุก Role
2. [x] **สร้างและปรับปรุงเอกสาร `agent.md`, `SRS.md`, `data_dictionary.md`, `audit_matrix.md`, `README.md`:** สอดคล้องกัน 100% ไม่มีข้อขัดแย้ง
3. [ ] **ขั้นตอนถัดไปสำหรับการพัฒนา (Implementation Phase):** เริ่มพัฒนา Next.js 16 App Router ตาม Checklist ใน `agent.md` (เริ่มจาก Task 1: Setup Supabase Client Helpers & Constants)

