// PART 1b item 4 — the PROSE step after a fact step (the check block's `$ numbers` default, `gradeStep`, `proseNotChecked`; withFactBindings, which tied an AI-written declaration, is deleted):
// words are free, size is counted, and EVERY NUMBER in the text must be in a quote an earlier fact line already had checked
// (bareguard's `numbersInQuote`). The card says "what the text says" is not checked. Real data: this repo's CHANGELOG.md frozen by
// the real source door; the facts are its real release headings. No model is involved.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runStage, EXIT_STOP } from '../src/kinds.js';
import { proveRubricInputs } from '../src/source.js';
import { stepFileRel, checkRubricParts, cardOfClose, checksOfClose, proseNotChecked } from '../src/rubricstep.js';
import { CheckBlock } from '../src/checkblock.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'rubric-prose-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };

async function freeze() {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('unreachable');
  return { tree: r.prep.tree, seed: r.prep.manifest.seed, text: readFileSync(file, 'utf8') };
}
const ctxOf = (f) => ({ workdir: f.tree, seedRef: f.seed, gapKeep: '' });
const writeStep = (f, n, body) => {
  mkdirSync(join(f.tree, 'output', 'steps'), { recursive: true });
  writeFileSync(join(f.tree, stepFileRel(n)), typeof body === 'string' ? body : JSON.stringify(body));
};
const releases = (text) => text.split('\n').map((l) => /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/.exec(l)).filter(Boolean).map((m) => ({ quote: m[0], version: m[1], date: m[2] }));

const factPart = () => ({
  text: 'list the last 3 releases', class: 'fact', source: 'Changelog',
  facts: [{ name: 'version', shape: 'text', anchor: '## [', until: ']' }, { name: 'released', shape: 'date' }], count: { min: 3, max: 3 },
});
const factStage = { name: 'line-1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [factPart()] } };
const proseStage = (parts = []) => ({ name: 'line-2', kind: 'rubric-step', fromLine: [2], params: { step: 2, parts } });
const tie = { text: 'every number in the text is in a quote checked on line 1', class: 'countable', check: 'numbersFromFacts', from: [1] };

/** the block of a two-line job: line 1 finds facts (a look fact), line 2 is text; code ties line 2\'s numbers to the fact lines BEFORE it */
const blockOf = (/** @type {{n: number, text: string}[]} */ lines, /** @type {any[]} */ facts) => {
  const b = new CheckBlock({ texts: { Changelog: '### Fixed\n### Added\n### Changed\n' }, labels: ['Changelog'], asks: false });
  b.fromJob(lines.map((l) => ({ ...l, rules: [] })));
  b.addLook(facts, []);
  return b;
};
const heading = (/** @type {number} */ line, /** @type {string} */ name, /** @type {string} */ w) => ({ line, name, shape: 'phrase', source: 'Changelog', words: [w] });

test('the numbers tie ($ numbers row): code ties every prose line to the fact lines BEFORE it; with no fact line before it nothing is added; the AI never writes it', () => {
  const b = blockOf([{ n: 1, text: 'find' }, { n: 2, text: 'summarise' }, { n: 3, text: 'find more' }, { n: 4, text: 'summarise again' }], [heading(1, 'fixed', '### Fixed'), heading(3, 'added', '### Added')]);
  const c = b.reconcile();
  const tieOf = (/** @type {number} */ n) => c.stages.find((/** @type {any} */ st) => st.params.step === n)?.params.parts.find((/** @type {any} */ p) => p.check === 'numbersFromFacts');
  assert.deepEqual(tieOf(2).from, [1]);
  assert.deepEqual(tieOf(4).from, [1, 3]);
  assert.equal(tieOf(1), undefined);
  assert.equal(tieOf(3), undefined, 'a fact line has no text to tie');
  // a prose line BEFORE the fact line has nothing to tie to
  const first = blockOf([{ n: 1, text: 'summarise' }, { n: 2, text: 'find' }], [heading(2, 'fixed', '### Fixed')]).reconcile();
  assert.equal(first.stages.find((/** @type {any} */ st) => st.params.step === 1)?.params.parts.some((/** @type {any} */ p) => p.check === 'numbersFromFacts'), false);
  // every part is code\'s: no part of origin other than code reaches the close
  assert.ok(c.map.every((/** @type {any} */ m) => m.origin === 'code'));
});

test('a prose step\'s numbers must be in the checked quotes: numbers from the real headings pass, a number nobody quoted is red and named', async () => {
  const f = await freeze();
  const rel = releases(f.text).slice(0, 3);
  writeStep(f, 1, { results: rel.map((r) => ({ quote: r.quote, values: { version: r.version, released: r.date } })) });
  const stage = proseStage([tie]);

  writeStep(f, 2, { text: `Releases ${rel.map((r) => r.version).join(', ')} shipped; the newest on ${rel[0].date}.` });
  let r = await runStage(stage, ctxOf(f));
  assert.deepEqual(r.gapLines, []);
  assert.equal(r.verdict, 'green');

  writeStep(f, 2, { text: `Three releases shipped, the newest ${rel[0].version}.` });
  assert.equal((await runStage(stage, ctxOf(f))).verdict, 'green', 'words are free: "Three" is not a number token');

  writeStep(f, 2, { text: `3 releases shipped: ${rel[0].version} and a surprise 99999.` });
  r = await runStage(stage, ctxOf(f));
  assert.equal(r.verdict, 'red');
  const said = r.gapLines.join('\n');
  assert.match(said, /line 2: "text" has number\(s\) 3, 99999 that no checked quote of line 1 holds/);
  assert.equal(r.detail.redCount >= 2, true);
});

test('without an earlier fact step a prose step has no number tie (Part 1a behaviour is unchanged); an unreadable fact file is a STOP, not a red', async () => {
  const f = await freeze();
  writeStep(f, 2, { text: 'Seven things happened in 1999.' });
  assert.equal((await runStage(proseStage([]), ctxOf(f))).verdict, 'green');
  const rel = releases(f.text).slice(0, 3);
  // a fact file that is there but is not JSON stays an instrument fault (it ran green before this stage, so it should parse)
  writeStep(f, 1, '{ not json');
  const r = await runStage(proseStage([tie]), ctxOf(f));
  assert.equal(r.verdict, 'instrument-stop');
  assert.equal(r.exitCode, EXIT_STOP);
  assert.match(r.gapLines.join(' '), /the checked facts of line 1 .* could not be read for the number tie/);
  assert.ok(rel.length === 3);
});

test('M2: an earlier fact line whose step file is not there yet (the seed read) is a normal red in plain words, never an instrument fault', async () => {
  const f = await freeze();
  // no step files at all (the seed read), and the prose step's own file is missing too
  let r = await runStage(proseStage([tie]), ctxOf(f));
  assert.equal(r.verdict, 'red');
  assert.match(r.gapLines.join('\n'), /line 1's answer is not there yet \(output\/steps\/1\.json\)/);
  assert.ok(r.detail.redCount >= 1);
  // the prose step's own file is there, line 1's still is not: still a red, still not a stop
  writeStep(f, 2, { text: 'Seven things happened in 1999.' });
  r = await runStage(proseStage([tie]), ctxOf(f));
  assert.equal(r.verdict, 'red');
  assert.match(r.gapLines.join('\n'), /line 1's answer is not there yet/);
  // once line 1's file exists the tie works as before
  const rel = releases(f.text).slice(0, 3);
  writeStep(f, 1, { results: rel.map((x) => ({ quote: x.quote, values: {} })) });
  writeStep(f, 2, { text: `Release ${rel[0].version}.` });
  assert.equal((await runStage(proseStage([tie]), ctxOf(f))).verdict, 'green');
});

test('drafting reds: a prose step after a fact line with no tie; a tie to a line that is not a fact line, or comes later', () => {
  const run = (stages) => {
    const out = [];
    checkRubricParts(stages, { inputLabels: ['Changelog'], red: (code) => out.push(code) });
    return out;
  };
  assert.deepEqual(run([factStage, proseStage([tie])]), []);
  assert.deepEqual(run([factStage, proseStage([])]), ['rubric-numbers-unbound']);
  assert.deepEqual(run([proseStage([]), factStage]), [], 'a prose step BEFORE the fact line has nothing to tie to');
  assert.deepEqual(run([proseStage([{ ...tie, from: [1] }]), factStage]), ['rubric-numbers-source']);
  assert.deepEqual(run([factStage, proseStage([{ ...tie, from: [5] }])]), ['rubric-numbers-unbound', 'rubric-numbers-source']);
});

test('the card: "what the text says" is Not checked on every prose step, never on a fact step; the tie is a plan row', () => {
  const decl = { stages: blockOf([{ n: 1, text: 'find' }, { n: 2, text: 'summarise' }], [heading(1, 'fixed', '### Fixed'), heading(1, 'added', '### Added'), heading(1, 'changed', '### Changed')]).reconcile().stages };
  assert.deepEqual(proseNotChecked(decl), ['line 2: what the text says — you judge it at Accept']);
  const rec = cardOfClose({ closeDecl: { ...decl, notes: ['superlative: the cheapest'] } });
  assert.deepEqual(rec.notChecked, ['superlative: the cheapest', 'line 2: what the text says — you judge it at Accept']);
  assert.ok(checksOfClose(decl).some((c) => c.line === 2 && c.text === 'every number in the text is in a quote checked on line 1'));
  assert.equal(checksOfClose(decl).filter((c) => c.line === 1).length >= 3, true);
});
