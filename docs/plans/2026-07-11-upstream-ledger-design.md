# Upstream ledger — reactive lib/primitive incident monitoring (bareloop-destined)

> Designed in the adaptlearn sandbox against its archived spines; reference implementation
> `poc/upstream-ledger.mjs` (stdlib-only, ~180 lines). Ships to bareloop as a feature; here it
> is a POC'd spec. The A1/A2/A3 upstream-ask flow, mechanized: the loop generates the
> evidence, the ledger standardizes it, the human files/fixes/consumes upstream.

## The problem it solves

Every primitive failure class already lands on the run spines as a typed event — but scattered
across hundreds of per-run files, in five different shapes. Debugging a workflow or preparing
an upstream fix means re-reading spines by hand (this session did it three times: F21's
clobber, A3's silent index, run-1's provider crashes). The ledger is the missing fold: one
append-only JSONL both the consumer (bareloop's panel) and the maintainer read.

## Sources → classes (grounded in observed spine events)

| spine evidence | incident class | lib attribution |
|---|---|---|
| `config-red` (verb-params / unknown-verb) | `config-red` | verb→lib map |
| `escalation{category: interpreter-red}`, detail matches provider | `provider-red` | bareagent |
| `escalation{category: interpreter-red}`, detail matches a verb/store | `runtime-red` | verb→lib map |
| `escalation{category: provider-red}` (retry-exhausted seam) | `provider-red` | bareagent |
| `escalation{category: broken-close}` | `broken-close` | consumer (job owner) |
| `retention-red` | `retention-red` | litectx (remember) |
| `request-red` (locked/absent primitive asked) | `request-red` | verb→lib map |
| `cap-halt` **in a spine that also carries request-reds** | `capability-gap` | the requested verb |
| `primitive-smoke{ok:false}` (product-side per-job smoke assertion) | `silent-degradation` | asserted verb |

Deliberate exclusions: bare `cap-halt` (a budget story, not a lib incident); `close-verdict`
reds (worker/harness story — the whole §5b point is these are NOT lib bugs).

`silent-degradation` is the class that CANNOT be derived from failures — A3 proved silent
gaps throw nothing. Product rule: every admitted primitive gets a per-job known-answer smoke
(F21's "impact must return 8/8" generalized), emitted as a `primitive-smoke` event before the
loop spends; a false one is the incident.

## The ledger (append-only JSONL, spine conventions: `type` first, `ts` stamped last)

Two row types; current state is a FOLD, never a mutation:

```jsonl
{"type":"lib-incident","key":"litectx:impact:runtime-red:a1b2c3d4","lib":"litectx","verb":"impact","class":"runtime-red","sig":"a1b2c3d4","detail":"<first-seen, normalized, ≤300 chars>","occurrences":7,"samples":[{"world":"RuUllB","cell":"run-D2-0","seq":5,"iteration":1}],"suggestedAsk":"litectx: `impact` threw at runtime — …","seq":3,"ts":"…"}
{"type":"lib-incident-status","key":"litectx:impact:runtime-red:a1b2c3d4","status":"filed","ref":"UPSTREAM-ASKS A4","seq":4,"ts":"…"}
```

- **key** = `lib:verb:class:sig`; `sig` = short hash of the path/number-normalized detail, so
  the same bug across worlds dedupes and distinct bugs in one verb don't merge.
- **occurrences** is cumulative; the collector appends a new `lib-incident` row only when a
  key is new or its count grew (append-only delta, no rewrites).
- **status lifecycle** (human-appended, mirrors UPSTREAM-ASKS): `open` (implicit) → `filed` →
  `fixed` → `consumed`. The fold shows the latest status per key.
- **suggestedAsk** is a template seed for the UPSTREAM-ASKS entry, never auto-filed — filing
  stays human (the arbiter line, maintainer form).

## Flow

1. Runs write spines (unchanged — the ledger adds NO new obligations to the loop; only the
   per-job `primitive-smoke` events are new, and they're shell-owned).
2. `node upstream-ledger.mjs --ledger upstream.jsonl <spineDir|file>...` — pure listener:
   classify, dedupe, append deltas, print the folded table (worst-first: silent-degradation,
   runtime-red, provider-red, capability-gap, request-red frequency-ranked, …).
3. Consumer debugging: the folded table IS the workflow-health view (bareloop panel reads the
   same file). Maintainer: pick a row, its samples point at exact spine seqs; file the ask
   upstream (`--status key=filed ref=A4`), fix in the package repo, bump, `--status consumed`.

## Non-goals

- No auto-filing, no auto-fixing — evidence in, human judgment out (A1/A2/A3 stays the flow).
- Not a metrics system — it's an incident ledger; rates/dashboards are folds someone else runs.
- Never a mutation of spines — spines stay the ground truth; the ledger is derived and
  reconstructible from them (delete it and re-run the collector: same fold).
