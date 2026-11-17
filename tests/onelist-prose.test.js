// Addendum 2026-11-14 (c), hamr's ruling Q2 (a): a line that writes text gets a signed `prose` row (Not checked, "what the text says — you judge it at Accept", `$ [default]`), built by the block; every view
// draws it from the row. An OLD signed spec (no prose row) keeps the stage-derived line. Real saved spec: tests/fixtures/mv5bk400-resolved-spec.json (two text lines, old record).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CheckBlock } from '../src/checkblock.js';
import { cardOfClose, proseNotCheckedItems, listMatchesClose } from '../src/rubricstep.js';
import { planFromSpec } from '../src/panel/jobplan.js';
import { validateCloseDecl } from '../src/declaredclose.js';

const OLD = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/mv5bk400-resolved-spec.json', import.meta.url)), 'utf8'));
const WORDS = 'No ~ rule here. What the text says, you judge it at Accept.';
const JOB = [{ n: 1, text: 'Summarise the page', rules: ['at most 80 words'] }];
function made() {
  const b = new CheckBlock({ texts: { a: 'x', b: 'y' }, labels: ['a', 'b'], asks: false });
  b.fromJob(JOB); b.setGuards(['changed-from-seed']); b.addLook([], []);
  const v = b.closeView();
  return { b, closeDecl: { genre: 'text', lang: 'text', stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: {} }, ...v.stages], list: v.list, picks: v.picks } };
}

test('the block signs one prose row per text line: Not checked, `$` default, in code\'s plain words; it is not a check', () => {
  const { b, closeDecl } = made();
  const rows = closeDecl.list.filter((/** @type {any} */ r) => r.kind === 'prose');
  assert.deepEqual(rows, [{ line: 1, key: 'L1.$prose', from: 'default', by: 'default', kind: 'prose', state: 'not-checked', reason: WORDS }]);
  assert.equal(b.rows.some((r) => r.kind === 'prose' && r.state === 'built'), false);
  assert.equal(b.hasBuiltCheck(), true, 'the `~` pick is the check; the prose row never counts (see next test)');
});

test('hasBuiltCheck ignores the prose row: a block holding only that row has no check', () => {
  const { b } = made();
  assert.equal(b.rows.some((r) => r.kind === 'prose'), true);
  b.rows = b.rows.filter((r) => r.kind === 'prose');
  assert.equal(b.hasBuiltCheck(), false);
});

test('the validator admits the prose row and listMatchesClose accepts it', () => {
  const { closeDecl } = made();
  const reds = validateCloseDecl({ genre: 'text', lang: 'text', stages: [], list: closeDecl.list.filter((/** @type {any} */ r) => r.kind === 'prose') }, { at: 'closeDecl', verdictType: 'soft-green' }).reds.filter((r) => String(r.path).startsWith('closeDecl.list['));
  assert.deepEqual(reds, []);
  assert.deepEqual(listMatchesClose(closeDecl), { ok: true });
});

test('every view draws the line from the row only: once, same words, tagged default; the stage-derived reader feeds nothing for a list-built close', () => {
  const { closeDecl } = made();
  assert.deepEqual(proseNotCheckedItems(closeDecl), []);
  const card = cardOfClose({ closeDecl, jobLines: JOB });
  assert.equal(card.notChecked.filter((t) => t === "Line 1: no ~ rule here. What the text says, you judge it at Accept.").length, 1, JSON.stringify(card.notChecked));
  const plan = planFromSpec({ jobLines: JOB, closeDecl, goal: '' });
  assert.deepEqual(plan.lines[0].refused.filter((t) => t.includes(WORDS)), [WORDS]);
  assert.equal(plan.notCheckedBy?.[WORDS], 'default');
  assert.equal(plan.notChecked.some((t) => t.includes(WORDS)), false);
});

test('an OLD signed spec (no prose row) keeps today\'s display: the stage-derived prose lines', () => {
  assert.equal(proseNotCheckedItems(OLD.closeDecl).length, 2);
  assert.ok(cardOfClose({ closeDecl: OLD.closeDecl, jobLines: OLD.jobLines }).notChecked.includes("Line 1: no ~ rule here. What the text says, you judge it at Accept."));
});
