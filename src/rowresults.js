// PER-ROW RESULTS of the one check list (Addendum 2026-11-14 (c) piece 4, hamr's pick b): each row of a rubric line gets its OWN pass or fail, from bareguard's own structured gaps for that line's step
// file, never a result shared by the line. Pure; no I/O. A gap is mapped to the ONE row that owns the check it names, by a rule that never guesses:
//   p<part>-facts, item `#<r>:d<fact>:<reason>`  ->  the row(s) that built that fact (the signed row's `facts` names it)
//   p<part>-count-min|max                         ->  the count row that points at that part
//   p<part>-<countable check>                     ->  the row(s) that point at that part (a pick, the cited default, the numbers default, the note)
//   text-present / happened                       ->  the line's floor row
//   the numbers tie (gradeStep's extra lines)     ->  the line's `$ numbers` row
// A gap that names no single row (a quote-level gap of a fact part: the quote carries no fact index; a part with no results at all) is NEVER spread over rows: it is returned in `unclaimed`, in plain words,
// and the line shows it as its own item. When the file itself could not be read (the floor is red), the line's other rows were not looked at: they read `unread`, never passed.
import { plainFactItem } from './facts.js';
import { plainStepGap } from './rubricstep.js';

const isRec = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** the check kinds a row may be, for the rows a step file is judged by */
const LINE_KINDS = ['rule', 'fact', 'phrase', 'count', 'cited', 'numbers', 'note', 'floor'];

/**
 * @typedef {{key: string, result: 'passed'|'failed'|'unread', why?: string}} RowResult
 * @param {any[]|null|undefined} list the signed list (`closeDecl.list`) @param {{step: number, parts: any[]}} params the rubric-step stage's params
 * @param {{verdict?: string, rawGaps?: any[], extraGaps?: string[], detail?: Record<string, any>}} graded `gradeStep`'s answer
 * @returns {{rows: RowResult[], unclaimed: string[]}}
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
  for (const g of graded.rawGaps ?? []) {
    const id = String(g.id ?? g.check);
    const plain = () => plainStepGap(n, why0, g, params).split('\n').join(' ');
    if (id === 'text-present' || id === 'happened') { for (const r of rows.filter((x) => x.kind === 'floor')) hit(r, plain()); if (!rows.some((x) => x.kind === 'floor')) unclaimed.push(plain()); continue; }
    const m = /^p(\d+)-(.+)$/.exec(id);
    const pi = m ? Number(m[1]) - 1 : -1;
    const part = params.parts[pi];
    if (!m || !isRec(part)) { unclaimed.push(plain()); continue; }
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
  const unreadable = rows.some((r) => r.kind === 'floor' && red.has(r.key));
  return {
    rows: rows.map((r) => (red.has(r.key) ? { key: r.key, result: /** @type {const} */ ('failed'), why: /** @type {string[]} */ (red.get(r.key)).join(' ') } : { key: r.key, result: unreadable && r.kind !== 'floor' ? /** @type {const} */ ('unread') : /** @type {const} */ ('passed') })),
    unclaimed,
  };
}
