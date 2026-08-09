// bareloop public surface — grows one rung at a time (PRD §10). The modules
// compose bottom-up: makeSpine feeds ralph, ralph is the wheel every layer is
// made of, and runJob is the one entry.
// The operator-owned job spec (job-v1) is the arbiter's rulebook — validateJob
// and validatePlan are siblings, never extensions of each other; jobSpecHash /
// checkApproval are the pure half of human-signs-always (the runner enforces).
// runJob: approval gate → primitive smoke → the plan flow under the ONE ledger
// (unpriced is never free, F6). The upstream ledger folds spines into one
// append-only incident file; filing stays human (suggestedAsk is a seed, never
// an auto-file).
//
// The config-v1 exports (`validateConfig`, `interpret`, `extractRules`,
// `diffPaths`, `LOOP_SHAPES`, `SLOTS`, `VERBS`, `STALL_REDS`, `CLASSES`,
// `STEP_MODES`) were REMOVED 2026-07-26 with the operator-authored steps[] path
// (PRD v1.32) — a breaking change, and the reason for the version bump.

export { makeSpine } from './spine.js';
// CLOSE_FAULTS/scanSecrets: bareloop.context.md documents both as public API —
// the exports make the adopter contract true (release review 2026-07-19; the
// exports map admits only ".", so a deep import cannot reach them).
// runStages/checkMenu/STORE_VERBS: same reason, one rung later (review 2026-07-30)
// — the CHANGELOG announces runStages async beside runClose and STORE_VERBS beside
// the exported WRITE_VERBS, and bareloop.context.md points adopters at checkMenu by
// name. Documented-but-unexported is a false contract; the additions are additive.
export { ralph, runClose, runStages, CLOSE_FAULTS } from './ralph.js';
export { globToPrefix, scanSecrets } from './validate.js';
export { validateJob, jobSpecHash, checkApproval, checkMenu, CLOSE_TYPES, CLASS_BY_CLOSE, GOLD_COMPARE, CADENCE_UNITS, PROVIDERS, CONDITION_KEYS, TOOL_MENU, LOCKED_TOOLS, STORE_VERBS, VERDICT_TYPES, LOCKED_VERDICTS } from './job.js';
// Layer 2: the plan-v1 validator — the agent-authored plan doc's gate; the
// two-doc split's third validator never happens (plan-v1 gates the PLAN, the
// job spec stays the arbiter's only home).
export { validatePlan, stageClose, EXIT_TYPES, MAX_EXITS_PER_STEP, MAX_PLAN_STEPS, WRITE_VERBS } from './plan.js';
export { snapshotScope, evalExits } from './exits.js';
export { runPlan } from './planrun.js';
export { runJob } from './run.js';
// Layer 3 — the REUSE registry (bridge-v1) and D3's display half. The registry is a
// directory of plain files at an OPERATOR-supplied path (never a default location), the
// load gate is the code half of D2's split, and `renderListing`/`selectionPrompt` are
// pure text: they send nothing, parse nothing and decide nothing. The selection CALL and
// the pin/shortlist/force-cold flow are the adopter's, which is why the pieces they need
// are exported rather than kept internal to the runner.
export {
  BRIDGE_SCHEMA, validateBridge, deriveStatus, listingRow, loadGate,
  mintBridge, appendGreen, appendRed,
  loadBridge, loadRegistry, saveBridge, makeRegistry, registryExists,
} from './bridges.js';
export { renderListing, selectionPrompt } from './selection.js';
// Layer 3 modules 4+5 — the D7 envelope and the reuse runner. `runReuse` composes
// `runJob` under an operator-signed envelope (three explicit numbers, tighten-only) and
// is the only thing in the library that WRITES the registry — minting is a graded
// green's privilege (R1), never a caller's. `validateEnvelope`/`resolveTrySpec` are
// exported because an operator runner has to show the resolved per-try spec's HASH at
// its approval gate: a tightened envelope is a new spec version, and the human signs it.
// `resolveReuse`/`reuseSpecHash` are the pair that gate must actually PRINT: the try
// count multiplies the worst case, so a signature over the per-try spec alone leaves it
// unsigned — a runner showing `jobSpecHash(resolveTrySpec(...))` prints the same hash for
// 0 tries and for 9.
// Module C (resume after a kill) exports its two operator-side halves for the same
// reason: `readResume` is what turns a dead run's spine back into the state a resume
// continues from (which tries completed, which one restarts, on what remainder), and
// `resumeTreeGate` is the ruling that a resumed patient is continued dirty and never
// reset. Both are read by a runner BEFORE the approval gate, so neither can live behind
// `runReuse`'s own entry.
export { validateEnvelope, resolveTrySpec, resolveReuse, reuseSpecHash, selectBridge, runReuse, REUSE_GRADED_RED, readResume, resumeTreeGate } from './reuse.js';
export { classifyIncidents, foldLedger, ledgerDeltas, updateLedger, LEDGER_CLASSES } from './ledger.js';
// ── CLOSE AUTHORING v1 (gate 4) — the user declares what done means ──────────
// The public surface is settled ONCE, here, at M4 (M2's header flagged the
// naming collision and deferred it rather than exporting piecemeal).
//
// THE COLLISION, resolved: the kind executor's grading entry is exported as
// `runDeclaredClose`, and ralph's shipped `runClose(argv, redact, opts)` keeps
// its name. Two reasons, in order. (1) `runClose` is a DOCUMENTED adopter
// contract — it is in bareloop.context.md and in the exports map — and renaming
// a shipped function to make room for a new one is a breaking change bought for
// nothing. (2) The new name says what actually differs: one runs a DECLARATION,
// the other an argv. `runDeclaredClose` / `runDeclaredStages` / `runStages` read
// as a family, which is what they are.
//
// M1 — the kind executor. A runner needs `runStage`/`seedRead` to build its own
// gate (that is what `prepareSigning` does with them), and `seedAtHead` because
// D8's seed is READ at run start rather than typed into a spec.
export {
  runDeclaredClose, runStage, seedRead, seedAtHead, seedListing, changedSet, makeSeedTrees,
  LIVE_KINDS, STOP_FAULTS, JUDGED_MARKER, EXIT_GREEN, EXIT_RED, EXIT_STOP,
} from './kinds.js';
// M2 — what a declaration may SAY, and whether one said it legally. The
// catalogue and the genre are DATA an integrating UI renders (the kind menu, the
// guard batteries it must show the user under D5 and cannot let them remove).
export {
  validateDeclaration, normalizeDeclaration, KIND_CATALOGUE, CATALOGUE_KINDS, CATALOGUE_LIVE_KINDS,
  LOCKED_KINDS, TYPES_GENRE, TYPES_GENRE_TEMPLATE, GENRE_LANGUAGES, genreEnv, genreOwnedEnvNames,
  DIRECTIONS, BASELINES, MAX_STAGES,
  // the verdict-class surface (PRD v1.57 §1–§2): the radio's own menu, the guard
  // battery keyed off it, and the ceiling that makes the pick a promise
  VERDICT_CLASSES, LOCKED_CLASSES, LIVE_CLASSES, CLASS_BATTERIES, classGuards, closeCeiling,
} from './authoring.js';
// M3 — the looking half and the writing half. `authorClose` is the grounded
// loop; `runAuthorScout`/`buildSeedListing` are exported because a caller that
// already paid for a survey passes it back in rather than buying a second one.
export { runAuthorScout, buildSeedListing, seedFileList, classifySurvey, AUTHOR_SCOUT_VERBS } from './authorscout.js';
export {
  authorClose, authorPrompt, declarationSchema, makeLoopGenerate, MAX_REVISIONS,
  QUESTION_SETS, GREEN_QUESTIONS, CLASS_STATEMENTS, questionsFor, requiredAnswersFor,
} from './authorflow.js';
// M4a — the runtime bridge. `validateCloseDecl` is the spec-level gate (the job
// validator's own branch calls it); `runDeclaredStages` is the executor seam a
// runner other than `runPlan` would need; `closeStagesOf` is the ONE staging
// every close consumer reads, widened to both fields.
export {
  validateCloseDecl, runDeclaredStages, declaredStages, isDeclaredClose, guardNames, closeGrade,
  DECLARED_GENRES, DECLARED_GAP_PREFIX, DECLARED_GAP_KEEP, DECLARED_CLOSE_CLASSES, CLOSE_DECL_FIELDS,
} from './declaredclose.js';
export { closeStagesOf } from './plan.js';
// M4b — the interview, the refusal, the composition, and D9's three gates.
// `prepareSigning` returns the resolved spec's HASH and the seed evidence; it
// never signs — the approvals array and the human's word are unchanged.
export {
  runInterview, authorCloseForJob, assembleSpec, prepareSigning, refusalEvents, refuseLockedKind,
  GENRE, REFUSAL_LIB, REFUSAL_CATEGORY,
} from './authorjob.js';
