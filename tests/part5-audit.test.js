// PRD v1.106 Part 5 (C): the Audit step fold's data on the two real archived runs: tools tally, markers, the whole-step Round table (Try
// column, step-local round numbers, a check row per try, 20 rows a page) and the review-door part.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRunDetail, getRunRounds, toolsTallyLine, checkRowWords } from '../src/panel/server.js';
import { doorViewOf } from '../src/panel/status.js';
import { makePart5World } from './part5-world.mjs';

const world = makePart5World();
const opts = { home: world.home };
const red = getRunDetail('mvdg1xo3', opts);
const green = getRunDetail('mve5y8fa', opts);
const idxOf = (d, kind, nth = 0) => d.parts.map((p, i) => [p, i]).filter(([p]) => p.kind === kind)[nth][1];

test('tools tally and the actor marker ride on each step part', () => {
  const s1 = red.parts[idxOf(red, 'step', 0)];
  assert.equal(s1.tally, 'tools: read 16 · grep 22 · write 5 · denied 0');
  assert.equal(s1.marker, '[model]');
  assert.equal(green.parts[idxOf(green, 'step')].tally, 'tools: read 2 · grep 2 · write 2 · denied 0');
  assert.equal(toolsTallyLine(null, 0), null, 'no tool log saved: no tally');
  assert.equal(toolsTallyLine({ shell_read: 1, ctx_get: 2 }, 3), 'tools: read 1 · get 2 · denied 3');
});

test('Round table, whole step (mvdg1xo3 step 1): 80 rows, 20 a page, rounds restart at 1, Try column, one check row per try', () => {
  const p = idxOf(red, 'step', 0);
  const first = getRunRounds('mvdg1xo3', { part: p, all: true }, opts);
  assert.equal(first.mode, 'step');
  assert.equal(first.totalRows, 80, '32 model calls + 43 tool calls + 5 checks');
  assert.equal(first.rows.length, 20);
  assert.equal(first.limit, 20);
  const r0 = first.rows[0];
  assert.deepEqual([r0.kind, r0.round, r0.try], ['model', 1, 1], 'round numbers restart at 1 inside the step');
  assert.deepEqual(first.rows.slice(1, 3).map((r) => [r.kind, r.round, r.try, r.action]), [['tool', 1, 1, 'read'], ['tool', 1, 1, 'read']]);
  // walk every page: nothing lost, nothing doubled
  const all = [];
  for (let off = 0; off < first.totalRows; off += 20) all.push(...getRunRounds('mvdg1xo3', { part: p, all: true, offset: off }, opts).rows);
  assert.equal(all.length, 80);
  const checks = all.filter((r) => r.kind === 'check');
  assert.deepEqual(checks.map((r) => r.try), [1, 2, 3, 4, 5]);
  assert.ok(checks.every((r) => r.sign === '✗' && r.text === '1 failed, 1 passed' && r.path === 'output/steps/1.json'), 'the file comes from the signed declaration');
  assert.equal(all.filter((r) => r.kind === 'model').length, 32);
  assert.equal(all.filter((r) => r.kind === 'tool').length, 43);
  const models = all.filter((r) => r.kind === 'model').map((r) => r.round);
  assert.deepEqual(models, Array.from({ length: 32 }, (_, i) => i + 1));
  // each check row closes its own try: the row before it belongs to the same try
  all.forEach((r, i) => { if (r.kind === 'check') assert.equal(all[i - 1].try, r.try); });
  assert.ok(all.every((r, i) => i === 0 || r.try >= all[i - 1].try), 'tries never go backwards');
});

test('Round table: the green run is one page (6 model + 6 tool + 1 check = 13 rows); step 2 of mvdg1xo3 restarts at round 1 too', () => {
  const g = getRunRounds('mve5y8fa', { part: idxOf(green, 'step'), all: true }, opts);
  assert.deepEqual([g.totalRows, g.rows.length], [13, 13]);
  assert.deepEqual(g.rows.at(-1), { kind: 'check', round: null, try: 1, time: g.rows.at(-1).time, path: 'output/steps/1.json', sign: '✓', text: '2 passed' });
  const s2 = getRunRounds('mvdg1xo3', { part: idxOf(red, 'step', 1), all: true, limit: 200 }, opts);
  assert.equal(s2.rows[0].round, 1);
  assert.equal(s2.rows[0].try, 1);
  assert.deepEqual([...new Set(s2.rows.map((r) => r.try))], [1, 2, 3], 'the cut-off fourth try ran no model call here, so no row carries it');
  assert.equal(s2.totalRows, 34 + 44 + 3);
});

test('checkRowWords: the words for a check row', () => {
  assert.deepEqual(checkRowWords(1, 1), { sign: '✗', text: '1 failed, 1 passed' });
  assert.deepEqual(checkRowWords(2, 0), { sign: '✓', text: '2 passed' });
});

test('the old per-attempt request still answers for a step (older callers), and a non-step part is untouched by all=1', () => {
  const p = idxOf(red, 'step', 0);
  const a1 = getRunRounds('mvdg1xo3', { part: p, attempt: 1 }, opts);
  assert.equal(a1.mode, undefined);
  assert.ok(a1.rounds.length > 0);
  const scout = idxOf(red, 'scout');
  const sc = getRunRounds('mvdg1xo3', { part: scout, all: true }, opts);
  assert.equal(sc.mode, undefined, 'only a step with graded tries gets the whole-step table');
});

test('review door part (mve5y8fa ends at one): marker, words, and the two human rows; no door on the red run', () => {
  assert.equal(red.parts.some((p) => p.kind === 'door'), false);
  const d = green.parts.at(-1);
  assert.equal(d.kind, 'door');
  assert.equal(d.marker, '[human · ask]');
  assert.equal(d.doorView.head, 'waiting for you');
  assert.equal(d.doorView.last, 'none yet');
  assert.deepEqual(d.doorView.rows.map((r) => [r.path, r.text]), [['output/steps/1.json', 'paused for you']]);
});

test('doorViewOf: accepted, rerun with the person\'s words, paused; there is no "you cancelled"', () => {
  const base = { at: '2026-10-18T20:33:32.000Z', paths: ['output/steps/1.json'], text: null, decidedAt: '2026-10-18T20:41:07.000Z' };
  assert.deepEqual(doorViewOf({ ...base, decision: 'accept' }).rows.map((r) => r.text), ['paused for you', 'you accepted']);
  assert.equal(doorViewOf({ ...base, decision: 'accept' }).last, 'you accepted · 20:41');
  assert.equal(doorViewOf({ ...base, decision: 'rerun', text: 'use the cheaper one' }).rows[1].text, 'you said rerun: "use the cheaper one"');
  assert.equal(doorViewOf({ ...base, decision: 'pause' }).head, 'paused');
  assert.doesNotMatch(JSON.stringify(['accept', 'rerun', 'pause'].map((d) => doorViewOf({ ...base, decision: d, text: 'x' }))), /cancel/);
});

test('a door decision recorded on the spine after the door opened is what the door part shows (accept; rerun with words); one before it is ignored', async () => {
  const { readFileSync, writeFileSync } = await import('node:fs');
  for (const [dec, text, head, rowText] of [['accept', undefined, 'you accepted', 'you accepted'], ['rerun', 'pick the cheaper one', 'you said rerun', 'you said rerun: "pick the cheaper one"']]) {
    const w = makePart5World();
    const lines = readFileSync(w.spine('mve5y8fa'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const last = lines.at(-1).seq;
    lines.splice(1, 0, { type: 'door-decision', decision: 'pause', honoured: true, seq: 1.5, ts: '2026-10-18T18:00:00.000Z' }); // before the door: not its answer
    lines.push({ type: 'door-decision', decision: dec, honoured: true, ...(text ? { text } : {}), seq: last + 1, ts: '2026-10-18T20:41:07.000Z' });
    writeFileSync(w.spine('mve5y8fa'), `${lines.map((e) => JSON.stringify(e)).join('\n')}\n`);
    const d = getRunDetail('mve5y8fa', { home: w.home }).parts.at(-1);
    assert.equal(d.doorView.head, head);
    assert.equal(d.doorView.rows.at(-1).text, rowText);
    assert.match(d.doorView.last, /20:41$/);
  }
});
