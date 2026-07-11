# adaptlearn — findings

No papering over. Every friction point — with bareagent / litectx / bareguard (filed upstream),
with the schema (an M3-class "can't express" is a finding, not a workaround), or with the ladder
(a module that can't exit stops the ladder; the stop is a result) — is logged here, grounded in
source (file:line) or in the event log (run + seq). "Works as intended" is also a finding.

Reds are logged through the PRD §5b lens: name which of the five meanings the contrast supports
(worker ceiling / bad harness / broken close / cap halt / schema can't express) — never a bare
count.

Evidence paths cited below as `/tmp/m6-cohort-*` were live at writing time; every world's
load-bearing evidence (ledgers, results, conditions, configs, configs-final, rules, per-cell
spines) is preserved in-repo under `docs/archive/evidence/` (see its README for the
world→finding map), and the two analysis lenses are `poc/analyze-grid.mjs` (F18/V6) and
`poc/analyze-contrast-bits.mjs` (V2) — both re-runnable against the archived copies.

## F1 — litectx already ships the ops vocabulary (works as intended)

Schema v1's planned write · select · compress · isolate vocabulary already exists upstream:
litectx v0.27.0 exports `PRIMITIVES = ["Write","Select","Compress","Isolate"]`,
`VERBS_BY_PRIMITIVE` (remember/forget/write-gate · recall/impact · assemble/compress/
summaryWindow · stash/peek/evict/scope), and `COMPRESS_LEVELS` (`src/index.js` exports).
Schema v1 binds this catalog (v1 exposes a 4-verb subset) instead of inventing one.
**Verdict: consume, don't build — no invention needed.**

## F2 — bareagent clipipe reports no usage, though the claude CLI provides it (upstream)

`bareagent/src/provider-clipipe.js:67-68` — `toolCalls: []` always, `usage: {inputTokens: 0,
outputTokens: 0}` always. But `claude -p --output-format json` does return usage and cost
fields, so the provider could parse real token counts. Consequences absorbed in the schema v1
design: worker is tool-free, and local runs cap on bareguard's `counts` dimension (the gate
fails closed on unpriced cost — `bareguard/src/gate.js:573`). **Fix belongs upstream in
bareagent** (parse CLI JSON usage); until then, counts-capping is the honest workaround, logged
here per no-papering-over. (Extends relayfact F5, which established the no-tools limit.)

## F3 — `onLlmResult` is a Loop constructor option; on `run()` it is silently ignored (trap, works as documented)

probe-02 first passed `onLlmResult` to `loop.run(msgs, tools, opts)` — no error, no warning, and
the budget axis went completely blind: 4 iterations at ~$0.13 each sailed past a $0.02 cap, every
write allowed by `rule:"default"`. The adapter's own JSDoc example is explicit
(`bareagent/src/bareguard-adapter.js:103`): `new Loop({ provider, policy, onLlmResult })`.
**Verdict: works as documented, but the failure mode is silent and catastrophic for the budget
claim** — encoded as a comment in `src/interpret.js` and regression-covered by the cap-halt
interpreter test (a stub provider's costUsd must trip the gate). Possible upstream nicety:
`loop.run()` could warn on an unknown `onLlmResult` option. Not filed as an ask yet — the
constructor path is correct and sufficient.

## F4 — schema writeScope is glob-shaped; bareguard `fs.writeScope` is prefix-containment

`bareguard/src/primitives/fs.js` `within()` does directory-prefix matching (and `glob.js`
supports `*` only, for other primitives). A config entry `src/**` passed through verbatim is
treated as a literal directory named `src/**` — everything denied (fail-closed, correctly).
The interpreter maps the schema's trailing `/**`|`/*` to the directory prefix
(`src/interpret.js`). **Mid-path wildcards (`src/*/gen`) are not expressible at the enforcement
layer** — if a harness ever needs one, that's a schema/enforcement vocabulary gap to take
upstream, not a mapping to fudge locally.

## F5 — validator/runtime kind mismatch: litectx `remember()` is narrower than `KINDS`

Found while closing the negative-scenario audit: the validator checked `remember.kind` against
litectx's full `KINDS` (`code|doc|fact|episode`), but `litectx remember()` throws on anything
outside `fact|episode|doc` (`src/index.js:789` — code enters via `index()`). A config with
`remember.kind:"code"` validated green, then crashed at the worst moment — *after* a green
close, in the on-green hook. Two-sided fix: validator narrowed to `fact|episode` (v1 also gates
the doc/upload axis out), and on-green hook failures now degrade loudly instead of crashing —
`retention-red` on the spine, green outcome stands, that green mints no inheritance.
**Lesson: binding an upstream vocabulary (F1) still requires checking each verb's own contract —
the export you bind can be wider than the function you call.**

**Resolved (2026-07-08, same day):** fixed upstream as UPSTREAM-ASKS A1 — `CLIPipeProvider`
`parse: 'claude-json'` maps `result`/`usage`/`total_cost_usd` onto `GenerateResult` (loud
`ProviderError` on malformed/`is_error`), and the Loop now prefers a finite provider `costUsd`
over `estimateCost`, so the CLI feeds bareguard's USD axis directly. Consumed via
`bare-agent@file:../bareagent`, verified live (both paths). Note for pricing: the CLI reports
real equivalent-API cost even on subscription (~$0.05–0.32 observed), and `model` can carry a
`[1m]` suffix. Counts-capping workaround dies at M2.

## F6 — litectx stash is never recallable, so v1's `stash` verb cannot influence worker context (works as intended; schema vocabulary gap)

Found designing the M3 probe: litectx is explicit that a stash is outside ranked retrieval —
"recall owns ranked retrieval over memory; a stash is a dumb keyed blob, so `peek`" is its only
read-half (`litectx/src/index.js:994-1019`; separate `stash` table, `src/store.js:226`). Upstream
this is **works as intended**. The consequence lands in schema v1: the `after-red → stash` op
parks the gap, but no v1 verb ever reads it back — `recall` can't see it and `peek` is a named
v2 exclusion. So in v1, `stash` is **write-only decoration**: it can never change what the worker
sees, within a run or across runs. Two implications, both design-level, nothing to fudge locally:

1. **Within-run, the memory axes (`recall.k`, `compressLevel`) are inert on a fresh store** —
   there is nothing to recall until something has been `remember`ed, and `remember` is on-green
   only. A contrast probe must pre-seed the store (identically per arm — simulating run-N
   retention, exactly the axis the schema claims to wire) or it measures loop-shape alone.
2. This is the concrete finding that would re-admit `peek` in v2 (design doc names it as an
   exclusion): if a harness is ever to *use* its parked gaps, the read-half must enter the verb
   set. Not filed upstream — the gap is in our vocabulary subset, not in litectx.

## F7 — M3 contrast check: PASSED — categorical difference on verdict (the variable is wired in)

Live run 2026-07-09 (`poc/probe-03-contrast.mjs`, local claude via clipipe): the design doc's
MAX/MIN pair (opposed on exactly 8 JSON paths, machine-checked; gate/escalation identical), same
task, same GOLD close, same shell caps (capRuns 4, $2), same identically pre-seeded store (two
house-convention prose notes + one decoy; the close tests conventions the task statement
understates — case-insensitive units, bare-number-means-ms, RangeError/TypeError rules).

| arm | outcome | iterations | recall hits | ~cost |
|---|---|---|---|---|
| MAX | **green** | 1 | 3 | $0.11 |
| MIN | **escalated** (cap-halt 4/4, close red throughout) | 4 | 0 | $0.99 |

**§5b reading:** same task + same worker + same shell, different harness → green vs escalated ⇒
harness implicated, on the strongest (verdict) axis; M3's exit is "≥1 task", met. MIN's terminal
is honestly cap-halt ("not under cap"), and the contrast licenses the bad-harness reading. The
causal channel is visible in MIN's iteration 3: valid code that passed the generic tests and
failed *exactly* the understated house conventions the seeded notes carried — the notes, not
luck, explain MAX@1. MIN's other reds (prose-wrapped artifact ×2, quoting bug) are worker
instability, shared by both arms, not a confound. No interpreter-red anywhere: the plan path
(decompose + implement per iteration) ran clean all 4 iterations.

**Sealed reproduction (same day):** after F8 sealed the worker binding (tools disallowed, cwd an
empty sandbox, no CLAUDE.md contamination), the probe re-ran end-to-end: MAX **green @ 4**
(~$0.32; iter 1 real code missing part of the house contract, iters 2–3 syntax fumbles, iter 4
green; recall surfaced the seeds every iteration) vs MIN **escalated** cap-halt 4/4 (~$0.45).
Categorical difference on verdict reproduced under a strictly cleaner worker. Note the recurring
worker failure mode across all runs and both arms: template-literal-adjacent syntax errors in
emitted files — shared noise, no contrast confound, but it inflates iterations-to-green; worth
a dedicated look if it persists into M4.

**The two runs as a 2×2 (why verdict, not iterations, is the load-bearing axis):** within-config,
verdict was stable (MAX green 2/2, MIN cap-halt 2/2) while iterations-to-green varied wildly
within MAX (1 → 4 across runs — as large as any plausible MAX-vs-MIN iteration gap). So at n=1,
an iterations-to-green "categorical difference" (which design §M3 permits) would NOT have been
trustworthy — worker fumbles alone can produce it. M3's pass rests on the verdict axis, which
doubled as its own repeated-measures control. MIN's spine also shows the mechanism converting
iterations into verdict: whack-a-mole — it fixed the two note-carried conventions the gap named
(iters 1,3 → 4) only to red on the remaining two (error contracts), i.e. it was *converging* and
the cap halted it: cap-halt as "not under cap", never "can't", with the harness deciding how many
iterations the same cap must buy.

**Falsifier run (`poc/probe-03b-unseeded-control.mjs`, same day):** the causal reading was put
under intervention — MAX config, EMPTY store, everything else identical, n=2, primary metric
first-attempt convention compliance (robust to the iteration noise above). Result: unseeded MAX
**escalated cap-halt 4/4 in both runs**, first attempts missing 2 note-carried conventions each —
the exact MIN signature. Across all six live runs the partition is clean: recall surfaced the
seeds → green (2/2, first-attempt misses 0–1); recall surfaced nothing — whether because the
store was empty (unseeded MAX) or the slots were (seeded MIN) → cap-halt (4/4, misses 2 every
time). Two consequences:
1. **Confirmed by intervention:** the recall→context channel is causal, not spine forensics.
   This is also direct evidence-of-use in the PRD §4 retention sense.
2. **Honest narrowing:** with the store empty, MAX's remaining machinery (refine shape, slot
   mechanics) rescued nothing — unseeded MAX ≈ MIN on every measure. The schema variable
   *demonstrably* wired in is memory-surfacing specifically; loop shape showed no detectable
   effect at this n. M3's exit is unaffected (a wired variable exists), but M6 selection should
   expect the memory axes to carry the signal and shape mutations to be near-neutral on this
   task family until shown otherwise.

**Honest bounds:** n=1 task, one run per arm per condition — what M3 needed and no more. The demonstrated
variable is the *joint* MAX−MIN axis (slots + recall + shape together); per-knob attribution is
M6's one-knob-mutation job, not M3's. Also note MIN's `recall.k:1`/`drop` were never *executed*
(its slots are empty — opposition holds at the config-document level), so this result says
nothing about k or compressLevel individually. Machinery regression-guarded token-free in
`tests/contrast.test.js` (arms stay legal, opposition stays exactly the 8 axes, arbiter sections
stay identical); the live result itself is not a CI test.

## F8 — the "tool-free worker" was tool-free by assumption only: `claude -p` has tools and writes outside the gate

Caught by `git status` after the M3 run: stray `dur.mjs` and `sum.mjs` in the **repo root** —
written by the worker CLI itself. `claude -p` is the full Claude Code CLI: it has tools, runs in
the spawning process's cwd, and loads that cwd's CLAUDE.md as context. Three holes in one
binding: (1) worker file writes land **outside bareguard's writeScope entirely** — the gate only
sees the interpreter's write of the *returned text*; (2) from iteration 2 the gap text carries
the suite's `file://` path, so a tool-having worker could read the close's tests and
**fit-to-pass** — the exact fake-green §5b calls the only real failure; (3) the repo's CLAUDE.md
contaminates the worker's context (doctrine leakage + token waste).

**Why the shipped M3 result survives:** the close only ever reads the gated tmp artifact (strays
were never read); the seeded house conventions are not in CLAUDE.md; MAX's green was iteration 1
— before any gap text existed to leak a path; MIN, which did see gap paths, stayed red (no fake
green occurred). Verified by a sealed re-run (same categorical outcome — see F7/CHANGELOG).

**Fix (shell-owned, design decision 6 — not a config field, not an upstream gap):**
`CLIPipeProvider` already supports `cwd`; the binding now pins `cwd` to an empty per-run sandbox
dir and passes `--disallowedTools Write,Edit,NotebookEdit,Bash,WebFetch,WebSearch,Task,Glob,Grep,Read,TodoWrite`
— verified live: the CLI accepts the flag, writes nothing, and (nicely) refused an embedded
write-a-file bait outright. The worker is now tool-free in fact. Doctrine for M4+: any shell
runner that binds a CLI provider MUST seal it this way; an unsealed `claude -p` binding is a
gate bypass, not a provider choice.

## F9 — validator accepted writeScope strings the enforcement layer cannot express: green config, gate-red on every write (found by agent authorship)

M4 probe-04 round 1 (2026-07-09): first-shot authorship validity was 3/3, but the parity readout
was **agent 1/3 vs hand 3/3 — NO PARITY**. §5b diagnosis before accepting that reading: both
agent misses were `gate-red` escalations at iteration 1 (`fs.writeScope` deny on every write),
not close reds. Two distinct defects:

1. **Probe defect (information asymmetry):** the shell writes the artifact to `src/<name>.mjs`,
   but the author was given only task + catalog — it had no way to know the layout, so scopes
   like `["unique.mjs"]` deny under prefix-containment. The hand config "won" only because
   `valid.json`'s author knew the shell's layout. Fix: the catalog now states the run contract
   (artifact lands under `src/`) — contract, not coaching. Also fixed: round 1 didn't persist
   the authored configs (diagnosis had to reconstruct from the F4 mapping + `within()` truth
   table); the probe now writes `authored-<task>.json` as evidence.
2. **System gap (this finding):** the validator accepted ANY non-empty writeScope string, but
   bareguard enforcement is prefix-containment (F4) — so an authored `"src/*.mjs"` **validated
   green and then gate-redded every write at runtime**. Reds-before-tokens is the validator's
   entire job; agent authorship found a surface where it failed at it (a hand author never trips
   this — F4 covered our mapping, not the validator's blind spot). Fixed: wildcards are now
   legal only as a trailing `/**` or `/*`; anything else is a distinct
   `invalid-value:gate.writeScope` red (fixture `writescope-midglob`, 57/57).

**Why this is an M4 datum, not just a bug:** the authoring agent explores the schema surface in
ways hand authors don't — its first three configs immediately exposed a validator/enforcement
mismatch of exactly the F5 class (validates, then dies at runtime). Expect M4+ to keep doing
this; each such find tightens the reds-before-tokens contract that M6's mutation loop depends on.
Round-1 parity is superseded by the round-2 re-run (same probe, contract stated, F9 fixed) —
recorded below it in this file's spirit: the miss was real, diagnosed, and not read as
"agent can't author".

## F10 — M4 authorship: PASSED — 3/3 first-shot validity, parity-or-better on the easy cohort

Round 2 (2026-07-09, `poc/probe-04-authorship.mjs` after the F9 fix + run contract): authorship
validity **3/3 first shot**; parity **agent 3/3 green (each @ iteration 1) vs hand 2/3**
(the hand miss an honest cap-halt — three straight artifact syntax errors, the recurring worker
fumble noted in F7; no machinery red anywhere). Fit-to-pass counted: 0 possible by construction
(sealed workers, GOLD unseen close; gap text fed identically to both arms). Total round cost
~$0.53 including authoring calls (~$0.05 each).

**What the agent authored** (persisted as `authored-*.json`, world `/tmp/probe04-DPPWEx`):
coherent, task-tailored configs — budgets $0.50–$1 (tighter leashes than the hand config's $2,
which would rank WELL under green-gates/cost-ranks), maxIterations 4–6, recall k=3–4 with
compress, `stash` in after-red, `remember` correctly confined to on-green, `src/**` scopes under
the stated contract. All three chose `refine`; none chose `plan` — consistent with the F7
control's finding that shape carried no detectable signal.

**Honest bounds:** n=3 easy tasks, one round post-fix. "Parity or better" is the claim; the
hand arm's 2/3 is worker noise, not evidence the hand config is worse. The load-bearing M4
facts are: valid first-shot authorship is reliable, authored configs FUNCTION end-to-end, and
authorship exploration surfaces real system gaps (F9) — the exact behavior M5/M6 build on.
Round-1's NO PARITY and its diagnosis stand recorded in F9; it was a probe defect + validator
gap, not an authorship ceiling.

## F11 — M5 mid-run revision: PASSED — recovery 3/3 vs control 1/3, falsifier 0/2

Live (2026-07-09, `poc/probe-05-revision.mjs`): stall-prone condition = the F7 dur.mjs info-gap
task under a BLIND config (slots empty, store seeded but unused — the realistic "retention
exists, harness ignores it" state), cap 4, stall = 2 consecutive close reds, ONE revision per
run. Machinery negatives ran token-free BEFORE any live spend and all held: an arbiter-touching
revision → `arbiter-touch` revision-red with the run continuing on the OLD config; garbage →
`parse-error` revision-red, no crash, no silent accept; no stall → revisor provably never
consulted.

| arm | n | recovery |
|---|---|---|
| revision (seeded store) | 3 | **3/3 green — each at iteration 3, the first post-revision attempt** |
| no-revision control (seeded store) | 3 | 1/3 (an honest gap-fed self-recovery — consistent with F7's MIN convergence) |
| revision, EMPTY store (falsifier) | 2 | 0/2 |

**Reading:** exit met (3/3 > 1/3). Every accepted revision — 5/5 including the empty-store arms
— added a `before-attempt` recall: the agent diagnosed the correct axis from stall evidence
alone (reds steer revision — §5b's asymmetry, working). The falsifier keeps the claim honest:
identical revision behavior with no store recovered 0/2 — mid-run revision works through the
resource it surfaces, never through the act of revising. Same mechanism shape as F7's control.

**Graduated with two acceptance rules the POC surfaced:** the INTERPRETER owns acceptance
(re-validates and checks immutability itself — a revisor cannot vouch for its own output), and
`loop.maxIterations` joins gate/escalation as immutable mid-run (`cap-touch` red) because the
iteration budget is snapshotted at run start — rejecting beats silently half-applying.

**Honest bounds:** n=3/3/2 on one task family; one revision per run (multi-revision thrash is
untested, deliberately out of v1).

**Bound closed (2026-07-09, PRD v1.3 §7b.3):** the revisor is now metered by the run's OWN gate
— `proposeRevision` accepts the gate-wired `policy`/`onLlmResult` and the interpreter threads
its own through, so revisor tokens hit the same budget axis as the worker (regression: an
expensive revision halts the run at iteration 3, before the run cap of 4 — the halt is only
possible if the gate saw the revisor's spend). Authorship happens before the run's gate exists,
so the SHELL counts `authorConfig`'s returned `costUsd` into cost-to-green — an M6 accounting
requirement, now in the PRD.

## F12 — probe-06 inheritance contrast: PASSED — the rules channel steers authorship, both directions

Live (2026-07-09, `poc/probe-06-inheritance-contrast.mjs`): the M6 kill-switch (M3 doctrine one
level up — if seeded and unseeded authors are indistinguishable, the inheritance variable is not
wired in). One real green run (hand config, `unique` task) → sealed extractor distilled 5 TRUE
rules → 3 repeats × 3 authorship arms on a DIFFERENT instance (`slugify`), scored by code over 5
axes registered before spend (shape, maxIterations, recall.k, compressLevel, kinds). Machinery
negatives (scoring extremes, verbatim rules block, rule-length bounds) asserted token-free first
— and earned their keep: the first run died on a machinery assert (JSON-escaped quotes broke the
verbatim check) at $0 spent.

| arm | n valid | mean score toward own prescription | control toward same |
|---|---|---|---|
| TRUE-rules-seeded | 3/3 | **4.00 / 5** | 2.00 |
| INVERTED-rules-seeded (falsifier) | 3/3 | **5.00 / 5** | 0.00 |

**Reading:** PASS in both directions — extracted rules out-pull the control toward the config
they came from, and deliberately FALSE rules steer authors to a 5/5 opposite config the control
never touches (0.00). The channel carries CONTENT, not just tokens: the M6 gated-rules arm's
one live assumption holds, and the cohort may spend. 9/9 authored configs valid (M4's
first-shot validity holds under seeding). Spend ~$0.51 authoring+extract + one green run.

**Sharp edge to carry into the cohort read:** the falsifier steering at 5/5 means inheritance
transmits WHATEVER the extractor writes — wrong rules propagate as efficiently as right ones.
The gate (green-filtered extraction) is the only thing standing between the rules arm and
confidently inherited nonsense; that is exactly the load-bearing-gate claim M6 measures, now
with a mechanism-level reason to expect the ungated contrast to be real.

**Honest bounds:** easy task family (extractor material was an M2-class green, not a stall
recovery); steering measured on authored CONFIGS, not on downstream green-rate — the cohort
measures that; n=3 per arm.

## F13 — M6 cohort attempt 1: instrument INVALID at ceiling; provider outage crashed the launcher (two gaps fixed)

Live (2026-07-09, `poc/run-m6-cohort.mjs`, world `/tmp/m6-cohort-dQtNOb`): 62/64 rows completed,
$8.40 of the $38 stop-rule. Gens 0–6 clean; from 13:00 local every run — including the fixed
arm's known-good config — went `red:interpreter-red` at $0.00 in ~2–3s: the local `claude` CLI
stopped answering (subscription usage window). §5b class: broken middle, not harness verdicts.

**Result on the clean generations: a ceiling.** fixed 13/14, ungated 13/14, gated-verbatim
13/14, gated-rules 13/13 green; early/late 0.88→1.00 identically in every arm; 3 cap-halts in
55 readable runs. At a ~7% red-rate the gate never had anything to filter — verdict-blind
inheritance almost never inherits a red, so **ungated ≡ gated by starvation, not refutation**.
Root cause is visible at gen 0: first-shot authorship already lands in the good config region
(catalog + environment note make recall-wiring obvious; furniture-store relevance ranking does
the rest), so inheritance had nothing left to learn. The F7 stall priors came from BLIND
configs; authored configs are never blind. Per probe-05's own doctrine (control mostly greens ⇒
condition invalid, don't compare non-stressed arms): **attempt 1 is an invalid instrument, not
an archive verdict** — no claim read taken.

**Two launcher gaps the outage exposed (both a finding and a fix):**
1. The only pause was the all-red tripwire at generation BOUNDARIES; a mid-generation provider
   outage minted $0 interpreter-red rows until the boundary. §5b says broken middle → escalate
   immediately, never mint rows. Fixed: $0-interpreter-red and provider throws now prompt the
   operator (retry / record / halt) before any row is written.
2. An outage during an AUTHORING call threw uncaught and killed the process — `cohort-result.json`
   was never written; only the append-only ledger survived (the spine pattern earning its keep).
   Fixed: author failures are contained rows, configs/rules/state are persisted per run, and
   `--resume <world>` replays completed rows from the merged ledgers (hash-verified) so a killed
   same-condition run continues instead of re-spending.

**Attempt 2 difficulty redesign (pre-registered before rerun):** the learnable regularity must
live OUTSIDE what the catalog teaches. Conventions move to the litectx `episode` kind while
decoys stay `fact`; the interpreter's recall default is `['fact']`, so a config that omits kinds
— or copies the common fact-only shape — never surfaces the conventions regardless of k
(kind filters are hard; relevance ranking cannot rescue them). "Where knowledge lives" becomes
the environment fact lineages must discover and transmit. capRuns tightens 4→3 to narrow gap-fed
self-recovery. valid.json stays the fixed arm unchanged (it predates this trick — historical,
not crafted; it happens to carry both kinds, making arm A a strong floor, read as context for
C-vs-B, which alone decides the gate claim). Guard: if attempt 2 opens at an all-red generation,
the tripwire fires at gen 0 and the operator halts cheaply — worker-ceiling, not difficulty won.

**F13 addendum (2026-07-09, attempt 2 live):** a third launcher gap surfaced mid-cohort — the
revisor's sealed CLI call at g3-ungated-L1 never settled (CLI child exited, clipipe's own 180s
timeout never fired), hanging the run ~2h with no row minted. A promise that never settles
defeats the guarded try/catch entirely. Launcher-side fix: `withTimeout` races every sealed call
(5min author/extract/revisor, 30min whole-run); a hung revisor degrades to revision-red (the run
continues on its old config — never an unearned interpreter-red), gate HaltErrors still
propagate as cap-halt. **Upstream suspicion (file with F2's clipipe notes): CLIPipeProvider can
leave its promise unsettled after child exit on some path — timeout option did not fire.**
Evidence: /tmp/m6-cohort-7xErzP/g3-ungated-L1/spine.jsonl (last event stall-detected 16:10Z,
process idle ~2h, no claude child).

## F14 — M6 cohort attempt 2: NULL on the claim axis; the informative close is an unregistered teaching channel; full inheritance mechanism demonstrated in one lineage

Live (2026-07-09, `poc/run-m6-cohort.mjs`, world `/tmp/m6-cohort-7xErzP`): complete, 64 rows,
$17.93, no exclusions. One hang mid-cohort (F13 addendum) — killed, `--resume` replayed 48 rows
free, hash-verified, and finished live: the resume machinery worked in anger on first use.

**Pre-registered read (verdict axis, early gens 0–3 vs late 4–7):** flat everywhere —
fixed 0.88→0.75, ungated 0.75→0.75, gated-verbatim 0.63→0.63, gated-rules 0.75→0.75; all
arm differences within ±1 run at n=8 per cell. Gated-verbatim does NOT beat ungated; the fixed
hand config is the best single arm. On the locked claim axis: **the gate is not load-bearing on
this cohort** — the design's exit clause reads archive + boundary map.

**Mechanism (ledger × persisted configs):** the attempt-2 regularity was real and causal —
configs with `episode` in recall kinds greened **at iteration 1 in 14/25 runs (0.56)**; configs
without: **0/38 (0.00)**. Yet total green-rate was identical (0.76 vs 0.74), because the close's
failure output NAMES its tests, so by iteration 2–3 the gap text has taught the worker the very
conventions the store carried. **The informative close is a parallel teaching channel nobody
registered:** it saturates the verdict axis at cap 3 (gap-fed recovery ~0.75 — superseding the
~1/3 §7b.2 prior, which was measured on one harder instance), pushing the memory effect onto
iterations/cost (fixed mean cost-to-green $0.104 vs $0.28–0.35 in learning arms) — axes our own
doctrine (F7 2×2) bars from carrying claims. Attempt 1 saturated by authorship reaching the
catalog-expressible optimum (F13); attempt 2 saturated by the close teaching what memory was
supposed to carry. Same lesson, two channels: **every information path into the worker is part
of the instrument, and each must be registered when the claim read is designed.**

**The claimed mechanism ran end-to-end, n=1 lineage:** gated-rules L1 ground at iterations 2–3
without episode-recall (g0–g3), authored `episode` into kinds at g4 (rules + novelty nudge in
hand) → green @ 1 → the extractor codified "recall across code/doc/fact/episode" → g4–g7 all
episode-wired, ALL green @ iteration 1, at ~⅓ cost. Discover → gate → codify → transmit →
stable expression. L0 never discovered it and kept cap-halting. Inheritance visibly worked —
on the axis that cannot carry the claim.

**Disposition (explicit, pre-registered before any further spend):** two honest doors.
(a) Archive on the pre-registered read; boundary map: verdict-gated inheritance is masked
wherever the close's own output teaches the task's hidden regularities — its value expresses on
efficiency, not verdict, in informative-close environments. (b) One amended attempt 3 with an
OPAQUE close (counts only, no test names), prediction registered now: without gap teaching,
no-episode configs stay red, the verdict axis regains dynamic range, and gated-vs-ungated gets
its first uncontaminated read. ~$12–18 against ~$20 remaining. Symmetric outcome: if the gate
still fails to separate with the leak closed, archive with nothing left to blame.

## F15 — M6 attempt 3 PRE-REGISTRATION: door (b) walked, opaque-close condition declared (results pending)

Decision (hamr, 2026-07-09): exhaust attempts before the verdict — door (b) of F14, one amended
attempt 3. Registered HERE, before any spend.

**Condition (§4b declaration — the close channel):** the close argv becomes
`poc/m6-opaque-close.mjs <suite>` — it runs `node --test` internally and reports **pass/fail
counts only** ("close: N of M tests failing"), plus a suite-did-not-run line when the runner
itself dies; never test names, never assertion text. Exit code remains the verdict; Ralph,
interpreter, schema, tasks, seeds, capRuns 3, arms, and budget stop are attempt-2 verbatim.
`--check` now asserts opacity: the entire red-path gap text must match the counts line.

**Registered prediction (carried from F14, unchanged):** without gap teaching, no-episode
configs stay red; the verdict axis regains dynamic range; gated-vs-ungated gets its first
uncontaminated read. Symmetric commitment: if the gate still does not separate with the leak
closed, archive with nothing left to blame. Baseline priors are per-close-verbosity (F14);
attempt-2 rates do NOT carry over as priors here.

**Results:** PENDING — appended after the run, whatever they say.

### F15 addendum — attempt-3 run halted by provider outage; clipipe error-reporting gap (upstream)

Attempt 3 (world `/tmp/m6-cohort-uTY3nt`) ran clean through g0–g6-gated-verbatim, then died in
the `g6-gated-rules-L0` authoring call: clipipe `ProviderError: process exited with code 1:`
with EMPTY error text, retries failed identically, operator halted (correct per §5b — no rows
minted). Next morning the identical call succeeds — a **provider-side Opus outage window**
(2026-07-09 evening), independently corroborated by unrelated tooling reporting
"claude-opus-4-8 temporarily unavailable" at the same time. Not a launcher or condition defect;
`--resume` continues the same world.

**Upstream (bareagent, consume-don't-paper):** `provider-clipipe.js:180` interpolates only
`stderr` into the ProviderError message, but `claude -p --output-format json` emits its error
payload on STDOUT — so the operator saw a blank reason during a diagnosable outage. Fix belongs
upstream: include a stdout tail (or the parsed JSON error) when stderr is empty. Second clipipe
finding after the unsettled-promise suspicion (F13 addendum).

Two `red:interpreter-red @ 2` rows (g3/g6 gated-verbatim-L1, ~$0.04 each) fell inside the same
evening and are plausibly outage-adjacent (non-$0, so the F13 signature couldn't catch them);
the resume design already refuses to replay interpreter-reds, so both re-run live.

### F15 results — attempt 3 complete: mechanism separates perfectly; gate still not load-bearing on verdict; the residual masker is the worker's own prior

Complete (2026-07-10, world `/tmp/m6-cohort-uTY3nt`, $18.02, 64 rows, no exclusions; resumed
across the F15-addendum outage, 52 rows replayed hash-verified; both outage-window
interpreter-reds re-ran live and greened — outage-adjacency confirmed).

**Prediction scorecard (registered in F14/F15, judged clause by clause):**
- "verdict axis regains dynamic range" — PARTIAL YES: 12 cap-halts (attempt 2: ~0) and, on the
  first-attempt axis, perfect separation.
- "no-episode configs stay red" — **NO**: they greened 0.73 within cap 3 given nothing but a
  pass/fail count. Blind convention-guessing by the worker (Opus-class) recovers most tasks in
  ≤3 attempts with zero informative feedback.
- "gated-vs-ungated uncontaminated read" — YES, and it's null: gated-verbatim late 0.75 vs
  ungated late 0.88 (gate loses); gated-rules late 0.88 ties ungated exactly. Ungated's own
  0.63→0.88 "improvement" has no inheritance to explain it — noise/task-mix — which equally
  forbids reading gated-rules' identical trajectory as inheritance.

**Mechanism (ledger × persisted configs, recall-kinds precise):** configs recalling `episode`:
20/20 green, **green@1 = 0.80**; configs without: green@1 = **0.00 (0/44)**, total green 0.73.
The fixed arm's 1.00 is explained, not anomalous — `valid.json` has always recalled
`["fact","episode"]`; it sits on the conventions ($0.083 mean cost-to-green vs ~$0.34 learning
arms). **gated-rules L1 replicated the full inheritance loop a second time, in a second
close-verbosity condition:** blind g0–g3 → wired episode-recall at g4 → green@1 → extractor
codified → g4–g7 = green@1, green@3, green@1, green@1, tail runs at $0.040–$0.064 (~10× under
arm mean). L0 never discovered it, again.

**Reading:** the pre-registered symmetric commitment fired — the gate does not separate on the
claim axis *with the leak closed and nothing left to blame*. The masker this time is not an
unregistered channel but the **worker's prior**: an Opus-class worker guesses house-convention
regularities within a cap-3 blind search, so memory cannot decide pass/fail — only first-try
rate and cost, axes barred (F7 2×2) from carrying claims. Boundary map, final form:
**verdict-gated harness inheritance is masked wherever the environment's hidden regularities
lie within the worker's guessing reach at the given cap** — informative closes (attempt 2) and
strong workers (attempt 3) are two instances of the same masking. The regime where the claim
could express: weaker/cheaper workers, tighter caps, regularities outside prior reach.
Verdict word (archive per the registered clause) and the ladder-closing PRD v1.5 edit remain
hamr's; recorded here before any decision.

**In plain terms (the whole experiment, one paragraph):** we asked whether an agent's setup —
what it remembers, when it retries, where it looks for notes — can evolve across runs, with
only *proven* successes allowed to pass lessons forward. The machinery all worked: a dumb
un-gameable referee, setups as validated forms, AI-authored setups, mid-run revision, and
lesson inheritance that twice discovered a hidden "which drawer are the house rules in" fact
and transmitted it, making every later run first-try and ~10× cheaper. What failed was the
headline: on strict pass/fail the inheriting teams never beat the non-inheriting one, first
because our tests leaked the answers (attempts 1–2), and finally because the AI worker is
simply smart enough to guess the house rules within three blind tries (attempt 3). Learning
happened and was inherited; on tasks this size, a strong worker just doesn't *need* it to
pass — only to pass instantly and cheaply.

### F15 verdict — ARCHIVED (hamr, 2026-07-10)

The word is given: **archive**, per the pre-registered symmetric commitment. PRD v1.5 (§7d)
closes the ladder with the boundary map; version 0.10.0 is the archive release. Every run in
the denominator; no confident fake green anywhere in the record — the experiment ends the way
it was designed to be allowed to.

## F16 — Successor probe SP-1 PRE-REGISTRATION: weak worker (haiku), boundary-map test (results pending)

**This is NOT M6 attempt 4.** The ladder is closed and the archive verdict stands regardless of
this probe's outcome (PRD v1.5 §7d). SP-1 tests the §7d boundary map itself: "inheritance is
masked wherever regularities are within the worker's guessing reach" predicts the mask LIFTS
when the worker cannot guess. Decision + scope (hamr, 2026-07-10): haiku worker only, ~$5–8.

**Condition (one knob vs attempt 3):** worker model = `claude-haiku-4-5-20251001` via
`--worker-model` (new launcher flag; appends `--model` to the WORKER's sealed CLI call only).
Author, extractor, and revisor stay on the default (opus) — the two-role split is deliberate:
vary guessing ability, hold authoring competence. Everything else attempt-3 verbatim: same 8
tasks, opaque close, capRuns 3, 4 arms × 2 lineages × 8 generations, $38 stop, fresh world.
The world dir records `condition.json`; resume refuses a condition mismatch.

**Registered predictions (before any spend):**
- **P1 (instrument validity / competence floor):** the fixed arm — episode-wired by
  construction — stays ≥ 0.75 green overall. Below that, haiku cannot follow even recalled
  conventions → worker below the competence window → instrument invalid, STOP, no claim read.
- **P2 (the mask lifts):** no-episode configs collapse from opus's 0.73 gap-blind recovery to
  ≤ 0.35 total green (green@1 stays 0.00). Blind convention-guessing was the masker.
- **P3 (the unmasked read):** late-half verdict separates: gated-rules late minus ungated late
  ≥ +0.25 (≥ 2 rows at n=8/cell). This is the §7d prediction proper — memory becomes
  load-bearing on pass/fail when guessing is out of reach.
- Symmetric commitment: if P1 holds and P3 still fails, the boundary map is WRONG as stated —
  worker strength was not the (only) masker — and that gets written down as the result.

**Results:** PENDING.

### Continuation note (2026-07-10, post-archive — not a finding, a pointer)

The archive stands. A successor product was designed in a validated interview the same day:
`docs/plans/2026-07-10-agentic-automation-successor-design.md` (verdict classes hard/soft/HITL
gated per step; both-ways scaffolding evolution; primitive menu with removal; job #1 =
litectx auto-maintainer; new repo after SP-1). SP-1 (F16) results and the SP-2 provider-seam
smoke land here when they conclude; product findings after that belong to the new repo's log.

### SP-2 results — API worker seam PASSES (2026-07-10)

`poc/sp2-api-smoke.mjs`, worker = `AnthropicProvider` (haiku) instead of the claude CLI, fixed
episode-wired config, opaque close, capRuns 3. **Seam verdict: PASS on all axes** — worker runs
on the API; per-call `costUsd` metered and gate-visible ($0.0081/3 calls; the suspected
metering gap did NOT materialize — no upstream finding); cap-halt escalates as its own clean
category; and the failure path (invalid key, from an earlier placeholder run) escalates
decision-ready at $0 instead of crashing — §5b broken-middle behavior holds on a second
provider type. The product's "your APIs" promise is de-risked; local LLMs deferred by decision.

Two side notes: (1) CORRECTED — the first filing here claimed spine `worker-result` events
lack token usage; false. `interpret.js` emits `tokens` per worker-result (verified in the smoke
world: 466/567/421); the smoke script read a wrong field name. No gap anywhere. (2) haiku went
0/3 on task 0 WITH the conventions recalled via the API path — while SP-1's fixed arm (same
config, CLI path) greens. If that divergence holds it's provider-path non-invariance (raw API
worker vs CLI scaffolding), a product-relevant caveat for cross-provider comparisons.

### SP-2 addendum — provider-path non-invariance, confirmed n=3 (2026-07-10)

Same model (haiku), same episode-wired config, recall verified surfacing all 3 notes every
iteration — and the outcome differs by DELIVERY PATH: via the claude CLI the worker greens
(SP-1 fixed arm, 6/6 through g2); via the raw API (`AnthropicProvider`) it capped 3/3 runs
(0/9 attempts), each time failing precisely the note-carried conventions (case-insensitive
units, the RangeError contract that exists only in a seed note). The notes are in context;
the raw-API worker does not apply them.

**Candidate causes (unresolved, in suspicion order):** (1) the CLI wraps input in Claude
Code's own system scaffolding — a strong adherence primer the raw API call lacks (our PERSONA
is one sentence); (2) message structure — CLIPipe flattens system+notes+task into one text
blob, the API path sends structured messages; (3) sampling defaults. Not a bug anywhere —
nothing to fix upstream; it is a property of the instrument.

**Why this matters to the successor product (thesis in miniature):** scaffolding requirement
is a function of the full worker PATH (model × provider × prompt assembly), not the model
alone. The evolving harness is exactly the machinery that would discover path-specific
scaffolding (e.g., render recalled notes more forcefully for raw-API workers) — and lineages
must be keyed per (job × worker path); configs should not be assumed to transfer across
provider paths even at the same model.

## F16 results — SP-1 complete: P1 holds, P2/P3 fail, the symmetric commitment FIRES — boundary map wrong as stated; plus a new credit-attribution finding

Complete (2026-07-10, world `/tmp/m6-cohort-aSqtvl`, $10.70, 64 rows, no exclusions, one
transient interpreter-red).

**Prediction scorecard (F16, clause by clause):**
- **P1 (competence floor) — HOLDS, decisively.** Fixed arm 1.00/1.00, zero cap-halts, mean
  cost-to-green $0.046, mostly green@1. Haiku follows recalled conventions perfectly well
  (via the CLI path; contrast SP-2's API-path divergence).
- **P2 (mask lifts) — FAILS.** No-episode configs greened 0.80 overall (registered threshold:
  ≤0.35) — haiku blind-grinds guessable conventions to green within cap 3 at essentially the
  opus rate (0.80 vs 0.73). green@1 separation stays perfect (episode 0.72 vs no-episode 0.00).
- **P3 (gate separates) — FAILS.** gated-rules late 0.75 vs ungated late 0.88 (gate loses);
  gated-verbatim 0.88 ties ungated. 
- **The pre-registered symmetric commitment fires: the §7d boundary map is WRONG AS STATED.**
  Worker strength is not the masking variable. Rewrite: **verdict-gated inheritance is masked
  wherever the regularities are within ITERATIVE reach at the cap for any worker above the
  competence floor** — guessability of the regularity, not capability of the worker, is the
  discriminating variable. (Attempt 2's informative close, attempt 3's strong worker, and
  SP-1's weak worker are all one mechanism: the environment answers cheap queries.)

**New finding — the credit-attribution gap (unpredicted, the run's most valuable result):**
gated-rules L0/L1 both authored episode-recall at g0 — before any inheritance — and L0
GREENED with it. By g1 both lineages had dropped it and never re-wired it (16 rows, zero
episode after g0). Mechanism: the verdict gate admits whole configs but attributes nothing;
when greens are cheap (blind grind succeeds at 0.80), a green-with-episode looks identical to
a green-without, so the extractor gets no signal about WHICH feature earned the green — and
novelty-nudged authorship drifts off the working feature. Contrast attempt 3, where the g4
discovery greened @1 (dramatic, cheap) and the lesson locked for good. **Corollary for the
successor product: the extractor must receive CONTRAST evidence (this config greened @1 while
siblings ground @3 / capped), not bare green — verdict admits, contrast attributes.** Without
it, inheritance in guessable environments doesn't just plateau — it can lose working features
(gated-rules finished WORST: 0.69 overall, 5 cap-halts).

**Cost read (ranks, never claims):** knowing beats guessing ~4× even at haiku prices ($0.046
fixed vs ~$0.19 learning arms); cohort $10.70 vs opus's $18.02.

**Registered next probe (SP-3, not yet run, ~$6–8):** same everything, IDIOSYNCRATIC
conventions (arbitrary unguessable tokens, e.g. "error codes prefixed XK-", "round to 7
cents"). Isolates guessability — the rewritten map predicts: blind recovery collapses at every
tier, discovery becomes note-only, green@1 contrast becomes dramatic, and codification locks.
If inheritance STILL doesn't lock with the credit signal present, the mechanism itself is in
question — that would be the honest kill.

## F17 — SP-3 PRE-REGISTRATION: the guessability probe (idiosyncratic conventions, results pending)

Tests the F16 rewritten map directly: masking = regularities within iterative reach at the
cap. SP-3 moves the regularities OUT of reach and predicts the mask lifts. Go: hamr, 2026-07-10.

**Condition (one knob vs SP-1):** task set `poc/sp3-tasks.mjs` via `--task-set sp3` — the same
eight function shapes, every house convention replaced with an IDIOSYNCRATIC rule (arbitrary
tokens and prior-inversions: a 128ms tick unit, lowercase-only units, middle-dot byte format
with "empty" zero, single-quote CSV with lowercased unquoted fields, descending ranges with
valid reversed spans, major.minor-only version compare with ignored pre-release, Swiss
apostrophe money with a trailing-DR negative, appended-zero color shorthand with required "#",
dotted lowercase all-parts initials). Notes remain the ONLY path to these rules. Everything
else SP-1 verbatim: haiku worker via CLI, opaque close, capRuns 3, 4 arms × 2 lineages × 8
gens, $38 stop, fresh world, condition-stamped.

**Registered predictions:**
- **Q1 (floor):** the fixed arm (episode-wired) stays ≥ 0.75 green — the notes suffice to
  implement the rules. Below that: tasks too hard even with notes → instrument invalid, STOP.
- **Q2 (the map's core prediction):** no-episode configs collapse to ≤ 0.25 total green
  (SP-1: 0.80) — blind iteration cannot reach arbitrary tokens.
- **Q3 (discovery locks):** any lineage that wires episode-recall and greens RETAINS it in
  every subsequent generation (the attempt-3 lock pattern) — with unguessable rules the green
  is dramatic (@1 vs capped), so codification has signal. If discovery happens in the first
  half, gated arms late beat ungated late by ≥ +0.25.
- **Symmetric commitments:** (a) ¬Q1 → instrument invalid, no map claim either way; (b) Q1 ∧
  ¬Q2 → the F16 rewrite is ALSO wrong — guessability was not the variable; file it and stop
  probing, the product leans on hard-green attribution only; (c) Q1 ∧ Q2 ∧ discovery-happens ∧
  ¬lock → the credit-attribution gap is deeper than F16's account (signal present, still no
  lock) — the mechanism needs redesign before the product trusts inheritance.

**Results:** PENDING.

### F17 addendum — theoretical frame registered pre-readout (2026-07-10, run at g7)

Registered while the SP-3 run was at g7 (63/64 cells logged, `cohort-result.json` not yet
written), so it binds as pre-registration: `docs/00-context/CYBERNETICS.md` maps the
experiment's earned doctrine onto Wiener/Ashby/Conant/Beer/von Foerster and adds one reading
rule and one diagnostic for THIS readout:

- **Conant–Ashby reading (V1):** "every good regulator of a system must be a model of that
  system" predicts Q2 directly — on unguessable conventions the only good regulator is an
  episode-wired config, because the notes are the only declared path to the rules. Q1 ∧ Q2 is
  recorded as a good-regulator demonstration. **Q1 ∧ ¬Q2 requires an explicit leak search
  before commitment (b) fires:** the theorem says a no-episode green means the model got in
  somehow — enumerate every channel (task text, close output, authoring notes, catalog, CLI
  scaffold) and only a clean search concludes "guessability was not the variable." §4b
  precedent, learned twice; not learning it a third time is the point of registering this now.
- **Feedback/feedforward classification (V6):** each green classifies as feedforward-reached
  (recall evidence ∧ green@1) or feedback-reached (iterations > 1 ∧ no recall evidence), from
  ledger + spine. Q3's lock prediction restated in these terms: late gated-arm greens migrate
  feedforward; ungated stays feedback throughout. The grid script computes this alongside the
  registered recallsEpisode read.

The frame changes no prediction, commitment, or threshold in F17 as registered above — it adds
an interpretation ORDER (leak search before any map re-rewrite) and one derived column.

### F17 results — SP-3 complete ($12.93): Q1 holds, Q2 fails at arm level, the V1 leak search
### finds the masker is the system's own M5 revision; Q3's retention clause HOLDS

**Raw readout (evidence `/tmp/m6-cohort-ap1exS`, 64 cells, 0 excluded gens):** fixed 1.00/1.00
early/late; ungated 1.00/1.00; gated-verbatim 1.00/0.88; gated-rules 1.00/1.00. Verdict axis
saturated — again.

**Q1 (floor): HELD, maximally.** Fixed arm 16/16 green, every one @1, mean cost-to-green
$0.030. The notes suffice to implement the idiosyncratic rules first-try.

**Q2 (blind collapse to ≤0.25): FAILED as written — but the V1 reading order (registered at
g7, hours before this analysis) turned the failure into the finding.** The leak search, in
order: task text clean (conventions only in seeds + suite, verified); close genuinely opaque
(counts only, verified); worker genuinely sealed — `--disallowedTools` includes
Read/Glob/Grep/Bash, cwd outside the workspace (the F8 lesson, correctly applied), so the
co-located suite file was UNREACHABLE. The channel that remains is not contamination at all:
**M5 mid-run revision reaching the per-cell seeded store.** The spine shows the same signature
in every blind cell: iterations 1–2 red with recall hits 0–1 (decoy only), stall-detected,
revision-accepted adding a fourth recall kind (`memory.recall.kinds.3` + hook kinds), hits
jump 1→3, green @3. Grid over all 64 cells: ungated 16/16 greens feedback-acquired,
gated-verbatim 13/16 (+1 cap-halt), gated-rules 11/16 acquired + 5 feedforward (the lock,
below). **Genuinely blind greens: 2/64** (gated-verbatim g2/g5 @2, on the two most
semi-natural conventions, csv + version-compare). Blind iteration could NOT reach the
idiosyncratic tokens — the map's mechanism claim was right — but "no-episode config" is not a
stable experimental condition when every arm carries a revisor with run-time access to the
store. The prediction's subject barely exists.

**Q3 (discovery locks): the retention clause HELD.** gated-rules L0's extractor captured
episode-recall into the rules at g3 (`rules/g3-gated-rules-L0.json` is the first with an
episode mention); every subsequent authorship was episode-wired and greened @1 at $0.025–0.068
(~8× under acquisition-path cost): **5/5 generations retained, zero credit loss** — the exact
opposite of F16's g0→g1 loss. Why it held here: on unguessable terrain the knob is
load-bearing, so every generation's winner re-confirms the rule at extraction; on guessable
terrain (F16) blind greens made episode non-load-bearing and the extractor dropped it.
**Retention is free exactly where the knob matters.** L1 never codified it in 8 generations
(16/16 acquisitions, rules still say `[code, fact]`) — discovery-of-codification without
contrast evidence is stochastic, ~1 lineage in 2 per 8 gens. The arm-level clause (gated late
≥ +0.25 over ungated) failed via saturation. One §5b escalation mid-run (g6-gated-rules-L0
interpreter-red at $0, outage signature, operator chose retry) — handled, no row minted while
the middle was down.

**Commitment disposition:** (b) fires in substance — guessability was NOT the (dominant)
masking variable — but with the variable positively identified rather than merely eliminated:
see F18. Stop probing stands: no further token spend needed; F18's confirmation came free from
worlds already on disk.

## F18 — retroactive re-read of SP-1 and attempt 3: the masker was in-run acquisition all
## along; every inheritance channel reads the config-as-authored and discards what the run learned

**The SP-3 grid lens (classify greens by spine evidence — recall hits + revision events — not
by starting config) applied to the two prior worlds still on disk, zero tokens:**

- **SP-1 world (`aSqtvl`, haiku × house conventions, $10.70 — F16's cohort):** blind-arm
  greens: **1 genuinely blind, 37 feedback-acquired** (ungated 13/13, gated-verbatim 13/14,
  gated-rules 11/11). F16's "blind recovery 0.80 ≈ opus, therefore guessability" was a
  misread: haiku wasn't guessing the house conventions, it was stall→revise→recall, same as
  SP-3. Capability-invariance is exactly what an acquisition mechanism predicts (revision is
  capability-invariant) and what a guessing mechanism doesn't.
- **Attempt-3 world (`7xErzP`, opus × house conventions, $17.93 — F15's cohort):** blind-arm
  greens: **5 genuinely blind, 24 feedback-acquired.** F15's "the residual masker is the
  worker's own prior" was mostly the same misread; opus shows a real but minor prior effect
  (5 vs haiku's 1–2 blind greens).

**One mechanism, three misattributions.** F15 called it worker prior; F16 called it
guessability; both analyses classified runs by `configs/*.json` — the config-as-authored —
which is blind to M5 revision. The actual masker across all three cohorts: **the run is
ultrastable (M5 + seeded store), so it acquires requisite variety in-run and the run-level
verdict saturates regardless of gate.** In Conant–Ashby terms (CYBERNETICS.md, registered
pre-readout): every good regulator became a model of the task — the regulator is the RUN
(config + revisor + store), not the config, and prediction Q2 was written about the wrong
regulator. The F14 informative-close masker remains real and distinct; F15/F16's maskers
collapse into this one.

**The structural corollary (root of the credit-attribution gap):** ungated discovered
episode-recall in-run 16/16 times in SP-3 and retained it 0/16 — because every inheritance
channel (ungated, verbatim, one-knob mutation) reads the config-as-AUTHORED, and the revised
config is discarded at run end. The run's learning is structurally invisible to lineage; the
ONLY channel that can see the run-as-executed is the rules extractor reading the ledger/spine
— which is why codification was the sole retention path in every cohort. **Design law for the
successor: inherit and extract from the run-as-executed (final revised config + spine
evidence), never the run-as-authored — still verdict-gated (an ungated run-as-executed
channel would inherit drift, the fit-to-pass surface §2 warns about).**

**What this closes:** the probe track. Q1 machinery proven (notes → first-try greens at
~$0.03), the masker positively identified with direct spine evidence in three cohorts, the
lock demonstrated with zero credit loss on load-bearing terrain, and the successor's
inheritance mechanism corrected before a line of it was written. No rerun (SP-3b) is
registered: a revision-off cohort would manufacture verdict-axis separation we can already
read mechanistically from the V6 class, at real token cost and no additional information.

### F18 addendum — the remaining free re-reads: F14 confirmed distinct; the contrast bit was
### in the ledger all along (2026-07-10, zero tokens)

- **Attempt-2 world (`dQtNOb`, informative close) under the acquisition lens:** all 52 greens
  are blind-greens — zero revision events, zero recall-hit jumps, and 0/62 configs
  episode-wired at start. The workers greened from the close's teaching alone. **F14 stands as
  a real and DISTINCT masker** (close-channel teaching), cleanly separated from F18's
  acquisition masker by one lens: informative-close cohorts green without touching the store;
  opaque-close cohorts green by acquiring it. (`uTY3nt`, the attempt-3 outage-halted world,
  matches the acquisition pattern as expected.)
- **V2 retro-validation PASSED — and sharpened the design law.** The contrast bit for the
  episode-recall knob (bit = some with-knob run green@1 ∧ some without-knob run not-green@1,
  same gen, ledger-computable) was present in **16/16 generations across SP-1 and SP-3**, with
  perfect separation: with-knob green@1 in every generation, without-knob green@1 = 0 in both
  worlds. The which-knob signal ALWAYS existed in the ledger — including SP-1 g0, where the
  credit was lost anyway. The credit-attribution gap was never a missing-signal problem; it is
  an extractor-visibility problem (the extractor reads its own run only, never the ledger).
  V2's successor rule is confirmed implementable: bits are countable from the ledger alone.

## F19 — ATTEMPT-4 PRE-REGISTRATION: the original claim on a valid instrument (revision OFF ×
## idiosyncratic conventions, results pending)

F18 established that in-run acquisition (M5 + seeded store) masked the verdict axis in every
prior cohort. Attempt 4 removes it: **cross-run search becomes the only discovery path**, and
the gated-vs-ungated claim (§1) gets its first read on an instrument where it can express.
Registered before launch; go: hamr, 2026-07-10.

**Condition (one knob vs SP-3):** `--no-revision` — the revisor is omitted from every arm
(interpret runs M2-style; no stall revision). Everything else SP-3 verbatim: sp3 idiosyncratic
tasks, haiku worker, opaque close, capRuns 3, 4 arms × 2 lineages × 8 gens, $38 stop, fresh
world, condition-stamped (`revision: off`). **Declared instrument fix (filed, not silent):**
the mutation catalog's `memory.recall.kinds` axis was shrink-first, making a missing kind
unreachable from any multi-kind parent — the winning knob sat outside the catalog's reach,
F13's mirror (V5's pre-flight, applied). Now grow-first (add first missing kind in KINDS
order; still deterministic, still one knob): episode is one kinds-mutation away from the
typical `[code,doc,fact]` authored config.

**Registered predictions:**
- **P1 (floor):** fixed stays ≥ 0.75 green, all @1 — revision was never load-bearing for the
  episode-wired config (it never stalls).
- **P2 (the F18 mechanism claim):** genuinely blind greens stay ≤ SP-3's residue (~0.03);
  learning-arm greens occur ONLY in cells whose config carries episode recall at authorship
  (via mutation or rules-seeded authorship). Blind cells cap-halt.
- **P3 (the §1 claim, at last):** after a lineage's first episode-wired green, gated arms
  retain it (post-discovery green rate ≥ 0.75) and ungated does not reliably (verdict-blind
  inheritance keeps mutating regardless of outcome); late-half green-rate gap
  (gated − ungated) ≥ +0.25.
- **Symmetric commitments:** (a) ¬P1 → instrument invalid, no claim either way; (b) P1 ∧ ¬P2 →
  another in-run path exists → V1 leak-search order before any conclusion; (c) P1 ∧ P2 ∧ ¬P3 →
  **the gate is not load-bearing on a valid instrument — the original archive verdict is
  CONFIRMED CLEAN; record it and never reopen**; (d) P1 ∧ P2 ∧ P3 → the archived claim was
  masked, not false — the archive verdict stands (it was correct on its evidence), the record
  gains the annotation, and the successor builds on gated inheritance with confidence.

### F19 results — attempt 4 complete ($8.29): P1 ∧ P2 ∧ P3 — commitment (d) FIRES. The §1
### claim expresses on a valid instrument: gated late 1.00 vs ungated late 0.13

Evidence `/tmp/m6-cohort-K9Ofzk`, 64 cells, 0 excluded gens.

- **P1 HELD:** fixed 16/16 green (15 @1, one @2), late 1.00 ≥ 0.75.
- **P2 HELD:** with the revisor gone, in-run acquisition is zero (0 revision events, no recall-
  hit jumps anywhere) and blind cells cap-halt. Genuinely blind greens: **1/64** (ungated g5,
  @2, the semi-natural version-compare instance — inside the registered residue). Every other
  learning-arm green is episode-wired-at-authorship, green@1.
- **P3 HELD, categorically:** late green-rate — gated-verbatim **1.00**, gated-rules **1.00**,
  ungated **0.13**; gap +0.87 ≥ +0.25. Both gated arms: one early failure (L1 cap-halt at g0),
  re-authored, drew an episode-wired config at g0/g1, greened @1, and the gate locked it —
  15/16 feedforward thereafter, zero losses. Ungated: dragged its g0 cap-halted config forward
  verdict-blind for all 8 generations, mutating one knob per gen, and never reached episode.
- **Anatomy of the separation (named honestly):** the gate's contribution is TWO semantics,
  both pre-registered as the arm's definition — failures never enter the lineage (so a
  failed lineage re-draws authorship until something greens), and greens lock. Ungated's
  failure is the mirror: it never re-draws (its parent always exists, verdict-blind) and its
  one-knob walk was structurally slow — the g4 kinds mutation fired but KINDS order
  (`[code,doc,fact,episode]`) added `doc` first; episode sat two kinds-visits away (~16 gens
  at the novelty picker's pace). Mutation discovery contributed nothing in this horizon in
  either direction; authorship re-draw + gate retention did all the work. One anomaly:
  g3-ungated-L1 `red:interpreter-red` at $0.085 (paid, not the $0 outage signature; single
  cell, no bearing on any read).
- **Commitment (d) disposition:** the archived claim was **masked, not false**. The archive
  verdict stands — it was correct on its evidence — and the record gains this annotation: on
  the first instrument where in-run acquisition was removed (F18) and the regularity sat
  outside prior reach (F17), verdict-gated inheritance beat ungated inheritance categorically
  on the claim axis, in both gated representations.

## F20 — SUCCESSOR POC #1 PRE-REGISTRATION: run-as-executed inheritance (inherit=executed,
## results pending)

The F18 design law — inherit the run-as-executed, never the run-as-authored — is untested
inference until this runs. This is the successor product's M3-class kill-switch, run on
adaptlearn machinery before the new repo is cut. Registered before launch; go: hamr,
2026-07-10.

**Condition (one knob vs SP-3):** `--inherit executed` — runOnce returns the config the run
ENDED with (new `config-final` spine event; persisted per cell for resume); ungated and
gated-verbatim inherit it, gated-rules extracts from it. Revision stays ON (the point: in-run
learning must be able to enter the lineage). Everything else SP-3 verbatim; condition-stamped
(`inherit: executed`).

**Registered predictions:**
- **P1 (transmission — the kill-switch):** after a lineage's first feedback-acquired green,
  its next generation starts episode-wired; feedforward greens (V6 class) appear in ungated
  and gated-verbatim by the cohort's second half. If ¬P1, run-as-executed inheritance does not
  transmit and the successor's core mechanism needs redesign BEFORE the product is built.
- **P2 (rank evidence only):** arms that lock trend toward fixed-arm cost-to-green (~$0.03 vs
  ~$0.24 acquisition path).
- **P3 (the gate's role, restated for executed inheritance):** ungated inherits from cap-halt
  and red runs too — predicted drift/junk accumulation and occasional loss of the acquired
  knob; gated-verbatim (green ∧ cheaper only) locks cleaner. Discriminator:
  retention-after-first-acquisition rate, gated ≥ ungated.
- **Symmetric commitments:** ¬P1 → successor mechanism redesign (hard stop on the product's
  inheritance story); P1 ∧ ¬P3 → the gate adds nothing even under executed inheritance —
  successor leans on HITL verdict classes and hard-green attribution instead of gate-based
  selection.

### F20 results — successor POC #1 complete ($7.03): the kill-switch PASSES — run-as-executed
### inheritance transmits 100% at the first generation boundary; the gate discriminator did not fire

Evidence `/tmp/m6-cohort-vVsQda`, 64 cells, 0 excluded gens.

- **P1 HELD — total transmission.** g0: all six learning-lineages feedback-acquired (red → red
  → revise-to-episode → green@3), exactly as SP-3. g1: **every one of the six starts
  episode-wired and greens @1** — the g0 in-run acquisition entered the lineage through the
  executed config and paid off immediately. From g1 to g7 the cohort is near-uniformly
  feedforward (55/64 cells green@1 overall); the handful of re-acquisitions (e.g.
  g6-gated-rules-L1) recovered within their own run. The credit-attribution gap, closed
  mechanically: what F16 watched die at the g0→g1 boundary survived it in 6/6 lineages.
- **P2 (rank evidence only):** cohort total $7.03 vs SP-3's $12.93 — executed inheritance
  roughly halved cohort cost by deleting the per-generation re-acquisition tax (~$0.20/cell →
  ~$0.03–0.07 post-lock).
- **P3 NOT supported at this horizon — the commitment fires.** Ungated retained the acquired
  knob 14/16 epi0 with late green 1.00, indistinguishable from the gated arms; no drift loss
  in 8 generations. Under executed inheritance the gate added nothing observable here. Per the
  registered commitment: the successor leans on HITL verdict classes and hard-green
  attribution rather than assuming gate-based selection adds value — while noting the honest
  bound: 8 generations of one-knob drift on a task family where the knob is load-bearing is a
  short window for junk accumulation; the fit-to-pass risk (§2) is deferred, not refuted.
- **Verdict axis, for the record:** all four arms 1.00/1.00 early/late — saturated by design
  (revision stayed on); the result lives entirely in the V6 mechanism class, as registered.

**F19 + F20 together, one sentence each:** authored inheritance needs the gate (F19: +0.87
categorical separation); executed inheritance transmits so completely that the gate's value
moves to the risks an 8-gen window cannot show (F20). The successor takes both: inherit the
run-as-executed, verdict-gate what enters the lineage, and let attribution (V2 contrast bits)
say which knob earned the green.

## F21 — BARELOOP DE-RISK PROBE (menu breadth): the primitive-menu axis is WIRED IN — one
## admitted verb flipped 0/3 cap-halt to 3/3 green@1 where it had purchase, moved nothing
## where it was inert; and partial retrieval POISONED gap attribution

**Track note:** this is successor (bareloop) de-risk work run in the adaptlearn sandbox —
same posture as F20. Pre-registered before spend in `poc/menu-breadth-prereg.md` (question,
falsifier, categorical read, grounded amendments); runner `poc/probe-menu-breadth.mjs`;
evidence `docs/archive/evidence/menu-breadth-rpcu95/`. The archive record is unchanged.

**Question (bareloop design decision #3):** the successor discloses the full bare-suite
primitive menu but admits verbs per job. Is menu breadth a live contrast variable — does
admitting one more *callable* verb change outcome — or is the registry decoration? M3
kill-switch logic on a new axis. The extra verb was litectx `impact` (schema v1's named v2
exclusion), chosen because its relevance is structural and binary (callers exist or don't) —
the one extra primitive whose load-bearingness cannot be rigged by tuning the base menu.

**Design:** menus one knob apart (A = [recall], C = [recall, impact]); MAIN task = fix
`formatLabel` under 8 caller-module constraints (recall k=5 structurally cannot enumerate 8;
impact returns all 8, bodies via the get() fetch-toll); FALSIFIER task = fix a zero-caller
leaf parser (impact provably inert, conventions recall-surfaceable in notes); identical world
furniture, shared close, cap 4, clipipe. Four machinery negatives measured token-free before
spend: stubs red / references green, impact 8/8, recall 4/8, A/C exactly-one-block contrast.

**Results (12/12 cells):**
- MAIN: A 0/3 green (3× cap-halt@4, §5b category confirmed on every spine) — C 3/3 green@1.
- FALSIFIER: A 3/3 green@1 — C 3/3 green@1 (the impact op *fired* and injected its inert
  "no callers" form: op presence moved nothing; only content did).
- Pre-registered read: **WIRED-IN**, no confound → bareloop builds the admission registry
  (disclosure → request-red → admit). The B-arm (disclosed-but-locked) is the registered
  follow-up, to run in bareloop.
- Cleanest cut — iteration 1, uncontaminated (real code, both arms, all reps): C green@1 3/3;
  A red@1 3/3 failing exactly {badge, price, qty} — the three callers recall did not surface.
  The failure signature IS the information gap, deterministic across reps.

**Mechanism finding (unexpected, the probe's most valuable output):** partial retrieval
doesn't just under-inform — it **poisons gap attribution**. The A worker took recall's 4
callers as the complete set and *dismissed the 3 real failing tests as another repo's noise*
(verbatim in main-A-0's final artifact: it "ignored the … badge/price/qty failures as
unrelated to this repo's four callers"). Ranked top-k ⇒ false confidence of completeness ⇒
genuine close evidence discarded. Structural-exhaustive verbs earn admission by preventing
evidence MISATTRIBUTION, not by adding context — the worker-side rhyme of F16/F18's "verdict
admits, contrast attributes."

**Instrument caveat (honest bound):** A's iterations 2–4 are contaminated — under the
confusing gap the worker broke persona and emitted prose with a mid-text fenced block;
`stripFences` (probe copy AND graduated `interpret.js:27` — port note only, repo closed)
strips only leading/trailing fences, so prose landed in the artifact → SyntaxError gaps
replaced test-level feedback for the rest of the run. "A can never green at cap 4" is NOT
established; the @1 contrast and 0/3-at-cap under this instrument are. bareloop port notes:
(1) a non-code artifact must red as its own category (**artifact-red**), never corrupt the
close signal; (2) artifact extraction must handle prose-wrapped fences. Notably the persona
break occurred ONLY in the narrow arm — plausibly downstream of the info gap itself, but not
cleanly attributable.

**Lib friction (filed as A3):** a world under bare `git init` indexes NOTHING silently —
litectx `collectFiles` (`src/indexer.js:41`) trusts `git ls-files`, which is empty in a
commit-less repo, and `index()` gives no signal that zero files were collected. Found live by
machinery negative #2 (impact 0/8) before any token burned; fixed here by committing seed
files (the honest fix — litectx targets real repos). Ask: surface an empty collect.

## F22 — BARELOOP DE-RISK PROBE #2 (menu disclosure): the ADMISSION CHAIN PROVES END-TO-END
## (author selects → dispatch injects → 3/3 green@1); author choice and authoring-time asks
## are both CARGO-CULT (no need signal); the §4b disclosure-leak concern is unsupported

**Track note:** successor (bareloop) probe #2, F21's registered follow-up + author-side
selection, run in the adaptlearn sandbox. Pre-registered in `poc/menu-disclosure-prereg.md`
(three questions, three conditions, predictions and the leak's named legal path committed
before spend). Evidence: `docs/archive/evidence/menu-disclosure-RuUllB/` (run 2, complete,
27/27 cells readable) and `menu-disclosure-hhD2yp/` (run 1: run cells VOID on two instrument
failures — kept for the postmortem; authoring cells load-bearing). Record unchanged.

**Design:** one axis — how litectx `impact` is disclosed to the M4 AUTHOR: D0 absent (stock
catalog) | D1 admitted (selected → dispatched) | D2 locked (selected → request-red, skipped).
Authoring {D0,D1,D2} × {MAIN, LEAF} × 3; runs MAIN-only on each rep's own authored config,
cap 4, clipipe. Schema v1 stayed closed (impact stripped-and-counted before stock
validation). Six machinery-negative groups, incl. two added after run 1's postmortem.

**Results (run 2, world RuUllB):**
- **P4 HOLDS — the probe's keystone.** D1 3/3 green@1 vs D0 1/3 green@[4]: author reads
  menu → selects impact → dispatch injects 8 callers → first-try green. F21-C reproduced
  through the AUTHORED path — bareloop decision #3's admission chain demonstrated end-to-end,
  in both authored op orders.
- **P1 CARGO-CULT, replicated across both worlds.** D1 selects impact 3/3 MAIN and 3/3 LEAF
  (pooled 6/6, 6/6). Free listing exerts zero selection pressure; author selection is NOT a
  need signal.
- **P2 ALIVE, but run 1's "lock creates discrimination" DID NOT REPLICATE.** D2 asks: MAIN
  6/6 pooled, LEAF 4/6 pooled (1/3 then 3/3). The lock keeps the ask channel alive; it does
  not need-weight it. Downgraded to weak trend — a live demonstration of why single-world
  findings don't get designed around (the pre-registered replication caught it).
- **P3: catBeats fired in the OPPOSITE direction to the leak hypothesis** (D0 1/3 vs D2 0/3;
  listing-without-capability never helped). Registered config-inspection procedure: no
  systematic recall-widening in D2. The §4b catalog-leak concern is UNSUPPORTED here.
- **Bonus reads:** (a) locked ops fire request-red EVERY iteration (4/run) — within-run
  request-red frequency is a free, structured need signal, stronger than the authoring-time
  ask; (b) one D0 cell ground to green@4 under the fixed instrument — sharpening F21's bound:
  the narrow menu CAN occasionally grind to green; the wide menu makes it deterministic @1.
  The menu buys first-try certainty (~4× iterations), i.e. it lives on the cost axis, exactly
  where across-run selection (green gates, cost ranks) reads it.

**Run 1 postmortem (instrument, both found in spines, both fixed + negative-guarded):**
(1) op-composition clobber — recall ASSIGNED context while impact appends; authored
[impact, recall] order erased the caller view, every D1 worker ran effectively-D0; fixed to
append-only composition with a machinery negative driving the REAL dispatch path (fails on
the old code). (2) provider crashes killed all 3 D2 runs at iteration 1; fixed with one
retry + 30s backoff, second failure tags the cell provider-red and EXCLUDES it from every
read (§5b: a broken middle is never a verdict). Run 2 absorbed two provider timeouts through
this seam with zero cells lost.

**Design consequence for bareloop (incl. hamr's primary/secondary tiering question):**
author selection cannot curate (cargo-cult, robust) and authoring-time asks cannot curate
(non-replicated) — so menu choice management must be EVIDENCE-driven: secondary tier locked
by default, admission steered by within-run request-red frequency plus outcome contrast, and
post-green menu expansion as an across-runs mutation knob (one primitive per mutation, green
gates, cost ranks, removal symmetric).

## F23 — BARELOOP DE-RISK PROBE #3 (declared truncation): NULL — the label is NOT load-bearing,
## because F21's attribution-poisoning mechanism DOES NOT REPLICATE under the fixed instrument;
## the narrow arm's real failure mode is hunting, not dismissal; artifact-red revalidated

**Track note:** successor (bareloop) probe #3, gating bareloop PRD v1.6 commitment #5
(amplifier-truncation rule). Pre-registered in `poc/truncation-declared-prereg.md` before
spend; runner `poc/probe-truncation-declared.mjs`; evidence
`docs/archive/evidence/truncation-declared-E1wCrp/` (12/12 cells readable, two provider
timeouts absorbed, zero exclusions). The archive record is unchanged.

**Question:** is the VSM manifest rule "every amplifier declares its truncation" load-bearing
— does labeling recall's injected block "ranked top-k, may be incomplete" restore honest gap
attribution in the narrow arm — or is attribution only fixed structurally (F21's admission
answer)? One knob: the declaration parenthetical in the context header (U undeclared vs T
declared), F21 world verbatim, narrow menu only, F22 fixed instrument. Primary read is an
observer-only per-test meter: does the iteration-2 artifact (first authored after seeing the
gap) pass ≥2/3 of the {badge, price, qty} tests recall cannot surface.

**Results:** MAIN attribution@2 **U 3/3 | T 3/3** → pre-registered NULL (no separation).
MAIN outcome U 0/3, T 0/3 green (narrow-arm cap-halt bound replicated; pooled 0/9 narrow vs
wide green@1 6/6 across F21/F22). FALSIFIER U 3/3 ≈ T 3/3 green@1 — guard clean, no confound.
Iteration-1 gapOnly 0 everywhere (no leak). The runner's canned null wording ("poisoning
persists") was wrong for this data — the null took its other shape:

**The retro-read is the probe's real output: F21's poisoning mechanism does not replicate.**
Zero dismissal prose in all 24 main-arm artifacts; every narrow-arm worker adopted the gap
evidence at iteration 2; the cleanest counter-example (main-U-0@2, UNDECLARED arm) annotates
each convention "verified" (from the gap diff) vs "INFERRED (exact input/output truncated)"
— the worker declares its own evidence truncation unprompted. F21's poisoning quote came from
a single cell's final artifact inside the stripFences-contaminated region. F22's lesson, one
level down: single-world sub-findings don't get designed around — and single-CELL
sub-findings harvested from a contaminated instrument region especially don't. F21's headline
(menu axis WIRED-IN) is untouched and replicated here again.

**What narrow-arm failure actually is (observational):** hunting (Wiener), not dismissal —
attribution lands @2 (~4-5/8), then oscillates: fixing gap conventions breaks
previously-passing ones under a partial caller view; cap 4 halts mid-oscillation. The wide
menu's value re-reads as delivering the whole constraint set at once (convergence@1), not as
preventing misattribution.

**Instrument (revalidates the F21 artifact-red port note):** one reply was prose + UNFENCED
code — last-fence extraction passes it through whole → SyntaxError artifact → the close reds
"artifact invalid" while meaning "code wrong". No extraction heuristic closes this class; a
non-code artifact needs its own red category (artifact-red). Persona breaks concentrated in
the info-starved MAIN arms (U 4, T 7 vs falsifier 1) — direction consistent with F21, small-n.

**Consequence for bareloop (commitment #5, gate honored both directions):** the full
amplifier rule does NOT enter. The floor survives — ranked views never claim exhaustiveness;
exhaustive views may — but re-grounded: it rests on the manifest/honesty principle (injection-
side twin of ledger ABSENT-not-fabricated), not on a demonstrated poisoning mechanism. The
successor seed PRD §11 amplifier-manifest item is annotated accordingly.
