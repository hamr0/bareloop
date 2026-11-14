// One list, one row per rule (hamr 2026-11-14; live run mwgsl7zx). A `~` rule the look dropped whole ("the page never shows a time right after ...")
// and then the person's Drop ("I can't check this on the page. Drop it?") is ONE Not checked row on the card and in the signed list; the person's choice
// wins the reason: "You chose to leave it Not checked, so you judge it at Accept."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CheckBlock } from '../src/checkblock.js';
import { cardOfClose } from '../src/rubricstep.js';
import { dropRows, dropLine } from '../src/pagedropwords.js';
import { lineRules } from '../src/rubricstep.js';
import { runConfirmTurn, makeCostBook, GREEN_QUESTIONS, CONFIRM_TOOL_NAME } from '../src/authorflow.js';
import { RUBRIC_LANG } from '../src/authoring.js';

const PAGE = 'Flights\nBoston Logan International Airport\nFrom $389 US dollars\nDeparture time: 10:24 AM.\n';
const JOB = [{ n: 1, text: 'List 3 flights from Boston to Chicago', rules: ['under $450', 'departure time between 05:00 and 21:59'] }];
const DROPPED = [{ line: 1, rule: 2, fact: 'departure time', other: 'Departure time', reason: 'reads-no-time', source: 'flights' }];

test('a look-dropped time fact on a ~ rule, then the person\'s Drop: one not-checked row for the rule, on the card and in signedRows', () => {
  const b = new CheckBlock({ texts: { flights: PAGE }, labels: ['flights'] });
  b.fromJob(JOB);
  b.addLook([{ line: 1, name: 'price', shape: 'money', source: 'flights', words: ['From'], unit: ['US dollars'], currency: ['$'], decimal: '.', forRule: 1 }], DROPPED);
  b.reconcile();
  const q = b.open.find((x) => x.rowKey === 'L1.~2');
  assert.ok(q, 'the look asks about the dropped rule');
  assert.equal(b.applyAnswer(q.key, 'drop').ok, true);
  const view = b.closeView();
  const rule2 = view.list.filter((r) => r.line === 1 && r.rule === 2);
  assert.equal(rule2.length, 1, 'one row for the rule in signedRows');
  assert.equal(rule2[0].state, 'not-checked');
  assert.equal(rule2[0].reason, 'You chose to leave it Not checked, so you judge it at Accept.');
  const card = cardOfClose({ closeDecl: { stages: view.stages, list: view.list }, jobLines: b.jobLinesView(JOB) });
  const mine = card.notChecked.filter((t) => /departure time/i.test(t));
  assert.deepEqual(mine, ['line 1: "departure time between 05:00 and 21:59" — You chose to leave it Not checked, so you judge it at Accept.']);
  // the confirm card also lists the look's own drop sentence; the block says which rules it already says
  const lookLines = dropRows(DROPPED).map((r) => dropLine(r, JOB, lineRules));
  assert.equal(lookLines.length, 1);
});

test('after Revise the person\'s earlier Drop is kept and the look drops the rule again: the confirm card lists the rule ONCE, with the person\'s reason (live run mwgsl7zx)', async () => {
  const b = new CheckBlock({ texts: { flights: PAGE }, labels: ['flights'] });
  b.fromJob(JOB);
  b.addLook([{ line: 1, name: 'price', shape: 'money', source: 'flights', words: ['From'], unit: ['US dollars'], currency: ['$'], decimal: '.', forRule: 1 }], DROPPED);
  b.carry({ left: [{ line: 1, rule: 2 }] });
  b.reconcile();
  const cardOf = () => { const v = b.closeView(); return cardOfClose({ closeDecl: { stages: v.stages, list: v.list }, jobLines: b.jobLinesView(JOB) }); };
  const generate = async (/** @type {any} */ m, /** @type {any[]} */ tools) => { await /** @type {any} */ (tools.find((t) => t.name === CONFIRM_TOOL_NAME)).execute({ goal: 'List flights', checks: [], notChecked: [], questions: [] }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0, unpricedRounds: 0 } }; };
  /** @type {string[][]} */ const shown = [];
  const ask = async (/** @type {any} */ step) => {
    if (step.kind === 'menu') shown.push(step.plan.notChecked.filter((/** @type {string} */ t) => /departure time/i.test(t)));
    return 'confirm';
  };
  const r = await runConfirmTurn({ verdictType: 'soft-green', answers: { 1: '1. list' }, questions: GREEN_QUESTIONS, isRepo: false, lang: RUBRIC_LANG, facts: { look: { facts: [], dropped: DROPPED } }, writeScope: null, jobLines: JOB, generate, book: makeCostBook({ ceilingUsd: null }), ask, block: b, cardOf, card: cardOf() });
  assert.equal(r.ok, true);
  const mine = ['line 1: "departure time between 05:00 and 21:59" — You chose to leave it Not checked, so you judge it at Accept.'];
  assert.deepEqual(shown[0], mine);
});

test('no earlier Drop: the confirm card still lists the look-dropped rule ONCE, with the look\'s sentence', async () => {
  const b = new CheckBlock({ texts: { flights: PAGE }, labels: ['flights'] });
  b.fromJob(JOB);
  b.addLook([{ line: 1, name: 'price', shape: 'money', source: 'flights', words: ['From'], unit: ['US dollars'], currency: ['$'], decimal: '.', forRule: 1 }], DROPPED);
  b.reconcile();
  const cardOf = () => { const v = b.closeView(); return cardOfClose({ closeDecl: { stages: v.stages, list: v.list }, jobLines: b.jobLinesView(JOB) }); };
  const generate = async (/** @type {any} */ m, /** @type {any[]} */ tools) => { await /** @type {any} */ (tools.find((t) => t.name === CONFIRM_TOOL_NAME)).execute({ goal: 'List flights', checks: [], notChecked: [], questions: [] }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0, unpricedRounds: 0 } }; };
  /** @type {string[][]} */ const shown = [];
  const ask = async (/** @type {any} */ step) => {
    if (step.kind === 'menu') shown.push(step.plan.notChecked.filter((/** @type {string} */ t) => /departure time/i.test(t)));
    return 'confirm';
  };
  const r = await runConfirmTurn({ verdictType: 'soft-green', answers: { 1: '1. list' }, questions: GREEN_QUESTIONS, isRepo: false, lang: RUBRIC_LANG, facts: { look: { facts: [], dropped: DROPPED } }, writeScope: null, jobLines: JOB, generate, book: makeCostBook({ ceilingUsd: null }), ask, block: b, cardOf, card: cardOf() });
  assert.equal(r.ok, true);
  const mine = ['line 1: "departure time between 05:00 and 21:59" — the page never shows a time right after "Departure time", so it is not checked.'];
  assert.deepEqual(shown[0], mine);
});
