/* ТОЧНО. Недвижимость — поведение страницы.
   Скрипт необязательный: без него сайт полностью читается и работает. */
(() => {
  'use strict';

  /* --- Шапка ------------------------------------------------------------
     Плашка появляется при первом же движении скролла, а не после первого
     экрана: логотип белым по светлой фотографии сливается с картинкой. */
  const header = document.querySelector('[data-header]');
  if (header) {
    const sync = () => header.classList.toggle('is-solid', scrollY > 8);
    addEventListener('scroll', sync, { passive: true });
    sync();
  }

  /* --- Счётчик сделок ----------------------------------------------------
     В HTML лежит число на момент сборки — оно видно и без скрипта.
     Здесь пересчитываем его на сегодня от базы и скорости из data-атрибутов. */
  const counter = document.querySelector('[data-deals]');
  if (counter) {
    const base     = Number(counter.dataset.base);
    const since    = new Date(counter.dataset.since);
    const perDay   = (Number(counter.dataset.perMonth) * 12) / 365.25;
    const days     = (Date.now() - since.getTime()) / 86400000;
    const total    = base + Math.max(0, Math.floor(days * perDay));
    counter.textContent = total.toLocaleString('ru-RU').replace(/ /g, ' ');
  }

  /* --- Форма заявки ------------------------------------------------------ */
  const form = document.querySelector('[data-form]');
  if (form) {
    const submit  = form.querySelector('[data-submit]');
    const success = form.querySelector('[data-success]');

    // Кнопка оживает, когда заполнены обязательные поля и стоит галочка.
    const sync = () => {
      const ready = form.checkValidity();
      submit.disabled = !ready;
      submit.classList.toggle('is-ready', ready);
    };
    form.addEventListener('input', sync);
    form.addEventListener('change', sync);
    sync();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }

      // TODO: заменить на реальную отправку (fetch на бэкенд или CRM).
      success.classList.add('is-visible');
      submit.disabled = true;
      submit.classList.remove('is-ready');
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
