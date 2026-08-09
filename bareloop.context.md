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
| `maxWallMs` | optional integer ms `>= MIN_WALL_MS` (one close timeout) | the run's wall clock. **NO DEFAULT, by ruling** — absent means time-unbounded *by explicit operator choice*, never by fallback (F45: a defaulted cap is a silent second ceiling). Enforcement is a BETWEEN-ROUND deadline, so the honest worst case is `maxWallMs + closeStages × closeTimeoutMs` — every stage of a staged close gets the FULL timeout — and all three numbers are reported (`loop.stop()` cannot cut an in-flight call — F61 measured 500ms→4,018ms). The `MIN_WALL_MS` floor is a ONE-stage number, so a spec with many stages can validate while its overshoot dwarfs its cap: the clock reports that honestly rather than the floor pretending to prevent it (stage-aware floor parked, PRD v1.39). Operator-only, tighten-only; adding or changing it changes the spec hash |
| `writeScope` | array of contained globs | the operator's outer fence; the plan's own scopes must fit inside it, same containment code |
| `steps` | RETIRED | operator-authored `steps[]` was deleted (PRD v1.32); a spec carrying it reds `shape-retired:steps` by name rather than half-running |
| `escalation` | `{ mode: "decision-ready" }` | the pain channel is not optional |

**The plan shape — the only shape** (Layer 2, design record 2026-07-21). The AGENT authors
the step plan at run time (gated by `validatePlan`); the human signs only:

| field | shape | notes |
|---|---|---|
| `goal` | non-empty text | what the agent plans against |
| `verdictType` | `green` \| `soft-green` \| `hitl` | declared radio, never inferred (`VERDICT_TYPES`, frozen). v1 ADMITS only `green`; declaring `soft-green`/`hitl` reds `request-red` with the type as a structured `verb` field (declared-but-locked — the tool-menu pattern). Every `request-red` also carries `lib` — the territory the demand lands against, stamped at the emit site (`verdictType` → `bareloop`, a locked tool verb → `bare-agent`): the ledger keys and its `suggestedAsk` seed on it, so a bareloop-catalogue refusal never files as an upstream ask |
| `close` | **an ORDERED LIST of named stages** `[{ name, cmd, expect, judged?, gapKeep?, offer?, needs? }, ...]` (PRD v1.28), or a close object (table below) **only** for the declared-but-locked verdict classes | the destination, the only thing hand-authored; the check menu DERIVES from it (below). The plan flow executes a staged close directly and adapts a bare `predicate` object into a one-stage list; a `gold`/`rubric`/`hitl` object close validates (the declared-but-locked verdict classes still parse) but the plan flow refuses it at runtime as `close-unsupported` — it names no command to run |
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
ONE genre** (`TYPES`: a type checker stops complaining without breaking the tests) and
exactly one verdict class (`green`) — everything else refuses honestly, and every refusal
is COUNTED.

**The verdict class is the USER's answer (PRD v1.57 §1), and it DRIVES the authoring.**
`verdictType` is a declared radio the preflight validates, never inferred:
`VERDICT_CLASSES` = `green` | `soft-green` | `hitl`, with `LOCKED_CLASSES` =
`soft-green` | `hitl` declared-but-locked. Picking a locked one returns a counted
`request-red` refusal at ADMISSION — before that class's questions are ever asked. The
pick is also a PROMISE: every catalogue kind carries the `verdictClass` it can honestly
render, `closeCeiling(declaration)` reports the highest class a declaration demands, and a
declaration ABOVE the pick is a `class-ceiling` red naming the kind that raised it (inert
in v1 by construction — every live kind is mechanical).

**The pipeline, in call order.** Each piece is exported so an adopter can drive it, cache
a step, or test it without a provider.

| step | call | what it is |
|---|---|---|
| interview | `runInterview({ verdictType, answers, repoPath })` → `{ ok, answers, verdictType, refusal, reds }` | PURE — no model, no repo, no clock. THREE frozen question sets keyed by verdict class (`QUESTION_SETS`; `questionsFor(cls)` / `requiredAnswersFor(cls)`), and the interview asks NOTHING about a genre. The green set is six questions, answers keyed by number; the soft-green and hitl sets are named but LOCKED (`questions: null`, absent rather than empty) and their selection refuses before they run. `verdictType` and `repoPath` are STRUCTURED input, never parsed out of prose. Answers are scrubbed at INGEST |
| survey | `runAuthorScout({ workdir, provider })` → `{ state, facts, reason, meta, calls }` | a bounded READ-ONLY LLM survey. Read-only by MENU CONSTRUCTION (`AUTHOR_SCOUT_VERBS` = the full menu minus write-class and store-class verbs), 8 rounds, F59's reserved toolless final round. **`state: 'ABSENT'` means the scout did not complete — never "no special facts are needed"**, and a parsed `{}` is one of its five ABSENT routes |
| listing | `buildSeedListing({ workdir, seedRef, sourcePaths, testPaths })` | mechanical, `$0`, no model. `files` is the WHOLE tree (what the validator judges paths against); `block` is scoped to the survey's own paths and capped in ANNOUNCED tiers (what the prompt carries). Handing the validator the scoped half would make a job scoped to `src/` read as whole-tree and silently disarm the one-population law |
| authoring | `authorClose({ workdir, seedRef, lang, verdictType, answers, scout, listing, generate })` | the grounded loop: author → validate → run EVERY stage at the seed → feed the MEASURED results back → revise, bounded at `MAX_REVISIONS` (2), early-stop on an unchanged declaration. The declaration is emitted through a SCHEMA-FORCED TOOL CALL (`declare_close`), never parsed out of prose; the feedback is EXECUTION OUTPUT only — no model ever reviews another model's close |
| everything above, composed | `authorCloseForJob({ verdictType, answers, repoPath, lang, generate, ... })` → `{ ok, closeDecl, verdictType, refusal, cost, ... }` | refuses at the cheapest gate that can refuse: an interview refusal costs **zero**. THE GENRE REFUSAL LIVES HERE (not in the interview): a language the catalogue owns no data for, and a LOCKED KIND the model reached for, both come back as counted `request-red` demand |
| assembly | `assembleSpec(specDraft, { closeDecl, verdictType })` | folds the authored half into the OPERATOR's half. Budgets, the fence, cadence, escalation and the provider are never authored by anything here. The GOAL is passed through, not generated |
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
`count-not-worse`, `pattern-absent-in-diff`, `files-changed` are live; `judged-floor` and
`human-confirms` are NAMED BUT LOCKED (and carry `verdictClass` `soft-green`/`hitl`), so
declaring one is a counted `locked-kind` red rather than an unknown-kind typo; `harness-loop` (TESTGEN) is ABSENT from v1 entirely. In
tool mode a locked kind is INEXPRESSIBLE — the schema carries one branch per live kind — so
that demand arrives through the interview layer instead (`refuseLockedKind(kind)`).

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

Then the human signs `specHash`, unchanged: the approvals array and the human's word are
the arbiter relocating to the user, not disappearing. **Re-authoring is a spec edit (D6)** —
a different declaration is different bytes, a different resolved hash, and a new signature.
The guards are stored ENUMERATED and every short-form parser is expanded, so no
omittable-with-a-default field can change what runs without changing what was signed.

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
redact, { cwd, seedRef, timeoutMs })` returns `runClose`'s verdict shape; `runDeclaredClose`
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

### `runJob(spec, { approvals, workdir, provider, nativeProvider?, providerFor?, emit, capRuns?, strikeLimit?, shellCapUsd?, closeTimeoutMs?, layerRoot?, bridge?, priorSpentUsd?, priorSpendComplete?, priorWallMs?, resumeSeed?, resumeGrades?, resumeReplans?, resumeBranch? })` → outcome — `src/run.js`

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
provider-red | interpreter-red | cap-halt | wall-halt | step-stalled | step-red:<id>`.
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
not `step-stalled`, since a replan has nothing left to re-allocate. Every one of them is a
decision-ready escalation with a terminal `job-end`: the spine never dangles.

**Every `job-end` carries the money, on every path**: `{ outcome, spentUsd, spendComplete }`
(plus `step`/`cause`/`detail` where the outcome has them). `spentUsd` is the accumulated sum
of PRICED rounds ONLY — never an estimate from token counts or averages (cap-not-estimate) —
and it is stated even on the pre-token reds, where the honest figure is a real `0`.
`spendComplete` says whether that figure is EXACT; `false` means `spentUsd` is a FLOOR ("at
least $X", true total unknowable) and must not be read as a total. Four things set it, all
the same class — a call whose cost is unknowable from here: a round that came back unpriced
(F6); a run that ABSORBED a stall, because the fuse's silent reissue may pay twice for one
answer and the flag is one-way whatever the outcome; a `wall-halt` that cut a call
mid-flight (`cutMidCall`); and a RESUME whose fold was itself a floor
(`priorSpendComplete: false` — an unknown does not heal by being carried forward, so every
round of this attempt being priced repairs nothing about the one before it). A wall stop read BETWEEN iterations or steps has no call in flight,
so it stays exact. Both fields are present on all outcomes, so a consumer never branches on
field presence and never has to launder a missing `spentUsd` into `$0`.

**The plan flow (Layer 2).** `job-start` carries `shape: 'plan'` + the goal; plan steps are
tool-mode by construction. The flow (`runPlan`, also exported for direct callers who own
their own ledger): **close precheck** (`already-green` is a
DISTINCT zero-token outcome; a forbidden-zone verdict escalates before spend) → **check-menu
preflight** (`check-menu` names the derived menu, then every OFFERED stage's chain runs once
at $0 — an unrunnable stage is a `check-red` stop before tokens, not a fault mid-plan) →
**THE WORK BRANCH** (below — created before the first paid call, `branch-red` if it cannot
be) → **SCOUT** (read-only by construction: neither the
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
plan-red | check-red | close-red | wall-halt`. Worker prompts hold the v1.12 §5 contract
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
  killed leg's own branch and mint a `-2` beside the work the resume exists to keep. A
  recorded branch that no longer exists is a `branch-red` STOP, never a fresh start.
- **`work-branch { branch, created, resumed, from, base, repo, collided? }`** lands on the
  spine at creation — the run's books say where its work went.
- **Every failure is `branch-red`**, escalated decision-ready with zero spend. There is no
  fallback to the handed branch anywhere; and `mkWorker`, the ONE seam that grants
  write-class verbs, refuses to build a write-capable worker with no branch prepared, so the
  ordering is a convenience and the guard is the rule.
- **An `already-green` tree leaves no branch behind** — the precheck returns above this
  step, and a run with no work has no blast radius to bound.

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
**newest** version's plan rides into the FIRST drafting prompt as a starting draft
(`bridge-loaded {name, versions, runid}` on the spine) and everything after it is the
ordinary shipped path — same validator, same redraft-on-reds, the same replan ceiling, and a
**replan never re-injects the bridge** (it drafts from the run's own state). On a fail the
run returns the distinct terminal **`recipe-stale`** with `bridge-gate {outcome, name, reds}`
and a decision-ready escalation, having spent nothing. **Falling back to cold is the
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
- **`resumableOutcomes: ['cap-halt', 'wall-halt']`** reclassifies a landed `job-end` whose
  outcome is a GOVERNANCE HALT as a restart rather than a completed row. "A landed job-end is
  complete" is true of a VERDICT; a halt means an operator-owned allowance ran out with the
  work on disk and the plan on the spine. A green or any red stays non-resumable under every
  setting — a verdict already rendered is never re-bought.

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
- **Under the REMAINDER, never a fresh allotment.** The killed attempt's spend and wall
  FOLD IN (`runJob`'s `priorSpentUsd`/`priorSpendComplete`/`priorWallMs`, `createClock`'s
  `priorElapsedMs`), so
  the restart gets what is left of the signed per-try numbers. The caps are never
  rewritten — they are in the spec hash. An unfundable remainder is an honest `cap-halt`
  (or `wall-halt`, below one close timeout: a try that cannot fund its close produces an
  unreadable row) with **nothing launched**. Topping up is a new envelope, and a new
  envelope is a new signature.
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
as intended / already counted), `hitl-close`/`close-unsupported`/`close-unauthorable` (by design — and the last one
is excluded for a SECOND reason: its demand is already counted once as the `request-red`
the same refusal emits, so counting the escalation too would double every refusal),
`close-timeout`/`close-killed`/`close-crashed` (the arbiter's own named terminals, F17);
`close-verdict`/`artifact-red` stay worker stories, `pr-red` operator environment.
`suggestedAsk` on every row is a template seed for an upstream ask — filing stays human;
status rows (`open → filed → fixed → consumed`) are human-appended, and the fold shows
the latest per key. Pure pieces exported for custom folds: `classifyIncidents(events,
{spine?})`, `foldLedger(rows)`, `ledgerDeltas(fold, occurrences)`. CLI lands at N5; the
panel reads the same file at N6.

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
