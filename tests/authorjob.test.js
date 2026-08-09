// THE COMPOSITION (M4b) + the declared close END TO END through the shipped
// runner. This is where the rung's product claim is tested: a person answers
// seven questions and gets a signable job spec, or an honest refusal that is
// COUNTED as demand against bareloop's own catalogue.
//
// Under test, in the design's own terms:
//   D4  — verdictType is DERIVED, never picked, and never silently `green`;
//   D6  — re-authoring produces a new hash, so it needs a new signature;
//   D9  — three mechanical gates and a signature; nothing LLM-judges the close;
//   D13 — one genre, honest refusal, `lib` stamped at the EMIT SITE, and the
//         ledger's suggestedAsk therefore reads "bareloop:", never "bare-agent:".
//
// Real temp git patients, real child processes, real `runPlan`. The provider is
// the one legitimate seam (it is a shell-owned binding by design), and the
// declared close's execution is NEVER mocked — the runner seam is the highest-risk
// part of this module and a stub there would prove nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  runInterview, authorCloseForJob, assembleSpec, prepareSigning, refusalEvents, refuseLockedKind,
  GENRE, REFUSAL_LIB, REFUSAL_CATEGORY, VERDICT_CLASSES, LOCKED_CLASSES, LIVE_CLASSES,
} from '../src/authorjob.js';
import { validateJob, jobSpecHash, checkApproval } from '../src/job.js';
import { questionsFor } from '../src/authorflow.js';
import { scanSecrets } from '../src/validate.js';
import { classGuards } from '../src/authoring.js';

/** every job in this file is a GREEN job — the guard battery keys off the class */
const greenGuards = (/** @type {string} */ lang) => classGuards({ verdictType: 'green', lang });
import { classifyIncidents, ledgerDeltas, foldLedger, LEDGER_CLASSES } from '../src/ledger.js';
import { runPlan } from '../src/planrun.js';
import { scriptedProvider } from './helpers.js';

// ── fixtures ─────────────────────────────────────────────────────────────────

const git = (dir, args) => execFileSync('git', args, {
  cwd: dir,
  encoding: 'utf8',
  env: {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 'aj-test', GIT_AUTHOR_EMAIL: 'aj@test',
    GIT_COMMITTER_NAME: 'aj-test', GIT_COMMITTER_EMAIL: 'aj@test',
  },
});

function write(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
}

/**
 * The patient: `check.mjs` greens iff `src/fix.js` exists and says `ok`. Real
 * script, real exit code — the close spawns it for a living.
 */
function makePatient(t, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-aj-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, ['init', '-q', '-b', 'main']);
  write(dir, {
    'src/mod.js': '// nothing yet\n',
    'check.mjs': `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./src/fix.js', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) { console.log('clean'); process.exit(0); }
console.log('FAILED src/fix.js — missing or has no ok marker'); process.exit(1);\n`,
    ...extra,
  });
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return { dir, seed: git(dir, ['rev-parse', 'HEAD']).trim() };
}

/** the genre's guards, with the model's ONE fill slot filled */
const guards = (allowPrefixes) => greenGuards('js').map((g) => ({
  name: g.name,
  kind: g.kind,
  params: { ...g.params, ...(g.fill.includes('allowPrefixes') ? { allowPrefixes } : {}) },
}));

/** a full TYPES-shaped declaration over the patient above */
const DECL = ({ allowPrefixes = ['src/'], verdictCmd = ['check.mjs'] } = {}) => ({
  genre: GENRE,
  lang: 'js',
  stages: [
    guards(allowPrefixes)[0],
    { name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: verdictCmd, expectExit: 0 } },
    guards(allowPrefixes)[1],
  ],
});

const SPEC_DRAFT = {
  schema: 'job-v1',
  job: 'declared-patient',
  description: 'a job whose close the user never wrote',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  goal: 'Create src/fix.js with an ok marker so the check passes.',
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
};

const ANSWERS = {
  1: 'Make the type checker stop complaining about the mailer.',
  2: 'The files under src.',
  3: 'Please do not touch the tests.',
  4: 'I run the checker by hand and read the list of complaints.',
  5: 'If the complaints only went quiet because something was told to look the other way.',
  6: 'Yes, the repo is on this machine.',
};

const collector = () => {
  const events = [];
  return { events, emit: (type, data = {}) => { const e = { type, ...data }; events.push(e); return e; } };
};

// ── 1. THE INTERVIEW, and D4's derivation ────────────────────────────────────

test('the interview ECHOES the class the user picked — the radio drives authoring, it never falls out of it', () => {
  const r = runInterview({ verdictType: 'green', answers: ANSWERS, repoPath: '/tmp/whatever' });
  assert.equal(r.ok, true);
  assert.equal(r.verdictType, 'green');
  assert.equal(r.refusal, null);
  assert.deepEqual(r.reds, []);
  // and nothing in the ANSWERS decides it: the class is structured input, never
  // read out of prose (D4 is superseded — this is the check that it stays dead)
  assert.ok(!JSON.stringify(ANSWERS).toLowerCase().includes('green'));
  assert.equal(runInterview({ answers: ANSWERS, repoPath: '/tmp/x' }).verdictType, null,
    'with no pick there is no class — nothing defaults it to green');
});

test('the RADIO is a closed set: an unset or unknown class is a red, never demand', () => {
  for (const [verdictType, code] of [[undefined, 'missing-field'], [null, 'missing-field'], ['greenish', 'invalid-value'], ['', 'invalid-value']]) {
    const r = runInterview({ verdictType, answers: ANSWERS, repoPath: '/tmp/x' });
    assert.equal(r.ok, false, String(verdictType));
    assert.equal(r.refusal, null, 'a typo is never a user asking for a capability');
    const red = r.reds.find((x) => x.path === 'verdictType');
    assert.ok(red, JSON.stringify(r.reds));
    assert.equal(red.code, code, String(verdictType));
    // the legal values are HANDED OVER enumerated, not described
    for (const c of VERDICT_CLASSES) assert.ok(red.detail.includes(c), c);
  }
});

test('a LOCKED class refuses at ADMISSION, BEFORE its questions run — counted demand for the CLASS', () => {
  for (const verdictType of LOCKED_CLASSES) {
    // no answers at all: the refusal must not wait for an interview that cannot
    // be run, because that class's question set is named but locked
    const r = runInterview({ verdictType, answers: {}, repoPath: null });
    assert.equal(r.ok, false);
    assert.deepEqual(r.reds, [], 'an unbuilt question set must not also produce missing-answer reds');
    assert.equal(r.verdictType, null, 'it never returns a class it cannot honour');
    assert.equal(r.refusal.kind, 'request-red');
    assert.equal(r.refusal.verb, verdictType, 'the demand names the CLASS the user asked for');
    assert.equal(r.refusal.red.lib, REFUSAL_LIB);
    assert.equal(r.refusal.red.code, 'request-red');
    assert.ok(r.refusal.detail.includes(verdictType));
  }
  assert.deepEqual([...LIVE_CLASSES], ['green'], 'v1 admits exactly one class');
});

test('the interview asks NOTHING about a genre — D13\'s confirm slot is gone, and answer 7 is not a slot', () => {
  const { 6: _six, ...five } = ANSWERS;
  assert.ok(runInterview({ verdictType: 'green', answers: five, repoPath: '/tmp/x' })
    .reds.some((x) => x.path === 'answers.6'), 'six answers are required');
  // a seventh answer is not read by anything: the confirm is not a slot any more,
  // and "no" to a question nobody asked cannot refuse a job
  const r = runInterview({ verdictType: 'green', answers: { ...ANSWERS, 7: 'no' }, repoPath: '/tmp/x' });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(r.refusal, null);
  assert.equal(Object.hasOwn(r.answers, '7'), false, 'an unasked answer never enters the record');
  const asked = Object.values(questionsFor('green')).join(' ');
  assert.ok(!/type[- ]?fix|type checker/i.test(asked), asked);
});

test('an unfinished interview is REDS, never demand — an incomplete form is not a user asking for a capability', () => {
  const { 4: _dropped, ...partial } = ANSWERS;
  const r = runInterview({ verdictType: 'green', answers: partial, repoPath: '/tmp/x' });
  assert.equal(r.ok, false);
  assert.equal(r.refusal, null, 'a missing answer must not inflate the admission evidence');
  assert.ok(r.reds.some((x) => x.path === 'answers.4'));
});

test('D13: a job with NO repository is refused — all three validity gates rest on a git seed', () => {
  const r = runInterview({ verdictType: 'green', answers: ANSWERS, repoPath: null });
  assert.equal(r.ok, false);
  assert.equal(r.verdictType, null);
  assert.equal(r.refusal.verb, 'non-green-verdict');
  assert.equal(r.refusal.red.lib, REFUSAL_LIB);
});

test('interview answers are scrubbed at INGEST — an answer becomes a prompt, a record and a signed artefact at once', () => {
  const KEY = `sk-ant-api03-${'B'.repeat(95)}`;
  const r = runInterview({ verdictType: 'green', answers: { ...ANSWERS, 1: `use my key ${KEY} to check` }, repoPath: '/tmp/x' });
  assert.equal(r.ok, true);
  assert.ok(!JSON.stringify(r.answers).includes(KEY));
});

// ── 2. THE LEDGER ATTRIBUTION, end to end ────────────────────────────────────

test('D13 REGRESSION: a close-authoring refusal files under bareloop, and its suggestedAsk is never an upstream ask', () => {
  const refusal = runInterview({ verdictType: 'hitl', answers: ANSWERS, repoPath: '/tmp/x' }).refusal;
  const events = refusalEvents(refusal).map((e, i) => ({ ...e, seq: i + 1 }));

  const occs = classifyIncidents(events, { spine: 'authoring' });
  const req = occs.filter((o) => o.class === 'request-red');
  assert.equal(req.length, 1, 'the demand is counted exactly once');
  assert.equal(req[0].lib, REFUSAL_LIB, 'the lib is the STAMPED one — inferring it here is the BA-2 misattribution class');
  assert.equal(req[0].verb, 'hitl', 'the demand names the verdict class, which is what the rung waits on');

  // …and the template a human actually FILES from must aim at the same target.
  // Fixing the occurrence alone would leave the misattribution in the one field
  // that becomes an UPSTREAM-ASKS entry.
  const rows = ledgerDeltas(foldLedger([]), occs);
  const ask = rows.find((r) => r.class === 'request-red').suggestedAsk;
  assert.ok(ask.startsWith(`${REFUSAL_LIB}:`), ask);
  assert.ok(!/bare-agent|litectx|bareguard/.test(ask), 'a refusal by OUR catalogue is never a bare-suite gap');

  // the escalation rides beside it and classifies to NOTHING — the demand is
  // already counted once, and an unmapped category would be counted as a
  // bareloop bug (the executable excluded-set rule)
  assert.equal(occs.length, 1, JSON.stringify(occs));
  assert.ok(!occs.some((o) => o.detail.includes('unclassified escalation')));
  assert.equal(events.find((e) => e.type === 'escalation').category, REFUSAL_CATEGORY);
  assert.ok(LEDGER_CLASSES.includes('request-red'));
});

test('a locked KIND is counted demand too — the tool-mode schema makes it unsayable, so the interview layer carries it', () => {
  for (const kind of ['judged-floor', 'human-confirms']) {
    const r = refuseLockedKind(kind);
    assert.equal(r.red.lib, REFUSAL_LIB);
    assert.equal(r.red.verb, kind);
    const occs = classifyIncidents(refusalEvents(r).map((e, i) => ({ ...e, seq: i })), { spine: 's' });
    assert.deepEqual(occs.map((o) => [o.class, o.lib, o.verb]), [['request-red', REFUSAL_LIB, kind]]);
  }
});

test('a decision-ready refusal emits NO job-red — it is a stop, not demand for a locked capability', async (t) => {
  const p = makePatient(t);
  // a close that is already green at seed has nothing to do (D9.3)
  const spec = assembleSpec({ ...SPEC_DRAFT }, {
    closeDecl: {
      genre: GENRE, lang: 'js',
      stages: [guards(['src/'])[0], { name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: ['-e', ''], expectExit: 0 } }, guards(['src/'])[1]],
    },
    verdictType: 'green',
  });
  const r = await prepareSigning({ spec, workdir: p.dir, seedRef: p.seed, timeoutMs: 30_000 });
  assert.equal(r.ok, false);
  assert.equal(r.refusal.kind, 'decision-ready');
  assert.equal(r.refusal.red, null);
  assert.deepEqual(refusalEvents(r.refusal).map((e) => e.type), ['escalation']);
  assert.equal(classifyIncidents(refusalEvents(r.refusal).map((e, i) => ({ ...e, seq: i })), {}).length, 0);
});

// ── 3. THE SPEC SURFACE, both directions ─────────────────────────────────────

test('validateJob accepts a declared close and refuses BOTH fields at once — two closes are two arbiters', () => {
  const ok = validateJob(assembleSpec(SPEC_DRAFT, { closeDecl: DECL(), verdictType: 'green' }));
  assert.deepEqual(ok.reds, []);

  const both = validateJob({ ...SPEC_DRAFT, verdictType: 'green', closeDecl: DECL(), close: [{ name: 'c', cmd: 'true', expect: 0 }] });
  assert.deepEqual(both.reds.map((r) => r.code), ['close-duplicated']);

  const neither = validateJob({ ...SPEC_DRAFT, verdictType: 'green' });
  assert.ok(neither.reds.some((r) => r.code === 'missing-required' && r.path === 'close'));
});

test('the laundering guard holds from the declared side: a LOCKED verdict on a declared close reds twice, never launders', () => {
  const r = validateJob(assembleSpec(SPEC_DRAFT, { closeDecl: DECL(), verdictType: 'soft-green' }));
  assert.equal(r.ok, false);
  const codes = r.reds.map((x) => x.code);
  assert.ok(codes.includes('request-red'), 'the locked verdict is counted demand');
  assert.ok(codes.includes('close-hierarchy'), 'and a soft verdict can never ride a hard close');
  assert.equal(r.reds.find((x) => x.code === 'request-red').lib, 'bareloop');
});

test('a malformed declaration reds THROUGH validateJob, pathed under closeDecl', () => {
  const bad = DECL();
  bad.stages[1].kind = 'harness-loop';
  const r = validateJob(assembleSpec(SPEC_DRAFT, { closeDecl: bad, verdictType: 'green' }));
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.code === 'unknown-kind' && x.path.startsWith('closeDecl.')), JSON.stringify(r.reds));
});

test('a LOCKED kind in a declaration is a distinct counted red, never an unknown-kind typo', () => {
  const bad = DECL();
  bad.stages[1] = { name: 'judged', kind: 'judged-floor', params: {} };
  const r = validateJob(assembleSpec(SPEC_DRAFT, { closeDecl: bad, verdictType: 'green' }));
  const locked = r.reds.find((x) => x.code === 'locked-kind');
  assert.ok(locked, JSON.stringify(r.reds.map((x) => x.code)));
  assert.equal(locked.lib, 'bareloop');
  assert.equal(locked.verb, 'judged-floor');
});

// ── 4. D6 — the hash ─────────────────────────────────────────────────────────

test('D6: an identical declaration is hash-STABLE and a re-authored one FLIPS the hash, so it needs a new signature', () => {
  const spec = assembleSpec(SPEC_DRAFT, { closeDecl: DECL(), verdictType: 'green' });
  const h = jobSpecHash(spec);

  // same declaration, rebuilt from scratch and with its keys in another order
  const twin = assembleSpec(SPEC_DRAFT, { closeDecl: DECL(), verdictType: 'green' });
  twin.closeDecl = { stages: twin.closeDecl.stages, lang: twin.closeDecl.lang, genre: twin.closeDecl.genre };
  assert.equal(jobSpecHash(twin), h, 'the hash binds to CONTENT, not to key order');
  assert.equal(checkApproval(twin, [{ specHash: h, signer: 'hamr', ts: 't' }]), true);

  // a re-authored close: one guard pattern dropped — the single most dangerous
  // edit there is, and exactly the one D5 forbids
  const reauthored = assembleSpec(SPEC_DRAFT, { closeDecl: DECL(), verdictType: 'green' });
  reauthored.closeDecl.stages[2].params.patterns = reauthored.closeDecl.stages[2].params.patterns.slice(0, 3);
  assert.notEqual(jobSpecHash(reauthored), h);
  assert.equal(checkApproval(reauthored, [{ specHash: h, signer: 'hamr', ts: 't' }]), false,
    'the old signature must not cover the new close');

  // …and a changed scope prefix flips it too (the F84 population lives there)
  const rescoped = assembleSpec(SPEC_DRAFT, { closeDecl: DECL({ allowPrefixes: ['src/mod.js'] }), verdictType: 'green' });
  assert.notEqual(jobSpecHash(rescoped), h);
});

// ── 5. D9's THREE GATES ──────────────────────────────────────────────────────

test('D9: the three gates pass, and the seed read SHOWS which stages are the work and which are the guards', async (t) => {
  const p = makePatient(t);
  const spec = assembleSpec(SPEC_DRAFT, { closeDecl: DECL(), verdictType: 'green' });
  const r = await prepareSigning({ spec, workdir: p.dir, seedRef: p.seed, timeoutMs: 30_000 });

  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(r.gates.declaration.ok, true);
  assert.equal(r.gates.declaration.grounded, true, 'the tree-grounded half is PROVED here, never deferred into a signature');
  assert.equal(r.gates.precheck.ok, true);
  assert.equal(r.gates.seedVerdict.ok, true);

  // the split the user is shown: guards are the genre's, work is their job
  assert.deepEqual(r.guards.map((g) => g.stage).sort(), ['changed-from-seed', 'no-suppressions']);
  assert.deepEqual(r.work.map((w) => w.stage), ['verdict']);
  assert.equal(r.work[0].verdict, 'red', 'the work is RED at seed — that IS the work');
  assert.equal(r.guards.find((g) => g.stage === 'no-suppressions').verdict, 'green');
  // changed-from-seed is red at its OWN seed by construction, and it is a GUARD:
  // counting it as work would let a close with nothing to do clear D9.3
  assert.equal(r.guards.find((g) => g.stage === 'changed-from-seed').verdict, 'red');
  assert.deepEqual(r.gates.seedVerdict.workRed, ['verdict']);

  // EVERY stage ran, not first-red-wins: a stage that never ran mints no baseline (D12)
  assert.equal(r.work.length + r.guards.length, spec.closeDecl.stages.length);

  // it prepares, it never signs
  assert.equal(r.specHash, jobSpecHash(spec));
  assert.ok(!('approvals' in r) && !('signer' in r));
  assert.equal(checkApproval(spec, [{ specHash: r.specHash, signer: 'hamr', ts: 't' }]), true);
});

test('D9.2: a stage that CANNOT RUN is broken-close — a casualty, refused before any signature', async (t) => {
  const p = makePatient(t);
  const spec = assembleSpec(SPEC_DRAFT, {
    closeDecl: {
      genre: GENRE, lang: 'js',
      stages: [guards(['src/'])[0], { name: 'verdict', kind: 'command-exit', params: { cmd: 'no-such-binary-xyz', args: [], expectExit: 0 } }, guards(['src/'])[1]],
    },
    verdictType: 'green',
  });
  const r = await prepareSigning({ spec, workdir: p.dir, seedRef: p.seed, timeoutMs: 30_000 });
  assert.equal(r.ok, false);
  assert.equal(r.gates.precheck.ok, false);
  assert.deepEqual(r.gates.precheck.stops.map((s) => s.stage), ['verdict']);
  assert.equal(r.reds.length, 1, 'the stop is REPORTED as a red, not merely recorded on the gate');
  assert.ok(r.reds.every((x) => x.code === 'broken-close'));
  // and it stops HERE: a casualty makes nothing downstream trustworthy, so the
  // seed-verdict read never runs and never mints a baseline off a broken
  // instrument. This is what distinguishes the precheck's refusal from D9.3's.
  assert.equal(r.gates.seedVerdict, null);
  assert.equal(r.refusal.kind, 'decision-ready');
  assert.match(r.refusal.detail, /cannot run/);
  assert.equal(r.specHash, null, 'nothing is offered for signature while an instrument is broken');
});

test('D9.1: the GROUNDED listing rule refuses an invented path at signing, where a deferred gate had passed it', async (t) => {
  const p = makePatient(t);
  const spec = assembleSpec(SPEC_DRAFT, { closeDecl: DECL({ allowPrefixes: ['src/alertEmail.js'] }), verdictType: 'green' });
  // the job validator accepts it — its half of the gate is tree-independent
  assert.deepEqual(validateJob(spec).reds, []);
  // …and the grounded gate does not
  const r = await prepareSigning({ spec, workdir: p.dir, seedRef: p.seed, timeoutMs: 30_000 });
  assert.equal(r.ok, false);
  assert.equal(r.gates.declaration.grounded, true);
  assert.ok(r.reds.some((x) => x.code === 'path-not-in-listing'), JSON.stringify(r.reds));
});

test('prepareSigning refuses a spec carrying a COMMAND close — those stages are signed as written', async (t) => {
  const p = makePatient(t);
  const spec = { ...SPEC_DRAFT, verdictType: 'green', close: [{ name: 'c', cmd: 'node check.mjs', expect: 0 }] };
  const r = await prepareSigning({ spec, workdir: p.dir, seedRef: p.seed });
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.path === 'closeDecl'));
});

// ── 5b. THE SCRUB AT THE EMISSION BOUNDARY ───────────────────────────────────
//
// The git reads in `kinds.js` build their `stop` string out of the subprocess's
// own stderr (`INSTRUMENT: … : ${String(r.err).trim()}`), and M1 deliberately
// does NOT scrub — the caller does, at the boundary where the text stops being a
// return value and becomes something a human reads and a file keeps. Every one of
// these reds is persisted (signing.json) and re-read, and a log that captures a
// key captures it forever. The seed-read gap lines were already scrubbed on this
// path; these two channels were not, which is the same leak this branch shipped
// twice already (renderSeedReadBlock, then renderRejectBlock).
//
// The fixture is assembled from parts so no real-shaped token literal ever exists
// in the tree, and each test proves the shape is one the ONE inventory actually
// detects — without that, the test could not fail.

const FAKE_TOKEN = ['sk', 'live', 'A1b2C3d4E5f6G7h8I9j0KLMN'].join('-');

/** what `git` really hands back when it fails inside a stop string */
const gitStderrWith = (/** @type {string} */ token) => `fatal: unable to access 'https://x@example.invalid/r.git': `
  + `authorization failed (token ${token})`;

test('prepareSigning: git stderr in a seed-unreadable red is SCRUBBED before it is persisted', async () => {
  assert.equal(scanSecrets(FAKE_TOKEN).length, 1, 'the fixture must be a shape the ONE inventory actually detects');
  const stop = `INSTRUMENT: could not read HEAD in /patient: ${gitStderrWith(FAKE_TOKEN)}`;
  assert.equal(scanSecrets(stop).length, 1, 'and the injected stop must really carry it — else nothing is under test');

  const spec = assembleSpec(SPEC_DRAFT, { closeDecl: DECL(), verdictType: 'green' });
  const r = await prepareSigning({
    spec,
    workdir: '/patient',
    seedFn: async () => ({ stop, seedRef: null }),
    listingFn: async () => { throw new Error('the seed read must stop the flow before the listing'); },
  });

  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].code, 'seed-unreadable');
  assert.deepEqual(scanSecrets(r.reds[0].detail), [], 'a credential in git stderr must never reach signing.json');
  assert.ok(r.reds[0].detail.includes('[REDACTED:'), 'the mask is the shared redactor, not a silent deletion');
  // the mechanical half — what tells the human WHICH instrument failed — survives
  assert.match(r.reds[0].detail, /^INSTRUMENT: could not read HEAD in \/patient: fatal: unable to access/);
  // the gate record is the same string and must be scrubbed with it
  assert.deepEqual(scanSecrets(JSON.stringify(r.gates.declaration)), []);
});

test('prepareSigning: git stderr in a listing-unreadable red is SCRUBBED before it is persisted', async () => {
  const stop = `INSTRUMENT: git ls-tree -r deadbee failed in /patient: ${gitStderrWith(FAKE_TOKEN)}`;
  assert.equal(scanSecrets(stop).length, 1, 'the injected stop must really carry it — else nothing is under test');

  const spec = assembleSpec(SPEC_DRAFT, { closeDecl: DECL(), verdictType: 'green' });
  const r = await prepareSigning({
    spec,
    workdir: '/patient',
    seedRef: 'deadbee',
    listingFn: async () => ({ stop, files: null }),
  });

  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].code, 'listing-unreadable');
  assert.deepEqual(scanSecrets(r.reds[0].detail), [], 'a credential in git stderr must never reach signing.json');
  assert.ok(r.reds[0].detail.includes('[REDACTED:'), 'the mask is the shared redactor, not a silent deletion');
  assert.match(r.reds[0].detail, /^INSTRUMENT: git ls-tree -r deadbee failed in \/patient: fatal: unable to access/);
  assert.deepEqual(scanSecrets(JSON.stringify(r.gates.declaration)), []);
});

// The OTHER half of the same boundary: the two VALIDATOR gates. Their reds are
// not git's stderr — they echo the declaration the model wrote and the seed tree
// the arbiter listed, and both are persisted with the signing evidence exactly
// like the two above. A validator red that quotes a token back is the divergence
// the ONE inventory (SECRET_PATTERNS) exists to forbid: `secret-literal` reds the
// very shape the sibling red hands through unmasked.
//
// The scrub is UNIFORM over every string-valued field, not just `detail`, because
// these reds carry structured echoes too (`cmd`, `declared`, `element`) and a
// per-field list is a list that goes stale the next time a red learns a field.

/** every string reachable in a red, whatever field it rides — the walk the
 * per-field allowlist would have missed */
function strings(node, out = []) {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((v) => strings(v, out));
  else if (node && typeof node === 'object') for (const v of Object.values(node)) strings(v, out);
  return out;
}

test('prepareSigning gate 1b: a validation red quoting the SEED LISTING is scrubbed before it is persisted', async () => {
  // The leak channel gate 1a structurally cannot see: `validateJob` sweeps the
  // SPEC for secret literals, and this token is not in the spec — it is a
  // filename in the patient's own tree, quoted back by the listing rule's
  // "what DOES exist beside the invented path" gap. Nothing upstream scans it.
  const listed = `src/${FAKE_TOKEN}.js`;
  assert.equal(scanSecrets(listed).length, 1, 'the fixture must be a shape the ONE inventory actually detects');

  const decl = DECL({ allowPrefixes: ['src/nope/'] });
  const spec = assembleSpec(SPEC_DRAFT, { closeDecl: decl, verdictType: 'green' });
  assert.deepEqual(scanSecrets(JSON.stringify(spec)), [], 'the spec is clean — so gate 1a passes and gate 1b is what runs');

  const r = await prepareSigning({
    spec,
    workdir: '/patient',
    seedRef: 'deadbee',
    listingFn: async () => ({ stop: null, files: [listed, 'src/b.js', 'check.mjs'] }),
    seedReadFn: async () => { throw new Error('the declaration gate must stop the flow before any stage runs'); },
  });

  assert.equal(r.ok, false);
  assert.ok('scoped' in r.gates.declaration, 'the grounded gate is the one under test, not the deferred spec gate');
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].code, 'path-not-in-listing');

  for (const s of strings(r.reds)) assert.deepEqual(scanSecrets(s), [], `an unmasked token survived: ${s}`);
  assert.ok(r.reds[0].detail.includes('[REDACTED:'), 'the mask is the shared redactor, not a silent deletion');
  // the mechanical half survives: which path, and what really is beside it
  assert.match(r.reds[0].detail, /^"src\/nope\/" matches nothing in the seed tree \(under src the seed tree has: /);
  assert.ok(r.reds[0].detail.includes('src/b.js'), 'a real neighbour is still named — the scrub masks, it does not delete');
  // the enumerated/structural fields are byte-identical: redactSecrets leaves a
  // non-matching string alone, so a uniform map costs them nothing
  assert.equal(r.reds[0].path, 'closeDecl.stages[0].params.allowPrefixes[0]');
  assert.equal(r.reds[0].declared, 'src/nope/');
  assert.equal(r.reds[0].resolved, 'src/nope');
  assert.equal(r.reds[0].found, null);
  assert.equal(r.reds[0].wanted, 'directory');
  // the gate record persists the same reds and must be scrubbed with them
  assert.deepEqual(scanSecrets(JSON.stringify(r.gates.declaration)), []);
});

test('prepareSigning gate 1a: a validation red quoting the DECLARATION is scrubbed in every string field, not just detail', async () => {
  // the model-declared half: an absolute `cmd` is refused by the deny floor, and
  // the refusal quotes the command back TWICE — once in prose and once as the
  // structured `cmd` field. A `detail`-only scrub would mask one and ship the other.
  const cmd = `/opt/${FAKE_TOKEN}/bin/tsc`;
  assert.equal(scanSecrets(cmd).length, 1, 'the fixture must be a shape the ONE inventory actually detects');

  const decl = {
    genre: GENRE,
    lang: 'js',
    stages: [
      guards(['src/'])[0],
      { name: 'verdict', kind: 'command-exit', params: { cmd, args: [], expectExit: 0 } },
      guards(['src/'])[1],
    ],
  };
  const r = await prepareSigning({
    spec: assembleSpec(SPEC_DRAFT, { closeDecl: decl, verdictType: 'green' }),
    workdir: '/patient',
    seedRef: 'deadbee',
    listingFn: async () => { throw new Error('the spec gate must stop the flow before the listing'); },
  });

  assert.equal(r.ok, false);
  const denied = r.reds.find((x) => x.code === 'cmd-denied');
  assert.ok(denied, JSON.stringify(r.reds));
  // the sibling that proves the divergence: the SAME sweep reds this exact shape
  assert.ok(r.reds.some((x) => x.code === 'secret-literal'), 'the ONE inventory reds it — so no red beside it may pass it');

  for (const s of strings(r.reds)) assert.deepEqual(scanSecrets(s), [], `an unmasked token survived: ${s}`);
  assert.ok(denied.detail.includes('[REDACTED:'), 'the prose echo is masked');
  assert.ok(denied.cmd.includes('[REDACTED:'), 'and so is the STRUCTURED echo — a detail-only scrub ships this one');
  assert.match(denied.detail, /names a program outside the repository/, 'the reason survives the mask');
  assert.equal(denied.path, 'closeDecl.stages[1].params.cmd', 'the enumerated path is untouched');
  assert.deepEqual(scanSecrets(JSON.stringify(r.gates.declaration)), []);
});

test('authorCloseForJob: the SAME git stderr channel is scrubbed one function earlier, before any token is spent', async () => {
  // the identical leak two functions away: `authorCloseForJob` reads the seed
  // through the same primitive and carries the same `stop` into the same red
  // code, on the path that runs BEFORE prepareSigning ever sees the job
  const stop = `INSTRUMENT: could not read HEAD in /patient: ${gitStderrWith(FAKE_TOKEN)}`;
  assert.equal(scanSecrets(stop).length, 1, 'the injected stop must really carry it — else nothing is under test');

  const r = await authorCloseForJob({
    verdictType: 'green',
    answers: ANSWERS,
    repoPath: '/patient',
    lang: 'js',
    seedFn: async () => ({ stop, seedRef: null }),
    scoutFn: async () => { throw new Error('the seed read must stop the flow before the scout'); },
  });

  assert.equal(r.ok, false);
  assert.equal(r.stop, 'precheck');
  assert.equal(r.reds[0].code, 'seed-unreadable');
  assert.deepEqual(scanSecrets(r.reds[0].detail), [], 'a credential in git stderr must never reach the returned red');
  assert.ok(r.reds[0].detail.includes('[REDACTED:'));
  assert.match(r.reds[0].detail, /^INSTRUMENT: could not read HEAD in \/patient: fatal: unable to access/);
});

// ── 6. THE WHOLE PIPELINE: answers → a signable spec ─────────────────────────

/** a scripted authoring model: it CALLS the declaration tool, exactly as the
 * real one does (tool mode is the structure-enforced channel — prose is never
 * parsed), and reports a priced round */
const scriptedDeclarer = (declarations) => {
  let i = 0;
  return async (/** @type {any[]} */ _messages, /** @type {any[]} */ tools) => {
    const d = declarations[Math.min(i, declarations.length - 1)];
    i += 1;
    if (tools.length) await tools[0].execute(d);
    return { text: 'declaration delivered', metrics: { costUsd: 0.002, unpricedRounds: 0 } };
  };
};

const SURVEY = (dir) => ({
  state: 'PRESENT',
  reason: null,
  calls: [{ label: 'author-scout', costUsd: 0.001, unpricedRounds: 0 }],
  facts: {
    language: 'javascript', runner: 'node --test',
    sourcePaths: ['src'], testPaths: [], extensions: ['.js'],
    typecheck: { cmd: 'node', args: ['check.mjs'], cwd: null, env: {}, source: 'package.json', inferred: false },
  },
  meta: { bytes: 900, rounds: 2, bounded: false, recovered: false, error: null },
});

test('WHOLE PIPELINE: seven answers in, a validateJob-green spec with a hash out', async (t) => {
  const p = makePatient(t);
  const authored = await authorCloseForJob({
    verdictType: 'green',
    answers: ANSWERS,
    repoPath: p.dir,
    lang: 'js',
    seedRef: p.seed,
    scout: SURVEY(p.dir),
    generate: scriptedDeclarer([{ stages: DECL().stages, notes: ['nothing was inexpressible'] }]),
  });

  assert.equal(authored.ok, true, JSON.stringify(authored.reds));
  assert.equal(authored.verdictType, 'green');
  assert.equal(authored.closeDecl.genre, GENRE);
  assert.equal(authored.closeDecl.lang, 'js');
  assert.deepEqual(authored.closeDecl.stages.map((s) => s.name), ['changed-from-seed', 'verdict', 'no-suppressions']);
  assert.deepEqual(authored.closeDecl.notes, ['nothing was inexpressible']);
  assert.equal(typeof authored.cost.knownUsd, 'number');

  const spec = assembleSpec(SPEC_DRAFT, authored);
  assert.deepEqual(validateJob(spec).reds, []);

  const signing = await prepareSigning({ spec, workdir: p.dir, seedRef: p.seed, timeoutMs: 30_000 });
  assert.equal(signing.ok, true, JSON.stringify(signing.reds));
  assert.equal(signing.specHash, jobSpecHash(spec));
  // the user never wrote a line of the close, and never picked the verdict class
  assert.ok(!JSON.stringify(ANSWERS).includes('command-exit'));
});

/** the PYTHON close as it exists AFTER M3 injected the genre's own MYPYPATH */
const PY_STAGES = (env = { MYPYPATH: 'src' }) => {
  const g = greenGuards('python');
  return [
    { name: g[0].name, kind: g[0].kind, params: { ...g[0].params, allowPrefixes: ['src/'] } },
    {
      name: 'typecheck',
      kind: 'count-not-worse',
      params: {
        cmd: 'python3',
        args: ['-m', 'mypy', '--strict', 'src'],
        parser: { terms: [{ lineMatch: ' error: ', capture: null, sign: 1, aggregate: 'sum', region: 'whole-output' }] },
        scope: { includePrefixes: ['src/'] },
        direction: 'lower-is-better',
        baseline: 0,
        env: { ...env },
      },
    },
    { name: g[1].name, kind: g[1].kind, params: structuredClone(g[1].params) },
  ];
};

// The whole python genre depended on this and could not run: the flow injects
// MYPYPATH after the model's form passes, and every RE-validation then saw the
// genre's own variable sitting in a stage and read it as the model authoring it.
// The composition is where the injection becomes signable evidence.
test('the composed closeDecl RECORDS the genre env the flow injected — and the python spec then VALIDATES', async (t) => {
  const p = makePatient(t);
  const authorFn = async () => ({
    ok: true,
    declaration: { stages: PY_STAGES() },
    // the shape `authorClose` really returns (M3's own probe + the loop's drops)
    genreEnv: { applied: { MYPYPATH: 'src' }, owned: ['MYPYPATH'], missing: [], dropped: [] },
    reds: [], stop: null, cost: { costUsd: 0, knownUsd: 0, spendComplete: true },
  });

  const r = await authorCloseForJob({
    verdictType: 'green',
    verdictType: 'green', answers: ANSWERS, repoPath: p.dir, lang: 'python', seedRef: p.seed, scout: SURVEY(p.dir), authorFn,
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.deepEqual(r.closeDecl.genreEnv, { MYPYPATH: 'src' }, 'what the arbiter injected must ride the signed envelope');

  const spec = assembleSpec(SPEC_DRAFT, r);
  assert.deepEqual(validateJob(spec).reds, [], 'a python closeDecl must not be bricked by the arbiter\'s own injection');
  // …and it is COVERED by the signature, so a later edit to the record is a new hash
  const moved = structuredClone(spec);
  moved.closeDecl.genreEnv = { MYPYPATH: 'src:vendor' };
  assert.notEqual(jobSpecHash(moved), jobSpecHash(spec));

  // the negative, at the SAME gate: a value that is not the one the arbiter built
  const corrupt = structuredClone(spec);
  corrupt.closeDecl.stages[1].params.env.MYPYPATH = 'elsewhere';
  assert.ok(validateJob(corrupt).reds.some((x) => x.code === 'genre-owned-env'), 'a wrong value is the model or corruption');
});

test('a genre that owns NO environment records none — absent is not empty (F59)', async (t) => {
  const p = makePatient(t);
  const authorFn = async () => ({
    ok: true,
    declaration: { stages: DECL().stages },
    genreEnv: { applied: {}, owned: [], missing: [], dropped: [] },
    reds: [], stop: null, cost: null,
  });
  const r = await authorCloseForJob({
    verdictType: 'green',
    verdictType: 'green', answers: ANSWERS, repoPath: p.dir, lang: 'js', seedRef: p.seed, scout: SURVEY(p.dir), authorFn,
  });
  assert.equal(Object.hasOwn(r.closeDecl, 'genreEnv'), false, 'js owns none, so nothing is recorded at all');
  assert.deepEqual(validateJob(assembleSpec(SPEC_DRAFT, r)).reds, []);
});

test('the pipeline REFUSES before spending anything when the interview refuses the CLASS', async () => {
  for (const verdictType of LOCKED_CLASSES) {
    let called = 0;
    const r = await authorCloseForJob({
      verdictType,
      answers: ANSWERS,
      repoPath: '/tmp/x',
      lang: 'js',
      scoutFn: async () => { called += 1; return SURVEY('/tmp/x'); },
      generate: async () => { called += 1; return { text: '' }; },
    });
    assert.equal(r.ok, false);
    assert.equal(r.stop, 'refused');
    assert.equal(r.refusal.verb, verdictType);
    assert.equal(called, 0, 'a refusal costs zero — the interview is the cheapest gate there is');
  }
});

test('THE GENRE REFUSAL MOVED TO THE COMPOSER: a language the catalogue cannot measure is COUNTED demand, not a wiring red', async () => {
  let called = 0;
  const r = await authorCloseForJob({
    verdictType: 'green',
    answers: ANSWERS,
    repoPath: '/tmp/x',
    lang: 'rust',
    seedFn: async () => { called += 1; return { stop: null, seedRef: 'deadbeef' }; },
    scoutFn: async () => { called += 1; return SURVEY('/tmp/x'); },
    generate: async () => { called += 1; return { text: '' }; },
  });
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'refused');
  assert.equal(r.refusal.kind, 'request-red', 'D13\'s refusal survives the slot deletion — it just moved');
  assert.equal(r.refusal.verb, 'genre-other');
  assert.equal(r.refusal.red.lib, REFUSAL_LIB);
  assert.equal(called, 0, 'and it still costs nothing');

  // …and it is COUNTED, end to end, exactly like the slot it replaced
  const occs = classifyIncidents(refusalEvents(r.refusal).map((e, i) => ({ ...e, seq: i + 1 })), { spine: 'authoring' });
  assert.deepEqual(occs.map((o) => [o.class, o.lib, o.verb]), [['request-red', REFUSAL_LIB, 'genre-other']]);
});

test('THE COMPOSER carries a LOCKED KIND up as counted demand — the reds array is not where a refusal hides', async (t) => {
  const p = makePatient(t);
  const authorFn = async () => ({
    ok: false,
    declaration: null,
    reds: [{ code: 'locked-kind', path: 'stages[1].kind', detail: 'locked', kind: 'judged-floor', verb: 'judged-floor', lib: 'bareloop' }],
    stop: 'max-revisions',
    cost: null,
  });
  const r = await authorCloseForJob({
    verdictType: 'green', answers: ANSWERS, repoPath: p.dir, lang: 'js', seedRef: p.seed, scout: SURVEY(p.dir), authorFn,
  });
  assert.equal(r.ok, false);
  assert.equal(r.refusal.kind, 'request-red');
  assert.equal(r.refusal.verb, 'judged-floor');
  assert.equal(r.refusal.red.lib, REFUSAL_LIB);

  // a NON-demand authoring red is never dressed up as demand — that would inflate
  // the very number the admission path exists to measure
  const casualty = async () => ({ ok: false, declaration: null, reds: [{ code: 'provider-red', path: 'author', detail: 'ENETUNREACH' }], stop: 'provider-red', cost: null });
  const c = await authorCloseForJob({
    verdictType: 'green', answers: ANSWERS, repoPath: p.dir, lang: 'js', seedRef: p.seed, scout: SURVEY(p.dir), authorFn: casualty,
  });
  assert.equal(c.refusal, null);
});

test('the pipeline surfaces an ABSENT survey as a refusal to author, never as "no facts needed" (F59)', async (t) => {
  const p = makePatient(t);
  const r = await authorCloseForJob({
    verdictType: 'green',
    verdictType: 'green', answers: ANSWERS, repoPath: p.dir, lang: 'js', seedRef: p.seed,
    scout: { state: 'ABSENT', facts: null, reason: 'survey 0 bytes', calls: [] },
    generate: scriptedDeclarer([{ stages: DECL().stages }]),
  });
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.code === 'scout-absent'), JSON.stringify(r.reds));
});

// ── 7. THE RUNNER SEAM — a declared close, executed by the shipped runPlan ────

const PLAN = JSON.stringify({
  schema: 'plan-v1',
  steps: [{
    id: 'write-fix',
    action: 'Create src/fix.js containing the ok marker.',
    tools: ['write'], rounds: 6, target: 'src/fix.js',
    exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'verdict' }],
  }],
});

test('END TO END: runPlan executes a DECLARED close — precheck red, worker writes, close greens', async (t) => {
  const p = makePatient(t);
  const spec = assembleSpec(SPEC_DRAFT, { closeDecl: DECL(), verdictType: 'green' });
  const jv = validateJob(spec);
  assert.deepEqual(jv.reds, []);

  const provider = scriptedProvider([
    { text: 'src/ holds mod.js; check.mjs is the gate.' },
    { text: PLAN },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(p.dir, 'src', 'fix.js'), content: '// ok\n' } }] },
    { text: 'wrote src/fix.js' },
  ]);
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: p.dir, provider, emit, capRuns: 3, remainingUsd: () => 1.5 });

  assert.equal(outcome, 'green', JSON.stringify(events.filter((e) => e.type === 'escalation')));
  assert.ok(existsSync(join(p.dir, 'src', 'fix.js')));

  // the seed is READ at run start and RECORDED (D8) — never typed into the spec
  const decl = events.find((e) => e.type === 'close-decl');
  assert.ok(decl, 'the declared close records itself on the spine');
  assert.equal(decl.seedRef, p.seed);
  assert.equal(decl.grounded, true, 'the runner re-validates GROUNDED before any stage');
  assert.equal(decl.ok, true);
  assert.deepEqual(decl.stages, ['changed-from-seed', 'verdict', 'no-suppressions']);
  assert.ok(!('seedRef' in spec.closeDecl), 'D12: the close stores the counting RULE, never the number');

  // the precheck ran the DECLARED executor and redded at the guard, first-red-wins
  const pre = events.find((e) => e.type === 'close-precheck');
  assert.equal(pre.verdict, 'needs_revision');
  assert.equal(pre.declared, true);
  assert.equal(pre.stage, 'changed-from-seed');

  // the check menu DERIVED from the declaration's stage names, one hop
  assert.deepEqual(events.find((e) => e.type === 'check-menu').offered, ['changed-from-seed', 'verdict', 'no-suppressions']);
  assert.ok(events.some((e) => e.type === 'check-run' && e.name === 'verdict' && e.verdict === 'satisfied'));
});

test('END TO END: a declaration whose path the tree does not have is refused at the runner BEFORE any token', async (t) => {
  const p = makePatient(t);
  const spec = assembleSpec(SPEC_DRAFT, { closeDecl: DECL({ allowPrefixes: ['src/alertEmail.js'] }), verdictType: 'green' });
  const jv = validateJob(spec);
  assert.deepEqual(jv.reds, [], 'the spec-level gate defers the tree-grounded half — that is the point');

  let calls = 0;
  const provider = { name: 'counting', generate: async () => { calls += 1; return { text: '', toolCalls: [], usage: {}, costUsd: 0, stopReason: null, model: null }; } };
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: p.dir, provider, emit, capRuns: 3, remainingUsd: () => 1.5 });

  assert.equal(outcome, 'close-red');
  assert.equal(calls, 0, 'reds before tokens — the scout never ran');
  const decl = events.find((e) => e.type === 'close-decl');
  assert.equal(decl.ok, false);
  assert.ok(decl.reds.some((r) => r.code === 'path-not-in-listing'));
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc.category, 'broken-close');
  assert.equal(esc.decisionReady, true);
  assert.ok(esc.options.some((o) => /re-sign|re-signing|re-author/i.test(o)));
});

test('END TO END: an unrunnable declared stage escalates by its OWN fault row, with the timeout\'s own lever', async (t) => {
  const p = makePatient(t);
  const spec = assembleSpec(SPEC_DRAFT, {
    closeDecl: {
      genre: GENRE, lang: 'js',
      stages: [
        { name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: ['-e', 'setTimeout(()=>{},60000)'], expectExit: 0, timeoutMs: 400 } },
        guards(['src/'])[0], guards(['src/'])[1],
      ],
    },
    verdictType: 'green',
  });
  const jv = validateJob(spec);
  assert.deepEqual(jv.reds, []);
  let calls = 0;
  const provider = { name: 'counting', generate: async () => { calls += 1; return { text: '', toolCalls: [], usage: {}, costUsd: 0, stopReason: null, model: null }; } };
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: p.dir, provider, emit, capRuns: 3, remainingUsd: () => 1.5 });

  assert.equal(outcome, 'close-red');
  assert.equal(calls, 0);
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'close-timeout', 'NOT broken-close — "raise the timeout" and "fix the argv" are two decisions');
  assert.ok(esc.options.some((o) => /timeout/i.test(o)));
});
