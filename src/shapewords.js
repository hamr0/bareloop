// SHAPE JOBS (itemShape), docs/product/ITEM33-BUILD.md "Addendum 2026-11-18: shape jobs", clause 7 "Words": the plain sentence of a bareguard `itemShape` gap, so a red says what to fix and never a raw code.
// bareguard's item reds read `#<i>:<path>:<reason>` (0-based item, dotted path, `name[j]` for a list entry; reasons `missing`, `wrong-type`, `not-one-of`, `bad-number|money|date|time|url`, `wrong-value`, `under`, `over`,
// `too-short|too-long:chars|words:<n><|><bound>`, `unknown-field:<key>`, and a list's `not-a-list`, `unreadable`, `count-under|count-over:<n><|><bound>`, `too-many:<n>><cap>`, `duplicate`); an item with no field part is
// `#<i>:item-not-object` or `#<i>:unreadable`. The whole-field gaps are `missing`, `unreadable`, `not-a-list`, `too-many`, `count-under`, `count-over`. A gap carries names, counts and bounds, never the worker's values, so
// neither does a sentence here. The item is shown 1-based ("item 2" for `#1`). A reason this table does not know falls back to its raw text: nothing is dropped.
// Pure. `plainShapeGap` is called by src/rubricstep.js `plainStepGap`; `plainShapeItem` and `itemFieldOf` by src/rowresults.js.

/** the kinds of value a reader names in a red, in a person's words */
const READS = Object.freeze({ 'bad-number': 'a number', 'bad-money': 'a money amount', 'bad-date': 'a date', 'bad-time': 'a time', 'bad-url': 'a web address' });

/** one path as words: `tags[2]` is `tags, entry 3` (entries count from 1 for a person) @param {string} path @returns {string} */
const pathWords = (path) => path.replace(/\[(\d+)\]/g, (_m, j) => `, entry ${Number(j) + 1}`);

/**
 * Split one item red into its item (0-based), its field path (null when the red is about the item as a whole) and its reason. Null when the text is not an item red.
 * @param {unknown} item @returns {{i: number, path: string|null, reason: string}|null}
 */
export function parseShapeItem(item) {
  const m = /^#(\d+):(.*)$/s.exec(String(item));
  if (!m) return null;
  const rest = m[2];
  const i = Number(m[1]);
  if (rest === 'item-not-object' || rest === 'unreadable' || rest.startsWith('unknown-field:')) return { i, path: null, reason: rest };
  const at = rest.indexOf(':');
  return at < 0 ? { i, path: null, reason: rest } : { i, path: rest.slice(0, at), reason: rest.slice(at + 1) };
}

/** the field a red names, as the signed spec names it: the first name of the path, a list entry's `[j]` and a nested `.name` left off @param {unknown} item @returns {string|null} */
export function itemFieldOf(item) {
  const p = parseShapeItem(item);
  return p && p.path !== null ? p.path.split(/[.[]/)[0] : null;
}

/**
 * One item red as a plain sentence: `item 2: "summary" is too long (201 characters, at most 200)`.
 * @param {unknown} item `#<i>:<path>:<reason>` @returns {string}
 */
export function plainShapeItem(item) {
  const p = parseShapeItem(item);
  if (p === null) return String(item);
  const at = `item ${p.i + 1}`;
  const r = p.reason;
  if (p.path === null) {
    if (r === 'item-not-object') return `${at} is not an object with named fields`;
    if (r === 'unreadable') return `${at} could not be read`;
    if (r.startsWith('unknown-field:')) return `${at} has a field "${r.slice('unknown-field:'.length)}" that the job does not ask for`;
    return `${at}: ${r}`;
  }
  const f = `"${pathWords(p.path)}"`;
  const w = /^(too-short|too-long):(chars|words):(\d+)([<>])(\d+)$/.exec(r);
  if (w) {
    const unit = w[2] === 'chars' ? 'characters' : 'words';
    return w[1] === 'too-long' ? `${at}: ${f} is too long (${w[3]} ${unit}, at most ${w[5]})` : `${at}: ${f} is too short (${w[3]} ${unit}, at least ${w[5]})`;
  }
  const c = /^(count-under|count-over):(\d+)([<>])(\d+)$/.exec(r);
  if (c) return c[1] === 'count-over' ? `${at}: ${f} has ${c[2]} entries, at most ${c[4]} are allowed` : `${at}: ${f} has ${c[2]} entries, at least ${c[4]} are required`;
  const t = /^too-many:(\d+)>(\d+)$/.exec(r);
  if (t) return `${at}: ${f} has too many entries to check (${t[1]} against a limit of ${t[2]})`;
  if (r.startsWith('unknown-field:')) return `${at}: ${f} has a field "${r.slice('unknown-field:'.length)}" that the job does not ask for`;
  if (Object.hasOwn(READS, r)) return `${at}: ${f} is not ${/** @type {Record<string, string>} */ (READS)[r]} as written`;
  switch (r) {
    case 'missing': return `${at}: ${f} is missing`;
    case 'wrong-type': return `${at}: ${f} is not the kind of value the job asks for`;
    case 'not-one-of': return `${at}: ${f} is not one of the allowed values`;
    case 'wrong-value': return `${at}: ${f} does not have the value the job asks for`;
    case 'under': return `${at}: ${f} is below the lowest value allowed`;
    case 'over': return `${at}: ${f} is above the highest value allowed`;
    case 'not-a-list': return `${at}: ${f} is not a list`;
    case 'unreadable': return `${at}: ${f} could not be read`;
    case 'duplicate': return `${at}: ${f} repeats an earlier entry`;
    default: return `${at}: ${f} ${r}`;
  }
}

/**
 * One bareguard `itemShape` gap as plain lines (one per item red, or one for a whole-field gap).
 * @param {{at: string, file: string, field?: string}} where `at` = `line N`, `file` = the step file's path, `field` = the answer field holding the items (default `results`)
 * @param {any} g the gap @returns {string}
 */
export function plainShapeGap({ at, file, field = 'results' }, g) {
  const f = `"${field}"`;
  switch (g.kind) {
    case 'missing': return `${at}: ${file} has no ${f} list — give a list of items, one object per item`;
    case 'unreadable': return `${at}: ${f} in ${file} could not be read`;
    case 'not-a-list': return `${at}: ${f} in ${file} is not a list (it is ${g.measured ?? 'something else'}) — give a list of items`;
    case 'too-many': return `${at}: ${f} lists too many items to check (${g.measured} against a limit of ${g.limit})`;
    case 'count-under': return `${at}: ${f} lists ${g.measured} item(s), at least ${g.limit} are required`;
    case 'count-over': return `${at}: ${f} lists ${g.measured} item(s), at most ${g.limit} are allowed`;
    case 'item-shape': {
      const items = Array.isArray(g.items) ? g.items : [];
      const lines = items.map((/** @type {unknown} */ it) => `${at}: ${plainShapeItem(it)}`);
      const more = typeof g.itemsTotal === 'number' ? g.itemsTotal - items.length : 0;
      return [...lines, ...(more > 0 ? [`${at}: and ${more} more problem(s) in the items`] : [])].join('\n');
    }
    default: return `${at}: the items cannot be checked (${String(g.kind)})`;
  }
}

/** the number of reds a gap counts for the stage's trend number: each item red is one, a whole-field gap is one @param {any} g @returns {number} */
export const shapeGapCount = (g) => (g.kind === 'item-shape' ? (typeof g.itemsTotal === 'number' ? g.itemsTotal : Array.isArray(g.items) ? g.items.length : 1) : 1);
