# adaptlearn ↔ cybernetics — the frame, registered

**Status:** theoretical frame, not a finding. Registered 2026-07-10 **before** the SP-3 (F17)
readout (run at g7, 61/64 cells logged, at time of writing) so its one prediction counts as a
pre-registration, not a post-hoc gloss. Sources: Wiener *Cybernetics* (1948), Ashby *Design
for a Brain* (1952) / *An Introduction to Cybernetics* (1956), Conant & Ashby (1970), Beer
*Brain of the Firm* (1972), von Foerster (second-order cybernetics), Davies *The
Unaccountability Machine* (2024). Nothing here reopens the archive verdict; the frame names
what the experiment found empirically and points at what the successor should validate.

Reading rule: the frame earns its keep only where it **predicts or budgets**, never where it
merely renames. Each mapping below is tagged `[confirms]` (doctrine already earned the hard
way), `[predicts]` (testable, see V-items), or `[budgets]` (turns a doctrine into an
accounting rule).

> **Addendum 2026-07-11** (§"The VSM ladder in full", V7–V8): registered after F21/F22 and the
> upstream-ledger feature — mappings citing those are `[confirms]` (post-hoc naming of earned
> results); the bareloop-facing items are predictions for the successor repo and count as
> pre-registration there.

> **Addendum 2026-07-13** (§"The Boolean floor", V9–V13): registered after F23 closed the
> assigned probe track. Mappings citing F5/F18/F19/F23 are `[confirms]` (post-hoc naming);
> the five V-items are new candidates, assigned by hamr, with V9 nominated first (the
> F21/F22/F23 sandbox pattern: POC here, spec consumed by bareloop).

---

## The core mappings

### 1. Ashby's Law of Requisite Variety = the F16 result `[confirms]`

Ashby: a regulator can only control disturbances whose variety it can match — "only variety
can absorb variety." F16's rewrite (masking variable is *guessability*, not worker capability)
is this law restated: a guessable regularity is a disturbance within the worker's own variety
(priors + cap-3 retries of search); an idiosyncratic convention exceeds it, so regulation is
only possible by importing variety from outside — the notes, the memory store. The boundary
map is a requisite-variety map: masked terrain = disturbance ⊆ regulator's internal variety.

### 2. Conant–Ashby theorem predicts SP-3's Q2 outright `[predicts]`

"Every good regulator of a system must be a model of that system" (Conant & Ashby 1970). A
config that reliably greens on sp3 tasks *must contain* the idiosyncratic rules somewhere —
and since the notes are the only declared path to them, the only good regulator is an
episode-wired one. Registered reading (see F17 addendum): Q1 ∧ Q2 = a Conant–Ashby
demonstration; Q1 ∧ ¬Q2 = the model got in through an undeclared channel — **search for the
leak first** (§4b precedent, learned twice) before concluding the F16 map is wrong again.

### 3. The credit-attribution gap is a channel-capacity problem `[budgets]`

Selection steering over N knobs needs ~log₂N bits of *attributable* information per decision
from the feedback channel. A bare green is ~1 bit, confounded across every knob at once —
attributable capacity ≈ 0. That is why gated-rules authored episode-recall at g0, greened,
and lost it by g1 (F16): the channel physically could not carry the which-knob signal. A
contrast pair is a one-bit channel *aimed at one knob* — it mints an attributable bit.
"Verdict admits, contrast attributes" is Shannon/Ashby: attribution requires requisite variety
in the feedback channel. Budget rule for the successor: **≥1 contrast bit per knob claimed**,
counted the way dollars are counted.

### 4. Beer's algedonic channel = cap-halt and HITL escalation `[confirms → predicts]`

In the Viable System Model, algedonic (pain/pleasure) signals bypass the management hierarchy
straight to System 5, because routine channels attenuate exactly the signals that matter most.
§5b already treats cap-halt as its own category, never folded into the verdict axis — keep
that *structural*, not just doctrinal. Successor requirement: HITL escalations must reach the
human by a path **no emergent component summarizes**; anything routed through the normal
ledger gets attenuated by whatever reads the ledger.

### 5. VSM maps the three-layer shape — and names one gap `[confirms → predicts]`

Ralph shell = System 5 (identity/policy, deliberately dumb, outside the adaptive parts).
Interpreter + worker = System 1 (operations). Gate = System 3 (audit/control). Mutation +
selection = System 4 (intelligence, facing the future). The gap Beer insists on: System 4
needs a **model of the environment**, kept current, distinct from operations — and the
environment includes *every channel property*. SP-2's provider-path non-invariance (same
model+config+notes behave differently CLI vs raw API) is that model being forced into
existence. VSM predicts it generalizes: any channel change (close wording, task framing,
scaffold) is an environment change; inherited harnesses are not presumed portable across it.

### 6. Ashby's ultrastability = the two-loop architecture `[confirms]`

The homeostat's double feedback: a fast loop (behave within current parameters) and a slow
loop (when equilibrium is unreachable, step the parameters themselves, then fully re-test).
That is within-run iteration (M2/M5) vs across-run one-knob mutation (M6) — including the
convergence conditions Ashby proved necessary: re-test under the same conditions ("mutant must
stay green and dominate on cost") and an incorruptible equilibrium detector ("the agent never
authors its arbiter").

### 7. POSIWID = the fit-to-pass doctrine `[confirms]`

Beer: "the purpose of a system is what it does." Davies builds the accountability-sink
argument on it: a structure that severs decisions from consequences. "The agent never authors
its arbiter" is sink-prevention; a confident fake green *is* a sink. M6 attempt 2 was pure
POSIWID: whatever the design intent, the system-as-built was a device for teaching the
regularity to all arms through the close channel — and it did (F14, §4b).

---

## The VSM ladder in full (Davies 2024, ch. 5 "Cybernetics Without Diagrams") — completes mapping 5

Davies' plain-English decomposition: a viable organization is five interlocking subsystems.
The block, one per step — role, Davies' key question, and where it lives in this machinery:

1. **S1 — Operations (the doers).** The front-line units that execute the mission and make
   real changes: coders, cashiers, musicians. *"What value are we creating right now?"*
   **Here:** the worker — the sealed model call inside the middle that writes the artifact.
2. **S2 — Regulation (the schedulers).** The stabilizer: anti-friction protocols and
   resource-sharing conventions between S1 units so the doers don't trip over each other —
   HR, scheduling software, "administrative rules the doers agree prevent chaos."
   *"Are the units coordinated without friction?"* **Here:** structurally absent and
   structurally unneeded in adaptlearn (one process, one S1, sequential runs — no
   "between" exists); the validator and slot rules are proto-S2 at most. bareloop's
   multi-step jobs create the first genuine S2 demand → V7 `coordination-red`, §5a.
3. **S3 — Optimization (here-and-now management).** Middle management: optimizes the
   present operation for efficiency, metrics, short-term performance.
   *"Are we running as efficiently as possible today?"* **Here:** cost ranking across
   green runs (the ledger's cost column) — legal ONLY because it never touches verdict.
4. **S4 — Intelligence (there-and-then strategy).** The outward radar: anticipates the
   environment's future — R&D, strategists, planners. *"What changes are coming that we
   must prepare for?"* **Here:** the across-run learning loops — mutation, verdict-gated
   inheritance, menu admission — adapting the harness to disturbances the current config
   can't absorb.
5. **S5 — Identity (the balancing anchor).** Defines who we are and what counts as done;
   manages the permanent S3↔S4 tension (efficiency vs adaptation). *"Who are we, and what
   is our ultimate purpose?"* **Here:** the close and the human behind it — verdict is
   identity territory, held outside the emergent part permanently ("the agent never
   authors its arbiter").

Plus two dynamics: **variety engineering** (attenuate upward, amplify the front line) and
**S5 collapse** (when identity is hollowed out to a single metric, S3 optimizes without
constraint, S4 is disempowered, and the organization becomes a blind, unaccountable
machine). Mapping 5 above used S1/S3/S4/S5; the full ladder adds three things
this project can actually use:

### 5a. System 2 is the successor's missing subsystem `[predicts → V7]`

adaptlearn never needed an S2: one process, one S1 unit, sequential runs — nothing to
coordinate (the validator and slot rules are proto-S2 at most: "administrative rules the
doers agree prevent chaos," Davies' phrase almost verbatim). bareloop's real shape — multi-
step jobs, shared store, several primitives touching one repo — creates the first genuine S2
demand: write-scope partitioning, step ordering, store-access conventions, the bareagent
Scheduler. Beer's warning, Davies' rendering: S2 failures present as *friction between
healthy units* (oscillation, contention, units undoing each other), which none of the
existing red categories name — worker-red, interpreter-red, gate-red all blame a unit, not a
coordination. Prediction: the first multi-step job will surface reds that are S2-class, and
folding them into worker-red will misattribute exactly the way counting reds without §5b
contrast did.

### 5b′. S5 collapse = the single-fitness-score smell, named structurally `[confirms → budgets → V8]`

Davies' diagnosis of Friedmanite shareholder-value: when S5's whole identity becomes one
maximizable number, S3 devours S4 and the machine goes blind. That is *precisely* the
doctrine "green gates, cost ranks — **never one fitness score** (efficiency must not negotiate
with truth)": verdict is S5/identity territory (what counts as done), cost is S3 territory
(how efficiently), and collapsing them into one scalar is the S5 collapse in miniature —
fit-to-pass is Friedmanism for harnesses. Two existing results are this mapping earned:
"improvement is nobody's goal" (the learning curve stays an observer's reading — S3's metric
is never promoted into S5's identity), and F20's honest bound (ungated inheritance looked
fine for 8 calm generations — Davies: the collapsed machine fails on *environmental shock*,
not on calm seas, so short windows structurally cannot show the cost). Budget rule for
bareloop (V8): make the collapse unrepresentable, not just discouraged — selection code takes
verdict and cost as separate arguments and no function may combine them into one scalar.

### 5c. Variety engineering, both directions — now with post-frame evidence `[confirms]`

Davies: healthy organizations **attenuate upward** (summaries that survive compression) and
**amplify the front line** (equip S1 to absorb the unexpected locally). Both halves now have
earned instances that postdate this frame's registration:

- **Amplification = the primitive menu.** F21: admitting one structural verb (`impact`)
  flipped 0/3 cap-halt to 3/3 green@1 — variety imported to S1 exactly where the task's
  disturbance exceeded the worker's own (mapping 1, new axis). F21's sharpest lesson is
  Davies-shaped too: *partial* amplification is worse than none informationally — 4-of-8
  callers gave the worker false confidence of completeness and it discarded true feedback
  (attribution poisoning). Amplifiers must be exhaustive over their declared scope or
  declare their truncation (cf. the ledger doctrine: ABSENT, not fabricated).
  *(Retro-read 2026-07-12, F23: the poisoning mechanism FAILED REPLICATION under the fixed
  instrument — single contaminated cell; narrow-arm failure is hunting, not dismissal
  (Wiener, below). The declared-truncation rule tested NULL → hygiene, never load-bearing.
  The amplification half stands: wide-menu value = the whole constraint set at once,
  convergence@1, narrow 0/9 pooled vs wide green@1 6/6.)*
- **Attenuation = the upstream ledger.** The fold (dedupe by lib:verb:class:signature,
  counts, three samples) is an attenuator designed against Beer's question in the toolbox
  entry below — *what information is destroyed, and does anything downstream need it?* —
  answered per field: identity of the bug survives (signature), scale survives (count),
  drill-down survives (samples → exact spine seqs), and everything else is reconstructible
  from the spines, which stay ground truth. Close reds and bare cap-halts are attenuated to
  zero *deliberately* (workflow stories, not lib incidents) — attenuation as a design
  decision with named exclusions, not lossy accident.
- **The asymmetry F22 adds:** S1's appetite is not a variety signal. Authors grab every
  amplifier offered (cargo-cult, 6/6 on inert tasks) — so amplification decisions must key on
  evidence from the ledger (request-red frequency under failure, green@1-vs-grind contrast),
  never on the front line's stated wants. Davies' managers who mistake requisition volume
  for requisite variety are the same failure.

### 5d. Recursion: every step of a bareloop job is itself a viable system `[predicts]`

Davies stresses VSM is recursive — each S1 unit contains the whole five-system ladder at its
own scale. bareloop's per-step verdict classes (hard/soft/HITL green, gated PER STEP) are
this recursion made concrete: each step has its own close (its S5 boundary), its own budget
slice (S3), its own escalation (algedonic). The prediction worth carrying: step-level
viability does not compose into job-level viability for free — the job needs its own S2
(step coordination) and its own S5 (the human merge line), or the steps will be individually
green and jointly incoherent. Never tested anywhere; job #1 is the test.

---

## Shorter refs — the rest of the toolbox

- **Wiener — feedback vs feedforward.** Error-driven correction (feedback) vs model-driven
  anticipation (feedforward). The retry loop is feedback; recalled notes are feedforward.
  SP-3 is literally a feedback-starvation test: when disturbances are unguessable, feedback
  alone fails and feedforward is the only route. Diagnostic this suggests: classify every
  green as feedback-reached (iterations > 1, no recall evidence) vs feedforward-reached
  (recall + green@1) — computable from the existing ledger. `[predicts → V6]`
- **Wiener — hunting/oscillation.** An error-driven loop with too much gain and no damping
  oscillates around the target without converging. Cap-3 is the damper; a lineage that
  cap-halts repeatedly on the same task is *hunting*, and more retries would buy oscillation,
  not convergence — visible in F15's 0/44 green@1 vs 0.73 eventual green (slow guessing, not
  hunting) as the contrast case. `[confirms]`
- **Ashby — the black-box method.** Regulate by observed behavior; never require the box be
  opened. The opaque close (attempt 3's declared condition) is the black-box discipline
  applied to the arbiter's *output*: counts only, no teaching. `[confirms]`
- **von Foerster — second-order cybernetics.** The observer is part of the system observed.
  §4b ("every information path into the worker is part of the instrument"), earned twice, is
  second-order cybernetics rediscovered: the experimenter's close wording, catalog notes, and
  task framing are all *in* the system under test. `[confirms]`
- **von Foerster — order from noise.** Self-organization needs a noise source whose variety
  matches the search space. Mutation is the noise source; attempt 1's ceiling (authorship
  saturated the catalog space, F13) was an order-from-noise failure — the noise had too little
  variety left to generate order. Pre-flight rule: check the mutation operator's remaining
  variety against the space before any cohort. `[budgets → V5]`
- **Beer — variety engineering (attenuators & amplifiers).** Every management structure is a
  chain of variety attenuators (filters) and amplifiers (structure). The extractor is an
  attenuator: episode → rule compresses variety. The credit-attribution gap is
  over-attenuation — a bare green destroys the which-knob information in transit. Design
  question the frame keeps live: at every attenuation point in the successor (extractor,
  ledger summary, escalation text), *what information is destroyed, and does anything
  downstream need it?* `[budgets]`
- **Pask — conversation theory / teach-back.** A concept is held only if it can be taught
  back in the learner's own terms. Rules-vs-verbatim is a teach-back experiment: verbatim
  inheritance copies the utterance; rules inheritance requires the regularity be re-expressed
  — and F12/F15 showed the rules channel steers authorship both directions, i.e. the
  teach-back transmits. `[confirms]`

---

## The Boolean floor — what gate-level digital design lends the experiments (registered 2026-07-13)

One rung below the cybernetics of Wiener and Ashby sits the engineering discipline that made
computing physically reliable: digital logic. A transistor is an analog, noisy, drifting
device, and AND/OR/NOT circuits built from them essentially never make a logic error — because
gate-level design answers the exact question this project's machinery answers: **how do you
build a reliable system out of unreliable components?** The borrows below are architectural
(restoration, clocking, gated writes, fault models, design-for-test), never the gate zoo
itself — composing LLM calls like boolean gates multiplies variance instead of canceling it,
because gates compose only where each component is deterministic and fully characterized.

### B1. Signal restoration = the predicate close `[confirms]`

Digital beat analog computing for one reason: every gate **re-quantizes** its output. A
degraded input (0.7 of a "1") leaves as a full-strength "1", so noise never accumulates
across stages. A worker's artifact is analog — plausible-looking, degraded in unknowable
ways — and the predicate close is the restoring gate: it collapses the artifact to one clean
bit before anything downstream consumes it. The inverse rule is the doctrine: **no unrestored
signal crosses a stage boundary.** Rubric scores, confidence estimates, "mostly passing" are
analog levels in transit — advisory only, never a close (§4), never an input to selection.
"Green gates, cost ranks" is not a preference; it is why digital works at all. → V12

### B2. Noise margins and the forbidden zone = §5b's own-category discipline `[confirms → predicts]`

A logic family defines a band for 0, a band for 1, and a **forbidden zone** between them — a
voltage in the gap is a fault, never rounded to the nearest value. Cap-halt as its own
category ("not under $2", never merged with "wrong") is a forbidden-zone read. The F5 class
(validated green, crashed post-green) is a forbidden-zone voltage read as a 1 — the exact
failure noise margins exist to prevent. Prediction worth making structural: every close can
enumerate its forbidden-zone outcomes in advance, and each maps to a named red or escalation;
any coercion to a verdict is itself the fault. → V10

### B3. Edge-triggered registers vs transparent latches = F18/F19 named structurally `[confirms]`

Sequential logic advances state only on a clock edge, through a flip-flop with a write-enable;
a **transparent latch** passes input straight through while open and causes race conditions
where a signal sneaks around the clocked path. Verdict-gated inheritance is a D flip-flop:
run end = clock edge, green = write-enable, the store = the register. In-run revision was a
transparent latch racing that register — an unclocked path letting information flow
continuously, masking the clocked channel entirely (F18's confound, F19's isolation).
Circuit designers ban mixed latch/flip-flop paths for exactly this reason. The rule as a
lint: every information path in a claim instrument is **clocked-and-gated or metered** — an
unmetered continuous path is the F18 confound named before tokens burn. → V11

### B4. Stuck-at faults and BIST = the instrument self-test F23 was missing `[predicts → V9]`

Chip testing never asks "does the circuit seem fine?" — it enumerates a fault model (every
node stuck-at-0 / stuck-at-1) and generates vectors guaranteed to *distinguish* the faulty
circuit from the good one; a built-in self-test (BIST) runs them before the part is trusted.
The POC bar (machinery negatives + control + falsifier, "the test must be able to fail") is
informal ATPG. F23's contaminated instrument cell was precisely an **undetected stuck-at
fault inside the instrument** — caught only by a replication rep after the tokens were spent.
The borrow: a stuck-at catalog for the harness machinery itself (close stuck-at-green /
stuck-at-red / broken, spine dropping or mis-stamping events, validator stuck-at-green,
escalation channel summarizing) plus a token-free vector suite run **before a probe's results
are trusted**. Nominated first of the five. → V9

### B5. Truth-table probing = the contrast check generalized `[confirms → budgets]`

Verifying a gate means toggling one input and watching the output switch — if it doesn't
switch, that input is not wired in. M3's contrast check (two opposed configs MUST differ
measurably or STOP) and one-knob mutation are single-input toggles; the kill-switch is a
truth-table row. The budget extension: **toggle coverage** — per config knob, does the ledger
hold ≥1 observed toggle (output changed when only that knob changed)? A knob claimed
load-bearing with zero observed toggles is unwired-until-proven. Extends V2's contrast-bit
rule from a minting requirement into an ongoing coverage metric. → V13

---

## V-items — what the frame says to validate or try (registered)

- **V1 (SP-3 readout rule, pre-registered at g7):** read the readout Conant–Ashby-first.
  Q1 ∧ Q2 → record as a good-regulator demonstration. Q1 ∧ ¬Q2 → *before* firing the F17
  commitment (b) ("map wrong again"), run an explicit leak search: enumerate every channel by
  which the idiosyncratic rules could have reached a no-episode worker (task text, close
  output, authoring notes, catalog, CLI scaffold). Only a clean search fires the commitment.
- **V2 (successor, extractor):** formalize contrast evidence as channel capacity — the
  extractor may claim a knob only with ≥1 attributable contrast bit for it, counted
  mechanically from the ledger (sibling standing, not bare greens). Amend the successor design
  doc; validate that bits are countable from the existing cohort ledgers retroactively (F16's
  lost-credit case should show 0 bits; F15's L1 lock should show ≥1).
- **V3 (successor, lineage key):** generalize SP-2 — the lineage key must be extensible to any
  *declared channel condition*, not hardcoded to (job × worker path). Every condition.json
  field is a candidate key dimension.
- **V4 (successor, escalation):** algedonic path — HITL escalations travel a channel no
  emergent component writes, summarizes, or filters. Structural, testable: an escalation's
  text reaching the human must be byte-identical to what the shell emitted.
- **V5 (any future cohort):** order-from-noise pre-flight — before spending tokens, measure
  the mutation operator's remaining variety against the config space (attempt-1 ceiling class,
  F13). A catalog the authoring channel can saturate first-shot has zero noise left.
- **V6 (grid script, now):** feedback/feedforward classification per green —
  feedforward-reached = recall-evidence ∧ green@1; feedback-reached = iterations > 1 ∧ no
  recall evidence. Free from the existing ledger + spine; SP-3's Q3 lock prediction says late
  gated-arm greens should migrate feedforward while ungated stays feedback.
- **V7 (bareloop, first multi-step job):** System-2 red category — coordination failures
  between steps/units (write-scope contention, step-order violations, store races) get their
  own named category on the spine, never folded into worker-red/interpreter-red. Prediction
  (§5a): job #1 surfaces at least one red that is S2-class; if every red attributes cleanly
  to a single unit, the S2 mapping over-predicted — note it and move on.
- **V8 (bareloop, selection code):** the single-fitness-score ban made structural (§5b′) —
  verdict and cost travel as separate values end-to-end; no function in the selection path
  combines them into one scalar. Testable mechanically (type/lint the selection seam) and by
  review: any PR introducing a combined score is the S5-collapse smell, rejected on sight.
- **V9 (NOMINATED — adaptlearn sandbox, token-free):** instrument BIST (§B4) — a stuck-at
  catalog over the real instrument components (close stuck-at-green / stuck-at-red / broken,
  spine dropping events / freezing seq / mis-stamping ts, validator stuck-at-green,
  escalation channel summarizing detail) with one detection vector per fault, run as a
  pre-flight before any probe's results are trusted. Control arm: every vector passes the
  good instrument (zero false positives). Falsifier arm: each vector, sabotaged, must MISS
  its fault (mutation-validated — detection power lives in the vector, not in incidental
  crashes). POC in adaptlearn `poc/`; bareloop rewrites against the spec (upstream-ledger
  pattern, 0.11.4).
  **ANSWERED 2026-07-13 (adaptlearn F24, 0.11.6): GREEN** — control 7/7, 7/7 faults
  detected by their own assertions, falsifier 8/8 sabotaged vectors miss; run 1's control
  arm caught a real fixture bug (dir-argv close redding everything, VEC-1 passing for the
  wrong reason) before anything trusted the instrument. Spec carried to this repo's
  `docs/plans/2026-07-13-instrument-bist-spec.md`; rewrite lands with N-ladder instrument
  hygiene (PRD v1.10 item 1).
- **V10 (bareloop, per close):** forbidden-zone audit (§B2) — each close enumerates outcomes
  that are neither clean green nor clean red (the F5 validate-then-crash class, unparseable
  artifacts, partial suites); each maps to a named red or escalation; coercing one to a
  verdict is itself the instrument fault.
  **ANSWERED 2026-07-13 (adaptlearn F25, 0.11.7): GAP** — control 2/2, falsifier 6/6
  classifiers flip; one live coercion (signal-killed close → `needs_revision
  exitCode=null`, retried to cap), one collapse (timeout pooled into broken-close), one
  coercion invisible at the seam (crash-at-load ≡ honest red by exit code). Build rules
  carried to this repo's `docs/plans/2026-07-13-forbidden-zone-audit-spec.md`
  (`close-killed`, `close-timeout`, judgment-rendered signal); they land with the
  N-ladder close work (PRD v1.10 item 2).
- **V11 (any claim instrument):** transparent-path lint (§B3) — the instrument's declared
  condition list marks every information path as clocked (advances only at run boundary,
  write-enabled by verdict) or metered; an unmetered continuous path is the F18 confound,
  named before tokens burn.
- **V12 (bareloop, stage seams):** restoration boundary (§B1) — no analog value (rubric
  score, confidence, partial-pass fraction) crosses a stage boundary as an input to any
  decision; only quantized verdicts travel. V8's sibling: V8 bans combining two clean
  signals into one scalar; V12 bans propagating an unclean signal at all.
- **V13 (bareloop, ledger):** toggle coverage (§B5) — computable per knob from the existing
  ledger: ≥1 observed contrast toggle, or the knob is flagged unwired-until-proven. Extends
  V2 from minting requirement to ongoing coverage metric.


## Orchestration vs self-healing workflows — bareloop registration (2026-07-11)

**Status:** bareloop-side addition to the frame, registered after the archive; everything
above this line is the adaptlearn record, unchanged, and nothing here reopens it. Origin:
hamr's question "is an orchestrator possible as a second way of doing things, or self-healing
workflows — which is the future?" Same reading rule as the rest of this file: each mapping
tagged `[confirms]` / `[predicts]` / `[budgets]`.

**The framing:** orchestration and self-healing workflows are two *regimes*, not competitors.
Orchestration spends model intelligence at runtime — the workflow is re-derived every run and
lives nowhere but the model's context. A self-healing workflow crystallizes intelligence into
an auditable artifact (validated config + rules with receipts) that improves across runs.
Only one of the two compounds.

### O1. Credit attribution rules out orchestrator-as-learner `[confirms → budgets]`

Mapping 3 (channel capacity), extended. An orchestrator makes dozens of runtime decisions per
run — which agent, what order, what context — all confounded into one outcome bit. Attribution
needs ~log₂N attributable bits per decision; a bare outcome carries ~1, confounded. The
one-knob workflow + ledger design exists precisely to make contrast bits countable (V2:
present 16/16 generations, perfect separation). Orchestration maximizes runtime variety
exactly where variety destroys attributability — it *structurally* cannot learn which of its
decisions earned the green. Budget rule unchanged, now with its contrapositive: a coordination
scheme whose decisions cannot each be contrast-attributed cannot be inside the learning loop.

### O2. Conant–Ashby: only the crystallized regulator accumulates `[confirms]`

Every good regulator must be a model of the system. The workflow *is* that model, written
down: config + rules, each carrying its minting green and contrast bit. An orchestrator holds
the model implicitly and re-derives it per run — so it re-buys, every run, exactly the
regularities F17/F18 showed live outside the worker's reach (where memory pays). The cost
curves are what accumulation looks like: ~10× cheaper post-lock (F17 Q3), cohort cost halved
under executed inheritance (F20). Orchestration has no equivalent curve.

### O3. The arbiter problem: runtime coordination is ungateable `[confirms]`

Design law #1 (never author your arbiter) held through every cohort and is the no-fake-green
record's foundation. An orchestrator's runtime decisions ARE the workflow — there is no
artifact to schema-validate reds-before-tokens, because the plan doesn't exist until
mid-flight. POSIWID/accountability-sink reading (mapping 7): coordination decisions severed
from consequences, ungated because ungateable.

### O4. Honest counterweight: model strength favors orchestration on the verdict axis `[confirms]`

F15/F18: strong workers plus in-run acquisition saturate pass/fail on modest tasks — an
orchestrator with a frontier model will usually just pass, and model strength keeps eating
scaffolding from below. Orchestration is right for one-off, heterogeneous, unknown-shape work
(PRD §1's explicit out-of-scope). The workflow's claim was never the verdict axis: it is
greens you can trust and afford at run 500 — first-try rates, ~$0.03 vs ~$0.24
acquisition-path cost, rules with lineage. Receipts and compounding cost are the moat; anyone
can rent the model that powers an orchestrator.

### O5. Convergence: orchestrator as front door, workflow as destination `[predicts]`

Prediction: the two regimes fuse in sequence, not in parallel — first encounter with a new
job is orchestrated (or is a CLI session); the trace crystallizes into a config; the
self-healing loop owns it thereafter. F20 already built the bridge: run-as-executed
inheritance is precisely "what the run improvised becomes what the lineage inherits." The M5
revisor is the caged micro-orchestrator (re-plan mid-flight, arbiter untouchable, one
revision, re-validated) — and F18 showed that caged re-planning is what made runs
ultrastable. If orchestration ever enters bareloop as a modality, it extends the
authoring/revision loop (a config allowed to settle over more than one pass, on jobs that are
not yet jobs) — never a swarm, same laws, and it is admitted the house way: pre-registered
probe, opposed conditions, measurable separation before any machinery is built (the
request-red registry precedent).

---

## The self-healing map — bareloop registration (2026-07-12)

**Status:** bareloop-side addition to the frame, same standing as the orchestration section:
registered after the archive, nothing above the first divider reopens. Origin: hamr's
follow-up on the orchestration mapping — *where exactly does bareloop self-heal?* Same
reading rule: `[confirms]` / `[predicts]` / `[budgets]`.

**The law (Ashby's ultrastability generalized to every layer):** a system self-heals only
at the loops it actually has. A subsystem without its own loop, its own **named red**, and
an **undeletable signal** (a spine event no emergent component can suppress or summarize)
cannot heal — its ill-health is invisible by construction. The audit question for any new
component is therefore three-fold: which loop owns it, what is its red called, and where
does the signal land on the spine.

### The five loops (each needs a PRD home + spine events)

1. **Within-run — S1 heals itself** `[confirms]`. Revision-on-stall (M5, F11) — exists.
   Registered gaps: **artifact-red** (a non-code artifact reds on its own axis, F21's
   instrument caveat / PRD v1.4 §5) and **primitive-smoke** (per-job known-answer check per
   admitted primitive before spend, PRD v1.5 §4) — the only defense against the A3 silent
   class, because silent bugs throw nothing.
2. **Across-run — S4 heals the harness** `[confirms]`. One-knob mutation under green-gates /
   cost-ranks (design law #4). Spine: `config-final` (inherit run-as-executed, F18/F20;
   live at N0) and ≥1 contrast bit per claimed knob (V2; design law #3).
3. **Menu — S4 heals capability** `[confirms]`. request-red → registry → admit → rerun;
   gate MET (adaptlearn F21/F22, bareloop F2). Spine: `request-red` carries op + iteration
   (within-run frequency = need weight, F22). Admission keys on ledger evidence, never on
   author selections (the cargo-cult law, F2).
4. **Lib — the human heals the substrate** `[confirms]`. The upstream ledger (PRD v1.5):
   derived from spines, 8 incident classes, lifecycle open → filed → fixed → consumed,
   filing stays human. The classifier table ports as-is.
5. **Instrument — the probes heal the probe** `[budgets]`. Machinery negatives measured
   before spend; must-fail fixtures shipped with every instrument; negatives drive the
   REAL code path, never a replica (the F22 run-1 clobber survived a replica-based
   negative). Provider failures are instrument, not verdict: retry once, then a provider
   red, excluded from every analytic read (§5b). Evidence from the menu-probe session
   alone: this discipline caught A3, the results-clobber, and a regex bug before they
   could contaminate a readout. Promoted from dev rule to product obligation in PRD
   v1.6/v1.7.

### New V-items (continuing the series, bareloop-registered)

- **V7 — S2 red category** `[predicts]` — a pre-registered probe, fires on job #1:
  coordination failures (write-scope contention, step-order violations, store races) get
  their own name on the spine (`coordination-red`), never folded into
  worker/interpreter-red. Beer: S2 is the anti-oscillation layer; a coordination failure
  logged as a worker failure teaches the wrong loop to heal. This is the one subsystem
  adaptlearn structurally could not test (one process, one S1, sequential runs), so it
  ships as prediction, not proven mechanism. **Prediction:** the first multi-step job
  surfaces ≥1 red attributing to no single unit. **Falsifier:** every job-#1 red
  attributes cleanly under §5b contrast → V7 over-predicted; keep the category as a
  named-but-empty bin, move on. **Build gate:** no S2 machinery beyond the named category
  until the probe fires — the category is the instrument; schedulers before an observed
  coordination red would be cargo-cult coordination. N0's vocabulary (cap-halt, gate-red,
  interpreter-red, retention-red, broken-close) has no coordination name — the category
  lands with the N1 schema / N2 real-job loop, where the first real coordination surfaces
  (write scopes, step order, one store per job) appear.
- **V8 — anti-S5-collapse** `[budgets]`: verdict and cost are separate values end-to-end;
  no function anywhere in the tree combines them into one scalar. Design law #4 made
  structural and lintable — a token-free static check can enforce it, and S5 (the shell)
  never has to trust that the doctrine was followed.

### Variety-engineering manifests (mapping "attenuators & amplifiers" made an obligation)

- **Every attenuator declares its destruction** `[budgets]`: each summarizing point
  (extractor, ledger fold, gap slice, escalation path) documents **per field** what is
  destroyed, what survives, and why nothing downstream needs the dropped part — the
  upstream-ledger design doc's field table is the template; an attenuation point without
  its manifest is a review blocker. (The frame's standing question — "what information is
  destroyed, and does anything downstream need it?" — becomes a per-component
  deliverable.)
- **Every amplifier declares its truncation** `[budgets]` — **ANSWERED 2026-07-12
  (adaptlearn F23, bareloop F3): status = HYGIENE.** Any ranked/partial view injected
  into a worker says so in the injection itself ("top-k of an unknown total — may be
  incomplete") — a near-free honesty marker, the injection-side twin of the ledger's
  "ABSENT, not fabricated"; it ships, is never a review blocker, and is never relied on
  for attribution. F23's pre-registered NULL (attribution@2 3/3 in both arms) came with a
  retro-read: F21's poisoning mechanism failed replication (single contaminated cell);
  narrow-arm failure is hunting, not dismissal. The floor survives on the honesty
  principle alone — **ranked views never claim exhaustiveness; exhaustive views (impact)
  may** — and the attribution fix stays structural (exhaustive verbs, admission;
  wide-menu value = convergence@1, the whole constraint set at once).
