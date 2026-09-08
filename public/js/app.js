// EJS forms remain usable without JavaScript; dialogs enhance the same routes.

// 01 | تحسينات الواجهة داخل دالة فورية؛ جميع عمليات الحفظ تظل نماذج EJS تعمل بدون JavaScript.
(() => {
  const menu = document.querySelector('[data-sidebar-toggle]');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  const mobile = matchMedia('(max-width:1023px)');

  // 02 | فتح وإغلاق قائمة الموبايل؛ inert يمنع الوصول للعناصر المخفية بالكيبورد.
  function setMenu(open) {
    document.body.classList.toggle('menu-open', open);
    menu?.setAttribute('aria-expanded', String(open));
    if (overlay) overlay.hidden = !open;
    if (sidebar) sidebar.inert = mobile.matches && !open;
  }
  setMenu(false);

  // 03 | زر القائمة يبدل الحالة وينقل التركيز لأول رابط عند الفتح.
  menu?.addEventListener('click', () => {
    setMenu(!document.body.classList.contains('menu-open'));
    if (document.body.classList.contains('menu-open'))
      sidebar.querySelector('a')?.focus();
  });

  // أزرار الإغلاق تعيد التركيز لزر القائمة حتى لا يضيع مكان المستخدم.
  document.querySelectorAll('[data-sidebar-close]').forEach((button) =>
    button.addEventListener('click', () => {
      setMenu(false);
      menu?.focus();
    }),
  );

  // إعادة ضبط القائمة عند تغير حجم الشاشة بين الموبايل والديسكتوب.
  mobile.addEventListener('change', () => setMenu(false));
  const account = document.querySelector('.account-menu');

  // 04 | إغلاق قائمة الحساب عند الضغط خارجها.
  document.addEventListener('click', (event) => {
    if (account && !account.contains(event.target)) account.open = false;
  });

  // 05 | مفتاح Escape يغلق القوائم ويعيد التركيز إلى العنصر المناسب.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (document.body.classList.contains('menu-open')) {
        setMenu(false);
        menu?.focus();
      }
      if (account?.open) {
        account.open = false;
        account.querySelector('summary').focus();
      }
    }
  });

  // 06 | صورة بديلة إذا فشل تحميل صورة منتج؛ once يمنع تكرار معالجة الخطأ إلى ما لا نهاية.
  document.querySelectorAll('[data-product-image]').forEach((image) => {
    // استبدال رابط الصورة المعطل بالأصل المحلي البديل.
    const fallback = () => {
      image.src = '/assets/images/placeholder.svg';
    };
    image.addEventListener('error', fallback, { once: true });
    if (image.complete && image.naturalWidth === 0) fallback();
  });

  // 07 | تحديث عداد حروف الوصف أثناء الكتابة؛ هذا تحسين عرض وليس بديلًا للتحقق الخلفي.
  document.addEventListener('input', (event) => {
    if (event.target.name === 'description') {
      const count = event.target
        .closest('.field')
        .querySelector('[data-description-count]');
      if (count) count.textContent = event.target.value.length + '/5000 characters';
    }
  });
  const dialog = document.querySelector('.product-dialog');
  let opening = false;

  // 08 | فتح نموذج الإضافة أو التعديل أو الحذف في dialog؛ الرابط الأصلي يظل بديلًا بدون JavaScript.
  document.addEventListener('click', async (event) => {
    // إذا ضغط المستخدم Cancel داخل النافذة نغلقها بدل الانتقال إلى صفحة أخرى.
    const cancel = event.target.closest('[data-modal-cancel]');
    if (cancel && dialog?.open && dialog.contains(cancel)) {
      event.preventDefault();
      dialog.close();
      return;
    }

    // نتجاهل النقرات المعدلة مثل Ctrl+Click حتى نحافظ على سلوك فتح الروابط في تبويب جديد.
    const link = event.target.closest('[data-product-modal]');
    if (
      !link ||
      !dialog ||
      typeof dialog.showModal !== 'function' ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    if (opening) return;
    opening = true;
    link.setAttribute('aria-busy', 'true');
    try {
      // 09 | جلب HTML من مسار EJS مع Cookie الجلسة؛ لا توجد JSON API هنا.
      const response = await fetch(link.href, { credentials: 'same-origin' });
      if (!response.ok || response.redirected) {
        location.assign(response.url || link.href);
        return;
      }

      // استخراج جزء النموذج فقط من صفحة HTML ووضعه داخل النافذة الحالية.
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const panel = page.querySelector('[data-product-panel]');
      if (!panel) throw new Error('Missing product form');
      dialog.replaceChildren(document.importNode(panel, true));
      dialog.showModal();
      dialog.querySelector('input:not([type="hidden"]),[data-modal-cancel]')?.focus();
    } catch {
      location.assign(link.href);
    } finally {
      opening = false;
      link.removeAttribute('aria-busy');
    }
  });

  // 10 | إغلاق النافذة عند النقر على الخلفية خارج حدودها.
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) {
      const box = dialog.getBoundingClientRect();
      if (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
      )
        dialog.close();
    }
  });

  // 11 | تعطيل زر الحفظ أثناء الطلب لمنع الإرسال المتكرر؛ السيرفر ما زال ينفذ التحقق وCSRF.
  document.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-submit-form]')) return;
    const button = event.target.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = true;
      button.textContent = 'Please wait...';
    }
  });

  // 12 | إعادة قراءة الصفحة من السيرفر عند استرجاعها من ذاكرة الرجوع في المتصفح.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload();
  });
})();
