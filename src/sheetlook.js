// S1 (docs/product/ITEM33-BUILD.md "Addendum 2026-11-17"; copied from fwdloop src/sheetlook.js@v0.35.0, M10 piece 5 item 3 + item 7, for a sheet): the sheet-word look for ONE CSV input.
// One AI call names the job's own word for each rule (the column it means); CODE keeps a word only when it is a real column of the sheet, and when it is not, finds the column to offer
// (src/sheetfind.js) and builds the ask. The model names a word and a kind and nothing else: it never names a column to offer, never decides an ask, and never writes a question.
// `runSheetLook` is the sibling of `runPageMap` (src/pagemap.js): the same call, book, retry and spend plumbing, one call per CSV input. `runLook` is the look door's default:
// a job with no CSV goes to `runPageMap` untouched.
//
// Throws away: nothing silently. A word that is no column and gets no offer comes back in `dropped` with its reason code (src/pagedropwords.js, the one table) and as a Not-checked line.
// Third outcomes: an unreadable answer twice (stop), a cut-off answer (unreadable), a failed call (stop, its reason).
// A rule the model gave no word for is left alone: this look adds checks, it removes none. A .docx's headings (fwd's applyDocWords) are not in bareloop.
import { priceOf, scrubRaw, tallyCalls, capStop, callCasualty } from './text.js';
import { redactSecrets } from './validate.js';
import { isTransportFailure, isOutputCutOff } from './transport.js';
import { isRateLimited, rateLimitWaitMs } from './ratelimit.js';
import { AUTHOR_CALL_TIMEOUT_MS, AUTHOR_SCOUT_MAX_TOKENS, SURVEY_CAUSES } from './authorscout.js';
import { parseCsv } from './csv.js';
import { MAP_UNREADABLE, runPageMap, defaultLoop } from './pagemap.js';
import { tieOf } from './pagerules.js';
import { wordsSaidOn } from './rubricstep.js';
import { lineRules } from './jobline.js';
import { countPhrase, wordForms } from './factwords.js';
import { findColumn, columnQuestion, columnTieQuestion } from './sheetfind.js';

/** the system words of the sheet call (the page call's own: it never grades and never invents) */
export const SHEET_SYSTEM = 'You map a person\'s job to the columns of ONE spreadsheet. You never grade and never invent words: a word you return is the job\'s own word, copied as the job writes it.';

/** how many data rows the prompt shows (the header is always shown): enough to see what a column holds, never the whole sheet */
export const SHEET_PROMPT_ROWS = 5;
/** the line every sheet prompt carries, so a test provider can tell a sheet call from a page call (the system words are the same) */
export const SHEET_MARK = 'THE SHEET:';

/**
 * The `~` rule an `agree` writes when the rule does not say the word itself (the line's own prose said it); a person's own words replace it.
 * @param {string} word @param {string} column @returns {string}
 */
export const columnRuleWords = (word, column) => `use the column '${column}' for '${word}'`;

/**
 * A `~` rule with its own word for the column replaced by the column, in place ("Price over 500" -> "Amount over 500"): the first whole-word, case-blind match of the word or its plural/singular.
 * Null when the rule does not say the word (the model's word is then not in the rule, and nothing is rewritten).
 * @param {string} ruleText @param {string} word @param {string} column @returns {string|null}
 */
export function ruleWithColumn(ruleText, word, column) {
  for (const form of [word.trim(), ...wordForms(word)]) {
    if (form === '') continue;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'iu');
    if (re.test(ruleText)) return ruleText.replace(re, (_m, pre) => `${pre}${column}`);
  }
  return null;
}

/**
 * What the AI is told for ONE sheet: the job, and the sheet's header and first rows. It names the job's word for each rule; it does not pick a column to offer.
 * @param {{jobLines: {n: number, text: string, rule?: string, rules?: string[]}[], label: string, text: string}} o @returns {string}
 */
export function sheetPrompt({ jobLines, label, text }) {
  const job = jobLines.map((l) => `LINE ${l.n}: ${l.text}${lineRules(l).map((r, i) => `\n~ rule ${i + 1}: ${r}`).join('')}`).join('\n');
  const { header, rows } = parseCsv(text);
  const shown = rows.slice(0, SHEET_PROMPT_ROWS).map((r) => header.map((h) => r.byName[h] ?? '').join(' | '));
  return `THE JOB (each ~ rule applies to the line above it):\n${job}\n\n`
    + `${SHEET_MARK} the input "${label}" is a spreadsheet. Its columns, then its first rows:\n${header.join(' | ')}\n${shown.join('\n')}\n\n`
    + 'For each job line and each ~ rule that is about a value in the sheet, give the JOB\'S OWN WORD for the column it means, exactly as the job writes it. '
    + 'Never replace the job\'s word with a column name from the sheet, even when the sheet has a column that seems to mean the same: code matches the word to the sheet. Say whether the word means a column of numbers ("number") or anything else ("other"). Leave out a rule that is not about a column.\n\n'
    + 'Return ONLY a JSON object, no prose, no code fence:\n'
    + '{"facts":[{"from":"<line N | line N rule M>","word":"<the column name, or the job\'s own word>","kind":"number|other"}]}';
}

/**
 * Read the AI's answer: ONE JSON object of the answer form, nothing else. No repair: text that is not JSON, or a fact without a `from`, a `word` or a kind of
 * "number" / "other", is a malformed answer.
 * @param {unknown} text @returns {{ok: true, words: {from: string, word: string, kind: 'number'|'other'}[]}|{ok: false}}
 */
export function parseSheetAnswer(text) {
  /** @type {any} */
  let m;
  try { m = JSON.parse(String(text ?? '').trim()); } catch { return { ok: false }; }
  if (m === null || typeof m !== 'object' || Array.isArray(m) || !Array.isArray(m.facts)) return { ok: false };
  /** @type {{from: string, word: string, kind: 'number'|'other'}[]} */
  const words = [];
  for (const f of m.facts) {
    if (f === null || typeof f !== 'object' || Array.isArray(f)) return { ok: false };
    if (typeof f.from !== 'string' || typeof f.word !== 'string' || f.word.trim() === '' || f.word.length > 100) return { ok: false };
    if (f.kind !== 'number' && f.kind !== 'other') return { ok: false };
    words.push({ from: f.from, word: f.word.trim(), kind: f.kind });
  }
  return { ok: true, words };
}

/**
 * Keep the words that are real columns; for the rest, find the column to offer (or say why none is). Decided by code from the word, the rule and the sheet.
 * @param {string} text the sheet's text @param {{from: string, word: string, kind: 'number'|'other'}[]} words
 * @param {{n: number, text?: string, rule?: string, rules?: string[]}[]} jobLines @param {string} label the input's role
 * @returns {{facts: {line: number, forRule?: number, name: string, shape: 'column', column: string, words: string[], source: string}[], asks: ({line: number, rule: number|null, source: 'look', ask: 'reading', ruleText: string, question: string, word: string} & ({reading: string, column: string}|{columns: string[], readings: Record<string, string>}))[], dropped: import('./pagerules.js').Dropped[]}}
 */
export function applySheetWords(text, words, jobLines, label) {
  /** @type {any[]} */
  const facts = [];
  /** @type {any[]} */
  const asks = [];
  /** @type {import('./pagerules.js').Dropped[]} */
  const dropped = [];
  const seen = new Set();
  // the person's word is a header of the sheet: the word is theirs when the line or its `~` rules say it (a header the model picked in the person's place is not)
  const isYours = (/** @type {any} */ jl, /** @type {string} */ word) => jl !== undefined && wordForms(word).some((f) => countPhrase(wordsSaidOn(jl), f) > 0);
  // F196: a `~` rule whose own words contain a header of the sheet is tied to it by CODE (not by what the model returned): none of its words is asked (M10 am32, F180)
  const headers = parseCsv(text).header;
  const tiedRules = new Set(jobLines.flatMap((l) => lineRules(l).flatMap((r, i) => (headers.some((h) => h.trim() !== '' && countPhrase(r, h) > 0) ? [`${l.n}\u0000${i + 1}`] : []))));
  /** the words (line + word) a `~` rule asked about or settled: the line's own prose never asks that word again (one word, one question; the rule's ask wins) */
  const ruleWords = new Set();
  for (const w of words) {
    const at = tieOf(w.from, jobLines);
    const key = `${at.line}\u0000${at.rule ?? ''}\u0000${w.word.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const jl = jobLines.find((l) => l.n === at.line);
    const rules = lineRules(jl);
    const ruleText = at.rule === undefined ? String(jl?.text ?? '') : rules[at.rule - 1];
    const fact = (/** @type {string} */ column) => ({ line: at.line, ...(at.rule === undefined ? {} : { forRule: at.rule }), name: column, shape: /** @type {const} */ ('column'), column, words: [column], source: label });
    const rec = { line: at.line, ...(at.rule === undefined ? {} : { rule: at.rule }), fact: w.word, source: label };
    const found = findColumn(text, w.word);
    if (found.kind === 'header') {
      // a real header is kept only when the word is the PERSON'S: in the line or its ~ rules. A header the model picked in the person's place is not a check the person
      // asked for (live walk 2026-10-21: "Price over 500" kept as "Amount", nothing asked)
      if (!isYours(jl, w.word)) dropped.push({ ...rec, reason: 'word-not-yours' });
      else facts.push(fact(found.column));
      continue;
    }
    if (w.kind !== 'number') { dropped.push({ ...rec, reason: 'no-column' }); continue; }
    // a tie on a `~` rule's word ASKS which column (hamr 2026-11-17); the line's own prose has no rule to replace, so only that stays Not checked
    if (found.kind === 'tie' && at.rule === undefined) { dropped.push({ ...rec, reason: 'column-tie', other: found.columns.map((c) => `"${c}"`).join(', ') }); continue; }
    if (found.kind === 'none') { dropped.push({ ...rec, reason: 'no-fit', other: String(found.rows) }); continue; }
    if (found.kind === 'tie') {
      // a tie is never decided by code from ANOTHER rule of the line (hamr 2026-11-17: if code cannot decide, it asks); only THIS rule's own words naming a header settle it (the tiedRules skip below)
      ruleWords.add(`${at.line}\u0000${w.word.toLowerCase()}`);
      if (tiedRules.has(`${at.line}\u0000${at.rule}`)) continue;
      asks.push({
        line: at.line, rule: at.rule ?? null, source: 'look', ask: 'reading', ruleText, question: columnTieQuestion(w.word, found.columns, at.line), word: w.word, columns: found.columns,
        readings: Object.fromEntries(found.columns.map((c) => [c, ruleWithColumn(ruleText, w.word, c) ?? columnRuleWords(w.word, c)])),
      });
      continue;
    }
    // the person already named this column in a rule of the line (an answer they gave, or their own words): the word is that column, asked no more
    if (rules.some((r) => countPhrase(r, found.column) > 0)) { facts.push(fact(found.column)); continue; }
    if (at.rule !== undefined) ruleWords.add(`${at.line}\u0000${w.word.toLowerCase()}`);
    if (at.rule !== undefined && tiedRules.has(`${at.line}\u0000${at.rule}`)) continue;
    // F196: the line's prose word that a tied `~` rule of the line also says is settled by that rule (one word, one question, whichever the look tied the ask to)
    if (at.rule === undefined && rules.some((r, i) => tiedRules.has(`${at.line}\u0000${i + 1}`) && wordForms(w.word).some((f) => countPhrase(r, f) > 0))) continue;
    asks.push({
      line: at.line, rule: at.rule ?? null, source: 'look', ask: 'reading', ruleText, question: columnQuestion(w.word, found, at.line, at.rule !== undefined), reading: (at.rule === undefined ? null : ruleWithColumn(ruleText, w.word, found.column)) ?? columnRuleWords(w.word, found.column), word: w.word, column: found.column,
    });
  }
  return { facts, asks: asks.filter((a) => a.rule !== null || !ruleWords.has(`${a.line}\u0000${a.word.toLowerCase()}`)), dropped };
}

/**
 * Look at ONE sheet input: the call (once; once more if the answer is unreadable), then the rules.
 * `callModel(content, attempt)` makes and meters ONE model round and returns `{text}`, `{text, cutOff: true}` or `{error}`.
 * @param {{label: string, text: string, jobLines: {n: number, text: string, rule?: string, rules?: string[]}[], callModel: (content: string, attempt: number) => Promise<{text?: string, cutOff?: boolean, error?: string}>}} o
 * @returns {Promise<({ok: true, attempts: number} & ReturnType<typeof applySheetWords>)|{ok: false, reason: string, attempts: number}>}
 */
export async function lookAtSheet({ label, text, jobLines, callModel }) {
  const content = sheetPrompt({ jobLines, label, text });
  let attempts = 0;
  for (;;) {
    attempts += 1;
    const r = await callModel(content, attempts);
    if (r.error !== undefined) return { ok: false, reason: `the call about the sheet failed: ${r.error}`, attempts };
    const parsed = r.cutOff === true ? { ok: false } : parseSheetAnswer(r.text);
    if (parsed.ok) return { ok: true, attempts, ...applySheetWords(text, /** @type {any} */ (parsed).words, jobLines, label) };
    if (attempts >= 2) return { ok: false, reason: MAP_UNREADABLE.replace('about the page', 'about the sheet'), attempts };
  }
}

/** the label of the one paid call about a sheet, as the drafting book and the progress line see it (the sibling of `MAP_CALL_LABEL`) */
export const SHEET_CALL_LABEL = 'sheet-map';

/**
 * Run the sheet look: one call per CSV input, through the same call / book / retry / spend plumbing `runPageMap` uses (src/pagemap.js): the cap is checked BEFORE every call, a 429 waits the vendor's
 * stated time once, a transport failure is retried once, a failed attempt is booked UNPRICED, and each call's scrubbed answer rides `onCall` so the drafting log keeps it. Returns the same envelope.
 * `priorCalls` = what an earlier paid look of this draft already spent (the cap counts it).
 * @param {{texts: Record<string, string>, inputs: {n: number, label: string}[], jobLines: {n: number, text: string, rule?: string, rules?: string[]}[],
 *   provider?: any, maxTokens?: number, ceilingUsd?: number|null, callTimeoutMs?: number, priorCalls?: {costUsd: number|null, unpricedRounds: number}[],
 *   onCall?: (call: {label: string, costUsd: number|null, unpricedRounds: number, thinkingStatus?: string, raw?: string}) => void,
 *   createLoop?: (o: {system: string, onLlmResult: any, provider: any, rates?: {in: number, out: number}}) => any,
 *   rates?: {in: number, out: number}|null, callOptions?: Record<string, any>, sleep?: (ms: number) => Promise<void>}} o
 * @returns {Promise<{state: 'PRESENT'|'ABSENT', facts: any, reason: string|null, cause: string|null, meta: any, raw: string,
 *   raws: ReturnType<typeof scrubRaw>[], calls: {label: string, costUsd: number|null, unpricedRounds: number}[],
 *   budgetStop: 'cap-halt'|'pricing-red'|null}>}
 */
export async function runSheetLook({
  texts, inputs, jobLines, provider = null, maxTokens = AUTHOR_SCOUT_MAX_TOKENS, ceilingUsd = null, callTimeoutMs = AUTHOR_CALL_TIMEOUT_MS, priorCalls = [],
  onCall = () => {}, createLoop = defaultLoop, rates = null, callOptions = {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
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
    const call = { label: SHEET_CALL_LABEL, ...priceOf(r) };
    calls.push(call);
    const raw = scrubRaw({ label: SHEET_CALL_LABEL, attempt, text: r?.text });
    raws.push(raw);
    onCall({ ...call, raw: raw.text, ...(r?.thinkingStatus === undefined ? {} : { thinkingStatus: r.thinkingStatus }) });
  };
  const absent = (/** @type {string} */ reason, /** @type {string} */ cause, /** @type {'cap-halt'|'pricing-red'|null} */ budgetStop = null) => ({
    state: /** @type {'ABSENT'} */ ('ABSENT'), facts: null, reason, cause, meta: { attempts }, raw: '', raws, calls, budgetStop,
  });
  const halted = () => capStop({ ceilingUsd, ...tallyCalls([...priorCalls, ...calls]) });
  /** @type {any[]} */
  const dropped = [];
  /** @type {any[]} */
  const sheetAsks = [];
  /** @type {{source: string, asks: number}[]} */
  const maps = [];
  for (const label of Object.keys(texts)) {
    /** the stop the model seam met (a halt, a failed call): set inside `callModel`, read after `lookAtSheet` returns @type {{stop: {reason: string, cause: string, budgetStop: 'cap-halt'|'pricing-red'|null}|null}} */
    const met = { stop: null };
    let transportRetried = false;
    let rateRetried = false;
    const callModel = async (/** @type {string} */ content, /** @type {number} */ _attempt) => {
      for (;;) {
        // the cap is checked BEFORE every call, never inside one
        const halt = halted();
        if (halt) {
          met.stop = { reason: halt === 'cap-halt' ? `the AI's look at the sheet was not made: the $${ceilingUsd} ceiling was already spent` : 'the AI\'s look at the sheet was not made: spend could not be priced, so the ceiling could not be enforced', cause: SURVEY_CAUSES.NOT_FUNDED, budgetStop: halt };
          return { error: 'stopped' };
        }
        attempts += 1;
        const loop = createLoop({ system: SHEET_SYSTEM, onLlmResult: undefined, provider, ...priced });
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
          met.stop = { reason: `the call about the sheet failed: ${redactSecrets(casualty)}`, cause: SURVEY_CAUSES.CALL_FAILED, budgetStop: null };
          return { error: 'stopped' };
        }
        record(r, attempts);
        if (r?.error && !isOutputCutOff(r)) {
          met.stop = { reason: `the call about the sheet failed: ${redactSecrets(String(r.error))}`, cause: SURVEY_CAUSES.CALL_FAILED, budgetStop: null };
          return { error: 'stopped' };
        }
        return isOutputCutOff(r) ? { text: '', cutOff: true } : { text: r?.text };
      }
    };
    const got = await lookAtSheet({ label, text: texts[label], jobLines, callModel });
    if (met.stop !== null) return absent(met.stop.reason, met.stop.cause, met.stop.budgetStop);
    if (!got.ok) return absent(got.reason, SURVEY_CAUSES.UNPARSEABLE);
    dropped.push(...got.dropped);
    // a word of the line's own prose (no `~` rule) has no rule to replace: nothing is asked about it here (S1 asks about a `~` rule only)
    sheetAsks.push(...got.asks.filter((a) => a.rule !== null));
    maps.push({ source: label, asks: got.asks.length });
  }
  return {
    state: 'PRESENT', reason: null, cause: null, meta: { attempts, maps }, raw: '', raws, calls, budgetStop: null,
    facts: { rubricFiles: true, inputs: inputs.map((i) => ({ n: i.n, label: i.label })), look: { facts: [], prose: [], notFound: [], dropped, sheetAsks } },
  };
}

/**
 * The look door's default (src/authorjob.js `lookFn`): a CSV input (named in `sheets`) when a `~` rule is on some line gets the sheet look, one call per CSV; every other input gets the page-word map.
 * With no such CSV the call is `runPageMap`'s own, untouched. A job with both runs the page map first, then the sheet look (its spend counts the page map's).
 * @param {any} o the arguments of `runPageMap`, plus `sheets` (the labels of the inputs that are CSV, `isSheetInput`) @returns {ReturnType<typeof runPageMap>}
 */
export async function runLook(o) {
  const sheets = Array.isArray(o.sheets) ? /** @type {string[]} */ (o.sheets).filter((l) => typeof o.texts?.[l] === 'string') : [];
  if (sheets.length === 0 || !o.jobLines.some((/** @type {any} */ l) => lineRules(l).length > 0)) return runPageMap(o);
  const pick = (/** @type {Record<string, string>} */ texts, /** @type {boolean} */ sheet) => Object.fromEntries(Object.entries(texts).filter(([l]) => sheets.includes(l) === sheet));
  const pageTexts = pick(o.texts, false);
  const pageInputs = o.inputs.filter((/** @type {any} */ i) => !sheets.includes(i.label));
  const page = Object.keys(pageTexts).length > 0 ? await runPageMap({ ...o, texts: pageTexts, inputs: pageInputs }) : null;
  if (page !== null && page.state !== 'PRESENT') return page;
  const sheet = await runSheetLook({ ...o, texts: pick(o.texts, true), inputs: o.inputs.filter((/** @type {any} */ i) => sheets.includes(i.label)), priorCalls: page?.calls ?? [] });
  const calls = [...(page?.calls ?? []), ...sheet.calls];
  const raws = [...(page?.raws ?? []), ...sheet.raws];
  if (sheet.state !== 'PRESENT') return { ...sheet, calls, raws };
  const pl = page?.facts?.look;
  return {
    ...sheet, calls, raws, meta: { ...(page?.meta ?? {}), ...sheet.meta, attempts: (page?.meta?.attempts ?? 0) + sheet.meta.attempts },
    facts: { rubricFiles: true, inputs: o.inputs.map((/** @type {any} */ i) => ({ n: i.n, label: i.label })), look: { ...sheet.facts.look, facts: pl?.facts ?? [], prose: pl?.prose ?? [], notFound: pl?.notFound ?? [], dropped: [...(pl?.dropped ?? []), ...sheet.facts.look.dropped] } },
  };
}
