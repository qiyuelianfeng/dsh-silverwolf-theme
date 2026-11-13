#!/usr/bin/env node
/**
 * 从 BWIKI（wiki.biligame.com/sr）抓「银狼 / 银狼LV.999」角色页，转成世界书 JSON。
 *
 *   node tools/build-worldbook.mjs                         # 抓线上、写到 ~/.dsh/silverwolf-worldbook.json
 *   node tools/build-worldbook.mjs --out ./wb.json         # 换个落盘位置
 *   node tools/build-worldbook.mjs --source ./wiki.txt     # 用本地存好的单页 wikitext（调试用，只解析这一页）
 *
 * 只依赖 Node 自带能力（fetch / fs），不发 npm 依赖。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { packWorldbook, summarizeEntries } from '../lib/worldbook.js';
import { parseCharacterWikitext } from '../lib/wikitext.js';

/** 抓取的角色页（BWIKI 页面标题，中文原样）。 */
const CHARACTER_PAGES = ['银狼', '银狼LV.999'];

function argOf(name, fallback) {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(`--${name}`);
  if (index >= 0 && index + 1 < argv.length) return argv[index + 1];
  const inline = argv.find((item) => item.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  return fallback;
}

const source = argOf('source', '');
const out = resolve(argOf('out', join(homedir(), '.dsh', 'silverwolf-worldbook.json')));

/** 从 BWIKI 抓一页 wikitext（带重试与间隔，规避反爬限流）。 */
async function fetchWikitext(title) {
  const url = `https://wiki.biligame.com/sr/index.php?title=${encodeURIComponent(title)}&action=raw`;
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: 'text/plain', 'user-agent': 'dsh-silverwolf-theme/0.3' } });
      if (response.ok) return response.text();
      if (response.status === 567) {
        // 反爬限流：等一等再试。
        lastError = new Error(`HTTP 567（限流）`);
      } else {
        lastError = new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      lastError = error;
    }
    // 指数退避：1s、2s、4s。
    const waitMs = 1000 * 2 ** (attempt - 1);
    process.stdout.write(`  第 ${attempt} 次失败（${lastError.message}），${waitMs / 1000}s 后重试…\n`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error(`抓取「${title}」失败：${lastError?.message || '未知错误'}`);
}

/** 生成世界书条目：线上抓取（默认）或本地单页（--source，调试）。 */
async function buildEntries() {
  if (source !== '') {
    const text = await readFile(resolve(source), 'utf8');
    process.stdout.write(`读取本地 wikitext ${resolve(source)}（${Buffer.byteLength(text)} 字节）\n`);
    return parseCharacterWikitext(text);
  }
  const all = [];
  for (const title of CHARACTER_PAGES) {
    process.stdout.write(`抓取「${title}」…\n`);
    const wikitext = await fetchWikitext(title);
    const entries = parseCharacterWikitext(wikitext);
    process.stdout.write(`  解析出 ${entries.length} 条\n`);
    all.push(...entries);
  }
  return all;
}

const entries = await buildEntries();
if (entries.length === 0) throw new Error('一条条目都没切出来，先看看页面结构是否变了');

const document = packWorldbook(entries, {
  source: 'https://wiki.biligame.com/sr/',
  sourceVersion: 'BWIKI',
});

await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(document, null, 2) + '\n', 'utf8');

const stats = summarizeEntries(document.entries);
const bytes = Buffer.byteLength(JSON.stringify(document));
const catSummary = stats.categories.map((c) => `${c.label} ${c.total}`).join('、');
process.stdout.write(
  [
    `写出 ${out}`,
    `条目 ${stats.count} 条 / ${Math.round(bytes / 1024)} KB`,
    `分类 ${catSummary}`,
    `角色 ${stats.characters.map((row) => `${row.name}(${row.total})`).join('、')}`,
    '',
  ].join('\n'),
);
