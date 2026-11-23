// REVIEW THE CODE, clean build item 2 (docs/product/ITEM33-BUILD.md "Addendum 2026-11-20 (b)"): the ONE table keyed by source (src/sourcedefaults.js) and the places that read it. For source `repo` every shape line carries Part A: the `[default]`
// item fields file, quote, why (required, non-empty, no other limit) and the `[default]` cite (each quote found in the repo file its item names); for `files` none. CheckBlock, the shape builder and the shape look read the table; no review
// flag exists. A `~` rule the AI points at one of those fields is carried by that field (bounds from the rule's own words only), and the look is told the fields exist. The signed part's `cite` must be the table's own. $0, real block and gates.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultsOf, SOURCE_DEFAULTS, REPO_LABEL } from '../src/sourcedefaults.js';
import { buildShapeLine, buildShapes, fieldSpec } from '../src/shapebuild.js';
import { CheckBlock } from '../src/checkblock.js';
import { cardOfClose, listMatchesClose, rubricStepShapeReds, lineBriefs, buildStepSpec, citedLabels, flattenStep } from '../src/rubricstep.js';
import { shapeLookPrompt, haveWords } from '../src/shapelook.js';
import { validateCloseDecl } from '../src/declaredclose.js';
import { classGuards } from '../src/authoring.js';

const NR = { max: 128, forbidden: ['.', ':', '[', ']'], reserved: ['missing', 'wrong-type', 'wrong-value'] };
const LINE = { n: 1, text: 'List the slow code in src/', rule: 'quotes the slow code; why is under 100 characters', rules: ['quotes the slow code', 'why is under 100 characters'] };
const PLAIN = { n: 1, text: 'List the slow code in src/' };
const f = (/** @type {any} */ o) => ({ required: true, bounds: {}, fromRule: null, ...o });
const SUGG = { fields: [f({ name: 'quote', kind: 'text', fromRule: 1 }), f({ name: 'why', kind: 'text', bounds: { maxChars: 99 }, fromRule: 2 })], extraFields: [], itemCountFrom: [] };
const REPO = defaultsOf('repo').fields;

test('the table: files adds no item fields and no cite; repo adds file, quote, why (required, non-empty) and cites the repo', () => {
  assert.deepEqual([...defaultsOf('files').fields], []);
  assert.equal(defaultsOf('files').cite, null);
  assert.deepEqual(REPO.map((x) => [x.name, x.kind, x.required, x.bounds]), ['file', 'quote', 'why'].map((n) => [n, 'text', true, { minChars: 1 }]));
  assert.equal(defaultsOf('repo').cite, REPO_LABEL);
  assert.equal(REPO_LABEL, 'repo');
  assert.equal(defaultsOf(undefined), SOURCE_DEFAULTS.files);
});

test('shapebuild: with the repo row every line carries file, quote, why as `[default]` fields, with or without a suggestion; with no row nothing is built from no suggestion', () => {
  const b = buildShapes({ lines: [PLAIN], labels: ['repo'], suggestions: [], defaultFields: REPO }).built[1];
  assert.deepEqual(b.fields.map((x) => [x.name, x.by, x.required, x.bounds, x.rule]), REPO.map((x) => [x.name, 'default', true, { minChars: 1 }, null]));
  assert.deepEqual(fieldSpec(b.fields[0]), { kind: 'text', required: true, minChars: 1 });
  assert.deepEqual(buildShapes({ lines: [PLAIN], labels: [], suggestions: [] }).built, {}, 'a job with no default fields builds nothing from no suggestion');
  assert.deepEqual(buildShapes({ lines: [PLAIN], labels: [], suggestions: [], defaultFields: defaultsOf('files').fields }).built, {});
});

test('shapebuild: a rule mapped onto a default field is carried by that field (bounds from the rule\'s own words only); an ungrounded bound or a non-text kind leaves the rule Not checked; with no default fields the same suggestion builds as before', () => {
  const r = buildShapeLine({ line: LINE, labels: ['repo'], suggestion: SUGG, nameRules: NR, defaultFields: REPO });
  assert.deepEqual(r.fields.map((x) => [x.name, x.by, x.rule]), [['file', 'default', null], ['quote', 'default', 1], ['why', 'default', 2]]);
  assert.deepEqual(r.fields.find((x) => x.name === 'why')?.bounds, { maxChars: 99, minChars: 1 }, '"under 100" signs 99 (code\'s law), on top of not-empty');
  assert.deepEqual(r.rows.map((x) => [x.rule, x.state, x.name]), [[1, 'built', 'quote'], [2, 'built', 'why']]);
  const bad = buildShapeLine({ line: LINE, labels: [], suggestion: { fields: [f({ name: 'why', kind: 'text', bounds: { maxChars: 40 }, fromRule: 2 })], extraFields: [] }, nameRules: NR, defaultFields: REPO });
  assert.equal(bad.fields.find((x) => x.name === 'why')?.rule, null);
  assert.equal(bad.rows[1].state, 'not-checked');
  assert.match(String(bad.rows[1].reason), /field refused: .*maxChars 40/);
  const num = buildShapeLine({ line: LINE, labels: [], suggestion: { fields: [f({ name: 'why', kind: 'number', bounds: {}, fromRule: 2 })], extraFields: [] }, nameRules: NR, defaultFields: REPO });
  assert.equal(num.rows[1].state, 'not-checked');
  const none = buildShapeLine({ line: LINE, labels: [], suggestion: { fields: [f({ name: 'quote', kind: 'text', bounds: { minChars: 1 }, fromRule: 1 })], extraFields: [] }, nameRules: NR });
  assert.deepEqual(none.fields.map((x) => [x.name, x.by]), [['quote', 'you']], 'files: the field is the rule\'s own, as before');
});

/** the check block of a repo-source job, as the drafter makes it */
function block(source = 'repo', lines = [LINE], sugg = SUGG) {
  const b = new CheckBlock({ texts: { repo: 'src/slow.js' }, labels: ['repo'], asks: false, split: true, source });
  b.fromJob(lines); b.setGuards([], ['output/']); b.reconcile();
  const defaultFields = defaultsOf(source).fields;
  b.setShape(buildShapes({ lines, labels: ['repo'], suggestions: sugg ? [{ line: 1, ...sugg }] : [], defaultFields })); b.reconcile();
  return b;
}

test('the check block (one owner) reads the table: Part A\'s `[default]` rows are built and ride ONE shape part that carries the cite; a rule a field carries is Checked on that field\'s own row', () => {
  const b = block('repo', [PLAIN], null);
  const rows = b.rows.filter((r) => r.line === 1 && r.by === 'default' && ['shape', 'cited'].includes(r.kind));
  assert.deepEqual(rows.map((r) => [r.key, r.state]).sort(), [['L1.$cited', 'built'], ['L1.shape.file', 'built'], ['L1.shape.quote', 'built'], ['L1.shape.why', 'built']]);
  const parts = b.build().stages[0].params.parts;
  assert.deepEqual(parts.map((/** @type {any} */ p) => p.class), ['shape'], 'the cite is the shape part\'s own: no separate quote part');
  assert.equal(parts[0].cite, 'repo');
  assert.deepEqual(parts[0].fields.map((/** @type {any} */ x) => [x.name, x.row]), [['file', 'default'], ['quote', 'default'], ['why', 'default']]);
  assert.deepEqual(rubricStepShapeReds({ step: 1, parts }, 'x'), []);
  assert.equal(b.rowChoice('L1.shape.quote', 'drop').ok, false, 'code\'s own rows are not droppable');
  assert.equal(b.rows.find((r) => r.kind === 'prose')?.state, 'not-checked', 'the quality of the answer stays with the person at Accept');
  const c = block('repo');
  assert.deepEqual(c.rows.filter((r) => r.kind === 'rule').map((r) => [r.rule, r.state, r.can?.how]), [[1, 'built', 'shape'], [2, 'built', 'shape']]);
  assert.deepEqual(c.rows.filter((r) => r.kind === 'shape').map((r) => r.key).sort(), ['L1.shape.file'], 'quote and why are the rules\' own rows; no second `[default]` row for a field a rule took');
  const cp = c.build().stages[0].params.parts[0];
  assert.deepEqual(cp.fields.map((/** @type {any} */ x) => [x.name, x.rule ?? null, x.row ?? null]), [['file', null, 'default'], ['quote', 1, null], ['why', 2, null]]);
});

test('a files-source block builds none of Part A: no default rows, no cite, no shape part', () => {
  const b = block('files', [PLAIN], null);
  assert.equal(b.rows.some((r) => r.kind === 'shape'), false);
  assert.equal(JSON.stringify(b.build().stages).includes('"cite"'), false);
  assert.equal(b.build().stages[0].params.parts.some((/** @type {any} */ p) => p.class === 'shape'), false);
});

test('a rule the person drops goes Not checked and its field stands again as the plain `[default]` field', () => {
  const b = block();
  assert.equal(b.rowChoice('L1.~1', 'drop').ok, true);
  assert.equal(b.rows.find((r) => r.key === 'L1.~1')?.state, 'not-checked');
  assert.ok(b.rows.some((r) => r.key === 'L1.shape.quote' && r.by === 'default'));
  const parts = b.build().stages[0].params.parts;
  assert.deepEqual(parts[0].fields.map((/** @type {any} */ x) => [x.name, x.rule ?? null, x.row ?? null]), [['file', null, 'default'], ['quote', null, 'default'], ['why', 2, null]]);
});

test('the signed list matches the close, and the card shows the `[default]` rows in code\'s words (the cite is a truth check, the item fields are form checks)', () => {
  const b = block('repo', [PLAIN], null);
  const closeDecl = { stages: b.build().stages, list: b.signedRows() };
  assert.deepEqual(listMatchesClose(closeDecl), { ok: true });
  const card = cardOfClose({ closeDecl, jobLines: [PLAIN] });
  const mine = card.checkItems.filter((/** @type {any} */ c) => c.by === 'default' && c.fromLine[0] === 1 && c.key !== 'L1.$floor');
  assert.deepEqual(mine.map((/** @type {any} */ c) => [c.key, !!c.shape]).sort(), [['L1.$cited', false], ['L1.shape.file', true], ['L1.shape.quote', true], ['L1.shape.why', true]]);
  assert.match(mine.find((/** @type {any} */ c) => c.key === 'L1.$cited').text, /every item's quote is found word for word in the repo file the item names/);
  assert.match(mine[0].text, /^file · not empty/);
});

test('the worker is told what file and quote mean and that code checks every quote against the files it names; the part\'s cite reads the label the runner holds', () => {
  const stages = block('repo', [PLAIN], null).build().stages;
  const brief = lineBriefs({ stages }).find((/** @type {any} */ x) => x.line === 1)?.text ?? '';
  assert.match(brief, /"file" is the path of ONE file of the repo, written as the repo lists it/);
  assert.match(brief, /Code checks every quote against the files you name\./);
  assert.match(brief, /^Job line 1 is a LIST line\. Write output\/steps\/1\.json as \{"results": \[/);
  const p = stages[0].params;
  assert.deepEqual(citedLabels(p), ['repo']);
  assert.equal(buildStepSpec(p, { repo: 'x' }).checkpoints !== undefined, true);
  assert.equal(Object.keys(flattenStep({ results: [{ file: 'a', quote: 'q', why: 'w' }] }, [], null, [], [], p.parts[0])).includes('cites:repo'), true);
  assert.equal(lineBriefs({ stages: block('files', [PLAIN], null).build().stages }).some((/** @type {any} */ x) => /ONE file of the repo/.test(x.text)), false);
});

test('the look is told the fields exist and how to map a rule onto one, and not to add a second field, ONLY when the table has default fields (no `have` = byte-identical prompt)', () => {
  const o = { jobLines: [LINE], lineNums: [1], texts: {}, left: [{ line: 1, rules: [1, 2] }] };
  const names = REPO.map((x) => x.name);
  const on = shapeLookPrompt({ ...o, have: names });
  assert.ok(on.includes(haveWords(names)));
  assert.match(on, /Every item already has these fields, made by code: "file", "quote", "why"\./);
  assert.match(on, /give a field with exactly that name, kind text, required true, and that rule's number as "fromRule"/);
  assert.match(on, /Do not add a second field for what file, quote, why already hold\./);
  assert.equal(shapeLookPrompt(o), shapeLookPrompt({ ...o, have: [] }));
  assert.equal(haveWords([]), '');
  assert.equal(shapeLookPrompt(o).includes('already has these fields'), false);
});

test('the signed shape part and the signed source are ONE truth: a part whose cite differs from the source\'s row reds at the validator, both ways', () => {
  const stages = block('repo', [PLAIN], null).build().stages;
  const noCite = JSON.parse(JSON.stringify(stages));
  delete noCite[0].params.parts[0].cite;
  const decl = (/** @type {any} */ st, /** @type {any} */ extra) => ({ genre: 'TEXT', lang: 'text', stages: [{ ...classGuards({ verdictType: 'soft-green', lang: 'text' })[0], params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }, ...st], refused: [], ...extra });
  const opts = { listing: ['src/slow.js'], verdictType: 'soft-green', writeScope: ['output/'], jobLines: [PLAIN], inputLabels: ['repo'] };
  const reds = (/** @type {any} */ d) => validateCloseDecl(d, opts).reds.filter((/** @type {any} */ x) => /\.cite$/.test(x.path));
  assert.deepEqual(reds(decl(stages, { source: 'repo' })), [], 'repo + cite: agree');
  assert.equal(reds(decl(noCite, { source: 'repo' })).length, 1, 'repo with no cite on its part');
  assert.equal(reds(decl(stages, {})).length, 1, 'a files close (no source) whose part carries a repo cite');
});
