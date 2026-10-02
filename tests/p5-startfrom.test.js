// PANEL-BUILD.md P5 item 3 — START FROM THIS. The prefill (card.json -> the signed job), the CODE-OWNED same-job
// rule (only Source changed = same job: the signed spec is reused, nothing drafted), the track record (one run =
// one entry, a two-leg run counts ONCE), and card.json written at sign-prepare. Real readers, real sessions with
// the model boundary stubbed (no network), scratch homes only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createPanelServer, getStartFrom, startFromCheck, trackRecordFor, startFromLine } from '../src/panel/server.js';
import {
  createSession, isSameJob, cardFields, CARD_FIELDS, validateSameJobCard,
} from '../src/panel/authorsession.js';
import { classGuards } from '../src/authoring.js';
import { keyRows } from '../src/providerrows.js';
import { appendRun } from '../src/runlist.js';
import { jobSpecHash } from '../src/job.js';

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

test('prefill order: card.json first (verbatim); an older run with no card.json is filled from the signed job with the "not saved" note', () => {
  const home = tmp('p5-sf-h-');
  const card = baseCard({ jobName: SPEC.job, source: '/the/original/source', maxWallMs: 600000 });
  makeRun(home, { runid: 'withcard', spec: SPEC, card });
  makeRun(home, { runid: 'nocard', spec: SPEC });
  const a = getStartFrom('withcard', { home });
  assert.equal(a.ok, true);
  assert.equal(a.from, 'card.json');
  assert.equal(a.note, null);
  assert.deepEqual(a.card, cardFields(card), 'every box exactly as the person typed it');
  const b = getStartFrom('nocard', { home });
  assert.equal(b.from, 'signed job');
  assert.equal(b.note, 'filled from the signed job — success/guardrails/judge examples were not saved for this run');
  assert.equal(b.card.goal, SPEC.goal);
  assert.equal(b.card.jobName, SPEC.job);
  assert.equal(b.card.source, '/the/original/source');
  assert.equal(b.card.destination, 'src/');
  assert.equal(b.card.capUsd, 2);
  assert.equal(b.card.checkType, 'deterministic');
  assert.deepEqual([b.card.success, b.card.guardrails, b.card.judgeExamples], ['', '', ''], 'not recoverable: blank, never invented');
  assert.equal(getStartFrom('nope', { home }), null);
});

test('the same-job RULE (code-owned): only Source changed (or nothing) is the same job; EVERY other field is a new job', () => {
  const prefilled = baseCard({ jobName: 'j', maxWallMs: 600000 });
  assert.equal(isSameJob(prefilled, prefilled), true, 'nothing changed');
  assert.equal(isSameJob({ ...prefilled, source: '/another/folder' }, prefilled), true, 'only Source changed');
  for (const [field, value] of [
    ['goal', 'a different goal'], ['success', 'something else'], ['guardrails', 'none'], ['judgeExamples', 'an example'],
    ['model', 'deepseek-flash'], ['capUsd', 9], ['maxWallMs', 1], ['destination', 'lib/'], ['checkType', 'rubric'], ['jobName', 'other'],
  ]) {
    assert.equal(isSameJob({ ...prefilled, [field]: value }, prefilled), false, `${field} changed -> a new job`);
  }
  assert.equal(isSameJob({ ...prefilled, goal: `  ${prefilled.goal} ` }, prefilled), true, 'whitespace around a string is not a change');
  assert.equal(isSameJob({ ...prefilled, maxWallMs: undefined }, { ...prefilled, maxWallMs: undefined }), true);
});

test('track record: one run = ONE entry (a two-leg run counts once, its FINAL outcome); a live run and a different job are excluded; the line is code-owned text', async () => {
  const home = tmp('p5-sf-h-');
  const kid = sleepingRunner();
  makeRun(home, { runid: 'g1', spec: SPEC, outcome: 'green', spent: 1 });
  makeRun(home, { runid: 'g2two', spec: SPEC, outcome: 'green', spent: 1, twoLegs: true });
  makeRun(home, { runid: 'r1', spec: SPEC, outcome: 'step-red', spent: 0.4 });
  makeRun(home, { runid: 'live1', spec: SPEC, outcome: null, spent: 0.1, pid: kid.pid });
  makeRun(home, { runid: 'other', spec: { ...SPEC, goal: 'a different job' }, outcome: 'green', spent: 9 });
  const rec = trackRecordFor(jobSpecHash(SPEC), { home });
  assert.deepEqual({ green: rec.green, notGreen: rec.notGreen, live: rec.live }, { green: 2, notGreen: 1, live: 1 }, 'the two-leg run is one green, not two entries');
  assert.ok(Math.abs(rec.avgSpendUsd - (1 + 1 + 0.4) / 3) < 1e-9, `average over the 3 FINISHED runs, got ${rec.avgSpendUsd}`);
  assert.equal(startFromLine(true, rec), 'Same job — 2 green · 1 not green · about $0.80 a run');
  assert.equal(startFromLine(false, rec), 'Changed — new job, starts clean');
  // the check, end to end through the real reader
  const card = baseCard({ jobName: SPEC.job, maxWallMs: 600000, source: '/the/original/source' });
  writeFileSync(join(makeRun(home, { runid: 'c1', spec: SPEC }).out, 'card.json'), JSON.stringify(cardFields(card)));
  const same = startFromCheck('c1', { ...card, source: '/elsewhere' }, { home });
  assert.equal(same.same, true);
  assert.match(same.line, /^Same job — 3 green · 1 not green · about \$/, 'the c1 run itself is now one more green on the same hash');
  const changed = startFromCheck('c1', { ...card, goal: 'something new' }, { home });
  assert.equal(changed.same, false);
  assert.equal(changed.line, 'Changed — new job, starts clean');
});

test('SAME job: the origin\'s signed spec is reused, NOTHING is drafted ($0), the hash is the origin\'s; a CHANGED job drafts', async () => {
  const repo = makeRepo();
  const { session: origin } = await draftedSession(baseCard({ source: repo, jobName: 'p5-sf-same-1' }));
  const originSpec = JSON.parse(readFileSync(join(origin.state.outDir, 'resolved-spec.json'), 'utf8'));
  const originHash = jobSpecHash(originSpec);

  // the same job: any model/draft call throws, the signing stub returns the origin's hash
  let signingCalls = 0;
  const calls = { n: 0 };
  const repo2 = makeRepo(); // a DIFFERENT source — the one thing a same-job start may change
  const same = createSession(baseCard({ source: repo2, jobName: 'p5-sf-same-1' }), {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHomeWith(), keysRoot: tmp('p5-sf-sess-'),
    sameJob: { spec: originSpec, specHash: originHash },
    scout: { state: 'PRESENT', facts: { sourcePaths: [], testPaths: [] }, calls: [], raws: [] },
    generate: async () => { calls.n += 1; throw new Error('a same-job start must never call the model'); },
    confirmGenerate: async () => { calls.n += 1; throw new Error('a same-job start must never call the model'); },
    authorFn: async () => { calls.n += 1; throw new Error('a same-job start must never author'); },
    prepareSigningFn: async (o) => { signingCalls += 1; return fakePrepareSigningFn(jobSpecHash(o.spec))(); },
  });
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(same.state.phase)));
  assert.equal(same.state.phase, 'prepared', String(same.state.error));
  assert.equal(calls.n, 0, 'zero model calls: drafting spent $0');
  assert.equal(signingCalls, 1, 'the signing gates still run on the fresh copy');
  assert.equal(same.state.specHash, originHash, 'same hash');
  assert.deepEqual(JSON.parse(readFileSync(join(same.state.outDir, 'resolved-spec.json'), 'utf8')), originSpec, 'the signed spec is copied as it is');
  assert.equal(same.state.draftSpentUsd, 0);
  assert.ok(existsSync(join(same.state.outDir, 'card.json')), 'card.json is written for this session too');
  assert.equal(same.state.pendingAsk, null, 'no confirm turn: nothing to answer');

  // a hash that drifted from the signed job is refused, never signed
  const drift = createSession(baseCard({ source: repo2, jobName: 'p5-sf-same-1' }), {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHomeWith(), keysRoot: tmp('p5-sf-sess-'),
    sameJob: { spec: originSpec, specHash: originHash },
    prepareSigningFn: fakePrepareSigningFn('0000000000000000'),
  });
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(drift.state.phase)));
  assert.equal(drift.state.phase, 'refused');
  assert.match(drift.state.error, /different hash/);

  // a CHANGED job (no sameJob handed in) drafts: the confirm-turn model IS called
  const changed = await draftedSession(baseCard({ source: repo2, jobName: 'p5-sf-changed-1', goal: 'a new goal' }));
  assert.ok(changed.calls.n >= 1, 'a changed job drafts from clean');
});

test('validateSameJobCard: success/guardrails/judge boxes are NOT required (the signed job carries them); Source, Model and Cap are', () => {
  assert.deepEqual(validateSameJobCard(baseCard({ success: '', guardrails: '', goal: '' }), { rows: ROWS }), { ok: true });
  assert.equal(validateSameJobCard(baseCard({ source: ' ' }), { rows: ROWS }).ok, false);
  assert.equal(validateSameJobCard(baseCard({ model: 'nope' }), { rows: ROWS }).ok, false);
  assert.equal(validateSameJobCard(baseCard({ capUsd: 0 }), { rows: ROWS }).ok, false);
});

// ── over a real socket: the routes ───────────────────────────────────────────────────────────────────────────
test('routes: GET /api/author/start-from (guarded) prefills; POST start-from-check decides; POST start decides same vs changed on the SERVER', async (t) => {
  const home = keysHomeWith('ANTHROPIC_API_KEY=bad\tkey\n'); // a malformed key: every session refuses at $0, nothing is reached
  const card = baseCard({ jobName: SPEC.job, source: '/the/original/source', maxWallMs: 600000 });
  const { out } = makeRun(home, { runid: 'origin1', spec: SPEC, card });
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
  assert.equal(pre.from, 'card.json');
  assert.deepEqual(pre.card, cardFields(card));
  assert.equal(pre.sameJobAvailable, true);
  assert.match(pre.line, /^Same job — 1 green · 0 not green · about \$1\.00 a run$/);

  const chk = await (await post('/api/author/start-from-check', { runid: 'origin1', card: { ...card, goal: 'x' } })).json();
  assert.deepEqual({ same: chk.same, line: chk.line }, { same: false, line: 'Changed — new job, starts clean' });

  const sameStart = await (await post('/api/author/start', { ...card, source: '/some/other/source', startFrom: 'origin1' })).json();
  assert.equal(sameStart.ok, true);
  assert.equal(sameStart.sameJob, true, 'only Source changed: the server says same job');
  let phase = null;
  for (let i = 0; i < 100 && phase !== 'refused'; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    phase = (await (await get(`/api/author/${sameStart.sessionId}`)).json()).state.phase;
    // eslint-disable-next-line no-await-in-loop
    if (phase !== 'refused') await new Promise((r) => { setTimeout(r, 20); });
  }
  assert.equal(phase, 'refused', 'the malformed key refuses at $0 — nothing was spent');
});
