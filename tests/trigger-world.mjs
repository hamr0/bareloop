// Shared fixture for the trigger suites (PANEL-BUILD.md T addendum, G.11). NOT named test-*.mjs (node's glob).
// A scratch HOME (the run-list home), an injectable clock, a real runs.jsonl writer, signed specs on disk laid out
// the way a panel run is, and a panel server over real HTTP. Nothing here touches ~/.config/bareloop.
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createScheduler } from '../src/panel/scheduler.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createPanelServer, getStartFrom } from '../src/panel/server.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStarter } from '../src/panel/schedulestart.js';
import { keysForDoor, keysHome as kHome } from '../src/keysfile.js';
import { rowsForHome } from '../src/providerrows.js';
import { readLedger } from '../src/triggerledger.js';
import { appendRun } from '../src/runlist.js';
import { jobSpecHash } from '../src/job.js';
import { ANTH_CFG } from './helpers.js';

// above Linux's hard pid ceiling (2^22): no process can hold it, so a fixture run reads as ended on any machine
export const DEAD_PID = 2 ** 22 + 1;
/** @type {string[]} */ const dirs = [];
test.after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
export const tmp = (p = 'tw-') => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };

/** a home holding the keys file and config.json with one ticked, priced model line */
export function keysHome() {
  const d = tmp('tw-home-');
  writeFileSync(join(d, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  writeFileSync(join(d, 'config.json'), JSON.stringify(ANTH_CFG));
  return d;
}

/** a fake clock the test moves by hand */
export function clock(start = Date.UTC(2026, 9, 14, 12, 0, 0)) {
  let t = start;
  const now = () => t;
  now.set = (ms) => { t = ms; };
  now.add = (ms) => { t += ms; };
  return now;
}

/** a valid signed spec: plain-files rubric (`files: true`) or a repo-shaped deterministic job */
export function specOf({ job = 'sched-job', files = false, goal = 'summarise the input', cap = 1.5, input = null, judge = true } = {}) {
  return {
    schema: 'job-v1', job, description: 'd', provider: 'anthropic-api', model: 'claude-sonnet-5', budgetUsd: cap, maxWallMs: 600000,
    writeScope: files ? ['output/'] : ['src/'], goal, verdictType: files ? 'soft-green' : 'green',
    close: [{ name: 'suite-green', cmd: 'npm test', expect: 0, sha256: 'a'.repeat(64) }],
    tools: ['read', 'grep', 'write', 'edit'], escalation: { mode: 'decision-ready' },
    // `judge: false` is the real shape of a panel-signed rubric job: no explicit judge (it defaults to the worker's)
    ...(files && judge ? { judge: { provider: 'anthropic-api', model: 'claude-sonnet-5' } } : {}),
    inputs: [{ n: 1, label: files ? 'notes' : 'repo', value: input ?? (files ? '/tw/in/notes.txt' : '/tw/repo') }],
  };
}

/**
 * One listed run, laid out the way a panel run is: the spine at `<out>/source-seed/<job>-bareloop/u-<runid>.jsonl`, the
 * signed spec at `<out>/resolved-spec.json`. `accepted` appends an honoured door-decision accept.
 */
export function makeRun(home, { runid, spec, outcome = 'green', accepted = false, at = '2026-10-01T10:00:00.000Z' }) {
  const out = tmp('tw-out-');
  const into = join(out, 'source-seed');
  const dir = join(into, `${spec.job}-bareloop`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(into, 'source.json'), JSON.stringify({ source: '/tw/in', destination: 'src/' }));
  writeFileSync(join(out, 'resolved-spec.json'), JSON.stringify(spec));
  const sh = jobSpecHash(spec);
  const ts = (n) => `2026-10-01T10:0${n}:00.000Z`;
  const recs = [
    { type: 'job-start', job: spec.job, specHash: sh, budgetUsd: spec.budgetUsd, shape: 'plan', goal: spec.goal, ts: ts(0), seq: 1 },
    { type: 'worker-round', kind: 'turn', costUsd: 0.5, ts: ts(1), seq: 2 },
    { type: 'job-end', outcome, spentUsd: 0.5, spendComplete: true, ts: ts(5), seq: 3 },
  ];
  if (accepted) recs.push({ type: 'door-decision', decision: 'accept', honoured: true, ts: ts(6), seq: 4 });
  const spine = join(dir, `u-${runid}.jsonl`);
  writeFileSync(spine, `${recs.map((r) => JSON.stringify(r)).join('\n')}\n`);
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  utimesSync(spine, old, old);
  appendRun({ at, runid, job: spec.job, spine, patient: null, via: 'run-u', pid: DEAD_PID }, { home });
  return { out, spine, specHash: sh };
}

/** a panel server over real HTTP on a scratch home; `post`/`get` carry the human-click token. */
export async function panel({ home, env = {}, spawnFn, now, sessionDeps, schedulerIntervalMs = 0, sessionsRoot = tmp('tw-sess-') } = {}) {
  const h = home ?? keysHome();
  const { close, port, token, schedules, scheduler } = await createPanelServer({ port: 0, env, home: h, schedulerIntervalMs, sessionsRoot, ...(spawnFn ? { spawnFn } : {}), ...(now ? { scheduleNow: now } : {}), ...(sessionDeps ? { sessionDeps } : {}) });
  test.after(() => close());
  const base = `http://127.0.0.1:${port}`;
  const hdr = { 'content-type': 'application/json', 'x-bareloop-token': token };
  return {
    home: h,
    sessionsRoot,
    schedules,
    scheduler,
    close,
    noToken: async (p, body) => { const r = await fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return r.status; },
    get: async (p) => { const r = await fetch(`${base}${p}`, { headers: hdr }); return { status: r.status, body: await r.json() }; },
    post: async (p, body) => { const r = await fetch(`${base}${p}`, { method: 'POST', headers: hdr, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; },
  };
}

/**
 * A recorded spawn: `spawns` holds every argv. `failWith` makes the child emit 'error' on the next turn (a launch failure).
 * @param {{failWith?: Error|null}} [o]
 */
export function recordingSpawn(o = {}) {
  /** @type {{cmd: string, args: string[]}[]} */
  const spawns = [];
  const fn = (cmd, args) => {
    spawns.push({ cmd, args });
    const handlers = {};
    const child = { unref() {}, once(ev, h) { handlers[ev] = h; return child; } };
    if (fn.failWith) setImmediate(() => handlers.error?.(fn.failWith));
    if (fn.exitWith !== undefined) setImmediate(() => handlers.exit?.(fn.exitWith, null));
    return child;
  };
  fn.failWith = o.failWith ?? null;
  fn.exitWith = o.exitWith;
  fn.spawns = spawns;
  return fn;
}

export const DAILY = { kind: 'daily', hour: 9, minute: 0 };
// local time, like the clock maths
export const SLOT = new Date(2026, 9, 14, 9, 0).getTime();
export const CLOCK = (o = {}) => ({ kind: 'clock', slot: SLOT, catchUp: false, missed: 0, ...o });

/** a signed schedule on a plain-files job; a door whose starter has a FAKE session factory and a recorded spawn */
export async function fireWorld({ when = DAILY, files = true, schedulerIntervalMs = 0 } = {}) {
  const home = keysHome();
  const inbox = tmp('tf-inbox-');
  const notes = join(tmp('tf-in-'), 'notes.txt');
  writeFileSync(notes, 'hello\n');
  const spec = specOf({ files, input: notes });
  makeRun(home, { runid: 'r1', spec, accepted: true });
  // the schedule clock: armed one hour BEFORE the slot, so the slot is the first one due
  const now = clock(SLOT - 3600_000);
  const p = await panel({ home, now, schedulerIntervalMs });
  const wh = when === 'files' ? { kind: 'new-file', folder: inbox } : when;
  const body = { runid: 'r1', when: wh, inputs: `notes: ${notes}`, destination: '/tw/out', capUsd: 1.5, maxWallMs: 600000 };
  const pre = await p.post('/api/author/schedule-prepare', body);
  assert.equal(pre.status, 200, JSON.stringify(pre.body));
  const set = await p.post('/api/author/schedule', { ...body, hash: pre.body.hash });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  const spawnFn = recordingSpawn();
  /** @type {any[]} */ const made = [];
  const startSession = async (card, reuse, inputs, o) => {
    const outDir = tmp('tf-sess-');
    const resolvedSpecPath = join(outDir, 'resolved-spec.json');
    writeFileSync(resolvedSpecPath, JSON.stringify(reuse.spec));
    const session = { state: { id: `s${made.length + 1}`, phase: 'prepared', specHash: jobSpecHash(reuse.spec), resolvedSpecPath, outDir }, abandon() {} };
    made.push({ card, reuse, inputs, o, session });
    return { ok: true, session };
  };
  const envNow = () => keysForDoor({ env: {}, keysHome: home }).env;
  const starter = createStarter({
    door: p.schedules, startSession, envNow, spawnFn, bareloopBin: '/x/bareloop.mjs', sessionsRoot: tmp('tf-root-'), home, childGraceMs: 40,
    rowsFor: () => rowsForHome(kHome(home), envNow()), startFrom: (runid) => getStartFrom(runid, { home }),
  });
  p.schedules.attachStarter(starter);
  const dir = join(home, 'triggers', 'sched-job');
  now.set(SLOT + 60_000);
  return {
    now, home, p, door: p.schedules, spawnFn, made, notes, inbox, spec, body, dir, ledger: join(dir, 'ledger.jsonl'), starter, startSession,
    rows: () => readLedger(join(dir, 'ledger.jsonl')).rows,
    sig: JSON.parse(readFileSync(join(dir, 'schedule.json'), 'utf8')).specHash,
  };
}

/**
 * Block (up to 3 s) until a just-spawned child has EXEC'd: before that, /proc/<pid>/cmdline still shows the parent's argv, so a runner
 * check would read it as "not a bareloop runner" (a race that shows only on a loaded machine).
 * @param {number} pid @param {string} name the script name the child runs
 */
export function waitExec(pid, name = 'run-u.mjs') {
  const t0 = Date.now();
  while (Date.now() - t0 < 3000) {
    try { if (readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(name)) return; } catch { return; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
  }
}

/** a files-job world on the REAL starter/session factory: the schedule is signed with a good destination, then its stored spec is made to carry `output/` */
export async function realWorld({ input = null, relative = true } = {}) {
  const home = keysHome();
  const notes = input ?? join(tmp('dc-in-'), 'notes.txt');
  if (!input) writeFileSync(notes, 'hello\n');
  const spec = specOf({ files: true, input: notes });
  const run = makeRun(home, { runid: 'r1', spec, accepted: true });
  const now = clock(SLOT - 3600_000);
  const p = await panel({ home, now, sessionsRoot: tmp('dc-sess-'), spawnFn: recordingSpawn() });
  const out = tmp('dc-out-');
  const body = { runid: 'r1', when: DAILY, inputs: `notes: ${notes}`, destination: out, capUsd: 1.5, maxWallMs: 600000 };
  const pre = await p.post('/api/author/schedule-prepare', body);
  assert.equal(pre.status, 200, JSON.stringify(pre.body));
  assert.equal((await p.post('/api/author/schedule', { ...body, hash: pre.body.hash })).status, 200);
  const dir = join(home, 'triggers', 'sched-job');
  if (relative) {
    // what the live schedule held: the spec's own fence output/ and no destination of its own
    const sf = join(dir, 'schedule.json');
    const sch = JSON.parse(readFileSync(sf, 'utf8'));
    delete sch.destination; // a schedule signed before the destination rode on it: the fence is all there is
    writeFileSync(sf, JSON.stringify(sch));
  }
  now.set(SLOT + 60_000);
  return { home, p, now, dir, notes, run, out, sessions: p.sessionsRoot, rows: () => readLedger(join(dir, 'ledger.jsonl')).rows };
}

