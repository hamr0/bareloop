// Shape jobs (itemShape), clause 1 "Offer": the row-edit reply's optional `itemShape` property, its words, and the wiring in authorClose (strip-and-keep, build). The pinned bareguard has no itemShape, so the whole
// path is OFF by default: a job drafts byte-identically (the golden turn files of the sheet tests); `shape: true` is the test's override. Fake provider, $0.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rowEditChannel } from '../src/rowedit.js';
import { shapeSuggestProp, shapeOfferRules, shapeMenuLines } from '../src/shapeoffer.js';
import { SHAPE_KINDS } from '../src/shapemenu.js';
import { PROMPT_REGISTERS } from '../src/promptregisters.js';
import { turnOver, cleanup, HERE } from './sheetturn-harness.mjs';

after(cleanup);
const PAGE = { label: 'Flights', value: 'https://www.google.com/travel/flights?q=sfo-lax' };
const LINE = { n: 1, text: 'List the flights', rule: 'each flight has a price under 450', rules: ['each flight has a price under 450'] };
const FIELD = { name: 'price', kind: 'money', required: true, bounds: { lt: 450 }, fromRule: 1 };
const SUGGESTION = [{ line: 1, fields: [FIELD], extraFields: [], itemCountFrom: [], alsoFitsRules: false }];

test('the property: one suggestion per line (an enum of the offered lines), kind an enum of the one menu, labels an enum of the real labels; optional', () => {
  assert.equal(shapeSuggestProp([], ['a']), null, 'no line, no property');
  const prop = /** @type {any} */ (shapeSuggestProp([1, 3], ['resume-1', 'resume-2']));
  assert.equal(prop.maxItems, 2);
  assert.deepEqual(prop.items.properties.line.enum, [1, 3]);
  assert.deepEqual(prop.items.properties.itemCountFrom.items.enum, ['resume-1', 'resume-2']);
  assert.deepEqual(prop.items.properties.fields.items.properties.kind.enum, Object.keys(SHAPE_KINDS));
  assert.ok(prop.items.properties.fields.items.properties.kind.enum.includes('boolean'));
  assert.equal(prop.items.additionalProperties, false);
  const withIt = rowEditChannel(false, null, prop).tool({ calls: [] }).parameters;
  assert.deepEqual(withIt.required, ['edits'], 'optional: only the edits list is required');
  assert.deepEqual(Object.keys(withIt.properties), ['edits', 'itemShape']);
  const without = rowEditChannel(false).tool({ calls: [] }).parameters;
  assert.equal(Object.hasOwn(without.properties, 'itemShape'), false);
  assert.equal(JSON.stringify(without), JSON.stringify(rowEditChannel(false, null, null).tool({ calls: [] }).parameters), 'a null shape property is no property');
});

test('the words: the menu is named once and carries boolean/equals; the rules name the lines and the labels', () => {
  assert.ok(shapeMenuLines().includes('  boolean: bounds equals'));
  assert.equal(shapeMenuLines().length, Object.keys(SHAPE_KINDS).length);
  const rules = shapeOfferRules([1, 3], ['resume-1', 'resume-2']).join('\n');
  assert.match(rules, /one of 1, 3/);
  assert.match(rules, /resume-1, resume-2/);
  assert.match(rules, /  boolean: bounds equals/);
  assert.match(rules, /kind boolean with "equals": true or false/);
  assert.match(rules, /code drops every bound the person did not write/);
});

test('the offer\'s words are a registered prompt register (the commit check reads the inventory)', () => {
  assert.ok(PROMPT_REGISTERS.some((e) => e.file === 'src/shapeoffer.js'));
});

test('OFF by default: the pinned bareguard has no itemShape, so the turn is today\'s turn byte for byte (the golden of the sheet tests)', async () => {
  const { sent, tools, r } = await turnOver({ input: PAGE, jobLines: [LINE], replies: [{ edits: [] }] });
  assert.equal(r.ok, true);
  assert.equal(JSON.stringify(tools).includes('itemShape'), false);
  assert.equal(JSON.stringify(sent).includes('THE ITEM SHAPE'), false);
  assert.equal(Object.hasOwn(r, 'shapeBuilt'), false);
  const golden = JSON.parse(readFileSync(join(HERE, 'fixtures', 'sheets', 'turn-plain.golden.json'), 'utf8'));
  const again = await turnOver({ input: { ...PAGE }, jobLines: [{ n: 1, text: 'List the flights', rule: 'only priority P1 tickets', rules: ['only priority P1 tickets'] }], replies: [{ edits: [] }] });
  assert.equal(JSON.stringify({ sent: again.sent, tools: again.tools }, null, 1), JSON.stringify(golden, null, 1));
});

test('forced ON: the turn shows THE ITEM SHAPE and the itemShape property; the reply\'s itemShape is taken out of the declaration, built by code into a shape part (TODO clause 5: the gates refuse it for now)', async () => {
  const { sent, tools, r } = await turnOver({ input: PAGE, jobLines: [LINE], replies: [{ edits: [], itemShape: SUGGESTION }], shape: true });
  const prompt = JSON.stringify(sent[0]);
  assert.match(prompt, /THE ITEM SHAPE/);
  assert.match(prompt, /boolean: bounds equals/);
  const props = tools[0][0].parameters.properties;
  assert.deepEqual(Object.keys(props), ['edits', 'itemShape']);
  assert.deepEqual(props.itemShape.items.properties.line.enum, [1]);
  assert.deepEqual(props.itemShape.items.properties.itemCountFrom.items.enum, ['Flights']);
  assert.equal(JSON.stringify(r.iterations[0].declaration ?? {}).includes('itemShape'), false, 'never part of the declaration');
  // the suggestion reached the block and became a shape part (the gates then name `fields` and `class: shape` as unknown): this is the clause 5 gap, pinned here so the day the gates learn a shape part this assertion flips
  assert.equal(r.stop, 'plan-red');
  assert.match(String(r.reds[0].detail), /parts\[0\]\.fields/);
  assert.match(String(r.reds[0].detail), /parts\[0\]\.class: one of countable \| fact \| sheet \| judged \| guard \| none/);
});
