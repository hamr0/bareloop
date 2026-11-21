// Part 2, ruled 2A (the fake-diff hole): the rubric worker's write fence is all of `output/`, so it could overwrite code's own
// output/review-diff/<path>.diff and quote a fake line through the cite. The worker may not WRITE or EDIT anything under
// output/review-diff/ (the SAME tools.denyArgPatterns belt as .git/node_modules, never fs.deny, which would block the READS
// the cite and the worker need). Driven on the REAL bareguard Gate and a real runPlan worker; no stand-in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Gate } from 'bareguard';
import * as range from '../src/rangereview.js';
import { GATE_AUDIT_FILE, ARBITER_BOOK_STORES } from '../src/kinds.js';
import { scriptedProvider, initPatientRepo } from './helpers.js';
import { tcall, makePatient, JOB, go } from './planrun-fixtures.js';

test('the real Gate refuses a worker WRITE and EDIT under output/review-diff/, allows a READ of it and a write to output/steps/1.json', async (t) => {
  const wd = mkdtempSync(join(tmpdir(), 'range-fence-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  initPatientRepo(wd);
  const pat = range.REVIEW_DIFF_WRITE_PATTERN;
  const gate = new Gate({
    fs: { writeScope: [join(wd, 'output')], readScope: [wd], deny: [join(wd, GATE_AUDIT_FILE), ...ARBITER_BOOK_STORES.map((s) => join(wd, s))] },
    tools: { denyArgPatterns: { write: pat ? [pat] : [], edit: pat ? [pat] : [] } },
    audit: { path: null },
  });
  const diff = join(wd, 'output', 'review-diff', 'src', 'x.js.diff');
  const w = await gate.check({ type: 'write', path: diff });
  assert.equal(w.outcome, 'deny', 'a worker write to a per-file diff is refused');
  assert.equal(w.rule, 'tools.denyArgPatterns');
  const e = await gate.check({ type: 'edit', path: diff, args: { bytes: 4 } });
  assert.equal(e.outcome, 'deny', 'a worker edit of a per-file diff is refused');
  assert.equal((await gate.check({ type: 'write', path: join(wd, 'output', 'review-diff', 'files.txt') })).outcome, 'deny', 'files.txt too');
  assert.equal((await gate.check({ type: 'read', path: diff })).outcome, 'allow', 'a READ of it stays allowed');
  assert.equal((await gate.check({ type: 'write', path: join(wd, 'output', 'steps', '1.json') })).outcome, 'allow', 'the answer file stays writable');
  assert.equal((await gate.check({ type: 'write', path: join(wd, 'output', 'review-diffs-notes.md') })).outcome, 'allow', 'a look-alike name is not caught');
});

test('wired: a runPlan worker writing under output/review-diff/ is refused by the real gate (nothing lands, the audit says deny); code\'s own writeRangeDiffs path is not a gate action', async (t) => {
  const wd = makePatient(t);
  const plan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{ id: 'write-test', action: 'Write tests/test_x.mjs.', tools: ['write'], rounds: 6, target: 'tests/test_x.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }] }],
  });
  mkdirSync(join(wd, 'output', 'review-diff', 'src'), { recursive: true });
  const real = join(wd, 'output', 'review-diff', 'src', 'x.js.diff');
  writeFileSync(real, 'REAL DIFF\n');
  const provider = scriptedProvider([
    { toolCalls: [tcall('t1', 'shell_write', { path: real, content: 'FAKE DIFF\n' })] },
    { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  await go(wd, provider, {
    job: JOB(wd, { writeScope: ['tests/**', 'output/**'] }),
    resumeSeed: { phase: 'steps', plan, completedSteps: [] },
  });
  assert.equal(readFileSync(real, 'utf8'), 'REAL DIFF\n', 'the worker could not overwrite the per-file diff');
  const audit = readFileSync(join(wd, GATE_AUDIT_FILE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(audit.some((r) => r.decision === 'deny' && r.action?.type === 'write' && String(r.action.path).includes('review-diff')), 'the real gate recorded the deny');
  assert.ok(existsSync(join(wd, 'tests', 'test_x.mjs')), 'an ordinary write in the same run still lands');
});
