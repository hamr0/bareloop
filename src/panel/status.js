// PANEL status words — ONE code-owned table (sign -> word) and ONE writer of "which word does this run wear".
// hamr's ruling 2026-10-04 (option A): every surface (run cards, expanded run rows, the right-side header, imported
// rows) reads `status` from the server; the page never maps an outcome to a word itself.
//
//   [▶] running · [·] waiting · [✓] passed · [✗] failed · [■] capped · [■] stopped · [?] died
//   (capped wears the stop sign ■ like stopped, hamr 2026-11-24; the word stays "capped". check-timeout and provider-red stay failed ✗.)
//
// Outcome -> word (every outcome the panel knows; anything not listed is `failed`):
//   green, already-green, satisfied                      -> passed
//   no job-end, runner alive (or starting)               -> running
//   no job-end, runner gone (died)                       -> died
//   cap-halt, wall-halt                                  -> capped   (money cap / time cap)
//   escalated + money-halt record, escalated + wall-halt -> capped
//   stopped (the person pressed Stop)                    -> stopped
//   skipped (a Tickets job's signed filter let the ticket by)  -> skipped  (a quiet end: not a failure, not a pass, never reusable or Needs you)
//   plan-red, check-red, step-red, escalated (strikes / provider / other), close-red, provider-red, check-timeout, step-stalled,
//   and every other outcome (refusals, instrument stops)  -> failed
// `waiting` is the step-level sign for a step that has not started; no run outcome maps to it.

import { capKindOf, endKindOfWords, endOf } from '../legs.js';

/** the owner's end kind (src/legs.js endOf) -> the status table key; ONE table, no new sign or word */
export const END_TO_KEY = Object.freeze({
  passed: 'passed', failed: 'failed', stopped: 'stopped', 'capped-money': 'capped', 'capped-time': 'capped', provider: 'failed', stalled: 'failed', 'check-timeout': 'failed', died: 'died', open: 'running',
});

/** the sentence a passed run carries as its reason (the Ended block's `line`) */
export const GOAL_MET_LINE = 'goal met';

/**
 * THE ONE OWNER of "this run's outcome is a green" (green or already-green): every src site that asks it calls this, and
 * test (d) in tests/already-green-delivers.test.js fails on a hand-spelled copy. Also the spelling of "a green that can be reused" (the Reuse picker, the Reuse start/prefill, the Ended block's
 * next line). hamr 2026-10-15: an `already-green` (fixed before any work) counts. `satisfied` is a close verdict, never a run outcome.
 * The SCHEDULE gate (schedules.js greenFor) deliberately stays on a real `green` only (T3).
 * @param {string|null|undefined} outcome
 * @returns {boolean}
 */
export function isReusableGreen(outcome) {
  return outcome === 'green' || outcome === 'already-green';
}

/** @typedef {'running'|'waiting'|'passed'|'failed'|'capped'|'stopped'|'died'|'skipped'} StatusKey */

/** the table: key -> sign + word */
export const STATUS = Object.freeze({
  running: Object.freeze({ sign: '▶', word: 'running' }),
  waiting: Object.freeze({ sign: '·', word: 'waiting' }),
  passed: Object.freeze({ sign: '✓', word: 'passed' }),
  failed: Object.freeze({ sign: '✗', word: 'failed' }),
  capped: Object.freeze({ sign: '■', word: 'capped' }),
  stopped: Object.freeze({ sign: '■', word: 'stopped' }),
  died: Object.freeze({ sign: '?', word: 'died' }),
  // a ticket the job's signed filter did not let through (piece 2): grey, rests, ends at run start at $0
  skipped: Object.freeze({ sign: '–', word: 'skipped' }),
});

/** a close stage the run's LATEST close never reached (it stops at the first red): the [·] sign, grey, never the precheck's old reading. Beside STATUS, not in it: it is a stage's standing, never a run's status */
export const NOT_REACHED = Object.freeze({ sign: '·', word: 'not reached' });

/**
 * The plain words a skipped run carries (the `settled` event's `words`, the Ended line), from CODE. They do NOT repeat the status word: every surface prints `skipped — <words>` from the table's word (the CLI line adds its own `skipped:`): the filter decision's own reason, never model-written.
 * `reason` is `decideTicket`'s ('closed' | 'priority P3, not P1' | 'no P1 label' | 'no bug label'); `filter` is the job's signed `ticketFilter`, which tells a missing
 * priority label from a missing type label (the two share the `no X label` spelling).
 * @param {string} reason @param {{priority?: string[], labels?: string[]}|undefined} filter @returns {string}
 */
export function skipWords(reason, filter) {
  if (reason === 'closed') return 'the ticket is closed';
  const m = /^no (.+) label$/.exec(reason);
  if (m && filter?.priority?.length && m[1] === filter.priority.join(' or ')) return `no ${m[1]} label on the ticket`;
  if (m) return `label ${m[1]} not on the ticket`;
  return reason;
}

/**
 * The status of one run.
 * @param {{outcome: string|null|undefined, died?: boolean, category?: string|null, moneyHalt?: boolean}} o
 *   `category` is the last escalation's category; `moneyHalt` is whether the spine carries a `money-halt` record
 * @returns {{key: StatusKey, sign: string, word: string}}
 */
export function statusFor(o) {
  /** @type {StatusKey} */
  let key = 'failed';
  const out = o.outcome;
  if (o.died) key = 'died';
  else if (out === null || out === undefined) key = 'running';
  else if (isReusableGreen(out) || out === 'satisfied') key = 'passed';
  else if (out === 'skipped') key = 'skipped';
  else if (capKindOf(o) !== null) key = 'capped';
  else if (out === 'stopped') key = 'stopped';
  return { key, ...STATUS[key] };
}

/**
 * The word one PART of a run wears on the step map, the step cards and the Audit rows (hamr 2026-10-07: `[✓] passed` /
 * `[✗] failed`, never "done"). Reads the same table; ONE owner of the part's sign + word (hamr 2026-11-26: no per-case patches).
 *   drafting, green/satisfied/already-green outcome, or a part that simply happened (scout/plan/replan/judge) -> passed
 *   the live part (`live`: last part of a running run, no outcome, no `stopReason`) -> running
 *   a part its leg's halt (or the run's cap) cut off (`stopReason`) and that did not pass: 'money cap' / 'time cap' -> capped (on ANY outcome, a fix
 *     piece ends `red`, a step `escalated`), 'you stopped it' -> stopped (on an `escalated` step), 'died' -> died
 *   a red outcome -> its run-outcome word (failed; a cap/stop outcome keeps capped/stopped)
 *   no outcome, a `stopReason`: provider failed, step stalled, a raw outcome -> failed
 * @param {{kind?: string, outcome?: string|null, stopReason?: string|null}} part
 * @param {{live?: boolean}} [ctx]
 * @returns {{key: StatusKey, sign: string, word: string}}
 */
export function partStatusFor(part, ctx = {}) {
  if (part.kind === 'drafting') return statusFor({ outcome: 'green' });
  const kind = endKindOfWords(part.stopReason);
  const isCap = kind === 'capped-money' || kind === 'capped-time';
  const passedOutcome = isReusableGreen(part.outcome) || part.outcome === 'satisfied';
  // a step or piece a cap ended wears the cap word whatever outcome it carries (src/legs.js endOf)
  if (isCap && typeof part.outcome === 'string' && !passedOutcome) return { key: 'capped', ...STATUS.capped };
  // a step the person stopped ends `escalated` too (src/replay.js: its own escalation was `stopped`)
  if (part.outcome === 'escalated' && kind === 'stopped') return { key: 'stopped', ...STATUS.stopped };
  if (typeof part.outcome === 'string') return statusFor({ outcome: part.outcome });
  if (kind !== null) {
    const key = END_TO_KEY[kind];
    return { key, ...STATUS[key] };
  }
  if (ctx.live) return { key: 'running', ...STATUS.running };
  return statusFor({ outcome: 'green' });
}

/**
 * The sign + word one ATTEMPT (a step's try, a fix try, a graded try) wears: the same table, the same one owner as {@link partStatusFor}.
 * `a.outcome` green -> passed. A try no close ended (`a.stop` names what ended it, `a.noVerdict`, or the leg cut it off: `a.cutOff` / the replay's
 * outcome 'stopped') takes its end from its OWN stop first, else from the part's `stopReason`: a cap -> capped, the person's Stop -> stopped.
 * A no-verdict try with no such end keeps the existing `died` entry (sign ?, as before). An open try of the live part -> running.
 * @param {{outcome?: string|null, stop?: {by?: string, what?: string|null}|null, noVerdict?: string|null, cutOff?: boolean}} a
 * @param {{stopReason?: string|null}} part the part carrying it, its `stopReason` already resolved
 * @param {{live?: boolean, runCapped?: boolean}} [ctx] `live` the part is running, `runCapped` the run itself ended on its money cap
 * @returns {{key: StatusKey, sign: string, word: string}}
 */
export function attemptStatusFor(a, part, ctx = {}) {
  /** @param {StatusKey} key */
  const pick = (key) => ({ key, ...STATUS[key] });
  if (a.outcome === 'green') return pick('passed');
  const partKind = endKindOfWords(part.stopReason ?? null);
  const partCap = partKind === 'capped-money' || partKind === 'capped-time';
  const what = a.stop?.what ?? null;
  const noVerdict = a.cutOff === true || (typeof a.noVerdict === 'string' && a.noVerdict !== '') || a.stop != null;
  const cutByPart = a.cutOff === true || a.outcome === 'stopped';
  // the try's own stop first: its boundary is read by the owner, a `cap-halt` being the money cap only when the run (or the part) ended on it
  const own = a.stop == null ? null : endOf({ own: { green: false, outcome: 'escalated' }, trip: { category: what }, legCap: ctx.runCapped === true || partKind === 'capped-money' ? 'money' : null }).end;
  if (own === 'capped-money' || own === 'capped-time') return pick('capped');
  if (own === 'stopped') return pick('stopped');
  if (a.stop == null && cutByPart) {
    if (partCap) return pick('capped');
    if (partKind === 'stopped') return pick('stopped');
  }
  if (noVerdict) return pick('died');
  if (a.outcome === null || a.outcome === undefined) return pick(ctx.live === true ? 'running' : 'died');
  return pick('failed');
}

/**
 * PRD v1.106 Part 5 (C, choice 9): the review door's words, ONE table. The door is the only human step bareloop has; there is no "you
 * cancelled" (cancel is deleted). `decision` is the spine's `door-decision.decision`, or null while nothing has been decided.
 */
export const DOOR_WORDS = Object.freeze({
  waiting: Object.freeze({ head: 'waiting for you', row: 'paused for you', last: 'none yet' }),
  accept: Object.freeze({ head: 'you accepted', row: 'you accepted', last: 'you accepted' }),
  rerun: Object.freeze({ head: 'you said rerun', row: 'you said rerun', last: 'you said rerun' }),
  pause: Object.freeze({ head: 'paused', row: 'paused', last: 'paused' }),
});

/**
 * The words one door wears: header phrase, the `last answer:` line (with the time `HH:MM` once decided) and the table rows.
 * @param {{at: string|null, paths: string[], decision: string|null, text: string|null, decidedAt: string|null}} door
 * @returns {{ head: string, last: string, rows: Array<{path: string|null, text: string, time: string|null}> }}
 */
export function doorViewOf(door) {
  const key = door.decision === 'accept' || door.decision === 'rerun' || door.decision === 'pause' ? door.decision : 'waiting';
  const w = DOOR_WORDS[key];
  const path = door.paths.length === 0 ? null : door.paths.join(', ');
  const hhmm = (/** @type {string|null} */ iso) => (iso && /T(\d\d:\d\d)/.exec(iso)?.[1]) || null;
  const said = key === 'rerun' && door.text ? `${w.row}: "${door.text}"` : w.row;
  /** @type {Array<{path: string|null, text: string, time: string|null}>} */
  const rows = [{ path, text: DOOR_WORDS.waiting.row, time: door.at }];
  if (key !== 'waiting') rows.push({ path, text: said, time: door.decidedAt });
  const when = hhmm(door.decidedAt);
  const last = key === 'waiting' ? w.last : `${key === 'rerun' && door.text ? said : w.last}${when ? ` · ${when}` : ''}`;
  return { head: w.head, last, rows };
}

/** the marker a part wears for who did its work (PRD v1.106 Part 5 C/G): the model, or a person asked */
export const ACTOR_MARKER = Object.freeze({ model: '[model]', human: '[human · ask]' });
