# Agreed build list — 2026-08-23

The running list of what we decided to develop out of the SCALING_AGENTS_PRIMITIVES review,
with the shape agreed so far and what is still open. This is the handoff surface: an agent
picking up any item reads this first, then the layer context in
`../SCALING_AGENTS_PRIMITIVES.md` and the wrinkle detail in
`2026-08-23-behavioral-wrinkles.md`.

Nothing on this list is built. Status words are exact: AGREED = hamr said go, shape settled
enough to start designing. OPEN = agreed in principle, shape not settled. PARKED = arbiter
territory, waiting on hamr's explicit go.

---

## 1. The bench — AGREED (2026-08-23)

**Shape agreed.** Four frozen jobs. We freeze the expected OUTCOME, not a score.

| Row | Expected outcome | Question it answers |
|---|---|---|
| G1 | greens | does the loop still convert at all? |
| G2 | **never greens** | is the hard case still hard? |
| G3 | worker cheats, close catches it | does the close still catch cheating? |
| G4 | cap-halt → replan → green | does recovery still work? |

- **RULE — a bench row freezes the CONFIG, never just the job.** A row that names only a job
  carries no information: `aurora-testgen` never greens (0 of 43) while
  `aurora-testgen-l2accept` — the same job under the Layer-2 shape — greened 3 times. Without
  a frozen config, "it greened" cannot be read as anything. This is the sharpest thing the
  Q2 archive read produced; it is a rule, not rationale.
- G2 is load-bearing. A sudden green there is a QUESTION (model improved, or our ruler
  broke), never a win. A bench where everything passes teaches nothing.
- Every row carries the F-number that minted it.
- The set grows: a real failure that gets fixed earns a row so it cannot recur silently.
- It needs a named owner. An ungoverned growing set rots.
- Runs at three moments only: worker/judge model change; close-authoring or validation-gate
  change; before a release. Never per commit.
- Tiering: Tier 0 = $0 archive replay, always first, every change. Tier 1 = G1 only, for
  loop changes. Tier 2 = all four, for model swaps / close-authoring / release.
- Cost is UNMEASURED and gets derived from the archive before anyone quotes a number.

**Open before build:** items Q1–Q6 below. Q1 and Q2 block; the rest can be answered during design.

## 2. Run behavior summary — **BUILT 2026-08-24**

One report-only block at the end of every run, built entirely from the spine. Gates nothing,
changes no verdict, mints no red.

```
94 tool calls · 61 read, 28 grep, 5 recall
17 exact repeats (~18%)
```

Solves: we can see what a run cost, never what it wasted. Also the cheap first slice of the
five-minute-replay test (item 4).

`runBehaviour`/`formatBehaviour` shipped in the library, `scripts/behaviour-readout.mjs` for
archived runs, `BEHAVIOUR` block wired into `run-u.mjs`'s tail print, printed live at the tail
of u-run `mt7g7b68` (F114 §1) — see `docs/product/PRD.md` addendum v1.80 item 2/TODO item 1.

**Answered:** Q7 — surface only, no spine record (a new record type is a new writer every
spend instrument must account for). Q8 — ships in the library, documented in
`bareloop.context.md`.

## 3. Model names in the signed spec — PARKED

Worker and judge model names become signed-spec fields. Change a name → hash flips → runner
refuses until re-signed. Changes what the runner accepts, so arbiter territory: hamr's
explicit go, nothing before it.

## 4. Generic run replay — AGREED as a gap, not yet scoped

Their test: *if you cannot replay a failed run in under five minutes, you are not production
ready.* We fail it. The data is all on disk (spine, gate audit, ledger) but there is no
generic replay tool — only per-battery readouts in `scripts/`. Reconstructing an arbitrary
failed run means hand-slicing JSONL.

Item 2 is the cheap first slice. A full tool is not yet proposed or scoped.

## 5. Prompt-commit shape — AGREED, cheap

A required message shape for commits that change a prompt register: what failure caused the
change, what it addresses, what it corrects.

Scope is knowable: the registers are named exported consts (`*_SYSTEM`, `*_PROMPT`,
`*_STRATEGY`, `PERSONA_*`) across roughly 14 files in `src/` — `authorflow.js`,
`authorscout.js`, `cardauthor.js`, `plan.js`, `tools.js`, `readshim.js`, `judged.js`,
`declaredclose.js`, `validate.js`, `kinds.js`, `text.js`, `planrun.js`, `calibrate.js`,
`index.js`. Step one is pinning that inventory in one place; today it is spread out.

**Open:** Q9 (enforcement touches CI, which is ask-first).

## 6. Stale-index check (W4) — AGREED as a wrinkle to fix

Nothing checks whether the litectx index is older than the tree. Stale index manufactures
phantom defects; flipping `embeddings` on an existing index computes no vectors at all. Both
fail silently as a clean answer. Their one real production incident was this class.

Cheapest first version: report-only preflight comparing index state against HEAD. $0, gates
nothing, so not arbiter territory. Detail in the wrinkles doc, W4.

**RETIRED 2026-08-24 (F112).** The $0 measurement the PRD's v1.78 correction demanded was run:
all 12 archived patient indexes recomputed against their trees — 1,997 files, 13 stale (0.65%),
0 vanished. The stale files are the worker's own late edits, already handled in-run by
`serveStale` (F108). The motivating "phantom defects" story does not appear in this archive.
Do not build.

---

## Open questions (answer before handoff)

**Q1 — which four patients?** (BLOCKS the bench.) Candidates from existing work: litectx
(job #1/#2), bareagent-u, aurora, testgen. Patients are always local copies, never clones,
and choosing them is a real decision, not a detail. Reuse existing patients or prepare new?

**Q2 — ANSWERED 2026-08-23 by $0 archive read** (227 spine files, 32 patient dirs,
`~/PycharmProjects/bareloop-patients/*-bareloop`). Three findings, one of which changes the
bench's design:

- **A reliable non-greener exists.** `aurora-testgen` (the F38 TESTGEN battery, 2026-07-16):
  **43 valid rows, 0 greens**, plus 12 provider-red casualties excluded. Median spend ~$0.9,
  range $0.23–$4.78. As a canary this is exactly what G2 needs.
- **The MECHANISM is not established.** 0-of-43 says the job never passes; it does not say
  the worker "stalls semantically." F38's actual semantic-stall observation — rich feedback
  held, nothing written — is ONE cell, and F38 itself labels it an anecdote under the n=1
  rule. So G2 is honestly "the known-unwinnable row", mechanism-agnostic. Do not name it
  "the semantic row" in the bench; that claims more than the archive supports.
- **The same job GREENS under a different config.** `aurora-testgen-l2accept` greened 3 of
  its rows (2026-07-22, $4.73–$6.48) under the Layer-2 shape. **Therefore G2 must freeze the
  CONFIG, not just the job.** A bench row that only names a job is meaningless — "it greened"
  would carry no information.
- **The baseline is one month stale.** Those rows ran on 2026-07-16 code. Every expected
  outcome has to be re-established at current code before it can be frozen. That re-baseline
  is a PAID run, not free, and it is the bench's real first cost.

Rough Tier 2 sizing from the same read (ESTIMATE, not a quote): red rows ~$0.4–$4.8, green
rows $4.7–$6.5 — so four rows at n=1 plausibly $10–25, before the re-baseline. Q4's ceiling
should be derived properly, not taken from this line.

**Q3 — n per row. OPEN. No proposal is adopted** (hamr's explicit instruction: this is a
discussable limit, not a settled rule). Input only, from the same $0 archive read:

| Job | Green rate | Date |
|---|---|---|
| `aurora-testgen` | 0 / 43 | 2026-07-16 |
| `aurora-u-spawner-types` | 6 / 8 | 2026-08-19 (most recent) |
| `mailproof-fix` | 10 / 20 | 2026-07-15 |
| `bareagent-u-types` | 1 / 6 | 2026-08-06 |
| `aurora-fix` | 4 / 4 | 2026-07-16 |
| `aurora-testgen-l2poc-check-api` | 3 / 3 | 2026-07-21 |

**CAVEAT, load-bearing, do not drop it:** those slices are per job per DATE, and a single
date still mixes arms and configs. They are indicative, not proof. Provider-red rows are
excluded as casualties. Anyone quoting these numbers without this line is quoting something
they have not measured.

What the numbers imply, stated as a tension rather than an answer: against a 0-of-43 base
rate a single green is real signal, so n=1 may suffice for G2; against a 6-of-8 base rate a
single red flags ~25% of the time for no reason, which is a cry-wolf problem rather than a
rigour problem. Our own doctrine also says n=1 on a nondeterministic worker is an anecdote
either way. One unadopted idea on the table — n=1 with a confirm re-run only on a row that
surprises us — is recorded so it is not re-invented, NOT because it was chosen.

**Q10 — can Tier 0 pre-screen the re-baseline?** (raised by session `new-softgreen`,
2026-08-23.) The stale baseline is the bench's real first cost: every expected outcome must
be re-established at current code before it can be frozen, and that is paid. Before anyone
quotes a ceiling, scope whether the $0 archive replay can tell us which of the four rows
actually NEEDS a paid re-baseline and which can inherit its archived outcome. Answering this
may cut the bench's first bill substantially, or may prove it cannot — either is worth
knowing before Q4 is set.

**Q4 — money ceiling for Tier 2.** Threshold-setting is arbiter territory, so hamr sets it.
It cannot be picked from a small observed sample.

**Q5 — signing.** Bench jobs run from signed specs. A frozen bench means frozen hashes; any
spec edit flips them and needs re-signing. Does a bench run need a fresh signature each time,
or does one signature stand for the frozen set?

**Q6 — where results live.** A new bench log, or FINDINGS entries, or both? A row that
changes outcome is a finding by definition.

**Q7 — ANSWERED 2026-08-24.** Surface only — no spine record (a new record type is a new
writer every spend instrument must account for).

**Q8 — ANSWERED 2026-08-24.** Ships in the library; documented in `bareloop.context.md`.

**Q9 — enforcement of the prompt-commit shape.** Convention only (a documented rule), or a
check? A check means touching CI, which is ask-first. Also: convention-only rules are the
class this programme keeps re-learning ("a frozen rule without a wired detector is prose").
