// PART 1a, deliverables 3 + 4 — the `rubric-step` close kind (src/kinds.js `runRubricStep`, src/rubricstep.js) and the checks
// it carries: `happened` (bareguard's built-in), `cited` per input the step cites, and the countable limits on `text`.
// Real data: a copy of this repo's CHANGELOG.md frozen by the real source door; the quotes are lines CUT FROM THAT FILE.
// Real bareguard 0.21 does the grading. No model is involved.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, copyFileSync, symlinkSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runStage, seedRead, LIVE_KINDS, EXIT_RED, EXIT_GREEN, EXIT_STOP,
} from '../src/kinds.js';
import { CATALOGUE_LIVE_KINDS, catalogueForLang, RUBRIC_LANG, validateDeclaration, classGuards } from '../src/authoring.js';
import { validateCloseDecl, declaredStages, runDeclaredStages } from '../src/declaredclose.js';
import { proveRubricInputs } from '../src/source.js';
import { stepFileRel, parseStepFile, flattenStep, rubricStepShapeReds, gradeStep, sha256Of } from '../src/rubricstep.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'rubric-step-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };

/** the real CHANGELOG, in a scratch dir, frozen by the real door; returns the tree and its seed */
async function freeze() {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const into = join(tmp(), 'seed');
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('unreachable');
  return { tree: r.prep.tree, seed: r.prep.manifest.seed, into, text: readFileSync(file, 'utf8') };
}

const stage = (parts, step = 1, name = 'line-1') => ({ name, kind: 'rubric-step', params: { step, parts } });
const ctxOf = (f) => ({ workdir: f.tree, seedRef: f.seed, gapKeep: '' });
const writeStep = (f, n, body) => {
  mkdirSync(join(f.tree, 'output', 'steps'), { recursive: true });
  writeFileSync(join(f.tree, stepFileRel(n)), typeof body === 'string' ? body : JSON.stringify(body));
};
/** a real line of the real CHANGELOG, trimmed, containing a number */
const realQuote = (text) => text.split('\n').find((l) => /\d/.test(l) && l.length > 40 && !l.startsWith('#')).trim().slice(0, 120);
const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

test('the executor and the catalogue agree on the live kinds, rubric-step included', () => {
  assert.ok(LIVE_KINDS.includes('rubric-step'));
  assert.deepEqual([...LIVE_KINDS].sort(), [...CATALOGUE_LIVE_KINDS].sort());
});

test('at the seed the step file does not exist: a RED naming the line and the file (the close has work to do), exit 1, judged', async () => {
  const f = await freeze();
  const r = await runStage(stage([]), ctxOf(f));
  assert.equal(r.verdict, 'red');
  assert.equal(r.exitCode, EXIT_RED);
  assert.equal(r.judged, true);
  assert.deepEqual(r.gapLines, ['line-1: line 1: output/steps/1.json does not exist']);
});

test('a step file cut off mid-write is red "not valid JSON"; an array or a bare string is red "not a JSON object"; neither is a stop', async () => {
  const f = await freeze();
  writeStep(f, 1, '{"text": "a summary that was cut o');
  let r = await runStage(stage([]), ctxOf(f));
  assert.equal(r.verdict, 'red');
  assert.match(r.gapLines[0], /is not valid JSON \(was it cut off\?\)/);
  writeStep(f, 1, '["text"]');
  r = await runStage(stage([]), ctxOf(f));
  assert.match(r.gapLines[0], /is not a JSON object/);
  writeStep(f, 1, '{}');
  r = await runStage(stage([]), ctxOf(f));
  assert.equal(r.verdict, 'red', 'an empty object is the foundational `happened` red');
  assert.equal(r.exitCode, EXIT_RED);
});

test('a complete step file with text and no countable part is GREEN; "text" empty or absent is red', async () => {
  const f = await freeze();
  writeStep(f, 1, { text: 'Two features landed and one fix.', cites: {} });
  const g = await runStage(stage([]), ctxOf(f));
  assert.equal(g.verdict, 'green');
  assert.equal(g.exitCode, EXIT_GREEN);
  writeStep(f, 1, { text: '   ', cites: {} });
  assert.match((await runStage(stage([]), ctxOf(f))).gapLines[0], /"text" is missing or empty/);
  writeStep(f, 1, { cites: {} });
  assert.match((await runStage(stage([]), ctxOf(f))).gapLines[0], /"text" is missing or empty/);
});

test('countable limits read the step\'s text: maxWords / minWords / maxLines / sections / sectionWords each red with bareguard\'s own measured number, green at the limit', async () => {
  const f = await freeze();
  const parts = [
    { text: 'under 50 words', class: 'countable', check: 'maxWords', value: 50 },
    { text: 'at least 10 words', class: 'countable', check: 'minWords', value: 10 },
    { text: 'at most 3 lines', class: 'countable', check: 'maxLines', value: 3 },
  ];
  writeStep(f, 1, { text: words(50), cites: {} });
  assert.equal((await runStage(stage(parts), ctxOf(f))).verdict, 'green', 'exactly at the limit is within it');
  writeStep(f, 1, { text: words(51), cites: {} });
  assert.deepEqual((await runStage(stage(parts), ctxOf(f))).gapLines, ['line-1: line 1: "text" has 51 words, at most 50 are allowed']);
  writeStep(f, 1, { text: words(4), cites: {} });
  assert.deepEqual((await runStage(stage(parts), ctxOf(f))).gapLines, ['line-1: line 1: "text" has 4 words, at least 10 are required']);
  writeStep(f, 1, { text: `${words(12)}\n${words(2)}\n${words(2)}\n${words(2)}`, cites: {} });
  assert.deepEqual((await runStage(stage(parts), ctxOf(f))).gapLines, ['line-1: line 1: "text" has 4 lines, at most 3 are allowed']);

  const sec = [{ text: 'Added and Fixed sections', class: 'countable', check: 'sections', names: ['Added', 'Fixed'] }];
  writeStep(f, 1, { text: '## Added\nx\n## Fixed\ny', cites: {} });
  assert.equal((await runStage(stage(sec), ctxOf(f))).verdict, 'green');
  writeStep(f, 1, { text: '## Added\nx', cites: {} });
  assert.deepEqual((await runStage(stage(sec), ctxOf(f))).gapLines, ['line-1: line 1: "text" is missing section(s): Fixed']);

  const sw = [{ text: 'about 10 words per section', class: 'countable', check: 'sectionWords', names: ['Added'], wordsPerSection: 10 }];
  writeStep(f, 1, { text: `## Added\n${words(30)}`, cites: {} });
  const red = await runStage(stage(sw), ctxOf(f));
  assert.equal(red.verdict, 'red');
  assert.match(red.gapLines[0], /Added: \d+ words, about 10 asked \(8-12\)/);
});

test('cited: real quotes from the real input pass; a quote that is not in the input, a number the quote lacks, no cites, and an empty list are each red', async () => {
  const f = await freeze();
  const cited = [{ text: 'back every claim with a quote from the changelog', class: 'countable', check: 'cited', source: 'Changelog' }];
  const q = realQuote(f.text);
  writeStep(f, 1, { text: 'Summary.', cites: { Changelog: [{ claim: 'the changelog format and versioning rules', quote: q }] } });
  assert.equal((await runStage(stage(cited), ctxOf(f))).verdict, 'green');
  // spacing and ** marks do not matter (bareguard's format-blind containment)
  writeStep(f, 1, { text: 'Summary.', cites: { Changelog: [{ claim: 'the changelog format and versioning rules', quote: `  **${q.replace(/ /g, '  ')}**  ` }] } });
  assert.equal((await runStage(stage(cited), ctxOf(f))).verdict, 'green');

  // a number in the claim passes when the quote carries it (a standalone integer from a real line of the file)
  const numLine = f.text.split('\n').find((l) => / \d{2,} /.test(l) && l.length < 400);
  const n = / (\d{2,}) /.exec(numLine)[1];
  writeStep(f, 1, { text: 'Summary.', cites: { Changelog: [{ claim: `the file mentions ${n}`, quote: numLine.trim().slice(numLine.trim().indexOf(` ${n} `) - 10 < 0 ? 0 : numLine.trim().indexOf(` ${n} `) - 10, numLine.trim().indexOf(` ${n} `) + n.length + 10) }] } });
  assert.equal((await runStage(stage(cited), ctxOf(f))).verdict, 'green', 'a claim number that the quote carries is accepted');

  writeStep(f, 1, { text: 'Summary.', cites: { Changelog: [{ claim: 'invented', quote: 'this sentence is nowhere in the changelog at all' }] } });
  let r = await runStage(stage(cited), ctxOf(f));
  assert.equal(r.verdict, 'red');
  assert.match(r.gapLines[0], /1 of 1 quotes under "Changelog" are not found word for word/);
  assert.match(r.gapLines[0], /#0:quote-not-found/);

  writeStep(f, 1, { text: 'Summary.', cites: { Changelog: [{ claim: 'involves 99999', quote: q }] } });
  r = await runStage(stage(cited), ctxOf(f));
  assert.match(r.gapLines[0], /#0:numbers:99999/);

  writeStep(f, 1, { text: 'Summary.', cites: {} });
  assert.match((await runStage(stage(cited), ctxOf(f))).gapLines[0], /"cites" has nothing under "Changelog"/);
  writeStep(f, 1, { text: 'Summary.', cites: { Changelog: [] } });
  assert.match((await runStage(stage(cited), ctxOf(f))).gapLines[0], /"cites\.Changelog" is empty/);
  // a different label's quotes do not satisfy this one
  writeStep(f, 1, { text: 'Summary.', cites: { Other: [{ claim: 'x', quote: q }] } });
  assert.match((await runStage(stage(cited), ctxOf(f))).gapLines[0], /has nothing under "Changelog"/);
});

test('an input that no longer matches the bytes frozen at the door is a STOP (97), never a red or a green', async () => {
  const f = await freeze();
  const cited = [{ text: 'quote the changelog', class: 'countable', check: 'cited', source: 'Changelog' }];
  const q = realQuote(f.text);
  writeStep(f, 1, { text: 'Summary.', cites: { Changelog: [{ claim: 'x', quote: q }] } });
  assert.equal((await runStage(stage(cited), ctxOf(f))).verdict, 'green');
  appendFileSync(join(f.tree, 'input', 'CHANGELOG.md'), '\nsneaked in after the freeze\n');
  const r = await runStage(stage(cited), ctxOf(f));
  assert.equal(r.verdict, 'instrument-stop');
  assert.equal(r.exitCode, EXIT_STOP);
  assert.equal(r.judged, false);
  assert.match(r.gapLines[0], /no longer matches the bytes frozen at the source door/);
});

test('instrument stops: no source record, a cited label the record does not have, a step file over the size the rubric reads', async () => {
  const f = await freeze();
  const cited = [{ text: 'quote it', class: 'countable', check: 'cited', source: 'Nope' }];
  writeStep(f, 1, { text: 'x', cites: { Nope: [{ claim: 'a', quote: 'b' }] } });
  let r = await runStage(stage(cited), ctxOf(f));
  assert.equal(r.exitCode, EXIT_STOP);
  assert.match(r.gapLines[0], /source record has no input with that label/);
  const g = await freeze();
  rmSync(join(g.into, 'source.json'));
  r = await runStage(stage([]), ctxOf(g));
  assert.equal(r.exitCode, EXIT_STOP);
  assert.match(r.gapLines[0], /source record .* could not be read/);
  const h = await freeze();
  writeStep(h, 1, JSON.stringify({ text: 'x'.repeat(5 * 1024 * 1024 + 10) }));
  r = await runStage(stage([]), ctxOf(h));
  assert.equal(r.exitCode, EXIT_STOP);
  assert.match(r.gapLines[0], /over the 5242880 byte limit/);
});

test('a rubric the primitive cannot build or run is a STOP, never a verdict: a hand-edited stage with a bad limit, and a cited input that does not match its recorded sha', async () => {
  const f = await freeze();
  writeStep(f, 1, { text: 'x', cites: {} });
  // validators refuse this shape at drafting; the executor must still stop rather than guess if one reaches it
  const r = await runStage(stage([{ text: 'x', class: 'countable', check: 'maxWords', value: 'many' }]), ctxOf(f));
  assert.equal(r.verdict, 'instrument-stop');
  assert.equal(r.exitCode, EXIT_STOP);
  assert.equal(r.detail.fault, 'crashed');
  assert.match(r.gapLines[0], /the rubric stopped: the rubric for job line 1 could not be built/);
  // bareguard's own sha check, reached through gradeStep (the runner's pre-check normally answers first)
  const g = await gradeStep({
    params: { step: 1, parts: [{ text: 'q', class: 'countable', check: 'cited', source: 'Changelog' }] },
    bytes: JSON.stringify({ text: 'x', cites: { Changelog: [{ claim: 'c', quote: 'q' }] } }), outputBytes: null, inputs: { Changelog: f.text },
  }, { Changelog: sha256Of('not the changelog') });
  assert.equal(g.verdict, 'stopped');
  assert.match(g.fault ?? '', /does not match its signed sha256/);
});

test('a step file that is a symlink is red "not a regular file" — never followed', async () => {
  const f = await freeze();
  mkdirSync(join(f.tree, 'output', 'steps'), { recursive: true });
  const outside = join(tmp(), 'secret.json');
  writeFileSync(outside, JSON.stringify({ text: 'from outside the tree' }));
  symlinkSync(outside, join(f.tree, stepFileRel(1)));
  const r = await runStage(stage([]), ctxOf(f));
  assert.equal(r.verdict, 'red');
  assert.match(r.gapLines[0], /is not a regular file/);
});

test('through the declared close: a text-language closeDecl validates, the staged close goes red at the seed then green once the file is written, and seedRead keeps the stage as work', async () => {
  const f = await freeze();
  const decl = {
    genre: 'TYPES', lang: RUBRIC_LANG,
    stages: [
      { name: 'changed-from-seed', fromLine: undefined, kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } },
      { name: 'line-1', fromLine: [1], kind: 'rubric-step', params: { step: 1, parts: [{ text: 'under 20 words', class: 'countable', check: 'maxWords', value: 20 }] } },
    ],
  };
  delete decl.stages[0].fromLine;
  const v = validateCloseDecl(decl, { listing: ['input/CHANGELOG.md', 'output/.gitkeep'], verdictType: 'soft-green', writeScope: ['output/'], jobLines: [{ n: 1 }] });
  assert.equal(v.ok, true, JSON.stringify(v.reds));
  // a CODE-language close may not use it
  const code = validateCloseDecl({ ...decl, lang: 'js' }, { listing: ['src/a.js'], verdictType: 'soft-green', writeScope: ['src/'], jobLines: [{ n: 1 }] });
  assert.equal(code.ok, false);
  assert.ok(code.reds.some((x) => x.code === 'unknown-kind' && /rubric-step/.test(x.detail)), JSON.stringify(code.reds));

  const stages = declaredStages(decl);
  const rows = await seedRead(decl, { workdir: f.tree, seedRef: f.seed, gapKeep: '' });
  assert.deepEqual(rows.map((r) => [r.stage, r.verdict]), [['changed-from-seed', 'red'], ['line-1', 'red']]);
  writeStep(f, 1, { text: 'short answer', cites: {} });
  const closed = await runDeclaredStages(stages, (x) => x, { cwd: f.tree, seedRef: f.seed });
  assert.equal(closed.verdict, 'satisfied', JSON.stringify(closed));
  writeStep(f, 1, { text: words(30), cites: {} });
  const red = await runDeclaredStages(stages, (x) => x, { cwd: f.tree, seedRef: f.seed });
  assert.notEqual(red.verdict, 'satisfied');
  assert.equal(red.stage, 'line-1');
  assert.match(red.gap, /"text" has 30 words, at most 20 are allowed/);
});

test('parseStepFile / flattenStep: only "text" and "cites.<label>" are read; any other key is ignored', () => {
  assert.deepEqual(parseStepFile(null), { obj: null, why: 'missing' });
  assert.equal(parseStepFile('{"a":').why, 'not-json');
  assert.equal(parseStepFile('[]').why, 'not-object');
  assert.equal(parseStepFile('"s"').why, 'not-object');
  assert.deepEqual(flattenStep({ text: 't', cites: { A: [1], B: [2] }, extra: 'ignored' }), { text: 't', 'cites:A': [1], 'cites:B': [2] });
});

test('rubricStepShapeReds: a part carries only the fields its class and check name; every other shape is a named red', () => {
  const ok = [{ text: 'a', class: 'countable', check: 'maxWords', value: 5 }, { text: 'b', class: 'judged' }, { text: 'c', class: 'none' }, { text: 'd', class: 'guard', domains: ['example.com'] }];
  assert.deepEqual(rubricStepShapeReds({ step: 1, parts: ok }, 'p'), []);
  const bad = (p) => rubricStepShapeReds(p, 'p').map((r) => r.path);
  assert.deepEqual(bad({ step: 0, parts: [] }), ['p.step']);
  assert.deepEqual(bad({ step: 1 }), ['p.parts']);
  assert.deepEqual(bad({ step: 1, parts: [{ text: 'x', class: 'countable', check: 'maxWords' }] }), ['p.parts[0].value']);
  assert.deepEqual(bad({ step: 1, parts: [{ text: 'x', class: 'countable', check: 'regex' }] }), ['p.parts[0].check']);
  assert.deepEqual(bad({ step: 1, parts: [{ text: 'x', class: 'maybe' }] }), ['p.parts[0].class']);
  assert.deepEqual(bad({ step: 1, parts: [{ class: 'none' }] }), ['p.parts[0].text']);
  assert.deepEqual(bad({ step: 1, parts: [{ text: 'x', class: 'none', pattern: '(a+)+' }] }), ['p.parts[0].pattern']);
  assert.deepEqual(bad({ step: 1, parts: [{ text: 'x', class: 'guard' }] }), ['p.parts[0].domains']);
});

// ── the trend number (ruling 2A) ─────────────────────────────────────────────

test('a red rubric-step stage emits its red count through the declared close as the {stage,value} the governor reads: failing claims (bareguard\'s measured) plus 1 per other failing check', async () => {
  const { closeGrade } = await import('../src/declaredclose.js');
  const f = await freeze();
  const parts = [
    count1('maxWords', 'under 10 words', { value: 10 }),
    { text: 'quote the changelog', class: 'countable', check: 'cited', source: 'Changelog' },
  ];
  const q = realQuote(f.text);
  const decl = { stages: [stage(parts)] };
  const stages = declaredStages(decl);
  const run = async (body) => { writeStep(f, 1, body); return runDeclaredStages(stages, (x) => x, { cwd: f.tree, seedRef: f.seed }); };
  // 3 reds: too many words (1) + two unsupported quotes (2)
  const three = await run({ text: words(30), cites: { Changelog: [{ claim: 'a', quote: 'nowhere one' }, { claim: 'b', quote: 'nowhere two' }, { claim: 'c', quote: q }] } });
  assert.equal(three.verdict, 'needs_revision');
  assert.deepEqual(closeGrade(three), { gap: three.gap, stage: 'line-1', value: 3 });
  // 1 red: within words, one unsupported quote
  const one = await run({ text: words(5), cites: { Changelog: [{ claim: 'a', quote: 'nowhere one' }, { claim: 'c', quote: q }] } });
  assert.equal(closeGrade(one).value, 1);
  // a missing file is one red; the foundational check counts as one
  writeStep(f, 1, '{"text": "cut o');
  assert.equal(closeGrade(await runDeclaredStages(stages, (x) => x, { cwd: f.tree, seedRef: f.seed })).value, 1);
  // green donates nothing to compare (no red)
  const green = await run({ text: words(5), cites: { Changelog: [{ claim: 'c', quote: q }] } });
  assert.equal(green.verdict, 'satisfied');
});

test('the governor reads 3 reds then 1 red as IMPROVING (converging), and 1 then 3 is not', async () => {
  const { createTrend } = await import('../src/trend.js');
  const { closeGrade } = await import('../src/declaredclose.js');
  const f = await freeze();
  const stages = declaredStages({ stages: [stage([count1('maxWords', 'under 10 words', { value: 10 }), { text: 'q', class: 'countable', check: 'cited', source: 'Changelog' }])] });
  const q = realQuote(f.text);
  const grade = async (body) => { writeStep(f, 1, body); return closeGrade(await runDeclaredStages(stages, (x) => x, { cwd: f.tree, seedRef: f.seed })); };
  const threeBody = { text: words(30), cites: { Changelog: [{ claim: 'a', quote: 'nowhere one' }, { claim: 'b', quote: 'nowhere two' }] } };
  const oneBody = { text: words(5), cites: { Changelog: [{ claim: 'a', quote: 'nowhere one' }, { claim: 'c', quote: q }] } };
  const down = createTrend({ stageOrder: ['line-1'] });
  down.record(await grade(threeBody));
  down.record(await grade(oneBody));
  assert.equal(down.verdict().trend, 'converging', JSON.stringify(down.verdict()));
  const up = createTrend({ stageOrder: ['line-1'] });
  up.record(await grade(oneBody));
  up.record(await grade(threeBody));
  assert.notEqual(up.verdict().trend, 'converging', JSON.stringify(up.verdict()));
});
const count1 = (check, text, rest) => ({ text, class: 'countable', check, ...rest });
