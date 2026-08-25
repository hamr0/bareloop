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

// hamr's addition (2026-08-25, same day as the base rule): the `Failure:`
// line must also cite the RUN that caused the change — a prompt-register
// commit ties to "a" failure but never to the archived spine record a human
// (or `replayRun`) could go read, without one. Alphabet/length MEASURED
// against every real archived id, not assumed: `ls
// ~/PycharmProjects/bareloop-patients/*/*.jsonl` lists 263 spine-shaped
// filenames; stripping the `-gate-audit.jsonl` sidecars and the `.jsonl.lag`
// lag sidecars leaves 231 real spine ids across every prefix this repo uses
// (`u-`, `battery-A1-`, `l2accept-L1-`, `reuse-`, `job2-`, ...) — EVERY one of
// them exactly 8 characters from `[a-z0-9]`, no exception found. `{6,12}` is
// hamr's own margin around that measured 8, not a guess made here.
const RUN_REF_RE = /\brun\s+(u-)?[a-z0-9]{6,12}\b/i;

/** The exact message a `Failure:` line without a run reference fails with —
 * hamr's own wording, so the CLI and the tests never restate it differently. */
export const FAILURE_NEEDS_RUN_REF = 'Failure: must cite the run that caused the change (e.g. "Failure: run mszcthk1 — ...")';

/**
 * Does `message` carry all three required labelled lines, each with non-empty
 * text after the label, on the SAME line? A label matched case-insensitively
 * at line start (`^label:`), anywhere in the message. When `Failure:` is
 * present and non-empty, its own line's text must ALSO cite at least one run
 * (`run <id>` or `run u-<id>`, case-insensitive; multiple refs are fine) —
 * FORMAT ONLY: this never verifies the cited run's spine file exists, because
 * a run's patient lives outside this repo and is unreachable from a
 * commit-message check.
 * @param {string} message
 * @returns {{ok: boolean, missing: string[]}} `missing` lists every label
 *   that is absent/empty (bare label name), plus `FAILURE_NEEDS_RUN_REF`
 *   verbatim when Failure is present but cites no run
 */
export function validateCommitMessage(message) {
  const msg = typeof message === 'string' ? message : '';
  const lines = msg.split('\n');
  /** @type {string[]} */
  const missing = [];
  /** @type {string|null} the FIRST satisfying Failure line's text, for the run-ref check */
  let failureLineText = null;
  for (const label of PROMPT_COMMIT_LABELS) {
    const re = new RegExp(`^${label}:\\s*(.*)$`, 'i');
    let satisfied = false;
    for (const line of lines) {
      const m = re.exec(line);
      if (m !== null && m[1].trim() !== '') {
        satisfied = true;
        if (label === 'Failure' && failureLineText === null) failureLineText = m[1];
      }
    }
    if (!satisfied) missing.push(label);
  }
  if (failureLineText !== null && !RUN_REF_RE.test(failureLineText)) {
    missing.push(FAILURE_NEEDS_RUN_REF);
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
