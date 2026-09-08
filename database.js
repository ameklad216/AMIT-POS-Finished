// 01 | pg يتصل بـPostgreSQL المحلي أو Neon، ويتوافق مع مخزن الجلسات.
const { Pool } = require('pg');

// 02 | تجميع إعداد الاتصال: DATABASE_URL له الأولوية، وإلا نستخدم إعدادات DB_* المحلية.
function databaseConfig() {
  // حد أقصى لعشرة اتصالات، ومهلة انتظار تمنع تعليق التشغيل إلى الأبد.
  const shared = { connectionTimeoutMillis: 15000, max: 10 };
  // Neon supports PostgreSQL connections, including connect-pg-simple sessions.
  // An invalid DATABASE_URL fails explicitly; it never falls back to local data.
  if (process.env.DATABASE_URL)
    return { ...shared, connectionString: process.env.DATABASE_URL };
  return {
    ...shared,
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
}

// 03 | إنشاء مجموعة اتصالات قابلة لإعادة الاستخدام بدل فتح اتصال جديد لكل طلب.
function createPool() {
  const pool = new Pool(databaseConfig());

  // التعامل مع أخطاء الاتصالات الخاملة دون طباعة رابط الاتصال أو كلمة السر.
  pool.on('error', () =>
    console.error(
      'Database connection error. Check database availability and configuration.',
    ),
  );
  return pool;
}
module.exports = { databaseConfig, createPool };
