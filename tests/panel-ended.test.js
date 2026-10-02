// PANEL-BUILD.md P5 items 1 + 2 — the Ended block and Resume.
//
// Every server test drives the REAL panel server on an ephemeral port with an injected
// scratch `home` (never the real ~/.config/bareloop). The spawn seam (`spawnFn`) is the
// ONE stub: it replaces the child process only, so the route's own gate, spec-writing,
// hashing and argv assembly are the code under test. The Ended sentences come from the
// real `endedFor` / `getRunDetail` over real spine files.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { endedFor, getRunDetail, listRuns } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';
import { jobSpecHash } from '../src/job.js';

/** @type {string[]} */
const tmpDirs = [];
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
function tmp() {
  const d = mkdtempSync(join(tmpdir(), 'panel-ended-'));
  tmpDirs.push(d);
  return d;
}

const SPEC = { job: 'fix-types', description: 'p5 fixture', budgetUsd: 8, maxWallMs: 3_600_000, goal: 'make types clean' };

/**
 * One run on disk, laid out the way a panel-authored run is: the spine under
 * `<out>/source-x/<job>-bareloop/`, the signed spec at `<out>/resolved-spec.json`.
 * The spine is aged past the died window, so "still running" is never the reading.
 */
function makeRun(home, {
  runid = 'run1', outcome = 'cap-halt', spec = SPEC, jobEnd = true, spent = 8, hashOverride = null, extra = [], draft = null,
} = {}) {
  const out = tmp();
  const into = join(out, 'source-x');
  const dir = join(into, `${spec.job}-bareloop`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(into, 'source.json'), JSON.stringify({ source: '/x', destination: '/y' }));
  writeFileSync(join(out, 'resolved-spec.json'), JSON.stringify(spec));
  const specHash = hashOverride ?? jobSpecHash(spec);
  const t = (n) => `2026-10-01T10:0${n}:00.000Z`;
  const records = [
    {
      type: 'job-start', job: spec.job, specHash, budgetUsd: spec.budgetUsd, shape: 'plan', goal: spec.goal, ts: t(0), seq: 1, ...(draft ? { draftSpentUsd: draft, draftSpendComplete: true } : {}),
    },
    { type: 'plan-accepted', plan: { schema: 'plan-v1', steps: [{ id: 'fix-types' }] }, ts: t(1), seq: 2 },
    { type: 'worker-round', kind: 'turn', costUsd: spent, ts: t(2), seq: 3 },
    ...extra,
    ...(jobEnd ? [{ type: 'job-end', outcome, spentUsd: spent, spendComplete: true, ts: t(5), seq: 99 }] : []),
  ];
  const spine = join(dir, `u-${runid}.jsonl`);
  writeFileSync(spine, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  utimesSync(spine, old, old);
  appendRun({
    at: '2026-10-01T10:00:00.000Z', runid, job: spec.job, spine, patient: null, via: 'run-u',
  }, { home });
  return { out, spine, specHash };
}

// ---------------------------------------------------------------------------
// item 1 — the Ended block (code-owned sentences, one owner for card + detail)
// ---------------------------------------------------------------------------

test('endedFor: the table — every outcome maps to its fixed reason, next line and buttons', () => {
  const ok = { ok: true };
  const no = { ok: false, why: 'it is still running' };
  const live = (outcome, extra = {}) => endedFor({ outcome, stopReason: null, spentUsd: 8, budgetUsd: 8, ...extra }, { died: false, lastThing: null }, extra.o ?? {});
  assert.equal(live(null), null, 'no Ended block while a run is live');
  assert.deepEqual(live('green'), { reason: 'Goal met.', next: 'Nothing to do.', line: 'goal met', actions: [] });
  assert.equal(live('already-green').reason, 'Goal met.');
  assert.match(live('green', { o: { destinationRefused: 'folder is read only' } }).reason, /^Goal met, but the output could not be delivered \(folder is read only\)\.$/);

  const cap = live('cap-halt', { o: { resume: ok } });
  assert.equal(cap.reason, 'Money cap reached ($8.00 of $8.00).');
  assert.equal(cap.next, 'Raise the cap, then Resume.');
  assert.deepEqual(cap.actions, [{ id: 'resume', label: 'Resume' }]);
  assert.equal(cap.line, 'money cap — resume');

  const wall = live('wall-halt', { o: { resume: ok } });
  assert.equal(wall.reason, 'Time cap reached.');
  assert.equal(wall.next, 'Raise the time, then Resume.');

  const prov = live('provider-red', { stopReason: 'HTTP 503', o: { resume: ok } });
  assert.equal(prov.reason, 'The model provider failed (HTTP 503).');
  assert.equal(prov.next, 'Resume.');

  assert.equal(live('step-stalled', { o: { resume: ok } }).reason, 'A step stopped making progress.');

  for (const o of ['plan-red', 'check-red', 'step-red', 'escalated']) {
    const r = live(o, { stopReason: 'tests failing' });
    assert.match(r.reason, /^Goal not met — the checks said no \(tests failing\)\.$/, o);
    assert.deepEqual(r.actions, [], `${o} offers no Resume`);
  }
  assert.match(live('close-red').reason, /^The check itself broke \(instrument fault\), not your goal\.$/);
  for (const o of ['pricing-red', 'unapproved-spec', 'job-red', 'branch-red', 'interpreter-red', 'recipe-stale', 'close-unsupported', 'smoke-red', 'runner-drained']) {
    assert.match(live(o).reason, new RegExp(`^Stopped before or outside the work \\(${o}`), o);
  }
  // a bare `escalated` is re-read through its recorded category
  assert.equal(live('escalated', { lastEscalation: { category: 'cap-halt' }, o: { resume: ok } }).reason, 'Money cap reached ($8.00 of $8.00).');

  const died = endedFor({ outcome: null, stopReason: null, spentUsd: null, budgetUsd: 8 }, { died: true, lastThing: 'a scout model call at 2026-10-01 10:02' }, { resume: ok });
  assert.match(died.reason, /^Stopped with no ending recorded \(last thing it did: a scout model call at 2026-10-01 10:02\)\.$/);
  assert.deepEqual(died.actions, [{ id: 'resume', label: 'Resume' }]);

  // never a button the engine would refuse
  const refused = live('cap-halt', { o: { resume: no } });
  assert.deepEqual(refused.actions, []);
  assert.match(refused.next, /^Resume is not available for this run \(it is still running\)\.$/);
});

test('getRunDetail + listRuns: a cap-halt run carries the Ended block, the Resume action and the card line', () => {
  const home = tmp();
  makeRun(home, { runid: 'cap1' });
  const d = getRunDetail('cap1', { home });
  assert.equal(d.ended.reason, 'Money cap reached ($8.00 of $8.00).');
  assert.deepEqual(d.ended.actions, [{ id: 'resume', label: 'Resume' }]);
  assert.equal(d.resume.budgetUsd, 8);
  assert.equal(d.resume.maxWallMin, 60);
  assert.equal(d.resume.spentUsd, 8);
  const row = listRuns({ home }).find((r) => r.runid === 'cap1');
  assert.equal(row.endedLine, 'money cap — resume');
  assert.equal(row.glyph, '✗', 'result glyphs unchanged');
});

test('getRunDetail: a green run reads "Goal met." with no Resume; a died run reads Stopped with no ending and glyph ?', () => {
  const home = tmp();
  makeRun(home, { runid: 'grn1', outcome: 'green' });
  const g = getRunDetail('grn1', { home });
  assert.equal(g.ended.reason, 'Goal met.');
  assert.equal(g.ended.next, 'Nothing to do.');
  assert.deepEqual(g.ended.actions, []);
  assert.equal(g.resume, null);

  makeRun(home, { runid: 'died1', jobEnd: false });
  const d = getRunDetail('died1', { home });
  assert.equal(d.glyph, '?', 'died is never [✗]');
  assert.match(d.ended.reason, /^Stopped with no ending recorded \(last thing it did: .+\)\.$/);
  assert.deepEqual(d.ended.actions, [{ id: 'resume', label: 'Resume' }]);
});

test('getRunDetail: a destination-refused record on a green names the delivery failure', () => {
  const home = tmp();
  makeRun(home, { runid: 'dst1', outcome: 'green', extra: [{ type: 'destination-refused', code: 'D1', detail: 'folder is read only', ts: '2026-10-01T10:04:00.000Z', seq: 50 }] });
  assert.equal(getRunDetail('dst1', { home }).ended.reason, 'Goal met, but the output could not be delivered (folder is read only).');
});

test('getRunDetail: a run with a job-end the engine would refuse to resume (plan-red) shows no Resume, and a missing signed spec hides it', () => {
  const home = tmp();
  makeRun(home, { runid: 'red1', outcome: 'plan-red' });
  assert.deepEqual(getRunDetail('red1', { home }).ended.actions, []);
  // cap-halt but the spec beside it is not the one the run was signed under
  makeRun(home, { runid: 'stale1', hashOverride: 'not-the-hash' });
  const s = getRunDetail('stale1', { home });
  assert.deepEqual(s.ended.actions, []);
  assert.match(s.ended.next, /no signed job file beside this run matches the hash/);
});

// ---------------------------------------------------------------------------
// the PAGE: the Ended block and the Resume confirm, extracted verbatim from
// src/panel/index.html and driven against a tiny hand-rolled fake DOM (no jsdom).
// ---------------------------------------------------------------------------

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

function makePage() {
  const els = {};
  const mk = (id) => {
    const subs = {};
    const el = {
      id, hidden: false, className: '', innerHTML: '', textContent: '', value: '', disabled: false, handlers: {},
      addEventListener(ev, fn) { el.handlers[ev] = fn; },
      querySelector(sel) { if (!subs[sel]) subs[sel] = mk(`${id}>${sel}`); return subs[sel]; },
    };
    return el;
  };
  const document = { getElementById(id) { if (!els[id]) els[id] = mk(id); return els[id]; } };
  // eslint-disable-next-line no-new-func
  const factory = new Function('document', `
    ${fnSrc('escapeXml')}
    ${fnSrc('panelMoney')}
    var lastEndedSig = null;
    ${fnSrc('renderEnded')}
    return { renderEnded: renderEnded };
  `);
  const page = factory(document);
  return { ...page, document, els };
}

const DETAIL = {
  runid: 'run1',
  glyph: '✗',
  died: false,
  ended: {
    reason: 'Money cap reached ($8.00 of $8.00).', next: 'Raise the cap, then Resume.', line: 'money cap — resume', actions: [{ id: 'resume', label: 'Resume' }],
  },
  resume: {
    budgetUsd: 8, maxWallMin: 60, spentUsd: 8, spendComplete: true,
  },
};

test('page: renderEnded paints ENDED and NEXT from the server\'s fixed sentences, and hides the block while the run is live', () => {
  const pg = makePage();
  pg.renderEnded(DETAIL);
  const box = pg.document.getElementById('ended-block');
  assert.equal(box.hidden, false);
  assert.match(box.innerHTML, /ENDED/);
  assert.match(box.innerHTML, /Money cap reached \(\$8\.00 of \$8\.00\)\./);
  assert.match(box.innerHTML, /NEXT/);
  assert.match(box.innerHTML, /Raise the cap, then Resume\./);
  pg.renderEnded({ ...DETAIL, ended: null });
  assert.equal(pg.document.getElementById('ended-block').hidden, true, 'no Ended block while a run is live');
});

test('page: renderRun calls renderEnded (an engine with a caller), and the run card carries the endedLine under the job name', () => {
  assert.match(fnSrc('renderRun'), /renderEnded\(detail\);/);
  assert.match(PAGE, /r\.endedLine \? '<span class="wf-ended"/);
  assert.match(PAGE, /g\.lastEndedLine \? '<span class="wf-ended"/);
});
