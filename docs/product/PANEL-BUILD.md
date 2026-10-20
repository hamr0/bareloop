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
- The button is **Reuse workflow**, replacing "Start from this" everywhere on the page. It shows on **green runs only** (green, softgreen, green + destination refused) and on every **imported** job. Never on red, stopped, capped or died rows; a red row's Ended block says "Change the job: + New." Stopped/capped/died rows offer `[Resume]` only. (SUPERSEDED 2026-10-15 by v1.101.)
- The Run tab's action row: `[Stop]` if live · `[Resume]` if resumable · `[Reuse workflow]` if green. An imported job has the same row with `[Reuse workflow]`.
- Click opens the **Chat tab** (left), the New job card, filled from the signed job. **Only four boxes are editable: Source, Destination, $ cap, Time cap.** Every other box (check type, model, job name, goal, success, guardrails, judge examples) is shown greyed. No drafting, $0, `[Sign & run]`. To change any locked box: `+ New` (drafts). The server refuses a reuse start whose locked boxes differ from the origin's, by name. (SUPERSEDED 2026-10-15 by v1.101.)
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

**2026-10-04 — Model is unlocked on Reuse (hamr): the Model box is the fifth open field** (a Name from Settings > Providers; provider and baseUrl come with the chosen row). The server refuses any other locked change as before. `workflowKey` now ALSO ignores `provider`, `baseUrl` and `model` (`WORKFLOW_KEY_IDENTITY_FIELDS`); `jobSpecHash` is unchanged and still covers them. The reuse spec sets provider/baseUrl/model from the chosen row the way normal authoring spells them (baseUrl when the row has one; model only when the Name is not the provider's default tier). RUBRIC (soft-green) jobs: the judge never changes with the worker — a spec with no explicit `judge` is pinned to the ORIGIN's resolved judge identity (`resolveJobJudge`) before the swap; an explicit judge is kept; deterministic jobs have none. The estimate line counts only runs with the same workflowKey AND the same worker (provider + baseUrl + model) as the card's current choice and recomputes when the Model box changes; no such run reads "no runs yet on this model". Imported reuse no longer forces the bundle's provider (the chosen row is used; no matching row is no longer a refusal, the card opens with no Name picked); close-byte re-verification is unchanged. (SUPERSEDED 2026-10-15 by v1.101.)

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

### 7. Run names: `run-N` instead of the run id (signed by hamr 2026-10-06)
- Runs of the same workflow (the same group in the Runs list) are numbered oldest first: `run-1`, `run-2`, … A resume is not a new run and keeps its number. A run that died or was stopped still gets a number.
- `run-N` shows wherever a run is named for a person: the Runs list rows and cards, the workflow row, and the right-side header (`[✓] my-job (run-3) │ passed …`).
- The real run id stays in the Audit tab and in every command line (`--resume <id>`, `git merge …`).
- One owner: the server computes the number once; every view reads it. The page never counts on its own.
- Proof: tests, the orchestrator's screenshot, then hamr clicks through.

### 4. Link login — DROPPED (hamr 2026-10-06)
- Dropped by hamr's word. The token-in-page exposure only matters to a program already running as the person on their own machine, and that program can already read `~/.config/bareloop/.env` or run `bareloop` itself (the local-trust model, not a sandbox). Websites cannot read the page cross-origin, and the panel answers only on 127.0.0.1 behind its Host guard. The only gain, a tab that survives a panel restart, does not pay for opening a special link. The token stays in the page as today.

## Addendum 2026-10-08: the run page (Edit in chat, Resume on the Chat card, read-only Job tab)

Rulings by hamr 2026-10-07/08, built on `feat/panel-run-page`.

- **Edit in chat** on every non-green ending (`withEditAction`, `src/panel/server.js`): the page reads `GET /api/author/start-from`, opens the Chat card with every box open and the normal Start drafting; no reuse state. A code-owned origin line says where the card was copied from. (SUPERSEDED 2026-10-15 by v1.101.)
- **Resume on the Chat card**: RESUME mode, signed job locked, only $ cap and Time cap open, `Sign & resume` posts the same `/api/runs/:id/resume`; the Job tab's resume mode is deleted and the tab is read-only everywhere.
- **Signs and words**: stopped is `[■]` (red); the Ended block's NEXT line on a red run points at Edit in chat. (SUPERSEDED 2026-10-15 by v1.101.) (SUPERSEDED 2026-10-15: stopped [■] is grey, PRD v1.104.)
- **Reuse is for earned greens only**: an `already-green` run takes Edit in chat; `listReuseJobs` offers real `green` only; `POST /api/author/start` answers 409 for a reuse of any other local run (start-from carries `outcome`); a delivery-refused ending offers Reuse only when the run earned its green. (SUPERSEDED 2026-10-15 by v1.101.)
- **Capped on every surface**: `capKindOf` (`src/legs.js`) is the one cap rule for the run status, a leg's stop reason and the open step of a single-leg run. A stop in the close-fix loop reads "during the fix phase".
- **Picker and list**: the Reuse picker reads Loading… until its list arrives and a Check type radio never blanks typed boxes; an expanded job shows its latest 7 other runs, older ones by search.
- Not seen live yet: phone width, the fix-phase stop text, the already-green Edit in chat ending.

## Addendum 2026-10-10 — P7 — "The job" block, numbered Inputs, linked checks, Signed row (signed by hamr 2026-10-10)

Screen signed by hamr 2026-10-10: scratchpad mock `job-block-mock.html` (copied to `design/job-block-mock.html` with this addendum).

### What the person sees

**Chat card, both check types.** Fields in order: Check type, Model, Job name, **The job**, **Inputs**, Destination, Cap $ / Time cap.
- Goal, Success, Guardrails and Judge examples boxes are GONE (panel and CLI interview). Success is a guardrail.
- **The job:** one multi-line box. Each plain line gets a number (1, 2, 3…) in a gutter OUTSIDE the box, left. A line starting with `~` gets no number; it belongs to the numbered line above. Consecutive `~` lines join into ONE rule with `'; '` (fwd's joinGuardrails). A `~` line starting `PASS:` or `FAIL:` is a judge example (rubric only); any other `~` line is a guardrail. A `~` before line 1 is a $0 red. Empty lines are ignored.
- **Inputs:** multi-line, numbered in the gutter, one `label: value` per line.
  - Line 1 = the repo (absolute path), both check types.
  - Lines 2+ = files or folders INSIDE that repo, repo-relative (e.g. `spec: docs/spec.md`). Proven at $0 before any token: exists, inside the repo, tracked, not refused by the front door (secret shape, `.env`, symlink). A miss is a $0 red naming the line number.
  - The drafter is told: "the person pointed at these inputs: N label path".
  - Search lines and files outside the repo are NOT in this piece — they arrive with the plain-folder/flight piece (#3). Typing one now is a $0 red: "line N: only files inside the repo for now".
- **Empty-box examples (placeholder, grey, disappears on typing; changes with the Check type radio):**
  - The job, deterministic: `Fix the failing date tests in src/date.js` / `~ don't edit any test file` / `Make npm test pass`
  - The job, rubric: `Write a one-page summary of docs/plan.md` / `~ PASS: every number is quoted from the file` / `~ FAIL: a number that is not in the file` / `Keep it under 300 words`
  - Inputs: `repo: /home/me/myrepo` / `spec: docs/spec.md`
- **Locked on Reuse/Edit/Resume:** Job name, The job (same as Goal/Success/Guardrails/Judge are today). Open: Inputs, Destination, caps, model.

**Drafting confirm card (the plan bubble).** Replaces the plain-text `#PLAN / #CHECKS / #NOT CHECKED` bubble with the SAME renderer as the Job tab (one renderer, two places):
- each numbered job line, its joined `~` rule, then its drafted check(s) folded: `› check · <name> · machine check | judge`;
- `› Not checked (the AI's own reading) · N` fold, same shape;
- `› Always checked · N` fold for the mandatory guards (no-suppressions etc.) — they serve no job line;
- legend `Done when every › check passes`; only the `›/⌄` marker is blue+bold (`--plan`: dark #7aa2f7, light #2668c2).
- The Sign & run button is unchanged.

**Job tab (read only).** Same renderer, read from the SIGNED spec, then rows: Inputs (numbered), Destination, Cap, **Signed** (`YYYY-MM-DD HH:MM · <first 6 of specHash>`; time = the run's first `job-start` ts, local time). Older runs without job lines: show the signed goal sentence as line 1 and the stage names as checks, note "older job — numbered lines were not saved".

### Rules (code, never the model)
1. The drafter tags every close stage it writes with `fromLine: N` (a job line number), or lists `refused: [{line, reason}]`.
2. Validator ($0, at draft): every `fromLine` names a real line; every numbered job line has ≥1 stage OR a refusal reason. Not checked does NOT cover a line. Else red → the existing revise loop.
3. Mandatory guard stages carry no `fromLine` (they belong to "Always checked").
4. Judge examples for calibration = the `PASS:`/`FAIL:` `~` lines, each kept with its line number (replaces answer 4).

### What goes into the signed spec (hash changes for NEW jobs only)
- `jobLines: [{n, text, rule}]` — the person's own words, so the Job tab and Reuse prefill show exactly what was typed (today the spec only has the model's goal sentence; Reuse prefills stage names into Success).
- `inputs: [{n, label, value}]`.
- each `closeDecl` stage may carry `fromLine`; `closeDecl.refused` list.
- `goal` stays (the model's confirm sentence; the worker prompt reads it).
- Old signed specs keep their hash (never rewritten); they render via the "older job" fallback. `workflowKey` of new jobs differs from old ones — old greens stay reusable as themselves.

### Where it lands (call sites)
- **Parser (new, one owner):** `src/jobblock.js` — `parseJobBlock(text)` → `{lines:[{n,text,rule,examples}]}` or red; `parseInputs(text)` → `[{n,label,value}]` or red. Both used by panel server AND CLI interview.
- **Drafter:** `src/authorflow.js` question sets (`GREEN_QUESTIONS`, `FIELD_LABELS`, soft-green sets, `JUDGE_EXAMPLES_QUESTION`) collapse to one "The job" answer rendered as numbered lines; `CONFIRM_SCHEMA` checks become `{text, fromLine}`; `declarationSchema` stage gains optional `fromLine`, closeDecl gains `refused`; `src/cardauthor.js` `cardCasesPrompt` reads PASS/FAIL lines; validator rule 2 in `src/authoring.js validateDeclaration` + `src/declaredclose.js CLOSE_DECL_FIELDS`; `src/job.js JOB_FIELDS` admits `jobLines`, `inputs`. Prompt edits carry Failure/Addresses/Corrects labels (Failure cites mv1j01sl: the drafter guessed which judge example belonged to which goal part).
- **Panel server:** `src/panel/authorsession.js` `CARD_FIELDS` → `jobText, inputs` replace goal/source/success/guardrails/judgeExamples; `validateJobCard`; answers build at ~836; input proving before `prepareSource`; `planText` → structured plan message `{role:'bot', kind:'plan', plan}`. `src/panel/server.js getRunJob` returns `jobLines, stages (name, kind class, fromLine), refused, notChecked, inputs, signedAt, specHash`; `reuseCardFromSpec`/`getStartFrom`/`getStartFromImport` prefill from `jobLines`/`inputs`.
- **Page:** `src/panel/index.html` — two gutter boxes replace six; one `renderJobPlan()` used by the chat plan bubble and `renderJob`; the four repeated prefill blocks become one; LOCKED_IDS/OPEN_IDS/CARD_BOX_IDS/fit lists updated.
- **CLI:** `src/interviewrun.js` asks "The job" and "Inputs" as multi-line answers (a removed box is removed everywhere).
- **Tests:** page tests pinning the old ids and `planText` text are updated, not deleted; new tests for the parser, the $0 input proving, the fromLine validator (fail-first), the Job tab with old and new specs.

### Build order (one sonnet builder, commit per item, hermetic `npm test` only, runs.jsonl count before/after)
1. `jobblock.js` + tests. 2. Drafter + validator + spec fields. 3. Panel server + inputs proving. 4. Page: boxes, shared renderer, Job tab, Signed row. 5. CLI interview. 6. Docs: bareloop.context.md, FINDINGS entry.

### Done means
Gate green on HEAD (typecheck, build:types, npm test — exit codes quoted), my own screenshots at 1280, then hamr clicks through it, then ONE paid DeepSeek (deepseek-flash) drafting run on a small repo job proving the drafter tags `fromLine` live (proposed separately with its $0 premise read, cap stated).

### Not in this piece
Search inputs, files outside the repo, plain-folder rubric jobs (piece #3, with the flight-search run). .docx/.xlsx readers (piece #2). PDF (off). Try-3 questions (later).

### Batch 2 — signed by hamr 2026-10-10 ("yes to all"), built on `feat/job-block`

Six items, one commit each:
1. The plan bubble's loose `goal sentence:` line is a labelled **AI's summary** row in the shared `renderJobPlan` (the "Sign & run to confirm this plan…" footer stays a hint).
2. The same row on the Job tab, from the signed spec's `goal` (`planFromSpec`); an older job shows its goal as line 1 only, never twice.
3. The job and Inputs boxes grow with their text to 8 lines, then scroll; the gutter scrolls with the text (padding top and bottom match the textarea, `contain:size` keeps it out of the row height). A wrapped line counts by what is displayed; its number sits on the first row.
4. Left pane 420px -> 630px **from 1200px up** (900-1199 stay at 420; max-width:899px unchanged). 630px at 900 left the right pane 270px and wrapped its tabs; at 1200 it is 570px, never narrower than the 480px it already had at 900.
5. Try-3 questions per fwdloop's signed design (am24/25/26): only the last of the full ladder (author call + both revisions), and only after tries 1 and 2 both failed (validation, the seed read OR an output cut-off, see the rulings below), may ask (<=2, each on a job line try 2's reds named; the machine keeps 2, drops and logs the rest; no number in the prompt). Answers are required (no Skip), added word for word as `~` rules on their line in the signed `jobLines`, the plan card and Job tab show them, then the draft runs once more with no asking. The confirm turn's own plan `questions` are unchanged.
6. A drafter answer cut off at the output cap is a failed try (same ladder as a malformed artifact), not `provider-red` (F215); every drafting stop says why in plain words on the card.

**Later, same branch (2026-10-11):** the plan bubble's `questions:` line became an **AI's open questions** row (same label style as AI's summary): each question its own list item, then a bold "Revise if you need to."; shown only when the plan has questions, `data-testid="plan-questions"` kept. Questions after signing are unchanged.

**Ruling 2026-10-10 (hamr), item 5 — differs from fwdloop's validation-only rule.** The option also opens when tries 1 and 2 failed the SEED READ: a work stage instrument-stopped, or no work stage is red on the repo as it is (the vacuous close, "nothing in the close fails at all"; the mandatory guards never count as work). That is exactly when a question helps. A question must still name a job line: for a seed-read failure the lines are the `fromLine`s of the stages the seed read named (the instrument-stopped ones, else the work stages); if none maps to a line, every numbered job line counts. The machine still keeps at most 2 and logs the dropped. A try that validated and seeded red is a confident guess and never opens asking. Live evidence: session smv2cbieep7sp, 3 tries each refused at the seed read, no question.

**Ruling 2026-10-10 (hamr), item 5, second part.** A try cut off at the output cap (F215, `truncated:max_tokens`) is also a FAILED try for this gate: if every structure attempt of that try was cut off it fails; if one attempt was cut off but a later one finished, the try is judged by that finished attempt. A cut-off names no line, so every numbered job line counts (the same as the seed-read no-mapping case). The ladder carries on to try 3 after an all-cut-off try 2 only when that gate can open (try 1 failed too); anywhere else an all-cut-off try still stops `artifact-red`. Live evidence: session smv2k6bczlvk3, try 2 (revise-1) cut at 32000 tokens, $0.0384, then try 3 ran with no question.

## Addendum 2026-10-11 — P8 — Settings > Providers copied from fwdloop, "Thinking on" tick, no hardcoded vendors (signed by hamr 2026-10-11)

Source of truth for the screen and its texts: fwdloop branch `m4d-am3`, HEAD `a334e6c`. READ it, never check it out: `git -C ../fwdloop show m4d-am3:<path>` (`src/panel/index.html`, `src/panel/settings.js`, `src/config.js`, `src/providershapes.js`, `src/provider.js`, `src/thinking.js`, `src/panel/spawn.js`, `src/panel/author.js`, `src/drafter.js`; tests `test/m4d-*.test.js`). Screenshots: `/tmp/claude-1000/m4d-F/*.png` and `/tmp/claude-1000/m4d-test/*.png`; design lab `/tmp/claude-1000/-home-hamr-PycharmProjects-fwdloop/094aa5a5-3d76-4a3f-84b8-bbb02a1da923/scratchpad/variantF/lab.html`. **This is a REWRITE for bareloop, never a copy** (AGENT_RULES: graduation is a rewrite). The builder writes bareloop's own code against bareloop's own seams (named below), puts `// rewritten-from: fwdloop <path>@a334e6c` at the top of each file it models on fwd's, and edits NOTHING in `../fwdloop` (no checkout, no branch switch, no commit).

### Rulings carried in (hamr 2026-10-11, all signed in conversation)
1. The Providers page is fwd's, EXACTLY: texts, grid tracks, breakpoints, routes (the texts and routes are listed below word for word; the CSS is read from fwd's `src/panel/index.html` lines 650-752, the markup from `buildProviderRow` / `buildModelLine` / `paintProviders` at ~5230-5470).
2. KEEP the Test button (final shape below) and "Open keys folder" in the KEYS strip.
3. Balance is REMOVED entirely: route, cell, `anthropicBalanceNote` and its POST route. Every line is named under "Balance goes".
4. Config moves to fwd's shape: a key row holds `{shape, baseUrl, legacyMaxTokens}`; `models.<ENV>` is a list of `{model, use, inPerM, outPerM}`. NO vendor-based migration: nothing sniffs a host or a model id to set `legacyMaxTokens` or anything else. **hamr ticks his DeepSeek row's "old max_tokens" box by hand, once** (see "Money consequence" below).
5. "Thinking on" tick in the New job card under Model (fwd's `#jf-thinking`), per job, unticked by default, saved in the SIGNED job; it covers DRAFTING AND the rubric JUDGE; the WORKER is untouched.
6. bare-agent 0.52 (not on npm yet; rc2 passed our suite in a scratch copy) gives `thinkingSupport(kind, model, { baseUrl })`. bareloop's copied DeepSeek regex in `thinkingKind` is deleted. **Blocked until 0.52 is on npm, then bump the dependency.**
7. No-hardcode ban, option A: CODE only. Comments that tell history may still name vendors. A grep test (fwd's `test/m4d-am6-e.test.js`, rewritten) holds it.
8. Chat's Model menu = only ticked and priced model lines (fwd's texts).
9. NOT in this piece: splitting `tests/planrun.test.js` (hamr has not ruled). *(Ruled later the same day, 2026-10-11: split into `tests/planrun-*.test.js` by topic, 5d66d5e.)*

### What the person sees (Settings > Providers) — fwd's page, word for word

**Placement.** Unchanged: Settings opens from the header, tabs `Providers` and `Money & limits`, `← Back`. Only the Providers tab changes. bareloop's tab ids (`tab-providers`, `panel-providers`, `tab-money`, `settings-back`) and `data-testid`s (`settings-tab-providers`, `settings-tab-money`, `settings-back`) stay, because `tests/panel-page.test.js` and `tests/settings-*.test.js` pin them.

**KEYS strip** (`.keyfile-strip`, `┤ KEYS ├`): text `Put NAME=key lines in <code>~/.config/bareloop/.env</code>, then Reload keys — each row below says whether its key is set. Only names are listed; keys never reach this page.` (the path code box shows the server's `keysFile.path`); a red line for a keys-file refusal; a grey line `keys-open-note`. Buttons `[ Open keys folder ] [ Reload keys ]`. At ≥900px the strip is one row (text left, buttons right); **<900px the strip text is full width and the buttons sit under it.** The new tab-wide hint under the table: `⟳ refresh models (free) · old max_tokens: tick if the server wants the old field name` (replaced by the config-problem sentence, red, when `configProblem` is set). The old text `If your vendor lists two prices, enter the higher one.`, `Name is the model id Chat uses. …`, the `pv-shell` lines and the `no keys with a value yet…` row are removed (a shell-only key is now a row, see below).

**One shared grid** (`.pv-grid`), `--pv-cols: minmax(0,2.8fr) minmax(0,1.5fr) minmax(0,.95fr) minmax(0,.95fr) minmax(0,.9fr) minmax(0,.6fr) 272px`, column-gap 8px, rows `display:grid`.
- **≥1280px.** Header row: `KEY | API SHAPE | BASE URL (spans tracks 3-4) | OLD MAX_TOKENS | TOKENS | (buttons)`. Model sub-header (per key, hidden when the key has no lines): `USE | MODEL | IN $/1M | OUT $/1M | TOKENS` (USE+MODEL in track 1, IN and OUT side by side under BASE URL, TOKENS in track 6). A key row has a SOLID 1px line above it, a model row a DOTTED 1px line. The wrapper `.table-wrap` scrolls sideways if it must; the page itself never does.
- **<1280px (`@media (max-width:1279px)`).** Both header rows hidden. Every cell becomes a `label : value` line (`.pv-cell`, a 104px label column + the value; `Tokens`, `API shape`, `Base URL`, `Old max_tokens`; the price pair is ONE line labelled `In / Out $/1M` with two boxes). Inputs 44px high at 14px, tick boxes 24px, fold/Refresh/Test/Add buttons min 44x44. The name+status+fold line and the buttons line carry no label (`.nolbl`).

**Key row** (one `.pv-key` block per key, `data-testid="provider-row-<ENV>"`): fold button `▸`/`▾` (aria-label `Fold <KEY> models` / `Unfold <KEY> models`), the env name in `<code>`, the status, the folded summary, then:
- **API shape** `<select>` with the three shapes (below), aria-label `<KEY> API shape`.
- **Base URL** `<input type=text>`, placeholder `type the Base URL`, aria-label `<KEY> Base URL`.
- **Old max_tokens** tick + the word `on` / `off`, aria-label `<KEY> legacy max_tokens`.
- **Tokens**: the key's spend total (`tokensText`: `0`, `12.3k`, `1.2M`).
- **Buttons, last track 272px**: `[ Test ] [ ⟳ Refresh ]` (Test aria-label `Test <KEY>`, disabled text `testing…`; Refresh aria-label `Refresh models for <KEY>`, disabled text `⟳ refreshing…`). <1280px both buttons share ONE line under the label lines.
- **Status.** `set in file` and `found in shell` show a green `✓` with the word as `title` and `aria-label`; `not set` and `refused — see above` show as grey text. A key whose value has a space or a line break: `The key has a space or a line break in it. Fix it in your keys file, then reload keys.`
- **Folded summary** (grey, hidden while the key is open): `N models · none ticked` / `N models · K ticked` (`1 model` for one) / `failed — type a name` (list call failed and no saved lines). First paint is OPEN only if a model line is ticked; after that only the person's fold clicks change it.
- **Note lines under the key row** (`.pv-knote`): the edit refusal (red), the legacy-tick line, the Test result line (`role="status"`).

**Model row** (`.pv-mrow`, `data-testid="model-line"`): `Use` checkbox (aria-label `<KEY> <model> use`), the model name in `<code>`, `In` box and `Out` box (placeholder `—`, `inputmode=decimal`, aria-labels `<model> price in per 1M tokens` / `... out per 1M tokens`), tokens (`—` when no spend row names the model, never `0`), and a per-line message line.
- Under the lines (`.pv-more`): the failed band (amber, `var(--amber-bg)`): `<why> Type the model name below.`; or, with no lines: `No models yet. Press ⟳ to refresh models, or type a name.`; then `+ type a model name` (a link-styled button) which opens a box (placeholder `type a model name`, aria-label `<KEY> model name`) and `[ Add ]`; Add posts the line unticked and the box says `added`.
- Listed ids from a Refresh are shown UNTICKED and are not saved until the person touches one.

**Rows = the keys file's names (non-empty value) + shell-only keys.** There is NO add-row and NO remove-row control. A shell-only key becomes a row only when config already names it (`keys.<ENV>` or `models.<ENV>`), exactly fwd's `shellOnly`; its status reads `found in shell`.

**Saves.** On change, no Save button (fold/refresh repaint without re-asking). Success line on a model or legacy-tick save: `saved — applies from the next model call`.

**Server texts, word for word** (each refusal is a plain sentence in `say`; the page shows `say`, never a code or a status):
- shape/Base URL: `Pick an API shape from the list.` / `The Base URL must start with http:// or https://.` / `The legacy max_tokens tick must be on or off.` — each followed by ` Nothing was saved.`; empty Base URL clears the field; trailing slashes are stripped; `Nothing to save.` when the body names none of the three.
- model line: `Fill both prices to tick this model.` / `Fill both price boxes or clear both.` / `A price must be a number, 0 or more.` (0 and 0 are accepted as a chosen price); `cachedInPerM` is refused: `Cached input has no price of its own: it is priced as input. Nothing was saved.`; `Pick a model line. Nothing was saved.` when `model` is not a string; `The model "<id>" is listed twice.`; `Use must be on or off.`; `The model name must be a model id: 1 to 200 characters, no spaces.`
- `That provider is not known.` (slot not a row); broken config: `Your settings file (config.json) cannot be read. Fix or remove it, then look again.` (+ ` Nothing was saved.` on a write); any other route: `Settings cannot do that. Keys are typed into your keys file by hand.`
- Test / Refresh failure sentences (one GET, 4 s): `The provider refused the key.` / `The provider answered with an error.` / `The provider did not answer in 4 seconds.` / `Could not reach the provider.` / `The provider answered with a redirect; the key was not sent on. Check the Base URL.` / `The provider did not list any models.` / `Type a Base URL for <KEY> in Settings.` (no call made when the Base URL is empty). Test success: `OK · <ms> ms`.
- Open keys folder failure: `Could not open it here. Your keys folder: <path>`.

### Routes (all behind the existing `checkHumanGuard`, GET too)

| Route | Body → answer |
|---|---|
| `GET /api/settings/providers` | `{ok, keysFile:{path,exists,refusal}, configProblem, shapes:[{id,label}], rows:[{slot, label, envVar, keyStatus, shape, baseUrl, legacyMaxTokens, tokens, models:[{model,use,inPerM?,outPerM?,tokens?}]}]}` (`tokens` on a model only when a spend row names it) |
| `POST /api/settings/provider` | `{slot, shape?, baseUrl?, legacyMaxTokens?}`, every field judged BEFORE anything is written |
| `POST /api/settings/model` | `{slot, model, use?, inPerM?, outPerM?}`: a field left out keeps the line's value, a price `null` clears it; the WHOLE list is judged by `modelsProblem` before it is written; `models.<ENV>` is replaced whole |
| `POST /api/settings/models` | `{slot}` → one GET `<baseUrl>/models`, key in the header, 4 s → `{ok:true, models:[ids]}` or `{ok:false, why}` |
| `POST /api/settings/test` | `{slot}` → the same GET → `{ok:true, ms}` or `{ok:false, why}` |
| `POST /api/settings/open-keys-folder` | `{}` → `{ok:true, opened, path}`; a non-empty body → 400 `no-path-allowed` / `The keys folder is opened from the panel's own settings; a path cannot be sent. Nothing was opened.`; path = `dirname` of the keys file only; `xdg-open` / `open`, argv array, no shell, detached; any other OS, a failed spawn, or `NODE_ENV=test` without an injected opener answers `{ok:true, opened:false, path}` |
| `GET/POST /api/settings/money` | UNCHANGED |

List-call auth by shape: `anthropic-api` → `x-api-key` + `anthropic-version`; `gemini-api` → `x-goog-api-key`; `openai-api` → `Authorization: Bearer`. Ids: `data[].id` for two shapes, `models[].name` minus its `models/` prefix for the third; a redirect is NOT followed (`redirect:'manual'`), so a key is never sent on. Test and Refresh write no spend row and never call a completion endpoint.

**Call sites and what they replace (bareloop).**
- `src/panel/settingsroutes.js` `createSettingsRoutes` (wired in `src/panel/server.js`: import at :57, instance at ~:2886) — rewritten: the `providers` GET (113-151), the `providers/row` POST (153-192), `providers/test` (233-248) become the table above; the open-keys-folder block (194-215) is kept in behaviour but moves to dirname-of-the-keys-file + the `no-path-allowed` check; unknown path (276) says `Settings cannot do that. Keys are typed into your keys file by hand.` with 404.
- NEW `src/modellist.js` — the ONE `<baseUrl>/models` GET (`authHeaders(shape,key)`, `idsOf(shape,body)`, `listModels({shape,baseUrl,key,fetchImpl,timeoutMs})` → `{ok,models,ms}|{ok:false,why}`). Called by `settingsroutes.js` (test, models) AND by `checkProviderReachable` in `src/providers.js:478-514` (which keeps its signature and its caller `src/panel/authorroutes.js:160` `/api/author/model-check`, but stops owning a second copy of the probe: `modelsListRequest` 444-455 and the header block 488-490 are deleted). `gemini-api` becomes testable (it was `canTest:false`, settingsroutes.js:140).
- `src/providers.js` `apiKeyProblem` (341-348) stays the one key-shape check; the status `The key has a space or a line break in it…` is its Settings sentence.
- `src/panel/index.html` — the Providers tab: markup 819-841, CSS 536-542, JS 3489-3597 (`loadProviders`, `pvRowBody`, the change/click handlers, Open keys folder, Reload keys) are replaced by `buildProviderRow` / `buildModelLine` / `paintProviders` / `paintModels` / `refreshModels` / `testKey` / `saveEndpoint` / `saveModel` / `saveProvider` / `addTypedModel`, rewritten against bareloop's own helpers (`authorGet`/`authorPost` at 902/909, `escapeXml` 939, `wireTabs` 913, `tokensText` 3494). `document.dispatchEvent(new CustomEvent("bareloop-providers-changed"))` (3548, 3573) is KEPT: it is what makes Chat's Model menu re-read.

### Config: the new shape, and how an existing config is read

```
{ "monthlyLimitUsd": <number > 0>,                         // unchanged
  "keys":   { "<ENV>": { "shape": "<shape id>", "baseUrl": "http(s)://…", "legacyMaxTokens": true|false } },
  "models": { "<ENV>": [ { "model": "<id>", "use": true|false, "inPerM": n, "outPerM": n } ] } }
```
- The top-level name stays `keys` (bareloop's own; fwd's is `providers`): same fields, no rename of the file's existing key. `models.<ENV>` is NEW and replaced whole on every save. Unknown top-level fields are kept as today.
- Shapes (NEW `src/providershapes.js`, one owner, `{id,label}` only, NO address): `anthropic-api` "Anthropic", `openai-api` "OpenAI-compatible", `gemini-api` "Gemini". `SHAPE_IDS` is imported by `src/config.js` (replacing its own copy at config.js:63) and by `src/job.js` where `PROVIDERS` (job.js:162) is built from it plus `clipipe-subscription`.
- **Defaults, nothing built in:** shape `openai-api`, `baseUrl` `''` (empty = no run, no list), `legacyMaxTokens` false, NO model lines, no default model, address or price anywhere. The legacy tick only matters on `openai-api` (`legacyMaxTokens: saved === true && shape === 'openai-api'`).
- **Reading an existing config (`effectiveModels(envName, config)` in `src/providerrows.js`, pure, no I/O, no file rewrite on read).** A row with `models.<ENV>` uses that list and ignores `keys.<ENV>.name/priceInPerM/priceOutPerM`. A row WITHOUT `models.<ENV>` whose `keys.<ENV>.name` is a non-empty saved string reads as ONE line `{model: name, use, inPerM, outPerM}`: when BOTH `priceInPerM` and `priceOutPerM` are finite numbers ≥ 0 the line carries them and `use:true`; otherwise (no price, half a price, a bad price) the line is `use:false` with no price, because a ticked line needs both prices (ruling 8; fwd's `modelsProblem`). A row with no saved `name` reads as no lines (the old built-in names `claude-sonnet-5` / `deepseek-flash` from `defaultsFor` are NOT carried: only what the person saved). `keys.<ENV>.shape` and `.baseUrl` read as saved; absent means the defaults above, NOT the old per-name defaults.
- **The first write of a row's `models.<ENV>` removes `name`, `priceInPerM`, `priceOutPerM` from `keys.<ENV>` in the SAME `updateConfig` call** (so there is never two sources); `anthropicBalanceNote` is removed from the file on the first Settings write (ignored on read until then).
- `src/config.js` becomes the validating reader/writer like fwd's: `readConfig` keeps returning `{config, exists, problem}` (bareloop's shape; `monthlyLimitOf`, `checkMonthlyRoom` and every `.problem` caller stay as they are), but validation of the new fields moves in: `providerFieldProblem`, `modelsProblem` (the ONE rule: a price is a PAIR or neither, both finite ≥ 0, 0/0 a chosen price, a ticked line needs both, no duplicate model, no unknown field on a line), `cleanBaseUrl` (strip trailing slashes). `updateConfig` (config.js:78-135) loses `anthropicBalanceNote` (89-91) and the `name`-validation (107-109) and gains the `models` patch (list replaced whole, `null` clears). The secret-shape sweep (`sweepSecretLiterals`, config.js:122-127) stays.
- **hamr's own file, plainly:** every row that relied on a built-in default loses it. After this ships, each of hamr's rows needs its API shape, Base URL and (unless a saved `name`+prices migrate) its model lines entered or ticked ONCE in Settings. His DeepSeek row additionally needs "Old max_tokens" ticked by hand. Nothing else does it for him, by ruling.
- **Money consequence of the unticked legacy box (state it, don't hide it):** a provider that ignores `max_completion_tokens` (F149, measured on the model that was `deepseek-chat`, carried to `deepseek-flash` unverified, F171) does not bind the output cap until the box is ticked, and an output cap that does not bind is a money hazard. So: no paid run on a row until hamr has ticked the box on that row; the Done check below includes it.

### Run path: a row IS its key's env name (replaces the shape-keyed lookup)

Today a run finds its key through the provider TABLE's built-in `envKey` (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`, `src/providers.js:267,277,284`) and an optional row override (`keyNameFor`, `applyConfiguredKey`, `src/providerrows.js:212-247`). After this piece there is NO built-in key name: the key is the row's `envName`, full stop.
- **The signed spec's fields do not change** (`provider` = the shape id, `baseUrl`, `model`; job.js `JOB_FIELDS`). `findRow(rows, {provider, baseUrl, model})` (providerrows.js:170-178) still resolves the row: same shape, same endpoint (`endpointOf`, which now has NO default host: blank means blank), and, when several rows share it, the one that HAS a ticked-and-priced line for `model`. No match = a plain refusal at $0: `<model> is not set up: put its key in your keys file and type its Base URL in Settings > Providers. Nothing was spent.` (fwd's third refusal, shape-adapted).
- `applyConfiguredKey` / `keyNameFor` / `usableKey` keep their names and callers (`userrun.js` 1195/1471-1493, `authorrun.js` 514-540/1118/1300, `interviewrun.js` 787-806, `authorsession.js` 628-630/804, `authorroutes.js` 145-160); the `builtIn` branch and every `resolveProvider(x).envKey` read (userrun.js:1477,1490,1493,1503; authorrun.js:516,540,1118; interviewrun.js:787; authorsession.js:630,804) are replaced by the row's `envName`. `envKey` leaves `PROVIDER_TABLE` (providers.js:267,277,284 and the typedef field at 232).
- `makeProvider(providerName, {apiKey, model, baseUrl})` (providers.js:359-374) gains `legacyMaxTokens` from the ROW (a plain option, only forwarded for `openai-api`); `OPENAI_MODEL_OPTIONS` (114-116) and `paramsFor` (233, 273, 280, 290) are deleted. Every caller that builds a provider from a row passes it: `buildRunnerProviders` (providers.js:408-430) takes `legacyMaxTokens`, called from `authorrun.js:582,1152`, `authorsession.js:811,917`, `userrun.js:1650` (via `makeProvider`) and the judge construction at userrun.js:1687.
- **Chat Model menu (ruling 8).** `GET /api/author/models` (`src/panel/authorroutes.js:181`) returns `{ok, lines:[{slot, model, label, thinking:{support, canChange, say}}], say}` — every ticked-and-priced line of a row whose key is set, label `<KEY> · <model>` (replaces `chatModels`, providerrows.js:196, whose label was `<id> · <envName>`); `say` is `Tick a model in Settings > Providers.` when none. The page (`loadModels`, index.html:4001-4013) shows `Reading your models…` while loading, `Could not read your models. Trying again…` on a failed read (re-reads by itself, 1.5 s apart, 5 times), then `Could not read your models. Reload the page.`. The card carries **`provider` (the key's env name) beside `model`**: `CARD_FIELDS` (authorsession.js:197) gains `provider`; the routes that took `?model=` (reuse-jobs index.html:3757, model-check 3966, start-from 3992, server.js `workerOfChoice` ~2398) take `?provider=` too; `modelChoiceFor(rows, {provider, model})` (providerrows.js, used authorsession.js:271,292,611 and server.js:2398) picks the row by env name and requires the line be ticked and priced. A stale pick is refused at $0 with fwd's three sentences: `Tick a model in Settings > Providers. Nothing was spent.` / `Pick a model. Nothing was spent.` / `<KEY> is not set up: put its key in your keys file and type its Base URL in Settings > Providers. Nothing was spent.` (replacing authorsession.js:622 `Model "…" is not a Name in Settings > Providers…` and :292 `Model must be one of the Names in Settings > Providers`).
- **Prices.** `ratesFor` / `judgeRatesFor` / `priceReadout` (providerrows.js:261-330) read the model LINE's `inPerM`/`outPerM` instead of `keys.<ENV>.priceInPerM/OutPerM`; the readout text `yours: in $… / out $… per 1M tokens (<ENV> row)` and the `$0` warning are unchanged. A line without both prices cannot be ticked, so it is never in Chat's menu. The existing `estimated` guess path (hamr's pricing-honesty ruling: no price available = guesstimate, run, say `estimated`) is NOT touched by this piece; it can only be reached through a spec or CLI path, see Open questions 2 and 3.
- **Money tab.** `tokensByRow` stays; `spendSummary` (monthly.js:293-352) gains `tokensByModel` (`{<ENV>: {<model>: tokens}}`, from the spend rows that name the model; absent = no row names it, never 0) for the model rows' Tokens column, and `byProvider` is grouped by the matched ROW's env name (label = the env name) instead of the vendor map (below); a run on no row lands under `other:<shape> @ <baseUrl>` as today.

### Thinking on (per job; drafting + the rubric judge; never the worker)

- **Where it is.** New job card, directly under Model (index.html:612-618): `<label class="jf-thinking"><input type="checkbox" id="jf-thinking" data-testid="jf-thinking"> Thinking on</label>` and a note line `<div class="hint" id="jf-thinking-note" data-testid="jf-thinking-note"></div>`. CSS: fwd's `.field label.jf-thinking{display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:6px;margin-top:6px;font-size:12px;text-transform:none;letter-spacing:0}` and `.field label.jf-thinking input{width:auto;min-height:0;margin:0}`.
- **Behaviour (the page decides nothing; the server's `thinking.canChange` per menu line does).** Unticked by default; per job; `Clear` unticks it; restored when a session is re-attached; changing the model keeps the tick if the new line allows it. `support === false` → the box is greyed AND unticked and the note reads `can't change this for this model`. `support === 'unverified'` → box enabled, no note. Sent with the card as `thinking: <bool>`; `card.thinking` joins `CARD_FIELDS`.
- **The signed field.** `job.js` `JOB_FIELDS` (job.js:170) admits `thinking` (a boolean, validated beside `model`, job.js:~330). The authoring draft writes `thinking: true` into the spec ONLY when ticked; an unticked job writes NO field. So an old spec, and any new unticked job, keeps the hash it would have had, and "field absent" means off. A ticked job's `jobSpecHash` differs (the field is in the resolved spec; it moves `workflowKey` like `model` does). `authorsession.js:890` builds `draft` (adds `...(card.thinking === true ? { thinking: true } : {})`); `buildReuseSpec` (authorsession.js:~268) keeps the origin's `thinking` (a Reuse card does not offer the tick: Reuse never drafts, and the judge follows the SIGNED value).
- **What gets sent.** NEW `src/thinking.js` (rewrite of fwd's): `thinkingSupport(shape, model, {baseUrl, impl})` → `true | false | 'unverified'` over bare-agent's own `thinkingSupport(kind, model, {baseUrl})` (shape → bare-agent kind map: `anthropic-api`→`anthropic`, `openai-api`→`openai`, `gemini-api`→`gemini`; a missing kind, a non-function `impl` or a throw → `'unverified'`); `THINKING_FIXED_SAY = "can't change this for this model"`. `src/providers.js`'s `thinkingKind` (138-145, with the DeepSeek regex at 142), `offOutcome` (154-160), `judgeCallOptions` (169-171), `draftThinkingSent` (199-202), `draftThinkingFor` (212-214), `draftCallOptions` (223-225), `DRAFT_THINKING_MODES`/`assertDraftThinking` (179-189) and the doc block 118-128 are replaced by ONE owner function in `thinking.js`, `thinkingOptions(support, tick)` → `{thinkingMode:'on'|'off'}` or `{}`. The table:

| tick | support true | support false | support 'unverified' |
|---|---|---|---|
| on | `{thinkingMode:'on'}` | `{}` (box greyed, cannot be on) | `{thinkingMode:'on'}` |
| off | `{thinkingMode:'off'}` | `{}` (model thinks as it would; the note says so) | OPEN QUESTION 1 |

  `thinkingMode: 'on'` with a forced `toolChoice` is rejected by bare-agent for some models (fwd's `drafter.js:395` therefore drops the forced tool when on); the drafter's structure calls must do the same (read `src/authorflow.js` `makeLoopGenerate` ~1606 and the `toolChoice` use before wiring; report what you find).
- **Call sites.** Drafting: `makeLoopGenerate(provider, {draftThinking})` (authorflow.js:1606-1608), `authorjob.js:424,449,499,600` (`draftThinking`, scout), `authorscout.js:403`, `authorsession.js:366` (`draftThinking = assertDraftThinking(deps.draftThinking ?? 'off')` → `card.thinking === true ? 'on' : 'off'`), 927-928 (generate/confirmGenerate), 970. The first drafting row (`thinkingRowText`, authorsession.js:120-124, built at 616-617) keeps its code-owned words and gains none. Judge: `defaultJudgeLoop({provider, system, rates, thinking})` (judged.js:1094-1112, today `judgeCallOptions(provider)` at 1110) takes the tick; its THREE constructors pass the SIGNED value: `planrun.js:1688` (the run), `authorrun.js:1173`, `authorsession.js:819` (the calibration gate, so the **10/10 calibration runs with the same tick as the later grading: that is the guard**). A judge on a different provider than the worker uses that provider's own `thinkingSupport`. The worker (`makeProvider` for the step loop, userrun.js:1650, and every tier provider) receives NO thinking option, as today.
- **Failure.** A bare-agent `ValidationError` from a drafting call is the stop `thinking-refused`, $0, never retried (fwd `drafter.js:~400-415`); bareloop's `authorflow.js` call wrapper must recognise it (`err instanceof ValidationError`, imported from bare-agent) and the plain-words card line says what the model refused. The draft log (`draft-log.jsonl` `call` entries, authorsession.js:562-570) records `thinking` and `thinkingApplied` as it does now.
- **`bareloop.context.md` must change to match (delivery item D1):** replace the "Drafter thinking knob … DEFAULT OFF" block (lines ~650-668) and the judge sentence (line ~70) with: the per-job "Thinking on" tick, the signed optional `thinking` field (absent = off, hash unchanged for old specs), the table above, drafting + judge follow the tick, the worker untouched, `thinking-refused`, and that bareloop keeps no per-model thinking list (bare-agent `thinkingSupport(kind, model, {baseUrl})`, ≥0.52).

### No hardcoded vendors, models, addresses or prices (code only)

**Found by running fwd's search (my own scan, code lines only, `src/` and `bin/bareloop.mjs`), verified by reading each line.** `GOES` = removed; `STAYS` = goes on the test's allow-list with its reason; `OPEN` = see Open questions.

| # | file:line | what | verdict |
|---|---|---|---|
| 1 | `src/judged.js:104` `JUDGE_MODEL = 'claude-haiku-4-5'` | a vendor model id; read by no grading path (only tests and `src/index.js:160`'s export) | GOES; also removed from the `src/index.js:151-160` export list (a public-API removal: CHANGELOG entry, `bareloop.context.md:91` sentence, the six tests that import it — `judged-stage`, `judge-model-pin`, `judged`, `judgedstrike`, `reviewdoor-u`, `calibrate` — take a literal fixture id instead) |
| 2 | `src/providerrows.js:17` `DEEPSEEK_BASE_URL` | vendor address | GOES |
| 3 | `src/providerrows.js:25-27` `SHAPES[].defaultUrl` (`https://api.anthropic.com/v1`, `https://api.openai.com/v1`, `''`) and `defaultUrlOf` (:117), `shownUrl` (:159), `endpointOf`'s default branch (:128) | vendor addresses | GOES (shapes live in `providershapes.js` with id+label only) |
| 4 | `src/providerrows.js:31` `PRESET_KEY_NAMES` (five vendor key names), used at `settingsroutes.js:19,115,125` | vendor key names; also seeds a fresh keys file with them | GOES; a fresh keys file gets fwd's comment body (below) |
| 5 | `src/providerrows.js:34` `LOCAL_BASE_URL` (`http://127.0.0.1:11434/v1`) | an address | GOES |
| 6 | `src/providerrows.js:62-66` `defaultsFor` per-key rows (`claude-sonnet-5`, `deepseek-flash`, the two bases) | vendor models/addresses by key name | GOES (`defaultsFor` deleted; defaults are the constants above) |
| 7 | `src/monthly.js:42-43` `MONEY_LABELS` and `:54-65` `rowIdFor` (shape → vendor, `api.deepseek.com` host test) | vendor labels and a host map | GOES (replaced by row-env-name grouping above) |
| 8 | `src/providers.js:34-37, 57-60, 76-79` the three `*_TIER_MODELS` tables, `:268,278,285` `tiers:` | vendor model ids per tier | GOES (see Open question 2: what replaces "tier") |
| 9 | `src/providers.js:114-116` `OPENAI_MODEL_OPTIONS` (`deepseek-flash` → `legacyMaxTokens`) and `paramsFor` (:273,280,290) | per-model table | GOES (the row's tick) |
| 10 | `src/providers.js:142` the `deepseek-`/`deepseek.com` regex in `thinkingKind` | vendor sniff | GOES, **blocked on bare-agent 0.52** |
| 11 | `src/providers.js:445-452` default `/models` URLs (`https://api.anthropic.com/v1`, `https://api.openai.com/v1`) | vendor addresses | GOES (`modellist.js` has no default host) |
| 12 | `src/userrun.js:402` `DEFAULT_TIER_MODELS` + `:408-410` `--model sonnet\|haiku` tier aliases, `argFlag('model')` :2663 | vendor ids / tier names | OPEN QUESTION 3 |
| 13 | `src/userrun.js:177-180` bench row `'bareguard-types-deepseek'` (key, spec filename `bareguard-u-types-deepseek.json`, workdir `…/bareguard-u-deepseek`, spine name) | vendor name in the bench patient table | GOES by rename: row key, spec file and patient path renamed to a vendor-free name (e.g. `bareguard-types-openai-shape`); the spec file under `jobs/` is renamed with it; hash UNCHANGED (file name is not in the spec) |
| 14 | `src/panel/settingsroutes.js:22-23, 135, 144-146, 217-231, 250-274` balance | `DEEPSEEK_BALANCE_URL`, `isDeepseek`, the balance routes | GOES (see "Balance goes") |
| 15 | `src/panel/settingsroutes.js:140` `canTest: r.provider !== 'gemini-api'` | per-shape special case | GOES (Test works for all three shapes through `modellist.js`) |
| 16 | `src/judged.js:208`, `src/userrun.js:549`, `src/authorrun.js:471`, `src/panel/server.js:2385`, `src/panel/authorsession.js:277, 890, 914` `…tiers.sonnet` | "the provider's default model" | GOES with #8 (a job always carries its model; OPEN QUESTION 2 for old specs) |
| 17 | `src/userrun.js:1667` `TIER_MODELS` from `providerEntry.tiers`, `src/authorrun.js:582,1152` + `authorsession.js:811,917` `tierModels: providerEntry.tiers` | tier→model map | GOES with #8 (OPEN QUESTION 2) |
| 18 | `src/plan.js:136` `STEP_MODELS = ['sonnet']` | a Claude tier name as a signed plan-schema value | OPEN QUESTION 4 |
| 19 | `src/bundle.js:466` bundle README text `set ANTHROPIC_API_KEY in your environment` | a vendor key name told to the user | GOES: names the bundle's own row key (OPEN QUESTION 5: what the bundle can say) |
| 20 | `src/job.js:332` message example `claude-sonnet-5` | a vendor model id in a user-visible string | GOES (reword: `non-empty string — the exact model id`) |
| 21 | `src/userrun.js:92` `const { AnthropicProvider } = require(...)` | a vendor class name; the import is UNUSED (verified: no other use in userrun.js) | GOES (dead import) |
| 22 | `src/providers.js:27, 139-141, 266, 276, 283` the three bare-agent class names | class names of the library, chosen by shape id | STAYS (allow-list: "the three client classes bare-agent/providers exports") |
| 23 | `src/providers.js:265,275,282` + `:89-91` (`PROBE_STATUS`) + `:445,451,489`, `src/job.js:162`, `src/config.js:63` (moves to providershapes.js), `src/panel/settingsroutes.js` header names | shape ids `anthropic-api` / `openai-api` / `gemini-api` and `x-api-key` / `anthropic-version` / `x-goog-api-key` | STAYS (allow-list: a shape is a wire protocol) |
| 24 | `src/ralph.js:139-140` `CLOSE_ENV_DENY.names` (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, …) | real secret env names the close must not inherit (a security denylist) | STAYS (allow-list: "real secret environment variable names stripped from a close's env"). Builder CHECK, report-only: a Settings row can be named anything, so confirm the denylist's `shape` rule (ralph.js:125-134) also strips a custom `<NAME>_KEY` row and report any gap — do not widen it (arbiter-adjacent) |
| 25 | `src/validate.js:193` `'Google/Gemini API key (AIza)'` | a label in the secret-shape inventory | STAYS (allow-list: "label of a secret shape") |
| 26 | `src/panel/index.html:7-9` font preconnect/stylesheet hosts | page font host | STAYS (as fwd: the only address in `src/` besides loopback) |
| 27 | `src/panel/authorroutes.js:72,139,189,207,227`, `server.js:2710,2975`, `importroutes.js:297`, settingsroutes.js:252 (goes with balance) `http://127.0.0.1` | the panel's own loopback address | STAYS (allow-list: loopback) |
| 28 | `src/panel/server.js:1050`, `src/panel/index.html:1182` the word `synthetic` | not a vendor (a step flag) | n/a: bareloop's search drops fwd's `\bsynthetic\b` / `synthetic\.new` terms |
| 29 | `src/job.js:682` the word `incoherent` | false hit on `cohere` | n/a: bareloop's search uses `\bcohere\b` |
| 30 | `src/config.js:12, 71` comment lines naming `anthropicBalanceNote` etc. | comments | n/a (code only); rewritten anyway |

Grep yourself for anything else before the test goes in (`src/**/*.js`, `src/panel/index.html`, `bin/bareloop.mjs`; the test scans code lines, not comment lines, and its allow-list is the ONLY exemption). Anything found beyond this table is added to the report and, if it needs a hamr decision, to Open questions; the builder does not decide it.

**The test** (NEW `tests/no-hardcode.test.js`, rewritten from fwd's `test/m4d-am6-e.test.js`): walks `src/` and `bin/bareloop.mjs` (`.js .mjs .html .json`), drops comment-only lines (`//`, `/*`, `*`, `*/`, `<!--` after trimming) and a trailing `// …` comment, and fails on: a provider name (fwd's list plus the tier words `haiku`, `sonnet`, `opus` and `ollama`, with `\bcohere\b`, minus `synthetic`), a model name (fwd's `MODEL_NAMES`), a web address, a price (fwd's `PRICES` + `RATES_BY_SUFFIX|CEILING_TABLE_USD|defaultModel`). `ALLOWED` entries (`{file, re, why}`, `why` ≥ 20 characters) are the STAYS rows above. Three tests: E1 the tree is clean after the allow-list; E2 it CAN fail (a planted provider, model, address and price are each found); E3 every allow-list entry names an existing file and is actually used (a stale entry would hide a future hit). The test runs through `npm test` (hermetic) like every other.

**New keys-file body** (replaces `ensureKeysFile(PRESET_KEY_NAMES)`, keysfile.js:85-100, called at settingsroutes.js:115): created only when the file does not exist, mode 600, dir 700, exactly: `# bareloop keys — type NAME=value by hand; this file is never shown or written by bareloop.` / `# One line per provider key, e.g. MY_PROVIDER_API_KEY=... ; each key becomes a row in Settings > Providers.` The `ensureKeysFile(presetNames, home)` signature loses `presetNames` (its callers: settingsroutes.js:115 and its tests).

### Balance goes (every line)
`src/panel/settingsroutes.js`: 22-23 (`DEEPSEEK_BALANCE_URL`), 43 (`hostOf`, used only here), 120 (`const note = cfg.config.anthropicBalanceNote`), 135 (`isDeepseek`), 144-146 (the `balance:` field), 217-231 (`POST /api/settings/providers/balance-note`), 250-274 (`GET /api/settings/providers/balance`). `src/config.js`: 4 and 12 (comments), 70-71 (doc), 89-91 (`anthropicBalanceNote` validation), the `updateConfig` passthrough of that field. `src/panel/index.html`: the `<th>Balance</th>` (834), 3511-3513 (the cell), 3528-3533 (the DeepSeek fetch), 3555-3559 (the balance-note save). `bareloop.context.md`: 3855-3856, 3940, 3962-3964 (the `.../balance-note` and `GET .../balance?env=` mentions). Tests: `tests/settings-providers.test.js` and `tests/monthly.test.js` (the `anthropicBalanceNote` cases) are deleted or rewritten to assert the routes answer `Settings cannot do that. …` and the field is gone from a new write.

### Batches (one sonnet builder, pin `model: sonnet`, no sub-agents, commit per item, hermetic `npm test` only, `~/.config/bareloop/runs.jsonl` line count before/after in every report; scratch HOME, never the real one)

1. **Config + shapes + rows (no screen).** NEW `src/providershapes.js`; `src/config.js` new shape, validators, `updateConfig` (models patch, legacy-field removal on first write, `anthropicBalanceNote` gone); `src/providerrows.js` rewritten: `KeyRow` = `{envName, provider, baseUrl, legacyMaxTokens, models}`, `effectiveModels` (read rule above), `tickedLines`, `findRow`/`modelChoiceFor` (by env name + ticked priced line), `endpointOf` with no default host, `defaultsFor`/`DEEPSEEK_BASE_URL`/`LOCAL_BASE_URL`/`PRESET_KEY_NAMES`/`defaultUrlOf`/`shownUrl` deleted, `ratesFor`/`judgeRatesFor` read the line price. Tests: NEW `tests/config-providers.test.js` (read of an old `keys.<ENV>.{name,priceInPerM,priceOutPerM}` → one `use:true` line; half price → `use:false`; no name → no lines; first write drops the legacy fields; `modelsProblem` sentences; secret-shaped string refused; no host sniff: a `deepseek` host sets nothing), update `tests/customer-price.test.js`, `tests/judge-key-demand.test.js`, `tests/p5-startfrom.test.js`, `tests/panel-edit-chat.test.js`, `tests/settings-providers.test.js` for the new row shape. Exit: those suites green via `npm test`.
2. **Model list + Settings routes.** NEW `src/modellist.js`; `settingsroutes.js` rewritten to the route table; `checkProviderReachable` delegates to `modellist.js`; `ensureKeysFile` body; `spendSummary` `tokensByModel` and row-env-name grouping (`monthly.js`, MONEY_LABELS/rowIdFor gone); balance gone. Tests: NEW `tests/settings-routes-p8.test.js` (every text above word for word; refusals leave config byte-identical; 0/0 accepted; `cachedInPerM` refused; redirect not followed; key only in the header, never in a response; 4 s abort; `no-path-allowed`; shell-only row only when config names it; unknown route sentence), update `tests/settings-reload.test.js`, `tests/settings-money.test.js`, `tests/monthly.test.js`, `tests/draft-spend.test.js`, `tests/providers.test.js` (the `checkProviderReachable` cases).
3. **The page.** Providers tab markup/CSS/JS per "What the person sees"; Test + Open keys folder; fold/summary rules; both layouts. Tests: update `tests/panel-page.test.js` and `tests/settings-providers.test.js` page cases; NEW `tests/panel-providers-layout.test.js` (the grid tracks string, the two breakpoints, every `data-testid`, every visible sentence present in the served HTML). Then my screenshots at 1920 / 1280 / 1279 / 1024 / 780 / 390 / 320.
4. **Run path + Chat Model menu.** The "Run path" section: key = row env name, `legacyMaxTokens` from the row, `provider` on the card, `/api/author/models` lines, `loadModels`, the three refusals, `envKey`/`tiers`/`OPENAI_MODEL_OPTIONS`/`paramsFor` out of `PROVIDER_TABLE`. Items needing OPEN QUESTIONS 2 and 3 are NOT done by guess: the builder stops at them and reports. Tests: update `tests/panel-author.test.js`, `tests/cli.test.js`, `tests/run-author.test.js`, `tests/cli-run-u.test.js`, `tests/providers.test.js`; NEW `tests/model-menu-p8.test.js` (only ticked+priced lines, label `<KEY> · <model>`, the empty/failed texts, a stale pick refused at $0 with all three sentences, two keys ticking the same id resolve by `provider`).
5. **Thinking on.** BLOCKED until bare-agent 0.52 is on npm. First step when unblocked: bump `bare-agent` in `package.json` and `package-lock.json` (CLAUDE.md names `^0.51.0` today), clean-install check of the peer ranges (bare-agent vs bareguard has reded CI before), full gate. Then NEW `src/thinking.js`, `providers.js` thinking block removed, `job.js` `thinking` field, card + page tick, drafting + judge wiring, `thinking-refused`, `bareloop.context.md` (D1). Tests: NEW `tests/thinking-tick.test.js` (table above incl. the REAL bare-agent answers, not a stub: a measured not-switchable model → `false`, an unknown model → `'unverified'`; unticked job writes no field and keeps its pre-feature hash; a ticked job's hash differs; judge follows the signed tick in all three constructors; the calibration run uses the same tick; worker provider gets no thinking option), update `tests/providers.test.js`, `tests/authorjob.test.js`, `tests/panel-author.test.js`, `tests/run-author.test.js`. A test that calls a stub in place of bare-agent's `thinkingSupport` is not accepted as proof (a stub can read green with and without the fix).
6. **Remaining hardcodes.** Rows #1, #13, #19, #20, #21 of the table (and #12, #18 only after hamr answers OPEN QUESTIONS 3 and 4); `JUDGE_MODEL` out of `src/index.js`. Tests: the six JUDGE_MODEL tests above; rename of the bench row in `tests/cli-run-u.test.js` if it names it.
7. **The grep test + docs.** NEW `tests/no-hardcode.test.js` with the allow-list; the table's grep-yourself sweep; docs D1-D5 below. The test goes in LAST: it must be green only because the hardcodes are gone, never because the allow-list grew to cover them.

### Docs (delivery items)
- D1 `bareloop.context.md` (adopter contract, ships): the Settings section (3841-3970) rewritten to the new config shape, rows, routes, Test, no Balance; line 164 (`model` example and "Absent means today's runner default"); 366 and 3732 (`steps[].model` / `--model <sonnet|haiku>`, per OPEN QUESTIONS 3-4); 91 (`JUDGE_MODEL`); 1912-1915 (`keys.<ENV NAME>.priceInPerM` → the model line price); 650-668 and 70 (thinking, see above).
- D2 `CHANGELOG.md`: Added (Thinking on tick, model lines, Test), Changed (config shape, Chat Model menu, Providers page), Removed (Balance, built-in tiers/keys/addresses, `JUDGE_MODEL` export), **Breaking** note for the config shape and for specs that relied on a built-in default (OPEN QUESTION 2).
- D3 `docs/logs/FINDINGS.md`: one entry per live defect found while building this, grounded in source or the event log.
- D4 `docs/product/PRD.md`: ONE-LINE ticks with pointers to this addendum (no run ids, dollar amounts or KB numbers in the PRD).
- D5 `CLAUDE.md` project file stays accurate (bare-agent range after the 0.52 bump).

### Responsive rule and Done
Verify at **1920 / 1280 / 1279 / 1024 / 780 / 390 / 320** wide (barebrowse cannot emulate a phone width: widths ≥780 by the builder/orchestrator, **390 and 320 are hamr's own DevTools check — name that gap, never claim it checked**). No horizontal PAGE scroll at any width (the `.table-wrap` may scroll itself at 1280-1400 if its tracks need it); the 272px button track fits `[ Test ] [ ⟳ Refresh ]`; <1280 shows `label : value` lines with 44px controls; the KEYS strip stacks <900px. Screenshots are the orchestrator's precondition, not the sign-off.

**Done means:** gate green on HEAD (typecheck, build:types, `npm test`; the three exit codes and the last line quoted), the grep test green with its allow-list printed, my own screenshots at the seven widths, runs.jsonl line count unchanged, and **hamr clicks through it himself**: ticks "old max_tokens" on his DeepSeek row and types its shape/Base URL, presses Test and Refresh, ticks a priced line, opens a New job card, sees the Model menu list only that line, ticks "Thinking on" and unticks it. No "done/release" claim before that. One paid DeepSeek (deepseek-flash) drafting run proving the tick reaches the wire is proposed separately with its $0 archive-read premise and a stated cap.

### Not in this piece
Splitting `tests/planrun.test.js` (no ruling when this was written; split on 2026-10-11, 5d66d5e). A Balance replacement (fwd's is "replaced by nothing"). Changing what a signed spec stores for provider/baseUrl/model. Adding or removing rows from the page. Worker thinking. Any change to budgets, caps, verdicts, the monthly limit logic or the close (arbiter territory).

### Open questions for hamr — ALL RULED (hamr 2026-10-11)
Each was answered by hamr in conversation on 2026-10-11; the batches that depended on them are updated below the list.

1. **RULED — 'unverified' model, Thinking unticked → send `thinkingMode:'off'` (fwd's way).** hamr: "they [bare-agent] manage unknown and can tell you if they can turn thinking off or not". bare-agent 0.52 tries the off shapes, then one plain request (`unsupported`), so drafting does not break. bareloop records bare-agent's answer (`thinkingApplied` / `unsupported`) in the draft log and on the thinking row, as the existing row does. Table cell (off, 'unverified') = `{thinkingMode:'off'}`.
2. **RULED (b) — old specs with no `model` / `baseUrl`:** ask for the model at run start (a Settings line picked on the run/resume card); the old spec runs with it, hash untouched. Bundles (`src/bundle.js`) and bench rows that carry such specs follow the same rule.
3. **RULED (a) — CLI:** `--model <id>` of a ticked line (plus `--provider <KEY>` when two keys tick it), fwd's `pickTicked` sentence `Name the model with --model <id>: one ticked in Settings > Providers with both prices.`; the `sonnet`/`haiku` aliases and `DEFAULT_TIER_MODELS` are deleted; a spec's own `model` still wins. The CLI interview (`interviewrun.js`) follows.
4. **RULED — `STEP_MODELS = ['sonnet']` stays** as a documented schema token on the no-hardcode allow-list (no hash move, no schema change).
5. **RULED — bundle README is generic, no vendor.** hamr: "use generic api so users won't be confused". Text like `Put your provider's API key in your keys file (the NAME your Settings row uses).` No new signed field.
6. **RULED — the `null` no-key marker keeps working** for local LLMs; the row shows `set in file` with the green tick.
7. **RULED — a name with no price is an UNTICKED line**, as intended.
8. **RULED — the page is fwd's LATEST `m4d-am3` UI** (the tip, not `a334e6c`), including the Test placement: `[ Test ] [ ⟳ Refresh ]` in the key row's last track, and Open keys folder in the KEYS strip.

**Batch changes from these rulings.** Batch 4: Q2 (b) is built as "pick a Settings line at run/resume start" and Q3 (a) as `--model <id>` / `--provider <KEY>`; both are no longer stop points. Batch 5: table cell (off, 'unverified') is `{thinkingMode:'off'}`. Batch 6: #12 (`DEFAULT_TIER_MODELS`, tier aliases) goes per Q3; #18 (`STEP_MODELS`) STAYS on the allow-list per Q4; #19 bundle README text is generic per Q5. Batch 3: the page is read from the latest `m4d-am3` tip.

## Addendum 2026-10-13 — P9: one runs list — SUPERSEDED by the 2026-10-14 addendum below

The 2026-10-13 draft (box F of `design/runs-list-mock.html`) is replaced in full by "P9 v2" below. Its mockup stays on disk as history only. Its one RULED item (Accept is a label, the left list has no controls) is kept in P9 v2, item 4.

## Addendum 2026-10-14 — P9 v2: the runs list copied from fwdloop M11 (SIGNED 2026-10-14)

hamr, 2026-10-14: "their cards look better, i want their shape and design, match their ui, their breakdown of tags; only exclusion is scheduled... build it until we get scheduled."

So this is a COPY of fwdloop's FINISHED M11 runs list (fwdloop v0.19.0). The Scheduled section is drawn in the signed mockup; P9 builds the empty slot after Needs you; the triggers piece (PRD v1.99) fills it. Mockup: `design/runs-list-mock-v2.html` (desktop and 390 px phone), drawn from fwdloop's `docs/product/m11-runs-list-mock.html` with job names, run-N and signs from bareloop. fwdloop paths below are under `~/PycharmProjects/fwdloop`; "fwd spec" is `docs/wiki/the-module-ladder.md` "M11" (lines 2280-2329). bareloop never edits fwdloop. The old 2026-10-13 mockup is not touched.

### A. Hard rules (fwdloop paid for each one)

1. **Build only what the mockup shows.** No invented tags, sections or behaviours. If the mockup does not draw it, it is not built. (fwd spec am1, 2321; hamr: "follow the design ui, do not invent anything outside of it and verify it".)
2. **The server decides every state. The page derives nothing.** Live, Needs-you tag, job order, quiet split, limits all come in `GET /api/runs`. (fwd spec 2315; `src/panel/server.js:513-522`.)
3. **One owner per answer.** `Resume` uses the SAME answer the Run page's Resume card uses (`resumePlanFor`, `src/panel/server.js:320`). No second rule.
4. **Pill is a label, never a button.** The left list has no controls. (RULED by hamr 2026-10-13, kept; see item 4.)
5. **Lines clip with an ellipsis** (nowrap). The full text is on the run page. (fwd `4214dbf`; CSS `.rl-l2`, `.rl-nm`, fwd `index.html:260-262`.)
6. **One date format everywhere:** local `MM/DD HH:MM`. A date that cannot be read is shown raw, never blank. (fwd `rlShortDate`, `index.html:1791`; `runAtText`, 1797.)
7. **Unknown is never zero.** A cost bareloop cannot price reads `unknown`, never `$0`. A job whose age cannot be read is never "quiet".
8. **A repaint writes only when the markup changed**, so focus, scroll and fold state survive a poll. (fwd `rlLast`, `index.html:1846`, `paintRunsList` 1963.)
9. **Search reads the whole visible row** (see item 12). fwd had to fix this after hamr said "search not working" (fwd spec am4 item 3, 2327).
10. **Limits live on the server; the page has no literal 7 or 30 for them.** A test pins this. (fwd `RUNS_LIST_LIMITS`, `src/panel/data.js:1191`; test `m11-b-page.test.js:315`.)

### B. What the left list becomes (top to bottom; a section with 0 items draws nothing, not even its header)

1. **Running now (N)**: every live run, one card each. Line 1: `[▶] job run-N  <wall> · <$>`. Line 2: the plain why (for example `step 2 of 3`), clipped. The wall counts up in place every 2 s from the server's start time, with no rebuild of the card. A cost that is not known reads `unknown`. Line 1 is never a long reason. Amber border (`.rl-live`). Click: select that run, open the Run tab, scroll to its job card (`rl-job-<job>`). Not filtered, not searched. (fwd `rlJumpCardHtml`, `index.html:1892`; `tickSince`, 1956; `rlJump`, 1976; fwd spec am1 item 1, 2319.)
2. **Needs you (N)**: runs that need the person. Blue border (`.rl-need`). Line 1: `[sign] job run-N` and a pill at the right, `Accept` or `Resume`. Line 2: `why · MM/DD HH:MM`. Click: as Running now. Not filtered. (fwd spec am1 item 2, 2320; `rlJumpCardHtml` need branch.)
3. **Scheduled is drawn in the signed mockup; P9 builds the empty slot after Needs you; the triggers piece (PRD v1.99) fills it.** The `Scheduled (N)` section (card: `[·] job  today 15:00` / `next in 3h · Every day at 15:00`, soonest first, a file trigger shows only its words and sorts last, a click opens the job's newest run on the Run tab) slots in right after Needs you. The code is shaped for it: the page model already takes `scheduled: []` from the payload and `rlTopHtml` draws its sections from one ordered list (Running now, Needs you, then any Scheduled). Adding it later is one more entry in that list plus one more draw function. It is never filtered, as in fwd. Until then the payload has no `scheduled` and nothing is drawn.
4. **A dashed line** (`.rl-dash`), a faint line `filters below act on Jobs and quiet jobs only` (`.rl-faint`), then bareloop's existing filter bar (search box and chips), moved here. (fwd `index.html:1118-1122`.)
5. **Jobs (N) · run in the last 30 days**: one card per job, newest activity first. The 30 is the server's `quietDays`.
6. **`▸ quiet jobs (N) · no run in 30 days`**: one folded line; open shows those job cards, same shape as Jobs.
7. **Section headers** are bold, normal case, 12 px, in the dim text colour, with the count: `Running now (2)`. `Jobs (N)` adds ` · run in the last 30 days`. NOT the small uppercase letter-spaced header of the old mockup. (fwd `.rl-sect`, `index.html:185`; fwd spec am3 item 3, 2325.)

### C. The cards (copy fwd's shapes)

1. **Job card**: a box, not clickable, id `rl-job-<job>`, testid `rl-job-<job>`.
   - Line 1: `[sign] job · k runs · deterministic`. The count (`.rl-cnt`, faint) is the SAME size as the job name, with a ` · ` between. The sign is that of the job's head run (item 2 of section D). bareloop keeps its check type; it sits after the count, in the same faint `.rl-cnt` style. It is the head run's `checkType`; when that is `unknown` nothing is drawn. (fwd spec am3 item 2, 2324; `rlJobCardHtml`, 1925. The check type is the one thing bareloop adds to fwd's card, from the 2026-10-13 draft.)
   - Line 2: `word · why` of the head run (the word bold). A passed run with no reason reads `goal met`.
   - Highlighted (`.rl-sel`) when the selected run belongs to this job.
   - A job with no run yet: one plain card with the server's sentence. Never a made-up row.
2. **Run card** (inside a job, `.rl-runs`, indented, left rule): a button, testid `rl-run-<job>-<runid>`, `aria-pressed`.
   - Line 1: `[sign] run-N  MM/DD HH:MM · model`.
   - Line 2: `word — why · $cost · wall`. Unknown cost reads `unknown`. Resume count: the existing `resumed ×N` tag is dropped from the left list (it is on the Run tab); the mockup does not draw it.
   - Selected: blue border and blue fill (`.rl-sel`). Click: `selectRun`, Run tab (the old click). (`rlRunCardHtml`, 1917.)
   - A row whose spine is missing: line 2 reads `file missing`, no cost, no wall. A row still starting: `[▶]`, line 2 `starting…`. Both count in `k runs`.
3. **Names** are the existing `job (run-N)` rule. `runNo` comes from the server (`runNumbers`, `src/panel/server.js`); the page never counts. Signs and words come from `src/panel/status.js` (one table: `[▶] running`, `[·] waiting`, `[✓] passed`, `[✗] failed`, `[✗] capped`, `[■] stopped`, `[?] died`). A died run is `[?]`, never `[✗]`.
4. **CSS: copy fwd's block** (`index.html:248-277`), values unchanged. Names: `.rl-card`, `.rl-sel`, `.rl-live`, `.rl-need`, `.rl-l1`, `.rl-l2`, `.rl-nm`, `.rn`→`.rl-rn`, `.rl-cnt`, `.rl-runs`, `.rl-fold`, `.rl-hint`, `.rl-pill` and `.rl-pill-need`, `.rl-dash`, `.rl-faint`, `.rl-sect`, and the `:focus-visible` outline (2 px accent, 2 px offset). Phone: `.rl-fold{min-height:44px}` under 900 px; cards are 44 px tall at least.
   - **One addition, not in fwd:** `.rl-hit` marks a run that matches the active search or filter (item 8 of section D). Style: the normal card plus a 3 px accent bar on the left (`box-shadow:inset 3px 0 0 var(--accent)`). It is not the selected look.
5. **testids** (copied, flow→job): `rl-top`, `rl-filter-note`, `wf-list`, `rl-live-<job>-<runid>`, `rl-need-<job>-<runid>`, `rl-job-<job>`, `rl-run-<job>-<runid>`, `rl-fold-<job>`, `rl-fold-quiet`.

### D. The fold, the filters, the quiet split

1. **Fold `▸ older runs (k)`**: k = all older runs of that job. Shut by default.
2. **Job head = the job's newest run BY TIME**, picked explicitly on the server (`headRunid` per job). Never "the first row in server order". fwd's parked bug: an old stuck run led its job. Older runs follow newest first.
3. **Open shows at most 7 older runs** (`limits.olderRuns`), then `(and k older: use search)` in `.rl-hint`.
4. **RULED (A), fwd's wording, verbatim:** "show the 7 + the selected run + the ONE newest older match past the 7; the fold opens when any older run matches."
5. **The fold opens by itself** when ANY older run matches an active search or filter (even if the head matches too), or when the selected run is an older one. A manual click wins over the automatic open. (fwd `564bb0a`, `070029d`; `rlModel`, `index.html:1851`.)
6. **bareloop's `autoExpandJob`, `representedRun`, `activeOlderRun`, `wfExpanded`, `WF_SUB_CAP` and `capSubRuns` are REPLACED, not reused.** Their head-only rule ("open only when the head does not match") is the rule fwd proved wrong. `representedRun` goes too: a job card no longer stands for a matched older run. Selection changes only on a click.
7. **"The job opens on the match" means exactly this:** the fold opens, and the matched older run is highlighted (`.rl-hit`). It is NOT selected. A matched run past the 7 (the one newest match) is shown and highlighted too. Other matches past the 7 stay hidden and are counted in the hint. fwd left the past-the-cap highlight as a gap; we close it.
8. **Search reads the WHOLE visible row**: job name, `run-N`, `job (run-N)`, run id, model, the status word, the why, the date text and, for a job card, the check type. Case does not matter. Today bareloop's `matchesSearch` (`src/panel/index.html:1653`) reads job, run id, model and `run-N` only; it is widened to the rest. It is ONE function, used by both the match test and the highlight, so they cannot disagree. The word chips (D, R, ✓, ✗, ?, ▶, 7d, 30d) and `clear` stay as they are; they AND with search as today.
9. **Filters act on Jobs and quiet jobs only.** Never on Running now or Needs you. A job shows if ANY of its runs match (`filterWorkflows` over `filterRuns`, kept: it is already correct against the job's full run list).
10. **Chip order is an array**, declared once and sent/drawn in that order: `D, R, ✓, ✗, ?, ▶, 7d, 30d, all, clear`. Never object key order.
11. **Search placeholder is short** so it never clips at 320 px: `search jobs and runs…` (replaces `search job, run-N, run id or model…`).
12. **Quiet is the server's call.** A job is quiet only when its newest KNOWN activity time is more than 30 days old. Unknown age is never quiet. A job with a live run is never quiet. A quiet fold opens by itself if the selected run is inside it; a manual click wins.
13. **Limits** `{quietDays: 30, olderRuns: 7, needsYouDays: 7}` are one frozen constant on the server (`RUNS_LIST_LIMITS`, new, `src/panel/server.js`) and travel in the `/api/runs` payload. The page reads `limits.*` only.
14. **A live run moving between sections is fine.** It leaves Running now for Needs you or Jobs when the server says so on the next poll. The page only renders.

### E. Needs you: the tag breakdown for bareloop

1. **`Resume`** = a stopped run whose Resume the engine would accept: the plan `resumePlanFor` returns with `ok: true`. That is the answer the Run page's Resume card shows. The list row reuses the `resume` value `endedForRow` already computes inside `summarizeRow` (`src/panel/server.js:714`, `endedForRow` at 627), so the Resume rule is asked once per row, not twice. Which runs: any non-live run that is not green and whose ending a resume can apply to (stopped, capped, died, an escalation with a checkpoint). A stopped run with no Resume button (job edited, worktree gone, checkpoint expired) is not in Needs you; it shows only under Jobs.
2. **Gate the work.** `resumePlanFor` reads spine records and spec files, so it is asked only for non-live, non-green rows that can be resumed, the same gate the Ended block uses (`maybeResumable`, `src/panel/server.js:629`). A live or green row never reads spec files.
3. **`Accept`** = a run waiting at the review door for the person's Accept. **FINDING (looked at the source on 2026-10-14): the panel has no such state today.** The library opens the door as one `review-door` record on the run's spine (`doorRecordOf`, `src/reviewdoor.js:48`) and says whether it is still open with `doorAgeGate` (`src/reviewdoor.js:64`, 60-day TTL). The panel never reads either: there is no `#btn-accept` ("not in this part", this file, the mockup table at line 782) and no door code under `src/panel/`. The Run page therefore has no Accept answer to share.
   - **RULED (hamr 2026-10-13), kept:** Accept lives only on the Run tab; the left list has NO controls; the `Accept` pill is a label.
   - **So in P9 v2 the `Accept` pill is not built.** `needs` is `'Accept' | 'Resume' | null` in the payload shape, but only `Resume` is ever produced. When the Run tab gets its Accept control (rubric work), the SAME function that tells the Run tab "show Accept" (door record present, `doorAgeGate` ok, no `door-decision` record after it) fills `needs: 'Accept'` too. One owner. Accept never ages out of Needs you by the 7-day rule (the door has its own 60 days). The card line 2 for Accept reads `passed · waiting for your Accept · MM/DD HH:MM` (as in the mockup). The mockup draws Accept so hamr sees the final shape; the build leaves it out.
4. **Resume ages out 7 days after the run stopped.** Exactly 7 days = out. A run with no readable stop time stays in. The stop time is the `ts` of the spine's last `job-end` record (`lastJobEndTs`, `src/panel/server.js:619`); a died run has no `job-end`, so it is the `ts` of its last record. Past 7 days the run leaves Needs you only. It stays under Jobs and its Run tab still has Resume. (fwd `needsYouTag`, `src/panel/data.js:1182`; fwd spec am3 item 5, 2327.)
5. **A third tag, `Check` (RULED 2026-10-15, triggers T item 11).** A scheduled job whose schedule gave up (install-needed for 60 minutes) shows in Needs you from the server's `gaveUp` list, not from a run's `needs`: line 1 `job` and the pill `Check` (hamr may reword), line 2 `<refusal words> · MM/DD HH:MM`, a click opens the job's newest run. It never ages out; a re-sign through Cancel / modify schedule or a cancel clears it.
5. **fwd's stuck `[II]` / saved-answer rule (am4 item 1) does not apply.** bareloop has no saved-answer state and no `[II]` sign. Not copied.
6. **Pill colour:** blue (`.rl-pill-need`), at the right of line 1 (`margin-left:auto`).

### F. The payload (what the server sends)

`GET /api/runs` (`src/panel/server.js:2840`, today `{runs}`) becomes `{runs, jobs, limits}`. (A `scheduled` array joins later.) The key `runs` stays so the other callers keep working; fwd's name is `rows`, bareloop's is not renamed.

- Per run, new: `live` (true only when the run has no `job-end` and `runIsAlive`), `needs` (`'Accept'|'Resume'|null`), `stoppedAt` (the stop time of E.4, or null), `liveSince` (ISO start of the current leg, only when live) and `priorWallMs` (wall of earlier legs, so a resumed run's wall does not count the gap between legs). `model` already exists.
- `jobs`: `[{job, headRunid, quiet, activityMs}]`, newest activity first. Activity = the newest known time over the job's runs (`stoppedAt` else `at`). Ties by job name.
- `limits`: `RUNS_LIST_LIMITS`.
- The page keeps ONE writer of the data (fwd `setRunsData`, 1848) and ONE reader of it (`rlModel`).

### G. Refresh, memory, what goes away

1. **Repaint only on change** (A.8). The top box (`#rl-top`) and the jobs box (`#wf-list`) each keep their last markup; an identical poll writes nothing. Focus is kept across a real repaint by testid (fwd `withFocusPreserved`, `index.html:3104`).
2. **Fold state is in memory** (a plain object keyed by job; `__quiet` for the quiet fold). A page reload resets it. The filter bar keeps its own saved state as today.
3. **Removed:** the Workflows / History switch, the flat History list (`renderHistory`, `#history-list`, `data-runs-view`), `runsViewMode`, and the `bareloop-panel-runs-view` localStorage key (no longer read or written; a leftover value is ignored). The Audit tab's own Grouped / Flat stays. The Import button and the imported-jobs list (`#wf-import`, `#import-list`) stay where they are, under the list, unchanged (P5 rulings).
4. **Empty text** in the Run pane `#run-empty` (`src/panel/index.html:816` and `:1977`) changes from `select a run from Workflows or History` to `select a run from the Runs list`.
5. **Empty list:** `no runs listed yet`.

### H. Phone

The same stacked list, not dropdowns. Cards are at least 44 px tall; the fold is 44 px under 900 px. No sideways scroll at 1280, 390 or 320 px. hamr checks 390 and 320 in his own DevTools (barebrowse cannot emulate a phone width; say so, never claim it).

### I. Code shape (copy fwd's)

A pure page model, separate draw functions, one painter, one delegated click handler. Names follow fwd: `setRunsData`, `rlModel(data, groups, filters, limits, sel, open)` (pure: payload in, cards out), `rlSectHtml`, `rlJumpCardHtml`, `rlTopHtml`, `rlRunCardHtml`, `rlJobCardHtml`, `rlJobsHtml`, `tickSince`, `paintRunsList`, `rlJump`, `rlClick`, `rlShortDate`, `runAtText`. `rlTopHtml` builds its sections from one ordered list so Scheduled can be added after Needs you without touching the rest. `groupRunsByJob` is rewritten to take `headRunid` from the server. One delegated click listener on `#panel-runs` handles fold, jump and run card. The sign is drawn from the dot class as everywhere on the page.

### J. Tests (mirror fwd; they must fail first)

New files `tests/panel-runs-list-a-server.test.js` and `tests/panel-runs-list-b-page.test.js`. Page functions are pulled out of `index.html` BY NAME with a brace-scan helper (fwd `m11-b-page.test.js:12-22`, `fnSrc`), never `indexOf('\n  }\n')`, which broke about 15 fwd tests silently. Tests run via `npm test` only.

From fwd `test/m11-a-server.test.js` (server): 
- `needsYouTag`: one rule, every sign. → bareloop: Resume only; Accept stays null until the door state exists (a test pins "no Accept today").
- a Resume run leaves Needs you 7 days after it stopped (exactly 7 days = out); no readable time stays in.
- `listRuns`: now is injectable; an old stopped run carries no tag but its Run tab still has Resume.
- a stopped run with the Resume button carries Resume; once the job is edited (no button) it carries none. A cap-halted run that can continue carries Resume (same `resumePlanFor` answer).
- every row carries the model its books name (null when none ran).
- `summarizeJobs`: newest activity first; quiet only when known and older than 30 days; unknown age never quiet; a job with a live run never quiet.
- `headRunid` is the newest run by time, not the first in server order (the fwd parked bug).
- limits: 30 days, 7 runs and 7 days are named once on the server.
- `GET /api/runs` carries runs, jobs and limits over real HTTP.
- `resumePlanFor` is not asked for a live or green row (gate).

From fwd `m11-b-page.test.js` (page): order and hiding (a 0-item section draws nothing); Must-fail: a filter or search hides a Running now or Needs you card; the tag is the server's (page works out nothing from the sign); cards: jump cards jump, the tag is a label, lines per section C; Running now unknown cost reads `unknown`; Must-fail: a job's 9th-newest run shows without search (9 runs = newest + 7 older, then `(and 1 older: use search)`); a selected run past the 7 is still shown; with the fold shut a selected older run opens it; search for an older run opens the fold with the match highlighted, and the job card still describes its newest run; search when the head also matches keeps the older match past the 7; 20-run job, search `run-2`; 300-run job, search `run`: only 7 shown, hint 292; the selected run past the 7 AND a different newest match past the 7: both shown (9); no search: 7 shown and not auto-opened; lines clip (nowrap + ellipsis); the quiet split is the server's; the limits are the server's (3 shown when the payload says 3); card shapes; a job with no run is one plain card; book text is escaped; the old view is gone (no switch, no History list, no saved view key, no second copy of the run card); no literal 7 or 30 in `rlModel` / `rlJobsHtml`; refresh writes nothing when nothing changed; a jump selects the run, opens the Run tab and scrolls to the job card.
From fwd `m11-am3.test.js`: the header is one rule (bold, normal case, no letter-spacing); the count on a job card is the name's own size.
From fwd `m11-am4.test.js`: the Runs search test is rewritten (we widen it, see D.8). Inbox items there do not apply.
New for bareloop: search reads the whole row (word, why, model, check type, date); search and highlight use one function; a matched run past the 7 is highlighted; chip order is the declared array; the placeholder is under 24 characters; the check type shows on the job card and is omitted when unknown; a missing-file row and a starting row draw; `Accept` pill draws when the payload says so (draw-only test).
Existing tests that read the old view get rewritten, not deleted blind: `tests/panel-history-filter-clicks.test.js`, `tests/panel-page.test.js`, `tests/p5r-page.test.js`, `tests/p5-import-page.test.js`, `tests/panel-status.test.js` (each names the old functions or the view switch).
Proof by eye: orchestrator screenshots at 1280 and 780; hamr checks 390 and 320 and clicks through before any done or release claim.

### K. fwd's known leftovers and what we do with them

- Search placeholder clipped at 320 px: fixed here (D.11).
- Head run chosen by server order: fixed here (D.2).
- Matched run past the cap not highlighted: fixed here (D.7).
- Chip order from object key order: fixed here (D.10).
- fwd's "rerun / reran" chip wording and its Inbox search hint: Inbox only, do not apply.
- fwd's exit notes say self-review and branch-review had not run at sign-off; ours get run before any release.

### L. Not in P9 v2

Scheduled section content (the slot is built, drawn in the mockup, filled by PRD v1.99); the Accept pill (until the Accept control exists); any change to runs on disk (display only, nothing deleted or archived); new filters; new tags; fwd's Inbox work; the Run tab.

### M. Done when

On hamr's real panel: a live run shows in Running now with its wall counting up; a stopped run with Resume shows in Needs you with the `Resume` pill and its click opens the Run tab on that run; a job with more than 8 runs shows 1 + 7 and "use search"; a search for an older run opens the fold with that run highlighted; no sideways scroll at 1280, 390, 320. Plus the tests of section J, each shown failing first.

### N. Open items for hamr

1. **Accept pill.** There is no Accept state in the panel yet (E.3). The pill joins when the Run tab gets its Accept control. Say if you want the Accept control built first.
2. **Live wall for a resumed run** (F, `priorWallMs`): the wall must not count the gap between legs (ruling: "the gap between legs is not counted"). The build checks `legsOf` for what is available; if it is not exact, the card shows the current leg's wall and says so in words.
3. **When.** A separate branch AFTER `feat/rubric-search` is reviewed and released; one branch at a time, one builder per worktree, sonnet.

### O. Amendment 2026-10-14 — P9 v2 am5 (from fwd M11 am5, signed by hamr)

Source: fwdloop `m11-am5` (59ffc7e signed text, c35aa40 red-first tests, 2a3fb04 code) and am6 (dde315b). **This REPLACES the ruling-A fold rule** (D.4 and D.7: "the 7 + the selected run + the ONE newest older match past the 7"), and D.8's plain substring search and D.3's `(and k older: use search)` line. Everything else in D stands.

1. **Search by words.** The Runs search splits at spaces. A run matches only when EVERY word matches. bareloop keeps its extra plain-word fields (job, run id, model, status word, why, spend, wall, check type): a plain word is a substring of any of them. Only `run-N` and day words become exact (items 2 and 3).
2. **`run-N` is exact.** `run-2` never matches run-20 or run-230. Case does not matter.
3. **A day word.** `MM/DD` (any year) or `YYYY-MM-DD` matches the runs that started that LOCAL day, from the same time the card shows (`at`). A run with no date never matches a day word. A part date such as `10/1` matches nothing (not even through the card's date text).
4. **While searching, the older fold shows matches only.** With a search OR a chip on (a chip counts as searching), a job's older-runs fold shows only the runs that match, newest first, at most **7**, plus the selected run. Copy fwd's `rlModel` `pool` / `top` / `shown` / `left`.
5. **Hints.** Search box placeholder: `job, run-23, or a day 10/12` (checked at 320 px, see the build report). The line after the 7, no search: `(and k older · <oldest> to <newest> of those k · search above)`, dates (`MM/DD`) from the HIDDEN runs only, the range dropped when any hidden run has no date. While searching: `(and k more matches · add a day or a run)`.
6. **Run card line 1.** `run-2 · 10/12 13:46 · deepseek-flash`: date and model use the same size and baseline as `run-2` (fwd `.rl-rest`, no font-size, no margin), with ` · ` before them.
7. **am6, the top cards (fwd M11 am6, signed):** on Running now and Scheduled cards the time, cost and next-run text after the job and run use the same size and baseline as the job name, with ` · ` between the parts: `aging-live-4 run-7 · 2m · $0.0100` and `aging-live-4 · Mon 09:00`. Needs you shows a pill, not faint text, and is unchanged. The filter-note `.rl-faint` line is unchanged.

**Must fail when:** `run-2` shows run-20; `aging run-23` finds nothing when aging-live-4 has a run-23; `10/12` misses a run started that day or shows one from another day; a search shows a non-matching older run (other than the selected one); the fold shows more than 7 older runs plus the selected one; a date on a run card, or any text on line 1 of a Running now or Scheduled card, sits raised or smaller than the job/run name, or has no ` · ` before it.

**am7 (from fwd M11 am7, fwdloop `m11-am5` e9b91d9, signed by hamr after his live walk of am5; REPLACES item 5's hint and placeholder words):**

1. **Any day form.** A day can be typed `10/13`, `10-13` or `2026-10-13`; all three mean the same local day.
2. **Brackets are ignored.** `aging-live-4 (run-2)`, as a run's title shows it, finds the same run as `aging-live-4 run-2`.
3. **The date range comes from the hidden runs' real start days:** the oldest to the newest, whatever order they are listed in (the time the card shows, `at`).
4. **Plainer words.** Search box: `search: job name, run-23, or a date 10/13`. Under the 7, no search, hidden runs over several days: `4 more older runs, 10/11 to 10/13. Search to find one.` Under the 7, no search, all on one day: `6 more runs on 10/11. Search to find one.` Under the 7, while searching: `3 more match. Add a date or run number to narrow it.` A hidden run with no date drops the date part: `k more older runs. Search to find one.` (bareloop singularises "run" for k=1 only: `1 more run on 10/11.`, `1 more older run.`; the searching line is fwd's verbatim for every k.)

**Must fail when:** `10-13` and `10/13` give different results; `(run-2)` finds nothing where `run-2` does; the range misses a hidden run's day; one day shows as "10/11 to 10/11"; a hint still uses the old words.

**am8 (from fwd M11 am8, fwdloop `m11-am5` 516f9f5 / a24633b / f6f3451, signed by hamr on fwdloop 2026-10-15; REPLACES am7 item 4's placeholder only):**

1. **Search box words.** The Runs search box reads exactly `job, run-23, or date 10/13`. am7's `search: job name, run-23, or a date 10/13` clipped at 320 px (about 344 px wide against about 278 px of room). The other am7 hint words are unchanged.

**Must fail when:** the search-box words are cut off at 320 px; the placeholder is longer than 32 characters or reads other than the words above.

**am9 (from fwd M11 am9, fwdloop `m11-am5` 39cb4b9 / 6e87c7b / 66da292, signed by hamr on fwdloop 2026-10-15 "sign m11 am9"; REPLACES am7 item 4's searching words only):**

1. **Dates on the "more matches" line.** While searching, the line after the 7 shows the real start days of the matches it hides, the same min/max way as am7 item 3 (hidden ones only, whatever their order): several days `5 more matches, 10/11 to 10/12. Add a date or run number to narrow it.`; all on one day `50 more matches on 10/09. Add a run number to narrow it.`; a hidden match with no date drops the date part: `k more matches. Add a date or run number to narrow it.` ("matches" is fwd's verbatim for every k, including 1; the no-search words are unchanged.)

**Must fail when:** the searching line has no dates when every hidden match has one; the range misses a hidden match's day; one day shows as "10/09 to 10/09".

## Addendum 2026-10-14 — T: triggers build spec (SIGNED 2026-10-14)

Status: SIGNED 2026-10-14 (rulings below, marked RULED; hamr: "if a run missed, it retries when it's back up, if ai down, resume handles it, 5 files > 5 runs one after another. looks fine as long as you align with what fwd did"). Rule that follows: wherever this page differs from fwd without a stated bareloop reason, follow fwd. Nothing here was built at signing. The contract is PRD v1.99 "Triggers: jobs that start by themselves" (ticks T1-T20, SIGNED 2026-10-14); this page says HOW. hamr signed this page and `design/schedule-mock.html` before any builder starts. Work order (RULED): P9 runs list (this branch, `feat/runs-list`), then triggers on this same branch, then rubric work. fwdloop paths are under `~/PycharmProjects/fwdloop` (v0.19.1, main 845b955); "fwd ladder" is `docs/wiki/the-module-ladder.md` M9 (2217-2273) and M11 am3 (2315). Copy is by REWRITE, never import. bareloop never edits fwdloop. Builder: sonnet, strict pin, one part at a time, commit after every part, tests only through `npm test`.

### A. Rules for the builder

1. Every delivery clause below names its CALLER (file:function). An engine with no caller is not the feature. Parts 1-4 may land before their caller exists, but each part's tests include at least one test that goes in through the named caller (or the nearest real seam), and the build is not "done" until Part 5's end-to-end test (tick to a recorded `spawnFn` argv) and the Part 7 click path pass.
2. The page works out nothing. Every state, word and time on screen comes from the server (`src/schedulewords.js`, one owner). No model text ever reaches a sentence.
3. The agent never sets a trigger. The drafter cannot write it, a draft that carries it is refused by name, and the interview never writes it.
4. No new dependency. Node built-ins only.
5. Tests use a scratch HOME and inject `home` (the run-list home) and the clock. A test never touches `~/.config/bareloop`. Report `runs.jsonl` line count before and after.
6. Show each part's tests failing first (the PRD's "Each must fail first").
7. Names that must not match node's test glob: the shared test helper is `tests/trigger-world.mjs` (not `test-*.mjs`).
8. RULES FOUND BY hamr CLICKING fwdloop (they are rules here, each has a test): (a) after a schedule is signed or cancelled the page offers NO Run / Run now / Sign & run button or invitation (hamr clicked Run twice thinking it was the trigger); the card clears to the default empty New job card and the main button is dead for about 1.5 s (fwd `whenLocked`, `index.html:4765`); (b) the two-click Sign / Confirm shows a visible change on each click: it dims while the request is out, the label becomes `Confirm: <words>` after click 1, and the card clears after click 2; (c) a fired run that is spawning shows `[▶] starting`, never `[?]` (the run list already draws a row with no spine yet as `[▶]` + `starting…`, `server.js:677` `startingStub`; the scheduler writes nothing to `runs.jsonl` itself); (d) when the month is used up, NEXT goes red; (e) expect hamr to reword the buttons on his walk: every button word lives in ONE table in `src/schedulewords.js` and the page reads it from the server, so a reword is one edit.
9. Do not mix up two catch-ups. The scheduler's catch-up is the clock maths (`due`, Part 1). The page's `visibilitychange` catch-up tick is the PAGE poll refreshing the screen (fwd `docs/logs/FINDINGS.md:2848`); it fires nothing. Neither is edited for the other.
10. No retry ladder for a fired run in this build (I.6). A provider failure ends the run `provider-red`, resumable by hand like any run; nothing re-fires.
11. A run that does not draft gets the whole cap (fwd ladder 1380); see D.6 for the one exception, a rubric's calibration gate.
12. `detail.schedule` (Part 6) reads ONE parse of the job's newest run and the schedule files. It never builds a run context per run (fwd fix-ledger line 36, `jobWaitingLine`, ~150 ms per poll at 100 runs).

### B. Where triggers live on disk, and why

1. bareloop has no per-job folder (fwdloop has `flowDir`). A job is a name (`spec.job`, a kebab-case slug, `isSlug`, `src/panel/authorsession.js:180`) and its runs are rows in `runs.jsonl`. So triggers live under the one config home, next to `runs.jsonl`: `<home>/triggers/<job>/` where `<home>` is `runlistHome(home)` (`src/runlist.js:47`, default `~/.config/bareloop`). Same perms posture as `runs.jsonl` (dir 0700, files 0600). It is the one place tests already inject (`home`), it needs no repo, and it survives the patient copies being thrown away.
2. Keyed by JOB NAME, never by signature hash. This is what makes T18 true: a re-sign (new time, new cap) writes into the same folder, so the queue is never orphaned. The signature hash is a field inside rows (`sig`), used only to answer "since this signing" (T19).
3. Files in `<home>/triggers/<job>/` (two files):
   - `schedule.json` — the CURRENT signed schedule: `{job, trigger, spec, specHash, workflowKey, originRunid, inputsText, signedBy, signedAt}`. Written atomically (temp file then rename) by the ONE writer (`schedules.js: set`). Absent = the job is by hand. Cancel removes it after the `cancelled` row is written.
   - `ledger.jsonl` — ONE append-only file for the job, ALL row kinds, EVERY row carrying `sig` (the signature hash it was written under). Kinds: `armed`, `fire` (clock); `baseline`, `arrived`, `ran`, `dropped` (files); and the outcome rows `started`, `busy`, `monthly-exhausted`, `refused`, `deleted`, `changed`, `cancelled`, `edited`. Ids are write-once as in fwd (`armed:<ms>`, `fire:<slot>`, `baseline:<sha>:<name>`, `arrived:<sha>[:n]`, `ran:<sha>`, `dropped:<of>`). This replaces fwd's three files and its folder per signature: a re-sign never opens a new folder, which is exactly what orphaned queued files in fwd (T18). "Since this signing" is a filter on `sig`, never a wall-clock compare.
4. The run itself records why it started: `trigger.json` written ONCE (flag `wx`) into the run's own session folder (`<sessionsRoot>/<id>/`, the folder that already holds `resolved-spec.json` and `card.json`) right before the spawn. The panel finds it the way it already finds `card.json` (`sourceNearSpine(row.spine)`, `src/panel/server.js`, used by `getStartFrom` ~2619). It carries `{kind, trigger words, reason, catchUp, missed|file+sha}`.

### C. Parts, in build order (each is one or more commits with its own tests)

**Part 1 — Clock maths and the ledger reader/appender.**
1. Files: `src/triggerledger.js` (new), `src/triggerclock.js` (new).
2. `triggerledger.js` is the ONE reader and ONE appender for a job's `ledger.jsonl`. `readLedger(file)` returns `{rows, skipped}`; it skips a line that does not parse (a torn append) and counts it. `appendRow(file, row, {once})` writes one row; if the file's last byte is not `\n` it writes a `\n` first, so a torn line can never glue onto the next row. `once` refuses a row whose `id` is already on disk. THE TWO HALVES (skip, fresh line) LAND IN ONE COMMIT (T17).
3. `triggerclock.js`: `validateSchedule`, `due`, `nextSlot`, `armTrigger`, `recordFire`, `GRACE_MS` (120000), one slot per local calendar day, DST-safe (local `Date` constructor), missed slots collapse to ONE catch-up.
4. Callers: `src/panel/scheduler.js: tick` (`due`, `recordFire`); `src/panel/schedules.js: armFor` (`armTrigger`); `src/panel/schedules.js: read` (`nextSlot`). Parts 2, 3, 4 and 5 all read and write through `triggerledger.js` only. Every append takes the current `sig`.
5. Copies: fwd `src/trigger-clock.js` whole (`:24` GRACE_MS, `:33` validateSchedule, `:94` due). NOT copied: its own `readRows`/`appendOnce` (`:118-127`), replaced by `triggerledger.js`.

**Part 2 — Folder queue and the seen ledger.**
1. File: `src/triggerfiles.js` (new).
2. Poll based, never `fs.watch`. Modes `new` (one folder, top level, regular files, symlinks refused) and `updated` (one file). A file is taken only after its size AND mtime held for `STABLE_POLLS` (2) polls. `arm()` records what is there as `baseline` (never runs; New file blocks that sha for good, File updated until the file changes away). `recordArrived` is the only writer of `arrived`. `queueOf` orders oldest arrival first, ties by name then sha. `recheck` looks again at use time (lstat, realpath, re-hash): deleted or changed means dropped with a reason. `checkTarget` is the one set-time rule.
3. Differences from fwd: reads and appends go through `triggerledger.js`; `recordRan` is exported but called ONLY by the starter's `beforeSpawn` hook (Part 4), never by the scheduler before the starter agrees (T16).
4. Callers: `src/panel/scheduler.js: tick` and `runQueue` (`createFileTrigger().poll`, `recordArrived`, `queueOf`, `recheck`, `recordDropped`); `src/panel/schedules.js: armFor` (`arm`); `src/panel/schedules.js: set` and `inspect` (`checkTarget`).
5. Copies: fwd `src/trigger-files.js` whole (`:27` STABLE_POLLS, `:58` arrives, `:64-82` queue).

**Part 3 — The `trigger` field in the signed spec, and the $0 two-click set / cancel route.**
1. Files: `src/trigger.js` (new, pure: `validateTrigger`, `TRIGGER_KINDS`); `src/job.js`; `src/authorjob.js`; `src/panel/authorsession.js`; `src/interviewrun.js`; `src/panel/schedules.js` (new: the schedule door); `src/panel/authorroutes.js`; `src/panel/server.js`; `src/schedulewords.js` (new: only `scheduledWords` and `slotWords` in this part, the rest is Part 6).
2. The field. A typed object, never cron text:
   - `{kind:'daily'|'weekdays', hour, minute}`
   - `{kind:'weekly', day:'mon'..'sun', hour, minute}`
   - `{kind:'new-file', folder}` (absolute path)
   - `{kind:'file-updated', path}` (absolute path)
   By hand = the key is ABSENT (never `null`), so a by-hand spec hashes exactly as it does today.
3. `src/job.js`: add `'trigger'` to `JOB_FIELDS` (line 171); replace the `cadence` block (lines 281-289) with: absent is fine, present is still validated as today (old signed specs keep `cadence`, read as by hand, are never rewritten, never re-hash — T2 RULED); add a `trigger` block calling `validateTrigger` (nested unknown keys red, as `cadence` does). `resolveSpec` is unchanged, so nothing is injected into any hash. `workflowKey` (line 952) must ALSO drop `trigger` (a new `SCHEDULE_SPEC_FIELDS = ['trigger']`, kept apart from `REUSE_OPEN_SPEC_FIELDS`, which names the Reuse boxes). Without this a scheduled spec's workflow key differs from its green run's and the existing check at `authorsession.js:920` refuses it.
4. Agent never sets it: `assembleSpec` (`src/authorjob.js:1021`) refuses a draft that carries `trigger`, by name, like `close`; the drafter prompt is not told the field exists. `authorsession.js:948` and `interviewrun.js:693` STOP writing `cadence`; they write nothing in its place.
5. The door: `createScheduleDoor({home, sessionsRoot, rowsFor, now, ...})` in `src/panel/schedules.js`, with:
   - `greenFor(job)` — THE gate (T3). The job's CURRENT workflow key is the key of its newest listed run whose signed spec is on disk (`signedSpecForRun`, `server.js:2479`). The gate passes when a run with THAT key has a real `green` outcome (the same test as `listReuseJobs`, `server.js:2686-2705`; `already-green` does not count) AND, for a rubric job (`spec.verdictType === 'soft-green'`), that run's spine holds an honoured accept: `doorAccepted(records)` = a `door-decision` record with `decision === 'accept'` and `honoured === true` (written by `answerReviewDoor`, `src/reviewdoor.js:191`; new pure helper next to `doorRecordOf`, `reviewdoor.js:48`). The code knows a rubric job was accepted by READING THE SPINE, whichever surface (CLI today, panel Accept in Part 8) wrote it. An edited job has a new key, so an older green does not count (T5).
   - `prepare(body)` — click 1. All $0 checks, signs and writes nothing, returns `{words, hash, monthlyNote}`.
   - `set(body)` — click 2, carries the hash. Builds the spec, signs, writes `schedule.json`, arms. $0, no drafter, no run.
   - `cancel(body)` — never refused (see D.9).
   - `read(job)` — data only: trigger, armed, next slot, last outcome (rows with `sig` equal to the current signing, never a wall-clock compare — T19), `hasGreen`, `refusal`.
   - `scan()` — every job with a `schedule.json`: `{job, dir, schedule}`.
   - `clearIfEdited(job, workflowKey)` — see D.7.
6. What `prepare` checks, in order, each a plain-words refusal that says "Nothing was changed.": the run belongs to a listed job (`readRunList`); `greenFor` (else the fixed sentence "This job has not had a good run yet. Run it by hand and get it right first; then you can set when it runs. A rubric job also needs your Accept once." — NO_GREEN_SAY, fwd `authortrigger.js:44`); the `when` shape (`validateTrigger`); file kinds only on a plain-files job (see I.3) and the target is usable (`checkTarget`); `validateReuseCard` on the open boxes (`authorsession.js:295`); the cap and wall are numbers; the spec built from `buildReuseSpec(greenSpec, card, rows)` (`authorsession.js:268`) plus `trigger` passes `validateJob` and keeps the green's workflow key; the monthly note (`checkMonthlyRoom`, `monthly.js:369`, shown, not a refusal: the refusal is per fire, T8). `hash` = `jobSpecHash(spec)` (`job.js:915`), which already covers trigger, caps, inputs and destination (T4).
7. `set` repeats every check, refuses a stale hash ("What you were shown is not what is on the card now. Nothing was signed. Look again, then sign."), writes `schedule.json`, then `armFor` (idempotent; a file kind records the baseline first, then the `armed` row). A re-sign appends a new `armed` row in the SAME ledger (T18). The queue is carried over ONLY when the kind AND the folder (or file) are unchanged. When the folder or the kind CHANGES, or the schedule is cancelled, the queue is NOT carried over: each queued file gets one `dropped` row with why `schedule-changed` / `schedule-cancelled` and one plain-words outcome row (never silent, never orphaned).
8. Routes (all in `src/panel/authorroutes.js: handle`, placed with the other exact matches before the session regex at line ~272; `routesFor` in `server.js:2840` already sends `/api/author/*` here, behind the human-click guard): `POST /api/author/schedule-prepare`, `POST /api/author/schedule`. `GET /api/author/start-from?runid=&mode=schedule` (line 210) also returns the current `schedule` prefill and, when the job is scheduled, `editNote`.
9. Wiring: `createPanelServer` (`server.js:3016`, the `listen` callback at ~3052) builds `createScheduleDoor` and passes it to `createAuthorRoutes` and to the scheduler (Part 5).
10. Callers: the two POST routes are called by the page (Part 7: `scheduleSign`); `greenFor` is also called by `getRunDetail` (`server.js:1000`) to decide whether the Run tab offers Schedule run; `clearIfEdited` is called from `signRun` (D.7).
11. Copies: fwd `src/panel/authortrigger.js` — `shapeOf` (`:129`), `inspect` (`:156`), `prepare`/`set` (`:200`, `:230`), `read`, `card`, `armFor` (`:105`), `triggerLedgerDir`, `hasGreenRunForJob` (`:73`; REWRITTEN as `greenFor` above, not copied), `triggerHash` from `src/trigger-line.js`. NOT copied: `src/trigger-line.js` grammar and `proseWithTrigger` — bareloop has no signed prose; the signed thing is the JSON spec. So the `m9-trigger-grammar` test becomes a spec-field test (G).

**Part 4 — The one starter, `wouldAccept`, and the fire order.**
1. Files: `src/panel/schedulestart.js` (new: the starter); `src/panel/schedules.js` (`fire`); `src/panel/authorroutes.js` (the start path is factored out so the HTTP route and the starter share ONE function); `signRun` gets `o.reviewDoor` and `o.trigger`.
2. The ONE start path (T15). `authorroutes.js` `/api/author/start` (line 248) already does, for a Reuse: prove the inputs at $0 (`proveInputFiles`, line 292), create a session from `buildReuseSpec`'s spec (`createSession`, line 295, which prepares the copy or worktree, installs packages, runs signing gates 1-3 and, for a rubric, calibration gate 4), wait for `prepared`, then `signRun` (line 384) spawns `setsid systemd-inhibit ... run-u --spec --approve <hash>` (lines 429-438). Factor that into `startReuseSession(card, reuse, {headless})` and call it from both the route and the starter. A scheduled fire is exactly a Reuse the person did not click.
3. Headless sessions live in their own map (not `hasLiveSession`, `authorroutes.js:113`), so a scheduled start neither blocks nor is blocked by a session the person has open (I.5). A headless session that lands in `install-needed`, `refused` or `signing-failed` is abandoned and becomes a `refused` row in plain words ("Packages are missing in the job's copy. Nothing started."), never a session that waits on nobody.
4. `starter.wouldAccept(job, cause)` — cheap, $0, no copy, no session, answers "would a start go through?": the stored spec still hashes to `schedule.json`'s `specHash` (else "The saved schedule no longer matches what you signed. Nothing started."); the per-fire spec differs from the signed spec in `inputs` only (E.4); the inputs are there (for a file cause, the arriving file, rechecked); the keys load; the model line is still ticked, priced and keyed (`judgePick`, as `validateReuseCard`). Returns `{ok:true}` or `{ok:false, why}` (words).
5. `schedules.fire(job, cause, hooks)` — the fire order (T15), each outcome ONE row in `ledger.jsonl`: busy, then monthly, then `wouldAccept`, then `hooks.beforeSpawn` (the scheduler's `recordRan` for a file cause), then `starter.start`.
   - busy: a live run of this job (`schedules.busy`, Part 5) or a start in progress. Row `busy`. Nothing else.
   - monthly: `checkMonthlyRoom({capUsd: schedule cap, home, sessionsRoot})`; `!room.ok` is a `monthly-exhausted` row with `leftUsd`, `needUsd`, `atLeast`; a `ConfigError` is a `refused` row ("... refusing rather than guess the monthly limit", as `signRun` does at `authorroutes.js:394-400`). Nothing started.
   - `wouldAccept` not ok: `refused` row with the words. Nothing written to the ledgers. Nothing spent.
   - `starter.start(job, cause, {beforeSpawn})`: runs the session to `prepared`, then calls `beforeSpawn` (writes the CONSUMING row: `ran` for a file, `fire` for a clock slot), writes `trigger.json` (`wx`), then `signRun` with `reviewDoor: true` (F.1). A started run is a `started` row with the run id.
   - RULED (retry when back up, fwd's queue rule): `busy`, `monthly-exhausted` and `refused` rows are TOLD rows, never consuming rows. The only consuming rows are `fire:<slot>` (clock) and `ran:<sha>` (file), and they are written only by `beforeSpawn`, i.e. after busy, monthly, `wouldAccept` AND the session reaching `prepared` all said yes. So a refused or busy fire records nothing that consumes; the slot stays due (it keeps collapsing into the one catch-up) and the file stays at the head of the queue, and the next tick tries again. A start that fails before `beforeSpawn` (install-needed, refused, signing-failed) is a told `refused` row, consuming nothing. A spawn error AFTER `beforeSpawn` (synchronous throw from `signRun`, or the child's `error` event) appends a `released` row (`of:` the consumed id) and a told `refused` row; readers treat a released `fire`/`ran` as not consumed, so the slot or file is retryable. Bound: at most `MAX_RELEASES` (3) releases per id, after which it stays consumed and the row says so in words (`lateRefusalWords`), so a persistent spawn failure writes a bounded number of rows.
6. A refusal is told once per key `sha|outcome|why` (clock kinds: `slot|outcome|why`); the told-set is read back from `ledger.jsonl` so a restart does not repeat it (T13).
7. Callers: `schedules.fire` is called by `scheduler.js: tick` (clock) and `runQueue` (file); `starter.start` and `wouldAccept` are called by `schedules.fire` only.
8. Copies: fwd `src/panel/authortrigger.js` `fire` (`:291-337`), `src/panel/authorstart.js` `start` (`:135-174`, the `trigger.json` `wx` write before the spawn). REWRITTEN, not copied: where fwd writes `ran` before the starter answers (`scheduler.js: beforeStart`), the starter now answers first (T16, E.1).

**Part 5 — The scheduler tick in the panel server.**
1. File: `src/panel/scheduler.js` (new). `createScheduler({door, home, now, intervalMs = 1000})`. `intervalMs` 0 = no timer (a test calls `tick`). Timer is `unref`'d; `start` and `stop` are idempotent.
2. Started and stopped in `createPanelServer` (`src/panel/server.js:3016`): built in the `listen` callback right after `authorRoutes` (~3052-3070) and `start()`ed; `stop()` is called in the returned `close` (~3089). Only a running panel fires (T6); a missed clock slot collapses to one catch-up when the panel comes back; a run more than 2 minutes late is marked catch-up (E.3).
3. One `tick()` does everything, synchronously, and a throw on one job never stops the others (fwd `scheduler.js:94-110`). `door.scan()` is a `readdir` of `<home>/triggers/`; with no schedule, a tick returns before it reads anything else (cheap).
4. Per job: arm if not armed; clock kind: `due`, `fire` (RULED: the slot is NOT consumed up front; `recordFire` is called only by `beforeSpawn` after the starter agreed, so a refused slot retries on the next tick and told rows are once per `slot|outcome|why`); file kind: `poll` then `recordArrived` for each taken file, then `runQueue`. `runQueue`: busy tells each queued file ONCE then waits; free: look again at the head (`recheck`), a deleted or changed head is dropped with a reason and the next head is tried; the head goes through `fire` with `beforeSpawn: () => recordRan(...)`.
5. BUSY IS CHEAP (T19). `schedules.busy(job)` reads `readRunList({home})` ONCE per tick (and only when a fire or a queued head needs it) and asks `runIsAlive(row)` (`src/runlist.js:294`, which uses `isLiveRunner`, `:239`: the pid is alive AND `/proc/<pid>/cmdline` is a bareloop runner) of the rows whose `job` equals the name. PID REUSE GUARD (added from fwd lessons): a pid also counts only if the process start time (`/proc/<pid>/stat`, field 22, turned into a time) is not later than the row's `at` plus 5 s; a recycled pid that started after the run began is not that run. Where `/proc` cannot be read, `isLiveRunner` alone decides, as it does today. It never calls `summarizeRow`, `replayOne`, `resumePlanFor` or builds any run detail. A run waiting at the review door has ended, its pid is gone, so it is NOT busy (T7). Plus an in-memory `starting` set per job: a headless start counts as busy from the fire until `runs.jsonl` shows a row for that job at or after the fire time, or 120 s pass. This closes the gap between the spawn and the row run-u appends (`src/userrun.js:1578`); without it two fires in a row would both start. A restarted panel has no in-process start in flight, so it needs no set.
6. Callers of the scheduler itself: `createPanelServer` only.
7. Copies: fwd `src/panel/scheduler.js` whole (`:46` once-per-key, `:50` busy, tick, runQueue). Differences: tick period 1000 ms (the stability rule needs two equal polls, so a drop is seen about 3 s after it stops changing); busy as above.

**Part 6 — The words module.**
1. File: `src/schedulewords.js` (new; `scheduledWords` and `slotWords` already exist from Part 3). Pure functions, typed facts in, a fixed sentence out. `home` is injected (no `homedir()` default inside tests).
2. Adds: `nextTimeWords(ms, now)` ("today 15:00" / "tomorrow 09:00" / "Tue 20 Oct, 09:05"), `nextInWords(ms, now)` ("next in 20m / 3h / 3d"), `editClearsWords(trigger)`, `scheduledNextFor(facts)` (first match wins: 1 a run is waiting for your Accept, 2 monthly-exhausted this month in red, 3 clock kind with a next slot, 4 file kind armed, 5 not armed; a last outcome of `refused` goes in front and paints red), `catchUpWords(rec)`, `lateRefusalWords`.
3. Differences from fwd `scheduledNextFor`: rule 1 reads "Run N is waiting for your Accept. The next scheduled run does not wait for it." (T7) instead of "the next run waits too"; money is `panelMoney2`'s two-decimal rule (`<$0.01`); "Raise the monthly limit in Settings".
4. Callers: `getRunDetail` (`server.js:1000`) builds `detail.schedule`; `runsListPayload` (`server.js:947`) builds `scheduled[]`; `schedules.prepare` returns `words`. The page only paints strings.
5. Copies: fwd `src/summary-words.js` (`:35` scheduledWords, `:89` scheduledNextFor, `:111` catchUpWords, nextTimeWords, nextInWords, editClearsWords). NOT copied: `endedWords` (bareloop has its own ENDED block, `server.js:416-530`).

**Part 7 — Panel UI** (shape fixed by `design/schedule-mock.html`; hamr signs it first).
1. `GET /api/runs` (`runsListPayload`, `server.js:947`) gains `scheduled`: `[{job, at, in, words, runId}]`, soonest first, a file trigger (no clock time) after those that have one, by name. `runId` is the job's HEAD run (`headRunid` by time, `summarizeJobs`, `server.js:889`), not "first in server order" (the fwd parked bug, D.2 of P9 v2). Built by `listScheduled` in `schedules.js` from `scan()` + `read()` + the Part 6 words. A job that cannot be read is absent.
2. Runs list: `rlTopHtml` (`index.html` ~1474) already builds its sections from one ordered list; add one entry `{label:"Scheduled", items:m.scheduled, draw: rlScheduledCardHtml}` after Needs you, and one draw function (fwd `index.html:1902`). `rlModel` (~1444) already passes `scheduled`; `setRunsData` already stores it (~1338-1345). Never filtered or searched. A job with no run: a plain `div`, nothing to open (fwd ledger line 41 notes this; with `headRunid` a scheduled job nearly always has a run, because it needs a green one).
3. EXACT PLACEMENT, copied from fwd and mapped (hamr: copy placement and behaviour exactly). fwd cites are `~/PycharmProjects/fwdloop/src/panel/index.html` at v0.19.1 unless said; signed words in the fwd ladder: M9 am4 `2254-2256`, M9 am5 `2257-2263`, M11 am3 `2315`, M11 am4 `2320-2322`; the commit that added the button is `c43cd77`.
   1. **Which tab, which row.** The Run tab's ONE action row, `#run-actions` (fwd `:1160`; bareloop `index.html:843`), drawn by `renderRunActions` (fwd `:2348-2358`; bareloop `index.html:2361`). fwd order: Run again, then the schedule button, then Stop / Resume (`:2353-2358`). bareloop has no Run again; its door of the same kind is Reuse workflow (`index.html:2382`, `reuseWorkflow` `:2327`). bareloop's real order today is `[Stop | Resume]`, `[Edit in chat]`, `[Reuse workflow]` (`:2365-2382`). The schedule button goes LAST, right after Reuse workflow. (fwd puts it next to its first button; here "next to Reuse workflow" is the same rule.)
   2. **When it shows.** The SERVER decides, the page works out nothing: `detail.schedule.scheduled` shows `Cancel / modify schedule` (testid `run-cancel-schedule`); else `detail.schedule.canSchedule` (a real green with the job's current workflow key, and for a rubric job an honoured accept: `greenFor`, Part 3) shows `Schedule run` (testid `run-schedule`); else NO button. A job with no good run has no Schedule button. (fwd `:2354-2358`, `summary.scheduled` / `summary.canSchedule` from `runSummary`, `data.js:1324-1354`, commit `c43cd77`.) Cancel / modify shows on every run of a scheduled job, not only the green one, and also while a run is live (cancel is never refused).
   3. **What a click does.** Nothing is started and nothing is signed by the button. It opens the SAME door as the neighbouring button: fwd `openRunAgain` (`:5295-5307`: GET `/api/author/run-again`, `#tab-chat` click, refuse if a session is live or the card is in resume mode, `setMode("run")`, fill the Run card for that job with When showing the current schedule). bareloop: `scheduleInChat(detail)` beside `reuseWorkflow` (`index.html:2327`) calls `GET /api/author/start-from?runid=&mode=schedule`, clicks `#tab-chat`, and dispatches `bareloop-schedule`, handled next to `bareloop-reuse` (`index.html:4661`, `applyReuse`) by filling the SAME Reuse card (Check type = Reuse workflow, `jf-verdict` radio value `reuse`, `index.html:704`) with the new When field showing the current schedule. The button's label never changes in place.
   4. **The When field (the schedule control on the card).** fwd `#jf-when-field` (`:998-1019`). It sits between the Inputs field and the Cap row: fwd order is Destination, Inputs, When, Cap $ / Ask wait (`:979-1022`) (hamr was told "last field"; the source puts the cap row after it, and the mock follows the source). bareloop order on the Reuse card: Check type, Model, Job name, The job, Inputs, Destination, [When], Cap $ / Time cap (`index.html:700-758`). Parts of the field: label `When`; the select `#jf-when` with options By hand, Every day at HH:MM, Weekdays at HH:MM, Every <day> at HH:MM, When <file> is updated, When a new file arrives in <folder> (`:1000-1007`); sub-boxes shown and hidden by `whenShowSubs` (`:4700-4707`): the day select ONLY for weekly, the time box for the three clock kinds, the path box ONLY for the two file kinds (fwd also shows a role select there; bareloop has no role, I.3, so it shows the path box only); a hint line `Now: <words>` under it (`:4737`), or the server's refusal sentence in its place with the select and every sub-box DISABLED (`:4733-4736`); an error line under that. On a scheduled job the first option reads `Cancel schedule` instead of `By hand` (`:4730`).
   5. **The ONE main button** (no separate trigger button; hamr clicked Run twice, M9 am4). fwd `mainButtonFor` (`:4122-4141`) with `whenChanged` (`:4709-4714`) as the only reader of "changed". bareloop's main button is `#chat-main-btn` (`index.html:3839`), words from `mainButtonFor` (`:4392-4412`); in Reuse mode with no session it reads `Sign & run` (`:4397`). Mapping, one pure function of state:
      - When unchanged from the signed value (or By hand on a job with no schedule): the Reuse card's own button, `Sign & run`, unchanged. (fwd: `Run now — spends up to $X`, `:4141`.) (SUPERSEDED 2026-10-15: schedule cards never start a run.)
      - When changed to a schedule: `Sign schedule`. Changed to By hand on a scheduled job: `Cancel schedule`. (`:4129-4131`.)
      - Click 1: POST `/api/author/schedule-prepare`, $0, signs nothing; on success the label becomes `Confirm: every day at 13:15` or `Confirm: cancel schedule` (lower-cased words, `:4760`). Editing any When box between the clicks DROPS the hash and the label returns to `Sign schedule` (`whenEdited`, `:4741`).
      - Click 2: POST `/api/author/schedule` with that hash. The button is disabled while a request is out (`whenBusy`, `:4131`). After click 2 the card clears (`resetCard()` and `setMode("new")`: the empty New job card), a failure says why on the card, and the button is locked for 1.5 s (`whenLocked`, `:4765`). NOTHING runs. It never reaches the run routes (`doWhenSign`, `:4744-4772`).
   6. **Why each rule exists (hamr's own changes).** M9 am4: one button, because he clicked Run twice. M9 am5: dim on every press, `Confirm: <words>`, the card clears, `Cancel schedule` wording, and Cancel / modify on the Run tab. M11 am3 item 1: `Schedule run` when schedulable. M11 am4: a Scheduled list card opens the job's newest run on the Run tab and scrolls to its job.
   7. **Scheduled card with no run (fwd's known gap, fix-ledger line 35).** It cannot happen here: a schedule needs a green run, so the job always has a run, and the click opens the job's HEAD run by time (`headRunid`). If every run row of the job were ever removed from `runs.jsonl`, the card stays a plain `div` and the Run tab's Cancel / modify is unreachable; that is accepted and written down, not built for.
4. SCHEDULED / NEXT block (hamr 2026-10-14, supersedes the earlier "new block at the top of the Run tab"): a TWIN of the ENDED block, copied from fwd exactly: the same `ended-block` frame and style, built with `summaryRows`, placed DIRECTLY BELOW the ENDED block in the same container (fwd `index.html:1155-1158` `#summary-blocks`, `renderSummary` `:2218-2242`). It is not a separate block at the top of the Run tab. Painted from `detail.schedule`. Red NEXT when the server says `nextRed`. A catch-up run shows `catchUpWords` as a note. WHICH TAB: RULED 2026-10-14, the Run tab, like fwd. ENDED/NEXT MOVES from the Audit tab to the Run tab, and this SCHEDULED/NEXT block sits directly below it in the same container, which sits ABOVE `#run-actions` exactly like fwd's `#summary-blocks` (fwd `index.html:1155-1158`). The Audit tab no longer shows ENDED. The Part 7 deliverable is named "move ENDED to the Run tab + SCHEDULED twin"; its tests assert that ENDED is on the Run tab and gone from Audit (open list I.8).
6. Edit in chat on a scheduled job shows `editNote` (the fixed sentence) in the origin line before signing (D.7). (SUPERSEDED 2026-10-15 by PRD v1.100: an edit never clears a schedule and there is no `editNote`.)
7. Responsive: stacked, 44 px controls, no sideways scroll at 1280, 390, 320. barebrowse cannot emulate a phone width; hamr checks 390 and 320 in his own DevTools (say so, never claim it).
8. Copies: fwd `src/panel/index.html` (When select 998-1019, `doWhenSign` 4744, `rlScheduledCardHtml` 1902, `renderSummary` 2223, Schedule run / Cancel buttons 2354-2358); `src/panel/data.js: listScheduled` (~1229); `src/panel/server.js` (334-335 routes, 520 payload, 611 scheduler wiring).
9. Closing commit of the build: `CHANGELOG.md`, `bareloop.context.md` (the `trigger` field, `cadence` tolerated and ignored, panel-only, where the files live, the scheduled-run Accept rule), and the dated pointers in the PRD for the contradictions in J.

**Part 8 (RULED: built, I.1 = A) — a minimal Accept control on the Run tab.** Needed because T3 (rubric accepted once) and T10 (a scheduled green waits for Accept) cannot be done from the panel otherwise (J.1). File: `src/panel/runroutes.js` (`POST /api/runs/<id>/accept`, same spawn shape as the resume route, lines 174-187: `run-u --spec <specPath> --door <runid> --decide accept --approve <hash>`; the builder reads `src/userrun.js:2606-2663` for the exact flags); the Run tab button `Accept` is a button in the Run tab's action row `#run-actions` like every other run button (hamr 2026-10-14). Order in that row: `[Stop | Resume]`, `[Accept]`, `[Edit in chat]`, `[Reuse workflow]`, `[Schedule run | Cancel / modify schedule]` (Accept sits right after Resume, before Edit in chat). It is shown when `doorRecordOf` is present, `doorAgeGate` ok and no honoured `door-decision` follows; the SAME function fills the runs list `needs: 'Accept'` (`server.js:869`, P9 v2 E.3, one owner). Its own mockup is NOT drawn here; hamr signs a one-button mock before Part 8.

### D. The RULED items, applied

1. **Gate (T3).** `greenFor` (Part 3). Deterministic: one real `green` outcome with the job's current workflow key. Rubric: the same, plus the honoured accept on the spine (`doorAccepted`). `already-green` does not count.
2. **Scheduled green is quarantined until Accept (T10).** Three pieces, because the panel has no registry (J.2): (a) every scheduled spawn passes `--review-door`, so even a deterministic run opens a door (`kinds.js:277 doorOpens`); (b) `trigger.json` marks the run as scheduled; (c) one shared predicate `heldScheduled(records, triggerRec)` (scheduled and no honoured accept) is used by `getStartFrom` (its `outcome` reads `'green-held'`, so the existing check at `authorroutes.js:268` refuses it UNCHANGED) and by `listReuseJobs` (skips it). Reuse's green check is not edited. Accept later (Part 8 or the CLI) writes the `door-decision`, and the predicate turns false.
3. **Door-waiting run does not block (T7).** busy = live pid (or a start in flight), nothing else (Part 5.5).
4. **Panel-only (T6).** The scheduler is created only in `createPanelServer`. The CLI never fires.
5. **Inputs, Destination, $ cap, Time cap on the schedule card (T9).** Open boxes come from `REUSE_OPEN_FIELDS` minus Model (`authorsession.js:233`: inputs, destination, model, capUsd, maxWallMs). Model stays the green run's; at fire the starter refuses with words if that Settings line is gone. The Inputs may differ from the green run's. The destination keeps the dated, never-overwrite name (`src/source.js` ~916-930: `name-YYYY-MM-DD.ext`, `-2` the same day), so two files arriving the same day deliver as `-2`. For a folder queue the arriving file is the input (E.4).
6. **The cap set on the card is the cap (T8).** `schedule.json`'s `spec.budgetUsd` and `maxWallMs` are what every fire spawns with; nothing adjusts them. The run's enforced ceiling is cap minus drafting spent, as for any run (`signRun`, `authorroutes.js:421-433`); for a rubric the calibration gate's few cents come out of the same cap. Monthly is checked on EVERY fire (Part 4.5).
7. **Edit clears the trigger (T5).** `signRun` (`authorroutes.js:384`) calls `schedules.clearIfEdited(spec.job, workflowKey(spec))` after the spawn. If the job has a `schedule.json` and the signed spec's workflow key differs from the schedule's, the schedule is cancelled (an `edited` row; queued files dropped with a reason). A Reuse or a hand run of the same workflow has the same key and clears nothing. The fixed sentence (`editClearsWords`) is shown BEFORE signing, on the Edit-in-chat card. (SUPERSEDED 2026-10-15 by PRD v1.100: an edit never clears a schedule and there is no `editNote`.)
8. **The agent never sets it (T4).** Part 3.4. Test: a draft carrying `trigger` is refused by name; a drafter output never contains it; `assembleSpec`'s refusal names it.
9. **Cancel is never refused (T3).** `cancel` reads neither the green gate, nor the spec, nor the keys, nor the monthly limit. It works on an unreadable or already-edited job and removes `schedule.json`.
10. **Source may differ (T9).** The signed schedule carries its own `inputsText`; the green run's Inputs are only the prefill.

### E. The built-in fixes (PRD v1.99 T16-T19; five fixes), where each lands and the test that proves it

1. **T16 — `ran` only after the starter says it would accept (Part 4).** Test `tests/trigger-ledger-fixes.test.js`: "a persistently refused start writes a bounded number of rows". Setup: a queued file, `wouldAccept` answers not-ok (key missing); 500 ticks. Expect: 0 `ran` rows, 0 `unran` rows, exactly 1 `refused` row in `ledger.jsonl` (told once), the file still queued; then the key appears: the next tick writes exactly one `ran` and one `started`. (NEW test #1.) RULED (supersedes the earlier "known limit"): the session reaches `prepared` BEFORE `ran` is written, so install-needed and signing-gate refusals consume nothing; only a spawn error comes after `ran`, and it appends a `released` row so the file is retryable (bounded, C.4.5; test: a persistently failing spawn writes at most 3 release rows). See I.2.
2. **T17 — a torn line is skipped AND the next append starts on a fresh line, ONE commit (Part 1).** Test `tests/trigger-ledger-fixes.test.js`: "a torn line is skipped and the next append does not glue". Write a good row, then append a half line with no `\n`; `readLedger` returns the good row plus `skipped: 1`; `appendRow` a `ran` row; reread: both good rows parse and the torn line is its own line; the `ran` sha does not arrive again. (NEW test #2.) A second test keeps skip-only honest: a stub appender without the fresh-line half makes the glue test FAIL.
3. **T18 — a re-sign carries its queue over (Part 3).** Test `tests/trigger-set.test.js`: two files queued, re-sign with a different time and cap: both still queued, run in arrival order; re-sign with a different folder: each queued file gets one `dropped` row (`schedule-changed`) and a words row; cancel: the same with `schedule-cancelled`.
4. **T19a — the busy check is cheap (Part 5).** Test `tests/trigger-fire.test.js`: with 200 listed runs and 10 queued files, a tick reads the run list once, and spies on `summarizeRow`, `replayOne` and `resumePlanFor` record zero calls; with no schedule at all a tick reads no `runs.jsonl`.
5. **T19b — "since this signing" is keyed by the signature hash (Part 3 `read`).** Test `tests/trigger-summary-card.test.js`: an older signing's `refused` row; re-sign; set the injected clock BACK before the old row's time; the old red does not lead the new schedule's NEXT.
6. T13 kept fixes, in the PRD's words, each with a test: "Any content whose sha256 was in the folder at arm never runs, under any name." (Part 2: copy a baseline file under a new name, nothing runs.) Told once = "once per sha|outcome|why" (Part 4). Last outcome = "only rows under the current signature hash" (E.5). "the ran row is written only after the starter accepts; a refused start writes no ran row and at most one told row per key" (E.1). "A dropped queued file MAY re-arrive; only a RAN sha (and a baseline sha) is blocked for good." (Part 2: delete a queued file, it is dropped; put it back, it arrives again; a ran sha never does.)
7. Design rules from fwd (stashes `.claude/stash/2026-10-13-fwd-m9-shipped-v018.md`, `...fwd-v017-shipped-m9-start.md`): ONE append-only ledger per job, every row carrying the signature hash (B.3); a re-sign that CHANGES the folder or the kind does not carry the queue, it is written as dropped-with-reason, and the queue is carried only when folder and kind are unchanged (Part 3.7); every append starts on a fresh line and readers skip a torn line, in one commit (E.2); a POLL watcher, never `fs.watch` (EMFILE on hamr's machine); the scheduler is the ONLY writer of `arrived` and `ran` rows.

### F. Facts the code forces

1. A deterministic run opens no review door unless `--review-door` is passed (`src/kinds.js:277`, `src/userrun.js:628`); the panel never passes it today. A scheduled spawn passes it; a hand run is unchanged.
2. The Reuse list and the Reuse check read the SPINE outcome only (`server.js:2686-2705`, `authorroutes.js:268`); the panel names no registry, so bridge quarantine (`src/bridges.js:72`) never applies to a panel run. D.2 is therefore a panel-side predicate, not a registry change. No arbiter code is touched.
3. The `job` name is the join key between a schedule and `runs.jsonl` rows. A second job drawn under an existing name would share its schedule; the existing rule (names are kebab-case; the panel does not stop a repeat for panel-authored jobs, `jobNameTaken` looks only at `jobs/`) is not changed here. Flagged, not fixed.
4. Per-fire spec. The person signs the SCHEDULE (the hash in `schedule.json`). A file-trigger fire runs a spec that differs from it in `inputs` only (the arriving file replaces line 1), so its own `jobSpecHash` differs; the starter asserts that every other field is deep-equal and the workflow key is unchanged, then passes THAT hash to `run-u --approve`. A clock fire's spec equals the signed spec byte for byte (same hash). See I.4.

### G. Tests (mirror fwd `test/m9-*.test.js`; all under `tests/`, new files; each fails first)

1. `m9-clock.test.js` → `tests/trigger-clock.test.js` (slots, DST, catch-up, 2-minute grace, one fire for many missed).
2. `m9-files.test.js` → `tests/trigger-files.test.js` (stable polls, baseline, same sha never twice, symlink refused, new vs updated).
3. `m9-trigger-grammar.test.js` → `tests/trigger-field.test.js` (the spec field: every shape, unknown nested key red, `cadence` tolerated and ignored, old signed specs keep their hash, by-hand spec hashes unchanged, `workflowKey` ignores `trigger`, a draft carrying `trigger` refused by name, the interview/session no longer write `cadence`).
4. `m9-trigger-set.test.js` → `tests/trigger-set.test.js` (the two routes over real HTTP via `createPanelServer`: no-green refused with the fixed sentence, rubric without accept refused, edited job's old green refused, stale hash, bad shape, file target unusable, repo job refused for file kinds, set arms, cancel never refused, T18).
5. `m9-trigger-fire.test.js` → `tests/trigger-fire.test.js` (fire order busy then monthly then refused then started; each one row; recorded `spawnFn` argv holds `--approve <hash>` and `--review-door`; `trigger.json` written once with the catch-up mark; edit clears; T19a).
6. `m9-trigger-ledger-fixes.test.js` → `tests/trigger-ledger-fixes.test.js` (told once per key; E.1 and E.2 NEW tests; last outcome current signing).
7. `m9-am3-queue.test.js` → `tests/trigger-queue.test.js` (3 files at once run in arrival order, one `busy` row each while waiting; restart keeps the queue; deleted or changed before its turn dropped with a reason).
8. `m9-am5-schedule-buttons.test.js` → `tests/trigger-schedule-buttons-page.test.js` (page functions pulled by NAME with the brace-scan helper, never `indexOf('\n  }\n')`: button words follow When; click 2 starts nothing; card clears; Cancel / modify shows on a scheduled job; Schedule run shows only when the server says `canSchedule`).
9. `m9-summary-words.test.js` → `tests/trigger-words.test.js`; `m9-summary-card.test.js` → `tests/trigger-summary-card.test.js` (SCHEDULED / NEXT block and the Scheduled list cards, including the file-trigger card with no clock time, red NEXT, T19b, and "the next run does not wait for the Accept").
10. Added by this build: `tests/trigger-quarantine.test.js` (a scheduled green is not offered by `listReuseJobs`, `getStartFrom.outcome` is `'green-held'` and `/api/author/start` answers 409 for it, an honoured accept on the spine releases it, a hand green is unaffected); `tests/trigger-scheduler.test.js` (timer started and stopped by `createPanelServer`, no leaked handle, panel closed means no fire, `start`/`stop` idempotent, the `starting` set stops a double fire between spawn and row).
11. Helper: `tests/trigger-world.mjs` (a scratch home, an injectable clock, a fake `spawnFn` that records argv, a real `runs.jsonl` writer).
12. The page checks run the real `index.html` functions; a changed server route needs a panel restart (a browser refresh is not enough).

### H. Live walk (on hamr's real panel; hamr clicks it himself before any done claim)

1. Self-review and branch-review run BEFORE any exit signature (fwd skipped them).
2. A clock fire, two minutes ahead, on a deterministic job: the run starts by itself, shows "Started by the schedule", and waits for Accept (door open).
3. A folder file fire; the same file dropped again runs nothing; three files at once run one after another in arrival order.
4. busy (a hand run live when the slot comes); a monthly refusal (limit below the cap) with the red NEXT; a catch-up (panel closed across a slot, one run, marked); cancel; edit clears (edit a scheduled job, sign, the Scheduled card is gone).
5. A rubric job: accepted once (CLI today, or Part 8), then scheduled; its scheduled green is not offered by Reuse until Accepted.
6. Also walked (from fwd's exit): catch-up after the machine sleeps or suspends (not only after the panel was closed); edit clears the trigger; a job with no green run has NO Schedule run button; a queued file deleted or changed before its turn; a re-sign while files are queued (same folder: they stay and run; changed folder: dropped with a reason); a fired run shows `[▶] starting`, never `[?]`; after Sign schedule and after Cancel there is no Run button to click, the card is the empty New job card.
7. Phone width 390 and 320 by hamr in DevTools.
8. Provider and model first line of any paid run: DeepSeek, deepseek-flash. Hand hamr the full pasteable job text for every box.

### I. Open choices for hamr (each forced by the code; the PRD did not settle it)

1. **RULED 2026-10-14: A, build Part 8.** **Accept control in this build?** (A) Build Part 8, a minimal Accept button on the Run tab. (B) Leave it for the rubric work; until then a rubric job cannot be scheduled from the panel except after a CLI accept, and a scheduled green stays held until a CLI accept. Recommend A: T3 and T10 are not usable from the panel without it, and one owner can fill the Needs-you `Accept` pill too.
2. **RULED 2026-10-14: a missed or refused fire retries when things are back up (neither the slot nor the file is consumed by a refusal; spawn errors release the row). The A/B below is superseded.** **A refusal after the session started** (packages will not install, a signing gate fails) comes after `ran`. (A) The file or slot is consumed and the row says so in words; bounded, simple. (B) The file goes back to the queue with a backoff. Recommend A; B reintroduces the loop T16 removed.
3. **RULED 2026-10-14: A, accepted.** **Which jobs take a file trigger.** (A) Only plain-files (rubric) jobs; the arriving file replaces input line 1; a repo job is refused with words at the first click (a repo job's later inputs must be tracked files inside the repo, `src/jobblock.js:59`, so an outside file cannot be one). (B) Let the card pick the input line and allow repo jobs. Recommend A; repo-from-queue is the tickets piece (T20).
4. **RULED 2026-10-14: A, accepted (hash derived by code).** **Who signs each fire.** (A) The person signs the schedule; each fire's hash is derived by code and the starter proves the spec differs only in `inputs` (F.4). (B) Carry the arriving file outside the spec; needs a change in `run-u` (arbiter territory, parked). Recommend A.
5. **RULED 2026-10-14: A, accepted (headless sessions kept apart).** **A scheduled start while a person has an authoring session open.** (A) Headless sessions in their own map; neither blocks the other. (B) Share the one-session rule and write `busy`. Recommend A: B would lose a slot because someone was typing.
6. **RULED 2026-10-14: A. Provider down mid-run means no auto retry; the run shows in Needs you with Resume.** **Retries for a fired run that dies of a provider failure** (fwd ladder 408-409, 420: the trigger's +5 / +15 / +45 minute retries, never built in fwd). (A) None: the run ends `provider-red`, resumable by hand, nothing re-fires. (B) Re-fire at +5, +15, +45 minutes, each under the same cap and the monthly check. Recommend A; B is a new money path and needs its own cap rule. (hamr is being asked this now.)
7. **RULED 2026-10-14: A. N files mean N runs one after another; the door does not block.** **T7 and a folder of N files.** With a run waiting at the review door not counting as busy, a folder that receives N files starts N runs back to back, each one left waiting at its door, and only the monthly limit and each run's own cap stop them. Is that intended? (A) Yes, as ruled; the monthly check per fire is the only brake. (B) Add a brake: a new fire waits while any run of the job is live OR waiting at the door. B reopens T7. Recommend A as ruled, with the Scheduled card saying how many runs wait for Accept. (hamr is being asked this now.)

8. **RULED 2026-10-14: the Run tab, like fwd.** Which tab holds the SCHEDULED / NEXT block: both blocks move to the Run tab (ENDED/NEXT out of Audit, SCHEDULED twin directly below it, container above `#run-actions`). Part 7 deliverable: "move ENDED to the Run tab + SCHEDULED twin", with tests that ENDED is on the Run tab and gone from Audit. Part 7 is builder B's, not built in this pass.

### J. Where the PRD and the code disagree (to be written into the PRD as dated pointers after hamr rules; the PRD is not edited here)

1. T3 and T10 lean on Accept, but the panel has no Accept control (P9 v2 E.3: `server.js:869`, no door code under `src/panel/`). Part 8 / I.1.
2. T10 says the scheduled green is quarantined "like today's rubric greens" and that "Reuse's green check is unchanged". In the panel nothing is quarantined today: Reuse reads the spine outcome only, and a deterministic run opens no door without `--review-door`. D.2 builds the hold as a panel predicate and keeps `authorroutes.js:268` unchanged.
3. T2 "validator stops requiring `cadence`" is not enough: `workflowKey` must also drop `trigger` (C.3.3), or Reuse refuses every scheduled spec.
4. T1/T4 cite fwd's prose-line grammar (`src/trigger-line.js`). bareloop signs a JSON spec; the grammar is replaced by `validateTrigger` and the by-hand state is the ABSENT key (not `null`, which would change every new spec's hash). T2's "new jobs write `trigger` instead" therefore means new jobs write nothing until scheduled.
5. T7/T19 "read the live pid in `runs.jsonl`" misses the gap between the spawn and run-u's own row (`userrun.js:1578`); the `starting` set (C.5.5) closes it.
6. T9 says Source; the page and the spec call it Inputs, and for a repo job the later lines must be tracked files in the repo (`jobblock.js:59`), so a folder queue fits plain-files jobs only (I.3).
7. T16 is met for the queue AND the clock (RULED 2026-10-14, supersedes the earlier draft that consumed a refused clock slot): a refused or busy fire records only a told row and retries. A spawn error after the session started appends a `released` row so the slot or file stays retryable (bounded at 3 releases, C.4.5).
8. T8 "uses exactly those" caps: the run's enforced ceiling is cap minus drafting spent (and a rubric's calibration), because one cap covers drafting plus run (`authorroutes.js:421-433`).
9. T14 says "Schedule run button on the Run tab" and the SCHEDULED/NEXT block "at the top of the run page". bareloop's Run tab has no Run card (the Reuse card is the Chat tab's New job card) and its ENDED block is on the Audit tab; the schedule opens the Chat card in schedule mode and the block is new on the Run tab.
10. The fwd ledger line "a scheduled job with no run renders a plain div" is largely closed here: a schedule needs a green run, and the card opens the job's head run by time.
11. **RULED 2026-10-15: Fibonacci 1, 2, 3, 5, 8, 13, 21 min; stop at 60 min total; the schedule pauses and the job waits in Needs you (pill Check) until re-signed or cancelled.** (Replaces the first ruling of a flat 1 minute.) An `install-needed` refusal makes that job's next attempt wait the next step of `INSTALL_RETRY_STEPS_MS` (`src/panel/schedules.js`, injectable as `installRetrySteps`; ceiling `INSTALL_GIVE_UP_MS`, injectable). Attempts land at 0, 1, 3, 6, 11, 19, 32, 53 minutes; a wait that would pass 60 minutes in total is not taken: the door writes ONE `gave-up` row (the refusal words) under the current signature and the schedule is PAUSED, read from the ledger so a panel restart does not resume trying. Paused: no clock slot fires; folder files still queue as `arrived` but none runs. The count is in memory (a restart begins at 1 minute); a success, a cancel or a re-sign resets it. A re-sign through `Cancel / modify schedule` (the existing two clicks, no new button) writes a `resumed` row, so it unpauses even with an identical signature; queued files carry over by the existing same-folder rule. During a wait no row, no session, no copy and no install per tick; the refusal is told once. SCHEDULED / NEXT is red: `...Trying again in N minutes.` (`retryWords`, correct singular), and after giving up `Stopped trying after 60 minutes: <refusal words>. Fix it, then Cancel / modify schedule to start again.` (`gaveUpNextWords`, `src/schedulewords.js`). Needs you: `/api/runs` carries `gaveUp: [{job, pill, words, at, runId}]` (pill `Check`, hamr may reword, in `SCHEDULE_WORDS.gaveUpPill`; `at` = give-up date `MM/DD HH:MM`; `runId` = the job's newest run by time); the page draws it, never ages out. Tests: `tests/trigger-install-wait.test.js`.

### Addendum 2026-10-15: the schedule on Run, Job and Audit (PRD v1.102, aligned with fwdloop M9 am7)

Run tab, one block, same shape every time (frame red and the SCHEDULE row red when the last fire started nothing):

```
ENDED     10/15 13:40 · passed · Goal met.
NEXT      Accept it, or Reuse workflow.
SCHEDULE  When a new file arrives in ~/bareloop-inbox/
          last 10/15 13:40 · run-4 · passed · next: waiting for a new file

SCHEDULE  Every day at 08:15                               (problem: row and frame red)
          last 10/15 13:25 · refused: the destination does not exist · next: fix it in Cancel / modify schedule

SCHEDULE  By hand
```

Job tab, under Model: `Started  By the schedule: every day at 08:15 · 10/15 13:46` (hand run: `By hand · 10/15 13:46`) and `Schedule  every day at 08:15 · from run-7 · deepseek-flash · ~/bareloop-out` (or `none`). Audit: first row `started by the schedule · every day at 08:15 · slot 08:15 · from run-7`; on the origin run a folded `▸ schedule (k)` group of fires that started nothing, above drafting. The words live in `src/schedulewords.js`; `trigger.json` now also records `triggerKind`, `sessionId`, `originRunid`, `sig`, `lateMs`, `startedAt`; a `signed` ledger row records each signing's origin run.

Note 2026-10-15 (hamr "yes to all", PRD v1.102 item 7): line 2 variants. `last 10/15 13:40 · run-4 · passed · waiting for your Accept (the next run does not wait) · next: waiting for a new file` (not red); `last 10/15 08:15 · month used up: $0.01 left, needs $0.50 · next: raise the limit in Settings, or it starts on the 1st` (red); `last 10/15 13:20 · busy: a run of this job was still going · next Thu 10/16 08:15` (normal); `last 10/15 13:25 · refused: <reason> · next: tries again in 3 min` (normal while retrying; red with `next: fix it in Cancel / modify schedule` after the give-up or for a refusal that is not retrying).

Addendum 2026-10-15: Remove from Needs you (PRD v1.103; matches fwdloop DRAFT M11 am11 items 3-5). `needsStateFor` (`src/panel/server.js`) is the one rule for a run's Needs-you tag: `Accept` (a live door) is never removable; a `Resume` tag leaves after the person's removal that is at or after the stop it is for, or after 7 days. The click is `POST /api/runs/<id>/needs-remove` (`src/panel/runroutes.js`), which appends one `needs-removed` row through `appendNeedsRemoved` (`src/runlist.js`); `readRunList` skips it like any typed row, so the monthly limit, the run counter and the scheduler are unchanged (`tests/panel-needs-remove.test.js` proves the monthly figures byte-equal with and without the row). The Run detail carries `canRemoveFromNeeds` and `needsAudit`, worded on the server.

Note 2026-10-15 (PRD v1.102 items 8-9): a `monthly-exhausted` last fire is red and ends `next: raise the limit in Settings` only in the calendar month it happened (`sameMonthAs`); busy reads `busy: a run of this job was still working`; before the first fire line 2 starts `no run yet`; a schedule not armed yet ends `next: not armed yet` in normal colour.

Addendum 2026-10-15: Audit schedule section and run names in the small lists (PRD v1.104). `scheduleSection` on the Run detail (`scheduleExtrasFor`, `src/panel/server.js`): `{title, sign, head, rows:[{label,text}]}`, worded by `src/schedulewords.js` (`sectionThisRunWords`, `triesTailWords`, `scheduleSignFor`, `skippedWords`). Scope of `tries`: every busy / month-used-up / refused row in the job's own ledger (all signings), newest first, 7 shown, all counted in the head. Folded:
```
▸ schedule  [·] new file in ~/bareloop-inbox · from run-1 · 2 tries started nothing
```
Unfolded, a run the schedule started:
```
▾ schedule  [·] new file in ~/bareloop-inbox · from run-1
    this run    10/15 20:43  started by the schedule · new file litectx.md
    tries       10/15 20:57  refused: bareguard.md carries a known secret shape (sk- prefixed API key). Nothing started.
                10/15 20:43  busy: a run of this job was still working. Nothing started.
```
A hand run: `this run    10/15 13:20  by hand.` (origin run: `by hand. The schedule was set from this run.`). No schedule now: no section (a run a cancelled schedule started keeps `detail.startedAudit`). Small lists: `change2 · run-2`; `/api/runs` `scheduled[]` and `gaveUp[]` carry `runNo`.

## Addendum 2026-10-19 — Part 6 highlights and money as the check read it (bareguard 0.25.0 `full.evidence`; RULED A by hamr 2026-10-19)

Rulings it implements: PRD Part 6 amendment (signed B) and Part 6 rulings (2). bareguard contract: `node_modules/bareguard/bareguard.context.md` (`full.evidence`, RULED #66).

**Pieces**

1. SAVE (engine). `src/rubricstep.js` `gradeStep` calls `checkStep`; `r.full.evidence` was dropped. Write it to the run's spine as a NEW report-only record `rubric-evidence` `{step, iteration?, evidence, evidenceTotal?}` beside the existing `exit-eval`. Report-only: no verdict, gap, governor or money path reads it. Nothing written when `evidence` is empty. Masking: the `text` is a quote from the arbiter's own frozen page record; it goes through the same secret-shape masking every spine write uses.
2. READ (server). `/result` attaches to each result its evidence entry (match by line/step, check id, claim index = the result's index in the step file's `results[]`). Last record of the step wins (the one the verdict read). Old runs (no record) and malformed claims (no `text`) get no evidence: today's plain quote, unmarked.
3. SHOW (page). Proof fold shows `evidence.text` with `<mark>` on spans, escaped (offsets are UTF-16, half-open). Which spans: every span EXCEPT a bind-only membership token that is not this claim's (`canon` present and `matched` absent). Overlapping/duplicate spans merge. No panel-side substring search, ever (PRD Part 6 choice 2 must-fail).
4. MONEY. A money fact box shows the value plus its currency/unit spans as the page wrote them, in page order ("144 US dollars", "€344"), replacing the interim "$144". No evidence: today's text.

**Tests (each must be able to fail)**
- the spine gets one `rubric-evidence` per checked step, the real shape from bareguard (no stub of `checkStep`).
- mve5y8fa fixture: 3 results, each fold has 8 marks; "Departure time:" marked once per result, not 27 times.
- a span with `canon` and no `matched` is not marked; with `matched` it is.
- an old run (no record) and a malformed claim show the plain quote, no `<mark>`.
- the money box reads "144 US dollars" on the flight fixture.
- a quote holding `<script>` stays escaped inside and around marks.

**Live proof.** One new DeepSeek (deepseek-flash) flight run via Reuse (about $0.02), the orchestrator's own screenshot, then hamr's click-through.
