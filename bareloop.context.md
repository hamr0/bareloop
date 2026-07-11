# bareloop — Integration Guide

> **DRAFT — pre-code.** bareloop is at the name-reservation stage; the API sections below
> fill in as build-ladder rungs land (PRD §10). What is already settled — the boundary,
> the architecture, the refusals, the constraints — is settled for good and recorded now.
> Per LIBRARY_CONVENTIONS §3 this file ships with the package and is the complete adopter
> contract; the README is only the pitch.

## What this is

**"Automate this job — I don't know the best workflow."** bareloop runs tasks that are
repeated, long, and verifiable: you describe the job and its checkpoints; an agent authors
the workflow scaffolding (a constrained, validated config — never freeform code); runs
execute under an un-gameable outer gate; the scaffolding improves across runs through
verdict-gated, run-as-executed inheritance with ledger-counted attribution. Every
inherited rule carries the green that minted it and the contrast that attributed it.

## What bareloop is and is not

- **Is:** a place where repeated, verifiable jobs get better at themselves — job model,
  authored-workflow lineages, verdict classes, inheritance with receipts, a panel to
  operate it.
- **Is not:** a general agent, a swarm, or an orchestrator framework. One-off or small
  jobs are out of scope — that's a CLI session, not a bareloop job.

## Minimal usage

*TBD at N2 (first headless single-job loop). Will show: define a job (description,
checkpoints + verdict classes, budget, cadence, provider) → run → watch the spine.*

## All options

*TBD at N1 (job/close schema + validator lands). The schema is the option surface;
config-red before tokens burn.*

## Public API

*Landed through N0 (spine + shell + validator + interpreter + extractor). Still TBD:
N1 (job/close schema), N2 (headless job loop), N3 (contrast-bit extractor), N4 (verdict
classes), N5 (scheduler + budget ops), N6 (panel).*

### `makeSpine(file)` → `emit(type, data?)` — `src/spine.js`

Append-only JSONL event emitter bound to one file. `seq` monotonic per spine, `ts` stamped
last. Consumers are pure listeners; nothing reads the file back. Returns each event as
written.

### `ralph({ middle, close, capRuns, emit })` → `'green' | 'escalated'` — `src/ralph.js`

The dumb outer shell: `while close-red and under-cap: run the middle`. `close` is an argv
whose exit code is truth (`runClose` is also exported); the red gap text feeds the next
iteration. Escalations are decision-ready (category, options, spend); cap-halt is its own
category, never merged with "wrong". A thrown middle is relayed by its `category`
property (`cap-halt`, `gate-red`, …); an unnamed throw is `interpreter-red`.

### `validateConfig(input, { shellCapUsd? })` → `{ ok, reds }` — `src/validate.js`

Deterministic schema-v1 predicate; never throws. Every failure is a named red
`{ code, path, detail? }` — reds before tokens burn. Verb vocabulary bound from litectx
(`LOOP_SHAPES`, `SLOTS`, `VERBS` exported). `diffPaths(a, b)` returns changed JSON paths —
the one-knob mutation checker.

### `interpret(configRaw, opts)` → `'green' | 'escalated' | 'config-red'` — `src/interpret.js`

The only code that reads a config. Composes bareguard `Gate` (write scopes, USD budget),
litectx (recall/compress/stash/remember hook ops), and the bareagent `Loop` under `ralph`.
The provider and the close arrive from the shell, never the config. Optional `revisor`
seam fires once after `STALL_REDS` consecutive close reds; the interpreter owns acceptance
(arbiter-touch / cap-touch / validation reds). Emits `config-final` — the run-as-executed
config (design law #2) — on every run.

### `extractRules({ config, provider, priorRules, revisionDiff? })` — `src/extract.js`

One sealed LLM call distilling a lineage's rules from ledger facts after a green run.
`MAX_RULES`/`MAX_RULE_CHARS` bounds enforced mechanically post-call, rejected whole.
Malformed output is a red as data (`rules: null`) — the caller keeps prior rules.

## Architecture

Three layers. An **outer shell** (dumb, permanent): per-run budget cap via bareguard,
retry cap, verdict collection, escalation routing — stateless across runs; nothing inside
negotiates with it. An **emergent middle**: the authored workflow config — steps, per-step
verdict class, memory binding, write scopes — schema-validated. A **floor**: append-only
JSONL spine (single source for every UI), litectx store per job, per-run ledger. Built on
the bare suite: bareagent, bareguard, litectx, barebrowse, baremobile — the full surface
is disclosed to the authoring agent; only admitted verbs are callable per job.

## What's NOT in bareloop, and why

- **No agent-authored arbiters.** Closes, budgets, caps, merge/publish decisions live
  outside the emergent part, permanently — the product's trust story depends on the gate
  being un-gameable (adaptlearn's no-breach record is the evidence).
- **No freeform code as scaffolding.** Configs are schema-validated; config-red before
  tokens burn.
- **No self-adjusted budgets — ever.** Hard cap per run, cap-not-estimate.
- **No swarm / orchestrator frameworks; one process per run.** Fewer moving parts is the
  point of the name.
- **No local shims over baresuite gaps.** A missing/broken primitive is fixed upstream in
  its own package and consumed by version bump.
- **Merge stays human, forever.** For repo jobs the PR is the escalation artifact; a
  human is the close.

## Gotchas

*TBD from real adopter friction; recorded here as they're found (repo-side friction goes
to `docs/FINDINGS.md`).*

## Constraints

- **Node >= 20** (bareguard's floor governs the suite).
- **Pure ESM + JSDoc**; generated `.d.ts` ship, never hand-written (LIBRARY_CONVENTIONS §2).
- **Secrets load from the environment** and never enter the spine, configs, or ledger —
  an append-only record that captures a key captures it forever.
- **The spine is append-only** and the single source of truth; every UI (panel included)
  is a pure observer of it.
