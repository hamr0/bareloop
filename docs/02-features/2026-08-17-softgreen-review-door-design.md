# Softgreen and the review door — the verdict classes rekeyed (design record)

**Status: decided 2026-08-17 by hamr, in-turn, immediately after the first live hitl proving
loop. NOTHING IS BUILT AND NOTHING IS AUTHORIZED TO BE BUILT — this record exists so the build
can start on his explicit go without a fresh design session. The evidence it rests on is five
runs fired today; every number below is read off a spine, never recalled.**

The one-line version: **hitl is retired as a verdict class, its pause machinery is re-homed as
a REVIEW DOOR at the end of every run, and softgreen becomes the forward path for work whose
*done* is a human judgement.**

---

## 1. What was fired, and what it showed

Five runs, one patient (`litectx-maintainer`, a copy of litectx at v0.32.0; run spines under
`bareloop-patients/litectx-maintainer-bareloop/`, authoring spines under
`bareloop-patients/litectx-maintainer-author/author-mswbkyt1.jsonl` and
`bareloop-patients/litectx-jsdoc-author/author-msx81t76.jsonl`), one goal — *litectx `src/` to zero strict
errors, nothing silenced*.

| run | cost | what it did |
|---|---|---|
| `mswbkyt1` (authoring) | $0.29 | authored an 8-stage hitl close, SIGNING PREPARED; hamr signed hash `a8a806…`; spec landed at `jobs/litectx-maintainer.json` |
| `mswk0xvg` | $1.10 | provider-red casualty — 22 worker rounds of reading, zero writes, then one emission hit the 32k `maxTokens` ceiling; truncation → `provider-red`, an existing class, routed correctly |
| `mswks15g` | $2.95, 28.6 of 30 min | **the first hitl pause in programme history** |
| `msx7a3rj` | $0 | the rerun decision, wall-halted with **zero worker rounds** — 87 seconds of wall left |
| `msx7xoe0` | $0 | resume after the wall raise — **re-asked the original question**; the signer's words were gone |
| `msx87qqs` | $0.36 | hamr re-spoke the rerun; 9 worker rounds ran on his words, zero writes landed, wall died at 60.1/60 min |

**The machinery worked.** In `mswks15g` the worker took litectx `src/` from 64 strict errors to
0 through its own in-run check loop; the authored `no-suppressions` stage caught the cheat
genre TWICE and the worker undid both honestly (two added `any`s, then one hidden
`/** @type {…} */` cast at `src/tsalias.js:38`); all seven mechanical stages went satisfied;
the `human-confirms-real-fixes` stage paused the run decision-ready with its ask, the
per-stage evidence, the eleven changed paths and the three doors, and the W-2 clock stopped for
free while hamr read it. That is the entire hitl surface executing exactly as designed, live,
for the first time.

**And two defects sat under it** — F102 (a pending rerun decision does not survive a
wall-halt → resume) and F103 (the wall folds across legs, so a decide-time rerun inherits
leftovers). Both are in `docs/FINDINGS.md`, grounded in the spines above. Neither is a reason
for the decision in §2; they are the reason the fixes in §5 are part of the same build.

**The second authoring run is the one that changed the design.** `msx81t76` ($0.45) authored a
close for a NEW job — `litectx-jsdoc`, *"document every exported function in `src/` with
accurate JSDoc"* — reaching SIGNING PREPARED at hash `aee1dcbd…`, **unsigned and unfired**. The
catalogue has **no kind that can count documentation**. So the composer reached for the strict
typecheck as a PROXY work stage, and said so in its own note: *"intentional calibration"* —
honest JSDoc with typed `@param` tags retires the implicit-any errors as a side effect. The
machines cannot see documentation at all. Only the human stage could judge whether the docs
were any good. That is F104, and it is the system telling us what it is built around.

---

## 2. RULING 1 — hitl is RETIRED as a verdict class

hamr's reasoning, recorded because the reasoning is the ruling:

> *"checkers are subjective human experience that they should grade for"*

> *"hitl should be at every step, which is more like a chat, then do it in regular chat"*

> *"it's hard to apply deterministic flow on a probabilistic throughput"*

Three separate claims, and each one lands:

1. **The composer is forced to build a mechanical checker for a job whose essence is
   subjective.** The jsdoc close is the proof: the only thing standing between the interview
   and a close was a typecheck that measures something adjacent to what the person asked for.
   A close that must be mechanical for a job that cannot be measured mechanically produces a
   *proxy*, and a proxy is exactly the shape this programme spent F87 learning not to trust.
2. **A human as a MID-RUN checkpoint is chat.** If a person is answering questions while the
   work is in flight, the loop is not automating a repeated job — it is a conversation with a
   budget attached, and there are better surfaces for a conversation than a signed spec and a
   detached process.
3. **A deterministic flow does not sit on a probabilistic throughput.** The hitl class asked a
   binary gate to be rendered by the one participant who reserves the right to change their
   mind, days later, about work that was already graded.

**So the verdict classes become `green` and `soft-green`.** `soft-green` remains
declared-but-locked until the judged floor of §4 exists — the standing quarantine ruling is
unchanged, it now merely has a build behind it.

**What retiring does NOT mean.** It does not mean the person stops deciding. It means the
person stops being a *stage inside the close*. Which is §3.

---

## 3. RULING 2 — the pause machinery is RE-HOMED as the REVIEW DOOR

Nothing built for slice 1 is deleted. The pause, the evidence package, the three doors, the
checkpoint, the TTL, the clock stop, the rerun-text-as-gap seam — all of it moves one level
out, from *a stage inside the close* to **the door at the end of EVERY run**, green and
softgreen alike.

### 3.1 The law the door must never break

hamr, verbatim:

> *"it's important not to change the loop self verdict"*

**The door never changes the loop's own verdict.** A green stays green in the ledger, forever,
whatever the person then does with it. The close mints the verdict; the door records a
*disposition*. Collapsing those two is how a system starts grading itself by how the grader
felt about it afterwards, and it is the same line the arbiter rule draws everywhere else.

### 3.2 The door on a GREEN run

- The close mints `green`. That is done before the door opens and is not up for discussion.
- The door is **non-blocking**: a green run that is never answered is still a green run.
- **accept** — confirmation, and the gate that releases the **reuse / learning credit**. This
  is where the already-green credit leak stays blocked: accept confirms a verdict, it never
  mints one.
- **rerun** — a **fresh engagement** (ruling 3, §3.4). The person's text is the gap.
- **cancel** — a **disposition only**: *"the verdict stands, but I'm not taking the
  merchandise."* The run's branch is the discard branch, nothing graduates, and the ledger's
  green is untouched.

### 3.3 The door on a SOFTGREEN run

Same door, one addition that matters while the judge is young:

- **accept is what releases the run's learning credit.** This is the standing softgreen
  quarantine ruling — *softgreen passes are quarantined from learning credit until the judged
  floor is proven* — finally given a mechanism instead of a flag.
- **The signer's accepts double as the judge's ongoing report card.** Every accept and every
  rerun over a softgreen verdict is a datum about whether the judged floor agrees with the
  person who owns the job. That is a calibration signal the programme currently has no other
  way to collect, and it costs nothing to keep.

### 3.4 RULING 3 — a rerun is a FRESH ENGAGEMENT

hamr, verbatim:

> *"redo/rerun comes with new authoring for money+time and keeps accounting of this far and
> this session separate counters"*

- A rerun gets its **own money and its own time**, authored at the moment the person takes the
  door. It does not scavenge whatever the corrected run happened to leave on the wall.
- The ledger carries **two counters, side by side**: *cumulative so far* (this job, across
  engagements) and *this engagement*. One number that quietly means both is how F103 happened.
- The corrected run's verdict is untouched (§3.1). A rerun is new work against the same signed
  spec, not a re-grade of old work.

This is the direct cure for F103: an engagement that begins when the person decides cannot
inherit 87 seconds from a leg that ended before they read anything.

### 3.5 RULING 4 — a halt records the FULL state

hamr, verbatim:

> *"on any wall hit time/money/strikes notes/progress should be recorded"*

On **any** wall or halt, the checkpoint records everything a resumed leg or a reading human
needs, in one place:

- **time and money** — elapsed, spent, and what remains against the signed caps;
- **strikes** — the ladder's own governor state, so a resumed leg does not restart a count that
  was already two-thirds spent;
- **notes and progress** — the trend, the last gap, what moved;
- **any PENDING HUMAN DECISION** — the door that was open and the words that were said.

The last bullet is F102's missing primitive stated as a rule. A decision that lives only in the
in-flight process is a decision the person will be asked to make twice.

---

## 4. RULING 5 — the softgreen design (agreed in principle: *"we can try it"*)

### 4.1 A new locked kind: `judged-floor`, built on LOCATE + DECIDE

The shape is borrowed from bareguard's e6 judge A/B experiment
(`bareguard`, `harness-code-mode/e6-judge.mjs`). **That file is a POC and was NEVER SHIPPED.**
We borrow the *concept*; we import only **shipped primitives** — bare-agent 0.36's
`judge` / `calibrate` / `judgeToAnnotation` and bareguard 0.13's gate-annotation drain. The
`decide()` rulebook is **written fresh in bareloop and is arbiter-owned**. Graduation between
repos is a rewrite, never a copy; that rule does not bend because the source is a sibling.

### 4.2 The judge never utters a verdict

- The judge (**`claude-haiku-4-5`, pinned, never agent-selectable** — the only tier with
  established injection resistance upstream) **EXTRACTS FACTS WITH QUOTES** from the
  **authoritative artifact** — the real diff, the real output — and **never** the worker's own
  summary of what it did.
- A **deterministic, arbiter-owned `decide()`** renders per-item pass/fail over those facts.
- **first-red-wins** composes the stage verdict from the items.

The reason is bareguard's own A/B result: **`judgeVerdict` is injectable; `judgeLocate` is
not.** A model asked *"did this pass?"* is a model that can be argued with. A model asked
*"quote me the lines where X appears"* has nothing to argue into — the arguing happens in code
we wrote, over facts with addresses. The axis rule comes over with it: **"B always surfaces;
only A halts."**

**Unsure = red.** The decisive binary verdict stays; the fail-safe tiebreak IS the escape
hatch, and this is deliberately not the partial-credit model.

### 4.3 The rubric card comes from the interview, and the signer signs it

**Q6 — *"When you judge the result yourself, what separates a pass from a fail? Name the few
things you actually look for."***

The answer is compiled **at interview time** into **extractable items**, D5-style: the LLM
proposes the extractable rewrite of what the person said, **the signer signs it**, and the
result is **enumerated in the spec hash**. A card change is a re-sign, exactly like every other
spec edit.

**The ceiling is documented up front** (bareguard §6.4, and it maps cleanly onto F87): the
judge catches violations of **STATED card items only**. An omission the card never named, and a
lie that needs an oracle to catch, both fall through to the review door. **The fix for a miss is
a new card line and a re-sign** — never a smarter judge, and never a judge given more latitude.

### 4.4 Calibration — Q7, and the whole pipe

**Q7 — *"Give one example you'd pass and one you'd fail, and say why."***

- Those become the **frozen calibration set**: LLM proposes, **signer signs**, enumerated.
- **The WHOLE PIPE must grade it correctly before the close is signable** — extraction AND
  `decide()`, with **itemized reds**, not a paragraph. A judge that has not cleared its own
  calibration set gates nothing. This is BA-20's own acceptance criterion executing for real.
- **A judge-model bump forces recalibration**, mandatory — the model-bump dead-weight replay
  rule (PRD v1.69) pointed at the one component whose whole job is a stable ruler.
- **OPEN — the calibration set's SIZE is a threshold, and thresholds are hamr's.** No number is
  picked here. The standing no-agent-threshold-picking rule binds: a size chosen from a small
  observed sample is fitting to the data.

### 4.5 Composition, and what it dissolves

- Mechanical stages **first**, the judged stage **after**, **first-red-wins**.
- The judged stage is **`offer:false`** (it never enters the agent's check menu) and is
  **metered from the same wallet** — a budget funds the attempt PLUS its close.
- The judged stage **SKIPS the seed-verdict read**: its bar comes from calibration, not from
  what was red at seed.

**That last line dissolves F104.** Gate 3 — *some mechanical work stage must be RED at seed, or
there is nothing to do* — is what makes a pure-human-judgement job inexpressible today, and it
is why the jsdoc close reached for a typecheck proxy. When the **judged stage IS the work
stage**, and its bar comes from a signed calibration set rather than a seed read, a resume-
tailoring job becomes expressible without manufacturing a mechanical shadow it does not have.

### 4.6 The softgreen interview is seven questions

**Green's five questions, byte for byte, plus Q6 and Q7.** No renumbering of the green set, no
genre question, nothing rewritten — the same discipline the hitl set was built under (which was
green's set plus one). Nothing hardcodes a count; the library reports it.

---

## 5. Sequencing

1. **Softgreen + the review door, together, as the next build.** They are one rung: the door is
   where softgreen's learning credit is released, so shipping the judged floor without the door
   ships a verdict class with a quarantine and no unlock.
2. **The F102 / F103 primitives ship with it** — the checkpoint that carries a pending decision
   and re-enters the FIX LOOP rather than the ask, and the fresh-engagement money/time
   authoring with its two counters. They are not follow-ups; the door does not work without
   them.
3. **Resume-genre jobs wait on softgreen's judged floor — NOT on doc-genre mechanical kinds.**
   This reverses the standing sequencing note that blocked doc-genre jobs behind admitting
   doc-genre kinds to the catalogue. Tonight is the evidence: the mechanical route for
   subjective work produces a proxy, and a proxy is worse than a refusal.

**NO BUILD IS AUTHORIZED.** This record is a decision, not a go. The build waits on hamr's
explicit word, as everything paid-adjacent does.

---

## 6. What this record does NOT change

- **The close is still the only truth.** The door reads a verdict; it never renders one.
- **The arbiter still does not move.** Budgets, caps, the fence, merge — untouched. The judged
  stage is arbiter territory in a new place, not a new authority.
- **The agent still authors nothing in here.** The card and the calibration set are proposed by
  an LLM and **signed by the person**; the `decide()` rulebook is ours; the judge is pinned.
- **Merge stays human, forever.**

## 7. Not claimed

- **No claim that rerun CONVERSION works.** Delivery is proven — the signer's words reached the
  fix worker and nine worker rounds ran on them (`msx87qqs`). **Zero writes landed** before the
  wall. Conversion is **unproven-live**, and it is blocked on F102/F103, not refuted by them.
- **No claim that the hitl machinery was wrong.** It executed correctly, live, on the first
  attempt. It is retired for what it asks of a person and a composer, not for a defect.
- **No claim that `judged-floor` works.** Nothing is built. bareguard's A/B is evidence about
  *bareguard's* judge on *bareguard's* task; the borrow is a shape, and it has to earn its own
  calibration here.
- **No number is picked here** — not the calibration size, not a floor, not a budget.

---

## Addendum — 2026-08-18: the third door is PAUSE, and cancel is deleted

*Appended. Nothing above is rewritten: §3.2 and §3.3 stand as the record of what was
decided on 2026-08-17, and this is what hamr changed the following day.*

**The three doors are now `accept` / `rerun` / `pause`.** `cancel` is deleted as a concept
— not renamed, not kept as an alias, not reachable behind a flag.

hamr's reasoning, near-verbatim:

> *"rerun implies I don't like it, go again"*
>
> *"what's the point of cancel anyways? pause can resume — that would be more honest"*
>
> *"for green I can pause and it would resume from beginning of last step, and in
> softgreen it can pause"*

### What each door now means

- **accept** — unchanged. Confirmation, and the gate that releases reuse / learning credit.
  It confirms a verdict; it never mints one.
- **rerun** — unchanged. A fresh engagement (§3.4): the person's text IS the gap, empty or
  whitespace text is refused, and the allowance is spent once the fix loop opens.
- **pause** — *not now.* Nothing is run, nothing is spent, no worker round is bought and the
  fix loop never opens. The run keeps the checkpoint it already has and resumes **from the
  start of its last step** whenever somebody comes back to it — on a green run and on a
  softgreen run alike, since both are the same checkpoint machinery.

### The TTL is the cancel case, without the forever-decision

An unresumed pause is not a special state and needs no new machinery: it simply expires
under the existing 60-day checkpoint TTL (§1.6 / `PAUSE_TTL_MS`). **That expiry IS what
cancel used to do** — the run ends up abandoned, its branch left exactly as it was, nothing
graduated, the ledger's verdict untouched. The difference is entirely in what the door asks
of the person: cancel demanded a permanent judgment at the one moment they had least reason
to make one, and pause asks for nothing at all. A person who never comes back gets the same
outcome; a person who changes their mind keeps the work they paid for.

The disposition reading of cancel in §3.2 (*"the verdict stands, but I'm not taking the
merchandise"*) is therefore retired as a DOOR. The fact it recorded — the loop's own verdict
is never changed by what a person does afterwards — is unaffected and is still §3.1's law.

### What it changes in the machinery

- `HUMAN_DECISIONS` is `['accept', 'rerun', 'pause']`. A fourth door remains inexpressible,
  and `cancel` is now refused by the same seam that refuses any other non-door.
- The `hitl-cancel` **terminal is no longer mintable anywhere**. The constant is gone from
  the library; the ledger keeps the bare string in its excluded set so a spine written
  before today still reads as governance rather than as a counted capability gap. That is a
  reader's backward compatibility, deliberately not a constant a writer can reach.
- A pause answer mints the ordinary `hitl-pause` checkpoint terminal, with an explicit
  `humanDecision: 'pause'` on the record: *a person looked and kept it* and *nobody has
  looked yet* are two different facts, and one record spelling both is how a reader comes to
  confuse them.
- It does **not** consume the one-shot rerun allowance, and it does **not** open the fix
  loop. The same three doors are open the next time somebody looks.
- `hitl-decision-red` is untouched: a malformed decision is still an honest refusal of the
  operator's own input.

### The runner's half

`scripts/run-u.mjs --decide pause` answers the door and **launches nothing**. This is not a
style choice, it is the checkpoint: the runner writes one spine per leg, and a leg that
returns before drafting emits neither `plan-accepted` nor `step-end` — which is all the
step-checkpoint reader reads. Launching a run to say "not now" would mint a fresh runid
whose own checkpoint is empty, and an operator who later resumed *that* runid would re-draft
and re-pay for every step the paused leg had already finished. So the runner prints the
decision, names the TTL and the original runid, and exits having spent nothing.
