# bareloop — findings

No papering over. Every friction point — with the bare suite (filed in
`docs/UPSTREAM-ASKS.md` and upstream), with the schema (a "can't express" is a finding, not
a workaround), or with the build ladder (a rung that can't meet its exit stops the ladder;
the stop is a result) — is logged here, grounded in source (file:line) or in the spine
(run + seq). "Works as intended" is also a finding.

Numbering starts at F1 in this repo. adaptlearn's F1–F23 are a closed record at
`docs/00-context/FINDINGS.md` — cite them as `adaptlearn F<n>`, never renumber.

## F1 — first contact with the suite as a CONSUMER surfaced two upstream gaps; both fixed-and-consumed same session (two-red routing, working as designed)

N0's very first act — `npm install` of the three suite deps — hit both halves of the
upstream story before a line of bareloop code ran:

1. **bare-agent@0.26.0 peer range three minors stale.** `peerOptional bareguard "^0.9.0"`
   vs bareguard@0.12.0 on the registry → hard `ERESOLVE`. The tempting local shim
   (`--legacy-peer-deps`) is exactly what the fix-and-consume rule (PRD v1.1 §3) exists to
   prevent. Fixed upstream (bareagent PR #13): range widened to `>=0.9.0 <0.13.0` with the
   upper bound evidence-backed — bareagent's 758 tests green against bareguard 0.12.0.
2. **Types-only drift between two suite packages.** bareguard `Decision.reason` is
   `string | null`; bare-agent's structural `GateDecision` typedef declared
   `reason?: string` — so the FIRST checkJs+strictNullChecks consumer to pass a real
   `Gate` into `wireGate()` (that's us; adaptlearn ran untyped) fails typecheck while the
   runtime is perfectly null-safe. adaptlearn F5's lesson one level up: it's not just that
   the export you bind can be wider than the function you call — two packages' DECLARED
   types can disagree about the same value while their runtimes agree. Only a typed
   consumer catches it; LIBRARY_CONVENTIONS §2 (checkJs in every repo) is what makes the
   drift class visible at all. Fixed upstream (bareagent PR #14): `reason` admits null.

Both fixes shipped in bare-agent@0.26.2 (hamr published); bareloop consumes `^0.26.2` — no shims anywhere.
**Verdict: the two-red routing rule survived first contact, and the port itself was
uneventful — 70/70 reference-semantics tests green on the first full run, typecheck clean
under checkJs+strictNullChecks.** Because code and tests were ported together (the suite
never got its watch-it-fail moment), the rewrite was validated by mutation: seven planted
defects, one per load-bearing behavior — NODE_TEST_CONTEXT strip (fake green), unnamed-throw
category masquerade, F9 mid-glob acceptance, config-final dropped, arbiter-touch vouched
through, extractor trim-instead-of-reject, onLlmResult unwired (the F3 blind-budget trap) —
each redded the suite (≥1 targeted failure), all reverted, 70/70 restored. Final validation
ran against the PUBLISHED registry packages (bare-agent 0.26.2, bareguard 0.12.0, litectx
0.28.0), not local checkouts. (Port scope note: the five N0 modules carry the
ralph/validate/interpret/extract test semantics — 70 tests of adaptlearn's 122; the
remainder cover experiment-side modules (author/mutate/cohort/revise/contrast) that are
not N0 surface. revise.js's one interpreter-facing behavior — revisor spend metered by the
run's own gate — is preserved as an interpret test with an inline gated revisor.)

## F2 — the menu probes return (adaptlearn F21/F22, consumed): the registry gate is MET — the admission registry builds; author selection carries ZERO need signal; need is read off the ledger

The PRD v1.2 probe assignment concluded upstream (adaptlearn F21 menu-breadth, F22 menu-
disclosure — successor-POC track, both pre-registered, evidence archived in adaptlearn).
Consumed here the way §2 consumes F1–F20: settled, not re-proven.

**The gate fired the build way.** The pre-registered condition was "measurable separation
BEFORE the request-red registry is built; no separation → registry dies unbuilt." F21:
one admitted verb (litectx `impact`) flipped MAIN from 0/3 cap-halt to 3/3 green@1 where
it had purchase, and moved nothing where inert (falsifier arm) — the menu axis is WIRED-IN,
categorically. F22 P4: the full admission chain (author reads menu → selects → dispatch
injects → green@1) proved end-to-end through the AUTHORED path, 3/3 vs 1/3. **The
request-red registry gets built (~N3/N4 per §10), with its curation rules rewritten by the
same evidence — see PRD addendum v1.4.**

**The selection asymmetry (hamr's carry-sentence, the probe's most useful single fact):**
the author never missed the tool it needed (6/6 selected `impact` where callers mattered
— zero false negatives) and never abstained from one it didn't (6/6 grabbed it where it
returns nothing — all false positives). Selections are a SUPERSET of need: what the agent
chose carries no information (cargo-cult, replicated across both worlds); what it NEEDED
stays recoverable from run evidence. The asymmetry points the friendly way: over-grabbing
is cheap and self-correcting (inert extras change nothing in-run — F21 falsifier; cost-
ranking strips dead weight across runs), while under-grabbing was fatal (0/3 at cap). If
the bias ran the other way, list-all would be dangerous; as it is, full disclosure is
confirmed safe AND useful.

**Where need actually reads out (F22 bonus):** a locked-but-selected op fires request-red
EVERY iteration — within-run request-red frequency is a free, structured need signal,
stronger than authoring-time asks (which did not replicate as need-weighted: P2 downgraded
to weak trend). Outcome contrast (green@1 vs grind vs cap) attributes the rest. The §4b
disclosure-leak concern is UNSUPPORTED (P3: listing-without-capability never helped).

**Mechanism finding worth its own line (F21):** partial retrieval doesn't just under-
inform — it POISONS gap attribution: ranked top-k retrieval gave the worker false
confidence of completeness and it dismissed real failing tests as noise. Structural-
exhaustive verbs earn admission by preventing evidence MISATTRIBUTION, not by adding
context — the worker-side rhyme of "verdict admits, contrast attributes."

> **Corrected by F3 (2026-07-12, adaptlearn F23):** the poisoning mechanism does not
> replicate under the fixed instrument — its evidence lived in a single cell inside the
> stripFences-contaminated region. Narrow-arm failure is hunting, not dismissal; the wide
> menu's value re-reads as convergence@1 (the whole constraint set at once). The
> admission conclusion above stands; only this mechanism story is retired.

**Port requirements filed for N2 (from F21's instrument caveat, plus the N0 code review):**
(1) a non-code artifact must red as its own category — **artifact-red** — never corrupt the
close signal; (2) artifact extraction must handle prose-wrapped and mid-text fences
(`stripFences` strips leading/trailing only; `src/interpret.js` carries the same bound at
N0 by design — it is reference-semantics parity, upgraded at N2 when the real job loop
lands); (3) the close **timeout** joins the shell's options surface (`src/ralph.js`
hardcodes 120s — a real repo suite slower than that reads as broken-close, deterministically);
(4) the close **gap bound** becomes a named option and tail-biased (`src/ralph.js` head-
truncates at 2000 chars; a big suite's failure detail prints last, so the worker's only
feedback channel can carry zero signal while the budget burns).

## F3 — the declared-truncation probe returns NULL (adaptlearn F23, consumed): truncation declarations are HYGIENE, not load-bearing; F2's poisoning-mechanism line is retired; artifact-red revalidated

The last assigned adaptlearn probe concluded (F23, v0.11.5, evidence
`truncation-declared-E1wCrp`, pre-registered before spend, falsifier clean, zero
exclusions). Consumed the F2 way: settled upstream, not re-proven.

**The gate honored both directions (PRD v1.7 #3, annotated ANSWERED):** attribution@2 was
3/3 in BOTH arms — declaring the injected view "ranked top-k, may be incomplete" changed
nothing, because there was no poisoning to cure. The declaration ships as a near-free
honesty marker (injection-side twin of the ledger's ABSENT-not-fabricated), is **never a
review blocker**, and is **never relied on for attribution** — that fix stays structural
(exhaustive verbs, admission).

**The probe's real output is a retro-read: F21's poisoning mechanism does not replicate.**
Zero dismissal prose across all 24 main-arm artifacts; every narrow-arm worker adopted the
gap evidence by iteration 2; one undeclared-arm worker even annotated its own conventions
"verified" vs "INFERRED (truncated)" unprompted. The original poisoning quote came from a
single cell inside the stripFences-contaminated instrument region — F22's lesson one level
down: single-CELL sub-findings from a contaminated region don't get designed around.
Narrow-arm failure is **hunting** (attribution lands @2, then fixing gap conventions
breaks passing ones under the partial view; cap halts mid-oscillation), so the wide menu's
value re-reads as **convergence@1 — the whole constraint set at once**. F21's WIRED-IN
headline is untouched and replicated a third time (narrow 0/9 pooled vs wide 6/6 green@1).

**Corrections applied in this repo (no silent drops):** F2's mechanism paragraph annotated
above; PRD v1.4 §4 mechanism doctrine annotated; CYBERNETICS self-healing registration's
amplifier entry synced to ANSWERED. Superseded text stays in place per house style — the
annotations are the change record.

**Side yield, filed requirement reaffirmed:** one probe reply was prose + UNFENCED code —
no extraction heuristic closes that class; **artifact-red** (F2 port requirement #1, PRD
v1.4 §5) is revalidated for N2. With F23 consumed, no adaptlearn probes remain assigned or
pending; the one open prediction is bareloop-side — V7/coordination-red, fires on job #1.

## F4 — N1 POC: the close chain IS expressible as pure declarative data with every attacked fit-to-pass surface redding at validation; the job spec is a SECOND schema, not a v1 extension

`poc/n1-job-schema.mjs` (never ships; `files` whitelist excludes `poc/`), token-free by
construction (no provider import). Riskiest assumption attacked: the arbiter side — job,
cadence, budget, per-step close chain — can be pure data (no freeform code anywhere) with
every gaming attempt producing a NAMED red (code AND path pinned; "some red somewhere"
would let a wrong-reason red fake a pass) before tokens exist. 20 cases: job #1 exactly as
PRD §6 defines it (real target, not a fixture authored to pass) validates green;
18 adversarial negatives red where aimed; 1 must-not-red guard (an env *reference* in a
close cmd stays legal — only literals red). **Negatives mutation-validated:** three
planted defects in the real validator (hierarchy check killed, shell-cap bound killed,
close unknown-field guard killed) each failed exactly their targeted cases (1/2/2), all
restored, 20/20 clean — the first-run 20/20 was audited, not believed.

**Structural readout (the v1-extension-vs-v2 question, answered by evidence):** two
documents, two validators. `validateConfig` (workflow, agent-authored) is untouched — its
close/provider inexpressibility guard was exercised through the REAL shipped path
(smuggled `close` → `unknown-field:close`). `validateJob` (job spec, operator-owned,
`schema: "job-v1"`) is new, and guards the split from the other side by the same
mechanism: `hooks`/`loop`/`memory` and any minting claim are unknown-field reds. The
close-authoring hierarchy (PRD §7) enforces as a class menu keyed by close type —
predicate/gold→hard, rubric→soft only, hitl⇔hitl — so verdict-class laundering
(rubric-as-hard) is a named red, `close-hierarchy`. The `{ok, reds, config}` API change
absorbs cleanly as `{ok, reds, job}` (normalized spec returned, single parse).

> **Review addendum (2026-07-12, post-build /code-review medium, 8 agent angles +
> execution-verified):** the POC's claim held where it was attacked and failed where it
> wasn't — every one of the 8 findings sat on an edge the POC never adversarially probed:
> nested objects (cadence/escalation accepted unknown keys — the one smuggling level left
> open), the fence OPTION's own input (non-array fence failed OPEN; malformed fence lied
> scope-escape), cross-document spelling equivalence ('src/' fence deadlocked contained
> configs — normalization now lives in the shared globToPrefix), canon-vs-JSON semantics
> (approval hash diverged across a disk round-trip; checkApproval could throw), SECRET_RE's
> missing left boundary (flask-sqlalchemy redded), the fence not reaching interpret (the
> choke point where the Gate is built), no sweep on the AGENT-authored config, and
> aliasing-tautological deepEquals in the new tests. All fixed test-first (13 new failing
> tests → 143/143), 5 fresh mutations killed exactly their targets, and the original
> feature batteries stayed green through every fix — detection still detects, containment
> still contains. Process lesson worth its line: mutation testing proves the checks you
> WROTE can fail; it cannot see the checks you never wrote — adversarial review is the
> complement, not a repeat.

**Bounded claims + surfaced design questions (N1 interview, not POC scope):**
(1) the secrets sweep is a literal-pattern deny — it catches known token shapes
(sk-/ghp_/AKIA/xox…) and passed its false-positive probe, but a novel or encoded secret
passes; it is defense-in-depth, never the defense (env-only loading stays the hard line).
(2) A predicate close's `cmd` IS code in shell form — legal because the arbiter side is
operator-owned, but the moment the close-authoring UX lets an agent DRAFT the chain,
drafted text enters the arbiter: **who signs the job spec** is a design decision law #1
forces, and the POC cannot answer it. (3) Not covered, deliberately (no silent caps):
per-step budget splits, retry policy, V3 channel-condition declarations, job-level write
scopes, cadence→Scheduler mapping, coordination-red placement — N1-proper design, several
interview-gated.

## F5 — a second review round caught a containment escape the FIRST round's fix introduced; the deep secrets choke point (spine) is deferred on a V4 tension, not missed

Round-two `/code-review` (medium, 8 agent angles) on the hardening commit found **8
verified findings, the top one a design-law-#1 breach the hardening commit itself
introduced**: the fence-normalization added to `globToPrefix` (round one, fixing a
cross-document spelling deadlock) stripped a leading `./` before collapsing `//`, so
`.//src/**` normalized to the ABSOLUTE prefix `/src` — validated green, escaped the run
dir at `resolve(workdir, '/src')`. Five independent finders caught it; reproduced live.
Fixed at three depths (normalization order; a `scopeContained` belt on the normalized
prefix; an `interpret` enforcement belt that refuses an escaping Gate) plus six more
(canon/toJSON, jobSpecHash-never-throws, SECRET_RE boundary, fence null, fence-invalid
attribution, `legalScopeEntry`). All TDD'd, 147/147, 5 fresh mutations each killing their
target, feature batteries green throughout.

**The lesson, paid for twice now (compounds F4's):** a fix aimed at one spelling bug
opened a WORSE same-helper spelling bug, and the round-one mutation pass could not see it —
because mutation tests only prove the checks you WROTE can fail, and no test pinned the
`.//` input. Adversarial review is the complement to mutation testing, not a repeat; a
normalization/parsing change deserves its own escape-spelling battery before it ships.

**The spine secrets choke point (finding #8) — RESOLVED at source, and the V4 tension
dissolved on inspection.** Close stderr/stdout (`gap`) could carry a secret a checked
command echoes (a 401 dumping a `Bearer …` header) into the append-only spine and the next
worker prompt — a hard-line breach ("secrets never enter the spine"). The first framing
called this a two-hard-line collision with **design law #7 / V4** (escalation text must
reach the human BYTE-IDENTICAL to what the shell emitted). That collision is not real once
you place the redactor correctly: V4 forbids an EMERGENT component from summarizing the
pain channel; a **fixed shell primitive** is not emergent. So the scrub lives in the shell
at the SOURCE — `runClose` (`src/ralph.js`) redacts the gap the moment it is captured, so
the shell's canonical emission IS the redacted text and everything downstream is
byte-identical to it. The redactor is **injected**, not imported (ralph stays stdlib-only
and un-gameable); `src/interpret.js` — the layer that owns bareguard — passes bareguard's
exported `redact` (BG-1 `Bearer`/`sk-` patterns). A benign gap returns byte-identical; the
failure still reaches the human, just without the token. The bareguard UPSTREAM-ASK was
WITHDRAWN (redact was already exported). Reading the lib source before filing would have
saved the round-trip — a small process note. TDD'd end to end (secret in close output
reaches neither the spine nor the worker prompt; benign gap byte-identical), mutation-
checked (neuter the scrub OR unwire interpret → the hard-line test reds), 151/151.

## F6 — N2 drafting probe GREEN on one shot; the probe's $0.0000 cost was a harness confound that surfaced a real ledger rule: unpriced is never free

**The headline (POC #2, `poc/n2-drafting-probe.mjs`, real tokens):** claude-sonnet-5,
given job #1's spec and a schema DESCRIPTION built live from the validator's exported
menus — deliberately NO copyable example config, so the probe could fail — drafted a
workflow config that validated **GREEN on the first shot**: correct verb-slot legality
(recall/compress → before-attempt, stash → after-red, remember → on-green), fence inside
the job's writeScope, budget at the ceiling, legal enum values throughout. The central-
claim risk of design decision #3 (agent drafts every run) is retired for N2; the
one-sealed-shot + one-redraft default stands with headroom to spare.

**The confound, audited before belief (Dev Rules: a degenerate number is a suspect, not
a result):** the probe reported `spent=$0.0000` for a real API call. Cause: bare-agent's
`AnthropicProvider.generate()` does not price calls — pricing lives in `Loop`'s round
accounting (provider-reported `costUsd` if finite, else the pricing table). The probe
called `generate()` directly, so `costUsd` was `undefined` and the probe's `?? 0`
coerced it to zero; the $0.10 cap guard never bound. Harness bug, not free tokens.

**The rule it mints for the N2 runner (cap-not-estimate closes over pricing):** the
budget ledger must treat an UNPRICED result as a stop condition, never as $0 — a
`costUsd` of `null`/`undefined` accumulating as zero makes the hard cap gameable by
any unpriced model or provider path. bare-agent's own bareguard adapter carries the
same doctrine ("a null (unpriced) cost must NOT coerce to 0"). Runner requirement
filed: `runJob`'s ledger halts (`pricing-red`, decision-ready) on an unpriced
worker-result instead of counting it free; drafting calls route through the same
accounting, not around it (the probe went around it — that is exactly the class of
bypass the rule exists to red).

**Addendum (same day, module 2 build):** the F6 rule caught SHIPPED code within hours.
`interpret`'s cost emit read `metrics?.costUsd ?? cost` — but when a Loop run prices
nothing, `metrics.costUsd` is the honest `null` while `cost` is `0` (the sum of zero
priced rounds), so the `??` chain laundered the explicit-unknown into a silent $0 — the
exact class F6 names. Fixed: when metrics exist their `costUsd` is authoritative (null
included), and `unpricedRounds` rides the event so a PARTIALLY unpriced run (finite but
under-counted costUsd) is visible too; the runner halts `pricing-red` on either signal.
TDD: both F6 tests watched failing against the shipped emit before the fix.

**Addendum 2 (same day, module 3 build):** the sweep continued into `extract.js` and the
same class hid there twice more. The rules-path cost read `metrics?.costUsd ?? cost ?? 0`
(the identical launder chain), and the transport-throw path reported a failed call's
spend as `costUsd: 0` — spend nobody measured, counted as free. Both fixed to the honest
null, and the contract is now documented in the JSDoc return type: `costUsd:
number|null`, null means "spend unknown," callers must not coerce it to 0. Running total:
the rule minted from the probe's own harness confound has caught **three silent $0
launderings in shipped code within one day** (interpret's cost emit + two in extract.js).
`runJob` halts `pricing-red` on a null cost OR `unpricedRounds > 0` — partially-unpriced
is also never free.

## F7 — the FIRST real run of job #1 (token-free, real litectx) found two defects no unit test could have: the cadenced no-op PR and the stranded checkout

**The setup (rung-exit run, `scripts/run-job1.mjs --dry`, real litectx checkout, ZERO
tokens):** litectx is genuinely green — 390 tests pass, no TODOs, freshly released. So
job #1's `suite` step ran its close (`npm test`, the real suite) in the close-first
precheck, greened, and skipped: `already-green`, **$0.0000, zero provider calls**, spine
terminal and secrets-clean. The resume/cadence claim — "a clean cadenced rerun costs zero
provider calls" — is now MEASURED against a real repo (29s wall clock, all of it the real
suite), not asserted. The provider binding was one that THROWS if called, so any spend
would have been a loud failure rather than a silent number.

**Defect 1 — a cadenced no-op still tried to open a PR, every day, forever.** With every
step skipped, the `hitl` step still ran branch → add → commit, and `git commit` correctly
failed ("nothing added to commit") → `pr-red` + a decision-ready escalation. A daily
maintainer job on a green repo would therefore hand the human a broken-PR escalation
every single morning. The doctrinal error: **a hitl close is a human decision point, and
with no changes there IS no decision.** Fixed: the hitl step checks the fence
(`git status --porcelain -- <fence>`) first; an affirmatively-clean fence emits
`pr-skipped` + `step-end: already-green` and the job ends **green** — no PR, no
escalation, no noise. Only a CLEAN answer skips: a failed check (not a repo, broken git)
falls through to the PR path and reds honestly there — an unknown fence state is never a
green.

**Defect 2 — the run left the checkout stranded on its own branch.** `openDraftPr` did
`git checkout -b` and never came back, so the workdir sat on `bareloop/<job>-<id>`
afterwards. On a cadence that compounds: tomorrow's run branches off yesterday's UNMERGED
branch and judges its close against that state — silent inheritance through the working
tree, which is exactly the kind of un-attributed carry-over this product exists to
prevent. Fixed: the starting branch is read BEFORE anything moves and restored on EVERY
path, success or failure; a restore that itself fails is a loud `workdir-red` (naming the
branch the checkout is stranded on) and never un-opens a real PR.

**The lesson (why the rung exit is a rung and not a formality):** both defects live in the
seam between the runner and a real repository's state — the exact place a stubbed `exec`
seam cannot see, because the stub answers whatever the test asked it to. Twenty-one runner
tests, three review rounds, and a mutation pass had all been green over this code. **One
run against a real checkout, spending nothing, found both in under a minute.** The
close-first skip built the same day is what made the no-op path reachable at all — the
feature and the bug it exposed arrived together, which is the honest argument for running
the real thing as early as the ladder allows.

**Still unproven (the honest boundary):** the real-model tool-mode worker call and a real
GitHub draft PR. Both need a key and a push to a live repo — neither can be claimed until
it is run, and this finding claims neither.

## F8–F16 — the first REAL-MODEL runs of job #1: nine defects, six of them invisible to a stubbed seam, and a rung-exit stop

**Setup:** `scripts/run-job1.mjs` against a real litectx clone with a real regression injected
(a `>= 3` → `> 3` off-by-one in `keywords()`, which reds 3 recall tests). Real key, real
tokens, `claude-sonnet-5`, $1.5 job budget, tool mode. Nine runs. Every fix below was
reproduced as a failing test first and mutation-checked; the suite went 245 → 257.

**F8 — the close ran in the WRONG REPOSITORY.** `runClose` called `spawnSync` with no `cwd`,
so `npm test` executed in *bareloop's* directory, not the job's. The precheck greened
against bareloop's suite while litectx sat red — the arbiter, whose entire authority is
"exit code is truth", was judging a different tree. **Every test in the suite missed it
because every test close named an ABSOLUTE path** (`node --test /tmp/…/suite.mjs`), so cwd
never mattered; a real close (`npm test`, `make check`) is cwd-relative by nature. This
also invalidated the earlier token-free run's "litectx greened in the precheck" — that was
this bug, not evidence. `cwd` now threads runner → ralph → spawnSync.

**F9 — the drafting prompt advertised a bound the shell's own spend invalidated, and every
real run deadlocked.** The prompt said `gate.budgetUsd <= 1.5` (the job budget); by the time
the draft was validated, the drafting call itself had cost $0.0053, so the validator enforced
`<= 1.4947` and red it. The redraft was told the same stale ceiling, claimed it again, and
the run died `config-red` having burned two paid calls. A rational drafter claims the
ceiling it is given — **the real model claimed exactly it, every time.** The stub never saw
it because it drafts $1.00, comfortably under. Fix: the shell reserves its own drafting
allowance (`DRAFT_RESERVE_FRAC`) and advertises `budget − reserve` — one number, advertised
and enforced. It is a CAP, not an estimate: overspend it and the run stops on the budget
story it is.

**F10 — the worker was never told where the repository is.** The tool persona demands
absolute paths, but bare-agent's shell tools resolve relative paths against the PROCESS cwd,
and nothing ever named the workdir. The real worker groped: it read `/home/hamr`, then the
runner's own directory, then `/`. The fence denied all three and the denial streak stopped
the run. **Containment held perfectly; the task was impossible.** The prompt now states the
absolute root.

**F11 — a network failure was filed as a broken interpreter.** A run died `read ENETUNREACH`
mid-worker-call and escalated `interpreter-red` — "fix the middle" — when the honest decision
was "the network failed, retry". A throw out of `loop.run()` is provider territory by
definition; it is now `provider-red`, the class the drafting path already had. (The old test
pinning this had itself encoded the misclassification: its "interpreter crash" fixture was a
throwing *provider*.)

**F12 — spend inside an attempt that HALTS was invisible, and the ledger under-reported by
300×.** The gate halted the worker at its own cap having genuinely spent **$1.4375**; the job
ledger reported **$0.0048**. Cause: the ledger accounted `worker-result`, which is emitted
only after `loop.run()` RETURNS — and a halted attempt never returns. A whole attempt's
tokens vanished, and the escalation lied to the human about the money. **Money is now metered
per ROUND** (`worker-round`, at bare-agent's `onLlmResult` seam), as it is spent — including
the round that trips the cap. This is F6's family: a call that never returns is not free.

**F13 — the worker was asked to fix a failure it could not see.** The precheck had the close's
output the whole time; it was withheld on the doctrine that "no attempt exists yet, so feeding
it would be a lie". That confused ATTRIBUTING AN ATTEMPT with DESCRIBING THE TREE — and the
`run` verb is locked, so the worker cannot execute the suite itself. It was hired to fix a red
suite while blindfolded. The close's current output now reaches the first attempt, framed as
what it is: the tree's state, not an attempt of the worker's.

**F14 — the worker read the arbiter's private books.** `readScope` is the workdir, which
contains the run's own machinery: the real worker read `gate-audit.jsonl` (the gate's ledger),
its own spine, and the `.smoke` store. The agent never authors its arbiter — it does not get
to read its records either: that is an invitation to fit-to-pass and it fills the context with
bookkeeping instead of code. Now denied (`fs.deny`), and the spine moved outside the tree.

**F15 — the gap bound hid every failure it existed to show.** The tail-biased bound (400 head
+ 1500 tail, minted on the premise that "the useful output is at the END") is *false for a
large TAP stream*: the 3 failing tests sat in the MIDDLE of 391 subtests and were truncated
away. The worker was told "3 failed" and nothing else. **A close's output format is part of
the job's contract with the worker** — job #1's close is now `node --test --test-reporter=dot`,
whose failures (with assertion diffs and file:line) land in the tail where the bound looks.

**F16 — one attempt spent the entire budget and never reached the close.** The tool persona
never said the worker was inside a loop, so the model did the rational one-shot thing: read
everything, be certain, then act. It read for 12 rounds and never wrote once — no write, no
close verdict, no gap, no learning. The loop never looped. bare-agent has no per-call round
bound by design (iteration is governed by the gate's cumulative `maxTurns`), so the only
honest lever is the persona: the worker is now told it is one attempt inside
`while close-red and under-cap`, that it will be re-run with the close's verdict, and that
every file it reads is re-sent on every later round.

**The rung-exit result: a STOP, and the stop is the finding.** With F8–F16 fixed, the worker
now behaves correctly — it reads the failing tests, follows the causal chain, and reached
`tokenize.js`, the true culprit — **and still exhausts the budget before writing a fix.** The
cost curve is the reason: tool-loop context compounds (every read is re-sent every round), so
the run grew 2.3k → 121k tokens and its last round alone cost $0.25. Under the doctrinal $2
shell cap this job does not green. Three levers exist, and each is a decision, not a bug:
(1) **wire bare-agent's stash/compaction** (`Loop({trim})` + litectx as `ctx`) into the middle
— the suite already ships it, and this is composition, not invention, but *whose* territory the
ceiling belongs to (shell cap vs config `memory`) is undecided; (2) **admit the `run` verb** —
this run IS the capability-gap evidence the ledger was built to count: a worker that could run
one targeted test file would need a fraction of the reads; (3) **raise the shell cap** (locked
at $2 by doctrine — operator's call, never the agent's).

**The lesson, and it is the same one every time:** all six of F8–F12's defects live in the seam
between the runner and a *real* repository with a *real* model, and the stub answered whatever
the test asked it to. Twenty-one runner tests, three review rounds and two mutation passes were
green over that code. Nine real runs — most of them costing pennies — found nine defects, two
of which (the arbiter judging the wrong repo; the ledger under-counting spend 300×) go to the
integrity of the two things this product claims are un-gameable.

## F17 — the forbidden zone was reachable, and its worst outcome was a FAKE GREEN: the arbiter greened a tree that had run no tests at all

**Where:** `src/ralph.js` (`runClose`, `ralph`), `src/run.js` (close-first precheck), `src/job.js`
and `src/validate.js` (the two validators). Consumed from adaptlearn F25/V10
(`docs/plans/2026-07-13-forbidden-zone-audit-spec.md`), which shipped three build rules. Two of
them survived contact with a real runner. **One did not, and the correction is the finding.**

### What adaptlearn shipped, and why rule 3 could not be built as written

Rule 3 said: treat **"exit nonzero ∧ zero tests executed"** as `close-crashed`. Against `node --test`
the count is **never zero** — node **synthesizes one failing test for the file that crashed at
load**, so a crash reports `tests 1 / pass 0 / fail 1`, which is byte-identical in counts to an
honest one-assertion failure:

| | tests | pass | fail | exit |
|---|---|---|---|---|
| crash at load (no real test ran) | 1 | 0 | 1 | 1 |
| honest red (one failing assertion) | 1 | 0 | 1 | 1 |

The counts are as blind as the exit code. The probe could not have found this: it ran the rule
against a hand-built fixture, never against a real runner's real output. **The signal cannot be
"zero judged" — it must be a FLOOR against a declared baseline.** litectx runs 391 tests; a close
claiming it judged 1 did not judge, whatever it exited.

Second collision, same family: **the `dot` reporter prints no summary counts at all** — and `dot`
is the reporter F15 had just moved job #1 to (failures land in the tail, where the gap bound
looks). F15's fix and F25's rule 3 were in direct conflict. Job #1's close moved to
`--test-reporter=spec`, which prints **both** the counts and the failing tests with assertion
diffs at the end. Verified against the real suite: gap = 1927 bytes, naming the real failing
tests with `file:line`.

### The headline: the worst forbidden-zone outcome was a fake green, not a red

adaptlearn's rule only guarded the **nonzero** side. hamr's call was to guard **both bands**
("A yes, on green too"). That call was vindicated empirically within the hour. Running job #1's
close against a tree containing no test suite — the **F8 wrong-repository class**, the defect
this repo had *already* found once:

```
WRONG TREE → without judged:  verdict = satisfied,  unaudited = true   ← A FAKE GREEN
WRONG TREE → with judged:     verdict = crashed,    judgedCount = 0
```

`node --test` in a tree with no tests **exits 0**. So the shipped arbiter, pointed at the wrong
tree, did not red — it **greened**, and the job would have reported its work done having judged
nothing. That is design law #8's "the only real failure is a confident fake green", live, and it
is *unreachable* by a red-side-only guard. Had we stayed inside adaptlearn's finding, this case
would still be open. **A guard written only for the failing side cannot see the failure that
matters most.**

### The four named outcomes (the arbiter no longer rounds)

`runClose` now returns a verdict only when judgment was actually rendered. Everything else gets
its own name, its own escalation, its own human decision — and is **never retried** (retrying a
broken arbiter is the §5b violation adaptlearn found live in its own shell):

| verdict | what happened | escalation | the human's actual options |
|---|---|---|---|
| `failed` | the close cannot RUN | `broken-close` | fix the argv |
| `timed-out` | ran, never finished judging | `close-timeout` | **raise the timeout** / make it faster |
| `killed` | died by signal (status null, no spawn error) | `close-killed` | re-run / fix the environment (OOM) |
| `crashed` | ran, exited, judged nothing | `close-crashed` | fix the crash / fix the argv / lower the floor |

`timed-out` is split out of `failed` because "raise the timeout" and "fix the command" are
different answers — pooling them erases the decision information the escalation exists to carry
(F25's Z-2 collapse). The two prior tests that pinned `timeout → broken-close` **encoded the
collapse** and were rewritten; their still-true assertions (terminates, never retried) moved to
the new tests.

### Two more defects found while wiring it

- **`close.expect` was validated and never used.** The job schema has taken an integer exit code
  since N1; `runClose` hardcoded `status === 0`. A human signing `expect: 1` was judged against 0,
  silently. A knob the arbiter declares and does not honor is a fit-to-pass surface with a
  respectable name. Now threaded and honored.
- **The workflow validator's unknown-field guard was top-level only.** `loop`, `memory`,
  `memory.recall`, `gate`, `escalation` all accepted **arbitrary keys** — so an agent-drafted
  config could carry `gate.judged` (the close's own honesty check) or `gate.maxCostUsd` and
  validate **green**. Nothing consumed them, so nothing broke; but the doctrine this product
  rests on is *"the arbiter split is guarded both directions by inexpressibility"*, and a guard
  that stops one level down does not deliver that. Inexpressibility is now enforced per section,
  at every depth the arbiter can be reached from. The lesson generalizes: **an inexpressibility
  claim is only as deep as its unknown-field check.**

### Judgment floor: what it catches, and what it is NOT for

The floor catches **"the arbiter did not run"** — wrong tree, broken argv, a failed import in a
widely-shared module, a runner that never started. It does **not** catch a single test file
crashing at load among 390 healthy ones, and it should not: that is an honest red about the tree,
and the worker should fix it. The forbidden zone is about the *arbiter* failing to render
judgment — never about the code under test being broken.

`judged` is **optional** (a linter or a `hitl` close has nothing to count; a human *is* the
judgment). Its absence stamps `unaudited: true` on the close verdict and emits a loud
`close-unaudited` event — the blind spot is **named** on the record rather than passed off as a
trustworthy exit code.

**Suite 257 → 277**, every new check watched failing first, five mutations caught (timeout not
split; signal-kill falling through — the F25 bug itself; the floor never tripping; `expect`
hardcoded to 0; the section guard removed). Typecheck clean.

## F18 — the N2 cost curve was never a context problem: prompt caching was OFF, and the loop re-bought its whole transcript at full price every round

**Pre-registered** (arms, predictions and confounds written before any spend): control vs
compaction vs retrieval vs gap-quality, one knob apart, on the real litectx clone with the
same planted one-character regression in `tokenize.js`. **The pre-registration was wrong
about the mechanism, and the instrument caught it before the arms ran.**

### The measurement that broke my own hypothesis

I had been explaining the rung-exit stop as *transcript compounding* — "every file the worker
reads is re-sent every round." That story was right about the *shape* and wrong about the
*cause*, and I could not have known which until I decomposed the cost. `worker-round` recorded
only `inputTokens + outputTokens`, and bare-agent documents `inputTokens` as the **uncached**
prompt remainder — so a round that re-pays for half the repo and a round that reads it fresh
carry the **same number**. I was reasoning about a cost driver with an instrument that could
not see it. Instrumented the seam first (all four priced tiers + the call `kind`), then re-ran.

**Control, real model, real litectx:**

```
fresh input   754,836 tok      RE-SENT (cache read)  0 tok      cache writes  0 tok
spend $1.5519 · 14 rounds · cap-halt · zero writes · never fixed the bug
```

**Zero cached tokens.** Not "a little caching" — none. bare-agent's own JSDoc says why:
*"Anthropic does NOT auto-cache, so without this its cache tiers are always 0."* And
`cache_control` is settable **only on `system`** — never on `messages`. In a tool loop the
transcript *is* the tool results, and `_toAnthropicMessage()` rebuilds them from scratch,
discarding anything a caller attaches. There is no seam (`assemble` included) through which
bareloop could mark the prefix. **The loop re-buys its entire transcript at full input price,
every single round.** (Filed: UPSTREAM-ASKS **BA-1**.)

### What the fix is worth — measured against the real API, one knob apart

|  | round 1 | round 2 | round 3 | round 4 |
|---|---|---|---|---|
| today (no breakpoint) | $0.1524 | $0.1525 | $0.1525 | $0.1526 |
| rolling `cache_control` | $0.1903 *(writes cache)* | **$0.0162** | **$0.0162** | **$0.0163** |

**9.4× cheaper per round** in steady state; the 1.25× cache write is paid once. The
never-decreasing flat line in row 1 *is* the bug: the same 50,484 tokens, re-bought forever.

### End to end on job #1 — and the honest limit of the result

Provider patched **in a scratch copy** (`node_modules` untouched, never shipped — the fix
belongs upstream, design law #10), everything else identical:

| arm | greened | spend | rounds | fresh input | cache-read | re-reads |
|---|---|---|---|---|---|---|
| **A0 control** (n=2) | **0/2** | $1.55 / $1.56 | 14 / 21 | 754,836 | **0** | 8 of 15, 12 of 22 |
| **A5 cached** (n=2) | **1/2** | $1.09 / $1.43 | 18 / **49** | 35 / 96 | 2.29M / **2.86M** | 9 of 18, **42 of 49** |

**Job #1 greened for the first time** — the worker found `tokenize.js`, wrote the correct
`>= 3`, and the suite passed 390/391, verified independently. Same budget, ~**4× the context
throughput per dollar**; last round $0.25 → $0.04.

**And it does not replicate.** 1 of 2. Reported as such: **prompt caching is necessary, not
sufficient.** In the failing rep the worker ran **49 rounds and re-read the same 7 files 42
times (86% thrash)** — given cheap context it did not get smarter, it ground longer before
running out of money. A single green is not a result; the stop stands until it replicates.

### Why it thrashes — the second gap, and the one that now matters

`shell_read`'s only knob is `maxBytes`, measured **from byte zero**. There is **no offset**.
A worker facing a 117 KB file can swallow it whole or re-read the same prefix — it cannot
look at the middle. The control run read `src/store.js` (117 KB) **nine times** and
`src/index.js` (90 KB) three times, dragging **1.37 MB of source** through context to find a
one-character bug in a 3.4 KB file. It was not being stupid: **it was trying to page through a
file with a tool that has no pager.** (Filed: UPSTREAM-ASKS **BA-2**.) hamr's retrieval
proposal — litectx `recall` for chunks instead of whole-file reads — attacks exactly this, and
bare-agent already ships the bridge (`liteCtxMcpBridgeConfig`: `recall · get · impact ·
recent`, read-only). It is now the *only* remaining lever, not one of three.

### Lessons minted

- **A cost claim needs an instrument that can see cost.** `tokens` was a sum of two tiers
  priced 10× apart. Every "context is compounding" sentence in the F16 comment and in my own
  plan was written on a number that could not distinguish re-payment from reading. *Decompose
  before you diagnose.*
- **A degenerate reading is a finding, not noise.** `cache-read = 0` looked like a broken
  metric. Auditing it against the library's source — instead of assuming my parser was wrong —
  is what surfaced BA-1. (The rule paid out twice: it also caught `.trim()` eating the leading
  status column of `git status --porcelain`, which would have silently mis-reported "the worker
  wrote nothing.")
- **n=1 on a nondeterministic worker is an anecdote.** The first cached run greened and I very
  nearly wrote it up as a win. The replication reds it. *Replicate before you claim.*
- **Cheap context does not buy competence.** Lowering the price of a round made the worker
  thrash *more* (9 re-reads → 42), not less. Cost and capability are separate axes, and a
  cost fix must never be reported as a capability fix.

## F19 — the retrieval verbs work exactly as designed and moved the outcome ZERO: cost and capability are separate axes, demonstrated a SECOND time

litectx 0.29.1 shipped the ranged read that BA-2 and LC-1 were blocked on: `get(path,
{startLine, endLine})` fetches ONE chunk (code + docstring), content-hash gated, throws
`StalePointerError` on drift rather than serving a different symbol's body; it refuses any
range that is not a chunk boundary, so it cannot be widened into a whole-file read. Two tool
defs were built on it (`src/interpret.js`): `ctx_recall` → pointers only (path/symbol/
line-range, no bodies); `ctx_get` → one chunk. `TOOL_MENU` (`src/job.js`) widened to
`read/grep/write/recall/get`; **`run` stays locked** (asserted in `tests/job.test.js`).
Both gated as READS by the same fence (deny-list still covers gate-audit/`.smoke`/`.litectx`).
The job spec `jobs/litectx-maintainer.json` grants the two verbs; the persona carries the
strategy (recall the symbol, fetch the chunk, don't page the file).

**Measured free, before any spend, on the real litectx clone with the planted bug:**
`recall('keywords')` → pointer `src/tokenize.js keywords function_declaration lines 64-71`,
rank 1, 2ms; `get(path,{64,71})` → **260 B** vs **3,482 B** whole file (13.4×), containing
the bug AND its refutation (docstring "length >= 3", code `> 3`). The `StalePointerError`
gate was verified live (drift the file, re-get old lines → threw, did not lie).

**The retrieval arm (n=1, cached provider): the mechanism was fixed and the outcome did not
move.** Whole-file reads **41 → 11**, whole-file re-reads **42 → 7**, all retrieval costing
**18,494 B** of context (tool mix: shell_read=11 shell_grep=14 ctx_recall=28 ctx_get=7). AND:
still step-red, still cap-halt, **$1.43, ZERO writes**, context still climbed to 134,882
tokens. Second time this happened (F18: caching made it thrash MORE). **Cheap context does
not buy competence; precise retrieval does not buy diagnosis.**

**Recall-injection is not a debugger — search only finds what you can NAME.** The planted bug
is in `src/tokenize.js`; `keywords()` feeds recall, so the FAILING tests are memory tests
(`test/memory-w4.test.js:52`, `test/memory.test.js`). Recall on the task text OR on the gap
(the test-failure output) returns MEMORY chunks — confidently, uselessly — and would have
injected 14,944 B / 8,258 B of irrelevant chunks, ADDING to the bloat. The symptom and the
cause live in different files; my own "query the gap instead of the task" idea was falsified
by the same test.

**Semantic-search probe (hamr's challenge "did you use semantic search?"): lexical is the
better instrument for symbol lookup, and I nearly mis-reported it.** Flipping `embeddings` on
first gave BYTE-IDENTICAL results — a harness confound: indexing is INCREMENTAL, so flipping
it on an EXISTING index computes NO vectors and the tier is silently inert (tell: "index 7ms"
for 206 files). Forced rebuild (26,223ms — vectors genuinely computed):

| query | BM25 | BM25+semantic |
|---|---|---|
| the task text | missed | missed |
| the gap (test-failure output) | missed | missed |
| plain English "the word filter drops short words" | missed | missed |
| the word `keywords` | **found #1** | found, DEMOTED to #4 |

For `code` hits, embeddings only RE-RANK a BM25-gated pool — they **cannot nominate** (KNN
nomination applies to `fact`/`episode` only). So exact-symbol lookup is best served lexical;
the ctx tools index BM25-only, deliberately. Two instrument failures I created and fixed
along the way: the gate audit collapsed `shell_read` and `ctx_get` both to `{type:'read',
path}` (blind to the one variable the arm existed to test — fixed: `args:{tool}` rides the
action, new `ctx-tool` spine event records query/hits/outcome/bytes); and the POC harness's
"wrote anything?" read `git status --porcelain`, which ALWAYS shows `M src/tokenize.js` (that
IS the plant), reporting a write in every arm including arms with zero writes — fixed to read
WRITE actions from the gate audit. Truth: **zero writes, every arm.**

## F20 — the attempt was never bounded, and the close had NEVER RUN — in any arm, ever: Ralph never ralphed

Spine, retrieval arm: `ATTEMPTS (iteration-start): 1 · worker rounds: 55 · close runs: 0 ·
cap-halt: halt:gate.terminated`. **The close NEVER RAN — not once, in ANY arm ever run
(control, caching, retrieval). Every arm was a one-shot blind worker, not a loop.** The worker
never received a single verdict, gap, or piece of feedback; it ended only when the model CHOSE
to stop calling tools, and a worker never told it is wrong does not stop. Attempt #1 drank the
entire $1.50.

**Cause:** bareguard's `limits.maxTurns` is a RUN-wide halt — the Gate is constructed once per
run — so `maxTurns: (mode==='tools'?24:8)*(capRuns+1)` = 96 reads as a per-attempt budget but
functions as one pooled ceiling. **Nothing bounded a single attempt.** This is NEW machinery,
not an adaptlearn regression: adaptlearn's worker was tool-free (F8), one attempt = ONE LLM
call, so an attempt COULD NOT run away. Tool mode (module 2b) introduced the unbounded attempt
and shipped without the bound its predecessor never needed. Every prior N2 finding about the
"loop" (F16, F18's thrash reps) was measured on a worker that had never once looped.

**Fix (shipped, TDD, watched failing twice for two different real reasons):**
`TURNS_PER_ATTEMPT = mode==='tools' ? 24 : 8`; count worker rounds per attempt in
`meteredOnLlmResult` (kind==='turn' only — a summarizer fold is an LLM call but not a worker
round); at the bound emit `attempt-bounded` and call `loop.stop()`; reset the counter per
attempt. The next attempt is TOLD it was cut off ("Your previous attempt was CUT OFF after 24
tool rounds without making a change. Reading is bounded; writing is not."). Regression test in
`tests/interpret.test.js` ("an attempt that never stops reading is BOUNDED — the close still
runs and the loop loops"; the scriptedProvider clamps to its LAST entry, so a script ending
in a tool call IS a worker that reads forever).

**Upstream wart BA-3 (filed).** `loop.stop()` breaks bare-agent's round loop, which falls
through to its `HARD_ROUND_LIMIT` return → a deliberate stop comes back as `{text:'',
error:"[Loop] hit internal safety limit of N rounds"}`, indistinguishable from a runaway, and
DISCARDS the worker's text. Worked around with a `stoppedByBound` flag (bareloop knows it
stopped the loop; it does not need bare-agent to tell it). The proper fix is upstream:
`stop()` should return `error: null` and keep the run's text.

## F21 — the loop loops, and it does NOT RATCHET: a never-green run has no channel from attempt N to attempt N+1 (adaptlearn F6, shipped unchanged)

With the F20 bound in place the loop finally loops — and it did the SAME thing three times.
Bounded arm (n=1, cached provider): **3 attempts, 3 closes ran, 3 bounded at 24 rounds each =
72 rounds. Spend $0.91 (down from $1.43). STILL zero writes, still cap-halt, still no green.**
The worker ran **34 recall queries across the run, ZERO touching `keywords`/`tokenize`/
`splitIdent`** — every attempt searched the MEMORY subsystem (`reviewCandidates`,
`recentMemory`, `recall`, `logRecall` — the symptom), never the tokenizer (the cause) — and
re-fetched the identical pointers (`src/index.js:1313-1316`, `src/store.js:984-1014`) once per
attempt.

**Cause:** each attempt is a FRESH conversation; the only channel that carries is the gap; the
worker wrote nothing, so the tests failed identically, so the gap was byte-identical, so the
work was byte-identical. **Deterministic repetition.** (The worker is NOT refusing to write —
in 34 searches it never found anything to change, and a good engineer would not write a random
edit either. The ratchet matters precisely because it is what would let attempt 2 stop
re-searching the room attempt 1 already cleared.)

**The agent's drafted config DID author a ratchet — and it does nothing.** The config carried
`after-red: [{op:'stash'}]`, `before-attempt: [{op:'recall',…}, {op:'compress',…}]`,
`on-green: [{op:'remember',…}]`; all hooks fired. But adaptlearn F6 shipped unchanged:
`src/validate.js` binds `VERB_SLOT = { recall:'before-attempt', compress:'before-attempt',
stash:'after-red', remember:'on-green' }` — `stash` is **write-only decoration** (`recall`
cannot read it back) and `remember` is **on-green ONLY** (nothing to recall until something is
remembered, and a never-green run never remembers). **The schema STRUCTURALLY forbids an
attempt telling the next attempt anything on a run that never greens.** `stash` is a DECOY: it
looks like a ratchet, an agent will draft it every time (this one did), and it writes to a
table nothing reads. WITHIN-run scratch (attempt 1 → attempt 2, discarded at run end) and
ACROSS-run inheritance (verdict-gated, doctrine) are different scopes currently tangled in one
rule — see the PRD plan-v1 addendum.

## F22 — the emergent middle has no live surface: "the agent authors its workflow" was, as shipped, near-empty

The design-level finding behind F21. Of the drafted config's **7 knobs**, on a never-green job
exactly ONE can change what the worker actually experiences:

| knob | live on a never-green run? | why not |
|---|---|---|
| `loop.shape` (rounds/attempts framing in the persona) | **YES** | the one live surface |
| `before-attempt: recall` | no | hits an empty store — `remember` is on-green only, the run never greens |
| `before-attempt: compress` | no | compresses recall's nothing |
| `after-red: stash` | no | has no reader (F21) |
| `on-green: remember` | no | the run never greens |
| `budgetUsd` | no | may only TIGHTEN, never raise |
| `writeScope` | no | may only tighten inside the fence |

Meanwhile the knobs that WOULD move the outcome — rounds-per-attempt, attempts-per-run — are
hardcoded shell constants (`TURNS_PER_ATTEMPT`, `capRuns`), correctly outside the agent's
reach but leaving the agent authoring only inert knobs. **The product claim "the agent authors
its workflow" was, as shipped, near-empty on the one job that exercises it.** This finding
retires config-v1 and motivates plan-v1 (PRD Addendum v1.12): the emergent middle needs a live
surface whose every verb is a gated primitive, while the arbiter (close, budget, fence, merge)
stays inexpressible.

## F23 — the first plan-v1 arm: the first WRITE in this project's history, and it destroyed the patient

**n=1, `claude-haiku-4-5-20251001`, POC harness (`harness.mjs`), run cap $1.00.** The plan-v1
shape from PRD Addendum v1.12, spiked: SCOUT (read-only, 24 rounds, $0.1975) → `Planner.plan()`
→ per-step fresh Loop + fresh Gate, each step's artifact fed forward into the next step's
prompt. The planner emitted 6 steps; 3 ran (s1–s3) before the cap stopped the run before s4.

**Readout: G=0 · W=1 (the first arm ever to write) · C=0 · $1.2060 · unpriced 0.** And the
writes **vandalised the tree**: `src/store.js` (**1,789 lines** at HEAD) was truncated to **0
bytes**, and the close went from **3 failing tests to 41 failing test *files*** — the whole
suite stopped loading. The worker spent its last two steps trying to reconstruct from memory a
file it had itself erased ("*I got a write of 0 bytes - the file is now empty again*").

Two independent real causes, both worth the run:

**1. `shell_write` guards `path` but not `content` — and the gate blesses the result (BA-4).**
bare-agent's `shell_write` defaults `content` to `''`, so a malformed tool call **zeroes the
file**. Gate audit (`audit-run1.jsonl`), write records — each write is logged twice (gate
decision + record), so **14 records = 7 distinct writes, of which 5 were `bytes: 0`** (10 of 14
records at `bytes:0`; the other four: 2×1501, 2×1805). Every one carried `decision: "allow",
rule: "default"`. It cannot do otherwise: bareguard's fs primitive judges `{type:'write',
path}` and **never inspects the body** — *a 0-byte write is a legal write*. Filed **BA-4,
CRITICAL** (`docs/UPSTREAM-ASKS.md`). **hamr's decision (2026-07-14): option (a) — wait for the
upstream fix + version bump, NO local shim; doctrine unamended (design law #10).** That makes
**BA-4 a hard N2-exit blocker**: bareloop cannot ship a write-capable loop on a primitive that
can silently empty a source file.

**2. The harness inferred each step's tools from action keywords, and mis-assigned 33% of the
steps.** `WRITE_RE = /\b(fix|edit|change|implement|correct|apply|modif|patch|write|updat|…)/i`
over the step's prose. Two of six steps (s2, s4) begin "**Examine** … **to verify** …" — pure
read steps — and both were classified `write`: s2 because `\bwrite` matched inside
`writeMemory()`, s4 because `updat` matched inside "correctly **updat**e provenance". **s2 is
the step that emptied `store.js`.** Keyword inference was never the design and is not being
fixed — it is the *absence* of the design: **plan-v1's planner must EMIT `tools`/`exit`/`bound`
as structured data on each step, and the plan-v1 validator must gate them** (PRD v1.12 §3 —
"per-step verbs ⊆ the spec's tool ceiling"). The DAG shape in the addendum (`{id, action,
dependsOn}`) is hereby insufficient: the verbs, the exit, and the bound are part of the step,
not something the shell may guess from a sentence. (The successor harness emits them; the
planner produced valid ones on shot 1 in both later arms — see F24.)

**The planner authored a step that RUNS THE CLOSE — unprompted, 2-for-2 across sessions.**
Step s1, verbatim: *"Run the full test suite to confirm current state and capture exact failure
messages for all 3 failing tests."* The fit-to-pass surface is reached for **by default**, by
an agent that was never invited to touch it. `run` is not in the tool menu so it merely wasted
a step — but this is direct, day-one evidence that the plan-v1 validator's inexpressibility
rule is **load-bearing, not ceremonial**.

**Third blind instrument.** The C detector (did the worker ever target the cause file?) first
reported **C=true**. It regexed `tokenize\.js|\bkeywords\b|splitIdent` over the tool **result
text**, so it fired on `import { ftsMatch, keywords } from './tokenize.js'` — the import line at
the top of `store.js`, the file the worker read over and over. Ground truth, re-derived from
`toollog-run1.json` (100 tool records): **zero tool calls whose target path is `tokenize.js`;
zero whose args so much as mention it. C=0.** This is the **third** blind instrument in this
project (after the cache-tier-blind ledger, F18, and the read-collapsing gate audit, F19). The
detector is now what it was pre-registered to be — a tool call whose **target path** is
`src/tokenize.js`. *Audit a too-good number before you believe it.*

## F24 — decomposition does NOT fix aim, and neither does reframing the close: the paired A/B negative result

**Two paired arms, `claude-sonnet-5`, identical harness (`harness2.mjs`), ONE knob apart, n=1
each.** The budget stopped the pair at one rep each; **the stop is a result**, and the contrast
the pair was built to expose survives it.

| | ARM A (control) | ARM B (treatment) |
|---|---|---|
| close output | **raw** (`3 fails`, test names) | **root-cause reframed** (below) |
| plan | **5 steps**, one track per file | **2 steps** ("determine the exact root cause" → "apply the minimal fix") |
| G / W / C | **0 / 0 / 0** | **0 / 0 / 0** |
| cost | **$1.4905** / cap $1.50 | **$1.5024** / cap $1.50 |
| steps run | s1–s3, cap-stop before s4 | s1–s2, one replan, p2:s1, cap-stop |
| artifacts | 5,942 / 5,957 / 4,561 B | **0 / 71 / 0 B** (BA-5, see confounds) |
| truncated rounds | 0 | 0 |

The one knob, quoted **verbatim** so the leak-audit is auditable — it is a fixed, deterministic,
**non-LLM** wrapper and it contains **zero** information about the bug (no file, no symbol, no
`tokenize`/`keywords`/`length`/`split`):

> The test suite reports 3 failing tests, listed below. These are SYMPTOMS.
> They may share a SINGLE root cause in code that all of them transitively depend on. Do NOT
> assume they are independent defects, and do NOT open one work-stream per failing test.
> Before proposing any fix, trace the call path from a failing assertion into the code it
> exercises, and follow it through every function it calls — including helpers defined in other
> files — until you find code whose BEHAVIOUR CONTRADICTS ITS OWN DOCUMENTED CONTRACT (its
> doc-comment, or the invariant its callers depend on). Name that function and that file. Only
> then propose a fix.

**What the reframe DID move: the plan's shape.** Arm A fanned out into per-file tracks (read
`store.js` · read `index.js` · read the 3 test files · fix `store.js` · fix `index.js`) — the
symptom's own partition. Arm B collapsed to exactly the two steps it was asked for. **So
symptom-decomposition fan-out is fixable this way.** That is the entire yield.

**What it did NOT move: aim.** Arm B searched the same subsystem, in the same words, as arm A.
Its root-cause step pre-committed to `src/store.js` **down to line numbers** (`memKey() ~255,
writeMemory() ~533, logRecall() ~895-911, recallCount() ~979, reviewCandidates() ~999`) —
inherited from the scout, which had already decided the answer lived in the memory store. **The
wrong file was chosen UPSTREAM of the plan, by the scout, from the test names.** Reframing the
close cannot fix that: by the time the close is read, the target is set.

Across both arms: **15 recall queries and 47 grep patterns.** Not one names `tokenize`,
`keywords` or `stopword`. (One arm-A recall query contains the *word* "split" — *"function
memId decode public id **split** separator"* — about a key separator, not the tokenizer; it is
not a hit on the cause.) Stronger, from the raw tool logs (`toollog-A1.json` 75 records,
`toollog-B1.json` 65): **zero tool calls in either arm have `tokenize`/`keywords` anywhere in
their arguments.** Not a near-miss — the vocabulary never entered the query.

**The smoking gun.** `tokenize.js` crossed the worker's context **30 times** across the two arms
(18 in A, 12 in B — tool results containing `tokenize.js`/`keywords`/`splitIdent`). It is the
**import line at the top of `store.js` and `index.js`**, the two files the worker read in full,
repeatedly. **It read past the cause 30 times and never followed it.**

**The positive control (free, no API, re-verified while writing this):** on the same planted
clone, `recall("keywords")` → `src/tokenize.js · keywords · function_declaration · lines 64–71`
at **rank 1** (score 1.2447), and one `get(path, {64, 71})` returns **260 bytes** — the
docstring *"…stopwords dropped, **length >= 3**"* sitting directly above the code `w.length > 3`.
**The entire diagnosis, in one 260-byte fetch.** The failure is not retrieval. **It is a failure
to ASK.**

### The invariant

| # | arm | source | model | G | W | C (targeted `tokenize.js`) |
|---|---|---|---|---|---|---|
| 1 | control | F18 (n=2) | sonnet | 0/2 | 0 | **0** |
| 2 | prompt caching | F18 (n=2) | sonnet | **1/2** | 1 (greened rep) | **1 — the lone exception** |
| 3 | retrieval verbs | F19 (n=1) | sonnet | 0 | 0 | **0** |
| 4 | bounded attempts | F20/F21 (n=1) | sonnet | 0 | 0 | **0** |
| 5 | planned (haiku) | F23 (n=1) | haiku | 0 | 1 (destructive) | **0** |
| 6 | planned + raw close | F24 arm A (n=1) | sonnet | 0 | 0 | **0** |
| 7 | planned + reframed close | F24 arm B (n=1) | sonnet | 0 | 0 | **0** |

**Read it honestly: C=0 in six of seven arms.** The single exception is F18's greened cached
rep — one run of two, which found `tokenize.js`, wrote `>= 3`, and greened, **and never
replicated**. In the **five arms since**, across three capability upgrades and two prompt
framings, **the worker has not once targeted the cause file again.**

**The meta-finding, and the one that matters.** Every arm so far upgraded the worker's
**EQUIPMENT** (cheaper context F18, precise retrieval F19, real feedback F20, structure F23/F24)
or its **INSTRUCTIONS** (persona, root-cause reframe). **None changed WHAT IT ASKS ABOUT.** Its
search is anchored to the symptom's vocabulary and does not leave it — however the task is
framed, however it is partitioned. Seven arms of equipping have moved the outcome zero.

**A live lead, not yet tested — the planner granted `recall`/`get` to ZERO steps.** In *both*
sonnet arms, every authored step asked for `read`+`grep` only (arm A: 3× `[read,grep]`, 2×
`[read,write]`; arm B: `[read,grep]`, `[read,grep,write]`), because it could — the verbs were in
the ceiling and the planner declined them. The one instrument that finds the bug trivially was
available only to the **scout**, which used it with symptom words. **A retrieval path the agent
never asks for is not a capability.** The next arm should **CONSTRAIN** rather than **EQUIP**:
deny the whole-file read, force `recall`/`get`, and make a step's deliverable a claim that
*cannot be made from inside the symptom's vocabulary*. Pre-registered here before it is run.

**Confounds, named.**
- **Arm B's W and G are VOID as evidence.** All three of its steps ended
  `halt:budget.maxCostUsd`; bare-agent's budget-halt path returns `{text:''}` (**BA-5**, line
  843 — still live, we only worked around the `terminate` path), which **erased 2 of 3 arm-B
  step artifacts** (0 / 71 / 0 bytes). Arm B never got a fair shot at writing. **Arm B's C
  contrast survives** — 38 tool calls, all in the memory subsystem, complete tool log,
  independent of any artifact.
- **n=1 per arm.** The pair is a contrast, not a rate.
- **The informative close (adaptlearn F14/F15) is present in BOTH arms**, so it cannot explain
  the A/B difference — but it remains the most likely reason both marched into the memory
  subsystem and stayed: the close names the failing *memory* tests, and the worker goes where it
  is pointed. Pre-registered as the confound to break next.

## F25 — BA-6: a silently truncated round is indistinguishable from a worker that chose to stop — and it may have corrupted every prior sonnet arm

**`claude-sonnet-5` runs adaptive thinking BY DEFAULT.** On a hard prompt it thinks past
bare-agent's Anthropic provider default (`provider-anthropic.js:82` —
`max_tokens: options.maxTokens || 4096`) and the response comes back as `content: [thinking]`
with **no text block and no `tool_use`**, and `stop_reason: 'max_tokens'`. bare-agent **drops
thinking blocks** and **never reads `stop_reason`**, so it yields `{text: '', toolCalls: []}` —
and `Loop` reads that as *"the model gave its final answer."* **The attempt ends CLEANLY:
`error: null`, empty artifact, no halt, no warning, nothing in the audit.**

Measured directly against the live API (`probe2.cjs`, one hard prompt, two ceilings):

| `max_tokens` | `stop_reason` | output tokens | content | text returned |
|---|---|---|---|---|
| 1024 | `max_tokens` | 1024 | `[thinking: EMPTY]` | **0 B** |
| 4096 | `max_tokens` | 4096 | `[thinking: EMPTY]` | **0 B** |

**The consequence, unsoftened: every prior sonnet arm ran on that 4096 default.** In those logs
a silently truncated round is **indistinguishable** from a worker that "chose to stop without
writing" — the two produce byte-identical evidence. So the *"the worker did nothing / never
wrote"* outcomes in **F18, F19, F20, F21** are, **to an unknown degree, this bug rather than the
worker. They must be RE-AUDITED before being cited again.** The same applies to F23's haiku arm,
whose harness also ran the 4096 default with no truncation counter (haiku's own thinking default
was not measured — no claim either way).

**The sonnet A/B arms (F24) are clean on this axis** — and only because it was found first:
`maxTokens: 24000` on every call, plus a counter that increments on `stop_reason === 'max_tokens'`
instead of laundering the round into an empty answer. **`truncatedRounds: 0` in both arms.** The
fix is a harness override; **BA-6 is NOT YET FILED upstream.** The upstream ask is two-part: the
provider must **surface `stop_reason`** (a truncated round is not a finished one), and it must not
represent a thinking-only response as a final answer.

**Same probe, second defect: bare-agent cannot price `claude-sonnet-5`.** `COST_PER_1K`
(`loop.js:71`) has **no `claude-sonnet-5` row**, and `estimateCost()` falls through to
`_default` (`$0.002 in / $0.008 out` per 1K) **silently**. The rate that actually bills today is
the intro `$0.002 / $0.010` — so **every prior sonnet arm's output cost is understated by 20%**
(equivalently: the true output rate is 25% above the one the ledger used). This is the **F6
class again** — an unknown model must price as **null / UNPRICED**, never as a plausible-looking
number. F24's harness carries its own rate table and hands the Gate the same price the ledger
sees (`ledgerDrift: 0` in both arms). **Fold this into BA-6 when it is filed.**

---

## F26 — the aim axis was never connected; job #1 is the wrong benchmark

**Full write-up: `docs/02-experiments/REPORT-AIM.md`.** 151 no-harness API samples (one Anthropic call each — no
bare-agent, no tool loop, no gate), $4.99, `claude-sonnet-5` fixed throughout.

**The result: 0/140 across every legitimate intervention** — baseline, root-cause reframe,
force-the-descent, each crossed with which source file is shown, plus a rich close. The only arm
that ever hits (`PC`, 5/5, p<0.0001) is the one where the diagnosis is **hand-written into the
prompt**.

**The finding is not the zero — it is WHY the zero.** The model nominates whichever orchestration
file was **withheld**: shown `store.js` → nominates `index.js` (20/20); shown `index.js` →
nominates `store.js` (20/20); **shown a CLEAN repo with a GREEN suite → nominates the same file
anyway** (3/3, both directions). The nomination is a function of the prompt's *structure*, not of
the failure evidence. **The dial was not connected to the engine.**

Consequently **F24 ("decomposition does not fix aim") is WITHDRAWN.** It was not a negative
result; it was an unconnected instrument reading zero, exactly like the control, caching, and
retrieval arms scored on the same axis. This is the **fourth** blind instrument in this project
(ledger/cache-tiers, gate-audit/read-shape, harness/git-status, now aim/nomination) — *decompose
before you diagnose*, paid for a fourth time.

**Mechanism.** The model does not miss `tokenize.js`; it **rules it out by name** — *"not
implicated"* — because it triages from the failing tests' **titles** (W4 clobber, promotion
threshold, recency signal → three unrelated store features). From titles, a tokenizer genuinely is
not implicated. The reasoning is sound; the inputs are wrong.

**The close-format lever is DEAD (arm E0).** `node --test` already computes the assertion detail
our close throws away — all three failures are one symptom (`actual []` / `expected ['A is 44']`;
`actual false` / `expected true`: *every lookup returns empty*). E0 passes the runner's TAP
diagnostic through **verbatim**, byte-identical to D0 otherwise (identity audit vs `prompt-D0.txt`;
leak audit on the close). **E0 = 0/20 — and 0/20 replies even MENTION `tokenize.js`**, versus 12/20
under the force-the-descent wrapper. Raw evidence moved the worker *less* than exhortation did.

**The call (pre-registered): job #1 is the wrong benchmark.** Its defect requires a single
inductive leap — *three failures across three unrelated features share one property: the query
terms are short* — that the model makes from no input short of the answer, and **the arbiter may
never supply the answer**. A benchmark whose only passing configuration is "leak the diagnosis"
cannot distinguish a good workflow from a bad one: every arm scores 0. **plan-v1 cannot be
evaluated on job #1.**

**What job #2 needs:** a defect reachable by **elimination**, not **induction** — where reading the
right file settles it, so a workflow that reads more of the right files scores strictly higher.
Job #1 has no gradient; you either leap or you don't.

**Not licensed by this finding:** the loop is *not* exonerated (F20/F21 stand on their own
evidence), and the close-output doctrine is *not* retired (a close that names failures is still
strictly better than one that hides them — it is merely **not sufficient**, and E0 is the receipt).

**Honest limits:** `PC` is n=5 and the negative controls are n=3 — thin. The 0/140 is not, and the
nomination-distribution result does not depend on either.

---

## F27 — job #2: the NAV axis is CONNECTED (job #2 ≠ job #1), but the one-shot FIX ceiling is 0% — and both models misdiagnose the fix the SAME way

**Context.** BA-4/5/6/7/1 landed in `bare-agent@0.27.0` (consumed here; the N2 build gate is cleared,
acceptance re-verified locally). With the primitive confounds gone, job #2 (the elimination-reachable
replacement benchmark, pre-registered and FROZEN in `docs/02-experiments/JOB2-PREREG.md` before any number existed)
was calibrated exactly as pre-registered — two probes × two tiers, EFFORT=low, n=15, $3.02 total.
Patient: `mailproof` @ `091027d`; plant: one line in `src/notify.js` (`if (custom) body = custom;` →
`body = custom;`), which violates the file's OWN header contract ("a hook throw or falsy return falls
back to the neutral default"). NAV probe is BLIND (culprit file withheld); FIX probe is OPEN (culprit
shown in full). Both graders frozen before any run.

**The numbers (frozen analyser, Wilson 95% CI):**

| cell | hits/valid | rate | 95% CI |
|---|---|---|---|
| NAV sonnet | 15/15 | **100.0%** | [79.6%, 100%] |
| NAV haiku | 15/15 | **100.0%** | [79.6%, 100%] |
| FIX sonnet | 0/15 | **0.0%** | [0.0%, 20.4%] |
| FIX haiku | 2/15 | **13.3%** | [3.7%, 37.9%] |

**The headline — job #2's aim axis is CONNECTED, and it settles F26's open question.** Both tiers
nominate `src/notify.js` **blind, every single time** — the file was NOT shown, and they found it by
eliminating the failing-test surface. Against job #1's **0/140** (the dial was never attached to the
engine, F26) this is categorical: **the benchmark's navigation gradient is real and honest.** hamr's
hypothesis — *most of the prior failing was primitives, not model* — is substantially **vindicated on
navigation**: clean primitives + a benchmark that needs elimination (not induction) makes the model
find the right file reliably. This is a no-harness API probe (one call each, `maxTokens` high, a
`truncated` flag excluding cut-off rounds), so it is BA-6-clean by construction — the result is a
property of model+prompt, not of the middle.

**The verdict — DISCARD, by the FROZEN rule 2 (fixS < 20%).** The one-shot FIX ceiling is 0% on
sonnet. The rule was frozen before the number and is NOT loosened (that is the anti-fit-to-pass
guard). So the specific plant is discarded **as a one-shot-calibrated target**. Not a grader artifact
(the misses target line 73 — the `composeNotification(...)` call — while the plant is line 74; a
line-73 rewrite leaves the bug intact, so the close genuinely stays red) and not primitives (no
harness).

**The new mechanism — F26 extended to the FIX axis: surface-feature triage, not semantic reasoning.**
Every sonnet miss (15/15) and 13/13 haiku misses are **right-file-wrong-fix**. The models converge on
the SAME wrong hypothesis: they rewrite the `composeNotification(...)` **call** (arg-spread order),
because they triage from the failing-test **titles** ("composeNotification overrides the body; neutral
default otherwise") and conclude the bug is in how the hook is *called* — never reading the file's
header contract three lines up, which states the exact invariant the plant broke (falsy return →
neutral default). This is F26's mechanism (triage from titles, not from the semantic contract) on the
fix axis, and it is **model, not primitive** — reproducible across both tiers.

**What it means, and what it does NOT license.** The calibration proved what it had to: **NAV is
honest** (job #2 discriminates on the axis job #1 could not). The FIX rule discards the plant for
**one-shot** use — but probe B was pre-registered as bounding *"the CEILING, not loop behaviour."* A
bug that is hard one-shot but solvable-with-feedback is the *ideal* discriminator for a **loop**
product (an easy bug would let every arm green on attempt 1 and wash out all workflow differences);
what rule 2 cannot distinguish is *loop-solvable-hard* from *loop-unsolvable-hard* (the latter is job
#1 redux on the fix axis). **Only a loop run can tell those apart** — which is the open question this
finding hands forward. The DISCARD is NOT loosened, and the loop test (if run) is a DIFFERENT
experiment (the thesis probe), never the 7-arm suite rule 2 governs.

**Honest limits.** n=15/cell. `gradeB` accepts a guarded assignment without RUNNING the fix (the 2
haiku "hits" restore the `if (custom)` guard, which is the correct shape, but were not executed); the
stronger check — apply the model's line, re-run the close — is deferred to the loop, where it is native.

---

## F28 — first real firing of the wheel: the MACHINE works, but `boundGap` cut every failure line out of the gap — the worker was told "5 fail" and never WHICH

**The run.** First end-to-end firing of the N2 loop ever (job #2 patient: `mailproof` @ `091027d`
+ the F27 falsy-guard plant; spec `mailproof-fix` @ `08f5ad59…`, tools mode, `npm test` close,
$3 cap, sonnet; spine `…/mailproof-job2-bareloop/job2-mrlwbou4.jsonl`, 135 events). Outcome:
**`step-red:suite` at the 3-attempt cap, $1.0521 spent, ZERO writes** (gate audit contains no
write actions; the tree's only diff is the plant itself — checked by reading the diff CONTENT,
not `git status`, the exact blind-instrument trap the harness fell into once already).

**The machine — every F-fix held in live fire, first time all at once:**
- the close ran after EVERY attempt (3 verdicts + the F13 pre-check; F20's bound is real: all
  three attempts cut at 24/24 rounds, `attempt-bounded` on the spine each time);
- per-round metering priced every round, `unpricedRounds: 0` (F12/F6);
- the judged floor extracted `# tests 317` every close (F17 — no fake-green surface);
- cap-halt escalated decision-ready with honest spend; spine terminal, secrets-clean.

**The defect — the feedback channel dropped its payload.** `ralph.js` `boundGap` bounds the gap
as `head(400) + …truncated… + tail(1500)`. `npm test` TAP output here is ~67KB: the head is the
npm banner + the first passing tests, the tail is the summary (`# pass 312 / # fail 5`) — and
**all five `not ok` lines live in the elided middle**. Verified on the spine: every delivered
gap is 1,927 chars with **zero `not ok` lines**. The pre-token close-state shown to attempt 1
(F13) was bounded the same way. So the worker was told the suite fails — and *nothing else*,
three attempts running.

**The behaviour downstream is now fully explained, and it is not a model failure.** The gate
audit shows the worker never read `notify.js` and never read any of the 3 failing test files —
it wandered `event-store.js`/`gitrepo.js`/neighbouring tests for 24 rounds × 3 and never formed
a hypothesis worth writing. Against the calibration this is a clean natural contrast: **with**
the `not ok` lines in the prompt, both tiers navigated to `notify.js` 15/15 (F27, one-shot);
**without** them, 72 rounds of tool access never touched it. The failing-test NAMES are the
causal input the whole navigation gradient runs on — and the shell deleted them in transit.

**The doctrine already existed; the code violated it.** "The close's OUTPUT FORMAT is part of
the job's contract with the worker — a gap-bound that buries failures silently defeats the
arbiter" was minted from adaptlearn's record and sits in this repo's memory verbatim. `boundGap`
is that named failure, shipped. Fifth blind-instrument instance (ledger/cache-tiers,
gate-audit/read-shape, harness/git-status, aim/nomination, now gap/failure-elision) — and the
first one caught by the product's OWN spine on its first real run, which is what the spine is for.

**What this run does and does not license.** It does NOT answer the thesis question (is the
plant loop-solvable with feedback?) — no feedback carrying information ever reached the worker,
so the loop has still never been tested with a live gap. It DOES retire "the middle/machine is
the blocker": every arbiter component behaved exactly to spec. The experiment reruns after the
fix; ~$1 per firing.

**Adjacent hazard, logged not fixed:** `runClose` feeds `boundGap(err || out)` — whichever
single stream is non-empty wins. A close that writes failures to stdout while emitting any
stderr noise would lose the failures entirely, before any bounding. Same class; needs its own
test when the gap path is reworked.

**Side facts:** the gate audit and the litectx index live INSIDE the patient tree
(`gate-audit.jsonl`, `.litectx` — read-denied to the worker as designed, but they dirty
`git status` in the repo under repair; F14 moved the spine out for exactly this reason).
One denied read of `.litectx` on the audit confirms the fence held.

---

## F29 — the paired contrast: blind gap → 3 attempts, 0 writes, cap-red; named failures → GREEN on attempt 1, $0.30. The information was the variable — and the 0% one-shot ceiling fell to tools, not to verdict feedback

**The pair.** Same patient, same plant, same spec shape, same model (sonnet), same $3 cap — the
ONLY delta between run 1 (`job2-mrlwbou4`) and run 2 (`job2-mrlxl0q5`) is the F28 fix: the gap
(and the F13 pre-run close-state) now carries the five `not ok` lines via `close.gapKeep`.

| | run 1 (blind gap) | run 2 (failures named) |
|---|---|---|
| outcome | `step-red` at 3-attempt cap | **green** |
| attempts | 3 × 24/24 rounds, all bounded | **1**, 30 tool calls |
| writes | **zero** | 2 (both `src/notify.js`) |
| culprit file ever read | never | found, fixed |
| spend | $1.0521 | **$0.2991** |

Two should-differ conditions differed — the instrument sees the variable. Independent
verification: `npm test` re-run by hand on the tree, 317/317. The worker's fix restores a guard:
`if (custom != null) body = custom;`.

**What it settles.**
1. **F27's open question — the plant is NOT loop-unsolvable.** The one-shot DISCARD (fixS 0%)
   bounded the wrong ceiling: with tools and the failing-test names, the model reads the failing
   tests, walks the wiring, reads the culprit, and lands a green fix in ONE attempt for 30¢.
   **Job #2 is admitted as the loop benchmark** — it discriminates hard (informational gap:
   red↔green swing on one variable), which is exactly what job #1 could never do (0/140 flat).
2. **The gapKeep fix is validated end-to-end,** not just unit-tested: the F28 regression pair is
   this table.
3. **The wheel works whole:** draft → validate → attempt (bounded) → close → verdict → green
   minted → terminal spine, secrets-clean, all priced.

**What it does NOT settle — stated before anyone asks.**
- **The across-attempt ratchet (Layer R) was never engaged.** Green on attempt 1 means no gap
  ever fed a second attempt; the thesis "verdict feedback breaks a misdiagnosis basin" remains
  untested. What beat the 0% one-shot ceiling was **multi-round tool use within one attempt**
  (the worker revised its own edit once before finishing — two writes, zero close verdicts in
  between). One-shot-hard ≠ loop-hard: the calibration's FIX probe denied the model tools, and
  tools were the whole difference.
- **A new benchmark worry, logged not decided:** if the flat loop greens job #2 on attempt 1 at
  $0.30, the 7-arm suite may not separate workflows on green/red — the discriminator may need to
  be cost/rounds, or a harder plant. Decide at suite design, not now.
- **Fix-shape nuance:** the worker wrote `!= null`, narrower than the original falsy guard — a
  hook returning `''` would still clobber the body, which the file's header contract forbids but
  NO test pins. By the product's frozen pass criterion (green/not-green, hamr's call #4) this is
  a clean pass; the uncovered `''` branch is a mailproof test-suite gap, noted for upstream, not
  relitigated here.

**n=1.** One green on a nondeterministic worker is an anecdote (doctrine); the paired contrast is
the finding, the green rate is not yet a number. Replication belongs to the arm suite.

---

## F30 — battery pass 1, halted at the frozen rule: the worker's rounds had a 4096-token output cap nobody chose — a whole-file write cannot fit, so three of three rows died in infra before any tier could be measured

**The runs (runid `mrm7ozef`, $0.87, stopped by hand at the frozen reading rule after 3/3
invalid rows; P4 killed pre-spend).** P1: `provider-red: truncated:max_tokens` at 19 rounds —
one write landed, then a round was cut. P3: same, 24 rounds. P2: one write landed, attempt
bounded 24/24, then the close **crashed** — `judged 258 of a declared floor of 300` — and the
run escalated. Zero valid tier rows; the anchor P1's F29 green stays the only valid loop result.

**Root cause (found, fixed, watched-fail-tested).** The Loop was constructed without
`maxTokens`, so the provider defaulted to **4096 output tokens per round**. A whole-file
`shell_write` of `create.js` or `ingest.js` cannot fit in 4096 tokens; the API cuts the round;
bare-agent 0.27.0 (BA-6, working exactly as asked) surfaces `truncated:max_tokens`; doctrine
(F25, correctly) classes the cut provider-red — no verdict, run over. Fix: the shell now passes
`maxTokens: 32000` on every worker round (`interpret.js`, F30 regression test asserts ≥16384;
292/292). Note the shape: **every component behaved to spec and the run still died** — the
defect lived in a default nobody had claimed as territory. Output budget is now explicitly
shell territory.

**Two design gaps harvested, logged OPEN — decisions for the operator, not patches:**
1. **A worker-caused close-crash gives the worker no feedback.** P2's edit broke test files at
   load; the judged floor (F17) correctly refused to call that a verdict — but the run then
   ESCALATED. "Your edit crashed the suite, revert it" is the most recoverable red there is,
   and it is the one red the loop cannot feed back: the forbidden zone cannot tell *the
   instrument crashed* from *the worker broke the tree*. (P2's write content being itself a
   truncation casualty is plausible — the same 4096 cap mid-file — but unproven; the crash
   routing is the finding either way.)
2. **The attempt bound can cut mid-edit** (P2: bounded 24/24 with one write landed), leaving a
   broken tree for the close to judge. Interacts with #1: bound-cut → broken tree → crash →
   escalation, a chain where each link is individually correct.

**Rule honored:** stop at infra defect, fix, log, rerun — the $10 pass-1 stop and the
autopsy-before-label rule both did their jobs. The battery reruns clean from P1.

---

## F31 — battery pass 1 complete: the easy tier is real (2 clean greens), the loop tier is STILL unobserved, and one routing gap ate every row that needed a second attempt

**The pass (runid `mrm8dr1l`, $1.65; $2.52 cumulative with the F30 half-pass).** All 7 plants,
frozen order, maxTokens fix live, every sanity close matched its prereg set before spend.

| plant | outcome | attempts | writes | rounds | spent | class after autopsy (frozen rule: autopsy before label) |
|---|---|---|---|---|---|---|
| P1 | **green** | 1 | 1 | 15 | $0.22 | **easy tier** — anchor now 2/2 on valid runs |
| P2 | **green** | 1 | 1 | 13 | $0.16 | **easy tier** — F30's truncation casualty, clean once it could emit |
| P3 | step-red | — | 1 | 24 | $0.35 | **worker-crash** (judged 258/300) — INVALID as tier |
| P4 | step-red | — | 1 | 21 | $0.21 | **worker-crash** (258) — invalid |
| P5 | step-red | — | 1 | 6 | $0.04 | **worker-crash** (258) — invalid |
| P6 | step-red | — | 1 | 24 | $0.23 | **worker-crash** (295 — five short of the floor) — invalid |
| P7 | step-red | — | 0 | 40 | $0.44 | attempt 1: honest red, bounded, ZERO writes; attempt 2 died `read ETIMEDOUT` → provider-red — invalid as tier, but attempt 1 is real data |

**Headline 1 — the worker-crash routing gap is the product's live ceiling.** 4 of 7 rows: the
worker whole-file-rewrites a big orchestrator (`create.js`/`ingest.js`/`completion.js`), the
rewrite breaks imports, the close crashes under the judged floor, and the run ESCALATES — the
worker is never told "your edit crashed the suite." F17's forbidden zone (a crash is not a
verdict) was built against instrument crashes and cannot see worker-attributable ones. The
design fix was proposed under F30 (attribute by the F13 precheck baseline + gate-audit writes;
feed back as a `worker-crash` gap; escalate only instrument crashes); it is now measured as
**the** blocker: no plant that needed iteration ever got it.

**Headline 2 — whole-file rewrite is measurably unreliable at size (BA-13's risk argument, now
with numbers).** Big-file whole-writes broke the tree in 4 of 5 attempts that made one
(the exception: P2). The 100-loc `notify.js` rewrites (P1, F29) never crashed. Writing 800
reconstructed lines to change one is not a transport problem — it is the verb. Filed upstream
as **BA-13 (`shell_edit`)** with the economy numbers and 7 FAIL-able criteria.

**Headline 3 — P7's trap is validated.** Attempt 1: 24 bounded rounds, **13 reads of
`crypto.js` (the correct-but-innocent engine) vs 3 of `ingest.js` (the culprit)**, zero writes —
exactly the F27-predicted misdirection, surviving a full attempt with tools. P7 is the
ratchet-grade candidate. Its tier stays unlabeled (provider blip on attempt 2), but the trap
mechanism is proven.

**Headline 4 — the loop tier (green on attempt 2–3, the thesis) has STILL never been observed.**
Not because it is false — because nothing has yet completed a second attempt: four rows lost it
to the routing gap, one to a timeout. The thesis test is now gated squarely on the worker-crash
fix plus ordinary retry luck.

**Reading-rule compliance:** every red was autopsied before labeling; provider blips (P7 att. 2)
are retries, not evidence; no tier rates claimed (n=1–2). The two greens replicate F29's cost
shape (~$0.20/green, attempt 1).

---

## F32 — worker-crash attribution built and validated live: the crash routes, the feedback lands, the loop continues — and at n=1 the worker did not yet convert the chance it was given

**The change (approved by hamr 2026-07-15; arbiter territory, never unilateral).** F31's
headline blocker closed as designed under F30: when the close returns `crashed` (judged
below the declared floor) and the gate audit records allow-decision worker writes this run
(run_id-scoped; `write` and `edit` actions both count), the verdict routes as the DISTINCT
**`worker-crash`** — non-terminal. The gap says what happened and names the files the worker
wrote ("fix or revert"); the loop continues under the unchanged caps. Escalation is
untouched for true instrument crashes: crash at precheck (no worker exists yet — run.js
already stops there for zero tokens) or crash with zero writes stays `close-crashed`, never
retried. The attribution seam (`workerWrites`) is INJECTED into ralph like `redact`, so the
dumb shell stays stdlib-only and never reads the audit itself; an unreadable audit
attributes nothing — the failure mode is the OLD behavior, never a swallowed instrument
stop. TDD: 7 new tests watched failing first (routing, zero-writes control, cap interplay,
exit-0 fake-green-by-crash, announced file-list trim, precheck boundary, end-to-end through
the real Gate audit); 292 → 299 green before consumption work.

**Validated against the real instrument (P3 rerun, runid `mrmau676`, sonnet, $0.7665).**
The same plant that died in pass 1 as an attempt-1 escalation:

| | pass 1 (F31) | with F32 |
|---|---|---|
| attempt 1 close crash (258/300) | **run ESCALATED**, worker never told | routed `worker-crash`, gap named `create.js` |
| attempts 2–3 | never happened | happened — same routing each time, worker re-told |
| terminal | `step-red` via close-crashed escalation | `step-red` via honest **cap-halt**, `verdicts: [worker-crash ×3]` |

The mechanism claim is fully validated: no escalation ate a recoverable row, the feedback
channel exists, the stop is a budget story. **The capability claim is NOT made:** the worker
wrote once (attempt 1, the tree-breaking rewrite), then spent attempts 2 and 3 as bounded
24/24 read-only rounds against a byte-identical 258/300 crash — told twice which file it
broke, it never reverted or re-edited it. n=1 on a nondeterministic worker is an anecdote,
not a rate; whether workers CONVERT the chance the routing now gives them is exactly what
battery pass 2 measures. (Watch this shape though: it rhymes with F27/P7's read-heavy
no-write misdirection, and "revert the file you broke" is about the cheapest instruction a
gap can carry.)

**BA-13 consumed in the same session (bare-agent 0.29.0, verified against shipped source,
never a stale clone).** `shell_edit` landed exactly per the ask: anchored exact-once
replace, BA-4 param guards from birth, atomic rename, anchor-miss as a refusal RESULT (the
worker re-anchors; throws stay reserved for the param-guard class). Consumption:
`TOOL_MENU` + `TOOL_BY_VERB` gain `edit`, judged as bareguard's own `'edit'` action under
the SAME writeScope fence (upstream vocabulary already had it), the F32 instrument counts
edits as writes, and the persona carries the use-the-edit-verb strategy (F19's lesson:
capability without strategy is inert). The frozen battery spec pins its tool grant
explicitly, so the menu widening changes nothing the signed hash bought — granting `edit`
for pass 2/3 is a NEW spec version for the operator to sign. 303/303 green.

**Lessons minted.**
- The fix for "the worker is never told" is necessary but not sufficient: telling a worker
  its edit crashed the suite does not make it act. Feedback delivery and feedback
  conversion are separate axes — pre-register that split before reading pass 2.
- An attribution instrument must see every write-class verb, not just the one that existed
  when it was built: `shell_edit` would have been invisible to `workerWrites` had both
  landed independently. Consuming a new verb means re-auditing every instrument that
  claims to observe "writes".

---

## F33 — battery pass 2: 7/7 attempt-1 greens at $0.94 — the greens are real, two reporting instruments were blind, and the benchmark saturated under the granted verb

**The pass (frozen before any number: prereg §Pass 2, spec `0b707b77…b9a06`, hamr signed
the `edit` grant + all-7 composition in-session).** All seven plants, frozen order, sonnet,
$3/plant, one run each:

| plant | outcome | attempts | write-class actions | rounds | spent |
|---|---|---|---|---|---|
| P1 | green | 1 | 1 edit, on-culprit | 18 | $0.2337 |
| P2 | green | 1 | 1 edit, on-culprit | 8 | $0.0609 |
| P3 | green | 1 | 1 edit, on-culprit | 6 | $0.0479 |
| P4 | green | 1 | 1 edit, on-culprit | 18 | $0.1394 |
| P5 | green | 1 | 1 edit, on-culprit | 4 | $0.0483 |
| P6 | green | 1 | 1 edit, on-culprit | 7 | $0.0430 |
| P7 | green | 1 | 1 edit, on-culprit | 24 | $0.3686 |

Total $0.9418 of the $10 stop. Every sanity check matched the prereg's recorded failure
set exactly; the final reset left the patient clean.

**The green-side audit ran per the frozen rule, and the greens are REAL.** Every close:
precheck red → final `satisfied` at `judgedCount: 317` (the full suite, above the 300
floor). Zero gate denies across all seven audits, zero write-class actions outside
`src/**`, no test file ever written. Each fix was ONE anchored edit of 116–476 bytes on
the culprit file. No close exploitation found — and per the standing rule that finding
nothing is suspicious, the one impossible-looking row was chased to mechanism (below).

**Blind instrument #1 (the printed table lied): `writes=0` on a 7-edit pass.** The
battery collector counted only `action.type === 'write'` — built before the `edit` verb
existed, never re-audited when the menu widened. F32's own lesson ("an attribution
instrument must see every write-class verb") was applied to the ARBITER's instrument
(`workerWrites`) and missed at the REPORTING layer in the same session. Fixed: write and
edit both count. The archived results JSON keeps the wrong zeros; this table is the
corrected read.

**Blind instrument #2, and the P5 forensic: the worker was handed the culprit's body
before round 1.** P5 greened in 4 rounds/$0.048 with `culpritRead=false` — no gated read,
no `ctx_get`, one pointer-only `ctx_recall` — yet landed an exact-once anchored edit,
which should be impossible sight-unseen. litectx's own `recall_log` resolved it: the
drafted config's `before-attempt` recall hook (`body: true`, k=8, query = the generic job
description) returned 8 chunks at 20:08:32 INCLUDING `src/ingest.js handleInitiatorCommand`
— the culprit, body and all. Mechanism: `applyPlant` makes the culprit the most-recently-
changed chunk in the index, and litectx's recency boost ranks it into the hook's hits.
Two consequences, one good, one cautionary:
- The agent-drafted config's memory channel did REAL work for the first time (F21 declared
  it dead on job #1's empty store; on job #2 it delivered the fix site pre-round-1).
- The battery's reset→plant cycle MANUFACTURES that aim assist: the plant is the only
  recent change, so recency-boosted retrieval points at it for free. A real escaped bug
  is often a recent change too (this is git-bisect logic, not cheating) — but the battery's
  version is artificially pure, and tier labels are conditional on it.
Fixed forward: both recall emit sites now carry `paths`, and the collector's `culpritRead`
sees every read-class channel (gated read, `ctx_get`, recall paths). P5's row stays
false under the old instrument; the corrected instrument would read true.

**Side observation for N3: the remember channel overwrites itself.** Seven greens each
fired `on-green` remember under the SAME key (`green-<iteration>-tools`), so the store
holds ONE surviving row (P7's, the last). Cross-plant answer leakage through the mem store
was structurally capped at ~zero this pass — good for row independence, fatal for
inheritance. N3's rule minting needs distinct keys before anything can accumulate.

**Tier reading under the frozen rules: all seven EASY tier.** P1 has now greened attempt-1
three times across independent runs (F29, pass 1, pass 2) and P2 twice; P3–P7 are n=1
provisional. The loop tier — THE thesis — is still unobserved: nothing needed a second
attempt. Ratchet-grade: zero rows, so Layer R still has no proving ground here. And zero
`worker-crash` events fired, so the pre-registered delivery/conversion axes have NO data
this pass — the mechanism that produced crashes (truncated whole-file rewrites) is exactly
what the `edit` verb removed. Attribution honesty holds as pre-registered: pass 2 differs
from pass 1 by both F32 routing and the `edit` grant, so the 7/7-vs-pass-1 delta is not
attributable to either alone; within pass 2, F32 routing never fired.

**The benchmark is saturated.** The predicted difficulty bands (P6 medium–hard, P7 hard
multi-attempt — pass 1 validated P7's trap live) did not materialize in attempts. The
gradient survives only in effort: 4 rounds/$0.048 (P5) to 24 rounds/$0.369 (P7, which
read the innocent `crypto.js` five times before landing on the wiring — the trap slowed
it, one attempt absorbed it). Under sonnet + `edit` + recency-boosted retrieval, mailproof
cannot mint loop-tier or ratchet-grade rows. The prereg's honest-limits section predicted
the hard supply was thin (two plants); it is now measured as exhausted. Saturation is a
RESULT: the next discriminating instrument is a harder patient — the prereg already specs
what it needs (layered orchestrator/pure-module seams, high integration-to-unit ratio,
600+-line files, behaviour-named tests) — not more passes on this one.

**Lessons minted.**
- When the tool menu widens, EVERY instrument claiming to observe a verb class gets
  re-audited — arbiter and reporting layers both; fixing one and missing the other in the
  same session is how a 7-edit pass prints `writes=0`.
- An impossible-looking green is an audit lead, not a statistic: the cheapest row of the
  pass (P5) was the one hiding a whole retrieval channel the instruments couldn't see.
- Benchmark validity includes the retrieval layer: a harness choice (reset→plant) plus a
  ranking signal (recency boost) can hand the worker the answer through a side door no
  tool-level audit shows. Audit what reaches the worker's context, not just what it asks
  for.
- Economy note, not a claim: 7 greens for $0.94 (~$0.13/green, vs ~$0.20–0.30 pre-edit) —
  consistent with BA-13's measured 56.3× output economy, not attributed (two variables).

---

## F34 — the aurora enumeration measures the benchmark paradox: a bug a test can see is a bug whose home the test imports; the genuinely hard code is exactly the code no close can gate

**Assignment (hamr): harder patient — copy the local aurora repo, inspect the SOAR
package for plant sites.** Full enumeration in `docs/02-experiments/AURORA-PREREG.md` (DRAFT; decision
rules stay with the operator). Patient copied by local clone, frozen at `d661e50`, own
venv, close green at HEAD both scopes: soar-only (172 tests, 0.5s) and full repo
(2,691 tests, ~4.5–6.5 min), 3× deterministic, tree clean through runs.

**The instrumented sweep** (one full-suite run with per-test coverage contexts) gave the
repo-wide map: for every source file, which test files execute it. Candidate sites =
meaningfully-covered files with no name-mapped coverer. Twelve one-line plants were then
probed live (apply alone → run → record verbatim fails → revert), mailproof method.

**Accepted: 4 plants, 3 files, 3 packages** — each reds exactly its recorded failing set
against the FULL close (1/1/1/2 fails), no explosion, no name-map. One cross-package cell
(cli symptom ↔ soar culprit), one within-file replication cell in a 2,233-line file, one
anchor-trap (the culprit guard line exists twice; a short `edit` anchor multi-matches —
the exactly-once discipline caught this in the verification harness itself).

**Rejected: 6 site families, all by GREEN probes** — the fixtures never exercise the
behavior (lowercase-only categories, no boundary test at exactly 50%, no re-init, no
cache-path assertion). A probe that cannot fail is not a probe; every green is recorded.

**The finding.** In aurora's TESTED regions there is no P7-analog seam: every accepted
plant's covering test imports the culprit module directly (one navigation hop after
reading the failing test). The one structural layered candidate (tests import
`embedding_provider`, which internally uses `model_utils`) greened — its behavioral
branches are unexercised. Meanwhile the code that IS the P7 shape — `orchestrator.py`,
2,455 lines precomputing everything the phases consume — is executed by NOTHING in the
repo (6% coverage = imports), so plants there green the close. Generalization, now
measured in a second repo: **the escaped-bug middle (visible symptom, obscured cause)
exists only where a tested architectural layer hides the culprit. mailproof had exactly
one such seam; aurora's tested regions have zero.** Well-disciplined per-module suites
destroy the middle from one side; coverage holes destroy it from the other.

**What aurora actually offers as a harder patient:** scale (281 source files — 34×
mailproof's search space), file scale (1,050/2,233-line culprits — the LINE hunt is real
even when the file is known), close latency (~5 min — thrash costs wall-clock, a
production-like pressure mailproof never applied), a duplicate-package decoy, the
anchor-trap, and the first non-TAP close (pytest: judged `(\d+) passed` floor ~2600,
gapKeep `^FAILED `). NOT deep causal misdirection — pre-registered expectation: if the
loop tier fails to appear here too, the lever is latency+scale, not plant depth.

**Aurora-owner side findings (real, hamr's repo):** the SOAR orchestrator is untested in
any package; three core tests are skipped with literal "MemoryStore has known bug"
annotations; `aurora_cli.planning` and `aurora_planning` carry duplicated parser files.

**Lessons minted.**
- Enumerate with an instrument, verify with probes: the coverage-context map nominated
  12 candidates cheaply; only live probes separated the 4 real plants from 6 that green.
- The riskiest probe assumption is fixture reach — five rejections came from fixtures
  that never leave the canonical path. Coverage says a line RAN; only an assertion makes
  it a gate.
- Benchmark design now has a measured ceiling: harder-than-mailproof means latency,
  scale, and anchor discipline — or building/finding a patient whose ARCHITECTURE hides
  tested culprits (a layered repo with orchestrator-level integration tests), which
  neither mailproof nor aurora is.

---

## F35 — the recency boost never existed: F33's mechanism story falsified by a token-free probe; the P5 delivery was a relevance lottery, and a fresh index is a ranking no-op

**Trigger.** hamr's job-#3 challenge ("the bugs you plant are discoverable because
litectx finds them — what needs testing?") was answered in-session with F33's mechanism
story: reset→plant makes the culprit the most-recently-changed chunk and "litectx's
recency boost" ranks it into the hook's hits, so job #3 should wipe the index per run to
kill the assist. Before freezing that rule, the mechanism was audited against litectx
source — the standing "audit a surprising mechanism before trusting the story" rule,
applied one finding too late (F33 asserted the mechanism without reading the ranking
code).

**The audit: litectx has no recency signal anywhere in the recall path.** `store.search`
is BM25 + 1-hop import-spreading (additive, pool-bounded); gitsig rows are documented
and implemented as "grounding, never scored"; chunk localization (`attachChunks`) is
pure term overlap; `recentMemory`/`recentActivity` are separate verbs precisely so
recency never mixes into a relevance ranking. Nothing in the ranking reads `indexed_at`,
mtime, or git activity.

**The probe (token-free, mailproof patient, P5, same job-query recall the hook runs):**

| condition | top-8 code hits |
|---|---|
| C1 clean repo, incremental index | culprit chunk (`ingest.js handleInitiatorCommand`) at rank 7 |
| C2 P5 planted, incremental index | IDENTICAL set and order (culprit BM25 0.7780→0.7782) |
| C3 P5 planted, fresh index | IDENTICAL set and order |

Three consequences:
- **F33's mechanism is corrected, not its observation.** The hook really did hand P5's
  worker the culprit body pre-round-1 (recall_log fact, stands). But the delivery was
  the generic job query's plain BM25/spread relevance — the culprit chunk is in the
  top-8 ON THE CLEAN REPO. The plant contributed nothing; reset→plant manufactures no
  assist; which plants get "aim assist" is a fixed property of (query, corpus), a
  lottery drawn once per patient, not per plant.
- **"Fresh index per run" is a ranking no-op** (C2==C3, measured). Job #3 keeps the
  condition with an honest rationale: it wipes the written-memory store (row
  independence by construction instead of by F33's key-collision accident) and starts
  each run's recall_log clean. It kills no assist, because there is none.
- **Aurora pre-read, recorded before any battery number:** the aurora job query returns
  ZERO culprit chunks in the top-20 on the clean patient (top-8 = generic CLI noise).
  By the invariance above this predicts every run: job #3's worker gets no retrieval
  gift; the find must come from the gap's failing-test names. The battery's difficulty
  read is honest at the retrieval layer — measured, not assumed.

**Lessons minted.**
- A mechanism claim about a dependency is unverified until the dependency's code is
  read — F33 shipped a ranking story litectx's source contradicts in three separate
  places, and the story survived into a freeze proposal and an answer to hamr before
  anything checked it.
- The two-should-differ-conditions rule cuts both ways: it caught the embeddings no-op
  (index 7ms tell) when conditions that should differ matched, and here it caught a
  correction the same way — conditions the STORY said should differ (planted vs clean,
  fresh vs incremental) matched exactly, so the story was wrong.
- An intervention should be probed before it is frozen, not after: the fresh-index rule
  cost one token-free probe to test and would have cost a battery pass to misread (any
  difficulty change would have been attributed to the index condition).

---

## F36 — job #3 battery: 4/4 attempt-1 greens at $0.88 under a measured zero-assist condition — the loop tier fails to appear in a second repo, second close genre, and 34× the search space

**The run (AURORA-PREREG frozen rules, spec `906eaa60…`, sonnet-5, `edit` granted, fresh
index per run):**

| plant | outcome | attempts | writes | culpritRead | rounds | spent |
|---|---|---|---|---|---|---|
| A1 (adapter, cross-file symptom) | green | 1 | 1 | true | 5 | $0.1007 |
| A2 (cross-package + anchor trap) | green | 1 | 2 | true | 7 | $0.1494 |
| A3 (2,233-line culprit) | green | 1 | 1 | true | 12 | $0.3053 |
| A4 (same file, second function) | green | 1 | 1 | true | 14 | $0.3293 |

Worker spend $0.8847 of the $10 stop. Every sanity close reproduced the prereg's failing
set exactly. A3+A4 read as ONE replication cell per the frozen rule: three independent
difficulty samples, all easy tier.

**Green-side audit (pre-registered; ran per row):** every close precheck-red (judged
2689–2690) → final `satisfied` at judgedCount 2691, above the 2600 floor; zero gate
denies; every write a single anchored `edit` inside `packages/*/src/**` (104–673 bytes);
zero test writes. A2's two edits (195B then 673B on the culprit) are consistent with the
prereg's anchor trap firing live — a short anchor refused at the tool level, a longer
unique anchor landing — though the tool-level refusal is not a spine record.

**The retrieval-honesty read held exactly as pre-registered (F35's payoff):** the
before-attempt hook recall delivered the culprit in **0 of 4 runs** — matching the
clean-repo pre-read's zero-culprits-in-top-20 prediction. Every culprit that reached the
worker through retrieval was EARNED: a worker-initiated `ctx_recall` whose query names
the symbol lifted from the failing test (`convert_agent_info`,
`_execute_parallel_subgoals`, `show_plan …`) — the exact read-the-test-then-recall flow
the F19 strategy line teaches. This is the first battery where the retrieval layer's
contribution is measured clean end-to-end: no gift, only navigation.

**The effort gradient is real even though the attempt gradient is absent:** 5 → 7 → 12 →
14 rounds tracks the prereg's difficulty axes (file size, decoys, cross-package
distance); cost per green $0.10–$0.33 (vs mailproof's $0.05–$0.37). What did NOT
materialize, again, is a second attempt: zero worker-crash events, zero cap-reds, so the
F32 delivery/conversion axes have no data for the third consecutive pass.

**The pre-registered saturation conclusion fires.** Under a no-assist retrieval
condition, a new close genre (pytest), ~2.5-minute close latency, and a 34× larger
search space, planted single-line bugs whose covering test imports the culprit module
STILL green on attempt 1, every time. Combined with F33 (mailproof saturated) and F34
(the escaped-bug middle exists only where a tested architectural seam hides the
culprit): **the loop tier — THE thesis — cannot be minted from this patient class at
all.** The lever is not more plants, more repos of this shape, or more passes; it is a
patient whose architecture hides tested culprits (layered orchestrator seams), or a
defect class that survives a direct test-import trail.

**Battery ops (real conditions found real infra gaps, all closed en route):**
- The close hung to the 15-min kill clock on launch 1 — `aur init`'s untimed HuggingFace
  freshness check inside an unmarked integration test (amendment 2026-07-16a; close
  pinned `HF_HUB_OFFLINE=1`, measured 12.8s vs >15min; the offline close is also ~2min
  FASTER per run — the hub checks were taxing every close all day).
- Two `provider-red` stops with `write EPIPE` at the draft call, both recovered by
  retry-the-run at $0 (the write never reached the API). Mechanism read from source and
  filed as BA-14: a stale pooled keep-alive socket dies during the multi-minute close;
  bare-agent's `DEFAULT_RETRY_ON` retries ECONNRESET but not EPIPE. mailproof's 25s
  close never idled long enough to expose it.
- The runner's first sanity instrument conflated a clock-killed close with a drifted
  failing set — fixed to a distinct `sanity-timeout` before any spend was risked on it.

**Lessons minted.**
- A benchmark's aim-assist claim is measurable BEFORE the battery: one clean-repo recall
  probe (F35) turned "did retrieval gift the answer?" from a post-hoc worry into a
  pre-registered prediction that the runs then confirmed 4/4.
- Close latency is an infra stressor before it is a worker stressor: 2.5-minute closes
  exposed a keep-alive lifetime bug and a third-party network dependence that 25-second
  closes structurally could not.
- A STOP that pattern-matches "drift" can be the instrument dying — the drift label must
  be reserved for a close that RENDERED a differing verdict, never one that rendered
  nothing.

## F37 — the TESTGEN curve: disclosure of a bound is a coin-flip lever, strategy-as-prose is inert, and the bound binds independent of prompting

Job #4's calibration could not produce one graded row in 19 one-shots, and decomposing
the failure into a pre-registered three-point curve (amendments 2026-07-16d/e) isolated
each prompt lever the way no single arm could:

| point (spec delta) | rows | write-producing | graded |
|---|---|---|---|
| naked (v2) | 6 (runid `mrnkxb5a`) | 0/6 | 0 |
| + bound disclosed, one sentence (v3b `ed5abf38…`) | 7 (`mrnnq9ea` C1 + `mrno2s0b`) | **3/7** | 0 |
| + full pacing strategy (v3 `a93db6c3…`) | 6 (`mrnpo2jm`) | **0/6** | 0 |

**Disclosure adds up — as variance, not as a fix.** One sentence ("the attempt has a
HARD limit of 24 tool rounds") moved the worker from never-writes to writes-in-3-of-7.
The three writing runs died differently and informatively: one D1 audit red
(`environ-enumeration` in a conftest), one at 23 unit / 0 integration tests, and one —
C4 — with a **form-passing suite (24 unit + 8 integration) on disk by round 16**, red
only at the clean phase. C4 is the existence proof: the job fits inside 24 rounds when
the model commits early.

**Strategy-as-prose is inert — F19's mirror.** The v3 spec mandated "first test file on
disk by round 8" and all six runs violated it: zero write attempts, zero gate denies,
pure read-loops to the bound. F19 established that capability without strategy is inert;
this curve establishes that **strategy without enforcement is also inert**. Advisory
prose neither installs a workflow nor even reliably nudges it (the disclosure-only arm
outperformed the arm that contained the same disclosure plus instructions). The enforced
form of this strategy is exactly plan-v1's shape — bounded steps with declarative
form-check exits (`artifact-written` by step k) — and the RLM buffer direction
(design record 2026-07-16): the buffer discipline must be structural, not rhetorical.
Layer 2's load-bearing premise, measured at calibration price before Layer 2 exists.

**The bound binds independent of prompting.** Zero graded rows across every prompt
condition tripped the frozen both-unreadable STOP; the parked `TURNS_PER_ATTEMPT`
question went to hamr with the curve as evidence and came back approved as a package:
bound 24→40 (`interpret.js`, one hoisted constant now feeds both the Gate's `maxTurns`
and the per-attempt cutoff — two literals that must agree, the advertised/enforced
class), spec v4 (`dcd69b01…`) saying 40 with `budgetUsd` $1.25→$2.00 (measured burn
~$0.033/round: 40 rounds ≈ $1.32 would re-bind money — the v1→v2 lesson run forward),
calibration stop $12.

Method note minted en route: an arm killed mid-invocation by API credit exhaustion
(`mrnnq9ea` C2/C3) produces provider-red casualties, not evidence — rows enter the curve
only from completed, priced runs.

**F37 postscript (attempt 4, runid `mrnrxr91`):** the 40-round package produced the
confirming failure from the other direction. Reads scaled with the allowance (~50 at 24
rounds → 86–91 at 40 — the prelude is Parkinsonian, it fills the window); the one run
that transitioned to writing did so at round ~36 and was halted mid-write-phase by the
money cap ("spent $1.9086 >= cap $1.90"). Rounds → money → rounds: the caps take turns
binding because the workflow, not the capacity, is the constraint. 23 valid one-shots,
four conditions, zero graded rows — the one-shot instrument is closed for this job; the
loop (fresh-context attempts fed by gaps) is the remaining instrument, exactly as
designed.

## F38 — first observed conversion: the wheel turns on mechanical gaps and stalls on the semantic one (job #4 battery)

The Layer 1 thesis — red → gap → a better next attempt — was finally observed on
2026-07-16 (TESTGEN battery, amendment 2026-07-16i, runid `mrnwm5o8`, n=5 valid, $20.37):
**ladder conversion 3/5**, attempt-1 red 5/5 (the manufactured gradient held), greens 0/5
at the 45% bar, kill-rate conversion 0/5.

The split that matters is gap GENRE, not gap delivery:

- **Mechanical gaps convert.** "collected unit=0 integration=0", "audit rejected pattern
  environ-enumeration" — every row with attempts left cleared the named wall on the next
  attempt (form → audit → clean in B1; audit → audit → graded in B3; form → graded 26
  unit + 8 integration in B4's attempt 2). The wheel is REAL: these attempts were better
  BECAUSE of the gap.
- **The semantic gap did not.** B4's attempt 3 held the close's richest feedback —
  killed=7/40 with per-function survivor counts and the instruction to strengthen
  assertions — and wrote nothing at all (gate audit: zero write/edit actions in iteration
  3; the identical suite regraded 17.5%). One cell, an anecdote by the n=1 rule — but the
  inaction is a fact, not a rate estimate, and it replays F32's P3 (told twice, zero
  reverts) and the F26/F27 surface-triage mechanism in a third context.

Layer 1's qualification question ("does feedback buy improvement at all?") now has a
measured answer: **yes, for feedback that names a wall; unobserved-and-once-refused for
feedback that names a deficiency.** The boundary is exactly where the next layers aim:
the root (Layer R) so attempt N+1 knows what attempt N already did, and enforced step
structure (Layer 2) so "improve the suite" becomes bounded steps with form-checkable
exits instead of an open semantic ask.

Instrument note: the battery survived a provider Overloaded evening only via operator-side
orchestration (11 casualty rows across five invocations, probe-gated re-fires, cross-
invocation spend ledger). Load-shedding is per-model — a haiku 200 proves nothing about
sonnet capacity; probe with the battery's own model.

## F39 — the semantic-stall probe: hand-delivered state does not buy conversion (Wizard-of-Oz Layer R)

The probe (amendments 2026-07-17a–e, every rule frozen before its number) split F38's
semantic stall into its two candidate mechanisms: **memory-class** (the worker didn't
know what the prior attempt did and what was owed — Layer R's notebook would fix it)
vs **skill-class** (the worker cannot act on "strengthen assertions on these
functions" — the notebook won't help). Method: hand-carry the notebook's entire
content in the spec description — an existing suite at tests/testgen/ (operator-
authored seed, frozen at 15% kill 6/40, clean-green, deterministic regrade, B4's
suite being unrecoverable from any artifact), the 45% bar, the per-function survivor
scoreboard, and the explicit instruction to strengthen — one attempt per row, no gap
channel. n=4 valid rows, worker claude-sonnet-5, $11.39 total across 7 launches
(runids `mrpf6h2k`, `mrpia2tz`), 0 casualties, prechecks regraded the seed at exactly
15% on all seven launches.

**Result: P-ACT-UP 0 · P-ACT-FLAT 0 · P-ACT-BROKE 3 · P-INERT 1 · greens 0. Minted
verdict (frozen third bucket): skill-class/mixed — engagement without conversion;
the notebook alone will not move kill-rate on the semantic gap.**

Two mechanisms, both grounded in the audits:

- **Aim is not the problem — verification is.** All three ACT rows targeted 14–18 of
  the 18 named survivor functions (mechanical grep of their written files): the
  scoreboard steers essentially perfectly. All three died at the clean wall with
  F27's fingerprint — tests asserting imagined behavior (`KeyError:
  'subgoals_total'`, wrong ValueError expectations, `_error` mismatches). The
  structural cause: the worker has no `run` verb (hard line, correctly), so it
  authors tests it can never execute, and in a one-attempt row its first contact
  with reality is the close that ends the row.
- **The stall reproduced under hand-delivered state.** P4 read the seed suite and
  orchestrator.py (30 reads) across all 40 rounds and wrote nothing; the untouched
  suite regraded 15% by construction. Second observed instance of the genre (B4
  attempt 3 was the first) — and this one cannot be memory-class, because everything
  the notebook would say was already in the description.

What this buys the build map: Layer R stays justified by F21/F38 (mechanical
continuity across attempts) but is now measured NOT to be the fix for the semantic
stall. The fix is Layer 2-shaped: bounded steps whose exits verify test correctness
in-run — a clean-run form check the worker can hit before the grading close —
turning "improve the suite" from an open semantic ask into walls the worker
demonstrably clears (F38's convertible genre). Secondary instrument lesson, 16g
reproduced: 3 of 7 launches died at rounds 33–39 on the drafter-tightened $1.90
money cap before the attempt close could run — $5.82 of unreadable spend. Budget
sizing must fund the attempt PLUS its close, or the instrument quietly eats the
experiment.

## F40 — branch review before the N2 rung exit: eleven confirmed defects, five fixed, four parked in arbiter territory

A medium-effort review of the whole `n2-headless-loop` branch (65 files, ~14.2k
insertions vs `main`) run as 8 independent finder angles → 1-vote adversarial verify.
**27 candidates → 11 CONFIRMED · 1 PLAUSIBLE · 4 REFUTED.** The refutations are the
useful half of the calibration: three of the four "defects" were paid-for doctrine the
finder mistook for a regression (the terminal `killed` verdict is F17's never-retry
line; the `close.cmd` quote ban rejects a shape that was never runtime-expressible
under whitespace-split argv; withholding the gap from the plan call would blind the
planner to the failure it must plan around). **A review that cannot refute its own
findings is a review that will mint doctrine violations as bugs.**

**Fixed this pass** (TDD, every test watched failing first; suite 303 → 311, typecheck
clean, all five shipped job specs revalidated green under their real caps):

- **A `judged.pattern` with >1 capture group is now a spec red.** `runClose` reads
  group 1 ONLY, so an alternation carrying the count in another branch leaves group 1
  `undefined` → `NaN` → `judgedCount` null → **an exit-0 GREEN stamped `crashed`**:
  the exact mirror of the fake green the judged floor exists to catch, and at precheck
  it escalates `close-crashed` before the worker ever runs. The validator's own message
  already promised "ONE capture group"; it only ever enforced "not zero". Alternation
  stays fully expressible via non-capturing branches — `(?:a|b) (\d+)`.
- **The ledger attributes by a TYPED field, not by sniffing prose.** `interpret.js`
  prefixes every worker-loop error with `worker loop:`, and the classifier's verb sniff
  ran FIRST — so any bare-agent transport failure whose text merely contained "recall"
  was billed to **litectx**: the wrong upstream gets the ask and the real regression
  never surfaces. The throw site now stamps `lib` (it knows the owner; the ledger does
  not), ralph relays it, and prose stays the fallback for spines written before the
  field existed — the same contract `request-red` already used. Verified end-to-end
  through the real interpret→ralph→spine→ledger chain, both directions.
- **An unrecognised escalation category is counted, never silently dropped.** The
  dispatch keyed on four bare literals with no default, so a new or renamed category
  classified to zero occurrences — byte-indistinguishable from a *deliberate*
  exclusion. A whole failure class could leave the ledger with no red and nothing to
  notice. The exclusions are now an executable `EXCLUDED_ESCALATIONS` set rather than
  prose, and anything outside {classified} ∪ {excluded} is charged to bareloop as a
  stale emit→classify mapping — OUR bug, which is the point.
- **Two F6 launderings closed.** `run-job1`/`run-job2` printed `spent: $0.0000` for
  provider-red/pricing-red runs, whose `job-end` carries no `spentUsd` and which can
  terminate *after* real priced spend has accrued — asserting a failed run was free.
  Now `?? null` → `UNKNOWN`, the spelling `run-battery` already used. The revision
  spine events did the same with `?? 0`; governance was never affected (revisor rounds
  meter through `worker-round`), but the spine is the permanent record.
- **`scanSecrets` joins the ONE shape inventory.** The raw-text secret scan was
  hand-rolled at seven call sites off `SECRET_PATTERNS`; detection and redaction must
  never disagree about what a secret looks like, and seven copies is seven chances to
  drift on the very output the scan guards. Now exported beside the inventory and wired
  into the two job runners.

**PARKED for hamr's explicit go — arbiter territory, named and scoped, not shipped:**

1. ~~**A reused config dies against a shrinking ceiling (budgets).**~~ **RESOLVED — by
   per-step drafting, NOT by the fix first proposed.** The workflow config
   is drafted ONCE, but every step re-validates it against `ceilingNow()`, which shrinks
   as `spentUsd` grows. Traced: budget $1.50 → drafted `gate.budgetUsd` 1.425 (legal at
   step 1) → step 1 spends $0.60 → step 2's ceiling is 0.9 → `bounds` red → `step-red`
   with **$0.90 unspent** and a config that was never over the total budget. No redraft
   path exists. Fix touches budget semantics (redraft per step, or draft against a
   worst-case per-step ceiling) — the agent may only TIGHTEN, so this is hamr's call.

   Two things surfaced when hamr picked the relax-validation option, and together they
   killed it. **(a) The behaviour already had a pre-registered test.**
   `tests/run.test.js` carries *"mid-job budget exhaustion: the drained ledger reds the
   next step BEFORE tokens (cap-not-estimate)"* — my scenario in miniature (budget
   $0.50, ceiling $0.40, step 1 spends $0.151, step 2 reds on the remaining $0.349) —
   asserting that outcome is CORRECT, down to *"step 2 burned zero worker tokens"*.
   Relaxing validation inverts a named, tested decision. **(b) My safety claim for it
   was false.** I said the real protection was untouched; it is not. `interpret` builds
   each step's gate from `config.gate.budgetUsd` and the job pot is only checked BETWEEN
   steps — so the validation red IS the only mid-step bound. Relaxed alone, a step gets
   a $1.425 gate with $0.90 left and nothing stops it.
   **Shipped instead: the drafter is offered `(budget − reserve) ÷ predicate steps`.**
   The shares sum to the reserve-less budget, so every step can claim its share and the
   false positive cannot arise; cap-not-estimate keeps its test (numbers re-based, since
   under per-step shares a single step can no longer drain the pot below its successor's
   claim unless drafting overruns the reserve); enforcement is untouched. Verified: all
   five shipped jobs have ONE predicate step and their ceilings are byte-identical.
   Mutation-checked — restoring the whole-pot divisor fails the new test on its own
   assertion. The real lesson is the question underneath: `gate.budgetUsd` is a CEILING
   ("may spend up to"), and the old code read it as a REQUIREMENT ("needs this much"),
   which is why a stale ceiling looked like infeasibility.
2. ~~**`jobs/aurora-fix.json`'s judged pattern is a passed-count floor**~~ **FIXED** — (`(\d+) passed…`,
   min 2600) where every sibling job counts tests EXECUTED (`# tests (\d+)`). It
   conflates "did the close judge" with "did the tests pass", so an honestly-red tree
   printing `2580 passed` is escalated `close-crashed` at precheck and the worker hired
   to fix that red is never invoked. The job spec is the arbiter's rulebook.

   **The first proposed fix was POC-grade and WRONG — the real instrument refuted it.**
   Having verified `-q`/`-ra` behaviour against a hand-made 3-test directory, I proposed
   `^collected (\d+) items`. Running the ACTUAL patient suite (2712 tests, 175s) printed
   `collecting ... collected 2712 items / 18 deselected / 2694 selected` — the anchor
   never matches, because the line begins `collecting ... `, and the marker filter adds a
   three-part shape the toy fixture could not produce. This is the repo's own rule paid
   for a second time: **a check is validated only against its REAL instrument, never a
   fixture.** Shipped after measurement: pattern `collected (\d+) items` (unanchored),
   floor 2600 unchanged, and `close.sh` swaps `-q` for `-ra`. Exercised against all four
   real output shapes — green tree, red tree, no-deselection, and a collection error
   (which correctly still reads `crashed`, the fake-green case the floor exists for).
   Also measured: the clean tree reports 2691 passed, so the old pattern only broke once
   more than ~91 tests failed — which is why the job #3 battery never tripped it, and the
   recorded 4/4 greens stand.
3. ~~**Revisor rounds are charged to the worker's per-attempt bound.**~~ **UNPARKED and
   fixed same session** — parking this was the review's own error. It is not a judgment
   call between defensible options: PRD (Addendum, TESTGEN 2026-07-16e) states *"the
   advertised bound and the enforced bound stay the same numbers on both axes"*, and
   `interpret.js` already carves out exactly this case for the summarizer fold (*"an LLM
   call but not a worker ROUND — counting it would let a fold shorten the attempt that
   paid for it"*). The revisor is that same case wearing `kind: 'turn'`. Current state
   IS the violation; the fix restores the invariant rather than choosing a new one.
   Fixed with an `inRevisor` phase flag: money still meters on the run's axis (F12),
   rounds no longer charge the worker. `finally`, not a trailing assignment — a revisor
   that throws (cap-halt is the expected one) must not leave the bound uncounted for the
   rest of the run, which would convert the fix into an unbounded attempt.
4. **`extractArtifact` takes the first in-window fence even when it is a command
   block.** `'Run this:\n```bash\nnpm test\n```\nHere is the file:\n```js\n<module>\n```'`
   extracts `npm test`, writes it to target with `red: null`, and the close reds against
   a corrupted file as though the worker failed. The selection rule is a PINNED,
   tested decision ("multiple fenced blocks: the FIRST is the artifact") on the ONE
   parser used by the artifact, the rules, and the drafted config — changing it is a
   design change, not a bug fix. Low urgency: no shipped job runs text mode.

**Not fixed, deliberately, and not papered over:** the JSONL spine-reader idiom is
duplicated at ~10 sites across `scripts/` with no reader in `src/spine.js` (the test
suite already consolidated its own at `tests/helpers.js`), and five of the seven
`scanSecrets` call sites remain hand-rolled. Those five are **frozen battery
instruments** whose recorded runs are pre-registered evidence; behaviour-preserving or
not, rewriting them post-hoc muddies the record for a drift-prevention win, and they
carry no test coverage to catch a mistake. New scripts use the helper.

> **Addendum 2026-07-30 — the scanSecrets park is RETIRED (hamr's word, this date).**
> The 0.6.0 release gate's review re-flagged the hand-rolled copies; the sweep
> converted all of them (nine by then — four more had accreted in post-F40 scripts)
> before the park was noticed, and the reversal was surfaced to hamr rather than
> papered over. hamr ruled the park spent: *"if its irrelevant compared to where we
> are or has been invalidated by any of probes, why should we keep it?"* The two risks
> the park guarded are both retired by measurement, not assumption: (1) equivalence
> was proven on 900 spiked real-spine cases (all five token shapes × three offsets,
> 670 hits, 0 divergences) with a comparison demonstrated ABLE to diverge (a
> deliberately broken copy reads 4 vs 5); (2) the recorded evidence cannot shift —
> the battery runs are archived and finished, and three of the five instruments can
> no longer execute at all (their job specs are retired; pre-existing ENOENT verified
> against HEAD). The count in this block ("five of the seven") was also stale twice
> over — the grepped truth at conversion time was 11 call sites, 2 already canonical,
> 9 converted. No test files referenced the five scripts (checked at retirement —
> nothing to delete or archive). The JSONL spine-reader park above is untouched.

**One PLAUSIBLE, latent:** a single `opts.target` threads to every text-mode step, so
two text-mode predicate steps would clobber each other's artifact. The schema permits
it; no shipped job comes near it; single-artifact text mode is documented intent.

**Correction, same session.** Challenged on why four items were parked rather than
fixed, three of the four reasons survived checking and one did not (see item 3). A
second reason was also wrong on the facts and is corrected here: `jobs/aurora-fix.json`
was said to be blocked because editing a job spec breaks its approval signature — it is
not. The battery runners compute `specHash` over the spec at launch and self-sign
(`run-battery-aurora.mjs:133`), so an edited spec re-signs itself. The REAL blocker is
narrower and was found by probing the actual instrument: the close is `pytest -q`, and
**`-q` prints no executed-count line at all** — only `120 failed, 2580 passed in 45.3s`,
whose executed count is a SUM that one capture group cannot express. So no pattern edit
can fix it; the operator's close wrapper must change (verified against the patient's own
venv: dropping `-q` restores `collected 2700 items`, and `-ra` must be added or the
existing `gapKeep "^FAILED "` loses its lines). That wrapper lives outside this repo and
outside the worker's readScope by design — operator territory, hamr's call.
**Parking is a judgment, and a wrong reason for parking is as much a finding as a bug.**

**Lesson.** The two highest-severity defects were both *fake-verdict generators* —
a green stamped `crashed` (group-1 read) and a red escalated as an instrument crash
(passed-count floor) — and neither was reachable by any test that asserts on a
verdict's happy path. The arbiter's failure modes are symmetric, and the suite was
only ever checking one side of each.

**Follow-up 2026-07-19 (hamr review — items 4 and the PLAUSIBLE get destinations).**
A proposed tripwire for the single-target latent — red any spec with ≥2 text-mode
predicate steps — was REFUTED before landing by the suite's own rows: six passing
run tests (including the pre-registered cap-not-estimate test) deliberately run two
text steps as successive gates refining ONE artifact, and the PRD §6 job
(review→fix) is that shape. Same class as item 1's refuted relax-validation fix,
caught pre-landing this time. The clobber is a defect only for DISTINCT
deliverables, which job-v1 cannot express — so no code ships now, and both latents
are named requirements at the rung that builds the capability (PRD Addendum v1.18):
**per-step deliverable targets** in the plan-v1 step schema (Layer 2, LAYERS.md
build order item 3), and **genre-aware extraction** keyed on close class (green →
tool mode, nothing parsed; hitl/document → the whole reply is the deliverable) at
the non-code rung, to be designed against real document-job replies — this finding's
own `collected`-pattern lesson applied forward.

## F41 — fixation is currently extinct: the disease Layer R treats is unobservable on every existing job at current code

**Setup.** Layer R (the within-run ratchet, design record 2026-07-19) was built to stop
F21's disease: a never-green run rewriting the same file against an unmoving red set.
Before freezing its ON/OFF acceptance battery, two pre-registered $0/cheap reads asked
whether the disease still exists to be treated.

**Read 1 — the archive ($0, `poc/layer-r-base-rate.mjs`).** All 109 surviving spines
(jobs #2 + #4; every row pre-Layer-R, therefore OFF-arm by construction) swept with the
detector's own definition over the real gate audits: 9 multi-attempt rows → 10 judged
red→red pairs → **fixated 0** (inaction 4, moved 3, different-file 3). The instrument is
connected — it populates every other class — and the pre-gapKeep rows bias TOWARD
fixation (empty kept-sets compare equal), so the zero survives its own bias.

**Read 2 — the job #1 probe ($3.75, frozen pre-numbers in
`scripts/run-probe-layer-r.mjs`, N=3, root OFF, fresh patient: local litectx @0.30.0,
F18-era plant `keywords() >= 3 → > 3`, 407/3, judged 410).** Zero pairs produced,
INCOMPLETE by the frozen rule — but the two zero-pair MODES are themselves the finding:
one run's $1.50 budget died mid-attempt-2 (the spec funds exactly ONE judged attempt —
job #1 as signed cannot produce pair data), and **two of three runs greened on attempt
1** ($1.06, $1.26): the job that hosted nine defect-finding runs and F21 itself is now
mostly easy-tier. The F33/F34 saturation pattern has reached job #1.

**The finding.** F21's fixation was a symptom of the broken-loop era — no attempt
bound (F20), no gap delivery (F21), no edit verb, 4096-token truncation (F30) — and
the cures for those defects appear to have cured the repetition disease itself, on
every job shape we own. A ratchet built for a disease is not invalidated by the
disease's remission: Layer R is mechanically validated (14 unit + 4 integration tests,
mutation-checked), measured inert when the worker is not stuck (its design condition,
now observed in the field: 0 injections across every probe run), and its
`root-injected` spine event is a standing tripwire that will NAME the first real run
that fixates. Field acceptance (the repetition-drop ON/OFF read) DEFERS to the first
job that exhibits the disease — expected next at Layer 2's micro-wheels, where
narrow-scope steps put repetition pressure back on the worker. Deferral is recorded,
never papered: no learning claim is minted for Layer R, and LAYERS.md keeps its rung
open.

**Lesson.** Measure the base rate of the disease before running the cure's trial — two
cheap reads ($0 + $3.75) prevented a ~$30 battery that would have compared two arms of
zero against each other and could have been narrated as "no significant difference"
instead of "nothing to measure."

**Follow-up 2026-07-20 (probe 2, hamr's order "one more probe and harder close"):
CONCLUSIVE.** Both starvation causes removed — planted v2 stacked THREE plants in three
subsystems (tokenize `>=` flip · store `related()` hops `min→max` · assemble budget
`<=→<`; 410 judged / 8 fail, one fix cannot green) and `budgetUsd` 1.5→4.5 (re-signed)
funded three judged attempts. Result ($6.37, frozen rules): **4 eligible red→red pairs,
0 fixated, 4 different-file** — the worker cleared roughly one subsystem per attempt,
moving files every time (P3: 8→4→green across 3 judged attempts). The frozen decision
fired: job #1 no longer exhibits fixation under current code. F41's remission claim is
now probe-confirmed, not INCOMPLETE-supported; Layer R ships armed-and-inert and its
field read defers to the first run whose spine says `root-injected`.

## F42 — the clipipe money blackout was fixed upstream and our copy of F2 went stale: bareloop can run on the subscription today

**Trigger (2026-07-20).** hamr asked why bareloop is API-only — "because of budget?" — and
whether clipipe has cost/budget to wire. The standing answer was adaptlearn's F2
(`docs/00-context/FINDINGS.md`): `provider-clipipe.js` reports `usage: {inputTokens: 0,
outputTokens: 0}` and `toolCalls: []` on every call, so the CLI path is money-blind, every
round reds as unpriced (F6), and no run can satisfy the hard-cap law. That finding was
inherited as closed context and never re-checked. An upstream ask against bare-agent was
about to be filed on it.

**Read the source first (the withdrawn-ask rule, applied and vindicated).** bare-agent
**0.29.0 — the version bareloop already has installed** — ships an opt-in `parse` option on
the clipipe provider. `parse: 'claude-json'` maps the `claude -p --output-format json`
envelope onto `GenerateResult`: `text←result`, `usage←usage.*` (including
`cacheReadTokens`/`cacheCreationTokens`), `model←`first `modelUsage` key, and
**`costUsd←total_cost_usd`**. Its own comment: *"The CLI's own price is authoritative
(subscription runs report an equivalent cost even at $0 marginal) — feeds bareguard's USD
axis with no local rate table."* F2's ask therefore already exists, shipped. Filing it
would have been the program's SECOND withdrawn ask for a capability that was already
there.

**Live probe (evidence, not the comment).** `claude -p --output-format json 'reply with
exactly: ok'` returned `total_cost_usd: 0.36858949999999996` plus a full usage block
(`input_tokens` 2, `output_tokens` 4, `cache_creation_input_tokens` 36093,
`cache_read_input_tokens` 15099) and a per-model `modelUsage.costUSD`. Both the money and
the tokens are real and present on a subscription run.

**Why it stayed invisible:** the parse option is OPT-IN. Unset, the provider still returns
stdout verbatim with zero usage — F2's exact behavior. **The default is the trap**, so the
capability can ship for versions without any consumer noticing.

**Consequences, stated honestly and NOT acted on:**
1. The API-only posture is no longer forced by the instrument. Binding clipipe with
   `parse: 'claude-json'` gives a working USD axis. bareloop needs NO library change for
   this — the provider is caller-supplied and shell-owned (`runJob({provider})`).
2. **The dollar figure is NOTIONAL, not billed.** On a subscription `total_cost_usd` is
   API-equivalent value consumed; nothing leaves the account. A budget cap on that path
   governs equivalent-value, not money. That is a BUDGET SEMANTIC — arbiter territory,
   hamr's ruling, deliberately unmade here.
3. **It is expensive in those notional terms.** A trivial one-word probe reported $0.369
   because the CLI created 36k cache tokens for its own context. A run costing cents on the
   API can read as dollars here and trip a cap early. Any clipipe battery must re-baseline
   its budget before it means anything.
4. The rounds-cap fallback drafted for "a provider that reports neither price nor tokens"
   was DROPPED unbuilt — clipipe reports both, so that provider does not exist in our
   stack, and building it would be speculative code for a hypothetical.

**Lesson (a re-mint, not a new one).** A closed finding copied from a predecessor repo is a
snapshot of a dependency at a moment, not a standing fact — and dependencies get fixed. The
rule "read the library source before filing an upstream ask" saved the ask; the rule that
should have fired earlier is that an inherited constraint blocking a whole capability
(here: running on the subscription at all) deserves a re-check against the CURRENT installed
version before it hardens into architecture.

## F43 — intent and outcome are two instruments: Layer R settled its note on the gate's allow, which is written before the tool runs

**Trigger (2026-07-20).** Three consecutive patches to Layer R's tee each revealed the
next defect (secret capture, gate-rejected content surfaced as landed, anchor-miss
content surfaced as landed). hamr stopped the session on the pattern — "you are patching
up shit on top of shit" — and demanded the feature be read end-to-end and VALIDATED
rather than diagnosed by assertion. That instruction is what produced this finding; the
three prior patches were each aimed at a symptom nobody had measured.

**The mechanism, read from source.** `wireGate`'s policy runs `gate.check` BEFORE
`tool.execute` (bare-agent `src/loop.js:913` → `:958`). An `allow` record is therefore a
statement of INTENT — the gate permitted the action — and never a statement that bytes
reached a file. Three post-allow paths leave the file untouched with the allow already
on the audit: `shell_edit` returns a 0-match or 2+-match anchor failure as a refusal
RESULT (`tools/shell.js:190,194`), a byte-cap overflow throws (`:204`), and a missing
file throws at the read (`:186`). Layer R committed its tee on the gate verdict, so any
of the three ended the attempt holding content it would later present to the worker as
"your own previous changes — they landed".

**Validated end-to-end, not argued** (`tests/interpret.test.js`, real Loop / real
bareguard Gate / real `shell_edit` / real `node --test` close, scripted provider only).
A worker repeats one anchor-miss edit across three attempts:

| observable | reading |
| --- | --- |
| file on disk, every attempt | **unchanged** — zero bytes ever written |
| gate audit, `type:'edit'`, `decision:'allow'` | **3** |
| `root-injected` events | summary, then verbatim |
| note delivered to the worker | *"These are your OWN previous changes — they landed"* + `return NEVER_LANDED;` |

The claim was false in the strongest available sense: the quoted text was provably absent
from the file the note named.

**The proposed fix was wrong, and testing it is what proved it.** The first remedy
drafted was to delete the interception entirely and diff the tree at attempt boundaries —
"stop reconstructing reality, observe it". Run against the real detector, an attempt that
changes nothing contributes an EMPTY write-set, and the detector returns `null` on every
attempt: the rework would have gone completely blind to a worker re-firing an identical
edit forever, which is the purest fixation the ratchet exists to catch. A cleaner-sounding
architecture measured strictly worse than the thing it replaced.

**The actual defect.** Layer R answered two different questions from one write-set.
*"Is the worker repeating itself?"* is a question about what it REACHED FOR — the audit's
allow-set is the correct instrument, and an edit that never applied is still repetition.
*"Is this content in the file?"* is a question about OUTCOME — only the file can answer,
and a note making that claim must be true. Neither axis substitutes for the other, which
is why three patches to the content path kept not being enough: they were patching the
wrong axis.

**Shipped.** The detector is untouched (intent, no regression). The note settles on
outcome via `Loop`'s `onToolResult` seam (post-execution, carries result AND error),
which the interpreter had never wired. `landed` is `hash-changed OR content-now-present` —
the second clause is not redundant: a byte-identical rewrite changes no hash yet genuinely
leaves that content in the file, and calling it a phantom would mirror the original bug.
An unapplied repeat now yields a strictly BETTER note than the old false one — it names
the missed anchor, which is F38's mechanical genre (the genre that converts) rather than
"form a different hypothesis", advice that would steer a worker away from a correct fix
aimed at a wrong anchor. Four mutations (force-landed, force-unlanded, drop the
byte-identical clause, ignore the settle argument) all killed; 358/358 green.

**The `maxTurns` follow-up — RESOLVED, not parked (2026-07-21).** The fix wires `Loop`'s
own `onToolResult` (my callback, `onToolOutcome`), NOT `wireGate`'s — mine calls
`root.settleWrite` and never `gate.record`, so no tool record is created. That was worth
verifying rather than asserting: a real tool-mode run's gate audit shows every
counter-ticking `record` row is `type:llm` and the `read`/`edit` actions appear only as
`gate` (check) rows, which do not tick (bareguard `limits.js:88`). So `maxTurns` already
counts LLM rounds only — the desired semantic is the live behavior, not a change to make.
The residual risk was purely latent: a FUTURE wiring of `wireGate`'s `onToolResult` into
`gate.record` would start ticking `maxTurns` on tools and silently halve the LLM budget
(the F37 lower-silent-ceiling class). bareguard is not the place to fix — it offers
`maxTurns` (all records) and `maxToolRounds` (tool records only), neither an llm-only
counter, and we do not need one because we never record tools. So the fix is a bareloop
GUARD: a test pinning "every `gate.record` is `type:llm`" (mutation-proven — wiring tool
records turns it red) plus a load-bearing comment at the config site. No behavior change,
no upstream ask. Correcting the earlier writeup: this was never arbiter territory — it is
a guarded invariant, and calling it "parked for hamr's go" overstated a two-minute check.

**Layer R ships OFF by default (decided 2026-07-21).** Fixation is extinct on every
current job (F41), so ON has never won its own A/B; `layerRoot` defaults `false` (pass
`true` for the ON arm). The default-flip decision is assigned to Layer 2: the first Layer 2
job that produces natural fixation runs the pre-registered ON-vs-OFF acceptance read, and
that result flips the default to `true` (ON helps) or keeps it `false` (no lift). A cheaper
manufactured-fixation probe could answer it sooner, caveated by F41 (strong models resist
fixating, so the probe may struggle to produce its own precondition). Recorded in
`docs/01-product/LAYERS.md` (Layer R note) as a Layer 2 TODO.

**Lesson.** Two questions answered from one number is a blind-instrument defect wearing
different clothes — the class that has now shipped five times in this program. And the
rule that a remedy must be tested as hard as the defect: the tree-diff proposal read as
obviously correct, was argued confidently, and died the moment it was executed. A fix
proposed from reading is a hypothesis, not a fix.

## F44 — the F43 review pass: three real correctness bugs (all in F42/F43 commits), five cleanups

**Trigger (2026-07-21).** A fresh high-effort workflow code-review of the whole
`main..layer-r-root` branch (the F43 fix + the F42 money-visibility work) surfaced 3
correctness bugs and 5 cleanups. Every finding was VALIDATED by an executable
reproduction before any fix, and every fix mutation-proven (revert the fix → the new
test fails). All three correctness bugs were introduced by THIS branch's own commits —
fresh full gates finding real issues after prior review rounds, again.

**Finding 1 (serious, shipped code + frozen harness) — a casualty job-end laundered
unknown spend as complete, and defeated the battery casualty-STOP.** `1b0720c` ("every
job-end states the money") added `...spend()` to all 15 job-end paths, including the two
CASUALTY paths (provider-red, pricing-red). Two consequences, both empirically captured:
- The frozen battery scripts halt the battery on `job-end.spentUsd == null` ("spend
  unknown — the cap cannot govern it"). With a number now always present, that guard
  never fired: a provider-red/pricing-red casualty no longer STOPPED the battery — it
  summed an understated floor against the cap and counted the casualty as a row,
  breaking "provider-red rows are casualties, never evidence" and the F6 spend line.
- A provider-red TRANSPORT THROW reported `spendComplete: true` — an F6 honesty
  violation: the failed call never returned a usage figure, so the total is a floor, not
  exact; the job-end contradicted its own escalation's "spend … is unknown".
  Fix, decomposed: (a) LIBRARY — the transport-throw provider-red now reports
  `spendComplete: false` (the draft-TRUNCATED provider-red keeps `true`: that round WAS
  metered, spend is known). (b) FROZEN SCRIPTS — the casualty-STOP now keys on
  `spendComplete === false || spentUsd == null` (new floor signal, or the pre-F43 bare
  null), which is strictly more correct than the old null-only guard (it no longer
  hard-stops on a draft-truncation whose spend is known, while still halting on genuinely
  ungovernable spend). Validated end-to-end: provider-red `{0, false}` and pricing-red
  `{0.001, false}` both re-fire the STOP; a complete-spend row never does.

**Finding 2 (Layer R, experimental arm) — the outcome probe mislabeled a missed-anchor
edit as "landed".** `onToolOutcome`'s hash-unchanged fallback used
`readFileSync().includes(newText)`, which false-positives when the edit's `newText`
already appears elsewhere in the file — the note then tells the worker "you wrote this,
it didn't fix it, try something else", the exact mis-steer the intent/outcome split
exists to prevent. Fix: discriminate by the TOOL RESULT (`shell_edit` success returns
`edited …`, an anchor miss returns `shell_edit: … no change made`), and use exact
equality (never substring) for a byte-identical whole-file write. One read now serves
both the after-hash and the check (was two — Finding 5).

**Finding 3 (Layer R, experimental arm) — the ratchet false-fired on a progressing
worker in text mode.** With no `gapKeep` the red-set is always UNKNOWN, and in TEXT mode
the single target is rewritten every attempt by construction, so write-overlap is
constant-true → `fixated` unconditionally true from attempt 3, steering a worker that was
making progress off course (violating "inert when not stuck"). Fix: `writesInformative`
(true in tool mode, where the worker CHOOSES files; false in text mode). When writes
carry no information, only a KNOWN-unmoved red-set can establish fixation — the degraded
writes-only path fires only when writes are informative. The intended tool-mode
crash-gap writes-only firing (a deliberately-tested case) is preserved.

**Cleanups.** Double redaction in the verbatim block (content is scrubbed once at
capture); the `attempts` array retained every attempt's teed content though only the last
two are read (now bounded to 2); a dead `gap ?` ternary (gap is guaranteed truthy).
Finding 4 (the audit re-parse per attempt) was VALIDATED but its incremental-cursor fix
was DEFERRED, not shipped: it is cleanup-tier, bites only the OFF-by-default arm, and the
incremental reader's multi-path accumulation is not yet test-covered — "simple > clever"
won over shipping a clever reader thin tests can't guard. Recorded in the source with its
reason. Finding 5 folded into the Finding 2 fix.

**Lesson.** The review's own top finding was a tension between two of this session's
commits (F42's money-visibility vs the frozen scripts' casualty signal) that no single-
commit view would catch — a whole-branch fresh gate is a different instrument from
per-commit review. And "state the money on every path" is right only if "state whether
it is COMPLETE" travels with it; a bare floor that reads as exact is the F6 laundering
bug wearing a more-honest-looking coat.

## F45 — the Layer 2 POC's first firing: two harness instrument bugs, and clipipe's notional cost wall measured on a real transcript

**Setup (prereg 2026-07-21a, frozen f5d2329).** First firing of the Layer 2 POC:
BASELINE arm (F39 replication over `clipipe-subscription`, capRuns=1, $3/row
notional) gating a CHECK arm (in-run clean-run check, capRuns=4, $12/row) behind a
transport gate. Worker claude-sonnet-5 via bare-agent 0.32.0 tool emulation. Six
baseline launches, $16.09 notional, 0 API dollars, secrets clean, spendComplete
true on every row, all six grader prechecks at exactly 15%.

**As printed: 6/6 B-INERT, 0 ACT rows, transport NOT confirmed, CHECK arm never
fired, reading VOID.** The stop mechanism worked. The numbers behind it did not
survive autopsy — two instrument bugs, both in the POC harness, both mine:

1. **Grader-log slice off-by-precheck (blind instrument, the 6th shipping of the
   class).** `runJob` prechecks with the grader, so the harness's "attempt grade"
   slice began at the PRECHECK entry — every row's `attempt=verdict:15%` was the
   precheck re-read as if it were the attempt's grade. B1/B2's real attempt grades
   exist one entry later (both regraded the unchanged seed at 15%); B3–B6 have no
   attempt grade at all.
2. **The frozen 16g rule had no detector.** The prereg says money binding
   mid-attempt before that attempt's close is an INSTRUMENT-STOP and the row a
   casualty. B3–B6's spines show exactly that signature — `cap-halt` with no
   `worker-result` and no `close-verdict`: the $3 cap cut the worker mid-read at
   rounds 6–11. The harness classed them valid B-INERT and kept launching; per the
   frozen rule the run should have stopped at B3. A frozen rule without a wired
   detector is prose, not protection (F37's mirror, instrument-side).

**Corrected readout: 2 valid rows (B1, B2 — honest voluntary INERT: worker-result
present, quit at rounds 8/5 with zero write/edit actions, gate audits show
reads-only over the seed suite), 4 casualties (money-cut), transport UNREAD (not
refuted), premise UNREAD. VOID stands, for the corrected reason.**

**The measured wall (the F42 re-baseline, now with a real number):** notional cost
on a real TESTGEN transcript is **$0.25–0.55/round** — 8–16× the API's measured
~$0.033/round (F37, cacheMessages on). The smoke's $0.010–0.018/round was a
trivial-transcript floor; sizing caps from it repeated 16g's estimate-not-cap
error in a new coat. At real rates a 40-round attempt costs ~$10–22 notional: the
approved $3 baseline row cannot fund even the reading phase of the job shape, and
a $12 check row funds barely one attempt of four. clipipe at this transcript
weight is notionally EXPENSIVE; its $0-marginal advantage is real but the
subscription headroom it consumes is not free.

**Suggestive, explicitly unminted (n=2):** both completed rows quit voluntarily
after ~5–8 reads without writing, on a spec byte-identical to F39's — where the
API-native worker acted in 3 of 4 rows. A surface-driven action-rate drop on the
emulated path is plausible and cheap to test, but two rows are an anecdote by the
n=1 rule and the four cut rows cannot vouch either way.

**Lesson.** Decompose-before-diagnose held (the autopsy caught both bugs before
any conclusion shipped), but both bugs were preventable at authoring time: a
harness that reads a shared append-only log must account for every writer inside
the window it slices, and every frozen money rule needs its detector wired the
day the rule is frozen — compliance by intention does not exist. And a cost
re-baseline done on a floor-shaped workload is not a re-baseline (16g, third
appearance): measure on the real transcript before a cap means anything.

## F46 — the Layer 2 premise validated: an in-run operator-signed check converts the clean-wall death, 3/3

**Setup (prereg 2026-07-21c, frozen 3f29b95; harness fixes 4c89942 in force).**
CHECK arm on `anthropic-api` — the surface where the baseline natively lives:
F39 (same provider, same claude-sonnet-5 worker, byte-identical description
body, same 15% seed, same frozen grader and 45 bar) measured 3/3 acting rows
dying at the clean wall and 0 kill-rate lift under hand-delivered state. The one
lever added here: the row's in-run close is an operator-signed CHECK
(changed-from-seed → D1 → form floor → clean run) with capRuns=4, and a
check-green row faces the frozen grader exactly once, harness-run. In plan-v1
vocabulary: `tree-changed ∧ check-passes(clean-run)` as a step exit.

**Result: 3/3 C-CLEAN-PASS, $5.24 of $30, zero casualties, zero INERT.**
C1: 9 acts, 40 rounds, graded 27.5%. C2: 6 acts, 72 rounds, 40%. C3: 4 acts,
48 rounds, 37.5%. All three UP from the 15% seed; 0 greens at the 45 bar
(recorded, never acceptance — the pre-registered axis split held).

**The mechanism, observed directly in the check logs:** C2 and C3 each hit the
EXACT F39 death mid-run — clean-red, tests asserting imagined behavior — and the
check fed the pytest failure lines back as a mechanical gap (`FAILED
test::name - AssertionError`, F38's convertible genre). Both rows fixed their
imagined-behavior asserts on the next attempt and settled check-green. The event
that was 100% fatal in F39 converted 2/2 times it occurred. C1 never hit the
wall (cleared inside attempt 1). Aim stayed excellent as F39 found (12–18/18
survivor functions targeted); what changed is that verification moved IN-RUN,
where the worker can act on it before the verdict ends the attempt.

**What this validates and what it does not.** Validated: "notes + self-check
succeeds" — the thesis's single untested claim (F39/LAYERS.md) — at POC tier:
the semantic ask ("strengthen assertions") became clearable mechanical walls,
and the wheel converted them exactly as F38 predicted for that genre. NOT
validated: reaching the 45 bar (0/3; whether iterated check-loops close the
remaining 5–17.5 points is the real build's battery question); any clipipe-path
claim (this ran on the API; the clipipe track is BA-16); and n=3 supports no
rate estimate — the claim is existence and direction, not a percentage.

**Cost note:** $1.39–2.03/row at capRuns=4 — the $8/row cap never came close to
binding (16g margin held); the whole premise read cost $5.24.

**Lesson.** The program's costliest question ("why doesn't feedback convert?")
resolved into genre, twice: F38 showed mechanical gaps convert and semantic ones
don't; F39 showed delivery isn't the gap; F46 shows a cheap operator-signed
in-run check TRANSLATES the semantic ask into the mechanical genre — and the
same worker that stalled 4/4 (F39) then went 3/3. Structure, not memory and not
more state, was the missing piece — measured at $5.24 after $30+ of instruments
that had to be built and broken to make this read possible.

## F47 — Layer 2 rung ACCEPTED: the real plan flow converts 3/3 and clears the 45 bar 3/3

**Setup (prereg 2026-07-22a, frozen before any number; spec hash
`af338c9b…`).** The rung's exit gate: job #4 (TESTGEN) through the REAL plan
flow — `runJob → runPlan`: scout → the Planner drafts a plan-v1 DAG → the
validator gates it → the per-step Loop+Gate executor runs it (the operator-signed
`clean-run` check referenced as a step exit) → the outer grader close + its fix
loop. This is NOT the F46 POC, which HARDWIRED the winning composition; here the
Planner must author it. Same surface as F39/F46 (`anthropic-api`, claude-sonnet-5,
byte-identical goal body, 15% seed, frozen grader, 45 bar). hamr-authorized
$8/row, n=3, draft-and-freeze-then-sign-off.

**Result: 3/3 valid acting rows L2-CONVERT, all three green ABOVE the 45 bar
(67.5% · 55% · 55%), $27.36 of $30 across three runs.** Primary read (≥2/3
convert) MET; the secondary "path closes green end-to-end" milestone (steps[]
sunset, design record §110) ALSO met — every acting row hit the bar, surpassing
the POC (which never reached 45). Frozen axis split honored: the 45-bar greens
were RECORDED as secondary, not the acceptance gate; acceptance is the conversion
read alone.

**The three build-specific things the POC could not test, all positive:**
(1) **The Planner composed `tree-changed ∧ check-passes(clean-run)` itself,
3/3** — it is told the check NAMES and the pairing rule, never the command, and
authored the winning exit every time. (2) The flow's per-step decomposition
worked: 5–6 steps, one replan on two rows, 131–222 rounds. (3) Notably NONE of
the three greens needed the outer grader's fix loop — all were `satisfied` on the
first outer grading, so the STEP check-loop alone drove 55–67.5%. Aim stayed
excellent (16–18/18 survivor functions targeted). All writes fenced to
`tests/testgen/**`; source at the frozen SHA on every row; secrets clean
throughout; the grader's D1 + pristine-source guards gate exploitation, and
22–27 of 40 mutants killed on pristine source is real behavior-assertion by
construction (a vacuous suite kills ~0).

**What this does NOT claim.** n=3 supports existence + direction, never a rate
estimate. And the delta vs the POC's 0/45 is NOT attributed: the real flow gives
the worker far more total rounds (131–222 vs the POC's 40–72) AND per-step
decomposition — a rounds-vs-structure confound left explicitly unminted. The
acceptance question ("does the built flow reproduce conversion and reach the
bar") is answered yes; WHY it beats the single-loop POC is a separate,
unresolved recorded observation.

**Provider instability, and two process notes.** The battery ran across an
Overloaded window: 7 provider-red transport casualties (never evidence) against
4 valid rows, requiring a continuation to reach n=3. (a) The FIRST run fired
WITHOUT the frozen pre-fire health probe (operator go taken as sufficient) — 4
casualties, ~$6.69, the cost of skipping it; owned. (b) The single-message health
probe is a WEAK instrument for sustained-load instability: it read 2/2 200s while
subsequent multi-round runs still caught mid-flight transport failures — a cheap
liveness check is not a sustained-throughput check. The spend-governability guard
(F45) worked: an unpriced casualty (`spendComplete:false`) correctly STOPPED a
run rather than passing as evidence.

**Layer R riding item:** no row recorded `root-injected` (converts don't
fixate — consistent with F41, fixation extinct on healthy jobs); the ON/OFF
default-flip read did not trigger, `layerRoot` stays OFF, decision unchanged.

**Lesson.** Layer 2 is accepted on its own terms: the built machinery — Planner
authoring the plan and the check composition, bounded per-step check-loops — did
what the hardwired POC only proved was possible, and then cleared the bar the POC
never reached. The genre chain closes end to end: F38 (mechanical converts) →
F39 (delivery/state is not the gap) → F46 (an in-run check TRANSLATES semantic →
mechanical, hardwired) → F47 (the emergent flow does it itself, and reaches the
bar). Structure was the missing piece, and the agent can author the structure
under an inexpressible arbiter.

## F48 — clipipe cross-surface verdict: the native subscription surface is capable at the step but does not finish the job; only the API is guaranteed

**The question.** F47 accepted Layer 2 on the `anthropic-api` surface (3/3 convert,
3/3 at the 45 bar). Does the same built machinery reproduce on the
`clipipe-subscription` surface (BA-16 native MCP: the `claude` CLI drives the turn
cycle, notional dollars, flat subscription instead of per-token billing)? Same job
#4 (TESTGEN), same frozen seed (15% baseline), same operator-signed check, same
grader, same 45 bar. Notional dollars NEVER pool with API rows (F42/job-v1
doctrine); F47's API numbers are a cross-surface REFERENCE, not a baseline on this
surface.

**The enabler (measured).** The native worker could not write at all (0/158 reads,
0 writes) because the `claude` CLI TRUNCATES a large tool result (~40–50KB / ~line
550, measured) before the model sees it, spills the remainder to a
`~/.claude/.../tool-results/` file the fence denies, AND wraps it in a "read this in
chunks" notice the model correctly distrusts as prompt injection — so a whole-file
`shell_read` of the 2,455-line orchestrator blinded it. Fix (`planrun.js`,
`NATIVE_READ_CAP=24KB` + a trusted truncation notice steering to `ctx_get` ranged
retrieval + a native-only strategy line; API path untouched, `bare-agent` 0.33.1
for the native ranged read, BA-17). Effect: **0 → 7 writes**, 137 bounded reads, no
stall. My earlier "it's behavioral / it can't write" was FALSIFIED — the blocker
was read-blinding, mechanical.

**The two acting rows (0/2 graded).**

| | API (F47) — guaranteed | clipipe row A ($8) | clipipe row B ($28) |
|---|---|---|---|
| outcome | 3/3 CONVERT | cap-halt | step-red escalate |
| grade | 67.5 / 55 / 55 (all ≥45) | null | null |
| notional $ | $4.73 / $6.46 / $6.48 | $8.61 (overshot $8) | **$7.12 of $28** |
| $/LLM-call | ~$0.029 | ~$0.074 (~2.5×) | ~2.5× |
| wall-clock | 34–41 min | ~57 min | escalated early |
| writes | 11–15 acted | 7 (3 files, 1 step GREEN) | 6 (1 file) |
| why not graded | — | budget bound mid-plan | **non-change stall, budget to spare** |

Row A (`mrxd0c4l`) wrote 7 real tests, drove one step to `satisfied` (green), and
its check-loop iterated 4× on genuine MECHANICAL gaps (forbidden pattern
`environ-enumeration` → `subprocess` → `clean-red` ×2), the worker revising each
time — then cap-halted before the outer grade. Row B (`mrxkj6ik`, the funded shot)
read the seed tests fine (conftest 9×, `test_execute_behavior` 11×,
`test_orchestrator_helpers` 8×) and aimed well (11/18 survivor functions recalled),
but produced a NON-CHANGED suite: plan attempt 1 = 4 iterations `unchanged-red`
(byte-identical to the seed); after replan, attempt 2 = 4 iterations `0 files
changed — identical re-write is not a change`; 4/4 attempts each, close still red →
escalate → job `step-red` at **$7.12 of $28**. Casualties across the campaign were
transport flakes (`provider-red`, $2.6 / $0.43) and a `pricing-red` — with NO
resume, a multi-hour row can be lost near the end.

**What the funded shot proved (the decisive result).** The budget hypothesis is
REFUTED. Raising the per-row cap 8 → $28 (3.5× the API's ~$6 rows) spent only $7
and did NOT convert — it escalated on BEHAVIOR, not money. More budget is not the
blocker. The read-cap is exonerated (it read everything and aimed correctly). The
$28 failure is the **F39 semantic-stall reproduced on native**: the worker converts
MECHANICAL gaps (row A's four distinct forbidden-pattern gaps) but stalls on the
SEMANTIC "make it meaningfully different / it's unchanged" gap — the same ceiling
frontier Claude hits on the API (F38/F39). Native is NOT behaviorally worse and NOT
a plumbing bug — it delivers feedback correctly (row A's differentiated iteration
proves it); it is the same worker with the same semantic limit, plus a cost/time/
reliability tax. `layerRoot` unchanged (converts don't fixate; no `root-injected`).

**The verdict: only the API is guaranteed.** Across every native row, 0 reached a
grade vs the API's 3/3. clipipe is capable at the STEP level (row A: 7 writes, a
green step) but does not reliably carry a long JOB across the line, and the one
lever — budget — is spent and refuted. Its cost is NOTIONAL (subscription-
equivalent under the "cost is cost" ruling); the ACTUAL billed cost is the flat
subscription, $0 marginal — that is its ONLY advantage, and it is bought with a
permanent tax: ~2.5–3× notional effort, always slower (~23s/turn subprocess, never
faster), no resume on transport flakes, and the inherited F39 semantic ceiling with
no offsetting gain. clipipe is IN only as a babysat, $0-marginal-billing fallback
for jobs one is willing to re-run — never an API peer on result, cost, or time.
(Caveat: n=2 native acting rows, two different non-converting modes; the OUT-as-peer
call holds because no native row has ever graded and budget is refuted, but it is
n=2, not a rate.)

**Local LLMs — not this surface, and not a surface at all yet.** clipipe is the
`claude` CLI = Claude models via subscription; it does NOT run local models. Local
LLMs are DEFERRED by decision (PRD: "no local-LLM work until the API path earns
it") — no local surface is built or measured, so no claim is made. The reasoned
expectation, flagged UNMEASURED: a local model would face the same F39 semantic-
conversion ceiling that even frontier Claude stalls on (§F38/F39), likely worse,
plus tool-call-fidelity risk — a research bet, not a drop-in. Today the guarantee
lives on the API alone.

**Lesson.** "Cost and capability are separate axes," applied to SURFACES: a cheaper
transport buys $0 marginal billing and nothing else — not speed, not reliability,
not completion, and it inherits the frontier model's semantic ceiling. The funded
$28 shot was the right instrument: it converted the open "cap-halt → fund more"
hypothesis into a refutation (spent $7, escalated on behavior), which no cheaper run
could have settled. The API is the only guaranteed surface; clipipe is a taxed
Claude-only fallback; local LLMs are an unbuilt, unmeasured future bet.

## F49 — RESOLVED (2026-07-23): the agent-authored `artifact-written` regex runs unbounded in the exit evaluator

**The gap (security scan, v0.5.0 pre-release).** `src/exits.js` evaluates an
`artifact-written` exit's optional `pattern` with `new RegExp(e.pattern, 'm').test(body)`
against the worker-written file. The pattern is AGENT-authored (it rides the plan, not
the signed spec), and `evalExits` has no wall-clock bound — so a catastrophic-backtracking
pattern (e.g. `(a+)+$`) against a large body could hang the evaluator. The plan validator
(`plan.js`) only COMPILES the pattern; compilation does not detect ReDoS.

**Severity: LOW, and NOT an arbiter compromise.** The "attacker" is the model authoring a
pathological pattern in its OWN plan; the blast radius is the operator's own run hanging
(self-DoS). It cannot escape the write fence, forge a green, widen a budget, or leak a
secret — every arbiter-integrity threat (secrets, fence, close, budget, argv injection,
path traversal) scanned CLEAN. This is a robustness gap (unbounded CPU on a semi-trusted
author's input), filed as the honest "bound every reachable path" invariant applied to
CPU, not a privilege/exposure vuln. Operator-authored regex (`judged.pattern`, `gapKeep`,
check bodies) is out of scope — the operator is trusted and those are signed.

**Fix shapes weighed (three, at v0.5.0):** (a) bound the tested input size, (b) run the
match under a timeout (a JS worker/subprocess), or (c) reject nested-quantifier patterns at
validation. Two were disqualified on evidence: (a) is THEATER for classic exponential ReDoS
— the blowup needs only tens of characters (measured: `(a+)+$` did NOT finish on a **33-char**
body in 120s), so a length cap does nothing; (b) needs `worker_threads` or an external RE2
engine — disproportionate weight (and a new native dep) for a LOW self-DoS. That leaves (c),
which is the doctrine-clean place anyway: a mechanical reject at the validation gate, before
any tokens burn, that the replan can rewrite.

**Fix SHIPPED (2026-07-23), option (c):** `plan.js` now runs `hasNestedQuantifier(pattern)`
after the compile check and reds an `invalid-value:…pattern` when a group repeating unboundedly
(`*`, `+`, `{n,}`) is itself wrapped in an unbounded quantifier (`(a+)+`, `(\d*)*`,
`(x+){1,}`) — the dominant exponential class. It is a vanilla state-machine scan (no dep):
skips escaped atoms and character classes (so `\(a+\)+` and `[a+]+` are safe), treats bounded
outer repeats (`(a+)?`, `(a+){2}`, `(a+){1,3}`) as safe (polynomial, self-authored body), and
is honest about its bound — exotic overlapping-alternation blowup is out of scope BY DECISION
(self-DoS only, no arbiter compromise). TDD: a 17-bad / 17-good detector battery + a validator
red-case + a detail-names-the-footgun test, plus the empirical 33-char hang above
as the "the test can fail" proof. Full suite green.

**Named over-rejection (review 2026-07-23).** The shape-only scan also has a false-POSITIVE
class, now documented symmetrically with the false-negative one: anchor/delimiter-disambiguated
repeated-record patterns (`(?:^- .+$\n?)+`, `(?:CHANGELOG:.+\n)+`) run LINEARLY in a real engine
(review measured 100k reps → 6ms) but are flagged by the nested-quantifier SHAPE. This is the
FAIL-SAFE direction — the reject never ADMITS an exponential pattern — and the cost is a single
mechanical redraft (the drafter drops the outer `+`). Detecting "safe because anchored" needs the
real engine we declined, and a wrong guess would admit an exponential pattern, so the shape reject
stands. Three `REDOS_OVERREJECTED` regression tests lock these as accepted limitations — they must
stay flagged, because a future "smarter" detector turning them into false NEGATIVES is the
dangerous direction.

**Review-caught FALSE NEGATIVE, closed monotonically (2026-07-24, `/code-review medium branch`).**
The first (flat-only) scan claimed the redundant-wrapper class was covered, but it was NOT: a
group repeating unboundedly is the SAME exponential class whether the outer quantifier sits
directly on it (`(a+)+`) or one level of wrapping away (`((a+))+`, `(?:(a+))*`, `(((a+)))+`,
`((\w+))*`), and the shape scan only propagated the inner repeat when the group was DIRECTLY
re-quantified — so the wrapped forms slipped through and validated. Each was MEASURED to hang
`RegExp.test` >8s on ~29 chars (the `((\d*))*` reading needed a digit body — a letter body and a
dropped backslash made it read "fast", a harness confound caught before believing it). Fix: on a
group close, propagate the inner-repeat flag up through the enclosing group when the group's own
body already repeats (not only when it is directly re-quantified). The change is MONOTONIC — it
only ever SETS `quant=true`, so it can only ever ADD rejections: it widens over-rejection (the
fail-safe direction) and provably CANNOT introduce a new false negative (the dangerous one). All
17 `REDOS_GOOD` and 3 `REDOS_OVERREJECTED` cases stay unchanged; 5 wrapper cases added to
`REDOS_BAD`. This is distinct from the "never sharpen the detector" rule above: that rule bars
chasing false POSITIVES (which risks false negatives); closing a false NEGATIVE by adding
rejections is the same fail-safe direction the rule protects.

**Lesson.** A security scan's value is the coverage table, not just the hits: the one
finding here is a LOW self-DoS, and naming it against a CLEAN arbiter-integrity sweep is
what makes "clean" auditable rather than asserted. And the fix-shape choice was itself an
evidence call — two of the three candidates died to a 2-line measurement (input-bounding is
theater; a 33-char body hangs), which is cheaper than shipping the wrong remedy.

## F50 — RESOLVED (2026-07-23): Layer R was silently unwired on the accepted plan-v1 flow

**The gap.** Layer R (`layerRoot`) was wired only into the LEGACY `steps[]` path
(`interpret.js` → `createRoot`, on staged sunset). The ACCEPTED plan-v1 flow that shipped
v0.5.0 (`runPlan`/`planrun.js`) never created a root — `runJob` accepted `layerRoot` and
silently IGNORED it for plan-shape jobs. Two consequences, both real: a Layer 2 job could
NEVER emit `root-injected`, so the LAYERS.md ⚠ pre-registered ON-vs-OFF default-flip read was
impossible to satisfy on the go-forward surface; and `layerRoot: true` on a plan job was a
silent no-op — an advertised capability that did not fire. The blind-instrument class in its
plainest form: the ratchet lived only on the path that is being retired.

**Why it mattered now.** The legacy `steps[]` path is a sunset candidate but NOT yet
retirable — plan-v1 admits only the `green` verdict, so `hitl` (the draft-PR flow) and
`soft-green` still run ONLY on the legacy path (the later non-code-jobs goal). So the ratchet
was stranded on the exact path scheduled to disappear.

**Fix (2026-07-23).** Wired Layer R into the plan flow, scoped PER STEP (each micro-wheel is
the Layer-1 atom). The tee (stage/settle/discard + `onToolResult` outcome probe) is mirrored
from `interpret.js` into `mkWorker`; `executeStep` creates one root per step and calls
`observe` + injects its note in the middle. Two design calls specific to the plan flow:

- **The red-set is the exit evaluator's OWN gap** (`gapKeep: '\S'` — every non-blank line),
  not a reused check gapKeep. A check's `^`-anchored `gapKeep` (`^FAILED`) does not match once
  the exit wrapper prefixes it (`check "x" red: FAILED …`), which would silently degrade the
  detector to the dangerous writes-only mode. "The exit evaluator's complaint is byte-identical"
  is the honest, format-independent red-set for a step.
- **The tee is REQUIRED here, not just for the verbatim stage.** A plan step rewrites its ONE
  `target` every attempt; the cumulative gate audit dedups by path, so a same-path rewrite adds
  nothing to the write-set and the detector would see an empty delta. The tee is what makes the
  rewrite visible — so without it the summary stage never fires either (traced, then tested).

**The close-fix loop is wired too (review 2026-07-23).** The first cut wired only the EXECUTE
micro-wheels; the QA pass caught that `runPlan`'s outer close-fix loop (a full ralph loop judged
by the REAL close after all steps green) still ran root-less — the SAME silent-no-op this finding
exists to kill, and arguably the likeliest place fixation manifests (the fix worker holds the
full menu and is judged by a command, not a form-only exit). Now wired with its red-set = the
CLOSE's own `gapKeep` (the gap here is the raw close output, unwrapped, so the `^`-anchored
pattern matches — unlike the exec steps' exit-eval gap, which uses `\S`). Its event carries
`phase: 'fix'`; a dedicated test drives a fix-loop fixation end-to-end.

**Native excluded, by construction.** The clipipe native worker exposes no `onToolResult`
seam, so the tee cannot settle and same-path rewrites are blind — `root` is `null` for native
(documented, not silent; F48 already ruled native OUT-as-peer, so this is the fallback surface,
not the experiment surface).

**Validation.** 5 TDD tests through the REAL plan flow (real gate, real spawned close/check,
real audit + tee): summary fires on an unmoved-red-set same-file rewrite and is injected into
the next attempt; a third consecutive fixation escalates to VERBATIM surfacing the worker's own
teed bytes back; OFF by default emits nothing; native stays inert. 555/555, typecheck + build
clean.

**Status of the default-flip.** Still deferred, but now POSSIBLE: the day a real plan-flow job
emits `root-injected`, run the pre-registered ON-vs-OFF acceptance read (LAYERS.md ⚠). F41
stands — fixation is extinct on every current job — so the default remains `false` until that
evidence lands.

**Lesson.** "Wired into the shipped path" is a separate claim from "the code exists," and the
gap hid because the parameter threaded cleanly to a DIFFERENT (legacy) path. When a capability
has two dispatch paths, check which one the ACCEPTED surface actually takes — a silently-ignored
optional param is the blind-instrument class wearing an API's clothes.

---

## F51 — the N3 lineage pre-probe: readable lineage moves plan SHAPE, not aim — and the probe answered a NARROWER question than it was frozen to ask

**Status: minted 2026-07-24 (Layer 3 opening gate). Disposition: mechanical-first
PROVISIONAL; the readable arm is DEMOTED, not dead — its real niche is untested.**

**Setup (prereg `docs/02-experiments/N3-PREPROBE-PREREG.md`, frozen 44a5062 BEFORE any
number).** The Layer 3 opening gate: before building any inheritance machinery, does
prior-run lineage in the drafter's hands change the plan it writes — and change it the
right way (a general lesson, not a copied answer)? Instrument = the REAL plan drafter
(`AnthropicProvider` claude-sonnet-5, `PERSONA_TOOLS` system, the real `planPrompt()`,
`loop.run` with `cacheMessages`/`maxTokens:32000`), lineage appended the way `failure`/`reds`
already append. No loop fires; the drafted plan-v1 JSON is the only graded artifact. Source
lineage = the greened run `mrvwjrop` (green, $4.73, 6 steps, no replan) on the orchestrator;
non-identical target = `phases/assess.py` (1,148 lines, disjoint function-set).
Predicted (F39/CL-BENCH): NO lift.

**Result — Stage 1, 39 drafts, $1.31 of the $2 cap, 0 provider errors, 0 truncations.**

| arm | n(ok) | winShape /5 | hasClean | allPaired | aim≥3 | uses `edit` | memoHits |
|---|---|---|---|---|---|---|---|
| A0 OFF-target | 7 | 4.14 | 1.00 | 0.86 | 1.00 | 0.29 | 0.00 |
| A1 OFF-source | 12 | 3.00 | 1.00 | 0.75 | 0.00* | 0.25 | 0.00 |
| P ON-identical (pos. control) | 8 | 4.00 | 1.00 | 1.00 | 0.00* | 1.00 | 0.00 |
| Tfull ON-non-identical | 8 | 4.88 | 1.00 | 1.00 | 1.00 | 0.88 | 0.00 |

*\*Instrument caveat (documented, not a result): `aim` string-matches `assess.py`'s function
inventory, so it reads 0.00 BY CONSTRUCTION for the source-spec arms (A1/P), which plan over
the orchestrator. It cancels in the P-vs-A1 difference (both 0) and is interpretable only on
the target-spec arms (A0/Tfull). Never read "P had zero aim" as a finding.*

**The positive control PASSED — so the read is valid, not a blind zero.** P moved vs A1
(winShape 3.00 → 4.00). The drafter demonstrably READS lineage and reshapes its plan; the
§8 readability gate (which would have WITHDRAWN a no-lift reading as unreadable) is
satisfied.

**But the movement is surface mimicry, not capability.** Subtract the single
lineage-named structural feature (`edit`-to-sharpen, the source plan's final step) and the
arms collapse together: **A0 3.86 vs Tfull 4.00** — a 0.14/5 residual carried entirely by
the pairing rate (0.86 → 1.00). The same holds for the positive control: P vs A1 minus-edit
is 3.00 vs 2.75. What lineage transfers is the prior plan's STEP SHAPE (five write-steps
grouped by function-cluster + one closing `edit` step), not any improvement in what the plan
aims at. `memoHits 0/8` — Tfull never leaked orchestrator function names, so the copying is
structural, not nominal; general at the name level, mimicry at the shape level.

**Why there was no room to help — the SCOPE LIMITATION, and it is the finding's most
important half.** A0 plans at near-ceiling COLD: aim 1.00 (it names ≥3 real survivor
functions every single valid draft), clean-run present 1.00, pairing 0.86. Aim is FREE here
because job #4's spec HANDS the planner both halves of the problem: the survivor scoreboard
(WHAT to target) and an obvious strategy (assert exact current behavior — HOW). Lineage
cannot lift an axis that is already maxed by the spec. **The probe therefore answered
"does lineage help when the operator already knows the strategy?" (answer: no, only
cosmetically) — NOT the question it was frozen to ask.** The untested case is the one
bareloop exists for ("Automate this job — I don't know the best workflow"): the operator
specifies the target (arbiter territory, always operator-owned) but NOT the strategy, and
the strategy is non-obvious. There, a prior run that DISCOVERED the right strategy carries
knowledge no spec contains. This probe says nothing about that case. (Credit: hamr caught
the gap on the readout — "if operator doesn't know, this is where it would help.")

**What it concludes.** (1) On jobs whose spec already carries the strategy — which every
current bareloop benchmark is, by construction — readable lineage adds only shape mimicry,
and mechanical plan-reuse delivers that same shape deterministically, for $0, with no model
reading anything. Mechanical is the right PRIMARY arm. (2) The readable arm is DEMOTED to a
secondary arm in the outcome-judged battery, NOT killed — the frozen §8 kill did not cleanly
fire (there IS movement), and its niche is untested.

**What it does NOT conclude.** It does not show notes are worthless; it does not test
hard-strategy jobs; and per §10 it cannot show that shape mimicry helps or hurts KILL-RATE —
plan quality is not outcome (F39's whole lesson: perfect aim, zero outcome change). Only an
outcome-judged battery settles that.

**Stage 2 SUPERSEDED (not silently dropped).** The frozen protocol triggers Stage 2
(payload localization: plan-only / one-line lesson / check-only) because Tfull showed
movement. It is retired unrun: localizing WHICH payload induces cosmetic shape-copying is
not worth $0.60 when shape-copying is not the axis that decides the rung. If the re-aimed
probe revives the readable arm, payload localization can be re-frozen then.

**Next instrument (the re-aim).** A hard-strategy probe: a job where COLD planning visibly
picks the wrong or weak strategy, plus a related prior run that discovered the right one. If
lineage cannot improve the PLAN even there, the readable arm dies cheaply and no machinery
is built. If it can, the outcome battery (three-arm ON+lineage / ON-mechanical / OFF, judged
on faults caught) is the only thing that can mint it.

**Lesson.** A probe can pass every one of its own frozen checks and still answer the wrong
question — because the FROZEN DESIGN chose a patient whose spec pre-solved the axis under
test. "Can the instrument show the negative?" was satisfied; "is there ROOM for the treated
variable to move?" was not asked, and it is a distinct pre-flight. Ceiling effects in the
CONTROL arm are the tell: when the OFF arm already scores near-max on the outcome-relevant
axis, no ON arm can demonstrate anything, and the honest move is to re-aim the probe rather
than report its narrow answer as the broad one.

---

## F52 — the re-aim screen (candidate A): you cannot manufacture a strategy gap by withholding strategy — the model supplies it

**Status: minted 2026-07-24. Decision: candidate A DEAD as a probe patient (by the frozen
rule); escalate to candidate B. Continues F51.**

**Why this ran.** F51's readable-lineage probe was unreadable on the axis that matters
because job #4's spec HANDS the planner the strategy, putting the control arm at ceiling.
hamr's insight on the readout named the untested case — the operator knows the target but
not the workflow. Candidate A tests the cheapest model of it: withhold the strategy from the
spec and see whether that creates room for notes to matter.

**Design (frozen 4d10af7 BEFORE any number; screen-only, ~$0.30).** One variable.
`strippedSpec` = the F51 target spec with the METHOD removed and nothing else changed.
Classification line: **what the GRADER MEASURES is kept** (goal, 15%/45 bar, the full
survivor scoreboard, fault types, fence rules, "existing tests must keep passing", the check
mechanism, patient facts) — **HOW TO SUCCEED is stripped** (the "a test detects one by
asserting the SPECIFIC current behavior: exact scores, tuple return values, threshold
boundaries, tier routing" clause; the entire testing-standards paragraph; the prescribed
read-then-sharpen-then-add sequence). Baseline = the already-paid `A0` rows (identical spec
WITH the strategy). Scout blob identical across arms.

**Result: `S0` n=8, 8/8 valid, 0 truncations, $0.26.**

| arm | n | strategyExplicit (≥2 markers) | mean markers | aim≥3 | winShape | uses `edit` | nSteps |
|---|---|---|---|---|---|---|---|
| A0 (strategy GIVEN) | 7 | **1.00** | 6.86 | 1.00 | 4.14 | 0.29 | 5.57 |
| S0 (strategy WITHHELD) | 8 | **1.00** | 5.63 | 1.00 | 3.88 | 0.00 | 4.63 |

**The model writes the withheld strategy back in, unprompted and nearly verbatim.** Read
directly from the S0 plans (not inferred from the metric): *"assert exact boolean/int return
values"*; *"Write precise, exact-value tests (not just range/type checks) … assert exact
scores"*; *"exact score integers and exact reasons lists plus boundary-straddling cases"*;
*"extract the exact logic, thresholds, and constants"*. This is the deleted clause,
reconstructed by the planner from the goal alone. strategyExplicit is 1.00 in BOTH arms.

**Verdict by the frozen rule: candidate A is DEAD as a probe patient.** S0 ≈ A0 on the
outcome-relevant axis, so stripping created NO room — **the ceiling is the MODEL's own
competence, not the spec's generosity.** F51's ceiling was therefore never an artifact of
how job #4 was written; it is a property of the job GENRE. Withholding information the model
already has cannot manufacture a gap for lineage to fill.

**The sharpened hypothesis this leaves (candidate B).** Two different mechanisms were being
conflated under "notes help when the operator doesn't know the workflow":
- **strategy MISSING from the spec** — tested here, DEAD: the model fills it in correctly.
- **the model's DEFAULT strategy is WRONG** — untested: notes would have to OVERRIDE a
  confident prior, not fill a void. This is the only remaining niche, and it is a
  categorically different ask.

Candidate B is therefore not "a harder version of A" but a different mechanism: a patient
whose OBVIOUS strategy structurally fails (e.g. faults reachable only through an integration
path, so per-function unit tests — the model's default — cannot kill them).

**Instrument artifact (logged, did not affect the decision).** The `weakStrategy` marker
read 0.43 on A0 vs 0.00 on S0 — a FALSE POSITIVE, not a result: A0's spec contains "smoke
asserts … are worthless", so its plans echo "smoke" while telling the worker to AVOID smoke
asserts, and the substring match cannot tell prohibition from prescription. The metric is
invalid for any spec that names its own anti-patterns. `strategyExplicit` (the primary,
pre-registered axis) is unaffected and carried the decision.

**What this does NOT conclude.** One job genre (pytest TESTGEN), one model (claude-sonnet-5).
A less capable model, or a domain with genuinely unusual method, could still have a real
strategy gap. It does not show notes are useless — it shows this particular route to
creating a niche for them is closed.

**Lesson.** "The operator doesn't know the workflow" is not automatically a gap the system
can exploit: if the MODEL knows the workflow, the operator's ignorance costs nothing and
memory has nothing to add. A memory system's niche requires knowledge that is absent from
BOTH the spec AND the weights — and the cheapest way to find out is to delete the knowledge
from the spec and watch whether the model puts it back. It did, in 8 of 8.

---

## F53 — the vague-ask screen: withholding the TARGET does not degrade workflow generation either — but the mechanism is exhaustive coverage, not discovery

**Status: minted 2026-07-25. Decision: no room on the target axis either; `Vfull` NOT run
(frozen gate). Continues F51/F52. Carries one NEW unregistered hypothesis (below).**

**Why this ran.** hamr's reframe sharpened the question: the operator gives ONE prompt, the
ask may or may not be clear, and the system must generate a workflow either way. F52 closed
the METHOD half. This closes the TARGET half — the realistic vague ask ("my tests are weak,
get detection above 45%") where the operator does not know WHICH parts are weak.

**Design (frozen 67aa3c3 before any number; ~$0.23).** One variable: `vagueSpec` =
`targetSpec` minus the survivor scoreboard and the "target the functions where planted
faults currently survive" pointer. The METHOD stays (F52 settled that axis; two levers at
once makes a delta unattributable). Bar, close, fence, fault-type and patient facts stay —
operator territory. Baseline = the already-paid `A0` rows. The scout still lists the module's
functions, because a read-only scout is what the real flow provides: the withheld knowledge
is which functions are WEAK, not which exist.

**Result: `V0` n=8, 5 valid, $0.23.**

| arm | n(ok) | discoversTargets | topSurvivorFocus | mean top-4 | adds discovery step | invalid |
|---|---|---|---|---|---|---|
| A0 (target GIVEN) | 7 | 1.00 | 1.00 | 4.00 | 0.71 | 1/8 |
| V0 (target WITHHELD) | 5 | 1.00 | 1.00 | 3.60 | **0.80** | **3/8** |

By the frozen rule this is **V0 ≈ A0 → no room; `Vfull` is not run.** Vagueness about the
target does not degrade the plan's aim: without the scoreboard the planner still names the
high-survivor functions, and it adds a read-only discovery step MORE often than the informed
arm (0.80 vs 0.71) — a sensible response to a vaguer ask.

**But the mechanism is COVERAGE, not discovery — and that bounds the claim.** Per-plan
function coverage: **A0 names all 15/15 target functions in every single plan** (15,15,15,
15,15,15,15); V0 names (14,6,13,14,14). The scoreboard was never buying *concentration on
the weak ones* — it was buying *completeness and consistency*. V0 succeeds by testing
essentially everything, which works only because `assess.py` exposes ~15 testable functions,
small enough to cover exhaustively inside an 8-step plan. **On a large surface, exhaustive
coverage is not available and the scoreboard would carry real information.** So the honest
scope is: target-vagueness is free ON A SMALL TARGET SURFACE — the same class of limitation
F51 hit, caught this time by auditing the mechanism instead of trusting the metric.

**Variance, not mean, is where vagueness costs.** V0's first-draft invalid rate is 3/8 vs
A0's 1/8, and its coverage carries an outlier (one plan at 6/15 vs A0's uniform 15/15). The
central tendency is unchanged; the spread widens. Not fatal in the real flow — the drafter
gets one redraft with the reds fed back — but a malformed draft is real spend.

**NEW, UNREGISTERED observation → hypothesis ONLY, not minted.** Across the whole probe
programme, first-draft schema validity splits with lineage: **0/16 invalid WITH lineage
(P, Tfull) vs 7/39 (18%) WITHOUT (A0, A1, S0, V0)** — reds almost all `missing-required` on
`steps[].exit`. This was NOT pre-registered (the frozen rubric graded only VALID plans, so
the instrument was structurally blind to it — the "check both reds and greens" lesson, again).
It is also CONFOUNDED by construction: the lineage payload contains a fully-formed valid plan
with exits, so the drafter may simply be copying valid structure. **It is therefore recorded
as a hypothesis to pre-register and test, never as a result.** If it survives its own frozen
test it matters: it would mean F51's "shape mimicry" is not worthless after all — mimicry
that buys first-draft VALIDITY saves a redraft, which is real money on the efficiency axis
(distinct from the capability axis, which stays flat).

**What this does NOT conclude.** One small module, one genre, one model. It does not show
vague asks are always free — it shows they are free when the target surface is small enough
to cover exhaustively.

**Lesson.** A metric can read "no degradation" while the underlying mechanism is completely
different from the one assumed: aim looked equal because BOTH arms covered everything, not
because the vague arm discovered anything. Audit the mechanism behind a null result before
banking it — and note that the frozen rubric, by grading only valid plans, could not see the
one axis where the arms actually differed.

---

## F54 — T4 failure-lineage: no lift on any readable axis; the frozen primary metric FAILED and is reported as unreadable

**Status: minted 2026-07-25. Decision: the readable-lineage arm is DEAD across every axis
this programme could construct. Completes F51/F52/F53. Carries one instrument self-defect
and one surviving hypothesis.**

**Why this ran.** F51–F53 killed every clarity axis, all of them GENERAL METHOD — which
lives in the weights, where memory loses to ICL. T4 targeted the one knowledge class absent
from BOTH weights AND repo: **what FAILED in a prior run** (an event, not a file; a scout
with `read`/`grep` can read `pytest.ini` and every source line but cannot read "attempt 1
was rejected because X"). If inheritance had a niche, it was here.

**Design (frozen 24d4f1e before any number; $0.49, 16 drafts, both arms complete at n=8).**
`Q0` (real-patient assess.py spec, verified repo state, no lineage) vs `Qfail` (identical +
the three VERBATIM prior-run rejections extracted from the archived green run's own
`close-verdict` gaps — gate-red forbidden pattern, clean-red imagined-behavior assertion,
identical-rewrite exit). Anti-fit-to-pass measures were built into the freeze: lineage
EXTRACTED not authored; the primary measure STRUCTURAL not prose (echoing a note is
tautological); the environ guard declared INVALID UP FRONT as spec-confounded; control
headroom measured at $0 first.

**Result.**

| axis | Q0 | Qfail | read |
|---|---|---|---|
| **PRIMARY** `readBeforeWrite` (frozen) | 0.71 | 0.25 | **UNREADABLE — see below** |
| G1 read-source-for-exact-behavior | 0.43 | 0.50 | flat |
| G3 tree-must-actually-change | 0.57 | 0.50 | flat |
| first-draft validity | 0.88 | 1.00 | lineage higher |
| mean steps | 4.6 | 3.6 | lineage compacts |

**The frozen primary FAILED as an instrument, and the failure is mine.** `readBeforeWrite`
required a SEPARATE read-only step ordered before the first write step. The `Qfail` plans
FOLD the reading into the write step itself (`tools: [read, grep, write]`, action "Inspect
assess.py to identify the exact numeric thresholds…") — functionally identical reading, one
step instead of two. The metric therefore scored a compaction as an absence, producing an
apparent −0.46. **The −0.46 is an artifact and is NOT reported as a result**; the primary
axis is declared unreadable, the same disposition F51's positive-control gate would have
forced. A post-hoc corrected version (reads source before asserting, folded OR separate) is
labelled exploratory and reads **1.00 vs 1.00** — the control was at CEILING on the actual
construct all along.

**Verdict on the readable axes: NO LIFT.** G1 flat, G3 flat, corrected primary at ceiling in
both arms. The behaviour the failure-lineage was supposed to teach — read the real source
before asserting — the cold planner already does 100% of the time. **Fourth consecutive
ceiling.** By the frozen rule (Qfail ≈ Q0), the readable arm is DEAD across every axis this
programme could construct.

**The pre-flight itself under-reported the ceiling — a lesson about the lesson.** F51's new
pre-flight ("is the CONTROL below ceiling?") was applied and PASSED (15/20, 14/20 ≈ 72%
headroom) — but it was computed with the crude PROSE proxy G1 on older probe data, while the
functional behaviour sits at 1.00. **A pre-flight must measure the control on the SAME metric
the treatment will be judged by, and that metric must capture the functional construct, not
a prose shadow of it.** Otherwise the pre-flight green-lights an experiment that was already
unreadable.

**What survives.** One signal, still a hypothesis, now observed twice: lineage improves
first-draft VALIDITY (F53: 0/16 vs 7/39; here: 1.00 vs 0.88) and COMPACTS plans (4.6 → 3.6
steps). Both are efficiency-axis, not capability-axis, and both remain confounded (the
payload contains a well-formed plan to imitate). Neither is minted; either would need its own
freeze, and the honest place to settle them is spend-to-green in the outcome battery, where
fewer redrafts and fewer steps are worth real money.

**What this does NOT conclude.** Plan-level only, one patient family, one model, n=8. It does
not show memory is useless in general — it shows that for THIS system, on every axis we could
construct, the planner already knows what the memory would have told it.

**Lesson.** Four screens, four ceilings, $2.29 total: the recurring blocker was never that
lineage fails to transmit — the positive control proved it transmits — but that there was
nothing left to transmit. And an instrument built to detect a behaviour must be validated
against the FORMS that behaviour actually takes: mine could not see a two-step pattern
compressed into one, and would have reported a strong negative that the data does not support.

---

## F55 — T10 plan-share: producing the plan is ~1–2% of a completed run and causes 0 of 15 terminations — inheritance cannot pay for itself on the planning surface

**Status: minted 2026-07-25. $0, archival. Applies the frozen rule of
`docs/02-experiments/N3-T10-PLAN-SHARE-PREREG.md`. Evidence toward a Layer 3 STOP —
bounded by one caveat that keeps the battery necessary.**

**Why this ran.** F51–F54 killed the readable-lineage arm on four axes. Layer 3's only
remaining arm is MECHANICAL plan reuse. Before building it: how much of a run IS the plan?
Inheritance of plans can only pay where plans are costly, variable, or a failure source.
Answerable at $0 from 115 archived spines.

**Instrument correction made mid-analysis (logged, blind-instrument class, 7th shipping).**
The first pass read plan share at 1.43% mean — but the phase buckets summed to only 21%.
Audit: **59.1% of archived spend carries NO phase label**, because legacy `steps[]` runs
(`interpret.js`) do not emit one and have no plan phase BY CONSTRUCTION. Including them
corrupted the denominator. Corrected by restricting to the plan-v1 flow (`plan-accepted` /
`plan-validate` present): **n=15 runs, buckets now sum to 100%.**

**Result (plan-v1 runs that reached execution, n=15, $51.18 metered).**

| phase | mean share |
|---|---|
| plan (draft + redraft) | 6.79% (median 3.74%, max 40.83%) |
| scout | 12.34% |
| execute + fix | **80.87%** |

**The mean is inflated by early deaths, and the audit shows it plainly.** Plan share is
mechanically higher when a run dies before execution accumulates: the 40.83% outlier is a
`pricing-red` run that spent $0.43 total across 1 step. Sorted by share, **the three GREEN
(completed) runs occupy the three LOWEST positions: 1.1%, 1.3%, 1.7%.** For runs that
actually finish the job — the population inheritance exists to improve — **planning is
~1–2% of spend.**

- **Q2 — plan as a failure source: 0 of 15.** Terminals were step-red 9, green 3, cap-halt 1,
  pricing-red 1, unknown 1. No run ever died of `plan-red`.
- **Q3 — first-draft validation: 1/23 failed (4%).** Drafting is already reliable in the
  real flow (this is the honest counterweight to F53/F54's validity hypothesis, which was
  measured on probe drafts, not shipped runs).

**Frozen-rule verdict, reported without rounding to the tidier story.** The rule set
"negligible" at <2% share AND <10% plan-caused terminations. On completed runs both fire
(1.1–1.7%; 0%). Across all 15 runs the mean (6.79%) sits in the middle band the rule said to
"report as-is" — so both numbers are reported, and the completed-run figure is the
decision-relevant one because it is the population the feature targets. **Mechanical plan
inheritance addresses ~1–2% of a successful run's cost and 0% of its failures. It therefore
cannot justify itself on planning cost or planning reliability — those surfaces are already
tiny.**

**The caveat that keeps the battery necessary — stated so this is not overclaimed.** This
measures the plan's PRODUCTION COST, never its LEVERAGE. Execution is 80.87% of spend, and a
plan is the thing that steers execution: a better plan could make that 81% cheaper or more
likely to green, which no archival share can see. "Cheap to produce" does not imply "low
impact". So F55 does not kill the mechanical arm — it removes the two easy justifications
(cost, reliability) and forces the arm to stand or fall on an OUTCOME lift alone, which is
exactly what the paired battery measures and what F51–F54 give no reason to expect.

**Limits.** n=15 plan-v1 runs, 3 green; one patient family; correlational by construction.

**Lesson.** Before building a feature, measure the SURFACE it acts on — it is often available
for $0 in data already on disk, and it can retire the comfortable justifications ("it'll be
cheaper", "it'll be more reliable") before a line is written. And a phase-share denominator
must be audited for populations that lack the phase entirely: 59% of the spend here belonged
to a code path that structurally cannot have a plan.

## F56 — the agreed write · select · compress · isolate palette died with config-v1 and was never re-expressed; the agent's whole authorship surface is six fields, and nothing in the system bounds TIME

**Status: minted 2026-07-26. $0, source-read + archival, from hamr's realignment challenge
after job #5's three void rows. Not an experiment — a structural audit of what the agent is
actually allowed to author, prompted by the question "read, grep, edit are not all
primitives; where are the rest?"**

**Why this ran.** Job #5 (TYPES, the second-genre e2e) produced three rows, zero valid,
$7.06, over runs that hung for up to 2h24m. hamr stopped it and asked whether the build had
deviated from the product: *an agent handed a problem, choosing from a library of primitives,
building its own bridge.* The honest answer required reading what the plan schema admits, not
recalling what the design intended.

**Finding 1 — the palette. The four-component vocabulary is LIVE upstream and absent here.**
`litectx` (installed, v0.30.x) exports today:

```
PRIMITIVES        ["Write","Select","Compress","Isolate"]
VERBS_BY_PRIMITIVE Write:   remember · forget · write-gate
                   Select:  recall · impact
                   Compress: assemble · compress · summaryWindow
                   Isolate: stash · peek · evict · scope
COMPRESS_LEVELS   verbatim · signature · drop
```

Twelve verbs. adaptlearn's F1 already ruled **"consume, don't build — no invention needed"**,
and PRD §"Primitive menu presentation" binds the catalog (Select→recall, Compress→compress,
Isolate→stash, Write→remember). **plan-v1 exposes two of the twelve** (`recall`, and `get`,
which is a litectx method rather than a catalog verb). Zero Compress verbs, zero Isolate
verbs, zero Write verbs reach the agent.

**How it was lost — and why the loss was invisible.** Those verbs lived in config-v1 as
shell-invoked CONFIG HOOKS, and F22 killed config-v1 on the finding that of 7 knobs only
`loop.shape` was ever live: `stash` was write-only, `remember` fired on-green-only on a
never-green run, `recall` searched an empty store. **That finding was correct and its reading
was wrong.** The knobs were inert *because the loop was broken and the store was empty* —
F20 (the close had never run), F21 (no channel between attempts), an unpopulated index. The
inference drawn was "the agent does not author context config"; the evidence only supported
"we could not attribute context config on a loop that never greened." plan-v1 then rebuilt
the vocabulary from scratch as a step list and never re-litigated the palette. Greens now
exist (F47) and the store is populated — the condition that made F22's measurement inert is
gone, and nothing re-opened the question. **Blind-instrument class, 8th shipping, in its
rarest form: the instrument was not misreading a variable, it had silently stopped offering
one.**

**Finding 2 — the authorship surface is six fields.** `src/plan.js:43` —
`STEP_FIELDS = ['id','action','tools','rounds','target','exit']`. That is the complete
vocabulary the agent may author, enforced by `unknown-field` at every depth. No model tier,
no effort, no attempt cap, no retrieval policy, no compression level, no scope narrowing, no
rationale. `tools` draws from `TOOL_MENU` (`src/job.js:49`) = 6 worker verbs, `run` locked
forever. So "the agent authors its workflow" currently means: it names steps, orders them,
picks a subset of six verbs, sets a round bound, names a target, composes exits.

**Finding 3 — nothing in the system bounds TIME.** Grepped: no wall-clock cap exists in the
library. Bounds are money (`budgetUsd`), rounds per step (`maxStepRounds`, default 40),
attempts per step (`capRuns`, default 3), and `closeTimeoutMs` — which bounds a single close,
not a run. Job #5's own agent-authored plan therefore authorised, inside every rule,
**7 steps × 3 attempts × 30 rounds ≈ 630 worker turns**, with a 40–56s signed check between
iterations. Multi-hour wall-clock is not a malfunction of that design; it is what the design
permits. The 2h24m hang was an upstream transport bug (BA-18) stacked on top of a shape that
had no time answer of its own.

**Finding 4 — a replan has never fired, in the entire programme.** **[CORRECTED 2026-07-26 by F63 — THIS CLAIM IS FALSE. Eight replans had already fired, in batteries that predate this finding by four days. The two job #5 rows cited below were generalised to the programme without replaying the archive. The rest of F56 stands; do not cite Finding 4.]** `planrun.js` triggers a
replan only on step exhaustion, and an instrument stop is explicitly not exhaustion
(`planrun.js:231` and the `lastEscalation` category read). Both job #5 rows recorded
`replanned:false` after dying provider-red — mechanically correct, and the consequence is
that **"the agent adapts its workflow as it goes" has zero observations across every battery
this repo has run.** Layer 2's acceptance gate (F47) never required one. "Authors a workflow"
is evidenced by contrast (same spec, same model, two materially different plans — job #5
stash). "Adapts it" is not evidenced at all.

**What this does to prior claims.** Nothing is withdrawn on evidence, but two labels are
narrowed:
- **"Layer 2 ACCEPTED" (F47) means: converts on ONE genre, with the adaptation half untested.**
  v1.26 already flagged the genre bound; this adds the adaptation bound.
- **"The planner is at ceiling" (F51–F53) was measured on a six-field surface.** A ceiling
  found inside a six-field vocabulary says nothing about a twelve-verb one. The ceiling claim
  is now bounded by palette as well as by genre.

**Lesson.** A capability that is *never offered* leaves no failure trace — it looks exactly
like a capability that was offered and not needed. Every battery since F22 measured an agent
choosing from six verbs while the design record said twelve, and no instrument could have
caught it, because the missing verbs generate no events. When a kill decision is made on
inertness, record the CONDITIONS that made it inert (broken loop, empty store) and re-open it
when they lift — an inert-under-conditions finding is not a permanent verdict on the feature.

## F57 — T1: a per-round rate IS quotable (~$0.019 and ~5.4s per execute round), but a STATIC one would be wrong — the check axis swings 3.8s to 561s, so the meter has to run live

**Status: minted 2026-07-26. $0, archival. Applies the frozen rule of
`docs/02-experiments/MATERIALS-PREREG.md` (T1). Gates the "inform" half of the
materials/metering design (PRD v1.27).**

**Why this ran.** hamr's materials framing hands the agent time and money to allocate up
front, with ralph metering consumption and informing it. But the agent can count rounds and
cannot feel a dollar or a minute — so the loop must convert. T1 asks whether a conversion rate
exists at all, from data already on disk.

**Population.** 264 archived spine files → 145 after excluding native/clipipe (11) →
**18 plan-v1 runs, 1213 worker rounds**. Legacy `steps[]` runs are excluded by the frozen
confound list, and the denominator audit backs that: **all 2567 unlabeled rounds are legacy
(`interpret.js` emits no phase); plan-flow has ZERO unlabeled.** F55's finding replicates
exactly, and the "audit the denominator for populations lacking the phase" rule fired again.

**Result (plan-v1, priced rounds only).**

| phase | n | median $/round | IQR width ÷ median | n | median s/round | IQR width ÷ median |
|---|---|---|---|---|---|---|
| scout | 102 | 0.0129 | 1.25 | 89 | 6.0 | 0.55 |
| plan | 22 | 0.0399 | 0.31 | 13 | 44.8 | 0.22 |
| **step (execute)** | **1058** | **0.0189** | **1.61** | **965** | **5.4** | **1.24** |

**Frozen rule verdict: QUOTABLE, comfortably.** The rule declared the rate unquotable if the
execute-phase IQR spanned more than 10× its median. It spans **1.61×** on cost and **1.24×**
on seconds — passing on the literal reading, and on the alternative p75/p25 reading (4.8× and
2.9×) as well. Both are reported so the pass cannot be attributed to a convenient statistic.

**The conversion the agent would be told:** at the execute phase, **~53 rounds per $1** and
**~11 rounds per minute** of model time.

**Zero unpriced rounds in 1213.** The F6 honest-null discipline is holding end to end — no
`?? 0` laundering anywhere in the metered population.

**The finding that changes the design: a static rate would be wrong, because the CHECK axis is
not the model axis and does not behave like it.** Round-to-round model time is tight (5.4s,
IQR 1.24×). The gap that spans a close or check is not:

| job | n | median | max |
|---|---|---|---|
| #5 TYPES | 12 | 3.8s | 48.6s |
| #4 TESTGEN | 82 | 8.4s | **561.6s** |

A 9.4-minute check sits in the same distribution as a 4-second one. So handing the planner a
constant up front cannot work — **the loop must meter the live job and update the rate
in-flight**, which is precisely the "ralph counts that and informs" half of hamr's framing
rather than the simpler "hand it a bill of materials" half. The mechanism is validated over
its cheaper alternative, for $0.

**Instrument correction to an ask already filed (BA-18).** The ask states job #5's signed
checks "idle the connection 40–56s between **every** LLM turn." The archive says otherwise:
median 3.8s, with 48.6s as the **maximum**. The aggravator is real but it is the TAIL, not the
typical case — and job #4's 561s max is the stronger example. BA-18's premise survives; its
wording overstated frequency and is corrected in place before the ask goes upstream.

**And the hang is structurally invisible to the spine — confirmed, not assumed.** The frozen
confound list expected >5-minute within-attempt gaps from job #5's BA-18 hangs. **There are
zero.** A hung `generate()` never returns, so it never emits a `worker-round` row: the 38-min
and 2h24m stalls leave no trace on the axis that would show them. This is the empirical
version of the claim made earlier from reasoning alone — every detector we own reads events,
and this failure produces none. **A wall-clock deadline (T) is not a cost feature; it is the
only instrument that can fire on the ABSENCE of events.**

**Lesson.** Measuring the surface before designing on it paid a third time (F55, F45, now
F57): it validated the expensive half of the mechanism, killed the cheap-constant version,
corrected a filed upstream ask, and confirmed a blind spot empirically — all before a design
record was written.

## F58 — U0(a): job #5's close decomposes into 7 borrowable stages, not the 3 the operator hand-wrote — derivation gives the agent MORE rulers than authoring did

**Status: minted 2026-07-26. $0, code read. Applies the frozen rule of
`docs/02-experiments/MATERIALS-PREREG.md` (U0 part a). U0(b) — the one-sentence goal probe —
is NOT run and nothing here speaks to it.**

**Question (PRD v1.28).** Can `scripts/types-close.mjs` be expressed as `close: [{name, cmd}, …]`
so the check menu derives from it and no operator authors checks per job?

**Result: yes. Eight stages, seven of them borrowable.**

| # | stage | standalone? |
|---|---|---|
| 1 | instrument preconditions (seed commit exists) | **no — and correctly so**: a precondition guard, not a check |
| 2 | changed-file set vs the frozen seed | yes |
| 3 | D2 scope audit (only `src/**` may change) | yes |
| 4 | D1 static gaming audit (diff-based) | yes |
| 5 | `tsc --noEmit --strict` | yes |
| 6 | suite + executed-count floor | yes |
| 7 | declaration emit (`.d.ts` builds) | yes |
| 8 | D3 public-API superset | yes, but **only after 7** — it reads 7's build output |

**Correction to PRD v1.28, made against source.** The addendum's own example of a
non-decomposable stage was D1, on the reasoning that a gaming audit "needs the whole diff."
Reading it: D1 re-derives everything from the frozen seed ref (`git diff --name-only SEED_REF`
then `git show SEED_REF:<file>` per changed file). The seed ref is a constant, so D1 is fully
self-contained. **The claim was made from recollection of the design, not from the code**, and
is corrected in place. The real non-borrowable classes are narrower than stated: instrument
preconditions (stage 1) and stages consuming an earlier stage's build artifact (stage 8, which
pairs with 7 rather than dropping out).

**The result that matters for the doctrine.** The operator hand-wrote **three** checks
(`typecheck-clean`, `suite-green`, `no-suppressions`) — which are stages 5, 6 and 4.
Derivation yields **seven**, including three the agent never had: changed-from-seed, the scope
audit, and the declaration emit. So removing the operator from the loop does not cost the
agent rulers — **it hands it more than the operator thought to carve**, at zero authoring
cost, with no divergence risk between the ruler and the real inspection.

**Lesson.** The hand-authored artifact was not merely redundant with the close, it was a
strict SUBSET of it — the operator carved the three stages he happened to think of. When a
scaffold duplicates a source of truth, check whether the source is richer than the copy
before defending the copy's existence.

## F59 — the SCOUT returns nothing on 15 of 18 runs: the round bound cuts it off before it writes its summary, and the planner has been drafting blind for ~12% of every run's budget

**Status: minted 2026-07-26. $0 archival + a $0.39 live reproduction. Found by accident while
building the T2/P1 probe driver — not the question that was being asked.**

**What happened.** The probe driver's own scout printed `scout blob 0 bytes` after spending
$0.2288. Auditing that degenerate number (rather than proceeding) sent me to the archive,
where the shipped flow does the same thing.

**The archive, all 18 plan-v1 runs that emitted `scout-result`.**

| scout finished | n | blob bytes |
|---|---|---|
| hit its round bound (`attempt-bounded`) | 16 | **13 × 0 bytes**, 3 stubs (74, 86, 86), 1 × 7073 |
| finished on its own (7 of 8 rounds) | 2 | 8056 and 5991 — full surveys |

**2 of 2 unbounded scouts produced a real survey. 15 of 16 bounded scouts produced nothing
usable.** `planPrompt` then substitutes the literal string `(no scout notes)` — so on 15 of 18
runs **the planner drafted with no view of the repository at all**, working from the goal text
alone.

**Mechanism.** `SCOUT_ROUNDS = 8`, and the bound is enforced from the metering callback:
when the round count reaches the cap, `loop.stop()` fires. A scout that is still calling tools
on round 8 is halted mid-tool-use, and `r.text` is whatever the last assistant message held —
for a tool-use turn, empty. The scout spends its entire allowance exploring and never gets a
round in which to write the summary that is its only deliverable. The single bounded
exception (7073 bytes) is consistent: it emitted text on the same turn the bound fired.
Message-level confirmation is not in the spine, but the correlation is 15/16 vs 2/2 and the
probe driver reproduced it live at 8 rounds on a different patient.

**What it costs.** F55 measured the scout at **12.34% of run spend**. So roughly an eighth of
every run's budget buys a survey that is discarded five times in six — and the discard is
silent, because `(no scout notes)` is a legal prompt.

**What it does NOT establish, stated because the temptation runs the other way.** Empty scouts
do **not** predict failure. Of the 5 runs whose final close was `satisfied`, **3 had 0-byte
scouts**; full-blob runs appear on both sides. So this is not "the thing that broke Layer 2",
and F47's acceptance is not withdrawn — its greens are real and were audited. The honest read
is narrower and still serious: a paid-for phase is delivering nothing most of the time, and
nobody noticed.

**It re-bounds the ceiling claim a third way.** F51–F55 concluded "workflow generation is at
ceiling". Those probes fed the planner **hand-written scout blobs** (`sourceScout` /
`targetScout`, hardcoded in `scripts/n3-preprobe.mjs`) — a rich survey production almost never
delivers. So "at ceiling" was measured on a *better-informed* planner than the shipped flow
produces. The claim now carries three qualifiers, not one: **on TESTGEN · on a six-field
vocabulary (F56) · with a scout the real run usually does not get.**

**A new sub-class of the blind-instrument family — the UNREAD instrument.** The previous six
shippings were instruments that could not see the variable. This one saw it perfectly:
`scout-result {bytes: 0}` was emitted faithfully, 18 times out of 18, run after run, including
through the F47 acceptance battery and three job-#5 rows read closely enough to produce a
stash. The instrument worked and reported into the void. **An emitted number nobody reads is
not evidence — it is a log line.** Any metric that exists to catch a silent failure needs a
consumer that fails loudly, not merely an emitter.

**Fix direction (not yet built, and it touches the F47-accepted path).** Two candidates, both
cheap: give the scout a round it cannot spend on tools (reserve the last one for the summary),
or make an empty scout blob a loud condition rather than a silent `(no scout notes)`. The
second is the F17 lesson applied to a phase instead of a verdict — check the green side too.
Which one ships is a design call, and the probe driver works around it harness-side meanwhile.

**Lesson.** Auditing a degenerate number instead of routing around it is the whole of this
finding: `0 bytes` could have been dismissed as a quirk of a probe harness in thirty seconds.
The rule that says *debug the test before believing it* paid for itself, and then paid again —
the harness was fine and the product was not.

## F60 — the materials probe set: the scout DOES transmit (do not delete it), a materials budget makes the planner allocate ~60% MORE, and 2 of 3 planners reach for verbs they were never offered before

**Status: minted 2026-07-26. $1.04, 18 drafts, 25 calls, 0 casualties. Applies
`docs/02-experiments/MATERIALS-PREREG.md` + amendment 1, both frozen before any number.
Draft-only: every claim below is about the PLAN, never an outcome.**

### S0 — the scout question, and it goes against the hypothesis

hamr's instruction was *"confirm without notes and if it doesn't make a diff then remove it"* —
a reasonable read of F59, where 3 of 5 archived greens had a zero-byte scout. The 2×2 refutes
it. Frozen primary metric: repository specifics (path/symbol tokens) appearing in the plan but
**absent from that arm's goal text** — the operational test of transmission.

| arm | goal | scout | specifics absent from goal (n=3) |
|---|---|---|---|
| A1 | full (1,910 ch) | ON | 22 · 32 · 31 |
| A2 | full | OFF | 5 · 4 · 2 |
| A3 | one sentence | ON | 23 · 31 · 32 |
| A4 | one sentence | OFF | 2 · 2 · 1 |

**A3 exceeds A4 roughly fifteen-fold**, and the character of the tokens differs, not just the
count: scout-ON plans name real files (`src/assemble.js`, `src/docparse.js`); scout-OFF plans
produce generic guesses (`null/undefined`, `core/entry-point`, `package.json`). The frozen rule
for A3 ≫ A4 reads **the survey transmits; the phase stays** — so the delete recommendation does
NOT fire, and the F59 fix is vindicated rather than made moot. The 2×2 earned its keep: A2-vs-A1
alone (5·4·2 vs 22·32·31) would have shown the same direction, but only the one-sentence cell
proves the scout is the *source* rather than a redundant echo of a rich goal.

**Why the archive hinted otherwise.** "Greens happened with a blind planner" is true and is not
evidence the scout is inert — it is an uncontrolled comparison across different jobs and plants.
$1.04 of controlled contrast overturned it. **A hypothesis drawn from an observational pattern
survived exactly as long as it took to run the arm.**

**Unasked-for second result: the scout roughly TRIPLES the plan's declared work.**

| | steps (mean) | declared rounds (mean) |
|---|---|---|
| A1 scout ON | 6.7 | **161** |
| A2 scout OFF | 5.0 | **91** |
| A3 scout ON | 7.3 | **172** |
| A4 scout OFF | 4.3 | **66** |

A blind planner writes a smaller, cheaper, vaguer plan. This re-prices F59: the 15 blind runs
were not merely under-informed, they were **under-planned** — and the phase that costs ~12%
(F55) governs an allocation several times its own size.

### T2 — the allocation responds to materials, and it expands toward the bound

Frozen rule: identical plans at n=3 ⇒ the inform arm STOPS. They are not identical.
T2B (given $10, 45 minutes, and F57's per-round rate) drafted **8.0 steps / 262 rounds** against
A1's 6.7 / 161 — **+62% allocation**. At F57's measured rate that is ~$4.97 and ~23 minutes of
model time: it expanded toward the stated ceiling while staying inside it.

**This is hamr's premise, observed:** *"give it open-ended and it exhausts it; give it bounds and
it uses it all."* With no budget stated the planner asked for 161 rounds; handed a budget it
asked for 262. The arm proceeds to design.

**And the per-step cap is doing real work.** T2B's validator reds were `bounds:steps.N.rounds` —
told it had materials, it wrote individual steps exceeding `maxStepRounds`. The outer ceiling
caught what the stated budget encouraged, which is the arbiter behaving exactly as designed.

### P1 — 2 of 3 reach for the wider palette

Frozen rule: 0 of 3 ⇒ re-scope P from "widen the menu" to "why is it declined". **Not met** —
so P proceeds as a menu widening.

- draft 1 → `impact` · draft 2 → nothing new · draft 3 → `impact`, `peek`, `stash`

It reaches into **Select** and **Isolate**, and never into **Compress**. Contrast with job #5,
where `recall`/`get` were granted and never used: offered a *named, described* catalog the
planner does grant itself new verbs. (These drafts red at the validator by construction —
`TOOL_MENU` is still the hard six — which was stated in advance and is not a result.)

### U0(b) — one sentence is viable

Frozen rule: ≥2/3 validator-green ⇒ one-sentence input is viable for U. **A3 scored 2/3.** It
was also no worse than the 1,910-character goal (A1: 1/3) — recorded, not a rate claim at n=3.
So U can run on a sentence a user would actually say.

### The incidental finding with the best cost/benefit: one grammar rule drives 72% of all reds

13 of the 18 validator reds are a single class — `invalid-value` on a `tree-changed` scope — and
every instance is the same mistake:

```
the agent wrote:  {"type":"tree-changed","scope":"src/*.js"}
the validator wants: a contained scope (trailing /** or /* only)
```

`src/*.js` is a natural and sensible scope the grammar cannot express, and **the plan prompt
never states the rule** — it says only *"a scope inside ["src/**"]"*. Each red costs a redraft
call. Naming the constraint in the prompt is a one-line change that would remove ~72% of
drafting friction; widening the grammar is the alternative and is the riskier direction
(`globToPrefix` containment is load-bearing, and its normalization order is already noted as
high-risk). **Recommend the prompt line, not the grammar.**

### Limits, stated before they can be forgotten

n=3 supports existence and direction, never a rate. **Every result here is on the PLAN surface**
— none shows that a scout, a materials budget, or a wider palette improves an OUTCOME. In
particular "the scout transmits" is not "the scout helps"; it is the weaker claim the frozen
asymmetry allowed, and the stronger one needs an outcome battery. One patient, one genre.

## F61 — the hang was already fixed, and a per-round rate is a fiction: time is a BALANCE, never a quota

**Status: minted 2026-07-26. $0 — two failable conditions against a fake provider and a local
socket, plus one source read. Run BEFORE any T code, precisely so the design record could be
corrected instead of implemented.**

### What was measured

| # | condition | instrument | result |
|---|---|---|---|
| C1 | can `loop.stop()` cut an in-flight `generate()`? | fake provider hanging 4,000 ms; `stop()` fired at 500 ms | **NO** — `run()` returned at **4,018 ms**, 1 call |
| C2 | does BA-18's provider timeout fire on the ABSENCE of events? | real `AnthropicProvider`, `timeoutMs: 1200`, local socket that accepts and never answers | **YES** — **1,259 ms**, `TimeoutError code=ETIMEDOUT` |

C2 could genuinely have failed: without BA-18 that socket is bounded only by the OS TCP timeout
(~2 h) and the spike would have hung rather than returned. `stop()` is read at the round boundary
(`bare-agent/src/loop.js:661`) and between tool calls (`:916`) — never mid-request.

### The refutation: T's first motivation is dead

The materials design record's §1 justifies T on two complaints, and the first is
*"couple of hours just hanging — nothing in the system bounds TIME."* **That is no longer true.**
BA-18's 10-minute inactivity timeout was consumed in `2bd46bb`, two commits before the record was
written, and C2 shows it fires. A wall-clock cap does not fix hanging, because hanging is fixed.

What survives is the second motivation: **time as a material the planner allocates against** —
untouched by BA-18 and independently measured in F60.

### The source read that reframed the rest

**The shipped plan prompt never mentions money at all** (`src/planrun.js:76-109`): no `budgetUsd`,
no rate, no dollars. The only bound the planner sees is `rounds: 1..maxStepRounds` per step. Money
is *purely enforced* (the gate's `maxCostUsd`, per round, shell-side) and *never spoken*.

So F60's T2B arm invented a framing nothing else in the system uses — it handed the planner a
**rate and a derived round quota**: *"a round costs $0.019, so the run affords 526 rounds"* /
*"a round takes 5.4 seconds, so the run affords 300 rounds"* (`scripts/probe-materials.mjs:136-141`).

### Why a rate is the wrong instrument (hamr's correction, and F57 supports it)

hamr: *"why would you tell it every round that you have x time per round? what if there is a heavier
round? why don't you tell it same like cost, you have x left … instead of making it race against
time?"*

A per-round rate is a median that describes almost no real round. F57's own spread:

- execute rounds: 1.6× and 1.2× of median
- the verification between attempts: **3.8 s to 561 s — a 150× spread**

A heavy round silently breaks the planner's arithmetic and nothing tells it. A **balance** is
self-correcting by construction: after a heavy round the number is simply lower, and the agent never
has to model what a round weighs. It is also the shape money already has.

Second-order: a rate turns a budget into a stopwatch, and a worker racing a clock has the same
incentive to rush or fake that the v1.12 §5 prompt contract exists to remove.

### Consequence, and the cost of the correction

Time is told as a **remaining balance**, never a per-round quota, and never as a rate to divide by.
See design record addendum 2 for the shape.

**F60's +62% does not transfer.** It was produced by the rate framing now discarded, so it is not a
prediction for the balance framing. What survives from T2B is the weaker, framing-independent claim:
*hand the planner a stated bound and it plans against it.* The magnitude is withdrawn.

### Limits, stated before they can be forgotten

C1 and C2 establish what the **seams** do — a fake provider and a local socket, not a real run.
Neither measures where a real run's hours actually go. That question is **still open**: the candidate
buckets are model rounds (already bounded by money at F57's rate) and check/close gaps (which cost
$0, so the money cap cannot see them, and which F57 measured as high as 561 s each). The archived
spines carry timestamps and can answer it for $0; that read was proposed and is **not yet run**.

## F62 — where a run's hours actually go: 73% model, 9% tests, 17% hang — and the residual caught two blind instruments before the answer did

**Status: minted 2026-07-26. $0 — 124 archived spines, 1,045.8 minutes of wall clock. Closes the
item F61 left open.**

### The split

| bucket | time | share |
|---|---|---|
| **WORKER** — worker rounds and their tool executions | 761.7 min | **72.8%** |
| **STALL** — dead time before an escalation (the hang) | 183.3 min | 17.5% |
| **CLOSE + CHECKS** — the operator's close and the agent's checks, $0 model spend | 94.7 min | **9.1%** |
| residual | 6.1 min | 0.6% |

**Tests are 9%, not the dominant cost.** The hypothesis F61 left open — that the hours might be
hiding in $0 check gaps invisible to the money cap — is **refuted**. Excluding close/check time from
the wall-clock count would move the number by under a tenth and does not justify a separate
mechanism. hamr's question (*"why are tests counted or can we exclude that from build/count time?"*)
is answered empirically: count everything; the distinction is not worth building.

**The 17.5% stall is the hang, and it is concentrated, not diffuse.** Two `types-screen-C` runs carry
180.8 of the 183.3 minutes — **98.6%**. That is the class BA-18 now bounds at 10 minutes (F61/C2),
which re-confirms F61's retirement of T's hang motivation from a second direction: the dead time was
real, it was rare, and it is already fixed.

**Consequence for T:** 72.8% of wall clock is the model working, which is exactly what a time budget
governs. The materials design stands as written (addendum 2) — no third narrowing.

### The method, which is the transferable half

**Measure every bucket directly and keep a residual. Never derive one by subtraction.** A subtracted
bucket silently absorbs every classifier error and everything the classifier cannot see, and reports
a clean number while doing it.

This is not asserted — it is what happened, three times in one sitting:

| pass | residual | what it caught |
|---|---|---|
| 1 | **95.4%** | append-only close/check logs and gate audits were being read as runs; one spanned **7 days**. Fixed by requiring `job-start` at `seq:1` |
| 2 | **31.0%** | two classifier holes: `worker-turn` (the native per-turn event) was model work counted as neither, and pre-stop gaps had no bucket |
| 3 | **0.6%** | sound |

Had the model bucket been computed as `total − tests`, all three errors would have landed inside the
answer and the first pass would have been reportable with a straight face. **The residual was the
only instrument that could see them** — the seventh shipping of the blind-instrument class, caught
this time by design rather than by hamr.

### Limits, stated before they can be forgotten

- **WORKER is the LLM call PLUS its tool executions.** The spine does not bracket them separately, so
  the split between "model thinking" and "reading files" is unavailable without new instrumentation.
  It does not change the conclusion at this scale.
- **The archive is mixed** — job #1, job #2, aurora, the types screen, API and native clipipe
  surfaces, across many months and several designs. The 73/17/9 split is the programme's aggregate,
  not any one job's profile; a single patient with a pathological close (aurora's untimed
  HuggingFace check) could still invert it locally.
- **Gap attribution is by the event that ENDS the gap.** With a 0.6% residual the attribution is
  sound in aggregate; it is not a per-round timing instrument.

## F63 — F56's "a replan has never fired" is FALSE: it fired 8 times. And A's 50% variance trigger would have fired 0 times on the same archive

**Status: minted 2026-07-26. $0 — replayed all 18 archived plan-v1 spines (54 steps, 101 judged
attempts, 1,213 metered rounds). Corrects F56 Finding 4, which is the premise PRD v1.27's move A
and the materials design record §3.4 were built on. Found by asking whether the just-built
trigger was REACHABLE, before spending anything on a live row.**

### The correction

F56 Finding 4 states, verbatim: *"a replan has never fired, in the entire programme"* and
*"'the agent adapts its workflow as it goes' has zero observations across every battery this repo
has run."*

**Eight replans fired.** Each is a `replan` event followed by a `plan-accepted` at
`phase: 'replan'`, all on the exhaustion trigger (`reason: "step exhausted its attempts with
exits still red"`):

| spine | job | step that triggered it |
|---|---|---|
| l2accept-L1-mrvpteca | aurora-testgen-l2accept | review-current-tests |
| l2accept-L2-mrvpteca | aurora-testgen-l2accept | read-existing-suite |
| l2accept-L3-mrvpteca | aurora-testgen-l2accept | survey-current-suite |
| l2accept-L3-mrvyexy4 | aurora-testgen-l2accept | review-existing-suite |
| l2accept-L4-mrvpteca | aurora-testgen-l2accept | audit-current-suite |
| l2accept-L6-mrvpteca | aurora-testgen-l2accept | review-existing-suite |
| l2clip-L1-mrxkj6ik | …-clipipe | survey-existing-tests |
| l2clip-L2-mrxd0c4l | …-clipipe | strengthen-cache-check-tests |

The L2-acceptance rows ran **2026-07-22** and the clipipe rows **2026-07-23** — both BEFORE F56
was written on 2026-07-26. The evidence F56 actually cited was *"Both job #5 rows recorded
`replanned:false` after dying provider-red"* — **two rows, one job, both provider casualties**,
generalised to "the entire programme" without replaying the archive. Same error class F60 caught
one size up: *a hypothesis drawn from an observational pattern survived exactly as long as it took
to run the arm.* Here it survived four days and reached a signed design record.

### And the trigger it motivated is inert at its chosen number

A's replan trigger (design record §3.4, threshold answered §6.2 as 50%) fires when a step consumes
that share of the run's REMAINING money or time with its exits unmoved. Replayed against every
archived attempt boundary — which is exactly what the meter reads at the head of the next attempt:

| | |
|---|---|
| steps seen | 54 |
| steps with more than one attempt (the only ones that can EVER fire it) | 24 |
| **would have fired at 0.5 with a further attempt pending** | **0** |
| crossed 0.5 only on the LAST attempt (no successor to pre-empt) | 3 |
| near misses (0.25–0.5, successor pending) | 4 — at **0.35 · 0.35 · 0.40 · 0.45** |

**The zero was audited before it was believed** (the blind-instrument class has shipped seven
times in this programme): all 18 spines carry `budgetUsd` on `job-start`, 1,212 of 1,213
`worker-round` events are priced, and 101 `exit-eval` events exist to read shares at. The
instrument can see the variable; the zero is a result, not a blind read.

### What this does to A

A is built, unit-tested and mutation-proven (5 mutants killed), and on the only workload with
data it **adds nothing** — the F22 class, a knob that looks live and does nothing. Two honest
readings, and this finding does not choose between them:

1. **Inert.** The variance trigger buys no observation the exhaustion trigger did not already buy.
2. **Untriggered, not inert.** It is a guard against a step that eats the run; no archived step
   did that. The near-miss ceiling of 0.45 says the population is *close* to the wall, not far
   from it.

**The threshold is arbiter territory and stays hamr's.** Explicitly NOT lowered here: picking 0.35
because that is where these four points sit would be fitting the number to the data, which is the
standing no-fit-to-pass prohibition. The distribution is reported instead.

**T is undamaged.** The clock, `wall-halt`, and the balance-at-draft do not depend on the replan
premise.

### The question the correction re-opens, now answerable from existing data

F56 declared adaptation unobservable. It is not — there are 8 observations. First look, deliberately
not minted as a rate: replanned runs greened 2 of 8; non-replan runs greened 1 of 5 valid rows
(10 rows less 2 provider-red, 2 no-job-end, 1 pricing-red). **n is tiny and the rows are not
matched** — different jobs, two provider surfaces, months apart — so this is unreadable, not
encouraging. It does mean "does replanning help?" is a $0 archive question rather than a battery.

### Lesson

**A premise cited to justify a build gets replayed against the archive BEFORE the build, not
after.** F56's Finding 4 cost a design decision, a signed record section, and a day of
implementation, and the disconfirming evidence was sitting in 8 files the whole time. The check
that caught it — *is the thing I just built reachable?* — took one script and no money, and it
belongs before the build, where "would this ever fire?" is still a cheap question.

---

## F64 — T's own governance stop can be recorded as a network failure: a wall-derived call timeout routes `provider-red`

**Status: minted 2026-07-26, $0 (source + dependency-source trace, no run). RESOLVED the same day
on hamr's explicit go (*"fix F64 and keep 0.5"*), PRD v1.31. Found by auditing the reachability of
the clock just built — the same question that produced F63.**

### The path

1. `src/clock.js` derives each provider call's timeout from what is left:
   `callTimeoutMs() = min(PROVIDER_TIMEOUT_MS, max(MIN_CALL_TIMEOUT_MS, remainingMs()))`, and
   `src/planrun.js` passes it to every `loop.run` (`timeoutMs: clock.callTimeoutMs()`).
2. On a bounded run whose next call outlives the remaining wall — with more than
   `MIN_CALL_TIMEOUT_MS` (30s) left, so the floor is not what binds — that timeout trips.
   bare-agent rejects with `TimeoutError` (`code: 'ETIMEDOUT'`, `provider-http.js:55`), which
   carries **no `category` and no `lib`**.
3. Every catch site in `planrun.js` defaults an uncategorised throw to **`provider-red`**
   (`err.category ?? 'provider-red'`, three sites plus `relay`). `src/ralph.js:85` maps
   `ETIMEDOUT` for the CLOSE process only — not for a provider call.
4. A timed-out call never reaches the metering callback, so `wall-bounded` never emits, and the
   step loop's `clock.expired()` terminal is never reached.

**Reachability is high, not theoretical.** F62 measured model rounds as 73% of a run's wall time
with individual rounds running into the hundreds of seconds, so on any tight `maxWallMs` the
FINAL call is exactly the one likely to exceed what is left.

### Why it matters more than a mislabel

By standing doctrine a `provider-red` row is a transport **casualty**: never evidence, retry, and
it carries the F44 `spendComplete:false` floor. So a run that correctly ran out of the operator's
*time* is discarded as a *network* failure — the operator's own governance stop laundered into a
casualty. This is the F48 escalation-category-collapse class pointed the other way (there a
casualty could launder into capability data; here governance launders into a casualty), and it
directly defeats T's honesty rule: an unbounded or unknown duration must never be reported as
something it is not.

`MIN_CALL_TIMEOUT_MS` bounds the damage — a call is never given a timeout it cannot survive — but
does not close the class.

### The fix, as shipped

`isWallTimeout(err, clock)` (`src/clock.js`) is the whole discriminator: an `ETIMEDOUT` on an
**expired** clock is the wall's own stop. It needs no `bounded` term — `expired()` is false by
construction with no cap, and a mutation run proved an added one inert, so the unbounded case is
guarded by a test rather than by a redundant condition.

One `categorize()` in `runPlan` is the only place a throw is classified, so the four seams that
previously each defaulted to `provider-red` — the worker `ask`/`askFrom`, the native `ask`, the
scout/drafting `relay`, and the close-fix loop — cannot drift apart. A named category still wins;
only the UNNAMED throw is classified. `wall-halt` gained a `ralph` decision entry (a governance
stop must not read "the middle broke"), and every wall stop now emits ONE record shape with
`cutMidCall` splitting the deadline-inside-a-call reading from the between-steps reading.

**Tested in both directions, and the controls are the point:** a wall-derived trip → `wall-halt`
(previously `provider-red`); the identical error with time left → still `provider-red`; an
unbounded run → still `provider-red`; a drafting-phase trip → `wall-halt` via the relay. Four
mutants killed (drop the expiry check, restore the old default, conflate `cutMidCall`, delete the
step-loop branch). En route the between-steps terminal itself turned out to have had **no test at
all** since it shipped — that gap is now closed too, which needed a `now` injection seam on
`runPlan` (the cap's floor is one close timeout, so real time cannot exercise it).

**Stated limit, deliberate:** a genuine transport hang on a run whose wall has ALSO passed reads as
a `wall-halt`. The run is out of time either way and the remedy is the same; resolving the
ambiguity the other way is the failure this closes.

### Lesson

The reachability audit that caught F63 caught a second thing in the same pass: **"what happens
when the thing I built fires?" is a different question from "would it ever fire?", and both are
$0.** T was built, unit-tested and mutation-proven, and its terminal is bypassed by the very
timeout it derives.

---

> **Numbering note:** F65 was never assigned. The two findings below were built and committed
> (`93fb993`, `9fedfa3`) under the numbers F66/F67 before this ledger entry was written, and the
> commit history is immutable — the skip is recorded here rather than papered over by renumbering.
> There is no hidden F65.

---

## F66 — bare-agent's `timeoutMs` is an IDLE-SOCKET timer, so a slow-but-trickling call can hang a run for hours: the in-process stall fuse

**Status: minted 2026-07-28 from U run `ms3197n8` (litectx-u, provider-red after a 274-minute
hang, ≥$3.23 spent, zero verdict). Fuse built and shipped in `93fb993`; hamr set the
numbers (N=5min, 3 stalls then replan) and the doctrine: "the goal is always self heal and
killing and coming back is not an option."**

### The run

`ms3197n8` on `litectx-u` (63 strict errors, hand-proven winnable at $0): 77 rounds, 24 writes
across 3 files, a 4-step plan — then ONE 274-minute gap between the last `worker-round` and the
escalation. Zero events emitted. Wall cap 45min; actual wall 287.3min. Terminating error:
`read ECONNRESET` — a reset, not a timeout, which is the proof of the mechanism below.

### Root cause, read from source, three hypotheses killed

`applyRequestTimeout` in bare-agent's `provider-http.js` (the BA-18 fix) is one
`req.setTimeout(...)`. Node RESETS that timer on every byte; its own docstring says so: *"the
timer resets on activity, so a slow-but-streaming response is not killed."* It bounds socket
INACTIVITY, never total call duration. A call that trickles a byte every few minutes is
invisible to it forever.

Checked and killed before believing this: NOT ignored (the bound is derived and forwarded per
provider call, `loop.js:732`); NOT first-call-only (`options` forwarded on every call); NOT a
retry storm (`Retry` is deliberately unwired; a single reset ended the run). And retry would
not have helped — the reset came AFTER the 4.5 hours, not instead of them.

### The fuse (`src/stall.js`)

Two timers, no arithmetic. A stall timer reset on every heartbeat; the wall unchanged (absolute
deadline, never reset). Heartbeat = ANY `onLlmResult` — gating on an enumerated `kind` would arm
a false stall on unlisted round shapes. On stall: abandon the call, reissue silently (self-heal,
per hamr's ruling). After 3 stalls: `StallError`, `category:'step-stalled'`, `lib:'bare-agent'`.

`step-stalled` is the THIRD replan trigger in `planrun.js` (with `cap-halt` and
`step-variance`), under the same ONE-replan ceiling and funds-left condition. Outside a step it
surfaces NAMED via `relay`'s DECIDE map — never laundered into provider-red. `run.js` stamps
`spendComplete:false`: an abandoned call may already have been billed (F44).

N was SIZED from measured healthy round-gaps, then SET by hamr (threshold-setting is arbiter
territory): across 220 rounds in three runs, median gaps 4.4–5.5s, p90 11.9–18.2s, worst
legitimate gap ever 2.5min. The hang was 274min — two orders of magnitude past the worst
healthy gap.

### Validation — and the surviving mutant that was a real hole

11 tests through the real bare-agent `Loop`; mutation battery 6 mutants. **M5 survived first
pass** — dropping the `generation += 1` bump in `trip()`. Not equivalent: without the bump, an
abandoned call dying while its reissue is still pending settles the caller's promise anyway —
exactly the `ms3197n8` shape — making the reissue decorative. Added the mid-flight test,
watched it fail under M5, 6/6 killed. A surviving mutant is a claim about the TEST, not always
about the code.

**Firing status, honest:** the fuse has fired in tests and in a reproduction of run 1's exact
shape (4 real rounds then provider silence → 3 stalls → `StallError`, 2.1s). It has never fired
in a paid run — and run 2 (F67) proved the class of failure it structurally cannot catch.

### Upstream

Filed as BA-19: BA-18's fix bounds inactivity; nothing in bare-agent bounds TOTAL call duration.

### Lesson

A timeout's WATCHED QUANTITY is part of its contract. "There is a timeout and it is forwarded"
was true and useless — it watched bytes-between-bytes while the failure was minutes-per-call.
The BA-18 consumption inherited the assumption without reading what the timer measures.

## F67 — a guard that lives inside the thing it guards shares its fate: the OUTSIDE watchdog

**Status: minted 2026-07-28 from U run `ms3jh76q` (litectx-u, wall-halt at 105min of a 45min
cap, $3.19, zero verdict). Watchdog shipped in `9fedfa3`. hamr called the outside guard at the
start ("outside shell for circuit breakers... so it won't go stale") and the assistant argued
it down in favour of in-process — hamr's call was right; recorded as the assistant's to have
got wrong. WHAT FROZE THE EVENT LOOP IS STILL UNKNOWN — stated at that strength deliberately.**

### The run

`ms3jh76q` got much further than run 1: 100 rounds, 48 writes across 13 files, a 5-step plan,
3 check runs, a real close verdict (`needs_revision` at `no-suppressions`) and the fix loop
fired. Then an **81.5-minute gap in the fix phase with 0 stall events**, ending in
`read ETIMEDOUT`. The F66 fuse was live (committed 4 minutes before t0) and never fired.

### Diagnosis: the fuse works, and that is exactly the problem

Reproduced against the run's exact shape (4 completed rounds through the real bare-agent
`Loop`, then provider silence): 3 stalls, `StallError`, 2.1 seconds. So in the real run it
never RAN. A `setTimeout` in the same event loop as whatever froze that loop shares its fate.
Every guard bareloop had lived inside the run, and each failed structurally on this event:

| guard | why it could not help |
|---|---|
| bare-agent `timeoutMs` | idle SOCKET timer — resets on bytes, saw nothing wrong |
| the wall clock (T) | read BETWEEN rounds — no round ever arrived |
| the F66 stall fuse | a `setTimeout` — cannot fire on a blocked event loop |

Measured en route: `lc.index()` ticks the event loop 1 time where 19 were due (litectx is
synchronous SQLite underneath) — a real blocking-class mechanism, but indexing runs once per
worker BEFORE the rounds, so it does not account for the 81 minutes.

### Withdrawn: the node_modules theory

Measured `grep -rn` at 6.9s on litectx-u vs 0.47s on aurora-u and blamed 969MB of
node_modules. WRONG INSTRUMENT — bare-agent's grep runs in a worker thread under a hard 5s
ceiling (`DEFAULT_GREP_TIMEOUT_MS`, `worker.terminate()`), so it can neither block the main
loop nor run long. `grep -rn` from a shell is a different program from the tool the worker
calls. The fix it motivated was also wrong and reverted: symlinking node_modules outside the
patient broke nested dependency resolution (330 test failures). The blind-instrument class,
self-inflicted after writing a rule against it.

### The watchdog (`scripts/u-watchdog.mjs`)

A separate process that shares NOTHING with the run: it reads one file's mtime and calls
kill(2). Deliberately dumb, each omission load-bearing — parses no JSON (a malformed spine
must not blind the guard), imports nothing from `src/` (no shared code, no shared failure),
models nothing about the run (nothing to desync). Two independent triggers: STALE (spine
stopped growing → wedged; default 600s = 2× the inner fuse so the inner guard always gets its
three tries first) and WALL (elapsed past cap + grace; grace default 900s covers the close,
which legitimately runs ~55s+ after the last round — killing mid-close destroys a real
verdict). The kill is RECORDED at `<spine>.watchdog.json` BEFORE the signal goes out: a run
stopped by the arbiter must never read as a mystery crash (the governance-stop vs casualty
line, F45/F64). SIGTERM, then SIGKILL after 10s.

> **Addendum 2026-07-30 — the deadline trigger is ACTIVITY-AWARE now (hamr's ruling,
> 0.6.0 release gate).** The paragraph above describes the original design; two of its
> numbers went stale and one rule changed. (1) The wall grace is sized
> `stages × closeTimeoutMs` (the 900s default covered ONE close stage; a staged close
> legally runs N — the old arithmetic could kill a live verdict, the exact damage the
> grace exists to prevent) and run-u passes it explicitly. (2) hamr's ruling, verbatim:
> "the kill from outside should check for activity/bytes or other markers for activity,
> not a silent kill" — the deadline kill now fires only when the deadline passed AND the
> spine has been flat for a full fuse window (300s); past-deadline-but-writing logs LOUD
> every poll and is never killed (the in-process fuses and the money cap own bounding a
> live run). Every kill prints the trigger, the deadline arithmetic, and the marker's
> value/age before the signal. (3) A CPU marker (/proc utime+stime) was built alongside
> and REMOVED after the release review measured it broken both directions — child CPU is
> credited only at reap so a live close reads dead, and run-u's own 1s lag sampler ticks
> the parent so a wedged run reads alive at production constants; its kill tests had only
> passed at a 5:1 dead-window:poll ratio where production is 60:1. Spine-bytes-only is
> the marker ("keep what is simpler/available" — hamr). The STALE trigger is unchanged
> and remains the trigger that actually catches the F67 wedge; a wall-less spec now
> omits `--wall-ms` and prints the unbounded choice loudly instead of passing the
> string "undefined" (which silently disarmed the deadline trigger).

### Validation

Real processes, real files, real kills — a watchdog tested against a mocked clock and victim
proves nothing about the case it exists for. 8 tests including: a progressing run is never
touched; the wall fires on a HEALTHY spine (out of time however alive it looks); a spine that
never appears is stale from watchdog start; the watchdog exits when the run ends (no strays);
**a victim whose event loop is HARD-FROZEN (`for(;;);`) still dies** — probed live first:
the run path installs zero signal handlers, so SIGTERM keeps its kernel default disposition
and lands on a frozen process. Mutation battery 5/5 killed. First draft leaked 5 victim
processes on assertion failure; fixtures now tear down via `t.after`.

**Stated limit:** the run-u.mjs WIRING (spawn args, `unref`, finally-kill, marker readout) has
executed only in the no-fire path — no run has both fired the watchdog and been read. The next
real run is bounded by it either way; its first live fire is the wiring's validation.

### The still-open question, and the instrument now waiting for it

The freeze is unexplained. Two instruments now bracket the next occurrence: the watchdog
marker + last spine event localize a freeze the watchdog kills; a lag sampler in `run-u.mjs`
(1s tick; records any ≥3s block with from/until timestamps to `<spine>.lag.jsonl`, proven
against a real 4s hard freeze) localizes any freeze the run survives. Between them, the next
freeze cannot pass unmeasured.

### Lesson

A guard that lives inside the thing it guards shares its fate. Three independent in-process
bounds all failed on the same event for the same structural reason — the fix was not a better
timer but a different PROCESS. And the operator's original instinct ("outside shell... so it
won't go stale") was the correct design the first time it was offered.

## F68 — U's second genre greens through a replan: cap-halt → adapt → validated green; and the close-runner turns out to freeze the loop it reports to

**Status: minted 2026-07-28 from U run `ms3wawub` (litectx-u, GREEN, $5.77 of $10, 37.0min of
45). The first complete cold-build → cap-halt → self-heal → validated-green cycle in user
mode, with the full guard stack (T + F66 fuse + F67 watchdog + lag sampler) live for the
first time.**

### The run

Cold 3-step plan (`fix-error-narrowing` → `fix-implicit-any-and-this` → `final-strict-verify`).
Steps 1–2 green. Step 3 spent its 4/4 runs red and cap-halted at 00:26:47 — and the replan
trigger CONVERTED it: a 2-step recovery plan (`finish-strict-fixes` → `final-strict-verify`),
both green, outer close satisfied on FIRST judgment at 00:43:12. 176 rounds, 53 writes across
10 files, 16 check runs, zero stalls, watchdog never fired.

**Validated, not asserted:** all four close stages re-run independently against the tree the
run left — 10 files all under `src/`, `tsc --strict` zero errors, 410 tests EXECUTED / 0
failing (the floor counts executed, never passed), zero suppressions. Diff preserved by cp
discipline (`run3-ms3wawub.patch`, 661 lines) BEFORE anything touched the tree — the rule
violated on aurora run 3 was followed this time.

### What is and is not a first (stated so the claim cannot inflate)

FIRSTS: first litectx-u verdict (runs 1–2 were timeout-class casualties, F66/F67); first
user-mode green through self-healing (aurora's two greens never replanned); first bridge
minted from an ADAPTED plan — the saved bridge is the post-replan plan, exactly the artifact
the reuse thesis wants. NOT firsts: not the first bridge (aurora saved two); not the
programme's first replan (F63 counted 8 in Layer-2-era batteries, 2 greened — but those were
operator-scaffolded jobs, not user mode). The guards did NOT cause the green — zero stalls,
zero watchdog fires; their contribution was bounding the downside. The replan machinery
earned it.

### The lag sampler's first catch — and it caught US

9 loop-freeze records, worst 74.3s. Every one brackets a close run. `ralph.js` executes
closes via `spawnSync` — a SYNCHRONOUS child process — so the host event loop is dead for
every close's full duration (the litectx close ≈ 65s: tsc ~10s + 410-test suite ~55s,
matching the freeze brackets exactly). First reading of the first record blamed litectx's
`index()`; the timeline refuted that within the hour (check-preflight events bracket the
block) and the correction is recorded in LC-3, which was filed with the honest per-package
split: litectx's real share is a 4.4s / 4.5%-liveness force-index block (measured on a
155-file spare patient), ours is the spawnSync.

Severity: LOW today — no provider call is in flight during a close, so the block starves
only instruments (fuse timers, lag sampler, spine liveness against the watchdog's stale
window; the outside watchdog itself is immune by construction). Recommendation: async spawn
with identical semantics. **Close execution is arbiter territory: named, scoped, PARKED for
explicit go.**

**RESOLVED 2026-07-30 (hamr's go: "validate all errors and fix what passes").** The close
runner is async spawn with byte-identical semantics, proven by a 25-case old-vs-new
differential (timeout signal, ENOBUFS ceiling, gap shape, exit bands, redaction, stdin EOF,
multibyte boundaries) plus 5-for-5 mutation kills on the new guards. Freeze measured before
and after: the F68 preflight shape (3 stages, 3.5s) went 0 host ticks → 126 ticks, worst
gap 26ms. The stale-window sizing in run-u is UNCHANGED — runStages still emits nothing
between stages, so legal spine silence is the same; only the host loop stays alive.

### Open

The 81-minute freeze (F67's trigger) remains unexplained — spawnSync cannot produce it (no
close ran in that window; one block is capped by the 900s close timeout). This run gave it
no chance to recur. Both instruments stay armed; the next occurrence gets bracketed either
way (marker + last spine event if killed mid-freeze; lag record if survived).

### Lesson

The self-heal channel is no longer theoretical: on its first user-mode firing, a replan
turned a run that had spent 60% of its budget on a red step into a validated green under
cap. And an instrument added to find someone else's freeze found ours first — build the
cheap instrument, then believe what it says over what the investigation expected.

## F69 — the P read (n=3, all cold): the planner ignores the widened palette but adopts every control knob — and its default plan shape disconnects the self-heal loop

**Status: minted 2026-07-29 from the signed P read (hash `25d8c5ee…`, hamr's "confirmed"),
runs `ms4l5p6w` ($1.48, 10.7min, step-red), `ms57zr7c` ($4.28, 30.2min, step-red),
`ms5a24tz` ($0.28, 3.3min, plan-red). One genre (TYPES), one job (litectx-u) — every claim
below carries that qualifier.**

### Question (a): new-verb selection — zero

Across the 4 validated plans (2 runs × draft+replan), not one of the 8 new palette verbs
was selected — nor the pre-existing `recall`/`get`. Every step: `read/grep/edit`. F60's
"2 of 3 drafts select when the catalog is named" did not reproduce on this job. Contrast:
the P step-VOCABULARY landed instantly — `model:"haiku"` on mechanical steps, `attempts`
tightening, per-step `scope` — used in every plan that offered a place for them. The
planner takes control knobs it understands and leaves retrieval verbs whose value it has
no reason to believe (F19's capability-without-strategy, now visible at the DRAFT layer:
the strategy lines ride with granted verbs, but nothing at draft time argues FOR granting).

### Question (b): outcome vs baseline — no cost read minted

0/3 green on the widened menu vs 1/3 on the old menu is two anecdotes side by side (F24
rule); no run was killed BY a new verb (none was ever invoked), so the menu is a bystander
in every death. The three deaths: two identical structural stalls (below), one honest
plan-red (drafter tried to hang an exit on `tsconfig.json`, outside the signed fence —
the fence held, $0.28).

### The real find: the mailbox with no hands (4 of 4 plans)

Every validated plan authored the same idiom: fix steps exiting on `tree-changed` alone
(form only — greens on ANY change), plus a read-only "verify-…" step holding every
`check-passes`. A failing check's gap is re-delivered to the verifying step's OWN worker —
which holds no write-class tool. Both step-red runs show the stall signature: a
byte-identical 57-error gap, four iterations, zero possible conversions. The one green
this job ever produced (F68, `ms3wawub`) escaped ONLY because its replan happened to move
`check-passes:typecheck` onto the edit-granted fix step — its ORIGINAL plan carried the
same trap. Green vs red on this job was a plan-shape coin flip, not capability.

The replan channel cannot heal this class: both red runs' replans re-authored the trap.
Self-heal converts only what reaches a worker that can act (F38/F39 delivery≠conversion,
recurring at the plan-wiring layer).

### The fix (shipped, d447665): the shape is now inexpressible

`validatePlan` reds `check-passes` on any step without a write-class tool (the complement
of the F17 pairing rule; same `exit-illegal` class), and the drafter prompt states the
same law. The rejection red at draft time IS the teaching moment — choose-don't-describe,
zero execution tokens burned. The flipped test pins the reversal with the paid evidence
in its comment. Landed AFTER all three runs so the series stayed one readable condition.

### Symptoms catalog (for the next operator reading a stuck run)

1. Byte-identical gap across iterations — feedback is delivering but not converting.
2. A `verify-…` step with no `edit`/`write` holding `check-passes` — the trap (now
   validator-rejected).
3. Fix steps greening on `tree-changed` with the close still red — form satisfied, truth
   untouched.

### Lesson

A widened menu is inert without a reason to reach for it (F19 at the draft layer), and
the highest-value read from the widening experiment was not about the widening at all:
running the same job cold three times exposed that the planner's default "fix, then
verify" idiom structurally disconnects the very check-loop that mints every green. The
un-gameable fix was not prose in the prompt but one more inexpressibility rule at the gate.

### Addendum 2026-07-29 — the rule converts: first-draft compliance twice, and the first no-replan green

Post-rule cold runs (same job, same caps): `ms5aou4a` (provider-red casualty at ≥$0.80 —
`truncated:max_tokens` in a worker round; readable half only) and `ms5uxhej` (**GREEN,
$4.29 of $10, 23.9min of 45, 132 rounds, 45 writes / 10 files, close satisfied on FIRST
judgment, NO replan — a first for this job**; bridge minted from an un-replanned cold plan).

Both post-rule drafts validated on the FIRST try with the winning shape — the validator
never had to fire; the law stated in the prompt redirected the habit upstream (against a
4-of-4 prior trap rate). The green run's planner even kept its "verify-strict-typecheck"
step name, but the rule had forced `edit` onto it — and that exact step then converted
live: typecheck red → gap to its OWN worker → fix → red → fix → satisfied on iteration 4.
The precise location where `ms4l5p6w`/`ms57zr7c` stalled to cap on a byte-identical gap.

Green audited, not asserted: all four close stages re-run independently against the tree
(exit 0 each), 410 tests EXECUTED / 0 failing, 10 files all under `src/`, zero
suppressions (three grep hits are seed-preexisting prose mentions), diff preserved
cp-first (`run-ms5uxhej.patch`, 764 lines). New-verb uptake: still zero (data point six).

Cost read (secondary, n=1 vs n=1): $4.29/23.9min no-replan vs the baseline's $5.77/37min
with a replan — direction favorable, unminted.

### Addendum 2 (2026-07-30) — the haiku arm: the tier floor is the PLANNER's, and the mailbox rule's production debut was as a shield

Aurora-u under `--model haiku` (run `ms7gne7s`, whole job on the economy tier): **plan-red,
$0.05, 1.4min — no plan ever validated.** Draft 1 authored the exact mailbox trap (a 6-step
plan ending in a read-only verify step holding `check-passes`) — **the F69 rule's first
production firing**, plus two missing-exit reds. Draft 2 fixed the form reds and repeated
the mailbox violation VERBATIM despite the red naming step, rule, and fix direction — the
F38 gap-genre split (form converts, structure does not) surfacing at the drafting layer.
Sonnet post-rule: 3/3 first-draft compliant, never drew the red.

Contrast (same job, same signed hash, same day): sonnet green $1.86/11.2min vs haiku
plan-red $0.05/1.4min. n=1 per arm, but the failure is BEFORE execution — a planning-tier
capability edge, not a fixing-cost edge. **hamr locked the floor (in-turn, 2026-07-30):
the drafter/default worker tier is sonnet (medium) minimum.** Per-step `model:"haiku"`
tiering under a sonnet plan stays available (a haiku step has greened; the menu is
unchanged); the runner's `--model haiku` arm remains as an explicit operator probe knob,
documented as below-floor. Also on record: the mailbox rule was built as a teaching red
for the resident drafter and debuted as a SHIELD against a weaker one — the gate's value
is tier-independent.

## F70 — the hardening-and-review cycle before the release: two guards carrying the very failure they were built to catch, and one fix refuted before it shipped

**Status: minted 2026-07-30 from the close-out of branch `staged-close-wip` (31 commits
vs main). A hardening pass (15 tests: mailbox edges, a five-phase casualty grid, the
cold-store guarantee) ran first and PARKED two of its own finds as arbiter territory;
hamr released them in-turn (*"fix both then /code-review medium…"*), which fixed them and
launched an opus MEDIUM whole-branch review; that returned 6 MED + 9 LOW, and hamr's
second order (*"validate all errors and fix what passes"*) set the contract for the
closing batch: validate each finding before touching it, fix only what survives
validation. Every validated finding is fixed across `1a04193` / `c6bfb88` / `ff78314`;
full gate 505/505, typecheck clean.**

### The headline: a guard can carry the exact failure mode it exists to catch

Two of the three MED findings are the same shape, in the two instruments this branch
added to survive a frozen run — and neither was reachable by reading the feature they
guard. Only reading the GUARD as if it were the patient found them.

**The stall fuse could be disarmed by its own reissue (MED-2).** F66's fuse abandons a
hung call and silently reissues it, and its heartbeat is a completed round. But the
abandoned call is not dead — U run `ms3197n8`'s socket kept streaming for 274 minutes
after the fuse moved on — so every callback the corpse installed keeps firing. A late
beat from that zombie re-armed the watch that was timing its REPLACEMENT: the replacement
could then hang forever without ever tripping the fuse built to trip on exactly that.
One shared `Loop` made it worse, letting a corpse's round bound stop the live call. Fixed
by generation scoping (`src/stall.js`): the watch, the beat and the metering callback all
carry the generation of the call that issued them, `isCurrent(gen)` is the token that
tells a corpse's callback from the live one, and each issued call gets its own `Loop`.
Orphan rounds stay metered — an abandoned call may already have been billed (F44).

**The outside watchdog could kill a stranger, and could kill a live verdict (L7 +
MED-3).** F67's whole premise is that a guard sharing nothing with the run survives what
the run cannot. Its liveness probe was `kill(pid, 0)` — which answers "does SOME process
hold this pid", not "is my victim alive". After the SIGKILL/OOM case the watchdog exists
for, the kernel can recycle that pid onto an unrelated process and the guard would go on
to kill a stranger. Liveness is now the PARENT LINK (`process.ppid === pid`,
`scripts/u-watchdog.mjs:85`), which pid reuse cannot forge, and a guard aimed at a
non-parent REFUSES to arm at startup — loud, exit 2, no marker (`:64-66`) — rather than
running as a plausible-looking guard pointed at nothing. Separately, its stale-spine
window was sized below the longest LEGAL silence: `runStages` emits nothing between
stages, so a legal close can be quiet for `closeTimeoutMs × stages`, and the trigger could
have killed a run mid-verdict. Sized from the spec's own stage count plus a margin
(`scripts/run-u.mjs:123,128`). The watchdog's test fixtures were rewritten so the victim
spawns its OWN watchdog — the only fixture shape that exercises the real parent link.

### Three instruments reading a number that was not the one they meant

**The ledger counted every stall as a bareloop bug (MED-1).** `classifyIncidents` had no
branch for `step-stalled`, so the F66 fuse's own terminal fell through to "unclassified
escalation category" — real upstream evidence (BA-19's trail) filed as a fake defect of
ours. Routed through the same TYPED-LIB branch as `interpreter-red`
(`src/ledger.js:137-138`): the `lib` field is stamped at the throw site and the stall
accrues against the package that field names. Excluding the category instead would have
deleted the evidence outright.

**The spawner close floored on tests PASSED, not EXECUTED — the F40 class, again**
(`scripts/u-spawner-close.mjs`). A skipped or deselected test could hide a red without
ever pushing the passed-count under the floor, and only one summary bucket was read. The
floor now reads `executed = collected − (skipped + deselected)` and sums every red tally
on the summary line. Validated against the real patient (209 executed). The rule this
repo minted at F40 — *count tests EXECUTED, never tests PASSED* — held in the library's
close contract the whole time and was violated in a close script written later.

**The close-fix loop laundered casualties, then laundered a money cut (F11/F44, then
F45).** The step loop already restores an escalation's own category before returning; the
fix loop returned a flat `escalated`, so a `provider-red` raised there came back as a
capability read — and `run.js` keys the F44 `spendComplete:false` floor on the OUTCOME,
so the run reported an exact-looking total for a call that may never have billed back.
Found by the hardening pass, PARKED as verdict routing, fixed on hamr's word
(`1a04193`). The review then found the SECOND half in the same routine (MED-4): the shell
spells attempt-exhaustion and a money-gate halt with the same `cap-halt` category, so the
category alone cannot tell them apart and only the wallet can. The fix worker's gate is
built with the wallet at its most drained — every step's spend is behind it — which is
precisely where a money cut masquerades as "the fix failed". A drained wallet now returns
`cap-halt`, the resume-to-cap checkpoint; attempts spent with money still on the table
stays the designed `escalated` terminal (`src/planrun.js:1259-1279`). Reachability was
validated before the fix, not after: there is no money guard between the last step and
the close.

### Two promises the tool surface did not keep

**`ctx_remember` was write-only through the verb the worker holds.** The isolate strategy
line promises *"record a durable conclusion with `ctx_remember` so a later step can
`ctx_recall` it"* — and the recall handler hardcoded `kind: 'code'`, so no note ever came
back. The library-level round-trip test could not see it: it called `lc.recall` directly,
not the verb. Recall now queries the fact axis alongside code and returns each note
labeled `memory` with its BODY inline, capped at 400 chars — the body rides because a
note is a CONCLUSION, not a pointer, and no worker verb dereferences a memory id, so a
pointer-only reply would have been inert. **`ctx_impact` printed `calls
undefined:undefined` for every callee** (`src/tools.js:233`): litectx returns `defs` and
`callers` as objects with a path and a line, but `callees` as bare NAMES, and the readout
assumed the object shape uniformly. Found while validating something else.

### The fix that was refuted before it shipped (L8)

The review proposed renumbering `ctx_impact`'s line output to 1-based on the reasoning
that its numbers are display-only. Validated against a real index rather than read off the
source, and REFUTED: `impact`'s def range dereferences through `ctx_get` verbatim, and
`ctx_recall` prints the identical number for the identical chunk. They are ONE
interchangeable 0-based handle space, so renumbering one tool would have made two tools
print two numbers for one chunk and turned `ctx_get`'s clean chunk-boundary refusal into a
guessing game. The real defect — a worker cross-referencing an editor is off by one — is
closed by naming the space in all three tool contracts instead (`LINE_SPACE`,
`src/tools.js:112`), which is the choose-don't-describe move applied to a fact rather than
a menu. The proposed fix would have broken a working contract to document one.

### Also closed in the same batch

F68's parked async close runner, under hamr's blanket go: `runClose`/`runStages` await a
plain `spawn` instead of blocking on `spawnSync`, so a running close no longer freezes the
host event loop it reports to — BREAKING for adopters, byte-identical in every close
semantic, and recorded in F68's own resolution block rather than here.

### Lesson

**An instrument built to guard a failure mode can carry that failure mode itself.** The
fuse that exists because abandoned calls keep talking was disarmable by an abandoned call
talking; the watchdog that exists to survive a killed run could be aimed at a stranger by
the kill it survives, and could kill a live verdict during a silence its own subject makes
legally. Neither is reachable from the feature side — the guard has to be read as the
patient, with its own failure mode as the hypothesis. And the second lesson is the
contract hamr set for the batch: **validate before you fix**. Of the findings carried into
the closing pass, one proposed fix would have broken a working invariant, and it died to a
round-trip measurement against a real index — the same rule F43's tree-diff rework paid
for (a fix proposed from reading is a hypothesis, not a fix), holding a second time on a
change that read as obviously correct.

## F71 — the ~1-in-250 short close was the CHILD throwing its own bytes away: `process.exit()` discards queued stdout, and a clean EOF plus a real exit code is indistinguishable from a close that simply printed less

**Status: minted 2026-07-31 during the v0.6.0 release gate, from a flake named as a blocker
rather than merged around (*"gate evidence with unexplained noise is not clean enough to
merge on"*). Root-caused, measured, and fixed in `c330d24` for the test surface. The
PRODUCTION residual — every `scripts/` close still ends in `process.exit()` — is named
below and PARKED for hamr: the complete fix is arbiter territory.**

### The symptom

`tests/staged-run.test.js`'s staged-close fixture prints a fixed 31,890 bytes (600 filler
lines around the two markers `FAILED: a` and `FAILED: b`) and exits 1. About **1 run in 250
under CPU load**, it arrived SHORT: the capture ending mid-`mid filler line 137`, `FAILED: b`
never received, `[16004 chars truncated]` where the run before had said `[30000…]` — and the
verdict was still `needs_revision` with `exitCode: 1`, because the exit code was correct. The
observable damage is the F28 class arriving nondeterministically: **the gap loses its failure
names**, which is the one thing the gap exists to carry. Nothing anywhere reds. No fault, no
timeout, no `ENOBUFS`, no signal.

The prior session had chased this and stopped honestly, recording in the test's own comment
that it was *"unexplained, and reported as such rather than papered over"* — along with two
conclusions that turned out to be wrong (below).

### The mechanism

**A node process that ends with `process.exit()` drops whatever is still queued on its stdout
pipe.** The child asked for its own pending-write state on stderr (a different pipe)
immediately before exiting: a 300KB close answers **`pendingBytes=296413 finished=false`** on
its way out. Those bytes are never written. The parent then observes a clean `close` event, a
real exit code, and no error — the exact same observation it would make if the close had
simply printed less. There is no signal to route, so this could not have been caught by any
amount of fault handling on the reading side; the reader's only evidence is bytes that never
came.

The window opens whenever the reader is slow enough for the child's writes to queue: a stalled
reader, or — in the real case — CPU contention, which is the same thing without an artificial
stall.

### The measurements

Interleaved A/B on the real `runClose`, both spellings of the same fixture, same bytes, same
load, **no artificial stall** (CPU burners as the load):

| ending | runs | short | smallest capture |
|---|---|---|---|
| `process.exit(1)` | 500 | **7** | 14,070 of 31,890 |
| `process.exitCode = 1` | 500 | **0** | 31,890 (whole) |

Made deterministic by stalling the reader 50ms on its first chunk (N=12 per cell): the
`process.exit(1)` fixture goes short **12/12** through the `runClose` path and **11/12**
through a plain `spawn` + `on('data')` control, down to ~9,178 of 31,890 bytes, while the
`process.exitCode` twin loses **0/12** in the same conditions.

Bounds of the window, N=8 per cell, `process.exit()` throughout:

- **≥16KB of output plus a ≥50ms stall — 8/8 lost.**
- **≤5KB — 0/8 at every stall length**, including 300ms. Below the pipe's capacity there is
  nothing queued to drop.
- At 300KB behind a 50ms stall: 6/6 lost, 8,490 of 304,903 bytes captured.

Two controls that localize the defect to the CHILD rather than to any reader:

- **File-backed stdout is immune.** Same 300KB `process.exit()` child, same freeze: captured
  over a pipe **6/6 lost**, captured to a file via `stdio:[…, fd, fd]` **0/6 lost**.
- **The parent's accumulation code is not implicated.** 4,000 spawns across three parent-side
  arms (a control reader, the `spawnClose` copy, the copy without the stdin `end()`) with a
  CHEAP writer — `cat` of the same 31,890-byte file — lost **0**. Swap the writer for a node
  child that calls `process.exit()` and the same parents lose bytes immediately.
- `spawnSync`, whose reader cannot stall, loses **0/6** on a 32KB close and **1/6** on the
  300KB one. So F68's async close-runner rewrite **widened** this window; it did not open it.

### Two claims REFUTED — both were written into the tree as measured facts

1. ***"Only the `runClose` path loses bytes — a plain `spawn` + `on('data')` loop over the same
   fixture never loses a byte in 2,500 spawns."*** False: the plain-spawn control loses 11/12
   under a 50ms stall, against the copy's 12/12. The loss is the child's and belongs to
   neither path. The replication points at the confound: a harness of that shape reproduces
   the zero exactly (4,000 spawns, 0 short) when its writer is `cat` instead of a node child —
   i.e. the stall was real but **the dropping party had been substituted out of the
   experiment**. The variable was never exercised, so the test could not produce the positive.
2. ***"node's pipe writes are synchronous on Linux, so there is nothing pending to drop."***
   False, and refuted by the child itself: `process.stdout.writableLength` reads **296,413**
   immediately before `process.exit(1)`.

Both had been recorded as negative results in good faith. They are corrected in place, in the
same comment that carried them, with the numbers that refuted them — not deleted.

### What shipped (`c330d24`)

- **The fixture's `process.exitCode = 1` ending is now named as THE fix.** It was already in
  the tree, landed earlier as a *"free and strictly not-worse"* tidy on the reasoning that it
  *"removes the one documented way a child can drop buffered output"* — while the comment
  beside it explicitly declined to claim it fixed anything. It did. 0 short in 500+ interleaved
  runs under load, and 0 in 400 runs of the real fixture through the real `runClose` **inside
  `node --test`**, which is the context the flake was observed in.
- **A last-line PRECONDITION** in `tests/staged-run.test.js`: both the `gapKeep` and the bare
  gap must contain the stage's final line (`tail filler line 199`) before any `gapKeep`
  assertion is read. Writes are ordered, so the last line is present iff every byte arrived. A
  short arrival otherwise surfaces three assertions later as a confusing `gapKeep` failure —
  which is precisely how this cost a day.
- **A whole-capture guard** in `tests/ralph.test.js` pinning the half the RUNNER owns: 300KB of
  close output, host event loop frozen 300ms mid-stream, a child that exits cleanly is captured
  WHOLE (`SENTINEL-END` present). Mutation-checked — it kills a reader that caps its
  accumulation at 64KB, 4/4. It deliberately does **not** kill resolving on `exit` instead of
  `close`, nor a late-attached `data` listener: both were measured lossless in this shape, so
  neither is claimed.

### The residual, stated and PARKED

**Every production close script still ends in `process.exit()`** —
`scripts/u-litectx-close.mjs` and `scripts/u-spawner-close.mjs` both exit that way from their
`done`/`stop` helpers and from their final fall-through. They are safe **today** for one
reason only: they self-cap the gap at `GAP_LINE_CAP = 40` lines, a few KB, inside the
measured-immune ≤5KB band. Nothing ENFORCES that relationship. Raise the cap, add a stage that
prints before the cap applies, or borrow one of these scripts as a template for a chattier
close, and the run walks into the window silently — the loss is nondeterministic, preserves
the exit code and therefore the verdict, and is invisible in every artifact the run leaves
behind.

The complete fix is not a bigger cap or a discipline note: it is to stop capturing close output
over a pipe at all — write it to a temp file and read it after the child exits, the one
configuration measured immune (0/6 where the pipe lost 6/6). That changes how the arbiter runs
a close. **Named, scoped, PARKED for hamr's explicit go.**

### Lesson

**A clean EOF and a correct exit code are not evidence that the output is complete.** Every
signal the runner had said the close finished normally; the only witness to the loss was inside
the process that caused it, and it had to be asked directly (`writableLength`, on a different
pipe, in the microsecond before exit). When an instrument's own success indicators cannot
distinguish two outcomes, ask the other side of the boundary rather than reading the same
indicators harder.

And the second, which is F45's blind-instrument rule wearing new clothes: **a negative result
recorded as a measured fact freezes into doctrine.** *"Measured, `process.exit()` truncates
NOTHING here"* sat in the tree as a comment with a run count attached, and it was wrong because
the harness that produced it had substituted a `cat` for the node child that was doing the
dropping — the stall was faithfully reproduced, the party under test was not. The rule that
catches it is the pre-flight one this repo already has: **could this test have produced the
positive?** A control that swaps out the suspected mechanism is not a control.

---

## F72 — a machine SUSPEND freezes every guard including the outside watchdog, and from inside the artifacts it is indistinguishable from an event-loop freeze

**Status: minted 2026-08-01 from the reuse execution probe's second launch (spine
`reuse-exec-ms9lwtuf.jsonl`, litectx-u). No product defect fired and none is claimed: the run
was healthy when the machine went to sleep under it. The OPERATIONAL fix is already in use (a
sleep inhibitor around probe launches). The DESIGN remedies are named below and PARKED
per-piece for hamr's rulings. One reading produced by this event was reported and then
WITHDRAWN — it is recorded here as the assistant's own instrument error.**

### What happened

The launch was 12.2 minutes into a healthy run: a 2-step plan accepted, **step 1 green in
2m21s**, step 2 walking its typecheck gap **61 → 20 strict errors** across two iterations, 68
rounds, $1.6308 spent. Then the machine idle-suspended.

| when (UTC) | event |
|---|---|
| 00:14:06.074 | last spine event — `worker-round`, seq 108 |
| **00:14:12** | journal: `systemd-logind: The system will suspend now!` (02:14:12 local) |
| 00:14:13 | journal: `user.slice: Unit now frozen` — everything the operator's session owns |
| 00:14:13.246 | the 1s lag sampler's last tick |
| 07:45:56.364 | thaw (journal: *"slept 7h31m42s"*); lag record `blockedMs: 27,103,118` |
| 07:45:56.368 | the F67 watchdog's kill record — reason `stale`, `coldMs 27,108,007` vs its `staleMs 4,200,000` |
| 07:45:56.370 | the buffered provider response completes — **6 ms** after the first post-thaw tick |
| 07:45:56.372 | `wall-bounded`: `elapsedMs 27,841,506` against `requestedMs 2,700,000` |

**The suspend request lands six seconds after the last spine event.** Nothing was wrong with
the run.

### Every guard shares the freeze — including the one built NOT to

F67's lesson was that a guard inside the process shares that process's fate, and the answer
was a separate process. A suspend takes the whole `user.slice`, so the separate process is
frozen too — the watchdog is spawned by the run and lives in the same `session-7.scope`,
`frozen-by-parent`.

| guard | why it could not fire |
|---|---|
| F66 stall fuse (`src/stall.js`) | armed around the pending call, but a `setTimeout` — node timers run off a monotonic clock that does not accrue across suspend, and the event loop is frozen regardless |
| BA-18 idle timeout | a `req.setTimeout` inside the same frozen process |
| in-process wall-clock consult sites | read where a round completes and after a step returns — neither happened |
| the 1s lag sampler | frozen; it recorded the gap only in retrospect, and it decides nothing |
| **the F67 outside watchdog** | separate process, **same frozen `user.slice`** |

On thaw all of them resumed at once and the outcome was over-determined: `src/clock.js` — the
run's only clock, and a **realtime** one (`now = () => Date.now()`) — stamped **expired**, and
the watchdog killed on its **first thaw poll**.

### Two instrument lessons

**(a) Two clocks in two timezones is the blind-instrument class wearing a new coat.** The
journal prints **local** (CEST, UTC+2); the spine prints **UTC**. Reading a journal suspend
line as if it were UTC put the freeze **87 minutes after** the last spine event and produced
the reported claim *"87 awake minutes with no guard firing"* — which would have been a real
and serious product defect. It was **WITHDRAWN**: the line being read was an **earlier,
unrelated** suspend at 01:41:45 local, and the run's actual freeze is six seconds after its
last event. The offsets reconcile exactly; nothing about the guards failed.

**(b) Without the journal, this run's artifacts are byte-indistinguishable from a genuine
event-loop freeze.** A frozen loop and a frozen machine leave the same spine: last event, long
silence, wall past its cap, a watchdog kill on the stale trigger. **No in-process instrument
can tell the operator which occurred** — the evidence that separates them lives outside the
process, in the system journal.

### Root cause

- **Nothing anywhere takes a sleep inhibitor.** `grep systemd-inhibit` over the repo returns
  **zero call sites**: a multi-hour paid run is launched with no claim on the machine staying
  awake.
- **Nothing detects RESUME.** The divergence is measurable with what already exists — the 1s
  lag sampler is exactly the instrument that sees a realtime jump a monotonic timer did not
  accrue — but nothing reads it, and no run says "I was suspended" rather than "I went quiet".

### Fixes

**Operational, already in use:** probe launches are wrapped in
`systemd-inhibit --what=sleep:idle` (block mode, held for the duration — verified). The green
relaunch ran under it.

**Design, PARKED per-piece for hamr's rulings:**

- **A — a liveness contract.** What a run is entitled to assume about the machine under it,
  and what it must assert before spending.
- **B — a kill-checks-before-kill taxonomy.** *Extends W-3* ("the kill from outside should
  check for activity/bytes or other markers for activity, not a silent kill"): a resume marker
  is another such check, and it distinguishes a dead run from a suspended one before the
  signal goes out.
- **C — resume-after-kill.** The **PRD v1.22 named gap**, still open: *within-run resume from a
  transport-hit plan — the plan-as-executed spine already holds the checkpoint; not yet wired.*
- **D — unpark BA-19's `deadlineMs`.** Delivered in bare-agent 0.35.0 and **parked at that
  consume** (the F66 fuse already self-heals the class above it).

### Also recorded: the remembered taxonomy is not bare-agent's

Checked at the source rather than from memory. **bare-agent's `circuit-breaker.js` is a plain
3-state breaker** (`closed`/`open`/`half-open`, per-key failure count, `threshold 5` /
`resetAfter 60s`) with **no error categories** at all, and **`checkpoint.js` is HITL tool
approval** (a tool-name list, `send`/`waitForReply`, 5-minute auto-deny) — **not resume**. The
categorised-recovery taxonomy that was remembered is **aurora's**
(`packages/spawner/src/aurora_spawner/{circuit_breaker,recovery,timeout_policy}.py`), and the
true **resume** precedent in this programme's own history is **adaptlearn's `--resume`
world-replay** (hash-verified ledger replay; it completed a cohort across a provider outage
without re-spending, 48 rows replayed free).

### Lesson

**A guard's isolation is only as strong as the boundary it is isolated across.** F67 moved the
guard out of the process; this event moved the failure out of the process too, to a scope that
contains both. The general rule the two of them make: **name the scope your guard shares with
the thing it guards** — event loop, process, session slice, machine, host — because a failure
at or above that scope takes them together, and the artifacts it leaves will look exactly like
the failure the guard was built to catch.

## F73 — the first end-to-end REUSE run: the same-repo bridge burned $4.74 without reaching the close, the CROSS-LANGUAGE one greened in 14.7 minutes, and the cost read is confounded by a shared workdir

**Status: minted 2026-08-02 from the first paid run of the whole reuse path (spine
`bareloop-patients/litectx-u-bareloop/reuse-msarycnt.jsonl`, patient litectx-u, 2026-08-01
19:38:49 → 20:21:01 UTC, 42.2 min, $6.1467, `spendComplete: true`). The MACHINERY read is
positive and n=1. The COST read is not made: the run does not show reuse being cheaper, and
the one comparison that would be flattering is confounded by construction. Both halves are
stated below at the confidence the artifacts support.**

### The envelope, as actually signed

`reuse-start`: `perTryBudgetUsd 10`, `perTryWallMs 2,700,000` (45 min), `bridgeTries 2`,
`pinned null`, `shortlist null`, `forceCold false`. D7's shape exactly; the numbers are the
operator's, larger than the design record's illustrative `$5 / 30 min / ×2`. This run predates
the try-count fold (F74's sibling change, `f44526e`) — its `reuse-start` carries no
`approvalHash`; the resume run the next day does.

### Try 1 — the "direct match", and it never reached the close

The selector was called with both candidates and chose `litectx-u-types`, verbatim reason:
*"It targets the exact same goal—making litectx pass tsc --strict without weakening
tests—so it's a direct match, not just a same-kind analog."* It loaded version `ms5uxhej`
(2 versions on the entry).

| | |
|---|---|
| plan drafted from the bridge | 3 steps (`fix-index-js-strict`, `fix-remaining-src-strict`, `verify-strict-typecheck`) |
| first stop | `cap-halt`, `capRuns 3`, 3 × `needs_revision` |
| replan (D5's one ceiling, used once) | collapsed to a single step `finish-strict-typecheck` |
| second stop | `cap-halt`, `capRuns 3` again → `job-end {outcome: step-red}` |
| spend / rounds / wall | **$4.7442 · 222 rounds · 1,646,425 ms (27.4 min)** |
| `closeReached` | **false** |
| `capBound` / `wallBound` | **false / false** |

**The envelope was not the binding constraint** — $4.74 of $10, 27.4 min of 45. What bound was
the plan's own attempt ladder, twice. `verdictClass: casualty` (only `escalated` demotes), so
the bridge took a history row — `outcome "step-red:finish-strict-typecheck"`, cost, wall and
rounds all recorded — and **no demotion mark**. That row was read back the next day: the
resume run's selector cited it verbatim (*"despite its last run ending red"*) and picked the
bridge anyway.

### Try 2 — the cross-language analog, and it greened

Fallthrough was automatic (pre-authorized by the envelope, D7). The selector, now offered only
`aurora-u-spawner-types`, chose it: *"Both tasks are the same kind of work—making a package
pass a strict static type-checker without weakening its tests—so the workflow's approach
transfers despite the language/tool difference."*

**The carry is real and it is cross-language.** The loaded version (`ms7flkok`) is a 2-step
**Python / mypy** plan whose steps target
`packages/spawner/src/aurora_spawner/spawner.py` and the rest of that package. The plan the
drafter produced from it is a 2-step **JS / tsc** plan targeting `src/impact.js` (`fmtOf`'s
`@returns {string}` vs a `null` return) and `src/tsalias.js` (`loadTsPaths`'s TS2339/TS7006),
same tools, same `tree-changed` + `check-passes` exit shape. It passed the ordinary
`validatePlan` — no second, looser path (D4).

Close: `changed-from-seed` ✓, `typecheck` ✓, `suite-green` ✓, **`no-suppressions` red** (9 casts
added). The outer fix loop fired (`gapBytes 1572`) and converted across three iterations
(`typecheck` red → `no-suppressions` red → `typecheck` red → green). **$1.3971 · 52 rounds ·
879,179 ms (14.65 min)**, `job-end green`, `spendComplete true`.

`reuse-end`: `outcome green`, `triesUsed 2 / triesAuthorized 2`, `spentUsd 6.1467`,
`bridgeWrites ["appendCasualty litectx-u-types", "appendGreen aurora-u-spawner-types"]`.
Selection cost $0.0054 across both calls, accounted to the RUN and never to a try.

### The first PROVEN bridge

Verified against the live registry rather than asserted: `deriveStatus` over
`bridges/aurora-u-spawner-types.json` now reads **`proven`** — greens on `aurora-u` ×3 and
`litectx-u` ×1, two distinct patients under one close shape. `litectx-u-types` reads
`candidate` (2 greens, both `litectx-u`). This is the programme's first proven entry, and it
was minted by a green on a patient the recipe had never seen.

### The cost read, and why it is NOT made

| run | spend | rounds | wall |
|---|---|---|---|
| cold green `u-ms3wawub` (litectx-u) | $5.7655 | 176 | 37.0 min |
| cold green `u-ms5uxhej` (litectx-u) | $4.2942 | 132 | 23.9 min |
| **reuse run `msarycnt`, whole** | **$6.1467** | 274 | 42.2 min |

The reuse run cost **more than both cold greens**, in money and in time. **No lift is claimed
and none is visible at n=1.**

And the flattering comparison — "try 2 greened for $1.40 against a $4.29 cold baseline" — is
**not available**, because the two tries shared a tree. `scripts/run-reuse.mjs` states it in
its own header (*"The patient is NOT reset… Every try runs in the same workdir"*), by design:
the reset is operator-performed so a half-solved tree is a stop the operator sees rather than
a state the harness erased. Try 2 therefore started on the tree try 1 left after $4.74 of
edits, and **its own close proves the inheritance**: after two surgical edits the `typecheck`
and `suite-green` stages were already satisfied, and the `no-suppressions` red named casts in
`src/docparse.js` and `src/store.js` — **files try 2 never targeted**. Try 2's $1.40 is the
cost of finishing try 1's work, not of solving the job.

### What IS readable, unconfounded, at n=1

The path ran end to end with no human in it: selection called and answered twice; the D2-split
load gate admitted a cross-patient, cross-language bridge at the door; the drafter re-aimed
yesterday's bricks unaided and the tweaked plan cleared the same validator as any cold draft;
the one-replan ceiling held; R1 wrote after every try (casualty then green); the envelope's
fallthrough fired without nagging; and the first `proven` status was earned.

**One observation recorded without a rule attached:** the selector's stated reason was a poor
predictor. It called the same-repo, same-goal, same-close entry a *"direct match"* and that try
spent $4.74 without reaching the close; it called the cross-language entry a *"same-kind
analog"* and that one greened. n=1, two picks, nothing minted — logged because this is exactly
the axis an auto-matcher would be built on, and D2 deliberately did not build one.

### Lesson

**A rung's first paid run validates the machinery; it does not price it.** Reading cost off a
run whose tries share a workdir measures continuation, not replication — and the honest move is
to say so rather than quote the $1.40. The next cost comparison has to be whole-run against
whole-cold-run, or reset the patient between tries; try-against-cold is structurally
unreadable.

## F74 — the false-proven hazard, and it had TWO doors: two spellings of one patient, and two closes under one name

**Status: minted 2026-08-02. Door (i) was found by auditing the LIVE registry after F73's run
and fixed in `bd04ade`; door (ii) was found by whole-branch review of code written the same day
and fixed in `33b104e`. Neither is a bug in `deriveStatus`, which is correct and was never
touched. Both feed it a lie.**

### The claim being protected

D6: **PROVEN = greens on ≥2 DISTINCT PATIENTS under one close shape.** `deriveStatus`
(`src/bridges.js:80–98`) implements exactly that — it counts distinct `patient` STRINGS on
rows whose `outcome` is `green`, and an unattributable green (no patient string) is skipped
because it cannot prove a second instance. `proven` is the only credential in the system that
licenses "this recipe travels", so it is the only one worth faking.

### Door (i) — two registry writers, two spellings of one physical patient

| writer | wrote | example |
|---|---|---|
| `scripts/consolidate-bridges.mjs` | the SPINE dir name | `litectx-u-bareloop` |
| `scripts/run-reuse.mjs` | the PATIENT workdir basename | `litectx-u` |

The seed data came from consolidation; the live path writes the other spelling. On the live
registry that meant `litectx-u-types` held two greens spelled `litectx-u-bareloop` and — from
F73's try 1 — one row spelled `litectx-u`. **That row happened to be a red.** One green under
the second spelling and D6 would have minted `proven` on a bridge that had never left its own
patient: a set of size 2 built from one machine.

**Fix (`bd04ade`).** The canonical slug is the patient workdir basename (hamr's call), and
consolidation now DERIVES it from `run-u.mjs`'s `<patient>-bareloop` spine-dir convention and
**refuses a directory that does not carry it** rather than guessing — guessing is how the
second spelling got in. `scripts/migrate-bridge-patient-slugs.mjs` repairs the rows already on
disk: dry-run first, idempotent, every write through `saveBridge` (validate, then temp+rename,
so a concurrent read sees the old entry or the new one and never a half-written file), and it
migrates **both** the history rows and the version rows because both carry `patient`. It
refuses rather than half-fixes in three cases — a slug that would strip to the empty string, an
entry its own validator rejects, and a `name` that disagrees with the filename. Applied to the
live registry: **aurora stays genuinely proven (`aurora-u` + `litectx-u`), litectx collapses
two spellings to one.** Three tests TDD, including a direct `deriveStatus` false-proven repro.

### Door (ii) — a cold green appended across two different close shapes

The cold leg's green looked up the entry holding the job's NAME and appended to it. But the
name is the job's slug, and **a job's CLOSE can be re-signed under that same slug.** Appending
across two close shapes does two wrong things at once: it counts a green that ANOTHER close
rendered toward this entry's distinct-patient status, and it hands the load gate — which
matches on exactly those stage names — a plan that satisfied a different verification.

**Fix (`33b104e`).** `sameCloseShape` mirrors `loadGate` rule 2 (the close-stage names, in
order) as ONE predicate shared with the gate rather than spelled a second time — a cold green
appending to an entry the gate would refuse at the door is the two-transforms class pointed at
the registry. A mismatch **neither appends nor discards**: it forks to a deterministic
`<job>-<sha256(stages)[0:8]>`, with `shapeForked` / `forkedFrom` / `closeStageNames` on the
write record, so the same close always lands in the same file and the next green of that shape
appends there instead of minting a third entry. A derived name already held by a
differently-shaped entry is refused (`shape-fork-collision`), not appended blind.

**One reviewer suggestion was refuted before it shipped:** the proposed `~` separator for the
fork name would have been rejected by the registry's own `SLUG_RE`
(`^[a-z0-9][a-z0-9-]*$`) at `validateBridge`, and the green would have been **lost** — which is
precisely the failure the fork exists to prevent. A hyphen was used instead.

### What the two share

Both let an undisciplined source feed a derived credential: one by letting the PATIENT be
spelled two ways, the other by letting the CLOSE be two different closes. And both fixes hold
the same line in the same direction — **neither ever throws a green away.** The migration
refuses a file it cannot rewrite honestly; the shape fork files the green under a derived name.

### Lesson

**A derived status is only as honest as the discipline feeding its inputs — and the moment two
code paths can write the same field, they will eventually disagree.** The fix is not to teach
the reader to tolerate both spellings; it is to make ONE writer's spelling the only spelling
and to hold both writers to the SAME predicate the gate already uses. The disagreement's
symptom is worse than a wrong number: it is a credential the system never earned.

## F75 — an outside stop SIGKILLs the whole process group, and no in-process guard can ever see it coming: the only recovery is resume

**Status: minted 2026-08-02 from the live paid resume validation (spine
`bareloop-patients/litectx-u-bareloop/reuse-msc6w93z.jsonl`, patient litectx-u, three legs,
three external stops). No product defect fired and none is claimed: every guard behaved
correctly, and none of them was in a position to matter.**

### Three legs, three stops

| leg | pid | window (UTC) | rounds | spend | where the spine stops |
|---|---|---|---|---|---|
| 1 | 1078039 | 19:24:52 → 19:28:17.951 (3m 26s) | 17 | $0.3639 | 21 s into step `fix-index-js-strict` |
| 2 | 1080307 | 19:29:07 → 20:05:09.995 (36m 3s) | 216 | **$7.8194** | close-fix-loop **iteration 4**, right after a `middle-done` |
| 3 | 1090576 | 20:12:57 → 20:15:47.529 (2m 50s) | 9 | $0.4035 | at the draft's `materials`, seconds after the scout returned |

**No leg emitted a terminal.** No `job-end`, no `wall-halt`, no `cap-halt`, no escalation — the
spine simply stops mid-stream and the next `runner-start` appears. And **no
`reuse-msc6w93z.jsonl.watchdog.json` was ever written**: the F67 outside watchdog did not fire
on any of the three. Every stop came from outside the run's entire guard set.

### Why no in-process guard can cover this

F72's rule was *name the scope your guard shares with the thing it guards.* A stop issued
through the session harness is issued **at the process group** — the scope that contains the
runner, its close children, the watchdog the runner spawns, and the `systemd-inhibit` wrapper
the operator wraps around all of them (`scripts/run-reuse.mjs` deliberately does not shell out
to the inhibitor itself: *"a harness that grabs a system lock nobody asked for is the wrong
side of the line"*). W-3's report-before-kill, extended in `4278ad6`, is a property of **our**
watchdog's kills and covers only those. There is no handler that survives `SIGKILL` and no
deadline that fires on a stop nobody scheduled.

**Operator-console evidence, recorded here because it is the only place the distinction is
visible and it is NOT in the spine:** leg 1's kill left the `systemd-inhibit` wrapper alive to
print *"terminated by signal KILL"*; leg 2's stop took the wrapper with it and printed no such
line, and the session harness labelled leg 1 *failed* and leg 2 *stopped*. The difference is in
what the stopper reached, not in what the run did — the run's own artifacts are identical in
both cases.

### So the design answer is recovery, and the money says why

Leg 2 alone did **36 real minutes and $7.82** of work, and had all three plan steps green with
the close already in its fix loop when it was stopped. Without resume that is $7.82 thrown
away for nothing the operator changed.

**The fold is exact, and the artifacts prove it rather than assert it.** Leg 3's `resume-start`
declares `priorSpentUsd 8.1833219` — which is leg 1's $0.3638755 plus leg 2's $7.8194464, to
the last digit — and `priorWallMs 2,359,393`, which is 196,501 + 2,162,892: the two legs' own
windows, with the 7m 47s **dead gap between them excluded**. `remainingCapUsd 1.8166781` and
`remainingWallMs 340,606` are the signed $10 / 45 min minus exactly that. A kill therefore
cannot widen the signed worst case one kill at a time.

Also verified live on the record: both resumes carry `approvalHash 6bb0cadd…` matched against
the dead run's own `reuse-start` (a resume continues ONE signed run, never any run), and the
liveness gate refuses to resume while a `runner-start` pid is still alive.

### Lesson

**A guard bounds what the run does; it cannot bound what is done TO the run.** Above the scope
your guard shares with the process, prevention is not on the menu — the only design that pays
is one that makes the interruption cheap, and "cheap" is measured in what the next launch has
to buy again. That measurement is F76.

## F76 — resume at TRY granularity re-buys work the run already owns: $0.25 then $0.40 of scout re-paid, and the third leg could not have finished

**Status: minted 2026-08-02 from the same three-leg run as F75. The build was CORRECT against
the ruling it was given and WRONG against the purpose of that ruling, and only a paid run
showed the difference. hamr's correction supersedes; the step-level reader is in build.**

### What was built, and from which words

hamr's checkpoint ruling, verbatim, as implemented in `c04cdcf`:

> *"money, signature and checkpoint (starts from where it stopped) if mid loop, restart that
> loop"*

Read as the **TRY** loop: a `try-start` with no `try-end` was never graded, so it was never
consumed — it restarts **from its beginning**, under the remainder of its signed per-try
numbers. Scout again, draft again, every finished step again.

### What that cost, measured

| leg | scout + draft re-paid | rounds |
|---|---|---|
| 1 (original) | $0.1713 | 10 |
| 2 (first resume) | **$0.2504** | 10 |
| 3 (second resume) | **$0.4035** | 9 — scout only; killed before the draft returned |

The re-paid scout is the visible half. **The re-executed steps are the larger half.** Leg 2's
restart at step 1 was fair — leg 1 had been in step 1 for 21 seconds. Leg 3's was not: leg 2
had left three green steps and a graded close on disk, and leg 3 restarted at the scout
anyway. It opened with **$1.8167 and 5m 41s** of signed remainder, spent **$0.4035 and 2m 50s**
just reaching the draft, and had $1.4132 and 2m 50s left to redo three steps that had just
cost $7.82. **It could not have finished, and the granularity guaranteed it.**

### hamr's correction, verbatim

> *"even if it gets killed by outside, it should allow resume and start last step instead from
> the beginning, why would i want to waste more money on something i already started, our goal
> is to find ways to save money and time"*

### v2 — the finest checkpoint the spine can PROVE

A **completed step's exit** is the finest honest checkpoint, because it is the only unit whose
state is provable from the record and present on disk. Three readings, each grounded in one
event the executor already emits: no `plan-accepted` in the window → no seed (the kill landed
in the scout or the draft, nothing durable exists); `plan-accepted` with no `outer-close` after
it → `phase: 'steps'` against the LAST accepted plan (a replan emits its own, and it is the
post-replan plan that was executing); `outer-close` after it → `phase: 'close'`, and the close
re-runs for no tokens because it is a command over the tree.

**Completion is `step-end{outcome:'green'}` OR `step-skipped`** — the second is not a detail. A
resumed leg records its inherited steps as skips, so a reader counting only `step-end` would
make every resume-of-a-resume re-buy exactly the work the previous resume correctly skipped.

**What is NOT a checkpoint, stated so it is never assumed:** a half-executed step (no provable
state) and a worker transcript (not state at all). And a green under a plan the run later
replanned away is deliberately not counted — the executor resets its own index at a replan, so
those greens belong to a plan nobody is executing.

**The try-restart is not deleted.** It remains the correct answer for exactly one case — death
before a plan was accepted, which is legs 1 and 3 of this very run.

### Limits carried on the record, not discovered later

A call killed **before it returned** left no `worker-round`, so money it may already have been
billed for is not on the spine and cannot be folded — the fold is a floor in exactly the case
`spendComplete: false` already marks (F6). And a `plan-accepted` whose plan is unreadable
yields **no seed** rather than a half plan: steps skipped by index against a plan nobody
validated is worse than paying again.

### Lesson

**"Resume from where it stopped" is a granularity question before it is a mechanism question,
and the answer is never the coarsest unit that is easy to reconstruct — it is the finest unit
the run can PROVE it finished.** Coarser than that and the operator pays twice for work already
on disk; finer than that and the resume is guessing. This one was only visible because the
resume path was validated with real money on a real kill: a scripted resume would have restored
the same state for free and read as a pass.

### Addendum — 2026-08-03: the named live-unvalidated remainder is CLOSED — paid step-resume fired and greened, audited

Leg 4 of `reuse-msc6w93z` (setsid-detached, inhibitor held, launched before the session
pause) closed the loop C v2 left open:

- **The resume seeded exactly as designed.** `try-start{n:1}` carried
  `resumedAt:{phase:'close', stepsDone:3, stepsPlanned:3}` with
  `priorSpentUsd:8.5868288` / `priorWallMs:2529760` folded in; all three steps recorded
  `step-skipped{provenBy:'step-end', provenSeq:115/160/274}` — the $8.59 the dead legs paid
  was inherited, not re-bought.
- **The fold made the wall honest.** Try 1's remainder ran the $0 close-fix path until the
  FOLDED clock crossed the cap: `wall-halt` at `elapsedMs:2712026` vs `wallCapMs:2700000`,
  `wallBound:true`, `cutMidCall:false` — the whole-try clock, not the leg's own 20 minutes.
- **The ladder then did its job.** Try 2 rolled to the `aurora-u-spawner-types` bridge with
  a fresh $10: one step cap-halted → replan → two greens → **run GREEN at $4.0762 / 20.0min
  / 113 rounds**, `spendComplete:true`. All four close stages re-run independently on the
  as-left tree by the operator: **exit 0, 0, 0, 0**; winning diff preserved
  (`reuse-msc6w93z.patch`, 10 files +319/−65, HEAD still at seed `96813a4`).
- **R1 wrote both truths:** `appendCasualty` on the litectx bridge (try 1's wall-halt),
  `appendGreen` on the aurora bridge — the aurora bridge's third green, second cross-patient.

Total msc6w93z spend across all four legs: **$12.67, spendComplete:true**. The known
cosmetic (`failingStage:"no-suppressions"` on a GREEN try row) reproduced on try 2's
try-end and stays on the tail-review list.

One operational defect found by the leg-4 launch itself, filed here so it is never
repeated: the detached launch passed the API key as `env ANTHROPIC_API_KEY=$(pass ...)`
**argv**, which exposes the key in `/proc` cmdline (and it landed in a process listing
this session). The pattern is corrected to a shell env-assignment prefix
(`ANTHROPIC_API_KEY="$(pass ...)" setsid ...`), which inherits through the environment and
never touches argv; the exposed key is flagged to hamr for rotation.

## F77 — the step loop's fixed count was a SILENT SECOND CEILING: two calibrations died still converging, with money and wall unspent, and the one lever the plan owned could only tighten it

**Status: minted 2026-08-03 from the lift-contrast admission screen's own casualties. This is
the F37/16g class shipping again — an advertised cap (money, wall) overridden by a lower,
unadvertised one — this time in the SHELL's own step loop rather than in a provider default.
Fixed the same day (F79); the fix's live validation is named there, not claimed here.**

### The bound, and what it could not see

A plan step's micro-loop ran `while exits red and iteration <= capRuns` — `capRuns` = 4 in
both operator runners (`run-u.mjs`, `run-reuse.mjs`), 3 by library default. The count is
blind to the only question that matters at the fourth red iteration: **is this step making
progress?** It stopped a converging step and a thrashing step at exactly the same place.

| run · patient · genre | in-scope error trajectory | how it ended | what the envelope still held |
|---|---|---|---|
| `u-msd916dh` · bareagent-u · TYPES | **30 → 22 → 17 → 11** | `step-red` at `strict-fix-recurse`; ladder exhausted 3/3, replan, then 2/2; close never judged | **$1.30 of $4 and ~6 of 25 min unspent** (`$2.7020 / 18.7 min / 82 rounds`) |
| `u-mscxuziw` · baremobile-u · TYPES | **13 → 1** in scope, then 3 errors leaked OUTSIDE the scope (the close's anti-gaming ceiling correctly caught that), then byte-identical non-writes after the replan | `step-red` at `fix-errors-js-types`; close never judged | **money and wall unbound** (`$0.8313 / 11.1 min` of $4 / 25 min) |

The two rows are opposite failures under one bound: the first was **still shrinking its own
error count** when the count cut it; the second was **repeating itself and writing nothing**
and had been finished for iterations. A number cannot tell them apart, so it treated them
identically. F73's try 1 is the same shape a patient earlier (`cap-halt`, `capRuns 3`, twice,
with **$4.74 of $10 and 27.4 of 45 min** unspent) — three runs, three patients, one ceiling.

### The correct heal was INEXPRESSIBLE

The plan's only iteration lever, `steps[].attempts`, was validated `1..capRuns` — **TIGHTEN
only**. A step that needed a sixth iteration could not ask for one; the sole legal direction
was down, and drafters measurably took it: `u-msd916dh`'s accepted plans carry
`attempts [3, 3]` and then `[2, 2]` on the replan. The agent was handed a knob that could
only make the defect worse, which is the palette-inertness class (F69) inverted — not an
unused verb, an actively harmful one.

### The replan brief was mechanism-blind

The exhaustion sentence handed to the redrafting planner read, in full: *"It ran N attempts
and its exits were still red."* That describes the bound, names no mechanism, and is
identical for the converging step and the stalled one — so the planner, the ONE component
whose whole job is to respond to the stop, could not tell which of two opposite fixes it
needed. F28's rule (a bound that buries the failure defeats the arbiter) applied to the
replan channel, unnoticed until now.

### The defect INVERTED the experiment that found it

Both rows above are lift-contrast **calibration** runs, judged against the frozen
`must-GREEN` admission clause (`docs/02-experiments/REUSE-LIFT-CONTRAST-PREREG.md`, calibration
addenda). Both were REJECTED. Neither was rejected for being too hard: both were rejected
because the harness stopped them while the envelope still had money and time, and in one case
while the error count was falling on every iteration. **The screen was measuring the workflow's
own ceiling and reporting it as patient hardness** — two of three candidates burned
($7.6557 of the $40 programme cap at that point) selecting AGAINST the jobs the product exists
to do. A dense job is exactly where a fixed count binds first, which is hamr's read, verbatim:

> *"if workflow fails in dense jobs then it failed at planning and self healing. why not fix
> that?"*

### Lesson

**A count is not a bound on the thing you care about — it is a bound on a proxy, and the
proxy fails precisely where the work is hardest.** Every prior appearance of this class was a
cap under a cap (rounds under money, the 4096-token default under `maxTokens`); this one was a
cap under an EXPERIMENT, and it corrupted the experiment's admissions before it corrupted any
run. When a screening instrument starts rejecting candidates, audit the harness before
believing the candidates were bad — the F45 rule (a money cut is a casualty, not evidence)
generalizes to iterations.

## F78 — the $0 strike replay: 110 archived step ladders say the progress rule continues every converging red, ends thrash same-or-earlier, and kills exactly one green

**Status: minted 2026-08-03. The instrument is a $0 archival replay of the proposed rule
against every step ladder in the spine archive, run BEFORE the build, on hamr's order
(*"sticky strikes, run the $0 replay"*). It is decision evidence, not outcome evidence — the
limit is stated at the bottom rather than discovered later.**

### The corpus and the method

190 spine files in the archive; **34 are plan-flow runs**; those hold **110 step ladders**
(**77 that ended green, 33 that ran out of iterations**). Each ladder was replayed by
re-reading its own recorded gaps and its own gate-audit write records under the candidate
rule — a strike is a red iteration that REPEATS an already-seen normalized gap or made no
write-class records — and asking where that rule would have stopped, versus where the count
did.

### What the replay said

| question | answer |
|---|---|
| would a converging red be cut earlier? | **no — every converging red continues**, including both lift-contrast rejects (F77): under the rule they keep iterating on the money and wall they had left |
| does thrash end sooner? | **same or one iteration earlier** — ~15 ladders save exactly one iteration at limit 2; nothing runs longer |
| does last-gap comparison suffice? | **no.** Exactly one real **A→B→A oscillator** exists in the archive. A last-only comparison reads its third iteration as progress; only a SEEN-SET catches it |
| would any green have died? | **exactly one.** A worker idle for three paid iterations with its checks otherwise passing — autopsied and classed **benign**: three iterations bought nothing and the strike would have ended a step that was already not working |

### The threshold sweep — 2 is the knee, and it was hamr's number BEFORE it was measured

| limit | effect on the archive |
|---|---|
| **1** | **kills 4 archive greens** — one bad iteration inside an otherwise working step ends it |
| **2** | the knee: 1 green killed (benign, above), ~15 thrash ladders end one iteration earlier |
| **3** | **stops almost nothing early** — 2 ladders versus 15 at limit 2; the rule is nearly inert |

hamr set 2 and the sweep then landed on 2 independently. Recorded in that order because the
order matters: the number is arbiter territory (a threshold is never picked by the agent from
a small observed sample), and the measurement is corroboration, not authorship.

### What this replay CANNOT read — stated, not discovered

It proves the rule's **decisions against history**: which ladders it continues, which it
ends, and how much earlier. It cannot prove that a step it continues then GREENS — no replay
can, because the iterations it grants were never executed. **Only a live run proves a green.**
The named live validation is the bareagent-u recalibration `u-msdonzxl` — the exact defect
shape from F77, re-run on the fixed code under the same signed hash and envelope — in flight
at the time of writing, and its outcome belongs on this finding, not to it in advance.

Scope: step ladders only. The close-fix loop was deliberately excluded from the replay and
therefore from the change (F79) — its gaps are close-verdict gaps, a different population,
and it needs its own replay before its own rule.

## F79 — the progress-governed step ladder: strikes replace the count, and the replan brief finally names the mechanism

**Status: minted 2026-08-03, commit `6c53d3e` (opus build, orchestrator-verified). hamr's
order, verbatim: *"go build it with opus and you orchestrate and validate it against the last
repo that failed."* This finding records the mechanism and its evidence; the defect is F77 and
the decision evidence is F78.**

### The rule

`src/ladder.js`. **A strike is a RED iteration that repeats an already-seen normalized gap OR
made no gate-audit writes.** Two strikes end the step (`STRIKE_LIMIT = 2`).

- **Repeat = a SEEN-SET, never last-only** — F78's oscillator is the reason, and the set lives
  for the step, one ladder per step (a shared ladder would strike a fresh step for a gap an
  earlier one had already produced).
- **Normalization is deliberately NARROW**: only bytes a re-run changes on its own (TAP
  `duration_ms` lines, ISO stamps, `ms` figures). **Error counts, file names and line numbers
  all survive** — `30 errors` and `22 errors` must read as two different gaps, and a normalizer
  that scrubbed numbers would turn the converging case this module exists to protect into an
  instant strike. Comparison-only: the gap the worker sees is never rewritten. Gaps are hashed,
  so the set holds no model or file bytes.
- **`wrote` reads the gate audit's own record COUNT delta** — the F32 instrument, run-scoped,
  allow-decision, write AND edit. **Never git status, never a tree diff** (F32), and **never
  the path SET**: a plan step rewrites its one target every attempt, so the set is constant
  after iteration 1 and would read every later iteration as idle — the Finding-3 trap Layer R
  documents one module over. A missing `writeCount` seam THROWS (BA-4 param-guard class): a
  strike rule running on one of its two signals with nothing on the record saying so is the
  blind-instrument class.
- **Strikes are STICKY** — never reset, never repaid by a good iteration in between, because a
  counter a single good iteration zeroes can be held open forever by alternating.

**Ownership is unchanged.** `STRIKE_LIMIT` sits shell-side exactly where the count sat: the
runner sets it, the agent cannot express it, and no step may tighten OR raise it. What still
bounds a converging step so nothing can run away — **the wallet, the wall (W-2), the variance
meter (A), and the stall fuse** — is untouched and each still ends the ladder on its own
authority. Exactly one bound was replaced: exhaustion-by-count. The exhaustion terminal is the
same `cap-halt` category with the same three records in the same order, so the ledger's
excluded-set and the step loop's ONE replan trigger key on the same name they always did.

### `attempts` is RETIRED — and tolerated, which is the load-bearing half

The field is gone from the drafting prompt and ignored by the runner. It is **not rejected**:
the frozen bridge registry's stored plans carry `attempts`, and a bridge rides into the drafter
as a starting draft through the ordinary validator — redding it would refuse every recipe
minted before today and break a frozen contrast experiment mid-flight. The SHAPE is still
checked (garbage in a known field stays a named red); the `<= capRuns` upper bound is gone with
the cap it named, because a plan stored under one runner's number must not red under another's.
Proven against the real artifact, not a fixture: `u-msd916dh`'s own accepted plans
(`attempts [3,3]` and `[2,2]`) validate OK against the signed spec on the resume path.

### The replan brief now names the mechanism

The exhaustion sentence handed to the redrafting planner carries three things F77 showed it
was missing: **which shape ended the step** (converging-cut / stalled-no-write / repeated-gap,
with the iteration numbers as evidence), **the gap trajectory** (`N distinct exit output(s)
over M iteration(s)`, plus an explicit *"every attempt moved the exit output, so the step was
converging when it struck out"* when there were no repeats), and **what the stop left
unspent** (balance and remaining minutes — `time UNBOUNDED` when the operator set no wall,
never a rendered zero: F6 extended to time). It names no culprit file: the ladder's inputs are
iteration numbers and counts, so naming one is inexpressible (F28's rule, replan side).

### Two design calls made against instruments, not preference

- **`maxTurns` is granted PER ITERATION, monotonically** (`Math.max` at the existing
  `setIteration` seam), because a pre-multiplied ceiling can only pre-pay a KNOWN iteration
  count and the ladder has none. Rebuilding the Gate per iteration was the alternative and was
  **rejected**: the audit is run_id-scoped, so a fresh gate resets F32's crash-attribution
  write set and Layer R's cross-attempt write history — two instruments broken to avoid one
  addition. The real per-iteration bound (`loop.stop()` at `roundsThisAttempt >= attemptRounds`)
  is unchanged either way.
- **The close-fix loop keeps its count** (`CAP_RUNS = 4`, relabelled close-fix-only). Its
  replay evidence does not exist — F78's corpus is step ladders — and converting it on the
  strength of a different population's numbers is the thing this programme keeps refusing to
  do. **Recorded follow-up, not an oversight**; it needs its own $0 replay over close-verdict
  gaps first.

### Evidence

TDD, **22 tests watched failing** before any implementation (14 ladder unit + 8 integration);
mutation **14/14 killed**, plus **one orchestrator-applied mutant** (strikes un-stuck) killed by
2 tests and the suite restored green; **850/850 and typecheck clean**, re-run independently with
real exits. Spec hashes untouched by the whole change — the runner accepted the already-signed
`1c35a1eb…` unchanged.

### Lesson

**When a bound is wrong, replace the QUESTION it asks, not the number it holds.** Raising
`capRuns` would have bought the converging step its iterations and bought thrash the same
iterations; the count was never the defect, "how many" was. And the replacement's honesty
depends entirely on its two signals being real instruments — which is why the write signal
reads the gate audit's record count and the repeat signal reads a seen-set: both were chosen
by naming the way the obvious version goes blind (F32's path-set, last-only comparison).

## F80 — the strike ladder makes Layer R's VERBATIM ratchet unreachable on the step path, and hamr's ruling accepts it: the notes go to the REPLANNER, not louder to the stuck worker

**Status: minted 2026-08-03. Found by the build's own tests (F79), surfaced to hamr as a named
OPEN POINT rather than resolved unilaterally (arbiter/experiment territory), and settled by
hamr's ruling the same session.**

### The collision

Layer R's escalation needs **three consecutive fixated attempts**: the summary note injects at
iteration 3, the VERBATIM note at iteration 4. But **fixation is by its own definition a
byte-identical red-set** — which is exactly what the strike ladder calls a repeat. So a
fixated step strikes at iteration 2, strikes out at iteration 3, and **iteration 4 never
opens**. With `layerRoot: true`, the VERBATIM stage is unreachable in the STEP loop.

It remains reachable in the **close-fix loop** (still count-bounded, F79), and the stage keeps
full unit coverage. **Layer R ships OFF by default (F41: fixation is extinct on every current
job)**, so nothing shipped is broken today — the real cost is that Layer R's never-run ON/OFF
acceptance read would now measure a different Layer R than the one designed, and that was
hamr's to decide, not the build's.

### hamr's ruling — option (a), confirmed

Three exits were put up. hamr picked (a) after walking the mechanism through in plain language,
and confirmed the resulting flow verbatim:

> *"so, 2 strikes followed by handing notes on next replan/run"*

Yes — **summary-only on the step path; the VERBATIM stage is retired there** (kept in the
close-fix loop). The strikes force the replan, and the mechanism note goes to the REPLANNER.

### Why the other two exits are INVALIDATED, not merely unchosen

- **(b) raise `STRIKE_LIMIT` to 3** — invalidated by F78's own threshold sweep: limit 3 stops
  almost nothing early (2 ladders versus 15), so it pays an extra stuck iteration on **every**
  thrash loop in order to reach a stage of a feature that ships OFF.
- **(c) exempt the iteration in which the ratchet just spoke** — invalidated twice over. By
  **F32/F39**: delivery ≠ conversion — hand-delivering more state to a stuck worker was
  measured dead twice (perfect aim, zero movement), so buying an iteration to say the same
  thing LOUDER to the same stuck worker buys the one thing already proven not to convert. And
  by **F70's guard-hole class**: an exemption is a hole a guard punches in itself, and this
  programme has now twice shipped a guard disarmable by its own mechanism.

### The channel shift IS the point

The ratchet's note went from the shell to the **stuck worker** — the semantic-gap genre, which
measurably does not convert (F39). The ladder's brief goes from the shell to the **replanner**
— a mechanical gap (which shape, which iterations, what is left unspent) handed to the one
component whose job is re-allocation, and mechanical is the genre that converts on the next
attempt every time (F38/F46). The step's self-heal did not get quieter; it moved to the channel
where feedback has ever been observed to land.

### Lesson

**Two independently correct guards can collide, and the resolution is a channel question
before it is a threshold question.** The tempting fixes were both dial-turns (raise the limit,
punch an exemption); the evidence said the note was aimed at the wrong recipient all along, and
the collision is what made that visible.

## F81 — the shape-lottery gate rules cure the trap class live: bareagent-u's fourth run rolls the RLM shape cold, steps green for the first time, and dies on money 5 suppressions from a full green

**Date:** 2026-08-04 · **Run:** `u-msew1uy5` ($4.13, cap-halt, `spendComplete:true`) ·
**Rules commit:** `28ee95f` · **Basis:** the $0 shape sweep (commit `8840809` session record)

### What was built (hamr's "go")

Two mechanical rules at the plan-validation gate, both STATED in the drafting prompt from the
same facts object the validator judges (the mailbox precedent), neither asking any LLM to
assess "is this job small":

- **Rule A-v2 (`check-placement`)** — a check whose PREFLIGHT verdict was red (seed-red) may
  only gate the plan's FINAL write step. Keyed on the spine-recorded preflight verdicts.
  Green-at-seed checks stay free mid-plan (the 20 archived TESTGEN mid-plan greens).
- **Rule B (`check-shed`)** — a replan may not drop a `check-passes` its predecessor plan
  carried; it may move one (A-v2 decides where), never shed it. The 3 archived sheds were all
  on step-red runs — zero historical greens blocked.

TDD: 9 tests watched failing first (4 of them overreach controls), 3 sabotage mutants killed,
869/869, spec hashes unchanged. Resume revalidation deliberately excluded (documented at the
site): a paid, previously-legal plan is never refused over a drafting law minted after it.

### What the live run showed (the patient that died three times)

- **The prompt law alone steered the FIRST draft into the RLM shape** — one step, whole
  territory, `tree-changed ∧ check-passes(typecheck)` — `plan-validate draft-1: ok`, zero
  reds. The gate never had to fire; it stands as the backstop.
- **Positive-scope confinement is gone:** attempt 1 changed BOTH goal files (u-msdsmkid's
  worker put 17/17 writes into one file and never touched the other). The step converged
  30→18→12→10→0 strict errors and **greened — the first honest step-green in this patient's
  four-run history** (prior: step-red ×3, never past the step).
- No replan fired, so Rule B's live validation is still pending a run that replans (its test
  coverage is the wiring test + replay).

### The residual that killed it: the suppression see-saw (NEW, shallower than the trap)

The worker satisfied its one in-step ruler (typecheck) partly by typing things as `any`. The
outer close's `no-suppressions` stage — a green-at-seed GUARD the step structurally cannot
carry (`MAX_EXITS_PER_STEP` = 2, already spent on the F17 pair) — caught 12 added `any`s. The
close-fix loop then see-sawed exactly as designed: remove `any`s → 2 real errors re-exposed →
fix them → 5 `any`s left, both axes monotonically converging (12→5 suppressions, 2→0 errors)
— and the money gate cut fix-iteration 3 mid-flight at $4.13 of the $4 budget. The tree it
left: typecheck GREEN (0 errors, outside-scope unchanged), suite GREEN, changed-from-seed
GREEN, `no-suppressions` red by 5. An honest cap-halt, roughly one fix-iteration (~$1) short.

There was NO check-vs-close discrepancy: the mid-run "typecheck: 2 errors" close red judged a
tree the fix worker had already edited (the operator's first reading conflated two trees and
two stages — corrected in-session, the F26 first-reading class again).

### Lesson

**The shape lottery is closed by making the losing shapes inexpressible, not by teaching
judgment** — a drafter that rolled the death shape three times rolls the winning shape cold
once the law is stated and the gate backstops it. What remains is a different, smaller
question: a close stage the step cannot carry is only discoverable at the outer close, and
feeding it forward (goal prose? a third exit slot? nothing — the fix loop was converting) is
operator/design territory, parked for hamr with the rerun/budget decision.

## F82 — the money halt becomes decision-ready: a per-stage trend instrument, a resume button on the U path, the fix loop's count retires — and the two defects the build turned up were both in an instrument

**Status: minted 2026-08-04, commit `ae417ae` (opus build, session as orchestrator/validator;
sonnet adversarial review after). Design: PRD v1.46 §2–§4. Motivating run: F81's `u-msew1uy5`,
cut by its budget mid-convergence, five suppressions short. Replay precedent for §4: F78/F79.
No paid run fired for this build, no spec hash changed, the bareagent-u patient untouched.**

### What shipped

- **(a) A money cap-halt keeps its last minted verdict and pauses DECISION-READY** — W-2's
  wall treatment in a money coat. A new `money-halt` spine record carries the signed
  `budgetUsd`, `remainingUsd`, the kept `verdict`/`stage`, a trend verdict
  (`converging | flat | unknown`) with the `reading` and the `series` it judged, and three
  W-2-symmetric levers (top up & resume · revise the spec · abandon). Emitted at **all three**
  sites that cut a run on money — the step loop, the close-fix loop, and the scout/draft relay
  — because a category that hands the human a readout at one seam and silence at another makes
  the readout a coincidence of where the stop happened. `spentUsd` is not re-derived there:
  runJob's ledger owns that figure (F6 — a second, weaker arithmetic for one run's money is how
  two instruments come to disagree).
- **(b) `--resume` on `scripts/run-u.mjs`** — the third leg of hamr's resume rulings, the one
  the original *"why would i want to waste more money on something i already started"* was
  actually about. It skips the seed reset (`resumeTreeGate`: a dirty tree is what a resume
  expects; only a moved HEAD stops it), folds the dead run's spend in as `priorSpentUsd`
  **against the SIGNED budget** so the ceiling can never widen by being re-invoked, and re-enters
  at the checkpoint the finished steps already bought. When the remainder is zero or negative —
  which is the commonest resume there will ever be, straight after a money cut — it prints an
  explicit `⚠ NOTHING LEFT` block pointing at the spec re-sign, because a minus sign in a
  balance line is not a warning. The top-up itself is not here and never will be: `budgetUsd`
  is in the spec hash.
- **(c) `CAP_RUNS` retires as the CLOSE-FIX loop's governor** for the same 2-strike
  no-progress rule the step ladder uses (v1.45 §5's recorded follow-up, now run). The $0 replay
  over all 8 archived fix loops came back clean both directions: **0 greens harmed** (all 3
  historical fix-loop greens converted in ≤ 2 verdicts) and **1 real waste case caught** —
  `reuse-msc6w93z`, dead flat at 2 errors for 7 consecutive fix verdicts until the wall killed
  it, stopped at verdict 4 by the new rule.

The instrument behind (a) and (c) is one module, `src/trend.js`, and its accuracy law is why it
is its own file: **a series is PER STAGE, compared only against itself.** The operator's own $0
sweep flattened a staged close's grades into one list and read `12, 2, 5, 0` as a regression —
what actually happened (u-msew1uy5, F81) was two axes falling at once, suppressions 12 → 5 while
the type errors that scrub re-exposed went 2 → 0. Merging the axes did not make the read noisy,
it made it WRONG in the opposite direction, and it would have told hamr to abandon a converging
run. In the shipped module the stages are separate buckets by construction: the mistake is
inexpressible rather than avoided by care.

### The two review findings — both instrument defects, both validated and fixed

- **F1 — `readGrade` took a rule id's digit as the count.** The reading is the first number on
  the first red-marked line, and types-close spells its verdict `D1a — … went 2 → 5`: the
  regex donated the `1` from `D1a` to the governor on every iteration, i.e. a **constant** wrong
  number, which reads as perfectly flat forever. Fixed twice over: numbers are taken as
  standalone tokens only (not embedded in a word or a dotted token — `D1a`, `v1.2`), and a
  before→after arrow line reads the **AFTER**, because reading the first number there would
  grade every iteration against the constant seed baseline — flat by construction again. The
  blind-instrument class, caught this time by review instead of by a paid run.
- **F2 — a test inferred "where am I" by counting calls to an injected function.** The
  step-loop money-cut test keyed on a call count that the feature under test changes; it now
  pins to the run's own state (`mh.phase`). Same trap the doctrine names: a call-counting test
  silently retargets the moment the number of calls moves.

### The pre-existing F6 gap the build walked into

`priorSpendComplete` was **computed** by `readResume` and **recorded** on `try-start` — and then
never handed to `runJob`, the one component whose `job-end` the row's own `spendComplete` is read
off. A resumed attempt whose dead leg contained an unpriced round therefore reported an **exact
total** where the honest figure is a floor. Fixed on the reuse path and carried through the new
U-path resume: the unknown travels with the money it qualifies, one-way (every round of THIS
attempt being priced repairs nothing about the one before it), and `job-start` now declares the
fold (`priorSpentUsd`/`priorSpendComplete`/`priorWallMs`) so a chain of resumes adds only each
attempt's own new rounds instead of re-deriving and double-billing.

### Three deviations from a naive reading of v1.46, each taken on evidence

- **The `readResume` amendment is OPT-IN** (`direct`, `resumableOutcomes`), both OFF by default,
  so the reuse loop's own semantics are byte-unchanged and control-pinned. There, a cap-halted
  try was graded and its registry row written; reclassifying it as a checkpoint would re-run a
  try whose fold leaves it no money and duplicate its row. Green and every red stay
  non-resumable under any setting — a verdict already rendered is never re-bought.
- **`capRuns` survives as the BLIND-instrument fallback, not as a vestige.** It binds only while
  the trend has never been able to compare anything (a close whose output carries no number at
  all), and lifts the moment a stage reports one. It is not decoration: a sabotage mutant that
  removed the fallback proved the loop non-terminating in exactly that case. A governor that
  cannot see the variable must not be the governor, and the honest fallback is the cruder bound
  it replaced rather than "unbounded".
- **A stage advance feeds the STRIKE rule but never headlines `converging`.** Reaching a later
  stage than ever before is real progress no per-stage number can see (a staged close is
  first-red-wins), so it repays a strike. It is kept out of the money readout's headline for a
  measured reason: an advance is guaranteed on essentially every run that does any work at all
  (the precheck reds at stage 1, the plan fixes stage 1, the close walks on), so an
  ordering-only "converging" would be true of almost every run and could not discriminate the
  one thing hamr asked it to — whether another dollar finishes this.

Also stated at the site rather than discovered later: "lower is better" is not derivable from
prose, so a **floor-shaped** stage (`N tests executed, below the seed's M`) reads as
not-improving rather than converging. The fail-safe direction, deliberately — a false "flat"
costs one conservative stop, a false "converging" costs a top-up spent on a dead run — and
never to be sharpened (the F49 precedent).

### PARKED, not resolved: two instruments now answer "was it progressing"

> **RESOLVED 2026-08-05, commit `12d997f` — recorded forward, the text below stands as
> written.** hamr ruled on the scope (PRD v1.49 §2) and the two instruments were unified:
> both halts now read the run's own `src/trend.js`, `gapTrend` is deleted, and the byte
> comparison survives INSIDE `unknown` as a `motion` field, never promoted to a direction.
> The blind-cap arm described just above was itself found latching and fixed in `f2be2b6`
> (F84).

W-2's wall-halt readout still uses `gapTrend` — **byte-equality of the last two close gaps**,
verdicts `stalled`/`moving`/`unknown`. The money halt uses the new **per-stage numeric** trend,
verdicts `flat`/`converging`/`unknown`. Two instruments, two vocabularies, one question, on two
halts that are otherwise deliberate mirrors of each other. Nothing here is wrong today — each is
honest about what it can see — but which one is the trend, or whether both stay, is arbiter
territory and **hamr's call**, recorded rather than unified unilaterally. Still pending
alongside it: the bareagent-u top-up decision. That tree is the live-validation candidate for
the resume feature (it is a real cap-halt with work on disk), and firing it needs hamr's re-sign.

### Evidence

TDD watched-fail throughout; **57 new tests** (28 trend unit, 12 run-u resume gates, 7
`readResume`, 7 plan-flow integration, 3 `runJob`); **7 sabotage mutants killed**; sonnet
adversarial review verified **9 doctrine constraints held** and returned 2 findings, both
validated against source and fixed (above). Final gate **926/926 and typecheck clean**. The
reuse path is control-pinned byte-unchanged; no spec hash moved, so the already-signed specs
still run.

### Lesson

**The instrument is where the defect lives, again — and this time review caught it before a
paid run did.** Both review findings and the pre-existing gap are the same shape: a number that
was computed and then read wrong (`D1a`'s digit), a number that was computed and then not
delivered (`priorSpendComplete`), and a test that read its position off the wrong signal. The
feature — is this run converging? — is only as honest as the reading under it, which is exactly
why the accuracy law got its own module, why an unreadable stage donates nothing rather than a
zero, and why the retired count stayed on as the bound for the one case the new instrument is
blind to.

## F83 — the pause becomes a CONTINUE: bareagent-u's cap-halt is topped up, resumed at the checkpoint, and greens in 12.8 minutes for $1.21 — the first live pause → top-up → resume → pass in programme history

**Date:** 2026-08-04/05 · **Resumed run:** `u-msf70nei` (GREEN, `spentUsd` 5.3389 of the
signed $8, `spendComplete: true`) · **Dead leg:** F81's `u-msew1uy5` ($4.13 of $4, cap-halt,
no-suppressions red by 5) · **Signature:** hamr verbatim *"go 8/45"* → `budgetUsd` 4 → 8,
`maxWallMs` 25 → 45min, new resolved hash `22eb9b3e` · **Tests:** commit `3fc6ee9` (opus
build, session as orchestrator/validator) · **Programme spend ~$21.82/$40.**

### What this validates

The feature chain PRD v1.46 §2–§4 specified and v1.47 recorded as BUILT had never met a real
halted tree. All three legs of it fired at once here, on the patient that produced the halt:
**§2** minted the decision-ready `money-halt` that made the top-up a decision instead of a
guess; **§3**'s `run-u --resume` consumed it; **§4**'s `close-trend` governor ran the fix loop
that finished the job. F82's evidence was tests and replay. This is the run.

### What the spine says (primary artifacts, `u-msf70nei.jsonl` + its gate audit)

- **Re-entered at the checkpoint, not at the beginning.** `scout-skipped {reason:'resumed',
  phase:'close'}` · `resume-seed {phase:'close', planSteps:['fix-strict-typing'],
  completed:[…], skipping:1}` · `step-skipped {provenBy:'step-end', provenSeq:135}` ·
  `plan-executed` records the one step as `skipped`, `replanned:false`. No re-scout, no
  re-draft, no re-paid step. The plan came back off the dead spine and re-validated against
  the spec signed NOW (the new hash), then re-emitted as this leg's own `plan-accepted`.
- **The patient was CONTINUED.** The dead leg's edits were on disk and stayed there
  (`resumeTreeGate`); the close precheck judged that tree, not a seed.
- **The fold is declared once, at `job-start`:** `priorSpentUsd 4.1261`,
  `priorSpendComplete true`, `priorWallMs 1493945` (24.9min), against `budgetUsd: 8`. The
  ceiling could not widen by being re-invoked.
- **The watchdog armed on the REMAINDER:** `wall-clock {requestedMs:2700000,
  elapsedMs:1493946, remainingMs:1206054}` — 20.1min left of the signed 45, not a fresh 45.
- **The close ran first and redded honestly.** `outer-close` first judgment
  `needs_revision`, stage `no-suppressions` — *5 suppression(s) added — suppressing an error
  is not typing it*. The green was earned in this leg, never inherited.
- **The see-saw appeared once more and the fix loop converted it.** Fix iteration 1 scrubbed
  the `any`s and re-exposed **3** strict errors (`close-verdict` iteration 1, stage
  `typecheck`); iteration 2 fixed those without re-suppressing and all four stages came back
  `satisfied`. **7 allowed `edit` actions across 2 files** (`src/loop.js`, `src/recurse.js`)
  — the F32 gate-audit instrument, not `git status`.
- **F82 §4's new governor ran it, and is on the record doing so:** `ladder {governor:
  'close-trend', iteration:1, stage:'typecheck', value:3, improved:false, comparable:true,
  noProgress:1, limit:2}`. First live firing of the close-trend governor; it read a real
  number off a real stage and did not have to end anything.
- **Leg cost and time:** 12.8min wall (21:51:35 → 22:04:23) and **$1.2128** of new spend —
  roughly the one fix-iteration F81 predicted the halt was short of. $2.66 of the topped-up
  $8 went unspent.
- **Books honest end to end:** `job-end {outcome:'green', spentUsd:5.3388775,
  spendComplete:true}` — the FOLDED total (4.1261 + 1.2128), not the leg, and the dead leg's
  own `spendComplete:true` is what licenses the `true` here.
- **The green was independently audited** by re-running all four close stages by hand: exit 0
  each. A bridge record was minted from it
  (`bridge-bareagent-u-types-msf70nei.json`, `specHash 22eb9b3e`) carrying the plan **as
  executed** — the RLM single step, exits `tree-changed(src/**) ∧ check-passes(typecheck)`,
  the shape F81's gate rules made the drafter roll cold.

### The money-pause cycle at library level (commit `3fc6ee9`, 5 tests, +329 lines)

The live run is n=1 on a real provider. The cycle itself is now pinned deterministically with
priced scripted rounds, `$0`:

1. **leg 1** — the wallet drains INSIDE the fix loop → the run keeps its minted verdict and
   pauses decision-ready (trend `converging`, kept verdict cross-checked, levers asserted
   non-self-adjusting).
2. **leg 2** — the topped-up resume greens AT THE CHECKPOINT: prefix skipped, the fold
   declared once, total = sum of both legs, and a close-precheck RED proving the green was
   earned rather than inherited.
3. **the no-top-up CONTROL** — resuming on the SAME budget buys no second pass: one
   round-boundary overshoot round (the documented behaviour — the cap binds BETWEEN rounds),
   a **byte-identical tree**, and a second honest money-halt. Without this arm the cycle test
   would only ever show the happy direction.
4. **the UNSOLVABLE cycle** (hamr's ask, *"money negative cycle that can't be solved"*) — a
   topped-up leg that makes no per-stage progress **strikes out at `FIX_STRIKE_LIMIT`** with
   trend `flat` and revise-first levers, **$1.60 of $2 unburned**. The strike rule governs the
   resumed fix loop exactly as it governs a cold one; a top-up does not buy the right to burn
   the wallet on a dead axis.
5. **the F6 floor cycle** — a declared floor survives leg-1 halt → `readResume` → leg-2 green
   terminal. An unknown that enters the cycle does not come out exact.

All five watched failing first with sabotage evidence; `tests/resume-u.test.js` fixtures were
updated to track the signed 8/45 numbers. Gate **931/931**, typecheck clean.

### PARKED (MED, probe-evidenced, NOT fixed): the restart fold can launder a floor into an exact total

> **FIXED 2026-08-05, commit `8e62749` — recorded forward, the text below stands as written.**
> The restart fold now reads ALL four of `runJob`'s floor causes (a landed resumable `job-end`
> declaring `spendComplete: false` floors the fold exactly like a declared prior floor or an
> unpriced round), with the killed-mid-flight restart shape — no `job-end` at all — control-pinned
> unchanged, as the hypothesis rule required. `f2be2b6` closed the sibling case one seam further
> out: a fold of **$0** that is not exact is still a floor (F84). PRD v1.49 §1.

`readResume`'s restart branch computes `priorSpendComplete` from **2 of the 4 causes**
`run.js` uses to decide the same thing:

- `src/run.js:167` — `spendComplete: !unpriced && !stalled && !cutMidCall && !priorFloor`
- `src/reuse.js:727` — `priorSpendComplete: open.declaredComplete && open.roundsComplete`

A floor arising from `stalled` or `cutMidCall` is therefore **invisible at the resume seam**: a
leg-1 `job-end` that honestly said `spendComplete: false` comes back EXACT, and leg 2 reports
`spendComplete: true` on a total built on a floor. The asymmetry is the tell — `readTry`, the
*graded* branch of the same reader (`src/reuse.js:401`), DOES consult the terminal's own
`spendComplete`; only the restart branch skips it. This is the F6 class, one call upstream of
where F82 added `priorFloor`, and it is why the live run's clean books are not proof of the
mechanism: `u-msew1uy5` declared `spendComplete: true`, so the two readings could not disagree.

The remedy — fold the landed terminal's `spendComplete` into the restart's completeness — is a
**HYPOTHESIS, not a fix** (the standing rule: a fix proposed from reading is tested as hard as
the defect). It has to be tried against the ordinary killed-mid-flight restart shape, where
there is **no `job-end` at all** and the reader must not start refusing or floor-marking the
resumes that work today. Awaits hamr.

### PARKED (design question): a resumed leg's trend is scoped to its OWN grades, not the cycle

> **RULED and IMPLEMENTED 2026-08-05, commit `12d997f` — recorded forward, the text below
> stands as written.** The pause readout DOES span the chain: `readResume`'s `restart.grades`
> seeds the run trend's baselines, validated against the real `u-msew1uy5` spine, and the
> no-top-up control's deliberately-unasserted trend now asserts the chain reading
> (`converging`, 2 → 1) as the correct one. hamr's scope ruling is the general law behind it
> — the halt READOUT is the chain-spanning consolidated money/time view, the STRIKE governor
> stays leg-local, and the two are never mixed (PRD v1.49 §1 and §2).

Per `src/trend.js`'s documented spec a series is per stage **within a run**. In the no-top-up
control the second leg honestly reads `flat` — it graded once and had nothing to compare —
while the CYCLE was converging (2 → 1) and the real blocker was simply that no top-up arrived.
Neither reading is wrong; they answer different questions. Whether the pause readout should
span a resume chain is arbiter territory and hamr's call, so the test deliberately leaves the
trend **unasserted** there rather than encoding either answer.

### Small, unfixed: the readout frames wall and money differently

`scripts/run-u.mjs`'s final read prints **money folded** (`spent $5.3389 of $8` — `job-end`'s
total across both legs) and **wall leg-only** (`wall 12.8min of 45min` — `Date.now() - started`
of THIS process against the full signed cap). Both numbers are true of different things and the
line does not say which. The spine and the enforcement are both correct — the clock folded
`priorWallMs` and armed the watchdog on 20.1min — so this is display only, and small. Recorded
rather than patched blind.

### Lesson

**"The stop is the checkpoint" is now a measured claim, not a design slogan.** A run that had
died four times on this patient was paused by its own budget with a graded tree on disk, handed
its operator an accurate trend and three levers, took one signed top-up, and finished for
$1.21 and 12.8 minutes — re-buying nothing it already owned. The economic argument for resume
was that a killed run should not re-pay for finished work; the number here is the one that
matters: the second leg paid for **one fix iteration**, which is exactly what F81 said was
missing. And the parked MED is the same shape as everything else this rung turned up — not the
feature failing, but a *reading* of a number, one seam upstream of where the last one was fixed.

## F84 — the whole-branch review of `layer-3-reuse`: a governor that had quietly stopped governing, a demotion table no test could break, and the two Criticals that only came out of RUNNING the code

**Status: minted 2026-08-05, commit `f2be2b6` (medium `/code-review` over
`main...layer-3-reuse`, opus finders + three opus fix batches, session as orchestrator and
validator; hamr's order verbatim: *"use /code-review medium for review with opus"*). Scope:
56 files, 16,422 insertions against `main` — the whole Layer 3 REUSE rung plus the money-halt
package and the trend work that landed on top of it. No paid run fired; no spec hash moved.
Gate after: 987/987 (from 959), typecheck and `build:types` clean.**

### The two Criticals

**(1) The close trend's blind cap was a one-way latch, so the fix loop's fallback bound could
be disarmed by a run doing ordinary work.** `capRuns` survives on this branch for exactly one
job: bounding a close-fix loop whose close reports no number the progress rule can compare (a
governor that cannot see the variable must not be the governor — F82). It was armed off
`comparableEver`: *has this leg ever compared anything*. A bare STAGE ADVANCE counts as
comparable — and `src/trend.js`'s own `verdict()` comment says an advance is guaranteed on
essentially every run that does any work at all. One advance therefore turned the fallback off
for the rest of the run. A close that then redded numberlessly — the shipped aurora TESTGEN
`verdict` stage is precisely that shape — accrued neither a strike nor a blind tick, and the
loop was bounded by money and the wall alone, in the one case the retired count existed to
stop.

The finder did not read this out of the source; it **executed** a repro. Twenty-seven
iterations: one advance, then numberless reds at one stage, `struckOut()` false throughout, no
terminal. The fix bounds the **consecutive uncomparable streak** instead of the run's opening —
"lifted the moment it can read" is the rule, so it must re-arm the moment it cannot. Pinned
both directions before and after: a blind-from-birth run strikes out on exactly the iteration
the retired count always bought it (byte-stable, at every cap), a comparable-throughout run
outlives the cap by any margin, and a run that goes blind and RECOVERS is never bounded by it.
`report().blind` was corrected with it — it answers the question the terminal prose branches on
(*is the blind cap what stopped this, or the strikes*), and on a run blind after one advance it
read `false`, which would have offered "0/2 strikes" as the reason a loop it had not struck out
was stopped.

**(2) `REUSE_GRADED_RED` had no test that could fail.** The set whose members DEMOTE a proven
bridge is the whole of Layer 3's safety story on the registry side, and a mutant that WIDENED
it survived the entire suite. The hole is now closed with a demotion table pinned outcome by
outcome: `escalated` demotes (the close judged the tree, the fix loop spent its attempts with
money still on the table, and the close was still red); `step-red`, `cap-halt`, `wall-halt`,
`provider-red`, `close-red`, `step-stalled` and `pricing-red` are casualties that keep their own
names and leave a proven entry proven. A casualty never demotes is hamr-endorsed doctrine, and
until this commit it was doctrine no instrument enforced.

### The warnings, all confirmed and all fixed

Roughly eight, and they fall into three families the branch had already met:

- **F6 launderings, one seam further out each time.** `priorFloor` was gated on `spentUsd > 0`,
  so a fold of **$0 that was not exact** came back exact — a floor of zero is still a floor.
  The `money-halt` record quoted `remainingUsd` to four decimals without saying whether the
  spend behind it was exact, making a CEILING read as a number. A restarted try's row reported
  only the restart's rounds against a span its money and wall already covered both legs of.
- **Computed, declared, and then handed to nobody.** `readResume`'s `restart.grades` — the dead
  leg's close grades — reached `runJob` only through `scripts/run-u.mjs`. The library's own
  reuse resume never passed them, so a restarted leg's halt readout judged its own leg and
  could say `flat` — *revise the goal* — on a run that was converging when its allowance ran
  out. The adopter contract had described the library behaviour, not the shipped one.
  Same shape as F50 and as F82's `priorSpendComplete`: wired ≠ the code exists.
- **A guard reading zero and saying nothing.** `--wall-ms 0` reached `u-watchdog.mjs`, which
  defaulted a non-positive value to `null` and armed **no deadline at all** while the runner's
  banner said "armed for 0min". W-2 is *"when time is up, keep the grade we already have and
  stop"* — a zero remainder is a decision, not an unbounded launch. The watchdog now refuses a
  present-but-unreadable numeric flag outright (an OMITTED `--wall-ms` stays the legal
  unbounded choice), and both runners refuse above the spawn, before the key and before the
  patient.

Also in the batch: the replan brief no longer calls an idle strike-out *converging*;
`planPrompt`'s JSDoc was reattached (an intervening helper had detached it, shipping every
parameter as `any` in the generated `.d.ts`); a corrupt watchdog report can no longer abort a
signed resume; `runner-start`'s argv is redacted at the WRITE site (a log that captures a key
captures it forever, so an after-the-fact scan is too late); a trailing value-flag refuses
instead of reading `Number('') === 0` and reshaping the run being signed; and
`scripts/migrate-bridge-patient-slugs.mjs` got its first battery (4 mutants killed).

### Zero fixes forced — and three finder claims corrected in the fixing

Every claim was verified against source before it was believed, and none had to be dropped as
a false positive. Three were right about the defect and wrong in the detail, which is the part
worth recording:

- The ladder's *"the step was converging"* sentence was reported as sometimes-wrong. It is
  **structurally unreachable at a strike-out except beside its own contradiction**: every
  strike is a repeat or an idle iteration, and the sentence was gated on repeats alone, so at
  a strike-out it could only ever have fired next to the stall line that denied it. The fix
  gates it on both signals; the control test reads it on a ladder that has NOT struck out,
  which is the one path where it is still true.
- The zero-wall refusal on `scripts/run-reuse.mjs` was proposed as one message. A resume
  reaches zero **two ways** — the restarted try burned its whole per-try wall, or every
  authorized attempt has already run — and they take different levers (`--wall` vs `--tries`,
  or reading the run as it stands). One message would have sent the operator to re-sign a
  number that buys no attempt.
- `wallMs` on an inherited graded row was measured to the kill. The try's own terminal is the
  precise answer and is on the record being read; the kill time is the fallback for a stamp
  that cannot be parsed, never the first reading.

### Two review-methodology notes

**A test can pin a defect as spec.** `tests/ladder.test.js` carried
`test('the brief says CONVERGING when every gap moved and only idleness struck it out')` — an
assertion, watched failing when it was written, that the brief must produce the exact
self-contradiction the finder flagged. A green suite is not evidence a behaviour is intended;
it is evidence somebody wrote down what the code does. The test is now inverted, with a control
for the shape where the sentence is true.

**Reading is not running — and this repo has now paid for that twice.** The operator's own
manual pass over `src/trend.js` earlier the same day (`12d997f`, the commit that built the
seed) reasoned about the blind-cap arm in prose — *"the blind-cap backstop still governs a leg
whose own readings never compare"* — and did not see that the backstop had already stopped
governing. An opus finder caught it by writing a 27-iteration repro and watching it not
terminate. This extends the standing class — a defect visible only by RENDERING
or RUNNING the real artifact (the malformed-JSON prompt, the silent cap) — from artifacts to
**governors**: a bound is a claim about a loop's termination, and the cheap way to test a
termination claim is to run the loop.

### New PARK for hamr: one close stage, two measurement populations

> **RETIRED for the `u-*` closes the same day, commit `4ae9a3c` (hamr: *"#1 fix"*) — the park
> text below stands as the record of what was found.** Every mixed stage was SPLIT in the
> close: `typecheck-outside` carries the outside-scope population immediately after
> `typecheck`, `tests-kept` carries the executed-count floor immediately before `suite-green`,
> each new stage sitting exactly where its branch already ran, so the gate sequence is
> byte-order identical and first-red-wins is unchanged. All six `u-*` spec hashes flipped and
> the runner refuses them until re-signed. **The park does not close entirely** — see the
> residue below.

**Residue, recorded precisely (2026-08-05):**

- **`u-*` closes — FIXED.** Six specs re-hashed; `litectx`/`spawner` `typecheck` verified
  single-population and left alone. `src/trend.js`'s KNOWN LIMIT is now the historical record
  plus **the law for close authors**: one population per stage, and the remedy for a mixed one
  is that close's stage list, never a sharpened detector (`readGrade` untouched, F49
  precedent).
- **`scripts/testgen-close.mjs` — STILL PARKED for hamr, and it is LIVE infrastructure.** Its
  `verdict` stage renders `killed=K/40 rate=R% clean=green form=unit:N,integ:M` — a
  fault-detection RATE and collected-unit COUNTS under one stage name. It is the same class,
  on the job that produced F38/F39/F46/F47, so splitting it is not cosmetic; it is also a
  stage-name change inside signed TESTGEN specs, which is the same spec-hash territory the
  `u-*` split was.
- **The split's COST, measured — the close walk runs `tsc` and `npm test` TWICE.** Each stage
  is its own process spawn, so nothing is memoizable across them: `typecheck` and
  `typecheck-outside` each call `strictErrors()`, and `tests-kept` and `suite-green` each call
  `suite()`. Measured on the two patients: pulselog-u `tsc` 7.84s + `npm test` 8.28s = **+16s
  per close walk**; baremobile-u `tsc` 10.22s + `npm test` 28.15s = **+38s**. Not a defect and
  no code changed: the guards scale with the stage count on their own — `scripts/run-u.mjs`
  reads `closeStages` off `spec.close.length` and `src/clock.js` sets the deadline at
  `maxWallMs + closeStages × closeTimeoutMs`, so both the outside watchdog's stale window and
  the run's own wall widened with the split — and W-2 means the close never counts against the
  wall in the first place. Recorded because a known cost is recorded: the split bought accuracy
  and paid seconds per iteration for it, and the number belongs beside the decision.
- **`scripts/types-close.mjs` — deliberately AS-RUN.** Frozen screening infrastructure with
  five populations under its stages. It graded a closed screen; re-cutting it now would edit
  the instrument a finished measurement was taken with, so it stays exactly as it ran, named
  rather than quietly fixed.

**The park as originally recorded:**

The trend's accuracy law is *never across stages*, and it is enforced by construction — a
series is one bucket per stage name. But **a stage name is not an axis.** The shipped closes red
one stage on two structurally different populations: `u-*-close`'s `typecheck` reports either
`N error(s) in <scope>` (the in-scope faults) or `the target files are clean but M strict
error(s) exist outside them` — a different population entirely, reached only once the first is
zero — and `suite-green` has the same shape (`N test(s) now fail` beside a floor). A run that
crosses that seam donates both genres to one series, so a 29 → 4 across it reads **converging**
and recommends a top-up on work that has only swapped which wall it is behind. It is the
u-msew1uy5 error in the one place the bucketing cannot see it.

It is **stated at the site as a KNOWN LIMIT, not parsed around**. The root fix is a STAGE SPLIT
in the shipped closes, which changes stage names inside signed specs — spec-hash territory, and
hamr's to sign. Teaching the detector to tell two prose shapes apart is explicitly refused (the
F49 precedent: a per-close sharpening is how one reader stops being one reader).

### Lesson

**A governor is a termination claim, and a termination claim is cheap to execute and expensive
to read.** Both Criticals were invisible to careful reading and obvious to a running instrument
— one to a repro loop, one to a mutant. They are also the same defect wearing two coats: a bound
that had quietly stopped binding, and a demotion set that could be widened without any test
noticing. The branch's own doctrine already said it (*a rule without a wired detector is prose,
not protection*); what this round adds is that a detector nobody has watched FAIL is prose too.

## F85 — the variance meter reported a false negative: it stopped a step that was converging and told the replanner the step's exits were "unmoved"

**Status: minted 2026-08-06, commit `3d91b0e` (opus build, session as orchestrator and
validator), branch `variance-progress-abc`. Instrument: the archived spine of `u-msh70zla`
(bareagent-u, `step-red:narrow-loop-catches`, $2.9103 of $4), read against the run's own
`close-verdict` gaps; confirmed post-fix on `u-mshcpdg4` and `u-mshsikhr`. hamr's ruling,
verbatim: *"meter is right but missing a piece ... it should give heads up on money/time +
progress for llm to judge."* No spec hash moved — every change is library code. Gate after:
1019/1019, typecheck and `build:types` exit 0.**

### The defect, in the run's own records

`u-msh70zla` drafted a one-step plan over `src/loop.js` + `src/recurse.js` and worked it for
three attempts. Its own books, all four instruments on one run:

| what | the record |
|---|---|
| the ladder | `it1/it2/it3` — `strike:false`, `wrote:true`, `distinctGaps 1 → 2 → 3` |
| the close | `24 → 15 → 14` strict errors across those three attempts (preflight seed 30) |
| the meter | `{"step":"fix-strict-catch-narrowing","iteration":4,"threshold":0.5,"moneyShare":0.618,"timeShare":0.565,"axis":"money"}` |
| the replan brief | `"the meter stopped a step that was consuming the run with its exits unmoved"` |

The first two say the step was converging on every signal the repo owns. The fourth says the
opposite, and it says it as a fact. The materials `progress` line handed to the same
redrafting planner read `step 1 of 1 ("fix-strict-catch-narrowing") did not finish; 0 step(s)
completed before it` — structurally true and silent about outcome, so the only thing a
replanner could conclude from either sentence was that nothing had been achieved.

**"With its exits unmoved" was a hardcoded string.** It was printed for every `step-variance`
stop whatever had happened; nothing computed it and nothing could make it false. The pre-fix
`variance` record carries the two shares, the threshold and the axis, and nothing else — there
was no progress field to disagree with, because there was no progress reading anywhere in the
branch.

**What it cost, measured.** All 14 remaining errors were in `src/recurse.js`; the file
`src/loop.js` was at zero. The replanner, told it had achieved nothing, drafted a first step
whose action opens *"In src/loop.js only…"* with `target: "src/loop.js"`. Two iterations, both
`wrote:false`, gap both times `0 files changed under src/** — the tree is byte-identical to
the step start`, second `repeatOf:1`, two strikes, `cap-halt`. The run ended **$1.09 of $4 and
~6.9 minutes of the 25-minute wall unspent**, having thrown away three attempts of real
convergence.

### The defect class — and the sharper second form

This is the **blind-instrument class** this repo has now minted more times than any other: a
governance instrument narrating a variable it could not see. The prerequisite defect below is
the ordinary form of it.

The second form is the one worth naming, because it is new here. **The meter's DECISION was
correct and only its NOTES were wrong.** A step eating 62% of the run's remaining money with
its exits still red should be stopped, and it was. Nothing in the pass/fail record disagrees
with anything: the stop was right, the escalation category was right, the run's terminal was
right. The falsehood lived entirely in the prose the stop handed to the one component whose
job is to act on it. **A red/green audit is structurally incapable of catching this** — there
is no red to find. It surfaces only by reading an instrument's narration against the artifact
it is narrating, which is what the `u-msh70zla` autopsy did.

### The prerequisite defect, found en route: `runTrend` could not see a step

Before any of A/B/C could report anything true, the reader had to be able to read. Two folds
were missing and one seam was wrong:

- **The trend reader was fed only the close precheck and the outer fix loop.** Every grade a
  STEP ever produced was donated to nobody. A meter firing mid-step therefore had nothing to
  report about the step it was stopping — which is exactly the case it exists for.
- **The step seam handed it the WRAPPED gap.** `evalExits` wraps a stage's output as
  `check "<name>" red: …`, and that line carries the word `red` with no number on it, so
  `readGrade` read the wrapper instead of the wall. Measured on `u-msh70zla`'s own archived
  gaps: the raw gap reads `typecheck 24 → 15 → 14`, the wrapped gap reads **nothing at all**.
  (Same seam Layer R already pays at the step path for a check's `^`-anchored `gapKeep` —
  F50.)
- **No preflight seed**, so a numeric stage had no baseline and a step's first grade had
  nothing to compare against. Added **once per stage**: the precheck and the preflight loop
  grade the same unchanged tree back to back with no work in between, and a repeated baseline
  in a series reads as an attempt that achieved nothing — a phantom flat step handed to a
  human and to the replanner, i.e. the same class of false story this whole change removes.

### A / B / C — what hamr's ruling was built into

- **A — the meter REPORTS progress and DECIDES nothing.** The firing condition is
  byte-identical: `moneyShare >= 0.5 || timeShare >= 0.5`, both axes, same threshold, same
  head-of-attempt position. **A progress term in the trigger was refused on principle, not on
  taste.** The meter is a governance instrument over an operator-owned allowance; a governor
  that suppressed itself whenever the work looked promising would be spending the budget on a
  judgment about capability — which is the arbiter's side of hamr's law, permanently. The
  reading is read off `runTrend` — the **same instance** the money halt reads (`src/trend.js`,
  ONE PER SERIES). No second reader: two readers of one question is the defect being fixed.
  The `variance` record and the escalation gain `trend` / `motion` / `reading` / `series` as
  **appended** fields with the same names and shapes the money halt already emits.
- **B — the false sentence is deleted.** The replan trigger sentence now states the meter's
  fact and then the trend's measured reading, as two separate claims in that order: *"it was
  stopped for eating the run"* and *"here is what the run achieved"* are different things, and
  the old string quietly fused them into a verdict on the work. `unknown` stays `unknown` — a
  close that reports no number donates nothing (F6). The materials `progress` line keeps its
  structural sentence (a plan's shape is what the planner re-allocates) and gains
  `close trend so far: …`.
- **C — the arbiter's ONE extra replan.** A second `step-variance` stop after the ordinary
  ceiling used to be a hard stop; on a converging run that threw away work already paid for.
  The arbiter may now grant one more, and every clause is a constraint: **ONE**, bounded by a
  latch rather than a comparison so the ceiling cannot creep (unlimited replanning launders
  thrash as adaptation); **the ARBITER**, read mechanically off `runTrend`, never asked for,
  never offered, never influenceable — the agent has no channel to it; **`converging`**, the
  trend reader's own category, with no fresh number invented here (threshold-setting is
  hamr's); **`step-variance` only** — an exhaustion or a stall after the ceiling is unchanged.
  The spine carries `granted:"converging"` only when the grant fires, so a reader can never
  mistake the ordinary ceiling for a grant.

### Live evidence, post-fix

- **`u-mshcpdg4`** — both `variance` records carry the measured reading
  (`still progressing — typecheck 30 → 15` at iteration 2; `… 30 → 15 → 15 → 1` at iteration
  3), and **C fired**: `{"replan":2,"granted":"converging"}`. The run reached **1 remaining
  strict error** against `u-msh70zla`'s 14.
- **`u-mshsikhr`** (the rerun, under both this and F86) — one variance stop, `moneyShare
  0.508 / timeShare 0.642 / axis money`, `trend:"converging"`,
  `reading:"still progressing — typecheck 30 → 28 → 6"`. A/B did on a live run exactly what
  they were built to do: the meter stopped a genuinely converging step **and said so**.

### What is NOT proven

- **C has fired exactly once, and it bought nothing measurable.** On `u-mshcpdg4` the granted
  second replan aimed at an already-clean file and the run still step-redded — that is F86's
  defect, since fixed, but it means C has never once been observed converting a run. On
  `u-mshsikhr` only one variance stop occurred, so C was never reached and remains
  **unexercised under the current code**. n=1, no green: C is legal and bounded, not shown
  beneficial.
- **Nothing here is a claim about greens.** A/B changed what the replanner is told. Whether a
  truer brief produces a better run is F86's read, and that read is red.
- **One genre, one patient.** Every reading above is a `tsc --strict` error count on
  bareagent-u. A close that reports no comparable number donates `unknown` by design, and how
  often that is the real case across genres is unmeasured.

### A documentation-integrity defect found in the same session: the F-number collision

Both commits on this branch labelled their work **F76** (this finding) and **F77** (F86) in
**32 source and test comments**, while `docs/FINDINGS.md` already publishes a different F76
(*resume at TRY granularity re-buys work the run already owns*) and a different F77 (*the step
loop's fixed count was a silent second ceiling*), and runs to F84. Verified that zero F76/F77
references existed in those files before the branch, then renamed **F76 → F85** and
**F77 → F86** across `src/planrun.js`, `tests/planrun.test.js` and `tests/resume.test.js` —
comments and test names only, no behaviour change.

Recorded as a defect and not a tidy-up: this repo's findings are the attribution ledger the
whole programme reads back, and a source comment pointing at the wrong finding is a false
citation that survives every gate. Nothing typechecks a cross-reference.

### Lesson

**An instrument can be right and still lie.** The stop was correct, the category was correct,
the terminal was correct — and the sentence the stop handed to the only component that acts on
it was a hardcoded falsehood that no test, no gate and no red/green audit could ever have
flagged, because there was nothing red about it. The blind-instrument rule this repo keeps
re-minting has a second half: after asking *can this instrument see the variable it governs*,
ask *can it see the variable it NARRATES* — and then read what it says against the artifact it
is saying it about.

## F86 — the replan brief carries the close's own output; the parsed never-wrote line is deleted; and the rerun aims at the work and still dies at the tail

**Status: minted 2026-08-06, commit `5d17f88` (opus build, session as orchestrator and
validator), branch `variance-progress-abc`. Defect instrument: the archived spine of
`u-mshcpdg4`. Live read: `u-mshsikhr`, the first run under both F85 and this — cold, same
patient, same signed hash `eed6fe82…` (unchanged; the fixes are library code, not spec),
$4 / 25 min, launched setsid-detached under `systemd-inhibit`. hamr's order, verbatim:
*"delete it and rerun bareagent"*. Gate after: 1023/1023 (1027 minus the 4 tests deleted with
the feature), typecheck and `build:types` exit 0.**

### The defect: the worker saw the address, the replanner never did

`u-mshcpdg4` got to **one remaining strict error** and died. Its last close gap, verbatim:

```
check "typecheck" red: close stage "typecheck" failed:
BAREAGENT red: tsc --strict reports 1 error(s) in src/recurse.js, src/loop.js
BAREAGENT | src/recurse.js(978,115): error TS2322: Type 'string | null | undefined' is not assignable to type 'string | null'.
BAREAGENT judged=1
```

The worker read that on every attempt. The **replanner** — the component that chooses which
files the next plan targets — received `still progressing — typecheck 30 → 15 → 15 → 1`: a
number with no address. F85 had just given it the trajectory; the trajectory is a summary OF
an artifact it was never shown.

At the moment the arbiter granted that last replan (F85's C) the run still held **$1.10 and 82
seconds of its declared wall**. The plan it drafted set `target: "src/loop.js"` and said *"fix
only the remaining tsc --strict errors reported"*. `src/loop.js` was at **zero errors**. Two
iterations, `wrote:false` both, second `repeatOf:1`, two strikes, `cap-halt`. The run ended
`step-red:finish-strict-typecheck`, **$3.1826 of $4** — $0.82 and ~6 seconds of the 25-minute
wall unspent.

### The fix: the artifact, bounded and scrubbed, as TEXT

`closeGapBlock(gap)` in `src/planrun.js`. The step's last exit gap goes into the replan brief
under a labelled heading, and the two boundaries are **reused rather than respelled**:

- **SCRUB** — `redactSecrets`, the one secret inventory. The gap arrives already scrubbed from
  `judge`, so this is defense in depth at an egress point, which is where it belongs: the next
  caller of this helper will not remember the upstream one.
- **BOUND** — ralph's own `boundGap` (exported for it), the same envelope the close path uses,
  so red lines survive the elision and every trim announces itself (F28). A private slice here
  would be a second truncation scheme silently able to drop the one detail line the helper
  exists to carry.

Red-set is `REPLAN_GAP_KEEP = '\S'` — every non-blank line. Not the close stage's own
`gapKeep`, for the reason F50 already pays at this seam: a shipped `gapKeep` is `^`-anchored
(`^BAREAGENT `, `^red`, `^FAILED`) and the exit evaluator wraps stage output in
`check "x" red: …`, so the anchor no longer sits where the pattern expects it. Keeping every
line is correct rather than widened, because **a gap that reaches here is already a red-set**:
`judge` builds it out of the failing exits only.

**No spine field** — `src/trend.js`'s standing rule is that no record carries a close byte.
**Empty gap → empty string**, so the brief renders byte-identical to the pre-F86 one; a
labelled empty section would invite the planner to explain an absence the run never observed.

### And the deletion: the parsed `never wrote` advisory, on hamr's order

Deleted with this change: the advisory line *"The last exit output names file(s) this step
never wrote: …"* and its sole-caller helper `gapFilesNeverWritten`.

**Why a parsed file list is not the cheap version of this fix — it is the bug.** Line 1 of
that very gap reads `reports 1 error(s) in src/recurse.js, src/loop.js` — every file in
**scope** — and only line 2 names the culprit. Measured on that gap, the helper returned
`["src/loop.js"]`: **the already-clean file**. It then said so as a **directive**, sitting
beside the artifact that said the opposite, to a worker this programme has already measured
following directive prose (positive-scope confinement, `u-msdsmkid`). Formats differ per close
anyway — tsc `file(line,col)`, pytest test ids, a count close naming no file at all. A model
can tell a summary line from a detail line; a regex reproduces the failure.

**It also had zero conversion evidence.** It fired by construction on `u-msdsmkid` and that
run still step-redded ($3.5428, `step-red:fix-recurse-strict`). Nothing was removed that had
ever been observed to work.

Verified by **execution, not reading**: sabotaging the wiring (`gapBlock = ''`) turns the
`u-mshcpdg4` regression test red (`not ok 121`); restored byte-clean.

### The rerun `u-mshsikhr` — the honest live read

**Outcome: `step-red:strict-fix-recurse-remaining-errors`. $3.1545 of $4, spine span
21 min 51 s of the 25-minute wall, 120 worker rounds, 27 gate-allowed edits over 2 files
(`src/recurse.js` 16, `src/loop.js` 11), 6 check runs, 1 replan, `spendComplete:true`. NOT
green.** Drafting $0.4217 (scout $0.3365 + plan $0.0852) against execution $2.7328 — 6.48×.

**Plan 1 (`strict-fix-recurse-and-loop`, the RLM whole-territory shape) went 30 → 28 → 6**,
and F85's meter stopped it at iteration 3 saying so.

**What the replanner did with the gap it had never been shown before.** The gap it received:

```
BAREAGENT red: tsc --strict reports 6 error(s) in src/recurse.js, src/loop.js
BAREAGENT | src/recurse.js(975,21): error TS7006: Parameter 'result' implicitly has an 'any' type.
BAREAGENT | src/recurse.js(975,29): error TS7006: Parameter 'c' implicitly has an 'any' type.
BAREAGENT | src/recurse.js(1022,21): error TS2339: Property 'message' does not exist on type '{}'.
BAREAGENT | src/recurse.js(1022,49): error TS2339: Property 'message' does not exist on type '{}'.
BAREAGENT | src/recurse.js(1079,90): error TS18046: 'err' is of type 'unknown'.
BAREAGENT | src/recurse.js(1170,95): error TS18046: 'err' is of type 'unknown'.
```

The plan it drafted opens *"Finish making src/recurse.js and src/loop.js pass `tsc --strict`.
**Only 6 errors remain, all in src/recurse.js:** (1) line 975 col 21/29 … (2) line 1022 col
21/49 … (3) lines 1079 col 95 and 1170 col 95 …"* with `target: "src/recurse.js"`.

Two things in that sentence are the finding. It enumerated all six addresses off the artifact,
and **it correctly said "all in src/recurse.js" against a line 1 that names both files** —
precisely the summary-versus-detail distinction the deleted regex got backwards. (It also
paraphrased `1079,90` as *"col 95"* — a model transcribing, not a parser extracting, which is
exactly the trade being made.)

| | `u-mshcpdg4` (pre-F86) | `u-mshsikhr` (post-F86) |
|---|---|---|
| what the replan targeted | `src/loop.js`, already clean | the remaining errors in `src/recurse.js` |
| post-replan ladder | 2 iterations, `wrote:false` both | 4 iterations, `wrote:true` on 3 of 4 |
| post-replan trajectory | none (nothing written) | `6 → 4 → 2 → 2` |

**The mechanism converted the failure it was built for.** That is the whole claim.

### Where it died, with no gloss

```
plan1 it1 strike=false strikes=0 wrote=true  distinctGaps=1
plan1 it2 strike=false strikes=0 wrote=true  distinctGaps=2   → variance stop, replan 1
plan2 it1 strike=true  strikes=1 wrote=false distinctGaps=1
plan2 it2 strike=false strikes=1 wrote=true  distinctGaps=2
plan2 it3 strike=false strikes=1 wrote=true  distinctGaps=3
plan2 it4 strike=true  strikes=2 wrote=true  distinctGaps=3 repeatOf=3   → cap-halt
```

The run ended on the ladder's second strike at **two remaining strict errors**, with **$0.85
and ~3.1 minutes unspent**. The escalation is decision-ready and accurate: *"it repeated
itself — the exit output at iteration 4 had already been seen at iteration 3; it stalled — no
file was written in iteration(s) 1. Gap trajectory: 3 distinct exit output(s) over 4
iteration(s)."*

**The strike was correct and mechanical.** Iterations 3 and 4 produced a **byte-identical**
345-byte gap (verified by `===` over the archived records), so the seen-set fired
`repeatOf:3`. Note it struck **with `wrote:true`** — the write-delta rule did not save it
because the gap repeated. That is F78/F79 working exactly as designed: a step that writes and
changes nothing is the case the seen-set exists for.

**Where the work actually stopped.** Both surviving errors are on **one line**:

```
src/recurse.js(975,21): error TS7006: Parameter 'result' implicitly has an 'any' type.
src/recurse.js(975,29): error TS7006: Parameter 'c' implicitly has an 'any' type.
```

which in the patient is `const evaluate = (result, c) => runArbiter('broken-sensor', () =>
sensor(result, { task, context: opts.context, contract: c.contract }));` — a single
un-annotated arrow function. The gap named the file, the line, the **column** and the exact
error text; the worker held that address for **three consecutive iterations**, wrote on
iteration 4, and the two errors did not move.

**So this is a worker conversion failure at the tail, not an instrument blindness** — a
different failure from the one this finding fixed, and the first time the programme has seen
it isolated with everything upstream demonstrably working.

### What is proven, and what is not

- **Proven:** the replanner now aims at the work. That is exactly and only what `closeGapBlock`
  was built to do, and it did it on the first live run, against a pre-fix control that aimed at
  a clean file twice.
- **NOT proven — and must not be claimed:** that F86 produces greens. **The run is red.** One
  run is one run; there is no second post-fix run, no ON/OFF contrast, and no green anywhere in
  this pair.
- **Named confound, unresolved here — and it is a PATTERN, not one step.** The tail step ran
  `model: haiku` (per-step, legal: PRD v1.36's floor binds the drafter/default tier, not a
  step the planner tiers down). Read across all three bareagent runs of this session, the
  planner assigned haiku to **every replanned step**, each under a tight round bound, and
  **every one of them failed**:

  | run | replanned step | tier / rounds | outcome |
  |---|---|---|---|
  | u-msh70zla | `narrow-loop-catches` | haiku / 6 | step-red, wrote nothing |
  | u-mshcpdg4 | `finish-strict-typecheck` (2nd replan) | haiku / 8 | step-red, wrote nothing |
  | u-mshsikhr | `strict-fix-recurse-remaining-errors` | haiku / 12 | step-red at 2 errors |

  The initial step was the default sonnet at 30–40 rounds in all three. So the conversion
  failure above is measured on **haiku, at the step that carries the run's last mile, every
  time** — which means this pair of runs does not isolate a sonnet capability limit at all.
  Whether the same address converts under a sonnet tail step is untested, and n=3 on one
  patient is a lead for a $0 archive read, not a finding.
- **Open question flagged, not resolved:** F38's split says a **mechanical** gap — counts, named
  walls, an exact address — converts on the next attempt every time attempts remain, and the
  semantic genre is the one that stalls. This gap is as mechanical as the programme has ever
  produced (file, line, column, error text, three iterations running) and it did not convert.
  That is a live tension with a paid-for finding and it deserves its own instrument and its own
  finding; it is recorded here, deliberately unexplained.

### Lesson

**A channel fix is validated by where the work gets aimed, not by the verdict at the end of the
run** — and the two must be reported separately or the honest half of the result gets eaten by
the red half. `closeGapBlock` moved the replanner from a clean file to the actual remaining
errors and turned two idle iterations into three writing ones; the run still died, for an
entirely different reason, two errors from done. Collapsing those into "it didn't work" would
have discarded a measured conversion, and collapsing them into "it worked" would have been the
fit-to-pass reading this programme keeps refusing. The other half: **the obvious cheap version
of a channel fix reproduced the exact bug it was fixing** — parsing the gap resolved to the
already-clean file, because a summary line and a detail line are distinguishable only by
reading, which is the one thing a regex cannot do.

## F87 — the suppression genre: the worker passes its step's check by silencing the type checker, and both halves of the reason are ours

**Status: minted 2026-08-06, branch `variance-progress-abc`. Instruments: three archived
spines — `u-mshx0zsn` (bareagent-u, wall-halt, $2.5574 of $4), `u-mshzdogs` (bareguard-u,
escalated, $1.1177 of $4) and `u-mshzvkqw` (bareagent-u, **GREEN**, $3.2994 total) — plus a
source audit of `src/planrun.js`, `src/plan.js`, `src/tools.js` and
`scripts/u-bareagent-close.mjs`, and an independent re-run of all six close stages against the
patient after the green. Session paid total through `u-mshzvkqw`: $14.4782. No library code
changed for this finding; the only change it produced is a GOAL rewrite (commit `a219e05`,
hamr: *"do 1 and rerun"*), which moved the bareagent-u spec hash to
`e2f40abd44dbb587881784433ee31ca66b067808a02c66af2081f211560b9daa` — verified by recomputing
`jobSpecHash` over the spec file as it stands.**

### The observation: three runs, two patients, one mechanism

In every one of them the plan's step went **green on its own check** and the operator's close
then redded on `no-suppressions`.

| run | patient | step exits | step outcome | outer close | run outcome |
|---|---|---|---|---|---|
| `u-mshx0zsn` | bareagent-u | `check-passes(typecheck)` + `tree-changed(src/**)` | green, iteration 2 | **11 suppressions added** | wall-halt at 25.43 min, $1.44 left |
| `u-mshzdogs` | bareguard-u | `tree-changed(src/primitives/**)` + `check-passes(typecheck)` | green, iteration 2 | **2 suppressions added** | escalated (2/2 strikes) at 13.0 min |
| `u-mshzvkqw` | bareagent-u (resume) | step skipped (already proven) | — | 1 error → **7 suppressions** → satisfied | **green**, $3.2994 total |

`u-mshzdogs` is the sharp one, because **the fix loop made it worse**. Its first outer close
named two added `any` annotations on inline predicate parameters. The fix attempt moved the
suppression rather than removing it — it deleted the parameter annotation and asserted the
shape inside the body instead:

```
src/primitives/defer-rate.js: added any  — const r = /** @type {{phase: string, action: (…)|null, decision: string}} */ (rec);
src/primitives/defer-rate.js: added cast — const r = /** @type {{phase: string, action: (…)|null, decision: string}} */ (rec);
```

One line, two hits (`any` and `cast` are separate patterns), two files: **2 → 4**. En route the
same rewrite produced two *new* strict errors of its own (`TS2322`, the narrowed predicate no
longer assignable to `(rec: object) => boolean`). The close-trend ladder read `noProgress 1`
then `noProgress 2` and struck the run out, correctly, on its own numbers: *"no stage improved
— no-suppressions 2 → 4"*.

### The wrong first explanation, and how it died

The session's first reading was: **the planner wrote a gate that is satisfiable by cheating,
and the worker cheated.** hamr's question killed it — *"panicked at running out of time if
time/cap was passed?"* — because it forced the check nobody had run: **does the worker even
know what time it is?**

It does not. Verified in source, not inferred:

- **`materialsBlock` (`src/planrun.js:113`) has exactly ONE call site**: `src/planrun.js:318`,
  inside `planPrompt` (`src/planrun.js:247`). Money, time and the progress line are rendered
  into the DRAFTING prompt and nowhere else. The `materials` spine record in these runs carries
  `phase:"draft"` and nothing carries it further.
- **The worker's system prompt is `PERSONA_TOOLS + strategyFor(granted)`**
  (`src/planrun.js:1081`). Rendered for this job's grant (`read`/`grep`/`edit`) it is
  **1,074 characters** — identical at 1,074 for bareguard's `read`/`grep`/`edit`/`write`.
- **The only two economy-adjacent sentences in those 1,074 characters** are about read/write
  economy, not about the run's allowance: *"every file you read is re-sent on every later round
  and the run has a hard budget it can exhaust before you ever write"*, and *"Rewriting a whole
  file to change one line is how trees get broken and budgets get burned"*. **No balance, no
  clock, no remaining-round count, no countdown of any kind.**

So the worker cannot be racing a deadline it has never been shown. This is not panic, and it is
not sneaking past a judge it knows about — the worker was never told `no-suppressions` exists.

### The real mechanism: a specification gap with two halves, both ours

**(a) The plan schema gives a step exactly ONE check slot.** `MAX_EXITS_PER_STEP = 2`
(`src/plan.js:36`, enforced at `:544`), and the drafter prompt states, verbatim:

> A check-passes on a write-granted step MUST be paired with a tree-changed exit (the
> repository starts green — a lone check would pass on the untouched tree).

Two slots, one of them mandatory ⇒ **one check per step**. Both plans spent it identically and
legally: `check-passes(typecheck)` + `tree-changed`. `no-suppressions` **was on the offered
menu** — the `check-menu` record in all three runs reads
`offered:["typecheck","typecheck-outside","tests-kept","suite-green","no-suppressions"]`,
`hidden:["changed-from-seed"]` — and it **could not have been added without dropping
`typecheck`**. Carrying both is inexpressible today.

**(b) The goal named two constraints; the close judges six stages.** The goal in force for all
three runs, verbatim from `job-start`:

> Make src/recurse.js and src/loop.js pass `tsc --strict` without weakening the tests and
> without introducing strict errors elsewhere.

Map it onto the close: *"pass `tsc --strict`"* → `typecheck`; *"without weakening the tests"* →
`tests-kept` + `suite-green`; *"without introducing strict errors elsewhere"* →
`typecheck-outside`; `changed-from-seed` is a precondition (`offer:false`). **Exactly one of the
six stages has no counterpart anywhere in the goal sentence — `no-suppressions` — and that is
precisely the stage that redded, in three runs out of three, on two different patients.**

Both the planner and the worker read the goal; the worker reads the step action, which
paraphrases it. The agent spent its single check slot on the check the goal sentence asks for.
**Given what it was told, that is the correct choice.** There is no misbehaviour to find here.

### The structural gap, stated as doctrine

**Nothing anywhere checks the goal text against the close's stage list.** The close is
operator-authored and named in the signed spec; the goal is a separate sentence in the same
spec; the only derivation that exists runs **close stages → the agent's check MENU**, one hop,
one direction (`stageClose(job.close)` → `checkMenu` → the `checkNames` the drafter may copy).

**That separation IS the arbiter rule and must not be weakened.** A goal that could edit the
close, or a close derived from the goal, is the agent authoring its own grader. Nothing in this
finding proposes touching it.

What is missing is not a coupling but a **read-out**: the runner already knows every stage name
at preflight — it emits them in `check-menu` and grades all six in `close-precheck` — and it
surfaces none of that to the human writing the goal. The drift between "what you asked for" and
"what done means" is unsurfaced, and the operator paid for it three times in one evening.
hamr's direction, verbatim: *"we should learn and pass advise in ui and to user that you need
clear goal and clear ask or 2 per workflow to satisfy and be clear as possible and probably
later in ui they should be split into 2 places"*.

There is a second, quieter reading worth naming. This repo's doctrine deliberately makes
illegal things **inexpressible** (the `check-passes(name)` menu is the model). Here a
**required** thing was inexpressible too — and from inside the schema the two are
indistinguishable. Inexpressibility is a guard pointed in one direction; nothing checks which
direction it is pointing.

### How the close catches it — mechanical, never judged

`no-suppressions` (`scripts/u-bareagent-close.mjs:189`) does not read intent and does not ask a
model anything:

1. `changedFiles()` — `git diff --name-only <SEED_REF>` ∪ untracked, against the frozen seed
   commit `0037182a…`, filtered to `.js`/`.mjs`/`.cjs`.
2. For a tracked file: `git diff -U0 <SEED_REF> -- <f>` and keep only lines starting `+` (never
   `+++`). An untracked file has no diff, so every line of it counts as added.
3. Grep each added line against **7 fixed patterns** — `@ts-ignore`, `@ts-expect-error`,
   `@ts-nocheck`, `eslint-disable`, `any` (in the type positions), `{*}`/`{?}` JSDoc, and the
   `@type {…} */ (expr)` cast.
4. Every hit is returned in the gap as `<file>: added <id> — <line>` (cap 40, trims announced,
   F28), followed by the advice line that names the honest alternative: *"`unknown` is fine (it
   forces narrowing), `any` and `@ts-ignore` are not"*.

Two properties follow and both matter. **Pre-existing `any` cannot trip it** — the population is
added lines only, so the stage cannot punish the patient's own history. And **the gap is the
mechanical genre (F38)**: it hands back the exact offending text, file by file, which is the
genre this programme has measured converting.

### The GREEN — `u-mshzvkqw` — and its audit

A resume of the wall-halted `u-mshx0zsn` under a signed wall raise (25 → 45 min, hash
`eb6aca00…`; **budget unchanged at $4**, so the resume folds prior spend: `priorSpentUsd`
$2.5574, `priorWallMs` 1,525,943). `resume-seed` skipped the already-proven step
(`step-skipped … provenBy:"step-end" provenSeq:92` — *"the killed run satisfied this step's
exits — it is not re-run and not re-paid"*), and the leg ran the outer close and fix loop only.

The close chain this leg, from the spine:

```
outer close   → typecheck red: 1 error   (src/recurse.js(1297,48), TS7053)
fix iter 1    → no-suppressions red: 7 suppression(s) added
fix iter 2    → satisfied
```

Suppressions across both legs went **11 → 7 → 0**: the worker went back and removed its own.
Final `close-verdict` on the spine, all six:

```
changed-from-seed satisfied · typecheck satisfied · typecheck-outside satisfied
tests-kept satisfied · suite-green satisfied · no-suppressions satisfied
```

And **independently re-verified afterwards** by the session re-running every stage of the close
against the patient tree (each line is the stage's own `green:` output, abbreviated to
stage + payload):

```
changed-from-seed  2 file(s) changed, all under src/
typecheck          zero errors in src/recurse.js, src/loop.js
typecheck-outside  67 outside, at or below the seed's 67
tests-kept         1044 executed, at or above the seed's 1044
suite-green        1044 executed, 0 failing
no-suppressions    no suppressions added across 2 changed file(s)
```

`job-end`: `outcome:"green"`, `spentUsd` **$3.2994** of $4, `spendComplete:true`; **42.5 minutes
of the raised 45-minute wall** across both legs (25.43 + 17.06), 35 worker rounds this leg. A
bridge was minted.

### The load-bearing conclusion: a loose goal was a COST hazard, never a correctness hazard

**Nothing green was ever minted mid-run.** A step passing its own check is not a verdict — it is
a form check the agent composed, and it mints nothing. The arbiter never approved a suppressed
tree in any of the three runs: the close refused every suppressed version, named every offending
line, and on `u-mshzvkqw` forced the honest fix. The loose goal cost **money and wall time** —
11 suppressions written and then unwritten, a wall-halt, a bareguard run struck out — and cost
**correctness nothing**.

This distinction is the design property that held, and it must be stated sharply because it is
easy to blur: the agent authors its checks and the operator authors the verdict, so an agent
that composes a weak check buys itself extra loops, never a green. The very separation that
allowed the drift is the same one that made the drift affordable.

### Context, uncontrolled: the haiku drop

Commit `75dfb4d` (hamr: *"haiku should be dropped to see if it passes"*) set
`STEP_MODELS = ['sonnet']` (`src/plan.js:126`) after a $0 archive read. Re-derived today over
the patient archive, the per-tier figures reproduce exactly:

| tier | steps naming it | on a replanned plan | last step of its plan | green | round bounds |
|---|---|---|---|---|---|
| haiku | 12 | 9 | 6 | **2** | 3–12 |
| sonnet | 8 | 2 | 3 | **5** | 14–32 |

(The archive totals have since grown with this session's own runs — 190 spines / 75 accepted
plans / 260 steps today against the 186 / 71 / 255 the read was taken over. The per-tier rows
are unchanged.)

Measured effect, `u-mshsikhr` (with haiku selectable) against `u-mshx0zsn` (sonnet only), the
only library difference between them being this commit:

| | with haiku | sonnet only |
|---|---|---|
| worker rounds | 120 | 87 (54 step + 33 fix) |
| wall | 21.8 min | 25.43 min |
| **seconds per round** | **10.9** | **17.5** |
| reached the outer close? | never | yes |
| ended | struck out at 2 errors, $0.85 and ~3 min unspent | wall-halt at 1 error, $1.44 unspent |

The failure CLASS changed — give-up-with-money-left became still-converging-when-time-ran-out —
and the binding constraint moved from the ladder to the clock, because better rounds are slower
rounds. **This is an intervention, not a controlled contrast**: one run on each side, a
probabilistic drafter, different plans. It is recorded as context and no causal claim is made.

### What is NOT proven

- **The green is a RESUME green at a raised 45-minute wall, not a cold green inside the $4 / 25
  min screen envelope.** So bareagent-u is **winnable**, not **screen-passed** — exactly the
  status `u-msf70nei` holds. Nothing here admits it to any frozen screen.
- **The tightened-goal question is n=0.** Commit `a219e05` rewrote the goal using the shapes
  from the close's own `SUPPRESSIONS` table (including the `unknown` carve-out, quoted from the
  close's own advice line) so goal and grader name the same things. Whether that changes what
  the planner or the worker does is **unmeasured**. `maxWallMs` was deliberately left at 45 min
  so the cap does not bind and the run measures the job's real duration.
- **The single-check-slot half is untested as a cause.** We have never run a step carrying the
  `no-suppressions` check in-run, because it is inexpressible. That a worker holding that check
  would avoid suppressions is a hypothesis, not a result.
- **One genre, two patients.** Every row here is a `tsc --strict` typing migration graded by the
  same close shape. Whether a suppression-equivalent genre exists under other closes (a test
  suite silenced by skips, a lint gate disabled) is unmeasured.
- **No claim that a clearer goal is what fixes this.** What caught every suppressed tree was the
  close, and the close did not change.

### `u-msi0w2i5` — the tightened-goal cold run: MONEY cap-halt, no verdict, inconclusive

Fired cold on the rewritten goal (hash `e2f40abd44…`), $4 / **45 min** — the wall deliberately
raised so it could not bind and the run would measure the job's real duration.

**Outcome: `cap-halt`. $4.0048 of $4, 19.2 of 45 minutes, 96 rounds, 29 allowed writes over 2
distinct files, no replan.** The MONEY ran out at nineteen minutes with twenty-six minutes of
wall unused. `spendComplete: true`; the halt is decision-ready and the kept verdict is
`needs_revision` at `changed-from-seed`, trend **converging** (`typecheck 30 → 31 → 21`).

**What the tightened goal changed, and it is not nothing:** the drafter produced bareagent-u's
**first two-step plan** — `prep-precise-types` (`tree-changed` only) then `fix-strict-typecheck`
(`tree-changed` + `check-passes(typecheck)`). Every prior bareagent plan on record, greens
included, was a single step. Step 1 greened; step 2 escalated.

**What it did NOT change:** the second step still spends its single check slot on `typecheck`
and still cannot also carry `no-suppressions` — the one-slot ceiling is untouched by wording,
exactly as predicted above. And the run never reached the outer close at all, so the close never
judged suppressions on this tree.

**Read, stated as inconclusive rather than negative.** This row does not answer whether the
tightened goal helps. It answers a different question by accident: the added prep step is
expensive. Drafting $0.6078, execution $3.3970 — the same $4 that funded a 25-minute run to a
wall-halt before now buys only 19 minutes, and typecheck rose 30 → 31 before falling to 21 (a
prep step that adds errors first is a known property of this genre, not a defect). Whether the
goal wording or the extra step is responsible is unattributed: **two things moved at once**,
which is the standing rule against reading either.

**The honest comparison at this point is a three-row table with no clean pair in it:**

| run | goal | wall | outcome | spend |
|---|---|---|---|---|
| `u-mshx0zsn` | loose | 25 min | wall-halt at 1 error | $2.5574 |
| `u-mshzvkqw` | loose (resume of the above) | 45 min total | **GREEN**, six stages re-verified | $3.2994 total |
| `u-msi0w2i5` | tightened | 45 min | cap-halt, money gone at 19 min | $4.0048 |

The green stands on the LOOSE goal. The tightened goal has produced no verdict. Nothing here
licenses "the goal fix helped" or "the goal fix hurt", and the money ceiling — not the wording —
is what ended the only run that tested it.

The cold run of bareagent-u under the rewritten goal (hash `e2f40abd…`, $4, 45 min) was still
executing when this finding was drafted. **Its outcome is deliberately not guessed here.** To be
filled in by the session with: outcome, spend, wall, whether the plan's step carried a different
check, the suppression count at the outer close (if any), and whether it greened cold. Until
that subsection is written, every claim above about the tightened goal is n=0.

### Lesson

**When the agent does the wrong thing, ask first what we told it, and second what we made it
possible to say.** Both halves were ours: a goal sentence that named two of the six requirements
the close actually enforces, and a plan schema in which the missing requirement was
*inexpressible* — one check slot per step, already spent on the check the goal asked for. The
agent's behaviour was the correct read of a specification we wrote badly, and the first
explanation ("it wrote a gate it could cheat") survived only until someone asked whether the
worker could even see the clock it was supposedly racing: 1,074 characters of system prompt, no
balance, no deadline, no countdown.

The second half is the one to keep. **A loose goal was a cost hazard and never a correctness
hazard**, because a step's check mints nothing and the operator's close is the only truth. The
same arbiter separation that let the drift happen is what made it cost money instead of a false
green — and the fix therefore belongs on the *visibility* side (surface the close's stages to
whoever writes the goal, at preflight, where the runner already knows them), never on the
coupling side.

---

## F88 — the reuse payload is now delivered COLD by the gate rules: Layer 3's lift contrast would measure a difference that no longer exists on TYPES — and reuse has always shipped the whole plan, never a template

**Date:** 2026-08-07 · **Cost: $0** (archive read only, no library code changed) ·
**Trigger:** hamr's question — *"it looks like it has a lot of scaffolding to justify
investing more time before something moves"* — asked before, not after, any paid fire.

### The reading rule, stated before the numbers

Fixed in-session ahead of the read (the standing pre-registration discipline):

- **Transferable fields** (what a bridge could hand to a different patient): step count,
  tools grant, scope, rounds, exit composition, and whether the action carries the
  iterate-until-green shape sentence.
- **Non-transferable and NOT counted:** file names, symbol names, per-patient prose. That
  content must not transfer — the N3 memorization audit kills it on sight.
- **Converged** = cross-patient plans agree on the transferable fields ⇒ the bridge carries
  nothing the cold drafter lacked. **Diverged** = they differ materially ⇒ a bridge has
  something to hand over.

### First read, and the confound that invalidated it

Nine cold greens across five patients diverged on every transferable field (step count 1–3,
rounds 8–36, scope declared in 4 of 9). Read naively that says reuse HAS something to carry.
It does not, because the sample is nine **greens** — survivor bias — and because it pools two
different instruments: the plan-validation gate changed underneath it.

`28ee95f` (2026-08-04) shipped Rule A-v2 (`check-placement`) and Rule B (`check-shed`), which
make the losing plan shapes **inexpressible** rather than merely unlikely (F81). Every run
before that commit was drafted under a different law than every run after it.

### The split read (24 runs with a captured plan; `provider-red` casualties excluded)

| | pre-rules | post-rules |
|---|---|---|
| real check on a non-final step (the losing shape) | **10/14** | **0/10** |
| single-step RLM shape | **0/14** | **8/10** |
| green | 6/14 | 3/10 |

**Self-correction, recorded rather than smoothed:** the extraction script bucketed
`u-msew1uy5` as pre-rules on its timestamp, but F81 records it as the FIRST run drafted under
the law. Moved to post. The correction strengthens the contrast, which is exactly why it is
stated — a correction that flatters the result gets more scrutiny, not less.

### What this means for Layer 3

The only thing a TYPES bridge can transfer is the shape. **The gate now hands that shape to
every cold run for free, 10/10.** The lift contrast — frozen, ~$15–25, awaiting a job-B
patient — would be paying to measure a difference the gate erased three days earlier. The
result is predictable, and a predictable result is not worth buying.

This is the CL-BENCH prediction landing on our own machinery: memory loses to plain ICL once
base capability is subtracted. Here base capability was raised by a $0 validation rule, and
the memory system's payload went with it.

### NOT claimed

- **Green rate did not improve** (3/10 vs 6/14) and no capability claim is made either
  direction: 6 of the 10 post-rule runs are `bareagent-u`, the hardest patient in the pool.
  That population is skewed and the number is unreadable as a capability signal.
- **TYPES genre only**, n=10 post-rule. The genre-bound qualifier that F51–F55 earned applies
  here verbatim. If a later genre carries shape variance the gate cannot close, reuse becomes
  live again — this finding retires an experiment, not a hypothesis.
- Nothing here says the machinery is broken. F73 proved it works end to end. It says the
  thing it transmits stopped being scarce.

### The second half: reuse ships the whole plan, never a template

hamr's question — *"you mean the whole time you have been running/reuse the exact everything
including the plan instead of the template as in steps and primitives?"* — is correct, and
confirmed at source: `src/planrun.js:542`, `startingDraft = newest.plan`. The entire
plan-as-executed is handed to the drafter as its starting draft, patient prose included. A
`baremobile` bridge carries ~1,400 characters naming `WdaTimeout`, `CLASS_MAP`,
`className.split('.').pop()` and four specific test files. Nothing strips it.

So the built arm transmits a mixture: six structural fields the gate now supplies anyway,
plus a block of prose written for a patient that is not the one being run.

### The replacement experiment (SPECIFIED, NOT FIRED — hamr's freeze required)

**Template-only reuse.** Strip the action prose; carry only what the gate does NOT set:
`rounds`, `tools`, `scope`, `attempts`, model tier, and the iterate sentence. That is the one
reuse hypothesis still standing after this read, and it has never been tested.

Directional hint, **explicitly not evidence** (n=1, and F73's runner does not reset the
patient between tries, so try 2 ran on try 1's tree): in the execution probe the same-repo
bridge — maximum prose overlap — cap-halted at $4.7442; the cross-language bridge —
effectively template-only, since none of its prose could apply — greened at $1.3971.

### Lesson

**A capability built to transmit something can be obsoleted by a cheaper rule that makes the
thing abundant.** The shape was scarce when Layer 3 was designed (10/14 plans rolled a losing
shape); a $0 validation rule made it free. The premise-replay discipline (F63) is what caught
it — the premise behind a frozen, funded, pre-registered experiment was re-read against the
archive BEFORE the fire, and it had expired under our own fix.

---

## F89 — the replan ceiling was refilled by every kill: a RUN bound implemented as a leg-local, and the audit lens is that a readout's fail-safe precedent is a ceiling's dangerous one

**Date:** 2026-08-07 · **Cost: $0** (review round + $0 source/archive audit; no paid run) ·
**Found by:** review, not by a run — which is half of why it is written down.

### The defect, confirmed by execution before any remedy

`replanned` and `varianceGrantUsed` were locals in `runPlan`. A resume is another `runPlan`
call. So the ceiling PRD v1.12 makes the RUN's — *"unlimited replanning launders thrash as
adaptation"* — was reborn full on every leg, and a run that got killed bought another one.

Driven, not reasoned about: leg 1 replanned and stopped; leg 2, entered with that leg's
`resumeSeed`, replanned again. **Run total 2 against a ceiling of 1, with every record on the
spine reading 1.** The bound was wrong and the instrument that would have shown it was wrong in
the same direction, which is why nothing ever surfaced it: a spine reader auditing the archive
for over-replanning would have found nothing to see. Two replans become four with one more
kill; the arithmetic is per-kill, not per-run.

### Why the programme's own instruments missed it for multiple releases

Every guard that exists here guards the *leg*. The strike ladder, the wallet, the wall, the
stall fuse and the variance meter all fire inside one `runPlan` call and all of them were
working. Resume was built (F75/F76/F83) with money and wall folded across the seam explicitly
and correctly — `priorSpentUsd`, `priorSpendComplete`, `priorWallMs` — and the replan ceiling
was simply not on the list of things anyone had asked "does this cross a resume?" about. It
was not a broken mechanism; it was a mechanism nobody had aimed at the seam.

The general form, which is the transferable half: **a resume seam turns every local that
bounds the RUN into an allowance the operator refills by being killed.** The test is not "is
this variable correct" — each one was — but "who bought this bound, the leg or the signature?"

### The lens this mints: fail-safe for a READOUT is fail-DANGEROUS for a BOUND

The obvious fix was to copy the seed mechanism already sitting next to it. `resumeGrades` /
`readGradeSeed` carries the dead leg's close grades across the same seam, and it has a
DOCUMENTED known limit: it reads ONE spine, so a resume of a resume inherits the previous leg's
grades and not the whole chain — the chain shortens by a leg per kill.

That limit is fine where it lives. A shortened chain can only under-claim a direction, and a
readout that under-claims produces a conservative "revise the goal" rather than a false
"keep going". Reused for a ceiling it inverts: **an under-claimed ledger is a refilled
allowance, and every kill buys one.** The precedent that is safe next door is the exact bug
one seam over.

So the fix followed the MONEY fold instead: each leg DECLARES what it inherited on its own
`job-start` (`priorReplans`, `priorReplanGrantUsed`) and the next reader adds only its own
window's `replan` records — leg 3 inherits the whole chain. Same seam, same shape of problem,
opposite correct mechanism, chosen by asking what the failure direction costs rather than by
which neighbour looked most similar.

### The sweep, because "landed at one site" is a class this repo has already paid for

The audit question generalises, so it was run rather than left as a worry — $0, over
`runPlan`'s own declarations. Money, wall and tries were already declared folds. The replan
count and its variance latch were the only two that were not. `fixIterationsUsed` and the step
strike ladder are LEG bounds by the test above — a restarted leg buys its own attempts with its
own money, which is exactly why `src/trend.js` refuses to seed ITERATIONS from history — and
correctly stay leg-local. **One class, two sites, both closed, no third.**

The same session closed a live instance of the sibling class in `src/ledger.js`:
`request-red`'s territory stamp had been fixed at one of its two synthesis sites and not at
`capability-gap`, its cap-halted form, which still hardcoded `bare-agent` in both the
occurrence and the `suggestedAsk` a human files from. Dormant today by construction and fixed
anyway, because the repo has already paid once for a fix that landed in `ci.yml` and not
`publish.yml` and then failed on the identical cause.

### NOT claimed

- **No run was ever measured over-replanning in production.** The defect is proven on a driven
  two-leg reproduction, not read off an archived run — and it could not have been read off one,
  since the records under-reported in the same direction. This is a proven-live defect with an
  unquantified field incidence, and the two are different claims.
- **Nothing here says the ceiling is the right NUMBER.** Threshold-setting is hamr's. The fix
  makes the signed number the enforced number and moves no number.
- **No capability or cost claim.** Zero paid runs; the reproduction was driven, and the only
  measurement is a count of replans.

### Lesson

**A bound is not a variable, it is a promise about a span — and the code must say which span.**
Every guard in this system was correct about the leg it lived in, and the one bound whose span
is the RUN was written the same way as the ones whose span is the leg, so a resume refilled it.
The complement is the reason it is worth a finding number rather than a changelog line: when a
seam already carries a working precedent, check what its failure direction COSTS before reusing
it, because the mechanism that is deliberately fail-safe for a readout is deliberately wrong
for a ceiling.
