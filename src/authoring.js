// THE AUTHORING SURFACE — close-authoring v1, module M2 (design record
// 2026-08-07, FROZEN; gate-2 POC closed 2026-08-08).
//
// M1 owns what a stage DOES. This module owns what a declaration may SAY, and
// whether a given declaration said it legally. Three things live here and they
// belong together because they are one contract read from three sides:
//
//   1. THE KIND CATALOGUE — the entire vocabulary an authoring call has. It
//      parameterises kinds whose implementations we own; a script body, a shell
//      fragment and a new kind are not rejected late, they are INEXPRESSIBLE
//      (D2/D3, the `check-passes(name)` move). `judged-floor` and
//      `human-confirms` are LOCKED MENU ENTRIES: declaring one is a distinct
//      `locked-kind` red at VALIDATION, before any tokens, carrying counted
//      demand (the LOCKED_VERDICTS pattern, src/job.js:520). `harness-loop` is
//      ABSENT — no entry at all, so declaring it is an unknown-kind typo, which
//      is the honest reading of a kind that is out of v1 (gate 1, Result 2).
//
//   2. THE TYPES GENRE — the one genre v1 admits (D13). Its template is FROZEN
//      TEXT, byte-identical to the prereg's addendum 3, and its two guard
//      batteries are OURS. D5 is the load-bearing decision of the whole design:
//      the close carries guards the user did not ask for and cannot remove,
//      because the stage that forecloses the easy win is exactly the stage an
//      LLM asked "what would done look like" will not write well (F87 + the RSI
//      rubric-close gotcha). Gate-2 round 1 measured the failure mode precisely:
//      the guard-stripped arm DID invent a guard-SHAPED stage — with 2 of its 4
//      patterns dead letters and both live suppression channels of that patient
//      missed. The shape is cheap; the battery is what was paid for.
//
//      Round 3 added the two residues addendum 6 hands to this build, and both
//      are OURS TO INJECT, never model-filled:
//        - guard SCOPE. The suppression scan covers EVERY changed file of the
//          genre's extensions. Round 3's arm A narrowed it to the two target
//          files, which reads stricter and is not: a suppression added in a NEW
//          helper file walks straight through a target-file filter.
//        - genre ENV. `MYPYPATH` on a Python patient is the Result-5 fact no
//          user could supply and no model found (round 2 authored `src`, which
//          is wrong). It is expressed HERE as genre data and applied by the flow
//          (M3); a declaration that authors it itself is a red.
//
//   3. THE DECLARATION VALIDATOR — the first of D9's three mechanical gates.
//      Schema, kinds, params, the F84 one-population law, F49's static regex
//      reject, the D5 guard equality, and hamr's listing rule: every path the
//      model wrote down must SELECT from the real seed listing. Round 2's arm A
//      invented `src/alertEmail.js` from the user's prose ("the alert email
//      one") and silently reclassified 15 real errors into the wrong
//      population. A path is not a judgment call — it either names something in
//      the tree or it does not.
//
// What this module deliberately does NOT do:
//   - it never judges QUALITY. Nothing here asks whether the close is a GOOD
//     close; D9's other two gates (the precheck and the seed-verdict read) plus
//     the user's signature do that, and no LLM validates another LLM's close.
//   - it never enforces the genre's stage SKELETON. The template states it to
//     the author; a close with no work stage is caught by the seed-verdict read
//     (nothing red at seed = nothing to do), which is where round 2's arm B
//     died. A validator that demanded named stages would be authoring them.
//   - it never inspects command ARGS for paths. hamr's rule enumerates path
//     PARAMS; an arg list carries flags, module names and config paths, and a
//     `path-not-in-listing` red on `--strict` would be nonsense. The named
//     consequence, not smoothed: an invented path can still ride in `args`, and
//     the seed-verdict read is what catches it (it did, in round 2).
//
// One spelling of everything shared: `normalizeParser` and `regexGroups` are
// M1's, imported, never re-spelled — the validator and the executor must agree
// on what a parser MEANS or the one that grades is the one nobody validated.
// `hasNestedQuantifier` and `globToPrefix` are the shipped primitives from
// src/validate.js for the same reason (F49 is monotonic-only doctrine and the
// detector is never touched from here; globToPrefix's collapse order is fence
// territory, F9).
//
// NOTE for M4 wiring: nothing here is exported from src/index.js yet. M1
// flagged a `runClose` naming collision between the kind executor and
// src/ralph.js; the public surface is settled once at M4, not piecemeal.

import { normalizeParser } from './kinds.js';
import { isObj, isNonEmptyString, hasNestedQuantifier, globToPrefix } from './validate.js';

/** @typedef {{code: string, path: string, detail: string, [k: string]: any}} Red */
/** @typedef {{required: readonly string[], optional: readonly string[], pathParams: readonly string[], locked?: true, shape: string, asserts: string}} KindSpec */

// ── 1. THE KIND CATALOGUE ────────────────────────────────────────────────────

/**
 * The whole vocabulary, as DATA. `shape` and `asserts` are the strings the
 * authoring prompt renders (M3) — the prompt and this validator must judge the
 * same facts, so they read one catalogue rather than two (the drift class
 * SECRET_PATTERNS exists to prevent, one layer up).
 *
 * `pathParams` names every param that carries a repository path, in dotted
 * form. It is data rather than a switch so hamr's listing rule reaches a new
 * path-bearing param the day one is added, instead of the day someone
 * remembers to widen a condition.
 *
 * Optionality is read off the prereg §5 table, with ONE deliberate divergence
 * from the gate-2 POC validator, named because it reverses a POC behaviour:
 * `pattern-absent-in-diff.scope` is OPTIONAL here and the guard ships without
 * it. Under addendum 6 the guard's scope is GENRE property and the answer is
 * "every changed file of these extensions" — an absent scope is exactly that
 * (M1's `inScope` admits everything when no scope object is present). The POC
 * required it, and required it filled, which is how round 3's arm A came to
 * narrow the scan and call it stricter.
 * @type {Record<string, KindSpec>}
 */
export const KIND_CATALOGUE = Object.freeze({
  'command-exit': Object.freeze({
    required: Object.freeze(['cmd', 'args', 'expectExit']),
    optional: Object.freeze(['timeoutMs', 'env']),
    pathParams: Object.freeze([]),
    shape: 'cmd: string, args: string[], expectExit: integer, timeoutMs?: integer, env?: {NAME: value}',
    asserts: 'run cmd/args in the repository; the exit code must equal expectExit.',
  }),
  'count-not-worse': Object.freeze({
    required: Object.freeze(['cmd', 'args', 'parser', 'scope', 'direction', 'baseline']),
    optional: Object.freeze(['timeoutMs', 'env']),
    pathParams: Object.freeze(['scope.includePrefixes', 'scope.excludePrefixes']),
    shape: 'cmd: string, args: string[], '
      + 'parser: {terms: [{lineMatch: regex-string, capture?: integer, sign: 1 | -1, '
      + 'aggregate: "first" | "sum", region: "whole-output" | {anchor: regex-string, capture: integer}}]} '
      + '— or the short form {lineMatch: regex-string, capture?: integer}, '
      + 'scope: {includePrefixes?: string[], excludePrefixes?: string[]}, '
      + 'direction: "lower-is-better" | "higher-is-better", baseline: "seed" | 0, timeoutMs?: integer, env?: {NAME: value}',
    asserts: 'run cmd/args; read a NUMBER out of the output with parser, keep only what scope selects, and '
      + 'require that number to be not-worse than baseline in the stated direction. baseline "seed" is the same '
      + 'number taken from this run\'s own starting point, measured every run; baseline 0 is literally zero. '
      + 'You never write a number you measured yourself — you write the rule.',
  }),
  'pattern-absent-in-diff': Object.freeze({
    required: Object.freeze(['patterns', 'extensions']),
    optional: Object.freeze(['scope']),
    pathParams: Object.freeze(['scope.includePrefixes', 'scope.excludePrefixes']),
    shape: 'patterns: [{id: string, regex: regex-string}], extensions: string[], '
      + 'scope?: {includePrefixes?: string[], excludePrefixes?: string[]}',
    asserts: 'none of the patterns may appear in any line this run ADDED, across every file this run changed '
      + 'with one of the named extensions.',
  }),
  'files-changed': Object.freeze({
    required: Object.freeze(['allowPrefixes', 'requireNonEmpty']),
    optional: Object.freeze([]),
    pathParams: Object.freeze(['allowPrefixes']),
    shape: 'allowPrefixes: string[], requireNonEmpty: true',
    asserts: 'the set of files this run changed must be non-empty and must lie wholly inside allowPrefixes.',
  }),
  // LOCKED: named so declaring one is COUNTED DEMAND rather than an unknown-kind
  // typo (D13 forward-compat point 2). Disclosure is not admission — these do
  // not run in v1, and `close[]` on disk stays predicate-only and shape-enforced
  // (src/job.js:442), so the inexpressibility that is already free stays free.
  'judged-floor': Object.freeze({
    required: Object.freeze([]), optional: Object.freeze([]), pathParams: Object.freeze([]), locked: true,
    shape: 'LOCKED — not available in v1',
    asserts: 'a judged score must clear a floor. Declaring it is recorded as demand; it will not run.',
  }),
  'human-confirms': Object.freeze({
    required: Object.freeze([]), optional: Object.freeze([]), pathParams: Object.freeze([]), locked: true,
    shape: 'LOCKED — not available in v1',
    asserts: 'a person renders the verdict. Declaring it is recorded as demand; it will not run.',
  }),
});

export const CATALOGUE_KINDS = Object.freeze(Object.keys(KIND_CATALOGUE));
export const LOCKED_KINDS = Object.freeze(CATALOGUE_KINDS.filter((k) => KIND_CATALOGUE[k].locked));
/** the catalogue's live half — asserted EQUAL to the executor's own LIVE_KINDS
 * by the suite, both directions: a kind the catalogue offers and the executor
 * cannot run is a close that stops at runtime, and a kind the executor runs
 * that the catalogue never names is a capability nothing can reach. */
export const CATALOGUE_LIVE_KINDS = Object.freeze(CATALOGUE_KINDS.filter((k) => !KIND_CATALOGUE[k].locked));

export const DIRECTIONS = Object.freeze(['lower-is-better', 'higher-is-better']);
/** D12: the close stores the COUNTING RULE, never the number. "seed" is measured
 * at this run's own seed every run; 0 is literally zero. A frozen constant (the
 * hand-written closes' `SEED_ERRORS 63`) is exactly what this menu retires. */
export const BASELINES = Object.freeze(['seed', 0]);
/** a runaway stage list is a red, not a bill — the sibling of M1's MAX_TERMS */
export const MAX_STAGES = 12;

const NAME_RE = /^[a-z][a-z0-9-]{1,48}$/;

// ── 2. THE TYPES GENRE ───────────────────────────────────────────────────────

/**
 * THE FROZEN TYPES GENRE TEMPLATE — prereg addendum 3's six policy points,
 * VERBATIM. The suite reads the prereg and compares BYTES, so a paraphrase here
 * fails the build rather than quietly changing what every future close is
 * authored against. It deliberately carries no repo-specific command, path, env
 * value or regex: round 2 measured that stating the LAW still leaves the model
 * to find the VALUE, and that is the axis the build must keep live.
 */
export const TYPES_GENRE_TEMPLATE = `1. The graded instrument is the STRICT form of the language's type checker, regardless of what
   the repo's own scripts run. If the repo's script omits strictness, the close adds it.
2. Tools are invoked so their binaries actually resolve — through the project's own package
   runner or language module runner, never a bare binary name.
3. The stage skeleton, in first-red-wins order: changed-from-seed (guard) → typecheck (error
   count IN the target scope, baseline 0, lower-is-better) → typecheck-outside (error count
   OUTSIDE the target scope, baseline measured at seed, a ceiling — required whenever the job
   scopes to a subset of the tree; omitted only for whole-tree jobs) → tests-kept (a floor on
   tests that actually EXECUTED, baseline at seed, higher-is-better; a skipped or deselected
   test did not run and must not count) → suite-green (the suite exits clean AND reports zero
   failing tests — two assertions) → no-suppressions (guard).
4. One population per stage — two structurally different counts never share a stage.
5. The checker must judge the PATIENT's own tree: if imports could resolve to an installed or
   editable copy elsewhere, the environment is set so they resolve inside the patient.
6. A number the tool did not report is unknown, never zero.`;

export const GENRE_LANGUAGES = Object.freeze(['js', 'python']);

/**
 * THE GENRE, as data. The suppression batteries are the hand-written closes'
 * own `SUPPRESSIONS` tables (`scripts/u-pulselog-close.mjs:35`,
 * `scripts/u-spawner-close.mjs:34`) — operator-owned genre knowledge, minted by
 * paying for live runs. `unknown` is deliberately NOT a JS suppression and not
 * a Python one: it forces narrowing at the use site, which is real typing work.
 *
 * `env` is the addendum-6 residue expressed as data. Python's `MYPYPATH` is
 * load-bearing and was found by probe, never by reading: the aurora patient sets
 * `explicit_package_bases`, so without it a sibling import falls through to an
 * editable install pointing at a DIFFERENT checkout and a cross-module fix is
 * graded against unedited source. It moves no seed number, which is why no
 * seed-verdict read can ever catch its absence — the only place it can live is
 * here, in genre data, injected by the flow.
 */
export const TYPES_GENRE = Object.freeze({
  name: 'TYPES',
  template: TYPES_GENRE_TEMPLATE,
  languages: Object.freeze({
    js: Object.freeze({
      suppressions: Object.freeze([
        Object.freeze({ id: 'ts-ignore', regex: '@ts-ignore' }),
        Object.freeze({ id: 'ts-expect-error', regex: '@ts-expect-error' }),
        Object.freeze({ id: 'ts-nocheck', regex: '@ts-nocheck' }),
        Object.freeze({ id: 'eslint-disable', regex: 'eslint-disable' }),
        Object.freeze({ id: 'any', regex: '(?:[{<|(\\[:,]|\\bas)\\s*any\\b|\\bany\\[\\]' }),
        Object.freeze({ id: 'any-star', regex: '@\\w+\\s*\\{\\s*[*?]\\s*\\}' }),
        Object.freeze({ id: 'cast', regex: '@type\\s*\\{.*\\}\\s*\\*\\/\\s*\\(' }),
      ]),
      extensions: Object.freeze(['.js', '.mjs', '.cjs']),
      /** no import-resolution hazard on this runner — an EMPTY list, declared,
       * never an absent field that would read as "not looked into" (F59) */
      env: Object.freeze([]),
    }),
    python: Object.freeze({
      suppressions: Object.freeze([
        Object.freeze({ id: 'ignore', regex: '#\\s*type:\\s*ignore' }),
        Object.freeze({ id: 'any', regex: '\\bAny\\b' }),
        Object.freeze({ id: 'cast', regex: '\\bcast\\s*\\(' }),
        Object.freeze({ id: 'noqa', regex: '#\\s*noqa' }),
        Object.freeze({ id: 'mypy-disable', regex: '#\\s*mypy:\\s*disable' }),
      ]),
      extensions: Object.freeze(['.py']),
      env: Object.freeze([
        Object.freeze({
          name: 'MYPYPATH',
          from: 'sourcePrefixes',
          join: ':',
          why: 'mypy must name the PATIENT\'s modules: without it a sibling import resolves through an editable '
            + 'install to a different checkout, and a cross-module fix is graded against unedited source (Result 5, '
            + 'found by probe). It moves no seed number, so no seed-verdict read can see its absence.',
        }),
      ]),
    }),
  }),
});

/** @param {string} lang */
function language(lang) {
  const l = TYPES_GENRE.languages[/** @type {'js'|'python'} */ (lang)];
  // An unknown language THROWS rather than returning an empty battery: a genre
  // we have not admitted must not read as "this genre needs no guards" (F59's
  // shape — `{}` meaning "the scout did not complete", never "no facts needed").
  if (!l) throw new Error(`no TYPES genre data for language "${lang}" — one of ${GENRE_LANGUAGES.join(', ')}`);
  return l;
}

/**
 * The genre's mandatory guards, FULLY ENUMERATED (D13 forward-compat point 3:
 * an omittable-with-a-default field is the omitted-`tools` shape, where widening
 * changes what runs without changing what was signed — so the guards are stored
 * spelled out, and the hash is taken over the resolved form).
 *
 * `fill` names the ONLY slot the model supplies. `changed-from-seed`'s
 * allowPrefixes is the job's own target scope and cannot be genre knowledge;
 * everything else here — including `no-suppressions`' absent scope — is ours.
 *
 * Returns a fresh deep copy each call: a frozen constant handed to a caller that
 * edits it is one shared battery away from a silently weakened guard.
 * @param {string} lang
 * @returns {{name: string, kind: string, params: Record<string, any>, fill: string[]}[]}
 */
export function genreGuards(lang) {
  const l = language(lang);
  return [
    { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true }, fill: ['allowPrefixes'] },
    {
      name: 'no-suppressions',
      kind: 'pattern-absent-in-diff',
      // NO scope: the scan covers every changed file of these extensions. A
      // narrowing here is the round-3 arm A defect and is a red, not a taste.
      params: { patterns: l.suppressions.map((p) => ({ ...p })), extensions: [...l.extensions] },
      fill: [],
    },
  ];
}

/**
 * The genre's environment for this patient — ours to inject at execution (M3),
 * never model-authored. An entry with no value produces NO VARIABLE: an empty
 * `MYPYPATH` is not the same instruction as an unset one, and shipping `''`
 * would silently change how mypy resolves.
 * @param {string} lang
 * @param {{sourcePrefixes?: string[]}} [o]
 * @returns {Record<string, string>}
 */
export function genreEnv(lang, { sourcePrefixes = [] } = {}) {
  const l = language(lang);
  /** @type {Record<string, string>} */
  const env = {};
  for (const spec of l.env) {
    const parts = (spec.from === 'sourcePrefixes' ? sourcePrefixes : []).filter(isNonEmptyString);
    if (parts.length) env[spec.name] = parts.join(spec.join);
  }
  return env;
}

/** The names the genre OWNS — the validator refuses a declaration that authors
 * one of them, because ownership is only real if it is mechanical.
 * @param {string} lang @returns {string[]} */
export function genreOwnedEnvNames(lang) {
  return language(lang).env.map((/** @type {any} */ e) => e.name);
}

// ── 3. THE DECLARATION VALIDATOR ─────────────────────────────────────────────

/** one prefix spelling, the SHIPPED one — `globToPrefix`'s collapse order is
 * fence territory (F9) and is never re-spelled here. `''`, `'.'` and `'/'` all
 * mean the repository root. */
const normPrefix = (/** @type {string} */ p) => globToPrefix(String(p)).replace(/^\.\//, '');
const isRoot = (/** @type {string} */ p) => p === '' || p === '.' || p === '/';

/**
 * The seed listing, indexed once: the files that exist, and every directory
 * that contains one. A path SELECTS when it is one of them.
 * @param {string[]} listing
 */
function indexListing(listing) {
  const files = new Set(listing.map((f) => normPrefix(f)).filter((f) => f !== ''));
  /** @type {Set<string>} */
  const dirs = new Set();
  for (const f of files) {
    const segs = f.split('/');
    for (let i = 1; i < segs.length; i++) dirs.add(segs.slice(0, i).join('/'));
  }
  return { files, dirs };
}

/**
 * Is this a SCOPED job? Mechanically, from the declaration's own containment
 * guard against the REAL listing — never from the operator's reading of the
 * interview. A `files-changed` stage whose allowPrefixes leave any real file
 * uncovered names a proper subset of the repository, and the F84 split then
 * applies: two populations exist, so a count must say which one it counts.
 *
 * A whole-tree job is genuinely unscoped — there is nothing outside — and the
 * law must not red it (template rule 3 says the outside ceiling is omitted
 * exactly there).
 * @param {any} declaration @param {{files: Set<string>, dirs: Set<string>}} idx
 */
function scopeOfJob(declaration, idx) {
  const stages = Array.isArray(declaration?.stages) ? declaration.stages : [];
  for (const s of stages) {
    if (s?.kind !== 'files-changed') continue;
    const pre = s?.params?.allowPrefixes;
    if (!Array.isArray(pre) || pre.length === 0 || !pre.every(isNonEmptyString)) continue;
    const norm = pre.map(normPrefix);
    if (norm.some(isRoot)) return { scoped: false, via: null };
    const uncovered = [...idx.files].some((f) => !norm.some((p) => f === p || f.startsWith(`${p}/`)));
    if (uncovered) return { scoped: true, via: `${s.name}.allowPrefixes` };
  }
  return { scoped: false, via: null };
}

/** @param {any} v */
const strArray = (v) => Array.isArray(v) && v.length > 0 && v.every(isNonEmptyString);

/** read a dotted param path off a params object, or undefined @param {any} p @param {string} dotted */
function readPath(p, dotted) {
  let node = p;
  for (const seg of dotted.split('.')) {
    if (!isObj(node)) return undefined;
    node = node[seg];
  }
  return node;
}

/**
 * Validate an authored close DECLARATION. Never throws on model output — every
 * failure is a named red, in the shipped `{ok, reds, <parsed>}` shape, and the
 * parsed value is the RESOLVED declaration (every short-form parser expanded),
 * because that is the form the executor runs and the signature covers.
 *
 * `listing`, `guards` and `envOwned` are REQUIRED, and their absence is a red
 * rather than a skipped check — all three guard the SAME failure: a validator
 * that silently stops checking when handed nothing to check against reports a
 * clean declaration it never examined. v1 only admits a job with a runnable
 * patient and a git seed (D13), so the listing always exists, and D5's guards
 * exist by construction. `envOwned` is separated into absent-vs-empty for
 * F59's reason exactly: `[]` is a genre that owns no variables (JS), and
 * `undefined` is a caller that never asked — the two must not read alike.
 *
 * The CATALOGUE is ours, not model input: a malformed one is a bareloop bug and
 * is allowed to throw, because failing loudly beats a validator that quietly
 * stops enforcing a rule it was configured out of.
 *
 * `deferListing: true` is the ONE way to run without a listing, and it must be
 * spelled literally. It exists for exactly one caller — the job-spec validator,
 * which judges a signed `closeDecl` with no repository in hand — and it does NOT
 * make the listing optional: it moves that half of the gate to the runner, which
 * re-validates GROUNDED against the real seed before any stage runs. Two checks
 * ride on the listing and both are named here rather than discovered later: the
 * path rule (a path SELECTS or it does not exist), and the SCOPED-job derivation
 * that arms the F84 one-population law. With the listing deferred, neither
 * fires, and `grounded: false` on the result is how a caller knows.
 *
 * @param {any} declaration the parsed model output
 * @param {{catalogue?: Record<string, KindSpec>, listing?: string[]|null,
 *   guards?: {name: string, kind: string, params: Record<string, any>, fill: string[]}[]|null,
 *   envOwned?: string[]|null, deferListing?: boolean}} [opts]
 *   `listing` — repo-relative paths at the seed (`git ls-tree -r --name-only`).
 *   `guards` — the genre's injected guards (`genreGuards`).
 *   `envOwned` — env names the genre injects (`genreOwnedEnvNames`), `[]` when it owns none.
 *   `deferListing` — literally `true` to run the tree-independent half only.
 * @returns {{ok: boolean, reds: Red[], declaration: any, grounded: boolean,
 *   scoped: {scoped: boolean, via: string|null}}}
 */
export function validateDeclaration(declaration, opts = {}) {
  const { catalogue = KIND_CATALOGUE, listing = null, guards = null, envOwned = null } = opts;
  const deferListing = opts.deferListing === true;
  /** @type {Red[]} */
  const reds = [];
  /** @type {(code: string, path: string, detail: string, extra?: object) => void} */
  const red = (code, path, detail, extra = {}) => { reds.push({ code, path, detail, ...extra }); };

  const lockedKinds = Object.keys(catalogue).filter((k) => catalogue[k].locked);
  const kindNames = Object.keys(catalogue).join(' | ');

  const haveListing = Array.isArray(listing) && listing.length > 0 && listing.every(isNonEmptyString);
  if (!haveListing && !deferListing) {
    red('listing-absent', 'listing', 'a non-empty seed file listing (git ls-tree -r --name-only <seed>) — '
      + 'without it nothing can tell a real path from an invented one, and a validator that skips that check '
      + 'reports a declaration it never examined');
  }
  if (haveListing && deferListing) {
    red('listing-conflict', 'listing', 'deferListing was declared AND a listing was supplied — a caller that both '
      + 'defers the tree-grounded half and hands over a tree does not know which gate it is running');
  }
  const idx = indexListing(haveListing ? /** @type {string[]} */ (listing) : []);

  const haveGuards = Array.isArray(guards) && guards.length > 0;
  if (!haveGuards) {
    red('guards-absent', 'guards', 'the genre\'s mandatory guards (genreGuards) — D5 is the load-bearing decision '
      + 'of this design and it cannot be validated away by handing the validator nothing to check against');
  }

  // absent is not empty: `[]` is a genre that owns no environment (JS), and a
  // caller that never asked is a caller whose declarations are unchecked on the
  // axis round 2's arm B failed (F59's distinction, in the shape it bites here)
  const owned = Array.isArray(envOwned) ? envOwned : null;
  if (owned === null) {
    red('env-ownership-absent', 'envOwned', 'the env names this genre injects (genreOwnedEnvNames) — pass [] for a '
      + 'genre that owns none; omitting it leaves a model-authored MYPYPATH-class variable unexamined');
  }

  if (!isObj(declaration)) {
    red('invalid-value', '', 'the declaration is an object carrying an ordered stages array');
    return { ok: false, reds, declaration: null, grounded: haveListing, scoped: { scoped: false, via: null } };
  }
  const stages = declaration.stages;
  if (!Array.isArray(stages) || stages.length === 0) {
    red('missing-field', 'stages', 'a non-empty ORDERED array of stages — they run in the order you declare them');
    return { ok: false, reds, declaration: null, grounded: haveListing, scoped: { scoped: false, via: null } };
  }
  if (stages.length > MAX_STAGES) {
    red('invalid-value', 'stages', `${stages.length} stages exceeds the ceiling of ${MAX_STAGES}`);
  }

  const scoped = scopeOfJob(declaration, idx);
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Map<string, string>} population key → the stage that already owns it */
  const populations = new Map();

  stages.forEach((/** @type {any} */ s, i) => {
    const at = `stages[${i}]`;
    if (!isObj(s)) { red('invalid-value', at, 'a stage is an object {name, kind, params}'); return; }

    if (!isNonEmptyString(s.name)) red('missing-field', `${at}.name`, 'a non-empty stage name');
    else if (!NAME_RE.test(s.name)) red('invalid-value', `${at}.name`, `"${s.name}" is not a lowercase-hyphenated slug`);
    else if (seen.has(s.name)) {
      red('duplicate-name', `${at}.name`, `stage name "${s.name}" is declared twice — two stages under one name are `
        + 'one trend series over two populations (F84)');
    } else seen.add(s.name);
    const label = isNonEmptyString(s.name) ? s.name : at;

    if (!isNonEmptyString(s.kind)) { red('missing-field', `${at}.kind`, `a kind: ${kindNames}`); return; }
    if (lockedKinds.includes(s.kind)) {
      // A DISTINCT red carrying counted demand. `verb`/`lib` are the structured
      // fields the ledger keys admission on, never prose, and `lib` is stamped
      // HERE at the emit site (the typed-lib rule): a locked KIND is demand
      // against bareloop's own catalogue, and filing it against a bare-suite
      // package is the BA-2 misattribution that rule exists to prevent.
      red('locked-kind', `${at}.kind`, `"${s.kind}" is a named but LOCKED kind — declaring it is recorded demand, `
        + 'never an admission; it does not run in v1', { kind: s.kind, verb: s.kind, lib: 'bareloop', stage: label });
      return;
    }
    const spec = catalogue[s.kind];
    if (!spec) {
      red('unknown-kind', `${at}.kind`, `"${s.kind}" is not in the catalogue — kinds: ${kindNames}`, { kind: s.kind });
      return;
    }

    const p = s.params;
    if (!isObj(p)) { red('missing-field', `${at}.params`, `an object carrying: ${spec.required.join(', ')}`); return; }
    for (const k of spec.required) {
      if (!Object.hasOwn(p, k) || p[k] === null || p[k] === undefined) {
        red('missing-field', `${at}.params.${k}`, `${s.kind} requires ${k} (${spec.shape})`);
      }
    }
    for (const k of Object.keys(p)) {
      if (!spec.required.includes(k) && !spec.optional.includes(k)) {
        red('invalid-value', `${at}.params.${k}`, `"${k}" is not a parameter of ${s.kind} — the catalogue is the `
          + 'only source of parameter names');
      }
    }

    checkKind({ kind: s.kind, params: p, at, red, scoped, label, populations, envOwned: owned ?? [] });
    checkPaths({ spec, params: p, at, red, idx, haveListing });
  });

  if (haveGuards) checkGuards({ declaration, guards: /** @type {any[]} */ (guards), red });

  const ok = reds.length === 0;
  return { ok, reds, declaration: ok ? normalizeDeclaration(declaration) : null, grounded: haveListing, scoped };
}

/**
 * The per-kind parameter checks, plus the two halves of the one-population law.
 * @param {{kind: string, params: any, at: string, red: (c: string, p: string, d: string, e?: object) => void,
 *   scoped: {scoped: boolean, via: string|null}, label: string, populations: Map<string, string>, envOwned: string[]}} o
 */
function checkKind({ kind, params: p, at, red, scoped, label, populations, envOwned }) {
  /** F49 — the static nested-quantifier reject, at the gate, before the pattern
   * ever runs. MEASURED: `(a+)+$` did not finish on a 33-char body in 120s, so
   * input-bounding is theatre and a static reject is not. The detector itself is
   * never touched from here (monotonic-only doctrine). */
  const regex = (/** @type {any} */ v, /** @type {string} */ path) => {
    if (!isNonEmptyString(v)) { red('invalid-value', path, 'a regular expression, as a string'); return; }
    if (hasNestedQuantifier(v)) {
      red('invalid-value', path, `/${v}/ carries a nested quantifier — rejected statically (F49); rewrite it without one`);
      return;
    }
    try { new RegExp(v); } catch (e) {
      red('invalid-value', path, `/${v}/ is not a valid regular expression: ${String(/** @type {any} */ (e)?.message ?? e)}`);
    }
  };
  const command = () => {
    if (!isNonEmptyString(p.cmd)) red('invalid-value', `${at}.params.cmd`, 'a non-empty executable name');
    if (Object.hasOwn(p, 'args') && !(Array.isArray(p.args) && p.args.every((/** @type {any} */ x) => typeof x === 'string'))) {
      red('invalid-value', `${at}.params.args`, 'an array of strings (may be empty)');
    }
    if (Object.hasOwn(p, 'timeoutMs') && !(Number.isInteger(p.timeoutMs) && p.timeoutMs > 0)) {
      red('invalid-value', `${at}.params.timeoutMs`, 'a positive integer');
    }
    if (Object.hasOwn(p, 'env')) {
      if (!(isObj(p.env) && Object.values(p.env).every((v) => typeof v === 'string'))) {
        red('invalid-value', `${at}.params.env`, 'an object of string values');
      } else {
        for (const name of Object.keys(p.env)) {
          if (envOwned.includes(name)) {
            // The two POC residues are OURS to inject. Round 2's arm B authored
            // MYPYPATH itself and authored it WRONG; the flow sets it from genre
            // data, so a model-authored copy is either redundant or a conflict.
            red('genre-owned-env', `${at}.params.env.${name}`, `${name} is set by the genre, not by the declaration — `
              + 'this is a fact the interview cannot supply and the repository does not state', { name });
          }
        }
      }
    }
  };
  /** the one-population law's first half (F84): a count over a scoped job must
   * say WHICH population it counts, or an in-scope 29 and an outside 4 land in
   * one trend series and a run that swapped walls reads as converging. */
  const populationNamed = (/** @type {string} */ path) => {
    const sc = p.scope;
    if (!isObj(sc)) { red('missing-field', path, 'a scope object naming this stage\'s population'); return; }
    const inc = Object.hasOwn(sc, 'includePrefixes') ? sc.includePrefixes : null;
    const exc = Object.hasOwn(sc, 'excludePrefixes') ? sc.excludePrefixes : null;
    if (inc !== null && !strArray(inc)) red('invalid-value', `${path}.includePrefixes`, 'a non-empty array of path prefixes');
    if (exc !== null && !strArray(exc)) red('invalid-value', `${path}.excludePrefixes`, 'a non-empty array of path prefixes');
    for (const k of Object.keys(sc)) {
      if (k !== 'includePrefixes' && k !== 'excludePrefixes') red('invalid-value', `${path}.${k}`, 'a scope takes includePrefixes and excludePrefixes only');
    }
    if (inc === null && exc === null && scoped.scoped) {
      red('one-population', path, `stage "${label}" counts over a scoped job (${scoped.via}) with no include/exclude `
        + 'filter — that mixes the job\'s own population with everything else under one stage name, and the two land '
        + 'in one trend series (F84)', { rule: 'unnamed-population', stage: label });
    }
  };

  switch (kind) {
    case 'command-exit':
      command();
      if (!Number.isInteger(p.expectExit)) red('invalid-value', `${at}.params.expectExit`, 'an integer exit code');
      break;
    case 'count-not-worse': {
      command();
      // ONE normalisation, the EXECUTOR's own (src/kinds.js). Short form and long
      // form both land here, so the validator and the grader can never disagree
      // about what a parser means.
      const norm = normalizeParser(p.parser, `${at}.params.parser`);
      for (const r of norm.reds) red(r.code, r.path, r.detail);
      for (const t of norm.terms ?? []) {
        regex(t.lineMatch, `${at}.params.parser (lineMatch /${t.lineMatch}/)`);
        // a region anchor runs over the whole output, so it is exactly as
        // exposed to F49 as lineMatch is
        if (isObj(t.region)) regex(t.region.anchor, `${at}.params.parser (region anchor /${t.region.anchor}/)`);
      }
      if (!DIRECTIONS.includes(p.direction)) red('invalid-value', `${at}.params.direction`, `one of ${DIRECTIONS.join(' | ')}`);
      if (!BASELINES.includes(p.baseline)) {
        red('invalid-value', `${at}.params.baseline`, `one of ${BASELINES.map((b) => JSON.stringify(b)).join(' | ')} — `
          + 'the close stores the counting rule, never a number you measured (D12)');
      }
      populationNamed(`${at}.params.scope`);
      // the law's second half: the SAME command, parser and scope declared twice
      // is one population measured twice, wearing two stage names
      if (norm.ok) {
        const key = JSON.stringify([p.cmd, p.args ?? [], norm.terms, canonicalScope(p.scope)]);
        const owner = populations.get(key);
        if (owner !== undefined) {
          red('one-population', `${at}.params`, `stage "${label}" measures the same population as "${owner}" — same `
            + 'command, same parser, same scope. One population is one stage (F84); two names over one number are two '
            + 'trend series that can never disagree', { rule: 'duplicate-population', stage: label, twin: owner });
        } else populations.set(key, label);
      }
      break;
    }
    case 'pattern-absent-in-diff':
      if (!Array.isArray(p.patterns) || p.patterns.length === 0) {
        red('invalid-value', `${at}.params.patterns`, 'a non-empty array of {id, regex}');
      } else {
        p.patterns.forEach((/** @type {any} */ q, /** @type {number} */ j) => {
          if (!isObj(q)) { red('invalid-value', `${at}.params.patterns[${j}]`, '{id, regex}'); return; }
          if (!isNonEmptyString(q.id)) red('invalid-value', `${at}.params.patterns[${j}].id`, 'a non-empty id');
          regex(q.regex, `${at}.params.patterns[${j}].regex`);
        });
      }
      if (!strArray(p.extensions)) red('invalid-value', `${at}.params.extensions`, 'a non-empty array of file extensions');
      // scope is OPTIONAL here and absent on the genre guard: the scan covers
      // every changed file of these extensions. When a declaration does carry
      // one it is still shape-checked — but a missing scope is not a red.
      if (Object.hasOwn(p, 'scope')) populationNamed(`${at}.params.scope`);
      break;
    case 'files-changed':
      if (!strArray(p.allowPrefixes)) red('invalid-value', `${at}.params.allowPrefixes`, 'a non-empty array of path prefixes');
      if (p.requireNonEmpty !== true) red('invalid-value', `${at}.params.requireNonEmpty`, 'literally true');
      break;
    default:
      red('unknown-kind', `${at}.kind`, `"${kind}" is in the catalogue but has no checker`, { kind });
  }
}

/** the scope as a comparable value — key order must not decide whether two
 * stages count the same population @param {any} sc */
function canonicalScope(sc) {
  if (!isObj(sc)) return null;
  const norm = (/** @type {any} */ v) => (Array.isArray(v) ? [...v].map(normPrefix).sort() : null);
  return { include: norm(sc.includePrefixes), exclude: norm(sc.excludePrefixes) };
}

/**
 * HAMR'S LISTING RULE: every path-like param must SELECT from the seed listing.
 * A path matching nothing is a distinct red, never a judgment call — round 2's
 * arm A derived `src/alertEmail.js` from the user's prose and reclassified 15
 * real errors into the wrong population, and no amount of reading the
 * declaration would have caught it.
 *
 * A trailing-slash (or `/**`) spelling ASSERTS a directory, so it must name one;
 * a bare path may name either. The repository root, however spelled, always
 * selects — it names the whole tree, which exists.
 * @param {{spec: KindSpec, params: any, at: string,
 *   red: (c: string, p: string, d: string, e?: object) => void,
 *   idx: {files: Set<string>, dirs: Set<string>}, haveListing: boolean}} o
 */
function checkPaths({ spec, params: p, at, red, idx, haveListing }) {
  if (!haveListing) return; // already redded once, at the top; not twice per path
  for (const dotted of spec.pathParams) {
    const value = readPath(p, dotted);
    if (!Array.isArray(value)) continue; // shape is the schema walk's business
    value.forEach((raw, i) => {
      if (!isNonEmptyString(raw)) return;
      const wantsDir = /(?:\/|\/\*\*?)$/.test(raw.trim());
      const norm = normPrefix(raw);
      if (isRoot(norm)) return;
      const path = `${at}.params.${dotted}[${i}]`;
      const isFile = idx.files.has(norm);
      const isDir = idx.dirs.has(norm);
      if (isDir) return;
      if (isFile && wantsDir) {
        red('path-not-in-listing', path, `"${raw}" is spelled as a directory but the seed tree says ${norm} is a file`,
          { declared: raw, resolved: norm, found: 'file', wanted: 'directory' });
        return;
      }
      if (isFile) return;
      red('path-not-in-listing', path, `"${raw}" matches nothing in the seed tree${nearby(norm, idx)} — a path is `
        + 'read off the repository, never derived from what a file sounds like it should be called',
        { declared: raw, resolved: norm, found: null, wanted: wantsDir ? 'directory' : 'any' });
    });
  }
}

/** the mechanical half of the gap: what DOES exist beside the invented path.
 * Named items, counts, capped — never a paragraph (F38/F39).
 * @param {string} norm @param {{files: Set<string>, dirs: Set<string>}} idx */
function nearby(norm, idx) {
  const parent = norm.includes('/') ? norm.slice(0, norm.lastIndexOf('/')) : '';
  const under = [...idx.files, ...idx.dirs]
    .filter((f) => (parent === '' ? !f.includes('/') : f.startsWith(`${parent}/`) && !f.slice(parent.length + 1).includes('/')))
    .sort();
  if (under.length === 0) return '';
  const shown = under.slice(0, 8);
  const tail = under.length > shown.length ? `, and ${under.length - shown.length} more` : '';
  return ` (under ${parent === '' ? 'the repository root' : parent} the seed tree has: ${shown.join(', ')}${tail})`;
}

/**
 * THE D5 LINE. Every injected guard must be PRESENT, of the right kind, and
 * byte-equal to the genre's own parameters. Only the guard's declared `fill`
 * slots are the model's, and a parameter the guard does not carry at all is a
 * NARROWING — which is how round 3's arm A scoped the suppression scan to two
 * files and made a weaker guard look stricter.
 * @param {{declaration: any, guards: any[], red: (c: string, p: string, d: string, e?: object) => void}} o
 */
function checkGuards({ declaration, guards, red }) {
  const stages = Array.isArray(declaration?.stages) ? declaration.stages : [];
  for (const g of guards) {
    const i = stages.findIndex((/** @type {any} */ s) => isObj(s) && s.name === g.name);
    if (i === -1) {
      red('guard-missing', 'stages', `the genre's "${g.name}" guard is not in the declaration — mandatory guards are `
        + 'shown to the user and cannot be removed (D5)', { guard: g.name, kind: g.kind });
      continue;
    }
    const s = stages[i];
    const at = `stages[${i}]`;
    if (s.kind !== g.kind) {
      red('guard-weakened', `${at}.kind`, `the "${g.name}" guard is a ${g.kind}; this declares ${String(s.kind)}`,
        { guard: g.name, param: 'kind' });
      continue;
    }
    const params = isObj(s.params) ? s.params : {};
    for (const [k, want] of Object.entries(g.params)) {
      if (!deepEqual(params[k], want)) {
        red('guard-weakened', `${at}.params.${k}`, `the "${g.name}" guard's ${k} is genre property and is fixed: `
          + `expected ${JSON.stringify(want)}`, { guard: g.name, param: k, expected: want, declared: params[k] });
      }
    }
    for (const k of Object.keys(params)) {
      if (Object.hasOwn(g.params, k) || g.fill.includes(k)) continue;
      red('guard-weakened', `${at}.params.${k}`, `the "${g.name}" guard does not take ${k} — adding one narrows what `
        + 'the guard covers, and a guard that covers less is not a stricter guard', { guard: g.name, param: k, declared: params[k] });
    }
  }
}

/** structural equality over plain JSON data (the shapes a declaration carries)
 * @param {any} a @param {any} b */
function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * The declaration the EXECUTOR sees and the SIGNATURE covers: every
 * `count-not-worse` parser resolved to `{terms: [...]}`, so the short form stops
 * existing at this boundary and there is exactly one shape downstream (D13
 * forward-compat point 3 — the hash is taken over the RESOLVED form, or an
 * omittable-with-a-default field changes what runs without changing what was
 * signed).
 *
 * A parser that would not normalise is left VERBATIM: it already carries a red,
 * and rewriting it would hide what the model actually wrote.
 * @param {any} declaration
 */
export function normalizeDeclaration(declaration) {
  if (!isObj(declaration) || !Array.isArray(declaration.stages)) return declaration;
  const out = structuredClone(declaration);
  for (const s of out.stages) {
    if (!isObj(s) || s.kind !== 'count-not-worse' || !isObj(s.params)) continue;
    const n = normalizeParser(s.params.parser, 'parser');
    if (n.ok) s.params.parser = { terms: n.terms };
  }
  return out;
}
