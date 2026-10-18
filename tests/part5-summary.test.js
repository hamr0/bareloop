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
  let run = 0; let passed = 0;
  for (const r of recs) {
    if (r.type === 'exit-eval') for (const x of r.results) { run += 1; if (x.pass) passed += 1; }
    if (r.type === 'outer-close') for (const x of r.stages) { run += 1; if (x.verdict === 'satisfied') passed += 1; }
  }
  return { model, run, passed, failed: run - passed };
}

test('mvdg1xo3: calls and checks equal the counts from the raw spine; the parenthesis names the failed tries', () => {
  const d = getRunDetail('mvdg1xo3', opts);
  const c = counted('mvdg1xo3');
  assert.deepEqual(c, { model: 71, run: 16, passed: 8, failed: 8 });
  assert.equal(d.callsLine, `${c.model} model · ${d.behaviour.totalCalls} tool · ${d.behaviour.denied} denied`);
  assert.equal(d.behaviour.totalCalls, 91);
  assert.equal(d.checksLine, `${c.run} run · ${c.passed} passed · ${c.failed} failed (write-flight-facts tries 1-5, then tries 1-3)`);
  assert.equal(d.callsLine, '71 model · 91 tool · 0 denied');
});

test('mve5y8fa: two step checks and two outer-close stages, none failed', () => {
  const d = getRunDetail('mve5y8fa', opts);
  const c = counted('mve5y8fa');
  assert.equal(d.checksLine, `${c.run} run · ${c.passed} passed · ${c.failed} failed`);
  assert.equal(c.run, 4);
  assert.equal(d.callsLine, `${c.model} model · ${d.behaviour.totalCalls} tool · ${d.behaviour.denied} denied`);
  assert.equal(c.model, 10);
  assert.ok(audit('mve5y8fa').length > 0);
});

test('callsLineOf / checksLineOf edges: no tool log, no checks recorded, an outer close that failed, non-consecutive failed tries', () => {
  assert.equal(callsLineOf([{ type: 'worker-round' }, { type: 'worker-result' }, { type: 'judge-round' }], null), '2 model · tool calls: no log saved');
  assert.equal(checksLineOf([{ type: 'worker-round' }], []), 'not recorded');
  assert.equal(checksLineOf([{ type: 'outer-close', stages: [{ verdict: 'satisfied' }, { verdict: 'needs_revision' }] }], []), '2 run · 1 passed · 1 failed (the outer close)');
  const parts = [{ kind: 'step', label: 'a', tries: [{ n: 1, failed: 1 }, { n: 2, failed: 0 }, { n: 3, failed: 1 }, { n: 4, failed: 1 }, { n: 5, failed: 1 }] }, { kind: 'step', label: 'b', tries: [{ n: 1, failed: 1 }] }];
  const recs = [{ type: 'exit-eval', results: [{ pass: false }] }];
  assert.equal(checksLineOf(recs, parts), '1 run · 0 passed · 1 failed (a tries 1, 3-5, b tries 1)');
});

test('the page prints the rows from the server (calls: after tools:, checks: before cache:) and types no counts', () => {
  const page = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
  const i = (t) => page.indexOf(`data-testid="${t}"`);
  assert.ok(i('summary-tools') < i('summary-calls') && i('summary-calls') < i('summary-checks') && i('summary-checks') < i('summary-cache'));
  assert.match(page, /escapeXml\(detail\.callsLine\)/);
  assert.match(page, /escapeXml\(detail\.checksLine\)/);
});
