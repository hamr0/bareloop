// PER-ROW RESULTS of the one check list (Addendum 2026-11-14 (c) piece 4, hamr's pick b): each row of a rubric line gets its OWN pass or fail, from bareguard's own structured gaps for that line's step
// file, never a result shared by the line. Pure; no I/O. A gap is mapped to the ONE row that owns the check it names, by a rule that never guesses:
//   p<part>-facts, item `#<r>:d<fact>:<reason>`  ->  the row(s) that built that fact (the signed row's `facts` names it)
//   p<part>-count-min|max                         ->  the count row that points at that part
//   p<part>-<countable check>                     ->  the row(s) that point at that part (a pick, the cited default, the numbers default, the note)
//   text-present / happened                       ->  the line's floor row
//   the numbers tie (gradeStep's extra lines)     ->  the line's `$ numbers` row
//   itemShape, item `#<i>:<field>:<reason>`        ->  the row of that field (a `~` rule row, or an `!` extra field's row); a whole-field gap, or an item with no field, the line's `$ shape` row
// A gap that names no single row (a quote-level gap of a fact part: the quote carries no fact index; a part with no results at all) is NEVER spread over rows: it is returned in `unclaimed`, in plain words,
// and the line shows it as its own item. When the file itself could not be read (the floor is red), the line's other rows were not looked at: they read `unread`, never passed.
import { plainFactItem } from './facts.js';
import { plainStepGap } from './rubricstep.js';
import { plainShapeItem, itemFieldOf } from './shapewords.js';
import { shapePartOf, shapeRowKey, shapeDefaultKey } from './shaperows.js';

const isRec = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** the check kinds a row may be, for the rows a step file is judged by */
const LINE_KINDS = ['rule', 'fact', 'phrase', 'count', 'cited', 'numbers', 'note', 'floor', 'sheet', 'shape'];

/**
 * @typedef {{key: string, result: 'passed'|'failed'|'unread', why?: string}} RowResult
 * @param {any[]|null|undefined} list the signed list (`closeDecl.list`) @param {{step: number, parts: any[]}} params the rubric-step stage's params
 * @param {{verdict?: string, rawGaps?: any[], extraGaps?: string[], citeGaps?: string[], ruleCounts?: Record<number, {min?: number, max?: number}>, detail?: Record<string, any>}} graded `gradeStep`'s answer
 * @returns {{rows: RowResult[], unclaimed: string[], items?: string[]}}
 */
export function rowResultsOf(list, params, graded) {
  const n = params.step;
  const rows = (Array.isArray(list) ? list : []).filter((/** @type {any} */ r) => isRec(r) && r.line === n && r.state === 'built' && LINE_KINDS.includes(r.kind));
  /** @type {Map<string, string[]>} the plain reasons each red row has */
  const red = new Map();
  /** @type {string[]} */
  const unclaimed = [];
  const hit = (/** @type {any} */ r, /** @type {string} */ why) => red.set(r.key, [...(red.get(r.key) ?? []), why]);
  const why0 = typeof graded.detail?.why === 'string' ? graded.detail.why : 'empty';
  /** the rows that carry part `pi`: a row points at its part, or a `~` rule row is named in the part's own `rules` */
  const rowsOfPart = (/** @type {number} */ pi) => rows.filter((r) => r.kind !== 'floor' && ((isRec(r.part) && r.part.part === pi) || (r.kind === 'rule' && Array.isArray(params.parts[pi]?.rules) && params.parts[pi].rules.includes(r.rule))));
  /** shape jobs: the raw item reds (`#<i>:<path>:<reason>`, names and counts only) of the line's `itemShape` gaps: what the Result tab's grid reads to mark a cell @type {string[]} */
  const items = [];
  for (const g of graded.rawGaps ?? []) {
    const id = String(g.id ?? g.check);
    const plain = () => plainStepGap(n, why0, g, params).split('\n').join(' ');
    if (id === 'text-present' || id === 'happened') { for (const r of rows.filter((x) => x.kind === 'floor')) hit(r, plain()); if (!rows.some((x) => x.kind === 'floor')) unclaimed.push(plain()); continue; }
    // S4: a gap of a sheet check names the check by its own id (bareguard's `id`); it lands on the row that holds that check: the `[you]` rule row for a rule row's check, the `[agent]` row for an agent check, and the rules an agent row shows
    const sheetCheck = (params.parts ?? []).flatMap((/** @type {any} */ p) => (isRec(p) && p.class === 'sheet' && Array.isArray(p.checks) ? p.checks : [])).find((/** @type {any} */ c) => isRec(c) && c.id === id);
    if (sheetCheck) {
      const covers = Array.isArray(sheetCheck.covers) ? sheetCheck.covers : [];
      const owners = rows.filter((r) => (r.kind === 'sheet' && r.key === `L${n}.sheet.${id}`) || (r.kind === 'rule' && covers.includes(r.rule)));
      if (owners.length === 0) unclaimed.push(plain()); else for (const r of owners) hit(r, plain());
      continue;
    }
    // shape jobs (clause 8): an `itemShape` gap names an item and a field (`#<i>:<path>:<reason>`): the `[you]` rule row whose rule made that field, or the `[agent]` row of an extra field; a whole-field gap (no list, the
    // count) or an item red with no field lands on the line's `[default]` row, the one that says "the answer is a list of items"
    if (g.check === 'itemShape') {
      const shape = shapePartOf(params);
      const defaults = rows.filter((r) => r.kind === 'shape' && r.key === shapeDefaultKey(n));
      const raw = g.kind === 'item-shape' && Array.isArray(g.items) ? g.items : null;
      // fwdloop v0.37.0 (M19 am11 item 4): a count gap (`count-under`, `count-over`) is on the row of the `~` rule that set that bound: a rule row that points at the shape part and is no field's rule. With several such rules the bound the gap
      // names (`limit`) picks the one whose own bound it is (`graded.ruleCounts`, rule number -> {min?, max?}); a gap no rule owns is never put on a guessed row.
      if (raw === null && (g.kind === 'count-under' || g.kind === 'count-over')) {
        const si = Array.isArray(params.parts) ? params.parts.indexOf(shape) : -1;
        const fieldRules = new Set((shape?.fields ?? []).map((/** @type {any} */ f) => f.rule));
        const own = rows.filter((r) => r.kind === 'rule' && isRec(r.part) && r.part.part === si && !fieldRules.has(r.rule));
        const bound = g.kind === 'count-under' ? 'min' : 'max';
        const owners = own.length === 1 ? own : own.filter((r) => graded.ruleCounts?.[r.rule]?.[bound] === g.limit);
        if (owners.length > 0) { for (const r of owners) hit(r, plain()); continue; }
      }
      if (raw === null) { if (defaults.length === 0) unclaimed.push(plain()); else for (const r of defaults) hit(r, plain()); continue; }
      for (const it of raw) {
        items.push(String(it));
        const name = itemFieldOf(it);
        const field = name === null ? null : (shape?.fields ?? []).find((/** @type {any} */ f) => isRec(f) && f.name === name);
        const owners = field ? rows.filter((r) => (r.kind === 'shape' && r.key === shapeRowKey(n, name ?? '')) || (r.kind === 'rule' && field.row !== 'agent' && r.rule === field.rule)) : defaults;
        if (owners.length === 0) unclaimed.push(plainShapeItem(it)); else for (const r of owners) hit(r, plainShapeItem(it));
      }
      continue;
    }
    const m = /^p(\d+)-(.+)$/.exec(id);
    const pi = m ? Number(m[1]) - 1 : -1;
    const part = params.parts[pi];
    if (!m || !isRec(part)) { unclaimed.push(plain()); continue; }
    // a shape part's cite (the quotes are found in the files the items name): the line's `$cited` row owns it, no item-field row does
    if (part.class === 'shape' && m[2] === 'cite') {
      const cited = rows.filter((r) => r.kind === 'cited');
      if (cited.length === 0) unclaimed.push(plain()); else for (const r of cited) hit(r, plain());
      continue;
    }
    if (part.class === 'fact' && m[2] === 'facts') {
      const items = Array.isArray(g.items) ? g.items : [];
      if (g.kind !== 'unsupported' || items.length === 0) { unclaimed.push(plain()); continue; }
      for (const it of items) {
        const im = /^#(\d+):d(\d+):/.exec(String(it));
        const fname = im ? part.facts?.[Number(im[2])]?.name : undefined;
        const owners = fname === undefined ? [] : rows.filter((r) => Array.isArray(r.facts) && r.facts.includes(fname));
        if (owners.length === 0) { unclaimed.push(plainFactItem(String(it), part)); continue; }
        for (const r of owners) hit(r, plainFactItem(String(it), part));
      }
      continue;
    }
    const owners = part.class === 'fact' ? rows.filter((r) => r.kind === 'count' && isRec(r.part) && r.part.part === pi) : rowsOfPart(pi);
    if (owners.length === 0) { unclaimed.push(plain()); continue; }
    for (const r of owners) hit(r, plain());
  }
  // the numbers tie of a text line (gradeStep's own lines): the line's `$ numbers` row owns it
  for (const line of graded.extraGaps ?? []) {
    const owner = rows.find((r) => r.kind === 'numbers');
    if (owner) hit(owner, line); else unclaimed.push(line);
  }
  // the cite's own reds (an item's file that is no file of the repo, a named-files text over the cap): the cite row owns them
  for (const line of graded.citeGaps ?? []) {
    const owner = rows.find((r) => r.kind === 'cited');
    if (owner) hit(owner, line); else unclaimed.push(line);
  }
  const unreadable = rows.some((r) => r.kind === 'floor' && red.has(r.key));
  return {
    rows: rows.map((r) => (red.has(r.key) ? { key: r.key, result: /** @type {const} */ ('failed'), why: /** @type {string[]} */ (red.get(r.key)).join(' ') } : { key: r.key, result: unreadable && r.kind !== 'floor' ? /** @type {const} */ ('unread') : /** @type {const} */ ('passed') })),
    unclaimed,
    ...(items.length ? { items } : {}),
  };
}

/**
 * The `shape-items` spine records a close's stage entries call for (F399, report-only): one `{step, line, items}` per stage entry that carries raw shape item reds.
 * `step` is the stage's name; `line` the job line its name says (`line-<n>`), else null. A stage entry is already masked (src/declaredclose.js `rowsRecordOf`).
 * The three writers (src/ralph.js, src/planrun.js outer close, src/planrun.js `runCheck`) ask here; no verdict path reads the record back.
 * @param {any} close a close result, or anything else (a command close has no stages)
 * @returns {{step: string, line: number|null, items: string[]}[]}
 */
export function shapeItemRecordsOf(close) {
  const stages = Array.isArray(close?.stages) ? close.stages : [];
  return stages.flatMap((/** @type {any} */ s) => {
    if (!s || typeof s.name !== 'string' || !Array.isArray(s.items) || s.items.length === 0) return [];
    const m = /^line-(\d+)$/.exec(s.name);
    return [{ step: s.name, line: m ? Number(m[1]) : null, items: s.items.filter((/** @type {unknown} */ x) => typeof x === 'string') }];
  });
}
