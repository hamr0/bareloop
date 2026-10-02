// P5-R — `legsOf`, the ONE owner of leg boundaries (src/legs.js), and the torn-line rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { legsOf, legsWallMs, parseSpineText, LEG_RESUME } from '../src/legs.js';

const base = mkdtempSync(join(tmpdir(), 'legs-'));
process.on('exit', () => rmSync(base, { recursive: true, force: true }));

const at = (min) => `2026-10-02T10:${String(min).padStart(2, '0')}:00.000Z`;
/** a two-leg spine: leg 1 cap-halts at 10:20, the person comes back at 14:00, leg 2 greens at 14:10 */
const twoLeg = () => [
  { type: 'job-start', job: 'j', budgetUsd: 8, ts: at(0), seq: 1 },
  { type: 'worker-round', kind: 'turn', costUsd: 3, ts: at(5), seq: 2 },
  { type: 'job-end', outcome: 'cap-halt', spentUsd: 3, spendComplete: true, ts: at(20), seq: 3 },
  { type: LEG_RESUME, leg: 2, after: 'cap-halt', ts: '2026-10-02T14:00:00.000Z', seq: 4 },
  { type: 'job-start', job: 'j', budgetUsd: 8, priorSpentUsd: 3, ts: '2026-10-02T14:00:01.000Z', seq: 5 },
  { type: 'worker-round', kind: 'turn', costUsd: 2, ts: '2026-10-02T14:05:00.000Z', seq: 6 },
  { type: 'job-end', outcome: 'green', spentUsd: 5, spendComplete: true, ts: '2026-10-02T14:10:00.000Z', seq: 7 },
];

test('P5-R legsOf splits a two-leg spine at the marker and names how the first leg ended', () => {
  const legs = legsOf(twoLeg());
  assert.equal(legs.length, 2);
  assert.deepEqual(legs.map((l) => l.leg), [1, 2]);
  assert.equal(legs[0].records.length, 3);
  assert.equal(legs[1].records.length, 4, 'the marker belongs to the leg it opens');
  assert.equal(legs[1].start.type, LEG_RESUME);
  assert.equal(legs[0].outcome, 'cap-halt');
  assert.equal(legs[1].outcome, 'green', 'the outcome of a run is the LAST leg\'s');
  assert.equal(legs[0].after, null);
  assert.equal(legs[1].after, 'cap-halt');
  assert.equal(legs[1].jobStart.priorSpentUsd, 3);
});

test('P5-R a leg that recorded no terminal reads as died; a $0 refusal (run-end) reads as its own outcome', () => {
  const ev = [
    { type: 'job-start', ts: at(0), seq: 1 },
    { type: 'worker-round', costUsd: 1, ts: at(1), seq: 2 },
    { type: LEG_RESUME, leg: 2, ts: at(30), seq: 3 },
    { type: 'run-end', outcome: 'escalated', ts: at(31), seq: 4 },
    { type: LEG_RESUME, leg: 3, ts: at(40), seq: 5 },
  ];
  const legs = legsOf(ev);
  assert.deepEqual(legs.map((l) => l.outcome), [null, 'escalated', null]);
  assert.equal(legs[1].after, 'died', 'leg 1 recorded no terminal');
  assert.equal(legs[2].after, 'escalated', 'derived from the previous leg when the marker declares none');
});

test('P5-R an old single-leg spine is ONE leg, byte-for-byte its own records (no marker, nothing changes)', () => {
  const old = twoLeg().slice(0, 3);
  const legs = legsOf(old);
  assert.equal(legs.length, 1);
  assert.deepEqual(legs[0].records, old);
  assert.equal(legs[0].after, null);
  // an old SPLIT run's second file (priorSpentUsd on its job-start, no marker) is also one leg
  const split = twoLeg().slice(4);
  assert.equal(legsOf(split).length, 1);
  assert.deepEqual(legsOf([]), []);
});

test('P5-R legsWallMs sums each leg\'s own window — the gap between legs is never counted', () => {
  const w = legsWallMs(legsOf(twoLeg()));
  // leg 1: 10:00 -> 10:20 = 20min. leg 2: 14:00:00 -> 14:10:00 = 10min. The 3h40 gap is nobody's.
  assert.equal(w.ms, 30 * 60_000);
  assert.equal(w.complete, true);
  assert.equal(legsWallMs([]).ms, null, 'unknown is never 0');
  const noStamps = legsOf([{ type: 'job-start' }, { type: 'job-end', outcome: 'green' }]);
  assert.equal(legsWallMs(noStamps).ms, null);
});

test('P5-R parseSpineText: one torn line directly before a leg-resume is tolerated and named; the same line mid-file without a marker is corrupt', () => {
  const lines = twoLeg().map((e) => JSON.stringify(e));
  const torn = '{"type":"worker-round","kind":"tur';
  const withTorn = [...lines.slice(0, 3), torn, ...lines.slice(3)].join('\n') + '\n';
  const r = parseSpineText(withTorn);
  assert.equal(r.corrupt, null);
  assert.deepEqual(r.tolerated, [{ line: 4, why: 'before-leg-resume' }]);
  assert.equal(r.records.length, 7, 'the torn bytes are not a record');
  assert.equal(legsOf(r.records).length, 2);

  const midFile = [...lines.slice(0, 2), torn, ...lines.slice(2)].join('\n') + '\n';
  const m = parseSpineText(midFile);
  assert.equal(m.corrupt?.line, 3, 'a torn line NOT before a marker, and not at the tail, is a corrupt log');

  const two = [...lines.slice(0, 3), torn, torn, ...lines.slice(3)].join('\n') + '\n';
  assert.equal(parseSpineText(two).corrupt?.line, 4, 'exactly ONE torn line is the resume shape; two in a row is not');
});

test('P5-R parseSpineText keeps the older tail rule: a torn FINAL line is tolerated', () => {
  const lines = twoLeg().slice(0, 3).map((e) => JSON.stringify(e));
  const r = parseSpineText(`${lines.join('\n')}\n{"type":"worker-ro`);
  assert.equal(r.corrupt, null);
  assert.deepEqual(r.tolerated, [{ line: 4, why: 'tail' }]);
});

test('P5-R a REAL child process killed mid-append leaves a torn line that a following marker isolates', async () => {
  const f = join(base, 'killed.jsonl');
  writeFileSync(f, `${twoLeg().slice(0, 2).map((e) => JSON.stringify(e)).join('\n')}\n`);
  // the child writes HALF a record with a real write(2) and then waits to be killed: exactly the bytes a
  // SIGKILL mid-appendFileSync leaves behind
  const child = spawn(process.execPath, ['-e', `
    const fs = require('node:fs');
    const fd = fs.openSync(${JSON.stringify(f)}, 'a');
    fs.writeSync(fd, '{"type":"worker-round","kind":"turn","costUsd":9,"ts":"2026');
    process.stdout.write('half\\n');
    setInterval(() => {}, 1000);
  `], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => { child.stdout.on('data', res); child.on('error', rej); });
  child.kill('SIGKILL');
  await new Promise((res) => child.on('exit', res));
  const before = readFileSync(f, 'utf8');
  assert.ok(!before.endsWith('\n'), 'the file really ends mid-line');
  // what the resume writer does: one \n, then the marker — never an edit of the torn bytes
  appendFileSync(f, `\n${JSON.stringify({ type: LEG_RESUME, leg: 2, after: 'died', ts: at(50), seq: 4 })}\n`);
  assert.ok(readFileSync(f, 'utf8').startsWith(before), 'every existing byte is still there');
  const r = parseSpineText(readFileSync(f, 'utf8'));
  assert.equal(r.corrupt, null);
  assert.equal(r.tolerated[0]?.why, 'before-leg-resume');
  const legs = legsOf(r.records);
  assert.equal(legs.length, 2);
  assert.equal(legs[1].after, 'died');
  assert.equal(legs[0].records.some((x) => x.costUsd === 9), false, 'the half record was never a record');
});
