// F337: the planner's "as seen" example (docs/product/LAYERS.md "Who gets what"). The picker (src/pagedry.js asSeenOf) over a REAL saved Google Flights
// snapshot excerpt, the CheckBlock that signs it into the fact part, the planner prompt that renders it (only when it exists), the hash that covers it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asSeenOf } from '../src/pagedry.js';
import { asSeenBlock, planPrompt } from '../src/planrun.js';
import { CheckBlock } from '../src/checkblock.js';
import { rubricStepShapeReds } from '../src/rubricstep.js';
import { jobSpecHash } from '../src/job.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(join(HERE, 'fixtures', 'page-asseen-excerpt.txt'), 'utf8');
const PRICE = { name: 'Price', shape: 'money', anchor: 'From', unit: ['US dollars'] };
const DEP = { name: 'Departure time', shape: 'time', anchor: 'Departure time:' };
const lines = PAGE.split('\n');

test('the picker keeps the first result from its first line down to the line holding the off-line label', () => {
  const r = asSeenOf(PAGE, [PRICE, DEP], 'Flights');
  assert.ok(r);
  assert.equal(r.input, 'Flights');
  assert.deepEqual(r.labels, ['Departure time:']);
  assert.deepEqual(r.lines, [lines[2], lines[3]]);
  assert.match(r.lines[0], /^ {14}- link "From 43 US dollars\./);
  assert.match(r.lines[1], /^ {14}- generic "Departure time: 9:09\u202fAM\." \[ref=391\]$/);
});

test('the picker stores nothing when every label is on the first line, or none is found, or the block is too big', () => {
  assert.equal(asSeenOf(PAGE, [PRICE], 'Flights'), null, 'one labelled fact');
  assert.equal(asSeenOf(PAGE, [PRICE, { name: 'Leaves', shape: 'time', anchor: 'Leaves San Francisco International Airport at' }], 'Flights'), null, 'label on the first line');
  assert.equal(asSeenOf(PAGE, [PRICE, { name: 'Gate', shape: 'time', anchor: 'Gate time:' }], 'Flights'), null, 'label never found in the block');
  assert.equal(asSeenOf(PAGE, [PRICE, { name: 'Arrival', shape: 'time', anchor: 'Arrival time:' }, DEP], 'Flights')?.lines.length, 5, 'a later label inside the block widens it');
  assert.equal(asSeenOf('nothing here', [PRICE, DEP], 'Flights'), null);
  assert.equal(asSeenOf(PAGE, [{ name: 'P', shape: 'phrase', anchor: 'From' }], 'Flights'), null, 'no labelled money or time fact');
  // the second result's label is NOT taken for the first result's (the block ends at the next first line)
  const noDep = PAGE.replace('Departure time: 9:09\u202fAM.', 'Dep 9:09 AM.');
  assert.equal(asSeenOf(noDep, [PRICE, DEP], 'Flights'), null);
});

test('the picker bounds the block at the next result, and a label already on the first line needs no example (both inside the line cap)', () => {
  const second = '- link "From 43 US dollars."\n- generic "x"\n- link "From 50 US dollars."\n- generic "Departure time: 9:09 AM."';
  assert.equal(asSeenOf(second, [PRICE, DEP], 'Flights'), null, 'the second result\'s label is not the first result\'s');
  const onFirst = '- link "From 43 US dollars. Departure time: 8:00 AM."\n- generic "Departure time: 9:09 AM."';
  assert.equal(asSeenOf(onFirst, [PRICE, DEP], 'Flights'), null, 'a label on the first line is not searched for again below it');
});

test('the picker masks a secret in the example lines', () => {
  const page = `- link "From 43 US dollars. token sk-ant-api03-${'a'.repeat(40)}"\n- generic "Departure time: 9:09 AM."`;
  const r = asSeenOf(page, [PRICE, DEP], 'Flights');
  assert.ok(r);
  assert.ok(!r.lines.join('\n').includes('sk-ant-api03'), r.lines.join('\n'));
});

/** a CheckBlock over the excerpt with a money fact and a time fact on one line (the look's own shape, as in checkblock-wired) */
function signed() {
  const block = new CheckBlock({ texts: { Flights: PAGE }, labels: ['Flights'] });
  block.fromJob([{ n: 1, text: 'List flights', rule: 'under $450; not a red-eye', rules: ['under $450', 'not a red-eye'] }]);
  block.addLook([
    { line: 1, name: 'Price', shape: 'money', source: 'Flights', words: ['From'], unit: ['US dollars'], forRule: 1, reading: { op: 'lt', value: 450 } },
    { line: 1, name: 'Departure time', shape: 'time', source: 'Flights', words: ['Departure time:'], forRule: 2, reading: { op: 'between', lo: '06:00', hi: '21:00' } },
  ], []);
  block.reconcile();
  for (const q of [...block.open]) { assert.deepEqual(block.applyAnswer(q.key, 'agree'), { ok: true }); block.reconcile(); }
  return block.reconcile().stages;
}
const factPart = (/** @type {any} */ stages) => stages.flatMap((/** @type {any} */ s) => s.params.parts).find((/** @type {any} */ p) => p.class === 'fact');

test('signing puts the example in the fact part, and the part is still a legal shape', () => {
  const stages = signed();
  const p = factPart(stages);
  assert.ok(p, 'a fact part');
  assert.deepEqual(p.asSeen, { input: 'Flights', lines: [lines[2], lines[3]], labels: ['Departure time:'] });
  assert.deepEqual(rubricStepShapeReds({ step: 1, parts: [p] }, 'x'), []);
  const bad = { ...p, asSeen: { input: 'Flights', lines: [], labels: ['x'] } };
  assert.ok(rubricStepShapeReds({ step: 1, parts: [bad] }, 'x').some((r) => r.path.endsWith('.asSeen')));
});

test('an old fact part without the field is still a legal shape and renders nothing', () => {
  const { asSeen, ...old } = factPart(signed());
  assert.ok(asSeen);
  assert.deepEqual(rubricStepShapeReds({ step: 1, parts: [old] }, 'x'), []);
  assert.equal(asSeenBlock([{ name: 'line-1', kind: 'rubric-step', params: { step: 1, parts: [old] } }]), '');
});

const jobOf = (/** @type {any[]} */ stages) => ({ goal: 'List flights', writeScope: ['output/'], close: stages });

test('planPrompt renders the example once, right after the goal, and is byte-identical to today without it', () => {
  const stages = signed();
  const withIt = planPrompt(jobOf(stages), 'scout', null, 40, null, null, null);
  const p = factPart(stages);
  const without = planPrompt(jobOf(stages.map((/** @type {any} */ s) => ({ ...s, params: { ...s.params, parts: s.params.parts.map((/** @type {any} */ x) => { const { asSeen, ...rest } = x; return rest; }) } }))), 'scout', null, 40, null, null, null);
  const block = `\n\nAt drafting, one result in "Flights" looked like this. It shows the shape only; each result has its own values.\n${p.asSeen.lines.join('\n')}\nThe check reads each fact's label inside the result's quote, so tell the worker to copy each result's quote as whole lines, exactly as the input writes them — every space and mark included — from the result's first line down to the line holding "Departure time:".`;
  assert.equal(withIt.split('At drafting, one result in').length, 2, 'exactly once');
  assert.ok(withIt.includes(`Goal:\nList flights${block}\n`), 'right after the goal');
  assert.equal(withIt.replace(block, ''), without, 'removing the block gives today\'s prompt byte for byte');
  assert.ok(!without.includes('At drafting, one result'));
});

test('the signed hash covers the example', () => {
  const stages = signed();
  const stripped = stages.map((/** @type {any} */ s) => ({ ...s, params: { ...s.params, parts: s.params.parts.map((/** @type {any} */ x) => { const { asSeen, ...rest } = x; return rest; }) } }));
  assert.notEqual(jobSpecHash(jobOf(stages)), jobSpecHash(jobOf(stripped)));
  const edited = JSON.parse(JSON.stringify(stages));
  factPart(edited).asSeen.lines[1] += ' ';
  assert.notEqual(jobSpecHash(jobOf(stages)), jobSpecHash(jobOf(edited)));
});
