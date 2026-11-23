// REVIEW THE CODE (docs/product/ITEM33-BUILD.md "Addendum 2026-11-20 (b)"): the CROSSROADS of a Deterministic repo job, and the only WRITER of the signed source (`closeDecl.source`, src/sourcedefaults.js).
// On a D repo job the drafter is asked ONE binary question: is this job CHANGING the code of the repo, or REVIEWING it (reading the code and reporting, no change)?
//   change  -> today's D flow, untouched (this module returns nothing that touches it).
//   review  -> the rubric road over a REPO source: the text close, the soft-green class, `source: 'repo'`. Nothing downstream asks "is this a review?": it reads the signed source.
// ONE shared function, `chooseRoad`, is called by BOTH doors (the panel's `src/panel/authorsession.js` and the CLI's `src/authorrun.js`): two copies would be two instruments. The AI only POINTS (a typed
// reply, no prose); code reads it. Failure is OPEN toward "change": a call that does not finish, or a reply that is not exactly the typed one, is today's D flow (a wrong review road is the costly mistake,
// and a wrong change road is just what the person had before). The call/book/retry pattern is src/destpoint.js's `runDestPoint`.

import { createRequire } from 'node:module';
import { priceOf, scrubRaw, tallyCalls, capStop, callCasualty } from './text.js';
import { redactSecrets } from './validate.js';
import { isTransportFailure } from './transport.js';
import { isRateLimited, rateLimitWaitMs } from './ratelimit.js';
import { isOutputCutOff } from './authorflow.js';
import { AUTHOR_CALL_TIMEOUT_MS, AUTHOR_SCOUT_MAX_TOKENS } from './authorscout.js';
import { RUBRIC_LANG, RUBRIC_FENCE } from './authoring.js';
import { rangeTokens, manyTokensRefusal, changeRefusal } from './rangereview.js';

const require = createRequire(import.meta.url);
const { Loop } = require('bare-agent');

/** the one ask a NEW job (Change, Review or rubric) with no `~` rule gets, in plain words from code */
export const NEEDS_RULE_WORDS = 'Add at least one rule (~) for this job \u2014 for example what the result must include, or what must stay true.';

/**
 * hamr 2026-11-23: EVERY new job needs at least one `~` rule. The ONE owner of the count, read at the start of both doors, $0, before any model call (the review pick included). CODE counts the `~` lines; no model judges them.
 * No job lines to count (null / empty) is not refused here: the card validator and the door's own checks own that.
 * @param {{rule?: string, rules?: string[]}[]|null|undefined} jobLines @returns {string|null} the ask in plain words, or null
 */
export function needsRuleRefusal(jobLines) {
  if (!Array.isArray(jobLines) || jobLines.length === 0) return null;
  return jobLines.some((l) => (Array.isArray(l.rules) ? l.rules.length > 0 : String(l.rule ?? '') !== '')) ? null : NEEDS_RULE_WORDS;
}

/** the label of the one paid call, as the drafting book sees it */
export const REVIEW_CALL_LABEL = 'review-pick';

/** the prompt register's system text (labelled in src/promptregisters.js) */
export const REVIEW_PICK_SYSTEM = 'You read the numbered lines of a job a person wants done on a code repository. You answer one question about what the job is trying to do.';

/**
 * What the AI is told: the person's job lines (with their `~` rules) and the one binary question, with the one legal reply shape.
 * @param {{n: number, text: string, rules?: string[]}[]} jobLines @returns {string}
 */
export function reviewPickPrompt(jobLines) {
  const job = jobLines.map((l) => `LINE ${l.n}: ${l.text}${(l.rules ?? []).map((r) => `\n  ~ ${r}`).join('')}`).join('\n');
  return `THE JOB:\n${job}\n\n`
    + 'ONE question: is this job trying to CHANGE the code of the repository (fix, add, rename, refactor, edit files), or to REVIEW it (read the code and report, list, assess or explain, with no change to the code)? '
    + 'Reply with JSON only, no prose, no code fence: {"kind":"change"} or {"kind":"review"}.';
}

/**
 * Read the AI's reply, all in code. Exactly `{"kind":"review"}` is a review; exactly `{"kind":"change"}` is a change; anything else is malformed (never repaired).
 * @param {unknown} text @returns {'change'|'review'|'malformed'}
 */
export function decideReviewPick(text) {
  /** @type {any} */
  let j;
  try { j = JSON.parse(String(text ?? '').trim()); } catch { return 'malformed'; }
  if (j === null || typeof j !== 'object' || Array.isArray(j)) return 'malformed';
  return j.kind === 'review' || j.kind === 'change' ? j.kind : 'malformed';
}

const defaultLoop = (/** @type {any} */ { system, onLlmResult, provider, rates }) =>
  new Loop({ provider, system, onLlmResult, ...(rates ? { rates } : {}) });

/**
 * Run the one call: one call, one retry on a malformed reply, a transport failure or a 429. Never throws on a call casualty; every failure is `absent` and reads as "change" (today's D flow).
 * @param {{jobLines: {n: number, text: string, rules?: string[]}[], provider?: any, maxTokens?: number, ceilingUsd?: number|null, callTimeoutMs?: number,
 *   onCall?: (call: {label: string, costUsd: number|null, unpricedRounds: number, thinkingStatus?: string, raw?: string}) => void,
 *   createLoop?: Function, rates?: {in: number, out: number}|null, callOptions?: Record<string, any>, sleep?: (ms: number) => Promise<void>}} o
 * @returns {Promise<{answer: 'change'|'review'|'absent', reason: string|null, calls: {label: string, costUsd: number|null, unpricedRounds: number}[]}>}
 */
export async function runReviewPick({
  jobLines, provider = null, maxTokens = AUTHOR_SCOUT_MAX_TOKENS, ceilingUsd = null, callTimeoutMs = AUTHOR_CALL_TIMEOUT_MS,
  onCall = () => {}, createLoop = defaultLoop, rates = null, callOptions = {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const callTimeout = Number.isFinite(Number(callTimeoutMs)) && Number(callTimeoutMs) > 0 ? Math.min(Math.trunc(Number(callTimeoutMs)), AUTHOR_CALL_TIMEOUT_MS) : AUTHOR_CALL_TIMEOUT_MS;
  const priced = rates ? { rates } : {};
  /** @type {{label: string, costUsd: number|null, unpricedRounds: number}[]} */
  const calls = [];
  let attempts = 0;
  const record = (/** @type {any} */ r) => {
    const call = { label: REVIEW_CALL_LABEL, ...priceOf(r) };
    calls.push(call);
    const raw = scrubRaw({ label: REVIEW_CALL_LABEL, attempt: attempts, text: r?.text });
    onCall({ ...call, raw: raw.text, ...(r?.thinkingStatus === undefined ? {} : { thinkingStatus: r.thinkingStatus }) });
  };
  const absent = (/** @type {string} */ reason) => ({ answer: /** @type {'absent'} */ ('absent'), reason, calls });
  const content = reviewPickPrompt(jobLines);
  let malformed = 0;
  let transportRetried = false;
  let rateRetried = false;
  for (;;) {
    if (capStop({ ceilingUsd, ...tallyCalls(calls) })) return absent('the review question was not asked: the spend ceiling was reached');
    attempts += 1;
    const loop = createLoop({ system: REVIEW_PICK_SYSTEM, onLlmResult: undefined, provider, ...priced });
    /** @type {any} */
    let r;
    try {
      r = await loop.run([{ role: 'user', content }], [], { cacheMessages: true, maxTokens, timeoutMs: callTimeout, ...callOptions });
    } catch (e) {
      if (isRateLimited(e) && !rateRetried) {
        const wait = rateLimitWaitMs(e);
        if (wait !== null) { rateRetried = true; await sleep(wait); continue; }
      }
      const casualty = callCasualty(e) ?? (isTransportFailure(e) ? String(/** @type {any} */ (e)?.message ?? e) : null);
      if (casualty === null) throw e;
      record({ error: casualty });
      if (!transportRetried) { transportRetried = true; continue; }
      return absent(`the review question call failed: ${redactSecrets(casualty)}`);
    }
    record(r);
    if (isOutputCutOff(r)) return absent('the review question answer was cut off');
    if (r?.error) return absent(`the review question call failed: ${redactSecrets(String(r.error))}`);
    const d = decideReviewPick(r?.text);
    if (d !== 'malformed') return { answer: d, reason: null, calls };
    malformed += 1;
    if (malformed >= 2) return absent('the review question answer was not readable twice');
  }
}

/**
 * The crossroads, ONE function for both doors. Only a Deterministic (`green`) job on a REPO source with numbered job lines is asked; every other job is not asked and is not a review.
 * A review takes the rubric road: the soft-green class, the text close language and the rubric road's own fence (`output/` alone, like a rubric job on files: the report is written by code, Destination is never in the fence)
 * and the signed source `repo` (this is where it is WRITTEN). A change returns `review: false` and nothing else the caller reads: its D flow stays byte for byte what it was.
 * `pick` is the door's own call (its provider, price, thinking and booking), `makePick` below builds it.
 * @param {{verdictType: string, isRepoSource: boolean, jobLines: {n: number, text: string, rule?: string, rules?: string[]}[]|null, pick: ((jobLines: any[]) => Promise<{answer: string, reason?: string|null}>)|null}} o
 * @returns {Promise<{review: false, answer: string|null, reason: string|null, refusal?: string}|{review: true, answer: 'review', reason: null, refusal?: undefined, verdictType: 'soft-green', lang: string, rubricFiles: true, writeScope: string[], source: 'repo'}>}
 */
export async function chooseRoad({ verdictType, isRepoSource, jobLines, pick }) {
  // Part 2 (review by git range or branch): a job names ONE range or branch (more is refused before the AI is asked); a `range:` can only be reviewed, so on a change pick it is refused (a `branch:` on a change job is legal)
  const many = manyTokensRefusal(jobLines);
  if (many !== null) return { review: false, answer: null, reason: null, refusal: many };
  if (verdictType !== 'green' || !isRepoSource || !Array.isArray(jobLines) || jobLines.length === 0 || typeof pick !== 'function') return { review: false, answer: null, reason: null };
  const r = await pick(jobLines);
  if (r.answer !== 'review') {
    const range = rangeTokens(jobLines).find((x) => x.kind === 'range');
    if (range !== undefined) return { review: false, answer: r.answer, reason: r.reason ?? null, refusal: changeRefusal(range) };
    return { review: false, answer: r.answer, reason: r.reason ?? null };
  }
  return { review: true, answer: 'review', reason: null, verdictType: 'soft-green', lang: RUBRIC_LANG, rubricFiles: true, writeScope: [...RUBRIC_FENCE], source: 'repo' };
}

/**
 * The door's call, bound to its provider: what both doors hand to `chooseRoad` as `pick`.
 * @param {Omit<Parameters<typeof runReviewPick>[0], 'jobLines'>} deps @returns {(jobLines: any[]) => ReturnType<typeof runReviewPick>}
 */
export const makePick = (deps) => (jobLines) => runReviewPick({ ...deps, jobLines });
