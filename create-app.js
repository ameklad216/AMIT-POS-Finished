// 01 | مكتبات إعداد التطبيق: Express وEJS، والجلسات المخزنة في PostgreSQL، وترويسات الحماية والسجل.
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('node:path');
const createRoutes = require('./routes');
const { csrfToken, csrfProtection } = require('./middleware/auth');

// 02 | مصنع التطبيق: يفصل إعداد Express عن listen لتشغيل اختبارات دون استخدام منفذ التطبيق الحقيقي.
// sessionSchema يتيح للاختبارات تخزين الجلسات في مساحة معزولة.
function createApp({
  pool,
  app = express(),
  secret = process.env.SESSION_SECRET,
  production = process.env.NODE_ENV === 'production',
  sessionSchema = 'public',
  logging = true,
} = {}) {
  // رفض التشغيل بإعدادات ناقصة قبل استقبال أي طلب.
  if (!secret || secret.length < 32)
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  if (!pool) throw new Error('A PostgreSQL pool is required.');

  // 03 | إعداد Express: إخفاء تعريف الخادم، وضبط الوكيل الموثوق عند النشر فقط.
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

  // 04 | ربط EJS بمجلد views؛ res.render يبحث عن القالب داخل هذا المجلد.
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // 05 | ترويسات الحماية: تحميل السكربتات والأنماط من نفس التطبيق، مع السماح بصور المنتجات الخارجية.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'https:', 'http:', 'data:'],
          upgradeInsecureRequests: production ? [] : null,
        },
      },
    }),
  );

  // 06 | خدمة الملفات الثابتة مثل CSS والصور؛ هذه الملفات لا تحتاج إلى تنفيذ منطق قاعدة البيانات.
  app.use(
    '/assets',
    express.static(path.join(__dirname, 'public'), { maxAge: production ? '1d' : 0 }),
  );

  // سجل HTTP مفيد لمتابعة GET وPOST وحالات الاستجابة أثناء الشرح.
  if (logging) app.use(morgan('dev'));

  // 07 | قراءة بيانات نماذج HTML داخل req.body مع حد أقصى لحجم الطلب.
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));

  // 08 | مخزن الجلسات: connect-pg-simple يستخدم جدول sessions بدل تخزين الجلسات في ذاكرة Node.
  const store = new PgSession({
    pool,
    schemaName: sessionSchema,
    tableName: 'sessions',
    createTableIfMissing: false,
    pruneSessionInterval: false,
  });

  // 09 | Cookie تحمل معرّف جلسة موقّعًا فقط؛ بيانات الحساب تبقى في قاعدة البيانات.
  // HttpOnly يمنع قراءتها من JavaScript، وrolling يجدّد مدة الصلاحية مع النشاط.
  app.use(
    session({
      name: 'admin_ejs.sid',
      secret,
      store,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: production,
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );

  // 10 | قيم مشتركة لكل القوالب: الحساب والمسار وCSRF ورسالة النجاح وتنسيق السعر.
  // ترتيب هذه الخطوة بعد middleware الجلسة ضروري لأننا نقرأ req.session.
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.locals.user = req.session.user || null;
    res.locals.currentPath = req.path;
    res.locals.csrf = csrfToken(req);
    res.locals.flash = req.session.flash || null;

    // رسالة flash تُقرأ مرة واحدة ثم تُحذف حتى لا تتكرر عند إعادة فتح الصفحة.
    delete req.session.flash;

    // دالة عرض فقط لتحويل السعر إلى دولار؛ لا نستخدم تنسيق العرض في عمليات الحساب أو SQL.
    res.locals.money = (value) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
        Number(value),
      );
    next();
  });

  // 11 | فحص CSRF قبل مسارات الكتابة؛ ثم تركيب مسارات التطبيق.
  app.use(csrfProtection);
  app.use(createRoutes(pool));

  // 12 | إذا لم يطابق الطلب أي مسار سابق نعرض صفحة 404.
  app.use((req, res) => {
    res
      .status(404)
      .render('error', {
        title: 'Page not found',
        status: 404,
        message: 'The page you requested does not exist.',
      });
  });

  // 13 | معالج الأخطاء في آخر السلسلة: أربعة معاملات تميّزه عن middleware العادي.
  // نعرض رسالة آمنة للمستخدم بدل تفاصيل خطأ قاعدة البيانات.
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.too.large' ? 413 : 500;
    if (logging) console.error(error.message);
    const message =
      status === 413
        ? 'Request body too large.'
        : 'The request could not be completed. Please try again.';
    res
      .status(status)
      .render('error', {
        title: 'Request failed',
        status,
        message,
        user: res.locals.user || null,
        csrf: res.locals.csrf || '',
        currentPath: req.path,
        flash: null,
      });
  });

  // إتاحة إغلاق مخزن الجلسات عند إيقاف التطبيق أو إنهاء الاختبارات.
  app.locals.sessionStore = store;
  return app;
}
module.exports = { createApp };
