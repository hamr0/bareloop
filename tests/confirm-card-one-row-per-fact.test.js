// Live run mwi76vh8 (draft session smwi75mbqjjbs): the confirm card showed a look-dropped place fact twice, as the look's line ("Boston place") and as the block's own `!` row ("boston place").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CheckBlock } from '../src/checkblock.js';
import { cardOfClose } from '../src/rubricstep.js';
import { runConfirmTurn, GREEN_QUESTIONS, CONFIRM_TOOL_NAME } from '../src/authorflow.js';
import { makeCostBook } from '../src/ask.js';
import { RUBRIC_LANG } from '../src/authoring.js';

const PAGE = 'Flights\nBoston BOS\nFrom $389 US dollars\n';
const JOB = [{ n: 1, text: 'List 3 flights from Boston to Chicago', rules: ['under $450'] }];
const DROPPED = [{ line: 1, fact: 'Boston place', other: 'Boston BOS', reason: 'phrase-no-result', source: 'flights' }];

test('a look-dropped place fact (no ~ rule) is ONE row on the confirm card, the block\'s own', async () => {
  const b = new CheckBlock({ texts: { flights: PAGE }, labels: ['flights'] });
  b.fromJob(JOB);
  b.addLook([{ line: 1, name: 'price', shape: 'money', source: 'flights', words: ['From'], unit: ['US dollars'], currency: ['$'], decimal: '.', forRule: 1 }], DROPPED);
  b.reconcile();
  const cardOf = () => { const v = b.closeView(); return cardOfClose({ closeDecl: { stages: v.stages, list: v.list }, jobLines: b.jobLinesView(JOB) }); };
  const generate = async (/** @type {any} */ m, /** @type {any[]} */ tools) => { await /** @type {any} */ (tools.find((t) => t.name === CONFIRM_TOOL_NAME)).execute({ goal: 'List flights', checks: [], notChecked: [], questions: [] }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0, unpricedRounds: 0 } }; };
  /** @type {string[][]} */ const shown = [];
  const ask = async (/** @type {any} */ step) => {
    if (step.kind === 'menu') shown.push(step.plan.notChecked.filter((/** @type {string} */ t) => /boston place/i.test(t)));
    return 'confirm';
  };
  const r = await runConfirmTurn({ verdictType: 'soft-green', answers: { 1: '1. list' }, questions: GREEN_QUESTIONS, isRepo: false, lang: RUBRIC_LANG, facts: { look: { facts: [], dropped: DROPPED } }, writeScope: null, jobLines: JOB, generate, book: makeCostBook({ ceilingUsd: null }), ask, block: b, cardOf, card: cardOf() });
  assert.equal(r.ok, true);
  assert.equal(shown[0].length, 1, JSON.stringify(shown[0]));
});
