# Layer R — the root (within-run ratchet): design record

2026-07-19 · interview with hamr, decisions LOCKED · status: POC pending, build not started.
Amend with dated addenda, never rewrite.

## Role (fixed by measurement — do not relitigate)

Layer R is **continuity only**: attempts stop repeating themselves (F21, F38). It is NOT
the semantic-stall fix — F39 measured that hand-delivered state buys zero conversion; the
semantic converter is Layer 2's in-run self-check. The root is within-run scratch, a
different scope from across-run memory; only a green mints the latter (LAYERS.md).

Shape source: the rejected-edit buffer (PRD v1.15 pre-registration; RSI-LEARNINGS §3.3).
Evidence is CONDITIONAL: real under fixation (50%→100% on a stuck flat-temp model),
honest null on sonnet when not stuck, antagonistic with random diversity. bare-agent
0.30.0 shipped this as `refineLeaf.rejectedBuffer` (BA-14) — but that lives in
`recurse()`'s leaf-refine loop, a DIFFERENT machine from `loop.run`, which is what our
ralph drives per attempt. Layer R is bareloop's own build: a rewrite of the validated
shape, never a copy (graduation rule).

## Decisions (locked 2026-07-19)

1. **Authorship — the shell writes the root.** ralph assembles it mechanically from its
   own books: write/edit actions (gate audit, run_id-scoped, F32 instrument), verdicts,
   and red-set movement between attempts. The worker authors nothing and gains no verb;
   no gaming surface; delivery is guaranteed (injected, not recalled). The adaptlearn F6
   write-only-decoy class is structurally excluded.
2. **Engagement — fixation-gated, cost-neutral when inert.** The root injects NOTHING
   until the shell detects repetition in its own books (see detector below). Rationale:
   the measured lift is a fixation phenomenon; on sonnet (our worker) the buffer is an
   honest null when not stuck; pay only when stuck (RSI §3.3's explicit recommendation,
   and the adaptive default bareagent shipped after the same evidence).
3. **Content — escalating: summary first, verbatim second.** First detected fixation
   injects a capped mechanical summary ("you wrote X.js on attempts 1 and 2; the failing
   set did not change"). If the NEXT attempt is still fixated, escalate to the worker's
   own prior failed edit content verbatim ("you wrote THESE; they failed; write something
   structurally different" — the exact BA-14 mechanism that measured 50%→100%). hamr's
   rule: try both stages in the field; the stages fire on DIFFERENT attempts, so every
   stuck episode yields a per-stage read (broke after summary → summary credit; broke
   only after verbatim → verbatim credit). Revert path: if the battery reads summary as
   inert and verbatim as the lever, drop to verbatim-first; if summary suffices, drop
   verbatim. Read rules are frozen pre-battery (below), never post-hoc.
4. **Acceptance — repetition drop, ON/OFF, on job #4.** Paired root-ON vs root-OFF rows
   on job #4 (the one job that guarantees multi-attempt reds — RSI §3.4 headroom
   precondition). The pre-registered metric is a CONTINUITY metric: repetition rate
   across attempts (same-file re-writes with the red-set unchanged). Green-rate is
   recorded but is explicitly NOT the acceptance bar (F39: conversion is not Layer R's
   claim; a null there is expected and is not a Layer R failure).

## Mechanics (proposed frame, agreed in interview)

- **Store:** root state lives in ralph's memory for the run. The spine records DISTINCT
  record types (e.g. `root-fixation`, `root-injected` with stage/paths/counts) — but
  verbatim edit CONTENT never enters the spine: it is worker-authored text going into an
  append-only log (the secrets law: what a log captures, it captures forever). Content
  for the verbatim stage is teed at the one choke point that sees it — the
  `toolAction` translator (`interpret.js`), which already receives `args.content` /
  `args.newText`; the gate audit itself stays bytes-only.
- **Delivery:** ralph composes the digest into the existing gap channel before calling
  `middle(iteration, gap)` — same bound-and-trim discipline as gapKeep (F28: trims are
  announced, never silent). No middle signature change, no new worker capability, no
  verdict-vocabulary change, no budget/close touch.
- **Fixation detector (POC target):** attempt N is fixated iff its write-set overlaps
  attempt N-1's AND the red-set did not move. The red-set is read from the close's
  kept-failure lines (gapKeep matches) — POC must prove those lines are byte-stable
  across identical runs (spec-reporter durations would break naive equality). Closes
  without gapKeep need a fallback comparison; the POC names it or the detector degrades
  to write-set-only, honestly recorded.
- **Scope boundary:** the root never crosses runs. Run end = root discarded. Inheritance
  (Layer 3) remains verdict-gated and untouched.

## Pre-registered read rules (freeze in a commit before any battery number)

- A **fixation episode** opens at first detection and closes when the red-set moves or
  the run ends. Attribution: red-set moved on the attempt after summary injection →
  summary-resolved; after verbatim → verbatim-resolved; never moved → unresolved.
- **Revert rule:** across the battery, if summary-resolved = 0 and verbatim-resolved > 0,
  Layer R ships verbatim-first; if verbatim adds nothing over summary, ships
  summary-only. Ties keep the escalating shape.
- ON/OFF pairing, row counts, and the exact repetition-rate formula are frozen with the
  battery design doc, not here.

## Addendum — POC results (2026-07-19, same day)

Scratchpad POC (real `node --test --test-reporter=spec` output, run twice + a
one-test-fixed variant as the negative control):

- **Kept-failure lines are NEVER byte-stable** — every `✖` line carries a per-run
  duration stamp (`✖ multiplies (1.738ms)` vs `(1.637ms)`). A naive equality detector
  would read every attempt as "reds moved" and never fire. Found only because the POC
  used real uncrafted output.
- **Fix validated both directions:** stripping the trailing ` (N.NNms)` suffix before
  comparing gives a stable red-set on identical failures AND detects real movement when
  a test is fixed. Normalization is COMPARISON-ONLY — the gap delivered to the worker is
  never rewritten (the normalization-order risk class does not apply).
- Detector truth table green: same-file + same-reds → fixated; different file → not;
  reds moved → not; attempt 1 (no prior) → not.
- Content tee green: a translator-level tee captures capped (2KB) edit content with the
  trim announced, memory-only, while the returned gate action stays bytes-only.

**Named limits (unproven by this POC):** the normalizer is validated against the
node-spec reporter only — job #4's grader close needs its own stability check before the
battery reads it; a close with NO gapKeep leaves the red-set empty (compare-equal
always), making the detector write-set-only and more trigger-happy — the build must
record which detector mode ran; and the POC proves MECHANICS only — the effect claim
(repetition drop) is exactly what the acceptance battery measures, by design.

## Addendum 2 — $0 pre-battery reads (2026-07-19, later same day)

- **Grader-close stability: PASS.** Job #4's real close run twice on an identical tree →
  `^TESTGEN ` kept lines byte-identical (the grader emits counts, not timings — we own
  the format). One branch remains suspect by inspection: the clean-red fallback
  (`lines.slice(-40)`) can carry pytest's `in N.NNs` summary — that branch can only make
  the detector UNDER-fire (false movement → silence), never false-fire. Named, accepted.
- **Fixation base rate in the archive: 0/10 — the planned job #4 battery would be
  UNREADABLE as designed.** All 109 surviving spines (jobs #2 + #4; every one pre-Layer-R
  = OFF-arm) swept with the detector's own definition over the real gate audits: 9
  multi-attempt rows, 10 red→red pairs, fixated 0, inaction 4, moved 3, different-file 3.
  The instrument is connected (it populates the other classes), and the pre-gapKeep rows
  bias TOWARD fixation (empty kept-sets compare equal) — the zero survives the bias.
  Job #4's measured disease is inaction/semantic-stall (F38/F39), which the ratchet
  deliberately does not treat. Fixation was observed on JOB #1 (F21: "did the SAME THING
  three times") — whose spines did not survive (the patient clone died with /tmp).
- **Consequence for decision 4:** the acceptance read stays repetition-drop ON/OFF, but
  the JOB must be one with a non-zero fixation base rate. Before freezing any battery:
  a small base-rate probe on job #1 (litectx-maintainer, root OFF, n≈3) to re-establish
  F21's fixation under current code — cap-not-estimate, operator-approved. If job #1
  still fixates, the battery freezes there; if nothing fixates anywhere at current code,
  THAT is a finding (the disease may have died with the edit verb + F30/F32 fixes), and
  Layer R's field read defers to the first job that exhibits it — recorded, not papered.

## Not in scope / parked

- No temperature escalation exists in our ralph, so the BA-14 antagonism (buffer vs
  random diversity) cannot bite today; if sampling variation is ever added, these two
  levers are NOT additive (RSI §3.3) — revisit then.
- Arbiter surface: this build touches ralph/interpret (shell code) but not verdicts,
  budgets, close semantics, or the fence. The interview is the go for exactly this
  scope; anything beyond it gets named and parked per standing rule.
