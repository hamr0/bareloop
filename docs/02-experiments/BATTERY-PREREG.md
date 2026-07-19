# Plant battery — pre-registration (FROZEN 2026-07-15)

**Status: FROZEN** (enumeration+verification by agent, decision rules by operator). This document enumerates candidate single-line plants for the N2 loop
benchmark and records the empirical verification of each. **The decision rules (which plants
enter the suite, and how difficulty is scored) are NOT set here — they are frozen with the
operator, in the empty section at the bottom.** This is the anti-fit-to-pass discipline that
`JOB2-PREREG.md` established: the sites and the evidence are fixed before any rule, so no plant
is ever selected to make a rule pass.

The existing job #2 (`src/notify.js` falsy-guard, admitted for the loop in FINDINGS F29) is
**P1** here — the anchor. The battery adds siblings across the other legal sites so the suite
has a difficulty spread, not seven copies of one bug.

---

## Patient

- **Repo:** `mailproof`, analysis clone (never the working repo, never the live-evidence copy).
- **Frozen commit:** `091027d4d88922a451752f08d019c81736b09873`.
- **Close:** `npm test` → `node --test '(tests/unit|tests/integration)/**/*.test.js'` (TAP).
  **317 tests, green at HEAD**, ~19–26s. Verified green on this clone before any plant.
- **Clone integrity check:** P1 (the notify falsy-guard) reproduced the EXACT five `not ok`
  lines recorded in `JOB2-PREREG.md` — same tests, same count. The clone and the frozen
  commit match the calibrated patient byte-for-behaviour.

---

## Site enumeration (mechanical)

The patient-selection rule (`JOB2-PREREG.md` §"Patient-selection rule"): a file is a legal
plant site iff **(a)** no test file name-maps to it, and **(b)** the branch to be broken is NOT
covered by any same-named UNIT test — it is reached only through integration/e2e tests. The
operative consequence, checked empirically for every plant below: **no failing test names the
culprit file.**

25 source files. Same-named test mapping (established by filename + confirmed by attributing
every failing subtest back to the file that defines it, via literal-name grep of `tests/`):

| src file | unit test? | integ test? | legal plant site? | note |
|---|---|---|---|---|
| classifier | ✓ | — | no | unit name-maps |
| completion | ✓ | — | **branch-dependent** | unit covers most branches; some branches escape it (see P6) |
| create | — | ✓ | **yes (b)** | no unit test; integ `create.test.js` covers the composition surface, not the notify-wiring guards |
| crypto | ✓ | — | no | unit name-maps |
| dkim-archive | ✓ | — | no | unit name-maps |
| dsn | ✓ | — | no | unit name-maps |
| envelope | ✓ | — | no | unit name-maps |
| event-mutex | — | — | legal-by-name, **UNUSABLE** | no test anywhere; every plant GREENS the suite (no concurrency test) — a coverage hole, not a benchmark site |
| event-store | ✓ | ✓ | no | unit name-maps |
| gitrepo | ✓ | ✓ | no | unit name-maps |
| index | ✓ | — | no | unit name-maps |
| ingest | — | ✓ | **yes (b)** | no unit test; large pipeline reached only via integration/e2e |
| notary | ✓ | ✓ | no | unit name-maps |
| **notify** | — | — | **yes (a)+(b)** | no test anywhere — the P1 anchor |
| ots | ✓ | ✓ | no | unit name-maps |
| outbound | ✓ | ✓ | no | unit name-maps |
| parse | ✓ | — | no | unit name-maps |
| prefilter | ✓ | — | no | unit name-maps |
| proof-anchor | — | ✓ | legal-by-name, **UNUSABLE** | every plant tried GREENS the suite — the OTS/anchor path is not exercised by the close (no `ots` binary in tests) |
| router | ✓ | — | no | unit name-maps |
| sweep | ✓ | ✓ | no | unit name-maps |
| templates | ✓ | — | no | unit name-maps |
| types | — | — | legal-by-name, **UNUSABLE** | JSDoc-only, zero runtime code — a plant cannot red `node --test`, only `tsc` |
| verifier | ✓ | ✓ | no | unit name-maps |

**Usable legal sites: `notify.js`, `create.js`, `ingest.js`, and specific uncovered branches
of `completion.js`.** Three files (`event-mutex`, `proof-anchor`, `types`) are legal by the
name-map rule but cannot host a benchmark plant: two green the suite (the close never exercises
them) and one has no runtime. That a plant there GREENS is itself a finding — mailproof's
cross-process mutex and its OTS proof-anchor pass are **not tested by the close at all**; a real
bug in either would ship silently. They are coverage holes, disqualified as plant sites by the
same rule that disqualifies any green-the-suite edit.

Verification method, per plant: apply the one-line edit alone on the clean tree → `npm test` →
record exit, `# fail` count, and every `not ok` line → grep `tests/` for each failing subtest
name to attribute it to a file → confirm the culprit's same-named test is NOT in the failing
set → revert. A plant that greens, explodes (>15 fails), or is named by a failing test is
**rejected**, with the reason recorded.

---

## Accepted plants

All line numbers are against the frozen commit. All difficulty predictions are **hypotheses**
to be tested by the loop, not claims. "Failing tests" are the verbatim `not ok` subtest names;
the count is `# fail`. Every accepted plant was confirmed: **no failing test name-maps to the
culprit file.**

### P1 — `src/notify.js:74` — the falsy-guard (the anchor; = admitted job #2)

- **Edit:** `if (custom) body = custom;` → `body = custom;`
- **Contract (notify.js:11–12, verbatim):** *"A hook throw or falsy return falls back to the
  neutral default; a hook can never break delivery."*
- **Failing tests (5), exit 1:**
  ```
  not ok - remind+: workflow — initiator triggers reminder to every eligible step (ctx.reminder=true)
  not ok - triggers: composeNotification overrides the body; neutral default otherwise
  not ok - triggers: completion ctx exposes countedCommits + per-reply receipts from the ledger
  not ok - triggers: completion ctx for crypto carries the one signer receipt
  not ok - m7d e2e: every kernel occasion fires through one deliver(), keyed by kind
  ```
  Files: `ingest-triggers` (×3), `ingest-initiator-command`, `m7d-e2e`. None name `notify`.
- **Predicted difficulty: attempt-1-easy — MEASURED, not predicted.** F29: green on attempt 1,
  $0.30, with the failing-test names in the gap. (One-shot tool-free it was 0%, F27 — the loop's
  tools were the whole difference.)

### P2 — `src/create.js:234` — the edit-renotify activation guard

- **Edit:** `if (ev && ev.activated_at && ev.type === 'workflow') {` →
  `if (ev && ev.type === 'workflow') {` (drop the `activated_at` condition)
- **Contract (create.js:221–224, verbatim):** *"re-notify only a participant reassigned ONTO a
  currently-eligible step of an ACTIVATED event … a pending event's replies wouldn't count yet,
  so neither warrants a kickoff here."*
- **Failing tests (1), exit 1:**
  ```
  not ok - edit-renotify: a non-participant edit, and edits on a pending event, ping no one
  ```
  File: `activation-edit`. Does not name `create`.
- **Predicted difficulty: easy–medium.** The failing test title states the expected behaviour
  plainly; the culprit is a guard sitting right beside the `deliver` call it gates. Small
  navigation hop (which of create.js's notify guards?), no misdiagnosis trap.

### P3 — `src/create.js:237` — the blocked-step reassignment guard

- **Edit:** `if (c.field !== 'participant' || !c.to || !eligibleIds.has(c.step_id)) continue;` →
  `if (c.field !== 'participant' || !c.to) continue;` (drop the eligibility check)
- **Contract (create.js:221–224, verbatim):** *"a blocked step's new owner is pinged later via
  `advance` when it becomes eligible."*
- **Failing tests (1), exit 1:**
  ```
  not ok - edit-renotify: reassigning a BLOCKED step does not ping (advance will, later)
  ```
  File: `activation-edit`. Does not name `create`.
- **Predicted difficulty: easy–medium.** As P2 — explanatory test, culprit next to the seam.

### P4 — `src/create.js:217` — the first-transition kickoff guard

- **Edit:** `const notified = res.alreadyActive ? [] : await notifyActivation(res.event);` →
  `const notified = await notifyActivation(res.event);` (fire the kickoff unconditionally)
- **Contract (create.js:210, verbatim):** *"Activate, then — only on the FIRST transition —
  fire the activation kickoff."*
- **Failing tests (1), exit 1:**
  ```
  not ok - activation: sequential workflow pings only the first eligible step, once
  ```
  File: `activation-edit`. Does not name `create`.
- **Predicted difficulty: easy–medium.** The word "once" in the failing title points straight
  at an idempotency/first-transition guard.

> **P2/P3/P4 cluster note:** all three sit in `create.js` and all three red the SAME single
> integration file (`activation-edit.test.js`) at the same difficulty band. They are distinct
> bugs (three different guards) and give within-site replication, but they are NOT independent
> difficulty samples. If the suite wants breadth over replication, keep one or two, not all
> three.

### P5 — `src/ingest.js:278` — the crypto-remind dedup skip

- **Edit:** `if (signed.has(h)) continue;` → `if (false) continue;` (stop skipping
  already-signed signers)
- **Contract (ingest.js:269–272, verbatim):** *"Skip signers who already signed (matched via
  the same salted hash the ledger records, so 'already signed' here matches the engine's own
  dedup key — one source of truth)."*
- **Failing tests (1), exit 1:**
  ```
  not ok - remind+: crypto — pings every signer that has not yet signed (kind:activation, reminder:true)
  ```
  File: `ingest-initiator-command`. Does not name `ingest`.
- **Predicted difficulty: medium.** The failing title matches the symptom ("has not yet
  signed"); the culprit is the one skip line in the crypto branch of the remind handler.
  Navigation is real (ingest.js is 800+ lines) but the title and the loop of `deliver` calls
  narrow it.

### P6 — `src/completion.js:223` — the manualCompletion auto-lock guard  ★ hard

- **Edit:** `const allDone = !event.manualCompletion && steps.every((s) => s.status === 'complete');`
  → `const allDone = steps.every((s) => s.status === 'complete');`
- **Contract (completion.js:221–222, verbatim):** *"manualCompletion: steps still complete +
  commit, but the consumer owns the event's finalisation (via completeEvent) — the engine never
  auto-locks."* (also `types.js:102`)
- **Failing tests (1), exit 1:**
  ```
  not ok - G3a: manualCompletion suppresses workflow auto-complete too
  ```
  File: `ergonomics`. **`completion.test.js` (the unit test) stays GREEN** — the auto-lock
  branch escapes unit coverage entirely and is caught only by an integration test. This is the
  textbook escaped bug: the unit test that "should" have caught it doesn't.
- **Predicted difficulty: medium–hard.** Symptom (integration `ergonomics`) is far from the
  edit (pure engine); the unit test is blind. Softening factor: the literal token
  `manualCompletion` grep-bridges the symptom straight to the culprit line, so a worker that
  searches the keyword lands on it. Predict harder than P2–P5, easier than P7.

### P7 — `src/ingest.js:533` — the open-crypto signer-match wiring  ★ hardest

- **Edit:** `const signerMatch = !!event.open || signers.includes(sender);` →
  `const signerMatch = signers.includes(sender);` (drop the open-event allowance)
- **Contract (types.js:100, verbatim):** *"`open` — Crypto only — any sender may sign."*
  (reinforced at create.js:176–177: *"Open crypto events have no roster — the initiator
  distributes the attest+ link themselves."*)
- **Failing tests (2), exit 1:**
  ```
  not ok - e2e crypto: open threshold-2 sign-off counts distinct verified signers, rejects self/dupe, locks
  not ok - reopenEvent: retracts a signature, flips complete→open, appends an event_reopen commit
  ```
  Files: `e2e`, `reopen`. Neither names `ingest`.
- **Predicted difficulty: hard (multi-attempt).** The two-step trap: the symptom is "crypto
  sign-offs don't count," and counting is the *engine's* job (`crypto.js`) — but `crypto.js` is
  correct. The bug is that the orchestrator (`ingest.js`) precomputes the `signer_match` boolean
  the pure engine consumes, and hands it `false`. The obvious fix site (the counting engine)
  will not fix the close; the worker must trace the boolean back into the wiring. This is the
  `notify`-style misdirection (F27's "fix the call, not the guard") one layer deeper.

---

## Rejected candidates (kept legible)

| id | site | edit | why rejected |
|---|---|---|---|
| P-proof-idem | `proof-anchor.js:110` | drop `&& !cur.ots_proof_anchored_notified_at` (backfill re-send guard) | **greens the suite** — the OTS anchor path is not exercised by the close (no `ots` binary in tests). Violates the stated contract (proof-anchor.js:105–106 "a pure backfill run … MUST NOT re-send") but no test can see it. Coverage hole, not a plant. |
| P-proof-newly | `proof-anchor.js:107` | drop `&& newlyAnchored > 0` | **greens the suite** — same untested path. |
| P-ingest-remind-archived | `ingest.js:250` | drop `\|\| event.archived_at` from the remind guard | **greens the suite** — no test reminds an archived event. |
| P-mutex | `event-mutex.js:34` | neuter the `await prev` write-chaining | **greens the suite** — no concurrency test; the serialization is invisible to the close. |
| P-comp-trustrank | `completion.js:68` | `return i < 0 ? Infinity : i;` → `return i;` (unknown trust ranks strongest) | **named by the culprit's own unit test** — `completion.test.js` "meetsTrust: strict ordering against step.minTrust" fails. Covered by same-named unit test → not an escaped bug (rule b). |
| P-comp-meetstrust | `completion.js:93` | `<=` → `<` (strict trust comparator) | **explodes (17 fails > 15) AND named by the unit test** (11 of the 17 are `completion.test.js`). Double-disqualified. |
| P-comp-archived | `completion.js:173` | neuter the archived-event count gate | **named by the culprit's own unit test** — `completion.test.js` "event gates: not activated / archived / already complete" fails (rule b). |

---

## What the patient can and cannot yield (honest limits)

- **Easy/medium plants are plentiful and cluster in one feature.** The usable sites
  (`notify`, `create`, `ingest`-remind) are all in the **notification/trigger** area, reached
  through behaviour-named integration tests. The gradient is real but the *theme* repeats — a
  suite built only from P1–P5 tests "find the notification wiring bug" five times.
- **Genuinely hard plants are scarce: two.** P6 (unit-test-blind auto-lock) and P7
  (engine-misdirection) are the only sites found where the symptom is far from the edit AND the
  obvious fix site is wrong. P7 is the strongest — the layered "pure engine consumes a
  precomputed boolean from the orchestrator" seam is what makes the obvious fix fail. mailproof
  has exactly one such seam of note (the crypto/workflow count wiring in `ingest.js`).
- **Most plants give a THIN gradient — one failing test name.** Five of seven red a single
  test. Since the loop's navigation fuel is the `not ok` lines in the gap (F28/F29), a
  one-failing-test plant hands the worker one clue. P1 (5) and P7 (2) give richer gradients.
- **Two whole subsystems are untested by the close** (OTS proof-anchor, cross-process mutex), so
  they cannot host plants — and that is a genuine gap in the patient's own suite, logged here.

**If the suite needs more HARD plants than mailproof yields (2), a second patient repo should
have:** (a) a **layered architecture** where pure logic modules consume precomputed
values/booleans from an orchestrator, so "fix it at the symptom (the pure module)" is
systematically wrong — this is the P7 pattern and the single richest source of loop-hard bugs;
(b) a **high integration-to-unit ratio** so real branches escape unit coverage (the P6 pattern);
(c) **large files** (600+ lines) so "find the right file/line" is a real skill, not a glance;
(d) tests that **assert behaviour without naming source files**. mailproof has all four but the
supply of (a) is small.

---

## Decision rules — FROZEN 2026-07-15 (hamr: "freeze if you are satisfied"; before any loop number exists for P2–P7)

**Composition: all 7 plants run.** P2/P3/P4 are ONE replication cell (same file, same failing
test file, same predicted band) — analysis treats them as one difficulty sample with n=3, never
as three independent samples. Battery order is fixed: **P1 first** (known-green anchor — it
smoke-tests the reset→plant→run cycle before unknowns spend money), then P2 → P3 → P4 → P5 →
P6 → P7.

**Per-run configuration (identical for every plant):** spec `jobs/mailproof-fix.json` @
`8fc3d42a…bdc53` (unchanged — one human signature covers the battery), $3 cap, 3 attempts,
`claude-sonnet-5`, `gapKeep: "^not ok"`. Patient reset to the frozen commit + the one plant
before each run; spine and gate audit archived per plant before reset.

**Recorded per run:** outcome · attempts-to-green · writes (from gate audit) · culprit-file-read
(from gate audit) · rounds · spend.

**Tier rules (frozen — the labels the runs mint):**
- greens on attempt 1 → **easy tier**;
- greens on attempt 2–3 → **loop tier** — first live evidence that verdict feedback recovers a
  failed swing (the thesis, still unproven);
- cap-red after 3 attempts → **ratchet-grade** — Layer R's proving ground.

**Reading rules (frozen):**
- n=1 per plant: pass-1 tier labels are PROVISIONAL until replicated; no green-rate claims from
  pass 1, period.
- A cap-red is autopsied on the spine (reads, writes, gap contents) BEFORE it is labeled
  ratchet-grade: an infra defect (F28's class) invalidates the run — fix, log the finding, rerun
  the plant. The F28 precedent binds: instrument first, then believe.
- A plant whose live failure set differs from the one recorded above is a STOP (investigate
  drift before spending more), not a shrug.
- Plants get discarded; rules never get loosened. Pass-1 total spend hard-stops at $10.

---

## Pass 2 — pre-registration (FROZEN 2026-07-15, before any pass-2 number exists)

**Operator decisions (hamr, in-session):** the `edit` verb IS granted; all 7 plants run in the
frozen order. New spec version signed for this pass:

- **Spec:** `jobs/mailproof-fix.json` with `tools: ["read","grep","write","edit","recall","get"]`
  @ `0b707b77f7bde479df2c7d306973f8d2a8175234ce766fe4c14a631ebc7b9a06`. The pass-1 hash
  (`8fc3d42a…bdc53`) is retired — menu widening is a new spec version, never a reinterpretation.

**What changed since pass 1 (named, both):** (1) F32 worker-crash routing is live — a close
crash after gate-audited worker writes routes as non-terminal `worker-crash` and the gap names
the crash detail + files written; (2) the `edit` verb is granted (with its `EDIT_STRATEGY`
persona line). `maxTokens: 32000` (F30) also now covers the whole pass, where pass 1's first
rows ran under the 4096 default. **Attribution honesty:** pass 2 differs from pass 1 by more
than one variable — no pass-1↔pass-2 delta may be attributed to F32 alone or to `edit` alone.
Within-pass-2 reads (tier labels, conversion) are unaffected.

**Unchanged (identical to pass 1):** $3/plant shell cap, 3 attempts, `claude-sonnet-5`,
`gapKeep: "^not ok"`, frozen order P1→P7, reset→plant→drift-check cycle, archive per plant,
$10 pass hard-stop, tier rules, autopsy-before-label, drift = STOP, rules never loosened.

**Exclusions (frozen rule applied):** the P3 F32 validation run (runid `mrmau676`, $0.7665) is
NOT a pass-2 row — a validation rerun of a fix never folds into pass evidence. P7's pass-1
attempt-2 provider blip means its pass-2 run is its first clean full read.

**Recorded per run (pass-1 fields plus the pre-registered F32 split):**
- outcome · attempts-to-green · writes/edits (gate audit) · culprit-file-read · rounds · spend;
- **delivery:** every `worker-crash` gap delivered (count + the files it named);
- **conversion:** for each delivered `worker-crash` gap, whether the NEXT attempt's gate-audited
  write/edit actions touch a file the gap named (revert or re-fix). Delivery and conversion are
  read as separate axes; neither implies the other (F32's live caveat).

**Close-exploitation audit (RSI SURE #1, standing):** every GREEN is audited on the gate audit +
spine before its tier label counts — did the worker touch tests, game the judged floor, or green
by any path other than fixing `src/`? The audit itself is recorded per green; finding nothing is
noted, not celebrated.
