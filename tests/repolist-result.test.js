// Addendum 2026-11-15 (d), the Result tab: for a repo close that carries the one list, "The checks" are drawn from the list's rows only (like the Job tab and the Audit): `!` stage rows with their recorded verdict, `$` guard rows,
// the `$` fence row with the gate's record, each `~` rule row kept by the fence (the fence's result) or Not checked with its code reason. REAL archived spine mvkj03w7 (tests/fixtures/result-tab); the spec is the archived one
// with a job line, two `~` rules and the list code builds for it. A close with no list keeps today's tab (tests/result-tab-data.test.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeResultWorld } from './result-tab-world.mjs';
import { getRunResult } from '../src/panel/server.js';
import { repoList } from './repo-list-world.mjs';
import { REASON } from '../src/checkblock.js';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'result-tab');
const GUARDS = ['changed-from-seed', 'no-suppressions'];

function world() {
  const w = makeResultWorld(['mvkj03w7']);
  const old = JSON.parse(readFileSync(join(FX, 'mvkj03w7.resolved-spec.json'), 'utf8'));
  const jobLines = [{ n: 1, text: 'Fix the type errors in src/', rule: 'do not change package.json; keep the diff small', rules: ['do not change package.json', 'keep the diff small'] }];
  const stages = old.closeDecl.stages.map((/** @type {any} */ s) => (GUARDS.includes(s.name) ? s : { ...s, fromLine: [1] }));
  const list = repoList({ jobLines, stages, point: [{ op: 'fence', line: 1, rule: 1, path: 'package.json' }], guardNames: GUARDS, writeScope: old.writeScope, files: ['package.json', 'src/checks.js'] });
  const spec = { ...old, jobLines, closeDecl: { ...old.closeDecl, stages, list } };
  const specPath = join(dirname(w.spine('mvkj03w7')), '..', '..', 'session-mvkj03w7', 'resolved-spec.json');
  writeFileSync(join(w.root, 'session-mvkj03w7', 'resolved-spec.json'), JSON.stringify(spec));
  void specPath;
  return w;
}

test('Result tab of a repo close with a list: the checks are its rows, each with its tag and its own result', () => {
  const k = getRunResult('mvkj03w7', { home: world().home }).checks;
  const by = (/** @type {RegExp} */ re) => k.stages.find((/** @type {any} */ s) => re.test(s.question));
  const stage = by(/^! \[agent\] line 1 · does "npm test" exit clean\?/);
  assert.match(stage.question, /^! \[agent\] /);
  assert.deepEqual([stage.passed, stage.status.word], [true, 'passed']);
  assert.match(by(/no checker silenced/).question, /^\$ \[default\] /);
  const kept = by(/do not change package\.json/);
  assert.match(kept.question, /^~ \[you\] .*kept by the write fence: package\.json/);
  assert.equal(kept.status.word, "the gate's record for this run is missing", 'a fence-kept rule reads the gate record, here absent: never "held"');
  const fence = by(/^\$ \[default\] other · only files in /);
  assert.match(fence.question, /^\$ \[default\] /);
  const nc = by(/keep the diff small/);
  assert.match(nc.question, new RegExp(REASON.noRule.replace(/[.]/g, '\\.')));
  assert.deepEqual([nc.passed, nc.notReached, nc.status.word], [false, true, 'not checked']);
});

test('the head still counts only the checks the close ran (a Not checked row is no check)', () => {
  const k = getRunResult('mvkj03w7', { home: world().home }).checks;
  assert.equal(k.head, '7 of 7 passed · the close ran them after the worker stopped');
});
