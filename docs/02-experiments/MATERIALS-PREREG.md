# Pre-registration — the materials/metering probe set (T1 · T2 · P1 · U0)

**Frozen 2026-07-26, before any number exists.** Four probes that decide the SHAPE of the
v1.27 course correction (T · A · P · U) before a design record is written or a line is built.
Authorised by hamr: *"we may need to run small experiments first for T, P, U to decide
fitting shape."* Total ceiling **$3**. Two probes are $0.

**What is being decided.** hamr's framing: the agent is handed a bill of materials up front
(time, money, rounds, attempts, verbs), allocates it across the bridge it designs, and the
ralph loop meters actual consumption against that declaration and informs the planner. The
open questions are (a) can a rate even be quoted, (b) does the agent's allocation respond to
being given materials at all, (c) does it reach for a wider verb palette, (d) can U run on a
one-sentence goal with zero operator-authored checks.

**Standing rules in force.** Provider-red rows are casualties, never evidence (the BA-18
timeout guard is wired). Unpriced rounds are excluded, never `?? 0` (F6). Worker/drafter model
= `claude-sonnet-5` (existing-scaffolding rule). n=1 on a nondeterministic worker is an
anecdote — every model-facing arm runs n=3. Two should-differ conditions producing identical
output is a FINDING, not noise.

---

## T1 — the exchange rate ($0, archival)

**Question.** What does one worker round cost, in dollars and in wall-clock seconds, and is
that rate stable enough to quote back to the planner?

**Why it gates everything.** The agent can count rounds; it cannot feel a dollar or a minute.
If no quotable rate exists, the "inform" half of the materials design is unbuildable in those
units and must be redesigned — this probe can kill a third of the design for free.

**Data.** Every `worker-round` row in the 264 archived spines under
`~/PycharmProjects/bareloop-patients/*-bareloop/`. Fields: `costUsd`, `pricing`, `phase`,
`ts`, `usage`.

**Method.** Per phase (`scout` / `plan` / `step:*` / `fix`): median and IQR of `costUsd`, and
of the wall-clock delta between consecutive rounds *within the same attempt*.

**Confounds to audit BEFORE reporting (named now, so they cannot be discovered conveniently
later).**
1. **Inter-round `ts` deltas include non-model time** — a gap that spans a close or a check is
   not a model round's duration. Deltas crossing a `check-run` / `close-verdict` / `step-start`
   row are excluded from the seconds figure and counted separately.
2. **Unpriced rounds** (`pricing !== 'priced'`) are excluded from the cost figure and their
   count reported (F6 — never laundered to zero).
3. **Native/clipipe rows** are excluded — a native turn is priced only at session close (F48),
   so mixing surfaces corrupts the rate.
4. **Hung rounds (BA-18)** — a delta of >5 minutes is reported separately and never folded
   into the median, or three job-#5 hangs would define the "typical" round.

**Frozen readability rule.** If, for the execute phase, the IQR of either axis spans more than
**10×** its median, the rate is declared **UNQUOTABLE in that unit** and reported as such —
the materials design must then express that axis differently (or drop it). No massaging, no
switching to a tidier statistic after seeing the spread.

---

## T2 — does the allocation respond to materials? (~$1, draft-only, n=3/arm)

**Question.** Given a time and money budget plus T1's rate, does the planner allocate
differently than it does today?

**Arms.** Same job spec, planner call only, no execution.
- **A (control)** — today's plan prompt: rounds bound only.
- **B** — same, plus a wall-clock budget, a money budget, and T1's per-round rate.

**Read.** (i) Are the emitted plans identical across arms? (ii) Does the allocation *shape*
change — step count, total declared rounds, and the distribution across steps.

**Frozen decision rule.** Identical plan output across arms at n=3 ⇒ **the variable is not
wired into its reasoning; the "inform" arm STOPS** and the materials design ships as caps
only, no feedback channel. Any systematic shape change ⇒ the arm proceeds to design.

**Stated limit (v1.26's lesson, applied up front).** This measures ALLOCATION, on the plan
surface. It cannot show that a materials budget improves an OUTCOME. Every T2 claim carries
"…in the drafted plan" and may not be quoted without it.

---

## P1 — does it reach for the wider palette? (~$1, draft-only, n=3/arm)

**Question.** Offered the full four-component catalog, does the agent grant itself any of the
verbs plan-v1 currently withholds (F56)?

**Arms.** Same job spec, planner only.
- **A (control)** — today's six: `read grep write edit recall get`.
- **B** — the twelve-verb catalog (Write: `remember forget write-gate` · Select:
  `recall impact` · Compress: `assemble compress summaryWindow` · Isolate:
  `stash peek evict scope`), one line of description each, no strategy advice.

**Read.** Does any step in arm B grant a Compress / Isolate / Write verb; does step count or
shape change.

**Frozen decision rule.** **0 of 3** arm-B drafts reaching for any new verb ⇒ the palette is
offered-and-declined a second time (job #5 declined `recall`/`get` with them granted), and
**P is re-scoped from "widen the menu" to "why is it declined"** — the F19 capability-without-
strategy question, not a schema question.

**Stated limit.** Measures REACHING, never HELPING. A plan-surface probe cannot establish that
a granted verb improves anything.

---

## U0 — can U run scaffolding-free? ($0 + ~$0.50)

**(a) Does the close decompose? ($0, code.)** Read `scripts/types-close.mjs`: can its stages
(D1 gaming audit · scope audit · `tsc --noEmit --strict` · suite with executed-count floor ·
`.d.ts` emit · D3 public-API superset) be expressed as `close: [{name, cmd}, …]` per PRD v1.28?
Report per stage: standalone-runnable yes/no. **A partial menu is the expected result, not a
failure** — a stage needing the whole diff simply is not borrowable.

**(b) Does one sentence suffice? (~$0.50, draft-only, n=3.)** Replace job #5's ~400-word goal
with one sentence a user would actually say. Read: does the planner emit a **validator-green**
plan.

**Frozen decision rule.** ≥2/3 validator-green ⇒ one-sentence input is viable for U. ≤1/3 ⇒ U
keeps a fuller goal, and that is recorded as a **product limit** (the user must say more than
one sentence), never quietly patched by re-expanding the goal until it passes.

**Prior, stated so a pass is not over-read.** F52/F53 found that withholding method and target
did not degrade planning — but on TESTGEN only. This is the cross-genre check of that, and a
pass replicates a known result rather than establishing a new one.

---

## Order and stop conditions

**T1 first** (free, and it gates T2's arm B). Then **U0(a)** (free). Then **T2 · P1 · U0(b)**
under the $3 ceiling, only with hamr's go on spend.

**Instrument stop.** Any probe whose result depends on a number its instrument cannot see is
STOPPED and reported as unread — never estimated. Two consecutive provider-reds on the same
arm halt the set (casualty rule).

---

## Amendment 1 — 2026-07-26: the S0 scout-off arm (added AFTER the freeze, before any number)

**Why it was not in the original freeze.** F59 was discovered while building this probe set's
driver: the scout returns nothing on 15 of 18 archived runs, so the planner drafts blind — and
**3 of the 5 archived greens had a zero-byte scout.** hamr's instruction, verbatim: *"try
it/confirm without notes and if it doesn't make a diff then remove it."* This amendment is
dated and appended; the original rules above are unchanged and none is loosened.

**The question.** Does the repository survey transmit anything the goal text does not already
carry? It costs ~12.34% of run spend (F55). If it changes nothing, the honest move is to
DELETE the phase, not to keep the fix.

**Design — 2×2, because the confound is real.** Job #5's goal is ~1,910 characters and already
enumerates files and requirements; against a goal that rich, ANY survey would look redundant.
So the arm crosses goal richness with scout presence:

| arm | goal | scout |
|---|---|---|
| A1 (control) | full (1,910 chars) | ON |
| A2 | full | **OFF** |
| A3 | one sentence | ON |
| A4 | one sentence | **OFF** |

A3/A4 are the sharp cell: with a one-sentence goal the survey is the ONLY possible source of
repository facts. A2-vs-A1 alone could only ever show "the scout is redundant *to a goal that
already says everything*" — which is a statement about job #5's goal, not about the scout.

**Frozen PRIMARY metric.** For each plan: does any step reference a repository specific — a
file path or symbol name — that does **not** appear in that arm's goal text? This is the
operational test of transmission: a blind planner cannot name what it was never told.

**Frozen decision rule.**
- **A4 ≈ A3** on the primary metric (n=3 each) ⇒ the survey transmits nothing even when it is
  the only possible source ⇒ **recommend DELETING the scout phase** and returning its ~12%.
- **A3 materially above A4** ⇒ the survey does transmit; the phase stays and the fix earns its
  keep. Whether transmission helps the OUTCOME is a separate question this probe cannot answer.
- **A2 ≈ A1 but A3 > A4** ⇒ the scout is redundant to a rich goal only — report as such; the
  delete recommendation does NOT follow, and the finding becomes an argument about goal
  richness (which is U0(b)'s territory).

**Stated asymmetry, so the result cannot be over-read in the flattering direction.** This arm
can support a strong NEGATIVE ("the survey transmits nothing") because absence of transmission
is directly observable in the plan text. It cannot alone support a POSITIVE ("the scout
helps") — a plan that names real files is not thereby a better plan, and only an outcome
battery could establish that. Recommending deletion is therefore in scope for this probe;
recommending investment is not.

**Cost.** Six arms (A1–A4 plus T2-B and P1-B, which reuse A1 as their control) × n=3 = 18
drafts plus one scout ≈ $1.00, inside the $2.50 ceiling with the $0.39 pilot folded in.
