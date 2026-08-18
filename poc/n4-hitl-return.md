# N4 slice-1 POC — THE RETURN (evidence note)

**Ran 2026-08-13, branch `n4-verdict-classes`, $0** (no network, no key, no paid provider).
Spec: `docs/02-features/2026-08-13-n4-verdict-classes-build.md` §1.8. Code: `poc/n4-hitl-return.mjs`.
Reproduce: `node poc/n4-hitl-return.mjs` (add `--diff` to print the two shims verbatim).

**Result: 67/67 expectations met.** The riskiest assumption HOLDS — a human's end-of-run
`rerun <text>` routes through the existing close-fix-loop machinery unchanged, and the run
genuinely continues under a folded wallet on an unbilled clock.

## What was actually run

Real `runJob` → `runPlan` → `ralph` → the real Gate / Loop / LiteCtx, the real
`readResume` / `resumeTreeGate` / `deriveStatus` / `redactSecrets` / `boundGap` / `scanSecrets`.
Nothing was reimplemented. The worker is `tests/helpers.js`'s `scriptedProvider`; the patient
is a throwaway git repo the POC creates (one seed commit, real work branch); the close is two
real spawned commands — `artifact-exists` (mechanical) then `human-review` (`offer:false`).

Leg 1 runs cold to the human stage and pauses. The spine is then written through a
virtual clock, **45 simulated days pass**, and each of the three doors is resumed from an
independent `cp -a` fork of the paused patient + spine.

## The five assertions

| | claim | verdict |
|---|---|---|
| (a) | the human's text reaches the fix worker through the same seam `post.gap` uses, bounded and scrubbed | **PASS** |
| (b) | the fix loop runs ≥1 iteration under `remainingUsd()` folded from the paused leg | **PASS** (with a should-differ control) |
| (c) | the wall folds ONLY the paused leg's own elapsed | **PASS** (plus the §1.6 hazard, measured) |
| (d) | `accept` mints green without paying a worker round; OPEN-3's mechanical re-run happens | **PASS**, with one naming finding |
| (e) | `cancel` is terminal — no gap, no continuation, never demotes | **PASS** |
| 4 | the pause lands AFTER the plan's steps; the resumed leg re-enters at the close/fix loop | **CONFIRMED, not assumed** |
| NEG | `rerun` with the text dropped must not silently re-run | **DEFECT MEASURED**, guard shown refusing |

Details worth keeping:

- **(a)** the fix worker's ask opens with the exact existing sentence *"The verification's
  output on the tree as it stands (not an attempt of yours):"* followed by
  `close stage "human-review" failed:` and the human's own words. §1.5's "the human is the
  gap author is literal, and needs no new channel" is confirmed on the real seam.
  A `xoxb-…` token planted in the human's text — proven a real secret shape by the repo's own
  `scanSecrets` first — never reaches the worker; the >6KB text is elided by `boundGap`, and
  the human's third instruction, buried in the elided middle, survives via `gapKeep`.
- **(b)** the resumed leg emits `scout-skipped{phase:'close'}`, one `step-skipped`, **no
  `step-start`**, one `fix-loop`, and greens. `job-start` declares `priorSpentUsd`, and the
  final `job-end` total exceeds the paused leg's. **Control** (byte-identical script, only the
  fold changed to the full budget): `cap-halt`, the write never lands, `money-halt` emitted.
  Measured en route: the money axis binds at the first **gated action**, not at the first
  round (bareguard halts on `check()`; an LLM round is a `record`), so exactly one round is
  bought before the halt.
- **(c)** `restart.priorWallMs` equals the paused leg's own elapsed **exactly** (seconds), and
  `RESUME_WALL_MS = WALL_MS − priorWallMs` (run-u's own arithmetic) returns nearly the whole
  signed wall. **The §1.6 hazard is real and measured:** feeding `deathAt` = the resume moment
  (what a stale watchdog report does) makes `priorWallMs` = elapsed + 45 days and
  `RESUME_WALL_MS` = 0 — the resumed leg doomed before it starts.
- **(d)** accept buys zero worker rounds (a provider that throws on any call was used, and it
  was never called), records none, and leaves `spentUsd` exactly where the pause left it.
  **OPEN-3 is satisfied by machinery that already exists**: the resumed leg's close PRECHECK
  re-runs every mechanical stage on the current tree at $0 before anything is minted — the
  spine shows `artifact-exists:satisfied, human-review:satisfied`. The control (the artifact
  deleted during the pause) reds at `artifact-exists` and mints nothing.
- **(e)** cancel returns its own terminal with `gap: null`, no `fix-loop`, no worker round,
  `spendComplete: true`. `deriveStatus` (real) keeps a `proven` bridge proven across a
  `hitl-cancel` and a `hitl-pause` row, and demotes on the literal `red` control —
  `REUSE_GRADED_RED` is `['escalated']`, so neither name demotes.

## The POC can fail (pre-flight, run)

- Disarming SHIM 1's exit-code comparison (pause branch never taken) → **8 targeted failures**,
  starting at `leg 1 terminal is the distinct pause`.
- Changing the human stage's `gapKeep` to a non-matching pattern → **1 targeted failure**,
  exactly the "gapKeep carried the buried HUMAN lines" assertion.
- The scrub assertion carries its own positive control (`scanSecrets(HUMAN_TEXT) === [TOKEN]`),
  so "no secret in the prompt" cannot pass vacuously.
- One harness confound was found and fixed rather than reported: the first version of the
  (b) control scripted a TEXT-ONLY worker and read "3 rounds bought on an empty wallet". That
  was the harness, not the product — a worker that never reaches for a tool is never gated on
  money. The control now runs the identical tool-calling script as its twin.

## The shims (= the build items)

Both live in a runtime copy of `src/planrun.js` under `poc/.n4-shim/` (deleted on exit);
`src/` and `tests/` are untouched. `src/run.js` is copied with **no semantic change** — only
its `./planrun.js` import repointed.

1. **SHIM 1 — the pause branch.** `runPlan` §4 has no seam between the close verdict and the
   fix loop: `satisfied` → green, a `CLOSE_FAULTS` verdict → `close-red`, **anything else →
   the fix loop**. The shim adds a third branch that emits a decision-ready `hitl-pause`
   record (stage + every mechanical stage's result), calls `planExecuted()` and returns a
   distinct terminal. Its stand-in signal is the human stage's exit code; in the build the
   signal is §1.3's fifth `StageResult` verdict from the `human-confirms` kind.
2. **SHIM 2 — the cancel branch**, at the same seam, returning a terminal with an explicit
   `gap: null`.

Everything else the POC exercises needed **no shim at all**: the resume, the fold, the wall
arithmetic, the gap channel, the scrub, the bound, the branch carry-forward and the demotion
rules are all shipped machinery.
