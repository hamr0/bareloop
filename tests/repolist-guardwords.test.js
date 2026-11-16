// A `$ [default]` guard / fence row reads a short code-owned plain question (src/stagewords.js, the one owner), never the raw guard name plus a long sentence. REAL signed spec of live session smwhvmfsxd5t8
// (tests/fixtures/repo-list/smwhvmfsxd5t8-spec.json): guards changed-from-seed and no-suppressions, fence src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planFromSpec, planFromConfirm, auditChecksOf } from '../src/panel/jobplan.js';
import { cardOfClose, planMatchesClose, checksOfClose } from '../src/rubricstep.js';
import { guardQuestionText, fenceQuestionText } from '../src/stagewords.js';
import { confirmPlanLines } from '../src/authorrun.js';

const spec = JSON.parse(readFileSync(new URL('./fixtures/repo-list/smwhvmfsxd5t8-spec.json', import.meta.url), 'utf8'));
const WORDS = ['did the run change a file?', 'no checker silenced (@ts-ignore, eslint-disable, # type: ignore)?', 'only files in src/ changed?'];
const KEYS = ['J.$guard.changed-from-seed', 'J.$guard.no-suppressions', 'J.$fence'];

test('the one owner: a guard name and a fence scope each give one plain question', () => {
  assert.equal(guardQuestionText('changed-from-seed'), WORDS[0]);
  assert.equal(guardQuestionText('no-suppressions'), WORDS[1]);
  assert.equal(guardQuestionText('some-future-guard'), null);
  assert.equal(fenceQuestionText(['src/']), 'only files in src/ changed?');
  assert.equal(fenceQuestionText(['src/**', 'docs/a.md']), 'only files in src/, docs/a.md changed?');
});

test('Job tab, signed card, sign-time match, CLI print: the `$` rows say the same plain questions', () => {
  const plan = planFromSpec(spec);
  assert.deepEqual(plan.loose.filter((c) => c.by === 'default').map((c) => c.name), WORDS);
  const card = cardOfClose({ closeDecl: spec.closeDecl, jobLines: spec.jobLines });
  const rows = card.checkItems.filter((c) => KEYS.includes(c.key));
  assert.deepEqual(rows.map((c) => c.text), WORDS);
  assert.deepEqual(checksOfClose(spec.closeDecl, spec.jobLines).filter((c) => KEYS.includes(c.key)).map((c) => c.text), WORDS);
  assert.deepEqual(planMatchesClose(card.checkItems, spec.closeDecl, spec.jobLines), { ok: true });
  const cli = confirmPlanLines({ goal: 'g', checkItems: card.checkItems, protections: [], notChecked: [], questions: [] }).join('\n');
  for (const w of WORDS) assert.ok(cli.includes(`$ [default] ${w}`), w);
  assert.doesNotMatch(cli, /\$ \[default\] (changed-from-seed|no-suppressions|write fence)/);
  const conf = planFromConfirm(spec.jobLines, card);
  assert.deepEqual(conf.loose.filter((c) => c.by === 'default').map((c) => c.name), WORDS);
});

test('Audit: the `$` rows read the plain questions; the fence row still reads the gate record, the guard rows their stage verdict', () => {
  const plan = planFromSpec(spec);
  const ac = auditChecksOf(plan, [], new Map([['changed-from-seed', true], ['no-suppressions', false]]), 2, true);
  const rows = ac.always.filter((c) => c.by === 'default');
  assert.deepEqual(rows.map((c) => c.text), WORDS);
  assert.deepEqual(rows.map((c) => c.result), ['passed', 'failed', 'held']);
});
