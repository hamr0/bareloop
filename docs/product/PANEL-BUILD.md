---
type: reference
title: "Panel (N6) build — layering, the gap, and the rungs"
status: active
sources: [docs/product/PRD.md]
---

# Panel (N6) build

The build plan for PRD item N6, the panel (§10 build order; superseded routing per PRD
addendum v1.84 below). The PRD holds the rulings; this file holds the layering law, the
measured gap between today's code and a panel, and the milestones each with its own exit
condition. Branch: TBD (opened when P0 starts). Builders are sonnet (strict pin); every rung
lands green on its own before the next starts.

## 1. What the panel is

From hamr's scope interview (`.claude/stash/2026-09-22-panel-design-settled.md`): the panel is
where hamr runs and starts workflows — his management panel and observability surface. He
fills the job's requirements (provider/token price, check type, time cap, money cap, up to two
review rounds plus a confirm turn) and, once a run is signed and firing, watches it live: turn,
elapsed time, glyph per step, step descriptions, and where a stuck run got to. It shows audit
traces, supports replaying a past run at $0, lists previous runs, and can import a run (bundle
and run record) for view-only inspection. It handles multiple workflows at once and runs at
127.0.0.1 (localhost) only — no LAN, no phone access (parked). It is lightweight JS with a
workflow map in the codegraph style (plain step boxes, not a text-only timeline).

## 2. The layering law

**hamr's ruling, option A — one source, each layer calls the next:**

> `src/` library function → `src/cli.js` command → panel HTTP handler.

Each layer calls the one inward of it. The library functions in `src/` are the single source
of truth for every flow; `src/cli.js` commands are the CLI's own callers of those functions
(the same shape `bin/bareloop.mjs` already is over `src/cli.js` — a thin ~10-line adapter
that supplies real deps and turns an exit code into `process.exitCode`, never re-implementing
anything `src/cli.js` does). The panel's HTTP server is one more caller in that same chain: it
calls the same library functions `src/cli.js` calls (directly, in-process — never by shelling
out to a script or another CLI invocation), and it never re-implements arbiter or flow logic
of its own.

**Consequence, stated as a gate:** a flow with no CLI command is not ready for the panel. If
the panel needs a flow that only exists today as inline logic in a `scripts/*.mjs` file, that
logic moves into `src/` and gets a `bareloop <command>` FIRST (rung P0, below) — the panel
never reaches past `src/cli.js` into a script.

This is also hamr's answer on where the panel lives: inside the bareloop package itself
(no separate process wired by IPC, no new dependency to talk to a sibling server) — the panel
HTTP handler is one more file in this same codebase, requiring nothing `src/cli.js` doesn't
already require.

## 3. The gap, measured

Measured 2026-09-23 (pre-P0); re-verified 2026-09-24 against the actual source
post-P0 — every row below the CLI line the 2026-09-23 table marked "No" now has a
`bareloop` command, confirmed by grep/`wc -l` on the current tree, not restated from the
earlier table.

| Flow the panel needs | Where the logic lives today | CLI command today? |
|---|---|---|
| Export a job spec to a bundle | `src/bundle.js` (`exportBundle`, exported from `src/index.js`) | Yes — `bareloop export` (`src/cli.js:doExport`) |
| Run a signed bundle against a repo | `src/run.js` (`runJob`) + `src/bundle.js` (bundle read/bless/envelope) | Yes — `bareloop run` (`src/cli.js:doRun`; corrected 2026-09-30: `doRun` is gone — `bareloop run` routes to `bundleMain` in `src/bundlerun.js`, a thin door onto the `src/userrun.js` engine) |
| List a bundle's history + bridges | `src/index.js` (`loadRegistry`, `listingRow`) + `history.jsonl` | Yes — `bareloop history` (`src/cli.js:doHistory`) |
| **The interview** — the ENTRY GATE for a new job (source/destination, goal, guardrails, check type, judge examples, confirm turn) | `src/interviewrun.js` (one argv-parsing `main(argv, deps)`, lifted verbatim out of the former `scripts/run-interview.mjs` repo script per P0); `scripts/run-interview.mjs` is now a thin ~22-line adapter over it | **Yes** — `bareloop interview` (`src/cli.js`, routes to `interviewMain`) |
| **Authoring** — draft/revise/sign a job spec from interview answers | `src/authorrun.js` (one argv-parsing `main(argv, deps)`, lifted verbatim out of the former `scripts/run-author.mjs`); `scripts/run-author.mjs` is now a thin ~22-line adapter over it | **Yes** — `bareloop author` (`src/cli.js`, routes to `authorMain`) |
| **Person-path run** — the full run-a-job flow (resume, pause, review door, replay) | `src/userrun.js` — one internal engine behind three thin named doors (`startRun`/`resumeRun`/`answerDoor`, per the settled "one module three thin doors" shape below), lifted out of the former `scripts/run-u.mjs`; `scripts/run-u.mjs` is now a thin ~20-line adapter over it | **Yes** — `bareloop run-u` (`src/cli.js`, routes to `runUMain`) |
| Replay an archived run at $0 | `src/replay.js` (`replayRun`, `formatReplay`) + `src/replayio.js` (the IO layer: `parseJsonl`/`looksLikeSpine`/`replayOne`/`listSpines`, lifted out of the former `scripts/run-replay.mjs`) | **Yes** — `bareloop replay <spine.jsonl>` and `bareloop replay --all <dir>` (`src/cli.js:doReplay`) |
| Read the spine for History/Run/Audit tabs | `src/replayio.js`'s `parseJsonl` (tolerant JSONL reader, skips a malformed line instead of throwing) is now the one named reader; `doHistory` (`readHistoryLog`) and `doRun`'s own job-end tail read both call it instead of hand-rolling `readFileSync`/`JSON.parse` inline | **Yes** — no separate read-only subcommand was needed; the panel's read side calls `src/replayio.js`'s exported functions directly, in-process, the same way `src/cli.js` does (per the layering law, §2) |
| Gate-audit trail for the Audit tab | `src/replayio.js`'s `replayOne` resolves and reads a spine's `-gate-audit.jsonl` sidecar by the name convention (content-based spine detection, sidecar-by-name) — one library reader, no per-caller re-implementation | **Yes** — same as the row above: `bareloop replay` exercises it; the panel calls `src/replayio.js` directly for the Audit tab |

**P0 status: COMPLETE** (see §4 below for the exit condition text and what was actually
delivered against it).

**The entry gate for a new job is the interview** (`scripts/run-interview.mjs`) — hamr's own
words point here: *"on all scripts, they should have had cli, shouldn't they?"* Every flow in
the table above the CLI already has (export/run/history) stays as-is; every flow below it
(interview, author, person-path run, replay, and the two read paths the panel's tabs need)
is the P0 gap.

## 4. Rungs

A rung that cannot meet its exit stops the ladder (PRD build-ladder discipline, §1 hard lines);
the stop is a result, never widened to force a green.

### P0 — one source

Lift the interview/author/person-path-run logic out of `scripts/run-interview.mjs`,
`scripts/run-author.mjs`, and `scripts/run-u.mjs` into `src/` library functions, each callable
in-process with an injectable `deps` object (the same test seam `src/cli.js`'s `main(argv,
deps)` already uses — `deps.provider` etc. skip the real-key check for tests). Give each flow a
real `bareloop <command>` in `src/cli.js` — **signed, hamr: "cli names are fine"**:
- `bareloop interview` — wraps the library form of `run-interview`'s flow.
- `bareloop author` — wraps the library form of `run-author`'s flow.
- `bareloop run-u` — wraps the person-path run flow, itself split into the three doors below.
- A read-side library function per spine/gate-audit consumer the panel's tabs need (History,
  Run, Audit, Job), so the panel never hand-rolls its own `JSON.parse` over `spine.jsonl`
  the way `src/cli.js:doRun`'s own tail-read currently does either — this rung also gives that
  inline read a named library function.
- `bareloop replay` — wraps `src/replayio.js`'s read side over `src/replay.js`'s
  `replayRun`/`formatReplay`. **Provenance note, added honestly:** unlike `interview`/`author`/
  `run-u` above, hamr never separately named `replay` verbatim in the scope interview — it
  was signed on **2026-09-24**, when a post-P0 debrief listed it (among 3 other items) as
  needing his confirmation, and he replied **"fix all"**. That is a blanket approval of the
  debrief's items, not a separate verbatim CLI-naming quote like the other three — recorded
  here plainly as what it was, not dressed up as an equivalent quote.

`scripts/*.mjs` reduce to thin adapters over the library, the same ~10-line shape
`bin/bareloop.mjs` already is over `src/cli.js` (parse argv, supply real deps, print, set
`process.exitCode`) — never re-implementing the flow itself.

**The person-path-run shape — hamr's ruling:** *"i think run-u one libary is better to
prevent drift"*, then *"agreed, one module three thin doors."* Settled shape:

- **One new module, `src/userrun.js`, holding one internal engine.**
- **Three thin named doors** onto that one engine, replacing `run-u.mjs`'s flag-driven entry:
  - `startRun(spec, opts)` — a fresh run (today's `--job` / `--spec`).
  - `resumeRun(runId, opts)` — a halted run (today's `--resume`).
  - `answerDoor(runId, decision)` — a finished run's review door (today's `--door`).
- All three build the same run context and hand off to one shared internal `execute()` — the
  engine is written once; the doors differ only in how they arrive at that shared context.
- **Replay is not a door.** `src/replay.js` already IS library (`replayRun`, `formatReplay` —
  both confirmed exported this session) and stays exactly where it is; it is not moved into
  `userrun.js` or folded into the three doors.
- **Why three doors, not one flag or three separate flows** (both rejected, one line each):
  a single function with a mode flag just relocates the 1992-line monolith as a giant internal
  `if` tree inside one function, buying nothing; three fully independent flows are the exact
  drift hamr is preventing — they fork on resume/spend/branch handling exactly the way
  `run-u.mjs`'s single file has drifted internally already.
- **The three doors are already mutually exclusive in `run-u.mjs` today** — verified this
  session, `scripts/run-u.mjs:542`: `die('--door answers the review door of a run that
  FINISHED; --resume continues one that HALTED. Those are two ' …)`. That refusal is the
  real shape already enforced by the current script; three named doors make it structural
  instead of a runtime flag check.
- **The semantics are already library today — this rung lifts ORCHESTRATION, not semantics.**
  Verified this session, all exported: `runJob` (`src/run.js:245`), `answerReviewDoor`
  (`src/reviewdoor.js:108`), `readResume` (`src/reuse.js:817`), `replayRun`/`formatReplay`
  (`src/replay.js:362`/`:886`). `src/userrun.js`'s job is calling these in the right order with
  the right context per door, the way `scripts/run-u.mjs` does today by hand across 1992 lines
  — not reimplementing what `runJob`/`answerReviewDoor`/`readResume` already do.
- `scripts/run-u.mjs` reduces to a thin adapter over `src/userrun.js`'s three doors, the same
  `bin/bareloop.mjs` shape used everywhere else in this rung.

Also folds in the standing cleanup this session verified live: `scripts/run-author.mjs` has
**6 real `process.exit()` calls** (lines 96, 288, 326, 412, 419, 956 — re-counted this session;
the 2026-09-15 stash's "12" figure had drifted, three of the grep's earlier hits were comment
lines, not calls) and **7 `emit('author-end', …)` sites** (lines 558, 720, 859, 916, 1077,
1096, 1131), all needing one ending-owner once the flow moves into `src/` — a single library
function shouldn't have nine different exit paths written by hand at different points in a
1182-line script.

**Exit:** every panel-needed flow (interview, author, person-path run, replay, spine read,
gate-audit read) is a library function in `src/` with a `bareloop` CLI command over it; full
suite green; the old `scripts/*.mjs` entry points still work, now calling through the new
library seam instead of holding the logic themselves.

**Delivered (P0 COMPLETE, this branch, 8 commits):** `src/interviewrun.js`,
`src/authorrun.js`, `src/userrun.js` (one engine, three doors: `startRun`/`resumeRun`/
`answerDoor`), and `src/replayio.js` hold the lifted logic; `bareloop interview`/`author`/
`run-u`/`replay` are wired in `src/cli.js`; `scripts/run-interview.mjs`, `scripts/
run-author.mjs`, and `scripts/run-u.mjs` are now thin ~20-line adapters (down from 764/1182/
1992 lines respectively); spine and gate-audit reads go through `src/replayio.js`'s
`parseJsonl`/`readHistoryLog`/`replayOne` rather than a per-caller hand-rolled parse — including
`doRun`'s own job-end tail read, retargeted onto `parseJsonl` the same session (see §3's read-side
row). The run-author ending-owner consolidation (§4's "also folds in" note above) is delivered
too: `src/authorrun.js` has zero real `process.exit()` calls left (verified by grep) — every
ending now throws one `ExitSignal(n)`, caught once at the bottom of `main`; the 7 `author-end`
emit sites are unchanged in place (a behaviour-preserving lift, not a re-architecture of WHEN each
fires). §3's gap table above was re-verified against this delivered state on 2026-09-24. See §7
for what P0 did NOT close (the step-title wrap fixture, F192 — both explicitly out of P0's scope).

### P1 — read-only panel

A `node:http` server (`node:http` only — no new dependency; the one-production-dependency bar
from `LIBRARY_CONVENTIONS.md` already spends its one slot on `bare-agent`), default port
**4700**, bound to `127.0.0.1` only. Serves the mockup's History, Run, Audit, and Job tabs from
REAL archived spine records (via the P0 read functions) — no fabricated/sample data. Nothing on
this rung can spend a cent: no interview, no author, no run trigger, no key ever read.

**Port 4700, checked this session:** `/etc/services` on this machine lists `4700` as
`netxms-agent` (NetXMS monitoring agent, TCP+UDP) — not one of the commonly-collided dev ports
(3000, 5000, 5173, 8000, 8080, 8888, 9000 are all in heavier everyday use); `ss -ltn` showed no
live listener on 4700 on this machine at check time. Reasonable default; not guaranteed
collision-free on every machine, so the server should still fail loudly (not silently pick
another port) if 4700 is taken.

**Exit:** a real past run renders end to end in the panel, matching the mockup's exact wording
and glyphs (`design/panel-mockup.html` — see §6 below for what "matching" means).

**Rulings 2026-09-24 (this session, before the HTTP server itself):**

- **Option B: "one home" for runs, not a move.** hamr: *"B, i need one home for them
  anyways."* A run LIST at `~/.config/bareloop/runs.jsonl` (the same directory the keys file
  lives in, PRD §7d) — one row per run, `{ at, runid, job, spine, patient, via }`. Patient
  copies are NEVER moved (they stay at `bareloop-patients/…` for run-u, or
  `<bundleDir>/runs/<runid>/` for `bareloop run`); the list only points at them.
- **Jobs stay in `jobs/` for now.** hamr picked "A" — moving job specs into the home directory
  too is deferred to P3, not built here.
- **hamr's "OK"** ("commit, and p1") signed this sub-spec.

**Delivered against that spec (this session):** `src/runlist.js` — `appendRun`/`readRunList`
(idempotent by runid), `backfillRuns` (scans a directory and its immediate subdirectories for
both the free-standing spine layout and the bundle layout
`<x>/runs/<runid>/spine.jsonl`, reusing `src/replayio.js`'s `parseJsonl`/`isSidecarByName`/
`looksLikeSpine`, never a second parser), and `formatRunRow` (`file missing` when a listed
spine no longer exists on disk). Wired to append one row at run START, BEFORE the first paid
call, in exactly two callers: `src/userrun.js` (`run-u`) and `src/cli.js`'s `doRun`
(`bareloop run`, bundle path; corrected 2026-09-30: `doRun` is gone, so the bundle path now appends through the `src/userrun.js` engine that `bundleMain` in `src/bundlerun.js` drives — one caller, not two) — interview/author sessions are NOT added (deferred to P3, no
run to list yet at that stage). A list-append failure is caught at both call sites and printed
loudly to stderr; the run itself continues (hamr's rule: a panel list must never block real
work). New CLI surface: `bareloop runs` (print the list) and `bareloop runs backfill <dir>`
(reconstruct rows from spines already archived on disk, idempotent). No new production
dependency, no new env var (grepped for an existing HOME-override convention first — none
exists; `home` is an injectable test-seam param instead, the same shape `deps.provider` already
is elsewhere).

### P2 — live run view

2-second polling (hamr: *"2s sounds good, no rush in publish progress, 2s sounds enough if map
will update, and panel is well connected"* — not SSE). The step map, step cards, counters line,
and the always-visible summary box update on each poll while a run is live.

**Exit:** a real live run is watched start to finish in the panel.

### P3 — chat / authoring

Left pane: review round message, job card, chat thread, `[Send] [Sign & run] [Revise]` (per
the settled job-card field order and button set, §6). This is where P0's `bareloop interview`
and `bareloop author` commands get an HTTP face — the chat turns hamr's replies into the same
library calls the CLI's interactive flow already makes; it adds no authoring logic that isn't
already in `src/`.

**Exit:** a job is authored and signed from the page alone, end to end.

### P4 — Settings

Providers table (name, API shape, base URL, key variable, test, tokens used, balance, price,
edit/remove) and Money & Limits tab (total spent, this month, monthly $ limit, monthly time
limit, per-provider breakdown), per the 2026-09-22 stash's Settings decisions.

**Exit:** per the 2026-09-22 stash's Settings decisions (Ollama re-admitted with an estimated
price shown, never $0; keys file wired per §5 below).

## 5. The arbiter's hard lines inside the panel

Not negotiable, and not re-litigated by any panel code:

- **The chat can never press Sign & run, accept, or raise a cap.** Only hamr's own click signs
  — the mockup's own note says it (*"Only your click signs. The chat can't."*). The panel's
  HTTP server must REFUSE a sign/accept/cap-raise request that did not originate from a human
  click in the page (no chat-driven, no scripted, no replay-triggered signature).
- **Merge stays human.** Nothing in the panel merges; `bareloop run`'s own tail already prints
  `merge stays human — this CLI never merges`, and the panel adds no path around that.
- **Keys never appear in the page.** The panel shows provider names and found/not-set only,
  read server-side from `~/.config/bareloop/.env` (chmod 600 warning shown in Settings) — see
  §7d of the PRD addendum for the full shape.
- **The panel is a client of the arbiter, never a second arbiter.** Every budget check, verdict,
  and signature still happens inside the library (`checkEnvelope`, `checkApproval`, `bless`,
  etc.) exactly as it does for the CLI today; the panel calls those functions, it does not
  reimplement or bypass any of them.

## 6. Settled UI rulings carried in

`design/panel-mockup.html` is the visual contract — read it rather than this section
restating pixels. The rulings that constrain the real build (not just the mockup):

- **Wording ruling:** check type shown as `Check type` with value `deterministic` (internal
  hard green) or `rubric` (internal soft green); a run's result is shown ONLY as a glyph —
  `[✓]` passed, `[✗]` failed, `[▶]` running, `[·]` waiting, `[?]` died (no result) — never the
  words green/red/soft-green anywhere in the page. (Saved to auto-memory `ui-verdict-words.md`.)
  2026-09-25, hamr: B — died is not failed; a run with no verdict never shares the failed
  glyph. `[?]` is a run whose spine carries no `job-end` at all (killed, crashed, or the
  machine slept) — distinct from `[✗]`, which stays reserved for a run whose close/arbiter
  actually rendered a "no" (a real result).
- **Run ID format and placement:** `workflow-name (mu2p83go)` — bracketed after the workflow
  name — shown on the run's summary line 1 and in every History row. (Closes the open question
  from the 2026-09-22 stash.)
- **Tagline:** `bareloop · automate a job, verified · @127.0.0.1:4700` — "verified" is fixed
  title text (bareloop's own close decides done), never changes per workflow.
- **Job card field order:** Check type, Model, Job name (unique), Goal, Source, Destination,
  Success, Guardrails, Judge examples (rubric only), then `$ cap | Time cap | Token price` in
  one row.
- **Row shape:** Workflows and History rows are 3 lines — glyph+name / `deterministic · $0.66 ·
  4m 02s · 2026-09-20` / buttons. Left pane 420px.
- **The one step-map renderer:** a single SVG map for every run — snake wrap (row 1 L→R, arrow
  down, row 2 R→L, …), stretched to fill the pane's full width (`boxW = (usableW -
  (perRow-1)*gap) / perRow`), one font size, never squeezed text to fit. There is no second,
  simplified map renderer anywhere in the panel.
- **Three right-pane tabs, verified in the mockup:** `Run` (`#tab-run`), `Audit / logs`
  (`#tab-audit`), `Job` (`#tab-details`, labelled "Job"). Three left-pane tabs: `Chat`,
  `Workflows`, `History`. (superseded — see Addendum 2026-09-26)

## 7. Known gaps the real build must close

From both mockup-feedback stashes, carried forward, not fixed by the mockup itself:

- The mockup's port (4700) is a hardcoded fake in the HTML/JS; the real build wires the actual
  server port (P1).
- The `>1`-line step-title wrap path is UNPROVEN — no fixture title in the mockup is long
  enough to force a second line. Needs a real long-title fixture before P1 is called done.
- F192 (soft-green calibration refused on every live run so far, `docs/logs/FINDINGS.md`) is
  still OPEN — the panel shows this honestly (no papering over a refused calibration), it does
  not fix it. Reopens after the panel per hamr's ruling B (2026-09-21).
- `scripts/run-author.mjs`'s ending-owner cleanup (6 `process.exit()` calls, 7 `author-end`
  writes — re-verified this session, see P0) folds naturally into P0's move into `src/`.
- Phone/LAN access is parked — `127.0.0.1` only; a phone cannot reach it (noted, not built).

## 8. Not in scope

- M3b–M7 (language guards, non-code checks, the judge, web search, the proof fires) — come
  after the panel, per the 2026-09-21 order amendment (PRD.md, item 33's build-order section).
- LAN access.
- Anything that changes a budget, a verdict, or merge behaviour — those stay arbiter territory,
  outside what any panel rung may touch (§5 above).

## Addendum 2026-09-26 — P1 panel redesign (hamr's live-review rulings)

This is a dated addendum, not a rewrite — §6's "Three left-pane tabs: Chat, Workflows,
History" and its Row-shape ruling are prose from the ORIGINAL mockup contract and are left
untouched above; the following ships instead, decided during P1's live click-to-annotate
review rounds:

- **Workflows and History merged into one `Runs` tab**, with a toggle between "Workflows"
  view (grouped by job, default) and "History" view (flat, newest-first) — never two separate
  left-pane tabs. `/api/workflows` and its client-side `listWorkflows` were deleted; both views
  are now built from the one `/api/runs` list.
- **Run tab: map + two-line part cards.** A PLAN-shape run renders one card per PART (scout,
  plan, each step, each replan, the post-step fix loop, the judge stage where recorded) — never
  one card per step only. An old-shape (iterations, no step-start) run collapses to a single
  "run" box, same as before. Clicking a part's map box OR its card jumps to the Audit tab,
  pre-filtered/scrolled to that part.
- **Audit tab: Grouped + Flat toggle.** "Grouped" (the default) nests rows as part → attempt →
  a rounds table (lazy-fetched per attempt via `/api/runs/:runid/rounds`); "Flat" is the old
  single ungrouped row list. Three filter chips — All / Writes / Blocked — auto-open every
  matching group so a filtered result is never hidden behind a collapsed toggle.
- **Short paths** (`pathShort`, relative to the run's own resolved tree root) apply only to
  runs recorded under this new layout; an older archived run with no resolvable tree root keeps
  showing the absolute path, honestly, rather than a guessed shortening.
- **Run Summary box** gained a `model` line (provider in parens when recorded, e.g. `deepseek-
  flash (openai-api)`) and a `judge:` line when a judge-round was recorded on the spine.
- **"offered" line** (Job tab) shows the FULL granted-tools list from the spec, never a
  top-N-truncated version.

Build item (2026-09-26, this branch, `feat/panel-p1`) additionally fixed two panel-only bugs
found during this same review pass: the Audit tab's "Raw log" leaking an EARLIER unrelated
run's rows when a gate-audit sidecar is shared across runs (now windowed to this run's own
ts range, same rule as the parsed `rows`), and a `~2`-backfill-collision run's header/lookups
echoing the wrong (unsuffixed) runid.

**Workflows view — job-row semantics (four hamr live-review rounds, 2026-09-26, this
branch).** A job's parent row IS its "represented run" — the run a search/filter match or the
current selection points at, defaulting to the job's own latest run when nothing narrower is
active. Clicking the parent row opens that represented run (not always the latest) and the row
shows "selected" whenever the represented run is the one currently open. The inline expand
list never repeats the represented run — it lists only the job's OTHER runs, newest first —
and the expand caret itself only appears when at least one such other run also passes the
active filters/search; a job with a single run, or whose only match is its represented run,
never shows a caret. A manual collapse click still wins over auto-expand-for-selection on the
next render.

## Addendum 2026-09-27 — P2 rulings

Signed this session (hamr), constraining P2's build:

- **2-second polling**, confirmed again — not SSE.
- **Q1 = A:** the left Runs list ALSO refreshes every 2s (new runs appear, glyphs flip
  `▶`→`✓`/`✗`/`?`), not just the open run.
- **Q2 = A:** the Audit tab does NOT live-refresh on the poll; it re-fetches only when the
  person opens/switches to it.
- The Run tab's map, part cards, counters line (`#run-counters`), and summary box refresh
  every 2s while the open run is `▶`; polling for that run STOPS once it is no longer live
  (a died `?` or a real `✓`/`✗` verdict).
- The running box on the step map gets the mockup's pulsing amber dot
  (`design/panel-mockup.html` ~line 1648: a `<circle fill="#b8860b">` with an `<animate
  attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite">`), copied
  verbatim into the one shared `buildStepMapSVG` — never a second map renderer.
- The finish line (a real paid run watched start to end in the panel) is NOT delegated to the
  builder — hamr authorizes that separately. The build instead ships a $0 replay instrument
  (`scripts/replay-live.mjs`) that reconstructs a live-looking run from an already-archived
  spine, for both the visual proof and future dev use.
- **2026-09-27, ruling B (F195 mitigation):** "refresh less often, up to 30s at most, choose
  the lesser when possible" — Q1=A's every-2s list refresh is superseded for the list only:
  the Runs list now polls every **10s** (`RUNS_LIST_POLL_MS`); the open run's own detail stays
  every 2s. One immediate list refresh still fires the moment the open run stops being live.

## Addendum 2026-09-27 — P3 rulings and build spec

Signed this session (hamr, "yes, go"), constraining P3's build (branch `feat/panel-p3`).
Rulings: **Q1 = A** (a job card form + chat review, not chat-only); **Q2 = A** (a required
Drafting $ cap field every time, no default); **Q3 = A** (a signed run fires as its own
detached background process); **Q4 = A** (new jobs only this rung — the edit workflow and
re-sign are deferred).

### Flow on the page (Chat tab)

1. The Chat tab always shows an empty job card (the old **+ New** is removed, 2026-10-05) (field order: Check type, Model, Job name, Goal, Source,
   Destination, Success, Guardrails, Judge examples (rubric only), plus a required **Drafting
   $ cap** field with no default — the Start button stays disabled until it is a positive
   number).
2. **Start drafting** runs the interview's $0 half server-side — `prepareSource`,
   `proveDestination`, `validateJob` on the assembled draft — the same library calls
   `bareloop interview` makes. Any refusal shows in the chat at $0.
3. The server runs the author pipeline (`authorCloseForJob` → `assembleSpec` → `validateJob`
   → `prepareSigning`) IN the panel process, under the drafting cap, with an HTTP-backed
   `ask()` — the same seam `runConfirmTurn` already takes. The model's plan and its own
   questions render as chat messages; the person answers with **Send**. Progress/cost stream
   via the existing `onPhase`/`onCall` hooks into the chat. Closing the panel mid-draft
   abandons the session; spend already made is recorded on disk, never lost.
   > 2026-09-28: the separate drafting cap was removed — one Cap $ covers drafting + run, see PRD one-cap addendum / 8d1102c
4. **Revise (N left)** is the confirm turn's `fix` pick — the chat text box's current
   contents become the correction. Max 2 rounds (D3); the counter is derived from the
   confirm-turn round number the library reports through `onPhase`, never a second hardcoded
   cap.
5. **Sign & run**, click 1, is the confirm turn's `confirm` pick — gates 1–3 ($0) and gate 4
   (calibration, paid, rubric-only) then run, and the card shows "SIGNING PREPARED" with the
   spec hash. Click 2, labelled `Sign <hash8> & run`, is the only route that actually signs.

### Server (`src/panel/server.js` + new `src/panel/authorsession.js`)

- New POST routes; every existing route stays GET-only. One authoring session live at a
  time — a second Start is refused while one is in progress.
- **Human-click guard:** a random token minted per server start, templated into
  `index.html` (like the port); every POST must carry it in an `x-bareloop-token` header AND
  pass an Origin/Host check against `127.0.0.1:<port>`. The sign route additionally requires
  the exact `specHash` from the session's own prepared `signing.json` — a mismatch refuses.
  No route reachable from chat/send/revise can sign; the model's own output never flows into
  a code path that signs.
- **Run start (Q3=A):** the sign route spawns `bareloop run-u --spec <resolved-spec.json>
  --approve <hash>` detached (`setsid` + `systemd-inhibit`, its own log file, the panel's own
  env — keys are never read into or sent to the page) through an injectable spawn seam, and
  returns the runid so the page can jump to the Runs tab, where P2's live view already polls it.
- **Keys:** read from the panel process's own env, same as the CLI (the `~/.config/
  bareloop/.env` file loader is still P4). A missing key refuses at $0, before any spend,
  naming only the env var (never the value).
- The panel stays a client of the arbiter: `validateJob`, `jobSpecHash`, `checkApproval`,
  `prepareSigning`'s gates all live in the library, called, never reimplemented.

### Glyph colour + hash display (additions, "yes, go")

- `[✓]` renders in the page's existing green token, `[✗]` in its existing red token — on the
  Run tab's part cards and the chat job card, both themes; `[▶]`/`[?]`/`[·]` are unchanged
  (colour only, never the words green/red/soft-green, per the standing wording ruling).
- After click 1 the spec hash shows on the job card as selectable, copyable text (the full
  hash, plus its 8-char form on the click-2 button); after the run it shows on the Job tab
  too. The person never copies it to sign — click 2 carries it and the server re-checks it
  against `signing.json`.

### Tests

Sign refused with no token / wrong Origin / wrong hash / before gates passed; no path from
chat/send/revise to signing; drafting refused on an empty/zero/non-numeric drafting cap or a
missing key; a fake `generate` driving draft → revise → prepared → sign → a stubbed spawn
seam asserting the exact argv including `--approve <hash>`; the Chat tab's layout at 390px.
> 2026-09-28: the separate drafting cap was removed — one Cap $ covers drafting + run, see PRD one-cap addendum / 8d1102c

### Exit

A job authored and signed from the page alone, end to end. The one real paid run (drafting
~$1 plus the run's own cap) fires only on hamr's own word — the builder does not fire it.

### Not in P3

The edit workflow and re-sign, the keys-file loader (P4), Settings (P4), LAN.

## Addendum 2026-09-28 — one cap covers drafting + run

hamr's ruling (arbiter territory, signed by his word: "clean separation, agreed … keep it
clean, simple"). **Supersedes P3 Q2's ruling A above** (a separate required Drafting $ cap
field, no default) — that field is gone. The prose above stays as written; this addendum is
the current rule.

- The job card carries **ONE** money cap, `Cap $` (the signed `budgetUsd`). Drafting
  (the authoring pipeline) now runs under ceiling = `Cap $`, the same field the run itself
  uses — no second, separately-required number.
- At sign, the run's own enforced ceiling becomes `Cap $ − drafting spent`. The signed
  number stays `Cap $` (unchanged spec, same hash) — drafting spend never widens or edits
  it. A later run of the same signed job that never drafted (or drafted $0) gets the full
  `Cap $`, unchanged from before this addendum.
- Unpriced/incomplete drafting spend is never treated as $0 (F6's rule, in this addendum's
  coat): the known floor is what folds into the ceiling arithmetic and what displays.
- **The one place the ceiling arithmetic lives:** `src/run.js`'s `runJob`, the `remainingUsd`
  passed into `runPlan` — `Math.min(shellCapUsd, job.budgetUsd - draftFoldUsd - spentUsd)`.
  Every caller (CLI, panel) only ever supplies the one number (`draftSpentUsd`); nothing
  re-derives the subtraction anywhere else.
- **Clean separation, on the record:** the drafting fold rides on `job-start` as its own
  field, `draftSpentUsd` — deliberately never `priorSpentUsd` (that key means "a previous
  attempt of THIS run died and folded its spend forward," read by `src/replay.js`'s
  `resumed` flag off the key's bare presence). A drafted-then-signed first run of a job
  must never read as a resume. `spentUsd`/`engagementSpentUsd` stay run-only; the drafting
  share is reported BESIDE them, never inside them.
- **Display**, one format everywhere a run's money shows (Run tab summary + counters, Runs
  list row, Audit tab header, Job tab, chat after sign): `$3.71 ($0.81 drafting) of $5.00`
  — total first, drafting share in brackets, `of $<cap>` where the surface already had one.
  Where a surface has no "of $cap" part, the bracket alone: `$3.71 ($0.81 drafting)`. A run
  with no drafting share is unchanged — exactly the string it always printed. The one shared
  formatter is `src/replay.js`'s `moneyWithDraft`.
- **CLI:** `run-u` gains `--draft-spent-usd <n>` (validated: finite, ≥ 0, else refused — the
  same param-guard class `--read-shim`/`--scout` already are; a garbage value is never
  coerced, since reading it as 0 would silently widen the ceiling). `bareloop author` prints
  its own known drafting spend floor and the exact `run-u` command including the flag — the
  same "nothing here is left for a person to hand-compute or re-type" rule F185 set for
  `--spec`. Every printed resume/decide/door re-invocation carries the flag too (mirroring
  `--read-shim`/`--scout`'s own tails), or a resumed leg would silently widen its ceiling
  back up by dropping the fold.
- **Panel:** the Drafting $ cap field is removed from the job card; `Start drafting` gates on
  `Cap $` alone. The session tracks its own known drafting spend floor (off the same metered
  list the chat's cost readout already used) and the sign route passes it to `run-u` as
  `--draft-spent-usd`, omitted (never a decorative 0) when the session spent nothing
  drafting.

### Open items from this addendum's build

- The Job tab's `$ cap` field shows only the signed cap (unchanged) — it has no run-scoped
  spend readout to attach a drafting bracket to; a job-level (not run-level) drafting display
  was not invented for it.
- `draftSpentUsd` is passed to `runJob` as a single already-resolved floor number; there is
  no separate `draftSpendComplete` flag threaded end-to-end through the CLI (a single
  `--draft-spent-usd <n>` flag, per this ruling, carries only the number). The floor itself
  is still honest (never $0 on an unpriced drafting call) — what is not wired is the "at
  least $X" wording distinguishing an exact vs. floor drafting figure specifically in the
  run's own display; a run's OWN spend keeps that distinction via its existing
  `spendComplete` field.

## Addendum 2026-09-29 — P4a Settings (hamr's rulings)


Branch: `chore/fix-ledger` (hamr: "keep it, we will add to it"). Builders: sonnet, pinned.
Source of the shape: PANEL-BUILD.md §P4 + 2026-09-22 stash Settings decisions + the
2026-09-29 rulings below. Mockup: `design/panel-mockup.html?settings=1`.

### Rulings carried in (2026-09-29, hamr's words)

- R1 **Monthly time limit: DROPPED.** "drop time keep money". Only a monthly $ limit.
  (Supersedes the 2026-09-22 Money & Limits line's "monthly time limit".)
- R2 **Monthly $ limit refuses, never warns.** A run whose $ cap is more than what is left
  this month does not start. Nothing spent.
- R3 **The note sits under the cap field, where the person types the cap** (not at the top),
  plain text, no button:
  `Max $3.50 (monthly limit)`
- R4 The person fixes it themselves: lower the cap, or raise the monthly limit in Settings.
  The page never raises anything for them; the chat can never touch the limit.
- R5 **One settings file, keys apart.** "yes" (hamr, 2026-09-29). ALL settings live in
  `~/.config/bareloop/config.json` (providers + the key NAME each uses, monthly limit,
  Anthropic balance note). Key VALUES live only in `~/.config/bareloop/.env`, which the page
  never reads or writes (CLAUDE.md hard line: secrets load from the environment, never
  configs). config.json never holds a value that looks like a key — the save path refuses
  one (reuse the one secret-shape inventory).
- R6 **Split** "yes, split" (hamr, 2026-09-29): this build is P4a; add/edit/remove providers +
  Ollama is P4b, its own spec later.

### What exists today (grounded, 2026-09-29 @ 1817eee)

- Keys: panel reads `process.env` only (`src/panel/authorroutes.js:74`,
  `src/panel/authorsession.js:166`). No `~/.config/bareloop/.env` loader exists yet.
- Providers: `PROVIDER_TABLE` in `src/providers.js:154` = anthropic-api / openai-api /
  gemini-api, each with `envKey`. `job.js:162 PROVIDERS` menu adds clipipe-subscription.
  Panel model menu `src/panel/authorsession.js:60` (deepseek-flash = openai-api + baseUrl).
- Test button engine exists: `checkProviderReachable` (`src/providers.js:369`), a $0
  models-list call.
- Run list: `~/.config/bareloop/runs.jsonl` rows carry `{at, runid, job, spine, patient, via}`
  — no money. Spend lives in each spine's `job-end` (`spentUsd`, `spendComplete`); a died
  run has only a spend floor (`src/panel/server.js:251`).
- Cap input: `#jf-cap-money` in `src/panel/index.html:474`; one cap covers drafting + run
  (2026-09-28 addendum).

### Build, in order (each item works alone, own commit, own tests)

#### 1. Keys file loader (library, `src/keysfile.js`)
- Reads `~/.config/bareloop/.env` (home injectable for tests). Plain `NAME=value` lines,
  `#` comments; no dependency.
- **Shell env wins** over the file (an explicit `export` beats the file); the file fills
  names the shell doesn't set.
- File mode not 600 → a warning line (shown in Settings and on CLI start), not a refusal.
- Values go ONLY to provider construction. Never to the page, the spine, runs.jsonl, logs.
  The page gets names + `found` / `not set` only.
- Callers: panel server start (merged env passed as `opts.env`, the seam that already
  exists) AND the CLI (`bareloop run-u`, `run`, `author`) — one loader, both doors.

#### 2. Monthly spend + limit (library, `src/monthly.js`)
- `src/config.js`: the ONE reader/writer of `~/.config/bareloop/config.json` (home injectable).
  Shape: `{ "monthlyLimitUsd": <number>|absent, "anthropicBalanceNote": <number>|absent,
  "providers": { "<name>": { "key": "<ENV NAME>" } } }`. Missing file = defaults. Written
  atomically (tmp + rename), mode 600. Unknown fields kept, never dropped.
  `monthlyLimitUsd` absent = no limit, no check.
- `monthSpend({home, now})` = sum over runs.jsonl rows whose `at` is in the current
  **local** calendar month: the spine's `job-end.spentUsd` (plus drafting spend where folded);
  a died row counts its spend floor. Any row with incomplete/unknown spend makes the total
  an **"at least"** figure, shown as such (never rounded down to a clean number).
- `checkMonthlyRoom({capUsd, home, now})` → `{ ok, leftUsd, limitUsd, atLeast }`.
- Called at the ONE run-start seam both doors pass through, before any token spends. Refusal
  text is the same everywhere: `Max $3.50 (monthly limit)`. CLI prints it and exits $0-spent.
- Panel: the cap field re-checks as the person types (read-only call) and shows the R3 note
  under the field; Sign & run stays refused server-side regardless of what the page shows
  (the page is never the arbiter).

#### 3. Settings page — Money & Limits tab
- Total spent (all time), this month (with "at least" when incomplete), monthly $ limit
  input + Save on one row, per-provider breakdown (provider from each spine's `job-start`).
- Save writes config.json **only from a human click** (same per-start token guard as
  Sign & run); the chat route can never reach it. Tighten or loosen both allowed — it's the
  person's own limit, set by hand.

#### 4. Settings page — Providers tab (read + test)
- One row per provider the panel can use today: Anthropic, OpenAI, Gemini, DeepSeek
  (openai-api + baseUrl). Columns: name, API shape, base URL, key variable, test, tokens used,
  balance, price.
- Key variable = dropdown of NAMES read from the keys file (file names only, never the shell
  env); default is the provider's built-in `envKey`. Choice saved to config.json
  `providers.<name>.key` (human click only) and used by both doors when resolving the key.
  Status: `found` / `not set`.
- Test = `checkProviderReachable` ($0).
- Tokens used = summed from spines per provider.
- Balance: DeepSeek fetched server-side from the provider; Anthropic typed by hand (stored in
  config.json as a note, never used by any check).
- Price: the rate bareloop charges against; a guessed rate shows **estimated**.

### Split (R6)

**P4b (later, own spec): add / edit / remove providers + Ollama.** Reason: adding a provider
widens `job.js PROVIDERS` and `PROVIDER_TABLE` (Ollama reads `url`, has no key, and its price
must show estimated, never $0). That is arbiter-adjacent menu work, bigger than a page.
P4a = items 1–4 above, with edit/remove buttons absent (not greyed).

### Tests the builder must include
- Loader: shell-wins, file-fills, comments, bad mode → warning, value never in any output.
- Monthly: month boundary (local), died row floor, incomplete → atLeast, no limit → ok,
  cap == left → ok, cap > left → refused with the exact text, $0 spent on refusal (no
  provider call) — at both doors.
- Save refused without the human-click token.
- Each test must fail without its fix (cp-backup proof).

### Exit
- From the page alone: set a monthly limit, type a cap over it, see `Max $X (monthly limit)`
  under the cap, Sign & run refused with $0 spent; lower the cap, run starts.
- Same refusal from the CLI.
- Providers tab shows the four rows with found / not set and a working Test.
- Orchestrator's own screenshot at desktop + narrow width.

## Addendum 2026-09-29 (later) — what the built P4 changed against the spec above

The P4a spec above is kept as written; where the build followed hamr's later rulings, these
supersede it:

- **Providers tab is the keys file (P4b), not a fixed list.** One row per `~/.config/bareloop/.env`
  line that has a value (name, API shape, Base URL in `config.json` `keys.<ENV NAME>`); the
  "four rows", the key-variable dropdown, `providers.<name>.key` and the Price column are gone.
  A missing `.env` is created with five empty preset lines; an existing one is never edited;
  `LOCAL_API_KEY=null` means no key needed. Chat's Model menu is these rows. (Split R6's "P4b later"
  landed as this, without add/edit/remove buttons.)
- **The limit field auto-saves; there is no Save button.** Blank clears it. `POST /api/settings/money`
  without a `monthlyLimitUsd` key is a `400`, never a clear.
- **A run holds its full leg cap until it is done** (hamr 2026-09-30, "hold until done"): the run's row
  is appended first with its `pid` and `capUsd`, and only the claims above it count; a live claim is held
  at its cap in the refusal check only (the Money tab shows real spend); a claim whose process is gone is
  settled by the next run and counts its floor. Detail: `bareloop.context.md` "Monthly $ limit".
- Also built: POST body cap (1 MiB, `413`), the `jobsDir` seam server-side only, `replay-live --live-audit`.
- `bareloop run <bundle>` is a door to the same engine, so the monthly limit applies to it too (one
  run-start seam, no second one).

## Addendum 2026-10-02 — P5 — Ended, Resume, Start from this, Import (read only), Stop, run-card fixes (signed by hamr 2026-10-02)

Rulings: memory `ui-part-p5-rulings` + this session (1A reuse-by-record, 2 card saved, 3 Stop = "stopped" resumable, A track record from runs).

Build order = item order. One sonnet builder, sequential, one commit per item, fail-first test per item.

---

### 1. Ended block

**Screen.** Audit tab, first block, every run (green too):
```
ENDED   Money cap reached ($8.00 of $8.00).
NEXT    Raise the cap, then Resume.            [Resume]
```
Run card: one short line under the job name, e.g. `money cap — resume`.

**Owner.** One code-owned function `endedFor(summary, death)` in `src/panel/server.js` (fixed sentences, never model text — ui-verdict-words). Feeds BOTH `getRunDetail` (field `ended: {reason, next, actions:[...]}`) and `summarizeRow` (field `endedLine`). Today the card has only a glyph and the detail only a `stopReason` string.

**Table (outcome → reason / next / button):**

| outcome | reason | next | button |
|---|---|---|---|
| green, already-green | Goal met. | Nothing to do. | Start from this |
| green + destination-refused | Goal met, but the output could not be delivered (detail). | Fix the destination, then Start from this. | Start from this |
| cap-halt | Money cap reached ($X of $Y). | Raise the cap, then Resume. | Resume |
| wall-halt | Time cap reached. | Raise the time, then Resume. | Resume |
| provider-red | The model provider failed (detail). | Resume. | Resume |
| step-stalled | A step stopped making progress. | Resume, or Start from this and change the job. | Resume, Start from this |
| stopped (new, item 5) | You stopped it. | Resume. | Resume |
| plan-red, check-red, step-red, escalated | Goal not met — the checks said no (last gap). | Start from this and change the job. | Start from this |
| close-red | The check itself broke (instrument fault), not your goal. | Start from this; check the success rule. | Start from this |
| pricing-red, unapproved-spec, job-red, branch-red, interpreter-red, recipe-stale, close-unsupported, smoke-red, runner-drained | Stopped before or outside the work (outcome + detail). | Start from this. | Start from this |
| died (no job-end, runner gone) | Stopped with no ending recorded (last thing it did). | Resume, or Start from this. | Resume, Start from this |
| live | — (no Ended block while running) | | Stop |

Resume button shows only when the engine would accept it (same gates as item 2) — never a button that refuses on click by design.

---

### 2. Resume

**Screen.** Resume button (Ended block + action bar). Click opens a small confirm:
```
Resume run mup3h70u
  money cap  [ 8.00 ]   spent so far $8.00
  time cap   [ 60   ] min
                                  [Sign & resume]
```
Caps prefilled with the signed ones. Raising one changes the job hash → the click is the signature (human click only, like Sign & run). The engine already allows a resume under a re-signed hash (prints a NOTE, `src/userrun.js` ~1132); prior spend stays folded, so the ceiling never silently widens.

**Caller.** New `POST /api/runs/:runid/resume` in a new `src/panel/runroutes.js` (same `checkHumanGuard` as `/api/author/*`). Spec from `resolveSpecForRow` (server.js:1172). If caps changed: write `resolved-spec-r<k>.json` beside the original (never overwrite the signed one). Re-check monthly room. Spawn exactly like `signRun` (authorroutes.js:325) plus `--resume <runid> --approve <hash>`. A refusal from the engine shows its own text in the panel.

---

### 3. Start from this

**Screen.** Button on every run and every imported job. Opens the Chat tab's New job card, every box filled:
```
Start from: fix-types (run mup3h70u)
  Same job — 4 green · 1 not green · about $3.10 a run
  [card boxes, all editable]
                        [Sign & run]  (no drafting: same job)
```
Edit any box except Source → line turns to `Changed — new job, starts clean` and the button becomes the normal `Start drafting`.

**Rules (code-owned):**
- Only Source changed (or nothing) → SAME job: copy the origin's signed spec into the new session, skip drafting ($0 draft), same hash, Sign & run.
- Anything else changed (goal, success, guardrails, judge examples, model, caps, destination — destination is the write fence, so it is in the hash) → normal drafting, new hash.
- "Same job" track record: every listed run whose `job-start.specHash` equals this hash — greens, not-greens, average spend of finished runs. Read from the runs the panel already lists; no reuse store, no registry (ruling A). Plan handover stays parked.

**Card text saved from now on.** `src/panel/authorsession.js` writes `card.json` (the form text, verbatim) beside `resolved-spec.json` at sign-prepare. Prefill order: `card.json` → for older runs, fields recoverable from the spec (`getRunJob`, server.js:1545) with a note "filled from the signed job — success/guardrails/judge examples were not saved for this run" → for an imported bundle, its `spec.json`. "Changed" is judged against what was prefilled.

---

### 4. Import (read only)

**Screen.** Runs tab, Workflows view toolbar: `[Import]`. Opens:
```
Import a job folder
  path [ /home/hamr/jobs/fix-types.bareloop      ]  [Open]
  /home/hamr/jobs/
    ▸ fix-types.bareloop      (bundle)
    ▸ other-folder
                                       [Import]
```
Folder browser lists folders only (names, plus a "bundle" tag where `manifest.json` exists), starts at your home folder; paste box works too.

Imported row: `fix-types  imported · view only` (mockup's own tag). Right pane: goal, success checks, guardrails, caps, model, its exported history (greens/reds), approved-or-not on this machine. Only button: **Start from this**. No Run.

**Caller.** New `GET /api/fs/list?path=` and `POST /api/imports` in `src/panel/runroutes.js`, both behind `checkHumanGuard` (token + own address) — a folder listing is new disk exposure, so it gets the strict guard, not just the Host guard. `readBundle` (bundle.js:511) on import and again on every view (a changed folder shows `changed since import` red). Imported list: `~/.config/bareloop/imports.jsonl` `{at, dir, job, bundleHash}`.

---

### 5. Stop

**Screen.** Action bar while a run is live: `[Stop]`. After click: `stopping after this step…` until the run ends. Ended block then reads "You stopped it. → Resume."

**Engine.** Today there is no clean stop (no signal handler in the run engine; a kill leaves no job-end → shows died). New:
- Stop request = a file `<spine>.stop` written by `POST /api/runs/:runid/stop` (`checkHumanGuard`; refuses if the run is not live).
- The run checks for it at the SAME point it checks the money cap between rounds, emits `stop-requested`, then ends with job-end outcome **`stopped`**.
- `stopped` joins `CHECKPOINT_OUTCOMES` (`src/reuse.js:142`) → resumable; Resume continues at the next step exactly like after a cap-halt. **Arbiter-adjacent: hamr ruled it 2026-10-02.**
- Engine half is library code, so CLI gets it too (`bareloop run-u` / `bareloop run` runs honour the file); no new CLI command.

---

### 6. Run-card fixes

- **starting…** — `summarizeRow`/`getRunDetail` (server.js:285, :381): spine missing AND `runIsAlive(row)` → `starting:true`; card and right pane say `starting…`, not `file missing` / `unknown`.
- **Live money/time on the card** — `summarizeRow` uses the same `deriveDeath` floors the right pane uses (server.js:248, `floorsFromRecords`), so card and pane show the same numbers while live.

---

### Mockup diff (design/panel-mockup.html)

| Mockup control | This part |
|---|---|
| `#btn-rerun` Rerun | becomes **Start from this** |
| `#btn-pause` Pause | becomes **Stop** (clean stop, resumable) |
| `#wf-import` Import + `imported · view only` row | **built** (read only) |
| Resume | **added** (not in mockup) |
| Ended block | **added** (ruled 2026-09-30) |
| `#btn-accept` Accept (review door) | **not in this part** |
| `#btn-replay` / row "Replay $0" | **not in this part** |
| per-row Edit | covered by Start from this |
| per-row Export | stays CLI (`bareloop export`) |

### Proof

- Every item: a test that fails without it (fail-first), real seams, scratch home.
- Orchestrator screenshots of every new screen (desktop + phone width) before "done".
- One paid run at the end, **DeepSeek**, on hamr's word only: Stop mid-run → Resume → green; then Start from this (source only) → same job, no drafting. A $0 archive read first: the track-record numbers against archived runs.

### Docs

`PANEL-BUILD.md` dated P5 addendum; one PRD tick line; `bareloop.context.md` (new routes, `stopped` outcome, `card.json`, `imports.jsonl`); CHANGELOG at release.

---

## P5-R — one run, one id, one file (resume continues the SAME run; ruled by hamr 2026-10-02)

Comes before P5 phase 2. Supersedes items 2 (Resume) wording where it says a resume starts a new run.

Ruled by hamr 2026-10-02 (go given). Branch `feat/panel-import-run`. Comes BEFORE P5 phase 2.

hamr's words: "one run, one id, one file ... shows on map card, on audit, it's the same, never two."
"same run for stopped, cap/time halt, no new card, no new job, dotted line at map, clear audit mention resume."
Decisions: torn tail = 1A (keep the bytes, start on a fresh line; never edit the record). Time between legs = 2A (not counted; only working time charges the wall).

Grounding: the $0 reader inventory (2026-10-02) — 14 reader groups NEED CHANGE, precedent for append + startSeq in `scripts/run-reuse.mjs` (lines ~458-470, 549) and `makeSpine(file, {startSeq})` in `src/spine.js`.

### Step 1 — engine

1. **Writer.** `--resume <runid>` (run-u and `bareloop run <bundle> --resume`) keeps the SAME runid and appends to the SAME spine file (`u-<runid>.jsonl`, or `<bundleDir>/runs/<runid>/spine.jsonl`).
   - If the file does not end with `\n`, write one `\n` first (the torn bytes stay, isolated on their own line).
   - `startSeq` = max `seq` over parseable lines.
   - First record of the leg: `leg-resume {leg: N, after: <previous leg's outcome or "died">, at}` — emitted BEFORE the watchdog is spawned (the watchdog reads mtime; a cold file would be killed as stale).
   - Then the leg's own `job-start` (keeping today's declared fold fields — the budget ceiling still folds prior spend).
2. **One owner: `legsOf(events)`** (new, in the spine-reading layer, e.g. `src/legs.js`), returning ordered legs `{leg, start, end, records, outcome, after}`. Tolerates exactly one corrupt line immediately before a `leg-resume` marker (and the existing last-two-lines tail rule). Every reader below uses it — no reader re-derives legs on its own.
3. **Money:** run total = sum over legs of that leg's own rounds (`SPEND_RECORD_TYPES` / `ACCOUNTED_ROUND_TYPES` as today — echoes excluded). Exactly one basis per reader; never rounds + declared prior.
   **Time:** run wall = sum of each leg's own start→end (gap excluded).
   **Outcome:** the LAST leg's. A run is live iff its last leg has no `job-end` and its runner is alive.
4. **Readers to change (inventory list):** userrun resume reader + torn tolerance (~userrun.js:676-723, door reader ~807); `readResume` (reuse.js:817 — window at the last leg, use its declared fold; grade/decision window readers checked, reuse.js:570-715); userrun end-of-run readout (~1927-2080: this leg only, last leg's halts only, watchdog note per leg); `replayRun` (replay.js:425-620 — `resumed`, spend, wall, auditWindow, resumeSeed); panel `summarizeRow`/`getRunDetail`/`deriveDeath`/`resumePlanFor` (resume #2 offered under the LATEST signed caps)/audit window + sidecar (server.js); `monthly.js` `legSpend`/`legWall`/`readLegs`/`claimRun`/`settleDeadClaims`; `runlist.js` `appendRun`/`readRunList`/`runIsAlive`; `ledger.js` `floorsFromRecords` wall; `u-watchdog.mjs` ordering; `deathAtOf` (u-readout.js:337); `bundlerun.js` history row/`run.json` (one row per leg, `leg: N`, no self-`resumedFrom`).
5. **Run list:** ONE row per run. Each resume appends `{type:'leg-start', runid, leg, pid, capUsd, at}`. `readRunList` folds it: the row's live pid/cap = latest leg's. `settled`/`released` are per leg; a later leg's `released` never removes the run. The monthly hold is taken per leg.
6. **Side files:** gate audit — leg 2+ appends to the run's existing `u-<runid>-gate-audit.jsonl` (never rename-overwrite). Watchdog note — per leg (`<spine>.leg<N>.watchdog.json`, or a leg stamp that readers check). `.lag.jsonl` accumulates (fine).
7. **Refusals stay:** resume of a run whose last leg is live → refused (pid from the latest `leg-start`); of a green run → refused; of a non-resumable terminal → refused. Double-resume is gone by construction (one run, one latest leg).
8. **Old split runs** (already on disk) are not rewritten and keep reading as today.
9. **Start from this** is a NEW run by design (new job). The review-door `rerun` keeps minting a new runid (not covered by this ruling; named, unchanged).

### Step 2 — panel

1. **One card** per run: latest leg's glyph/status, total money/time, `resumed ×N` small tag.
2. **Audit:** legs in order with a divider line between them:
   `── stopped: money cap reached ($8.00) · resumed 2026-10-03 14:10 ──` (code-owned text; `after` = stopped / money cap / time cap / provider failed / step stalled / died).
3. **Map:** a dotted connector from the step where a leg ended to the step the next leg picked up.
4. **Resume UX (hamr 2026-10-02):** the Resume button (run card + Ended block) opens the run's own page on its **Job** tab. There, ONLY the money cap and the time cap are editable; every other job field is shown read-only. Button `[Sign & resume]` (human click = the signature when a cap changed). This replaces phase 1's small confirm form. Refusals from item 5 of phase 1 (cap ≤ spent, time ≤ used) stay.
5. Remove phase 1's "a resume is a new run" copy (index.html ~1944 "The new run is starting; it appears in the list").

### Proof

- Fail-first tests per step; real seams; a real killed child process mid-append for the torn-tail case; a two-leg spine fixture through every changed reader (money once, time without gap).
- `npm test` + typecheck + build:types green; orchestrator screenshots (card, Audit divider, dotted line, Job-tab resume).
- Live: one paid DeepSeek run on hamr's word only, after P5 phase 2 (Stop exists): start → Stop → Resume → green; hamr clicks through.

### Docs

PANEL-BUILD.md P5 addendum gets this as "P5-R"; PRD v1.87 gets one tick ("a resumed run is the same run: one id, one file"); `bareloop.context.md` (spine leg marker, `legsOf`, run-list `leg-start`, resume keeps the runid); FINDINGS entry: the split-run shape was inherited from the reuse-path resume, never ruled, found only by rendering it.

## Addendum 2026-10-03 — Reuse workflow replaces P5 item 3 "Start from this" (signed by hamr 2026-10-03)

Supersedes P5 item 3 above (its prose is left as written). hamr's click-through of "Start from this" showed it opening inside the Run tab and able to re-draft a changed job; the ruling is that a reuse is the SAME signed job on a new source, never a draft.

**Rulings.**
- The button is **Reuse workflow**, replacing "Start from this" everywhere on the page. It shows on **green runs only** (green, softgreen, green + destination refused) and on every **imported** job. Never on red, stopped, capped or died rows; a red row's Ended block says "Change the job: + New." Stopped/capped/died rows offer `[Resume]` only.
- The Run tab's action row: `[Stop]` if live · `[Resume]` if resumable · `[Reuse workflow]` if green. An imported job has the same row with `[Reuse workflow]`.
- Click opens the **Chat tab** (left), the New job card, filled from the signed job. **Only four boxes are editable: Source, Destination, $ cap, Time cap.** Every other box (check type, model, job name, goal, success, guardrails, judge examples) is shown greyed. No drafting, $0, `[Sign & run]`. To change any locked box: `+ New` (drafts). The server refuses a reuse start whose locked boxes differ from the origin's, by name.
- Destination is open on **both** folder and repo jobs (hamr, Q-A: b). An imported reuse is re-signed locally by hamr at `[Sign & run]` (Q-B: yes).
- The step plan is made fresh each run (no plan copying: parked, F55/F73/F88). Nothing about the job is rendered inside the Run tab; the job lives in the Job tab.

**Identity, two keys.** `jobSpecHash` is unchanged (it covers the caps and the write fence: what gets signed). New `workflowKey(spec)` (`src/job.js`) hashes the signed spec WITHOUT source, destination/writeScope, budgetUsd and maxWallMs. A reuse copies the origin's signed spec, sets those fields, and signs under a new `jobSpecHash` with the same `workflowKey`. `isSameJob` and the "Changed - new job" mode are removed (the locked boxes make it unreachable).

**Estimate line** above the card: `Same job — G green · N not green · about $X and M min a run`, from every listed run with the same `workflowKey` (finished runs for the averages; working time excludes resume gaps). Unknown is said, never `$0` or `0 min`. No registry (ruling A stands).

**Imported jobs.** Reuse re-reads the bundle at that moment: `readBundle` (the bundle hash covers every close script), `checkBundleDeps`, and each close stage's signed sha256 against the bytes on disk over the spec with `$BARELOOP_BUNDLE` resolved. The close scripts stay in the verified folder (the engine re-verifies them at run start and before every close run). A command close has no declaration for `prepareSigning` (it refuses one by design: signed as written), so that session's gate is the byte check and the person signs the spec's own hash. The imported job opens in the same Run / Audit / Job tabs (460cc39 kept); Audit says "no log — this job ran on another machine"; `[Reuse workflow]` is in the top action row.

**Not changed:** the session-in-the-Run-tab move (`aa4092d`) is reverted; the Stop, Resume and Ended rules of P5 items 1, 2, 5 stand except where the table above narrows which rows offer a button.

**2026-10-04 — an imported job's Run tab is a normal run page (hamr's click-through; mockup signed).** Top action row `[Reuse workflow]`, then an `IMPORTED` box (runs here, exported history with its recent runs, this machine, which run is shown, and the changed-folder line when changed), then the latest GREEN run in the bundle through the same SUMMARY and MAP code a run uses. Source, in order: `<bundle>/runs/<runid>/spine.jsonl` (newest that ended green; read through the ordinary `/api/runs/<importId>~<runid>` routes, so its Audit is a normal Audit and the tool log is the `gate-audit.jsonl` beside the spine) → else the bridge's newest green version (plan steps, cost, wall time, tools used, close stage names; every field the bridge lacks reads "not recorded", no per-step cards) → else "no green run in this bundle". Latest green only, no picker. Read only: bundle files are untrusted (bounded reads, run names checked, no link followed, a parse failure reads as "not recorded"), and nothing is written into the folder.

**2026-10-04 — click-through rulings A1–A4, B5, C6–C9 (signed by hamr's "go").** A1: a refused path in the Import browser clears the list and the "showing" line; only the error remains. A2: the path box uses the normal input background (reads as editable). A3: re-importing a folder updates its one `imports.jsonl` row (one row per real path; old duplicates list once, newest wins) and the job just imported is opened and scrolled into view. A4: the Import browser remembers its last folder in `localStorage` (per-viewer convenience, home as fallback). B5: `[Stop]`, `[Resume]` and `[Reuse workflow]` live only in the Run tab's top action row; the Audit tab's Ended/Next block is text only. C6: ONE code-owned sign → word table (`src/panel/status.js`): `[▶] running · [·] waiting · [✓] passed · [✗] failed · [✗] capped · [✗] stopped · [?] died`. C7: run cards read `[sign] job (runid)` / `**word** — reason` / facts; expanded per-run rows read `[sign] **word** — reason   runid · $ · date`. C8: the right-side header reads `[sign] job (runid) │ **word** — reason · ended <local date, time>` (live: `· started <time>`), in lowercase as written; an imported job wears the word of its shown green plus "imported · view only". C9: the MAP legend line is removed; each step card carries its own sign and the existing step-state word in bold.

**2026-10-04 — follow-up rulings (hamr, after C6-C9):** the SUMMARY headline reads `[sign] **word** · check type · $ · time` (same word as card and header, runs and imported jobs); the MAP gets back one small line-style key `⤾ dashed = retry · dotted = resumed` (no sign legend); the Audit tab's grouped step rows use the same sign + bold word as the Run tab step cards (one `stepStateHTML`); step cards render step names as written, lowercase.

**2026-10-04 — one progress list in the left Chat panel (hamr: "agreed on new progress, one place showing all").** Every pipeline step of every session (a new job drafting AND a reuse) is one line in ONE list that updates in place: `copying source ✓`, `checking source ✗ <reason>`; while running the line reads `checking source…` with animated dots (CSS; a static ellipsis under `prefers-reduced-motion`), then becomes ✓ or ✗ with the code-owned reason on the same line, and the next step appears below. One code-owned table (`STEP_LABELS` in `src/panel/authorsession.js`; library `onPhase` names map to a step id by `PHASE_STEP`): checking setup · copying source · checking source · waiting on install · reusing signed workflow · reading repo · scouting repo · listing files · confirming plan · drafting · calibrating · checking signing gates. A refusal fails exactly one step (a source-door scan/freeze refusal is `checking source` after a done `copying source`); the thread carries chat turns only (person and model text), never a pipeline line, so a refusal is shown once. A pending ask for the person replaces the running label with what is waited on, never an animation. No new tabs or views; the list wraps at phone width.

**2026-10-04 — Model is unlocked on Reuse (hamr): the Model box is the fifth open field** (a Name from Settings > Providers; provider and baseUrl come with the chosen row). The server refuses any other locked change as before. `workflowKey` now ALSO ignores `provider`, `baseUrl` and `model` (`WORKFLOW_KEY_IDENTITY_FIELDS`); `jobSpecHash` is unchanged and still covers them. The reuse spec sets provider/baseUrl/model from the chosen row the way normal authoring spells them (baseUrl when the row has one; model only when the Name is not the provider's default tier). RUBRIC (soft-green) jobs: the judge never changes with the worker — a spec with no explicit `judge` is pinned to the ORIGIN's resolved judge identity (`resolveJobJudge`) before the swap; an explicit judge is kept; deterministic jobs have none. The estimate line counts only runs with the same workflowKey AND the same worker (provider + baseUrl + model) as the card's current choice and recomputes when the Model box changes; no such run reads "no runs yet on this model". Imported reuse no longer forces the bundle's provider (the chosen row is used; no matching row is no longer a refusal, the card opens with no Name picked); close-byte re-verification is unchanged.

**2026-10-05 — live reuse click-through rulings (hamr, real panel).** (1) The progress list draws each step's detail on its OWN line under the step prefixed `> ` (a failed step keeps ✗ and its reason on that line); two new server-owned steps close the one list, `generating hash` (detail `spec hash <full hash>`, at sign-prepare) and `signed hash` (when the person's sign is accepted); the "SIGNING PREPARED" and "signed — … run starting detached" thread bubbles are no longer posted (the thread is chat turns only). (2) `Check again` moves into the `.actions-row` beside Sign & run (same show/hide rule). (3) Runs list order: runs/workflows first, imported jobs below. (4) Drafting spend shows as the "signed hash" detail (`drafting spent [at least ]$X (folds out of the run's own cap)`; nothing on a Reuse or $0 drafting). (5) MAP: the word "resumed" beside the dotted connector is removed (cramped; the legend "··· dotted = resumed" stays; the `resumed ×N` row tag stays). (6) The Reuse card origin line "Reuse: <job> (run <id>)" is bold and sits FIRST in the card, above the "Job card — draft" title. (7) Chat card, hamr's live click-through 2026-10-05 ("+ New" disappears once a card is filled; no way to start over): the Chat tab always opens on an empty job card; **+ New is removed**; a button at the card's TOP RIGHT, on the "Job card — draft" title line, empties every box (check type deterministic, Model default, origin/estimate/notes hidden, progress list and thread cleared) and the card is ready to fill again; a Reuse still fills the card as before. Ruling (e), verbatim: "clear is abandon when one is running, if one is running and drafting (not yet on workflows) after it started running and moves to workflows it changes to clear because user can stop it from workflows". So ONE button, two states: while an authoring session is live and unsigned (drafting / waiting on install / waiting for confirm) it reads **Abandon** and calls the new `POST /api/author/:id/abandon` (phase `abandoned`, lock released, spend stays booked, no new model call), then the card empties; once signed and started, terminal, or nothing started it reads **Clear** and only empties the card — it never stops a run (Stop lives on the Run tab). User-facing "+ New" wording (Ended next line, locked-box refusal) now says "Clear the card". (8) The separate "spec hash:" line under Sign & run is removed; the hash shows once, as the "> spec hash …" detail of "generating hash". (9) "signed hash" showing no check: NOT reproduced — the server state (real reuse session through `signRun`) and the page render (headless chromium, stubbed API) both end the list with `signed hash ✓`; locked by tests, cause still open (a copy/selection artifact is the only unproven candidate). (10) Check again sits immediately before Sign & run in one non-splitting group (390px and 1280px checked). (8) ONE wide button below the message box replaces the card start, Send, Check again, Revise and the sign pair; its wording is one pure function `mainButtonFor(state, textEmpty, reuse)`: Start drafting / Sign & run (reuse) / Check again (install wait) / Send (typed text; at the plan menu it is a revise, allowed while changes are left, hint "N changes left") / Sign & run (plan ready, box empty; the two-step "Sign <hash8> & run" kept) / disabled otherwise. (9) The chat message box has a white background (dark: the theme input background) and a constant solid border. (10) The Reuse origin line reserves the Clear/Abandon button's width and wraps instead of running under it. (11) Chat tab only, hamr verbatim: "ask place and any non dimmed should get the standard white (less bright than ask) in the background of bareloop, … and dimmed should remain current color". The ask box keeps `--field-bg` (#ffffff light); every other enabled, non-readonly Chat-card input/select/textarea gets the new `--field-soft-bg` (#f7f7f9 light; dark = the theme input background); disabled/readonly (locked Reuse, dimmed) fields keep their current colour; nothing outside the Chat tab changes. (12) Chat card, hamr verbatim: "when it moves to run, chat should clear to avoid rerunning the same, as it still shows as such". The moment the page sees phase `signed` (the poll branch that switches to the Run tab) the Chat card resets to the empty card through the same `resetCard()` Clear uses; the run is untouched (Stop lives on the Run tab). (13) Progress list order, hamr verbatim: "drafting should be mentioned again, this is a chronological order". The list is a time-ordered log of segments: starting a different step closes the running line; a step that already has a line and starts again after other steps appends a NEW line at the end (the earlier line keeps its ✓ and detail; lines are never moved or reordered); a failed step still shows ✗ with its reason; id lookups (detail) target the latest line of that id (`advanceSteps`/`latestStep` in `src/panel/authorsession.js`). (14) The ask box `#chat-msg` is a `<textarea>` that wraps long text (grows to a few rows, then scrolls inside; vertical resize), not a sideways-scrolling input; keeps the white background, constant border and placeholder; Enter sends through the one main button (a no-session Enter never starts a draft), Shift+Enter is a newline; `mainButtonFor` still reads typed-text-empty from it. (15) The card's free-text boxes (Goal, Source, Destination, Success, Guardrails, Judge examples) wrap on multiple lines like the ask box: wrapping `<textarea>`s sharing the ask box's one `fitBox` (grow, then scroll inside, vertical resize), Enter is a newline; Job name stays a one-line input; ids, placeholders, prefill, reuse lock and the soft-white/locked colours unchanged. (16) The ask box `#chat-msg` is dimmed (disabled, emptied) whenever there is nothing to reply to — no session, no pending ask, or waiting on an install — and opens only while a pending ask takes typed text (the plan menu -> a change request, or any question); `askBoxOpenFor` is the one rule, `mainButtonFor` still reads typed-text-empty (true when disabled). (17) Chat-card field colours: editable (non-dimmed) fields = soft white with the ordinary 1px border, no added grey/thick border; dimmed/locked/disabled = grey; the focused field = blue (accent) border; only the ask box keeps its own constant border.


## Addendum 2026-10-05 — P6 — repo jobs on a worktree, bareloop installs, link login, Settings price + open folder (signed by hamr 2026-10-05)

Branch: chore/fix-ledger (hamr 2026-10-05: "we cont on this branch"). Build order = item order. Each item
works alone, gets its own commit and its own tests, and the gate stays green between items.

### Rulings carried in (hamr's words / picks)
- 2026-10-04: panel REPO jobs run on a worktree branch INSIDE the person's repo, `.bareloop/wt/<runid>` —
  one engine, many doors (the bundle door already does this, src/bundlerun.js:168-195).
- 2026-10-05 Q1 = A: the worktree starts from where you are (your current commit). Uncommitted edits
  are not in it, and the page says so.
- 2026-10-05 Q2 = A: secrets already in the person's repo are masked where bareloop records them,
  like the CLI. The panel no longer refuses a repo for a fake `sk-` fixture. Hard line #3 gets reworded (item 2).
- 2026-10-05 Q3 = A: the worktree is made when DRAFTING starts. Drafting checks the job on it, and
  Sign & run runs in that same worktree. One tree, one install.
- 2026-10-05: BARELOOP installs packages before the agent starts — never the agent. `run` stays locked.
- 2026-10-04 "b": link login (cookie), next part.
- 2026-09-30: Settings — price in / price out per key row (per 1M tokens, advise the higher bracket);
  a button that OPENS the keys folder instead of the path as text.

### 1. Repo job = worktree in your repo (replaces the hidden copy for repos)
Call site: src/panel/authorsession.js:550-620 (today: `prepareSource` into `<session>/source-seed`,
then `prep.tree` everywhere, incl. `workdir: prep.tree` at :692).
- At drafting start, for a repo source: `git -C <repo> worktree add --detach .bareloop/wt/<runid> HEAD`.
  The session's tree IS that worktree. Same shape as the bundle door. Reuse its code; never write a second spelling.
- Before the worktree is made: if `git status --porcelain` in the repo is not empty, a progress line says
  "N uncommitted change(s) in your repo are not in this job — it starts from commit <short-sha>."
  This is a notice, not a refusal.
- `.bareloop/` is hidden from the person's own `git status` via the repo's private exclude
  (`.git/info/exclude`), never their tracked `.gitignore`. Same rule as node_modules today.
- The work branch: the engine's existing work-branch rule (`bareloop-<job>-N`, never main/master,
  commit per step) — nothing new.
- At the end of the run:
  - GREEN: final commit, then `git worktree remove`. The branch stays. The Ended block shows
    `git merge <branch>` and `git branch -D <branch>` (text — merge stays human).
  - stopped / capped / died: the worktree folder stays, so Resume works. The Ended block names the folder.
  - A drafting session closed without ever running: its worktree is removed (detached, so no branch).
- Destination for a repo stays the path inside the repo (ruling B, 2026-10-05), unchanged.
- Plain folders: the panel refuses them today (`nonRepoSourceMessage`), so nothing changes there.
- Open, to rule at build if it shows up: a worktree left behind when the panel restarts mid-drafting.
  Today the session is lost in that case anyway.

### 2. Secrets in the person's repo: mask, don't refuse
- The repo door no longer runs `prepareSource`'s secret-content refusal (src/source.js ~:613-640)
  on a worktree repo. The `.env`-by-name refusal stays. Symlink, nested `.git` and the size rule: the
  builder lists each front-door rule and says which ones still apply to a worktree. hamr rules any that are unclear.
- Everything bareloop RECORDS from the worktree goes through the one redactor (`redactSecrets`,
  src/validate.js): spine, gate audit, draft readout, run list. The builder proves this with a test repo
  holding a fake `sk-` key that a worker reads: the key text appears in none of those files.
- CLAUDE.md hard line #3, proposed wording:
  "Secrets load from the environment; bareloop never puts one into the tree, the spine, the configs,
  or the ledger. A secret already in the person's own repo is masked wherever bareloop records it
  (an append-only log that captures a key captures it forever)."

### 3. bareloop installs packages (npm), $0, before any token
Call site: src/panel/authorsession.js:601-620 (today: `missingDependencies` → install-needed wait + Check again).
- If the worktree has `package-lock.json` / `npm-shrinkwrap.json` and no node_modules:
  bareloop runs `npm ci --ignore-scripts` in the worktree. Progress line: "Installing packages (npm ci)…".
- If it fails, or the project uses another lock file (yarn/pnpm), fall back to today's message +
  Check again, with the real command.
- The agent never gets an install verb.
- Other languages: later (M3b).

### 4. Link login (cookie)
Call sites: src/panel/server.js:2558-2562 (token injected into the HTML), :2644 (`mintToken`),
src/panel/index.html:803-830 (`TOKEN`, `x-bareloop-token` header), `bareloop panel` startup print.
- `bareloop panel` prints `http://127.0.0.1:<port>/?t=<64-hex>`.
- `/?t=<token>` → sets an HttpOnly, SameSite=Strict cookie → 302 to `/`.
- Every request needs the cookie. Without it you get a plain 403 page: "Open the link printed in the terminal."
- The token is no longer inside the page. The page's JS sends no token header; the cookie rides along.
- The token survives panel restarts: a 0600 file in a 0700 dir under ~/.config/bareloop.
  The stale-token reload line stays for a token that really changed.
- Host guard (127.0.0.1 only) unchanged.

### 5. Settings → Providers: price in / out per row
Call sites: src/panel/settingsroutes.js:147-160 (POST /api/settings/providers/row), src/panel/index.html
Providers table (~:3469-3520). Config fields already exist: `keys.<ENV>.priceInPerM` / `priceOutPerM`.
- Each row's Price cell becomes two boxes: "In $/1M" and "Out $/1M". They save with the row's existing Save.
- Hint under the table: "If your vendor lists two prices, enter the higher one."
- Empty = not set. Runs on that row show "estimated", as today. Only a number ≥ 0 saves; anything else is refused with a reason.
- Mockup diff: the mockup has ONE Price column ("no price set"). This is two boxes — hamr's 2026-09-30 ask.

### 6. Settings → Providers: Open keys folder
Call sites: src/panel/settingsroutes.js (new POST /api/settings/open-keys-folder), index.html keyfile strip.
- A button "Open keys folder" opens `~/.config/bareloop` in the file manager (`xdg-open` on Linux,
  `open` on macOS). It never opens the file in an editor and never reads it.
- Replaces the path shown as text. Mockup diff: the mockup has "Copy path". hamr asked for open (2026-09-30).
- On another OS, or if the open fails: show the path as text, like today.

### Proof (before any "done")
- The full gate on the last commit: typecheck, build:types, npm test — each exit code and the last line quoted.
- The orchestrator's own screenshots of every changed screen.
- hamr clicks through it himself.
- A paid run only on hamr's word (DeepSeek deepseek-flash).

### Docs
- One PRD line (v1.89) pointing here.
- CLAUDE.md hard line #3 rewording (item 2).
- bareloop.context.md: worktree layout, install step, link login.
- CHANGELOG at release.
