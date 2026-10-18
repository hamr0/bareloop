// PRD v1.106 Part 5 (D1, D2, C data): each try's checks as they RAN, on the two real archived runs (never authored spines).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getRunDetail, gapOneLine, fromLineText } from '../src/panel/server.js';
import { replayOne } from '../src/replayio.js';
import { makePart5World } from './part5-world.mjs';

const world = makePart5World();
const red = getRunDetail('mvdg1xo3', { home: world.home });
const green = getRunDetail('mve5y8fa', { home: world.home });
const stepParts = (d) => d.parts.filter((p) => p.kind === 'step');

test('D1: a plan step try carries the checks it RAN, never "not run" (mvdg1xo3 step 1, try 1)', () => {
  const a = stepParts(red)[0].attempts[0];
  assert.equal(a.checks.length, 2, 'both exit results of the try');
  assert.deepEqual(a.checks.map((c) => c.pass), [false, true], 'check-passes ran first in this run, tree-changed second (choice 6: the order they ran)');
  assert.equal(a.checks[0].question, "line 1 — does its output pass the line's checks?");
  assert.equal(a.checks[1].question, 'did it change any file?');
  assert.equal(a.checks[0].reasons.length, 9, 'nine close: reasons, none dropped');
  assert.equal(a.checks[0].note, '9 reasons');
  assert.equal(a.checks[1].note, '1 file(s) changed under output/**');
  assert.deepEqual(a.stages.map((s) => s.verdict), ['needs_revision', 'satisfied'], 'the attempt stages the headline reads are filled');
  for (const t of stepParts(red).flatMap((p) => p.attempts)) {
    assert.ok(t.stages.length > 0 && t.checks.length > 0, `try ${t.n} lists its checks`);
  }
});

test('D1: the green run lists both checks as passed, in the order they ran (tree-changed first here)', () => {
  const a = stepParts(green)[0].attempts[0];
  assert.deepEqual(a.checks.map((c) => [c.question, c.pass]), [['did it change any file?', true], ["line 1 — does its output pass the line's checks?", true]]);
  assert.equal(a.checks[1].name, 'line-1-three-flights-boston-to-chicago', 'named by the check-run record');
  assert.equal(a.checks[1].from, 'from line 1 ~ under $450; not a red-eye; nonstop');
  assert.equal(a.checks[0].from, null, 'a mandatory guard serves no job line');
});

test('gapOneLine: first reason without its close prefix or line number, and how many more', () => {
  const raw = readFileSync(world.spine('mvdg1xo3'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.type === 'exit-eval');
  const g = gapOneLine(raw.results[0].detail);
  const c = stepParts(red)[0].attempts[0].checks[0];
  assert.deepEqual([c.gap, c.more], [g.line, g.more], 'the try line reads the same function');
  assert.deepEqual(g, { line: 'result 1, fact "DepartureWindow": the label "Departure time:" is not in the quote', more: 8 });
  assert.deepEqual(gapOneLine('0 file(s) changed under output/**'), { line: '0 file(s) changed under output/**', more: 0 });
  assert.equal(gapOneLine(null), null);
  assert.equal(fromLineText([], {}), null);
  assert.equal(fromLineText([2], { jobLines: [{ n: 2, text: 'x' }] }), 'from line 2');
});

test('replay names each check-passes result by the check-run record before its exit-eval (not by a guess)', () => {
  const parts = replayOne(world.spine('mvdg1xo3')).parts.filter((p) => p.kind === 'step');
  assert.deepEqual(parts.flatMap((p) => p.attempts).map((a) => a.checks.find((c) => c.type === 'check-passes').name), Array(8).fill('line-1-flight-facts'));
  assert.equal(parts.flatMap((p) => p.attempts).length, 8, 'eight graded tries over two steps');
});
