// F393 (hamr 2026-11-24, run mwtf8p8s): a check that never finished inside its limit judged nothing, so the leg ends `check-timeout` and
// Resume is offered, exactly like provider-red. A check that broke, was killed or crashed is still `close-red`. The limit is injected short
// (`closeTimeoutMs`, the engine's own test knob); the hanging check is a node script that waits when a gitignored flag file exists.
// The tree has uncommitted work in every leg that must reach the check: the precheck is first-red-wins, so a clean seed stops at the
// changed-from-seed guard before the check runs (a start check that times out THERE is a preflight stop, reported apart).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJob } from '../src/run.js';
import { jobSpecHash, validateJob } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { classGuards } from '../src/authoring.js';
import { GENRE } from '../src/authorjob.js';
import { CHECK_LIMIT_MS } from '../src/kinds.js';
import { readResume, CHECKPOINT_OUTCOMES } from '../src/reuse.js';
import { endedFor } from '../src/panel/server.js';
import { statusFor } from '../src/panel/status.js';
import { scriptedProvider, initPatientRepo, readSpine } from './helpers.js';

const LIMIT_MS = 3000;

/** a patient whose check hangs while hang.flag exists, kills itself while kill.flag exists, and otherwise goes green once src/fix.js says `final` */
function world(t, { check = 'check.mjs' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'check-timeout-'));
  const out = mkdtempSync(join(tmpdir(), 'check-timeout-out-'));
  t.after(() => { rmSync(dir, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  writeFileSync(join(dir, '.gitignore'), '.smoke/\nhang.flag\nkill.flag\n');
  writeFileSync(join(dir, 'check.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const at = (n) => new URL('./' + n, import.meta.url).pathname;
if (existsSync(at('kill.flag'))) process.kill(process.pid, 'SIGKILL');
if (existsSync(at('hang.flag'))) setTimeout(() => {}, 60000);
else process.exit(existsSync(at('src/fix.js')) && readFileSync(at('src/fix.js'), 'utf8').includes('final') ? 0 : 1);
`);
  initPatientRepo(dir);
  writeFileSync(join(dir, 'src', 'mod.js'), '// edited, uncommitted\n');
  const guards = classGuards({ verdictType: 'green', lang: 'js' }).map((g) => ({ name: g.name, kind: g.kind, params: { ...g.params, ...(g.fill.includes('allowPrefixes') ? { allowPrefixes: ['src/'] } : {}) } }));
  const job = {
    schema: 'job-v1', job: 'check-timeout', description: 'a check that may not finish', provider: 'anthropic-api', cadence: { unit: 'day', every: 1 }, budgetUsd: 1.5,
    writeScope: ['src/**'], goal: 'Create src/fix.js.', verdictType: 'green',
    closeDecl: { genre: GENRE, lang: 'js', stages: [guards[0], { name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: [check], expectExit: 0 } }, guards[1]] },
    tools: ['read', 'write', 'edit'], escalation: { mode: 'decision-ready' },
  };
  assert.deepEqual(validateJob(job, { shellCapUsd: job.budgetUsd }).reds, []);
  return { dir, job, spine: join(out, 'spine.jsonl'), stopFile: join(out, 'stop') };
}
const PLAN = JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'write-fix', action: 'Create src/fix.js.', tools: ['write'], rounds: 6, target: 'src/fix.js', exit: [{ type: 'tree-changed', scope: 'src/**' }] }] });
const approvals = (job) => [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }];
const run = (w, provider, extra = {}) => runJob(w.job, { approvals: approvals(w.job), workdir: w.dir, provider, emit: makeSpine(w.spine), stopFile: w.stopFile, closeTimeoutMs: LIMIT_MS, ...extra });
const writeFix = (w, content = '// final\n') => ({ toolCalls: [{ id: 'w1', name: 'shell_write', arguments: { path: join(w.dir, 'src', 'fix.js'), content } }] });

test('(a) a start check that times out ends the leg check-timeout, with the limit that bound it on the escalation; no model call was made', async (t) => {
  const w = world(t);
  writeFileSync(join(w.dir, 'hang.flag'), '');
  const provider = scriptedProvider([{ text: 'never' }]);
  const outcome = await run(w, provider);
  const events = readSpine(w.spine);
  assert.equal(outcome, 'check-timeout', JSON.stringify(events.filter((e) => e.type === 'escalation')));
  assert.equal(provider.calls.length, 0);
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'close-timeout', 'the escalation keeps the arbiter\'s own category');
  assert.equal(esc.limitMs, LIMIT_MS);
  assert.equal(events.find((e) => e.type === 'job-end')?.outcome, 'check-timeout');
});

test('(a) a start check that is killed (OOM-style) or cannot run stays close-red', async (t) => {
  const killed = world(t);
  writeFileSync(join(killed.dir, 'kill.flag'), '');
  assert.equal(await run(killed, scriptedProvider([{ text: 'never' }])), 'close-red', 'killed by a signal');
  const broken = world(t, { check: 'no-such-check-file.mjs' });
  // the file is absent, so node exits 1: that is a RED, not a fault - use a command that cannot start instead
  broken.job.closeDecl.stages[1].params = { cmd: 'no-such-binary-xyz-bareloop', args: [], expectExit: 0 };
  assert.equal(await run(broken, scriptedProvider([{ text: 'never' }])), 'close-red', 'a check that cannot run');
});

test('(a) the final close: a check that times out after the work ends check-timeout, not close-red', async (t) => {
  const w = world(t);
  // the check is a fast red at the start, and hangs once the worker has written src/fix.js: the flag appears with the write
  const provider = scriptedProvider([{ text: 'scout' }, { text: PLAN }, writeFix(w), { text: 'wrote src/fix.js' }]);
  const gen = provider.generate.bind(provider);
  let n = 0;
  provider.generate = async (...a) => { n += 1; if (n === 4) writeFileSync(join(w.dir, 'hang.flag'), ''); return gen(...a); };
  const outcome = await run(w, provider);
  const events = readSpine(w.spine);
  assert.equal(outcome, 'check-timeout', JSON.stringify(events.filter((e) => e.type === 'escalation')));
  assert.equal(events.filter((e) => e.type === 'escalation').at(-1)?.limitMs, LIMIT_MS);
});

test('(b) the F393 story: stopped, resumed, the start check times out -> check-timeout, and Resume is offered for it', async (t) => {
  const w = world(t);
  // leg 1: the person presses Stop after the worker's first round (a partial write is on disk)
  const base = scriptedProvider([{ text: 'scout' }, { text: PLAN }, writeFix(w, '// partial\n'), { text: 'wrote src/fix.js' }]);
  const gen = base.generate.bind(base);
  let n = 0;
  base.generate = async (...a) => { n += 1; if (n === 4) writeFileSync(w.stopFile, ''); return gen(...a); };
  assert.equal(await run(w, base), 'stopped');
  const leg1 = readSpine(w.spine);
  const branch = leg1.find((e) => e.type === 'work-branch')?.branch;
  assert.ok(branch, 'leg 1 prepared a work branch');
  const cp1 = readResume(leg1, { direct: true, resumableOutcomes: CHECKPOINT_OUTCOMES });
  assert.ok(cp1.restart, 'a stopped leg is resumable');

  // leg 2: a Resume. The machine is loaded: the start check does not finish inside its limit
  writeFileSync(join(w.dir, 'hang.flag'), '');
  makeSpine(w.spine)('leg-resume', { leg: 2, after: 'stopped', at: new Date().toISOString() });
  const second = scriptedProvider([{ text: 'never' }]);
  const out2 = await run(w, second, { resumeSeed: cp1.restart.seed, resumeBranch: branch });
  assert.equal(out2, 'check-timeout', JSON.stringify(readSpine(w.spine).filter((e) => e.type === 'escalation').slice(-2)));
  assert.equal(second.calls.length, 0, 'nothing was spent on a leg that judged nothing');
  const leg2 = readSpine(w.spine);
  const cp2 = readResume(leg2, { direct: true, resumableOutcomes: CHECKPOINT_OUTCOMES });
  assert.equal(cp2.endOutcome, 'check-timeout');
  assert.ok(cp2.restart, 'check-timeout is a checkpoint: a resume point is read back (what the panel offers Resume from)');
  // NOT asserted here: that a Resume of THIS leg re-enters leg 1's recorded step. A resumed leg that dies before it re-accepts its plan
  // leaves no plan in its own window, and `readResume` reads the latest leg only (reported to hamr, not decided here).
});

test('(b) a check that times out in the FINAL close is resumable at the close: the resumed leg reads the recorded plan, runs the check again, buys no worker round', async (t) => {
  const w = world(t);
  const first = scriptedProvider([{ text: 'scout' }, { text: PLAN }, writeFix(w), { text: 'wrote src/fix.js' }]);
  const gen = first.generate.bind(first);
  let n = 0;
  first.generate = async (...a) => { n += 1; if (n === 4) writeFileSync(join(w.dir, 'hang.flag'), ''); return gen(...a); };
  assert.equal(await run(w, first), 'check-timeout');
  const leg1 = readSpine(w.spine);
  const branch = leg1.find((e) => e.type === 'work-branch')?.branch;
  const cp = readResume(leg1, { direct: true, resumableOutcomes: CHECKPOINT_OUTCOMES });
  assert.equal(cp.endOutcome, 'check-timeout');
  assert.equal(cp.restart?.seed?.phase, 'close', 'every step finished; only the close is left');

  rmSync(join(w.dir, 'hang.flag'));
  makeSpine(w.spine)('leg-resume', { leg: 2, after: 'check-timeout', at: new Date().toISOString() });
  const second = scriptedProvider([{ text: 'never' }]);
  const out2 = await run(w, second, { resumeSeed: cp.restart.seed, resumeBranch: branch });
  const leg2 = readSpine(w.spine).slice(leg1.length);
  assert.ok(['green', 'already-green'].includes(out2), `${out2} ${JSON.stringify(leg2.filter((e) => e.type === 'escalation'))}`);
  assert.ok(leg2.some((e) => e.type === 'close-precheck' && e.verdict === 'satisfied'), 'the check ran again at the start of the resumed leg');
  assert.equal(second.calls.length, 0, 'no worker round was bought: the finished step stands');
});

test('(b) check-timeout is a checkpoint outcome, like provider-red', () => {
  assert.ok(CHECKPOINT_OUTCOMES.includes('check-timeout'));
  assert.ok(CHECKPOINT_OUTCOMES.includes('provider-red'));
});

test('(c) the Run tab words: the limit comes from the run, never hardcoded, and Resume is offered', () => {
  const ok = { ok: true };
  const ended = (esc, resume = ok) => endedFor({ outcome: 'check-timeout', stopReason: null, spentUsd: 1, budgetUsd: 8, lastEscalation: esc }, { died: false, lastThing: null }, { resume });
  const dflt = ended({ category: 'close-timeout' });
  assert.equal(dflt.reason, 'Your tests did not finish inside 30 minutes, so nothing was judged. Resume runs them again.');
  assert.equal(CHECK_LIMIT_MS, 30 * 60_000, 'the default words name the one check limit');
  assert.deepEqual(dflt.actions.map((a) => a.id), ['resume', 'reuse']);
  assert.equal(ended({ category: 'close-timeout', limitMs: 5 * 60_000 }).reason, 'Your tests did not finish inside 5 minutes, so nothing was judged. Resume runs them again.');
  assert.equal(ended({ category: 'close-timeout', limitMs: 45_000 }).reason, 'Your tests did not finish inside 45 seconds, so nothing was judged. Resume runs them again.');
  const noResume = ended({ category: 'close-timeout' }, { ok: false, why: 'too old' });
  assert.deepEqual(noResume.actions.map((a) => a.id), ['reuse']);
  assert.equal(statusFor({ outcome: 'check-timeout', died: false }).key, 'failed', 'same sign and word as provider-red');
  assert.deepEqual(statusFor({ outcome: 'check-timeout' }), statusFor({ outcome: 'provider-red' }));
});

