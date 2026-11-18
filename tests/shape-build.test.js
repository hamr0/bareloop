// Shape jobs (itemShape), clause 2 "Build or refuse" (docs/product/ITEM33-BUILD.md "Addendum 2026-11-18: shape jobs", code rules R1-R5): the builder of the shape of a job line from the AI's typed suggestion.
// Fixtures are written here, in the live reply's shape (the POC's `fields` / `extraFields` / `itemCountFrom`); no bareguard itemShape is needed ($0, no model).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShapeLine, buildShapes, boundGrounded, fieldSpec, NO_FIELD_WHY } from '../src/shapebuild.js';
import { SHAPE_KINDS, shapeMenuLines, shapeAvailable, nameWhy, shapeNameRules } from '../src/shapemenu.js';

const NR = { max: 128, forbidden: ['.', ':', '[', ']'], reserved: ['missing', 'wrong-type', 'wrong-value'] };
const TRACKER = { n: 1, text: 'List my research items', rules: ['each item has a title', 'status is in progress, closed or finished', 'the summary is under 200 characters'] };
const f = (/** @type {any} */ o) => ({ required: true, bounds: {}, fromRule: null, ...o });
const TRACKER_ANS = {
  fields: [
    f({ name: 'title', kind: 'text', bounds: { minChars: 1 }, fromRule: 1 }),
    f({ name: 'status', kind: 'oneOf', bounds: { values: ['in progress', 'closed', 'finished'] }, fromRule: 2 }),
    f({ name: 'summary', kind: 'text', bounds: { maxChars: 200 }, fromRule: 3 }),
  ],
  extraFields: [f({ name: 'owner', kind: 'text', required: false })],
  itemCountFrom: null,
};

test('the kind menu is named in one place and carries boolean with equals', () => {
  assert.deepEqual([...SHAPE_KINDS.boolean], ['equals']);
  assert.ok(shapeMenuLines().includes('  boolean: bounds equals'));
  assert.ok(!('object' in SHAPE_KINDS), 'object is not offered');
  assert.equal(shapeAvailable(), false, 'the pinned bareguard has no itemShape: the whole path is off');
});

test('every ~ rule maps to one field of the right kind and a grounded bound; a suggested extra field is held out', () => {
  const r = buildShapeLine({ line: TRACKER, labels: ['tracker'], suggestion: TRACKER_ANS, nameRules: NR });
  assert.equal(r.ok, true);
  assert.deepEqual(r.fields.filter((x) => x.by === 'you').map((x) => [x.name, x.kind, x.rule]), [['title', 'text', 1], ['status', 'oneOf', 2], ['summary', 'text', 3]]);
  assert.deepEqual(fieldSpec(r.fields[0]), { kind: 'text', required: true, minChars: 1 });
  assert.deepEqual(r.fields[1].bounds.values, ['in progress', 'closed', 'finished']);
  assert.equal(r.fields[2].bounds.maxChars, 200);
  const owner = r.fields.find((x) => x.name === 'owner');
  assert.equal(owner?.by, 'agent');
  assert.equal(owner?.held, true, 'R2: no word of owner in the job: Suggested');
  assert.deepEqual(owner?.bounds, {});
  assert.deepEqual(r.rows.map((x) => x.state), ['built', 'built', 'built']);
});

test('R1: a bound is grounded only in the field\'s own rule (200 is in rule 3, not in rule 1)', () => {
  const ans = { fields: [f({ name: 'title', kind: 'text', bounds: { maxChars: 200 }, fromRule: 1 })] };
  const r = buildShapeLine({ line: TRACKER, labels: [], suggestion: ans, nameRules: NR });
  assert.deepEqual(r.fields[0].bounds, {}, 'the number is in another rule of the line, not this field\'s');
  assert.match(r.refused.map((x) => x.why).join('|'), /maxChars 200 is not in your rule for this field/);
});

test('R1: an AI-added field gets no grounded bound, even one that is a number in the job line', () => {
  const line = { n: 1, text: 'List 3 flights', rules: ['the departure time is between 05:00 and 21:59'] };
  const ans = { fields: [f({ name: 'departure', kind: 'time', bounds: { min: '05:00', max: '21:59' }, fromRule: 1 })], extraFields: [f({ name: 'duration', kind: 'text', bounds: { minChars: 3, maxChars: 20 }, required: false })] };
  const r = buildShapeLine({ line, labels: [], suggestion: ans, nameRules: NR });
  const dur = r.fields.find((x) => x.name === 'duration');
  assert.deepEqual(dur?.bounds, {}, 'the "3" of "List 3 flights" and the 21 of 21:59 ground nothing for a field with no rule');
  assert.deepEqual(r.fields[0].bounds, { min: '05:00', max: '21:59' });
});

test('R1 exception: required + minChars 1 on an AI-added field is the spec\'s "each item has a title"', () => {
  const ans = { fields: [f({ name: 'title', kind: 'text', bounds: { minChars: 1 }, fromRule: 1 })], extraFields: [f({ name: 'link', kind: 'text', bounds: { minChars: 1 } })] };
  const line = { n: 1, text: 'List the link of each item', rules: ['each item has a title'] };
  const r = buildShapeLine({ line, labels: [], suggestion: ans, nameRules: NR });
  assert.deepEqual(r.fields.find((x) => x.name === 'link')?.bounds, { minChars: 1 });
});

test('R2: an AI-added field with a word in the job line is job-derived (on, droppable); one with none is Suggested', () => {
  const line = { n: 1, text: 'List the flights with the airline', rules: ['the price is under 450'] };
  const ans = { fields: [f({ name: 'price', kind: 'money', bounds: { lt: 450 }, fromRule: 1 })], extraFields: [f({ name: 'airline', kind: 'text' }), f({ name: 'duration', kind: 'text' })] };
  const r = buildShapeLine({ line, labels: [], suggestion: ans, nameRules: NR });
  assert.equal(r.fields.find((x) => x.name === 'airline')?.held, false);
  assert.equal(r.fields.find((x) => x.name === 'duration')?.held, true);
});

test('R3: oneOf keeps each grounded value and drops only the ungrounded ones', () => {
  const ans = { fields: [f({ name: 'status', kind: 'oneOf', bounds: { values: ['in progress', 'closed', 'archived'] }, fromRule: 2 })] };
  const r = buildShapeLine({ line: TRACKER, labels: [], suggestion: ans, nameRules: NR });
  assert.deepEqual(r.fields[0].bounds.values, ['in progress', 'closed']);
  assert.match(r.refused.map((x) => x.why).join('|'), /"archived" is not in your rule/);
});

test('R4: an item count is signed only for real labels the person\'s words say "per" or "each"', () => {
  const line = { n: 1, text: 'Read each resume against the job description', rules: ['one blurb per resume', 'the blurb is under 60 words'] };
  const ans = { fields: [f({ name: 'blurb', kind: 'text', bounds: { maxWords: 60 }, fromRule: 2 })], itemCountFrom: ['resume-1', 'resume-2'] };
  const labels = ['job-description', 'resume-1', 'resume-2'];
  const ok = buildShapeLine({ line, labels, suggestion: ans, nameRules: NR });
  assert.deepEqual(ok.itemCount, { labels: ['resume-1', 'resume-2'], n: 2 });
  const wrong = buildShapeLine({ line, labels, suggestion: { ...ans, itemCountFrom: ['job-description'] }, nameRules: NR });
  assert.equal(wrong.itemCount, null, '"job-description" is not said as "per job-description"');
  const unreal = buildShapeLine({ line, labels, suggestion: { ...ans, itemCountFrom: ['resume-9'] }, nameRules: NR });
  assert.equal(unreal.itemCount, null);
  assert.match(unreal.refused.map((x) => x.why).join('|'), /"resume-9" is not an input of this job/);
  const unsaid = buildShapeLine({ line: { ...line, text: 'Read the resumes' , rules: ['the blurb is under 60 words'] }, labels, suggestion: { ...ans, fields: [f({ name: 'blurb', kind: 'text', bounds: { maxWords: 60 }, fromRule: 1 })] }, nameRules: NR });
  assert.equal(unsaid.itemCount, null, 'the AI\'s "one item per input" is not the person\'s words');
});

test('R5: equals only on a field with its own rule, only true or false', () => {
  const line = { n: 1, text: 'List 3 flights with the airline', rules: ['the flight is nonstop'] };
  const ok = buildShapeLine({ line, labels: [], suggestion: { fields: [f({ name: 'nonstop', kind: 'boolean', bounds: { equals: true }, fromRule: 1 })] }, nameRules: NR });
  assert.deepEqual(ok.fields[0].bounds, { equals: true });
  assert.deepEqual(fieldSpec(ok.fields[0]), { kind: 'boolean', required: true, equals: true });
  const own = { fields: [f({ name: 'nonstop', kind: 'boolean', bounds: {}, fromRule: 1 })], extraFields: [f({ name: 'airline', kind: 'boolean', bounds: { equals: true } })] };
  const a = buildShapeLine({ line, labels: [], suggestion: own, nameRules: NR });
  assert.deepEqual(a.fields.find((x) => x.name === 'airline')?.bounds, {}, 'an AI-added field never gets equals');
  const s = buildShapeLine({ line, labels: [], suggestion: { fields: [f({ name: 'nonstop', kind: 'boolean', bounds: { equals: 'true' }, fromRule: 1 })] }, nameRules: NR });
  assert.deepEqual(s.fields[0].bounds, {}, 'the string "true" is not a boolean');
});

test('the menu check: kind, a bound the kind does not list, and a bound of the wrong type are refused with their reason', () => {
  const r = buildShapeLine({ line: TRACKER, labels: [], nameRules: NR, suggestion: { fields: [
    f({ name: 'title', kind: 'text', bounds: { equals: true, minChars: 'one' }, fromRule: 1 }),
    f({ name: 'status', kind: 'enum', bounds: {}, fromRule: 2 }),
    f({ name: 'summary', kind: 'object', fromRule: 3 }),
  ] } });
  const why = r.refused.map((x) => x.why).join(' | ');
  assert.match(why, /equals is not a bound of a text field/);
  assert.match(why, /minChars must be a whole number/);
  assert.match(why, /enum is not a field kind on the menu/);
  assert.match(why, /a nested object field is not offered yet/);
  assert.equal(r.rows[1].state, 'not-checked');
  assert.match(String(r.rows[1].reason), /field refused: enum is not a field kind/);
  assert.equal(r.rows[2].state, 'not-checked');
});

test('the name check: no . : [ ], at most 128 characters, not a reserved reason word, not twice', () => {
  for (const bad of ['a.b', 'a:b', 'a[0]', 'a]', 'x'.repeat(129), '', '  ', 'wrong-value', 'missing']) {
    const r = buildShapeLine({ line: TRACKER, labels: [], nameRules: NR, suggestion: { fields: [f({ name: bad, kind: 'text', fromRule: 1 })] } });
    assert.equal(r.fields.length, 0, `"${bad}" is refused`);
    assert.equal(r.ok, false);
  }
  assert.equal(nameWhy('x'.repeat(128), NR), null);
  const twice = buildShapeLine({ line: TRACKER, labels: [], nameRules: NR, suggestion: { fields: [f({ name: 'title', kind: 'text', fromRule: 1 }), f({ name: 'title', kind: 'text', fromRule: 3 })] } });
  assert.equal(twice.fields.length, 1);
});

test('the reserved words come from bareguard at runtime; a bareguard that lists none says so (reservedChecked false), never a hardcoded copy', () => {
  const live = shapeNameRules();
  assert.equal(live.reserved, null, 'the pinned bareguard (0.36) exposes no reserved list: the refusal is off and says so');
  const r = buildShapeLine({ line: TRACKER, labels: [], suggestion: TRACKER_ANS });
  assert.equal(r.reservedChecked, false);
  assert.equal(buildShapeLine({ line: TRACKER, labels: [], suggestion: TRACKER_ANS, nameRules: NR }).reservedChecked, true);
});

test('a rule no field holds is Not checked with the no-pick sentence; two fields for one rule keep the first', () => {
  const r = buildShapeLine({ line: TRACKER, labels: [], nameRules: NR, suggestion: { fields: [f({ name: 'title', kind: 'text', fromRule: 1 }), f({ name: 'heading', kind: 'text', fromRule: 1 })] } });
  assert.deepEqual(r.fields.map((x) => x.name), ['title']);
  assert.equal(r.rows[1].reason, NO_FIELD_WHY);
});

test('list fields: `of` is an entry spec whose bounds are grounded in the same rule; a list of lists is refused', () => {
  const line = { n: 1, text: 'List the words', rules: ['matching words is a list of at most 5 words, each under 40 characters'] };
  const ans = { fields: [f({ name: 'matching', kind: 'list', fromRule: 1, bounds: { of: { kind: 'text', maxChars: 40 }, maxEntries: 5 } })] };
  const r = buildShapeLine({ line, labels: [], suggestion: ans, nameRules: NR });
  assert.deepEqual(r.fields[0].bounds, { of: { kind: 'text', maxChars: 40 }, maxEntries: 5 });
  const nested = buildShapeLine({ line, labels: [], suggestion: { fields: [f({ name: 'm', kind: 'list', fromRule: 1, bounds: { of: { kind: 'list' } } })] }, nameRules: NR });
  assert.deepEqual(nested.fields[0].bounds, {});
  const str = buildShapeLine({ line, labels: [], suggestion: { fields: [f({ name: 'm', kind: 'list', fromRule: 1, bounds: { of: 'text' } })] }, nameRules: NR });
  assert.deepEqual(str.fields[0].bounds, { of: { kind: 'text' } }, 'the POC\'s string form is read as {kind}');
});

test('boundGrounded: an upper bound may be the written number minus one; a lower bound only the written number', () => {
  assert.equal(boundGrounded('maxWords', 59, 'under 60 words'), true);
  assert.equal(boundGrounded('minWords', 59, 'under 60 words'), false);
  assert.equal(boundGrounded('max', 449.99, 'under 450'), true, 'its ceiling is the written 450');
  assert.equal(boundGrounded('max', 300, 'under 450'), false);
  assert.equal(boundGrounded('values', 'closed', 'status is Closed or open'), true);
});

test('buildShapes routes each suggestion by its own line; a line with no suggestion or no rule field has no shape', () => {
  const lines = [TRACKER, { n: 2, text: 'Summarize', rules: ['one sentence'] }];
  const out = buildShapes({ lines, labels: [], nameRules: NR, suggestions: [
    { line: 1, ...TRACKER_ANS }, { line: 7, fields: [] }, 'nope',
    { line: 2, fields: [f({ name: 'x', kind: 'enum', fromRule: 1 })] },
  ] });
  assert.deepEqual(Object.keys(out.built), ['1']);
  assert.ok(out.refused.some((x) => x.line === null && x.helper === 'schema'));
  assert.ok(out.refused.some((x) => x.line === 7 && /not a line a shape can be offered for/.test(x.why)));
  assert.ok(out.refused.some((x) => x.line === 2));
});
