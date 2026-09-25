// PANEL-BUILD.md P1 — the read-only panel HTTP server (`src/panel/server.js`).
// Every test drives a REAL listening socket (never a mocked http.Server) so
// the bind-address, method, and path-safety assertions are the real thing,
// not a stand-in for it. `home` is always an injected tmp dir (the SAME
// `runlistHome` test seam `tests/runlist.test.js`/`tests/cli.test.js` already
// use) — nothing here ever touches the real `~/.config/bareloop`.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, cpSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPanelServer, panelMain, glyphForOutcome, checkTypeLabel, RUNID_RE,
} from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';

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

test('checkTypeLabel: green -> deterministic, soft-green -> rubric, else -> unknown', () => {
  assert.equal(checkTypeLabel('green'), 'deterministic');
  assert.equal(checkTypeLabel('soft-green'), 'rubric');
  assert.equal(checkTypeLabel(null), 'unknown');
  assert.equal(checkTypeLabel('hitl'), 'unknown');
});

test('RUNID_RE: accepts alnum/./_/-, rejects a path segment carrying a slash or ..', () => {
  assert.ok(RUNID_RE.test('mu9x02aa'));
  assert.ok(RUNID_RE.test('u-r1.jsonl-ish_name'));
  assert.ok(!RUNID_RE.test('../etc/passwd'));
  assert.ok(!RUNID_RE.test('a/b'));
  assert.ok(!RUNID_RE.test(''));
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
  assert.equal(body.source, 'unknown');
  assert.equal(body.destination, 'unknown');
  assert.equal(body.success, 'unknown');
  assert.equal(body.guardrails, 'unknown');
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
  assert.equal(body.source, 'unknown'); // the real bundle-run spec schema carries no source field — honest, not fabricated
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
