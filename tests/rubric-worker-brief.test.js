// PART 1b item 7 — the WORKER BRIEF for required facts (src/rubricstep.js `stepFileContract` / `lineBriefs` / `rubricGoal`): a facts
// line is told its record, its facts and its count; a text line that follows is told its numbers come from the facts' quotes. The
// brief and the close are tested AGAINST EACH OTHER: a step file written exactly as the brief says must pass the real close, and one
// written the Part 1a way must not. Real data: this repo's CHANGELOG.md frozen by the real source door. No model.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runStage } from '../src/kinds.js';
import { proveRubricInputs } from '../src/source.js';
import { stepFileContract, lineBriefs, rubricGoal, stepFileRel, withFactBindings } from '../src/rubricstep.js';
import { splitRecords, factBrief } from '../src/facts.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'rubric-wbrief-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };

const FACT = {
  text: 'list the last 3 releases', class: 'fact', source: 'Changelog', record: { start: '## [', end: '\n' },
  facts: [{ name: 'version', shape: 'text', anchor: '## [', until: ']' }, { name: 'released', shape: 'date', rule: { op: 'gte', value: '2026-10-01' } },
    { name: 'tag', shape: 'phrase', phrase: 'Unreleased' }],
  count: { min: 3, max: 3 },
};
const FACT_OK = { ...FACT, facts: FACT.facts.slice(0, 2) };
const closeDecl = (fact = FACT) => withFactBindings({
  stages: [
    { name: 'line-1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [fact] } },
    { name: 'line-2', kind: 'rubric-step', fromLine: [2], params: { step: 2, parts: [{ text: 'under 100 words', class: 'countable', check: 'maxWords', value: 100 }] } },
  ],
});
const JOB_LINES = [{ n: 1, text: 'List the last 3 releases', rule: '' }, { n: 2, text: 'Summarize them', rule: 'under 100 words' }];
const FILES = [{ label: 'Changelog', rel: 'input/CHANGELOG.md' }];

test('the contract names both shapes; the goal briefs a facts line by its record, facts and count, and a text line by its number tie', () => {
  assert.match(stepFileContract(), /FACTS line is different: its file holds ONLY \{"results"/);
  assert.match(stepFileContract(), /no "text" and no "cites"/);
  const briefs = lineBriefs(closeDecl());
  assert.deepEqual(briefs.map((b) => b.line), [1, 2]);
  const [facts, text] = briefs.map((b) => b.text);
  assert.match(facts, /^Job line 1 is a FACTS line\. Write output\/steps\/1\.json as \{"results": \[\{"quote": "\.\.\.", "values": \{\.\.\.\}\}\]\} and nothing else — no "text", no "cites"\./);
  assert.match(facts, /One result per record in the input "Changelog": exactly 3 results\. A record's quote is the words from the words "## \[" up to \(not including\) the end of the line\./);
  assert.match(facts, /written exactly as the quote writes it \(for example "9:27 AM", not "09:27"/);
  assert.match(facts, /- version — words, the words right after "## \[" up to "\]"/);
  assert.match(facts, /- released — a date, must be at least 2026-10-01/);
  assert.match(facts, /- tag — no value to write; the quote you copy must say "Unreleased"/);
  assert.match(text, /^Job line 2 is a TEXT line\. Write output\/steps\/2\.json as \{"text": "\.\.\."\}\..*copied exactly as it is written in a quote you wrote for job line 1 — use no other number\.$/);
  const goal = rubricGoal({ jobLines: JOB_LINES, files: FILES, closeDecl: closeDecl() });
  assert.ok(goal.includes(stepFileContract()));
  assert.ok(goal.includes(facts) && goal.includes(text));
  assert.ok(goal.indexOf('The job, line by line') < goal.indexOf('Job line 1 is a FACTS line'));
  // without a close the goal is exactly what Part 1a wrote
  assert.equal(rubricGoal({ jobLines: JOB_LINES, files: FILES }).includes('FACTS line.'), false);
  assert.equal(factBrief({ name: 'price', shape: 'money', unit: 'US dollars', rule: { op: 'lte', value: 450 } }), 'price — an amount in US dollars, must be at most 450 US dollars');
});

test('brief and close agree: a step file written exactly as the brief says passes the real close; one written the Part 1a way does not', async () => {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('unreachable');
  const ctx = { workdir: r.prep.tree, seedRef: r.prep.manifest.seed, gapKeep: '' };
  const write = (n, body) => { mkdirSync(join(ctx.workdir, 'output', 'steps'), { recursive: true }); writeFileSync(join(ctx.workdir, stepFileRel(n)), JSON.stringify(body)); };
  const decl = closeDecl(FACT_OK);

  // a worker that follows the brief: three records, each quote cut exactly as the brief says ("from ## [ to the end of the line")
  const recs = splitRecords(readFileSync(file, 'utf8'), FACT_OK.record).filter((x) => /\] - 2026-10-\d\d$/.test(x.text)).slice(0, 3);
  assert.equal(recs.length, 3);
  const results = recs.map((x) => { const m = /^## \[([^\]]+)\] - (\S+)$/.exec(x.text); return { quote: x.text, values: { version: m[1], released: m[2] } }; });
  write(1, { results });
  let g = await runStage(decl.stages[0], ctx);
  assert.deepEqual(g.gapLines, []);
  assert.equal(g.verdict, 'green');
  // and the text line, copying numbers from those quotes
  write(2, { text: `Releases ${results.map((x) => x.values.version).join(', ')} shipped in October 2026.` });
  g = await runStage(decl.stages[1], ctx);
  assert.deepEqual(g.gapLines, []);
  assert.equal(g.verdict, 'green');

  // a worker that ignores the brief and writes the Part 1a shape on the facts line
  write(1, { text: 'three releases', cites: { Changelog: [{ claim: 'x', quote: recs[0].text }] } });
  g = await runStage(decl.stages[0], ctx);
  assert.equal(g.verdict, 'red');
  assert.match(g.gapLines.join('\n'), /output\/steps\/1\.json has no results — add one result per record/);
  // and a worker that joins two records into one quote is told which result it was
  write(1, { results: [{ quote: `${recs[0].text}\n${recs[1].text}`, values: results[0].values }, results[1], results[2]] });
  g = await runStage(decl.stages[0], ctx);
  assert.equal(g.verdict, 'red');
  assert.match(g.gapLines.join('\n'), /result 1/);
});
