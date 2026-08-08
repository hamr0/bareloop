// THE RUNTIME BRIDGE — close-authoring v1, module M4a (design record
// 2026-08-07 D8/D9/D12/D13; gate-2 POC closed 2026-08-08).
//
// M1 runs a DECLARATION. The arbiter's shell (`src/ralph.js`) runs an ARGV. This
// module is the one place those two shapes meet, and it exists because of the
// integration decision M4 had to make in the open:
//
//   A declared close is carried by a NEW spec field (`closeDecl`) and executed by
//   M1's own kind executor. It is never COMPILED DOWN to command stages.
//
// The rejected alternative is the one that looks cheaper: render each declared
// stage as a shell one-liner and let the existing `close[]` path run it. That
// would turn owned kinds back into authored shell strings — the exact thing D3
// makes inexpressible ("the danger is in the ACTIONS, not the SYNTAX"), and the
// exact thing the whole rung exists to remove. A declaration whose meaning is a
// generated `sh -c` is a script with extra steps, and the arbiter would be
// judging text nobody validated. So: two executors, one CONTRACT, and the
// contract is what this file holds still.
//
// WHAT "one contract" MEANS, concretely — every one of these is a behaviour the
// command path already had and the declared path must not lose:
//
//   * FIRST RED WINS, and the deciding stage NAMES itself. A stage after the
//     first red never runs, so a later green cannot mask an earlier failure.
//   * THE FORBIDDEN ZONE (`CLOSE_FAULTS`). A stage that rendered no judgment is
//     NOT a verdict: it routes by its own typed fault (`STOP_FAULTS`, stamped in
//     M1 at the site that observed it) into the arbiter's four rows, so a
//     timeout still offers "raise the close timeout" and a spawn failure still
//     offers "fix the close". Pooling them would erase exactly the decision
//     information the escalation carries.
//   * THE GAP HEADER. `close stage "<name>" failed:` — the SAME spelling, from
//     `stageGap` in ralph.js, because `src/trend.js` parses it to bucket a grade
//     per stage. A second spelling here is the two-transforms class (F9) on the
//     instrument that decides whether a human tops a run up.
//   * THE GAP OUTPUT CONTRACT: every line prefixed, trims announced (M1 owns
//     that), and the whole thing SCRUBBED at this boundary through the one
//     `SECRET_PATTERNS` inventory — M1 deliberately does not scrub, the caller
//     does, and this is the caller.
//   * THE CHECK MENU derives from stage NAMES exactly as before (`checkMenu` in
//     src/job.js reads `name`/`offer`/`needs` and nothing else), so
//     `check-passes(name)` reaches a declared stage with no change at all.
//
// TWO THINGS THIS BRIDGE ADDS, both because the declared executor knows more
// than an exit code does:
//
//   1. `gapKeep`. Every declared gap line carries a fixed PREFIX, so the anchored
//      pattern derived from it designates the stage's own failures — which is
//      what Layer R's red-set reads off `stagedClose.find(...).gapKeep`. It is
//      ours, derived mechanically from one constant, and never model-authored:
//      the declaration has no field for it.
//   2. A TREND VALUE. `count-not-worse` reports a real number, so the grade does
//      not have to be scraped back out of prose. It is donated ONLY for
//      `lower-is-better`, and the omission is the load-bearing half: trend.js
//      reads "improved" as `value < best`, so donating a higher-is-better floor
//      would read a DROPPING test count as convergence and recommend a top-up on
//      a dying run. That is the dangerous direction; a null is the honest one
//      (F6), and the stage position still travels.
//
// THE SEED (D8). HEAD at run start, READ and recorded, never typed and never
// stored in the signed spec — D12: the close stores the counting rule, never the
// number, so a baseline frozen at signing would judge run 5 against run 1's tree.
//
// SEED WORKTREES are scoped to ONE `runDeclaredStages` call unless a caller
// hands in a shared holder. Cost, measured against safety and stated rather than
// assumed: at most one checkout per close invocation (M1 shares it across that
// close's stages), and none at all while the tree is verifiably at seed —
// precheck and preflight therefore pay nothing. A run-scoped holder would pay
// once instead of once-per-invocation, but `runPlan` has a dozen return paths and
// a leaked worktree outlives the process that made it.

import { runStage, makeSeedTrees, STOP_FAULTS, EXIT_RED } from './kinds.js';
import {
  validateDeclaration, genreGuards, genreOwnedEnvNames, GENRE_LANGUAGES, TYPES_GENRE,
} from './authoring.js';
import { stageGap } from './ralph.js';
import { isObj, isNonEmptyString } from './validate.js';

/** @typedef {{code: string, path: string, detail: string, [k: string]: any}} Red */

/** The genres a `closeDecl` may name. v1 admits exactly one (D13) — a genre
 * classifier is designed the day there is a second genre to classify. */
export const DECLARED_GENRES = Object.freeze([TYPES_GENRE.name]);
/** the exact field set of a `closeDecl` — anything else is a smuggle channel,
 * the same rule `STAGE_FIELDS` enforces on a command stage */
export const CLOSE_DECL_FIELDS = Object.freeze(['genre', 'lang', 'stages', 'notes']);

/**
 * The prefix M1 puts on EVERY gap line of a declared stage (its `ctx.gapKeep`).
 * A literal, so the anchored pattern below is exact.
 */
export const DECLARED_GAP_PREFIX = 'close: ';
/** The `gapKeep` PATTERN for a declared stage, DERIVED from the prefix so the
 * two can never drift. Layer R's red-set and `boundGap`'s keep-block both read
 * it; because every declared line carries the prefix, it designates the stage's
 * whole judged output rather than a hand-picked slice of it. */
export const DECLARED_GAP_KEEP = `^${DECLARED_GAP_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;

/** The verdict class a DECLARED close may claim. Hard, and by CONSTRUCTION
 * rather than by assertion: every live kind is a mechanical command whose
 * measurement is the truth, and the two judgment kinds are locked out at the
 * catalogue (M2) and absent from the executor (M1). Named as data so the job
 * validator reads one hierarchy table rather than hard-coding a class. */
export const DECLARED_CLOSE_CLASSES = Object.freeze(['hard']);

/** @param {any} job @returns {boolean} */
export function isDeclaredClose(job) {
  return isObj(job) && isObj(job.closeDecl) && Array.isArray(job.closeDecl.stages);
}

/**
 * The declaration's stages as the RUNNER's stage descriptors: the declared
 * `{name, kind, params}` plus the arbiter's own `gapKeep`.
 *
 * `offer` and `needs` pass through untouched when a declaration carries them
 * (v1's schema does not let one), so `checkMenu`'s derivation is unchanged.
 * @param {any} closeDecl
 * @returns {any[]|null} null when this is not a declaration
 */
export function declaredStages(closeDecl) {
  if (!isObj(closeDecl) || !Array.isArray(closeDecl.stages)) return null;
  return closeDecl.stages.map((s) => (isObj(s) ? { ...s, gapKeep: DECLARED_GAP_KEEP } : s));
}

// ── the spec-level gate ──────────────────────────────────────────────────────

/**
 * Validate a `closeDecl` as a JOB SPEC field: the envelope (genre, language,
 * notes) plus M2's full declaration validator underneath it.
 *
 * `listing` is what splits the two callers, and the split is deliberate:
 *   - the JOB VALIDATOR has no repository, so it passes nothing and gets
 *     `grounded: false` — every tree-independent rule runs, the path rule and
 *     the scoped-job derivation do not;
 *   - the RUNNER has the real seed, so it passes the real listing and gets
 *     `grounded: true`. It runs this BEFORE any stage and before any token, so
 *     the deferred half is proved rather than skipped.
 * A caller that passes neither a listing nor `deferListing` gets M2's
 * `listing-absent` red, unchanged: a validator handed nothing to check against
 * must refuse, never report a declaration it never examined.
 *
 * @param {any} closeDecl
 * @param {{at?: string, listing?: string[]|null, deferListing?: boolean,
 *   catalogue?: Record<string, any>}} [opts]
 * @returns {{ok: boolean, reds: Red[], closeDecl: any, grounded: boolean,
 *   scoped: {scoped: boolean, via: string|null}}}
 */
export function validateCloseDecl(closeDecl, opts = {}) {
  const { at = 'closeDecl', listing = null, catalogue } = opts;
  const deferListing = opts.deferListing === true;
  /** @type {Red[]} */
  const reds = [];
  /** @type {(code: string, path: string, detail: string, extra?: object) => void} */
  const red = (code, path, detail, extra = {}) => { reds.push({ code, path, detail, ...extra }); };
  const bail = () => ({ ok: false, reds, closeDecl: null, grounded: false, scoped: { scoped: false, via: null } });

  if (!isObj(closeDecl)) {
    red('invalid-value', at, 'an authored close DECLARATION: { genre, lang, stages: [...] }');
    return bail();
  }
  for (const key of Object.keys(closeDecl)) {
    if (!CLOSE_DECL_FIELDS.includes(key)) {
      red('unknown-field', `${at}.${key}`, `not a closeDecl field (script bodies, seed refs and frozen thresholds all `
        + `land here); fields: ${CLOSE_DECL_FIELDS.join(', ')}`);
    }
  }
  if (!DECLARED_GENRES.includes(closeDecl.genre)) {
    red('invalid-value', `${at}.genre`, `menu: ${DECLARED_GENRES.join('|')} — v1 admits exactly one genre (D13), and a `
      + 'genre with no guard battery must refuse rather than author a close without the guards it cannot supply');
  }
  const langOk = GENRE_LANGUAGES.includes(closeDecl.lang);
  if (!langOk) {
    red('invalid-value', `${at}.lang`, `menu: ${GENRE_LANGUAGES.join('|')} — the language selects the genre's guard `
      + 'battery and its environment, both of which are ours and neither of which has a default');
  }
  if (closeDecl.notes !== undefined
      && !(Array.isArray(closeDecl.notes) && closeDecl.notes.every(isNonEmptyString))) {
    red('invalid-value', `${at}.notes`, 'an array of non-empty strings — what the author could not express, kept with '
      + 'the artefact it is about');
  }
  // Without a language there is no guard battery and no owned-env list, so M2
  // would be handed nothing to check D5 against — and a validator configured out
  // of its own rule reports a declaration it never examined. Refuse here instead.
  if (!langOk) return bail();

  const v = validateDeclaration(closeDecl, {
    ...(catalogue ? { catalogue } : {}),
    // BOTH are forwarded, always. Forwarding only one would hide the case M2
    // reds as `listing-conflict` — a caller that defers the tree-grounded half
    // AND hands over a tree does not know which gate it is running, and silently
    // honouring one of the two is how a signature ends up covering a check
    // nobody performed.
    listing,
    ...(deferListing ? { deferListing: true } : {}),
    guards: genreGuards(closeDecl.lang),
    envOwned: genreOwnedEnvNames(closeDecl.lang),
  });
  for (const r of v.reds) reds.push({ ...r, path: r.path ? `${at}.${r.path}` : at });

  const ok = reds.length === 0;
  return {
    ok,
    reds,
    closeDecl: ok ? { ...closeDecl, stages: v.declaration.stages } : null,
    grounded: v.grounded,
    scoped: v.scoped,
  };
}

// ── the execution bridge ─────────────────────────────────────────────────────

/**
 * The genre's mandatory guard NAMES for a declaration — which stages are D5's
 * guards and which are the job's own work. The seed-verdict read (D9.3) needs
 * exactly this split: `changed-from-seed` is RED at its own seed by
 * construction, so counting it as work would let a close with nothing to do
 * pass the "something must be red at seed" gate.
 * @param {any} closeDecl @returns {string[]}
 */
export function guardNames(closeDecl) {
  if (!isObj(closeDecl) || !GENRE_LANGUAGES.includes(closeDecl.lang)) return [];
  return genreGuards(closeDecl.lang).map((g) => g.name);
}

/**
 * One declared stage's result, in the ARBITER's verdict vocabulary.
 * @param {any} r an M1 `StageResult`
 * @param {(s: string) => string} redact
 */
function translate(r, redact) {
  const gapText = redact((r.gapLines ?? []).join('\n'));
  if (r.verdict === 'green') return { verdict: 'satisfied', judgedCount: 1 };
  if (r.verdict === 'red') {
    return {
      verdict: 'needs_revision',
      // Never falsy: every consumer guards with `if (gap)`, and an empty red
      // would silently kill gap feedback, the after-red hooks and the stall
      // detector at once (the same rule `runClose` states for its own path).
      gap: gapText || `(stage "${r.stage}" rendered a red with no output)`,
      exitCode: r.exitCode ?? EXIT_RED,
      judgedCount: 1,
    };
  }
  // instrument-stop — NOT a verdict. The fault is a typed field stamped where the
  // fault was observed, never sniffed out of the stop's prose.
  return {
    verdict: r.detail?.fault ?? STOP_FAULTS.FAILED,
    detail: redact(String(r.detail?.stop ?? `stage "${r.stage}" rendered no judgment`)),
  };
}

/**
 * Run a DECLARED close (or a check's chain out of one) and return `runClose`'s
 * verdict shape, so every consumer downstream — the precheck, ralph's judge, the
 * `CLOSE_FAULTS` routing, the trend reader, Layer R — is unchanged.
 *
 * The extras a declared close can honestly add ride alongside rather than
 * replacing anything: `declared: true` marks the shape, `value`/`baseline` carry
 * the deciding stage's own measurement, and `trendValue` is the ONE number the
 * trend reader may compare (see the header for why a higher-is-better stage
 * donates none).
 *
 * @param {any[]} stages declared stage descriptors, already validated
 * @param {(s: string) => string} [redact] the scrub, applied at THIS boundary
 * @param {{timeoutMs?: number, cwd?: string, seedRef?: string,
 *   seedTrees?: any, gapCap?: number, maxBuffer?: number, baselineMode?: 'auto'|'worktree'}} [opts]
 * @returns {Promise<any>}
 */
export async function runDeclaredStages(stages, redact = (s) => s, opts = {}) {
  const { timeoutMs, cwd, seedRef, seedTrees: shared, gapCap, maxBuffer, baselineMode } = opts;
  if (!isNonEmptyString(cwd) || !isNonEmptyString(seedRef)) {
    // Refuse rather than guess. A declared close measures against a SEED; a
    // missing one is the close unable to run, not a red about the worker.
    return {
      verdict: STOP_FAULTS.FAILED,
      detail: 'a declared close needs both the repository it judges (cwd) and the seed it measures against (seedRef) — '
        + 'neither has a default, because a defaulted baseline grades a tree nobody chose',
      stage: null,
      stages: [],
      declared: true,
    };
  }
  const owned = !shared;
  const seedTrees = shared ?? makeSeedTrees();
  /** @type {any} */
  const ctx = {
    workdir: cwd,
    seedRef,
    gapKeep: DECLARED_GAP_PREFIX,
    ...(timeoutMs !== undefined ? { timeoutMsDefault: timeoutMs } : {}),
    ...(gapCap !== undefined ? { gapCap } : {}),
    ...(maxBuffer !== undefined ? { maxBuffer } : {}),
    ...(baselineMode !== undefined ? { baselineMode } : {}),
    seedTrees,
  };
  try {
    /** @type {any[]} */
    const ran = [];
    /** @type {any} */
    let last = { verdict: 'satisfied', judgedCount: 1 };
    for (const st of stages) {
      const r = await runStage(st, ctx);
      const t = translate(r, redact);
      ran.push({
        name: st?.name ?? null,
        verdict: t.verdict,
        ...(t.exitCode !== undefined ? { exitCode: t.exitCode } : {}),
        ...(r.value !== null && r.value !== undefined ? { value: r.value } : {}),
        ...(r.baseline !== null && r.baseline !== undefined ? { baseline: r.baseline } : {}),
      });
      last = t;
      if (t.verdict !== 'satisfied') {
        return {
          ...t,
          stage: st?.name ?? null,
          stages: ran,
          declared: true,
          value: r.value ?? null,
          baseline: r.baseline ?? null,
          trendValue: trendValueOf(st, r),
          // the same header the command path writes, from the SAME function —
          // `src/trend.js` parses it to bucket the grade per stage
          ...(t.gap ? { gap: stageGap(/** @type {string} */ (st?.name), t.gap) } : {}),
        };
      }
    }
    return { ...last, stages: ran, declared: true, stage: undefined };
  } finally {
    if (owned) await seedTrees.cleanup();
  }
}

/**
 * The ONE number the trend reader may compare, and the omissions are the point.
 * `trend.js` reads improvement as `value < best`, so:
 *  - `lower-is-better` counts donate their value (a fault count falling IS
 *    convergence);
 *  - `higher-is-better` floors donate NOTHING. A test-count floor dropping is
 *    the run getting WORSE, and donating it would read as convergence and
 *    recommend a top-up on a dying run — the one direction trend.js names as
 *    dangerous. F6's answer applies: unknown, never a number that means the
 *    opposite of what it says.
 *  - a stage with no measurement at all donates nothing, for the same reason.
 * The stage POSITION still travels either way, so "the run got further than it
 * ever had" is readable on every declared close.
 * @param {any} stage @param {any} r the M1 StageResult
 * @returns {number|null}
 */
function trendValueOf(stage, r) {
  if (typeof r?.value !== 'number' || !Number.isFinite(r.value)) return null;
  return stage?.params?.direction === 'lower-is-better' ? r.value : null;
}

/**
 * The trend reader's input for ONE close verdict, whichever executor produced
 * it. A command close hands over its gap and `readGrade` scrapes stage and count
 * out of the text; a declared close already KNOWS both, so it says them instead
 * of round-tripping them through prose it would then have to parse back.
 *
 * Byte-identical to the previous call for a command close: `{ gap }`, with
 * `stage`/`value` left UNDEFINED so `trend.record` falls through to `readGrade`
 * exactly as before. Passing `stage: null` instead would silently disable that
 * fallback — undefined and null are different answers here.
 * @param {any} v a `runClose`-shaped verdict
 * @returns {{gap?: string, stage?: string|null, value?: number|null}}
 */
export function closeGrade(v) {
  if (v?.declared !== true) return { gap: v?.gap };
  return { gap: v.gap, stage: v.stage ?? null, value: v.trendValue ?? null };
}
