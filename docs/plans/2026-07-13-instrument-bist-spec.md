# Instrument BIST — spec (consumed from adaptlearn, V9 GREEN)

> Carried over 2026-07-13 from adaptlearn `poc/bist-prereg.md` (F24, release 0.11.6),
> upstream-ledger pattern: the SPEC travels (catalog + vectors + arms + the run record);
> the POC runner (`poc/bist.mjs`) deliberately does not — bareloop rewrites the pre-flight
> against its OWN components (run.js runner seams, its spine, validateJob) and checks the
> rewrite against the POC's behavior. Consumption point: a pre-flight gate before any
> probe/job instrument is trusted (N-ladder instrument hygiene; answers PRD v1.10 item 1).
> Porting rule of thumb: keep ONE shared read-back function used against good and faulted
> components (no replica checks), and keep the falsifier arm — a vector whose sabotage
> still "detects" is not load-bearing and must not ship.

# Pre-registration — V9 instrument BIST (stuck-at catalog + detection vectors)

**Registered:** 2026-07-13, before any code runs. Assignment: hamr (PRD v1.10 addendum,
CYBERNETICS §B4/V9). Sandbox: adaptlearn (F21/F22/F23 pattern — POC here, spec consumed by
bareloop, reference impl never shipped). **Token-free**: no model calls anywhere; the
instrument's worker seam is out of scope by design (the BIST tests the machinery that
*judges and records* workers, not workers).

## Question

Can a token-free vector suite over the **real** instrument components detect every fault in
a declared stuck-at catalog, with zero false positives on the good instrument, where every
vector's detection power is proven load-bearing by sabotage (mutation-validation, the F4
pattern)? Motivation: F23's contaminated instrument cell was an undetected instrument fault,
found only by a replication rep after tokens were spent. A BIST is the pre-flight that finds
that class before the spend.

## Instrument under test (real code paths, no replicas)

- `src/ralph.js` — `runClose` (exit-code → verdict mapping) and `ralph` (the loop, honest
  terminals, escalation payloads)
- `src/spine.js` — `makeSpine` (append-only JSONL, monotonic `seq`, `ts` stamped last)
- `src/validate.js` — `validateConfig` (named reds before tokens)

Faults are injected **at the component seams** (a fault is synthetic by definition — ATPG
simulates the fault, never requires a naturally broken chip). Detection vectors are the real
checks that would ship as a pre-flight: they exercise the real components and the real
read-back paths.

## Fault catalog (stuck-at model)

| id   | fault                                                        | seam            |
|------|--------------------------------------------------------------|-----------------|
| F-C1 | close stuck-at-green (argv always exits 0)                   | close argv      |
| F-C2 | close stuck-at-red (argv always exits 1)                     | close argv      |
| F-S1 | spine drops events (every 2nd emit silently dropped)         | emit wrapper    |
| F-S2 | spine freezes seq (every event seq=1)                        | emit mutant     |
| F-S3 | spine stamps ts first (ordering contract broken)             | emit mutant     |
| F-V1 | validator stuck-at-green (always `{ok:true, reds:[]}`)       | validator subst |
| F-E1 | escalation channel summarizes (detail truncated before write)| emit wrapper    |

## Detection vectors

| id    | vector (run against good AND faulted instrument)                                   | detects    |
|-------|-------------------------------------------------------------------------------------|------------|
| VEC-1 | known-red fixture: real `node --test` close over a temp dir with one failing test → `runClose` returns `needs_revision` with non-empty gap | F-C1 |
| VEC-2 | known-green fixture: same, passing test → `satisfied`                               | F-C2       |
| VEC-3 | broken-close mapping: argv names a nonexistent binary → verdict `failed` (never `needs_revision`/`satisfied`); full `ralph` run → `broken-close` escalation, outcome `escalated` | (mapping check, no paired fault) |
| VEC-4 | spine integrity: emit K=7 typed events → file has exactly K lines; every line parses; `seq` strictly 1..K; `ts` is the FINAL key of every object; `type` present | F-S1, F-S2, F-S3 |
| VEC-5 | escalation byte-identity: `ralph` with middle throwing `{category:'gate-red', message:M}` (M contains spaces/unicode) over a real red close → spine contains `escalation` event, `category==='gate-red'`, `decisionReady===true`, `detail` **byte-identical** to M; a category-less throw maps to `interpreter-red` | F-E1 |
| VEC-6 | cap-halt honesty: middle that never fixes + real red close + `capRuns=2` → outcome `escalated`, spine has `cap-halt` event, zero `satisfied` verdicts | F-C1 (green-on-broken also trips here) |
| VEC-7 | validator named reds: config missing `gate.writeScope` + `remember` in `after-red` → `ok:false` with `missing-required @ gate.writeScope` AND `verb-placement`; a known-valid config → `ok:true` | F-V1 |

## Arms

1. **CONTROL** — all vectors × good instrument: every vector must pass. Any failure is a
   false positive → POC red for that row (leak-search the mundane explanation first, §doctrine).
2. **DETECTION** — each fault × its paired vector(s): the vector must fail (= fault detected).
3. **FALSIFIER** (`--falsify`) — each paired vector, sabotaged (assertion weakened: VEC-1′
   accepts any verdict; VEC-2′ accepts any; VEC-4′ checks only that lines parse; VEC-5′
   checks event existence but not byte-identity; VEC-6′ checks only that an outcome string
   exists; VEC-7′ checks only that `ok` is boolean) × its fault: the sabotaged vector must
   **MISS**. If it still detects, the detection power was incidental (a crash, not the
   assertion) — that vector is NOT load-bearing (the F22 replica-negative lesson,
   mechanized).

## Pre-worded readouts (all shapes, in advance — F23's lesson)

- **GREEN:** control clean (0 false positives) ∧ 7/7 faults detected ∧ all sabotaged
  vectors miss → BIST viable as a probe pre-flight; the spec (catalog + vectors + arms)
  ships to bareloop; the script stays POC.
- **NULL shape A (detection gap):** ≥1 fault undetected by its paired vector → the vector
  design is insufficient at that seam. Named per seam; the fix is redesigning the vector and
  re-running the whole suite — never widening an assertion post-hoc to make the row pass.
- **NULL shape B (falsifier failure):** ≥1 sabotaged vector still "detects" → its detection
  came from machinery incidentals, not the assertion; the vector is reclassified
  non-load-bearing and the row is a false comfort the BIST must not ship with. This is a
  result about the vector, not the component.
- **Mixed:** shapes A and B can co-occur on different rows; report per-row, no pooling into
  one scalar (V8 discipline applies to readouts too).
- **CONTROL false positive:** an instrument-or-vector bug, not a finding — mundane
  explanations exhausted first (env, tmp dirs, NODE_TEST_CONTEXT class of leaks) before any
  catalog change.

## Exit codes / run

- `node poc/bist.mjs` — CONTROL + DETECTION; exit 0 iff control clean ∧ all faults detected.
- `node poc/bist.mjs --falsify` — FALSIFIER; exit 0 iff every sabotaged vector misses.
- Per-row table printed; outcomes reported, never asserted in prose.

## Run-1 instrument fix — 2026-07-13 (control false positive, leak-searched)

Run 1 (hamr): FALSIFIER 8/8 MISS; DETECTION 8/8 rows, 7/7 faults; **CONTROL 6/7 — VEC-2
false positive** (green fixture → `needs_revision` on the good instrument). Leak-search
per §readouts found the mundane cause before any catalog change: the fixture argv passed
the fixture **directory** to `node --test`, which treats a dir as an entry file
(MODULE_NOT_FOUND → exit 1) rather than scanning it — so every fixture close exited red
regardless of its tests. Verified both directions outside the suite: file-argv green
fixture exits 0, file-argv red fixture exits 1 (Node v22.22.2).

Consequence honestly stated: VEC-1's run-1 CONTROL pass was **for the wrong reason** (its
red came from the loader error, not the failing assertion) — the false positive on VEC-2
is what exposed it, which is the control arm doing its job. Fix: argv names the test file
(`['node','--test',<file>]`), a fixture repair, no assertion widened, no catalog change.
Per §readouts the whole suite re-runs from scratch; run-1 numbers are void for the GREEN
readout and kept here as the instrument-fix record.

## Results — run 2, 2026-07-13 (hamr, post-fix, whole suite from scratch)

**READOUT: GREEN** — the pre-registered green criteria met on every arm, no exclusions:

- **CONTROL 7/7 PASS** (zero false positives; VEC-2 now `verdict=satisfied`, VEC-1 red for
  the right reason — real failing assertion, nonempty gap).
- **DETECTION 8/8 rows, 7/7 distinct faults** — each fault caught by its paired vector's
  own assertion: F-C1 `satisfied` on the red fixture (VEC-1) and `green` with a satisfied
  verdict on a broken artifact (VEC-6); F-C2 `needs_revision` on the green fixture; F-S1
  `line count 4!=7`; F-S2 `seq 1!=2`; F-S3 `ts not final key`; F-E1 `byteEqual=false`;
  F-V1 both named reds absent.
- **FALSIFIER 8/8 MISS** — every sabotaged vector fails to detect its paired fault; no
  STILL-DETECTED rows, so no vector's detection power is incidental (each assertion is
  load-bearing).

Per the pre-worded GREEN readout: the BIST is viable as a probe pre-flight; the **spec
(catalog + vectors + arms) ships to bareloop** (copied to its `docs/plans/`); the script
stays POC and is never shipped. Run-1's control catch (a real fixture bug found by the
control arm before any probe trusted the instrument) is itself the mechanism working one
level early. Recorded as FINDINGS **F24**.
