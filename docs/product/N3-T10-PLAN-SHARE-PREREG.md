# T10 — plan-share analysis (FROZEN 2026-07-25, before any number; $0, archival)

**Why.** F51–F54 killed the readable-lineage arm on four axes. Layer 3's remaining arm is
MECHANICAL plan reuse. Before building it, one question decides whether it can matter at all:
**how much of a run is the PLAN?** Inheritance of plans can only pay where plans are costly,
variable, or a failure source. This is answerable at $0 from 115 archived spines — no new
spend, real uncrafted data, and it can refute the premise or support it.

**Pre-registered questions + metrics (fixed before computing).**
- **Q1 — spend share.** Of a run's total metered `worker-round` spend, what fraction is the
  `plan` phase (drafting + redrafting) vs SCOUT vs EXECUTE/fix? Metric: mean and max plan
  share across runs that reached at least one executed step.
- **Q2 — plan as a failure source.** Across all archived runs, how many terminated for
  PLAN reasons (`plan-red`, plan validation exhausted) vs EXECUTION reasons (cap-halt,
  check-red, close-red, escalation)? Metric: counts by terminal category.
- **Q3 — redraft frequency.** How often does the first draft fail validation and force a
  second drafting call? Metric: rate of `plan-validate ok=false` on the `-1` phase.

**Frozen interpretation rule (stated before any number).**
- **Plan share < ~2% of spend AND plan-caused terminations rare (<10%)** → mechanical plan
  inheritance addresses a NEGLIGIBLE surface: it cannot pay for itself on cost or reliability,
  so its only possible justification is an OUTCOME lift, which F51–F54 give no reason to
  expect (cold plans already at ceiling). That is evidence toward a Layer 3 STOP.
- **Plan share material (>10%) OR plan-caused terminations common** → the surface is real and
  mechanical reuse is worth building and testing on outcome.
- Anything between is reported as-is, not rounded to whichever story is tidier.

**Limits, stated up front.** Archival and correlational: it measures the surface a plan
occupies, never whether a better plan would produce a better outcome. It cannot promote the
mechanical arm; it can only show whether the arm has room to matter. Spines come from job
families #2/#4 and the Layer 2 acceptance runs — not a general sample of all possible jobs.
