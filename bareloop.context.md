# bareloop — Integration Guide

> **Current through Layer 2 (ACCEPTED, F47)**: the plan-v1 flow — a four-field job shape,
> agent-authored validated plans, in-run check exits — validated end-to-end on the
> real-model acceptance battery (3/3 conversion, 3/3 over the owned bar, the agent
> composing its own check exits). **The plan shape is now the ONLY shape**: the legacy
> operator-authored `steps[]` path, config-v1 and the draft-PR hitl step were deleted
> 2026-07-26 (PRD v1.32), so `interpret`, `validateConfig` and `extractRules` are gone from
> the public surface — a breaking change. `hitl` and `soft-green` return as a Layer 3
> decision, rebuilt in the plan shape rather than ported. Runs on two worker surfaces —
> the API `Loop` and, for
> `clipipe-subscription`, the CLI's native tool channel (module 4d). API sections fill in
> as build-ladder rungs land (PRD §10). What is settled — the boundary, the architecture,
> the refusals, the constraints — is settled for good. Per LIBRARY_CONVENTIONS §3 this
> file ships with the package and is the complete adopter contract; the README is only
> the pitch.

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
  // the human signs the DESTINATION; the agent authors the road
  goal: 'Fix any failure in src/ so the suite passes.',
  verdictType: 'green',
  // the close is an ORDERED LIST of named stages (PRD v1.28) — the check menu
  // DERIVES from it; there is no separate `checks[]` field to author
  close: [{ name: 'suite-green', cmd: 'npm test', expect: 0 }],
  tools: ['read', 'grep', 'write', 'edit'],
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
// 'green' means the operator's close passed. Anything else is a named,
// decision-ready stop on the spine — never a silent partial success.
```

## All options

Two documents, two validators — the SIGNED job spec (`validateJob`) and the AGENT-authored
plan (`validatePlan`). The schema is the option surface; every red lands before tokens
burn. The arbiter split is guarded by INEXPRESSIBILITY in both directions: the plan cannot
say `close`/`provider`/`budget`, and the job spec cannot say `hooks`/`loop`/`memory`, any
minting claim, or the shell-owned retry cap — all unknown-field reds.

**Job spec (`schema: "job-v1"`, operator-owned — the arbiter's rulebook):**

| field | shape | notes |
|---|---|---|
| `job` | kebab-case slug | |
| `description` | non-empty string | |
| `provider` | `anthropic-api` \| `clipipe-subscription` | menu (`PROVIDERS`); part of the lineage key by definition. Only `anthropic-api` is guaranteed (F48); `clipipe-subscription` drives the worker natively and needs `opts.nativeProvider` |
| `conditions` | `{ providerPath?, closeVerbosity?, taskFraming?, scaffold? }` | declared keys only, string values — the environment label (consumed by the N3 lineage key; recorded on spines from run one) |
| `cadence` | `{ unit: hour\|day\|week, every: 1..30 }` | validated now, consumed at N5 (Scheduler) |
| `budgetUsd` | `0 < n <= shell cap` | ceiling chain: workflow ≤ job ≤ shell — each layer may tighten, never exceed |
| `maxWallMs` | optional integer ms `>= MIN_WALL_MS` (one close timeout) | the run's wall clock. **NO DEFAULT, by ruling** — absent means time-unbounded *by explicit operator choice*, never by fallback (F45: a defaulted cap is a silent second ceiling). Enforcement is a BETWEEN-ROUND deadline, so the honest worst case is `maxWallMs + closeTimeoutMs` and both numbers are reported (`loop.stop()` cannot cut an in-flight call — F61 measured 500ms→4,018ms). Operator-only, tighten-only; adding or changing it changes the spec hash |
| `writeScope` | array of contained globs | the operator's outer fence; the plan's own scopes must fit inside it, same containment code |
| `steps` | RETIRED | operator-authored `steps[]` was deleted (PRD v1.32); a spec carrying it reds `shape-retired:steps` by name rather than half-running |
| `escalation` | `{ mode: "decision-ready" }` | the pain channel is not optional |

**The plan shape — the only shape** (Layer 2, design record 2026-07-21). The AGENT authors
the step plan at run time (gated by `validatePlan`); the human signs only:

| field | shape | notes |
|---|---|---|
| `goal` | non-empty text | what the agent plans against |
| `verdictType` | `green` \| `soft-green` \| `hitl` | declared radio, never inferred (`VERDICT_TYPES`, frozen). v1 ADMITS only `green`; declaring `soft-green`/`hitl` reds `request-red` with the type as a structured `verb` field (declared-but-locked — the tool-menu pattern) |
| `close` | **an ORDERED LIST of named stages** `[{ name, cmd, expect, judged?, gapKeep?, offer?, needs? }, ...]` (PRD v1.28), or a close object (table below) **only** for the declared-but-locked verdict classes | the destination, the only thing hand-authored; the check menu DERIVES from it (below). The plan flow executes a staged close directly and adapts a bare `predicate` object into a one-stage list; a `gold`/`rubric`/`hitl` object close validates (the declared-but-locked verdict classes still parse) but the plan flow refuses it at runtime as `close-unsupported` — it names no command to run |
| `checks` | **RETIRED** (PRD v1.28/v1.32) | hand-authored checks are gone, not merely discouraged: declaring `checks` reds `checks-derived` by name. The check menu is DERIVED from the close's own stages instead — see **Staged close** below. The hazard this removes is measured, not theoretical: job #5's three hand-written checks were re-implementations of three stages the close already ran, and a hand-carved copy can drift LENIENT (the worker passes the operator's ruler and fails the real inspection) |
| `tools` | optional unique subset of `TOOL_MENU` (14 verbs, below) | the CEILING every plan step's grant must fit inside (defaults to the full menu); `run` is `LOCKED_TOOLS` and reds `request-red` — locked-but-listed, and the red IS the admission evidence the ledger tallies (a typo stays `invalid-value`). A ceiling of write-class and store-class verbs ONLY reds `invalid-value`: the scout surveys read-only, so it would be handed an empty menu and survey blind |

**`TOOL_MENU` — the worker's 14 verbs, in four components** (`src/job.js`; the verb→tool map
is `TOOL_BY_VERB` in `src/tools.js`). The menu is an INVENTORY: every verb is an existing
bare-agent or litectx primitive, none was built for it. A granted component's strategy line
ships with the grant (`COMPONENT_STRATEGIES` — capability without strategy is inert, F19).

| component | verbs | class |
|---|---|---|
| write | `write` · `edit` | tree writes, judged by the signed `writeScope` fence — `edit` (BA-13) is the anchored exact-once replace and goes through that SAME fence, not a weaker one |
| select | `read` · `grep` · `recall` · `get` · `impact` · `related` · `recent` | read-only; every one is judged as a `read` action by that same fence, so the deny list applies through every door |
| compress | `compress` · `peek` | read-only (a signature tier; a stash's head/tail) |
| isolate | `stash` · `remember` · `forget` | STORE writes (the `.litectx` store, never the tree) — their own gate action types, so a store park can never be counted as a tree write by the F32 `workerWrites` instrument. **Not read-capable** |

`run` is locked at every layer and always will be: a worker that can run commands can run
its own close. `ctx_recall` serves BOTH axes — code pointers, plus any note written with
`ctx_remember`, returned on a line labeled `memory` with the note's BODY inline (capped at
400 chars). A note is a conclusion, not a pointer: there is no worker verb that dereferences
a memory id, so a pointer-only reply would be inert. **`recall`, `get` and `impact` share ONE
0-based line space** — the index's own index positions, one lower than the line an editor
shows — and every one of the three says so in its own tool contract. The numbers are
interchangeable handles: `impact`'s def range dereferences through `get` verbatim, and
`recall` prints the same number for the same chunk. Rendering any one of them 1-based was
tested and REFUTED: it would print two numbers for one chunk and turn `get`'s clean
chunk-boundary refusal into a guessing game.

**The store is caller-owned, and it is a LIVE cross-run channel.** `runJob`/`runPlan` root ONE
litectx store at `<workdir>/.litectx` (`new LiteCtx({ root: workdir })`, `src/planrun.js`) — an
on-disk SQLite index that OUTLIVES the run. A note written with `remember` lands there as a
durable `fact`, and `ctx_recall` reads that tier back on any later run against the same
workdir: agent notes persist across runs by default. The library ships NO reset — it never
deletes the store, because what a run inherits is the caller's decision, not the runner's. A
caller who wants a COLD baseline (an inheritance-OFF control arm, a reproducible re-run, any
contrast between two runs) must remove `<workdir>/.litectx` itself between them; the in-repo U
runner does exactly that with a one-line `rmSync`. The store is a derived, self-healing cache
by litectx's own contract, so the only cost of deleting it is the re-index.

**Staged close — the check menu DERIVES from it (PRD v1.28, `checkMenu` in `src/job.js`).**
Every stage is a `predicate` command body (the same `cmd`/`expect`/`judged?`/`gapKeep?`
contract the single close object has always used) plus:

| stage field | shape | notes |
|---|---|---|
| `name` | unique kebab-case slug | the plan references it via `check-passes(name)`; duplicates red `duplicate-id` |
| `offer` | optional boolean, default offered | `offer: false` hides the stage from the derived menu — it never reaches the agent. For a stage that cannot stand alone as a ruler: a PRECONDITION (e.g. "the seed commit exists" — passes instantly, teaches nothing) or the **final grading stage** — of the six specs in `jobs/`, four hide a final `verdict` stage and two hide a `changed-from-seed` precondition instead (a per-spec convention, not a schema rule — nothing stops a stage named last from being offered except the spec author remembering to set the flag; preflight's `check-menu` event always names the full menu either way, so a forgotten flag is visible in the run's own record) |
| `needs` | optional non-empty array of EARLIER stage names | a stage that reads what an earlier stage built (e.g. "the public API matches what an earlier stage emitted") names its prerequisite chain; picking it via `check-passes` runs the chain first, then the stage itself. Every name must be declared before this stage (`invalid-value` otherwise); `needs` + `offer: false` together is incoherent (`invalid-value`) — a stage with a chain to run must be reachable |

The stages run in declared order as the close itself; the first red renders the verdict and
later stages never run. `checkMenu(close)` returns only the offerable stages (each with its
run chain, prerequisites first); a hidden or partial menu is an acceptable case, never a
failure — `check-menu` on the spine reports `hidden` + `meaning` whenever the derived menu is
narrower than the stage list.

**Close types and the hierarchy — the OBJECT form, which survives only for the
declared-but-locked verdict classes** (a close is data, never code; verdict-class laundering
is a named red `close-hierarchy`). The go-forward shape is the staged list above; a
`predicate` object is legal shorthand for a one-stage list and the plan flow adapts it, but
`gold`/`rubric`/`hitl` validate and then refuse at runtime (`close-unsupported`) since v1
admits `verdictType: green` only:

| type | fields (exact — extras red) | legal class |
|---|---|---|
| `predicate` | `cmd`, `expect` (int exit code), `judged?`, `gapKeep?` | `hard` |
| `gold` | `expected`, `compare: exact\|json-equal` | `hard` |
| `rubric` | `criteria` | `soft` only — can never mint automatically |
| `hitl` | `prompt` | `hitl` — a human IS the close |

**`judged` — the judgment-rendered signal (optional, `predicate` only; PRD v1.11 / F17).**
`{ pattern: string, min: int >= 1 }` — a regex with **exactly one** capture group (zero and
more-than-one both red at validation), run over the close's own (redacted) output to extract
how many things it actually judged, against a declared floor. The count is read from group 1
only, so an alternation must use non-capturing branches — `(?:tests|passed:) (\d+)`, never
`(?:tests (\d+)|passed: (\d+))`, whose second branch would leave group 1 undefined and stamp
an exit-0 green as `crashed` (F40). **Why it exists:** an exit code cannot distinguish "the suite ran and failed" from
"the suite crashed at load" — and it cannot distinguish a real green from a close that ran
**no tests at all**. Pointed at a tree with no suite, `node --test` exits 0, and without
`judged` the arbiter returns `satisfied`: a fake green (law #8's only real failure). The
floor is checked on **both** bands. Below it, the verdict is `crashed`, whatever the exit
code said.

It is a **floor, not a zero-check**: `node --test` reports a crashed file as ONE failing
test, so "zero executed" never fires. Declare it against the suite's real size
(`{ pattern: "^ℹ tests (\\d+)$", min: 300 }` for a 391-test suite, with
`--test-reporter=spec`, which prints both the counts and the failures at the end). It
catches *"the arbiter did not run"* — wrong tree, broken argv, a failed shared import — not
*"one test file is broken"*, which is an honest red the worker should fix.

**Capture the count of tests EXECUTED, never tests PASSED.** A passed-count pattern
conflates "did the close judge?" with "did the tests pass?", so a genuinely red tree —
exactly the state a fix job starts from — falls under the floor and is escalated as an
instrument crash at precheck, before the worker it hired ever runs. `# tests (\d+)` and
`^ℹ tests (\d+)$` hold on a red tree; `(\d+) passed` does not (F40).

Omitting it is legal (a linter, a `hitl` close, have nothing to count) and stamps
`unaudited: true` on the verdict plus a `close-unaudited` spine event: **the blind spot is
named, never assumed away.** The agent-drafted workflow config cannot express `judged` —
it is the arbiter's own honesty check (unknown-field red, enforced per section at every
depth).

**`gapKeep` — the kept-failures pattern (optional, `predicate` only; F28).** A regex
**source** string (e.g. `"^not ok"`). The close's output is the worker's ONLY feedback
channel, and `ralph`'s gap bound keeps a head sample + an elided middle + the tail — but a
large TAP suite prints its `not ok` lines in the **middle**, exactly where the bound elides.
The first real firing of the loop delivered a 1,927-char gap with **zero** failure lines:
the worker was told "5 fail" and never *which*, three attempts running (F28). `gapKeep`
preserves every close-output line matching it in a clearly-delimited **kept-failures block**
between head and tail, so the failing-test NAMES — the causal input navigation runs on —
reach the worker. It is **hard-capped** (max 50 kept lines / 8192 bytes, whichever binds
first) so a pathological close cannot rebuild the very bloat the bound exists to prevent;
when the cap trims matches it **says so** with an explicit marker (silent truncation is the
disease this cures, never a cure that truncates silently). Validated like `judged.pattern`:
a non-empty string that must **compile as a RegExp**, else a spec red before any tokens.
Omitting it is exactly today's bound. Like `judged`, it is **arbiter territory** — the
drafted workflow config cannot express it (unknown-field red). The gap path also combines
**both** streams (stdout + stderr), so a failure printed to stdout survives stderr noise
(F28's adjacent hazard — the old `err || out` returned stderr alone and lost it).

**The plan document (`schema: "plan-v1"`, AGENT-authored — the only document the emergent
middle writes; `validatePlan` gates it against the SIGNED job spec before tokens burn):**

| field | shape | notes |
|---|---|---|
| `steps` | ordered array, 1..8 (`MAX_PLAN_STEPS`) | strictly sequential — array order IS the order; no `dependsOn` (unknown-field red: an inert knob is a fake contrast lever) |
| `steps[].id` | kebab slug, unique | |
| `steps[].action` | non-empty text | the step's task — the worker sees only this step |
| `steps[].tools` | non-empty unique subset of the SPEC ceiling | a verb beyond the ceiling reds `verb-escape` with the verb as structured data (overreach, distinct from the operator-side `request-red`); `run` is `verb-escape` at every layer |
| `steps[].rounds` | int 1..shell cap (default 40) | the step's per-attempt tool-round bound (the Gate's `maxTurns` natively) |
| `steps[].target` | path inside the fence | v1.18 deliverable; REQUIRED on write-granted steps |
| `steps[].model` | optional; `sonnet` \| `haiku` (`STEP_MODELS`) | the step's model TIER — a menu, never a model string the agent spells (the tier→model mapping and any per-model effort params are the runner's). `opus` is deliberately absent: reserved for work the human assigns, never plan-selectable. Off-menu reds `invalid-value`. A step naming a tier when the caller supplied no `providerFor` factory is an `interpreter-red` STOP, never a silent run on the default tier |
| `steps[].attempts` | optional; int `1..capRuns` | TIGHTEN-only: the step's own retry cap inside `ralph`, floored against the shell's `capRuns` (default 3). Above it reds `bounds`; a plan may narrow the shell's cap, never raise it |
| `steps[].scope` | optional; one value from the SAME menu `tree-changed` uses | narrows this step's live WRITE fence to a subset of the signed `writeScope` — chosen from `legalScopes(...)`, never authored. Off-menu reds `invalid-value` carrying the menu |
| `steps[].exit` | 1..2 items (`MAX_EXITS_PER_STEP`), ALL must pass (AND-only, no OR/NOT) | closed menu (`EXIT_TYPES`): `artifact-written(path, pattern?)` · `tree-changed(scope)` · `json-valid(path)` · `check-passes(name)`. **`tree-changed.scope` is a MENU, not a glob the agent authors** — `legalScopes(writeScope, dirs, cap?)` enumerates the signed fence entries plus the real directories beneath them (shallowest-first, capped at `MAX_SCOPE_MENU`=24), `planPrompt` lists them verbatim, and `validatePlan` accepts membership only. Pass the SAME array to both via `opts.scopes`; omitted, it derives from `writeScope` alone — never a free-text fallback. An off-menu value that escapes the fence still reds `scope-escape` (the ledger's attribution class), an in-fence unoffered value reds `invalid-value` carrying the menu. `runPlan` emits `scope-menu {offered, truncated, offerableCount?, cap?}` so a capped menu is never silently complete. `check-passes` must name a stage on the close's DERIVED menu (`check-unknown` red names the offered menu — no operator authors this list, it comes straight from `checkMenu(close)`); on a write-granted step it must be paired with `tree-changed` (`exit-illegal` — the seed tree is green, a lone check would pass untouched, F17/F46). **`check-passes` also requires a write-class verb (`write`/`edit`) on the SAME step** (`exit-illegal` — BREAKING for plan authors: a read-only "verify" step carrying a check used to validate and no longer does). A failing check's gap is re-delivered to that step's OWN worker, so a step holding a check must be able to act on it; a read-only one is a mailbox with no hands and stalls to cap on a byte-identical gap (measured on 4 of 4 drafted plans). The check belongs on the step that fixes; the run's final verification is the operator's close, which the agent never authors. The rule is stated identically in the drafter prompt and the validator, so the two can never disagree — and it is suppressed when `tools` failed to parse (the step's hands are unknowable then, and the real defect already redded: one defect, one red). `artifact-written.pattern` must compile AND survive a ReDoS shape check — an unbounded quantifier over a group that itself repeats unboundedly (`(a+)+`, `(\d*)*`, even wrapped: `((a+))+`) is an `invalid-value` red (F49, catastrophic-backtracking footgun; rewrite without a repeated group inside a repeat). Exits verify FORM, not truth — progress gates; the operator's close stays the one arbiter |

Red vocabulary (all three validators): `parse-error`, `unknown-field`, `missing-required`,
`invalid-value`, `bounds`, `duplicate-id`, `close-type`, `close-hierarchy`,
`secret-literal`, `scope-escape`, `fence-invalid` (a malformed `jobWriteScope` fence — attributed to `jobWriteScope`, never the workflow config), `shape-conflict` (both job shapes declared),
`request-red` (locked-but-listed: a locked tool or verdictType — admission demand the
ledger tallies), plus the workflow-side verb reds (`verb-illegal`,
`verb-placement`, `verb-params`, `slot-overflow`) and the plan-side reds (`verb-escape`,
`exit-illegal`, `check-unknown`, `step-scope-escape` — a scoped step whose `target` or
exit path falls outside its OWN narrowed scope (in-fence but gate-denied ground: the
step's gate is built from the narrowed prefix, so the pair is rejected at validation
instead of burning attempts on refusals), `job-invalid` — a plan validated against a
missing or non-plan-shape job fails CLOSED). `stageClose(close)` is the ONE staging
every check-menu consumer shares (array → itself; legacy object predicate → its
one-stage list, named `close`; gold/rubric/hitl → null). The `secret-literal` sweep is
defense-in-depth against known token shapes — env-only loading remains the law, not the
sweep.

## Public API

*Landed through N2 + the Layer 2 core (spine + shell + three validators + interpreter
with text/tool middles + the plan executor + extractor + runJob). Still TBD: N3
(contrast-bit extractor live), N4 (verdict classes — gold/rubric close EXECUTION), N5
(scheduler + budget ops + CLI), N6 (panel).*

### `makeSpine(file)` → `emit(type, data?)` — `src/spine.js`

Append-only JSONL event emitter bound to one file. `seq` monotonic per spine, `ts` stamped
last. Consumers are pure listeners; nothing reads the file back. Returns each event as
written.

### `ralph({ middle, close?, judge?, capRuns, emit, redact?, closeTimeoutMs?, cwd?, expect?, judged?, gapKeep?, workerWrites? })` → `'green' | 'escalated'` — `src/ralph.js`

The dumb outer shell: `while close-red and under-cap: run the middle`. `close` is an argv
whose exit code is truth (`runClose` is also exported — **async since 0.6: `runClose` and
`runStages` return Promises**; the child is awaited instead of spawnSync so a running close
no longer freezes the host event loop (F68); every close semantic — timeout signal, output
bounds, gap shape, exit bands — is byte-identical); the red gap text feeds the next
iteration, tail-biased when bounded (400 head + 1500 tail — the assertion diff lives at
the end). **`cwd` is where the close RUNS, and it is load-bearing (F8):** a close is a
repository command (`npm test`, `make check`) and every one of them is cwd-relative — run
it anywhere but the workdir and the arbiter judges the wrong tree. `runPlan`
always passes the workdir. **Corollary for job authors (F15/F28):** the gap bound keeps the
head and the TAIL, so a close whose failures print mid-stream (a 391-subtest TAP dump) tells
the worker only the summary counts — pick a reporter whose failures land at the end, **or**
set the close's `gapKeep` (job-spec, arbiter territory) to a regex like `"^not ok"` so the
matching failure lines are preserved in a capped kept-failures block regardless of where
they print (F28: the first real firing delivered a gap with zero failure names). The gap
also combines stdout+stderr, so a stdout failure survives stderr noise.
`closeTimeoutMs` caps the close's wall clock (default 120s) — shell/operator
territory, inexpressible in any config.

**The forbidden zone (PRD v1.11 / F17).** `runClose` returns a verdict ONLY when judgment
was rendered. `expect` (the signed exit code, default 0) and `judged` define the two clean
bands; everything else is **not a verdict**, gets its own name, and is **never retried** —
retrying a broken arbiter is the violation this closes. `CLOSE_FAULTS` (exported; the
runner's pre-token precheck uses the *same* map — two maps would be two instruments):

| verdict | what happened | escalation | the human's real options |
|---|---|---|---|
| `failed` | the close cannot RUN | `broken-close` | fix the argv |
| `timed-out` | ran, never finished judging | `close-timeout` | raise the timeout / make it faster |
| `killed` | died by signal (`status === null`, no spawn error) | `close-killed` | re-run / fix the environment (OOM) |
| `crashed` | ran, exited, judged nothing (see `judged`) | `close-crashed` | fix the crash / fix the argv / lower the floor |

`close-timeout` is deliberately **not** pooled into `broken-close`: "raise the timeout" and
"fix the command" are different human answers, and pooling them erases the decision
information the escalation exists to carry.

**Worker-crash attribution (F32).** One carve-out from the table above: a `crashed` verdict
does **not** escalate when the injected `workerWrites?: () => string[]` seam reports the
worker has written files this run — with a clean precheck baseline (`runJob` escalates a
crash-at-precheck before any tokens), that crash is the worker's own broken edit, the most
recoverable red there is. The routed verdict is the DISTINCT `worker-crash` (spine event
`worker-crash` with the file list; never plain `crashed`, never `needs_revision`), and the
gap tells the worker which files it wrote and to fix or revert. `runPlan` wires the seam
to the gate audit's allow-decision write/edit lines (run_id-scoped); no seam or zero writes
keeps the old behavior — an instrument crash still escalates `close-crashed`, never retried.
Measured motivation: battery pass 1 (F31) lost 4 of 7 rows to exactly this escalation.

**The judge seam (Layer 2, PRD v1.12 §4).** `judge?: async () => {verdict, gap?, detail?}`
— a SHELL-injected replacement for `runClose`, so a plan step's micro-loop is judged by
the exit evaluator instead of a command. It returns the same verdict vocabulary, so the
forbidden zone, F32 worker-crash routing (a check crashed by the worker's own broken test
feeds back — the F46 mechanism), and the cap taxonomy apply unchanged. `close` becomes
optional when `judge` is present; the seam is wired by `runPlan` only and is
inexpressible in any config or plan — the agent never authors its judge any more than
its close.

Escalations are decision-ready (category, options, spend); cap-halt is its own
category, never merged with "wrong". A thrown middle is relayed by its `category`
property (`cap-halt`, `gate-red`, …); an unnamed throw is `interpreter-red`. Close output
is scrubbed at capture (an injected `redact`, wired to bareguard by `runPlan` with the
validators' full secret-shape inventory — Bearer/sk-/ghp_/github_pat_/AKIA/xox) so a
secret a checked command echoes never enters the append-only spine or a worker prompt —
a benign gap is byte-identical (secrets hard line; design law #7 intact).

### `validateJob(input, { shellCapUsd? })` → `{ ok, reds, job }` — `src/job.js`

The operator-owned validator — the arbiter's rulebook, and the sibling of
`validatePlan`, never its extension: what the human signs and what the agent authors
are two documents with two validators, which is what makes the arbiter inexpressible
from the agent's side. Validates a `job-v1` spec — see **All options** for the schema,
close types, and hierarchy. Never throws on JSON text or plain parsed data (the ingest
contract); returns the parsed spec on ok, `null` on any red. A spec carrying the retired
`steps[]` reds `shape-retired` by name (PRD v1.32) rather than falling through to a
generic unknown-field. Menus exported: `CLOSE_TYPES`, `CLASS_BY_CLOSE`, `GOLD_COMPARE`,
`CADENCE_UNITS`, `PROVIDERS`, `CONDITION_KEYS`, `TOOL_MENU`, `LOCKED_TOOLS`,
`VERDICT_TYPES`, `LOCKED_VERDICTS`.

### `validatePlan(input, { job, maxStepRounds?, scopes?, capRuns? })` → `{ ok, reds, plan }` — `src/plan.js`

The third validator: gates the AGENT-authored plan doc (`schema: "plan-v1"`) against the
SIGNED job spec before tokens burn — the ceiling, the fence, and the checks menu all come
from `job` (a missing or non-plan-shape job fails CLOSED, `job-invalid`). Never throws;
same `{ code, path, detail }` red shape as its siblings; `verb-escape` reds carry the
escaping verb as a structured `verb` field (the ledger keys on it). `maxStepRounds`
(default 40 — the shell's tool-mode per-attempt bound) ceilings every step's `rounds`;
`capRuns` (default 3) ceilings every step's `attempts`; `scopes` is the offered scope menu
(pass the SAME array the prompt listed — omitted, it derives from the signed `writeScope`,
never a free-text fallback). Menus exported: `EXIT_TYPES`, `MAX_EXITS_PER_STEP`, `MAX_PLAN_STEPS`, `WRITE_VERBS`.

### `snapshotScope(dir, scope)` / `evalExits(exits, { dir, snapshot?, runCheck? })` — `src/exits.js`

The shell's own fixed code for the closed exit menu — nothing here executes
agent-authored text. `snapshotScope` hashes every file under a scope prefix (the
"before" side of `tree-changed`; a missing dir snapshots empty). `evalExits` is AND-only
and never short-circuits — the result names EVERY failing wall (`{ pass, results }`,
each result `{ type, pass, detail?, fault? }`). `tree-changed` reads OUTCOME (bytes vs
the snapshot): an identical re-write is NOT a change (F43) and git status is never
consulted (F45). `artifact-written` rejects zero-byte files. `check-passes` delegates
through the `runCheck` seam (the runner wires runClose); an unwired or crashed seam
fails CLOSED with `fault` carrying a runClose verdict name — an instrument fault
escalates through `CLOSE_FAULTS`, never masquerades as worker feedback. Failing details
are counts and names only, never file bodies (they ride the append-only spine).

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

### `runJob(spec, { approvals, workdir, provider, nativeProvider?, providerFor?, emit, capRuns?, shellCapUsd?, closeTimeoutMs?, layerRoot? })` → outcome — `src/run.js`

The runner — the shell's top layer, and the ONE entry. It composes everything below it and
interprets nothing itself. Sequence: **approval gate** (human-signs-always — refuses an
unapproved spec before ANY provider call: `unapproved-spec`) → **primitive smoke** (litectx
known-answer round-trip before tokens: `smoke-red` — a silent degradation throws nothing) →
**the plan flow** (`runPlan`, below) under the ONE cumulative ledger, whose ceiling is
`min(job budget − spent, shell cap)`.

Outcomes: `green | already-green | escalated | unapproved-spec | job-red | smoke-red |
plan-red | check-red | close-red | close-unsupported | pricing-red | provider-red |
interpreter-red | cap-halt | wall-halt | step-stalled | step-red:<id>`. `provider-red` is a
transport throw or a worker round the API cut off mid-generation (`truncated:max_tokens`,
BA-6 — before which it laundered into a clean finish, F25): no verdict exists and the failed
round's spend is only partly known (F6). `cap-halt` is the wallet; `wall-halt` is the clock
(F64 — a timeout derived from the run's own deadline is a governance stop, never a transport
casualty). **`cap-halt` reaches you from the close-fix loop too, not only from a step:** the
shell spells attempt-exhaustion and a money-gate halt with the same category, so both the
step loop and the fix loop read the WALLET to tell them apart — a drained wallet is
`cap-halt` (the resume-to-cap checkpoint), attempts spent with money still on the table is
the designed `escalated` terminal ("the close is still red"). The fix worker's gate is built
with the wallet at its most drained, which is exactly where a money cut would otherwise
masquerade as a capability read (F45). `step-stalled` is the F66 stall fuse giving up: no
completed round for 5 minutes,
three times on one call — each stall silently abandons the hung call and reissues it
(self-heal first); only the third throws. Inside a step it is the THIRD replan trigger
(with `cap-halt` and `step-variance`); outside a step it escalates under its own name, never
laundered into `provider-red`, and carries `spendComplete:false` (an abandoned call may
already have been billed). Every one of them is a decision-ready escalation with a terminal
`job-end`: the spine never dangles.

**Every `job-end` carries the money, on every path**: `{ outcome, spentUsd, spendComplete }`
(plus `step`/`cause`/`detail` where the outcome has them). `spentUsd` is the accumulated sum
of PRICED rounds ONLY — never an estimate from token counts or averages (cap-not-estimate) —
and it is stated even on the pre-token reds, where the honest figure is a real `0`.
`spendComplete` says whether that figure is EXACT: `false` means one or more rounds came back
unpriced (F6), so `spentUsd` is a FLOOR ("at least $X", true total unknowable) and must not be
read as a total. Both fields are present on all outcomes, so a consumer never branches on
field presence and never has to launder a missing `spentUsd` into `$0`.

**The plan flow (Layer 2).** `job-start` carries `shape: 'plan'` + the goal; plan steps are
tool-mode by construction. The flow (`runPlan`, also exported for direct callers who own
their own ledger): **close precheck** (`already-green` is a
DISTINCT zero-token outcome; a forbidden-zone verdict escalates before spend) → **check-menu
preflight** (`check-menu` names the derived menu, then every OFFERED stage's chain runs once
at $0 — an unrunnable stage is a `check-red` stop before tokens, not a fault mid-plan) →
**SCOUT** (read-only by construction: neither the
write-class nor the store-class verbs are in its menu; hard-bounded rounds) → **PLAN** (the decompose call —
the planner never sees the repo, only the scout blob; drafted against a schema
description with check NAMES only; `validatePlan` gates it, one redraft with the reds
fed back, then `plan-red`) → **EXECUTE** (strictly sequential micro-loops: `ralph` with
the exit-evaluator judge; tree snapshots at step start; the gap names every failing
wall — mechanical genre, F46's measured mechanism; artifacts feed forward labeled by
step id) → **ONE replan**, triggered by exhaustion OR variance (an instrument stop never
replans) → **the operator's close**, a red feeding ONE bounded fix loop judged by the
REAL close. `plan-executed` (the plan-as-executed record, design law #2) lands on the
spine on every path that executed steps. Additional outcomes: `already-green |
plan-red | check-red | close-red | wall-halt`. Worker prompts hold the v1.12 §5 contract
(mutation-proven): the absolute repo root, the step's action/target, prior artifacts,
the gap — NEVER the budget, the close command, a check's command, or the arbiter's books.

**Time and materials (T + A, PRD v1.27/v1.29).** `runPlan` starts ONE wall clock per run
(`createClock`, `src/clock.js`) from the signed `maxWallMs` and emits `wall-clock` with the
requested AND enforced numbers up front. Enforcement is a **between-round deadline** — the
only seam that exists, since `loop.stop()` cannot cut an in-flight call (F61: fired at 500ms,
returned at 4,018ms) — so an attempt that crosses the deadline mid-flight emits `wall-bounded`,
is judged, and feeds its gap forward exactly like a round-bounded attempt; the run-level
terminal `wall-halt` is decided by the step loop after the step returns. Time reporting is
licensed at ~90% accuracy by ruling: imprecision is fine, reporting an unknown or unbounded
duration as `0` never is (F6 extended to time — unbounded reports `null`, never `Infinity`).
The planner (never the worker) receives a **materials** block at draft and at replan —
`{ balanceUsd, remainingMs }`, what is LEFT as a balance, never a rate: F57 measured a 150×
spread on verification-gap duration, so a per-round constant describes almost no real round
and a rate framing creates a rush-or-fake incentive. The replan trigger gains a second axis
(`step-variance`): a step consuming ≥ `VARIANCE_THRESHOLD` (0.5) of the run's REMAINING money
or time with its exits unmoved is pre-empted at the head of its next attempt so the planner
re-allocates instead. **Known and recorded (F63): that trigger fired 0 times across 18
archived spines / 54 steps** (near misses 0.35–0.45) — the threshold is arbiter territory,
deliberately not fitted to those points. The ONE-replan ceiling is unchanged.

**Per-step model tiers — `providerFor` (P).** A plan step may declare a `model` TIER
(`sonnet` \| `haiku`, `STEP_MODELS`). The tier menu is signed into the schema; mapping a tier
onto a real model (and any per-model provider params) is the RUNNER's territory, so both
`runJob` and `runPlan` take `providerFor?: (tier: string) => provider`. It is called ONLY for
a step that declared a tier, once per such step — the scout, the plan drafter and every
untiered step stay on `opts.provider`, so a caller that never plans tiers can omit it
entirely. Cache per tier on your side if you want one instance reused. **A plan naming a tier
when no factory was supplied is an `interpreter-red` STOP**, named as a wiring gap rather than
a plan defect: running the default tier as if the choice had been honoured is the F50
blind-instrument class, and the whole point of the field is that the choice is observable.

**Two worker surfaces — API and native clipipe (BA-16, module 4d).** The plan flow is
provider-agnostic: the close, the checks, and the exit evaluator are commands and form
checks, so ONLY the worker differs. `job.provider === 'clipipe-subscription'` drives tools
NATIVELY (the `claude` CLI owns the turn cycle) instead of through the `Loop`; every other
provider runs the Loop unchanged (byte-identical — the API path cannot regress). Native
governance is **constructor-time and per-worker**, so the runner cannot reuse one injected
instance: pass `opts.nativeProvider`, a FACTORY the runner calls fresh per worker as
`({ policy, onTurn?, maxTurns, hasTools }) => provider`. Return the right mode by `hasTools`:
`true` → native tool mode (`toolProtocol:'claude-mcp'`, wire the gate's `policy` + `onTurn` +
`maxTurns` onto the provider — the SAME `wireGate` fence, so a write outside the scope is
DENIED at the bridge, live-proven); `false` → the toolless drafter, where a native session
reports NO cost, so return a metered claude-json TEXT provider (`--output-format json`,
`parse:'claude-json'`) — never an unmetered, invisible-spend session. A missing factory on a
`clipipe-subscription` job is `interpreter-red`, never a silent fall-back to the metered API.
Money reconciles PER SESSION (the CLI prices the session, `costUsd` null per turn,
authoritative at close): the accounted `worker-round` is the session total, per-turn
`worker-turn` events are attribution only. `maxTurns` (→ CLI `--max-turns`) is the
per-attempt bound and surfaces `max_turns` as a BOUNDED attempt (judged, gap fed forward),
the native analog of `loop.stop()`. Live-validated green end-to-end on the real CLI; the
Loop path is untouched.

**Resume-to-cap (close-first):** the job's close runs FIRST, before any tokens
(`close-precheck` on the spine, output scrubbed at capture like every close). Already-green
is a DISTINCT zero-token outcome, never plain `green`: nothing was done, so it mints no
learning credit and runs no on-green retention. A close that cannot RUN is a `broken-close`
escalation before any provider call. So the resume story is: a `cap-halt` or `wall-halt`
stop IS the checkpoint (the workdir + the close), the human raises `budgetUsd` or
`maxWallMs` (a new spec hash — re-sign), and the rerun picks up where the budget died,
paying zero provider calls for anything already green.

**Unpriced is never free (F6/F12):** the ledger meters **per ROUND** (`worker-round`, at
bare-agent's `onLlmResult` seam) — money is counted as it is spent, never at the end of an
attempt: a tool-mode attempt that HALTS never returns, so accounting its result event lost
the whole attempt's spend (a real run bought $1.4375 of tokens and the ledger reported
$0.0048). Any round whose cost is the honest null halts `pricing-red`, decision-ready; a
null never accumulates as $0, so the hard cap cannot be gamed by an unpriced provider path.
The plan and scout calls are metered on that same priced path — a drafting call is a
provider call and is never accounted around the ledger (F6). The scout runs under its own
reserved round bound, with the LAST round reserved for a toolless summary: the bound halts
a scout mid-tool-use, and text is its only deliverable, so without that reservation it
spends its whole allowance exploring and reports nothing (F59 — measured on 15 of 18 runs).

**What the worker is told (tool mode):** the absolute repository root (F10 — bare-agent's
shell tools resolve relative paths against the PROCESS cwd, so a worker with no root is
blind), the close's CURRENT output as the tree's state (F13 — never framed as "your previous
attempt"; the `run` verb is locked, so the worker cannot see the failure any other way), and
the loop contract (F16 — it is ONE attempt inside `while close-red and under-cap` and will be
re-run with the close's verdict; without this a model one-shots and can eat the budget in
reads before ever writing). It is NOT allowed to read the run's own machinery (F14): the gate
audit, the smoke store and the litectx store are denied — the agent neither authors the
arbiter nor reads its books. N2 bounds (honest): `gold`/`rubric` closes refuse
`close-unsupported` (execution lands at N4).

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
negotiates with it. An **emergent middle**: the AGENT-authored plan — bounded steps, each
with its granted verbs, its round and attempt caps, its narrowed write scope and its
form-checkable exits — schema-validated by `validatePlan` before tokens burn (the
operator-authored `steps[]` shape is deleted, PRD v1.32). A **floor**: append-only
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
