# bareloop — findings

No papering over. Every friction point — with the bare suite (filed in
`docs/UPSTREAM-ASKS.md` and upstream), with the schema (a "can't express" is a finding, not
a workaround), or with the build ladder (a rung that can't meet its exit stops the ladder;
the stop is a result) — is logged here, grounded in source (file:line) or in the spine
(run + seq). "Works as intended" is also a finding.

Numbering starts at F1 in this repo. adaptlearn's F1–F20 are a closed record at
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
