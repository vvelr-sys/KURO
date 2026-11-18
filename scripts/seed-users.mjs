#!/usr/bin/env node
// ============================================================
// KURO POS — สร้างบัญชีพนักงานทดสอบ 5 ตำแหน่ง (สำหรับพัฒนา/ทดสอบเท่านั้น)
// ------------------------------------------------------------
// วิธีรัน (จากโฟลเดอร์รากของโปรเจกต์):
//   node scripts/seed-users.mjs
//
// ต้องมีตัวแปรใน .env.local (ห้ามเขียนคีย์ลงในโค้ด และห้าม commit .env.local):
//   NEXT_PUBLIC_SUPABASE_URL    — URL ของโปรเจกต์ Supabase
//   SUPABASE_SERVICE_ROLE_KEY   — Service Role Key (ข้าม RLS ได้ ใช้ฝั่งเครื่องนักพัฒนาเท่านั้น)
//   SEED_PASSWORD               — รหัสผ่านที่ใช้ร่วมกันของบัญชีทดสอบทั้ง 5 บัญชี (อย่างน้อย 8 ตัวอักษร)
//   SEED_PIN_ADMIN, SEED_PIN_MANAGER, SEED_PIN_CASHIER,
//   SEED_PIN_STAFF, SEED_PIN_KITCHEN — (ไม่บังคับ) Staff PIN ตัวเลข 4-6 หลัก (ซ้ำกันได้)
//                                       ถ้าไม่ใส่ จะไม่แตะ pin_hash ของบัญชีนั้น
//
// รันซ้ำได้: ถ้าบัญชีมีอยู่แล้วจะข้ามการสร้าง (ไม่เปลี่ยนรหัสผ่าน)
//            แต่จะ upsert ข้อมูลใน profiles ให้ตรงตามตารางด้านล่างเสมอ
// ============================================================

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

/** จำนวนรอบ bcrypt สำหรับ hash PIN (ค่ามาตรฐาน 10) */
const BCRYPT_ROUNDS = 10;

/** โดเมนอีเมลของบัญชีทดสอบ — รูปแบบ <role>@kuro.test */
const TEST_EMAIL_DOMAIN = 'kuro.test';

/**
 * รายการบัญชีทดสอบ: role ต้องตรงกับ enum user_role ใน 001_initial_schema.sql
 * (admin, manager, staff, kitchen, cashier)
 * @type {{ role: 'admin'|'manager'|'cashier'|'staff'|'kitchen', fullName: string, pinEnvName: string }[]}
 */
const TEST_ACCOUNTS = [
  { role: 'admin', fullName: 'สมชาย ใจดี (ผู้ดูแลระบบ)', pinEnvName: 'SEED_PIN_ADMIN' },
  { role: 'manager', fullName: 'สมหญิง รักร้าน (ผู้จัดการ)', pinEnvName: 'SEED_PIN_MANAGER' },
  { role: 'cashier', fullName: 'มานี มีเงิน (แคชเชียร์)', pinEnvName: 'SEED_PIN_CASHIER' },
  { role: 'staff', fullName: 'มานะ ขยันดี (พนักงานบริการ)', pinEnvName: 'SEED_PIN_STAFF' },
  { role: 'kitchen', fullName: 'ชูใจ ทำอร่อย (ครัว)', pinEnvName: 'SEED_PIN_KITCHEN' },
];

/**
 * โหลดตัวแปรจาก .env.local ที่โฟลเดอร์รากของโปรเจกต์ (ใช้ความสามารถในตัวของ Node 20.12+)
 * ตัวแปรที่ตั้งไว้ใน shell อยู่แล้วจะไม่ถูกเขียนทับ
 * @returns {void}
 */
function loadLocalEnvFile() {
  const envFilePath = fileURLToPath(new URL('../.env.local', import.meta.url));
  if (!existsSync(envFilePath)) {
    console.warn('⚠️  ไม่พบไฟล์ .env.local — จะใช้ตัวแปรจาก shell แทน');
    return;
  }
  if (typeof process.loadEnvFile !== 'function') {
    throw new Error('ต้องใช้ Node.js 20.12 ขึ้นไป (ไม่มี process.loadEnvFile)');
  }
  process.loadEnvFile(envFilePath);
}

/**
 * อ่านและตรวจค่าตัวแปรที่จำเป็น ถ้าขาดให้หยุดพร้อมข้อความชัดเจน
 * @returns {{ supabaseUrl: string, serviceRoleKey: string, seedPassword: string }}
 */
function readRequiredSettings() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const seedPassword = process.env.SEED_PASSWORD;

  const missingNames = [];
  if (!supabaseUrl) missingNames.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceRoleKey) missingNames.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!seedPassword) missingNames.push('SEED_PASSWORD');
  if (missingNames.length > 0) {
    throw new Error(`ขาดตัวแปรใน .env.local: ${missingNames.join(', ')} (ดูตัวอย่างใน .env.example)`);
  }
  if (seedPassword.length < 8) {
    throw new Error('SEED_PASSWORD ต้องยาวอย่างน้อย 8 ตัวอักษร');
  }
  return { supabaseUrl, serviceRoleKey, seedPassword };
}

/**
 * อ่าน PIN ของแต่ละตำแหน่งจาก env และตรวจรูปแบบ (ตัวเลข 4-6 หลัก)
 * PIN ซ้ำกันระหว่างตำแหน่งได้ — หน้าล็อกอินจึงต้องให้เลือกพนักงานก่อนแล้วค่อยกรอก PIN
 * @returns {Map<string, string>} role → PIN (เฉพาะตำแหน่งที่ตั้งค่าไว้)
 */
function readStaffPins() {
  /** @type {Map<string, string>} */
  const pinByRole = new Map();

  for (const account of TEST_ACCOUNTS) {
    const pin = process.env[account.pinEnvName]?.trim();
    if (!pin) continue;

    if (!/^\d{4,6}$/.test(pin)) {
      throw new Error(`${account.pinEnvName} ต้องเป็นตัวเลข 4-6 หลัก`);
    }
    pinByRole.set(account.role, pin);
  }
  return pinByRole;
}

/**
 * ดึงผู้ใช้ทั้งหมดใน Supabase Auth แล้วทำเป็น Map ค้นหาตามอีเมล (ไล่ทีละหน้า)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Map<string, { id: string }>>}
 */
async function fetchAuthUsersByEmail(supabase) {
  /** @type {Map<string, { id: string }>} */
  const usersByEmail = new Map();
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`ดึงรายชื่อผู้ใช้ไม่สำเร็จ: ${error.message}`);

    for (const user of data.users) {
      if (user.email) usersByEmail.set(user.email.toLowerCase(), { id: user.id });
    }
    if (data.users.length < perPage) break;
  }
  return usersByEmail;
}

/**
 * สร้างบัญชีใน Supabase Auth (ยืนยันอีเมลทันที) หรือข้ามถ้ามีอยู่แล้ว
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Map<string, { id: string }>} usersByEmail
 * @param {{ email: string, password: string, fullName: string, role: string }} account
 * @returns {Promise<{ userId: string, wasCreated: boolean }>}
 */
async function createAuthUserIfMissing(supabase, usersByEmail, account) {
  const existingUser = usersByEmail.get(account.email.toLowerCase());
  if (existingUser) {
    return { userId: existingUser.id, wasCreated: false };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: { full_name: account.fullName, role: account.role },
  });
  if (error) throw new Error(`สร้างบัญชี ${account.email} ไม่สำเร็จ: ${error.message}`);

  return { userId: data.user.id, wasCreated: true };
}

/**
 * บันทึกข้อมูลพนักงานลงตาราง profiles (upsert ตาม id)
 * ถ้ามี PIN จะ hash ด้วย bcrypt แล้วเก็บใน pin_hash; ถ้าไม่มีจะไม่แตะ pin_hash เดิม
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ userId: string, fullName: string, role: string, pin?: string }} profile
 * @returns {Promise<void>}
 */
async function upsertProfile(supabase, profile) {
  /** @type {{ id: string, full_name: string, role: string, is_active: boolean, pin_hash?: string }} */
  const profileRow = {
    id: profile.userId,
    full_name: profile.fullName,
    role: profile.role,
    is_active: true,
  };
  if (profile.pin) {
    profileRow.pin_hash = await bcrypt.hash(profile.pin, BCRYPT_ROUNDS);
  }

  const { error } = await supabase.from('profiles').upsert(profileRow, { onConflict: 'id' });
  if (error) throw new Error(`บันทึก profiles ของ ${profile.role} ไม่สำเร็จ: ${error.message}`);
}

/**
 * จุดเริ่มทำงานหลักของสคริปต์
 * @returns {Promise<void>}
 */
async function main() {
  loadLocalEnvFile();
  const { supabaseUrl, serviceRoleKey, seedPassword } = readRequiredSettings();
  const pinByRole = readStaffPins();

  // ใช้ Service Role Key ฝั่งสคริปต์เท่านั้น ไม่เก็บ session ลงเครื่อง
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`🔗 เชื่อมต่อ: ${supabaseUrl}`);
  const usersByEmail = await fetchAuthUsersByEmail(supabase);

  for (const account of TEST_ACCOUNTS) {
    const email = `${account.role}@${TEST_EMAIL_DOMAIN}`;
    const { userId, wasCreated } = await createAuthUserIfMissing(supabase, usersByEmail, {
      email,
      password: seedPassword,
      fullName: account.fullName,
      role: account.role,
    });

    const pin = pinByRole.get(account.role);
    await upsertProfile(supabase, { userId, fullName: account.fullName, role: account.role, pin });

    const createdText = wasCreated ? 'สร้างใหม่' : 'มีอยู่แล้ว (ข้ามการสร้าง)';
    const pinText = pin ? 'ตั้ง PIN แล้ว' : 'ไม่ได้ตั้ง PIN';
    console.log(`✅ ${account.role.padEnd(8)} ${email.padEnd(20)} — ${createdText}, ${pinText}`);
  }

  console.log('\nเสร็จแล้ว ขั้นต่อไป: รัน supabase/seed_master.sql แล้วตามด้วย supabase/seed_demo.sql');
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
