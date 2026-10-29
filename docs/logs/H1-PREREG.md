# H1 — read-vs-recall hint: pre-registration (FROZEN 2026-10-29, before any number)

Status: SIGNED by hamr 2026-10-29 ("A, yes yes": caps and pass bar as below). Frozen in this commit before any Phase 0 number is read. Frozen rules never loosen.
Backlog source: docs/wiki/HARNESS2.md §9 H1. Rulings carried over: §7 (hints name tool + count only, never a file; worker only; one lever at a time; ON/OFF switch enters the signed hash, hint text does not).

## Question

Can one worker-only hint move workers from `shell_read` to `ctx_recall` / `ctx_get` in the cases where recall fits, without hurting greens?

## Riskiest assumption

That SELECTION is the blocker, not retrieval quality, and that wording changes selection.
Known so far: `ctx_recall` has 0 zero-hit results in 2,324 calls (F107), so retrieval works; the gap is the pick.
Quick count over the E1 gate audits (36 runs, DeepSeek, raw string count, may double-count call rows): `shell_read` 1009, `shell_grep` 412, `ctx_recall` 46, `ctx_get` 29. So DeepSeek picks retrieval about 7% of read-class calls, not 1.4%. Phase 0 recounts this properly.

## Phase 0 — $0 archive read (gate for Phase 1)

Corpus: E0 + E1 archived runs (DeepSeek `deepseek-flash`). Scoped by run_id (F186).
Segment rule (§7 Q1): 10 runs, same genre and same provider/model, or it is "too few" and is not read.

Measure per run:
1. Retrieval share = (ctx_recall + ctx_get) / (shell_read + ctx_recall + ctx_get), counted once per call.
2. FIT cases: a `shell_read` of a whole file of at least 200 lines, where the worker's next write/edit to that file in the same ask() touches a span of at most 60 lines. (Recall + get would have handed over that part only.)
3. Bytes a fit case read vs bytes the touched span needed (the most a hint could save).

Gate (frozen): Phase 1 runs only if fit cases are at least 10 in total, spread over at least 3 runs, in one readable segment. Otherwise H1 stops with "no room" and that is the result.

Known blind spot: the gate audit has no `ctx_get` range (HARNESS2 §9 known gaps), so "touched span" comes from the write/edit args, not from what retrieval would have returned.

## Phase 1 — paid ON/OFF contrast (only if Phase 0 passes)

- Provider: Fireworks (hamr, 2026-10-29), Settings row `FIREWORKS_API_KEY`, model `accounts/fireworks/models/deepseek-v4p1-flash` (set by hamr in Settings).
  Prices per 1M tokens (hamr, Settings): in $0.45, out $1.80. Only in and out are used.
  Note: the Phase 0 archive is DeepSeek's own API. Same model family, different host, so both arms run on Fireworks; no Phase 0 number is used as a Phase 1 baseline.
- Engine: throwaway engine copy (as E1), never product code. Read-shim setting held fixed and recorded. Planner fix and handoff note IN (new code).
- Arms: OFF (today's strategy lines) vs ON (today's lines + one hint line).
- Hint: one line, worker only, tool + count only, never a file. Built from run records, e.g.
  "In past runs on this job, workers read whole files N times where ctx_recall then ctx_get fetched only the part they used."
- Jobs: picked from Phase 0, the jobs where fit cases happen. G2 negative row out.
- n: 3 runs per job per arm.
- Caps: $1 per run, $10 total (hamr, 2026-10-29).

## Pass rule (frozen at sign)

- PRIMARY (selection): ON retrieval share at least 2x OFF, AND ON fit-case conversion (fit cases served by recall/get) at least 30%.
- GUARD (no harm): ON greens not fewer than OFF greens.
- Cost: reported only. n=3 is UNDERPOWERED for cost (pulselog OFF ranged $0.20–0.37 in E1), declared now, before any data. A cost difference is never read as a win or a loss.
- Provider-red rows are casualties, never evidence; probe the model with 2 consecutive 200s before firing.


## Addendum 1 (2026-10-29, before any Phase 1 number; hamr: "A and p7, run p7 and create a new difficult job")

Adds, loosens nothing.

- Phase 0 result: PASS on the frozen gate (48 fit cases, 16 runs, TYPES/deepseek-flash, 45 runs; first count 37 had an ask-matching bug, fixed, v1 kept). Caveat: all 48 are reads of ONE file (`src/metrics.js`, 201 lines), 41 of them in `p7`. Result file: `.claude/scratch/h1/phase0/PHASE0-RESULT.md`.
- Phase 1 jobs: `p7` (from Phase 0) PLUS one NEW job built for room: a copy of a real local repo with large files (at least one file of 400+ lines holding the defect), a planted defect fixable by a small edit (at most 60 lines) inside a large file, a deterministic close, red at seed and green with the known fix, proven at $0 before any paid run. The new job is reported as its own row; p7 and the new job are never pooled into one share.
- The pass rule applies PER JOB. H1 is read as "works on job X" only for a job that passes; never as a general claim.
- Hint text (fixed, both jobs, worker only, tool + count, no file), count taken from Phase 0:
  "In past runs, workers read whole files 48 times where ctx_recall then ctx_get would have fetched only the part they changed. Before reading a large file you will change in one place, try ctx_recall."
- Shown only when the step grants recall and get (G1); otherwise the arm is recorded as inert for that step.
- Read-shim held at the product default (`cap`) in both arms and recorded.
- Caps unchanged: $1 per run, $10 total across both jobs. Order: OFF/ON alternating per rep, p7 first.
- New job `bigfile` (built and proven at $0, 2026-10-29): patient = copy of bareguard 0.28.0 at /home/hamr/PycharmProjects/bareloop-patients/h1-bigfile (seed 88f8f20). Plant: one character in `_resourceFromRule`, `src/gate.js` (2433 lines); other large files 500-2180 lines. Close: 5 stages (changed-from-seed under src/, npm test exits 0, `not ok` count vs baseline 0, test count kept at 1596, no-suppressions). Seed red 3/3 (same single failure), green with the known fix. The close never names the file or function. Template: .claude/scratch/h1/templates/bigfile/ (specHash 7b17f5e0…bf82c before the Fireworks baseUrl rewrite).
- Steps and grants are drafted by the planner at run time for both jobs; a step without recall+get is recorded inert (already above), and a job whose ON arm is inert in every step reads INCONCLUSIVE, never a fail of the hint.
