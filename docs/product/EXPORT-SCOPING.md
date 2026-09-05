# Export — the product artifact: scoping DRAFT ($0, 2026-09-05)

Status line at the bottom. This is a DRAFT for hamr's interview, not a locked spec — the
standing rule is interview before locking. The design itself was answered on 2026-08-02
(`docs/wiki/product-surface.md` §"The exported artifact"); nothing below relitigates it.
This document turns that design into a buildable shape and names what only hamr can decide.

## The design as already ruled (2026-08-02, verbatim in spirit)

- The product is what LEAVES the workbench: the exported artifact, not the session.
- The bundle = the signed spec + the bridge + the close scripts + a thin runner that has
  `bareloop` as a DEPENDENCY (bare-agent / bareguard / litectx come transitively). Headless,
  enclosed CLI.
- It asks the SAME operator questions the UI would: the approval hash, the envelope
  (budget / wall / tries), the verdict class. A bundle that ran without asking would be a
  different product.
- **Export is never eject.** No generated loop code. The arbiter (close, budget, fence,
  merge) RELOCATES with the bundle inside the dependency and never disappears.
- Verdict class declared in the contract; v1 admits green only.

## What the tree says today ($0 read, 2026-09-05)

1. **Every job spec's close commands are absolute paths on hamr's machine** (13 of 14
   `jobs/*.json`, e.g. `node /home/hamr/PycharmProjects/bareloop-close/scripts/
   u-spawner-close.mjs typecheck`), and `close[].cmd` is INSIDE the signed hash. A bundle
   that carries the spec verbatim cannot run anywhere else; a bundle that rewrites the paths
   has a different hash. This is the central export fact.
2. **Close scripts import bareloop internals by relative path** (`u-spawner-close.mjs:20`
   `import { JUDGED_MARKER } from '../src/kinds.js'`) — the F110 hosting problem in another
   coat. A bundled close script must import from the `bareloop` PACKAGE; `JUDGED_MARKER`,
   `EXIT_GREEN/RED/STOP` are already on the package root (`src/index.js:127`), so this is a
   one-line import rewrite per script, not a library change — unless a script reaches for
   something not yet exported (checked per script at export time, refused loudly if so).
3. **The runner surface already exists as scripts**: `scripts/run-u.mjs` (one run, patient
   reset, approve-on-hash, watchdog) and `scripts/run-reuse.mjs` (envelope `--budget --wall
   --tries`, `--registry`, `--resume`, refuses a dirty tree). Neither ships (`files:` is
   `src/ types/ NOTICE bareloop.context.md CHANGELOG.md`); both are hamr's-machine tools
   with a job-alias table hardcoding patient paths and seeds.
4. **The library already exports the whole run path**: `runJob`, `runReuse`,
   `resolveReuse`, `reuseSpecHash`, `selectBridge`, `validateEnvelope`, `readResume`,
   `jobSpecHash`, `checkApproval`, `validateJob` — a thin runner is a caller, not new
   machinery. `package.json` has NO `bin`.
5. **A bridge is small**: `{ job, specHash, runid, greenAt, plan }`, bound to the spec hash it
   greened under — so a re-hashed spec (fact 1) expires the bridge (standing rule: a hash
   change expires bridges minted under the old hash; re-mint from a paid green).
6. Stages run with `cwd: workdir` (the patient), so a relative close path would resolve
   inside the USER's repo, not the bundle.

## Proposed shape (for the interview — nothing here is decided)

```
<job>.bareloop/                 # a directory, npm-installable, no build step
  package.json                  # { dependencies: { bareloop: "^0.20" }, bin: { run } }
  spec.json                     # the signed spec, close cmds rewritten to $BARELOOP_BUNDLE/close/…
  bridges/<job>.json            # the green bridge(s) that graduated this job (the registry)
  close/<job>-close.mjs         # the close script(s), importing from 'bareloop'
  run.mjs                       # thin runner: approve-on-hash, envelope, --workdir, --resume
  README.md                     # the operator questions, in the order the CLI asks them
```

- **Paths (fact 1):** export rewrites `close[].cmd` to a bundle-root token the runner sets in
  the environment (`$BARELOOP_BUNDLE`, resolved by the shell that runs the stage). That
  CHANGES the hash — by design the importer signs the BUNDLE's hash at first run (the same
  operator question, new surface). The bridge is re-bound to the bundle hash at export time
  — this is the one place export touches a signed artifact, and it must be visible and
  refusable, never silent.
- **Runner (facts 3–4):** `run.mjs` = the run-reuse path over a bundle-local registry (one
  job, its bridges) with run-u's approval and resume conventions; NO patient reset (the
  user's repo is not a patient copy — the work-branch rule is the fence, merge stays human);
  key from `ANTHROPIC_API_KEY` only; watchdog/inhibit printed as host advice, never grabbed.
- **Close scripts (fact 2):** copied verbatim except the import line → `from 'bareloop'`.
- **Export command:** a script in this repo (`scripts/export-job.mjs`) that reads a job by
  name, its registry, and its close script(s), and writes the directory above; refuses when
  the job has no green bridge at the current hash, when a close cmd is not a `node <script>`
  it can relocate, or when the spec carries anything the bundle cannot carry.

## Validation (pre-registered)

- $0: export `aurora-u-spawner-types` (bridge at `5d989ae7…` exists from `u-mtoqtcb5`);
  `npm install` the bundle in a CLEAN consumer directory against the PUBLISHED bareloop
  (the artifact-validation rule); `node run.mjs` with no key prints the operator questions
  and the bundle hash and exits without spending.
- Paid, hamr's fire: the bundle runs against a FRESH copy of the aurora patient at
  `d661e50`, from the consumer directory, and greens on its own close — the row's own $5.
  One run; a green proves the bundle is the same product relocated; a red is a finding.

## Questions only hamr can answer (the interview)

1. **Whose repo does a bundle run on?** The user's real repository on a work branch (the
   fence + human merge), or must it be a copy the way patients are here?
2. **Re-signing at export.** Rewriting close paths changes the hash; the bundle carries a NEW
   hash the importer signs at first run, and the bridge is re-bound to it at export. Accept
   that, or must the original hash survive (which would force close paths OUT of the hash —
   a spec-schema change)?
3. **Bundle form.** A directory with its own `package.json` (installable, publishable as the
   user's own npm package), a tarball, or both?
4. **CLI.** Does `bareloop` grow a `bin` (`bareloop export <job>` / the bundle's `run`), or
   stay a pure library with the export as a repo script and the bundle's `run.mjs` as the
   only CLI?
5. **First target.** `aurora-u-spawner-types` (cheapest, freshest bridge) — agreed?
6. **Registry in the bundle.** Only the green bridge(s) at the current hash, or the job's
   whole history (reds included, for the trust surface)?
7. **v1 scope.** Green only, API provider only, no review door at the CLI tail, no UI — or
   does the door's "accept / rerun / pause" question belong in v1's CLI?
8. **The envelope.** Fixed in the bundle (the spec's own numbers) with tighten-only at the
   CLI, exactly as `run-reuse` does — or may the importer be asked for all three every time?

## hamr's answers (2026-09-05, interview round 1)

1. **Real repo, ALWAYS on a branch, never main.** Worktree vs branch: session recommends a
   per-run WORKTREE (a separate checkout on a fresh branch; the user's own folder untouched;
   F110: a close in a shared dirty checkout dies) kept alive until the user accepts or
   discards; the user merges. hamr: "help me decide" — pending his word on worktree.
2. **Yes — signs at first run, same as the UI.** Refinement (hamr's counter-case, the
   daily ticketing automation): the bundle is a CLOSED, UNEDITABLE loop. Blessing = replay
   of the minting run shown + ONE confirming run on the importer's machine; that signature
   is STORED in the bundle; every later run VERIFIES hash == stored signature and runs
   without asking. Any change → re-export → new hash → new blessing (CLI or UI).
3. **A directory with a `package.json` that is the workflow's own map.** Tarball = one
   packed file of that directory (`npm pack`), a shipping form, not a design.
4. **Yes, a `bin`:** `bareloop export` / `bareloop run` / `bareloop history`; bare
   `bareloop` prints a numbered menu (1–3, q) — chosen because it will grow.
5. **First target: `aurora-u-spawner-types`.**
6. **Whole history in the bundle** (greens and reds).
7. **v1 = green only, API only, no door at the CLI tail.** Softgreen later, after green's
   learnings are shaped and streamlined.
8. **Tighten-only at run time, yes** — "portable n8n": export sets a wide envelope for the
   hardest case; a run may only tighten. Session's proposal on hamr's "does tighten need a
   re-sign? do they re-sign every run?": NO re-sign per run — the stored signature covers
   the spec + its MAXIMUM envelope; `--budget`/`--wall` below the maximum are runtime
   parameters recorded on the spine, never a new hash; RAISING needs a re-export. This
   diverges from `run-reuse` (envelope folded into the hash) and is arbiter-adjacent →
   pending hamr's word.

**Pending hamr:** worktree (Q1), no-re-sign-on-tighten (Q8).

**Status line: INTERVIEW ROUND 1 ANSWERED. Two rulings pending. Nothing built, no run.**
