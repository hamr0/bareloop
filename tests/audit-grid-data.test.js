// The Audit grid's data (build spec A1-A3): the fix part's tries carry the failing check's output lines, where each try came from and, for a try
// no close ended, what ended it. Real spine: tests/fixtures/audit-grid (the live run mvtatlxw); the cut-off step try is the part5 fixture's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replayRun } from '../src/replay.js';
import { getRunDetail, getRunRounds } from '../src/panel/server.js';
import { makeAuditGridWorld, RUNID } from './audit-grid-world.mjs';
import { makePart5World } from './part5-world.mjs';

const spine = readFileSync(new URL(`./fixtures/audit-grid/u-${RUNID}.jsonl`, import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const fixOf = (/** @type {any} */ parts) => parts.find((/** @type {any} */ p) => p.kind === 'fix');

test('replay: a fix try carries the failing stage output lines (after the stageGap header), its source, and no stop', () => {
  const fix = fixOf(replayRun(spine).parts);
  assert.equal(fix.attempts.length, 4);
  const [opening, iter1, iter2] = fix.attempts;
  assert.equal(opening.source, 'outer-close');
  assert.equal(iter1.source, 'iteration');
  assert.ok(opening.reasons.length > 1, 'the opening close red has its lines');
  assert.equal(opening.reasons[0], 'close: typecheck-clean-exit: "npx tsc --noEmit --strict" exited 2, expected 0');
  assert.ok(!opening.reasons.some((l) => l.startsWith('close stage ')), 'the stageGap header line is not a reason');
  assert.match(iter1.reasons[0], /^close: typecheck-clean-exit: /);
  assert.match(iter2.reasons[0], /^close: no-suppressions: 11 forbidden pattern occurrence/);
  assert.equal(opening.stop, null);
  assert.equal(iter2.stop, null);
});

test('replay: a try the provider ended (an escalation, no close) has no lines and says what ended it', () => {
  const last = fixOf(replayRun(spine).parts).attempts[3];
  assert.deepEqual(last.reasons, []);
  assert.deepEqual(last.stop, { by: 'escalation', what: 'provider-red', detail: 'socket hang up' });
  assert.equal(last.stages, null);
});

test('panel: fix tries worded for the page: lines without the close prefix, the opening close first, the no-verdict words from the one table', () => {
  const world = makeAuditGridWorld();
  const fix = fixOf(getRunDetail(RUNID, world.opts).parts);
  assert.equal(fix.attempts[0].reasons[0], '"npx tsc --noEmit --strict" exited 2, expected 0');
  assert.equal(fix.attempts[0].reasons.length, 40);
  assert.equal(fix.attempts[2].reasons[0], '11 forbidden pattern occurrence(s) in lines this run ADDED');
  assert.equal(fix.attempts[2].reasons[1], '[cast] src/backup.js:175: const e = /** @type {Error} */ (err);', 'only the close: prefix is cut');
  assert.equal(fix.attempts[0].reasons[1], "src/backup.js(21,19): error TS7006: Parameter 'now' implicitly has an 'any' type.", 'a file path stays (a step\'s reasonsOf cut drops it)');
  assert.ok(fix.attempts.every((a) => a.reasons.every((l) => !l.startsWith('close:'))), 'no line keeps its close: prefix');
  const step = getRunDetail(RUNID, world.opts).parts.filter((p) => p.kind === 'step')[2];
  const stepLines = step.attempts[0].checks.find((c) => !c.pass).reasons;
  assert.ok(stepLines.some((l) => /^error TS\d+: /.test(l)) && !stepLines.some((l) => /^src\/checks\.js\(/.test(l)), 'step reasons are unchanged: their path-dropping cut stays');
  assert.equal(fix.attempts[0].noVerdict, undefined);
  assert.equal(fix.attempts[3].noVerdict, 'provider dropped (socket hang up), no check ran');
  assert.equal(fix.attempts[3].thinking, 'thinking on');
  assert.equal(fix.attempts[0].thinking, undefined, 'the opening close made no model call, so it has no thinking words');
});

test('rounds: the existing per-attempt endpoint also serves a step try that was cut off (it is no graded attempt) with no check line, and 404s past it', () => {
  const world = makePart5World();
  const d = getRunDetail('mvdg1xo3', { home: world.home });
  const idx = d.parts.map((p, i) => [p, i]).filter(([p]) => p.kind === 'step')[1][1];
  const part = d.parts[idx];
  const cut = part.tries.find((t) => t.cutOff);
  assert.ok(cut, 'step 2 of mvdg1xo3 has a cut-off try');
  const page = getRunRounds('mvdg1xo3', { part: idx, attempt: cut.n }, { home: world.home });
  assert.ok(page, 'the window is served (this real try was cut off right as it began: it has no rounds yet)');
  assert.equal(page.totalRounds, 0);
  assert.equal(page.attempt, cut.n);
  assert.equal(page.check, null);
  const graded = getRunRounds('mvdg1xo3', { part: idx, attempt: 1 }, { home: world.home });
  assert.ok(graded.check && graded.check.outcome, 'a graded try keeps its check line');
  assert.equal(getRunRounds('mvdg1xo3', { part: idx, attempt: cut.n + 1 }, { home: world.home }), null);
});
