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

---

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
- **Every amplifier declares its truncation** `[budgets → predicts]`: any ranked/partial
  view injected into a worker says so in the injection itself ("top-k of an unknown total
  — may be incomplete") — a near-free honesty marker, the injection-side twin of the
  ledger's "ABSENT, not fabricated"; it ships regardless. The floor is already earned —
  F21: undeclared partial retrieval poisons gap attribution, so **ranked views never
  claim exhaustiveness; exhaustive views (impact) may**. What stays `[predicts]` is the
  rule's *status* — load-bearing (review blocker) vs hygiene — decided by the
  declared-truncation probe (adaptlearn F23, number reserved, prereg pending), same track
  and bar as F21/F22, findings consumed back here.
