#!/usr/bin/env node
/**
 * Проверка картинок: все ли слоты заполнены и в обоих ли форматах.
 *
 *   node images.js
 *
 * Слоты берутся из content.json, так что список не разъедется с сайтом.
 * Конвертацию в WebP скрипт не делает — для этого нужен cwebp или sharp,
 * команда печатается готовой, останется скопировать.
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, 'src');

/** Где какая картинка показывается — чтобы понимать, какая нужна пропорция. */
const USAGE = {
  'images/hero-apartment': 'первый экран, во всю ширину и высоту окна',
  'images/service-buy':    'карточка «Купить», кадрируется в 4:3',
  'images/service-sell':   'карточка «Продать», кадрируется в 4:3',
  'images/service-invest': 'карточка «Инвестировать», кадрируется в 4:3',
  'images/service-deal':   'карточка «Провести сделку», кадрируется в 4:3',
  'images/analytics':      'секция «Аналитика», примерно половина ширины',
  'images/founder':        'секция «Об агентстве», вертикальный портрет',
};

/** Рекомендуемая ширина исходника. Больше смысла не имеет, меньше — мылит. */
const WIDTH = {
  'images/hero-apartment': 1920,
  'images/analytics': 1200,
  'images/founder': 1000,
};
const DEFAULT_WIDTH = 900;

/** Все пути к картинкам из content.json, в порядке появления на странице. */
function slots(node, found = new Set()) {
  if (Array.isArray(node)) node.forEach((n) => slots(n, found));
  else if (node && typeof node === 'object') {
    if (typeof node.src === 'string' && typeof node.alt === 'string') found.add(node.src);
    Object.values(node).forEach((n) => slots(n, found));
  }
  return found;
}

const content = JSON.parse(fs.readFileSync(path.join(SRC, 'content.json'), 'utf8'));
const used = [...slots(content)];

let missing = 0;
console.log('Картинки сайта\n');

for (const slot of used) {
  const jpg  = path.join(SRC, slot + '.jpg');
  const webp = path.join(SRC, slot + '.webp');
  const hasJpg = fs.existsSync(jpg);
  const hasWebp = fs.existsSync(webp);
  const mark = hasJpg && hasWebp ? '✓' : '✗';
  if (mark === '✗') missing++;

  const size = hasJpg ? `${(fs.statSync(jpg).size / 1024).toFixed(0)} КБ` : '—';
  console.log(`${mark} ${slot.replace('images/', '').padEnd(16)} ${(WIDTH[slot] || DEFAULT_WIDTH + '').toString().padStart(4)}px  ${size.padStart(7)}   ${USAGE[slot] || ''}`);
  if (!hasJpg)  console.log(`    нет файла ${slot}.jpg`);
  if (!hasWebp) console.log(`    нет файла ${slot}.webp — сделать: cwebp -q 80 src/${slot}.jpg -o src/${slot}.webp`);
}

// Файлы, которые лежат в папке, но нигде не используются.
const dir = path.join(SRC, 'images');
const orphans = fs.readdirSync(dir)
  .filter((f) => /\.(jpe?g|webp|png)$/i.test(f))
  .filter((f) => !used.includes('images/' + f.replace(/\.\w+$/, '')));
if (orphans.length) console.log('\nЛишние файлы (не используются на сайте): ' + orphans.join(', '));

console.log(missing ? `\nНе хватает файлов: ${missing} слотов.` : '\nВсе слоты заполнены.');
process.exit(missing ? 1 : 0);
