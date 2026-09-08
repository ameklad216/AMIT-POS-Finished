// 01 | تحسينات عرض لصفحة الدخول داخل دالة فورية؛ المصادقة الفعلية تتم على السيرفر.
(() => {
  const input = document.getElementById('password');
  const toggle = document.querySelector('.password-toggle');

  // 02 | تبديل عرض كلمة المرور مع تحديث وصف الزر لقارئات الشاشة.
  toggle.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(show));
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  // 03 | منع الضغط المتكرر أثناء إرسال النموذج؛ لا نمنع POST ولا نفحص الحساب هنا.
  document.querySelector('[data-login-form]').addEventListener('submit', (event) => {
    const button = event.currentTarget.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Signing in...';
  });

  // 04 | إعادة التحميل عند الرجوع من ذاكرة المتصفح حتى تظهر حالة الجلسة الحالية.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) window.location.reload();
  });
})();
