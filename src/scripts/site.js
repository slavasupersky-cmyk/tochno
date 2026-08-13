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

  /* --- Меню --------------------------------------------------------------
     Открывается и закрывается на CSS через :target — без скрипта тоже
     работает. Скрипт добавляет две привычные мелочи: закрытие по Esc
     и возврат ровно туда, откуда меню открыли, а не наверх страницы. */
  const menu = document.getElementById('menu');
  if (menu) {
    let returnTo = 0;

    const closeMenu = () => {
      if (location.hash !== '#menu') return;
      const y = returnTo;
      history.replaceState(null, '', location.pathname + location.search);
      scrollTo({ top: y, behavior: 'auto' });
    };

    document.querySelectorAll('a[href="#menu"]').forEach((opener) => {
      opener.addEventListener('click', () => { returnTo = scrollY; });
    });

    const closer = menu.querySelector('.menu__close');
    if (closer) closer.addEventListener('click', (e) => { e.preventDefault(); closeMenu(); });

    addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
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

    /* Куда уходит заявка — из атрибута data-endpoint, а он из content.json.
       Пока адрес не задан, форма НЕ показывает «заявка принята»: врать
       посетителю хуже, чем честно попросить позвонить. */
    const endpoint = form.dataset.endpoint || '';
    const errorBox = form.querySelector('[data-error]');

    const showError = (text) => {
      errorBox.textContent = text;
      errorBox.classList.add('is-visible');
    };
    const hideError = () => errorBox.classList.remove('is-visible');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();
      if (!form.checkValidity()) { form.reportValidity(); return; }

      if (!endpoint) {
        console.error('[форма] Не задан data-endpoint — заявка никуда не уйдёт.');
        showError(errorBox.dataset.noEndpoint);
        return;
      }

      submit.disabled = true;
      submit.textContent = submit.dataset.sendingLabel;
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: new FormData(form),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        success.classList.add('is-visible');
        submit.classList.remove('is-ready');
        submit.textContent = submit.dataset.sentLabel;
        form.reset();
      } catch (err) {
        console.error('[форма] Не удалось отправить заявку:', err);
        showError(errorBox.dataset.failed);
        submit.disabled = false;
        submit.textContent = submit.dataset.label;
      }
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
