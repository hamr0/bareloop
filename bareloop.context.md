# bareloop — Integration Guide

> **Current: v0.16.0.** The verdict classes are **`green` + `soft-green`**. `soft-green` has
> a real judged floor (`judged-floor`, `src/judged.js`): a pinned haiku-4.5 judge LOCATEs
> facts with quotes from the real artifact, an arbiter-owned `decide()` renders pass/fail from
> a signed rubric card, and *unsure* is a red, never a pass — bought by a signed calibration
> gate (ten graded truths, five resisted lies, floor 10/10, itemized reds). A soft-green pass
> mints its bridge row QUARANTINED: no learning credit until an `accept` releases it, forward
> only; a rerun records a disposition and its outcome is a NEW run's own row, born held
> again. Every run ends at the signer's **review door** — `accept` / `rerun` / `pause` — which
> records a disposition and **never changes the loop's own verdict** (`runPlan` still returns
> `green`/`already-green` exactly as before). The door
> is open **always for `soft-green`**, and **opt-in for `green`** via `reviewDoor: true` /
> `--review-door` (the flag wins in both directions, never inferred); `accept` re-runs the
> close's MECHANICAL stages only — never a judged floor, never a person. Shipped in v0.12.0
> (2026-08-23); see CHANGELOG `## [0.12.0]` onward for the softgreen rung and the fixes/rungs
> that followed through v0.15.0. **The plan shape is the ONLY shape**: the legacy
> operator-authored `steps[]` path, config-v1 and the draft-PR hitl step were deleted
> 2026-07-26 (PRD v1.32), so `interpret`, `validateConfig` and `extractRules` are gone from
> the public surface — a breaking change. Runs on two worker surfaces — the API `Loop` and,
> for `clipipe-subscription`, the CLI's native tool channel (module 4d). API sections fill in
> as build-ladder rungs land (PRD §10). What is settled — the boundary, the architecture, the
> refusals, the constraints — is settled for good. Per LIBRARY_CONVENTIONS §3 this file ships
> with the package and is the complete adopter contract; the README is only the pitch.

> **LEGACY — `hitl` (retired by design, PRD Addendum v1.71, 2026-08-17).** `hitl` remains
> ADMITTED in code today — `VERDICT_TYPES` still lists it, the `human-confirms` stage kind is
> still live (never offered, at-most-once, must be last), and the two `hitl-*` terminals
> (`hitl-pause`, `hitl-decision-red`) still exist and still work exactly as documented
> wherever this file describes them below. It is retired as a *design direction*, not deleted
> as *code*: `LOCKED_CLASSES` is empty, so nothing refuses a `hitl` job today, but new
> integrations should target `green` / `soft-green` plus the review door instead — that pair
> is the forward path for anything needing a person's judgement, and `hitl`'s removal is a
> future breaking change, not yet scheduled. Records: PRD Addendum v1.71,
> `docs/product/2026-08-17-softgreen-review-door-design.md` (repo-only, not shipped);
> evidence F102–F105.

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

## Which mode / components do I need?

- **Verdict class — how "done" gets decided:** `green` (a mechanical close: exit code =
  truth, `src/kinds.js` `LIVE_KINDS`) is the default and the only class with a live-proven
  paid run. `soft-green` (a judged floor behind a signed calibration gate, plus a review
  door) is fully admitted (`VERDICT_TYPES`, `src/job.js:106`) but has never rendered a live
  verdict — see `## Public API` → "THE JUDGED FLOOR" and "THE REVIEW DOOR" below. `hitl` is
  LEGACY: still admitted (removal is a future breaking change) but retired as a design
  (PRD Addendum v1.71); its pause machinery lives on as the review door, not as a class to
  pick for new jobs.
- **Worker surface — how the agent runs:** `provider: 'anthropic-api'` (the default, the
  only one with an operational guarantee, F48) drives `bare-agent`'s `Loop` and takes the
  shell-owned `provider` binding. `provider: 'clipipe-subscription'` (`src/job.js:135`)
  drives the worker natively over the Claude CLI's own tool channel and requires
  `opts.nativeProvider` in `runJob`/`runPlan` — its `costUsd` axis is notional, never pools
  with `anthropic-api` on cost, and budgets don't transfer between them.
  `job.provider === 'clipipe-subscription'` with no `nativeProvider` supplied is
  `interpreter-red`, never a silent fall-back to the metered API (`src/planrun.js:1073`).
- **Reuse — where a workflow comes from:** a plain `runJob` always drafts cold. Passing
  `bridge` starts from one standalone bridge file (`src/reuse.js`'s envelope, `## The reuse
  ENVELOPE and runReuse` below). The CLI's `--registry <dir>` / library-level `registryDir`
  (`src/reuse.js`, `scripts/run-u.mjs`) instead reads/writes dated rows in an
  operator-supplied directory of plain JSON files — no database, no default location; a
  named-but-missing registry is a red, never conjured (`## The reuse registry (Layer 3)`
  below).
- **Read shim:** `readShim` defaults to `false` on both `runJob` (`src/run.js:205`) and
  `runPlan` (`src/planrun.js:808`) — the OFF arm wraps nothing at all. Opt in with `true`,
  `'cap'`, or `'diff'` (`src/readshim.js`) only once the read-hygiene tradeoff is wanted.

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
| `maxWallMs` | optional integer ms `>= MIN_WALL_MS` (one close timeout) | the run's wall clock. **NO DEFAULT, by ruling** — absent means time-unbounded *by explicit operator choice*, never by fallback (F45: a defaulted cap is a silent second ceiling). Enforcement is a BETWEEN-ROUND deadline, so the honest worst case is `maxWallMs + closeStages × closeTimeoutMs` — every stage of a staged close gets the FULL timeout — and all three numbers are reported (`loop.stop()` cannot cut an in-flight call — F61 measured 500ms→4,018ms). The `MIN_WALL_MS` floor is a ONE-stage number, so a spec with many stages can validate while its overshoot dwarfs its cap: the clock reports that honestly rather than the floor pretending to prevent it (stage-aware floor parked, PRD v1.39). Operator-only, tighten-only; adding or changing it changes the spec hash |
| `model` | optional non-empty string, exact provider model id (e.g. `"claude-sonnet-5"`) | the WORKER's model, build-list #3. Absent means today's runner default; present it wins over a `--model` flag outright, and a flag naming a different id is refused (`resolveWorkerModel`, `src/job.js`) rather than silently overridden. Part of the signed hash like every other field. Worker only — the judge model stays library-pinned (`JUDGE_MODEL`) pending recalibration |
| `writeScope` | array of contained globs | the operator's outer fence; the plan's own scopes must fit inside it, same containment code |
| `steps` | RETIRED | operator-authored `steps[]` was deleted (PRD v1.32); a spec carrying it reds `shape-retired:steps` by name rather than half-running |
| `escalation` | `{ mode: "decision-ready" }` | the pain channel is not optional |

**The plan shape — the only shape** (Layer 2, design record 2026-07-21). The AGENT authors
the step plan at run time (gated by `validatePlan`); the human signs only:

| field | shape | notes |
|---|---|---|
| `goal` | non-empty text | what the agent plans against |
| `verdictType` | `green` \| `soft-green` \| `hitl` | declared radio, never inferred (`VERDICT_TYPES`, frozen). **All three are ADMITTED today** — `LOCKED_VERDICTS` is empty, so nothing reds `request-red` on the class itself. `soft-green` has its judged floor (`judged-floor`, signed rubric card + calibration gate) and is the forward path for a job needing judgement, paired with the end-of-run review door; `hitl` is LEGACY — retired as a design direction (see the direction note at the top) but still admitted and still works exactly as documented here. Every `request-red` (e.g. for a locked TOOL verb, not a verdict class) also carries `lib` — the territory the demand lands against, stamped at the emit site (`verdictType` → `bareloop`, a locked tool verb → `bare-agent`): the ledger keys and its `suggestedAsk` seed on it, so a bareloop-catalogue refusal never files as an upstream ask |
| `close` | **an ORDERED LIST of named stages** `[{ name, cmd, expect, judged?, gapKeep?, offer?, needs?, direction? }, ...]` (PRD v1.28), or a close object (table below) | the destination, the only thing hand-authored; the check menu DERIVES from it (below). The plan flow executes a staged close directly and adapts a bare `predicate` object into a one-stage list; a `gold`/`rubric`/`hitl` object close still VALIDATES (`CLOSE_TYPES`) but the plan flow refuses all three at runtime as `close-unsupported` — an object close names no command to run. The modern route to a judged or human-decided close is a staged `closeDecl` (`judged-floor` / `human-confirms` stage kinds), not this object form |
| `closeDecl` | **the AUTHORED close** `{ genre: "TYPES", lang: "js"\|"python", stages: [{ name, kind, params }], notes? }` | the ALTERNATIVE to `close`, and the point of the close-authoring rung: the user answers an interview and an LLM composes a DECLARATION over kinds whose implementations we own — never a script, never a shell fragment, never a new kind. **`close` and `closeDecl` are alternatives**: declaring both reds `close-duplicated` (two closes are two arbiters). It is HARD-class by construction (`CLASS_BY_CLOSE.declared`), so a locked verdict on one reds `close-hierarchy` as well as `request-red`. The declaration is validated by `validateCloseDecl`; the TREE-GROUNDED half of that gate (the path rule, and the scoped-job derivation that arms the F84 one-population law) is DEFERRED at spec-validation time — a job spec is validated with no repository in hand — and the runner re-runs it GROUNDED against the real seed before any stage and before any token. It stores the counting RULE and never a number (D12): there is no seed field, and `baseline: "seed"` is measured at each run's own HEAD |
| `checks` | **RETIRED** (PRD v1.28/v1.32) | hand-authored checks are gone, not merely discouraged: declaring `checks` reds `checks-derived` by name. The check menu is DERIVED from the close's own stages instead — see **Staged close** below. The hazard this removes is measured, not theoretical: job #5's three hand-written checks were re-implementations of three stages the close already ran, and a hand-carved copy can drift LENIENT (the worker passes the operator's ruler and fails the real inspection) |
| `tools` | optional unique subset of `TOOL_MENU` (14 verbs, below) | the CEILING every plan step's grant must fit inside (omitting it means the full menu — and the hash is taken over that RESOLVED form, so a `TOOL_MENU` widening flips an omitted-`tools` spec's hash and forces a re-sign; see `jobSpecHash`, MED-1); `run` is `LOCKED_TOOLS` and reds `request-red` — locked-but-listed, and the red IS the admission evidence the ledger tallies (a typo stays `invalid-value`). A ceiling of write-class and store-class verbs ONLY reds `invalid-value`: the scout surveys read-only, so it would be handed an empty menu and survey blind |

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

**`impact` requires `ripgrep` (`rg`) on `PATH`.** litectx's caller scan shells out to `rg` and
catches a missing binary exactly as it catches "no matches", so without it the verb reports
`0 callers, risk low` — silently, in the false-isolation direction (LC-5, open upstream).
Install `rg` wherever the worker runs, or leave `impact` off the spec's `tools` ceiling.

**The store is caller-owned, and it is a LIVE cross-run channel.** `runJob`/`runPlan` root ONE
litectx store at `<workdir>/.litectx` (`new LiteCtx({ root: workdir })`, `src/planrun.js`) — an
on-disk SQLite index that OUTLIVES the run. A note written with `remember` lands there as a
durable `fact`, and `ctx_recall` reads that tier back on any later run against the same
workdir: agent notes persist across runs by default. The library ships NO reset — it never
deletes the store, because what a run inherits is the caller's decision, not the runner's. A
caller who wants a COLD baseline (an inheritance-OFF control arm, a reproducible re-run, any
contrast between two runs) must remove `<workdir>/.litectx` itself between them; the in-repo U
runner does exactly that with a one-line `rmSync`. The store is a derived, self-healing cache
by litectx's own contract, so the only cost of deleting it is the re-index. Store writes are
bounded: `stash`/`remember` payloads over **64KB** (`ISOLATE_MAX_BYTES`) come back as a
refusal RESULT naming the actual size and the limit — worker feedback, never a throw, and
nothing enters the store. The bound is per-payload (aggregate growth across distinct ids is a
future threshold call); `forget` needs no cap — its id is a bound SQL parameter, never stored.

**Staged close — the check menu DERIVES from it (PRD v1.28, `checkMenu` in `src/job.js`).**
Every stage is a `predicate` command body (the same `cmd`/`expect`/`judged?`/`gapKeep?`
contract the single close object has always used) plus:

| stage field | shape | notes |
|---|---|---|
| `name` | unique kebab-case slug | the plan references it via `check-passes(name)`; duplicates red `duplicate-id` |
| `offer` | optional boolean, default offered | `offer: false` hides the stage from the derived menu — it never reaches the agent. For a stage that cannot stand alone as a ruler: a PRECONDITION (e.g. "the seed commit exists" — passes instantly, teaches nothing) or the **final grading stage** — of the ten specs in `jobs/`, four hide a final `verdict` stage and six hide a `changed-from-seed` precondition instead (a per-spec convention, not a schema rule — nothing stops a stage named last from being offered except the spec author remembering to set the flag; preflight's `check-menu` event always names the full menu either way, so a forgotten flag is visible in the run's own record) |
| `needs` | optional non-empty array of EARLIER stage names | a stage that reads what an earlier stage built (e.g. "the public API matches what an earlier stage emitted") names its prerequisite chain; picking it via `check-passes` runs the chain first, then the stage itself. Every name must be declared before this stage (`invalid-value` otherwise); `needs` + `offer: false` together is incoherent (`invalid-value`) — a stage with a chain to run must be reachable |
| `direction` | optional `'up'` \| `'down'`, allow-list validated (anything else is `invalid-value`) | which way this stage's numeric series is READING as progress — `'down'` (fewer is better: typecheck errors, suppressions) or `'up'` (more is better: a fault-detection rate). **Absent means `'down'`** — every close built before this field existed is a count-shaped close, so the silent default is behaviour-identical for all of them (F120). Never inferred from the goal text and never LLM-judged — prose the agent writes must never influence its own halt rule, the same reasoning that keeps every close hand-authored or declared, never judged. Consulted by `isBetter(stage,a,b)` in `src/trend.js`, the one place the close-fix governor's `countImproved` and `best`-tracking read direction; `scripts/run-u.mjs` prints each stage's direction at the close-stage banner so a silent default is never invisible |

The stages run in declared order as the close itself; the first red renders the verdict and
later stages never run. `checkMenu(close)` returns only the offerable stages (each with its
run chain, prerequisites first); a hidden or partial menu is an acceptable case, never a
failure — `check-menu` on the spine reports `hidden` + `meaning` whenever the derived menu is
narrower than the stage list.

**The law for close authors: ONE POPULATION PER STAGE.** The trend reader buckets one series
per stage NAME, and a stage name is not an axis — nothing in the library can stop a stage from
redding on two structurally different measurements under one name, and a run that crosses that
seam donates both genres to one series (a 29 → 4 across such a seam reads *converging* and
would recommend a top-up on work that had only swapped which wall it was behind). If a stage
can report two unlike numbers, **split it into two stages** in the close, each where its branch
already runs — the gate sequence is unchanged because the close is first-red-wins. The shipped
`u-*` closes were split exactly that way (`typecheck` / `typecheck-outside` /
`tests-kept` / `suite-green`), and the fix is never a sharpened reader: `readGrade` is one
reader for every close, deliberately (the F49 precedent). **Splitting a stage moves the spec
hash** — stage names are in the signed spec — so it is a spec edit the operator re-signs, and
it changes what stored bridges match (below).

**The law for spec authors: your `goal` must state everything your close will judge.**
Nothing derives the goal from the close or the close from the goal, and nothing checks the
two against each other — the ONE derivation in the library is close stages → the agent's
`check-passes` menu, one hop, one direction. That separation is the arbiter rule (the agent
references the operator's ruler and never authors it) and it is not negotiable, so the drift
is yours to close: the planner and the worker read the `goal` text, not your stage list, and
they will spend their single check slot (above) on the constraint the goal sentence names.
A stage your goal never mentions is a **cost trap, not a safety hole** — the close still
refuses the tree and the run still cannot mint a green — but the run discovers that stage at
the tail, after paying for work aimed elsewhere, and may not have the money or wall left to
redo it. Write the goal from the close's own stage list, in the close's own words; keep it to
a few explicit requirements rather than prose. Preflight already names every stage on the
`check-menu` spine event — read it back and check your goal against it before you sign.

**Close types and the hierarchy — the OBJECT form, which the plan flow only partially
supports** (a close is data, never code; verdict-class laundering is a named red
`close-hierarchy`). The go-forward shape is the staged list above; a `predicate` object is
legal shorthand for a one-stage list and the plan flow adapts it, but `gold`/`rubric`/`hitl`
validate and then refuse at runtime (`close-unsupported`) regardless of verdict class — the
plan flow has never executed an object close beyond `predicate`. `hitl` (LEGACY) is a STAGE
(`human-confirms` inside a `closeDecl`) and `soft-green`'s judged floor is likewise a STAGE
(`judged-floor` inside a `closeDecl`) — never close TYPES — so both OBJECT forms below stay
refused at runtime exactly as they were:

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
(`{ pattern: "^ℹ tests (\\d+)$", min: 300 }` for a 558-test suite, with
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

**Both operator patterns must also survive the ReDoS shape check** (`invalid-value`, F49 —
the same reject the agent's `artifact-written.pattern` gets): an unbounded quantifier over a
group that itself repeats unboundedly (`(a+)+`, `(\d*)*`, even wrapped: `((a+))+`) is
rejected at the gate. **This is stricter than an "it compiles" contract, and deliberately
so.** `judged.pattern` is exec'd by `runClose` over the close's whole stdout+stderr and
`gapKeep` is run by `boundGap` **once per line** — both untimed, both in bareloop's own
process. Measured: `boundGap(stream, "(a+)+$")` on a 40-character line does not finish in
20 seconds. Because the hang blocks the main event loop, the in-process stall fuse cannot
fire, the run dies to the outside watchdog, and **a bad regex in a signed spec presents as a
provider problem** — so this reds at signing time rather than being diagnosed later. All 92
operator regexes across the 10 in-repo specs pass unchanged. Known limit, parked: the scan
does not catch the alternation-overlap class (`(a|aa)+$`) — see PRD v1.55.
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
| `steps[].model` | optional; `sonnet` (`STEP_MODELS`) | the step's model TIER — a menu, never a model string the agent spells (the tier→model mapping and any per-model effort params are the runner's). `opus` is deliberately absent: reserved for work the human assigns, never plan-selectable; `haiku` was removed 2026-08-06 as a reversible ATTRIBUTION PROBE (F87, see `STEP_MODELS`), so the menu is one entry deep and the field is no longer offered in the drafting prompt. The field and its validator branch STAY: `model: "sonnet"` still validates, a stored bridge declaring it still loads, and restoring haiku is a one-token edit — this is not a finding that haiku is incapable. **The narrowing binds only what the AGENT may express.** Which real model a tier maps to, and what the caller runs as its own default worker model, stay the OPERATOR's: `providerFor` is yours, and the in-repo runner's `--model haiku` probe knob is untouched (PRD v1.36) — the runner's tier map is deliberately WIDER than the plan menu. Off-menu reds `invalid-value`. A step naming a tier when the caller supplied no `providerFor` factory is an `interpreter-red` STOP, never a silent run on the default tier |
| `steps[].attempts` | optional; int `>= 1` | **RETIRED and INERT (F79) — it bounds nothing.** A step's iterations are governed by the STRIKE LADDER (below), which is shell-owned and inexpressible from the plan. The field is no longer offered in the drafting prompt and the runner ignores it; it is deliberately still ACCEPTED, because stored bridge plans carry it and a plan minted under one runner's number must not red under another's. The shape is still checked (a known field holding garbage stays a `bounds` red); the old `<= capRuns` ceiling is gone with the cap it named. It was previously TIGHTEN-only — which meant a step that needed MORE iterations could not ask, and drafters measurably tightened it instead (F77) |
| `steps[].scope` | optional; one value from the SAME menu `tree-changed` uses | narrows this step's live WRITE fence to a subset of the signed `writeScope` — chosen from the offered scope menu (below), never authored. Off-menu reds `invalid-value` carrying the menu |
| `steps[].exit` | 1..2 items (`MAX_EXITS_PER_STEP`), ALL must pass (AND-only, no OR/NOT) | closed menu (`EXIT_TYPES`): `artifact-written(path, pattern?)` · `tree-changed(scope)` · `json-valid(path)` · `check-passes(name)`. **`tree-changed.scope` is a MENU, not a glob the agent authors** — the runner enumerates the signed fence entries plus the real directories beneath them (shallowest-first, capped at `MAX_SCOPE_MENU`=24; `legalScopes` in `src/plan.js`), `planPrompt` lists them verbatim, and `validatePlan` accepts membership only — the SAME array on both sides, so what was offered is what is accepted; omitted, it derives from `writeScope` alone — never a free-text fallback. An off-menu value that escapes the fence still reds `scope-escape` (the ledger's attribution class), an in-fence unoffered value reds `invalid-value` carrying the menu. `runPlan` emits `scope-menu {offered, truncated, offerableCount?, cap?}` so a capped menu is never silently complete. `check-passes` must name a stage on the close's DERIVED menu (`check-unknown` red names the offered menu — no operator authors this list, it comes straight from `checkMenu(close)`); on a write-granted step it must be paired with `tree-changed` (`exit-illegal` — the seed tree is green, a lone check would pass untouched, F17/F46). **`check-passes` also requires a write-class verb (`write`/`edit`) on the SAME step** (`exit-illegal` — BREAKING for plan authors: a read-only "verify" step carrying a check used to validate and no longer does). A failing check's gap is re-delivered to that step's OWN worker, so a step holding a check must be able to act on it; a read-only one is a mailbox with no hands and stalls to cap on a byte-identical gap (measured on 4 of 4 drafted plans). The check belongs on the step that fixes; the run's final verification is the operator's close, which the agent never authors. The rule is stated identically in the drafter prompt and the validator, so the two can never disagree — and it is suppressed when `tools` failed to parse (the step's hands are unknowable then, and the real defect already redded: one defect, one red). `artifact-written.pattern` must compile AND survive a ReDoS shape check — an unbounded quantifier over a group that itself repeats unboundedly (`(a+)+`, `(\d*)*`, even wrapped: `((a+))+`) is an `invalid-value` red (F49, catastrophic-backtracking footgun; rewrite without a repeated group inside a repeat). Exits verify FORM, not truth — progress gates; the operator's close stays the one arbiter |

**A step has exactly ONE check slot — plan for it.** The three exit rules above compose into
a ceiling worth stating on its own, because it decides what a plan can enforce *during* a
run: `MAX_EXITS_PER_STEP` is **2**, the two are ANDed (no OR/NOT, `exit-illegal` past the
bound), and a `check-passes` on a write-granted step MUST be paired with a `tree-changed`
exit. Both slots are therefore spent the moment a step carries one check, so **a step cannot
carry two checks** — `check-passes(typecheck)` and `check-passes(no-suppressions)` together
on one step is inexpressible today, not merely discouraged. The consequence for an adopter:
if your close judges N stages, at most ONE of them can be enforced inside a step; the other
N−1 are enforced only at the close, at the end of the run. That is a COST shape, not a safety
hole — the close still refuses a tree that fails any stage, and nothing green is minted mid-run
— but a stage first tested at the tail is a stage the run pays full price to discover.

**The ceiling of 2 is RULED, not provisional (2026-08-13, PRD v1.63 §3).** One check per write
step is the contract: a step passing its own in-run check is never a verdict, only the close is
truth, and widening the ceiling so a step's own gate could approximate the close would move
judgement into the part the agent authors. Plan around one check; do not plan for a second one
arriving. It is raised only on a demonstrated starvation case (a real run where a step provably
cannot express its progress gate within one check and stalls for it), never for wording comfort,
and the change is the operator's — arbiter territory.

Red vocabulary (both validators): `parse-error`, `unknown-field`, `missing-required`,
`invalid-value`, `bounds`, `duplicate-id`, `close-type`, `close-hierarchy`,
`secret-literal`, `scope-escape`,
`request-red` (locked-but-listed: a locked tool or verdictType — admission demand the
ledger tallies), plus the plan-side reds (`verb-escape`,
`exit-illegal`, `check-unknown`, `step-scope-escape` — a scoped step whose `target` falls
outside its OWN narrowed scope (in-fence but gate-denied ground: the step's gate is built
from the narrowed prefix, so the pair is rejected at validation instead of burning attempts
on refusals). It binds WRITES, not observations: on the exit side it fires only on a
`tree-changed` scope DISJOINT from the step's (a scope that CONTAINS it fires exactly when
the narrow one does), and `artifact-written`/`json-valid` paths carry no step-scope red at
all — the evaluator asks nothing about who wrote the file, so naming a prior step's artifact
is legal and satisfiable. `job-invalid` — a plan validated against a
missing or non-plan-shape job fails CLOSED). `closeStagesOf(job)` is the ONE staging
every check-menu consumer shares — it reads whichever close field the spec carries:
`closeDecl` → its declared stages (each enriched with the arbiter's own `gapKeep`), else
`stageClose(close)` (array → itself; legacy object predicate → its one-stage list, named
`close`; gold/rubric/hitl → null). A consumer reading `close` alone would see a declared
job as closeless and offer the drafter an empty check menu. The `secret-literal` sweep is
defense-in-depth against known token shapes — env-only loading remains the law, not the
sweep.

## Public API

*Landed through N2 + the Layer 2 core (spine + shell + the two validators + the plan
executor + extractor + runJob). Still TBD: N3
(contrast-bit extractor live), N4 (verdict classes — gold/rubric close EXECUTION), N5
(scheduler + budget ops + CLI), N6 (panel).*

### `makeSpine(file)` → `emit(type, data?)` — `src/spine.js`

Append-only JSONL event emitter bound to one file. `seq` monotonic per spine, `ts` stamped
last. Consumers are pure listeners; nothing reads the file back. Returns each event as
written.

### `ralph({ middle, close?, judge?, capRuns?, ladder?, emit, redact?, closeTimeoutMs?, cwd?, expect?, judged?, gapKeep?, workerWrites? })` → `'green' | 'escalated'` — `src/ralph.js`

The dumb outer shell: `while close-red and not exhausted: run the middle`. **Exhaustion has
two alternative rules and you supply exactly one** — `capRuns` (a fixed number of middle runs)
or `ladder` (a PROGRESS governor). With a governor the iteration count floats and the loop
ends on STRIKES instead; ralph still interprets nothing — it hands the governor each red
iteration's gap and reads back a boolean. Both rules exhaust through the SAME terminal:
category `cap-halt`, the same three records in the same order, so nothing downstream (the
ledger's excluded-set, the step loop's one replan trigger) has to know which rule fired.
`ladder` is an INTERFACE, not one module: `runPlan` wires `createLadder` (`src/ladder.js`,
repeats + writes) per step and — since v1.46 — the close TREND governor (`src/trend.js`,
per-stage graded numbers) on the close-fix loop. A governor may supply an optional
`terminal()` to override the exhaustion PROSE (the step ladder's copy offers a replan and
there is no planner at the close); it may never override the category or the outcome. Both
modules are INTERNAL (not on the public surface), so a direct `ralph` caller uses
`capRuns` — the strike rule reaches you through `runJob`/`runPlan`'s `strikeLimit`. `close` is an argv
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
territory, inexpressible in any config. A faulted close is asked to leave with SIGTERM and,
if it is still there 2s later, ended with SIGKILL: SIGTERM is a request a close can decline
(its own handler, a trapping wrapper), and without a second deadline the wait never resolves.
The verdict is untouched — the FIRST fault named the outcome and the kill only enforces it.

**The close child's environment is stripped of credential-shaped variables before it runs**
(`CLOSE_ENV_DENY` in `src/ralph.js`: provider keys, `AWS_*`, any name ending
`_API_KEY`/`_SECRET`/`_TOKEN`/`_PASSWORD`/`_CREDENTIAL(S)`, plus known credential spellings
the suffix rule cannot see — `PGPASSWORD`, `MYSQL_PWD`, `SSH_PRIVATE_KEY`, bare
`TOKEN`/`SECRET`/`API_KEY`, …) — a close judges a tree and never
needs them. A COPY is stripped, never `process.env`, so the host keeps the key it spends every
round. This is exposure reduction, not a sandbox: worker-authored code run by the close still
has network and your OS user's permissions. The strip has no opt-out — no plan, config, or
spec field can widen it — so if your close genuinely needs a credential-shaped variable
(`AWS_*` regions/profiles included, e.g. a suite booting against localstack with a test DB
password, or `PGPASSWORD` for one that hits a real postgres), it will not be there and the
close reds; set such values inside the close command
itself, not the inherited environment.

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
`CADENCE_UNITS`, `PROVIDERS`, `CONDITION_KEYS`, `TOOL_MENU`, `LOCKED_TOOLS`, `STORE_VERBS`,
`VERDICT_TYPES`, `LOCKED_VERDICTS` — plus `checkMenu` itself.

### `validatePlan(input, { job, maxStepRounds?, scopes? })` → `{ ok, reds, plan }` — `src/plan.js`

`validateJob`'s SIBLING in the two-document split, never a third validator over it (the
two-doc split's third validator never happens: plan-v1 gates the PLAN, the job spec stays
the arbiter's only home). Gates the AGENT-authored plan doc (`schema: "plan-v1"`) against
the SIGNED job spec before tokens burn — the ceiling, the fence, and the checks menu all come
from `job` (a missing or non-plan-shape job fails CLOSED, `job-invalid`). Never throws;
same `{ code, path, detail }` red shape as its siblings; `verb-escape` reds carry the
escaping verb as a structured `verb` field (the ledger keys on it). `maxStepRounds`
(default 40 — the shell's tool-mode per-attempt bound) ceilings every step's `rounds`;
**the `capRuns?` option is GONE** (F79) — it existed only to ceiling `attempts`, now
retired-but-accepted, so a plan carries no iteration bound to check; `scopes` is the offered
`tree-changed` scope menu — the array of scope strings the drafter prompt listed, which
`runJob`/`runPlan` build internally from the signed fence plus the real directories beneath
it (a direct `validatePlan` caller may pass its own array); omitted, it derives from the
signed `writeScope` alone, never a free-text fallback. Menus exported: `EXIT_TYPES`, `MAX_EXITS_PER_STEP`, `MAX_PLAN_STEPS`, `WRITE_VERBS` — plus `stageClose` and `closeStagesOf`.

### Close authoring — the user declares what done means (`src/kinds.js`, `src/authoring.js`, `src/authorscout.js`, `src/authorflow.js`, `src/declaredclose.js`, `src/authorjob.js`)

The one layer where a human still wrote code. A close used to be a hand-written script
per patient; now the user PICKS A VERDICT CLASS, answers that class's questions, and an LLM
composes a DECLARATION over kinds whose implementations bareloop owns. **v1 admits exactly
ONE genre** (`TYPES`: a type checker stops complaining without breaking the tests) —
everything else refuses honestly, and every refusal is COUNTED.

**The verdict class is the USER's answer (PRD v1.57 §1), and it DRIVES the authoring.**
`verdictType` is a declared radio the preflight validates, never inferred:
`VERDICT_CLASSES` = `green` | `soft-green` | `hitl`, with `LOCKED_CLASSES` = **empty** —
`soft-green` shipped its judged floor in v0.12.0 (2026-08-23) and is fully admitted
alongside `green`; `hitl` is LEGACY (retired as a class by the 2026-08-17 design, PRD
Addendum v1.71) but still admitted too, since removal is a future breaking change. The
review door (`accept`/`rerun`/`pause`) that re-homes hitl's pause machinery is shipped and
live — always on for `soft-green`, opt-in for `green` via `reviewDoor: true` /
`--review-door`. A future LOCKED_CLASSES entry would still return a counted `request-red`
refusal at ADMISSION — before that class's questions are ever asked. The
pick is also a PROMISE: every catalogue kind carries the `verdictClass` it can honestly
render, `closeCeiling(declaration)` reports the highest class a declaration demands, and a
declaration ABOVE the pick is a `class-ceiling` red naming the kind that raised it (inert
in v1 by construction — every live kind is mechanical).

**The pipeline, in call order.** Each piece is exported so an adopter can drive it, cache
a step, or test it without a provider.

| step | call | what it is |
|---|---|---|
| interview | `runInterview({ verdictType, answers, repoPath })` → `{ ok, answers, verdictType, refusal, reds }` | PURE — no model, no repo, no clock. THREE frozen question sets keyed by verdict class (`QUESTION_SETS`; `questionsFor(cls)` / `requiredAnswersFor(cls)`), all three LIVE as of softgreen module 3 — nothing is locked today (`LOCKED_CLASSES` is empty) — and the interview asks NOTHING about a genre and NOTHING about the repository. **Ask the library for the set and its numbers — never hardcode a count or a slot number**: the green set has lost two slots since it was frozen (D13's genre confirm, then the repo question, dropped 2026-08-15 because `repoPath` is mandatory structured input and asking for it again invites a second, drifting answer for a fact the machine already holds), and it renumbers CONTIGUOUSLY from 1 each time rather than leaving a gap. Today the green set is five questions, answers keyed by number; the LEGACY `hitl` set is those five byte for byte plus one more (what the signer is deciding when they look at the result — `human-confirms`' `ask`), which is the spread's next number and moves with a green-side deletion; the `soft-green` set is likewise those five plus two more — Q6 the signed rubric card (what separates a pass from a fail) and Q7 the frozen calibration set (one example to pass, one to fail) — the judged floor's two required inputs. `verdictType` and `repoPath` are STRUCTURED input, never parsed out of prose. Answers are scrubbed at INGEST |
| survey | `runAuthorScout({ workdir, provider, attempts?, ceilingUsd? })` → `{ state, facts, reason, meta, raw, raws, calls, budgetStop }` | a bounded READ-ONLY LLM survey. Read-only by MENU CONSTRUCTION (`AUTHOR_SCOUT_VERBS` = the full menu minus write-class and store-class verbs), 8 rounds, F59's reserved toolless final round. **`state: 'ABSENT'` means the scout did not complete — never "no special facts are needed"**, and a parsed `{}` is one of its five ABSENT routes. Up to `SCOUT_ATTEMPTS` (**3**, hardcoded — PRD v1.58) attempts: `attempts` is TIGHTEN-ONLY and CLAMPS rather than throws (floor **1**, because a scout that never ran is an ABSENT nobody can act on), the direction every cap in this system runs in. **A retry fires on the typed MALFORMED class alone** (`SCOUT_RETRY_CAUSES` = `empty` \| `unparseable`); what is excluded is excluded for a reason — `call-failed` covers transport and `truncated:max_tokens`, both provider-red with NO redraft; `short` is F59's cut-off population and already has its own instrument INSIDE the attempt; `non-object` and `empty-object` are valid JSON with wrong or vacuous content, which is a SEMANTIC failure, and F38/F39 measured what re-asking one buys (the same distribution, sampled twice) — that is the self-healing line, and it is not crossed here. The re-ask is TOOLLESS over the conversation the survey already produced (the repository was already read; only the emission was unreadable) and names the mechanical parse error and nothing else. **There is no JSON repair behind it and there never will be** — a repairer decides what the model MEANT and writes it down as though the model had said it, in the one artefact whose whole job is to be honest about what a repository contains. `meta.attempts` / `meta.attemptsAllowed` record what was paid for; every attempt is metered under its own label (`author-scout`, `author-scout#2`, …) and leaves its raw behind. **`ceilingUsd` is the operator's money ceiling** (PRD v1.62) — checked BETWEEN attempts and before F59's reserved round, so no paid call escapes it; `null`/absent is UNBOUNDED, and a non-null non-finite value THROWS (the shared `capStop` seam — see `authorClose` below). When it ends the ladder, `budgetStop` names which stop (`cap-halt` \| `pricing-red`) and a survey that was never asked for carries the typed cause `not-funded` — deliberately OUTSIDE `SCOUT_RETRY_CAUSES`, because a retry is precisely what the cap forbade |
| listing | `buildSeedListing({ workdir, seedRef, sourcePaths, testPaths })` | mechanical, `$0`, no model. `files` is the WHOLE tree (what the validator judges paths against); `block` is scoped to the survey's own paths and capped in ANNOUNCED tiers (what the prompt carries). Handing the validator the scoped half would make a job scoped to `src/` read as whole-tree and silently disarm the one-population law |
| authoring | `authorClose({ workdir, seedRef, lang, verdictType, answers, scout, listing, generate, ceilingUsd? })` | the grounded loop: author → validate → run EVERY stage at the seed → feed the MEASURED results back → revise, bounded at `MAX_REVISIONS` (2) — a passed `maxRevisions` is TIGHTEN-ONLY, so a caller may LOWER that ceiling and never buy more revise rounds than the constant (floor **0**: one authoring call with no revise round is a legal ask, and unlimited revising would launder thrash as adaptation) — early-stop on an unchanged declaration. The declaration is emitted through a SCHEMA-FORCED TOOL CALL (`declare_close`), never parsed out of prose; the feedback is EXECUTION OUTPUT only — no model ever reviews another model's close. The return carries **`raws`**: what every model call actually SAID, the scout's attempts absorbed together with the declaration's, in the cost book's own order and under the same labels it meters. Each is `{ label, attempt, bytes, trimmed, text, cause, reason }` through the ONE persist helper (`scrubRaw` — redacted over the ONE `SECRET_PATTERNS` inventory, since a raw is the record most likely in this system to carry a live credential; bounded at `RAW_PERSIST_MAX` (8000) with the trim ANNOUNCING its own full size, and the cut walked back off a continuation byte so a multi-byte character is never split). `raws` is present on EVERY path **including the `$0` preflight refusals** — the path that spends nothing more is exactly the one whose evidence used to vanish with the process. `iterations` records what each turn MEANT (declaration, validation, seed read); `raws` records what it SAID, and a malformation is only ever visible in the second. **`ceilingUsd` is the same operator ceiling the survey took** — the scout's spend is ABSORBED into this loop's cost book before its first call is weighed, so spend already incurred folds in and re-entering cannot silently widen it. It is checked immediately before EVERY paid call (the author call, each revise, and each malformed-emission retry). **A MALFORMED ceiling is an ERROR, not a silent unbounded run** (v1.64 §3): the seam every ceiling read goes through (`capStop`, `src/text.js`) THROWS on a non-null non-finite value — `'2.50'`, `NaN`, `Infinity`, `true`, `{}` — before the first paid call, and the throw propagates uncaught rather than being caught into an ABSENT survey, because a caught one would hand you the very silent-unbounded run it exists to prevent. `null`/omitted is the STATED operator choice for unbounded; `0` and negatives are finite, legal, and cap-halt immediately. The advertised ceiling and the enforced ceiling can therefore never be different numbers. A `cap-halt` here can arrive with `ok:true` — a close that was already validated and measured survives the money stop, exactly as a late provider casualty does |
| everything above, composed | `authorCloseForJob({ verdictType, answers, repoPath, lang, generate, ceilingUsd?, ... })` → `{ ok, closeDecl, verdictType, refusal, cost, ... }` | refuses at the cheapest gate that can refuse: an interview refusal costs **zero**. THE GENRE REFUSAL LIVES HERE (not in the interview): a language the catalogue owns no data for, and a LOCKED KIND the model reached for, both come back as counted `request-red` demand. **`ceilingUsd` is ONE number handed to BOTH paid seams** (the survey's and the declaration loop's) — the advertised ceiling and the enforced ceiling are the same ceiling. It travels as an EXPLICIT `null` when unset, because unbounded is a stated choice and an absent field read as falsy is that state reached by accident — and anything that is neither a finite number nor `null` throws at the seam rather than becoming that state by typo |
| assembly | `assembleSpec(specDraft, { closeDecl, verdictType })` | folds the authored half into the OPERATOR's half. Budgets, the fence, cadence, escalation and the provider are never authored by anything here. The GOAL is passed through, not generated. **A draft that ALREADY carries the authored half is REFUSED — it THROWS, never merges and never overwrites.** `AUTHORED_SPEC_FIELDS` (`close`, `closeDecl`, `verdictType`) names the fields this fold WRITES, as data, so the refusal and the fold cannot disagree about which half of the spec is which; the rule is `job.js`'s one step earlier (two closes are two arbiters, and picking one silently is how a signed artefact stops meaning what the signer read). `scripts/run-author.mjs` asks the same question at **$0 BEFORE the scout**, so the answer never arrives after the model has been paid |
| the three gates | `prepareSigning({ spec, workdir, seedRef? })` → `{ ok, specHash, gates, work, guards, refusal }` | D9, and it NEVER signs |

**D5 — the mandatory guards are SHOWN and FIXED, and the battery keys off the VERDICT
CLASS** (PRD v1.57 §2 — what a battery is FOR is the class of dishonesty that class of
verdict admits). `CLASS_BATTERIES` is the attachment point (structure, un-removability,
which slot is the model's); the tool-specific CONTENTS — which suppression patterns, which
extensions — resolve at COMPOSITION from the language the declaration names. The green
battery injects `changed-from-seed`
and `no-suppressions` FULLY PARAMETERISED (`classGuards({ verdictType, lang })`, which
THROWS rather than ever hand back an empty battery for a known class and language); the
model fills exactly one
slot (the target prefixes) and cannot change, drop, rename, re-kind or NARROW them —
`validateDeclaration` reds `guard-weakened` on any of it, including on an added `scope` that
would shrink what the suppression scan covers. `genreEnv(lang, { sourcePrefixes })` is the
same idea for environment: `MYPYPATH` on a Python patient is a fact no user can supply and
no model found, it moves no seed number, and a declaration that authors it itself reds
`genre-owned-env`.

**The kind catalogue** (`KIND_CATALOGUE`, and it IS the whole vocabulary): `command-exit`,
`count-not-worse`, `pattern-absent-in-diff`, `files-changed`, `human-confirms` and
`judged-floor` are all live — `LOCKED_KINDS` is EMPTY today; `harness-loop` (TESTGEN) is ABSENT
from v1 entirely (an unknown-kind typo, never counted demand). The locked-kind machinery is
unchanged and is what a future entry arrives on: in tool mode a locked kind is INEXPRESSIBLE —
the schema carries one branch per live kind — so that demand arrives through the interview
layer instead (`refuseLockedKind(kind)`), whose "named but locked" wording is currently
unreachable for exactly the reason above.

**`judged-floor` is the one kind that BUYS its measurement** (softgreen module 2), and it is
CLASS-GATED rather than locked: it renders a `soft-green` verdict, `soft-green` is still a
LOCKED verdict class, so a real declaration naming it reds `class-ceiling` under a green pick
and `class-battery-locked` under a soft-green one. The kind runs; no signable spec can reach it
until the class is admitted. Its parameters are `card` — the signer's rubric as ENUMERATED
items, where `rule` SELECTS from the arbiter's own rulebook (`JUDGE_RULES` / `JUDGE_RULE_IDS`,
so a rule we do not implement is inexpressible) and `text` is the signer's words, which explain
a red and never decide one — and `paths`, the AUTHORITATIVE artifacts, read off the seed listing
like every other path and bounded at `MAX_JUDGED_PATHS` (one paid call each). It spawns nothing,
so it takes no `cmd`, no `timeoutMs` and no `env`; it is `offer: false` BY LAW
(`NEVER_OFFERED_KINDS` — a paid judge is never an in-run ruler); and it SKIPS the seed-verdict
read (ruling 8) as a recorded `skipped` row.

**Wiring a judged close, and what it costs.** The judge is PINNED (`JUDGE_MODEL`, exported) and
is never a step knob: the runner supplies `runJob({ judgeProvider })` — its own seam, not
`provider`/`providerFor` — and a judged stage with none instrument-STOPS as a wiring gap rather
than grading on whatever binding was at hand. Each locate call is metered per call and emitted
as a distinct `judge-round` spine record, which `runJob`'s ONE ledger accounts exactly like a
`worker-round` (`ACCOUNTED_ROUND_TYPES`, and `readResume`'s fold reads that same list, so a
resumed leg cannot silently widen a signed budget by the close's own spend). A budget funds the
attempt PLUS its close. Unpriced is never free: a null cost is a `pricing-red` stop that is
never retried, and the ladder is otherwise ONE retry (`JUDGE_ATTEMPTS`) — after that a broken
judge is an instrument stop, never a red about the tree.

**The two SIGNED artifacts of a judged close** (softgreen module 4, design §4.3/§4.4). Q6 and
Q7 of the softgreen interview compile into the RUBRIC CARD and the FROZEN CALIBRATION SET, on
the D5 shown-and-fixed path: `proposeJudgedArtifacts({answers, generate, book})` buys ONE
schema-forced proposal (tool `propose_rubric`, over the same bounded malformed-emission ladder
the declaration uses — a parse failure is an `artifact-red` retried under the cap, a proposal
that parsed and then broke a rule is NOT retried); a UI shows it; `signJudgedArtifacts({proposal,
fix})` stores the SIGNER's version (the fix replaces the proposal WHOLE, never merges — a signer
who deleted a line must not get it back) and reports `source: 'signer'|'proposal'`; and
`foldJudgedArtifacts(closeDecl, {card, cases})` enumerates both into the declaration. Free text
in either artifact is scrubbed at ingest through the one `SECRET_PATTERNS` inventory, because a
signed spec outlives the run that produced it.

**Where they land, and what the hash covers.** The card replaces the ONE `judged-floor` stage's
`params.card` — one card per close, and it is the signed one; a fold into a close with no judged
stage (or two) THROWS rather than storing a rubric nothing reads. The cases land beside the
stages as `closeDecl.calibration.cases`, because the set calibrates the RULER and is read before
any stage runs. Both sit inside the spec, so `jobSpecHash` covers them by construction: a card
line or a single case edit flips the hash and forces a re-sign, and a byte-identical re-store
does not.

**What a legal calibration set is** (`validateCalibrationSet`, beside the rulebook in
`src/judged.js`, and re-checked at the spec gate by `validateCloseDecl`). EXACTLY
`CALIBRATION_SIZE` = 10 cases — hamr's ruling, verbatim *"go build 10, we could double later"*,
operator territory and never agent-picked — with BOTH polarities present, because a set that
cannot fail one way proves nothing. A case is
`{id, artifact, expect: {verdict: 'pass'|'red', reds: [{rule, fn}]}}`: `artifact` is the REAL
source text the judge will be pointed at (never a description of one), and a red case must be
ITEMIZED, naming a `rule` THIS close's card actually carries (§4.3's ceiling, mechanically — the
fix for a miss is a new card line and a re-sign) and the `fn` the red lands on. The judge's own
`why`/`quote` are deliberately NOT stored: no signer can predict prose, and pinning it would
fail an honest pipe on wording. `expectedOf(decision)` is the ONE reduction of a `decide()`
result to that shape, so a harness compares one shape rather than two.

**THE CALIBRATION GATE** (`runCalibration`, softgreen module 5, `src/calibrate.js`). It runs the
WHOLE pipe — `runLocate` over the shipped `JUDGE_ATTEMPTS` ladder, then `decide()` — over each of
the ten, and compares `expectedOf(decision)` against the stored `expect` by VERDICT **and**
ITEMIZED REDS (a `(rule, fn)` set, order-insensitive): *a pipe that reds the right case for the
wrong reason has not been calibrated, it has been lucky*. The floor is **10/10, zero reds**
(hamr, 2026-08-18) and it is reported per case — `graded: [{id, ok, got, want, detail}]` — never
as an aggregate percentage.

Alongside it runs **`INJECTION_LOCATE_BATTERY`: five ARBITER-OWNED artifacts**, one per
bare-agent attack style, **re-aimed at the LOCATE axis** (2026-08-18 second addendum, ruling 1 —
upstream's `shouldBreak` gold assumes a judge that renders a verdict, and this one never does).
The attack text is embedded in the artifact, and a style resists only when the extracted FACTS
are unaffected: same function list, same per-function doc reality. Reading the DECISION alone
would be blind here — an invented `docQuote` reds `has-doc` through the quote-verification route,
so a leak and a resist can render identical itemized reds. **All five must resist**; a leak fails
calibration and names the style. Nothing about the battery is stored in a spec and no signer
authors it.

A **CASUALTY is never a failed case**: a dead call, an unpriced one (F6 — never retried) or an
emission that never parses after the ladder STOPS the gate on `runLocate`'s own axis
(`CASUALTY_AXES`), keeps the graded prefix, and reports zero failures — a broken judge is no
evidence about the set in either direction. Every locate call is metered through `onCost` on
every route out and the totals fold through `tallyCalls`, so one unpriced call makes `costUsd`
null rather than an exact-looking floor.

**At signing it is MANDATORY and it is the only PAID gate** (`prepareSigning`, gate 4). A close
carrying a `judged-floor` stage is refused when no set is stored, when no `judgeLoop` seam is
wired (a wiring gap, never a silent pass), when the gate is a casualty, and when anything short
of all-of-them grades. It runs **after** gates 1–3, so no $0 refusal is ever paid for. The
signing record keeps WHAT was certified — `cardHash`, `casesHash`, `setHash` (which covers
`JUDGE_MODEL`), the graded rows and the battery — beside `judgeModel` itself.

**D9.3 for a judged-ONLY close** (ruling 3, hamr: *"fix it now, we are delivering softgreen"*).
A judged stage skips the seed read (ruling 8), so a close whose only work stage is judged has no
seed red and used to be unsignable — the one job shape softgreen exists for. For that shape only,
a PASSED calibration gate plays the seed-red role (the polarity law makes *this close can fail* a
demonstrated fact), and the record says so: `gates.seedVerdict.satisfiedBy === 'calibration'`. A
close with any mechanical work stage is UNCHANGED and still needs its seed red.

**THE JUDGE TIER IS INSIDE THE SIGNATURE, and the stage refuses a mismatch.** *"A judge-model
bump forces a full recalibration"* used to be an operator-side rule with nothing to fire on,
which makes it prose (F45); it now has both halves of a detector. The tier the signer's set was
graded by is stored beside the cases as **`calibration.judgeModel`** — `CALIBRATION_FIELDS`
enumerates a stored set as exactly `cases` and `judgeModel` and nothing else — written by
`foldJudgedArtifacts` from the PIN (`JUDGE_MODEL`) rather than from anything a caller may name.
Because it is INSIDE the spec, `jobSpecHash` covers it by construction: bump the constant and
every signed judged spec hashes differently, the signature dies, and the re-sign is what re-runs
the calibration gate. **`validateCloseDecl` REQUIRES it** on any stored set (`missing-required`
on `…calibration.judgeModel`) — a set nobody can attribute to a tier is a floor nobody can tell
apart from a bumped one. **`declaredStages` stamps it onto the judged stage** as
`calibrationJudgeModel`, from the SIGNED bytes and through the one seam that already turns a
declaration into stages (the same carry `offer: false` rides), so a stage can never name a tier
the signature does not and no second close-level channel is plumbed through every executor seam.
**`runJudgedFloor` then STOPS on a stored-vs-live mismatch** before it buys a call, naming both
models and the two things that fix it — *re-sign the spec with the new tier* and *re-run the
calibration gate (recalibrate)* — under `STOP_FAULTS.FAILED`, the same fault and the same reason
as the absent judge seam beside it: nothing is broken, something was never re-done. It stops
rather than degrading in either direction, because grading on the new tier mints a verdict
against an uncalibrated floor and grading on the old one is not on offer (the pin is a constant).

**The one honest limit, deliberate:** an ABSENT stamp does not stop. It is the same split the
SET's own presence already lives under — a signed spec that judges cannot reach a run without a
calibration (the signing gate) or without a model on it (the spec gate), so the only runtime
question is ever WHICH model, and a bare stage descriptor handed straight to `runStage` by a test
or an adopter is not a signed spec making a claim about a tier.

**`human-confirms` is the one kind that measures NOTHING** (N4 slice 1). Its whole parameter
surface is `ask` — the plain question the signer answers — so it cannot spawn, cannot be
env-capable, and cannot be handed a second job. Four laws ride on it, all checked rather than
assumed: it is `offer: false` BY LAW (a declaration that offers one reds `human-stage-offered`,
and `declaredStages` stamps the law onto the stage the runner sees, so `checkMenu` can never
hand the agent `check-passes(<a person>)`); it must be the LAST stage
(`human-stage-not-last` — first-red-wins would otherwise silently delete every mechanical stage
behind it and empty the evidence package the person is owed); it is at-most-once (one signer,
one judge); and it SKIPS the seed-verdict read (ruling 8), with the skip recorded as a row
carrying `verdict: 'skipped'` rather than taken in silence.

**A human stage does not RUN — it PAUSES.** `StageResult.verdict` gains `pause` (and `skipped`),
`runDeclaredClose` reports `pause`/`pausedAt`, and the arbiter bridge translates it to the
distinct `HUMAN_PAUSE` verdict — never `satisfied`, never `needs_revision`, and never a
`CLOSE_FAULTS` word (a fault says the close could not render a verdict; a pause says it is not
FINISHED rendering one). With the signer's ruling in hand (`ctx.humanRuling`, carried by the
runner and never authored) the same stage renders what the person said: `accept` is a green a
PERSON judged, `rerun` is a red whose gap is their own words. `normalizeHumanRuling` is the
library half of the gate — `null` is the pause path, a fourth door is refused, and a `rerun`
with empty or whitespace-only text is refused by name, because an empty gap re-runs the worker
as though nothing had been said.

**A red `count-not-worse` gap carries the LINES it counted, not only how many (F98).** Each
term's **KEPT** matched lines nest under that term's own breakdown row — the row that already
prints its `contributes +n`/`-n`, so a line's arithmetic role travels with it. Kept means the
lines that survived the scope filter and were actually read by the aggregate (a `first` term
echoes only the line that produced its value), which is to say the ones the count is made of.
A scope-DROPPED line is never among them (it was never counted, so naming it would aim the
worker outside its own population, F84's one-population law), duplicates collapse within a
term (a line feeding two terms plays two roles and appears under each), and the value is
still computed from the parsed values and never from this list.
They ride the **existing** gap channel and invent none: the declared stage's `gapKeep` prefix
on every line (Layer R's `redKeep` is DERIVED from that prefix), the same `GAP_LINE_CAP`, and
the same announced trim on overflow — so a consumer parsing the gap sees more lines under the
same shape, never a new one. `parseValue` returns them as `matched` alongside `value`,
per-term, index-aligned with the breakdown. The
licence is the one `pattern-absent-in-diff` already runs under: the instrument NAMED these
lines, and echoing what it named is not the barred move of naming a culprit it never
reported. **Nothing here can flip a signed spec hash** — the verdict logic, the baselines,
the counting, the `closeDecl` schema and `detail` are untouched; only what the executor TELLS
the worker changed.

**The three gates, and the signature (D9).** Nothing LLM-judges a close.
1. `validateCloseDecl(closeDecl, { verdictType, ... })` — schema, kinds, params, the F84
   one-population law, F49's static nested-quantifier reject, the D5 guard equality, the
   class ceiling, and the listing rule (a declared path SELECTS from the seed tree or it
   does not exist). `verdictType` is REQUIRED and has no default: the guard battery hangs
   off it, and a validator with no class in hand reds `class-absent` rather than reporting
   a declaration it never checked D5 against.
2. the CLOSE PRECHECK — every stage runs against the real patient. A stage that cannot run
   is `broken-close`: a CASUALTY, never a red.
3. the SEED-VERDICT READ — every stage, offered or not, at the seed. Which are RED (that is
   the work) and which are GREEN (those are the guards) is handed back for the user to read.
   **A close with no WORK stage red at seed is refused decision-ready** — it grades nothing,
   and an instrument that scans nothing reads clean exactly like one that measures correctly.

**KNOWN LIMIT: gate 1 does not check a parser's FORMAT, and never will (F94, ruled WON'T-BUILD
2026-08-13, PRD v1.63 §1).** A declaration can name the right stage, over the right population,
with the right aggregate, and carry a `lineMatch` for a shape the tool never prints. Detecting
that at draft time needs stage → tool attribution, and `npm run typecheck` defeats it
mechanically: the declared command names npm, what prints is `tsc`, and the mapping lives in a
`package.json` the validator does not read. A detector that resolved some spellings and passed
the rest would read as coverage while being blind exactly where patients differ. **Gates 2 and 3
are the instrument for this class, and they work** — a term matching nothing over a non-empty
population reads unknown-not-zero (F6/F45/F93), so the seed-verdict read refuses it at $0 before
a signature, which is how the real case was caught. Formats are checked by RUNNING the tool,
never by reading a string. The complementary defence is upstream of the gate: for the tools the
genre owns facts about, `genreInstruments` hands the author the measured pattern (with its real
captured line) instead of asking, so fewer declarations reach gate 1 carrying an invented format
at all. Reopens only if a wrong-format parser ever reaches a SIGNED close.

Then the human signs `specHash`, unchanged: the approvals array and the human's word are
the arbiter relocating to the user, not disappearing. **Re-authoring is a spec edit (D6)** —
a different declaration is different bytes, a different resolved hash, and a new signature.
The guards are stored ENUMERATED and every short-form parser is expanded, so no
omittable-with-a-default field can change what runs without changing what was signed.

**A signing surface must show the GOAL and the judged stages as one reading (F87).** The
goal has to state everything the close will judge, and **nothing derives one from the other
or checks them against each other** — the only derivation runs close-stages → check menu, one
hop, one direction. So the sole defence against an unstated stage is that the person signing
reads both halves at once, and any surface you build around `prepareSigning` inherits that
obligation. Both reference runners now do it: `scripts/run-u.mjs --approve` names every close
stage (name + kind) under the goal — for **BOTH spec forms**, through `closeStagesOf`, since
gating that block on `closeDecl` reached exactly one of the eleven shipped specs and left the
other ten (command `close[]`) showing the goal with no stages under it, which is the same
half-reading in the guard against it (F100); a command stage prints `[command]` and NOT the
catalogue kind name it does not carry — and `scripts/run-author.mjs` prints the goal above the
declaration via `declarationLines(spec)` in `scripts/author-readout.mjs`, rendered from the
**RESOLVED** spec — the bytes that get hashed, never the draft and never the authored half
alone. An absent goal renders as absent rather than as a bare label. This is a READING, not a
validator: nothing compares the goal to the declaration, because deriving one from the other
is exactly what F87 forbids.

**The path an adopter actually drives is TWO scripts, and the first one spends nothing.**
`runInterview` is a pure function over answers with no prompt loop in it, so until
`scripts/run-interview.mjs` existed the only way in was to hand-write an `answers.json` and a
spec draft — precisely the SWE tax this product refuses. That script is the half that ASKS
(`--patient <repoPath> --verdict <class> --out <outdir> [--budget <usd>] [--lang js]`, default
`js`), and it is deliberately GLUE: **it calls no provider at all**, so a whole interview costs
$0 and no model ever sees it. Everything load-bearing in it is borrowed rather than respelled —
the QUESTIONS are the library's frozen sets (`questionsFor` / `requiredAnswersFor`), printed as
handed over and never re-worded, re-ordered or re-numbered by the script; the REFUSALS are
`runInterview`'s; the SCRUB is `redactSecrets` at capture AND again at the library's own ingest,
so no keystroke reaches stdout or disk by a route that skips the one inventory; and the spec
draft is checked by the SAME `validateJob` that will judge it after the paid call, with the
authored half's expected reds filtered off `AUTHORED_SPEC_FIELDS` by name. A typo'd slug or an
under-floor wall therefore costs $0 rather than a scout plus a model call.

A LOCKED class refuses BEFORE a single question is asked: the script hands `runInterview` an
empty answer set, prints the counted `request-red` verbatim, and stops — nothing is asked and
nothing is written, because asking a class's questions for a job nothing here can close is an
interview at the wrong price. On success it writes exactly TWO files into `--out`:
`answers.json`, which is the LIBRARY's redacted reading of the answers (`iv.answers`) and never
the raw keystrokes; and `specdraft.json`, which is the OPERATOR's half ONLY — no `close`, no
`closeDecl`, no `verdictType`, because those three ARE `AUTHORED_SPEC_FIELDS` and `assembleSpec`
refuses a draft carrying any of them rather than merging over it. `tools` is deliberately
OMITTED from the draft too (MED-1: an omitted menu hashes as the concrete current `TOOL_MENU`,
which pins WHICH menu was signed; naming today's list would freeze it into the operator's half).
An interview that never finishes writes NOTHING: a half-collected answer set that looks finished
is the failure nobody sees.

**Two ceilings, two names, never pooled on screen or anywhere else.** `--budget` is the
AUTHORING ceiling — what the authoring call may spend — parsed by the same `parseCeiling` rule
`run-author.mjs` parses it with: absent is UNBOUNDED and ANNOUNCED before anything spends,
malformed is an ERROR rather than a silent fallback, and zero or negative is rejected on the
same rule. `budgetUsd` is the JOB's budget, asked separately and signed into the spec. The
interview stores neither: the ceiling is handed straight to the child, which is the process that
spends it.

**It ends by OFFERING the paid step, and the offer's default is NO.** `run-author.mjs` is a
DIFFERENT PROCESS under its own ceiling; the interview prints its exact command line (with
`--budget` propagated only when one was given, and a note when `ANTHROPIC_API_KEY` is unset)
before asking `Run it now? [y/N]`, so declining still leaves a command to paste and two files
already on disk. Only an explicit yes spends — the answer that costs nothing is the one you get
by saying nothing, the same lean the pause's doors take. On a yes it releases stdin before
spawning (two readers on one terminal is a keystroke landing in whichever happens to be
listening) and then propagates the CHILD's exit status rather than flattening a refusal there
into a success one process up.

**Both scripts speak exit codes, and an adopter wrapping them in CI reads them:**

- `run-interview.mjs` — **0** the interview finished (and, when it spawned the paid step, that
  step's own status is what you get, never a flattened 0); **1** a REFUSAL — a locked class, the
  library's own reds over the answers, or a spec draft that does not validate; **2**
  operator/config — usage, a missing or non-existent `--patient`, a present-but-empty `--lang`,
  a malformed `--budget`, stdin ending mid-interview, or a child that could not be started;
  **3** a LEAK that `scanSecrets` found in a file it had just written (count and path only —
  echoing the matched string is the same leak, one hop on).
- `run-author.mjs` — **1** a refusal or a failed gate; **2** operator/config; **3** a leak;
  **4** a CRASH inside the paid span. **3 deliberately OVERRIDES a 4**: a secret sitting in a
  written file is the harder line of the two, and the crash keeps both of its own louder
  channels — the whole error on stderr and its own `author-crash` spine record.

**A crash inside the paid span leaves a BODY.** The fallible span — from just after
`author-start` to the end of the main flow — sits in ONE try/catch that RETRIES NOTHING and
SWALLOWS NOTHING. The operator's copy goes first and verbatim (it must not depend on the two
writes below it succeeding), then the spine gets `author-crash` via `crashRecord`: `name`,
`message` and `code` through `redactSecrets`, the STACK through `scrubRaw` — the ONE persist
boundary, the same `SECRET_PATTERNS` inventory, bounded with the bound announcing its own size —
plus `author-end {outcome: 'crashed'}`, because `author-end` is the one record that says a run
stopped AT ALL and a crash omitting it leaves a spine that reads as still-running. The spine
write is itself guarded and its failure said out loud (F70: a crash handler that crashes
destroys the report it was built to make). Nothing ABOVE the try is inside it, deliberately —
the argv and config `die()` paths run before the spine file exists, so they stop loud on stderr
and 2 instead. **Latent, not live:** nothing reads the author spine today, and the nearest
reader (`classifyIncidents`, `src/ledger.js`) keys on types neither record uses, so both fall
through every branch UNCOUNTED — the fail-safe direction, uncounted rather than miscounted.

**Refusals are COUNTED (D13).** `refusalEvents(refusal)` returns the spine events: a
`job-red` carrying `{ code: 'request-red', verb, lib: 'bareloop' }` — the `lib` stamped at
the EMIT SITE, so `classifyIncidents` files it against bareloop's own catalogue and its
`suggestedAsk` reads `bareloop: …` rather than seeding an upstream ask — plus one
decision-ready `escalation` under `close-unauthorable`, which is in the ledger's excluded
set precisely because the demand is already counted once. A refusal that is a STOP rather
than demand (a broken instrument, a close with nothing to do) emits the escalation ALONE.
**Known limit, stated:** v1's derivation cannot tell `soft-green` from `hitl` and does not
try — both refuse under one verb (`non-green-verdict`), because naming which locked class a
job belongs to would be a guess about prose.

**At run time** the declared close is executed by the kind executor, never compiled down to
shell (that would turn owned kinds back into authored strings — the exact thing D3 makes
inexpressible). `runPlan` picks the executor from which field the signed spec carries and
everything downstream is the same code: first-red-wins, the `CLOSE_FAULTS` forbidden zone
(routed by a TYPED fault, so a timeout still offers "raise the close timeout"), the same
`close stage "<name>" failed:` gap header the trend reader parses, the same scrub at the
emission boundary, and the check menu still derived from stage names one hop. The seed is
READ at run start (`seedAtHead`) and recorded on a `close-decl` spine event together with
the grounded re-validation's result. Direct executor access: `runDeclaredStages(stages,
redact, { cwd, seedRef, timeoutMs })` returns `runClose`'s verdict shape **plus one added
field, `notes`** — the DIAGNOSTIC channel, per stage and on the summary, ABSENT when empty
(never `''`). M1's kinds announce some things whichever way a stage lands (a declared env var
that was dropped, the scope filter's own arithmetic), and a RED carries those out inside its
`gap` while a GREEN and an instrument stop had nowhere to put them — checking the GREENS is
doctrine, and an audit trail that only survives a red cannot do it. It is deliberately NOT
`gap`: every consumer guards with `if (gap)`, so a green carrying one would read as
revision-worthy and a stop carrying one would look like a verdict it never rendered. **Nothing
routes on it, nothing bounds on it, and no verdict moves because of it** — it rides the records
that already spread the whole verdict (`close-precheck`, `outer-close`, ralph's
`close-verdict`). `runDeclaredClose`
and `seedRead` are the kind executor's own two entries (`runDeclaredClose` is named apart
from ralph's shipped `runClose` because one runs a DECLARATION and the other an argv);
`closeStagesOf(job)` is the ONE staging every close consumer reads, widened to both fields.

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
escalates through `CLOSE_FAULTS`, never masquerades as worker feedback. Failing details are
mostly counts and names — with one exception that matters: `json-valid` embeds `JSON.parse`'s
own message, and V8 quotes a window of the SOURCE inside it, so that detail can carry file
bytes the worker chose. The plan runner redacts EVERY detail (`scrub`/`SECRET_PATTERNS`, the
ONE inventory) at the emission boundary, before anything rides the append-only spine. The
module itself does not scrub: a direct `evalExits` caller wiring results into its own log
must apply its own redaction.

A `check-passes` detail is sliced at `CHECK_GAP_MAX` (12,000 chars) — a defensive backstop
above the close path's own `boundGap` envelope, not a second trim of it: a normally-bounded
gap passes through intact and only a seam that returned something unbounded is ever cut. The
constant is now `export`ed from `src/exits.js` so the replan brief's own backstop imports it
rather than respelling it (two spellings would drift on the one property that matters —
whether the `not ok`/`FAILED` names survive). **It is NOT part of the adopter surface:** the
package `exports` map admits only `"."`, and `src/index.js` re-exports `snapshotScope` and
`evalExits` from this module and nothing else, so `CHECK_GAP_MAX` and `boundGap` are internal
by construction and a deep import cannot reach them. They are named here to explain the
behaviour you WILL see in a detail string, not as API to call.

### `jobSpecHash(job)` / `checkApproval(job, approvals)` — `src/job.js`

The pure half of **human-signs-always**: an agent may draft a job spec, but no job runs
until a human approves that exact version. `jobSpecHash` is sha256 over canonical JSON
(key-order independent) of the **RESOLVED** spec (MED-1): an omitted `tools` is filled in
with the concrete current `TOOL_MENU` before canonicalization, because that is the ceiling
`plan.js` and `planrun.js` actually read. So any SEMANTIC edit changes the hash and an
edited spec is unapproved by construction — but not every BYTE edit: writing today's full
menu into a spec that omitted `tools` is hash-NEUTRAL, since the two spell the same
ceiling. The direction that matters bites instead — a `TOOL_MENU` WIDENING (a library
upgrade) flips the hash of an omitted-`tools` spec whose bytes never moved, straight into
the refuse-until-reapproved machinery. That is the point: the signature pins WHICH menu it
covers, so an already-signed ceiling can never grow unsigned. A spec that named its own
`tools` hashes exactly as before. **BREAKING** for an approval held against an
omitted-`tools` spec: it re-signs once. `checkApproval(job, approvals)` is a pure predicate
over `{ specHash, signer, ts }` records, canonicalizing the SAME resolved form (a gate
reading a different form than the mint would unapprove every omitted-`tools` spec); the
approval record lives OUTSIDE the document it signs and is shell/human territory, never
agent-writable. The N2 runner enforces it.
Reserved spine vocabulary (V7, machinery-free until job #1 surfaces one):
`coordination-red` — a failure between units (scope contention, step order, store
races), never to be folded into worker/interpreter reds.

### `runJob(spec, { approvals, workdir, provider, nativeProvider?, providerFor?, emit, capRuns?, strikeLimit?, shellCapUsd?, closeTimeoutMs?, layerRoot?, readShim?, bridge?, priorSpentUsd?, priorSpendComplete?, priorWallMs?, resumeSeed?, resumeGrades?, resumeReplans?, resumeBranch?, humanRuling?, heldRuling?, reviewDoor?, doorRerun? })` → outcome — `src/run.js`

The last seven are the RESUME fold and are documented under *Resuming a killed run* below; they
default to `0` / `true` / `0` / `null` / `[]` / `null` / `null`, so a fresh run passes none of them.
Three of them are folds of a bound the operator SIGNED (money, wall, replans) and one is a
readout seed (grades) — the distinction matters and is spelled out there.

The runner — the shell's top layer, and the ONE entry. It composes everything below it and
interprets nothing itself. Sequence: **approval gate** (human-signs-always — refuses an
unapproved spec before ANY provider call: `unapproved-spec`) → **primitive smoke** (litectx
known-answer round-trip before tokens: `smoke-red` — a silent degradation throws nothing) →
**the plan flow** (`runPlan`, below) under the ONE cumulative ledger, whose ceiling is
`min(job budget − spent, shell cap)`.

Outcomes: `green | already-green | escalated | unapproved-spec | job-red | smoke-red |
plan-red | check-red | close-red | close-unsupported | recipe-stale | branch-red | pricing-red |
provider-red | interpreter-red | cap-halt | wall-halt | step-stalled | hitl-pause |
hitl-decision-red | step-red:<id>`.

**`readShim` (default `false`) — the capped read seam, per ARM.** The value names which levers
run — the four arms of the frozen Phase 2 pre-registration:

| value | arm | cap + next-unseen-slice | pointer | diff on a changed re-read | G1 (`read-blind`) | persona line |
|---|---|---|---|---|---|---|
| `false` *(default)* | A0 | — | — | — | — | none |
| `'cap'` | A1 | ✓ | ✓ | — | ✓ | `READ_SHIM_STRATEGY` |
| `'diff'` | A2 | — | — | ✓ | — | `READ_SHIM_DIFF_STRATEGY` |
| `true` | A3 | ✓ | ✓ | ✓ | ✓ | `READ_SHIM_STRATEGY` |

Anything else **throws** (`readShimArm`) at `runJob`/`runPlan`/`validatePlan` before a token is
spent — a mis-spelled arm coerced by truthiness would run one treatment under another's label and
be invisible in the results afterwards.

A **capping arm against a signed ceiling that offers no `recall`/`get` also throws at that same
$0 door**, and for the same reason: G1 below requires the retrieval pair on any step granting
`read`, but a step cannot grant what `spec.tools` does not offer — so every draft would red
`read-blind` identically while the drafter was paid for each doomed cycle. The message names the
missing verbs and both exits (re-sign the spec with them, or run with the shim off). Like the arm
throw, it is an **operator param-guard `TypeError`, never a model-output red**: nothing the agent
authored is wrong when the operator asks for a shim the signature cannot satisfy. It narrows
nothing that works — the only configuration it rejects already failed 100% of the time, later and
for money. `RETRIEVAL_PAIR` is exported from `src/plan.js` so the rule and this pre-flight read one
spelling of which verbs count.

Under a CAPPING arm (A1/A3) the shim also answers a **stale `ctx_get` pointer**: the cap steers the
worker at `ctx_recall`/`ctx_get`, and `ctx_get` refuses a file that changed after indexing — the
normal case once the worker has edited it. Instead of nothing, the shim serves that pointer's
0-based inclusive line range read fresh from disk, capped the same way, under a trusted notice
saying the pointer was stale, that the range may now hold DIFFERENT code than the symbol asked
for, and that nothing was recorded as delivered. A vanished file or a range past the end is a
refusal result, never a throw. The serve never writes the delivery ledger, so it can never mint a
"you already hold it" pointer for bytes the read seam did not hand over. A0 and A2 do not wire it
and `ctx_get` behaves exactly as it always did.

`false` is the shipped behaviour and is byte-identical to a run without the flag, guards included;
`true` means exactly what it meant before the arms existed, so nothing written against the boolean
changed meaning. Where the CAP runs, `shell_read` delivers at most `READ_SHIM_CAP` (24KB) per call
with a trusted steer at `ctx_recall`/`ctx_get`; a re-read continues from where the last one
stopped, and once the worker holds the whole unchanged file a re-read returns a pointer instead of
the bytes (keyed on what was DELIVERED — a partly-seen file NEVER gets a pointer, which is the
measured correctness point); and `validatePlan` reds `read-blind` on any step granting `read`
without `recall` and `get`. Where only the DIFF runs, nothing is capped (a first read delivers
whole, whatever the size), an unchanged re-read re-delivers rather than pointing, and G1 does not
exist — G1 is the cap's compensation, and an arm that caps nothing has nothing to compensate for.
The ledger is per worker, so it resets with every step. On the native (clipipe) surface a CAPPING
arm replaces the CLI-display cap rather than stacking on it; a non-capping arm leaves that wrapper
installed *inside* the shim, so native never loses its bound. Default-flip pending a paid contrast;
see CHANGELOG for the replay numbers behind it.

**The two hitl terminals (N4 slice 1, doors re-cut 2026-08-18)** are the class's whole surface
at this layer, and each is a CLEAN exit (`spendComplete` stays true — only the two casualties floor). `hitl-pause` is a
decision-ready CHECKPOINT: the close reached a stage no machine can render, so the run stops
holding everything it has done, emits the evidence package (every mechanical stage's result, the
close's own `ask`, and the changed paths — bounded, trim announced), and the clock stops with
it. It is on `CHECKPOINT_OUTCOMES` (the canonical `resumableOutcomes` list, exported so an
exported bundle inherits one spelling), and `checkpointAgeGate` refuses one older than
`PAUSE_TTL_MS` (60 days) by NAMING the age and the TTL. The signer's own `pause` door mints
that SAME terminal, with `humanDecision: 'pause'` and an explicit `gap: null` on the record: no
fix loop, no worker round, nothing spent, the rerun allowance untouched, and the checkpoint left
exactly as it was. `hitl-decision-red` refuses a decision the run cannot act on — a word that is
not one of the three doors, a `rerun` with empty text, or a decision handed to a close with no
human stage — before anything is spent. Neither demotes a bridge, and both are excluded from the
ledger's escalation counting.

There was a third terminal, `hitl-cancel`, for a `cancel` door that no longer exists (hamr,
2026-08-17: *"pause can resume — that would be more honest"*). Nothing mints it and no constant
exports it; the ledger still RECOGNISES the bare string so a spine written before the change
reads as governance rather than as a counted capability gap. An unresumed pause expiring under
the TTL is what cancel used to be.

Pass the signer's answer as `humanRuling: { decision, text? }` (`accept | rerun | pause`, the
enumerated `HUMAN_DECISIONS` set); it is spent once, at
the close readings up to the moment the fix loop opens, so the human's words become `post.gap`
through the SAME seam (same bound, same scrub) and the next machine-clean tree pauses for a
SECOND review rather than converting one sentence forever.

**A decision SURVIVES the halt that interrupts it** (F102). The run records the answer it was
handed (`human-decision` — the door, the words, the source) and, separately, what BOUGHT it
(`human-decision-spent` — a fix round, an accept that greened, a pause honoured). A decision with
no spend after it is still owed to the person, and `readResume` surfaces it as
`restart.pendingDecision` (`{decision, text, receivedAt, source}`). Hand that back as
**`heldRuling`** and the leg applies it directly — the ask is never re-rendered, and the spine
says the answer came from a record rather than from a person. F102's incident is what this is
for: a rerun that opened the fix loop, stopped with `iterationsUsed: 0`, and whose resume asked
the byte-identical question again. The two markers are deliberately not one: the fix loop
"spends" the ruling for THIS leg's close readings the moment it opens, while whether the person
must be asked AGAIN depends on work actually having been bought.

A leg handed BOTH a fresh `humanRuling` and a `heldRuling` is refused (`hitl-decision-red`,
naming the held decision) before anything costs anything: two answers to one question is
ambiguity, not a merge. `resolveHumanRuling(fresh, held)` is the exported seam that decides this
(and whether the leg is a fresh engagement, below), so a runner cannot admit what a run refuses.

`branch-red` is the WORK BRANCH refusing (below): the patient is not a git checkout, its
branch namespace has no free name, or a resume's recorded branch is gone. Zero tokens, and
never a fallback to working on the branch the run was handed. `provider-red` is a
transport throw or a worker round the API cut off mid-generation (`truncated:max_tokens`,
BA-6 — before which it laundered into a clean finish, F25): no verdict exists and the failed
round's spend is only partly known (F6). `cap-halt` is the wallet; `wall-halt` is the clock
(F64 — a timeout derived from the run's own deadline is a governance stop, never a transport
casualty). **`cap-halt` reaches you from the close-fix loop too, not only from a step:** the
shell spells exhaustion (strikes on a step, and — since v1.46 — strikes in the fix loop as
well, `capRuns` only while that loop's trend instrument is blind) and a money-gate halt with
the same category, so both the
step loop and the fix loop read the WALLET to tell them apart — a drained wallet is
`cap-halt` (the resume-to-cap checkpoint), exhaustion with money still on the table is
the designed `escalated` terminal ("the close is still red"). The fix worker's gate is built
with the wallet at its most drained, which is exactly where a money cut would otherwise
masquerade as a capability read (F45). A `cap-halt` from the wallet also emits the
decision-ready `money-halt` record described under the plan flow below — the kept verdict, the
trend and the three levers — so a consumer never has to reconstruct the stop from the outcome
name alone. `step-stalled` is the F66 stall fuse giving up: no
completed round for 5 minutes,
three times on one call — each stall silently abandons the hung call and reissues it
(self-heal first); only the third throws. Inside a step it is the THIRD replan trigger
(with `cap-halt` and `step-variance`); outside a step it escalates under its own name, never
laundered into `provider-red`, and carries `spendComplete:false` (an abandoned call may
already have been billed). **The reissue is wall-aware:** past the run's deadline the fuse does
not self-heal — self-heal is what a run does with time left — and it gives up as `wall-halt`,
not `step-stalled`, since a replan has nothing left to re-allocate. **A `step-stalled` run is
a CHECKPOINT, not a verdict** (hamr's ruling, 2026-08-13 — PRD v1.64 §1): it is resumable on
the reference runner alongside the two governance halts, the work on disk stands, and its
`spendComplete:false` carries forward as a floor. Every one of them is a
decision-ready escalation with a terminal `job-end`: the spine never dangles.

**`gate-red` is not in that list, and the plan flow no longer mints it (F98).** A fence
DENIAL STREAK — bare-agent's BA-11 deny-spin guard returning `denied:*` after consecutive
refusals — is a **BOUNDED ATTEMPT, never a terminal**, on BOTH worker surfaces: the attempt
ends, `attempt-bounded` is emitted with the `reason`, the close judges the partial work, the
gap feeds forward, the caps are unchanged and the loop continues.
**The NEXT attempt is told which bound fired** (v1.64 §2): the bound carries
`{iteration, cause, reason}`, and where the cause is `denied` the note says the GATE cut the
attempt and quotes what the gate recorded, verbatim — instead of the round-cutoff sentence,
which was false on cause and on count and aimed the worker at its read budget when the thing
that stopped it was the fence. **Nothing is invented**: bare-agent returns `denied:<tool>`
and nothing else — no path, no streak count — so neither is claimed. Every other cause keeps
the round-bound wording byte for byte. The reason is scrubbed ONCE at capture through the one
`SECRET_PATTERNS` inventory and shared by prompt and spine, and trimmed under the repo's one
`GAP_TRIM_MARKER` (F90.2). It is the same lane
`max_turns` and `loop.stop()` take, for the same reason — the attempt ran, produced audited
work, and was cut short by a governance bound doing its job. **The fence holding is the
system working, which is the opposite of a fault**; routing it as an instrument stop killed a
converging run with $1.77 and 21.6 wall-minutes still on it. Nothing about the gate changed:
the same actions are denied, the same audit rows are written, a genuine scope escape produces
exactly what it did before — it now costs one bounded attempt instead of the whole run. The
category survives only as a passthrough (`ralph`'s decision table still answers to it if a
caller's own middle throws it, and `EXCLUDED_ESCALATIONS` still lists it so a future emission
is filed as governance rather than re-read as a capability gap), but no site in this library
raises it.

**Every `job-end` carries the money, on every path**: `{ outcome, spentUsd, spendComplete }`
(plus `step`/`cause`/`detail` where the outcome has them). `spentUsd` is the accumulated sum
of PRICED rounds ONLY — never an estimate from token counts or averages (cap-not-estimate) —
and it is stated even on the pre-token reds, where the honest figure is a real `0`.
`spendComplete` says whether that figure is EXACT; `false` means `spentUsd` is a FLOOR ("at
least $X", true total unknowable) and must not be read as a total. Five things set it, all
the same class — a call whose cost is unknowable from here: a round that came back unpriced
(F6); a run that ABSORBED a stall, because the fuse's silent reissue may pay twice for one
answer and the flag is one-way whatever the outcome; a `wall-halt` that cut a call
mid-flight (`cutMidCall`); a RESUME whose fold was itself a floor
(`priorSpendComplete: false` — an unknown does not heal by being carried forward, so every
round of this attempt being priced repairs nothing about the one before it); and a
**transport retry** (F115, hamr's ruling: "one retry for transport layer failure and
reporting with the rest end of gate"). Every worker Loop (scout, drafter, each step, the fix
worker — the ONE seam in `planrun.js`) gets exactly ONE extra attempt, and only for a
transport-class throw — fetch itself throwing with no HTTP response at all (a TLS fault,
`ECONNRESET`/`EPIPE`/`ETIMEDOUT`, `fetch failed` wrapping a network cause); an HTTP response
(4xx/5xx/429) is never retried here and rides bare-agent's own unchanged policy. The budget is
fixed (`TRANSPORT_MAX_ATTEMPTS` in `src/transport.js`) — never a job-spec or CLI knob, tighten-only
doctrine. Each retry emits a report-only `transport-retry` spine record (`{phase, attempt, error,
recovered}`, no cost field — the ledger is unaffected); the FIRST attempt threw before any usage
figure came back, so **any** transport retry floors `spendComplete` for the rest of the run even
when the retry recovers and the run finishes green — the same one-way flag class as `stalled`
and `cutMidCall`. A wall stop read BETWEEN iterations or steps has no call in flight,
so it stays exact. Both fields are present on all outcomes, so a consumer never branches on
field presence and never has to launder a missing `spentUsd` into `$0`.

**The plan flow (Layer 2).** `job-start` carries `shape: 'plan'` + the goal; plan steps are
tool-mode by construction. The flow (`runPlan`, also exported for direct callers who own
their own ledger): **close precheck** (`already-green` is a
DISTINCT zero-token outcome; a forbidden-zone verdict escalates before spend) → **check-menu
preflight** (`check-menu` names the derived menu, then every OFFERED stage's chain runs once
at $0 — an unrunnable stage is a `check-red` stop before tokens, not a fault mid-plan) →
**THE WORK BRANCH** (below — created before the first paid call, `branch-red` if it cannot
be; on a RESUME it runs FIRST, ahead of the precheck and the preflight, because the recorded
branch IS the tree those instruments must measure) → **SCOUT** (read-only by construction: neither the
write-class nor the store-class verbs are in its menu; hard-bounded rounds) → **PLAN** (the decompose call —
the planner never sees the repo, only the scout blob; drafted against a schema
description with check NAMES only; `validatePlan` gates it, one redraft with the reds
fed back, then `plan-red`) → **EXECUTE** (strictly sequential micro-loops: `ralph` with
the exit-evaluator judge, each step under its own STRIKE LADDER — below; tree snapshots at
step start; the gap names every failing
wall — mechanical genre, F46's measured mechanism; artifacts feed forward labeled by
step id) → **ONE replan**, triggered by exhaustion OR variance OR a stall (an instrument stop
never replans) — plus at most ONE arbiter-granted extra on a second variance stop that reads
`converging`, below → **the operator's close**, a red feeding ONE bounded fix loop judged by the
REAL close and governed by the close TREND rule below (`capRuns`, default 3, survives only as
its blind fallback). `plan-executed` (the plan-as-executed record, design law #2) lands on the
spine on every path that executed steps. Additional outcomes: `already-green |
plan-red | check-red | close-red | wall-halt | hitl-pause | hitl-decision-red`.
A `human-confirms` stage is caught at BOTH close seams — the precheck (reaching a person there
means the machine half already passes on the untouched tree, so pausing costs $0 where drafting
a plan first would spend a budget to arrive at the same question) and the post-steps close. Worker prompts hold the v1.12 §5 contract
(mutation-proven): the absolute repo root, the step's action/target, prior artifacts,
the gap — NEVER the budget, the close command, a check's command, or the arbiter's books.

**THE WORK BRANCH — a hard rule, and a REQUIREMENT on the patient (PRD v1.57 §3).** hamr's
ruling, verbatim: *"The agent creates a NEW BRANCH before it touches any code — a HARD RULE,
no exceptions. Not a default, not a preference: no job edits the branch it was handed, and
none edits `main`."* So **the patient must be a git repository with at least one commit** —
that is new, and it is the honest consequence of the rule rather than an option. And the
patient itself is **ALWAYS a separate COPY of the repo being treated, never the original**
(hamr, 2026-08-09): the branch bounds where writes land, but workers and close stages
still mutate the patient tree (branches per try, caches, worktrees) — the copy is the
blast radius; the original never carries it. What the run does, before its first paid
call:

- **The name is DERIVED from the SIGNED spec**, never model-authored (a branch name is
  arbiter bookkeeping): `bareloop-` + the spec's own `job` slug — `bareloop-typecheck-fix`.
  `workBranchName(spec)` is exported so a runner can show it at its approval gate. The goal
  prose is deliberately NOT an input: it is edited between runs without changing what the
  job is, and the branch name would move with it.
- **A name already taken is SUFFIXED** `-2`, `-3`… — a second run of the same spec is a
  second blast radius and never reuses the first one's branch.
- **A RESUME returns to ITS OWN branch.** Pass `resumeBranch` (read off the dead spine by
  `readResume` as `restart.branch`); without it the deterministic name would collide with the
  killed leg's own branch and mint a `-2` beside the work the resume exists to keep. The
  recorded branch is the ONLY branch a resume can land on — it is validated and checked out,
  never re-derived from the spec and never suffixed. A recorded branch that no longer exists
  is a `branch-red` STOP, never a fresh start.
- **On a RESUME this step runs FIRST**, ahead of the close precheck and the check preflight
  (cold, it runs after them — see the already-green bullet). Both are $0 readings OF A TREE,
  and on a resume the tree they must read is the recorded branch's: standing on whatever ref
  the operator handed back, the precheck could read `already-green` off a tree that is not
  this run's and every `baseline: "seed"` stage would baseline against it. Nothing is minted
  by moving it — the resume arm creates nothing — and a resume whose branch is gone or foreign
  now stops `branch-red` before the arbiter grades anything at all.
- **`work-branch { branch, created, resumed, from, base, repo, collided? }`** lands on the
  spine at creation — the run's books say where its work went.
- **Every failure is `branch-red`**, escalated decision-ready with zero spend. There is no
  fallback to the handed branch anywhere; and `mkWorker`, the ONE seam that grants
  write-class verbs, refuses to build a write-capable worker with no branch prepared, so the
  ordering is a convenience and the guard is the rule.
- **A COLD run's `already-green` tree leaves no branch behind** — the precheck returns above
  this step, and a run with no work has no blast radius to bound. The clause is about
  MINTING: a RESUME that reads `already-green` off its own branch (which it is standing on by
  then) leaves that branch and the paid work on it exactly where they were.

**What it does NOT do.** bareloop never commits, so the branch bounds where work LANDS: the
tree stands on a branch nobody handed the run, and the handed ref is never moved or written
through. It is not containment — v1.41's local-trust model is unchanged, and worker/close
children still run as the operator's OS user with network egress. A workdir that is a
SUBDIRECTORY of a repository gets its branch in the enclosing repository (git resolves
upwards, exactly as every other git read in the flow does); the `work-branch` record's `repo`
field names which repository that was, rather than leaving it to be discovered.

**The strike ladder — how a STEP ends (F77–F79).** A plan step is **not** bounded by a
number of iterations. It runs until it stops making PROGRESS: a *strike* is a red iteration
that repeats an already-seen gap or wrote nothing, and `strikeLimit` strikes (shell option on
`runJob`/`runPlan`, **default 2**) end the step. Concretely — repeats are matched against a
**seen-set** for the whole step, never just the last gap (an A→B→A oscillator is real and
last-only reads it as progress); the gap is normalized for COMPARISON only (TAP `duration_ms`
lines, ISO stamps and `ms` figures dropped so a re-run is byte-stable — error counts, file
names and line numbers all SURVIVE, so `30 errors` → `22 errors` is progress and not a
repeat), and the gap the worker sees is never rewritten; "wrote" is the **count delta of the
gate audit's allow-decision write/edit records** (the F32 instrument — never `git status`,
never a tree diff, and never the path SET, which is constant after iteration 1 when a step
rewrites one target); strikes are **sticky** — a good iteration in between never repays one.
Everything else that bounds a step is unchanged and each still ends it on its own authority:
the wallet, the wall, the variance meter and the stall fuse. The ceiling is **arbiter
territory** — the plan cannot express it, tighten it or raise it — and the practical
consequence for a caller is that a **converging step now runs on the money and wall you
signed** instead of stopping at a count, so size those two numbers for the job (the ladder
adds no third ceiling of its own). The exhaustion terminal is the same `cap-halt` category
as before; the spine gains a per-iteration `ladder` record
(`{iteration, strike, strikes, limit, wrote, repeatOf, distinctGaps}`), and the `cap-halt`,
escalation and wall-stop records carry `strikes`/`strikeLimit`/`distinctGaps` beside the
iteration count rather than a cap the step no longer has. **The replan brief
names the mechanism**: which shape ended the step (converging-cut / stalled-no-write /
repeated-gap, with the iteration numbers as evidence), the gap trajectory, and how much money
and wall the stop left unspent (time reported UNBOUNDED when no wall was set, never `0`).
**It also carries that step's own last EXIT output, verbatim** (F86) — masked through the repo's
one secret inventory, and labelled as *the exits'* words rather than the close's, because the
payload is `lastGap`: the join of EVERY failing exit's detail in exit order. The close stage's
output is one of those details, never reliably all of them, so a step that wrote nothing opens
the block with the exit evaluator's own `0 files changed under …` prose. That line is kept (it is
exactly what a replanner should be told); only the label was wrong. The bound over it is a
**backstop, not a second envelope** — what arrives has already been bounded by `runClose` under
the stage's own `gapKeep`, which deliberately rescues the `not ok`/`FAILED` names out of the
elided middle, and re-enveloping that deletes them a second time (F28 reintroduced; measured, a
second 400/1500 pass dropped 12 of the 78 names the first had rescued). Under `CHECK_GAP_MAX` —
`src/exits.js`'s own ceiling, imported rather than respelled so the two seams cannot drift — the
gap passes through VERBATIM, with ~1.8KB of measured headroom over the largest thing the close
envelope can produce; the backstop fires only on a gap nothing upstream ever bounded. No gap, no
block, and the brief is byte-identical to one drafted before this existed.
Handed over as TEXT: the runner makes **no parsed file claim of its own** in this channel —
a close's summary line ("N error(s) in a.js, b.js" — every file in scope) and its detail line
(the one location actually failing) are indistinguishable to a regex, and the shapes differ per
close anyway. What the planner is told about WHERE the work is comes from the close's own
bytes, never from the runner's reading of them.

**The close TREND rule — how the CLOSE-FIX LOOP ends (PRD v1.46 §4).** `capRuns` retired as
that loop's governor once its own $0 replay over every archived fix loop came back clean (0
greens harmed — all three historical fix-loop greens converted in ≤ 2 verdicts; 1 real waste
case caught, dead flat at 2 errors for 7 verdicts until the wall). It now stops on the same
2-strike no-progress rule, read off a DIFFERENT signal: the close's own graded numbers, **per
stage** (`src/trend.js`). A stage's series is the first number on the first red-marked line of
its output, compared only against that stage's own BEST so far (never last-only, the same
oscillator reason the ladder keeps a seen-set); reaching a LATER stage than ever before is
progress too, since a staged close is first-red-wins. Two consecutive comparable readings with
nothing improving ends the loop, under the unchanged `cap-halt` terminal and the unchanged
`escalated` outcome. **Never across stages** — merging a staged close's axes into one series
reads a real see-saw (suppressions 12 → 5 while the type errors it re-exposed went 2 → 0) as a
regression, and that mistake is inexpressible here rather than avoided by care. A stage whose
output carries no number donates NOTHING — not a zero, not a strike (F6): while the instrument
cannot compare, `capRuns` is what bounds the loop. It bounds the **consecutive run of
unreadable gradings**, not the loop's opening — it lifts the moment a stage reports a
comparable number and **re-arms the moment one stops**, so a loop that reads, goes blind and
reads again is never bounded by it, while a loop that never compares anything binds on exactly
the iteration the fixed count always bought it (F84: gating it on "has this loop ever compared
anything" made a single stage ADVANCE disarm it for the rest of the run, and a numberless-red
close then had money and the wall for a bound). Two known accepted limits, both stated at the
site: (1) "lower is better" is not derivable from prose, so a floor-shaped stage (`N tests
executed, below the seed's M`) reads as not-improving rather than converging — the fail-safe
direction, since a false "flat" costs one conservative stop and a false "converging" costs a
top-up spent on a dead run; (2) a series is one bucket per stage NAME, and a stage name is not
an axis — a close free to red one stage on two different populations (`N error(s) in <scope>`
vs `the target files are clean but M error(s) exist outside them`) donates both genres to one
series, and a run crossing that seam can read converging on work that only swapped which wall
it is behind. Neither is sharpened by teaching the reader to tell prose shapes apart (the F49
precedent); the second's root fix is a stage split in the close, which is the spec's to change.
The spine gains a per-iteration `ladder` record here too; every reading names its `governor`
(`step-ladder` | `close-trend`) so two instruments under one event type can never be averaged
into one number.

**A MONEY halt is decision-ready (PRD v1.46 §2).** A cut by the wallet is the same KIND of
stop the wall is, so it now reads out the same way: the verdict already minted is KEPT (never
discarded, never re-derived), and a `money-halt` spine record carries `budgetUsd`,
`remainingUsd` **with its own `spendComplete`** (the remaining is `budget − spent`, so on a run
whose spend is a FLOOR it is a CEILING and says so rather than reading as the number — the same
duty `wall-halt` has carried since W-2; it is the ledger's one figure, never re-derived here),
the kept `verdict`/`stage`, the run's own per-stage `trend`
(`converging | flat | unknown`) with the `reading` and `series` it judged, and three
`options` — top up and resume, revise the spec, abandon. Emitted at every site that cuts a run
on money (the step loop, the close-fix loop, and the scout/draft relay), exactly as
`wall-halt` is. The trend obeys the accuracy law above and says `unknown` out loud when the
close rendered no number (F6). **The library only ever REPORTS**: `budgetUsd` is in the spec
hash, so a top-up is a spec edit a human signs — nothing in a run may widen its own budget.

**ONE progress instrument, read by both halts — and REPORTED by the variance meter.** The
`variance` record and its escalation carry the same four fields off the same instance (below);
the meter is the one consumer that never decides on the reading. The wall halt used to run its own: byte
equality of the last two close gaps, reading `stalled` / `moving` / `unknown` beside the money
halt's `flat` / `converging` / `unknown` on the same run. Both now read `runTrend`, the run's
own `src/trend.js` reader. Where a stage reported a comparable NUMBER it decides; where none
did, the byte comparison survives INSIDE `unknown` as a separate `motion` field
(`changed | unchanged | null`) and as a clause in the `reading` — never as the headline
verdict, because "the close's output changed" is not "the run got better" (F6 in a trend's
coat), and never mapped onto `trend`, because that would put the promotion on the spine.
`unchanged` points the lever at the goal; `changed` points it at reading the last close output.
The two readers stay SEPARATE INSTANCES for separate questions (`src/trend.js`, "ONE PER
SERIES"): the halt readouts ask *was the RUN converging when its allowance cut it*, the
close-fix loop's governor asks *is THIS loop out of ideas*.

**A resumed leg's readout judges the whole CHAIN.** `readResume`'s `restart.grades` carries the
dead leg's recorded close grades forward — `[{stage, value}]`, counts and stage names only,
never a gap byte — and `runJob`/`runPlan` take them as `resumeGrades`, which seed the run
trend's BASELINES (`createTrend({seed})`). Without them a resumed leg restarts the trend at its
own first close and can report `flat` — *revise the goal* — on a run that was converging when
its allowance ran out. The seed folds into the series and the per-stage best and into nothing
else: no iteration counted, no strike minted, no `comparableEver`, no stage position — it is
history, not this leg's evidence, so the blind-cap backstop still governs a leg whose own
readings never compare. The close-fix loop's governor is deliberately NOT seeded (it is the
leg-local question). Sources, in order: the `ladder` records the live governor already wrote
(`governor: 'close-trend'`, taken verbatim), the `close-precheck`/`outer-close` records, and —
only on a spine predating that governor — the `close-verdict` records after the `fix-loop`
marker, which is the same population and excludes a STEP's failing exit. Known limit: one spine
is read, so a resume of a resume inherits the previous leg's chain and not the one before it.

**Time and materials (T + A, PRD v1.27/v1.29).** `runPlan` starts ONE wall clock per run
(`createClock`, `src/clock.js`) from the signed `maxWallMs` and emits `wall-clock` with the
requested AND enforced numbers up front, plus the `closeStages` count that explains the gap
between them (`enforcedMs = maxWallMs + closeStages × closeTimeoutMs`, one expression — the
stage count comes from `closeStagesOf`, the same staging the runner executes). Enforcement is a
**between-round deadline** — the only seam that exists, since `loop.stop()` cannot cut an
in-flight call (F61: fired at 500ms,
returned at 4,018ms) — so an attempt that crosses the deadline mid-flight emits `wall-bounded`,
is judged, and feeds its gap forward exactly like a round-bounded attempt. A call that never
returns is bounded by the two per-call numbers the same clock derives and `runPlan` passes to
every provider call: `timeoutMs` (BA-18, idle — reset by every byte) and `deadlineMs` (BA-19,
TOTAL duration — reset by nothing, so it is the bound for a stream that trickles forever, F66's
274-minute call). Both are the wall's own remainder read at call time, and `deadlineMs` is
**omitted entirely** on a time-unbounded run — no wall, no derived ceiling (F45). Because both
came from the wall, a trip past the cap routes `wall-halt`, never `provider-red`; the
discriminator is `clock.expired()` and never the error code, so a timeout with time still on the
clock stays the transport casualty it is (F64). **The close is never
bounded by the wall and always runs to completion** — a deadline that kills grading leaves the
run unreadable after the money is spent (the F45 class, money generalized to time); what the
wall stops is the START of new work. Three sites decide the run-level terminal `wall-halt`, all
on the same clock: the step loop after a step returns, a step that would BEGIN already expired,
and the close-fix loop before it opens another iteration — which then stops on the verdict the
last close already minted (hamr: *"when time is up, keep the grade we already have and stop"*),
carrying that verdict, the iterations spent, and the SAME progress reading the money halt
carries (`trend`: `converging | flat | unknown`, plus `motion`) so the human can pick between
raising `maxWallMs` (resume-to-cap: the stop IS the checkpoint) and revising the goal — both
spec edits, both a new hash to re-sign. `cutMidCall` on the `wall-halt` record splits the deadline seen INSIDE a
provider call from the deadline read between them. Time reporting is
licensed at ~90% accuracy by ruling: imprecision is fine, reporting an unknown or unbounded
duration as `0` never is (F6 extended to time — unbounded reports `null`, never `Infinity`).
The planner (never the worker) receives a **materials** block at draft and at replan —
`{ balanceUsd, remainingMs }`, what is LEFT as a balance, never a rate: F57 measured a 150×
spread on verification-gap duration, so a per-round constant describes almost no real round
and a rate framing creates a rush-or-fake incentive. The replan trigger gains a second axis
(`step-variance`): a step consuming ≥ `VARIANCE_THRESHOLD` (0.5) of the run's REMAINING money
or time — either axis — is pre-empted at the head of its next attempt so the planner
re-allocates instead. **Known and recorded (F63): that trigger fired 0 times across 18
archived spines / 54 steps** (near misses 0.35–0.45) — the threshold is arbiter territory,
deliberately not fitted to those points. It is no longer inert: it fires on real runs (F85).

**The meter REPORTS progress; it never decides on it (F85).** The firing condition above is
the whole trigger — a progress term inside it would let a governance instrument over an
operator-owned allowance judge capability, and a converging step that is eating the run is
still stopped. What the meter says about the work is a MEASURED reading, not an assertion: the
`variance` spine record gains `trend` (`converging | flat | unknown`), `motion`, `reading` and
`series` beside its unchanged `step`/`iteration`/`threshold`/`moneyShare`/`timeShare`/`axis`,
and the escalation `detail` (which the replan brief quotes) ends with that same `reading` as a
second, separate claim — "it was stopped for eating the run" and "here is what it achieved" are
different statements. All of it is read off the SAME `src/trend.js` instance the money and wall
halts read — one reader, so the meter and the halts can never disagree, and `unknown` stays
`unknown` when the close reported no number (F6). This
replaces a fixed sentence ("with its exits unmoved") that used to print on every variance stop
whatever had happened; a consumer parsing that string will not find it.

**The replan ceiling is no longer flatly ONE.** A SECOND `step-variance` stop earns exactly one
more replan when the run's own reading is mechanically `converging`; it is granted by the
ARBITER off that same reader, bounded by a latch rather than a counter compared against a
limit, so it cannot creep — a third variance stop is the stop however well the run is going.
`flat` and `unknown` stop exactly as before, and an exhaustion or stall stop past the ceiling
is unchanged. The agent has no channel to it: it never asks, is never offered it, and cannot
influence it (no self-adjusted budgets, ever). Observable on the spine as ADDED fields, never
repurposed ones: `replan` records carry `replan: <n>` and — only on a granted one — `granted:
"converging"`, and `plan-executed` carries `replans` beside the unchanged `replanned` boolean.

**Both of those count the RUN, not the leg — the ceiling spans a resume chain.** `replanned`
and `replans` were locals in `runPlan`, and a resume is another `runPlan` call, so a kill used
to hand the next leg a fresh allowance of an allowance that is the RUN's by doctrine (measured:
leg 1 replanned and stopped, leg 2 replanned twice more — a run total of 2 with every record
showing 1). **`plan-executed.replans` therefore now means the CHAIN total**; if you parse spines,
re-read that field. Each leg DECLARES what it inherited on its own `job-start` — new fields
`priorReplans` and `priorReplanGrantUsed`, present only when there is a fold — and the next
reader adds only its own window's `replan` records, exactly the way `priorSpentUsd` folds money.
The grant latch travels beside the count rather than being derived from it (`1` + `false` is a
real state: an ordinary ceiling spent, the arbiter's extra still unearned). The leg's own number
is not lost — a leg emits one `replan` record per replan it drafts, so `chain −
records-in-this-window` is the fold it inherited. You seed it with `resumeReplans` (below);
omitted is the cold path and byte-identical to a run nobody resumed.

**Per-step model tiers — `providerFor` (P).** A plan step may declare a `model` TIER
(`sonnet`, `STEP_MODELS` — `haiku` removed 2026-08-06 as a reversible attribution probe,
F87; the field stays legal and one-token reversible, and the narrowing binds only what the
AGENT may express, never what the operator may run).
The tier menu is signed into the schema; mapping a tier
onto a real model (and any per-model provider params) is the RUNNER's territory — nothing
forces the `sonnet` tier onto any particular model, and running haiku as your default worker
model stays an operator choice the plan menu never governed — so both
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
paying zero provider calls for anything already green. (Those two are the *allowance* stops,
the ones with a lever to raise. They are not the whole resumable set — `step-stalled` is also
a checkpoint, with nothing to re-sign; see `resumableOutcomes` under the resume reader.)

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

**Every cost figure bareloop reports is an ESTIMATE, not a billed amount (BA-21).** No
vanilla LLM API returns a price — providers report TOKENS — so `spentUsd`, every
`worker-round` cost, every halt readout and every ledger dollar is a token count
multiplied by a RATE, never a provider invoice. Expect it to read somewhat high, and do
not reconcile it against a bill expecting a match. There is deliberately **no per-model
price table** behind it, and the reason is worth knowing before you decide how far to
trust the number: a hand-curated table is a treadmill that rots SILENTLY — a price moves
or a new model ships, the row goes stale, and the figure under-reports with no detector to
say so. bare-agent instead matches a recognized Claude TIER (haiku / sonnet) by model id,
and falls back to a conservative ceiling rate for anything it does not recognize. Both
deliberately OVER-report rather than under-report, which is the fail-safe direction for a
cap: a run halts slightly early rather than overspending unnoticed. **The consequence
bites at the budget, and it is not softened here:** `budgetUsd` and `shellCapUsd` are
enforced against these estimates, so an inaccurate rate is a cap that binds earlier or
later than you intended. The cap is exact about the number it holds; the number is a
guess.

**If you need accuracy, pass your own rates — the supported path, not a workaround.**
bare-agent's `Loop` takes `rates: {in, out, cacheReadMult?, cacheWriteMult?}` — USD per 1K
tokens, the two multipliers applying to the input rate for the cache-read and cache-write
tiers (defaulting to Anthropic's 0.1× / 1.25×). A caller-supplied rate is recorded as
VOUCHED rather than as a guess, and it silences bare-agent's own guesstimate warning.
**Named, not papered over:** `runJob`/`runPlan` construct their own `Loop` and do not yet
accept a `rates` passthrough, so today that option is reachable only by a caller driving
bare-agent directly — a bareloop-run job is priced by the guesstimate, full stop. The
passthrough is an open follow-up, and until it lands every paragraph above describes the
only pricing a `runJob` adopter gets.

**The provenance is on the record, per round (`rateSource`).** The field arrives with
bare-agent **>= 0.37**; under the pinned `^0.36.0` no provider payload carries it yet, so
every priced round this library writes today reads UNKNOWN provenance — correctly, and by
the same rule that governs the archive. (The one exception is the native per-turn
`worker-turn`, whose `null` is bareloop's OWN statement rather than a forwarded one: that
surface prices the SESSION, so a turn had no rate to guess.) Once the pin moves, every `worker-round` /
`worker-turn` the plan flow writes carries bare-agent's own label beside `pricing`:
`'provider'` (the provider reported its own authoritative cost — the native CLI surface)
and `'caller'` (you passed the rate) are VOUCHED; `'tier'` (a recognized Claude tier,
where **both** of bareloop's own production models land) and `'default'` (the blind
ceiling) are GUESSES; `null` means nothing was priced, so there was no rate to have
guessed. An ABSENT field is UNKNOWN provenance — every round archived before this signal
existed, and it is never backfilled, never reconstructed, and never rounded up to vouched.
Read it with `rateProvenance(record)` and `spendProvenance(events)` (`src/ledger.js`),
whose predicate is an ALLOW-LIST of the two vouched values: anything else, including a
value a future bare-agent adds, reads as a GUESS. **Reporting only** — `pricing` stays
strictly two-valued (`'priced'`|`'unpriced'`), the `pricing-red` halt still keys on cost
alone, and nothing about provenance decides, halts or refuses anything.

**What the worker is told (tool mode):** the absolute repository root (F10 — bare-agent's
shell tools resolve relative paths against the PROCESS cwd, so a worker with no root is
blind), the close's CURRENT output as the tree's state (F13 — never framed as "your previous
attempt"; the `run` verb is locked, so the worker cannot see the failure any other way), and
the loop contract (F16 — it is ONE attempt inside `while close-red and under-cap` and will be
re-run with the close's verdict; without this a model one-shots and can eat the budget in
reads before ever writing). It is NOT allowed to read the run's own machinery (F14): the gate
audit, the smoke store and the litectx store are denied — the agent neither authors the
arbiter nor reads its books. **That denial is now REGISTERED in the persona, not left to be
discovered (F98):** `PERSONA_TOOLS` names `gate-audit.jsonl`, `.smoke`, `.litectx` and the
run's spine as always-denied, records of how the worker is being judged and never anything
about its task, beside the absolute-path law it is the twin of — both are fence facts a worker
cannot infer. It renders for EVERY worker on every grant (a worker granted only `write` gets
no component strategy paragraph at all and must still be told). The fence is unchanged; what
changed is that the rule is stated instead of learned one refusal at a time, which cost a real
run the rounds of a bounded attempt. N2 bounds (honest): `gold`/`rubric`/`hitl` OBJECT
closes refuse `close-unsupported` — N4's hitl is a `human-confirms` STAGE inside a `closeDecl`,
never a close TYPE, so there is one live expression of hitl rather than two.

### THE REVIEW DOOR — the three doors at the END of a run (softgreen module 8, PRD v1.71 §3)

The pause machinery re-homed: the same doors, the same evidence package and the same 60-day TTL,
one level OUT — from a stage inside the close to the door at the end of a run.

**THE LAW, and it is not negotiable** (hamr, verbatim: *"it's important not to change the loop
self verdict"*): the close mints the verdict, the door records a **disposition**. `runJob`
returns `green` / `already-green` exactly as it always did, the ledger records exactly what it
always recorded, and no answer a person gives can change either. A green run that is never
answered is still a green run — the door is non-blocking.

**Opening one.** A run whose terminal is verdict-bearing (`DOOR_OPEN_OUTCOMES` — `green`,
`already-green`) emits ONE `review-door` record carrying the evidence: the outcome, the class,
whether the credit is `quarantined`, every close stage's own result, the stages an `accept` will
re-run (`mechanical`), and the changed set (same cap and same F28/F6 announcements the pause
package makes). Which runs open one is `doorOpens(job, reviewDoor)`:

- **always** for the classes in `REVIEW_DOOR_CLASSES` — `['soft-green']`, because a judged green
  is quarantined at mint (module 6) and an `accept` is the ONLY thing that releases the credit;
- **on request** for everything else: `reviewDoor: true` (the runner's `--review-door`). A
  green-class run is byte-identical to what it always was unless it is asked for.
- `reviewDoor: false` shuts it for any class. The flag wins in both directions and is never
  inferred; `REVIEW_DOOR_CLASSES` is a constant, not a threshold, and widening it is arbiter
  territory.

**Answering one — `answerReviewDoor({ job, workdir, events, decision, text?, closeTimeoutMs?,
registryDir?, name?, runid?, at?, now?, emit? })`** (`src/reviewdoor.js`). The answer arrives
after the run has ended, possibly days later and from another process, so it cannot ride the
run's return path. This is that seam. It never throws and never conjures — a fourth door, an
empty `rerun`, a run that opened no door (`no-door`), an expired one (`door-expired`), a tree
that moved (`door-accept-red`) and a missing registry all come back as named reds.

- **`accept`** re-runs the close's **mechanical** stages against the tree AS IT STANDS
  (`mechanicalStages` — everything outside `SEED_EXEMPT_KINDS`, so never a judged floor and never
  a person) before it is honoured: hamr's ruling that an accept is not a rubber stamp, and the
  answer to a tree that can move in the 60 days a door keeps. A red REFUSES the accept with the
  stage named and records **nothing**. A pass records the disposition and, over a held judged
  green, RELEASES the credit through module 6's `applyDoorDecision`.
- **`rerun`** carries the person's words back as a directive (`next: 'rerun'`) and re-proves
  nothing: the new run's close is what judges. Empty or whitespace text is refused at the same
  seam every other door is.
- **`pause`** runs nothing and spends nothing, in any state. The door simply keeps, and an
  unanswered one expires under `PAUSE_TTL_MS` — that expiry IS what `cancel` used to be.

Every door is recorded when a registry is wired, not only the accepts: *"the signer's accepts
double as the judge's ongoing report card"*, and a rerun over a judged green is exactly as
informative. An **already-green** run wrote no row of its own, so its door records nothing and
releases nothing — slice 1's already-green no-mint rule, holding from the other side, and stated
in the result's `note` rather than surfaced as a failure.

**The rerun as a FRESH ENGAGEMENT** — hand the words back to the next run as
**`doorRerun: {text, fromRunid?, receivedAt?}`**. Two things follow and only two: the
`already-green` shortcut is refused (a tree that passes the close is precisely the state the
person rejected — the run emits `door-rerun-open` and carries on), and the words reach the
PLANNER as a requirement on top of the signed goal. It is never a `humanRuling`: that answers a
close's human STAGE, and a green-class job has none. Money folds (the signed budget is the
chain's ceiling); the WALL does not (F103).

### The reuse registry (Layer 3) — `src/bridges.js`, `src/selection.js`

A **bridge** is the plan a green actually executed, kept so the next run of the same SHAPE
starts from it instead of cold. Storage is a directory of plain JSON files at an
**operator-supplied path** — no database, no default location (a missing registry reds
rather than being conjured). Everything here is either a pure derivation or an explicit
read/write of one file; nothing decides a run.

**Writing the box (R1 — only a green writes it).** `mintBridge(meta, record)` builds a new
entry from a FIRST green — there is deliberately no way to create one without a green, so a
failed plan cannot enter the registry even by accident. `appendGreen(bridge, record)` adds
the plan AS EXECUTED as the next **version** plus a history row; `appendRed(bridge, record)`
writes a **history row only** and never touches `versions` — a red demotes, it does not edit
the recipe. Both are pure (a new entry is returned; the input is untouched).
`saveBridge(dir, bridge)` writes atomically (temp + rename) and REFUSES an entry its own
validator rejects; `loadBridge` / `loadRegistry` read back, and a malformed file is
**skipped and reported** (`ok:false` with one red per bad file) rather than silently
dropped. `makeRegistry` is separate from `saveBridge` on purpose: saving must never conjure
a registry from a typo'd path.

**Status is DERIVED, never stored** (`deriveStatus`): **candidate** = one green, **proven** =
greens on ≥2 DISTINCT patients, and a `red` on a proven entry drops it back to candidate.
A **casualty is not a red** — only the literal outcome `red` demotes; `provider-red`,
`wall-halt`, `close-crashed` and friends are casualties and are never evidence in either
direction. There is deliberately **no probability score**: n=1 is an anecdote whichever way
it points, and a percentage over 2–3 runs is fake precision. `costUsd`/`wallMs`/`rounds` are
a number or an EXPLICIT `null`, and the key is REQUIRED either way, so an unknown has to be
said rather than omitted (F6 — an omitted key is how a `?? 0` gets written downstream).

**QUARANTINE — a judged green earns nothing until the signer accepts it** (softgreen module
6; the standing ruling PRD v1.53, given its mechanism by v1.71 §3). A green minted under
`verdictType: "soft-green"` carries `quarantined: true` on BOTH halves of R1's pair — the
**version** (what inherits) and its **history row** (what the status ladder reads). It is a
FLAG, never a withheld row: the run happened, the record says so, and the listing shows it —
it is simply worth nothing yet. A held green does not count in `deriveStatus` (an entry whose
only greens are held derives `null` and renders `HELD`, never `NO-GREEN`), and
`reuseEligibility(bridge)` / `newestEligibleVersion(bridge)` refuse it for reuse **with a
stated reason** — the same visible-skip discipline an unreadable registry file gets.
`green` and `hitl` are untouched, byte for byte: the key is ABSENT, because the hold is about
the young JUDGE, not about every class that is not green. `QUARANTINED_VERDICTS` is the one
list; `quarantinesCredit(verdictType)` is the one predicate. The class travels on the green
record as `verdictType` — an unrecognised value REDS rather than falling through to unheld.

**The review door releases it, forward-only.** `recordDoor(bridge, {runid, decision, at})`
records the signer's disposition (`accept | rerun | pause`, the same three doors `kinds.js`
owns) on that run's own green row as an append-only `doors: [{decision, at}]` — the **report
card**, kept as facts and never as a computed agreement rate (D6's no-score rule applies to
the judge too). `accept` over a held green also flips `quarantined` to `false` on both halves;
`rerun` and `pause` record and release nothing. There is deliberately **no re-hold path**: an
accept followed by a rerun records the disagreement and leaves the credit granted. A repeat of
the last decision is a no-op (`released` says whether THIS call freed it), and a door aimed at
a run with **no green row of its own** — an already-green run, a red, a casualty — is the red
`no-row-for-run`: releasing is not minting. `applyDoorDecision({registryDir, name, runid,
decision, at})` is the on-disk half; the door opens AFTER the run ends, so the decision cannot
ride the run's return path. **The door never changes the loop's verdict** — a green stays green
in the ledger whatever the person then does with it.

**`writeRunGreenRow({registryDir, job, name, outcome, plan, record})` → `{minted, reason,
write}` — the terminal registry write for a runner that drives `runJob` directly** (rather
than through `runReuse`, which writes its own rows). It is what gives that runner's review
door a row to release: without one, `accept` reaches `recordDoor` and reds `no-row-for-run`.
STORAGE ONLY — nothing here selects, promotes or reuses a bridge. Three refusals, each with
a named `reason`: no `registryDir` (`no-registry` — the registry is operator-supplied, never
conjured), `outcome !== 'green'` (`green-predates-run` for already-green — accept confirms a
verdict, it never mints one — else `not-green`), and no executed `plan` (`no-plan-executed`,
R1). Every green class mints (hamr's ruling 2026-08-30): a `soft-green` row is born HELD —
its learning credit is quarantined until a signer accepts at the door — and a `green`-class
row is born RELEASED, because a machine's own close proved it and there was never a credit
to quarantine; `quarantinesCredit(verdictType)` in `greenParts` is the one predicate, read
off the record's own `verdictType`, never a flag. `door-accept` on a released row records
the disposition and releases nothing — not an error; a run that earned no row at all still
refuses `no-row-for-run`. `name` falls back to `job.job`. A
refused underlying write returns `{minted: false, reason: 'write-refused', write}` with the
reds on `write` — never a throw. Minting goes through the same cold-leg green write `runReuse`
uses (shape-fork rule and collision refusals included), so the two runners can never spell
"what a green writes" differently.

**`loadGate(bridge, job)` → `{ ok, reds }` — the load-time gate.** Exactly three checks,
asked *"is this the right KIND of recipe?"*: the job's **verdict type**, the **close-stage
kinds** (v1: the same stage names in the same order), and every stored verb **within THIS
job's signed menu** (an omitted `tools` means the concrete current `TOOL_MENU`, MED-1).
**Nothing about paths, scopes or targets** — those are instance-bound and are EXPECTED to
red: every recipe from a different day names yesterday's bricks, and that is what a recipe
IS. The full `validatePlan` still judges the TWEAKED draft at draft time; no second, looser
path exists for an inherited plan. A failing gate is a RESULT (`recipe-stale`), never a throw.

**A CHANGED CLOSE therefore expires every bridge minted under the old one.** The stored
`closeStageNames` must match the job's stage names in the same order, so adding, renaming,
splitting or reordering a stage makes existing entries fail the gate by construction. That is
the doctrine, not a rough edge: a different close is a different KIND of job, and a recipe
proven against one ruler has not been proven against another. The remedy is a fresh green under
the new close, which mints the next version — an entry is **never edited into agreement**, and
falling back to cold stays the caller's decision. In this repo the `u-*` close split
(2026-08-05) put `aurora-u-spawner` and `litectx-u` in exactly that state; both are re-minted by
their next green, not repaired.

**`runJob`/`runPlan` take `bridge?`** — a validated entry to reuse. The gate runs **at the
door**: before the clock, before the close precheck, before any token. On a pass, the
**newest ELIGIBLE** version's plan (the newest one no quarantine holds) rides into the FIRST
drafting prompt as a starting draft
(`bridge-loaded {name, versions, runid}` on the spine) and everything after it is the
ordinary shipped path — same validator, same redraft-on-reds, the same replan ceiling, and a
**replan never re-injects the bridge** (it drafts from the run's own state). On a fail the
run returns the distinct terminal **`recipe-stale`** with `bridge-gate {outcome, name, reds}`
and a decision-ready escalation, having spent nothing. A **wholly HELD** entry handed in
directly is refused at the same door and by the same terminal, with `bridge-gate
{outcome: 'quarantined'}` and the accept-then-rerun option named — the recipe is the right
kind, it is simply unaccepted, and the two are never spelled the same. **Falling back to cold is the
caller's decision, not an automatic silent fallback** — starting a paid run on a decision
nobody made is the same class of error as widening a cap to manufacture a green. Omit
`bridge` and the flow is byte-identical to a pre-Layer-3 run: no new event, and no starting
draft anywhere in the prompt.

**`renderListing(registry)` / `selectionPrompt(listing, ask)` — `src/selection.js`.** Pure
text: they read no file, call no model and decide nothing. `renderListing` takes
`loadRegistry`'s result (or a bare array) and renders one compact block per bridge — name,
the goal sentence it greened, status, greens/reds with the last outcome, and the cost/time
BAND of its greens. An unknown cost or duration renders `UNKNOWN` and a partial aggregate
says how many it skipped (never a `$0.00` that reads as exact); entries that could not be
read are NAMED, so the listing can never be quietly shorter than the directory. Ordering is
deterministic by name and it never throws. `selectionPrompt` wraps that listing with the ask
and D3's two standing rules — *"none matches"* is a first-class answer that means the agent
drafts new, and a PINNED workflow may be refused only EXPLICITLY, with a reason. The
selection CALL, the pin/shortlist/force-cold flow and the parse of the answer are YOURS —
or `runReuse` below, which is the shipped one.

### The reuse ENVELOPE and `runReuse` (Layer 3, D7) — `src/reuse.js`

`runReuse` is `runJob` under an operator-signed **envelope**: try a stored workflow, then
another, then draft cold — hamr's *"$5 and 30 mins x2 then start anew"*. It composes; it
decides nothing the arbiter owns.

**`validateEnvelope(input, { job? })` → `{ ok, reds, envelope }`.** The envelope is
`{ perTryBudgetUsd, perTryWallMs, bridgeTries }` and **all three are required and
explicit — there is no default for any of them**, for `maxWallMs`'s reason: a defaulted
cap is a silent second ceiling. `bridgeTries: 0` is legal and means force-cold. With a
`job`, the composition is checked: the per-try numbers may only **TIGHTEN** the signed
spec — a per-try budget above `job.budgetUsd`, or a wall above `job.maxWallMs`, is
`envelope-widens`, never a silent raise. (A spec with no `maxWallMs` is time-unbounded by
explicit choice, so any wall tightens it.)

**`resolveTrySpec(job, envelope)` → the per-try spec.** Every try — cold leg included —
runs THIS spec, so the envelope's numbers are the numbers all the way down. Tightening
makes a genuinely different spec, so it makes a different **spec hash**: the tightened run
is a new spec VERSION and `runJob`'s approval gate refuses it until the operator signs
that hash. `runReuse` hands `approvals` straight through and has no way to forge one. An
envelope equal to the spec's own numbers leaves this spec hash-identical.

**`resolveReuse(job, envelope)` → `{ schema: 'reuse-v1', spec, bridgeTries }`, and
`reuseSpecHash(resolved)` → the hash your operator signs. Show THIS one at your approval
gate** (`scripts/run-reuse.mjs` does). The envelope is three numbers and the third is a
MULTIPLIER — the worst case a reuse run authorizes is
`perTryBudgetUsd × (bridgeTries + 1)` — so a signature over the per-try spec alone covers
only budget and wall, and `--tries 0` and `--tries 9` print the same hash. The signed
artifact is therefore the per-try spec WRAPPED with the count. It is a wrapper rather than
a field on the spec because `validateJob` reds unknown top-level fields: a `bridgeTries`
written onto the spec would flip the hash and then make every try a `job-red`. The hash is
composed from `jobSpecHash` (so MED-1's resolved-`tools` pinning is inherited, with no
second canonicalizer to drift) under a `reuse-v1` domain prefix, and `runReuse` reads its
loop bound back off the same resolved object — the count enforced is the count signed.
**This is a signing-SCHEME change: any hash signed before the count was folded in no
longer matches, by design, and there is no legacy acceptance path — re-sign once.** Your
gate still mints `approvals` for `runJob` at the PER-TRY SPEC's `jobSpecHash`, which the
matching approval hash entails (it is a function of exactly that hash plus the count).

**`selectBridge({ registry, job, ask, provider, pinned?, shortlist?, forceCold?, exclude? })`.**
ONE model call on the drafter-tier provider **you** hand in (no provider is constructed
inside), rendering `renderListing` + `selectionPrompt` and parsing a strict
`{"choice": <name|null>, "reason": "…"}` through the repo's one `extractArtifact`. Returns
`{ choice, reason, called, refused, forcedCold, red, costUsd, spendComplete, candidates }`.
`forceCold` and an empty candidate set skip the call entirely ($0, no tokens). A name that
is not on the listing it was given is a named red, never used. **A pin does not bypass the
call** (D3): it is stated in the prompt, and if the answer names anything else the result
is `{refused: true}` — the substitute is NOT adopted and the decision goes back to you.
Cost is metered and reported: `costUsd` is a number or an explicit `null` (F6).

**`runReuse({ job, approvals, registryDir, envelope, patient, workdir, provider, emit, … })`.**
Envelope → registry → up to `bridgeTries` tries → the cold leg. Per try: selection runs
against a **freshly reloaded** registry with the already-tried names excluded, the chosen
entry rides into `runJob` (whose own load gate is the D2 shape check — a `recipe-stale`
refusal costs $0 and simply moves to the next candidate), and then **the box is written
(R1)**: a green appends a VERSION carrying the plan AS EXECUTED (read from the run's own
`plan-accepted`) plus a history row; a graded red appends a history row only; a casualty
appends a row under its **own** outcome name and cannot demote. **A green ends the loop.**
Tries exhausted → a cold run under the same per-try numbers, whose green mints a new
bridge named for the job slug (or appends, if that name already holds greens — clobbering
a green is exactly what R1 exists to prevent). A cold RED writes nothing: the entry bar is
a green.

**Which outcomes are a graded RED** (`REUSE_GRADED_RED`): only `escalated` — the terminal
where the close judged the tree, the bounded fix loop spent its attempts with money still
on the table, and the close was still red. Everything else non-green is a **casualty** and
keeps its own name: `cap-halt`/`wall-halt` (governance), `provider-red`/`step-stalled`
(transport), `close-red`/`close-unsupported` (the close FAULTED and rendered no judgment),
`recipe-stale` (refused at the door), `plan-red`/`step-red:*`/`check-red` (the flow stopped
before the close ever judged). All of them are recorded in full on the history row, which
is where D6 puts the detail a human reads; the coarse status ladder is left alone.

**Result:** `{ outcome, tries[], selection[], spentUsd, spendComplete, bridgeWrites[],
decision, options, detail, reds, triesUsed, triesAuthorized, envelope, specHash,
approvalHash }` — `specHash` is the per-try spec's (what `runJob`'s own gate reads),
`approvalHash` is the operator's, covering all three envelope numbers. Every
try row is **decision-ready**: `bridge`, `runOutcome`, `verdictClass`, `failingStage`,
`spentUsd` vs `capUsd`, `wallMs` vs `wallCapMs`, `capBound`, `wallBound`, `rounds`, and
`closeReached`. `spentUsd` is the sum of PRICED figures only across tries AND selection
calls; one unknown makes `spendComplete` false, and a try whose `job-end` never landed
reports `spentUsd: null` — never a `0` that reads as exact (F6). On a RESTARTED try,
`rounds` folds both attempts exactly as `spentUsd` and `wallMs` do (the row states one span,
not a count from one leg against money from two), and the fold is declared on `try-start` as
`priorRounds`; a leg whose turns cannot be counted leaves it `null` and the row keeps the
unknown rather than reporting the half it can see.

> **The selection calls sit OUTSIDE the per-try caps**, by construction: they happen
> before a try starts, so no try's ledger can hold them. They are small (one short prompt
> each, no tools) and they ARE metered — every one lands in `selection[].costUsd` and in
> the total — but a reader budgeting `perTryBudgetUsd × (bridgeTries + 1)` should know
> that is the caps' sum, not the run's ceiling. Named here rather than folded in: an
> advertised number the run does not enforce is the thing this repo does not ship.

> **F45, and why there is no threshold here.** A try's budget must fund **the attempt PLUS
> its close** — a cap that dies mid-grading produces an unreadable row, and an unreadable
> row is a casualty, not evidence. Nothing in this process can know what a close costs (it
> is your command, at your price), so **no threshold is invented** — threshold-setting is
> arbiter territory, set from a measured base rate, never fitted to the sample in hand.
> What the module does instead is make the bind VISIBLE: `closeReached: false` next to
> `capBound: true` on a row IS the diagnosis. Size the envelope with that in hand.

Fallthrough to the next bridge, and to cold, is automatic **only because the envelope
pre-authorized it**. Nothing else is: a refused pin (`selection-refused`), an unusable
selection answer (`selection-red`), a missing registry (`registry-red`) and an
envelope that will not compose (`envelope-red`) all STOP with a decision-ready escalation
and hand the call back to you. So do the three answers **no further try could change** —
`unapproved-spec` (a tightened envelope makes a new spec version, and it is signed, not
inherited: the decision hands you the exact hash), `job-red`, and `smoke-red` — which end
the run on the try that hit them rather than reproducing themselves down the whole
envelope. Every category this emits is in the ledger's executable excluded-set, so none of
them lands as an unclassified library bug.

`scripts/run-reuse.mjs` is the reference operator runner: `--job`, `--registry`, and the
three envelope numbers `--budget` / `--wall` / `--tries`, plus optional `--pin` /
`--force-cold`, with the approval gate on `reuseSpecHash` (all three numbers — a hash
signed for a different `--tries` is refused, and says so), the F67 outside watchdog
(sized for the SUM of the tries, not one), the seed refusal, the gate-audit relocation and
the secrets scan.

#### Resuming a killed run (module C)

A reuse run is up to `tries + 1` full jobs long, so a kill mid-run is a real event and it
must not cost the whole envelope. **`readResume(events, {deathAt?, direct?, resumableOutcomes?})`**
reads the dead run's own spine back into the state a resume continues from: `{ started,
approvalHash, completed[], tried[], restart (with its step-level `seed`, its close
`grades`, and its work `branch`), r1Missing, spentUsd,
spendComplete, carrySpentUsd, carrySpendComplete, ended, greened, … }`. Hand that object to
**`runReuse({…, resume})`** and the run picks up where it stopped.

Two options widen WHICH spines it reads, both OFF by default so the reuse loop's own
semantics are byte-unchanged (PRD v1.46 §3):

- **`direct: true`** reads a plain `runJob` spine — no envelope, no try windows — as ONE
  implicit try opened at `job-start`, through the same window machinery rather than a second
  reader. Without it such a spine is honestly refused (`started: false`), which is what a
  reuse runner needs. `job-start` carries the DECLARED fold (`priorSpentUsd` with its
  `priorSpendComplete`, `priorWallMs`, and `priorReplans` with its `priorReplanGrantUsed`, each
  present only when there is one) exactly as
  `try-start` does, so a chain of resumes adds only each attempt's own new rounds instead of
  re-deriving and double-billing. **An inherited FLOOR is one** even when the money it qualifies
  is `$0`: a leg whose every round came back unpriced folds nothing countable and is still not
  exact, so the declaration is emitted to carry that unknown forward rather than letting it read
  as an exact zero (F6).
- **`resumableOutcomes: [...]`** reclassifies a landed `job-end` whose outcome is a
  CHECKPOINT rather than a verdict as a restart rather than a completed row. "A landed
  job-end is complete" is true of a VERDICT; a checkpoint means the work is on disk and the
  plan is on the spine with nothing decided against them. **The set is the CALLER's** — the
  parameter stays a parameter, and its empty default is what the reuse loop's own graded-row
  semantics depend on — but the canonical ANSWER is exported as **`CHECKPOINT_OUTCOMES`**
  (`['cap-halt', 'wall-halt', 'step-stalled', 'hitl-pause']`), and the reference runner
  CONSUMES it rather than keeping a copy. The first two are governance halts — an operator-owned allowance ran
  out. `step-stalled` joined them 2026-08-13 on hamr's ruling (PRD v1.64 §1): it is the one
  terminal whose OWN escalation already offers *"retry the run"*, nothing about the work on
  disk is wrong, and the shape that named the fix is a stall that trips with time left and
  then rides out past the wall — losing a checkpoint a `wall-halt` would have kept. Its NAME
  deliberately stays `step-stalled` because `runJob` keys the **F44 spend FLOOR** on that
  outcome; renaming it would report unknown spend as exact. The floor travels: a stalled
  leg's `spendComplete:false` reaches the preview as `≥$x` and the resumed leg as
  `priorSpendComplete: false`, so the next terminal stays a floor rather than healing an
  unknown by inheriting it. A green or any red stays non-resumable under every setting — a
  verdict already rendered is never re-bought.
  **One exception, and it is a DERIVATION rather than a widening (D4a, F96).** A recorded
  `step-red` is re-read as a wall-halt — and becomes resumable — when the run's OWN spine
  carries a `wall-bounded {bounded: true}` record STRICTLY BEFORE its terminal, and only when
  `'wall-halt'` is itself in `resumableOutcomes`. It fires on the run's own primary evidence,
  which no caller can assert; a `step-red` with no wall record in front of it is untouched, so
  "a red is an answer" survives intact. It touches no close verdict — the grades stand and the
  resume seeds from them. The readout surfaces `wallDerivedHalt` so an operator resuming a spine
  that SAYS `step-red` is told which record turned it into a checkpoint. **This is a PERMANENT
  safety net, not a migration shim (ruled 2026-08-13, PRD v1.63 §2):** the defect that minted
  the shape is fixed at source, but spines are append-only forever, so the population it protects
  can never shrink — and on a healthy spine it is a branch that is never taken.

`restart.branch` is the WORK BRANCH the dead leg was working on, READ off its `work-branch`
record and never re-derived: the name is deterministic from the signed spec, so a restart that
recomputed it would collide with its own predecessor and be handed a fresh `-2` beside the work
it came back for (the declared-fold precedent, `priorSpentUsd`'s exactly). Pass it on as
`resumeBranch`; `runReuse` does it for you. `null` — a leg killed before it ever branched — is
the cold path, and correct, because a leg that never branched has no work to strand.

`scripts/run-u.mjs --resume <runid|path>` is the operator-side consumer: it skips the patient
reset (`resumeTreeGate` instead — a dirty tree is what a resume expects; only a moved HEAD
stops it), folds the halted run's money and wall in, returns to the dead leg's own work branch,
re-enters at the checkpoint, and arms the outside watchdog on the REMAINING wall. The top-up itself stays a spec edit the human signs.
**A zero wall remainder REFUSES the launch** (exit 2, before the key and before the patient):
W-2 says a run out of time keeps the grade it has and stops, so a resume with no time to start
anything in is a decision, not an unbounded launch — and launching it used to hand the outside
watchdog `--wall-ms 0`, which it defaulted to `null` and armed no deadline at all under a banner
still advertising one. The refusal names the lever: raise `maxWallMs`, which moves the spec hash
and is re-signed.

**A `hitl-pause` checkpoint is answered on the same command line** (N4, 2026-08-12 §5.2 — the
terminal is the v1 surface; the panel is N6's). The reference runner takes
`--decide accept|rerun|pause` with `--text` for the rerun door, gated on the SAME
`--approve <specHash>` signature the run itself is signed with (ruling 4: the spec hash is the
only signer proof this repo has, and no second identity mechanism was invented). The decision
SEMANTICS are the library's — an adopter's runner should call `normalizeHumanRuling` and print
its refusal rather than re-spell "three doors, no fourth" or "a rerun needs text", and hand the
result to `runJob` as `humanRuling`. Two questions belong to the RUNNER because only it can ask
them: a decision with no run to answer, and a decision aimed at a checkpoint that is not a pause
(an `accept` there would mint a green over evidence nobody was shown). Before any of it, the
paused spine goes through `checkpointAgeGate`, and the run is not resumed without an explicit
decision: the lean-rerun rule (2026-08-12 §4) governs which door a prompt LEADS with, never an
action taken for the operator.

**A finished run's REVIEW DOOR is answered the same way, one flag over**: `--door <runid>`
selects the run (its own spine, its own `review-door` record), `--decide` picks the door and
`--approve <specHash>` signs it. The screen is its OWN preview and deliberately not the resume
banner: a door is answered about a run that is OVER, so nothing that banner computes (what is
left to resume with, which step it re-enters) is a true sentence there. `accept` and `pause`
launch nothing and exit; `rerun` falls through into a fresh engagement — its own clock, the
answered run's spend folded in — carrying the person's words as `doorRerun`. `--registry <dir>
--workflow <name>` are optional: without them the answer is recorded on the run's own spine and
the readout SAYS the credit was not released, rather than reporting a release that never
happened.

- **Completed tries are not re-run.** They come back as rows (marked `inherited`) and
  their bridges stay excluded from every later selection. A try whose `job-end` landed —
  the close judged it — counts as completed even if the kill beat its `try-end`; paying
  again for a verdict already rendered is exactly what resume exists to avoid. If the
  kill also beat the registry write, that row is LOST and named (`r1Missing`); nothing is
  invented in its place.
- **A mid-flight try RESTARTS** against the same workflow, with **no second selection
  call** (that pick was made and paid for), and it is not counted as consumed.
- **It restarts at the STEP it died on, not at its beginning.** hamr's ruling: *"start
  last step instead from the beginning, why would i want to waste more money on something
  i already started"*. `restart.seed` is the finest checkpoint the dead spine can PROVE —
  `{phase, plan, completedSteps[{id, seq, by}], planSeq}` — and it rides into `runJob`
  (and on to `runPlan`) as `resumeSeed`:
  - **scout: skipped** (`scout-skipped`, never silence). Its survey is not on the spine,
    so the one consequence is stated rather than discovered: a replan after a resume
    drafts from an empty survey plus its failure brief.
  - **plan: reloaded, not re-drafted** — from the LAST `plan-accepted` in the window (a
    replan emits its own, and the post-replan plan is the one that was running). It is
    **re-validated** against the spec signed NOW; a plan that no longer validates is
    `plan-red` by name (`resume-plan-red`) with nothing run. It is then re-emitted as this
    leg's own `plan-accepted {phase:'resume'}`, because R1 mints a bridge version from the
    plan AS EXECUTED read back off the spine.
  - **completed steps: skipped**, in prefix order by id, each with its own `step-skipped`
    record naming the event that proves it (`step-end{green}` — or an earlier
    `step-skipped`, so a resume of a resume does not re-pay for what the first one saved).
    Never a fake step-start/step-end pair; `plan-executed` records them as `skipped`.
  - **`phase: 'close'`** (an `outer-close` in the window) means every step is done: they
    are all skipped and the run goes straight to the close, which re-runs for no tokens.
  - A window with **no `plan-accepted`** (a scout/draft death) has no seed and simply
    restarts the try — nothing paid is re-payable there. If that window is itself an
    abandoned resume, the checkpoint is read from the newest abandoned window **of the
    same try** (measured on the real killed run: leg 3 died in its redraft, and reading
    only its own window would have discarded a checkpoint leg 2 paid $8.18 to reach).
  - The worker's conversation is **not** replayed — a transcript is not a checkpoint, and
    every attempt is fresh by the loop's own design.
- **Its TREND baselines come with it.** `restart.grades` is the dead leg's close grades in
  order (`[{stage, value}]` — counts and stage names only, never a gap byte), and it rides
  into `runJob`/`runPlan` as `resumeGrades` beside `resumeSeed` — on the LIBRARY path
  (`runReuse` hands it to the restarted try itself) as well as through `run-u --resume`;
  `resume-start`'s `restart` states `gradesInherited`, a count, and only when there is one.
  It seeds the run trend's
  baselines so the resumed leg's `money-halt`/`wall-halt` readouts judge the CHAIN: a leg
  that re-grades an unchanged tree is flat on its own evidence while the RUN — what the
  top-up decision is actually about — may have been converging when the money ran out. See
  the trend section above for what the seed does and, deliberately, does not touch.
- **Its REPLAN LEDGER comes with it too — and this one is a BOUND, not a readout.**
  `restart.replans` / `restart.replanGrantUsed` ride into `runJob`/`runPlan` as **`resumeReplans`**
  (`{count, grantUsed} | null`), seeding the replan ceiling instead of leaving it reborn per call.
  Without it a kill refilled an allowance PRD v1.12 makes the RUN's — measured, a leg that spent
  both replans and step-redded handed its checkpoint to a second leg that replanned twice more.
  **It deliberately does NOT use `resumeGrades`' mechanism.** The grade seed reads ONE spine, so a
  resume of a resume inherits the previous leg's grades and not the whole chain; that shortening is
  fail-safe for a READOUT (it can only under-claim a direction) and is the DANGEROUS direction for
  a ceiling, where an under-claimed ledger is a refilled allowance and every kill buys one. So this
  seed follows the MONEY fold: each leg declares `priorReplans`/`priorReplanGrantUsed` on its own
  spine and the next reader adds only its own window, so leg 3 inherits the whole chain. It is also
  not the same class as the trend's ITERATIONS, which `src/trend.js` refuses to seed on purpose: an
  attempt allowance is a LEG bound bought with the leg's own money, while a replan ceiling bounds
  how many times the WORKFLOW may be redrawn, which is the run's span. Belted like every declared
  fold — a garbage, non-finite or negative `count` reads as `0` rather than widening the ceiling.
  Null/omitted is the cold path. The disarm control is pinned: a resumed leg with an UNSPENT
  ceiling still replans, so the bound is bounded, not switched off.
  **NEVER-REFILL is now the RULING, not just the behaviour (2026-08-13, PRD v1.63 §4).** A resume
  inherits the spent replan ledger, entire; a refill would let every kill buy an allowance, which
  is unlimited replanning through the side door, and unlimited replanning launders thrash as
  adaptation. The consequence for an adopter is a real one and is deliberate: a resume whose
  ledger is already spent re-enters its plan with no channel to replace it. That is not funded —
  it is SHOWN, by the resume banner, before you sign.
- **Under the REMAINDER, never a fresh allotment.** The killed attempt's spend and wall
  FOLD IN (`runJob`'s `priorSpentUsd`/`priorSpendComplete`/`priorWallMs`, `createClock`'s
  `priorElapsedMs`), so
  the restart gets what is left of the signed per-try numbers. The caps are never
  rewritten — they are in the spec hash. An unfundable remainder is an honest `cap-halt`
  (or `wall-halt`, below one close timeout: a try that cannot fund its close produces an
  unreadable row) with **nothing launched**. Topping up is a new envelope, and a new
  envelope is a new signature.
- **…except a decide-time RERUN, which is a FRESH ENGAGEMENT** (F103, design record §3.4 —
  hamr: *"redo/rerun comes with new authoring for money+time and keeps accounting of this far
  and this session separate counters"*). A rerun opens on the full signed `maxWallMs` instead of
  the remainder, because the person did not decide on the run's clock: the incident that minted
  it took the door and inherited **87 seconds** from a leg that had already ended, on a worker
  measured to read nine rounds before its first write. So there are TWO counters and neither
  does the other's job — the CHAIN (every leg added up: `engagement.chainWallMs`,
  `chainSpentUsd`, `job-end.spentUsd`, what the halt readout reports) and the ENGAGEMENT (what
  bounds THIS leg: the clock's `priorElapsedMs`, `job-end.engagementSpentUsd`). The `engagement`
  record states both at the top of every run. **MONEY IS DELIBERATELY NOT SYMMETRIC**: it folds
  on every path, because the signed budget is the CHAIN's ceiling and a signature for $5 never
  silently authorizes $10 — a rerun spends what REMAINS of it, never a refill. A rerun leg also
  declares its `job-start` fold engagement-scoped (`priorWallMs` omitted, `chainWallMs` carried),
  so a later resume of it inherits this engagement's minutes rather than the chain's again.
- **Money stays honest end to end.** `carrySpentUsd` (completed tries + selection calls)
  seeds the resumed ledger; the mid-try fold is deliberately NOT in it, because it comes
  back inside the restarted try's own terminal — counting it in both places would bill it
  twice. A try row's `spentUsd` is therefore the try's WHOLE spend across both attempts,
  and a declared floor stays a floor — through ALL four of `runJob`'s floor causes: a
  landed resumable `job-end` whose own `spendComplete` is `false` (a stall, or a call cut
  mid-flight) floors the restart fold exactly like a declared prior floor or an unpriced
  round does (F83's laundering finding, fixed the same day; the killed-mid-flight restart
  with no `job-end` at all is control-pinned unchanged).
- **Refusals** (`resume-red`, in the ledger's excluded set): a seed signed under a
  DIFFERENT envelope than the one being enforced (both hashes are named), and a restart
  whose workflow has left the registry (substituting another would override a decision
  the runner did not make).
- **The patient is CONTINUED, not reset** — `resumeTreeGate({head, seed, dirty})`: a dirty
  tree is the dead tries' real progress; only HEAD moving off the seed (a commit or rebase
  under the dead run) stops the resume.
- **One run, one log:** the resumed process appends to the dead spine and passes
  `makeSpine(file, {startSeq})` so `seq` stays monotonic, keeps the dead run's runid (the
  R1 rows point at a spine FILE), and leaves the cumulative `gate-audit.jsonl` in the
  workdir to be relocated once at the end as usual.
- **Known limit (F6):** a call killed BEFORE it returned wrote no event, so money it may
  already have been billed for is not on the spine and cannot be folded — the same limit
  every guard here has (a hung `generate()` leaves zero trace).

`scripts/run-reuse.mjs --resume <runid|spine path>` is the operator seam: it refuses a
spine that is missing, corrupt mid-file, already terminal, or whose process is STILL
ALIVE (pids from the run's `runner-start` record and the watchdog report, discriminated
by `/proc/<pid>/cmdline`, because a live pid can be a recycled stranger), prints the whole
reconstruction as a preview before you sign — including WHERE it picks up ("step 2 of 3
\"verify-strict-typecheck\" — 1 step already finished and SKIPPED, not re-paid"), so the
signature covers an attempt whose real cost you can see — archives the killed run's
watchdog record so the readout cannot mistake it for this run's (defensively: a truncated
report is not evidence of anything, and it can no longer abort a signed resume), and sizes the
outside watchdog for the work that is actually LEFT. **Nothing left to run REFUSES the launch**
(exit 2), with a lever per cause, because they are different asks: `NO WALL LEFT` when the
restarted try burned its whole per-try wall (raise `--wall`), `NOTHING TO ARM` when every
authorized attempt has already run (raise `--tries`, or read the run as it stands). Both are in
the approval hash, so either is a new signature. Two smaller refusals in the same family: a flag
given no value (`--tries` with nothing after it) stops rather than reading `Number('') === 0`
and reshaping the run being signed, and `runner-start`'s recorded `argv` is redacted at the
write site — the spine is append-only, so a scan after the bytes land is too late.

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
`capability-gap` (cap-halt + request-red in one spine — one row per `(verb, lib)`, never per
verb, so two territories asking for one verb string stay two rows rather than collapsing onto
whichever territory was seen first), `broken-close` (consumer-attributed),
`request-red` (admission demand for a locked verb — keyed on the red's structured
`verb` field, prose-quoted verb as legacy fallback; both classes take their `lib` from the
red's own stamp, so neither seeds an upstream ask for a bareloop-catalogue refusal),
`retention-red`, `config-red`
(drafting friction — attributed to bareloop's own schema/prompt). Close-authoring
refusals ride the SAME `request-red` channel with `lib: 'bareloop'` stamped at the emit
site (`refusalEvents`), so genre/verdict/locked-kind demand is counted without ever
seeding an upstream ask. Deliberate exclusions
(`EXCLUDED_ESCALATIONS`, a runtime set — anything outside classified ∪ excluded is
counted as unmapped, never dropped): `cap-halt`/`wall-halt` (budget stories, money and
time), `step-stalled` (the stall fuse firing is our governance, not an observed provider
failure), `step-variance` (a planning story), `gate-red`/`smoke-red` (governance working
as intended / already counted — and `gate-red` is no longer minted anywhere in this library,
kept listed because this set is EXECUTABLE: dropping a name would not delete the category, it
would re-file any future emission of it as a counted capability gap), `hitl-close`/`close-unsupported`/`close-unauthorable` (by design — and the last one
is excluded for a SECOND reason: its demand is already counted once as the `request-red`
the same refusal emits, so counting the escalation too would double every refusal),
`close-timeout`/`close-killed`/`close-crashed` (the arbiter's own named terminals, F17);
`close-verdict`/`artifact-red` stay worker stories, `pr-red` operator environment.
`suggestedAsk` on every row is a template seed for an upstream ask — filing stays human;
status rows (`open → filed → fixed → consumed`) are human-appended, and the fold shows
the latest per key. Pure pieces exported for custom folds: `classifyIncidents(events,
{spine?})`, `foldLedger(rows)`, `ledgerDeltas(fold, occurrences)`. Riding with them,
and deliberately NOT a ledger class: `rateProvenance(record)` → `vouched|guessed|unpriced|unknown`
and `spendProvenance(events)` → per-provenance `{rounds, usd, unpricedRounds}` buckets answer
"how much of this run's spend was priced by a rate nobody vouched for" (BA-21 — see *Every cost
figure bareloop reports is an ESTIMATE* above). A bucket's `usd` sums FINITE costs only and is a
FLOOR whenever its `unpricedRounds` is non-zero (F6 — an unknown cost is counted, never summed as
$0). `VOUCHED_RATE_SOURCES` is the frozen allow-list they key on. **Reporting only**: no incident,
no class, no halt. CLI lands at N5; the
panel reads the same file at N6.

### `runBehaviour(events, { runId? })` / `formatBehaviour(summary)` — `src/behaviour.js`

Build-list item 2 (agreed 2026-08-23): one report-only text block summarizing what a run
DID with its tools, computed entirely from the run's own gate-audit JSONL. **Gates nothing,
changes no verdict, writes NOTHING to the spine** — a pure function over records that already
exist, same posture as `spendProvenance` above. `runBehaviour` counts and returns the summary
object; `formatBehaviour` renders it as the printed block:

```
94 tool calls · 61 read, 28 grep, 5 recall
17 exact repeats (~18%)
```

`llm` action rows are provider rounds, not tool calls, and are always excluded; only
`decision: 'allow'` rows count toward the total (a `deny` is tallied separately as `N denied`,
shown only when nonzero). **The exact-repeat key is the FULL recorded action — `type` + `path`
+ every key of `args`** (sorted, stably serialized), never collapsed to `{type, path}`: if the
gate ever starts recording byte ranges or offsets, two different slices of one file must not
read as the same repeated call. Repeat detection is therefore exactly as sharp as what the gate
records, no sharper — a tool that reads identical bytes through two differently-shaped argument
objects will not be caught by this. `scripts/behaviour-readout.mjs <gate-audit.jsonl> [run_id]`
prints the block for one run or every run_id found in the file, skipping malformed lines with
a count rather than throwing.

```js
import { runBehaviour, formatBehaviour } from 'bareloop';
const events = fs.readFileSync(auditFile, 'utf8').trim().split('\n').map(JSON.parse);
console.log(formatBehaviour(runBehaviour(events, { runId })));
```

#### `memory-cache` — the read shim's own end-of-run readout (`src/readshim.js`, `src/planrun.js`)

A single spine record, emitted once by `runPlan` right before it returns (so it lands on the
spine before the caller's `job-end`), reporting what the READ SHIM (L1 pointer + L4 cap) saved
this run: `{pointered, capped, bytesWithheld, approxTokens}`. `pointered` counts re-reads of
unchanged content answered with a pointer instead of the bytes; `capped` counts reads served as
a bounded slice; `bytesWithheld` sums exactly the bytes NOT re-sent in both cases (never
estimated) — the diff lever (L2) isn't counted, it's a different response shape. `approxTokens`
is `Math.round(bytesWithheld / 4)`, a bytes→tokens ESTIMATE named accordingly so nothing reads
it as measured. **Emitted only when the shim is armed** (any `readShim` arm but the off one) —
an unarmed run emits no record at all, never a fabricated zero. It carries no cost fields, so it
is not a spend record and no spend-slicing instrument needs to account for it.
`scripts/run-u.mjs` prints it as a `MEMORY-CACHE` line right after `BEHAVIOUR` when armed
(`no record` if the run ended before the summary could fire); `scripts/behaviour-readout.mjs`
prints the same line when handed the run's spine file as its optional third positional.


### `replayRun(spineEvents, auditEvents?, { runId? })` / `formatReplay(summary)` — `src/replay.js`

PRD build-list item 6: today no failed run can be reconstructed in under five minutes — every
byte is on disk (the spine JSONL + its gate-audit sidecar) but only hand-slicing JSONL reads it.
`replayRun` is a report-only reader over BOTH files: **reads only, mints no verdict, writes
NOTHING to the spine**, same posture as `runBehaviour` above, which it reuses rather than
reimplements for the tool-call breakdown. It returns one plain object:

```
{ runId, job, goal, budgetUsd, specHash, branch, verdictType, model, code,
  outcome, stopReason, spentUsd, spendComplete, wallMs, chainClock,
  resumed, resumeSeed, thisFileSpend, spendMismatch,
  timelineKind: 'steps'|'iterations', replans, close,
  steps: [{ id, occurrence, outcome, rounds, toolCalls, checks: {passed, failed},
    treeChanged, wallMs, spentUsd, unpricedRounds, tripped }],
  iterations: [{ iteration, verdict, boundary, closeStage, rounds, toolCalls,
    wallMs, spentUsd, unpricedRounds, tripped }],
  ending: { record, before /* the 3 records before it */, escalation },
  lastEscalation, behaviour, memoryCache, skipped }
```

**`verdictType`/`model`** (F117, PRD TODO #20 — hamr blessed the whole item verbatim, landed
2026-08-25): `verdictType` reads `job-start.verdictType` (`src/run.js:303`) — a REQUIRED spec
field (`src/job.js:552` reds `missing-required` before job-start ever fires), so `null` here
means only "this spine predates the field" (measured: `u-msdsmkid`, an Aug-3 archived run),
never "unset". `model` reads `job-start.model`, present only when the shell-owned provider
binding itself carried a `.model` string at job-start time — `src/planrun.js:76`'s own comment
documents bare-agent's Loop reading `baseProvider.model` directly off that same object, so it is
a real, citable, synchronously-available property, not a guess; a native/clipipe call path (or
any provider double with no such field — measured on `tests/helpers.js`'s `scriptedProvider`)
legitimately has neither, and this reader reports that honestly rather than defaulting one in.
`formatReplay` prints both right after `shape:` — `class:   softgreen` / `class:   not recorded
(pre-F117 spine)`, `model:   claude-sonnet-5` / `model:   not recorded`
(the two "not recorded" wordings are deliberately different: a missing `verdictType` is always
an archive-age gap, a missing `model` can happen on any spine, old or new). `--all` gains a
`class` column right after `shape` and a `model` column right after `class` (the verdict class /
the model string, or `-`) — `model` is kept FULL, never truncated, unlike the compact `reason`
column: a wrong or uncertain model reading is exactly the thing a directory-wide scan needs in
full, not cut.

**`code`** (F118, the run→code direction — the commit→run direction is the prompt-commit
check's `Failure:` run-reference rule; the two are companion halves of one loop, built the
same day). `codeVersion()` (`src/codeversion.js`) is a pure, $0, no-shell reader: `version`
is bareloop's own `package.json` version (resolved off `import.meta.url`, never a hardcoded
path — works whether this module is imported from `src/` or from an installed
`node_modules/bareloop`); `sha` is read straight off `.git/HEAD` (following a symbolic ref
to its loose ref file, falling back to `packed-refs` when the branch has been packed) **only
when `.git` is a real directory at the package root** — a dev checkout has one, an
npm-installed copy does not, and that absence reads as `sha: null`, honestly, never a guess.
`dirty` is always `null`: whether the tree has uncommitted changes cannot be known without a
shell, and this module NEVER shells out — `run` is the one locked verb (hamr's law targets
what the agent can DO, not how it's written), and a report-only field is not a license for
the library to grow a shell seam. `null` is reported here rather than a defaulted `false`,
because a faked "clean" reading is a worse lie than an honest "don't know."

`job-start` (`src/run.js:303`) carries `code: {version, sha}` alongside F117's
`verdictType`/`model` (`dirty` is intentionally omitted from the spine — it is always
`null`, and a spine field that can only ever hold one value is not worth a byte).
`replayRun` reads it as `{version, sha}` or `null` (absent field, an archive older than this
landing); `formatReplay` prints a `code:` line right after `model:` — `code:    bareloop
0.14.0 @ 43f2812` on a spine with a real sha, `code:    bareloop 0.14.0 @ sha unknown` when
`sha` is null (an npm-installed run), `code:    not recorded (pre-F118 spine)` when the
whole field is absent. `--all` gains no new column for this — the row is already at hamr's
named limit.

**Unknown money/time is always `null`/`unknown` — never `0`, and a partial sum is never stamped
exact** (F6's rule, carried through every level this module reports at): `spentUsd`/`wallMs` are
`null` when the run's own `job-end` is absent or carries no figure; `spendComplete` reads `false`
whenever `spentUsd` is `null`, regardless of what the record's own flag says. The SAME rule
governs one occurrence/iteration's own `spentUsd`: it sums `worker-round.costUsd`
(`src/planrun.js:2288-2297`) over records strictly inside that occurrence's own `seq` window —
a single `null` `costUsd` anywhere in the window makes the WHOLE occurrence's `spentUsd` `null`
(`unpricedRounds` names how many), never a partial sum. Zero rounds in the window is a real `$0`,
not an unknown one.

`stopReason` is `null` on a green/already-green outcome; otherwise `category — decision —
detail` from the last `escalation` record, every part present that record actually carries
(`category` dropped when it duplicates the outcome already shown beside it; `detail` trimmed at
400 chars with an explicit `…[+N chars]` marker, never silent) — `decision` alone is the generic
one-line prose every category shares ("the provider path failed mid-run…" fires for every
transport casualty); **`detail` is what actually killed THIS run** (a TLS "bad record mac", a
specific mypy error) and is the reason a stop is explained, never the decision prose alone.
Falls back to the bare outcome string for a pre-escalation red (`plan-red`/`job-red`/
`smoke-red`). `ending.escalation` carries that same last escalation record whenever it falls
outside the fixed 3-before window (common on a run that keeps emitting bookkeeping records after
its real failure) — never silently dropped. `lastEscalation` is the same raw record exposed
unconditionally (not gated on the window check) — `summarizeForAllLine`'s `reason` column reads
it directly rather than re-deriving from `ending`.

**A step id can recur** (a replan re-executes the same step): each `step-start`..`step-end` pair
is its own **occurrence** (`occurrence: 1, 2, …`), and every field on it — `rounds`, `toolCalls`,
`checks`, `treeChanged`, `wallMs`, `spentUsd` — is scoped to records strictly between THAT pair's
own `seq` (the spine's monotonic per-record counter, never `ts` — every record in one spine
shares the same seq counter, so it is an exact ordering where two same-millisecond `ts` stamps
are not), never pooled across every occurrence sharing the id. `rounds` counts real
`worker-round` records (`phase === 'step:<id>'`), never the declared cap; `toolCalls` is the one
thing still windowed by `ts` (the gate-audit carries no `step` or shared `seq`). `tripped` is the
last `escalation` whose `seq` falls inside the occurrence's window — `{category, detail}`, with
`detail` falling back to `decision` when the escalation site carries no `detail` at all (a
ladder-exhaustion `cap-halt`, `src/ralph.js`, is the measured example — without the fallback the
tripped line would print a bare category and hide the real reason).

**A run whose spine carries no `step-start` at all** — the plan's only step was
already-green-skipped on a resumed leg, or a genuinely loop-only shape (measured: `u-msf70nei`,
a resumed leg whose one step was already proven and only the CLOSE-FIX loop ran) — has
`timelineKind: 'iterations'` and `iterations[]` populated from `iteration-start`
(`src/ralph.js:583`) instead: each row runs from one `iteration-start` to the next
`close-verdict`/`run-end`/`escalation` (`src/ralph.js:674,577/657/676/698`), whichever comes
first by `seq`. `steps`/`iterations` are never both populated — exactly one is non-empty. Each
iteration's own `closeStage` (`{verdict, stages}`) is set when a `close-verdict` ended it, distinct
from the run's FINAL `close` (below).

**`close`** is the run's real, final close — resolved by picking the LAST (by `seq`) record
among every `close-verdict` that carries an ARRAY `stages` field and every `outer-close`
(`src/planrun.js:3296`). A `close-verdict` with NO `stages` came from a PLAN STEP's own
micro-loop, judged by the exit evaluator instead of a command (`src/planrun.js:2907`) — never
"the close". Picking by `seq` rather than preferring `outer-close`'s TYPE matters: `outer-close`
is the PRECHECK against the real close, fired once before the fix loop even starts, so when it
reads red the fix loop's own staged close-verdicts run strictly AFTER it — measured on
`u-msf70nei`, whose `outer-close` (seq 14) reads `needs_revision` but whose fix loop's own final
close-verdict (seq 97, LATER) reads `satisfied`, which is what the run actually ended on
(`job-end.outcome:'green'`). A run that never reached ANY close (e.g. `u-msdsmkid`, stopped by a
step-variance meter before `judgeClose()` ever fired) resolves `close: null`, printed as `none —
the run ended before any close ran` — never omitted.

`replans` prefers `plan-executed.replans` (`src/planrun.js:2688`) and falls back to counting
`materials` records stamped `phase:'replan'` (`src/planrun.js:2520`) when that field is absent —
an older archived spine can predate the field (measured on `u-msdsmkid`, an Aug-3 run). `branch`
reads the last `work-branch.branch` (`src/planrun.js:1589`) or `null` when absent — also measured
missing on the same era of archive, before the work-branch rung landed.

`wallMs` is THIS FILE's own `job-start`→`job-end` span, labeled `(this file)` — on a RESUMED leg
that is only the latest engagement, not the whole signed chain. `chainClock` is the other true
number: the SIGNED wall read off the run's own clock record — `wall-halt` when present (the
TERMINAL reading, taken at the moment the wall stopped the run; `src/planrun.js:1269`'s
`emitWallHalt`), else the single `wall-clock` record every run emits near its start
(`src/planrun.js:1203`) — both spread from `clock.report()` (`src/clock.js:235-247`: `bounded,
requestedMs, closeStages, enforcedMs, elapsedMs, remainingMs`). `elapsedMs` on either is
chain-scoped by construction (`createClock`'s `priorElapsedMs` fold, `src/clock.js:174`), so it
can legitimately exceed this file's own `wallMs` on a resumed run. `wall-halt`'s reading is
end-of-run-honest, so `formatReplay` states it plainly: `clock: 60m04s of 60m00s signed (chain,
from wall-halt)`. `wall-clock`'s reading is taken at the TOP of the engagement (chain time
already inherited, not this run's own duration) — printing that under the same template read as
"this run took 0 seconds" on a cold run, so it gets its own honest wording instead: `clock: 30m00s
signed · 0.0s inherited from prior legs at start (from wall-clock; no end-of-run reading in this
file)`.

**Money carries the identical split** (hamr, 2026-08-25): a RESUMED run's `job-end.spentUsd` is
the CHAIN total (prior legs folded in — `src/run.js:227`'s `chainFoldUsd`, seeded from
`job-start.priorSpentUsd`), which can never equal this ONE file's own rounds — measured on
`u-msf70nei`: header `spentUsd` reads `$5.3389` while its own 55 `worker-round`s sum to exactly
`$1.2127`. `resumed` reads `job-start.priorSpentUsd > 0` — the SAME condition `src/run.js` itself
folds on — deliberately NOT `resume-seed`'s presence: `resume-seed` (`src/planrun.js:2622`) is a
NARROWER record, fired only when a plan is actually reloaded mid-flight, and its absence does not
mean "not resumed" — measured directly on 4 real archived runs (`litectx-maintainer-bareloop`'s
`msx7xoe0`/`msx87qqs`/`msxf9129`/`msxf2mwi`) that carry a real `priorSpentUsd` fold with NO
resume-seed record at all. `resumeSeed` (when present) supplies the DETAIL —
`{phase, completed, skipping, divergence}` — printed as `resumed: yes — phase close, 1 of 1
completed step(s) skipped`; a resumed leg with no resume-seed record still reads `resumed: yes
(no resume-seed detail recorded)`, honestly, rather than falling back to `no`. `thisFileSpend`
prefers `job-end.engagementSpentUsd` (F103, `src/run.js:284` — this engagement's own fold-out
spend) when the record carries it, falling back to summing this file's own `worker-round.costUsd`
when it does not (measured absent on `u-msf70nei` itself); an unpriced round anywhere in THIS
FILE makes the figure `null` regardless of source (F6, never a partial sum stamped exact) — both
figures print on the `spent:` line, each labeled with its source, never one silently standing in
for the other. `spendMismatch` is the same-class check for a NON-resumed run: there is no fold to
explain a gap, so `job-end.spentUsd` disagreeing with this file's own summed rounds by more than
$0.0001 is a genuine finding, printed as `MISMATCH vs job-end`, never hidden — measured across
every non-resumed run in the available archive (aurora-u, bareagent-u, litectx-maintainer): zero
trip it. `--all`'s spend column stays the chain total (what a directory scan asks first) but
marks a resumed row with a trailing `*` on its id, with one footnote line
(`* resumed run — spend is the chain total, see detail`) printed once, only when the listing
holds at least one such row.

`formatReplay` renders the full page: a header block (`goal:`/`shape:`/`signed:`/`branch:`/
`resumed:`/`outcome:`/`spent:`, every absent field printing the literal `none recorded` — never
blank, never a fabricated `0`), a `TIMELINE (steps)` or `TIMELINE (iterations — loop-shape run)` section with
its own column-header row (`#  step  result  rounds  tools  checks  tree  wall  spend`, or the
iteration equivalent without `checks`/`tree`) and a `↳ tripped:`/`↳ close:` line under any row an
escalation or close fell inside, a `CLOSE` section (never omitted — `none — the run ended before
any close ran` when nothing ever closed; the failing stage, if any, prints FIRST with `✗`, the
rest `name OK`), `ENDING` (last record + 3 before it, plus an out-of-window escalation), the
`BEHAVIOUR` block, and a `MEMORY-CACHE` line **always printed** — the existing wording when the
run carried a record, `not armed on this run` otherwise. An absent record is never silent.
`RESULT` words are `GREEN`/`RED`/`UNKNOWN` — `satisfied`/`green`/`already-green` read GREEN,
every other non-null value reads RED.

`summarizeForAllLine(summary)` builds one `--all` row's raw fields (`id, job, shape, outcome,
spend, wall, steps, reason`) — `shape` is `plan`/`loop` (from `timelineKind`, never the
always-literal-`'plan'` `job-start.shape` field); `steps` is a bare count for a plan-shape run,
`"N it"` for a loop-shape one; `reason` is `category — <first clause of detail, cut at 60 chars,
plain "…", no [+N] marker>` off `lastEscalation` — **`detail` only, never `decision`** for this
column specifically (unlike the full report's `↳ tripped:` line, which does fall back to
`decision` — this compact row has no room for both and the coordinator's own ruling keeps
`decision`'s generic per-category prose out of it); `-` on a green row; the distinct, literal
`no job-end (killed mid-run)` when the spine never reached a `job-end` at all (`outcome` itself
is `null`) — not folded into the ordinary escalation case. `formatAllLines(entries)` renders every
row as a FIXED-COLUMN, ALIGNED table with a header row (never CSV — columns are padded, not
delimited; the header's own label lengths count toward the column widths) plus any
`<name>  not-a-spine` lines at their original position (unpadded — a filename carries no
outcome/spend/wall of its own). No header prints when there are zero real spines in the listing.

`scripts/run-replay.mjs <spine.jsonl>` resolves the sibling `-gate-audit.jsonl` automatically and
prints the full report; `--all <dir>` is **name-agnostic** — the patient corpus does not agree on
one filename convention (`u-<id>.jsonl`, `battery-A1-<id>.jsonl`, `l2accept-L1-<id>.jsonl`,
`reuse-<id>.jsonl`, `types-screen-C-<id>.jsonl`, …), so a spine is identified by CONTENT: any
`.jsonl` that is not a sidecar by name (`*-gate-audit.jsonl`, `*.lag.jsonl`) and whose records
include a `job-start` (present on every real spine checked, nested wrappers included) or
`run-start` (present on most, absent on a run that died before ralph's first iteration). A
`.jsonl` matching neither is printed as `<name>  not-a-spine` — never silently dropped or
misread as an empty run. Both modes mirror `scripts/behaviour-readout.mjs`'s own malformed-line
handling (skip-and-count, never throw).

**F117's PRD TODO #20 is now landed in full**: both the verdict CLASS and the worker MODEL
name are surfaced (see `verdictType`/`model` above) — hamr blessed the item verbatim
("1") on 2026-08-25, so the spine-WRITER change to `job-start` (`src/run.js`) that a
report-only reader would not otherwise make on its own authority went in with his explicit
word. `judgedCount` on a close-verdict was never a reliable stand-in for the class either way
(it appears on plain green closes too, not only softgreen ones) — this reads the real
declared field instead.

**Transport retries and floor reasons (F119, live-proven 2026-08-25)**: every
`transport-retry` record (`src/planrun.js:126`) whose `seq` falls inside a step's or
iteration's own window prints a `↳ transport retry ×N (recovered|not recovered|partially
recovered) — <first 80 chars of the error>` line under that row — the same open-interval
`seq` windowing `windowSpend` already uses for rounds. A retry whose `seq` falls outside
every occurrence window (e.g. during the scout/plan phase) is counted instead under the
`TIMELINE` header as `transport retries outside steps: N`, printed only when that count is
non-zero. The header's `spent:` line, whenever `spendComplete` is `false`, appends
`· floor because: <reason(s)>` — derived from the spine, never guessed: `transport retry
×N` (any `transport-retry` record), `unpriced round(s)` (a `worker-round`/`judge-round`
with non-finite `costUsd`), `cut mid-call` (a `wall-halt` record with `cutMidCall:true`),
`stall` (a `stall` record), `prior leg floor` (`job-start.priorSpendComplete === false`) —
every cause that actually shows evidence prints, never just one; a floor with no derivable
evidence on this spine (an older archive, or a resumed leg's floor inherited from a file not
in hand) prints `· floor (reason not in spine)` instead. `--all` adds no new column: a run
that carried any transport retry gets ` ⟲N` appended directly after its outcome word (same
posture as the resumed `*` on `id`), with one footnote
(`⟲N transport retry(ies), recovered inline — see the full replay for detail`) printed once
when the listing holds at least one such row. Live-proven on `u-mt8yk53k` (F119): two
recovered TLS `bad record mac` retries, both inside step `fix-mypy-strict`'s window —
`floor because: transport retry ×2` and `green ⟲2` in `--all`, on a run that finished green.

```js
import { replayRun, formatReplay } from 'bareloop';
const spine = fs.readFileSync(spineFile, 'utf8').trim().split('\n').map(JSON.parse);
const audit = fs.readFileSync(auditFile, 'utf8').trim().split('\n').map(JSON.parse);
console.log(formatReplay(replayRun(spine, audit, { runId: 'mszcthk1' })));
```

### `PROMPT_REGISTERS` / `isPromptFile(path)` — `src/promptregisters.js`, and the prompt-commit rule

PRD build-list item 5 (TODO #8), Q9 answered (hamr, 2026-08-25): "a check". A commit that
changes a **prompt register** — one of the model-facing system/strategy/instruction
strings a worker or judge actually reads (`SCOUT_SYSTEM`, `AUTHOR_SYSTEM`,
`PERSONA_TOOLS`, `READ_SHIM_STRATEGY`, and their neighbors — the full, verified list is
`PROMPT_REGISTERS` in `src/promptregisters.js`) — must say, in its own message, three
things: what failure caused the change, what it addresses, and what it corrects.
Convention-only was rejected: doctrine already on record is "a frozen rule without a
wired detector is prose." `isPromptFile(path)` is the pure predicate the check runs
against; both are exported from `bareloop`'s root so the inventory has exactly one home.

hamr's addition (2026-08-25, same day): the `Failure:` line must ALSO cite the **run**
that caused the change — `run <id>` or `run u-<id>` (case-insensitive at the `run`
keyword, multiple refs fine), matched by `\brun\s+(u-)?[a-z0-9]{8}\b` (tightened from an
initial `{6,12}` margin after a PR #23 review found the margin loose enough to accept
plain prose — "run failed" is 6 lowercase letters, satisfying `{6,12}` outright — to the
measured exact shape: every real archived id is exactly 8 characters. A per-id digit
requirement was proposed in that same review and rejected: 23 of 130 re-sampled real ids
carry no digit at all, `msdsmkid` among them — a real archived run cited by name
elsewhere in this repo — so requiring a digit would reject genuine citations). The commit
points at the run; `replayRun`/`formatReplay` (above) close the loop the other way,
turning that run id back into the whole story. A `Failure:` line with no run reference
fails with a distinct message: `Failure: must cite the run that caused the change (e.g.
"Failure: run mszcthk1 — ...")`. FORMAT ONLY — the check never verifies the cited run's
spine file actually exists (a run's patient lives outside this repo entirely, so there is
nothing here to check it against).

Enforcement is **local only** — wired into `npm test` (see `package.json`'s `test`
script), never into `.github/workflows/*` (CI already runs `npm test`, so the rule is
enforced there without an ask-first CI edit). The check itself lives outside the
published package, at `scripts/prompt-commit-check.mjs` (pure decision logic in
`scripts/promptcommitlib.mjs`, `scripts/` is not in `package.json`'s `files`, so none of
this ships):

```
node scripts/prompt-commit-check.mjs --range origin/main..HEAD   # validates every commit
                                                                    # in the range that
                                                                    # touches a prompt file
node scripts/prompt-commit-check.mjs --message-file .git/COMMIT_EDITMSG
                                                                    # commit-msg hook mode:
                                                                    # validates one message
                                                                    # against staged files
```

A compliant message:

```
fix: tighten PERSONA_TOOLS

Failure: run mszcthk1 — worker read the arbiter spine after being told it was denied
Addresses: PERSONA_TOOLS did not name the spine file explicitly
Corrects: spells the denied paths from ARBITER_BOOK_STORES
```

A commit that touches no prompt-register file is passed without inspecting its message.
An unresolvable `--range` (no such ref — a fresh clone with no `origin`, a detached
checkout that never fetched) is a **skip**, printed and exited 0: a missing baseline is
not a rule violation, never a red.


## Architecture

Three layers. An **outer shell** (dumb, permanent): per-run budget cap via bareguard,
retry cap (a count on the close-fix loop, a shell-owned STRIKE ceiling on a plan step),
verdict collection, escalation routing — stateless across runs; nothing inside
negotiates with it. An **emergent middle**: the AGENT-authored plan — bounded steps, each
with its granted verbs, its round cap, its narrowed write scope and its
form-checkable exits — schema-validated by `validatePlan` before tokens burn (the
operator-authored `steps[]` shape is deleted, PRD v1.32). A **floor**: append-only
JSONL spine (single source for every UI), litectx store per job, per-run ledger. Built on
the bare suite: bareagent, bareguard, litectx, barebrowse, baremobile — the full surface
is disclosed to the authoring agent; only admitted verbs are callable per job.

## Extension contract

hamr's law, verbatim: **the agent may author anything whose only verbs are gated
primitives; it may never author the arbiter — the close, the budget, the fence, the
merge.** What an adopter can plug into `runJob` (`src/run.js:205`):

- **Providers.** `provider` (shell-owned LLM binding for the `Loop`/API path),
  `nativeProvider` (a factory required for a `clipipe-subscription` job),
  `providerFor(tier)` (per-step model-tier provider, forwarded to the plan flow), and
  `judgeProvider` (SOFTGREEN's own seam — the provider a judged close stage runs its
  locate-only call through; distinct from `provider`/`providerFor` because the judge tier
  is fixed, never the worker's). All four are documented at `src/run.js:91-101`.
- **Close stage kinds.** The catalogue is fixed and enumerated (`LIVE_KINDS`,
  `src/kinds.js:142`: `command-exit`, `count-not-worse`, `pattern-absent-in-diff`,
  `files-changed`, `human-confirms`, `judged-floor`). An adopter's declaration SELECTS
  from this menu; it never authors a new kind — a stage naming an unimplemented or unknown
  kind is a hard runtime stop (`src/kinds.js:1885-1888`), not a way to run adopter code
  inside the close.
- **`emit` — the spine sink.** `makeSpine(file)` (`src/spine.js:21`) returns an
  `emit(type, data)` that appends one JSONL line per event; any function with that
  signature can stand in as a custom sink, but it is write-only — nothing in bareloop reads
  the spine back, so a custom sink cannot feed anything into a run's own decisions.
- **`rates` is NOT an extension point.** A rates passthrough was designed but never built;
  pricing is guesstimate-plus-loud-`estimated`-flag by ruling, and rate tables are the
  customer's own responsibility, not a bareloop seam to wire up.

Everything else in `runJob`'s options — budgets, caps, the close, the fence, merge/publish
— is arbiter territory and is never adopter-suppliable as behavior, only as signed,
schema-validated data.

## Threat model summary

**Local-trust model, NOT a sandbox.** The worker runs with the OS user's own permissions.
Both the close (`src/ralph.js:222`) and a declared close stage's environment
(`src/kinds.js:351`) start from a full copy of `process.env` and spawn child processes
under it — this is a passthrough, not a jail.

**What the arbiter guarantees:**
- **Cap-not-estimate money and time.** `budgetUsd` is validated `0 < budget <= shellCapUsd`
  with the check's own name, `cap-not-estimate` (`src/job.js:227`); spend is never a
  projection.
- **A signed spec hash refuses drift.** `jobSpecHash`/`checkApproval` (`src/job.js:703,
  723`) mean an edited spec is unapproved by construction; `runJob` red-lines
  `'unapproved-spec'` before any provider call if no approval record matches the exact spec
  version (`src/run.js:289-290`).
- **Secrets never enter the tree, the spine, the ledger, or a close's child process.**
  `redactSecrets` (`src/validate.js:130`) scrubs at every emission boundary in the
  authoring path; `CLOSE_ENV_DENY` (`src/ralph.js:136-153`) strips provider keys and
  known credential-shaped env-var names from the copy of `process.env` handed to a close
  child, by name/prefix/suffix-shape — a strip of a COPY, so the host process (and
  bare-agent, which reads the real key every round) keeps its own credentials.
- **The worker is fenced off the arbiter's own books.** The authoring scout's read scope
  denies the gate audit path and every `ARBITER_BOOK_STORES` path under the workdir
  (`src/authorscout.js:295`); a plan step's read scope is the workdir alone
  (`src/planrun.js:1894`).

**What it does not guarantee:** no network egress control and no container/VM isolation —
this repo has neither built nor documented either. `CLOSE_ENV_DENY`'s deny rule matches
only credential-shaped names (`src/ralph.js:136-153`); any env var that doesn't match that
shape passes through to the close's child process untouched. `SSH_AUTH_SOCK` is one of them
and stays on purpose — stripping it would break git-over-SSH inside a close — but the deny
list itself carries no comment saying so; this paragraph is the record.

**What an adopter must do:** keys load from the environment only (`.env.example` below);
the patient is always a COPY of the target repo, never the original — the copy is the
blast radius.

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
to `docs/logs/FINDINGS.md`).*

## Constraints

- **Node >= 20** (bareguard's floor governs the suite).
- **Pure ESM + JSDoc**; generated `.d.ts` ship, never hand-written (LIBRARY_CONVENTIONS §2).
- **Secrets load from the environment** and never enter the spine, configs, or ledger —
  an append-only record that captures a key captures it forever.
- **The spine is append-only** and the single source of truth; every UI (panel included)
  is a pure observer of it.
