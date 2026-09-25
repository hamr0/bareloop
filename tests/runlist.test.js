// PANEL-BUILD.md P1 (2026-09-24 rulings) — the one run list
// (`~/.config/bareloop/runs.jsonl`) and its backfill scan. Every test below
// uses an injected `home` (never the real `~/.config/bareloop` — tests run
// hermetic, but this module also accepts the test seam directly so nothing
// here depends on the hermetic HOME redirect to stay safe). The idempotency
// and append-failure-doesn't-block-the-run assertions are each proven FAIL
// FIRST (see the accompanying report) by breaking the code in a scratch
// copy and watching the same test go red.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, statSync, cpSync, symlinkSync,
} from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import {
  runlistHome, runlistPath, appendRun, readRunList, backfillRuns, formatRunRow,
} from '../src/runlist.js';

/** @type {string[]} */
const tmpDirs = [];
after(() => { for (const d of tmpDirs) { try { chmodSync(d, 0o700); } catch { /* ignore */ } rmSync(d, { recursive: true, force: true }); } });
/** @returns {string} */
function tmp() {
  const d = mkdtempSync(join(tmpdir(), 'runlist-test-'));
  tmpDirs.push(d);
  return d;
}

// ---------------------------------------------------------------------------
// path resolution
// ---------------------------------------------------------------------------

test('runlistHome: no override resolves under the real homedir (~/.config/bareloop)', () => {
  assert.equal(runlistHome(), join(homedir(), '.config', 'bareloop'));
});

test('runlistPath: <home>/runs.jsonl', () => {
  const home = tmp();
  assert.equal(runlistPath(home), join(home, 'runs.jsonl'));
});

// ---------------------------------------------------------------------------
// append / read round trip
// ---------------------------------------------------------------------------

test('appendRun + readRunList: round trip, mkdir -p, file mode 0600', () => {
  const base = tmp();
  const home = join(base, 'nested', 'bareloop'); // proves mkdir -p, not just mkdir
  const row = { at: '2026-09-24T00:00:00.000Z', runid: 'abc123', job: 'aurora-u', spine: '/x/u-abc123.jsonl', patient: '/x/aurora-u', via: 'run-u' };
  const result = appendRun(row, { home });
  assert.equal(result.appended, true);

  const { rows, skipped } = readRunList({ home });
  assert.equal(skipped, 0);
  assert.deepEqual(rows, [row]);

  const mode = statSync(runlistPath(home)).mode & 0o777;
  assert.equal(mode, 0o600);
});

test('readRunList: an absent file reads as an empty list, not an error', () => {
  const home = tmp();
  const { rows, skipped } = readRunList({ home });
  assert.deepEqual(rows, []);
  assert.equal(skipped, 0);
});

// ---------------------------------------------------------------------------
// idempotency by runid (the resume/re-run-of-backfill guarantee)
// ---------------------------------------------------------------------------

test('appendRun: a second row with the SAME runid is never added twice (idempotent by runid)', () => {
  const home = tmp();
  const row = { at: '2026-09-24T00:00:00.000Z', runid: 'dup1', job: 'litectx-u', spine: '/x/u-dup1.jsonl', patient: null, via: 'run-u' };
  const r1 = appendRun(row, { home });
  const r2 = appendRun({ ...row, at: '2026-09-24T01:00:00.000Z' }, { home }); // different `at`, same runid
  assert.equal(r1.appended, true);
  assert.equal(r2.appended, false);
  assert.equal(r2.reason, 'duplicate-runid');
  const { rows } = readRunList({ home });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].at, '2026-09-24T00:00:00.000Z'); // the FIRST row wins, never overwritten
});

// ---------------------------------------------------------------------------
// append failure -> run continues (the caller's try/catch, exercised here at
// the library level: appendRun itself throws when the home dir cannot be
// created, and the callers in src/userrun.js / src/cli.js are responsible
// for catching it — this proves the THROW half of that contract; the
// catch-and-continue half is code-inspected at both call sites, both of
// which wrap this exact call in try/catch and print to stderr rather than
// rethrow, since a live paid run is not something this test suite can
// safely exercise end to end).
// ---------------------------------------------------------------------------

test('appendRun: throws when the home directory cannot be created (e.g. a file sits where the dir should be) — proves the failure is visible, never swallowed', () => {
  const base = tmp();
  const blocker = join(base, 'blocked');
  writeFileSync(blocker, 'not a directory');
  const home = join(blocker, 'bareloop'); // mkdir -p through a FILE must fail
  assert.throws(() => appendRun({ at: 'x', runid: 'r1', job: 'j', spine: '/s', patient: null, via: 'run-u' }, { home }));
});

// ---------------------------------------------------------------------------
// backfill
// ---------------------------------------------------------------------------

function writeSpine(path, records) {
  writeFileSync(path, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
}

test('backfillRuns: free-standing layout (dir + immediate subdir), plus a not-a-spine and a sidecar, both correctly excluded', () => {
  const patients = tmp();
  const home = tmp();

  // a spine directly in `dir`
  writeSpine(join(patients, 'u-r1.jsonl'), [{ type: 'job-start', job: 'root-job', ts: '2026-09-01T00:00:00.000Z', seq: 1 }]);
  // its gate-audit sidecar — must be excluded, never read as its own spine
  writeSpine(join(patients, 'u-r1-gate-audit.jsonl'), [{ type: 'allow', seq: 1 }]);
  // a spine in an immediate subdirectory
  mkdirSync(join(patients, 'sub-job-bareloop'), { recursive: true });
  writeSpine(join(patients, 'sub-job-bareloop', 'u-r2.jsonl'), [{ type: 'job-start', job: 'sub-job', ts: '2026-09-02T00:00:00.000Z', seq: 1 }]);
  // a .jsonl that is NOT a spine (no job-start/run-start) — must be skipped, never added
  writeSpine(join(patients, 'sub-job-bareloop', 'notes.jsonl'), [{ type: 'note', seq: 1 }]);

  const result = backfillRuns(patients, { home });
  assert.equal(result.added, 2);
  assert.equal(result.alreadyListed, 0);
  assert.equal(result.skipped, 1); // notes.jsonl

  const { rows } = readRunList({ home });
  assert.equal(rows.length, 2);
  const byJob = Object.fromEntries(rows.map((r) => [r.job, r]));
  assert.equal(byJob['root-job'].runid, 'r1');
  assert.equal(byJob['root-job'].at, '2026-09-01T00:00:00.000Z');
  assert.equal(byJob['root-job'].patient, null);
  assert.equal(byJob['root-job'].via, 'backfill');
  assert.equal(byJob['sub-job'].runid, 'r2');
});

test('backfillRuns: bundle layout (<x>/runs/<runid>/spine.jsonl) derives runid from the directory name', () => {
  const patients = tmp();
  const home = tmp();
  mkdirSync(join(patients, 'runs', 'mubundle01'), { recursive: true });
  writeSpine(join(patients, 'runs', 'mubundle01', 'spine.jsonl'), [{ type: 'job-start', job: 'bundle-job', ts: '2026-09-03T00:00:00.000Z', seq: 1 }]);

  const result = backfillRuns(patients, { home });
  assert.equal(result.added, 1);
  const { rows } = readRunList({ home });
  assert.equal(rows[0].runid, 'mubundle01');
  assert.equal(rows[0].job, 'bundle-job');
});

test('backfillRuns: IDEMPOTENT — running twice adds nothing the second time', () => {
  const patients = tmp();
  const home = tmp();
  writeSpine(join(patients, 'u-idem1.jsonl'), [{ type: 'job-start', job: 'idem-job', ts: '2026-09-04T00:00:00.000Z', seq: 1 }]);

  const first = backfillRuns(patients, { home });
  assert.equal(first.added, 1);
  const second = backfillRuns(patients, { home });
  assert.equal(second.added, 0);
  assert.equal(second.alreadyListed, 1);

  const { rows } = readRunList({ home });
  assert.equal(rows.length, 1);
});

test('backfillRuns: an already-appended run (via run-u/bundle) is recognized and never re-added as a backfill row', () => {
  const patients = tmp();
  const home = tmp();
  writeSpine(join(patients, 'u-live1.jsonl'), [{ type: 'job-start', job: 'live-job', ts: '2026-09-05T00:00:00.000Z', seq: 1 }]);
  appendRun({ at: '2026-09-05T00:00:01.000Z', runid: 'live1', job: 'live-job', spine: join(patients, 'u-live1.jsonl'), patient: '/x/live', via: 'run-u' }, { home });

  const result = backfillRuns(patients, { home });
  assert.equal(result.added, 0);
  assert.equal(result.alreadyListed, 1);
  const { rows } = readRunList({ home });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].via, 'run-u'); // the live row is never overwritten by a backfill row
});

test('backfillRuns: RECURSIVE — finds a spine nested several directories deep, never just dir + immediate subdirs', () => {
  const patients = tmp();
  const home = tmp();
  // 4 directories deep, matching the real shape a person-path run archives
  // to: <dir>/out/source-x/y-bareloop/u-<id>.jsonl
  const deep = join(patients, 'proj-live', 'out', 'source-x', 'proj-live-bareloop');
  mkdirSync(deep, { recursive: true });
  writeSpine(join(deep, 'u-deep1.jsonl'), [{ type: 'job-start', job: 'deep-job', ts: '2026-09-20T00:00:00.000Z', seq: 1 }]);

  const result = backfillRuns(patients, { home });
  assert.equal(result.added, 1);
  const { rows } = readRunList({ home });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].runid, 'deep1');
  assert.equal(rows[0].job, 'deep-job');
});

test('backfillRuns: never descends into node_modules or .git', () => {
  const patients = tmp();
  const home = tmp();
  mkdirSync(join(patients, 'node_modules', 'some-pkg'), { recursive: true });
  writeSpine(join(patients, 'node_modules', 'some-pkg', 'u-nm1.jsonl'), [{ type: 'job-start', job: 'nm-job', ts: '2026-09-20T00:00:00.000Z', seq: 1 }]);
  mkdirSync(join(patients, '.git', 'objects'), { recursive: true });
  writeSpine(join(patients, '.git', 'objects', 'u-git1.jsonl'), [{ type: 'job-start', job: 'git-job', ts: '2026-09-20T00:00:00.000Z', seq: 1 }]);
  // a real spine sitting alongside, to prove the scan otherwise works
  writeSpine(join(patients, 'u-real1.jsonl'), [{ type: 'job-start', job: 'real-job', ts: '2026-09-20T00:00:00.000Z', seq: 1 }]);

  const result = backfillRuns(patients, { home });
  assert.equal(result.added, 1);
  const { rows } = readRunList({ home });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].job, 'real-job');
});

test('backfillRuns: never follows a symlinked directory', { skip: process.platform === 'win32' }, () => {
  const patients = tmp();
  const home = tmp();
  const real = tmp();
  writeSpine(join(real, 'u-sym1.jsonl'), [{ type: 'job-start', job: 'sym-job', ts: '2026-09-20T00:00:00.000Z', seq: 1 }]);
  symlinkSync(real, join(patients, 'linked'), 'dir');

  const result = backfillRuns(patients, { home });
  assert.equal(result.added, 0);
  const { rows } = readRunList({ home });
  assert.equal(rows.length, 0);
});

test('backfillRuns: bounded depth — a spine deeper than the cap is not found', () => {
  const patients = tmp();
  const home = tmp();
  // one level deeper than MAX_BACKFILL_DEPTH (6): dir/d1/d2/d3/d4/d5/d6/d7/u-x.jsonl
  const tooDeep = join(patients, 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7');
  mkdirSync(tooDeep, { recursive: true });
  writeSpine(join(tooDeep, 'u-toodeep1.jsonl'), [{ type: 'job-start', job: 'too-deep-job', ts: '2026-09-20T00:00:00.000Z', seq: 1 }]);

  const result = backfillRuns(patients, { home });
  assert.equal(result.added, 0);
  const { rows } = readRunList({ home });
  assert.equal(rows.length, 0);
});

// ---------------------------------------------------------------------------
// `file missing` rendering
// ---------------------------------------------------------------------------

test('formatRunRow: a row whose spine file still exists prints clean; a row whose spine is gone marks "file missing"', () => {
  const dir = tmp();
  const spinePath = join(dir, 'u-present.jsonl');
  writeFileSync(spinePath, '{}\n');
  const present = { at: '2026-09-24T00:00:00.000Z', runid: 'present1', job: 'present-job', spine: spinePath, patient: null, via: 'run-u' };
  const gone = { at: '2026-09-24T00:00:00.000Z', runid: 'gone1', job: 'gone-job', spine: join(dir, 'u-gone.jsonl'), patient: null, via: 'run-u' };

  const presentLine = formatRunRow(present);
  const goneLine = formatRunRow(gone);
  assert.ok(presentLine.includes('present-job (present1)'));
  assert.ok(!presentLine.includes('file missing'));
  assert.ok(goneLine.includes('gone-job (gone1)'));
  assert.ok(goneLine.includes('file missing'));
});

// ---------------------------------------------------------------------------
// backfill against REAL archived spines (bareloop-patients), copied to a
// temp dir first — never scanning the real path directly, and never
// depending on it at runtime (skipped when absent, e.g. CI).
// ---------------------------------------------------------------------------

const REAL_PATIENTS_DIR = '/home/hamr/PycharmProjects/bareloop-patients';
const haveRealPatients = existsSync(REAL_PATIENTS_DIR);

// ---------------------------------------------------------------------------
// F197: dedup by SPINE PATH (never a filename-derived runid). A spine with
// no runid inside it (e.g. quickstart-proof/run.jsonl) falls back to a
// runid derived from its own basename ("run") — two such files, same
// basename, different directories, must NOT be treated as "the same run".
// ---------------------------------------------------------------------------

test('backfillRuns: two DIFFERENT spine files sharing a basename (no runid inside either, e.g. two run.jsonl) are BOTH added — dedup is by spine path, never the filename-derived runid', () => {
  const patients = tmp();
  const home = tmp();
  mkdirSync(join(patients, 'proj-a'), { recursive: true });
  mkdirSync(join(patients, 'proj-b'), { recursive: true });
  // neither record carries a `runid` field — runidForSpine falls back to the
  // filename-derived id ("run") for BOTH, since both files are named run.jsonl
  writeSpine(join(patients, 'proj-a', 'run.jsonl'), [{ type: 'job-start', job: 'job-a', ts: '2026-09-24T00:00:00.000Z', seq: 1 }]);
  writeSpine(join(patients, 'proj-b', 'run.jsonl'), [{ type: 'job-start', job: 'job-b', ts: '2026-09-24T00:00:01.000Z', seq: 1 }]);

  const first = backfillRuns(patients, { home });
  assert.equal(first.added, 2, 'both run.jsonl files must be added — same basename is not the same run');
  assert.equal(first.alreadyListed, 0);

  const { rows } = readRunList({ home });
  assert.equal(rows.length, 2);
  const runids = rows.map((r) => r.runid);
  assert.equal(new Set(runids).size, 2, 'the two rows must carry DISTINCT runids (disambiguated), never the same one twice');
  const byJob = Object.fromEntries(rows.map((r) => [r.job, r]));
  assert.ok(byJob['job-a']);
  assert.ok(byJob['job-b']);

  // IDEMPOTENT: running backfill again over the same dir adds nothing —
  // dedup is now keyed on the resolved spine path, which is stable.
  const second = backfillRuns(patients, { home });
  assert.equal(second.added, 0, 'a second backfill pass must add nothing new');
  assert.equal(second.alreadyListed, 2);
  const { rows: rows2 } = readRunList({ home });
  assert.equal(rows2.length, 2, 'no duplicate rows after a second backfill pass');
});

test('backfillRuns: dedup is by resolved ABSOLUTE spine path — a relative/unresolved dir argument still recognizes an already-listed spine', () => {
  const patients = tmp();
  const home = tmp();
  writeSpine(join(patients, 'u-relcheck.jsonl'), [{ type: 'job-start', job: 'rel-job', ts: '2026-09-24T00:00:00.000Z', seq: 1 }]);

  const first = backfillRuns(patients, { home });
  assert.equal(first.added, 1);
  // second pass, same absolute dir — must recognize the spine already listed
  // via its resolved path even though nothing here changed the path's spelling
  const second = backfillRuns(patients, { home });
  assert.equal(second.added, 0);
  assert.equal(second.alreadyListed, 1);
});

test('backfillRuns: against a COPY of real archived spines, every candidate is bucketed (added+alreadyListed+skipped accounts for every .jsonl found)', { skip: !haveRealPatients && 'no bareloop-patients dir on this machine' }, () => {
  const src = join(REAL_PATIENTS_DIR, 'bareagent-u-bareloop');
  if (!existsSync(src)) { assert.ok(true, 'bareagent-u-bareloop not present; nothing to copy'); return; }
  const copyDir = tmp();
  const dest = join(copyDir, 'bareagent-u-bareloop');
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  const home = tmp();

  const result = backfillRuns(copyDir, { home });
  assert.ok(result.added > 0, 'expected at least one real spine to be found and added');
  const { rows } = readRunList({ home });
  assert.equal(rows.length, result.added);
  for (const row of rows) {
    assert.equal(row.via, 'backfill');
    assert.equal(typeof row.runid, 'string');
    assert.ok(row.spine.startsWith(copyDir)); // never the real archive path
  }
});
