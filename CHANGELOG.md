# Changelog

All notable changes to bareloop are documented here. Format:
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning:
[SemVer](https://semver.org/spec/v2.0.0.html). Pre-1.0: **minor** = a ladder rung or
feature lands, **patch** = docs, fixes, scaffolding.

## [Unreleased]

### Added

- **Worker model name in the signed spec (build-list #3)**: `job-v1` gains an optional
  `model` field — a non-empty string naming the exact worker provider model id. Absent,
  behaviour is unchanged (the runner's own default); present, it is part of the signed
  spec hash and `scripts/run-u.mjs` runs the job on that model. A `--model <tier>` flag
  naming a different model is refused (`resolveWorkerModel`, `src/job.js`) rather than
  silently overridden — the spec always wins. Worker only; the judge model stays
  library-pinned pending recalibration.

## [0.16.0] — 2026-08-30

### Added

- **`PROMPT_COMMIT_RANGE` covers every commit of a direct push (PRD #2b, #8)**:
  `scripts/prompt-commit-check.mjs` now honours an env var of that name (`--range` mode
  only — a commit-msg hook's `--message-file` path is never redirected by a stray env
  var), which supersedes `--range` and needs no `HEAD~1` fallback of its own.
  `.github/workflows/ci.yml`'s `npm test` step sets it to `github.event.before..sha` on
  push events, so a linear multi-commit direct push to `main` is inspected whole instead
  of the local `HEAD~1..HEAD` fallback re-covering only the last commit. An unresolvable
  env range (a 40-zero `github.event.before` on a brand-new branch push) is reported and
  falls back to the `--range` arg's own path, including its existing main-push fallback.
  Same option-shaped-value guard as `--range` (a value starting with `-` is refused before
  it reaches `git`). Premise measured on `origin/main`'s own reflog (two 3-commit linear
  pushes on 2026-08-24, one carrying a prompt-register change the `HEAD~1` fallback would
  have skipped); 3 new CLI tests, each proven failing before the fix. **CI-proven
  2026-08-30**: a branch-birth push (40-zero `before`) fell back and checked 5 commits
  (CI run 33314883771); the next push used the real range `7e975b3..f0c3199` and checked
  exactly 1 (run 33314899690).
- **Green-class runs mint a registry row, born released** (PRD open item #16,
  `src/reuse.js`'s `writeRunGreenRow`): the fourth refusal (`credit-not-held`) is dropped —
  a mechanical `green` run now mints its registry row at run end exactly like `soft-green`
  does, but unheld: `greenParts` already keys the hold on `quarantinesCredit(verdictType)`
  (`src/bridges.js:372`), so no bridge/door code changed. `door accept` on an unheld green
  row records the disposition and releases nothing — it no longer dies `no-row-for-run`;
  that terminal is reserved for a run that truly earned no row. `scripts/run-u.mjs`'s
  registry line now prints `HELD`/`RELEASED` by class instead of `HELD` unconditionally,
  and its door credit readout distinguishes a genuine release from a repeat `accept` on an
  already-released row (`recordDoor` returns `released: false` on a same-decision repeat —
  the wording now branches on `quarantinesCredit(spec.verdictType)` rather than claiming a
  fresh release every time). 4 new/updated tests (2 proven failing before the fix),
  including a soft-green regression guard (still born `HELD`) and the still-refusing
  no-row-for-run case.

### Changed

- **`bareloop.context.md` leads with the shipped design** (PRD #14): the header states the
  v0.15.0 contract first — `green` + `soft-green`, the judged floor and calibration gate,
  the review door (`accept`/`rerun`/`pause`) that never changes the loop's own verdict —
  and demotes `hitl` to a LEGACY block: still admitted in code (`VERDICT_TYPES`,
  `human-confirms`, `hitl-pause`/`hitl-decision-red`), retired by design (PRD v1.71),
  removal a future breaking change. Six inner passages that still called `soft-green`
  "locked" or `hitl` "the forward path" now state the shipped fact.
- **The authorjob no-repo refusal message** (`src/authorjob.js`) no longer says a judged or
  human close is "declared-but-locked" — `LOCKED_CLASSES` has been empty since v0.12.0; it
  now says what is true: this authoring flow drafts code-genre closes against a git seed
  only.
- **4 `jobs/*.json` description paths repointed, docs reorg** (PRD #13): the two preregs
  living under `docs/logs/` (`TESTGEN-PREREG.md`, `REUSE-LIFT-CONTRAST-PREREG.md`) moved to
  `docs/product/` beside the other eight; `docs/index.md`, the one live `FINDINGS.md` link
  and `scripts/gen-mutants-testgen.mjs`'s prereg string follow. The four job descriptions
  that still cited the pre-reorg `docs/02-experiments/*-PREREG.md` path now cite the real
  files — each job's signed hash flips and re-signs at its next run. `docs/archive/` and
  CHANGELOG history left as written.

### Fixed

- **`--range`-only CLI tests no longer leak an ambient `PROMPT_COMMIT_RANGE`**: the six
  tests exercising `--range` in isolation now pass `PROMPT_COMMIT_RANGE: ''` explicitly, so
  a resolvable ambient value (as CI's own `npm test` step now sets on every push) can never
  silently route them onto the env-range path they don't exist to prove.

### Ruled (no code change)

- **Accept's re-proof wall governance** (PRD #15, hamr, 2026-08-30): the door-accept
  re-proof runs unclocked, on the condition it stays mechanical
  (`mechanicalStages()` only, `src/reviewdoor.js:213`) — never a judged floor, never a
  person. A check is never bounded (W-2); any future non-mechanical re-proof is a new
  arbiter question.
- **`hitl` cleanup deferred** (PRD #21, hamr, 2026-08-30): `hitl` stays admitted in code
  (retired by design only) until hamr decides between finishing the retirement (delete the
  class, the stage kind, the two terminals, migrate any job using it — a breaking rung with
  its own release) or keeping it reopenable. Unscheduled either way.

## [0.15.0] — 2026-08-27

### Added

- **Generic run replay** (PRD build-list #6): `replayRun`/`formatReplay` (`src/replay.js`)
  reconstruct one run's whole story from its spine JSONL + gate-audit sidecar. The single-run
  report is a signed layout (hamr, 2026-08-25): a header block (`goal:`/`shape:`/`signed:`/
  `branch:`/`outcome:`/`spent:`, absent fields printing the literal `none recorded`, never
  blank or a fabricated `0`), a `TIMELINE (steps)` or `TIMELINE (iterations — loop-shape run)`
  section with its own column-header row and per-row time/cost (wall, `$` — a `null` `costUsd`
  anywhere in a row's window makes that row's spend `unknown (N unpriced rounds)`, never `0` or
  a partial sum stamped exact) and a `↳ tripped:`/`↳ close:` line under any row an escalation or
  close fell inside, a `CLOSE` section (never omitted — `none — the run ended before any close
  ran` when nothing ever closed; picks the run's REAL final close by seq, never by record type —
  an early `outer-close` precheck reading red must not shadow a LATER fix-loop close-verdict that
  went satisfied), `ENDING` (last record + 3 before it, plus an out-of-window escalation), the
  `BEHAVIOUR` block, and a `MEMORY-CACHE` line always printed (`not armed on this run` when
  absent — absence is never silent). Stop reason is `category — decision — detail` off the last
  escalation, so a run's actual failure text (a TLS "bad record mac", a specific mypy error)
  rides onto the report instead of just the generic per-category decision prose. A step id that
  recurs after a replan is split per OCCURRENCE, never merged into one pooled row. `--all <dir>`
  is name-agnostic (a spine is identified by a `job-start`/`run-start` record in its content,
  never a filename convention) and prints a fixed-column, ALIGNED table (never CSV) — `id job
  shape outcome spend wall steps reason`, `reason` built from `detail` only (never `decision`,
  cut at 60 chars) — flagging any non-spine `.jsonl` as `<name> not-a-spine` rather than dropping
  it. A RESUMED run's `job-end.spentUsd` is a CHAIN total (prior legs folded in) that can never
  equal this one file's own rounds (measured: `u-msf70nei` header `$5.3389` vs its own 55 rounds
  summing to `$1.2127`) — the header now prints both, each labelled, plus a `resumed:` line
  (keyed on `job-start.priorSpentUsd`, never on the narrower `resume-seed` record alone — 4 real
  archived runs carry a real fold with no resume-seed record at all). A non-resumed run's own
  spend disagreeing with its summed rounds is a genuine finding and prints as a `MISMATCH`, never
  hidden (measured: 0 of the archive's non-resumed runs trip it). `--all` marks a resumed row
  with a trailing `*` and one footnote line when the listing holds any. Reuses `runBehaviour`/the
  `memory-cache` readout rather than reimplementing either. Reads only, mints no verdict, writes
  nothing to the spine. `job-start` (`src/run.js`) now also carries `verdictType` (the spec's
  required verdict class) and `model` (when the shell-owned provider binding itself carries one)
  — PRD TODO #20, blessed verbatim by hamr the same day. The header prints `class:`/`model:`
  right after `shape:` (`not recorded (pre-F117 spine)` / `not recorded` on an older archive or
  a provider with no `.model`), and `--all` gains `class`/`model` columns (`model` kept FULL,
  never truncated).
- **Prompt-commit shape — a check, not convention** (PRD build-list #5, TODO #8, Q9 answered
  by hamr 2026-08-25): a commit that changes a prompt register (a model-facing
  system/strategy/instruction string a worker or judge reads) must now say, in its own
  message, three labelled things — `Failure:` what caused the change, `Addresses:` what it
  addresses, `Corrects:` what it corrects. `src/promptregisters.js` (`PROMPT_REGISTERS`,
  `isPromptFile`, both exported from `bareloop`'s root) is the ONE inventory: 7 files carry
  real prompt content (`src/authorscout.js`, `src/authorflow.js`, `src/judged.js`,
  `src/cardauthor.js`, `src/readshim.js`, `src/tools.js`, `src/planrun.js`) — more than double
  the 8 named consts a first grep found, once module-private consts and inline
  template-literal prompt builders (`scoutPrompt()`, `cardCasesPrompt()`, `locatePrompt()`,
  `strategyFor()`) are counted; the check is file-scoped precisely because a const-scoped one
  would have silently missed those. Enforcement is LOCAL ONLY — wired into `npm test`
  (`scripts/prompt-commit-check.mjs --range origin/main..HEAD`), never into any
  `.github/workflows/*` file (ask-first, untouched); an unresolvable range (no `origin`, no
  fetch) is a printed SKIP at exit 0, never a violation. Pure decision logic lives in
  `scripts/promptcommitlib.mjs`, neither of which ships (`scripts/` is outside
  `package.json`'s `files`). hamr's same-day addition: the `Failure:` line must also cite
  the RUN that caused the change (`run <id>` / `run u-<id>`, `\brun\s+(u-)?[a-z0-9]{6,12}\b`
  — alphabet/length measured against 231 real archived spine ids, every one exactly 8
  lowercase-alnum chars), failing with a distinct message
  (`FAILURE_NEEDS_RUN_REF`) when absent; format only, never checked against a real spine
  file.
- **Run→code stamp** (F118, the parked half of the same day's prompt-commit build, closed
  same day on hamr's go): the prompt-commit check closes commit→run; this closes run→code.
  `src/codeversion.js`'s `codeVersion()` is a pure, $0, no-shell reader — `version` from
  bareloop's own `package.json`, `sha` from `.git/HEAD` (loose ref, falling back to
  `packed-refs`) ONLY when a `.git` directory exists at the package root (a dev checkout;
  an npm install has none), `dirty` always `null` (uncommitted-changes state cannot be
  known without a shell — reported as unknown, never faked as `false`). `job-start`
  (`src/run.js`) now also carries `code: {version, sha}`. `replayRun`/`formatReplay`
  (`src/replay.js`) read it: a `code:` line right after `model:` — `bareloop 0.14.0 @
  43f2812` / `@ sha unknown` / `not recorded (pre-F118 spine)`; no new `--all` column
  (hamr's index is already full). The library never grows a shell seam to answer this —
  `run` stays the one locked verb.
- **Replay surfaces transport retries and floor reasons** (F119, live-proven the same day
  a real run — `u-mt8yk53k` — fired the retry seam twice): `replayRun`/`formatReplay`
  window `transport-retry` records into the step/iteration occurrence they fell inside
  (same `seq` windowing as `worker-round`), printing `↳ transport retry ×N (recovered|not
  recovered|partially recovered) — <error>` under that row; a retry outside every window
  prints as `transport retries outside steps: N` under the `TIMELINE` header instead. The
  header's `spent:` line, whenever `spendComplete:false`, now appends `· floor because:
  <reason(s)>` — derived from the spine, never guessed: `transport retry ×N`, `unpriced
  round(s)`, `cut mid-call`, `stall`, `prior leg floor`, every cause that shows real
  evidence, or `floor (reason not in spine)` when none can be derived. `--all` adds no
  column: a run carrying any retry gets ` ⟲N` appended to its outcome word (same posture
  as the resumed `*`), with one footnote when the listing holds any. Report-only — reads
  existing `transport-retry`/`wall-halt`/`stall`/`job-start` records, writes nothing.

### Fixed

- **Leaked tmp dirs from `npm test`** (same class that filled `/tmp` tmpfs on 2026-08-25 and
  blocked a build): `tests/codeversion.test.js`'s real-worktree test tracked only the `wt`
  subdirectory passed to `git worktree remove`, never the `mkdtemp`-created parent, so every run
  left an empty `codeversion-worktree-*` dir behind; its `after()` now also prunes stale worktree
  metadata when `remove` fails and `rmSync`s the tracked dir unconditionally, plus the mkdtemp
  parent is now itself tracked and removed. `tests/ralph.test.js`'s cwd-threading test created a
  `ralph-cwd-*` repo with no cleanup at all, and its cwd-relative-close test likewise leaked a
  `close-cwd-*` and a `close-cwd-other-*` dir per run; added a per-test `after(() => rmSync(...))`
  for each, matching the file's existing top-level cleanup pattern.
- **`codeversion.test.js` false-red on PR checkouts** (F118 addendum): the HEAD-sha test's own
  precondition assumed a symbolic ref, but `actions/checkout` leaves a PR checkout's HEAD
  DETACHED at the merge commit, so the precondition threw before the module under test ever
  ran — `src/codeversion.js` itself already handled the detached case correctly. Test-only fix:
  the precondition now resolves a bare 40-hex `.git/HEAD` the same way `codeVersion()` does, plus
  a new deterministic fake-package-root test that exercises the detached case without depending
  on the checkout's own HEAD state.
- **Review of PR #23 (2026-08-26), 7 items fixed**: (1) `replayRun`'s spend totals
  (`src/replay.js`) counted only `worker-round`, silently dropping a close's own `judge-round`
  spend and native `worker-turn` attribution out of every total — now filters on the canonical
  `SPEND_RECORD_TYPES` (newly exported from `src/ledger.js`), including the per-step window,
  which no longer requires a `.phase` match for records (like `judge-round`) that never carry
  one. (2) `scripts/promptcommitlib.mjs`'s run-reference regex accepted plain prose ("run
  failed" satisfied its `{6,12}` margin outright) — tightened to the measured exact shape
  (`{8}`); a proposed additional per-id digit requirement was investigated and REJECTED (23 of
  130 re-sampled real archived ids carry no digit, `msdsmkid` among them). (3)
  `src/codeversion.js` read `sha: null` inside any real git worktree (`.git` there is a FILE,
  `gitdir: <path>`, not a directory) — now resolves the pointer file and the worktree's
  `commondir` to find HEAD/refs correctly. (4) `replayRun`'s `resumed` flag missed a genuine
  $0-floor resume (`priorSpentUsd: 0` is still a real fold per `src/run.js:328`'s own doctrine)
  — now keys on the field's presence, not `> 0`. (5) `scripts/run-replay.mjs --all` opened
  every run's gate-audit sidecar despite never using the fields it feeds — no longer opens it
  in `--all` mode (`--all` output on `aurora-u-bareloop` confirmed byte-identical before/after).
  (6) the steps/iterations windowing logic in `replayRun` was duplicated inline twice — extracted
  into one shared `buildOccurrenceMetrics` helper (replay output on `u-msdsmkid`, `u-msf70nei`,
  `u-mt8yk53k` confirmed byte-identical before/after). (7) `npm test`'s prompt-commit check
  (`origin/main..HEAD`) inspects NOTHING after a direct push to main, because the push itself
  advances `origin/main` to match `HEAD` — `scripts/prompt-commit-check.mjs` now falls back to
  `HEAD~1..HEAD` on that exact condition and prints that it did; a multi-commit direct push
  still only re-covers the last commit (needs `github.event.before`, a `.github/` edit — out of
  scope here, ask-first).
- **Release-gate findings (2026-08-27)**: `scripts/prompt-commit-check.mjs`'s `--range` value
  was passed to `git rev-list` positionally with no way to disambiguate it from an option — an
  option-shaped value (e.g. `--output=<path>`) was parsed by git as its own flag (verified: a
  `--` separator does NOT fix `rev-list`, unlike `show`/`diff-tree`, since it treats everything
  after it as a path filter, not a revision range); the script now rejects any `--range` value
  starting with `-` up front, before any git call runs. Also corrected the fallback's printed
  limitation and code comment: on a MERGE commit, `HEAD~1` is the first parent, so
  `HEAD~1..HEAD` covers the merge PLUS every commit unique to the merged branch (measured on
  this repo's own `4904d76`: 10 commits, not 1) — the prior wording ("only re-covers the last
  commit") was only accurate for a LINEAR multi-commit push, which is now stated explicitly.
  (`src/replay.js`'s phase-less step-window filter was also reviewed and confirmed correct by a
  new adversarial synthetic test — no code change there.)

## [0.14.0] — 2026-08-25

### Added

- **One transport-class retry** (F115, hamr's ruling): the ONE worker-Loop seam in
  `src/planrun.js` now retries exactly once on a transport-only throw (TLS fault,
  `ECONNRESET`/`EPIPE`/`ETIMEDOUT`, `fetch failed` over a network cause — never an HTTP
  4xx/5xx/429 response), classified by the new `src/transport.js` (`isTransportFailure`,
  fixed `TRANSPORT_MAX_ATTEMPTS`, never operator-configurable). Emits a report-only
  `transport-retry` spine record and forces `job-end.spendComplete: false` for the rest of the
  run — the retried attempt's first throw may already have been billed — surfaced by
  `scripts/run-u.mjs` as a `retries` line only when a retry occurred.
- **provider-red joins the resumable set** (F115, PRD v1.80 TODO #4): when the one transport
  retry also fails and a `run-u` run ends `provider-red`, its tail now prints an honest
  readout — spend so far as a floor, "died in step X of Y" (or "before a plan was accepted"),
  and the exact `--resume` command — and `--resume` re-enters at the recorded step with the
  accepted plan, folding prior spend in. No cost/step threshold gates the offer (the operator
  decides, every time); verdict terminals (`escalated`/`step-red`/`plan-red`) still refuse.
  Folded from a local `scripts/run-u.mjs` widening into the library's own canonical
  `CHECKPOINT_OUTCOMES` (`src/reuse.js`) so the two lists cannot drift.
- **Run behaviour summary** (build-list item 2, agreed 2026-08-23): `runBehaviour(events, {
  runId? })` and `formatBehaviour(summary)` in `src/behaviour.js`, plus
  `scripts/behaviour-readout.mjs <gate-audit.jsonl> [run_id]`. A report-only text block —
  "94 tool calls · 61 read, 28 grep, 5 recall" / "17 exact repeats (~18%)" — computed entirely
  from a run's own gate-audit JSONL. Gates nothing, changes no verdict, writes nothing to the
  spine. The exact-repeat key is the full recorded action (`type` + `path` + every `args` key),
  never collapsed to `{type, path}` — sharper collapse would have merged different byte ranges
  of the same file into false repeats.
- **`memory-cache` end-of-run readout** for the read shim: `runPlan` emits one spine record
  (`{pointered, capped, bytesWithheld, approxTokens}`) summing what L1's pointer and L4's cap
  withheld across the whole run, only when the shim is armed. `scripts/run-u.mjs` prints it as
  `MEMORY-CACHE  N re-reads answered from memory · M reads capped · X KB withheld (~Tk tokens
  not re-sent)`; `scripts/behaviour-readout.mjs` prints the same line given the run's spine as
  an optional third positional. No cost fields — report-only, not a spend record.

### Fixed

- **`scripts/readshim-battery.mjs`'s spend reader compared a resumed leg's own money against
  the wrong job-end figure** (F116): `readSpend`'s `ledgerUsd` now reads
  `job-end.engagementSpentUsd` (this leg's spend) when a spine carries one, falling back to
  `job-end.spentUsd` only for a cold run — `spentUsd` on a resumed job-end is a CHAIN total,
  not this spine's own spend. `chainUsd`/`priorUsd` are exposed as new, honest fields and never
  folded into `accountedUsd`/`ledgerUsd`/`spendUsd`.

## [0.13.0] — 2026-08-23

### Fixed (2026-08-23 — the release round: a pointer that lied, a close with no home, a rule that charged for its own refusal)

- **The pointer no longer lies about a file emptied since it was read.** `src/readshim.js`'s
  pointer branch tested `start >= total` alone, so `0 >= 0` held with **no ledger entry at all** —
  the first read of an empty file and a re-read of a file TRUNCATED TO EMPTY since delivery were
  indistinguishable, and both answered "you already hold all 0 bytes". A worker would have gone on
  believing in content that was gone. The guard now requires a ledger entry whose hash still
  matches. This is precisely the untruthful-pointer class the module exists to prevent, found
  inside the module built to prevent it, and reproduced live before the fix.
- **`judge-round` carries its rate provenance.** The judged floor made it the first spend a CLOSE
  has ever had, and `src/ledger.js` documented the write side as forwarding `rateSource` onto it —
  but the emit never spread the field, so every judge round would have read UNKNOWN forever. NOT
  rounded up: `src/kinds.js`'s `onJudgeCost` payload still does not carry the field, so it reads
  UNKNOWN today, and both the emit and the ledger header now say so plainly.
- **A torn spine line stops reading as exact spend.** `scripts/run-battery-readshim.mjs` marked
  unparseable lines `__corrupt` "never guessed at", then counted them, dropped them, and reported
  the row's spend as EXACT while `corruptLines` reached no readout. `spendComplete` now goes false
  when any line was unreadable (spend renders `>=`) and the audit prints the count per row.
- **G1's ceiling half is refused at $0 instead of after the drafter is paid.** `validatePlan` reds
  `read-blind` when a capped step grants `read` without the retrieval pair — but a step cannot
  grant what the SIGNED CEILING does not offer, so against a spec whose `tools` lack `recall`/`get`
  **every** draft red identically and the drafter was paid for each doomed cycle. `runPlan` now
  throws at the same $0 door as the arm guard, in the same class: an operator param-guard
  `TypeError`, never a model-output red — nothing the agent authored is wrong when the operator
  asks for a shim the signature cannot satisfy. Tighten-only; the only configuration it rejects
  already failed 100% of the time, just later and for money. `RETRIEVAL_PAIR` is now exported from
  `src/plan.js` rather than respelled, so the rule and its pre-flight cannot drift apart.

### Changed (2026-08-23)

- **The aurora close moved to a tree development cannot mutate** (`jobs/aurora-u-spawner-types.json`,
  F110). Its stages had pointed at a scratch worktree, which was removed during ordinary branch
  work — every stage silently became `node: cannot find module`. The home before that was a shared
  working checkout, where a close landing mid-edit dies as an instrument fault rather than a
  verdict. Neither is a home: a checkout is *supposed* to go dirty and a scratch worktree is
  *supposed* to be removable. **A close is the arbiter's instrument, so its host must have the
  arbiter's lifetime.** Now a worktree pinned at a release tag, never edited, with its own
  dependencies. Re-signing was required and given in-turn.

### Added (2026-08-18 — the read shim, flag-gated OFF)

- **`src/readshim.js` — a per-worker delivery ledger over the read tool**, off unless the new
  `readShim` flag is set on `runJob`/`runPlan`. A read over 24KB (`READ_SHIM_CAP`) delivers its
  next unseen slice plus a trusted steer at `ctx_recall`/`ctx_get`; a re-read of a file the
  worker holds WHOLE and unchanged returns a short pointer instead of the bytes; a re-read of
  a file it holds only PART of returns the next slice, never a pointer; any content change
  re-delivers from the start. Measured on a $0 replay of 1,844 real `shell_read` actions from
  143 archived gate audits: 48% of reads re-read unchanged bytes, and cap+pointer keyed on what
  was DELIVERED saved 65.6% of read payload with **zero** untruthful responses — where the
  naive path+hash key saved 8.2 points more by telling **250 lies**, median 73,348 bytes hidden
  each (BA-17 read-blinding, reproduced).
- **G1 at the validation gate (`read-blind`)**: under the shim, a plan step granting `read` must
  also grant `recall` and `get`. Capping a worker with no retrieval verb is BA-17 on purpose —
  the cap is what makes the pair mandatory. Stated in the drafting prompt as well as enforced
  (the mailbox precedent).
- **One flag, four ARMS, default OFF** (the `layerRoot` precedent, F41). `readShim` names which
  levers run, one value per row of the frozen Phase 2 pre-registration: `false` = A0 (off),
  `'cap'` = A1 (cap + pointer + next-unseen-slice + G1), `'diff'` = A2 (the diff lever alone — no
  cap, no pointer, no G1), `true` = A3 (every lever). The two booleans mean exactly what they
  meant before the arms existed, so nothing written against them changed meaning. With the shim
  off every observable — validator reds, persona, delivered bytes — is byte-identical to the
  pre-shim run: the frozen A0 arm has to be exactly today, and a guard firing under a disabled
  shim would make the baseline a treatment arm. Each arm's persona line describes only the
  machinery actually installed (A2 is never told about a 24KB limit that is not in force). An
  unrecognised value THROWS at the entry (`readShimArm`) rather than coercing into a truthy
  shim — a mis-spelled arm would run one treatment under another's label and be invisible in the
  results afterwards. The default-flip is not in this change: it waits on a paid contrast.
- **A stale `ctx_get` pointer serves the requested line range from disk** (2026-08-19), under a
  CAPPING arm only. The cap's own strategy line steers a capped worker at `ctx_recall` →
  `ctx_get` for a whole function; `ctx_get` is content-hash gated and throws `StalePointerError`
  the moment the file changed after indexing — which is the normal case for a worker that just
  EDITED the file it is working on. Measured on the A1 arm's three green runs: 10 `ctx_get`
  calls, 5 stale, 0 bytes each, every one a just-written file. A paid round returning nothing,
  down a path the cap itself chose. The serve hands back the requested 0-based inclusive line
  range read fresh from disk, under TRUSTED framing that says the pointer was stale, that the
  range may now hold DIFFERENT code than the symbol asked for, which lines arrived, and that
  nothing was recorded as delivered. litectx refuses to slice a drifted range itself because an
  UNLABELLED slice can silently be another symbol's body — the label is what makes it legal.
  Detection is on the exported `StalePointerError` CLASS, never on message prose. A vanished
  file or a range now entirely past the end is a refusal RESULT naming what happened, never a
  throw. It **never touches the delivery ledger**: a slice is not the file, and a ledger that
  recorded one would answer the next read with "you already have it" to a worker holding 90
  lines of 900 — the untruthful-pointer failure the shim exists to prevent. The cost of that is
  a later `shell_read` may re-deliver bytes the serve already showed; the shim over-delivers
  rather than lies. A0 and A2 are untouched: with no capping arm the hook is not wired and
  `ctx_get`'s contract is byte-identical.
- On the native surface the shim REPLACES the `NATIVE_READ_CAP` wrapper rather than layering over
  it (both bound the same seam at the same 24KB, and a shim outside the native wrapper would
  ledger already-truncated text as a whole file — the exact lie it exists to prevent). L2
  (diff-on-change) is deliberately not built: it never fired on the real corpus.

## [0.12.0] — 2026-08-23

### Added (N4 slice 2 — the softgreen rung: a close that JUDGES, and a signer who has the last word)

- **The judged floor is real: LOCATE + DECIDE (`src/judged.js`).** A judge (haiku-4.5, pinned —
  never a step knob) extracts FACTS from the real artifact with quotes; an arbiter-owned `decide()`
  renders pass/fail from a signed rubric card; *unsure* is a red, never a pass. The judge never
  renders a verdict, so the rubric-is-self-consistency gotcha stays closed. Wired as the
  `judged-floor` close kind — metered from the run's own wallet, `offer:false` by law, and skipping
  the seed-verdict read (its bar comes from calibration instead).
- **`soft-green` is ADMITTED as a verdict class** — the class-scoped question set, the inherited
  green guard battery (hamr: *"battery ties with job type"*), the class-scoped kind menu, and the
  promise rule: composition stays ≤ the picked class, and exceeding it is an honest red rather than
  a silent up- or downgrade.
- **The signer's two artifacts are AUTHORED and enumerated in the hash** (`src/cardauthor.js`): the
  rubric card comes from Q6 and the calibration set from Q7, both handed to the compiler verbatim,
  both SHOWN to the signer (D5 shown-and-fixed), and what the signer fixed is what is stored —
  `source: 'proposal'` says *nobody changed this*, which is a different fact from *a person read it
  and changed nothing*.
- **The calibration gate — ten graded truths and five resisted lies buy a signature**
  (`src/calibrate.js`, gate 4 of `prepareSigning`). The whole pipe grades the signer's own ten cases
  and faces a 5-artifact injection battery adapted to the locate axis; the floor is **10/10 with
  itemized reds** (hamr, 2026-08-18) and all-or-nothing on both halves. The $0 legality check runs
  first and buys no calls. A dead judge is a CASUALTY under the transport's name, never a reading of
  the operator's rubric.
- **Quarantine: a judged green earns no learning credit until an `accept` releases it.** Minted
  soft-green bridge rows are held at mint, the release is forward-only, a rerun re-quarantines, and
  a held entry is never offered by selection — so a soft-green pass cannot feed N3 before the judged
  floor is proven.
- **The review door — every run ends at the signer's three doors** (`accept` / `rerun` / `pause`).
  The door records a DISPOSITION and never touches the loop's own verdict (hamr: *"it's important
  not to change the loop self verdict"*): `runPlan` returns `green`/`already-green` exactly as
  before. It opens at all three green sites (precheck `already-green`, the outer close, and the fix
  loop's green). **Soft-green always** (`REVIEW_DOOR_CLASSES`), **green opt-in** via `reviewDoor:
  true` / `--review-door` — the flag wins in both directions and is never inferred. An `accept`
  re-runs the close's MECHANICAL stages (never a judged floor, never a person): a door keeps for 60
  days and nothing freezes a tree.

- **The judge tier joins the SIGNATURE — a bump flips the hash and the stage refuses the
  mismatch** (`649d8a5`). `JUDGE_MODEL`'s docstring has always said a judge-model bump forces a
  full recalibration, and nothing detected one: `closeDecl.calibration` stored only its `cases`,
  so the tier that graded them sat OUTSIDE the signed bytes, a bump flipped no hash, and the
  judged stage never compared the model it was about to buy against the model the signer's set
  was graded by. A rule with no wired detector is prose (F45). The tier now lives beside the
  cases as **`calibration.judgeModel`** (`CALIBRATION_FIELDS` in `src/declaredclose.js`
  enumerates a stored set as exactly those two and nothing else), written by
  `foldJudgedArtifacts` from the PIN itself rather than from anything a caller may name — and
  because it is inside the spec, `jobSpecHash` covers it by construction: bump the constant,
  every signed judged spec hashes differently, the signature dies, and the re-sign is what
  re-runs the calibration gate. `validateCloseDecl` REQUIRES it on any stored set (a set nobody
  can attribute to a tier is a floor nobody can tell apart from a bumped one).
  `declaredStages` carries the close-level fact onto the judged stage as
  `calibrationJudgeModel` — the same seam, and for the same reason, that already stamps
  `offer: false` — and it carries it from the SIGNED bytes, so a stage can never name a tier the
  signature does not. `runJudgedFloor` then refuses to grade on a mismatch, naming both models
  and the two things that fix it (*re-sign* and *recalibrate*), under the same `FAILED` fault the
  absent judge seam already stops on: nothing is broken, something was never re-done. An ABSENT
  stamp is deliberately NOT a runtime stop — a signed spec cannot reach a run without a
  calibration (the signing gate) or without a model on it (the spec gate), so the only runtime
  question is WHICH model. No signed spec on disk moves: `jobs/*.json` carries zero
  `judged-floor` stages today.
- **The U runner mints the row its review door promises to release** (`e01d0af`). The door tells
  a person that `accept` *"releases this run's learning credit"*; for every run
  `scripts/run-u.mjs` has driven that sentence was false by construction — a cold green wrote a
  standalone `bridge-<job>-<runid>.json` FILE and never a registry ROW, so
  `--registry --workflow --decide accept` reached `recordDoor`, found no green row for the runid
  and died `no-row-for-run`. The held credit could be described and never released. **STORAGE
  ONLY:** nothing here selects, promotes or reuses a bridge — that rung stays parked on
  `layer-3-reuse` (F88) — and exactly one thing reads the row back, the door. `writeGreenRow` is
  `runReuse`'s own cold-leg green write LIFTED out of its closure unchanged (the
  fork-on-a-different-close-shape rule, both collision refusals, the `appendGreen` leg), so the
  two runners mint a green through ONE spelling; a second spelling of what a green writes is the
  two-transforms class applied to the ledger itself. **`writeRunGreenRow`** (newly exported) is
  the U runner's terminal policy on top of it, and every guard is a NAMED refusal rather than a
  silence: no `--registry` (`no-registry`), an already-green run (`green-predates-run` — accept
  confirms a verdict, it never mints one), a green with no executed plan (`no-plan-executed`), a
  class whose credit is not held (`credit-not-held` — `green`-class runs mint nothing here,
  which is what this runner has always done), and a spine leak blocks the row exactly as it
  already blocks the bridge file. The row is born HELD because `greenParts` reads the SIGNED
  class off the record — nothing new sets a flag — and `applyDoorDecision` releases it through
  the path that already existed. `src/index.js`'s claim that `runReuse` is the only registry
  writer is CORRECTED rather than left standing.
### Fixed

- **F102 — a pending human decision now survives a wall-halt → resume** (`a6f62c9`). Two records
  answering two different questions: `human-decision` (the door, the words, and by whom, with
  `source: 'operator'|'checkpoint'` and the moment the PERSON spoke) and `human-decision-spent`
  (what actually bought it). The spend marker fires on the **WORK** — a fix round bought, an accept
  that greened, a pause honoured — **not on the fix loop opening**, which is precisely the shape of
  the incident (`iterationsUsed: 0`). A resume carrying one re-enters the fix loop through the same
  seam a fresh answer uses; the ask is never re-rendered. Two answers to one question are REFUSED
  (`hitl-decision-red` naming what is held), never merged.
- **F103 — a rerun buys its own clock** (`a6f62c9`). Two counters that never do each other's job:
  CHAIN (`chainWallMs`/`chainSpentUsd`, `job-end.spentUsd`) is every leg added up and is what the
  halt readout reports; ENGAGEMENT (`priorElapsedMs`, `job-end.engagementSpentUsd`) is what bounds
  THIS leg. Money is deliberately not symmetric — the signed budget stays the CHAIN's ceiling,
  because a refilled wallet is the failure F45 measured. W-2 is untouched where it was designed for:
  an ordinary resume folds exactly as it always has, and so does an `accept`.
- **F106 (HIGH, review) — the calibration gate now meets the one ceiling** (`0ae7693`). The run's
  third and largest paid seam (up to 10 locate calls plus the 5-artifact battery, each under its own
  retry ladder) ran with no bound while the scout and the declaration loop were both stopped by
  `run-author --budget` — the advertised budget and the enforced budget were two different numbers.
  `prepareSigning`/`calibrationGate` take `ceilingUsd` + `priorCalls`, a cost book absorbs prior
  spend so the gate reads the REMAINING balance, `capStop` is asked before each paid call inside the
  pipe (retries included), and a ceiling stop returns as an operator refusal naming money
  (`cap-halt` / `pricing-red`) — never a casualty, and never a part-graded set presented as graded.
- **A review door's rerun is a fresh engagement too** (`0ae7693`): `resolveHumanRuling` takes
  `doorRerun` as a third input, OR'd and never merged, so *"is this leg a fresh engagement"* keeps
  ONE spelling and a door-rerun leg cannot inherit the rejected leg's wall.
- **`scripts/run-u.mjs` wires `judgeProvider`** (pinned to the judge model, never a step knob) — a
  live soft-green run no longer instrument-stops at the judged stage.
- **Two mutation-blind gaps in `src/kinds.js` covered by tests** (found by the same review).

- **The medium whole-branch code review's five findings** (`e0c87d3`). An absent `job-end` in
  `scripts/run-u.mjs` (a crash between the door record and `job-end`, or a legacy spine) no
  longer launders into an exact complete `$0` that folds into the rerun ceiling — unknown is
  reported unknown (F6), regression test watched failing first. One name per kind and per code:
  the `'judged-floor'` literal at 7 sites becomes **`JUDGED_FLOOR_KIND`** (`src/kinds.js`,
  exported) and the `'quarantined'` code at 3 sites becomes **`QUARANTINED_CODE`**
  (`src/bridges.js` — deliberately not `reuse.js`, which would cycle reuse ↔ selection). One
  `threeDoors()` builder replaces the copy-pasted door lines in `scripts/u-readout.mjs` (output
  byte-identical against HEAD), and a `changedEvidence()` helper in `src/planrun.js` replaces
  the duplicated evidence block and the double `verdictType` default, with `doorOpens`'
  signature untouched. Two findings were ESCALATED rather than decided — the judge-model bump
  with no detector, and the U runner's door promising to release credit it never minted — and
  both are the `1A`/`2B` entries above.
- **The tail review's six findings over `1A`+`2B`** (`493b2ce`). The door PREVIEW path now
  checks row-EXISTS before promising a credit release, and its printed commands carry
  `--registry`/`--workflow` forward — the `e01d0af` fix had landed at the end-of-run readout and
  not at this sibling site, so the operator's next invocation would have rediscovered
  `no-row-for-run` one hop later. The registry row records **`rounds` + `roundsComplete`**: a
  resume leg writes a fresh spine and the halted leg's restart record declares money and wall
  but never rounds, so on a resume that count is a FLOOR and now says so the way the money
  beside it already does (F6). A NAMED `--registry` that attempted no row prints the reason
  rather than staying silent. The two near-identical record builders in `src/reuse.js`
  consolidate into `commitWrite`, and the duplicated `worker-round` scan is hoisted to one
  spelling.
- **The release gate's two findings** (`a5a4731`). `docs/UPSTREAM-ASKS.md`'s BA-21 carries a
  dated CORRECTION note: the retracted 2.0–2.5× figure was a clipipe-surface number (F48 — a
  provider-billed surface that never pools with `anthropic-api`), and the measured API-side
  numbers are ~5.7% / 1.586×; the acceptance criteria are unaffected. In `src/judged.js`, two
  literal NUL bytes inside composite-key template strings are spelled `\x00` — byte-identical
  at runtime, but the literal made `grep`/`file` treat the source as binary (the documented git
  binary-detector trap).

### Docs (2026-08-23)

- **`docs/FINDINGS.md`: F102 and F103 move from NOT FIXED / NOT BUILT to FIXED**, each cited to
  the commit that did it — `a6f62c9` for both, plus `0ae7693` for F103's extension (the review
  door's rerun as `resolveHumanRuling`'s third input, OR'd and never merged). **F106 is minted**
  from the 3-lens review's HIGH: F45's class in a money coat with the direction reversed — the
  ENFORCED number was the looser one, which is the failure that leaves a bill instead of a red
  (`cce3ce5`).
- **PRD Addendum v1.76** (this release): the three doors restated, the green-class review door
  kept OPT-IN, rerun named as *not a replay*, the `1A`+`2B` escalations ruled, and the one
  remaining door hole named and left deliberately.
- **`bareloop.context.md`**: the judge-tier paragraph rewritten from DEFERRED to the live
  detector it now describes.

## [0.11.0] — 2026-08-18

### Changed (2026-08-18 — the review door's third button)

- **The three doors are `accept` / `rerun` / `pause`; `cancel` is DELETED as a concept.** hamr:
  *"what's the point of cancel anyways? pause can resume — that would be more honest"* and
  *"rerun implies I don't like it, go again"*. A `pause` answer runs nothing, spends nothing,
  buys no worker round, never opens the fix loop and does NOT consume the one-shot rerun
  allowance: it mints the ordinary `hitl-pause` checkpoint with an explicit
  `humanDecision: 'pause'` and leaves the run resumable from the start of its last step. An
  unresumed pause simply expires under the existing 60-day `PAUSE_TTL_MS` — **that expiry is
  what cancel used to be**, without forcing a permanent decision. `HUMAN_DECISIONS` is the
  enumerated set the surface derives from, so `cancel` is now inexpressible rather than
  rejected after the fact; `hitl-decision-red` still refuses any word that is not a door.
- **`hitl-cancel` is no longer mintable and the constant is gone** (removed from
  `src/declaredclose.js` and the package exports). The ledger keeps the bare string in its
  excluded-escalation set — the `gate-red` precedent — so a spine written before this change
  still reads as governance rather than as a counted capability gap; no spine on disk carries
  it (the door never fired live), so that entry is forward compatibility, not bookkeeping.
- **A human checkpoint row is classed `checkpoint`, not `casualty`** (`src/reuse.js`, both the
  live try loop and the resume reconstruction). A casualty is a run that died; a checkpoint is
  a run that is waiting on a person with nothing lost — every other reader already treated it
  that way, and the row was the last place the machinery mis-described itself.
- **Runner surface (`scripts/` never ships):** `scripts/run-u.mjs --decide pause` answers the
  door and launches nothing at all — it prints the decision, names the TTL and the ORIGINAL
  runid, and exits having spent nothing. Deliberate: the runner writes one spine per leg, and a
  leg that returns before drafting emits no `plan-accepted` and no `step-end`, so launching a
  run to say "not now" would mint a runid whose own checkpoint is empty and re-pay for finished
  steps on the next resume. Door rendering (`scripts/u-readout.mjs`) and the escalation
  passthrough (`src/ralph.js`) carry the new third door.
- **Docs:** dated addendum on `docs/02-features/2026-08-17-softgreen-review-door-design.md`
  (closed sections untouched), **PRD Addendum v1.72**, README's *"You have the last word"*,
  `bareloop.context.md`'s terminal/decision surface, and `docs/01-product/LAYERS.md`.

### Docs (2026-08-17 — decisions only; NO code changed, and no build is authorized)

- **New design record `docs/02-features/2026-08-17-softgreen-review-door-design.md`, and PRD
  Addendum v1.71: `hitl` is RETIRED as a verdict class, its pause becomes the REVIEW DOOR at
  the end of EVERY run, and `soft-green` becomes the forward path.** The hitl slice below FIRED
  live first and worked — the first hitl pause in programme history, 64 strict errors to 0, the
  authored guard catching the cheat genre twice, evidence package and three doors and a stopped
  clock (F105). hamr then retired the class for what it asks of a composer and of a person:
  *"checkers are subjective human experience that they should grade for"*, and *"it's hard to
  apply deterministic flow on a probabilistic throughput"*. **The machinery is re-homed, not
  deleted.** The door never changes the loop's own verdict (*"it's important not to change the
  loop self verdict"*): a green stays green in the ledger and the door records a disposition —
  `accept` (and, on soft-green, the release of quarantined learning credit), `rerun` (the text
  IS the gap), `cancel` (*"the verdict stands, but I'm not taking the merchandise"*). A rerun is
  a **FRESH ENGAGEMENT** with its own money and time and two side-by-side counters, and **any**
  wall or halt now records full state — time, money, strikes, notes/progress and any pending
  human decision. `soft-green` gets a `judged-floor` kind on the LOCATE+DECIDE pattern (the
  judge extracts facts with quotes from the real artifact; an arbiter-owned `decide()` renders
  pass/fail; unsure = red), behind a signed rubric card (Q6) and a signed calibration set (Q7)
  the whole pipe must grade correctly before the close is signable. **Nothing is built.**
- **F102, F103, F104 and F105 in `docs/FINDINGS.md`**, each grounded in today's spines under
  `bareloop-patients/litectx-maintainer-bareloop/`: a pending rerun decision does not survive a
  wall-halt → resume (two byte-identical pause records — the human paid the same decision
  twice); the wall folds across legs, so a decide-time rerun inherited 87 seconds; the
  catalogue cannot count documentation, so a composer measured a typecheck PROXY instead —
  which is what retired the class; and the positive record of everything the first live hitl
  loop proved, including that rerun DELIVERY works and rerun CONVERSION is still unproven-live.
- **`docs/01-product/LAYERS.md`** gains the review door, the two-verdict table and the next
  rung; the **2026-08-13 N4 build record** (closed) gains a dated addendum pointing forward;
  **README** and **`bareloop.context.md`** carry the direction change, the contract still
  describing what the code on this branch actually does today.

### Added

- **N4 slice 1 — the `hitl` verdict class is ADMITTED, and the run PAUSES for a person.** A job
  whose *done* needs someone to say so now runs through the same signed spec, the same
  agent-authored plan and the same arbiter as a green job. The refusal was never one flag, so
  every coupled site moved together: `LOCKED_VERDICTS` / `LOCKED_CLASSES` drop it,
  `DECLARED_CLOSE_CLASSES` widens to `['hard','hitl']`, the class battery is the GREEN mechanical
  battery inherited verbatim (hamr's OPEN-1 ruling: nothing a human stage cannot see), and the
  interview gains a hitl question set (the green questions byte for byte, plus the one thing
  they cannot supply — the question the signer actually answers). **`soft-green` stays
  declared-but-locked**: its judged floor is slice 2, and a wobbly ruler must mint nothing.
- **`human-confirms` goes live as the one kind that measures nothing.** Its whole parameter
  surface is `ask`; it cannot spawn, is never env-capable, is `offer: false` BY LAW (a
  declaration that offers one is a validation red, and the arbiter's own bridge stamps the law
  onto the stage the runner sees, so the agent can never compose `check-passes(<a person>)`), is
  at-most-once, and must be the LAST stage — first-red-wins would otherwise silently delete every
  mechanical stage behind it. It also SKIPS the seed-verdict read (ruling 8), and the skip is
  recorded as a row rather than taken in silence.
- **Three new terminals, minted rather than borrowed.** `hitl-pause` is a decision-ready
  CHECKPOINT carrying the evidence package (every mechanical stage's result, the close's own
  question, and what the run changed) — never a bare "approve?"; `hitl-cancel` is terminal with
  an explicit `gap: null`, no fix loop and no worker round; `hitl-decision-red` refuses a
  decision the run cannot act on (a fourth door, a `rerun` with empty text, or a decision handed
  to a close with no human stage) before anything is spent. All three are excluded from the
  ledger's escalation counting for their own stated reasons, and none demotes a bridge. The
  legacy `hitl-close` entry keeps its own meaning; nothing was renamed in passing.
- **The RETURN needs no new channel.** A resumed leg carrying the signer's `rerun` feeds their
  words through the same seam `post.gap` uses — same bound, same scrub — and the run continues
  under the folded wallet on an unbilled clock. The ruling is spent when the fix loop opens, so
  the next machine-clean tree pauses for a second review instead of converting one sentence
  forever, while a mechanical red in between is still converted normally.
- **New public exports**: `HUMAN_DECISIONS`, `SEED_EXEMPT_KINDS`, `normalizeHumanRuling`,
  `NEVER_OFFERED_KINDS`, `HUMAN_PAUSE`, `CHECKPOINT_OUTCOMES`, `PAUSE_TTL_MS`,
  `checkpointAgeGate`, `HITL_PAUSE`, `HITL_DECISION_RED`, `HUMAN_CHECKPOINTS`. The 60-day pause TTL and the
  canonical checkpoint list live in the LIBRARY (hamr's OPEN-2 ruling) so the exported bundle
  inherits them rather than every runner re-implementing them. The two terminal names are
  spelled ONCE, in `src/declaredclose.js` beside the `HUMAN_PAUSE` close-verdict word they
  translate, because four different readers key on them — the emitters (`src/planrun.js`), the
  ledger's excluded-escalation set, the resume reader (`src/reuse.js`) and the runner script —
  and hand-spelled copies of one terminal is how those readers come to disagree.
- **A registry guard that was only holding by accident**: an `already-green` terminal now mints
  no bridge version for a NAMED reason (`green-predates-run`) rather than because no plan
  happened to be on the spine — a hitl try that paused and came back with `accept` has its
  predecessor's plan in the very same try window.
- **An authoring run says what it is doing while it is still doing it — three REPORTING seams,
  `onPhase` / `onStage` / `onCall`.** The pipeline ran up to ~15 minutes between `author-start`
  and its result with nothing on the terminal or the spine — a real survey ladder, a real
  declaration ladder, and a real toolchain per close stage, all inside one await — and silence
  is byte-for-byte what a hang looks like, so the operator's only lever was to kill a run that
  might be working. The library REPORTS and the shell PRINTS, the same shape `runJob` → `runPlan`
  already has: `onPhase` fires at the composition's boundaries in `authorCloseForJob`
  (`src/authorjob.js`) and `authorClose` (`src/authorflow.js`) — `seed`, `scout`/`scout-done`,
  `listing`/`listing-done`, `author`, `author-call`, `seed-read`/`seed-read-done`; `onStage`
  (a new `Ctx` field in `src/kinds.js`) fires per seed-read stage, AFTER the stage lands, because
  only then is there a verdict to carry; `onCall` fires from inside each of the two metered
  recorders (`makeCostBook.add`, `runAuthorScout`'s `record`) rather than at the call sites, so a
  paid call cannot be metered without its report going out. **Nothing here is consulted and
  nothing decides**: `capStop` is still the one ceiling predicate, still asked between calls,
  still reading the same entries — and every callback defaults to a no-op, so every existing
  caller is byte-identical. Two deliberate omissions: `makeCostBook.absorb` does NOT fire
  `onCall` (those calls were already metered and reported by whoever made them, and reporting
  them twice would double the scout's spend in every reader downstream), and the `seed` phase is
  announced only on the path that actually reads one, because a phase line for work nobody did is
  the blind-instrument class one line wide. The renderer is `phaseLine` in
  `scripts/author-readout.mjs` (a readout no test can reach is a readout nothing checks); it
  prints WHAT is happening and never a fraction — a survey attempt has no progress and a suite
  stage finishes when it finishes — and an unmeasured `durationMs` prints as `unknown`, never as
  `0` (F6 in its time form). A phase the renderer does not know is printed rather than swallowed.

The runner half of the same slice landed beside it and is deliberately NOT in the tarball
(`scripts/` never ships): `scripts/run-u.mjs` gains `--decide accept|rerun|cancel` (+ `--text`)
on the existing `--approve <specHash>` signature, renders the pause's evidence package plus the
line-level diff, consumes `CHECKPOINT_OUTCOMES` and `checkpointAgeGate` instead of re-spelling
either, and prefers the run's own terminal over a stale watchdog record when folding the wall —
so a person's deciding time is never billed to it. What an adopter's own runner has to do is in
`bareloop.context.md`.

Beside it, `scripts/run-interview.mjs` — **the terminal interview, and the answer to hand-writing
an `answers.json`**, which is precisely the SWE tax this product exists to refuse. It asks the
LIBRARY's frozen questions ONE AT A TIME, **calls no model and costs $0**, and writes
`answers.json` (the shape `run-author.mjs` consumes) plus `specdraft.json` (the operator half — no
close and no `verdictType`, because those are what `run-author` authors). The draft is checked for
$0 by `validateJob`, the SAME validator that will judge the resolved spec, so a draft that cannot
become a spec says so before a provider is ever built. It then OFFERS to spawn the paid
`run-author.mjs` under its OWN `--budget` ceiling — **default NO** (`[y/N]`, the same lean the
pause's three doors take: the answer that costs nothing is the one you get by saying nothing), and
it prints the exact command either way. The two ceilings are kept apart out loud: `--budget` is
what the AUTHORING call may spend, `budgetUsd` is what the RUN may spend, signed into the spec.

And `scripts/run-u.mjs` gains a `litectx-maintainer` JOBS row — **N4's hitl PROVING job, dark
since the legacy `steps[]` deletion took its old spec's path with it**, back as a plan-flow job
with an AUTHORED close. `jobs/litectx-maintainer.json` **DOES NOT EXIST, and the row does not
create it**: the spec is authored live through `run-interview.mjs` → `run-author.mjs` and signed
by hamr, goal and answers included, and until it lands **the runner REFUSES BY NAME** — a row is
the runner's half of a job, never the signer's. The patient is a COPY at the convention this table
already uses, and the seed is that copy's own HEAD (litectx v0.32.0, `115213d`).

### Changed

- **Both suite pins move up a minor — `bare-agent ^0.35.0 → ^0.36.0`, `bareguard ^0.12.0 →
  ^0.13.0` — because on 0.x a caret locks the MINOR**, so the old pins admitted neither release
  and the bump is the only way to consume them. **bare-agent 0.36 delivers BA-20**, the
  productized decisive judge this queue reopened on: `judge` (verbatim request + one structured
  artifact → `honored`/`broke` with a mechanical `where`, truncated/unparseable responses as
  DISTINCT flagged outcomes excluded from graded denominators, composing **around** a provider
  and never inside the Loop), the calibration harness (`calibrate`, `CALIBRATION_CASES`,
  `INJECTION_BATTERY`, `constantHonored` — the negative control that lets the harness fail), and
  the pure `judgeToAnnotation` mapping into bareguard's shipped fact envelope. **bareguard
  0.13.0** is the companion hardening: `gate.annotate` now REJECTS malformed facts into distinct
  `annotate_malformed` rows instead of normalizing them into silently-`honored` ones, `verdict`
  goes through the audit redactor (it was written RAW — a real secret-leak fix), `meta`'s
  1000-byte bound became a decoupled copy, and `__proto__` keys are dropped at every depth.
  **That behaviour change is zero-cost to bareloop today**: it imports only `Gate` and `redact`
  and has **no `gate.annotate` call site** at all. `npm ls` resolves `bare-agent@0.36.1` +
  `bareguard@0.13.0`, deduped to one shared copy, and **full fresh gates are green against the
  installed versions** — `npm test` 1569/1569 exit 0, `typecheck` clean, `build:types` clean.
  **The judge is NOT consumed here**: its consumer is the N4 (soft-green) rung, so wiring it into
  a `judged` close stage and executing BA-20's acceptance criteria live (running `calibrate`
  against the frozen floor and naming the hash it graded) are deferred to N4's opening — a
  verified delivery, not a verified acceptance.

- **The interview loses its repo question and widens its scope question — hamr drove the terminal
  himself and ruled on the wording (2026-08-15).** `GREEN_QUESTIONS` drops *"Is there a code repo I
  can look at? Where?"*: the repository is already MANDATORY STRUCTURED input (`runInterview`'s
  `repoPath`, taken from `--patient`, without which nothing starts), so asking a person to re-type
  a path the machine is holding is the SWE tax this product exists to refuse — and it invites a
  second, drifting answer for one fact (hamr's own live answer was *"Yes — the patient itself."*).
  Question 2 gains the other half of the same decision — *"…And which files should the work read or
  draw from (they stay untouched)?"* The sets **renumber contiguously from 1**, so the green set is
  five questions and hitl's signer-ask is now **6**, not 7. Nothing hardcodes a count: `run-author`,
  `run-interview` and the suite all read `requiredAnswersFor(cls)`. **Adopter note: an
  `answers.json` written before this change is SILENTLY MISREAD** — its key `6` was the repo answer
  and now reads as hitl's signer-ask, and its key `7` is dropped as unasked. Re-run the interview
  (it is $0 and calls no model) rather than hand-editing.
- **The interview's own prose stops citing finding numbers and says the mechanics out loud.** The
  goal prompt no longer prints *"F87"* at a person who has never read the findings — the rule is
  unchanged and the price is now named as a price. The fence prompt says what a fence IS (writable
  files, everything else read-only), that patterns are repo-root-relative, and that absolute paths
  are refused because the run works on a copy. The multi-line hint spells the keystroke: *press
  Enter on an empty line, i.e. Enter twice*.
- **Suspended minutes stop charging a signed wall — the run clock is MONOTONIC** (hamr's ruling,
  2026-08-15: *"if computer suspended, time shouldn't count."*). `createClock`'s default source
  moves from `Date.now` — CLOCK_REALTIME, which counts every minute the machine was asleep — to
  `performance.now`, which reads libuv's `uv_hrtime` and so CLOCK_MONOTONIC, which per
  `clock_gettime(2)` *"does not count time that the system is suspended"*. That was not
  hypothetical: an s2idle suspend landing mid-run charged **45 phantom minutes against a
  45-minute wall**, and the same exposure covers an NTP step or a hand-set date. Nothing corrects
  for a suspend after the fact; the reading simply never includes one. **The epoch change is safe
  by construction**: every use of `now()` in `src/clock.js` is RELATIVE (`now() - startedAt`) and
  no value derived from this clock is ever published as a calendar timestamp — `report()` carries
  durations only, and the `at:`/`ts:` stamps a run writes come from their own `Date.now` seams in
  `src/reuse.js`, which stay calendar-correct on purpose. `now` is still injectable, which is what
  every clock test drives. Three runJob-level wall tests mocked `Date` because that is the only
  seam `runJob` exposes, and the monotonic source made them BLIND — they redded `provider-red` /
  `plan-red` instead of `wall-halt`, which is the failing-first evidence that the mock was
  load-bearing; they now go through one shared helper (`tests/helpers.js`) that pins
  `performance.now` to the mocked `Date` and restores it after. **KNOWN LIMITATION, recorded
  rather than fixed** (PRD Addendum v1.67, hamr: *"leave it and mark it in prd as possible known
  limitations"*): the OUTSIDE watchdog still measures silence in CALENDAR time, so a long suspend
  can still read to it as a stall. The half that charges money is fixed; the half that reads
  silence is not.
- **`scripts/run-u.mjs` PRINTS the sleep-inhibitor launch line** the way `scripts/run-reuse.mjs`
  has since F72, instead of carrying it as a comment — a rule nobody reads at the moment they
  launch (and like every runner change here, `scripts/` never ships in the tarball). A suspend
  freezes EVERY guard: the outside watchdog is a POLLER, so it cannot observe — let alone kill — a
  run whose machine is asleep, and after the monotonic clock above the run's own wall does not
  count those minutes either. A suspended run is therefore simply UNWATCHED for as long as it
  sleeps, and the launch banner is the last moment the operator can still do something about it.
  The printed line is `systemd-inhibit --what=idle:sleep --why="bareloop u run" env …`, with `env`
  before the key assignment on purpose: `systemd-inhibit` execs a COMMAND, and a bare `VAR=value`
  prefix is shell syntax it would try to run as one — the key still rides an env assignment and
  never argv. A pause with no ruling prints the line prefixed to NONE of its three doors, because
  prefixing one would quietly recommend it and this surface's lean runs the other way.
- **The hitl terminals get one canonical spelling, and the pause screen gets one renderer**
  (`/code-review medium`, findings 2 and 3). The terminal names were hand-spelled string
  literals at every reader: 9 sites in `src/planrun.js`, the ledger's `EXCLUDED_ESCALATIONS`
  set, `src/reuse.js`, the `src/index.js` re-export and 7 sites in `scripts/run-u.mjs`. They now
  all import the constants exported from `src/declaredclose.js` (the `hitl-cancel` constant
  introduced with them is gone again — see the review-door entry above). Beside it,
  `printPauseEvidence()` in `scripts/run-u.mjs` becomes the SINGLE assembly point for both pause
  screens — the resume preview and the fresh-pause terminal — so the fallback rule cannot drift
  between them: with a pause record the package is the close's own ask plus the diff of what
  changed; without one it says so plainly, rather than rendering the bare "approve?" that ruling
  2 forbids. Finding 1 — `runReuse` classing a `hitl-pause` as a casualty and buying another try
  — was parked as arbiter territory when this bullet was first written, and has since been FIXED
  on this same branch: `d183c95` gave the checkpoint its hard stop (`hardStop` reads
  `HUMAN_CHECKPOINTS` before the retry table, so the loop hands the run back rather than re-asking
  a question already put to someone who has not answered), and `4e0ab94` gave the ROW its own
  `checkpoint` class, so the machinery no longer mis-describes a waiting run as one that died.

### Fixed

- **`--lang` given with no value no longer poisons the command the interview prints.** `arg()`
  returns the EMPTY STRING for a flag typed with nothing after it and `?? 'js'` passes an empty
  string straight through, so the printed next-step command collapsed to `--lang  --budget 2.5` —
  copy-paste it and `run-author` reads the word `--budget` as its language. Both scripts now stop
  LOUD on a present-but-empty `--lang` (an ABSENT flag still takes the default, the same rule the
  money ceilings are parsed by).
- **A crashed authoring run left one line and no body — `scripts/run-author.mjs`'s spine now says
  it died.** A real run's `author-<runid>.jsonl` held exactly ONE line, `author-start`, and
  stopped: the paid pipeline threw, the error reached the operator's terminal as an unhandled
  rejection, and the spine's record of the run was **byte-for-byte what a run still IN FLIGHT
  looks like**. A log that cannot tell a death from a hang is not a record of either — which is
  why this is a fix to the record and not a new feature, even though the mechanism is new
  records. The fallible span — from just after `author-start` through the end of the main flow, a
  real scout, a real model call and a real toolchain per close stage — is now ONE try/catch, and
  nothing above it is inside, deliberately: the argv/config `die()` paths run before the spine
  file exists, and a crash record with no spine to land in is a record nobody can read (those
  still stop loud on stderr and 2). **The catch RETRIES NOTHING and SWALLOWS NOTHING**: the whole
  error reaches stderr FIRST and verbatim — before the two writes that could themselves fail,
  because a diagnosis that only arrives if the disk is writable has a dependency nobody asked for
  — and only then is it written down as `author-crash` plus `author-end {outcome:'crashed'}`.
  `crashRecord` lives in `scripts/author-readout.mjs`, where the runner's other
  untestable-in-place rules live: `name`/`message`/`code` go through `redactSecrets`, and the
  STACK — the evidence, and the string most likely to quote a credential out of a URL or an env
  value into a file that outlives the run — goes through `scrubRaw`, the ONE persist boundary,
  which redacts over the same `SECRET_PATTERNS` inventory the validator reds on and bounds it with
  the bound announcing its own size (F28). One level of `cause`, no chain-walking. A non-Error
  throw is recorded honestly rather than coerced into an Error shape. The detail is said ONCE, on
  the crash record; `author-end` carries only the outcome, because two hand-spelled copies of one
  fact are two instruments that can disagree (this file already paid for that in the
  cap-halt/pricing-red type). The spine write is itself guarded — a crash handler that crashes
  destroys the report it was built to make (F70) — and a failed append says so out loud while the
  original error still stands. **NEW EXIT CODE 4**, distinct from 1 (a refusal or a failed gate),
  2 (operator/config) and 3 (a leak): a crash is none of those, and sharing a code with a refusal
  would file a bug as a result. The leak scan still OVERRIDES a 4 deliberately — a written secret
  is the harder line, and the crash keeps both of its own louder channels. **No reader changes**:
  `classifyIncidents` (`src/ledger.js`) keys on event types it does not emit, so both new records
  fall through every branch and are simply not counted — uncounted, never miscounted, which is
  the fail-safe direction.
- **A KILLED authoring run kept losing 100% of its own money record — it now leaves a body, the
  way a crash does.** The crash catch above covers a THROW and never a SIGNAL, so a `^C` on a run
  that merely looked hung ended the process with the spine holding one line, `author-start`, and
  with the spend existing only inside the cost book, which dies with the process (F6/F12: a
  halted attempt's spend was invisible by 300×). `scripts/run-author.mjs` now handles `SIGINT`,
  `SIGTERM` and `SIGHUP` by emitting `author-killed {signal, phase, …cost}` plus
  `author-end {outcome:'killed'}` — `appendFileSync` inside `emit` is synchronous, so the record
  is on disk before the process goes — then removing its own listener and re-raising the signal,
  because the honest exit code for a signal death is 128+signo and any code set here would file a
  killed run under a name this runner's vocabulary already spends on something else. **SIGKILL is
  not covered and is not pretended otherwise**: it is uncatchable, and there is no handler to
  write for it. The killed report and the live running total read ONE list (`metered`) through
  `tallyCalls` — the same reader the library's own cost book uses — rather than a second
  hand-spelled accumulator, because this file has already paid once for a pair of instruments
  over one fact (the cap-halt/pricing-red type); `costUsd` rides as `null` when a call was
  unpriced, so the known half is reported as a `≥` floor instead of `?? 0` laundering unknown
  into $0. Both reporting seams are wrapped best-effort (`try/catch`) on purpose: progress
  reporting on a PAID run must never take down the work being paid for (F70), and the run's real
  records — `authored.json`, the crash catch, `author-end` — are all downstream and unaffected.
- **`scripts/run-interview.mjs` stops making an offer that can only be refused.** With no
  `ANTHROPIC_API_KEY` in the shell, `run-author.mjs` exits 2 at its own door before a spine
  exists, so the *"Run it now? [y/N]"* question had exactly one possible outcome and spent a
  person's attention on a choice they did not have. Unkeyed, the question is not asked at all and
  the closing line says which state it is in (*"Not offered — there is no key in this shell to
  run it with"*) rather than reporting a refusal typed on the operator's behalf. What is printed
  instead is what is actionable: the exact command, and one line saying to set the key in the
  shell from their own secret store — deliberately WITHOUT a specific incantation, because which
  store a person keeps a key in is theirs, and the one thing this script must never do is put a
  key anywhere a command line can be read from.
- **A run that landed its own terminal now dates its own stop (N4 surface §1.6).** The resumed
  leg's `deathAt` preferred the watchdog's kill record whenever one existed. That is right for a
  run that was KILLED — the process was alive, silently, right up to the signal, and billing only
  to its last emitted event under-reports the wall it really burnt — and wrong for a run that
  ENDED ITSELF. A `hitl-pause` is the second kind: a clean terminal a person may answer days
  later, and any record dated after it bills their deciding time to the run's wall. The POC
  measured the shape — a report 45 days after the pause put `RESUME_WALL_MS` at 0 and doomed the
  resumed leg before it opened, on a run that had barely started. So the preference order is not
  *"the later record wins"* but *"the run's own record wins when there is one"*: a spine carrying
  a `job-end` returns `null`, which hands `readResume` back its own documented default (the last
  event's timestamp, which for a clean terminal IS the terminal). The order moved out of
  `scripts/run-u.mjs` into `deathAtOf` (`scripts/u-readout.mjs`) so a test can reach it at all,
  with the killed-run case kept as the control, and an unreadable watchdog stamp reads as UNKNOWN
  rather than handing a `NaN` to a fold (F6).
- **A pause is a PHASE — the resume readout stops walking off the end of the plan (N4 #9).** hamr
  read `at step 2 of 1 "(unknown)"` on the first paused resume preview he drove. A pause happens
  AFTER the plan's steps, at the close's human stage, and the checkpoint a person actually meets
  reads `phase:'steps'` with every step green (the pause site emits no `outer-close` of its own),
  so the `at` line's step arithmetic ran past the plan and named an id nobody drafted. The same
  walk-off was reachable one terminal over with no person involved: a kill between the last
  `step-end` and the `outer-close` leaves exactly that shape and printed `step 3 of 2`. The
  rendering moves to `resumeAtLines` (`scripts/u-readout.mjs`, where a test can reach it) and
  holds one rule — a step count never exceeds the plan, and the phase is said in words: the human
  review, the close and its fix loop, the close after an exhausted plan, or a named next step.
  Rendering only; it decides nothing and bounds nothing.

## [0.10.0] — 2026-08-13

### Added

- **The close-AUTHORING pipeline gets a money ceiling** (`--budget`, `ceilingUsd`) — the lever
  parked at v0.9.0 as arbiter territory, approved by hamr. Until now the flow **metered** spend
  and nothing **bounded** it: the runner printed a total and no number anywhere could stop a
  call. It has **NO DEFAULT** — omitting it runs UNBOUNDED and the runner **prints that** before
  the provider is built, because a defaulted cap is a silent second ceiling (the `maxWallMs`
  precedent) and an unbounded run must be a visible operator choice. A malformed value is an
  error, never a silent fall back to unbounded. The ceiling **binds BETWEEN metered calls** —
  the survey's attempts and its F59 recovery round, and the declaration loop's author call,
  each revise, and each malformed-emission retry — because a cap that binds mid-call kills the
  row before it can be graded (F45). ONE number reaches BOTH paid seams, and spend already
  incurred folds in, so re-entering cannot silently widen it. **F6 keeps its own axis**: a
  null/unknown cost never counts as $0, so spend that cannot be *known* stops as `pricing-red`
  rather than passing silently — while known spend at or over the cap is `cap-halt` even when
  the total is unknown, since that breach is certain on the priced half alone. The stop is a
  governance stop, not an error: it names the cap and the spend, nothing retries, partial
  artifacts stay on disk, and it is DISTINCT from `artifact-red` and `provider-red`. A survey
  the ceiling stopped is named a money stop (`budgetStop`, typed cause `not-funded`, outside
  `SCOUT_RETRY_CAUSES`) instead of blaming a model that never spoke. One predicate, one
  spelling (`capStop`/`tallyCalls` in `src/text.js`, beside `priceOf` and for the same reason).

- **A resume may DERIVE `wall-halt` from a recorded `step-red`.** Only when that run's OWN
  spine shows the wall crossed BEFORE the terminal was minted — a derivation from the primary
  record, which never rewrites the recorded outcome and announces itself with a banner. The
  terminal's NAME is what gates resume (`readResume`'s `resumableOutcomes`, which the operator
  runner supplies as `cap-halt` / `wall-halt`), so a run mislabelled `step-red` past its own
  wall silently lost its resumability. **It is a PERMANENT read-side safety net, not a
  migration shim** (ruled 2026-08-13; the expiry question that was parked here is closed). The
  defect that minted the shape is fixed at source, but spines are append-only forever, so the
  population it protects can never shrink; it fires only on the run's own un-forgeable
  `wall-bounded` record, cannot rescue a `step-red` that has no wall record in front of it, and
  is a never-taken branch on a healthy spine.

### Changed

- **The two revise-loop tighten-only clamps get a detector.** `maxRevisions` and
  `structureRetries` have been clamped since `40672ae`, but nothing could *fail* if they
  stopped clamping: MEASURED, three mutations survived the whole suite — including deleting
  the `structureRetries` clamp outright, a straight revert of the fix that added it. The two
  existing tests pinned only the ceiling and the floor, and neither can fail when the clamp
  stops honouring values *between* them; the direction the rule exists to permit — the
  operator **lowering** a bound — was the untested one. Seven tests now cover the middle of
  both ranges, the non-numeric floor, and `Infinity` (a widening, which clamps to the ceiling,
  matching `runAuthorScout`'s own reading). The three floors are pinned as *deliberately
  different* (`SCOUT_ATTEMPTS` at 1, both revise axes at 0) so a later "harmonisation" has to
  argue with a test. No production behaviour changed — this is the detector the rule was
  missing (F45's class: a frozen rule without a wired detector is prose, not protection).

- **A stop past the wall never funds a replan draft, on ANY trigger.** W-2's *"no new step
  starts"* now covers the drafting call itself (hamr: *"it's a replan that is doomed to
  die"*), and the guard is trigger-agnostic rather than wired to one path. A declined grant is
  not consumed. With time left on the clock every one of these paths is byte-identical to
  before — pinned as a control.
- **The drafter is told its worker has no shell.** A replan wrote an action opening *"Run
  `npx tsc --strict --noEmit`…"*; `run` is locked out of `TOOL_MENU` permanently, so the
  worker obeyed as far as its verbs allowed — 25 reads and greps, zero edits, a whole step
  spent hunting six errors by hand, on a plan that validated clean. The no-shell law now sits
  in the DRAFTER prompt unconditionally, beside the exit-freedom law, with `read`/`grep`
  glossed as the worker's only eyes; the scout and worker prompts already carried it, and the
  one component that WRITES instructions did not. **A regex over action prose was explicitly
  refused** (F86's anti-precedent): the same sentence is legitimate in an operator's signed
  goal, so the instrument is a prompt register, never a matcher. F95.
- **The worker persona REGISTERS the arbiter's books instead of leaving them to be
  discovered.** `PERSONA_TOOLS` now names `gate-audit.jsonl`, `.smoke`, `.litectx` and the
  run's spine as always-denied — records of how the worker is judged, holding nothing about
  its task — beside the absolute-path law it is the twin of, so it renders for every worker on
  every grant (a `write`-only grant gets no component strategy paragraph at all and must still
  be told). **The fence is unchanged**: nothing widened, no book became readable. The only way
  to learn the rule was previously to spend rounds of a bounded attempt on it. F98.
- **Both signing surfaces show the GOAL and the judged stages as ONE reading.** F87's law is
  that the goal must state everything the close judges while NOTHING derives one from the
  other or checks them against each other — so the sole defence is the signer reading both
  halves at once, and neither surface offered it: `run-author` printed the declaration and
  never the goal, `run-u --approve` printed the goal and never the declaration. `run-u`'s gate
  now names every close stage (name + kind) under the goal, **for BOTH spec forms** — the
  pairing was first gated on `closeDecl`, so 10 of the 11 shipped specs (the command `close[]`
  form) still met the signer with a goal and none of the stages that judge it, the exact
  half-reading this entry claimed to end; `closeStagesOf(spec)` now renders either form, and a
  command stage prints `[command]` rather than the catalogue kind name `command-exit` it does
  not carry (spec hashes and exit codes byte-identical, proven live). `run-author`'s block moves to
  **`scripts/author-readout.mjs`** (`declarationLines(spec)`) and gains the goal above it,
  rendered from the RESOLVED spec — the bytes that get hashed. It moved because the block was
  otherwise reachable only after a paid scout and a paid model call, and a readout no test can
  reach is a readout nothing checks. An absent goal renders as ABSENT, never as a bare label.
  Still a READING and not a validator — comparing the two is the move F87 forbids.
- **README rewritten value-first** (hamr's framing, straight to `main`). The pitch now leads
  with the trust-but-verify lineage (the ralph loop, code machine MCP, and RLMs converged on
  the same principle), the three kinds of done (green / softgreen / hitl, one everyday
  example each), why the agent authors the workflow (forty-plus primitives — counted 51+
  across the suite's real surfaces — and no one recipe picked), and "build it once, keep it"
  (localhost UI, whole-workflow export with its self-healing harness). One `[WIP]` badge is
  the only status marker; all mechanics, layer tables, findings numbers and rung history
  moved out of the pitch — `bareloop.context.md` stays the contract, the README the pitch.
- **`step-stalled` joins the RESUMABLE halts** (hamr's go, 2026-08-13). A stall that trips with
  time left and only reaches the replan gate after the wall has expired kept its NAME — `run.js`
  keys the F44 spend floor on that exact outcome, and renaming it would report unknown spend as
  an exact total — but the name is also what `readResume` gates on, so keeping it cost the run
  its checkpoint. A `step-stalled` spine now previews as **RESUME**, folds the spend floor in as
  `>=$x`, and re-enters at the recorded branch and step. A pure widening of the resumable set:
  nothing else about the terminal moved, and `reuse.js`'s D4a path was checked unaffected.
- **The arbiter-book names get ONE home.** `gate-audit.jsonl`, `.smoke` and `.litectx` were
  spelled independently in `isArbiterBook`, in BOTH fence deny lists, in the `PERSONA_TOOLS`
  prose and in `run.js`'s smoke root — five sites, the exact drift class F98 had just paid for,
  with the prose copy unguardable by any test. `kinds.js` now exports
  `SMOKE_STORE`/`LITECTX_STORE`/`GATE_AUDIT_FILE`/`ARBITER_BOOK_STORES` and all five consume it.
  Purely mechanical and verified as such: the deny-list joins and the persona prose are
  **byte-identical** to the strings they replace, so no fence decision and no worker prompt
  changed, and there is no import cycle (`kinds.js` sits below `tools.js`/`run.js`).
  `tools.test.js`'s literal-spelling guard now asserts the fence consumes the constant — the
  drift it guarded is impossible by construction.

### Fixed

- **A time-stop is NAMED a time-stop — W-2 closes over the sibling terminals.** The ruling
  (*"when time is up, keep the grade we already have and stop"*) was implemented on the
  cap-halt path and not on the variance path: one run minted `step-red` **9.9 seconds past its
  own wall**, having recorded the crossing in its own spine 5.6 seconds earlier. Now **every
  variance and cap-halt terminal re-reads the clock before minting**, through ONE shared
  `wallHaltTerminal` emission site — one site, one spelling —
  and the ladder's cap-halt past the wall is a `wall-halt`. **`step-stalled` is pinned OUT of
  the class by test:** `run.js` keys `spendComplete:false` on that exact outcome name because
  an abandoned-and-reissued call may already be billed, and relabelling it would report a
  floor as an exact total (F6 in a self-heal coat). **With both allowances exhausted the MONEY
  cut is reported** (`cap-halt` wins over `wall-halt`) — hamr: *"understood"*; recorded so the
  choice stays visible. F96 / PRD v1.59.
- **A declared `count-not-worse` red gap carries the LINES it counted, not just how many.**
  `"8 match(es)"` with no file, no line and no error code is a number with nowhere to open —
  F28's rule (*the close's output format is part of the contract*) recurring one rung later
  inside the authored-close executor, with the `gapKeep` machinery it needed sitting in the
  same file. `parseValue` now returns `matched`: the **KEPT** lines only — those that survived
  the scope filter and reached aggregation, so a scope-DROPPED line is never named and the
  worker is never aimed outside its own population (F84). The harvest is **per-term**, not
  global: each term's kept lines nest under that term's own breakdown row — the one place its
  `+n`/`-n` already prints — a `first` aggregate echoes only the one line it read, and dedup is
  WITHIN a term, so a line feeding two terms plays both roles and appears under each. Harvested
  globally, a negative-sign term's lines and a `first` term's never-read lines were echoed flat
  as *the lines the count is made of*, handing the worker a line to go fix when that term
  SUBTRACTED; labelling per term rather than dropping negatives keeps the subtracted term
  visible, because under higher-is-better that is where the news is. The value is
  still computed from the parsed values and never from the list. The lines ride the EXISTING
  channel and invent none: the stage's `gapKeep` prefix on every line (Layer R's `redKeep` is
  DERIVED from it), the existing `GAP_LINE_CAP`, and the announced trim on overflow.
  **Nothing here can flip a signed spec hash** — verdict logic, baselines, counting,
  `closeDecl` schema and `detail` untouched. Measured, not asserted: the identical job, same
  patient, same hash, went from stalling at 8 and dying to **67 → 8 → 1 → 0** in three
  iterations. F98.
- **A fence deny streak ends the ATTEMPT, never the RUN — `gate-red` is extinct as a mintable
  terminal.** A converging run (close reading 46 → 10 → 8, no strikes) probed three of the
  arbiter's own books, the fence denied all three CORRECTLY, bare-agent's BA-11 deny-spin
  guard ended the loop, and the plan flow mapped that to a terminal `gate-red` — escalate,
  never retry. The run died with **$1.77 and 21.6 wall-minutes unspent, on a fence that had
  worked perfectly.** BA-11's stop now joins `max_turns` in the **bounded-attempt lane on BOTH
  worker surfaces**: `attempt-bounded` carries the `reason`, the close judges the partial
  work, the gap feeds forward, caps unchanged, the loop continues. **And the next attempt is
  told which bound actually fired.** All three attempt bounds wrote the same bare iteration
  number, so the following prompt rendered *"CUT OFF after N tool rounds"* for a denial streak —
  false on cause and count, aiming the worker at its read budget instead of at the fence, while
  `r.error` reached only the spine. The bound now carries `{iteration, cause, reason}`, and the
  denial branch quotes the recorded `denied:<tool>` terminal verbatim — bare-agent returns the
  tool name only, so no path and no streak count is invented — trimmed under `GAP_TRIM_MARKER`
  and scrubbed once at capture, one scrub shared by prompt and spine (an append-only spine that
  captures a key captures it forever). The round-bound sentence stays **byte-identical**, pinned
  by block-equality after an `includes` guard survived a sabotage prefix. This is F32's routing rule
  applied to a new stop cause, not a new one — a stop arriving AFTER gate-audited worker
  writes is non-terminal by construction, and a denial is its most benign member. **Nothing is
  widened**: the same actions are denied and the same audit rows written; a genuine scope
  escape now costs one bounded attempt instead of the whole run. The category stays in
  `EXCLUDED_ESCALATIONS` and in `ralph`'s passthrough decision table — that set is EXECUTABLE,
  so dropping the name would re-file any future emission as a counted capability gap rather
  than delete it. F98.
- **A malformed money ceiling is an ERROR at the library seam, never a silent UNBOUNDED.**
  `capStop` read `'2.50'`, `NaN`, `Infinity`, `true` and `{}` as *no ceiling* while
  `makeCostBook` advertised the same value straight back — the advertised and the enforced
  budget were different numbers, the one thing a budget may never be — and the only guard
  (`parseCeiling`) was CLI-side, so every library caller ran unprotected. A non-finite non-null
  now throws **before the first paid call**: it costs $0 and propagates uncaught, so no catch
  can launder it into an ABSENT survey. `null`/`undefined` stay the stated operator choice for
  unbounded; `0` and negatives stay finite and cap-halt immediately, pinned as they were.
- **`budgetStop` latches only when the ceiling actually ended the ladder.** The recovery-seam
  latch fired for EVERY final cause: a 1-turn transport death and even a healthy PRESENT survey
  that spent past the ceiling both came back `budgetStop:'cap-halt'`, on a field whose own
  docstring says *"the ceiling, when it is what ended the ladder"* (the second instance was not
  in the finding). The recovery predicate is settled first now, and `capStop` consulted only
  when a recovery call was actually PENDING. The genuine cap-plus-transport-death case keeps its
  `cap-halt`, but the refusal detail **concedes the concurrent cause instead of contradicting
  the `ENETUNREACH` it quotes** — and concedes it for every INCOMPLETE cause, not only transport
  death: a SHORT/EMPTY/UNPARSEABLE survey whose repair round the ceiling refused was still
  emitting *"the survey stopped on the authoring ceiling, not on anything it read"* directly
  above the reply it was quoting. `CALL_FAILED` keeps the transport wording; `NOT_FUNDED` — no
  call ever made — keeps the ceiling-only wording, the one case where it is true. No budget
  semantics moved: the PRD already said only the former is why the loop ended, and the code now
  honours its own sentence.
- **The authoring spine event rides its own stop.** `scripts/run-author.mjs` hardcoded
  `type:'cap-halt'` on the governance readout even when the stop was `pricing-red` — the only
  site in the repo where a spine event's type contradicted its own category, and a `pricing-red`
  event carrying *"not under cap"* sends the operator off to raise a number when the repair is a
  priced provider. The old spelling could also arm `ledger.js`'s capability-gap fuse on a run
  whose wallet was never empty (latent — no script feeds author spines to `updateLedger` today,
  but type-keyed slicing is exactly how F45's misread happened). The emit now spends
  `authored.stop` for both fields, so meaning derives from the stop once.

## [0.9.0] — 2026-08-09

The **close-authoring rung**. The close stops being a hand-written script and becomes a
DECLARATION over kinds bareloop owns: a user answers a six-question interview, an LLM
composes the declaration by calling a schema-derived tool, three mechanical gates run it
against the real repository, and a human signs the hash. Nothing here judges a close —
no LLM validates another LLM's close, at any point (D9). Design record (D1–D13, FROZEN):
`docs/plans/2026-08-07-close-authoring-design.md`; PRD v1.51–v1.58.

### Added

- **M1 — `src/kinds.js`, the kind executor: four kinds under three inherited runtime
  contracts.** The four kinds (`command-exit`, `count-not-worse`, `pattern-absent-in-diff`,
  `files-changed`) are the small part; the CONTRACTS every kind inherits are the
  load-bearing part, and they live in the executor where no declaration can weaken them.
  **Instrument-stop** (exit 97, `judged` withheld — a broken instrument is a CASUALTY, never
  a red; and `first`-over-nothing is *unknown* where `sum`-over-nothing is a counted 0).
  **The gap** (`gapKeep` on every line, trims announced and counted). **The changed set**
  (diff plus untracked, minus `.litectx/` by PREFIX and `gate-audit.jsonl` by EXACT path —
  so a worker-authored `src/gate-audit.jsonl` still counts). Graduated from the gate-2 POC
  executor as a REWRITE: async spawn (`spawnSync` freezes the host loop the stall fuse lives
  in, F68), caller-scoped seed worktrees under the OS temp dir rather than a module-global
  cache inside the package, and the arbiter's own `CLOSE_ENV_DENY` imported rather than
  re-spelled. **D12 rides on top: the close stores the COUNTING RULE and never a number** —
  every run measures its own seed, with the route that measured it recorded. 49 integration
  tests over real temp git repos and real child processes.
- **M2 — the catalogue, the TYPES genre, and the declaration validator: a path is SELECTED
  from the tree, never derived from prose.** One module, because the catalogue, the genre
  and the validator are one contract read from three sides, and a second spelling of any of
  them is the drift class the parser normaliser already exists to prevent.
  - **`KIND_CATALOGUE` IS the whole vocabulary.** The four live kinds are keyed to the
    executor's own `LIVE_KINDS` and asserted equal in BOTH directions. `judged-floor` and
    `human-confirms` are LOCKED menu entries — a distinct `locked-kind` red at validation,
    before any tokens, carrying `verb` + `lib: 'bareloop'` so the demand is counted on
    structured fields and never filed against a bare-suite package (the BA-2 class).
    `harness-loop` (TESTGEN) is **ABSENT** — no entry at all, so declaring it is an
    unknown-kind typo, which is the honest reading of a kind that is out of v1.
  - **The genre template is FROZEN TEXT.** The suite reads addendum 3 out of the prereg and
    compares BYTES, so a paraphrase in source fails the build rather than quietly changing
    what every future close is authored against. The JS 7-pattern and Python 5-pattern
    suppression batteries come from the hand-written closes' own `SUPPRESSIONS` tables —
    operator-owned genre knowledge now. Two residues land as genre DATA, ours to inject and
    never model-filled: guard **SCOPE** (`no-suppressions` ships with NO scope and nothing
    left to fill — the POC's arm A narrowed it to the two target files, which reads stricter
    and is not, because a suppression in a new helper walks straight through; narrowing an
    injected guard is a red, not a taste) and genre **ENV** (`MYPYPATH` is expressed here and
    applied by the flow — it moves no seed number, so no seed-verdict read can ever catch its
    absence, and a declaration that authors it itself reds `genre-owned-env`).
  - **The validator**: schema, kinds, params, F49's static nested-quantifier reject over
    every model-authored regex (the detector itself untouched — monotonic-only), the parser
    through M1's normaliser verbatim, and the **F84 one-population law in both halves** (a
    count over a scoped job must NAME its population; the same cmd+parser+scope declared
    twice is one number wearing two stage names — with the in-scope/outside split, the thing
    the law exists to protect, asserted to stay legal). Plus **hamr's listing rule**: every
    path-like param must SELECT from the seed listing. The POC's arm A derived
    `src/alertEmail.js` from the user's prose and silently reclassified 15 real errors into
    the wrong population; no READING of a declaration catches that, and a prefix match
    against `git ls-tree` does. The red hands back what DOES exist beside the invented path —
    named items, counted, capped (F38/F39), never a paragraph.
  - Three preconditions fail CLOSED, all guarding one failure — *a validator handed nothing
    to check against reports a declaration it never examined*: `listing` and `guards` absent
    are reds, and `envOwned` splits ABSENT from EMPTY (`[]` is a genre that owns no
    variables; `undefined` is a caller that never asked — F59's distinction in the shape it
    bites here). One disagreement the tests caught and the code won: a bare `**` is **NOT a
    root** — `globToPrefix` collapses only the `/**` SUFFIX, so admitting it would put the
    validator and the grader on two spellings of one scope (the F9 red class): green at the
    gate, and a containment guard that reds every file at runtime. It reds. 46 tests TDD,
    watched failing first; 54-mutant battery, ZERO survivors (six holes closed on the first
    pass).
- **M3 — the declaration is CALLED, not written** (`src/authorscout.js` LOOKS,
  `src/authorflow.js` WRITES; neither ACTS — D11's split). The load-bearing change against
  the gate-2 POC is hamr's schema-forcing ruling: the model answers by calling
  **`declare_close`**, whose input schema IS the declaration shape and is DERIVED from the
  catalogue — kind list, locked-ness, parameter names and every enum read from M1/M2, with
  `schemaCoverage` failing the build loudly if the catalogue ever grows a parameter the
  schema cannot express. A malformed emission is an artifact-red on its own bounded axis; the
  tolerant text parse survives only as a marked fallback for a provider with no tool mode.
  - Two consequences named rather than smoothed: **a locked kind now has no schema branch, so
    declaring one is INEXPRESSIBLE** — which means M2's `locked-kind` demand counter is
    reachable only from the interview layer or the text fallback, and the header says so
    instead of pretending the channel is intact. And the tool is an OUTPUT CHANNEL that takes
    no action, so D3's "no tools at all" is untouched: **hamr's law is about actions, not
    syntax.**
  - **Measured, both arms against the real `Loop`:** stopping the loop inside the tool costs
    1 provider round and $0.001; unwired costs 2 and $0.002 — tool mode does not cost double
    what text mode did.
  - Three defects found by the tests before a run found them: a FLAT directory beat every
    listing tier (200 names render as 200 names at "counts-only"), so the prompt ingredient
    was unbounded — names now give way, counts never do, with a backstop bounding the block
    that beats every tier; an unreadable listing returned no `files` key at all, which
    destructures to `undefined` and reads as falsy-empty (the exact absent-renders-as-empty
    shape this module exists to refuse); and the genre-env injection rewrote stages it had no
    reason to touch, making the signed form differ from what the model wrote for no stated
    reason. **F59 is enforced five ways and refuses at $0** — an ABSENT survey, an EMPTY facts
    object, an unreadable listing, an empty tree and an unbuildable genre variable each stop
    the flow before a token is spent. 1222/1222; 40 of 41 mutants killed.
- **M4 — the close is a SIGNED FIELD, not a compiled script** (`closeDecl`,
  `src/declaredclose.js`, `src/authorjob.js`). **The integration decision is made in the open
  and named in the source:** a declared close is carried by a new spec field and executed by
  M1's own kind executor. The cheaper alternative — render each declared stage as a shell
  one-liner and let the existing `close[]` path run it — is REJECTED, and the rejection is the
  point: it would turn owned kinds back into authored shell strings, which is exactly what D3
  makes inexpressible. A declaration whose meaning is a generated `sh -c` is a script with
  extra steps, and the arbiter would be judging text nobody validated.
  - **Two executors, ONE contract.** Every behaviour the command path already had is pinned
    by a test on the declared path: first-red-wins with the deciding stage naming itself; the
    forbidden zone routed by a TYPED fault (`STOP_FAULTS`, stamped in M1 at the site that
    OBSERVED it) so a timeout still offers *"raise the close timeout"* and a spawn failure
    still offers *"fix the close"*; the gap header from ONE template (`stageGap`, now exported
    — `src/trend.js` parses that exact line); the scrub at the emission boundary; and the
    check menu still derived from stage names, one hop, one direction.
  - **`close` and `closeDecl` are ALTERNATIVES, refused rather than merged**
    (`close-duplicated`): a spec with two closes has two arbiters, and *picking one silently
    is how a signed artefact stops meaning what the signer read*. The declared close is
    HARD-class in the SAME table the close types use (`CLASS_BY_CLOSE.declared`), so a locked
    verdict on one reds twice — as counted demand AND as `close-hierarchy`.
  - **The gate is SPLIT honestly, not skipped.** A job spec is validated with no repository
    in hand, so the listing rule and the scoped-job derivation that arms the F84 law are
    DEFERRED there — `deferListing: true`, spelled literally, with `grounded: false` on the
    result — and the RUNNER re-runs them against the real seed before any stage and before any
    token. Proven both ways: the invented path `src/alertEmail.js` passes the spec gate and
    dies at the runner, with **zero provider calls**.
  - **D8/D12 ride together.** The seed is HEAD at run start, READ and recorded on a
    `close-decl` spine event, never typed and structurally absent from the signed spec —
    `seedRef` is an unknown-field red on `closeDecl`, because a baseline frozen at signing
    judges run 5 against run 1's tree. `baseline: "seed"` is measured at each run's own start,
    every run.
  - **Two things the bridge adds**, because the declared executor knows more than an exit code
    does: a `gapKeep` derived from one prefix constant, so Layer R's red-set has an instrument
    on this path too; and a TREND VALUE donated **only** for `lower-is-better` — the omission
    is the load-bearing half, since `trend.js` reads improvement as `value < best`, so donating
    a higher-is-better test-count floor would read a DROPPING count as convergence and
    recommend a top-up on a dying run. Null is the honest answer (F6); the stage position still
    travels.
  - **F90, two findings, neither found by a failure.** The design record's one named defect
    (D13's ledger request-red misattribution) was ALREADY FIXED on `main` four days before the
    record was written, so what M4 owed was the PROOF the new emit site routes through it — a
    regression test walking refusal → `refusalEvents` → `classifyIncidents` → `suggestedAsk`,
    asserting the ask reads "bareloop:" and names no bare-suite package, with both halves
    killed as separate mutants (*a frozen document is frozen against rewriting, not against the
    world moving underneath it* — F63 in its cheapest form). And a SECOND gap renderer silently
    blinded Layer R's trim detector: it refuses to compare a red-set from a trimmed window by
    looking for ralph's own marker, and the kind executor announces its trims in different
    words — the direction that MANUFACTURES a fixation reading out of a blind instrument. Fixed
    by exporting the executor's marker and reading both. *The shared-marker guard held
    perfectly and was still defeated, not by drift but by a producer the reader had never heard
    of.*
  - 46 new tests over real temp git patients, real child processes and real `runPlan` (the
    runner seam is the highest-risk part of the module and nothing there is mocked). 1268/1268;
    mutation battery 22/22 after one honest survivor — a test asserting `reds.every(…)` over an
    array the mutant left EMPTY, the conditional-over-a-never-true-fixture trap in its
    `.every([])` form.
- **The interview re-keys from GENRE to VERDICT CLASS, and the pick is a PROMISE** (PRD v1.57
  §1–§2 — **this SUPERSEDES D4**). `verdictType` is a USER-facing RADIO (`green` | `soft-green`
  | `hitl` — the spelling already shipped in `job.js`; the design brief's `softgreen` would have
  flipped every signed hash). **v1 admits only `green`**; a locked pick returns the counted
  `request-red` refusal BEFORE its questions run.
  - `QUESTION_SETS` replaces `TYPES_QUESTIONS`. The green set is TYPES' **six** questions
    byte-for-byte — they were already genre-neutral, so generalising meant DELETING the D13
    genre-confirm slot, not rewording. Locked sets carry `questions: null`, never `{}` (absent
    is never empty, F59), and `questionsFor` THROWS on them: reaching questions means admission
    failed to refuse. Genre understanding moves into `CLASS_STATEMENTS` fed to the composer, and
    the genre refusal moves to the composer on the same counted path.
  - **The guard battery re-homes to the class** (hamr: *"battery ties with job type"*).
    `CLASS_BATTERIES` keys attachment — which guards, and their un-removability — off the class;
    the tool-specific contents fill at COMPOSITION from the language the declaration names. **An
    empty battery is IMPOSSIBLE, enforced not asserted**: unknown class, locked class, unknown
    language, empty fill and zero guards all THROW.
  - **Class-vs-ceiling, ruled *"yes to both, go"*:** every catalogue kind carries its
    `verdictClass`, and a declaration whose ceiling EXCEEDS the pick is an honest
    `class-ceiling` red naming the kind — never a silent upgrade or downgrade. Inert in v1 by
    construction, and proven FIRING against an injected soft-green kind.
  - Driver: **`--verdict` is REQUIRED** — a defaulted radio would answer the user's question for
    them; `answers.json` drops key 7. Live smoke: `--verdict hitl` refuses at $0
    decision-ready, `--verdict green` runs to the provider boundary. 14/14 mutants killed; the
    saved PREPARED python spec still validates post-rework. 1354/1354.
- **The scout gets 3 typed attempts, and every raw lands in the books** (PRD v1.58). hamr's
  rulings in the register, verbatim: *"retry on scout too, tighten-only same as revisions"*;
  *"depending on causes, we can hardcode 3 attempts, but if reasons are beyond malformed then we
  may verge into self-healing … i don't think we should"*; *"for audit, it should come on top of
  existing audit trails … scrub for common things in general"*.
  - `SCOUT_ATTEMPTS = 3`, hardcoded; the `attempts` parameter is TIGHTEN-ONLY and CLAMPS rather
    than throws (floor **1** — a scout that never ran is an ABSENT nobody can act on). The gate
    reads TYPED causes stamped at the detection site and **only the malformed class retries**
    (`empty` | `unparseable`). What is excluded is excluded for a reason: `call-failed` covers
    transport and `truncated:max_tokens` (provider-red, no redraft), `short` is F59's cut-off
    population and already has its own instrument INSIDE the attempt, and `non-object` /
    `empty-object` are valid JSON with vacuous content — a SEMANTIC failure, which F38/F39
    measured as the same distribution sampled twice. **That is the self-healing line, and it is
    not crossed.** The re-ask is TOOLLESS over the survey's own conversation, naming the
    mechanical parse error and position and nothing else — the repository was already read, only
    the emission was unreadable. **There is no JSON repair behind it and there never will be**: a
    repairer decides what the model MEANT and writes it down as though the model had said it, in
    the one artefact whose whole job is to be honest about what a repository contains.
  - **`raws` — what every model call actually SAID**, the scout's attempts absorbed alongside the
    declaration's, in the cost book's own order and under the same labels it meters. `scrubRaw` /
    `RAW_PERSIST_MAX` (8000) / `RAW_TRIM_MARKER` join `src/text.js` as the third one-spelling
    model-output helper — a NEW trim spelling deliberately, because `GAP_TRIM_MARKER` has a
    reader with a different meaning (F90). One recorder writes the cost entry and the raw
    together (labels pinned pairwise by test), the cut is walked back off a continuation byte so
    a multi-byte character is never split, and **raws are present on the `$0` preflight refusal
    paths too** — the path that spends nothing more is exactly the one whose evidence used to die
    with the process. `iterations` records what a turn MEANT; `raws` records what it SAID, and a
    malformation is only ever visible in the second. Attribution fix found mid-build: the
    classified blob is tracked BY INDEX, not `raws.at(-1)` — an F59 recovery discard had
    mis-stamped the verdict. E2E replay of `mslhn707`'s real failure shape: 3 labelled calls,
    raws carrying causes and attempt indexes, reason *"— after 3 attempts"*, and a planted
    key-shaped secret scrubbed to 0 across the serialized artifact. 1405/1405.
- **The WORK BRANCH is a hard rule, enforced STRUCTURALLY** (PRD v1.57 §3; `src/workbranch.js`).
  hamr's ruling, built as ruled: *"The agent creates a NEW BRANCH before it touches any code — a
  HARD RULE, no exceptions… Named with a meaningful slug."*
  - **Structure over ordering:** `mkWorker` — the single seam that grants write-class verbs —
    THROWS a categorised interpreter-red if asked for a writable worker with no branch prepared.
    That covers both write sites and any future third, which an ordering rule cannot. The seam
    sits at planrun step 0c: after the $0 precheck/preflight (an already-green tree leaves no
    branch behind), before the scout (every branch fault is an instrument stop costing zero
    tokens).
  - The slug is `bareloop-` + the SIGNED spec's `job` field, kebab-validated and INSIDE the spec
    hash, so the name cannot drift from what was signed (goal prose was rejected as a source, and
    the rejection is documented). `WORK_BRANCH_RE`'s alphabet makes `..`, `@{`, `.lock`, a leading
    `-`, and **`main`/`master` inexpressible**; `prepareWorkBranch` re-validates even a
    hand-passed name. Collisions take `-2`/`-3` suffixes (one blast radius per try). **Resume
    returns to ITS OWN recorded branch** (a `work-branch` spine record; `readResume`'s
    `restart.branch`), and a recorded branch that is GONE is a STOP, never a fresh start — the
    surviving mutant taught the assertion to demand the arbiter's own wording. **`branch-red` is
    a distinct terminal, excluded from ledger classification** (an interpreter-red would aim an
    upstream ask at a library for a patient nobody prepared). Adjacent fix: `relay` now passes
    the category through instead of filing wiring faults as transport casualties.
  - **Consequences recorded in `bareloop.context.md`, hamr-agreed:** the patient must be a git
    repository with at least one commit, AND is always a separate COPY of the treated repo, never
    the original — *"keep patients copies separate from original, always"*; the copy is the blast
    radius. A detached HEAD attaches (`from: null`); a subdirectory workdir branches in the
    enclosing repo (pre-existing semantics, now on the record). 18 new tests against real tmp git
    repos plus guard/resume coverage across `planrun`/`run`/`reuse`, watched failing first; 2
    sabotages and a mutation pass. 1387/1387.
- **`scripts/run-author.mjs` — the authoring driver, now tracked**, and the paid proofs it
  bought. **pulselog (JS) reached SIGNING PREPARED twice** ($0.25 / $0.22), with the trial gate at
  32s and a **byte-identical spec hash across cold runs**. **aurora (python) refused honestly
  twice**, and both refusals were the product working: run 1 a real uncrafted `mypy` fatal
  (symlink `MYPYPATH`), run 2 the scope filter dropping error lines reported through a symlink
  spelling — where the crash-stop correctly refused a 0-count instead of minting a fake green on a
  tree carrying 16 strict errors. The fix then converted that refusal **for $0 on the same saved
  declaration**: SIGNING PREPARED, all three gates green, `typecheck-spawner` honest RED at seed
  (16 vs 0), `specHash` byte-identical to the failed run's own hash. Second sitting, $0.59 (F93):
  `mslsnnzk` $0.345 diagnosing, `mslwbkz7` $0.245 validating the fix live — same composed shape,
  GREEN `value=0` with the dropped-count note, three gates PASS, SIGNING PREPARED on the reworked
  code. F91 / F92 / F93.

### Changed

- **`maxRevisions` joins every other cap as TIGHTEN-ONLY.** The bound predated the law:
  `maxRevisions: 50` bought fifty revise rounds, and unlimited revising is exactly the
  thrash-as-adaptation the prereg forbids. The clamp lives at the ONE seam inside `authorClose`,
  so it is not a rule any caller can be trusted to keep — the loop reads a DERIVED cap and the
  parameter never reaches it. The floor is **0** (author once, no revise round — already a legal
  loop shape) rather than the scout's floor of 1, and a non-finite or negative value lands on the
  floor instead of a bound the loop never enters.
- **`structureRetries` becomes tighten-only** under the constant that already claimed to be its
  ceiling, and **`effectiveTimeoutMs` with it** — the same direction every cap in this system runs
  in.
- **Absolute paths join the command deny-floor, rejection-only.** `checkKind` gained a command
  deny-floor plus an absolute-path/traversal refusal during the review rounds; drive-absolute
  spellings (`C:\…`) were the gap left in it. Monotonic: the floor only ever adds rejections.
- **The ten hand-written close scripts import `JUDGED_MARKER` from `src/kinds.js`** instead of
  respelling `judged=1` as a literal (hamr-approved wiring). Output proven byte-identical by
  EXECUTION on all ten; no signed spec hash flips (`jobSpecHash` covers the resolved spec object,
  not script bytes). **Known new coupling, recorded not hidden:** close scripts now import the
  `src/` graph, which matters if they ever ship standalone.
- **A GREEN declared close now reports what its stages announced** (`notes`). `translate()`
  computed a stage's gap text and threw it away on GREEN and on INSTRUMENT-STOP — but M1's kinds
  announce some things whichever way a stage lands (a declared env var that was dropped, the scope
  filter's own arithmetic), so the bridge was dropping the **check-both-greens** audit trail on
  the floor. Surfaced as `notes`, absent when empty, per stage as well as on the summary — and
  deliberately NOT `.gap`, because every consumer downstream guards with `if (gap)`, so a green
  carrying one would read as revision-worthy and a stop carrying one would look like a verdict it
  never rendered. Verified inert: every spine reader keys on `verdict`/`gap`/`stage`, nothing
  routes or bounds on this field, and **no verdict moves.**
- **`assembleSpec` REFUSES a draft that already carries the authored half** instead of clobbering
  it. It used to drop a draft's `close` on the floor and stamp its own `verdictType` over the
  operator's, silently — the case `src/job.js` already rules on in its own words (*"picking one
  silently is how the signed artefact stops meaning what the signer read"*), one step earlier. Now
  a named refusal over `AUTHORED_SPEC_FIELDS` (`close`, `closeDecl`, `verdictType` — the fields
  the fold WRITES, named as data so the refusal and the fold can never disagree about which half
  of the spec is which), and `run-author` asks the same question at **$0 BEFORE the scout**, so
  the answer never arrives after the model has been paid.
- **`closeStagesOf(job)` is the ONE staging every close consumer reads**, widened to both fields
  — a consumer reading `close` alone sees a declared job as CLOSELESS and offers the drafter an
  empty check menu. `scripts/consolidate-bridges.mjs` was still calling `stageClose(spec.close)`
  and refusing declared-close specs for the one reason untrue of them; migrated (a spec with
  neither field still dies honestly).

### Fixed

- **F93 — the broken-ruler guard read match counts AFTER the scope filter, so a LIVE tool over an
  empty population read as a DEAD one** (`src/kinds.js`). `count-not-worse`'s crash guard summed
  `breakdown[].matches`, which `parseValue` tallies after the scope filter has already dropped the
  out-of-population lines. **Two entirely different worlds collapsed into that one number**: a
  tool that crashed before it looked at the tree, and a tool that RAN and printed parseable
  findings which all fell outside this stage's scope. Run `mslsnnzk` paid for it: `npm run
  typecheck -- --strict` exited 2 and printed **67 real `error TS\d+:` lines**, every one under
  `src/`, against a stage scoped `excludePrefixes: ["src/"]` — post-scope the count was 0, the
  stage stopped as a crashed instrument, and **a good close was refused at gate 2**.
  - The same two-faults-read-as-one class the `first` aggregate's own stop had already SPLIT in
    its own comment; the `sum` path carried the unfixed twin. `parseValue` now reports
    `preScopeMatches`, tallied where LIVENESS lives — before the filter has an opinion, kept +
    unattributable + dropped alike — and the guard consults that. A genuinely silent non-zero exit
    still matched nothing pre-scope and still stops: **the fail-safe is untouched in the direction
    it was chosen for**, and the accepted limit for `grep -c` / pytest-5 stands unchanged. One
    `parseValue` call site (`measure`) serves both the current tree and the seed worktree, so the
    baseline-side measurement gets the same reading by CONSTRUCTION; `command-exit` and
    `pattern-absent-in-diff` never touch it.
  - The stop lane also stops throwing away its own diagnostics: `stopped()` takes the notes a
    measurement had already computed and renders them under the stop, so a `first` term whose every
    match was scope-excluded sends the reader to the SCOPE instead of hunting a parser bug.
  - **Validated live, not asserted:** `mslwbkz7` composed the same shape on the post-fix code and
    walked to SIGNING PREPARED — GREEN `value=0` with the dropped-count note, three gates PASS.
    F92's shape-lottery framing is **refuted in part**: the model composed the same correct
    inside/outside split 3/3 (systematic, not a roll); what varied was the AGGREGATE, and only one
    of the two resulting stops was a defect. The attribution was corrected the same night off the
    artifacts — the crash guard fired **once**, on `mslsnnzk`; `mslhpw2v`'s stop was the
    `first`-path fail-safe working as designed. **The parked re-compose-on-refusal lever survives
    as a build and loses this run as its justification:** a retry loop cannot heal a mislabeled
    instrument.
- **The scope filter and the FENCE compare FILES, not spellings.** The live python rerun refused at
  the seed gates because `mypy` under `MYPYPATH=src` reports every error through aurora's tracked
  symlink spelling (`src/aurora_spawner/…`) while the declared scope held the physical spelling
  (`packages/spawner/src/…`) — the lexical filter dropped all 16 real error lines, and 0 matches +
  exit 1 tripped the crash-stop. **The fail-safe did its job on first live contact:** without it, a
  COUNTED ZERO against baseline 0 would have minted a fake green on a tree carrying 16 strict
  errors. Fixed by resolving BOTH sides to physical identity via `realpathSync` **on a lexical miss
  only**, per-call cache; unresolvable paths fall back to lexical (fail-open killed by sabotage AND
  by a pre-existing shipped test), and a symlink resolving OUTSIDE every prefix stays excluded.
  - Then hamr: *"fence fix approved, wire both."* The two remaining lexical sites get the same
    mechanism through one shared `underPrefixEither` (lexical first, physical only on a miss; a
    null physical resolution is the old fence byte for byte): `runFilesChanged`'s `allowPrefixes`
    containment and `runPatternAbsentInDiff`'s scope. **The gap was REAL, not hygiene** — a
    watched-failing test proved the `no-suppressions` guard (the F87 antidote) scanned NOTHING and
    read GREEN over a real `@ts-ignore` when the scope was declared through a symlink spelling. A
    fake-green lane, now shut; the widening direction (spelled inside, physically OUTSIDE) stays
    shut, killed by sabotage plus three shipped tests. `globToPrefix`, the `..`-prohibition and the
    crash-stop are untouched. **Accepted limit documented in-code:** a DELETED file inside a
    symlinked package has no realpath and falls back to lexical — a possible false red on
    aurora-style deletions, which is the fail-safe direction, left until a live run trips it.
- **On a RESUME the work branch is prepared BEFORE the $0 instruments** (`src/planrun.js`). Steps
  0a (close precheck) and 0b (check preflight) are readings OF A TREE, and on a resume the tree
  that matters is the recorded work branch — it holds the work already paid for and IS the run being
  continued — but the seam that puts the run on it sat at 0c, below both. Standing on the handed
  ref, the precheck could read `already-green` off a tree that is not this run's, and every
  `baseline: "seed"` stage would baseline against it: **an instrument reading the wrong subject,
  reading honestly and saying nothing true.** One ordering split, one seam — `prepareBranch` is
  defined ONCE (the branch-red refusal is written once, so two call sites cannot drift into two
  messages) and called before 0* on a resume, at 0c otherwise. The cold ruling is untouched: an
  already-green COLD tree still returns above 0c and leaves no branch behind, because that clause
  is about MINTING and the resume arm creates nothing (`created: false`). A resume whose branch is
  gone or foreign now stops `branch-red` before the arbiter grades anything at all — earlier, free,
  deterministic. (Reported by `/code-review` and deliberately NOT fixed there: the ordering is ruled
  territory, parked for hamr's word and landed on it.)
- **The persisted-copy scrub class closes its 3rd, 4th and 5th instances** — a string reaching a
  record that OUTLIVES the run by a path the single redaction boundary does not cover.
  - **3rd, both declaration gates:** validator reds were persisted VERBATIM — and gate 1b quotes
    the SEED LISTING via the did-you-mean helper, so a secret-shaped FILENAME in the patient tree
    reaches the persisted red through a channel the spec sweep structurally cannot see (measured:
    spec clean, red leaks). Fixed at both gates with one shared `scrubRed` over every string field
    — a detail-only fix was sabotage-proven INSUFFICIENT, because the structured `cmd` field ships
    verbatim — plus symmetry wraps on the provider-derived channels.
  - **4th, `src/authorscout.js`:** `record()` scrubs a raw at CREATION, when the verdict is not yet
    known, and the verdict was ASSIGNED onto the stored object afterwards. `reason` is the worst
    field to do that to — `classifySurvey`'s `CALL_FAILED` route quotes the transport's own error
    prose verbatim, a string nobody here wrote and nobody bounds — and the raws land in
    `authored.json` and on the spine. **The scrub had become a property of WHEN you knew the
    verdict.** Fixed by making the stamp a FUNCTION rather than an assignment (`stampRaw` in
    `src/text.js`, which `scrubRaw` renders its own two fields through): one place decides how a
    diagnosis becomes persistable, exactly as one place already decided it for the text. `cause` is
    enumerated and passes through untouched — masking a closed set would only hide a bug in the set.
  - **5th, `src/authorjob.js`:** `notes` is the one FREE-TEXT field a model writes straight into
    the SIGNED `closeDecl`, and it was the only string on that boundary not riding `redactSecrets`
    while every sibling does. No live leak today (inputs are pre-scrubbed upstream and
    `sweepSecretLiterals` reds a secret-shaped note on the way to signing), so this is the
    defense-in-depth half of the class. Hashes are untouched: `redactSecrets` returns a
    non-matching string byte-identical, and no fixture or signed spec carries a secret-shaped note.
  - Every regression watched failing first with the RAW TOKEN in the actual, then watched passing,
    then each fix sabotaged in turn and its test watched red again; assertions demand
    `scanSecrets(JSON.stringify(…)) === []` **plus the mask and the surviving prose around it** —
    masked, never deleted.
- **The whole-branch review's fifteen, in three shrinking rounds** (F91). Round 1: the genre-env
  envelope survives re-validation; the command deny-floor lands in `checkKind`; `cleanup()` never
  throws; the crashed counter (nonzero exit + 0 matched lines) routes to an instrument stop with
  seed baselines included; `effectiveTimeoutMs` becomes tighten-only; plus a `renderSeedReadBlock`
  scrub (a two-headed leak) and a tautological Layer-R trim test rewritten to be ABLE to fail.
  Round 2, a fix-diff review OF round 1: `renderRejectBlock`'s scrub (a second leak channel of the
  same class, found by reviewing the first fix's diff), genre-env checked at the GROUNDED gates,
  `envCapableKind` consolidated so injector and validator cannot drift, and the crash-stop's
  `grep -c` / pytest exit-5 blind spot documented as an accepted fail-safe limit. Round 3, a
  validation sweep: guard-name-keyed `scopeOfJob` + `AT_MOST_ONCE_KINDS`, `resolveSourcePrefixes`
  realpath-dedupe (measured live on aurora), the notes divergence closed, `parseValue`'s first
  aggregate keeping its notes, scout recovery preferring `s2.error`, and `addedLines`' stat-throw
  announcing a note. 19 new tests sabotage-proven; mutation micro-batch 5/5 killed.
- **`/code-review medium`'s five.** Validation reds are scrubbed WHERE THEY ENTER THE RECORDS — the
  model-facing copy was masked and the persisted copy was not. The diff scanner's header skip is
  scoped to the PREAMBLE, so an added `++` line can no longer hide a suppression from the guard.
  Worktree cleanup READS git's result instead of assuming it. Plus the two caps above. Each fix
  carries a regression test proven failing against the pre-fix code; the suite was independently
  re-run rather than taken from the reviewer's own gate.
- **`/diff-review`'s ten land as nine fixed and one DROPPED with its reason.** Beyond the four in
  *Changed* above: the dead `d.code !== 0` clause (git's `ok` IS `code === 0`; a spawn fault carries
  `code: null`); one test running the same declaration through BOTH first-red-wins loops, since the
  deliberate duplication had nothing pinning it; the collision walk's check-then-act NAMED rather
  than closed, because `git checkout -b` already refuses an existing branch (measured, exit 128) so
  the race ends in the stop below it; `scoutReaskTurn`'s rendered text; and `buildSeedListing`
  rendering the `full` tier TWICE on every run that never needed to degrade. One finding **REFUTED
  as a bug and kept as a fail-safe**: the retry ladder's re-survey arm is right — a toolless re-ask
  rests entirely on *"the model already read the tree"*, and an empty transcript is that premise
  gone — the HEADER was the thing that lied, so the header tells the truth and the branch gets the
  test its always-non-empty helper had prevented. **DROPPED (S3):** every `process.exit(2)` in
  `run-author` fires in the argument-parsing preamble, before the script's first stdout write, so
  there is no queued output for F71 to discard — and `die` is used in expression position
  (`return die(…)`), where `exitCode`+return would let a fatal unreadable-JSON CONTINUE into the
  run; the post-output paths already use `process.exitCode`.

Suite **1422/1422** on a single clean run; `typecheck` and `build:types` exit 0.

## [0.8.0] — 2026-08-07

### Changed
- **The variance meter REPORTS progress — and still decides nothing on it** (F85, A+B;
  `src/planrun.js`). The meter stopped a step that was CONVERGING and then told the redrafting
  planner that step's exits were *"unmoved"*. Two instruments over one run, and only one of them
  right. Live on `u-msh70zla`: the close gaps went 30 → 24 → 15 → 14 with the ladder recording
  `distinctGaps 3` / `strikes 0`, while the replan brief said nothing had moved and the materials
  said *"0 step(s) completed"* — so the replanner, told it had achieved nothing, rebuilt a file
  that was already at zero errors, wrote nothing twice, and the run died with $1.09 and 7 minutes
  unspent. hamr's ruling, verbatim: *"meter is right but missing a piece … it should give heads up
  on money/time + progress for llm to judge."*
  - **The firing condition is byte-identical** — `moneyShare`/`timeShare >= 0.5`, both axes, the
    same threshold, the same throw. A progress term in the TRIGGER would make a governance
    instrument over an operator-owned allowance judge capability, so a converging step that is
    eating the run is still stopped. What was missing was never a term in the condition; it was
    the READING.
  - **The reading is read off `src/trend.js` — the SAME instance the money halt reads.** Nothing
    new is computed at the meter: no second reader, because two instruments answering one question
    is the exact defect being fixed. Per-stage, stage names and numbers only, and `unknown` stays
    `unknown` — a close that reports no number donates nothing (F6).
  - **The hardcoded `with its exits unmoved` string is DELETED.** It printed on every step-variance
    stop whatever had happened, and on `u-msh70zla` it was simply false. The escalation detail —
    which a human reads and which the replan brief quotes — now states the meter's fact (*a share of
    the run was consumed*) and then the trend instrument's measured reading, as two separate claims
    rather than one fused verdict on the work. The materials `progress` line keeps its structural
    sentence (*"step N of M did not finish; K step(s) completed before it"* — a plan's shape is what
    the planner re-allocates) and gains the close trend beside it.
  - **Spine change:** the `variance` record gains `trend` / `motion` / `reading` / `series` — the
    same four names and the same shapes the money halt already emits, so one reader parses a
    progress reading wherever it appears. ADDED fields, never repurposed ones (the spine is
    append-only forever). Measured post-fix on `u-mshcpdg4`, iteration 3 on `finish-strict-typecheck`:
    `moneyShare 0.497`, `timeShare 0.769`, `axis time`, `trend "converging"`,
    `reading "still progressing — typecheck 30 → 15 → 15 → 1"`,
    `series [{stage:"typecheck",values:[30,15,15,1]}]` — against `u-msh70zla`'s pre-fix record, which
    carried the shares and nothing else.
- **`runTrend` was blind to everything a STEP achieves** (F85, the prerequisite found en route). The
  run's trend reader was fed only the close PRECHECK and the outer fix loop, so a meter firing
  mid-step had nothing to report about a step that had just gone 24 → 15 → 14. Two folds corrected:
  a step's failing check is an arbiter-rendered close grade (same `runStages`, same chain, same stage
  names) and is now recorded like one; and it is recorded on the RAW gap, because `evalExits` wraps
  stage output as `check "<name>" red: …` and that wrapper line carries the word "red" with no number
  on it — so every step grade used to donate a null. Measured on `u-msh70zla`'s own archived gaps:
  raw reads `typecheck 24 → 15 → 14`, wrapped reads nothing at all. Plus a **preflight seed** so the
  counter has a baseline: the precheck reds at the close's FIRST failing stage (first-red-wins) and
  every shipped close opens with `changed-from-seed`, so the numeric stages had no baseline at all and
  a run would read `unknown` on exactly the stop the readout exists for. Seeded ONCE PER STAGE, off the
  reader's own books — the precheck and the preflight menu grade the same unchanged tree back to back,
  and a repeated baseline in a series reads as an attempt that achieved nothing, which is the phantom
  flat step this change exists to remove.
- **`tests/resume-u.test.js` is decoupled from the live job spec.** It read
  `jobs/bareagent-u-types.json` while hardcoding $8 / 45min, so an operator budget edit on a live spec
  turned the suite red. Every number now derives from the spec it reads, proven by passing at a third
  budget value. Suite: **1023 tests** (1027 minus the 4 deleted with the `never wrote` feature below);
  typecheck and `build:types` exit 0.
- **The per-step model tier menu narrows to `['sonnet']`** (`STEP_MODELS`, `src/plan.js` — a PUBLIC
  surface: a plan declaring `model: "haiku"` is now REDDED by `validatePlan` with `invalid-value` at
  `steps.N.model`, carrying the menu). hamr's order, verbatim: *"haiku should be dropped to see if it
  passes, if it's agent poor work or harness, like always."* **This is a reversible ATTRIBUTION PROBE,
  not a finding that haiku is incapable** — what the $0 archive read behind it shows is a CONFOUND, in
  both directions. Over 186 spines / 71 accepted plans / 255 steps, only **20 steps ever declared a tier
  at all**: haiku **12** — 9 of them on a REPLANNED plan, 6 the LAST step of their plan, round bounds
  3–12, **2 ever green** — against explicitly-declared sonnet **8**, 2 on a replan, 3 last, bounds 14–32,
  **5 green**. The planner reaches for haiku on steps it judges mechanical, and a replanned step sits on
  a run already in trouble, so neither column is a controlled read; and all three bareagent-u runs of
  2026-08-06 tiered their replanned step down (haiku/6, haiku/8, haiku/12) and all three failed. That
  confound sat directly on top of the programme's most recent capability read (F86's tail). Removing the
  tier is how it gets attributed: with one tier expressible, a still-failing replan is agent or harness,
  never the tier.
  - **The `model` field and its validator branch STAY.** A one-entry menu means a plan — or a stored
    bridge — declaring `model: "sonnet"` still validates, and restoring haiku is a one-token edit. No
    stored bridge declares haiku (verified).
  - **The drafter prompt's `model` line is DELETED** rather than reduced to a one-item menu: it
    advertised *"a cheaper tier for mechanical steps"* and there is no cheaper tier now, and reciting a
    single legal value spends tokens to invite a no-op field (`attempts` is the existing
    legal-but-not-offered precedent). Verified by RENDERING the real prompt — 0 lines match
    `/model|tier|haiku|sonnet|cheaper/i` in either the fresh or the replan form.
  - **Only what the AGENT may express narrows**, which is the safe direction. `--model haiku` remains
    the OPERATOR's probe knob (PRD v1.36), untouched in `scripts/run-u.mjs`; two comments there called
    the runner's tier map *"the same closed menu the planner uses"* and now say plainly that it is
    deliberately wider.
  - **No spec hash moved.** `jobSpecHash` covers the resolved spec, not `STEP_MODELS`; all 10 job specs
    were re-hashed and none moved — bareagent-u and bareguard-u are still the hashes hamr signed.
  - Measured on the first sonnet-only run against the last haiku-era one, same patient: **10.9 → 17.5
    seconds per round** (1.6× slower), 120 → 87 rounds, and the failure CLASS changed — struck out at 2
    remaining errors with money and clock left, versus still converging at 1 error when the wall
    expired. Better rounds are slower rounds, and the binding constraint moved from the strike ladder to
    the clock. That sonnet-only run was also the first to reach the outer close, where it was redded for
    **silencing the type checker instead of typing the code** (F87's suppression genre) — the close
    refused it, and the eventual green removed the suppressions.
- **`bareloop.context.md` named `sonnet | haiku` in two places and is corrected** — the shipped adopter
  contract carried the old menu in the `steps[].model` schema row and in the `providerFor` (P) section,
  so an integrating agent reading it would have drafted a plan that reds. Both now name the one-entry
  menu and say why it is one entry.

### Fixed
- **A locked-VERDICT `request-red` no longer files as a bare-agent upstream ask** (`src/job.js`,
  `src/ledger.js`). `classifyIncidents` hardcoded `lib: 'bare-agent'` for every `request-red`, but the
  code covers two territories: a locked TOOL verb (bare-agent, the original case) and a locked VERDICT
  type (`soft-green`/`hitl`) — demand against bareloop's OWN `VERDICT_TYPES` menu, live-misfiled for
  every `LOCKED_VERDICTS` declaration (the BA-2 misattribution class). Per the typed-lib rule the
  territory is now stamped at the EMIT site (`Red` gains `lib?`; `verdictType` → `bareloop`, `tools` →
  `bare-agent`) and the ledger reads it, keeping the hardcode only as the pre-field legacy-spine
  fallback (zero archived rows carry the code, verified). The `suggestedAsk` template renders the
  stamped target, so a bareloop-catalogue refusal can never seed a bare-agent ask; D13's genre refusals
  (close-authoring design record) route by stamping their own lib with no ledger change. 5 new
  failing-first tests; `capability-gap` still hardcodes bare-agent — flagged, structurally unreachable
  today (a validation red returns before any provider call; the module header says so).
- **…and `capability-gap` no longer hardcodes it either — the flag above is CLOSED** (`src/ledger.js`).
  `capability-gap` is `request-red`'s cap-halted form and inherits both of its territories, but the fix
  landed at one of the two sites and not the other: the synthesis loop still wrote `'bare-agent'`
  literally, and so did its `suggestedAsk` template — the one field a human actually files from, where
  fixing only the occurrence's `lib` would have left the misattribution fully intact. The territory now
  comes from the OCCURRENCE (the `request-red` rows already carry the lib stamped at their emit site),
  and the **dedup key becomes `(verb, lib)` rather than the verb alone**: the ledger's own occurrence
  key carries `lib`, so a `Set` over verbs would merge two territories into one row and attribute it to
  whichever the set happened to hold first — an arbitrary target, which is the defect itself. One gap
  per (territory, verb) costs nothing and each carries an honest one. **Reachability is unchanged and
  still DORMANT** — `validateJob` returns not-ok on any red and `run.js` returns on a validation red, so
  a `request-red` and a `cap-halt` cannot share one spine today; this is a latent-consistency fix at a
  seam the module header documents as dormant, and it claims no live bug. 3 new failing-first tests,
  each labelled in-file as a FUNCTION-CONTRACT fixture (`classifyIncidents` is pure) so a later reader
  cannot mistake the synthetic stream for something a run can produce. Closed now rather than left
  flagged because a fix that lands at one of two identical sites is the class this repo has already
  paid for once — the ripgrep install that went into `ci.yml` and not `publish.yml`, which then failed
  on the identical cause.
- **The replan ceiling reset on EVERY resume leg — a kill refilled a bound the operator signed**
  (`src/planrun.js`, `src/run.js`, `src/reuse.js`, `scripts/run-u.mjs`). `replanned`/`varianceGrantUsed`
  were locals in `runPlan`, and a resume is another `runPlan` call. Confirmed by execution before any
  remedy: leg 1 replanned and stopped; leg 2, driven with a `resumeSeed`, replanned again — a run total
  of 2 with every record showing 1. Two became four by being killed once, which is precisely the creep
  the latch exists to make impossible (*"unlimited replanning launders thrash as adaptation"*, PRD
  v1.12).
  - **Fixed on the MONEY-FOLD precedent, not the grade-seed one, and the choice is the fix.**
    `readGradeSeed`'s documented known limit is that it reads ONE spine, so a resume of a resume
    inherits leg 2's grades and not leg 1's — the chain shortens by a leg per kill. That is fail-safe
    for a READOUT (a short chain can only under-claim a direction) and it is the DANGEROUS direction
    for a CEILING, where an under-claimed ledger is a refilled allowance. So each leg DECLARES the
    ledger it inherited on its own spine (`priorSpentUsd`'s mechanism) and the next reader adds only
    its own window's `replan` records. Leg 3 inherits the whole chain, not leg 2's slice.
  - **The counter-argument was answered, not stepped over.** `src/trend.js` deliberately refuses to
    seed the fix loop's ITERATIONS from history, and that stays right: an attempt allowance is a LEG
    bound, and a restarted leg buys its own attempts with its own money. A replan ceiling bounds how
    many times the WORKFLOW may be redrawn, which is the run's span — the same span the halt readout
    already covers. The two seeds disagree on purpose and both now say so in-source.
  - **SPINE FIELDS — `job-start` gains `priorReplans` / `priorReplanGrantUsed`.** Emitted only when
    there is a fold (a decorative `0` is indistinguishable from a run nobody folded), on the same
    declaration `priorSpentUsd`/`priorWallMs` already ride. The grant latch travels BESIDE the count
    rather than being derived from it: a leg can inherit a spent ordinary ceiling with the arbiter's
    extra still unearned (`1`, `false`), and deriving one from the other would collapse two real states
    into one. `readResume`'s `direct` mode reads the fold off these very fields, so a U-path run
    resumed twice inherits leg 1.
  - **SPINE MEANING CHANGE — `plan-executed.replans` counts the CHAIN, not the leg** (and `replanned`
    with it). **An adopter parsing spines must re-read this field.** The change was made rather than
    shadowed by a second field precisely because `replans` shipped only on this unreleased branch, so
    no archived spine carries the leg reading for a reader to be confused by. The leg's own number is
    not lost: a leg emits one `replan` record per replan it drafts, so `chain − records-in-this-window`
    is the fold it inherited — the same arithmetic `readResume` runs — and a second field stating a
    derivable number would be a second reader of one question.
  - **New option: `runJob(spec, { resumeReplans })`** (and `runPlan`'s identically-named option),
    `{count, grantUsed} | null`, defaulting to `null` = the cold path, byte-identical to a run nobody
    resumed. Belted like every declared fold entering the arbiter's arithmetic: a garbage, negative or
    non-finite seed reads as `0` rather than poisoning later comparisons as `NaN`, and a negative one
    can never cancel a real replan and widen the ceiling. `scripts/run-u.mjs --resume` and `runReuse`
    both pass it. **The disarm control holds** — a resumed leg with an UNSPENT ceiling still replans, so
    the bound is bounded and not switched off.
- **The replan brief's `closeGapBlock` re-bounded an ALREADY-bounded gap and deleted the red names the
  first envelope had rescued** (`src/planrun.js`, `src/exits.js`). `src/exits.js` states the rule for
  this same artifact one seam earlier: the check gap arrives already enveloped by `runClose`'s
  `boundGap` under the stage's own `gapKeep`, which deliberately rescues the `not ok`/`FAILED` names
  out of the elided middle — the mechanical gap F46's conversion mechanism feeds the worker. A second
  400/1500 envelope deleted exactly those a second time, which is F28 reintroduced; measured on a
  120-red-line close output, the first bound rescued **78** names and the second dropped **12** of
  them. `CHECK_GAP_MAX` (12,000) is now **exported** from `src/exits.js` and imported here rather than
  respelled, so the two seams cannot drift on how big a check gap may be, and it is applied as a
  **backstop, not an envelope**: under it the gap passes through VERBATIM. The headroom is measured,
  which is why the ceiling is not smaller — `runClose`'s own envelope tops out at ~10.1KB (400 head +
  8192 keep + 1500 tail + labels), and joined with a `tree-changed` detail that is ~10.2KB, leaving
  ~1.8KB to spare, so the shipped path is untouched and the backstop fires only where `src/exits.js`
  says it should: a seam that returned something never bounded at all. Length is measured AFTER the
  secret scrub, because a mask is wider than most literals it replaces and bounding the raw string
  would let a gap cross the ceiling on its way through the one transformation that always runs.
- **The replan brief's block was LABELLED as the close's own output but could lead with ours**
  (`src/planrun.js`). `res.gap` is `lastGap` — the join of EVERY failing exit's detail in exit order —
  and with `MAX_EXITS_PER_STEP` at 2 plus the mandatory `tree-changed` pairing on a write step, a step
  that wrote nothing opens the block with the EVALUATOR's own prose (`0 files changed under src/** …`)
  under a label reading *"the verification's own output"*. Captured verbatim from a real replan prompt.
  The **label** is corrected to *"What this step's exits reported on its last attempt (their own
  output, verbatim)"*; the **payload is deliberately kept** — "the step wrote nothing" is exactly what
  a replanner should be told, and stripping it to make an old label true would trade a real fact for a
  tidy sentence. F86's thesis (the artifact travels as TEXT, never parsed) is restated, not weakened.
- **F49's ReDoS reject now covers the OPERATOR's two regex fields, not just the agent's**
  (`src/job.js`, `src/validate.js`, `src/plan.js`). `hasNestedQuantifier` shipped wired at exactly ONE
  site — the agent-authored `artifact-written.pattern`. Two operator-authored patterns reach an
  equally untimed evaluator and were uncovered: `judged.pattern`, exec'd by `runClose` against the
  close's whole stdout+stderr, and `gapKeep`, compiled by `boundGap` and run **once per line** of
  close output. Both now red `invalid-value` at the validation gate, before any tokens burn.
  - **Measured, not argued:** `boundGap(stream, '(a+)+$')` against a 40-character line does not finish
    in 20 seconds (`timeout` exit 124).
  - **Why this is worse than an operator self-DoS, and F67 is the reason.** On the agent side F49's
    own scope note holds — the agent authors both the pattern and the artifact, so a hang burns only
    its own wall-clock and compromises no arbiter. These two run in **bareloop's own process**, so the
    hang blocks the MAIN EVENT LOOP — and the in-process stall fuse is a timer in that same loop, so
    it cannot fire (*a guard living inside the process it guards shares that process's fate*). The run
    then dies to the OUTSIDE watchdog and reads as a model stall: **a bad regex in a SIGNED spec
    presents as a provider problem.** The cost is a misdiagnosis, not just a stop.
  - **The detector MOVED to `src/validate.js` — one inventory, never a second copy.** `plan.js`
    imports `job.js`, so `job.js` cannot import `plan.js`; housing the scan with the other shared
    primitives is what lets both documents reject through the same function. `plan.js` re-exports the
    name (the `WRITE_VERBS` precedent), so the F49 site is byte-identical in behaviour. A second copy
    would be precisely the drift class `SECRET_PATTERNS` exists to prevent — a shape one validator
    rejects and the other admits. `hasNestedQuantifier` is not exported from `src/index.js`, so the
    move is internal and breaks no adopter.
  - **Admissibility swept before the change and re-run after:** all **92** operator regexes across all
    **10** signed specs in `jobs/` — **zero** newly red. No spec breaks, no spec-hash churn (no spec
    file is touched). The shipped shapes are pinned in the suite as the control that can produce the
    negative: if the reject ever reds one of them, it has broken the live fleet.
  - **Known limit, PARKED not chased:** the scan misses the alternation-overlap class (`(a|aa)+$`,
    `(x|xy)*$` — no inner quantifier exists to find; the blowup comes from overlapping branches under
    a repeat). Widening it changes which SIGNED specs are admissible, which is arbiter-adjacent.
    Docked to the close-authoring rung, where hand-authored operator regexes may cease to be a surface
    at all — see **PRD v1.55**. Recorded there too, so it is not re-chased: `([^])*$` is NOT caught and
    that is CORRECT (`[^]` is the any-char idiom, so the pattern is linear); the genuinely nested
    `([^]*)*$` IS caught.

### Added
- **A SECOND variance stop can earn ONE more replan — granted by the ARBITER, on a mechanical
  reading** (F85, C). A second `step-variance` after the one-replan ceiling was spent used to be a
  hard stop, and on a run that was still converging that stop threw away work already paid for. Every
  clause of the grant is a constraint: **ONE**, bounded by a LATCH rather than a comparison so the
  ceiling cannot creep by arithmetic (unlimited replanning launders thrash as adaptation, v1.12) — a
  third variance stop is the stop, however well it is going; **the arbiter's**, read mechanically off
  the same `runTrend` instance the meter and the money halt read, with the agent given no channel to
  it — it never asks, is never offered it, and cannot influence it (no self-adjusted budgets, ever);
  **`converging` only**, the trend instrument's own category with no fresh number invented here
  (threshold-setting is the operator's), so `flat` and `unknown` stop exactly as before and an unknown
  is never rounded up into a reason to spend (F6); and **`step-variance` only** — an exhaustion or a
  stall after the ceiling is unchanged. `remainingUsd() > MONEY_MIN` still gates it, as it gates the
  ordinary replan. **Spine change:** `replan` gains `replan` (which replan this is) and — only when the
  arbiter granted one past the ordinary ceiling — `granted` with the reading it was granted on, so a
  reader can never mistake the ceiling for a grant; `plan-executed` gains a `replans` count riding
  BESIDE the shipped `replanned` boolean, never repurposing it. Live on `u-mshcpdg4`: three
  `plan-accepted` records — the initial draft and two replans, the second granted on `converging`.
- **`closeGapBlock(gap)` — the replan brief carries the close's OWN output** (F86; `src/planrun.js`).
  `u-mshcpdg4` reached ONE remaining strict error and still died. The close gap named the work exactly
  — `src/recurse.js(978,115)` — and the worker read it every attempt; the REPLANNER, which is the
  component that chooses which files the next plan targets, saw only
  *"still progressing — typecheck 30 → 15 → 15 → 1"*: a number with no address. It aimed the last plan
  at `src/loop.js`, already at zero errors, wrote nothing twice, and took two strikes — with $1.10 and
  82 seconds still on the clock at the moment that replan was granted (the run itself ended $0.8174 and
  ~6 seconds short of its caps). F85 gave the brief the trajectory; this gives it the artifact the trajectory
  is a summary OF. Handed over as **TEXT**, with both boundaries reused rather than respelled: scrubbed
  through the one secret inventory (`redactSecrets`/`SECRET_PATTERNS`) because a prompt is an egress
  point and the next caller will not remember the upstream scrub, and bounded by ralph's own `boundGap`
  — now **exported** from `src/ralph.js` for it, since a private slice would be a second truncation
  scheme that drifts on exactly the property that matters (whether the red lines survive, and whether
  the trim announces itself, F28); the close path still calls it with the stage's own `gapKeep`,
  byte-identically. The red-set is `REPLAN_GAP_KEEP = '\S'` — every non-blank line — because a shipped
  `gapKeep` is `^`-anchored (`^BAREAGENT `, `^red`, `^FAILED`) and the exit evaluator wraps stage output
  in `check "x" red: …`, so the anchor no longer sits where the pattern expects it; a gap that reaches
  here is ALREADY a red-set (`judge` builds it out of the failing exits only), so keeping every line is
  the correct instrument, not a widened one. **No spine field** — `src/trend.js`'s rule is that no
  record carries a close byte. An empty gap yields the empty string, so the brief renders
  byte-identically to the pre-F86 one (a labelled empty section would invite the planner to explain an
  absence the run never observed). Verified by execution, not by reading: sabotaging the wiring
  (`gapBlock = ''`) turns the `u-mshcpdg4` regression test red (`not ok 121`); restored byte-clean.

### Removed
- **`gapFilesNeverWritten()` and the `never wrote` replan advisory** (F86) — an EXPORT of
  `src/planrun.js` is gone (it was never re-exported through the package entry, whose `exports` map
  admits only `.`, so no adopter import breaks). hamr's order, verbatim: *"delete it and rerun
  bareagent"*. The measured reason, on `u-mshcpdg4`'s own gap: the advisory resolved to
  `src/loop.js` — the file already at zero errors — and said so as a DIRECTIVE, beside the artifact
  that said the opposite; this worker follows directive prose (positive-scope confinement). It also had
  no evidence of ever converting anything: it fired by construction on `u-msdsmkid`, and that run still
  step-redded. The general rule it broke is why `closeGapBlock` hands over text instead: **a parsed
  file list cannot tell a summary line from a detail line**. Line 1 of that very gap reads
  `reports 1 error(s) in src/recurse.js, src/loop.js` — every file in SCOPE — and only line 2 names the
  culprit; and the shapes differ per close anyway (tsc `file:line`, pytest test ids, a count close that
  names no file at all). A model reading the artifact can make that distinction; a regex reproduces the
  bug. Two readers of one question with the parsed one wrong is the same failure the variance meter just
  had. Its 4 tests went with it, and its sole caller was the brief — no speculative code left behind.

## [0.7.0] — 2026-08-05

### Changed
- **`ralph()` now REFUSES a call with no exhaustion rule** (public API). `capRuns` became
  optional in the signature when the `ladder` governor arrived — *"required unless `ladder` is
  supplied"* — and nothing enforced the "unless". With neither, `1 <= undefined` is false: the
  middle ran **zero** times and the call still returned `escalated` after emitting `cap-halt`
  and an escalation reading `undefined/undefined runs spent, close still red` — a governance
  stop narrated for a loop that was never entered. A param guard at entry now throws, naming
  both alternatives (either one repairs the call). `capRuns` must be a positive integer;
  `0`, `2.5`, `'3'`, `null` and `NaN` are refused the same way. **No shipped path changes** —
  both in-library callers (the step loop and the close-fix loop) pass a `ladder`.
- **ONE progress instrument for both governance halts.** The wall halt used to run its own
  reader — byte equality of the last two close gaps, reporting `stalled` / `moving` / `unknown`
  beside the money halt's `flat` / `converging` / `unknown` on the same run. Two readers for one
  question is how the two come to disagree, and the byte reader could only ever report MOTION —
  that something changed, never which way. Both halts now read the run's own `src/trend.js`
  reader. Where a stage reported a comparable NUMBER it decides (so a wall halt on a converging
  run now says `converging`, with the series, instead of "it moved"); where none did, the byte
  comparison survives INSIDE `unknown` as a new `motion` field (`changed | unchanged | null`)
  and as a clause in the `reading`, with the lever adapting (`unchanged` → revise the goal;
  `changed` → read the last close output). **Never promoted to a direction and never mapped onto
  `trend`** — "the close's output changed" is not "the run got better" (F6 in a trend's coat).
  W-2's semantics are untouched: the grade already minted is kept, the three levers are the same
  three, and the close is still never bounded by the wall. **Spine change:** the `wall-halt`
  record's `trend` now carries the money halt's vocabulary and a sibling `motion` field; no
  `src/` or `scripts/` reader consumed the old values (grepped).

### Added
- **A MONEY halt is decision-ready, exactly as W-2 made the wall one** (PRD v1.46 §2). A run
  cut by its budget KEEPS the verdict already minted and emits a new `money-halt` spine record
  carrying `budgetUsd`, `remainingUsd`, the kept `verdict`/`stage`, a progress `trend`
  (`converging | flat | unknown`) with the `reading` and `series` it judged, and three
  `options`: top up and resume, revise the spec, abandon. Emitted at every site that cuts a run
  on money — the step loop, the close-fix loop, and the scout/draft relay. **The library only
  reports**: `budgetUsd` is in the spec hash, so a top-up is a spec edit a human signs, and
  nothing in a run may widen its own budget (unchanged hard line).
- **The close TREND instrument** (`src/trend.js`, internal). Reads a run's own close grades as
  a series **per stage**, compared only against that stage's own best so far. Accuracy law:
  never across stages — merging a staged close's axes reads a real see-saw (suppressions
  12 → 5 while the type errors that scrub re-exposed went 2 → 0) as a regression. Never model
  prose: the reading is the first number on the first red-marked line of the stage's output.
  A stage that reports no number donates nothing — not a zero, not a strike, and the verdict
  says `unknown` out loud (F6). Reaching a later stage than ever before counts as progress
  (a staged close is first-red-wins). Known accepted limit, documented at the site: a
  floor-shaped stage (`N tests executed, below the seed's M`) reads as not-improving rather
  than converging — the fail-safe direction.
- **A resumed run's trend judges the WHOLE chain, not just the leg.** `readResume`'s `restart`
  gains `grades`: the dead leg's close grades in order, as `[{stage, value}]` — counts and stage
  names only, never a gap byte. `runJob`/`runPlan` take them as `resumeGrades` (beside
  `resumeSeed`) and `createTrend` takes them as `seed`, folding them into the run trend's series
  and per-stage bests. Without it a resumed leg restarts the trend at its own first close and can
  report `flat` — *revise the goal* — on a run that was converging when its allowance ran out; a
  leg that re-grades an unchanged tree is flat on its own evidence while the RUN is what the
  top-up decision is about. The seed is history, not this leg's evidence, so it counts no
  iteration, mints no strike, never sets `comparableEver` on its own (the blind-cap backstop
  still governs a leg whose own readings never compare) and donates no stage position. The
  close-fix loop's governor is deliberately **not** seeded — it answers the leg-local question
  ("is this loop out of ideas"), and seeding it rendered "still progressing" inside the terminal
  of a loop that had just struck out flat. Grades are read from the `ladder` records the live
  governor already wrote (`governor: 'close-trend'`, verbatim, never re-parsed), from
  `close-precheck`/`outer-close`, and — only on a spine predating that governor — from the
  `close-verdict` records after the `fix-loop` marker, which is the same population and excludes
  a STEP's failing exit. Known limit: one spine is read, so a resume of a resume inherits the
  previous leg's chain and not the one before it. `scripts/run-u.mjs --resume` wires it and names
  the inherited baselines in its preview.
- **`--resume` on `scripts/run-u.mjs`** (PRD v1.46 §3) — the third leg of the resume rulings.
  It skips the patient reset (`resumeTreeGate` instead: a dirty tree is what a resume expects;
  only a moved HEAD stops it), folds the halted run's money and wall in so the signed ceiling
  cannot widen by being re-invoked, re-enters at the checkpoint the steps already earned, and
  arms the outside watchdog on the REMAINING wall. `readResume` gains two options, both OFF by
  default so the reuse loop is byte-unchanged: `direct` reads a plain `runJob` spine as one
  implicit try, and `resumableOutcomes` reclassifies a landed `job-end` that is a GOVERNANCE
  HALT (`cap-halt`/`wall-halt`) as a checkpoint rather than a graded row. Green and every red
  stay non-resumable — a verdict already rendered is never re-bought. `job-start` now carries
  the declared fold (`priorSpentUsd` with its `priorSpendComplete`, and `priorWallMs`) when
  there is one, so a chain of resumes adds only each attempt's new rounds instead of
  re-deriving and double-billing.
  **Validated live and pinned by cycle tests (F83).** Live: a signed top-up resumed a real
  money cap-halt at its close checkpoint — finished step skipped, no re-scout or re-draft,
  patient continued, watchdog armed on the REMAINDER — and greened, with `job-end` stating
  the folded total across both legs. Pinned deterministically by five `$0` scripted-round
  tests covering the whole cycle: leg-1 halt → top-up → leg-2 green at the checkpoint (a
  close-precheck red proving the green was earned, not inherited); a **no-top-up control**
  where the same budget buys no second pass and leaves a byte-identical tree (one
  round-boundary overshoot round, the documented behaviour of a cap that binds BETWEEN
  rounds); an **unsolvable cycle** where a topped-up leg making no per-stage progress
  strikes out `flat` with the wallet still largely unburned — the fix loop's strike rule
  governs a resumed leg exactly as it governs a cold one; and an F6 floor surviving halt →
  fold → green terminal.
- **Layer 3, the REUSE rung — the registry, the load gate, and the MECHANICAL START**
  (design record `docs/plans/2026-08-01-layer-3-reuse-design.md`; execution probe green
  before any of it was built). A green's plan is now an artifact the next run of the same
  SHAPE can start from, instead of being discarded.
  - **`src/bridges.js` — the registry (D1/D6).** A directory of plain JSON files at an
    OPERATOR-supplied path (no database, no new dependency, no default location).
    `mintBridge` / `appendGreen` / `appendRed` / `saveBridge` / `loadBridge` /
    `loadRegistry` / `makeRegistry` / `registryExists` / `validateBridge` / `listingRow` /
    `deriveStatus`, all exported. **Only a green writes the box (R1):** a red writes a
    history row and never touches `versions`. **Status is DERIVED, never stored (D6):**
    candidate = one green, proven = greens on two DISTINCT patients, a red on a proven
    entry demotes it — and a CASUALTY is not a red. There is deliberately no probability
    score. Costs and durations are a number or an EXPLICIT `null` with the key required
    either way, so an unknown is said rather than omitted (F6).
  - **`loadGate(bridge, job)` — D2 as SPLIT (2026-08-01 addendum).** Three shape checks at
    the door — verdict type, close-stage kinds, verbs within the signed menu — and
    **nothing about paths, scopes or targets**: those are instance-bound and expected to
    red, which the pre-probe measured the drafter fixing unaided (3/3 legal after tweak),
    while the gate as originally frozen would have refused every cross-patient recipe.
  - **`bridge?` on `runJob` and `runPlan` — the mechanical start (D4).** With a bridge, the
    gate runs before the clock, the close precheck and any token; on a pass the NEWEST
    version's plan-as-executed becomes the drafter's STARTING DRAFT inside the ordinary
    drafting prompt (`planPrompt` gained an optional `startingDraft` argument). The tweaked
    plan then passes the SAME `validatePlan` every cold draft passes — **no second, looser
    path exists for an inherited plan** — and the ONE-replan ceiling is untouched (D5): a
    replan drafts from the run's own state and never re-injects the bridge.
  - **New terminal `recipe-stale`** (`runJob`/`runPlan`): a bridge that fails the load gate
    is refused at the door with `bridge-gate {outcome, name, reds}` on the spine, a
    decision-ready escalation, and **zero spend**. Falling back to cold drafting is the
    CALLER's decision, never an automatic silent fallback. Classified as a deliberate
    ledger exclusion — the gate refusing a wrong-KIND recipe is the mechanism working, not
    a library bug to file upstream.
  - **New spine events:** `bridge-gate` (a refusal, with its reds) and `bridge-loaded`
    (`{name, versions, runid}` — which version inherited).
  - **`src/selection.js` — D3's display half.** `renderListing(registry)` renders the
    operator/LLM-facing workflow listing (name, goal, status, greens/reds, the cost/time
    band of the greens), deterministic by name and total on garbage; an unknown cost or
    time renders `UNKNOWN` and a partial aggregate says how many it skipped, and registry
    entries that could not be read are NAMED so the listing is never quietly shorter than
    the directory. `selectionPrompt(listing, ask)` is the pure prompt text for the pick,
    carrying D3's two standing rules: *"none matches"* is a first-class answer that means
    drafting new, and a PINNED workflow may be refused only EXPLICITLY, with a reason. Both
    are pure text — the selection call, the pin/shortlist/force-cold flow and the parse of
    the answer belong to the caller.
  - **The cold path is byte-identical without a bridge** (the F47 works-both-ways rule),
    pinned by test: no new event fires and no starting draft appears anywhere in the prompt.
  - **`src/reuse.js` — the D7 ENVELOPE and the REUSE RUNNER.** hamr's sentence made
    executable: *"we ask user for cost/time and how many workflows to try before starting
    new like $5 and 30 mins x2 then start anew if both red"*.
    - **`validateEnvelope(input, { job? })`** — `{ perTryBudgetUsd, perTryWallMs,
      bridgeTries }`, **all three required and explicit, no defaults** (a defaulted cap is
      a silent second ceiling); `bridgeTries: 0` = force-cold. The envelope may only
      **TIGHTEN** the signed spec — a per-try number above `job.budgetUsd`/`job.maxWallMs`
      is `envelope-widens`, never a silent raise.
    - **`resolveTrySpec(job, envelope)`** — the per-try spec every try runs, cold leg
      included. Tightening moves the SPEC HASH, so a tightened run is a new spec VERSION
      the operator signs; `runReuse` passes `approvals` straight through and cannot forge
      one. An envelope equal to the spec's numbers is hash-identical.
    - **`selectBridge({registry, job, ask, provider, pinned?, shortlist?, forceCold?,
      exclude?})`** — ONE model call on the caller's drafter-tier provider (none is
      constructed inside), parsed through the repo's one `extractArtifact` into a strict
      `{choice, reason}`. `forceCold` and an empty candidate set skip the call for $0. A
      name outside the listing is a red, never used. **A pin does not bypass the call**
      (D3): it is stated in the prompt, and an answer naming anything else returns
      `{refused: true}` — the substitute is NOT adopted and the decision goes back to the
      operator. Cost metered and reported (F6).
    - **`runReuse({job, approvals, registryDir, envelope, patient, workdir, provider,
      emit, …})`** — selection → try → box → next try → cold. Selection re-reads the
      registry per try with the tried names excluded; **a green ENDS the loop**; tries
      exhausted falls through to a cold run under the same per-try numbers, whose green
      mints a new bridge for the job slug (or appends if that name already holds greens —
      clobbering a green is what R1 exists to prevent), and whose red writes nothing (the
      entry bar is a green). Every non-green return is decision-ready. The three answers
      **no further try could change** — `unapproved-spec` (a tightened envelope is a new
      spec version, signed not inherited; the decision hands over the exact hash),
      `job-red`, `smoke-red` — end the run where they happen instead of reproducing
      themselves down the whole envelope. A cold green also REFUSES to mint over a file of
      that name it could not read (`mint-collision`): an unreadable entry is not an absent
      one, and whatever greens it held are gone once overwritten.
    - **`REUSE_GRADED_RED`** — only `escalated` demotes: the terminal where the close
      judged the tree, the fix loop spent its attempts with money still on the table, and
      the close was still red. Every other non-green outcome is a CASUALTY recorded under
      its own name (`cap-halt`/`wall-halt` governance, `provider-red`/`step-stalled`
      transport, `close-red` the close FAULTING and rendering no judgment, `recipe-stale`
      refused at the door, `plan-red`/`step-red:*`/`check-red` stopping before the close
      ever judged). Full detail still lands on the history row.
    - **F45 made visible instead of thresholded.** A try's budget must fund the attempt
      PLUS its close, and nothing in-process can know what a close costs — so **no
      threshold is invented** (threshold-setting is arbiter territory, from a measured
      base rate). Instead every try row carries `spentUsd` vs `capUsd`, `wallMs` vs
      `wallCapMs`, `capBound`, `wallBound` and **`closeReached`**: a cap that died before
      any grading is a fact on the row, not an inference.
    - **New spine events:** `reuse-start`, `selection-result`, `try-start`, `try-end`,
      `bridge-write`, `reuse-end`, plus `envelope-red`. **New escalation categories**
      `reuse-exhausted` / `selection-refused` / `selection-red` / `registry-red` /
      `envelope-red`, all added to the ledger's executable excluded-set — the envelope and
      the operator speaking, never a library failing (a real transport fault out of the
      selection call still classifies as `provider-red`).
  - **`selectionPrompt(listing, ask, pinned?)`** gained the optional pin argument, so the
    pin sentence has ONE spelling rather than being assembled by each caller.
  - **`scripts/run-reuse.mjs`** — the reference operator runner: `--job` / `--registry` /
    `--budget` / `--wall` / `--tries` (+ `--pin` / `--force-cold`), approval gate on the
    RESOLVED per-try hash, seed refusal (it never resets the patient for you), F67 outside
    watchdog sized for the SUM of the tries, gate-audit relocation, secrets scan, and a
    sleep-inhibitor note in the header (F72 — a suspend freezes every guard, including the
    watchdog).
  - **RESUME AFTER A KILL (module C).** A killed reuse run comes back losing as little as
    possible — hamr's ruling: *"money, signature and checkpoint (starts from where it
    stopped) if mid loop, restart that loop"*.
    - **`readResume(events, {deathAt?})`** turns a dead run's OWN spine back into the
      state a resume continues from: which tries completed (never re-run, bridges still
      spoken for), whether a try was mid-flight (a `try-start` with no `try-end` — never
      graded, so never consumed), what that attempt already spent in money and wall, and
      which signed envelope the spine belongs to. Spend is summed from `worker-round`
      ONLY — the same event `runJob`'s ledger accounts — so a selection call's cost is
      never attributed to a worker (F45); a restarted try DECLARES its inherited fold on
      its own `try-start`, so a resume of a resume folds once rather than double-billing
      an abandoned attempt. A try whose `job-end` landed is COMPLETE, not restarted, and
      a registry row lost to the kill is named (`r1Missing`), never re-derived.
    - **The remainder, never a fresh allotment.** `runJob` gained `priorSpentUsd` /
      `priorSpendComplete` / `priorWallMs` and `createClock` gained `priorElapsedMs`: the
      killed attempt's spend and time FOLD IN, so the restart runs under what is left of the
      SIGNED per-try numbers. The caps themselves are never rewritten — they are in the spec
      hash, and editing them would need a signature nobody typed. An unfundable remainder caps
      honestly (`cap-halt`, or `wall-halt` below one close timeout) having launched
      nothing. **A floor stays a floor across the resume:** if any round inside the dead
      attempt came back unpriced, `priorSpendComplete: false` rides one-way onto every
      `job-end` this run emits, so a resumed attempt states a floor instead of an
      exact-looking total (F6 — it was previously computed and recorded on `try-start` but
      never reached the component whose terminal says so). The restart fold reads ALL four
      of `runJob`'s floor causes: a landed resumable `job-end` carrying
      `spendComplete: false` (a stall, or a call cut mid-flight) floors the fold exactly
      like a declared prior floor or an unpriced round (F83's laundering finding, fixed;
      the no-`job-end` killed-mid-flight restart is control-pinned unchanged).
    - **`runReuse({… resume})`** seeds the completed tries, restarts the mid-flight one
      against the SAME workflow with no second selection call, and carries on into
      whatever the envelope still authorizes. It refuses (`resume-red`, ledger-excluded)
      a seed signed under a different envelope, or a restart whose workflow has left the
      registry. New spine event `resume-start`; `try-start` gains the declared fold.
    - **`resumeTreeGate({head, seed, dirty})`** — a resumed patient is CONTINUED, never
      reset: the dead tries' edits are real progress. Only HEAD moving off the seed (a
      commit or rebase under the dead run — operator intervention) stops it.
    - **`makeSpine(file, {startSeq})`** so a resumed process continues one append-only
      log with `seq` still monotonic, and **`scripts/run-reuse.mjs --resume <runid|path>`**:
      it refuses a spine that is missing, corrupt mid-file, already terminal, or whose
      process is STILL ALIVE (pid from the run's new `runner-start` record and the
      watchdog report, discriminated by `/proc/<pid>/cmdline` because pids are recycled),
      prints both hashes on an envelope mismatch, previews the whole reconstruction
      before you sign, archives the killed run's watchdog record so it cannot be read as
      this run's, and sizes the watchdog for the REMAINING work.

### Changed
- **`capRuns` retires as the CLOSE-FIX loop's governor** (PRD v1.46 §4). That loop now ends on
  the same 2-strike no-progress rule the step ladder uses, read off the close's own per-stage
  numbers rather than repeats and writes. Validated by a $0 replay over every archived fix
  loop before the build: 0 greens harmed (all three historical fix-loop greens converted in
  ≤ 2 verdicts) and 1 real waste case caught (dead flat at 2 errors for 7 consecutive fix
  verdicts until the wall killed it). `capRuns` survives ONLY as the bound for a close whose
  output carries no number at all — a governor that cannot see the variable must not be the
  governor — and lifts the moment a stage reports a comparable number. Money and the wall keep
  every bit of their authority. The exhaustion terminal is unchanged in both category
  (`cap-halt`) and outcome (`escalated`); `ralph`'s `ladder` option is now an INTERFACE two
  governors implement, with an optional `terminal()` that overrides the exhaustion prose only
  (the step ladder's copy offers a replan and there is no planner at the close). Every `ladder`
  spine record now names its `governor` (`step-ladder` | `close-trend`). The wall-halt readout
  no longer quotes `capRuns` as a denominator, because it no longer governs.
- **A plan step is bounded by PROGRESS, not by a count** (`src/ladder.js`; F77–F79). The step
  loop's fixed iteration cap is replaced by a strike ladder: a *strike* is a red iteration that
  repeats an already-seen gap (matched against a seen-set for the whole step, never just the
  last one) or made no gate-audit writes (the F32 record-count instrument — never `git status`,
  never a tree diff); strikes are sticky and `strikeLimit` of them (new shell option on
  `runJob`/`runPlan`, **default 2**) ends the step. Gaps are normalized for comparison only —
  timing bytes dropped, counts and file names kept — so a shrinking error count reads as
  progress. The wallet, the wall, the variance meter and the stall fuse keep every bit of their
  authority; the exhaustion terminal is the same `cap-halt`. Measured motivation: two
  calibrations died `step-red` while still converging with money and wall unspent; a $0 replay
  over 110 archived step ladders showed every converging red continuing and thrash ending
  same-or-one-earlier. **`capRuns` now bounds the CLOSE-FIX loop only.** New per-iteration spine
  record `ladder`; exhaustion records carry `strikes`/`strikeLimit`/`distinctGaps`.
- **The replan brief names the MECHANISM.** An exhausted step now tells the redrafting planner
  which shape ended it (converging-cut / stalled-no-write / repeated-gap, with iteration numbers
  as evidence), its gap trajectory, and how much money and wall the stop left unspent (time
  reported UNBOUNDED when no wall was set, never `0`) — replacing *"it ran N attempts and its
  exits were still red"*, which named no mechanism and read identically for opposite failures.
- **Layer R's VERBATIM ratchet stage is retired on the STEP path** (hamr's ruling): fixation is
  a repeat, so a fixated step strikes out before the fourth iteration can open. The stage stays
  reachable in the close-fix loop and fully unit-covered; Layer R still ships OFF by default.

### Deprecated
- **`steps[].attempts` is retired and INERT.** It is no longer offered in the drafting prompt
  and the runner ignores it. It is still ACCEPTED by `validatePlan` — stored bridge plans carry
  it, and a plan minted under one runner's number must not red under another's — with the shape
  still checked and the old `<= capRuns` ceiling dropped. It was TIGHTEN-only, which made the
  correct heal for a converging step inexpressible. `validatePlan`'s `capRuns?` option is
  removed with the ceiling it fed (it existed only to bound `attempts`; an extra property is
  ignored, so no direct caller breaks).

### Changed (the close-stage AXIS SPLIT — hamr: "#1 fix")
- **One POPULATION per close stage, so unlike numbers can never share a trend series.** The
  trend reads one bucket per stage NAME, and a stage name is not an axis: `typecheck` red
  either `N error(s) in <scope>` (the in-scope faults) or `the target files are clean but M
  strict error(s) exist outside them` — a different population, reached only once the first is
  zero — and `suite-green` mixed a failure count with an executed-count floor. A run crossing
  either seam donated two genres to one series, so a 29 → 4 across it read **converging** and
  would have recommended a top-up on work that had only swapped which wall it was behind.
  Every mixed stage in the six `u-*` closes is now split: **`typecheck-outside`** carries the
  outside-scope population immediately after `typecheck`, and **`tests-kept`** carries the
  executed-count floor immediately before `suite-green`. Each new stage sits exactly where its
  branch already ran, so the gate sequence is byte-order identical to the old single-stage
  walk and first-red-wins is unchanged; `litectx`/`spawner` `typecheck` was verified
  single-population and left alone. `src/trend.js`'s KNOWN LIMIT is rewritten as the historical
  record plus **the law for close authors** — the remedy for a mixed stage is that close's stage
  list, never a detector taught to tell two prose shapes apart (the F49 precedent).
  - **All six `u-*` spec hashes flip**, by construction: a close's stage names are in the
    signed spec, so the runner refuses every one of them until it is re-signed. That is
    refuse-until-re-signed working, not a migration to smooth over.
  - **Stored bridges whose `closeStageNames` predate the change refuse to load** — the load
    gate's close-stage check is the doctrine that a changed close is a different KIND of job.
    `aurora-u-spawner` and `litectx-u` are in that state now and are re-minted by a green under
    the new close, never edited into agreement.
  - **The F28 trim announcement is restored** where the split surfaced its loss: the
    outside-scope branch pre-sliced its own echo, silently suppressing the "trimmed" notice a
    gap bound must announce (a 341-line elide is visible again).
  - **New `tests/close-stages.test.js` (20 tests)**, including a can-it-fail pre-flight against
    the pre-split tree, spec↔script stage-list agreement over spawned real closes, and the
    29 → 4 repro reading as two stages with a same-stage contrast proving the test can fail.
    Live `$0` validation: pulselog green across all four split stages, baremobile
    `typecheck-outside` RED at 381 reading correctly as its own series. **1007 tests.**

### Fixed (whole-branch review, 2026-08-05 — 4 opus finders over `main...layer-3-reuse`; F84)

*Every confirmed finding fixed, each verified against source before it was believed; no fix
forced, and three finder claims corrected in detail during the fixing.*

- **CRITICAL — the close trend's BLIND CAP was a one-way latch.** `capRuns` survives as the
  fallback for a close whose output carries no comparable number, and it was armed by
  "has this leg ever compared anything" — which a bare STAGE ADVANCE satisfies, on
  essentially every run that does any work at all. One advance therefore disarmed the
  fallback **permanently**: a later run of numberless reds (the shipped aurora TESTGEN
  `verdict` stage is exactly that shape) accrued neither a strike nor a blind tick and was
  bounded by money and the wall alone, where the retired count would have stopped it.
  Reproduced by execution before the change — 27 iterations, no terminal. The cap now bounds
  the **consecutive uncomparable streak**: it lifts the moment the instrument can read and
  **re-arms the moment it cannot**, binding a recovered run never and a blind-from-birth run
  on exactly the iteration it always did (pinned byte-stable by test, at every cap). The
  `report()` `blind` flag follows the same question — a live streak IS blindness, so the
  terminal no longer offers "0/2 strikes" as the reason a loop it did not strike out was
  stopped.
- **`priorFloor` no longer requires money to have been spent.** `runJob` derived it as
  `spentUsd > 0 && priorSpendComplete === false`, so a resumed leg inheriting a fold of **$0
  that was not exact** — every round of the dead attempt unpriced — came back reading as an
  exact zero. A floor OF zero is still a floor (F6). Read off the flag alone now, and the
  onward `job-start` declaration is emitted for that case too (`spentUsd > 0 || priorFloor`),
  which is the only field that can carry the unknown forward.
- **A reuse RESUME's halt readout now spans the chain.** `restart.grades` was computed by
  `readResume`, declared on the record, and then handed to nobody: only `scripts/run-u.mjs`
  passed `resumeGrades` on. `runReuse`'s own per-try execution now threads it into `runJob`,
  so a restarted leg's `money-halt`/`wall-halt` trend judges the RUN rather than restarting at
  this leg's first close and reporting `flat` — *revise the goal* — on a run that was
  converging when its allowance ran out. `resume-start`'s `restart` states
  `gradesInherited` (a COUNT; the seam carries stage names and numbers, never a close byte),
  and only when there is one — the cold path is unchanged.
- **The `money-halt` record carries `spendComplete`.** `remainingUsd` is `budget − spent`, so
  a run whose spend is a FLOOR has a remaining that is a CEILING; quoting it to four decimals
  read as the number. `runPlan` takes the ledger's own `spendComplete` (one spelling of the
  four causes, never a second arithmetic) and states it beside the figure — the same duty
  `wall-halt` has carried since W-2.
- **A try row's ROUNDS fold across a resume, like its money and its wall.** A restarted try
  reported only the restart's turns against a span its `$` already covered both legs of.
  `try-start` declares `priorRounds` (including when it is `null`: absence means a spine older
  than the field, an explicit null is a predecessor that could not count its own turns — and
  an unfoldable count stays `null` rather than becoming the half this leg can see, F6). The
  inherited-graded row's `wallMs` is likewise measured to the try's **own terminal** now, not
  to a kill that may have landed minutes later.
- **The replan brief no longer calls an IDLE strike-out "converging".** The sentence was gated
  on repeats alone, so a step that wrote nothing in any iteration was handed *"no file was
  written in iteration(s) 1, 2"* and *"the step was converging"* in the same paragraph — to
  the one channel the redrafting planner adapts to. Both signals gate it now; a moving exit
  output on a step that wrote nothing is a close re-running, not work converging.
- **`planPrompt`'s JSDoc was detached from `planPrompt`.** An intervening helper landed between
  the block and the function, so every parameter shipped as `any` in the generated `.d.ts`.
  Reattached; no behaviour change, and the types are the contract.
- **W-2 on the LAUNCH side: a zero wall remainder now REFUSES, loudly.** `--wall-ms 0` reached
  `scripts/u-watchdog.mjs`, which defaulted a non-positive value to `null` and armed **no
  deadline at all** while the runner's own banner still advertised one — a guard reading zero
  and saying nothing. The watchdog now refuses any PRESENT-but-unreadable numeric flag
  (`0`, negative, garbage) with exit 2, while an OMITTED `--wall-ms` stays the legal unbounded
  choice with the stale trigger armed. Both runners refuse above the spawn, before the key and
  before the patient: `scripts/run-u.mjs` on an exhausted resume remainder, `scripts/run-reuse.mjs`
  on `plannedWallMs <= 0`. **Two zeros, two levers** — a restart whose wall is burned wants
  `--wall` (NO WALL LEFT), a run whose authorized attempts have all run wants `--tries` or
  nothing (NOTHING TO ARM) — because naming the wrong lever sends the operator to re-sign a
  number that buys no attempt. Both are in the approval hash, so either is a new signature.
- **`scripts/run-reuse.mjs` hardening.** A corrupt/truncated watchdog report can no longer abort
  a signed resume at the last gate (it is parsed once, defensively, and reused; the archive
  suffix falls back to the ARCHIVE moment so a second unreadable report cannot overwrite the
  first). `runner-start`'s `argv` is redacted **at the write site** with the shipped
  `redactSecrets` inventory — an append-only log that captures a key captures it forever, so an
  after-the-fact whole-file scan is too late. A trailing value-flag (`--tries` with nothing
  after it) now refuses instead of reading `Number('') === 0` and silently reshaping the run
  being signed. The header's deliberate-differences list gains the fourth: the end-of-run leak
  scan is a READOUT here, not a gate, because `runReuse` writes registry rows mid-run.
- **Archived runners annotated** (`reuse-preprobe`, `run-calibration-testgen`, `run-poc-layer2`,
  `run-probe-testgen`): their `CAP_RUNS` comments described the retired drafting-prompt
  interpolation, not the close-fix loop's blind fallback it actually is now.

- **Tests: 987 total** (from 959). The mutation-proven hole: a widening of `REUSE_GRADED_RED` — the
  set whose members DEMOTE a proven bridge — survived the entire suite, so the demotion table
  is now pinned outcome by outcome (`escalated` demotes; `step-red`/`cap-halt`/`wall-halt`/
  `provider-red`/`close-red`/`step-stalled`/`pricing-red` are casualties and proven stays
  proven). Plus the blind-cap backstop battery (blind-from-birth pin, streak-not-birth,
  never-fires-while-reading, recovery resets), the launch-side refusals at all three sites,
  the resume grade/round folds with their absent-baseline controls, the money-halt floor
  readout, and a first battery for `scripts/migrate-bridge-patient-slugs.mjs` (dry-run
  byte-identity, whole-file refusal over half-migration, name/filename disagreement — 4
  mutants killed).

## [0.6.0] — 2026-07-31

### Added
- **P — the worker's palette widens 6 → 14 verbs, and a step gains a vocabulary** (design
  record 2026-07-28). The plan surface exposed two of litectx's verbs and the agent could
  choose almost nothing about HOW a step ran (F56).
  - `TOOL_MENU` (`src/job.js`) is now four components: **write** (`write` · `edit`), **select**
    (`read` · `grep` · `recall` · `get` · `impact` · `related` · `recent`), **compress**
    (`compress` · `peek`), **isolate** (`stash` · `remember` · `forget`). Every verb maps to an
    EXISTING litectx/bare-agent implementation — the menu is an INVENTORY, nothing was built to
    fill it. Select/compress verbs are gate-judged as `read` actions through the same fence;
    isolate verbs write the `.litectx` STORE and carry their OWN gate action types, so a store
    park can never be counted as a tree write by the F32 `workerWrites` instrument. `run` stays
    locked at every layer.
  - New `WRITE_VERBS` / `STORE_VERBS` split: **neither class is read-capable**, so the scout's
    grant filters both, and a ceiling made only of them reds `invalid-value` at sign time (a
    write-only ceiling hands the scout an empty menu and it surveys blind).
  - Each component ships its F19 strategy line (`COMPONENT_STRATEGIES`, `src/tools.js`),
    composed into the persona only for components with a granted verb — capability without
    strategy is inert, and a strategy for a verb the worker does not hold is noise.
  - **Three new step fields, each legal set handed over as a MENU** (`src/plan.js`,
    choose-don't-describe): `model` (`sonnet` | `haiku`, `STEP_MODELS` — `opus` deliberately
    absent, hamr-assigned only, never plan-selectable), `attempts` (integer `1..capRuns`), and
    `scope` (one value from the same `legalScopes` menu `tree-changed` uses). All optional, all
    **tighten-only** — a plan may narrow the shell's caps and the signed fence, never widen them.
  - **Each field is WIRED or REFUSED, never silently ignored** (the F50 blind-instrument class):
    `scope` narrows the live gate fence (proven — an in-job-fence write denied by the step's own
    scope), `attempts` tightens `ralph`'s cap (proven — exactly one iteration), and `model` routes
    that step's worker through a new **`providerFor(tier)`** factory on `runJob`/`runPlan`.
    **A step naming a tier when the caller supplied no factory is a NAMED `interpreter-red` stop**
    — a wiring gap, not a plan defect — never a silent run on the default tier as if the choice
    had been honoured.
  - `scripts/run-u.mjs` supplies that factory (the tier→model mapping is the RUNNER's territory,
    never the schema's) and gains a `--model` tier flag, and now **deletes `.litectx` at every
    reset — cold means cold**: the isolate verbs persist across runs, so an uncleaned store would
    leak run N's memory into run N+1's "cold" baseline and quietly poison the reuse rung's OFF arm.
  - The U job specs widen to the full catalog, which is a NEW spec hash and therefore UNSIGNED
    until hamr's explicit in-turn approval — widening the menu never silently changes a signed
    spec's meaning.
  - POC-first paid three times before a line of module code (recall hits carry no id — the path
    IS the key; `impact`'s `confirmed`/`mentions` are counts, not arrays; `purge()` covers neither
    stash nor memory, so a cold reset must delete the store). The tool tests run against a REAL
    LiteCtx over a real fixture: the impact-shape test failed once against live data and was fixed
    from the measured shape, not the assumed one.
- **F66 — the in-process stall fuse** (`src/stall.js`): bare-agent's `timeoutMs` bounds
  socket INACTIVITY (resets on every byte), so a slow-but-trickling call hung a run for 274
  minutes (U run ms3197n8). The fuse's heartbeat is a completed ROUND — no round for 5
  minutes abandons the call and silently reissues it (self-heal, hamr's ruling); three
  stalls throw `step-stalled`, the third replan trigger. Validated on the paid surface: a
  real slow call stalled and its reissue answered; three real in-flight calls abandoned at
  the ceiling; late answers from abandoned sockets swallowed. Mutation battery 6/6 (the
  surviving mutant was a real hole matching the production failure shape — fixed).
- **F67 — the outside watchdog** (`scripts/u-watchdog.mjs`): U run ms3jh76q froze its event
  loop 81.5 minutes and every in-process guard froze with it. A separate process sharing
  nothing with the run — reads one file's mtime, calls kill(2), records the reason on disk
  BEFORE the signal. Two triggers: stale spine and wall+grace. Battery includes a
  hard-frozen-loop victim (`for(;;);`) — the exact case it exists for. Mutation 5/5.
- **Event-loop lag sampler** in `scripts/run-u.mjs`: records any ≥3s loop block with
  from/until timestamps to `<spine>.lag.jsonl` — the instrument that localized the
  spawnSync-close blocks (below) on its first run.
- **BREAKING for plan authors — `step-scope-escape`: a scoped step's TARGET must sit inside
  its OWN narrowed scope** (`src/plan.js`, W3). A plan that validated before can red now. A
  step may narrow the signed fence with `scope`, and `runPlan` builds that step's gate from
  the narrowed prefix — so a target inside the signed fence but outside the step's own scope
  was a write the gate denied on every attempt: the step burned its whole attempt budget on
  refusals with no red anywhere, because each half was individually legal and nothing checked
  the PAIR. The rule binds WRITES, not observations, and the exit arms were measured against
  `src/exits.js` rather than assumed. `tree-changed` reds only when its scope is DISJOINT from
  the step's — a scope that CONTAINS the step's contains its writable ground and fires exactly
  when the narrow one does, and the menu is shallowest-first while the prompt says copy one
  value, so containment would tax the likeliest draft (the F60 class `legalScopes` exists to
  remove). `artifact-written`/`json-valid` paths carry NO step-scope red at all: the evaluator
  reads and parses the named file and asks nothing about who wrote it, so a path naming a
  PRIOR step's artifact is legal AND satisfiable under strictly-sequential v1 — a red there
  would claim a constraint the evaluator does not impose. An off-menu `scope` carries no
  narrowing (it already redded): one defect, one red.
- **Four documented names are now actually exported** (`src/index.js`): `runStages`,
  `checkMenu`, `STORE_VERBS` and `stageClose`. Each was named as adopter-reachable in this
  CHANGELOG or in `bareloop.context.md` while the index never handed it out — a
  documented-but-unexported name is a false contract the adopter discovers by importing it.
  `tests/index.test.js` pins the documented surface by name (a NAME check; each export's
  semantics stay owned by its own module's tests), so the docs and the index cannot drift
  apart silently again.
- **A per-payload cap on the isolate verbs** — `ISOLATE_MAX_BYTES` = 64KB, hamr's threshold
  (`src/tools.js`). `ctx_stash`/`ctx_remember` write the `.litectx` store, which the
  writeScope fence does not judge: the one worker surface that writes UNGATED bytes, and
  unbounded it grows for as many rounds as the wallet funds. Over-cap comes back as a refusal
  RESULT naming the actual size and the limit — worker feedback, never a throw (throws stay
  the BA-4 param-guard class) — and nothing enters the store; both tool descriptions state
  the bound. The residual is named rather than hidden: this bounds ONE PAYLOAD, and N
  distinct ids are N payloads, so the aggregate stays unbounded. An aggregate cap is a
  threshold, and thresholds are hamr's call.
- **`step-stalled` has its own DECISIONS entry** (`src/ralph.js`). F66's terminal fell through
  to the generic default, which points a human at the interpreter — the one component that did
  nothing wrong. A stall is not a fault: the socket stayed alive the whole time (that is the
  measured mechanism), so the entry says so and leads with the planner's lever (replan) instead
  of sending anyone to debug transport.
- **`ctx_impact` ships litectx's hedges** (`src/tools.js`), as `caveat` lines. litectx's impact
  is deliberately asymmetric — over-count safe, under-count dangerous — so "isolated / low
  risk" only ever ships HEDGED, and dropping the caveat left `risk low — 0 confirmed caller(s)`
  reading as a licence to change the symbol freely, the one act the asymmetry exists to
  prevent. The spine's `hits` field is counted BEFORE the caveats are appended and keeps its
  old meaning (impact content) — a caveat qualifies the count, it is not more of it, and
  re-meaning a shipped field is how a field stops measuring what its readers think it measures.

### Fixed
- **The close-fix loop laundered a transport casualty into a flat `escalated`**
  (`src/planrun.js`). The step loop restores an escalation's own category (F11: the outcome and
  the spine escalation must agree); the fix loop did not, so a `provider-red` raised there came
  back as `escalated` — and `run.js` keys the F44 `spendComplete:false` floor on the OUTCOME, so
  the run reported an exact-looking total for a call that may never have billed back. Now
  mirrored. Found by the hardening pass, PARKED, and fixed only on hamr's explicit go.
- **The close-fix loop could not tell a drained wallet from spent attempts** (`src/planrun.js`,
  F45 class). The shell spells BOTH terminals `cap-halt` — attempt-exhaustion and a money-gate
  halt thrown mid-attempt — so the category alone cannot split them and only the wallet can.
  The fix worker's gate is built with the wallet at its MOST drained (every step's spend is
  behind it), which is precisely where a money cut masquerades as "the fix failed" and becomes
  a false capability read. The fix loop now reads the wallet exactly as the step loop does: a
  drained wallet returns `cap-halt` (the resume-to-cap checkpoint — the stop IS the
  checkpoint), attempts spent with money still on the table stays the designed `escalated`
  terminal ("the close is still red"). Reachability validated before the fix: nothing guards
  money between the last step and the close. Verdict routing is arbiter territory — fixed only
  on hamr's explicit go.
- **`ctx_recall` was blind to the memory axis, so `ctx_remember` was write-only through the tool
  surface** (`src/tools.js`). The isolate strategy promises *"record a durable conclusion with
  `ctx_remember` so a later step can `ctx_recall` it"* — and the recall handler hardcoded
  `kind: 'code'`, so no note ever came back. The library-level round-trip test could not see it:
  it called `lc.recall` directly, not the verb the worker holds. Recall now queries the fact axis
  alongside code and returns each note on a line labeled `memory` with its BODY inline (capped at
  400 chars, so a bloated note cannot page the context). The body rides because a note is a
  CONCLUSION, not a pointer — there is no worker verb that dereferences a memory id. Same parked-
  then-explicit-go path as above.
- **The aurora U close type-checked another repository** (`scripts/u-spawner-close.mjs`):
  mypy's `explicit_package_bases` named the patient's files `packages.spawner.src.*`, so
  sibling imports fell through to the editable install — a symlink to a DIFFERENT aurora
  checkout. Proven with a planted probe, fixed with `MYPYPATH`; latent not active (seed
  error count unchanged, both prior greens re-verified under the fixed instrument).
- **The stall fuse could be disarmed by the very call it abandoned** (`src/stall.js`, F70). An
  abandoned call is not dead — it keeps streaming (ms3197n8's socket lived 274 minutes past
  the fuse) — so a late beat from that corpse re-armed the watch timing its REPLACEMENT, and
  the replacement could then hang forever without tripping the fuse built for exactly that.
  One shared `Loop` compounded it, letting a corpse's round bound stop the live call. Now
  generation-scoped: `watch`/`beat`/`isCurrent` all carry the generation of the call that
  issued them, and each issued call gets its own `Loop`. Orphan rounds stay metered — an
  abandoned call may already have been billed.
- **The outside watchdog could kill a stranger, or kill a live verdict**
  (`scripts/u-watchdog.mjs`, `scripts/run-u.mjs`, F70). Liveness was `kill(pid, 0)`, which
  answers "does SOME process hold this pid" — and after the SIGKILL/OOM case the watchdog
  exists for, the kernel can recycle that pid onto an unrelated process. Liveness is now the
  PARENT LINK (`process.ppid === pid`), which pid reuse cannot forge, and a guard aimed at a
  non-parent REFUSES to arm at startup (exit 2, no marker) rather than running as a
  plausible-looking guard pointed at nothing. Separately, its stale-spine window was sized
  BELOW the longest legal silence — `runStages` emits nothing between stages, so a legal close
  can be quiet for `closeTimeoutMs × stages` — and is now sized from the spec's own stage count
  plus a margin. Test fixtures rewritten so the victim spawns its own watchdog: the only shape
  that exercises the real parent link. **That closed the stale trigger's half of "kill a live
  verdict" only:** the DEADLINE trigger still killed on the clock alone, on a wall grace whose
  default covered one close stage, and hamr ruled the whole trigger must read activity before
  it signals — the redesign is under *Changed*, below.
- **The ledger counted every stall as a bareloop bug, and then aimed it at the wrong package**
  (`src/ledger.js`, F70 + review). `classifyIncidents` had no branch for `step-stalled`, so the
  F66 fuse's own terminal fell through to "unclassified escalation category" — real upstream
  evidence filed as a fake defect of ours. It was first routed through the TYPED-LIB branch
  `interpreter-red` uses, and the rendered ask refuted that: `StallError` stamps
  `lib: 'bare-agent'` at the throw site, so a live ask read *"bare-agent: the provider path
  failed — worker stalled…"* when **nothing observed the provider path fail**. A stall is the
  ABSENCE of beats. `step-stalled` is now a NAMED member of `EXCLUDED_ESCALATIONS` beside
  `cap-halt` and `wall-halt` (operator ruling, on the wall-halt shape): our own governance
  firing is not an upstream bug, and the stall evidence still rides the spine's own escalation
  event, which is where a real ask would be sourced from anyway. Excluded by name, never
  silently dropped — the excluded-set is executable and counted.
- **`checkMenu` expanded `needs` one level only** (`src/job.js`, F70), so a chain of
  prerequisites ran incomplete — reproducing the false red `needs` exists to prevent, one level
  deeper. Now a transitive fixed-point walk, ordered by close position, visiting each stage at
  most once (cycle-safe by construction).
- **`ctx_impact` printed `calls undefined:undefined` for every callee** (`src/tools.js`, F70).
  litectx returns `defs` and `callers` as objects with a path and a line, but `callees` as bare
  NAMES; the readout assumed the object shape uniformly.
- **The aurora U close floored on tests PASSED, not EXECUTED** (`scripts/u-spawner-close.mjs`,
  the F40 class recurring in a close written after the rule was minted). A skipped or deselected
  test could hide a red without pushing the passed-count under the floor, and only one summary
  bucket was read. Now floors on `executed = collected − (skipped + deselected)` and sums every
  red tally; validated on the real patient (209 executed).
- `WRITE_VERBS` was declared twice — `src/plan.js` held its own frozen copy of `src/job.js`'s
  array, so a third write-class verb could land in one and not the other. `plan.js` now
  re-exports the one inventory (identity-tested, not deep-equal).
- **One defect, one red:** the mailbox rule fired on a step whose `tools` grant failed to
  parse, deriving a second red from a false default on top of the correct
  `missing-required`/`invalid-value` for the bad field. It now fires only on a PARSED grant —
  the step's hands are unknowable otherwise, and the real defect already redded.
- **The retrieval verbs' line numbers are named as ONE 0-based handle space**
  (`src/tools.js`). `recall`, `get` and `impact` all print the index's own 0-based positions —
  one lower than the line an editor shows — and each now says so in its own tool contract. The
  tempting alternative (render `impact` 1-based, since its numbers look display-only) was
  tested against a real index and REFUTED: `impact`'s def range dereferences through `get`
  verbatim and `recall` prints the same number for the same chunk, so renumbering one tool
  would print two numbers for one chunk and turn `get`'s clean chunk-boundary refusal into a
  guessing game.
- **The wall clock advertised a one-stage close** (`src/clock.js`, `src/planrun.js`, W5).
  Enforcement is `maxWallMs + closeTimeoutMs` only when the close is ONE command; a staged
  close (PRD v1.28) runs its stages one at a time and hands EACH the full `closeTimeoutMs`, so
  a 4-stage close at 900s is 60 minutes of close, not 15 — and the run's own outside watchdog
  already sized its stale window that way, which made it the same arithmetic disagreeing with
  itself. `createClock` now takes `closeStages` (threaded from `stageClose`, the ONE staging
  the runner executes — never a second count), `enforcedMs` is the one expression both the
  advertised record and the worst case are computed from, and `report()` puts `closeStages` on
  the `wall-clock` record: without it a reader seeing enforced 90min against a requested 30min
  cannot tell one 60-minute timeout from four 15-minute stages, and an unexplained gap is
  exactly the number a later reader rounds back down to the requested one. The `MIN_WALL_MS`
  floor is deliberately left at one stage — a threshold is operator territory, parked in
  PRD v1.39 rather than re-derived here.
- **A run that ABSORBED a stall reported its spend as exact** (`src/run.js`, W1). The terminal
  `step-stalled` already carried `spendComplete: false`; the common case does not reach it —
  the F66 fuse abandons the hung call and silently reissues it (self-heal), and an abandoned
  call is not a call that was never billed. So a run that stalls and then ends green, escalated
  or at the cap also holds a FLOOR, not a total. `runJob` now watches the `stall` event and the
  flag is one-way: any absorbed stall makes `spendComplete: false` on the job-end, whatever the
  outcome. The same honesty applies to the wall: a `wall-halt` that cut a call mid-flight
  (`cutMidCall`) reports a floor, while a wall stop read BETWEEN iterations — where no call was
  in flight — stays exact.
- **The ctx verbs' spine channel was unscrubbed** (`src/planrun.js`). Every field a `ctx-tool`
  event carries is MODEL-CHOSEN text — a recall query, a stash id, a symbol, a path the worker
  spelled — and the spine is append-only: a log that captures a key captures it forever. The
  emitter is now scrubbed once at the WIRING, with the same ONE inventory (`SECRET_PATTERNS`)
  the close output goes through, so a new ctx verb cannot forget it — seventeen scrubbed call
  sites would have been seventeen chances to.
- **A failing `json-valid` exit could put file bytes on the spine** (`src/planrun.js`). An exit
  detail is supposed to be names and counts, but `json-valid` embeds `JSON.parse`'s own message
  and V8 quotes a window of the SOURCE inside it — a body of 20 characters or fewer is quoted
  WHOLE, and the short-prefix secret shapes (`xoxb-…`) fit inside that window — so the detail
  can carry file bytes the WORKER chose, into a log that is append-only forever. `runPlan` now
  scrubs every detail once at the `judge()` boundary, with the same ONE inventory
  (`SECRET_PATTERNS`) the close output and the ctx-verb channel ride through. The boundary is
  the place, not the three consumers below it: the same details become the `exit-eval` record,
  a fault's escalation `detail`, and the worker gap ralph puts on the spine as
  `close-verdict.gap` — scrubbing at the source makes the leak inexpressible, scrubbing per
  consumer makes it something the next consumer has to remember. `evalExits` itself is
  untouched and does NOT scrub; it is a public export, so an adopter wiring its results into
  their own log applies their own redaction.
- **The stall fuse could reissue a call past the run's wall** (`src/stall.js`, L4). The clock is
  consulted where a ROUND completes and after a step returns; a stall completes no round and
  returns from no step, so nothing read it between the wall passing and the next reissue — a
  worker stalling at its wall could be reissued for up to `maxStalls × stallMs` of calls the run
  had already declined to authorize. The watch now takes the wall as a callback and reads it
  FIRST, before the decision to spend again: past the deadline it gives up as `wall-halt`
  (never `step-stalled`, which is a replan trigger — there is nothing left to re-allocate, and
  the only remedy is `maxWallMs`). Not a retreat from the self-heal ruling: self-heal is what a
  run does with time left.
- **A close that refused SIGTERM hung the run forever** (`src/ralph.js`). On a fault
  (`ENOBUFS`, timeout) the child is asked to leave, but SIGTERM is a REQUEST — a runner with
  its own handler or a trapping wrapper can decline it — and there was no second deadline, so
  no `close` event ever arrived and the run's only remaining stop was the out-of-process
  watchdog. A 2s grace, then SIGKILL, which nothing can refuse; the timer is `unref`'d so it
  can never hold the host loop open (F68's whole point) and cleared on `close` so it cannot
  fire at a child that already left. Verdict semantics are untouched: the FIRST fault already
  named the outcome and the kill only enforces it.
- **The ReDoS detector mis-parsed an EMPTY character class and passed the hazard through**
  (`src/plan.js`, F49). The scan carried the POSIX rule *"a leading `]` is a literal member"* —
  which is not JS: `[]` is the EMPTY class and `[^]` the any-char idiom, and both CLOSE at that
  first `]`. Skipping it ran the scan past the class's real end and swallowed every quantifier
  after it, so `x[^](a+)+$` read as SAFE while `RegExp.test` on it does not finish in 15s on a
  31-char body — an agent-authored exit pattern that passed validation and then hangs the run's
  event loop, which is the whole failure F49 exists to make inexpressible. A false NEGATIVE is
  the dangerous direction, so the scan now follows JS. Four cases join `REDOS_BAD`
  (`x[^](a+)+$`, `(([^]+))+`, `(([]a+))+`, `[^]x(a+)+`). **The monotonicity claim is stated
  honestly rather than assumed:** this is a PARSE correction, not the add-rejections-only
  tightening F49's rule contemplates, and it is not rejection-monotonic by construction.
  Measured over 14,862 compilable generated patterns (2,369 previously rejected), exactly 2
  rejections disappear — both pathological `[]`-bearing shapes whose old `true` came from the
  very misparse being fixed, both verified to finish `RegExp.test` in ~0ms — and every entry of
  the checked-in `REDOS_BAD`/`GOOD`/`OVERREJECTED` corpus is unchanged. The claim is "measured,
  no hazard lost", never "monotonic by construction".
- **The isolate verbs wrote model-authored text into the tree unscrubbed** (`src/tools.js`,
  `src/validate.js`). `ctx_stash`/`ctx_remember` park worker-chosen bytes in
  `<workdir>/.litectx` — a file INSIDE the tree that outlives the step and reads back inline
  through `ctx_recall` — which is the hard line's own sentence (*a record that captures a key
  captures it forever*), one hop away from the spine it was already written for. Both the
  PAYLOAD and the KEY now go through `redactSecrets`, a new export housed beside the inventory
  in `src/validate.js` so detection (`scanSecrets`) and redaction read the ONE
  `SECRET_PATTERNS` list and cannot drift apart. It is IMPORTED, not injected: an injected
  redactor is one a future caller can forget to pass, and this leak has to be inexpressible,
  not optional. Every id-taking verb (`ctx_peek`, `ctx_forget`) scrubs on LOOKUP with the same
  transform, or a stash would be unreachable by the id the worker spelled; and the
  `ISOLATE_MAX_BYTES` cap is measured on the SCRUBBED payload — the one that actually enters
  the store — because a size read off the pre-redaction text reports bytes that never landed
  (the F6 blind-instrument class). The plan flow's own `scrub` collapses onto the same helper.
- **The gate audit was the one persistent channel still logging worker-chosen text in
  cleartext** (`src/planrun.js`). `gate-audit.jsonl` lives IN THE TREE and is append-only, and
  the `Gate` was built without a `secrets` config — so it ran on bareguard's default-on
  backstop, which covers `apiKey`/`authorization`/`Bearer …`/`sk-…` and nothing else. Measured:
  a `ghp_` token landed in cleartext through every model-authored identifier an action carries
  (an isolate verb's `id`, a path the worker spelled), and masked once the gate is handed
  `SECRET_PATTERNS`. Content was never reachable here — `toolAction` reduces a write to
  `{bytes}` — but the identifiers are raw model text. Third channel, same ONE inventory.
- **A plan `parse-error` could carry the DRAFT's bytes onto the spine** (`src/planrun.js`, the
  `judge()` precedent one layer up). A `parse-error` red's detail is `JSON.parse`'s own message,
  and V8 quotes a window of the SOURCE inside it — a body of 20 characters or fewer is quoted
  WHOLE, which is exactly the short-prefix secret shapes. That source is the model's draft, so
  the red rode onto `plan-validate`, onto `plan-red`, and back into the redraft prompt. Every
  red's detail is now scrubbed ONCE at the validation boundary, before any consumer reads it —
  the boundary, not the three emit sites, because scrubbing here makes the leak inexpressible
  while scrubbing per consumer makes it something the next consumer has to remember.
- **A strategy line could name a tool the worker was never granted** (`src/tools.js`,
  `src/planrun.js`) — F19 inverted, and worse than silence: the model spends rounds reaching
  for a menu entry that does not exist. The strategy prose was gated per COMPONENT, so any one
  isolate verb lit a paragraph prescribing `ctx_peek` (a COMPRESS verb), either retrieval verb
  lit the two-step `ctx_recall` → `ctx_get` recipe, and any one select verb named all three.
  New `strategyFor(granted)` assembles the same prose SENTENCE BY SENTENCE, each clause gated
  on its own verb, with the select paragraph's `a, b, and c` grammar preserved. The full-menu
  text is unchanged BY TEST, not by comment: `strategyFor(TOOL_MENU)` is asserted
  byte-identical to the concatenated paragraphs, so a partial grant can only ever see LESS,
  never different.
- **The eight palette verbs had no failure path** (`src/tools.js`). `ctx_get` has always
  wrapped its own failures into a refusal RESULT and emitted them; the eight verbs P added
  (`impact`, `related`, `recent`, `compress`, `stash`, `peek`, `remember`, `forget`) threw
  straight out of the tool loop instead — and a thrown call is the most invisible result there
  is, indistinguishable from a verb that was never reached, so the worker's fall-back to a
  whole-file read reads as a free choice instead of a forced one (the F18 blindness rule). A
  shared `guarded()` wrapper now hands the worker a refusal naming the real cause (a locked
  store, a corrupt index) and emits `outcome:'error', bytes:0` to the spine — one round instead
  of the run, and never a rethrow (L1: throws stay reserved for the BA-4 param-guard class).
  Its field reader is deliberately defensive, since a field reader that throws would take the
  emit down with it — the hole this closes.
- **`validatePlan` could THROW on plain parsed data** (`src/plan.js`). Its contract is that
  every failure is a named red; `Array.isArray(job.writeScope)` admitted the array and asked
  nothing about its MEMBERS, so the next line's `globToPrefix` hit `scope.replace is not a
  function` and a `TypeError` escaped the validator. The fail-closed guard now asks the same
  `isNonEmptyString` question of each member that `legalScopes` already asks of the same field.
- **Three enforced rules the drafter prompt never stated** (`src/planrun.js`). A bound the
  validator reds but the prompt omits is a round burnt on a rule the drafter had no way to
  know: `attempts` said "integer" while `validatePlan` reds outside `1..capRuns`, and BOTH
  `step-scope-escape` reds (a `target` outside its own step's narrowed scope; a `tree-changed`
  scope disjoint from it) were enforced silently. `planPrompt` now takes `capRuns` from the
  SAME source the validator bounds against — one number, so prompt and validator cannot drift
  — and states both scope rules in its own voice.
- **The `check-passes` exit example was the one malformed line among four** (`src/planrun.js`).
  It carried the enumerated check menu INSIDE its JSON `"name"` string, so the example the
  drafter is most likely to copy did not parse. The menu now sits BESIDE the example as its own
  copy-it-character-for-character line, and the regression test parses EVERY exit example, one
  per `EXIT_TYPES` entry, rather than the single `tree-changed` line it happened to pick.
- **The U close scripts' suppression rules missed two escapes that the paid runs actually
  emit, and mislabelled a broken instrument as a timeout** (`scripts/u-litectx-close.mjs`,
  `scripts/u-spawner-close.mjs`).
  - The JSDoc WILDCARD (`{*}`, `{?}`) is `any` under a spelling the `any` rule cannot see — it
    contains no letters. Measured against this repo's own `tsc` (`--noEmit --strict --allowJs
    --checkJs`): a naked `function f(v)` reports TS7006, while `@param {*}`, `@param { * }`,
    `@param {?}` and a `@typedef {*} Loose` used from a `@param {Loose}` each report ZERO
    errors. So the new `any-star` rule matches the tag GENERICALLY (`@\w+`) rather than from a
    list of tags — a list of tags is a list of holes. `{*[]}` / `{Array<*>}` are deliberately
    NOT matched: measured, they still error on non-array use, so they are `any[]`, which the
    `any` rule already covers.
  - The CAST rule read its type body with `[^}]*`, which an inner brace closes early — so
    `/** @type {{ a: number }[]} */ (expr)` walked straight through. That shape is not
    hypothetical: it appears in this repo's own paid U-run diffs (`run3-ms3wawub`,
    `run-ms5uxhej`). Now `.*`, which is bounded by construction — every rule is tested against
    ONE diff line at a time.
  - A `spawnSync` that produced NO exit code was reported as *"timed out"* whatever killed it.
    Measured shapes (node 22): a timeout is `{status:null, signal:'SIGTERM',
    error.code:'ETIMEDOUT'}`, a `maxBuffer` overflow is the same with `ENOBUFS`, an external
    kill is `{status:null, signal:'SIGKILL'}` with no error at all. Collapsing them hands the
    operator a wrong cause and hides a broken instrument behind a bound that never fired (the
    casualty-vs-evidence class); each now names itself. The spawner close also gains the
    sibling's `maxBuffer` (1 << 28) — a red pytest run prints every traceback, and the overflow
    does not truncate, it SIGTERMs the child, i.e. a real red arriving dressed as an instrument
    stop.
- **A close child ending in `process.exit()` drops its own queued stdout, and the runner read
  the short capture as a short close** (F71, `tests/staged-run.test.js`,
  `tests/ralph.test.js`). One test's staged-close fixture arrived truncated about 1 run in 250
  under load — stream ending mid-line, the `FAILED:` names gone, exit code still 1 — which is
  the F28 failure-names-lost class arriving nondeterministically. Root cause is the CHILD's:
  node discards whatever is still queued on its stdout pipe when the process calls
  `process.exit()`, and the parent then sees a clean EOF, a real exit code and no fault, so a
  lost tail is indistinguishable from a close that simply printed less. Measured 7/500 shorts
  with `process.exit(1)` against 0/500 with `process.exitCode = 1` on the identical fixture, and
  12/12 deterministically with a 50ms reader stall. The earlier reading in that test's comment —
  *"pipe writes are synchronous on Linux, so there is nothing pending to drop"*, and *"only the
  runClose path loses bytes"* — is REFUTED on both halves and rewritten with the measurements
  that refuted it. What shipped is the fixture's `process.exitCode` spelling (now named as the
  fix it is, not a free tidy), a precondition asserting the stage's LAST line reached the gap
  so a short arrival can never again surface as a confusing `gapKeep` failure three assertions
  later, and a whole-capture guard pinning the half the RUNNER owns: past the pipe's 64KB
  capacity, with the host loop frozen mid-stream, a close that exits cleanly is captured WHOLE
  (mutation-checked — it kills a reader that caps accumulation at 64KB, 4/4). The residual is
  named, not hidden: the production close scripts still end in `process.exit()`, safe today
  only because they self-cap their output at 40 lines, which is inside the measured-immune
  band. See F71.

### Changed
- **BREAKING for adopters — `runClose` and `runStages` are async and return Promises**
  (`src/ralph.js`). The close child is awaited instead of `spawnSync`, so a running close no
  longer freezes the host event loop (F68 — measured: a 3-stage close went from 0 host ticks
  during 3.5s of close to 126 ticks with a worst gap of 26ms). Every close semantic is
  byte-identical, verified by a 25-case old-vs-new differential: timeout signal (SIGTERM →
  `timed-out`), 1 MiB per-stream output ceiling (`ENOBUFS` → broken-close, deliberately not
  widened — an over-long close must not be judged on truncated output), gap shape/bounds,
  exit bands, redaction, cwd, stdin EOF. The one visible difference: a spawn fault's detail
  prose says `spawn` instead of `spawnSync` (nothing parses it).
- **BREAKING for plan authors — `check-passes` now requires a write-class verb (`write`/`edit`)
  on the SAME step** (`src/plan.js`, `exit-illegal`). A shape that validated before is rejected
  now: a read-only "verify" step that carries a check. Measured before it was built (P-read runs
  ms4l5p6w / ms57zr7c): 4 of 4 drafted plans put every `check-passes` on a read-only verify step,
  and both runs stalled to cap on a byte-identical gap delivered to a worker that could not edit.
  A failing check's gap is re-delivered to THAT step's own worker, so the step must be able to act
  on it — a read-only one is a mailbox with no hands. The check belongs on the step that fixes;
  the run's final verification is the operator's close, which the agent never authors. The drafter
  prompt states the same law, so prompt and validator can never disagree. The red is SUPPRESSED
  when `tools` failed to parse: the step's hands are unknowable then, and charging the ledger with
  a violation derived from a false default would double-red one defect.
- **BREAKING for an adopter holding an approval for an omitted-`tools` spec — the spec hash is
  taken over the RESOLVED spec** (`src/job.js`, MED-1). `tools` is optional and its absence
  means the whole `TOOL_MENU`; `plan.js` and `planrun.js` resolve it with exactly that
  predicate at runtime, so an omitted-`tools` spec's ceiling GREW every time the menu did while
  its bytes never moved — and that widening was unsigned. `jobSpecHash` and `checkApproval` now
  canonicalize the same resolved form, with an omitted `tools` filled in as the concrete current
  menu, so a signature pins WHICH menu it covers and a menu change flips the hash straight into
  the existing refuse-until-reapproved machinery. A spec that named its own ceiling hashes
  byte-for-byte as before — no migration for a signature already in flight — and an approval
  minted for an omitted-`tools` spec re-signs once. Writing today's full menu into a spec that
  omitted `tools` is hash-NEUTRAL, which is the point: the two spell the same ceiling. The
  resolve sits INSIDE each path's existing throw guard, because a spread runs getters.
- **The wall PAUSES the run; it never cuts the grade** (`src/planrun.js`, `src/ralph.js`, W-2 —
  hamr: *"when time is up, keep the grade we already have and stop"*). The close is never
  bounded by the wall and always runs to completion: a deadline that kills grading leaves the
  run unreadable after the money is already spent (the F45 class, generalized from money to
  time). What the wall stops is the START of new work — past the deadline the close-fix loop
  opens no further iteration, and the same rule covers a step that would begin already expired.
  The run then stops on the verdict the last close minted, and nothing after the deadline is
  allowed to change it. The iteration it declines was guaranteed worthless anyway: the metered
  round check stops the fix worker on its FIRST round so it writes nothing, and the iteration
  then re-runs the FULL staged close over an unchanged tree to mint the verdict already on the
  record — `capRuns` times over. The stop is a decision-ready `wall-halt` carrying the verdict
  that stands, how much of the loop was actually spent, and a progress TREND read off the two
  most recent close gaps: byte-identical is `stalled`, different is `moving`, and one grade
  alone is `unknown` — never rounded up to `stalled`, which would recommend rewriting a goal on
  no evidence (F6's rule applied to a trend). The trend exists because the two levers point
  opposite ways, and both are spec edits whose new hash needs re-approval: raise `maxWallMs`
  and resume (resume-to-cap — the stop IS the checkpoint) or revise the goal so the work fits
  the time; abandon is the third. `cutMidCall` still splits the two readings, so which
  instrument saw the deadline stays on the record, and the step-site record names its two
  caps SEPARATELY: `capRuns` is the RUN's attempt cap — what the fix-site record has always
  written — and `stepAttemptCap` is the step's own tightened cap, the number that actually
  bounded THIS step. Previously the one key carried both meanings depending on which site
  emitted it, leaving a reader of two records of the same type no way to tell which. It is
  not a universal bound and is not claimed as one: a STEP already under way still runs its
  own exit checks after the deadline.
- **The close child no longer inherits the operator's credentials** (`src/ralph.js`,
  `CLOSE_ENV_DENY`, PRD v1.41 — hamr: *"strip it when unnecessary, minimize unneeded
  exposure"*). `runClose` built the child's env as `{...process.env}` minus
  `NODE_TEST_CONTEXT`, and that child is not an ordinary subprocess: `npm test`, `pytest`,
  `tsc` execute **worker-authored code**, with network, in the tree they are about to judge.
  Nothing that judges a tree needs a provider key, so the exposure bought nothing. Two rules,
  deliberately both: the KNOWNS (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`,
  `GOOGLE_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, `NPM_TOKEN`, the whole
  `AWS_*` prefix) exist only for names the shape rule cannot see, and the NAME-SHAPE rule —
  anything ending `_API_KEY`/`_SECRET`/`_TOKEN`/`_PASSWORD`/`_CREDENTIAL(S)`, case-insensitive
  — is the load-bearing one, because a literal denylist is a chase every new provider extends.
  A COPY is stripped, never `process.env`: the host keeps the key bare-agent spends every
  round. Placed at `runClose`, the single close-spawn seam, so `runStages` and every derived
  `check-passes` inherit the same blinding — one instrument, never two. **Stated as what it is:
  exposure reduction, NOT a sandbox.** bareloop runs locally as the operator's OS user, so
  worker-authored code still has that user's file access (including the shell profile that
  exports the variables just stripped) and the network. Real containment is a different
  mechanism, unbuilt, and claimed nowhere; README and `bareloop.context.md` carry the same
  boundary note. Arbiter territory: no drafted plan or config can express, widen, or opt out.
- **Scripts — unshipped, but the surface a user actually runs.**
  - The outside watchdog's DEADLINE kill is ACTIVITY-AWARE (hamr: *"the kill from outside should
    check for activity/bytes or other markers for activity, not a silent kill"*). Past the
    deadline it kills only when the spine has ALSO been flat for a full stall-fuse window;
    past-deadline-but-still-writing logs LOUD every poll and is never killed — the in-process
    fuses and the money cap own bounding a run that is alive, this guard owns processes that are
    dead. Every kill states the trigger, the deadline arithmetic and the marker's value and age
    before the signal goes out. ONE marker, spine bytes: a CPU marker (`/proc` utime+stime) was
    built alongside it and REMOVED after measuring broken in BOTH directions — a close runs its
    suite in a CHILD whose ticks are credited only at reap, so a live close read DEAD; and
    `run-u`'s own 1s lag sampler wakes the watchdog, so a wedged run read ALIVE at production
    constants (its kill tests passed only at a dead-window:poll ratio of 5:1 where production
    runs 60:1). hamr: *"keep what is simpler/available"*.
  - The wall grace is `stages × closeTimeoutMs`, and `run-u` passes it. The watchdog's own
    default is ONE stage, so a 4-stage close left on the default put the outside deadline at
    wall+15min while a legal close can still be mid-verdict at wall+60min. A spec that sets no
    `maxWallMs` now OMITS `--wall-ms` and names the unbounded choice out loud on both sides of
    the process boundary, instead of passing the string `undefined` — which fell back to the
    null default and silently disarmed the deadline trigger while the header still claimed a
    wall. Same NaN-disarms-a-guard class, one flag over.
  - `run-u`'s spine leak check is a TRIPWIRE, not a note in the margin: on any hit the run exits
    **3** (distinct from 2 = operator/config and 1 = stale `--approve`) and the BRIDGE is NOT
    written — a spine carrying a secret must never graduate into a reusable artifact that
    outlives the run. Count and path only, never the matched content: echoing it to stdout is
    the same leak, one hop on.
  - `run-u` can no longer be killed by its own guard's startup. The watchdog path was taken
    from `new URL(...).pathname`, which stays percent-ENCODED — a checkout under a directory
    with a space hands `spawn` a `%20` path that does not exist, and the guard dies at second
    zero on the one run it exists to protect (`fileURLToPath` now, the spelling the sibling
    scripts already use). And a spawn failure arrives as an EVENT: an unhandled `'error'` on a
    ChildProcess is an uncaught exception, so a guard that could not start would have ENDED the
    paid run. It is handled LOUDLY instead — the run continues UNGUARDED from outside, under
    its own fuses, wall and money cap, and says so, because a reader must never mistake a
    missing watchdog marker for "the guard was watching and never fired".
  - **All nine remaining hand-rolled secret scans in `scripts/` now call the canonical
    `scanSecrets`** (11 call sites, 2 already canonical). F40 parked the conversion; hamr
    retired the park on his word, and both risks it guarded were closed by MEASUREMENT rather
    than assumption — equivalence on 900 spiked real-spine cases (670 hits, 0 divergences,
    with the comparison demonstrated ABLE to diverge), and archived evidence that can no longer
    shift. FINDINGS addendum sits on the F40 block; the JSONL spine-reader park is untouched.
- **litectx ^0.29.1 → ^0.31.0** (LC-3 delivered, yield-only shape — atomicity intact,
  `setImmediate` between parses). Every worker's index call now passes `{ yield: true }`, so the
  F66 stall fuse's timers, the wall clock and the lag sampler stay alive through an index pass
  instead of dying inside one long block. Consumed on the BINDING max-block clause (189–252ms,
  n=4, 2× headroom) **with the miss on record**: liveness read 54–58% on our fixture against a
  60% proxy bar, and the criterion was NOT re-amended after measurement.
- bare-agent 0.34.0 → 0.35.0 (BA-19 delivered: `deadlineMs` total-call bound, `EDEADLINE`,
  `context.bound` discriminator, terminal by design; bareloop wiring PARKED — the F66 fuse
  already self-heals this class above the transport).

### Removed
- **BREAKING — the legacy operator-authored `steps[]` path is deleted** (PRD v1.32, hamr:
  *"i just want to get rid of it"*). `steps[]` is the shape where the OPERATOR hand-writes the
  workflow steps — the exact thing bareloop exists to remove (*"there shouldn't be user
  authoring anywhere"*, v1.28) — and it had been co-existing scaffolding since Layer 2 landed,
  forcing every downstream schema decision to carry two spellings.
  - **Gone from the public surface:** `interpret`, `STALL_REDS`, `validateConfig`, `diffPaths`,
    `extractRules`, `MAX_RULES`, `MAX_RULE_CHARS`, `LOOP_SHAPES`, `SLOTS`, `VERBS`, `CLASSES`,
    `STEP_MODES`, and `runJob`'s `opts.target` / `opts.execCmd`. **config-v1 is fully removed**,
    not merely declared dead (F22 declared it): the drafted-workflow-config schema, its knobs,
    the drafting call, the rules extractor, and the hitl draft-PR mechanics went with the path
    that consumed them. A spec still carrying `steps[]` reds `shape-retired:steps` **by name**,
    so an old spec is told what happened instead of half-running.
  - **What it costs, stated plainly:** `hitl` is not dead code — `jobs/litectx-maintainer.json`
    ran 6 times and opened a real draft PR once, and it is the only job that produced the
    product's actual end state (a change for a human to merge) rather than a benchmark grade.
    **That job goes dark** until the plan shape implements hitl. `soft-green` was never
    implemented past its declaration. **How both come back is deferred to Layer 3 and
    deliberately undecided** — by standing doctrine graduation between rungs is a REWRITE, never
    a copy, so keeping the old implementation alive for a later rung preserved code that would
    never have been copied.
  - **What survived, and where it lives now:** the machinery the plan flow imports was housed in
    the deleted files but was never part of the dead path. The worker tool menu (`TOOL_BY_VERB`,
    the ctx tools, the gate action translator, the personas and strategy lines) moved
    `src/interpret.js` → **`src/tools.js`**, which is what it always was; the fence and secret
    primitives (`globToPrefix`, `scopeContained`, `sweepSecretLiterals`, `SECRET_PATTERNS`,
    `scanSecrets`) stay in `src/validate.js`, now purely the shared primitives both validators
    go through. The ledger's prose verb-sniff list was relocated VERBATIM rather than re-derived,
    so incident classification is byte-identical across the deletion.
  - **Coverage was re-pointed, not dropped.** The suite goes 616 → 395 tests because the tests
    of a deleted path die with it; every guard that OUTLIVED the path was moved rather than
    deleted — the approval binding, the pre-token smoke and four money-contract readings are
    ports onto the plan shape in `tests/run.test.js`, the fence/secret assertions were re-pointed
    at the primitives themselves in `tests/validate.test.js`, and the close-body rules
    (`judged`, `gapKeep`, quotes-in-cmd, secret sweep) now address the plan close. Guards that
    simply moved house are named where they now live: `close-unsupported`, `broken-close`,
    `already-green` and the close's cwd in `tests/planrun.test.js`; `close-crashed` and the
    close-output scrub in `tests/ralph.test.js`.

### Added
- **T — a run has a CLOCK, and time is a material the planner is told as a balance**
  (PRD v1.27/v1.29, design record 2026-07-26 + addenda 1–3). Money was the only bound in the
  system; nothing bounded TIME, and job #5's own plan authorised ~630 worker turns (F56).
  - `maxWallMs` joins the SIGNED job spec (`src/job.js`) — integer ms, **no default**, floor
    one close timeout (`MIN_WALL_MS`). A run without it is time-unbounded *by explicit
    operator choice*, never by an unnoticed fallback (F45: a defaulted cap is a silent second
    ceiling). Adding it changes the spec hash — re-sign.
  - New `src/clock.js` (`createClock`, `PROVIDER_TIMEOUT_MS`, `MIN_CALL_TIMEOUT_MS`): one
    wall clock per run. Enforcement is a **between-round deadline** because `loop.stop()`
    cannot cut an in-flight call — F61 measured it fired at 500ms and returned at 4,018ms —
    so the honest enforced worst case is `maxWallMs + closeTimeoutMs` and BOTH numbers are
    reported (`wall-clock`, `report()`), never the flattering one. Unbounded reports as
    `null`, never `0` and never `Infinity` (F6 extended to time: an unknown duration is
    reported as unknown).
  - `runPlan` emits `wall-clock` (at start), `wall-bounded` (an attempt cut by the deadline —
    the same seam the round bound rides; the partial work is judged and its gap fed forward)
    and terminates `wall-halt` with a decision-ready escalation naming the requested vs
    elapsed ms. The stop IS the checkpoint: raise `maxWallMs` and rerun.
  - **Materials at draft** — `runPlan` emits `materials` and the plan/replan prompt now
    carries `{ balanceUsd, remainingMs }`: what is LEFT, as a balance, never a per-round rate
    (hamr's correction, PRD v1.29). F57 measured a 150× spread on verification-gap duration,
    so a per-round constant describes almost no real round and a rate framing creates a
    rush-or-fake incentive. The agent sees both axes; the arbiter is untouched — materials go
    to the PLANNER at draft, and the worker stays blind (no budget, no close, no clock).
- **A — the replan trigger gains a VARIANCE axis** (design record §3.4): a step that has
  consumed `VARIANCE_THRESHOLD` (0.5, hamr's number) of the run's *remaining* money or time
  with its exits still red is stopped at the head of its next attempt and routed as a
  `step-variance` replan — the planner re-allocates what is left instead of the step eating
  the run. Emits `variance {step, iteration, threshold, moneyShare, timeShare, axis}`. The
  hard ceiling of **ONE** replan is unchanged (unlimited replanning launders thrash as
  adaptation, v1.12); a second `step-variance` after the replan is spent is a STOP.
  - **Recorded honestly: this trigger is INERT on every workload with data (F63).** Replayed
    across 18 archived spines / 54 steps / 101 judged attempts it would have fired **0
    times** (near misses 0.35 · 0.35 · 0.40 · 0.45), and the premise it was built on —
    F56's *"a replan has never fired in the entire programme"* — is FALSE: eight replans had
    already fired, four days before F56 was written.
  - **Threshold decided at 0.5 with that inertness on the table** (hamr, *"keep 0.5"*, PRD
    v1.31). It is therefore a guard set ABOVE the observed population, not a tuned trigger —
    moving it to 0.35 to catch those four points would be fitting the number to the data.
- **The staged close — the user authors the DESTINATION, never the road** (PRD v1.28, hamr:
  *"there shouldn't be user authoring anywhere, that defies the point of bareloop"*). `checks[]`
  is retired outright: a spec that still declares it reds `checks-derived` **by name**, not a
  bare `unknown-field`. In its place the operator's close becomes an ORDERED LIST of NAMED
  STAGES, and the check menu the agent picks from is DERIVED from that list — nobody
  hand-authors a check per job, ever.
  - `close: [{ name, cmd, expect, judged?, gapKeep?, offer?, needs? }, ...]` (`src/job.js`) —
    kebab-case unique names, every stage a `predicate` command body (a rubric/hitl stage is
    inexpressible by shape); `needs` must name EARLIER stages and is incoherent with
    `offer: false` on the same stage (a chain with nothing to reach it). A single `predicate`
    close object is legal shorthand the plan flow adapts into a one-stage list; a
    `gold`/`rubric`/`hitl` object close still validates (the declared-but-locked verdict
    classes) but the plan flow refuses it at runtime as `close-unsupported` — it names no
    command to run. `checkMenu(close)` (`src/job.js`) derives the offerable stages, each
    carrying the ordered chain (prerequisites, then itself) that a `check-passes(name)` pick
    must run.
  - `runStages` (`src/ralph.js`) runs a stage list as ONE close: first red renders the verdict,
    later stages never run; the gap names the failing STAGE, never a culprit file (v1.12/F28
    untouched); the secrets scrub runs on every stage.
  - `runPlan` (`src/planrun.js`) wires the close precheck, the check-menu preflight (now
    emitting `check-menu {offered, hidden?, meaning?}` — a partial menu is a stage that cannot
    stand alone as a ruler, never a failure), the `check-passes` seam, the outer close, and the
    fix loop through `runStages`; `validatePlan` (`src/plan.js`) derives its legal
    `check-passes` names from `checkMenu(job.close)` instead of a separately-signed list. Every
    job spec in `jobs/` migrated to the staged shape.
  - **Two decisions taken 2026-07-26 (hamr, *"agreed on both, validate your claims"*), built and
    validated:**
    - **Layer R's red-set is the FAILING STAGE's, per attempt.** A staged close has N
      `gapKeep`s, so `createRoot().observe()` (`src/root.js`) now takes `redStage`/`redKeep`
      and REFUSES to compare red-sets across a stage change (a different wall is a different
      failure — the same bucket as one-known-one-UNKNOWN, never a fire). `root-injected` gains
      an optional `redStage`. **Measured, not assumed:** the rejected alternative — one union
      `gapKeep` pattern fixed for the run — was rejected because job #4's two close stages are
      near-clones of one grader (7 of 12 kept-line templates byte-identical), so a union
      kept-set can read identical across a stage change and false-fire, which "inert when not
      stuck" forbids.
    - **The grading stage is not lendable.** Of the six specs in `jobs/`, the four with a final
      `verdict` stage set `offer: false` on it; the other two have no grading stage at all and
      hide a `changed-from-seed` PRECONDITION instead. The flag is kept **per-spec**, not as a
      schema rule — "the last stage is the grade" holds where it applies and is unproven in
      general. `check-menu` preflight always
      announces the derived menu either way, so a forgotten flag is visible in the run's own
      record; a test reads every spec in `jobs/` and reds if any offers a stage NAMED `verdict`.
      The guard is stated over the convention that exists rather than over position — the fifth
      spec proved "the last stage is the grade" is not structural.
  - **Scripted-provider evidence only — the staged close has not yet run against a real
    model.**

### Changed
- **The `tree-changed` scope is now a MENU the agent picks from, not a glob it authors and
  guesses the shape of** (design record 2026-07-26 §4, hamr's *"did agent choose from a list or
  not?"*). F60 measured **13 of 18 validator reds as this one class**: the agent writes
  `{"type":"tree-changed","scope":"src/*.js"}`, the grammar accepts only a trailing `/**` or
  `/*`, and every red costs a redraft call. Teaching the rule in the prompt or widening the
  grammar both leave the agent authoring free text; enumerating makes an illegal scope
  **inexpressible**.
  - New `legalScopes(writeScope, dirs, cap?)` (`src/plan.js`) is the ONLY producer of scope
    menus: the signed fence entries (always offerable — they cover directories a step has not
    created yet) plus the real directories beneath them, fence-filtered, deduped,
    shallowest-first, capped at `MAX_SCOPE_MENU` (24). Because it filters by the fence, a menu
    entry that escapes containment cannot be constructed rather than being caught downstream.
  - `planPrompt` gains a `scopes` parameter and lists the values verbatim, one per line;
    `validatePlan` gains `opts.scopes` and accepts **membership only**. Omitting the option
    derives the menu from the signed `writeScope` — fail-CLOSED, never a free-text containment
    fallback (F50: a silently-ignored optional param is the blind-instrument class).
  - An off-menu scope **splits by cause**: outside the signed fence stays `scope-escape` (a
    behaviour signal the ledger keys on), in-fence-but-unoffered is `invalid-value` carrying the
    menu so the redraft can choose. Collapsing them would launder an attempted fence escape into
    a typo class.
  - `runPlan` emits `scope-menu {offered, truncated, offerableCount?, cap?}` — no silent caps.
  - `globToPrefix` is **untouched**: this changes what the agent is offered, never what the
    fence enforces.

### Fixed
- **F64 — a wall-derived call timeout was reported as a network failure**, so the operator's own
  governance stop was filed as a transport casualty (never evidence, retried, carrying the F44
  `spendComplete:false` floor) and the human was told to fix the provider binding. `clock.callTimeoutMs()`
  bounds each provider call by the time left, and bare-agent's `TimeoutError` carries a code but no
  category — which the runner defaulted to `provider-red` at four separate seams.
  - New `isWallTimeout(err, clock)` + `TIMEOUT_CODE` (`src/clock.js`) is the whole discriminator: an
    `ETIMEDOUT` on an **expired** clock is the wall's own stop. One `categorize()` inside `runPlan`
    is now the ONLY place an uncategorised throw is classified, so the worker seam, the native seam,
    the scout/drafting relay and the close-fix loop cannot drift apart. A throw that named its own
    category still keeps it.
  - Every wall stop emits ONE record shape, with `cutMidCall` splitting a deadline that landed
    inside a provider call from one read between steps; `ralph` gained a `wall-halt` decision entry
    so a governance stop no longer reads as "the middle broke", and its options are raise-the-cap,
    not retry-the-provider. `runPlan` can now return `wall-halt` from the drafting and fix paths too.
  - **The controls are part of the fix:** the same error with time still on the clock stays
    `provider-red` (a real dead socket is never laundered into a governance stop), and an unbounded
    run can never produce a `wall-halt`. Stated limit: a genuine hang on a run whose wall has ALSO
    passed reads as `wall-halt` — the run is out of time either way and the remedy is identical.
  - Also closed a coverage hole found en route: the **between-steps** wall terminal had no test at
    all since it shipped. `runPlan` gains an injected `now` (the seam `createClock` already exposes)
    because `maxWallMs`'s floor is one close timeout, so real time cannot exercise the terminal.
- **F59 — the SCOUT returned nothing on 15 of 18 runs, so the planner drafted blind.** The
  round bound is enforced from the metering callback (`loop.stop`), so a scout still calling
  tools on its last round was halted mid-tool-use and its `text` was empty: it spent its whole
  allowance exploring and never wrote the survey that is its only deliverable. `planPrompt`
  then substituted `(no scout notes)` — a legal prompt, so the failure was silent. Measured
  across every archived plan-v1 run: 15 of 16 bounded scouts produced 0–86 bytes; both scouts
  that finished on their own produced full 6–8KB surveys. Two fixes:
  - **The summary round is now reserved.** A bounded-and-short scout gets one **toolless**
    round on the same conversation (`askFrom`), where text is the only possible output — a
    mechanical guarantee, never a prose request (F19/F37: a persona pacing mandate was violated
    6/6). Native is excluded by design: a toolless native session reports no cost (F48), so a
    recovery round there would be unmetered spend.
  - **An empty survey is now loud.** `scout-empty` is a named spine event. It is never a halt —
    3 of 5 archived greens had an empty scout, so failing the run there would be a worse error
    than the one being fixed.
  - `scoutRounds` is now a shell-owned option (like `capRuns`/`maxStepRounds`).
  - **Confirmed live:** the patient that returned 0 bytes returned 5379 bytes after the fix.
    F60 then measured what that survey is worth: it carries ~15× more real repository
    specifics into the plan, and roughly triples the plan's declared work.

### Changed
- **bare-agent 0.33.1 → 0.34.0** (BA-18 delivered). The provider now bounds socket
  **inactivity** itself (`timeoutMs`, 10-minute default, per-call overridable, rejecting with a
  retryable `TimeoutError`/`ETIMEDOUT`), so a silently-dropped socket is a 10-minute error
  instead of a ~2-hour hang. The harness-side stale-socket guards in `scripts/run-screen-types.mjs`
  and `scripts/probe-materials.mjs` are deleted as superseded. **`Retry` stays deliberately
  unwired:** a BA-14 `EPIPE` dies on write so the request never reached the API and a retry is
  free, but a timed-out request may have been accepted and processed — retrying pays twice for
  one completion. A trip is a clean `provider-red`, and the escalation's own "retry the run"
  option recovers it without the double-bill.
- `planPrompt` is exported from `src/planrun.js` (in-repo seam for probe drivers; **not** added
  to `src/index.js`, so the adopter surface is unchanged). Probes now import the shipped prompt
  instead of copying it — the N3 pre-probe's verbatim copy was diffed against source and found
  identical, so F51–F55 stand, but a copy is a fixture and new drivers do not take that risk.

## [0.5.1] — 2026-07-24

### Added
- **Layer R wired into the plan-v1 flow** (F50). The within-run ratchet (`layerRoot`) now
  engages in `runPlan` — one root per EXECUTE step (red-set = the exit evaluator's own gap)
  AND in the outer close-fix loop (red-set = the close's own `gapKeep`) — not only on the
  legacy `steps[]` path. So a plan-shape job can emit `root-injected` and the pre-registered
  ON-vs-OFF default-flip read becomes possible on the accepted surface. The write-tee is wired
  so same-path target rewrites are visible to the detector. Still OFF by default (`layerRoot:
  false`, F41). Excluded on native/clipipe (no `onToolResult` seam — F48 fallback surface).

### Fixed
- **F49 (security-hardening): the agent-authored `artifact-written` regex can no longer hang
  the exit evaluator.** `plan.js` rejects nested-quantifier ReDoS patterns (`(a+)+`, `(\d*)*`,
  `(x+){1,}`, and redundant-wrapper forms like `((a+))+` / `(?:(a+))*` / `(((a+)))+`) at the
  validation gate, before any tokens burn. The wrapper class was a review-caught false negative
  in the first (flat-only) scan — each measured to hang `RegExp.test` >8s on ~29 chars — closed
  by propagating an inner repeat up through the enclosing group; the change is MONOTONIC (it only
  ever adds rejections, the fail-safe direction, and cannot introduce a new false negative). LOW
  self-DoS, no arbiter compromise; input-bounding was rejected as theater (a 33-char body hangs)
  and a JS regex timeout as disproportionate (worker/RE2 dep).
- **F50: `runJob` no longer silently ignores `layerRoot` for plan-shape jobs** (was accepted
  and dropped — an advertised no-op).

## [0.5.0] — 2026-07-23

### Added

- **Layer 2 core — the plan-v1 flow (design record
  `docs/plans/2026-07-21-layer-2-plan-v1-design.md`; premise validated in F46).**
  The semantic converter, built:
  - **job-v1 four-field plan shape** (`src/job.js`): `goal` / `verdictType`
    (`green|soft-green|hitl` frozen radio — v1 admits `green` only; a locked type is a
    `request-red` with the type as a structured `verb` field) / `close` / `checks[]`
    (operator-SIGNED named checks: the predicate-close body + a slug name, same
    validation, same runClose machinery; checks decide nothing and mint nothing) /
    `tools` (the plan ceiling). Exclusive with legacy `steps[]` (`shape-conflict` red);
    `steps[]` is co-existing scaffolding with a staged sunset — archives alongside
    config-v1 when the Layer 2 path proves itself in its battery.
  - **plan-v1 validator** (`src/plan.js`, `validatePlan`): gates the AGENT-authored
    plan against the SIGNED spec — verbs ⊆ ceiling (`verb-escape`, verb as structured
    data), rounds ≤ shell cap, targets/scopes inside the fence, exits from the closed
    menu only (`exit-illegal`), `check-passes` resolving against the signed menu
    (`check-unknown` names the menu), no `dependsOn` (strictly sequential — an inert
    knob is a fake contrast lever), AND-only exit composition max 2, and the F17
    pairing law (check-passes on a write step demands tree-changed — the seed tree is
    green). Fails CLOSED on a missing/non-plan-shape job (`job-invalid`).
  - **exit evaluator** (`src/exits.js`, `snapshotScope`/`evalExits`): the shell's own
    fixed code for `artifact-written` / `tree-changed` / `json-valid` /
    `check-passes`. Outcome, never intent: sha256 snapshots, identical re-writes are
    not changes (F43), git status never consulted (F45). Instrument faults ride out as
    `fault` by runClose verdict name — escalated, never fed to the worker as a gap.
  - **the judge seam** (`src/ralph.js`): `ralph({ judge })` — the PRD v1.12 §4
    generalization; shell-injected, inexpressible in any config or plan. Same verdict
    vocabulary, so the forbidden zone, F32 worker-crash routing (a check crashed by the
    worker's own test feeds back — the F46 mechanism), and cap taxonomy are unchanged.
  - **the plan executor** (`src/planrun.js`, `runPlan`): close precheck
    (`already-green` distinct, F17) → checks preflight ($0, before tokens) → read-only
    SCOUT → PLAN (one redraft with reds fed back) → sequential micro-loops with
    exit-gap feedback → ONE replan (exhaustion only) → the operator's close with one
    bounded fix loop. Every round metered `worker-round` with a phase label (F12);
    prompt contract v1.12 §5 mutation-proven; `plan-executed` (plan-as-executed,
    design law #2) on the spine.
  - **runJob dispatch** (`src/run.js`): a plan-shape spec routes through the ONE
    runJob entry — same approval gate, smoke, ledger, and job-end money contract.
    New outcomes: `already-green | plan-red | check-red | close-red`.
  - 139 new tests (503 total), TDD throughout, 3 targeted mutations fired and killed.
    Built and integration-tested against scripted providers.
- **Layer 2 rung ACCEPTED — the real-model acceptance battery (F47; prereg
  `docs/02-experiments/TESTGEN-PREREG.md` §2026-07-22a/b).** Job #4 (TESTGEN) run
  through the REAL plan flow (`runJob → runPlan`: scout → the agent DRAFTS the plan →
  validator gates → per-step check-loops → outer grader), on `anthropic-api`,
  claude-sonnet-5, vs F39's baseline (0 conversion) and the F46 POC (hardwired).
  **3/3 valid acting rows converted (≥2/3 bar) → accepted; 3/3 cleared the 45% bar
  (67.5/55/55, vs the POC's 27.5/40/37.5 with 0 at 45); 3/3 the agent composed the
  `check-passes(clean-run)` exit ITSELF** (the one thing the POC could not test). Every
  green driven by the step check-loop alone; all writes fenced, source frozen, secrets
  clean; the F45 spend guard stopped an unpriced casualty. 7 provider-red casualties
  across an Overloaded window (excluded as evidence), $27.36 of a $30 cap. This trips
  the "path closes green end-to-end" milestone: **`steps[]` and config-v1 sunset on
  landing.** Driver `scripts/run-battery-l2accept.mjs` (gained `--need`/`--priorUsd`
  for a multi-run continuation under one governed cap).
- **Module 4d — native clipipe worker surface (BA-16; `bare-agent` → `^0.33.0`).** The
  plan flow now runs on TWO surfaces: the `Loop` (API, unchanged) and, when
  `job.provider === 'clipipe-subscription'`, the `claude` CLI's NATIVE tool channel — the
  subscription path (no metered API). Since native governance is constructor-time and
  per-worker, the runner takes a `nativeProvider` FACTORY (`{policy, onTurn?, maxTurns,
  hasTools}) => provider`) it calls fresh per worker: `hasTools:true` → native tool mode
  (the SAME `wireGate` fence clips onto the provider — a live POC proved an out-of-scope
  write is DENIED); `hasTools:false` → the toolless drafter runs metered claude-json TEXT
  mode (a native session reports no cost — this path keeps the drafter's spend visible).
  Money reconciles per session (accounted `worker-round` = session total; `worker-turn` =
  attribution); `max_turns` is a bounded attempt, not an escalation; a missing factory is
  `interpreter-red`, never a silent fall-back to the API. 5 native tests + a live
  end-to-end smoke on the real CLI (green, all workers metered, `spendComplete` honest).

- **Native read-cap — the CLI truncation fix (F48; `bare-agent` → `^0.33.1`, BA-17
  ranged read).** On the `clipipe-subscription` surface the `claude` CLI truncates a large
  tool result (~40–50KB, measured) BEFORE the model sees it — spilling the remainder to a
  fenced-off `tool-results/` file and wrapping it in a "read in chunks" notice the model
  distrusts as injection — so a whole-file `shell_read` of a large file blinded the native
  worker (0-write stall). The runner now bounds the native `shell_read` result below the CLI
  cap (`NATIVE_READ_CAP`) and returns a TRUSTED notice steering to `ctx_get` ranged retrieval,
  plus a native-only strategy line; the API path is untouched (full result rides into context).
  Measured: **0 → 7 writes** on the real job. Cross-surface verdict (F48): the native surface
  is capable at the STEP but did not carry job #4 to a grade — 0/2 acting rows vs the API's
  3/3, and a 3.5× budget raise ($8→$28) was refuted (escalated on the F39 semantic-stall at
  $7). IN only as a babysat, $0-marginal-billing fallback; **only the `anthropic-api` surface
  is guaranteed.** Local LLMs remain deferred and unmeasured.

### Fixed

- **Layer 2 pre-release review (F48) — 4 fixes, 2 correctness** (TDD, failing-then-passing
  test each; full suite 519/519): (1) a provider-red/gate-red raised DURING a step's micro-loop
  was collapsed to `step-red:<id>` — a transport CASUALTY recorded as a capability failure and
  missing the F44 `spendComplete:false` floor; each terminal category now rides out under its own
  name so the returned outcome and the emitted escalation agree (F11). (2) `tree-changed` counted
  a sibling scope's files as deletions when a step had ≥2 tree-changed exits (merged snapshot),
  falsely passing an unchanged scope — deletions are now scoped to the exit's own prefix. (3)
  abandoned-plan artifacts no longer ride forward as the new plan's "prior steps' results" after a
  replan. (4) dead `isUnpriced()` sub-conditions removed from the replan/cap-halt terminal (the
  step-end guard already returns `pricing-red` first).
- **Layer 2 whole-branch review — 8 doctrine-restoring fixes to the plan flow** (all in the
  graduated Layer 2 code, none in pre-existing modules; validated against source with 0
  refuted, a failing-then-passing test each): a `gold` close validated under `verdictType:
  green` crashed `runPlan` with no `job-end` (now `close-unsupported` before tokens); the
  `check-passes` gap was re-truncated to 400 chars, deleting the gapKeep failing-test names
  (F28 reintroduced — now carried whole); no in-flight `pricing-red` (F6 — now bails at
  scout/plan/step); the plan drafter's Gate budget was frozen pre-execute and reused for the
  replan (now a fresh drafter per `obtainPlan`); a money-gate halt triggered a replan instead
  of stopping (F45 — now gated on funds, drained → honest `cap-halt`); the step-setup catch
  recorded a category the escalation contradicted (F11 — now agreed); the plan branch dropped
  F44's `spendComplete:false` on a transport-throw `provider-red`; a write-only tool ceiling
  validated, blinding the scout (now requires ≥1 read-capable verb).

## [0.4.0] — 2026-07-21

### Added

- **Layer R — the root, the within-run ratchet (`src/root.js`; design record
  `docs/plans/2026-07-19-layer-r-design.md`, interview-locked 2026-07-19).** The shell
  mechanically detects fixation — consecutive attempts rewriting the same file(s)
  without moving the close's kept-failure set — and injects an escalating note into the
  next attempt's prompt: a capped summary first, then the worker's own prior failed
  edit content verbatim (the BA-14 rejected-edit-buffer shape, rewritten for our
  attempt loop). Fixation-gated (inert when not stuck — RSI §3.3: the lift is a
  fixation phenomenon, an honest null on a strong unstuck model), shell-authored (the
  worker authors nothing, gains no verb), within-run only (state dies with the run;
  inheritance stays verdict-gated). Red-set comparison strips the spec-reporter's
  per-run duration stamps (POC-measured: kept lines are never byte-stable) —
  comparison-only, the delivered gap is untouched. Spine event `root-injected` carries
  stage/mode/streak/paths, never content (append-only law). Ships **OFF by default**
  (`layerRoot: false` on `runJob`/`interpret`; pass `true` for the ON/experimental arm) —
  decided 2026-07-21: fixation is extinct on every current job (F41), so ON has never won
  its own A/B; the default flip to `true` defers to the first Layer 2 job that produces
  natural fixation (see `docs/01-product/LAYERS.md` Layer R note).

### Fixed

- **F44 — fresh whole-branch review: three correctness bugs + cleanups, all validated and
  mutation-proven.** (1) A casualty job-end laundered unknown spend as complete: `1b0720c`
  put `spentUsd` on every path, so a provider-red TRANSPORT THROW reported
  `spendComplete: true` (F6 violation — the failed call's cost is unknown) and the battery
  scripts' `spentUsd == null` casualty-STOP never fired. Fixed both sides: the transport
  provider-red now reports `spendComplete: false` (the metered draft-truncation keeps
  `true`), and the frozen battery/probe scripts key their STOP on
  `spendComplete === false || spentUsd == null`. (2) Layer R's outcome probe mislabeled a
  missed-anchor edit as "landed" when its `newText` appeared elsewhere (substring
  false-positive) — now discriminated by the tool result, exact-equality for writes, one
  read not two. (3) Layer R false-fired on a progressing text-mode worker with no gapKeep
  (write-overlap is constant-true when the single target is rewritten every attempt) — a
  `writesInformative` flag now requires a known-unmoved red-set when writes carry no
  information. Cleanups: double redaction, unbounded `attempts` retention, a dead ternary.
  (2) and (3) are latent behind the OFF-by-default `layerRoot`.

- **Layer R settled its note on the gate's allow, which is written BEFORE the tool runs
  (F43).** An `allow` record states INTENT, never that bytes reached a file:
  `shell_edit` returns an anchor miss as a refusal *result* and a byte-cap overflow as a
  throw, both leaving the file untouched with the allow already on the audit. The
  verbatim note could therefore present content to the worker as "your own previous
  changes — they landed" while that text was provably absent from the file it named
  (reproduced end-to-end: 3 allowed edits, 0 bytes changed). Fixed by splitting the two
  axes rather than merging them — the DETECTOR keeps reading intent (an edit that never
  applied is still repetition; a tree-diff detector measured blind to it on every
  attempt), while the NOTE settles on the observed file through `Loop`'s
  `onToolResult` seam. An unapplied repeat now names the missed anchor instead, which is
  the mechanical gap genre (F38). `commitWrite` is replaced by `settleWrite(landed)`.
- **Guarded the `maxTurns` LLM-round invariant (F43 follow-up).** bareguard's `maxTurns`
  ticks on every `gate.record`; our cap means "LLM rounds" only because the sole record
  path is the LLM one (tool calls take `gate.check`, which does not tick). That was
  correct but unguarded — wiring tool results into `gate.record` would silently halve the
  LLM budget (the F37 lower-silent-ceiling class). Added a guard test pinning "every
  `gate.record` is `type:llm`" (mutation-proven: wiring tool records turns it red) and a
  config comment marking the invariant load-bearing. No behavior change; no upstream ask —
  bareguard already offers the correct counters.
- **F41 — the disposition: armed-and-inert, field read deferred.** Before any ON/OFF
  battery spent money, two cheap reads measured the disease's base rate: the archive
  sweep (`poc/layer-r-base-rate.mjs`, $0 — every surviving spine is OFF-arm by
  construction) read 0 fixated in 10 pairs on jobs #2/#4; two frozen probes on a
  rebuilt job #1 patient (`scripts/run-probe-layer-r.mjs`, $10.12 total) read 0
  fixated in 4 pairs — including against a three-plant tree (three subsystems, one fix
  cannot green) that forced a full 8→4→green ladder across three judged attempts.
  Every pair was healthy navigation. F21's fixation was a broken-loop symptom, cured
  by the F20/F21/F30/BA-13 fixes. Because ON has therefore never won its own A/B,
  Layer R ships **OFF by default** (decided 2026-07-21; `layerRoot: true` is the ON
  arm) — measured cost-free when enabled and healthy (zero injections across all
  probe runs); the repetition-drop ON/OFF read, and the default-flip decision, defer
  to the first run whose spine records `root-injected`. No learning claim is minted.

### Changed

- **`jobs/litectx-maintainer.json` `budgetUsd` 1.5 → 4.5** (probe 2, re-signed): $1.50
  funded exactly ONE judged attempt on the real patient — a run could red at attempt 1
  and die at the gate mid-attempt-2, structurally unable to produce across-attempt
  evidence. The advertised budget must fund the attempts the cap promises.

## [0.3.0] — 2026-07-19

### Fixed

- **A `close.judged` pattern with more than one capture group now reds at validation
  (F40).** `runClose` reads capture group 1 only, so an alternation carrying the count
  in another branch left group 1 `undefined` → `NaN` → `judgedCount` null → an exit-0
  **green stamped `crashed`** (the mirror of the fake green the floor exists to catch);
  at precheck that escalates `close-crashed` before the worker runs. The validator's
  message already promised ONE group and only enforced "not zero". Alternation stays
  expressible with non-capturing branches: `(?:a|b) (\d+)`.
- **Upstream-ledger attribution reads a typed `lib` field instead of sniffing error
  prose (F40).** `interpret` prefixes every worker-loop error with `worker loop:`, and
  the verb sniff ran first — so a bare-agent transport failure whose text merely
  contained "recall" was billed to litectx. The throw site now stamps the owner it
  knows, `ralph` relays it, and prose remains the fallback for older spines (the
  `request-red` contract).
- **An unrecognised escalation category is counted, not silently dropped (F40).** The
  dispatch keyed on four bare literals with no default, so a new or renamed category
  vanished exactly like a deliberate exclusion. Exclusions are now an executable set;
  anything outside {classified} ∪ {excluded} is charged to bareloop as a stale mapping.
- **The drafter is offered a PER-STEP share of the budget, not the whole pot (F40).** The
  config is drafted once and re-validated at every step against what is left, so a ceiling
  sized to the whole budget went stale the moment step 1 spent: step 2 then red `bounds` on
  an unchanged config with money still in the pot. The advertised ceiling is now
  `(budgetUsd − drafting reserve) ÷ predicate steps`, which still fits after earlier steps
  have spent (the shares sum to the reserve-less budget). A drafting bound, not an
  enforcement one — cap-not-estimate is unchanged and still tested, and a step needing more
  than its share cap-halts cleanly rather than starving the steps after it. **Every shipped
  job has one predicate step and is arithmetically identical.**
- **`jobs/aurora-fix.json` counts tests EXECUTED, not tests PASSED (F40).** A passed-count
  floor conflated "did the close judge?" with "did the tests pass?", so the red tree the job
  exists to fix fell under the floor and escalated as an instrument crash at precheck,
  before the worker ever ran. Pattern is now `collected (\d+) items`; the patient's
  `close.sh` swaps `-q` for `-ra` (`-q` prints no executed-count line at all, and `-ra` is
  required or the job's `gapKeep "^FAILED "` loses every line it carries to the worker).
- **Revisor rounds no longer spend the worker's per-attempt bound (F40).**
  `roundsThisAttempt` resets once, *before* the revisor phase, and revisor turns share
  the worker's metered handler — so R revisor rounds silently left the worker 40−R while
  the prompt still advertised 40, and a revisor burning the bound stopped the worker loop
  before its first tool call. Money still meters on the run's axis (F12); only the round
  charge moved. Restores "the advertised bound and the enforced bound stay the same
  numbers on both axes", and matches the carve-out the summarizer fold already had.
- **Two F6 cost launderings closed (F40).** `run-job1`/`run-job2` printed
  `spent: $0.0000` for provider-red/pricing-red runs (whose `job-end` carries no
  `spentUsd`, and which can end after real priced spend) — now `UNKNOWN`, the
  `run-battery` spelling. The `revision-red`/`revision-accepted` spine events recorded
  `costUsd: 0` for an unpriced revisor — now the honest null.

### Added

- **`scanSecrets(raw)` — the ONE spelling of the raw-text secret scan (F40).** The scan
  was hand-rolled at seven call sites off `SECRET_PATTERNS`; detection and redaction
  must never disagree about what a secret looks like. Exported beside the inventory,
  `sweepSecretLiterals`'s text-side twin.

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

### Fixed (release review, 2026-07-19 — fresh full gates over the whole branch)

- **The plan-only call no longer carries the tool menu.** In tool mode with a drafted
  `loop.shape: 'plan'`, the decompose call ("Plan only, no code") was offered the full
  granted menu — a model calling `shell_write` during the plan round mutates the tree
  before the implement round exists. The menu IS the grant (2b): the plan call now gets
  an empty menu. Reachable by any tool-mode job on any run (the drafter picks the shape);
  the combination was unexercised by any test until now.
- **`extractRules` consumes the parser's own red.** It took `extractArtifact(...).code`
  and dropped `.red`, so an empty model response surfaced as a generic JSON
  `parse-error` instead of the already-computed `'empty response'` — the ONE-parser
  doctrine requires both callers to consume the red field (`interpret` already did).
  Now a distinct `artifact-red`.
- **`run-job1` couples `shellCapUsd` to `spec.budgetUsd`** like every sibling runner —
  the library default cap of $2 was a second, silent ceiling: a signed resume top-up
  above $2 would red `bounds` on a budget the human explicitly approved (the advertised
  budget must BE the enforced one).
- **`ctx_get`'s repo-relative conversion is boundary-aware** (`workdir + sep`): a bare
  prefix match would garble a sibling path like `<workdir>-backup/x`. Defense in depth —
  the gate independently denies such paths before the tool executes.
- **`jobs/litectx-maintainer.json`: `gapKeep "^✖ "` + the `edit` grant** — the two
  omissions vs every sibling spec. The keep pattern is derived from the real
  `--test-reporter=spec` red output (failing tests repeat unindented in the summary
  block, so each failing-test NAME survives the gap bound exactly once — F28). Spec
  edit = new hash; `run-job1` refuses until re-approved.
- **`scanSecrets` + `CLOSE_FAULTS` are exported from the package root.**
  `bareloop.context.md` documented both as public API; the exports map admits only
  `"."`, so neither was actually reachable by an adopter. The contract is now true.
- **Recorded, parked (arbiter territory):** symlink write-through is bareloop's
  caller-contract debt — bareguard documents that its fence resolves lexical traversal
  only and callers must canonicalise. No granted verb can create a symlink; the vector
  needs a pre-existing one inside the patient's writeScope. UPSTREAM-ASKS "OUR SIDE" §7.

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
