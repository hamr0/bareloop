# E0B-PREREG — harness2 E0b, the $0 archive read of re-reads inside ONE worker (FROZEN 2026-10-28)

E0b is E0 re-asked with a narrower re-read. Everything in docs/logs/E0-PREREG.md (frozen 9e1e9a8,
sha256 0e935b084c153d001939c15d5112195ed252a2a0478bf676635b87df7b2b3f8a) is carried over
UNCHANGED, except the re-read definition (section "Re-read") and the sections marked NEW or CHANGED
below. Where the carried text says "E0", read "E0b".
Why: E0 counted a repeat anywhere in the run. Each step has its own Gate (src/planrun.js:2328) and every
`ask()` builds a fresh Loop over a fresh transcript (src/planrun.js:2863-2867, `newLoop` 2728, 2808), so a
worker that reads a file an earlier worker read has no memory of it. A worker-facing hint can only fix
repeats inside ONE worker's memory. E0's reader already printed a within-gate-session variant
(shown only, never judged); E0b's unit is narrower than that (one attempt, not one gate), and that
earlier variant was already seen before this freeze. The E0 result (PASS on both DeepSeek segments) was
also seen before this freeze; E0b's rules are frozen after it, so they are not blind to E0's outcome.
Cost to run: $0, no model call.

This is the freeze, written before any habit or outcome number was computed. Rules bind the
whole E0 read and never loosen after data. Source of the rulings: hamr, 2026-10-28
(`docs/wiki/HARNESS2.md` sections 5 and 7). Style follows `docs/logs/BENCH-PREREG.md`.
Cost to run: $0, no model call.

## Question

In archived runs, do re-reads cost a real share of money, and do they differ between passed
and failed runs?

## Corpus

- Runs listed in `~/.config/bareloop/runs.jsonl` whose spine exists on disk: 310 at inventory
  time (379 rows; 312 carry a spine path; 310 spines exist, all unique), dated 2026-07-16 to
  2026-10-27.
- Excluded: spines under `.claude/scratch` (POC and test fixtures), and `../adaptlearn` (a
  different product's archive).
- A run is USABLE if its gate-audit sibling file has tool-call rows inside the run's spine
  window (job-start ts to job-end ts, with the inventory's +/-3 s margin). 225 of 310 were
  usable at inventory time. 75 have no audit sibling (38 provider-red, 10 no job-end, 8 pass,
  9 red, 3 capped, the rest other casualties); 10 more have an audit with nothing in window.
  The usable set is biased toward runs that reached tool use.
- Audit rows are assigned to a run by that time window, NOT by the audit `run_id`. The audit
  `run_id` is the gate's uuid, not the spine run id (`src/replay.js:92-96`); one run owns 1 to
  17 of them (88 usable runs have 1, 137 have 2-17). The audit sibling name rule is
  `<stem>.jsonl` to `<stem>-gate-audit.jsonl` (`src/replayio.js:76-94`); run-u renames the
  audit to `u-<runid>-gate-audit.jsonl` (`src/userrun.js:2037,2060`).
- Known limit: concurrent runs on one tree cannot be ruled out from the record. No audit
  run_id straddled a window edge at inventory time.

## Record shapes (read from source and the archive)

- Audit row (`src/behaviour.js:8-17`): `{ts, seq, run_id, parent_run_id, spawn_depth, aid,
  phase, action:{type, path?, args?}, decision, severity, rule, reason, result?}`.
  `action.type` is llm / read / edit / write / ctx_remember. Read rows carry `args.tool` and
  `action.path`, and nothing else: no line range, no result size. `args.bytes` exists only on
  edit/write/ctx_remember. `result` exists only on `llm` rows: `{costUsd, pricing, tokens,
  durationMs}`.
- Audit tool strings found across the archive (action.type / args.tool, row counts):
  read/shell_read 7065, read/shell_grep 4483, read/ctx_recall 2532, read/ctx_get 1276,
  read/ctx_recent 61, read/ctx_compress 31, read/ctx_impact 17, read/ctx_related 14,
  edit 2350, write 275, ctx_remember 7, llm 12795.
- Spine: `job-start` (model in 91 of 310, provider in 61 of 310), `close-decl.genre` (TYPES or
  TEXT; in 69 runs), `worker-round` `{phase, iteration, kind, costUsd, pricing, tokens,
  usage:{inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens}, stopReason}`
  (`src/planrun.js` about 2591-2612), `memory-cache` (emitted only when the read shim is
  armed, `src/planrun.js:4290-4300`, added 2026-08-24, commit b0da78a), `job-end`
  `{outcome, spentUsd, spendComplete, engagementSpentUsd}`. Outcome names: `src/run.js:264-268`.
- Read-shim arm: no field. A `memory-cache` record means armed; the arm name (A1, A2, A3) is
  recorded nowhere. `src/readshim.js` was added 2026-08-18, default OFF, so every run before
  that date is not armed by construction. The default flipped to A1 on 2026-08-31
  (`src/userrun.js:401-429`). No record after 2026-08-24 means off OR died before the tail.
- Alignment: for 215 of the 225 usable runs the audit `llm` row count equals the spine
  `worker-round` count.

## Outcome split

- PASS = green (and softgreen if present).
- FAIL = step-red, escalated, plan-red, gate-red. A real "no" from a working check.
- CAPPED = cap-halt, wall-halt. Reported apart, never in pass or fail.
- CASUALTY = provider-red, pricing-red, close-red, close-crashed, stopped, hitl outcomes,
  missing job-end, already-green (no work done). Excluded. Close-red is an instrument fault
  (the close broke); plan-red is a judged no from a working close.
- Conflict noted: `scripts/readshim-battery.mjs:233-247` treats close-red (and cap-halt,
  wall-halt, escalated, step-red) as evidence. E0 follows the doctrine, not that script.
- Runs with a `worker-crash` record (3 at inventory time) are listed separately; their
  outcome is taken from job-end.

## Segments

Segment = genre x provider/model x read-shim arm (armed / not armed; the specific arm is
unrecorded). Providers are never pooled.

- Genre: `close-decl.genre` where present; else the job-name rule in
  `.claude/scratch/e0-inventory/segments.mjs` (a name containing `types` is TYPES; other
  jobs are `legacy:<job name with a trailing -l2*, -probe or -cold removed>`). The rule is
  restated here: TYPES if genre starts with TYPES, TEXT(rubric) if genre is TEXT, otherwise
  `legacy:<job>`.
- Provider/model: job-start, else the audit llm rows' `args.{model,provider}`; provider is
  inferred from the model name or baseUrl. 63 runs have no model anywhere (none in a segment
  of size 10 or more).
- Shim arm by date and record: armed = a `memory-cache` record; before 2026-08-18 = not
  armed; 2026-08-18 to 08-23 = unknown (no record existed yet); later with no record = off or
  died.
- A segment is READ only if it has at least 10 usable PASS+FAIL runs AND at least one of each.
  Otherwise it is reported "too few" and never read.

Segment table at inventory time (run counts only; usable runs):

| genre | model | shim arm | pass | fail | capped | casualty | pass+fail | status |
|---|---|---|---|---|---|---|---|---|
| legacy:aurora-testgen | claude-sonnet-5 (anthropic) | not armed (pre 08-18) | 6 | 50 | 0 | 0 | 56 | readable |
| TYPES | claude-sonnet-5 (anthropic) | not armed (pre 08-18) | 13 | 14 | 7 | 11 | 27 | readable |
| TYPES | deepseek-flash | armed (arm unknown) | 19 | 6 | 2 | 2 | 25 | readable |
| TEXT (rubric) | deepseek-flash | armed (arm unknown) | 16 | 8 | 0 | 1 | 24 | readable |
| legacy:mailproof-fix | claude-sonnet-5 (anthropic) | not armed (pre 08-18) | 9 | 9 | 0 | 0 | 18 | readable |
| TYPES | claude-sonnet-5 | unknown (08-18..23) | 6 | 2 | 0 | 5 | 8 | too few |
| TYPES | claude-sonnet-5 | no record (off or died) | 6 | 1 | 0 | 2 | 7 | too few |
| legacy:aurora-testgen | claude-haiku-4-5 | not armed | 0 | 6 | 0 | 0 | 6 | too few |
| legacy:aurora-fix | claude-sonnet-5 | not armed | 4 | 0 | 0 | 0 | 4 | too few |
| legacy:aurora-testgen | claude-sonnet-5 | no record | 1 | 2 | 1 | 1 | 3 | too few |
| TYPES | claude-sonnet-5 | armed | 3 | 0 | 0 | 0 | 3 | too few |
| legacy:aurora-testgen | clipipe sonnet-5 | not armed | 0 | 2 | 7 | 1 | 2 | too few |
| TYPES | claude-haiku-4-5 | not armed | 0 | 1 | 0 | 0 | 1 | too few |
| TYPES | deepseek-chat | armed | 1 | 0 | 0 | 0 | 1 | too few |

These counts are the inventory's, made with its proposed split (the inventory's `casualty`
column also holds already-green). The read recomputes the table under the split above; if a
count moves, the recomputed table is reported next to this one and the move is explained.
The "red" column of the inventory is FAIL here; any close-red it placed in red is moved to
casualty. The legacy:aurora-testgen segment pools several sub-jobs by name prefix.

## Read-class tools

Read-class = audit rows with `action.type` = read and `args.tool` = `shell_read`, or
`args.tool` = `ctx_get`. (The plain `read` of the ruling is the audit `action.type`; the tool
strings are `shell_read` and `ctx_get`.) `shell_grep` and `ctx_recall` are counted as tool
calls but are not reads. `ctx_recent`, `ctx_compress`, `ctx_impact`, `ctx_related` are neither
reads nor in the second habit. Denied rows (decision not allow) are not counted.

## Re-read (the one definition; CHANGED from E0)

Re-read = a read-class call on the same path, with the same tool, as an earlier read-class call BY
THE SAME WORKER (same Loop instance, per the boundary below), with no allowed worker write/edit to
that path in between.

The audit records no line range, so a range-level re-read cannot be measured (hamr, 2026-10-28). Under
an armed shim a capped re-serve still counts as a re-read, because the worker asked again.

Per-run re-read share (rule b input) = re-reads / read-class calls in the run. Rule (a) and rule (b)
both use this definition.

## Worker boundary (NEW; from source, before any number)

- A worker's memory is ONE `ask()` call: `newLoop(gen).run([{role:'user', content: prompt}], ...)`
  (src/planrun.js:2863-2867) starts a fresh transcript. Callers: one `ask` per step attempt (the step
  loop, `w.setIteration(iteration)` then `w.ask`, ~3439-3450), one per fix-loop iteration (~4179-4195),
  one for the scout (3021), one per draft/redraft/replan. `mkWorker` (3318 step, 3972 fix) is
  per step / per fix phase and owns the Gate and the shim ledger, but the MODEL's memory is per ask.
- A scout's `askFrom` (2842-2857, 3045) continues the prior transcript with a new Loop: same
  memory, so it stays inside the scout's one worker. A stall reissue (2728 comment) makes a second Loop
  over the same transcript start: treated as the same worker.
- Record mapping: the audit `llm` row k immediately follows the spine `worker-round` k (same ts to
  within 2 s; checked for all 210 aligned usable runs). Every allowed audit tool call after
  llm row k and before llm row k+1 belongs to worker-round k, whose `phase` and `iteration` fields
  name the attempt. A WORKER KEY = (audit gate run_id, worker-round phase, worker-round iteration).
  gate run_id keeps resumed legs and replanned steps apart. Calls before the first llm row (none found)
  would be unassignable and are counted.
- Mapping needs: the run is aligned (llm row count = worker-round count) AND every worker-round
  carries non-null phase and iteration. At freeze: 210 of 220 usable runs aligned; 136 of those 210 carry
  phase/iteration on every round, the other 74 (older runs) do not. Both DeepSeek READ segments are
  fully mappable (TYPES 15 pass / 6 fail, TEXT 16 / 8). Claude TYPES: 12 pass / 14 fail mappable;
  aurora-testgen: 3 / 7 mappable; mailproof-fix: 0 mappable.

## Cost attribution (an estimate; hamr ruled "estimate is fine")

- The audit has no per-call cost or size. Pair audit tool calls with spine `worker-round`
  records in order (aligned for 215 of 225 usable runs; runs that do not align are listed and
  excluded from rule (a) only).
- Each worker-round's `costUsd` is split EVENLY across the tool calls issued just before it
  (between the previous round and this one). A run's re-read cost = the sum of the shares
  charged to its re-read calls.
- Run spend = the sum of `costUsd` over ALL spending round records in the run: `worker-round`,
  `judge-round`, `worker-turn`, `fix-round`, `confirm-round`, and any other round type found
  with a `costUsd` in the spine (the real list is enumerated from the spine at read time and
  reported). `worker-result` echoes are excluded. A null `costUsd` stays unknown, never zero.
- Every rule (a) number is labelled "estimated".
- Not included, a known under-count: the later cache-read tail of a re-read's content (the
  replay of admitted tokens in later rounds).

## Pass rule (per segment; hamr set 5% and 10 points)

E0 passes for re-reads in a segment if BOTH:

- (a) segment re-read cost / segment spend is at least 5% (estimated), summed over the
  segment's usable PASS+FAIL runs; and
- (b) |median per-run re-read share of FAIL runs minus median of PASS runs| is at least 10
  percentage points.

(a) and (b) are reported for every readable segment regardless. E0 overall passes if at least
one DeepSeek (`deepseek-flash`) segment passes, since E1 runs on DeepSeek. Claude segments are
reported, never used to justify E1. The direction of (b) is reported (which outcome re-reads
more).

## Second habit (shown only, not judged)

Read-over-recall: the share of read-class calls against `ctx_recall` calls per run, per
segment. No pass rule.

## Stop rule (CHANGED)

A run whose worker boundary is not recoverable (not aligned, or any worker-round lacking phase or
iteration) is excluded from E0b and listed. A segment is READ in E0b only if, after that exclusion, it
still has at least 10 usable PASS+FAIL runs and at least one of each; otherwise it is "could not apply:
<reason>" and never judged. If no DeepSeek segment is readable, stop and report the gap. The E0 segment
table and the scratch exclusion E0 applied (spines under .claude/scratch are excluded, 305 spines) are
carried over. Frozen rules never loosen after data.

## Cross-worker repeats (NEW; shown only, not judged)

A cross-worker repeat = a read-class call (same tool, same path) that is the first such call by its
own worker AND for which an EARLIER worker in the same run made a read-class call on that tool+path with
no allowed worker write/edit to that path since that earlier call. Reported per READ segment as calls
(and as a share of read-class calls) and as estimated cost share (same even-split attribution as rule
(a), over segment spend). It sizes a handoff-note / pointer idea; it has no pass rule.

## Power, stated before data

About 25 runs per DeepSeek segment, unbalanced pass/fail (19/6 and 16/8). A median over 6
fail runs is fragile. A passing (b) is a reason for E1, not proof of cause. Single-patient
dominance is noted per segment: the TYPES DeepSeek segment is mostly one patient family
(pulselog-panel-strict); the Anthropic TYPES segments are dominated by aurora-u-spawner-types,
bareagent-u-types, litectx-u-types. The TEXT (rubric) jobs read an input page and write output
JSON, a different tool surface where file-read habits may not apply at all.

## Not measured

STRICT range-level re-reads; per-call result size; the specific shim arm; the cache-read tail.
Other limits: windowing by timestamp may include another run's rows if two runs overlapped on
one tree; the genre of untagged legacy jobs is by job name; a pre-F186 audit holding an
earlier run inside the same window is not excludable.
