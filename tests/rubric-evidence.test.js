// Part 6 highlights, SAVE half: the `rubric-evidence` spine record (src/planrun.js onRubricEvidence <- src/kinds.js runRubricStep <-
// src/rubricstep.js gradeStep). REAL data: the archived flight run mve5y8fa's signed spec, saved Google Flights page and delivered step file
// (tests/fixtures/part5), graded by the REAL bareguard 0.25 through the real `runJob`. Nothing here stubs `checkStep`.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { proveRubricInputs } from '../src/source.js';
import { gradeStep, sha256Of } from '../src/rubricstep.js';
import { readSpine, scriptedProvider } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, 'fixtures', 'part5');
const SPEC = JSON.parse(readFileSync(join(FX, 'mve5y8fa.resolved-spec.json'), 'utf8'));
const STAGE = SPEC.closeDecl.stages.find((/** @type {any} */ s) => s.kind === 'rubric-step');
const PAGE = readFileSync(join(FX, 'mve5y8fa.flights.txt'), 'utf8');
const STEP = readFileSync(join(FX, 'mve5y8fa.step-1-2026-10-18.json'), 'utf8');
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

/**
 * Run the real signed flight job once over the saved page with a scripted worker that writes `stepBytes`; returns the spine.
 * @param {{page?: string, stepBytes?: string}} [o] `page` replaces the frozen page text (the manifest is re-sealed to it)
 */
async function runFlights({ page = PAGE, stepBytes = STEP } = {}) {
  const d = mkdtempSync(join(tmpdir(), 'rubric-evidence-'));
  made.push(d);
  const file = join(d, 'flights.txt');
  writeFileSync(file, PAGE);
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'flights', value: file }], into: join(d, 'seed') });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('unreachable');
  if (page !== PAGE) {
    // a page the source door would have refused (it never lets a secret shape in): re-seal the frozen record to it, to prove the masking seam
    const m = JSON.parse(readFileSync(r.prep.manifestPath, 'utf8'));
    m.inputs[0].sha256 = sha256Of(page);
    writeFileSync(r.prep.manifestPath, JSON.stringify(m));
    writeFileSync(join(r.prep.tree, m.inputs[0].rel), page);
  }
  const job = { ...SPEC, provider: 'anthropic-api', inputs: [{ n: 1, label: 'flights', value: file }] };
  delete job.baseUrl; delete job.model;
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{
    id: 'line-1', action: 'Write output/steps/1.json', tools: ['write'], rounds: 6, target: 'output/steps/1.json',
    exit: [{ type: 'tree-changed', scope: 'output/**' }, { type: 'check-passes', name: STAGE.name }],
  }] });
  const provider = scriptedProvider([
    { text: 'input/flights.txt holds the page' },
    { text: plan },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(r.prep.tree, 'output', 'steps', '1.json'), content: stepBytes } }] },
    { text: 'wrote' },
  ]);
  const spinePath = join(d, 'spine.jsonl');
  const outcome = await runJob(job, { approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }], workdir: r.prep.tree, provider, emit: makeSpine(spinePath) });
  return { outcome, events: readSpine(spinePath), raw: readFileSync(spinePath, 'utf8') };
}

/** what a direct, real grade of the same step reads (the spine's record must equal it) */
async function directEvidence() {
  const g = await gradeStep(
    { params: STAGE.params, bytes: STEP, outputBytes: STEP, inputs: { flights: PAGE } },
    { flights: sha256Of(PAGE) },
  );
  return g.evidence;
}

test('the spine gets one rubric-evidence per checked step try, in bareguard\'s own shape, none at the seed precheck', async () => {
  const { outcome, events } = await runFlights();
  assert.equal(outcome, 'green');
  const recs = events.filter((e) => e.type === 'rubric-evidence');
  assert.equal(recs.length, 2, 'the step\'s own check, then the outer close that decided the run');
  const firstStep = events.findIndex((e) => e.type === 'step-start');
  assert.ok(events.findIndex((e) => e.type === 'rubric-evidence') > firstStep, 'the seed precheck read no step file: nothing to record');
  const [inStep, outer] = recs;
  assert.equal(inStep.step, 1);
  assert.equal(inStep.iteration, 1, 'inside a step try the record names the try');
  assert.equal(outer.step, 1);
  assert.equal('iteration' in outer, false, 'the outer close runs outside any try');
  const direct = await directEvidence();
  assert.equal(direct.length, 3);
  for (const rec of recs) {
    assert.deepEqual(rec.evidence, JSON.parse(JSON.stringify(direct)), 'exactly what the real check returned');
    assert.deepEqual(rec.evidence.map((/** @type {any} */ e) => [e.check, e.claim]), [['p1-facts', 0], ['p1-facts', 1], ['p1-facts', 2]]);
    for (const e of rec.evidence) {
      assert.equal(typeof e.text, 'string');
      assert.ok(e.spans.length > 0);
      for (const s of e.spans) assert.ok(['anchor', 'value', 'currency', 'unit', 'until', 'phrase'].includes(s.role));
    }
  }
});

test('nothing is written when the check read nothing (a step file that is not there, or a malformed one)', async () => {
  const none = await runFlights({ stepBytes: '{"results": []}' });
  assert.equal(none.events.filter((e) => e.type === 'rubric-evidence').length, 0, 'no claims, no evidence, no record');
});

test('the text is masked like every spine write: a secret shape in a quote never reaches the file, and that claim keeps no spans', async () => {
  const token = `ghp_${'A1b2C3d4E5'.repeat(3)}`;
  const step = JSON.parse(STEP);
  const q = step.results[0].quote;
  step.results[0].quote = `${q} ${token}`;
  const { events, raw } = await runFlights({ page: PAGE.replace(q, `${q} ${token}`), stepBytes: JSON.stringify(step) });
  assert.ok(!raw.includes(token), 'the append-only spine must never hold the secret');
  const rec = events.filter((e) => e.type === 'rubric-evidence').at(-1);
  assert.ok(rec, 'the check still read the claims');
  assert.ok(rec.evidence[0].text.includes('[REDACTED:') && !rec.evidence[0].text.includes(token));
  assert.deepEqual(rec.evidence[0].spans, [], 'masking moves offsets: the masked claim keeps no spans rather than wrong ones');
  assert.ok(rec.evidence[1].spans.length > 0, 'an untouched claim keeps its spans');
});

test('report-only: no verdict, governor or money reader names the record; only the writer and the Result tab\'s reader do', () => {
  /** @type {string[]} */
  const hits = [];
  const walk = (/** @type {string} */ dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js') && /(emit\(|type\s*===?\s*)['"]rubric-evidence['"]/.test(readFileSync(p, 'utf8'))) hits.push(p.slice(join(HERE, '..', 'src').length + 1));
    }
  };
  walk(join(HERE, '..', 'src'));
  assert.ok(hits.includes('planrun.js'));
  assert.ok(hits.every((h) => h === 'planrun.js' || h === 'panel/server.js'), `unexpected reader: ${hits.join(', ')}`);
});
