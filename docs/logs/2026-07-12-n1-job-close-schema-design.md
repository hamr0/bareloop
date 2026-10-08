# N1 — job/close schema + validator: design record

**Date:** 2026-07-12 · **Status:** designed (interview + POC complete; build next)
**Inputs:** PRD §4/§6/§7/§10, F4 (POC verdict, `poc/n1-job-schema.mjs`), interview with
hamr 2026-07-12 (four decisions below). Amend with dated addenda, never rewrite.

## What N1 is

The operator-owned half of the config story: a **job spec** (`schema: "job-v1"`) that
declares the job, its close chain, its budget, its outer write fence, and its environment
label — validated reds-before-tokens by a new `validateJob`, sibling to (never an
extension of) the workflow validator. F4's structural readout is the foundation: **two
documents, two validators, the arbiter split guarded from both sides by
inexpressibility** — the workflow config cannot say `close`/`provider` (N0, shipped), the
job spec cannot say `hooks`/`loop`/`memory` or any minting claim (new).

## Interview decisions (hamr, 2026-07-12)

1. **Human signs, always.** An agent may draft a job spec (close-authoring UX, PRD §7 —
   later rung), but no job runs until a human approves that exact spec version. Approval
   is a record *outside* the document it signs: `{ specHash, signer, ts }` — the spec
   never contains its own signature. Signing is once-per-spec-version, before any run;
   distinct from HITL closes, which fire inside every run that reaches them.
2. **One budget cap per run.** Single `budgetUsd`; run halts at cap (cap-not-estimate,
   unchanged). Per-step spend stays visible on the spine without enforcement machinery;
   per-step slices remain a legal future *tightening* once job #1 data says where they
   pay. Chain of ceilings: `workflow gate.budgetUsd ≤ job budgetUsd ≤ shell cap` — each
   layer may tighten, never exceed (the shell passes `min(shellCap, job.budgetUsd)` as
   the workflow validator's cap; no new API needed).
3. **`conditions` lands in job-v1 now.** The environment label (design law #5 / V3):
   declared-keys-only flat map, menu at N1 `providerPath | closeVerbosity | taskFraming |
   scaffold`, all optional, string values. Nothing consumes it until N3's lineage key —
   but every job-#1 run records it from day 1, so N3 starts with history, not cold.
   `provider` stays a top-level operational field and is BY DEFINITION part of the
   condition key (documented; not duplicated into the map).
4. **The job owns the outer write fence.** `writeScope` in job-v1 (operator law: job #1
   says `src/**` + `test/**`), same containment rules as the workflow scope (prefix
   containment, no mid-path wildcards, no `..`/absolute — the F9/law-#1 checks, one
   shared helper). The agent-authored workflow scope must fit inside it: cross-check in
   `validateConfig` via a new opt (`jobWriteScope`), mirroring the budget pattern —
   red `scope-escape` if any workflow prefix is not contained by some job prefix.

## Defaults taken (stated, not silent)

- **Retry cap stays shell-owned** (`capRuns`, N0 shape). The job spec cannot express it —
  unknown-field red. Revisit only with N2 run data.
- **Cadence is validated but unconsumed until N5** (Scheduler rung). Shape:
  `{ unit: hour|day|week, every: 1..30 }`.
- **`coordination-red` is reserved vocabulary only** (V7 build gate): documented in
  `bareloop.context.md` as a legal spine category; no DECISIONS entry, no machinery,
  until job #1 surfaces one (the category is the instrument — PRD v1.7 #1).
- **`validateConfig` absorbs the `{ok, reds, config}` API change** (N2+ queue item):
  returns the parsed config on ok — kills the double-parse. Additive, non-breaking.

## The schema (normative sketch — the validator is the spec)

```json
{
  "schema": "job-v1",
  "job": "litectx-maintainer",
  "description": "review -> fix -> branch -> PR; merge stays human",
  "provider": "anthropic-api",
  "conditions": { "closeVerbosity": "counts-only" },
  "cadence": { "unit": "day", "every": 1 },
  "budgetUsd": 1.5,
  "writeScope": ["src/**", "test/**"],
  "steps": [
    { "id": "review", "close": { "type": "predicate", "cmd": "npm test", "expect": 0 }, "class": "hard" },
    { "id": "fix",    "close": { "type": "predicate", "cmd": "npm run lint", "expect": 0 }, "class": "hard" },
    { "id": "pr",     "close": { "type": "hitl", "prompt": "PR opened — review and merge?" }, "class": "hitl" }
  ],
  "escalation": { "mode": "decision-ready" }
}
```

Close types and the hierarchy (PRD §7), enforced as a class menu keyed by type — verdict-
class laundering is a named red (`close-hierarchy`), proven in F4:

| type | fields (exact — extras red) | legal class |
|---|---|---|
| `predicate` | `cmd` (non-empty string), `expect` (int exit code) | `hard` |
| `gold` | `expected`, `compare` ∈ `exact\|json-equal` | `hard` |
| `rubric` | `criteria` (non-empty string) | `soft` only |
| `hitl` | `prompt` (non-empty string) | `hitl` (⇔ both directions) |

Red vocabulary carried from F4: `parse-error`, `unknown-field`, `missing-required`,
`invalid-value`, `bounds`, `duplicate-id`, `close-type`, `close-hierarchy`,
`secret-literal`; new at N1-proper: `scope-escape` (workflow vs job fence). The secrets
sweep is defense-in-depth against known token shapes, never the defense (env-only loading
stays the hard line) — bounded claim per F4.

## Module plan (build order, TDD — tests first, watch them fail)

1. `src/job.js` — `validateJob(input, {shellCapUsd})` → `{ok, reds, job}`;
   `jobSpecHash(job)` (sha256 over canonical JSON, node:crypto, stable key order);
   `checkApproval(job, approvals)` → boolean (pure; the N2 runner enforces it).
   Vocabulary constants exported like validate.js does (CLOSE_TYPES, CLASS_BY_CLOSE, …).
2. `src/validate.js` — additive: `{ok, reds, config}` return; `jobWriteScope` opt +
   `scope-escape` red through the existing `globToPrefix` helper (one transform, both
   layers — the F9 lesson).
3. `src/index.js` exports; `bareloop.context.md` adopter contract (job-v1 story,
   approval record format, ceiling chain, reserved `coordination-red`).
4. Tests: port F4's 20 cases to hermetic node:test + the new cross-checks
   (scope-escape in/out, budget ceiling chain, conditions menu, hash stability,
   approval mismatch). Mutation-validate after green (planted defects, targeted reds,
   restore) — the POC set the bar: negatives must be proven able to fail.

## Exit (rung discipline)

Typecheck clean (checkJs+strictNullChecks) · suite green incl. mutation pass ·
`bareloop.context.md` current · CHANGELOG entry (0.2.0 on release) · findings logged
(any can't-express is a finding, not a workaround). A rung that cannot meet its exit
stops the ladder; the stop is a result.

## Explicitly out of N1

Runner consumption of approvals (N2) · per-step budget slices (future tightening) ·
close-authoring/drafting UX (§7, later rung) · artifact-red + fence-robust extraction,
close timeout, tail-biased gap bound (N2 queue, F2/F4) · any S2 machinery (V7 gate).
