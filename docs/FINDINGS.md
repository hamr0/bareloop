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
