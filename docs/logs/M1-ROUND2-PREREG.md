# M1 round 2 — carry note: pre-registration (FROZEN 2026-10-30, before any number)

Status: SIGNED by hamr 2026-10-30 ("signed"). Frozen in this commit before any round 2 number exists. Frozen rules never loosen.
Round 1 plan: `docs/logs/M1-PREREG.md`. Round 1 result: `.claude/scratch/m1poc/battery/analysis/M1-RESULT.md` and `M1-FOLLOWUP.md`.

## Why round 2

- Round 1 primary FAIL: repeat-read share OFF 64.9%, ON 48.6%; ratio 0.749 against a bar of 0.667. Guard PASS: 3 vs 2 greens.
- Repeats stayed the same (250 vs 248). ON read more new files (168 vs 83 first-in-run).
- hamr ruled 2026-10-30: re-reads cannot be judged as a culprit, since a worker must re-read a file to edit it in its own conversation. So repeat reads are NOT a pass bar in this round.

## What changed in the note

Engine copy `.claude/scratch/m1poc/engine` only, never product code. The cap order now keeps diffs (hamr 2026-10-30).
Under the 3000-char cap the note drops, in this order:
- file lines first (edited files last)
- then search lines
- then earlier tries
- then shrinks diff hunks one edit at a time, oldest to newest by real recency; the newest edit's hunk is cut last.
$0 replay over round 1's 24 ON asks: `.claude/scratch/m1poc/v3/replay-caporder.out.txt` (e.g. p7-r1 #6 newest hunk 12 to 40 lines; p7 fix notes that kept 0 diff lines now keep 9-12+). Engine tests 15/15.

## Purpose

See where things stand on smaller jobs and get a leaning. Descriptive only, NO pass bar.

## Arms

- OFF = handoff note only.
- ON = handoff note + carry note (new cap order).
- Read shim `cap`, held fixed and recorded.

## Jobs, n, caps

- Jobs: change2, p7, pulselog (the E1 templates in `.claude/scratch/e1-poc/battery/templates/`). bigfile is out (F257 step-red every run).
- n: 3 per job per arm, 18 runs.
- Provider: Fireworks, `FIREWORKS_API_KEY`, `accounts/fireworks/models/deepseek-v4p1-flash`. Prices per 1M tokens: in $0.45, out $1.80.
- Caps: $1 per run, $10 total.

## Reported (OFF vs ON, per job and pooled, median [min-max])

- greens
- turns (step and fix)
- calls
- tokens (spine field names)
- cost
- wall time
- fix tries
- tool mix (retrieval share)
- reads of new files vs re-reads
- ON only: diff lines the notes carried

## GUARD (no harm)

ON greens not fewer than OFF greens, pooled.

## Decision rule

Notes stay ON unless the GUARD fails. Making them the product default is hamr's call.

## UNDERPOWERED (declared now, before any data)

3 runs per side gives a leaning, never a proof. No number is read as a win or a loss.

## Known gaps, written up front

- F259 is fixed only on the product branch; the engine copy is still on bare-agent 0.52, so the grep leak is open in both arms equally.
- The litectx index build is not recorded in the spine.
- Provider-red rows are casualties, never evidence. Probe with 2 consecutive 200s before firing; 2 casualties in a row stop the battery.
