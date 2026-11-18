# Helper-verb experiment: pre-registration (frozen 2026-11-17, before the run-2 patient exists)

Question: does a DeepSeek-flash worker call `ask_helper` on a job that needs multi-file navigation?
Spec: `.claude/scratch/spec-helper-verb.md` (draft). No OFF arm exists, so no lift claim is possible.

## Run 1 (recorded)
Run `mwkhxqmu`: green in 2.1 min, $0.16, 0 `ask_helper` calls (17 read, 16 recall, 12 get, 8 grep). The job was too easy.

## Run 2 rules (frozen)
- One run, DeepSeek direct deepseek-flash, `helperVerb: true`, budgetUsd 1, maxWallMs 20 min. No steering text added, no re-runs, no cap change.
- Uptake = at least 1 `ask_helper` call.
- Recorded: every call's question, answer bytes, and whether the answer named the culprit file (judged by hand from the spine); helper rounds and cost; outcome; total cost; wall; rounds.
- Outcome rule: 0 calls in run 2 closes the experiment as "0 uptake in 2 runs, n=2, UNDERPOWERED, not proof the verb is useless". 1 or more calls: report the answers, make no lift claim.

## Hardness bar (checked at $0 before launch, reported item by item)
1. The culprit file is not named in the job text or the failing assertion.
2. The culprit symbol does not appear in the job text, the close test, or the assertion message.
3. At least 4 source files sit on the call path from the test to the culprit.
4. No existing test directly pins the culprit value.
5. The defect is a logic change (e.g. a wrong comparison or boundary), not a missing list entry findable by grepping one word.
Plus: solvable by elimination, not an inductive leap; seed red and fix-reverted green on one cheap close test.
