# SKILLPROOF — does a short "engineering workflow" skill text in the worker's system prompt help: pre-registration (SIGNED 2026-11-11; no number exists yet)

Status: SIGNED 2026-11-11 (hamr) and FROZEN. Structure, decision rules, jobs, counts, provider and caps are copied from `docs/logs/MEMOPROOF-PREREG.md` (rev 2, signed 2026-11-01); only the arm differs.

**UP FRONT: UNDERPOWERED. The result is a LEANING only, never proof.** At 32 runs (bigfile 6, pulselog 6, p7 4 per arm) a skill text with NO effect is still called a win of one kind or the other about 3 times in 10 (about 30% false-WIN) and a loss about 2 times in 10 (power table below, carried from the memoproof simulation: same n, same thresholds). A SAME or NO DIFFERENCE does not mean no effect.

Sources: `docs/logs/MEMOPROOF-PREREG.md` and its power table (`.claude/scratch/memoproof/powersim-muse.mjs`), the memoproof driver (`.claude/scratch/memoproof-run/driver.mjs`), the scripted prompt proof pattern (`.claude/scratch/memoproof/promptproof.mjs`). Rulings carried over: one lever at a time; throwaway engine copy, never product code; the number is read against the frozen rule, never re-tuned.

## Question

With everything else equal, does a worker whose system prompt carries a short engineering-workflow skill text pass more jobs, or pass the same number for less money or less time, than a worker without it, on Baseten Muse? Plan (planner) and carry memo are ON in BOTH arms (both always on).

## Arms (the arm's ONLY difference is the skill text)

- OFF = the engine at one recorded sha, untouched (a git worktree, `engine-off`, clean).
- ON = a second worktree at the SAME sha (`engine-on`), never shipped, never merged, with ONLY this change in `src/planrun.js` (the single place the worker system prompt is built, `const system = PERSONA_TOOLS + strategyFor(granted) + ...`, re-verified by grep: `PERSONA_TOOLS` is used for a worker prompt nowhere else in `src/`; `scripts/n3-preprobe.mjs`, `probe-materials.mjs`, `reuse-preprobe.mjs` are probes outside the run path): one constant `SKILL_TEXT` is appended at the end of that concatenation, GATED on `mkWorker`'s `writable` parameter: `+ (writable ? SKILL_TEXT : '')`. That site (`mkWorker`) also builds the scout (`phase: 'scout'`) and the drafter/planner (`phase: 'plan'`/`'replan'`), all with `writable:false`; only the step workers (`step:*`) and the fix worker (`phase: 'fix'`) are `writable:true`. So the skill text reaches step and fix workers ONLY; scout, planner and drafter prompts are byte-identical across arms (proof check (c)). Decided by hamr's coordinator after the unguarded append was found to reach scout and planner.
- The skill text, verbatim (appended after a blank line, i.e. the constant begins with two newlines):

```
How to work:
1. Look before you change: find the code you will touch, plus its callers and uses.
2. Check before you create: do not add a file or function that already exists.
3. Add a test only if the job asks for one, or a bug fix needs one to stop it coming back.
4. Before you finish, re-read your change against what the step asks for.
```

- Byte-diff gate, $0, required before any paid run: (a) the `src/` diff between `engine-on` and `engine-off` is exactly the `SKILL_TEXT` addition (a `diff -r` of the two `src/` trees, plus `git diff` of ON: one removed line, two added lines, nothing else; OFF clean); (b) a scripted-provider prompt proof (loopback server, fake key, no network) through the product `scripts/run-u.mjs` on a copy of the p7 seed: every ON step/fix worker request's system message equals OFF's with the skill text appended, byte for byte (after run-id/port/timestamp normalisation); the skill text appears in every ON worker system prompt and in NO OFF worker prompt; planner, scout and every non-system message are identical between arms; non-message request fields (tools, params) identical; the memo is present on non-first worker asks in BOTH arms. Anything else: stop, no paid run, a finding. Judge/drafter prompts are not built by this path (the planner/scout requests are the toolless and survey requests; the scripted server checks that the skill text reaches none of them).
- Engine install, both worktrees: `npm ci --ignore-scripts` THEN `npm rebuild better-sqlite3`. Both must pass the litectx known-answer smoke ($0).
- Engine FREEZE: the whole proof runs on the installed versions (bare-agent 0.59.0, bareguard 0.31.0, litectx 0.41.0, barebrowse 0.25.0; engine sha 26ee199f), identical in both worktrees; a version change mid-proof voids the proof.

## Held fixed in BOTH arms

- Same model and provider: Baseten, key env `BASETEN_API_KEY`, model `meta-models/muse-spark-open-1026`, baseUrl `https://inference.baseten.co/v1`, price in $1.25 / out $4.25 per 1M. Muse always thinks (same in both arms). Never pooled with DeepSeek or with memoproof numbers.
- Seed note ON (default); `readMap` absent; `handoffNote` absent; read shim at `cap`; carry memo ON (always on); plan ON.
- Learnings OFF: scratch `config.json` carries `learningHints:false`, NO `carryNote` key. Scratch HOME per run; the real `~/.config/bareloop/runs.jsonl` line count is recorded before and after (must be equal).
- Fresh patient per run from the job's template; templates rebased to the Muse model/baseUrl, spec hash recomputed; the spec hash is equal across arms for a job (the skill text is not in the spec).
- Caps from each signed spec (wall 30 min; driver outer kill 55 min). Per-run money cap $1.00 (run ceiling = spec budget minus draft spent; draft = budget - 1). Booked spend is read from the spine.
- Interleaved: per (job, rep) one ON and one OFF run back to back, first arm alternating by rep (rep 1 OFF first, rep 2 ON first, ...); reps advance round-robin over jobs. Sequential, detached `setsid nohup systemd-inhibit` launch with a PID watcher; no test suite runs while a paid run is live.

## Jobs and n

| job | patient template | n per arm |
|---|---|---|
| bigfile | `.claude/scratch/h1/templates/bigfile` | 6 |
| pulselog (panel-strict) | `.claude/scratch/e1-poc/battery/templates/pulselog` | 6 |
| p7 (pulselog-p7-small) | `.claude/scratch/e1-poc/battery/templates/p7` | 4 |

Total 16 per arm, 32 runs. change2 stays dropped (BA-29 class shape defect on Muse; the proof says nothing about rubric jobs). Muse base rates from memoproof (n=3, anecdotes, memo ON): bigfile 2/3, pulselog 2/3, p7 3/3; p7 may be a ceiling job showing only cost and wall; the greens verdict rests on bigfile and pulselog.

## Caps

- Per-run cap $1.00. Total stop $20.00 booked: the driver refuses to START a run if booked + $1.00 would pass $20.00. Cap-not-estimate: a run that hits a cap stops; no widening.
- 2 casualties in a row: stop, re-probe the provider, no automatic resume. Preflight PASS required before the first paid run: 2 consecutive HTTP 200 replies each parsing into a tool call, through the engine's own `makeProvider`. Plus the byte-diff gate. No preflight PASS, no battery.

## Measures

PRIMARY 1 (passes): greens per arm, pooled across jobs and reps, from the run's `job-end` outcome (`green` only). Casualties excluded.

PRIMARY 2 (cost and wall, used ONLY when greens are SAME): per run `cost_norm = booked cost / M_cost(job)` and `wall_norm = wall / M_wall(job)`, where `M_*(job)` is the median over ALL non-casualty runs of that job, both arms. The arm statistic is the MEDIAN over ALL the arm's non-casualty runs, green or not. Ratio = ON statistic / OFF statistic. Wall = first to last spine `ts` (job-start to job-end). Cost = spine job-end `spentUsd` with `spendComplete` true (else casualty).

REPORTED beside, never decisive: cost per green, greens per dollar, per-job table.

SECONDARY (report-only): worker turns, tokens, re-reads, tries to green, tool mix (read/write/edit/ctx counts per arm, in particular whether ON creates fewer new files or adds fewer tests), malformed/bad-call counts, `carry-note` records (report-only counting), plan shape.

## Decision rule (frozen at sign; identical to MEMOPROOF)

Let G_on and G_off be the pooled greens of the paired non-casualty runs.

1. WIN-MORE: G_on >= G_off + 3.
2. LOSE: G_off >= G_on + 3.
3. Otherwise (|G_on - G_off| <= 2) the greens are SAME, and then: WIN-CHEAPER/FASTER if R_cost <= 0.80 OR R_wall <= 0.80 (named by whichever fired); LOSE (same greens) if R_cost >= 1.20 AND R_wall >= 1.20; else NO DIFFERENCE.
4. A WIN-MORE is not cancelled by cost or time; a LOSE on greens is not softened by them.
5. Per-job breakdown is report-only; no rerun, no extra n, no change of the pooled set after the data exists.
6. WIN is read as "on this job mix, with Muse, the skill text helped"; LOSE or NO DIFFERENCE as "no evidence it helps". Neither changes a default by itself: shipping the text is hamr's call.

### Power table (carried unchanged from MEMOPROOF: same rule, same n, same base-rate shape; order of magnitude only)

| scenario | PROPOSED: 6/6/4 per arm (32 runs) |
|---|---|
| no true effect: false WIN-MORE | 15.2% |
| no true effect: false WIN-CHEAPER/FASTER | 15.5% |
| no true effect: false WIN, either kind | 30.7% |
| no true effect: false LOSE (greens or cost) | 22.0% |
| true +20 pts pass: WIN-MORE detected | 48.3% |
| true -20 pts (harm): LOSE on greens detected | 49.2% |
| true cost x0.70, no pass effect: WIN-CHEAPER/FASTER detected | 46.5% |

Read: UNDERPOWERED. A no-effect skill text is called a win about 3 times in 10; a real +20-point gain is caught about half the time. Note the sim was built for memoproof's base rates and cost spread (lognormal sigma 0.6, not measured on Muse); it has not been re-run for this proof.

## Expected cost

About $10.4 from the memoproof Muse medians, about $14.3 from the observed means, wall about 2.7 h sequential; worst case 32 x $1 = $32 against the $20 stop (a run starts only while booked + $1 <= $20).

## Casualties

Excluded from denominators, never evidence, replaced once per run: provider-red, a run with no `job-end`, transport failure, a 429 that ends the run, `spendComplete:false`, a failed byte-diff or delivery check (a run in either arm with no `carry-note` record on a non-first ask), a run that dies before job-start, an install or `smoke-red` stop. A run stopped by its cap, wall clock, or ending `step-red`/`escalated`/`plan-red`/`wall-halt`/`cap-halt` is a RESULT. 2 casualties in a row stops the battery. Equal denominators: a (job, rep) pair with one arm missing drops the other arm's run from every statistic. A plan-red is a RESULT in whichever arm drew it (planner prompts are identical across arms). A BA-29-class bad tool call inside a run that reaches `job-end` is a RESULT.

## Underpowered, declared now

16 runs per arm over three jobs of different difficulty; no percentage claim beyond "this arm's greens out of this arm's n". One model, one provider, three patients (fresh copies, same defect each rep), so reps are not independent across the patient. Per-run noise is large (memoproof saw $0.07 to $1.00 and 1:49 to 14:45 inside one arm).

## What is NOT claimed

- Anything about other models, providers, jobs, or rubric (soft-green) jobs.
- That any one line of the skill text is what helps or hurts: the arm adds all four lines together.
- That a skill text for the planner/drafter/judge would behave alike: this arm touches the WORKER prompt only.
- That the text is read or obeyed: the proof measures outcomes, not compliance.
- That the cost/time branch is proof. Greens as skill: a green is the job's own close, nothing more.

## Casualty-proof checklist before the first paid line (all $0)

1. Both worktrees at the recorded sha; OFF clean; ON = OFF + the SKILL_TEXT change only.
2. `npm ci --ignore-scripts` and `npm rebuild better-sqlite3` in both; litectx smoke green; dependency versions identical.
3. Byte-diff gate and scripted prompt proof PASS (above).
4. Preflight: two consecutive 200s from the model, each parsing into a tool call.
5. Scratch config (`learningHints:false`, no `carryNote`, one Baseten row, prices 1.25 / 4.25); per-run HOME; real `runs.jsonl` count recorded before and after.
6. Seed state of each template clean; spec hash equal across arms; run cap $1.00 per job.
7. `--preview` lists the 32 runs, sizes the cap math, exits at $0.

## For hamr to confirm at sign

1. The arm's only difference is the appended skill text (verbatim above), at the single worker system-prompt site in `src/planrun.js`.
2. Provider and model: Baseten `meta-models/muse-spark-open-1026`, prices 1.25 / 4.25; never pooled.
3. Jobs and n: bigfile 6, pulselog 6, p7 4 per arm (32 runs); decision numbers unchanged (+3 greens; 0.80 either / 1.20 both).
4. Caps: $1 per run, $20 total stop, 2-casualty stop; dependencies frozen for the whole proof.
5. A WIN means "the text helped on this mix with Muse"; neither result ships or removes anything by itself.

Signed: hamr, 2026-11-11 (in-turn word "sign")

---
sha256 of this file above this footer (frozen, never edited again): 522bc1f51e83d72a6ac8af08ff79096aca33d5d7e9d6ec8fc67c3f73d99eed5a
