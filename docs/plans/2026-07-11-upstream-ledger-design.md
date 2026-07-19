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

---

## Addendum 2026-07-13 — the bareloop rewrite (module 4, `src/ledger.js`)

Graduation is a REWRITE, never a copy: the table above is adaptlearn's spine vocabulary;
this addendum locks the mapping onto bareloop's actual events (interview decisions with
hamr, 3 locked). The POC stays adaptlearn-side; the reference implementation is now
`src/ledger.js` + `tests/ledger.test.js`.

### Sources → classes, bareloop vocabulary

| bareloop spine evidence | class | lib attribution |
|---|---|---|
| `primitive-smoke{ok:false}` | `silent-degradation` | the event's `primitive` |
| `escalation{category: interpreter-red}`, detail names a store verb (`VERBS`) or litectx | `runtime-red` | litectx |
| `escalation{category: interpreter-red}`, detail names the worker loop / provider | `provider-red` | bare-agent |
| `escalation{category: interpreter-red}`, neither | `runtime-red` | `unknown` — counted, never dropped |
| `escalation{category: pricing-red}` | `pricing-red` | bare-agent (pricing-table gap; F6 — **new vs the 07-11 table**) |
| `escalation{category: provider-red}` (the runner's transport-throw seam, review 2026-07-13) | `provider-red` | bare-agent |
| `escalation{category: broken-close}` | `broken-close` | consumer (job owner) |
| `retention-red` | `retention-red` | litectx (`remember`) |
| `job-red{code: request-red}` | `request-red` | the requested verb — the red's structured `verb` field (review 2026-07-13); quoted-detail parse kept only as the fallback for older spines |
| `cap-halt` in a spine that also carries request-reds | `capability-gap` | the requested verb |
| `config-red` | `config-red` | **bareloop itself** — the config is model-drafted against OUR schema description; a repeated signature indicts the drafting prompt/schema |

### Decisions locked (interview 2026-07-13)

1. **request-red gets a distinct red code in job-v1** (`src/job.js`): a locked-but-listed
   ask (`LOCKED_TOOLS`, frozen `['run']`) reds `request-red`, never the generic
   `invalid-value` — a generic code buried admission demand as a typo, and detail-string
   matching would break silently on a rewording. A typo (unknown tool name) stays
   `invalid-value`. `capability-gap` ships but is dormant in N2: request-red is a
   job-validation red today, so the job never runs and never cap-halts in the same
   spine; it goes live when in-loop admission lands (2b deferral).
2. **New-event ruling:** `pricing-red` is IN (a lib incident — the provider path carried
   no priced cost; exactly what upstream asks are made of). Excluded, with the 07-11
   exclusions carrying over: `gate-red` (governance working as intended), `artifact-red`
   (worker story, same family as close-verdict reds), `pr-red` (operator environment —
   git/gh, not a suite lib).
3. **Shape:** pure pieces (`classifyIncidents`, `foldLedger`, `ledgerDeltas`) + ONE
   convenience collector `updateLedger({ledgerFile, spineFiles})`. The CLI in the flow
   sketch above lands at N5; the panel reads the same file at N6.

### Collector contract (sharpened from the flow sketch)

Idempotence over the corpus: pass ALL spines each time — occurrence counts are totals
computed from what you pass, and a row appends only when a key is new or its count grew.
`seq` continues monotonically across appends; rows keep spine conventions (`type` first,
`ts` stamped last). The `--status` append stays human/manual (no API — the arbiter line).
