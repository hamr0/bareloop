// PRD v1.107 Part 6: the Result tab's page. Markup placement, the tables drawn from a REAL /result body, the door, and what the page must never do
// (draw a highlight, search a quote, show a ✓ on a run whose check did not pass). Page functions are cut from index.html's own source.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, copyFileSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePart5World } from './part5-world.mjs';
import { getRunResult } from '../src/panel/server.js';

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
const fns = new Function(`${ESC}\n${src('resultFileWords')}\n${src('resultFactsLine')}\n${src('resultTextLine')}\n${src('resultDoorHtml')}\nreturn {resultFactsLine, resultTextLine, resultDoorHtml};`)();

/** the real /result body of mve5y8fa, its delivered file placed in a scratch dir */
function realResult() {
  const w = makePart5World();
  const delivered = join(dirname(w.out('mve5y8fa')), 'delivered', 'steps', '1-2026-10-18.json');
  mkdirSync(dirname(delivered), { recursive: true });
  copyFileSync(join(HERE, 'fixtures', 'part5', 'mve5y8fa.step-1-2026-10-18.json'), delivered);
  const spine = w.spine('mve5y8fa');
  const text = readFileSync(spine, 'utf8');
  const rec = JSON.parse(text.split('\n').find((l) => l.includes('"type":"destination-written"')));
  writeFileSync(spine, text.replace(rec.path, delivered));
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  utimesSync(spine, old, old);
  return getRunResult('mve5y8fa', { home: w.home });
}

test('markup: the Result button follows Job and is hidden until the server says so; its panel sits AFTER the Job panel, never between Audit and Job; wired as a right tab', () => {
  const row = PAGE.slice(PAGE.indexOf('class="rp-tabrow"'), PAGE.indexOf('id="right-pane-body"'));
  const order = ['id="tab-run"', 'id="tab-audit"', 'id="tab-details"', 'id="tab-result"'].map((k) => row.indexOf(k));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(order.every((n) => n >= 0));
  assert.match(row, /id="tab-result"[^>]*data-testid="right-tab-result"[^>]*hidden>Result</);
  assert.ok(PAGE.indexOf('id="panel-details"') < PAGE.indexOf('id="panel-result"'));
  assert.match(PAGE, /wireTabs\(\[document\.getElementById\("tab-run"\), document\.getElementById\("tab-audit"\), document\.getElementById\("tab-details"\), document\.getElementById\("tab-result"\)\]\)/);
  assert.match(src('syncResultTab'), /detail\.hasResult === true/);
});

test('the Run tab points at the Result tab only while the door is open on a run that has the tab', () => {
  const f = src('syncResultTab');
  assert.match(f, /show && detail\.accept === true && !detail\.live/);
  assert.match(f, /the result is on the <button class="rs-link"/);
  assert.match(f, /btn\.click\(\)/);
});

test('table: one column per signed fact (names from the server), one row per delivered result, a ✓ per cell and "5 of 5 ✓" only because the line passed; the quote sits in a fold, unhighlighted', () => {
  const r = realResult().lines[0];
  const h = fns.resultFactsLine(r);
  assert.deepEqual([...h.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1]), ['#', 'price', 'departure time', 'nonstop', 'origin', 'destination', 'checks']);
  assert.equal([...h.matchAll(/data-testid="result-row"/g)].length, 3);
  assert.equal([...h.matchAll(/data-testid="result-ok"/g)].length, 3 * 5);
  assert.equal([...h.matchAll(/5 of 5 ✓/g)].length, 3);
  assert.equal([...h.matchAll(/<details data-testid="result-proof"><summary>▸ proof/g)].length, 3);
  assert.ok(h.includes('class="audit-table-scroll"'));
  assert.ok(h.includes('From 144 US dollars. Nonstop flight with American.'));
  assert.equal(/<mark|highlight/i.test(h), false, 'no highlight until bareguard 0.25.0 (full.evidence)');
  r.facts.forEach((f) => assert.ok(h.includes(f.sentence.replace(/"/g, '&quot;')), 'the fact sentence is shown'));
});

test('table: a line whose check did not pass shows no ✓ anywhere (rows, if any, are bare)', () => {
  const r = { ...realResult().lines[0], passed: false };
  const h = fns.resultFactsLine(r);
  assert.equal(h.includes('✓'), false);
  assert.equal(h.includes('result-ok'), false);
  assert.equal(/code checked it/.test(h), false);
  assert.match(h, /data-testid="result-row"/);
});

test('a missing or changed file shows the server\'s words and no table; a line with no file says so', () => {
  const r = realResult().lines[0];
  assert.match(fns.resultFactsLine({ ...r, rows: null, file: { i: 0, state: 'changed', words: 'the saved file changed after the run' } }), /the saved file changed after the run/);
  assert.doesNotMatch(fns.resultFactsLine({ ...r, rows: null, file: { i: 0, state: 'gone', words: 'the saved file is gone' } }), /<table/);
  assert.match(fns.resultFactsLine({ ...r, rows: null, file: null, passed: false }), /no result was saved for this line/);
});

test('text line: the answer in a box and a quotes fold per input; everything escaped', () => {
  const h = fns.resultTextLine({ answer: 'a <b>x</b>', file: { i: 1, state: 'ok', words: null }, cites: [{ label: 'changelog', items: [{ claim: 'c1', quote: 'q<1>' }, { claim: 'c2', quote: 'q2' }] }] });
  assert.match(h, /class="rs-box"[^>]*>a &lt;b&gt;x&lt;\/b&gt;</);
  assert.match(h, /▸ quotes from changelog \(2\)/);
  assert.ok(h.includes('q&lt;1&gt;'));
});

test('the door: Accept, then Rerun with my words, then Pause; Rerun is off until words exist; it shows only when the run waits', () => {
  const h = fns.resultDoorHtml(realResult().door);
  const at = ['result-accept">Accept<', 'result-rerun-open">Rerun with my words<', 'result-pause">Pause<'].map((k) => h.indexOf(k));
  assert.ok(at.every((n) => n >= 0) && at[0] < at[1] && at[1] < at[2]);
  assert.match(h, /waiting for you<\/b> — the checks passed; is this what you wanted\?/);
  assert.match(h, /data-testid="result-rerun" disabled>Rerun</);
  assert.match(src('renderResult'), /detail\.accept === true && !detail\.live\) h \+= resultDoorHtml\(data\.door\)/);
});

test('page behaviour: Rerun posts trimmed non-empty words to the rerun route only; Pause to pause; Accept is the Run bar\'s one handler; downloads are the server\'s own links', () => {
  const w = src('wireResultDoor');
  assert.match(w, /words === ""\)\{ say\("resume-err"/);
  assert.match(w, /"\/rerun", \{text: words\}/);
  assert.match(w, /"\/pause", \{\}/);
  assert.match(w, /acceptDoor\(detail, accept, msg\)/);
  assert.match(src('renderRunActions'), /acceptDoor\(detail, accBtn, bar\)/);
  assert.match(PAGE, /"\/api\/runs\/" \+ encodeURIComponent\(detail\.runid\) \+ "\/accept"/);
  assert.match(src('renderResult'), /\/download\?i=' \+ d\.i/);
});

test('the Result functions never search a quote or draw a highlight', () => {
  const all = ['resultFactsLine', 'resultTextLine', 'renderResult', 'resultDoorHtml', 'wireResultDoor', 'syncResultTab'].map(src).join('\n');
  assert.equal(/\.indexOf\(|\.includes\(|\.search\(|\.match\(|new RegExp|<mark|highlight/.test(all), false);
});

test('red rows (fix 1): a judged file shows its note above bare rows (no ✓) and the gap words render after the lines, under the table', () => {
  const r = { ...realResult().lines[0], passed: false, file: { i: null, state: 'ok', words: null, judged: true, note: 'a red run delivers nothing; these rows are the last file the check read' } };
  const h = fns.resultFactsLine(r);
  assert.match(h, /data-testid="result-judged-note">a red run delivers nothing/);
  assert.equal(h.includes('✓'), false);
  assert.match(h, /result-row/);
  const f = src('renderResult');
  assert.ok(f.indexOf('result-gap') > f.indexOf('resultFactsLine(line)'), 'the gap words sit under the table');
});

test('confirmed (fix 2): the rules list adds the server\'s note after a fact\'s own sentence', () => {
  const r = realResult().lines[0];
  const facts = r.facts.map((f, i) => (i === 1 ? { ...f, note: '(you confirmed)' } : f));
  const h = fns.resultFactsLine({ ...r, facts });
  assert.equal([...h.matchAll(/\(you confirmed\)/g)].length, 1);
  assert.ok(h.includes(`${facts[1].sentence.replace(/"/g, '&quot;')} (you confirmed)`));
});

test('Not checked per line (fix 5): each line\'s items are drawn right after that line, one row per item, from the server\'s line.notChecked', () => {
  const f = src('renderResult');
  const at = f.indexOf('result-line-notchecked');
  assert.ok(at > f.indexOf('resultFactsLine(line)') && at < f.indexOf('result-notchecked">'), 'inside the line loop, before the bottom list');
  assert.match(f, /\(line\.notChecked \|\| \[\]\)\.forEach/);
});
