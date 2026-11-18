// S4 byte-diff gate: a job with no sheet is byte-identical to what it was before S4 - the check block's rows, its card, its signed list and stages, and the plan card read from them.
// The golden (tests/fixtures/sheets/s4-nonsheet.golden.json) was taken from the source as it stood BEFORE S4 (the 10 committed real cases of tests/fixtures/checkblock/replay-cases.json).
// UPDATE_GOLDEN=1 rewrites it (only ever from an unchanged-behaviour source).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { CheckBlock } from '../src/checkblock.js';
import { cardOfClose } from '../src/rubricstep.js';

const CASES = JSON.parse(readFileSync(new URL('./fixtures/checkblock/replay-cases.json', import.meta.url), 'utf8'));
const GOLDEN = new URL('./fixtures/sheets/s4-nonsheet.golden.json', import.meta.url);
const norm = (/** @type {unknown} */ t) => String(t ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const answerer = (/** @type {any} */ c) => (/** @type {any} */ q) => { const h = c.answers.find((/** @type {any} */ a) => a.line === q.line && norm(a.ruleText) === norm(q.ruleText) && a.ask === q.ask); return h ? { choice: h.choice, ...(h.text ? { text: h.text } : {}) } : null; };

function snapshot(/** @type {any} */ c) {
  const b = new CheckBlock({ texts: c.inputs.texts, labels: c.inputs.labels });
  b.fromJob(c.inputs.jobLines);
  b.addLook(c.inputs.lookFacts);
  b.queue.push(...c.deltas.map((/** @type {any} */ d) => ({ ...d, edits: [...d.edits] })));
  b.drive({ answer: answerer(c) });
  b.setGuards(['changed-from-seed'], ['output/']);
  const view = b.closeView();
  const closeDecl = { genre: 'rubric-files', lang: 'rubric-files', stages: view.stages, list: view.list, picks: view.picks };
  return JSON.parse(JSON.stringify({ id: c.id, rows: b.rows.map((/** @type {any} */ r) => ({ ...r, can: undefined })), card: b.card(), view, plan: cardOfClose({ closeDecl, jobLines: c.inputs.jobLines }) }));
}

test('a job with no sheet: rows, card, signed list, stages and the plan card are byte-identical to the pre-S4 golden', () => {
  const now = CASES.map(snapshot);
  if (process.env.UPDATE_GOLDEN === '1') writeFileSync(GOLDEN, `${JSON.stringify(now, null, 1)}\n`);
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  assert.equal(now.length, golden.length);
  for (let i = 0; i < now.length; i += 1) assert.equal(JSON.stringify(now[i], null, 1), JSON.stringify(golden[i], null, 1), `case ${now[i].id}`);
  assert.ok(now.some((s) => s.view.list.length > 3), 'the golden is not empty');
});
