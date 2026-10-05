// PANEL-BUILD.md P3 — chat/authoring. Two layers, tested separately:
//
//   (a) the HTTP guard/dispatch layer (`src/panel/authorroutes.js`) against a
//       REAL listening socket (`createPanelServer`) — the human-click guard
//       (token + Origin/Host), one-session-at-a-time, and the $0 refusals
//       (bad job card, missing key) all go through real HTTP, real headers;
//   (b) the session engine (`src/panel/authorsession.js`) driven DIRECTLY
//       (not through HTTP) for the full draft -> revise -> prepared flow,
//       with `authorClose`'s own composer ladder and `prepareSigning`'s own
//       gates STUBBED (both have their own test suites — `tests/
//       authorjob.test.js`, `tests/authoring.test.js` — this file's job is
//       proving THIS build's new ask()-channel/revise-round/hash-matching
//       wiring, not re-proving those). `scout`/`generate`/`confirmGenerate`
//       are overridden too, so nothing here ever makes a real provider call.
//
// Every guard test below is RED-PROVEN: each one is run once with the guard
// removed/weakened (asserted to fail how a real defect would look) before
// the real assertion, per the build instruction ("must be able to fail").

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createPanelServer } from '../src/panel/server.js';
import { checkHumanGuard, signRun } from '../src/panel/authorroutes.js';
import { createSession, validateJobCard as rawValidateJobCard, jobNameTaken } from '../src/panel/authorsession.js';
import { keyRows } from '../src/providerrows.js';
import { classGuards } from '../src/authoring.js';
import { GENRE } from '../src/authorjob.js';

/** @type {string[]} */
const tmpDirs = [];
test.after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
function tmp(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

const git = (dir, args) => execFileSync('git', args, {
  cwd: dir,
  encoding: 'utf8',
  env: {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 'pa-test', GIT_AUTHOR_EMAIL: 'pa@test',
    GIT_COMMITTER_NAME: 'pa-test', GIT_COMMITTER_EMAIL: 'pa@test',
  },
});

/** a minimal real repo: package.json with NO deps (so missingDependencies
 * reads no gap) and one committed file — `prepareSource` copies only
 * git-tracked files, and `authorCloseForJob`'s own `seedFn` needs a real
 * HEAD to read. */
function makeRepo() {
  const dir = tmp('panel-author-repo-');
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return dir;
}

/** a repo whose package.json DECLARES a dependency (so `missingDependencies`
 * reads a real gap) but never gets a `node_modules` — build item 1's F182
 * mirror. `prepareSource` copies only git-tracked files, so any
 * `node_modules` a test created BEFORE `git add`/commit would never even
 * reach the copy this session works from — that is the point: only
 * creating one in the ORIGINAL repo after the session is already waiting
 * (mimicking a person running the printed install command) can resolve it. */
function makeRepoWithDeps() {
  const dir = tmp('panel-author-repo-deps-');
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', dependencies: { lodash: '^4.0.0' } }));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return dir;
}

/** a scratch keys/config home whose .env carries ONE filled key (Settings row) — the Anthropic
 * row by default, whose default Name `claude-sonnet-5` is what baseCard() picks in Chat. */
function keysHomeWith(text = 'ANTHROPIC_API_KEY=fake-not-a-real-key\n') {
  const d = tmp('panel-author-home-');
  writeFileSync(join(d, '.env'), text, { mode: 0o600 });
  return d;
}

/** the Settings rows a filled ANTHROPIC_API_KEY gives: Chat's Model menu */
const ROWS = keyRows({ filled: ['ANTHROPIC_API_KEY'], config: {} });
const validateJobCard = (card, opts = {}) => rawValidateJobCard(card, { rows: ROWS, ...opts });

const baseCard = (overrides = {}) => ({
  checkType: 'deterministic',
  model: 'claude-sonnet-5',
  jobName: 'panel-author-test-job',
  goal: 'fix things',
  source: '/tmp/does-not-matter-for-validateJobCard',
  destination: 'src/',
  success: 'tsc clean',
  guardrails: 'no new deps',
  judgeExamples: '',
  capUsd: 2,
  ...overrides,
});

// ---------------------------------------------------------------------------
// validateJobCard — $0, before a session is ever created
// ---------------------------------------------------------------------------

// fix (2026-09-28, hamr's ruling "one cap covers drafting + run"): the
// separate Drafting $ cap field is GONE — this supersedes the prior
// draftingCapUsd-is-required test above. Drafting now runs under the SAME
// `capUsd` every run does, so the one money-cap rule left is capUsd's own.
test('validateJobCard: RED-PROOF — an empty/zero/non-number Cap $ is refused; a real positive number is not; there is no separate drafting cap field', () => {
  for (const bad of [undefined, 0, -1, NaN, 'oops']) {
    const r = validateJobCard(baseCard({ capUsd: bad }));
    assert.equal(r.ok, false, `capUsd=${bad} must refuse`);
    assert.match(r.error, /\$ cap/);
  }
  assert.equal(validateJobCard(baseCard()).ok, true);
  // a card carrying the OLD draftingCapUsd field is accepted and ignored —
  // the field is dead, never read, never required.
  assert.equal(validateJobCard(baseCard({ draftingCapUsd: undefined })).ok, true);
});

test('validateJobCard: the Model must be a Name in Settings — a model no row names, or no rows at all, refuses ($0)', () => {
  assert.equal(validateJobCard(baseCard({ model: 'not-a-name' })).ok, false);
  assert.match(validateJobCard(baseCard({ model: 'gpt-x' })).error, /Names in Settings/);
  assert.equal(rawValidateJobCard(baseCard(), { rows: [] }).ok, false, 'no rows = nothing to pick');
  const two = keyRows({ filled: ['ANTHROPIC_API_KEY', 'MY_KEY'], config: { keys: { MY_KEY: { name: 'gpt-x', shape: 'openai-api', baseUrl: '' } } } });
  assert.equal(rawValidateJobCard(baseCard({ model: 'gpt-x' }), { rows: two }).ok, true, 'a Name typed in Settings is a valid Model');
});

test('validateJobCard: a taken job name refuses (P3 is new jobs only, Q4=A) — RED-PROOF against a fabricated jobs/ dir', () => {
  const jobsDir = tmp('panel-author-jobs-');
  writeFileSync(join(jobsDir, 'already-exists.json'), '{}');
  assert.equal(jobNameTaken('already-exists', { jobsDir }), true);
  assert.equal(jobNameTaken('brand-new-name', { jobsDir }), false);
  const r = validateJobCard(baseCard({ jobName: 'already-exists' }), { jobsDir });
  // the seam is server-side only: a client card's jobsDirOverride is ignored
  assert.equal(validateJobCard(baseCard({ jobName: 'already-exists', jobsDirOverride: '/nonexistent' }), { jobsDir }).ok, false);
  assert.equal(r.ok, false);
  assert.match(r.error, /already exists/);
});

test('validateJobCard: missing required fields refuse one at a time', () => {
  for (const field of ['jobName', 'goal', 'source', 'destination', 'success', 'guardrails']) {
    const r = validateJobCard(baseCard({ [field]: '' }));
    assert.equal(r.ok, false, `${field} empty must refuse`);
  }
  assert.equal(validateJobCard(baseCard({ checkType: 'rubric', judgeExamples: '' })).ok, false, 'rubric with no judge examples must refuse');
});

// ---------------------------------------------------------------------------
// checkHumanGuard — the token + Origin/Host check every /api/author/* route
// requires. RED-PROVEN: each assertion is checked to actually distinguish
// pass from fail (not just always return ok:true).
// ---------------------------------------------------------------------------

function fakeReq(headers) { return { headers }; }

test('checkHumanGuard RED-PROOF: right token + right Origin passes; wrong token, wrong Origin, and missing token/Origin+Host all refuse', () => {
  const o = { token: 'tok123', port: 4711 };
  assert.equal(checkHumanGuard(fakeReq({ 'x-bareloop-token': 'tok123', origin: 'http://127.0.0.1:4711' }), o).ok, true);
  // RED-PROOF: flip one bit of the right answer and confirm it actually reds —
  // if this test read `ok` on every input, the guard would prove nothing.
  assert.equal(checkHumanGuard(fakeReq({ 'x-bareloop-token': 'WRONG', origin: 'http://127.0.0.1:4711' }), o).ok, false);
  assert.equal(checkHumanGuard(fakeReq({ origin: 'http://127.0.0.1:4711' }), o).ok, false, 'no token header at all');
  assert.equal(checkHumanGuard(fakeReq({ 'x-bareloop-token': 'tok123', origin: 'http://evil.example:4711' }), o).ok, false, 'wrong Origin');
  assert.equal(checkHumanGuard(fakeReq({ 'x-bareloop-token': 'tok123', origin: 'http://127.0.0.1:9999' }), o).ok, false, 'right token, wrong port in Origin');
  assert.equal(checkHumanGuard(fakeReq({ 'x-bareloop-token': 'tok123' }), o).ok, false, 'no Origin and no Host either');
  assert.equal(checkHumanGuard(fakeReq({ 'x-bareloop-token': 'tok123', host: '127.0.0.1:4711' }), o).ok, true, 'Host fallback when a same-origin request carries no Origin header');
});

// ---------------------------------------------------------------------------
// signRun — the ONLY function that spawns. RED-PROVEN against a phase that
// is not 'prepared' and a hash that does not match.
// ---------------------------------------------------------------------------

function fakeSession(state) { return { state }; }

test('signRun RED-PROOF: refuses when not prepared, and when the hash does not match — never reaches spawnFn either way', () => {
  let spawnCalls = 0;
  const spawnFn = () => { spawnCalls += 1; return { unref: () => {} }; };
  const outDir = tmp('panel-author-signrun-');
  writeFileSync(join(outDir, 'resolved-spec.json'), '{}');

  const notPrepared = fakeSession({ phase: 'drafting', specHash: 'abc123', resolvedSpecPath: join(outDir, 'resolved-spec.json'), outDir, messages: [] });
  const r1 = signRun(notPrepared, 'abc123', { env: {}, spawnFn, bareloopBin: '/x/bin/bareloop.mjs' });
  assert.equal(r1.ok, false);
  assert.equal(spawnCalls, 0);

  const prepared = fakeSession({ phase: 'prepared', specHash: 'abc123', resolvedSpecPath: join(outDir, 'resolved-spec.json'), outDir, messages: [] });
  const r2 = signRun(prepared, 'WRONG-HASH', { env: {}, spawnFn, bareloopBin: '/x/bin/bareloop.mjs' });
  assert.equal(r2.ok, false);
  assert.match(r2.error, /hash mismatch/);
  assert.equal(spawnCalls, 0, 'a hash mismatch must never reach spawnFn');

  const r3 = signRun(prepared, 'abc123', { env: { FOO: 'bar' }, spawnFn, bareloopBin: '/x/bin/bareloop.mjs' });
  assert.equal(r3.ok, true);
  assert.equal(spawnCalls, 1);
  assert.equal(prepared.state.phase, 'signed');
});

test('signRun (hamr 2026-10-05): an accepted sign finishes the "signed hash" step and posts NO thread bubble', () => {
  const outDir = tmp('panel-author-signrun-step-');
  const specPath = join(outDir, 'resolved-spec.json');
  writeFileSync(specPath, '{}');
  const session = fakeSession({ phase: 'prepared', specHash: 'abc123', resolvedSpecPath: specPath, outDir, messages: [], steps: [{ id: 'hash', label: 'generating hash', status: 'done', detail: 'spec hash abc123' }] });
  const r = signRun(session, 'abc123', { env: {}, spawnFn: () => ({ unref: () => {} }), bareloopBin: '/x/bin/bareloop.mjs' });
  assert.equal(r.ok, true);
  assert.deepEqual(session.state.steps.at(-1), { id: 'signed', label: 'signed hash', status: 'done', detail: '' });
  assert.equal(session.state.messages.length, 0, 'the thread carries chat turns only');
});

test('signRun: exact argv, including "--approve <hash>" as a literal array element, never a shell string', () => {
  let captured = null;
  const spawnFn = (cmd, args, opts) => { captured = { cmd, args, opts }; return { unref: () => {} }; };
  const outDir = tmp('panel-author-signrun-argv-');
  const specPath = join(outDir, 'resolved-spec.json');
  writeFileSync(specPath, '{}');
  const session = fakeSession({ phase: 'prepared', specHash: 'deadbeef01', resolvedSpecPath: specPath, outDir, messages: [] });
  const r = signRun(session, 'deadbeef01', { env: { X: '1' }, spawnFn, bareloopBin: '/repo/bin/bareloop.mjs' });
  assert.equal(r.ok, true);
  assert.equal(captured.cmd, 'setsid');
  assert.ok(captured.args.includes('run-u'));
  assert.ok(captured.args.includes('--spec'));
  assert.ok(captured.args.includes(specPath));
  const approveIdx = captured.args.indexOf('--approve');
  assert.ok(approveIdx !== -1, '--approve must be a literal argv element');
  assert.equal(captured.args[approveIdx + 1], 'deadbeef01', '--approve is followed by the exact hash, nothing else');
  assert.equal(captured.opts.detached, true);
  assert.equal(captured.opts.env.X, '1');
});

// hamr's ruling 2026-09-28 ("one cap covers drafting + run") — signRun reads
// the session's OWN known drafting spend off state.draftSpentUsd (set by
// authorsession.js's onCall, off the same metered list the chat cost readout
// already used) and passes it as run-u's own --draft-spent-usd flag.
test('signRun: a session that spent $0.81 drafting passes --draft-spent-usd 0.81 to run-u', () => {
  let captured = null;
  const spawnFn = (cmd, args, opts) => { captured = { cmd, args, opts }; return { unref: () => {} }; };
  const outDir = tmp('panel-author-signrun-draft-');
  const specPath = join(outDir, 'resolved-spec.json');
  writeFileSync(specPath, '{}');
  const session = fakeSession({
    phase: 'prepared', specHash: 'deadbeef02', resolvedSpecPath: specPath, outDir, messages: [], draftSpentUsd: 0.81,
  });
  const r = signRun(session, 'deadbeef02', { env: {}, spawnFn, bareloopBin: '/repo/bin/bareloop.mjs' });
  assert.equal(r.ok, true);
  const flagIdx = captured.args.indexOf('--draft-spent-usd');
  assert.ok(flagIdx !== -1, '--draft-spent-usd must be a literal argv element when the session spent > 0 drafting');
  assert.equal(captured.args[flagIdx + 1], '0.81');
});

// hamr's ruling 2026-09-28 (2nd addendum, "drafting completeness travels
// with draftSpentUsd") — an INCOMPLETE session floor (draftSpendComplete:
// false) must pass --draft-spend-incomplete to run-u and read as a floor in
// the chat line, never as an exact figure.
test('signRun: an INCOMPLETE session floor (draftSpendComplete:false) passes --draft-spend-incomplete and posts no thread bubble', () => {
  let captured = null;
  const spawnFn = (cmd, args, opts) => { captured = { cmd, args, opts }; return { unref: () => {} }; };
  const outDir = tmp('panel-author-signrun-draftincomplete-');
  const specPath = join(outDir, 'resolved-spec.json');
  writeFileSync(specPath, '{}');
  const session = fakeSession({
    phase: 'prepared', specHash: 'deadbeef03', resolvedSpecPath: specPath, outDir, messages: [], draftSpentUsd: 0.81, draftSpendComplete: false,
  });
  const r = signRun(session, 'deadbeef03', { env: {}, spawnFn, bareloopBin: '/repo/bin/bareloop.mjs' });
  assert.equal(r.ok, true);
  assert.ok(captured.args.includes('--draft-spend-incomplete'), '--draft-spend-incomplete must be a literal argv element when the session\'s own floor was not exact');
  assert.equal(session.state.messages.length, 0, "no thread bubble: the floor still rides in argv, the chat cost readout owns the figure");
});

// a COMPLETE session (draftSpendComplete left at its default true) must
// never carry the incomplete flag — the common case stays exactly as before.
test('signRun: a complete session never passes --draft-spend-incomplete', () => {
  let captured = null;
  const spawnFn = (cmd, args, opts) => { captured = { cmd, args, opts }; return { unref: () => {} }; };
  const outDir = tmp('panel-author-signrun-draftcomplete-');
  const specPath = join(outDir, 'resolved-spec.json');
  writeFileSync(specPath, '{}');
  const session = fakeSession({
    phase: 'prepared', specHash: 'deadbeef04', resolvedSpecPath: specPath, outDir, messages: [], draftSpentUsd: 0.81, draftSpendComplete: true,
  });
  signRun(session, 'deadbeef04', { env: {}, spawnFn, bareloopBin: '/repo/bin/bareloop.mjs' });
  assert.ok(!captured.args.includes('--draft-spend-incomplete'));
});

test('signRun: a session with no drafting spend (0/undefined) omits --draft-spent-usd entirely — never a decorative 0', () => {
  let captured = null;
  const spawnFn = (cmd, args, opts) => { captured = { cmd, args, opts }; return { unref: () => {} }; };
  const outDir = tmp('panel-author-signrun-nodraft-');
  const specPath = join(outDir, 'resolved-spec.json');
  writeFileSync(specPath, '{}');
  const session = fakeSession({ phase: 'prepared', specHash: 'deadbeef03', resolvedSpecPath: specPath, outDir, messages: [] });
  const r = signRun(session, 'deadbeef03', { env: {}, spawnFn, bareloopBin: '/repo/bin/bareloop.mjs' });
  assert.equal(r.ok, true);
  assert.equal(captured.args.indexOf('--draft-spent-usd'), -1, 'a session that never drafted (state.draftSpentUsd absent) must never pass the flag');
});

// ---------------------------------------------------------------------------
// createAuthorRoutes over a REAL socket — the human-click guard end to end,
// one-session-at-a-time, and $0 refusals (bad card, missing key).
// ---------------------------------------------------------------------------

async function startAuthorServer(t, opts = {}) {
  const { server, port, token, close } = await createPanelServer({
    port: 0, sessionsRoot: opts.sessionsRoot ?? tmp('panel-author-sessions-'), env: opts.env ?? {}, home: opts.home ?? keysHomeWith(), fetchImpl: opts.fetchImpl,
  });
  t.after(() => close());
  const base = `http://127.0.0.1:${port}`;
  return { base, port, token, server };
}

test('POST /api/author/start RED-PROOF: no token refuses (403), right token + right Origin passes the guard (400 on a bad card, not 403)', async (t) => {
  const { base, token } = await startAuthorServer(t);
  const noToken = await fetch(`${base}/api/author/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(noToken.status, 403);
  const wrongOrigin = await fetch(`${base}/api/author/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bareloop-token': token, origin: 'http://evil.example' },
    body: '{}',
  });
  assert.equal(wrongOrigin.status, 403);
  const rightGuardBadCard = await fetch(`${base}/api/author/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bareloop-token': token },
    body: '{}',
  });
  assert.equal(rightGuardBadCard.status, 400, 'the guard passed — this is the CARD refusing, not the guard');
  const body = await rightGuardBadCard.json();
  assert.equal(body.ok, false);
});

test('POST /api/author/start: a body over 1 MiB is refused with 413 before any route sees it (uncapped-body memory DoS)', async (t) => {
  const { base, token } = await startAuthorServer(t);
  const big = 'x'.repeat(1024 * 1024 + 1024);
  let status = null;
  try {
    const res = await fetch(`${base}/api/author/start`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-bareloop-token': token }, body: big,
    });
    status = res.status;
  } catch { status = 'connection-reset'; }
  assert.ok(status === 413 || status === 'connection-reset', `oversize body must be refused, got ${status}`);
  // a normal small body still reaches the route (400 = the card refusing, not the cap)
  const ok = await fetch(`${base}/api/author/start`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-bareloop-token': token }, body: '{}',
  });
  assert.equal(ok.status, 400);
});

test('POST /api/author/start: a Model no Settings row names is refused at $0 (400); a row whose key value is malformed refuses inside the session, at $0', async (t) => {
  const repo = makeRepo();
  // (a) no row at all -> the card itself is refused
  const none = await startAuthorServer(t, { env: {}, home: keysHomeWith('ANTHROPIC_API_KEY=\n') });
  const r0 = await fetch(`${none.base}/api/author/start`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-bareloop-token': none.token }, body: JSON.stringify(baseCard({ source: repo })),
  });
  assert.equal(r0.status, 400);
  assert.match((await r0.json()).error, /Names in Settings/);
  // (b) a row exists but its value is malformed (a tab): the session refuses naming the key variable
  const { base, token } = await startAuthorServer(t, { env: {}, home: keysHomeWith('ANTHROPIC_API_KEY=sk-a\tb\n') });
  const res = await fetch(`${base}/api/author/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bareloop-token': token },
    body: JSON.stringify(baseCard({ source: repo })),
  });
  assert.equal(res.status, 200, 'start itself is accepted — the refusal is IN the session, at $0');
  const body = await res.json();
  assert.equal(body.ok, true);
  await new Promise((r) => { setTimeout(r, 50); });
  const state = await (await fetch(`${base}/api/author/${body.sessionId}`, { headers: { 'x-bareloop-token': token } })).json();
  assert.equal(state.state.phase, 'refused');
  assert.match(state.state.error, /ANTHROPIC_API_KEY contains a tab/);
});

test('createSession: the Model Name resolves to ITS row\'s key variable, not the built-in one (Chat reads Settings)', async () => {
  const repo = makeRepo();
  const home = keysHomeWith('MY_KEY=sk-a\tb\n');
  writeFileSync(join(home, 'config.json'), JSON.stringify({ keys: { MY_KEY: { name: 'gpt-x', shape: 'openai-api', baseUrl: 'https://gw.example/v1' } } }));
  const session = createSession(baseCard({ source: repo, model: 'gpt-x', jobName: 'panel-author-row-key' }), {
    env: { MY_KEY: 'sk-a\tb' }, home, sessionsRoot: tmp('panel-author-sess-rowkey-'),
  });
  const start = Date.now();
  while (!['refused', 'error'].includes(session.state.phase) && Date.now() - start < 3000) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 10); });
  }
  assert.equal(session.state.phase, 'refused');
  assert.match(session.state.error, /MY_KEY contains a tab/, 'the row\'s own variable is the one demanded (built-in would be OPENAI_API_KEY)');
});

test('one-session-at-a-time (build spec): a second Start is refused (409) while the first is still live', async (t) => {
  // a real (fake-valued) key so session 1 clears the $0 key door and stays
  // non-terminal (drafting/preparing) long enough for session 2's request to
  // observe it as live — env={} would refuse session 1 almost immediately
  // (a real race in the OTHER two /start tests, which is exactly what they
  // test) and this test would then prove nothing.
  const { base, token } = await startAuthorServer(t, { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' } });
  const repo = makeRepo();
  const first = await fetch(`${base}/api/author/start`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-bareloop-token': token }, body: JSON.stringify(baseCard({ source: repo })),
  });
  assert.equal(first.status, 200);
  const second = await fetch(`${base}/api/author/start`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-bareloop-token': token }, body: JSON.stringify(baseCard({ source: repo, jobName: 'panel-author-test-job-2' })),
  });
  assert.equal(second.status, 409);
});

test('no path from chat/send/revise to signing: /send and /revise refuse a "menu" pending ask (only sign-prepare/sign may act on it)', async (t) => {
  const { base, token } = await startAuthorServer(t, { env: {}, home: keysHomeWith('ANTHROPIC_API_KEY=sk-a\tb\n') });
  const repo = makeRepo();
  const started = await (await fetch(`${base}/api/author/start`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-bareloop-token': token }, body: JSON.stringify(baseCard({ source: repo })),
  })).json();
  // this session refuses at the missing-key door before any ask ever opens,
  // so send/revise have NOTHING pending — confirming they refuse with "no
  // ask pending" rather than silently succeeding on a session with no plan.
  const sendRes = await fetch(`${base}/api/author/${started.sessionId}/send`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-bareloop-token': token }, body: JSON.stringify({ text: 'hi' }),
  });
  const sendBody = await sendRes.json();
  assert.equal(sendBody.ok, false);
  const reviseRes = await fetch(`${base}/api/author/${started.sessionId}/revise`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-bareloop-token': token }, body: JSON.stringify({ text: 'hi' }),
  });
  const reviseBody = await reviseRes.json();
  assert.equal(reviseBody.ok, false);
});

// ---------------------------------------------------------------------------
// createSession, driven directly: the full draft -> revise -> prepared flow,
// with the composer (`authorFn`) and `prepareSigning` STUBBED — proving THIS
// build's ask()-channel/revise-round/hash wiring, not those libraries' own
// gates (which have their own suites).
// ---------------------------------------------------------------------------

/** a valid, minimal TYPES-genre declaration — the exact fixture shape
 * `tests/authorjob.test.js` uses against the real `prepareSigning`; reused
 * here only as a plausible RETURN VALUE for a stubbed `authorFn`. */
function fakeDeclaration() {
  const g = classGuards({ verdictType: 'green', lang: 'js' }).map((x) => ({
    name: x.name, kind: x.kind, params: { ...x.params, ...(x.fill.includes('allowPrefixes') ? { allowPrefixes: ['src/'] } : {}) },
  }));
  return {
    stages: [g[0], { name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: ['-e', ''], expectExit: 0 } }, g[1]],
    notes: [],
  };
}

/** a fake confirm-turn model boundary: `tools[0].execute(plan)` is exactly
 * what `askStructured` (src/authorflow.js) calls to accept a structured
 * reply — calling it directly here is driving the REAL confirm-turn tool
 * channel, not a re-implementation of it. */
function makeFakeConfirmGenerate(plans) {
  let i = 0;
  return async (_convo, tools) => {
    const plan = plans[Math.min(i, plans.length - 1)];
    i += 1;
    if (tools && tools[0] && typeof tools[0].execute === 'function') await tools[0].execute(plan);
    return { text: JSON.stringify(plan), error: null, cost: 0.0005 };
  };
}

function fakeAuthorFn() {
  return async () => ({
    ok: true,
    declaration: fakeDeclaration(),
    genreEnv: null,
    cost: { costUsd: 0.002, knownUsd: 0.002, spendComplete: true, calls: [], unpricedRounds: 0 },
    reds: [],
  });
}

function fakePrepareSigningFn(hash) {
  return async () => ({
    ok: true,
    specHash: hash,
    seedRef: 'deadbeef',
    work: [], guards: [], stops: [], reds: [], refusal: null,
    gates: {
      declaration: { ok: true, grounded: true }, precheck: { ok: true, stops: [] },
      seedVerdict: { ok: true, workRed: ['verdict'], redAtSeed: ['verdict'], greenAtSeed: [] },
      calibration: null,
    },
  });
}

test('createSession: RED-PROOF — with NO scout/generate override, the real (network-bound) path is reached and refuses at the language/scout step long before drafting, proving the override actually changes behaviour', async (t) => {
  const repo = makeRepo();
  const session = createSession(baseCard({ source: repo, jobName: 'panel-author-redproof-1' }), {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHomeWith(),
    sessionsRoot: tmp('panel-author-sess-redproof-'),
  });
  // give the async pipeline a moment to reach (and fail at) the real scout —
  // never asserted to reach 'prepared' here; this test exists ONLY to prove
  // that without the override below, this fixture does NOT sail through.
  await new Promise((r) => { setTimeout(r, 300); });
  assert.notEqual(session.state.phase, 'prepared', 'without the generate/scout override this must not reach prepared');
});

test('createSession end to end: draft -> 1 revise (Revise button semantics) -> prepared -> sign, driven by a fake generate', async (t) => {
  const repo = makeRepo();
  const specHash = 'cafef00dbeef0123';
  const plans = [
    { goal: 'fix things v1', checks: ['tsc clean'], questions: [], notChecked: [] },
    { goal: 'fix things v2 (revised)', checks: ['tsc clean', 'no new deps'], questions: [], notChecked: [] },
  ];
  const session = createSession(baseCard({ source: repo, jobName: 'panel-author-e2e-1' }), {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHomeWith(),
    sessionsRoot: tmp('panel-author-sess-e2e-'),
    scout: { state: 'PRESENT', facts: { sourcePaths: ['src/mod.js'], testPaths: [] }, calls: [], raws: [] },
    generate: async () => { throw new Error('the author/scout `generate` must never be called in this test — only confirmGenerate should be'); },
    confirmGenerate: makeFakeConfirmGenerate(plans),
    authorFn: fakeAuthorFn(),
    prepareSigningFn: fakePrepareSigningFn(specHash),
  });

  async function waitForAskKind(kind, timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (session.state.pendingAsk?.kind === kind) return true;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, 10); });
    }
    return false;
  }

  // worseThanBefore is RETIRED (hamr's ruling 2026-09-28) — no ask for it
  // any more, so the first (and only, for a non-ambiguous-language repo)
  // ask the confirm turn raises is the menu itself.
  assert.ok(await waitForAskKind('menu'), `expected a menu ask; got phase=${session.state.phase} error=${session.state.error}`);
  assert.equal(session.state.revisesLeft, 2, 'D3: 2 revises available before the first fix');

  // Revise (N left): the confirm turn's own 'fix' pick, chat text as the
  // correction — never reachable through the generic send().
  const badSend = session.send('this must be refused — menu picks never go through send');
  assert.equal(badSend.ok, false, 'RED-PROOF: send() must refuse a pending menu ask');
  const revised = await session.revise('tighten the scope');
  assert.equal(revised.ok, true);
  assert.ok(await waitForAskKind('menu'), 'round 2 must produce another menu ask');
  assert.equal(session.state.revisesLeft, 1, 'one revise was spent');
  assert.ok(session.state.messages.some((m) => m.role === 'you' && m.text === 'tighten the scope'));

  // click 1 — Sign & run's confirm pick. Never signs on its own.
  const prepped = session.signPrepare();
  assert.equal(prepped.ok, true);

  const start2 = Date.now();
  while (session.state.phase !== 'prepared' && session.state.phase !== 'refused' && session.state.phase !== 'error' && Date.now() - start2 < 5000) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 10); });
  }
  assert.equal(session.state.phase, 'prepared', `expected prepared, got ${session.state.phase} / ${session.state.error}`);
  assert.equal(session.state.specHash, specHash);
  assert.ok(existsSync(session.state.resolvedSpecPath));
  const resolved = JSON.parse(readFileSync(session.state.resolvedSpecPath, 'utf8'));
  assert.equal(resolved.goal, 'fix things v2 (revised)', 'the goal comes from the SECOND (revised) accepted plan');

  // now hand this real, driven-through-the-real-ask-channel session to
  // signRun — proving the two layers actually compose.
  let captured = null;
  const spawnFn = (cmd, args, opts) => { captured = { cmd, args, opts }; return { unref: () => {} }; };
  const signed = signRun(session, session.state.specHash, { env: {}, spawnFn, bareloopBin: '/repo/bin/bareloop.mjs', home: tmp('panel-author-signhome-') });
  assert.equal(signed.ok, true);
  assert.equal(session.state.phase, 'signed');
  assert.ok(captured.args.includes('--approve'));
  assert.equal(captured.args[captured.args.indexOf('--approve') + 1], specHash);
});

// ---------------------------------------------------------------------------
// Phone-width layout — static check (this harness has no browser/DOM driver
// available to it; a live 390px screenshot is left for a visual check
// before this build is used, per CLAUDE.md's own "verify in DevTools before
// claiming a UI task is done" — named honestly, not claimed as done here).
// ---------------------------------------------------------------------------

test('Chat tab CSS: the P3 job-card/cap-row/chat-thread rules use fluid widths (100%/flex/grid), never a fixed px width that would force horizontal scroll at 390px', () => {
  const html = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('.job-card.compact{');
  const end = html.indexOf('.actions-row > .btn{');
  assert.ok(start !== -1 && end !== -1 && end > start, 'expected the P3 CSS block to be present');
  const block = html.slice(start, end);
  // `max-width`/`min-width` are the media-query/responsive-hint properties
  // themselves (e.g. "@media (max-width: 480px)") — never an ELEMENT width,
  // so they are excluded before scanning for a plain `width:` declaration.
  const withoutMediaHints = block.replace(/(?:max|min)-width\s*:\s*\d+px/g, '');
  const fixedPx = /(?<![a-z-])width\s*:\s*(\d+)px/g;
  let m;
  while ((m = fixedPx.exec(withoutMediaHints)) !== null) {
    assert.ok(Number(m[1]) <= 320, `a fixed width of ${m[1]}px in the P3 CSS block would not fit a 390px viewport`);
  }
});

// ---------------------------------------------------------------------------
// build item 1 — the install-gap dead end (F182 mirrored into the panel):
// missing deps must WAIT (phase 'install-needed'), never refuse outright,
// and "Check again" must re-check the SAME copy, never a new one.
// ---------------------------------------------------------------------------

test('bareloop never runs an install itself: authorsession.js spawns/execs nothing at all (no child_process import)', () => {
  const src = readFileSync(new URL('../src/panel/authorsession.js', import.meta.url), 'utf8');
  assert.ok(!/child_process/.test(src), 'authorsession.js must never import node:child_process — it only NAMES the install command, never runs it');
});

test('createSession: a repo with a dependency and no node_modules WAITS (install-needed), never refuses outright', async (t) => {
  const repo = makeRepoWithDeps();
  const session = createSession(baseCard({ source: repo, jobName: 'panel-author-deps-wait' }), {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHomeWith(),
    sessionsRoot: tmp('panel-author-sess-deps-'),
  });
  const start = Date.now();
  while (session.state.phase !== 'install-needed' && Date.now() - start < 3000) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 10); });
  }
  assert.equal(session.state.phase, 'install-needed', `expected install-needed, got ${session.state.phase} / ${session.state.error}`);
  assert.equal(session.state.pendingAsk?.kind, 'install-needed');
  assert.match(session.state.pendingAsk.command, /npm (ci|install)/);
  assert.ok(session.state.pendingAsk.tree.includes('source-seed'), 'must point at THIS session\'s own copy, never the original repo');
  // build item 4 (mirrored server-side): a waiting session is still LIVE —
  // TERMINAL_PHASES (authorroutes.js) does not include install-needed.
  assert.notEqual(session.state.error, 'refused', 'install-needed must not be reported as a refusal');
});

test('createSession: RED-PROOF — Check again while STILL missing stays waiting, never silently advances', async (t) => {
  const repo = makeRepoWithDeps();
  const session = createSession(baseCard({ source: repo, jobName: 'panel-author-deps-still-missing' }), {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHomeWith(),
    sessionsRoot: tmp('panel-author-sess-deps-still-'),
  });
  const start = Date.now();
  while (session.state.phase !== 'install-needed' && Date.now() - start < 3000) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 10); });
  }
  assert.equal(session.state.phase, 'install-needed');
  const r = session.checkDeps();
  assert.equal(r.ok, true, 'the check-again SIGNAL itself is accepted');
  await new Promise((resolveFn) => { setTimeout(resolveFn, 150); });
  // RED-PROOF: nothing was installed — the session must still be waiting,
  // not silently continue as if the gap had closed.
  assert.equal(session.state.phase, 'install-needed', 'a check-again with nothing installed must stay waiting');
  assert.ok(session.state.steps.some((x) => x.id === 'install' && /[Ss]till missing/.test(x.detail)), 'the install step says it is still missing, on its own line');
});

test('createSession: Check again AFTER the gap is closed on the SAME copy continues the pipeline through to prepared', async (t) => {
  const repo = makeRepoWithDeps();
  const specHash = 'deadinstall00112233';
  const plans = [{ goal: 'fix things', checks: ['tsc clean'], questions: [], notChecked: [] }];
  const session = createSession(baseCard({ source: repo, jobName: 'panel-author-deps-resolved' }), {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHomeWith(),
    sessionsRoot: tmp('panel-author-sess-deps-resolved-'),
    scout: { state: 'PRESENT', facts: { sourcePaths: ['src/mod.js'], testPaths: [] }, calls: [], raws: [] },
    generate: async () => { throw new Error('generate must not be called in this test'); },
    confirmGenerate: makeFakeConfirmGenerate(plans),
    authorFn: fakeAuthorFn(),
    prepareSigningFn: fakePrepareSigningFn(specHash),
  });
  const start = Date.now();
  while (session.state.phase !== 'install-needed' && Date.now() - start < 3000) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 10); });
  }
  assert.equal(session.state.phase, 'install-needed');
  // mimic the person running the printed command IN THE COPY named by the
  // pendingAsk — never a new session's own fresh seed.
  const tree = session.state.pendingAsk.tree;
  mkdirSync(join(tree, 'node_modules'), { recursive: true });

  const r = session.checkDeps();
  assert.equal(r.ok, true);

  async function waitForAskKind(kind, timeoutMs = 5000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (session.state.pendingAsk?.kind === kind) return true;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((rr) => { setTimeout(rr, 10); });
    }
    return false;
  }
  // worseThanBefore is RETIRED (hamr's ruling 2026-09-28) — the pipeline
  // continues straight past the install gap to the menu ask.
  assert.ok(await waitForAskKind('menu'), `expected the pipeline to continue past the install gap; phase=${session.state.phase} error=${session.state.error}`);
  const prepped = session.signPrepare();
  assert.equal(prepped.ok, true);
  const start2 = Date.now();
  while (!['prepared', 'refused', 'error'].includes(session.state.phase) && Date.now() - start2 < 5000) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 10); });
  }
  assert.equal(session.state.phase, 'prepared', `expected prepared, got ${session.state.phase} / ${session.state.error}`);
  assert.equal(session.state.specHash, specHash);
});

test('checkDeps() RED-PROOF: refuses when the session is not in install-needed (e.g. right after creation, before any wait)', () => {
  const repo = makeRepo();
  const session = createSession(baseCard({ source: repo, jobName: 'panel-author-checkdeps-wrong-phase' }), {
    env: {}, sessionsRoot: tmp('panel-author-sess-checkdeps-wrong-'),
  });
  const r = session.checkDeps();
  assert.equal(r.ok, false);
});

test('POST /api/author/:id/check-deps over HTTP: guarded the same way, refuses (400) when not waiting, and dispatches through to the session when it is', async (t) => {
  const { base, token } = await startAuthorServer(t, { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' } });
  const repo = makeRepoWithDeps();
  const started = await (await fetch(`${base}/api/author/start`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-bareloop-token': token }, body: JSON.stringify(baseCard({ source: repo })),
  })).json();
  // no token: guard refuses before it ever reaches the session
  const noToken = await fetch(`${base}/api/author/${started.sessionId}/check-deps`, { method: 'POST' });
  assert.equal(noToken.status, 403);
  // right guard, but the session has not reached install-needed yet (or ever, if this races) — either way the route must be REACHABLE and answer honestly, never crash.
  const early = await fetch(`${base}/api/author/${started.sessionId}/check-deps`, { method: 'POST', headers: { 'x-bareloop-token': token } });
  assert.ok(early.status === 400 || early.status === 200, `check-deps must answer, not crash — got ${early.status}`);

  const start = Date.now();
  let phase = null;
  while (Date.now() - start < 3000) {
    // eslint-disable-next-line no-await-in-loop
    const s = await (await fetch(`${base}/api/author/${started.sessionId}`, { headers: { 'x-bareloop-token': token } })).json();
    phase = s.state.phase;
    if (phase === 'install-needed') break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 20); });
  }
  assert.equal(phase, 'install-needed');
  // a SECOND Start must still 409 while waiting on install (build item 4:
  // "install-waiting" is non-terminal, the one-at-a-time rule still binds).
  const second = await fetch(`${base}/api/author/start`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-bareloop-token': token }, body: JSON.stringify(baseCard({ source: repo, jobName: 'panel-author-deps-2' })),
  });
  assert.equal(second.status, 409);

  const again = await fetch(`${base}/api/author/${started.sessionId}/check-deps`, { method: 'POST', headers: { 'x-bareloop-token': token } });
  assert.equal(again.status, 200);
  const body = await again.json();
  assert.equal(body.ok, true);
});

// ---------------------------------------------------------------------------
// build item 7 — model readiness (key + $0 reachability) BEFORE drafting.
// ---------------------------------------------------------------------------

test('GET /api/author/model-check: a Name whose row has left the keys file is unknown (400) — no row, no model; the key value is never returned', async (t) => {
  const { base, token } = await startAuthorServer(t, { env: {}, home: keysHomeWith('ANTHROPIC_API_KEY=\n') });
  const res = await fetch(`${base}/api/author/model-check?model=claude-sonnet-5`, { headers: { 'x-bareloop-token': token } });
  assert.equal(res.status, 400);
});

test('GET /api/author/model-check: a bad-shape key (F181 class — a control character) -> keyStatus "bad-shape", key value never echoed', async (t) => {
  const { base, token } = await startAuthorServer(t, { env: {}, home: keysHomeWith('ANTHROPIC_API_KEY=sk-real\tmeta\n') });
  const res = await fetch(`${base}/api/author/model-check?model=claude-sonnet-5`, { headers: { 'x-bareloop-token': token } });
  const body = await res.json();
  assert.equal(body.keyStatus, 'bad-shape');
  assert.ok(!JSON.stringify(body).includes('sk-real'), 'the raw key value must never appear in the response');
});

test('GET /api/author/model-check: a found key triggers the $0 reachability GET (stubbed fetchImpl) — method+path asserted, no real network', async (t) => {
  /** @type {any[]} */
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers });
    return { ok: true, json: async () => ({ data: [{ id: 'claude-sonnet-5' }] }) };
  };
  const { base, token } = await startAuthorServer(t, { env: {}, home: keysHomeWith('ANTHROPIC_API_KEY=sk-real-enough\n'), fetchImpl });
  const res = await fetch(`${base}/api/author/model-check?model=claude-sonnet-5`, { headers: { 'x-bareloop-token': token } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.keyStatus, 'found');
  assert.equal(body.reachability.checked, true);
  assert.equal(body.reachability.reachable, true);
  assert.equal(body.reachability.modelListed, true);
  assert.equal(calls.length, 1, 'exactly one $0 GET — never a completion request');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/models');
  assert.equal(calls[0].headers['x-api-key'], 'sk-real-enough');
  assert.ok(!JSON.stringify(body).includes('sk-real-enough'), 'RED-PROOF sentinel — the key value never comes back in the response');
});

test('GET /api/author/model-check: an unreachable endpoint (stubbed failure) reads reachability.reachable=false with a status, and never blocks the key check', async (t) => {
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const { base, token } = await startAuthorServer(t, { env: {}, home: keysHomeWith('ANTHROPIC_API_KEY=sk-real-enough\n'), fetchImpl });
  const res = await fetch(`${base}/api/author/model-check?model=claude-sonnet-5`, { headers: { 'x-bareloop-token': token } });
  const body = await res.json();
  assert.equal(body.keyStatus, 'found', 'the key IS usable — only the network call failed');
  assert.equal(body.reachability.reachable, false);
  assert.equal(body.reachability.status, 'HTTP 503');
});

test('GET /api/author/model-check: an unknown model id refuses (400), never crashes', async (t) => {
  const { base, token } = await startAuthorServer(t, { env: {} });
  const res = await fetch(`${base}/api/author/model-check?model=not-a-real-model`, { headers: { 'x-bareloop-token': token } });
  assert.equal(res.status, 400);
});

test('GET /api/author/model-check: POST is refused (GET only)', async (t) => {
  const { base, token } = await startAuthorServer(t, { env: {} });
  const res = await fetch(`${base}/api/author/model-check?model=claude-sonnet-5`, { method: 'POST', headers: { 'x-bareloop-token': token } });
  assert.equal(res.status, 405);
});

test('GET /api/author/model-check: no token still refuses (403) — same human-click guard as every other author route', async (t) => {
  const { base } = await startAuthorServer(t, { env: {} });
  const res = await fetch(`${base}/api/author/model-check?model=claude-sonnet-5`);
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// the customer's own price on a chat-authoring session (FINDINGS F206)
// ---------------------------------------------------------------------------
//
// The session builds its own REAL provider (no provider seam), so the price is proven through the one
// place a test can reach at $0: the `generate` function the session hands to the composer (`authorFn`
// seam) is the real `makeLoopGenerate(provider, { rates })`, and the provider's endpoint is a loopback
// HTTP server that answers with fixed token usage. Not reached: the scout and the confirm turn (both are
// stubbed by their own seams above) — they take the same `draftPrice`, covered at the seam in
// tests/customer-price.test.js.

const PRICE_USAGE = { prompt_tokens: 1000, completion_tokens: 400 };

/** a loopback OpenAI-shaped endpoint; counts requests, answers every one with PRICE_USAGE */
async function loopbackProvider(t) {
  const seen = { requests: 0 };
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      seen.requests += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ model: 'gpt-x', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'ok' } }], usage: PRICE_USAGE }));
    });
  });
  await new Promise((r) => { server.listen(0, '127.0.0.1', r); });
  t.after(() => { server.close(); server.closeAllConnections?.(); });
  const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
  return { seen, baseUrl: `http://127.0.0.1:${addr.port}/v1` };
}

/** one session on a scratch home whose config.json carries the row; returns the session and, when the
 * composer stub ran, what its own `generate` came back with */
async function priceSession(t, { row, jobName }) {
  const { seen, baseUrl } = await loopbackProvider(t);
  const home = keysHomeWith('MY_KEY=sk-fakekey\n');
  writeFileSync(join(home, 'config.json'), JSON.stringify({ keys: { MY_KEY: { name: 'gpt-x', shape: 'openai-api', baseUrl, ...row } } }));
  let generated = null;
  const session = createSession(baseCard({ source: makeRepo(), model: 'gpt-x', jobName }), {
    env: { MY_KEY: 'sk-fakekey' }, home, sessionsRoot: tmp('panel-author-sess-price-'),
    scout: { state: 'PRESENT', facts: { sourcePaths: ['src/mod.js'], testPaths: [] }, calls: [], raws: [] },
    confirmGenerate: makeFakeConfirmGenerate([{ goal: 'fix things', checks: ['tsc clean'], questions: [], notChecked: [] }]),
    authorFn: async ({ generate }) => {
      generated = await generate([{ role: 'user', content: 'hello' }], []);
      return { ok: false, stop: 'price-test-done', reds: [], cost: { costUsd: null, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 } };
    },
  });
  const start = Date.now();
  let accepted = false;
  while (!['refused', 'error', 'prepared'].includes(session.state.phase) && Date.now() - start < 8000) {
    // the confirm turn's menu: accept the plan (Sign & run's first click), which lets the composer stub run
    if (!accepted && session.state.pendingAsk?.kind === 'menu') { session.signPrepare(); accepted = true; }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 10); });
  }
  return { session, seen, generated: () => generated };
}

test('createSession: the drafting rounds are priced at the row\'s own price (tokens x config, not a hardcoded dollar), and differ from the no-price guess', async (t) => {
  const price = { priceInPerM: 0.006, priceOutPerM: 1.2 };
  const priced = await priceSession(t, { row: price, jobName: 'panel-author-price-on' });
  const guessed = await priceSession(t, { row: {}, jobName: 'panel-author-price-off' });
  const pg = priced.generated();
  const gg = guessed.generated();
  assert.ok(pg && gg, `both composer stubs ran: ${priced.session.state.phase} ${JSON.stringify(priced.session.state.messages)}`);
  assert.equal(pg.error, null);
  const expected = (PRICE_USAGE.prompt_tokens * price.priceInPerM + PRICE_USAGE.completion_tokens * price.priceOutPerM) / 1e6;
  assert.ok(Math.abs(pg.cost - expected) < 1e-12, `${pg.cost} vs ${expected}`);
  assert.equal(pg.metrics.costUsd, pg.cost);
  assert.notEqual(gg.cost, pg.cost, 'a customer price must change what a drafting round books');
  assert.ok(gg.cost > pg.cost * 10, 'the guess is far above this customer price');
  console.log(`# panel drafting round, same tokens (${PRICE_USAGE.prompt_tokens} in / ${PRICE_USAGE.completion_tokens} out): customer price $${pg.cost.toFixed(9)} vs guess $${gg.cost.toFixed(9)}`);
});

test('createSession: a bad price (one field only, or negative) refuses at $0 with the ConfigError text and makes zero provider calls', async (t) => {
  for (const [row, why] of [[{ priceInPerM: 0.006 }, 'one field only'], [{ priceInPerM: -1, priceOutPerM: 1.2 }, 'negative']]) {
    // eslint-disable-next-line no-await-in-loop
    const r = await priceSession(t, { row, jobName: `panel-author-price-bad-${why.replace(' ', '-')}` });
    assert.equal(r.session.state.phase, 'refused', why);
    assert.match(r.session.state.error, /MY_KEY/, `${why}: names the row`);
    assert.match(r.session.state.error, /price/i, why);
    assert.match(r.session.state.error, /Stopped — nothing spent\./, why);
    assert.equal(r.seen.requests, 0, `${why}: no provider call`);
    assert.equal(r.generated(), null, `${why}: the composer never ran`);
    assert.equal(r.session.state.draftSpentUsd, 0, why);
  }
});
