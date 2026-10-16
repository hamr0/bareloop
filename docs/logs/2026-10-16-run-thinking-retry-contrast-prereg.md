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
