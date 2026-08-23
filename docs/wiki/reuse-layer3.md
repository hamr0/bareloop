---
type: reference
title: "Reuse / Layer 3"
status: stable
sources: [docs/archive/PRD.md]
---

# Layer 3 Reuse: Bridges, Templates, Lineage, and the Lift-Contrast Retirement

Layer 3 ("does an inherited plan help the next run of a similar job?") ran a long probe
programme that killed its original hypothesis (readable lineage), reframed inheritance around
patient-specific facts, froze a full design, then retired its own headline experiment once a
cheaper fix made the thing it measured disappear — leaving reuse re-aimed at a narrow,
unbuilt template arm.

## 1. The probe programme: readable lineage is dead, but only on one genre

Adoption 3 (an earlier addendum) proposed handing the drafter a readable trace of a prior
plan ("lineage") and gated it behind a cheap pre-probe: if drafted plans came out identical
with and without lineage, the arm would die for under a dollar. That gate ran — three frozen
screens, 55 real drafts of the shipped plan drafter, $1.80 total (PRD.md:1421-1424).

Three results came back:
- **F51 (clear ask):** the positive control passed — the drafter does read lineage — but the
  movement was shape mimicry only: remove the one lineage-named structural feature and the
  arms collapse (4.00 vs 3.86); `memoHits` 0/8 (PRD.md:1427-1429).
- **F52 (method withheld):** the model writes the strategy back in, near-verbatim, 8/8 — you
  cannot manufacture a strategy gap by withholding strategy (PRD.md:1430-1431).
- **F53 (target withheld):** aim does not degrade; both arms simply cover everything on a
  small target surface (PRD.md:1432-1434).

The load-bearing conclusion: plan-v1's workflow generation is at **ceiling** on every clarity
axis testable — a strong product result on its own, but a hard constraint on Layer 3, because
inheritance cannot lift an axis that is already maxed (PRD.md:1436-1442).

Two further candidates survived this narrowing — knowledge absent from both the spec and the
model's weights, where memory could still beat in-context learning: **(i) patient-specific
facts** (repo quirks, prior failures) — the strongest untested candidate — and **(ii) a wrong
default** the model would need overridden. A third, unregistered observation (fewer malformed
first drafts with lineage) was named as a hypothesis, not a finding (PRD.md:1444-1459).
Adoption 3 was narrowed, not killed or promoted (PRD.md:1461-1464). Mechanical inheritance
(carrying the plan skeleton, no model reading) was named the primary Layer 3 arm, since it is
the only thing that demonstrably transfers — but its own marginal value was still unproven on
outcome (PRD.md:1466-1470).

A follow-up addendum closed the programme: five pre-registered experiments, $2.29 total
(F51–F55), established the readable-lineage arm is dead on every constructible axis — the
cold planner already supplies method, targets, and lessons a prior failure would teach
(PRD.md:1502-1513). F55 additionally removed the fallback justification for the mechanical
arm: producing a plan is ~1–2% of spend, caused 0 of 15 terminations, with a 4% redraft rate,
so inheritance cannot pay for itself on planning cost or reliability alone
(PRD.md:1511-1513).

**But every finding was genre-bound.** All of Layer 2's acceptance and this whole probe
programme ran on one genre — TESTGEN — on one patient family; nine of ten job specs in
`jobs/` are `aurora-testgen-*`. "The planner is at ceiling" may just mean "the model knows
pytest test-writing cold" (PRD.md:1521-1527). Layer 3 was therefore **parked, not stopped** —
a stop minted on one genre's evidence would be the exact over-reach the repo's doctrine
exists to prevent (PRD.md:1529-1532). The agreed next move was a full-cycle e2e run on a
second genre, to test whether "planner at ceiling" is general or genre-specific
(PRD.md:1540-1546).

Standing method notes minted by this programme: check whether the **control** is already at
ceiling on the outcome-relevant axis before trusting a treatment arm's flatness
(PRD.md:1495-1497, PRD.md:1549-1550); a pre-flight instrument must use the **same metric** the
treatment will be judged by (PRD.md:1551-1553); measure the **surface** before building a
feature — F55 cost $0 and retired two justifications before a line of code was written
(PRD.md:1554-1555); audit a phase-share denominator for populations that structurally lack the
phase (PRD.md:1556-1557).

## 2. Legacy `steps[]` deleted immediately — hitl's fate deferred to Layer 3

A separate addendum deleted the legacy `steps[]` plan shape (hand-authored workflow steps)
immediately rather than waiting for Layer 3, on hamr's explicit call, superseding an earlier
park (PRD.md:1922-1926). `steps[]` was the exact user-authoring surface the product exists to
remove, and keeping it alive would have forced the next build (the staged close) to accept two
plan spellings (PRD.md:1930-1935). The stated reason for the earlier park — that legacy was
the only implementation of `hitl`/`soft-green` — did not survive the repo's own doctrine that
graduation between rungs is a rewrite, never a copy (PRD.md:1937-1940).

The real cost: `jobs/litectx-maintainer.json`, a real `hitl` job that had run 6 times and once
opened a real draft PR — the only job producing the product's actual end state (a
human-mergeable change, not a benchmark grade) — went dark until the plan shape implements
hitl (PRD.md:1944-1948). The other 7 legacy specs stay readable but not runnable; `soft-green`
lost nothing since it was never implemented beyond declaration (PRD.md:1950-1951).

Deliberately **not decided** by this deletion: how `hitl` and `soft-green` come back. That is
left to Layer 3, with two constraints recorded for the rung to inherit: a rubric close judged
by the worker is self-consistency in a judge's coat, so `soft-green` needs a judged-floor
analog first; and merge stays human forever (PRD.md:1955-1960). Until Layer 3 rules on this,
the plan path admits `green` only — declaring `soft-green`/`hitl` is a `request-red`
(PRD.md:1962-1963).

Also cleared out in the same change: config-v1 (the drafted-workflow-config surface, its
knobs, and the rules extractor) is fully gone, not merely declared dead, though the fence/
secret primitives and worker tool menu it housed are kept (PRD.md:1969-1975). This was
landed as its own change, before the staged close, honoring the standing rule that landing two
levers in one diff makes any resulting delta unattributable (PRD.md:1976-1977).

## 3. Reuse's goal stated, the machinery inventoried (unbuilt)

hamr then stated reuse's goal directly: *"user can choose workflow for similar job and it
would reuse the same plan and self-heal insteaf of starting from scratch"* — restating the
product's founding claim that a plan is a persistent, ledger-attributed artifact
(PRD.md:2062-2074). What existed at the time (2026-07-27): a green run's plan gets persisted
to `bridge-<job>.json` with its spec hash and minting green, but **nothing read it back** —
a file, not a mechanism. Self-healing *within* a run existed (failed-step retry, close-fix
loop); self-healing *across* runs did not exist in any form — a reused plan would either work
or the run would stop (PRD.md:2082-2089).

Eight open questions were inventoried, deliberately left unanswered until the building rung:
storage and its relationship to the ledger; keying/matching ("similar enough" — the hardest
item, ruled to mean same shape never same instance, to avoid the bridge becoming a
memorization-auditable lookup table); who selects (user, agent, or shell); loading and
re-validation (a stored plan always re-enters the same validator); adaptation ("the
self-heal" — bounded, since unlimited revision launders thrash as adaptation, per the
standing replan-ceiling doctrine); demotion (a green graduates a bridge to candidate, a
failure demotes it, not defends it); attribution (the ON/OFF ledger contrast); and the scout's
role under reuse (unmeasured) (PRD.md:2091-2115). Two conditions were flagged as still
awaiting hamr's ruling: graduation-to-candidate-with-demotion, and "same job" meaning same
shape (PRD.md:2117-2123).

The evidence available at the time was thin by design: U run 1 greened a job cold
($2.21 of $5, 8.9 min of 30) with a self-composed three-step plan and saved the first bridge;
U run 2 (same job, same seed) drafted a materially different plan but was killed by an
operator tooling limit, unread, and yields no comparison — a probabilistic worker drafting
differently twice is expected, not evidence of quality difference; more than one valid bridge
likely exists for a given job (PRD.md:2127-2132).

## 4. Design frozen, pre-probe pre-registered

The inventory's eight items were subsequently answered in full in a dedicated design record
(`docs/02-features/2026-08-01-layer-3-reuse-design.md`, decisions R1, R2, D1–D9), signed by
hamr verbatim: *"all agreed, lock in and we will validate with pocs these assumptions and
change as needed"* (PRD.md:2447-2455).

The two previously-unruled conditions were settled:
1. **Graduation/demotion (R1/D6):** only a green writes the bridge. An adapted run that greens
   becomes the bridge's next version (run-as-executed, prior versions kept); a red leaves the
   bridge untouched and marks a demotion. Status is coarse — CANDIDATE at one green, PROVEN at
   greens on ≥2 distinct patients, a red on a proven drops it back to candidate. There is
   deliberately no probability score: n=1 is an anecdote either way, and a percentage from 2–3
   runs is fake precision (PRD.md:2459-2465).
2. **"Same job" (R2):** same **shape**, never same instance — two jobs match when their close
   stages are the same kind of inspection, never merely because they share a patient
   (PRD.md:2466-2468).

The pre-probe gating the machinery was frozen at
`docs/03-logs/experiments/REUSE-PREPROBE-PREREG.md`: three arms (cold / readable lineage /
mechanical start), n=3 each, sonnet, scout on, $1 hard cap, on a cross-patient TYPES pair. No
inheritance machinery would be built before this probe read, and a follow-up real-execution
run would fire only if the drafts differed, and only on hamr's word (PRD.md:2470-2475). "Change
as needed" was scoped as amendment discipline, not license — POC/pre-probe results amend the
design record by dated addendum, never silent rewrite, and a frozen rule is never loosened
after a number exists (PRD.md:2477-2479).

## 5. Current state: the lift contrast is retired, reuse is re-aimed at a template

The frozen lift-contrast experiment (reuse-ON vs forced-cold) was never run — it was
**retired**, on a $0 archive read (F88) taken before any paid fire, on hamr's challenge that
the rung carried more scaffolding than it moved outcome, authorised verbatim: *"yes, write the
finding and park it in the prd"* (PRD.md:3488-3490).

**What the read settled:** the only payload a TYPES bridge can transfer is the plan **shape**.
Two gate rules already in place (`check-placement`, `check-shed`) made the losing shapes
inexpressible, so the cold drafter now produces the winning shape 10/10 with no bridge at all.
The frozen experiment would have paid $15–25 to measure a difference a $0 validation rule had
already erased — retired because its premise expired under the project's own fix, not because
it failed (PRD.md:3494-3502). Moot as a consequence: an empty job-B slot and a screen-clause
tension, neither needing a ruling while the experiment they gated stays retired
(PRD.md:3505-3507).

**Parked, not deleted** (on branch `layer-3-reuse`, off the critical path): the LLM
`selectBridge` call and its pin/shortlist/refusal protocol; promotion counting
(candidate→proven); and the demotion table and casualty rows. All three exist to answer
"which stored plan should this run start from" — a question that only earns its keep when
stored plans differ in ways that matter, which F88 showed they no longer do on this genre. The
code is proven working (F73) and stays where it is (PRD.md:3509-3519).

**Kept:** storage plus **pin** — the user names a stored workflow and re-runs it. This needs no
selector and no ledger, both halves already exist, and matches hamr's own framing of the
honest user need: *"user just wants to run the same workflow regardless"* (PRD.md:3521-3525).

**What replaces the contrast (specified, not fired, awaiting hamr's freeze): template-only
reuse.** Today the planrunner hands the drafter the newest plan verbatim, patient prose
included — one example bridge carries ~1,400 characters of patient-specific literals. The
proposed replacement strips the prose and carries only what the gate does *not* already set:
rounds, tools, scope, attempts, model tier, and the iterate sentence. This is the one reuse
hypothesis still standing and it has never been tested; it needs a frozen design and hamr's
signature before any money moves (PRD.md:3529-3536).

**Scope of the claim:** genre-bound to TYPES, n=10 post-rule, 6 of those on one patient. This
addendum retires an experiment, never the inheritance hypothesis itself — a later genre with
shape variance the validation gate cannot close could reopen reuse with a live question, and
the parked selection/promotion/demotion machinery is exactly where it was left
(PRD.md:3540-3543).

**Sequencing:** Layer 3 no longer blocks the roadmap. Close-authoring (the close becomes a
user-declared catalog stage rather than an assistant-scripted one) is the next rung; softgreen
and hitl follow it, since hitl's close is itself an operator declaration
(PRD.md:3547-3550).
