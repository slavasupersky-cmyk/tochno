#!/usr/bin/env node
/**
 * Ручная публикация на GitHub Pages: dist/ → ветка gh-pages.
 *
 *   npm run deploy
 *
 * Нужно, только пока не работает автосборка (.github/workflows/deploy.yml).
 * Как заработает — этот скрипт и ветку gh-pages можно удалить, публикация
 * будет происходить сама при каждом пуше в main.
 *
 * Ветка gh-pages пересоздаётся с нуля каждый раз: она целиком генерируется
 * из main, истории в ней нет и не нужно.
 */

'use strict';

const { execFileSync } = require('node:child_process');
const fs   = require('node:fs');
const path = require('node:path');
const os   = require('node:os');

const BRANCH = 'gh-pages';
const DIST   = path.join(__dirname, 'dist');

const git = (args, cwd = __dirname) =>
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

// 1. Свежая сборка
execFileSync(process.execPath, [path.join(__dirname, 'build.js')], { stdio: 'inherit' });
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('Сборка не создала dist/index.html — публиковать нечего.');
  process.exit(1);
}

// 2. Собираем ветку во временной папке, чтобы не трогать рабочую копию
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tochno-pages-'));
fs.cpSync(DIST, tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, '.nojekyll'), '');   // иначе Pages прогонит файлы через Jekyll

const commit = git(['rev-parse', '--short', 'HEAD']);

git(['init', '-q', '-b', BRANCH], tmp);
git(['add', '-A'], tmp);
git(['-c', 'user.name=deploy', '-c', 'user.email=deploy@local',
     'commit', '-q', '-m', `Сборка сайта из ${commit}\n\nВетка генерируется из main, править её руками не нужно.`], tmp);

// 3. Отправляем, перезаписывая прошлую выкладку
const remote = git(['remote', 'get-url', 'origin']);
git(['push', '-f', remote, BRANCH], tmp);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\nОпубликовано: ветка ${BRANCH} обновлена из коммита ${commit}.`);
console.log('Сайт обновится через минуту-две.');
