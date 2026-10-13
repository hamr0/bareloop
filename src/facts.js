// PART 1b (docs/product/ITEM33-BUILD.md, "Addendum 2026-10-13 — Part 1b: required facts"): the FACT step.
//
// A job line the person phrased as "find / list / look up" leaves behind a step file that holds ONLY filled facts:
//
//     { "results": [ { "quote": "<words copied from the input>", "values": { "<fact name>": "<value as the quote writes it>" } } ] }
//
// What each result must hold is the signed list of REQUIRED FACTS on the line's `fact` part (name, shape, rule, source
// input). The check is bareguard's `cited` + `decides`, built here by code from the signed part: the quote is really in the
// frozen input, every value really is in the quote (compared exactly by shape), every value meets its rule. No model is in
// the check. The claim TEXT that bareguard's number scan reads is written by code from the values, never by the worker.

/** the shapes a fact may have (bareguard's value kinds, plus `phrase` = a presence decide) */
export const FACT_SHAPES = Object.freeze(['money', 'number', 'date', 'time', 'phrase', 'text']);
/** the comparison ops a rule may use (bareguard's) */
export const FACT_OPS = Object.freeze(['lt', 'lte', 'gt', 'gte', 'between']);
/** bareguard signs at most this many decides on one `cited` check */
export const MAX_FACTS = 10;
/** every field a fact may carry */
const FACT_FIELDS = Object.freeze(['name', 'shape', 'unit', 'currency', 'phrase', 'anchor', 'until', 'rule', 'aiProposal']);
/** every field a part of class `fact` may carry (the shared ones are checked by rubricStepShapeReds) */
export const FACT_PART_FIELDS = Object.freeze(['source', 'record', 'facts', 'count']);
/** a fact's name appears in the claim text bareguard scans for numbers, so it carries letters only (no digit can red the claim) */
const NAME_RE = /^[A-Za-z][A-Za-z _-]{0,63}$/;

/** @param {unknown} v @returns {v is Record<string, any>} */
const isRec = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** @param {unknown} v @returns {v is string} */
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

/** the `fact` part of a step's parameters, or null (a step has at most one) @param {any} params @returns {any|null} */
export function factPartOf(params) {
  const parts = Array.isArray(params?.parts) ? params.parts : [];
  return parts.find((/** @type {any} */ p) => isRec(p) && p.class === 'fact') ?? null;
}

/** @param {any} v @returns {boolean} a rule bound has the type its shape needs: a number for number/money, a string for date/time */
const boundOk = (/** @type {string} */ shape, /** @type {unknown} */ v) => (shape === 'number' || shape === 'money' ? typeof v === 'number' && Number.isFinite(v) : typeof v === 'string' && v !== '');

/**
 * The SHAPE of a `fact` part (what it may carry), pushed as reds in the same form `rubricStepShapeReds` uses. Whether the
 * bareguard rubric it builds is signable is asked of bareguard itself (`checkRubricParts` builds it once at drafting).
 * @param {any} part @param {string} w the path prefix @param {(code: string, path: string, detail: string) => void} red
 */
export function factShapeReds(part, w, red) {
  for (const k of Object.keys(part)) {
    if (!['text', 'class', 'covers', 'source', 'record', 'facts', 'count', 'tested', 'sample'].includes(k)) {
      red('invalid-value', `${w}.${k}`, `"${k}" is not a field of a fact part — fields: text, class, covers, ${FACT_PART_FIELDS.join(', ')}`);
    }
  }
  if (!(nonEmpty(part.source) && part.source.length <= 128)) red('invalid-value', `${w}.source`, 'the label of the input the quotes come from');
  if (!isRec(part.record)) red('invalid-value', `${w}.record`, '{start, end?} — the words (copied from the input) that open a record, and optionally the words that close its quoted slice');
  else {
    if (!nonEmpty(part.record.start)) red('invalid-value', `${w}.record.start`, 'the words that open each record, copied from the input');
    if (Object.hasOwn(part.record, 'end') && !nonEmpty(part.record.end)) red('invalid-value', `${w}.record.end`, 'the words that end the quoted slice of a record, copied from the input');
    for (const k of Object.keys(part.record)) if (k !== 'start' && k !== 'end') red('invalid-value', `${w}.record.${k}`, `"${k}" is not a field of record — fields: start, end`);
  }
  if (!Array.isArray(part.facts) || part.facts.length === 0 || part.facts.length > MAX_FACTS) {
    red('invalid-value', `${w}.facts`, `a list of 1 to ${MAX_FACTS} facts {name, shape, ...}`);
  } else {
    /** @type {Set<string>} */
    const seen = new Set();
    part.facts.forEach((/** @type {any} */ f, /** @type {number} */ j) => {
      const fw = `${w}.facts[${j}]`;
      if (!isRec(f)) { red('invalid-value', fw, '{name, shape, ...}'); return; }
      for (const k of Object.keys(f)) if (!FACT_FIELDS.includes(k)) red('invalid-value', `${fw}.${k}`, `"${k}" is not a field of a fact — fields: ${FACT_FIELDS.join(', ')}`);
      if (!(typeof f.name === 'string' && NAME_RE.test(f.name))) red('invalid-value', `${fw}.name`, 'the fact\'s name: letters, spaces, "_" or "-" only (no digits), at most 64 characters');
      else if (seen.has(f.name)) red('invalid-value', `${fw}.name`, `the name "${f.name}" is used twice on this line`);
      else seen.add(f.name);
      if (!FACT_SHAPES.includes(f.shape)) { red('invalid-value', `${fw}.shape`, `one of ${FACT_SHAPES.join(' | ')}`); return; }
      if (Object.hasOwn(f, 'aiProposal') && typeof f.aiProposal !== 'boolean') red('invalid-value', `${fw}.aiProposal`, 'true when the AI turned the person\'s words into this number');
      const has = (/** @type {string} */ k) => Object.hasOwn(f, k);
      if (f.shape === 'money') {
        if (has('unit') === has('currency')) red('invalid-value', `${fw}.unit`, 'money names exactly one of unit (words the input writes after the amount, e.g. "US dollars") or currency ("$", "€" or "£")');
      } else if (has('unit') || has('currency')) red('invalid-value', `${fw}.${has('unit') ? 'unit' : 'currency'}`, 'only money has a unit or a currency');
      if (has('unit') && !nonEmpty(f.unit)) red('invalid-value', `${fw}.unit`, 'a non-empty string copied from the input');
      if (has('currency') && !['$', '€', '£'].includes(f.currency)) red('invalid-value', `${fw}.currency`, 'one of $ | € | £');
      if (f.shape === 'phrase') {
        if (!nonEmpty(f.phrase)) red('invalid-value', `${fw}.phrase`, 'the fixed words the quote must contain, copied from the input');
        for (const k of ['anchor', 'until', 'rule']) if (has(k)) red('invalid-value', `${fw}.${k}`, 'a phrase is fixed words the quote must contain; it has no anchor, until or rule');
      } else if (has('phrase')) red('invalid-value', `${fw}.phrase`, 'only a phrase fact carries phrase');
      if (has('anchor') && !nonEmpty(f.anchor)) red('invalid-value', `${fw}.anchor`, 'a label copied VERBATIM from the input');
      if (has('until') && !nonEmpty(f.until)) red('invalid-value', `${fw}.until`, 'a label copied VERBATIM from the input');
      if (has('until') && !has('anchor') && f.shape !== 'phrase') red('invalid-value', `${fw}.until`, 'until needs an anchor');
      if (has('until') && f.shape !== 'text' && f.shape !== 'phrase') red('invalid-value', `${fw}.until`, 'until closes a text fact only');
      if (has('rule') && f.shape !== 'phrase') {
        const r = f.rule;
        if (f.shape === 'text') red('invalid-value', `${fw}.rule`, 'a text fact is bind only: it has no rule');
        else if (!isRec(r) || !FACT_OPS.includes(r.op)) red('invalid-value', `${fw}.rule`, `{op: ${FACT_OPS.join(' | ')}, value} or {op: "between", lo, hi}`);
        else if (r.op === 'between' ? !(boundOk(f.shape, r.lo) && boundOk(f.shape, r.hi) && !Object.hasOwn(r, 'value')) : !(boundOk(f.shape, r.value) && !Object.hasOwn(r, 'lo') && !Object.hasOwn(r, 'hi'))) {
          red('invalid-value', `${fw}.rule`, r.op === 'between' ? 'between needs lo and hi (numbers for number/money, strings for date/time) and no value' : 'a comparison needs value (a number for number/money, a string for date/time)');
        }
      }
    });
  }
  if (Object.hasOwn(part, 'count')) {
    const c = part.count;
    const ok = isRec(c) && Object.keys(c).every((k) => k === 'min' || k === 'max') && (Object.hasOwn(c, 'min') || Object.hasOwn(c, 'max'))
      && ['min', 'max'].every((k) => !Object.hasOwn(c, k) || (Number.isInteger(c[k]) && c[k] >= 1))
      && (!Object.hasOwn(c, 'min') || !Object.hasOwn(c, 'max') || c.min <= c.max);
    if (!ok) red('invalid-value', `${w}.count`, '{min?, max?} — how many results the person asked for (integers, 1 or more, min no more than max)');
  }
}

/**
 * bareguard's `decides` list for a fact part: one decide per fact, in the fact order (so `d<j>` is the fact's own index).
 * @param {any} part @returns {Record<string, any>[]}
 */
export function factDecides(part) {
  return part.facts.map((/** @type {any} */ f) => {
    if (f.shape === 'phrase') return { phrases: [f.phrase] };
    /** @type {Record<string, any>} */
    const d = { valueKind: f.shape };
    if (f.shape === 'money') { if (f.unit !== undefined) d.unit = f.unit; else d.currency = f.currency; }
    if (f.anchor !== undefined) d.anchor = f.anchor;
    if (f.until !== undefined) d.until = f.until;
    if (f.rule) {
      d.op = f.rule.op;
      if (f.rule.op === 'between') { d.lo = f.rule.lo; d.hi = f.rule.hi; } else d.value = f.rule.value;
    }
    return d;
  });
}

/**
 * The claims bareguard reads for a fact step, built from the step file's `results`. The claim TEXT is written here, by code,
 * from the values the worker gave (the worker writes no claim text): `name: value; name: value`. A phrase fact contributes its
 * own signed words. A result that is not an object, or has no string quote, still becomes a claim — an empty one — so
 * bareguard reds it by name rather than the result vanishing.
 * @param {any} part @param {unknown} results @returns {{claim: string, quote: string, values?: Record<string, string>}[]}
 */
export function factClaims(part, results) {
  const list = Array.isArray(results) ? results : [];
  return list.map((/** @type {any} */ r) => {
    const given = isRec(r) && isRec(r.values) ? r.values : null;
    /** @type {Record<string, string>} */
    const values = {};
    /** @type {string[]} */
    const said = [];
    part.facts.forEach((/** @type {any} */ f, /** @type {number} */ j) => {
      if (f.shape === 'phrase') { said.push(`${f.name}: ${f.phrase}`); return; }
      const v = given && Object.hasOwn(given, f.name) ? given[f.name] : undefined;
      // a JSON number is the value as written ("389"): converted, never repaired; anything else is left for bareguard to red
      const s = typeof v === 'number' && Number.isFinite(v) ? String(v) : v;
      if (typeof s === 'string') { values[`d${j}`] = s; said.push(`${f.name}: ${s}`); } else if (s !== undefined) { /** @type {any} */ (values)[`d${j}`] = s; }
    });
    return { claim: said.join('; '), quote: isRec(r) && typeof r.quote === 'string' ? r.quote : '', values };
  });
}

/** @param {unknown} n @param {string} shape @param {any} f @returns {string} one bound, as the person would say it */
function sayBound(n, shape, f) {
  if (shape === 'money') return f.unit !== undefined ? `${n} ${f.unit}` : `${f.currency}${n}`;
  return String(n);
}

/** @param {any} f a fact with a rule @returns {string} the rule in words, e.g. "at most 450 US dollars" */
function ruleWords(f) {
  const r = f.rule;
  return r.op === 'between' ? `between ${sayBound(r.lo, f.shape, f)} and ${sayBound(r.hi, f.shape, f)}`
    : `${{ lt: 'under', lte: 'at most', gt: 'over', gte: 'at least' }[/** @type {'lt'|'lte'|'gt'|'gte'} */ (r.op)]} ${sayBound(r.value, f.shape, f)}`;
}

/**
 * One fact as a plain row, written by code from the signed fields:
 * `fact · price — money, at most 450 US dollars, after "Price", quoted from "Flights"`.
 * @param {any} f @param {string} source @returns {string}
 */
export function factSentence(f, source) {
  /** @type {string[]} */
  const bits = [];
  if (f.shape === 'phrase') bits.push('phrase', `must say "${f.phrase}"`);
  else {
    bits.push(f.shape === 'money' ? `money in ${f.unit !== undefined ? f.unit : f.currency}` : f.shape);
    if (f.rule) bits.push(ruleWords(f));
    else if (f.anchor === undefined) bits.push('as the quote writes it');
    if (f.anchor !== undefined) bits.push(f.until !== undefined ? `the words after "${f.anchor}" up to "${f.until}"` : `after "${f.anchor}"`);
  }
  bits.push(`quoted from "${source}"`);
  return `fact · ${f.name} — ${bits.join(', ')}${f.aiProposal ? ' — AI\'s proposal — check it' : ''}`;
}

/** the "N results" row of a fact part, or null @param {any} part @returns {string|null} */
export function countSentence(part) {
  const c = isRec(part.count) ? part.count : null;
  if (!c) return null;
  const n = (/** @type {number} */ v) => `${v} result${v === 1 ? '' : 's'}`;
  if (c.min !== undefined && c.max !== undefined) return c.min === c.max ? `fact · results — exactly ${n(c.min)}, each quoted from "${part.source}"` : `fact · results — ${c.min} to ${c.max} results, each quoted from "${part.source}"`;
  return c.min !== undefined ? `fact · results — at least ${n(c.min)}, each quoted from "${part.source}"` : `fact · results — at most ${n(c.max)}, each quoted from "${part.source}"`;
}

/**
 * Every plan-card row a fact part carries: its facts, then its count.
 * @param {any} part @returns {string[]}
 */
export function factRows(part) {
  const rows = (Array.isArray(part.facts) ? part.facts : []).map((/** @type {any} */ f) => factSentence(f, part.source));
  const rec = isRec(part.record) && nonEmpty(part.record.start) ? [`fact · records — each begins at "${part.record.start}"${part.record.end !== undefined ? ` and is quoted up to "${part.record.end}"` : ''}, in "${part.source}"`] : [];
  const c = countSentence(part);
  return [...rows, ...rec, ...(c ? [c] : [])];
}

/**
 * One bareguard `cited` item (`#<result>:d<j>:<reason>[:<detail>]`, or `#<result>:<reason>`) as a sentence the worker can act
 * on. The names and numbers are bareguard's measurements and the person's signed facts, never inferred here.
 * @param {string} item @param {any} part @returns {string}
 */
export function plainFactItem(item, part) {
  const m = /^#(\d+):(?:d(\d+):)?([a-z-]+)(?::([\s\S]*))?$/.exec(item);
  if (!m) return item;
  const at = `result ${Number(m[1]) + 1}`;
  const f = m[2] !== undefined && Array.isArray(part.facts) ? part.facts[Number(m[2])] : null;
  const who = f ? `${at}, fact "${f.name}"` : at;
  const detail = m[4] ?? '';
  const say = (/** @type {string} */ s) => `${who}: ${s}`;
  switch (m[3]) {
    case 'quote-not-found': return `${at}: the quote is not found word for word in "${part.source}"`;
    case 'empty-quote': return `${at}: the quote is empty — copy the words from "${part.source}" that hold the facts`;
    case 'quote-too-long': return `${at}: the quote is too long — copy only the one record, not more`;
    case 'numbers': return `${at}: the number ${detail} is not in the quote the way the value writes it — write each value as the quote writes it (for example "9:27 AM", not "09:27")`;
    case 'value-over': case 'value-under': return say(`the value in the quote is ${m[3] === 'value-over' ? 'above' : 'below'} what the rule allows${f && f.rule ? ` (${ruleWords(f)})` : ''}`);
    case 'value-none': return say(`the quote holds no ${f ? f.shape : 'value'}${f && f.anchor !== undefined ? ` after "${f.anchor}"` : ''}`);
    case 'value-many': return say(`the quote holds more than one ${f ? f.shape : 'value'} — quote only the words that hold this one`);
    case 'value-malformed': return say(`a ${f ? f.shape : 'value'} in the quote is not written in a form the check can read`);
    case 'anchor-missing': return say(`the label "${f ? f.anchor : ''}" is not in the quote`);
    case 'anchor-ambiguous': return say(`the label "${f ? f.anchor : ''}" is in the quote more than once`);
    case 'until-missing': return say(`"${f ? f.until : ''}" does not follow the label "${f ? f.anchor : ''}" in the quote`);
    case 'phrase-missing': return say(`the quote does not say "${detail}"`);
    case 'claim-value-missing': return say('no value was given in "values"');
    case 'claim-value-malformed': return say('the value is not written as a value of this kind');
    case 'claim-value-absent': return say('the value is not in the quote as a whole word');
    case 'claim-value-unknown': return say('this value is not one of the signed facts');
    case 'claim-value-mismatch': return say(`the value is not what the quote holds (${detail.replace('!=', ' is not ')})`);
    default: return `${who}: ${m[3]}${detail ? ` ${detail}` : ''}`;
  }
}

// ── records (PART 1b item 3) ─────────────────────────────────────────────────────────────────────────────────────────
//
// A source holds many look-alike RECORDS (a flight, a release, a row). The drafter names where a record OPENS (`record.start`,
// words copied from the input) and, optionally, where the slice the worker quotes ENDS (`record.end`): the whole block made
// anchors ambiguous in the flight POC (a trailing "Flight details" button repeated the labels), so a record is the PREFIX slice.
// CODE finds the records and counts them; the model names two strings and nothing else.

/** @typedef {{start: number, end: number, text: string, endFound: boolean}} RecordSlice */

/**
 * Split a text into records. A record opens at each occurrence of `record.start` and runs to the next one (or the end of the
 * text); with `record.end`, the quoted slice stops at the first `end` inside that record (a record without it keeps its whole
 * span and says so in `endFound`). Plain, case-sensitive, verbatim string search — the words are copied from the input.
 * @param {string} text @param {{start: string, end?: string}} record @returns {RecordSlice[]}
 */
export function splitRecords(text, record) {
  /** @type {number[]} */
  const starts = [];
  if (typeof record.start === 'string' && record.start !== '') {
    for (let i = text.indexOf(record.start); i !== -1; i = text.indexOf(record.start, i + record.start.length)) starts.push(i);
  }
  return starts.map((s, k) => {
    const stop = k + 1 < starts.length ? starts[k + 1] : text.length;
    let e = stop;
    let endFound = true;
    if (typeof record.end === 'string' && record.end !== '') {
      const j = text.indexOf(record.end, s + record.start.length);
      if (j !== -1 && j < stop) e = j; else endFound = false;
    }
    return { start: s, end: e, text: text.slice(s, e), endFound };
  });
}

/** how much of a big input the drafter is shown (characters, cut at a line end) */
export const SAMPLE_CHARS = 15000;

/**
 * What the drafter reads of an input: all of it when it is small, else the first part, cut at a line end — and the cut is SAID
 * (never a silent truncation: the changelog was 455k characters cut to 15k in the POC). Every check is tested on the WHOLE input
 * regardless (`earlyFactTests`), so the cut limits what the drafter sees, never what is checked.
 * @param {string} text @param {number} [max]
 * @returns {{text: string, cut: boolean, shown: number, total: number, note: string|null}}
 */
export function sampleOf(text, max = SAMPLE_CHARS) {
  if (text.length <= max) return { text, cut: false, shown: text.length, total: text.length, note: null };
  const nl = text.lastIndexOf('\n', max);
  const shown = nl > 0 ? nl : max;
  return {
    text: text.slice(0, shown), cut: true, shown, total: text.length,
    note: `the first ${shown} of ${text.length} characters, cut at a line end; every check is tested on the whole input`,
  };
}

/**
 * The quote instruction a worker is given for a record, in plain words (the worker brief and the composer prompt both use it).
 * @param {{start: string, end?: string}} record @returns {string}
 */
export function recordWords(record) {
  return record.end !== undefined
    ? `from the words "${record.start}" up to (not including) "${record.end}"`
    : `from the words "${record.start}" up to where the next record opens`;
}
