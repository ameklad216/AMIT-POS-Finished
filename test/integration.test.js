// اختبارات تكامل: ترسل HTTP حقيقيًا وتستخدم schema مؤقتة؛ لا تعدل بيانات التطبيق.
require('dotenv').config({ quiet: true });
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { createApp } = require('../create-app');
const { databaseConfig } = require('../database');

// تجهيز البيئة المعزولة ثم تشغيل السيناريوهات وتنظيف الموارد في finally.
test('EJS forms and PostgreSQL sessions', async (t) => {
  const schema = 'ejs_test_' + process.pid + '_' + Date.now();
  const config = databaseConfig();
  // Schema-isolated tests need a direct connection, not transaction pooling.
  if (config.connectionString) {
    const url = new URL(config.connectionString);
    if (url.hostname.endsWith('.neon.tech'))
      url.hostname = url.hostname.replace('-pooler.', '.');
    config.connectionString = url.toString();
  }
  const admin = new Pool(config);
  await admin.query('CREATE SCHEMA "' + schema + '"');
  const pool = new Pool({ ...config, options: '-c search_path=' + schema });
  let app, server, base;

  // تشغيل نسخة Express على منفذ عشوائي خاص بالاختبار.
  async function start() {
    app = createApp({
      pool,
      secret: 'integration-only-secret-at-least-32-characters',
      sessionSchema: schema,
      logging: false,
      production: false,
    });
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    base = 'http://127.0.0.1:' + server.address().port;
  }

  // إغلاق نسخة الاختبار ومخزن الجلسات قبل إعادة التشغيل أو إنهاء السيناريوهات.
  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    await app.locals.sessionStore.close();
  }

  // عميل اختبار بسيط يحتفظ بالـCookie وCSRF مثل المتصفح.
  function client(cookie = '') {
    return {
      cookie,
      csrf: '',

      // إرسال نموذج عادي ثم التقاط Cookie ورمز CSRF من استجابة HTML.
      async request(route, { method = 'GET', data, csrf = true, headers = {} } = {}) {
        const fields =
          data !== undefined
            ? { ...(csrf ? { _csrf: this.csrf } : {}), ...data }
            : null;
        const response = await fetch(base + route, {
          method,
          redirect: 'manual',
          headers: {
            ...(this.cookie ? { Cookie: this.cookie } : {}),
            ...(fields ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
            ...headers,
          },
          ...(fields ? { body: new URLSearchParams(fields).toString() } : {}),
        });
        const cookieHeader = response.headers
          .getSetCookie()
          .find((value) => value.startsWith('admin_ejs.sid='));
        if (cookieHeader) this.cookie = cookieHeader.split(';')[0];
        const text = await response.text();
        const token = text.match(/name="_csrf" value="([^"]+)"/);
        if (token) this.csrf = token[1];
        return { status: response.status, headers: response.headers, text };
      },

      // تنفيذ تدفق الدخول الكامل: GET للنموذج ثم POST ثم التحقق من الصفحة الرئيسية.
      async login() {
        await this.request('/signin');
        const result = await this.request('/signin', {
          method: 'POST',
          data: { email: 'admin@test.com', password: 'password123' },
        });
        assert.equal(result.status, 303);
        assert.equal(result.headers.get('location'), '/');
        assert.equal((await this.request('/')).status, 200);
      },
    };
  }

  // قراءة عدد السجلات للتحقق من تأثير الإضافة والحذف أو من أن طلبًا مرفوضًا لم يغير البيانات.
  const count = async () =>
    (await pool.query('SELECT count(*)::int AS n FROM products')).rows[0].n;
  try {
    // حاجز أمان: يجب أن يشير الاتصال إلى schema الاختبار قبل تشغيل seed.sql.
    assert.equal(
      (await pool.query('SELECT current_schema() AS name')).rows[0].name,
      schema,
      'Tests must only touch their isolated schema',
    );
    await pool.query(fs.readFileSync(path.join(__dirname, '../seed.sql'), 'utf8'));
    await start();

    // اختبار 1 | رفض الوصول دون جلسة حتى لو احتوى الطلب على Bearer قديم.
    await t.test(
      'anonymous access and Bearer headers cannot authenticate',
      async () => {
        for (const route of ['/', '/products', '/products/new', '/profile']) {
          const result = await client().request(route, {
            headers: { Authorization: 'Bearer legacy-token' },
          });
          assert.equal(result.status, 302);
          assert.equal(result.headers.get('location'), '/signin');
        }
      },
    );

    // اختبار 2 | التأكد من صفحة الدخول والكوكي وكل الملفات الثابتة المتبقية.
    await t.test('login page and all remaining static assets render', async () => {
      const c = client();
      const page = await c.request('/signin');
      assert.equal(page.status, 200);
      assert.match(page.text, /AMIT POS/);
      assert.doesNotMatch(page.text, /react|vite|localStorage/);
      assert.match(page.headers.get('set-cookie'), /HttpOnly/);
      assert.match(page.headers.get('set-cookie'), /SameSite=Lax/);
      for (const file of fs.readdirSync(path.join(__dirname, '../public'), {
        recursive: true,
      })) {
        if (fs.statSync(path.join(__dirname, '../public', file)).isFile()) {
          assert.equal(
            (await c.request('/assets/' + file.replaceAll('\\', '/'))).status,
            200,
            file,
          );
        }
      }
    });

    // اختبار 3 | رفض الطلب دون CSRF وإظهار خطأ لكلمة المرور غير الصحيحة.
    await t.test('missing CSRF and wrong password are rejected', async () => {
      const c = client();
      await c.request('/signin');
      assert.equal(
        (
          await c.request('/signin', {
            method: 'POST',
            csrf: false,
            data: { email: 'admin@test.com', password: 'password123' },
          })
        ).status,
        403,
      );
      const bad = await c.request('/signin', {
        method: 'POST',
        data: { email: 'admin@test.com', password: 'wrong' },
      });
      assert.equal(bad.status, 401);
      assert.match(bad.text, /Invalid email or password/);
    });

    // اختبار 4 | تجديد الجلسة ورمز CSRF وإبطال الجلسة القديمة عند الدخول.
    await t.test(
      'HTML login rotates cookie and CSRF; old session is invalid',
      async () => {
        const c = client();
        await c.request('/signin');
        const cookie = c.cookie,
          csrf = c.csrf;
        await c.login();
        assert.notEqual(c.cookie, cookie);
        assert.notEqual(c.csrf, csrf);
        assert.equal((await client(cookie).request('/profile')).status, 302);
        assert.equal(
          (
            await c.request('/products', {
              method: 'POST',
              data: { _csrf: csrf, name: 'No', price: '1' },
            })
          ).status,
          403,
        );
      },
    );

    // اختبار 5 | التأكد من استمرار الجلسة بعد إعادة تشغيل نسخة التطبيق.
    await t.test('session persists through application restart', async () => {
      const c = client();
      await c.login();
      await stop();
      await start();
      const result = await c.request('/profile');
      assert.equal(result.status, 200);
      assert.match(result.text, /admin@test.com/);
    });

    // اختبار 6 | عرض الصفحات الأساسية عندما يكون جدول المنتجات فارغًا.
    await t.test('core EJS pages and empty catalogue render', async () => {
      const c = client();
      await c.login();
      for (const route of ['/', '/products', '/products/new', '/profile'])
        assert.equal((await c.request(route)).status, 200, route);
      assert.match((await c.request('/products')).text, /No products yet/);
    });

    // اختبار 7 | التأكد من أن مسارات API القديمة المحذوفة لا تعمل.
    await t.test('all nine removed API endpoints are unavailable', async () => {
      const c = client();
      await c.login();
      for (const [method, route] of [
        ['GET', '/api/auth/csrf'],
        ['POST', '/api/auth/login'],
        ['GET', '/api/auth/me'],
        ['POST', '/api/auth/logout'],
        ['GET', '/api/products'],
        ['POST', '/api/products'],
        ['GET', '/api/products/1'],
        ['PUT', '/api/products/1'],
        ['DELETE', '/api/products/1'],
      ]) {
        const result = await c.request(route, {
          method,
          ...(method === 'GET' ? {} : { data: {} }),
        });
        assert.equal(result.status, 404, method + ' ' + route);
        assert.match(result.headers.get('content-type'), /text\/html/);
      }
    });

    // اختبار 8 | رفض الكتابة والخروج دون CSRF دون تغيير بيانات المستخدم.
    await t.test('CSRF prevents unauthorised writes and logout', async () => {
      const c = client();
      await c.login();
      assert.equal(
        (
          await c.request('/products', {
            method: 'POST',
            csrf: false,
            data: { name: 'No', price: '1' },
          })
        ).status,
        403,
      );
      assert.equal(
        (await c.request('/logout', { method: 'POST', csrf: false, data: {} })).status,
        403,
      );
      assert.equal((await c.request('/profile')).status, 200);
      assert.equal(await count(), 0);
    });

    // اختبار 9 | فحص المدخلات غير الصحيحة قبل الحفظ في قاعدة البيانات.
    await t.test('invalid prices, names and image URLs cannot be saved', async () => {
      const c = client();
      await c.login();
      for (const data of [
        { name: ' ', price: '1' },
        { name: 'x', price: '-1' },
        { name: 'x', price: '1.234' },
        { name: 'x', price: '' },
        { name: 'x', price: 'Infinity' },
        { name: 'x', price: '10000000000' },
        { name: 'x', price: '1', image: 'javascript:alert(1)' },
        { name: 'x'.repeat(71), price: '1' },
      ]) {
        assert.equal(
          (await c.request('/products', { method: 'POST', data })).status,
          400,
        );
      }
      assert.equal(await count(), 0);
    });

    // اختبار 10 | دورة CRUD كاملة بالنماذج مع فحص السعر والبحث وescaping وتأكيد الحذف.
    await t.test(
      'HTML CRUD persists currency, escapes input and confirms deletion',
      async () => {
        const c = client();
        await c.login();
        const name = '<script>alert(1)</script>';
        assert.equal(
          (
            await c.request('/products', {
              method: 'POST',
              data: { name, price: '12.34', description: 'EJS form test', image: '' },
            })
          ).status,
          303,
        );
        const row = (await pool.query('SELECT * FROM products WHERE name=$1', [name]))
          .rows[0];
        assert.equal(row.price, '12.34');
        const listing = await c.request('/products?q=alert');
        assert.match(listing.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
        assert.doesNotMatch(listing.text, /<script>alert/);
        assert.match((await c.request('/')).text, /class="stat-number">\s*1\s*</);
        assert.match(
          (await c.request('/products/' + row.id + '/edit')).text,
          /data-product-panel/,
        );
        assert.equal(
          (
            await c.request('/products/' + row.id + '/edit', {
              method: 'POST',
              data: { name: 'Updated product', price: '0' },
            })
          ).status,
          303,
        );
        assert.equal(
          (await pool.query('SELECT price FROM products WHERE id=$1', [row.id])).rows[0]
            .price,
          '0.00',
        );
        assert.match((await c.request('/products?q=Updated')).text, /Updated product/);
        assert.equal((await c.request('/products/' + row.id + '/delete')).status, 200);
        assert.equal(await count(), 1);
        assert.equal(
          (
            await c.request('/products/' + row.id + '/delete', {
              method: 'POST',
              csrf: false,
              data: {},
            })
          ).status,
          403,
        );
        assert.equal(await count(), 1);
        assert.equal(
          (
            await c.request('/products/' + row.id + '/delete', {
              method: 'POST',
              data: {},
            })
          ).status,
          303,
        );
        assert.equal(await count(), 0);
        assert.equal((await c.request('/products/' + row.id + '/edit')).status, 404);
      },
    );

    // اختبار 11 | الحفاظ على القيم المدخلة عند عرض أخطاء النموذج.
    await t.test('validation errors preserve entered values', async () => {
      const c = client();
      await c.login();
      const result = await c.request('/products', {
        method: 'POST',
        data: { name: 'Keep my input', price: '-1' },
      });
      assert.equal(result.status, 400);
      assert.match(result.text, /Keep my input/);
      assert.match(result.text, /role="alert"/);
    });

    // اختبار 12 | إرجاع 404 للمعرفات غير الصحيحة أو السجلات غير الموجودة.
    await t.test('invalid and missing product IDs return controlled 404s', async () => {
      const c = client();
      await c.login();
      for (const id of ['nope', '0', '999999999999', '2147483647']) {
        for (const action of ['edit', 'delete']) {
          assert.equal((await c.request('/products/' + id + '/' + action)).status, 404);
          assert.equal(
            (
              await c.request('/products/' + id + '/' + action, {
                method: 'POST',
                data: { name: 'Missing', price: '1' },
              })
            ).status,
            404,
          );
        }
      }
    });

    // اختبار 13 | إبطال الجلسة عند الخروج حتى لو أعيد استخدام Cookie القديمة.
    await t.test('logout destroys the session and prevents cookie replay', async () => {
      const c = client();
      await c.login();
      const cookie = c.cookie;
      const result = await c.request('/logout', { method: 'POST', data: {} });
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), '/signin');
      assert.equal((await client(cookie).request('/profile')).status, 302);
    });

    // اختبار 14 | رفض الجلسة بعد انتهاء صلاحيتها.
    await t.test('expired sessions redirect to login', async () => {
      const c = client();
      await c.login();
      const sid = decodeURIComponent(c.cookie.split('=')[1]).slice(2).split('.')[0];
      await pool.query(
        "UPDATE sessions SET expire=NOW()-INTERVAL '1 minute' WHERE sid=$1",
        [sid],
      );
      assert.equal((await c.request('/profile')).headers.get('location'), '/signin');
    });

    // اختبار 15 | إظهار صفحات أخطاء مفهومة للمسارات المفقودة والطلبات الكبيرة.
    await t.test('unknown pages and oversized forms return HTML errors', async () => {
      assert.equal((await client().request('/missing')).status, 404);
      const response = await fetch(base + '/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'email=' + 'x'.repeat(34000),
      });
      assert.equal(response.status, 413);
      assert.match(await response.text(), /Request body too large/);
    });
  } finally {
    if (server?.listening) await stop();
    await pool.end();
    assert.match(schema, /^ejs_test_\d+_\d+$/);
    await admin.query('DROP SCHEMA "' + schema + '" CASCADE');
    await admin.end();
  }
});

