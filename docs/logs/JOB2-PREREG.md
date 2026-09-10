# Job #2 — pre-registration (FROZEN before calibration)

**This document is committed BEFORE any calibration number exists.** Its purpose is the
anti-fit-to-pass guard hamr asked for: the job, the plant, the close, the pass criterion, and the
calibration decision rules are all fixed here. After the calibration probe runs, **the bug is
thrown away if it fails a rule — the rules are not loosened to keep the bug.** (Job #1 was adopted
without this step and turned out to be undiscriminating; we found out seven arms and ~$15 later.)

Committed: 2026-07-15. Author picked the bug (hamr's call, #6), against the mechanical rule below —
not by taste.

---

## The patient

- **Repo:** `mailproof`, a **local copy** (not the working repo). Neither the loop nor I mutate the
  real `~/PycharmProjects/mailproof`.
- **Frozen commit:** `091027d4d88922a451752f08d019c81736b09873`.
- **Close:** `npm test` → `node --test` (TAP reporter). **317 tests, green at HEAD**, ~26s.
- **Why this repo and not semver/picomatch** (both screened and rejected):
  - `semver` enforces **100% branch coverage per source file from that file's OWN unit test**. So
    every possible single-line plant is caught by the culprit's same-named unit test, which *names
    the culprit*. There is no navigation problem left to measure — the close hands over the answer.
    That is the disqualifying property, and it is the rule below.
  - `picomatch` is 5 files / 2.4k loc — small enough to dump entirely into context, so "find the
    right file" is not a real skill and the information gradient would be fake.
  - `mailproof` has **18 unit tests that name-map to sources** but **21 integration tests named by
    behaviour** (`e2e`, `reopen`, `ingest-triggers`, `m7d-e2e`), and `src/notify.js` has **no test
    of its own, anywhere**. It is reached only by injection (`create.js` builds one notifier and
    threads `deliver` into `ingest()`, `sweep()`, `proof-anchor`). A plant there fails behaviour-
    named tests without any failing test naming the file.

### Patient-selection rule (mechanical, generalises past this repo)

A file is a legal plant site iff **(a)** no test file name-maps to it, and **(b)** the branch to be
broken is NOT covered by any same-named unit test — i.e. it is reached only through higher-level
(integration/e2e) tests. This is just the definition of a *real escaped bug*: if a unit test caught
it, it would never have shipped. It makes "the close must not name the culprit" a consequence, not
a contrivance.

---

## The plant

- **File:** `src/notify.js` (100 loc, no test of its own).
- **Edit:** delete one falsy-guard —
  ```
  if (custom) body = custom;   →   body = custom;
  ```
- **Contract it violates** — stated in that file's OWN header, verbatim:
  > "A hook throw or falsy return falls back to the neutral default; a hook can never break
  > delivery."
  With the guard gone, a `composeNotification` hook that returns `null`/`''`/`undefined` overwrites
  the neutral default body with a falsy value instead of falling back — the seam's stated invariant,
  broken.

### The close's output (what the worker actually sees) — verified deterministic over 3 runs

```
not ok 61 - remind+: workflow — initiator triggers reminder to every eligible step (ctx.reminder=true)
not ok 72 - triggers: composeNotification overrides the body; neutral default otherwise
not ok 74 - triggers: completion ctx exposes countedCommits + per-reply receipts from the ledger
not ok 75 - triggers: completion ctx for crypto carries the one signer receipt
not ok 84 - m7d e2e: every kernel occasion fires through one deliver(), keyed by kind
```

5 failing tests across **3 integration files** (`ingest-triggers`, `ingest-initiator-command`,
`m7d-e2e`), **one feature area** (notification delivery), **none naming `notify.js`**. Contrast
job #1: 3 failures in 3 *unrelated* features joined only by a hidden property (induction). Here the
path is forced: failing test → `ingest.js`/`create.js` wiring → `notify.js` → read the header
contract → restore the guard. Each hop is compelled by the code. **Elimination, not insight.**

---

## Pass criterion (for the real loop, once bare-agent delivers)

Green/not-green only (hamr's call, #4): the worker writes a fix and `npm test` exits 0. No partial
credit in the product. (The calibration below uses finer-grained proxies **only to decide whether
the job discriminates** — they are not the product's grading.)

---

## Calibration — two gates, run BEFORE adoption

No-harness API probes (one Anthropic call per sample; no bare-agent, no loop, no tools — same
method as the aim probe). Model temps default. **n=20 per cell.** Fixed graders, defined here.

### Probe A — NAV (the information gradient; the decisive discriminator vs job #1)
- **Context (BLIND):** close output + the 3 failing test files + `create.js` + `ingest.js` (the
  wiring). **`notify.js` is NOT shown.**
- **Ask:** `NEXT_FILE: <path>` — the one file to open next to find the root cause.
- **HIT** (grader, nomination line only): the path names `notify.js` / `createNotifier` / `deliver`.
- **Reads:** is the culprit *findable by elimination*? Job #1's equivalent was **0/140**.

### Probe B — FIX (does reading the file settle it? + the capability axis)
- **Context (OPEN):** close output + the 3 failing test files + **`notify.js` in full**.
- **Ask:** name the buggy file, the buggy line, and the corrected line, ending with
  `FILE: <path>` and `FIX: <corrected line of code>`.
- **HIT** (grader): `FILE` names `notify.js` **AND** `FIX` re-introduces a guard on `custom` —
  the corrected line contains `custom` together with a conditional (`if` / `?` / `||` / `??` /
  `&&`) and is NOT the bare `body = custom`. (A bare re-statement of the bug fails.)
- **Reads:** with the right file in hand, can the model produce the fix?

### Models
- Probe A: **sonnet** (primary) + **haiku** (capability on navigation).
- Probe B: **sonnet** + **haiku** (capability on fix).

Four cells: {A,B} × {haiku, sonnet}, n=20 each = 80 samples. Est. ≈ $2–3.

---

## Decision rules (FROZEN — the bug is discarded, never the rule)

Let `navS = NAV-sonnet`, `navH = NAV-haiku`, `fixS = FIX-sonnet`, `fixH = FIX-haiku` (all hit-rates).

1. **THROW AWAY (job #1 redux) if `navS == 0`.** Unreachable by any legitimate navigation = no
   gradient, exactly job #1's failure.
2. **THROW AWAY (too hard) if `fixS < 20%`.** If the strong model can't fix it *with the file in
   hand*, no workflow can.
3. **THROW AWAY (too easy) if `navH ≥ 90% AND fixH ≥ 90%`.** If the weak model both finds and fixes
   it unaided, there is no room for a better workflow to score higher.
4. **ADMIT as job #2 otherwise**, and record it as a *usable gradient* iff **`navS ≥ 30%` AND
   `fixS ≥ 50%`** (findable by elimination, and reading settles it). An admit that misses the
   gradient band is reported as marginal, not silently kept.

The headline test is rule 1 vs job #1: **any `navS` materially above 0 proves this job is
categorically different from job #1.** That is the thing job #1 could never do.

Honest limits recorded up front: these are one-shot no-harness proxies for a task the real loop
does with tools over many turns; they bound the *ceiling* (can the model do it at all, given ideal
retrieval), not the loop's actual behaviour. And the FIX grader accepts any guarded assignment, so
it credits a fix that is correct-in-shape without running it — a follow-up that actually applies the
model's line and re-runs the close is the stronger check, deferred to when the loop exists.

---

## RESULT (2026-07-15) — calibration run, frozen rules applied, DISCARD (see FINDINGS F27)

Ran exactly as pre-registered (EFFORT=low, n=15/cell, $3.02). **NAV sonnet 15/15, NAV haiku 15/15
(both 100%); FIX sonnet 0/15 (0%, CI [0,20.4%]), FIX haiku 2/15 (13.3%).**

Frozen rules applied WITHOUT amendment:
1. `navS==0`? **no** (100%) — job #2 is categorically ≠ job #1's 0/140; the aim axis is connected.
2. `fixS<20%`? **YES (0%) → THROW.**
3. `navH>=90% & fixH>=90%`? no (13.3%).

**==> DISCARD the specific plant as a one-shot-calibrated target.** The rule is NOT loosened — that
is the anti-fit-to-pass guard, honored. The DISCARD governs the 7-arm suite decision; it does not
speak to loop behaviour, which probe B explicitly did not measure. Every FIX miss is
right-file-wrong-fix (both tiers rewrite the `composeNotification(...)` call, not the falsy guard on
line 74) — F26's title-triage mechanism, on the fix axis. Full write-up: **FINDINGS F27.**

---

## LOOP-TEST RESULT (2026-07-15) — the different experiment, run; plant ADMITTED for the loop

The thesis probe F27 handed forward was run (twice — the first firing found and was invalidated
by F28, the gap bound eliding every `not ok` line; fixed via spec-owned `close.gapKeep`, then
re-fired). Result: **green on attempt 1, $0.2991** (vs blind-gap run: 3 attempts, 0 writes,
cap-red, $1.05). The one-shot DISCARD stands as written — and is now scoped precisely: it bounded
the *tool-free* ceiling. With tools + the failing-test names the plant is solvable in one bounded
attempt, so **job #2 is admitted as the loop benchmark on the loop's own evidence.** Full
write-up: FINDINGS **F28** (the gap defect) and **F29** (the paired contrast + what stays open:
the across-attempt ratchet never engaged; possible too-easy-for-arms concern deferred to suite
design).
