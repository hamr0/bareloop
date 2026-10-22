// THE FIT CHECK (docs/product/ITEM33-BUILD.md "Addendum 2026-10-21 - fit check build spec", F243, fit POC v6). A rubric job, at drafting, once, after the
// inputs are frozen and before the look: ONE paid AI call splits each job line into the short parts it asks for (words copied from that line) and says,
// for each, whether the saved page shows it, with a quote copied from the page. The AI never decides: plain code checks every ask against its own
// line and every quote against the page, and a part not found becomes one question to the person (never a stop by itself, never a count). Failure is
// OPEN - a wrong stop is the costly mistake - so a call that does not finish is `absent` and drafting goes on. The call/book/retry pattern is
// src/pagemap.js's `runPageMap`.

import { createRequire } from 'node:module';
import { priceOf, scrubRaw, tallyCalls, capStop, callCasualty } from './text.js';
import { redactSecrets } from './validate.js';
import { isTransportFailure } from './transport.js';
import { isRateLimited, rateLimitWaitMs } from './ratelimit.js';
import { isOutputCutOff } from './authorflow.js';
import { AUTHOR_CALL_TIMEOUT_MS, AUTHOR_SCOUT_MAX_TOKENS, SURVEY_CAUSES } from './authorscout.js';

const require = createRequire(import.meta.url);
const { Loop } = require('bare-agent');

/** the label of the one paid call, as the drafting book and the progress line see it */
export const FIT_CALL_LABEL = 'fit-check';
/** what the chat says when the check did not finish (drafting goes on) */
export const FIT_ABSENT_NOTE = 'The fit check did not finish; drafting goes on.';
/** the answer that keeps drafting after the fit question (any case, a closing full stop allowed) */
export const FIT_GO_ON = 'go on';
/** @param {unknown} text @returns {boolean} */
export const isGoOn = (text) => norm(String(text ?? '').trim().replace(/\.$/, '')) === FIT_GO_ON;

export const FIT_SYSTEM = 'You check whether saved web pages show what a job asks for. You never invent words: every ask must be copied from its job line and every quote must be copied from the page, character for character.';

/** collapse whitespace, lower case: the one spelling every fit comparison uses @param {unknown} s @returns {string} */
export const norm = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * What the AI is told: the job lines (the numbered text only, no `~` rules) and the WHOLE text of every input under its label. Adapted from the POC
 * call (.claude/scratch/fit-poc6/run.mjs): the asks are copied from each job line instead of hand-written.
 * @param {{jobLines: {n: number, text: string}[], texts: Record<string, string>}} o
 * @returns {string}
 */
export function fitPrompt({ jobLines, texts }) {
  const job = jobLines.map((l) => `LINE ${l.n}: ${l.text}`).join('\n');
  const pages = Object.entries(texts).map(([label, text]) => `THE PAGE (the input "${label}"):\n${text}`).join('\n\n');
  return `THE JOB:\n${job}\n\n${pages}\n\n`
    + 'For EACH job line, split it into the short parts it asks for (for example where it starts, where it ends, a price, a time), using ONLY words copied from that line. '
    + 'Every line has at least one part. For EACH part, say whether the page shows it the way the job means it. A page that shows the opposite (for example a flight that arrives where the job says it leaves from, or a different city) does NOT show it. '
    + 'If found, copy a short piece of page text that shows it, character for character. If not found, quote is null. '
    + 'Reply with JSON only, no prose, no code fence: {"asks":[{"line":<line number>,"ask":"<the part, copied from that line>","found":true|false,"quote":"<page text or null>"}]}';
}

/** @typedef {{line: number, ask: string, found: boolean, quote: string|null, madeUp: boolean, ignored?: 'number'}} FitAsk */

/** an ask that is only a number (a count the job gives, not something the page shows): digits, optional spaces, commas, dots @param {string} ask @returns {boolean} */
const isNumberOnly = (ask) => /^\d[\d\s,.]*$/.test(norm(ask));

/**
 * Read the AI's reply and decide, all in code. Malformed (no repair): not JSON, another form, a line that is not a job line, an ask not copied from its own
 * line, found not a boolean, a quote neither text nor null, or a job line with no ask. An ask is found only if `found` is true AND its quote is on a page;
 * `found` with a quote that is not on any page (or no quote) is made up and counts as not found.
 * @param {unknown} text the reply
 * @param {{n: number, text: string}[]} jobLines
 * @param {Record<string, string>} texts the frozen input texts by label
 * @returns {{status: 'malformed'}|{status: 'ok', state: 'fits'|'ask', asks: FitAsk[], notFound: {line: number, ask: string}[]}}
 */
export function decideFit(text, jobLines, texts) {
  /** @type {any} */
  let j;
  try { j = JSON.parse(String(text ?? '').trim()); } catch { return { status: 'malformed' }; }
  if (j === null || typeof j !== 'object' || Array.isArray(j) || !Array.isArray(j.asks)) return { status: 'malformed' };
  const lines = new Map(jobLines.map((l) => [l.n, norm(l.text)]));
  const pages = Object.values(texts).map(norm);
  /** @type {FitAsk[]} */
  const asks = [];
  for (const a of j.asks) {
    if (a === null || typeof a !== 'object' || Array.isArray(a)) return { status: 'malformed' };
    if (!Number.isInteger(a.line) || !lines.has(a.line)) return { status: 'malformed' };
    if (typeof a.ask !== 'string' || norm(a.ask) === '' || !(/** @type {string} */ (lines.get(a.line))).includes(norm(a.ask))) return { status: 'malformed' };
    if (typeof a.found !== 'boolean') return { status: 'malformed' };
    const quote = a.quote ?? null;
    if (quote !== null && typeof quote !== 'string') return { status: 'malformed' };
    const q = quote === null ? '' : norm(quote);
    const onPage = q !== '' && pages.some((p) => p.includes(q));
    // a bare number is ignored: kept in the record (flagged), never counted, never asked about
    asks.push({ line: a.line, ask: a.ask, found: a.found && onPage, quote, madeUp: a.found && !onPage, ...(isNumberOnly(a.ask) ? { ignored: /** @type {'number'} */ ('number') } : {}) });
  }
  if (!jobLines.every((l) => asks.some((a) => a.line === l.n))) return { status: 'malformed' };
  const notFound = asks.filter((a) => !a.ignored && !a.found).map((a) => ({ line: a.line, ask: a.ask }));
  return { status: 'ok', state: notFound.length === 0 ? 'fits' : 'ask', asks, notFound };
}

/** the not-found asks as the person reads them: `<ask> (line N), <ask> (line N)` @param {{line: number, ask: string}[]} notFound @returns {string} */
export const notFoundList = (notFound) => notFound.map((x) => `${x.ask} (line ${x.line})`).join(', ');

/**
 * The one question, worded by code.
 * @param {{found: number, total: number, notFound: {line: number, ask: string}[]}} o
 * @returns {string}
 */
export const fitQuestionText = ({ found, total, notFound }) => redactSecrets(
  `I found ${found} of ${total} of your asks on this page. Not found: ${notFoundList(notFound)}. Type go on to keep drafting, or anything else to stop and change the job or the page.`,
);

/** the default loop seam - one spelling of how this repo drives a model */
const defaultLoop = (/** @type {any} */ { system, onLlmResult, provider, rates }) =>
  new Loop({ provider, system, onLlmResult, ...(rates ? { rates } : {}) });

/**
 * Run the fit check: one call (one retry on a malformed reply or a transport failure or a 429). Never throws on a call casualty; every failure is `absent`.
 * @param {{jobLines: {n: number, text: string}[], texts: Record<string, string>, provider?: any, maxTokens?: number, ceilingUsd?: number|null,
 *   callTimeoutMs?: number, onCall?: (call: {label: string, costUsd: number|null, unpricedRounds: number, thinkingStatus?: string, raw?: string}) => void,
 *   createLoop?: Function, rates?: {in: number, out: number}|null, callOptions?: Record<string, any>, sleep?: (ms: number) => Promise<void>}} o
 * @returns {Promise<{state: 'fits'|'ask'|'absent', asks: FitAsk[], notFound: {line: number, ask: string}[], reason: string|null, cause: string|null,
 *   calls: {label: string, costUsd: number|null, unpricedRounds: number}[], budgetStop: 'cap-halt'|'pricing-red'|null}>}
 */
export async function runFitCheck({
  jobLines, texts, provider = null, maxTokens = AUTHOR_SCOUT_MAX_TOKENS, ceilingUsd = null, callTimeoutMs = AUTHOR_CALL_TIMEOUT_MS,
  onCall = () => {}, createLoop = defaultLoop, rates = null, callOptions = {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const callTimeout = Number.isFinite(Number(callTimeoutMs)) && Number(callTimeoutMs) > 0
    ? Math.min(Math.trunc(Number(callTimeoutMs)), AUTHOR_CALL_TIMEOUT_MS) : AUTHOR_CALL_TIMEOUT_MS;
  const priced = rates ? { rates } : {};
  /** @type {{label: string, costUsd: number|null, unpricedRounds: number}[]} */
  const calls = [];
  let attempts = 0;
  const record = (/** @type {any} */ r) => {
    const call = { label: FIT_CALL_LABEL, ...priceOf(r) };
    calls.push(call);
    const raw = scrubRaw({ label: FIT_CALL_LABEL, attempt: attempts, text: r?.text });
    onCall({ ...call, raw: raw.text, ...(r?.thinkingStatus === undefined ? {} : { thinkingStatus: r.thinkingStatus }) });
  };
  const absent = (/** @type {string} */ reason, /** @type {string} */ cause, /** @type {'cap-halt'|'pricing-red'|null} */ budgetStop = null) => ({
    state: /** @type {'absent'} */ ('absent'), asks: [], notFound: [], reason, cause, calls, budgetStop,
  });
  const content = fitPrompt({ jobLines, texts });
  let malformed = 0;
  let transportRetried = false;
  let rateRetried = false;
  for (;;) {
    // the cap is checked BEFORE every call, never inside one
    const halt = capStop({ ceilingUsd, ...tallyCalls(calls) });
    if (halt) return absent(halt === 'cap-halt' ? `the fit check was not made: the $${ceilingUsd} ceiling was already spent` : 'the fit check was not made: spend could not be priced, so the ceiling could not be enforced', SURVEY_CAUSES.NOT_FUNDED, halt);
    attempts += 1;
    const loop = createLoop({ system: FIT_SYSTEM, onLlmResult: undefined, provider, ...priced });
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
      // the failed attempt may already be billed: booked UNPRICED, so the spend stays "not complete" (never a $0)
      record({ error: casualty });
      if (!transportRetried) { transportRetried = true; continue; }
      return absent(`the fit check call failed: ${redactSecrets(casualty)}`, SURVEY_CAUSES.CALL_FAILED);
    }
    record(r);
    if (isOutputCutOff(r)) return absent('the fit check answer was cut off', SURVEY_CAUSES.UNPARSEABLE);
    if (r?.error) return absent(`the fit check call failed: ${redactSecrets(String(r.error))}`, SURVEY_CAUSES.CALL_FAILED);
    const d = decideFit(r?.text, jobLines, texts);
    if (d.status === 'ok') return { state: d.state, asks: d.asks, notFound: d.notFound, reason: null, cause: null, calls, budgetStop: null };
    malformed += 1;
    if (malformed >= 2) return absent('the fit check answer was not readable twice', SURVEY_CAUSES.UNPARSEABLE);
  }
}
