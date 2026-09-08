# AMIT POS — Node.js + EJS + Sessions

مشروع مستقل بواجهة مستوحاة من react-finished. Express يولد الصفحات باستخدام EJS، وPostgreSQL يحفظ المنتجات والجلسات. لا توجد REST API أو React أو JWT في هذه النسخة.

## التشغيل

المتطلبات: Node.js 20 أو أحدث وPostgreSQL.

```powershell
npm.cmd install
# على جهاز جديد: انسخ .env.example إلى .env واضبط الاتصال وقيمة SESSION_SECRET.
npm.cmd run db:init
npm.cmd start
```

افتح http://127.0.0.1:3100. حساب التدريب: admin@test.com / password123.
قاعدة البيانات الحالية: project6_admin_ejs. أمر db:init لا يحذف البيانات الموجودة.

## المسارات المستخدمة

| الطريقة | المسار | الوظيفة |
|---|---|---|
| GET / POST | /signin | صفحة الدخول / تسجيل الدخول |
| POST | /logout | إنهاء الجلسة |
| GET | / | عدد المنتجات |
| GET | /profile | بيانات الحساب |
| GET | /products | جدول المنتجات؛ يدعم q للبحث |
| GET | /products/new | نموذج الإضافة |
| POST | /products | حفظ المنتج الجديد |
| GET / POST | /products/:id/edit | نموذج التعديل / الحفظ |
| GET / POST | /products/:id/delete | تأكيد الحذف / التنفيذ |

كل مسارات الإدارة محمية بالجلسة. نماذج POST تحمل _csrf. المتصفح يرسل Cookie من نوع HttpOnly وSameSite=Lax، وتُجدد الجلسة عند الدخول وتُحذف عند الخروج. صلاحيتها ثماني ساعات من آخر نشاط. لا توجد مصادقة باستخدام Bearer أو localStorage.

JavaScript يحسن قائمة الموبايل ونوافذ المنتجات وإظهار كلمة المرور. النوافذ تجلب HTML من نفس مسارات EJS؛ لا تحتاج API. النماذج تعمل أيضًا كصفحات مستقلة بدون JavaScript. الواجهة في الوضع الفاتح.

## الملفات

- server.js: تشغيل التطبيق والتحقق من قاعدة البيانات وتنظيف الجلسات المنتهية.
- app.js: إعداد Express وEJS وSession Store وحماية الطلبات والأخطاء.
- routes.js: صفحات التطبيق وعمليات حفظ المنتجات.
- middleware/auth.js: حماية الجلسة وCSRF.
- database.js وseed.sql وscripts/init-db.js: الاتصال والتهيئة.
- views/: الصفحات والأجزاء المشتركة.
- public/: CSS وJavaScript وشعار AMIT والخطوط والصورة البديلة المستخدمة.
- test/integration.test.js: اختبارات HTTP حقيقية لنماذج EJS والجلسات وقاعدة البيانات.

## التحقق

شغّل npm.cmd test. الاختبارات تستخدم schema مؤقتة وتزيلها عند الانتهاء، ولا تعدل منتجات التطبيق. تشمل الدخول والخروج، تجديد الجلسة واستمرارها وانتهاءها، CSRF، CRUD، الأسعار والحقول، escaping، الصفحات المفقودة، والتحقق من إزالة API القديمة.

عند النشر باستخدام HTTPS اضبط NODE_ENV=production لتفعيل Secure cookies. اضبط TRUST_PROXY=1 فقط خلف reverse proxy موثوق، ولا ترفع .env إلى Git.

## المصدر

الهوية والتنسيق مبنيان على مرجع react-finished. احتُفظ بملف TAILADMIN-LICENSE.md كسجل ترخيص للأصول السابقة. المشروعان الأصليان وقاعدة بياناتهما لم يتغيرا أثناء التنظيف.

## Neon

ثبتت مكتبة @neondatabase/serverless لاختبار الاتصال عبر HTTP بنفس SELECT version() الموجود في المثال. اتصال التطبيق والـSessions يستخدم pg المتوافق مع Neon حتى تستمر المعاملات وconnect-pg-simple في العمل.

ضع رابط Neon في .env باسم DATABASE_URL مع إعداد SSL الموجود في الرابط الأصلي. له أولوية على DB_*؛ عند خطأ الاتصال لا يرجع التطبيق تلقائيًا لقاعدة البيانات المحلية.

- npm.cmd run db:check: يفحص اتصال Neon HTTP واتصال التطبيق والجداول المطلوبة.
- npm.cmd run db:init: يهيئ الجداول وحساب التدريب والمنتجات التجريبية في قاعدة Neon الموجودة. لا ينشئ قاعدة جديدة على Neon ولا يحذف البيانات الموجودة.
- npm.cmd start: يشغل نفس تطبيق AMIT POS على 3100.

تهيئة قاعدة Neon لا تنقل المنتجات المحلية إليها. نقل البيانات الموجودة خطوة منفصلة. بدون DATABASE_URL يظل إعداد PostgreSQL المحلي مستخدمًا.
