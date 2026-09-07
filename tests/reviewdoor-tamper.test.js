// F135 — the door's `accept` re-proof (`src/reviewdoor.js`'s `proveMechanically`)
// calls `runStages`/`runDeclaredStages` directly and never went through
// `checkStageByteSignature` (`src/close-integrity.js`) the way every OTHER close
// execution does (`runCloseStages` in `src/planrun.js`, ~lines 1538-1564). A close
// script whose bytes were swapped AFTER the run ended but BEFORE the signer's
// `accept` therefore ran unchecked and could mint a false accept — exactly the
// PRD item 27/M2 hazard the byte signature exists to close, reopened at the one
// seam that skipped it.
//
// This test uses a COMMAND close (`spec.close`, not `closeDecl`): `sha256` byte
// signing is scoped to `spec.close` stages (`readCloseScripts`/`closeScriptCandidateToken`
// — a declared `command-exit` stage's `params.cmd` names an interpreter binary,
// not an addressable repo script, so it carries no top-level `cmd`/`sha256` and
// is correctly out of this rung's scope). Fixture style follows
// `tests/close-integrity.test.js`'s `JOB_WITH_CLOSE`/`makePatient`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runJob } from '../src/run.js';
import { validateJob, jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { answerReviewDoor, doorRecordOf } from '../src/reviewdoor.js';
import { scriptedProvider } from './helpers.js';

/** @param {import('node:test').TestContext} t */
function makePatient(t) {
  const wd = mkdtempSync(join(tmpdir(), 'reviewdoor-tamper-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 'bareloop-test', GIT_AUTHOR_EMAIL: 'test@bareloop',
    GIT_COMMITTER_NAME: 'bareloop-test', GIT_COMMITTER_EMAIL: 'test@bareloop',
  };
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: wd, encoding: 'utf8', env });
  git(['init', '-q', '-b', 'main']);
  mkdirSync(join(wd, 'src'), { recursive: true });
  writeFileSync(join(wd, 'src', 'mod.mjs'), 'export const x = 1;\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'seed']);
  return wd;
}

/** the SIGNED close script: reds unless src/mod.mjs carries the "ok" marker —
 * i.e. it genuinely judges the tree, so a false accept can only come from the
 * byte check being skipped, never from the tampered script happening to fail. */
const CLOSE_SRC = "import { readFileSync } from 'node:fs';\n"
  + "let ok = false;\n"
  + "try { ok = readFileSync('src/mod.mjs', 'utf8').includes('ok'); } catch {}\n"
  + 'process.exit(ok ? 0 : 1);\n';

/** the TAMPERED replacement — different bytes, but behaviourally identical
 * (always exits 0): proves the refusal is about the SIGNATURE, not a script
 * that happens to fail its own logic. */
const TAMPERED_SRC = '// swapped after the run ended, before the accept\nprocess.exit(0);\n';

const JOB = (/** @type {string} */ sha256) => ({
  schema: 'job-v1',
  job: 'reviewdoor-tamper-patient',
  description: 'F135 fixture — command-close accept re-proof must verify bytes',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  maxWallMs: 30 * 60_000,
  writeScope: ['src/**'],
  goal: 'Append an ok marker to src/mod.mjs.',
  verdictType: 'green',
  close: [{ name: 'verdict', cmd: 'node verdict-close.mjs', expect: 0, sha256 }],
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
});

const PLAN = JSON.stringify({
  schema: 'plan-v1',
  steps: [{
    id: 'write-ok',
    action: 'Append an ok marker to src/mod.mjs.',
    tools: ['write'], rounds: 6, target: 'src/mod.mjs',
    exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'verdict' }],
  }],
});

const approve = (/** @type {any} */ job) => [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }];

const readEvents = (/** @type {string} */ f) => readFileSync(f, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));

/** a real green run, command-close, door open — mirrors `greenRun` in
 * tests/reviewdoor.test.js but with a command close instead of closeDecl. */
async function greenCommandCloseRun(t) {
  const wd = makePatient(t);
  writeFileSync(join(wd, 'verdict-close.mjs'), CLOSE_SRC);
  const job = JOB(hashCloseScriptBytes(CLOSE_SRC));
  const jv = validateJob(job, { shellCapUsd: job.budgetUsd });
  assert.deepEqual(jv.reds, [], `fixture job must validateJob-green: ${JSON.stringify(jv.reds)}`);
  /** @type {any[]} */
  const events = [];
  const emit = (/** @type {string} */ type, /** @type {any} */ data = {}) => {
    const { type: _t, ts: _ts, ...payload } = data ?? {};
    const ev = { type, ...payload, ts: new Date().toISOString() };
    events.push(ev);
    return ev;
  };
  const provider = scriptedProvider([
    { text: 'src/ holds mod.mjs; verdict-close.mjs is the gate.' },
    { text: PLAN },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(wd, 'src', 'mod.mjs'), content: 'export const x = 1; // ok\n' } }] },
    { text: 'wrote src/mod.mjs' },
  ]);
  const outcome = await runJob(jv.job, { approvals: approve(jv.job), workdir: wd, provider, emit, reviewDoor: true });
  assert.equal(outcome, 'green', `expected a real green run: events=${JSON.stringify(events)}`);
  assert.ok(doorRecordOf(events), 'the run must have opened a review door');
  return { dir: wd, job: jv.job, events };
}

test('F135 red-on-HEAD: accept on a run whose command-close script was TAMPERED after the run must be refused close-tampered, never honoured', async (t) => {
  const r = await greenCommandCloseRun(t);
  // tamper AFTER the run ended, before the signer answers the door
  writeFileSync(join(r.dir, 'verdict-close.mjs'), TAMPERED_SRC);
  const a = await answerReviewDoor({
    job: r.job, workdir: r.dir, events: r.events, decision: 'accept', closeTimeoutMs: 120_000, at: 'now',
  });
  assert.equal(a.ok, false, 'a tampered close script must never be honoured by accept');
  assert.equal(a.reds[0]?.code, 'door-accept-red');
  assert.match(a.reds[0]?.detail ?? '', /tamper|signature|sha256/i, `refusal must name the tamper: ${JSON.stringify(a.reds)}`);
  assert.equal(a.released, false, 'nothing is released on a refused accept');
  assert.equal(a.doorRecorded, false, 'nothing is recorded on a refused accept');
});

test('F135 control: accept on an UNTAMPERED command-close run is still honoured — the fix must not false-red an honest tree', async (t) => {
  const r = await greenCommandCloseRun(t);
  const a = await answerReviewDoor({
    job: r.job, workdir: r.dir, events: r.events, decision: 'accept', closeTimeoutMs: 120_000, at: 'now',
  });
  assert.equal(a.ok, true, JSON.stringify(a.reds));
  assert.equal(a.next, 'accepted');
  assert.equal(a.mechanical.verdict, 'satisfied');
});
