# MEMOPROOF — does the always-on carry memo earn its place: pre-registration (rev 2 for Baseten Muse; SIGNED and FROZEN 2026-11-01; no number exists yet)

Status: SIGNED and FROZEN 2026-11-01 (hamr). The numbers marked (pick) are fixed as written, at the PROPOSED size (bigfile 6, pulselog 6, p7 4 per arm, 32 runs, $1 per run, $20 total stop, thresholds unchanged). The result is read as a LEANING, not proof: the proof is UNDERPOWERED (about a 30% false-WIN rate at no effect, per the power table). The memo stays always on whatever the result; the proof decides nothing, it only measures. Rev 2 replaces the Fireworks DeepSeek draft: provider, jobs, n, caps and the power table changed; the arms, the decision rule and the measures did not.
Sources: `.claude/scratch/memoproof-base/BASERATE-MUSE.md` and `results.jsonl` (the Muse base-rate round: 12 runs, $4.86, memo ON, n=3 per job, an anecdote); `.claude/scratch/memoproof/BASERATE.md` (DeepSeek base rates from a $0 read of 467 spines; REFERENCE ONLY, never pooled with Muse); `.claude/scratch/memoproof/powersim-muse.mjs` and `powersim-muse.out` (the power table below; the Fireworks-draft sim script was never saved, this one is rebuilt from that draft's stated shape); F258 (the memo's problem and M1 rounds 1-2), F262 (the at-start failure rides in the memo), F264 (fold regression, and the `npm rebuild better-sqlite3` setup lesson), BA-29 in `docs/product/UPSTREAM-ASKS.md` (the tool-call shape defect that dropped change2), `docs/logs/M1-PREREG.md` and `docs/logs/M1-ROUND2-PREREG.md` (on `main`), `docs/logs/SEEDGAP-PREREG.md` and `docs/logs/MAP-PREREG.md` (same style, same held-fixed arms). Rulings carried over: one lever at a time; throwaway engine copy, never product code; the number is read against the frozen rule, never re-tuned. hamr ruled 2026-11-01: the memo WINS if it passes MORE, or passes the SAME and is CHEAPER or FASTER ("either 1 or 2").

## Question

Today the carry memo (`src/carrystore.js`, `src/carrynote.js`; always on since 49ddba2, no switch) is appended to every step and fix worker prompt: files earlier workers read, searches, edits as diff hunks, earlier tries and failures folded, the at-start failure from the seed note, and the old handoff-note file map. With everything else equal, does a run WITH the memo pass more jobs, or pass the same number for less money or less time, than a run WITHOUT it, on Baseten Muse?

## Riskiest assumption

That the memo helps on a mix of jobs at all. The evidence so far is thin and mixed, and all of it is DeepSeek: M1 round 1 failed its repeat-share bar; round 2 (descriptive) read ON 7/9 greens vs OFF 6/9, the whole difference one pulselog run (n=3 per cell, 3,000-char note, an older cap order); F264 saw no regression from the fold but a 3 to 5 times spread inside one arm. On Muse nothing is known about the memo: the base-rate round ran memo ON only. The memo has been judged on mechanism (repeats, delivery) and never on the outcome that matters: greens and what they cost. Not assumed: that the memo's gain, if any, is the same on every job, or that a DeepSeek result carries to Muse (it is not pooled, see Held fixed). The pooled rule is the decision, the per-job table is the explanation.

## Arms

- ON = the released engine: the current code, memo always on. A git worktree at one recorded sha (the sha of the branch tip at sign; at drafting it is `fbc0a8b`; record it in the results file; the tree must be clean, `srcDirty:false`).
- OFF = a throwaway engine copy (a second git worktree at the SAME sha, never shipped, never merged) with ONLY the carry memo removed. The exact minimal patch, one line in `src/planrun.js` (line 1045, re-verified at fbc0a8b):

  `const carry = createCarryStore({ workdir, emit, strikeLimit, resume: resumeBranch !== null && resumeBranch !== undefined });`
  becomes
  `const carry = null;`

  Why one line is enough (re-read from source at fbc0a8b): every other use of `carry` in `src/planrun.js` is null-safe (`carry?.setBase` 2062, `if (seedNote) carry?.setStartFailure` 2216, `if (carry) carry.wrapTools` 2606, `!carry ? inner : ...` 2608, `carry?.settleAsk` 3545 and 4283); `createCarryStore` is used nowhere else (only the import at line 41 and the call at 1045), and nothing outside `src/carrystore.js` reads `.smoke/carry/state.json`. The unused import stays (no other edit). With the patch: no `carry-note` spine records, no memo suffix on any worker prompt, no `.smoke/carry/state.json`, no `at start` failure handed to workers.
- What OFF removes, written plainly: the whole memo, which since b4e8021 and 49ddba2 INCLUDES the old handoff note (file map) and the at-start failure delivery to every step and fix worker (F262's shipped delivery). It does NOT remove the seed note's planner block (`src/seednote.js`), the check gap each retry prompt already carries, the `boundedNote`, or the final text of earlier green steps. So OFF is "no memo at all", not "the memo before the fold". Declared as the arm, not hidden.
- Byte-diff gate, $0, required before any paid run: `git diff --stat` of the OFF worktree against ON shows exactly `src/planrun.js | 2 +-` (the one line, nothing else), AND a behavioural proof: run both engines through the product `scripts/run-u.mjs` on a copy of the p7 seed with a scripted provider (no network, no key) that returns the SAME scripted tool calls and replies to both and records every prompt it receives (planner, scout, every step and fix ask). Pass only if (a) every OFF prompt equals the matching ON prompt with the memo suffix (`"\n\n"` + text starting `== What earlier workers in this run did (facts from the record, written by code) ==`) removed, byte for byte, (b) the planner and scout prompts are identical in both arms, (c) the tool results the scripted worker sees are identical (the `wrapTools` wrapper changes no result), and (d) ON has at least one memo on a non-first ask while OFF has none. Anything else: stop, no paid run, a finding. The proof's script and output go to `.claude/scratch/memoproof/`.
- Engine install, both worktrees: `npm ci --ignore-scripts` THEN `npm rebuild better-sqlite3` (F264: without the rebuild every run is `smoke-red` at $0). Both engines must pass the litectx known-answer smoke ($0) before the first paid run. Record `git rev-parse HEAD` of each worktree and `git diff --stat` of OFF against ON in the results header.
- Engine FREEZE: the whole proof runs on the bare-agent version installed now, `0.55.0` (`node_modules/bare-agent/package.json` at fbc0a8b), in both worktrees (record `npm ls bare-agent bareguard litectx barebrowse` per worktree in the results header; the two must match). BA-29 (the tool-call shape defect) may ship mid-proof; bareloop does NOT upgrade bare-agent, and does not pick up any dependency bump, until the proof ends. A version change in either worktree mid-proof voids the proof.

## Held fixed in BOTH arms (state recorded per run in the results file)

- Same model and provider: Baseten, Settings row `BASETEN_API_KEY`, model `meta-models/muse-spark-open-1026`, baseUrl `https://inference.baseten.co/v1`, price in $1.25 / out $4.25 per 1M, paid from hackathon credits. Every paid run states provider and model in its first line. Muse always thinks (the thinking off switch is ignored by the provider), which is the same in both arms; the thinking rule therefore does not vary the arms. Muse numbers are never pooled with DeepSeek numbers, in this proof or against BASERATE.md.
- Seed note ON (spec `seedNote` absent = product default); `readMap` absent (off); `handoffNote` absent (no effect now); read shim at `cap` (product default).
- Learnings OFF: scratch `config.json` carries `learningHints:false` and NO `carryNote` key, so no cross-run lesson text leaks between arms or between runs. Scratch HOME per run; the real `~/.config/bareloop/runs.jsonl` line count is recorded before and after (must be equal; 385 at drafting).
- Fresh patient per run: a new copy of the job's template seed tree, seed state verified clean at start, never reused, never the original. Templates are rebased to the Muse model/baseUrl exactly as the base-rate driver does (spec rebased, signing hash recomputed); the spec hash must be equal across arms for a job (the memo switch is not in the spec).
- Caps from the signed spec of each job, unchanged (wall 30 min on all three jobs; the driver's outer kill 55 min). Per-run money cap $1.00 requested ceiling: the run ceiling is spec budget minus draft-spent, set as in the base-rate driver (`draft = budget - 1`): bigfile signed $1.50 gives draft $0.50, p7 $1.50 gives $0.50, pulselog signed $5 gives $4.00, so each run is capped at $1.00. Booked spend is read from the spine, never a run.log line.
- Interleaved: per (job, rep) one ON and one OFF run back to back, the first of the pair alternating by rep (rep 1 OFF first, rep 2 ON first, ...) so provider drift and time of day hit both arms. Reps advance round-robin over jobs (bigfile r1 pair, pulselog r1 pair, p7 r1 pair, bigfile r2 pair, ...), so a stop mid-way leaves balanced arms. Sequential, one run at a time, a detached `setsid nohup systemd-inhibit` launch with a PID-based watcher; no test suite runs while a paid run is live.

## Jobs and n (pick)

change2 is DROPPED. On Muse it failed 0 of 3 in the base-rate round (step-red, interpreter-red, step-red) from a tool-call shape defect (the model sent `content` as an object, filed upstream as BA-29), not from anything the memo touches; it cannot discriminate arms on Muse. It is not replaced. Declared plainly: this proof therefore says nothing about rubric (soft-green) jobs.

| job | patient template | why it is in | Muse base rate (n=3, ANECDOTE) | n per arm (pick) |
|---|---|---|---|---|
| bigfile | `.claude/scratch/h1/templates/bigfile` | the only job with headroom on DeepSeek | 2 of 3 green (green, cap-halt, green); median $0.39, 363 s | 6 |
| pulselog (panel-strict) | `.claude/scratch/e1-poc/battery/templates/pulselog` | the job the old note may have flipped on DeepSeek; on Muse 2 of 3 | 2 of 3 (green, escalated, green); median $0.30, 332 s | 6 |
| p7 (pulselog-p7-small) | `.claude/scratch/e1-poc/battery/templates/p7` | typecheck fix, short runs: a cost and wall read | 3 of 3; median $0.27, 178 s. AT CEILING in the sample | 4 |

Total 16 per arm, 32 runs. The n=3 base rates are an anecdote, not an estimate (a 3/3 is compatible with a true rate well below 90%; a 2/3 with anything from about 20% to 95%). Declared up front: p7 at 3/3 may be a ceiling job that can only show cost and wall; the greens verdict rests on bigfile and pulselog (12 runs per arm). If the pooled greens come out SAME and the cost or wall rule fires, that is a win on cost or time, not on passes, and is named so.
Driver: extend `.claude/scratch/memoproof-base/driver.mjs` (the Muse driver that worked: provider block, rebase of the templates, `--preview/--run/--analyze`, key into the child env only, HEAD/dirty/runs.jsonl guards) with the two-engine-worktree pattern of `.claude/scratch/fold-regress/driver.mjs` (OFF/ON engine dirs, `ENGINES` map) and the job list above.

## Caps

- Per-run cap $1.00 (see Held fixed). Measured worst Muse run in the base round: bigfile cap-halt at $1.004.
- Total stop $20.00 booked: the driver refuses to START a run if booked + $1.00 would pass $20.00. Expected spend (power table below): about $10.4 from the Muse medians, about $14.3 from the observed Muse means (bigfile's cap-halt run pulls its mean to $0.59), for the proposed n. The OFF arm is untested on Muse and may cost more. Cap-not-estimate: a run that hits a cap stops; no widening; the cap-shaped negative is a result.
- 2 casualties in a row: stop the battery, re-probe the provider, no automatic resume. The remaining quota of that arm is NOT topped up by relaxing a rule.
- Preflight PASS required before the first paid run: 2 consecutive HTTP 200 replies from the model that each parse into a tool call, through the engine's own `makeProvider` (the MAP preflight pattern, tool-call variant). Plus the byte-diff gate above. No preflight PASS, no battery.

## Measures

PRIMARY 1 (passes): greens per arm, pooled across all jobs and reps, from the run's `job-end` outcome (`green` only; `already-green` cannot occur on a fresh patient). Casualties excluded.

PRIMARY 2 (cost and wall, used ONLY when greens are SAME): per run, `cost_norm = booked cost / M_cost(job)` and `wall_norm = wall / M_wall(job)`, where `M_*(job)` is the median over ALL non-casualty runs of that job, both arms (a neutral denominator that puts three jobs of different price on one scale). The arm statistic is the MEDIAN of `cost_norm` (resp. `wall_norm`) over ALL the arm's non-casualty runs, green or not (pick: all runs, so an arm cannot look cheap by failing fast while the greens rule is SAME; a cost-capped or wall-capped red counts at what it spent). Ratio = ON statistic / OFF statistic. Wall = first to last spine `ts` of the run (job-start to job-end, drafting spend before job-start excluded and listed separately). Cost = spine job-end `spentUsd` with `spendComplete` true; a run with `spendComplete:false` is a casualty. Muse always thinks, so both arms' costs include thinking tokens; the ratio is arm against arm only.

REPORTED beside, never decisive: cost per green (arm total cost / arm greens), greens per dollar, per-job table (greens, median cost, median wall, outcomes).

SECONDARY (report-only, never read as a win or a loss): worker turns, tokens (input, cache read, cache write, output), re-reads (same path and tool with no write between, split by worker boundary), tries and fix tries to green, ctx_get no-chunk count, fix-loop seconds, wall-cap hits, malformed or bad tool-call counts per arm (BA-29 class; if one arm has clearly more, that is stated), `carry-note` records and sizes in the ON arm, plan shape (steps, tries) per run.

## Decision rule (frozen at sign; unchanged from the Fireworks draft)

Let G_on and G_off be the pooled greens of the paired non-casualty runs (see Casualties for equal denominators), R_cost and R_wall the ratios above.

1. WIN-MORE: G_on >= G_off + 3.
2. LOSE: G_off >= G_on + 3.
3. Otherwise (|G_on - G_off| <= 2) the greens are SAME, and then:
   - WIN-CHEAPER/FASTER: R_cost <= 0.80 OR R_wall <= 0.80. Named by whichever fired (cheaper, faster, or both).
   - LOSE (same greens): R_cost >= 1.20 AND R_wall >= 1.20.
   - Else NO DIFFERENCE.
4. A WIN-MORE is not cancelled by cost or time; cost and wall are printed next to it. A LOSE on greens is not softened by cost or time either.
5. Per-job breakdown is report-only; no job can overturn the pooled verdict, and no rerun, no extra n, no change of the pooled set after the data exists.
6. WIN (either kind) is read as "on this job mix, with Muse, the memo earned its place"; it does not by itself change a default (there is no switch). LOSE or NO DIFFERENCE is read as "no evidence the memo pays for its prompt tokens", and any removal is hamr's call, not the result's.

### Power table (the rule above, simulated; `.claude/scratch/memoproof/powersim-muse.mjs`, 20,000 trials per cell, order of magnitude only)

Model: greens Bernoulli per run at the Muse base rates (bigfile 0.67, pulselog 0.67, p7 0.90 shrunk from the 3/3 so it is not a pure ceiling; a p7=1.00 variant is in the file and moves nothing by more than 2 points); cost lognormal sigma 0.6 (carried from the Fireworks draft; NOT measured on Muse, the 12 base runs are too few); wall correlated 0.8 with cost; no casualties; thresholds exactly as frozen (+3, 0.80, 1.20). The rule is workable at these n (no cell is degenerate, and the shape matches the Fireworks draft's), so it is kept unchanged.

| scenario | small: 4/4/3 per arm (22 runs) | PROPOSED: 6/6/4 per arm (32 runs) | large: 8/8/5 per arm (42 runs) |
|---|---|---|---|
| no true effect: false WIN-MORE | 10.6% | 15.2% | 18.7% |
| no true effect: false WIN-CHEAPER/FASTER | 23.1% | 15.5% | 11.6% |
| no true effect: false WIN, either kind | 33.7% | 30.7% | 30.3% |
| no true effect: false LOSE (greens or cost) | 20.5% | 22.0% | 24.0% |
| true +20 pts pass (bigfile, pulselog): WIN-MORE detected | 29.7% | 48.3% | 60.6% |
| true +20 pts: any WIN | 50.3% | 59.8% | 67.9% |
| true -20 pts (harm): LOSE on greens detected | 33.8% | 49.2% | 59.6% |
| true cost x0.70, no pass effect: WIN-CHEAPER/FASTER detected | 51.2% | 46.5% | 43.1% |
| true cost x1.30, no pass effect: LOSE-cost detected | 23.3% | 20.4% | 17.4% |

Read:
- UNDERPOWERED at every option, declared now, before any data. At the proposed n a memo with NO effect is still called a win of one kind or the other about 3 times in 10 and a loss about 2 times in 10; a real +20-point gain is caught about half the time (48%), a real 30% cost change on the memo-costlier side about 1 time in 5.
- More n buys power on greens (+20 pts: 30% to 48% to 61%), but the false WIN-MORE and false LOSE rates on greens also rise (11% to 15% to 19% each side), and the cost branch gets slightly weaker (a real x0.70 cost is caught 51%, 47%, 43%), because the greens branch is read first and pre-empts it more often. Bigger n does not make the rule safer, only more sensitive; the false-call rate stays near 30% either way.
- A WIN-CHEAPER/FASTER is a leaning, not proof. A WIN-MORE at +3 is not proof either: it fires on a no-effect memo about 1 time in 7.
- A NO DIFFERENCE or a SAME-greens result does not mean no effect.

## Expected cost (the stop is $20; 2 arms)

| option | runs | from Muse medians (bigfile $0.39, pulselog $0.30, p7 $0.27) | from observed Muse means (bigfile $0.59, pulselog $0.42, p7 $0.26) | wall, sequential, from median walls |
|---|---|---|---|---|
| small 4/4/3 per arm | 22 | about $7.1 | about $9.7 | about 1.8 h |
| PROPOSED 6/6/4 per arm | 32 | about $10.4 | about $14.3 | about 2.7 h |
| large 8/8/5 per arm | 42 | about $13.7 | about $18.8 | about 3.6 h |

(Medians: n per arm x 2 x per-job median. Means: the same with the observed base-round means; that base round had one $1.00 cap-halt among three bigfile runs.) The large option sits within about $1.2 of the $20 stop on the means, so it risks a stop before the last rep. The proposed option leaves about $5.7 of headroom on the means.

## Casualties

Excluded from the denominators, never evidence, replaced once per run (not per battery): provider-red, a run with no `job-end` (no job-end = casualty), transport failure, a 429 that ends the run, `spendComplete:false`, a failed byte-diff or delivery check (ON run with no `carry-note` record on a non-first ask; OFF run with any `carry-note` record or a `.smoke/carry` directory), a run that dies before job-start, an install or `smoke-red` stop. A run stopped by its cap, by the wall clock, or ending `step-red`/`escalated`/`plan-red`/`wall-halt`/`cap-halt` is a RESULT (non-green), not a casualty. 2 casualties in a row stops the battery. A repeating casualty class is a condition, not a casualty: stop and re-probe.
Equal denominators: if after replacement a (job, rep) pair has only one arm, drop the other arm's run of that pair from every statistic (listed in the results); greens and cost/wall use the same surviving pairs.
A plan-red (the planner's draft refused before any worker ran) is a RESULT, not a casualty: the planner and scout prompts are identical across arms (byte-diff gate), so it is chance and counts as a non-green run in whichever arm drew it, reported separately.
A tool-call shape failure of the BA-29 class (the model's call is voided or bad) inside a run that still reaches `job-end` is a RESULT, in whichever arm it falls (it is part of the model's behaviour on this engine, frozen at 0.55.0), and is counted in the secondary measures. It is a casualty only if it ends the run with no `job-end`.

## Underpowered, declared now

16 runs per arm over three jobs of different difficulty (the power table above, before any data). UNDERPOWERED for any rate: no percentage claim beyond "this arm's greens out of this arm's n". p7 at 3/3 may add almost nothing on greens; the greens verdict rests on bigfile and pulselog (6 per arm each). A SAME on greens does not mean no effect. Per-run noise is large (F264's four p7 runs spanned $0.07 to $0.37 and 1:49 to 14:45 within one arm; the Muse base round's bigfile runs spanned $0.38 to $1.00). One model, one provider, three patients; patients are the same repos every rep (fresh copies, same defect), so reps within a job are not independent across the patient. The base rates feeding the power table are n=3 anecdotes.

## What is NOT claimed

- Anything about other models or providers, in particular DeepSeek (not re-measured, never pooled), jobs the memo was not run on, or rubric (soft-green) jobs (change2 dropped).
- That the memo's gain is the same on every job, or that any single section of the memo (the file map, the diff hunks, the folded failures, the at-start failure) is what helps: the arm removes the whole memo.
- That OFF equals "the engine before the memo existed": the planner seed block, the retry gap and the bounded note stay in OFF.
- That the cost/time branch is proof (see the power table).
- Anything about the M1 round 2 numbers or the Fireworks base rates: reference only, never pooled.
- That the engine keeps its BA-29 behaviour in later bare-agent versions: the proof is frozen at 0.55.0.
- Greens as skill: a green is the job's own close, nothing more.

## Casualty-proof checklist before the first paid line (all $0)

1. Both worktrees at the recorded sha, ON clean, OFF = ON + the one-line patch only (`git diff --stat`: `src/planrun.js | 2 +-`).
2. `npm ci --ignore-scripts` and `npm rebuild better-sqlite3` in both; litectx known-answer smoke green in both; `npm ls bare-agent` reads 0.55.0 in both.
3. Byte-diff proof PASS (above).
4. Preflight: two consecutive 200s from `meta-models/muse-spark-open-1026`, each parsing into a tool call.
5. Scratch config: `learningHints:false`, no `carryNote` key, one Baseten row (`BASETEN_API_KEY`, baseUrl, prices 1.25 / 4.25); per-run HOME; real `runs.jsonl` line count recorded (385) before and after.
6. Seed state of each template verified clean; spec hash equal across arms per job; run cap $1.00 confirmed per job (draft = budget - 1).
7. `--preview` lists the 32 runs in order, sizes the cap math ($1 x 32 against the $20 stop), and exits at $0.

## For hamr to confirm at sign

1. OFF removes the WHOLE memo (file map, hunks, folded failures, at-start failure delivery to workers), one line `const carry = null;` at `src/planrun.js:1045`; the planner seed block stays.
2. Provider and model: Baseten `meta-models/muse-spark-open-1026`, `BASETEN_API_KEY`, prices 1.25 / 4.25, hackathon credits. Muse always thinks in both arms; never pooled with DeepSeek.
3. Jobs and n: bigfile 6, pulselog 6, p7 4 per arm (32 runs, about $10 from medians, about $14 from means). Options in the power table: small 4/4/3 (22 runs, about $7 to $10) or large 8/8/5 (42 runs, about $14 to $19). change2 dropped (BA-29), not replaced.
4. Decision numbers unchanged: WIN-MORE at +3 greens, SAME within 2; cost/wall 0.80 (either) for a win, 1.20 (both) for a loss. At the proposed n, a no-effect memo is called a win about 31% of the time and a loss about 22%; the proof is UNDERPOWERED as declared. Are the job-normalised medians over all runs (pick) acceptable?
5. Caps: $1 per run, $20 total stop, 2-casualty stop; bare-agent frozen at 0.55.0 for the whole proof even if BA-29 ships.
6. A WIN means "the memo earned its place on this mix with Muse", a LOSE or NO DIFFERENCE means "no evidence it pays"; neither changes a default or removes code by itself.
7. The byte-diff gate (one-line diff, scripted provider, memo suffix is the only difference) is a hard gate before spending.

Signed: hamr, 2026-11-01 ("yeah, run as it is, i won't make use of the credit otherwise"). Size = the PROPOSED option (bigfile 6, pulselog 6, p7 4 per arm, 32 runs, $1 per run, $20 total stop, thresholds unchanged). Read as a LEANING, not proof (UNDERPOWERED, about a 30% false-WIN rate at no effect per the power sim). The memo stays always on whatever the result.

---
sha256 of this file above this footer (frozen, never edited again): 1d4c17b8b0528ee990436812b75d9b2e45077e4d5b4a49cd1d7ec2d30ce4c06a
