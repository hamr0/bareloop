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
const NONE = /var RESULT_NONE = "([^"]+)";/.exec(PAGE)[1];
const names = ['resultFileWords', 'resultField', 'resultLineBox', 'resultProofHtml', 'resultFactsLine', 'resultTextLine', 'resultNotChecked', 'resultLineCard', 'resultDoorHtml'];
const fns = new Function(`${ESC}\nvar RESULT_NONE = ${JSON.stringify(NONE)};\n${names.map(src).join('\n')}\nreturn {${names.join(', ')}};`)();

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

test('results: one box per delivered result (Result N + "5 of 5 ✓"), one small box per signed fact with the value and a ✓, the proof folded; no table, no highlight', () => {
  const r = realResult().lines[0];
  const h = fns.resultFactsLine(r);
  assert.equal(/<table|<th|<td/.test(h), false, 'variation A (the table) is not built');
  assert.equal([...h.matchAll(/data-testid="result-row"/g)].length, 3);
  assert.deepEqual([...h.matchAll(/<b style="color:var\(--text\)">(Result \d)<\/b>/g)].map((m) => m[1]), ['Result 1', 'Result 2', 'Result 3']);
  assert.deepEqual([...h.matchAll(/<label>([^<]*)<\/label><div class="ro-value" data-testid="result-cell">/g)].map((m) => m[1]).slice(0, 5), ['price', 'departure time', 'nonstop', 'origin', 'destination']);
  assert.equal([...h.matchAll(/data-testid="result-ok"/g)].length, 3 * 5);
  assert.equal([...h.matchAll(/5 of 5 ✓/g)].length, 3);
  assert.equal([...h.matchAll(/<details data-testid="result-proof"><summary>proof — the page's own words/g)].length, 3);
  assert.equal(/<details[^>]* open/.test(h), false, 'the proof is folded');
  assert.ok(h.includes('From 144 US dollars. Nonstop flight with American.'));
  assert.ok(h.includes('data-testid="result-cell">$144 <span class="rs-ok"'), 'money as the fact signs it');
  assert.equal(/<mark|highlight/i.test(h), false, 'no highlight until bareguard 0.25.0 (full.evidence)');
  assert.match(h, /<label>The checks<\/label>/);
  r.facts.forEach((f) => assert.ok(h.includes(f.sentence.replace(/"/g, '&quot;')), 'the fact sentence is shown'));
  assert.match(h, /✓ = code checked it against the saved page/);
});

test('results: a line whose check did not pass shows no ✓ anywhere (rows, if any, are bare)', () => {
  const r = { ...realResult().lines[0], passed: false };
  const h = fns.resultFactsLine(r);
  assert.equal(h.includes('✓'), false);
  assert.equal(h.includes('result-ok'), false);
  assert.match(h, /data-testid="result-row"/);
});

test('no saved result: ONE line "no saved result to show"; a delivered file\'s gone/changed words are never on the line (they are said once, in Saved)', () => {
  const r = realResult().lines[0];
  for (const words of ['the saved file changed after the run', 'the saved file is gone']) {
    const h = fns.resultFactsLine({ ...r, rows: null, file: { i: 0, state: 'gone', words } });
    assert.equal(h.includes(words), false);
    assert.equal([...h.matchAll(/no saved result to show/g)].length, 1);
  }
  assert.equal([...fns.resultFactsLine({ ...r, rows: null, file: null, passed: false }).matchAll(/no saved result to show/g)].length, 1);
  // a red run's own judged file words stay on its line
  const red = fns.resultFactsLine({ ...r, passed: false, rows: null, file: { i: null, state: 'gone', words: 'the file is gone', judged: true, note: 'n' } });
  assert.match(red, /the file is gone/);
  assert.equal(red.includes('no saved result to show'), false);
});

test('line card: "Line N" title, the job line box "N. text" with a space and its ~ rules, text never cut', () => {
  const r = realResult().lines[0];
  const h = fns.resultLineCard({ ...r, text: 'Write a short summary of what changed in every release', notChecked: [] });
  assert.match(h, /<h4>Line 1<\/h4>/);
  assert.match(h, /data-testid="result-linetext">1\. Write a short summary of what changed in every release<br>~ under \$450<br>~ not a red-eye<br>~ nonstop</);
  assert.equal(/text-overflow|ellipsis|\.slice\(|substring/.test(src('resultLineBox')), false);
});

test('Not checked is a list, one item per row, under its own line, in the Job tab\'s box words', () => {
  const r = realResult().lines[0];
  const h = fns.resultLineCard({ ...r, notChecked: ['"nonstop" — x', 'line 2: what the text says — you judge it at Accept'] });
  assert.equal([...h.matchAll(/<li>/g)].length, 2);
  assert.match(h, /<label>Not checked<\/label>/);
  assert.equal(fns.resultNotChecked('x', [], 't'), '');
});

test('text line: the answer in its own box and a quotes fold per input; everything escaped', () => {
  const h = fns.resultTextLine({ answer: 'a <b>x</b>', file: { i: 1, state: 'ok', words: null }, cites: [{ label: 'changelog', items: [{ claim: 'c1', quote: 'q<1>' }, { claim: 'c2', quote: 'q2' }] }] });
  assert.match(h, /<label>Answer<\/label>[^]*a &lt;b&gt;x&lt;\/b&gt;/);
  assert.match(h, /<label>Quotes from changelog \(2\)<\/label>/);
  assert.ok(h.includes('q&lt;1&gt;'));
});

test('the door: Accept, then Rerun with my words, then Pause; Rerun is off until words exist; it shows only when the run waits', () => {
  const h = fns.resultDoorHtml(realResult().door);
  const at = ['result-accept">Accept<', 'result-rerun-open">Rerun with my words<', 'result-pause">Pause<'].map((k) => h.indexOf(k));
  assert.ok(at.every((n) => n >= 0) && at[0] < at[1] && at[1] < at[2]);
  assert.match(h, /<h4>Your call<\/h4>/);
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
  const all = ['resultFactsLine', 'resultTextLine', 'resultLineCard', 'resultLineBox', 'resultNotChecked', 'renderResult', 'resultDoorHtml', 'wireResultDoor', 'syncResultTab'].map(src).join('\n');
  assert.equal(/\.indexOf\(|\.includes\(|\.search\(|\.match\(|new RegExp|<mark|highlight/.test(all), false);
});

test('red rows (fix 1): a judged file shows its note above bare rows (no ✓) and the gap words render after the lines, under the table', () => {
  const r = { ...realResult().lines[0], passed: false, file: { i: null, state: 'ok', words: null, judged: true, note: 'a red run delivers nothing; these rows are the last file the check read' } };
  const h = fns.resultFactsLine(r);
  assert.match(h, /data-testid="result-judged-note">a red run delivers nothing/);
  assert.equal(h.includes('✓'), false);
  assert.match(h, /result-row/);
  const f = src('renderResult');
  assert.ok(f.indexOf('result-gap') > f.indexOf('resultLineCard(line,'), 'the gap words sit under the line cards');
});

test('confirmed (fix 2): the rules list adds the server\'s note after a fact\'s own sentence', () => {
  const r = realResult().lines[0];
  const facts = r.facts.map((f, i) => (i === 1 ? { ...f, note: '(you confirmed)' } : f));
  const h = fns.resultFactsLine({ ...r, facts });
  assert.equal([...h.matchAll(/\(you confirmed\)/g)].length, 1);
  assert.ok(h.includes(`${facts[1].sentence.replace(/"/g, '&quot;')} (you confirmed)`));
});

test('Not checked per line (fix 5): each line card lists its own items (server line.notChecked) after its results; the unlinked rest is a separate card', () => {
  const card = src('resultLineCard');
  assert.ok(card.indexOf('result-line-notchecked') > card.indexOf('resultFactsLine(line)'));
  assert.match(card, /line\.notChecked/);
  const f = src('renderResult');
  assert.ok(f.indexOf('result-notchecked') > f.indexOf('resultLineCard(line,'), 'the unlinked items come after the line cards');
  assert.match(f, /resultNotChecked\("Not checked \(the AI's own reading\)", data\.notChecked/);
});

test('cards (signed look, variation B): Result, Line N, Your call, Saved — in the panel\'s own .job-card boxes; the "gone" words render once per file, in Saved only; no table', () => {
  const f = src('renderResult');
  const at = ['<h4>Result</h4>', 'resultLineCard(line,', 'resultDoorHtml(data.door)', '<h4>Saved</h4>'].map((k) => f.indexOf(k));
  assert.ok(at.every((n) => n >= 0) && at.every((n, i) => i === 0 || n > at[i - 1]), `order ${at}`);
  assert.match(f, /d\.words \? '<div class="rs-warn" data-testid="result-file-gone">'/);
  assert.equal([...PAGE.matchAll(/result-file-gone/g)].length, 1);
  assert.match(src('resultDoorHtml'), /id="result-door-card"/);
  assert.match(PAGE, /#result-door-card\{border-color:var\(--amber\);\}/);
  assert.equal(/<table|audit-table-scroll/.test(['resultFactsLine', 'resultLineCard', 'renderResult'].map(src).join('')), false);
});
