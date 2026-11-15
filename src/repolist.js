// The ONE list of a repo job (Addendum 2026-11-15 (d), hamr: "if you can't prove it it goes to not checked like every thing else"). A small pure row builder: the signed rows of a repo job are built
// from the person's `~` rules, the drafter's work stages, the mandatory guards and the write fence, and from nothing else. A `~` rule shows as kept in ONE case only: the drafter said the write fence
// keeps it and CODE proved it ($0, from the repo listing and the signed write scope). Every other rule is Not checked, with a reason code writes. No AI link between a stage and a rule exists, so none is shown.
// Pure; no IO. (src/checkblock.js is rubric-only and is not bent for this.)
import { lineRules, guardKeyOf, FENCE_KEY } from './rubricstep.js';
import { globToPrefix } from './validate.js';

/** the reason of a `~` rule nothing code can prove keeps */
export const NO_CHECK_WORDS = 'no check code can prove keeps this rule — you judge it at Accept';
/** the key of a `~` rule row: line, then the rule's number */
export const ruleKeyOf = (/** @type {number} */ n, /** @type {number} */ k) => `L${n}.~${k}`;
/** the key of an `!` work-stage row */
export const stageKeyOf = (/** @type {string} */ name) => `S.${name}`;
/** the stage a row key names, or '' @param {unknown} key @returns {string} */
export const stageNameOfKey = (key) => (typeof key === 'string' && key.startsWith('S.') ? key.slice(2) : '');

/** @param {string} p a path as the drafter wrote it @returns {string} */
const cleanPath = (p) => String(p).trim().replace(/^\.\//, '').replace(/\/+$/, '');
/** @param {string} rel @param {string} scope one write-scope entry (a glob or a prefix) @returns {boolean} is `rel` a place the run may change under this entry */
function underScope(rel, scope) {
  const pre = cleanPath(globToPrefix(String(scope)));
  if (pre === '' || pre === '.' || pre === '/') return true;
  return rel === pre || rel.startsWith(`${pre}/`);
}

/**
 * Code's proof of a fence claim, at $0: `path` names a file (or a folder) that is in the repo listing, and none of the files it names is a place the run may change. Anything else is not proven, and says why in plain words.
 * @param {string} path @param {string[]|null|undefined} writeScope the signed write fence @param {string[]|null|undefined} files the repo listing at the seed
 * @returns {{ok: true, path: string}|{ok: false, reason: string}}
 */
export function proveFenceClaim(path, writeScope, files) {
  const p = cleanPath(path);
  const said = 'the AI said the fence keeps it, but';
  if (!p || p.startsWith('/') || p.split('/').includes('..')) return { ok: false, reason: `${said} "${String(path)}" is not a path inside the repo` };
  const scope = Array.isArray(writeScope) ? writeScope : [];
  if (scope.length === 0 || !Array.isArray(files)) return { ok: false, reason: `${said} code could not read the fence or the repo listing to check it` };
  const hit = files.filter((f) => f === p || f.startsWith(`${p}/`));
  if (hit.length === 0) return { ok: false, reason: `${said} ${p} is not in the repo listing` };
  if (hit.some((f) => scope.some((s) => underScope(f, s)))) return { ok: false, reason: `${said} ${p} is a place the run may change` };
  return { ok: true, path: p };
}

/**
 * The signed rows (`closeDecl.list`) of a repo job.
 *  `~ [you]`   one row per rule of every job line: built + `fence: <path>` only when a fence claim for it is proven; else Not checked with code's reason.
 *  `! [agent]` one row per work stage (the stage the drafter wrote for a line; a mandatory guard is not one), on its first line; and a Not checked row for a line the drafter refused without naming a rule.
 *  `$ [default]` one row per mandatory guard and one for the write fence, once for the whole job (line 0).
 * @param {{jobLines: any[]|null|undefined, stages: any[]|null|undefined, refused?: any[]|null, fenceKept?: any[]|null, guardNames?: string[]|null, writeScope?: string[]|null, files?: string[]|null}} o
 * @returns {any[]}
 */
export function buildRepoRows({ jobLines, stages, refused = null, fenceKept = null, guardNames = null, writeScope = null, files = null }) {
  const lines = Array.isArray(jobLines) ? jobLines.filter((/** @type {any} */ l) => l && Number.isInteger(l.n)) : [];
  const guards = new Set(guardNames ?? []);
  const claims = Array.isArray(fenceKept) ? fenceKept : [];
  /** @type {any[]} */
  const rows = [];
  for (const l of lines) {
    lineRules(l).forEach((_t, i) => {
      const k = i + 1;
      const base = { line: l.n, key: ruleKeyOf(l.n, k), from: 'rule', by: 'you', kind: 'rule', rule: k };
      const mine = claims.filter((/** @type {any} */ c) => c && c.line === l.n && c.rule === k && typeof c.path === 'string');
      const proofs = mine.map((/** @type {any} */ c) => proveFenceClaim(c.path, writeScope, files));
      const ok = proofs.find((p) => p.ok);
      if (ok && ok.ok) rows.push({ ...base, state: 'built', fence: ok.path });
      else rows.push({ ...base, state: 'not-checked', reason: (() => { const bad = proofs.find((p) => !p.ok); return bad && !bad.ok ? bad.reason : NO_CHECK_WORDS; })() });
    });
    for (const s of Array.isArray(stages) ? stages : []) {
      if (!s || typeof s.name !== 'string' || guards.has(s.name) || !Array.isArray(s.fromLine) || s.fromLine.length === 0) continue;
      if (Math.min(...s.fromLine) === l.n) rows.push({ line: l.n, key: stageKeyOf(s.name), from: 'agent', by: 'agent', kind: 'stage', state: 'built' });
    }
    (Array.isArray(refused) ? refused : []).filter((/** @type {any} */ r) => r && r.line === l.n && !Number.isInteger(r.rule) && typeof r.reason === 'string')
      .forEach((/** @type {any} */ r, /** @type {number} */ i) => rows.push({ line: l.n, key: `L${l.n}.refused.${i + 1}`, from: 'agent', by: 'agent', kind: 'stage', state: 'not-checked', reason: r.reason }));
  }
  for (const name of guards) rows.push({ line: 0, key: guardKeyOf(name), from: 'default', by: 'default', kind: 'guard', state: 'built' });
  if (Array.isArray(writeScope) && writeScope.length) rows.push({ line: 0, key: FENCE_KEY, from: 'default', by: 'default', kind: 'fence', state: 'built' });
  return rows;
}
