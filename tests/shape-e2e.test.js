// Shape jobs (itemShape) end to end, $0 (no provider: scripted seams; real source door, real check block, real shape builder, real gates, real engine, real bareguard `itemShape`):
//   a tracker job (title / status one of in progress, closed, finished / summary under 200 characters) is DRAFTED from a scripted shape look, SIGNS (the close carries a `shape` part and the signing gates accept it), and RUNS a scripted
//   worker whose item 3 has status "done" and whose item 4 has a 236-character summary: the close reds EXACTLY those two, in plain words. A right answer is green.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorCloseForJob } from '../src/authorjob.js';
import { proveRubricInputs } from '../src/source.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { jobSpecHash } from '../src/job.js';
import { main } from '../src/userrun.js';
import { rubricGoal, listMatchesClose, lineBriefs, cardOfClose } from '../src/rubricstep.js';
import { scriptedProvider } from './helpers.js';
import { checksOf } from '../src/runread.js';
import { shapeItemRecordsOf } from '../src/rowresults.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */ const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'shape-e2e-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const SPEC0 = JSON.parse(readFileSync(join(HERE, 'fixtures', 'part5', 'mve5y8fa.resolved-spec.json'), 'utf8'));

const NOTES = 'Research tracker\n1. Battery chemistry survey - in progress\n2. Grid storage costs - closed\n3. Heat pump field data - finished\n4. Recycling rates - in progress\n';
const LINES = [{ n: 1, text: 'List my research items', rule: 'each item has a title; status is in progress, closed or finished; the summary is under 200 characters', rules: ['each item has a title', 'status is in progress, closed or finished', 'the summary is under 200 characters'] }];
const f = (/** @type {any} */ o) => ({ required: true, bounds: {}, fromRule: null, ...o });
const SHAPES = [{ line: 1, fields: [
  f({ name: 'title', kind: 'text', bounds: { minChars: 1 }, fromRule: 1 }),
  f({ name: 'status', kind: 'oneOf', bounds: { values: ['in progress', 'closed', 'finished'] }, fromRule: 2 }),
  f({ name: 'summary', kind: 'text', bounds: { maxChars: 200 }, fromRule: 3 }),
], extraFields: [], itemCountFrom: [] }];
const ITEMS = (/** @type {any[]} */ over = []) => [
  { title: 'Battery chemistry', status: 'in progress', summary: 'Compares chemistries.' },
  { title: 'Grid storage', status: 'closed', summary: 'Costs per kWh.' },
  { title: 'Heat pumps', status: 'finished', summary: 'Field data.' },
  { title: 'Recycling', status: 'in progress', summary: 'Rates by region.' },
].map((it, i) => ({ ...it, ...(over[i] ?? {}) }));

async function draft() {
  const file = join(tmp(), 'tracker.txt');
  writeFileSync(file, NOTES);
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Tracker', value: file }], into: join(tmp(), 'seed') });
  if (!proved.ok) throw new Error('unreachable');
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Tracker' }], look: { facts: [], prose: [], notFound: [], dropped: [] } } };
  const r = await authorCloseForJob({
    answers: { 1: '1. List my research items' }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG,
    jobLines: JSON.parse(JSON.stringify(LINES)), inputs: [{ n: 1, label: 'Tracker', value: file }], writeScope: ['output/'], provider: { fake: true }, ceilingUsd: 1,
    lookFn: async () => survey,
    // rules first: the shape look is asked only about the ~ rules no truth check took (here all three), through its own seam
    shapeFn: async () => ({ state: 'PRESENT', shapes: SHAPES, reason: null, cause: null, raws: [], calls: [] }),
    generate: async () => { throw new Error('no drafting-model call'); },
    editGenerate: async (/** @type {any} */ _m, /** @type {any[]} */ tools) => { await tools.find((t) => t.name === 'row_edits' || t.name.includes('edit')).execute({ edits: [] }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } }; },
  });
  return { r, file };
}

async function run(/** @type {any} */ r, /** @type {string} */ file, /** @type {any[]} */ items) {
  const dir = tmp('shape-e2e-run-');
  const prep = await proveRubricInputs({ inputs: [{ n: 1, label: 'Tracker', value: file }], into: join(dir, 'source-seed'), destination: join(dir, 'out') });
  if (!prep.ok) throw new Error(JSON.stringify(prep));
  const closeDecl = { ...SPEC0.closeDecl, stages: r.closeDecl.stages, list: r.closeDecl.list, ...(r.closeDecl.refused ? { refused: r.closeDecl.refused } : {}) };
  delete closeDecl.picks;
  const spec = { ...SPEC0, job: 'tracker', jobLines: LINES, inputs: [{ n: 1, label: 'Tracker', value: file }], provider: 'anthropic-api', closeDecl, goal: rubricGoal({ jobLines: LINES, files: prep.prep.manifest.inputs, closeDecl }) };
  delete spec.baseUrl; delete spec.model;
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const stage = closeDecl.stages.find((/** @type {any} */ s) => s.kind === 'rubric-step');
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'line-1', action: 'Write output/steps/1.json', tools: ['write'], rounds: 6, target: 'output/steps/1.json', exit: [{ type: 'tree-changed', scope: 'output/**' }, { type: 'check-passes', name: stage.name }] }] });
  const step = JSON.stringify({ text: 'The four research items.', cites: { Tracker: [{ claim: 'The first item is a battery chemistry survey that is in progress', quote: '1. Battery chemistry survey - in progress' }] }, results: items });
  const provider = scriptedProvider([{ text: 'input/tracker.txt holds the notes' }, { text: plan }, { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(prep.prep.tree, 'output', 'steps', '1.json'), content: step } }] }, { text: 'wrote' }]);
  const home = tmp('shape-e2e-home-');
  /** @type {string[]} */ const out = [];
  /** @type {string[]} */ const err = [];
  const rc = await main(['--spec', specPath, '--approve', jobSpecHash(spec)], { provider, env: {}, out: (s) => out.push(String(s)), err: (s) => err.push(String(s)), runlistHome: home });
  const text = `${err.join('\n')}\n${out.join('\n')}`;
  const spine = /spine\s+(\S+\.jsonl)/.exec(text)?.[1];
  const runid = /u-([a-z0-9]+)\.jsonl/.exec(spine ?? '')?.[1] ?? '';
  return { rc, text, provider, spine: spine ? readFileSync(spine, 'utf8') : '', dest: join(dir, 'out'), closeDecl, runid, home };
}

test('DRAFT: the shape look\'s shape builds, the gates accept the shape part (it SIGNS), and the list matches the close', async () => {
  const { r } = await draft();
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal ?? r.authoring?.iterations?.map((/** @type {any} */ i) => i.validation)));
  const stage = r.closeDecl.stages.find((/** @type {any} */ s) => s.kind === 'rubric-step');
  assert.deepEqual(stage.params.parts.map((/** @type {any} */ p) => p.class), ['shape', 'countable'], 'the shape part, and the `$cited` default that always stays');
  assert.equal(stage.params.parts[1].check, 'cited');
  const part = stage.params.parts[0];
  assert.deepEqual(part.fields.map((/** @type {any} */ x) => x.name), ['title', 'status', 'summary']);
  assert.deepEqual(part.rules, [1, 2, 3]);
  assert.equal(listMatchesClose(r.closeDecl).ok, true, JSON.stringify(listMatchesClose(r.closeDecl)));
  assert.ok(r.closeDecl.list.some((/** @type {any} */ x) => x.kind === 'prose' && x.state === 'not-checked'), 'the truth of the items is Not checked');
  const card = cardOfClose({ closeDecl: r.closeDecl, jobLines: LINES });
  assert.deepEqual(card.checkItems.filter((c) => c.fromLine[0] === 1 && c.by === 'you').map((c) => c.text), ['title · not empty', 'status · one of: in progress, closed, finished', 'summary · under 200 characters']);
});

test('the worker\'s brief for a shape line: the file contract, each field in plain words and one code-built example item that bareguard accepts', async () => {
  const { r } = await draft();
  const brief = lineBriefs(r.closeDecl).find((b) => b.line === 1)?.text ?? '';
  assert.match(brief, /^Job line 1 is a TEXT line AND a LIST line\. Write output\/steps\/1\.json as \{"text": "\.\.\.", "cites": \{\.\.\.\}, "results": \[\{\.\.\.\}, \{\.\.\.\}\]\}/);
  assert.match(brief, /- title: not empty\n/);
  assert.match(brief, /- status: one of: in progress, closed, finished\n/);
  assert.match(brief, /- summary: at most 199 characters\n/);
  const example = JSON.parse(/One example item: (\{.*\})/.exec(brief)?.[1] ?? 'null');
  assert.equal(example.status, 'in progress');
  const { createRubric, checkStep } = await import('bareguard');
  const stage = r.closeDecl.stages.find((/** @type {any} */ s) => s.kind === 'rubric-step');
  const { buildStepSpec } = await import('../src/rubricstep.js');
  const rubric = createRubric(buildStepSpec(stage.params, { Tracker: '0'.repeat(64) }));
  const res = await checkStep(rubric, '1', { results: [example], text: 'x' }, { inputs: { Tracker: 'x' } });
  assert.equal(res.full.gaps.some((/** @type {any} */ g) => g.check === 'itemShape'), false, 'the example is a legal item');
});

test('RUN: item 3 status "done" and item 4 summary of 236 characters: the close reds exactly those two, in plain words; the right answer is green', async () => {
  const { r, file } = await draft();
  const bad = await run(r, file, ITEMS([undefined, undefined, { status: 'done' }, { summary: 's'.repeat(236) }]));
  assert.doesNotMatch(bad.text, /outcome\s+green/, bad.text);
  const gaps = bad.spine.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.type === 'close-verdict').flatMap((e) => String(e.gap).split('\n').flatMap((x) => (/line 1: (item \d+: .*)$/.exec(x) ? [/line 1: (item \d+: .*)$/.exec(x)?.[1]] : [])));
  assert.deepEqual([...new Set(gaps)].sort(), ['item 3: "status" is not one of the allowed values', 'item 4: "summary" is too long (236 characters, at most 199)']);
  assert.equal(gaps.some((g) => /^item [12]:/.test(String(g))), false, 'items 1 and 2 are fine');
  const good = await run(r, file, ITEMS());
  assert.equal(good.rc, 0, good.text);
  assert.match(good.text, /outcome\s+green/);
});

test('RESULT TAB model (signed mock A): the red run\'s line is a shape grid with the two failed cells and the two plain errors; the green run\'s is all passed; Not checked says the truth is the person\'s', async () => {
  const { r, file } = await draft();
  const { getRunResult } = await import('../src/panel/server.js');
  const bad = await run(r, file, ITEMS([undefined, undefined, { status: 'done' }, { summary: 's'.repeat(236) }]));
  const res = /** @type {any} */ (getRunResult(bad.runid, { home: bad.home }));
  const line = res.lines[0];
  assert.equal(line.kind, 'shape');
  assert.deepEqual(line.shape.columns, [{ name: 'title' }, { name: 'status' }, { name: 'summary' }]);
  assert.deepEqual([line.shape.total, line.shape.passed, line.shape.failed], [4, 2, 2]);
  assert.deepEqual(line.shape.rows[2].cells.map((/** @type {any} */ c) => c.mark + c.text), ['gHeat pumps', 'rdone', 'gField data. (11 chars)']);
  assert.deepEqual(line.shape.errors, ['item 3: status is "done", not one of: in progress, closed, finished', 'item 4: summary is too long (236 characters, under 200)']);
  assert.deepEqual(line.notChecked, ['whether each one is true \u2014 you judge it at Accept']);
  assert.equal(line.notCheckedBy['whether each one is true \u2014 you judge it at Accept'], 'default');
  const good = await run(r, file, ITEMS());
  const gres = /** @type {any} */ (getRunResult(good.runid, { home: good.home }));
  assert.deepEqual([gres.lines[0].shape.total, gres.lines[0].shape.passed, gres.lines[0].shape.failed, gres.lines[0].shape.errors], [4, 4, 0, []]);
  // the Audit (signed mock C): per-field rows from the plain gap lines of the red run, the heading, the floor in list words
  const { getRunDetail } = await import('../src/panel/server.js');
  const ac = /** @type {any} */ (getRunDetail(bad.runid, { home: bad.home })).auditChecks;
  assert.equal(ac.shapeHead, "Shape checks \u00B7 code checks each item's form, not whether it is true");
  const rows = ac.checks.filter((/** @type {any} */ r) => r.shape);
  assert.deepEqual(rows.map((/** @type {any} */ r) => [r.text, r.result]), [['title \u00B7 not empty', 'passed'], ['status \u00B7 one of: in progress, closed, finished', 'failed'], ['summary \u00B7 under 200 characters', 'failed']]);
  assert.equal(rows[1].why, 'item 3: "status" is not one of the allowed values');
  assert.ok(ac.checks.some((/** @type {any} */ r) => /must exist, be complete JSON, and carry text/.test(r.text)), 'the line also carries text (the cite default stays)');
  assert.deepEqual(ac.notChecked.map((/** @type {any} */ r) => [r.text, r.by]), [['whether each one is true \u2014 you judge it at Accept', 'default']]);
});

test('"under 200 characters" is exclusive: a 200-character summary is RED, a 199-character one is green (code signs 199, whatever the AI sent)', async () => {
  const { r, file } = await draft();
  const part = r.closeDecl.stages.find((/** @type {any} */ s) => s.kind === 'rubric-step').params.parts[0];
  assert.equal(part.fields.find((/** @type {any} */ x) => x.name === 'summary').spec.maxChars, 199);
  const at200 = await run(r, file, ITEMS([{ summary: 's'.repeat(200) }]));
  assert.doesNotMatch(at200.text, /outcome\s+green/, 'a 200-character summary is not under 200');
  assert.match(at200.spine, /item 1: \\\"summary\\\" is too long \(200 characters, at most 199\)/);
  const at199 = await run(r, file, ITEMS([{ summary: 's'.repeat(199) }]));
  assert.equal(at199.rc, 0, at199.text);
  assert.match(at199.text, /outcome\s+green/);
});

// F399 (Addendum 2026-11-25d): a red shape run's raw item reds are written to the spine as `shape-items` where they happen (a red STEP check: src/planrun.js runCheck),
// so the readers never parse our own gap sentences back. The record carries the same raw strings a final close keeps in `stages[].items`.
test('F399: a red shape run writes `shape-items` {step, line, items}; checksOf.shapeItems reads them with no gap prose', async () => {
  const { r, file } = await draft();
  const bad = await run(r, file, ITEMS([undefined, undefined, { status: 'done' }, { summary: 's'.repeat(236) }]));
  const recs = bad.spine.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const got = recs.filter((e) => e.type === 'shape-items');
  assert.ok(got.length >= 1, 'a shape-items record was written');
  assert.equal(got[0].step, 'line-1');
  assert.equal(got[0].line, 1);
  const items = [...new Set(got.flatMap((e) => e.items))];
  assert.equal(items.length, 2, JSON.stringify(items));
  assert.ok(items.every((x) => /^#\d+:/.test(x)), JSON.stringify(items));
  // the reader: no close-verdict gap prose in the way (drop every gap) and the same items still come back
  const noGap = recs.map((e) => (e.type === 'close-verdict' ? { ...e, gap: undefined } : e));
  const stageName = closeDeclStage(bad.closeDecl);
  assert.deepEqual([...checksOf(noGap, null, { spec: { closeDecl: bad.closeDecl } }).shapeItems.get(stageName)].sort(), items.slice().sort());
});

const closeDeclStage = (/** @type {any} */ cd) => cd.stages.find((/** @type {any} */ s) => s.kind === 'rubric-step').name;

test('F399: shapeItemRecordsOf: a stage entry with items becomes one record; none, a command close and junk make none', () => {
  assert.deepEqual(shapeItemRecordsOf({ stages: [{ name: 'line-2', items: ['#0:title:missing'] }, { name: 'guard', verdict: 'satisfied' }, { name: 'x', items: [] }] }), [{ step: 'line-2', line: 2, items: ['#0:title:missing'] }]);
  assert.deepEqual(shapeItemRecordsOf({ verdict: 'needs_revision', gap: 'x' }), []);
  assert.deepEqual(shapeItemRecordsOf(null), []);
  assert.deepEqual(shapeItemRecordsOf({ stages: [{ name: 'other', items: ['a'] }] }), [{ step: 'other', line: null, items: ['a'] }]);
});
