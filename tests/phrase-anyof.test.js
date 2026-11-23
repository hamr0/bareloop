// Phrase alternatives (the airline case), copied from fwdloop v0.37.0 (M19 am5, fwd 0b492337 / f4b84b28): a page phrase fact with several words signs all of them and a
// quote passes on any one of them, on word edges. A one-word fact and a place fact check exactly as before. $0, no key, no network: the real closer (gradeStep, bareguard 0.37.0).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { CheckBlock } from '../src/checkblock.js';
import { gradeStep, rubricStepShapeReds } from '../src/rubricstep.js';
import { factBrief, factSentence, factShapeReds } from '../src/facts.js';
import { lookFactOf } from '../src/inputlook.js';

const AIR = ['United', 'JetBlue', 'Delta', 'American', 'Frontier'];
const PAGE = ['United 8:00 AM nonstop $120', 'JetBlue 1 stop $99', 'Delta Air Lines Nonstop $140', 'Reunited Tours 7:00 AM $50', 'Other line with nothing'].join('\n');
const SHA = { p: createHash('sha256').update(PAGE).digest('hex') };
const airline = () => ({ source: 'p', facts: [{ name: 'airline name', shape: 'phrase', anyOf: AIR }] });
const run = (part, quote) => gradeStep({ params: { step: 1, parts: [{ text: 't', class: 'fact', covers: [1], ...part }] }, bytes: JSON.stringify({ results: [{ quote, values: {} }] }), outputBytes: null, inputs: { p: PAGE } }, SHA);
const signed = (words) => {
  const b = new CheckBlock({ texts: { p: PAGE }, labels: ['p'], asks: false });
  b.fromJob([{ n: 1, text: 'List flights', rules: ['cost under 200 dollars'] }]);
  b.addLook([{ line: 1, name: 'airline name', shape: 'phrase', source: 'p', words }]);
  b.reconcile();
  return b.build().parts.flatMap((p) => p.facts);
};

test('Must fail 1: a several-word phrase look fact signs all its words, not the first (a one-word fact signs phrase as before)', () => {
  assert.deepEqual(signed(['United', 'JetBlue', 'Delta']), [{ name: 'airline name', shape: 'phrase', anyOf: ['United', 'JetBlue', 'Delta'] }]);
  assert.deepEqual(signed(['Nonstop']), [{ name: 'airline name', shape: 'phrase', phrase: 'Nonstop' }]);
  assert.deepEqual(factShapeReds1(airline()), []);
});

test('the look carries all the words of a several-word phrase fact (phrase only on a one-word fact)', () => {
  const k = { line: 1, name: 'airline name', shape: 'phrase', words: [...AIR] };
  const many = lookFactOf(k, 'p');
  assert.deepEqual(many.words, AIR);
  assert.equal(many.phrase, undefined);
  assert.equal(lookFactOf({ ...k, words: ['Nonstop'] }, 'p').phrase, 'Nonstop');
});

test('Must fail 2: a quote holding only a later word is green, also a word with a digit, with no unsupported-number red', async () => {
  const a = await run(airline(), 'JetBlue 1 stop $99');
  assert.equal(a.verdict, 'green', a.gapLines.join('|'));
  const stops = { source: 'p', facts: [{ name: 'stop count', shape: 'phrase', anyOf: ['Nonstop', '1 stop'] }] };
  const b = await run(stops, 'JetBlue 1 stop $99');
  assert.equal(b.verdict, 'green', b.gapLines.join('|'));
  assert.ok(!b.gapLines.some((l) => /number/.test(l)));
});

test('Must fail 3: a quote holding none of the words is red, in the signed words', async () => {
  const r = await run(airline(), 'Other line with nothing');
  assert.equal(r.verdict, 'red');
  assert.ok(r.gapLines.some((l) => l.endsWith('the quote says none of "United", "JetBlue", "Delta", "American", "Frontier"')), r.gapLines.join('|'));
  const edge = await run(airline(), 'Reunited Tours 7:00 AM $50');
  assert.equal(edge.verdict, 'red', 'word edges: "United" is not in "Reunited"');
});

test('Must fail 4: a one-word fact checks exactly as today (all-of substring decide, same field shape)', async () => {
  const part = { source: 'p', facts: [{ name: 'airline name', shape: 'phrase', phrase: 'United' }] };
  assert.equal((await run(part, 'Reunited Tours 7:00 AM $50')).verdict, 'green', 'substring, as today');
  const red = await run(part, 'JetBlue 1 stop $99');
  assert.equal(red.verdict, 'red');
  assert.ok(red.gapLines.some((l) => l.includes('the quote does not say "United"')));
});

test('the step and the rows are told the signed words', () => {
  const f = airline().facts[0];
  assert.equal(factBrief(f), 'airline name — no value to write; the quote you copy must say one of: "United", "JetBlue", "Delta", "American", "Frontier"');
  assert.equal(factSentence(f, 'p'), 'fact · airline name — phrase, with one of the words "United", "JetBlue", "Delta", "American", "Frontier", quoted from "p"');
});

test('an unsignable word never signs a narrower check: refused at draft time, naming it', () => {
  const part = { source: 'p', facts: [{ name: 'airline name', shape: 'phrase', anyOf: ['United', '-x'] }] };
  assert.ok(factShapeReds1(part).some((r) => r.includes('anyOf') && r.includes('starting and ending with a letter or digit')), factShapeReds1(part).join('|'));
  assert.ok(rubricStepShapeReds({ step: 1, parts: [{ text: 't', class: 'fact', ...part }] }, 'trial').length > 0);
});

function factShapeReds1(part) {
  /** @type {string[]} */
  const out = [];
  factShapeReds(part, 'p', (c, path, d) => out.push(`${path}: ${d}`));
  return out;
}
