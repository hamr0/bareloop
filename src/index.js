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
export { validateEnvelope, resolveTrySpec, resolveReuse, reuseSpecHash, selectBridge, runReuse, REUSE_GRADED_RED } from './reuse.js';
export { classifyIncidents, foldLedger, ledgerDeltas, updateLedger, LEDGER_CLASSES } from './ledger.js';
