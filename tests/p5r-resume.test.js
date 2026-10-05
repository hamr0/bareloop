// P5-R (hamr 2026-10-02: "one run, one id, one file ... never two") — the WRITER. A resume continues the SAME
// run: same runid, same spine file, a `leg-resume` marker first, `seq` continuing, one run-list row with a
// `leg-start` beside it. Driven in-process through `resumeRun` with a scratch home (never the real one) and a
// scripted provider; the torn tail uses a REAL child process killed mid-append.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { resumeRun } from '../src/userrun.js';
import { readRunList, appendRun, isSettled } from '../src/runlist.js';
import { updateConfig } from '../src/config.js';
import { legsOf, parseSpineText } from '../src/legs.js';
import { scriptedProvider } from './helpers.js';

/** @param {import('node:test').TestContext} t */
const tmp = (t) => {
  const d = mkdtempSync(join(tmpdir(), 'p5r-resume-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const git = (/** @type {string} */ cwd, /** @type {string[]} */ args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const CLOSE_SOURCE = "console.log('FIXTURE judged=1');\nprocess.exit(1);\n";

/** a patient repo + a signed spec + the halted leg-1 spine the resume continues */
function fixture(t, { tornTail = false } = {}) {
  const workdir = tmp(t);
  mkdirSync(join(workdir, 'src'), { recursive: true });
  writeFileSync(join(workdir, 'src', 'mod.mjs'), 'export const x = 1;\n');
  git(workdir, ['init', '-q']);
  git(workdir, ['config', 'user.email', 'p5r@example.com']);
  git(workdir, ['config', 'user.name', 'p5r']);
  git(workdir, ['add', '.']);
  git(workdir, ['commit', '-q', '-m', 'seed']);
  const seed = git(workdir, ['rev-parse', 'HEAD']);
  const scripts = tmp(t);
  const closePath = join(scripts, 'close.mjs');
  writeFileSync(closePath, CLOSE_SOURCE);
  const spec = {
    schema: 'job-v1', job: 'p5r-fixture', description: 'P5-R writer fixture.',
    provider: 'anthropic-api', cadence: { unit: 'day', every: 1 }, budgetUsd: 2, maxWallMs: 1_800_000,
    writeScope: ['src/**'], goal: 'Append MARKER_OK to src/mod.mjs.', verdictType: 'green',
    close: [{ name: 'has-marker', cmd: `node ${closePath} has-marker`, expect: 0, sha256: hashCloseScriptBytes(CLOSE_SOURCE) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
  };
  const spineDir = tmp(t);
  const dead = join(spineDir, 'u-pr1.jsonl');
  const at = '2026-10-02T10:00:00.000Z';
  const recs = [
    { type: 'job-start', job: spec.job, specHash: jobSpecHash(spec), budgetUsd: 2, shape: 'plan', goal: spec.goal, ts: at, seq: 1 },
    { type: 'plan-accepted', plan: { schema: 'plan-v1', steps: [{ id: 's1' }] }, ts: at, seq: 2 },
    { type: 'worker-round', kind: 'turn', costUsd: 0.5, ts: at, seq: 3 },
    { type: 'job-end', outcome: 'cap-halt', spentUsd: 0.5, spendComplete: true, ts: '2026-10-02T10:20:00.000Z', seq: 4 },
  ];
  writeFileSync(dead, `${recs.map((e) => JSON.stringify(e)).join('\n')}\n`);
  return { workdir, seed, spec, dead, spineDir, at };
}

/** the resumed leg, in-process, scratch home */
async function resume(f, home) {
  /** @type {string[]} */ const errs = [];
  /** @type {string[]} */ const outs = [];
  const code = await resumeRun(f.dead, {
    spec: f.spec, workdir: f.workdir, seed: f.seed, spineName: 'p5r-fixture-bareloop', approve: jobSpecHash(f.spec),
    deps: { provider: scriptedProvider([{ text: 'x' }, { text: 'x' }, { text: 'x' }]), env: {}, out: (s) => outs.push(s), err: (s) => errs.push(s), runlistHome: home },
  });
  return { code, errs: errs.join('\n'), out: outs.join('\n') };
}

test('P5-R a resume is the SAME run: same file, no second spine, leg-resume FIRST, seq continues, the declared fold rides the leg\'s own job-start', async (t) => {
  const home = tmp(t);
  const f = fixture(t);
  appendRun({ at: f.at, runid: 'pr1', job: f.spec.job, spine: f.dead, patient: null, via: 'run-u', pid: 999999, capUsd: 2 }, { home });
  const before = readFileSync(f.dead, 'utf8');
  await resume(f, home);
  assert.deepEqual(readdirSync(f.spineDir).filter((n) => n.endsWith('.jsonl') && !n.includes('gate-audit') && !n.includes('lag')), ['u-pr1.jsonl'], 'no second spine file is ever minted');
  const after = readFileSync(f.dead, 'utf8');
  assert.ok(after.startsWith(before), 'every existing byte is untouched: the leg is an append');
  const recs = parseSpineText(after).records;
  const legs = legsOf(recs);
  assert.equal(legs.length, 2);
  assert.equal(legs[1].records[0].type, 'leg-resume', 'the leg\'s FIRST record is its marker');
  assert.equal(legs[1].records[0].leg, 2);
  assert.equal(legs[1].records[0].after, 'cap-halt', 'how the previous leg ended');
  assert.equal(legs[1].records[0].seq, 5, 'seq continues from the file\'s own highest');
  const seqs = recs.map((r) => r.seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), 'seq is monotonic across the whole file');
  assert.equal(new Set(seqs).size, seqs.length, 'and never repeats');
  assert.equal(legs[1].jobStart?.priorSpentUsd, 0.5, 'the leg\'s own job-start keeps the declared fold (the ceiling still folds prior spend)');
});

test('P5-R the run list keeps ONE row: a resume appends a leg-start (the leg\'s pid and remaining cap) and the fold reads the latest leg', async (t) => {
  const home = tmp(t);
  const f = fixture(t);
  appendRun({ at: f.at, runid: 'pr1', job: f.spec.job, spine: f.dead, patient: null, via: 'run-u', pid: 999999, capUsd: 2 }, { home });
  await resume(f, home);
  const raw = readFileSync(join(home, 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(raw.filter((r) => !r.type).length, 1, 'one run row, never a second');
  const ls = raw.filter((r) => r.type === 'leg-start');
  assert.equal(ls.length, 1);
  assert.equal(ls[0].leg, 2);
  assert.equal(ls[0].capUsd, 1.5, 'the leg cap is the signed cap less what the run already spent');
  assert.equal(ls[0].pid, process.pid);
  const { rows } = readRunList({ home });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].runid, 'pr1');
  assert.equal(rows[0].leg, 2);
  assert.equal(rows[0].pid, process.pid, 'the row\'s live pid and cap are the latest leg\'s');
  assert.equal(rows[0].capUsd, 1.5);
});

test('P5-R the claim is per leg: with a monthly limit the leg claims at the REMAINDER, and settling is per leg (leg 1\'s settle never settles leg 2)', async (t) => {
  const home = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  const f = fixture(t);
  appendRun({ at: new Date().toISOString(), runid: 'pr1', job: f.spec.job, spine: f.dead, patient: null, via: 'run-u', pid: 999999, capUsd: 2 }, { home });
  // leg 1 had settled itself when it ended
  const { appendRunEvent } = await import('../src/runlist.js');
  appendRunEvent({ runid: 'pr1', type: 'settled', by: 'pr1', spentUsd: 0.5, spendComplete: true, at: f.at }, { home });
  await resume(f, home);
  const { rows, events } = readRunList({ home });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].leg, 2);
  assert.equal(events.filter((e) => e.type === 'settled' && e.leg === 2).length, 1, 'the resumed leg settled ITS claim at its own end, tagged with its leg');
  assert.equal(isSettled(events, rows[0]), true);
  assert.equal(isSettled(events, { runid: 'pr1', leg: 3 }), false, 'a later leg is not settled by an earlier leg\'s note');
});

test('P5-R a REAL child killed mid-append leaves a torn tail: the resume writes one newline, keeps every byte, and the marker follows on its own line', async (t) => {
  const home = tmp(t);
  const f = fixture(t);
  const child = spawn(process.execPath, ['-e', `
    const fs = require('node:fs');
    const fd = fs.openSync(${JSON.stringify(f.dead)}, 'a');
    fs.writeSync(fd, '{"type":"worker-round","kind":"turn","costUsd":0.25,"ts":"2026-10-02T10:2');
    process.stdout.write('half\\n');
    setInterval(() => {}, 1000);
  `], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => { child.stdout.on('data', res); child.on('error', rej); });
  child.kill('SIGKILL');
  await new Promise((res) => child.on('exit', res));
  const torn = readFileSync(f.dead, 'utf8');
  assert.ok(!torn.endsWith('\n'), 'the file really ends mid-line');
  // the torn bytes sit AFTER the job-end here, so this leg-1 "terminal" is followed by a torn record; resume reads leg 1
  const { errs } = await resume(f, home);
  assert.match(errs, /ignoring a truncated final line/, 'the torn tail is tolerated and NAMED, never silent');
  const after = readFileSync(f.dead, 'utf8');
  assert.ok(after.startsWith(torn), 'the spine is append-only forever: the torn bytes are exactly as they were');
  assert.equal(after[torn.length], '\n', 'one newline, then the leg\'s own records');
  const lines = after.split('\n');
  const tornLine = lines.findIndex((l) => l.startsWith('{"type":"worker-round","kind":"turn","costUsd":0.25'));
  assert.equal(JSON.parse(lines[tornLine + 1]).type, 'leg-resume', 'the marker is the very next line');
  const parsed = parseSpineText(after);
  assert.equal(parsed.corrupt, null);
  assert.equal(legsOf(parsed.records).length, 2);
});

test('P5-R tripwire: the marker is emitted BEFORE the outside watchdog is spawned (it judges a run dead by its file going quiet)', () => {
  const src = readFileSync(new URL('../src/userrun.js', import.meta.url), 'utf8');
  const marker = src.indexOf('emit(LEG_RESUME');
  const spawnAt = src.indexOf('const watchdog = spawn(');
  assert.ok(marker > 0 && spawnAt > 0 && marker < spawnAt, 'leg-resume is written before spawn(watchdog)');
  assert.ok(src.indexOf('makeSpine(spineFile, { startSeq })') > 0, 'the emitter continues the file\'s own seq');
});

test('P5-R the end-of-run readout is about THIS leg: its own rounds, and an earlier leg\'s money-halt is not printed again', async (t) => {
  const home = tmp(t);
  const f = fixture(t);
  // leg 1 ended on a MONEY HALT with a priced round on the file; the leg that resumes it must not re-read either
  const lines = readFileSync(f.dead, 'utf8').trimEnd().split('\n');
  lines.splice(3, 0, JSON.stringify({ type: 'money-halt', remainingUsd: 0, budgetUsd: 2, verdict: 'needs_revision', trend: 'flat', reading: 'x', ts: f.at, seq: 3.5 }));
  writeFileSync(f.dead, `${lines.join('\n')}\n`);
  const r = await resume(f, home);
  assert.match(r.out, /\nrounds    0\b/, 'this leg bought no round — the earlier leg\'s one round is not this leg\'s');
  assert.doesNotMatch(r.out, /MONEY HALT/, 'the halt readout is the LATEST leg\'s only');
});
