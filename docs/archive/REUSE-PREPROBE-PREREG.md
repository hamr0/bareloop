# REUSE pre-probe — pre-registration (FROZEN before any number)

**Date frozen:** 2026-08-01 · **Rung:** Layer 3 (the REUSE rung), opening gate ·
**Status:** pre-registered, NOT yet run · **Owner:** hamr sign-off before firing.

**Design record:** `docs/product/2026-08-01-layer-3-reuse-design.md` (D9 authorises exactly
this probe). **Not a continuation of** `N3-PREPROBE-PREREG.md` — that document is the
F51–F55 TESTGEN lineage programme and is CLOSED; it authorises nothing here, and nothing here
reopens it.

Freeze discipline: pre-register patients, arms, reading rules and decision rules in a COMMIT
before any number exists; frozen rules are never loosened post-hoc.

---

## 1. The question

**Does having a same-shape bridge in hand change what gets drafted at all?**

This is v1.21 requirement (b)'s gate: *identical plans with and without lineage in hand kills
the arm*. It runs BEFORE any inheritance machinery is built, because CL-BENCH's read is that
memory systems LOSE to plain in-context learning once base capability is subtracted — the
cheap instrument runs before the expensive build.

**Default prediction, registered so a null is actionable rather than disappointing:**

- **Readable lineage (arm B): NO lift.** F51–F55 measured that lineage transmits (F51 winShape
  3.00 → 4.00) while the cold planner was already at ceiling — and F60 measured the cold
  scout-on planner drafts real, well-aimed work unaided.
- **The mechanical-start arm (C) is where a win is expected**, and it is a different KIND of
  win: **drafting cost saved, structure kept** — not better reasoning.

## 2. Design

**Cross-patient TYPES reuse — the product case, per R2** ("same job" = same SHAPE, never same
instance).

- **Source bridge:** the newest aurora bridge,
  `bareloop-patients/aurora-u-bareloop/bridge-aurora-u-spawner-types-ms7flkok.json`
  (green 2026-07-30, 2 steps, `{job, specHash, runid, greenAt, plan}`).
- **Target job:** `jobs/litectx-u-types.json`.
- **Why this pair is R2-legal:** both specs declare the same four close stages —
  `changed-from-seed` → `typecheck` → `suite-green` → `no-suppressions` — over DIFFERENT
  patients. Same shape, different instance. A bridge that only worked because the patient was
  the same would be a lookup table, and the memorization audit kills it.

**Primary direction:** draft a plan for `litectx-u-types` with the aurora bridge in hand.

### Arms (frozen)

| arm | what the drafter gets |
|---|---|
| **A — cold** | the spec only (today's behaviour; the control) |
| **B — readable lineage** | the spec + the bridge plan as **reading material**, not as the draft |
| **C — mechanical start** | the bridge plan handed as the **starting draft to tweak** (D4's case) |

- **n = 3 drafts per arm.** Plan-family variance is real: two cold greens of the IDENTICAL job
  produced two DIFFERENT working plans (PRD v1.34), so n=1 per arm cannot read "identical vs
  different" — within-arm variance is the yardstick, and it must be measured, not assumed.
- **Drafts ONLY.** No execution, no worker, no close, no writes to any patient. A single model
  call per sample.
- **Model:** sonnet — the drafter tier floor (PRD v1.36), and runs on existing scaffolding use
  sonnet. Same model across all arms.
- **Scout: ON in all arms** (D8), with **identical scout inputs per arm** — the scout is
  load-bearing cold (F60) and turning it off would change two variables at once.

## 3. Frozen read axes

Measured on the drafted plan JSON:

1. **step count**;
2. **verbs used** (the tools each step declares);
3. **targets / scopes named**;
4. **real-file references** — **F60's own metric**, i.e. the same construct the treatment is
   judged by, never a prose shadow of it.

## 4. Frozen read RULE

**Arm A's within-arm spread on those axes is the yardstick.**

- **B "differs" only if the between-arm difference exceeds A's own within-arm spread.** A
  difference smaller than the control's own noise is not a difference.
- **For C, three reads:**
  - does the loaded bridge **pass the D2 mechanical gate** against the cross-patient job
    (verdict type, close-stage kinds, tools within the signed menu)?
  - **fraction of bridge steps kept / modified / dropped**;
  - **drafting cost vs A**.

## 5. Frozen DISCARD rules

1. **B ≈ A** → the **readable-lineage arm is DEAD**; only the mechanical-start path gets built.
2. **C redrafts from scratch** (discards the bridge) → the **bridge-as-starting-draft premise
   fails at draft tier**; recorded, and the decision goes to hamr.
3. **C passes the gate and keeps a majority of bridge structure** → the **mechanical path
   lives**.

## 6. Casualty rules

- **Provider-red rows are casualties, never evidence.** They are replaced, not counted.
- **Truncated responses** (`stop == max_tokens`, or empty text) are **flagged as a distinct
  field and EXCLUDED from the denominator** — a truncation is never counted as a miss.

## 7. Budget (frozen, cap-not-estimate)

- **$1.00 HARD cap, total.** Sizing: ~9 drafts × ~$0.06/draft, the rate MEASURED at F60
  ($1.04 for 18 sonnet drafts).
- **Cap-not-estimate.** If the cap binds before 9 readable drafts land, **the probe STOPS and
  the stop is the result** — a budget that binds mid-work produces casualties, not evidence,
  and widening a cap to manufacture a readable row is the fit-to-pass move this repo forbids.

## 8. What this probe CANNOT read (stated plainly)

- **Anything about execution outcomes.** It reads drafts. Whether a reused plan greens,
  self-heals, costs less end-to-end, or fails at a stage is entirely outside it. That is the
  second instrument (D9), fired only if the drafts differ, and only on hamr's word.
- **Anything about genres other than TYPES.** Both patients are `tsc --strict` migrations. The
  qualifier travels with every sentence of the result: *…on TYPES*. F51–F55's whole programme
  was invalidated as a general claim by exactly this (nine of ten specs were TESTGEN), and the
  same trap is live here.
- **Scout-shrink.** The scout is ON in every arm by design (D8); this probe says nothing about
  whether a reused bridge could scout less.

---

## Addendum — 2026-08-01, PRE-FIRE (implementation deviations + one read corrected for principle — BEFORE any paid number exists)

Building the harness (`scripts/reuse-preprobe.mjs`) found **four places the frozen text above
cannot be implemented literally against the REAL instrument**, plus **one read that is
degenerate by construction**. Under the design record's amendment discipline
(`docs/product/2026-08-01-layer-3-reuse-design.md` §7) this is the allowed direction:
**correction for principle BEFORE measurement.** No paid draft has run; no number from this
probe exists; **nothing here loosens a rule to fit a number.** Every $0 fact recorded below was
established by construction or by the validator — not by the probe's paid measurement.

### 1. §2 "no close" cannot be honoured literally — the close precheck/preflight RUN

The shipped scout is reachable only through `runPlan`, which runs the **close PRECHECK** and the
**check PREFLIGHT** before the scout exists. Both are **$0 and deterministic** (a `git diff`,
then `tsc` + the suite). The only alternative — hand-writing a scout for the probe — is a
**forked instrument**, which the standing real-instrument rule forbids more strongly than this
deviation costs.

**Recorded as executed:** the close precheck and check preflight RUN in every sample; **no
graded close ever does.**

### 2. §2 "no writes to any patient" narrowed to "no writes to any patient SOURCE file"

The shipped scout writes **the arbiter's own books** — `gate-audit.jsonl` and the `.litectx`
store. It cannot be made to write nothing.

The scout's grant **excludes every write-class verb** and its **fence is empty**, so no source
file can be touched. The harness relocates the gate audit beside the results, removes any
`.litectx` store it created, and **ASSERTS the patient's `HEAD` and `git status --porcelain`
are byte-identical before and after** — refusing to write results otherwise.

### 3. §7's sizing did not fund the scout — and the materials block quotes the probe's balance

The scout comes out of **the same $1.00 total cap** (F45's attempt-plus-close lesson applied to
a probe: the cap funds everything, or the row is unreadable). **The cap may therefore bind
earlier than "~9 × $0.06" implies.** The frozen behaviour is unchanged — **the stop is the
result.**

Related, and stated so it travels with every sentence of the read: the materials block quotes
**the probe's ~$1 balance, not the job's $10.** One function feeds both the scout's gate budget
and the drafter's balance line, and **bounding the scout inside the cap wins over prompt
fidelity.** The figure is **CONSTANT across all nine samples**, so it cannot bias a within-arm
or between-arm contrast — but these are **plans drafted against a ~$1 balance**, and every
result sentence carries that.

### 4. New stated precondition: the patient must be CLEAN at its frozen seed (96813a43bbcb)

A **half-solved** tree is not what a real scout surveys. A **fully-solved** tree makes the close
precheck return satisfied → `already-green` → **no scout at all**.

The harness **refuses to run otherwise** and prints the reset command. **The reset is
operator-performed, never harness-performed.**

### 5. Arm C's strict "fraction of bridge steps kept" — corrected for principle: a guaranteed zero by construction

**A read that cannot fail is not a read.** The bridge's targets are **aurora** paths; this job's
fence is `src/**` — so a **VALID** draft can **never** keep a bridge target verbatim, and the
strict target-based fraction is **zero by construction**, whatever the drafter does.

Two **$0 deterministic** facts, established pre-fire:

- **(a)** The bridge **FAILS the D2 mechanical gate** against `litectx-u-types` with **6 reds**:
  *invalid-value* on both scope fields, and *scope-escape* on both targets and both
  `tree-changed` exit scopes. So **discard rule 3's "passes the gate" clause is answered FALSE
  by construction** for any cross-patient bridge carrying instance paths. **That is itself a
  finding the machinery must absorb:** a loaded bridge is a **starting draft** precisely BECAUSE
  the gate reds its instance paths (D4).
- **(b)** Therefore the **PRIMARY** keep/modify/drop read is the **STRUCTURAL** one — ordinal
  tools-set + exit-signature match. The strict target-based read is **retained and recorded as a
  control.**

**Discard rule 3 re-anchors accordingly:** the **mechanical path LIVES** if C's drafts are
**legal** (pass `validatePlan` for THIS job) **and** keep a **majority of bridge structure on
the STRUCTURAL read**. **Rules 1 and 2 are untouched.**

### Implementation clarification — truncation is decided FIRST

bare-agent surfaces an **API truncation** through the **same error field** as a transport
failure (`'truncated:max_tokens'`). The harness therefore **decides truncation FIRST**: a
truncated row is **kept-and-excluded per §6**, **never replaced as a casualty.**

---

The harness (`scripts/reuse-preprobe.mjs`) computes and stores every §3/§4/§5 input but **prints
no verdict language** — the read against the discard rules remains the operator's.

---

## Addendum — 2026-08-01, POST-FIRE READ (the frozen rules applied; verdict per rule, with every qualifier)

Fired 2026-08-01 under the frozen design above (as amended pre-fire, before any number
existed). Primary artifact: `docs/03-logs/experiments/reuse-preprobe-ms9jpjue.json` — the harness
prints no verdict language; the read below is the operator's, against §5's frozen rules.

**Fire facts:** **9/9 readable rows** — **0 truncated**, **0 casualties**, so §6 never fired
and the denominator is the full pre-registered one. **Total spend $0.5107 of the $1.00 hard
cap**; the cap never bound, so §7's "the stop is the result" clause is not in play.

**Capture leg ($0.1934 of the total).** The shipped `runPlan` drove the **close precheck**
(`needs_revision` on `changed-from-seed` — the clean-seed precondition of pre-fire §4, working
as stated), the **check preflight** over the three offered stages, and the **scout**
(**summary 3761 bytes**, non-empty). At the drafter call the harness's **sentinel** aborted and
captured the real prompt (7138 chars). It is recorded as the harness's own
**`probe-capture-stop`**; the escalation router files the run outcome as **`provider-red`** —
that is **the harness's sentinel, not a transport casualty**, and it is not a row. **The one
captured prompt fed all nine drafts**, so the scout input is byte-identical across arms as §2
required.

### Rows (from the JSON; costs are the drafter call only)

| arm | i | costUsd | steps | declaredRounds | distinctVerbs | realRefs | guessedRefs | valid |
|---|---|---|---|---|---|---|---|---|
| A | 1 | $0.0469 | 1 | 30 | 3 | 5 | 20 | yes |
| A | 2 | $0.0271 | 1 | 30 | 3 | 4 | 7 | yes |
| A | 3 | $0.0416 | 1 | 35 | 3 | 21 | 21 | yes |
| B | 1 | $0.0366 | 1 | 30 | 3 | 5 | 19 | yes |
| B | 2 | $0.0224 | 1 | 32 | 3 | 4 | 20 | yes |
| B | 3 | $0.0288 | 1 | 30 | 3 | 4 | 22 | yes |
| C | 1 | $0.0554 | 2 | 45 | 3 | 6 | 21 | yes |
| C | 2 | $0.0295 | 2 | 35 | 3 | 4 | 25 | yes |
| C | 3 | $0.0291 | 2 | 50 | 3 | 5 | 22 | yes |

Nine drafts = $0.3174; plus the capture leg's $0.1934 = the $0.5107 recorded.

### Discard rule 1 — **FIRES: B ≈ A, the readable-lineage arm is DEAD**

Every frozen axis's B-vs-A delta sits **inside arm A's own within-arm spread** (delta | A's
spread):

- **stepCount** 0 | 0 · **declaredRounds** −1 | 5 · **distinctVerbs** 0 | 0
- **realFileRefs** −5.67 | 17 · **guessedFileRefs** +4.33 | 14
- **costUsd** −$0.009 | $0.020
- **verbUnion** between-max 0 | within-max 0 · **targets** between-max 2 | within-max 2 ·
  **checkNames** 0 | 0

Per §4, *a difference smaller than the control's own noise is not a difference* — no axis
clears it. This is **exactly the pre-registered default prediction** (§1; CL-BENCH; F51–F55):
**reading material moved nothing.** Only the mechanical-start path gets built.

### Discard rule 3 (as re-anchored pre-fire) — **FIRES: the mechanical path LIVES**

- **All three C drafts are legal** — they pass the shipped `validatePlan` for THIS job
  (`validatorOk: true`, zero reds), which is the re-anchored legality clause.
- **All three keep 2/2 bridge steps on the STRUCTURAL read** (ordinal tools-set + exit
  signature) — a majority, twice over.
- The **strict** target-based read is **0 kept / 2 modified / 0 dropped in all three** — the
  pre-fire addendum's *guaranteed zero by construction*, landing exactly as predicted and
  recorded here as **the control it now is**, not as a finding.

**Structure genuinely transmitted:** every C draft is a **2-step** plan following the bridge's
shape, while **all six A/B drafts are 1-step** plans. That is the only axis on which any arm
moved.

### One pre-registered expectation **REFUTED**, stated plainly

§1 predicted C's win would be **"drafting cost saved, structure kept."** The cost half **did
not materialize**: mean drafting cost **C $0.0380 vs A $0.0385** — flat, and the delta
(−$0.0006) is two orders inside A's own spread. What C bought **at draft tier** is
**STRUCTURE CARRY-OVER, not cheaper drafting.** Whether the carried structure is worth
anything is an **execution** question, outside this probe (§8).

### Honesty notes

- **Arm A's within-arm spread is WIDE.** Its realFileRefs values are **5 / 4 / 21** (spread
  17) — one draft enumerated the whole `src/` tree, two did not. Plan-family variance was
  pre-registered as the reason for n=3 (§2), but a **wide yardstick makes "B ≈ A" easier to
  conclude**. The null's credibility rests on it ALSO being **the pre-registered default
  prediction**, not a post-hoc reading of a noisy control.
- **n = 3 per arm.** Every sentence above carries: **…on TYPES, at draft tier only, with the
  materials block quoting a ~$1 balance** (pre-fire §3).
- **1-step (A/B) vs 2-step (C): which is BETTER is not readable at draft tier.** The second
  instrument (limited-budget execution, D9) exists for exactly that, and it **fires only on
  hamr's word.**

Per the design record §5, the result selects the build shape: the machinery proceeds
**MECHANICAL-START ONLY** — registry, gate, listing/selection, draft-time tweak path,
envelope, status/history — **with no readable-lineage feature.** The execution probe go/no-go
is hamr's.

---

## Addendum — 2026-08-01, EXECUTION PROBE PREREG (the second instrument — FROZEN before firing)

**GO on hamr's word, verbatim, 2026-08-01 in-turn: *"agreed to all cont"*** — D9's second
instrument is authorized, and it fires **BEFORE the machinery build** (design record §5, step
2→3). Frozen here **before any number exists**; frozen rules are never loosened post-hoc.

### 1. The question

**Does mechanical-start — the aurora bridge handed as the STARTING DRAFT — carry a REAL run?**
And **how does it compare on cost / time / outcome to the cold baseline family?**

The draft-tier read is closed: structure transmits, cost did not move (post-fire addendum).
**Whether the carried structure is worth anything is an EXECUTION question**, and §8 named it
as outside the draft probe. This is that instrument.

### 2. Instrument (frozen)

**ONE full run** of `jobs/litectx-u-types.json`:

- **same spec, same signed hash** — nothing about the job is edited for the probe;
- **the spec's own envelope — $10 budget, 45 min wall** — the same one the cold baselines ran
  under (**comparability requires the identical envelope**, so neither number moves; an
  earlier draft of this addendum misquoted the envelope as $5/30min from the aurora-u spec —
  corrected here BEFORE firing, the governing rule being "same spec, same signed hash",
  which never changed);
- **patient:** `litectx-u`, **reset clean to seed `96813a43bbcb`** (the same clean-seed
  precondition as pre-fire §4 — a half-solved tree is not what a real run faces, and a solved
  tree returns `already-green`). **The reset is operator-performed, never harness-performed.**
- **through the REAL `runPlan` flow**, **scout ON** (D8);
- **the injection:** the harness appends the same **mechanical-start block** (the arm-C framing
  from this pre-probe) **plus the bridge plan** to the captured **DRAFT-PLAN** prompt, and
  **otherwise touches nothing**.

**The spec is unchanged; the injection is probe-harness behaviour; the arbiter is untouched.**

### 3. Cold baseline family — already on record, NOT re-run

Two cold greens of this **identical** job:

- **U run 1** — **$2.21 / 8.9 min**;
- **U run 3** — **$2.47**, the **outer fix loop fired once**.

**Both predate this probe. Nothing about them may be re-measured or re-graded.**

### 4. PRIMARY read — binary, the kill question

**Does the bridge-start run GREEN within the envelope?**

- **GREEN** = the carried structure **survives contact with a different patient**; the
  mechanical path **clears its execution kill-gate**.
- **RED** = **recorded**, **the bridge is untouched per R1** (a red never edits the box), and
  **the decision goes to hamr**.

### 5. SECONDARY reads — recorded, explicitly NOT mintable as lift claims at n=1

Recorded: **cost vs $2.21 / $2.47**; **wall time vs 8.9 min**; **rounds**; **replan fired or
not**; **which stages red-cycled**.

**n=1 against n=2 is an anecdote in BOTH directions.** The numbers are recorded **with that
qualifier attached to every sentence**. **No "reuse is cheaper / faster" claim mints from this
probe, regardless of direction.**

### 6. Casualty rules (frozen)

- **provider-red = casualty.** **One relaunch permitted**, then **stop-and-report**.
- **wall-halt or cap-halt = the stop IS the result** (W-2: keep the grade already minted,
  report decision-ready).
- **truncation routing per the shipped loop.**
- The run's **spend reports per F6** — `spendComplete` travels with `spentUsd`; an unknown is
  recorded unknown, never rendered as 0.

### 7. What this probe CANNOT read (stated plainly)

**Success or failure of THIS PROBE is NOT success or failure of the RUNG.** A red here is a
finding about **THIS bridge**, on **THIS patient**, at **n=1**, on **TYPES**, in **one
direction** — and **every result sentence carries that qualifier**.

---

## Addendum — 2026-08-01, EXECUTION PROBE POST-FIRE READ (GREEN, audited; one baseline attribution corrected)

Fired 2026-08-01 under the frozen prereg above. Primary artifacts:
`docs/03-logs/experiments/reuse-exec-probe-msacobr7.json` (the green run) and
`reuse-exec-probe-msac6sre.json` (the provider-red casualty), plus the spines
`reuse-exec-{ms9lsxjp,ms9lwtuf,msac6sre,msacobr7}.jsonl` beside the patient. The harness
prints no verdict language; the read below is the operator's.

### Four launches, honestly ledgered

| # | runid | end | spend | what happened |
|---|---|---|---|---|
| 1 | `ms9lsxjp` | operator shell-timeout kill | **$0.1110** | died mid-scout (8 scout rounds, `scout-truncated {bytes:0}`), no draft, no plan — **casualty** |
| 2 | `ms9lwtuf` | machine idle-suspend, **00:14:12Z** | **$1.6308** | 12.2 healthy minutes then frozen — **casualty** |
| 3 | `msac6sre` | provider-red at **12.0 min** | **≥$1.9499** (`spendComplete:false`) | 64 rounds, 2-step plan, step 1 green again — **casualty** |
| 4 | `msacobr7` | **GREEN** | **$4.7129** of $10 | the permitted relaunch, under a sleep inhibitor |

**Launch 2's autopsy, in full, because the first reading of it was WRONG.** The suspend
request lands at 00:14:12Z (journal `systemd-logind: The system will suspend now!`,
02:14:12 local) — **six seconds after the last spine event** (`worker-round`, seq 108,
00:14:06.074Z). The trajectory to that point was healthy, not stuck: a 2-step plan accepted,
**step 1 green in 2m21s** (one iteration), step 2 walking its typecheck gap **61 → 20 strict
errors** across two iterations, 68 rounds, $1.6308. The initially-reported *"87 awake minutes,
the stall fuse failed"* reading was **manufactured by a timezone confound** — the journal
prints local (UTC+2), the spine prints UTC — and is **WITHDRAWN**. Every guard, the F67
**outside** watchdog included, was frozen in the same `user.slice`; there is **no product
defect in this launch**. Full mechanism in **F72**.

### The green row (`msacobr7`)

- **$4.7129 of $10**, `spendComplete:true`; **31.6 min of 45** (1,898,988 ms); **139 rounds**.
- **2-step, bridge-shaped plan accepted** on the first draft (`plan-validate draft-1`, zero
  reds). **Injection engaged: 1 injected · 0 passed through**, +3,067 chars onto a 10,283-char
  DRAFT-PLAN prompt.
- **NO replan** (`replanned:false`).
- **Step 1** green in one iteration (8m29s). **Step 2 converged in 3 iterations** — `typecheck`
  `needs_revision` ×2 (**56 errors → 7 errors**) → **satisfied**.
- **The OUTER close then caught a red the step exits could not see**: `no-suppressions`,
  1 suppression added in `src/tsalias.js`. **The fix loop fired and corrected it → green.**
  Recorded honestly: the fix loop took **two** iterations, and its first made things worse
  (1 → 4 suppressions) before the second cleared **all four stages** —
  `changed-from-seed` · `typecheck` · `suite-green` · `no-suppressions`, all satisfied.
- 47 allowed writes across **10 distinct files**; 0 spine leaks.

### Green AUDITED, not asserted

All four close stages were **re-run independently on the as-left tree by the operator after
the run** — `changed-from-seed`, `typecheck`, `suite-green`, `no-suppressions` — **all exit
0**. The winning diff is preserved as `reuse-exec-msacobr7.patch` beside the spine; it is
**byte-identical to the patient's current `git diff`** (10 files, +217/−44, HEAD still at the
frozen seed `96813a4`), so the audited artifact is the one on record.

**Bridges asserted unchanged (R1).** Both result files record `bridgeGuard: 5 hashed, 0
changed`. Launches 1 and 2 died before writing a result file, so their exit comparison never
ran — carried independently by the five bridge files' own mtimes, all of which predate
2026-07-30.

### PRIMARY READ (frozen §4): **GREEN within the envelope — the mechanical path clears its execution kill-gate**

Carried structure survived contact with a different patient: **4 of 4 arm-C drafts across both
probes kept the bridge's 2-step shape** (pre-probe C1–C3, plus this run), and this one carried
a real job to an **audited** green. *(The two casualty launches also drafted 2-step plans —
6 of 6 counting them — but a casualty is never evidence, so they are not in the count.)*

### CORRECTION — the operator's own error, in §3 of the execution prereg

§3 above calls the **$2.21 / 8.9 min** and **$2.47** baselines *"two cold greens of this
identical job."* **That is FALSE.** Against the archive they are **aurora-u** greens:
`u-ms2c0ls7` ($2.2072, 8.9 min) and `u-ms2ddxjc` ($2.4691, 12.6 min), job
`aurora-u-spawner-types`, spec hash `ab3cfd97…`, under a **$5 / 30 min** envelope — same
SHAPE, **different patient, and a different envelope**. Every secondary cost/time comparison
in the result files is therefore a **cross-patient** reference and **nothing mints in either
direction**.

**Two further claims in that correction do NOT survive the archive, and the archive wins:**

1. *"litectx-u has NO cold green baseline"* — **refuted.** `litectx-u-types` has **two prior
   cold greens**: `u-ms3wawub` (2026-07-28, green, **$5.7655**, 37.0 min, 3-step plan, spec
   hash `037fa937…`) and `u-ms5uxhej` (2026-07-29, green, **$4.2942**, 23.9 min, 3-step plan,
   spec hash **`25d8c5ee…` — the identical signed hash this probe ran under**). Both minted
   bridges, which is why two `bridge-litectx-u-types-*.json` files exist. The two
   transport-class deaths are real and remain casualties (`u-ms3197n8` provider-red $3.2264
   `spendComplete:false`; `u-ms3jh76q` wall-halt $3.1923, both 2026-07-27), but they are not
   the whole record — the patient's fuller record also holds `u-ms4l5p6w` step-red,
   `u-ms57zr7c` step-red, `u-ms5a24tz` plan-red, `u-ms5aou4a` provider-red.
2. *"this green is also the first this patient has ever produced"* — **refuted**: it is the
   **third** green on `litectx-u-types`.

**What this changes, stated plainly.** A same-patient, same-signed-hash **cold** green
(`u-ms5uxhej`) exists, so the "no cold-vs-bridge contrast exists on this patient" clause is
**withdrawn as written**. What does not change is the frozen §5 rule: **n=1 against n=2 is an
anecdote in BOTH directions and no lift claim mints from this probe.** One recorded
observation, carrying that qualifier and no more: on this patient the two **cold** plans were
**3-step** while all three bridge-start drafts were **2-step**.

### Also corrected: the fix loop's firing count

This is the **third** recorded firing of the outer grader's fix loop, not the second — and the
**second** that converted to green. The full record: `u-ms2ddxjc` (aurora-u, 2026-07-26,
gapBytes 390 → green — the "$2.47 U run 3"), `u-ms3jh76q` (litectx-u, 2026-07-27, gapBytes
4,505, fired and the run then wall-halted), and this run (gapBytes 404 → green).

### Total probe spend

**$8.4046 across all four launches** ($0.1110 + $1.6308 + $1.9499 + $4.7129) — reported as a
**FLOOR** per F6: launch 3 carries `spendComplete:false`, so its abandoned call may already
have been billed. *(A fifth spine, `reuse-exec-msa5ab6s.jsonl`, exists from 09:04Z: aborted
during check-preflight with **zero worker rounds and $0.0000** spent. It is recorded here for
completeness and changes no total.)*

### Both instruments are now read (design record §5)

- **Draft tier** — rule 1: readable lineage **DEAD**; rule 3: the mechanical path **LIVES**.
- **Execution tier** — the kill-gate is **CLEARED** on an **audited** green.

The machinery build — **MECHANICAL-START ONLY** — is the next step, per hamr's standing
*"agreed to all cont"*.
