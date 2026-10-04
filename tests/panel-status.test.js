// hamr's click-through 2026-10-04, items C6-C9: ONE code-owned sign -> word table (src/panel/status.js), read by every
// surface. Server side against real readers + a scratch home; page side against the page's own functions.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statusFor, STATUS } from '../src/panel/status.js';
import { glyphForOutcome, listRuns, getRunDetail } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';
import { jobSpecHash } from '../src/job.js';

/** @type {string[]} */ const tmps = [];
after(() => { for (const d of tmps) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'panel-status-')); tmps.push(d); return d; };

test('C6: the table is exactly the seven signs/words hamr ruled', () => {
  assert.deepEqual(Object.entries(STATUS).map(([k, v]) => `${k}:${v.sign}:${v.word}`), [
    'running:▶:running', 'waiting:·:waiting', 'passed:✓:passed', 'failed:✗:failed', 'capped:✗:capped', 'stopped:✗:stopped', 'died:?:died',
  ]);
});

test('C6: every outcome the panel knows maps to exactly one word; the glyph is the table\'s sign (one writer)', () => {
  const W = (o) => statusFor(o).word;
  for (const out of ['green', 'already-green', 'satisfied']) assert.equal(W({ outcome: out }), 'passed');
  assert.equal(W({ outcome: null }), 'running');
  assert.equal(W({ outcome: null, died: true }), 'died');
  assert.equal(W({ outcome: 'green', died: true }), 'died');
  assert.equal(W({ outcome: 'cap-halt' }), 'capped');
  assert.equal(W({ outcome: 'wall-halt' }), 'capped');
  assert.equal(W({ outcome: 'escalated', category: 'cap-halt', moneyHalt: true }), 'capped', 'a money-halt escalation is a money cap');
  assert.equal(W({ outcome: 'escalated', category: 'wall-halt' }), 'capped');
  assert.equal(W({ outcome: 'escalated', category: 'cap-halt', moneyHalt: false }), 'failed', 'strike-ladder stop is the fix loop, not a cap');
  assert.equal(W({ outcome: 'escalated', category: 'provider-red' }), 'failed');
  assert.equal(W({ outcome: 'stopped' }), 'stopped');
  for (const out of ['plan-red', 'check-red', 'step-red', 'escalated', 'close-red', 'provider-red', 'step-stalled', 'door-accept-red', 'branch-red', 'whatever-new']) {
    assert.equal(W({ outcome: out }), 'failed', out);
  }
  for (const out of ['green', 'cap-halt', 'stopped', 'plan-red', null]) assert.equal(glyphForOutcome(out), statusFor({ outcome: out }).sign);
});

const SPEC = { job: 'fix-types', description: 'x', budgetUsd: 8, maxWallMs: 3_600_000, goal: 'g' };
function makeRun(home, runid, outcome, { jobEnd = true, extra = [] } = {}) {
  const out = tmp();
  const into = join(out, 'source-x');
  const dir = join(into, 'fix-types-bareloop');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(into, 'source.json'), JSON.stringify({ source: '/x', destination: '/y' }));
  writeFileSync(join(out, 'resolved-spec.json'), JSON.stringify(SPEC));
  const t = (n) => `2026-10-01T10:0${n}:00.000Z`;
  const records = [
    { type: 'job-start', job: SPEC.job, specHash: jobSpecHash(SPEC), budgetUsd: 8, shape: 'plan', goal: 'g', ts: t(0), seq: 1 },
    { type: 'plan-accepted', plan: { schema: 'plan-v1', steps: [{ id: 'fix-types' }] }, ts: t(1), seq: 2 },
    { type: 'worker-round', kind: 'turn', costUsd: 1, ts: t(2), seq: 3 },
    ...extra,
    ...(jobEnd ? [{ type: 'job-end', outcome, spentUsd: 1, spendComplete: true, ts: t(5), seq: 99 }] : []),
  ];
  const spine = join(dir, `u-${runid}.jsonl`);
  writeFileSync(spine, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  utimesSync(spine, old, old);
  appendRun({ at: '2026-10-01T10:00:00.000Z', runid, job: SPEC.job, spine, patient: null, via: 'run-u' }, { home });
}

test('C6-C8: the list row and the run detail carry the status from the ONE table (word, sign, glyph agree) plus the header\'s times', () => {
  const home = tmp();
  makeRun(home, 'g1', 'green');
  makeRun(home, 'c1', 'cap-halt');
  makeRun(home, 's1', 'stopped');
  makeRun(home, 'r1', 'check-red');
  makeRun(home, 'd1', null, { jobEnd: false });
  makeRun(home, 'm1', 'escalated', { extra: [{ type: 'money-halt', ts: '2026-10-01T10:04:00.000Z', seq: 50 }, { type: 'escalation', category: 'cap-halt', ts: '2026-10-01T10:04:30.000Z', seq: 51 }] });
  const rows = Object.fromEntries(listRuns({ home }).map((r) => [r.runid, r]));
  const want = { g1: 'passed', c1: 'capped', s1: 'stopped', r1: 'failed', d1: 'died' };
  for (const [id, word] of Object.entries(want)) {
    assert.equal(rows[id].status.word, word, id);
    assert.equal(rows[id].glyph, rows[id].status.sign, `${id}: the glyph is the status sign`);
    assert.equal(getRunDetail(id, { home }).status.word, word, `${id} detail`);
  }
  const d = getRunDetail('g1', { home });
  assert.equal(d.endedAt, '2026-10-01T10:05:00.000Z');
  assert.equal(d.startedAt, '2026-10-01T10:00:00.000Z');
  assert.equal(getRunDetail('d1', { home }).endedAt, null, 'a died run has no end time');
  assert.match(rows.s1.endedLine, /^you pressed Stop/);
  assert.match(rows.d1.endedLine, /^no ending recorded/);
  assert.equal(rows.m1.status.word, 'capped', 'a money-halt escalation reads capped');
});

// ── page ────────────────────────────────────────────────────────────────────────────────────────────────────
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
const fake = () => ({ innerHTML: '', className: '', textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute() {}, addEventListener() {}, children: [], appendChild(c) { this.children.push(c); } });

function rowHarness() {
  const names = ['escapeXml', 'glyphClass', 'statusWordHtml', 'panelMoney', 'panelMoneyWithDraft', 'liveSpendText', 'liveWallPhrase', 'duration', 'rowIsLive', 'rowWallText', 'rowSpendText', 'resumedTagHtml', 'buildRunRowEl'];
  // eslint-disable-next-line no-new-func
  return new Function('document', 'selectRun', 'scrollRunIntoViewMobile', `var currentRunid = null;\n${names.map(fnSrc).join('\n')}\nreturn buildRunRowEl;`)(
    { createElement: fake, getElementById: fake }, () => {}, () => {});
}
const RUN = {
  runid: 'demod3', job: 'demo-plain-green', glyph: '✗', status: { sign: '✗', word: 'failed' }, endedLine: 'checks said no', checkType: 'deterministic',
  spentUsd: 3.5, spendComplete: true, wallMs: 600000, date: '2026-10-04', resumedCount: 0, died: false,
};

test('C7: a History card is line 1 sign + job (runid), line 2 **word** — reason, line 3 the facts', () => {
  const row = rowHarness()(RUN);
  const html = row.innerHTML;
  const i1 = html.indexOf('demo-plain-green (demod3)');
  const i2 = html.indexOf('<b class="st-word">failed</b> — checks said no');
  const i3 = html.indexOf('deterministic');
  assert.ok(i1 !== -1 && i2 > i1 && i3 > i2, html);
  assert.match(html, /class="dot red"/);
});

test('C7: an EXPANDED per-run row reads `[sign] **word** — reason   runid · $ · date`', () => {
  const row = rowHarness()(RUN, true);
  const html = row.innerHTML;
  assert.match(html, /class="dot red"[^]*<b class="st-word">failed<\/b> — checks said no[^]*demod3 · \$3\.50 · 2026-10-04/);
  assert.doesNotMatch(html, /wf-name/, 'the compact row does not repeat the job name');
});

test('C7: a live run card reads **running** with no reason, never a stale ended line', () => {
  const html = rowHarness()({ ...RUN, glyph: '▶', status: { sign: '▶', word: 'running' }, endedLine: null }).innerHTML;
  assert.match(html, /<b class="st-word">running<\/b><\/span>/);
});

function headerHarness() {
  const els = {};
  const get = (id) => els[id] ?? (els[id] = fake());
  // eslint-disable-next-line no-new-func
  const api = new Function('document', `${['escapeXml', 'glyphClass', 'statusWordHtml', 'fmtLocalDateTime', 'setRunHeader', 'liveStepText', 'runHeaderBody', 'realSteps'].map(fnSrc).join('\n')}\nreturn {setRunHeader, runHeaderBody};`)({ getElementById: get });
  return { els, ...api };
}

test('C8: the right-side header reads `[sign] job (runid) │ **word** — reason · ended <local date, time>`', () => {
  const h = headerHarness();
  const detail = { status: { sign: '✗', word: 'failed' }, ended: { line: 'checks said no' }, endedAt: '2026-10-04T16:01:00.000Z', startedAt: '2026-10-04T15:00:00.000Z', steps: [] };
  h.setRunHeader('✗', 'demo-plain-green (demod3)', h.runHeaderBody(detail));
  assert.equal(h.els['active-wf-name'].textContent, 'demo-plain-green (demod3)');
  assert.equal(h.els['active-wf-dot'].className, 'dot red');
  const html = h.els['active-wf-verdict'].innerHTML;
  assert.match(html, /^<span class="rp-sep">│<\/span><b class="st-word">failed<\/b> — checks said no · ended \d{1,2}\/\d{1,2}\/2026, \d{1,2}:\d{2} (AM|PM)$/);
});

test('C8: a live run reads `**running** — step 2 of 3 · started <time>`', () => {
  const h = headerHarness();
  const body = h.runHeaderBody({ status: { sign: '▶', word: 'running' }, ended: null, startedAt: '2026-10-04T15:00:00.000Z', steps: [{ state: 'done' }, { state: 'running' }, { state: 'waiting' }] });
  assert.match(body, /^<b class="st-word">running<\/b> — step 2 of 3 · started \d/);
});

test('C8: NO capitals in the header — the job name is shown as written (the h2 uppercase rule is switched off there)', () => {
  assert.match(PAGE, /\.rp-header-title h2\{text-transform:none;/);
});

test('C8: an imported header wears the word of its shown green + the imported tag; with no green, only the tag', () => {
  const names = ['escapeXml', 'glyphClass', 'statusWordHtml', 'setRunHeader', 'importedHeader'];
  const els = {};
  const get = (id) => els[id] ?? (els[id] = fake());
  // eslint-disable-next-line no-new-func
  const imp = new Function('document', `${names.map(fnSrc).join('\n')}\nreturn importedHeader;`)({ getElementById: get });
  imp({ job: 'aurora', runStatus: { sign: '✓', word: 'passed' }, runReason: 'goal met' });
  assert.equal(els['active-wf-dot'].className, 'dot green');
  assert.match(els['active-wf-verdict'].innerHTML, /<b class="st-word">passed<\/b> — goal met · imported · view only$/);
  imp({ job: 'aurora', runStatus: null });
  assert.equal(els['active-wf-dot'].className, 'dot grey');
  assert.doesNotMatch(els['active-wf-verdict'].innerHTML, /st-word/);
  assert.match(els['active-wf-verdict'].innerHTML, /imported · view only$/);
});

test('C9: MAP has no legend line; each step card carries its own sign + the existing step-state word, bold', () => {
  assert.doesNotMatch(PAGE, /stepMapLegendHTML|map-legend/);
  const src = fnSrc('renderRun');
  assert.match(src, /class="step-state"[^]*?<span class="dot ' \+ badgeClass \+ '"><\/span><b class="st-word">' \+ escapeXml\(box\.state\)/);
});

import { createPanelServer } from '../src/panel/server.js';
import { exportFixtureBundle } from './bundle-fixture.js';

test('C7/C8: an imported job (list row and view) carries the sign + word of the green it shows, from the same table', async (t) => {
  const home = tmp();
  const userHome = tmp();
  const dir = join(userHome, 'fix.bareloop');
  exportFixtureBundle(dir);
  const { close, port, token } = await createPanelServer({ port: 0, env: {}, home, userHome });
  t.after(() => close());
  const call = (m, p, body) => fetch(`http://127.0.0.1:${port}${p}`, {
    method: m, headers: { 'content-type': 'application/json', 'x-bareloop-token': token }, body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());
  const imp = await call('POST', '/api/imports', { path: dir });
  const list = await call('GET', '/api/imports');
  assert.deepEqual(list.imports[0].runStatus, { key: 'passed', sign: '✓', word: 'passed' });
  assert.equal(list.imports[0].runReason, 'goal met');
  const view = await call('GET', `/api/imports/${imp.id}`);
  assert.equal(view.runStatus.word, 'passed');
});
