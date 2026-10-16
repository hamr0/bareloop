// hamr's click-through 2026-10-04, items C6-C9: ONE code-owned sign -> word table (src/panel/status.js), read by every
// surface. Server side against real readers + a scratch home; page side against the page's own functions.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statusFor, partStatusFor, STATUS } from '../src/panel/status.js';
import { glyphForOutcome, listRuns, getRunDetail } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';
import { jobSpecHash } from '../src/job.js';

/** @type {string[]} */ const tmps = [];
after(() => { for (const d of tmps) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'panel-status-')); tmps.push(d); return d; };

test('C6: the table is exactly the seven signs/words hamr ruled', () => {
  assert.deepEqual(Object.entries(STATUS).map(([k, v]) => `${k}:${v.sign}:${v.word}`), [
    'running:▶:running', 'waiting:·:waiting', 'passed:✓:passed', 'failed:✗:failed', 'capped:✗:capped', 'stopped:■:stopped', 'died:?:died',
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

function listHarness() {
  const names = ['escapeXml', 'runLabel', 'glyphClass', 'dotPulses', 'dotClass', 'panelMoney', 'panelMoneyWithDraft', 'liveSpendText', 'liveWallPhrase', 'duration', 'rowIsLive', 'rowWallText', 'rowSpendText', 'rlShortDate', 'runAtText', 'rlRunParts', 'rlRunCardHtml', 'rlJobCardHtml'];
  // eslint-disable-next-line no-new-func
  return new Function(`${names.map(fnSrc).join('\n')}\nreturn { rlRunCardHtml, rlJobCardHtml };`)();
}
const RUN = {
  runid: 'demod3', job: 'demo-plain-green', runNo: 3, at: '2026-10-04T10:00:00.000Z', model: 'deepseek-flash', glyph: '✗', status: { sign: '✗', word: 'failed' }, endedLine: 'checks said no', checkType: 'deterministic',
  spentUsd: 3.5, spendComplete: true, wall: '10m00s', date: '2026-10-04', died: false,
};

test('P9 v2 C7: a run card is line 1 `[sign] run-N  date · model`, line 2 `**word** — reason · $ · wall`', () => {
  const html = listHarness().rlRunCardHtml({ ...RUN, draftSpentUsd: 0.08, draftSpendComplete: true }, false, false);
  assert.match(html, /class="dot red"[^]*class="rl-rn">run-3<\/span> <span class="rl-rest">&middot; \d\d\/\d\d \d\d:\d\d · deepseek-flash<\/span>/);  // P9 v2 O item 6: same-size .rl-rest after a middot
  assert.match(html, /<b class="st-word">failed<\/b> — checks said no &middot; \$3\.50 \(drafting \$0\.08\) · 10m00s<\/span>/);
  assert.doesNotMatch(html, /\$0\.08 drafting|resumed/);
  assert.equal((html.match(/rl-l1|rl-l2/g) || []).length, 2, 'exactly 2 lines');
});

test('P9 v2 C7: a job card is `[sign] job · k runs · check type` / `**word** · why` of its head run, and is a box, not a button', () => {
  const h = listHarness();
  const c = { job: 'job1', head: { ...RUN, glyph: '✓', status: { sign: '✓', word: 'passed' }, endedLine: 'goal met' }, empty: false, count: 2, sel: { runid: 'x' }, selected: false, hits: [], older: { open: false, shown: [], hidden: 0, total: 0 } };
  const html = h.rlJobCardHtml(c);
  assert.match(html, /^<div class="rl-card" id="rl-job-job1"/);
  assert.match(html, /class="dot green"[^]*<span class="rl-nm"[^>]*>job1<\/span> <span class="rl-cnt">&middot; 2 runs &middot; deterministic<\/span>/);
  assert.match(html, /<span class="rl-l2"><b class="st-word">passed<\/b> &middot; goal met<\/span>/);
  assert.doesNotMatch(h.rlJobCardHtml({ ...c, head: { ...c.head, checkType: 'unknown' } }), /unknown/, 'an unknown check type draws nothing');
});

test('P9 v2 C7: a live run card reads **running**, never a stale ended line', () => {
  const html = listHarness().rlRunCardHtml({ ...RUN, glyph: '▶', status: { sign: '▶', word: 'running' }, endedLine: null, starting: true }, false, false);
  assert.match(html, /<b class="st-word">running<\/b> — starting…/);
});

function headerHarness() {
  const els = {};
  const get = (id) => els[id] ?? (els[id] = fake());
  // eslint-disable-next-line no-new-func
  const api = new Function('document', `${['escapeXml', 'runLabel', 'runName', 'glyphClass', 'dotPulses', 'dotClass', 'statusWordHtml', 'fmtLocalDateTime', 'setRunHeader', 'liveStepText', 'runHeaderBody', 'realSteps'].map(fnSrc).join('\n')}\nreturn {setRunHeader, runHeaderBody};`)({ getElementById: get });
  return { els, ...api };
}

test('C8: the right-side header reads `[sign] job (run-N) │ **word** — reason · ended <local date, time>`', () => {
  const h = headerHarness();
  const detail = { status: { sign: '✗', word: 'failed' }, ended: { line: 'checks said no' }, endedAt: '2026-10-04T16:01:00.000Z', startedAt: '2026-10-04T15:00:00.000Z', steps: [] };
  h.setRunHeader('✗', 'demo-plain-green (demod3)', h.runHeaderBody(detail));
  assert.equal(h.els['active-wf-name'].textContent, 'demo-plain-green (demod3)');
  assert.equal(h.els['active-wf-dot'].className, 'dot red');
  const html = h.els['active-wf-verdict'].innerHTML;
  assert.match(html, /^<span class="rp-sep">│<\/span><b class="st-word">failed<\/b> — checks said no · ended \d{1,2}\/\d{1,2}\/2026, \d{1,2}:\d{2} (AM|PM)$/);
});

test('2026-10-07: a STOPPED run wears [■] on the table, the run card, the header, the summary box, the map and the step card — failed/capped keep [✗], died keeps [?]', () => {
  assert.equal(statusFor({ outcome: 'stopped' }).sign, '■');
  assert.equal(glyphForOutcome('stopped'), '■');
  assert.equal(partStatusFor({ kind: 'step', outcome: null, stopReason: 'you stopped it' }).sign, '■');
  assert.equal(statusFor({ outcome: 'plan-red' }).sign, '✗');
  assert.equal(statusFor({ outcome: 'cap-halt' }).sign, '✗');
  assert.equal(statusFor({ outcome: null, died: true }).sign, '?');
  const S = { ...RUN, glyph: '■', status: { ...STATUS.stopped } };
  assert.match(listHarness().rlRunCardHtml(S, false, false), /class="dot stopped"/); // run card
  const h = headerHarness();
  h.setRunHeader('■', 'j (run-1)', '');
  assert.equal(h.els['active-wf-dot'].className, 'dot stopped'); // header
  // RULED 2026-10-15 (supersedes 2026-10-08 red): stopped [■] is GREY, the same grey as [·]: you stopped it, it did not fail
  assert.match(PAGE, /\.dot\.stopped::before\{content:"\[■\]";color:var\(--grey-dot\);\}/);
  assert.match(PAGE, /\.dot::before\{content:"\[·\]";color:var\(--grey-dot\);\}/, 'the [·] grey it matches');
  assert.doesNotMatch(PAGE, /\.dot\.stopped[^{]*\{[^}]*var\(--red\)/);
  assert.match(PAGE, /\.map-chip\.s-stopsign \.chip-sign\{color:var\(--grey-dot\);\}/, 'the step-map chip of a stopped step');
  assert.match(fnSrc('buildStepMapHTML'), /s-stopsign/);
  assert.match(PAGE, /\.summary-box\.grey\{border-color:var\(--grey-dot\);\}/);
  assert.match(fnSrc('renderRun'), /detail\.glyph === "■" \? "grey"/); // the summary box frame is grey, not red
  // step card + Audit row
  // eslint-disable-next-line no-new-func
  const f = new Function(`${['escapeXml', 'boxStatusWord', 'boxStatusText', 'glyphClass', 'dotPulses', 'dotClass', 'stepStateHTML'].map(fnSrc).join('\n')}\nreturn stepStateHTML;`)();
  assert.match(f({ state: 'stopped', status: { ...STATUS.stopped } }, 't'), /dot stopped"><\/span><b class="st-word">stopped</);
  // map box text
  const start = PAGE.indexOf('function escapeXml');
  const body = PAGE.slice(start, PAGE.indexOf('function renderStepMap('));
  // eslint-disable-next-line no-new-func
  const g = new Function(`${body}\nreturn { buildOrderedBoxes, buildStepMapHTML };`)();
  const parts = [{ kind: 'step', label: 'a', occurrence: 1, outcome: null, stopReason: 'you stopped it', attempts: [], status: partStatusFor({ stopReason: 'you stopped it' }) }];
  assert.match(g.buildStepMapHTML(g.buildOrderedBoxes(parts, false)), /title="\[■\] stopped"/);
});

test('2026-10-07: the ✗ result chip still finds a stopped [■] run (it was a [✗] before the sign ruling)', () => {
  // eslint-disable-next-line no-new-func
  const filterRuns = new Function(`${['rlRunParts', 'runLabel', 'runAtText', 'rlShortDate', 'rowIsLive', 'rowWallText', 'rowSpendText', 'liveSpendText', 'liveWallPhrase', 'duration', 'panelMoney', 'panelMoneyWithDraft', 'escapeXml', 'runMatchesSearch', 'filterRuns'].map(fnSrc).join('\n')}\nreturn filterRuns;`)();
  const runs = [{ runid: 'a', glyph: '■', checkType: 'deterministic' }, { runid: 'b', glyph: '✓', checkType: 'deterministic' }];
  assert.deepEqual(filterRuns(runs, { checkTypes: [], results: ['✗'], time: 'all', search: '' }).map((r) => r.runid), ['a']);
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
  const names = ['escapeXml', 'runLabel', 'runName', 'glyphClass', 'dotPulses', 'dotClass', 'statusWordHtml', 'setRunHeader', 'importedHeader'];
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

test('C9: MAP has no sign legend; each step card carries its own sign + the existing step-state word, bold', () => {
  assert.doesNotMatch(PAGE, /stepMapLegendHTML|map-legend/); // the line-style key is covered in panel-page.test.js
  assert.match(fnSrc('renderRun'), /stepStateHTML\(box, 'part-state-' \+ idx\)/);
  assert.match(fnSrc('stepStateHTML'), /class="step-state"[^]*?<span class="dot ' \+ cls \+ \(cls === "amber" \? " pulse" : ""\) \+ '"><\/span><b class="st-word">' \+ escapeXml\(boxStatusWord\(box\)\)/);
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

test('C8: the header name carries no ┤ ├ frame (it would read "┤ name ├ │ word" beside the │ separator)', () => {
  assert.doesNotMatch(PAGE, /\.rp-header h2::/);
});

test('item 3: the Audit tab\'s grouped rows wear the SAME sign + bold word as the Run tab step cards (one stepStateHTML), no bracket badge', () => {
  // eslint-disable-next-line no-new-func
  const f = new Function(`${['escapeXml', 'runLabel', 'runName', 'boxStatusWord', 'boxStatusText', 'stepStateHTML'].map(fnSrc).join('\n')}\nreturn stepStateHTML;`)();
  const P = (k) => ({ ...STATUS[k] });
  assert.equal(f({ state: 'done', status: P('passed') }, 't'), '<span class="step-state" data-testid="t"><span class="dot green"></span><b class="st-word">passed</b></span>');
  assert.match(f({ state: 'stopped', status: P('capped') }, 't'), /dot red"><\/span><b class="st-word">capped</);
  assert.match(f({ state: 'stopped', status: P('died') }, 't'), /dot red"><\/span><b class="st-word">died</);
  assert.match(f({ state: 'died', status: P('died') }, 't'), /dot magenta/);
  assert.match(fnSrc('renderAuditGroups'), /stepStateHTML\(box, 'audit-part-state-' \+ idx\)/);
  // the Audit header's whole state spelling is that one call: no sign of its own beside the attempt glyph
  assert.doesNotMatch(fnSrc('renderAuditGroups'), /boxStatusText|boxStatusWord|box\.status\.sign/);
  assert.doesNotMatch(fnSrc('renderAuditGroups'), /class="badge ' \+ badgeClass/);
  assert.match(fnSrc('renderRun'), /stepStateHTML\(box, 'part-state-' \+ idx\)/);
});

test('item 4: step cards and Audit group headers render step names as written — no uppercase styling or JS on them; frame titles keep theirs', () => {
  assert.match(PAGE, /\.step-card h4\{[^}]*text-transform:none;/);
  assert.doesNotMatch(PAGE, /toUpperCase/);
  assert.doesNotMatch(PAGE, /\.audit-part[^{]*\{[^}]*text-transform:uppercase/);
  assert.doesNotMatch(PAGE, /\.part-card[^{]*\{[^}]*text-transform:uppercase/);
  assert.match(PAGE, /\.map-box::before\{content:"┤ MAP ├"/);
});

test('2026-10-07: a part wears `[sign] word` from the ONE table — never the raw "done"; map box text, step card and Audit row all read it', () => {
  const P = (k) => `[${STATUS[k].sign}] ${STATUS[k].word}`;
  const table = [
    [{ kind: 'drafting' }, 'passed'],
    [{ kind: 'scout', outcome: null }, 'passed'],
    [{ kind: 'step', outcome: 'green' }, 'passed'],
    [{ kind: 'step', outcome: 'step-red' }, 'failed'],
    [{ kind: 'step', outcome: null, stopReason: 'money cap' }, 'capped'],
    [{ kind: 'step', outcome: null, stopReason: 'time cap' }, 'capped'],
    [{ kind: 'step', outcome: null, stopReason: 'you stopped it' }, 'stopped'],
    [{ kind: 'step', outcome: null, stopReason: 'died' }, 'died'],
    [{ kind: 'step', outcome: null, stopReason: 'provider failed' }, 'failed'],
    [{ kind: 'step', outcome: null, stopReason: 'step stalled' }, 'failed'],
  ];
  for (const [part, key] of table) assert.equal(partStatusFor(part).key, key, JSON.stringify(part));
  // page: the map box's state line and the card word
  const src = ['escapeXml', 'boxStatusWord', 'boxStatusText'].map(fnSrc).join('\n');
  // eslint-disable-next-line no-new-func
  const txt = new Function(`${src}\nreturn boxStatusText;`)();
  assert.equal(txt({ state: 'done', status: STATUS.passed }), P('passed'));
  assert.equal(txt({ state: 'running', status: STATUS.running }), P('running'));
  assert.doesNotMatch(PAGE, /escapeXml\(s\.state\)/);
  assert.doesNotMatch(fnSrc('stepStateHTML'), /boxStatusText|\[/); // the card/Audit state is the word only; the sign is the map's
  // end to end through the page's own buildOrderedBoxes + SVG: no bare "done" text
  const start = PAGE.indexOf('function escapeXml');
  const body = PAGE.slice(start, PAGE.indexOf('function renderStepMap('));
  // eslint-disable-next-line no-new-func
  const g = new Function(`${body}\nreturn { buildOrderedBoxes, buildStepMapHTML };`)();
  const parts = [
    { kind: 'scout', label: 'scout', outcome: null, attempts: [], status: partStatusFor({ kind: 'scout' }) },
    { kind: 'step', label: 'a', occurrence: 1, outcome: 'green', attempts: [{ n: 1, outcome: 'green' }], status: partStatusFor({ kind: 'step', outcome: 'green' }) },
    { kind: 'step', label: 'b', occurrence: 1, outcome: null, stopReason: 'money cap', attempts: [], status: partStatusFor({ stopReason: 'money cap' }) },
  ];
  const svg = g.buildStepMapHTML(g.buildOrderedBoxes(parts, false));
  assert.match(svg, /title="\[✓\] passed"/);
  assert.match(svg, /title="\[✗\] capped"/);
  assert.doesNotMatch(svg, /title="done"|>done</);
});

test('RULED 2026-10-15 (matches fwdloop glyphPulses): a sign blinks when the run is running or waits for your Accept, steady otherwise; ONE rule function, reduced motion drops the animation', () => {
  const rule = new Function(`${fnSrc('dotPulses')}\nreturn dotPulses;`)();
  assert.equal(rule('▶', null), true, 'running');
  assert.equal(rule('✓', 'Accept'), true, 'waiting for your Accept');
  assert.equal(rule('·', 'Accept'), true);
  for (const g of ['✓', '✗', '■', '·', '?']) assert.equal(rule(g, null), false, `${g} rests`);
  assert.equal(rule('■', 'Resume'), false, 'a Resume tag is not waiting for Accept');
  const dotClass = new Function(`${fnSrc('glyphClass')}\n${fnSrc('dotPulses')}\n${fnSrc('dotClass')}\nreturn dotClass;`)();
  assert.equal(dotClass('▶', null), 'dot amber pulse');
  assert.equal(dotClass('✓', 'Accept'), 'dot green pulse');
  assert.equal(dotClass('·', null), 'dot grey', 'a schedule that is on and waiting stays steady');
  // the animation hangs on `.pulse` alone, and reduced motion keeps the sign
  assert.doesNotMatch(PAGE, /\.dot\.amber::before\{[^}]*animation/);
  assert.match(PAGE, /\.dot\.pulse::before\{animation:pulse-glyph 1\.2s ease-in-out infinite;\}/);
  assert.match(PAGE, /@media \(prefers-reduced-motion: reduce\)\{\s*\.dot\.pulse::before\{animation:none;\}/);
});
