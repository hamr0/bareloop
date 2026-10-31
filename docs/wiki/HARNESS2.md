---
type: reference
title: "harness2 — what to learn from it, and the experiments"
status: draft
sources: [docs/wiki/FINDINGS.md, docs/product/PRD.md, docs/product/ITEM33-BUILD.md, docs/logs/2026-08-18-context-economy-package.md]
---

# harness2 — what to learn from it, and the experiments

**Status: DRAFT. Nothing is built. No experiment has run.** This page is the plan. It takes precedence over the parked rubric gaps (PRD.md:2080) once `fix/barebrowse-0250` ships.

Tags: [MEASURED] a number we measured and logged. [CODE] read in source today. [CLAIMED] said by someone else, not checked by us.

## 1. What harness2 is

Google Research's `harness2` (https://github.com/google-research/harness2), read from its README on 2026-10-28.

- It keeps model weights frozen and improves the system around the model. [CLAIMED]
- **Recursion 1, task level: Propose-Probe-Compose.** An editor proposes edits, a probe runs them on the same task, and a composer builds a refined harness "from behavioral contrasts between executions, without ground-truth feedback". [CLAIMED]
- **Recursion 2, harnessing level:** a persistent improvement harness is updated with "adopted harnesses and evidence-supported lessons", and guides later tasks. [CLAIMED]
- **Eight editable components:** system prompt, guardrails, memory, tool guidance, subagents, skills, scripts, plugins (a tool-call hook). [CLAIMED]
- **Reported gains:** up to 11.5 points on WorkBuddy-Bench, 4.5 on JobBench, 11.8 percentage points on LAB partial pass. [CLAIMED]
- **What the README does not say:** how a contrast becomes a keep or drop decision. Scoring is a separate, later judge step. No per-task cost is given (it says only that runs "incur API costs"). [CLAIMED]
- **Its own warnings:** "Executor network access is unrestricted, and Codex runs with its sandbox disabled"; "Public benchmark rubrics may be accessible online". [CLAIMED]
- An example from a video summary hamr pasted (not the README): a harness wrote a trace-every-figure guardrail, a reopen-and-check script and a reconciliation skill. [CLAIMED]

## 2. Where bareloop already agrees

- **The agent authors its workflow.** It writes a constrained declaration, never code (CLAUDE.md "bareloop doctrine" via PRD.md:46-48, law 1; `closeDecl` in bareloop.context.md:182). [CODE]
- **The run loops.** A step has a strike ladder; two strikes force a replan (workflow-governance.md; PRD.md:1975 for where hints go). [CODE]
- **Lessons carry across runs.** The learnings ledger keeps every row; memory filters at read time; hints go to the planner at draft and the first replan (PRD.md:1975, 1990-1995; bareloop.context.md:3935). [CODE]
- **Whole plans carry across runs.** Reuse ships the signed plan verbatim; a bridge is minted only by a green (bareloop.context.md:94, 8; PRD.md:56-57 law 2 "run-as-executed"). [CODE]

## 3. Where bareloop differs, and must keep differing

harness2's composer works "without ground-truth feedback". bareloop does the opposite, by law.

- **Only the close is truth.** A step passing its own check is never a verdict. No self-judged keep or drop. (PRD.md:44-68 laws 3 and 8.)
- **The agent never authors its arbiter.** Budgets, caps, verdicts, the fence, merge live outside the emergent part, permanently. (PRD.md:46-47 law 1; CLAUDE.md hard lines.)
- **`run` stays LOCKED forever.** A worker that can run commands can run its own close (bareloop.context.md:198). [CODE] This is harness2's `scripts`.
- **No agent-picked thresholds.** A budget or threshold number is never picked by the agent from a small sample. (CLAUDE.md hard lines: "No self-adjusted budgets".)
- **Our own evidence against AI-written lessons** [MEASURED]. Learnings POCs, 2026-10-22/23: AI writing the facts made up 7 of 42 (POC-B) and 17 of 36 (POC-B2); AI folding the facts was right 75% and 67% (POC-D, D2); all failed their frozen rules. A code-only fold (same job, same check, shared error kind, Jaccard >= 60%) passed the hand-check 10 of 10 (POC-E2). The AI "invents the fix when it sees changed files but not the diff". Sources: docs/product/ITEM33-BUILD.md:2297-2314; PRD.md:1990. Honest limit, same file: E2 is a fit on known cards, not proof on unseen ones.
- **Windows into harness2's risk:** its executor runs with network open and sandbox off. bareloop's local-trust model is not a sandbox either (close-verdicts.md section 2), but its worker is fenced by the gate.

### The eight components mapped

| harness2 component | bareloop today | Allowed to the agent? | Owner |
|---|---|---|---|
| system prompt | Persona + strategy lines, assembled per grant (`PERSONA_TOOLS + strategyFor(granted)`, src/planrun.js:2590; registry src/promptregisters.js:72-86) [CODE] | No. The drafter writes the goal and steps; persona text is code. | bareloop code, changed by a committed edit |
| guardrails | Mandatory guard battery, shown-and-fixed, signed (close-verdicts.md section 2) [CODE] | **Never.** Arbiter territory. | hamr signs |
| memory | `stash`/`remember`/`forget` verbs (src/job.js:76); learnings ledger (src/learn.js, src/learnstore.js) [CODE] | The worker may `remember`; the ledger is written by code only. | code (ledger); worker (notes) |
| tool guidance | Fixed strategy sentences per granted verb (src/tools.js:71, 81, 163) [CODE] | No. Fixed text, never learned from runs. | bareloop code |
| subagents | None. | Not today. | n/a (a new verb would be a new signed spec) |
| skills | None as a concept. Reuse replays a whole signed plan. | Not today. | n/a |
| scripts | `run` verb, LOCKED (bareloop.context.md:198) | **Never.** | permanently locked |
| plugins (tool-call hook) | bareguard `Gate` wraps every tool call (CLAUDE.md, src/planrun.js:20) | **Never.** The hook is the arbiter's fence. | bareguard |

## 4. The gap: tool guidance

hamr's reading: tool guidance today is "willy nilly". The record agrees that the worker's tool habits are costly and are not shaped by what past runs learned.

### How tool guidance is given today [CODE]

- One fixed sentence set per granted verb, built by `strategyFor(granted)` (src/tools.js:163). It names only tools the grant has (F19 inverted, src/tools.js:129-141).
- `RETRIEVAL_STRATEGY`: "do NOT read its whole file: call ctx_recall ... then ctx_get" (src/tools.js:71-76).
- `EDIT_STRATEGY`: prefer the edit tool over whole-file writes (src/tools.js:81-82).
- Read-shim line: `READ_SHIM_STRATEGY` (src/readshim.js:119); native-surface line `NATIVE_READ_STRATEGY` (src/planrun.js:269).
- Learnings hints reach the planner only, never the worker (PRD.md:1975; bareloop.context.md:3935). **Nothing learned from a run changes these sentences.**

### Measured evidence

- **Selection problem.** `ctx_recall` returns zero zero-hit results across 2,324 calls, yet an explicit tool declaration includes a litectx verb only 1.4% of the time (2 of 148), against `read` at 99.3%. [MEASURED] providers-context.md:87; docs/logs/2026-08-18-context-economy-package.md:131; F107 (FINDINGS.md:8853). The 99.3% figure is quoted as "standing" in these places; I found no table that derives it. Treat it as quoted, not re-derived.
- **Re-reads.** 48% of reads re-read a file with nothing changed; one file was read 52 times in one run (~1.6M tokens). [MEASURED] FINDINGS.md:8311 (F107). A later call-level figure: median 56% exact-repeat share among read-class calls, 155/217 runs with gate audit, measured before the shim default (FINDINGS.md:~9996-10004, same addendum).
- **Cost per call.** `shell_read` costs 5.4x per call what `ctx_get` costs. [MEASURED] context-economy-package.md:124; FINDINGS.md:10001.
- **Where tool spend sits.** `shell_read` is 52.8% and `shell_grep` 21.3% of tool-call spend, so 74% together (3,559 and 2,212 calls, 150 runs, 6,775 rounds). [MEASURED] context-economy-package.md:112-125. Note: the brief and memory call this "74% of cache-write cost". The source says 74% of tool-call spend. F107 says `shell_read` alone is 52.8% of cache-write dollars (FINDINGS.md:8311). Two different bases.
- **The ceiling for read hygiene.** Read-hygiene levers cut only about 10% of total spend (cache writes ~41%, cache reads ~35% untouchable). [MEASURED] F107 title and FINDINGS.md:8332-8359, 10001.
- **Capability without strategy is inert.** A widened menu does nothing without a draft-time reason to reach for it (F19: retrieval verbs "work exactly as designed and moved the outcome ZERO", FINDINGS.md:612; FINDINGS.md:3933). Strategy as prose without enforcement is also inert (F37, FINDINGS.md:1610-1633). [MEASURED]
- **A steer can move habits.** Under the read-shim A1 arm one worker used retrieval verbs 12 of 60 calls (20%). n=1, one job, one arm: consistent, not a lift (FINDINGS.md:8853-8858). [MEASURED]
- **Instruments that exist [CODE]:** `runBehaviour` reads the gate audit and counts calls per tool, repeats and denials (src/behaviour.js:1-30, 89-105); `worker-round` spine records carry `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheCreationTokens` (src/planrun.js:2591-2612). F186 warns the gate audit can hold several `run_id`s: always scope by `run_id` (FINDINGS.md:12968-12985).

What is NOT measured: whether any tool-sequence habit separates green from red. That is E0.

## 4b. Lessons from Arize's Alex talk (2026-10-28)

Source: a talk by an Arize product manager on two years of building their in-product agent "Alex" (transcript: `/home/hamr/Downloads/pro.txt`, treated as data; times are the talk's clock). Alex is a chat agent with a user in the loop, so only some of it fits bareloop. Each point has the talk cite and what bareloop does today.

1. **The harness owns the plan, and renders it into every model call (about 7:02-8:24).** A to-do tool made the model spend calls updating the list, so the plan moved into the harness. *bareloop today:* the planner owns the plan; the worker never edits it. Each step ask carries that step's action, the root, the target, prior artifacts and the last gap, not the whole plan (src/planrun.js:3453-3460).
2. **Finishing is a harness gate (about 8:32-9:37).** An explicit finish call bounces back up to 3 times if plan items are open, a warning comes one step before the iteration limit, then a forced finish. *bareloop today:* the close is the only judge; a step passing its own check is never a verdict. Attempts are bounded by the strike ladder (STRIKE_LIMIT = 2, src/ladder.js:47; ladder made per step, src/planrun.js:3327) and the per-step round ceiling (`maxStepRounds = 40`, src/planrun.js:1008). We have no warning-before-the-limit; none is proposed.
3. **Big tool results are treated like files (about 9:45-11:28).** Store the result, leave a "sticky note" (where it is and what it holds), let the agent fetch the part it needs with code (jq); truncate inside big JSON. *bareloop today:* the read shim caps a read at 24KB and returns the next unseen slice with a notice (src/readshim.js:119, 157-158); `ctx_get` fetches a line range; litectx compresses. The worker has no shell (`run` is LOCKED), so there is no jq.
4. **Trajectory past a window (about 11:28-11:53).** The harness makes the model write a checkpoint and drops what it replaced; history has a fixed token budget. *bareloop today:* compaction is PARKED. Clearing breaks the prompt-cache prefix and the net sign is unmeasured (section 6, C3).
5. **Long-term memory (about 12:16-13:32).** One markdown file per user, capped at 8,000 characters, written by a background job after the session, loaded on every request. It beat vector retrieval, episodic and semantic stores, and temporal knowledge graphs. A human can audit it. *bareloop today:* the learnings ledger is written by code and read only by the planner (src/planrun.js:3091). The E1 HANDOFF arm is the same shape for workers: one small code-written file. This supports keeping C2 small and plain.
6. **Specialists became one agent loading skills and tools on demand (about 13:32-14:12).** *bareloop today:* one worker per step, with the menu fixed by the signed spec. C4 (SkillRegistry) is the nearest idea (section 6).
7. **Default to a fast, good-enough model; spend the effort on the harness (about 14:12-15:21).** Some surfaces need no loop, just one model call. *bareloop today:* deepseek-flash is the settled secondary provider; the fit check and the page map are single calls.
8. **Production sessions become regression tests (about 15:21-17:30).** Agent bugs show as soft signals, for example 43 identical tool calls in one turn, or latency, not as errors. *bareloop today:* E0 and E0b read archived gate audits for exactly this; `runBehaviour` already counts repeats (src/behaviour.js:1-30). Repeat-call detection at source is an idea, not built.
9. **What still needs a human (about 17:36-18:24).** Gold labels for judges; speed-versus-quality calls. *bareloop today:* the calibration set is signed by the person; merge stays human forever.
10. **What survived every rebuild (about 18:24-19:04).** Tracing, math and data in code, golden sets in CI, skills. *bareloop today:* the spine and gate audit are the trace; code decides and the AI only labels; tests read tracked fixtures.

### What we take

- (a) A pointer or map instead of a bare "you already hold it". Today the shim says only that the file is unchanged and the worker holds all N bytes (src/readshim.js:162-163). Candidate wording: say where it is and what it holds.
- (b) One small code-written handoff file between fresh workers (E1 HANDOFF arm). The $0 replay sized it at a median of about 1,500 characters for the code job and about 250 for the rubric job; the 8,000 cap never bit (source `.claude/scratch/e1-poc/PHASE1.md`, untracked). That is size only; whether it saves reads is unmeasured.
- (c) Catch repeated identical tool calls at the source, not by rewriting history, because rewriting history costs the cache prefix.
- (d) Keep memory plain and small.

### What we do not take

- jq or a shell for the worker (`run` stays LOCKED).
- Model-written checkpoints that drop history (parked; cache cost).
- Agent-written memory (the learnings POCs showed the AI invents fixes; code writes it).

## 4c. Lessons from an Arize post on tool selection (2026-10-29)

Source: https://arize.com/blog/ai-agent-tool-selection-decision-tracing/ (October 2026). A vendor post on one small demo. [CLAIMED] None of it is checked by us.

What it says:
- A separate router model gives a probability for each tool. It is used only above confidence 0.7; below that, the chat model picks as usual.
- Each pick is logged as a DECISION span that lists all the options, not only the one taken.
- Results on their 5-tool demo, 100 messages, 3 runs: the right first tool was picked 78% as built, 95% when forced, 91% when gated. Forced gave 21 empty replies; gated gave 3.

What we take:
- Tool choice is fixed by structure, not by wording. That matches H1: a hint (wording) did not move the pick (section 9 H1).
- The "decision tracing" idea: log what a pick could have been (the tools on offer, and which fit), so a wrong pick can be read afterwards. Not built; an idea only.

What we do not take:
- An AI router on every turn. It adds a model call per turn. Code decides, not the AI.

## 5. Experiments (one lever at a time)

hamr ruled on the interview questions on 2026-10-28 (section 7); ruled numbers are stated below. Where a number still says "hamr sets", nothing was ruled yet. Provider for every paid run: DeepSeek, `deepseek-flash`. Freeze rules are committed before any number exists (PRD design practice; BATTERY-PREREG precedent: docs/logs/BENCH-PREREG.md).

### E0 — $0 archive read (FIRST, mandatory before any paid run)

- **Question.** In archived runs, which tool habits cost money, and which precede greens versus reds?
- **Riskiest assumption.** That habits are readable at all from what was recorded. The gate audit may be missing for older runs, may mix `run_id`s (F186), and the read-shim arm leaves no spine footprint (arm known only from driver log or battery results).
- **Design.** Read-only pass over archived spines and gate-audit sidecars. Per run: tool counts by class (`shell_read`, `shell_grep`, `ctx_recall`, `ctx_get`, `ctx_recent`, `edit`), exact-repeat reads, read-after-own-edit, tool sequence before the first green versus before each red, cost by tool class.
- **Instrument.** Gate-audit rows `{run_id, phase, action:{type, args:{tool}}, decision}` (src/behaviour.js:8-17), scoped by `run_id`; spine `worker-round` rounds with the four token fields; `judge-round` and `worker-turn` rounds counted too (a slicer that omits a spending round type undercounts). Exclude `worker-result` echoes from any spend denominator.
- **Corpus audit.** Segment by genre, by provider and model, and by shim arm before any aggregate. Never pool providers. State how many runs have a gate audit at all. A single-genre corpus cannot falsify a general claim.
- **Arms.** None. Descriptive.
- **Freeze rules.** Write the habit definitions and the green/red split in a prereg doc and commit it before the first run is read. Habit order ruled 2026-10-28: re-reads first (a file read again with nothing changed), read over recall second.
- **Pass rule.** E0 passes if it yields at least one habit that (a) costs a measurable share of spend in a segment with enough runs and (b) differs between green and red runs in the same segment. Segment size threshold: 10 runs per segment (same genre, same provider and model), ruled 2026-10-28; a segment with fewer than 10 runs is reported as "too few", never read. Otherwise E1 is not justified and the result is the stop.
- **Stop rule.** If a segment has fewer than 10 runs with an audit, that segment is "too few"; if no segment reaches 10, stop and report the gap.
- **Provider / cap.** $0. No model call.
- **Output.** A list: habits that cost money; habits that precede greens; which segment each claim covers.
- **Frozen:** `docs/logs/E0-PREREG.md`, commit 9e1e9a88f97e6be4d878dc8fb6198fec62e5ac1e, sha256 0e935b084c153d001939c15d5112195ed252a2a0478bf676635b87df7b2b3f8a.
- **Result (2026-10-28): see F253.** PASS on both DeepSeek segments (TYPES 18.1% of spend, TEXT 25.1%), but it counted reads across fresh workers; E0b corrects that.

### E0b — same worker vs new worker ($0 archive read)

- **Question.** How much of E0's re-read cost is one worker repeating itself, and how much is a new worker re-reading what an earlier worker read?
- **Frozen:** `docs/logs/E0B-PREREG.md`, commit 8dcd691, sha256 74f40398794277c30d2b53f1aac5d60b50706c159b4a6764a44faf1f38ff08f7.
- **Result (2026-10-28): see F253.** Same-worker vs new-worker share of spend: TYPES 2.2% / 15.9%, TEXT 11.3% / 13.8% (estimated). Verdict PASS on TEXT only, by 0.4 points; TYPES fails. This is why E1 got a handoff arm: most of the mass was new workers.

### E1 — tool guidance learned from run records (paid, only if E0 earns it)

- **Question.** Does a worker-facing tool hint, written by code from past run records, lower cost-to-green or shift the tool mix?
- **Riskiest assumption.** That a delivered hint is acted on. F19 and F37 say prose alone is inert. So delivery and conversion are measured separately.
- **Design.** Code only writes the hint, from a CLOSED list of hint kinds. A hint names only the tool and a count, never a file name (ruled 2026-10-28; a file name edges toward naming the culprit): for example "you re-read files N times; use ctx_get". The hint goes to the worker only, not the planner's step grants (ruled; one lever at a time). AI writes nothing, per the learnings POCs (section 3). Hint rides the worker persona as one more declared information channel (PRD law 5: a channel change is a lineage-key dimension, so it must be a declared job condition and enter the hash). Ruled 2026-10-28: the hint ON/OFF switch enters the signed hash, like learningHints; the hint TEXT does not (it changes per run and would split one job into many). I did not re-check here how learningHints is hashed today.
- **Instrument.** Per arm: `worker-round` tokens and cost, gate-audit tool mix, repeat share, cost-to-green, tries-to-green. Delivery = hint text present in the worker prompt (a new report-only spine record, as the memory-cache record is). Conversion = the hinted tool's share of calls after delivery versus before.
- **Arms.** ON (hint delivered) versus OFF (identical job, no hint). One lever only; read shim state is held fixed and recorded.
- **Patients / jobs.** Ruled 2026-10-28: jobs are chosen AFTER E0, from jobs where re-reads really happen on DeepSeek. The read-shim setting is held fixed and recorded. `aurora-testgen-cold` (G2 negative row) is out: it says nothing about cost. The frozen bench rows are not required; earlier candidates were `aurora-u-spawner-types` and `litectx-u-types` (docs/logs/BENCH-PREREG.md:25-29). A job where the habit never occurs cannot test the hint.
- **Freeze rules.** Hint kinds, jobs, arms, the decision rule and the sha256 of the prereg file committed before any run. Frozen rules never loosen after data.
- **Pass rule (ruled 2026-10-28).** Both arms green on the same jobs, ON at least 20% cheaper to green, and conversion shown. A result inside the noise band, or backwards, closes the lever with no default flip.
- **Power, stated before data.** n=1 per job per arm is an anecdote either way. At n=1 the experiment can show only that delivery and conversion happen, not a lift. Ruled: 3 runs per job per arm (ON and OFF), which is enough to read a cost gap but still small; with a nondeterministic worker the base rate comes first.
- **Stop rule.** A provider-red row is a casualty, not evidence. A repeating casualty class stops the battery and re-probes the provider. Any red at a lower cap that greens at a higher cap is a question about the ceiling, never a pass.
- **Provider.** DeepSeek `deepseek-flash`. Name provider and model in the first line of the proposal.
- **Cap.** $1 per run, $10 total (ruled 2026-10-28). A cap must fund the attempt plus its close; a red at $1 that would green higher is a question about the ceiling, never a pass.
- **Arbiter note.** The hint changes only what the worker is told. Budgets, closes and verdicts are untouched; E1 never edits them.
- **Result (2026-10-28): see F253.** 36 runs (3 jobs x 4 arms x 3), $4.72 booked, DeepSeek `deepseek-flash`.
  - Frozen rule: 8 of 9 cells FAIL; 1 PASS (change2 BOTH, 24.2%, 3.4 vs 4.5 cents) is luck-sized.
  - Proven: the handoff cuts new-worker re-reads about 60% (105 vs 272 Kind B reads in step and fix asks, 18 runs each).
  - Not proven: any turn, token or cost win at n=3; cache reads are 85 to 93% of tokens, so read hygiene barely moves the total.
  - Side finding: 5 of 36 runs died at plan validation on drafter exit errors, not caused by the arms (F254).

### E2 and later (only if E1 earns it; each its own frozen POC)

| Lever | What bareloop already has | Riskiest assumption |
|---|---|---|
| memory / learnings reaching the worker | Learnings reach the planner only (PRD.md:1975); the worker may not read the arbiter's books | A worker given a lesson uses it. Also: a hint must never carry the culprit (the close must never name it). |
| skills | Reuse replays a whole signed plan; no per-skill unit | A reusable sub-procedure exists that is smaller than a whole plan and still verifiable. Adding one is a new signed spec version. |
| subagents | None | A second worker beats one worker on cost-to-green. New verb = new signed spec; money and wall must still be one cap. |
| system-prompt edits | Persona text is code | A prompt edit learned from runs beats the fixed text. Dead-weight risk: unconditional per-run prompt cost. |
| **guardrails** | Mandatory battery, signed | **OUT by law.** Arbiter territory. |
| **plugins (tool-call hook)** | bareguard Gate | **OUT by law.** |
| **scripts** | `run` locked | **OUT by law.** |

## 6. Candidates after tool guidance

hamr's goal behind E0/E1: expose MORE of our own bare-suite primitives to the worker and planner, and see how each works. Tool guidance goes first (section 5). Each candidate below is its own frozen POC, run only after E1 reports, one lever at a time. Every cap, n and pass margin is "hamr sets". Order kept by hamr 2026-10-28, with C1 dropped: C2 is now first after E1, then C3 to C6.

### 6.1 What the packages actually export (read from node_modules, installed versions)

Read from each `package.json` "exports" and the entry file on 2026-10-28, not from a README or a file count. [CODE]

- **litectx 0.32.0** (package.json exports "." -> src/index.js). Classes and consts: `LiteCtx`, `ScopedView`, `Store`, `Embedder`, `StalePointerError`, `RipgrepMissingError`, `KINDS` = code/doc/fact/episode, `WRITE_KINDS` = fact/episode/doc (src/index.js:94,104), `PRIMITIVES`, `VERBS_BY_PRIMITIVE`, `ContextGraph`/`observe`, `compress`/`COMPRESS_LEVELS`, `assemble`/`summaryWindow`/`trim`, `liteCtxAsStore`, `WriteAudit`/`toWriteAction`/`WriteDeniedError`, `splitIdent`/`keywords`/`ftsMatch`, `cosine`. `LiteCtx` methods: `index`, `recall`, `impact`, `getNode`, `related`, `get`, `remember`, `forget`, `ingest`, `purge`, `stash`, `peek`, `evict`, `reviewCandidates`, `promotionCandidates`, `recentActivity`, `recentMemory`, `enumerate`, `scoped`, `size`, `count`, `close` (src/index.js:249-1491). Config includes `embeddings` (default false), `embedWeight`, `embedModel`, `embedder`, `owner`, `session` (src/index.js:154-159, 276-282).
- **bare-agent 0.52.0** (exports "." plus ./errors ./providers ./stores ./transports ./tools ./mcp ./bareguard). Root index exports `Loop`, `Planner`, `Evaluator`, `refine`, `recurse`, `buildSearchTool`/`buildExactTool`/`buildScanTool`/`litectxCorpus` (src/recurse-retrieval.js), `remember`, `judge`/`calibrate`/`calibrateJev`, `SkillRegistry`, `createStashSkill`, `StateMachine`, `Scheduler`, `Checkpoint`, `Memory`, `Stream`, `Retry`, `runPlan`, `CircuitBreaker`, `wireGate`, unit helpers, errors incl. `HaltError` (index.js:51-90). `./tools` exports `createBrowsingTools`, `createMobileTools`, `createShellTools`, `createSpawnTool`, `spawnChild`, `createDeferTool`, `readDeferQueue`, `liteCtxMcpBridgeConfig` (src/tools.js:10-19). bareloop imports only `Loop`, `wireGate`, `HaltError`, providers and `createShellTools` today (grep of src/: authorscout.js:62-63, text.js:15, others).
- **bareguard 0.27.0** (exports ".", "./types", "./primitives.json"). `Gate`, `routeAnnotation`, `addToGates`, `redact`, `SAFE_DEFAULT_DENY_PATTERNS`/`ASK_PATTERNS`, `classifyCommand` and pattern sets, `BudgetUnavailableError`, `defaultAuditPath`, glob helpers, and the rubric set `createRubric`, `rubricSha`, `tableSha`, `checkStep`, `renderGaps`, `quoteIn`, `numbersInQuote`, `rubricVocabulary` (src/index.js:37-61). All arbiter-side. None is a worker tool.
- **barebrowse 0.25.0** (exports "." and "./bareagent"). `browse`, `connect`, `resolveEngine`, `applyBlocklist`, `isChallengePage` (src/index.js); `createBrowseTools` (src/bareagent.js:41) is the worker-tool adapter. bareloop uses `connect` only, at drafting and at run start; "the worker never browses" (CLAUDE.md).

### 6.2 What bareloop wires today, and what is unused

- **Where `LiteCtx` is built:** `new LiteCtx({ root })` with NO other option: src/planrun.js:2196, src/run.js:51, src/authorscout.js:338. So `embeddings` is off everywhere. [CODE] The index is built with `lc.index({ yield: true })` (src/planrun.js:2568; src/authorscout.js:339).
- **Verbs the worker can be granted** (TOOL_MENU, 14, src/job.js:76): `read grep write edit recall get impact related recent compress peek stash remember forget`. `ctx_recall` calls `recall(kind:'code')` AND `recall(kind:'fact', body:true)` (src/tools.js:291-298); `get`, `impact`, `related`, `recentActivity`, `stash`, `peek`, `remember` (kind fact, by agent) and `forget` are wired (src/tools.js:334-601). `compress` is in the menu with a strategy line (src/tools.js:121, 191).
- **Strategy lines per verb:** `RETRIEVAL_STRATEGY` (src/tools.js:71), `EDIT_STRATEGY` (src/tools.js:81), compress line (src/tools.js:191), read-shim lines (src/readshim.js:119, 157). `strategyFor(granted)` (src/tools.js:163) makes each sentence ride only with a verb in the grant (F19 inverted, src/tools.js:129-141).
- **Unused from litectx** [CODE, by grep of src/]: the `episode` kind (no bareloop source writes or recalls it; the only `episode` hits in src/ are comments); `promotionCandidates`, `reviewCandidates`, `recentMemory`, `enumerate`, `ingest`, `scoped`, `purge`, `evict`; `assemble`/`summaryWindow`/`trim`; `liteCtxAsStore`; and the `embeddings` tier. Facts are reachable only through `ctx_recall`/`ctx_remember` and only if the worker writes them itself; nothing in a run seeds the fact store from earlier runs.
- **Unused from bare-agent:** `SkillRegistry`, `createSpawnTool`/`spawnChild`, `createDeferTool`, `Memory`, `Checkpoint`, `refine`/`recurse`, `buildSearchTool`/`ExactTool`/`ScanTool`, `createBrowsingTools`. (I read these export names and the SkillRegistry header; I did not read the recurse tools' bodies.)

### 6.3 Our own evidence on litectx (cite when designing)

- Embeddings only re-rank a BM25-gated pool for `code` hits; KNN nomination is `fact`/`episode` only (FINDINGS.md:659-660). [MEASURED]
- Flipping `embeddings` on an EXISTING index computes no vectors; a rebuild is required or the semantic tier stays silently inert (FINDINGS.md:649). [MEASURED]
- `impact()` without ripgrep silently read 0 callers (litectx upstream ask LC-5). Fixed upstream in 0.32.0: it now throws `RipgrepMissingError` (node_modules/litectx/CHANGELOG.md:9-20). Whether bareloop catches that throw in `ctx_impact` (src/tools.js:388) is not checked here.
- Store-class verbs (`stash`/`remember`/`forget`) are not read-capable, are excluded from the scout, and never count as tree writes (PRD doctrine, MEMORY.md "bareloop doctrine"). [CODE/MEASURED per memory; I did not re-open the code line]
- Selection problem: recall drafted 1.4% vs read 99.3%; recall has zero zero-hit results (section 4).
- Retrieval is navigation, never gifts: hook recall rarely carries the culprit; good lookups are worker-initiated from the failing symbol name (project memory, FINDINGS family around F19/F107).
- **Is the newer indexing better? No evidence in this repo.** The litectx changelog for 0.30-0.32 lists warm-index, index-format stamp and rebuild fixes (CHANGELOG.md:7-117), not a ranking gain I could confirm. bareloop's last recorded recall-quality finding was taken at litectx 0.30.x (FINDINGS.md:2974). Measuring the current index is therefore part of C1.

### 6.4 Doctrine every candidate must respect

- **Menu is inventory:** an offered verb must map to an existing implementation (FINDINGS.md around 2974-2990; src/tools.js:86-92).
- **The agent never widens its own menu.** A new verb is a new signed spec version hamr signs (`tools` is hashed; a `TOOL_MENU` widening flips an omitted-tools spec's hash, bareloop.context.md:184).
- **Capability without strategy is inert** (F19, FINDINGS.md:612). A granted verb ships with a when-to-use line; strategy without enforcement is also inert (F37, FINDINGS.md:1610-1633).
- **`run` stays LOCKED** (bareloop.context.md:198), so `createSpawnTool`/shell-like power is not offered.
- **G1:** a step granting `read` must also grant `recall` and `get` (docs/logs/2026-08-18-context-economy-package.md:145).
- **The worker never reads the arbiter's books** (gate audit, spine, `.smoke`): `fs.deny` in readScope. Anything written into the worker-visible fact store must not contain arbiter output (attempt-diff, close lines naming the culprit).
- **Every information path into the worker is a declared job condition** (PRD.md law 5): each candidate's channel enters the lineage key.

### 6.5 Candidates, in my recommended order

Fields common to all: provider DeepSeek `deepseek-flash` for any paid arm; ON/OFF with everything else held fixed; freeze rules committed before any number; `$0` pre-step first; n=1 per cell is an anecdote; a result inside the noise band closes the lever with no default flip.

**C1 — litectx embeddings ON for `ctx_recall` (rank-only). DROPPED 2026-10-28 (hamr: BM25 default indexing is enough, no embedding needed).**
Record of the dropped text follows. hamr's note, verbatim: "litectx default indexing and bm25 is really helpful to narrow down what agent needs to grep, no embedding needed". Also ruled: bareloop never adds `@huggingface/transformers`; litectx 0.32.0 lists it as an OPTIONAL peer dependency (peerDependenciesMeta, read from node_modules/litectx/package.json today) and it is not installed.
Reason: no new verb, no new spec surface, reuses a granted verb, and it tests hamr's "indexing improved" claim directly with a $0 first step.
- Question. Does the current index, with and without embeddings, find the right function for the queries workers actually make?
- Riskiest assumption. That a better ranker changes behaviour, when selection (1.4%) and not retrieval quality is the measured gap. Embeddings also cannot nominate code hits (FINDINGS.md:659).
- Design. Step 1, $0: take recall queries from archived gate audits (`action.args.tool = ctx_recall`) and the file the worker then read or edited; replay against a fresh index, `embeddings` false vs true, rebuilt (not flipped, FINDINGS.md:649). Report hit-rank of the later-edited path. Step 2, paid, only if step 1 shows a rank gain: ON/OFF on the E1 job set.
- Instrument. Rank of the first later-used path in the recall result; per-run `ctx_recall` and `ctx_get` share (gate audit); `worker-round` cost fields. Embeddings load a model (default Xenova/all-MiniLM-L6-v2, src/index.js:158): measure index time and install weight too, and check it against the dependency budget.
- Arms. embeddings false vs true, same repo copy, index rebuilt in both.
- Freeze. Query set, success definition and arms committed before replay.
- Pass / stop. Pass: rank gain in the $0 step on queries from at least two genres. Stop: no gain at $0 means no paid run. Cap: hamr sets.

**C2 — seed the fact store from earlier runs (facts reach the worker). FIRST after E1. DRAFT SPEC (hamr 2026-10-28: spec it now; no build or run before E0 and E1 report and a POC passes).**
Reason: it is the real unused litectx capability and the direct answer to "learnings reach the planner only", but it touches the arbiter-adjacent boundary, so it comes after tool guidance.
- Question. Does a worker that can recall code-written lessons from past runs reach green cheaper?
- Riskiest assumption. That a lesson is acted on once recalled (conversion), and that no recalled text leaks the arbiter's books or names the culprit. Learnings are code-written only (PRD.md:1990); AI-written facts failed (section 3).
- Design. Code writes `kind:'fact'` notes into the run's store from the learnings ledger. The worker finds them through the existing `ctx_recall` fact path.
  - Fact path today [CODE]: `ctx_recall` runs `lc.recall(q, { kind: 'fact', n: cap, body: true })` and returns each note inline as `memory\t<id>\t<body>`, body cut at 400 chars (recall at src/tools.js:298, output line at src/tools.js:304). The worker has no verb that dereferences a memory id, so a seeded note must carry its whole lesson inside 400 chars. A worker-written note is capped at 65536 bytes (ISOLATE_MAX_BYTES, src/tools.js:111).
  - Write API [CODE]: `lc.remember(id, text, { kind, by, scope, meta, expiresAt })`; `kind` defaults to `fact`, `by` is `"human"` or `"agent"` only (node_modules/litectx/src/index.js:1023-1029). Re-remembering the same id and scope replaces the row (index.js:999 area). `meta` is stored but never searched or ranked (index.js:1014 area), so it cannot carry a "seeded by code" flag the worker could rank on.
  - Only call site today [CODE]: the worker's own `ctx_remember` verb, `lc.remember(key, body, { kind: 'fact', by: 'agent' })` (src/tools.js:584). Nothing seeds the store from a ledger.
  - Source fields [CODE]: the learnings card has job, check, kind FIXED/NEVER_FIXED, goal, stepId, stepAction, meaning, said (up to 3 lines), kinds (error kinds), files, symbol, tokens, nextCheck, ended, fixTouched, whatChanged (src/learn.js:200-222). The seeded note would be built from a closed subset only.
  - `by:` limit: litectx accepts only `human` or `agent`, so a distinct tag such as "code-seeded" is not possible in `by`. A marker would go in the note id prefix (open choice below).
  - Episodes (`kind:'episode'`) are a second step, only if facts help.
- Instrument. Recalled-note ids per run (the `ctx-tool` spine record already carries `notes` count and `paths` for `ctx_recall`, src/tools.js:307); cost and tries to green; delivery (a seeded note appeared in a recall result) versus conversion (a later action followed the note's tool or check kind).
- Arms. Seeded versus empty fact store; learnings hints to the planner held fixed and recorded; read-shim state held fixed and recorded.
- Freeze rules. Card-to-note template, note id scheme, jobs, arms, decision rule and the sha256 of the prereg file committed before any run. The seed switch enters the signed hash (new channel, PRD law 5); note text does not (same reasoning as the E1 hint ruling). Frozen rules never loosen.
- Leak rule (from ruling 3). A seeded note must not name a file: tool, check, error kind and count only, unless hamr rules otherwise. Never include `said` lines, `files`, `fixTouched`, `whatChanged` or `symbol` verbatim; these can name the culprit and attempt-diff is arbiter output (section 6.4).
- Pass / stop. Pass: delivery and conversion shown, and ON at least no costlier at equal green. Stop on any note found to carry a culprit file name, or any arbiter output. A provider-red is a casualty, not evidence.
- Cap. hamr sets (E1's $1 per run and $10 total is the natural starting point, not ruled for C2).
- Needs hamr's explicit word before any build (it changes what the worker is told).
- What I did not read: how the run's fact store is created and whether it persists between runs or is built fresh per run (so whether a seed must be written at each run start is unknown); the `scope` and `strictScope` behaviour as bareloop configures it; whether the `ctx_recall` fact ranking would surface a seeded note for the queries a worker actually makes (BM25 over note text, not checked); how `learnstore.js` exposes cards to a caller other than the planner hint.
- **Open choices — ask hamr:**
  1. Seeded note content: which closed fields (check name, error kind, count, outcome FIXED or NEVER_FIXED), and the exact sentence template.
  2. Whether a seeded note may name a file at all (default in this draft: no, tool/check/error kind and count only).
  3. Note id scheme and marker (litectx `by` is only human or agent, so a prefix in the id is the candidate).
  4. Which ledger rows are eligible: age window, same workflow key only, or the climb levels (place, user).
  5. How many notes per run, and whether notes are written fresh at each run start or kept in the store.
  6. Whether FIXED cards only, or NEVER_FIXED too.
  7. Jobs and the cap for the C2 experiment.
  8. Hash rule for the seed switch (this draft: switch enters the hash, text does not).

**C3 — `assemble` / `summaryWindow` from litectx for context compaction.**
Reason: litectx ships it, but compaction is PARKED because clearing breaks the prompt-cache prefix and the net sign is unmeasured (project memory "context compaction is parked"). Measure the sign first.
- Question. Does a summary window lower total cost, once the cache-prefix break is paid?
- Riskiest assumption. Cache reads (35%) are untouchable and re-pricing after a clear costs more than it saves. Read hygiene as a class caps at ~10% (FINDINGS.md:8332-8359).
- Design. $0 first: replay worker-round token fields from archived runs through a model of cache write/read rates, with a Customer-set price row; no live arm until the sign is positive. If ever built, compaction and the read-shim ledger must forget in ONE mechanism.
- Instrument. `cacheReadTokens`, `cacheCreationTokens`, `inputTokens` per `worker-round`.
- Arms/freeze/stop. Replay only; stop if the modelled saving is below the F107 ceiling. Cap: $0.

**C4 — bare-agent `SkillRegistry` (progressive disclosure of sub-procedures).**
Reason: closest to harness2's "skills", but bareloop has no per-skill unit smaller than a signed plan, and who writes a skill is the open issue.
- Question. Does on-demand instruction injection (`skill_use`) beat always-on persona lines for cost?
- Riskiest assumption. That a skill's instructions can be fixed text bareloop owns (not agent-written) and still help. "Skills affect discovery, never authorization" (src/skills.js header), so the gate is unchanged.
- Design. Move one existing strategy block (for example `RETRIEVAL_STRATEGY`) into a registered skill, same words. Compare persona-always-on vs skill-on-demand.
- Instrument. Prompt tokens per round; `skill_use` calls; tool mix; cost to green.
- Arms. Same text always-on vs on-demand. Freeze: the text byte-identical in both. Cap: hamr sets. New menu verb `skill_use` means a new signed spec version.

**C5 — bare-agent `buildSearchTool` / `buildExactTool` / `buildScanTool` + `litectxCorpus`.**
Reason: an existing retrieval surface we have never tried, but I have not read its behaviour, so a read-only look comes first.
- Question. Do these corpus tools beat `shell_grep` + `ctx_recall` on cost per found fact?
- Riskiest assumption. That they are not a second read path that bypasses the read-shim's delivered-bytes ledger (a shim must ledger what was delivered).
- Design. $0: read src/recurse-retrieval.js, map each tool to an existing bareloop verb. Only then a paid ON/OFF.
- Stop. If a tool duplicates a granted verb, drop it (menu is inventory, no duplicates). Cap: hamr sets.

**C6 — bare-agent `createSpawnTool` / subagents.**
Reason: last. A spawned child is a second actor that can run commands or write outside the fence; `run` is LOCKED forever and money must stay one cap.
- Question. Does a read-only subagent cut the main worker's context growth?
- Riskiest assumption. That a child can be made read-only inside the same gate, with its spend booked into the same ledger (a round type left out of a spend slicer is undercounted).
- Design. $0 reading of `createSpawnTool` and `spawnChild` first. No arm until the child's tool set is provably a subset of the parent's grant.
- Stop. Any path to `run` or an unfenced write is an immediate stop. Cap: hamr sets. Needs hamr's explicit word.

**Not candidates:** `createBrowsingTools` / `createBrowseTools` (the worker never browses; the page is fetched by code at run start); the bareguard rubric and `Gate` exports (arbiter-side); `createDeferTool` (a deferred action is a queue the worker does not own).

## 7. Rulings (hamr, 2026-10-28)

The ten interview questions, each with hamr's answer.

1. Is E0 the right first move, and what is the smallest segment (runs per genre and provider) you accept as enough to read?
   **Answer.** Yes, E0 is first. A segment is 10 runs (same genre, same provider and model). A segment with fewer than 10 runs is reported as "too few", never read.
2. Which habits matter most to you: re-reads, read over recall, or something else?
   **Answer.** Re-reads first (a file read again with nothing changed). Read over recall second.
3. May hints name a specific file, or only a tool and a count?
   **Answer.** Only a tool and a count, never a file name (a file name edges toward naming the culprit; the close must never name it).
4. Do hints go to the worker only, or also to the planner's step grants?
   **Answer.** Worker only. One lever at a time.
5. Cap, n per job, and margin for E1.
   **Answer.** $1 cap per run, $10 total cap, 3 runs per job per arm (ON and OFF), pass margin: ON at least 20% cheaper to green. Provider DeepSeek `deepseek-flash`.
6. Which frozen jobs are in, given the benches were frozen with the shim OFF (BENCH-PREREG.md:178)?
   **Answer.** Chosen after E0, from jobs where re-reads really happen on DeepSeek. The read-shim setting is held fixed and recorded. `aurora-testgen-cold` (G2 negative row) is out, since it says nothing about cost. The frozen bench rows are not required.
7. Does a worker hint count as a "declared job condition" that enters the signed hash, or a report-only channel?
   **Answer.** The hint ON/OFF switch enters the signed hash (declared job condition, PRD law 5), like learningHints. The hint TEXT does not (it changes per run and would split one job into many).
8. Do you agree with the candidate order (C1 embeddings first after E1, C6 subagents last)?
   **Answer.** Order kept, with C1 dropped (see 10). C2 is first after E1; C6 stays last.
9. C2 (code-seeded facts to the worker): specced at all before C1 reports?
   **Answer.** Yes, spec it now (hamr said 9A), as a draft. Still no build or run before E0 and E1 report and a POC passes. See section 6.5 C2.
10. Is the dependency weight of litectx embeddings acceptable under the one-dependency bar?
   **Answer.** No. bareloop never adds `@huggingface/transformers` (litectx 0.32.0 lists it as an OPTIONAL peer dependency, not installed today [CODE]). hamr, verbatim: "litectx default indexing and bm25 is really helpful to narrow down what agent needs to grep, no embedding needed". C1 is DROPPED.

## 8. Where things stand (2026-10-29)

Built on `feat/online-dot` (pushed unless noted):
- Online dot in the panel header (87f3083). Not harness2; it rides the branch. A later fix (f08e5d9) stops a page render error painting it offline.
- F252 shim fix (2a81471): the delivered-ledger resets per `ask()`. Proven by a fail-first test. Live: the shim was ARMED in run mvsmxgwm (one `memory-cache` record: capped 1, pointered 0). The pointer path (a later attempt told "you already hold it") was never served live, so the fix is still test-proven only.
- Handoff note (1c26d45 code and tests, 6af57ef docs): `src/handoff.js`. Spec field `handoffNote`: absent = on, false = off. The switch enters the signed hash only when present (mirrors `thinking`; it is NOT like `learningHints`, which is a global `config.json` setting, `src/learnstore.js`). hamr ruled 2026-10-28: ON by default (1A), not in the panel (2B), old signed jobs get it without a re-sign, like learnings (A). Live: the note was emitted 10 times in mvsmxgwm (the F255 notes). It is NOT yet shown to cut re-reads live: mvsmxgwm had 26 new-worker re-reads against E1 medians OFF 30 / HANDOFF 15, which is not like-for-like and is n=1.
- Planner exit fix (4455c0c): the POC PASSED (`docs/logs/PLANNER-EXIT-PREREG.md`, commit 9f88d5d; results `.claude/scratch/planner-poc/batch/results.jsonl`). First-draft refusals OLD 8/23 vs NEW 1/24, plan-red 1 vs 0, cost $1.55 DeepSeek. The build is DONE and held live in runs mvsmxgwm and mvtatlxw (no plan-red). Root cause is the F254 entry in `docs/wiki/FINDINGS.md`.
- F255 (drafter put a path in `lineMatch`, crashing a check at zero): found live in mvsmxgwm, POC run, fixed in 721ba33. Live green via panel run mvtatlxw (provider-red, then Resume gave already-green, $0.4510).
- F256 (drafter adds a whole-repo exit-0 check beyond the job): logged in 1fd90b6, NOT built. The panel now names each command check by its own command (b0f5c52), so two commands never read the same question.
- Full suite at b0f5c52: exit 0, 4970 tests, 4968 pass, 0 fail.
- Self-review 2026-10-29 done; 7 items sit in the fix ledger.

Done earlier: E0, E0b, E1 (results in F253; `.claude/scratch/e1-poc/battery/analysis/E1-RESULT.md`). The per-turn re-read hint arm was dropped (F253: about 20 fires in 18 runs, the shim already answers whole-file re-reads, and it leaks into scout notes and then the drafter). Live product run u-mvsl1lof (2026-10-28, $0.0425) died plan-red at drafting (F254) before any step and proved nothing about handoff or the shim.

### NEXT (in order)
1. `/branch-review`, then `/release` (the branch holds the dot and the harness2 work).
2. Then the Audit grid branch (PRD addendum; the signed mock is `design/audit-grid-mock.html`).
3. Then backlog H1 first (section 9).

No further build starts without hamr's word.

### 2026-10-29 — H1 result (paid, Fireworks)

H1 ran (prereg `docs/logs/H1-PREREG.md` and Addendum 1). Phase 0 ($0) passed: 48 fit cases in 16 runs. The first count was 37; an ask-matching bug in the instrument was fixed (v1 kept). All 48 fit cases are reads of one file, `src/metrics.js` (201 lines), 41 of them in `p7`.

Phase 1: provider Fireworks, model `accounts/fireworks/models/deepseek-v4p1-flash`, 12 runs (2 jobs, 3 per arm), booked $3.3329. The real `runs.jsonl` was untouched (385 lines before and after). Result file: `.claude/scratch/h1/battery/analysis/H1-RESULT.md`.

- **p7: FAIL, and backwards.** Retrieval share ON 6.4% vs OFF 19.5%. Fit conversion ON 1/14 vs OFF 2/8. Greens ON 2/3 vs OFF 3/3 (ON run 1 hit the wall).
- **bigfile: FAIL on the frozen 2x rule.** Share ON 47.4% vs OFF 31.5%: up, but under 2x. 0 fit cases, because no run reached an edit. Greens 0/3 vs 0/3; every run ended step-red.
- The hint was shown in 10 step-times (p7) and 6 (bigfile). It was never inert.
- Cost is reported only (n=3 was declared underpowered before any data).
- Observation, not a claim: on the big-file repo, workers already pick recall/get about 31% of the time with no hint, against about 10% on small repos.

Why bigfile ended step-red (read from run 07-bigfile-OFF-r1's spine): the planner gave the step 14 rounds; each try hit that round cap with no write; two strikes; the replan gave 8 rounds and did the same. That is F257 in `docs/wiki/FINDINGS.md`. A second gap, what a next try is handed, is F258.

Also done today, $0: H2 sizing (`.claude/scratch/h2/H2-SIZING.md`, 82 archived runs). Findings:
- Part 0: workers use plain shell tools (bare-agent `shell_*`) for 93.6% of calls and litectx `ctx_*` for 6.4%. Half of the `shell_read` calls are re-reads.
- Part A (map instead of a whole-file read): a map is about 2% of the file's bytes (median 194 B vs 14.6 KB). A fallback was needed in 5% of cases at 200 lines or more (9 of 166). But the biggest "enough" class is enough-notouch: the worker read the file and never touched it again. That is probably reading to understand, which a map cannot replace, so "enough" is optimistic. One file (`src/metrics.js`) is 78 of the 166 cases.
- Part B (hand an alternative from the last call): pair patterns are mostly not above the edit baseline; read then read is only 31. Weak.

Where tools come from: `shell_read`, `shell_grep`, `shell_write`, `shell_edit` are from bare-agent `createShellTools` (`src/tools.js:21`); `ctx_*` are bareloop wrappers over litectx; bareguard gates every call (`src/tools.js:93-98`). [CODE]

Nothing built from this. Next candidates (A, C, M1-M3) and wrinkles are in section 9. No build starts without hamr's word.

### 2026-10-29 — Check C result ($0)

Check C ran at $0 (no model calls, no keys). Result file: `.claude/scratch/memc/MEMC-SIZING.md`. Descriptive only; no pass/fail gate was applied.

**Finding.** A new worker repeats reads that earlier workers in the same run already did. A repeat is a read-class call (shell_read, ctx_get, shell_grep, ctx_recall) whose key an earlier ask touched, with no write to it since. Grep repeats are path-only (the gate audit has no pattern), so they are an upper bound.
- E0 deepseek-flash TYPES (23 runs): new step 50% (291/580), step retry after a bounded try 53% (91/172), fix first try 42% (149/353), fix retry 50% (164/327).
- E1 TYPES, handoff OFF (12 runs): 38-60% (new step 38%, fix first 39%, fix retry 60%). Handoff ON (12 runs): 31-47% (new step 31%, fix first 32%, fix retry 47%). ON is lower in every row, but cells hold 3-13 asks and the arms are not like-for-like (the OFF arm pools the hint arm). The note maps files; it does not stop a re-read.
- H1 bigfile (6 runs, 24 worker asks): step retry after a bounded try 66% (195/295), new step 72% (73/102). All 24 worker asks were bounded at the round cap and none wrote. Of 12 bounded-to-retry pairs, 2 were pure redo (no write, no new key) and 10 found at least one new key but none wrote. Hand-checked pair (07-bigfile-OFF-r1, step `recon-and-first-fix`): try 2 repeated 11 of 25 read-class calls and still found 14 new keys.
- Read as per-run anecdote: H1 is n=6 per job and has no handoff-OFF arm.

**What each new worker is handed (from code, `src/planrun.js`).**
- Every worker `ask()` is a fresh transcript and a fresh read-shim ledger (`:2895-2898`). Only the prompt and system prompt carry anything over. The tree persists.
- Step try prompt (`:3484-3495`): step action; repo root; target; earlier GREEN steps' final text, cut at 2000 chars each (`ARTIFACT_MAX`, pushed only on a green step, `:3500`, `:3605`); on a retry, the last check output (`lastGap`, `:3533`); `boundedNote` if the previous try was bounded (`:594-611`, `:3493`); Layer R note (off by default); the handoff note.
- Fix try prompt (`:4236-4244`): fixed sentence; root; the same green-step texts; try 1 gets the final verification output, retries get the failed verification output; the close's own numbers so far; `boundedNote`; the handoff note.
- Handoff note (`:2582-2595`, `src/handoff.js:8,12,69-100`): files earlier asks read, with line counts and symbol ranges. No greps, recall queries, edits or findings. Cap 8,000 chars. Starts empty on a resumed leg (`handoff.js:55-56`).
- `boundedNote` is generic: it says reading ran out ("CUT OFF after N tool rounds"). It names no file, grep or finding.
- A failed try's own final text is never passed on.

**Size of a facts-only carry note** (files, greps, edits, from all earlier asks in the run): median about 200-1,400 chars, p90 up to about 2.5k, all at or under 8,000. Share at or under 1,500 chars: 58-100% by segment (lowest: E0 TYPES fix retry 58%). The grep pattern length (24 chars) and match counts are assumed, since the audit has neither. H1's shipped handoff note measured 968-2,325 chars median, so a facts-only note without symbol maps is smaller than what ships.

**Dollar proxy, not a saving.** About 40% of E0 TYPES worker spend sits in repeat calls (about $6.5 of $16.55 over 23 runs). This assumes every call costs the same share. It is not a measured saving: cache reads dominate tokens and cost follows turns (F253), and a removed call does not remove a round.

Verdict: the gap is real and sized. Whether handing facts closes it is untested. Next is M1 (section 9). Recorded in F258.

## 9. Experiment backlog (not yet run)

Order (hamr, 2026-10-29): memory first. C (measure the carry-over gap, $0) then M1 (carry note built by code: a prereg hamr signs, then a POC on the bigfile job). A and B wait until memory is done; a good carry note may make them unneeded. Why: H1 showed workers already follow the menu's size rule (whole read for small files, recall/get for big ones: bigfile OFF 31.5%, ON 47.4%); the waste is what is lost between workers, not the tool pick. Guess, not proven (n=3): on p7 the hint's word 'large' may have read as permission to read a 201-line file whole.

Each item: question, why, riskiest assumption, first $0 step, who rules. None has a number yet.

H1. New hint POC: read-vs-recall SELECTION. **DONE 2026-10-29: FAIL on both jobs** (p7 backwards, bigfile under 2x; see section 8, `.claude/scratch/h1/battery/analysis/H1-RESULT.md`, prereg `docs/logs/H1-PREREG.md`).
- Question. Can a hint move workers from `shell_read` to `ctx_recall`/`ctx_get` where recall fits?
- Why. Workers pick `shell_read` about 69 of 70 times over recall/get (F107; section 4 above). The per-turn re-read hint arm is dropped (F253). hamr 2026-10-28: "focus on hints" after the fixes.
- Riskiest assumption. That selection, not retrieval quality, is the blocker, and that a hint wording changes it (a guard wording once moved a false-claim rate 5/10 to 0/10, so wording matters).
- $0 first. Re-read the E1 and E0 archives for how often a recall would have fit. Run on the NEW code (planner fix and handoff in).
- Rules. hamr (frozen prereg before any number).

H2. Pointer or map in the shim message.
- Question. Does replacing "you already hold all N bytes" with a map (symbols and line ranges, `ctx_get` for a part) help?
- Why. Arize talk (section 4b) and hamr's question. True whether or not the model remembers. Complements the shim, does not replace it.
- Riskiest assumption. That the map is cheaper than the re-read it prevents.
- $0 first. Measure map size against file size on archived re-read cases.
- Rules. hamr.

H3. Repeated identical tool-call catcher at source.
- Question. On the 3rd identical call, can code answer "asked 3 times, unchanged, here is the map"?
- Why. The talk's "43 identical calls" point (section 4b).
- Riskiest assumption. That identical-call runs really occur on our workers. Never rewrite history (cache-prefix cost; compaction is parked).
- $0 first. Count identical-call runs in archived spines.
- Rules. hamr.

H4. Turns lever.
- Question. What drives turn count?
- Why. F253 showed cache reads are about 85-93% of tokens, so cost follows TURNS (each turn re-sends the conversation), not reads.
- Riskiest assumption. That turns are controllable by anything we can hand the worker.
- $0 first. Archive read of turns per run against step shape. Candidate levers TBD with hamr.
- Rules. hamr.

H5. Handoff at larger n.
- Question. Does handoff alone show a cost effect under noise?
- Why. E1 (n=3) showed about -60% new-worker re-reads but no turn, token or cost win. hamr: "try handoff separately". Pulselog OFF cost ranged $0.20-0.37, so n=3 is underpowered.
- Riskiest assumption. That a real effect exists and is bigger than run-to-run noise.
- $0 first. Power calculation from the E1 spread (`.claude/scratch/e1-poc/battery/analysis/stats.mjs`). Declare UNDERPOWERED before any data.
- Rules. hamr (cap and n).

H6. Per-turn nudges against the up-front list (hamr's idea, discussed 2026-10-28).
- Question. Does a nudge only on a clear slip help?
- Why. Costs only when it fires. Rule: say HOW to read, never WHERE to look.
- Riskiest assumption. Anchoring: a nudge may fix the worker on the nudged path.
- $0 first. Replay archived slips to count how often a nudge would fire.
- Rules. hamr.

H7. Drafter scope-escape. The one NEW-wording red in the planner POC was scope-escape (`steps.0.exit.0.path` outside the allowed folder); it recovered. Watch it, do not build.

Also kept: C2-C6 as listed in section 6.5 (C1 dropped; the C2 spec draft has 8 open choices).

Next candidates after H1 (added 2026-10-29). Same fields as above. Nothing here is built or run.

A. Hand a map on a big-file read; the whole file on a second ask (the fallback). WAITS for memory (hamr 2026-10-29).
- Question. Does a map (symbols and line ranges) in place of a first whole-file read cut reads without hurting greens?
- Why. $0 sizing is done (section 8, H2 Part A): a map is about 2% of the file, fallback about 5% at 200 lines or more.
- Riskiest assumption. That a worker who read a file and never touched it again (enough-notouch, the largest class) can do without the content. That read is probably to understand, so "enough" is optimistic.
- $0 first. Two things. (1) A litectx index must exist: today it is built only when a ctx tool is granted (`src/planrun.js:2574`). (2) Measure index and map time on the bareguard copy at $0.
- Rules. hamr. Next step: a frozen prereg.

B. Hand an alternative based on the last call. SHELVED.
- Weak at $0 (section 8, H2 Part B): pair patterns are mostly not above the edit baseline. Revisit only with new evidence.

C. The carry-over gap, measured. **DONE 2026-10-29** ($0; see section 8, `.claude/scratch/memc/MEMC-SIZING.md`, F258).
- Question. On try N+1 after a bounded try N, how many calls re-find what try N already found (same reads and greps)?
- Why. F258: the next worker is not told what the last try found or ruled out. F257 shows runs where every try ends out of rounds.
- Riskiest assumption. That re-finding is large enough to matter; the handoff note already cuts new-worker file re-reads.
- $0 first. Count it in archived spines and gate audits, split at the try boundary. No paid run.
- Rules. hamr.

M1. Carry note built by code, like learnings. **Initial spec (agreed with hamr 2026-10-29; not built; POC next).**
- Purpose. A code-written carry note so a new worker (retry, next step, fix try) does not re-find what earlier workers in the same run found.
- Content. Facts only, written by code:
  - Last try header: step, try n of m, why it ended (for example ran out of calls, N of N), files changed or none.
  - Last check output (already handed today; keep one copy).
  - Files read: path, line count, times read, line ranges actually read or symbol ranges when known. Never content.
  - Searches: grep pattern, scope, match count and first match lines (file:line, capped); recall query and hit ranges.
  - Edits made in the run: per file, changed-line count and hunks taken from the WORKING TREE (git diff against step start), capped at about 40 lines per file. Never from the spine's attempt-diff (an arbiter book, section 6.4).
  - Earlier tries folded to one line each.
- Fold. Repeated calls merged with the learnings Jaccard match (0.6 or more): "read 5x", not five lines.
- Size. Grows within a run; newest try in full, older tries folded; hard cap about 3,000 chars (check C: most fit in 1,500).
- Never. The worker's own words (that is option B, its own later test: the AI invents, per the learnings POCs). Arbiter books (spine, gate audit, `.smoke`). Secrets (masked by the one secret-shape inventory).
- Persisted to disk per run, so a RESUME starts with it. This fixes the "handoff dies at resume" wrinkle.
- Across runs. NOT in M1: a fresh run starts on a fresh tree, so old diffs and ranges go stale. Later, via learnings (planner).
- Relation to today's handoff note. M1 extends or replaces it; decided after the POC.
- Key point. A NEW worker starts with no prompt cache, so handing it a note costs no cache break. The reason compaction is parked (section 4b) does not apply.
- Riskiest assumption. That code can write facts a worker finds useful. An AI-written summary invents, so code writes facts only.
- Steps.
  1. $0 POC: a note maker in a scratch copy replays archived runs and prints the note each new worker would have got. hamr reads real samples.
  2. Prereg that hamr signs: today's handoff against handoff plus M1, jobs p7 and bigfile, Fireworks DeepSeek `deepseek-v4p1-flash`.
  3. Build on a branch only if it passes.
- Known data gap to resolve in the POC. The gate audit has no grep pattern and no `ctx_get` range (MEMC-SIZING caveats). The note maker must take these from the tool call args at the source, so the POC must say where each field comes from.
- **v2 rules (agreed with hamr 2026-10-29; POC v2, $0).** These refine the content above; the v1 text stays as the record.
  - Noise drop. Directory reads, and manifest, doc and config files, are not shown unless edited. They are counted in one line: "+N listings/config reads not shown".
  - Ranking. Files are ordered by times read, then most recent. When the cap bites, lower-ranked lines drop first and the last try's own facts drop last.
  - Heading. "Where earlier workers looked (N files)".
  - The mark " · looked here, no fix made" goes ONLY on a file read 3 or more times in a try that ended red with no change (hamr picked A). On bigfile every file got the mark when it was unrestricted, which says nothing.
  - Fold also by a shared 6-character prefix or by containment (for example `runMetric` and `runMetricsBatch`), besides the Jaccard match.
  - Edits mean everything since the RUN started (hamr's default pick A), not since the step started.
  - Live capture at the tool seam: grep pattern and matches, `ctx_get` range, recall hits. This closes the data gap above.
  - Note state is persisted under `.smoke`. The worker's read of it is denied, but see F259: a root grep can reach it. The note holds facts only, so the harm is no more than F259 itself.
- Illustrative layout, values shaped like the bigfile run, not real output:

```
== What earlier workers in this run did (facts from the record, written by code) ==

Last try: step "recon-and-first-fix", try 1 of 2. Ran out of calls (14 of 14). Changed nothing.
Last check said: not ok 113 - a resource halt routes through humanChannel topup end-to-end

Files read (whole-file reads, line ranges where known):
  test/budget-resources.test.js (612 lines) · read 2x · lines 380-450
  src/gate.js (2433 lines) · read 3x · _haltDimension 2140-2160, _resourceFromRule 2185-2192
  src/primitives/budget.js (501 lines) · read 1x

Searches and what they matched:
  grep "budget.resource" in src/  → 6 matches: src/gate.js:2188, :2201, :2240 (+3)
  grep "_haltDimension" in src/   → 2 matches: src/gate.js:2141, :2310
  recall "topup resource halt"    → src/gate.js 2140-2160, src/primitives/budget.js 88-120

Edits made in this run: none.

Earlier tries (folded): step "recon-and-first-fix" try 1: same reads as above, plus grep "topup" (11 matches).
```

2026-10-30 status: M1 was tested in 2 rounds on Fireworks `deepseek-v4p1-flash` (`docs/logs/M1-PREREG.md`, `docs/logs/M1-ROUND2-PREREG.md`; results in F258). The note's cap order changed to diff-first (hunks are cut last). Underpowered, a leaning not proof. It ships ON by default as `carryNote` in config.json (false = handoff note only) on branch feat/audit-grid.

2026-10-31 status: SEEDGAP (tell the planner and first worker the job's own failing count check at start) ran 3 OFF / 3 ON on bigfile, Fireworks `deepseek-v4p1-flash`, carry note and handoff ON in all six: first step wrote ON 3 of 3, OFF 1 of 3 = SIGNAL by the frozen rule (`docs/logs/SEEDGAP-PREREG.md`, F262). Underpowered (n=3, one job). Ships ON by default as `seedNote` (false = off); delivery to workers shipped as the carry memo's `at start` entry, which the battery did not test.

NEXT (hamr 2026-10-31), plan only, nothing built:
1. A (map on a big-file read), tested TOGETHER with M2 (compress, peek, stash; about 0.7% of calls, H2 Part 0). Now unblocked: the seed note tells the worker which test fails, so it knows what to look for. Map = litectx symbol list (names + line ranges) of a big file instead of the whole file on the first read; whole file on a second ask (fallback). $0 facts already measured (`.claude/scratch/bigfile-next/READ.md`): index of the bareguard copy 8.1-10.1 s cold, re-index 38-65 ms, gate.js map 51 symbols / 1,132 chars. Order: a $0 read of why the M2 tools go unused, then a prereg hamr signs (bigfile, map on/off), then build, then paid runs on Fireworks deepseek-v4p1-flash.
2. litectx index plan (litectx design settled by hamr 2026-10-31 in the litectx session: MCP warm-on-boot skips the home dir; `index.db` created lazily on first `index()`/`remember()`; new boolean getter `lc.indexed`; `recall` still a plain array; `getNode`, `StalePointerError` and the incremental index unchanged). bareloop: (a) bump litectx when it ships and verify on a clean install; this ends the empty `.litectx` db made at `src/planrun.js` ~:2210; (b) read `lc.indexed` so the handoff map and the map fall back to line counts visibly when there is no index; (c) for A, index once at run start for every run (not only when a ctx tool is granted, `src/planrun.js` ~:2582); the re-index before each ask stays (about 6 ms with no change).
3. Then: proof the memo helps (a larger ON/OFF across jobs). M3 (head-and-tail compaction) is dropped as low value unless hamr revives it.
4. Side items, logged not experiments: F260 (fix tries hit the 30-minute wall); one worker stopped by "repeated denied calls" in run mvw29hmk (not investigated).

M2. litectx context primitives (compress, peek, stash).
- They are wired but used in about 0.7% of calls (H2 Part 0). Use them. A gap becomes an ask to litectx, never a local patch.

M3. Head-and-tail compaction. A crude baseline only, to compare M1 against.

Wrinkles to fix or try (each has a ledger bullet or a finding):
- F257: the planner gives too few rounds per step on a big-file job.
- The litectx index is built only when a ctx tool is granted (`src/planrun.js:2574`).
- The attempt diff never reaches the next worker (spine only, `src/planrun.js`, "attempt-diff").
- F259: a root `shell_grep` walks past `fs.deny` and can read the arbiter books (upstream ask BG-3; matters for where M1 keeps its state).
- The handoff note dies at resume: it lives in memory, a resumed leg starts empty (`src/planrun.js:1027`).
- The Phase 0 instrument had an ask-matching bug (fixed in scratch, v1 kept).
- The p7 spec signature was rewritten for the Fireworks baseUrl; the driver recomputes the hash.

Known gaps to keep in view: Kind A/B are keyed tool+path (the gate audit has no `ctx_get` range); hint conversion can only be approximated; the prompt text of notes is not in the spine, by design.

## 10. Where the evidence lives

Untracked scratch (survives `/clear`, not a fresh clone), all under `.claude/scratch/`:
- `e0-read/`, `e0b-read/` (the $0 archive reads)
- `e1-poc/` (`PHASE1.md`, `engine/`, `battery/` with `analysis/E1-RESULT.md` and `analysis/stats.mjs`, `templates/`)
- `planner-exit/FINDINGS.md`
- `planner-poc/` (`engine/`, `batch/`)
- `handoff-live/RESULT.md`
- `h1/` (`phase0/PHASE0-RESULT.md` and `.v1.md`, `battery/` with `analysis/H1-RESULT.md`, `results.jsonl`, `progress.log`, `runs/`)
- `h2/H2-SIZING.md` (the $0 sizing)
- `memc/` (check C, $0: `MEMC-SIZING.md` is the result; scripts `memc.mjs`, `agg.mjs`, `selfaudit.mjs`, `handcheck.mjs`; tables `memc-tables.md`, raw `memc.out.json`)

Tracked: `docs/logs/E0-PREREG.md`, `E0B-PREREG.md`, `E1-PREREG.md`, `PLANNER-EXIT-PREREG.md`, `H1-PREREG.md`; `docs/wiki/FINDINGS.md` F252, F253, F254, F255.

Paid so far (DeepSeek deepseek-flash, 2026-10-28): E1 $4.72, observe $0.16, planner POC $1.55, live run $0.04. 2026-10-29: H1 $3.3329 (Fireworks deepseek-v4p1-flash). 2026-10-29/30: M1 smoke $0.73, round 1 $3.52, round 2 $5.08 (Fireworks deepseek-v4p1-flash). 2026-10-31: live carry runs $0.70 + $0.56, SEEDGAP $1.40 (Fireworks deepseek-v4p1-flash).
