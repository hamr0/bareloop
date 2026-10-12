// PART 1a, deliverable 5 — R11: every part of a rubric job line is SORTED at drafting (countable | judged | guard | none), and
// the sorting rules are plain-words reds in the gate that can still revise (src/rubricstep.js `checkRubricParts`, run by
// `validateDeclaration`). Judged parts are refused in this build ("next build, nothing spent"); a guard needs a web input and
// there are none; an unsortable part, a contradiction (naming both parts and both numbers), a wrong line and an unknown
// input label are each named. Real data: a copy of this repo's CHANGELOG.md frozen by the real door and listed by git; a
// scripted model boundary that can only DELIVER a declaration.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDeclaration, classGuards, catalogueForLang, RUBRIC_LANG } from '../src/authoring.js';
import { authorClose, declarationSchema, DECLARATION_TOOL_NAME, GREEN_QUESTIONS, renderRejectBlock } from '../src/authorflow.js';
import { buildSeedListing } from '../src/authorscout.js';
import { proveRubricInputs } from '../src/source.js';
import { draftStopText, signingStopText } from '../src/authorreadout.js';
import { checkRubricParts } from '../src/rubricstep.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'rubric-sort-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };

const LISTING = ['input/CHANGELOG.md', 'output/.gitkeep'];
const guard = { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } };
const step = (n, parts, extra = {}) => ({ name: `line-${n}`, fromLine: [n], kind: 'rubric-step', params: { step: n, parts }, ...extra });
const decl = (...stages) => ({ stages: [guard, ...stages] });
const validate = (d, jobLines = [{ n: 1 }], inputLabels = ['Changelog']) => validateDeclaration(d, {
  catalogue: catalogueForLang(RUBRIC_LANG), listing: LISTING, guards: classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG }),
  envOwned: [], verdictType: 'soft-green', writeScope: ['output/'], jobLines, inputLabels,
});
const details = (r) => r.reds.map((x) => `${x.code}: ${x.detail}`);
const count = (check, text, rest) => ({ text, class: 'countable', check, ...rest });

test('a sorted line validates: countable parts of every check, a line with no parts at all, two lines', () => {
  const r = validate(decl(
    step(1, [count('maxWords', 'under 200 words', { value: 200 }), count('cited', 'quote the changelog', { source: 'Changelog' }),
      count('sections', 'an Added and a Fixed section', { names: ['Added', 'Fixed'] })]),
    step(2, []),
  ), [{ n: 1 }, { n: 2 }]);
  assert.deepEqual(details(r), []);
  assert.equal(r.ok, true);
});

test('a judged part is a red in the exact plain words, naming the line; nothing is approximated by a count', () => {
  const r = validate(decl(step(1, [{ text: 'the tone should be friendly', class: 'judged' }])));
  assert.equal(r.ok, false);
  assert.deepEqual(details(r), ['rubric-part-judged: line 1: this rule needs the judge, which arrives in the next build. Nothing spent.']);
  assert.equal(r.reds[0].path, 'stages[1].params.parts[0]');
});

test('an unsortable part (class none) is a red quoting the person\'s words, in the exact plain words', () => {
  const r = validate(decl(step(1, [{ text: 'make it sound smart', class: 'none' }])));
  assert.deepEqual(details(r), ["rubric-part-unsortable: line 1: 'make it sound smart' can't be counted or checked against a quote. Say it as a count (words, sections, rows) or as something a quote must show."]);
});

test('a guard part is a red: it is about web sources and the job has none', () => {
  const r = validate(decl(step(1, [{ text: 'only use reuters.com', class: 'guard', domains: ['reuters.com'] }])));
  assert.deepEqual(details(r), ["rubric-part-guard: line 1: 'only use reuters.com' is about web sources, and this job has no web input. Nothing spent."]);
});

test('contradicting countables: a minimum above a maximum names BOTH parts and BOTH numbers; a satisfiable pair is not a red', () => {
  const r = validate(decl(step(1, [count('maxWords', 'at most 100 words', { value: 100 }), count('minWords', 'at least 200 words', { value: 200 })])));
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  const d = r.reds[0].detail;
  assert.equal(r.reds[0].code, 'rubric-contradiction');
  for (const need of ['line 1', "'at most 100 words'", 'at most 100 words', "'at least 200 words'", 'at least 200 words', 'between 200 and 100']) assert.ok(d.includes(need), `${need} in: ${d}`);
  assert.deepEqual(details(validate(decl(step(1, [count('maxWords', 'a', { value: 200 }), count('minWords', 'b', { value: 200 })])))), [], 'exactly equal is satisfiable');
  // sectionWords asks each section for 80-120% of its words, so 2 sections of 100 need at least 160 words overall
  const sw = validate(decl(step(1, [count('sectionWords', 'two sections of about 100 words', { names: ['A', 'B'], wordsPerSection: 100 }), count('maxWords', 'under 120 words overall', { value: 120 })])));
  assert.equal(sw.reds[0]?.code, 'rubric-contradiction');
  assert.match(sw.reds[0].detail, /at least 160 words/);
  assert.match(sw.reds[0].detail, /at most 120 words/);
});

test('a stage serves exactly its own line; two stages never read one line\'s file; a cited part must name one of the job\'s inputs', () => {
  const wrongLine = validate(decl(step(1, [], { fromLine: [2] })), [{ n: 1 }, { n: 2 }]);
  assert.ok(details(wrongLine).some((x) => /^rubric-step-line: line 1: stage "line-1" reads the file for job line 1 but says it serves line\(s\) 2/.test(x)), details(wrongLine).join('\n'));
  const twice = validate(decl(step(1, []), { ...step(1, []), name: 'line-1b' }));
  assert.ok(details(twice).some((x) => /^rubric-step-twice: line 1: stages "line-1" and "line-1b" both read the file for job line 1/.test(x)));
  const src = validate(decl(step(1, [count('cited', 'quote the minutes', { source: 'Minutes' })])));
  assert.deepEqual(details(src), ['rubric-part-source: line 1: \'quote the minutes\' asks for a quote from "Minutes", but the job\'s inputs are "Changelog".']);
  // with no labels in hand the label rule is skipped (a caller that holds no inputs)
  assert.deepEqual(details(validate(decl(step(1, [count('cited', 'quote the minutes', { source: 'Minutes' })])), [{ n: 1 }], null)), []);
});

test('checkRubricParts is pure and never throws on malformed stages', () => {
  const seen = [];
  const red = (code) => seen.push(code);
  assert.doesNotThrow(() => checkRubricParts([null, 'x', { kind: 'rubric-step' }, { kind: 'rubric-step', params: { step: 1, parts: [null, 5, { class: 'none' }] } }], { red }));
  assert.deepEqual(seen, ['rubric-part-unsortable']);
});

test('the declaration schema for the text genre can only SAY a sorted part: four classes, the eight checks, no stray field, no command kind', () => {
  const cat = catalogueForLang(RUBRIC_LANG);
  const schema = declarationSchema(KIND_CAT_ALL(), { verdictType: 'soft-green', kinds: Object.keys(cat) });
  const branches = schema.properties.stages.items.oneOf;
  assert.deepEqual(branches.map((b) => b.title).sort(), ['files-changed', 'rubric-step']);
  const parts = branches.find((b) => b.title === 'rubric-step').properties.params.properties.parts.items;
  assert.deepEqual(parts.properties.class.enum, ['countable', 'judged', 'guard', 'none']);
  assert.deepEqual(parts.properties.check.enum, ['maxWords', 'minWords', 'maxLines', 'sections', 'sectionWords', 'cited', 'minClaims', 'maxClaims']);
  assert.equal(parts.additionalProperties, false);
  assert.deepEqual(parts.required, ['text', 'class']);
});
import { KIND_CATALOGUE } from '../src/authoring.js';
function KIND_CAT_ALL() { return KIND_CATALOGUE; }

test('the revise loop carries the plain sentence back: try 1 sorts a part as judged, the measured block quotes the red, try 2 drops it and the declaration is accepted', async () => {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(proved.ok, true);
  if (!proved.ok) return;
  const { prep } = proved;
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const script = [
    decl(step(1, [{ text: 'the tone should be friendly', class: 'judged' }])),
    { ...decl(step(1, [count('maxWords', 'under 200 words', { value: 200 })])), refused: undefined },
  ];
  const turns = [];
  let call = 0;
  const generate = async (messages, tools) => {
    turns.push(messages);
    const tool = tools.find((t) => t.name === DECLARATION_TOOL_NAME);
    const d = script[Math.min(call, script.length - 1)];
    call += 1;
    await tool.execute(JSON.parse(JSON.stringify(d)));
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: '1. Summarize the unreleased changes\n   rule: be friendly, under 200 words' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }] }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines: [{ n: 1, text: 'Summarize', rule: 'be friendly, under 200 words' }],
    inputs: [{ n: 1, label: 'Changelog', value: file }],
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.ok(call >= 2, 'the red sent the loop to a revision (a later identical declaration then ends it as unchanged)');
  const revise = turns[1].at(-1).content;
  assert.match(revise, /rubric-part-judged at stages\[1\]\.params\.parts\[0\]: line 1: this rule needs the judge, which arrives in the next build\. Nothing spent\./);
  assert.equal(r.declaration.stages[1].params.parts[0].check, 'maxWords');
});

test('both doors print the sorting reds in FULL (no 60-character cut): the drafting stop and the signing stop', () => {
  const reds = [
    { code: 'rubric-part-unsortable', path: 'stages[1].params.parts[0]', detail: "line 2: 'make the whole thing feel considerably more professional and polished throughout' can't be counted or checked against a quote. Say it as a count (words, sections, rows) or as something a quote must show." },
    { code: 'rubric-part-judged', path: 'stages[1].params.parts[1]', detail: 'line 2: this rule needs the judge, which arrives in the next build. Nothing spent.' },
  ];
  // whole, but without a trailing "Nothing spent." — these stops follow paid model calls (the $0 front-door wording would be false here)
  const whole = (/** @type {string} */ d) => d.replace(/ Nothing spent\.$/, '');
  const drafting = draftStopText({ stop: 'max-revisions', reds, spend: { knownUsd: 0.03, spendComplete: true } });
  for (const r of reds) assert.ok(drafting.includes(whole(r.detail)), `drafting stop lost: ${r.detail}\n${drafting}`);
  assert.doesNotMatch(drafting, /Nothing spent/);
  const signing = signingStopText({ reds, spend: { knownUsd: 0.03, spendComplete: true } });
  for (const r of reds) assert.ok(signing.includes(whole(r.detail)), `signing stop lost: ${r.detail}\n${signing}`);
  assert.doesNotMatch(signing, /Nothing spent/);
  assert.equal(signing.includes('no plain wording yet'), false);
});

test('renderRejectBlock keeps the plain sentences whole for the model (it is what the revise turn carries)', () => {
  const block = renderRejectBlock({ kind: 'validation', reds: [{ code: 'rubric-part-judged', path: 'a', detail: 'line 1: this rule needs the judge, which arrives in the next build. Nothing spent.' }] });
  assert.match(block, /line 1: this rule needs the judge, which arrives in the next build\. Nothing spent\./);
});
