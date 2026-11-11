// F318 live run mwc2u3yh: the Job tab named no not-checked list row and hid the dropped one. The fixture is a byte copy of that run's resolved-spec.json and the
// `ledger` rows of its draft log (copied, never read from .claude/scratch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { planFromSpec } from '../src/panel/jobplan.js';
import { readDraftLedger } from '../src/draftspend.js';

const DIR = fileURLToPath(new URL('./fixtures/check-list-live-mwc2u3yh/', import.meta.url));
const spec = JSON.parse(readFileSync(`${DIR}resolved-spec.json`, 'utf8'));

test('F318 (1) the Job tab names the not-checked phrase row in the draft log\'s own words, never an empty name', () => {
  const plan = planFromSpec(spec, readDraftLedger(DIR));
  const refused = plan.lines[0].refused;
  assert.ok(refused.includes('phrase "### Fixed" — the plan did not build it'), JSON.stringify(refused));
  for (const r of refused) assert.match(r, /^\S.*\S — \S/);
});

test('F318 (1) with no draft log (a CLI or imported run) the row is named from its key, still never empty', () => {
  const plan = planFromSpec(spec);
  assert.ok(plan.lines[0].refused.includes('phrase "### fixed" — the plan did not build it'), JSON.stringify(plan.lines[0].refused));
  assert.deepEqual(readDraftLedger('/nonexistent-dir-f318'), null);
});

test('F318 (2) the dropped week-only row shows under Not checked with its reason', () => {
  const plan = planFromSpec(spec, readDraftLedger(DIR));
  assert.ok(plan.lines[0].refused.includes('phrase "## [0.54.1] - 2026-11-04" — It names a version or a date from the input, true only for the input as it is today, so you judge it at Accept.'), JSON.stringify(plan.lines[0].refused));
  // without the draft log it still shows
  assert.equal(planFromSpec(spec).lines[0].refused.filter((r) => /true only for the input as it is today/.test(r)).length, 1);
});

test('F318 (2) a dropped row of another reason (a ~ rule wins) is not drawn', () => {
  const s = structuredClone(spec);
  s.closeDecl.list.push({ line: 1, key: 'L1.fact.other', from: 'look', by: 'agent', kind: 'fact', state: 'dropped', reason: 'a ~ rule wins: line 1 rule 1 carries it' });
  assert.ok(!planFromSpec(s).lines[0].refused.some((r) => /rule wins/.test(r)));
});

test('F318 the drafting plan card names the not-checked phrase row like the Job tab (one owner), with the draft log or from the key', async () => {
  const { cardOfClose } = await import('../src/rubricstep.js');
  const withLog = cardOfClose({ closeDecl: spec.closeDecl, jobLines: spec.jobLines, ledger: readDraftLedger(DIR) }).notChecked;
  assert.ok(withLog.includes('line 1: phrase "### Fixed" — the plan did not build it'), JSON.stringify(withLog));
  const noLog = cardOfClose({ closeDecl: spec.closeDecl, jobLines: spec.jobLines }).notChecked;
  assert.ok(noLog.includes('line 1: phrase "### fixed" — the plan did not build it'), JSON.stringify(noLog));
  assert.ok(!withLog.concat(noLog).some((t) => /rule phrase/.test(t)));
});
