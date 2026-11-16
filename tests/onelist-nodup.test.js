// hamr live run (2026-11-15), item 2: on a facts-only line the `$ cited` "this line finds facts, so it has no text to quote" row is not a Not checked item on any view (the floor row already says the line has no text
// check); a `$` default that does not apply to a line kind is not a Not checked item. It stays where it applies (a text line that cannot quote: several inputs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CheckBlock } from '../src/checkblock.js';
import { cardOfClose } from '../src/rubricstep.js';
import { planFromSpec, auditChecksOf } from '../src/panel/jobplan.js';

const PAGE = 'Flights\nFrom $389 US dollars\n';
const JOB = [{ n: 1, text: 'List the price', rules: [] }, { n: 2, text: 'Say it', rules: ['at most 20 words'] }];
function made(labels = ['p']) {
  const b = new CheckBlock({ texts: Object.fromEntries(labels.map((l) => [l, PAGE])), labels, asks: false });
  b.fromJob(JOB); b.setGuards(['changed-from-seed']);
  b.addLook([{ line: 1, name: 'price', shape: 'money', source: 'p', words: ['From'], unit: ['US dollars'], currency: ['$'], decimal: '.' }], []);
  const v = b.closeView();
  return { closeDecl: { genre: 'text', lang: 'text', stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: {} }, ...v.stages], list: v.list, picks: v.picks } };
}
const WORDS = /this line finds facts, so it has no text to quote/;

test('a facts line\'s cited default is not drawn as Not checked on the card, the Job tab or the Audit', () => {
  const { closeDecl } = made();
  assert.ok(closeDecl.list.some((/** @type {any} */ r) => r.key === 'L1.$cited' && r.state === 'not-checked' && WORDS.test(r.reason)), 'the row is still in the list');
  assert.equal(cardOfClose({ closeDecl, jobLines: JOB }).notChecked.some((t) => WORDS.test(t)), false);
  const plan = planFromSpec({ jobLines: JOB, closeDecl, goal: '' });
  assert.equal([...plan.notChecked, ...plan.lines.flatMap((l) => l.refused)].some((t) => WORDS.test(t)), false);
  const ac = auditChecksOf(plan, [], null);
  assert.equal(ac.notChecked.some((r) => WORDS.test(r.text)), false);
});

test('it stays where it applies: a text line of a job with several inputs says it cannot quote', () => {
  const { closeDecl } = made(['p', 'q']);
  const t = cardOfClose({ closeDecl, jobLines: JOB }).notChecked;
  assert.equal(t.some((x) => /line 2: .*more than one input/.test(x)), true, JSON.stringify(t));
});

test('an OLD close (no guard rows) keeps today\'s display', () => {
  const { closeDecl } = made();
  const old = { ...closeDecl, list: closeDecl.list.filter((/** @type {any} */ r) => r.kind !== 'guard') };
  assert.equal(cardOfClose({ closeDecl: old, jobLines: JOB }).notChecked.some((t) => WORDS.test(t)), true);
});
