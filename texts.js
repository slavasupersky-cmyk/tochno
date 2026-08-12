#!/usr/bin/env node
/**
 * Экспорт и импорт текстов: src/content.json ⇄ TEXTS.md
 *
 *   node texts.js export   → собирает TEXTS.md из content.json
 *   node texts.js import   → раскладывает правки из TEXTS.md обратно в content.json
 *
 * В TEXTS.md каждый текст помечен служебной строкой вида
 *   <!--hero.title|lines-->
 * По ней импорт понимает, куда класть значение. Сам текст правится свободно.
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const CONTENT = path.join(__dirname, 'src/content.json');
const TEXTS   = path.join(__dirname, 'TEXTS.md');

/* --------------------------------------------------------------------------
   Что НЕ экспортируем: технические поля. Их правят в content.json руками.
   -------------------------------------------------------------------------- */
const SKIP_KEYS = new Set([
  '_comment', 'id', 'src', 'href', 'phoneHref', 'mapUrl', 'linkHref',
  'url', 'ogImage', 'lang', 'name', 'type', 'style', 'stars', 'required', 'n',
]);

/* --------------------------------------------------------------------------
   Человеческие названия разделов и полей — только для читаемости TEXTS.md.
   На импорт никак не влияют.
   -------------------------------------------------------------------------- */
const SECTIONS = {
  meta:      'Служебное: заголовок вкладки и описание для поиска',
  company:   'Реквизиты',
  nav:       'Пункты меню',
  menu:      'Подписи меню',
  hero:      'Первый экран',
  services:  'Секция «Услуги»',
  process:   'Секция «Как работаем»',
  format:    'Секция «Как это устроено»',
  analytics: 'Секция «Аналитика»',
  about:     'Секция «Об агентстве»',
  reviews:   'Секция «Отзывы»',
  faq:       'Секция «Вопросы»',
  contacts:  'Секция «Контакты»',
  footer:    'Подвал',
};

const FIELDS = {
  eyebrow: 'Надзаголовок', title: 'Заголовок', sub: 'Подзаголовок',
  lead: 'Вводный абзац', text: 'Текст', note: 'Подпись', label: 'Подпись',
  q: 'Вопрос', a: 'Ответ', who: 'Кто оставил', value: 'Значение',
  term: 'Название', alt: 'Описание картинки (alt)', signature: 'Подпись',
  placeholder: 'Плейсхолдер', linkLabel: 'Текст ссылки', legal: 'Дисклеймер',
  submit: 'Кнопка отправки', submitted: 'Кнопка после отправки',
  success: 'Сообщение об успехе', closeLabel: 'Кнопка «Закрыть»',
  openLabel: 'Кнопка меню (для скринридера)', description: 'Описание для поиска',
  paragraphs: 'Абзацы', checks: 'Список пунктов', lines: 'Строки',
  hours: 'Часы работы', geo: 'География', address: 'Адрес',
  addressShort: 'Адрес коротко', mapLinkLabel: 'Подпись ссылки на карту',
  phone: 'Телефон', cnt: 'Счётчик',
};

const human = (key) => FIELDS[key] || key;

/* ==========================================================================
   Обход дерева: собираем плоский список { path, kind, value, trail }
   ========================================================================== */
function collect(node, trail = []) {
  const out = [];

  const walk = (value, keys) => {
    const key = keys.at(-1);
    if (SKIP_KEYS.has(key)) return;

    if (typeof value === 'string') {
      out.push({ path: keys.join('.'), kind: 'text', value, keys });
      return;
    }
    if (Array.isArray(value)) {
      if (value.every((v) => typeof v === 'string')) {
        out.push({ path: keys.join('.'), kind: 'lines', value, keys });
        return;
      }
      value.forEach((v, i) => walk(v, [...keys, String(i)]));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, [...keys, k]);
    }
  };

  for (const [k, v] of Object.entries(node)) walk(v, [...trail, k]);
  return out;
}

/* ==========================================================================
   Экспорт
   ========================================================================== */
function exportTexts() {
  const content = JSON.parse(fs.readFileSync(CONTENT, 'utf8'));
  const entries = collect(content);

  const lines = [
    '# Тексты сайта «ТОЧНО. Недвижимость»',
    '',
    'Правьте текст под заголовками — обычным текстом, без разметки.',
    '',
    '**Не трогайте серые строки в угловых скобках** (`<!--hero.title|lines-->`) —',
    'по ним сборка понимает, куда положить текст. Если такую строку удалить,',
    'соответствующий кусок текста потеряется.',
    '',
    'Там, где под заголовком несколько строк, каждая строка — отдельный элемент:',
    'в заголовках это перенос строки, в списках — отдельный пункт.',
    '',
    'Когда закончите — верните файл, тексты разложатся по местам сами (`npm run texts:import`).',
    '',
    '---',
  ];

  let currentSection = null;
  let currentGroup   = null;

  for (const entry of entries) {
    const [section, ...rest] = entry.keys;

    if (section !== currentSection) {
      currentSection = section;
      currentGroup = null;
      lines.push('', `## ${SECTIONS[section] || section}`);
    }

    // Группа — это индекс в массиве объектов: services.items.0.title → одна карточка.
    // Подписываем группу первым осмысленным полем, чтобы в файле было видно, о чём речь.
    const groupIdx = rest.findIndex((k) => /^\d+$/.test(k));
    const group = groupIdx === -1 ? null : rest.slice(0, groupIdx + 1).join('.');
    if (group !== currentGroup) {
      currentGroup = group;
      if (group) {
        const obj = getPath(content, entry.keys.slice(0, groupIdx + 2));
        const name = ['title', 'q', 'label', 'term', 'who', 'value']
          .map((k) => obj?.[k])
          .find((v) => typeof v === 'string');
        lines.push('', `### ${Number(rest[groupIdx]) + 1}. ${name ?? ''}`.trimEnd());
      }
    }

    lines.push('', `**${human(entry.keys.at(-1))}**`, `<!--${entry.path}|${entry.kind}-->`);
    lines.push(...(entry.kind === 'lines' ? entry.value : [entry.value]));
  }

  lines.push('');
  fs.writeFileSync(TEXTS, lines.join('\n'));
  console.log(`TEXTS.md собран: ${entries.length} текстовых блоков.`);
}

/* ==========================================================================
   Импорт
   ========================================================================== */
function setPath(root, keys, value) {
  let node = root;
  for (const key of keys.slice(0, -1)) node = node[key];
  node[keys.at(-1)] = value;
}

function getPath(root, keys) {
  return keys.reduce((node, key) => (node == null ? node : node[key]), root);
}

function importTexts() {
  const content = JSON.parse(fs.readFileSync(CONTENT, 'utf8'));
  const md = fs.readFileSync(TEXTS, 'utf8').split('\n');

  const problems = [];
  let changed = 0;
  let current = null;
  let buffer  = [];

  const flush = () => {
    if (!current) return;

    // Хвостовые пустые строки и служебная разметка в буфер не идут.
    while (buffer.length && buffer.at(-1).trim() === '') buffer.pop();
    const value = current.kind === 'lines' ? buffer : buffer.join(' ').trim();

    if (getPath(content, current.keys) === undefined) {
      problems.push(`неизвестный путь: ${current.path}`);
    } else if (!buffer.length) {
      problems.push(`пусто: ${current.path}`);
    } else {
      const before = JSON.stringify(getPath(content, current.keys));
      setPath(content, current.keys, value);
      if (JSON.stringify(value) !== before) changed++;
    }
    current = null;
    buffer  = [];
  };

  for (const raw of md) {
    const marker = raw.match(/^<!--(.+?)\|(text|lines)-->$/);
    if (marker) {
      flush();
      current = { path: marker[1], kind: marker[2], keys: marker[1].split('.') };
      continue;
    }
    if (!current) continue;

    const line = raw.trim();
    // Начался новый заголовок или подпись поля — блок закончился.
    if (line.startsWith('#') || /^\*\*.+\*\*$/.test(line) || line === '---') { flush(); continue; }
    if (line === '' && !buffer.length) continue;  // пустая строка перед текстом
    buffer.push(line);
  }
  flush();

  // Сверяем, что ни один текст не потерялся по дороге.
  const expected = collect(JSON.parse(fs.readFileSync(CONTENT, 'utf8'))).map((e) => e.path);
  const present  = md.join('\n').match(/^<!--(.+?)\|/gm)?.map((m) => m.slice(4, -1)) ?? [];
  const missing  = expected.filter((p) => !present.includes(p));
  if (missing.length) problems.push(`нет в TEXTS.md: ${missing.join(', ')}`);

  if (problems.length) {
    console.error('Импорт остановлен, content.json не тронут:');
    problems.forEach((p) => console.error('  · ' + p));
    process.exit(1);
  }

  fs.writeFileSync(CONTENT, JSON.stringify(content, null, 2) + '\n');
  console.log(`content.json обновлён: изменено ${changed} блоков. Дальше — npm run build.`);
}

/* ========================================================================== */

const mode = process.argv[2];
if (mode === 'export') exportTexts();
else if (mode === 'import') importTexts();
else {
  console.error('Использование: node texts.js export | import');
  process.exit(1);
}
