// R10 end check: a rubric job whose check block has no built check is refused with the d4596a7 words before signing, whatever the seed gate says (the standing ruling "a run needs one check",
// kept by hamr 2026-11-12 as `block.hasBuiltCheck()` at the same two doors). Live: paid round 6 draft 17 (panel session smwag7ncubmip; run-class mv76m82c): rubric-step parts [] + files-changed, signed-ready.
// The old reader of an AI-written close (isNoCheckRubricClose / noCheckStopText) is deleted with the AI-written parts; its end-to-end door tests are in tests/checkblock-wired.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signingStopText } from '../src/authorreadout.js';
import { CheckBlock } from '../src/checkblock.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const spend = { knownUsd: 0.0099, spendComplete: true };

test('a block with no built check (the draft 17 shape: nothing the page can carry) gets the d4596a7 words', () => {
  const b = new CheckBlock({ texts: { Note: 'a' }, labels: ['Note', 'Other'], asks: false });
  b.fromJob([{ n: 1, text: 'write a nice note', rules: [] }]);
  b.reconcile();
  assert.equal(b.hasBuiltCheck(), false);
  const t = signingStopText({ reds: [], noCheck: !b.hasBuiltCheck(), spend });
  assert.match(t, /This job has no check that can fail: no `~` rule, and no check the AI built was kept\. A run needs at least one check, a quoted fact or a count\./);
  assert.match(t, /For an answer nobody checks, a plain chat AI is the right tool\./);
});

test('a block with one real check (a quoted fact, or the default cited row) is not refused; a rule nothing can check or a floor alone is', () => {
  const mk = (/** @type {Record<string, string>} */ texts, /** @type {string[]} */ labels, /** @type {any[]} */ facts, /** @type {string[]} */ rules = []) => {
    const b = new CheckBlock({ texts, labels, asks: false });
    b.fromJob([{ n: 1, text: 'x', rules }]);
    b.addLook(facts);
    b.reconcile();
    return b.hasBuiltCheck();
  };
  assert.equal(mk({ N: 'a date 2026' }, ['N'], [{ line: 1, name: 'date word', shape: 'phrase', source: 'N', words: ['date'] }]), true, 'draft 8: a fact');
  assert.equal(mk({ N: 'a' }, ['N'], []), true, 'draft 22: a cited default');
  assert.equal(mk({ N: 'a' }, ['N', 'M'], [], ['be nice']), false);
  assert.equal(mk({}, [], []), false, 'the floor alone never counts');
});

test('a code job is never refused here: only a strict `false` from the block stops, and a job with no block carries none', () => {
  assert.doesNotMatch(signingStopText({ reds: [], spend }), /no check that can fail/);
  const panel = readFileSync(join(HERE, '../src/panel/authorsession.js'), 'utf8');
  assert.match(panel, /hasBuiltCheck === false \? signingStopText/);
  const job = readFileSync(join(HERE, '../src/authorjob.js'), 'utf8');
  assert.match(job, /\.\.\.\(block \? \{ hasBuiltCheck: block\.hasBuiltCheck\(\) \} : \{\}\)/);
});

test('both doors call the end check before the signing gates', () => {
  const panel = readFileSync(join(HERE, '../src/panel/authorsession.js'), 'utf8');
  assert.ok(panel.indexOf('hasBuiltCheck === false ? signingStopText') > 0 && panel.indexOf('hasBuiltCheck === false ? signingStopText') < panel.indexOf("state.phase = 'signing-gates'"));
  const cli = readFileSync(join(HERE, '../src/authorrun.js'), 'utf8');
  assert.ok(cli.indexOf('authored.hasBuiltCheck === false') > 0 && cli.indexOf('authored.hasBuiltCheck === false') < cli.indexOf('prepareSigning({'));
});
