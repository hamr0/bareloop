// PART 1b item 2 — the FACT step (src/facts.js, src/rubricstep.js): a job line's step file holds only filled facts, and one
// bareguard `cited` + `decides` check grades them. Real data: a copy of this repo's CHANGELOG.md frozen by the real source door;
// the quotes are the heading lines CUT FROM THAT FILE. Real bareguard 0.23 grades. No model is involved.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runStage, EXIT_RED, EXIT_GREEN } from '../src/kinds.js';
import { proveRubricInputs } from '../src/source.js';
import { stepFileRel, rubricStepShapeReds, checksOfClose, planMatchesClose, flattenStep } from '../src/rubricstep.js';
import { factClaims, factRows } from '../src/facts.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'rubric-facts-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };

async function freeze() {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const into = join(tmp(), 'seed');
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('unreachable');
  return { tree: r.prep.tree, seed: r.prep.manifest.seed, text: readFileSync(file, 'utf8') };
}
const ctxOf = (f) => ({ workdir: f.tree, seedRef: f.seed, gapKeep: '' });
const writeStep = (f, n, body) => {
  mkdirSync(join(f.tree, 'output', 'steps'), { recursive: true });
  writeFileSync(join(f.tree, stepFileRel(n)), typeof body === 'string' ? body : JSON.stringify(body));
};
/** the real release headings, newest first: [{quote, version, date}] */
const releases = (text) => text.split('\n').map((l) => /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/.exec(l)).filter(Boolean)
  .map((m) => ({ quote: m[0], version: m[1], date: m[2] }));

/** n real releases whose dates AND versions are pairwise different (same-day releases would make a swapped date not wrong) */
const distinctReleases = (text, n = 3) => {
  const out = [];
  for (const r of releases(text)) if (!out.some((o) => o.date === r.date || o.version === r.version)) out.push(r);
  assert.ok(out.length >= n, `need ${n} releases with pairwise-different dates in CHANGELOG.md, found ${out.length}`);
  return out.slice(0, n);
};

const factPart = (over = {}) => ({
  text: 'list the last 3 releases with their dates', class: 'fact', source: 'Changelog',
  facts: [
    { name: 'version', shape: 'text', anchor: '## [', until: ']' },
    { name: 'released', shape: 'date', rule: { op: 'gte', value: '2026-01-01' } },
  ],
  count: { min: 3, max: 3 },
  ...over,
});
const stage = (parts) => ({ name: 'line-1', kind: 'rubric-step', params: { step: 1, parts } });
const result = (r) => ({ quote: r.quote, values: { version: r.version, released: r.date } });

test('a fact step of real changelog headings is GREEN; the claim text is built by code, the worker writes none', async () => {
  const f = await freeze();
  const rel = releases(f.text).slice(0, 3);
  assert.equal(rel.length, 3);
  writeStep(f, 1, { results: rel.map(result) });
  const r = await runStage(stage([factPart()]), ctxOf(f));
  assert.deepEqual(r.gapLines, []);
  assert.equal(r.verdict, 'green');
  assert.equal(r.exitCode, EXIT_GREEN);
  const claims = factClaims(factPart(), [result(rel[0])]);
  assert.equal(claims[0].claim, `version: ${rel[0].version}; released: ${rel[0].date}`);
  assert.deepEqual(claims[0].values, { d0: rel[0].version, d1: rel[0].date });
  // a "claim" the worker adds is ignored: the text is code's
  writeStep(f, 1, { results: rel.map((x) => ({ ...result(x), claim: 'a made-up sentence 99999' })) });
  assert.equal((await runStage(stage([factPart()]), ctxOf(f))).verdict, 'green');
});

test('every red names the result and the fact: wrong value, value of another release, a rule broken, a quote not in the file', async () => {
  const f = await freeze();
  const rel = distinctReleases(f.text);
  const run = async (results, part = factPart()) => { writeStep(f, 1, { results }); return runStage(stage([part]), ctxOf(f)); };

  let r = await run(rel.map((x, i) => (i === 1 ? { ...result(x), values: { version: x.version, released: rel[0].date } } : result(x))));
  assert.equal(r.verdict, 'red');
  assert.equal(r.exitCode, EXIT_RED);
  assert.match(r.gapLines.join('\n'), /result 2, fact "released": the value is not what the quote holds/);

  r = await run(rel.map((x, i) => (i === 2 ? { ...result(x), values: { version: rel[0].version, released: x.date } } : result(x))));
  assert.match(r.gapLines.join('\n'), /result 3, fact "version": the value is not what the quote holds/);

  const late = factPart({ facts: [{ name: 'released', shape: 'date', rule: { op: 'gte', value: '2099-01-01' } }] });
  r = await run(rel.map((x) => ({ quote: x.quote, values: { released: x.date } })), late);
  assert.match(r.gapLines.join('\n'), /result 1, fact "released": the value in the quote is below what the rule allows \(at least 2099-01-01\)/);

  r = await run(rel.map((x, i) => (i === 0 ? { ...result(x), quote: x.quote.replace(/\d$/, '7').replace('## [', '## [9') } : result(x))));
  assert.match(r.gapLines.join('\n'), /result 1: the quote is not found word for word in "Changelog"/);
});

test('the count is code\'s: too few results, too many, none, and a missing "values" are each red in plain words', async () => {
  const f = await freeze();
  const rel = releases(f.text);
  writeStep(f, 1, { results: rel.slice(0, 2).map(result) });
  let r = await runStage(stage([factPart()]), ctxOf(f));
  assert.match(r.gapLines.join('\n'), /2 result\(s\) are listed, at least 3 are required/);
  writeStep(f, 1, { results: rel.slice(0, 4).map(result) });
  r = await runStage(stage([factPart()]), ctxOf(f));
  assert.match(r.gapLines.join('\n'), /4 results are listed, at most 3 are allowed/);
  writeStep(f, 1, { results: [] });
  r = await runStage(stage([factPart()]), ctxOf(f));
  assert.match(r.gapLines.join('\n'), /has no results/);
  writeStep(f, 1, { results: rel.slice(0, 3).map((x) => ({ quote: x.quote })) });
  r = await runStage(stage([factPart()]), ctxOf(f));
  assert.match(r.gapLines.join('\n'), /result 1, fact "version": no value was given in "values"/);
});

test('a fact step has no free text: a step file with only "text" is red, and a free-text count on a fact line is a drafting red', async () => {
  const f = await freeze();
  writeStep(f, 1, { text: 'three releases', cites: {} });
  const r = await runStage(stage([factPart()]), ctxOf(f));
  assert.equal(r.verdict, 'red');
  assert.match(r.gapLines.join('\n'), /has no results/);
});

test('the plan card rows come from the signed part: one per fact, then the count; sign == run', () => {
  const part = factPart();
  const rows = factRows(part);
  assert.deepEqual(rows, [
    'fact · version — text, the words after "## [" up to "]", quoted from "Changelog"',
    'fact · released — date, at least 2026-01-01, quoted from "Changelog"',
    'fact · results — exactly 3 results, each quoted from "Changelog"',
  ]);
  const decl = { stages: [stage([{ ...part, covers: [1] }])] };
  const got = checksOfClose(decl);
  assert.deepEqual(got.map((c) => c.text), rows);
  assert.ok(got.every((c) => c.line === 1 && c.covers[0] === 1));
  assert.deepEqual(planMatchesClose(got.map((c) => ({ text: c.text, fromLine: [c.line] })), decl), { ok: true });
  assert.equal(planMatchesClose(got.slice(1).map((c) => ({ text: c.text, fromLine: [c.line] })), decl).ok, false, 'a dropped row is a sign/run mismatch');
});

test('the shape of a fact part: bad shape, op, bound, money unit, phrase with a rule, text with a rule, duplicate name, count are each a red', () => {
  const reds = (p) => rubricStepShapeReds({ step: 1, parts: [p] }, 'x').map((r) => r.path);
  assert.deepEqual(reds(factPart()), []);
  assert.deepEqual(reds(factPart({ facts: [{ name: 'a', shape: 'color' }] })), ['x.parts[0].facts[0].shape']);
  assert.deepEqual(reds(factPart({ facts: [{ name: 'a', shape: 'number', rule: { op: 'eq', value: 3 } }] })), ['x.parts[0].facts[0].rule']);
  assert.deepEqual(reds(factPart({ facts: [{ name: 'a', shape: 'number', rule: { op: 'between', lo: 1 } }] })), ['x.parts[0].facts[0].rule']);
  assert.deepEqual(reds(factPart({ facts: [{ name: 'a', shape: 'money' }] })), ['x.parts[0].facts[0].unit']);
  assert.deepEqual(reds(factPart({ facts: [{ name: 'a', shape: 'money', unit: 'US dollars', rule: { op: 'lte', value: 450 } }] })), []);
  assert.deepEqual(reds(factPart({ facts: [{ name: 'a', shape: 'text', rule: { op: 'lt', value: 3 } }] })), ['x.parts[0].facts[0].rule']);
  assert.deepEqual(reds(factPart({ facts: [{ name: 'a', shape: 'phrase', phrase: 'Nonstop', rule: { op: 'lt', value: 3 } }] })), ['x.parts[0].facts[0].rule']);
  assert.deepEqual(reds(factPart({ facts: [{ name: 'a', shape: 'phrase', phrase: 'Nonstop' }, { name: 'a', shape: 'date' }] })), ['x.parts[0].facts[1].name']);
  assert.deepEqual(reds(factPart({ facts: [{ name: 'top3', shape: 'date' }] })), ['x.parts[0].facts[0].name']);
  assert.deepEqual(reds(factPart({ count: { min: 5, max: 3 } })), ['x.parts[0].count']);
  assert.deepEqual(reds(factPart({ record: { start: 'x' } })), ['x.parts[0].record']);
  assert.deepEqual(reds(factPart({ facts: [{ name: 'a', shape: 'text', until: ']' }] })), ['x.parts[0].facts[0].until']);
});

test('flattenStep with a fact part reads "results", never "text" or "cites"', () => {
  const part = factPart();
  const fields = flattenStep({ results: [{ quote: 'q', values: { version: '1.0.0', released: '2026-01-02' } }], text: 'ignored', cites: { Changelog: [1, 2, 3] } }, [], part);
  assert.equal(fields['claims:Changelog'], 1);
  assert.equal(fields['cites:Changelog'].length, 1);
  assert.equal(fields['cites:Changelog'][0].claim, 'version: 1.0.0; released: 2026-01-02');
});

test('drafting reds for a fact line: free text counted on it, a second fact list, a source that is not an input, and a list bareguard would refuse to sign', async () => {
  const { checkRubricParts } = await import('../src/rubricstep.js');
  const reds = (parts, labels = ['Changelog']) => {
    /** @type {string[]} */
    const out = [];
    checkRubricParts([{ name: 'line-1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts } }], { inputLabels: labels, red: (code) => out.push(code) });
    return out;
  };
  assert.deepEqual(reds([factPart()]), []);
  assert.deepEqual(reds([factPart(), { text: 'under 50 words', class: 'countable', check: 'maxWords', value: 50 }]), ['rubric-fact-text']);
  assert.deepEqual(reds([factPart(), factPart()]), ['rubric-fact-twice', 'rubric-fact-twice']);
  assert.deepEqual(reds([factPart({ source: 'Flights' })]), ['rubric-part-source']);
  // bareguard refuses a bound that is not a date: asked of bareguard itself, not re-implemented here
  assert.deepEqual(reds([factPart({ facts: [{ name: 'released', shape: 'date', rule: { op: 'gte', value: 'last spring' } }] })]), ['rubric-fact-invalid']);
});
