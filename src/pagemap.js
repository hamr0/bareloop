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
import { lineRules, boundInWords, wordsSaidOn } from './rubricstep.js';
import { applyPageRules, validReading } from './pagerules.js';
import { dryReadMoney, dryReadPhrases } from './pagedry.js';
import { ruleWords } from './facts.js';
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
    + '{"facts":[{"name":"<letters and spaces only>","from":"<line N | line N rule M>","shape":"place|money|time|phrase","words":["<page words>", ...],"currency":["<symbol>"],"unit":["<words after the amount>"],"reading":<optional, see below>}]}\n\n'
    + 'shape meanings:\n'
    + '- place: words = ways the page writes the place (a city, an airport name), copied from the page.\n'
    + '- money: words = the label(s) written right BEFORE the amount, copied from the page. currency / unit = how the page writes the currency ("$") and/or the words after the amount ("US dollars"); give every spelling the page uses, as lists.\n'
    + '- time: words = the label(s) written right BEFORE the time that is the one the rule is about, copied from the page.\n'
    + '- phrase: words = fixed words a result\'s text must contain, copied from the page.\n'
    + 'Several words in one list are alternatives for the same fact. Put the best one first.\n'
    + 'reading (optional, only on a time or money fact): when a ~ rule is a limit on that fact that the page cannot hold in words (for example "not a red-eye" is a limit on the departure time), give your own best reading of the rule as that limit: {"op":"between","lo":<bound>,"hi":<bound>} or {"op":"lt|lte|gt|gte","value":<bound>}. A time bound is a "HH:MM" string on a 24-hour clock; a money bound is a number. Leave reading out when a page word already carries the rule.\n\n'
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
    // PRD v1.107 Part 5b: a `reading` is a limit of the signed-rule shape on a time or money fact; any other is a malformed answer (no repair)
    if (f.reading !== undefined && !validReading(f.shape, f.reading)) return { ok: false };
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
    // money build v2: "can it read" - a money fact whose forms read no result line of the page, by the run's own checker, is Not checked
    const read = await dryReadMoney(texts[label], kept.facts);
    // hamr 3a: a phrase fact is read against the same result lines (only when the job keeps a money fact)
    const phr = await dryReadPhrases(texts[label], read.facts);
    for (const f of phr.facts) facts.push(lookFactOf(f, label));
    for (const d of [...kept.dropped, ...read.dropped, ...phr.dropped]) dropped.push({ ...d, source: label });
    maps.push({ source: label, facts: mapping.facts.length });
    looks.push(label);
  }
  return {
    state: 'PRESENT', reason: null, cause: null, meta: { attempts, maps }, raw: '', raws, calls, budgetStop: null,
    facts: { rubricFiles: true, inputs: inputs.map((i) => ({ n: i.n, label: i.label })), look: { facts, prose: [], notFound: [], dropped } },
  };
}

/** the answer that drops a `~` rule the page cannot check: the person types it (any case, a closing full stop allowed) */
export const DROP_IT = 'drop it';
/** @param {unknown} text @returns {boolean} */
export const isDropIt = (text) => String(text ?? '').trim().replace(/\.$/, '').toLowerCase() === DROP_IT;
/** the answers that accept the code's reading of a rule; anything else the person types is their own reading */
const AGREE_WORDS = ['agree', 'yes'];
/** @param {unknown} text @returns {boolean} */
export const isAgree = (text) => AGREE_WORDS.includes(String(text ?? '').trim().replace(/[.!]$/, '').toLowerCase());
/**
 * F240: an answer that opens with an agree word, a separator (comma, colon, dash or space) and more text ("yes, check it as ...") is the person's own
 * reading with a courtesy word in front: the word and separator go, the rest stays word for word. A bare "yes"/"agree" (isAgree) and a text that
 * only contains the word later are returned untouched.
 * @param {string} text @returns {string}
 */
export const stripAgreeLead = (text) => {
  const m = String(text ?? '').match(new RegExp(`^(?:${AGREE_WORDS.join('|')})(?:\\s*[,:\\-\u2013\u2014]\\s*|\\s+)(\\S[\\s\\S]*)$`, 'i'));
  return m ? m[1].trim() : String(text ?? '');
};

/** @typedef {{line: number, rule: number, source: 'look', question: string, ask: 'reading'|'cant-check', ruleText: string, reading?: string}} LookAsk
 *   `reading` = the plain words an `agree` writes as a `~` rule (a reading ask only) */

/** the words of a reading ask: the ONE spelling, and {@link readingOfQuestion} reads it back (the Result tab's "(you confirmed)") */
const READING_HEAD = ' I read it as: ';
const READING_TAIL = '. Agree? Answer "agree"';
/** @param {number} n @param {string} rule @param {string} reading @returns {string} */
const readingQuestion = (n, rule, reading) => `Your line ${n} says "${rule}".${READING_HEAD}${reading}${READING_TAIL}, or type your own reading (your answer is added as a new ~ rule on line ${n}).`;
/** @param {unknown} q a recorded question @returns {string|null} the reading a reading ask proposed, or null when it was another kind of question */
export function readingOfQuestion(q) {
  const s = String(q ?? '');
  const a = s.indexOf(READING_HEAD);
  const b = s.indexOf(READING_TAIL);
  return a >= 0 && b > a ? s.slice(a + READING_HEAD.length, b) : null;
}

/**
 * PRD v1.107 Part 5b ("the look reads, code asks"): the early asks CODE forces before any paid drafting, from the look's own result. Every `~` rule is
 * one of three kinds:
 *   - PAGE: a kept page word carries it (a kept fact with `forRule` and no `reading`): no ask.
 *   - READING: a kept fact carries it with a `reading` (a limit the page cannot hold, e.g. "not a red-eye" -> departure time between 06:00 and 21:00).
 *     Asked only when a bound of the reading is NOT in the words the person wrote (the same test as `rubric-fact-unmarked`, `boundInWords`); a
 *     bound they wrote themselves is theirs and nothing is asked. `agree` writes the reading as a `~` rule in plain words (the answer text is
 *     `reading`), so the drafter is told it and the fact signs plain.
 *   - CAN'T CHECK: no kept fact carries it (PRD v1.106 Part 5 Q3 T2). `drop it` leaves it Not checked.
 * One ask per rule text on a line; readings first, then can't-check asks, each in line order. The caller applies the machine's cap and the answer gate.
 * @param {{facts?: {line: number, forRule?: number, name?: string, shape?: string, unit?: string[], currency?: string[], reading?: import('./pagerules.js').Reading}[]}|null|undefined} look
 * @param {{n: number, text?: string, rule?: string, rules?: string[]}[]|null|undefined} jobLines
 * @returns {LookAsk[]}
 */
export function askableFromLook(look, jobLines) {
  const facts = Array.isArray(look?.facts) ? look.facts : [];
  /** @type {LookAsk[]} */
  const readings = [];
  /** @type {LookAsk[]} */
  const cants = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const l of Array.isArray(jobLines) ? jobLines : []) {
    lineRules(l).forEach((rule, k) => {
      const n = k + 1;
      const key = `${l.n}\u0000${rule.trim().toLowerCase()}`;
      const tied = facts.filter((f) => f.line === l.n && f.forRule === n);
      if (tied.length > 0) {
        const said = wordsSaidOn(l);
        const f = tied.find((x) => x.reading && validReading(x.shape, x.reading) && ruleBounds(x.reading).some((b) => !boundInWords(b, said)));
        if (f === undefined || seen.has(key)) return;
        seen.add(key);
        const reading = `${f.name} ${ruleWords({ shape: f.shape, unit: f.unit, currency: f.currency, rule: f.reading })}`;
        readings.push({
          line: l.n, rule: n, source: 'look', ask: 'reading', ruleText: rule, reading,
          question: readingQuestion(l.n, rule, reading),
        });
        return;
      }
      if (seen.has(key)) return;
      seen.add(key);
      cants.push({
        line: l.n, rule: n, source: 'look', ask: 'cant-check', ruleText: rule,
        question: `Your line ${l.n} says "${rule}". I can't check this on the page. Drop it? Answer "${DROP_IT}", or type how to check it (your answer is added as a new ~ rule on line ${l.n}).`,
      });
    });
  }
  return [...readings, ...cants];
}

/** @param {import('./pagerules.js').Reading} r @returns {unknown[]} the bounds a reading holds */
const ruleBounds = (r) => (r.op === 'between' ? [r.lo, r.hi] : [r.value]);

/**
 * PRD v1.107 Part 5b: more asks than the machine's cap means the job needs a rewrite, not a questionnaire. The code-owned stop words list EVERY ask and
 * its reading as the suggestion (no extra paid call). A secret in a rule is masked.
 * @param {LookAsk[]} asks @returns {string}
 */
export function tooManyAsksText(asks) {
  const list = asks.map((a) => `line ${a.line} "${a.ruleText}" → ${a.reading ?? "I can't check this on the page"}`).join('; ');
  return redactSecrets(`Your job has ${asks.length} rules I can't check or had to guess. Please rewrite it so each one says what to look for. My readings: ${list}.`);
}
