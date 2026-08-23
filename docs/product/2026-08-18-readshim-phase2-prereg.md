# PRE-REGISTRATION — read shim Phase 2 (A0/A1/A2/A3)

**FROZEN 2026-08-18, before any run.** Committed before a single dollar is spent. Nothing
below is loosened after a number exists, on any axis, for any reason — the anti-fit-to-pass
rule this programme has paid for repeatedly.

Authorisation: hamr, in-turn, this session — asked "A0/A1 only (~$30-45), or all four arms
(~$60)", answered **"all"**. Ceiling quoted by the session and not contradicted: **$60 hard
cap**, prior spend folded in, never silently widened.

---

## The claim under test

The read shim (cap + pointer + next-unseen-slice, plus L2 diff) cuts spend **without
degrading the worker's ability to finish the job.**

Cost is already measured at $0 over 1,844 real archived reads (65.6% of read bytes, and the
correctness result: 250 untruthful pointers under the naive design vs 0 under the shipped
one). **Phase 2 exists for the SECOND half of that sentence** — whether a capped worker
still greens. Cost here is confirmation, not discovery.

## Arms

| arm | configuration |
|---|---|
| **A0** | shim OFF — byte-identical to today. The baseline. |
| **A1** | cap + pointer + next-unseen-slice + G1 |
| **A2** | diff only |
| **A3** | all levers |

`readShim` gates every lever AND G1 as one unit, so A0 is exactly today's behaviour — a
guard firing under a disabled shim would make the baseline a treatment arm and render the
whole contrast unreadable.

## Patient and design

- Patient: aurora (~$5/run, has greened before, historically re-read `orchestrator.py` 33x
  in a single run — the strongest cap case in the archive). **A separate copy, never the
  original.**
- n = 3 per arm, 12 runs. n=1 on a nondeterministic worker is an anecdote; that is standing
  doctrine and it binds here.
- Patients are wiped between cold runs (`.litectx` store removed) so no isolate-verb memory
  leaks forward.

## Decision rules — FROZEN

- **PRIMARY:** median spend per run, per arm.
- **VETO — the one that actually matters:** green rate must not drop. **Cost is the headline
  ONLY if greens hold.** A cheaper arm that greens less is a REJECTED arm, not a tradeoff to
  be argued.
- **SECONDARY:** `ctx_recall`/`ctx_get` share of tool calls — did the steer actually steer.
- **DISCARD:** provider-red rows are casualties, never evidence. One relaunch per casualty
  class, and only after the provider shows 2 consecutive 200s.
- Any spend record type carrying `costUsd` must be accounted, `judge-round` included — a
  slicing instrument that misses a writer is the F45 class.

## DECLARED IN ADVANCE: A2 and A3 are UNDERPOWERED ON COST

The replay puts L2 diff at **1.4–2.2 points on top of cap+pointer** (3–5% standalone). At
n=3, run-to-run spend variance is far larger than 2%. **The A2/A3 cost comparison therefore
CANNOT resolve, and this is stated BEFORE the data exists so no post-hoc story can be told
about it.**

- A2/A3 cost differences will be reported as **UNRESOLVED**, never as evidence of an effect
  in either direction — including if they happen to look favourable.
- What A2/A3 CAN legitimately answer: does the diff break anything, does it change the
  worker's behaviour, does it green. Capability and safety, not cost.
- Additional known limit: the $0 replay **could not measure L2 at all** — every edit-adjacent
  path was excluded because pre-edit bytes are unrecoverable from disk. The 3–5% figure comes
  from a different instrument (the Phase 1 money replay), not from the read replay.

## Stated hypothesis about the diff, registered so it can be WRONG

The levers are expected to be **substitutes, not additive**: the cap truncates the re-read
the diff was going to shrink, and a worker successfully steered onto `ctx_get` fetches small
slices that a diff can barely improve. Prediction: **A3 ≈ A1, and A2 alone < A1.** If A3
beats A1 by more than the noise floor, this hypothesis is wrong and gets recorded as wrong.

## Operational rules

- Every run under `systemd-inhibit` (the machine idle-suspends in ~12 min and suspension
  freezes outside watchdogs too).
- Paid runs launch `setsid`-detached, or a harness task-stop group-kills the run and leaves
  no watchdog report.
- Never poll with `pgrep -f "run-u.mjs --job <x>"` — it matches the poller's own command
  line and never exits. Poll the spine for `job-end`.
- The suite/gate is not run on a busy machine: a lone failure under concurrent load is
  unreadable, not red (established today, 4/4 quiet greens vs 2 failures under load).

## What this experiment does NOT claim

- Nothing about the native/clipipe surface — the read-cost model does not describe it.
- Nothing about genres other than the patient's own.
- No default-flip. The flag stays OFF regardless of outcome; flipping it is a separate,
  explicit decision that is hamr's alone.

---

# RESULT — fired 2026-08-19, 12 rows, $25.32 of the $60 ceiling

Battery driver `scripts/run-battery-readshim.mjs`; results
`bareloop-patients/aurora-u-bareloop/readshim-battery-mszcf8oa.json`.

| arm | valid n | green | median spend | vs A0 | ctx/round | retrieval share |
|---|---|---|---|---|---|---|
| A0 shim off | 2 | 2/2 | $1.9152 | — | 67,034 | 0.0% |
| A1 cap+pointer+G1 | 3 | 3/3 | $1.7050 | −11.0% | 54,503 (−19%) | 5.3–15.9% |
| A2 diff only | 2 | **0/2** | $3.3280 | +73.8% | 62,738 (−6%) | 13.1–14.5% |
| A3 all levers | 1 | 1/1 | $2.0581 | +7.5% | 58,211 (−13%) | 9.7% |

**THE VETO FIRED ON A2.** Green rate 0% against a 100% baseline — both rows escalated, and it
was also the most expensive arm. Per the frozen rule a cheaper arm that greens less is a
REJECTION, not a tradeoff; A2 did not even buy cheapness. The diff lever is dropped.

**A1 is the only arm that reached the pre-registered n=3**, and it wins on every axis the
prereg named: greens hold (3/3), lowest median spend, largest context cut, and the retrieval
steer demonstrably steers (A1 issued 18/11/4 ctx calls per run; A0 issued 1 and 1, both an
automatic `ctx_recent` returning zero hits).

**The registered prediction was that levers are SUBSTITUTES, not additive — A3 ≈ A1, A2 alone
< A1.** A3 ($2.0581) did NOT beat A1 ($1.7050), so the hypothesis is not refuted; but A3 is
n=1 and resolves nothing in either direction.

## What is NOT claimed

- **The −11% money saving is NOT established.** A1 ranged $1.44–$1.93, A0 ranged $1.77–$2.06 —
  the ranges OVERLAP, and A0 reached only n=2 because a casualty ate its third row. Reported as
  suggestive, never as a measured saving.
- **A2/A3 cost is UNRESOLVED**, exactly as declared in advance. A2's rejection rests on GREENS,
  which is a capability axis the prereg said A2 could legitimately answer.
- **5 of 12 rows were provider casualties** — all one TLS `bad record mac` class, hitting A0, A1
  and A3 alike, therefore NOT attributable to the shim. Two arms are short of n=3 because of it.
- Nothing about native/clipipe. Nothing about other genres. **No default flip** — the flag lands
  OFF regardless of this outcome, which was pre-registered and remains hamr's decision alone.

## Where the money actually is (measured, per valid row)

| | cache write | cache read | output | total |
|---|---|---|---|---|
| A0 | $0.93 | $0.68 | $0.38 | $1.99 |
| A1 | $0.68 (−27%) | $0.68 (0%) | $0.42 (+10%) | $1.78 |

The shim works on exactly the term it was designed for — bytes ENTERING the conversation —
and cut them 27%. It cannot touch cache READS, which are the accumulated transcript replayed
every round (peak 113,650 tokens in one round), nor output. Cache writes are only ~47% of the
bill, so a 27% cut there is ~12% of the total, and the output increase (the cost of writing
search queries) eats part of it. **~10% is the honest ceiling of THIS lever, and the arithmetic
explains the measurement rather than being fitted to it.**

## PARKED — read compaction (hypothesis, NOT pursued, needs validation before any build)

Cache reads are 38% of the bill and ~84% of what enters the transcript is tool results, so the
API's `context_management: {edits: [{type: 'clear_tool_uses_20250919'}]}` is the obvious next
target. It is PARKED, not scheduled, because a $0 arithmetic pass says it may cost more than it
saves:

- Clearing content mid-conversation breaks the prompt-cache prefix, so everything after the cut
  re-enters cache at $2.50/1M — more than 12x the $0.20/1M read rate being saved.
- Rough sizing on the observed 74-round run, clearing three times at ~50K tokens remaining:
  saved on reads ~$0.30, paid to re-cache ~$0.38. **Net possibly NEGATIVE.**
- These two numbers are an ESTIMATE from measured inputs, not a measurement. They are close
  enough together that the sign is genuinely unknown — which is the reason to park rather than
  build. Nothing here refutes compaction; it says the obvious implementation is unvalidated.

**The safety coupling, if it is ever built:** whatever compaction clears, the shim's delivery
ledger MUST forget in the same operation. The ledger holds `full` for a fully-delivered file
and answers a re-read with a pointer; if compaction deletes that file's bytes from the
transcript while the ledger still says `full`, the shim answers "you already have it" about
content the worker no longer holds. That is precisely the untruthful-pointer failure the shim
exists to prevent — 250 instances in the $0 replay, median 73,348 hidden bytes. Compaction and
the ledger must be ONE mechanism, never two that can disagree.

## Defect found by this battery — fetch-after-edit (fixed separately)

The shim's steer sends the worker to `ctx_recall` then `ctx_get`. `ctx_get` was UNWRAPPED, and
litectx's content-hash gate throws `StalePointerError` once the file changes on disk. Across
the three A1 greens: 10 `ctx_get` calls, **5 stale, 0 bytes returned**, every one of them a
file the worker had just edited — i.e. the normal case for this job genre. The steer routed the
worker into a path that breaks as soon as it does the work it was sent to do.
