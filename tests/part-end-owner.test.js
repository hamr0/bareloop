// hamr 2026-11-26 (rulings 1-4, ITEM33-BUILD Addendum 2026-11-26m): "how did this part / piece / try end" has ONE owner, `endOf` in src/legs.js.
// replay, the panel server and the status table read it. These tests pin the owner's table, the mwuxqx4f leg-3 shape (an ENDED step the money cap
// cut), the strike ladder that must NOT read as a cap, the person's Stop, a provider failure, the continued re-run (ruling 1), the try that keeps
// its own red verdict (ruling 3) and the one provider wording (ruling 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endOf, endKindOfWords, END_WORDS, legsOf } from '../src/legs.js';
import { replayRun } from '../src/replay.js';
import { withStatuses } from '../src/panel/server.js';
import { partStatusFor } from '../src/panel/status.js';

const T = (m, s = 0) => `2026-11-26T10:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.000Z`;
/** @param {Record<string, any>[]} list */
function stamp(list) {
  let seq = 0;
  return list.map((e, i) => ({ ts: T(Math.floor(i / 6), (i % 6) * 5), ...e, seq: (seq += 1) }));
}
const plan = { schema: 'plan-v1', steps: [{ id: 's1' }] };
const jobStart = { type: 'job-start', job: 'j', specHash: 'h', budgetUsd: 1, shape: 'plan', goal: 'g' };
const redEval = { type: 'exit-eval', step: 's1', iteration: 1, results: [{ type: 'check-passes', pass: false, detail: 'close: x: nope' }] };
/** a leg whose step 's1' got one red verdict, began a second try, and was ended by `tail` (the halting records) then a step-end escalated */
const cutStep = (/** @type {any[]} */ tail, /** @type {string} */ jobOutcome, /** @type {any[]} */ after = []) => [
  jobStart, { type: 'plan-accepted', plan }, { type: 'step-start', step: 's1' },
  { type: 'iteration-start', iteration: 1 }, redEval, { type: 'iteration-start', iteration: 2 },
  ...tail,
  { type: 'run-end', outcome: 'escalated' }, { type: 'step-end', step: 's1', outcome: 'escalated' },
  ...after,
  { type: 'job-end', outcome: jobOutcome },
];
const leg2Green = [
  { type: 'leg-resume', leg: 2, after: 'x' }, jobStart,
  { type: 'step-start', step: 's1' }, { type: 'step-end', step: 's1', outcome: 'green' },
  { type: 'job-end', outcome: 'green' },
];
const moneyCap = [{ type: 'escalation', category: 'cap-halt', decision: 'cap' }];
const ladder = [{ type: 'escalation', category: 'cap-halt', spend: { strikes: 2, strikeLimit: 2 } }];

test('endOf: one case per end kind, words only from the one table', () => {
  const legOf = (/** @type {any[]} */ recs) => legsOf(stamp(recs))[0];
  const esc = (/** @type {string} */ category, /** @type {any} */ extra = {}) => ({ type: 'escalation', category, ...extra });
  const own = { green: false, outcome: 'escalated' };
  // passed / failed
  assert.deepEqual(endOf({ own: { green: true, outcome: 'green' } }), { end: 'passed', cutBy: 'own-end', words: null, ladder: false });
  assert.equal(endOf({ own: { green: false, outcome: 'escalated' } }).end, 'failed');
  // the person's Stop
  assert.equal(endOf({ own, trip: esc('stopped') }).words, END_WORDS.stopped);
  // a money cap: the escalation is its leg's last and the leg carries a money-halt (job-end cap-halt)
  const moneyLeg = legOf([jobStart, esc('cap-halt'), { type: 'money-halt' }, { type: 'job-end', outcome: 'cap-halt' }]);
  const moneyEsc = moneyLeg.records.find((r) => r.type === 'escalation');
  assert.deepEqual(endOf({ own, trip: moneyEsc, leg: moneyLeg }), { end: 'capped-money', cutBy: 'own-end', words: 'money cap', ladder: false });
  // the strike ladder's own cap-halt (earlier in a leg that later ended on a money cap, and in a leg that ended step-red) is NOT a cap
  const ladderLeg = legOf([jobStart, esc('cap-halt', { spend: { strikes: 2 } }), { type: 'job-end', outcome: 'step-red' }]);
  assert.deepEqual(endOf({ own, trip: ladderLeg.records.find((r) => r.type === 'escalation'), leg: ladderLeg }), { end: 'failed', cutBy: 'own-end', words: null, ladder: true });
  const twoLeg = legOf([jobStart, esc('cap-halt', { spend: { strikes: 2 } }), esc('cap-halt'), { type: 'money-halt' }, { type: 'job-end', outcome: 'cap-halt' }]);
  assert.equal(endOf({ own, trip: twoLeg.records.filter((r) => r.type === 'escalation')[0], leg: twoLeg }).end, 'failed', 'an earlier ladder escalation in a capped leg stays a ladder');
  // a time cap
  assert.deepEqual(endOf({ own, trip: esc('wall-halt') }), { end: 'capped-time', cutBy: 'own-end', words: 'time cap', ladder: false });
  // a provider failure, a stall, a check timeout: only when the window's own escalation is its leg's end
  for (const [cat, outcome, kind] of /** @type {[string, string, string][]} */ ([['provider-red', 'provider-red', 'provider'], ['step-stalled', 'step-stalled', 'stalled'], ['check-timeout', 'check-timeout', 'check-timeout']])) {
    const leg = legOf([jobStart, esc(cat), { type: 'job-end', outcome }]);
    assert.equal(endOf({ own, trip: leg.records.find((r) => r.type === 'escalation'), leg }).end, kind, cat);
  }
  // no end of its own: the leg's end cuts it; a single-leg run is cut only by a cap; died / open are the caller's flags
  const stoppedLeg = legOf([jobStart, { type: 'job-end', outcome: 'stopped' }]);
  assert.equal(endOf({ leg: stoppedLeg, cutBy: 'leg' }).words, 'you stopped it');
  assert.equal(endOf({ leg: legOf([jobStart, { type: 'job-end', outcome: 'plan-red' }]), cutBy: 'leg' }).words, 'plan-red', 'a raw outcome stays its own words');
  assert.equal(endOf({ leg: legOf([jobStart, { type: 'job-end', outcome: 'provider-red' }]), cutBy: 'leg' }).words, END_WORDS.provider);
  assert.equal(endOf({ leg: legOf([jobStart]), cutBy: 'leg' }).end, 'died', 'a cut leg with no end recorded died');
  assert.equal(endOf({ leg: moneyLeg, cutBy: 'single-leg' }).end, 'capped-money');
  assert.equal(endOf({ leg: stoppedLeg, cutBy: 'single-leg' }).end, 'open', 'only a cap cuts the open step of a one-leg run');
  assert.equal(endOf({ died: true }).words, 'died');
  assert.deepEqual(endOf({ live: true }), { end: 'open', cutBy: 'window', words: null, ladder: false });
  // the words table reads back
  for (const [kind, words] of Object.entries(END_WORDS)) assert.equal(endKindOfWords(words), kind);
  assert.equal(endKindOfWords('plan-red'), 'failed');
  assert.equal(endKindOfWords(null), null);
});

test('the mwuxqx4f leg-3 shape: an ENDED step the money cap cut reads capped, its re-run is the same step continued', () => {
  const recs = stamp([...cutStep(moneyCap, 'cap-halt', [{ type: 'money-halt', budgetUsd: 1 }]), ...leg2Green]);
  const s = replayRun(recs, [], { runId: 'r1' });
  const [a, b] = s.parts.filter((p) => p.kind === 'step');
  assert.equal(a.stopReason, 'money cap');
  assert.equal(partStatusFor(a).key, 'capped');
  assert.equal(b.continued, true, 'ruling 1: the re-run is the same step');
  assert.equal(b.tryNumber, 1);
  assert.equal(s.steps.filter((u) => u.id === 's1').length, 2);
});

test('ruling 3: the try with its own red verdict keeps failed; only the try the cap cut off reads capped; the whole step reads capped', () => {
  const recs = stamp([...cutStep(moneyCap, 'cap-halt', [{ type: 'money-halt', budgetUsd: 1 }]), ...leg2Green]);
  const part = replayRun(recs, [], { runId: 'r1' }).parts.find((p) => p.kind === 'step');
  assert.ok(part.cutOffTry, 'the second try began and never reached its checks');
  const tries = [...part.attempts.map((x) => ({ outcome: x.outcome, cutOff: false })), { outcome: null, cutOff: true }];
  const minted = withStatuses({ ...part, tries }, false, 'passed', false);
  assert.equal(minted.status.key, 'capped');
  assert.equal(minted.attempts[0].status.key, 'failed');
  assert.equal(minted.tries[0].status.key, 'failed');
  assert.equal(minted.tries[1].status.key, 'capped');
});

test('a strike-ladder cap-halt step (spend.strikes, no money-halt) stays failed with no stop reason and its re-run is a retry', () => {
  const recs = stamp([...cutStep(ladder, 'step-red'), ...leg2Green]);
  const s = replayRun(recs, [], { runId: 'r1' });
  const [a, b] = s.parts.filter((p) => p.kind === 'step');
  assert.equal(a.stopReason, null);
  assert.equal(a.tripped.ladder, true);
  assert.equal(partStatusFor(a).key, 'failed');
  assert.equal(b.continued, false);
  assert.equal(b.tryNumber, 2);
});

test('the person\'s Stop on an ended step reads stopped and its re-run is continued (F405 unchanged)', () => {
  const recs = stamp([...cutStep([{ type: 'escalation', category: 'stopped' }], 'stopped'), ...leg2Green]);
  const [a, b] = replayRun(recs, [], { runId: 'r1' }).parts.filter((p) => p.kind === 'step');
  assert.equal(a.stopReason, 'you stopped it');
  assert.equal(partStatusFor(a).key, 'stopped');
  assert.equal(b.continued, true);
});

test('a provider failure that ended a step: ONE wording (ruling 4), the part stays failed, the re-run is continued', () => {
  const recs = stamp([...cutStep([{ type: 'escalation', category: 'provider-red', detail: 'x' }], 'provider-red'), ...leg2Green]);
  const [a, b] = replayRun(recs, [], { runId: 'r1' }).parts.filter((p) => p.kind === 'step');
  assert.equal(a.stopReason, 'the model provider failed');
  assert.equal(partStatusFor(a).key, 'failed');
  assert.equal(b.continued, true);
});

test('a time cap (wall-halt) that ended a step reads capped, its re-run continued', () => {
  const recs = stamp([...cutStep([{ type: 'escalation', category: 'wall-halt' }], 'wall-halt'), ...leg2Green]);
  const [a, b] = replayRun(recs, [], { runId: 'r1' }).parts.filter((p) => p.kind === 'step');
  assert.equal(a.stopReason, 'time cap');
  assert.equal(partStatusFor(a).key, 'capped');
  assert.equal(b.continued, true);
});

test('a single-leg run: its last step ended by the money cap reads capped without any server-side special case', () => {
  const recs = stamp(cutStep(moneyCap, 'cap-halt', [{ type: 'money-halt', budgetUsd: 1 }]));
  const part = replayRun(recs, [], { runId: 'r1' }).parts.find((p) => p.kind === 'step');
  assert.equal(part.stopReason, 'money cap');
  assert.equal(withStatuses(part, true, 'capped', false).status.key, 'capped');
});
