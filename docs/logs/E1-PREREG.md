# E1-PREREG — harness2 E1, the 4-arm paid POC of a re-read HINT and a code-written HANDOFF note (FROZEN 2026-10-28)

Written before any battery run exists. Rules bind the whole read and never loosen after data.
Source of the rulings: hamr, 2026-10-28 (in-turn authorisation for the paid battery; arms, n, caps and the
pass rule are his). Context: `docs/wiki/HARNESS2.md` sections 5 and 7, `docs/logs/E0B-PREREG.md`
(E0b measured re-reads inside ONE worker: small; across workers: large). Provider and model for every
run: DeepSeek, `deepseek-flash`. Engine: a throwaway COPY of the repo, never the real `src/`.

## Question

Does a per-turn re-read HINT, and/or a code-written HANDOFF note naming the files earlier workers
already read, lower cost-to-green or change re-read behaviour?

## Engine (throwaway copy `.claude/scratch/e1-poc/engine/`, own git, nothing committed there)

Base: repo at 2a81471 (code 0.50.0) plus the following, all in the copy:
- The F252 shim fix, ported from 2a81471: `src/readshim.js` `reset()`, and `src/planrun.js` calls
  `shim.reset()` at the start of both ask() paths. In ALL four arms.
- `src/e1poc.js` (sha256 f235926455651f8f0b54cfbd31d70ca68c2e20d200f0c0ecd39dc3d628331ac9). Two env
  switches, both OFF by default, read once per run:
  - `BARELOOP_POC_HINT=1` (HINT): within one ask, a second read of the same key (`shell_read`: tool+path;
    `ctx_get`: path+line range) with no write/edit of that path between appends ONE fixed line to the
    tool result: `[bareloop note: this is a re-read in this try (N so far). ctx_get with a line range
    fetches only the part you need.]` (second sentence only if `ctx_get` is granted; else a `shell_grep`
    sentence if granted; else none). No file name. It is NOT appended when the shim already answered with
    its "unchanged since you read it" pointer (never doubled). `src/e1poc.js` `createReadTracker`/`hintLine`.
  - `BARELOOP_POC_HANDOFF=1` (HANDOFF): at the start of every step and fix ask (never scout or drafter),
    after at least one earlier read, code appends to the FIRST user prompt a map headed
    `== Files earlier workers in this run read (a map only; contents are not included; line ranges as
    ctx_recall prints them) ==`, one line per path, oldest first:
    `- rel (N lines): sym a-b, sym c-d, +K more` (named chunks from litectx, refreshed by a re-index;
    line count only for an unindexed file). Cap 8000 chars total, oldest paths dropped first with a
    `[trimmed: ...]` marker. Arbiter paths (`.smoke`, `.litectx`, `.git`, `.bareloop`, gate-audit, spine,
    attempt-diff) and paths outside the workdir never enter. Cumulative across the run. `createHandoffStore`;
    wiring in `src/planrun.js` `mkWorker` (`pocAsk`).
  - Arms: OFF = neither; HINT = `BARELOOP_POC_HINT=1`; HANDOFF = `BARELOOP_POC_HANDOFF=1`; BOTH = both.
- Report-only spine records added for this POC: `poc-arm` (every run: hint, handoff), `poc-shim-serve`
  (each shell_read answer: content/slice/pointer, path+bytes), `poc-hint` (each hint line delivered:
  phase, iteration, askIndex, tool, path, count), `poc-handoff` (each note delivered: phase, iteration,
  askIndex, chars, paths).
- `src/planrun.js` sha256 c45a8998bfc5b66c54024623044cea7f5653a537c2920baec6d16229fa44bd33 at freeze.
- Tests in the copy: `tests/e1poc.test.js` + `tests/planrun-resume.test.js` + `tests/readshim*.test.js`
  via `node scripts/hermetic.mjs`: 143 pass, 0 fail, exit 0 (before this freeze).
- Shim: the PRODUCT default (`run-u` with no `--read-shim` flag = `cap`, A1) in every arm, WITH the F252
  fix. Consequence stated up front: under A1 the shim already answers an unchanged `shell_read` re-read
  with a pointer, so HINT is live only for `ctx_get` re-reads and for `shell_read` re-reads of a changed
  or partially delivered file. The OFF baseline here is the product default, not shim-off.

## Jobs (3; signed specs, never edited)

Each run starts from a fresh copy of a clean template session dir
(`.claude/scratch/e1-poc/battery/templates/<job>/`: `resolved-spec.json`, `signing.json`,
`source-seed/source.json`, `source-seed/tree/`), a fresh scratch HOME (config copied from
`battery/base-home`: DeepSeek row, in $0.60 / out $1.20 per 1M tokens), no learnings carry-over
(fresh HOME per run), `--spec` mode. The run resets the tree to its seed at start.

| key | job | signed hash | genre | input | signed cap | `--draft-spent-usd` | enforced ceiling |
|---|---|---|---|---|---|---|---|
| pulselog | pulselog-panel-strict | 9f28b36edb8cd8acfb048de708ff65f6dbe0529ec433984c58d0404c178115d5 | code, strict tsc on src/checks.js | local tree (pulselog-panel-live seed 0e32c16) | $5 | 4.0 | $1.00 |
| p7 | pulselog-p7-small | 6cad0b6f55f5615b714240161d3d0afa4b5b6ab7ddb944cd1538a3b296344361 | code, JSDoc-only typecheck fix in src/ (the "harder" job: retried 2 of 3 steps and ran a fix loop in its one archived run, 80 exact repeats of 149 calls) | local tree (pulselog-p7-small seed eef0aa1) | $1.5 | 0.5 | $1.00 |
| change2 | change2 | 7dd9968919ed2243db2e78c4e3337389d04d715744d1ebb5abf0504838fee62d | rubric (soft-green), changelog summary | local file input/CHANGELOG.md in the tree | $0.5 | none | $0.50 |

`--draft-spent-usd` is the only lever used to tighten a cap (tighten-only; it is not spend, and the booked
spend below excludes it). p7's template differs from the panel session it came from in one place that is
NOT the signed spec: its `source.json` has the `worktree` key removed and its `tree/` is a clone of the
patient repo plus the `node_modules` the original run installed, so that 12 runs never share one
worktree. The p7 and change2 selection evidence is the archive (E0b data, `runs.jsonl` spines); p7 has
ONE archived green run, so its difficulty is an observation, not a rate.

## Design

- n = 3 runs per job per arm: 3 jobs x 4 arms x 3 = 36 runs. Sequential, never two at once.
- Order (frozen). Arms list ARMS = [OFF, HINT, HANDOFF, BOTH]. For rep r = 1..3, for slot k = 0..3, for
  job in [pulselog, p7, change2]: arm = ARMS[(k + r - 1) mod 4]. Round-robin by arm within each job, jobs
  interleaved, the arm order rotated each rep, so a budget stop at any point leaves arms within one run
  of each other for every job.
- Caps: ceiling per run as in the table (max $1.00, change2 $0.50, signed). Total hard stop $10: before
  each run the driver sums booked spend over all finished runs from the spines and stops if that sum is
  >= $10 minus the run's ceiling. A hard money cap binds between rounds and can overshoot a run by one
  round; the sum is re-read after every run.
- Booked spend = sum of `costUsd` over `worker-round` and `judge-round` records in the run's spine
  (customer price as configured; `pricing` provenance kept), `spendComplete` from `job-end`; a
  `spendComplete=false` run's spend is a floor.
- Casualties: an outcome of `provider-red`, or a run with no `job-end` and a non-zero driver exit, is a
  casualty: logged, EXCLUDED from every pass computation, and not re-run without asking hamr. Two
  casualties in a row stop the driver (a provider condition, not a coin flip to pay per row).
- Drafting is not exercised (`--spec` runs); there is no drafting spend.

## Measures per run (read after the battery, from spine + gate audit; never before)

1. Outcome (job-end/run-end), booked spend, spendComplete.
2. Attempts and fix rounds: count of `iteration-start` records per step phase; `fix-loop` records.
3. Kind A re-reads: read-class calls (`shell_read`, `ctx_get`) in one ask (run_id|phase|iteration) on a
   path already read in that same ask with no write/edit of it between.
4. Kind B re-reads: a read-class call in a later ask on a path an earlier ask of the run read, with no
   write/edit of it between (the E0b definition).
5. HANDOFF delivery: `poc-handoff` records (count, chars, paths). Conversion: among Kind B read calls in
   asks that received a note, the share whose path is listed in that note vs not listed; compared with the
   same share in OFF runs of the same job, using the note-equivalent set (paths read by earlier asks).
6. HINT delivery: `poc-hint` records (count). Conversion: re-reads of the same key after a hint, in the
   same ask, vs re-reads after the first (un-hinted) one in OFF/HANDOFF runs.
7. Shim serves (`poc-shim-serve`): pointer/slice/content counts, so the A1 pointer and the HINT are never
   confused.

## Pass rule (hamr's)

Within a job, an arm passes vs OFF if its runs are green as often as OFF's AND its median cost-to-green
(booked spend of its green runs) is at least 20% lower than OFF's median. Casualties are excluded from
the counts. An arm with no green run fails. An arm or job cut short by the $10 stop is reported at the
n it reached, with the pass rule applied to what exists and labelled UNDERPOWERED when any arm has n < 3
non-casualty runs in that job.

## Power note (stated before the data)

n = 3 on a nondeterministic worker with mixed outcomes is an anecdote either way. Archived runs of the
same specs span green, step-red, escalated and cap-halt outcomes. A pass is a reason to look further, not
proof; a fail is not proof of no effect. No colour flip is run to n = 3 more; no number here is re-tuned.
HINT is nearly inert on shell_read under the shim default (see Engine), so a HINT null is expected on
that surface and is not a finding about hints in general.

## Out of scope

No price list, no arbiter change, no edit of the real `src/` or `tests/`, no write to
`~/.config/bareloop`, nothing pushed. Findings from the battery go to `docs/logs/FINDINGS.md` after the
read, not into this file.
