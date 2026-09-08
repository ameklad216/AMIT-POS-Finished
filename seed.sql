-- Safe to run repeatedly: no DROP, TRUNCATE, or overwrite of existing records.
-- حسابات المستخدمين: password يخزن hash وليس كلمة المرور الأصلية.
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL
);

-- بيانات المنتجات مع قيود تمنع الاسم الفارغ والسعر غير المقبول.
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(70) NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT,
  image TEXT,
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0 AND price < 10000000000)
);

-- Compatible with connect-pg-simple. Session data lives on the server.
-- جلسات express-session: المعرف والبيانات وتاريخ الانتهاء.
CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

-- الفهرس يسرع البحث عن الجلسات المنتهية أثناء التنظيف الدوري.
CREATE INDEX IF NOT EXISTS sessions_expire_idx ON sessions (expire);

-- حساب تدريب فقط: ON CONFLICT يمنع تغيير حساب موجود عند إعادة التهيئة.
INSERT INTO users (email, password)
VALUES ('admin@test.com', '$2b$10$q9SUSrfQkVHyPlxVdCAEOeuGFGJBfHlkQPnVxZlmBxt6iqGXQlcVC')
ON CONFLICT (email) DO NOTHING;

