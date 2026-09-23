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
// them exactly 8 characters from `[a-z0-9]`, no exception found. Originally
// `{6,12}` (hamr's own margin around that measured 8) — tightened here to the
// measured shape itself after a PR #23 review flagged the margin as loose
// enough to accept plain prose ("run failed" is 6 lowercase letters, which
// satisfied `{6,12}` outright). A per-id DIGIT requirement was also proposed
// in that review and explicitly rejected: re-measuring the same archive found
// 23 of 130 sampled real ids carry no digit at all (`msdsmkid` among them —
// cited by name throughout `tests/replay.test.js` as a real archived run), so
// a digit requirement would reject genuine citations the check exists to
// require, not just prose.
const RUN_REF_RE = /\brun\s+(u-)?[a-z0-9]{8}\b/i;

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
 * `promptFileDiffs` is optional and keyed by path (only meaningful for a path
 * `isPromptFileFn` matches): the {old,new,diff} text triple the no-prompt-text
 * exemption below needs, resolved via git by `scripts/prompt-commit-check.mjs`
 * — this module never spawns git itself. A file absent from the map, or any
 * one of its three fields being `null` (git could not resolve it — no parent,
 * file didn't exist yet, etc.), is treated exactly like "not exempt".
 * @typedef {{sha: string, message: string, files: string[],
 *   promptFileDiffs?: Record<string, {oldText: string|null, newText: string|null, diffText: string|null}>}} PromptCommitInput
 */

// --- hamr's narrow exemption (2026-09-23, his own word, this turn) --------
//
// The base rule above assumes every commit touching a prompt-register FILE
// changed the model-facing prompt TEXT that file carries — true for every
// case the rule was built against, but false for a real one: commit 565fb99
// widened one JSDoc `@param` type annotation in `src/planrun.js` (a
// registered file, `NATIVE_READ_STRATEGY`) to fix a `strictNullChecks`
// error tsc found; it changed zero characters of any prompt string. No run
// caused that edit — a typechecker did — so no honest `Failure: run
// <id>` line could ever exist for it, and the file-granular rule (by
// design: PROMPT_REGISTERS is file-scoped, not const-scoped, because a
// const-scoped check would miss the inline template-literal prompts several
// of these files also build — see src/promptregisters.js's own header) has
// no way to see that the CHANGE, as opposed to the FILE, carries no prompt
// text.
//
// The exemption: a commit is exempt from the three labels + run citation
// ONLY when, for EVERY prompt-register file it touches, EVERY line the diff
// changed (removed, checked against the OLD file; added, checked against the
// NEW file) is "prose-only" — see `classifyProseOnlyLines` below. Every
// prompt register in this codebase is assembled from a string or template
// literal (never from a comment — src/promptregisters.js documents the
// const- and inline-template shapes; none of them is a `//` or `/* */`
// comment), so a line that is ENTIRELY comment/whitespace, by construction,
// can never be part of a value PROMPT_REGISTERS points at. This is decided
// by actually scanning the real file text a real diff touched — never by
// reading the commit message, never by a path/filename guess, never by
// asking a model.
//
// Fails closed by construction, not merely by intent: `fileChangeIsProseOnly`
// returns `false` (not exempt) the instant ANY of oldText/newText/diffText is
// `null` (diff unresolved — e.g. the file had no parent version, or git
// otherwise couldn't produce it), the instant the diff resolves to ZERO
// changed lines (nothing was positively proven prose-only), or the instant a
// single changed line is not classified prose-only. There is no path by
// which an unresolved or ambiguous read becomes a pass.

/**
 * Classify every line of `text` as prose-only (`true`) or as carrying real
 * code/string/template content (`false`) — a minimal, deliberately
 * conservative comment scanner, not a JS parser. A line is prose-only when
 * EVERY character on it is whitespace, or part of a `//` line comment, or
 * part of a `/* ... *\/` block comment. Tracks `//`, `/* *\/`, single- and
 * double-quoted strings, and backtick template literals; an escaped quote or
 * backtick (`\'`, `\"`, `` \` ``) never ends its string/template early.
 *
 * A template literal's `${...}` interpolation is deliberately NOT re-entered
 * as code — the whole span from an opening backtick to its closing backtick
 * is treated as one non-comment region. That is intentionally the unsafe
 * direction for MISSING an exemption (a line inside an interpolation could,
 * in principle, be prose-only code) but the SAFE direction for the one thing
 * this function must never do: a markdown-style bullet line (`* like this`)
 * written INSIDE a template literal's actual prompt text must never be
 * misread as a JSDoc continuation line. Because the whole template span is
 * already "not comment", that risk cannot materialize here.
 * @param {string} text
 * @returns {boolean[]} one entry per line of `text.split('\n')`
 */
export function classifyProseOnlyLines(text) {
  const lines = text.split('\n');
  const result = new Array(lines.length).fill(true);
  /** @type {'code'|'linecomment'|'blockcomment'|'single'|'double'|'template'} */
  let state = 'code';
  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li];
    if (state === 'linecomment') state = 'code'; // a `//` comment never spans a newline
    let hasNonComment = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      const next = line[i + 1];
      if (state === 'code') {
        if (ch === '/' && next === '/') { state = 'linecomment'; i += 1; continue; }
        if (ch === '/' && next === '*') { state = 'blockcomment'; i += 1; continue; }
        if (ch === "'") { state = 'single'; hasNonComment = true; continue; }
        if (ch === '"') { state = 'double'; hasNonComment = true; continue; }
        if (ch === '`') { state = 'template'; hasNonComment = true; continue; }
        if (!/\s/.test(ch)) hasNonComment = true;
        continue;
      }
      if (state === 'linecomment') continue; // rest of the line is comment
      if (state === 'blockcomment') {
        if (ch === '*' && next === '/') { state = 'code'; i += 1; }
        continue;
      }
      // single / double / template: every character here is non-comment
      // content, including the delimiters themselves.
      hasNonComment = true;
      if (ch === '\\') { i += 1; continue; } // an escaped char never closes the string
      if (state === 'single' && ch === "'") { state = 'code'; continue; }
      if (state === 'double' && ch === '"') { state = 'code'; continue; }
      if (state === 'template' && ch === '`') { state = 'code'; continue; }
    }
    result[li] = !hasNonComment;
  }
  return result;
}

/**
 * Parse a `git diff -U0` patch's hunk headers (`@@ -a[,b] +c[,d] @@`) into the
 * old-file and new-file line numbers it touches. Pure text parsing, no git —
 * the caller resolves the diff text via git and hands it in. Zero context
 * (`-U0`) means every line a hunk lists IS a changed line, so only the hunk
 * headers (which carry start line + count) are needed; the `-`/`+` body
 * lines themselves are never inspected. Git omits an explicit `,count` when
 * it is exactly 1.
 * @param {string} diffText
 * @returns {{oldLines: number[], newLines: number[]}}
 */
export function parseChangedLineNumbers(diffText) {
  /** @type {number[]} */
  const oldLines = [];
  /** @type {number[]} */
  const newLines = [];
  const hunkRe = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
  let m = hunkRe.exec(diffText);
  while (m !== null) {
    const oldStart = Number(m[1]);
    const oldCount = m[2] === undefined ? 1 : Number(m[2]);
    const newStart = Number(m[3]);
    const newCount = m[4] === undefined ? 1 : Number(m[4]);
    for (let i = 0; i < oldCount; i += 1) oldLines.push(oldStart + i);
    for (let i = 0; i < newCount; i += 1) newLines.push(newStart + i);
    m = hunkRe.exec(diffText);
  }
  return { oldLines, newLines };
}

/**
 * Does ONE prompt-register file's change in a commit carry no model-facing
 * prompt text? True only when every changed line (per `parseChangedLineNumbers`)
 * classifies as prose-only (per `classifyProseOnlyLines`) against the
 * relevant file version. See the exemption doc-comment above for the fail-
 * closed reasoning: any `null` input, or zero changed lines resolved, is
 * "not exempt", never "exempt by default".
 * @param {string|null} oldText
 * @param {string|null} newText
 * @param {string|null} diffText
 * @returns {boolean}
 */
export function fileChangeIsProseOnly(oldText, newText, diffText) {
  if (oldText === null || newText === null || diffText === null) return false;
  const { oldLines, newLines } = parseChangedLineNumbers(diffText);
  if (oldLines.length === 0 && newLines.length === 0) return false;
  const oldClass = classifyProseOnlyLines(oldText);
  const newClass = classifyProseOnlyLines(newText);
  for (const ln of oldLines) {
    if (oldClass[ln - 1] !== true) return false;
  }
  for (const ln of newLines) {
    if (newClass[ln - 1] !== true) return false;
  }
  return true;
}

/**
 * Evaluate a set of commits against the prompt-register rule. A commit whose
 * `files` list touches none of the inventoried prompt-register files (per
 * `isPromptFileFn`) is passed WITHOUT inspecting its message — the rule never
 * applies to it. A commit that DOES touch one or more, but for which every
 * touched file's change is proven prose-only (see `fileChangeIsProseOnly`),
 * is also passed without inspecting its message — hamr's 2026-09-23
 * exemption. Any other commit touching a prompt-register file is checked
 * exactly as before.
 * @param {PromptCommitInput[]} commits
 * @param {(path: string) => boolean} isPromptFileFn
 * @returns {{ok: boolean, offenders: {sha: string, missing: string[]}[]}}
 */
export function evaluateCommits(commits, isPromptFileFn) {
  /** @type {{sha: string, missing: string[]}[]} */
  const offenders = [];
  for (const commit of commits) {
    const touchedPromptFiles = Array.isArray(commit.files) ? commit.files.filter((f) => isPromptFileFn(f)) : [];
    if (touchedPromptFiles.length === 0) continue;
    const exempt = touchedPromptFiles.every((f) => {
      const d = commit.promptFileDiffs && commit.promptFileDiffs[f];
      if (d === undefined) return false;
      return fileChangeIsProseOnly(d.oldText, d.newText, d.diffText);
    });
    if (exempt) continue;
    const { ok, missing } = validateCommitMessage(commit.message);
    if (!ok) offenders.push({ sha: commit.sha, missing });
  }
  return { ok: offenders.length === 0, offenders };
}
