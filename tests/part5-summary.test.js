// PRD v1.106 Part 5 F: the two Run summary rows. The expected numbers are counted from the RAW spine in the test (never typed from the
// spec), then compared with the server's words, on both real archived runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getRunDetail, callsLineOf, checksLineOf } from '../src/panel/server.js';
import { makePart5World } from './part5-world.mjs';

const world = makePart5World();
const opts = { home: world.home };
const raw = (id) => readFileSync(world.spine(id), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const audit = (id) => readFileSync(world.spine(id).replace(/\.jsonl$/, '-gate-audit.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

function counted(id) {
  const recs = raw(id);
  const model = recs.filter((r) => r.type === 'worker-round' || r.type === 'judge-round').length;
  // the checks line reads the LATEST close only (live run mwg3pov1): the last staged close record, counted from the raw spine here
  const last = recs.findLast((r) => (r.type === 'close-verdict' || r.type === 'outer-close') && Array.isArray(r.stages));
  if (!last) return { model, run: null, passed: null, failed: null }; // no close ever ran: the line falls back to the steps' checks (last try standing), as the fold does
  const run = last.stages.length;
  const passed = last.stages.filter((x) => x.verdict === 'satisfied').length;
  return { model, run, passed, failed: run - passed };
}

test('mvdg1xo3: calls equal the counts from the raw spine; checks are the latest close only, no tries parenthesis', () => {
  const d = getRunDetail('mvdg1xo3', opts);
  const c = counted('mvdg1xo3');
  assert.deepEqual(c, { model: 71, run: null, passed: null, failed: null });
  assert.equal(d.callsLine, `${c.model} model · ${d.behaviour.totalCalls} tool · ${d.behaviour.denied} denied`);
  assert.equal(d.behaviour.totalCalls, 91);
  assert.equal(d.checksLine, '2 run · 1 passed · 1 failed');
  assert.equal(d.callsLine, '71 model · 91 tool · 0 denied');
});

test('mve5y8fa: two outer-close stages, none failed', () => {
  const d = getRunDetail('mve5y8fa', opts);
  const c = counted('mve5y8fa');
  assert.equal(d.checksLine, `${c.run} run · ${c.passed} passed · ${c.failed} failed`);
  assert.equal(c.run, 2);
  assert.equal(d.callsLine, `${c.model} model · ${d.behaviour.totalCalls} tool · ${d.behaviour.denied} denied`);
  assert.equal(c.model, 10);
  assert.ok(audit('mve5y8fa').length > 0);
});

test('callsLineOf / checksLineOf edges: no tool log, no checks recorded, a latest close that failed, the latest of two closes wins', () => {
  assert.equal(callsLineOf([{ type: 'worker-round' }, { type: 'worker-result' }, { type: 'judge-round' }], null), '2 model · tool calls: no log saved');
  assert.equal(checksLineOf([{ type: 'worker-round' }], null), 'not recorded');
  assert.equal(checksLineOf([{ type: 'outer-close', stages: [{ name: 'a', verdict: 'satisfied' }, { name: 'b', verdict: 'needs_revision' }] }], null), '2 run · 1 passed · 1 failed');
  const recs = [{ type: 'outer-close', stages: [{ name: 'a', verdict: 'needs_revision' }] }, { type: 'close-verdict', stages: [{ name: 'a', verdict: 'satisfied' }] }];
  assert.equal(checksLineOf(recs, null), '1 run · 1 passed · 0 failed');
});

test('the page prints the rows from the server (calls: after tools:, checks: before cache:) and types no counts', () => {
  const page = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
  const i = (t) => page.indexOf(`data-testid="${t}"`);
  assert.ok(i('summary-tools') < i('summary-calls') && i('summary-calls') < i('summary-checks') && i('summary-checks') < i('summary-cache'));
  assert.match(page, /escapeXml\(detail\.callsLine\)/);
  assert.match(page, /escapeXml\(detail\.checksLine\)/);
});
