// A refused drafting or signing reads in PLAIN words (hamr, 2026-10-09: "A user should get a reason that they can
// understand and do something about"). hamr 2026-11-14: the card and practice-case wording went with the old judge.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redsRecord, signingReasons, signingKinds, signingStopText, DECLARATION_CODES } from '../src/authorreadout.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIVE = JSON.parse(readFileSync(join(HERE, 'fixtures', 'f192-live-smv0nrwe.json'), 'utf8'));

test('redsRecord keeps every structured field, scrubs a secret and bounds a long string', () => {
  const rec = redsRecord([
    { code: 'invalid-value', path: 'closeDecl.stages[3].params.x', detail: `leak sk-ant-api03-${'a'.repeat(40)} ${'z'.repeat(2000)}`, extra: 7 },
  ]);
  assert.equal(rec[0].code, 'invalid-value');
  assert.equal(rec[0].path, 'closeDecl.stages[3].params.x');
  assert.equal(rec[0].extra, 7);
  assert.ok(typeof rec[0].plain === 'string' && rec[0].kind);
  assert.doesNotMatch(rec[0].detail, /sk-ant-api03-a{10}/);
  assert.ok(rec[0].detail.length <= 601);
});

test('SIGNING: no red at all (the close already passes at the seed) has its own sentence', () => {
  assert.match(signingStopText({ reds: [], refusal: LIVE.signingRefusal }), /Nothing in the close fails on the repository as it is/);
});

test('SIGNING: every red code reachable at the refusal is mapped; an unknown one quotes its code', () => {
  /** @type {Record<string, string>} code to the kind it must get */
  const want = {
    'broken-close': 'broken-close', 'seed-unreadable': 'seed-unreadable',
    'listing-unreadable': 'listing-unreadable',
  };
  for (const [code, kind] of Object.entries(want)) {
    const [r] = signingReasons([{ code, path: 'closeDecl.stages.suite', detail: 'x', caseId: 'c1' }]);
    assert.equal(r.kind, kind, code);
    assert.ok(r.todo && r.sentence);
  }
  for (const code of DECLARATION_CODES) {
    const [r] = signingReasons([{ code, path: 'closeDecl.x', detail: 'x' }]);
    assert.equal(r.kind, 'declaration', code);
    assert.match(r.sentence, new RegExp(`"${code}"`));
  }
  // the old judge's calibration reds have no wording of their own any more: they fall to the generic sentence
  assert.equal(signingReasons([{ code: 'calibration-miswrite', path: 'x', detail: 'x' }])[0].kind, 'unmapped');
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
  for (const f of ['declaredclose.js', 'validate.js', 'kinds.js', 'authoring.js', 'rubricstep.js']) {
    const src = readFileSync(join(HERE, '..', 'src', f), 'utf8');
    for (const m of src.matchAll(/\bred\('([a-z]+(?:-[a-z]+)*)'/g)) found.add(m[1]);
  }
  for (const code of found) {
    // `rubric-*` (Part 1a) are whole plain sentences already; one prefix row of SIGNING_TABLE maps them all
    assert.ok(DECLARATION_CODES.includes(code) || code.startsWith('rubric-'), `red code "${code}" has no plain signing sentence`);
  }
  assert.ok(found.size >= 20, 'the scan found the red sites');
});

test('CLI door: the run-author signing refusal prints the same function', () => {
  const src = readFileSync(join(HERE, '..', 'src', 'authorrun.js'), 'utf8');
  assert.match(src, /if \(!signing\.ok\) \{[\s\S]{0,200}signingStopText\(/);
});

