// bareloop public surface — grows one rung at a time (PRD §10). N0: the
// token-free spine. The five modules compose bottom-up: makeSpine feeds ralph,
// interpret is the only config reader, extractRules distills a green run.

export { makeSpine } from './spine.js';
export { ralph, runClose } from './ralph.js';
export { validateConfig, diffPaths, globToPrefix, LOOP_SHAPES, SLOTS, VERBS } from './validate.js';
export { interpret, STALL_REDS } from './interpret.js';
export { extractRules, MAX_RULES, MAX_RULE_CHARS } from './extract.js';
