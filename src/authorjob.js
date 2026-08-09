// THE COMPOSITION — close-authoring v1, module M4b (design record 2026-08-07,
// FROZEN; gate-2 POC closed 2026-08-08, addendum 6).
//
// M1 runs a stage. M2 says what a declaration may say. M3 looks at the repository
// and gets a declaration out of a model. M4a bridges the declared close to the
// arbiter's runtime. This module is the part a PERSON meets: the interview, the
// refusal when we cannot do their job, and the assembly of everything into a job
// spec with a hash for them to sign.
//
// ── D10: the interview runs INSIDE bareloop ─────────────────────────────────
//
// A product feature, not a Claude Code workflow — hamr confirmed it, and it is
// the answer to the premise this whole rung serves: *"the premise of bareloop is
// that user might not and mostly isn't swe to write and bareloop solves the whole
// thing."*
//
// It is a PURE FUNCTION over answers, and there is no prompt loop in this file.
// The UI or the CLI collects the picked verdict class and that class's own frozen
// questions and hands them over, the same way `runJob` takes a spec rather than
// asking for one. That is what lets the interview be tested without a terminal
// and reused by a web panel later.
//
// ── THE VERDICT CLASS IS THE USER'S ANSWER (PRD v1.57 §1) ───────────────────
//
// D4 (*"verdictType is DERIVED from the answers, never picked"*) is SUPERSEDED
// in full. The green / soft-green / hitl radio of the 2026-07-21 Layer 2 design
// is restored: the user picks the class, and that choice DRIVES the authoring
// rather than falling out of it. Whose knowledge it is settles it — the user is
// the one who knows whether their *done* is machine-checkable, needs judgment,
// or needs a person, and a derivation infers that from answers given before the
// question was asked.
//
// The field is what `src/job.js` already calls it: a declared radio the preflight
// VALIDATES, never infers. It arrives as STRUCTURED input beside the answers, the
// same way `repoPath` does — a closed set handed over enumerated, never read out
// of prose.
//
// v1 STILL ADMITS ONLY `green`. A soft-green or hitl pick returns the honest
// counted refusal on the `request-red` admission path (D13's mechanism), now
// carrying demand for a VERDICT CLASS rather than only for a genre. It refuses
// at ADMISSION — before that class's questions are ever asked, because those two
// question sets are named but locked (`QUESTION_SETS`, M3).
//
// AND THE INTERVIEW KEYS ON THE CLASS. Three frozen question sets replace one
// set per genre: genres are a fat tail that cannot be enumerated, classes are
// exactly three. D13's genre-CONFIRM slot goes with the change — the interview
// never asks about a genre again. The refusal it carried MOVED to the composer
// (below): a job the catalogue cannot measure refuses there, on the same counted
// path. D13's one-genre-at-a-time law survives; only the question is gone.
//
// TWO PRECONDITIONS STILL DECIDE WHETHER A GREEN PICK CAN BE HONOURED, and both
// are mechanical, never a reading of prose:
//
//   1. there is a repository with a git seed, because all three of D9's validity
//      gates rest on one (the precheck spawns commands in a workdir and the
//      changed-set primitive is `git diff <seed>` — a doc or a website has
//      neither, which is D13's own reason for putting them out of v1);
//   2. and, at signing, the close actually has WORK to do (D9.3).
//
// A green pick that fails either one REFUSES, counted. It never quietly authors
// a close for a job it cannot close, which is the failure D13's forward-compat
// point 1 names: resolving a judgment job to a command close would defeat
// `CLASS_BY_CLOSE`/`CLASS_BY_VERDICT` from ABOVE, by never letting the illegal
// pair be formed. The ceiling rule (M2's `closeCeiling`) is the same guard one
// layer down: the pick is a PROMISE, and a composition may only use kinds at or
// below it.
//
// ── D13: honest refusal, with the lib stamped HERE ──────────────────────────
//
// Every refusal rides the `request-red` admission path, so demand for a genre, a
// verdict class or a locked kind is COUNTED evidence rather than a silent drop.
// `lib: 'bareloop'` is stamped at THIS emit site, never inferred downstream: the
// refused catalogue is OURS, and filing it against a bare-suite package is the
// BA-2 misattribution the typed-lib rule exists to prevent.
//
// The design record names this defect as live in `src/ledger.js` and explicitly
// leaves it unfixed there ("named here, not fixed here"). Measured against the
// tree rather than the record: it was already closed on `main` at 1b4bb77 —
// `classifyIncidents` reads `ev.lib ?? 'bare-agent'` and the `request-red` ASK
// template renders `${o.lib}`, both stamped-first. What M4 owes is therefore not
// the fix but the PROOF that the new emit site routes through it, which the suite
// pins end to end (emit → classify → suggestedAsk).
//
// ── D6/D7: authored once, signed whole ──────────────────────────────────────
//
// `prepareSigning` runs D9's three mechanical gates and hands back the resolved
// spec plus its hash. It never signs: the approvals array and the human word are
// the arbiter relocating to the user, not disappearing. Re-authoring produces a
// different declaration, therefore a different resolved hash, therefore a new
// signature — that falls out of `jobSpecHash` because the guards are ENUMERATED
// in the stored declaration (forward-compat point 3), and the suite pins it.

import { jobSpecHash, validateJob } from './job.js';
import { seedAtHead, seedListing, seedRead as runSeedRead, makeSeedTrees } from './kinds.js';
import {
  GENRE_LANGUAGES, LOCKED_KINDS, TYPES_GENRE, VERDICT_CLASSES, LOCKED_CLASSES, LIVE_CLASSES,
} from './authoring.js';
import { QUESTION_SETS, questionsFor, requiredAnswersFor, authorClose } from './authorflow.js';
import { runAuthorScout, buildSeedListing } from './authorscout.js';
import {
  DECLARED_GAP_PREFIX, DECLARED_GENRES, guardNames, isDeclaredClose, validateCloseDecl,
} from './declaredclose.js';
import { isObj, isNonEmptyString, redactSecrets } from './validate.js';

/** @typedef {{code: string, path: string, detail: string, [k: string]: any}} Red */
/** @typedef {{kind: 'request-red'|'decision-ready', verb: string|null, path: string,
 *   detail: string, options: string[], red: Red|null}} Refusal */

/** the one genre v1 admits (D13). The interview no longer ASKS about it — the
 * catalogue is one genre wide and the composer is where that refuses — but the
 * signed `closeDecl` still names the genre it was authored under. */
export const GENRE = TYPES_GENRE.name;
/** the three frozen interview sets and their readers, re-exported from where
 * they live (M3) so a caller needs one import and there is still only one copy
 * of the questions */
export { QUESTION_SETS, questionsFor, requiredAnswersFor };
/** THE RADIO. A closed set, handed over enumerated rather than as prose with a
 * rule about it: illegal becomes inexpressible instead of rejected after the
 * fact (the `check-passes(name)` model). A UI renders it as three buttons, and
 * two of them are marked locked. */
export { VERDICT_CLASSES, LOCKED_CLASSES, LIVE_CLASSES };

/** The territory every refusal here lands against. bareloop's OWN catalogue —
 * the genre menu, the verdict menu, the kind menu — never a bare-suite package.
 * Stamped at the emit site (the typed-lib rule). */
export const REFUSAL_LIB = 'bareloop';
/** the escalation category a refusal escalates under. It is DELIBERATELY in the
 * ledger's executable excluded set: the demand is already counted once as a
 * `request-red`, and counting the escalation too would inflate the very number
 * the admission path exists to measure. */
export const REFUSAL_CATEGORY = 'close-unauthorable';

/** @type {string[]} */
const LEVERS = ([
  'describe a job bareloop can close today: one whose done is machine-checkable, on a git repository',
  'wait for the verdict-classes rung — this refusal is the evidence it waits on',
]);

/**
 * One refusal, in the shape both the caller and the ledger need.
 * @param {{verb: string|null, path: string, detail: string, kind?: 'request-red'|'decision-ready', options?: string[]}} o
 * @returns {Refusal}
 */
function refuse({ verb, path, detail, kind = 'request-red', options = LEVERS }) {
  return {
    kind,
    verb,
    path,
    detail,
    options,
    // The structured fields the ledger keys admission on — never prose. `lib` is
    // stamped HERE, at the emit site, for the reason src/job.js stamps its own:
    // one code, two territories, and inferring which one downstream is how a
    // bareloop refusal becomes an upstream bug report.
    red: kind === 'request-red'
      ? { code: 'request-red', path, detail, verb: /** @type {string} */ (verb), lib: REFUSAL_LIB }
      : null,
  };
}

/**
 * The spine events a refusal produces — returned rather than emitted, because
 * this module owns no spine (the runner shell does, exactly as with `runJob`).
 *
 * The `job-red` carries the structured `verb`/`lib`, which is the channel
 * `classifyIncidents` already reads; the escalation carries the human's levers
 * and is EXCLUDED from classification so the same demand is not counted twice.
 * @param {Refusal} refusal
 * @returns {{type: string, [k: string]: any}[]}
 */
export function refusalEvents(refusal) {
  /** @type {{type: string, [k: string]: any}[]} */
  const events = [];
  if (refusal.red) events.push({ type: 'job-red', ...refusal.red });
  events.push({
    type: 'escalation',
    category: REFUSAL_CATEGORY,
    decisionReady: true,
    decision: refusal.detail,
    options: refusal.options,
  });
  return events;
}

// ── 1. THE INTERVIEW ─────────────────────────────────────────────────────────

/**
 * Read the picked verdict class and that class's own frozen answers. Pure: no
 * model, no repository, no clock.
 *
 * Four outcomes, and the middle two are the ones that matter:
 *   - `ok` — a class v1 builds, every answer present, a repository named;
 *   - a CLASS REFUSAL — the user picked soft-green or hitl. Counted demand for a
 *     VERDICT CLASS, refused at ADMISSION, before that class's questions run
 *     (they are named but locked, and asking them would be an interview for a
 *     job nothing here can close);
 *   - a REPO REFUSAL — a green pick with nothing deterministic to measure
 *     against. Counted demand too;
 *   - plain `reds` — the interview is not finished, or the radio was not set.
 *     NOT demand: an incomplete form is not a user asking for a capability, and
 *     an unknown class is a typo, never a request (the same split `src/job.js`
 *     makes between a locked verdict and an invalid one).
 *
 * @param {{answers: Record<string|number, any>, verdictType?: string|null,
 *   repoPath?: string|null, questions?: Record<string|number, string>|null}} o
 *   `verdictType` and `repoPath` are STRUCTURED input from the UI, never parsed
 *   out of the prose of an answer: a class is picked off a radio and a path is
 *   read off the machine, or neither exists.
 * @returns {{ok: boolean, answers: Record<string|number, string>,
 *   verdictType: string|null, repoPath: string|null, refusal: Refusal|null, reds: Red[]}}
 */
export function runInterview({ answers, verdictType = null, repoPath = null, questions = null }) {
  /** @type {Red[]} */
  const reds = [];
  const out = (/** @type {Partial<any>} */ over) => ({
    ok: false, answers: {}, verdictType: null, repoPath: null, refusal: null, reds, ...over,
  });

  // ── THE RADIO, first. It DRIVES everything below it: which questions get
  // asked, which guard battery attaches, and whether this job is admissible at
  // all. Nothing derives it and nothing defaults it.
  const picked = String(verdictType);
  if (!VERDICT_CLASSES.includes(picked)) {
    reds.push({
      code: verdictType === null || verdictType === undefined ? 'missing-field' : 'invalid-value',
      path: 'verdictType',
      detail: `the verdict class, picked by the person whose job this is: ${VERDICT_CLASSES.join(' | ')} — is your `
        + 'definition of done machine-checkable, does it need judgment, or does it need a person? A closed set, '
        + 'never inferred from the answers',
    });
    return out({});
  }

  // A LOCKED class refuses HERE, before its questions are asked. Counted demand
  // for the class itself — the verdict-classes rung is what this evidence is for.
  if (LOCKED_CLASSES.includes(picked)) {
    return out({
      refusal: refuse({
        verb: picked,
        path: 'verdictType',
        detail: `You picked "${picked}", and v1 cannot close that yet: it admits ${LIVE_CLASSES.join(', ')} only — a `
          + 'job whose done a command can decide. A judged score and a person\'s sign-off are named in the menu and '
          + 'locked, so picking one is recorded as demand rather than dropped, and this refusal is the evidence the '
          + 'verdict-classes rung waits on.',
      }),
    });
  }

  const set = questions ?? questionsFor(picked);
  const required = requiredAnswersFor(picked);

  if (!isObj(answers)) {
    reds.push({ code: 'missing-field', path: 'answers', detail: 'the interview answers, keyed by question number' });
    return out({});
  }
  /** @type {Record<string|number, string>} */
  const given = {};
  for (const n of required) {
    const a = answers[n];
    if (!isNonEmptyString(a)) {
      reds.push({
        code: 'missing-field',
        path: `answers.${n}`,
        detail: `unanswered: ${set[n] ?? `question ${n}`}`,
      });
      continue;
    }
    // scrubbed at INGEST, not at emission: an answer is about to become a prompt
    // ingredient, a spine record and a signed artefact all at once, and a log
    // that captures a key captures it forever
    given[n] = redactSecrets(a);
  }
  if (reds.length) return out({ answers: given });

  // The green pick's own precondition: D1's "a repo is never a precondition"
  // holds for the INTERVIEW and not for D9's validity gates, all three of which
  // rest on a runnable patient with a git seed. A doc or a website job has no
  // seed and no changed set, so nothing deterministic can be measured against it
  // — that is softgreen/hitl territory, out of v1, refused on the same counted
  // path. The class the user picked cannot be honoured, so it is not returned.
  if (!isNonEmptyString(repoPath)) {
    return out({
      answers: given,
      refusal: refuse({
        verb: 'non-green-verdict',
        path: 'repoPath',
        detail: 'This job has no code repository, so there is no seed to measure against and no changed set to read — '
          + 'nothing deterministic can decide whether it came back done. That needs a judged or a human close, and '
          + 'both are declared-but-locked in v1.',
      }),
    });
  }

  return {
    ok: true,
    answers: given,
    // ECHOED, never derived: this is the user's own answer, validated against the
    // closed set and carried forward. The remaining precondition (D9.3 — the
    // close actually has work to do) is measured at signing, and refuses there.
    verdictType: picked,
    repoPath,
    refusal: null,
    reds,
  };
}

/**
 * The refusal for a user who asks for a LOCKED KIND by name — a judged score or
 * a person's sign-off. Exposed because the tool-mode declaration schema makes a
 * locked kind INEXPRESSIBLE (M3's header states the cost): the demand cannot
 * arrive through the model, so it has to arrive through the interview layer, and
 * this is that layer.
 * @param {string} kind @returns {Refusal}
 */
export function refuseLockedKind(kind) {
  const known = LOCKED_KINDS.includes(kind);
  return refuse({
    verb: kind,
    path: 'closeDecl.stages[].kind',
    detail: known
      ? `"${kind}" is a named but LOCKED stage kind — declaring it is recorded demand, never an admission; it does not `
        + 'run in v1, and the verdict class it belongs to is locked with it.'
      : `"${kind}" is not a stage kind bareloop owns — the catalogue is ${DECLARED_GENRES.join('|')}-genre kinds only, `
        + 'and a kind we have not built is a hole in the product, recorded as one.',
  });
}

/**
 * The composer's own refusal, read off the authoring reds rather than re-derived.
 *
 * A `locked-kind` red is M2's counted demand for a catalogue entry v1 names but
 * does not run — the demand is already stamped (`verb`, `lib`) at the emit site,
 * so this reshapes it for the caller and never restates it. Every other authoring
 * red is a defect or a casualty, not a user asking for a capability, and turning
 * one into demand would inflate exactly the number the admission path measures.
 * @param {Red[]} reds @returns {Refusal|null}
 */
function composerRefusal(reds) {
  const locked = (Array.isArray(reds) ? reds : []).find((r) => r?.code === 'locked-kind');
  if (!locked) return null;
  return refuseLockedKind(String(locked.kind ?? locked.verb ?? ''));
}

// ── 2. THE COMPOSITION ───────────────────────────────────────────────────────

/**
 * Interview answers in, a signable close DECLARATION out.
 *
 * The order is the design's own, and every cheap refusal happens before any
 * token: interview → seed → scout → listing → the grounded authoring loop (M3).
 *
 * `scoutFn`, `listingFn` and `seedFn` are seams so a caller can supply a survey
 * it already paid for (the prereg reuses one across arms), and so the whole
 * pipeline is testable without a provider. All three are REAL by default.
 *
 * THE GENRE REFUSAL LIVES HERE NOW (PRD v1.57 §2). D13's interview slot asked
 * the user to confirm a genre; the interview no longer asks, and the refusal
 * moved to the COMPOSER — a job the catalogue cannot measure refuses at this
 * layer, on the same `request-red` path, still counted as demand. Two mechanical
 * signals reach it and neither is a reading of prose: a language the genre owns
 * no data for (so there is no guard battery to attach), and a LOCKED KIND the
 * model reached for (the catalogue's own counted-demand red, carried up). D13's
 * one-genre-at-a-time law is untouched.
 *
 * @param {{answers: Record<string|number, any>, repoPath?: string|null, lang: string,
 *   verdictType?: string|null,
 *   questions?: Record<string|number, string>|null, generate?: Function, provider?: any,
 *   seedRef?: string|null, scout?: any, listing?: any,
 *   seedFn?: Function, scoutFn?: Function, listingFn?: Function,
 *   authorFn?: Function, authorOpts?: object}} o
 * @returns {Promise<{ok: boolean, refusal: Refusal|null, verdictType: string|null,
 *   closeDecl: any, seedRef: string|null, authoring: any, reds: Red[], stop: string|null,
 *   cost: any, interview: any}>}
 */
export async function authorCloseForJob({
  answers, repoPath = null, lang, verdictType = null, questions = null,
  generate, provider = null, seedRef = null, scout = null, listing = null,
  seedFn = seedAtHead, scoutFn = runAuthorScout, listingFn = buildSeedListing,
  authorFn = authorClose, authorOpts = {},
}) {
  /** @type {any} */
  const base = {
    ok: false, refusal: null, verdictType: null, closeDecl: null, seedRef: null,
    authoring: null, reds: [], stop: null, cost: null, interview: null,
  };

  const interview = runInterview({ answers, verdictType, repoPath, questions });
  base.interview = interview;
  if (!interview.ok) {
    return { ...base, refusal: interview.refusal, reds: interview.reds, stop: interview.refusal ? 'refused' : 'interview-incomplete' };
  }
  const workdir = /** @type {string} */ (interview.repoPath);
  const picked = /** @type {string} */ (interview.verdictType);

  if (!GENRE_LANGUAGES.includes(lang)) {
    // THE GENRE REFUSAL, at the composer. This used to be a plain wiring red;
    // under v1.57 §2 the interview no longer asks the user to confirm a genre, so
    // this is where "we can't run this kind of job yet" actually lands — and it
    // is COUNTED demand rather than a silent drop, on the same `request-red`
    // path the confirm slot used. The battery is the reason it must refuse at
    // all: `classGuards` throws rather than hand back an empty one (F59's shape
    // — absent must never read as "no guards needed").
    return {
      ...base,
      refusal: refuse({
        verb: 'genre-other',
        path: 'lang',
        detail: `We can't run this kind of job yet. The catalogue can measure one genre (${GENRE}: a type checker `
          + `stops complaining without breaking the tests) in ${GENRE_LANGUAGES.join(' and ')}, and "${lang}" has no `
          + 'guard battery — a genre with no battery must refuse rather than author a close without the guards it '
          + 'cannot supply.',
      }),
      reds: [{
        code: 'request-red',
        path: 'lang',
        verb: 'genre-other',
        lib: REFUSAL_LIB,
        detail: `no ${GENRE} genre data for language "${lang}" — one of ${GENRE_LANGUAGES.join(', ')}`,
      }],
      stop: 'refused',
    };
  }

  // D8 — the seed, READ rather than typed.
  let seed = seedRef;
  if (!isNonEmptyString(seed)) {
    const s = await seedFn(workdir);
    if (s.stop !== null) {
      // same git-stderr channel as `prepareSigning`'s, scrubbed at the same
      // boundary — this red is returned to the caller and kept with the run
      return { ...base, reds: [{ code: 'seed-unreadable', path: 'seedRef', detail: redactSecrets(s.stop) }], stop: 'precheck' };
    }
    seed = s.seedRef;
  }
  base.seedRef = seed;

  // D11 — the scout LOOKS, the author WRITES, neither acts. An ABSENT survey is
  // never "no special facts are needed" (F59), and `authorClose` refuses on it at
  // $0, so nothing here has to second-guess the classification.
  const survey = scout ?? await scoutFn({ workdir, provider });
  const seeds = listing ?? await listingFn({
    workdir, seedRef: seed, sourcePaths: survey?.facts?.sourcePaths, testPaths: survey?.facts?.testPaths,
  });

  const authored = await authorFn({
    workdir, seedRef: seed, lang, verdictType: picked,
    answers: interview.answers, questions: questions ?? questionsFor(picked),
    scout: survey, listing: seeds, generate, ...authorOpts,
  });

  if (!authored.ok) {
    return {
      ...base,
      authoring: authored, reds: authored.reds, stop: authored.stop, cost: authored.cost,
      // the OTHER composer refusal: the model reached for a kind the catalogue
      // names but does not run. M2 already stamped the counted red at the emit
      // site; this carries it up in the shape the caller's ledger and terminal
      // read, rather than leaving a locked-kind demand buried in a reds array.
      refusal: composerRefusal(authored.reds),
    };
  }

  // The genre's ENVIRONMENT, recorded from the flow's own applied map — never
  // from the model, and never re-derived here. The flow injected it into every
  // env-capable stage after the model's form passed (M3's `applyGenreEnv`), and
  // from this point on every re-validation reads that key back: signing, the job
  // validator, the runner. Without the record they cannot tell our injection from
  // a model-authored guess, so they must refuse it — which is a python close that
  // can never be signed, validated or run. Recorded ONLY when something was
  // injected: absent is a genre that owns no environment (JS), and an empty
  // object would read as "we looked and found none" for a genre that never looks.
  const applied = isObj(authored.genreEnv?.applied) ? authored.genreEnv.applied : {};

  // The class the USER picked, carried through unchanged — validated at the
  // interview, honoured by the composition (M2's ceiling rule refuses a
  // declaration above it), and stated here rather than re-derived. The remaining
  // precondition (D9.3 — the close has work to do) is measured by
  // `prepareSigning`, which refuses there.
  return {
    ok: true,
    refusal: null,
    verdictType: picked,
    closeDecl: {
      genre: GENRE,
      lang,
      stages: authored.declaration.stages,
      ...(Object.keys(applied).length ? { genreEnv: { ...applied } } : {}),
      // `notes` is the one FREE-TEXT field the model writes straight into the
      // signed spec, and this is that field's persist boundary. Scrubbed here
      // for the same reason `scrubRed` scrubs uniformly a few lines down: every
      // other model-authored string that survives this call rides the ONE
      // redactor, and a signed spec outlives the run that produced it.
      // `redactSecrets` returns a non-matching string byte-identical, so a note
      // carrying nothing hashes exactly as it did — the mask costs the honest
      // case nothing, which is the fail-safe direction.
      ...(authored.declaration.notes?.length
        ? { notes: authored.declaration.notes.map((/** @type {any} */ n) => (typeof n === 'string' ? redactSecrets(n) : n)) }
        : {}),
    },
    seedRef: seed,
    authoring: authored,
    reds: authored.reds,
    stop: authored.stop,
    cost: authored.cost,
    interview,
  };
}

/**
 * Fold an authored close into the OPERATOR's own half of the spec.
 *
 * The two halves never mix: budgets, the fence, cadence, escalation and the
 * provider are operator input and are not authored by anything here (the
 * permanent hard line). What this adds is the close, the derived verdict class,
 * and nothing else.
 *
 * The GOAL is passed through, not generated. F87 requires the goal to state
 * everything the close judges, and §3 of the design record says that becomes
 * structural once the goal RENDERS from the same answers — that rendering is UI
 * work (PRD v1.51 §5, "lands with the close-authoring interview UI") and is
 * deliberately not invented here.
 * @param {any} specDraft the operator's half (everything except close/verdictType)
 * @param {{closeDecl: any, verdictType: string}} authored
 */
export function assembleSpec(specDraft, { closeDecl, verdictType }) {
  const { close: _dropped, ...rest } = isObj(specDraft) ? specDraft : {};
  return { ...rest, verdictType, closeDecl };
}

// ── 3. D9's THREE GATES, AND THE HASH ────────────────────────────────────────

/**
 * A validator red, SCRUBBED for persistence. Both declaration gates in
 * `prepareSigning` hand back reds that quote things this module does not own —
 * the declaration the model wrote (a `cmd`, an env value, a path) and the seed
 * listing the arbiter read (the listing rule names what really sits beside an
 * invented path). Those reds are written into the signing evidence, and a file
 * that captures a key captures it forever.
 *
 * The scrub is at the EMISSION boundary, never inside the validators: they are
 * shared with the model-facing rendering, which already scrubs on its own way
 * out (`renderRejectBlock`), and a second scrub buried in the rule would be the
 * hand-rolled copy the ONE inventory (SECRET_PATTERNS) exists to prevent.
 *
 * UNIFORM over every string-valued field, not a named list of them. `detail` is
 * only the loudest echo: `cmd-denied` quotes the command AGAIN as a structured
 * `cmd`, `path-not-in-listing` carries `declared`/`resolved`, and the next red
 * to learn a field would be missed by an allowlist written today. `redactSecrets`
 * returns a non-matching string byte-identical, so the enumerated and structural
 * fields (`code`, `path`) pass through unchanged and the uniform map costs them
 * nothing — the fail-safe direction, by construction.
 * @param {Red} r @returns {Red}
 */
const scrubRed = (r) => /** @type {any} */ (Object.fromEntries(
  Object.entries(r).map(([k, v]) => [k, typeof v === 'string' ? redactSecrets(v) : v]),
));

/**
 * D9, in code: *nothing JUDGES the close; three mechanical gates plus a
 * signature.* No LLM validates another LLM's close, here or anywhere.
 *
 *   1. THE DECLARATION VALIDATOR — the spec's own gate plus M2's, run GROUNDED
 *      against the real seed listing (the job validator defers that half).
 *   2. THE CLOSE PRECHECK — every stage runs against the real patient. A stage
 *      that cannot run is `broken-close`, and it is a CASUALTY, never a red.
 *   3. THE SEED-VERDICT READ — every stage, offered or not, run at the seed. Which
 *      are RED (the work) and which are GREEN (the guards) is shown to the user.
 *      A close with NO work stage red at seed has nothing to do and is refused
 *      decision-ready — gate-2 round 2's arm B died exactly there, on a mypy that
 *      scanned nothing and therefore read clean.
 *
 * Gates 2 and 3 share ONE execution, and that is stated rather than hidden: at
 * job creation the tree IS the seed, so "does every stage run against the real
 * patient" and "what does every stage say at the seed" are two readings of the
 * same pass. `seedRead` runs EVERY stage rather than first-red-wins, which is
 * D12's own named build item — a stage that never ran mints no baseline, and
 * every shipped close opens with a guard that is red at its own seed.
 *
 * IT NEVER SIGNS. The approvals array and the human's word are unchanged; what
 * comes back is the resolved spec, its hash, and the evidence to sign against.
 *
 * @param {{spec: any, workdir: string, seedRef?: string|null, shellCapUsd?: number,
 *   timeoutMs?: number, seedFn?: Function, listingFn?: Function, seedReadFn?: Function}} o
 * @returns {Promise<{ok: boolean, specHash: string|null, seedRef: string|null,
 *   gates: any, work: any[], guards: any[], stops: any[], reds: Red[], refusal: Refusal|null}>}
 */
export async function prepareSigning({
  spec, workdir, seedRef = null, shellCapUsd, timeoutMs,
  seedFn = seedAtHead, listingFn = seedListing, seedReadFn = runSeedRead,
}) {
  /** @type {any} */
  const base = {
    ok: false, specHash: null, seedRef: null, work: [], guards: [], stops: [], reds: [], refusal: null,
    gates: { declaration: null, precheck: null, seedVerdict: null },
  };

  // ── gate 1a: the spec itself. A declared close that is not on a plan-shape
  // spec is not a close anyone can run.
  const jv = validateJob(spec, ...(shellCapUsd === undefined ? [] : [{ shellCapUsd }]));
  if (!jv.ok) {
    // scrubbed HERE, at the same boundary as the git channels below: these reds
    // echo the DECLARATION verbatim, and the `secret-literal` red the same sweep
    // raises beside them proves the shape is one the ONE inventory detects — a
    // sibling red that hands it through unmasked is the divergence that rule bans
    const reds = jv.reds.map(scrubRed);
    base.gates.declaration = { ok: false, grounded: false, reds };
    return { ...base, reds };
  }
  if (!isDeclaredClose(spec)) {
    const red = {
      code: 'invalid-value',
      path: 'closeDecl',
      detail: 'prepareSigning runs the authored close\'s gates — a spec carrying an operator-written command close has '
        + 'no declaration to ground, and its stages are signed as written',
    };
    base.gates.declaration = { ok: false, grounded: false, reds: [red] };
    return { ...base, reds: [red] };
  }

  let seed = seedRef;
  if (!isNonEmptyString(seed)) {
    const s = await seedFn(workdir);
    if (s.stop !== null) {
      // git's own stderr, scrubbed HERE — the emission boundary, exactly like the
      // gap lines below (M1 deliberately does not scrub; the caller does). This red
      // is persisted with the signing evidence, and a file that captures a key
      // captures it forever.
      const red = { code: 'seed-unreadable', path: 'seedRef', detail: redactSecrets(s.stop) };
      base.gates.declaration = { ok: false, grounded: false, reds: [red] };
      return { ...base, reds: [red] };
    }
    seed = s.seedRef;
  }
  base.seedRef = seed;

  // ── gate 1b: the declaration, GROUNDED. The listing is what makes hamr's path
  // rule and the scoped-job derivation real; without it both are deferred, and a
  // signature over a deferred gate signs something nobody checked.
  const listed = await listingFn(workdir, seed);
  if (listed.stop !== null) {
    // the other half of the same channel: `git ls-tree`'s stderr, scrubbed at the
    // same boundary and for the same reason
    const red = { code: 'listing-unreadable', path: 'closeDecl', detail: redactSecrets(listed.stop) };
    base.gates.declaration = { ok: false, grounded: false, reds: [red] };
    return { ...base, reds: [red] };
  }
  // the class rides from the SPEC (PRD v1.57 §2) — gate 1a already refused a spec
  // whose class is unknown or locked, so this is the class D5's battery hangs off
  const dv = validateCloseDecl(spec.closeDecl, { at: 'closeDecl', listing: listed.files, verdictType: spec.verdictType });
  // the grounded gate's reds quote BOTH untrusted sources — the declaration, and
  // the seed listing itself (the listing rule names what really sits beside an
  // invented path). The listing half is a channel gate 1a structurally cannot
  // cover: `validateJob` sweeps the SPEC, and a token-shaped FILENAME in the
  // patient's tree is not in it. Scrubbed on both exits — the gate record and the
  // returned reds are two copies of the same persisted evidence.
  const dvReds = dv.reds.map(scrubRed);
  base.gates.declaration = { ok: dv.ok, grounded: dv.grounded, reds: dvReds, scoped: dv.scoped };
  if (!dv.ok) return { ...base, reds: dvReds };

  // ── gates 2 + 3: one execution of EVERY stage at the seed.
  const seedTrees = makeSeedTrees();
  /** @type {any[]} */
  let rows;
  try {
    rows = await seedReadFn(
      { stages: spec.closeDecl.stages },
      { workdir, seedRef: seed, gapKeep: DECLARED_GAP_PREFIX, seedTrees, ...(timeoutMs === undefined ? {} : { timeoutMsDefault: timeoutMs }) },
    );
  } finally {
    await seedTrees.cleanup();
  }

  // the battery keys off the class the user picked (PRD v1.57 §2), and the spec
  // carries it — gate 1a already refused a spec whose class is unknown or locked
  const guardSet = new Set(guardNames(spec.closeDecl, spec.verdictType));
  const show = (/** @type {any} */ r) => ({
    stage: r.stage,
    kind: r.kind,
    verdict: r.verdict,
    value: r.value ?? null,
    baseline: r.baseline ?? null,
    baselineSource: r.baselineSource ?? null,
    guard: guardSet.has(r.stage),
    // the gap is what the user READS to decide whether the close measures their
    // job — scrubbed here, at the emission boundary, exactly like every other
    // close output (M1 deliberately does not scrub; the caller does)
    gap: (r.gapLines ?? []).map((/** @type {string} */ l) => redactSecrets(l)),
  });

  const stops = rows.filter((r) => r.verdict === 'instrument-stop').map(show);
  base.gates.precheck = {
    ok: stops.length === 0,
    stops: stops.map((s) => ({ stage: s.stage, gap: s.gap })),
  };
  if (stops.length) {
    const reds = stops.map((s) => ({
      code: 'broken-close',
      path: `closeDecl.stages.${s.stage}`,
      detail: s.gap.join('\n') || `stage "${s.stage}" rendered no judgment`,
    }));
    return {
      ...base,
      reds,
      stops,
      refusal: refuse({
        kind: 'decision-ready',
        verb: null,
        path: 'closeDecl',
        detail: `${stops.length} stage(s) of this close cannot run against the repository — a broken instrument is a `
          + 'casualty, never a verdict, so nothing it reported would be trustworthy.',
        options: [
          're-author the close against this repository',
          'fix the repository so the close\'s tools resolve (a missing toolchain reads as a broken instrument)',
          'abandon the job',
        ],
      }),
    };
  }

  const work = rows.filter((r) => !guardSet.has(r.stage)).map(show);
  const guards = rows.filter((r) => guardSet.has(r.stage)).map(show);
  const workRed = work.filter((r) => r.verdict === 'red');
  base.gates.seedVerdict = {
    ok: workRed.length > 0,
    redAtSeed: rows.filter((r) => r.verdict === 'red').map((r) => r.stage),
    greenAtSeed: rows.filter((r) => r.verdict === 'green').map((r) => r.stage),
    workRed: workRed.map((r) => r.stage),
  };

  // D9.3 — nothing red at seed means nothing to do. Round 2's arm B read GREEN
  // with value 0 because mypy died on an unrelated broken fixture and scanned
  // nothing: an instrument scanning nothing reads clean, which is F6's shape at
  // the close-authoring layer, and this gate is what refuses it BEFORE a
  // signature rather than after a paid run.
  if (!workRed.length) {
    return {
      ...base,
      work,
      guards,
      refusal: refuse({
        kind: 'decision-ready',
        verb: null,
        path: 'closeDecl',
        detail: 'No work stage of this close is RED at the seed, so the close already passes on the untouched '
          + 'repository: there is nothing for a run to do, and an instrument that measures nothing reads clean the '
          + 'same way one that measures correctly does.',
        options: [
          'check the close is measuring the right thing (a tool that scans nothing exits clean)',
          're-author the close from a sharper description of what is wrong today',
          'the job may already be done — abandon it',
        ],
      }),
    };
  }

  return {
    ...base,
    ok: true,
    // The hash is over the RESOLVED spec (MED-1), and the declaration is stored
    // ENUMERATED — every guard spelled out, every short-form parser expanded — so
    // there is no omittable-with-a-default field whose widening could change what
    // runs without changing what was signed (forward-compat point 3). D6 falls
    // out of that: re-authoring produces different bytes, a different hash, and
    // therefore a new signature.
    specHash: jobSpecHash(jv.job),
    work,
    guards,
  };
}
