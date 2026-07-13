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
