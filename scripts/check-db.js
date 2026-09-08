// 01 | اختبار اتصال مستقل لا يغيّر بيانات المستخدمين أو المنتجات.
require('dotenv').config({ quiet: true });
const { neon } = require('@neondatabase/serverless');
const { createPool } = require('../database');

// 02 | فحص Neon عبر HTTP ثم فحص اتصال pg الذي يستخدمه التطبيق والجلسات.
async function check() {
  if (!process.env.DATABASE_URL)
    throw new Error('Set DATABASE_URL in .env to your Neon connection string first.');

  // neon ينشئ دالة استعلام؛ tagged template يرسل SELECT version() لعرض إصدار PostgreSQL.
  const sql = neon(process.env.DATABASE_URL);
  const [result] = await sql`SELECT version()`;
  console.log('Neon HTTP connection: OK');
  console.log(result.version);

  // 03 | نجاح HTTP وحده لا يكفي؛ نختبر أيضًا وسيلة الاتصال الفعلية للتطبيق.
  const pool = createPool();
  try {
    await pool.query('SELECT 1');
    console.log('Application / session PostgreSQL connection: OK');

    // 04 | التأكد من وجود الجداول المطلوبة قبل محاولة تسجيل الدخول أو عرض المنتجات.
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','products','sessions') ORDER BY table_name",
    );

    // تحويل صفوف الاستعلام إلى أسماء سهلة العرض في تقرير الفحص.
    const names = tables.rows.map((row) => row.table_name);
    console.log('Application tables: ' + (names.join(', ') || 'none'));
    if (names.length !== 3) {
      console.log('Schema is not ready. Run npm.cmd run db:init for this database.');
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

// 05 | إظهار خطأ مفهوم مع تجنب طباعة أسرار الاتصال من رسائل الدرايفر.
check().catch((error) => {
  // Do not print connection strings or driver messages containing credentials.
  console.error(
    process.env.DATABASE_URL
      ? 'Database check failed. Check Neon availability, network access and DATABASE_URL.'
      : error.message,
  );
  process.exitCode = 1;
});
