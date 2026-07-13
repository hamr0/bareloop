# bareloop — Integration Guide

> **Current through N2** (headless single-job loop: `runJob`, text + tool middles, the
> draft-PR hitl step); API sections fill in as build-ladder rungs land (PRD §10). What is
> settled — the boundary, the architecture, the refusals, the constraints — is settled
> for good. Per LIBRARY_CONVENTIONS §3 this file ships with the package and is the
> complete adopter contract; the README is only the pitch.

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

```js
import { runJob, jobSpecHash, makeSpine } from 'bareloop';
import { AnthropicProvider } from 'bare-agent';

const spec = {
  schema: 'job-v1', job: 'my-maintainer',
  description: 'fix src until the suite greens, then PR',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 }, budgetUsd: 1.5,
  writeScope: ['src/**'],
  steps: [
    { id: 'fix', mode: 'tools', tools: ['read', 'grep', 'write'],
      close: { type: 'predicate', cmd: 'npm test', expect: 0 }, class: 'hard' },
    { id: 'pr', close: { type: 'hitl', prompt: 'PR opened — review and merge?' }, class: 'hitl' },
  ],
  escalation: { mode: 'decision-ready' },
};

// human-signs-always: the approval record lives OUTSIDE the spec (a file the
// human writes); an edited spec is unapproved by construction
const approvals = [{ specHash: jobSpecHash(spec), signer: 'you', ts: new Date().toISOString() }];

const outcome = await runJob(spec, {
  approvals, workdir: '/path/to/checkout',
  provider: new AnthropicProvider({ model: 'claude-sonnet-5' }), // key from env
  emit: makeSpine('/path/to/checkout/run.jsonl'),
});
// 'escalated' at the hitl step is the happy path: the draft PR URL rides the
// decision-ready escalation on the spine; merge stays human, forever.
```

## All options

Two documents, two validators — the schema is the option surface; config-red before
tokens burn. The arbiter split is guarded from both sides by INEXPRESSIBILITY: the
workflow config cannot say `close`/`provider`; the job spec cannot say
`hooks`/`loop`/`memory`, any minting claim, or the shell-owned retry cap — all
unknown-field reds.

**Job spec (`schema: "job-v1"`, operator-owned — the arbiter's rulebook):**

| field | shape | notes |
|---|---|---|
| `job` | kebab-case slug | |
| `description` | non-empty string | |
| `provider` | `anthropic-api` | menu; part of the lineage key by definition |
| `conditions` | `{ providerPath?, closeVerbosity?, taskFraming?, scaffold? }` | declared keys only, string values — the environment label (consumed by the N3 lineage key; recorded on spines from run one) |
| `cadence` | `{ unit: hour\|day\|week, every: 1..30 }` | validated now, consumed at N5 (Scheduler) |
| `budgetUsd` | `0 < n <= shell cap` | ceiling chain: workflow ≤ job ≤ shell — each layer may tighten, never exceed |
| `writeScope` | array of contained globs | the operator's outer fence; same containment law as the workflow layer, same code |
| `steps` | array of `{ id, close, class, mode?, tools? }` | unique slug ids; every step names its close |
| `steps[].mode` | `text` (default) \| `tools` | `text`: the worker returns ONE artifact written to the shell's `target`; `tools`: the worker drives Gate-governed file tools (multi-file). Illegal on `hitl` steps (they run no loop) |
| `steps[].tools` | unique subset of `read\|grep\|write` | the SPEC-side tool grant (`TOOL_MENU`, frozen; defaults to all three) — the drafted config cannot express mode or tools; requesting `run` (`LOCKED_TOOLS`) reds with the DISTINCT code `request-red` (locked-but-listed: the red IS the admission evidence the ledger tallies; a typo stays `invalid-value`) |
| `escalation` | `{ mode: "decision-ready" }` | the pain channel is not optional |

**Close types and the hierarchy** (a close is data, never code; verdict-class laundering
is a named red `close-hierarchy`):

| type | fields (exact — extras red) | legal class |
|---|---|---|
| `predicate` | `cmd`, `expect` (int exit code) | `hard` |
| `gold` | `expected`, `compare: exact\|json-equal` | `hard` |
| `rubric` | `criteria` | `soft` only — can never mint automatically |
| `hitl` | `prompt` | `hitl` — a human IS the close |

Red vocabulary (both validators): `parse-error`, `unknown-field`, `missing-required`,
`invalid-value`, `bounds`, `duplicate-id`, `close-type`, `close-hierarchy`,
`secret-literal`, `scope-escape`, `fence-invalid` (a malformed `jobWriteScope` fence — attributed to `jobWriteScope`, never the workflow config), plus the workflow-side verb reds (`verb-illegal`,
`verb-placement`, `verb-params`, `slot-overflow`). The `secret-literal` sweep is
defense-in-depth against known token shapes — env-only loading remains the law, not the
sweep.

## Public API

*Landed through N2 (spine + shell + both validators + interpreter with text/tool middles
+ extractor + runJob). Still TBD: N3 (contrast-bit extractor live), N4 (verdict classes —
gold/rubric close EXECUTION), N5 (scheduler + budget ops + CLI), N6 (panel).*

### `makeSpine(file)` → `emit(type, data?)` — `src/spine.js`

Append-only JSONL event emitter bound to one file. `seq` monotonic per spine, `ts` stamped
last. Consumers are pure listeners; nothing reads the file back. Returns each event as
written.

### `ralph({ middle, close, capRuns, emit, redact?, closeTimeoutMs? })` → `'green' | 'escalated'` — `src/ralph.js`

The dumb outer shell: `while close-red and under-cap: run the middle`. `close` is an argv
whose exit code is truth (`runClose` is also exported); the red gap text feeds the next
iteration, tail-biased when bounded (400 head + 1500 tail — the assertion diff lives at
the end). `closeTimeoutMs` caps the close's wall clock (default 120s) — shell/operator
territory, inexpressible in any config. Escalations are decision-ready (category, options, spend); cap-halt is its own
category, never merged with "wrong". A thrown middle is relayed by its `category`
property (`cap-halt`, `gate-red`, …); an unnamed throw is `interpreter-red`. Close output
is scrubbed at capture (an injected `redact`, wired to bareguard by `interpret` with the
validators' full secret-shape inventory — Bearer/sk-/ghp_/github_pat_/AKIA/xox) so a
secret a checked command echoes never enters the append-only spine or a worker prompt —
a benign gap is byte-identical (secrets hard line; design law #7 intact).

### `validateConfig(input, { shellCapUsd?, jobWriteScope? })` → `{ ok, reds, config }` — `src/validate.js`

Deterministic schema-v1 predicate; never throws. Every failure is a named red
`{ code, path, detail? }` — reds before tokens burn. Returns the parsed config on ok
(single parse; `null` on any red). Pass the job spec's `writeScope` as `jobWriteScope`
and every workflow scope must fit inside the fence (path-boundary aware: `src2` is not
inside `src`) or it reds `scope-escape`; pass `min(shell cap, job budgetUsd)` as
`shellCapUsd` to complete the ceiling chain. Verb vocabulary bound from litectx
(`LOOP_SHAPES`, `SLOTS`, `VERBS` exported). `diffPaths(a, b)` returns changed JSON paths —
the one-knob mutation checker.

### `validateJob(input, { shellCapUsd? })` → `{ ok, reds, job }` — `src/job.js`

The operator-owned sibling (never an extension) of `validateConfig`: validates a
`job-v1` spec — see **All options** for the full schema, close types, and hierarchy.
Never throws on JSON text or plain parsed data (the ingest contract); returns the
parsed spec on ok, `null` on any red. Menus exported:
`CLOSE_TYPES`, `CLASSES`, `CLASS_BY_CLOSE`, `GOLD_COMPARE`, `CADENCE_UNITS`,
`PROVIDERS`, `CONDITION_KEYS`, `STEP_MODES`, `TOOL_MENU`, `LOCKED_TOOLS`.

### `jobSpecHash(job)` / `checkApproval(job, approvals)` — `src/job.js`

The pure half of **human-signs-always**: an agent may draft a job spec, but no job runs
until a human approves that exact version. `jobSpecHash` is sha256 over canonical JSON
(key-order independent) — any edit changes the hash, so an edited spec is unapproved by
construction. `checkApproval(job, approvals)` is a pure predicate over
`{ specHash, signer, ts }` records; the approval record lives OUTSIDE the document it
signs and is shell/human territory, never agent-writable. The N2 runner enforces it.
Reserved spine vocabulary (V7, machinery-free until job #1 surfaces one):
`coordination-red` — a failure between units (scope contention, step order, store
races), never to be folded into worker/interpreter reds.

### `interpret(configRaw, opts)` → `'green' | 'escalated' | 'config-red'` — `src/interpret.js`

The only code that reads a config. Composes bareguard `Gate` (write scopes, USD budget),
litectx (recall/compress/stash/remember hook ops), and the bareagent `Loop` under `ralph`.
The provider and the close arrive from the shell, never the config. Optional `revisor`
seam fires once after `STALL_REDS` consecutive close reds; the interpreter owns acceptance
(arbiter-touch / cap-touch / validation reds), judged and installed on the candidate's
PARSED form. Emits `config-final` — the run-as-executed config (design law #2) — on every
run. Pass the job spec's fence as `jobWriteScope` (or `null`/omit for no fence): it is
enforced HERE — the one choke point where a config becomes a Gate — on entry AND on every
revision candidate, so a workflow scope outside the operator's fence reds before tokens.
An enforcement belt resolves every scope and refuses to build a Gate that escapes the
workdir, independent of validator correctness (law #1).

Two middles, chosen by the step (`mode`/`tools` opts — SPEC-side territory threaded by
the runner, never the config's): **text** (default) extracts ONE artifact from the
response (`artifact-red` on a non-artifact: writes nothing, names its own axis on the
spine, the retry is told why) and writes it to `target` behind a manual gate check —
a fence counts as the artifact's wrapper only when it opens within the first 5 lines
(the chatty-preamble shape); deeper fences are the artifact's OWN content and the whole
reply is the artifact (fence-heavy artifacts — doc generators, markdown emitters —
belong in tool mode, where nothing is parsed);
**tools** offers only the granted shell tools (`read|grep|write`) to the worker's Loop,
every call policy-checked against the SAME fence (tool-call paths resolve exactly as the
tools resolve them — workers must use absolute paths; a relative spelling reds at the
fence and the deny reason teaches the retry), reads pinned to the workdir, a denial
streak stopping as `gate-red`. In tool mode there is no artifact to extract — the close
judges the tree; on-green `remember` retains the worker's change summary.

### `runJob(spec, { approvals, workdir, provider, emit, target?, capRuns?, shellCapUsd?, closeTimeoutMs?, execCmd? })` → outcome — `src/run.js`

The N2 runner — the shell's top layer; composes everything below it and interprets
nothing itself. Sequence: **approval gate** (human-signs-always — refuses an unapproved
spec before ANY provider call: `unapproved-spec`) → **primitive smoke** (litectx
known-answer round-trip before tokens: `smoke-red` — silent degradation throws nothing)
→ **sequential per-step interpret loops** under the ONE cumulative ledger (each step's
ceiling is `min(job budget − spent, shell cap)`; a step that cannot green stops the job:
`step-red:<id>`) → the **hitl step** opens a draft PR deterministically (branch → stage
the job fence ONLY, so spines/audit logs never enter the PR → commit → push →
`gh pr create --draft`) and ends `escalated` BY DESIGN, the PR URL riding the
decision-ready escalation; a PR failure is `pr-red` and the escalation still fires with
the error. Model tools never touch git — `execCmd` is the shell-owned process seam
(defaults to real spawnSync). Outcomes: `green | escalated | unapproved-spec | job-red |
smoke-red | config-red | pricing-red | provider-red | cap-halt | close-unsupported |
step-red:<id>` — `provider-red` is a transport throw from the drafting call (spend
unknown, F6); `cap-halt` is drafting spend consuming the whole job budget before a
valid config existed. Both are decision-ready escalations with a terminal `job-end`:
the spine never dangles. A text-mode job invoked without `opts.target` is a `job-red`
before ANY provider call (and `interpret` itself throws a TypeError for direct
callers) — reds-before-tokens applies to the call, not just the spec.

**Resume-to-cap (close-first skip):** every predicate step runs its close FIRST, before
any tokens (`close-precheck` on the spine, output scrubbed at capture like every close).
Already-green skips the step for zero tokens as a DISTINCT record — `step-end` outcome
`already-green`, never plain `green`: nothing was done, so it mints no learning credit
and runs no on-green retention. A close that cannot RUN is a `broken-close` escalation
before any provider call. **Config drafting is deferred** to the first step that
actually needs a worker — the sealed one-shot + one-redraft is unchanged, and a config
is always drafted fresh per run (never inherited), but a rerun whose closes all green
pays ZERO provider calls. So the resume story is: a `cap-halt` stop is the checkpoint
(the workdir + the closes), the human raises `budgetUsd` (a new spec hash — re-sign),
and the rerun picks up exactly where the budget died.

**Unpriced is never free (F6):** the ledger halts `pricing-red` — decision-ready — on
any result whose cost is the honest null OR whose `unpricedRounds > 0` (a partially
unpriced run under-counts); a null cost never accumulates as $0, so the hard cap cannot
be gamed by an unpriced provider path. N2 bounds (honest): `gold`/`rubric` closes refuse
`close-unsupported` (execution lands at N4); `target` is required only for text-mode
steps.

### `extractRules({ config, provider, priorRules, revisionDiff? })` — `src/extract.js`

One sealed LLM call distilling a lineage's rules from ledger facts after a green run.
`MAX_RULES`/`MAX_RULE_CHARS` bounds enforced mechanically post-call, rejected whole.
Malformed output is a red as data (`rules: null`) — the caller keeps prior rules.

### `updateLedger({ ledgerFile, spineFiles })` → `{ appended, fold }` — `src/ledger.js`

The upstream ledger: spines fold into ONE append-only incident JSONL both the consumer
(workflow health) and the maintainer (upstream asks) read. Spines stay ground truth —
the ledger is derived and reconstructible (delete it, re-run the collector: same fold).
**Pass the FULL spine corpus each time**: counts are totals computed from what you pass,
a `lib-incident` row appends only when a key is new or its count grew (idempotent over
the same corpus), and `seq` continues monotonically across appends. Keys are
`lib:verb:class:sig` — `sig` hashes the path/number-normalized detail, so the same bug
across runs dedupes and distinct bugs in one verb don't merge. Classes, worst-first
(`LEDGER_CLASSES`, frozen): `silent-degradation` (a failed `primitive-smoke` — the class
failures can't derive), `runtime-red`, `provider-red`, `pricing-red` (F6), possibly-dormant
`capability-gap` (cap-halt + request-red in one spine), `broken-close` (consumer-attributed),
`request-red` (admission demand for a locked verb — keyed on the red's structured
`verb` field, prose-quoted verb as legacy fallback), `retention-red`, `config-red`
(drafting friction — attributed to bareloop's own schema/prompt). Deliberate exclusions:
bare `cap-halt` (a budget story), `close-verdict`/`artifact-red` (worker stories),
`gate-red` (governance working as intended), `pr-red` (operator environment).
`suggestedAsk` on every row is a template seed for an upstream ask — filing stays human;
status rows (`open → filed → fixed → consumed`) are human-appended, and the fold shows
the latest per key. Pure pieces exported for custom folds: `classifyIncidents(events,
{spine?})`, `foldLedger(rows)`, `ledgerDeltas(fold, occurrences)`. CLI lands at N5; the
panel reads the same file at N6.

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
