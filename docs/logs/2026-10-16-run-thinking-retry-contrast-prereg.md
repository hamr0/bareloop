# Run thinking RETRY vs ON contrast — pre-registration (FROZEN 2026-10-16)

**FROZEN 2026-10-16** on hamr's go (option A: the same rules as the SPLIT contrast), before any battery number exists.
Nothing below loosens after a number exists. This is the second pre-registered run-thinking contrast; the first is
`2026-10-16-run-thinking-split-contrast-prereg.md` (SPLIT vs ON, result: NO BUILD, SPLIT 2/4 vs ON 3/4 green on change2).

## Why

The SPLIT contrast kept the planner thinking and turned thinking off for scout, step and fix. On digest it was 4/4 green
in both arms and about 3.4x cheaper; on change2 SPLIT had fewer greens (one escalated after 2 strikes and 28 fix rounds).
The idea left open is "thinking off by default, back on when a step retries". A 4-run RETRY-only POC (background below)
read 3/4 green, $0.0097 median spent, 0 strikes, 0 fix rounds. Four runs of one arm are an anecdote, so this is the n=4
per arm contrast against ON. Hamr chose this contrast on 2026-10-16.

## Arms (the ONLY difference between arms is the thinking field)

- **ON** = today: no thinking field on any request (DeepSeek thinks everywhere).
- **RETRY** = planner requests (the ones that carry no tools: draft, redraft, replan) send no field; scout sends
  `thinkingMode: 'off'`; step attempt 1 sends `'off'`; step attempt >= 2 sends no field; fix sends no field.
  (On the wire: `thinking:{type:'disabled'}` for scout and step attempt 1, nothing for everything else.)

Provider/model: DeepSeek deepseek-flash, the jobs' own signed settings (same divergence note on the code job's model as
the SPLIT contrast). Everything else (read shim, scout, strike limits, close) is the job's own and identical in both arms.
The RETRY switch is a POC-only per-request wrapper in the scratch battery driver; no `src/` file is touched. Request
labels come from the engine's own spine records and are cross-checked per request against the tool-count class and the
engine's worker-round / judge-round record; each run's real requests are tapped (thinking field and tool count only,
never headers or the key) and the arm invariant is checked on live traffic. Any disagreement or violation stops the
battery.

## Jobs (2) — same as the SPLIT contrast

1. **change2** — changelog rubric job, 452 KB input (existing `session/` template; signed $0.50, 20 min).
2. **pulse-again digest** — code job: make `src/digest.js` pass `tsc --strict` with zero errors, tests kept, no
   suppressions; deterministic 7-stage close; signed $1.00, 20 min; patient is a COPY of the saved session tree.

Same templates, fresh copy for EVERY run, scratch HOME with an empty `runs.jsonl` per run; nothing lands in
`~/.config/bareloop`. No run reuses a plan.

## Size and order

4 runs per arm per job = 16 runs. Per job, interleaved ABBA-style: ON, RETRY, RETRY, ON, ON, RETRY, RETRY, ON. Jobs run
one after the other (change2 slots 1-8, then digest slots 9-16), sequentially, never in parallel. Results go in a NEW
folder `.claude/scratch/poc-thinking/battery/retry-contrast/`; `paid/` and `retry/` are never touched.

## Money

- Per-run enforced ceiling **$0.25** for both jobs, set with `--draft-spent-usd` (change2 `0.25`; digest `0.75`, so the
  ceiling folds in to $0.25 of real money; the 20-minute wall of each signed spec stays).
- Battery HARD STOP **$2.00** total: the driver sums each run's real spent (the spine's job-end `spentUsd`, casualties
  included) and refuses to start the next run if total + $0.25 would exceed $2.00. It stops and writes a stop row; it
  never skips silently.

## Casualties

A run ending provider-red from transport (HTTP error, timeout, reset; a provider-red whose detail is not a truncation /
max_tokens) is a casualty: excluded from every count, replaced ONCE in the same slot. Two casualties in a row (including
the replacement itself) STOP the battery: a condition, not noise. A run that leaves no spine, or breaks the arm field
invariant, also stops the battery.

## Frozen decision rule

Per job, primary = green count (green = outcome `green`; `softgreen`, escalated, step-red, plan-red or cap-halt is not
a green). Secondary = median spent, median wall, plan valid on first try, max_tokens cut-offs.

- **RECOMMEND** building the RETRY switch iff, on EACH job, RETRY greens >= ON greens AND RETRY median spent < ON median
  spent.
- If RETRY has fewer greens than ON on either job: **no build**, log the result as a finding.
- Anything else (greens not worse, but median spend not lower on some job): rule not met, no build.

## Declared up front

- UNDERPOWERED: n=4 per arm can only show a large difference, not a small one.
- A tie on greens with lower cost reads "no worse at n=4", not "proven equal".
- Full-run quality beyond the close's verdict is unmeasured.
- The planner is IDENTICAL in both arms (no field). Planner plan-reds (seen in 3 of 12 change2 runs today with thinking
  allowed) count as non-green in whichever arm they land: no exclusion, no post-hoc adjustment.
- Two jobs; one rubric and one code job; neither is hard. A ceiling effect (all green in both arms) is possible and
  would be a tie on greens decided by cost alone.
- Divergences carried over from the SPLIT contrast: the code job's model comes from its saved card
  (`--model deepseek-flash`); it runs in a plain copied tree, not a `.bareloop/wt` worktree.
- BACKGROUND, NOT rows: the SPLIT vs ON contrast (`paid/`) and the 4-run RETRY POC (`retry/`: change2, 3/4 green,
  $0.0097 median, 0 strikes, 0 fix rounds; its one red mvaxkvsj was a planner plan-red with only 857/1437 planner output
  tokens). Neither is pooled into any cell here.

## SECONDARY, REPORT-ONLY columns (they do NOT enter the frozen rule)

Recorded per run in `results.jsonl` and summarised per job and arm, same as the SPLIT contrast: attempts per step and
strikes; fix-phase rounds; replans; output tokens first attempt versus retry attempts (step and fix rounds); per-phase
output tokens (scout / plan / step / fix / judge) and rounds per phase; wall time; plan valid on the first draft;
max_tokens cut-offs. None decides the build; reported as observed with the underpowered caveat.

## Dry check before freezing ($0, fake loopback server)

Driver: `battery.mjs dry|paid --b-arm retry` (the original SPLIT driver with a second-arm option; default behaviour
unchanged). Verified at $0: order ON,RETRY,RETRY,ON,ON,RETRY,RETRY,ON on both jobs; per-request wire fields by phase
(scout disabled, planner none, step attempt 1 disabled, step attempt >= 2 none, fix none) with a forced step retry and a
forced fix loop; the $2.00 stop (refuses before slot 5 at a fake $0.50 per run); one-replacement casualty and the
two-casualties stop.

## Results

(empty; results get appended below in a later commit, the sections above never change)


### 2026-10-16 — battery result (stopped at slot 11 of 16; instrument stop)

Source: `.claude/scratch/poc-thinking/battery/retry-contrast/battery.log` and `results.jsonl`. 11 runs executed on DeepSeek, total counted spend $0.2999 of the $2.00 hard stop.

**Stop row, verbatim:** `{"type":"stop","reason":"field-violation","slot":11,"attempt":1,"why":"label disagreements: tools 0, engine-record 2, unknown-phase 0","at":"2026-10-16T13:05:15.024Z"}` — field-violation at slot 11: engine-record label disagreements 2. This is an instrument stop; the battery halted as pre-registered. Slots 12-16 were not run.

Slot 11 (mvaz4l6k) is counted in the tables below as printed by the driver, but its wire check failed (fieldOk=false). Slot 3 (mvaycllr) and slot 11 carry spendComplete=false.

#### Per-run rows (slots 1-11)

| slot | job | arm | att | runid | outcome | spent $ | wall min | planOK1 | cut | out tokens scout/plan/step/fix/judge | fieldOk | step att | strikes | fix rnd | replans | tok first/retry |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | change2 | ON | 1 | mvay7f8d | green | 0.0131 | 1.1 | true | 0 | 4100/4382/2302/0/0 | yes | 1+1 | 0 | 0 | 0 | 2302/0 |
| 2 | change2 | RETRY | 1 | mvay8wbv | green | 0.0358 | 2.9 | true | 0 | 962/7291/21345/0/0 | yes | 1+2 | 0 | 0 | 0 | 1780/19565 |
| 3 | change2 | RETRY | 1 | mvaycllr | green | 0.0149 | 1.7 | true | 0 | 1044/6176/2235/2604/0 | yes | 1+2 | 0 | 5 | 0 | 4839/0 |
| 4 | change2 | ON | 1 | mvayeqns | green | 0.0212 | 1.7 | true | 0 | 11692/3457/2343/0/0 | yes | 1+1 | 0 | 0 | 0 | 2343/0 |
| 5 | change2 | ON | 1 | mvaygzyv | green | 0.0131 | 1.2 | true | 0 | 4195/3462/3076/0/0 | yes | 1+1 | 0 | 0 | 0 | 3076/0 |
| 6 | change2 | RETRY | 1 | mvayijfe | green | 0.0207 | 1.9 | true | 0 | 1162/9538/6344/0/0 | yes | 2+1 | 0 | 0 | 0 | 2619/3725 |
| 7 | change2 | RETRY | 1 | mvaykymc | green | 0.0146 | 1.3 | false | 0 | 962/9777/1311/0/0 | yes | 1+1 | 0 | 0 | 0 | 1311/0 |
| 8 | change2 | ON | 1 | mvaympco | green | 0.0265 | 2.4 | true | 0 | 5718/8991/7071/0/0 | yes | 1+2+1 | 0 | 0 | 1 | 4206/2865 |
| 9 | digest | ON | 1 | mvaypshx | green | 0.0603 | 7.3 | true | 0 | 12568/7481/19689/9671/0 | yes | 2+3 | 0 | 16 | 1 | 16808/12552 |
| 10 | digest | RETRY | 1 | mvayz98y | green | 0.0246 | 4.1 | true | 0 | 3335/8478/3703/4665/0 | yes | 3 | 0 | 8 | 0 | 5150/3218 |
| 11 | digest | RETRY | 1 | mvaz4l6k | green | 0.0550 | 6.5 | true | 0 | 2735/8826/27827/5524/0 | NO | 1+3 | 0 | 7 | 0 | 13140/20211 |

#### Per job x arm (n = counted runs; frozen primary = green count)

| job | arm | n | green | median spent $ | median wall min | planOK1 | cutoffs |
|---|---|---|---|---|---|---|---|
| change2 | ON | 4 | 4 | 0.0171 | 1.5 | 4 | 0 |
| change2 | RETRY | 4 | 4 | 0.0178 | 1.8 | 3 | 0 |
| digest | ON | 1 | 1 | 0.0603 | 7.3 | 1 | 0 |
| digest | RETRY | 2 | 2 | 0.0398 | 5.3 | 2 | 0 |

#### Secondary, report-only (not in the frozen rule): do RETRY-arm runs retry more?

| job | arm | mean step attempts | strikes | fix rounds | replans | tokRetry/tokFirst |
|---|---|---|---|---|---|---|
| change2 | ON | 1.11 | 0 | 0 | 1 | 2865/11927 |
| change2 | RETRY | 1.38 | 0 | 5 | 0 | 23290/10549 |
| digest | ON | 2.50 | 0 | 16 | 1 | 12552/16808 |
| digest | RETRY | 2.33 | 0 | 15 | 0 | 23429/18290 |

Observation: RETRY on change2 spent heavily on retry thinking. Slot 2 (mvay8wbv) produced 19,565 retry output tokens (21,345 step output tokens in all), which made it the most expensive change2 run at $0.0358.

#### Verdict

NO BUILD. The change2 cell is COMPLETE (4 ON, 4 RETRY): greens 4 vs 4, so the greens-not-worse clause holds, but the RETRY median spent $0.0178 is NOT below the ON median $0.0171. The frozen AND-rule therefore fails on change2 and cannot be met whatever the unrun digest slots 12-16 would show. Thinking stays as today.

The digest cell is incomplete (ON 1, RETRY 2, all green; RETRY median $0.0398 vs ON $0.0603) and is reported only; it is not a decision. The driver's own line reads "INCOMPLETE battery: not every cell has n=4 — not a decision", and the rule line "RULE NOT MET — no build (greens not worse, but median spend not lower on change2)". Declared caveats stand: n=4 per arm is underpowered, and full-run quality beyond the close verdict is unmeasured.

The slot 11 stop (engine-record label disagreements 2) is unexplained and open for the POC wrapper only; no product code is involved.
