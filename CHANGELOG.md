# Changelog

All notable changes to bareloop are documented here. Format:
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning:
[SemVer](https://semver.org/spec/v2.0.0.html). Pre-1.0: **minor** = a ladder rung or
feature lands, **patch** = docs, fixes, scaffolding.

## [Unreleased]

### Added
- **N1 — the job/close schema (rung 2 of the ladder).** `validateJob` (`src/job.js`):
  the operator-owned `job-v1` spec — the arbiter's rulebook as pure declarative data
  (close chain, budget, outer write fence, environment label, escalation), validated
  reds-before-tokens with pinned `code:path` reds. The arbiter split is guarded from
  both sides by inexpressibility (workflow config can't say `close`/`provider`; job spec
  can't say `hooks`/`loop`/`memory`, minting claims, or the shell-owned retry cap).
  Close-authoring hierarchy (PRD §7) enforced as a class menu keyed by close type —
  verdict-class laundering (`rubric` claiming `hard`) is a named red `close-hierarchy`.
  `jobSpecHash` + `checkApproval`: the pure half of human-signs-always (sha256 over
  canonical JSON; an edited spec is unapproved by construction; the N2 runner enforces).
  Design record: `docs/plans/2026-07-12-n1-job-close-schema-design.md`; POC verdict: F4.
- **Two-layer write fence.** `validateConfig` accepts `jobWriteScope` (the job spec's
  operator-owned outer fence); every workflow scope must fit inside it — path-boundary
  aware (`src2` is not inside `src`) — or it reds `scope-escape`. Same containment law,
  same code, both layers (the F9 lesson).
- **Reserved spine vocabulary: `coordination-red`** (V7, PRD v1.7 #1) — documented in
  `bareloop.context.md`; no machinery until job #1 surfaces one.

### Changed
- **`validateConfig` returns `{ ok, reds, config }`** — the parsed config on ok, `null`
  on any red; kills the interpreter's double-parse (N2+ queue item absorbed). Additive
  for callers reading `ok`/`reds`.
- **Review hardening (post-build /code-review, 8 findings fixed + 6 sub-cap cleanups;
  all fixes negative-tested and mutation-checked, zero feature regressions):**
  cadence/escalation red unknown keys (the last smuggling level in a signed spec is
  closed); the `jobWriteScope` fence opt fails CLOSED — a malformed fence is its own
  `fence-invalid` red, never silently skipped, and each escaping scope reds at its own
  indexed path (`gate.writeScope.N`); scope normalization moved into the shared
  `globToPrefix` (leading `./`, interior `/./`, `//`, trailing `/` collapse) so a
  validateJob-green fence like `src/` no longer deadlocks contained workflow configs;
  `canon()` follows JSON semantics (undefined-valued keys dropped) so approvals survive
  a disk round-trip, and `checkApproval` never throws (non-JSON spec → `false`);
  `SECRET_RE` gained a left boundary (`flask-sqlalchemy` no longer reds) and the sweep
  is shared by BOTH validators — the agent-authored workflow config is now swept too;
  `interpret` accepts `jobWriteScope` and enforces the fence at the choke point (entry
  + revision candidates); revision candidates are judged and installed on their PARSED
  form (a JSON-string candidate no longer false-reds arbiter-touch); exported arbiter
  menus are frozen; `isObj`/`isNonEmptyString` single-copied in `validate.js`.
  Upstream ask filed: bareguard should export its secret patterns (UPSTREAM-ASKS).

### Fixed
- **Second-round review (self-review of the hardening commit found a regression IT
  introduced — all fixes TDD'd, mutation-checked, zero feature regressions):**
  **critical containment escape** — the fence-normalization added to `globToPrefix`
  stripped a leading `./` before collapsing `//`, so `.//src/**` minted the ABSOLUTE
  prefix `/src`, validated green, and resolved outside the run directory at enforcement
  (design law #1); fixed by collapsing `//`+`/./` first (so `.//src/**` → `src`, safe),
  a belt in `scopeContained` rejecting any normalized-absolute prefix, and an enforcement
  belt in `interpret` that refuses to build a Gate whose resolved scope escapes the
  workdir. `canon()` now honors `toJSON` (a `Date` no longer hashes as `{}`; distinct
  values no longer collide) and `jobSpecHash` never throws (the minting path the runner
  calls directly is now crash-free on `BigInt`/cycles). `SECRET_RE` left boundary extended
  to `-`/`_` (`pipeline-sk-transform-utils-v2` no longer false-reds; real keys still red).
  `jobWriteScope: null`/`undefined` are the legitimate no-fence spellings (no more deadlock
  on every config); a malformed fence reds `fence-invalid` at path `jobWriteScope`, not the
  innocent workflow field (no ledger misattribution), with the detail bounded. Shared
  `legalScopeEntry` gives the scope-legality law one home across all three call sites.
- `NOTICE` ships in the tarball (npm auto-includes LICENSE/README but not NOTICE; Apache-2.0
  wants both) — found validating the installed 0.1.0 artifact.

## [0.1.0] — 2026-07-11

### Added
- **PRD addendum v1.5: the upstream ledger.** Auto-detected upstream fixes + user-facing
  workflow debugging, derived purely from the spines: 8 lib-incident classes (test reds
  and budget halts excluded by design — workflow stories never pollute the upstream
  queue), signature-deduped counts, append-only state-as-fold, human-appended fix
  lifecycle (the tool drafts, never files). Two audiences, one file: panel workflow
  health (N6) and the maintainer's pre-drafted UPSTREAM-ASKS queue. New admission
  obligation ~N2/N3: per-job known-answer `primitive-smoke` before tokens — the only
  detector for silently-degrading primitives (adaptlearn A3 class). Spec + reference
  implementation upstream in adaptlearn (validated: re-derived the menu-probe session's
  incidents, zero false positives from ~100 close reds).
- **F2 + PRD addendum v1.4: the menu probes return (adaptlearn F21/F22).** The v1.1 §4
  graduated-disclosure open question RESOLVED: the registry gate is met (menu axis
  wired-in; admission chain proven end-to-end) — the request-red registry builds ~N3/N4.
  Author selection is cargo-cult (zero need signal; picks are a superset of need); need
  reads off the ledger (within-run request-red frequency + outcome contrast); curation is
  evidence-driven, never appetite-driven. New doctrine: partial retrieval poisons gap
  attribution. N2 requirements filed: artifact-red category, fence-robust extraction.
- **N0 — the token-free rung (PRD §10).** The five spine modules, rewritten from the
  adaptlearn originals (graduation-is-a-rewrite): `src/spine.js` (append-only JSONL
  emitter; seq monotonic, ts last), `src/ralph.js` (the dumb shell: close exit code =
  truth, cap-halt its own category, decision-ready escalations), `src/validate.js`
  (schema v1 predicate — named reds before tokens; litectx-bound vocabulary; `diffPaths`
  one-knob checker), `src/interpret.js` (the only config reader; composes Gate + LiteCtx +
  Loop; mid-run revision seam with interpreter-owned acceptance; emits `config-final` —
  the run-as-executed record, design law #2), `src/extract.js` (rules distiller: one
  sealed shot, bounds enforced mechanically, rejected whole). 70 tests carried from
  adaptlearn's reference semantics, all hermetic and token-free (scripted stub providers).
  Rigging per LIBRARY_CONVENTIONS: tsconfig (checkJs + strictNullChecks), `typecheck` /
  `build:types` / `prepublishOnly` scripts, `.github/workflows/ci.yml`
  (typecheck → build:types → test, no lint). Deps: litectx ^0.28.0, bareguard ^0.12.0,
  bare-agent ^0.26.2. Code-review hardening (two rounds, all guards watch-it-fail
  validated): writeScope **containment reds** (no absolute/Windows paths, no ".."
  segments, not the run dir itself — a scope can never reach the arbiter's inputs,
  design law #1); **verb placement tightened** — each verb legal only in its one
  effective slot (recall/compress → before-attempt, stash → after-red, remember →
  on-green; an inert-but-listed op is a fake knob in the contrast evidence, law #3);
  **prototype-safe lookups** (`Object.hasOwn`) in the validator's param check and the
  shell's escalation decision map; **silent-red gap sentinel** (a close that exits
  nonzero with no output must not kill feedback/stall detection); spine **reserved-key
  guard** (type/seq/ts are the envelope's, by mechanism); shared **`globToPrefix`** and
  **`stripFences`** (`src/text.js` — one copy each, F9-class drift guards);
  `extractRules` **never throws** (provider transport errors degrade to a
  `provider-error` red as data); halt-as-return guard in `ask()` (bare-agent returns
  `{error: 'halt:…'}` rather than throwing — forward armor for N2's tool loops); honest
  cost emit (`metrics.costUsd ?? cost` — unpriced stays null, never a silent zero);
  **package entry point** — `src/index.js` + `main`/`types`/`exports` map per
  LIBRARY_CONVENTIONS §2 (the shipped `.d.ts` were previously unreferenced and the
  package unimportable); a `CategorizedError` typedef and a `RecallHit` typedef replace
  every `any`-cast (CLAUDE.md library-shape rule).
- **F1 in `docs/FINDINGS.md`:** first `npm install` as a suite consumer surfaced two
  upstream gaps (stale bare-agent peer range; GateDecision/Decision null-reason type
  drift) — both fixed upstream and consumed via bare-agent 0.26.2, per two-red routing.
  No shims.
- PRD **addendum v1.3** + CYBERNETICS.md O1–O5: the orchestration position — not a second
  runtime modality (credit attribution, accumulation, the arbiter — grounded in F15–F20);
  convergence path is orchestrate-first-encounter → crystallize via run-as-executed
  inheritance; admission only by pre-registered probe.
- PRD **addendum v1.2**: the menu-breadth (graduated-disclosure) probe is assigned to
  adaptlearn (successor-POC track, F19/F20 style) and returns to bareloop as findings;
  the registry-gating separation requirement is unchanged.
- PRD locked at **v1** (2026-07-11) after the bloat audit: §6→§9 open-questions dedup,
  §4 secrets-never-enter-the-spine invariant, §5 mobile-responsive mandate. Amendments
  from here are dated addenda, never rewrites.
- PRD **addendum v1.1** (post-lock interview + adaptlearn cross-check): panel layout and
  web-CLI command bar; full five-package primitive disclosure with the **two-red routing
  rule** (locked-but-exists → in-loop registry admission; missing/broken → fix baresuite
  and consume, never a local shim); **graduated-disclosure** open question pre-registered
  with M3 discipline (minimal-menu vs +1-extra contrast must separate before the
  request-red registry is built) — verified never exercised in adaptlearn.
- Panel spec — **PRD Appendix A** (provisional; briefly `PANEL.md`, folded into the PRD
  same day — one product doc): two panes (left chat + command bar speaking the exact
  headless-CLI verbs; right progress/cost/step over results cards); primitive menu
  grouped under recall / compress / stash / remember (provisional); context-graph third
  view reserved (consumes litectx `ContextGraph` + the spine); mobile stacks; headless
  first.
- `.github/workflows/publish.yml` — npm trusted publishing (OIDC, no token), manual
  dispatch, idempotent, asserts registry end-state.
- `bareloop.context.md` — adopter contract per LIBRARY_CONVENTIONS §3 (draft; API
  sections fill in as rungs land). `LICENSE` + `NOTICE` (Apache-2.0, matching the suite;
  corrects the 0.0.1 placeholder's MIT declaration).
- README rewritten in the bareagent shape: banner, badges, agent-first quick start,
  layers/verdict tables, science table, ladder roadmap, ecosystem section.

### Changed
- `docs/UPSTREAM-ASKS.md` repurposed: upstream-gap **fix queue** only (we own baresuite —
  fix-and-consume, version bump; request-red admissions resolve in-loop and never land
  here).
- Repo hygiene per LIBRARY_CONVENTIONS §7: `.claude/`, `.litectx/`, `.idea/` ignored and
  de-tracked; `CLAUDE.md` stays tracked as the agent-doctrine file.
- `package.json` takes the library shape: `"type": "module"`, Node `>=20` (bareguard's
  floor governs), `files` ships `src/` + `types/` + the doc set (paths land at N0);
  repository/homepage links to GitHub.

## [0.0.1] — 2026-07-11

### Added
- **Repo cut** from the adaptlearn seed per the close-out plan (adaptlearn archived and
  closed at v0.11.1 — the science behind this product).
- **Named `bareloop`** (working dir renamed from the `looped` placeholder; `looped` and
  `reloop` verified squatted on npm). Name reserved: `bareloop@0.0.1` published to npm —
  README + package.json only, no code.
- Seed docs: PRD (named, v0.2 at the time), design record
  `docs/plans/2026-07-10-agentic-automation-successor-design.md` with the naming
  resolution annotated, adaptlearn FINDINGS F1–F20 + CYBERNETICS.md carried as closed
  records in `docs/00-context/`.
- Scaffold: `CLAUDE.md`, fresh `docs/FINDINGS.md` (numbering starts at F1),
  `docs/UPSTREAM-ASKS.md`, guardrails pre-tool hook (local), `.gitignore`.
- Public GitHub repo `hamr0/bareloop`, `main` branch.

[Unreleased]: https://github.com/hamr0/bareloop/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/hamr0/bareloop/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/hamr0/bareloop/releases/tag/v0.0.1
