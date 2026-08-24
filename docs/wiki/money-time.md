---
type: reference
title: "Money & time doctrine"
status: stable
sources: [docs/archive/PRD.md]
---

# Money & Time

Budgets, money ceilings, walls and time caps, halts, checkpoints, and resume economics — how bareloop meters a run, stops it honestly, and resumes it without re-paying for work already done.

## The honest-cost floor: unpriced is never free

Cost is `number|null` end-to-end. `null` means "spend unknown," never `$0` — no `?? cost` / `?? 0` fallback may launder an unpriced result into zero (PRD.md:409-428). The runner halts `pricing-red` on a null cost or on `unpricedRounds > 0`; a partially-unpriced run is also never free, and drafting calls route through the same accounting as everything else (PRD.md:409-428). This class was minted after a real harness confound (an unpriced `costUsd` reporting `spent=$0.0000` for a real API call) and caught three more silent $0 launderings in shipped code within a day of being named (PRD.md:409-428).

This floor generalizes into the authoring pipeline's own money ceiling: known spend **at or over** the ceiling is `cap-halt` even when the total is partly unknown, because the breach is certain on the priced half alone — naming that `pricing-red` instead would send the operator to fix a meter when the money is actually gone (PRD.md:4355-4455).

## Time as a cap: what T turned out to mean

Time was added as a first-class cap alongside money — a run carries a wall-clock bound (`maxWallMs`), operator-set, agent-tightens-only, never self-raised (PRD.md:1560-1662). The mechanism was justified by two premises that were both later corrected on evidence:

1. **The "hang" motivation is retired.** A wall-clock cap does not fix hanging; bare-agent's own inactivity timeout (BA-18) now catches dead sockets directly. Time's remaining value is as **a material and a metering unit**, not a hang-guard — the wall stays deliberately rough and earns no further build effort (PRD.md:1745-1806).
2. **Time is never told to the agent as a per-round rate.** The corrected rule, binding on money, time, and any future material: **a budget is told as a remaining BALANCE, never a per-round rate, a per-round allowance, or a derived round count** (PRD.md:1745-1806). A rate is a fiction at the round level — verification gaps measured 3.8s–561s (150×) — so a per-round constant breaks the agent's arithmetic on any heavy round while a balance is self-correcting and never states something to get wrong. A rate is also a stopwatch: racing a clock incentivizes rushing or faking, which is exactly what the worker-blindness contract exists to prevent. The balance is stated to the *planner*, never the worker (PRD.md:1745-1806). One accepted consequence: at draft time the balance *is* the total, so the agent cannot size its steps in time and may draft a plan that doesn't fit — that misfit is what the meter (replan) is for.

**Replan (A) becomes time-relative**, firing on a step consuming a declared share of the run's *remaining* time (money share carries the same threshold) rather than only on attempt-exhaustion (PRD.md:1560-1662). The variance threshold was kept at **0.5** deliberately as a guard set *above* the observed population (0.5 would have fired 0 times across 18 archived spines/54 steps, with near misses at 0.35/0.35/0.40/0.45) rather than tuned to the data — fitting a threshold to observed data is prohibited (PRD.md:1863-1919).

## The wall pauses; it does not cut the grade

This is the current, corrected state of a wall-halt, and it supersedes any earlier "the wall stops the run" framing:

- **The close is never bounded by the wall and never counts against it.** A deadline that stops grading leaves a run unreadable after the money is already spent (the F45 class, generalized from money to time). The run's honest enforced worst case is `maxWallMs + closeStages × closeTimeoutMs` — a staged close hands every stage the full timeout (PRD.md:2324-2377).
- **The wall PAUSES the run; it does not cut the grade.** Past the deadline, no new work starts — the close-fix loop opens no further iteration and a step that would begin already-expired does not begin. The run stops on the verdict the last close minted. hamr's ruling, verbatim: *"when time is up, keep the grade we already have and stop."* **The stop IS the checkpoint** (v1.12's resume-to-cap, extended from money to time) (PRD.md:2324-2377).
- The halt is decision-ready and carries a progress **trend** (`moving` | `stalled` | `unknown`, read off the last two close gaps) — a reading only, never a gate; one grade alone reports `unknown` rather than rounding up to `stalled` (PRD.md:2324-2377).
- **The outside kill requires evidence of death, not a clock.** The out-of-process watchdog may kill on its deadline only when the spine has *also* gone flat for a full stall-fuse window; past-deadline-but-still-writing is logged loud and never killed. The single liveness marker is spine bytes — a CPU-liveness marker was tried and measured broken in both directions (a live close read dead; a wedged run read alive) and was deleted rather than kept as decoration (PRD.md:2324-2377).
- **A wall-derived call timeout routes to `wall-halt`, never `provider-red`.** An uncategorised timeout on an *expired* clock is a `wall-halt` (governance stop, decision-ready, resumable); the same error with time still on the clock is `provider-red` (a casualty — excluded from evidence, retried), unchanged. An unbounded run can never produce a `wall-halt`. A genuine transport hang on a run whose wall has *also* passed reads as `wall-halt` by deliberate, stated design — the remedy (raise the cap) is identical either way (PRD.md:1863-1919).

None of this changes who owns the bound: budgets, walls, caps and verdicts remain operator territory, permanently (PRD.md:2324-2377; PRD.md:2481-2549).

## Resume: an economics contract

Resume rests on hamr's ruling: *"even if it gets killed by outside, it should allow resume and start last step instead from the beginning... our goal is to find ways to save money and time"* — this superseded an earlier try-level restart reading, on measured evidence that a try-level restart re-paid $0.25 then $0.40 of scout across two resumes and still left the third leg unable to finish (PRD.md:2481-2549).

- **The checkpoint is a completed step's exit** — the finest unit the spine can prove finished and the tree can show. A half-executed step or a worker transcript is not a checkpoint. Try-level restart survives only for death before a plan was accepted, where nothing durable exists to resume to (PRD.md:2481-2549).
- **Restarts are funded from the remainder, never a fresh allotment.** Prior spend and prior wall fold into the run's own ledger and clock (`priorSpentUsd` / `priorWallMs` / `priorElapsedMs`); the signed caps are untouched, so *advertised = enforced* survives a kill and a kill cannot widen the signed worst case one kill at a time. If the remainder can't fund the restart, the run caps honestly, having launched nothing (PRD.md:2481-2549).
- **What resume does not buy back:** a call killed before it returned wrote no event, so money it may have been billed for is not on the spine and cannot be folded — this is an honest floor, exactly the case `spendComplete: false` already marks. A lost registry write is reported LOST and never re-derived. A resume never resets the patient and never resumes a live pid (PRD.md:2481-2549).
- **The signature covers the tries.** A reuse run's total authorized exposure is `perTryBudgetUsd × (bridgeTries + 1)`, so the signed artifact is the wrapper `{schema:'reuse-v1', spec, bridgeTries}` — a signature taken over the per-try spec alone would sign only a fraction of the money. Signatures taken before this fold are refused outright, with both hashes printed side by side; a resume must match the hash both ways (current arguments and the dead run's own start record) (PRD.md:2481-2549).

### Resume reached every halt class

- **Wall-halt** resumes as above (module W-2/W-3) (PRD.md:2324-2377).
- **Kill-resume** (`--resume <runid|spine-path>`) landed as the answer to outside kill (module C) (PRD.md:2481-2549).
- **Money cap-halt on the user-mode path (`run-u`)** was the missing third leg — the case hamr's original "why would I waste money on something I already started" ruling was about. Fixed as wiring, not new machinery: `--resume` skips the seed reset, folds the dead run's spend as `priorSpentUsd`, skips the completed plan prefix, and re-enters at the outer close + fix loop; ceiling never silently widens (PRD.md:2679-2742; PRD.md:2743-2783).
- **`step-stalled` widened into the resumable set** (hamr: "go"). Two shapes reach that terminal — a plain stall, and a stall-with-time-left that trips a replan the gate then declines to fund past deadline — and resume is the right answer to both. The *name* stays `step-stalled` rather than being renamed to `wall-halt`, because `src/run.js` keys the F44 spend floor on that name; renaming would report unknown spend as exact. A green or a red still never resumes (PRD.md:4596-4677).

### Live proof: pause → top-up → resume → pass

The first end-to-end read of this whole cycle: `bareagent-u` halted on money, hamr signed a top-up in-turn (`"go 8/45"`, `budgetUsd` 4→8, `maxWallMs` 25→45min — a spec edit that re-signed the hash), and the run resumed at the close checkpoint with the one finished step skipped, no re-scout, no re-draft. The fold was declared once at job-start (`priorSpentUsd 4.1261`, `priorWallMs 24.9min`) against the signed $8, and the resumed leg cost **$1.21 and 12.8 minutes** to close both remaining stages and reach green (PRD.md:2784-2847). The cycle was also pinned deterministically: a no-top-up control leaves a byte-identical tree, and an unsolvable-cycle test shows a topped-up flat leg strikes out at the fix-loop limit with money still unburned — a top-up does not buy the right to burn the wallet on a dead axis (PRD.md:2784-2847).

Two items were parked from this read, unresolved as of these addenda: whether the wall halt's byte-equality trend and the money halt's per-stage numeric trend should unify (arbiter territory, hamr's call); and a MED-severity gap where the restart-fold path can launder a `spendComplete` floor into an exact total by consulting only 2 of 4 causes the graded path checks (PRD.md:2784-2847).

## Money gets the "W-2 treatment"

A money cap-halt was made to mirror what W-2 built for a time halt: decision-ready, with an accurate trend computed **per stage** from the close's own graded numbers — never merged across axes, and never model prose. No extractable number reports `unknown`, never a rounded-up guess (PRD.md:2679-2742). Levers are W-2-symmetric: top-up & resume (a re-sign) / revise the spec / abandon (PRD.md:2679-2742).

The close-fix loop's `CAP_RUNS` count retired as its governor, replaced by a 2-strike no-progress rule read per stage: a $0 replay of every archived fix-loop found 0 greens harmed and 1 real waste case caught (a run dead-flat at 2 errors for 7 consecutive verdicts, stopped at verdict 4 instead of riding the wall out) (PRD.md:2679-2742). `capRuns` survives only as a blind-instrument fallback while the trend has never yet compared anything — a sabotage mutant proved the loop non-terminating without it (PRD.md:2743-2783). Money and wall keep full authority regardless; the fix loop should die "when it is out of ideas, not out of money mid-convergence" (PRD.md:2679-2742).

## The replan ceiling is a RUN bound, and spans the resume chain

A replan ceiling bounds how many times the workflow may be redrawn before redrawing is thrash ("unlimited replanning launders thrash as adaptation") — and that bound spans the whole resume **chain**, not the leg currently executing, because a run does not become a second run by being killed (PRD.md:3593-3675). This was found broken in the field: `replanned`/`varianceGrantUsed` lived as locals in `runPlan`, so leg 1 replanned and stopped, and leg 2 (resumed) replanned again — two replans against a ceiling of one, with every spine record still showing 1. Two would have become four by being killed once (PRD.md:3593-3675).

The fix follows the **money fold**, not the grade-seed's single-spine-read precedent: each leg declares the ledger it inherited on its own spine (`priorReplans`, `priorReplanGrantUsed`, emitted only when there is a fold), and the next reader adds only that leg's own replan records. The general form: *before seeding anything across a resume, ask whether the thing being seeded is bought with the leg's money or declared by the run's signature* — an attempt allowance is a **leg** bound (bought with the leg's own money), a replan ceiling is a **run** bound (declared by the signature), and they fold in opposite directions (PRD.md:3593-3675). A $0 sweep over `runPlan`'s own declarations found this was the only other local-reborn-per-leg bound besides money/wall/tries, which were already correctly folded (PRD.md:3593-3675). Nothing here changes what the ceiling number *should be* — only that the signed number is now the enforced one.

## The authoring pipeline gets its own money ceiling

Through v0.9.0 the close-authoring pipeline (`run-author.mjs`) only *metered* spend; nothing bounded it — the only limits were attempt ceilings (`SCOUT_ATTEMPTS`, `MAX_REVISIONS`, `MAX_STRUCTURE_RETRIES`), which bound how many times to ask, not what asking costs (PRD.md:4355-4455). `--budget` was added with **no default**, deliberately — a defaulted cap is a silent second ceiling, a mistake this repo already paid for twice. Omitting `--budget` runs unbounded and the runner prints that before the provider is even built; a malformed value (`banana`, `0`, `-1`) is an **error**, never a silent fallback to unbounded (PRD.md:4355-4455).

The check binds **between** metered calls only — never mid-call, because a cap that binds mid-call kills the row before it can be graded (F45's class: 3 of 7 launches lost, $5.82 unreadable) — and covers both the survey and the declaration-loop populations under one number, with spend folding in so re-entering cannot silently widen it (PRD.md:4355-4455). The stop is a **governance stop**, never an error: it names the cap and spend, nothing retries, every partial artifact stays on disk, and resume-to-cap applies unchanged — the stop is the checkpoint (PRD.md:4355-4455).

This was later hardened at the library seam itself: `capStop` now **throws** on a non-null, non-finite ceiling (`NaN`, `Infinity`, `true`, `{}`, or a numeric string) before the first paid call, closing a gap where only the CLI's own parser enforced the malformed-input rule and a library caller could pass a bad ceiling straight through to a cost book that advertised it while enforcing nothing (PRD.md:4596-4677).

The revise-loop's own clamps (`maxRevisions`, `structureRetries`) are tighten-only, floor 0, ceiling 2 — but were found to be **prose, not protection**: three mutations (deleting the clamp; honoring only the two extremes) all survived undetected, because the existing tests pinned only the ceiling and the floor, never the values between them. Seven new tests now cover the middle of the range; the one remaining equivalent-mutant survivor is a recorded latent hazard (the two constants happen to both equal 2) (PRD.md:4355-4455).

## Transport retry and the provider-red resume (2026-08-24)

Context: every `aurora-u` provider-red since 2026-08-19 (7 of 7 recorded) carries the same
string, `SSL routines:ssl3_read_bytes:ssl/tls alert bad record mac` — a TLS transport error
under the API, not an HTTP response and not the job's own logic, on every read-shim arm
including OFF. Not reproduced at $0; a paid keep-alive probe (39/39 clean) did not reproduce
it either. Cause unproven, named for hamr rather than chased further (F115).

### What "transport" means, and the fixed retry

`src/transport.js`'s `isTransportFailure` classifies the failure: a TLS fault,
`ECONNRESET`/`EPIPE`/`ETIMEDOUT`, or `fetch failed` over a network cause — anything where the
request never produced an HTTP response. An HTTP response that came back 4xx/5xx/429 is
**not** transport; upstream's existing retry policy for those is unchanged. A wall-clock
timeout (the run's own deadline expiring mid-call) is never retried either — that keeps
routing to `wall-halt`, unchanged from the existing rule.

hamr's ruling, verbatim: *"one retry for transport layer failure and reporting with the rest
end of gate."* The one worker-Loop seam (`src/planrun.js`'s `newLoop`, covering
scout/drafter/every step worker/fix worker) gets **exactly one** extra attempt on a
transport-only throw. The count is a fixed constant, never a spec or argv knob — raising it
past one is a tighten-only-in-the-other-direction change and stays reserved (the same "any
retry/clamp change is tighten-only, never loosens" doctrine that binds every other cap in this
programme). Judge loops, the native/CLI session path, and `src/authorscout.js` are unchanged
— the retry is scoped to the one seam named above.

### Why a retry makes spend a FLOOR, never an exact total

A transport failure can happen **after** the provider has already processed and billed the
call — the response died in transit, not before it was generated. Retrying pays for a second
attempt without proof the first one was free. So any retry on this seam forces
`job-end.spendComplete: false` for the rest of the run, recovered or not: the first attempt's
possible spend stays invisible either way, exactly the standing F6/F44 honesty floor (unpriced
or unconfirmed is never rounded down to zero). Each retry also emits a report-only
`transport-retry` spine record, and the count/outcome print at the run tail.

### If the retry also fails: provider-red joins the resumable set — BUILD PENDING

Today `--resume` refuses on `provider-red` (it is a terminal, not a governance halt — F114
§4). The ruled change: if the one transport retry (above) also fails, the run still ends
`provider-red`, but `--resume` will re-enter at the recorded step with the accepted plan
instead of refusing, the same step-level resume every other halt class already gets.

**No cost or step threshold gates the offer.** A threshold would be a number picked from a
small observed sample — arbiter territory reserved for hamr, and this programme's own
doctrine forbids fitting a threshold to a handful of data points. Instead the tail prints an
honest readout and hamr decides case by case:

```
outcome   provider-red (after 1 transport retry)
spent     ≥$4.10 of $5 · died in step 3 of 4
resume    node scripts/run-u.mjs --job aurora-spawner --resume <runid> --read-shim A1 --approve <hash>
```

`spent` is stated as a floor (`≥`) because `spendComplete:false` already marks the first
attempt's spend as possibly unaccounted — the readout must not silently round that up to
exact. **Not built yet** — this section documents the ruled shape; the resume path itself
still refuses on `provider-red` until this lands.

## Attempt bounds now name their cause to the worker

Round cutoff, wall, and fence-deny-streak all used to write the same bare iteration number, so a fence deny streak rendered as "CUT OFF after N tool rounds" — wrong on both cause and count. The bound now carries `{iteration, cause, reason}` and the denial branch quotes the recorded terminal verbatim, inventing nothing beyond what bare-agent's own `denied:<tool>` return and the gate's recorded reason state (PRD.md:4596-4677). This is the same checkpoint-doctrine family: the attempt is judged, the gap feeds forward, and the next attempt now knows which wall it actually hit.
