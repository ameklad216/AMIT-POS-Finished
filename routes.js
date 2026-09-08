// 01 | المكتبات: Router لتقسيم المسارات، وbcrypt لفحص كلمة المرور، وexpress-validator للتحقق من الحقول.
const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { requireAuth, csrfToken } = require('./middleware/auth');

// 02 | قواعد المنتج المشتركة: الاسم مطلوب، الوصف والصورة اختياريان، والسعر رقم موجب أو صفر بمنزلتين عشريتين.
// نستخدم نفس القواعد في الإضافة والتعديل حتى لا تختلف شروط الحفظ بين المسارين.
const productRules = [
  body('name')
    .isString()
    .bail()
    .trim()
    .isLength({ min: 1, max: 70 })
    .withMessage('Name must contain 1–70 characters.'),
  body('description')
    .optional({ values: 'null' })
    .isString()
    .bail()
    .isLength({ max: 5000 })
    .withMessage('Description must be at most 5,000 characters.'),
  body('image')
    .optional({ values: 'falsy' })
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('Use a full http:// or https:// image URL.'),

  // فحص السعر قبل الوصول إلى قاعدة البيانات؛ التعبير المنتظم يمنع الكسور الزائدة والصيغ غير المدعومة.
  body('price')
    .custom(
      (value) =>
        (typeof value === 'string' || typeof value === 'number') &&
        /^\d{1,10}(\.\d{1,2})?$/.test(String(value)) &&
        Number(value) < 10000000000,
    )
    .withMessage('Price must be non-negative with at most two decimal places.'),
];

// 03 | فحص شكل البريد وكلمة المرور أولًا؛ مطابقة الحساب الفعلية تحدث لاحقًا داخل signIn.
const loginRules = [
  body('email')
    .isString()
    .bail()
    .trim()
    .isEmail()
    .withMessage('Enter a valid email address.'),
  body('password')
    .isString()
    .bail()
    .isLength({ min: 1, max: 200 })
    .withMessage('Enter your password.'),
];

// تجميع رسائل أخطاء التحقق في مصفوفة تعرضها صفحة EJS للطالب أو المستخدم.
const errorMessages = (req) =>
  validationResult(req)
    .array()
    .map((error) => error.msg);

// قبول معرّف صحيح موجب داخل حدود INTEGER في PostgreSQL قبل تنفيذ الاستعلام.
const validId = (value) => /^[1-9]\d*$/.test(value) && Number(value) <= 2147483647;

// 04 | إنشاء Router وإعطاؤه pool من الخارج؛ نفس المسارات يمكن اختبارها بقاعدة معزولة.
module.exports = function createRoutes(pool) {
  const router = express.Router();

  // 05 | قراءة منتج واحد: نتحقق من id ثم نستخدم $1 بدل دمج القيمة داخل نص SQL.
  // ترجع الدالة null إذا لم يوجد المنتج؛ المسار يقرر عندها إظهار 404.
  async function product(id) {
    if (!validId(id)) return null;
    return (
      (await pool.query('SELECT * FROM products WHERE id = $1', [id])).rows[0] || null
    );
  }

  // 06 | حفظ مشترك: وجود id يعني UPDATE، وغيابه يعني INSERT.
  // req.body يحمل حقول النموذج، وRETURNING يعيد السجل بعد الحفظ.
  async function save(req, id) {
    const { name, description, image, price } = req.body;
    const values = [name, description || null, image || null, price];
    const result = id
      ? await pool.query(
          'UPDATE products SET name=$1, description=$2, image=$3, price=$4 WHERE id=$5 RETURNING *',
          [...values, id],
        )
      : await pool.query(
          'INSERT INTO products(name,description,image,price) VALUES($1,$2,$3,$4) RETURNING *',
          values,
        );
    return result.rows[0];
  }

  // 07 | تسجيل الدخول الحقيقي: ابحث عن البريد ثم قارن كلمة المرور بالـhash باستخدام bcrypt.
  // لا نحفظ كلمة المرور ولا الـhash داخل الجلسة.
  async function signIn(req) {
    const user = (
      await pool.query('SELECT id,email,password FROM users WHERE email=$1', [
        req.body.email,
      ])
    ).rows[0];
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) return null;

    // بعد نجاح المقارنة نغيّر Session ID حتى لا تظل الجلسة المجهولة القديمة صالحة.
    // Prevent session fixation and discard the anonymous session/CSRF token.

    // تحويل callback الخاص بتجديد الجلسة إلى Promise حتى ننتظر انتهاءه باستخدام await.
    await new Promise((resolve, reject) =>
      req.session.regenerate((error) => (error ? reject(error) : resolve())),
    );

    // حفظ الحد الأدنى من بيانات الحساب؛ وتوليد CSRF جديد للجلسة الجديدة.
    req.session.user = { id: user.id, email: user.email };
    csrfToken(req);

    // انتظار حفظ الجلسة في PostgreSQL قبل إعادة توجيه المتصفح إلى Dashboard.
    await new Promise((resolve, reject) =>
      req.session.save((error) => (error ? reject(error) : resolve())),
    );
    return req.session.user;
  }

  // 08 | الخروج: حذف الجلسة من التخزين ثم مسح Cookie بنفس اسمها وإعداداتها.
  async function signOut(req, res) {
    await new Promise((resolve, reject) =>
      req.session.destroy((error) => (error ? reject(error) : resolve())),
    );
    res.clearCookie('admin_ejs.sid', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  // 09 | تجهيز صفحة النموذج: values للقيم، errors للأخطاء، وediting لاختيار الإضافة أو التعديل.
  function productForm(
    req,
    res,
    { values = {}, errors = [], editing = false, status = 200 } = {},
  ) {
    return res
      .status(status)
      .render('product-form', {
        title: editing ? 'Edit product' : 'Add product',
        values,
        errors,
        editing,
      });
  }

  // 10 | استجابة موحدة عند طلب منتج غير موجود أو تم حذفه.
  function missing(res) {
    return res
      .status(404)
      .render('error', {
        title: 'Product not found',
        status: 404,
        message: 'This product does not exist or has been deleted.',
      });
  }

  // 11 | GET /signin: يعرض نموذج الدخول، أو يوجّه المستخدم للصفحة الرئيسية إذا كانت لديه جلسة.
  router.get('/signin', (req, res) =>
    req.session.user
      ? res.redirect('/')
      : res.render('signin', { title: 'Sign in', errors: [], email: '' }),
  );

  // 12 | POST /signin: يتحقق من الحقول والحساب ثم ينشئ الجلسة.
  // 400 لحقول غير صحيحة، و401 لبيانات حساب غير مطابقة، و303 للانتقال بعد نجاح POST.
  router.post('/signin', loginRules, async (req, res) => {
    const errors = errorMessages(req);
    if (errors.length)
      return res
        .status(400)
        .render('signin', {
          title: 'Sign in',
          errors,
          email: typeof req.body.email === 'string' ? req.body.email : '',
        });
    if (!(await signIn(req)))
      return res
        .status(401)
        .render('signin', {
          title: 'Sign in',
          errors: ['Invalid email or password.'],
          email: req.body.email,
        });
    return res.redirect(303, '/');
  });

  // 13 | POST /logout: لا ننفذ الخروج عن طريق رابط GET؛ الطلب يحتاج جلسة وحماية CSRF.
  router.post('/logout', requireAuth, async (req, res) => {
    await signOut(req, res);
    res.redirect(303, '/signin');
  });

  // 14 | Dashboard: نحسب عدد المنتجات في قاعدة البيانات ثم نمرره إلى القالب باسم count.
  router.get('/', requireAuth, async (req, res) => {
    const result = await pool.query('SELECT count(*)::int AS count FROM products');
    res.render('dashboard', { title: 'Dashboard', count: result.rows[0].count });
  });

  // 15 | البروفايل: القالب يستخدم user الذي جهزه app.js من بيانات الجلسة.
  router.get('/profile', requireAuth, (req, res) =>
    res.render('profile', { title: 'My profile' }),
  );

  // 16 | جدول المنتجات: q يأتي من Query String، والبحث يستخدم ILIKE بدون حساسية لحالة الحروف.
  // تمرير القيمة كمعامل يحمي الاستعلام من دمج SQL غير مرغوب.
  router.get('/products', requireAuth, async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const rows = q
      ? (
          await pool.query(
            'SELECT * FROM products WHERE name ILIKE $1 OR description ILIKE $1 ORDER BY id ASC',
            ['%' + q + '%'],
          )
        ).rows
      : (await pool.query('SELECT * FROM products ORDER BY id ASC')).rows;
    res.render('products', { title: 'Products', products: rows, q });
  });

  // 17 | عرض نموذج منتج جديد بقيم فارغة؛ لا يتم الحفظ في طلب GET.
  router.get('/products/new', requireAuth, (req, res) => productForm(req, res));

  // 18 | إضافة المنتج: عند الخطأ نعيد القيم، وعند النجاح نحفظ ونضع رسالة flash ثم نعيد التوجيه.
  router.post('/products', requireAuth, productRules, async (req, res) => {
    const errors = errorMessages(req);
    if (errors.length)
      return productForm(req, res, { values: req.body, errors, status: 400 });
    await save(req);
    req.session.flash = 'Product created successfully.';
    res.redirect(303, '/products');
  });

  // 19 | عرض نموذج التعديل بقيم المنتج الحالي بعد التأكد من وجوده.
  router.get('/products/:id/edit', requireAuth, async (req, res) => {
    const row = await product(req.params.id);
    if (!row) return missing(res);
    return productForm(req, res, { values: row, editing: true });
  });

  // 20 | حفظ التعديل: تحقق من الوجود والحقول، ثم UPDATE ورسالة نجاح.
  router.post('/products/:id/edit', requireAuth, productRules, async (req, res) => {
    const row = await product(req.params.id);
    if (!row) return missing(res);
    const errors = errorMessages(req);
    if (errors.length)
      return productForm(req, res, {
        values: { ...req.body, id: row.id },
        errors,
        editing: true,
        status: 400,
      });
    if (!(await save(req, row.id))) return missing(res);
    req.session.flash = 'Product updated successfully.';
    res.redirect(303, '/products');
  });

  // 21 | عرض تأكيد الحذف فقط؛ فتح النافذة لا يغيّر قاعدة البيانات.
  router.get('/products/:id/delete', requireAuth, async (req, res) => {
    const row = await product(req.params.id);
    if (!row) return missing(res);
    res.render('product-delete', { title: 'Delete product', product: row });
  });

  // 22 | تنفيذ الحذف بعد التأكيد؛ RETURNING يوضح هل تم حذف سجل فعلًا أم أن المنتج غير موجود.
  router.post('/products/:id/delete', requireAuth, async (req, res) => {
    if (!validId(req.params.id)) return missing(res);
    const result = await pool.query('DELETE FROM products WHERE id=$1 RETURNING id', [
      req.params.id,
    ]);
    if (!result.rowCount) return missing(res);
    req.session.flash = 'Product deleted successfully.';
    res.redirect(303, '/products');
  });

  // إرجاع Router حتى يركبه app.js داخل تطبيق Express.
  return router;
};
