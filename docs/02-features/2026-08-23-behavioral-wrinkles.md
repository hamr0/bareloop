# Behavioral wrinkles — the floor plan

Date: 2026-08-23. Status: OPEN worklist, handoff doc. Nothing here is approved.
Companion to `../SCALING_AGENTS_PRIMITIVES.md` (FEATURE 2 / Layer 1d).

## What this doc is

A list of agent *behaviours* that cost money or waste a run, and whether anything in
bareloop watches for each one. The value is the **NO** rows — holes nobody has counted.

This is **not** new plumbing. The spine already records every tool call. Every wrinkle
below is answerable from the archive we already paid for. What is missing is anyone
asking the question.

## Rules for whoever picks this up

1. **Verify before you believe.** Every "watched / not watched" cell below was written
   from a source skim, not a proof. Re-derive it from `src/` before acting on it. If a
   cell is wrong, fix the cell — that is a real contribution.
2. **$0 archive replay first, always.** Before proposing any detector, replay the archive
   and measure how often the behaviour actually occurs and what it cost. A wrinkle that
   never fires on 147 runs is a wrinkle to close, not to build. NO PAID FIRE to test a
   premise an archive read can settle.
3. **The instrument can be blind.** This programme has shipped blind instruments at least
   five times (ledger missing cache tiers; gate audit collapsing reads; `git status` as
   "did it write?"; a token reader using invented field names; a crash guard counting
   after its own filter). Before believing a zero, prove the reader can see a one.
4. **One wrinkle at a time.** Each becomes its own proposal to hamr. Do not bundle.
5. **Arbiter territory is PARKED, not decided.** Anything touching verdict routing,
   budgets, caps, close semantics, or what the runner accepts gets named, scoped, and
   left for hamr's explicit go. Detectors that only *report* are the safe class.
6. **A frozen rule without a wired detector is prose.** That is the whole reason this doc
   exists. But the converse also holds: a detector with no decided response is noise.
   Say what a firing means before building the firing.

---

## WATCHED (believed covered — verify anyway)

| # | Behaviour | Mechanism | Note |
|---|---|---|---|
| C1 | Goes silent / hangs | `src/stall.js` — `STALL_MS` 300s, `MAX_STALLS` 3, cumulative per worker | Hard-won: F66 (idle-socket timer), F67 (outside watchdog) |
| C2 | Thrashes the same failing exit | `src/trend.js` — `FIX_STRIKE_LIMIT` 2, progress-governed | F78/F79/F85 |
| C3 | Re-reads a file it already holds | `src/readshim.js` — delivered-keyed ledger | **ARM-GATED, OFF by default.** See W5 |
| C4 | Fixates on one file | Layer R | **OFF by default** (F41: fixation extinct on measured jobs). See W5 |
| C5 | Burns money without limit | `src/ledger.js` — per-round metering, hard cap | Cap binds BETWEEN rounds; can overshoot by one round |
| C6 | Burns time without limit | wall / `src/clock.js` | `maxWallMs` has no default, always operator-set |
| C7 | Cheats its own check (suppressions) | authored close stage | F87/F99. **Per-job, not systemic** — a job whose close lacks the stage is unguarded |
| C8 | Reads the arbiter's books | `fs.deny` in readScope | Structural, not a detector |

---

## NOT WATCHED (the point of this doc)

### W1 — repeated identical searches
`readshim` wraps the **read** tool only (`wrapRead`, `src/readshim.js`). A worker that
runs the same `shell_grep` pattern nine times pays nine rounds and nothing notices.
- **First move:** archive replay — count identical (tool, args) pairs per run, and price them.
- **Open question:** is a repeat always waste? A grep after an edit is legitimately different.
  The dedup key probably has to be (pattern, tree-state), not (pattern).

### W2 — loops across steps
`trend.js` is step-local. The halt readout is chain-spanning but reads money and time, not
behaviour. A plan that ping-pongs step A → B → A across a replan has no watcher.
- **First move:** replay archived plans for repeated step signatures across replans.
- **Caution:** memory doctrine says the halt readout and the strike governor have different
  goals and must never be mixed. A cross-step detector is a THIRD instrument, not a merge.

### W3 — no generic repeat-call detector
C3 and W1 are both special cases of "the agent did the same thing twice and got the same
answer." There is no general instrument.
- **First move:** decide whether the general form is worth it, or whether per-verb
  special cases (read, grep) cover the real spend. Replay answers this.

### W4 — stale retrieval index
`ctx_get` staleness on a *pointer* is handled in-band (`serveStale`, F108). Nothing checks
whether the litectx **index** is older than the tree at run start.
- **Why it matters:** a stale index manufactures phantom defects (known), and flipping
  `embeddings` on an existing index computes no vectors at all (known) — both fail
  silently, as a clean answer rather than an error.
- **External corroboration:** the Bhaumik talk's one production incident was exactly this
  class — a policy document updated but never re-embedded, so the agent answered
  confidently from stale content. Detected only via a user-feedback drop, not by any check.
- **First move:** cheapest possible preflight — compare index mtime/commit against HEAD,
  report only. $0. Report-only, so not arbiter territory.

### W5 — detectors that ship OFF
`readShim` (C3) and Layer R (C4) both default to off, for reasons that were good when
written. Nothing re-opens that question when conditions change.
- **Standing hazard, already in memory:** "a capability withdrawn for good reasons under
  one condition can stay silently withdrawn long after that condition lifts."
- **First move:** give each default-off detector a written RE-OPEN CONDITION (what would
  have to become true) and a place that condition gets checked. Prose, $0.

### W6 — no eval-cost governance
Every battery re-runs everything. There is no subset/full tiering.
- **Borrowed directly from the talk (34:54):** run a small subset on a change, the full set
  only at merge. He names behavioral evals specifically as the expensive ones.
- **Ties to FEATURE 1 (the bench):** a standing golden set is only affordable with this. Design the
  tiering INTO the golden set, not after it.

### W7 — tool selection pathology
Known and measured: recall has zero zero-hit results yet is drafted 1.4% of the time versus
`read` at 99.3%. It is a selection problem, not a performance one. No run-level instrument
reports it.
- **First move:** per-run verb-mix line in the run summary. Report-only.
- **Caution:** a steer toward retrieval verbs already walked a worker into stale reads
  once (F108). Reporting is safe; steering is not, and is not proposed here.

### W8 — no behavioral summary exists at all
There is no place a run says "N calls, M repeats, K verbs used, X spent on repeats."
Every wrinkle above is invisible partly because there is no surface where an empty row
would be conspicuous.
- **First move:** one report-only block appended to the run summary, built entirely from
  the spine. Nothing gates on it. This is probably the highest-value single item here,
  because it makes W1–W7 self-reporting instead of requiring a doc like this one.

---

## Deliberately NOT on this list

- **PII / NER prevalidation** (talk, 22:25 — 47 breaches caught). bareloop's patients are
  local repo copies and the secret-shape inventory already scrubs at capture in the shell
  primitive. Not applicable; recorded so it is not re-proposed as a gap.
- **Auto-retry / circuit-breaker on failing tool calls** (talk, 14:22). `Retry` on transport
  failure is deliberately UNWIRED — a timeout may already have been processed, so a retry
  could pay twice. Wiring it is reserved for hamr. Our nearest equivalent is the standing
  rule that a repeating casualty class is a CONDITION, not a casualty: stop and re-probe.
