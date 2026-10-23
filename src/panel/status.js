// PANEL status words — ONE code-owned table (sign -> word) and ONE writer of "which word does this run wear".
// hamr's ruling 2026-10-04 (option A): every surface (run cards, expanded run rows, the right-side header, imported
// rows) reads `status` from the server; the page never maps an outcome to a word itself.
//
//   [▶] running · [·] waiting · [✓] passed · [✗] failed · [✗] capped · [■] stopped · [?] died
//
// Outcome -> word (every outcome the panel knows; anything not listed is `failed`):
//   green, already-green, satisfied                      -> passed
//   no job-end, runner alive (or starting)               -> running
//   no job-end, runner gone (died)                       -> died
//   cap-halt, wall-halt                                  -> capped   (money cap / time cap)
//   escalated + money-halt record, escalated + wall-halt -> capped
//   stopped (the person pressed Stop)                    -> stopped
//   plan-red, check-red, step-red, escalated (strikes / provider / other), close-red, provider-red, step-stalled,
//   and every other outcome (refusals, instrument stops)  -> failed
// `waiting` is the step-level sign for a step that has not started; no run outcome maps to it.

import { capKindOf } from '../legs.js';

/** the sentence a passed run carries as its reason (the Ended block's `line`) */
export const GOAL_MET_LINE = 'goal met';

/**
 * ONE spelling of "this run's outcome is a green that can be reused" (the Reuse picker, the Reuse start/prefill, the Ended block's
 * next line). hamr 2026-10-15: an `already-green` (fixed before any work) counts. `satisfied` is a close verdict, never a run outcome.
 * The SCHEDULE gate (schedules.js greenFor) deliberately stays on a real `green` only (T3).
 * @param {string|null|undefined} outcome
 * @returns {boolean}
 */
export function isReusableGreen(outcome) {
  return outcome === 'green' || outcome === 'already-green';
}

/** @typedef {'running'|'waiting'|'passed'|'failed'|'capped'|'stopped'|'died'} StatusKey */

/** the table: key -> sign + word */
export const STATUS = Object.freeze({
  running: Object.freeze({ sign: '▶', word: 'running' }),
  waiting: Object.freeze({ sign: '·', word: 'waiting' }),
  passed: Object.freeze({ sign: '✓', word: 'passed' }),
  failed: Object.freeze({ sign: '✗', word: 'failed' }),
  capped: Object.freeze({ sign: '✗', word: 'capped' }),
  stopped: Object.freeze({ sign: '■', word: 'stopped' }),
  died: Object.freeze({ sign: '?', word: 'died' }),
});

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
  else if (out === 'green' || out === 'already-green' || out === 'satisfied') key = 'passed';
  else if (capKindOf(o) !== null) key = 'capped';
  else if (out === 'stopped') key = 'stopped';
  return { key, ...STATUS[key] };
}

/**
 * The word one PART of a run wears on the step map, the step cards and the Audit rows (hamr 2026-10-07: `[✓] passed` /
 * `[✗] failed`, never "done"). Reads the same table; `running` is the page's call (it knows which part is live), so a
 * part with no verdict and no cut-off is `passed` here.
 *   drafting, green/satisfied/already-green outcome, or a part that simply happened (scout/plan/replan/judge) -> passed
 *   a red outcome -> its run-outcome word (failed; a cap/stop outcome keeps capped/stopped)
 *   a part its leg's halt cut off (`stopReason`): 'money cap' / 'time cap' -> capped, 'you stopped it' -> stopped,
 *     'died' -> died, anything else (provider failed, step stalled, a raw outcome) -> failed
 * @param {{kind?: string, outcome?: string|null, stopReason?: string|null}} part
 * @returns {{key: StatusKey, sign: string, word: string}}
 */
export function partStatusFor(part) {
  if (part.kind === 'drafting') return statusFor({ outcome: 'green' });
  if (typeof part.outcome === 'string') return statusFor({ outcome: part.outcome });
  const why = part.stopReason;
  if (why) {
    const key = why === 'money cap' || why === 'time cap' ? 'capped' : why === 'you stopped it' ? 'stopped' : why === 'died' ? 'died' : 'failed';
    return { key, ...STATUS[key] };
  }
  return statusFor({ outcome: 'green' });
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
