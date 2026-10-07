// Reuse workflow PICKER (hamr 2026-10-06) — the PAGE side. Same posture as p5-startfrom-page.test.js: the page's own
// functions extracted from src/panel/index.html and run against tiny fakes (no jsdom). The list and the estimate line
// are the server's (tests/p5-startfrom.test.js covers GET /api/author/reuse-jobs); here: 3 radios, filter + marks,
// empty states, pick -> start-from, change, leaving reuse, radios clickable, checkType taken from the picked job.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0;
  let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) {
    if (PAGE[i] === '{') depth += 1;
    else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return PAGE.slice(start, i + 1);
}
/** build `fnNames` (real page source) inside a scope holding `scope` (name -> value) and `vars` (var decl text) */
function build(fnNames, scope = {}, vars = '', ret = '') {
  const keys = Object.keys(scope);
  // eslint-disable-next-line no-new-func
  return new Function(...keys, `${vars}\n${fnNames.map(fnSrc).join('\n')}\nreturn {${[...fnNames, ret].filter(Boolean).join(',')}};`)(...keys.map((k) => scope[k]));
}
const escapeXml = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const JOBS = [
  { job: 'fix-failing-tests', runid: 'r1', checkType: 'deterministic', line: 'Same job — 4 green · 1 not green · about $0.42 and 7 min a run' },
  { job: 'doc-summary-weekly', runid: 'r3', checkType: 'rubric', line: 'Same job — 3 green · 2 not green · about $0.08 and 2 min a run' },
];

test('markup: Check type is ONE radio group of three — Deterministic, Rubric, Reuse workflow — and the labels never wrap', () => {
  const card = PAGE.slice(PAGE.indexOf('id="job-card"'), PAGE.indexOf('id="jf-model"'));
  const radios = [...card.matchAll(/<input type="radio" name="jf-verdict" value="(\w+)"[^>]*> ([^<]+)</g)].map((m) => [m[1], m[2].trim()]);
  assert.deepEqual(radios, [['deterministic', 'Deterministic'], ['rubric', 'Rubric'], ['reuse', 'Reuse workflow']]);
  assert.match(PAGE, /\.radio-row label\{white-space:nowrap;\}/, 'so "Reuse workflow" does not wrap at 420px');
  assert.match(card, /id="rw-q"[^>]*placeholder="type a job name…"/);
  assert.match(card, /id="rw-change"[^>]*>change</);
});

test('list: typing filters by case-insensitive substring of the job name; matched letters are <mark>ed; each row is the name over "<check type> · <the server line>"', () => {
  const q = { value: '' };
  const list = { innerHTML: '' };
  const { renderReuseList } = build(['rwMark', 'rwMeta', 'renderReuseList'], { rwQ: q, rwList: list, escapeXml }, 'var rwJobs = JOBS_; var rwFailed = false; var rwShown = []; var rwHl = 0;'.replace('JOBS_', JSON.stringify(JOBS)));
  renderReuseList();
  assert.equal([...list.innerHTML.matchAll(/data-testid="rw-item"/g)].length, 2, 'empty query lists every job');
  assert.match(list.innerHTML, /rubric · 3 green · 2 not green · about \$0\.08 and 2 min a run/, 'check type prefixed, "Same job — " dropped, the rest is the server line verbatim');
  assert.match(list.innerHTML, /deterministic · 4 green/);
  q.value = 'SUMM';
  renderReuseList();
  assert.equal([...list.innerHTML.matchAll(/data-testid="rw-item"/g)].length, 1);
  assert.match(list.innerHTML, /doc-<mark>summ<\/mark>ary-weekly/, 'matched letters (original casing) marked');
  assert.doesNotMatch(list.innerHTML, /fix-failing/);
});

test('list: empty states — no match says so with the query; no green jobs at all says that; a failed load says it could not load', () => {
  const q = { value: 'zz' };
  const list = { innerHTML: '' };
  const mk = (jobs, failed) => build(['rwMark', 'rwMeta', 'renderReuseList'], { rwQ: q, rwList: list, escapeXml }, `var rwJobs = ${JSON.stringify(jobs)}; var rwFailed = ${failed}; var rwShown = []; var rwHl = 0;`).renderReuseList;
  mk(JOBS, false)();
  assert.match(list.innerHTML, /No green job matches "zz"\./);
  q.value = '<b>';
  mk(JOBS, false)();
  assert.match(list.innerHTML, /matches "&lt;b&gt;"/, 'the query is escaped');
  q.value = '';
  mk([], false)();
  assert.match(list.innerHTML, /No green jobs yet\./);
  mk(null, true)();
  assert.match(list.innerHTML, /Could not load the job list\./);
});

test('pick: a job hands its newest-green runid and the card Model to the EXISTING reuse door (reuseWorkflow -> start-from?runid=&model=) — no second fill path', async () => {
  const calls = [];
  const { pickReuseJob } = build(['pickReuseJob'], { reuseWorkflow: (...a) => calls.push(a), modelSelect: { value: 'deepseek-flash' } });
  pickReuseJob(JOBS[1]);
  assert.deepEqual(calls, [['r3', 'deepseek-flash']]);
  // and reuseWorkflow itself asks start-from with the model, then dispatches bareloop-reuse (the one fill path)
  const urls = []; const events = [];
  const { reuseWorkflow } = build(['reuseWorkflow'], {
    authorGet: (u) => { urls.push(u); return Promise.resolve({ ok: true, card: {}, line: 'l' }); },
    document: { getElementById: () => ({ click() {} }), dispatchEvent: (e) => events.push(e) },
    CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i.detail; } }, window: { alert() { throw new Error('no alert'); } },
  });
  reuseWorkflow('r 3', 'deepseek-flash');
  await new Promise((r) => { setTimeout(r, 10); });
  assert.deepEqual(urls, ['/api/author/start-from?runid=r%203&model=deepseek-flash']);
  assert.equal(events[0].type, 'bareloop-reuse');
  assert.match(PAGE, /document\.addEventListener\("bareloop-reuse", function\(e\)\{ applyReuse\(e\.detail \|\| \{\}\); \}\);/, 'the listener and the picker share applyReuse');
});

test('picked state: applyReuse (either door) puts the radio on Reuse workflow, takes checkType from the JOB, shows the name — and there is no origin line', () => {
  const log = [];
  const sfLine = { hidden: true, textContent: '', className: '' };
  const sfNote = { hidden: true, textContent: '' };
  const els = { 'jf-judge': { disabled: false } };
  const api = build(['rwMeta', 'applyReuse'], {
    clearStartFrom: () => log.push('clear'), openNewCard: () => log.push('open'), modelSelect: { value: '' },
    setVerdict: (v) => log.push(`verdict:${v}`), setVal: (id, v) => log.push(`val:${id}=${v}`), setReuseLocked: (on) => log.push(`lock:${on}`),
    renderPicker: () => log.push('picker'), sfLine, sfNote, refreshModelStatus() {}, refreshReuseLine() {}, refreshCapNote() {}, refreshStartEnabled() {},
    document: { getElementById: (id) => els[id] },
  }, 'var startFrom = null, reuseCheckType = "deterministic", reusePickedName = "";', '__s: () => ({startFrom, reuseCheckType, reusePickedName})');
  api.applyReuse({ runid: 'r3', prefill: { card: { checkType: 'rubric', jobName: 'doc-summary-weekly', model: '', judgeExamples: 'Good: x' }, origin: { job: 'doc-summary-weekly' }, line: 'Same job — 3 green · 2 not green' } });
  assert.deepEqual(api.__s(), { startFrom: { runid: 'r3' }, reuseCheckType: 'rubric', reusePickedName: 'doc-summary-weekly' });
  assert.ok(log.includes('verdict:reuse'), 'radio on Reuse workflow');
  assert.ok(log.indexOf('picker') > log.indexOf('lock:true'));
  assert.equal(els['jf-judge'].disabled, false, 'a rubric job opens the judge box');
  assert.equal(sfLine.textContent, 'rubric · 3 green · 2 not green', 'line under the picked box carries the check type, as in the list');
  // the import door (no runid) reaches the same state
  api.applyReuse({ importId: 'abc', prefill: { card: { checkType: 'deterministic', jobName: 'imp' }, line: '' } });
  assert.deepEqual(api.__s().startFrom, { importId: 'abc' });
  assert.doesNotMatch(fnSrc('applyReuse'), /Reuse: /, 'no "Reuse: job (run …)" origin line');
});

test('renderPicker: hidden unless the radio is Reuse workflow; search box before a pick, the bold name + change after; a re-attached reuse session counts as picked', () => {
  const mkEl = () => ({ hidden: false, innerHTML: '' });
  const rwBox = mkEl(); const rwSearch = mkEl(); const rwPicked = mkEl(); const rwPickedTxt = mkEl();
  const sfLine = { hidden: false };
  const state = (verdict, startFrom, reuseSession) => build(['renderPicker'], { verdictValue: () => verdict, rwBox, rwSearch, rwPicked, rwPickedTxt, sfLine, escapeXml },
    `var startFrom = ${JSON.stringify(startFrom)}; var reuseSession = ${reuseSession}; var reusePickedName = "a<b";`).renderPicker();
  state('deterministic', null, false);
  assert.equal(rwBox.hidden, true);
  state('reuse', null, false);
  assert.deepEqual([rwBox.hidden, rwSearch.hidden, rwPicked.hidden, sfLine.hidden], [false, false, true, true]);
  state('reuse', { runid: 'r1' }, false);
  assert.deepEqual([rwBox.hidden, rwSearch.hidden, rwPicked.hidden], [false, true, false]);
  assert.equal(rwPickedTxt.innerHTML, '<b>a&lt;b</b>');
  state('reuse', null, true);
  assert.equal(rwPicked.hidden, false, 're-attached live reuse session shows as picked');
  state('rubric', { runid: 'r1' }, false);
  assert.equal(rwBox.hidden, true, 'a stale pick never shows under another type');
});

test('change: back to the EMPTY search state — clear the reuse, radio stays on Reuse workflow, card emptied, search reopened', () => {
  const log = [];
  const { unpickReuse } = build(['unpickReuse'], { clearStartFrom: () => log.push('clearStartFrom'), setVerdict: (v) => log.push(`verdict:${v}`), openPicker: () => log.push('openPicker') });
  unpickReuse();
  assert.deepEqual(log, ['clearStartFrom', 'verdict:reuse', 'openPicker']);
  const log2 = [];
  const q = { value: 'x', focus: () => log2.push('focus') };
  const { openPicker } = build(['openPicker'], {
    clearCardBoxes: () => log2.push('boxes'), rwQ: q, document: { getElementById: () => ({ disabled: false }) }, renderPicker: () => log2.push('picker'),
    renderReuseList: () => log2.push('list'), loadReuseJobs: () => log2.push('load'), refreshStartEnabled: () => log2.push('start'),
  }, 'var rwHl = 3;');
  openPicker();
  assert.equal(q.value, '');
  assert.deepEqual(log2, ['boxes', 'picker', 'list', 'load', 'start', 'focus']);
});

test('leaving reuse: Deterministic or Rubric while the picker shows (picked or not) = clearStartFrom + empty card on that type; outside reuse they only toggle the judge box; Reuse opens the picker once', () => {
  const log = [];
  const judge = { disabled: true };
  const mk = (hidden) => build(['onVerdictChange'], {
    rwBox: { hidden }, openPicker: () => log.push('openPicker'), clearStartFrom: () => log.push('clearStartFrom'), clearCardBoxes: () => log.push('boxes'),
    setVerdict: (v) => log.push(`verdict:${v}`), renderPicker: () => log.push('picker'), refreshStartEnabled: () => log.push('start'),
    document: { getElementById: () => judge },
  }).onVerdictChange;
  mk(false)('rubric');
  assert.deepEqual(log.splice(0), ['clearStartFrom', 'boxes', 'verdict:rubric', 'picker', 'start']);
  assert.equal(judge.disabled, false, 'rubric opens the judge box');
  mk(false)('deterministic');
  assert.equal(judge.disabled, true);
  log.length = 0;
  mk(true)('rubric');
  assert.deepEqual(log, ['start'], 'det <-> rubric outside reuse clears nothing');
  log.length = 0;
  mk(true)('reuse');
  assert.deepEqual(log, ['openPicker']);
  log.length = 0;
  mk(false)('reuse');
  assert.deepEqual(log, [], 'already in reuse: nothing');
});

test('radios stay CLICKABLE during reuse (only a live session freezes them); the reuse lock never greys the Check type', () => {
  const src = fnSrc('syncCardLock');
  assert.match(src, /r\.disabled = live;/);
  assert.doesNotMatch(src, /r\.disabled = reuseOn/);
  assert.doesNotMatch(PAGE, /\.job-card\.reuse \.radio-row label\{/, 'no dimmed/not-allowed radio labels on a reuse card');
});

test('checkType on the start request comes from the PICKED job when the radio is Reuse workflow, never from the radio', () => {
  const val = (id) => ({ value: id === 'jf-cap-money' ? '2' : '' });
  const mk = (verdict, reuseCheckType) => build(['currentCard'], { document: { getElementById: val }, verdictValue: () => verdict }, `var reuseCheckType = ${JSON.stringify(reuseCheckType)};`).currentCard();
  assert.equal(mk('reuse', 'rubric').checkType, 'rubric');
  assert.equal(mk('reuse', 'deterministic').checkType, 'deterministic');
  assert.equal(mk('rubric', 'deterministic').checkType, 'rubric');
  assert.equal(mk('deterministic', 'rubric').checkType, 'deterministic', 'a stale pick never leaks into a plain card');
});

test('Sign & run: disabled before a pick (startOk needs startFrom while the radio is Reuse workflow); the main button reads "Sign & run" on a reuse card, pick or not', () => {
  const run = (verdict, startFrom, cap = '2') => {
    const api = build(['refreshStartEnabled'], {
      moneyCapInput: { value: cap }, verdictValue: () => verdict, syncCardLock() {}, renderMain() {}, refreshClearBtn() {},
    }, `var startOk = null, sessionLive = false, keyOk = true, startFrom = ${JSON.stringify(startFrom)};`, '__ok: () => startOk');
    api.refreshStartEnabled();
    return api.__ok();
  };
  assert.equal(run('reuse', null), false, 'nothing picked');
  assert.equal(run('reuse', { runid: 'r1' }), true);
  assert.equal(run('deterministic', null), true, 'plain cards unchanged');
  assert.match(fnSrc('renderMain'), /mainButtonFor\(st, !msgInput\.value\.trim\(\), !!startFrom \|\| verdictValue\(\) === "reuse"\)/);
});
