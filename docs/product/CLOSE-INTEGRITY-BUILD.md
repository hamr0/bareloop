# Close integrity — frozen build spec (2026-09-06)

Locked from PRD item 27 (`docs/product/PRD.md`, incl. the two 2026-09-06 addenda: the
close-bytes rung widening to CLOSE INTEGRITY — bytes AND cwd — and the same-day close-timeout
fold-in, "both … autoset and can be override, same like api pricing"). Every clause below
names its call site. "Built" is not "done": done = the pre-registered validation at the
bottom greened.

## Ground truth ($0 reads, 2026-09-06)

- **The instrument this rung fixes.** `runClose` (`src/ralph.js:221`) spawns the close's
  `cmd`; `runStages` (`src/ralph.js:328`) walks a `close[]` array first-red-wins; the
  close call inside the fix/verdict loop (`src/ralph.js:663`) reads
  `timeoutMs: closeTimeoutMs ?? 120_000` — a defaulted cap with no operator-set floor,
  the same shape the wall's no-default rule already forbids for `maxWallMs`.
  `validateJob` (`src/job.js:175`) is pure (no fs) and its field list, `JOB_FIELDS`
  (`src/job.js:143`), has no room today for a close-bytes or timeout field.
  `jobSpecHash` (`src/job.js:725`) hashes the RESOLVED spec — a field added to
  `JOB_FIELDS`/`CLOSE_FIELDS` is covered by the existing hash function with no change to
  `canon`/`resolveSpec`. `MIN_WALL_MS` (`src/job.js:95`) is a one-stage default-timeout
  floor, explicitly left to operator territory in its own JSDoc — the same doctrine this
  rung's `K`/`FLOOR_MS` constants sit under.
- **Where a mismatch or a slow close currently goes unnoticed.** The close-first precheck
  (`check-preflight`, `src/planrun.js:1761`) runs `runStages`/`runClose` exactly like the
  fix loop — any integrity check placed inside `runClose`/before it fires on the precheck
  too, for free, by construction. The escalation tail's `--resume` strings
  (`src/planrun.js:1313`, `2636`, `3465`) are written for `run-u`; the bundle CLI shares
  the same strings today and names a flag it does not implement (F130).
- **`src/bundle.js`'s existing guard is the template, not the destination.**
  `absolutePathLiteralsOf` (`src/bundle.js:160`) and the `close-absolute-path` red
  (`src/bundle.js:378-379`) already scan a close script's source for a baked-in absolute
  path that exists on disk, at EXPORT time only. This rung moves the same reader to a $0
  run-start integrity precheck that runs for every job, not only bundles (PRD item 27(c)).
- **`src/cli.js`'s `runJob` call passes neither `capRuns` nor `closeTimeoutMs`**
  (confirmed at the call site, ~`src/cli.js:306`), so the bundle CLI runs on the library
  defaults (`capRuns: 3`, `closeTimeoutMs: 120_000`) while `scripts/run-u.mjs` sets
  `CLOSE_TIMEOUT_MS = 900_000` (line 131, "the slowest close stage is the suite (~23s
  aurora, ~53s litectx); headroom, not a budget") and `CAP_RUNS = 4` (line 137), passed at
  `run-u.mjs:925`/`1208`. F130 (`docs/logs/FINDINGS.md`) parked whether the bundle CLI
  should mirror these; this rung's autoset design makes the parked question moot for the
  timeout (M3), leaving `capRuns` mirroring untouched and still parked.
- **9 of 10 hand-authored close scripts hardcode an absolute `WORKDIR`** (F129,
  `docs/logs/FINDINGS.md`): `grep -n "^const WORKDIR" scripts/*-close.mjs` names
  `testgen-cold-check`, `testgen`, `types`, `l2poc-check`, `u-bareagent`, `u-bareguard`,
  `u-litectx`, `u-baremobile` (8 remaining after `u-spawner-close.mjs`'s fix in `3b987d4`;
  `u-pulselog-close.mjs` already takes `--workdir` and needs no change).

## Facts measured today (2026-09-06, $0), cite as such

- **Archive read, 54 archived run-u spines with ≥2 closes** (`../bareloop-patients/*/u-*.jsonl`;
  close duration ≈ close-verdict.ts − preceding middle-done/check-preflight.ts): seed close
  p50 2,946 ms (max 209,026); later-close max p50 25,153 ms, p95 130,643, max 263,944;
  ratio later/seed p50 7.72, p90 615, p95 1,225, max 9,385. 3 of 54 runs had a later close
  over 120,000 ms (would be `close-red` under the library default the bundle CLI runs on
  today); 1 seed over 120 s. Cause of the tiny seeds: `runStages` is first-red-wins — at
  seed, `changed-from-seed` reds in ~164 ms and the suite never runs, so the archived seed
  time is BLIND to suite time. This is the reason a naive "time the seed close, use that
  as the ceiling" design would fail on most jobs.
- **Direct per-stage seed timing, clean clone of aurora-u at `d661e50`**
  (`../bareloop-patients/aurora-u-bless`, cwd = clone, close = re-pinned
  `../bareloop-close/scripts/u-spawner-close.mjs`): `changed-from-seed` exit 1 / 164 ms;
  `typecheck` exit 1 / 2,043 ms; `tests-kept` exit 0 / 20,243 ms; `suite-green` exit 0 /
  20,039 ms; `no-suppressions` exit 0 / 184 ms. Sum 42,673 ms. The real full LATER close in
  run `mtpo9rxy` (all 5 stages satisfied) took 41,769 ms (spine: close-verdict iter 1 minus
  middle-done). So an ALL-STAGES seed timing predicts the later close within 2% (n=1,
  one job) while the first-red seed timing is off by ~250×. This is the POC result for the
  autoset design (M3); state its power honestly — n=1, one job, no cross-job
  generalization claimed.

## The build, three milestones, each independently shippable, sequential builders

### M1 — cwd + gate rule + honest tail ($0, no arbiter numbers)

1. **cwd fix, 8 remaining scripts.** `scripts/testgen-cold-check.mjs`,
   `scripts/testgen.mjs`, `scripts/types.mjs`, `scripts/l2poc-check.mjs`,
   `scripts/u-bareagent.mjs`, `scripts/u-bareguard.mjs`, `scripts/u-litectx.mjs`,
   `scripts/u-baremobile.mjs` read `process.cwd()` instead of a hardcoded `WORKDIR`,
   following `3b987d4`'s template on `scripts/u-spawner-close.mjs`. Behaviour-preserving:
   `run-u` always passes `cwd` = the patient, so `process.cwd()` and the old constant name
   the same directory on every existing run.
   Verification: each script's stages run at $0 in its OWN patient copy under
   `../bareloop-patients/` with cwd = that copy; record every exit code alongside the
   pre-fix run's exit codes on the same tree (must match).
2. **`close-absolute-path` moves from export-time to a $0 run-start integrity precheck.**
   The reader (`absolutePathLiteralsOf`) is shared with M2's fingerprint minting — it must
   read every close script the spec's `close[].cmd` names (`node <path> …`) BEFORE the
   close-first precheck (`src/planrun.js:1761`) and before any tokens spend. A baked-in
   absolute path that exists on disk is a red (`close-absolute-path`) for EVERY job, not
   only bundles. The spec's OWN `cmd` path is the address and stays allowed; the rule is
   about the SCRIPT'S CONTENT, never the field naming it. `validateJob` stays pure — this
   check runs in the runner (`src/planrun.js`/`src/run.js`), which already has fs access
   for reading close scripts, never inside `src/job.js`.
3. **Honest escalation tail.** `src/cli.js`'s `runJob` call threads a `resumable: false`
   hint (or equivalent) so the shared escalation-readout builder in `src/planrun.js`
   (the `--resume` strings at lines 1313, 2636, 3465) prints "resume is `run-u`-only in v1"
   for the bundle CLI instead of naming a flag it does not implement (F130's parked item
   2), while `run-u` keeps its existing `--resume` lines unchanged.

### M2 — close-bytes signature

New signed spec field per stage: `close[].sha256` = sha256 of the SCRIPT FILE BYTES that
stage's `cmd` names (not the spec, not the path — the file on disk `cmd` resolves to). It
sits INSIDE the spec so `jobSpecHash` (`src/job.js:725`) covers it with no change to
`canon`/`resolveSpec` — the existing hash function already hashes whatever fields
`resolveSpec` returns. Wiring:

- `CLOSE_FIELDS.predicate` (`src/job.js` ~line 148) gains `sha256` as an allowed key;
  absence is a validator red `missing-required` at `close.<i>.sha256` — every EXISTING job
  spec must re-hash to add this field (hamr's call on re-baseline, per item 27).
- The integrity precheck (M1's reader, extended) verifies the byte hash at run start AND
  before every close run (precheck included, via the same `runClose`/`runStages` call
  sites), not only at signing time. A mismatch is a NEW typed red, `close-tampered` —
  refuse at $0, distinct from `close-red` (instrument fault) and `plan-red` (a judged
  "no"). This is the general fix N4 named as PRD item 27's destination
  (`docs/product/EXPORT-BUILD.md`): the bundle path already gets an equivalent guard via
  `manifest.files` sha256 + `bundle-tampered`; this rung gives bareloop ITSELF the same
  property without export.
- **Minting.** A `bareloop sign`-style helper (or a `scripts/` tool) fills `sha256` from
  disk for every stage in a spec. Export's manifest hash stays and MUST agree with the
  spec's `close[].sha256` fields — disagreement is a red (the two signatures cover the
  same bytes by two paths; they must never drift apart silently).
- **Locked.** The agent never writes this field — it is arbiter territory exactly like
  `budgetUsd`/`maxWallMs`; the authoring pipeline's declaration schema must not admit it
  (same inexpressibility discipline as the close kind catalogue itself).

### M3 — close timeout: autoset + signed override

Ruling (hamr, 2026-09-06: "both … autoset and can be override, same like api pricing" —
the guesstimate-plus-loud-sign-plus-customer-override shape, never a hidden knob):

- A $0 TIMING PREFLIGHT runs EVERY stage once, ignoring verdicts (first-red-wins stays
  for the verdict precheck at `src/planrun.js:1761` — this is a SEPARATE pass, run once
  per job start, sequential, same discipline as `runStages`'s "never two closes in
  flight against one tree"). It emits one `close-timing` spine record carrying per-stage
  ms, mirroring the shape of the existing preflight-baseline records `src/planrun.js`
  already mints.
- The per-stage ceiling = `max(FLOOR_MS, K × max(stage ms across the timing pass))`.
  Printed on every run as `close timeout: <n>s (estimated from seed timing)` when
  autoset, or `close timeout: <n>s (signed override)` when the spec field below is
  present — the visibility guard doctrine already established for close-stage
  `direction` (v1.82, `src/trend.js`/`run-u.mjs`'s banner print): a silent default is the
  same shape as the bug it fixes.
- **Optional signed spec field `closeTimeoutMs`** = operator override. An explicit number
  wins over the estimate outright; it is the OPERATOR'S number, so it may legally sit
  ABOVE the autoset estimate (this is not tighten-only — it is the customer-override
  shape, same as rates passthrough's guesstimate-plus-override doctrine, F113).
- `MIN_WALL_MS`/between-round deadline arithmetic (`worstCloseSilenceMs`-shaped
  computations, e.g. `run-u.mjs:1149`'s `CLOSE_TIMEOUT_MS * closeStages`) must read the
  EFFECTIVE value (autoset or override), never the old constant.
- Both runners (`run-u.mjs` and `src/cli.js`'s bundle CLI) go through the SAME path;
  `run-u`'s `CLOSE_TIMEOUT_MS = 900_000` (line 131) retires in favor of the autoset/
  override value it computes the same way the bundle CLI does.
- **`K` and `FLOOR_MS` are arbiter constants hamr sets — write them as `TBD (hamr)` with
  the evidence above; this build does NOT pick them.**
- **Named hole, not fixed by a bigger K.** A worker may legitimately slow the suite by
  adding tests (a real, correct change to close duration mid-run, after the timing
  preflight already ran). The signed override is the honest escape for this case — never
  a widened `K`, which would just re-open the same "defaulted cap with no floor" hazard
  one multiplier later.

## POC first (dev rule), $0 — already run, above

The riskiest assumption here was "does an all-stage timing pass predict the real later
close well enough to seed an autoset ceiling." That POC ran (see "Facts measured today"
above): within 2% on the one job/run measured, versus ~250× off for the naive first-red
seed timing. n=1 — this is evidence the METHOD works, not a validated K/FLOOR_MS pair;
those stay arbiter-set per the ruling above.

## Pre-registered validation (definition of done)

1. **Unit tests with mutation proof:**
   - `close-tampered` — a stage whose file bytes differ from its signed `sha256` reds at
     precheck AND at every later close run; mutation-proven (flip the guard, confirm the
     test catches it).
   - `close-absolute-path` at run start (not just export) — reds for a job spec with no
     bundle involved at all; a regression pin running the guard over a REAL affected
     close script (before its cwd fix) must red.
   - `close-timing`/ceiling arithmetic — `max(FLOOR_MS, K × max stage ms)` computed
     correctly from a scripted timing pass; wall-deadline arithmetic reads the effective
     value.
   - Override precedence — a signed `closeTimeoutMs` above the autoset estimate wins and
     is what the printed banner and the wall arithmetic both use.
   - `missing-required` on `close.<i>.sha256` for every stage once the field is required.
2. **$0 all-stage timing on aurora AND litectx** (two jobs, not one — this rung's POC was
   n=1/one-job; validation widens to a second job before the method is trusted broadly).
3. **One paid fire of a re-exported aurora bundle** (spec changes here → new
   `jobSpecHash` → re-approve, re-bless) on hamr's word.
4. **Bench re-sign is hamr's call** (per item 27's own text: "re-hashes every job → bench
   rows re-sign and re-baseline, hamr's call which way").

## Status line: FROZEN, POC (timing method) PASSED n=1. Build not started.
