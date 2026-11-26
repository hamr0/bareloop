// The ~ rules of one job line: a leaf with no imports, so every reader of a line's rules (src and tests) takes it from here.
const isRec = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** the ~ rules of one job line, one string each (`rules` when the line has the array, else the joined `rule` split on "; ") @param {any} l @returns {string[]} */
export function lineRules(l) {
  if (isRec(l) && Array.isArray(l.rules)) return l.rules.filter((/** @type {unknown} */ r) => typeof r === 'string' && r);
  return isRec(l) && typeof l.rule === 'string' && l.rule ? l.rule.split('; ').filter(Boolean) : [];
}
