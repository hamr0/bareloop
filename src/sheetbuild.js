// borrowed-from: fwdloop src/sheetbuild.js@v0.35.0 (M17 am2 + am3 + am5 + am7; docs/product/ITEM33-BUILD.md "Addendum 2026-11-17", S2): the ONE builder of the sheet checks of a line. The AI never writes a sheet check: what it
// sends in the row-edit reply's `sheetChecks` is read here only as a typed SUGGESTION (bareguard's rule fields plus the `covers` numbers); code refuses or builds every one on bareguard's shapes and writes the check itself.
//   refusals (each by bareguard, in this order): the vocabulary (rule, op), the line's sheets, the schema (a field of the rule), `columnAt` (a column of the sheet's header), `checkTables` (and its problems),
//   `groundedLiterals` (a number or date in the person's own words), `claimSchema` (an answer box), and for a `table` check `runTableChecks` on the sheet frozen at draft time.
//   placement: every suggestion that passes all of them is BUILT. A cells (answer) check is placed before a table check, then in the order sent. A cells check is a RULE ROW's check when none of the rules it
//   covers is held by an earlier rule row, else (or when it covers no rule) its own `[agent]` row. A `table` check reads only the input sheet, so it is never a rule row: it is always its own `[agent]` row and covers
//   no rule (a rule only a table check named is Not checked). Nothing is hidden; nothing sits beside a rule's row.
// One writer per field: `id`, `claim`, `covers` and `table` (when absent and the line reads one sheet) are assigned here. A rule row's id is `l<line>r<rules>`, an agent row's `l<line>a<k>`; the claim is the id.
// What this throws away: a suggestion's `id`, `claim`, `text` (and its `covers`: an agent row's is only the rule no rule row holds); a refused suggestion's check (only its reason is kept, on the rules it named).
// Third outcomes, named: a suggestion that is not an object, names no rule or op bareguard has, a table it cannot read, a column that is no header, a line that is no sheet line: refused with that helper's words, and
// listed in `refused`; a rule that no check holds is Not checked with the last refusal that named it, or the no-pick sentence (`NO_VALUE_WHY`).
// Adapted: fwd's `buildSheetChecks` rewrote a declaration's `close.sheet`; bareloop has no such declaration (the checks live in the stage S3 builds), so it takes the suggestions and the sheet lines and returns the
// built result as data. fwd's `tableChecksFailingOnInput` read a declaration the same way; here it is `tableCheckFails` over one check.
import { rubricVocabulary, claimSchema, groundedLiterals, createRubric, runTableChecks, tableSha } from 'bareguard';
import { SHEET_RULES, sheetCheckColumns, sheetCheckReds, bareguardChecks } from './sheetchecks.js';
import { isColumnChoiceRule } from './sheetoffer.js';
import { wordsSaidOn } from './rubricstep.js';
import { lineRules } from './jobline.js';

const V = /** @type {any} */ (rubricVocabulary);
const isRec = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** the fields of a suggestion code does not read: it names every check itself */
export const SUGGESTION_DROPPED = Object.freeze(['id', 'claim', 'text', 'covers']);

/** why a `~` rule no check holds is Not checked, when no suggestion named it (hamr 2026-11-17: judged at Accept, not at an Ask) */
export const NO_VALUE_WHY = 'No check was picked for it, so you judge it at Accept.';

/** why a `~` rule that only a `table` check named is Not checked: a check was picked, but a table check judges the sheet itself and never a rule (hamr 2026-11-17: judged at Accept, not "no sheet check covers it") */
export const NO_CHECK_FITS_WHY = 'A check was picked, but it cannot check this rule, so you judge it at Accept.';

/**
 * @param {any} ai a suggestion as the AI sent it @returns {{covers: number[], fields: Record<string, any>}}
 */
export function toSuggestion(ai) {
  /** @type {Record<string, any>} */
  const fields = {};
  if (isRec(ai)) for (const [k, v] of Object.entries(ai)) if (!SUGGESTION_DROPPED.includes(k)) fields[k] = v;
  return { covers: isRec(ai) && Array.isArray(ai.covers) ? ai.covers : [], fields };
}

/**
 * Does ONE `table` check already fail on the sheet the draft was made with? A table check judges the sheet itself, so bareguard's `runTableChecks` (the same evaluation path as the run's `checkStep`) can run it
 * before anything is spent: $0, no model call, no answer needed. Only a `red` verdict counts: a sheet bareguard cannot read as a table, or a rubric it refuses, is not reported here (`sheetCheckReds` has said so).
 * @param {any} check a table check with an id @param {Record<string, {header: string[], rows: any[]}>} tables @returns {boolean}
 */
export function tableCheckFails(check, tables) {
  if (!isRec(check) || check.rule !== 'table' || typeof check.table !== 'string' || !isRec(tables[check.table])) return false;
  const sha = tableSha(tables[check.table]);
  if (sha === null) return false;
  try {
    const rubric = createRubric({ schema: 1, goal: 'sheet', inputs: [{ name: check.table, sha256: sha }], checkpoints: { sheet: { gating: true, checks: bareguardChecks([check]) } }, maxReds: 3 });
    return runTableChecks(rubric, 'sheet', { [check.table]: tables[check.table] }).find((r) => r.id === check.id)?.verdict === 'red';
  } catch { return false; }
}

/**
 * @typedef {{check: any, covers: number[]}} Placed
 * @typedef {{rule: number, text: string, state: 'built'|'column'|'agent-row'|'not-checked', reason: string|null, id: string|null}} RuleState
 * @param {{line: {n: number, text?: string, rules?: string[], rule?: string}, tables: Record<string, {header: string[], rows: any[]}>, suggestions: any[]}} o
 * @returns {Promise<{rows: RuleState[], ruleRows: Placed[], agentRows: Placed[], checks: any[], refused: {helper: string, why: string}[]}>}
 */
export async function buildSheetLine({ line, tables, suggestions }) {
  const rules = lineRules(line);
  const roles = Object.keys(tables);
  const words = wordsSaidOn({ text: line.text, rules });
  /** @type {{helper: string, why: string}[]} */
  const refused = [];
  /** @type {Map<number, string>} */
  const refusedFor = new Map();
  /** @type {{nums: number[], fields: Record<string, any>}[]} */
  const buildable = [];
  for (const src of suggestions) {
    const s = toSuggestion(src);
    const nums = [...new Set(s.covers)].filter((n) => Number.isInteger(n) && n >= 1 && n <= rules.length && !isColumnChoiceRule(rules[n - 1])).sort((a, b) => a - b);
    const refuse = (/** @type {string} */ helper, /** @type {string} */ why) => { refused.push({ helper, why }); for (const n of nums) if (!refusedFor.has(n)) refusedFor.set(n, `suggestion refused: ${helper}: ${why}`); };
    const f = s.fields;
    if (!SHEET_RULES.includes(f.rule) || !isRec(V.rules[f.rule]?.ops) || !Object.hasOwn(V.rules[f.rule].ops, f.op)) { refuse('vocabulary', `no ${String(f.rule)} op "${String(f.op)}"`); continue; }
    const role = typeof f.table === 'string' ? f.table : roles.length === 1 ? roles[0] : null;
    if (role === null || !roles.includes(role)) { refuse('tables', `"${String(f.table)}" is not one of the line's sheets`); continue; }
    // `line` is the reply's own routing field (src/sheetoffer.js `sheetSuggestProp`), read by buildSheetChecks, never part of a check
    const { line: _line, ...own } = f;
    const check = { ...own, table: role };
    const bad = Object.keys(check).filter((k) => k !== 'rule' && !Object.hasOwn(V.rules[f.rule].fields, k));
    if (bad.length > 0) { refuse('schema', `field ${bad.join(', ')} is not a ${f.rule} field`); continue; }
    const probe = { id: 'probe', ...check, ...(f.rule === 'cells' ? { claim: 'probe' } : {}) };
    const cols = sheetCheckColumns(probe).filter((c) => !tables[role].header.includes(c));
    if (cols.length > 0) { refuse('columnAt', `'${cols[0]}' is not a column of "${role}"`); continue; }
    const reds = sheetCheckReds([probe], line.n, tables);
    if (reds.length > 0) { refuse('checkTables', reds[0].replace(/^line \d+: /, '')); continue; }
    const miss = groundedLiterals(bareguardChecks([probe])[0], words).missing;
    if (miss.length > 0) { refuse('groundedLiterals', `${miss[0].kind} ${JSON.stringify(miss[0].value)} (${miss[0].path}) is not in your words`); continue; }
    if (f.rule === 'cells' && claimSchema(bareguardChecks([probe])[0]) === null) { refuse('claimSchema', 'no answer box for this check'); continue; }
    if (f.rule === 'table' && tableCheckFails(probe, tables)) { refuse('runTableChecks', 'the table check already fails on the sheet'); continue; }
    buildable.push({ nums, fields: check });
  }
  // placement: answer (cells) checks first, then the order sent (a stable sort)
  const order = buildable.map((b, i) => ({ b, i })).sort((x, y) => (x.b.fields.rule === 'cells' ? 0 : 1) - (y.b.fields.rule === 'cells' ? 0 : 1) || x.i - y.i).map((x) => x.b);
  /** @type {Map<number, string>} */
  const held = new Map();
  /** @type {Map<number, string>} */
  const coveredByAgent = new Map();
  /** the rules a built `table` check named: it holds none of them (it judges the sheet, never a rule), so each reads the "cannot check this rule" sentence unless another check holds it */
  const namedByTable = new Set();
  /** @type {Placed[]} */
  const ruleRows = [];
  /** @type {Placed[]} */
  const agentRows = [];
  for (const b of order) {
    const asRule = b.fields.rule !== 'table' && b.nums.length > 0 && b.nums.every((n) => !held.has(n) && !coveredByAgent.has(n));
    if (b.fields.rule === 'table') for (const n of b.nums) namedByTable.add(n);
    const id = asRule ? `l${line.n}r${b.nums.join('_')}` : `l${line.n}a${agentRows.length + 1}`;
    // an [agent] row shows only a rule no rule row holds and no earlier [agent] row shows (never shown nowhere, never two rows); `row: 'agent'` is the tag's own typed field
    const shown = asRule ? b.nums : b.fields.rule === 'table' ? [] : b.nums.filter((n) => !held.has(n) && !coveredByAgent.has(n));
    const check = { id, ...b.fields, ...(b.fields.rule === 'cells' ? { claim: id } : {}), covers: shown, ...(asRule ? {} : { row: 'agent' }) };
    if (asRule) { for (const n of b.nums) held.set(n, id); ruleRows.push({ check, covers: b.nums }); } else { for (const n of shown) coveredByAgent.set(n, id); agentRows.push({ check, covers: shown }); }
  }
  /** @type {RuleState[]} */
  const rows = rules.map((text, i) => {
    const n = i + 1;
    if (isColumnChoiceRule(text)) return { rule: n, text, state: 'column', reason: null, id: null };
    if (held.has(n)) return { rule: n, text, state: 'built', reason: null, id: /** @type {string} */ (held.get(n)) };
    if (coveredByAgent.has(n)) return { rule: n, text, state: 'agent-row', reason: null, id: /** @type {string} */ (coveredByAgent.get(n)) };
    return { rule: n, text, state: 'not-checked', reason: refusedFor.get(n) ?? (namedByTable.has(n) ? NO_CHECK_FITS_WHY : NO_VALUE_WHY), id: null };
  });
  return { rows, ruleRows, agentRows, checks: [...ruleRows, ...agentRows].map((p) => p.check), refused };
}

/**
 * Build the checks of every sheet line from the reply's suggestions, each routed to its job line by its own `line`. Every sheet line in `lines` gets a result, a line with no suggestion included (its rules are
 * then Not checked with the no-pick sentence, never silently nothing). A suggestion that names no sheet line, or is not an object, is refused and listed with its helper.
 * @param {{lines: {n: number, text?: string, rules?: string[], rule?: string}[], tables: Record<string, {header: string[], rows: any[]}>, suggestions: any[]}} o
 * @returns {Promise<{built: Record<number, Awaited<ReturnType<typeof buildSheetLine>>>, checks: any[], notChecked: Record<string, string>, refused: {line: number|null, helper: string, why: string}[]}>}
 * `notChecked`: `line N: "rule"` -> the refusal that named it (or `NO_VALUE_WHY`), for each rule of a sheet line that no check holds
 */
export async function buildSheetChecks({ lines, tables, suggestions }) {
  /** @type {Record<number, Awaited<ReturnType<typeof buildSheetLine>>>} */
  const built = {};
  /** @type {Record<string, string>} */
  const notChecked = {};
  /** @type {{line: number|null, helper: string, why: string}[]} */
  const refused = [];
  /** @type {Map<number, any[]>} */
  const byLine = new Map(lines.map((l) => [l.n, []]));
  for (const s of suggestions) {
    if (!isRec(s)) { refused.push({ line: null, helper: 'schema', why: 'a suggestion is not an object' }); continue; }
    const mine = byLine.get(/** @type {number} */ (s.line));
    if (mine === undefined) { refused.push({ line: Number.isInteger(s.line) ? s.line : null, helper: 'line', why: `line ${String(s.line)} is not a sheet line` }); continue; }
    mine.push(s);
  }
  for (const line of lines) {
    const r = await buildSheetLine({ line, tables, suggestions: byLine.get(line.n) ?? [] });
    built[line.n] = r;
    for (const x of r.refused) refused.push({ line: line.n, ...x });
    for (const row of r.rows) if (row.state === 'not-checked') notChecked[`line ${line.n}: "${row.text}"`] = /** @type {string} */ (row.reason);
  }
  return { built, checks: lines.flatMap((l) => built[l.n].checks), notChecked, refused };
}
