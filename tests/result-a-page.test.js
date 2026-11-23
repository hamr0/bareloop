// "Result tab A + Job type everywhere" (docs/product/ITEM33-BUILD.md, hamr 2026-11-21), item 4: the page's own drawing functions, cut out of src/panel/index.html by name and fed the REAL payloads (the walk-branch review's findings
// record, the archived change run mvkj03w7). The server owns every word and number; the page only draws, with classes the shape fold, the Job tab and the diff box already have (no new CSS).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRunResult } from '../src/panel/server.js';
import { makeReviewWorld } from './result-a-world.mjs';
import { makeResultWorld } from './result-tab-world.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(join(HERE, '..', 'src', 'panel', 'index.html'), 'utf8');
const src = (/** @type {string} */ name) => {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
};
const ESC = 'function escapeXml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}';
const names = ['resultField', 'resultDiffHtml', 'resultFindingsCard', 'resultChangedCard'];
const fns = new Function(`${ESC}\n${names.map(src).join('\n')}\nreturn {${names.join(', ')}};`)();
const strip = (/** @type {string} */ h) => h.replace(/<[^>]+>/g, '');

test('FINDINGS: the header count, the close\'s own proof line with a tick, one CLOSED row per finding (file + the first line of its why); the full why and the quote sit inside the row', () => {
  const w = makeReviewWorld({ spine: 'u-mwqnkvx5-findings.jsonl' });
  const f = getRunResult(w.runid, { home: w.home }).findings;
  const h = fns.resultFindingsCard(f);
  assert.match(h, /<h4>Findings · 4<\/h4>/);
  assert.match(h, /data-testid="result-findings-cite">each quote found in its file <span class="rs-ok">✓<\/span>/);
  const rows = h.split('data-testid="result-finding"').slice(1);
  assert.equal(rows.length, 4);
  assert.equal(rows.some((r) => r.startsWith('" open')), false, 'a passed finding starts closed');
  assert.match(strip(rows[0]), /^>declaredclose\.js The `!== undefined` guard means a close that…/, 'basename and the first 8 words, cut in code');
  assert.match(rows[0], /<span class="k">file<\/span><span class="v">src\/declaredclose\.js<\/span>/, 'the opened row carries the full path');
  assert.match(rows[0], /<span class="k">why<\/span><span class="v" style="white-space:pre-wrap">The `!== undefined` guard[^]*still be signed\./);
  assert.match(rows[0], /<span class="k">quote<\/span><span class="v" style="white-space:pre-wrap">  if \(closeDecl\.source !== undefined &amp;&amp;/, 'the quote is escaped and keeps its spacing');
  assert.equal(h.includes('result-findings-cut'), false);
});

test('FINDINGS: the closed row reads basename:line when the payload has a line, the name alone when it has none', () => {
  const it = { file: 'src/a/b.js', base: 'b.js', short: 'one two\u2026', why: 'one two three', quote: 'q' };
  const h = fns.resultFindingsCard({ total: 2, cut: false, cite: null, items: [{ ...it, at: 88 }, { ...it, at: null }] });
  const rows = h.split('data-testid="result-finding"').slice(1).map(strip);
  assert.match(rows[0], /^>b\.js:88 one two…/);
  assert.match(rows[1], /^>b\.js one two…/);
});

test('FINDINGS: a cut record says how many findings the saved report holds beyond what is shown; nothing injects markup', () => {
  const h = fns.resultFindingsCard({ total: 5, cut: true, cite: null, items: [{ file: '<b>x</b>', base: '<b>x</b>', at: null, short: 'a & b', why: 'a & b', quote: '<i>' }] });
  assert.equal(/<b>x|<i>/.test(h), false);
  assert.match(h, /data-testid="result-findings-cut">4 more are in the saved report</);
  assert.equal(h.includes('result-findings-cite'), false, 'no cite row passed: no proof line');
});

test('WHAT CHANGED: one fold row per file with its +a −r (the rows add up to the header), the branch, the file\'s diff inside the row', () => {
  const w = makeResultWorld(['mvkj03w7']);
  const c = getRunResult('mvkj03w7', { home: w.home }).changed;
  const h = fns.resultChangedCard(c, { branch: 'bareloop-fix-dates' });
  assert.match(h, /<h4>What changed · 1 file <span class="rs-add" data-testid="result-changed-plus">\+123<\/span> <span class="rs-del" data-testid="result-changed-minus">−26<\/span><\/h4>/);
  assert.match(h, /data-testid="result-changed-branch">branch bareloop-fix-dates</);
  const rows = h.split('data-testid="result-file"').slice(1);
  assert.equal(rows.length, c.files);
  assert.match(rows[0], /<span class="sf-nm" title="src\/checks\.js">src\/checks\.js<\/span><span class="sf-ct"><span class="rs-add">\+123<\/span> <span class="rs-del">−26<\/span>/);
  assert.match(rows[0], /<pre class="rs-diff" data-testid="result-diff"[^>]*><span class="rs-/);
});

test('renderResult: a review with findings draws A in order (RESULT, THE JOB with covers, HOW IT RAN, FINDINGS); a payload without them keeps today\'s line cards', () => {
  const f = src('renderResult');
  const order = ['resultHeadHtml(', 'resultJobCard(', 'resultRanCard(', 'resultFindingsCard('].map((x) => f.indexOf(x));
  assert.ok(order.every((i) => i > 0) && order.every((x, k) => k === 0 || x > order[k - 1]), order.join(','));
  assert.match(f, /data\.covers \? '<div class="hint" data-testid="result-covers">'/);
  assert.match(f, /\} else \{\s*\(data\.lines \|\| \[\]\)\.forEach\(function\(line\)\{ h \+= resultLineCard\(line, ownPages, data\.pageNote\); \}\);/);
});
