// F399: the 5 today's-view bugs the readers fix. Each runs on a trimmed copy of the run's REAL archived spine (tests/fixtures/f399, never .claude/scratch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { f399World } from './f399-world.mjs';
import { getRunResult, getRunDetail } from '../src/panel/server.js';

test('bug 1 (run mv5e1ktb): a green run\'s Result rows read passed, never none (the line read a step check-run, not the final close)', () => {
  const w = f399World('mv5e1ktb', 'rubric-2');
  const r = getRunResult('mv5e1ktb', w.opts);
  assert.ok(r);
  for (const l of r.lines) {
    assert.equal(l.passed, true, `line ${l.n}`);
    assert.deepEqual(l.checkRows.map((x) => x.result), l.checkRows.map(() => 'passed'), `line ${l.n} rows`);
  }
});

test('bug 2 (run mv73swnx): a red run\'s Result rows read failed, the same word the Audit box shows for the same record', () => {
  const w = f399World('mv73swnx', 'flights1');
  const r = getRunResult('mv73swnx', w.opts);
  const audit = getRunDetail('mv73swnx', w.opts).auditChecks;
  const auditWords = audit.lines.flatMap((l) => l.checks.map((c) => c.result));
  assert.ok(auditWords.length > 0 && auditWords.every((x) => x === 'failed'), `the Audit says ${auditWords}`);
  const resultWords = r.lines.flatMap((l) => l.checkRows.map((x) => x.result));
  assert.deepEqual(resultWords, auditWords);
});

test('bug 3 (run mwtf8p8s): the checks of a resumed run are its CURRENT leg\'s; an earlier leg\'s step tries do not merge into the later leg', () => {
  const w = f399World('mwtf8p8s', 'walk-stop');
  const r = getRunResult('mwtf8p8s', w.opts);
  assert.equal(r.kind, 'generic');
  assert.equal(r.checks, null, 'leg 2 ran no step check and no close: nothing to show, not leg 1\'s tries');
  const audit = getRunDetail('mwtf8p8s', w.opts).auditChecks;
  const words = audit.lines.flatMap((l) => l.checks.map((c) => c.result));
  assert.ok(words.length > 0 && words.every((x) => x === 'none'), `the Audit says ${words}`);
});
