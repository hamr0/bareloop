# Forbidden-zone audit — spec (consumed from adaptlearn, V10 GAP)

> Carried over 2026-07-13 from adaptlearn `poc/forbidden-zone-prereg.md` (F25, release
> 0.11.7), upstream-ledger pattern: the SPEC travels (outcome catalog + arms + run record +
> the three build rules); the POC runner (`poc/fzone.mjs`) deliberately does not — bareloop
> builds its close chain against the RULES, not the probe. Consumption point: the N-ladder
> close work (answers PRD v1.10 item 2). The readout was GAP, so unlike V9 this carries
> **build obligations**, not just a checklist:
>
> 1. **`close-killed`** — a close that dies by signal rendered no judgment; it maps to its
>    own named escalation, never a red. The tell at the spawn seam: `status === null` with
>    no spawn error. (adaptlearn's shipped fall-through coerced this to `needs_revision`
>    and then RETRIED the broken arbiter to cap — the §5b violation, live.)
> 2. **`close-timeout`** — "didn't finish judging" gets its own name, distinct from
>    `broken-close` ("cannot run"): the decision-ready options differ (raise the timeout vs
>    fix the argv), so pooling them erases decision information. Hygiene-level.
> 3. **Judgment-rendered signal (the hard one)** — exit code alone CANNOT separate
>    crash-at-load from an honest red (byte-shape-identical at the seam; adaptlearn's
>    evidence-only classifier could not flag it, P4 recorded WRONG). An auditable close
>    must expose out-of-band evidence that judgment occurred (executed-test count or a
>    structured verdict artifact), and the chain treats "exit nonzero ∧ zero tests
>    executed" as `close-crashed`, never red. This is the exact class behind V9's run-1
>    wrong-reason verdicts.
>
> Porting rule of thumb: keep the single evidence-only classifier idea (it must never key
> on which case it is reading) and the falsifier-by-opposite-class-evidence arm — a
> classifier that cannot flip is asserting, not measuring.

# Pre-registration — V10 forbidden-zone audit (close-chain outcome taxonomy)

**Registered:** 2026-07-13, before any probe code runs. Assignment: hamr go ("run next
experiment"), CYBERNETICS §B2/V10. Sandbox: adaptlearn (F21–F24 pattern — POC here, findings
consumed by bareloop as build rules, reference impl never shipped). **Token-free**: no model
calls; the worker seam is out of scope. Candidate finding id: **F25**.

## Question

A logic family defines a forbidden zone: a voltage between the 0-band and the 1-band is a
fault, never rounded to the nearest value (§B2). The close chain's bands are clean green
(exit 0, artifact judged) and clean red (nonzero exit, artifact judged and failing). The
audit: **enumerate every outcome the real close chain can produce that is in neither band,
and test whether the machinery maps each to a named non-verdict category (red/escalation) or
silently coerces it to a verdict.** Per V10's registration, coercing a forbidden-zone
outcome to a verdict is itself the instrument fault — the F5 class (validated green, crashed
post-green) generalized.

## Instrument under test (real code paths, no replicas)

- `src/ralph.js` — `runClose` (exit-code → verdict mapping) and `ralph` (escalation naming)
- `src/validate.js` — `validateConfig` (the pre-token predicate's own edge behavior)

Forbidden-zone outcomes are produced at the real seams (a hostile close argv is a real close;
ATPG simulates the condition, never requires a naturally broken part). Every classification
is read back from the real return values / real spine JSONL — no replica read-back (F22
lesson). Already answered elsewhere, not re-run: cap-halt own-category (V9 VEC-6), close
stuck-at-green/red (V9 F-C1/F-C2), escalation byte-identity (V9 VEC-5/F-E1).

## Outcome catalog (the forbidden zone) and per-row predictions — binding at readout

Classifications: **NAMED** (maps to a named non-verdict category), **COLLAPSED** (reaches a
named non-verdict category but shares a bucket that erases a real distinction — hygiene-level,
per the F23 truncation precedent), **COERCED** (read as a verdict — the instrument fault).

| id  | forbidden-zone outcome                       | production (real seam)                                        | prediction |
|-----|----------------------------------------------|---------------------------------------------------------------|------------|
| Z-1 | close cannot run (binary missing)            | argv names nonexistent binary; `runClose` + full `ralph`      | P1: NAMED — `failed` → `broken-close` escalation, `decisionReady` |
| Z-2 | close never finishes (timeout)               | argv `['sleep','130']` vs the hardcoded 120s; `runClose` only — **this row costs a real 120s wait, once, declared here** | P2: COLLAPSED — `spawnSync` sets `error` (ETIMEDOUT) → `failed` → `broken-close`; "didn't finish judging" has no name of its own, but it is NOT read as a verdict |
| Z-3 | close killed by signal (no verdict rendered) | argv `node -e 'process.kill(process.pid,"SIGKILL")'` (status=null, signal set, **no** spawn error); `runClose` + full `ralph` | P3: COERCED — falls through to `needs_revision` (`exitCode: null`, empty gap); `ralph` treats it as an ordinary red and burns cap. The headline predicted gap |
| Z-4 | close crashes internally (crash-vs-fail)     | `node --test` over a fixture whose test file throws at load (top-level), exit 1, zero tests executed | P4: COERCED — indistinguishable from an honest red by exit code alone; returned as `needs_revision`. The V9-run-1 bug class (dir-argv MODULE_NOT_FOUND redding every close) live in the shipped mapping |
| Z-5 | middle throws a category the shell never anticipated | full `ralph`, middle throws `{category:'novel-category-x'}` | P5: NAMED — category relayed verbatim on the escalation event (passthrough by design), generic decision text |
| Z-6 | validator fed non-config garbage             | `validateConfig(null)`, `(42)`, `('{oops')`                   | P6: NAMED — `parse-error` red each time; never throws, never `ok:true` |

**P7 (overall shape):** GAP — the shipped close chain contains ≥1 COERCED row (Z-3, Z-4) and
≥1 COLLAPSED row (Z-2).

## Arms

1. **CONTROL** (clean bands — the classifier must not over-trigger): green fixture close →
   `satisfied`; red fixture close (real failing assertion, file argv per the V9 run-1 fix) →
   `needs_revision` with nonempty gap. Both must classify IN-BAND, zero forbidden-zone flags.
2. **AUDIT** — each Z-row produced against the real machinery; classifier emits
   NAMED / COLLAPSED / COERCED from the real read-back. Compared against P1–P6 at readout.
3. **FALSIFIER** (`--falsify`) — each row's classifier is fed a minimal synthetic result of
   the **opposite class** at the same read-back seam (e.g. Z-3′ sees a named `close-killed`
   escalation instead of the coerced verdict; Z-1′ sees a coerced `needs_revision` instead of
   the named escalation). Every classifier must **FLIP** its classification. A classifier
   that reports the same class on flipped input is asserting, not measuring — that row's
   audit reading is void (the test must be able to fail, mechanized).

## Pre-worded readouts (all shapes, in advance)

- **CLEAN:** every Z-row NAMED ∧ control clean ∧ all falsifier rows flip → V10 already holds
  for this machinery; ships to bareloop as a checklist with no build obligation. P3/P4/P7
  recorded as WRONG explicitly.
- **GAP:** ≥1 row COERCED (∧ control clean ∧ falsifiers flip) → the forbidden-zone fault is
  live in the shipped shell; per-row naming, no pooling. The deliverable to bareloop is a
  **build rule per coerced row** (the named category its close chain must carry — e.g.
  `close-killed`, `close-crashed` distinct from `needs_revision`). No machinery fix inside
  this probe: the sandbox is closed, the fix is a bareloop obligation (its close chain is a
  rewrite, not this code) — unless hamr directs an adaptlearn fix separately.
- **COLLAPSED-only:** no coercions, ≥1 collapse → hygiene finding (taxonomy advice), not an
  instrument fault; P7 recorded as WRONG in its coercion half.
- **CONTROL false positive:** an instrument-or-probe bug, not a finding — leak-search the
  mundane explanation first (env, tmp dirs, argv shape — the V9 run-1 class) before any
  catalog change; whole suite re-runs after any fix, prior numbers void.
- **FALSIFIER failure:** ≥1 classifier fails to flip → that row's reading is void and
  reported as such; remaining rows stand per-row (V8 discipline — no pooling into a scalar).
- A null can arrive in a shape this list missed (F23's lesson): if so, the shape is recorded
  as unanticipated FIRST, then described — never retrofitted into a canned sentence.

## Exit codes / run

- `node poc/fzone.mjs` — CONTROL + AUDIT; exit 0 iff control clean ∧ every row classified
  (any classification; exit 0 is "audit completed", the readout is the table, not the exit).
- `node poc/fzone.mjs --falsify` — FALSIFIER; exit 0 iff every classifier flips.
- Per-row table printed; outcomes reported, never asserted in prose. Z-2's 120s wait prints
  a notice before it starts.

## Results — 2026-07-13 (official run; builder opus-4.8 verification run matched byte-for-byte, deterministic)

**READOUT: GAP** (the pre-worded shape) — control clean, every classifier proven
load-bearing, ≥1 coercion live in the shipped close chain:

- **CONTROL 2/2 IN-BAND** (green fixture → `satisfied`; red fixture → `needs_revision`,
  `exitCode=1`, nonempty gap — zero over-triggers).
- **FALSIFIER 6/6 FLIP** — every classifier changes class on opposite-class synthetic
  evidence at its own seam; no classifier asserts.
- **AUDIT (per row, vs the binding predictions):**
  - **Z-1 NAMED — P1 CONFIRMED.** Missing binary → `failed` → `broken-close` escalation,
    `decisionReady=true`.
  - **Z-2 COLLAPSED — P2 CONFIRMED.** Real 120s timeout → `spawnSync` error (ETIMEDOUT) →
    `failed` → the broken-close bucket. "Didn't finish judging" reaches a named non-verdict
    category but has no name of its own (hygiene-level, F23 precedent).
  - **Z-3 COERCED — P3 CONFIRMED (the headline gap).** Signal-killed close (no spawn error,
    `status=null`) falls through to `needs_revision` with `exitCode=null` and empty gap;
    `ralph` reads it as an ordinary red, RETRIES the broken arbiter, and burns the cap to a
    `cap-halt` escalation. A no-judgment-rendered outcome is read as a verdict — the F5
    class live in the shipped shell, and a direct §5b violation in behavior (broken close
    must escalate, never retry).
  - **Z-4 — P4 WRONG; unanticipated readout shape (recorded first, per §readouts).** The
    prereg's classification set had no bucket for what happened: the crash-at-load close
    (zero tests executed, exit 1) reads back as `needs_revision exitCode=1 gap=nonempty` —
    **byte-shape-identical to the honest CTL-red row** — so the evidence-only classifier
    returns IN-BAND. The coercion exists by construction but is INVISIBLE at the runClose
    seam: no evidence-only auditor can flag it, because exit code alone cannot carry the
    judged-vs-crashed distinction. P4's mechanism claim ("indistinguishable from an honest
    red by exit code alone") is demonstrated *more* sharply than its classification
    predicted; its COERCED classification is recorded WRONG. The builder honored the
    no-bending rule: no gap-content grepping was added to rescue the prediction.
  - **Z-5 NAMED — P5 CONFIRMED.** Novel throw category relayed verbatim
    (`esc.category=novel-category-x`), passthrough by design.
  - **Z-6 NAMED — P6 CONFIRMED.** `null` / `42` / `'{oops'` each → named `parse-error`
    red; no throw, no `ok:true`.
- **P7 HOLDS** via Z-3 (≥1 COERCED) ∧ Z-2 (≥1 COLLAPSED); its Z-4 half is void as
  written — Z-4 is not *detectably* coerced at this seam (see above).

**Build rules shipped to bareloop (the GAP deliverable, one per non-NAMED row):**
1. **`close-killed` (from Z-3):** a close that dies by signal rendered no judgment — it
   must map to its own named escalation, never to `needs_revision`. The shipped mapping's
   fall-through (`status !== 0` → red) is the fault; the tell is `status === null` with no
   spawn error.
2. **`close-timeout` (from Z-2):** "didn't finish judging" gets its own name, distinct
   from `broken-close` ("cannot run") — the decision-ready options differ (raise the
   timeout vs fix the argv), so pooling them erases decision information. Hygiene-level.
3. **Judgment-rendered signal (from Z-4, the hard obligation):** exit code alone CANNOT
   separate crash-at-load from honest red — a bareloop close that wants an auditable
   forbidden zone must expose out-of-band evidence that judgment occurred (e.g. executed
   test count, or a structured verdict artifact), and the chain must treat
   "exit nonzero ∧ zero tests executed" as `close-crashed`, not red. This is the class
   that produced V9's run-1 wrong-reason verdicts (dir-argv MODULE_NOT_FOUND).

Per the pre-worded GAP readout: **no machinery fix lands in adaptlearn** (the sandbox is
closed; bareloop's close chain is a rewrite) unless hamr directs one separately. Recorded
as FINDINGS **F25**.
