// The still-running note (hamr, 2026-11-21): after 5 minutes of a check running, every minute, "Tests are still running
// (7 min so far)." and, once that same command has a measured time earlier in this draft/run, ", usually about 12 min".
// Times come from injected ctx fields at the PRODUCTION RATIO: the note starts at 5/30 of the limit and repeats every
// 1/30 of it. Nothing here waits real minutes, and no number is spelled twice: the constants are read off the module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import * as kinds from '../src/kinds.js';
import { createSession } from '../src/panel/authorsession.js';
import { makeRangeWorld } from './range-world.mjs';
import { world, keysHome, draftSeams, until, baseCard } from './flowtype-world.mjs';
import { gitInPatient } from './helpers.js';
import path from 'node:path';

const MIN = 60_000;
/** one minute of production time, scaled: the whole run is 1/200 of real time */
const SCALE = 1 / 200;
const LIMIT_T = kinds.CHECK_LIMIT_MS * SCALE;
const AFTER_T = kinds.CHECK_NOTE_AFTER_MS * SCALE;
const EVERY_T = kinds.CHECK_NOTE_EVERY_MS * SCALE;

test('the note starts at 5 of the 30 minutes and repeats every minute', () => {
  assert.equal(kinds.CHECK_NOTE_AFTER_MS / kinds.CHECK_LIMIT_MS, 5 / 30);
  assert.equal(kinds.CHECK_NOTE_EVERY_MS, MIN);
});

test('the words: minutes so far, and "usually about N min" only once a time was measured', () => {
  assert.equal(kinds.checkRunningNote({ elapsedMs: 7 * MIN + 3_000, knownMs: null }), 'Tests are still running (7 min so far).');
  assert.equal(kinds.checkRunningNote({ elapsedMs: 7 * MIN, knownMs: 12 * MIN }), 'Tests are still running (7 min so far), usually about 12 min.');
  assert.equal(kinds.checkRunningNote({ elapsedMs: 5 * MIN, knownMs: 20_000 }), 'Tests are still running (5 min so far), usually about 1 min.', 'a measured time under a minute rounds UP to one minute, never "0 min"');
});

function repo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'check-note-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  git('init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  git('add', '-A'); git('commit', '-q', '-m', 'seed');
  const seed = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim();
  return { dir, seed };
}
const slow = (ms) => ({ stages: [{ name: 'tests', kind: 'command-exit', params: { cmd: process.execPath, args: ['-e', `setTimeout(()=>{}, ${ms})`], expectExit: 0 } }] });

test('a check running past the note threshold reports each interval, never before it', async (t) => {
  const r = repo(t);
  const ticks = [];
  const rows = await kinds.seedRead(slow(AFTER_T + 4 * EVERY_T), {
    workdir: r.dir, seedRef: r.seed, gapKeep: '', timeoutMsDefault: LIMIT_T, tickAfterMs: AFTER_T, tickEveryMs: EVERY_T,
    onTick: (e) => ticks.push(e),
  });
  assert.equal(rows[0].verdict, 'green');
  assert.ok(ticks.length >= 3, `three or more notes over ${AFTER_T + 4 * EVERY_T} ms, got ${ticks.length}`);
  assert.ok(ticks[0].elapsedMs >= AFTER_T, `the first note comes at or after the threshold, got ${ticks[0].elapsedMs}`);
  assert.ok(ticks[1].elapsedMs - ticks[0].elapsedMs >= EVERY_T * 0.8, 'notes are one interval apart');
  assert.equal(ticks[0].knownMs, null, 'no measured time yet for this command');
});

test('a command that ends before the threshold says nothing', async (t) => {
  const r = repo(t);
  const ticks = [];
  await kinds.seedRead(slow(10), { workdir: r.dir, seedRef: r.seed, gapKeep: '', timeoutMsDefault: LIMIT_T, tickAfterMs: AFTER_T, tickEveryMs: EVERY_T, onTick: (e) => ticks.push(e) });
  await new Promise((res) => { setTimeout(res, AFTER_T + EVERY_T); });
  assert.equal(ticks.length, 0);
});

test('the SAME command carries its measured time into the next pass; a different one does not', async (t) => {
  const r = repo(t);
  const cmdTimes = new Map();
  const ctx = (ticks) => ({ workdir: r.dir, seedRef: r.seed, gapKeep: '', timeoutMsDefault: LIMIT_T, tickAfterMs: AFTER_T, tickEveryMs: EVERY_T, onTick: (e) => ticks.push(e), cmdTimes });
  const first = []; const second = []; const control = [];
  await kinds.seedRead(slow(AFTER_T + 2 * EVERY_T), ctx(first));
  assert.equal(first[0].knownMs, null);
  await kinds.seedRead(slow(AFTER_T + 2 * EVERY_T), ctx(second));
  assert.ok(second[0].knownMs >= AFTER_T + 2 * EVERY_T, `the second pass knows the first's measured time, got ${second[0].knownMs}`);
  await kinds.seedRead(slow(AFTER_T + 2 * EVERY_T + 1), ctx(control));
  assert.equal(control[0].knownMs, null, 'a command with different args is a different command');
});

// ── the two consumers ───────────────────────────────────────────────────────────────────────────────────────────────

async function panelWorld(t) {
  const w = await world(t, { serve: false });
  const wr = makeRangeWorld(t);
  writeFileSync(path.join(wr.repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  gitInPatient(wr.repo, ['add', '-A']);
  gitInPatient(wr.repo, ['commit', '-q', '-m', 'pkg']);
  return { w, repo: wr.repo };
}
const opts = (w, seams) => ({ env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot: path.join(w.base, 's'), ...seams });

test('panel, drafting: a check-running phase becomes the running step\'s one line', async (t) => {
  const { w, repo: src } = await panelWorld(t);
  const seams = draftSeams({});
  /** @type {any} */ let s;
  /** @type {any} */ let during = null;
  const inner = seams.authorFn;
  seams.authorFn = async (o) => { o.onPhase('author-call', { i: 0, of: 2 }); o.onPhase('check-running', { call: 'author', text: 'Tests are still running (7 min so far).' }); during = structuredClone(s.state.steps.findLast((x) => x.status === 'running')); return inner(o); };
  s = createSession(baseCard({ source: src }), opts(w, seams));
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu'), `${s.state.phase} ${s.state.error}`);
  s.signPrepare();
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(s.state.phase)));
  assert.equal(during?.detail, 'Tests are still running (7 min so far).', JSON.stringify([during, s.state.phase, s.state.error]));
});

test('panel, signing gates: the gates step line carries the note, and the gates get a tick seam and the session\'s map of times', async (t) => {
  const { w, repo: src } = await panelWorld(t);
  const seams = draftSeams({});
  /** @type {any} */ let s;
  /** @type {any} */ let during = null; let gotMap = false;
  const inner = seams.prepareSigningFn;
  seams.prepareSigningFn = async (o) => { gotMap = o.cmdTimes instanceof Map; o.onTick({ elapsedMs: 9 * MIN, knownMs: 12 * MIN }); during = structuredClone(s.state.steps.find((x) => x.id === 'gates')); return inner(o); };
  s = createSession(baseCard({ source: src }), opts(w, seams));
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu'), `${s.state.phase} ${s.state.error}`);
  s.signPrepare();
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(s.state.phase)));
  assert.ok(gotMap);
  assert.equal(during?.detail, 'Tests are still running (9 min so far), usually about 12 min.');
});

// ── the run: a declared check running long is announced on the spine, report-only ───────────────────────────────────
import { mkdirSync } from "node:fs";
import { runPlan } from '../src/planrun.js';
import { validateJob } from '../src/job.js';
import { classGuards } from '../src/authoring.js';
import { GENRE } from '../src/authorjob.js';
import { scriptedProvider, initPatientRepo } from './helpers.js';

test('runPlan: a declared check running past the note threshold emits check-running, and the run still greens', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'check-note-run-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  writeFileSync(join(dir, '.gitignore'), '.smoke/\n');
  const HOLD = Math.round(AFTER_T + 3 * EVERY_T);
  writeFileSync(join(dir, 'check.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./src/fix.js', import.meta.url).pathname;
await new Promise((r) => setTimeout(r, ${HOLD}));
process.exit(existsSync(p) && readFileSync(p, 'utf8').includes('ok') ? 0 : 1);\n`);
  initPatientRepo(dir);
  const guards = classGuards({ verdictType: 'green', lang: 'js' }).map((g) => ({ name: g.name, kind: g.kind, params: { ...g.params, ...(g.fill.includes('allowPrefixes') ? { allowPrefixes: ['src/'] } : {}) } }));
  const job = {
    schema: 'job-v1', job: 'check-note', description: 'a slow declared check', provider: 'anthropic-api', cadence: { unit: 'day', every: 1 }, budgetUsd: 1.5,
    writeScope: ['src/**'], goal: 'Create src/fix.js with an ok marker.', verdictType: 'green',
    closeDecl: { genre: GENRE, lang: 'js', stages: [guards[0], { name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: ['check.mjs'], expectExit: 0 } }, guards[1]] },
    tools: ['read', 'write', 'edit'], escalation: { mode: 'decision-ready' },
  };
  const jv = validateJob(job, { shellCapUsd: job.budgetUsd });
  assert.deepEqual(jv.reds, []);
  const PLAN = JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'write-fix', action: 'Create src/fix.js containing the ok marker.', tools: ['write'], rounds: 6, target: 'src/fix.js', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'verdict' }] }] });
  const provider = scriptedProvider([
    { text: 'scout' }, { text: PLAN },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(dir, 'src', 'fix.js'), content: '// ok\n' } }] },
    { text: 'wrote src/fix.js' },
  ]);
  const events = [];
  const outcome = await runPlan(jv.job, { workdir: dir, provider, emit: (type, data = {}) => { events.push({ type, ...data }); }, remainingUsd: () => 1.5, checkNote: { afterMs: AFTER_T, everyMs: EVERY_T } });
  assert.equal(outcome, 'green', JSON.stringify(events.filter((e) => e.type === 'escalation')));
  const notes = events.filter((e) => e.type === 'check-running');
  assert.ok(notes.length >= 2, `the slow check is announced more than once, got ${notes.length}`);
  assert.ok(notes[0].elapsedMs >= AFTER_T);
  assert.match(notes[0].text, /^Tests are still running \(\d+ min so far\)/);
  assert.ok(notes.some((n) => typeof n.knownMs === 'number'), 'a later pass of the same command knows how long it took');
});
