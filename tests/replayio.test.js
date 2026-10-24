// src/replayio.js exit criteria (PANEL-BUILD.md P0, last task): the IO layer
// over replay.js — spine/sidecar resolution, tolerant JSONL parsing, and
// directory-content spine detection — lifted out of `scripts/run-replay.mjs`
// so it is callable in-process. Every assertion below reads a specific value
// straight off a REAL archived file except the two defensive cases the
// module's own doctrine calls for: a malformed line (spliced into a COPY of
// a real file) and a missing/renamed sidecar.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, appendFileSync, rmSync, readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseJsonl, isSidecarByName, looksLikeSpine, resolveSiblings, replayOne, listSpines, readHistoryLog,
} from '../src/replayio.js';
import { formatReplay, formatAllLines, replayRun } from '../src/replay.js';
import { spawnSync } from 'node:child_process';

const BAREAGENT_U = '/home/hamr/PycharmProjects/bareloop-patients/bareagent-u-bareloop';
const LITECTX_TYPES = '/home/hamr/PycharmProjects/bareloop-patients/litectx-types-bareloop';
const haveBareagent = existsSync(BAREAGENT_U);
const haveLitectxTypes = existsSync(LITECTX_TYPES);

/** @type {string[]} */
const tmpDirs = [];
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
/** @returns {string} */
function tmp() {
  const d = mkdtempSync(join(tmpdir(), 'replayio-test-'));
  tmpDirs.push(d);
  return d;
}

// ---------------------------------------------------------------------------
// parseJsonl — tolerant parsing
// ---------------------------------------------------------------------------

test('parseJsonl: a real archived spine parses to N records with 0 skipped', { skip: !haveBareagent && 'no bareagent-u patient on this machine' }, () => {
  const { records, skipped } = parseJsonl(join(BAREAGENT_U, 'u-msdsmkid.jsonl'));
  assert.equal(skipped, 0);
  assert.ok(records.length > 0);
  assert.equal(records[0].type, 'job-start');
});

test('parseJsonl: a malformed line (spliced into a COPY of a real spine) is counted and skipped, never thrown on', { skip: !haveBareagent && 'no bareagent-u patient on this machine' }, () => {
  const dir = tmp();
  const real = readFileSync(join(BAREAGENT_U, 'u-msdsmkid.jsonl'), 'utf8');
  const lines = real.trimEnd().split('\n');
  // splice a corrupt line in after the first real record — proves the
  // parser survives a broken line mid-file, not just a trailing one.
  lines.splice(1, 0, '{this is not valid json');
  const corruptPath = join(dir, 'u-corrupt.jsonl');
  writeFileSync(corruptPath, `${lines.join('\n')}\n`);

  // FAIL FIRST: without the try/catch, JSON.parse on the corrupt line throws
  // and parseJsonl would crash instead of returning. Prove the real
  // behaviour first (green), then prove the naive alternative would break.
  const { records, skipped } = parseJsonl(corruptPath);
  assert.equal(skipped, 1);
  assert.equal(records.length, lines.length - 1);

  assert.throws(() => {
    for (const line of lines) JSON.parse(line); // the naive parse this module replaces
  }, SyntaxError);
});

// ---------------------------------------------------------------------------
// isSidecarByName / looksLikeSpine / resolveSiblings — content vs. filename
// ---------------------------------------------------------------------------

test('isSidecarByName: real gate-audit and non-sidecar filenames are classified correctly', { skip: !haveBareagent && 'no bareagent-u patient on this machine' }, () => {
  assert.equal(isSidecarByName('u-msdsmkid-gate-audit.jsonl'), true);
  assert.equal(isSidecarByName('u-msdsmkid.jsonl'), false);
  assert.equal(isSidecarByName('x.lag.jsonl'), true);
});

test('looksLikeSpine: a real spine reads true; a real non-spine log (types-check-log.jsonl) reads false', { skip: !haveLitectxTypes && 'no litectx-types-bareloop patient on this machine' }, () => {
  const spine = parseJsonl(join(LITECTX_TYPES, 'types-screen-C-ms0k88ck.jsonl'));
  assert.equal(looksLikeSpine(spine.records), true);
  const notSpine = parseJsonl(join(LITECTX_TYPES, 'types-check-log.jsonl'));
  assert.equal(looksLikeSpine(notSpine.records), false, 'types-check-log.jsonl carries no job-start/run-start — bare {ts,check,...} rows');
});

test('resolveSiblings: strips the u- prefix for the display id, keeps other prefixes verbatim, and finds a REAL sidecar', { skip: !haveBareagent && 'no bareagent-u patient on this machine' }, () => {
  const { runId, auditPath } = resolveSiblings(join(BAREAGENT_U, 'u-msdsmkid.jsonl'));
  assert.equal(runId, 'msdsmkid');
  assert.equal(auditPath, join(BAREAGENT_U, 'u-msdsmkid-gate-audit.jsonl'));
  assert.ok(existsSync(/** @type {string} */ (auditPath)));
});

test('resolveSiblings: a missing sidecar reads null, never a fabricated path', () => {
  const dir = tmp();
  const { auditPath } = resolveSiblings(join(dir, 'battery-A1-nope.jsonl'));
  assert.equal(auditPath, null);
});

// ---------------------------------------------------------------------------
// replayOne — feeds replayRun, never recomputes it
// ---------------------------------------------------------------------------

test('replayOne: a real GREEN run (u-msf70nei) reconstructs identically to hand-parsing + replayRun directly', { skip: !haveBareagent && 'no bareagent-u patient on this machine' }, () => {
  const path = join(BAREAGENT_U, 'u-msf70nei.jsonl');
  const summary = replayOne(path);
  assert.equal(summary.runId, 'msf70nei');
  assert.equal(summary.outcome, 'green');
  assert.ok(summary.spentUsd !== null && summary.spentUsd > 0);

  // FAIL FIRST proof that this is a THIN caller, not a re-implementation:
  // break replayOne by pointing it at the wrong sidecar (simulating a
  // recompute bug that ignores the real audit file) and show the tool-call
  // count it exposes via formatReplay changes — i.e. the number really is
  // sourced from replayRun/runBehaviour, not invented locally.
  const wrongDir = tmp();
  copyFileSync(path, join(wrongDir, 'u-msf70nei.jsonl'));
  // no sidecar copied — replayOne must honestly report no tool-call data
  // rather than reusing/guessing the real sidecar's numbers.
  const noAuditSummary = replayOne(join(wrongDir, 'u-msf70nei.jsonl'));
  assert.ok(summary.behaviour.totalCalls > 0, 'the real sidecar really does carry tool calls');
  assert.notDeepEqual(noAuditSummary.behaviour, summary.behaviour, 'without the real sidecar, behaviour must differ from the real reading, never coincidentally match it');
});

const POC_NO_AUDIT = '/home/hamr/PycharmProjects/bareloop-patients/spines-poc-openai/poc-pm48w5az.jsonl';
const havePocNoAudit = existsSync(POC_NO_AUDIT);

test(
  'replayOne on a real spine with NO gate-audit sidecar reports toolCalls/behaviour as unknown (null), never 0 — the spine itself carries 33 ctx-tool records that a 0 would silently discard',
  { skip: !havePocNoAudit && 'no poc-pm48w5az fixture on this machine' },
  () => {
    // confirm the fixture really has no sidecar sitting next to it (the
    // defect this reproduces: a spine-only archive, not an edited fixture).
    const { auditPath } = resolveSiblings(POC_NO_AUDIT);
    assert.equal(auditPath, null, 'fixture must genuinely have no gate-audit sidecar');

    const summary = replayOne(POC_NO_AUDIT);
    assert.equal(summary.behaviour, null, 'no sidecar was found — behaviour must be null (unknown), never a 0-call object');
    assert.equal(summary.timelineKind, 'steps');
    assert.ok(summary.steps.length > 0);
    for (const s of summary.steps) {
      assert.equal(s.toolCalls, null, `step ${s.id} has no sidecar data — toolCalls must be null, never 0`);
    }

    const text = formatReplay(summary);
    assert.ok(!/\b0 tools?\b/.test(text), `formatted replay must never print "0 tool(s)" for an audit-less run:\n${text}`);
    assert.ok(!/^0 tool calls$/m.test(text), `BEHAVIOUR section must never print "0 tool calls" for an audit-less run:\n${text}`);
    assert.ok(/unknown/i.test(text), 'formatted replay must say unknown somewhere for the missing tool-call data');
  },
);

test('replayOne: formatReplay(replayOne(...)) on a real run matches manual parseJsonl + replayRun byte-for-byte', { skip: !haveBareagent && 'no bareagent-u patient on this machine' }, () => {
  const path = join(BAREAGENT_U, 'u-msdsmkid.jsonl');
  const auditPath = join(BAREAGENT_U, 'u-msdsmkid-gate-audit.jsonl');
  const spine = readFileSync(path, 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
  const audit = readFileSync(auditPath, 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l));
  const direct = replayRun(spine, audit, { runId: 'msdsmkid' });
  assert.equal(formatReplay(replayOne(path)), formatReplay(direct));
});

// ---------------------------------------------------------------------------
// listSpines — content-detected directory listing over REAL mixed data
// ---------------------------------------------------------------------------

test('listSpines: a real mixed directory (litectx-types-bareloop) separates spines from non-spine logs, matching formatAllLines', { skip: !haveLitectxTypes && 'no litectx-types-bareloop patient on this machine' }, () => {
  const entries = listSpines(LITECTX_TYPES);
  const notSpineNames = entries.filter((e) => e.kind === 'not-a-spine').map((e) => /** @type {any} */ (e).name);
  // real non-spine files verified above by content
  assert.ok(notSpineNames.includes('types-check-log.jsonl'), `expected types-check-log.jsonl in not-a-spine, got: ${notSpineNames.join(', ')}`);
  assert.ok(notSpineNames.includes('types-close-log.jsonl'));

  const spineRows = entries.filter((e) => e.kind === 'spine').map((e) => /** @type {any} */ (e).row);
  assert.ok(spineRows.some((r) => r.id.includes('ms0k88ck')));

  // renders through the real formatter without throwing, non-empty.
  const rendered = formatAllLines(entries);
  assert.ok(rendered.length > 0);
  assert.match(rendered, /not-a-spine/);
});

test('listSpines: an empty directory returns an empty array', () => {
  const dir = tmp();
  assert.deepEqual(listSpines(dir), []);
});

// ---------------------------------------------------------------------------
// readHistoryLog — the bundle history.jsonl reader (retargets doHistory)
// ---------------------------------------------------------------------------

test('readHistoryLog: parses rows written by appendHistory-shaped lines and tolerates one malformed line', () => {
  const dir = tmp();
  const file = join(dir, 'history.jsonl');
  const row1 = { runid: 'abc123', outcome: 'green', spentUsd: 1.23 };
  const row2 = { runid: 'def456', outcome: 'cap-halt', spentUsd: null };
  appendFileSync(file, `${JSON.stringify(row1)}\n`);
  appendFileSync(file, 'not json at all\n');
  appendFileSync(file, `${JSON.stringify(row2)}\n`);

  const { rows, skipped } = readHistoryLog(file);
  assert.equal(skipped, 1);
  assert.deepEqual(rows, [row1, row2]);

  // FAIL FIRST: the naive alternative doHistory used to run (raw split +
  // print) would have printed the corrupt line verbatim instead of skipping
  // it — prove the two behaviours genuinely differ.
  const rawLines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
  assert.equal(rawLines.length, 3, 'the raw file really does have 3 lines, one of them garbage');
  assert.equal(rows.length, 2, 'the new reader drops the garbage line instead of reprinting it');
});

// ---------------------------------------------------------------------------
// The replay command — `scripts/run-replay.mjs` now (it left the `bareloop` CLI, PRD v1.114), real archived data
// ---------------------------------------------------------------------------

const REPLAY_SCRIPT = new URL('../scripts/run-replay.mjs', import.meta.url).pathname;
/** @param {string[]} args @returns {{ code: number|null, out: string, err: string }} */
function replayScript(args) {
  const r = spawnSync(process.execPath, [REPLAY_SCRIPT, ...args], { encoding: 'utf8', cwd: process.cwd() });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('run-replay.mjs <spine.jsonl>: prints the real formatReplay report for an archived run and exits 0', { skip: !haveBareagent && 'no bareagent-u patient on this machine' }, () => {
  const r = replayScript([join(BAREAGENT_U, 'u-msdsmkid.jsonl')]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /RUN msdsmkid/);
  assert.match(r.out, /step-red/);
});

test('run-replay.mjs --all <dir>: lists every real archived spine in the directory and exits 0', { skip: !haveBareagent && 'no bareagent-u patient on this machine' }, () => {
  const r = replayScript(['--all', BAREAGENT_U]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /msdsmkid/);
  assert.match(r.out, /msf70nei/);
});

test('run-replay.mjs: a non-spine file errs and exits 1', { skip: !haveLitectxTypes && 'no litectx-types-bareloop patient on this machine' }, () => {
  const r = replayScript([join(LITECTX_TYPES, 'types-check-log.jsonl')]);
  assert.equal(r.code, 1);
  assert.match(r.err, /does not look like a spine/);
});

test('run-replay.mjs: a missing file errs and exits 1', () => {
  const r = replayScript(['/no/such/file.jsonl']);
  assert.equal(r.code, 1);
  assert.match(r.err, /no such file/);
});

test('run-replay.mjs: no args prints usage and exits 1; a spine in a scratch dir (this repo\'s own fixture) replays', () => {
  const r = replayScript([]);
  assert.equal(r.code, 1);
  assert.match(r.err, /usage: node scripts\/run-replay\.mjs/);
  const fixture = new URL('./fixtures/export-run/smuqqw9x266au/source-seed/fix-slugify-bareloop/u-muqrenrf.jsonl', import.meta.url).pathname;
  const ok = replayScript([fixture]);
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.out, /RUN muqrenrf/);
});
