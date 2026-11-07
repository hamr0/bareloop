// R7b item 4: the generic Result tab on the page. The page's OWN pure drawing functions are cut out of src/panel/index.html by name and fed the real
// /result payloads of archived runs (tests/fixtures/result-tab). The page types none of the check, status or box words the server owns. The rubric tab's
// render is pinned to the OLD page's output (tests/fixtures/result-tab/rubric-render.golden.json) for the committed part5 runs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeResultWorld, makeRepoWithBranch } from './result-tab-world.mjs';
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
const names = ['resultFileWords', 'resultField', 'resultLineBox', 'resultProofHtml', 'resultFactsLine', 'resultTextLine', 'resultNotChecked', 'resultPageLink', 'resultLineCard', 'resultDoorHtml',
  'stageQuestionText', 'stageNumberText', 'stateDotHTML', 'resultDiffHtml', 'resultTicketCard', 'resultJobCard', 'resultChangedCard', 'resultChecksCard', 'resultWorkCard', 'resultRunCard', 'resultGenericHtml'];
// cut lazily so a missing page function fails ITS test, not the whole file
let cut = null;
const fns = new Proxy({}, { get: (_, k) => { cut ??= new Function(`${ESC}\nvar RESULT_NONE = ${JSON.stringify(NONE)};\n${names.map(src).join('\n')}\nreturn {${names.join(', ')}};`)(); return cut[k]; } });
// the rubric tab's own functions only: this test must pass on the page as it was before the generic tab
const rnames = names.slice(0, 10);
const rub = new Function(`${ESC}\nvar RESULT_NONE = ${JSON.stringify(NONE)};\n${rnames.map(src).join('\n')}\nreturn {${rnames.join(', ')}};`)();
const readJson = (f) => JSON.parse(readFileSync(join(HERE, 'fixtures', 'result-tab', f), 'utf8'));
const strip = (h) => h.replace(/<[^>]+>/g, '');
const at = (h, s) => { const i = h.indexOf(s); assert.ok(i >= 0, `expected ${s}`); return i; };

/** the real /result bodies */
function real() {
  const w = makeResultWorld(['mvkj03w7', 'mvy0cx24', 'mw1zse2m'], { repoFor: { mvkj03w7: true } });
  const repo = makeRepoWithBranch(w.root, 'bareloop-pulselog-panel-strict-5');
  const get = (id) => getRunResult(id, { home: w.home });
  return { green: get('mvkj03w7'), red: get('mvy0cx24'), ticket: get('mw1zse2m'), repo };
}
const detailOf = (o = {}) => ({ accept: false, live: false, ...o });

test('green run: five boxes in the signed order, no ticket box, no door unless the run waits at it', () => {
  const { green } = real();
  const h = fns.resultGenericHtml(green, detailOf());
  const heads = [...h.matchAll(/<h4>(.*?)<\/h4>/g)].map((m) => m[1]);
  assert.deepEqual(heads, ['The job', 'What changed', 'The checks', 'The work', 'The run']);
  assert.equal(h.includes('data-testid="result-ticket"'), false);
  assert.equal(h.includes('data-testid="result-door"'), false);
  assert.match(h, /data-testid="result-asked"[^>]*>Run the type checker in strict mode/);
  assert.match(h, /data-testid="result-scope">src\/\*\*</);
});

test('the door is the rubric tab\'s own resultDoorHtml, last, only while the run waits at the Accept door', () => {
  const { green } = real();
  const h = fns.resultGenericHtml(green, detailOf({ accept: true }));
  assert.ok(h.endsWith(fns.resultDoorHtml(green.door)), 'the very same markup, after The run');
  for (const t of ['result-accept', 'result-rerun-open', 'result-pause']) assert.ok(h.includes(`data-testid="${t}"`));
  assert.equal(fns.resultGenericHtml(green, detailOf({ accept: true, live: true })).includes('result-door'), false, 'a live run has no door');
});

test('what changed: the header, the LAST edit as a coloured wrapped diff (escaped), the cut words, a fold of every edit, the fence line', () => {
  const { green } = real();
  const h = fns.resultChangedCard(green.changed);
  assert.match(strip(h), /1 file · src\/checks\.js · \+123 −26 lines over 3 edits/);
  const diff = h.slice(at(h, 'data-testid="result-diff"'), at(h, '<details'));
  assert.match(diff, /<span class="rs-del">-      if \(err &amp;&amp; &#39;code&#39;|<span class="rs-del">-      if \(err &amp;&amp; 'code'/);
  assert.match(diff, /<span class="rs-add">\+      const killed = typeof err/);
  assert.match(diff, /<span class="rs-ctx">\.\.\.\(the last edit only; 26 more lines cut\)<\/span>/);
  assert.equal(/<[a-z]+[^>]*>[^<]*&&/.test(diff.replace(/<span[^>]*>/g, '')), false, 'no raw && leaks out of the escaping');
  assert.match(h, /<summary>show every edit of the run \(3\)<\/summary>/);
  const fold = h.slice(at(h, 'data-testid="result-all-edits"'));
  assert.equal((fold.match(/<pre class="rs-diff">/g) ?? []).length, 3, 'one block per edit');
  assert.match(h, /data-testid="result-scopeline">only src\/ was allowed; the run wrote 1 file, no other\.</);
  assert.match(PAGE, /\.rs-diff\{[^}]*white-space:pre-wrap;overflow-wrap:anywhere/, 'a long line wraps inside its box: no horizontal page scroll');
});

test('a diff line cannot inject markup', () => {
  const h = fns.resultDiffHtml('+<img src=x onerror=alert(1)>\n-a "q" & b\n+++ b/f\n--- a/f');
  assert.equal(h.includes('<img'), false);
  assert.match(h, /<span class="rs-add">\+&lt;img src=x onerror=alert\(1\)&gt;<\/span>/);
  assert.match(h, /<span class="rs-ctx">\+\+\+ b\/f<\/span>/, 'file headers are not additions');
  assert.match(h, /<span class="rs-ctx">--- a\/f<\/span>/);
});

test('the checks: one row per close stage, the existing question words, the status table\'s word in the existing dot markup, the number the owner words', () => {
  const { green } = real();
  const h = fns.resultChecksCard(green.checks);
  assert.match(strip(h), /7 of 7 passed · the close ran them after the worker stopped/);
  const rows = h.split('data-testid="result-check"').slice(1);
  assert.equal(rows.length, 7);
  assert.match(rows[0], /did it change any file\?/);
  assert.match(rows[1], /<span class="step-state" data-testid="result-check-state"><span class="dot green"><\/span><b class="st-word">passed<\/b><\/span> <span class="hint">0 left, need 0<\/span>/);
  assert.match(rows[2], /<span class="hint">46, limit 46<\/span>/);
  assert.match(h, /<summary>the close's own notes<\/summary>[^]*46 matching line\(s\) dropped by the scope filter/);
});

test('a failed run shows which check said no, in red with the status word failed', () => {
  const { red } = real();
  const h = fns.resultChecksCard(red.checks);
  assert.match(strip(h), /6 of 7 passed/);
  const rows = h.split('data-testid="result-check"').slice(1);
  const bad = rows.filter((r) => r.includes('class="dot red"'));
  assert.equal(bad.length, 1);
  assert.match(bad[0], /no casts or silencers added\?/);
  assert.match(bad[0], /<b class="st-word">failed<\/b>/);
  assert.equal(h.includes('rs-ok'), false, 'no tick on a run that did not pass every check');
  assert.match(fns.resultGenericHtml(red, detailOf()), /What changed/);
});

test('the work box: text lines only, no button, and only when the payload has one', () => {
  const { green, repo } = real();
  const h = fns.resultWorkCard(green.work);
  assert.match(h, /data-testid="result-branch">bareloop-pulselog-panel-strict-5 <span class="hint">&middot; final commit [0-9a-f]{7} &middot; made from f3206b2</);
  assert.ok(h.includes(repo.final.slice(0, 7)));
  assert.match(h, /data-testid="result-merge">git merge bareloop-pulselog-panel-strict-5</);
  assert.match(h, /data-testid="result-drop">git branch -D bareloop-pulselog-panel-strict-5</);
  assert.match(h, /shown as text; the merge is yours, no button runs it\./);
  assert.equal(/<button|<a /.test(h), false);
  assert.equal(fns.resultWorkCard(null), '');
  assert.equal(fns.resultGenericHtml({ ...green, work: null }, detailOf()).includes('result-work'), false);
});

test('the run box: a floor says so, a complete spend does not; steps and time are the server\'s words', () => {
  const { green, red } = real();
  const g = fns.resultRunCard(green.run);
  assert.match(g, /data-testid="result-spent">at least \$0\.12 <span class="hint">\(a floor: some rounds were unpriced\)<\/span>/);
  assert.match(g, /data-testid="result-steps">2 steps \(annotate-checks-strict, final-strict-clean\), no replan</);
  const r = fns.resultRunCard(red.run);
  assert.equal(r.includes('a floor'), false);
  assert.match(r, /data-testid="result-spent">\$0\.67</);
});

test('a ticket job gets the small box on top: #n · title and its link (http/https only, new tab); other jobs get none', () => {
  const { ticket, green } = real();
  const h = fns.resultGenericHtml(ticket, detailOf());
  assert.ok(h.startsWith('<div class="job-card" data-testid="result-ticket"><h4>The ticket</h4>'));
  assert.match(h, /data-testid="result-ticket-title"[^>]*>#7 &middot; fwdloop test: P1 walk 2</);
  assert.match(h, /<a data-testid="result-ticket-link" href="https:\/\/github\.com\/hamr0\/hol-guard\/issues\/7" target="_blank" rel="noopener noreferrer">/);
  assert.equal(fns.resultTicketCard({ number: 3, title: 'x', url: 'javascript:alert(1)' }).includes('<a '), false);
  assert.equal(fns.resultTicketCard(green.ticket), '');
});

test('no recorded edit or close: each box says so in plain words, never an invented one', () => {
  assert.match(fns.resultChangedCard(null), /no edit was recorded for this run/);
  assert.match(fns.resultChecksCard(null), /the close did not run any check for this run/);
});

test('renderResult: the generic branch is by the payload\'s `kind`, through the one tail the rubric tab also uses; syncResultTab and its gate are untouched', () => {
  const f = src('renderResult');
  assert.match(f, /if\(data\.kind === "generic"\)\{ paintResultBody\(body, resultGenericHtml\(data, detail\), detail, typed, rerunOpen\); return; \}/);
  assert.match(f, /resultLineCard\(line, ownPages, data\.pageNote\)/, 'the rubric loop is still there');
  assert.match(f, /paintResultBody\(body, h, detail, typed, rerunOpen\);\s*\}$/);
  assert.match(src('syncResultTab'), /var show = detail\.hasResult === true;/);
});

test('RUBRIC = A: the rubric tab\'s line cards and door draw exactly what the old page drew for the committed part5 runs', () => {
  const rr = readJson('rubric-result.golden.json');
  const golden = readJson('rubric-render.golden.json');
  for (const id of ['mve5y8fa', 'mvdg1xo3']) {
    assert.deepEqual(rr[id].lines.map((l) => rub.resultLineCard(l, false, rr[id].pageNote)), golden[id].lines, `${id}: line cards`);
    assert.equal(rub.resultDoorHtml(rr[id].door), golden[id].door, `${id}: door`);
  }
});

test('the asked text and the fence are escaped: a job line cannot inject markup', () => {
  const h = fns.resultJobCard({ asked: 'fix <b>this</b> & "that"', scope: ['<i>x</i>/**'] });
  assert.equal(/<b>|<i>/.test(h), false);
  assert.match(h, /fix &lt;b&gt;this&lt;\/b&gt; &amp; &quot;that&quot;/);
  assert.equal(fns.resultJobCard({ asked: 'x', scope: null }).includes('Where it may change files'), false, 'no fence recorded: no box for it');
});
