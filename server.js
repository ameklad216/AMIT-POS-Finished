// 01 | تحميل .env قبل إنشاء الاتصال حتى يقرأ database.js إعدادات Neon الصحيحة.
require('dotenv').config({ quiet: true });
const { createPool } = require('./database');
const { createApp } = require('./create-app');

// مجموعة الاتصال المشتركة التي يستخدمها التطبيق والجلسات.
const pool = createPool();

// 02 | بدء التطبيق: تحقق من الجداول أولًا ثم نظّف الجلسات المنتهية واستقبل الطلبات.
async function start() {
  await pool.query('SELECT 1 FROM users LIMIT 1');
  await pool.query('SELECT 1 FROM sessions LIMIT 1');
  await pool.query('DELETE FROM sessions WHERE expire < NOW()');

  // 03 | إنشاء Express ثم تحديد عنوان الاستماع والمنفذ.
  const app = createApp({ pool });
  const host = process.env.APP_HOST || '127.0.0.1';
  const port = Number(process.env.APP_PORT || 3100);

  // بدء استقبال HTTP؛ callback يطبع العنوان بعد نجاح فتح المنفذ.
  const server = app.listen(port, host, () =>
    console.log(`EJS Admin Dashboard: http://${host}:${port}`),
  );

  // 04 | مهمة دورية كل 15 دقيقة لحذف الجلسات المنتهية؛ catch يمنع رفض Promise غير معالج.
  const prune = setInterval(
    () =>
      pool
        .query('DELETE FROM sessions WHERE expire < NOW()')
        .catch((error) => console.error(error.message)),
    15 * 60 * 1000,
  );

  // المؤقت وحده لا يمنع انتهاء عملية Node عند إغلاق بقية الموارد.
  prune.unref();
  let stopping = false;

  // 05 | إغلاق منظم: امنع تكرار الإيقاف ثم أغلق HTTP ومخزن الجلسات واتصالات قاعدة البيانات.
  function stop() {
    if (stopping) return;
    stopping = true;
    clearInterval(prune);

    // انتظار انتهاء الطلبات المفتوحة قبل إغلاق موارد التطبيق.
    server.close(async () => {
      app.locals.sessionStore.close();
      await pool.end();
      process.exit(0);
    });
  }

  // ربط الإغلاق بإشارات Ctrl+C وإيقاف العملية.
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  // التعامل مع خطأ الاستماع مثل انشغال المنفذ وإغلاق الاتصال عند الفشل.
  server.on('error', async (error) => {
    console.error(error.message);
    await pool.end();
    process.exitCode = 1;
  });
}

// 06 | نقطة التشغيل الفعلية ومعالجة فشل التهيئة قبل استقبال الطلبات.
start().catch(async (error) => {
  console.error(
    'Startup failed:',
    error.message,
    '\nCheck .env and run npm run db:init.',
  );
  await pool.end();
  process.exitCode = 1;
});
