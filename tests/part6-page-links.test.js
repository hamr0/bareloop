// Result tab page links (hamr ruled 2026-10-19): the link to the web page each result read. The URL comes from the run's own source.json
// (`inputs[].url`, keyed by the input label the signed fact part names as its `source`). One page = one link at the top; 2+ pages = a link in
// each line's box; a file input (no url) = no link. Server side runs on the REAL mve5y8fa fixture; the page functions are cut from index.html.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, utimesSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePart5World } from './part5-world.mjs';
import { getRunResult, RESULT_PAGE_MAY_CHANGE } from '../src/panel/server.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(join(HERE, '..', 'src', 'panel', 'index.html'), 'utf8');
const src = (name) => {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
};
const ESC = 'function escapeXml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}';
const names = ['resultField', 'resultLineBox', 'resultFileWords', 'resultFactsLine', 'resultTextLine', 'resultNotChecked', 'resultPageLink', 'resultLineCard'];
const fns = new Function(`${ESC}\nvar RESULT_NONE = "none";\n${names.map(src).join('\n')}\nreturn {${names.join(', ')}};`)();

/** the part5 world with source.json carrying `inputs`, and (optionally) a second rubric line reading input label `second` */
function world(inputs, second) {
  const w = makePart5World();
  const into = dirname(dirname(w.spine('mve5y8fa')));
  writeFileSync(join(into, 'source.json'), JSON.stringify({ kind: 'folder', source: '/x', destination: '/y', inputs }));
  if (second) {
    const sp = join(dirname(into), 'resolved-spec.json');
    const spec = JSON.parse(readFileSync(sp, 'utf8'));
    const st = JSON.parse(JSON.stringify(spec.closeDecl.stages[1]));
    st.name = 'line-2-more'; st.params.step = 2; st.fromLine = [2]; st.params.parts[0].source = second;
    spec.closeDecl.stages.push(st);
    spec.jobLines.push({ n: 2, text: 'List 3 more flights', rule: '', rules: [] });
    writeFileSync(sp, JSON.stringify(spec));
  }
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  utimesSync(w.spine('mve5y8fa'), old, old);
  return w;
}
const url = (label, u) => ({ label, rel: `input/${label}.txt`, sha256: 'x', ...(u === undefined ? {} : { url: u }) });

test('server: one web page read -> pages has that one url, the line carries it, and the server owns the "may have changed" words', () => {
  const w = world([url('flights', 'https://example.com/flights?from=BOS')]);
  const res = getRunResult('mve5y8fa', { home: w.home });
  assert.deepEqual(res.pages, ['https://example.com/flights?from=BOS']);
  assert.equal(res.lines[0].page, 'https://example.com/flights?from=BOS');
  assert.equal(res.pageNote, 'The page may have changed since this run.');
  assert.equal(RESULT_PAGE_MAY_CHANGE, res.pageNote);
});

test('server: two lines reading two different pages -> two pages, each line carries its own', () => {
  const w = world([url('flights', 'https://a.example/x'), url('hotels', 'https://b.example/y')], 'hotels');
  const res = getRunResult('mve5y8fa', { home: w.home });
  assert.deepEqual(res.pages, ['https://a.example/x', 'https://b.example/y']);
  assert.deepEqual(res.lines.map((l) => l.page), ['https://a.example/x', 'https://b.example/y']);
});

test('server: a file input (no url), or a non-http address, gives no link and no note', () => {
  for (const inputs of [[url('flights')], [url('flights', 'file:///etc/passwd')], [url('flights', 'javascript:alert(1)')], []]) {
    const w = world(inputs);
    const res = getRunResult('mve5y8fa', { home: w.home });
    assert.deepEqual(res.pages, []);
    assert.equal(res.lines[0].page, null);
    assert.equal(res.pageNote, null);
  }
});

test('page: ONE page -> a single link at the top (in the head card), none in the line box; opens in a new tab with noopener noreferrer, and says the page may have changed', () => {
  const f = src('renderResult');
  assert.match(f, /\(data\.pages \|\| \[\]\)\.length === 1 \? resultPageLink\(data\.pages\[0\], data\.pageNote, "result-page-top"\)/);
  const link = fns.resultPageLink('https://example.com/a?b=1&c=2', RESULT_PAGE_MAY_CHANGE, 'result-page-top');
  assert.match(link, /<a href="https:\/\/example\.com\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">/);
  assert.ok(link.includes('The page may have changed since this run.'));
  assert.match(link, /class="field"/);
  assert.match(link, /class="ro-value"/, 'the Result tab\'s own boxes, no new style family');
  const line = { n: 1, text: 't', rules: [], kind: 'facts', facts: [], rows: [], page: 'https://example.com/a', notChecked: [] };
  assert.equal(fns.resultLineCard(line, false, RESULT_PAGE_MAY_CHANGE).includes('result-page-line'), false, 'one page: no link in the line box');
});

test('page: TWO pages -> each line box carries the link of its own page, with the words', () => {
  const mk = (n, page) => ({ n, text: `t${n}`, rules: [], kind: 'facts', facts: [], rows: [], page, notChecked: [] });
  const a = fns.resultLineCard(mk(1, 'https://a.example/x'), true, RESULT_PAGE_MAY_CHANGE);
  const b = fns.resultLineCard(mk(2, 'https://b.example/y'), true, RESULT_PAGE_MAY_CHANGE);
  assert.ok(a.includes('href="https://a.example/x"') && !a.includes('b.example'));
  assert.ok(b.includes('href="https://b.example/y"') && !b.includes('a.example'));
  for (const h of [a, b]) { assert.ok(h.includes('data-testid="result-page-line"')); assert.ok(h.includes('The page may have changed since this run.')); assert.ok(h.includes('rel="noopener noreferrer"')); }
  assert.match(src('renderResult'), /var ownPages = \(data\.pages \|\| \[\]\)\.length >= 2;/);
});

test('page: a non-http address or no address draws no link at all, even if the server sent one', () => {
  for (const u of [null, undefined, '', 'file:///etc/passwd', 'javascript:alert(1)', '/relative/path']) {
    assert.equal(fns.resultPageLink(u, RESULT_PAGE_MAY_CHANGE, 't'), '');
    const line = { n: 1, text: 't', rules: [], kind: 'facts', facts: [], rows: [], page: u, notChecked: [] };
    const h = fns.resultLineCard(line, true, RESULT_PAGE_MAY_CHANGE);
    assert.equal(h.includes('<a '), false);
    assert.equal(h.includes('may have changed'), false);
  }
});
