// PART 1b item 3 — RECORDS (src/facts.js `splitRecords` / `sampleOf` / `recordWords`, src/rubricstep.js `readFrozenInputs`):
// the drafter names where a record opens (and where the quoted slice ends); CODE splits the input and counts. Real data: a
// copy of this repo's CHANGELOG.md (460 KB, 45+ release records) frozen by the real source door. No model is involved except a
// scripted boundary that can only deliver a declaration.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, copyFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitRecords, sampleOf, recordWords, factRows, SAMPLE_CHARS } from '../src/facts.js';
import { readFrozenInputs } from '../src/rubricstep.js';
import { proveRubricInputs } from '../src/source.js';
import { authorClose, DECLARATION_TOOL_NAME, GREEN_QUESTIONS } from '../src/authorflow.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { buildSeedListing } from '../src/authorscout.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'rubric-records-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const real = readFileSync(join(HERE, '..', 'CHANGELOG.md'), 'utf8');
const headings = real.split('\n').filter((l) => l.startsWith('## ['));

async function freeze() {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('unreachable');
  return { file, prep: r.prep };
}

test('splitRecords: code counts the real records — one per release heading — and the slice stops where the drafter said', () => {
  const all = splitRecords(real, { start: '## [' });
  assert.equal(all.length, headings.length, 'one record per "## [" in the file');
  assert.ok(all.length > 20);
  assert.ok(all[0].text.startsWith('## [Unreleased]'));
  assert.ok(all.every((r) => r.endFound), 'with no end marker the whole span is the record');
  // a record runs to where the next one opens: the records tile the text from the first marker to the end
  assert.equal(all.map((r) => r.text).join(''), real.slice(all[0].start));

  const lines = splitRecords(real, { start: '## [', end: '\n' });
  assert.equal(lines.length, headings.length);
  assert.deepEqual(lines.map((r) => r.text), headings, 'the quoted slice is exactly the heading line, cut before the newline');
  assert.ok(lines.every((r) => r.endFound));
});

test('splitRecords: an end marker that never follows a record says so; a start that is not in the text finds zero records', () => {
  const some = splitRecords(real, { start: '## [', end: 'a marker that is nowhere in this changelog' });
  assert.equal(some.length, headings.length);
  assert.ok(some.every((r) => !r.endFound));
  assert.equal(some[1].text, real.slice(some[1].start, some[2].start), 'whole span kept');
  assert.deepEqual(splitRecords(real, { start: 'Flight details' }), []);
  assert.deepEqual(splitRecords('', { start: 'x' }), []);
  // the end must come AFTER the start: an end that only occurs inside the start words is not found
  assert.equal(splitRecords('AB AB AB', { start: 'AB' }).length, 3);
});

test('sampleOf: a small input is shown whole; the real 460 KB changelog is cut at a line end and the cut is said, never silent', () => {
  assert.deepEqual(sampleOf('short\ntext'), { text: 'short\ntext', cut: false, shown: 10, total: 10, note: null });
  const s = sampleOf(real);
  assert.equal(real.length > SAMPLE_CHARS, true);
  assert.equal(s.cut, true);
  assert.equal(s.total, real.length);
  assert.ok(s.shown <= SAMPLE_CHARS);
  assert.equal(s.text, real.slice(0, s.shown));
  assert.equal(real[s.shown], '\n', 'cut at a line end');
  assert.match(String(s.note), new RegExp(`^the first ${s.shown} of ${real.length} characters, cut at a line end; every check is tested on the whole input$`));
  assert.equal(sampleOf(real, 100).shown <= 100, true);
});

test('recordWords and the plan-card row say the record in the person\'s terms', () => {
  assert.equal(recordWords({ start: 'Departure time:', end: 'Flight details' }), 'from the words "Departure time:" up to (not including) "Flight details"');
  assert.equal(recordWords({ start: '## [' }), 'from the words "## [" up to where the next record opens');
  const rows = factRows({ source: 'Flights', record: { start: 'Departure time:', end: 'Flight details' }, facts: [{ name: 'stops', shape: 'phrase', phrase: 'Nonstop' }] });
  assert.deepEqual(rows, [
    'fact · stops — phrase, must say "Nonstop", quoted from "Flights"',
    'fact · records — each begins at "Departure time:" and is quoted up to "Flight details", in "Flights"',
  ]);
});

test('readFrozenInputs reads the frozen text the door recorded; a changed file, an unknown label and a missing record are each a plain "not ok"', async () => {
  const { prep } = await freeze();
  const ok = await readFrozenInputs(prep.tree, ['Changelog']);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.texts.Changelog, real);
  const unknown = await readFrozenInputs(prep.tree, ['Nope']);
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.match(unknown.why, /no input labelled "Nope"/);
  const none = await readFrozenInputs(join(tmp(), 'tree'), ['Changelog']);
  assert.equal(none.ok, false);
  appendFileSync(join(prep.tree, 'input', 'CHANGELOG.md'), '\nedited after the freeze\n');
  const edited = await readFrozenInputs(prep.tree, ['Changelog']);
  assert.equal(edited.ok, false);
  if (!edited.ok) assert.match(edited.why, /no longer matches the bytes frozen/);
});

test('the drafter reads the input: authorClose puts the (cut, said-so) sample of each frozen input in the composer prompt', async () => {
  const { prep, file } = await freeze();
  /** @type {any[]} */
  const seen = [];
  const generate = async (messages, tools) => {
    seen.push(messages);
    await tools.find((t) => t.name === DECLARATION_TOOL_NAME).execute({
      stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }],
      refused: [{ line: 1, reason: 'fixture' }],
    });
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: '1. List the last 3 releases' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }] }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines: [{ n: 1, text: 'List the last 3 releases', rule: '' }], inputs: [{ n: 1, label: 'Changelog', value: file }],
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  const prompt = seen[0][0].content;
  const s = sampleOf(real);
  assert.match(prompt, /THE INPUTS, AS THE WORKER WILL SEE THEM/);
  assert.ok(prompt.includes(`INPUT "Changelog" — you are shown ${s.note}`));
  assert.ok(prompt.includes(s.text), 'the sample itself is in the prompt');
  assert.equal(prompt.includes(real.slice(s.shown + 2000, s.shown + 2100)), false, 'and nothing past the cut');
});

test('A3: a refused try hands its declaration to onPhase (the panel writes it beside try-refused); declarationRecord masks secrets and bounds it', async () => {
  const { prep, file } = await freeze();
  const { declarationRecord } = await import('../src/authorreadout.js');
  const bad = { stages: [{ name: 'no-such', kind: 'no-such-kind-at-all', params: {} }], refused: [{ line: 1, reason: 'fixture' }] };
  const generate = async (messages, tools) => {
    await tools.find((t) => t.name === DECLARATION_TOOL_NAME).execute(bad);
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  /** @type {any[]} */
  const failed = [];
  await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: '1. List the last 3 releases' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }] }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines: [{ n: 1, text: 'List the last 3 releases', rule: '' }], inputs: [{ n: 1, label: 'Changelog', value: file }],
    onPhase: (name, data) => { if (name === 'author-try-failed') failed.push(data); },
  });
  assert.ok(failed.length >= 1, 'a refused try was reported');
  assert.deepEqual(failed[0].declaration.stages, bad.stages, 'the refused declaration itself rides the phase');
  assert.deepEqual(declarationRecord(failed[0].declaration), { declaration: JSON.parse(JSON.stringify(failed[0].declaration)) });
  // secrets masked, a huge one cut and said so, nothing => nothing
  const key = `sk-${'a1B2c3D4'.repeat(4)}`;
  const masked = JSON.stringify(declarationRecord({ stages: [{ name: 'x', note: `token ${key} here` }] }));
  assert.equal(masked.includes(key), false);
  assert.match(masked, /token .* here/);
  const huge = declarationRecord({ blob: 'z'.repeat(70000) });
  assert.equal(huge.declarationCut, true);
  assert.ok(huge.declarationText.length <= 60000);
  assert.deepEqual(declarationRecord(undefined), {});
});
