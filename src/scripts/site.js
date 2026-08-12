/* ТОЧНО. Недвижимость — поведение страницы.
   Скрипт необязательный: без него сайт полностью читается и работает. */
(() => {
  'use strict';

  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- Шапка ------------------------------------------------------------
     Плашка появляется при первом же движении скролла, а не после первого
     экрана: логотип белым по светлой фотографии сливается с картинкой. */
  const header = document.querySelector('[data-header]');
  if (header) {
    const sync = () => header.classList.toggle('is-solid', scrollY > 8);
    addEventListener('scroll', sync, { passive: true });
    sync();
  }

  /* --- Показатели на первом экране ---------------------------------------
     Числа докручиваются от нуля, когда блок появляется на экране.
     В разметке лежат готовые значения, так что без скрипта и при
     выключенной анимации они просто показаны сразу.                       */

  /** 10824 → «10 824» неразрывными пробелами, как в собранной странице. */
  const ru = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  /** Сколько сделок проведено сегодня — от базы и скорости из разметки. */
  const dealsToday = (el) => {
    const days = (Date.now() - new Date(el.dataset.since).getTime()) / 86400000;
    const perDay = (Number(el.dataset.perMonth) * 12) / 365.25;
    return Number(el.dataset.base) + Math.max(0, Math.floor(days * perDay));
  };

  const stats = [...document.querySelectorAll('.stats__value')].map((el) => {
    const target = el.hasAttribute('data-deals') ? dealsToday(el) : null;
    const text = target !== null ? ru(target) : el.textContent;
    // Число внутри строки: «24 года», «50+», «10 824». Если цифр нет
    // («Вся Россия»), крутить нечего — оставляем как есть.
    const match = text.match(/[\d   ]*\d/);
    el.textContent = text;
    if (!match) return null;
    return {
      el,
      to: Number(match[0].replace(/[^\d]/g, '')),
      before: text.slice(0, match.index),
      after: text.slice(match.index + match[0].length),
    };
  }).filter(Boolean);

  const runCounters = () => {
    const DURATION = 3200;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / DURATION);
      const eased = 1 - Math.pow(1 - t, 4);   // быстрый разгон, мягкая остановка
      stats.forEach((s) => {
        s.el.textContent = s.before + ru(Math.round(s.to * eased)) + s.after;
      });
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const statsBlock = document.querySelector('.stats');
  if (statsBlock && stats.length && !calm && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries, self) => {
      if (!entries[0].isIntersecting) return;
      self.disconnect();
      runCounters();
    }, { threshold: 0.4 });
    io.observe(statsBlock);
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
