const test = require('node:test');
const assert = require('node:assert/strict');

// منع رجوع خطأ Vercel: نقطة الدخول يجب أن تصدّر تطبيق Express القابل لاستقبال الطلبات.
test('Vercel entry exports a configured Express handler', () => {
  process.env.SESSION_SECRET = 'vercel-entry-test-secret-with-at-least-32-characters';
  const app = require('../app');

  assert.equal(typeof app, 'function');
  assert.equal(typeof app.handle, 'function');
  assert.equal(app.get('view engine'), 'ejs');
  assert.ok(app.locals.sessionStore);
  app.locals.sessionStore.close();
});
