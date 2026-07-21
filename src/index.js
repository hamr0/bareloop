// bareloop public surface — grows one rung at a time (PRD §10). N0: the
// token-free spine. The five modules compose bottom-up: makeSpine feeds ralph,
// interpret is the only config reader, extractRules distills a green run.
// N1: the operator-owned job spec (job-v1) — validateJob is validate.js's
// sibling (never an extension); jobSpecHash/checkApproval are the pure half
// of human-signs-always (the N2 runner enforces).
// N2: runJob — the runner: approval gate → primitive smoke → sealed priced
// draft → sequential per-step loops under the ONE ledger (unpriced is never
// free, F6) → the hitl step is the decision-ready escalation. Module 4: the
// upstream ledger — spines fold into one append-only incident file; filing
// stays human (suggestedAsk is a seed, never an auto-file).

export { makeSpine } from './spine.js';
// CLOSE_FAULTS/scanSecrets: bareloop.context.md documents both as public API —
// the exports make the adopter contract true (release review 2026-07-19; the
// exports map admits only ".", so a deep import cannot reach them).
export { ralph, runClose, CLOSE_FAULTS } from './ralph.js';
export { validateConfig, diffPaths, globToPrefix, scanSecrets, LOOP_SHAPES, SLOTS, VERBS } from './validate.js';
export { validateJob, jobSpecHash, checkApproval, CLOSE_TYPES, CLASSES, CLASS_BY_CLOSE, GOLD_COMPARE, CADENCE_UNITS, PROVIDERS, CONDITION_KEYS, STEP_MODES, TOOL_MENU, LOCKED_TOOLS, VERDICT_TYPES, LOCKED_VERDICTS } from './job.js';
// Layer 2: the plan-v1 validator — the agent-authored plan doc's gate; the
// two-doc split's third validator never happens (plan-v1 gates the PLAN, the
// job spec stays the arbiter's only home).
export { validatePlan, EXIT_TYPES, MAX_EXITS_PER_STEP, MAX_PLAN_STEPS, WRITE_VERBS } from './plan.js';
export { snapshotScope, evalExits } from './exits.js';
export { interpret, STALL_REDS } from './interpret.js';
export { extractRules, MAX_RULES, MAX_RULE_CHARS } from './extract.js';
export { runJob } from './run.js';
export { classifyIncidents, foldLedger, ledgerDeltas, updateLedger, LEDGER_CLASSES } from './ledger.js';
