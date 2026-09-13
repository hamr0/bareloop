// The public surface IS the adopter contract, and the contract is a document
// (`bareloop.context.md` + the CHANGELOG) that can drift ahead of `src/index.js`
// silently — an adopter finds out by importing a name that isn't there.
//
// This pins the names those documents name. It is deliberately a NAME check, not
// a behavior check: each export's semantics are owned by its own module's tests
// (job.test.js, plan.test.js, ralph.test.js); what has no other owner is the
// question "does the shipped index still hand this out?".
//
// Review 2026-07-30 (S9) found three documented-but-unexported names — `runStages`
// (CHANGELOG announces it async beside `runClose`), `checkMenu` (the context doc
// points adopters at it by name), and `STORE_VERBS` (CHANGELOG announces it as
// half of a split with the already-exported `WRITE_VERBS`). Exporting them made
// the documents true; this test keeps them that way.
//
// F167 (item 34 L4, 2026-09-13): the guard above this comment used to be a
// HAND-TYPED array — a prior session's copy of names read out of the doc once,
// never re-derived. `datedDestination`/`pickDelivery` shipped in the doc's M2b
// example but were never added to that array, so the guard read GREEN on a
// v0.25.0 that shipped `undefined` for both at the real package root; only a
// post-publish check of the real npm package caught it. `documentedExportNames`
// below reads the names live from `bareloop.context.md` instead, so a name
// added to the doc without exporting it reds on its own, no second edit needed.
//
// The extractor covers the doc's EXPLICIT export-marker idioms — the shapes an
// adopter actually copies or a sentence actually asserts an export by — not
// every function *mentioned* in flowing prose: (1) `import { ... } from
// 'bareloop'` code-fence examples; (2) `### `name(...)`` Public API section
// headings (only the symbol(s) the heading itself declares, split on ` / ` for
// a heading naming two — never the `→` return-value description half, which
// names a RESULT shape, not a second export); (3) `Menus exported: `A`, `B`, …`
// sentences; (4) a backtick name sitting tight against the word "exported"
// (`` `X` is exported ``, `` `X` (exported) ``, `` `X(...)` and `Y(...)` are
// exported ``, `exported as **X**`), EXCLUDING a name whose own clause says it
// is exported from a specific submodule (`` exported from `src/… ``) rather
// than from the package root. A broader sweep — every backtick call-shaped
// name mentioned anywhere inside a Public API section — was tried and rejected:
// on this doc it surfaces 97 candidates, 21 of them wrong (JS builtins/generic
// verbs quoted in prose, and real functions exported from their OWN submodule
// but never re-exported at the package root, e.g. `RETRIEVAL_PAIR`) — noise a
// regex cannot safely resolve without per-name semantic judgment, which would
// just be hand-curation under a different name. Two known false positives the
// four patterns above cannot structurally rule out are named and excluded
// inline: `main` (`` `main(argv, deps)`, exported ... as **`cliMain`** `` names
// the PRE-rename local symbol, not the export — `cliMain` is separately
// captured) and `resumableOutcomes` (`` (the canonical `resumableOutcomes`
// list, exported so an exported bundle inherits one spelling) `` — "exported"
// there describes "bundle", not this name; its real export, `CHECKPOINT_OUTCOMES`,
// is separately captured by pattern 3).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as bareloop from '../src/index.js';
import * as source from '../src/source.js';

const CONTEXT_DOC = new URL('../bareloop.context.md', import.meta.url);

/**
 * The mechanical extraction described in the block comment above. Pure over
 * its input text so `tests/index.test.js`'s own fixture tests can exercise it
 * without touching the real doc.
 * @param {string} doc
 * @returns {string[]} sorted, de-duplicated
 */
export function documentedExportNames(doc) {
  const found = new Set();
  const addLeadingIdentifier = (/** @type {string} */ token) => {
    const m = token.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
    if (m) found.add(m[1]);
  };

  // (1) import { a, b } from 'bareloop';
  for (const m of doc.matchAll(/import \{([^}]+)\} from 'bareloop'/g)) {
    for (const n of m[1].split(',')) addLeadingIdentifier(n.trim());
  }

  // (2) ### `name(...)` [/ `name2(...)`] [→ result] — `src/module.js`
  for (const m of doc.matchAll(/^### (.+)$/gm)) {
    for (const seg of m[1].split(' / ')) {
      const t = seg.trim();
      if (!t.startsWith('`')) continue;
      const bm = t.match(/^`([A-Za-z_][A-Za-z0-9_]*)/);
      if (bm) found.add(bm[1]);
    }
  }

  // (3) Menus exported: `A`, `B` — plus `C` and `D`.  (spans to the next blank line)
  for (const m of doc.matchAll(/[Mm]enus exported:([\s\S]+?)\n\n/g)) {
    for (const bt of m[1].matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)) found.add(bt[1]);
  }

  // (4) `X` / `X(...)` tight against "exported", excluding a named submodule
  // ("exported from `src/…`" is a module-level claim, not a root one).
  for (const m of doc.matchAll(
    /`([A-Za-z_][A-Za-z0-9_]*)(?:\([^)]*\))?`(?:[^\n`]{0,20})?\b(?:is |stays )?exported\b(?!\s+from\s+`src)/g,
  )) found.add(m[1]);
  // "exported ... as **X**" (a rename — X is the real export, not the name before "exported")
  for (const m of doc.matchAll(/exported[^\n]{0,45}\*\*`?([A-Za-z_][A-Za-z0-9_]*)`?\*\*/g)) found.add(m[1]);
  // "`X(...)` [and `Y(...)`] are/is exported" — same submodule exclusion as (4)
  for (const m of doc.matchAll(
    /`([A-Za-z_][A-Za-z0-9_]*)\([^`]*\)`(?:\s*and\s*`([A-Za-z_][A-Za-z0-9_]*)\([^`]*\)`)?\s+(?:are|is)\s+exported\b(?!\s+from\s+`src)/g,
  )) { found.add(m[1]); if (m[2]) found.add(m[2]); }

  // Two false positives the patterns above cannot structurally rule out
  // (see the block comment above this function) — named, not silently dropped.
  found.delete('main');
  found.delete('resumableOutcomes');

  return [...found].sort();
}

test('the documented public surface is actually exported from src/index.js', () => {
  const doc = readFileSync(CONTEXT_DOC, 'utf8');
  const documented = documentedExportNames(doc);
  assert.ok(documented.length > 20, `the extractor found suspiciously few names (${documented.length}) — it likely broke against the doc's current shape`);
  const missing = documented.filter((n) => bareloop[n] === undefined);
  assert.deepEqual(missing, [], `documented but not exported — the adopter contract is false: ${missing.join(', ')}`);
});

test('documentedExportNames: the four idioms it reads, on a small fixture (fail-first proof for the extractor itself)', () => {
  const fixture = [
    "import { alpha, beta } from 'bareloop';",
    '',
    '### `gamma(x)` → `{ok}` — `src/gamma.js`',
    '',
    '### `delta(x)` / `epsilon(y)` — `src/de.js`',
    '',
    'Menus exported: `ZETA_MENU`, `ETA_MENU` — plus `theta` itself.',
    '',
    '`iota` (exported) does the thing. `kappa(x)` is exported from `src/kappa.js` only (module-level, not root).',
    '',
    '`lambda(x)` and `mu(y)` are exported together.',
    '',
    'the internal `main(argv)`, exported from the package root as **`xi`**.',
  ].join('\n');
  const names = documentedExportNames(fixture);
  assert.deepEqual(names, [
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'ZETA_MENU', 'ETA_MENU', 'theta',
    'iota', 'lambda', 'mu', 'xi',
  ].sort(), `extractor drifted from its own four documented idioms: ${JSON.stringify(names)}`);
  // the two exclusions this fixture proves: a module-level "exported from
  // `src/…`" claim never counts, and the real doc's ONE rename case (`main`,
  // pre-rename, → `cliMain`) never does either — `main` is a named, explicit
  // exclusion in `documentedExportNames` itself, not something this shape
  // structurally rules out on its own.
  assert.ok(!names.includes('kappa'), 'kappa is exported from its OWN submodule only, never the package root');
  assert.ok(!names.includes('main'), 'main is the real doc\'s pre-rename local name; xi (standing in for cliMain) is the real export');
});

test('datedDestination and pickDelivery are importable from the package root and are the source.js functions', () => {
  // `package.json`'s `exports`/`main` both point at `src/index.js` — that is
  // the actual package-root entry an adopter's `import { x } from 'bareloop'`
  // resolves to, not `src/source.js` directly.
  assert.equal(typeof bareloop.datedDestination, 'function');
  assert.equal(typeof bareloop.pickDelivery, 'function');
  assert.equal(bareloop.datedDestination, source.datedDestination, 're-export must be the same function, not a re-derivation');
  assert.equal(bareloop.pickDelivery, source.pickDelivery, 're-export must be the same function, not a re-derivation');
});

test('the three names S9 found missing are the shapes the docs promise', () => {
  // `runStages` is announced as async (F68) alongside `runClose`; a Promise-returning
  // function is the whole breaking change adopters were told about.
  assert.equal(typeof bareloop.runStages, 'function');
  assert.equal(typeof bareloop.runClose, 'function');
  assert.equal(bareloop.runStages.constructor.name, 'AsyncFunction');
  assert.equal(bareloop.runClose.constructor.name, 'AsyncFunction');

  // `checkMenu` derives the offerable stages from a validated staged close.
  assert.equal(typeof bareloop.checkMenu, 'function');
  assert.deepEqual(bareloop.checkMenu('not a close'), [], 'tolerates a non-list rather than throwing at an adopter');

  // WRITE_VERBS / STORE_VERBS ship as a pair, both frozen — neither class is
  // read-capable, which is why the scout is granted neither.
  assert.deepEqual(bareloop.STORE_VERBS, ['stash', 'remember', 'forget']);
  assert.ok(Object.isFrozen(bareloop.STORE_VERBS), 'a mutable menu export would let adopter code edit the fence');
  assert.deepEqual(bareloop.WRITE_VERBS, ['write', 'edit']);
  assert.ok(Object.isFrozen(bareloop.WRITE_VERBS));
});
