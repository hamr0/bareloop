// Rules extractor — token-free over a scripted stub provider (the provider is
// the shell's legitimate seam). Contract under test: one sealed shot, never
// throws, the ≤5-rules/≤200-chars bound is enforced mechanically post-call
// (rejected whole, never trimmed — rejecting a half-applicable output beats
// silently part-applying it), malformed output is a red as DATA (never a
// silent empty inheritance), and the extractor sees ledger facts only —
// config, verdict, revision diff, prior rules — never a close or test text.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRules, MAX_RULES, MAX_RULE_CHARS } from '../src/extract.js';
import { scriptedProvider, validConfig } from './helpers.js';

const stub = (/** @type {string} */ text) => scriptedProvider([{ text }]);
const config = validConfig;
const GOOD = JSON.stringify(['prefer refine on this family', 'recall with high k went green']);

test('valid rules list → carried through with cost', async () => {
  const r = await extractRules({ config: config(), provider: stub(GOOD), priorRules: null });
  assert.equal(r.valid, true);
  assert.deepEqual(r.reds, []);
  assert.deepEqual(r.rules, JSON.parse(GOOD));
  assert.ok(r.costUsd > 0, 'extractor spend must be carried — upkeep never rides free');
});

test('markdown-fenced JSON still parses', async () => {
  const r = await extractRules({ config: config(), provider: stub('```json\n' + GOOD + '\n```'), priorRules: null });
  assert.equal(r.valid, true);
});

test('non-JSON output → parse-error red as data, rules null, never a throw', async () => {
  const r = await extractRules({ config: config(), provider: stub('Lesson one: refine is good.'), priorRules: null });
  assert.equal(r.valid, false);
  assert.equal(r.rules, null);
  assert.equal(r.reds[0].code, 'parse-error');
});

test('empty response → the parser\'s OWN named red (artifact-red), not a generic JSON parse error', async () => {
  // extractArtifact already diagnoses '' as {code: null, red: 'empty response'};
  // collapsing that to raw='' and letting JSON.parse('') throw would bury the
  // computed diagnosis under "Unexpected end of JSON input" (ONE-parser doctrine:
  // its red field is part of the contract, both callers must consume it)
  const r = await extractRules({ config: config(), provider: stub(''), priorRules: null });
  assert.equal(r.valid, false);
  assert.equal(r.rules, null);
  assert.equal(r.reds[0].code, 'artifact-red');
  assert.match(r.reds[0].detail, /empty response/);
});

test('non-array / non-string elements → shape red', async () => {
  for (const bad of ['{"rules": []}', '[1, 2]', '["ok", null]']) {
    const r = await extractRules({ config: config(), provider: stub(bad), priorRules: null });
    assert.equal(r.valid, false, `${bad} must red`);
    assert.equal(r.reds[0].code, 'rules-shape');
  }
});

test('too many rules → red, rejected whole, never trimmed', async () => {
  const six = JSON.stringify(Array.from({ length: MAX_RULES + 1 }, (_, i) => `rule ${i}`));
  const r = await extractRules({ config: config(), provider: stub(six), priorRules: null });
  assert.equal(r.valid, false);
  assert.equal(r.rules, null, 'no partial acceptance');
  assert.equal(r.reds[0].code, 'rules-bound');
});

test('an over-long rule → red, rejected whole', async () => {
  const long = JSON.stringify(['ok', 'x'.repeat(MAX_RULE_CHARS + 1)]);
  const r = await extractRules({ config: config(), provider: stub(long), priorRules: null });
  assert.equal(r.valid, false);
  assert.equal(r.rules, null);
  assert.equal(r.reds[0].code, 'rules-bound');
});

test('a throwing provider → provider-error red as data, never a throw (contract holds on the transport too)', async () => {
  const exploding = { generate: async () => { throw new Error('502 upstream'); } };
  const r = await extractRules({ config: config(), provider: exploding, priorRules: null });
  assert.equal(r.valid, false);
  assert.equal(r.rules, null, 'caller keeps prior rules');
  assert.equal(r.reds[0].code, 'provider-error');
  assert.match(r.reds[0].detail, /502/);
});

test('one shot: exactly one provider call, even when the output reds', async () => {
  const p = stub('garbage');
  await extractRules({ config: config(), provider: p, priorRules: null });
  assert.equal(p.calls.length, 1);
});

test('prompt carries ledger facts — config, prior rules, revision diff — and states the bounds', async () => {
  const p = stub(GOOD);
  await extractRules({
    config: config(),
    provider: p,
    priorRules: ['old rule to be revised'],
    revisionDiff: ['memory.recall.k'],
  });
  const prompt = JSON.stringify(p.calls[0]);
  assert.ok(prompt.includes('litectx'), 'the green config itself is shown');
  assert.ok(prompt.includes('old rule to be revised'), 'prior rules shown for revision');
  assert.ok(prompt.includes('memory.recall.k'), 'revision diff is the free failure-transition evidence');
  assert.ok(prompt.includes(String(MAX_RULES)), 'bounds stated to the model, enforced by code');
});
