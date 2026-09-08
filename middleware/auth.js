// أدوات Node لتوليد رمز عشوائي ومقارنته بطريقة لا تكشف توقيت مطابقة أجزاء الرمز.
const { randomBytes, timingSafeEqual } = require('node:crypto');

// 01 | حارس الصفحات: الجلسة تحتوي user عند الدخول؛ وإلا نعيد التوجيه إلى /signin.
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  return res.redirect('/signin');
}

// 02 | إنشاء رمز عشوائي مرتبط بالجلسة مرة واحدة وإعادة استخدامه في حقول النماذج المخفية.
function csrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

// 03 | حماية عمليات الكتابة من CSRF: نقارن رمز النموذج بالرمز المحفوظ في جلسة المستخدم.
function csrfProtection(req, res, next) {
  // طلبات القراءة تمر؛ أما POST وغيرها فتحتاج رمزًا صحيحًا.
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const expected = req.session.csrfToken;
  const received = req.body?._csrf;

  // فحص النوع والطول أولًا لأن timingSafeEqual يتطلب مصفوفتين متساويتين في طول البايتات.
  if (
    typeof received === 'string' &&
    typeof expected === 'string' &&
    Buffer.byteLength(received) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  )
    return next();

  // عند غياب الرمز أو اختلافه لا ننفذ المسار؛ نطلب إعادة تحميل النموذج.
  return res
    .status(403)
    .render('error', {
      title: 'Request expired',
      status: 403,
      message: 'This form has expired. Reload the page and try again.',
    });
}
module.exports = { requireAuth, csrfToken, csrfProtection };
