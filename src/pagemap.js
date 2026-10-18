// IDEA A CORE (docs/product/ITEM33-BUILD.md "Addendum 2026-10-18 — Idea A core: build spec", sections 4.1 and 5): THE MAP CALL.
// ONE paid AI call per page input maps the person's job to the page's OWN words. The AI never grades and never invents: every word it
// names is checked by plain code against the saved page (src/pagerules.js) before anything else sees the answer. This replaces the
// search-and-read look (`runInputLook`, src/authorscout.js) as the default `lookFn`; it takes the same arguments and returns the same
// envelope (`state`, `facts: {rubricFiles, inputs, look}`, `calls`, `raws`, `budgetStop`), so the phase line, the spend booking and
// every downstream reader keep working. The prompt is ported from the POC call (.claude/scratch/idea-a-v2/mapcall.mjs, sha256 recorded
// in commit 0bcc5fe).

import { createRequire } from 'node:module';
import { priceOf, scrubRaw, tallyCalls, capStop, callCasualty } from './text.js';
import { redactSecrets } from './validate.js';
import { isTransportFailure } from './transport.js';
import { isRateLimited, rateLimitWaitMs } from './ratelimit.js';
import { isOutputCutOff } from './authorflow.js';
import { AUTHOR_CALL_TIMEOUT_MS, AUTHOR_SCOUT_MAX_TOKENS, SURVEY_CAUSES } from './authorscout.js';
import { lineRules } from './rubricstep.js';
import { applyPageRules } from './pagerules.js';
import { lookFactOf } from './inputlook.js';

const require = createRequire(import.meta.url);
const { Loop } = require('bare-agent');

/** the label of the one paid call, as the drafting book and the progress line see it */
export const MAP_CALL_LABEL = 'page-map';
/** the shapes the map may name; a `place` is read by code as a phrase */
export const MAP_SHAPES = Object.freeze(['place', 'money', 'time', 'phrase']);

export const MAP_SYSTEM = 'You map a person\'s job to the exact words of ONE saved web page. You never grade and never invent words: every string you return must be copied from the page text, character for character.';

/**
 * What the AI is told, for ONE page input. Ported from the POC prompt: the job, the `~` rules, "a result is one item", the answer form
 * and the shape meanings.
 * @param {{jobLines: {n: number, text: string, rule?: string, rules?: string[]}[], label: string, text: string}} o
 * @returns {string}
 */
export function mapPrompt({ jobLines, label, text }) {
  const job = jobLines.map((l) => `LINE ${l.n}: ${l.text}${lineRules(l).map((r, i) => `\n~ rule ${i + 1}: ${r}`).join('')}`).join('\n');
  return `THE JOB (each ~ rule applies to the line above it):\n${job}\n\n`
    + 'A "result" is one item the page lists (one flight, one stay, one row). For each job line and for each rule, say which fact(s) every result must carry, and give the PAGE\'S OWN WORDS for it.\n\n'
    + 'Return ONLY a JSON object, no prose, no code fence:\n'
    + '{"facts":[{"name":"<letters and spaces only>","from":"<line N | line N rule M>","shape":"place|money|time|phrase","words":["<page words>", ...],"currency":["<symbol>"],"unit":["<words after the amount>"]}]}\n\n'
    + 'shape meanings:\n'
    + '- place: words = ways the page writes the place (a city, an airport name), copied from the page.\n'
    + '- money: words = the label(s) written right BEFORE the amount, copied from the page. currency / unit = how the page writes the currency ("$") and/or the words after the amount ("US dollars"); give every spelling the page uses, as lists.\n'
    + '- time: words = the label(s) written right BEFORE the time that is the one the rule is about, copied from the page.\n'
    + '- phrase: words = fixed words a result\'s text must contain, copied from the page.\n'
    + 'Several words in one list are alternatives for the same fact. Put the best one first.\n\n'
    + `PAGE TEXT (the input "${label}"):\n${text}`;
}

/**
 * Read the AI's answer: ONE JSON object of the answer form, and nothing else. No repair (hamr's ruling): text that is not JSON, JSON of
 * another form, or a fact whose shape or lists are not of the form is a malformed answer.
 * @param {unknown} text @returns {{ok: true, mapping: import('./pagerules.js').PageMap}|{ok: false}}
 */
export function parseMapAnswer(text) {
  /** @type {any} */
  let m;
  try { m = JSON.parse(String(text ?? '').trim()); } catch { return { ok: false }; }
  const strs = (/** @type {unknown} */ v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
  if (m === null || typeof m !== 'object' || Array.isArray(m) || !Array.isArray(m.facts)) return { ok: false };
  for (const f of m.facts) {
    if (f === null || typeof f !== 'object' || Array.isArray(f)) return { ok: false };
    if (typeof f.name !== 'string' || !MAP_SHAPES.includes(f.shape) || !strs(f.words)) return { ok: false };
    if (f.from !== undefined && typeof f.from !== 'string') return { ok: false };
    for (const k of ['currency', 'unit']) if (f[k] !== undefined && !strs(f[k])) return { ok: false };
  }
  return { ok: true, mapping: m };
}

/** the default loop seam - one spelling of how this repo drives a model */
const defaultLoop = (/** @type {any} */ { system, onLlmResult, provider, rates }) =>
  new Loop({ provider, system, onLlmResult, ...(rates ? { rates } : {}) });

/** the plain-word stop when the answer was not readable twice (no Resume: a draft is not a run) */
export const MAP_UNREADABLE = 'The AI\'s answer about the page was not readable twice. Nothing was signed.';

/**
 * Run the map: one call per page input.
 * @param {{texts: Record<string, string>, inputs: {n: number, label: string}[], jobLines: {n: number, text: string, rule?: string, rules?: string[]}[],
 *   provider?: any, maxTokens?: number, ceilingUsd?: number|null, callTimeoutMs?: number,
 *   onCall?: (call: {label: string, costUsd: number|null, unpricedRounds: number, thinkingStatus?: string, raw?: string}) => void,
 *   createLoop?: (o: {system: string, onLlmResult: any, provider: any, rates?: {in: number, out: number}}) => any,
 *   rates?: {in: number, out: number}|null, callOptions?: Record<string, any>, sleep?: (ms: number) => Promise<void>, prove?: Function}} o
 * @returns {Promise<{state: 'PRESENT'|'ABSENT', facts: any, reason: string|null, cause: string|null, meta: any, raw: string,
 *   raws: ReturnType<typeof scrubRaw>[], calls: {label: string, costUsd: number|null, unpricedRounds: number}[],
 *   budgetStop: 'cap-halt'|'pricing-red'|null}>}
 */
export async function runPageMap({
  texts, inputs, jobLines, provider = null, maxTokens = AUTHOR_SCOUT_MAX_TOKENS, ceilingUsd = null,
  callTimeoutMs = AUTHOR_CALL_TIMEOUT_MS, onCall = () => {}, createLoop = defaultLoop, rates = null, callOptions = {},
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const callTimeout = Number.isFinite(Number(callTimeoutMs)) && Number(callTimeoutMs) > 0
    ? Math.min(Math.trunc(Number(callTimeoutMs)), AUTHOR_CALL_TIMEOUT_MS) : AUTHOR_CALL_TIMEOUT_MS;
  const priced = rates ? { rates } : {};
  /** @type {{label: string, costUsd: number|null, unpricedRounds: number}[]} */
  const calls = [];
  /** @type {ReturnType<typeof scrubRaw>[]} */
  const raws = [];
  let attempts = 0;
  const record = (/** @type {any} */ r, /** @type {number} */ attempt) => {
    const call = { label: MAP_CALL_LABEL, ...priceOf(r) };
    calls.push(call);
    const raw = scrubRaw({ label: MAP_CALL_LABEL, attempt, text: r?.text });
    raws.push(raw);
    // the scrubbed answer rides the call, so the session's drafting log (draft-log.jsonl) keeps the AI's map and a run can be replayed at $0
    onCall({ ...call, raw: raw.text, ...(r?.thinkingStatus === undefined ? {} : { thinkingStatus: r.thinkingStatus }) });
  };
  const absent = (/** @type {string} */ reason, /** @type {string} */ cause, /** @type {'cap-halt'|'pricing-red'|null} */ budgetStop = null) => ({
    state: /** @type {'ABSENT'} */ ('ABSENT'), facts: null, reason, cause, meta: { attempts }, raw: '', raws, calls, budgetStop,
  });
  const halted = () => capStop({ ceilingUsd, ...tallyCalls(calls) });
  const labels = Object.keys(texts);
  /** @type {any[]} */
  const looks = [];
  /** @type {any[]} */
  const dropped = [];
  /** @type {any[]} */
  const facts = [];
  /** @type {any[]} */
  const maps = [];

  for (const label of labels) {
    const content = mapPrompt({ jobLines, label, text: texts[label] });
    /** @type {any} */
    let mapping = null;
    let malformed = 0;
    let transportRetried = false;
    let rateRetried = false;
    while (mapping === null) {
      // the cap is checked BEFORE every call, never inside one
      const halt = halted();
      if (halt) return absent(halt === 'cap-halt' ? `the AI's look at the page was not made: the $${ceilingUsd} ceiling was already spent` : 'the AI\'s look at the page was not made: spend could not be priced, so the ceiling could not be enforced', SURVEY_CAUSES.NOT_FUNDED, halt);
      attempts += 1;
      const loop = createLoop({ system: MAP_SYSTEM, onLlmResult: undefined, provider, ...priced });
      /** @type {any} */
      let r;
      try {
        r = await loop.run([{ role: 'user', content }], [], { cacheMessages: true, maxTokens, timeoutMs: callTimeout, ...callOptions });
      } catch (e) {
        if (isRateLimited(e) && !rateRetried) {
          // a 429 is a REFUSAL (nothing billed): wait the vendor's stated time once, then ask again
          const wait = rateLimitWaitMs(e);
          if (wait !== null) { rateRetried = true; await sleep(wait); continue; }
        }
        const casualty = callCasualty(e) ?? (isTransportFailure(e) ? String(/** @type {any} */ (e)?.message ?? e) : null);
        if (casualty === null) throw e;
        // the failed attempt may already be billed: it is booked UNPRICED, so the spend stays "not complete" (never a $0)
        record({ error: casualty }, attempts);
        if (!transportRetried) { transportRetried = true; continue; }
        return absent(`the call about the page failed: ${redactSecrets(casualty)}`, SURVEY_CAUSES.CALL_FAILED);
      }
      record(r, attempts);
      if (r?.error && !isOutputCutOff(r)) return absent(`the call about the page failed: ${redactSecrets(String(r.error))}`, SURVEY_CAUSES.CALL_FAILED);
      // a truncated answer (max_tokens) is a malformed one
      const parsed = isOutputCutOff(r) ? { ok: false } : parseMapAnswer(r?.text);
      if (parsed.ok) { mapping = /** @type {any} */ (parsed).mapping; break; }
      malformed += 1;
      if (malformed >= 2) return absent(MAP_UNREADABLE, SURVEY_CAUSES.UNPARSEABLE);
    }
    const kept = applyPageRules(texts[label], mapping, jobLines);
    for (const f of kept.facts) facts.push(lookFactOf(f, label));
    for (const d of kept.dropped) dropped.push({ ...d, source: label });
    maps.push({ source: label, facts: mapping.facts.length });
    looks.push(label);
  }
  return {
    state: 'PRESENT', reason: null, cause: null, meta: { attempts, maps }, raw: '', raws, calls, budgetStop: null,
    facts: { rubricFiles: true, inputs: inputs.map((i) => ({ n: i.n, label: i.label })), look: { facts, prose: [], notFound: [], dropped } },
  };
}
