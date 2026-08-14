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
  validateDeclaration, classGuards, genreOwnedEnvNames, ungroundedGenreEnv, GENRE_LANGUAGES, TYPES_GENRE,
  VERDICT_CLASSES, LIVE_CLASSES,
} from './authoring.js';
import { stageGap } from './ralph.js';
import { isObj, isNonEmptyString } from './validate.js';

/** @typedef {{code: string, path: string, detail: string, [k: string]: any}} Red */

/** The genres a `closeDecl` may name. v1 admits exactly one (D13) — a genre
 * classifier is designed the day there is a second genre to classify. */
export const DECLARED_GENRES = Object.freeze([TYPES_GENRE.name]);
/**
 * The exact field set of a `closeDecl` — anything else is a smuggle channel, the
 * same rule `STAGE_FIELDS` enforces on a command stage.
 *
 * `genreEnv` is the ARBITER's own record of what it injected (M3's
 * `applyGenreEnv`), and it is here because the injection has to survive being
 * re-read. The flow applies the genre's variable to every env-capable stage
 * AFTER the model's form passed; from then on every re-validation — signing
 * (`prepareSigning`), the job validator (`src/job.js`), the runner
 * (`src/planrun.js`) — sees that key sitting in `params.env` and cannot, from
 * the stage alone, tell our injection from a model-authored guess. Recording it
 * once, in the SIGNED envelope, is what makes the comparison an EQUALITY rather
 * than a presence flag (the same move `checkGuards` makes for guard params), and
 * it is why the model never gets to author it: `authorCloseForJob` composes this
 * field from the flow's own applied map, never from model output. Its keys are
 * constrained to the names the genre OWNS, so it can never become an environment
 * channel of its own.
 */
export const CLOSE_DECL_FIELDS = Object.freeze(['genre', 'lang', 'stages', 'notes', 'genreEnv']);

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

/** The verdict classes a DECLARED close may claim. Named as data so the job
 * validator reads one hierarchy table rather than hard-coding a class.
 *
 * `hard` is by CONSTRUCTION: every mechanical kind is a command whose measurement
 * is the truth. `hitl` joined it at N4 slice 1, and only because `human-confirms`
 * is genuinely LIVE — the widening and the kind go in one commit, or this table
 * admits a class the executor cannot render. The `soft` class is still absent:
 * `judged-floor` is locked, so no declaration can reach above hitl.
 *
 * The direction that matters is unchanged. This says which class a declaration
 * MAY claim; `closeCeiling` says which class its stages actually NEED. A pick
 * below the ceiling is still the silent upgrade `class-ceiling` refuses. */
export const DECLARED_CLOSE_CLASSES = Object.freeze(['hard', 'hitl']);

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
 * THREE checks now ride on the listing, not two: the path rule, the scoped-job
 * derivation, and the GROUNDING of a recorded `genreEnv` (a by-value comparison
 * between two copies inside one hand-editable spec proves they agree, never that
 * the arbiter wrote them — see `ungroundedGenreEnv`). All three are deferred at
 * the job-spec gate and all three are re-run GROUNDED by the runner before any
 * stage executes, so the deferral moves the check rather than dropping it. The
 * grounded gates are `prepareSigning`'s gate 1b — where the signature is minted,
 * so a forged env can never be signed in the first place — and `runPlan`'s
 * pre-flight, which catches a spec edited after signing.
 *
 * `verdictType` is the class the USER picked, and it is REQUIRED here because
 * the guard battery keys off it (PRD v1.57 §2): with no class in hand there is
 * no battery, and M2 would be handed nothing to check D5 against. It arrives
 * from the spec's sibling `verdictType` field on every caller — the job
 * validator, the signing gate and the runner all hold the whole spec.
 *
 * @param {any} closeDecl
 * @param {{at?: string, listing?: string[]|null, deferListing?: boolean,
 *   catalogue?: Record<string, any>, verdictType?: string|null}} [opts]
 * @returns {{ok: boolean, reds: Red[], closeDecl: any, grounded: boolean,
 *   scoped: {scoped: boolean, via: string|null},
 *   ceiling: {class: string, kind: string, stage: string|null, locked: boolean}|null}}
 */
export function validateCloseDecl(closeDecl, opts = {}) {
  const { at = 'closeDecl', listing = null, catalogue, verdictType = null } = opts;
  const deferListing = opts.deferListing === true;
  /** @type {Red[]} */
  const reds = [];
  /** @type {(code: string, path: string, detail: string, extra?: object) => void} */
  const red = (code, path, detail, extra = {}) => { reds.push({ code, path, detail, ...extra }); };
  const bail = () => ({ ok: false, reds, closeDecl: null, grounded: false, scoped: { scoped: false, via: null }, ceiling: null });

  // THE PICKED CLASS, before anything else, because the battery hangs off it.
  // The path is the SPEC's own `verdictType` rather than a `closeDecl` child:
  // the class is the user's separate answer and this red must point at the field
  // they actually set, not at the artefact it invalidates.
  //
  // A locked class reds here as well as on job.js's counted `request-red`, and
  // that is two axes rather than one problem twice: one COUNTS the demand for
  // the class, this one says the close cannot be validated because the class it
  // was picked under has no battery. It is the same split `langOk` already
  // makes, and both bail for the same reason — a validator configured out of its
  // own rule reports a declaration it never examined.
  const picked = String(verdictType);
  if (!VERDICT_CLASSES.includes(picked)) {
    red('class-absent', 'verdictType', `the verdict class the user picked — one of ${VERDICT_CLASSES.join(' | ')}. `
      + 'It selects this close\'s mandatory guard battery, which has no default and is never inferred');
    return bail();
  }
  if (!LIVE_CLASSES.includes(picked)) {
    red('class-battery-locked', 'verdictType', `"${picked}" is declared-but-locked: v1 builds a guard battery for `
      + `${LIVE_CLASSES.join(', ')} only, and a close cannot be validated against a battery that does not exist — `
      + 'validating it against another class\'s guards would sign a close nobody checked');
    return bail();
  }

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
  // `notes` is NOT checked here. It is M2's rule now (`validateDeclaration`),
  // for the reason the divergence caused: this gate runs at SIGNING, and a rule
  // that lives only at signing cannot be fed back as a revision — the run pays
  // for a close, the authoring loop accepts it, and the job dies on a defect the
  // model was never shown. One spelling, at the gate that can still revise, and
  // the red still arrives here with this gate's own `at` prefix. It rides the
  // `langOk` bail below like every other declaration-shape red: with no language
  // there is no declaration to validate at all.
  //
  // Without a language there is no guard battery and no owned-env list, so M2
  // would be handed nothing to check D5 against — and a validator configured out
  // of its own rule reports a declaration it never examined. Refuse here instead.
  if (!langOk) return bail();

  // The recorded injection (see CLOSE_DECL_FIELDS). Constrained to the names the
  // genre owns and to non-empty string values: an unowned name here would be an
  // environment channel wearing the arbiter's coat, and an empty value is not the
  // same instruction as an unset variable (`genreEnv` never ships one).
  const owned = genreOwnedEnvNames(closeDecl.lang);
  /** @type {Record<string, string>} */
  const envInjected = {};
  if (closeDecl.genreEnv !== undefined) {
    if (!isObj(closeDecl.genreEnv)) {
      red('invalid-value', `${at}.genreEnv`, 'the genre environment this close was authored under, as an object of '
        + 'non-empty string values — it records what the ARBITER injected, and nothing else belongs in it');
    } else {
      for (const [name, value] of Object.entries(closeDecl.genreEnv)) {
        if (!owned.includes(name)) {
          red('invalid-value', `${at}.genreEnv.${name}`, `the ${closeDecl.lang} genre does not own ${name} — this field `
            + `records the genre's own injection only (${owned.length ? owned.join(', ') : 'this genre owns none'}), `
            + 'never an environment of its own');
        } else if (!isNonEmptyString(value)) {
          red('invalid-value', `${at}.genreEnv`, `${name} is recorded with no value — an empty variable is not the same `
            + 'instruction as an unset one, and the genre never builds one');
        } else envInjected[name] = value;
      }
    }
  }
  // GROUNDED, wherever there is a tree to ground against. The by-VALUE check
  // above proves the envelope and the stage AGREE — and both copies sit in the
  // same hand-editable spec, so agreement is free to a forger: `genreEnv` and
  // `params.env` both reading `/tmp/attacker-stubs` is perfectly self-consistent
  // and grades a checkout nobody signed. The seed tree is the thing the forger
  // does not own, so every element of a recorded value must SELECT from the
  // listing — the same trick hamr's path rule already uses, and an exact fit for
  // what `applyGenreEnv` can produce (see `ungroundedGenreEnv`).
  //
  // It runs at both gates that hold a listing (`prepareSigning`'s grounded gate
  // 1b and the runner's pre-flight re-validation) and cannot run at the deferred
  // job-spec gate, which has no repository — that gate's deferral is already
  // stated above, and the runner re-validates GROUNDED before any stage runs, so
  // this is moved rather than skipped.
  if (Array.isArray(listing) && listing.length > 0) {
    for (const u of ungroundedGenreEnv(closeDecl.lang, envInjected, listing)) {
      red('genre-env-ungrounded', `${at}.genreEnv.${u.name}`, `${u.name} is recorded as the genre's own injection but `
        + `"${u.element}" matches nothing in the seed tree — the arbiter builds this value by joining source prefixes it `
        + 'already filtered against the listing, so a path the tree does not contain is not one it can have written',
      { name: u.name, element: u.element, resolved: u.resolved });
    }
  }

  const v = validateDeclaration(closeDecl, {
    ...(catalogue ? { catalogue } : {}),
    // BOTH are forwarded, always. Forwarding only one would hide the case M2
    // reds as `listing-conflict` — a caller that defers the tree-grounded half
    // AND hands over a tree does not know which gate it is running, and silently
    // honouring one of the two is how a signature ends up covering a check
    // nobody performed.
    listing,
    ...(deferListing ? { deferListing: true } : {}),
    guards: classGuards({ verdictType: picked, lang: closeDecl.lang }),
    verdictType: picked,
    envOwned: owned,
    // POST-injection: an owned name is accepted only when its value is EXACTLY
    // the recorded one. `{}` (nothing recorded) keeps the pre-injection rule, so
    // a declaration that authored the variable itself is still refused.
    envInjected,
  });
  for (const r of v.reds) reds.push({ ...r, path: r.path ? `${at}.${r.path}` : at });

  const ok = reds.length === 0;
  return {
    ok,
    reds,
    closeDecl: ok ? { ...closeDecl, stages: v.declaration.stages } : null,
    grounded: v.grounded,
    scoped: v.scoped,
    ceiling: v.ceiling,
  };
}

// ── the execution bridge ─────────────────────────────────────────────────────

/**
 * The genre's mandatory guard NAMES for a declaration — which stages are D5's
 * guards and which are the job's own work. The seed-verdict read (D9.3) needs
 * exactly this split: `changed-from-seed` is RED at its own seed by
 * construction, so counting it as work would let a close with nothing to do
 * pass the "something must be red at seed" gate.
 * The battery keys off the CLASS the user picked (PRD v1.57 §2), so the class
 * comes in beside the declaration. A class or a language with no battery hands
 * back `[]` — this reads a split, it does not enforce one, and every caller
 * reaches it only after `validateCloseDecl` has already refused both cases.
 * @param {any} closeDecl @param {string} verdictType @returns {string[]}
 */
export function guardNames(closeDecl, verdictType) {
  if (!isObj(closeDecl) || !GENRE_LANGUAGES.includes(closeDecl.lang)) return [];
  if (!LIVE_CLASSES.includes(String(verdictType))) return [];
  return classGuards({ verdictType: String(verdictType), lang: closeDecl.lang }).map((g) => g.name);
}

/**
 * One declared stage's result, in the ARBITER's verdict vocabulary.
 *
 * `notes` is the DIAGNOSTIC channel, and it exists because M1's kinds announce
 * some things whichever way a stage lands: a declared env var that was dropped,
 * the scope filter's own arithmetic. A red carries those out inside its gap; a
 * green and an instrument stop had nowhere to put them and this function used to
 * compute the text and discard it. A green measured over a filtered population
 * is still a filtered number, and the operator reads why — checking the GREENS
 * is doctrine, and an audit trail that only survives a red cannot do it.
 *
 * It is `notes` and NOT `.gap`, deliberately. Every consumer downstream guards
 * with `if (gap)`, so a green carrying one would read as revision-worthy and a
 * stop carrying one would look like a verdict it never rendered. Nothing routes
 * on this field, nothing bounds on it, and no verdict moves because of it; it
 * rides the spine records that already spread the whole verdict
 * (`close-precheck`, `outer-close`, ralph's `close-verdict`).
 * @param {any} r an M1 `StageResult`
 * @param {(s: string) => string} redact
 * @returns {{verdict: string, notes?: string, gap?: string, detail?: string,
 *   exitCode?: number, judgedCount?: number}} `notes` is absent, never empty —
 *   a field that is always there says nothing; a RED carries its diagnostics
 *   inside `gap` and so has none of its own.
 */
function translate(r, redact) {
  const gapText = redact((r.gapLines ?? []).join('\n'));
  /** absent rather than empty: a field that is always there says nothing */
  const notes = gapText ? { notes: gapText } : {};
  if (r.verdict === 'green') return { verdict: 'satisfied', judgedCount: 1, ...notes };
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
  // fault was observed, never sniffed out of the stop's prose. `detail` is the
  // stop's own sentence; `notes` is the whole rendered output around it, which is
  // where a measurement's already-computed arithmetic lives (`stopped`'s own
  // `notes` argument) — the difference between hunting a parser bug and reading
  // the scope.
  return {
    verdict: r.detail?.fault ?? STOP_FAULTS.FAILED,
    detail: redact(String(r.detail?.stop ?? `stage "${r.stage}" rendered no judgment`)),
    ...notes,
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
        // PER STAGE, because the summary below carries only the LAST translation:
        // an earlier green's announcement would otherwise be lost behind the
        // stage that decided.
        ...(t.notes !== undefined ? { notes: t.notes } : {}),
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
