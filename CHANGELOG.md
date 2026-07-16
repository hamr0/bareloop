# Changelog

All notable changes to bareloop are documented here. Format:
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning:
[SemVer](https://semver.org/spec/v2.0.0.html). Pre-1.0: **minor** = a ladder rung or
feature lands, **patch** = docs, fixes, scaffolding.

## [Unreleased]

### Changed

- **Tool-mode attempt bound raised 24→40 rounds (F37).** The TESTGEN calibration curve
  measured that no prompt condition (bound undisclosed / disclosed / disclosed+pacing
  strategy) produced a graded one-shot at 24 rounds — the worker's read-first prelude
  eats the window — while one run proved a form-passing suite fits when writing starts
  by mid-attempt. The per-attempt cutoff and the Gate's run-wide `maxTurns` now derive
  from ONE hoisted `TURNS_PER_ATTEMPT` constant (they must agree or the enforced bound
  drifts from the advertised one).

### Added

- **F32 — worker-crash attribution: a close crash the worker caused is a gap, not a stop.**
  Battery pass 1 (F31) measured the gap: 4 of 7 rows whole-file-rewrote an orchestrator,
  broke imports, the close crashed under the judged floor, and the run **escalated** — the
  worker was never told "your edit crashed the suite", so no plant that needed a second
  attempt ever got one. F17's forbidden zone was built against instrument crashes and could
  not see worker-attributable ones. Now: a `crashed` verdict with worker writes on record
  routes as the DISTINCT verdict **`worker-crash`** (spine event with the file list), the
  gap tells the worker which files it wrote and to fix or revert, and the loop continues
  under the same caps. Attribution instrument: the gate audit's allow-decision write/edit
  lines, run_id-scoped, read through an injected `workerWrites` seam (`ralph` stays
  stdlib-only and dumb). Escalation is UNCHANGED for true instrument crashes: crash at
  precheck (structurally pre-worker) or crash with zero writes stays `close-crashed`, never
  retried; an unreadable audit attributes nothing (fail toward the old behavior). Validated
  against the real instrument (P3 rerun, sonnet, $0.77): all three crashes routed and fed
  back, zero escalations-eaten rows, honest `cap-halt` stop — pass 1's same plant died at
  attempt 1 with the worker never told. TDD, suite 292 → 299.
- **BA-13 consumed — the anchored edit verb (`bare-agent` 0.27.0 → 0.29.0).** `TOOL_MENU`
  gains **`edit`** (job-spec grantable; `run` stays locked), `TOOL_BY_VERB` maps it to
  `shell_edit` (anchored exact-once replace: BA-4 param guards, atomic rename, anchor-miss
  as a refusal RESULT so the worker re-anchors). Judged by the SAME `writeScope` fence as
  `write` (bareguard action type `'edit'`, already in its FS vocabulary); the F32
  attribution instrument counts edit actions as worker writes; the tool-mode persona
  carries the strategy (prefer the edit verb — F31: 4 of 5 big-file whole-writes broke the
  tree). The frozen battery spec pins its grant explicitly, so the menu widening does NOT
  change what the signed hash buys — granting `edit` to the battery is a new spec version.
  Suite 299 → 303.

### Fixed

- **F33 — two verb-blind reporting instruments (battery pass 2's audit).** Pass 2 ran
  7/7 attempt-1 green at $0.94 under the newly signed `edit`-granting spec — and the
  battery's printed table said `writes=0` on a pass whose every fix was one anchored edit:
  the collector counted only `write` actions, built before the `edit` verb existed and
  never re-audited when the menu widened (F32's lesson, re-learned at the reporting layer
  in the same session it was minted). `culpritRead` was equally blind to the retrieval
  channels: P5 greened with the culprit's body handed to it by the drafted config's
  `before-attempt` recall hook (`body: true` + litectx recency boost ranking the
  just-planted chunk into the hits) — invisible to an instrument that only saw gated
  reads. Fixed: the collector counts write AND edit as write-class; `culpritRead` sees
  every read-class channel; both recall emit sites (`ctx-tool`, `hook-op`) now carry
  `paths` so downstream instruments can see what reached the worker's context. The
  archived pass-2 results JSON keeps its wrong zeros; FINDINGS F33 is the corrected read.

- **F28 — the gap bound cut every failure line out of the worker's feedback.** The first
  real end-to-end firing of the N2 loop delivered a 1,927-char gap containing **zero**
  `not ok` lines: `ralph`'s `boundGap` keeps a head sample + elided middle + tail, and a
  large TAP suite (`npm test`, ~67KB) prints its failing tests in the *middle* — so the
  worker was told "5 fail" and never *which*, three attempts running, and never navigated to
  the culprit file. New optional **`close.gapKeep`** (job-spec, `predicate` only): a regex
  **source** whose matching close-output lines are preserved in a capped, clearly-delimited
  kept-failures block between head and tail — the failing-test NAMES reach the worker
  regardless of where they print. Hard-capped (50 lines / 8192 bytes, whichever binds) so a
  pathological close cannot rebuild the bloat; a trimmed block announces the trim (no silent
  truncation). Validated like `judged.pattern` (must compile as a RegExp, else a spec red
  before any tokens); **arbiter territory** — the drafted workflow config cannot express it.
  Also fixed the adjacent hazard: the gap now combines **both** streams (stdout + stderr), so
  a failure on stdout survives stderr noise (the old `err || out` returned stderr alone and
  lost it). `jobs/mailproof-fix.json` gains `"gapKeep": "^not ok"` (spec re-signed). Threaded
  spec → `runJob` → `interpret` → `ralph` parallel to `judged`. TDD, suite 281 → 291.

### Changed

- **Consume `bare-agent@0.27.0` — the N2 build gate (BA-4) is cleared.** 0.27.0 ("Provider
  Fidelity & Honest Termination") shipped the entire upstream ask queue this rung filed:
  BA-4, BA-5, BA-3, BA-6, BA-7, BA-1 (+ BA-10/BA-12). **BA-4** (`shell_write` truncating a
  file to zero bytes on absent `content`) was the hard N2-exit blocker — its four acceptance
  criteria are re-verified locally against the published tarball, so a write-granting tool
  mode can ship honestly. The tool-mode middle (`src/interpret.js`) is updated to the new
  contract: a **`truncated:max_tokens`** round (BA-6 — a round the API cut off, previously
  laundered into a clean `error:null` finish, F25) now escalates as **provider-red** (retry,
  the F11 transport class) instead of being scored as an empty attempt; **`loop.stop()`**'s
  new `error:null`+text return (BA-3/BA-5) let the `stoppedByBound` shim be **deleted** (it
  was dead under the new contract and could have swallowed a genuine halt); and
  **`cacheMessages: true`** (BA-1) is wired on the worker loop — the transcript cache the
  job #1 cost wall (F18: 754k full-price tokens, died at cap) needed. Regression test for
  the truncation path added (mutation-checked). Suite 280/280, typecheck clean.

- **Agent/IDE scratch gitignored and de-tracked.** `.gitignore` now default-denies every dot-directory (`.*/`), re-admitting only what ships (`.github/`). Per-machine agent/IDE state (`.claude/`, `.litectx/`, `.idea/`, …) regenerates locally and only added noise and churn; any already-committed copies are removed from tracking (local files kept on disk). Repo hygiene only.

### Added
- **N2 — the headless single-job loop (rung 3 of the ladder), modules 1–4 + 2b.**
  - **`runJob(spec, opts)`** (`src/run.js`): the runner — approval gate (human-signs-always,
    refuses before ANY token: `unapproved-spec`) → litectx known-answer smoke before tokens
    (`smoke-red`, adaptlearn A3) → config drafting through the PRICED path, one sealed shot
    + one redraft with reds fed back (`config-red` on a second red, zero grinding) →
    sequential per-step interpret loops under the ONE cumulative ledger (a step-red stops
    the job with attribution: `step-red:<id>`) → the hitl step opens a **draft PR
    deterministically** (branch → stage the job fence ONLY → commit → push →
    `gh pr create --draft`, through an injectable shell-owned exec seam — model tools never
    touch git; a failure is `pr-red` + the escalation still fires) and ends `escalated` by
    design, the PR URL riding the decision-ready escalation. New spine vocabulary:
    `job-start/end`, `step-start/end`, `primitive-smoke`, `draft-result`, `pr-opened`,
    `pr-red`.
  - **Tool-mode middle** (module 2b): `job-v1` steps gain `mode: "text"|"tools"` and
    `tools` (unique subset of `read|grep|write` — `TOOL_MENU`, frozen; requesting `run`
    reds: locked-but-listed, admission waits on request-red evidence). The SPEC owns the
    grant; the drafted config cannot express either. In tool mode the worker drives
    bare-agent's shell tools with every call policy-checked against the same fence
    (`actionTranslator` maps tool calls onto write/read actions; paths resolve exactly as
    the tools resolve them), reads pinned to the workdir (`readScope`), a denial streak
    stopping as `gate-red`. `STEP_MODES`/`TOOL_MENU` exported.
  - **`artifact-red` + fence-robust extraction** (module 3): ONE parser (`extractArtifact`)
    for every model-output parse — prose-wrapped and mid-text fences extract clean; a
    non-artifact response reds on its OWN axis, writes nothing, and the retry is told why
    (non-terminal, under ralph's cap). Text mode only — in tool mode the tools write
    directly and the close judges the tree (there is no response artifact to red).
  - **ralph options** (module 1): `closeTimeoutMs` (close wall-clock cap, was hardcoded
    120s) and the tail-biased gap bound (400 head + 1500 tail — the assertion diff lives
    at the end; head-only truncation fed the worker pure preamble).
  - **The upstream ledger** (module 4): `updateLedger({ledgerFile, spineFiles})`
    (`src/ledger.js`) folds run spines into ONE append-only incident JSONL — the
    A1/A2/A3 upstream-ask flow, mechanized: evidence in, human judgment out
    (`suggestedAsk` is a template seed, never an auto-file; status rows
    `filed → fixed → consumed` stay human-appended). Keys `lib:verb:class:sig` dedupe
    the same bug across runs (short hash of the path/number-normalized detail); rows
    are cumulative deltas, the fold is current state, and the collector is idempotent
    over the same corpus — the ledger is derived and reconstructible, spines stay
    ground truth. Classes worst-first (`LEDGER_CLASSES`, frozen): `silent-degradation`,
    `runtime-red`, `provider-red`, `pricing-red` (added vs the design doc — F6),
    `capability-gap` (ships dormant until in-loop admission), `broken-close`,
    `request-red`, `retention-red`, `config-red` (attributed to bareloop's own
    drafting schema). Excluded by doctrine: bare `cap-halt` (budget story),
    `close-verdict`/`artifact-red` (worker stories), `gate-red` (governance working
    as intended), `pr-red` (operator environment). Pure pieces exported:
    `classifyIncidents`, `foldLedger`, `ledgerDeltas`. Design record:
    `docs/plans/2026-07-11-upstream-ledger-design.md` + 2026-07-13 addendum (the
    bareloop event mapping). CLI lands at N5; the panel reads the same file at N6.
  - **Resume-to-cap: close-first skip** (module 4.5): every predicate step runs its
    close BEFORE any tokens (`close-precheck` on the spine, output scrubbed at capture
    like every close). Already-green skips the step for zero tokens as a DISTINCT
    record (`step-end` outcome `already-green`, never plain `green` — nothing was done,
    so it mints no learning credit and runs no on-green retention); a close that cannot
    RUN stops `broken-close` before any provider call. Config drafting is deferred to
    the first step that actually needs a worker (still one sealed shot + one redraft,
    always drafted fresh per run) — so the resume story is: a `cap-halt` stop is the
    checkpoint (the workdir + the closes), the human raises `budgetUsd` (new spec hash,
    re-sign) and reruns, finished steps skip in seconds, and a clean cadenced rerun
    costs ZERO provider calls. Design record: the 2026-07-13 addendum on
    `docs/plans/2026-07-12-n2-headless-loop-design.md`.
  - **The cadenced no-op is silent (F7).** A `hitl` step now checks the fence
    (`git status --porcelain -- <fence>`) before touching git: an affirmatively-clean
    fence emits `pr-skipped` + `step-end: already-green` and the job ends **green** —
    no PR, no escalation. (Before: a green-repo cadence opened a branch, and `git
    commit` correctly failed "nothing added to commit" → a broken-PR escalation every
    single day. A hitl close is a human decision point; with no changes there is no
    decision.) A FAILED check — not a repo, broken git — falls through to the PR path
    and reds honestly: an unknown fence state is never a green.
  - **The PR step hands the checkout back (F7).** The starting branch is read before
    anything moves and restored on every path, success or failure; a restore that fails
    is a loud `workdir-red` naming the stranded branch, and never un-opens a real PR.
    (Before: the workdir was left on `bareloop/<job>-<id>`, so the next cadenced run
    branched off the previous run's unmerged branch and judged its close against that
    state.) New spine vocabulary: `close-precheck`, `pr-skipped`, `workdir-red`;
    `step-end` gains the `already-green` outcome.

  - **Nine defects found by the first REAL-MODEL runs of job #1 (F8–F16)** — all fixed
    TDD-first, all invisible to a stubbed seam:
    - **`cwd` (F8):** `runClose` spawned the close with NO cwd, so a cwd-relative close
      (`npm test`) ran in the RUNNER's directory — the arbiter judged the wrong repository.
      `cwd` now threads runner → `ralph` → `spawnSync` (`ralph({cwd})`, `runClose(…, {cwd})`).
    - **Drafting ceiling (F9):** the prompt advertised the JOB budget while the validator
      enforced budget − drafting-spend — a bound the drafter was never told, so every real run
      (the model claims the ceiling it is given) deadlocked `config-red`. The shell now reserves
      its own drafting allowance and advertises `budget − reserve`: one number, advertised and
      enforced.
    - **Repository root (F10):** tool mode now tells the worker the absolute workdir. bare-agent's
      shell tools resolve relative paths against the PROCESS cwd, so a worker with no root is
      blind — the real one groped `/home/…`, the runner's dir, then `/`, and the fence denied it.
    - **`provider-red` in the worker path (F11):** a transport throw out of `loop.run()` (the real
      run: `read ENETUNREACH`) was filed `interpreter-red` ("fix the middle"). It is a provider
      failure — retry, don't debug.
    - **Per-round metering (F12):** the ledger accounted `worker-result`, emitted only after
      `loop.run()` RETURNS — so an attempt that HALTS reported nothing: the real run spent $1.4375
      and the ledger said $0.0048. Money is now metered per ROUND (`worker-round`, at
      `onLlmResult`), including the round that trips the cap. Unpriced is never free (F6).
    - **The close's current output (F13):** the precheck's gap now reaches the first attempt as the
      tree's state (never as "your previous attempt"). The `run` verb is locked, so without it the
      worker cannot see the failure it was hired to fix.
    - **The arbiter's books (F14):** tool mode denies reads of `gate-audit.jsonl`, `.smoke` and
      `.litectx` — the real worker read its own gate audit and spine. The agent does not author its
      arbiter, and does not read its records.
    - **The loop contract (F16):** the tool persona now tells the worker it is ONE attempt inside
      `while close-red and under-cap` and will be re-run with the close's verdict. Without it a
      model one-shots — the real run read for 12 rounds, never wrote, and ate the whole budget.
    - **Job #1's close (F15):** `node --test --test-reporter=dot`, not `npm test` — the tail-biased
      gap bound buries mid-stream failures in a 391-test TAP stream, so the worker was told "3
      failed" and nothing else. A close's output format is part of its contract with the worker.

### Changed
- **`job-v1`: requesting a locked tool is now a DISTINCT red.** `tools` containing
  `run` reds with code `request-red` (was a generic `invalid-value`) so the ledger can
  tally admission demand — a generic code buried the evidence as a typo. An unknown
  tool name stays `invalid-value`. `LOCKED_TOOLS` (frozen, `['run']`) exported.
- **`interpret` opts:** `target` is now optional (required in text mode only); new
  `mode`/`tools` opts thread the spec's grant. Additive — existing callers unchanged.
- **Cost contract:** `extractRules` returns `costUsd: number|null` — null is the honest
  "spend unknown" (F6); callers must not coerce it to 0.

### Fixed
- **Review round 2026-07-13 (8 confirmed findings, all execution-verified):**
  - **extractArtifact wrapper-vs-content gate:** a fence counts as the artifact's
    wrapper only when it opens within the first 5 lines of the response; a fence
    buried deeper inside an unfenced reply is the artifact's OWN content and the
    whole reply is the artifact, verbatim. Before: an unfenced doc-generator module
    containing a ```js example``` was silently truncated to the 2-line fragment
    with `red: null`, corrupting the close signal. Trade-off pinned in tests:
    past the window, prose + fence is treated as the artifact (rare under the
    no-fences persona); fence-heavy artifacts belong in tool mode.
  - **Secret-leak channel closed:** `openDraftPr` now scrubs git/gh subprocess output
    with the ONE shape inventory (`SECRET_PATTERNS`) at capture — a credentialed
    remote URL echoed by a failed `git push` never reaches `pr-red`/the escalation's
    `pr.error` on the append-only spine (same doctrine as the close path).
  - **Plan-shape spend is metered:** the job ledger accounts `worker-plan` events too
    (a separate `loop.run` whose metrics never fold into the implement call's) —
    plan calls now drain `spentUsd` and an unpriced plan call halts `pricing-red`.
  - **The spine never dangles:** a provider transport throw during drafting is a
    decision-ready **`provider-red`** terminal (new outcome + escalation category,
    classified by the ledger); an interpreter throw outside the loop (e.g. a broken
    gate audit path) escalates `interpreter-red` with a terminal `job-end`.
  - **Reds-before-tokens for the call, not just the spec:** a text-mode job invoked
    without `opts.target` is a `job-red` before ANY provider call (`interpret`
    throws a loud TypeError for direct callers); previously it burned a draft + a
    worker call, the gate default-allowed the absent path, and `writeFileSync`
    crashed as a misfiled interpreter-red.
  - **Whitespace-padded `close.cmd` reds** (`invalid-value`) — a leading space made
    `spawnSync('')` throw synchronously past every belt; the runner also trims
    before splitting (defense in depth). **`cap-halt` job outcome:** drafting spend
    that consumes the whole budget stops honestly (no paid redraft over a blown
    budget, no config-red blaming the drafter).
  - **One instrument for the F6 cost read:** `priceOf(result)` (`src/text.js`)
    replaces four hand-copied `metrics ? costUsd : (cost ?? null)` spellings;
    `REMEMBER_KINDS` is exported from the validator so the drafting prompt
    advertises the menu the validator enforces (no drift). `request-red` reds carry
    the locked verb as a **structured `verb` field** — the ledger keys on it (prose
    stays a legacy fallback). Stale "clamped by validation" JSDoc corrected (the
    validator REDS bounds; it never clamps).
- **Three silent $0 cost launderings (the F6 class) in shipped code:** `interpret`'s
  worker cost emit (`?? cost` chain), `extract.js`'s rules-path cost (`?? cost ?? 0`),
  and `extract.js`'s transport-throw path reporting unmeasured spend as `$0`. All now
  carry the honest null + `unpricedRounds`; `runJob` halts `pricing-red` on either
  signal (unpriced is never free — F6, PRD v1.8).

## [0.2.0] — 2026-07-12

### Added
- **N1 — the job/close schema (rung 2 of the ladder).** `validateJob` (`src/job.js`):
  the operator-owned `job-v1` spec — the arbiter's rulebook as pure declarative data
  (close chain, budget, outer write fence, environment label, escalation), validated
  reds-before-tokens with pinned `code:path` reds. The arbiter split is guarded from
  both sides by inexpressibility (workflow config can't say `close`/`provider`; job spec
  can't say `hooks`/`loop`/`memory`, minting claims, or the shell-owned retry cap).
  Close-authoring hierarchy (PRD §7) enforced as a class menu keyed by close type —
  verdict-class laundering (`rubric` claiming `hard`) is a named red `close-hierarchy`.
  `jobSpecHash` + `checkApproval`: the pure half of human-signs-always (sha256 over
  canonical JSON; an edited spec is unapproved by construction; the N2 runner enforces).
  Design record: `docs/plans/2026-07-12-n1-job-close-schema-design.md`; POC verdict: F4.
- **Two-layer write fence.** `validateConfig` accepts `jobWriteScope` (the job spec's
  operator-owned outer fence); every workflow scope must fit inside it — path-boundary
  aware (`src2` is not inside `src`) — or it reds `scope-escape`. Same containment law,
  same code, both layers (the F9 lesson).
- **Reserved spine vocabulary: `coordination-red`** (V7, PRD v1.7 #1) — documented in
  `bareloop.context.md`; no machinery until job #1 surfaces one.

### Changed
- **`validateConfig` returns `{ ok, reds, config }`** — the parsed config on ok, `null`
  on any red; kills the interpreter's double-parse (N2+ queue item absorbed). Additive
  for callers reading `ok`/`reds`.

### Fixed
- **Review hardening (post-build /code-review, 8 findings fixed + 6 sub-cap cleanups;
  all fixes negative-tested and mutation-checked, zero feature regressions):**
  cadence/escalation red unknown keys (the last smuggling level in a signed spec is
  closed); the `jobWriteScope` fence opt fails CLOSED — a malformed fence is its own
  `fence-invalid` red, never silently skipped, and each escaping scope reds at its own
  indexed path (`gate.writeScope.N`); scope normalization moved into the shared
  `globToPrefix` (leading `./`, interior `/./`, `//`, trailing `/` collapse) so a
  validateJob-green fence like `src/` no longer deadlocks contained workflow configs;
  `canon()` follows JSON semantics (undefined-valued keys dropped) so approvals survive
  a disk round-trip, and `checkApproval` never throws (non-JSON spec → `false`);
  `SECRET_RE` gained a left boundary (`flask-sqlalchemy` no longer reds) and the sweep
  is shared by BOTH validators — the agent-authored workflow config is now swept too;
  `interpret` accepts `jobWriteScope` and enforces the fence at the choke point (entry
  + revision candidates); revision candidates are judged and installed on their PARSED
  form (a JSON-string candidate no longer false-reds arbiter-touch); exported arbiter
  menus are frozen; `isObj`/`isNonEmptyString` single-copied in `validate.js`.
- **Second-round review (self-review of the hardening commit found a regression IT
  introduced — all fixes TDD'd, mutation-checked, zero feature regressions):**
  **critical containment escape** — the fence-normalization added to `globToPrefix`
  stripped a leading `./` before collapsing `//`, so `.//src/**` minted the ABSOLUTE
  prefix `/src`, validated green, and resolved outside the run directory at enforcement
  (design law #1); fixed by collapsing `//`+`/./` first (so `.//src/**` → `src`, safe),
  a belt in `scopeContained` rejecting any normalized-absolute prefix, and an enforcement
  belt in `interpret` that refuses to build a Gate whose resolved scope escapes the
  workdir. `canon()` now honors `toJSON` (a `Date` no longer hashes as `{}`; distinct
  values no longer collide) and `jobSpecHash` never throws (the minting path the runner
  calls directly is now crash-free on `BigInt`/cycles). `SECRET_RE` left boundary extended
  to `-`/`_` (`pipeline-sk-transform-utils-v2` no longer false-reds; real keys still red).
  `jobWriteScope: null`/`undefined` are the legitimate no-fence spellings (no more deadlock
  on every config); a malformed fence reds `fence-invalid` at path `jobWriteScope`, not the
  innocent workflow field (no ledger misattribution), with the detail bounded. Shared
  `legalScopeEntry` gives the scope-legality law one home across all three call sites.
- **Secrets never enter the spine (hard line), enforced at the source.** `runClose`
  (`src/ralph.js`) scrubs close-command output the moment it is captured, so a secret a
  checked command echoes (a 401 dumping a `Bearer …`/`sk-…` header) never reaches the
  append-only spine or the next worker prompt. The redactor is injected (the shell stays
  stdlib-only); `interpret` wires bareguard's exported `redact`. A benign gap is returned
  byte-identical — the failure still reaches the human, just without the token (design
  law #7 / V4 intact: the redactor is a fixed shell primitive, not an emergent component).
- `NOTICE` ships in the tarball (npm auto-includes LICENSE/README but not NOTICE; Apache-2.0
  wants both) — found validating the installed 0.1.0 artifact.
- **Release-gate review (fresh `/security` + `/diff-review` on the whole release diff;
  every finding execution-verified, every fix TDD'd):** the spine redactor now scrubs
  **every shape the validator reds** — bareguard's defaults cover only `Bearer`/`sk-`,
  so a git close echoing a `ghp_`/`github_pat_`/`AKIA`/`xox` token passed unredacted
  into the append-only spine (the most plausible leak for job #1, a GitHub PR workflow);
  `SECRET_PATTERNS` is now the one shape inventory shared by detection and redaction.
  `interpret` normalizes `workdir` once at entry — a trailing-slash or relative spelling
  made the enforcement belt false-red every legal scope — and the belt now treats a scope
  resolving to the run dir itself as escaped. `checkApproval` no longer routes through the
  un-hashable sentinel (two distinct un-hashable specs cross-approved each other; now
  un-hashable = unapproved). The secrets sweep tests object **keys**, not just values (a
  token could ride a key in a `gold` `expected` onto the spine through a green spec). A
  non-object `cadence` reds once at `cadence`, not twice at paths that don't exist.

## [0.1.0] — 2026-07-11

### Added
- **PRD addendum v1.5: the upstream ledger.** Auto-detected upstream fixes + user-facing
  workflow debugging, derived purely from the spines: 8 lib-incident classes (test reds
  and budget halts excluded by design — workflow stories never pollute the upstream
  queue), signature-deduped counts, append-only state-as-fold, human-appended fix
  lifecycle (the tool drafts, never files). Two audiences, one file: panel workflow
  health (N6) and the maintainer's pre-drafted UPSTREAM-ASKS queue. New admission
  obligation ~N2/N3: per-job known-answer `primitive-smoke` before tokens — the only
  detector for silently-degrading primitives (adaptlearn A3 class). Spec + reference
  implementation upstream in adaptlearn (validated: re-derived the menu-probe session's
  incidents, zero false positives from ~100 close reds).
- **F2 + PRD addendum v1.4: the menu probes return (adaptlearn F21/F22).** The v1.1 §4
  graduated-disclosure open question RESOLVED: the registry gate is met (menu axis
  wired-in; admission chain proven end-to-end) — the request-red registry builds ~N3/N4.
  Author selection is cargo-cult (zero need signal; picks are a superset of need); need
  reads off the ledger (within-run request-red frequency + outcome contrast); curation is
  evidence-driven, never appetite-driven. New doctrine: partial retrieval poisons gap
  attribution. N2 requirements filed: artifact-red category, fence-robust extraction.
- **N0 — the token-free rung (PRD §10).** The five spine modules, rewritten from the
  adaptlearn originals (graduation-is-a-rewrite): `src/spine.js` (append-only JSONL
  emitter; seq monotonic, ts last), `src/ralph.js` (the dumb shell: close exit code =
  truth, cap-halt its own category, decision-ready escalations), `src/validate.js`
  (schema v1 predicate — named reds before tokens; litectx-bound vocabulary; `diffPaths`
  one-knob checker), `src/interpret.js` (the only config reader; composes Gate + LiteCtx +
  Loop; mid-run revision seam with interpreter-owned acceptance; emits `config-final` —
  the run-as-executed record, design law #2), `src/extract.js` (rules distiller: one
  sealed shot, bounds enforced mechanically, rejected whole). 70 tests carried from
  adaptlearn's reference semantics, all hermetic and token-free (scripted stub providers).
  Rigging per LIBRARY_CONVENTIONS: tsconfig (checkJs + strictNullChecks), `typecheck` /
  `build:types` / `prepublishOnly` scripts, `.github/workflows/ci.yml`
  (typecheck → build:types → test, no lint). Deps: litectx ^0.28.0, bareguard ^0.12.0,
  bare-agent ^0.26.2. Code-review hardening (two rounds, all guards watch-it-fail
  validated): writeScope **containment reds** (no absolute/Windows paths, no ".."
  segments, not the run dir itself — a scope can never reach the arbiter's inputs,
  design law #1); **verb placement tightened** — each verb legal only in its one
  effective slot (recall/compress → before-attempt, stash → after-red, remember →
  on-green; an inert-but-listed op is a fake knob in the contrast evidence, law #3);
  **prototype-safe lookups** (`Object.hasOwn`) in the validator's param check and the
  shell's escalation decision map; **silent-red gap sentinel** (a close that exits
  nonzero with no output must not kill feedback/stall detection); spine **reserved-key
  guard** (type/seq/ts are the envelope's, by mechanism); shared **`globToPrefix`** and
  **`stripFences`** (`src/text.js` — one copy each, F9-class drift guards);
  `extractRules` **never throws** (provider transport errors degrade to a
  `provider-error` red as data); halt-as-return guard in `ask()` (bare-agent returns
  `{error: 'halt:…'}` rather than throwing — forward armor for N2's tool loops); honest
  cost emit (`metrics.costUsd ?? cost` — unpriced stays null, never a silent zero);
  **package entry point** — `src/index.js` + `main`/`types`/`exports` map per
  LIBRARY_CONVENTIONS §2 (the shipped `.d.ts` were previously unreferenced and the
  package unimportable); a `CategorizedError` typedef and a `RecallHit` typedef replace
  every `any`-cast (CLAUDE.md library-shape rule).
- **F1 in `docs/FINDINGS.md`:** first `npm install` as a suite consumer surfaced two
  upstream gaps (stale bare-agent peer range; GateDecision/Decision null-reason type
  drift) — both fixed upstream and consumed via bare-agent 0.26.2, per two-red routing.
  No shims.
- PRD **addendum v1.3** + CYBERNETICS.md O1–O5: the orchestration position — not a second
  runtime modality (credit attribution, accumulation, the arbiter — grounded in F15–F20);
  convergence path is orchestrate-first-encounter → crystallize via run-as-executed
  inheritance; admission only by pre-registered probe.
- PRD **addendum v1.2**: the menu-breadth (graduated-disclosure) probe is assigned to
  adaptlearn (successor-POC track, F19/F20 style) and returns to bareloop as findings;
  the registry-gating separation requirement is unchanged.
- PRD locked at **v1** (2026-07-11) after the bloat audit: §6→§9 open-questions dedup,
  §4 secrets-never-enter-the-spine invariant, §5 mobile-responsive mandate. Amendments
  from here are dated addenda, never rewrites.
- PRD **addendum v1.1** (post-lock interview + adaptlearn cross-check): panel layout and
  web-CLI command bar; full five-package primitive disclosure with the **two-red routing
  rule** (locked-but-exists → in-loop registry admission; missing/broken → fix baresuite
  and consume, never a local shim); **graduated-disclosure** open question pre-registered
  with M3 discipline (minimal-menu vs +1-extra contrast must separate before the
  request-red registry is built) — verified never exercised in adaptlearn.
- Panel spec — **PRD Appendix A** (provisional; briefly `PANEL.md`, folded into the PRD
  same day — one product doc): two panes (left chat + command bar speaking the exact
  headless-CLI verbs; right progress/cost/step over results cards); primitive menu
  grouped under recall / compress / stash / remember (provisional); context-graph third
  view reserved (consumes litectx `ContextGraph` + the spine); mobile stacks; headless
  first.
- `.github/workflows/publish.yml` — npm trusted publishing (OIDC, no token), manual
  dispatch, idempotent, asserts registry end-state.
- `bareloop.context.md` — adopter contract per LIBRARY_CONVENTIONS §3 (draft; API
  sections fill in as rungs land). `LICENSE` + `NOTICE` (Apache-2.0, matching the suite;
  corrects the 0.0.1 placeholder's MIT declaration).
- README rewritten in the bareagent shape: banner, badges, agent-first quick start,
  layers/verdict tables, science table, ladder roadmap, ecosystem section.

### Changed
- `docs/UPSTREAM-ASKS.md` repurposed: upstream-gap **fix queue** only (we own baresuite —
  fix-and-consume, version bump; request-red admissions resolve in-loop and never land
  here).
- Repo hygiene per LIBRARY_CONVENTIONS §7: `.claude/`, `.litectx/`, `.idea/` ignored and
  de-tracked; `CLAUDE.md` stays tracked as the agent-doctrine file.
- `package.json` takes the library shape: `"type": "module"`, Node `>=20` (bareguard's
  floor governs), `files` ships `src/` + `types/` + the doc set (paths land at N0);
  repository/homepage links to GitHub.

## [0.0.1] — 2026-07-11

### Added
- **Repo cut** from the adaptlearn seed per the close-out plan (adaptlearn archived and
  closed at v0.11.1 — the science behind this product).
- **Named `bareloop`** (working dir renamed from the `looped` placeholder; `looped` and
  `reloop` verified squatted on npm). Name reserved: `bareloop@0.0.1` published to npm —
  README + package.json only, no code.
- Seed docs: PRD (named, v0.2 at the time), design record
  `docs/plans/2026-07-10-agentic-automation-successor-design.md` with the naming
  resolution annotated, adaptlearn FINDINGS F1–F20 + CYBERNETICS.md carried as closed
  records in `docs/00-context/`.
- Scaffold: `CLAUDE.md`, fresh `docs/FINDINGS.md` (numbering starts at F1),
  `docs/UPSTREAM-ASKS.md`, guardrails pre-tool hook (local), `.gitignore`.
- Public GitHub repo `hamr0/bareloop`, `main` branch.

[0.2.0]: https://github.com/hamr0/bareloop/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/hamr0/bareloop/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/hamr0/bareloop/releases/tag/v0.0.1
