#!/usr/bin/env node
/**
 * ТОЧНО. Недвижимость — сборка статического сайта.
 *
 *   src/content.json  →  dist/index.html
 *   src/styles/       →  dist/style.css
 *   src/scripts/      →  dist/site.js
 *   src/images/       →  dist/images/
 *
 * Ни одной зависимости: только стандартная библиотека Node.
 * Все тексты живут в content.json — этот файл их только расставляет.
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const SRC  = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');

/* ==========================================================================
   Вспомогательное
   ========================================================================== */

/** Экранирование для вставки в текстовый узел или атрибут. */
const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Массив строк → строки, разделённые <br>. */
const lines = (arr) => (Array.isArray(arr) ? arr : [arr]).map(esc).join('<br>');

/**
 * Заголовок из массива строк: каждый элемент — отдельная строка (<br>).
 * Фрагмент в звёздочках подсвечивается акцентным цветом: `разговора*.*`
 */
const heading = (level, parts, extra = '') => {
  const html = (Array.isArray(parts) ? parts : [parts])
    .map(esc)
    .join('<br>')
    .replace(/\*(.+?)\*/g, '<span class="accent">$1</span>');
  return `<h${level}${extra}>${html}</h${level}>`;
};

/** Собрать список HTML-фрагментов. */
const join = (arr, fn) => arr.map(fn).join('\n');

/** <picture> с WebP и JPEG-фолбэком. `src` — путь без расширения. */
const picture = (img, { className = '', loading = 'lazy', sizes = null } = {}) => {
  const cls = className ? ` class="${className}"` : '';
  const attrs = [
    `src="${esc(img.src)}.jpg"`,
    `alt="${esc(img.alt)}"`,
    `loading="${loading}"`,
    loading === 'eager' ? 'fetchpriority="high"' : 'decoding="async"',
    sizes ? `sizes="${sizes}"` : null,
  ].filter(Boolean).join(' ');
  return `<picture${cls}>
        <source srcset="${esc(img.src)}.webp" type="image/webp">
        <img ${attrs}>
      </picture>`;
};

const btn = (button, variant) =>
  `<a class="btn btn--${variant}" href="${esc(button.href)}">${esc(button.label)}</a>`;

const buttonRow = (buttons, map, extraClass = '') =>
  `<div class="btn-row${extraClass ? ' ' + extraClass : ''}">
        ${buttons.map((b) => btn(b, map[b.style] || map.default)).join('\n        ')}
      </div>`;

const sectionHead = (block, { lead = true } = {}) => `
    <div class="section-head reveal">
      <p class="eyebrow">${esc(block.eyebrow)}</p>
      ${heading(2, block.title)}
      ${lead && block.lead ? `<p class="lead">${esc(block.lead)}</p>` : ''}
    </div>`;

/* ==========================================================================
   Секции
   ========================================================================== */

/**
 * Ссылка на секцию главной страницы. На самой главной это простой якорь,
 * на внутренних страницах к нему добавляется путь — иначе якорь ведёт
 * в пустоту, потому что секции с таким id на странице нет.
 * `#top` и `#menu` есть на каждой странице, их не трогаем.
 */
const sectionLink = (href, base) =>
  href.startsWith('#') && !['#top', '#menu'].includes(href) ? base + href : href;

const renderHeader = (c, logoMark) => `
<header class="header" data-header>
  <a class="header__logo" href="#top" aria-label="${esc(c.company.name)}">${logoMark}</a>
  <div class="header__right">
    <a class="header__tel" href="${esc(c.company.phoneHref)}">${esc(c.company.phone)}</a>
    <a class="burger" href="#menu" aria-label="${esc(c.menu.openLabel)}"><span></span><span></span></a>
  </div>
</header>`;

const renderMenu = (c, base = '') => `
<nav class="menu on-night" id="menu" aria-label="Основная навигация">
  <a class="menu__close" href="#top">${esc(c.menu.closeLabel)}</a>
  ${join(c.nav, (item, i) =>
    `<a class="menu__item" href="${esc(sectionLink('#' + item.id, base))}">${esc(item.label)}<sup>${String(i + 1).padStart(2, '0')}</sup></a>`)}
  <div class="menu__foot">
    <a href="${esc(c.company.phoneHref)}">${esc(c.company.phone)}</a><br>
    ${esc(c.company.address)}<br>
    ${c.company.hours.map(esc).join(' · ')}<br>
    ${esc(c.company.geo)}
  </div>
</nav>`;

/**
 * Сколько сделок проведено на указанную дату.
 * База и скорость лежат в content.json, чтобы правились без кода.
 */
const dealsOn = (deals, date) => {
  const days = (date - new Date(deals.baseDate)) / 86400000;
  const perDay = (deals.perMonth * 12) / 365.25;
  return deals.baseCount + Math.max(0, Math.floor(days * perDay));
};

/** 10787 → «10 787», неразрывный пробел, чтобы число не рвалось по строкам. */
const ru = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const renderHero = (h, deals) => `
<section class="hero on-night">
  <div class="hero__media">${picture(h.image, { loading: 'eager', sizes: '100vw' })}</div>
  <div class="hero__inner">
    <p class="eyebrow">${esc(h.eyebrow)}</p>
    ${heading(1, h.title)}
    <p class="hero__sub">${esc(h.sub)}</p>
    ${buttonRow(h.buttons, { primary: 'primary', ghost: 'ghost', default: 'primary' })}
    <div class="stats">
      ${join(h.stats, (s) => {
        // Счётчик: в HTML попадает значение на момент сборки, чтобы число было
        // видно и без JS и попало в поисковую выдачу. Скрипт пересчитает его
        // при открытии страницы — параметры расчёта лежат в data-атрибутах.
        const counter = s.counter === 'deals';
        const value = counter ? ru(dealsOn(deals, new Date())) : esc(s.value);
        const attrs = counter
          ? ` class="stats__value accent" data-deals data-base="${deals.baseCount}"` +
            ` data-since="${esc(deals.baseDate)}" data-per-month="${deals.perMonth}"`
          : ' class="stats__value"';
        return `<div class="stats__item">
        <b${attrs}>${value}</b>
        <span class="stats__label">${esc(s.label)}</span>
      </div>`;
      })}
    </div>
  </div>
</section>`;

const renderServices = (s) => `
<section class="section wrap" id="${esc(s.id)}">
  ${sectionHead(s)}
  <div class="grid reveal">
    ${join(s.items, (item) => `<article class="card">
      <div class="card__media">${picture(item.image, { sizes: '(min-width: 60rem) 25vw, 100vw' })}</div>
      <div class="card__body">
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.text)}</p>
        <a class="btn btn--outline" href="${esc(item.cta.href)}">${esc(item.cta.label)}</a>
      </div>
    </article>`)}
  </div>
</section>`;

const renderProcess = (p) => `
<section class="section wrap" id="${esc(p.id)}">
  ${sectionHead(p)}
  <div class="grid steps reveal">
    ${join(p.steps, (step) => `<div class="step">
      <div class="step__n">${esc(step.n)}</div>
      <h3>${esc(step.title)}</h3>
      <p>${esc(step.text)}</p>
    </div>`)}
  </div>
  ${buttonRow([p.cta], { default: 'solid' }, 'reveal')}
</section>`;

const renderFormat = (f) => `
<section class="section wrap" id="${esc(f.id)}">
  ${sectionHead(f)}
  <div class="grid reveal">
    ${join(f.tiles, (tile) => `<div class="tile">
      <h3>${esc(tile.title)}</h3>
      <p>${esc(tile.text)}</p>
      <span class="label label--accent">${esc(tile.note)}</span>
    </div>`)}
  </div>
</section>`;

const renderAnalytics = (a) => `
<section class="section section--night on-night" id="${esc(a.id)}">
  <div class="wrap split">
    <div class="reveal">
      <p class="eyebrow">${esc(a.eyebrow)}</p>
      ${heading(2, a.title)}
      <p class="lead">${esc(a.lead)}</p>
      <ul class="checks">
        ${join(a.checks, (c) => `<li>${esc(c)}</li>`)}
      </ul>
      ${buttonRow(a.buttons, { primary: 'accent', ghost: 'ghost', default: 'accent' })}
    </div>
    <div class="reveal">${picture(a.image, { sizes: '(min-width: 54rem) 45vw, 100vw' })}</div>
  </div>
</section>`;

const renderAbout = (a) => `
<section class="section wrap" id="${esc(a.id)}">
  <div class="split split--reverse">
    <div class="reveal">${picture(a.image, { className: 'portrait', sizes: '(min-width: 54rem) 40vw, 100vw' })}</div>
    <div class="reveal">
      <p class="eyebrow">${esc(a.eyebrow)}</p>
      ${heading(2, a.title)}
      <div class="stack">
        ${join(a.paragraphs, (t) => `<p class="lead">${esc(t)}</p>`)}
      </div>
      ${buttonRow([a.cta], { default: 'solid' })}
      <p class="signature label">${esc(a.signature)}</p>
    </div>
  </div>
</section>`;

// Отзывов много, поэтому не сетка, а горизонтальная лента.
// Прокрутка нативная: работает мышью, трекпадом, пальцем и с клавиатуры.
const renderReviews = (r) => `
<section class="section">
  <div class="wrap">${sectionHead(r)}</div>
  <div class="scroller reveal" tabindex="0" role="region" aria-label="Отзывы клиентов">
    ${join(r.items, (item) => `<blockquote class="review">
      <div class="review__stars" aria-label="Оценка ${item.stars} из 5">${'★'.repeat(item.stars)}${'☆'.repeat(5 - item.stars)}</div>
      <p>${esc(item.text)}</p>
      <footer class="review__who label">${esc(item.who)}</footer>
    </blockquote>`)}
  </div>
</section>`;

const renderFaq = (f) => `
<section class="section wrap">
  ${sectionHead(f)}
  <div class="faq reveal">
    ${join(f.items, (item) => `<details>
      <summary>${esc(item.q)}</summary>
      <p>${esc(item.a)}</p>
    </details>`)}
  </div>
  <div class="askbox reveal">
    <div>
      <h3>${esc(f.ask.title)}</h3>
      <p>${esc(f.ask.text)}</p>
    </div>
    <a class="btn btn--solid" href="${esc(f.ask.cta.href)}">${esc(f.ask.cta.label)}</a>
  </div>
</section>`;

const field = (f) =>
  f.type === 'textarea'
    ? `<textarea name="${esc(f.name)}" rows="${f.rows || 4}" placeholder="${esc(f.placeholder)}"
            aria-label="${esc(f.label)}"${f.required ? ' required' : ''}></textarea>`
    : `<input type="${esc(f.type)}" name="${esc(f.name)}" placeholder="${esc(f.placeholder)}"
            aria-label="${esc(f.label)}"${f.required ? ' required' : ''}>`;

/** Слева — реквизиты и карта, справа — форма. */
const renderContacts = (c, company) => {
  const f = c.form;
  const map = `https://yandex.ru/map-widget/v1/?text=${encodeURIComponent(company.address)}&z=17`;
  return `
<section class="section wrap" id="${esc(c.id)}">
  ${sectionHead(c)}
  <div class="contacts">

    <div class="reveal">
      <dl class="details">
        ${join(c.details, (d) => `<dt class="label">${esc(d.term)}</dt>
        <dd>${d.href ? `<a href="${esc(d.href)}">${lines(d.value)}</a>` : lines(d.value)}</dd>`)}
      </dl>
      <div class="map">
        <iframe src="${esc(map)}" title="Карта: ${esc(company.address)}" loading="lazy" allowfullscreen></iframe>
      </div>
      <a class="map__link label" href="${esc(company.mapUrl)}" target="_blank" rel="noopener">${esc(company.mapLinkLabel)}</a>
    </div>

    <form class="lead-form reveal" data-form novalidate>
      <div class="form__fields">
        ${join(f.fields, field)}
      </div>
      <div class="consents">
        ${join(f.consents, (con) => `<label>
          <input type="checkbox" name="${esc(con.name)}" required>
          <span>${esc(con.text)}${con.linkLabel ? ` <a href="${esc(con.linkHref)}">${esc(con.linkLabel)}</a>` : ''}</span>
        </label>`)}
      </div>
      <button class="btn btn--accent" type="submit" data-submit data-sent-label="${esc(f.submitted)}" disabled>${esc(f.submit)}</button>
      <p class="form__success" data-success role="status">${esc(f.success)}</p>
    </form>

  </div>
</section>`;
};

const renderFooter = (c, logoFull, base = '') => `
<footer class="footer on-night">
  <div class="footer__logo">${logoFull}</div>
  <div class="footer__grid">
    ${join(c.footer.columns, (col) => `<div>${
      col.links
        ? col.links.map((l) => `<a href="${esc(sectionLink(l.href, base))}">${esc(l.label)}</a>`).join('<br>')
        : col.lines.map(esc).join('<br>')
    }</div>`)}
  </div>
  <p class="footer__legal">${esc(c.footer.legal)}</p>
</footer>`;

/* ==========================================================================
   Документ целиком
   ========================================================================== */

/** Общая «шапка» документа для обеих страниц. */
const head = (c, { title, description, canonical, extra = '' }) => `<!DOCTYPE html>
<html lang="${esc(c.meta.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="generator" content="build.js · ${new Date().toISOString().slice(0, 16)}Z">
<link rel="canonical" href="${esc(canonical)}">
<link rel="stylesheet" href="style.css">
<script>document.documentElement.className = "js";</script>
${extra}</head>`;

/** Вторая страница: политика конфиденциальности. */
const renderPrivacy = (c, { logoMark, logoFull }) => `${head(c, {
  title: c.privacy.title,
  description: c.privacy.description,
  canonical: c.meta.url + 'privacy.html',
  extra: '<meta name="robots" content="noindex">\n',
})}
<body>
${renderHeader(c, logoMark)}
${renderMenu(c, './')}

<main id="top" class="section wrap doc">
  <p class="eyebrow">${esc(c.company.name)}</p>
  ${heading(1, c.privacy.heading)}
  <p class="lead">${esc(c.privacy.updated)}</p>
  ${join(c.privacy.sections, (s) => `
  <section class="doc__block">
    <h2>${esc(s.title)}</h2>
    ${join(s.paragraphs, (t) => `<p>${esc(t)}</p>`)}
  </section>`)}
  <p class="btn-row"><a class="btn btn--solid" href="./">${esc(c.privacy.backLabel)}</a></p>
</main>

${renderFooter(c, logoFull, './')}
<script src="site.js" defer></script>
</body>
</html>
`;

const renderPage = (c, { logoMark, logoFull }) => `<!DOCTYPE html>
<html lang="${esc(c.meta.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>${esc(c.meta.title)}</title>
<meta name="description" content="${esc(c.meta.description)}">
<meta name="generator" content="build.js · ${new Date().toISOString().slice(0, 16)}Z">

<link rel="canonical" href="${esc(c.meta.url)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(c.meta.title)}">
<meta property="og:description" content="${esc(c.meta.description)}">
<meta property="og:image" content="${esc(c.meta.url)}${esc(c.meta.ogImage)}">
<meta property="og:locale" content="ru_RU">
<link rel="preload" as="image" href="${esc(c.hero.image.src)}.webp" type="image/webp" fetchpriority="high">
<link rel="stylesheet" href="style.css">
<script>document.documentElement.className = "js";</script>
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'RealEstateAgent',
  name: c.company.name,
  telephone: c.company.phone,
  url: c.meta.url,
  image: c.meta.url + c.meta.ogImage,
  address: { '@type': 'PostalAddress', streetAddress: c.company.addressShort, addressLocality: 'Пенза', addressCountry: 'RU' },
  openingHours: c.company.hours,
})}</script>
</head>
<body>
${renderHeader(c, logoMark)}
${renderMenu(c)}

<main id="top">
${renderHero(c.hero, c.deals)}
${renderServices(c.services)}
${renderProcess(c.process)}
${renderFormat(c.geografiya)}
${renderAnalytics(c.analytics)}
${renderAbout(c.about)}
${renderReviews(c.reviews)}
${renderFaq(c.faq)}
${renderContacts(c.contacts, c.company)}
</main>

${renderFooter(c, logoFull)}
<script src="site.js" defer></script>
</body>
</html>
`;

/* ==========================================================================
   Запуск
   ========================================================================== */

/** Рекурсивное копирование каталога. Пишем только содержимое файлов —
 *  fs.cpSync дополнительно переносит права доступа и падает на сетевых ФС. */
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.writeFileSync(dst, fs.readFileSync(src));
  }
}

function build() {
  const content  = JSON.parse(fs.readFileSync(path.join(SRC, 'content.json'), 'utf8'));
  const logoMark = fs.readFileSync(path.join(SRC, 'partials/logo-mark.svg'), 'utf8').trim();
  const logoFull = fs.readFileSync(path.join(SRC, 'partials/logo-full.svg'), 'utf8').trim();

  // Чистим прошлую сборку. На некоторых ФС (сетевые диски, песочницы)
  // удаление запрещено — тогда просто перезаписываем файлы поверх.
  try {
    fs.rmSync(DIST, { recursive: true, force: true });
  } catch {
    console.warn('Предупреждение: не удалось очистить dist/, пишу поверх.');
  }
  fs.mkdirSync(DIST, { recursive: true });

  fs.writeFileSync(path.join(DIST, 'index.html'),   renderPage(content,    { logoMark, logoFull }));
  fs.writeFileSync(path.join(DIST, 'privacy.html'), renderPrivacy(content, { logoMark, logoFull }));
  fs.writeFileSync(path.join(DIST, 'style.css'), fs.readFileSync(path.join(SRC, 'styles/style.css')));
  fs.writeFileSync(path.join(DIST, 'site.js'),   fs.readFileSync(path.join(SRC, 'scripts/site.js')));
  copyDir(path.join(SRC, 'images'), path.join(DIST, 'images'));

  const kb = (p) => (fs.statSync(p).size / 1024).toFixed(1).padStart(6) + ' КБ';
  console.log('Собрано в dist/');
  console.log('  index.html   ' + kb(path.join(DIST, 'index.html')));
  console.log('  privacy.html ' + kb(path.join(DIST, 'privacy.html')));
  console.log('  style.css    ' + kb(path.join(DIST, 'style.css')));
  console.log('  site.js      ' + kb(path.join(DIST, 'site.js')));
  console.log('  images/      ' + fs.readdirSync(path.join(DIST, 'images')).length + ' файлов');
}

build();
