# GUARDLINES-PREREG - can an always-on guard cover a job line? (FROZEN before any number exists)

Frozen 2026-11-02, branch `fix/bad-calls`, before any draft of this POC was run. Rules never loosen post-hoc.

## The defect (live)
Panel session `smvzn2krnxmyu` ($0.04): a 2-line repo job failed drafting (plan-red after 3 tries).
Every numbered job line needs a check (a closeDecl stage `fromLine`) or a drafter-written refusal reason. Line 2 is fully
covered by the MANDATORY guards (write fence, no-suppression, tree-changed), but `checkJobLines` (src/authoring.js) forbids
`fromLine` on a mandatory guard, so the drafter has no legal move: try 1 duplicated a guard (duplicate-kind), try 2 left a
stage untagged, try 3 job-line-uncovered. hamr's ruling: job shape must not matter.

## The job (exact text, two numbered lines; `~` is line 2's rule)
```
Make npm test pass with no failing tests
Fix the cause in the source code under src/
~ no suppression comments and no any annotations
```
Inputs: `repo: <a scratch copy of /home/hamr/PycharmProjects/bareloop-patients/h1-bigfile-try2>` (the patient of the failed session).
Check type: deterministic. Thinking: off (the panel's default).

## Design under test
- OFF = engine copy of HEAD (b78e3cd), unchanged.
- ON = engine copy where a mandatory guard may be linked to job lines in a SEPARATE field `guardLines: [{guard, lines}]`
  (the guard's own object stays byte-identical to the genre's), the validator counts a linked line as covered, and the drafter
  prompt (jobLineTagBlock) tells the drafter it can do this, with a legal example.

## Provider / model
Fireworks, `accounts/fireworks/models/deepseek-v4p1-flash` (key row FIREWORKS_API_KEY, price 0.45 in / 1.8 out per 1M, from
Settings), drafter and judge both. Drafting only: no run is started, no signing.

## Sample
n = 6 OFF drafts + 6 ON drafts of the exact job above, interleaved (OFF1, ON1, OFF2, ...). Total cap $0.50, measured from the
draft logs (the `costUsd` of every call line); stop at the cap, and a draft not run for lack of money counts as not run (the
verdict is then UNDERPOWERED, never PASS).

## Definitions
- draft outcome: reached `plan-ready`/prepared (green) or ended in a stop (plan-red / other). A provider-red/transport casualty
  is not a draft row (it is re-run once; two in a row on one slot is a condition: stop and report).
- line-2 failure (counted in either arm): any try-refusal or final red that is `job-line-uncovered` for line 2, or
  `duplicate-kind` on a stage that repeats a mandatory guard, or a `refused` entry on a line the guards actually check (line 2
  here), or a stage with line 2's fromLine that is a guard duplicate.

## Pass rule (FROZEN)
PASS iff BOTH: (1) ON has 0 of 6 line-2 failures, AND (2) ON final plan-red count <= OFF final plan-red count.
Otherwise FAIL: nothing is built and the result is reported. A line-2 failure in ON is a FAIL even if the draft finally greens.
The test can fail: OFF is expected to show the defect (if OFF shows 0/6 line-2 failures the premise is not reproduced and the
verdict is NO-SIGNAL, nothing is built either).

## What does not count
Provider casualties; n=6 is a screening read, not a rate. The cure is test-proven for the validator/prompt/render; the POC proves
only that the drafter finds the legal move. Not a signed-design or arbiter change: guard stays mandatory, shown-and-fixed, same hash inputs.
