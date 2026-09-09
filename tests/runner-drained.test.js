// F140/PRD item 28(c) — the `beforeExit` backstop, tested as a real CHILD
// PROCESS. `runJob` (src/run.js) registers a `process.once('beforeExit', …)`
// right after `job-start` so a provider promise that never settles (BA-25's
// class — bare-agent 0.42/F141 closed the known drop cases, but "an
// instrument fires on absence" stays a permanent class) still mints an
// honest terminal instead of node draining with NO `job-end` at all.
//
// Why a child process rather than driving it in-process: a manual
// `process.emit('beforeExit', …)` inside the SAME process as the test
// runner is an impersonation of the event, not the event — and, separately,
// this repo's node:test + a transitive `signal-exit` dependency cancel ANY
// test that calls `process.emit('beforeExit', …)`, reproduced even with a
// trivial, fully-resolved, unrelated promise and zero bareloop code
// involved. Only a genuinely separate `node` process, left to drain on its
// own, proves the mechanism against the real instrument it exists to catch.
//
// Why the fixture spec is a SOFT-GREEN job with a judged close stage, not the
// mechanical `close:[{cmd:…}]` shape used elsewhere in this suite: every
// WORKER-provider round `runJob` issues in its normal flow (scout,
// plan/draft, step execution, close-fix) funnels through ONE function,
// `mkWorker` (src/planrun.js:2142), which wraps every call in
// `createStallWatch` (F66, src/stall.js — 300s, 3 reissues), the pre-existing
// primary defence against exactly "a provider call that never produces a
// round". A hung `provider.generate()` fed through the ordinary worker
// `provider` gets caught by that watch and resolved into a REAL job-end
// (`step-stalled`) through the NORMAL path — proven empirically (a throwaway
// harness with `setTimeout` scaled ~1000x still landed on `step-stalled`,
// never `runner-drained`). The one call in this codebase with NO such
// wrapper is the SOFTGREEN JUDGE call (`src/judged.js`'s `defaultJudgeLoop`,
// a bare-agent `Loop` built directly over `judgeProvider`) — see
// tests/fixtures/runner-drained-fixture.mjs for the full job spec.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { readSpine, initPatientRepo } from './helpers.js';

const base = mkdtempSync(join(tmpdir(), 'runner-drained-test-'));
after(() => rmSync(base, { recursive: true, force: true }));

const FIXTURE = join(import.meta.dirname, 'fixtures', 'runner-drained-fixture.mjs');
// The judged artifact (`closeDecl.stages[].params.paths` in the fixture) is
// `src/mod.mjs`, and the judge's FACTS must quote lines that literally exist
// in it — so the patient's `src/mod.mjs` carries src/spine.js's REAL text
// (one top-level function, fully documented), the exact artifact
// tests/judged-stage.test.js's PASS_FACTS were built against. A placeholder
// like `export const x = 1;` cannot be judged green: the judge's own quotes
// would name lines "nobody can find" in it.
const ARTIFACT_TEXT = readFileSync(join(import.meta.dirname, '..', 'src', 'spine.js'), 'utf8');

/** Prepares a real patient (git repo with `src/` and `tests/` already IN THE
 * SEED commit — the fixture's mandatory `changed-from-seed` guard allow-lists
 * `tests/`, and an allow-prefix absent from the seed tree is itself a
 * validation red) then spawns the fixture as a child process in `mode` and
 * returns its result plus the parsed spine.
 * @param {string} name @param {'hang'|'green'} mode
 */
function runFixture(name, mode) {
  const workdir = join(base, name, 'patient');
  mkdirSync(join(workdir, 'tests'), { recursive: true });
  mkdirSync(join(workdir, 'src'), { recursive: true });
  writeFileSync(join(workdir, 'tests', '.gitkeep'), '');
  writeFileSync(join(workdir, 'src', 'mod.mjs'), ARTIFACT_TEXT);
  initPatientRepo(workdir);
  // OUTSIDE workdir: the mandatory `changed-from-seed` guard diffs the WHOLE
  // repo against its seed commit, so a spine file written inside the patient
  // would itself show up as a rogue changed file.
  const spineFile = join(base, name, 'spine.jsonl');
  // 30s guard: nothing in the 'hang' case holds node's event loop open on
  // its own account (see the fixture's header), so it should drain almost
  // immediately — this timeout exists only to fail loudly instead of
  // hanging the suite if that stops being true.
  const result = spawnSync(process.execPath, [FIXTURE, workdir, spineFile, mode], {
    encoding: 'utf8', timeout: 30_000,
  });
  const events = (() => { try { return readSpine(spineFile); } catch { return []; } })();
  return { result, events, spineFile };
}

test('F140/PRD 28(c): a judge call that never settles drains the real child process into exactly one runner-drained job-end, exit non-zero', () => {
  const { result, events } = runFixture('drained', 'hang');
  assert.equal(result.error, undefined, `fixture must not itself error/timeout: ${result.stderr}`);
  const ends = events.filter((e) => e.type === 'job-end');
  assert.equal(ends.length, 1, `exactly one job-end (spine: ${JSON.stringify(events)}, stderr: ${result.stderr})`);
  assert.equal(ends[0].outcome, 'runner-drained');
  assert.equal(ends[0].spendComplete, false, 'a drained run\'s in-flight spend is unknowable — never an exact-looking total (F6)');
  assert.notEqual(result.status, 0, 'a drained run must never exit 0');
});

test('F140/PRD 28(c) CONTROL: the SAME job with a real, prompt judge exits 0 in its own child process with exactly one job-end, never runner-drained', () => {
  const { result, events } = runFixture('not-drained', 'green');
  assert.equal(result.error, undefined, `fixture must not itself error/timeout: ${result.stderr}`);
  const ends = events.filter((e) => e.type === 'job-end');
  assert.equal(ends.length, 1, `exactly one job-end (spine: ${JSON.stringify(events)}, stderr: ${result.stderr})`);
  assert.equal(ends[0].outcome, 'green');
  assert.equal(result.status, 0, `a real green run must exit 0 (stderr: ${result.stderr})`);
});
