// hamr live run mwndngl5 (job research-3, passed): the Audit showed only the line-less guards, the "Line 1" block (its checks, results and NOT CHECKED row) was missing,
// because the run detail shipped `auditChecks` without `lines`/`jobNotChecked`. Also the output-file check's kind is `file`, not `truth`. Fixture = that real session.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRunDetail } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';
import { kindOfCheck } from '../src/panel/jobplan.js';

const FIX = fileURLToPath(new URL('./fixtures/audit-lines-mwndngl5/', import.meta.url));
/** @type {string[]} */
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function runHome() {
  const home = mkdtempSync(join(tmpdir(), 'audit-lines-'));
  dirs.push(home);
  const sess = join(home, 'panel-sessions', 'smwndm6b9w6ee');
  const dir = join(sess, 'source-seed', 'research-3-bareloop');
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(FIX, 'resolved-spec.json'), join(sess, 'resolved-spec.json'));
  copyFileSync(join(FIX, 'draft-log.jsonl'), join(sess, 'draft-log.jsonl'));
  copyFileSync(join(FIX, 'u-mwndngl5.jsonl'), join(dir, 'u-mwndngl5.jsonl'));
  copyFileSync(join(FIX, 'u-mwndngl5-gate-audit.jsonl'), join(dir, 'u-mwndngl5-gate-audit.jsonl'));
  appendRun({ at: '2026-11-19T09:58:16.505Z', runid: 'mwndngl5', job: 'research-3', spine: join(dir, 'u-mwndngl5.jsonl'), patient: null, via: 'run-u', pid: 999999, capUsd: 0.5 }, { home });
  return home;
}

test('the run detail ships the Line 1 block of the Audit with its checks, results and NOT CHECKED row (real run mwndngl5)', () => {
  const ac = getRunDetail('mwndngl5', { home: runHome() }).auditChecks;
  assert.ok(ac);
  assert.ok(Array.isArray(ac.lines) && ac.lines.length === 1, `lines shipped: ${JSON.stringify(ac.lines)}`);
  const l = ac.lines[0];
  assert.equal(l.n, 1);
  assert.ok(l.checks.length >= 4, JSON.stringify(l.checks.map((c) => c.text)));
  assert.ok(l.checks.every((c) => c.result === 'passed' || c.result === 'held'), JSON.stringify(l.checks.map((c) => [c.text, c.result])));
  assert.ok(l.notChecked.length >= 1, 'the line carries its NOT CHECKED row');
  assert.ok(Array.isArray(ac.jobNotChecked));
});

test('the output-file check of a line has kind file (not truth)', () => {
  const ac = getRunDetail('mwndngl5', { home: runHome() }).auditChecks;
  const all = [...ac.lines[0].checks, ...ac.always];
  const out = all.filter((c) => /must exist, be complete JSON/.test(c.text));
  assert.ok(out.length >= 1, 'the output-file row is listed');
  for (const c of out) assert.equal(c.kind, 'file', c.text);
  assert.equal(kindOfCheck({ key: 'L1.$floor' }), 'file');
});
