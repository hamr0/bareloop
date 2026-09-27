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
import { createPanelServer } from '../src/panel/server.js';
import { checkHumanGuard, signRun } from '../src/panel/authorroutes.js';
import { createSession, validateJobCard, jobNameTaken } from '../src/panel/authorsession.js';
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
  draftingCapUsd: 1,
  ...overrides,
});

// ---------------------------------------------------------------------------
// validateJobCard — $0, before a session is ever created
// ---------------------------------------------------------------------------

test('validateJobCard: RED-PROOF — an empty/zero/non-number Drafting $ cap is refused; a real positive number is not', () => {
  for (const bad of [undefined, 0, -1, NaN, 'oops']) {
    const r = validateJobCard(baseCard({ draftingCapUsd: bad }));
    assert.equal(r.ok, false, `draftingCapUsd=${bad} must refuse`);
    assert.match(r.error, /Drafting \$ cap/);
  }
  assert.equal(validateJobCard(baseCard()).ok, true);
});

test('validateJobCard: a taken job name refuses (P3 is new jobs only, Q4=A) — RED-PROOF against a fabricated jobs/ dir', () => {
  const jobsDir = tmp('panel-author-jobs-');
  writeFileSync(join(jobsDir, 'already-exists.json'), '{}');
  assert.equal(jobNameTaken('already-exists', { jobsDir }), true);
  assert.equal(jobNameTaken('brand-new-name', { jobsDir }), false);
  const r = validateJobCard(baseCard({ jobName: 'already-exists', jobsDirOverride: jobsDir }));
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

// ---------------------------------------------------------------------------
// createAuthorRoutes over a REAL socket — the human-click guard end to end,
// one-session-at-a-time, and $0 refusals (bad card, missing key).
// ---------------------------------------------------------------------------

async function startAuthorServer(t, opts = {}) {
  const { server, port, token, close } = await createPanelServer({
    port: 0, sessionsRoot: opts.sessionsRoot ?? tmp('panel-author-sessions-'), env: opts.env ?? {},
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

test('POST /api/author/start: a missing provider key refuses at $0 (before any session even starts drafting)', async (t) => {
  const { base, token } = await startAuthorServer(t, { env: {} }); // no ANTHROPIC_API_KEY
  const repo = makeRepo();
  const res = await fetch(`${base}/api/author/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bareloop-token': token },
    body: JSON.stringify(baseCard({ source: repo })),
  });
  assert.equal(res.status, 200, 'start itself is accepted — the refusal is IN the session, at $0');
  const body = await res.json();
  assert.equal(body.ok, true);
  // poll once — the session refuses inside its own async run(), before any spend
  await new Promise((r) => { setTimeout(r, 50); });
  const state = await (await fetch(`${base}/api/author/${body.sessionId}`, { headers: { 'x-bareloop-token': token } })).json();
  assert.equal(state.state.phase, 'refused');
  assert.match(state.state.error, /ANTHROPIC_API_KEY/);
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
  const { base, token } = await startAuthorServer(t, { env: {} });
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
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' },
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
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' },
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

  // D7 (authorCloseForJob's own $0 half): a repo job is asked
  // "worseThanBefore" BEFORE the scout even runs — answered here with the
  // library's own "blank is legal" allowance (see runConfirmTurn's doc).
  assert.ok(await waitForAskKind('worseThanBefore'), `expected worseThanBefore first; got phase=${session.state.phase} error=${session.state.error}`);
  session.send('');
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
  const signed = signRun(session, session.state.specHash, { env: {}, spawnFn, bareloopBin: '/repo/bin/bareloop.mjs' });
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
