# Run thinking RETRY vs ON on MEDIUM code jobs — pre-registration (FROZEN 2026-10-16)

**FROZEN 2026-10-16** on hamr's go (option A), before any battery number exists. Nothing below loosens after a number
exists. Third pre-registered run-thinking contrast: `2026-10-16-run-thinking-split-contrast-prereg.md` (F230, SPLIT vs ON,
NO BUILD) and `2026-10-16-run-thinking-retry-contrast-prereg.md` (F231, RETRY vs ON on change2 + digest, NO BUILD;
stopped at slot 11 on an instrument fault, explained and fixed under "Step 0" below).

## Why, and the forking-paths note

hamr's goal, in his words: "Arrive there faster — same cost but time saving is still saving; best if both. The goal is to
have RETRY the default if no differences, and force thinking all on (the tick) for exclusively harder jobs."

The two earlier contrasts used change2 (a rubric job that finishes in ~1.5 min) and digest (a code job that finishes in
~5 min). On jobs that short there is little wall to save and the spend is a few cents, so a "cheaper" rule could not
separate the arms. This contrast asks the same question on two MEDIUM code jobs (archived greens of ~10-17 minutes).

**This is a NEW question, chosen after F230/F231 pointed at code jobs.** That is a forking-paths risk and it is named,
not hidden: the earlier two tests found no build, and this one was proposed because of what they showed. The decision
rule below is also new (faster-or-cheaper, from hamr's goal) rather than the old cheaper-only rule. The two earlier
results are not pooled into any cell here.

## Step 0 — the slot-11 instrument stop (cause, fix, proof)

The RETRY contrast stopped at slot 11 (digest, mvaz4l6k): `field-violation ... label disagreements: tools 0,
engine-record 2, unknown-phase 0`.

**Cause (POC wrapper only; no `src/` file involved).** The wrapper predicts each request's label from the engine's spine
state and queues the prediction; the engine's own `worker-round` / `judge-round` record for that request later pops the
queue (FIFO) as a cross-check. A request that THROWS gets no round record. The engine retries a transport failure once
(`withProviderRetries`, `src/planrun.js`), calling the wrapped `generate` a second time. Slot 11's spine has one
`transport-retry` ("socket hang up") in the middle of step attempt 1; the failed call left a phantom entry in the queue,
so every later record was matched to the previous request's label and the two label boundaries after it (step
attempt 1 to attempt >= 2, attempt >= 2 to fix) read as disagreements: exactly the 2 the driver counted. (The run's
`fields.json` was deleted with its scratch tree, so the per-request counts of slot 11 itself cannot be re-read; the cause
is established from its spine, which holds one `transport-retry` mid step attempt 1, and from the $0 reproduction below.)

**Did real requests get the wrong thinking field? No.** The label that decides the field comes from the spine state at
call time, which was correct for both the failed call and its retry (same phase, same attempt). The disagreement is
between the cross-check queue and the engine records, not between the label and the field. The HTTP-tap wire check for
that run passed every per-label field comparison (only the label-disagreement counter tripped). So slot 11 is NOT
tainted on the wire; it is a valid run (green, $0.0550, spendComplete=false because of the transport retry) that the
driver stopped on. It stays in the F231 record as printed; this doc does not re-count it.

**Fix.** In `retry-arm.mjs` a call that throws removes its own queued prediction (counted as `failedCalls`); the failed
request still went out on the wire and stays counted in the HTTP tap. Nothing else changes.

**$0 proof that reproduces the condition.** A one-shot "socket hang up" on request N was added to the loopback fake
server (`FAKE_HANGUP=N`). With the old wrapper and `FAKE_HANGUP=4` on the change2 forced-retry scenario the check
printed `engine-record 3/10` disagreements and FAIL (the slot-11 condition, wire fields all correct). With the fix the
same run prints `0/10` and PASS. Re-run on the two new jobs with the hang-up landing in step attempt 1 (p7small,
`FAKE_HANGUP=3`: 24 requests, 23 engine records, `0/23` disagreements, wire fields all as expected) and in the fix phase
(stoptest, `FAKE_HANGUP=6`: 8 requests, 7 records, `0/7`).

## Arms (the ONLY difference between arms is the thinking field)

- **ON** = today: no thinking field on any request (DeepSeek thinks everywhere).
- **RETRY** = planner requests (no tools: draft, redraft, replan) send no field; scout `thinkingMode: 'off'`; step
  attempt 1 `'off'`; step attempt >= 2 no field; fix no field. (On the wire `thinking:{type:'disabled'}` for scout and
  step attempt 1, nothing elsewhere.)

Provider/model: DeepSeek deepseek-flash (both jobs' saved cards). Everything else (read shim, scout, strike limits,
close) is the job's own and identical in both arms. The RETRY switch is the POC-only per-request wrapper
(`retry-arm.mjs`) in the scratch battery driver; no `src/` or `tests/` file is touched. Each run's real requests are
tapped (thinking field and tool count only, never headers or the key); any label disagreement or arm-invariant
violation stops the battery.

## Jobs (2) — chosen BEFORE any paid run, from a $0 archive read

Selection criteria: DeepSeek deepseek-flash code job, deterministic close, at least one archived GREEN, a saved
resolved-spec, a complete source (a patient at its seed to copy), and an archived green clearly longer than digest's
~5 min (aim ~8-20 min). The signed wall must leave headroom over the archived green; a signed number is never raised.
Read: all archived spines in `~/.config/bareloop/runs.jsonl` (read only).

CHOSEN:

1. **p7small** = `pulselog-p7-small` (run mv3sconb). Job block: fix every `npm run typecheck` error with JSDoc types,
   no `@ts-ignore`/`any`, tests untouched, no behaviour change; 8-stage deterministic TYPES close. Archived green:
   16.7 min, $0.240 (spendComplete=false: one transport retry), 73 worker rounds, no resume. Signed $1.50, wall
   30 min = 1.8x the archived green. The archived green touched 9 files under `src/`.
2. **stoptest** = `pulselog-stop-test` (run muxwwrgs; the candidate the orchestrator named). Strict-mode type check,
   zero errors in `src/checks.js`, no new errors elsewhere, tests kept; 7-stage close. Archived green: wall clock
   18.4 min BUT that run was Stopped at 7.6 min and resumed 8.3 min later (the gap is not counted by the signed wall):
   ACTIVE time ~9.6 min (7.6 + 2.0), total $0.121. Signed $1.00, wall 30 min = 3.1x the active time (1.6x the raw
   18.4). Honest caveat: its archived green is a stop/resume composite, so its true uninterrupted wall is unknown;
   9.6 min is the best available figure and sits at the low end of the aim.

CONSIDERED AND REJECTED:

- pulselog-panel-strict mulbz0ny (11.9 min, uninterrupted): booked $3.07 under the pre-customer-price guess rate
  (cannot be compared with a $0.50 ceiling), no card/model recorded in its session. muutlcko (same job, signed
  $1.00 / 30 min): active ~22.5 min over a stop/resume, only 1.3x headroom, so the wall could bind.
- pulse-again / digest (already used, ~5 min), pulselog-digest-try (4 min), pulse-again-like short jobs: too short.
- aurora, litectx, bareagent, baremobile, bareguard `*-u-types*` jobs: claude-sonnet or $1.4-$7 archived spend, or no
  saved resolved-spec (JOBS-table runs); bareguard-u-types-deepseek (muo0txge, 17.8 min, $0.221) is DeepSeek but a
  JOBS-table run with no saved resolved-spec/card to template from.
- pulselog-p7-types mv2i30bf: not green (step-red).

No suitable-job blocker: two jobs met the rules, with the stoptest caveat above.

Templates (scratch, built by `build-medium-templates.sh`, READ-ONLY from the archived sessions): each is the archived
session's `resolved-spec.json` / `signing.json` / `card.json` / `source.json` (worktree keys dropped) plus
`source-seed/tree` = a `git clone` of the patient at its seed commit (`eef0aa1` for p7small, `f3206b2` for stoptest) with
`node_modules` copied from the sibling patient (identical `package.json` and lockfile, verified), so no network install.
Patients are COPIES, fresh for EVERY run (the run also resets the tree to the seed). The originals
(`bareloop-patients/pulselog-p7-small`, `pulselog-panel-live`) and the archived panel sessions are never written; checked
clean and unchanged before and after the dry runs. No run reuses a plan.

## Size and order

4 runs per arm per job = 16. Per job, interleaved: ON, RETRY, RETRY, ON, ON, RETRY, RETRY, ON. Jobs sequential, never
parallel: p7small slots 1-8, then stoptest slots 9-16. Results in a NEW folder
`.claude/scratch/poc-thinking/battery/retry-medium/` (log `battery.log` there); `paid/`, `retry/` and `retry-contrast/`
are never touched. Driver: `battery-medium.mjs` (a copy of `battery.mjs`; the earlier driver is unchanged).

## Money

- Per-run enforced ceiling **$0.50** for both jobs, set with `--draft-spent-usd`: p7small signed $1.50 so
  `--draft-spent-usd 1.00`; stoptest signed $1.00 so `--draft-spent-usd 0.50`. The signed 30-minute wall of each spec
  stays. Headroom: the archived greens spent $0.240 (48% of the ceiling) and $0.121 (24%).
- Battery HARD STOP **$4.00** total: the driver sums each run's real spent (the spine's `spentUsd`, casualties
  included) and refuses to start a run if total + $0.50 would exceed $4.00. It writes a stop row; it never skips silently.
- A ceiling or wall that binds is not a rescue case: a cap-halt or wall-halt is a non-green in whichever arm it lands.

## Casualties

Same rule as before: a provider-red from transport (not a truncation / max_tokens) is a casualty, excluded from every
count and replaced ONCE in the same slot; two in a row (the replacement included) STOP the battery. A run with no spine,
or an arm-invariant / label violation, also stops the battery. A transport retry that recovers is NOT a casualty (the run
continues; its row carries spendComplete=false).

## Frozen decision rule (faster or cheaper)

Per job: greens (green = outcome `green`; softgreen, escalated, step-red, plan-red, cap-halt, wall-halt are not),
median wall in minutes (spine job-start to job-end), median spent in dollars; medians over all counted
(non-casualty) runs of the cell, whatever their outcome.

**RECOMMEND** making RETRY the default (the tick then means "think everywhere") iff on EACH job:

1. RETRY greens >= ON greens, AND
2. RETRY is strictly lower on at least one of median wall or median spent, AND
3. RETRY is not worse than ON by more than 10% on the other one: RETRY <= 1.10 x ON. The driver applies this to BOTH
   medians (the strictly-lower one passes it trivially), so no reading of "the other one" can differ.

Fewer greens on EITHER job: **no build**, log a finding. Anything else: rule not met, no build.

## Declared up front

- UNDERPOWERED: n=4 per arm can only show a large difference. "No worse at n=4" is not "proven equal".
- Full-run quality beyond the close's verdict is unmeasured.
- Planner plan-reds count as non-green in whichever arm they land; no exclusions, no post-hoc adjustment.
- The archived greens are n=1 per job, so the walls and costs above are only a sanity bound for headroom, not a forecast;
  a green wall near 30 min on either job would be a binding-wall result and counted as is.
- The stoptest archived green is a stop/resume composite (see Jobs).
- Two jobs from the same project family (both pulselog, TYPES close); a result says nothing about other genres.
- Walls are real clock time on a shared machine and can drift with load; ON and RETRY are interleaved to spread that,
  not remove it.
- The thinking field is the only intended difference, but RETRY also changes what a run does (more or fewer retries);
  the secondary columns report that.
- The model name on both jobs comes from the saved card (`--model deepseek-flash`); the runs are in a plain copied
  tree, not a `.bareloop/wt` worktree (same divergence as the digest runs in F230/F231).

## SECONDARY, REPORT-ONLY columns (they do NOT enter the frozen rule)

Per run in `results.jsonl`, summarised per job and arm: attempts per step and strikes; fix-phase rounds; replans;
output tokens first attempt versus retry; per-phase output tokens and rounds; plan valid on first draft; max_tokens
cut-offs; spendComplete (marked `*` in the per-run table when a floor).

## Dry check before freezing ($0, fake loopback server, no key, no network)

`dry-medium-all.sh` + `dry-medium.sh`, scenario `responder-medium.mjs`: scout, plan, step attempt 1 writes nothing
(strike), step attempt 2+ writes the ARCHIVED GREEN files (read-only) with a planted `// @ts-ignore`, the outer close goes
red on the suppression stage, the fix loop writes the clean files and the real closes (tsc, the suite) go green. Verified:

- Order on both jobs: ON, RETRY, RETRY, ON, ON, RETRY, RETRY, ON; p7small slots 1-8 then stoptest 9-16; all 16 ran.
- Wire fields by phase, from the fake server's own view (an independent referee of the wrapper's labels), both jobs:
  scout `disabled`; planner none; step attempt 1 `disabled`; step attempt >= 2 none; fix none; label vs tool-count
  disagreements 0, label vs engine records 0, unknown-phase fallbacks 0. p7small: 1 / 1 / 1 / 10 / 10 requests;
  stoptest: 1 / 1 / 1 / 2 / 2 (scout / plan / step a1 / step a2+ / fix).
- The slot-11 condition (transport hang-up mid step attempt 1) now passes, see Step 0.
- $4.00 stop: with a fake $1.20 per run the driver ran slots 1-3 (total $3.60) and refused slot 4 (3.60 + 0.50 > 4.00),
  writing a stop row, exit code 3.
- Casualty: slot 2 attempt 1 failing is excluded and replaced once in the same slot; slot 2 failing twice stops with
  `two-casualties-in-a-row`, exit code 6.
- The dry decision line is meaningless (the fake server gives every run the same cost; wall differs only by jitter) and
  is not a result.

Launch (hamr's own foreground shell, NOT run by the builder):
`! bash /home/hamr/PycharmProjects/bareloop/.claude/scratch/poc-thinking/battery/launch-retry-medium.sh`
(`--resume` after an interruption). Expected paid wall: roughly 16 runs x ~10-17 min, a few hours, sequential.

## Results

(empty; results get appended below in a later commit, the sections above never change)

2026-10-16 delivery change before any counted number: first attempt aborted at slot 3 by the outside wrapper's field check (not counted, $0.1675); the battery reruns from slot 1 with the switch inside a throwaway engine copy (.claude/scratch/poc-engine), rules unchanged.
