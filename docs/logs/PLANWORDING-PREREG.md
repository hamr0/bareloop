# PLANWORDING prereg: does the new exit-example wording reduce the write-without-edit trap shape? (ITEM33-BUILD addendum 2026-11-01, section B.2)

Status: FROZEN before any draft exists. Written 2026-11-02 on branch fix/bad-calls. The rules below never loosen after a number exists.
A surprise is a finding, never a re-tune.

## Question

Section B of the 2026-11-01 addendum says the root of the write-without-edit trap (F271) is our own wording: `EXIT_EXAMPLE` (src/plan.js:42) and the write-only worker persona (src/tools.js:60, :62). Does the new wording make a Muse drafter draft fewer steps that grant `write` without `edit` and gate on `artifact-written` of a file that already exists?

## Provider, model, money

PAID. Baseten, model `meta-models/muse-spark-open-1026`, drafter only, NO workers. About 24 drafts (12 per arm), hard cap $1.00 booked in total; the driver stops before a draft that could pass the cap. The per-draft cost is measured from the first drafts and the cap is by dollars, not by count. Scratch HOME, real `~/.config/bareloop/runs.jsonl` untouched (385 lines before; the driver checks the count at start and end).

## Design

- Job and patient: the bigfile job of the memo proof (`.claude/scratch/h1/templates/bigfile`, patient copy of a bareguard tree; the same resolved spec and signing as the memo proof, rebased only for baseUrl/model/hash as the memo-proof driver does).
- Two throwaway engine copies of HEAD (the branch tip when this prereg is committed) under `.claude/scratch/planwording/`: `engine-A` and `engine-B`. Neither is on the branch. Both carry the same two POC hooks (stop after the draft is validated; save each raw draft text and the engine's own `validatePlan` verdict to a file). The branch itself is not changed by this POC.
- Arm A = current wording at HEAD: `EXIT_EXAMPLE` and persona unchanged.
- Arm B = the new wording from B.1: persona src/tools.js:60 becomes "make the change with the file-changing tool you were given, and stop"; :62 becomes "Make the required changes with your file-changing tool"; `EXIT_EXAMPLE` additionally teaches the read-only look-around shape `{tools:["read","grep"], exit:[{type:"artifact-written", path:<an existing file the step reads>}]}` (the existing two examples stay).
- Honest note on reach: the persona is a WORKER register and never enters the drafter's prompt; only `EXIT_EXAMPLE` does. The persona edit is carried in arm B for fidelity to B.1, but this POC can only read the `EXIT_EXAMPLE` effect on drafts. The $0 byte diff of the drafter input must therefore show exactly one difference, the `EXIT_EXAMPLE` sentence (and the same sentence inside the missing-exit red detail, which uses the same constant). The two engine source trees differ only in src/plan.js (that constant) and src/tools.js (the two persona lines).
- 12 drafts per arm, 24 in all, interleaved: per rep one A and one B back to back, first arm alternating by rep (rep 1 A first, rep 2 B first). Each draft is a fresh scratch HOME and a fresh copy of the template. Each run stops right after the plan is validated (accepted or red); no worker runs, no close runs.
- Casualty handling: a draft with no saved draft text and no job-end (provider failure) is a casualty, excluded from both arms' counts, retried once in the same slot; two casualties in a row stop the driver (a provider condition, not a result).

## Counted units (decided now)

- The plan of a draft = the final validated text: the redraft's text if a redraft happened (draft-1 was red), else draft-1's text.
- PLAN-RED = the plan's own `validatePlan` verdict (the engine's real validator, recorded at the moment of use) is not ok after the one redraft. Reported also: draft-1 red count (secondary, not part of the rule).
- TRAP STEP = a step of a validated-ok plan, read from the RAW draft text (before `pairEditGrant`, which would mask it), whose `tools` include `write` and not `edit`, whose `exit` carries an `artifact-written` whose path exists in the seed tree, and whose `exit` carries no `check-passes`.
- TRAP PLAN = a validated-ok plan with at least one trap step. The rule counts trap plans (one count per plan). Trap steps are reported too (secondary).
- "Exists at seed" is read from the template's `source-seed/tree` listing. The counts are made by a $0 analysis script over the saved draft files, re-running the real `validatePlan` of the HEAD engine (not a re-implementation) as a cross-check of the recorded verdict; if the recorded verdict and the re-run disagree, that is reported as a finding.

## FROZEN pass rule

The trap shape (a step granting `write` without `edit`, carrying `artifact-written` on a file that exists at the seed with no check) must DROP against the baseline arm, AND plan-red must not rise.

Applied exactly: PASS iff trap plans(B) < trap plans(A) AND plan-red(B) <= plan-red(A), both counted with the real `validatePlan` over the saved drafts. Anything else is not a pass. If trap plans(A) = 0 there is no baseline to drop from, and the result is "uninformative (no baseline)", not a pass. Plan-red base for reference (F270): 7 of 32 battery runs, 0 of 12 base round.

12 per arm is UNDERPOWERED: read the outcome as a leaning, not a rate. A pass here licenses building the wording behind the signed tests (section B.3), a fail means the wording is not shipped (B2 still ships alone); neither is a rate claim. A surprise is a finding, never a re-tune: no change to the counted units, arms, or the rule after a draft exists.

## Stops

$1.00 booked (a draft with no spine books $0.10), 2 casualties in a row, a change in the real runs.jsonl line count, engine copy drift, a STOP file.

## Provenance

The sha256 of this file is recorded in the commit body of the commit that adds it, which precedes every draft.
