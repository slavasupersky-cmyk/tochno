#!/usr/bin/env node
/**
 * Обмен текстами: src/content.json ⇄ TEXTS.md / TEXTS.rtf
 *
 *   node texts.js export        → TEXTS.md  (для гита и любого редактора)
 *   node texts.js export --rtf  → TEXTS.rtf (открывается в TextEdit двойным кликом)
 *   node texts.js import        → правки из TEXTS.rtf или TEXTS.md обратно в content.json
 *
 * Каждый текст обёрнут парой меток:
 *
 *   <!--hero.title|lines-->
 *   Помогаем купить и продать
 *   <!--конец-->
 *
 * Всё, что между метками, — текст. Всё, что снаружи, — оформление, импорт его
 * не читает. Поэтому файл переживает пересохранение в TextEdit, Word и чём
 * угодно ещё: границы блоков заданы буквами, а не жирностью или заголовками.
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const CONTENT  = path.join(__dirname, 'src/content.json');
const OUT_MD   = path.join(__dirname, 'TEXTS.md');
const OUT_RTF  = path.join(__dirname, 'TEXTS.rtf');

const OPEN  = (p, kind) => `<!--${p}|${kind}-->`;
const CLOSE = '<!--конец-->';
const RE_OPEN  = /<!--\s*([\w.]+)\s*\|\s*(text|lines)\s*-->/;
const RE_CLOSE = /<!--\s*конец\s*-->/;

/* --------------------------------------------------------------------------
   Технические поля не выгружаем — их правят в content.json руками.
   -------------------------------------------------------------------------- */
const SKIP_KEYS = new Set([
  '_comment', 'id', 'src', 'href', 'phoneHref', 'mapUrl', 'linkHref',
  'url', 'ogImage', 'lang', 'name', 'type', 'style', 'stars', 'required', 'n',
]);

const SECTIONS = {
  meta:       'Заголовок вкладки и описание для поиска',
  company:    'Реквизиты',
  nav:        'Пункты меню',
  menu:       'Подписи меню',
  hero:       'Первый экран',
  services:   'Секция «Услуги»',
  process:    'Секция «Как работаем»',
  geografiya: 'Секция «География»',
  analytics:  'Секция «Аналитика»',
  about:      'Секция «О компании»',
  reviews:    'Секция «Отзывы» — пункты 4–10 написаны как образец, заменить на настоящие',
  faq:        'Секция «Вопросы»',
  contacts:   'Секция «Контакты»',
  footer:     'Подвал',
  deals:      'Счётчик сделок — дата и число, от которых он считает',
  privacy:    'Страница «Политика конфиденциальности»',
};

const FIELDS = {
  eyebrow: 'Надзаголовок', title: 'Заголовок', sub: 'Подзаголовок',
  lead: 'Вводный абзац', text: 'Текст', note: 'Подпись', label: 'Подпись',
  q: 'Вопрос', a: 'Ответ', who: 'Кто оставил', value: 'Значение',
  term: 'Название', alt: 'Описание картинки (alt)', signature: 'Подпись',
  placeholder: 'Подсказка в поле', linkLabel: 'Текст ссылки', legal: 'Дисклеймер',
  submit: 'Кнопка отправки', submitted: 'Кнопка после отправки',
  success: 'Сообщение об успехе', closeLabel: 'Кнопка «Закрыть»',
  openLabel: 'Кнопка меню (для скринридера)', description: 'Описание для поиска',
  paragraphs: 'Абзацы', checks: 'Пункты списка', hours: 'Часы работы',
  geo: 'География', address: 'Адрес', addressShort: 'Адрес коротко',
  mapLinkLabel: 'Подпись ссылки на карту', phone: 'Телефон',
  baseDate: 'Дата, на которую известно число сделок', updated: 'Дата редакции',
  backLabel: 'Кнопка возврата', heading: 'Заголовок страницы',
};

const human = (key) => FIELDS[key] || key;

const INTRO = [
  'Правьте только текст между серыми метками. Сами метки не трогайте:',
  'по ним правки находят своё место на сайте. Если метка потеряется,',
  'загрузка остановится и скажет, в каком месте, — ничего не сломается.',
  '',
  'Где под меткой несколько строк, каждая строка — отдельный элемент:',
  'в заголовках это перенос строки, в списках — отдельный пункт.',
  '',
  'Оформление, отступы и шрифт значения не имеют — читается только текст.',
];

/* ==========================================================================
   Обход content.json
   ========================================================================== */
function collect(root) {
  const out = [];
  const walk = (value, keys) => {
    if (SKIP_KEYS.has(keys.at(-1))) return;
    if (typeof value === 'string') { out.push({ path: keys.join('.'), kind: 'text', value, keys }); return; }
    if (Array.isArray(value)) {
      if (value.every((v) => typeof v === 'string')) { out.push({ path: keys.join('.'), kind: 'lines', value, keys }); return; }
      value.forEach((v, i) => walk(v, [...keys, String(i)]));
      return;
    }
    if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, [...keys, k]);
  };
  for (const [k, v] of Object.entries(root)) walk(v, [k]);
  return out;
}

const getPath = (root, keys) => keys.reduce((n, k) => (n == null ? n : n[k]), root);

/** Разбивка списка блоков на разделы и группы — общая для обоих форматов. */
function outline(content) {
  const items = [];
  let section = null;
  let group   = null;

  for (const entry of collect(content)) {
    const [head, ...rest] = entry.keys;
    if (head !== section) {
      section = head; group = null;
      items.push({ type: 'section', title: SECTIONS[head] || head });
    }
    const idx = rest.findIndex((k) => /^\d+$/.test(k));
    const key = idx === -1 ? null : rest.slice(0, idx + 1).join('.');
    if (key !== group) {
      group = key;
      if (key) {
        const obj = getPath(content, entry.keys.slice(0, idx + 2));
        const name = ['title', 'q', 'label', 'term', 'who', 'value'].map((k) => obj?.[k]).find((v) => typeof v === 'string');
        items.push({ type: 'group', title: `${Number(rest[idx]) + 1}. ${name ?? ''}`.trim() });
      }
    }
    items.push({ type: 'block', label: human(entry.keys.at(-1)), entry });
  }
  return items;
}

/* ==========================================================================
   Markdown
   ========================================================================== */
function renderMd(content) {
  const out = ['# Тексты сайта «ТОЧНО. Недвижимость»', '', ...INTRO, '', '---'];
  for (const item of outline(content)) {
    if (item.type === 'section') out.push('', `## ${item.title}`);
    else if (item.type === 'group') out.push('', `### ${item.title}`);
    else {
      out.push('', `**${item.label}**`, '', OPEN(item.entry.path, item.entry.kind));
      out.push(...(item.entry.kind === 'lines' ? item.entry.value : [item.entry.value]));
      out.push(CLOSE);
    }
  }
  return out.join('\n') + '\n';
}

/* ==========================================================================
   RTF — родной формат TextEdit
   ========================================================================== */

/** Текст → RTF. Кириллица уходит в \uN, чтобы не зависеть от кодировок. */
function rtfEscape(str) {
  let out = '';
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    if (ch === '\\' || ch === '{' || ch === '}') out += '\\' + ch;
    else if (code < 128) out += ch;
    else if (code <= 0xffff) out += `\\u${code}?`;
    else {                                    // за пределами BMP — суррогатная пара
      const v = code - 0x10000;
      out += `\\u${0xd800 + (v >> 10) - 65536}?\\u${0xdc00 + (v & 0x3ff) - 65536}?`;
    }
  }
  return out;
}

function renderRtf(content) {
  const P = [];
  // sa — отступ после абзаца, fs — кегль в полупунктах, cf — цвет из таблицы
  const par = (text, style = '\\fs26\\sa80') => P.push(`\\pard${style}\\f0 ${rtfEscape(text)}\\par`);
  const marker = (text) => P.push(`\\pard\\sa0\\f1\\fs16\\cf2 ${rtfEscape(text)}\\par`);

  par('Тексты сайта «ТОЧНО. Недвижимость»', '\\fs44\\b\\sa200');
  INTRO.forEach((line) => (line ? par(line, '\\fs22\\cf3\\sa40') : P.push('\\pard\\sa40\\par')));

  for (const item of outline(content)) {
    if (item.type === 'section') par(item.title, '\\fs34\\b\\sb500\\sa140');
    else if (item.type === 'group') par(item.title, '\\fs26\\b\\i\\sb280\\sa80');
    else {
      par(item.label, '\\fs20\\b\\cf3\\sb220\\sa20');
      marker(OPEN(item.entry.path, item.entry.kind));
      (item.entry.kind === 'lines' ? item.entry.value : [item.entry.value])
        .forEach((line) => par(line, '\\fs28\\sa40'));
      marker(CLOSE);
    }
  }

  return [
    '{\\rtf1\\ansi\\ansicpg1251\\deff0',
    '{\\fonttbl{\\f0\\fswiss\\fcharset204 Helvetica;}{\\f1\\fmodern\\fcharset204 Menlo-Regular;}}',
    '{\\colortbl;\\red0\\green0\\blue0;\\red160\\green160\\blue160;\\red110\\green110\\blue110;}',
    '\\margl1200\\margr1200\\margt1200\\margb1200',
    ...P,
    '}',
  ].join('\n');
}

/** Таблица однобайтовой кодировки документа: \'d2 → «Т» для cp1251. */
function codepageTable(cp) {
  const enc = { 1251: 'windows-1251', 1252: 'windows-1252', 1250: 'windows-1250', 10000: 'macintosh' }[cp] || 'windows-1252';
  try {
    const dec = new TextDecoder(enc);
    return Array.from({ length: 256 }, (_, b) => dec.decode(new Uint8Array([b])));
  } catch {
    return Array.from({ length: 256 }, (_, b) => String.fromCharCode(b));
  }
}

/**
 * RTF → плоский текст. Рассчитан на то, что кладут TextEdit, Word и Pages:
 * группы-приложения (\*\...), кириллица и через \uN, и через \'XX,
 * и параметр \ucN, задающий, сколько запасных символов идёт за \uN.
 */
function rtfToText(rtf) {
  const table = codepageTable(Number(/\\ansicpg(\d+)/.exec(rtf)?.[1]) || 1252);
  const DROP = /^(fonttbl|colortbl|stylesheet|info|pict|object|themedata|colorschememapping|latentstyles|datastore|generator|expandedcolortbl|listtable|listoverridetable|xmlnstbl|filetbl|revtbl|nesttableprops|shppict|bkmkstart|bkmkend|header|footer|footnote)$/;

  let out = '';
  let i = 0;
  let uc = 1;                 // сколько запасных символов идёт за \uN
  let skip = -1;              // глубина группы, пропускаемой целиком (-1 — не пропускаем)
  const stack = [];

  /** Пропустить n «символов» после \uN: \'XX и \uN считаются за один. */
  const skipFallback = (n) => {
    while (n > 0 && i < rtf.length) {
      if (rtf[i] === '\\' && rtf[i + 1] === "'") i += 4;
      else if (rtf[i] === '\\') { const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i)); i += m ? m[0].length : 2; }
      else if (rtf[i] === '{' || rtf[i] === '}') break;
      else i += 1;
      n--;
    }
  };

  while (i < rtf.length) {
    const ch = rtf[i];

    if (ch === '{') { stack.push(uc); i++; continue; }
    if (ch === '}') {
      uc = stack.pop() ?? 1;
      if (skip >= 0 && stack.length <= skip) skip = -1;
      i++; continue;
    }

    if (ch === '\\') {
      const next = rtf[i + 1];

      if (next === "'") {                                   // байт в кодировке документа
        if (skip < 0) out += table[parseInt(rtf.slice(i + 2, i + 4), 16)] ?? '';
        i += 4; continue;
      }
      if (next === '\\' || next === '{' || next === '}') {   // экранированный символ
        if (skip < 0) out += next;
        i += 2; continue;
      }
      if (next === '*') { skip = stack.length - 1; i += 2; continue; }
      if (next === '\n' || next === '\r') { if (skip < 0) out += '\n'; i += 2; continue; }
      if (next === '~') { if (skip < 0) out += ' '; i += 2; continue; }
      if (next === '_' || next === '-') { i += 2; continue; }

      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i));
      if (!m) { i += 2; continue; }
      const [full, word, num] = m;
      i += full.length;

      if (word === 'uc') { uc = Number(num ?? 1); continue; }
      if (word === 'u') {
        let code = Number(num);
        if (code < 0) code += 65536;
        if (skip < 0) out += String.fromCharCode(code);
        skipFallback(uc);
        continue;
      }
      if (DROP.test(word)) { skip = stack.length - 1; continue; }
      if (skip < 0 && (word === 'par' || word === 'line' || word === 'sect' || word === 'cell' || word === 'row')) out += '\n';
      continue;
    }

    if (ch === '\n' || ch === '\r') { i++; continue; }   // переносы строк в самом RTF незначимы
    if (skip < 0) out += ch;
    i++;
  }
  return out;
}

/* ==========================================================================
   Импорт
   ========================================================================== */
function parseBlocks(text) {
  const blocks = [];
  let current = null;

  for (const raw of text.split('\n')) {
    const open = RE_OPEN.exec(raw);
    if (open) {
      // Новая метка при незакрытом блоке означает, что закрывающую стёрли,
      // и в предыдущий блок натекло оформление. Молчать тут нельзя.
      if (current) current.unclosed = true;
      current = { path: open[1], kind: open[2], lines: [] };
      blocks.push(current);
      continue;
    }
    if (RE_CLOSE.test(raw)) { current = null; continue; }
    // Пустые строки внутри блока игнорируем: редакторы любят добавлять свои,
    // а ни один текст на сайте не содержит пустой строки посередине.
    if (current && raw.trim()) current.lines.push(raw.trim());
  }
  if (current) current.unclosed = true;
  return blocks;
}

function importTexts() {
  const source = fs.existsSync(OUT_RTF) && fs.statSync(OUT_RTF).mtimeMs >= (fs.existsSync(OUT_MD) ? fs.statSync(OUT_MD).mtimeMs : 0)
    ? OUT_RTF : OUT_MD;
  if (!fs.existsSync(source)) { console.error(`Нет файла с текстами (${path.basename(OUT_MD)} или ${path.basename(OUT_RTF)}).`); process.exit(1); }

  const raw  = fs.readFileSync(source, 'utf8');
  const text = source.endsWith('.rtf') ? rtfToText(raw) : raw;
  const blocks = parseBlocks(text);

  const content  = JSON.parse(fs.readFileSync(CONTENT, 'utf8'));
  const expected = collect(content);
  const problems = [];
  const seen = new Set();
  let changed = 0;

  for (const block of blocks) {
    while (block.lines.length && block.lines.at(-1) === '') block.lines.pop();
    while (block.lines.length && block.lines[0] === '')     block.lines.shift();

    const keys = block.path.split('.');
    if (block.unclosed)                       { problems.push(`потерялась закрывающая метка после «${block.path}» — в текст натекло лишнее`); continue; }
    if (getPath(content, keys) === undefined) { problems.push(`неизвестная метка: ${block.path}`); continue; }
    if (seen.has(block.path))                 { problems.push(`метка встречается дважды: ${block.path}`); continue; }
    if (!block.lines.length)                  { problems.push(`пусто: ${block.path}`); continue; }
    seen.add(block.path);

    const value  = block.kind === 'lines' ? block.lines : block.lines.join(' ');
    const before = JSON.stringify(getPath(content, keys));
    if (JSON.stringify(value) !== before) {
      // записываем только после полной проверки — см. ниже
      block.value = value; block.keys = keys; changed++;
    }
  }

  const missing = expected.filter((e) => !seen.has(e.path)).map((e) => e.path);
  if (missing.length) problems.push(`нет в файле: ${missing.join(', ')}`);

  if (problems.length) {
    console.error(`Загрузка остановлена, content.json не тронут. Источник: ${path.basename(source)}`);
    problems.forEach((p) => console.error('  · ' + p));
    process.exit(1);
  }

  for (const block of blocks) if (block.value !== undefined) {
    let node = content;
    for (const key of block.keys.slice(0, -1)) node = node[key];
    node[block.keys.at(-1)] = block.value;
  }

  fs.writeFileSync(CONTENT, JSON.stringify(content, null, 2) + '\n');
  console.log(`${path.basename(source)} → content.json: изменено ${changed} блоков из ${blocks.length}.`);
}

/* ========================================================================== */

const [mode, ...flags] = process.argv.slice(2);

if (mode === 'export') {
  const content = JSON.parse(fs.readFileSync(CONTENT, 'utf8'));
  const count = collect(content).length;
  if (flags.includes('--rtf')) { fs.writeFileSync(OUT_RTF, renderRtf(content)); console.log(`TEXTS.rtf собран: ${count} блоков.`); }
  else                        { fs.writeFileSync(OUT_MD,  renderMd(content));  console.log(`TEXTS.md собран: ${count} блоков.`); }
} else if (mode === 'import') {
  importTexts();
} else {
  console.error('Использование: node texts.js export [--rtf] | import');
  process.exit(1);
}
