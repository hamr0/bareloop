// S5: `scripts/sheet-recheck.mjs <run folder>` re-runs a run's signed sheet checks on its saved FROZEN sheet and says ok. Proven on a REAL engine-produced run ($0, scripted worker; tests/sheet-surfaces-world.mjs):
// ok on the untouched run; a one-cell edit of the frozen copy is named at once; a claim that names one row too many is RED naming the row; bad usage is exit 2. The script only reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSheetJob, PLANTED } from './sheet-surfaces-world.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'sheet-recheck.mjs');
const recheck = (/** @type {string[]} */ args) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  const lines = r.stdout.split('\n').filter(Boolean);
  return { code: r.status, out: r.stdout, last: lines.at(-1), err: r.stderr };
};

test('ok on the untouched run: the sheet matches the fingerprint the run recorded and every signed check holds on the claims it graded', async () => {
  const r = await runSheetJob();
  assert.equal(r.rc, 0, r.err);
  const c = recheck([r.dir]);
  assert.equal(c.code, 0, c.out + c.err);
  assert.equal(c.last, 'ok');
  assert.match(c.out, /^ok table expenses [0-9a-f]{12}$/m);
  assert.match(c.out, /^ok l1r1$/m);
  assert.equal(c.out.includes(PLANTED), false, 'no cell text in what it prints');
});

test('a one-cell edit of the frozen copy is named (mismatch), exit 1', async () => {
  const r = await runSheetJob();
  const sheet = join(r.tree, 'input', 'expenses.csv');
  writeFileSync(sheet, readFileSync(sheet, 'utf8').replace('336.19', '336.18'));
  const c = recheck([r.dir]);
  assert.equal(c.code, 1);
  assert.match(c.out, /^mismatch table expenses/m);
  assert.equal(c.last, 'NOT OK');
});

test('a claim that names one row too many is RED and names the row; exit 1', async () => {
  const r = await runSheetJob();
  const f = join(r.tree, 'output', 'steps', '1.json');
  const obj = JSON.parse(readFileSync(f, 'utf8'));
  const name = r.claimName(0);
  const extra = [2, 3, 4].find((n) => !r.over.includes(n));
  obj.claims[name].rows = [...obj.claims[name].rows, extra];
  writeFileSync(f, JSON.stringify(obj));
  const c = recheck([r.dir]);
  assert.equal(c.code, 1, c.out);
  assert.match(c.out, new RegExp(`^RED \\S+ .*\\b${extra}\\b`, 'm'));
  assert.equal(c.last, 'NOT OK');
});

test('usage: no folder is exit 2; a folder that is no run is NOT OK, never a crash trace', () => {
  assert.equal(recheck([]).code, 2);
  const c = recheck(['/nonexistent-run-folder']);
  assert.equal(c.code, 1);
  assert.equal(c.last, 'NOT OK');
});
