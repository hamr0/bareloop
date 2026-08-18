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
// `ACCOUNTED_ROUND_TYPES` rides with it: the round records the ONE ledger sums.
// A runner reconstructing a killed run's spend (the resume fold) must add exactly
// these and nothing else, and a second hand-kept list is how a paid call comes to
// be free (`judge-round` — the close's own spend — joined at softgreen module 2).
export { runJob, ACCOUNTED_ROUND_TYPES } from './run.js';
// Layer 3 — the REUSE registry (bridge-v1) and D3's display half. The registry is a
// directory of plain files at an OPERATOR-supplied path (never a default location), the
// load gate is the code half of D2's split, and `renderListing`/`selectionPrompt` are
// pure text: they send nothing, parse nothing and decide nothing. The selection CALL and
// the pin/shortlist/force-cold flow are the adopter's, which is why the pieces they need
// are exported rather than kept internal to the runner.
//
// Softgreen module 6 exports the QUARANTINE surface with them: a judged green is minted
// HELD and earns nothing until the signer's `accept` at the review door releases it
// (PRD v1.71 §3). `recordDoor` is the pure half (record the disposition, release
// forward-only) and `reuseEligibility`/`newestEligibleVersion` are what every consumer
// asks before starting from a stored plan.
export {
  BRIDGE_SCHEMA, validateBridge, deriveStatus, listingRow, loadGate,
  mintBridge, appendGreen, appendRed,
  loadBridge, loadRegistry, saveBridge, makeRegistry, registryExists,
  QUARANTINED_VERDICTS, quarantinesCredit, newestEligibleVersion, reuseEligibility, recordDoor,
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
// `applyDoorDecision` is the registry half of the REVIEW DOOR (softgreen module 6): the
// door opens AFTER a run has ended, so a person's answer cannot ride the run's own return
// path — the runner calls this with the runid it printed at the door.
export { validateEnvelope, resolveTrySpec, resolveReuse, reuseSpecHash, selectBridge, runReuse, REUSE_GRADED_RED, readResume, resumeTreeGate, CHECKPOINT_OUTCOMES, PAUSE_TTL_MS, checkpointAgeGate, applyDoorDecision } from './reuse.js';
export { classifyIncidents, foldLedger, ledgerDeltas, updateLedger, LEDGER_CLASSES } from './ledger.js';
// THE WORK BRANCH (PRD v1.57 §3). `workBranchName` is exported so an operator runner can
// SHOW, before the approval gate, which branch the run will work on — the same reason the
// resolved per-try hash is printed there: a bound the human is agreeing to should not be
// discovered from the spine afterwards. `prepareWorkBranch` rides with it because a
// runner that resumes reads the branch off the dead spine and may want to verify it is
// still there before spending anything. The runner applies the rule itself either way —
// neither export is a way to opt out of it.
export { workBranchName, prepareWorkBranch, WORK_BRANCH_PREFIX, WORK_BRANCH_RE } from './workbranch.js';
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
  // N4 slice 1 — the hitl surface an adopting runner needs: the three doors, the
  // gate that reads a signer's answer (and refuses an empty one), and the seed
  // exemption ruling 8 states.
  HUMAN_DECISIONS, SEED_EXEMPT_KINDS, normalizeHumanRuling, resolveHumanRuling,
  // SOFTGREEN module 2 — the judged stage's own arbiter-owned bounds. An adopter
  // wiring `judgeProvider` needs both numbers to reason about what a judged close
  // can cost: one paid call per artifact, at most one retry each.
  JUDGE_ATTEMPTS, MAX_JUDGED_PATHS,
  // SOFTGREEN module 8 — the REVIEW DOOR's vocabulary: the record type a run
  // writes when it ends at the door, which terminals open one, which classes open
  // one unasked, and the mechanical-only rule an `accept` re-proves against.
  REVIEW_DOOR, DOOR_OPEN_OUTCOMES, REVIEW_DOOR_CLASSES, doorOpens, mechanicalStages,
} from './kinds.js';
// SOFTGREEN module 8 — the door's ANSWERING half. A run OPENS the door on its own
// spine and ends; a person answers minutes or days later, from another process, so
// the answer cannot ride the run's return path. `answerReviewDoor` is that seam:
// it re-proves the tree for an `accept`, releases a held judged green through
// module 6's registry half, and refuses an expired door under the same 60-day TTL a
// hitl checkpoint keeps. It never returns, writes or implies a verdict.
export { answerReviewDoor, doorRecordOf, doorAgeGate } from './reviewdoor.js';
// SOFTGREEN module 1 — the judged floor's core. The pieces an adopter (and an
// integrating UI) genuinely needs: the PIN (`JUDGE_MODEL` — what a wired judge
// provider must be bound to, and a bump of which forces recalibration), the
// rulebook a card SELECTS from, the card gate, and the two halves themselves so a
// calibration harness can grade the whole pipe without running a close.
// `defaultJudgeLoop` is the one spelling of how this repo drives a judge; the
// runner reaches it through `runPlan`'s `judgeProvider`, and it is exported so a
// caller building its own harness does not spell a second one.
export {
  JUDGE_MODEL, JUDGE_MAX_TOKENS, JUDGE_RULES, JUDGE_RULE_IDS, LOCATE_AXES, LOCATE_LABEL,
  validateCard, validateFacts, locatePrompt, runLocate, decide, defaultJudgeLoop,
  // SOFTGREEN module 4 — what a legal SIGNED calibration set is. The SIZE is
  // hamr's own ruling and a size change is a spec-level threshold change;
  // `expectedOf` is the ONE reduction of a `decide()` result to the shape a case
  // stores, so a calibration harness compares one shape rather than two.
  CALIBRATION_SIZE, CASE_VERDICTS, validateCalibrationSet, validateJudgedArtifacts, expectedOf,
} from './judged.js';
// SOFTGREEN module 4 — the COMPILE. Q6 becomes the rubric card and Q7 becomes the
// frozen calibration set, both on the D5 shown-and-fixed path: the LLM proposes
// through `proposeJudgedArtifacts`, an integrating UI shows the proposal, the
// SIGNER's fix goes through `signJudgedArtifacts`, and `foldJudgedArtifacts`
// enumerates both into the closeDecl — where the spec hash covers them, so a card
// line or a case is a re-sign like every other spec edit.
export {
  proposeJudgedArtifacts, signJudgedArtifacts, foldJudgedArtifacts,
  proposalSchema, proposalTool, cardCasesPrompt,
  PROPOSAL_TOOL_NAME, PROPOSAL_LABEL, MAX_PROPOSAL_RETRIES, COMPILE_SYSTEM,
} from './cardauthor.js';
// SOFTGREEN module 5 — THE CALIBRATION GATE. `runCalibration` grades the whole
// pipe (locate + decide) over the signed ten and the five arbiter-owned injection
// artifacts; `prepareSigning` runs it and refuses on anything short of all of
// them. Exported because an integrating UI has to be able to RUN and RENDER the
// gate — the graded rows are what a signer reads before giving a signature — and
// because the battery is evidence a reader may want to inspect rather than take
// on trust. `INJECTION_LOCATE_BATTERY` and `INJECTION_CARD` are ARBITER-OWNED
// constants: no signer authors them and nothing stores them in a spec.
export {
  runCalibration, compareExpectation, factsResist, artifactHash,
  INJECTION_LOCATE_BATTERY, INJECTION_CARD, CALIBRATION_LABEL, CASUALTY_AXES,
} from './calibrate.js';
// M2 — what a declaration may SAY, and whether one said it legally. The
// catalogue and the genre are DATA an integrating UI renders (the kind menu, the
// guard batteries it must show the user under D5 and cannot let them remove).
export {
  validateDeclaration, normalizeDeclaration, KIND_CATALOGUE, CATALOGUE_KINDS, CATALOGUE_LIVE_KINDS,
  LOCKED_KINDS, TYPES_GENRE, TYPES_GENRE_TEMPLATE, GENRE_LANGUAGES, genreEnv, genreOwnedEnvNames,
  // how the genre's own tools PRINT — genre property for the same reason the
  // suppression battery is (2026-08-09, run msmbpjk6)
  genreInstruments,
  DIRECTIONS, BASELINES, MAX_STAGES,
  // the verdict-class surface (PRD v1.57 §1–§2): the radio's own menu, the guard
  // battery keyed off it, and the ceiling that makes the pick a promise
  VERDICT_CLASSES, LOCKED_CLASSES, LIVE_CLASSES, CLASS_BATTERIES, classGuards, classMenu, closeCeiling,
  // ruling 5 as data: the kinds no agent may ever be offered as an in-run ruler
  NEVER_OFFERED_KINDS,
} from './authoring.js';
// M3 — the looking half and the writing half. `authorClose` is the grounded
// loop; `runAuthorScout`/`buildSeedListing` are exported because a caller that
// already paid for a survey passes it back in rather than buying a second one.
export {
  runAuthorScout, buildSeedListing, seedFileList, classifySurvey, AUTHOR_SCOUT_VERBS,
  // the malformed-class retry ladder: the hardcoded ceiling, the typed causes it
  // reads, and the closed set of causes that may fire it (2026-08-09, PRD v1.58)
  SCOUT_ATTEMPTS, SURVEY_CAUSES, SCOUT_RETRY_CAUSES,
} from './authorscout.js';
/** the ONE scrubbed-persist boundary for a model's raw output, and its announced
 * bound — exported because every future writer of a raw must reach for this one
 * rather than spell a second scrub (PRD v1.58) */
export { scrubRaw, RAW_PERSIST_MAX, RAW_TRIM_MARKER } from './text.js';
export {
  authorClose, authorPrompt, declarationSchema, makeLoopGenerate, MAX_REVISIONS,
  QUESTION_SETS, GREEN_QUESTIONS, SOFTGREEN_QUESTIONS, CLASS_STATEMENTS, questionsFor, requiredAnswersFor,
} from './authorflow.js';
// M4a — the runtime bridge. `validateCloseDecl` is the spec-level gate (the job
// validator's own branch calls it); `runDeclaredStages` is the executor seam a
// runner other than `runPlan` would need; `closeStagesOf` is the ONE staging
// every close consumer reads, widened to both fields.
export {
  validateCloseDecl, runDeclaredStages, declaredStages, isDeclaredClose, guardNames, closeGrade,
  DECLARED_GENRES, DECLARED_GAP_PREFIX, DECLARED_GAP_KEEP, DECLARED_CLOSE_CLASSES, CLOSE_DECL_FIELDS,
  HUMAN_PAUSE, HITL_PAUSE, HITL_DECISION_RED, HUMAN_CHECKPOINTS,
} from './declaredclose.js';
export { closeStagesOf } from './plan.js';
// M4b — the interview, the refusal, the composition, and D9's three gates.
// `prepareSigning` returns the resolved spec's HASH and the seed evidence; it
// never signs — the approvals array and the human's word are unchanged.
export {
  runInterview, authorCloseForJob, assembleSpec, prepareSigning, refusalEvents, refuseLockedKind,
  GENRE, REFUSAL_LIB, REFUSAL_CATEGORY, AUTHORED_SPEC_FIELDS,
} from './authorjob.js';
