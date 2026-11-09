// borrowed-from: fwdloop src/checkpick.js@v0.29.0 (scope, keepOrDrop, SUGGEST_SYSTEM/SUGGEST_SCHEMA, checkAsks, settleRules) and src/declaration.js@v0.29.0 (the guardrail* readers)
// R10 = fwdloop M10 amendment 16 ("shape guardrails are settled the way item 3-4 settle a source's words"). ONE AI call suggests, per `~` rule of a rubric job, ONE check
// from bareguard's own list (`rubricVocabulary`) or none; CODE keeps a suggestion only if its rule is on the list, it carries only that rule's own fields, every number
// is one the rule names and every word is a word of the rule; the person picks (agree / own words / drop it); the plan carries only the checks picked. The drafter writes
// no check of its own. The prompt, the per-rule answer form and the keep-or-drop are the ones fwd's F144c proved.
// Throws away: a suggestion's `id`, `field`, `strict`, `text` (code sets them, or they never decide); every rule that code scopes out; what the model says in words.
// bareloop differences from fwd (ruled 2026-11-09): rubric jobs only; the call runs over bareloop's own `askStructured` ladder (cost booked and the answer logged like every
// drafting call); a pick lands as a `countable` part of the line's rubric-step stage (src/rubricstep.js), carrying the `~` rule numbers it settles.
import { rubricVocabulary } from 'bareguard';
import { plainWords, OFFERED } from './checkwords.js';
import { KEPT_WORDS } from './pickrecord.js';
import { lineRules } from './rubricstep.js';

export { plainWords, OFFERED };

/** the one tool the suggestion call uses */
export const SUGGEST_TOOL = 'suggest_checks';
const VOCAB = /** @type {Record<string, {description: string, fields: Record<string, {type: string, required?: boolean}>}>} */ (rubricVocabulary.rules);
/** fields code sets, or that never decide: never offered, never kept */
const IGNORED = new Set(['id', 'field', 'text', 'strict']);
const NUM_FIELDS = ['value', 'size', 'wordsPerSection'];
const WORD_FIELDS = ['names', 'phrases'];

// ---- the guardrail readers (fwd src/declaration.js@v0.29.0) ------------------------------------------------------------------------------
const readNumber = (/** @type {string} */ t) => Number(t.replace(/,/g, ''));
/** every whole-output word number in a guardrail ("under 600 words" -> [600]); a "<n> words each" / "per section" size is never listed here @param {unknown} g @returns {number[]} */
export function guardrailWordNumbers(g) {
  if (typeof g !== 'string') return [];
  return [...g.matchAll(/(?<![\d,])(\d{1,3}(?:,\d{3})+|\d+)\s*words?\b(?!\s*(?:each|per\s+section)\b)/gi)].map((m) => readNumber(m[1]));
}
/** every standalone number in a guardrail's own text (digits not joined to letters) @param {unknown} g @returns {number[]} */
export function guardrailStandaloneNumbers(g) {
  if (typeof g !== 'string') return [];
  return [...g.matchAll(/(?<![A-Za-z0-9_.,])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?![A-Za-z0-9_])/g)].map((m) => Number(m[1].replace(/,/g, '')));
}
/** the "<n> words each" / "<n> words per section" size, or null @param {unknown} g @returns {number|null} */
export function guardrailWordsPerSection(g) {
  const m = typeof g === 'string' ? /(?<![\d,])(\d{1,3}(?:,\d{3})+|\d+)(?:\s*words?|ish(?:\s+words?)?)\s+(?:each|per\s+section)\b/i.exec(g) : null;
  return m ? readNumber(m[1]) : null;
}
const NUMBER_WORDS = /** @type {Record<string, number>} */ ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 });
/** the first "<N> sections" in a guardrail (digits, or one..ten), or null @param {unknown} g @returns {number|null} */
export function guardrailSectionCount(g) {
  const m = typeof g === 'string' ? /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:\w+\s+)?sections?\b/i.exec(g) : null;
  if (!m) return null;
  return /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
}
/** the first "<N> bullets / list items / items / lines / points" in a guardrail (digits, or one..ten), or null @param {unknown} g @returns {number|null} */
export function guardrailItemCount(g) {
  const m = typeof g === 'string' ? /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:\w+\s+)?(?:bullets?|bullet\s+points?|list\s+items?|items?|lines?|points?)\b/i.exec(g) : null;
  if (!m) return null;
  return /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
}
/** @param {unknown} g @returns {boolean} the rule is a COUNT bareguard checks (words, list items or lines, sections): code reads it, whatever the page look said about it */
export const isCountable = (g) => guardrailWordNumbers(g).length > 0 || guardrailItemCount(g) !== null || guardrailSectionCount(g) !== null;

// ---- scope, decided by CODE before the call ----------------------------------------------------------------------------------------------
/** @param {unknown} v @returns {boolean} the input is a web page (a URL), which routes its rules to the page words (facts) */
export const isUrlInput = (v) => /^https?:\/\//i.test(String(v ?? '').trim());
/** @param {{value?: string}[]|null|undefined} inputs @returns {boolean} the job signs an input that routes its rules to another signed part */
export const hasRoutingInput = (inputs) => (inputs ?? []).some((i) => isUrlInput(i?.value));
/**
 * A rule goes to this call unless the job signs an input that routes its rules elsewhere (a web page) AND the rule names no whole-output word number (the one thing the
 * shape reader still takes in such a job). fwd's F144b `codeScope`.
 * @param {{value?: string}[]|null|undefined} inputs @param {string} g @returns {'in'|'out'}
 */
export const codeScope = (inputs, g) => (hasRoutingInput(inputs) && guardrailWordNumbers(g).length === 0 ? 'out' : 'in');

/** @typedef {{line: number, rule: number, text: string}} Rule */
/**
 * Every `~` rule of a rubric job that this call settles, in line order. `rule` is the rule's number on its line (the number a part's `rules` and the answers use). A rule a
 * kept page word already carries (the look tied it by line and rule number) or that the look already put under Not checked is left to that, EXCEPT a countable rule (`isCountable`: a word, list-item/line or section count), which always comes here: the look's fact stays beside the pick (keep-both). A repeated text on a line is
 * one rule here, asked once.
 * @param {{n: number, rule?: string, rules?: string[]}[]} jobLines @param {{inputs?: {value?: string}[]|null, look?: any}} [o]
 * @returns {Rule[]}
 */
export function scopedRules(jobLines, { inputs = null, look = null } = {}) {
  const facts = Array.isArray(look?.facts) ? look.facts : [];
  const dropped = Array.isArray(look?.dropped) ? look.dropped : [];
  /** @type {Rule[]} */
  const out = [];
  for (const l of Array.isArray(jobLines) ? jobLines : []) {
    const seen = new Set();
    lineRules(l).forEach((text, i) => {
      const key = text.trim().toLowerCase();
      const n = i + 1;
      if (seen.has(key) || codeScope(inputs, text) !== 'in') return;
      // a countable rule always reaches the pick offer: what the look tied or dropped on it stays (keep-both), but never hides the count from the person
      if (!isCountable(text)) {
        if (facts.some((/** @type {any} */ f) => f?.line === l.n && f?.forRule === n)) return;
        if (dropped.some((/** @type {any} */ d) => d?.line === l.n && d?.rule === n)) return;
      }
      seen.add(key);
      out.push({ line: l.n, rule: n, text });
    });
  }
  return out;
}

// ---- code's keep-or-drop (am16 (2)) ------------------------------------------------------------------------------------------------------
const norm = (/** @type {unknown} */ t) => String(t).toLowerCase().replace(/\s+/g, ' ').trim();
const tokens = (/** @type {unknown} */ t) => new Set(norm(t).match(/[\p{L}\p{N}]+/gu) ?? []);

/**
 * Keep a suggestion only if its rule is on bareguard's list, it carries only that rule's own fields, every number in it is a number the guardrail names and every word in it
 * is a word of the guardrail. Anything else is dropped, with the reason. `none` is a drop with the reason `none`.
 * @param {string} guardrail @param {any} sug the model's entry for this guardrail
 * @returns {{kept: true, check: Record<string, any>}|{kept: false, why: string}}
 */
export function keepOrDrop(guardrail, sug) {
  if (sug == null || typeof sug !== 'object') return { kept: false, why: 'unreadable suggestion' };
  const { rule } = sug;
  if (rule === 'none' || rule === undefined || rule === null) return { kept: false, why: 'none' };
  if (typeof rule !== 'string' || !Object.hasOwn(VOCAB, rule)) return { kept: false, why: `rule "${rule}" is not on bareguard's list` };
  if (!OFFERED.includes(rule)) return { kept: false, why: `rule "${rule}" is on bareguard's list but is not offered here` };
  const own = Object.keys(VOCAB[rule].fields).filter((k) => !IGNORED.has(k));
  for (const k of own) if (VOCAB[rule].fields[k].required && sug[k] == null) return { kept: false, why: `${rule} needs ${k}` };
  const allowed = new Set([...own, 'rule', 'line', 'guardrail']);
  for (const k of Object.keys(sug)) if (sug[k] != null && !allowed.has(k)) return { kept: false, why: `${rule} does not take ${k}` };
  /** @type {Record<string, any>} */
  const check = { rule };
  for (const k of own) {
    const v = sug[k];
    if (v == null) continue;
    if (NUM_FIELDS.includes(k)) {
      if (!Number.isInteger(v) || v < 1) return { kept: false, why: `${k} ${JSON.stringify(v)} is not a whole number >= 1` };
      const named = rule === 'maxWords' || rule === 'minWords' ? guardrailWordNumbers(guardrail)
        : k === 'wordsPerSection' ? [guardrailWordsPerSection(guardrail)].filter((x) => x !== null)
          : guardrailStandaloneNumbers(guardrail);
      if (!named.includes(v)) return { kept: false, why: `${k} ${v} is not a number the guardrail names (${named.join(', ') || 'it names none'})` };
      check[k] = v;
    } else if (WORD_FIELDS.includes(k)) {
      if (!Array.isArray(v) || v.length === 0 || v.some((s) => typeof s !== 'string' || s.trim() === '')) return { kept: false, why: `${k} is not a list of words` };
      const gTok = tokens(guardrail);
      const gNorm = norm(guardrail);
      for (const s of v) {
        if (!gNorm.includes(norm(s))) return { kept: false, why: `${k} "${s}" is not in the guardrail's words` };
        for (const t of tokens(s)) if (!gTok.has(t)) return { kept: false, why: `${k} word "${t}" is not a word of the guardrail` };
      }
      check[k] = v;
    }
  }
  if (rule === 'sections' || rule === 'sectionOrder' || rule === 'sectionWords') {
    const want = guardrailSectionCount(guardrail);
    if (want !== null && check.names.length !== want) return { kept: false, why: `the guardrail says ${want} sections; the check has ${check.names.length}` };
  }
  return { kept: true, check };
}

// ---- the call: prompt, answer form (fwd F144c, per-rule anyOf) ---------------------------------------------------------------------------
const vocabBlock = OFFERED.map((r) => `- ${VOCAB[r].description}`).join('\n');
export const SUGGEST_SYSTEM = `You help a person turn the guardrails written under the lines of a job into mechanical checks.
You are given the job's lines. Under a line, its guardrails are numbered g1, g2, ... You are also given the checks the checker can run.

For EACH guardrail, call ${SUGGEST_TOOL} with one entry: the one check from the list that checks exactly what that guardrail says, or the rule "none".

Rules:
- Use only a rule from the list below, with only the fields that rule takes. Do not set id, field, strict or text: code sets them.
- Use only numbers the guardrail itself states, and only words the guardrail itself contains. Never add a section name, phrase or number the guardrail does not state.
- Suggest \`sections\` or \`sectionWords\` only when the guardrail itself names the sections.
- A guardrail like 'all under N words' or 'under N words' is about the whole answer: use maxWords N.
- If no check on the list checks exactly what the guardrail says (it is about content, sources, prices, columns, or a count the list cannot check exactly), answer "none". A check that is weaker than, or different from, the guardrail is worse than "none".
- Answer for every guardrail once, using the line number and the guardrail number shown.

Checks the checker can run (rule({ fields })):
${vocabBlock}`;

/**
 * The user message: the job's lines, and under a line only the guardrails this call settles, numbered by their rule number on the line.
 * @param {{n: number, text: string}[]} lines @param {Rule[]} scoped @returns {string}
 */
export function suggestUserText(lines, scoped) {
  const out = ['The job:'];
  for (const l of lines) {
    out.push(`${l.n}. ${l.text}`);
    for (const s of scoped) if (s.line === l.n) out.push(`   g${s.rule}: ${s.text}`);
  }
  return out.join('\n');
}

const JSON_TYPE = /** @type {Record<string, any>} */ ({ integer: { type: 'integer', minimum: 1 }, 'string-list': { type: 'array', minItems: 1, items: { type: 'string' } } });
/** @param {string} rule @returns {object} one variant of the answer form: exactly that rule's own fields, nothing else */
function variant(rule) {
  /** @type {Record<string, any>} */
  const properties = { line: { type: 'integer', description: 'the job line number' }, guardrail: { type: 'integer', description: 'the guardrail number under that line (g1 = 1)' }, rule: { const: rule } };
  const required = ['line', 'guardrail', 'rule'];
  if (rule !== 'none') {
    for (const [k, f] of Object.entries(VOCAB[rule].fields)) {
      if (IGNORED.has(k)) continue;
      properties[k] = JSON_TYPE[f.type];
      if (f.required) required.push(k);
    }
  }
  return { type: 'object', properties, required, additionalProperties: false };
}
/** the tool's parameter schema: one `anyOf` variant per offered rule, plus `none` */
export const SUGGEST_SCHEMA = Object.freeze({
  type: 'object',
  properties: { checks: { type: 'array', description: 'One entry per guardrail.', items: { anyOf: [...OFFERED, 'none'].map(variant) } } },
  required: ['checks'],
  additionalProperties: false,
});

/** the instruction a retry carries (the structured ladder's own words, naming this tool) */
export const SUGGEST_INSTRUCTION = `Your reply did not deliver exactly one ${SUGGEST_TOOL} call. Call ${SUGGEST_TOOL} exactly once, with one entry per guardrail as its arguments. Do not write the answer as text.`;

/** @param {{calls: any[]}} box the tool the suggestion call is made through; it records and acknowledges, and takes no action */
export const suggestTool = (box) => ({
  name: SUGGEST_TOOL,
  description: 'Deliver your suggestion for every guardrail. Call this exactly once, with one entry per guardrail.',
  parameters: SUGGEST_SCHEMA,
  execute: async (/** @type {any} */ args) => { box.calls.push(args); return 'suggestions received'; },
});
/** the channel `askStructured` (src/authorflow.js) runs the call over */
export const suggestChannel = () => ({
  name: SUGGEST_TOOL,
  instruction: SUGGEST_INSTRUCTION,
  textPath: 'checks',
  tool: (/** @type {{calls: any[]}} */ box) => suggestTool(box),
});

/**
 * The check CODE proposes for a count rule when the call yields none (R10, ours; fwd has no such fallback): a bullets / list-items / points count -> listItems N, a lines count ->
 * maxLines N, ONE word number -> minWords N when the rule says "at least / minimum / more than", else maxWords N. A section count names no sections, so none is built; a rule naming two different counts ("3 bullets under 80 words") is not built either; a rule with
 * several word numbers or a range ("between 100 and 200 words") is not guessed. The result passes `keepOrDrop`, so every number is one the rule names.
 * @param {string} text @returns {Record<string, any>|null}
 */
export function countCheck(text) {
  const items = guardrailItemCount(text);
  const words = guardrailWordNumbers(text);
  /** @type {Record<string, any>|null} */
  let built = null;
  if (items !== null && (words.length > 0 || guardrailSectionCount(text) !== null)) return null; // two different counts in one rule: first-match readers would guess, so nothing is built
  if (items !== null) built = { rule: /\blines?\b/i.test(text) && !/\b(bullets?|items?|points?)\b/i.test(text) ? 'maxLines' : 'listItems', value: items };
  else if (words.length === 1 && !/\bbetween\b|\d\s*(?:-|–|to)\s*\d/i.test(text)) built = { rule: /\b(at least|min(?:imum)?|more than|over|no fewer than)\b/i.test(text) ? 'minWords' : 'maxWords', value: words[0] };
  if (built === null) return null;
  const res = keepOrDrop(text, built);
  return res.kept ? res.check : null;
}

/**
 * What the call's answer comes to, one row per scoped rule: the check kept (or null) and why it was dropped. A rule the answer never mentions is dropped as `no entry`; an
 * entry for a rule that was not sent is ignored.
 * @param {Rule[]} scoped @param {any} args the tool call's arguments
 * @returns {(Rule & {check: Record<string, any>|null, why: string|null})[]}
 */
export function rowsFromAnswer(scoped, args) {
  const entries = Array.isArray(args?.checks) ? args.checks : [];
  return scoped.map((s) => {
    const e = entries.find((/** @type {any} */ x) => x?.line === s.line && x?.guardrail === s.rule);
    const res = e === undefined ? /** @type {ReturnType<typeof keepOrDrop>} */ ({ kept: false, why: 'no entry' }) : keepOrDrop(s.text, e);
    if (res.kept) return { ...s, check: res.check, why: null };
    // R10 (hamr 2026-11-09): a count rule is never "I can't check this"; with no kept pick from the call, CODE proposes the check its own readers name
    const own = countCheck(s.text);
    return { ...s, check: own, why: own ? null : res.why };
  });
}

// ---- the asks (words are item 4's) -------------------------------------------------------------------------------------------------------
/** the can't-check ask, as the signed words say it */
export const CANT_CHECK_WORDS = "I can't check this. Your own words, or Not checked?";
/** how every answer is told, once (fwd am2 item 2's words) */
const HOW_TO_ANSWER = (/** @type {number} */ line, /** @type {boolean} */ agree) => `${agree ? 'Answer "agree" to use it, or type your own words' : 'Type your own words'} (your answer is added as a new ~ rule on line ${line}), or answer "drop it" to leave it Not checked.`;

/**
 * @typedef {{line: number, rule: number, source: 'look', ask: 'check'|'no-check', ruleText: string, question: string, reading?: string, check?: Record<string, any>, counted: boolean, pairRule?: number}} PickAsk
 */
/**
 * The asks for the rows: `Line n, guardrail "<...>": I propose <check in plain words>.` for a kept check, `Line n, guardrail "<...>": I can't check this. Your own words, or
 * Not checked?` when nothing was kept. A proposal is not counted toward the 3-ask cap; a can't-check ask is (fwd am16 (5)). Both ride the existing code-forced look ask path
 * (`source: 'look'`), so the chat message, the answer words and the draft log rows are the look asks' own.
 * @param {ReturnType<typeof rowsFromAnswer>} rows @returns {PickAsk[]}
 */
export function checkAsks(rows) {
  return rows.map((r) => {
    const pair = typeof (/** @type {any} */ (r).pairRule) === 'number' ? { pairRule: /** @type {any} */ (r).pairRule } : {};
    if (r.check === null) {
      return { ...pair, line: r.line, rule: r.rule, source: 'look', ask: 'no-check', ruleText: r.text, counted: true, question: `Line ${r.line}, guardrail "${r.text}": ${CANT_CHECK_WORDS} ${HOW_TO_ANSWER(r.line, false)}` };
    }
    const words = plainWords(/** @type {any} */ (r.check));
    return { ...pair, line: r.line, rule: r.rule, source: 'look', ask: 'check', ruleText: r.text, counted: false, reading: words, check: r.check, question: `Line ${r.line}, guardrail "${r.text}": I propose ${words}. ${HOW_TO_ANSWER(r.line, true)}` };
  });
}

// ---- the plan uses only the checks you picked (am16 (4)) ---------------------------------------------------------------------------------
/**
 * @typedef {{line: number, rule: number, check: Record<string, any>|null, added?: string, own?: boolean, kept?: boolean}} Pick
 *   `check` = the check the person agreed to (null for their own words); `added` = the `~` rule the answer wrote on the line; `own` = their own words
 * @typedef {'person-left'|'own-words'|'no-pick'} NoteReason
 */
/** the one table of Not checked reasons, in the person's words (fwd src/pagedropwords.js, adapted) @type {Record<NoteReason, string>} */
export const NOTE_WORDS = Object.freeze({
  'person-left': 'You chose to leave it Not checked, so you judge it at Accept.',
  'own-words': 'Your own words are on the line; the machine has no check for them, so you judge it at Accept.',
  'no-pick': 'No check was picked for it, so you judge it at Accept.',
});

/**
 * Settle every scoped rule against the person's answers: a rule with a picked check is checked (and the `~` line an agree wrote is covered by that pick); every other rule is
 * Not checked, with the reason (`person-left` = they chose it, `own-words` = they gave their own words, `no-pick` = nothing was picked).
 * @param {Rule[]} rules @param {Pick[]} picks @param {{line: number, rule: number, kept?: boolean}[]} left @param {{n: number, rule?: string, rules?: string[]}[]} jobLines the lines AFTER the answers were added
 * @returns {{checks: {line: number, text: string, check: Record<string, any>, rules: number[], kept: boolean}[], notes: (Rule & {reason: NoteReason, also: number[], kept: boolean})[]}}
 */
export function settleRules(rules, picks, left, jobLines) {
  /** @type {{line: number, text: string, check: Record<string, any>, rules: number[], kept: boolean}[]} */
  const checks = [];
  /** @type {(Rule & {reason: NoteReason, also: number[], kept: boolean})[]} */
  const notes = [];
  /** the rule number the answer's added `~` line has on its line (a `~` line is a rule of its own) @param {number} line @param {string|undefined} added @returns {number[]} */
  const addedNo = (line, added) => {
    if (typeof added !== 'string') return [];
    const at = lineRules(jobLines.find((l) => l.n === line) ?? {}).findLastIndex((t) => norm(t) === norm(added));
    return at >= 0 ? [at + 1] : [];
  };
  for (const r of rules) {
    // the `~` line an answer wrote is covered by its pick (a carried card already holds it as a rule of its own): never settled twice
    if (picks.some((p) => p.line === r.line && p.rule !== r.rule && typeof p.added === 'string' && norm(p.added) === norm(r.text))) continue;
    const own = picks.find((p) => p.line === r.line && p.rule === r.rule);
    if (own?.check) { checks.push({ line: r.line, text: r.text, check: own.check, rules: [r.rule, ...addedNo(r.line, own.added)], kept: own.kept === true }); continue; }
    const also = addedNo(r.line, own?.added);
    const lf = left.find((l) => l.line === r.line && l.rule === r.rule);
    if (lf) notes.push({ ...r, reason: 'person-left', also, kept: lf.kept === true });
    else if (own?.own) notes.push({ ...r, reason: 'own-words', also, kept: own.kept === true });
    else notes.push({ ...r, reason: 'no-pick', also, kept: false });
  }
  return { checks, notes };
}

/** the reason a part the drafter could not express as a check is listed under Not checked (fwd's am16: the drafter writes no check of its own, what no rule can check is the person's to judge) */
export const UNCHECKABLE_WORDS = 'No rule can check this, so you judge it at Accept.';

/**
 * RUBRIC jobs only (the caller gates on the job's lang): a part the drafter wrote as `none` or `judged` is a thing no rule can check, so it is
 * listed under Not checked with its own words instead of failing the whole plan (hamr's ruling 2026-11-09, as fwd lists what the drafter cannot check).
 * A part that is a verbatim copy of one of the person's `~` rules, or lists rule numbers, gives a `refused` entry per rule no other part carries (shown as that rule's own words); a part that is NOT a verbatim copy of a rule (the job sentence itself, the drafter's own wording) also becomes one line in `notes`, so its words are never lost. Never silent, never a line-level refusal (that would silence the line's other rule reds).
 * Runs BEFORE applyPicks, so a rule the person's picks settle gets code's own reason there. `guard` and every other class are untouched.
 * A stage left with no parts stays: an empty stage is the legal prose stage ("what the text says - you judge it at Accept"). Pure.
 * @param {any} declaration @param {any[]|null|undefined} jobLines @param {boolean} rubric whether the job is a rubric job (the draft gate's `lang === RUBRIC_LANG`); anything else is returned untouched, its reds stand @returns {any}
 */
export function moveUncheckable(declaration, jobLines, rubric) {
  if (rubric !== true) return declaration;
  const isRec = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!isRec(declaration) || !Array.isArray(declaration.stages)) return declaration;
  const unchecked = (/** @type {any} */ x) => isRec(x) && (x.class === 'none' || x.class === 'judged');
  const isStage = (/** @type {any} */ st) => isRec(st) && st.kind === 'rubric-step' && isRec(st.params) && Array.isArray(st.params.parts);
  if (!declaration.stages.some((/** @type {any} */ st) => isStage(st) && st.params.parts.some(unchecked))) return declaration;
  const refused = Array.isArray(declaration.refused) ? [...declaration.refused] : [];
  const notes = Array.isArray(declaration.notes) ? [...declaration.notes] : [];
  /** @type {{line: number, part: any}[]} */
  const moved = [];
  const stages = declaration.stages.map((/** @type {any} */ st) => {
    if (!isStage(st) || !st.params.parts.some(unchecked)) return st;
    for (const part of st.params.parts.filter(unchecked)) moved.push({ line: st.params.step, part });
    return { ...st, params: { ...st.params, parts: st.params.parts.filter((/** @type {any} */ x) => !unchecked(x)) } };
  });
  const carried = (/** @type {number} */ line, /** @type {number} */ n) => stages.some((/** @type {any} */ st) => isStage(st) && st.params.step === line
    && st.params.parts.some((/** @type {any} */ x) => isRec(x) && Array.isArray(x.rules) && x.rules.includes(n)));
  const say = (/** @type {unknown} */ t) => String(t ?? '').replace(/\s+/g, ' ').trim();
  const same = (/** @type {unknown} */ a, /** @type {unknown} */ b) => say(a).replace(/[.]$/, '').toLowerCase() === say(b).replace(/[.]$/, '').toLowerCase();
  for (const { line, part } of moved) {
    const jl = (jobLines ?? []).find((/** @type {any} */ l) => isRec(l) && l.n === line);
    const ruleTexts = jl ? lineRules(jl) : [];
    /** the `~` rules the part's own words ARE (a verbatim copy of the person's rule: that rule is checked or listed by its own owner, the part says nothing more) */
    const echoed = ruleTexts.flatMap((t, i) => (same(t, part.text) ? [i + 1] : []));
    const named = Array.isArray(part.rules) ? part.rules.filter((/** @type {any} */ n) => Number.isInteger(n) && n >= 1 && n <= ruleTexts.length) : [];
    // the words the person's own rules already say are not repeated as unchecked (a pick may check them): a part reading "<sentence>, <rule>, <rule>" lists the sentence only
    const rest = [...ruleTexts].sort((a, b) => b.length - a.length).reduce((w, t) => (t ? w.split(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).join(',') : w), say(part.text)).replace(/(\s*[,;]\s*)+/g, ', ').replace(/^[,;\s]+|[,;\s]+$/g, '');
    if (echoed.length === 0 && (rest !== '' || say(part.text) === '')) {
      const words = rest;
      const text = `line ${line}: ${words ? `"${words}"` : 'a part of this line'} \u2014 ${UNCHECKABLE_WORDS}`;
      if (!notes.includes(text)) notes.push(text);
    }
    for (const n of new Set([...echoed, ...named])) {
      if (carried(line, n) || refused.some((/** @type {any} */ r) => isRec(r) && r.line === line && r.rule === n)) continue;
      refused.push({ line, rule: n, reason: UNCHECKABLE_WORDS });
    }
  }
  return { ...declaration, stages, ...(refused.length ? { refused } : {}), ...(notes.length ? { notes } : {}) };
}

/** a part of a rubric-step stage, from a pick: the check's own fields, the rule's words, and the `~` rule numbers it carries out @param {Record<string, any>} check @param {string} text @param {number[]} rules */
export function partOfPick(check, text, rules) {
  const { rule, ...fields } = check;
  return { text, class: 'countable', check: rule, ...fields, rules };
}

/**
 * Put the person's picks into the drafted declaration (a pure function; the input is untouched): on every rubric-step stage of a line this call settles, the drafter's own
 * word/section/line/list/phrase checks are gone (the drafter writes none, whatever it sent), a part per picked check is added carrying the `~` rule numbers it settles, and every
 * other settled rule goes under Not checked (`refused` with a rule number and the reason). A rule a fact or guard part of the draft already carries is left to that part.
 * With no picks settled (`null`) it only drops a `picks` record the drafter sent.
 * @param {any} declaration @param {ReturnType<typeof settleRules>|null} settled @returns {any}
 */
export function applyPicks(declaration, settled) {
  const isRec = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!isRec(declaration) || !Array.isArray(declaration.stages)) return declaration;
  // the record of picks is code's alone: whatever the drafter sent under `picks` is gone, and with no picks settled none is written
  if (settled === null) { const { picks: _drafted, ...rest } = declaration; return rest; }
  const lines = new Set([...settled.checks.map((c) => c.line), ...settled.notes.map((n) => n.line)]);
  // the drafter writes no count of its own: a shape check or a claim count (minClaims / maxClaims) it sent is gone, whatever the line (fwd am22's strip, one owner here)
  const shape = (/** @type {any} */ p) => isRec(p) && p.class === 'countable' && (OFFERED.includes(p.check) || p.check === 'minClaims' || p.check === 'maxClaims');
  /** the record of what was added, `{line, part}` each: the signed close keeps it, so a pick beside a fact is told from a drafter's own count @type {{line: number, part: any}[]} */
  const record = [];
  const stages = declaration.stages.map((/** @type {any} */ st) => {
    if (!(isRec(st) && st.kind === 'rubric-step' && isRec(st.params) && Array.isArray(st.params.parts) && lines.has(st.params.step))) return st;
    /** the numbers the person's picks on this line check (a picked count) @type {number[]} */
    const vals = settled.checks.filter((c) => c.line === st.params.step).map((c) => c.check.value).filter((v) => typeof v === 'number');
    // a fact part's `count` that restates a picked count is the drafter's second copy of the person's rule: gone (the fact itself stays)
    const restates = (/** @type {any} */ p) => isRec(p) && p.class === 'fact' && isRec(p.count) && [p.count.min, p.count.max].some((v) => vals.includes(v));
    const kept = st.params.parts.filter((/** @type {any} */ p) => !shape(p)).map((/** @type {any} */ p) => { if (!restates(p)) return p; const { count: _restated, ...rest } = p; return rest; });
    const add = settled.checks.filter((c) => c.line === st.params.step).map((c) => partOfPick(c.check, c.text, c.rules));
    for (const part of add) record.push({ line: st.params.step, part });
    return { ...st, params: { ...st.params, parts: [...kept, ...add] } };
  });
  const carried = (/** @type {number} */ line, /** @type {number} */ n) => stages.some((/** @type {any} */ st) => isRec(st) && st.kind === 'rubric-step' && isRec(st.params) && st.params.step === line
    && Array.isArray(st.params.parts) && st.params.parts.some((/** @type {any} */ x) => isRec(x) && (x.class === 'fact' || x.class === 'guard' || !shape(x)) && Array.isArray(x.rules) && x.rules.includes(n)));
  const refused = Array.isArray(declaration.refused) ? [...declaration.refused] : [];
  /** a drafter-listed entry for a rule this call settles is replaced by code's */
  const mine = (/** @type {any} */ r) => isRec(r) && Number.isInteger(r.line) && Number.isInteger(r.rule)
    && settled.notes.some((x) => x.line === r.line && (x.rule === r.rule || x.also.includes(r.rule)));
  const base = refused.filter((r) => !mine(r));
  for (const x of settled.notes) {
    if (carried(x.line, x.rule)) continue;
    for (const n of [x.rule, ...x.also]) base.push({ line: x.line, rule: n, reason: `${NOTE_WORDS[x.reason]}${x.kept ? ` (${KEPT_WORDS})` : ''}` });
  }
  const { picks: _drafted, ...rest } = declaration;
  return { ...rest, stages, ...(record.length ? { picks: record } : {}), ...(base.length ? { refused: base } : {}) };
}

/** the `source` of a part is missing: absent, not a string, or only white space */
const noSource = (/** @type {any} */ p) => typeof p.source !== 'string' || p.source.trim() === '';
/** the fields a fact part may carry; a part with any other field is never merged (its extra field would be lost) */
const FACT_FIELDS = ['text', 'class', 'covers', 'rules', 'source', 'facts', 'count'];

/**
 * RUBRIC jobs only (the caller gates on the job's lang; anything else is returned untouched, its reds stand). Two small, mechanical steps on every rubric-step stage, run
 * before validation (hamr's ruling 2026-11-09):
 *  F1 source fill: when the job has EXACTLY ONE input label, a `fact` part, or a `cited` part, whose `source` is missing or empty gets that label. With 2+ labels nothing is filled; a
 *     wrong non-empty source is never rewritten (its red stands).
 *  F2 fact merge: when ONE stage holds 2+ `fact` parts they become ONE fact part (where the first stood): the `facts` of all in order, the union of `rules` and of `covers`, the one shared
 *     `source`, the `text`s joined with "; ". Only when it is safe, else the parts stay and the existing second-fact-list red fires: the sources differ (after F1), two facts share a name
 *     (compared white-space and case blind), the parts' `count`s differ (a part with no count agrees with any; the merged part carries the one count), a part is not a plain object or has a
 *     field a fact part does not carry, or `facts` is not a list.
 * Runs AFTER applyPicks (its strip of a count that restates a pick has already happened). Pure.
 * @param {any} declaration @param {string[]|null|undefined} inputLabels the labels of the job's inputs @param {boolean} rubric the draft gate's `lang === RUBRIC_LANG` @returns {any}
 */
export function fillAndMergeFacts(declaration, inputLabels, rubric) {
  if (rubric !== true) return declaration;
  const isRec = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!isRec(declaration) || !Array.isArray(declaration.stages)) return declaration;
  const only = Array.isArray(inputLabels) && inputLabels.length === 1 && typeof inputLabels[0] === 'string' && inputLabels[0] !== '' ? inputLabels[0] : null;
  const isFact = (/** @type {any} */ p) => isRec(p) && p.class === 'fact';
  const sortKeys = (/** @type {any} */ v) => JSON.stringify(v, (_k, x) => (isRec(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
  const nameOf = (/** @type {any} */ f) => (isRec(f) && typeof f.name === 'string' ? f.name.replace(/\s+/g, ' ').trim().toLowerCase() : null);
  const union = (/** @type {any[]} */ parts, /** @type {string} */ key) => {
    const all = parts.flatMap((p) => (Array.isArray(p[key]) ? p[key] : []));
    return all.filter((x, i) => all.findIndex((y) => sortKeys(y) === sortKeys(x)) === i);
  };
  /** @param {any[]} parts @returns {any|null} the merged part, or null when merging is not safe */
  const merge = (parts) => {
    if (!parts.every((p) => Object.keys(p).every((k) => FACT_FIELDS.includes(k)) && Array.isArray(p.facts))) return null;
    if (new Set(parts.map((p) => p.source)).size !== 1) return null;
    const names = parts.flatMap((p) => p.facts.map(nameOf));
    if (names.some((n) => n === null) || new Set(names).size !== names.length) return null;
    const counts = parts.filter((p) => p.count !== undefined).map((p) => sortKeys(p.count));
    if (new Set(counts).size > 1) return null;
    const texts = parts.map((p) => (typeof p.text === 'string' ? p.text.trim() : '')).filter((t, i, a) => t !== '' && a.indexOf(t) === i);
    const rules = union(parts, 'rules'), covers = union(parts, 'covers');
    const withCount = parts.find((p) => p.count !== undefined);
    return {
      ...(texts.length ? { text: texts.join('; ') } : {}), class: 'fact', source: parts[0].source,
      ...(covers.length ? { covers } : {}), ...(rules.length ? { rules } : {}), facts: parts.flatMap((p) => p.facts),
      ...(withCount ? { count: withCount.count } : {}),
    };
  };
  let changed = false;
  const stages = declaration.stages.map((/** @type {any} */ st) => {
    if (!(isRec(st) && st.kind === 'rubric-step' && isRec(st.params) && Array.isArray(st.params.parts))) return st;
    let parts = st.params.parts;
    if (only !== null) {
      parts = parts.map((/** @type {any} */ p) => (isRec(p) && (p.class === 'fact' || (p.class === 'countable' && p.check === 'cited')) && noSource(p) ? { ...p, source: only } : p));
    }
    const facts = parts.filter(isFact);
    const merged = facts.length > 1 ? merge(facts) : null;
    if (merged) parts = parts.flatMap((/** @type {any} */ p) => (p === facts[0] ? [merged] : isFact(p) ? [] : [p]));
    if (parts.every((/** @type {any} */ p, /** @type {number} */ i) => p === st.params.parts[i]) && parts.length === st.params.parts.length) return st;
    changed = true;
    return { ...st, params: { ...st.params, parts } };
  });
  return changed ? { ...declaration, stages } : declaration;
}

/**
 * RETENTION record of one rubric draft (PRD v1.131 tick 7; record only). Per job line: `aiParts` = what the drafter wrote on it that is the AI's own check or extra (a fact counts once per
 * fact it lists, a `cited` part, a part code later moves as `none` / `judged`; guards and the drafter's own count checks are not counted, the picks strip those), `kept` = how many of
 * those are still in the final declaration, `dropped` = what code removed (the move to Not checked, the drop after the last try), `picks` = the line has code-matched count picks. A merge
 * of fact parts keeps every fact, so it drops nothing. Pure; no words, only counts.
 * @param {any} drafted the declaration as the drafter sent it @param {any} final the declaration the draft ended with @param {any[]|null|undefined} jobLines
 * @returns {{line: number, aiParts: number, kept: number, dropped: number, picks: boolean}[]}
 */
export function retentionOf(drafted, final, jobLines) {
  const isRec = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!isRec(drafted) || !Array.isArray(drafted.stages) || !isRec(final) || !Array.isArray(final.stages)) return [];
  const partsOn = (/** @type {any} */ d, /** @type {number} */ n) => d.stages.flatMap((/** @type {any} */ st) => (isRec(st) && st.kind === 'rubric-step' && isRec(st.params) && st.params.step === n && Array.isArray(st.params.parts) ? st.params.parts : []));
  const units = (/** @type {any[]} */ parts, /** @type {string[]} */ classes) => parts.reduce((/** @type {number} */ sum, /** @type {any} */ p) => {
    if (!isRec(p)) return sum;
    if (p.class === 'fact') return classes.includes('fact') ? sum + Math.max(1, Array.isArray(p.facts) ? p.facts.length : 0) : sum;
    if (p.class === 'countable' && p.check === 'cited') return classes.includes('cited') ? sum + 1 : sum;
    return (p.class === 'none' || p.class === 'judged') && classes.includes('moved') ? sum + 1 : sum;
  }, 0);
  const picks = Array.isArray(final.picks) ? final.picks : [];
  return (Array.isArray(jobLines) ? jobLines : []).filter((l) => isRec(l) && Number.isInteger(l.n)).map((l) => {
    const aiParts = units(partsOn(drafted, l.n), ['fact', 'cited', 'moved']);
    const kept = Math.min(aiParts, units(partsOn(final, l.n), ['fact', 'cited']));
    return { line: l.n, aiParts, kept, dropped: aiParts - kept, picks: picks.some((/** @type {any} */ k) => isRec(k) && k.line === l.n) };
  });
}
