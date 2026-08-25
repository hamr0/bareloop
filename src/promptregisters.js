// THE PROMPT REGISTER INVENTORY — build-list item 5 (PRD TODO #8), Q9 answered
// (hamr, 2026-08-25): "a check". A commit that changes a prompt register must
// say, in its message, the failure that caused the change, what it addresses,
// and what it corrects — doctrine already stated once ("a frozen rule without
// a wired detector is prose", docs/product/2026-08-23-agreed-build-list.md:187-189)
// so convention-only was rejected. This module is the ONE place that inventory
// lives: `scripts/prompt-commit-check.mjs` reads it to decide which commits the
// rule applies to, and this file's own doc-comment is where a human reads it.
//
// The inventory is FILE-scoped, not const-scoped. Several of the files below
// hold more than one named prompt const, and at least two (authorscout.js,
// cardauthor.js) also build a model-facing prompt INLINE inside a function
// (template literals, not a top-level const) rather than assembling one from a
// named export. A const-scoped check would silently miss those; a file-scoped
// one does not, because the whole file is in scope once it appears here. The
// `name` field on each entry is documentation only — grepped to the byte range
// that motivated it — and carries no weight in `isPromptFile`.
//
// Verified against source 2026-08-25 (grepped for exported/module-level string
// consts that read as model-facing instruction text, and separately for inline
// template-literal prompts built inside a function). Files checked and found to
// carry NO prompt content: src/plan.js, src/validate.js, src/kinds.js,
// src/text.js, src/declaredclose.js, src/calibrate.js, src/index.js (the last
// is the barrel export only).

/**
 * One entry in the prompt-register inventory: a file known to carry
 * model-facing prompt/instruction text, and the name(s) that live there for a
 * human reading this file. `name` may point at a named const OR at a function
 * that builds a prompt inline (e.g. `scoutPrompt()`) — the check only ever
 * keys on `file`.
 * @typedef {{file: string, name: string}} PromptRegisterEntry
 */

/** @type {ReadonlyArray<PromptRegisterEntry>} */
export const PROMPT_REGISTERS = Object.freeze([
  // src/authorscout.js — the read-only repo-survey scout that opens authoring
  Object.freeze({ file: 'src/authorscout.js', name: 'SCOUT_SYSTEM' }),
  Object.freeze({ file: 'src/authorscout.js', name: 'SCOUT_RECOVERY_PROMPT' }),
  Object.freeze({ file: 'src/authorscout.js', name: 'scoutPrompt() (inline template, not a const)' }),

  // src/authorflow.js — the declaration-authoring turn (system + revise/re-ask)
  Object.freeze({ file: 'src/authorflow.js', name: 'AUTHOR_SYSTEM' }),
  Object.freeze({ file: 'src/authorflow.js', name: 'REVISE_INSTRUCTION' }),
  Object.freeze({ file: 'src/authorflow.js', name: 'STRUCTURE_INSTRUCTION_TOOL' }),
  Object.freeze({ file: 'src/authorflow.js', name: 'STRUCTURE_INSTRUCTION_TEXT' }),

  // src/judged.js — the softgreen judge's locate prompt (spine + per-rule asks)
  Object.freeze({ file: 'src/judged.js', name: 'PROMPT_HEAD' }),
  Object.freeze({ file: 'src/judged.js', name: 'PROMPT_TAIL' }),
  Object.freeze({ file: 'src/judged.js', name: 'JUDGE_RULES[*].ask (per-rule fragments)' }),
  Object.freeze({ file: 'src/judged.js', name: 'locatePrompt() (inline template, not a const)' }),

  // src/cardauthor.js — compiles a person's own words into a judged rubric
  Object.freeze({ file: 'src/cardauthor.js', name: 'COMPILE_SYSTEM' }),
  Object.freeze({ file: 'src/cardauthor.js', name: 'cardCasesPrompt() (inline template, not a const)' }),

  // src/readshim.js — the capped/deduplicating read shim's worker-facing strategy
  Object.freeze({ file: 'src/readshim.js', name: 'READ_SHIM_STRATEGY' }),
  Object.freeze({ file: 'src/readshim.js', name: 'READ_SHIM_DIFF_STRATEGY' }),

  // src/tools.js — the worker tool menu: personas, retrieval/edit/component strategy
  Object.freeze({ file: 'src/tools.js', name: 'PERSONA_TOOLS' }),
  Object.freeze({ file: 'src/tools.js', name: 'RETRIEVAL_STRATEGY' }),
  Object.freeze({ file: 'src/tools.js', name: 'EDIT_STRATEGY' }),
  Object.freeze({ file: 'src/tools.js', name: 'COMPONENT_STRATEGIES' }),
  Object.freeze({ file: 'src/tools.js', name: 'strategyFor() (assembles per-grant strategy prose)' }),
  Object.freeze({ file: 'src/tools.js', name: 'LINE_SPACE (module-private, not exported)' }),
  Object.freeze({ file: 'src/tools.js', name: 'PERSONA (module-private, not exported, currently unreferenced)' }),

  // src/planrun.js — the native-surface read-truncation strategy line
  Object.freeze({ file: 'src/planrun.js', name: 'NATIVE_READ_STRATEGY' }),
]);

/** The distinct file paths carrying prompt registers, repo-root-relative with
 * forward slashes — derived from `PROMPT_REGISTERS` so the set can never drift
 * from the entries above. @type {ReadonlySet<string>} */
const PROMPT_FILES = new Set(PROMPT_REGISTERS.map((e) => e.file));

/**
 * True when `path` names one of the inventoried prompt-register files. Accepts
 * either a repo-root-relative path (`src/tools.js`) or an absolute/relative
 * path ending in one (`/home/x/bareloop/src/tools.js`, `./src/tools.js`) — git
 * hands the check root-relative paths, but a caller working from an absolute
 * path should not have to strip the prefix itself.
 * @param {string} path
 * @returns {boolean}
 */
export function isPromptFile(path) {
  if (typeof path !== 'string' || path === '') return false;
  const normalized = path.replace(/\\/g, '/');
  return [...PROMPT_FILES].some((f) => normalized === f || normalized.endsWith(`/${f}`));
}
