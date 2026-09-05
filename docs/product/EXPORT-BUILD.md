# Export — frozen build spec (2026-09-05)

Locked from `docs/product/EXPORT-SCOPING.md` (interview complete, hamr's eight answers +
"worktree, no-resign"). Every clause below names its call site. "Built" is not "done":
done = the validation run at the bottom greened from a clean consumer directory.

## Two facts that shape the build ($0 reads, 2026-09-05)

- **Close stages spawn WITHOUT a shell** (`src/ralph.js:334` splits `cmd` on whitespace →
  `spawn(cmd, args)`), so an env token in `close[].cmd` would never expand. The bundle
  runner therefore substitutes the bundle's absolute close path IN MEMORY before `runJob`,
  and computes the `jobSpecHash` of that substituted spec for `checkApproval` itself. The
  human-facing signature is NOT that hash — it is the **bundle manifest hash** below.
- **A detached worktree is a legal workdir**: `prepareWorkBranch` (`src/workbranch.js:186`)
  creates the work branch from a detached HEAD by design ("a DETACHED head is not a
  failure"). So `bareloop run` does `git worktree add --detach <repo>/.bareloop/wt/<runid>
  HEAD` and hands that path to `runJob`; the library then mints `bareloop-<job>[-n]` inside
  it. The user's checkout is never touched.

## The bundle (a directory; `npm pack` is its shipping form)

```
<job>.bareloop/
  package.json        name, version, "dependencies": { "bareloop": "^<exporting version>" }, "bareloop": { "manifest": "manifest.json" }
  manifest.json       { schema:"bundle-v1", job, exportedAt, bareloopVersion, files:{ "spec.json":sha256, "close/…":sha256, … }, bundleHash }
  spec.json           the job spec; close[].cmd rewritten to `node $BARELOOP_BUNDLE/close/<script> <stage>`
  close/<script>.mjs  the close script(s), verbatim except `from '../src/kinds.js'` → `from 'bareloop'`
  bridges/*.json      the job's WHOLE registry history (greens and reds) — hamr Q6
  blessing.json       absent at export; written by the FIRST run (below); { bundleHash, blessedAt, runid, outcome, host }
  history.jsonl       one line per `bareloop run` on this machine: { runid, at, outcome, spentUsd, spendComplete, budgetUsd, maxWallMs, worktree, branch }
  README.md           the operator questions in the order the CLI asks them
```

**`bundleHash`** = sha256 over the sorted `files` map (path + content sha256) of
`spec.json` and every `close/*` file. Bridges and history are OUTSIDE the hash (they are
records, not the arbiter). This is the ONE signature the importer sees and stores.

## `src/bundle.js` (library, pure, testable) — new module

| function | contract |
|---|---|
| `exportBundle({ spec, closeScripts, registryDir, outDir, bareloopVersion })` | writes the directory above; REFUSES (typed reds, nothing written) when: the job has no bridge in the registry at the spec's current `jobSpecHash`; any `close[].cmd` is not `node <abs path to a .mjs> …` it can relocate; a close script imports anything the package root does not export (checked by grep over its import lines against `src/index.js`'s export list); `outDir` exists and is non-empty |
| `bundleHash(dir)` / `readBundle(dir)` | recompute from disk; `readBundle` returns `{ ok, reds, spec, manifest, bridges, blessing, history }`; a manifest whose stored `bundleHash` ≠ recomputed is `bundle-tampered` (a red, never a warning) |
| `resolveBundleSpec(bundle, bundleDir)` | the in-memory substitution `$BARELOOP_BUNDLE` → absolute `bundleDir`; returns `{ spec, approveHash: jobSpecHash(spec) }` |
| `checkEnvelope(spec, { budgetUsd?, maxWallMs? })` | tighten-only: each given number must be ≤ the spec's; a wider one is `envelope-widen` red (hamr Q8: raising = re-export) |
| `bless(dir, record)` / `verifyBlessing(bundle)` | write/read `blessing.json`; verify = `blessing.bundleHash === manifest.bundleHash`; mismatch is `blessing-stale` (re-export needed) |
| `appendHistory(dir, row)` | atomic append |

All exported from `src/index.js`; JSDoc types; `bareloop.context.md` gains a "Bundles"
section (adopter contract).

## `bin/bareloop.mjs` — new; `package.json` gains `"bin": { "bareloop": "bin/bareloop.mjs" }` and `bin/` in `files`

- bare `bareloop` → numbered menu: `1 export  2 run  3 history  q quit` (hamr Q4), then the
  same code path as the sub-command.
- `bareloop export <jobs/x.json> --registry <dir> --out <dir>` → `exportBundle`; prints the
  `bundleHash`, the file list, and the sentence "this bundle is unblessed until its first
  run greens on the importer's machine."
- `bareloop run <bundleDir> --repo <path> [--budget N] [--wall MIN] [--approve <bundleHash>]`:
  1. `readBundle` (tamper check) → `checkEnvelope` (tighten-only) → provider key from
     `ANTHROPIC_API_KEY` only (absent → print the questions and the hash, spend nothing, exit 0).
  2. **First run (no `blessing.json`):** print `formatReplay` of the minting run if its spine
     is bundled (v1: the bridge's `runid` + a note; spine bundling is NOT in v1), print the
     `bundleHash`, REQUIRE `--approve <bundleHash>` (hamr Q2: "signs at first run, same as
     the UI"). On GREEN, write `blessing.json`. On non-green: no blessing, the bundle stays
     unblessed, the outcome is in `history.jsonl`.
  3. **Later runs:** `verifyBlessing` must pass; NO `--approve` asked (hamr: "no-resign");
     `--budget`/`--wall` accepted only if ≤ spec (recorded on the spine and in history).
  4. `git worktree add --detach <repo>/.bareloop/wt/<runid> HEAD` (refuse if `<repo>` is not a
     git repo, has no commit, or the path exists); `runJob(resolvedSpec, { approvals:
     approveHash, workdir: worktree, readShim: 'cap', … })` with run-u's spine/gate-audit
     relocation into `<bundleDir>/runs/<runid>/`.
  5. Tail: outcome, spend, the work branch name, the worktree path, and the merge
     instruction (`git merge <branch>` — merge stays human), then "the worktree is kept until
     you remove it: `git worktree remove …`" (F110: never delete it for the user).
- `bareloop history <bundleDir>` → prints `history.jsonl` + the registry's `listingRow`s.

NOT in v1 (hamr Q7): the review door at the tail, softgreen, any provider but the API,
spine bundling for replay, tarball packing (use `npm pack`).

## POC first (dev rule), $0 — the riskiest seam

Before any module: prove, with a SCRIPTED provider (the `tests/planrun.test.js` helper) and
a real close script, that `runJob` (a) accepts a `git worktree add --detach` checkout as
`workdir`, mints its work branch there, and leaves the origin checkout untouched; (b) runs a
close whose `cmd` was substituted in memory from a `$BARELOOP_BUNDLE` token, with the
approval computed from the substituted spec; (c) the gate audit and spine land where the
runner points them. POC lives in the scratchpad, never ships.

## Validation (pre-registered; the definition of done)

1. `bareloop export jobs/aurora-u-spawner-types.json --registry ../bareloop-patients/bridges
   --out /tmp/…/aurora-u-spawner-types.bareloop` from THIS repo (the exporting version).
2. In a CLEAN consumer directory: `npm install <bundle dir>` against the PUBLISHED bareloop
   (a pre-release `npm pack` of the branch is acceptable ONLY for the dry step; the paid
   step below runs against a published version — release comes after, not before).
3. `bareloop run <bundle> --repo <fresh copy of ../bareloop-patients/aurora-u at d661e50>`
   with no key → questions + hash printed, $0, exit 0.
4. hamr's fire: same command with the key and `--approve <bundleHash>` → expected GREEN on
   the bundle's own close, ≤ $5, blessing written, worktree + branch left for the human. A
   red is a finding, not a retry.

## POC result (2026-09-05, $0, scripted provider) — all three PASS

(a) `runJob` on a `git worktree add --detach` checkout: work branch minted INSIDE the
worktree, `from: null`, origin checkout untouched (`status` empty, still on `main`), the
branch visible from origin via `git branch --list`. (b) In-memory `$BARELOOP_BUNDLE`
substitution: the close ran from the bundle path; approval binds to the SUBSTITUTED spec's
hash; the unsubstituted hash is refused at `runJob` step 1 (`outcome:"unapproved-spec"`,
$0, before any provider call). (c) Spine records and the gate audit both land as pointed.

**Three facts the spec above must use, corrected from the POC:**

1. Work branches are `bareloop-<slug>` (single dash; `src/workbranch.js`
   `WORK_BRANCH_RE = /^bareloop-[a-z0-9][a-z0-9-]*$/`); slash names are inexpressible.
   Every "bareloop/<job>" above reads `bareloop-<job>`.
2. `runJob`'s `approvals` is an ARRAY of `{ specHash, signer, ts }` records
   (`checkApproval` does `approvals.some(a => a.specHash === h)`), not a bare hash — the
   runner passes `[{ specHash: approveHash, signer: 'bundle', ts }]` and RECORDS the
   bundleHash → approveHash pairing in `history.jsonl` so the two never drift silently.
3. The library always writes the gate audit at `<workdir>/gate-audit.jsonl`
   (`GATE_AUDIT_FILE`, `src/kinds.js:536`); relocation to `<bundleDir>/runs/<runid>/` is
   the runner's job, the same move `scripts/run-u.mjs:1291` makes.

**Status line: FROZEN, POC PASSED. Build starts on branch `feat/export`: M1 `src/bundle.js`
→ M2 `bin/bareloop.mjs` + run flow → M3 adopter docs. No module built yet.**
