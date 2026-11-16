// A repo job's `! [agent]` stage row reads as the code-owned plain question of its stage kind (src/stagewords.js, the one owner the Audit and the Result tab already use), never as a bare stage name. REAL signed spec of live
// session smwhvmfsxd5t8 (tests/fixtures/repo-list/smwhvmfsxd5t8-spec.json): suite-green, no-failing-tests, tests-kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planFromSpec, planFromConfirm, auditChecksOf } from '../src/panel/jobplan.js';
import { cardOfClose, planMatchesClose } from '../src/rubricstep.js';
import { successFromSpec } from '../src/panel/server.js';
import { confirmPlanLines } from '../src/authorrun.js';

const spec = JSON.parse(readFileSync(new URL('./fixtures/repo-list/smwhvmfsxd5t8-spec.json', import.meta.url), 'utf8'));
const WORDS = ['does "node --test test/sum.test.js" exit clean?', 'no failing tests?', 'did all the old tests still exist?'];

test('Job tab and signed card: each `!` stage row is its plain question; the row key and the stage (for its verdict) stay', () => {
  const plan = planFromSpec(spec);
  assert.deepEqual(plan.lines[0].checks.filter((c) => c.by === 'agent').map((c) => c.name), WORDS);
  const agent = plan.lines[0].checks.filter((c) => c.by === 'agent');
  assert.deepEqual(agent.map((c) => c.stage), ['suite-green', 'no-failing-tests', 'tests-kept']);
  assert.deepEqual(agent.map((c) => c.key), ['S.suite-green', 'S.no-failing-tests', 'S.tests-kept']);
});

test('the final card (cardOfClose), the sign-time match, the success line and the CLI print say the same words', () => {
  const card = cardOfClose({ closeDecl: spec.closeDecl, jobLines: spec.jobLines });
  assert.deepEqual(card.checkItems.filter((c) => c.by === 'agent').map((c) => c.text), WORDS);
  assert.deepEqual(planMatchesClose(card.checkItems, spec.closeDecl, spec.jobLines), { ok: true });
  assert.match(String(successFromSpec(spec)), /does "node --test test\/sum\.test\.js" exit clean\? · no failing tests\? · did all the old tests still exist\?/);
  const cli = confirmPlanLines({ goal: 'g', checkItems: card.checkItems, protections: [], notChecked: [], questions: [] }).join('\n');
  for (const w of WORDS) assert.ok(cli.includes(`line 1: ! [agent] ${w}`), w);
  assert.doesNotMatch(cli, /! \[agent\] (suite-green|no-failing-tests|tests-kept)\b/);
  const conf = planFromConfirm(spec.jobLines, card);
  assert.deepEqual(conf.lines[0].checks.filter((c) => c.by === 'agent').map((c) => c.name), WORDS);
});

test('Audit: the rows read the plain question, and each row\'s result is still its stage\'s recorded verdict', () => {
  const plan = planFromSpec(spec);
  const ac = auditChecksOf(plan, [], new Map([['suite-green', true], ['no-failing-tests', false], ['tests-kept', true]]), 0, true);
  const rows = ac.checks.filter((c) => c.by === 'agent');
  assert.deepEqual(rows.map((c) => c.text), WORDS.map((w) => `line 1 · ${w}`));
  assert.deepEqual(rows.map((c) => c.result), ['passed', 'failed', 'passed']);
});
