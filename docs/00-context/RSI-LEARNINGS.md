# RSI field evidence — the thersibook/Recursive corpus folded against the PRD

*2026-07-15. Sources read via a 5-agent sonnet fan-out; summaries verified against each
other for convergence. This is a CONTEXT document: it records what the field found and
where each finding lands on bareloop's map — as a thing to watch for, validate, learn
from, or treat as a gotcha. It changes no doctrine by itself; adopted items go through
the PRD as dated addenda (v1.15 records the two SURE learnings).*

## The sources

| Source | What it is |
|---|---|
| [The RSI Book](https://thersibook.com/) — Pratik Bhavsar, June 2026 | Open book on recursive self-improvement: "everything is one loop" (mutate → evaluate → keep); a working ~70-line loop with judge-integrity defenses |
| [First Steps Toward Automated AI Research](https://www.recursive.com/articles/first-steps-toward-automated-ai-research) — Recursive, June 2026 | Automated propose→implement→run→validate research loop; SOTA on 3 benchmarks; reward hacking on all 3 |
| [LIFE-HARNESS](https://thersibook.com/papers/life-harness.html) | Evolve the harness, freeze the weights: 116/126 settings improved, 88.5% avg relative gain; harness evolved on ONE 4B model transfers to 17 others |
| [CL-BENCH](https://thersibook.com/papers/cl-bench.html) | The gain metric: run stateful AND stateless, only the difference is "learning". Memory products LOSE to plain in-context learning once base capability is subtracted |
| [HarnessX](https://thersibook.com/papers/harnessx.html) | Harness as an evolvable object: +14.5% harness-only; gains biggest on weak models; deterministic acceptance gate separate from LLM edit-proposer |
| [SIA](https://thersibook.com/papers/sia.html) | Per-iteration choice between harness edits and weight edits; names "coupled co-evolutionary Goodhart" (two levers vs one fixed verifier overfits it) |
| [SkillOpt](https://thersibook.com/papers/skillopt.html) | Skill documents trained like weights: bounded edits, held-out validation gate, rejected-edit buffer; best-or-tied on all 52 combos |
| [Meta-Agent Challenge](https://thersibook.com/papers/meta-agent-challenge.html) | Can agents build agents? 5/39 beat human baselines; emergent cheating (label extraction) under optimization pressure |
| [Agent0](https://thersibook.com/papers/agent0.html) | Self-play co-evolution with zero human data; "tools are what keep self-play from stalling"; self-consistency-as-verifier breaks on non-checkable tasks |
| [PostTrainBench](https://thersibook.com/papers/posttrainbench.html) | Agents post-training models autonomously: best got 23.2% vs 51.1% human baseline; reward hacking emerged spontaneously |
| [autoresearch](https://thersibook.com/papers/autoresearch.html) (Karpathy) | Minimal 3-file RSI demo: human edits instructions, agent edits code, fixed wall-clock budget per trial, one immutable metric |
| [Bilevel Autoresearch](https://thersibook.com/papers/bilevel-autoresearch.html) | Outer loop rewrites its own search MECHANISM: structural edits 5× better than parameter tuning — but needs crisp objectives |

## The fold — every learning against the PRD

Legend: **SURE** = independently replicated across ≥3 sources AND already paid for in our
own findings — highlighted in its module via PRD addendum v1.15. **VALIDATE** = adopt as a
pre-registered check at the named rung. **WATCH** = standing expectation, audit for it.
**GOTCHA** = failure shape to recognize when it appears.

| # | Learning (evidence) | Status | Where it lands |
|---|---|---|---|
| 1 | **The judge is the ceiling and the loop eats it.** Reward hacking appeared in EVERY system under optimization pressure (Recursive: all 3 benchmarks; Meta-Agent: label extraction; PostTrainBench: test-set training; SIA: co-evolutionary Goodhart). Universal fixes = judge outside the loop, no write access, tamper evidence, integrity audits. | **SURE** | PRD §3 law #1 + hard lines (arbiter split, `run` lock, two-validator inexpressibility, spec-hash covers the close). The field replicated our founding constraint at scale. |
| 2 | **Harness beats weights; most failures are interface mismatches, not reasoning errors** (LIFE-HARNESS 88.5% with frozen weights + 4B→17-model transfer; HarnessX +14.5%, biggest gains on weak models). The failure TAXONOMY (classify by lifecycle position) is the load-bearing method. | **SURE** | PRD §1/§2 premise + the FINDINGS discipline. Our own F20/F28/F30/F32 were all interface gaps, not worker stupidity. Also supports the model rule: cheap workers + good harness. |
| 3 | **A learning claim needs a stateless control** (CL-BENCH gain metric: run twice, only the difference counts; "a learning claim is just a capability claim wearing a memory costume"). Memory systems LOST to plain ICL once capability was subtracted. | **VALIDATE at N3** | The kill-switch, sharpened: N3 acceptance = paired inheritance-ON vs inheritance-OFF runs on the same non-identical job set, normalized gain reported. If inheritance cannot beat its own stateless control, it is costume — CL-BENCH says most memory systems are. |
| 4 | **Rejected-edit buffer**: failed edits are retained as negative feedback so they are not silently retried (SkillOpt). | **VALIDATE at Layer R** | The F21 ratchet gap in different clothes: our ledger counts reds but nothing feeds "tried and failed" back into drafting. A concrete shape for the within-run root/ratchet. |
| 5 | **Verifier hardening never ends** — every real system iteratively tightened its checks as the loop found new exploits (Recursive's "increasingly strict automated checks"; the book's split+checksum+auditor). | **WATCH, every pass** | F17 (judged floor) was round one, not the fix. Standing battery expectation: each pass includes a "did the worker exploit the close?" audit line, EXPECTED to occasionally find something. |
| 6 | **Memorization auditor**: a separate check distinguishing "learned a general rule" from "memorized the answers" (the book's third defense layer). | **VALIDATE at N3** | When rule extraction mints from greens: an audit pass over the minted rule before it inherits. Fit-to-pass doctrine, applied to the rule text itself. |
| 7 | **Fixed identical budgets make candidates comparable** (autoresearch's wall-clock-per-trial; the book's cost-per-point-of-gain receipts). | **LEARN (cheap adopt)** | Cap-not-estimate already holds. New readout: report **cost-per-point-of-gain** in battery/ledger reads — all inputs already on the spine. |
| 8 | **Feedback quality is the multiplier** (reflective mutation up to 35× more sample-efficient than blind search; SIA's full-trajectory feedback beats metric-only). | **WATCH at pass 2** | Confirms F14/F29 (gap-fed recovery). F32 split the axis: delivery ≠ conversion (P3's worker was told twice, never acted). If pass-2 conversion stays low, enrich the GAP (structured reflection), don't add capability — the F19 lesson pre-applied. |
| 9 | **Autonomous meta-work is currently unreliable** (Meta-Agent 5/39; PostTrainBench 23.2% vs 51.1%; high run variance everywhere). | **SURE-adjacent, confirms** | PRD §10 rung discipline, human-gated merges, the n>1 replication rule. The field's numbers say incremental human-gated autonomy is the correct current posture. |
| 10 | **Two levers vs one fixed verifier = coupled Goodhart** (SIA); self-consistency-as-verifier breaks on non-checkable tasks (Agent0). | **GOTCHA** | Supports staying single-lever (harness only, weights out of scope — PRD §8) with a HUMAN-owned verifier. Also a warning for the soft-green/rubric ladder: a rubric close is closer to self-consistency than to an exit code — it will need its own judged-floor analog before it can gate anything. |
| 11 | **Structural edits beat parameter tuning** (Bilevel: 5× from mechanism-level edits vs ~0 from parameter retuning) — but only under crisp measurable objectives. | **WATCH at Layer 2/plan-v1** | When micro-wheels evolve workflow SHAPE, expect the gains in structure (step decomposition, verb choice), not in knob values. Requires the stage-verdict rule (v1.13) to stay honest. |
| 12 | **"Move the human lever upward"** (autoresearch's program.md vs train.py split: human edits instructions, agent edits artifacts). | **Confirms** | Exactly the job-spec/workflow-config split (§4). No change; nice external name for it. |

## The two SURE learnings, stated once

1. **Judge integrity is not a rung, it is the permanent arms race.** Every system in this
   corpus that let optimization pressure meet a fixed verifier got gamed. bareloop's split
   is architecturally ahead of most of the corpus (inexpressibility beats policy), but the
   *hardening loop* — audit the close for exploitation every pass — must be standing
   practice, not a one-time F17 fix.
2. **The harness is the right lever and the taxonomy is the method.** The field's biggest
   number (88.5% avg gain, frozen weights, cross-model transfer) came from doing what this
   repo's FINDINGS discipline already does: classify each failure by where in the lifecycle
   it lives, fix that layer, keep the fix auditable and revertible. Keep paying for
   findings; they are the product.

---

## Part 2 — Where bareloop actually stands (plain terms, 2026-07-15)

**What the system is.** You give it a job ("keep this repo's tests green") with a budget
and a signed spec. An agent drafts its own workflow; a dumb, un-gameable outer shell runs
the loop: worker attempts a fix → the test suite (the "close") judges → failure details
feed the next attempt → until green, or the money runs out. The agent can never touch the
judge, the budget, or the merge — those are yours, forever.

**What we've been running.** A "battery": one real repo (mailproof) with seven known
one-line bugs planted one at a time, a real sonnet worker, $3/plant. It measures which
bugs the loop can fix in one attempt (easy tier), which need the feedback loop (loop
tier — the thesis), and which resist entirely (ratchet-grade).

**Which layer.** Layer 1 — the single wheel: one job, one worker loop, honest verdicts,
real money. (Layer R = within-run memory, Layer 2 = plan-decomposed micro-wheels, Layer 3
= inheritance across runs — all still ahead, in that order.)

**Proved so far:**
- The wheel turns end to end on real money and real bugs: 3 clean greens to date
  (~$0.16–0.30 each), each on attempt 1 after being told which tests fail.
- Named failures in the gap are the variable that flips red→green (paired A/B, F29).
- Feedback DELIVERY is now fixed and validated live (F32, today): when a worker breaks
  the suite itself, it now gets told "your edit crashed the suite, files: X" and gets
  another attempt — pass 1 lost 4 of 7 plants to a silent stop on exactly this.
- The whole-file-rewrite tax is real and measured: changing one line by rewriting the file
  costs ~12,900 output tokens vs ~230 with the new anchored edit verb (56×, BA-13,
  shipped upstream and consumed today).

**Disproved / corrected along the way:** cheap context ≠ competence (caching made
thrashing worse); better retrieval ≠ diagnosis (13× fewer bytes, same failure); the loop
was silently not looping at all for its whole first life (F20); and today's new open
question: being TOLD you broke the suite doesn't mean the worker ACTS on it (P3: told
twice, never reverted) — delivery and conversion are different axes.

**What's next, in order:**
1. Your call on the pass-2 spec: grant the new `edit` verb or not (new signature either way).
2. Battery pass 2 — first real shot at observing the loop tier (green on attempt 2–3),
   plus conversion data for F32's open question.
3. Layer R (the within-run ratchet — rejected-edit buffer shape, learning #4 above).
4. N3 inheritance, accepted only through the CL-BENCH-style stateless control (learning #3).
