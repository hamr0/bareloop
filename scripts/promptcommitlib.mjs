// PRD build-list item 5 (TODO #8) — the pure decision logic behind
// `scripts/prompt-commit-check.mjs`, split out so `tests/promptcommit.test.js`
// can exercise it directly (real inputs in, real verdicts out) without
// shelling out to git — no tmp repo, no fixture commits, no process spawn.
// This is a `scripts/` module, not a `src/` one: it is repo-local dev tooling
// (a local commit-message gate), never part of the published library surface
// — `scripts/` is not in package.json's `files`, so nothing here ships.
//
// Doctrine this file exists to satisfy (docs/product/2026-08-23-agreed-build-list.md
// :187-189): "a frozen rule without a wired detector is prose" — Q9 (hamr,
// 2026-08-25) answered "a check", so this is enforcement, not convention.

/** The three labels a prompt-register commit message must carry, in the order
 * the brief states them: what failure caused the change, what it addresses,
 * what it corrects. @type {ReadonlyArray<string>} */
export const PROMPT_COMMIT_LABELS = Object.freeze(['Failure', 'Addresses', 'Corrects']);

/**
 * Does `message` carry all three required labelled lines, each with non-empty
 * text after the label, on the SAME line? A label matched case-insensitively
 * at line start (`^label:`), anywhere in the message.
 * @param {string} message
 * @returns {{ok: boolean, missing: string[]}} `missing` names every label
 *   that is either absent entirely or present with empty trailing text
 */
export function validateCommitMessage(message) {
  const msg = typeof message === 'string' ? message : '';
  const lines = msg.split('\n');
  /** @type {string[]} */
  const missing = [];
  for (const label of PROMPT_COMMIT_LABELS) {
    const re = new RegExp(`^${label}:\\s*(.*)$`, 'i');
    const satisfied = lines.some((line) => {
      const m = re.exec(line);
      return m !== null && m[1].trim() !== '';
    });
    if (!satisfied) missing.push(label);
  }
  return { ok: missing.length === 0, missing };
}

/**
 * One commit as the checker needs it — already resolved, never re-derived
 * from git inside the pure path. `sha` is a display label only (a real commit
 * hash in `--range` mode, `'(staged)'` for the commit-msg-hook mode).
 * @typedef {{sha: string, message: string, files: string[]}} PromptCommitInput
 */

/**
 * Evaluate a set of commits against the prompt-register rule. A commit whose
 * `files` list touches none of the inventoried prompt-register files (per
 * `isPromptFileFn`) is passed WITHOUT inspecting its message — the rule never
 * applies to it.
 * @param {PromptCommitInput[]} commits
 * @param {(path: string) => boolean} isPromptFileFn
 * @returns {{ok: boolean, offenders: {sha: string, missing: string[]}[]}}
 */
export function evaluateCommits(commits, isPromptFileFn) {
  /** @type {{sha: string, missing: string[]}[]} */
  const offenders = [];
  for (const commit of commits) {
    const touchesPromptFile = Array.isArray(commit.files) && commit.files.some((f) => isPromptFileFn(f));
    if (!touchesPromptFile) continue;
    const { ok, missing } = validateCommitMessage(commit.message);
    if (!ok) offenders.push({ sha: commit.sha, missing });
  }
  return { ok: offenders.length === 0, offenders };
}
