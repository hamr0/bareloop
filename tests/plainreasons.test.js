// A refused rubric proposal reads in PLAIN words (hamr, 2026-10-09: "A user should get a reason that they can
// understand and do something about, proposal invalid is unclear"). The reds come from the REAL validators; the
// real mub2nboo name-echo cases (tests/fixtures/f192-params-real.json) drive the panel and CLI text end to end.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { validateJudgedArtifacts, validateCalibrationSet, CALIBRATION_SIZE } from '../src/judged.js';
import { signJudgedArtifacts, PROPOSAL_TOOL_NAME } from '../src/cardauthor.js';
import { plainReasons, plainKinds, proposalStopText, redsRecord, signingReasons, signingKinds, signingStopText, DECLARATION_CODES, calibrationSummary } from '../src/authorreadout.js';
import { createSession } from '../src/panel/authorsession.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const F192P = JSON.parse(readFileSync(join(HERE, 'fixtures', 'f192-params-real.json'), 'utf8'));

const CARD = () => ({
  items: [
    { rule: 'has-doc', text: 'Every top-level function has a JSDoc block directly above it.' },
    { rule: 'params', text: 'Every parameter is named in an @param tag.' },
    { rule: 'returns', text: 'Every returned value is documented with @returns.' },
  ],
});
/** a LEGAL set of CALIBRATION_SIZE cases: one red, the rest passes */
const GOOD = () => Array.from({ length: CALIBRATION_SIZE }, (_, i) => ({
  id: `case-${i}`,
  artifact: `/** doc ${i} */\nfunction g${i}(a) {\n  return a;\n}\n`,
  expect: i === 0 ? { verdict: 'red', reds: [{ rule: 'params', fn: 'g0' }] } : { verdict: 'pass', reds: [] },
}));
const realCase = (/** @type {string} */ id) => ({ id, artifact: F192P[id].artifact, expect: F192P[id].expect });

test('the legal baseline set raises no red (so every red below is the mutation\'s own)', () => {
  assert.deepEqual(validateJudgedArtifacts({ card: CARD(), cases: GOOD() }).reds, []);
});

/** every red site in the proposal path, tripped on purpose: [expected kind, card, cases] */
const SITES = (() => {
  const c = (/** @type {(x: any[]) => void} */ f) => { const x = GOOD(); f(x); return x; };
  /** @type {[string, any, any][]} */
  const rows = [
    ['card-not-object', null, GOOD()],
    ['card-empty', { items: [] }, GOOD()],
    ['card-line-bad', { items: [null, ...CARD().items] }, GOOD()],
    ['card-line-no-rule', { items: [{ text: 'x' }, ...CARD().items] }, GOOD()],
    ['card-line-unknown-rule', { items: [{ rule: 'nope', text: 'x' }, ...CARD().items] }, GOOD()],
    ['card-line-repeat', { items: [...CARD().items, CARD().items[0]] }, GOOD()],
    ['card-line-no-text', { items: [{ rule: 'has-doc' }] }, GOOD()],
    ['set-no-rules', { items: [] }, GOOD()],
    ['set-not-list', CARD(), 'not a list'],
    ['set-size', CARD(), GOOD().slice(0, 9)],
    ['set-one-sided', CARD(), c((x) => { x[0].expect = { verdict: 'pass', reds: [] }; })],
    ['case-not-object', CARD(), c((x) => { x[3] = 'nope'; })],
    ['case-name-repeat', CARD(), c((x) => { x[3].id = x[2].id; })],
    ['case-name-bad', CARD(), c((x) => { x[3].id = 'Not A Slug'; })],
    ['case-code-repeat', CARD(), c((x) => { x[3].artifact = x[2].artifact; })],
    ['case-code-missing', CARD(), c((x) => { x[3].artifact = ''; })],
    ['case-impossible-no-doc', CARD(), c((x) => { x[3] = realCase('name-echo-denies-purpose'); })],
    ['case-pass-lists-fails', CARD(), c((x) => { x[3].expect.reds = [{ rule: 'params', fn: 'g3' }]; })],
    ['case-fail-lists-nothing', CARD(), c((x) => { x[0].expect.reds = []; })],
    ['case-fails-not-list', CARD(), c((x) => { x[3].expect.reds = 'none'; })],
    ['case-no-expected', CARD(), c((x) => { x[3].expect = null; })],
    ['case-verdict-bad', CARD(), c((x) => { x[3].expect = { verdict: 'maybe', reds: [] }; })],
    ['case-fail-malformed', CARD(), c((x) => { x[0].expect.reds = ['params']; })],
    ['case-fail-repeat', CARD(), c((x) => { x[0].expect.reds = [{ rule: 'params', fn: 'g0' }, { rule: 'params', fn: 'g0' }]; })],
    ['case-fail-rule-foreign', { items: [CARD().items[0]] }, GOOD()],
    ['case-fail-rule-missing', CARD(), c((x) => { x[0].expect.reds = [{ fn: 'g0' }]; })],
    ['case-fail-fn-missing', CARD(), c((x) => { x[0].expect.reds = [{ rule: 'params' }]; })],
  ];
  return rows;
})();

test('every red the proposal validators can raise has a plain sentence (none unmapped), and every kind is reachable', () => {
  const hit = new Set();
  for (const [kind, card, cases] of SITES) {
    const v = validateJudgedArtifacts({ card, cases });
    const reasons = plainReasons(v.reds, { cases });
    assert.ok(reasons.length > 0, `${kind}: the mutation raised no red`);
    assert.ok(reasons.some((r) => r.kind === kind), `${kind}: got ${JSON.stringify(reasons.map((r) => r.kind))} from ${JSON.stringify(v.reds)}`);
    for (const r of reasons) { assert.notEqual(r.kind, 'unmapped', JSON.stringify(r.red)); hit.add(r.kind); }
  }
  // the signer-side red (signJudgedArtifacts on a non-object)
  const s = signJudgedArtifacts({ proposal: null });
  for (const r of plainReasons(s.reds)) { assert.notEqual(r.kind, 'unmapped'); hit.add(r.kind); }
  assert.deepEqual([...hit].sort(), plainKinds().sort(), 'a kind with no fixture here is a sentence nothing proves');
});

test('TRIPWIRE: a new red site in the validators fails here until it is mapped and given a fixture above', () => {
  const src = readFileSync(join(HERE, '..', 'src', 'judged.js'), 'utf8');
  assert.equal((src.match(/red\('calibration-/g) ?? []).length, 20, 'validateCalibrationSet red sites changed — map the new reason in src/authorreadout.js and add a SITES row');
  const card = src.slice(src.indexOf('export function validateCard('), src.indexOf('// ── THE CALIBRATION SET'));
  assert.equal((card.match(/reds\.push\(|reds: \[/g) ?? []).length, 7, 'validateCard red sites changed — map the new reason and add a SITES row');
});

test('an unknown code is never dropped: a generic sentence that still quotes the code', () => {
  const [r] = plainReasons([{ code: 'brand-new-red', path: 'somewhere', detail: 'x' }]);
  assert.equal(r.kind, 'unmapped');
  assert.match(r.sentence, /"brand-new-red" at somewhere/);
  assert.equal(r.red.detail, 'x');
});

/** the REAL mub2nboo shape: two name-echo cases expecting a has-doc red on documented functions, inside a legal-size set */
const mubSet = () => {
  const x = GOOD();
  x[4] = realCase('name-echo-denies-purpose');
  x[5] = realCase('name-echo-and-no-returns');
  return x;
};

test('REAL SHAPE: the mub2nboo set is refused and the message names the case and the function in plain words', () => {
  const cases = mubSet();
  const v = validateJudgedArtifacts({ card: CARD(), cases });
  assert.equal(v.ok, false);
  const text = proposalStopText({ stop: 'proposal-invalid', reds: v.reds, cases, spend: { knownUsd: 0.0805, spendComplete: true } });
  assert.match(text, /Case "name-echo-denies-purpose" says "fail: no doc comment" on parseDate, but parseDate has a doc comment right above it\./);
  assert.match(text, /Case "name-echo-and-no-returns" says "fail: no doc comment" on slugify/);
  assert.match(text, /Spent so far: \$0\.08\./);
  assert.match(text, /This is the model's mistake, not yours\./);
  assert.match(text, /What to do: draft again \(about \$0\.08 to reach here\)\./);
  assert.doesNotMatch(text, /proposal-invalid|calibration-case|invalid-value/, 'no raw code reaches the person');
});

test('spend: unknown stays unknown, an unpriced call says "at least", and the clause is dropped when there is no figure', () => {
  const reds = validateCalibrationSet(GOOD().slice(0, 9), { card: CARD() }).reds;
  const none = proposalStopText({ stop: 'proposal-invalid', reds, spend: null });
  assert.match(none, /Spent so far: unknown\./);
  assert.match(none, /What to do: draft again\./);
  assert.doesNotMatch(none, /to reach here/);
  const floor = proposalStopText({ stop: 'proposal-invalid', reds, spend: { knownUsd: 0.1, spendComplete: false } });
  assert.match(floor, /Spent so far: at least \$0\.10\./);
  const tiny = proposalStopText({ stop: 'proposal-invalid', reds, spend: { knownUsd: 0.001, spendComplete: true } });
  assert.match(tiny, /Spent so far: <\$0\.01\./);
});

test('the set-size sentence reads the live constant, and the one-sided sentence the real counts', () => {
  const size = plainReasons(validateCalibrationSet(GOOD().slice(0, 9), { card: CARD() }).reds)[0].sentence;
  assert.equal(size, `The model gave 9 practice cases; exactly ${CALIBRATION_SIZE} are needed.`);
  const one = GOOD(); one[0].expect = { verdict: 'pass', reds: [] };
  const side = plainReasons(validateCalibrationSet(one, { card: CARD() }).reds)[0].sentence;
  assert.match(side, new RegExp(`${CALIBRATION_SIZE} pass and 0 fail`));
});

test('redsRecord keeps every structured field, scrubs a secret and bounds a long string', () => {
  const cases = GOOD();
  cases[3].artifact = 'x';
  const rec = redsRecord([
    { code: 'calibration-case', path: 'calibration.cases[3].expect.reds', detail: `leak sk-ant-api03-${'a'.repeat(40)} ${'z'.repeat(2000)}`, extra: 7 },
  ], { cases });
  assert.equal(rec[0].code, 'calibration-case');
  assert.equal(rec[0].path, 'calibration.cases[3].expect.reds');
  assert.equal(rec[0].extra, 7);
  assert.ok(typeof rec[0].plain === 'string' && rec[0].kind);
  assert.doesNotMatch(rec[0].detail, /sk-ant-api03-a{10}/);
  assert.ok(rec[0].detail.length <= 601);
});

// ── the panel door: a REAL session whose authoring stops on the real reds ──

const git = (/** @type {string} */ dir, /** @type {string[]} */ args) => execFileSync('git', args, {
  cwd: dir, encoding: 'utf8',
  env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
});

test('PANEL: a proposal-invalid stop shows the plain message under the failed step and writes the full reds to draft-log.jsonl', async (t) => {
  const mk = () => { const d = mkdtempSync(join(tmpdir(), 'plainreasons-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
  const home = mk();
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  const repo = mk();
  git(repo, ['init', '-q', '-b', 'main']);
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src', 'mod.js'), '// nothing yet\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'seed']);
  const cases = mubSet();
  const reds = validateJudgedArtifacts({ card: CARD(), cases }).reds;
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'plain-reasons-job', goal: 'document things', source: repo,
    destination: 'src/', success: 'docs', guardrails: 'none', judgeExamples: 'pass: documented. fail: undocumented.', capUsd: 2,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionsRoot: join(home, 'panel-sessions'),
    scout: { state: 'PRESENT', facts: { sourcePaths: ['src/mod.js'], testPaths: [] }, calls: [], raws: [] },
    // the REAL proposal path: the model's tool call delivers the mub2nboo-shaped set, proposeJudgedArtifacts validates it
    generate: async (/** @type {any} */ _m, /** @type {any} */ tools) => {
      await tools.find((/** @type {any} */ x) => x.name === PROPOSAL_TOOL_NAME).execute({ card: CARD(), cases });
      return { text: '', error: null, msgs: [], metrics: { costUsd: 0.08, unpricedRounds: 0 } };
    },
    confirmGenerate: async (_c, tools) => {
      const plan = { goal: 'document things', checks: ['docs'], questions: [], notChecked: [] };
      if (tools && tools[0] && typeof tools[0].execute === 'function') await tools[0].execute(plan);
      return { text: JSON.stringify(plan), error: null, cost: 0.0005 };
    },
    authorFn: async () => ({
      ok: true, reds: [], stop: null, genreEnv: { applied: {} }, cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [] },
      declaration: { stages: [{ name: 'judged', kind: 'judged-floor', params: { card: { items: [{ rule: 'has-doc', text: 'documented' }] }, paths: ['src/mod.js'] } }], notes: [] },
    }),
  });
  for (let i = 0; i < 500 && session.state.pendingAsk?.kind !== 'menu'; i += 1) await new Promise((r) => { setTimeout(r, 10); });
  assert.equal(session.signPrepare().ok, true);
  for (let i = 0; i < 500 && !['refused', 'abandoned'].includes(session.state.phase); i += 1) await new Promise((r) => { setTimeout(r, 10); });
  assert.equal(session.state.phase, 'refused', String(session.state.error));
  const failed = session.state.steps.find((/** @type {any} */ x) => x.status === 'failed');
  assert.ok(failed, 'a failed step carries the message');
  assert.equal(failed.detail, session.state.error);
  assert.match(failed.detail, /Case "name-echo-denies-purpose" says "fail: no doc comment" on parseDate/);
  assert.match(failed.detail, /Spent so far: \$0\.08\./);
  assert.doesNotMatch(failed.detail, /Stopped: proposal-invalid/);
  // the same text the CLI prints (one function, two doors)
  assert.equal(failed.detail, proposalStopText({
    stop: 'proposal-invalid', reds, cases, spend: { knownUsd: session.state.draftSpentUsd, spendComplete: true },
  }));
  assert.equal(session.state.draftSpentUsd, 0.0805, 'the figure shown is the session\'s own metered tally');
  const log = readFileSync(join(session.state.outDir, 'draft-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const rec = log.find((e) => e.kind === 'step-reds');
  assert.ok(rec, 'the reds are in the record');
  assert.equal(rec.stop, 'proposal-invalid');
  assert.equal(rec.reds.length, reds.length);
  assert.equal(rec.reds[0].code, 'calibration-case');
  assert.match(rec.reds[0].path, /^calibration\.cases\[\d\]\.expect\.reds$/);
  assert.match(rec.reds[0].detail, /has-doc red on parseDate/);
  assert.match(rec.reds[0].plain, /parseDate/);
  const end = log.find((e) => e.kind === 'step-end' && e.status === 'failed');
  assert.ok(end && rec.no === end.no, 'the reds sit on the same step that failed');
});

test('CLI door: the run-author path prints the same function', () => {
  const src = readFileSync(join(HERE, '..', 'src', 'authorrun.js'), 'utf8');
  assert.match(src, /PLAIN_PROPOSAL_STOPS\.includes\(String\(authored\.stop\)\)[\s\S]{0,200}proposalStopText\(/);
});

// ── the SIGNING gates' refusal (F192, 2026-10-09 live panel session smv0nrwe3l8y2) ──

const LIVE = JSON.parse(readFileSync(join(HERE, 'fixtures', 'f192-live-smv0nrwe.json'), 'utf8'));

test('SIGNING: the three real miswrites and the injection leak read in plain words, honest about whose fault', () => {
  const text = signingStopText({ reds: LIVE.signingReds, spend: { knownUsd: 0.0912, spendComplete: true } });
  assert.doesNotMatch(text, /calibration-miswrite|injection-leak/);
  assert.match(text, /Spent so far: \$0\.09\./);
  assert.match(text, /Case "no-doc-block-at-all" \(resetCounters\): the check says the doc only repeats the function's name, but the practice case did not expect that\./);
  assert.match(text, /Case "name-echo-plus-untagged-param" \(initCache\): the practice case says the doc only repeats the function's name, but the check passed it\./);
  assert.match(text, /Case "tag-names-wrong-parameter-on-destructured" \(buildQuery\): the practice case says a parameter is missing from the doc, or the doc names one that does not exist, but the check passed it\./);
  assert.match(text, /A test file tried to trick the judge \("fake system marker"\)/);
  assert.match(text, /The practice cases and the check disagree; either one can be the one that is wrong/);
  assert.doesNotMatch(text, /model's mistake/);
  assert.match(text, /What to do: draft again \(about \$0\.09 to reach here\)\./);
  assert.match(signingStopText({ reds: LIVE.signingReds, spend: null }), /Spent so far: unknown\./);
});

test('SIGNING: no red at all (the close already passes at the seed) has its own sentence', () => {
  assert.match(signingStopText({ reds: [], refusal: LIVE.signingRefusal }), /Nothing in the close fails on the repository as it is/);
});

test('SIGNING: every red code reachable at the refusal is mapped; an unknown one quotes its code', () => {
  /** @type {Record<string, string>} code to the kind it must get */
  const want = {
    'calibration-miswrite': 'miswrite', 'injection-leak': 'injection-leak', 'calibration-missing': 'calibration-missing',
    'no-judge-seam': 'no-judge', 'cap-halt': 'cap-halt', 'pricing-red': 'pricing-red', 'provider-red': 'provider-red',
    'artifact-red': 'artifact-red', 'broken-close': 'broken-close', 'seed-unreadable': 'seed-unreadable',
    'listing-unreadable': 'listing-unreadable',
  };
  for (const [code, kind] of Object.entries(want)) {
    const [r] = signingReasons([{ code, path: 'closeDecl.stages.suite', detail: 'x', caseId: 'c1' }]);
    assert.equal(r.kind, kind, code);
    assert.ok(r.todo && r.sentence);
  }
  for (const code of DECLARATION_CODES) {
    if (code === 'judged-outside-write-scope') continue; // worded in plain words of its own (tests/judgedfence.test.js)
    const [r] = signingReasons([{ code, path: 'closeDecl.x', detail: 'x' }]);
    assert.equal(r.kind, 'declaration', code);
    assert.match(r.sentence, new RegExp(`"${code}"`));
  }
  // invalid-set reds the proposal table already words (card path, calibration-*)
  assert.notEqual(signingReasons([{ code: 'invalid-value', path: 'card', detail: 'the card must be an object' }])[0].kind, 'unmapped');
  assert.notEqual(signingReasons([{ code: 'calibration-size', path: 'calibration.cases', detail: 'x', declared: 3 }])[0].kind, 'unmapped');
  const [u] = signingReasons([{ code: 'brand-new-gate-red', path: 'somewhere', detail: 'x' }]);
  assert.equal(u.kind, 'unmapped');
  assert.match(u.sentence, /"brand-new-gate-red" at somewhere/);
  assert.ok(signingKinds().includes('unmapped'));
});

test('TRIPWIRE: a new declaration red code fails here until it is mapped in DECLARATION_CODES', () => {
  const found = new Set();
  for (const f of ['declaredclose.js', 'validate.js', 'kinds.js', 'authoring.js', 'judged.js']) {
    const src = readFileSync(join(HERE, '..', 'src', f), 'utf8');
    for (const m of src.matchAll(/\bred\('([a-z]+(?:-[a-z]+)*)'/g)) found.add(m[1]);
  }
  for (const code of found) {
    assert.ok(DECLARATION_CODES.includes(code) || code.startsWith('calibration-'), `red code "${code}" has no plain signing sentence`);
  }
  assert.ok(found.size >= 20, 'the scan found the red sites');
});

test('SIGNING redsRecord: the signing sentence rides beside every structured field', () => {
  const rec = redsRecord(LIVE.signingReds, { signing: true });
  assert.equal(rec.length, 4);
  assert.equal(rec[1].code, 'calibration-miswrite');
  assert.match(rec[1].plain, /initCache/);
  assert.equal(rec[1].caseId, 'name-echo-plus-untagged-param');
});

test('PANEL: a signing-gates refusal shows the plain message and writes the full reds to draft-log.jsonl', async (t) => {
  const mk = () => { const d = mkdtempSync(join(tmpdir(), 'plainsign-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
  const home = mk();
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  const repo = mk();
  git(repo, ['init', '-q', '-b', 'main']);
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src', 'mod.js'), '// nothing yet\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'seed']);
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'plain-sign-job', goal: 'document things', source: repo,
    destination: 'src/', success: 'docs', guardrails: 'none', judgeExamples: 'pass: documented. fail: undocumented.', capUsd: 2,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionsRoot: join(home, 'panel-sessions'),
    scout: { state: 'PRESENT', facts: { sourcePaths: ['src/mod.js'], testPaths: [] }, calls: [], raws: [] },
    generate: async (/** @type {any} */ _m, /** @type {any} */ tools) => {
      await tools.find((/** @type {any} */ x) => x.name === PROPOSAL_TOOL_NAME).execute({ card: LIVE.card, cases: Object.entries(LIVE.cases).map(([id, c]) => ({ id, artifact: c.artifact, expect: c.expect })) });
      return { text: '', error: null, msgs: [], metrics: { costUsd: 0.08, unpricedRounds: 0 } };
    },
    confirmGenerate: async (_c, tools) => {
      const plan = { goal: 'document things', checks: ['docs'], questions: [], notChecked: [] };
      if (tools && tools[0] && typeof tools[0].execute === 'function') await tools[0].execute(plan);
      return { text: JSON.stringify(plan), error: null, cost: 0.0005 };
    },
    authorFn: async () => ({
      ok: true, reds: [], stop: null, genreEnv: { applied: {} }, cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [] },
      declaration: { stages: LIVE.liveStages, notes: LIVE.liveNotes },
    }),
    prepareSigningFn: async () => ({ ok: false, specHash: null, seedRef: null, work: [], guards: [], stops: [], reds: LIVE.signingReds, refusal: LIVE.signingRefusal, gates: {} }),
  });
  for (let i = 0; i < 500 && session.state.pendingAsk?.kind !== 'menu'; i += 1) await new Promise((r) => { setTimeout(r, 10); });
  assert.equal(session.signPrepare().ok, true);
  for (let i = 0; i < 500 && !['refused', 'abandoned'].includes(session.state.phase); i += 1) await new Promise((r) => { setTimeout(r, 10); });
  assert.equal(session.state.phase, 'refused', String(session.state.error));
  const failed = session.state.steps.find((/** @type {any} */ x) => x.status === 'failed');
  assert.ok(failed);
  assert.doesNotMatch(failed.detail, /signing gates failed/);
  assert.match(failed.detail, /Case "name-echo-plus-untagged-param" \(initCache\)/);
  assert.equal(failed.detail, signingStopText({
    reds: LIVE.signingReds, refusal: LIVE.signingRefusal, spend: { knownUsd: session.state.draftSpentUsd, spendComplete: session.state.draftSpendComplete },
  }));
  const log = readFileSync(join(session.state.outDir, 'draft-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const rec = log.find((e) => e.kind === 'step-reds');
  assert.ok(rec, 'the reds are in the record');
  assert.equal(rec.stop, 'signing-gates-failed');
  assert.equal(rec.reds.length, 4);
  assert.equal(rec.reds[3].code, 'injection-leak');
  const end = log.find((e) => e.kind === 'step-end' && e.status === 'failed');
  assert.ok(end && rec.no === end.no, 'the reds sit on the same step that failed');
});

test('CLI door: the run-author signing refusal prints the same function', () => {
  const src = readFileSync(join(HERE, '..', 'src', 'authorrun.js'), 'utf8');
  assert.match(src, /if \(!signing\.ok\) \{[\s\S]{0,200}signingStopText\(/);
});

// ── item 7: the calibrating step says its real result (hamr, 2026-10-09) ──

const LIVE2 = JSON.parse(readFileSync(join(HERE, 'fixtures', 'f192-live-smv0o4mex.json'), 'utf8'));
/** the live record made into a PASS: every graded row right, every style resisted, ok true */
const passingCalibration = () => ({
  ...LIVE2.calibration, ok: true, stop: null,
  graded: LIVE2.calibration.graded.map((/** @type {any} */ g) => ({ ...g, ok: true })),
  injection: { ...LIVE2.calibration.injection, styles: LIVE2.calibration.injection.styles.map((/** @type {any} */ x) => ({ ...x, resisted: true })) },
});

test('calibrationSummary: the real smv0o4mex8ddj result reads 8 of 10 and 3 of 5 and fails; a passing record reads 10 of 10 and 5 of 5', () => {
  const bad = calibrationSummary(LIVE2.calibration);
  assert.ok(bad);
  assert.equal(bad.ok, false);
  assert.equal(bad.note, '8 of 10 practice cases graded right · 3 of 5 attack tests resisted');
  const good = calibrationSummary(passingCalibration());
  assert.ok(good);
  assert.equal(good.ok, true);
  assert.equal(good.note, '10 of 10 practice cases graded right · 5 of 5 attack tests resisted');
  assert.equal(calibrationSummary(null), null);
  // a gate that stopped part-way reads x of 10, not x of x
  assert.match(calibrationSummary({ ok: false, graded: [{ ok: true }], injection: { styles: [] } })?.note ?? '', /^1 of 10 .* 0 of 5 /);
});

/** @param {any} calibration @param {import('node:test').TestContext} t */
async function panelWithCalibration(calibration, t) {
  const mk = () => { const d = mkdtempSync(join(tmpdir(), 'plaincal-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
  const home = mk();
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  const repo = mk();
  git(repo, ['init', '-q', '-b', 'main']);
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src', 'mod.js'), '// nothing yet\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'seed']);
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'plain-cal-job', goal: 'document things', source: repo,
    destination: 'src/', success: 'docs', guardrails: 'none', judgeExamples: 'pass: documented. fail: undocumented.', capUsd: 2,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionsRoot: join(home, 'panel-sessions'),
    scout: { state: 'PRESENT', facts: { sourcePaths: ['src/mod.js'], testPaths: [] }, calls: [], raws: [] },
    generate: async (/** @type {any} */ _m, /** @type {any} */ tools) => {
      await tools.find((/** @type {any} */ x) => x.name === PROPOSAL_TOOL_NAME).execute({ card: LIVE.card, cases: Object.entries(LIVE.cases).map(([id, c]) => ({ id, artifact: c.artifact, expect: c.expect })) });
      return { text: '', error: null, msgs: [], metrics: { costUsd: 0.08, unpricedRounds: 0 } };
    },
    confirmGenerate: async (_c, tools) => {
      const plan = { goal: 'document things', checks: ['docs'], questions: [], notChecked: [] };
      if (tools && tools[0] && typeof tools[0].execute === 'function') await tools[0].execute(plan);
      return { text: JSON.stringify(plan), error: null, cost: 0.0005 };
    },
    authorFn: async () => ({
      ok: true, reds: [], stop: null, genreEnv: { applied: {} }, cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [] },
      declaration: { stages: LIVE.liveStages, notes: LIVE.liveNotes },
    }),
    prepareSigningFn: async () => ({ ok: false, specHash: null, seedRef: null, work: [], guards: [], stops: [], reds: LIVE.signingReds, refusal: LIVE.signingRefusal, gates: { calibration } }),
  });
  for (let i = 0; i < 500 && session.state.pendingAsk?.kind !== 'menu'; i += 1) await new Promise((r) => { setTimeout(r, 10); });
  assert.equal(session.signPrepare().ok, true);
  for (let i = 0; i < 500 && !['refused', 'abandoned'].includes(session.state.phase); i += 1) await new Promise((r) => { setTimeout(r, 10); });
  assert.equal(session.state.phase, 'refused', String(session.state.error));
  return session;
}

test('PANEL: the calibrating line shows the gate\'s real result: x when it failed (8 of 10, 3 of 5), done when it passed', async (t) => {
  const bad = await panelWithCalibration(LIVE2.calibration, t);
  const cal = bad.state.steps.find((/** @type {any} */ x) => x.id === 'calibrate');
  assert.ok(cal, 'the calibrating line exists');
  assert.equal(cal.status, 'failed');
  assert.equal(cal.detail, '8 of 10 practice cases graded right · 3 of 5 attack tests resisted');
  const good = await panelWithCalibration(passingCalibration(), t);
  const cal2 = good.state.steps.find((/** @type {any} */ x) => x.id === 'calibrate');
  assert.ok(cal2);
  assert.equal(cal2.status, 'done');
  assert.equal(cal2.detail, '10 of 10 practice cases graded right · 5 of 5 attack tests resisted');
  // the later gates line still fails on its own
  assert.equal(good.state.steps.find((/** @type {any} */ x) => x.id === 'gates')?.status, 'failed');
});
