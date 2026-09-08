# تقرير تنظيف AMIT POS — 2026-09-08

## التغييرات

- إزالة 9 مسارات JSON API غير مستخدمة: GET /api/auth/csrf، POST /api/auth/login، GET /api/auth/me، POST /api/auth/logout، GET وPOST /api/products، GET وPUT وDELETE /api/products/:id.
- إزالة express.json، تفريعات استجابات JSON وisApi، ودعم X-CSRF-Token غير المستخدم. حماية CSRF مستمرة عبر الحقل المخفي _csrf في النماذج.
- استبدال جلب كل المنتجات وحساب مجموع/متوسط/أعلى سعر وتوزيع الأسعار وآخر المنتجات باستعلام COUNT واحد؛ Dashboard الحالي يحتاج العدد فقط.
- إزالة serialize الخاص بالـAPI، ملف Postman، الخط المكرر، شعارات القالب القديمة والصور غير المستخدمة.
- دمج تعديلات CSS المتكررة في قواعدها الأصلية دون تغيير التصميم.
- إعادة توجيه اختبارات التكامل إلى نماذج EJS الفعلية وتحديث README لشرح المشروع الحالي.

## ما تم الحفاظ عليه

الجلسات المخزنة في PostgreSQL، تجديد الجلسة عند الدخول، CSRF، Helmet، التحقق من المدخلات، الاستعلامات ذات المعاملات، escaping، الصفحات والنوافذ، البروفايل والبحث. جميع حزم dependencies الحالية مستخدمة؛ لم تُحذف حزم يحتاجها التطبيق. احتُفظ بسجل الترخيص.

## الأصول المحذوفة

حُذف 49 ملفًا، بإجمالي 816104 بايت. تم فحص الإشارات في المصدر وقيم صور المنتجات في قاعدة البيانات قبل الحذف؛ لم توجد روابط للأصول المحذوفة. لم تُعدّل بيانات المستخدمين أو المنتجات.

- Session_API.postman_collection.json
- public/fonts/inter.ttf
- public/images/logo/logo.svg
- public/images/logo/logo-dark.svg
- public/images/logo/logo-icon.svg
- public/images/logo/auth-logo.svg
- public\images\user\owner.jpg
- public\images\user\user-01.jpg
- public\images\user\user-02.jpg
- public\images\user\user-03.jpg
- public\images\user\user-04.jpg
- public\images\user\user-05.jpg
- public\images\user\user-06.jpg
- public\images\user\user-07.jpg
- public\images\user\user-08.jpg
- public\images\user\user-09.jpg
- public\images\user\user-10.jpg
- public\images\user\user-11.jpg
- public\images\user\user-12.jpg
- public\images\user\user-13.jpg
- public\images\user\user-14.jpg
- public\images\user\user-15.jpg
- public\images\user\user-16.jpg
- public\images\user\user-17.jpg
- public\images\user\user-18.jpg
- public\images\user\user-19.jpg
- public\images\user\user-20.jpg
- public\images\user\user-21.jpg
- public\images\user\user-22.jpg
- public\images\user\user-23.jpg
- public\images\user\user-24.jpg
- public\images\user\user-25.jpg
- public\images\user\user-26.jpg
- public\images\user\user-27.jpg
- public\images\user\user-28.jpg
- public\images\user\user-29.jpg
- public\images\user\user-30.jpg
- public\images\user\user-31.jpg
- public\images\user\user-32.jpg
- public\images\user\user-33.jpg
- public\images\user\user-34.jpg
- public\images\user\user-35.jpg
- public\images\user\user-36.jpg
- public\images\user\user-37.jpg
- public\images\product\product-01.jpg
- public\images\product\product-02.jpg
- public\images\product\product-03.jpg
- public\images\product\product-04.jpg
- public\images\product\product-05.jpg

## التحقق

- npm.cmd test: نجح 16 اختبارًا (15 سيناريو واختبار التكامل الرئيسي)، صفر فشل.
- السيناريوهات تشمل: الدخول والخروج، Cookie flags، رفض Bearer، تجديد الجلسة وCSRF، بقاء الجلسة بعد إعادة تشغيل التطبيق، انتهاء الجلسة، منع الكتابة والخروج دون CSRF، CRUD بالنماذج، دقة السعر، escaping، البحث، أخطاء الإدخال، المسارات المفقودة وأحجام الطلبات الزائدة.
- اختبار مستقل أثبت أن كل مسارات API التسعة المحذوفة تعيد 404 مع طلب صحيح من جلسة مصادق عليها؛ لا يوجد تنفيذ خلفي لها.
- فحص node --check نجح لملفات routes.js وapp.js وmiddleware/auth.js وpublic/js/app.js.
- فحص كل الأصول المتبقية عبر HTTP نجح ضمن اختبارات التكامل.
- تحقق المتصفح: تسجيل الدخول، Dashboard يعرض 11 منتجًا، جدول المنتجات، فتح نافذة الإضافة وإغلاقها. لا توجد أخطاء في console أثناء الفحص.
- التطبيق أُعيد تشغيله بالنسخة المنظفة على http://127.0.0.1:3100.
- الاختبارات استخدمت schema مؤقتة حُذفت بعد الانتهاء؛ بيانات التطبيق الأصلية لم تتغير.

التأثير المقصود: أي عميل خارجي أو مجموعة Postman كانت تعتمد على /api لم تعد مدعومة. واجهة EJS الحالية تستخدم المسارات المتبقية وتعمل دون هذه الـAPI.

