// SHAPE JOBS (itemShape), docs/product/ITEM33-BUILD.md "Addendum 2026-11-18: shape jobs", clause 1 "Offer", as rulings of hamr 2026-11-18 (2a) made it: the shape is proposed EARLIER, in a pre-call look before the asks, the same way the
// sheet look is (src/sheetlook.js): ONE AI call for the whole job (not one per input) answers "which job lines are a list of items with named fields, and what are the fields". The AI only SUGGESTS: it returns the shapes
// (fields, kinds, bounds, `fromRule`, extra fields, `itemCountFrom`, `alsoFitsRules`) and CODE builds or refuses every field (src/shapebuild.js, R1-R5) before `askRounds`, so the "rules or shape could both fit" ask joins the counted asks.
// There is no second place that proposes a shape: the row-edit turn (src/rowedit.js) is not offered one.
//   `shapeLookPrompt`   the call's user text (the job, the inputs bounded, the menu of src/shapemenu.js, the answer form); `SHAPE_SYSTEM` its system text (both are prompt registers, src/promptregisters.js);
//   `parseShapeAnswer`  strict: one JSON object `{"shapes":[...]}`, nothing else, no repair;
//   `runShapeLook`      the sibling of `runSheetLook`: the same call, book, retry and spend plumbing (the cap is checked BEFORE the call, a 429 waits the vendor's stated time once, a transport failure is retried once and the failed
//                       attempt is booked UNPRICED, each call's scrubbed answer rides `onCall`); an unreadable answer twice is a stop in plain words, as the sheet look's is;
//   `runLookWithShape`  the look door's default (src/authorjob.js `lookFn`): `runLook` (page map / sheet look) first, then the shape look when the bareguard this package runs carries `itemShape` (`shapeAvailable()`), the job has a line with a
//                       `~` rule that is no sheet line, and no input is a CSV. Its spend counts the earlier look's. OFF otherwise: the result is `runLook`'s, untouched.
// Not settled by the sheet look it mirrors (named): which lines are offered when a job has both a CSV and page lines (here none: a job with a CSV input is a sheet job, as the sheet turn already says); what a failed shape look
// costs the job (it stops the draft like the sheet look does, and the person is told in words about the shape).
import { priceOf, scrubRaw, tallyCalls, capStop, callCasualty } from './text.js';
import { redactSecrets } from './validate.js';
import { isTransportFailure } from './transport.js';
import { isRateLimited, rateLimitWaitMs } from './ratelimit.js';
import { isOutputCutOff } from './authorflow.js';
import { AUTHOR_CALL_TIMEOUT_MS, AUTHOR_SCOUT_MAX_TOKENS, SURVEY_CAUSES } from './authorscout.js';
import { MAP_UNREADABLE, defaultLoop } from './pagemap.js';
import { runLook } from './sheetlook.js';
import { lineRules } from './rubricstep.js';
import { SHAPE_KINDS, NAME_MAX_CHARS, shapeAvailable } from './shapemenu.js';

/** the label of the one paid call about a shape, as the drafting book and the progress line see it (the sibling of `SHEET_CALL_LABEL`) */
export const SHAPE_CALL_LABEL = 'shape-map';
/** how much of each input the call is shown (the POC's bound, declared in its preregistration) */
export const SHAPE_SHOWN_CHARS = 8000;
/** at most this many fields in one suggestion (bareguard allows 50 per `fields` object; a person's rule list is far shorter) */
export const MAX_SHAPE_FIELDS = 20;

export const SHAPE_SYSTEM = 'You map a person\'s job to the SHAPE of an answer: a list of items, each item with named fields. You never grade and never invent bounds: a bound is only what the person wrote. Reply with JSON only.';

/** the menu as the drafter reads it, one line per kind of src/shapemenu.js (the one place it is named): `  boolean: bounds equals` @returns {string[]} */
export function shapeMenuLines() {
  return Object.entries(SHAPE_KINDS).map(([k, b]) => `  ${k}: bounds ${b.length ? b.join(', ') : '(none)'}`);
}

/**
 * What the AI is told: the job (its `~` rules numbered per line), the inputs (bounded), the kind menu and the answer form.
 * @param {{jobLines: {n: number, text: string, rule?: string, rules?: string[]}[], lineNums: number[], texts: Record<string, string>}} o `lineNums` the lines a shape can be offered for
 * @returns {string}
 */
export function shapeLookPrompt({ jobLines, lineNums, texts }) {
  const job = jobLines.map((l) => `LINE ${l.n}: ${l.text}${lineRules(l).map((r, i) => `\n~ rule ${i + 1}: ${r}`).join('')}`).join('\n');
  const inputs = Object.entries(texts).map(([label, t]) => `Input "${label}"${t.length > SHAPE_SHOWN_CHARS ? ` (first ${SHAPE_SHOWN_CHARS} of ${t.length} characters)` : ''}:\n<<<\n${t.slice(0, SHAPE_SHOWN_CHARS)}\n>>>`).join('\n\n');
  return `THE JOB (each ~ rule applies to the line above it):\n${job}\n\nTHE INPUTS:\n${inputs}\n\n`
    + `A job line whose answer is a LIST OF ITEMS with named fields (for example one item per flight, per resume or per research topic) gets a shape. The lines a shape can be offered for: ${lineNums.join(', ')}. A line whose answer is not such a list gets none.\n`
    + '- "fields": one field for each ~ rule of the line that names something an item has; "fromRule" is that rule\'s number on the line (1 is its first rule).\n'
    + '- "extraFields": any other field you think would help (none is fine); its "fromRule" is null and code shows it to the person as a suggestion.\n'
    + '- "kind" is one of the kinds below and "bounds" holds only the bounds that kind accepts. Put in "bounds" only what the person wrote in that field\'s own rule; code drops every bound the person did not write. A yes/no rule ("the flight is nonstop") is kind boolean with "equals": true or false.\n'
    + '- "itemCountFrom": the labels of the inputs that give exactly one item each, only when the person wrote it ("one blurb per resume"); otherwise [].\n'
    + '- "alsoFitsRules": true only if the person\'s rules could just as well be checked as separate facts instead of as fields of a list of items.\n'
    + `- A field name is at most ${NAME_MAX_CHARS} characters and holds none of . : [ ] ; a list field writes its entries as "of": {"kind": "text", ...bounds}.\n\n`
    + `The field kinds (and the bounds each kind accepts):\n${shapeMenuLines().join('\n')}\n\n`
    + 'Return ONLY a JSON object, no prose, no code fence, with "shapes" empty when no line is a list of items:\n'
    + '{"shapes":[{"line":1,"fields":[{"name":"...","kind":"...","required":true,"bounds":{},"fromRule":1}],"extraFields":[{"name":"...","kind":"...","required":false,"bounds":{},"fromRule":null}],"itemCountFrom":[],"alsoFitsRules":false}]}';
}

/**
 * Read the AI's answer: ONE JSON object `{"shapes":[...]}`, each shape an object with a whole `line`, its `fields` and `extraFields` lists (an absent list is none). No repair: anything else is a malformed answer. What a field MEANS is judged by code (src/shapebuild.js).
 * @param {unknown} text @returns {{ok: true, shapes: Record<string, any>[]}|{ok: false}}
 */
export function parseShapeAnswer(text) {
  /** @type {any} */
  let m;
  try { m = JSON.parse(String(text ?? '').trim()); } catch { return { ok: false }; }
  if (m === null || typeof m !== 'object' || Array.isArray(m) || !Array.isArray(m.shapes)) return { ok: false };
  for (const s of m.shapes) {
    if (s === null || typeof s !== 'object' || Array.isArray(s) || !Number.isInteger(s.line)) return { ok: false };
    for (const k of ['fields', 'extraFields', 'itemCountFrom']) if (s[k] !== undefined && s[k] !== null && !Array.isArray(s[k])) return { ok: false };
  }
  return { ok: true, shapes: m.shapes };
}

/**
 * Run the shape look: ONE call for the job. The same call / book / retry / spend plumbing as `runSheetLook` (src/sheetlook.js).
 * @param {{texts: Record<string, string>, inputs: {n: number, label: string}[], jobLines: {n: number, text: string, rule?: string, rules?: string[]}[], lineNums: number[],
 *   provider?: any, maxTokens?: number, ceilingUsd?: number|null, callTimeoutMs?: number, priorCalls?: {costUsd: number|null, unpricedRounds: number}[],
 *   onCall?: (call: {label: string, costUsd: number|null, unpricedRounds: number, thinkingStatus?: string, raw?: string}) => void,
 *   createLoop?: (o: {system: string, onLlmResult: any, provider: any, rates?: {in: number, out: number}}) => any,
 *   rates?: {in: number, out: number}|null, callOptions?: Record<string, any>, sleep?: (ms: number) => Promise<void>}} o
 * @returns {Promise<{state: 'PRESENT'|'ABSENT', shapes: Record<string, any>[], reason: string|null, cause: string|null, raws: ReturnType<typeof scrubRaw>[], calls: {label: string, costUsd: number|null, unpricedRounds: number}[], budgetStop: 'cap-halt'|'pricing-red'|null}>}
 */
export async function runShapeLook({
  texts, jobLines, lineNums, provider = null, maxTokens = AUTHOR_SCOUT_MAX_TOKENS, ceilingUsd = null, callTimeoutMs = AUTHOR_CALL_TIMEOUT_MS, priorCalls = [],
  onCall = () => {}, createLoop = defaultLoop, rates = null, callOptions = {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const callTimeout = Number.isFinite(Number(callTimeoutMs)) && Number(callTimeoutMs) > 0 ? Math.min(Math.trunc(Number(callTimeoutMs)), AUTHOR_CALL_TIMEOUT_MS) : AUTHOR_CALL_TIMEOUT_MS;
  const priced = rates ? { rates } : {};
  /** @type {{label: string, costUsd: number|null, unpricedRounds: number}[]} */
  const calls = [];
  /** @type {ReturnType<typeof scrubRaw>[]} */
  const raws = [];
  const record = (/** @type {any} */ r, /** @type {number} */ attempt) => {
    const call = { label: SHAPE_CALL_LABEL, ...priceOf(r) };
    calls.push(call);
    const raw = scrubRaw({ label: SHAPE_CALL_LABEL, attempt, text: r?.text });
    raws.push(raw);
    onCall({ ...call, raw: raw.text, ...(r?.thinkingStatus === undefined ? {} : { thinkingStatus: r.thinkingStatus }) });
  };
  const absent = (/** @type {string} */ reason, /** @type {string} */ cause, /** @type {'cap-halt'|'pricing-red'|null} */ budgetStop = null) => ({ state: /** @type {'ABSENT'} */ ('ABSENT'), shapes: [], reason, cause, raws, calls, budgetStop });
  const content = shapeLookPrompt({ jobLines, lineNums, texts });
  let transportRetried = false;
  let rateRetried = false;
  let attempts = 0;
  for (;;) {
    // the cap is checked BEFORE every call, never inside one
    const halt = capStop({ ceilingUsd, ...tallyCalls([...priorCalls, ...calls]) });
    if (halt) return absent(halt === 'cap-halt' ? `the AI's look at the shape of the answer was not made: the $${ceilingUsd} ceiling was already spent` : 'the AI\'s look at the shape of the answer was not made: spend could not be priced, so the ceiling could not be enforced', SURVEY_CAUSES.NOT_FUNDED, halt);
    attempts += 1;
    const loop = createLoop({ system: SHAPE_SYSTEM, onLlmResult: undefined, provider, ...priced });
    /** @type {any} */
    let r;
    try {
      r = await loop.run([{ role: 'user', content }], [], { cacheMessages: true, maxTokens, timeoutMs: callTimeout, ...callOptions });
    } catch (e) {
      if (isRateLimited(e) && !rateRetried) {
        const wait = rateLimitWaitMs(e);
        if (wait !== null) { rateRetried = true; attempts -= 1; await sleep(wait); continue; }
      }
      const casualty = callCasualty(e) ?? (isTransportFailure(e) ? String(/** @type {any} */ (e)?.message ?? e) : null);
      if (casualty === null) throw e;
      // the failed attempt may already be billed: it is booked UNPRICED, so the spend stays "not complete" (never a $0)
      record({ error: casualty }, attempts);
      if (!transportRetried) { transportRetried = true; continue; }
      return absent(`the call about the shape of the answer failed: ${redactSecrets(casualty)}`, SURVEY_CAUSES.CALL_FAILED);
    }
    record(r, attempts);
    if (r?.error && !isOutputCutOff(r)) return absent(`the call about the shape of the answer failed: ${redactSecrets(String(r.error))}`, SURVEY_CAUSES.CALL_FAILED);
    const parsed = isOutputCutOff(r) ? { ok: false } : parseShapeAnswer(r?.text);
    if (parsed.ok) return { state: 'PRESENT', shapes: /** @type {any} */ (parsed).shapes, reason: null, cause: null, raws, calls, budgetStop: null };
    if (attempts >= 2) return absent(MAP_UNREADABLE.replace('about the page', 'about the shape of the answer'), SURVEY_CAUSES.UNPARSEABLE);
  }
}

/**
 * The look door's default (src/authorjob.js `lookFn`): `runLook` (the page map, or the sheet look for a CSV), then the shape look. Off (`runLook`'s own answer, untouched) unless this bareguard carries `itemShape`, no input is a CSV
 * (`sheets` empty), and a line has a `~` rule. The proposed shapes ride the look as `facts.look.shapes`; code builds them (src/authorjob.js, before the asks).
 * @param {any} o the arguments of `runLook`, plus `shape` (a test's override of `shapeAvailable()`) @returns {ReturnType<typeof runLook>}
 */
export async function runLookWithShape(o) {
  const base = await runLook(o);
  const on = o.shape ?? shapeAvailable();
  const sheets = Array.isArray(o.sheets) ? o.sheets : [];
  const lineNums = (Array.isArray(o.jobLines) ? o.jobLines : []).filter((/** @type {any} */ l) => lineRules(l).length > 0).map((/** @type {any} */ l) => l.n);
  if (!on || sheets.length > 0 || lineNums.length === 0 || base.state !== 'PRESENT' || typeof o.texts !== 'object' || o.texts === null) return base;
  const got = await runShapeLook({ ...o, lineNums, priorCalls: base.calls ?? [] });
  const calls = [...(base.calls ?? []), ...got.calls];
  const raws = [...(base.raws ?? []), ...got.raws];
  if (got.state !== 'PRESENT') return { ...base, state: 'ABSENT', facts: null, reason: got.reason, cause: got.cause, budgetStop: got.budgetStop, calls, raws };
  return { ...base, calls, raws, facts: { ...base.facts, look: { ...base.facts.look, shapes: got.shapes } } };
}
