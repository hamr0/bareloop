# Run thinking SPLIT vs ON contrast — pre-registration (FROZEN 2026-10-16)

**FROZEN 2026-10-16** on hamr's go, before any battery number exists. Nothing below loosens after a number exists.

## Why

DeepSeek deepseek-flash thinks by default. The drafter contrast (2026-10-10, same folder) showed that
turning thinking off for the no-tools drafting calls was about 5x cheaper and 3x faster, and the P7 ruling
made that the drafting default. The open question is the RUN: the planner calls inside a run (draft,
redraft, replan) are no-tools requests like the drafter's, while scout, step and fix calls carry tools.
A hand POC (scratch `.claude/scratch/poc-thinking/`) ran the change2 rubric job once all-off (run
mvao31e3, plan-red: the plan was not valid with the planner's thinking off) and once SPLIT (run
mvaoagnq, green, $0.014, 1.3 min). Two runs are an anecdote, so this is the n=4 per arm contrast.
Hamr chose option A on 2026-10-16.

## Arms (the ONLY difference between arms is the thinking field)

- **ON** = today: no thinking field on any request (DeepSeek thinks everywhere).
- **SPLIT** = planner requests (the ones that carry no tools: draft, redraft, replan) send no field;
  scout, step and fix requests send `thinkingMode: 'off'` (`thinking:{type:'disabled'}` on the wire).

Provider/model: DeepSeek deepseek-flash, the jobs' own signed settings (see the divergence note on the
code job's model below). Everything else (read shim, scout, strike limits, close) is the job's own and
identical in both arms. The split is a POC-only per-request wrapper in the battery driver; no `src/` file
is touched. Each run's real requests are tapped (thinking field and tool count only, never headers or the
key) and the arm invariant is checked on live traffic; a violation stops the battery.

## Jobs (2)

1. **change2** — changelog rubric job, 452 KB input (the existing `session/` template; signed $0.50,
   20 min). Facts line + short summary, judged by mechanical rules.
2. **pulse-again** — a code job: "make `src/digest.js` pass `tsc --strict` with zero errors, all existing
   tests passing, no new strict errors elsewhere, no suppressions". Deterministic close (7 stages:
   changed-from-seed, strict errors in digest, strict errors outside digest, tests-kept count, suite exit,
   suite zero failures, no-suppressions). Signed $1.00, 20 min. Patient: a COPY of the saved session tree
   (git seed 0f18915, pulselog); the original `pulselog-p5b` is never touched. Chosen by a $0 archive read
   (candidates and reasons are in the builder's report): it is the only DeepSeek-green code job with a
   saved resolved-spec, a complete source copy in the session and a green run cheap enough for the
   per-run ceiling (run muvbmk2f: green, $0.067 including $0.05 drafting, 5.5 min, 29 rounds, one fix
   loop on the no-suppressions stage — so it exercises scout, plan, step AND fix).
   The same shape (digest.js strict) is green in a second job (pulselog-digest-try, muxovbw4) and
   step-red in a third (pulselog-digest-strict, muv50wb2), i.e. it is not a ceiling job.

The patient is a fresh copy of the template for EVERY run (the run itself also resets it to the seed).
Scratch HOME with an empty `runs.jsonl` per run; nothing lands in `~/.config/bareloop`. The saved bridge
from the archive run is NOT in the template, so no run reuses a plan.

## Size and order

4 runs per arm per job = 16 runs. Per job, interleaved ABBA-style: ON, SPLIT, SPLIT, ON, ON, SPLIT,
SPLIT, ON. Jobs run one after the other (change2 slots 1–8, then pulse-again slots 9–16), sequentially,
never in parallel.

## Money

- Per-run enforced ceiling **$0.25** for both jobs, set with `--draft-spent-usd` (change2: signed $0.50,
  `--draft-spent-usd 0.25`; pulse-again: signed $1.00, `--draft-spent-usd 0.75`). The ceiling folds in
  the number passed, so each run can spend at most $0.25 of real money; the 20-minute wall of each signed
  spec stays.
- Battery HARD STOP **$2.00** total: the driver sums each run's real spent (the spine's job-end
  `spentUsd`, casualties included) after it ends and refuses to start the next run if total + $0.25 would
  exceed $2.00. It stops and writes a stop row; it never skips silently. Expected spend is far lower
  (archive: change2 $0.03–0.18 per run, the code job about $0.02–0.07).
- The driver's `--draft-spent-usd` figure is a ceiling mechanic, not spend, and is not summed.

## Casualties

A run ending provider-red from transport (HTTP error, timeout, reset — a provider-red whose detail is not
a truncation / max_tokens) is a casualty: excluded from every count, replaced ONCE in the same slot. Two
casualties in a row (including the replacement itself) STOP the battery: a condition, not noise. A run
that leaves no spine, or a run that breaks the arm field invariant, also stops the battery.

## Frozen decision rule

Per job, primary = green count (green = outcome `green`; a `softgreen`, escalated, step-red, plan-red or
cap-halt is not a green). Secondary = median spent, median wall, plan valid on first try, max_tokens
cut-offs.

- **RECOMMEND** building the split switch iff, on EACH job, SPLIT greens >= ON greens AND SPLIT median
  spent < ON median spent.
- If SPLIT has fewer greens than ON on either job: **no build**, log the result as a finding.
- Anything else (greens not worse, but median spend not lower on some job): rule not met, no build.

## Declared up front

- UNDERPOWERED: n=4 per arm can only show a large difference, not a small one.
- A tie on greens with lower cost reads "no worse at n=4", not "proven equal".
- Full-run quality beyond the close's verdict is unmeasured.
- Two jobs; one rubric (facts + summary) and one code job. Neither is a hard job; a ceiling effect (all
  green in both arms) is possible and would be a tie on greens decided by cost alone.
- Divergence: the code job's saved spec predates `spec.model`; its model (deepseek-flash) comes from the
  saved card and is passed as `--model deepseek-flash`, exactly as the original panel run did. Its signed
  hash is unchanged.
- The code job runs in a plain copied tree (the older run shape), not a `.bareloop/wt` worktree.
- The POC runs are background, NOT rows: mvao31e3 (all-off, plan-red) and mvaoagnq (SPLIT, green,
  $0.014, 1.3 min). Archived change2 ON-like runs (mv76m82c green $0.035; mv97ju82 green $0.027; mv9euoam
  escalated $0.061; mv9gm796 provider-red, one 32k cut-off, $0.111; mv9vzze6 step-red $0.182) are
  context only, not rows.

## SECONDARY, REPORT-ONLY columns (they do NOT enter the frozen rule)

Recorded per run in `results.jsonl` and summarised per job and arm. Reason: a later idea is "thinking off
by default, on when a step retries"; this data says whether SPLIT-arm runs retry more.

- attempts per step (iterations per step, from the spine's step-start / iteration-start records) and
  strikes (ladder records that did not improve),
- fix-phase rounds,
- replans,
- output tokens on the first attempt versus retry attempts (step and fix rounds with iteration 1 versus
  iteration 2 and later),
- per-phase output tokens (scout / plan / step / fix / judge), rounds per phase,
- wall time, plan valid on the first draft, max_tokens cut-offs.

None of these decides the build. They are reported as observed, with the underpowered caveat.

## Results

Results get appended below this heading in a later commit; the sections above never change.

### 2026-10-16 — battery results

Source: `.claude/scratch/poc-thinking/battery/paid/summary.txt` (with `results.jsonl`, `battery.log`, `spines/`).
Total counted spend **$0.7111 of the $2.00** hard stop. One casualty: slot 7 attempt 1, run mvas306h, provider-red (transport), replaced once in the same slot by mvas5ty2 (green); the casualty is excluded from every count below.

**Per-run rows** (slot 7 attempt 1 is the casualty, marked C)

| slot | job | arm | att | run | outcome | spent $ | wall min | planOK1 |
|---|---|---|---|---|---|---|---|---|
| 1 | change2 | ON | 1 | mvarngk9 | green | 0.0149 | 1.2 | false |
| 2 | change2 | SPLIT | 1 | mvaroz1h | plan-red | 0.0405 | 3.0 | false |
| 3 | change2 | SPLIT | 1 | mvarsueu | escalated | 0.0240 | 3.0 | true |
| 4 | change2 | ON | 1 | mvarwp6u | green | 0.0254 | 2.0 | true |
| 5 | change2 | ON | 1 | mvarz9x4 | green | 0.0102 | 0.8 | true |
| 6 | change2 | SPLIT | 1 | mvas0dh9 | green | 0.0255 | 2.0 | true |
| 7 | change2 | SPLIT | 1C | mvas306h | provider-red (casualty) | 0.0142 | 2.1 | true |
| 7 | change2 | SPLIT | 2 | mvas5ty2 | green | 0.0160 | 1.3 | true |
| 8 | change2 | ON | 1 | mvas7oi6 | plan-red | 0.0194 | 1.5 | false |
| 9 | digest | ON | 1 | mvas9mbb | green | 0.0596 | 5.5 | true |
| 10 | digest | SPLIT | 1 | mvasgqur | green | 0.0300 | 3.2 | true |
| 11 | digest | SPLIT | 1 | mvaskwtk | green | 0.0187 | 2.2 | true |
| 12 | digest | ON | 1 | mvasnt5v | green | 0.0734 | 6.3 | true |
| 13 | digest | ON | 1 | mvasvwzr | green | 0.1574 | 13.3 | true |
| 14 | digest | SPLIT | 1 | mvatd35f | green | 0.0244 | 2.7 | true |
| 15 | digest | SPLIT | 1 | mvatgj1w | green | 0.0453 | 5.5 | false |
| 16 | digest | ON | 1 | mvatnmjk | green | 0.1124 | 9.1 | true |

No answer was cut off at max_tokens in any counted run (cutoffs 0); the arm field was correct on every run.

**Per job x arm** (n = counted runs; the frozen primary is the green count)

| job | arm | n | green | median spent $ | median wall min | planOK1 | cutoffs |
|---|---|---|---|---|---|---|---|
| change2 | ON | 4 | 3 | 0.0171 | 1.3 | 2 | 0 |
| change2 | SPLIT | 4 | 2 | 0.0247 | 2.5 | 3 | 0 |
| digest | ON | 4 | 4 | 0.0929 | 7.7 | 4 | 0 |
| digest | SPLIT | 4 | 4 | 0.0272 | 3.0 | 3 | 0 |

**Secondary, report-only** (not in the frozen rule)

| job | arm | mean step attempts | strikes | fix rounds | replans | tokens retry / first |
|---|---|---|---|---|---|---|
| change2 | ON | 1.00 | 0 | 0 | 0 | 0 / 17647 |
| change2 | SPLIT | 1.67 | 2 | 28 | 0 | 6220 / 18306 |
| digest | ON | 1.86 | 0 | 15 | 1 | 57740 / 174138 |
| digest | SPLIT | 2.17 | 0 | 16 | 0 | 13061 / 33164 |

**Frozen rule's verdict (verbatim):**

- change2: greens SPLIT>=ON NO; SPLIT median spent < ON NO
- digest: greens SPLIT>=ON yes; SPLIT median spent < ON yes
- => **NO BUILD — SPLIT has fewer greens than ON on change2**; log the result as a finding.

**Reading (not a result, the verdict stands).**

- The planner is identical in both arms (thinking on). change2 had 2 plan-reds, one per arm: mvaroz1h (SPLIT; draft-1 check-passes without tree-changed, draft-2 a pattern that does not compile as a RegExp) and mvas7oi6 (ON; draft-1 field `exits` instead of `exit`, draft-2 JSON parse error). So 2 of 8 change2 plans failed validation twice with thinking ON in the planner.
- The other change2 SPLIT non-green, mvarsueu, escalated after 2 strikes and 28 fix rounds.
- digest: 4/4 green in both arms; SPLIT median $0.0272 vs ON $0.0929 (about 3.4x cheaper), median wall 3.0 vs 7.7 min.
- n=4 per arm is underpowered, as declared.
