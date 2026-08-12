/* ТОЧНО. Недвижимость — поведение страницы.
   Скрипт необязательный: без него сайт полностью читается и работает. */
(() => {
  'use strict';

  /* --- Шапка становится непрозрачной после первого экрана ---------------- */
  const header = document.querySelector('[data-header]');
  if (header) {
    const sync = () => header.classList.toggle('is-solid', scrollY > innerHeight * 0.82);
    addEventListener('scroll', sync, { passive: true });
    sync();
  }

  /* --- Форма заявки ------------------------------------------------------ */
  const form = document.querySelector('[data-form]');
  if (form) {
    const submit   = form.querySelector('[data-submit]');
    const success  = form.querySelector('[data-success]');
    const consents = [...form.querySelectorAll('input[type="checkbox"]')];

    const syncSubmit = () => { submit.disabled = !consents.every((c) => c.checked); };
    consents.forEach((c) => c.addEventListener('change', syncSubmit));
    syncSubmit();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }

      // TODO: заменить на реальную отправку (fetch на бэкенд или CRM).
      success.classList.add('is-visible');
      submit.disabled = true;
      submit.textContent = submit.dataset.sentLabel || 'Отправлено';
    });
  }

  /* --- Появление блоков при скролле -------------------------------------- */
  const revealables = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    revealables.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      io.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  revealables.forEach((el) => io.observe(el));
})();
