// PART 1b item 5 — the THREE EARLY TESTS (PRD item 33, RF13–RF15), run at DRAFTING on the person's real frozen input, before any
// fact check can be signed (and re-run as a backstop when a run starts):
//
//   words      every word a check depends on (a record marker, an anchor, an until, a phrase, a unit) is really in the input;
//   1 FOUND    the check finds its value in each record (count shown: "found 44/44"); 0 found stops drafting;
//   2 ONE      exactly one value per record where a rule needs one (or an anchor scopes it), else "ambiguous — add a label";
//   3 TELLS    code changes a value in a real record on purpose and the check must go red; the rule's split over the real
//              records is shown ("39 pass, 5 fail"), and a rule that passes every record is flagged.
//
// Nothing here judges: bareguard's own `cited` + `decides` is run on each real record with a PROBE value, and what it reports
// (the values it found, `value-many`, `anchor-missing`, ...) is read back. The values come from bareguard; this module never
// extracts, guesses or compares a value itself. Code only — no model.

import { createHash } from 'node:crypto';
import { createRubric, checkStep } from 'bareguard';
import { factDecides, splitRecords } from './facts.js';

/** how many records the tests run on; a bigger input is tested on its first records and the count says so */
export const MAX_TEST_RECORDS = 500;
/** how many records the "tells right from wrong" test breaks (the first found ones) */
const BREAK_RECORDS = 5;
/** the value each shape is probed with: one no real record is expected to hold (a hit is still read as a hit) */
const PROBE = Object.freeze({ number: '999999999', money: '999999999', date: '0001-01-01', time: '00:00', text: 'zzqx-no-such-text' });


/** the longest record slice a quote may hold */
const MAX_QUOTE_CHARS = 4000;

/**
 * The refusal for a record that is too long, in plain words that say what to do (live fix A1): which record (its first line),
 * how long, the end marker the draft gave (or none), and an example taken from that very record.
 * @param {string} src the input's label @param {string} recText the record's slice @param {{start: string, end?: string}} record
 * @returns {string}
 */
function longRecordText(src, recText, record) {
  const first = recText.split('\n')[0].trim();
  const shown = first.length > 60 ? `${first.slice(0, 60)}…` : first;
  const gave = record.end === undefined ? 'no end marker was given' : `the end marker given was ${JSON.stringify(record.end)}`;
  const eg = recText.includes('\n')
    ? `For example, end the slice at the end of its first line (record.end = "\\n"), which cuts this record to ${first.length} characters.`
    : 'Name a marker inside the record where the slice should end.';
  return `the record in "${src}" that starts "${shown}" is ${recText.length} characters long, over the ${MAX_QUOTE_CHARS} a quote may hold, and ${gave}. Name where the quoted slice ends (record.end), copied from the input. ${eg}`;
}

/** @typedef {{name: string, found: number|null, pass?: number, fail?: number, caught?: string}} FactTested */
/** @typedef {{records: number, of: number, facts: FactTested[]}} Tested */
/** @param {string} t @returns {string} */
const sha = (t) => createHash('sha256').update(t).digest('hex');
/** @param {string} t @returns {string} lower case, whitespace collapsed, markdown marks dropped — how a phrase or unit is compared */
const norm = (t) => t.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Run ONE decide over ONE text used as the quote, with one claim value, and read bareguard's items back.
 * @param {Record<string, any>} decide @param {string} text @param {string|undefined} value
 * @returns {Promise<{reason: string, detail: string}[]>}
 */
async function probe(decide, text, value) {
  const spec = {
    schema: 1, goal: 'early test', inputs: [{ name: 'R', sha256: sha(text) }],
    checkpoints: { '1': { gating: false, checks: [{ id: 'c', rule: 'cited', claims: 'cites:R', source: 'R', decides: [decide] }] } },
  };
  const r = await checkStep(createRubric(spec), '1', { 'cites:R': [{ claim: 'x', quote: text, ...(value === undefined ? {} : { values: { d0: value } }) }] }, { inputs: { R: text } });
  if (r.verdict === 'stopped') throw new Error(`the early test could not run: ${r.fault ? r.fault.detail : 'stopped'}`);
  return r.full.gaps.flatMap((/** @type {any} */ g) => (g.items ?? []).map((/** @type {string} */ it) => {
    const m = /^#0:(?:d0:)?([a-z-]+)(?::([\s\S]*))?$/.exec(it);
    return m ? { reason: m[1], detail: m[2] ?? '' } : { reason: it, detail: '' };
  }));
}

/** @param {{reason: string}[]} items @param {string[]} reasons @returns {boolean} */
const hasAny = (items, reasons) => items.some((i) => reasons.includes(i.reason));

/**
 * The values bareguard reported finding in a quote, read from its mismatch item (`<claim>!=<v1>,<v2>,...(N in all)`).
 * A text fact is one field, never split.
 * @param {{reason: string, detail: string}[]} items @param {string} shape @returns {(string[] & {truncated: boolean})|null} null = it did not report any
 */
function foundValues(items, shape) {
  const m = items.find((i) => i.reason === 'claim-value-mismatch');
  if (!m) return null;
  const at = m.detail.indexOf('!=');
  if (at < 0) return null;
  const field = m.detail.slice(at + 2).replace(/,\.\.\.\(\d+ in all\)$/, '');
  const values = shape === 'text' ? [field] : field.split(',');
  // bareguard lists 20 values at most; a longer list is cut ("...(N in all)"), and a changed value could then collide with an unlisted one
  return Object.assign(values, { truncated: /,\.\.\.\(\d+ in all\)$/.test(m.detail) });
}

/** @param {string} shape @param {string} v @param {string[]} not @returns {string|null} a copy of v changed by code that is not one of `not` */
function broken(shape, v, not) {
  /** @type {string[]} */
  let cands = [];
  if (shape === 'number' || shape === 'money') { const n = Number(v); cands = [n + 1, n + 7, n * 2 + 3].map(String); } else if (shape === 'date') {
    const d = new Date(`${v}T00:00:00Z`);
    cands = [1, 2, 31].map((k) => new Date(d.getTime() + k * 86400000).toISOString().slice(0, 10));
  } else if (shape === 'time') {
    const [h, mi] = v.split(':').map(Number);
    cands = [12, 1, 5].map((k) => `${String((h + k) % 24).padStart(2, '0')}:${String(mi).padStart(2, '0')}`);
  } else cands = [`x${v}`, `${v}x`];
  return cands.find((c) => !not.includes(c) && c !== 'NaN') ?? null;
}

/** the bind-only twin of a decide (no op, value, lo, hi): "the value is really in the quote" @param {Record<string, any>} d */
const bindOnly = (d) => { const { op, value, lo, hi, ...rest } = d; return rest; };

/**
 * Run the early tests for ONE fact part on the frozen input text.
 * @param {{part: any, text: string, line: number|string, probeFn?: typeof probe}} o `probeFn` — bareguard's probe; a test may blind it to prove a red fires
 * @returns {Promise<{reds: {code: string, detail: string}[], notes: string[], tested: Tested}>}
 */
export async function earlyFactTests({ part, text, line, probeFn = probe }) {
  /** @type {{code: string, detail: string}[]} */
  const reds = [];
  /** @type {string[]} */
  const notes = [];
  const red = (/** @type {string} */ code, /** @type {string} */ detail) => reds.push({ code, detail: `line ${line}: ${detail} Nothing was signed.` });
  const src = part.source;
  /** @type {FactTested[]} */
  const facts = [];
  const empty = { records: 0, of: 0, facts };

  // ── the words: every one is really in the input ──────────────────────────────────────────────────────────────────
  /** @type {string[]} */
  const missing = [];
  const exact = (/** @type {unknown} */ w) => { if (typeof w === 'string' && w !== '' && !text.includes(w)) missing.push(w); };
  // a phrase or unit counts as present as WHOLE words (so "SFO" is not found inside "sfocus"), case and spacing aside
  const loose = (/** @type {unknown} */ w) => {
    if (typeof w !== 'string' || w === '') return;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${norm(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u');
    if (!re.test(norm(text))) missing.push(w);
  };
  exact(part.record?.start); exact(part.record?.end);
  for (const f of part.facts) { exact(f.anchor); exact(f.until); loose(f.phrase); loose(f.unit); }
  for (const w of [...new Set(missing)]) {
    red('rubric-fact-word-missing', `'${w}' is not in the input "${src}". Change the check to the words the input really uses (copy them from the input), or remove it.`);
  }
  if (reds.length) return { reds, notes, tested: empty };

  // ── the records ──────────────────────────────────────────────────────────────────────────────────────────────────
  const all = splitRecords(text, part.record);
  if (all.length === 0) { red('rubric-fact-no-records', `no record in "${src}" opens with "${part.record.start}".`); return { reds, notes, tested: empty }; }
  if (part.record.end !== undefined) {
    // an end marker the records do not hold is its own red (live fix A2): it used to fall back silently to the whole record and read as "too long"
    const lacking = all.filter((r) => !r.endFound).length;
    if (lacking > 0) {
      const where = lacking === all.length ? `none of the ${all.length} records` : `${lacking} of the ${all.length} records`;
      red('rubric-fact-record-end', `the end marker ${JSON.stringify(part.record.end)} is not found after "${part.record.start}" in ${where} in "${src}", so the quoted slice has no end there. Name an end marker every record holds (copy it from the input), or leave record.end out.`);
      return { reds, notes, tested: empty };
    }
  }
  const records = all.slice(0, MAX_TEST_RECORDS);
  const N = records.length;
  if (all.length > N) notes.push(`tested on the first ${N} of ${all.length} records`);
  const decides = factDecides(part);

  for (let j = 0; j < part.facts.length; j += 1) {
    const f = part.facts[j];
    const d = decides[j];
    const who = `fact "${f.name}"`;
    /** @type {FactTested} */
    const row = { name: f.name, found: null };
    facts.push(row);

    // a phrase: found = the record says it; broken = the phrase taken out of a record
    if (f.shape === 'phrase') {
      let found = 0;
      for (const r of records) {
        if (r.text.length > MAX_QUOTE_CHARS) { red('rubric-fact-record-long', longRecordText(src, r.text, part.record)); return { reds, notes, tested: { records: N, of: all.length, facts } }; }
        if (!hasAny(await probeFn(d, r.text, undefined), ['phrase-missing'])) found += 1;
      }
      row.found = found;
      if (found === 0) red('rubric-fact-not-found', `${who} must say "${f.phrase}", and none of the ${N} records in "${src}" does.`);
      else {
        const rec = records.find((r) => norm(r.text).includes(norm(f.phrase)));
        const stripped = rec ? rec.text.split(f.phrase).join('') : null;
        if (rec && stripped !== null && norm(stripped).includes(norm(f.phrase))) notes.push(`${who}: its words could not be taken out of a record by code, so the check was not tested against a broken record`);
        else if (rec && stripped !== null && !hasAny(await probeFn(d, stripped, undefined), ['phrase-missing'])) red('rubric-fact-untested', `${who} cannot tell right from wrong here: a record with "${f.phrase}" taken out still passed.`);
      }
      continue;
    }

    // a text fact with no anchor is the worker's own word: nothing to find, nothing to break — said, not hidden
    if (f.shape === 'text' && f.anchor === undefined) { notes.push(`${who}: no label, so the check only proves the word is in the quote (it cannot tell which field it is)`); continue; }

    const bind = bindOnly(d);
    let found = 0;
    let ambiguous = 0;
    let pass = 0;
    let fail = 0;
    let malformed = 0;
    /** @type {string[]} */
    const odd = [];
    /** @type {{text: string, values: string[]}[]} */
    const hits = [];
    for (const r of records) {
      if (r.text.length > MAX_QUOTE_CHARS) { red('rubric-fact-record-long', longRecordText(src, r.text, part.record)); return { reds, notes, tested: { records: N, of: all.length, facts } }; }
      const items = await probeFn(bind, r.text, PROBE[/** @type {'number'} */ (f.shape)]);
      if (hasAny(items, ['value-malformed'])) { malformed += 1; continue; }
      if (hasAny(items, ['anchor-ambiguous'])) { ambiguous += 1; continue; }
      if (hasAny(items, ['value-none', 'anchor-missing', 'claim-value-absent', 'until-missing'])) continue;
      const vals = foundValues(items, f.shape) ?? Object.assign([PROBE[/** @type {'number'} */ (f.shape)]], { truncated: false });
      found += 1;
      if (!vals.truncated) hits.push({ text: r.text, values: vals });
      if (f.rule) {
        // ONE per record where a rule needs one: the real decide, with the value bareguard found, says value-many when there are several
        const run = await probeFn(d, r.text, vals[0]);
        if (hasAny(run, ['value-many'])) ambiguous += 1;
        else if (hasAny(run, ['value-over', 'value-under'])) fail += 1;
        else if (run.length === 0) pass += 1;
        else odd.push(run[0].reason);
      }
    }
    row.found = found;
    if (f.rule) { row.pass = pass; row.fail = fail; }
    if (found === 0) {
      red('rubric-fact-not-found', `${who} is found in 0 of ${N} records in "${src}". Wrong label, unit or input? Copy the words the records really use.`);
      continue;
    }
    if (ambiguous > 0) {
      red('rubric-fact-ambiguous', `${who} holds more than one ${f.shape} in ${ambiguous} of ${N} records — ambiguous. Add a label (anchor) copied from the input that picks the one you mean.`);
      continue;
    }
    if (odd.length > 0) {
      red('rubric-fact-unreadable', `${who} could not be read in ${odd.length} of ${N} records (${[...new Set(odd)].join(', ')}). Add a label (anchor) that sits right before the value you mean.`);
      continue;
    }
    if (malformed > 0) notes.push(`${who}: ${malformed} of ${N} records hold a ${f.shape} written in a form the check cannot read`);
    if (f.rule && pass === found) notes.push(`${who}: every one of the ${found} records passes this rule — it may not tell anything apart`);
    if (f.rule && pass === 0) notes.push(`${who}: none of the ${found} records passes this rule`);

    // TELLS: change a value in real records by code; the bind-only check must go red
    let broke = 0;
    let tried = 0;
    for (const h of hits.slice(0, BREAK_RECORDS)) {
      const b = broken(f.shape, h.values[0], h.values);
      if (b === null) continue;
      tried += 1;
      if ((await probeFn(bind, h.text, b)).length > 0) broke += 1;
    }
    if (tried > 0) row.caught = `${broke}/${tried}`;
    if (tried > 0 && broke < tried) red('rubric-fact-untested', `${who} cannot tell right from wrong here: a value changed by code in a real record still passed (${tried - broke} of ${tried}).`);
  }
  return { reds, notes, tested: { records: N, of: all.length, facts } };
}

/**
 * The early tests for every fact part of a declaration, against the frozen input texts. Returns the reds (with codes), the notes,
 * and the declaration with each fact part's `tested` evidence filled IN BY CODE (what the card shows: "found 44/44, 39 pass, 5
 * fail"); a `tested` or `sample` a model wrote is replaced. A fact part whose input text is not at hand is a red — a check that
 * was never tested is never signed.
 * @param {any} declaration @param {Record<string, string>|null} texts label -> frozen text
 * @param {(text: string) => string|null} [sampleNote] the said-so note for an input the drafter saw only a sample of
 * @returns {Promise<{reds: {code: string, path: string, detail: string}[], notes: string[], declaration: any}>}
 */
export async function earlyFactTestsOfDeclaration(declaration, texts, sampleNote = () => null) {
  /** @type {{code: string, path: string, detail: string}[]} */
  const reds = [];
  /** @type {string[]} */
  const notes = [];
  if (!declaration || !Array.isArray(declaration.stages)) return { reds, notes, declaration };
  const stages = [];
  for (let i = 0; i < declaration.stages.length; i += 1) {
    const st = declaration.stages[i];
    const parts = st?.kind === 'rubric-step' && Array.isArray(st.params?.parts) ? st.params.parts : null;
    if (!parts || !parts.some((/** @type {any} */ p) => p?.class === 'fact')) { stages.push(st); continue; }
    const outParts = [];
    for (let k = 0; k < parts.length; k += 1) {
      const p = parts[k];
      if (p?.class !== 'fact') { outParts.push(p); continue; }
      const at = `stages[${i}].params.parts[${k}]`;
      const { tested: _t, sample: _s, ...bare } = p;
      const text = texts ? texts[p.source] : undefined;
      if (typeof text !== 'string') {
        reds.push({ code: 'rubric-fact-unread', path: at, detail: `line ${st.params.step}: the input "${p.source}" could not be read here to test the facts against it. Nothing was signed.` });
        outParts.push(bare);
        continue;
      }
      const r = await earlyFactTests({ part: bare, text, line: st.params.step });
      for (const x of r.reds) reds.push({ code: x.code, path: at, detail: x.detail });
      notes.push(...r.notes.map((n) => `line ${st.params.step}: ${n}`));
      const cut = sampleNote(text);
      outParts.push({ ...bare, tested: r.tested, ...(cut ? { sample: cut } : {}) });
    }
    stages.push({ ...st, params: { ...st.params, parts: outParts } });
  }
  return { reds, notes, declaration: { ...declaration, stages } };
}

/**
 * The run-time BACKSTOP (RF13): the same words / found / one-per-record tests on the first source the worker reads, because
 * pages and files change. Returns plain-words reasons to stop; empty = go. (The "tells right from wrong" test is a drafting-time
 * proof and is not repeated.)
 * @param {{part: any, text: string, line: number|string}} o @returns {Promise<string[]>}
 */
export async function backstopFactTests({ part, text, line }) {
  const r = await earlyFactTests({ part, text, line });
  return r.reds.filter((x) => x.code !== 'rubric-fact-untested').map((x) => x.detail.replace(/ Nothing was signed\.$/, ''));
}
