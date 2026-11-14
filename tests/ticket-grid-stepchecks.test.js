// R8 fix (2026-11-08): a run the outer close never reached shows the checks its STEPS ran, read through the Audit grid's own data. REAL archived spine: tests/fixtures/audit-grid (live run mvtatlxw: a step
// whose try 1 was red and try 2 green), with its `outer-close` and staged `close-verdict` records removed so the close "never ran". The standing of a check is its LAST graded try (not the first), and the count of tries is the step's.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { readRunList } from '../src/runlist.js';
import { getRunResult, getRunDetail } from '../src/panel/server.js';
import { makeAuditGridWorld, RUNID } from './audit-grid-world.mjs';

function noCloseWorld() {
  const w = makeAuditGridWorld();
  const detail = getRunDetail(RUNID, w.opts);
  assert.ok(detail, 'the run is listed');
  return w;
}
test('a step\'s check that was red on try 1 and green on try 2 stands green; the tries are the step\'s; the close that never ran is not invented', async () => {
  const w = noCloseWorld();
  const before = getRunResult(RUNID, w.opts);
  assert.ok(before.checks, 'with the close record the stages are the close\'s');
  assert.match(before.checks.head, /the close ran them after the worker stopped$/);
  // remove the outer close from the spine (the file the run list points at)
  const row = readRunList(w.opts).rows.find((r) => r.runid === RUNID);
  const text = readFileSync(row.spine, 'utf8').split('\n').filter((l) => l && !/"type":"outer-close"|"type":"close-verdict".*"stages"/.test(l)).join('\n') + '\n';
  writeFileSync(row.spine, text);
  const k = getRunResult(RUNID, w.opts).checks;
  assert.ok(k, 'the steps\' own checks stand in');
  assert.match(k.head, /the steps ran them; the close never ran$/);
  const zero = k.stages.find((s) => s.name === 'typecheck-target-zero-errors');
  assert.ok(zero, 'the check the step ran twice');
  assert.equal(zero.passed, true, 'red on try 1, green on try 2: it stands green (the LAST graded try)');
  assert.equal(zero.tries, 2);
  assert.equal(zero.value, null, 'no number is parsed out of the gap prose');
  assert.equal(k.stages.every((s) => s.passed), true);
  assert.equal(k.allPassed, true);
  assert.equal(k.passed, k.total);
});

test('a check a LATER step ran again takes that later standing (the same name red in a later step reads red)', () => {
  const w = noCloseWorld();
  const row = readRunList(w.opts).rows.find((r) => r.runid === RUNID);
  const lines = readFileSync(row.spine, 'utf8').split('\n').filter((l) => l && !/"type":"outer-close"|"type":"close-verdict".*"stages"/.test(l)).map((l) => {
    const r = JSON.parse(l);
    // the second step's artifact check goes red; the first step's stays green
    if (r.type === 'exit-eval' && r.step === 'annotate-cfg-params') r.results = r.results.map((x) => (x.type === 'artifact-written' ? { ...x, pass: false, detail: 'x was not written' } : x));
    return JSON.stringify(r);
  });
  writeFileSync(row.spine, `${lines.join('\n')}\n`);
  const k = getRunResult(RUNID, w.opts).checks;
  const art = k.stages.filter((s) => s.name === 'artifact-written');
  assert.equal(art.length, 1, 'one standing per check name');
  assert.equal(art[0].passed, false, 'the later step\'s red stands');
  assert.equal(k.allPassed, false);
});
