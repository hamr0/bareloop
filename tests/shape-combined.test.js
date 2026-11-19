// Facts + shape on ONE answer list (docs/product/ITEM33-BUILD.md "Facts and shape on one answer, rules first: the spec"), REAL data: the real archived dell and flights step answers with their real signed fact parts and
// their saved inputs (tests/fixtures/shape-combined, copied from .claude/scratch/shape-combined/real, verified there in rounds 1-2), graded by the product's own gradeStep with a `shape` part beside the fact part:
// `cited` and a CLOSED `itemShape` (quote + values + the shape field, no claim) read the same `results` list. We add one shape field, `tag` (oneOf a|b, required), to copies of the real answers. $0, no provider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gradeStep, buildStepSpec, lineBriefs } from '../src/rubricstep.js';
import { buildShapePart, shapeItemCheck } from '../src/shaperows.js';

const fx = (/** @type {string} */ n) => readFileSync(new URL(`./fixtures/shape-combined/${n}`, import.meta.url), 'utf8');
const TAG = buildShapePart({ text: 'the items of line 1', fields: [{ name: 'tag', spec: { kind: 'oneOf', required: true, values: ['a', 'b'] }, rule: 2, by: 'you' }] });

async function grade(/** @type {string} */ name, /** @type {(a: any) => void} */ mutate = () => {}, parts = 'both') {
  const c = JSON.parse(fx(`${name}.part.json`));
  const input = fx(`${name}.input.txt`);
  const answer = JSON.parse(fx(`${name}.answer.json`));
  for (const it of answer.results) it.tag = 'a';
  mutate(answer);
  const p = parts === 'both' ? [c.part, TAG] : [c.part];
  const bytes = JSON.stringify(answer);
  return gradeStep({ params: { step: c.step, parts: p }, bytes, outputBytes: bytes, inputs: { [c.part.source]: input } }, { [c.part.source]: createHash('sha256').update(input).digest('hex') });
}
const FAKE = 'this sentence is not anywhere on the saved page';
const checksOf = (/** @type {any} */ g) => (g.rawGaps ?? []).map((/** @type {any} */ x) => x.check);

test('the real dell answer (decimal-comma prices, the two-pass as-written read) with the shape check added is GREEN', async () => {
  const g = await grade('dell-1');
  assert.equal(g.verdict, 'green', JSON.stringify(g.gapLines));
  assert.deepEqual(g.rawGaps ?? [], []);
  assert.equal((await grade('dell-1', () => {}, 'fact-only')).verdict, 'green', 'and without it, as the real run was');
});

test('V4, an extra key inside values, is reported ONCE, by itemShape alone (cited reads claims built from the signed fact names and never sees it)', async () => {
  for (const name of ['dell-1', 'flights-3']) {
    const g = await grade(name, (a) => { a.results[0].values.extra = 'x'; });
    assert.equal(g.verdict, 'red', name);
    assert.deepEqual(checksOf(g), ['itemShape'], `${name}: one gap, from itemShape`);
    assert.deepEqual(g.rawGaps[0].items, ['#0:values:unknown-field:extra']);
    assert.equal(g.gapLines.filter((l) => /extra/.test(l)).length, 1, `${name}: told once in plain words`);
    assert.match(g.gapLines.join('\n'), /item 1: "values" has a field "extra" that the job does not ask for/);
  }
});

test('V3, a bad shape field AND a made-up quote on item 0: exactly TWO gaps, one from each check, each in plain words', async () => {
  for (const name of ['dell-1', 'flights-3']) {
    const g = await grade(name, (a) => { a.results[0].tag = 'z'; a.results[0].quote = FAKE; });
    assert.equal(g.verdict, 'red');
    assert.deepEqual([...checksOf(g)].sort(), ['cited', 'itemShape'], `${name}: two gaps`);
    assert.equal(g.rawGaps.find((/** @type {any} */ x) => x.check === 'itemShape').items.join(), '#0:tag:not-one-of');
    assert.deepEqual(g.gapLines.length, 2, `${name}: two lines: ${g.gapLines.join(' | ')}`);
    assert.ok(g.gapLines.some((l) => /item 1: "tag" is not one of the allowed values/.test(l)));
  }
});

test('each fault has one owner: a bad tag reds itemShape only; a made-up quote reds cited only; a "$"-prefixed money value reds cited only; a missing tag and an unlisted key red itemShape only', async () => {
  assert.deepEqual(checksOf(await grade('flights-3', (a) => { a.results[0].tag = 'z'; })), ['itemShape']);
  assert.deepEqual(checksOf(await grade('flights-3', (a) => { a.results[0].quote = FAKE; })), ['cited']);
  assert.deepEqual(checksOf(await grade('flights-3', (a) => { a.results[0].values.price = `$${a.results[0].values.price}`; })), ['cited']);
  assert.deepEqual((await grade('flights-3', (a) => { delete a.results[1].tag; })).rawGaps.map((/** @type {any} */ x) => x.items), [['#1:tag:missing']]);
  assert.deepEqual((await grade('flights-3', (a) => { a.results[0].note = 'x'; })).rawGaps.map((/** @type {any} */ x) => x.items), [['#0:unknown-field:note']]);
});

test('the merged itemShape is CLOSED and lists the cited keys: quote (text, required), values (one optional field per signed fact; number from text for money), no claim; the count stays with the fact part', () => {
  const c = JSON.parse(fx('flights-3.part.json'));
  const check = shapeItemCheck(TAG, 'p2-shape', c.part);
  assert.deepEqual(Object.keys(check.fields), ['quote', 'values', 'tag']);
  assert.deepEqual(check.fields.quote, { kind: 'text', required: true });
  assert.equal(check.fields.values.kind, 'object');
  assert.deepEqual(check.fields.values.fields.price, { kind: 'number', fromText: true });
  assert.deepEqual(check.fields.values.fields['origin airport'], { kind: 'text' });
  assert.equal(Object.hasOwn(check.fields, 'claim'), false);
  assert.equal(Object.hasOwn(check, 'minItems'), false, 'the fact part\'s own count checks keep the item count (one fault, one report)');
  const alone = shapeItemCheck({ ...TAG, minItems: 2, maxItems: 2 }, 'p1-shape', null);
  assert.deepEqual([alone.minItems, alone.maxItems, Object.keys(alone.fields)], [2, 2, ['tag']], 'a shape-only line: its own count and fields');
  assert.ok(buildStepSpec({ step: 1, parts: [c.part, TAG] }, { [c.part.source]: '0'.repeat(64) }).checkpoints['1'].checks.some((/** @type {any} */ x) => x.id === 'p2-shape'));
});

test('the worker brief of a facts+shape line: the facts brief, then each shape field in plain words and ONE example result with quote, values and the shape field', () => {
  const c = JSON.parse(fx('flights-3.part.json'));
  const brief = lineBriefs({ stages: [{ name: 'line-1', kind: 'rubric-step', params: { step: c.step, parts: [c.part, TAG] } }] }).find((b) => b.line === c.step)?.text ?? '';
  assert.match(brief, /FACTS line/);
  assert.match(brief, /Each result ALSO carries these fields/);
  assert.match(brief, /- tag: one of: a, b/);
  const ex = JSON.parse(/One example result: (\{.*\})/.exec(brief)?.[1] ?? 'null');
  assert.deepEqual(Object.keys(ex), ['quote', 'values', 'tag']);
  assert.equal(ex.tag, 'a');
  assert.deepEqual(Object.keys(ex.values).sort(), c.part.facts.map((/** @type {any} */ f) => f.name).sort());
});
