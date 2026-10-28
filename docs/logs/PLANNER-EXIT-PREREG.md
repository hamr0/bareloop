# Planner-exit POC: pre-registration (frozen 2026-10-28, before any draft)

## Question
Does stating "exit is REQUIRED on EVERY step" plus one legal example (in the draft prompt and in
the missing-exit red detail) cut first-draft plan refusals on DeepSeek?

Root cause: F254 and `.claude/scratch/planner-exit/FINDINGS.md`. `planrun.js:702` never says exit
is mandatory; the redraft gets the rule, with no example.

## Engine
Throwaway copy `.claude/scratch/planner-poc/engine/`, switches `BARELOOP_POC_EXIT_WORDING=new` and
`BARELOOP_POC_DRAFT_ONLY=1` (stop right after plan-accepted or plan-red).

New constant (`engine/src/plan.js`, `POC_EXIT_EXAMPLE`):

    Legal exit examples: a step with no check uses [{"type":"artifact-written","path":"<its target>"},{"type":"tree-changed","scope":"<an offered scope>"}]; a step with a check uses [{"type":"tree-changed","scope":"<an offered scope>"},{"type":"check-passes","name":"<a check name>"}].

New line 702 text (prompt):

    - "exit": REQUIRED on EVERY step — 1..${MAX_EXITS_PER_STEP} form checks that ALL must pass (AND), each one of:

and, after the "MUST be paired with a tree-changed exit" paragraph (line 710), a line holding
`POC_EXIT_EXAMPLE`. The same constant is appended to the missing-required exit red detail
(`plan.js:530`: `... has no progress gate — <POC_EXIT_EXAMPLE>`). OLD arm = unset switch, current
text byte-for-byte.

## Design
- Jobs: pulselog-panel-strict and pulselog-p7-small (E1 battery templates, signed hashes unchanged).
- Arms: OLD vs NEW wording. 12 drafts per job per arm = 48. Drafts only.
- Order as in `.claude/scratch/planner-poc/batch/driver.mjs` (interleaved, pairing flips every rep).
- Per-run ceiling $0.25; total hard stop $3; DeepSeek deepseek-flash.

## Baseline
E1 battery, old wording, same 2 jobs: 17 of 24 first drafts refused.

## Pass rule (hamr, 2026-10-28)
NEW passes if (a) its first-draft refusal count is at most HALF of OLD's in this batch (pooled over
both jobs), AND (b) NEW has no more plan-red (unrecovered) drafts than OLD. Casualties (provider-red,
no job-end) are excluded; 2 casualties in a row stop the batch.

## Power
24 per arm. A pass justifies building the fix in the product with fail-first tests; it is not a claim
of a rate.
