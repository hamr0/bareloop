# SEEDGAP — start-of-run check note: pre-registration (DRAFT 2026-10-31, NOT signed, NOT frozen; no number exists yet)

Status: SIGNED by hamr 2026-10-31 ("signed, test"); frozen before any number
Sources: Part 1 $0 measurement `.claude/scratch/seedgap/out-bigfile.json` (script `seedgap.mjs`), `.claude/scratch/bigfile-next/READ.md`, F257, F258, F261, HARNESS2 section 9. Rulings carried over: one lever at a time; worker-side text is facts only; ON/OFF switch enters the signed hash, the text does not; throwaway engine copy, never product code, until a result.

## Question

If the planner and the first worker are told, read-only, what the job's own check said on the untouched tree ("At start, the job's own check said: ..."), do workers on a search-shaped job start writing?

## Riskiest assumption

That the blocker on bigfile is that nobody is told WHICH test fails (F257 read: 52/52 bounded tries wrote nothing, and the only exit the worker sees is `tree-changed`), and that naming the failing test title is enough to turn a search into an elimination. Not assumed: that the model then finds the plant. A write is movement, not a fix.

## What Part 1 showed (facts, $0, seed copy of the h1-bigfile patient, scratch HOME)

- The scout already receives `pre.gap`, but that is only the FIRST red stage of the precheck (`changed-from-seed`: "nothing changed against the seed", 125 chars). It carries no test information.
- Stage `suite-exits-green` (command-exit): 1,654 chars, 41 lines, all of it the first 40 lines of passing TAP output; "9589 of 9628 lines withheld". It cannot show a failure. Pure noise.
- Stage `suite-zero-failures` (count-not-worse): 464 chars, 6 lines; the only stage whose text names the failing test: `not ok 113 - a resource halt routes through humanChannel topup end-to-end (the real operator flow)`.
- Side finding (not part of this test): because the close is first-red-wins and `suite-exits-green` sits before `suite-zero-failures`, the gap a worker gets after an unfixed write is the noisy one; the `not ok` line is never what the worker is shown. Reordering or reshaping close output is arbiter territory, parked for hamr, not touched here.

## The change (ON arm)

One block of text, built by code from the preflight's own stage results (no extra close run, no verdict change, no model call):

  At start, the job's own check said:
  <the gap text of each stage that was red at seed, is a count-not-worse stage, and is not changed-from-seed>

Which stages: red at seed, kind `count-not-worse` only. `command-exit` stage text is NOT used (noise, cut at 40 lines, cannot carry the failure). `changed-from-seed` is NOT used (it is the "no file changed yet" fact every run starts with; the worker is told that already). Text is passed as the stage rendered it (its own 40-line cap, secret-masked), never edited or summarised.

Where shown (recommend): the planner prompt and the step prompt of the FIRST worker of step 1, once. Not the scout. Why: the scout slot already exists but carries `changed-from-seed` text; filling it changes what the scout surveys, which changes the survey blob the planner gets, so one lever would move two prompts through a path that also costs scout rounds. Planner plus first worker is the smallest surface that reaches both the number of rounds it picks (F257) and the first reads. Later tries and steps get the carry note as today (the failure text of each try is already folded there, F261).

Held fixed in both arms: carry note ON, cap 12,000 characters, as on branch fix/carry-red HEAD (record the commit sha); handoff note ON; read-shim at product default; learnings OFF (no prior rows, so no hint text differs between arms); thinking per the one rule. The state is recorded in the results file per run.

## Culprit-leak rule (frozen; the doctrine: the close never names the culprit)

- Allowed: count-stage text whose only non-test content is test titles, counts and baseline lines.
- Check, run in code at every ON run start before the text is shown: the text must contain none of the planted markers. For bigfile the marker list is `src/gate.js`, `gate.js`, `_resourceFromRule`, `budget.resource.`. Part 1 result on the real seed text: 0 hits. (The title says "resource halt", a topical hint, not a file or function name; declared here as accepted, since the same title is what the close already hands to every fix try.)
- If any marker hits: the text is withheld, the run is recorded `ON-inert-leak`, and it is excluded from the ON denominator and replaced by one more ON run (max 1 replacement). Never edit the text to remove the hit.
- Any other stage whose text names a source file as the culprit is dropped, not trimmed.
- Other jobs: none enter (see Jobs).

## Jobs

- Primary and only: `bigfile` (h1-bigfile, bareguard 0.28.0 copy, one planted character in `_resourceFromRule`, src/gate.js; template `.claude/scratch/h1/templates/bigfile`). Seed text proven at $0 above.
- p7 (pulselog-p7-small) and pulselog-panel-strict: NOT entered. Their seed text (typecheck stage, 705 and 2,226 chars) lists the files and lines to fix, which is what the goal already names, so there is no culprit rule to test; and their bounded tries mostly wrote (READ.md: bigfile is the only job where a bounded try never wrote). A run there could not move the primary.
- fix-slugify, slugify-live, p6-worktree-test: no seed patient exists (only a bridge file and repo test files). Not entered.
- change2: rubric job, no test text. Not entered.

## Arms and n

- OFF: today's prompts (carry note as above).
- ON: today's prompts plus the block above.
- n = 3 per arm on bigfile, alternating OFF/ON, OFF first. UNDERPOWERED, declared now: 3 vs 3 cannot support a rate claim; the read is "moves / does not move", never a percentage.

## Provider and caps

- Fireworks, Settings row `FIREWORKS_API_KEY`, model `accounts/fireworks/models/deepseek-v4p1-flash`; price in $0.45, out $1.80 per 1M. Every paid run states provider and model in its first line. Probe the model with 2 consecutive 200s before firing.
- Cap per run $1.00 (measured bigfile cost $0.16-$0.41 per run, F257). Total cap $6.00 (6 runs plus at most 1 leak replacement, ceiling 7 x $1; expected about $2). Cap-not-estimate: a run that hits it stops; no widening.
- Wall time: the operator-set value used in the H1 battery for bigfile, recorded per run.

## Measures

PRIMARY: first write. A run scores 1 if any try of the FIRST plan step writes a file, from the real gate audit (run_id-scoped, allow-decision, write and edit actions), never `git status`. Baseline in the archive: 0 of 13 runs, 0 of 52 bounded tries (those runs had the 3,000-char carry note or none, so OFF is re-measured here and is its own baseline).

SECONDARY (reported, not decisive): greens; rounds used before the first write; whether the first write touched src/gate.js; cost per run.

REPORT-ONLY, never read as a win or a loss: cost, turns, calls, wall time, rounds the planner chose, reads of test/ files vs src/ files.

## Decision rules (frozen at sign)

- ON primary 2 or 3 of 3 AND OFF primary 0 or 1 of 3: SIGNAL. Read as "the note moves workers to write on this job", n=3, one job, one patient. Next step is a larger n or a second search-shaped job, not a default flip.
- ON 1 of 3, or ON 2 or 3 of 3 with OFF also 2 or 3 of 3: INCONCLUSIVE. No default change; no rerun to rescue it.
- ON 0 of 3: FAIL for this job. Lever closed; the finding is "naming the failing test does not start writes on bigfile".
- Greens do not enter the pass rule. A green is a finding about the whole loop and is reported next to the primary.
- Two should-differ arms producing identical per-run output (same plan, same reads) is a finding that the text did not reach the prompts; check by byte-diff of the planner prompt and the step-1 prompt between arms before reading any result.

## Casualties

Provider-red, transport failure, a 429 that ends the run, or an OFF/ON text byte-diff showing the block missing from ON (or present in OFF): casualty, excluded from the denominators and replaced once; never evidence. A run stopped by the cap counts normally (it is a result). A repeating casualty class stops the battery.

## Known gaps, written up front

- n=3 per arm, one job, one patient, one provider: no rate, no generalisation.
- A write is not a fix: ON could write wrongly. The primary measures movement only.
- bigfile's failing-test title was written by the bareguard authors, not by us; real jobs may name tests less helpfully. The result says nothing about jobs where the failing test is not named.
- The ON text appears only if preflight ran the count stage with a test failing; a seed where it passes yields no block (recorded inert).
- Cost and the side finding on close ordering are not tested here.

## For hamr to confirm at sign

1. Planner plus step-1 first worker only (not the scout).
2. Count-stage text only; command-exit text dropped.
3. Caps $1 per run, $6 total.
