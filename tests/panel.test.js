// PANEL-BUILD.md P1 — the read-only panel HTTP server (`src/panel/server.js`).
// Every test drives a REAL listening socket (never a mocked http.Server) so
// the bind-address, method, and path-safety assertions are the real thing,
// not a stand-in for it. `home` is always an injected tmp dir (the SAME
// `runlistHome` test seam `tests/runlist.test.js`/`tests/cli.test.js` already
// use) — nothing here ever touches the real `~/.config/bareloop`.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, cpSync, utimesSync, readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPanelServer, panelMain, glyphForOutcome, checkTypeLabel, checkTypeTitle, RUNID_RE, formatTimestamp,
} from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';
import { jobSpecHash } from '../src/job.js';

/** @type {string[]} */
const tmpDirs = [];
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
/** @returns {string} */
function tmp() {
  const d = mkdtempSync(join(tmpdir(), 'panel-test-'));
  tmpDirs.push(d);
  return d;
}

function writeSpine(path, records) {
  writeFileSync(path, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
}

/** starts a server on an ephemeral free-ish port for this test, torn down after */
async function startServer(t, opts = {}) {
  // pick a high, unlikely-collision port per test rather than the real 4700
  // default — parallel test files must not fight over one port.
  const port = 20000 + Math.floor(Math.random() * 10000);
  const { server, close, port: boundPort } = await createPanelServer({ port, ...opts });
  t.after(() => close());
  return { server, port: boundPort, base: `http://127.0.0.1:${boundPort}` };
}

// ---------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------

test('glyphForOutcome: green/already-green/satisfied -> ✓, null -> ▶, anything else -> ✗', () => {
  assert.equal(glyphForOutcome('green'), '✓');
  assert.equal(glyphForOutcome('already-green'), '✓');
  assert.equal(glyphForOutcome('satisfied'), '✓');
  assert.equal(glyphForOutcome(null), '▶');
  assert.equal(glyphForOutcome('cap-halt'), '✗');
  assert.equal(glyphForOutcome('job-red'), '✗');
});

test('formatTimestamp: YYYY-MM-DD HH:MM (local, 24h, zero-padded) — the ONE timestamp-with-time format on the page', () => {
  const d = new Date(2026, 8, 9, 11, 49, 40); // 2026-09-09 11:49:40 local — Sep is month index 8
  assert.equal(formatTimestamp(d), '2026-09-09 11:49');
  const midnight = new Date(2026, 0, 5, 0, 5, 0); // zero-padding check on both hour and minute
  assert.equal(formatTimestamp(midnight), '2026-01-05 00:05');
  assert.equal(formatTimestamp('not a date'), 'an unknown time');
});

test('checkTypeLabel: green -> deterministic, soft-green -> rubric, else -> unknown', () => {
  assert.equal(checkTypeLabel('green'), 'deterministic');
  assert.equal(checkTypeLabel('soft-green'), 'rubric');
  assert.equal(checkTypeLabel(null), 'unknown');
  assert.equal(checkTypeLabel('hitl'), 'unknown');
});

test('checkTypeLabel/checkTypeTitle (item 3): three branches — real verdictType, absent+pre-cutoff, absent+post-cutoff', () => {
  // branch 1: verdictType present -> as today, no title regardless of date
  assert.equal(checkTypeLabel('green', '2026-01-01T00:00:00.000Z'), 'deterministic');
  assert.equal(checkTypeTitle('green', '2026-01-01T00:00:00.000Z'), null);
  assert.equal(checkTypeLabel('soft-green', '2026-09-01T00:00:00.000Z'), 'rubric');
  assert.equal(checkTypeTitle('soft-green', '2026-09-01T00:00:00.000Z'), null);

  // branch 2: verdictType absent, run predates 2026-08-18 (soft-green admitted,
  // commit 30df0f9) -> deterministic, with an explanatory title
  assert.equal(checkTypeLabel(null, '2026-08-17T23:59:59.000Z'), 'deterministic');
  assert.equal(
    checkTypeTitle(null, '2026-08-17T23:59:59.000Z'),
    'not recorded — deterministic was the only check type before 2026-08-18',
  );

  // branch 3: verdictType absent, run on/after the cutoff -> genuinely unknown, no title
  assert.equal(checkTypeLabel(null, '2026-08-18T00:00:00.000Z'), 'unknown');
  assert.equal(checkTypeTitle(null, '2026-08-18T00:00:00.000Z'), null);
  assert.equal(checkTypeLabel(null, '2026-09-24T00:00:00.000Z'), 'unknown');

  // an unparseable/missing date is never assumed old
  assert.equal(checkTypeLabel(null, undefined), 'unknown');
  assert.equal(checkTypeLabel(null, 'not a date'), 'unknown');
});

test('RUNID_RE: accepts alnum/./_/-/~ (the last for a backfill-disambiguated id like "run~2"), rejects a path segment carrying a slash or ..', () => {
  assert.ok(RUNID_RE.test('mu9x02aa'));
  assert.ok(RUNID_RE.test('u-r1.jsonl-ish_name'));
  assert.ok(RUNID_RE.test('run~2'), 'a backfill-disambiguated runid must be a legal runid');
  assert.ok(!RUNID_RE.test('../etc/passwd'));
  assert.ok(!RUNID_RE.test('a/b'));
  assert.ok(!RUNID_RE.test(''));
});

// ---------------------------------------------------------------------------
// F197: two spine files sharing a filename-derived runid ("run") get
// disambiguated runids (run, run~2) by backfillRuns — both must be reachable
// via /api/runs/:runid, never ambiguous.
// ---------------------------------------------------------------------------

test('backfillRuns + panel: two same-basename spines (both derive runid "run") are BOTH independently reachable via /api/runs/:runid', async (t) => {
  const home = tmp();
  const patients = tmp();
  mkdirSync(join(patients, 'proj-a'), { recursive: true });
  mkdirSync(join(patients, 'proj-b'), { recursive: true });
  writeSpine(join(patients, 'proj-a', 'run.jsonl'), [{ type: 'job-start', job: 'job-a', ts: '2026-09-24T00:00:00.000Z', seq: 1 }]);
  writeSpine(join(patients, 'proj-b', 'run.jsonl'), [{ type: 'job-start', job: 'job-b', ts: '2026-09-24T00:00:01.000Z', seq: 1 }]);

  const { backfillRuns } = await import('../src/runlist.js');
  const result = backfillRuns(patients, { home });
  assert.equal(result.added, 2);

  const { base } = await startServer(t, { home });
  const runsRes = await fetch(`${base}/api/runs`);
  const { runs } = await runsRes.json();
  assert.equal(runs.length, 2);
  const jobs = new Set();
  for (const r of runs) {
    const res = await fetch(`${base}/api/runs/${encodeURIComponent(r.runid)}`);
    assert.equal(res.status, 200, `expected runid ${r.runid} to be independently reachable`);
    const detail = await res.json();
    jobs.add(detail.job);
  }
  assert.deepEqual([...jobs].sort(), ['job-a', 'job-b'], 'both runs must resolve to their OWN distinct job, never colliding');
});

// ---------------------------------------------------------------------------
// bind address + port-taken
// ---------------------------------------------------------------------------

test('createPanelServer: binds 127.0.0.1 only, never 0.0.0.0', async (t) => {
  const { server } = await startServer(t);
  const addr = server.address();
  assert.equal(addr.address, '127.0.0.1');
});

test('createPanelServer: a taken port rejects loudly (EADDRINUSE), never silently picks another port', async (t) => {
  const home = tmp();
  const port = 20000 + Math.floor(Math.random() * 10000) + 1;
  const first = await createPanelServer({ port, home });
  t.after(() => first.close());
  await assert.rejects(createPanelServer({ port, home }), (e) => {
    assert.equal(/** @type {any} */ (e).code, 'EADDRINUSE');
    assert.equal(/** @type {any} */ (e).port, port);
    return true;
  });
});

test('panelMain: a taken port prints a LOUD error naming the port and returns non-zero, never falls back to another port', async (t) => {
  const home = tmp();
  const port = 20000 + Math.floor(Math.random() * 10000) + 2;
  const held = await createPanelServer({ port, home });
  t.after(() => held.close());
  const errLines = [];
  const rc = await panelMain(['--port', String(port)], { out: () => {}, err: (s) => errLines.push(s), runlistHome: home });
  assert.equal(rc, 1);
  assert.ok(errLines.some((l) => l.includes(String(port))), `expected the port number in the error, got: ${errLines.join(' | ')}`);
});

// ---------------------------------------------------------------------------
// method restriction — 405 for anything but GET/HEAD
// ---------------------------------------------------------------------------

test('non-GET/HEAD methods (POST/PUT/DELETE) -> 405 on every route, including the page and the API', async (t) => {
  const { base } = await startServer(t, { home: tmp() });
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    for (const path of ['/', '/api/runs', '/api/workflows']) {
      const res = await fetch(base + path, { method });
      assert.equal(res.status, 405, `${method} ${path} should be 405`);
    }
  }
});

test('GET / and HEAD / both return the page (200, text/html)', async (t) => {
  const { base } = await startServer(t, { home: tmp() });
  const getRes = await fetch(base + '/');
  assert.equal(getRes.status, 200);
  assert.match(getRes.headers.get('content-type') || '', /text\/html/);
  const body = await getRes.text();
  assert.ok(body.includes('bareloop'));
  const headRes = await fetch(base + '/', { method: 'HEAD' });
  assert.equal(headRes.status, 200);
});

// ---------------------------------------------------------------------------
// path safety — traversal, encoded slashes, absolute paths
// ---------------------------------------------------------------------------

test('path traversal on /api/runs/:runid -> 400 (bad runid), never reads outside the run list', async (t) => {
  const { base } = await startServer(t, { home: tmp() });
  const attempts = [
    '/api/runs/..%2f..%2fetc%2fpasswd',
    '/api/runs/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    '/api/runs/..%252f..%252fetc%252fpasswd',
  ];
  for (const path of attempts) {
    const res = await fetch(base + path);
    assert.ok([400, 404].includes(res.status), `${path} -> expected 400/404, got ${res.status}`);
  }
});

test('an absolute-path-shaped runid never resolves to a real filesystem read — 400 or 404, body never contains file contents', async (t) => {
  const { base } = await startServer(t, { home: tmp() });
  const res = await fetch(base + '/api/runs/%2Fetc%2Fpasswd');
  assert.ok([400, 404].includes(res.status));
  const text = await res.text();
  assert.ok(!text.includes('root:'), 'must never leak /etc/passwd contents');
});

test('unknown (well-formed but unlisted) runid -> 404', async (t) => {
  const { base } = await startServer(t, { home: tmp() });
  const res = await fetch(base + '/api/runs/does-not-exist-9999');
  assert.equal(res.status, 404);
});

test('a completely unknown route -> 404', async (t) => {
  const { base } = await startServer(t, { home: tmp() });
  const res = await fetch(base + '/api/nope');
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// `file missing` row
// ---------------------------------------------------------------------------

test('/api/runs: a row whose spine no longer exists on disk reports fileMissing:true, never crashes the listing', async (t) => {
  const home = tmp();
  appendRun({
    at: '2026-09-24T00:00:00.000Z', runid: 'gone1', job: 'gone-job', spine: join(tmp(), 'nope.jsonl'), patient: null, via: 'run-u',
  }, { home });
  const { base } = await startServer(t, { home });
  const res = await fetch(base + '/api/runs');
  assert.equal(res.status, 200);
  const { runs } = await res.json();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].fileMissing, true);
  assert.equal(runs[0].runid, 'gone1');
});

test('/api/runs/:runid on a fileMissing row: 200 with fileMissing:true, never a crash/500', async (t) => {
  const home = tmp();
  appendRun({
    at: '2026-09-24T00:00:00.000Z', runid: 'gone2', job: 'gone-job', spine: join(tmp(), 'nope2.jsonl'), patient: null, via: 'run-u',
  }, { home });
  const { base } = await startServer(t, { home });
  const res = await fetch(base + '/api/runs/gone2');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.fileMissing, true);
});

// ---------------------------------------------------------------------------
// DIED (hamr's ruling B, 2026-09-25): no job-end + spine mtime older than
// DIED_MTIME_MS reads as died (killed/crashed/machine slept) — a DISTINCT
// glyph [?] (never [✗], which stays reserved for a real close/arbiter "no").
// ---------------------------------------------------------------------------

const POC_DEAD = '/home/hamr/PycharmProjects/bareloop-patients/spines-poc-openai/poc-sjisejl8.jsonl';
const havePocDead = existsSync(POC_DEAD);

test(
  'a real dead spine (poc-sjisejl8: no job-end, died during scout, steps empty) reads as died — glyph [?], never [✗]; why names the real last record; spend is "at least $X", never unknown; map is one "died during planning" box',
  { skip: !havePocDead && 'no poc-sjisejl8 fixture on this machine' },
  async (t) => {
    const home = tmp();
    const dest = tmp();
    const destSpine = join(dest, 'poc-sjisejl8.jsonl');
    cpSync(POC_DEAD, destSpine);
    // force an OLD mtime regardless of when this test runs / the fixture was
    // last touched — the died rule is mtime-relative, not wall-clock-fixed.
    const old = new Date(Date.now() - 20 * 60 * 1000);
    utimesSync(destSpine, old, old);
    appendRun({
      at: '2026-09-09T09:48:59.000Z', runid: 'sjisejl8', job: 'bareguard-u-types-kimi-a-1', spine: destSpine, patient: null, via: 'backfill',
    }, { home });

    const { base } = await startServer(t, { home });

    const detailRes = await fetch(`${base}/api/runs/sjisejl8`);
    assert.equal(detailRes.status, 200);
    const detail = await detailRes.json();
    assert.equal(detail.died, true);
    assert.equal(detail.glyph, '?', 'died must use the distinct [?] glyph, never [✗]');
    assert.equal(detail.outcome, null, 'no job-end really was reached — outcome stays null, only died is new');
    assert.match(detail.stopReason, /^died — no ending was recorded \(killed, crashed, or the machine slept\)\. Last thing it did: /);
    assert.match(detail.stopReason, /a scout model call/, 'must name the REAL last record (a worker-round, phase:scout) never a guess');
    // F195: the died "why" line must use the ONE timestamp format this page
    // ever shows (YYYY-MM-DD HH:MM, local, 24h, zero-padded) — never a
    // locale-dependent toLocaleString() spelling like "9/9/2026, 11:49:40 AM"
    // (every other date on the page reads plain YYYY-MM-DD).
    assert.match(detail.stopReason, /at \d{4}-\d{2}-\d{2} \d{2}:\d{2}\.$/, `expected a YYYY-MM-DD HH:MM timestamp, got: ${detail.stopReason}`);
    assert.ok(!/[AP]M/.test(detail.stopReason), `must never carry a locale AM/PM spelling: ${detail.stopReason}`);
    assert.ok(detail.steps.length >= 1, 'steps empty (no step-start at all) must still produce one box, never an empty map');
    assert.equal(detail.steps[detail.steps.length - 1].state, 'died');
    assert.match(String(detail.steps[detail.steps.length - 1].id), /died during planning/i);
    // F196: the "died during planning" placeholder is a LABEL, never counted
    // as a real step — the panel must never read "steps: 0 of 1 done" for a
    // run that died before any step started.
    assert.equal(detail.steps[detail.steps.length - 1].synthetic, true, 'the placeholder box must be marked synthetic so the client excludes it from the step count');
    // spend: 2 real worker-round costUsd (0.008187 + 0.010002) — never "unknown"
    assert.ok(typeof detail.spendFloorUsd === 'number' && detail.spendFloorUsd > 0.018 && detail.spendFloorUsd < 0.019, `expected a real priced-rounds sum ~0.018189, got ${detail.spendFloorUsd}`);

    const runsRes = await fetch(`${base}/api/runs`);
    const { runs } = await runsRes.json();
    const row = runs.find((r) => r.runid === 'sjisejl8');
    assert.ok(row);
    assert.equal(row.glyph, '?');
    assert.equal(row.died, true);
    assert.ok(!/\bdied\b/.test(row.checkType) && !/\bdied\b/.test(row.spend) && !/\bdied\b/.test(row.wall), 'row meta must never carry the literal word "died" — the glyph alone carries it');
    assert.match(row.spend, /^at least \$/);

    const wfRes = await fetch(`${base}/api/workflows`);
    const { workflows } = await wfRes.json();
    const wf = workflows.find((w) => w.job === 'bareguard-u-types-kimi-a-1');
    assert.ok(wf);
    assert.equal(wf.lastGlyph, '?');
  },
);

test('a FRESH spine (no job-end, mtime just written) is still just "running" [▶] — never misread as died', async (t) => {
  const home = tmp();
  const dir = tmp();
  const spinePath = join(dir, 'u-freshnoend.jsonl');
  writeSpine(spinePath, [{
    type: 'job-start', job: 'still-going', ts: new Date().toISOString(), seq: 1, verdictType: 'green',
  }]);
  appendRun({
    at: new Date().toISOString(), runid: 'freshnoend', job: 'still-going', spine: spinePath, patient: null, via: 'run-u',
  }, { home });

  const { base } = await startServer(t, { home });
  const res = await fetch(`${base}/api/runs/freshnoend`);
  const detail = await res.json();
  assert.equal(detail.died, false);
  assert.equal(detail.glyph, '▶');
});

const POC_RED = '/home/hamr/PycharmProjects/bareloop-patients/spines-poc-openai/poc-p2ocuxj8.jsonl';
const havePocRed = existsSync(POC_RED);

test(
  'a real RED run (job-end present, outcome provider-red) is completely unaffected by the died rule — glyph stays [✗], stopReason unchanged, died:false',
  { skip: !havePocRed && 'no poc-p2ocuxj8 fixture on this machine' },
  async (t) => {
    const home = tmp();
    const dest = tmp();
    const destSpine = join(dest, 'poc-p2ocuxj8.jsonl');
    cpSync(POC_RED, destSpine);
    // old mtime too — proves the died rule never fires just because a
    // spine's own file is old; it fires ONLY on outcome === null.
    const old = new Date(Date.now() - 20 * 60 * 1000);
    utimesSync(destSpine, old, old);
    appendRun({
      at: '2026-09-09T07:57:36.000Z', runid: 'p2ocuxj8', job: 'red-job', spine: destSpine, patient: null, via: 'backfill',
    }, { home });

    const { base } = await startServer(t, { home });
    const res = await fetch(`${base}/api/runs/p2ocuxj8`);
    const detail = await res.json();
    assert.equal(detail.died, false);
    assert.equal(detail.glyph, '✗');
    assert.equal(detail.outcome, 'provider-red');
    assert.ok(detail.stopReason, 'a red run must keep its own written stopReason');
  },
);

// ---------------------------------------------------------------------------
// real archived data
// ---------------------------------------------------------------------------

const REAL_PATIENTS_DIR = '/home/hamr/PycharmProjects/bareloop-patients';
const haveRealPatients = existsSync(REAL_PATIENTS_DIR);

test(
  '/api/runs/:runid over a COPY of a real archived spine (+ its gate-audit sidecar, if present) returns real steps/cost, never fabricated',
  { skip: !haveRealPatients && 'no bareloop-patients dir on this machine' },
  async (t) => {
    const { readdirSync } = await import('node:fs');
    const entries = readdirSync(REAL_PATIENTS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory());
    let copied = null;
    const home = tmp();
    const dest = tmp();
    outer:
    for (const entry of entries.slice(0, 12)) {
      const dir = join(REAL_PATIENTS_DIR, entry.name);
      let files;
      try { files = readdirSync(dir); } catch { continue; }
      for (const f of files.filter((n) => n.endsWith('.jsonl') && !n.endsWith('-gate-audit.jsonl') && !n.endsWith('.lag.jsonl'))) {
        const src = join(dir, f);
        const destSpine = join(dest, f);
        cpSync(src, destSpine);
        const auditSrc = join(dir, f.replace(/\.jsonl$/, '-gate-audit.jsonl'));
        let destAudit = null;
        if (existsSync(auditSrc)) {
          destAudit = join(dest, f.replace(/\.jsonl$/, '-gate-audit.jsonl'));
          cpSync(auditSrc, destAudit);
        }
        copied = { spine: destSpine, audit: destAudit, name: f };
        break outer;
      }
    }
    if (!copied) { assert.ok(true, 'no real spine found to copy; nothing to test'); return; }

    const runid = copied.name.replace(/\.jsonl$/, '').replace(/^u-/, '');
    appendRun({
      at: '2026-09-24T00:00:00.000Z', runid, job: 'real-archived-job', spine: copied.spine, patient: null, via: 'backfill',
    }, { home });

    const { base } = await startServer(t, { home });
    const res = await fetch(`${base}/api/runs/${encodeURIComponent(runid)}`);
    assert.equal(res.status, 200);
    const detail = await res.json();
    assert.equal(detail.fileMissing, undefined);
    assert.ok(Array.isArray(detail.steps) || Array.isArray(detail.iterations) || detail.timelineKind, 'expected a real timeline');
    assert.ok(['✓', '✗', '▶'].includes(detail.glyph));
    assert.ok(detail.spine !== copied.spine); // response never echoes the real filesystem path back
    // never leaks the copy's own tmp path either
    assert.ok(JSON.stringify(detail).indexOf(dest) === -1, 'response body must never leak a filesystem path');

    const listRes = await fetch(`${base}/api/runs`);
    const { runs } = await listRes.json();
    const row = runs.find((r) => r.runid === runid);
    assert.ok(row, 'expected the real-data row in /api/runs');
    assert.ok(JSON.stringify(row).indexOf(dest) === -1);

    if (copied.audit) {
      const auditRes = await fetch(`${base}/api/runs/${encodeURIComponent(runid)}/audit`);
      assert.equal(auditRes.status, 200);
      const auditBody = await auditRes.json();
      assert.ok(Array.isArray(auditBody.rows));
    }
  },
);

// ---------------------------------------------------------------------------
// toolCalls: unknown (null), never 0, when no gate-audit sidecar exists
// ---------------------------------------------------------------------------

const POC_NO_AUDIT = '/home/hamr/PycharmProjects/bareloop-patients/spines-poc-openai/poc-pm48w5az.jsonl';
const havePocNoAudit = existsSync(POC_NO_AUDIT);

test(
  '/api/runs/:runid on a real spine with no gate-audit sidecar reports each step\'s toolCalls as null, never 0',
  { skip: !havePocNoAudit && 'no poc-pm48w5az fixture on this machine' },
  async (t) => {
    const home = tmp();
    const dest = tmp();
    const destSpine = join(dest, 'poc-pm48w5az.jsonl');
    cpSync(POC_NO_AUDIT, destSpine);
    // deliberately no sidecar copied alongside it
    appendRun({
      at: '2026-09-09T00:00:00.000Z', runid: 'pm48w5az', job: 'poc-no-audit', spine: destSpine, patient: null, via: 'backfill',
    }, { home });

    const { base } = await startServer(t, { home });
    const res = await fetch(`${base}/api/runs/pm48w5az`);
    assert.equal(res.status, 200);
    const detail = await res.json();
    assert.ok(detail.steps.length > 0, 'expected at least one step in this real spine');
    for (const s of detail.steps) {
      assert.equal(s.toolCalls, null, `step ${s.id} must report toolCalls:null (unknown), never 0`);
    }
  },
);

// ---------------------------------------------------------------------------
// /api/workflows grouping
// ---------------------------------------------------------------------------

test('/api/workflows groups the run list by job name, newest row per job wins as "last"', async (t) => {
  const home = tmp();
  const dir = tmp();
  writeSpine(join(dir, 'u-a1.jsonl'), [{
    type: 'job-start', job: 'alpha', ts: '2026-09-01T00:00:00.000Z', seq: 1, verdictType: 'green',
  }, { type: 'job-end', outcome: 'green', spentUsd: 0.5, spendComplete: true, ts: '2026-09-01T00:01:00.000Z', seq: 2 }]);
  writeSpine(join(dir, 'u-a2.jsonl'), [{
    type: 'job-start', job: 'alpha', ts: '2026-09-02T00:00:00.000Z', seq: 1, verdictType: 'green',
  }, { type: 'job-end', outcome: 'green', spentUsd: 0.6, spendComplete: true, ts: '2026-09-02T00:01:00.000Z', seq: 2 }]);
  appendRun({
    at: '2026-09-01T00:00:00.000Z', runid: 'a1', job: 'alpha', spine: join(dir, 'u-a1.jsonl'), patient: null, via: 'run-u',
  }, { home });
  appendRun({
    at: '2026-09-02T00:00:00.000Z', runid: 'a2', job: 'alpha', spine: join(dir, 'u-a2.jsonl'), patient: null, via: 'run-u',
  }, { home });

  const { base } = await startServer(t, { home });
  const res = await fetch(base + '/api/workflows');
  assert.equal(res.status, 200);
  const { workflows } = await res.json();
  assert.equal(workflows.length, 1);
  assert.equal(workflows[0].job, 'alpha');
  assert.equal(workflows[0].runCount, 2);
  assert.equal(workflows[0].lastRunid, 'a2'); // the run list is newest-first; a2 was appended after a1
});

test('/api/workflows and /api/runs sort by `at` (real time), never by file/append order — a backfill can append an OLDER row after a newer one', async (t) => {
  const home = tmp();
  const dir = tmp();
  writeSpine(join(dir, 'u-kimi-a-1.jsonl'), [{
    type: 'job-start', job: 'kimi-a', ts: '2026-09-09T09:48:00.000Z', seq: 1, verdictType: 'green',
  }, { type: 'job-end', outcome: 'green', spentUsd: 0.1, spendComplete: true, ts: '2026-09-09T09:49:00.000Z', seq: 2 }]);
  writeSpine(join(dir, 'u-429-live-1.jsonl'), [{
    type: 'job-start', job: '429-live', ts: '2026-09-09T07:56:00.000Z', seq: 1, verdictType: 'green',
  }, { type: 'job-end', outcome: 'green', spentUsd: 0.2, spendComplete: true, ts: '2026-09-09T07:57:00.000Z', seq: 2 }]);
  writeSpine(join(dir, 'u-deepseek-4-1.jsonl'), [{
    type: 'job-start', job: 'deepseek-4', ts: '2026-09-09T07:33:00.000Z', seq: 1, verdictType: 'green',
  }, { type: 'job-end', outcome: 'green', spentUsd: 0.3, spendComplete: true, ts: '2026-09-09T07:34:00.000Z', seq: 2 }]);
  // appended in exactly this order (a backfill scan's sorted-path order need
  // not match chronological `at` order): kimi-a (09:48) first, THEN two rows
  // that are chronologically EARLIER than it.
  appendRun({ at: '2026-09-09T09:48:00.000Z', runid: 'kimi-a-1', job: 'kimi-a', spine: join(dir, 'u-kimi-a-1.jsonl'), patient: null, via: 'backfill' }, { home });
  appendRun({ at: '2026-09-09T07:56:00.000Z', runid: '429-live-1', job: '429-live', spine: join(dir, 'u-429-live-1.jsonl'), patient: null, via: 'backfill' }, { home });
  appendRun({ at: '2026-09-09T07:33:00.000Z', runid: 'deepseek-4-1', job: 'deepseek-4', spine: join(dir, 'u-deepseek-4-1.jsonl'), patient: null, via: 'backfill' }, { home });

  const { base } = await startServer(t, { home });

  const runsRes = await fetch(base + '/api/runs');
  const { runs } = await runsRes.json();
  assert.deepEqual(runs.map((r) => r.runid), ['kimi-a-1', '429-live-1', 'deepseek-4-1'], '/api/runs must be newest-first by `at`');

  const wfRes = await fetch(base + '/api/workflows');
  const { workflows } = await wfRes.json();
  assert.deepEqual(workflows.map((w) => w.job), ['kimi-a', '429-live', 'deepseek-4'], '/api/workflows must be newest-first by lastAt');
});

// ---------------------------------------------------------------------------
// /api/runs/:runid/job — resolved (bundle layout) vs honest unknown
// ---------------------------------------------------------------------------

test('/api/runs/:runid/job: a run-u style spine (no bundle spec.json reachable) reports resolved:false and every spec field "unknown" — never fabricated', async (t) => {
  const home = tmp();
  const dir = tmp();
  writeSpine(join(dir, 'u-noSpec.jsonl'), [{
    type: 'job-start', job: 'no-spec-job', goal: 'do the thing', ts: '2026-09-05T00:00:00.000Z', seq: 1, verdictType: 'green',
  }]);
  appendRun({
    at: '2026-09-05T00:00:00.000Z', runid: 'noSpec', job: 'no-spec-job', spine: join(dir, 'u-noSpec.jsonl'), patient: null, via: 'run-u',
  }, { home });
  const { base } = await startServer(t, { home });
  const res = await fetch(base + '/api/runs/noSpec/job');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.resolved, false);
  assert.equal(body.source, 'not recorded');
  assert.equal(body.destination, 'not recorded');
  assert.equal(body.success, 'not recorded');
  assert.equal(body.guardrails, 'not recorded');
});

test('/api/runs/:runid/job: a bundle-layout run (spec.json beside runs/) resolves real spec fields', async (t) => {
  const home = tmp();
  const bundleDir = tmp();
  mkdirSync(join(bundleDir, 'runs', 'mubundleZZ'), { recursive: true });
  writeSpine(join(bundleDir, 'runs', 'mubundleZZ', 'spine.jsonl'), [{
    type: 'job-start', job: 'bundle-job', goal: 'ship it', ts: '2026-09-06T00:00:00.000Z', seq: 1, verdictType: 'soft-green',
  }]);
  writeFileSync(join(bundleDir, 'spec.json'), JSON.stringify({
    job: 'bundle-job', goal: 'ship it', verdictType: 'soft-green', model: 'deepseek-flash', budgetUsd: 1.5, maxWallMs: 600000,
  }));
  appendRun({
    at: '2026-09-06T00:00:00.000Z', runid: 'mubundleZZ', job: 'bundle-job', spine: join(bundleDir, 'runs', 'mubundleZZ', 'spine.jsonl'), patient: null, via: 'bundle',
  }, { home });
  const { base } = await startServer(t, { home });
  const res = await fetch(base + '/api/runs/mubundleZZ/job');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.resolved, true);
  assert.equal(body.checkType, 'rubric');
  assert.equal(body.model, 'deepseek-flash');
  assert.equal(body.budgetUsd, 1.5);
  assert.equal(body.source, 'not recorded'); // the real bundle-run spec schema carries no source field, and this row's own `patient` is null — honest, not fabricated
});

test('/api/runs: a pre-cutoff spine with no verdictType at all reports checkType "deterministic" with a title, end to end', async (t) => {
  const home = tmp();
  const dir = tmp();
  writeSpine(join(dir, 'u-old.jsonl'), [{
    type: 'job-start', job: 'old-job', ts: '2026-08-01T00:00:00.000Z', seq: 1,
  }, { type: 'job-end', outcome: 'green', spentUsd: 0.1, spendComplete: true, ts: '2026-08-01T00:01:00.000Z', seq: 2 }]);
  appendRun({
    at: '2026-08-01T00:00:00.000Z', runid: 'old1', job: 'old-job', spine: join(dir, 'u-old.jsonl'), patient: null, via: 'backfill',
  }, { home });
  const { base } = await startServer(t, { home });
  const res = await fetch(base + '/api/runs');
  const { runs } = await res.json();
  const row = runs.find((r) => r.runid === 'old1');
  assert.equal(row.checkType, 'deterministic');
  assert.equal(row.checkTypeTitle, 'not recorded — deterministic was the only check type before 2026-08-18');
});

// ---------------------------------------------------------------------------
// item 1 (2026-09-25): audit tab distinguishes "no sidecar ever written"
// from "sidecar exists but carries zero rows"
// ---------------------------------------------------------------------------

test('/api/runs/:runid/audit: no gate-audit sidecar on disk -> reason "no-sidecar"', async (t) => {
  const home = tmp();
  const dir = tmp();
  writeSpine(join(dir, 'u-noaudit.jsonl'), [{
    type: 'job-start', job: 'no-audit-job', ts: '2026-09-05T00:00:00.000Z', seq: 1, verdictType: 'green',
  }]);
  appendRun({
    at: '2026-09-05T00:00:00.000Z', runid: 'noaudit', job: 'no-audit-job', spine: join(dir, 'u-noaudit.jsonl'), patient: null, via: 'run-u',
  }, { home });
  const { base } = await startServer(t, { home });
  const res = await fetch(base + '/api/runs/noaudit/audit');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.empty, true);
  assert.equal(body.reason, 'no-sidecar');
});

test('/api/runs/:runid/audit: a sidecar exists but has zero rows -> reason "sidecar-empty"', async (t) => {
  const home = tmp();
  const dir = tmp();
  writeSpine(join(dir, 'u-emptyaudit.jsonl'), [{
    type: 'job-start', job: 'empty-audit-job', ts: '2026-09-05T00:00:00.000Z', seq: 1, verdictType: 'green',
  }]);
  writeSpine(join(dir, 'u-emptyaudit-gate-audit.jsonl'), []);
  appendRun({
    at: '2026-09-05T00:00:00.000Z', runid: 'emptyaudit', job: 'empty-audit-job', spine: join(dir, 'u-emptyaudit.jsonl'), patient: null, via: 'run-u',
  }, { home });
  const { base } = await startServer(t, { home });
  const res = await fetch(base + '/api/runs/emptyaudit/audit');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.empty, true);
  assert.equal(body.reason, 'sidecar-empty');
});

test('/api/runs/:runid/audit: a sidecar with real rows -> reason null, rows populated', async (t) => {
  const home = tmp();
  const dir = tmp();
  writeSpine(join(dir, 'u-hasaudit.jsonl'), [{
    type: 'job-start', job: 'has-audit-job', ts: '2026-09-05T00:00:00.000Z', seq: 1, verdictType: 'green',
  }]);
  writeSpine(join(dir, 'u-hasaudit-gate-audit.jsonl'), [{
    ts: '2026-09-05T00:00:01.000Z', action: { type: 'write', path: 'foo.js' }, decision: 'allow',
  }]);
  appendRun({
    at: '2026-09-05T00:00:00.000Z', runid: 'hasaudit', job: 'has-audit-job', spine: join(dir, 'u-hasaudit.jsonl'), patient: null, via: 'run-u',
  }, { home });
  const { base } = await startServer(t, { home });
  const res = await fetch(base + '/api/runs/hasaudit/audit');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.empty, false);
  assert.equal(body.reason, null);
  assert.equal(body.rows.length, 1);
});

// ---------------------------------------------------------------------------
// item 2 (2026-09-25): Audit tab — model-call rows + round column, and the
// sidecar-scoping fix (a shared gate-audit file can carry other runs' rows).
// ---------------------------------------------------------------------------

test('/api/runs/:runid/audit: a phase:record/type:llm row renders as kind "model-call" with its own cost/tokens/duration, decision stays null', async (t) => {
  const home = tmp();
  const dir = tmp();
  writeSpine(join(dir, 'u-llm.jsonl'), [
    { type: 'job-start', job: 'llm-job', ts: '2026-09-05T00:00:00.000Z', seq: 1, verdictType: 'green' },
    { type: 'worker-round', phase: 'step:x', iteration: 1, costUsd: 0.01, tokens: 500, seq: 2, ts: '2026-09-05T00:00:01.000Z' },
    { type: 'job-end', outcome: 'green', spentUsd: 0.01, spendComplete: true, seq: 3, ts: '2026-09-05T00:00:05.000Z' },
  ]);
  writeSpine(join(dir, 'u-llm-gate-audit.jsonl'), [
    {
      ts: '2026-09-05T00:00:01.005Z', phase: 'record', action: { type: 'llm', args: { model: 'x' } }, decision: null, result: { costUsd: 0.01, pricing: 'priced', tokens: 500, durationMs: 1200 },
    },
    { ts: '2026-09-05T00:00:01.100Z', action: { type: 'read', path: 'a.js' }, decision: 'allow' },
  ]);
  appendRun({
    at: '2026-09-05T00:00:00.000Z', runid: 'llmrun', job: 'llm-job', spine: join(dir, 'u-llm.jsonl'), patient: null, via: 'run-u',
  }, { home });
  const { base } = await startServer(t, { home });
  const res = await fetch(base + '/api/runs/llmrun/audit');
  const body = await res.json();
  assert.equal(body.rows.length, 2);
  const [llmRow, toolRow] = body.rows;
  assert.equal(llmRow.kind, 'model-call');
  assert.equal(llmRow.decision, null);
  assert.equal(llmRow.costUsd, 0.01);
  assert.equal(llmRow.tokens, 500);
  assert.equal(llmRow.durationMs, 1200);
  assert.equal(llmRow.round, 1);
  assert.equal(toolRow.kind, 'tool-call');
  assert.equal(toolRow.round, 1); // falls inside round 1's open window (no round 2 yet)
});

test('/api/runs/:runid/audit: round column — a tool call BEFORE the first worker-round gets round null ("—" on the client)', async (t) => {
  const home = tmp();
  const dir = tmp();
  writeSpine(join(dir, 'u-pre.jsonl'), [
    { type: 'job-start', job: 'pre-job', ts: '2026-09-05T00:00:00.000Z', seq: 1, verdictType: 'green' },
    { type: 'worker-round', phase: 'plan', costUsd: 0.01, tokens: 100, seq: 3, ts: '2026-09-05T00:00:02.000Z' },
    { type: 'job-end', outcome: 'green', spentUsd: 0.01, spendComplete: true, seq: 4, ts: '2026-09-05T00:00:05.000Z' },
  ]);
  writeSpine(join(dir, 'u-pre-gate-audit.jsonl'), [
    { ts: '2026-09-05T00:00:00.500Z', action: { type: 'read', path: 'scout.js' }, decision: 'allow' }, // scout activity, before round 1
    {
      ts: '2026-09-05T00:00:02.001Z', phase: 'record', action: { type: 'llm' }, decision: null, result: { costUsd: 0.01, tokens: 100, durationMs: 500 },
    },
  ]);
  appendRun({
    at: '2026-09-05T00:00:00.000Z', runid: 'prerun', job: 'pre-job', spine: join(dir, 'u-pre.jsonl'), patient: null, via: 'run-u',
  }, { home });
  const { base } = await startServer(t, { home });
  const res = await fetch(base + '/api/runs/prerun/audit');
  const body = await res.json();
  assert.equal(body.rows[0].round, null);
  assert.equal(body.rows[1].round, 1);
});

test('/api/runs/:runid/audit: a shared sidecar carrying an EARLIER unrelated run\'s rows (before this run\'s own job-start) excludes them — item 2 contamination fix', async (t) => {
  const home = tmp();
  const dir = tmp();
  writeSpine(join(dir, 'u-later.jsonl'), [
    { type: 'job-start', job: 'later-job', ts: '2026-09-05T12:00:00.000Z', seq: 1, verdictType: 'green' },
    { type: 'worker-round', phase: 'plan', costUsd: 0.01, tokens: 100, seq: 2, ts: '2026-09-05T12:00:01.000Z' },
    { type: 'job-end', outcome: 'green', spentUsd: 0.01, spendComplete: true, seq: 3, ts: '2026-09-05T12:00:05.000Z' },
  ]);
  writeSpine(join(dir, 'u-later-gate-audit.jsonl'), [
    // an EARLIER run's rows, sharing this sidecar filename by coincidence —
    // hours before "later-job" even started
    { ts: '2026-09-05T06:00:00.000Z', action: { type: 'read', path: 'other-run-file.js' }, decision: 'allow' },
    { ts: '2026-09-05T06:00:01.000Z', action: { type: 'edit', path: 'other-run-file.js' }, decision: 'allow' },
    // this run's own row
    { ts: '2026-09-05T12:00:01.500Z', action: { type: 'read', path: 'real-file.js' }, decision: 'allow' },
  ]);
  appendRun({
    at: '2026-09-05T12:00:00.000Z', runid: 'laterrun', job: 'later-job', spine: join(dir, 'u-later.jsonl'), patient: null, via: 'run-u',
  }, { home });
  const { base } = await startServer(t, { home });
  const auditRes = await fetch(base + '/api/runs/laterrun/audit');
  const auditBody = await auditRes.json();
  assert.equal(auditBody.rows.length, 1, 'the two earlier-run rows must be excluded');
  assert.equal(auditBody.rows[0].path, 'real-file.js');

  // the Run tab's tools summary must agree with the Audit tab — same scoping
  const detailRes = await fetch(base + '/api/runs/laterrun');
  const detail = await detailRes.json();
  assert.equal(detail.behaviour.totalCalls, 1);
});

// ---------------------------------------------------------------------------
// item 7 (2026-09-25): /api/runs/:runid carries replay's own already-computed
// behaviour/memoryCache fields verbatim — never recomputed a second way.
// ---------------------------------------------------------------------------

test('/api/runs/:runid: no gate-audit sidecar -> behaviour is null (never a fake zero-calls object)', async (t) => {
  const home = tmp();
  const dir = tmp();
  writeSpine(join(dir, 'u-nobehaviour.jsonl'), [{
    type: 'job-start', job: 'no-behaviour-job', ts: '2026-09-05T00:00:00.000Z', seq: 1, verdictType: 'green',
  }, { type: 'job-end', outcome: 'green', spentUsd: 0.1, spendComplete: true, ts: '2026-09-05T00:01:00.000Z', seq: 2 }]);
  appendRun({
    at: '2026-09-05T00:00:00.000Z', runid: 'nobehaviour', job: 'no-behaviour-job', spine: join(dir, 'u-nobehaviour.jsonl'), patient: null, via: 'run-u',
  }, { home });
  const { base } = await startServer(t, { home });
  const res = await fetch(base + '/api/runs/nobehaviour');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.behaviour, null);
  assert.equal(body.memoryCache, null);
});

test('/api/runs/:runid: a real archived run (u-mu2p83go, pulselog-person-live-2) reports memoryCache matching `bareloop replay` exactly, and behaviour scoped to this run\'s own ts window (item 2 fix — NOT the CLI\'s unscoped figure, see below)', async (t) => {
  const spine = '/home/hamr/PycharmProjects/bareloop-patients/pulselog-person-live-2/out/source-mu2bglzc/pulselog-person-live-2-bareloop/u-mu2p83go.jsonl';
  if (!existsSync(spine)) { assert.ok(true, 'real fixture not present on this machine'); return; }
  const home = tmp();
  appendRun({
    at: '2026-09-15T00:00:00.000Z', runid: 'mu2p83go-item7', job: 'pulselog-strict-checks', spine, patient: null, via: 'backfill',
  }, { home });
  const { base } = await startServer(t, { home });
  const res = await fetch(base + '/api/runs/mu2p83go-item7');
  assert.equal(res.status, 200);
  const body = await res.json();
  // ITEM 2 FINDING (2026-09-25): this run's gate-audit sidecar is SHARED —
  // it carries rows from 7 distinct run_ids spanning 06:56Z..13:25Z on one
  // day, but this run's own job-start..job-end window is only
  // 13:19:40Z..13:25:48Z. `node bin/bareloop.mjs replay <spine>` (src/
  // replay.js, unscoped, untouched by this fix) prints the CONTAMINATED
  // figure: "142 tool calls · 75 read, 44 grep, 21 edit, 2 recent" — that
  // includes rows from earlier, unrelated runs that happened to reuse this
  // sidecar filename. Scoped to this run's own ts window (verified directly
  // against the raw JSONL, both files, outside this test), the REAL figure
  // for THIS run alone is 82 calls: 37 read, 23 grep, 21 edit, 1 recent. The
  // panel's Run-tab `behaviour` (and the Audit tab's row count) now report
  // this honest, scoped figure — deliberately DIFFERENT from the CLI's own
  // still-unscoped BEHAVIOUR line, which is flagged as a separate, un-fixed
  // finding (out of this panel-only change's scope; src/replay.js is core
  // and used well beyond the panel).
  assert.equal(body.behaviour.totalCalls, 82);
  assert.deepEqual(body.behaviour.byTool, {
    shell_read: 37, shell_grep: 23, ctx_recent: 1, edit: 21,
  });
  assert.equal(body.behaviour.denied, 0);
  // memoryCache is a single spine record (never audit-sidecar-sourced), so
  // it carries no contamination risk and still matches the CLI exactly.
  assert.equal(body.memoryCache.pointered, 7);
  assert.equal(body.memoryCache.capped, 0);
  assert.equal(body.memoryCache.bytesWithheld, 4865);
});

// ---------------------------------------------------------------------------
// item 3 (2026-09-25): Run summary "tools" line — EVERY tool used (no top-5
// truncation), litectx tools already folded into behaviour.byTool (confirmed
// on litectx-u-bareloop's real run mtotxw1z — no contamination there, its
// whole gate-audit window sits inside job-start..job-end), plus a raw
// `toolsList` field on the Job response feeding the "offered, never used"
// line.
// ---------------------------------------------------------------------------

test('/api/runs/:runid: a real archived run (u-mtotxw1z, litectx-u-bareloop) reports behaviour matching `bareloop replay` exactly — litectx tools (recall/get/impact) already folded in, no double-count', async (t) => {
  const spine = '/home/hamr/PycharmProjects/bareloop-patients/litectx-u-bareloop/u-mtotxw1z.jsonl';
  if (!existsSync(spine)) { assert.ok(true, 'real fixture not present on this machine'); return; }
  const home = tmp();
  appendRun({
    at: '2026-09-05T00:00:00.000Z', runid: 'mtotxw1z-item3', job: 'litectx-u-types', spine, patient: null, via: 'backfill',
  }, { home });
  const { base } = await startServer(t, { home });
  const res = await fetch(base + '/api/runs/mtotxw1z-item3');
  assert.equal(res.status, 200);
  const body = await res.json();
  // verified against `node bin/bareloop.mjs replay <spine>`: "127 tool calls
  // · 47 read, 40 edit, 34 grep, 4 recall, 1 get, 1 impact" — this run's own
  // gate-audit window sits entirely inside job-start..job-end (no
  // contamination, unlike mu2p83go above), so the scoped and unscoped
  // figures agree here.
  assert.equal(body.behaviour.totalCalls, 127);
  assert.deepEqual(body.behaviour.byTool, {
    shell_read: 47, shell_grep: 34, edit: 40, ctx_recall: 4, ctx_get: 1, ctx_impact: 1,
  });
});

test('toolsListFromSpec / getRunJob: toolsList carries the spec\'s raw granted-tool array, matching real spec.json shapes (bare names: read/grep/edit/recall/…)', async (t) => {
  const home = tmp();
  const dir = tmp();
  mkdirSync(join(dir, 'runs', 'r1'), { recursive: true });
  writeSpine(join(dir, 'runs', 'r1', 'spine.jsonl'), [
    { type: 'job-start', job: 'bundlejob', ts: '2026-09-05T00:00:00.000Z', seq: 1, verdictType: 'green' },
  ]);
  writeFileSync(join(dir, 'spec.json'), JSON.stringify({
    job: 'bundlejob', tools: ['read', 'grep', 'edit', 'recall', 'get', 'impact'],
  }));
  appendRun({
    at: '2026-09-05T00:00:00.000Z', runid: 'bundlerun', job: 'bundlejob', spine: join(dir, 'runs', 'r1', 'spine.jsonl'), patient: null, via: 'bundle',
  }, { home });
  const { base } = await startServer(t, { home });
  const res = await fetch(base + '/api/runs/bundlerun/job');
  const body = await res.json();
  assert.deepEqual(body.toolsList, ['read', 'grep', 'edit', 'recall', 'get', 'impact']);
  assert.equal(body.tools, 'read · grep · edit · recall · get · impact');
});

test('toolsListFromSpec: no spec resolvable -> toolsList null (never fabricated)', async (t) => {
  const home = tmp();
  const dir = tmp();
  writeSpine(join(dir, 'u-nospec.jsonl'), [
    { type: 'job-start', job: 'nospec-job', ts: '2026-09-05T00:00:00.000Z', seq: 1, verdictType: 'green' },
  ]);
  appendRun({
    at: '2026-09-05T00:00:00.000Z', runid: 'nospecrun', job: 'nospec-job', spine: join(dir, 'u-nospec.jsonl'), patient: null, via: 'run-u',
  }, { home });
  const { base } = await startServer(t, { home });
  const res = await fetch(base + '/api/runs/nospecrun/job');
  const body = await res.json();
  assert.equal(body.toolsList, null);
});

// ---------------------------------------------------------------------------
// item 2 (2026-09-25): Job tab source order — (a) bundle spec.json [existing,
// re-verified above], (b) jobs/<job>.json with a specHash compare, (c) the
// run's own resolved-spec.json found beside the spine, (d) the run's own
// job-start record, else 'not recorded' everywhere.
// ---------------------------------------------------------------------------

const REAL_JOBS_DIR = join(process.cwd(), 'jobs');
const REAL_JOB_NAME = 'aurora-testgen-cold';
const REAL_JOB_SPEC_PATH = join(REAL_JOBS_DIR, `${REAL_JOB_NAME}.json`);
const haveRealJobSpec = existsSync(REAL_JOB_SPEC_PATH);

test(
  '/api/runs/:runid/job: (b) jobs/<job>.json — matching specHash resolves the real jobs/ spec, no mismatch note',
  { skip: !haveRealJobSpec && `${REAL_JOB_SPEC_PATH} not present on this machine` },
  async (t) => {
    const home = tmp();
    const dir = tmp();
    const realSpec = JSON.parse(readFileSync(REAL_JOB_SPEC_PATH, 'utf8'));
    const hash = jobSpecHash(realSpec);
    writeSpine(join(dir, `u-jobsdirmatch.jsonl`), [{
      type: 'job-start', job: REAL_JOB_NAME, ts: '2026-09-10T00:00:00.000Z', seq: 1, specHash: hash, verdictType: realSpec.verdictType,
    }]);
    appendRun({
      at: '2026-09-10T00:00:00.000Z', runid: 'jobsdirmatch', job: REAL_JOB_NAME, spine: join(dir, 'u-jobsdirmatch.jsonl'), patient: null, via: 'run-u',
    }, { home });
    const { base } = await startServer(t, { home });
    const res = await fetch(base + '/api/runs/jobsdirmatch/job');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.resolved, true);
    assert.equal(body.resolvedFrom, `jobs/${REAL_JOB_NAME}.json`);
    assert.equal(body.note, null);
    assert.equal(body.goal, realSpec.goal);
    assert.equal(body.source, 'not recorded'); // job-v1 spec schema carries no source field, and this row's own `patient` is null
  },
);

test(
  '/api/runs/:runid/job: (b) jobs/<job>.json — a specHash MISMATCH still shows the spec fields, with a visible edited-since-run note',
  { skip: !haveRealJobSpec && `${REAL_JOB_SPEC_PATH} not present on this machine` },
  async (t) => {
    const home = tmp();
    const dir = tmp();
    writeSpine(join(dir, `u-jobsdirmismatch.jsonl`), [{
      type: 'job-start', job: REAL_JOB_NAME, ts: '2026-09-10T00:00:00.000Z', seq: 1, specHash: 'not-the-real-hash-deadbeef', verdictType: 'green',
    }]);
    appendRun({
      at: '2026-09-10T00:00:00.000Z', runid: 'jobsdirmismatch', job: REAL_JOB_NAME, spine: join(dir, 'u-jobsdirmismatch.jsonl'), patient: null, via: 'run-u',
    }, { home });
    const { base } = await startServer(t, { home });
    const res = await fetch(base + '/api/runs/jobsdirmismatch/job');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.resolved, true);
    assert.equal(body.resolvedFrom, `jobs/${REAL_JOB_NAME}.json`);
    assert.equal(body.note, 'this job was edited after this run (spec hash differs)');
  },
);

test('/api/runs/:runid/job: (d) no bundle, no matching jobs/<job>.json, no resolved-spec.json near the spine -> falls back to the run\'s own job-start record fields', async (t) => {
  const home = tmp();
  const dir = tmp();
  writeSpine(join(dir, 'u-startonly.jsonl'), [{
    type: 'job-start', job: 'not-a-real-jobs-dir-entry-xyz', goal: 'do the real thing', model: 'claude-sonnet-5', budgetUsd: 3, ts: '2026-09-10T00:00:00.000Z', seq: 1, verdictType: 'green',
  }]);
  appendRun({
    at: '2026-09-10T00:00:00.000Z', runid: 'startonly', job: 'not-a-real-jobs-dir-entry-xyz', spine: join(dir, 'u-startonly.jsonl'), patient: null, via: 'run-u',
  }, { home });
  const { base } = await startServer(t, { home });
  const res = await fetch(base + '/api/runs/startonly/job');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.resolved, false);
  assert.equal(body.resolvedFrom, "the run's own start record");
  assert.equal(body.goal, 'do the real thing');
  assert.equal(body.model, 'claude-sonnet-5');
  assert.equal(body.budgetUsd, 3);
  assert.equal(body.note, "from the run's own start record");
  assert.equal(body.source, 'not recorded');
});

test('/api/runs/:runid/job: (d) nothing resolvable at all -> every field "not recorded", never fabricated', async (t) => {
  const home = tmp();
  const dir = tmp();
  writeSpine(join(dir, 'u-nothingatall.jsonl'), [{
    type: 'job-start', job: 'nothing-at-all-job-xyz', ts: '2026-09-10T00:00:00.000Z', seq: 1, verdictType: 'green',
  }, { type: 'job-end', outcome: 'green', spentUsd: 0.1, spendComplete: true, ts: '2026-09-10T00:01:00.000Z', seq: 2 }]);
  appendRun({
    at: '2026-09-10T00:00:00.000Z', runid: 'nothingatall', job: 'nothing-at-all-job-xyz', spine: join(dir, 'u-nothingatall.jsonl'), patient: null, via: 'run-u',
  }, { home });
  const { base } = await startServer(t, { home });
  const res = await fetch(base + '/api/runs/nothingatall/job');
  assert.equal(res.status, 200);
  const body = await res.json();
  // this spine DOES carry a job-start with goal absent -> falls to (d), goal
  // reads "not recorded" (never fabricated), resolved false.
  assert.equal(body.resolved, false);
  assert.equal(body.goal, 'not recorded');
  assert.equal(body.model, 'not recorded');
});

// ---------------------------------------------------------------------------
// item 2 (2026-09-25), continued: the new-shape resolution step — a run's own
// resolved-spec.json + source.json, found BESIDE the spine at the source
// front door's own layout (never the bundle layout, never guessed) — and the
// real-fields-only rule for Success/Guardrails/Source/Destination/Tools.
// ---------------------------------------------------------------------------

const REAL_PERSON_OUT = '/home/hamr/PycharmProjects/bareloop-patients/pulselog-person-live-2/out';
const REAL_RESOLVED_SPEC = join(REAL_PERSON_OUT, 'resolved-spec.json');
const REAL_SOURCE_SEED_DIR = join(REAL_PERSON_OUT, 'source-mu2bglzc');
const REAL_SOURCE_JSON = join(REAL_SOURCE_SEED_DIR, 'source.json');
const REAL_PERSON_SPINE = join(REAL_SOURCE_SEED_DIR, 'pulselog-person-live-2-bareloop', 'u-mu2p83go.jsonl');
const havePersonFixture = existsSync(REAL_RESOLVED_SPEC) && existsSync(REAL_SOURCE_JSON) && existsSync(REAL_PERSON_SPINE);

test(
  '/api/runs/:runid/job: (c) NEW — resolved-spec.json + source.json found beside the spine resolve Success/Guardrails/Source/Destination for a real closeDecl spec',
  { skip: !havePersonFixture && `${REAL_PERSON_OUT} not present on this machine` },
  async (t) => {
    const home = tmp();
    // copy the real fixture into a FRESH tmp layout at runtime — never read
    // in place — so this test proves the shape-derivation, not a hardcoded
    // path on hamr's own machine.
    const out = tmp();
    cpSync(REAL_RESOLVED_SPEC, join(out, 'resolved-spec.json'));
    mkdirSync(join(out, 'source-mu2bglzc'), { recursive: true });
    cpSync(REAL_SOURCE_JSON, join(out, 'source-mu2bglzc', 'source.json'));
    mkdirSync(join(out, 'source-mu2bglzc', 'pulselog-person-live-2-bareloop'), { recursive: true });
    const spineCopy = join(out, 'source-mu2bglzc', 'pulselog-person-live-2-bareloop', 'u-mu2p83go.jsonl');
    cpSync(REAL_PERSON_SPINE, spineCopy);

    const realSpec = JSON.parse(readFileSync(REAL_RESOLVED_SPEC, 'utf8'));
    const realManifest = JSON.parse(readFileSync(REAL_SOURCE_JSON, 'utf8'));
    const expectedSuccess = realSpec.closeDecl.stages.map((s) => s.name).join(' · ');

    appendRun({
      at: '2026-09-15T00:00:00.000Z', runid: 'mu2p83go-jobtab', job: realSpec.job, spine: spineCopy, patient: null, via: 'backfill',
    }, { home });
    const { base } = await startServer(t, { home });
    const res = await fetch(base + '/api/runs/mu2p83go-jobtab/job');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.resolved, true);
    assert.equal(body.resolvedFrom, "the run's own resolved-spec.json");
    assert.equal(body.job, realSpec.job);
    assert.equal(body.goal, realSpec.goal);
    assert.equal(body.description, realSpec.description);
    assert.equal(body.success, expectedSuccess);
    assert.ok(body.success.includes('typecheck-checks-strict'), 'Success must list the real closeDecl stage names');
    assert.ok(body.success.includes('no-suppressions'), 'Success must list the real closeDecl stage names');
    assert.ok(body.guardrails.includes('changed-from-seed'), 'Guardrails must include the real guard names (from confirmProtections)');
    assert.ok(body.guardrails.includes('no-suppressions'), 'Guardrails must include the real guard names (from confirmProtections)');
    assert.ok(body.guardrails.includes('write fence'), 'Guardrails must include the write fence line');
    assert.ok(body.guardrails.includes(realSpec.writeScope[0]), 'Guardrails must name the real writeScope glob');
    assert.equal(body.source, realManifest.source);
    assert.equal(body.destination, realManifest.destination);
    // the spec itself carries no `model` field (resolved at run time) — the
    // job-start record's own resolved model is the honest fallback.
    assert.equal(body.model, 'deepseek-flash');
    assert.equal(body.budgetUsd, realSpec.budgetUsd);
    assert.equal(body.maxWallMs, realSpec.maxWallMs);
  },
);

test(
  '/api/runs/:runid/job: old-shape close[] spec (jobs/litectx-u-types.json) — Success lists close[].name, model/goal/writeScope real',
  { skip: !existsSync(join(process.cwd(), 'jobs', 'litectx-u-types.json')) && 'jobs/litectx-u-types.json not present' },
  async (t) => {
    const home = tmp();
    const dir = tmp();
    const oldSpecPath = join(process.cwd(), 'jobs', 'litectx-u-types.json');
    const oldSpec = JSON.parse(readFileSync(oldSpecPath, 'utf8'));
    // a spine shaped like the REAL litectx-u-bareloop archive: no source-*/
    // sibling at all, so the new (c) step must find nothing and fall through
    // to (b) jobs/<job>.json — exactly mtotxw1z's real on-disk shape.
    writeSpine(join(dir, 'u-oldshape.jsonl'), [{
      type: 'job-start', job: 'litectx-u-types', ts: '2026-09-01T00:00:00.000Z', seq: 1, verdictType: 'green', model: 'claude-sonnet-5',
    }]);
    appendRun({
      at: '2026-09-01T00:00:00.000Z', runid: 'oldshape-jobtab', job: 'litectx-u-types', spine: join(dir, 'u-oldshape.jsonl'), patient: null, via: 'backfill',
    }, { home });
    const { base } = await startServer(t, { home });
    const res = await fetch(base + '/api/runs/oldshape-jobtab/job');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.resolved, true);
    assert.equal(body.resolvedFrom, 'jobs/litectx-u-types.json');
    const expectedSuccess = oldSpec.close.map((s) => s.name).join(' · ');
    assert.equal(body.success, expectedSuccess);
    assert.ok(body.success.includes('typecheck'));
    assert.ok(body.success.includes('suite-green'));
    // old-shape has no closeDecl.lang -> guardNames/confirmProtections can't
    // resolve guard names generically; Guardrails falls back to the write
    // fence line alone (real field, never fabricated guard prose).
    assert.equal(body.guardrails, `write fence — the run may only change files matching: ${oldSpec.writeScope.join(', ')}`);
    assert.equal(body.tools, oldSpec.tools.join(' · '));
    assert.equal(body.source, 'not recorded'); // no source.json anywhere near this spine, and this row's patient is null
    assert.equal(body.destination, 'not recorded');
  },
);

test('/api/runs/:runid/job: RED PROOF — with sourceNearSpine/successFromSpec/guardrailsFromSpec reverted, the new-shape fixture reads "not recorded" (mechanically proves these fields are not fabricated)', { skip: !havePersonFixture && `${REAL_PERSON_OUT} not present on this machine` }, async (t) => {
  const serverPath = fileURLToPath(new URL('../src/panel/server.js', import.meta.url));
  const backup = `${serverPath}.redproof-bak`;
  cpSync(serverPath, backup);
  try {
    const src = readFileSync(serverPath, 'utf8');
    // neuter sourceNearSpine so it always reports "nothing near the spine" —
    // the same shape as a run whose resolved-spec.json genuinely doesn't
    // exist. A real bug here (e.g. success/guardrails silently fabricated
    // from somewhere else) would make this row STILL show real values; the
    // red proof is that it does not.
    const patched = src.replace(
      'function sourceNearSpine(spinePath) {',
      'function sourceNearSpine(spinePath) { return { specPath: null, sourceJsonPath: null };',
    );
    assert.notEqual(patched, src, 'the patch must actually match sourceNearSpine\'s real source — otherwise this proves nothing');
    writeFileSync(serverPath, patched);

    // fresh import with a cache-busting query so node re-reads the patched file
    const { createPanelServer: patchedCreate } = await import(`../src/panel/server.js?redproof=${Date.now()}`);

    const home = tmp();
    const out = tmp();
    cpSync(REAL_RESOLVED_SPEC, join(out, 'resolved-spec.json'));
    mkdirSync(join(out, 'source-mu2bglzc'), { recursive: true });
    cpSync(REAL_SOURCE_JSON, join(out, 'source-mu2bglzc', 'source.json'));
    mkdirSync(join(out, 'source-mu2bglzc', 'pulselog-person-live-2-bareloop'), { recursive: true });
    const spineCopy = join(out, 'source-mu2bglzc', 'pulselog-person-live-2-bareloop', 'u-mu2p83go.jsonl');
    cpSync(REAL_PERSON_SPINE, spineCopy);
    const realSpec = JSON.parse(readFileSync(REAL_RESOLVED_SPEC, 'utf8'));

    appendRun({
      at: '2026-09-15T00:00:00.000Z', runid: 'mu2p83go-redproof', job: realSpec.job, spine: spineCopy, patient: null, via: 'backfill',
    }, { home });
    const port = 20000 + Math.floor(Math.random() * 10000);
    const { server, close } = await patchedCreate({ port, home });
    t.after(() => close());
    const res = await fetch(`http://127.0.0.1:${port}/api/runs/mu2p83go-redproof/job`);
    const body = await res.json();
    assert.equal(body.resolvedFrom, "the run's own start record", 'with sourceNearSpine neutered, resolution must fall all the way through to the job-start record');
    assert.equal(body.success, 'not recorded');
    assert.equal(body.guardrails, 'not recorded');
    void server;
  } finally {
    cpSync(backup, serverPath);
    rmSync(backup);
  }
});

// ---------------------------------------------------------------------------
// never reads process.env for a secret (code-inspected, asserted here too)
// ---------------------------------------------------------------------------

test('server module source never references process.env (no secret ever read on the panel path)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/panel/server.js', import.meta.url), 'utf8');
  const codeOnly = src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  assert.ok(!codeOnly.includes('process.env'), 'src/panel/server.js must never read process.env directly (outside comments)');
});
