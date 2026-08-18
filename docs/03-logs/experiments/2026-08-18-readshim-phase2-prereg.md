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
