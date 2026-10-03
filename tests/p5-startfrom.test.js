// REUSE WORKFLOW (replaces PANEL-BUILD.md P5 item 3, hamr 2026-10-03). The prefill from the SIGNED job (locked boxes
// read by the Job tab's own readers), the four open boxes, the SERVER's refusal of a changed locked box, the reuse
// session (the signed spec copied with only the open fields set: NEW jobSpecHash, SAME workflowKey, nothing drafted),
// the track record by workflowKey (one run = one entry, a two-leg run counts ONCE), and card.json at sign-prepare. Real readers, real sessions with
// the model boundary stubbed (no network), scratch homes only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createPanelServer, getStartFrom, trackRecordFor, reuseLine } from '../src/panel/server.js';
import {
  createSession, cardFields, CARD_FIELDS, validateReuseCard, lockedFieldChanged, buildReuseSpec, REUSE_OPEN_FIELDS, REUSE_LOCKED_FIELDS,
} from '../src/panel/authorsession.js';
import { classGuards } from '../src/authoring.js';
import { keyRows } from '../src/providerrows.js';
import { appendRun } from '../src/runlist.js';
import { jobSpecHash, workflowKey } from '../src/job.js';

/** @type {string[]} */ const dirs = [];
/** @type {import('node:child_process').ChildProcess[]} */ const kids = [];
test.after(() => { for (const k of kids) { try { k.kill('SIGKILL'); } catch { /* gone */ } } for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'p5-sf-') => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };
const git = (dir, args) => execFileSync('git', args, {
  cwd: dir, encoding: 'utf8',
  env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
});
function makeRepo() {
  const dir = tmp('p5-sf-repo-');
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return dir;
}
const keysHomeWith = (text = 'ANTHROPIC_API_KEY=fake-not-a-real-key\n') => { const d = tmp('p5-sf-home-'); writeFileSync(join(d, '.env'), text, { mode: 0o600 }); return d; };
const ROWS = keyRows({ filled: ['ANTHROPIC_API_KEY'], config: {} });

const baseCard = (o = {}) => ({
  checkType: 'deterministic', model: 'claude-sonnet-5', jobName: 'p5-startfrom-job', goal: 'fix things', source: '/x',
  destination: 'src/', success: 'tsc clean', guardrails: 'no new deps', judgeExamples: '', capUsd: 2, ...o,
});

// ── the drafting seams (copied in shape from panel-author.test.js: the REAL confirm turn, the model stubbed) ──
function fakeDeclaration() {
  const g = classGuards({ verdictType: 'green', lang: 'js' }).map((x) => ({
    name: x.name, kind: x.kind, params: { ...x.params, ...(x.fill.includes('allowPrefixes') ? { allowPrefixes: ['src/'] } : {}) },
  }));
  return { stages: [g[0], { name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: ['-e', ''], expectExit: 0 } }, g[1]], notes: [] };
}
const fakeAuthorFn = () => async () => ({ ok: true, declaration: fakeDeclaration(), genreEnv: null, cost: { costUsd: 0.002, knownUsd: 0.002, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] });
const fakePrepareSigningFn = (hash) => async () => ({
  ok: true, specHash: hash, seedRef: 'deadbeef', work: [], guards: [], stops: [], reds: [], refusal: null,
  gates: { declaration: { ok: true, grounded: true }, precheck: { ok: true, stops: [] }, seedVerdict: { ok: true, workRed: ['verdict'], redAtSeed: ['verdict'], greenAtSeed: [] }, calibration: null },
});
function confirmGen(counter) {
  const plan = { goal: 'fix things v1', checks: ['tsc clean'], questions: [], notChecked: [] };
  return async (_c, tools) => { counter.n += 1; if (tools?.[0]?.execute) await tools[0].execute(plan); return { text: JSON.stringify(plan), error: null, cost: 0.0005 }; };
}
async function until(fn, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise((r) => { setTimeout(r, 10); }); } return false; }

/** a drafted session driven to `prepared` — yields a REAL valid resolved spec + the card.json beside it */
async function draftedSession(card) {
  const calls = { n: 0 };
  const session = createSession(card, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHomeWith(), keysRoot: tmp('p5-sf-sess-'),
    scout: { state: 'PRESENT', facts: { sourcePaths: ['src/mod.js'], testPaths: [] }, calls: [], raws: [] },
    generate: async () => { throw new Error('generate must not be called'); },
    confirmGenerate: confirmGen(calls),
    authorFn: fakeAuthorFn(),
    prepareSigningFn: fakePrepareSigningFn('cafef00dbeef0123'),
  });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), `menu ask (${session.state.phase} ${session.state.error})`);
  session.signPrepare();
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(session.state.phase)));
  assert.equal(session.state.phase, 'prepared', String(session.state.error));
  return { session, calls };
}

test('card.json round-trips: written beside resolved-spec.json at sign-prepare, the form text VERBATIM, stray body keys never stored', async () => {
  const repo = makeRepo();
  const card = baseCard({ source: repo, jobName: 'p5-sf-card-1', goal: '  keep my   odd spacing\n', maxWallMs: 600000, startFrom: 'someRun', stray: 'x' });
  const { session } = await draftedSession(card);
  const file = join(session.state.outDir, 'card.json');
  assert.ok(existsSync(file), 'card.json sits in the session dir, beside resolved-spec.json');
  assert.ok(existsSync(join(session.state.outDir, 'resolved-spec.json')));
  const got = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(got, cardFields(card));
  assert.equal(got.goal, card.goal, 'verbatim — no trimming, no rewrite');
  assert.equal(got.startFrom, undefined);
  assert.equal(got.stray, undefined);
  assert.deepEqual(Object.keys(got).sort(), CARD_FIELDS.filter((f) => card[f] !== undefined).sort());
});

/**
 * One listed run laid out the way a panel run is: `<out>/source-seed/<job>-bareloop/u-<runid>.jsonl`, the signed
 * spec at `<out>/resolved-spec.json`, optional card.json beside it. `legs`: array of arrays of records.
 */
function makeRun(home, { runid, spec, card = null, outcome = 'green', spent = 1, pid = null, hash = null, twoLegs = false, out = null }) {
  const o = out ?? tmp('p5-sf-out-');
  const into = join(o, 'source-seed');
  const dir = join(into, `${spec.job}-bareloop`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(into, 'source.json'), JSON.stringify({ source: '/the/original/source', destination: 'src/' }));
  writeFileSync(join(o, 'resolved-spec.json'), JSON.stringify(spec));
  if (card) writeFileSync(join(o, 'card.json'), JSON.stringify(card));
  const sh = hash ?? jobSpecHash(spec);
  const ts = (n) => `2026-10-01T10:0${n}:00.000Z`;
  const recs = [{ type: 'job-start', job: spec.job, specHash: sh, budgetUsd: spec.budgetUsd, shape: 'plan', goal: spec.goal, ts: ts(0), seq: 1 }];
  if (twoLegs) {
    recs.push({ type: 'worker-round', kind: 'turn', costUsd: spent / 2, ts: ts(1), seq: 2 });
    recs.push({ type: 'job-end', outcome: 'cap-halt', spentUsd: spent / 2, spendComplete: true, ts: ts(2), seq: 3 });
    recs.push({ type: 'leg-resume', leg: 2, after: 'cap-halt', at: ts(3), ts: ts(3), seq: 4 });
    recs.push({ type: 'job-start', job: spec.job, specHash: sh, budgetUsd: spec.budgetUsd, priorSpentUsd: spent / 2, shape: 'plan', goal: spec.goal, ts: ts(3), seq: 5 });
    recs.push({ type: 'worker-round', kind: 'turn', costUsd: spent / 2, ts: ts(4), seq: 6 });
    recs.push({ type: 'job-end', outcome, spentUsd: spent, spendComplete: true, ts: ts(5), seq: 7 });
  } else {
    recs.push({ type: 'worker-round', kind: 'turn', costUsd: spent, ts: ts(1), seq: 2 });
    if (outcome) recs.push({ type: 'job-end', outcome, spentUsd: spent, spendComplete: true, ts: ts(5), seq: 3 });
  }
  const spine = join(dir, `u-${runid}.jsonl`);
  writeFileSync(spine, `${recs.map((r) => JSON.stringify(r)).join('\n')}\n`);
  if (!pid) { const old = new Date(Date.now() - 3 * 3600 * 1000); utimesSync(spine, old, old); }
  appendRun({ at: '2026-10-01T10:00:00.000Z', runid, job: spec.job, spine, patient: null, via: 'run-u', ...(pid ? { pid } : {}) }, { home });
  return { out: o, spine, specHash: sh };
}
const SPEC = { schema: 'job-v1', job: 'p5-startfrom-job', description: 'd', provider: 'anthropic-api', budgetUsd: 2, maxWallMs: 600000, goal: 'fix things', verdictType: 'green', writeScope: ['src/'], tools: ['read'] };
function sleepingRunner() {
  const d = tmp('p5-sf-runner-');
  const f = join(d, 'run-u.mjs');
  writeFileSync(f, 'setInterval(() => {}, 1000);\n');
  const c = spawn(process.execPath, [f], { stdio: 'ignore' });
  kids.push(c);
  return c;
}

/** a REAL, valid signed spec (the panel's own drafting path, model boundary stubbed) — cached: every test reuses it */
let realSpecP = null;
function realSpec() {
  realSpecP ??= draftedSession(baseCard({ source: makeRepo(), jobName: 'p5-sf-real', maxWallMs: 600000 })).then(({ session }) => JSON.parse(readFileSync(join(session.state.outDir, 'resolved-spec.json'), 'utf8')));
  return realSpecP;
}

test('prefill: the locked boxes are the SIGNED job read by the Job tab\'s own readers; the open four start at what the run had; card.json only supplies model/source/judge examples', async () => {
  const spec = await realSpec();
  const home = tmp('p5-sf-h-');
  const card = baseCard({ jobName: spec.job, source: '/typed/source', maxWallMs: 600000, model: 'claude-sonnet-5' });
  makeRun(home, { runid: 'withcard', spec, card });
  const a = getStartFrom('withcard', { home });
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(a.from, 'signed job');
  assert.deepEqual([...a.locked], [...REUSE_LOCKED_FIELDS]);
  assert.deepEqual([...a.open], ['source', 'destination', 'capUsd', 'maxWallMs']);
  assert.equal(a.card.goal, spec.goal, 'the signed goal, not the typed one');
  assert.equal(a.card.jobName, spec.job);
  assert.equal(a.card.checkType, 'deterministic');
  assert.equal(a.card.model, 'claude-sonnet-5');
  assert.notEqual(a.card.success, '', 'success comes from the spec\'s own stages');
  assert.ok(spec.closeDecl.stages.every((st) => a.card.success.includes(st.name)));
  assert.match(a.card.guardrails, /write fence|may only change/i);
  assert.equal(a.card.source, '/typed/source');
  assert.equal(a.card.destination, spec.writeScope.join(', '));
  assert.equal(a.card.capUsd, spec.budgetUsd);
  assert.equal(a.card.maxWallMs, spec.maxWallMs);
  assert.equal(a.workflowKey, workflowKey(spec));
  assert.equal(a.specHash, jobSpecHash(spec));
  // no card.json: source falls back to the run's own source.json
  makeRun(home, { runid: 'nocard', spec });
  assert.equal(getStartFrom('nocard', { home }).card.source, '/the/original/source');
  assert.equal(getStartFrom('nope', { home }), null);
});

test('prefill: a run whose signed job is not on disk is refused in words — nothing is drafted in its place', async () => {
  const spec = await realSpec();
  const home = tmp('p5-sf-h-');
  makeRun(home, { runid: 'stale', spec, hash: 'not-the-hash-it-ran-under' });
  const r = getStartFrom('stale', { home });
  assert.equal(r.ok, false);
  assert.match(r.error, /signed job is not on disk .* \+ New/);
});

test('lockedFieldChanged: only the four open boxes may differ; every other box is refused BY NAME', () => {
  const origin = baseCard({ jobName: 'j', maxWallMs: 600000, judgeExamples: '' });
  assert.deepEqual([...REUSE_OPEN_FIELDS].sort(), ['capUsd', 'destination', 'maxWallMs', 'source']);
  assert.equal(lockedFieldChanged(origin, origin), null, 'nothing changed');
  assert.equal(lockedFieldChanged({ ...origin, source: '/other', destination: 'lib/', capUsd: 9, maxWallMs: 1 }, origin), null, 'the four open boxes may all change');
  for (const [field, value, label] of [
    ['goal', 'another goal', 'Goal'], ['success', 'something else', 'Success'], ['guardrails', 'none', 'Guardrails'],
    ['judgeExamples', 'an example', 'Judge examples'], ['model', 'deepseek-flash', 'Model'], ['checkType', 'rubric', 'Check type'], ['jobName', 'other', 'Job name'],
  ]) {
    assert.equal(lockedFieldChanged({ ...origin, [field]: value }, origin), label, `${field} is locked`);
  }
  assert.equal(lockedFieldChanged({ ...origin, goal: ` ${origin.goal.slice(0, 3)}\n${origin.goal.slice(3)} ` }, origin), null, 'whitespace is not a change (a one-line input drops a goal\'s newlines)');
});

test('buildReuseSpec: a COPY of the signed spec with ONLY writeScope / budgetUsd / maxWallMs set — new jobSpecHash, SAME workflowKey', async () => {
  const spec = await realSpec();
  const before = JSON.stringify(spec);
  const got = buildReuseSpec(spec, { destination: 'lib/, docs/', capUsd: 7.5, maxWallMs: 123000 });
  assert.equal(JSON.stringify(spec), before, 'the origin is never mutated');
  assert.deepEqual(got.writeScope, ['lib/', 'docs/']);
  assert.equal(got.budgetUsd, 7.5);
  assert.equal(got.maxWallMs, 123000);
  assert.notEqual(jobSpecHash(got), jobSpecHash(spec), 'the caps and the fence are in the signed hash: a NEW hash to sign');
  assert.equal(workflowKey(got), workflowKey(spec), 'the workflow is the same');
  const { writeScope, budgetUsd, maxWallMs, ...restGot } = got;
  const { writeScope: w0, budgetUsd: b0, maxWallMs: m0, ...restSpec } = spec;
  assert.deepEqual(restGot, restSpec, 'every other field is byte-for-byte the origin\'s');
  assert.equal('maxWallMs' in buildReuseSpec(spec, { destination: 'src/', capUsd: 1 }), false, 'a blank Time cap is no wall, never a default');
});

test('track record is by WORKFLOW KEY: one run = ONE entry (a two-leg run counts once); caps and destination do not split it; a different goal and a live run are excluded; the line is code-owned', async () => {
  const spec = await realSpec();
  const home = tmp('p5-sf-h-');
  const kid = sleepingRunner();
  makeRun(home, { runid: 'g1', spec, outcome: 'green', spent: 1 });
  makeRun(home, { runid: 'g2two', spec, outcome: 'green', spent: 1, twoLegs: true });
  makeRun(home, { runid: 'r1', spec: { ...spec, budgetUsd: 9, writeScope: ['lib/'], maxWallMs: 1000 }, outcome: 'step-red', spent: 0.4 });
  makeRun(home, { runid: 'live1', spec, outcome: null, spent: 0.1, pid: kid.pid });
  makeRun(home, { runid: 'other', spec: { ...spec, goal: 'a different job' }, outcome: 'green', spent: 9 });
  const rec = trackRecordFor(workflowKey(spec), { home });
  assert.deepEqual({ green: rec.green, notGreen: rec.notGreen, live: rec.live }, { green: 2, notGreen: 1, live: 1 }, 'the run with other caps and another fence is the SAME workflow');
  assert.ok(Math.abs(rec.avgSpendUsd - (1 + 1 + 0.4) / 3) < 1e-9, `average over the 3 FINISHED runs, got ${rec.avgSpendUsd}`);
  assert.ok(Math.abs(rec.avgWallMs - (5 + 4 + 5) / 3 * 60000) < 1, `working time averaged over the 3 finished runs (a two-leg run counts its legs, not the gap), got ${rec.avgWallMs}`);
  assert.equal(rec.finished, 3);
  assert.equal(reuseLine(rec), 'Same job — 2 green · 1 not green · about $0.80 and 5 min a run');
});

test('reuseLine: what is unknown is SAID — never $0 or 0 min; a died run counts as not green but is left out of the averages', async () => {
  const spec = await realSpec();
  const home = tmp('p5-sf-h-');
  assert.equal(reuseLine({ green: 0, notGreen: 0, finished: 0, avgSpendUsd: null, avgWallMs: null }), 'Same job — 0 green · 0 not green · no finished run yet to price or time');
  assert.equal(reuseLine({ green: 1, notGreen: 0, finished: 1, avgSpendUsd: null, avgWallMs: null }), 'Same job — 1 green · 0 not green · cost and time not recorded');
  assert.equal(reuseLine({ green: 1, notGreen: 0, finished: 1, avgSpendUsd: 1.234, avgWallMs: null }), 'Same job — 1 green · 0 not green · about $1.23 a run, time not recorded');
  assert.equal(reuseLine({ green: 1, notGreen: 0, finished: 1, avgSpendUsd: null, avgWallMs: 19 * 60000 }), 'Same job — 1 green · 0 not green · about 19 min a run, cost not recorded');
  assert.equal(reuseLine({ green: 1, notGreen: 0, finished: 1, avgSpendUsd: 0.004, avgWallMs: 20000 }), 'Same job — 1 green · 0 not green · about <$0.01 and <1 min a run');
  assert.equal(reuseLine(null), 'Same job');
  // no run of this workflow yet
  assert.deepEqual(trackRecordFor(workflowKey(spec), { home }), { runs: 0, green: 0, notGreen: 0, live: 0, finished: 0, avgSpendUsd: null, avgWallMs: null });
  // a died run (no terminal) is not green, but no spend/time is invented for it
  makeRun(home, { runid: 'died', spec, outcome: null, spent: 0.5 });
  const rec = trackRecordFor(workflowKey(spec), { home });
  assert.deepEqual({ green: rec.green, notGreen: rec.notGreen, finished: rec.finished, avgSpendUsd: rec.avgSpendUsd, avgWallMs: rec.avgWallMs }, { green: 0, notGreen: 1, finished: 0, avgSpendUsd: null, avgWallMs: null });
  assert.equal(reuseLine(rec), 'Same job — 0 green · 1 not green · no finished run yet to price or time');
});

test('REUSE session: the signed spec is copied with only the open fields set, NOTHING is drafted ($0), the hash is NEW and the workflowKey is the origin\'s; a drifted spec is refused', async () => {
  const originSpec = await realSpec();
  const reuseSpec = buildReuseSpec(originSpec, { destination: 'lib/', capUsd: 4, maxWallMs: 300000 });
  const key = workflowKey(originSpec);
  let signingCalls = 0;
  const calls = { n: 0 };
  const repo2 = makeRepo();
  const reuse = createSession(baseCard({ source: repo2, jobName: originSpec.job, destination: 'lib/', capUsd: 4, maxWallMs: 300000 }), {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHomeWith(), keysRoot: tmp('p5-sf-sess-'),
    reuse: { spec: reuseSpec, workflowKey: key },
    scout: { state: 'PRESENT', facts: { sourcePaths: [], testPaths: [] }, calls: [], raws: [] },
    generate: async () => { calls.n += 1; throw new Error('a reuse must never call the model'); },
    confirmGenerate: async () => { calls.n += 1; throw new Error('a reuse must never call the model'); },
    authorFn: async () => { calls.n += 1; throw new Error('a reuse must never author'); },
    prepareSigningFn: async (o) => { signingCalls += 1; return fakePrepareSigningFn(jobSpecHash(o.spec))(); },
  });
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(reuse.state.phase)));
  assert.equal(reuse.state.phase, 'prepared', String(reuse.state.error));
  assert.equal(calls.n, 0, 'zero model calls: drafting spent $0');
  assert.equal(signingCalls, 1, 'the signing gates still run on the fresh copy');
  assert.equal(reuse.state.specHash, jobSpecHash(reuseSpec), 'the hash the person signs is the reuse spec\'s own');
  assert.notEqual(reuse.state.specHash, jobSpecHash(originSpec));
  const written = JSON.parse(readFileSync(join(reuse.state.outDir, 'resolved-spec.json'), 'utf8'));
  assert.deepEqual(written, reuseSpec);
  assert.equal(workflowKey(written), key);
  assert.equal(reuse.state.draftSpentUsd, 0);
  assert.equal(reuse.state.pendingAsk, null, 'no confirm turn: nothing to answer');

  // a spec that differs from the workflow beyond the open fields is refused, never signed
  const drift = createSession(baseCard({ source: repo2, jobName: originSpec.job }), {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHomeWith(), keysRoot: tmp('p5-sf-sess-'),
    reuse: { spec: { ...reuseSpec, goal: 'smuggled goal' }, workflowKey: key },
    prepareSigningFn: async () => { throw new Error('signing must not be reached'); },
  });
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(drift.state.phase)));
  assert.equal(drift.state.phase, 'refused');
  assert.match(drift.state.error, /not the signed workflow/);
});

test('validateReuseCard: goal/success/guardrails/judge boxes are NOT required (the signed job carries them); Source, Destination, Model and Cap are', () => {
  assert.deepEqual(validateReuseCard(baseCard({ success: '', guardrails: '', goal: '' }), { rows: ROWS }), { ok: true });
  assert.equal(validateReuseCard(baseCard({ source: ' ' }), { rows: ROWS }).ok, false);
  assert.equal(validateReuseCard(baseCard({ destination: ' ' }), { rows: ROWS }).ok, false);
  assert.equal(validateReuseCard(baseCard({ model: 'nope' }), { rows: ROWS }).ok, false);
  assert.equal(validateReuseCard(baseCard({ capUsd: 0 }), { rows: ROWS }).ok, false);
});

// ── over a real socket: the routes ───────────────────────────────────────────────────────────────────────────
test('routes: GET start-from (guarded) prefills with locked/open; POST start REFUSES a changed locked box by name and accepts the four open ones; start-from-check is gone', async (t) => {
  const spec = await realSpec();
  const home = keysHomeWith('ANTHROPIC_API_KEY=bad key'); // a malformed key: every session refuses at $0, nothing is reached
  const { out } = makeRun(home, { runid: 'origin1', spec, card: baseCard({ jobName: spec.job, source: '/the/original/source' }) });
  void out;
  const { close, port, token } = await createPanelServer({ port: 0, env: {}, home, keysRoot: tmp('p5-sf-sess-') });
  t.after(() => close());
  const base = `http://127.0.0.1:${port}`;
  const get = (p, withToken = true) => fetch(`${base}${p}`, { headers: withToken ? { 'x-bareloop-token': token } : {} });
  const post = (p, body) => fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bareloop-token': token }, body: JSON.stringify(body) });

  assert.equal((await get('/api/author/start-from?runid=origin1', false)).status, 403, 'new disk exposure: the human guard');
  assert.equal((await get('/api/author/start-from?runid=nope')).status, 404);
  const pre = await (await get('/api/author/start-from?runid=origin1')).json();
  assert.equal(pre.ok, true);
  assert.deepEqual(pre.open, ['source', 'destination', 'capUsd', 'maxWallMs']);
  assert.ok(pre.locked.includes('goal') && pre.locked.includes('success') && !pre.locked.includes('capUsd'));
  assert.equal(pre.workflowKey, workflowKey(spec));
  assert.match(pre.line, /^Same job — 1 green · 0 not green · about \$1\.00 and 5 min a run$/);
  assert.equal('sameJobAvailable' in pre, false);

  assert.equal((await post('/api/author/start-from-check', { runid: 'origin1', card: pre.card })).status, 404, 'the "changed — new job" check is gone');

  // every locked box refused by name — the server never trusts the page
  for (const [field, value, label] of [['goal', 'smuggled', 'Goal'], ['success', 'nothing', 'Success'], ['guardrails', 'none', 'Guardrails'], ['model', 'deepseek-flash', 'Model'], ['checkType', 'rubric', 'Check type'], ['jobName', 'other-name', 'Job name']]) {
    // eslint-disable-next-line no-await-in-loop
    const r = await post('/api/author/start', { ...pre.card, [field]: value, startFrom: 'origin1' });
    // eslint-disable-next-line no-await-in-loop
    const j = await r.json();
    assert.equal(r.status, 400, field);
    assert.equal(j.error, `${label} is locked on a reused workflow — use + New to change it`, field);
  }

  const ok = await (await post('/api/author/start', { ...pre.card, source: '/some/other/source', destination: 'lib/', capUsd: 3, maxWallMs: 120000, startFrom: 'origin1' })).json();
  assert.equal(ok.ok, true);
  assert.equal(ok.reuse, true, 'the four open boxes may change: a reuse session starts');
  let phase = null;
  for (let i = 0; i < 100 && phase !== 'refused'; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    phase = (await (await get(`/api/author/${ok.sessionId}`)).json()).state.phase;
    // eslint-disable-next-line no-await-in-loop
    if (phase !== 'refused') await new Promise((r) => { setTimeout(r, 20); });
  }
  assert.equal(phase, 'refused', 'the malformed key refuses at $0 — nothing was spent');

  // a destination the fence validator rejects is a 400 at $0, before any session exists
  const badFence = await post('/api/author/start', { ...pre.card, destination: '../outside', startFrom: 'origin1' });
  assert.equal(badFence.status, 400);
});
