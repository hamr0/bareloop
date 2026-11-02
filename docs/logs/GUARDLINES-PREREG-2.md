# GUARDLINES-PREREG-2 - round 2: tell the drafter the always-on guards exist (FROZEN before any round-2 draft)

Frozen 2026-11-02, branch `fix/bad-calls`. Follows `docs/logs/GUARDLINES-PREREG.md` (1b75452), whose verdict was FAIL: the
drafter found `guardLines` (6/6) but declared a SECOND `files-changed` stage on try 1 in 12 of 12 drafts of both arms, and
ON3/ON6 still ended on job-line-uncovered. hamr ruled GO on option A (2026-11-02). Rules never loosen post-hoc.

## Arms
- OFF = the round-1 OFF rows (OFF1-OFF6): same HEAD engine (b78e3cd src), same job, same model, same patient. NOT re-run.
  Round-1 OFF: plan-red 3/6 (OFF3, OFF5, OFF6); duplicate files-changed stage on try 1 in 6/6.
- ON2 = engine-ON's `guardLines` change PLUS one added drafter-prompt paragraph (jobLineTagBlock area, ON copy only):
  names the always-on guards in plain words (changed-from-seed, no-suppressions, the write fence), says they already exist and
  must NEVER be declared again as a stage (no second files-changed / scope stage, no scope/params on no-suppressions), and that a
  job line they cover is linked via `guardLines`, with one legal example built from a job like this one.
- 6 new ON2 drafts only. Same job text, inputs, model as round 1 (see PREREG-1): Fireworks
  `accounts/fireworks/models/deepseek-v4p1-flash`, deterministic, thinking off, drafting only (no run, no signing).
  Key in the child env only, empty-key guard, scratch HOME. Cap $0.50 this round, measured from draft logs (a slot not run
  for lack of money makes the verdict UNDERPOWERED, never PASS).

## Definitions
- guard duplicate: a stage whose kind duplicates a mandatory guard's kind (duplicate-kind red on files-changed or
  pattern-absent-in-diff for a guard), or a stage carrying a guard's scope/params change (the "guard does not take scope" red).
- line-2 failure: duplicate-kind on a guard, `job-line-uncovered` for line 2, or a `refused` entry for line 2.
- Counted over ALL tries of a draft (a red on any try counts), not only the final.
- Other reds (invalid regex, signing gates / a check not running at the starting point, "no-suppressions does not take
  scope" is counted ABOVE as a guard duplicate) are recorded but are NOT line-2 failures.

## Pass rule (FROZEN)
PASS iff ALL of: (1) ON2 duplicate-kind on a guard kind: 0 of 6 drafts; AND (2) ON2 line-2 failures: 0 of 6; AND
(3) ON2 final plan-red count <= OFF plan-red count (3). Otherwise FAIL: nothing is built; the table and the dominant failure
are reported.

## What does not count
n=6 is a screening read, not a rate; OFF rows are from round 1 (same engine and conditions, earlier in time). PASS proves the
drafter finds the legal move under this prompt; the validator/render/prompt cure is otherwise test-proven only.
