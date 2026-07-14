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
