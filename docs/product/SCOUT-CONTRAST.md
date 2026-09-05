# Scout ON/OFF cost contrast: scoping ($0, 2026-09-05)

Status line at the bottom. Pre-registered here BEFORE any switch exists, before any number
exists — the same discipline as `docs/product/G3-SCOPING.md`. Nothing here is a result.

## What this is for

Every plan-flow run opens with the SCOUT: a read-only survey (8 rounds, F59's reserved
toolless last round) whose only deliverable is a text brief for the PLANNER — the planner
drafts the plan and cannot see the repository. The scout is the harness's one fixed
per-run overhead. F124 ($0 deep archive read, 2026-09-01) measured it:

| measure (80 plan-flow runs, 73 with a scout) | value |
|---|---|
| share of plan-flow spend | 8.8% |
| median cost per run | $0.21 |
| max cost per run | $0.84 |
| median share of its own run | 10.8% |
| scout-off runs in the archive | 0 |

Its VALUE is unmeasured: there is no scout-off arm anywhere in the archive, so nothing can
say whether the 8.8% buys anything. F124 ranked it lever (3), "a small paid test, ceiling
~11% of a run, parked until after G3." G3 established 2026-09-01 (F125). hamr's order
2026-09-05: this contrast first, then G4, then the rest of the PRD list in order.

## Why scout-off can green at all (hamr's question, 2026-09-05)

The scout reads for the PLANNER, not for the WORKER. Every step worker reads the repository
itself, every run, regardless — read/grep/recall/get are its only eyes and nothing else
feeds them. Scout-off therefore means "the plan is drafted blind" (the prompt already
carries `(no scout notes)`, `src/planrun.js:587`), never "nobody reads." Two standing facts
say a blind draft is survivable:

- F59: 3 of 5 archived greens at the time had an EMPTY scout — the run drafted from
  `(no scout notes)` and greened anyway. That is why `scout-empty` is a named condition and
  never a halt.
- Resume skips the scout by ruling (`scout-skipped {reason:"resumed"}`) and a replan after a
  resume drafts from an empty survey plus the failure brief; that path has run and greened.

And one fact says the scout may be pure duplication: F124 measured 56% of read-class calls
as EXACT repeats. The scout reads files; the worker then reads the same files. If the worker
re-reads what the scout read, the survey paid twice for one piece of knowledge.

The expected failure shape of a blind plan is NOT a flat red: it is worse step targets and
worse file scopes, which surface as replans, step-reds and extra fix-loop turns. So the test
counts the ROAD, not only the colour.

## Design

**The switch (a build, small).** No scout-off knob exists today; `scoutRounds` bounds the
survey but `0` is not a legal "off" (F59 reserves a round). Add an operator-only knob:

- `scripts/run-u.mjs --scout on|off` (default `on`). Runner territory exactly like
  `--read-shim` and `--model`: the spec names no scout, so the signed hash is UNAFFECTED. An
  unrecognised value THROWS at argv before the approval gate (the `--read-shim` guard class).
- `runJob({ scout })` → `runPlan({ scout })`, boolean, default `true`.
- `scout:false` emits `scout-skipped { reason: 'operator-off', meaning: ... }` on the spine
  — a RECORD, never silence (the resume skip's own rule). The planner drafts from
  `(no scout notes)`. No other observable changes: OFF must be byte-identical to today's run
  everywhere but the survey, or the baseline arm becomes a treatment arm (the read-shim A0
  rule, `src/planrun.js`).
- Precedence on resume: the resume skip fires first and wins its own reason (`resumed`);
  `operator-off` is only ever emitted on a fresh run.
- Every re-invocation the runner PRINTS carries `--scout off` when set (the `SHIM_TAIL`
  rule): a resume that drops the flag runs the default while filed under the arm it was
  launched with — a silently mislabelled row.
- A probe knob, not a product default. Nothing here flips the default; the default-flip is a
  separate decision hamr makes on the measured number (the `layerRoot`/read-shim precedent:
  an unproven lever ships OFF and earns its default — here the unproven lever is OFF-ness).

**The contrast (paid, hamr signs).** One frozen bench job, two arms, n=1 each:

| arm | scout | everything else |
|---|---|---|
| ON (control) | default | identical: same spec hash, same patient reset commit, `--read-shim off`, worker `claude-sonnet-5` |
| OFF (treatment) | `--scout off` | identical |

Job: `aurora-u-spawner-types` — bench row, $5 / 30 min, hash
`5d989ae7…` (`docs/product/BENCH-PREREG.md`), patient `../bareloop-patients/aurora-u` at
`d661e50`. Chosen because it is the cheapest row and the one that greens most often (F124:
1-step greens median $1.77), so an OFF-arm colour change would carry signal rather than
drown in the row's own base rate. The ON arm is a fresh paid run, not a borrowed archived
green: same day, same model, same provider condition — an archived control would confound
on all three.

## Frozen rules (pre-registered now, before any number exists)

- **Read in this order, stop at the first that fires:**
  1. Colour. ON green and OFF non-green → the scout earns its keep; STOP, keep the scout,
     nothing to build. (One row, n=1: a single OFF red is still an anecdote — report it as
     "OFF failed once," never "OFF cannot green." A second OFF fire is hamr's word, not
     automatic.)
  2. Road. Both green → compare replans, step-reds, fix-loop turns, total rounds, and
     cost-to-green. A rougher road at similar dollars is "the scout buys shape, not money" —
     reported as such, no build.
  3. Money. Both green, same road → the dollar gap. n=1 detects BIG dents only: the OFF arm
     must beat ON by MORE than the scout's own measured cost on that run (the scout's rounds
     are on the spine under `phase:"scout"`, so the exact figure is known, not estimated)
     before it counts as a saving; a gap inside that figure is noise and is REPORTED as
     noise.
- **Provider-red is a casualty, never evidence** (standing rule): the row is re-fired on
  hamr's word, not counted.
- **Both arms fire under the same 2×200 provider probe.**
- **No budget tuning either direction.** $5 is the row's own number.
- **Nothing decides a default flip here.** The output is a measured number and a
  recommendation; the flip, if any, is hamr's separate word and lands with its own bench
  re-baseline (the read-shim precedent).
- **Ceiling:** 2 runs × $5 = $10 hard, plus the probe's cents.

## What this does NOT claim

- Nothing about litectx-shaped or testgen-shaped jobs: a 1-step aurora green is the easiest
  shape in the archive (F124), so an OFF green here is the FLOOR of the claim, not its
  extent. A second job is a second ask.
- Nothing about authoring's scout (`runAuthorScout`, `src/authorscout.js`) — a different
  instrument with its own ABSENT/retry rules; untouched.

## Open / not yet

- The switch — built on branch `feat/scout-off`. **hamr's order 2026-09-05: NO release
  first — the two arms run from the branch's working tree; release is the last thing, decided
  after the number is read.** This is a probe knob, not a bench pass, so the
  published-version rule for bench rows does not apply.
- The two runs — hamr's "fire."

## Result (2026-09-05) — MEASURED, F126

Both arms green from the branch. ON `u-mtoqtcb5` $3.18 / 54 rounds / scout $0.40; OFF
`u-mtor6qkd` $3.54 / 64 rounds. Same plan shape, same close path. OFF cost $0.37 MORE — inside
the $0.40 noise band, and in the wrong direction for a saving. Read order fired at step 3:
no saving. Lever closed, nothing to build, no default flip. Full account:
`docs/logs/FINDINGS.md` F126. Spend: $6.72 of the $10 ceiling.

**Status line: MEASURED (F126). Switch built on `feat/scout-off`, release is hamr's call.**
