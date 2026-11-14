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
import { plainReasons, plainKinds, redsRecord, signingReasons, signingKinds, signingStopText, DECLARATION_CODES } from '../src/authorreadout.js';
import { createSession } from '../src/panel/authorsession.js';
import { ANTH_CFG } from './helpers.js';

/** P7: the recorded live stages predate fromLine — tag every non-guard stage to job line 1 (the fixture card has one line) */
const GUARD_NAMES = new Set(['changed-from-seed', 'no-suppressions']);
const tagLine1 = (/** @type {any[]} */ stages) => stages.map((x) => (GUARD_NAMES.has(x.name) ? x : { ...x, fromLine: [1] }));

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




/** the REAL mub2nboo shape: two name-echo cases expecting a has-doc red on documented functions, inside a legal-size set */
const mubSet = () => {
  const x = GOOD();
  x[4] = realCase('name-echo-denies-purpose');
  x[5] = realCase('name-echo-and-no-returns');
  return x;
};




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



// ── the SIGNING gates' refusal (F192, 2026-10-09 live panel session smv0nrwe3l8y2) ──

const LIVE = JSON.parse(readFileSync(join(HERE, 'fixtures', 'f192-live-smv0nrwe.json'), 'utf8'));


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
  // M2: a rubric job's broken check never says "install, build and test commands" (the code-job wording)
  const [rj] = signingReasons([{ code: 'broken-close', path: 'closeDecl.stages.line-2', detail: 'x', rubricJob: true }]);
  assert.equal(rj.kind, 'broken-close-rubric');
  assert.doesNotMatch(`${rj.sentence} ${rj.todo}`, /install|build and test/);
  assert.match(signingReasons([{ code: 'broken-close', path: 'closeDecl.stages.suite', detail: 'x' }])[0].todo, /install, build and test/);
  // Part 1a: every rubric-step sorting red is mapped by its prefix and says its own sentence, whole
  for (const code of ['rubric-contradiction', 'rubric-part-guard', 'rubric-part-judged', 'rubric-part-source', 'rubric-part-unsortable', 'rubric-step-line', 'rubric-step-twice']) {
    const [r] = signingReasons([{ code, path: 'closeDecl.stages[1]', detail: `line 3: ${code} sentence.` }]);
    assert.equal(r.kind, 'rubric-part', code);
    assert.equal(r.sentence, `line 3: ${code} sentence.`);
  }
});

test('TRIPWIRE: a new declaration red code fails here until it is mapped in DECLARATION_CODES', () => {
  const found = new Set();
  for (const f of ['declaredclose.js', 'validate.js', 'kinds.js', 'authoring.js', 'judged.js', 'rubricstep.js']) {
    const src = readFileSync(join(HERE, '..', 'src', f), 'utf8');
    for (const m of src.matchAll(/\bred\('([a-z]+(?:-[a-z]+)*)'/g)) found.add(m[1]);
  }
  for (const code of found) {
    // `rubric-*` (Part 1a) are whole plain sentences already; one prefix row of SIGNING_TABLE maps them all
    assert.ok(DECLARATION_CODES.includes(code) || code.startsWith('calibration-') || code.startsWith('rubric-'), `red code "${code}" has no plain signing sentence`);
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


/** @param {any} calibration @param {import('node:test').TestContext} t */
async function panelWithCalibration(calibration, t) {
  const mk = () => { const d = mkdtempSync(join(tmpdir(), 'plaincal-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
  const home = mk();
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 }); writeFileSync(join(home, 'config.json'), JSON.stringify(ANTH_CFG));
  const repo = mk();
  git(repo, ['init', '-q', '-b', 'main']);
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src', 'mod.js'), '// nothing yet\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'seed']);
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'plain-cal-job', jobText: 'document things\n~ documented functions only', inputs: `repo: ${repo}`,
    destination: 'src/', capUsd: 2,
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
      declaration: { stages: tagLine1(LIVE.liveStages), notes: LIVE.liveNotes },
    }),
    prepareSigningFn: async () => ({ ok: false, specHash: null, seedRef: null, work: [], guards: [], stops: [], reds: LIVE.signingReds, refusal: LIVE.signingRefusal, gates: { calibration } }),
  });
  for (let i = 0; i < 500 && session.state.pendingAsk?.kind !== 'menu'; i += 1) await new Promise((r) => { setTimeout(r, 10); });
  assert.equal(session.signPrepare().ok, true);
  for (let i = 0; i < 500 && !['refused', 'abandoned'].includes(session.state.phase); i += 1) await new Promise((r) => { setTimeout(r, 10); });
  assert.equal(session.state.phase, 'refused', String(session.state.error));
  return session;
}


