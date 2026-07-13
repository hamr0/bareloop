// bareloop public surface — grows one rung at a time (PRD §10). N0: the
// token-free spine. The five modules compose bottom-up: makeSpine feeds ralph,
// interpret is the only config reader, extractRules distills a green run.
// N1: the operator-owned job spec (job-v1) — validateJob is validate.js's
// sibling (never an extension); jobSpecHash/checkApproval are the pure half
// of human-signs-always (the N2 runner enforces).
// N2: runJob — the runner: approval gate → primitive smoke → sealed priced
// draft → sequential per-step loops under the ONE ledger (unpriced is never
// free, F6) → the hitl step is the decision-ready escalation.

export { makeSpine } from './spine.js';
export { ralph, runClose } from './ralph.js';
export { validateConfig, diffPaths, globToPrefix, LOOP_SHAPES, SLOTS, VERBS } from './validate.js';
export { validateJob, jobSpecHash, checkApproval, CLOSE_TYPES, CLASSES, CLASS_BY_CLOSE, GOLD_COMPARE, CADENCE_UNITS, PROVIDERS, CONDITION_KEYS, STEP_MODES, TOOL_MENU } from './job.js';
export { interpret, STALL_REDS } from './interpret.js';
export { extractRules, MAX_RULES, MAX_RULE_CHARS } from './extract.js';
export { runJob } from './run.js';
