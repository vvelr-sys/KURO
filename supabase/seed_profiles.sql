-- ============================================================
-- KURO POS — ผูกบัญชีทดสอบ 5 ตำแหน่งเข้ากับตาราง profiles
-- (ทางเลือกแทน scripts/seed-users.mjs สำหรับคนที่ไม่มี Service Role Key)
-- ------------------------------------------------------------
-- ก่อนรัน: สร้างบัญชีใน Supabase Dashboard > Authentication > Users > Add user > Create new user
--   อีเมล: admin@kuro.test, manager@kuro.test, cashier@kuro.test, staff@kuro.test, kitchen@kuro.test
--   ✅ ติ๊ก "Auto Confirm User" ทุกบัญชี
-- จากนั้นรันไฟล์นี้ใน SQL Editor — รันซ้ำได้ (upsert ตาม id)
-- บัญชีที่ยังไม่ได้สร้างใน Dashboard จะถูกข้ามไป (ผลตรวจท้ายไฟล์จะไม่ครบ 5 แถว)
-- ============================================================

INSERT INTO profiles (id, full_name, role, is_active)
SELECT auth_user.id, account.full_name, account.role::user_role, true
FROM (VALUES
    ('admin@kuro.test',   'สมชาย ใจดี (ผู้ดูแลระบบ)',    'admin'),
    ('manager@kuro.test', 'สมหญิง รักร้าน (ผู้จัดการ)',   'manager'),
    ('cashier@kuro.test', 'มานี มีเงิน (แคชเชียร์)',      'cashier'),
    ('staff@kuro.test',   'มานะ ขยันดี (พนักงานบริการ)',  'staff'),
    ('kitchen@kuro.test', 'ชูใจ ทำอร่อย (ครัว)',         'kitchen')
) AS account(email, full_name, role)
JOIN auth.users AS auth_user ON lower(auth_user.email) = account.email
ON CONFLICT (id) DO UPDATE
SET full_name = EXCLUDED.full_name,
    role      = EXCLUDED.role,
    is_active = true;

-- (ไม่บังคับ) ตั้ง Staff PIN แบบ bcrypt — เอา -- ออกแล้วเปลี่ยนตัวเลข PIN (4-6 หลัก ซ้ำกันได้)
-- ถ้า error ว่าไม่รู้จัก crypt ให้เปลี่ยนเป็น extensions.crypt(...) และ extensions.gen_salt(...)
-- UPDATE profiles SET pin_hash = crypt('1234', gen_salt('bf', 10))
-- WHERE id = (SELECT id FROM auth.users WHERE lower(email) = 'cashier@kuro.test');

-- ตรวจผล: ต้องได้ 5 แถว ครบทุกตำแหน่ง
SELECT profile.role, auth_user.email, profile.full_name, profile.pin_hash IS NOT NULL AS has_pin
FROM profiles AS profile
JOIN auth.users AS auth_user ON auth_user.id = profile.id
WHERE auth_user.email LIKE '%@kuro.test'
ORDER BY profile.role;
