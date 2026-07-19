# Toggle coverage — spec (consumed from adaptlearn, V13: metric validated, archive insufficient)

> Carried over 2026-07-13 from adaptlearn `poc/toggle-coverage-prereg.md` (F26, release
> 0.11.8), upstream-ledger pattern: the SPEC travels (locked comparison rules + the two pair
> tiers + control/falsifier design + the coverage-table format); the POC runner
> (`poc/toggles.mjs`) does not — bareloop implements the metric against its OWN ledger.
> Consumption point: the ledger/selection work (answers PRD v1.10 item 5). This is the LAST
> adaptlearn sandbox probe — with it, every Boolean-floor V-item is either answered (V9, V10,
> V13) or transferred here as a registered build rule (V11, V12).
>
> **The readout in one line:** the metric works and discriminates (control exact; all three
> comparison rules falsifier-proven; `hooks.on-green` flagged UNWIRED in every archived
> world; F15's lock found toggle-visible) — but adaptlearn's archived ledgers **cannot
> support clean attribution**, and that is the lesson worth inheriting.
>
> **Build rules:**
> 1. **Toggle coverage is a ledger DESIGN requirement, not a post-hoc query.** The clean tier
>    (T-strict: sibling cells at the same task/generation/arm, configs one knob apart) was
>    **barren in every archived world** — sibling lineages had divergent mutation histories,
>    so they virtually never differed by exactly one knob. If bareloop wants coverage to mean
>    anything, cohorts must deliberately EMIT one-knob sibling cells. Retrofitting the metric
>    onto a ledger not designed for it yields a barren clean tier and a confounded one.
> 2. **Never count a toggle across a re-authoring boundary.** A lineage pair is one-knob only
>    if it WAS a mutation step (`knobMutated` set). Demonstrated live: a re-authored pair in
>    adaptlearn's sp1 world produced a "toggle" attributing improvement to **removing**
>    episode-recall — the wrong sign, against the strongest result the project has — because
>    the task changed with the generation and the config had been re-authored, not mutated.
> 3. **Ship the UNWIRED-until-proven flag.** `hooks.on-green` is the worked example: an axis
>    present in the schema, the mutation catalog, and every config, with **zero** ledger
>    evidence it ever changed an outcome. Zero toggles ⇒ unwired-until-proven, by default.
> 4. **Keep all three comparison rules — each is falsifier-proven load-bearing:** single-knob
>    strictness (co-occurrence pairing mints false toggles), outcome-class sensitivity
>    (outcome-blindness mints a toggle on a same-outcome pair), and kinds-as-sets with mirror
>    coupling (order-sensitivity fractures identical configs).
>
> Porting rule of thumb: keep ONE counting engine shared by control, audit, and every
> sabotage (no replica counters), and keep the sabotage arm — a comparison rule whose
> sabotage leaves the answer intact was never load-bearing.

# Pre-registration — V13 toggle coverage (per-knob contrast toggles from archived ledgers)

**Registered:** 2026-07-13, before any probe code runs. Assignment: hamr go ("run last
experiment"), CYBERNETICS §B5/V13. Sandbox: adaptlearn — the last sandbox-hostable probe
(V11/V12 are bareloop build rules; after this the sandbox is complete). **Token-free and
retro-only**: computed entirely from `docs/archive/evidence/` ledgers + persisted configs;
no model calls, no new runs. Candidate finding id: **F26**.

## Question

§B5: verifying a gate means toggling one input and watching the output switch — an input
whose toggle never changes the output is not wired in. V13 extends V2's contrast-bit
*minting requirement* into an ongoing *coverage metric*: **per config knob, does the ledger
hold ≥1 observed toggle — a pair of runs whose configs differ in exactly that one knob and
whose outcome classes differ?** A knob claimed load-bearing with zero observed toggles is
unwired-until-proven. The probe asks: (a) is this mechanically computable from the archived
ledgers alone, and (b) does it discriminate — flagging the F16 lost-credit acquisition as
toggle-invisible while finding the F15 L1 lock as a real toggle?

## Data under audit (archived, never re-run)

All `docs/archive/evidence/` worlds with cohort layout (`cohort-ledger*.jsonl` + configs):
`attempt2-dQtNOb`, `attempt3-7xErzP`, `sp1-aSqtvl`, `sp3-ap1exS`, `f19-K9Ofzk`,
`f20-vVsQda`. Config source: **`configs-final/` when present, else `configs/`** — F18
doctrine, the as-executed config is the truth a toggle attributes to. Knob space: the 8
`AXES` imported from `src/mutate.js` (bound, never copied — F5/F9).

## Locked definitions (instrument-design reads done before registration, recorded here)

- **Axis value extraction:** per config, the value at each AXES path; hook slots = the
  slot's op array. **Kinds arrays compare as SETS** (archived reality: lineages hold the
  same kinds in different orders — an order-only difference is NOT a config difference).
- **Mirror coupling (observed in the archive, part of the knob's identity):** a
  `memory.recall.kinds` change is mirrored into the `kinds` param of hook `recall` ops
  (the F15 lock's g3→g4 step moves both paths as one act). A pair whose only differences
  are the same set-delta on `memory.recall.kinds` AND on hook-op `kinds` counts as
  **single-knob = `memory.recall.kinds`**. Any other multi-axis diff disqualifies the pair.
- **Outcome class (categorical only, cost never enters):** `green@1` | `green-grind`
  (green, iterations > 1) | `red` (anything non-green: cap-halt, escalated). Toggle ⇔
  classes differ.
- **Two pair tiers, reported separately (never pooled):**
  - **T-strict:** same world, same `gen` (⇒ same task), same `arm` — cross-lineage pairs.
    Everything held equal except the one knob.
  - **T-lineage:** same world, same `arm`, same `lineage`, consecutive `gen` (the mutation
    ladder's own one-knob semantics). **Task varies across the pair — a declared confound**
    (task difficulty rides along; F16's guessability lesson), which is why this tier is
    reported under its own name and never merged with T-strict.
- **Coverage output:** per world × per knob × per tier: #single-knob pairs observed,
  #toggles observed, flag `unwired-until-proven` iff toggles = 0 across both tiers.

## Predictions — binding at readout

- **P1 (F16 lost-credit case, `sp1-aSqtvl`):** the g0 gated-rules episode-recall
  acquisition (green with `episode` wired at authoring) participates in **zero**
  single-knob pairs at either tier — g0 configs are authored fresh (multi-knob diffs
  everywhere), so the acquisition is **toggle-invisible**: the metric mechanizes exactly
  why the credit was lost (bare greens carry no which-knob signal; the design law's
  premise, now countable).
- **P2 (F15 L1 lock, `attempt3-7xErzP`):** ≥1 T-lineage toggle for `memory.recall.kinds`,
  specifically gated-rules L1 g3→g4 (green-grind → green@1, the +episode step under the
  mirror coupling). The lock is toggle-VISIBLE — the contrast the extractor should have
  been required to cite.
- **P3 (unwired flag fires for real):** `hooks.on-green` shows zero toggles in every
  world at both tiers (the mutation walker never reached it in the archived runs) → it is
  flagged unwired-until-proven — the metric's punchline demonstrated on real data: an axis
  everyone could *claim* matters, with no ledger evidence it ever mattered.
- **P4 (feasibility):** the whole computation is token-free, deterministic, and completes
  from the archive alone (no world re-run, no worker, no model).

## Arms

1. **CONTROL (machinery, synthetic mini-world with known ground truth):** hand-built
   ledger+configs containing exactly: one true toggle on knob A; one single-knob pair on
   knob B with SAME outcome class (pair counted, no toggle); one knob C never varying
   (unwired flag); one two-knob-diff pair with differing outcomes (must NOT count as a
   pair); one order-only kinds difference (must read as identical configs); one mirrored
   `memory.recall.kinds` coupling pair (must count as single-knob = recall.kinds). The
   counter must reproduce this table exactly.
2. **AUDIT:** the six archived worlds; per-world coverage tables; P1–P3 checked
   explicitly, row by row, at readout.
3. **FALSIFIER (`--falsify`):** three sabotaged counters run against the CONTROL world,
   each attacking one locked rule: (a) *co-occurrence counter* (accepts pairs differing in
   ≤2 knobs) — must wrongly count the two-knob fixture; (b) *outcome-blind counter*
   (ignores outcome class) — must wrongly mint a toggle on the same-outcome pair;
   (c) *order-sensitive comparer* (kinds as arrays, not sets) — must wrongly fracture the
   order-only pair (report it as a config diff). Each sabotage must CHANGE the control
   answer; a sabotage that leaves the answer intact means that rule is not load-bearing
   (the probe cannot claim the rule matters — that row is void).

## Pre-worded readouts (all shapes, in advance)

- **GREEN:** control exact ∧ falsifier 3/3 rules load-bearing ∧ P1–P4 all confirmed → the
  metric is viable and discriminating; the spec (definitions + tiers + control/falsifier
  design + coverage-table format) ships to bareloop as the V13 ledger metric.
- **P1 fails (F16 case shows a toggle):** the lost credit HAD attributable single-knob
  evidence — a real doctrine hit on "bare greens carry no which-knob signal" (the premise
  would be partly wrong); report which pair, which tier, re-examine F16's narrative — the
  finding would be about the design law's origin story, not the metric.
- **P2 fails (F15 lock invisible):** distinguish instrument from world before any doctrine
  move (leak-search order): if the g3→g4 pair was disqualified by the pair rule, that is a
  probe bug against this prereg's own mirror-coupling definition — fix and re-run whole;
  only a genuinely absent pair after that is a real result (the lock was never single-knob
  in ledger reality → V13's premise weakens for authored arms).
- **P3 fails (on-green shows a toggle somewhere):** authored configs varied it where
  mutation never did — not a failure of the metric; report the pair and drop the
  "guaranteed demonstration" framing.
- **CONTROL mismatch:** probe bug, never a finding — fix, re-run whole, prior numbers void.
- **FALSIFIER failure:** that rule's claim to be load-bearing is void; report per-rule.
- A shape this list missed is recorded as unanticipated FIRST, then described (F23).

## Exit codes / run

- `node poc/toggles.mjs` — CONTROL + AUDIT; exit 0 iff control exact ∧ all six worlds
  produced coverage tables.
- `node poc/toggles.mjs --falsify` — FALSIFIER; exit 0 iff all three sabotages change the
  control answer.
- Per-world, per-knob, per-tier tables printed; outcomes reported, never asserted.

## Results — 2026-07-13 (official run; deterministic, replay `node poc/toggles.mjs` / `--falsify`)

**READOUT: the metric is VALIDATED; the archive is NOT toggle-attributable — P1 wrong, and
the failure arrived in an unanticipated shape (recorded first, per §readouts).**

### The instrument (both arms clean)

- **CONTROL exact** — the engine reproduces the six-fixture ground-truth table byte-for-byte
  (true toggle on knob A; same-outcome pair on B counted as a pair with no toggle; C never
  varies → UNWIRED; the two-knob pair NOT counted; the order-only kinds pair read as
  identical; the mirrored recall.kinds pair counted as single-knob).
- **FALSIFIER 3/3 rules load-bearing** — each sabotage changes the control answer:
  (a) co-occurrence (≤2-knob pairs) wrongly mints `loop.shape` and a second
  `memory.recall.k` pair *with a toggle*; (b) outcome-blind wrongly mints a toggle on the
  same-outcome pair; (c) order-sensitive kinds wrongly fractures the order-only pair.
  No rule is decorative.

### The audit (5 worlds mapped, 1 skipped)

`attempt2-dQtNOb` **SKIPPED** — configs were never persisted in that world (no
`configs/`), so no pair can be formed. Honest skip, printed, not silently dropped.

**The headline, unanticipated:** **T-strict — the only unconfounded tier — is essentially
barren across the whole archive** (0 pairs in `attempt3`, `sp1`, `f19`; 2 in `sp3`, 3 in
`f20`; zero toggles in every one of them). Within a (gen, arm) group the two lineages have
divergent mutation histories, so they almost never differ by exactly one knob. Practically
all the archive's toggle evidence sits in **T-lineage**, the tier this prereg declared
confounded (the task changes with the generation). The archived ledgers therefore **cannot
support clean toggle attribution** — not because the metric fails, but because the cohorts
were never designed to produce sibling cells that differ by one knob at a fixed task.

**P1 — WRONG as worded, and instructively so.** Predicted: the F16 g0 gated-rules
episode-recall acquisition participates in *zero* single-knob pairs at either tier. Observed:
**2 T-lineage pairs**, one of which registers a toggle — `g0L1 → g1L1`,
knob `memory.recall.kinds`, classes `red → green-grind`. But reading the rows (leak-search
before doctrine): that "toggle" is a set-delta of **−episode +doc** across a **task change**
(`dur` → `bytes`), on a pair where the g1 config was **re-authored, not mutated**
(`knobMutated=null` in the ledger). A consumer trusting it would attribute the improvement
to *removing* episode-recall — **the wrong sign**, against the strongest result the project
has (episode recall is the load-bearing knob, 20/20 green, green@1 0.80 vs 0.00). At the
trustworthy tier (T-strict), sp1 has **zero pairs on every knob** — so P1's *mechanism*
("the acquisition carries no attributable single-knob contrast") holds exactly where it can
be trusted, while its *letter* ("zero pairs at either tier") is false. **New sub-finding,
not in the prereg's shapes:** T-lineage toggles in a **re-authoring arm** can carry the
wrong sign — the lineage tier's one-knob semantics assume a mutation step, and an arm that
re-authors between generations silently breaks that assumption. The confound is worse than
"task rides along": the pair may not be a mutation step at all.

**P2 — CONFIRMED.** `attempt3-7xErzP`, gated-rules L1, `g3 → g4`: a T-lineage toggle on
`memory.recall.kinds`, classes **green-grind → green@1** — a genuine mutation step
(`knobMutated=memory.recall.kinds`), the +episode acquisition under the mirror-coupling rule.
The F15 lock is **toggle-VISIBLE**: the contrast the extractor should have been required to
cite existed and is mechanically countable.

**P3 — CONFIRMED, the metric's punchline on real data.** `hooks.on-green`: **0 pairs, 0
toggles, in every mappable world** → flagged **UNWIRED-until-proven** everywhere. The
mutation walker never reached it and no authored config ever varied it: an axis in the
schema, in the mutation catalog, and in every config — with **zero ledger evidence it has
ever changed an outcome**. Exactly the class V13 exists to flag.

**P4 — CONFIRMED.** Token-free, deterministic, offline, from the archive alone; both arms
run in well under a second.

**Per-world toggle counts** (T-strict pairs/toggles, T-lineage pairs/toggles) are printed by
the runner and not duplicated here; the run is free to replay.

### Consequence for bareloop (V13 answered)

The metric ships **with a design obligation attached** — the retro-audit's real lesson:

1. **Toggle coverage is a ledger *design* requirement, not a post-hoc query.** A cohort must
   deliberately emit **T-strict pairs**: sibling cells at the same task/generation/arm whose
   configs differ in exactly one knob. Retrofitting the metric onto a ledger not designed for
   it yields what this archive yields — a barren clean tier and a confounded one.
2. **Never count a toggle across a re-authoring boundary.** A lineage pair is only one-knob
   if the ledger says it *was* a mutation step (`knobMutated` set); an arm that re-authors
   between generations breaks the one-knob semantics, and its "toggles" can carry the wrong
   sign (demonstrated live: −episode reading as an improvement).
3. **Ship the UNWIRED flag.** `hooks.on-green` is the worked example: a knob everyone could
   claim matters, with zero evidence it ever did. Unwired-until-proven is the correct default.
4. Keep the locked comparison rules — all three are falsifier-proven load-bearing
   (single-knob strictness, outcome-class sensitivity, kinds-as-sets with mirror coupling).

Recorded as FINDINGS **F26**. No adaptlearn machinery change (sandbox closed).
