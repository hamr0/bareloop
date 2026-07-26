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
export { ralph, runClose, CLOSE_FAULTS } from './ralph.js';
export { globToPrefix, scanSecrets } from './validate.js';
export { validateJob, jobSpecHash, checkApproval, CLOSE_TYPES, CLASS_BY_CLOSE, GOLD_COMPARE, CADENCE_UNITS, PROVIDERS, CONDITION_KEYS, TOOL_MENU, LOCKED_TOOLS, VERDICT_TYPES, LOCKED_VERDICTS } from './job.js';
// Layer 2: the plan-v1 validator — the agent-authored plan doc's gate; the
// two-doc split's third validator never happens (plan-v1 gates the PLAN, the
// job spec stays the arbiter's only home).
export { validatePlan, EXIT_TYPES, MAX_EXITS_PER_STEP, MAX_PLAN_STEPS, WRITE_VERBS } from './plan.js';
export { snapshotScope, evalExits } from './exits.js';
export { runPlan } from './planrun.js';
export { runJob } from './run.js';
export { classifyIncidents, foldLedger, ledgerDeltas, updateLedger, LEDGER_CLASSES } from './ledger.js';
