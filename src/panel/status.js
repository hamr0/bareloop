// PANEL status words — ONE code-owned table (sign -> word) and ONE writer of "which word does this run wear".
// hamr's ruling 2026-10-04 (option A): every surface (run cards, expanded run rows, the right-side header, imported
// rows) reads `status` from the server; the page never maps an outcome to a word itself.
//
//   [▶] running · [·] waiting · [✓] passed · [✗] failed · [✗] capped · [✗] stopped · [?] died
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

/** the sentence a passed run carries as its reason (the Ended block's `line`) */
export const GOAL_MET_LINE = 'goal met';

/** @typedef {'running'|'waiting'|'passed'|'failed'|'capped'|'stopped'|'died'} StatusKey */

/** the table: key -> sign + word */
export const STATUS = Object.freeze({
  running: Object.freeze({ sign: '▶', word: 'running' }),
  waiting: Object.freeze({ sign: '·', word: 'waiting' }),
  passed: Object.freeze({ sign: '✓', word: 'passed' }),
  failed: Object.freeze({ sign: '✗', word: 'failed' }),
  capped: Object.freeze({ sign: '✗', word: 'capped' }),
  stopped: Object.freeze({ sign: '✗', word: 'stopped' }),
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
  else if (out === 'cap-halt' || out === 'wall-halt') key = 'capped';
  else if (out === 'stopped') key = 'stopped';
  else if (out === 'escalated' && ((o.category === 'cap-halt' && o.moneyHalt) || o.category === 'wall-halt')) key = 'capped';
  return { key, ...STATUS[key] };
}
