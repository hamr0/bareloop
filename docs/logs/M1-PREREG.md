# M1 — carry note: pre-registration (FROZEN 2026-10-29, before any number)

Status: SIGNED by hamr 2026-10-29 ("1"). Frozen in this commit before any Phase 1 number exists. Frozen rules never loosen.
Backlog source: docs/wiki/HARNESS2.md §9 M1 (initial spec plus the v2 rules, agreed with hamr 2026-10-29). Gap sizing: check C, `.claude/scratch/memc/MEMC-SIZING.md` (F258). Rulings carried over: §7 (one lever at a time; ON/OFF switch enters the signed hash).

## Question

Does the code-written carry note (facts about what earlier workers in the same run read, searched, edited, and how the last try ended) cut repeat reads by a new worker, without hurting greens?

## Riskiest assumption

That the waste is lost information between workers, and that handing facts over changes what the worker reads.
Known so far (check C, $0 archive read, descriptive only):
- H1 bigfile: new worker after a bounded try repeats 66% of its read-class calls (195/295); a new step 72% (73/102).
- E1 TYPES: handoff OFF new step 38% (84/222), fix retry 60% (59/99); handoff ON new step 31% (38/122), fix retry 47% (15/32). The arms are not like-for-like (OFF includes the hint arm).
- The handoff note maps files read; it does not carry greps, recall queries, edits, or what the last try concluded (MEMC-SIZING §1).

## Already known (smoke, not evidence)

2 live runs, notes ON only, on Fireworks: bigfile 01-bigfile-ON-r1 step-red $0.3711, p7 02-p7-ON-r1 green $0.3626; 4 notes each; real runs.jsonl untouched (385 lines before, 385 after).
In bigfile, `src/primitives/rubric.js` was marked "looked here, no fix made" and was still read 7, then 14, then 19 times. n=1, anecdote. (That per-file read count is hamr's reading of the smoke; `progress.log` holds only the run lines above.)

## Arms

- OFF = today's handoff note only.
- ON = handoff note + M1 carry note.
- Engine: the throwaway copy at `.claude/scratch/m1poc/engine`, never product code. OFF must be byte-identical to main 628064a behaviour (already shown in the POC tests).
- Read-shim setting held fixed (cap) and recorded.

## Provider

Fireworks, Settings row `FIREWORKS_API_KEY`, model `accounts/fireworks/models/deepseek-v4p1-flash`.
Prices per 1M tokens (hamr, Settings): in $0.45, out $1.80. Only in and out are used.

## Jobs, n, caps

- Jobs: p7 and bigfile.
- n: 3 runs per job per arm, 12 runs.
- Caps: $1 per run, $10 total.

## Primary metric

Repeat-read share at the worker boundary (one ask() = one worker): of the files a new worker reads, the share an earlier worker in the same run already read with no write to that file between.
Same definition and counting as check C (MEMC-SIZING §2): read-class calls are shell_read, ctx_get (key = file path), shell_grep (key = path), ctx_recall (key = query); a call is a REPEAT when its key was read by an EARLIER ask in the run and no write/edit to it happened since. Counted by the check C method: one gate-audit row (`phase:gate decision:allow`, action.type != llm) per call, assigned to an ask by the spine's `iteration-start` .. `middle-done` window, scout asks included as earlier workers; counting script `memc.mjs` (extract) and `agg.mjs` (tables) in `.claude/scratch/memc/`. The headline share is the loose key (as in MEMC-SIZING §3); the strict tool+path share is reported beside it.

## Pass rule (frozen at sign)

- PRIMARY: ON repeat-read share at most two-thirds of OFF (cut by at least a third, e.g. 66% to 44% or lower), pooled over both jobs. Each job is also reported separately.
- GUARD (no harm): ON greens not fewer than OFF greens.
- Reported only, never read as a win or a loss: cost, calls, tokens, turns per run; and whether files marked "looked here, no fix made" are read less by the next worker. n=3 is UNDERPOWERED for all of these, declared now, before any data.

## Decision rule (hamr, 2026-10-29)

After the test, the notes stay ON unless the GUARD fails. A primary FAIL is reported as a FAIL plainly and does not by itself remove the notes. Any drop in calls, tokens or turns is welcome but is not a pass. The default flip in product code is hamr's call.

## Known gaps, written up front

- bigfile likely ends step-red on both arms (F257: the planner gives too few calls per step; 6 of 6 H1 bigfile runs were step-red with no write), so it tests repeat reads, not greens. The GUARD is then read on p7 only; bigfile greens, if any, are reported.
- F259: a root `shell_grep` walks into `.smoke`, `gate-audit.jsonl` and `.litectx`. Open until bare-agent v0.55.0; it hits both arms equally. The carry note can echo a leaked file name (seen in the smoke: `gate-audit.jsonl`, `.smoke/poc-m1/notes.log`).
- The gate audit has no grep pattern and no `ctx_get` range; the engine copy captures them at the tool seam (M1 v2 rules). Grep repeat stays path-keyed, so it is an upper bound (MEMC-SIZING caveat 1).
- Provider-red rows are casualties, never evidence; probe the model with 2 consecutive 200s before firing.
