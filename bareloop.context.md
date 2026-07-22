# bareloop — Integration Guide

> **Current through N2 + the Layer 2 core** (headless single-job loop: `runJob`, text +
> tool middles, the draft-PR hitl step; the plan-v1 flow — four-field job shape, agent-
> authored validated plans, in-run check exits); API sections fill in as build-ladder
> rungs land (PRD §10). What is settled — the boundary, the architecture, the refusals,
> the constraints — is settled for good. Per LIBRARY_CONVENTIONS §3 this file ships with
> the package and is the complete adopter contract; the README is only the pitch.

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
| `steps[].tools` | unique subset of `read\|grep\|write\|edit\|recall\|get` | the SPEC-side tool grant (`TOOL_MENU`, frozen; defaults to the full menu) — the drafted config cannot express mode or tools; `edit` (BA-13) is the anchored exact-once replace, judged by the SAME writeScope fence as `write`; requesting `run` (`LOCKED_TOOLS`) reds with the DISTINCT code `request-red` (locked-but-listed: the red IS the admission evidence the ledger tallies; a typo stays `invalid-value`) |
| `escalation` | `{ mode: "decision-ready" }` | the pain channel is not optional |

**The plan shape (Layer 2, design record 2026-07-21).** A job-v1 spec declares EITHER the
`steps[]` chain above OR the four-field plan shape — never both (`shape-conflict` red).
In the plan shape the AGENT authors the step plan at run time (gated by `validatePlan`);
the human signs only:

| field | shape | notes |
|---|---|---|
| `goal` | non-empty text | what the agent plans against |
| `verdictType` | `green` \| `soft-green` \| `hitl` | declared radio, never inferred (`VERDICT_TYPES`, frozen). v1 ADMITS only `green`; declaring `soft-green`/`hitl` reds `request-red` with the type as a structured `verb` field (declared-but-locked — the tool-menu pattern) |
| `close` | a close object (table below) | ONE close, the only truth; `green` demands a hard-class close (`close-hierarchy` red on a rubric/hitl close) |
| `checks` | optional array of `{ name, cmd, expect, judged?, gapKeep? }` | the operator-SIGNED named-check menu: the predicate-close body plus a kebab slug `name`, validated by the same rules, executed under the same runClose machinery. Plans reference them via the `check-passes(name)` exit; the agent can never author, edit, or compose one. **Checks decide nothing and mint nothing** — a check result is a progress gate and a gap source only |
| `tools` | optional unique subset of `TOOL_MENU` | the CEILING every plan step's grant must fit inside (defaults to the full menu); `run` reds `request-red` here exactly as on a step grant. On a legacy `steps[]` spec this field is an `invalid-value` red (steps grant tools per step) |

`steps[]` is co-existing scaffolding with a staged sunset: it archives alongside
config-v1 once the Layer 2 path proves itself in its battery — not before.

**Close types and the hierarchy** (a close is data, never code; verdict-class laundering
is a named red `close-hierarchy`):

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
| `steps[].exit` | 1..2 items (`MAX_EXITS_PER_STEP`), ALL must pass (AND-only, no OR/NOT) | closed menu (`EXIT_TYPES`): `artifact-written(path, pattern?)` · `tree-changed(scope)` · `json-valid(path)` · `check-passes(name)`. `check-passes` must name a SIGNED check (`check-unknown` red names the signed menu); on a write-granted step it must be paired with `tree-changed` (`exit-illegal` — the seed tree is green, a lone check would pass untouched, F17/F46). Exits verify FORM, not truth — progress gates; the operator's close stays the one arbiter |

Red vocabulary (all three validators): `parse-error`, `unknown-field`, `missing-required`,
`invalid-value`, `bounds`, `duplicate-id`, `close-type`, `close-hierarchy`,
`secret-literal`, `scope-escape`, `fence-invalid` (a malformed `jobWriteScope` fence — attributed to `jobWriteScope`, never the workflow config), `shape-conflict` (both job shapes declared),
`request-red` (locked-but-listed: a locked tool or verdictType — admission demand the
ledger tallies), plus the workflow-side verb reds (`verb-illegal`,
`verb-placement`, `verb-params`, `slot-overflow`) and the plan-side reds (`verb-escape`,
`exit-illegal`, `check-unknown`, `job-invalid` — a plan validated against a missing or
non-plan-shape job fails CLOSED). The `secret-literal` sweep is
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
whose exit code is truth (`runClose` is also exported); the red gap text feeds the next
iteration, tail-biased when bounded (400 head + 1500 tail — the assertion diff lives at
the end). **`cwd` is where the close RUNS, and it is load-bearing (F8):** a close is a
repository command (`npm test`, `make check`) and every one of them is cwd-relative — run
it anywhere but the workdir and the arbiter judges the wrong tree. `interpret`/`runJob`
always pass the workdir. **Corollary for job authors (F15/F28):** the gap bound keeps the
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
gap tells the worker which files it wrote and to fix or revert. `interpret` wires the seam
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

`scanSecrets(raw)` → `string[]` is the same module's text-side scan: every known
secret-shape match in a raw stream (a spine file, a close's output), `[]` when clean,
never throws. Use it instead of re-deriving a scan from `SECRET_PATTERNS` — detection
and redaction share ONE shape inventory, and a hand-rolled copy that misses a shape is
a leak on the very output it was guarding.

### `validateJob(input, { shellCapUsd? })` → `{ ok, reds, job }` — `src/job.js`

The operator-owned sibling (never an extension) of `validateConfig`: validates a
`job-v1` spec — see **All options** for the full schema, close types, and hierarchy.
Never throws on JSON text or plain parsed data (the ingest contract); returns the
parsed spec on ok, `null` on any red. Validates BOTH job shapes (legacy `steps[]` and
the Layer 2 plan shape — see the option tables above). Menus exported:
`CLOSE_TYPES`, `CLASSES`, `CLASS_BY_CLOSE`, `GOLD_COMPARE`, `CADENCE_UNITS`,
`PROVIDERS`, `CONDITION_KEYS`, `STEP_MODES`, `TOOL_MENU`, `LOCKED_TOOLS`,
`VERDICT_TYPES`, `LOCKED_VERDICTS`.

### `validatePlan(input, { job, maxStepRounds? })` → `{ ok, reds, plan }` — `src/plan.js`

The third validator: gates the AGENT-authored plan doc (`schema: "plan-v1"`) against the
SIGNED job spec before tokens burn — the ceiling, the fence, and the checks menu all come
from `job` (a missing or non-plan-shape job fails CLOSED, `job-invalid`). Never throws;
same `{ code, path, detail }` red shape as its siblings; `verb-escape` reds carry the
escaping verb as a structured `verb` field (the ledger keys on it). `maxStepRounds`
(default 40 — the shell's tool-mode per-attempt bound) ceilings every step's `rounds`.
Menus exported: `EXIT_TYPES`, `MAX_EXITS_PER_STEP`, `MAX_PLAN_STEPS`, `WRITE_VERBS`.

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
**tools** offers only the granted tools (`read|grep|write|edit|recall|get`) to the
worker's Loop, every call policy-checked against the SAME fence (tool-call paths resolve
exactly as the tools resolve them — workers must use absolute paths; a relative spelling
reds at the fence and the deny reason teaches the retry), reads pinned to the workdir, a
denial streak stopping as `gate-red`. `edit` maps to bare-agent's `shell_edit` (BA-13,
0.29.0): an anchored exact-once replace judged as bareguard's `edit` action under the same
writeScope — and the persona carries the strategy (prefer the edit verb; whole-file
rewrites are how trees get broken, F31). In tool mode there is no artifact to extract —
the close judges the tree; on-green `remember` retains the worker's change summary.
Worker-caused close crashes feed back as `worker-crash` gaps via the gate audit (F32 —
see `ralph` above).

**Layer R — the within-run ratchet (`layerRoot`, default `false`; design record
2026-07-19).** The shell mechanically detects fixation across attempts — consecutive
attempts that rewrote the same file(s) without moving the close's kept-failure set
(`closeGapKeep` lines, duration stamps stripped before comparing; without a gapKeep the
detector degrades to write-overlap alone and the spine event names the mode) — and
injects an escalating note into the next prompt: first a capped summary naming the
repeated files, then (if still stuck) the worker's OWN prior failed edit content
verbatim, scrubbed and capped with trims announced. Inert unless stuck; the worker
authors nothing and gains no verb. Two axes, deliberately separate (F43): the DETECTOR
reads INTENT (the gate audit's allow-set — an edit whose anchor missed is still the
worker reaching for that file again, and a tree-diff detector measured blind to exactly
that), while the NOTE's claims about file contents read OUTCOME (settled post-execution
through `Loop`'s `onToolResult`). So a repeat that never applied is told its anchor
missed, and only content actually in the file is ever described as having landed. Spine event `root-injected` carries
`{stage, mode, streak, paths, redSetSize}` — counts and paths only, NEVER content (the
spine is append-only). State dies with the run: this is within-run scratch, not
across-run memory. `layerRoot: true` (on `interpret` and `runJob`) is the ON/experimental
arm; the default is OFF. Status (F41): the ratchet is MEASURED inert on every current
job — two frozen probes + an archive sweep read 0 fixated pairs in 14 (the F21 repetition
disease was a broken-loop symptom, since cured). Because ON has therefore never won its
own A/B, it ships **OFF by default (decided 2026-07-21)** — armed and correct, but not
default-enabled until a stuck job (Layer 2, or a manufactured-fixation probe) shows ON
beats OFF. Flip the default to `true` the day that evidence lands; a `root-injected` event
on your spine (when you pass `layerRoot: true`) is a signal worth reading, not noise.

### `runJob(spec, { approvals, workdir, provider, nativeProvider?, emit, target?, capRuns?, shellCapUsd?, closeTimeoutMs?, execCmd?, layerRoot? })` → outcome — `src/run.js`

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
(defaults to real spawnSync). **The hitl step checks the fence first**: an
affirmatively-clean `git status --porcelain -- <fence>` means nothing changed, so there
is nothing for a human to review — `pr-skipped` + `step-end: already-green`, the job ends
`green`, no PR and no escalation (a cadenced no-op run is silent and free). A FAILED
check falls through to the PR path and reds there — an unknown fence state is never a
green. The PR step **hands the checkout back**: the starting branch is read before
anything moves and restored on every path; a failed restore is a loud `workdir-red`
naming the stranded branch (it never un-opens a real PR). Outcomes: `green | escalated | unapproved-spec | job-red |
smoke-red | config-red | pricing-red | provider-red | cap-halt | close-unsupported |
step-red:<id>` — `provider-red` is a transport throw from the drafting call, OR a worker
round the API cut off mid-generation (`truncated:max_tokens`, bare-agent 0.27.0/BA-6 —
before which it laundered into a clean finish, F25); in both cases no verdict exists and the
failed round's spend is only partly known (F6). `cap-halt` is drafting spend consuming the whole job budget before a
valid config existed. Both are decision-ready escalations with a terminal `job-end`:
the spine never dangles. **Every `job-end` carries the money, on every path**:
`{ outcome, spentUsd, spendComplete }` (plus `step`/`cause`/`detail` where the outcome has
them). `spentUsd` is the accumulated sum of PRICED rounds ONLY — never an estimate from
token counts or averages (cap-not-estimate) — and it is stated even on the pre-token reds,
where the honest figure is a real `0`. `spendComplete` says whether that figure is EXACT:
`false` means one or more rounds came back unpriced (F6), so `spentUsd` is a FLOOR
("at least $X", true total unknowable) and must not be read as a total. Both fields are
present on all outcomes, so a consumer never branches on field presence and never has to
launder a missing `spentUsd` into `$0`. A text-mode job invoked without `opts.target` is a `job-red`
before ANY provider call (and `interpret` itself throws a TypeError for direct
callers) — reds-before-tokens applies to the call, not just the spec.

**The plan flow (Layer 2).** A plan-shape spec routes through the SAME `runJob` entry —
same approval gate, same smoke, same metered ledger, same job-end money contract
(`job-start` carries `shape: 'plan'` + the goal instead of a steps list; no `opts.target`
needed — plan steps are tool-mode by construction). The flow (`runPlan`, also exported
for direct callers who own their own ledger): **close precheck** (`already-green` is a
DISTINCT zero-token outcome; a forbidden-zone verdict escalates before spend) → **checks
preflight** (every SIGNED check runs once at $0 — an unrunnable check is a `check-red`
stop before tokens, not a fault mid-plan) → **SCOUT** (read-only by construction: the
write verbs are not in its menu; hard-bounded rounds) → **PLAN** (the decompose call —
the planner never sees the repo, only the scout blob; drafted against a schema
description with check NAMES only; `validatePlan` gates it, one redraft with the reds
fed back, then `plan-red`) → **EXECUTE** (strictly sequential micro-loops: `ralph` with
the exit-evaluator judge; tree snapshots at step start; the gap names every failing
wall — mechanical genre, F46's measured mechanism; artifacts feed forward labeled by
step id) → **ONE replan**, triggered by exhaustion only (an instrument stop never
replans) → **the operator's close**, a red feeding ONE bounded fix loop judged by the
REAL close. `plan-executed` (the plan-as-executed record, design law #2) lands on the
spine on every path that executed steps. Additional outcomes: `already-green |
plan-red | check-red | close-red`. Worker prompts hold the v1.12 §5 contract
(mutation-proven): the absolute repo root, the step's action/target, prior artifacts,
the gap — NEVER the budget, the close command, a check's command, or the arbiter's books.

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

**Unpriced is never free (F6/F12):** the ledger meters **per ROUND** (`worker-round`, at
bare-agent's `onLlmResult` seam) — money is counted as it is spent, never at the end of an
attempt: a tool-mode attempt that HALTS never returns, so accounting its result event lost
the whole attempt's spend (a real run bought $1.4375 of tokens and the ledger reported
$0.0048). Any round whose cost is the honest null halts `pricing-red`, decision-ready; a
null never accumulates as $0, so the hard cap cannot be gamed by an unpriced provider path.
The drafting call is metered on its own priced path, and the shell **reserves a drafting
allowance** from the job budget (F9): the ceiling advertised to the drafter is
`(budgetUsd − reserve) ÷ predicate steps`, so a drafter that claims the ceiling it is given
always validates (the prompt and the validator must never enforce different numbers).

The **÷ steps** is F40: the config is drafted once and re-validated at every step against
what is LEFT, so a ceiling sized to the whole pot goes stale the moment step 1 spends and
the next step reds `bounds` on an unchanged config with money still available. A per-step
share still fits after its predecessors have spent (the shares sum to `budgetUsd − reserve`).
Single-predicate-step jobs are arithmetically unchanged. This is a DRAFTING bound, not an
enforcement one: cap-not-estimate is intact, and a step that genuinely needs more than its
share still cap-halts cleanly with a resume point rather than silently borrowing from the
steps after it.

**What the worker is told (tool mode):** the absolute repository root (F10 — bare-agent's
shell tools resolve relative paths against the PROCESS cwd, so a worker with no root is
blind), the close's CURRENT output as the tree's state (F13 — never framed as "your previous
attempt"; the `run` verb is locked, so the worker cannot see the failure any other way), and
the loop contract (F16 — it is ONE attempt inside `while close-red and under-cap` and will be
re-run with the close's verdict; without this a model one-shots and can eat the budget in
reads before ever writing). It is NOT allowed to read the run's own machinery (F14): the gate
audit, the smoke store and the litectx store are denied — the agent neither authors the
arbiter nor reads its books. N2 bounds (honest): `gold`/`rubric` closes refuse
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
