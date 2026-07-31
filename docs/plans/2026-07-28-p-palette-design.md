# P — the primitive palette (design record)

**Status: interview complete, decisions locked (hamr, 2026-07-28, in-turn). Supersedes
nothing — implements PRD v1.27's P move. Build follows this record; deviations require a
dated amendment.**

## Locked decisions (hamr's answers, verbatim where short)

1. **Full catalog** — all four components (write · select · compress · isolate) offered in
   v1, not the evidence-sized subset. Rationale accepted: F60's "reach" was measured against
   a *named* menu; withholding Compress would just re-run that experiment.
2. **All three step-vocabulary widenings** land in v1: per-step model tier/effort, per-step
   attempt cap (tighten-only), per-step scope narrowing.
3. **Menu-is-inventory** ("yes, only available"): every verb on the menu is already
   implemented by litectx or bare-agent. bareloop wires; it never builds a capability so the
   menu looks complete. Anything a planner reaches for that does NOT exist is surfaced as an
   upstream ask ("surface things that i might be missing if any as upstream fixes") — never
   a local shim (two-red routing, unchanged).
4. **One job first** — the widened menu goes into ONE re-signed spec (litectx-u, the harder
   patient) for the first read; the second job re-signs after that read. The hash mechanics
   were explained and accepted: approval binds to the spec's exact bytes; a widened menu is
   a new hash and hamr's fresh word.
5. **The P read is one cold run vs the existing baselines** ("as described on cold run"):
   same job, same close, same caps, only the menu wider. Read: (a) does the planner select
   new verbs unprompted; (b) outcome/cost against the cold-green baselines (litectx $5.77 /
   37min; aurora $2.21, $2.47); (c) nothing regresses (plans validate, greens green).

## The catalog (inventory, not wishlist)

Verb → component mapping. Every verb names an EXISTING implementation (litectx 0.31.0 /
bare-agent 0.35.0). Worker-facing tool names keep the `ctx_`/`shell_` prefix convention.

| component | verbs (worker tool → implementation) | class |
|---|---|---|
| **write** | `write` → shell_write · `edit` → shell_edit | write-class, bareguard writeScope fence (unchanged) |
| **select** | `read` → shell_read · `grep` → shell_grep · `recall` → ctx.recall · `get` → ctx.get · `impact` → ctx.impact · `related` → ctx.getNode+related · `recent` → ctx.recentActivity | read-only by construction |
| **compress** | `compress` → litectx `compress(node,{level})` (signature-tier render of a recalled node) · `peek` → ctx.peek (head/tail of a stashed blob without paying its bytes) | read-only |
| **isolate** | `stash` → ctx.stash (park a payload out of context, restorable) · `remember` → ctx.remember (durable note) · `forget` → ctx.forget | store-write class (see fence note) |

**Fence note (the load-bearing safety line).** Isolate verbs write to the litectx STORE
(`.litectx`), never the patient tree — they bypass nothing: the writeScope fence governs the
tree, and the store is already `fs.deny` to shell verbs. But store writes create a NEW
persistence channel, handled by the cold-run rule below.

**Cold means cold (design decision, harness-side).** `remember`/`stash` persist in
`.litectx` across runs; an uncleaned store would let run N's memory leak into run N+1's
"cold" baseline and quietly poison every contrast this programme runs on (the reuse rung's
OFF arm above all). The U runner therefore purges agent-written memory at every reset,
alongside `git reset --hard` — a cold run starts with a cold store. When the reuse rung
lands, KEEPING the store becomes an explicit, ledger-attributed choice — never a leak.

**Listed-but-locked (PRD §4 disclosure ≠ admission):** `run` (locked forever),
barebrowse/baremobile surfaces. Disclosed in the menu text as locked so a request-red
against them stays a readable diagnostic; never callable.

**F22 note:** `stash` was condemned as a write-only decoy. The pairing with `peek` cures the
actual defect (nothing could ever read it back); `remember`'s old on-green-only hook timing
is gone — as a worker verb the WORKER decides when, which is the F22-approved mechanism
(per-step selection, not fixed-point hooks).

## The step vocabulary (widened, all tighten-only)

Existing six fields unchanged. New, all optional:
- `model`: from a signed closed menu (`sonnet` default, `haiku`) — per-step tier choice.
  Effort rides with tier where the provider supports it (haiku does not take
  `output_config.effort` — provider-gated, F-battery rule).
- `attempts`: per-step cap ≤ the job's `capRuns` — tighten-only, validator-enforced.
- `scope`: per-step narrowing of writeScope — must be a subset of the signed fence
  (`globToPrefix` containment, same machinery as today's scope menu; illegal =
  inexpressible where enumerable).

Arbiter unchanged and inexpressible: budget, close, fence, merge, `run` — never in the plan
vocabulary. The MENU itself stays signed; the agent may tighten, never widen.

## Build plan (modules, TDD, incremental)

1. **Catalog module** (`src/tools.js` extension): new tool defs + gate translations for
   `impact/related/recent/compress/peek/stash/remember/forget`; menu text groups by
   component with one strategy line each (F19: capability without strategy is inert).
2. **Plan validator** (`src/plan.js`): the three new step fields, tighten-only rules,
   closed-menu model values; TOOL_MENU widens to the catalog (the signed spec's `tools`
   array remains the per-job admission gate).
3. **Worker wiring** (`src/planrun.js`): per-step model/effort provider construction,
   per-step attempt cap, per-step scope intersection; ctx tool handlers for the new verbs.
4. **Runner** (`scripts/run-u.mjs`): cold-store purge at reset.
5. **Spec + signature**: `jobs/litectx-u-types.json` gains the widened `tools` array → new
   hash → hamr approves → one cold run (decision 5's read).

## Open / parked

- Upstream gaps discovered during wiring → filed per #3, never shimmed.
- aurora-u re-sign: after the first read.
- The reuse rung consumes this catalog as-is; nothing here pre-empts its design.
