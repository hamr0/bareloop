---
type: reference
title: "Item 33 build — non-code jobs and a judge beyond doc comments"
status: active
sources: [docs/product/PRD.md]
---

# Item 33 build

The build plan for PRD item 33 (signed by hamr 2026-09-10). The PRD holds the rulings; this
file holds the milestones, the call site of every clause, and what each milestone proves.
Branch: `feat/item-33`. Builders are sonnet (strict pin); every milestone lands green on its own.

## M1 — citation POC ($0 + one paid probe) — DONE 2026-09-11

- $0: a deterministic `citeDecide` over 5 profiles of a public fictional CV
  (career-ops `examples/cv-example.md`, MIT) × 4 judge behaviours; 16/16 tests; every rule
  mutation-proven load-bearing. Substring matching beats line-wise (a CV summary is one line).
- Paid: 5 haiku-4.5 locate calls through the real bare-agent seam, $0.0144. 4/5 as expected.
  One false red: haiku dropped `**` from a quote. One hidden wrong number ("8x" for 2 weeks →
  4 hours) that the POC author mislabeled clean and the judge passed with a real, related line.
- hamr ruled two additions (2026-09-11): **format-blind matching** (markdown stripped both
  sides, words must still match) and **numbers must match** (every number in a claim appears
  in its source quote). Honest ceiling kept in writing: code proves a quote exists, not that
  it supports the claim; a section-content rule ("soft skills are soft skills") is separate.
- Throwaway code, never shipped (scratchpad). Logged as a finding when M5 lands.
- 2026-09-11: both rules built in the POC and replayed at $0 over the saved haiku facts —
  28/28 tests; case 5 now reds for the right reason (`number-unsupported`, not the `**`
  artifact); no honest claim in the 5 real probe rows is redded by the number rule; number
  words ("three") are not checked (digits only).

## M2 — the source front door ($0) — DONE 2026-09-11

**New module `src/source.js`**, every refusal a named `{stop, code}`, never a silent fallback:

- `prepareSource({source, into, destination, output})`:
  - `source` is an `http(s)` URL, an existing file, or an existing folder. Anything else →
    `source-unreadable`. A folder that is itself a git repo root → `source-is-repo` (repo jobs
    keep `--patient`; this door is for plain folders, files and URLs).
  - URL: fetched ONCE with plain `fetch` — no credentials, no cookies, no custom headers;
    deadline `PROVIDER_TIMEOUT_MS` (`src/clock.js`, reused, no new number); body capped at
    `MAX_BUFFER` (`src/kinds.js`, reused); non-2xx → `source-fetch-failed` with the status;
    a timeout REFUSES (`source-fetch-timeout`), never falls back; content-type must be text
    (`text/*`, `application/json`, `application/xml`, `text/csv`) else `source-not-text`.
  - Text only (hamr: "start with already supported files"): any file with a NUL byte in its
    first 8 KB → `source-not-text`, naming every such file and pointing at hole H7. Symlinks →
    `source-symlink` (named, not followed).
  - `into` must NOT exist (fresh, never reused — the export worktree rule). Layout:
    `<into>/tree/input/…` (the frozen copy), `<into>/tree/output/` (where the run writes),
    `<into>/source.json` (the manifest, OUTSIDE the tree, so no worker can read or edit it).
  - **Hidden git:** `git init` in `<into>/tree`, commit the seed with a neutralized identity
    passed as `-c user.name=bareloop -c user.email=bareloop@localhost` (CI has no gitconfig),
    never touching global config. The seed sha is recorded.
  - The manifest: `{kind, source, fetchedAt, files:[{path, bytes, sha256}], seed, destination,
    output}`. Secrets never enter it (the source is a path or a URL; a URL with userinfo or a
    query key-shape is refused by the ONE secret inventory, `src/validate.js`).
- `proveDestination(destination, {into})`: absolute path; parent exists and is writable; the
  file does NOT exist (`destination-exists` — bareloop never overwrites a person's file);
  not inside `into` or the source.
- `copyOut({tree, output, destination})`: re-proves the destination, requires the output file
  exists and is non-empty, copies it, returns `{bytes, sha256}`. Never overwrites.

**Call sites (an engine with no caller is not the feature):**

1. `scripts/prep-source.mjs` (new CLI): `--source --destination --into [--output name]`;
   calls `prepareSource`; prints the tree path, seed, and the exact next command
   (`run-interview` / `run-author --patient <into>/tree`). $0, no provider.
2. **Manifest is the run instance; destination never signed** (mid-build correction,
   2026-09-11, on hamr's question about export): a job spec is a repeatable SHAPE, signed
   once (goal, checks, judge rules) — source and destination are a PER-RUN value, exactly the
   way `bareloop run <bundle> --repo <path>` varies the repo without touching the bundle's
   signature. Baking an absolute destination path into `job.js`/`jobSpecHash` would sign one
   instance where the spec is meant to describe a shape. So `src/job.js`/`JOB_FIELDS`/
   `jobSpecHash` carry NO destination field — the run instance lives entirely in the manifest
   `prepareSource` already writes outside the tree (`kind, source, fetchedAt, files, seed,
   destination, output`). The output's relative path (`output/<name>`) is what a LATER
   milestone's signed close checks — nothing to add to the job schema now.
3. `scripts/run-u.mjs`: `readSourceManifest(dirname(wd))` finds the manifest beside a
   `prepareSource`-built patient's tree (`wd` IS `<into>/tree`, so its parent is `<into>`); a
   patient the JOBS table points at directly carries none, and that absence IS "repo jobs
   untouched" — nothing invents a destination for a job that never declared one. A manifest
   that EXISTS but is unreadable/malformed is a named stop, never a silent skip.
   `frontDoorFromManifest` reduces a present manifest to `{destination, output}` or `null`.
   (a) before any token, when there is a front door, `proveDestination` — a refusal is a named
   $0 stop; (b) on a minted `green` verdict (the only outcome string a graded close ever
   mints — soft-green rides the same string, since the class lives on `spec.verdictType`,
   never on `outcome`), `copyOut`, and a spine record `destination-written {path, bytes,
   sha256}` or `destination-refused {code, detail}`. A refused copy-out never changes the
   verdict (the verdict is the close's).
4. NOT wired this milestone, named: `bareloop run` (bundle, `src/cli.js`) still requires
   `--repo`; export of a front-door job is parked to after M5.

**Proof:** behavioural tests on real git in temp dirs (neutralized identity, hermetic), a real
local `node:http` server for the URL paths (200 text, 404, binary content-type, oversize,
silent server → timeout refusal); every refusal code reached by a test; fail-first shown per
changed test file. Suite, typecheck, build:types exit 0.

**Landed** (`tests/source.test.js`, 29 tests, fail-first 1/1 files): every refusal code named
above is reached — `into-exists`, `source-not-text` (folder + URL), `source-symlink`,
`source-is-repo`, `source-fetch-failed`, `source-fetch-timeout` (injectable bound, never the
600s production default), `source-fetch-oversize` (streamed past the REAL `MAX_BUFFER`
ceiling, no crafted shortcut), `destination-output-required`, `destination-in-source`,
`destination-not-absolute`, `destination-exists`, `destination-parent-missing`,
`destination-parent-unwritable`, `destination-contained`, `destination-output-missing`,
`destination-output-empty`, `source-manifest-invalid`. One gap, named rather than papered
over: the two `scripts/run-u.mjs` call sites cannot be driven through the script itself
without a live provider key past the JUDGES/key gate that runs before them (this repo makes
no paid/model calls in its suite) — every piece of LOGIC at those call sites is proven
directly, and one source-text test proves only that the script actually wires them.

## M2b — review fixes (hamr, 2026-09-11) — IN PROGRESS

An audit after M2 (hamr: "what did you gloss over?") found a live hard-line breach and gaps.
Rulings and the fix list, in build order (all edit `src/source.js` — ONE builder at a time):

1. **Secrets never enter the tree** — BUILDING. A live smoke put a `.env` carrying an
   `sk-ant-`-shaped key into `input/` and the hidden-git seed. Fix: every frozen file's whole
   content (folder, file, URL body) goes through the ONE inventory (`scanSecrets`) before
   anything is written; a hit refuses `source-carries-secret`, naming path + pattern name
   only, nothing created on disk. Residual: a secret whose shape is not in the inventory.
2. **`.env` refused by name** (`.env`, `.env.*`), whatever its content (hamr: yes).
3. **16 MB cap PER FILE** (`MAX_BUFFER`, reused) for folder files and single files; the URL
   body already has it. No folder-total cap (hamr's call).
4. **Date in the delivered name** — `output/profile.md` lands as `profile-YYYY-MM-DD.md` at
   the destination; a same-day second delivery gets `-2`, `-3` (the work-branch rule). Never
   overwrites. The spine records the real path.
5. **Redirects visible** — the final URL after redirects is recorded in the manifest and
   printed, so a login page cannot become the source unnoticed.
6. **The seed holds every copied file** — a `.gitignore` inside the source must not drop files
   from the seed (manifest file list == `git ls-tree` of the seed, checked); a nested `.git`
   anywhere below the root refuses `source-nested-repo`.
7. **Repo in, file out** (hamr: yes — the PR-review job) — a repo source is COPIED with its
   history (never used in place), gets the same `output/`, manifest, destination and copy-out.
   Its guards (the repo stays untouched) come with M4.
8. **The folder note** (hamr): `prep-source` prints, whenever the source is a folder: "make a
   new folder, put only the file(s) this job needs in it, point bareloop at that — never your
   original folder". Same line in `bareloop.context.md`; the panel (N6) shows it beside the
   Source field.

Also owed: the PRD item 33 tick for M1/M2/M2b, and a FINDINGS entry for the M1 citation POC
and the M2 secrets breach. Honest status of M2: built and unit/smoke-proven; it cannot run as
a real job until M3 (the form) and M4 (non-code checks) exist; the run-u wiring is proven by
source text only until the first real run.

## M3 — the intake form and confirm turn ($0 build, paid proof later)

The six fields (Goal / Source / Destination / What success looks like / Guardrails / Judge
examples — the last only when soft-green is picked); `src/authorflow.js` question sets
re-shaped, answers still verbatim (`src/authorjob.js:298`); no language question (H5);
the "here's what I understood" turn, 2 rounds max; the genre may never add a close stage the
goal does not state (the `tsc --strict` stage in `mtv8jihy`). Detailed before it starts.

## M4 — non-code checks and guards

New kinds beside `LIVE_KINDS` (`src/kinds.js:142`, runners at `:1930`, catalogue
`src/authoring.js:278+`, validator `:1496+`): output exists and non-empty; word / line / row
count in range; named headings present; CSV named columns; JSON shape. Guards for plain-folder
jobs: `input/` untouched; nothing written outside `output/`. H2: the output path may be absent
at the seed. Detailed before it starts.

## M5 — the judge

The citation rule (format-blind, numbers must match, every output sentence covered) joins
`JUDGE_RULES` (`src/judged.js:298`) beside the doc-comment rules; locate learns a prose
prompt; calibration cases (10, floor 10/10) generated from the signer's judge examples AND
the job's real input (`src/cardauthor.js`). Detailed before it starts.

## M6 — web search

A barebrowse verb (read, type, click to search; never submits a payment or booking form);
the arbiter keeps its own record of what barebrowse returned; the close checks the output
against that record. Detailed before it starts.

## M7 — proof fires (paid, hamr's word each)

Item 25 step (4): 31.5 calibration on a real bar; 31.4 green on gemini with
`ANTHROPIC_API_KEY` unset; plus one plain-folder green and one soft-green end to end.
