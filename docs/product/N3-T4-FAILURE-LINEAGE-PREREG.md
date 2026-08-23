# T4 — failure-lineage pre-probe (FROZEN 2026-07-25, before any number)

**Rung:** Layer 3 opening gate, successor to F51/F52/F53. **Status:** frozen, not yet run.

## 1. Why this is the last live candidate

F51–F53 established that plan-v1's workflow generation is at CEILING on every clarity axis
we can manipulate (clear ask / method withheld / target withheld). Everything tested so far
is GENERAL METHOD, which lives in the weights — where memory reliably loses to ICL
(CL-BENCH). The one knowledge class that is absent from BOTH the weights AND the repo is
**what FAILED in a prior run**: an event, not a file. A scout with `read`/`grep` can find
`pytest.ini`, the root `conftest.py`, and every source line — it structurally **cannot**
find "attempt 1 was rejected because X". If inheritance has a niche, it is here.

## 2. Anti-fit-to-pass design (the binding constraint, hamr 2026-07-25)

1. **The lineage is EXTRACTED, never authored.** The payload is the verbatim
   `close-verdict` gap text from the archived green run `mrvwjrop` — three real rejections
   (gate-red forbidden pattern; clean-red imagined-behavior assertion; identical-rewrite
   exit). I did not write it to contain the answer; the prior run's own close did.
2. **The primary measure is STRUCTURAL, not prose.** "Did the plan echo the note?" is
   tautological — it measures instruction-following. The primary axis is instead whether the
   plan ORDERS a read-only source-reading step BEFORE its first write step (`readBeforeWrite`),
   which is what actually prevents the imagined-behavior failure and cannot be satisfied by
   quoting.
3. **One metric is declared INVALID UP FRONT, before any number:** the environ/gate-red guard
   (G2). The job spec itself names os.environ, so both arms echo it; it cannot discriminate.
   Excluded from the read, not discarded after seeing results.
4. **The control's headroom was measured BEFORE designing the arms**, at $0, on the 20 cold
   plans already collected: G1 read-source-first 15/20, G3 tree-must-change 14/20 — i.e.
   ~70–75%, genuinely BELOW ceiling (unlike the 1.00 that killed F52/F53). The pre-flight
   F51 minted is therefore satisfied: there IS room for a treatment to move.
5. **Real repo state.** Earlier probes described a hypothetical `tests/testgen_assess/`.
   T4's spec and scout use the VERIFIED state: assess tests really live at
   `packages/soar/tests/unit/` (three real files); there is NO conftest under `packages/soar`;
   the ROOT `conftest.py` does the sys.path setup; `pytest.ini` sets `testpaths`/`addopts`.
   The scout carries these repo facts in BOTH arms — so the only thing lineage adds is the
   failure knowledge, which is the variable under test.

## 3. Arms (n=8 each, ~$0.55, hard cap $1.00)

| arm | spec | lineage |
|---|---|---|
| **Q0** | real-patient assess.py spec | none (control) |
| **Qfail** | identical | the three verbatim prior-run rejections |

Same model/effort/scout/spec; one variable.

## 4. FROZEN read

- **PRIMARY — `readBeforeWrite`** (structural): the plan contains a read-only step that
  inspects the module/tests, ordered before the first write-class step.
- **SECONDARY — `G1` read-source-for-exact-behavior** (prose guard against clean-red);
  **`G3` tree-must-actually-change** (prose guard against the identical-rewrite exit).
- **EXCLUDED — `G2` environ/gate-red**: confounded by the spec, declared invalid here.
- **Carried unchanged:** winShape, first-draft validity (the F53 hypothesis rides along as a
  pre-registered secondary here rather than a post-hoc observation).

## 5. FROZEN decision rule

- **Qfail ≈ Q0 on the PRIMARY axis** → failure-lineage does not change the plan even when it
  is the only knowledge the scout cannot reach. **The readable arm is then DEAD across every
  axis we can construct**, and Layer 3 proceeds mechanical-only (or STOPs, per PRD v1.25).
- **Qfail materially above Q0 on the PRIMARY axis** → the readable arm has a demonstrated
  niche and enters the outcome battery as a pre-registered arm. It is promoted to a
  MEASURED-ON-PLANS claim only — never to an outcome claim, which only the battery can make.

## 6. What this cannot conclude (stated before running)

Plan-level only. A changed plan is not a better outcome (F39: perfect aim, zero conversion).
Even a clean win here promotes the arm into the battery; it does not mint a learning claim.
One patient family, one model, n=8.

---

# RESULT — 2026-07-25 (both arms complete, n=8 each, $0.49)

Full readout: `docs/FINDINGS.md` F54. Evidence: `n3-preprobe-data/t4-raw.jsonl`.

**Frozen primary `readBeforeWrite`: Q0 0.71 vs Qfail 0.25 → DECLARED UNREADABLE, not
reported as a result.** The metric required a SEPARATE read-only step before the first write
step; the Qfail plans fold the reading into the write step (`[read, grep, write]`, "Inspect
assess.py to identify the exact numeric thresholds…"). Functionally identical reading,
compressed into one step — the metric scored compaction as absence. The −0.46 is an artifact.

**Readable axes: NO LIFT.** G1 0.43→0.50, G3 0.57→0.50 (flat). Post-hoc corrected primary
(folded OR separate), labelled exploratory: **1.00 vs 1.00** — the control was at ceiling on
the real construct.

**Verdict by §5's frozen rule (Qfail ≈ Q0): the readable-lineage arm is DEAD** across every
axis this programme could construct. Layer 3 proceeds mechanical-only, or STOPs (PRD v1.25).

**§2.4 self-defect.** The control-headroom pre-flight PASSED (15/20, 14/20) but was computed
with the crude PROSE proxy on older data, while the functional behaviour is at 1.00. The
pre-flight must use the SAME metric the treatment is judged by, capturing the functional
construct — recorded in F54 as a sharpening of the rule F51 minted.

**Surviving hypothesis (unminted, now twice-observed):** lineage raises first-draft validity
(0.88 → 1.00 here; 0/16 vs 7/39 in F53) and compacts plans (4.6 → 3.6 steps). Efficiency
axis, confounded by the payload containing a well-formed plan. Settle via spend-to-green in
the outcome battery, not another planning screen.

**Programme total: $2.29** across four screens. This document is CLOSED.
