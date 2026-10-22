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

## M2b — review fixes (hamr, 2026-09-11) — DONE 2026-09-12

An audit after M2 (hamr: "what did you gloss over?") found a live hard-line breach and gaps.
Rulings and the fix list, in build order (all edit `src/source.js` — ONE builder at a time):

1. **Secrets never enter the tree** — DONE. A live smoke put a `.env` carrying an
   `sk-ant-`-shaped key into `input/` and the hidden-git seed. Fix: every frozen file's whole
   content (folder, file, URL body) goes through the ONE inventory (`scanSecrets`) before
   anything is written; a hit refuses `source-carries-secret`, naming path + pattern name
   only, nothing created on disk. Residual: a secret whose shape is not in the inventory.
2. **`.env` refused by name** (`.env`, `.env.*`), whatever its content (hamr: yes) — DONE
   (`source-env-file`, folder walk / single file / URL-derived name alike).
3. **16 MB cap PER FILE** (`MAX_BUFFER`, reused) for folder files and single files; the URL
   body already has it. No folder-total cap (hamr's call) — DONE (`source-file-oversize`;
   repo sources exempt, a real repo legitimately carries large/binary files).
4. **Date in the delivered name** — DONE. `output/profile.md` lands as
   `profile-YYYY-MM-DD.md` at the destination; a same-day second delivery gets `-2`, `-3`
   (the work-branch rule), cap 99, past which `destination-exists`. Never overwrites. New
   exports `datedDestination`/`pickDelivery`, used by both `proveDestination` (the $0
   pre-flight) and `copyOut` (the delivery) so the two can never disagree; `copyOut` returns
   `{bytes, sha256, path}` and `run-u.mjs` spine-records the real landed path
   (`destination-written {path, declared, bytes, sha256}`).
5. **Redirects visible** — DONE. `fetchOnce` returns `finalUrl`; it is secret-scanned the
   same way the typed URL is, recorded in the manifest, and printed by `prep-source`
   whenever it differs from what was typed, so a login page cannot become the source
   unnoticed.
6. **The seed holds every copied file** — DONE. `git add` runs `-f` so a `.gitignore` inside
   the source cannot drop files from the seed; the seed is read back with
   `git ls-tree -r --name-only HEAD` and diffed against the manifest's file list by name
   (`source-seed-incomplete` on a shortfall). A nested `.git` anywhere below the root
   refuses `source-nested-repo`.
7. **Repo in, file out** (hamr: yes — the PR-review job) — DONE. A repo source
   (`kind: 'repo'`) is COPIED with its history (never used in place), working files land at
   the TREE ROOT (no `input/` prefix), `output/` is added, and the seed commit goes on top
   of the existing history. A `.git` FILE (linked worktree/submodule) refuses
   `source-is-linked-worktree` rather than silently committing into the original.
   **Live-proven defect found and fixed during this review, not in the original fix list:**
   a copied `.git/hooks` carries the SOURCE repo's own `pre-commit`/`commit-msg`/
   `post-commit` scripts, and `git commit` ran them — arbitrary code from the source repo,
   executed inside bareloop's own process, before a single token spent (reproduced live: a
   planted `pre-commit` hook fired and left a marker file). Fixed with two independent
   layers: the copied `hooks/` directory is stripped right after the `.git` copy, and every
   git call this door makes pins `core.hooksPath` to a path that is never created, so a
   `core.hooksPath` set in the copied `.git/config` pointing elsewhere cannot reopen the
   hole either. Fail-first shown (hooks fired with either layer alone reverted; neither
   fires with both in place); regression test locks it in
   (`tests/source.test.js`, "a repo source carrying a pre-commit hook never runs it").
   Its guards (the input stays untouched) come with M4.
8. **The folder note** — DONE. `prep-source` prints, whenever the source is a folder: "make a
   new folder, put only the file(s) this job needs in it, point bareloop at that — never your
   original folder". Same line in `bareloop.context.md`; the panel (N6) note is still owed
   (N6 itself is unbuilt).

Also owed: the PRD item 33 tick for M1/M2/M2b, and a FINDINGS entry for the M1 citation POC,
the M2 secrets breach, and the M2b hooks breach. Honest status of M2/M2b: built and
unit/smoke-proven; it cannot run as a real job until M3 (the form) and M4 (non-code checks)
exist; the run-u wiring is proven by source text only until the first real run.

## Destination model corrected (hamr, 2026-09-12) — REWORK DONE 2026-09-12

hamr ruled the Destination model tonight, in conversation, and explicitly approved recording
it. Condensed, keeping his framing:

- Source and Destination are ALWAYS asked, for both green and soft-green, repo and non-repo
  alike.
- Source can be a subdirectory or a single file.
- **Destination is a DIRECTORY, never a filename.** It may already exist; it is a spot nothing
  has been written into yet.
- If the destination is the SAME directory as the source, changes are permitted inside that
  directory and nowhere else ("i can limit your actions to a certain fix in a certain dir and
  your output will also be there").
- A job may produce MORE THAN ONE file (his example: a flight search producing one sheet for
  "SFO→LAX red-eye" and another for "SFO under $700").
- The AGENT names the output files: meaningful names, timestamped, so a new write never
  overwrites an old one.
- Repo jobs are UNCHANGED by all this: `writeScope` (the signed job field, "the fence is
  operator law", `src/job.js:363`) already IS the destination for a repo job, and it is a LIST
  of globs — so "you may write `/src/` and `/tests/`" is already expressible. Repo runs stand
  on a work BRANCH (`prepareWorkBranch`, `src/planrun.js:1922`), never a worktree; a patient
  with no branch is the named stop `branch-red`, no fallback. A PR-review job is just a repo job
  whose output lands in the repo at the destination path.
- Non-repo jobs keep the same shape, on a fresh folder with hidden git that bareloop owns.

**REWORK DONE — what the M2/M2b door got wrong, and what changed** (this reworks only the NEW
non-repo door built in M2/M2b; the existing repo flow's OWN semantics — `writeScope` as the
fence — are untouched, which is how every green job to date ran):

1. **DONE.** `destination` is a DIRECTORY now, not a single FILE path — `proveDestination`
   proves the directory is usable (exists as a directory and writable, or creatable); it no
   longer knows or cares about individual delivered file names, since those are not known
   until the run produces them.
2. **DONE.** A destination directory that already exists is legal (`destination-exists` is
   retired as a prepare-time refusal for the destination itself — it survives only as
   `copyOut`'s per-file same-day-slot exhaustion refusal, at delivery time). An existing
   non-directory at the destination path refuses the new `destination-not-directory`.
3. **DONE.** `destination-in-source` is gone — a destination inside the source (the same-dir
   case) is legal for every kind, not just repo jobs.
4. **DONE.** `copyOut` no longer takes an `output` parameter at all — it lists `tree/output/`
   itself and delivers every non-empty file found there (excluding `output/.gitkeep`), each
   under its own dated name via the SAME `datedDestination`/`pickDelivery` machinery (M2b item
   4, unchanged). Returns `{files: [{path, bytes, sha256}]}` instead of a single object. The
   single-file `output` manifest field and its `output-invalid` validator are removed entirely
   — the escape vector they guarded (`output/../../x`) is now closed structurally, since
   `copyOut` never reads a manifest-declared path.
5. **DONE, repo destination.** A `kind: 'repo'` source's `destination` is recorded as the
   declared WRITE FENCE and is never proven as a filesystem directory or copied into —
   `frontDoorFromManifest` returns `null` for a repo manifest, so `proveDestination`/`copyOut`
   never run against it. Wiring it into the signed `writeScope` field (`src/job.js:363`) is
   explicitly left to M3/M4 — not built this session.

The dated-name machinery already built (`datedDestination`/`pickDelivery`, M2b item 4) survived
unchanged, exactly as predicted — it was the single-file, must-not-exist, outside-the-source
assumptions AROUND it that needed to go.

**F164/F165 — CLOSED 2026-09-12, D1 rework ("copy only what git tracks", hamr's ruling verbatim):**

5. **Repo sources are refused on any real JS repo carrying `node_modules`** (F164) — CLOSED.
   Repo sources are now enumerated with `git ls-files --stage` in the source, never a
   filesystem walk. `node_modules/.bin/*` symlinks are untracked in any real JS repo and are
   therefore never a candidate for the walk at all — the symlink refusal now only ever fires
   on a TRACKED symlink resolving outside the source root. Re-run live against the exact repo
   that broke this (`~/PycharmProjects/adaptlearn`, 15 MB, `node_modules` present): see D4
   below — it now copies cleanly.
6. **The seed force-add froze gitignored content into the copied tree for repo sources**
   (F165) — CLOSED. hamr ruled "copy only what git tracks" (Option 1, verbatim). `git add -A`
   drops `-f` for repo sources (kept for plain folder/file/URL sources, where a `.gitignore`
   has no honest meaning yet); since only tracked files are ever candidates for the copy at
   all, nothing gitignored in the source repo (`node_modules`, a gitignored `.env`, this
   repo's own `.claude/`) can reach the tree or the seed by any route.

**D2 — the F166 residual, CLOSED 2026-09-12:** every frozen file's content is now scanned for
secrets, binary files included — the same `SECRET_PATTERNS` inventory, decoded `latin1`
(byte-preserving) rather than `utf8` so an ASCII key inside a compiled artifact still matches.
This only matters where binaries are admitted at all (a repo source; a plain folder/file still
refuses binary content outright via `source-not-text`, unchanged).

**D4 — measuring a real large repo, 2026-09-12 (the measurement F166's "unmeasured" note
asked for):** `node scripts/prep-source.mjs --source ~/PycharmProjects/adaptlearn --into <dir>`
— the exact 15 MB repo that refused outright under F164 — now completes cleanly: **1296 files,
3,162,813 bytes (3.16 MB, less than the raw 15 MB since only TRACKED content is copied), 0.89s
elapsed wall, ~104% CPU, 83,752 KB (~84 MB) maximum resident set size.** Verified: the copied
tree's file count matches `git ls-files` in the source exactly (1296); no `node_modules`,
`.env`, or `.claude/settings.local.json` (all gitignored in that repo) reached the copied tree
or the hidden-git seed. No size cap is added — the numbers are unremarkable for a repo this
size, and hamr rules on any future ceiling, not this session.

## Live smoke, 2026-09-12 (M2b, hands-on after the fix list landed)

A hands-on run of `scripts/prep-source.mjs` against real sources — a plain folder, a real
3 MB/12-commit repo (`~/PycharmProjects/flowithmel`), a 15 MB repo (`~/PycharmProjects/
adaptlearn`), and a real redirecting URL — after the M2b fix list was reported built and
2503 unit tests were green.

**Held:** plain folder froze 2 files, hidden git initialized, folder note printed, missing
destination parent refused cleanly (exit code 2); the 3 MB repo copied with history intact
(source HEAD is an ancestor of the seed), hooks stripped, `core.hooksPath` pinned-but-unset,
original repo untouched (HEAD unchanged, 0 changed files), 0.24s / 71.7 MB maxRSS / 14 files /
857,554 B; the redirecting URL resolved and printed its warning line.

**Broke:** a real API key placed in a source file was frozen into the tree AND the hidden-git
seed, uncaught (F162, fixed same session); a planted `pre-commit` hook in a copied repo's
`.git/hooks` fired live inside bareloop's own process before a token spent (F163, fixed same
session, two independent layers); the 15 MB repo (`adaptlearn`) was refused outright by the
`node_modules` symlink defect (F164, OPEN) before any copy began; the 3 MB repo's seed
committed gitignored `.claude/` content from the source (F165, OPEN).

**Bottom line: the repo-source path does not work on a real JS repo today.** Every real
JS repo tried (both the 3 MB and the 15 MB one) hit at least one of F164/F165; only a repo
built by hand with no `node_modules` and no `.claude`/gitignored content would pass cleanly,
which is exactly the shape none of the existing fixtures deviate from.

**Confirmed live, not fixed:** three `.jpg` files in the smoked repo were copied unscanned for
secrets — the door skips the secret scan on binary files (F166). Named residual, not addressed
this session.

**Unmeasured, not fixed:** the cost (copy time, disk, memory) of a large repo — the 15 MB repo
was refused before any copying began (F164), so the deliberate absence of a per-file size cap
for repo sources (M2b fix 3) has never been exercised at a size where it would matter. This
stays open until a repo source can get past F164 far enough to be sized.

> **2026-09-12, later the same day — pointer, not a rewrite of the record above:** F164 and
> F165 are CLOSED by the D1 rework ("Destination model corrected" section, above); D4 there
> records the same repo (`adaptlearn`) now measured cleanly. This paragraph and the ones above
> it are left exactly as the live smoke found them — the historical record of what broke.

## M3 — the intake form and confirm turn (DETAILED 2026-09-13, not started)

The form is the SAME 6 fields for green and soft-green: Goal / Source / Destination / What
success looks like / Guardrails / Judge examples (one pass, one fail, and why; multi-line, its
own box; shown ONLY when soft-green is picked). This is not open for discussion — it is
PRD item 33's 2026-09-10 signed ruling ("The intake form (RULED)", `docs/product/PRD.md`).
Judge examples replace today's soft-green Q6+Q7 (`src/authorflow.js` `SOFTGREEN_QUESTIONS`,
line 254); the "why" lines are what the rubric card compiles from. Q5 ("worse than before")
folds into Guardrails; the confirm turn asks it only for a repo source. Two base rules always
on (output non-empty; citation rule). Calibration is 10 cases from judge examples + real
input, floor 10/10, 5 injection styles. The confirm turn and accepted answers land in the
EXISTING audit records — no new record format.

**Rulings (hamr, 2026-09-13):**

1. **Where the form lives.** The terminal interview, `scripts/run-interview.mjs`, reshaped to
   the 6 fields. `src/authorflow.js` stays the one source of the question sets; the script
   only prints what the library hands it. The panel comes later on the same library.
2. **Source/Destination replace `--patient`.** They are the first two form fields and REPLACE
   the `--patient` flag (`scripts/run-interview.mjs:30`, `scripts/run-author.mjs` usage line
   19). Each is proven mechanically, $0, the moment it is entered (`prepareSource`/
   `proveDestination`, `src/source.js`). For a repo source, Destination fills the signed
   `writeScope` field (`src/job.js:363` — "the fence is operator law") — the list of globs the
   run may write. Destination stays per-run, never signed (M2's 2026-09-11 ruling), except that
   a repo job's `writeScope` IS the fence.

   **Addendum (hamr, 2026-09-13, picked option A):** a Source that is a subfolder inside a
   git repo is a REPO job, not a plain-folder job. The whole repo's tracked files are copied
   (the same `kind: 'repo'` freeze `prepareSource` already does for a repo root), the language
   comes from the nearest manifest walking up to the repo root (ruling 3, point 1, below), and
   the Destination fence (`writeScope` globs) is written relative to the repo root. Why:
   `looksLikeRepoSource` (`src/source.js:97-104`) currently treats a folder as a repo only when
   `.git` sits directly inside it, so a monorepo package like `myrepo/packages/api` fell to the
   plain-folder path — which hits the M4 "no checks yet" stop, and copies file by file, where
   untracked `node_modules` symlinks would refuse again (the F164 class). Not built yet; it is
   the next code change after piece 3 below (commits 421d730, 51998dc, c61f7ae built the
   root-only rule this addendum changes).

   **2026-09-13 — pointer:** landed in 2a020d8. A gap surfaced after: when the subfolder
   itself is untracked or gitignored, the whole-repo freeze held none of Source's own
   files — refused as `source-untracked-in-repo` for now (PRD item 34, L21); option B
   (freeze it as a plain folder on hidden git instead) is deferred to M4.
3. **Language is detected, never asked.** A code job's checks always run the repo's OWN tools
   in the repo's own language, so language is a fact of the repo, not a choice: `package.json`
   present → js; `pyproject.toml` or `setup.py` present → python; both present → the confirm
   turn asks which part the job is about; neither → not a code-genre job. This replaces the
   `--lang` flag (default `js`) in `scripts/run-interview.mjs` (line 58, `LANG = langArg ??
   'js'`) and `scripts/run-author.mjs` (line 102, same pattern). What language currently
   drives, and must still be fed by detection rather than a flag: `src/authoring.js`'s TYPES
   genre per-language data — `GENRE_LANGUAGES = ['js', 'python']` (line 499), suppression
   patterns and file extensions in the `TYPES_GENRE.languages` table, genre-owned env such as
   Python's `MYPYPATH` (`genreEnv`, line 848), and checker-output instruments (`genreInstruments`,
   line 912).

   Five detection points (hamr, 2026-09-13):
   (1) code reads the manifest at the Source folder, walking up to the repo root — nearest
   wins (`package.json` → js, TypeScript included; `pyproject.toml`/`setup.py` → python);
   (2) known list only — an unknown language is a named "language not supported yet" stop,
   counted as demand, never a silent fallback to js;
   (3) two manifests at the same level → the confirm turn asks the person;
   (4) the language is shown in the confirm turn and signed as `closeDecl.lang`
   (`src/authorjob.js` ~line 595);
   (5) the seed read breaks a wrong-language checker at signing.
4. **The confirm turn is paid, inside the authoring budget.** It is a call INSIDE the same
   `--budget` ceiling (no default); it reuses the scout's survey rather than reading the source
   a second time.
5. **Two-round cap, sign-or-restart.** After 2 confirm rounds it drafts anyway; any still-open
   questions are shown at signing. If the person does not sign, they rerun the questions from
   the start.

   **Addendum (hamr, 2026-09-13, picked option B): the separate signed-goal question is
   dropped.** Today `scripts/run-interview.mjs` (~line 432) asks, in the job settings part
   after the form, "The GOAL — what the run is judged on… say everything you'll check", and
   that answer becomes the signed job spec's `goal`, which the planner and worker read as
   their target (`src/planrun.js:683` and `:2848`). With the unified form it overlapped the
   form's Goal and "What success looks like" fields. New rule: in the confirm turn, the AI
   drafts the signed goal sentence from the person's Goal and "What success looks like"
   answers; the sentence must name every check the close will judge (the same list the
   confirm turn already shows, ruling 6 below). The person confirms or fixes it within the
   confirm turn's 2-round cap (ruling 5 above); the job is signed after that conversation,
   goal included — the person signs the whole spec, as today. The interview no longer asks
   for the goal separately. Built in M3 piece 4 (the confirm turn), not yet.

6. **No hand-authored check matcher.** "A genre never adds a check the goal did not ask for"
   (the `tsc --strict` stage in run `mtv8jihy`) is enforced by a prompt register at the
   composer PLUS the confirm turn listing every check it plans before drafting — no code
   matcher over prose (same reason as the no-shell law).
7. **Scope of M3's deliverable.** A repo job works end to end. A plain-folder job gets the form
   and the confirm turn, then an honest named stop: no checks for this kind of job yet (M4).
8. **hitl stays out of the form and everywhere customer-facing.** Removed from the gate; no
   plans to revive; code kept only for reuse; never shown in the form, CLI usage/help, or error
   text — see item 34's L19 for the customer-facing cleanup this still owes
   (`docs/product/PRD.md`). The M3 form offers green and soft-green only.
9. **Proof.** The M3 build is $0 with tests; at the end, ONE live interview on a repo job runs
   on DeepSeek (`deepseek-flash`), paid, only on hamr's word at that time. It depends on item
   34's L17 (authoring provider selectable) landing first.

   See M3b (below, right after M3) for the language guards that ride on top of this detection.

   **Addendum (hamr, 2026-09-13) — M3 piece 4 (the confirm turn) open decisions ruled:**
   - **D5 = A.** A PLAIN-FOLDER source runs NO scout (the scout's register is code-only,
     `src/authorscout.js:207`). Its confirm turn reads the $0 seed listing of the frozen tree,
     spends only its own calls, then the honest named stop "no checks for this kind of job yet
     (M4)".

     **D5 amended (2026-09-21) — F191 (`docs/logs/FINDINGS.md`).** The confirm turn over a
     plain folder is now GONE, not just cheap: live run `mu4hc7sp` crashed inside it —
     `confirmProtections` computes protections via `classGuards` (`src/authoring.js`), which is
     keyed by CODE LANGUAGE and throws on a plain folder's `lang: 'none-detected'`. A plain
     folder has no language, so the confirm turn cannot honestly show real, code-derived
     protections for one — D5's original premise (a plain folder gets a paid confirm turn
     before the stop) is unreachable by construction, not a bug to guard around. The stop now
     fires immediately after `author-start`, at $0: no scout, no confirm turn, no model call at
     all. The outcome/stop shape is unchanged (`request-red`/`non-code-source`,
     `author-end{outcome:'not-authored'}`).
   - **D6 = A.** Ruling 6 above ("a genre never adds a check the goal did not ask for") wins
     over `TYPES_GENRE_TEMPLATE` (`src/authoring.js:483-497`): skeleton WORK stages (typecheck,
     typecheck-outside, tests-kept, suite-green) are composed ONLY when a confirmed check asks
     for them; the strict form of the checker likewise applies only when a confirmed check asks
     for strict typing (run `mtv8jihy`'s unasked `tsc --strict` stage is the case this cures).
     The GUARDS (changed-from-seed, no-suppressions, and every mandatory/MECHANICAL guard) stay
     always on, are listed in the confirm turn as PROTECTIONS (not checks), and are not named in
     the goal. Enforcement is prompt register only (template wording + confirmed-checks block),
     never a code matcher over prose.
   - Defaults taken (hamr did not object): **D1 = A** (the confirm turn runs inside
     `scripts/run-author.mjs`, via a library function with an injected `ask` seam;
     run-interview stays provider-free). **D2 = A** (a goal already present in a draft seeds
     round 1's starting sentence; the confirmed goal replaces it; `goal` does not join
     `AUTHORED_SPEC_FIELDS`).

     **Correction (hamr, 2026-09-14): D2 = A was never built, and is now dropped, not
     deferred.** A draft written by `run-interview`'s own interview never carries a goal any
     more (the 2026-09-13 addendum above, "the separate signed-goal question is dropped"), so
     there is no draft-authored goal left to seed round 1's starting sentence with — an old
     draft's goal, if one exists on disk, is replaced outright by the confirmed goal
     (`scripts/run-author.mjs:813`, `if (authored.confirmed?.goal) draft.goal = ...`). The line
     above is left as the record of what was ruled, not rewritten; this paragraph is the
     correction.

     **D3 = A** (at most 2 model calls; a round-2 "fix" is passed to
     the composer verbatim and shown at signing as an open question; the menu also offers
     "type the goal sentence yourself"). **D4 = A** (open questions are shown in run-author's
     "SIGNING PREPARED" readout from `authored.json`; the signed spec format does not change).
     **D7 = A** (the $0 questions — language pick when ambiguous, "worse than before" for a
     repo — are asked BEFORE the scout, so a missing person at end of input stops at $0).

   **Addendum (hamr, 2026-09-14) — D6 = A, "replace it":** the S3 STOP over
   `TYPES_GENRE_TEMPLATE` (above) is resolved. hamr's ruling: replace the frozen template text
   itself so its WORK-stage skeleton and STRICT-checker mandate are no longer unconditional law
   — composed only when a confirmed check (or, absent a confirm turn, the goal/interview
   answers) asks for them. This SUPERSEDES
   `docs/logs/2026-08-08-close-authoring-gate2-poc-prereg.md`'s addendum 3 frozen block for the
   product going forward (that record is closed and is never edited — this is a pointer, not a
   rewrite). The GUARDS (changed-from-seed, no-suppressions) are unaffected: they are enforced
   structurally (`classGuards` + `validateDeclaration`'s `guards-absent` red), never by this
   prompt text, so they stay always-on regardless of what the template says.

**The TYPES genre template (D6=A, 2026-09-14):**

1. The STRICT form of the language's type checker is used only when a confirmed check — or,
   absent a confirm turn, the goal and interview answers — asks for strict typing; otherwise the
   checker runs at whatever strictness the repo's own scripts already use.
2. Tools are invoked so their binaries actually resolve — through the project's own package
   runner or language module runner, never a bare binary name.
3. The WORK stages — typecheck (error count IN the target scope, baseline 0, lower-is-better),
   typecheck-outside (error count OUTSIDE the target scope, baseline measured at seed, a
   ceiling — required whenever a typecheck stage is scoped to a subset of the tree), tests-kept
   (a floor on tests that actually EXECUTED, baseline at seed, higher-is-better; a skipped or
   deselected test did not run and must not count), and suite-green (the suite exits clean AND
   reports zero failing tests — two assertions) — are composed ONLY for the checks a confirmed
   plan asked for (or, absent a confirm turn, the goal and interview answers). The GUARDS —
   changed-from-seed and no-suppressions — are composed always, first-red-wins:
   changed-from-seed before every WORK stage, no-suppressions last.
4. One population per stage — two structurally different counts never share a stage.
5. The checker must judge the PATIENT's own tree: if imports could resolve to an installed or
   editable copy elsewhere, the environment is set so they resolve inside the patient.
6. A number the tool did not report is unknown, never zero.

**2026-09-14 — pointer:** hamr ruled this branch (`fix/item34-loose-ends`) stops here for
`/branch-review` → `/release`; the M3 close-out list (open items owed before M3b) is written
into `docs/product/PRD.md`'s item 33 build-order addenda, dated 2026-09-14 — see there for the
list, not duplicated here.

## M3b — language guards

Languages are detected from the repo by code (M3, ruling 3 above), never asked. Beyond js and
python, add the top 5: Java, C#, Go, Rust, PHP.

Each language gets its own cheat list (ways a model can fake past the type checker/linter —
e.g. suppression comments) plus its own checker data. This data is genre-owned, never written
by the model (same rule as M3's per-language TYPES genre tables — `GENRE_LANGUAGES`,
`TYPES_GENRE.languages`, `genreEnv`, `genreInstruments` in `src/authoring.js`).

Proof per language: a $0 guard proof on a real public repo (any public repo is fine; install
each language's toolchain as needed), then ONE small paid proof run on `deepseek-flash`, fired
only on hamr's word at that time.

Order: right after M3, before M4.

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

Item 25 step (4): 31.5 calibration on a real bar; 31.4 green on DeepSeek (`deepseek-flash`)
with `ANTHROPIC_API_KEY` unset; plus one plain-folder green and one soft-green end to end.

2026-09-13 (hamr): 31.4 runs on DeepSeek, not gemini — one secondary provider.

## Addendum 2026-10-12 — Part 1a: rubric engine on a local file, no judge (signed by hamr 2026-10-12)

Branch feat/rubric-search. This build runs a rubric job on a local file with no judge. The judge, the web and the chips come later.

What gets built, in order:

1. A rubric job may start from a plain local file. Each input line is `label: /absolute/file`. Bareloop freezes each file into the job (label, relative path, sha256) and refuses a non-UTF-8 file at $0. A rubric job skips the repo-only source message and gets no language guards. A URL or search line is a $0 red: "line N: web inputs (URLs, search) arrive in a later build. Nothing spent."
2. One output per job line: `output/steps/<n>.json` holding `{text, cites:{<label>:[{claim,quote}]}}`. The worker brief in the drafter prompt says so, the plan validator allows the path, and the copy-out delivers `steps/` with the output (P2=A).
3. A new close kind `rubric-step`, one stage per job line (`fromLine:[n]`). At run start the runner builds the rubric (input sha from source.json, checkpoint `<n>`, not gating), checks the step file, and renders the gaps. A stop is exit 97; a red is a close red.
4. Checks: the step file happened (it exists and parses as a JSON object); every input the step cites is cited with real quotes (`cites:<label>`); countable limits on `text` (maxWords, minWords, sections, sectionWords, max, min). A cut-off is detected only as a step file that is not a JSON object; text cut inside valid JSON cannot be detected (documented limit). Step files are capped at 5 MiB.
5. Each part of a job line is sorted at drafting: countable, judged, or guard. A job line is a $0 red when a part has no class, when two countables contradict (both parts and numbers are named), when a guard has no web input, or when any part is judged. Plain words: "line N: this rule needs the judge, which arrives in the next build. Nothing spent." and "line N: '<part>' can't be counted or checked against a quote. Say it as a count (words, sections, rows) or as something a quote must show."
6. Signing runs calibration only when the close has judged stages, so signing a 1a job makes zero judge-round records.

Rulings:

- P1=B. The `~ PASS:` / `~ FAIL:` example lines are required on a rubric job only when it holds a judged part. `jobBlockFitsCheck` changes to match.
- P2=A. Per-line step files live at `output/steps/<n>.json` and are delivered with the output.

Known mismatches with bareguard 0.21, handled without patching it: string inputs and UTF-8, one source per cited input, no claims on an empty step, and the rubric is rebuilt each run.

Deferred:

- 1b: the judge plug-in per bareguard locate section 5.2, final gating with requiresHuman accept:'later' through the door, reads/agree, clean, mutation calibration, chips, Audit rows.
- Part 2: web sources and the S1A gate.
- Part 3: chips.

Live proof plan: DeepSeek (`deepseek-flash`), cap $0.50, a copy of the repo's own CHANGELOG.md as the input, two job lines. Run only on hamr's go.

## Addendum 2026-10-13 — Part 1b: required facts (signed by hamr 2026-10-13)

The rules are in PRD item 33, "2026-10-12 — required facts RULED" (RF1–RF17). This addendum holds the design discussion as ruled, then the build spec. Where they differ, the build spec wins: it came after POC rounds 1–3c and bareguard 0.23.0.

### Design discussion (ruled 2026-10-12)

Closes F223. Replaces "the worker picks its own facts" (Part 1a `cited`).

#### The idea, one line

Check what the person asked for, not what the worker chose to write.

#### How it works

1. **The person writes the job** as today: numbered lines + `~` rules.

       1  Find a flight SFO to LAX
          ~ under $450
          ~ not a red-eye
          ~ nonstop

2. **At drafting, the AI turns each line into a list of REQUIRED FACTS.** Each fact has a
   name, a shape and (when the person asked for one) a rule:

       from     phrase   must say "SFO"
       to       phrase   must say "LAX"
       price    money    at most 450 US dollars
       departs  time     between 06:00 and 21:00     <- "not a red-eye", made a number
       stops    phrase   must say "Nonstop"          <- "nonstop"

   The list is shown on the plan card, one row per fact, and SIGNED with the job.
   The AI drafts it; it can never change it after signing (the agent never authors its arbiter).

3. **At run time the worker fills every fact** with a value and a word-for-word quote:

       price    389      quote: "$389 total"
       departs  08:15    quote: "Depart 8:15 AM"

4. **Code checks every fact. No AI.** One bareguard 0.22.0 `cited` check with `decides`
   (already published): the quote is really in the frozen source (`quoteIn`); the value
   really is in the quote, compared exactly by shape (`8:15 AM` = `08:15`, `389` = `389.00`);
   the value passes the rule. Any red names the fact and why, and goes to the fix loop.

#### Shapes (what bareguard 0.22.0 can check today)

| shape  | example             | rules                         |
|--------|---------------------|-------------------------------|
| money  | 389 US dollars      | <, <=, >, >=, between         |
| number | 3                   | <, <=, >, >=, between         |
| date   | 2026-11-12          | <, <=, >, >=, between         |
| time   | 08:15               | <, <=, >, >=, between         |
| phrase | "Nonstop", "SFO"    | the quote must contain it     |

EVERY fact is cited and shape-checked, even one with no rule (hamr, 2026-10-12: the agent must
prove every answer by its shape, so it cannot make up facts). A rule only adds a condition on top.

#### Two kinds of step (ruling A, refined for prose, 2026-10-12)

- **Fact step** (find, list, look up): the output is the filled fact list. Every answer quoted
  and shape-checked; nothing unchecked is part of the answer. "N results" (e.g. last 3 releases)
  = N filled copies of the fact list; the count is a number rule code checks.
- **Prose step** (write a report / summary): free text is allowed. Code checks only size and
  shape (word count, sections, one paragraph). The card says "Not checked: what the text says";
  the person judges the content at Accept.
- **Prose numbers stay honest:** every number in a prose step must equal a checked fact value
  from an earlier step (same canonical compare as the binding). Words free, numbers checked.

#### What is NOT checked, said out loud

- Anything the AI cannot turn into a shape + rule ("a good pick", "the LAST 3", "cheapest
  of all") goes to **Not checked** on the card, in the person's words.
- The person judges those at the end gate (the review door), or they did not matter.

#### Is this too much to ask of a person?

No more than today. They already write the `~` rules. The AI does the turning-into-facts; the
person only reads the rows and signs. Facts named in the job line itself ("SFO to LAX") become
rows without any `~` line. What they never wrote is not checked, and the card says so.

#### What changes in the build

- Part 1a's free `cites` list → the filled fact list on fact steps; prose steps keep free `text`, shape-checked, numbers tied to earlier checked facts.
- `cited` (bareloop's own) → bareguard 0.22.0 `cited` + `decides` + typed `values`.
  Needs the bareguard bump ^0.21.0 → ^0.22.0 (peer range checked in a clean install).
- Drafter: emits the fact list per line (name, shape, rule, source input); a rule it cannot
  express → Not checked, never a vague check.
- Plan card: one row per required fact, code-worded, under its `~` line.
- `minClaims`/`maxClaims`/word counts: kept where the person asked for them.

#### Rulings on the open questions (hamr, 2026-10-12)

1. The fact list comes from the job line too ("SFO to LAX" -> from/to rows), not only `~` rules.
2. Superlatives ("cheapest", "the last 3"): Not checked for now (guard plan: superlatives later).
3. Prose jobs are rubric jobs: shape-checked, content judged at Accept, numbers tied to checked facts.

#### Later piece (ruled in, built after required facts): rerun from line N

- At the end gate of a GREEN run: `Rerun from: [line N]` + the person's words, which go to line N.
- Lines before N keep their checked outputs byte-for-byte; they are not redone or edited.
- Money and time already spent stay folded in (tighten-only; never a fresh budget).
- Picking an earlier line redoes everything from there.
- Changes the end gate (accept / rerun / pause), so it is its own build after required facts.

### Build spec

Rulings: PRD item 33 "required facts RULED" RF1–RF17 (commits 0029d2a, 1c5fde4, 70f4a1c, 03374af).
POC evidence: F224, F225, rounds 3/3b/3c (parity re-run on published 0.23.0: same results).
Branch: feat/rubric-search (continues Part 1a). Builder: sonnet (strict pin), one item per commit,
tests only via `npm test`, scratch HOME, runs.jsonl line count before/after, no subagents.

#### 1. bareguard bump ^0.21.0 → ^0.23.0

- package.json + lock. Node >=22 already matches bareloop `engines` and CI (22).
- Peer ranges checked in a clean install (bare-agent wants bareguard >=0.19 <1.0: OK).
- 0.22/0.23 behaviour changes to check in our suite: `cited` claims carrying `values` with no
  `decides` now red; anchors match on word edges only.

#### 2. The fact step (src/rubricstep.js)

- New part class `fact` on a `rubric-step` stage:
  `{ class:'fact', source:<input label>, record:{start, end?}, facts:[{name, shape, anchor?, until?, rule?, aiProposal?}], count? }`
  - shape ∈ money | number | date | time | phrase | text.
  - rule (optional) = bareguard op + value/lo+hi (`between` allowed). No rule = bind only
    (the value must really be in the quote; with anchor, the value right after the label).
  - text = bind only, never a rule. phrase = fixed words the quote must contain.
  - anchor/until = labels copied VERBATIM from the input (e.g. `Leaves` + until ` at`).
- Step file: `{ "results": [ { "quote": "...", "values": { "<fact>": "..." } } ] }` —
  one quote per result holding all its facts (RF9). No free text, no free cites.
- `buildStepSpec`: one bareguard `cited` check per fact part, `decides` from the facts in order
  (d0, d1, … — d<j> indexes the WHOLE decides list, presence decides included). Each result →
  claim `{claim, quote, values}`; the claim text is BUILT BY CODE from the values.
- "N results" = `count` → existing minClaims/maxClaims.

#### 3. Records (lesson from rounds 3–3c)

- The drafter names the record marker; CODE splits the input and counts records.
- A record is the PREFIX slice the drafter names (e.g. a flight block minus its trailing
  "Flight details" button): the whole block made `Leaves`/`arrives at` anchors ambiguous.
- The worker brief names that exact slice: "quote from the start of a record up to <end>".
- Big inputs: drafter sees a SAMPLE (first N records + how it was cut, shown on the card),
  never a silent truncation (changelog was 455k chars cut to 15k).

#### 4. The prose step

- Free text as today; parts = existing word/section/line counts.
- `numbersFromFacts` (always on when an earlier fact step exists): every number in the text must
  appear in an earlier checked quote — bareguard `numbersInQuote` (exists). Known limit: token
  match, not canonical; brief says copy numbers as written.
- Card: "Not checked: what the text says" on every prose step (RF5).

#### 5. Drafter (composer prompt + validator) — look first, fail early (RF13–RF17)

- Drafter reads the input (or its sample) at drafting; facts come from the job line AND its `~`
  rules (RF1); labels, units, phrases taken verbatim; may suggest real source words (RF14).
- Superlatives and anything that is not shape+rule → Not checked in the person's words (RF6).
- Every `~` rule → a check or Not checked; a silent drop is a $0 red (RF16).
- AI-made numbers marked "AI's proposal — check it" on the card; ranges like red-eye use
  `between` (RF17).
- Validator: unknown shape/op, source not an input label, empty phrase/anchor, rule on text,
  record marker not found → red, plain words.
- Three $0 early tests per fact check, on the frozen input (RF15):
  1. found — the check finds its value in each record (count shown);
  2. one per record — exactly one value where a rule needs it (or an anchor scopes it);
  3. red on a code-broken copy (a value changed by code) + pass/fail split shown.
  Any test failing → that check cannot be signed; plain words; the person changes or removes it.
- Run-time backstop: the same found/one-per-record tests on the first source the worker reads.

#### 6. Plan card (one renderer: renderJobPlan / checksOfClose / partSentence)

- Under each line's `~` rows, one code-worded row per fact, e.g.
  `› fact · price — money, at most 450 US dollars, after "Price", quoted from "Flights"`.
- `planMatchesClose` covers facts (sign == run).

#### 7. Worker brief (stepFileContract / rubricGoal)

Fact step: one result per record, one quote copied exactly from the named slice holding all its
facts, values written as the quote writes them. Prose step: free text; numbers copied from the
earlier quotes.

#### 8. Live proof (DeepSeek deepseek-flash, cap $0.50, 20 min each)

- Changelog job (fact line "last 3 releases" + prose summary line).
- Flight job from the captured page as a FILE input (web sources are Part 2).
- Both through the panel; hamr clicks through. $0 archive read first (no paid fire before it).

#### Known limits (documented, not built around)

- SFO/LAX codes have no stable label on the flight page → direction only via full airport names.
- Unanchored text/membership can't tell which field a value sits in.
- `am`/`pm` lowercase and `9:27AM` are malformed times; `v0.41.0` is one token.

#### Not in this build

- Rerun from line N (RF8) — own later build. Web sources (Part 2). Chips/Audit (Part 3).
  Superlatives.

## Addendum 2026-10-13 — Part 1b live fixes (signed by hamr 2026-10-13, "go")

Found in the first live drafts on DeepSeek `deepseek-flash` (panel sessions smv6jhano7ba3 = changelog job,
smv6k6l8dxkzs = flights job). Neither reached a run; both stopped at the $0 drafting checks, total spend < $0.01 each.

- **A1 — the long-record refusal says what to do.** `rubric-fact-record-long` names the record (its first line), its
  length, the end marker the draft gave (or "no end given"), and an example taken from that record ("end the slice at
  the end of the heading line"). Evidence: changelog, start `## [` with no end → 30 of 46 records over 4000 chars; any
  end (`\n`, `\n\n`, `### `) → 0 over, longest 24–533 ($0 measured).
- **A2 — an end marker that is not found is its own red.** Today `splitRecords` silently falls back to the whole record
  when `record.end` is absent from a record (`endFound:false`), which reads as "too long". New red names the marker and
  how many records lack it.
- **A3 — every refused proposal is kept.** The draft log (`draft-log.jsonl`) records the refused declaration itself
  beside `try-refused`, so a failed draft can be read and replayed at $0. Secrets masked as everywhere.
- **B1 — one rulebook for the confirm step and the drafter.** `RUBRIC_CONFIRM_NOTE` and the drafter brief get the same
  rubric rules from ONE place: a limit the person wrote ("under $450") is a checkable rule; a number made from their
  words ("not a red-eye") is a time range marked AI's proposal; names, labels and units are the INPUT's own words
  (never add a code like SFO the person did not write and the input does not hold).
- **B2 — the drafter is shown which shape takes which fields**, generated from bareguard's `rubricVocabulary` (never a
  hand-typed copy): money/number/date/time take anchor and rule, no until; text takes anchor and until, no rule;
  phrase takes only its words. Plus: one stage per job line holding all its facts.
- **B3 — plain words for every rubric red.** No "has no plain wording yet" for `rubric-step-twice`, `invalid-value`
  on a fact field, or any new rubric red code; a test lists every rubric red code and fails on an unmapped one.
- **I1 — ask early, only about intent.** A $0 red that only the person can settle (their word is not in the input;
  a limit needs a number only they know) asks them at once, using the existing question gate (same caps, answer
  becomes a signed `~` rule). Every other red goes back to the AI to fix itself. Which red codes count as "intent"
  is one list in code; the builder proposes it, hamr rules on it before it ships.

Proof: $0 tests per item; then the two live drafts again (same jobs), hamr's go.

## Addendum 2026-10-13 — Part 1c: look, then say what I can check (signed by hamr 2026-10-13)

Rulings: PRD item 33, "2026-10-13 — look, then say what I can check RULED" (RF18–RF22). Replaces the record
cutting and early tests of Part 1b. Why: three live drafts (smv6jhano7ba3 changelog, smv6k6l8dxkzs and smv6lyypleng8
flights) all failed at drafting on record cutting — the AI copied one-time ids (`[ref=3817]` → 1 "record" of 78,255
chars) and one record's value as a label (`generic "59 US dollars"`); each fix (A1–A3, B1–B3, C1–C4) found the next.
Also found: the saved flights page is LAX → SFO, so test job B (SFO → LAX) could never pass — the operator's miss.

### 0. POC first ($0 + small drafting spend, before any build)

Riskiest assumptions, in order; stop and report if one fails:
- (a) barebrowse fetches a pasted Google Flights results URL headless, read-only, and returns text holding each
  flight's labels and values (`Departure time: 9:27 AM`, `Leaves …`). Check: its exported API, its Node/peer ranges in a
  clean install beside bare-agent/bareguard/litectx, and what text form it returns.
- (b) The AI look, with read-only search tools over that text, reports the right label for each fact on the real page
  and on the changelog (3 drafts each, DeepSeek `deepseek-flash`, thinking off). Pass = every reported word is really
  in the source and is the label of the right value; no one-time ids, no single record's value used as a label.

### 0b. Step 0 results (2026-10-13) and what they add to the build

- (a) PASSED, $0: barebrowse 0.21.0 `browse(url, {incognito:true, blockPrivateNetwork:true, pruneMode:'act'})` fetched a
  Google Flights results URL (`/travel/flights?q=…&curr=USD&hl=en&gl=us`) in ~3.5 s: 44 flights, 43 `Departure time:`,
  `Leaves San Francisco International Airport … arrives at Los Angeles International Airport`, prices in US dollars.
  `pruneMode` 'read' and 'full' returned almost nothing; the general route page (`/flights-from-…html`) has no flight
  list; without `curr=USD` prices come in the fetcher's local currency. An empty or near-empty fetch is a plain-words
  stop, never a silent empty input.
- (b) $0.0723, 6 looks (scratch `poc-look/`): 0 of 6 used a one-time id or one result's value as a label; price `From`,
  time `Departure time:`, nonstop `Nonstop`, version `## [`, date `] - ` right in every look; red-eye proposed as a
  window with aiProposal. Misses, now part of this build:
  1. Every place, date or name in the job line itself is a fact too (direction "from San Francisco … to Los Angeles"
     was missed 3 of 3: it must bind to the label before each airport, e.g. `Leaves` / `arrives at`).
  2. Prose lines and their `~` limits (word count, paragraphs) are not looked up: they stay prose-step checks.
  3. Code's "found" checks are whitespace-blind (Google writes U+202F before AM/PM; 259 in the page).
  4. The look answers through the strict answer form (tool / schema), never free prose with JSON inside.
- ~~The build's FIRST step re-runs this test~~ — DROPPED (hamr, 2026-10-13). The re-run (scratch `poc-look2/`, $0.0823)
  got price, time, nonstop, version, date right in 6 of 6 and no id/value labels, but direction 0 of 3 (labels `from` /
  `to` / `Where from?` — the job's own words, which a found-once check cannot tell from a real label). The 5-of-6 bar
  was the operator's own gate and graded at drafting, against RF18. Ruling: build now, then FULL live runs; fix only
  what a full run breaks.

### 1. Keep from Part 1b

Fact step and step file, one quote per result (RF9), bareguard `cited` + `decides`, prose step + numbers tie, plan card
rows, RF16 no silent drop, RF17 AI's proposal, A3 refused proposals logged, B1 one rulebook, B2 shape table, B3 plain
words.

### 2. Remove

`record` (start/end) on fact parts, `splitRecords`/`sampleOf` use at drafting, the three early tests and their reds
(`rubric-fact-record-long`, `-record-end`, `-ambiguous`, `-untested`, per-record counts), the run-time backstop. The
worker brief says "one quote per result, from that result's own text" (quote cap stays bareguard's 4000).

### 3. The look (RF19, RF20)

- A read-only search step before drafting, built on the existing authoring scout (`src/authorscout.js`): fixed grant
  (search the input text, read a slice around a hit), bounded rounds, toolless final round, spend booked to drafting.
- It returns, per job line: facts it can check (name, shape, label or phrase, one example value it saw), and what it
  could not find (→ Not checked, or a question).
- LABELS ARE PICKED, NEVER TYPED (hamr, 2026-10-13, after the look re-run got direction 0 of 3 with the job's own
  words as labels, and fwd's evidence that an AI writing a value itself passed 8/10 vs 10/10 when only picking): before
  the look, code scans the source at $0 and lists, per shape (money, number, date, time), the words that sit right
  before a value of that shape, with how often each occurs (e.g. `Departure time:` ×43, `From` ×44, `Leaves` …). Text
  facts get the words right before each repeated phrase the same way. The look and the drafter pick labels ONLY from
  that list (by its id or exact text); a label not on the list is a $0 red naming it. Same scan for every page or
  file — never a per-site label table.
- The drafter writes the facts from that report. Code proves each label/phrase is in the source once ($0); a word not
  found is a red naming the word and the input.

### 4. URL inputs (RF21, RF22)

- An input line may be `label: https://…`. Drafting fetches it once for the look (booked to drafting).
- Run start fetches it again and saves the text as the run's frozen input before the worker starts; quotes are checked
  against that copy; the worker reads that copy, never the live page.

### 5. Live proof (DeepSeek `deepseek-flash`, cap $0.50, 20 min each, hamr's go)

- Changelog job (file input).
- Flights job from a pasted Google Flights URL, direction checked against the page first.

### Ruled by hamr (2026-10-13)

1. barebrowse becomes a production dependency (bare suite, Node 22 — matches): yes.
2. I1, ask early: when the look shows the person's intent on a particular `~` rule was not captured (its words or
   meaning not found in the source), ask about THAT rule at once, named by its line and rule. Any other drafting
   failure asks nothing piecemeal: it tells the person to review the whole job and submit it again, with the reasons
   in plain words.

## Addendum 2026-10-13 — Part 1c live fixes (signed by hamr 2026-10-13, "2" = all four)

From the first live drafts of the flights URL job (DeepSeek `deepseek-flash`, panel sessions smv710w8c3wdh and
smv713up97m3k). No run reached the worker yet.

- **L1 — wait for the page to finish loading.** The same URL gave 77,951 chars / 44 flights (step 0), 8,801 chars /
  3 flights (smv710w8c3wdh) and 719 chars / header only (smv713up97m3k): `browse()` snapshots at load, before the
  page's own scripts fill the results. Use barebrowse's published page API (`connect()` → `goto` →
  `waitForNetworkIdle`, bounded), then `snapshot` with the same options as now. Generic for every site, never a
  site-specific selector. Same fetch at drafting and at run start.
- **L2 — an empty page stops, and is never asked about.** A page that is only site chrome (header, menus, sign-in)
  is a plain-words stop, "Nothing spent", before the look. The 200-char floor let a 719-char header through; the
  stop must catch a header-only page generically (e.g. the snapshot after the banner/navigation holds no content).
  The look never asks the person about rules when the input itself is empty.
- **L3 — the plan card keeps the person's words.**
  - When the person answered a question with a number or range ("not between 00:00 and 06:00", "between 07:00 and
    23:00"), the check uses exactly that range and is NOT marked AI's proposal (smv710: the plan said 5:00 AM).
  - A `~` rule is either a check or under Not checked, never both ("not a red-eye" was in both).
  - The early question text is never cut mid-sentence ("…found nothing. The)." ).
  - A rule the AI can turn into a number from its own knowledge ("not a red-eye") is proposed as a range marked
    AI's proposal (RF17), not asked: the early ask is only for intent the AI cannot know.
- **L4 — drafting tries refused on form** (smv710w8c3wdh, 3 of 3): `"covers" is not a field of a fact`; "not a
  red-eye" sent as a judged / unsortable part instead of a time fact with a `between` rule. Read the saved refused
  declarations (draft-log `declaration`), fix the cause in the drafter's instructions or schema (one rulebook, B1/B2),
  and add a test that a red-eye-shaped `~` rule drafts to a time fact.

Proof: $0 tests per item; then hamr re-runs Job 1 (flights URL) and Job 2 (changelog) fully in the panel.

## Addendum 2026-10-13 — Part 1c full-run fixes (signed by hamr 2026-10-13)

From the first FULL runs on DeepSeek `deepseek-flash`: run mv73swnx (flights URL, step-red, $0.21 of $0.50) and
drafting session smv74rc6x1g2l (changelog, signing refused, $0.01).

- **M1 — a per-result label must repeat.** mv73swnx signed facts anchored on `Cheapest from` (a sort tab) and
  `departing` (a "track prices" switch): each appears ONCE on the page, never inside a flight, so no one-flight quote
  could hold them; the worker stretched quotes to reach them ("quote too long") and the step ladder stopped it. Rule:
  a fact on a line asking for N results (count.min) must use an anchor the label list counts at least N times in the
  source; fewer is a $0 red in plain words naming the label, its count and N. The drafter is shown the counts (the
  list already holds them) and told the rule in the one rulebook.
- **M2 — the prose number tie never crashes at the seed.** smv74rc6x1g2l: line 2's tie reads line 1's step file,
  which does not exist at the seed read, so it threw (`broken-close`, ENOENT) and signing was refused. A missing
  earlier step file is a normal red ("line 1's answer is not there yet"), never an instrument fault. The signing
  refusal for a rubric job never says "check the project's install, build and test commands" (code-job wording).
- **M3 — a new run shows in Runs without a refresh.** After Sign & run the run appeared only after a page refresh.
  Find the cause in the panel's run list refresh and fix it; the orchestrator screenshots it.
- **M4 — a "must say" phrase must repeat too.** Run mv76jhj1 (flights, DeepSeek `deepseek-flash`, step-red, $0.27): the
  drafter signed phrase facts "from San Francisco" and "to Los Angeles" on a line asking for 3 flights. The frozen page
  holds each only twice (the page header); every flight's own words say "Leaves San Francisco International Airport...",
  so every per-result quote failed "the quote does not say ...", and the worker's workaround (gluing the header onto each
  quote) was refused ("not found word for word"). Unwinnable from signing. Rule, in the SAME check as M1
  (`checkFactWords`, one owner): a phrase fact's `phrase` counted in the named input (the matcher the draft-time
  presence check already uses, `countPhrase`) fewer than the line's `count.min` is a $0 red in plain words naming the
  words, the input, the count and N (`rubric-fact-phrase-rare`). Count 1 or no count keeps a once-only phrase legal.
  The one rulebook (`RUBRIC_RULES`) tells the drafter.

Proof: $0 tests per item; then hamr re-runs Job 1 and Job 2 fully.

## Addendum 2026-10-14 — Idea A: page words (DRAFT, not signed; build AFTER P9 on its own branch)

Nothing here is signed. Rule v2 is not yet written or frozen. This records the idea, what the POC showed
(FINDINGS F226-F228) and what is still open, so hamr can decide before any builder is launched.

### Goal

Today the drafter guesses the page's words (labels, units, place names) and a guess that is not on the page
fails every try (run mv7qabx4: "$" where the page says "US dollars", anchor "at" three times per flight).
Idea A: an AI reads the job lines and the `~` rules plus THIS page, and maps each one to the page's own words,
per website. Code keeps only words really on the page and decides. The AI never grades. A check still needs a
quote from the page for every claim; the AI's own summary is never the thing checked.

### Frozen code rules (POC, verbatim from FROZEN-RULES.md, frozen 2026-10-14 before any new-page number)

```
R1 same-value: a value fact's labels are alternatives only if each reads the SAME SET of values across the page as the AI's first listed label; others dropped.
R2 role: each place phrase is extended LEFT by up to 2 words while >=90% of its occurrences share that word (stop at tree markup chars " [ ] =).
R2a: a kept phrase contained in another kept phrase is dropped.
R2b same line: keep only place phrases that share >=90% of the lines of the longest kept phrase.
R2c: ALL kept place phrases of a fact must be in the quote (AND).
R3 page-once: a place phrase counted fewer times than the record proxy (min count of the usable money/time labels) is checked once on the page.
N2 per-line: a label with max >=2 in one page line is unusable.
Code keeps only words found on the page (count >= 1).
Decision rule: rules HOLD on a page if honest pass >= 9/10 AND every planted cheat class is caught 10/10. Anything else = a finding, never a re-tune.
```

These were a POC only. They are scratch code, not product code. Rule v2 will be written after the open items below
are decided, and frozen before any number is read.

### What F226-F228 showed

- F226: the AI finds the page's own words well. Google Flights SFO-LAX and JFK-MIA held with the rules on (but the
  thresholds were chosen after seeing them). On an unseen Google Flights page (London Gatwick to Palma, 8 results,
  small N) the rules held: honest 8/8, every cheat caught 8/8. On TUI Majorca holidays they did not: honest 0/10,
  because the page writes "282 £ pp" (marker after the number) and our code reads label then number. Also that
  page could not hold "7 nights" (every card was 3 nights). "Any one alternative works" widens a check: the AI offered
  "Arrival time:" for "not a red-eye".
- F227: Booking.com, Expedia, eBay and Skyscanner block barebrowse. Google Flights, Airbnb and Amazon load. Amazon's
  only labeled price is the old "List Price".
- F228: bareguard 0.24.0 reads "US dollars" as a unit and passes honest 10/10 on the mv7qabx4 capture, but a fact
  carries one scalar unit or currency, so a signed spec cannot use lists. The "at" anchor still fails.

### Open items for the spec (each is open, none decided)

- (a) OPEN. Marker-after-number money form (Airbnb "€490 total", TUI "282 £ pp"). First step: ask the guard session
  what 0.24 already reads, with evidence on the real captures, before any bareloop code.
- (b) OPEN. Facts carrying currency and unit LISTS (a schema change in `src/facts.js`, `src/authorflow.js`,
  `src/factwords.js`). Arbiter-adjacent. hamr's call.
- (c) OPEN. N2 per-line label rule for time labels like "at" (bareguard's own anchor locate, measured 13 of 13 as
  expected across 5 sources by the guard session). Built nowhere yet.
- (d) OPEN. Page-level checks (a phrase the page must say once, not per result): a SECOND `cited` check over a
  separate claims field (`pageClaims`) with a presence decide `{phrases}`. The guard's design, from the stash
  `2026-10-14-idea-a-page-words-poc.md`. No new primitive.
- (e) OPEN. Test pages must hold answers to the job (TUI could not meet "7 nights"). Check the page against the job
  at $0 before reading any number from it.
- (f) OPEN. Site reach (F227): barebrowse blocks the busiest travel sites. Filed to barebrowse's own session only if
  hamr rules; not fixed here.

### Next

Next test pages: Google Flights, Airbnb, Amazon. Rule v2 is not yet written or frozen. Build comes AFTER P9, on its own
branch, only after hamr signs a spec. Nothing in this addendum is signed.

## Addendum 2026-10-17 — Idea A rule v2 (SIGNED by hamr 2026-10-17; FROZEN before any number is read)

hamr's rulings 2026-10-17: every open item (a)-(f) is in v2 scope; facts may carry currency and unit LISTS; test pages are
Google Flights only; (a) stays in v2 and is tested at $0 on a marker-after-number page; F234 (change3) folds in here, no
stand-alone patch. hamr 2026-10-17: the marker-after-number page is Airbnb. Signed and frozen; nothing below is built.
This is POC round 2 (round 1: F226-F228); a build spec follows only if the rules hold.

### How a check decides (unchanged, for reference)

Drafting picks, per fact, a shape and a label copied from the page (the words right before the value). The worker writes,
per result, one quote copied word for word from the page and the values. Code alone decides each result, one at a time:
the quote is in the page word for word; the label is in that quote exactly once; the value read right after the label
matches the worker's value; the value passes the fact's rule. The AI never grades.

### Rules v2 (drafting, code only, $0, on the real saved page)

Kept from the POC, unchanged: R1 same-value, R2 role-extend (R2a, R2b, R2c), R3 page-once, "code keeps only words found on
the page". Changed or new:

- **N2 per-line (now enforced).** A label that appears 2 or more times in any one line of the page is unusable. Drafting
  first tries R2 (grow the label left by up to 2 words, e.g. `at` -> `Leaves San Francisco International Airport at`,
  `-` -> `] -`); if no grown label appears at most once per line, drafting refuses that fact and asks the person.
- **S1 one result, distinct facts (new, F234).** Two facts of one result may not have the same shape AND the same label:
  they read the same value and can never differ. A fact name that counts results ("latest", "second", "third") is
  refused with the words "one result is one record; ask for N results instead".
- **(a) Marker after the number (new).** A money or count fact may sign its marker AFTER the value (`282 £ pp`,
  `€490 total`). First step: ask the bareguard session what 0.24 already reads, with the real capture as evidence;
  no bareloop code before that answer.
- **(b) Lists (ruled B).** A money fact may carry currency and unit as lists (`$` or `US dollars`); the same amount
  written two ways counts as one price (bareguard ruling #65). Schema change in `src/facts.js`, `src/authorflow.js`,
  `src/factwords.js`.
- **(c)** is N2 above.
- **(d) Page-level checks.** A phrase the page must say once (not per result) is a second `cited` check over a separate
  `pageClaims` field with a presence decide `{phrases}` (the guard's design, no new primitive).
- **(e) Page fits the job (test protocol, not product).** Before a test page's numbers are read, check at $0 that the page
  can hold an answer to the job (TUI held only 3-night trips for a 7-night job). A page that cannot is dropped, never
  scored.
- **(f) Site reach.** Booking, Expedia, eBay and Skyscanner block barebrowse (F227). Filed as an ask to the barebrowse
  session, never patched in bareloop.

### Test set and decision rule (frozen with the rules)

- Pages: the saved Google Flights captures copied to `.claude/scratch/idea-a-pages/` (LAX-SFO bc18145a, SFO-LAX
  fa50de61 and 1ee1341b, sha256 prefixes), plus ONE unseen Google Flights page fetched at $0 after the freeze. For (a):
  one Airbnb page (marker after the number, `€490 total`) fetched at $0 after the freeze (the saved TUI capture is gone).
- Cheats, each must be caught: arrival time as departure, price + 1, reversed direction, other route, two flights glued
  into one quote, position-named facts (F234 shape), a repeating label.
- A rule HOLDS on a page if honest passes >= 9 of 10 (proportional on a page with fewer results, flagged) AND every cheat
  class is caught 10 of 10. Anything else is a finding, never a re-tune.
- After the $0 test: one live flights run on DeepSeek deepseek-flash, hamr's go first.

## Addendum 2026-10-18 — Idea A rule v3 and its unseen-page test (SIGNED by hamr 2026-10-18; FROZEN before any unseen page is fetched)

POC round 3. v3 = the frozen v2 (above) plus three rules written after the Airbnb v2 failure (FINDINGS F235). Because they were
written after seeing that page, the Airbnb Lisbon smoke is a fit, not evidence. This test is the evidence. A failing page is a
finding; no v4 is written on a page of this test.

### The three added rules (verbatim definitions; the POC code is `.claude/scratch/idea-a-v2/rules-v3-candidate.mjs`, sha256
8646a1fecc4421aa76db63fd0c9b282e976987badaa94a29e396950a985bf3fe, on top of `rules.mjs`, sha256
1057f690ee79fe3c58d51624255477894d76f4a7222683c5cdd1d8531ef1b64f; neither file may change during this test)

- value token = digits with optional thousands commas and decimals; a currency symbol next to it is not part of it.
- "right before" a label = same line, the text before it (trailing whitespace removed) ends with a value token; no markup
  character skipped. "right after" = after leading whitespace and ONE optional `$` `€` `£`, the text starts with a value token.
- **U1** (money and number facts only). Per AI-listed label: no value right after and some right before -> the label becomes a
  `unit` (read after the number), no longer an anchor; no value either side -> dropped; a value right after -> stays a label.
- **R1L** (money and number facts, after U1). A unit form reads the value right before it; a currency form the value right
  after it. PRIMARY = the first form left after U1, units before currencies. A form is kept only if it reads the same set of
  values as the primary; the primary is always kept.
- **R3U.** R3's record proxy = the minimum over v2's usable money/time labels AND the page count (`countPhrase`, src/factwords.js)
  of every kept unit form; currency forms are not counted. R3 then applies to every place phrase left after R2/R2a/R2b.
- Known limit, not a rule: when a place appears only page-once, no per-result place check remains (the quote must still be
  word for word from that page).

### Test set (fetched at $0 with src/pagefetch.js only AFTER this commit; nothing chosen after seeing a page)

1. Airbnb Porto, 2026-11-12 to 2026-11-15, 2 adults, EUR, English:
   `https://www.airbnb.com/s/Porto/homes?checkin=2026-11-12&checkout=2026-11-15&adults=2&currency=EUR&locale=en`
   Job: "List 3 stays in Porto" `~ under €400 total`.
2. Google Flights LAX -> JFK, one way, 2026-11-19, USD, English:
   `https://www.google.com/travel/flights?q=Flights+from+LAX+to+JFK+on+2026-11-19+one+way&hl=en&curr=USD`
   Job: "List 3 flights from Los Angeles to New York" `~ under $450` `~ not a red-eye` `~ nonstop`.
3. Google Flights JFK -> LAX, same date and form (the reverse page, so direction is tested on unseen pages):
   `https://www.google.com/travel/flights?q=Flights+from+JFK+to+LAX+on+2026-11-19+one+way&hl=en&curr=USD`
   Job: "List 3 flights from New York to Los Angeles", same `~` rules.
- "Not a red-eye" = departs between 05:00 and 20:59 local (fixed here, by the harness; the AI picks no number).
- (e) first, at $0: each page must hold at least 3 answers to its job; the counts of rule-BREAKING results (over the price,
  red-eye, with a stop) are recorded. A rule with zero breakers on a page is reported as "not tested", never as held.
- One AI mapping call per page, DeepSeek deepseek-flash, thinking off; one retry on a transport error only; no JSON repair.

### Cheats (made by code from the page) and decision rule

- Flights: arrival time as departure; price + 1; reversed direction (each page's quotes graded against the other); another
  route (ORD-DEN quotes); two flights glued; position-named facts; a bare `at` label; and NEW, real rule-breakers offered as
  answers: a flight over $450, a red-eye, a flight with a stop (as many as the page holds, up to 10 each).
- Airbnb: price + 1; another listing's price; two listings glued; a `Pay €0 today` quote with price 0 (if the page has one);
  a real listing at or over €400 offered as an answer.
- HOLDS on a page if honest passes >= 9 of 10 (proportional with fewer results, flagged), every cheat class is caught 10 of 10
  (proportional when fewer exist, flagged), and every real rule-breaker offered is refused. Anything else is a finding.
- All grading through the product's own `gradeStep` (src/rubricstep.js). The POC never edits product code.
- After this test, and only on hamr's go: one live drafted run on a new flights page (real drafter, real worker), DeepSeek
  deepseek-flash.

## Addendum 2026-10-18 — Idea A rule v4 (a label that reads no value is dropped) and its test (SIGNED by hamr 2026-10-18; FROZEN before any number is read)

POC round 4. v4 = the frozen v3 (above, section sha256 1802f4b0…6c3a) carried forward unchanged, plus ONE generic rule,
written after FINDINGS F236 (JFK-LAX: time label `Departure time` one character off the page's `Departure time:`, kept,
reads nothing) and F237 (run mvdg1xo3: labels `StaticText` and `O` read no value, signed anyway). The rule is not fitted to
any one page. The POC code for it is `.claude/scratch/idea-a-v2/apply-v4.mjs`; it layers on `rules.mjs` (sha256
1057f690ee79fe3c58d51624255477894d76f4a7222683c5cdd1d8531ef1b64f) and `rules-v3-candidate.mjs` (sha256
8646a1fecc4421aa76db63fd0c9b282e976987badaa94a29e396950a985bf3fe), neither of which may change.

### The added rule (verbatim, hamr's words)

- **V4.** For every fact (price, time, number or text): code looks right after the label, inside the same result. If no value
  of the fact's kind is there in any result, the label is dropped; that fact shows as Not checked, with the reason in plain words.

### Definitions (chosen here, before any run)

- "Right after" = after leading whitespace, the text starts with a value of the fact's kind; no markup character is skipped.
  Kinds: money and number = v3's value token (one optional `$` `€` `£`, then digits with optional commas and decimals);
  time = `h:mm` or `hh:mm`, optionally followed by whitespace and AM or PM; text = a word character (letter or digit).
- "Inside the same result" is read by the harness as the same page line as the label (v3's convention). "In any result" =
  at least one occurrence of the label on the page has a value right after it. No occurrence has one -> the label is dropped.
- Carried from v3, not overridden: a money or number label with a value only right BEFORE it is a unit (U1), not a dropped
  label. V4 therefore adds the drop for time labels and text labels; for money and number labels the drop is U1's.
- Place and phrase facts are fixed words copied from the page, not labels followed by a value; V4 does not touch them.
- A fact left with no label, unit or currency is not signed. It is listed as Not checked with the reason
  `the page never shows a <time|price|number|text> right after "<label>"`, one line per dropped label.
- Known limit, not a rule: V4 reads the page line, not the worker's quote span. A label whose value sits on another line
  than the result's record (F237 `Departure time:` on its own tree line) reads a value and is kept; V4 does not solve it.

### Test plan (stated before any data)

- Pages: JFK-LAX (`gflights-jfk-lax.txt`, the F236 finding page), BOS-ORD (new: the page of run mvdg1xo3, copied from that
  session's `source-seed/tree/input/flights.txt`; job "List 3 flights from Boston to Chicago", rules `under $450`,
  `not a red-eye`, `nonstop`), and regression on every page v3 already held on: sfo1, sfo2, ORD-DEN, Airbnb Lisbon,
  LAX-JFK, Airbnb Porto.
- Saved AI maps are reused for every page but BOS-ORD ($0, no AI calls). BOS-ORD gets ONE AI mapping call made the way round 3
  made it (`mapcall.mjs`: same prompt, DeepSeek deepseek-flash, thinking off, one retry on a transport error only, empty-key
  guard); approved spend about $0.002, hard stop above $0.01.
- Reported per page and fact: label, kept or dropped, values read, verdict against v3.

### Decision rule

v4 HOLDS iff (a) on JFK-LAX and BOS-ORD every label that reads no value is dropped and every kept label reads a real value,
and (b) on every regression page no verdict that v3 got right changes and no real rule-breaker passes. Anything else is a
FINDING, logged, never re-tuned (frozen rule).

## Addendum 2026-10-18 — Idea A core: build spec (SIGNED by hamr 2026-10-18, all 18 design choices as recommended)

Signed by hamr 2026-10-18 (all 18 design choices as recommended); built on feat/thinking-retries in commits 9bf05ca..fd78723.
hamr's ruling 2026-10-18: build idea A CORE ONLY, then learn from live runs.
A rule is added back only when a live run fails without it (PRD §8a).
The frozen records above (v2, v3, v4, FINDINGS F226-F238) stay as they are. This spec builds from them; it re-designs nothing.

### 1. What the core is, in plain words

- Today the drafting look (`runInputLook`) reads the page with search tools and picks labels from a list code made.
  A label the page writes AFTER the number ("€490 total") is never on that list. A label that reads no value is kept (F237).
- The core replaces that look with ONE AI call that maps the job to the page's own words, then plain code rules that keep or drop each word.
- The AI never grades. Code keeps only words that are on the saved page.
- Every word, fact or `~` rule the rules drop is shown as Not checked, with a plain reason. Nothing is dropped silently (F238).

### 2. What is IN the core (eight items)

1. The AI page-word map at drafting (one call per page input).
2. Code keeps only words found on the saved page (count >= 1).
3. N2 per line: a label that appears 2+ times in one page line is unusable. The label is dropped. No grow-left (R2 is out).
4. R1 same-value: label alternatives are kept only if they read the same set of values as the first listed label.
5. U1 + R1L: a marker after the number (`€490 total`, `282 £ pp`) becomes a unit. Same value over currency and unit forms.
6. S1: two facts of one result may not share shape AND label. A fact name that counts results is refused: "one result is one record; ask for N results instead".
7. Currency and unit LISTS on a money fact (ruled B 2026-10-17, bareguard ruling #65: the same amount written two ways is one price).
8. NO SILENT DROP: every label, fact or `~` rule a rule drops shows on the plan card as Not checked, with a plain reason from code.

### 3. Ported verbatim, never re-designed

The rules are ported from the frozen POC code. The sha256 prefixes are of the files as they stand on 2026-10-18.
Neither POC file may change before the port. The builder records both hashes in its first commit.

- `.claude/scratch/idea-a-v2/rules.mjs` (sha256 1057f690ee79fe3c...): `linesOf`, `normLabel` use, N2 (`maxPerLine`), R1 (`sameSet`), S1 (`s1Check` and the name part of `applyRules`), found-on-page.
- `.claude/scratch/idea-a-v2/rules-v3-candidate.mjs` (sha256 8646a1fecc4421aa...): U1, R1L, `beforeAfter`, `unitSet`, `curSet`, `applyV3` money/number part.
- `.claude/scratch/idea-a-v2/apply-v3.mjs` (sha256 bb50e6f4eb56ca9f...): the way the rules are driven over a map and a page (the order of the rules).
- `.claude/scratch/idea-a-v2/mapcall.mjs` (sha256 aab07ea6ea434fe2...) and `mapcall4.mjs`: the map prompt and the call, ported verbatim into the product prompt (job line, `~` rules, "a result is one flight / stay", the JSON form, the shape meanings).
  `airlib.mjs` (sha256 f9426dbe110c0356...) is a test helper only (Airbnb listing splitter); it is not product code.

"Verbatim" means: the rule bodies are moved as they are; only imports, JSDoc types and the removal of the OUT branches change.
The OUT branches are R2, R2a, R2b, R2c, R3, R3U, V4 and the `pageClaims` output (section 9). They are deleted from the port, not rewritten.
Golden outputs are made first (section 8, test 1): the POC is run once with the OUT branches switched off in a scratch copy
(`.claude/scratch/idea-a-core/`, its sha256 recorded), on every saved page. The product port must match those outputs exactly.

### 4. Where it plugs in (the real call sites)

Read from the product code on 2026-10-18. Every line below names a file that exists today.

**4.1 The map call replaces the look.**
- Today: `src/authorjob.js` around line 607-624, the branch `if (survey == null && lang === RUBRIC_LANG)`, calls `lookFn` (default `runInputLook`, `src/authorscout.js:690`). Inputs are read first by `readFrozenInputs` (`src/rubricstep.js`) from the frozen copy that `proveRubricInputs` (`src/source.js:1256`) wrote. For a web address, `proveRubricInputs` already fetched the page with `fetchPageText` (`src/pagefetch.js:78`) and froze it. The map reads that frozen text, never the network.
- Core: a new default for `lookFn`, `runPageMap` in new `src/pagemap.js`. It takes the same arguments as `runInputLook` (`texts`, `inputs`, `jobLines`, `provider`, `ceilingUsd`, `onCall`, `rates`, `callOptions`) and returns the same envelope (`state`, `facts: {rubricFiles, inputs, look}`, `calls`, `raws`, `budgetStop`). So `onPhase('look')`, the spend booking and every downstream reader keep working.
- `lookFn` stays an injectable seam (null = no look, $0), as today.
- `runInputLook` and its tools (`src/inputlook.js` `lookReadTools`, `LOOK_REPORT_TOOL`) are unwired from the default path. They are deleted after the live proof passes (design choice 1), not before.

**4.2 The rules run in code right after the map, before anything else sees the answer.**
- New `src/pagerules.js` (pure, no I/O): `applyPageRules(text, mapping, jobLines)` returns `{ facts, dropped }`.
- `runPageMap` calls it on the AI's JSON and the frozen page text. The result is shaped as the existing `LookReport` (`src/inputlook.js` typedef): `facts[]` as `LookFact`, plus ONE new field `dropped[]` (section 7). `notFound` and `prose` stay as they are.
- `renderLookReport` (`src/inputlook.js:223`) renders `dropped[]` to the drafter as `NOT CHECKED (rule n): <reason>`, so the drafter does not write a check for a dropped word.

**4.3 The drafter writes from the kept facts; code proves it did not bring a dropped word back.**
- The drafter still writes the declaration (`src/authorflow.js`, validate loop at about line 2944).
- `checkDeclarationWords` (`src/factwords.js:104`, called at `src/authorflow.js:2949`) becomes the second proof: every signed `anchor`, `until`, `unit` and `currency` of a fact part must be a word the map KEPT for that fact. A word that is not on the kept set is the existing red `rubric-fact-word-missing` family, with a new code `rubric-fact-word-dropped` and the drop's reason in the detail. This is what makes a dropped label unable to return through the drafter.
- `checkFactWords` (`src/factwords.js:54`): the `labelOnList` test (`rubric-fact-label-off-list`) is replaced for page inputs by "the label is in the kept set". Today it requires the label to be on the code-made list (`src/labelscan.js`), and a marker after a number is never on that list. `countExact >= 1` stays (the found-on-page rule). `rubric-fact-label-rare` (M1) and `rubric-fact-phrase-rare` (M4) stay unchanged.
- `src/labelscan.js` stays (the found-once proof and the plan words still use it). Only the picked-from-list test is replaced.

**4.4 Code makes the Not checked rows, before validate.**
- New `withDropNotes(declaration, dropped, jobLines)` in `src/rubricstep.js`, called next to `withFactBindings(settlePersonsWords(...))` at `src/authorflow.js:2944`.
- A dropped item tied to a `~` rule (`forRule`) that no part carries and no `refused` entry names: code appends `{line, rule, reason}` to `closeDecl.refused`. The reader `ruleNotChecked` (`src/rubricstep.js:673`) and `planFromSpec` (`src/panel/jobplan.js`, the `refused` loop) already show it under that line, in the person's own rule words.
- A dropped item tied to no `~` rule (a fact from the job line itself): code appends one line to `closeDecl.notes`. `planFromSpec` already shows `closeDecl.notes` as "Not checked (the AI's own reading)".
- Never a line-level `refused` entry without `rule`: `checkRubricRules` (`src/rubricstep.js:572`) reads that as "the whole line is refused" and would silence every other rule red on the line.
- The drafter may also write its own `refused` entry. Code adds one only when none exists for that rule, so a rule is never listed twice.

**4.5 The confirm card shows the drops too.**
- The confirm turn (`authorjob.js`, after the look, `planFromConfirm` in `src/panel/jobplan.js`) takes `plan.notChecked` from the confirm model (`src/authorflow.js` about line 2429). Code appends the same drop lines there, in the same words, so the person sees them BEFORE drafting is paid for and again on the signed plan. The builder confirms the exact append point in the code; the words come from the one table in 4.6.

**4.6 The words are written in ONE place.**
- New `src/pagedropwords.js` holds one table: reason code -> plain sentence (section 7). The card, the Job tab, the confirm card and the drafter block all read it. No other file writes a drop reason.
- Words follow the standing rule: plain, from code, never a raw code, never model-written.

**4.7 Lists (item 7).** See section 6.

**4.8 What the signed spec carries.** The kept facts the drafter signs are the same `fact` part (`src/facts.js`), with the list fields of section 6. The map itself (the AI's raw JSON) is not signed. It is recorded in the drafting log (`draft-log.jsonl`, `src/draftspend.js`) next to the call's spend, scrubbed by the same masker as every raw, so a run can be replayed at $0.

### 5. The map call

- Provider and model: the job's drafter identity (the same provider row the look uses today). Thinking OFF (drafter rule, `thinkingCallOptions(provider, draftThinking)`).
- Booked to draft-spend like every drafting call: through `onCall`, which writes `draft-spend.json` (`src/draftspend.js`). The cap folds it in: run ceiling = Cap - draftSpentUsd.
- Reserve before the call; a call that would pass the ceiling is `cap-halt` before it is made, as `runInputLook` does (`capStop`).
- One call per page input. A job with several page inputs makes one call per input; the facts from each carry `source` = that input's label.
- Retry: one retry on a TRANSPORT error only (fetch-throw, ECONNRESET, ETIMEDOUT, socket hang up) or a 429 honouring the stated wait. `spendComplete=false` after a retry.
- No JSON repair. A malformed answer (not JSON, or JSON of the wrong form) is retried ONCE with the same message. A second malformed answer is a plain-word stop: "The AI's answer about the page was not readable twice. Nothing was signed." No Resume. This is the existing "malformed is retried, never repaired" ruling.
- A truncated answer (max_tokens) counts as malformed.
- The answer form (from `mapcall.mjs`): `{"facts":[{"name","from","shape":"place|money|time|phrase","words":[...],"currency":[...],"unit":[...]}]}`. `from` names the job line or the `~` rule (by number), so code can tie a drop to its rule.
- Empty-key guard and secret masking as every provider call. The page text goes to the provider; the prompt carries no key.

### 6. Currency and unit lists (item 7)

- Spec shape: on a money fact, `unit` and `currency` may each be a string (today) or a non-empty array of strings.
  A string is read exactly as a one-element array. Nothing is rewritten when an old spec is loaded.
- Old single-value specs still load and verify: their bytes and hash do not change, because the fields are not rewritten. The shape check accepts a string as before. No migration.
- A fact may now carry BOTH `unit` and `currency` (R1L needs this: `€490 total` is currency "€" and unit "total").
  Today `factShapeReds` (`src/facts.js:46`) reds "exactly one of unit or currency". bareguard 0.24 says "at least one" (see `factShapeFields`, which reads the guard's own words). The rule changes to: money names at least one of unit or currency.
- Limits are the guard's, enforced by us before the guard is asked, so the red is ours and plain: at most 3 currencies, at most 10 units, each non-blank, unique (exact string, no trailing space), a unit at most 100 characters. A currency is `$`, `€` or `£` only (codes like `EUR` go in `unit`, read after the number).
- Order is part of the signed hash. The map's order is kept; the primary form is the first.
- Files changed: `src/facts.js` (`factShapeReds`, `factDecides`, `sayBound`, `factSentence`, `factBrief`: pass lists through to the guard; words use the primary form and say "or" for more), `src/authorflow.js` (the drafter's fact schema text and the fact form it shows), `src/factwords.js` (`checkFactWords`: every listed unit must be found as a phrase; every listed currency must be found as a symbol).
- `factClaims` writes the claim text with the PRIMARY form, as today.
- `FACT_FIELDS` stays the same names. `factShapeGuide` / `factShapeFields` keep reading the guard's own text, so the guide cannot drift from the guard.
- The risk the guard named: every listed form WIDENS the check. A form is added only if the page uses it for that field (R1L). Known gap in section 10.

### 7. No silent drop (item 8, F238)

`applyPageRules` returns, for every word or fact it drops, one `dropped` entry:
`{ line, rule?, fact, word?, reason }`, where `reason` is a code from the table below and `rule` is the `~` number when the fact came from a rule.

Plain words (the one table, `src/pagedropwords.js`; `<label>` is the page's own word):

- not on page: `"<label>" is not written on the page.`
- no value either side (U1): `The page never shows a number right after or right before "<label>".`
- N2: `"<label>" is written more than once inside one line of the page, so one result cannot show it once.`
- R1: `"<label>" does not show the same values as "<first label>", so it was not used as a second way to read it.`
- S1, counting name: `One result is one record; ask for N results instead.`
- S1, same shape and label: `"<fact>" would read the same value as "<other fact>". The page gives no second label for it.`
- all labels gone: `No word on this page reads "<fact>" safely.`
- list over the limit: `Only the first 3 currencies / 10 units are used.`

Rules for the Not checked row:
- A fact whose every label was dropped is not signed. It is Not checked, with the reason of each dropped label (one line per label).
- A `~` rule whose only fact is not signed is listed as `line N: "<rule as written>" — <reason>` (the existing `ruleNotChecked` form).
- A drop that leaves the fact still checkable (one of two labels dropped) is shown too, as a note. A narrower check is still said.
- Nothing is silent: a builder test fails if `dropped` is not equal to the set of words the rules removed (section 8, test 3).

### 8. Tests

All use REAL saved pages from `.claude/scratch/idea-a-pages/`, copied into `tests/fixtures/idea-a/` with their sha256 in the test. No authored page. A fixture is not edited.
Saved AI maps (`.claude/scratch/idea-a-v2/map-*.raw.txt`) are the map inputs, so the suite spends $0 and calls no provider.
Tests run only through `npm test` / `scripts/hermetic.mjs`; the builder reports `runs.jsonl` line count before and after.

1. Golden port: for each page (sfo1, sfo2, ord-den, jfk-lax, lax-jfk, bos-ord, airbnb-lisbon, airbnb-porto), `applyPageRules` equals the scratch POC run with the OUT rules off. Must FAIL when one kept rule is switched off (mutation: copy to scratch, never `git checkout`).
2. Each rule can fail, on a real page:
   - found-on-page: a word absent from the page is dropped.
   - N2: the `at` label on the flights page (many per line) is dropped.
   - R1: a label that reads different values is dropped; the first stays.
   - U1/R1L: Airbnb `€490 total` yields unit `total`; the TUI-style `282 £ pp` form is tested on the Airbnb page only if it holds one (else reported "not tested", never held).
   - S1: a counting name ("second flight") is refused; two facts with the same shape and label are refused.
3. No silent drop on run mvdg1xo3's real labels (F237/F238): feed the five labels it signed (`MaxPrice` From, `DepartureWindow` "Departure time:", `Stops` StaticText, `LeaveAirport` Leaves, `ArriveAirport` O) and the real BOS-ORD page. The test asserts every label the rules remove has a `dropped` entry with a reason; `StaticText` shows as Not checked (U1, no number either side) and the "nonstop" rule shows a `line 1: "nonstop" — ...` row. It must fail when `withDropNotes` is removed.
4. Plan card words: `planFromSpec` and `planFromConfirm` show each reason from the one table; a test greps that no other file contains a drop sentence.
5. Lists: an old single-value spec loads, signs the same hash as before (fixture from a signed spec in the repo), and runs. A list spec round-trips through `factShapeReds`, `factDecides` and the real `bareguard` `createRubric` (no stub): at most 3 currencies / 10 units; a 4th currency is a plain red; both unit and currency on one fact is accepted.
6. Dropped word cannot return: a drafted declaration that signs a dropped label is a `rubric-fact-word-dropped` red.
7. Map call (a fake provider at the `provider.generate` seam, plus one test against the recorded real answer): malformed twice = plain stop and no Resume; transport error once = retried and `spendComplete=false`; truncated = malformed; the cap is checked before the call; the call is booked to `draft-spend.json`.
8. Real-seam rule (AGENT memory): at least one test runs the real `checkDeclarationWords` with the real `bareguard`, not a stub.
9. Each new test names a mutation that makes it red, recorded in the builder's report.

Gates: `npm run typecheck`, `npm run build:types`, `npm test` (quote each exit code and the last line, including `prompt-commit-check`).

### 9. Live proof plan (hamr's go per run)

Each run: DeepSeek `deepseek-flash`, cap $0.50, 20 min. Named in the first line of every proposal. A $0 archive read of the premise comes first.
Before each run: check the patient for uncommitted work and the job against the saved page ($0).

1. Google Flights, Boston to Chicago (the page of mvdg1xo3): "List 3 flights from Boston to Chicago", `~ under $450`, `~ not a red-eye`, `~ nonstop`. The run that failed in F237. Success is a green, or a red that shows a clear Not checked row for every dropped word and no signed fact that reads nothing.
2. Airbnb, a stay search with `€N total` (marker after the number): "List 3 stays in Porto", `~ under €400 total`.
3. A changelog page (non-travel regression): the job of the green run mv76m82c style (list 3 releases with version and date).

Rules of the proof:
- Each live failure is a FINDING first (FINDINGS entry, grounded in the spine). A rule is added back only for a live failure. n=1 per job is an anecdote either way.
- A rule out of the core (V4, R2, R3, pageClaims) is built only if a live run fails for want of exactly it. A reading-derived defect is logged and parked.
- No re-tune of a frozen rule from a failing page.

### 10. Not in this spec

OUT of the core (kept only as frozen records, F238):
- V4 (a label that reads no value is dropped, for time and text labels).
- R2, R2a, R2b, R2c (role grow-left of place phrases).
- R3, R3U (page-once place phrases; the record proxy).
- Page-level checks (`pageClaims`, a second `cited` check).

Known gaps, listed not fixed:
- The `€` currency lets a worker quote "Pay €0 today" with value 0 and pass "under 400" (the guard's answer, `.claude/scratch/idea-a-pages/guard-answers-2026-10-17.md`: 12 such lines on the Airbnb page). The guard says sign `unit: "total"` with NO currency; the core follows that advice only because R1L keeps units first. The currency form can still widen a check. A live run decides.
- A two-line quote: F237's "Departure time:" sits on its own tree line, not on the result's line. The core's N2 and found-on-page rules read page lines. The label is kept and no per-result quote can hold it. V4 would not have caught this either (F238).
- Text and time labels that read no value (F236 "Departure time", F237 "O" reading fragments of "O'Hare") are no longer dropped by V4. In the core they are caught only by the no-silent-drop shape (they are signed, then fail live). This is the first thing a live run may show.
- A place that appears once on the page has no per-result place check (v3 known limit).
- Site reach (F227): Booking, Expedia, eBay and Skyscanner block barebrowse. Not a bareloop fix.
- Page-level phrases ("this page says X once") are not checked.
- Text shapes of facts other than money/number get N2 and found-on-page only (no U1).

### 11. Branch and order

- Branch: `feat/thinking-retries` (hamr 2026-10-18: continue idea A on the same branch). Verify `git branch --show-current` before every commit.
- Builders: sonnet, strict pin, no subagents, per-item commits (item 1 to 8 of section 2 in this order: map call, found-on-page, N2, R1, U1+R1L, S1, lists, no silent drop).
- Files owned by one builder at a time (no two on `src/facts.js` or `src/authorflow.js`).
- CHANGELOG and `bareloop.context.md` lines for the map call, the lists in the signed spec and the Not checked rows are part of the branch (the adopter contract).
- When the build is green, ask hamr for `/branch-review` then `/release`, or park it, BEFORE the next branch.

### Design choices for hamr

1. Old look (`runInputLook`, `lookReadTools`): unwire now, delete after the live proof passes. Recommended: yes (delete in the same branch after proof; the tools are dead weight).
2. The map call runs for every rubric input (web page or local file), one path. Recommended: yes (local files still get label words from the page text; one engine).
3. Drops are kept apart from `notFound`, so a dropped `~` rule is Not checked and does NOT open a "which did you mean" question to the person. Recommended: yes (the standing ruling says Not checked, never ask piecemeal).
4. A dropped `~` rule is written by code into `closeDecl.refused` with its rule number; a dropped fact with no rule goes into `closeDecl.notes`. Never a line-level refusal. Recommended: yes.
5. The "label is on the code-made list" test is replaced by "label is in the kept set" for page inputs. Recommended: yes (the list cannot hold a marker after a number).
6. A money fact may carry both `unit` and `currency` (today exactly one). Recommended: yes (bareguard 0.24 accepts at least one; R1L needs both).
7. Old specs are not rewritten; a scalar `unit`/`currency` stays a scalar, so signatures keep verifying. Recommended: yes.
8. Our own plain reds for the guard's list limits (3 currencies, 10 units, unique, unit <= 100 chars) instead of passing the guard's raw error. Recommended: yes.
9. The primary form (first listed) is used in the claim text and in plan words; others say "or". Recommended: yes.
10. The raw AI map is recorded in `draft-log.jsonl` (scrubbed) so a run can be replayed at $0, and is NOT signed. Recommended: yes.
11. One call per page input when a job has several page inputs. Recommended: yes.
12. Golden outputs come from the POC with the OUT rules switched off in a scratch copy, hashed, before the port. Recommended: yes (the only honest "ported verbatim" test).
13. A fact whose every label drops is not signed and listed as Not checked, with one line per dropped label. A fact that keeps at least one label is signed and the other drops are noted. Recommended: yes.
14. A drop that narrows a still-checkable fact is shown as a note too (a narrower check is still said). Recommended: yes.
15. A truncated map answer counts as malformed (one retry, then a plain stop; no Resume). Recommended: yes.
16. The confirm card (before drafting) shows the drops, not only the signed plan. Recommended: yes (the person sees them before money is spent on drafting).
17. Local live proof order: Google Flights BOS-ORD, then Airbnb, then the changelog; stop the ladder on a failure and log it (build-ladder discipline). Recommended: yes.
18. Text and time labels that read no value (V4's job) stay out; a live run decides if V4 comes back. Recommended: yes, as ruled.

## Addendum 2026-10-21 — job-vs-source fit POC (SIGNED by hamr 2026-10-21; FROZEN before any number is read)

### 1. The question
Can one cheap AI call plus code say, before any run, whether a source fits a job as a whole? The four answers are: fits; partly (and which items are missing); mismatch (reversed route or wrong place); wrong-page. Evidence: F239, F240, F241 in docs/wiki/FINDINGS.md.

### 2. The call
- Model: deepseek-flash, thinking off (`thinkingMode: 'off'`), through a bare-agent Loop built like src/pagemap.js. One call per (job, page) pair, 3 calls per pair.
- The AI is told the job's items. Each item is a VALUE item (the job gives a value, e.g. origin = Boston, destination = Chicago, place = Porto) or a FIELD item (the job names a field, e.g. price, departure time, version, date, ticket id).
- For each item the AI returns JSON only, no prose: {item, role, jobValue|null, found:true|false, quote, pageValue|null}. The quote is the page line where that item sits in the job's role. For a value item, pageValue is the word that fills that role on the page.
- The prompt text is part of the freeze. It says: the page is one saved web page; list every item; for each item copy ONE page line (character for character) where the item sits in the job's role; if the item is not on the page set found to false and quote to ""; for a value item, if the job's value appears in the quote in that role, pageValue must be the job's value exactly, otherwise pageValue is the words on the page that fill that role; answer with one JSON object {"items":[...]} and nothing else.
- The page text is sent whole, unchanged.

### 3. Code decides (the AI never grades)
Normalize = collapse runs of whitespace to one space, compare case-insensitively.
- quoteOk = the normalized quote is a substring of the normalized page. A found:true item whose quote is not on the page is counted as "fabricated" and treated as not found.
- FIELD item matched = found && quoteOk.
- VALUE item matched = found && quoteOk && pageValue equals jobValue && jobValue is in the quote.
- VALUE item mismatch = found && quoteOk && pageValue non-empty && pageValue != jobValue && pageValue is in the quote.
- Verdict, in this order:
  1. any VALUE item mismatch gives "mismatch";
  2. the job has value items and none of them is matched gives "wrong-page";
  3. the job has no value items and 0 items are matched gives "wrong-page";
  4. all items matched gives "fits";
  5. otherwise "partly", listing the unmatched items.

### 4. The 9 pairs and their frozen answers
1. "List 3 flights from Boston to Chicago, with price and departure time" x P1 gives fits.
2. The same job x P2 gives mismatch.
3. "List 3 flights from Los Angeles to New York JFK, with price and departure time" x P3 (the file that leaves JFK) gives mismatch.
4. "List 3 stays in Porto with total price" x P4 gives fits.
5. The same Porto job x P5 gives mismatch.
6. The job of pair 1 x P4 gives wrong-page.
7. "List the last 3 releases with version and date" x P6 gives fits.
8. "Get the ticket id, first name, last name and date of birth" x P6 gives wrong-page.
9. "List 3 flights from Boston to Chicago with price, departure time, airline, wifi and meal" x P1 gives partly, with unmatched exactly {wifi, meal}.

Item lists per job (frozen):
- flights jobs: value items origin, destination; field items price, departure time (pair 9 adds airline, wifi, meal);
- Porto: value item place; field item total price;
- releases: field items version, date;
- ticket: field items ticket id, first name, last name, date of birth.

Why pair 9 says wifi and not seat class: the Phase A page check found "Economy" on P1 once, in the line `combobox "Change seating class. Economy (include Basic)"`. That is the page's seat-class selector, not a per-flight fact, and it would let a seat-class item match by accident. hamr chose to swap "seat class" for "wifi" (0 hits for "wifi" and "wi-fi" on P1; meal, food, snack also 0). Nothing else in the table changed.

Pages (path, bytes, sha256):
- P1 tests/fixtures/idea-a/bos-ord.page.txt, 50201, 2730b4733e9003afb1239c8b73f0fdb0f53545a512fc07fc5dcfa78977d79be2. "Leaves Boston" 54, "Leaves Chicago" 0.
- P2 .claude/scratch/reversed-live/ord-bos-now.txt, 32372, 328679f41f68d071b366cfd297254a1cd5bdd40e9bfa88167b46c5bdac5c220d. "Leaves Chicago" 32, "Leaves Boston" 0.
- P3 tests/fixtures/idea-a/jfk-lax.page.txt, 59511, 25a445265d6455b92e736a8c004b842e3bdfab10ca3cac55c2de758c8cb58c35. 64 x "Leaves John F. Kennedy International Airport at" (lax-jfk.page.txt is the other direction and is not used).
- P4 .claude/scratch/airbnb-live/porto-now.txt, 26549, 77d073569a09e3bf7238e051acd64c56183bcb70467ef26fee7ae15d403870f7. Porto 68, Lisbon 0, 24 "€N total" forms.
- P5 tests/fixtures/idea-a/airbnb-lisbon.page.txt, 27114, 440ede09fb76fdc85b041a47ba773d757569cdc3b80afa609e838df8e93d1c81. Lisbon 11, Porto 0.
- P6 .claude/scratch/changelog-live/input/CHANGELOG.md, 52949, a34717cc048deec140abe4683e7c6696a01d930f34a228fa1b27137f9292082f. Headings like "## [0.44.0] - 2026-10-20".

### 5. Pass rule (frozen)
- Every mismatch and wrong-page pair gets its frozen verdict in 3 of 3 calls.
- Every fits pair gets "fits" in 3 of 3 calls.
- Pair 9 gets "partly" with exactly {wifi, meal} in 3 of 3.
- Any miss means the POC FAILS and is logged as a finding.
- No change to the prompt, items or rules after the first number is read.
- Malformed JSON gets one retry; if still malformed, that call counts as a miss.
- A truncated answer (finish reason length) is counted separately as "cut" and is a miss.

### 6. Cost cap
$0.25 hard. Price from ~/.config/bareloop/config.json `models.DEEPSEEK_API_KEY` entry "deepseek-flash": inPerM 0.6, outPerM 1.2; the row `keys.DEEPSEEK_API_KEY` gives shape openai-api, baseUrl https://api.deepseek.com/v1, legacyMaxTokens true. Cost is booked per call from the usage the provider returns. The run stops before a call if booked spend plus a conservative estimate of that call's input (page bytes / 3.5 tokens) would pass the cap. Calls run in rounds (call 1 of every pair, then call 2, then call 3). A cap stop leaves the POC incomplete and it cannot PASS.

### 7. Scope
POC only, in .claude/scratch/fit-poc/. Never product code. Product behaviour on "partly" is decided after the numbers.

### Result — job-vs-source fit POC v1 (2026-10-21)

Appended at the end of this file, after the v1 addendum above (found by its title, "Addendum 2026-10-21 — job-vs-source fit POC"). Source: `.claude/scratch/fit-poc/RESULTS.md` (untracked scratch).

**FAIL by the frozen rule.** 9 pairs, 3 calls each, 27 calls.

| pair | frozen | call1 | call2 | call3 | pass? |
|---|---|---|---|---|---|
| 1 | fits | fits | fits | fits | yes |
| 2 | mismatch | wrong-page | mismatch | wrong-page | NO |
| 3 | mismatch | wrong-page | wrong-page | wrong-page | NO |
| 4 | fits | fits | fits | fits | yes |
| 5 | mismatch | wrong-page | wrong-page | wrong-page | NO |
| 6 | wrong-page | wrong-page | wrong-page | wrong-page | yes |
| 7 | fits | fits | fits | fits | yes |
| 8 | wrong-page | wrong-page | wrong-page | wrong-page | yes |
| 9 | partly {wifi, meal} | partly {wifi, meal} | partly {airline, wifi, meal} | partly {wifi, meal} | NO |

Why it failed:
- Pairs 2, 3 and 5: the AI said found:false for the origin, destination or place instead of naming the other city. So code had nothing to compare and said wrong-page, not mismatch.
- Pair 9 call 2: the AI made up an airline quote. Code caught it as fabricated (quote not on the page), so airline came out unmatched.
- Fabricated quotes 1. Cut answers 0. Malformed after retry 0. Retries 0.

Spend: $0.2024 of the $0.25 cap.

A reading made AFTER the numbers, which is not a pass: fit versus not-fit came out right in 27 of 27 calls. Only the label of the not-fit kind (mismatch or wrong-page) and pair 9's one invented quote broke the frozen rule. The frozen rule stands; this is a reading, not a result.

FINDINGS entry to follow after fix/bound-in-words merges (number clash).

## Addendum 2026-10-21 — fit POC v2: does what the look found answer the job? (SIGNED by hamr 2026-10-21; FROZEN before any number is read)

### 1. The idea
- hamr's idea: run the look first, then put everything it found together and ask ONE binary question. LLMs are good at binary questions, not at assessment.
- This is a judge, so it is rubric territory.
- Its answer would be a question to the person before signing, never an automatic pass or fail. That product shape is decided after the numbers.

### 2. Step 1: the look
- The product's own page-word map: `runPageMap` from src/pagemap.js, called the way src/authorjob.js calls it (`texts`, `inputs`, `jobLines`, `provider`, `ceilingUsd`, `onCall`, `prove: proverOf(texts)`, `rates`, `callOptions: thinkingCallOptions(provider, 'off')`).
- Model: deepseek-flash, thinking off.
- Each job is one job line, given as jobLines [{n:1, text:<job>}], with no ~ rules. The page is the one input.
- Run ONCE per pair. Output saved to .claude/scratch/fit-poc2/looks/<pair>.json.
- If the look stops or throws, that is recorded and the found set is empty.

### 3. Step 2: the found set (built by code)
- For each fact the look kept: the fact name, its kept words, and for each kept word up to 2 page lines that contain it (the first matches, each trimmed to 200 characters).
- Nothing else. If no facts were kept, the found set is the single line "nothing was found".
- Exact text format, one block per fact:
  `- <fact name>: kept words "<w1>", "<w2>"` then, per word, `    "<w>" is on the page in: <line1> || <line2>` (lines trimmed of leading and trailing whitespace; the page-line match is case-insensitive substring).

### 4. Step 3: the judge
- 3 calls per pair on the SAME found set. deepseek-flash, thinking off, maxTokens 4000, built like fit-poc/fit.mjs (bare-agent OpenAIProvider and Loop).
- System message: `You answer one yes/no question about what was found on ONE saved web page. You never invent words: every quote must be copied from the found items, character for character.`
- User message, exactly (the angle-bracket parts are filled by code):

```
THE JOB: <job text>

FOUND ITEMS (what the look found on the saved page):
<found set>

Do these found items, together, answer the job? Reply with JSON only: {"answer":"YES"|"NO","part":<the job words that are missing or contradicted, copied from the job, or null>,"quote":<a page line from the found set that shows the contradiction, or null>}.
```

### 5. Code checks (the AI never grades; code never changes the answer)
Normalize = collapse runs of whitespace to one space, compare case-insensitively.
- answer must be YES or NO; anything else (or unparseable JSON) is malformed: one retry, then a miss.
- if part is not null it must appear in the job text (normalized), else the flag "part-not-in-job".
- if quote is not null it must appear in the page text (normalized), else the flag "quote-not-on-page".
- a finish reason of length counts as cut, and a cut is a miss.

### 6. The 7 pairs and their frozen answers
1. "List 3 flights from New York JFK to Miami with price and departure time" x jfk-mia gives YES
2. the same job x mia-jfk gives NO
3. "List 3 stays in Barcelona with total price" x barcelona gives YES
4. the same Barcelona job x madrid gives NO
5. the job of pair 1 x barcelona gives NO
6. "Get the ticket id, first name, last name and date of birth" x changelog gives NO
7. "List 3 flights from New York JFK to Miami with price, departure time, airline, wifi and meal" x jfk-mia gives NO

Pages (path, sha256):
- jfk-mia: .claude/scratch/fit-poc2/pages/jfk-mia.txt, ad00a9a9052c038d1afaed88a572cb6467778ef3988ed8948acd0d8a5aa2a980
- mia-jfk: .claude/scratch/fit-poc2/pages/mia-jfk.txt, e22e30d4dae6a8ee0f270366f4e831a43fea8eb3a60b7e0680ccf6cb8c1bfb0d
- barcelona: .claude/scratch/fit-poc2/pages/barcelona.txt, cb63e3860c1103408d6592fc31f949036adb0536044ccd80891a47f220495497
- madrid: .claude/scratch/fit-poc2/pages/madrid.txt, bb3bacef065a05604ee66cfa96559beaaab5bc37272042d0f9bad879f76b4da1
- changelog: .claude/scratch/changelog-live/input/CHANGELOG.md, a34717cc048deec140abe4683e7c6696a01d930f34a228fa1b27137f9292082f

### 7. Pass rule (frozen)
- Every pair gets its frozen YES or NO in 3 of 3 calls.
- Every non-null quote is on the page.
- Every non-null part is in the job.
- Any miss means the POC FAILS.
- The content of `part` is reported but not graded.
- No change to prompts or code after the first number is read.
- A look that stops is reported. Its pair still needs NO (pairs 5 and 6) or counts as a miss (pairs 1-4 and 7 are judged on whatever found set code built, which for a stopped look is "nothing was found").

### 8. Cost cap
$0.30 hard, covering looks and judges. Price from ~/.config/bareloop/config.json `models.DEEPSEEK_API_KEY` entry "deepseek-flash" (inPerM 0.6, outPerM 1.2). Key DEEPSEEK_API_KEY from ~/.config/bareloop/.env, parsed in the script and never printed. baseUrl and shape from `keys.DEEPSEEK_API_KEY`. A cap stop leaves the POC incomplete and it cannot PASS.

### 9. Scope
POC only, in .claude/scratch/fit-poc2/. Never product code. 7 looks, then 21 judge calls, once, no rerun.

### Result — fit POC v2 (2026-10-21)

Source: `.claude/scratch/fit-poc2/RESULTS.md` (untracked scratch).

**FAIL by the frozen rule.** 7 pairs, 3 calls each, 21 calls.

| pair | frozen | call1 | call2 | call3 | pass? |
|---|---|---|---|---|---|
| 1 | YES | NO (quote-not-on-page) | NO | NO | NO |
| 2 | NO | NO | NO | NO | yes |
| 3 | YES | NO | NO | NO | NO |
| 4 | NO | NO | NO | NO | yes |
| 5 | NO | NO | NO | NO | yes |
| 6 | NO | NO | NO | NO | yes |
| 7 | NO | NO | NO | NO (part-not-in-job) | NO |

- The judge said NO on every call. So the 4 NO passes are not evidence: a judge that always says NO passes them too.
- Cause: the found set showed at most 2 page lines per kept word, so it never showed 3 results. "3 flights" was always "missing". Pair 1 call 1 quoted a correct JFK to Miami flight and still said NO with part "3 flights". On Barcelona the total-price fact kept no words.
- Two format artifacts: the judge copied the " || " joiner into a quote; and in pair 7 call 3 it reworded the job instead of copying it.
- Spend $0.0465.

## Addendum 2026-10-21 — fit POC v3: the judge sees 3 whole results (SIGNED by hamr 2026-10-21; FROZEN before any number is read)

### 1. What is the same as v2
- The same 7 pairs, jobs and frozen answers (v2 section 6).
- The same pages, with the same sha256 values as v2 section 6.
- The same looks. No new look call. The v2 look files are reused as they are:
  - looks/1.json fada44a85bb58a6782b6c9db7e5fdbceb2ca95f72d1e66d87b2cb6782a602e84
  - looks/2.json f20e86eed7a0e2f9cc428045c2073a9a7cd5ba16a8f0eb2270d9c2650f657568
  - looks/3.json 76b6093d7f5224f31ac98688b11bbb1944efb3f6432d8c233026b954dba7032c
  - looks/4.json a7ae30e86b89d52c34fc93394726cc5643ab86562634969e7812b4fe664b2115
  - looks/5.json 9049ddfaaa7bf91cc62eb8bfc7c70402b842b34ed326ba9d429cbc77f369d79f
  - looks/6.json aed4d2e034ddd061d951af2836e50fcbdfd83516285543f2b9318c361768ae70
  - looks/7.json ff68dd6259ee4fdd5f17634096f7c58b1d79f33f292454ed4d55487af7417789
  (all under .claude/scratch/fit-poc2/looks/)
- The same judge model: deepseek-flash, thinking off, maxTokens 4000. 3 calls per pair, 21 calls, once, no rerun.
- The change is only in what the judge sees.

### 2. Result blocks (built by code)
- Kept words = every kept word of every fact in the pair's look. A word that is empty after normalizing is dropped. A stopped look has no kept words.
- Normalize = collapse runs of whitespace to one space, compare case-insensitively.
- Split the page into lines. For each start line i, the block is lines i..i+11 (12 lines; fewer at the end of the page).
- The score of a block = the number of distinct FACTS (not words) that have at least one kept word in the block.
- Take the highest-scoring block. Ties go to the earliest line. Remove every block that overlaps it (start lines less than 12 apart). Repeat until 3 blocks are taken or no block scores >= 1.
- If no block scores >= 1, the evidence is the single line "nothing was found".
- Otherwise the evidence is the kept facts and their words (one line per fact: `- <fact name>: kept words "<w1>", "<w2>"`), then the blocks as "RESULT 1:", "RESULT 2:", "RESULT 3:", each followed by its 12 page lines verbatim, one per line. There is no other joiner.
- Code: .claude/scratch/fit-poc3/blocks.mjs. Block files, printed before this freeze and not used to change anything: .claude/scratch/fit-poc3/blocks/<pair>.txt with sha256:
  - blocks/1.txt 66a8d234dc004107b5c7478071a34f94e26f17e5985c00022d460003ec2db2b6
  - blocks/2.txt 28d26cfd6956a4b4ace18c23998cda1b05ed5d47d67c1ec40eef88653c498cbd
  - blocks/3.txt aa3a9ea002a00e3c2d11a196ed8d66660c275a3bba6bc29086b31e74e1861c1c
  - blocks/4.txt ba13e5da32b2847f27ff6ec0c45e0cf48ab3ebea9e878264db9124e60771a5f1
  - blocks/5.txt e4b544c356c29a25b8ae0a33073fc4e001b4ce5af413ba12cabf3cea41ecfc01
  - blocks/6.txt 899b5beb52a90c30a643903d209d88a322c66c1b4b29c3ff0f05c8def6d9efca
  - blocks/7.txt 06bff8a6506e9cc9e41b6466aa4224d810fc085f7e4364f74ba02140cc8f074a

### 3. The judge prompt (final text)
- System message: `You answer one yes/no question about what was found on ONE saved web page. You never invent words: every quote must be copied from the results, character for character.`
- User message, exactly (the angle-bracket parts are filled by code):

```
THE JOB: <job text>

<evidence: the kept facts and the RESULT blocks, or the line "nothing was found">

Do the results below, together, answer the job? Reply with JSON only: {"answer":"YES"|"NO","part":<the job words that are missing or contradicted, copied exactly from the job and never reworded, or null>,"quote":<ONE page line copied exactly from a RESULT block that shows the contradiction, or null>}.
```

Note: the question sentence sits after the evidence, as in v2. "The results below" means the RESULT blocks above it in the message; this is the frozen wording, kept as written.

### 4. Code checks and pass rule (same as v2 sections 5 and 7)
- answer must be YES or NO; anything else (or unparseable JSON) is malformed: one retry, then a miss.
- part, if not null, must appear in the job (normalized), else the flag "part-not-in-job".
- quote, if not null, must appear in the page (normalized), else the flag "quote-not-on-page".
- A finish reason of length is a cut, and a cut is a miss.
- Every pair gets its frozen YES or NO in 3 of 3 calls, with no flags. Any miss means the POC FAILS. Code never changes an answer. The content of `part` is reported, not graded.
- Anti-degenerate note (frozen): if every call answers the same word, the run is reported as DEGENERATE in addition to its pass or fail.
- No change to prompts or code after the first number is read.

### 5. Cost cap
$0.15 hard. Price from ~/.config/bareloop/config.json `models.DEEPSEEK_API_KEY` entry "deepseek-flash" (inPerM 0.6, outPerM 1.2). Key DEEPSEEK_API_KEY from ~/.config/bareloop/.env, parsed in the script and never printed. baseUrl and shape from `keys.DEEPSEEK_API_KEY`. A cap stop leaves the POC incomplete and it cannot PASS.

### 6. Scope
POC only, in .claude/scratch/fit-poc3/. Never product code.

### Result — fit POC v3 (2026-10-21)

Source: `.claude/scratch/fit-poc3/RESULTS.md` (untracked scratch).

**FAIL by the frozen rule, not degenerate.** 7 pairs, 3 calls each, 21 calls.

| pair | frozen | call1 | call2 | call3 | pass? |
|---|---|---|---|---|---|
| 1 | YES | YES | YES | YES | yes |
| 2 | NO | NO | NO | NO | yes |
| 3 | YES | NO | NO | NO | NO |
| 4 | NO | NO | NO | NO | yes |
| 5 | NO | NO | NO | NO | yes |
| 6 | NO | NO (part-not-in-job) | NO (part-not-in-job) | NO (part-not-in-job) | NO |
| 7 | NO | NO | NO | NO | yes |

- Pair 2 caught the flipped route 3 of 3. The part was "from New York JFK to Miami" and the quote was "Leaves Miami International Airport ... arrives at John F. Kennedy ...".
- Pair 1 answered YES 3 of 3. Pair 7 named "wifi and meal" as the missing part.
- Miss, pair 3: the look kept only "Barcelona" and no price words, so the 12-line blocks were page menus and filters, with no stays.
- Miss, pair 6: the right NO, but the part was copied from the evidence line "nothing was found" instead of from the job, so it was flagged part-not-in-job.
- Spend $0.0101.
- Learning: the judge works on real whole results. The weak link is the evidence (the look's words and the block cutter).

## Addendum 2026-10-21 — fit POC v4: AI finds 3 results, code verifies, binary judge (SIGNED by hamr 2026-10-21; FROZEN before any number is read)

### 1. What is the same
- The same 7 pairs, jobs and frozen answers (v2 section 6).
- The same pages, with the same sha256 values as v2 section 6:
  - jfk-mia ad00a9a9052c038d1afaed88a572cb6467778ef3988ed8948acd0d8a5aa2a980
  - mia-jfk e22e30d4dae6a8ee0f270366f4e831a43fea8eb3a60b7e0680ccf6cb8c1bfb0d
  - barcelona cb63e3860c1103408d6592fc31f949036adb0536044ccd80891a47f220495497
  - madrid bb3bacef065a05604ee66cfa96559beaaab5bc37272042d0f9bad879f76b4da1
  - changelog a34717cc048deec140abe4683e7c6696a01d930f34a228fa1b27137f9292082f
- The look is NOT used in v4.
- Model: deepseek-flash, thinking off, maxTokens 4000.

### 2. Step 1: FIND (AI)
- One call per pair, run once. 7 find calls.
- System message: `You copy text from ONE saved web page. You never invent words: every line you return must be copied from the page, character for character.`
- User message, exactly (angle-bracket parts filled by code):

```
THE JOB: <job text>

THE PAGE:
<full page text>

Copy up to 3 results from this page that come closest to the job. A result is one item the page lists (one flight, one stay, one row). Copy each result as the page lines that make it up, character for character. If the page lists nothing like the job, return no results. Reply with JSON only: {"results":[{"lines":["<page line>", ...]}, ...]}
```

- A malformed answer gets one retry. If it is still malformed, the found set is empty and that is recorded.

### 3. Step 2: VERIFY (code)
- Normalize = trim each line, collapse whitespace, case-insensitive.
- A returned line is kept only if it equals a normalized page line, OR is a substring of one with length >= 20 characters.
- Any other line is dropped and counted as "made-up".
- A result with no kept lines is dropped.
- Keep at most 3 results, in order.

### 4. Step 3: JUDGE
- If 0 results survive, code records answer NO with part null and quote null, and makes NO judge call. This is frozen here, before any number.
- Otherwise 3 judge calls on the same verified results.
- System message: `You answer one yes/no question about what was found on ONE saved web page. You never invent words: every quote must be copied from the results, character for character.`
- User message, exactly (angle-bracket parts filled by code; each RESULT's kept lines one per line):

```
THE JOB: <job text>

THE RESULTS (copied from the saved page and checked by code):
RESULT 1:
<lines>

RESULT 2:
<lines>

Do these results, together, answer the job? Reply with JSON only: {"answer":"YES"|"NO","part":<the job words that are missing or contradicted, copied exactly from THE JOB line and never reworded, or null>,"quote":<ONE line copied exactly from a RESULT, or null>}.
```

### 5. Code checks and pass rule (frozen, as in v3)
- answer must be YES or NO; anything else (or unparseable JSON) is malformed: one retry, then a miss.
- A non-null part must appear in the job (normalized), else the flag "part-not-in-job".
- A non-null quote must appear in the page (normalized), else the flag "quote-not-on-page".
- A finish reason of length is a cut, and a cut is a miss.
- Every pair gets its frozen YES or NO in 3 of 3 calls, with no flags. Any miss means the POC FAILS.
- A code-recorded NO (0 results) counts as 3 of 3 NO for that pair.
- DEGENERATE flag: reported if every pair's answers are the same word.
- Code never changes an answer. The content of `part` is reported, not graded.
- Also reported, not graded: made-up line count per pair, results kept per pair.
- No change to prompts or code after the first number is read.

### 6. Cost cap
$0.20 hard, covering finds and judges. Price from ~/.config/bareloop/config.json `models.DEEPSEEK_API_KEY` entry "deepseek-flash" (inPerM 0.6, outPerM 1.2). Key DEEPSEEK_API_KEY from ~/.config/bareloop/.env, parsed in the script and never printed. baseUrl and shape from `keys.DEEPSEEK_API_KEY`. A cap stop leaves the POC incomplete and it cannot PASS.

### 7. Scope
POC only, in .claude/scratch/fit-poc4/. Never product code. 7 finds, then up to 21 judge calls, once, no rerun.

### Result — fit POC v4 (2026-10-21)
- Verdict: FAIL, and DEGENERATE (every answer was NO).

| pair | frozen | call1 | call2 | call3 | pass? |
|---|---|---|---|---|---|
| 1 | YES | NO (code) | NO (code) | NO (code) | NO |
| 2 | NO | NO (code) | NO (code) | NO (code) | yes |
| 3 | YES | NO | NO | NO | NO |
| 4 | NO | NO (code) | NO (code) | NO (code) | yes |
| 5 | NO | NO (code) | NO (code) | NO (code) | yes |
| 6 | NO | NO (code) | NO (code) | NO (code) | yes |
| 7 | NO | NO | NO | NO | yes |

- Cause, found by the orchestrator afterwards: the verifier's ">= 20 characters" substring rule dropped REAL page text as "made-up". The finder copied the text inside page lines (for example `11:20 AM`, `€533 total`), while the page lines carry markup (`- StaticText "11:20 AM" [ref=2851]`, `- StaticText "€533 total" [ref=578]`). Both are on the page (grep -c gives 1 each). So most pairs got a code NO with no judge call.
- Pair 7 was judged NO, "wifi and meal", 3 of 3.
- Spend $0.0393.
- Learning across v1-v4: the binary judge answers right whenever it sees real results. Every failure was in how the evidence was collected (slot form, label lines, block cutter, verifier). hamr: "give the LLM the whole page and ask it the question".

## Addendum 2026-10-21 — fit POC v5: whole page, the job broken into questions, code decides (SIGNED by hamr 2026-10-21; FROZEN before any number is read)

### 1. How it works
- One call per try, 3 tries per pair. deepseek-flash, thinking off, maxTokens 4000.
- The AI gets the WHOLE page text and the job. No look, no finder, no code cutting of the page.
- System message: `You answer questions about ONE saved web page. You never invent words: every quote must be copied from the page, character for character.`
- User message, exactly (angle-bracket parts filled by code):

```
THE JOB: <job>

THE PAGE:
<full page text>

Break THE JOB into short yes/no questions, one per thing the job asks for (for example: are there flights from X to Y; is a price shown; is a departure time shown). Answer each from the page only. Then count how many results on the page match ALL of the job's questions. Reply with JSON only: {"questions":[{"q":"<question>","answer":"yes"|"no","quote":"<a short piece of page text that shows the answer, copied exactly, or null>"}],"matching":<number>}
```

### 2. Code checks and decides
- Normalize = collapse whitespace, case-insensitive.
- A quote is on the page if its normalized text is a substring of the normalized page. There is no length rule.
- A "yes" whose quote is null or not on the page is counted as "no" (unproven), and flagged.
- jobCount = the first whole number written in the job (for example "List 3 ..." gives 3). If there is none, jobCount = 1.
- Verdict, in order:
  1. any question answered "no" (including an unproven yes) gives NO;
  2. matching < jobCount gives ASK;
  3. otherwise YES.
- A malformed answer gets one retry, then a miss. A cut (finish reason length) is a miss. `matching` must be a whole number >= 0, else the answer is malformed.

### 3. Pairs and frozen verdicts
1. "List 3 flights from New York JFK to Miami with price and departure time" × jfk-mia → YES
2. same job × mia-jfk → NO
3. "List 3 stays in Barcelona with total price" × barcelona → YES
4. same Barcelona job × madrid → NO
5. the job of pair 1 × barcelona → NO
6. "Get the ticket id, first name, last name and date of birth" × changelog → NO (jobCount 1)
7. "List 3 flights from New York JFK to Miami with price, departure time, airline, wifi and meal" × jfk-mia → NO
8. "List 3 flights with one stop from New York JFK to Miami with price" × jfk-mia → ASK (the page lists exactly 1 one-stop flight; Phase A count: `grep -c "1 stop flight"` gives 1)

### 4. Pages (same sha256 values as v2 section 6)
- jfk-mia ad00a9a9052c038d1afaed88a572cb6467778ef3988ed8948acd0d8a5aa2a980
- mia-jfk e22e30d4dae6a8ee0f270366f4e831a43fea8eb3a60b7e0680ccf6cb8c1bfb0d
- barcelona cb63e3860c1103408d6592fc31f949036adb0536044ccd80891a47f220495497
- madrid bb3bacef065a05604ee66cfa96559beaaab5bc37272042d0f9bad879f76b4da1
- changelog a34717cc048deec140abe4683e7c6696a01d930f34a228fa1b27137f9292082f

### 5. Pass rule
- Every pair gets its frozen verdict in 3 of 3 tries. Any miss means the POC FAILS.
- DEGENERATE flag if all 24 verdicts are the same word.
- Reported, not graded: the questions the AI wrote, the unproven-yes count, and the matching numbers (for pair 8: did it count 1?).
- No change to prompts or code after the first number is read.

### 6. Cost cap
$0.40 hard (8 pairs × 3 whole-page calls). Price from ~/.config/bareloop/config.json `models.DEEPSEEK_API_KEY` entry "deepseek-flash" (0.6 in / 1.2 out per 1M). Key DEEPSEEK_API_KEY from ~/.config/bareloop/.env, never printed. baseUrl and shape from `keys.DEEPSEEK_API_KEY`. A cap stop leaves the POC incomplete and it cannot PASS.

### 7. Scope
POC only, in .claude/scratch/fit-poc5/. Never product code. 24 calls, once, no rerun.

### Result — fit POC v5 (2026-10-21)

Source: `.claude/scratch/fit-poc5/RESULTS.md` (untracked scratch).

**FAIL by the frozen rule, not degenerate.** 8 pairs, 3 tries each, 24 calls.

| pair | frozen | try1 | try2 | try3 | pass? |
|---|---|---|---|---|---|
| 1 | YES | NO | YES | YES | NO |
| 2 | NO | NO | NO | NO | yes |
| 3 | YES | ASK | YES | YES | NO |
| 4 | NO | NO | NO | NO | yes |
| 5 | NO | NO | NO | NO | yes |
| 6 | NO | NO | NO | NO | yes |
| 7 | NO | NO | NO | NO | yes |
| 8 | ASK | NO | NO | NO | NO |

- Every not-fit pair was caught, 15 of 15 calls (flipped route, wrong city, wrong page, missing wifi and meal).
- Pair 1 try 1: a made-up quote ("Flights from JFK to MIA", not on the page) turned a yes into an unproven no.
- Pair 3 try 1: `matching` was 1, so ASK. The count is not stable: pair 1 gave 14, 14, 3.
- Pair 8: the AI wrote its own count question ("3 flights with one stop?") and answered no, so the verdict was NO, never ASK.
- Spend $0.1307 of the $0.40 cap. 0 retries, 0 cuts.
- Learning: when the AI writes its own questions it adds ways to go wrong (made-up count questions); the count is unreliable.

## Addendum 2026-10-21 — fit POC v6: v1's job items on the whole page, found-or-not, code says RUN or ASK (ordered by hamr 2026-10-21: "run the small last test first"; FROZEN before any number is read)

Why: a person reads every result at Accept, so the fit check only has to stop a clearly wasted run before it spends. A wrong NO blocks a good run; a wrong YES costs one run the person rejects. So there is no NO and no count: anything not found becomes a question to the person.

### 1. How it works
- One call per try, 3 tries per pair. deepseek-flash, thinking off, maxTokens 4000.
- The AI gets the WHOLE page text, the job, and the job's items (frozen below; in the product they would come from the job lines, here they are hand-written and stand in for that split).
- System message: `You check whether ONE saved web page shows what a job asks for. You never invent words: every quote must be copied from the page, character for character.`
- User message, exactly (angle-bracket parts filled by code; one `- ` line per item):

```
THE JOB: <job>

THE JOB'S ASKS:
- <item>

THE PAGE:
<full page text>

For EACH ask, say whether the page shows it the way the job means it. A page that shows the opposite (for example a flight that arrives where the job says it leaves from, or a different city) does NOT show it. If found, copy a short piece of page text that shows it, character for character. If not found, quote is null. Reply with JSON only: {"asks":[{"ask":"<the ask, copied>","found":true|false,"quote":"<page text or null>"}]}
```

### 2. Code checks and decides
- Normalize = collapse whitespace, case-insensitive.
- A quote is on the page if its normalized text is a substring of the normalized page. No length rule.
- An ask counts as found only if found is true AND the quote is on the page. A found:true with a quote not on the page counts as not found and is flagged "made-up".
- Asks are matched to the frozen items by order; a reply with a different number of asks is malformed.
- Verdict: every ask found gives RUN; otherwise ASK, with the list of not-found asks (this list is the question the person would see).
- A malformed answer gets one retry, then a miss. A cut (finish reason length) is a miss.

### 3. Pairs, items and frozen verdicts (pages as v5 section 4, same sha256)
Items:
- JFK: "leaves from New York JFK", "arrives in Miami", "price", "departure time"
- BCN: "stay in Barcelona", "total price"
- TICK: "ticket id", "first name", "last name", "date of birth"
- JFK7: the JFK items plus "airline", "wifi", "meal"
- JFK8: "one stop", "leaves from New York JFK", "arrives in Miami", "price"

Pairs (jobs exactly as v5):
1. JFK × jfk-mia → RUN
2. JFK × mia-jfk → ASK
3. BCN × barcelona → RUN
4. BCN × madrid → ASK
5. JFK × barcelona → ASK
6. TICK × changelog → ASK
7. JFK7 × jfk-mia → ASK
8. JFK8 × jfk-mia → RUN (the page has exactly 1 one-stop flight; v6 does not count by design, the count is seen at Accept)

### 4. Pass rule
- Every ASK pair (2, 4, 5, 6, 7) gets ASK in 3 of 3 tries.
- Every RUN pair (1, 3, 8) gets RUN in at least 2 of 3 tries.
- Any miss means the POC FAILS.
- DEGENERATE flag if all 24 verdicts are the same word.
- Reported, not graded: the not-found list per try (pair 7: does it name wifi and meal? pair 2: does it name the route?), the made-up count.
- No change to prompts, items or code after the first number is read.

### 5. Cost cap
$0.25 hard. Price, key and endpoint exactly as v5 section 6. Key never printed. A cap stop leaves the POC incomplete and it cannot PASS.

### 6. Scope
POC only, in .claude/scratch/fit-poc6/. Never product code. 24 calls, once, no rerun.

### Result — fit POC v6 (2026-10-21)

Source: `.claude/scratch/fit-poc6/RESULTS.md` and `calls.jsonl` (untracked scratch; FROZEN.sha256 checked OK after the run).

**PASS by the frozen rule, not degenerate.** 8 pairs, 3 tries each, 24 calls.

| pair | frozen | try1 | try2 | try3 | pass? |
|---|---|---|---|---|---|
| 1 | RUN | RUN | RUN | RUN | yes |
| 2 | ASK | ASK | ASK | ASK | yes |
| 3 | RUN | RUN | RUN | RUN | yes |
| 4 | ASK | ASK | ASK | ASK | yes |
| 5 | ASK | ASK | ASK | ASK | yes |
| 6 | ASK | ASK | ASK | ASK | yes |
| 7 | ASK | ASK | ASK | ASK | yes |
| 8 | RUN | RUN | RUN | RUN | yes |

- Pair 2 (flipped route) named "leaves from New York JFK" and "arrives in Miami" in all 3 tries; try 1 also named price and departure time.
- Pair 7 named exactly "wifi" and "meal" in all 3 tries.
- Pair 4 named "stay in Barcelona" (try 3 also "total price").
- Made-up quotes 0. Retries 2 (malformed first answers). Cuts 0. Spend $0.1396 of the $0.25 cap.
- Limit: these are the same pages v2-v5 used, and v6's design was chosen after reading their failures. This is a fit on known pages, not proof on unseen pages. n = 3 tries per pair.

## Addendum 2026-10-21 — fit check build spec (ordered by hamr 2026-10-21: "1, go build"; built on fix/bound-in-words)

From fit POC v6 (PASS on known pages, F243). A person reads every result at Accept, so the fit check only stops a clearly wasted draft. There is no NO and no count: anything not found becomes one question to the person.

### What it does
1. Rubric jobs only, at drafting, once. It runs after the inputs are frozen and the content gate passes, and BEFORE the look (`lookFn`), so a wrong page stops before the look spends.
2. One call (deepseek or whatever the drafting provider is; drafter thinking rule = off; same `callOptions` as the look). The AI gets the job lines (numbered, `~` rules NOT included) and the WHOLE text of every input, each under its label. For each job line it splits the line into the short parts it asks for, using only words copied from that line, and says found with a quote copied from the page, or not found.
3. Code decides, never the AI:
   - Normalize = collapse whitespace, lower case.
   - Every ask's normalized text must be a substring of its own job line's normalized text, and every job line must have at least one ask. Otherwise the reply is malformed.
   - An ask is found only if found is true AND its normalized quote is a substring of one input's normalized text. found:true with a quote not on the page = not found, flagged made-up.
   - All asks found = `fits`: nothing is shown, drafting goes on exactly as today.
   - Any ask not found = `ask`.
4. Failure is OPEN (a wrong stop is the costly mistake): a malformed reply gets one retry; a second malformed reply, a cut (max_tokens), a call failure after the existing one-retry transport rule, or a cap stop before the call gives `absent`. On `absent` drafting goes on, and chat says in plain words: "The fit check did not finish; drafting goes on."
5. On `ask`, one question through the existing panel `ask` seam (it already writes the `human` row to draft-log.jsonl), text owned by code:
   `I found X of Y of your asks on this page. Not found: <ask> (line N), <ask> (line N). Type go on to keep drafting, or anything else to stop and change the job or the page.`
   - Answer "go on" (normalized, also "go on." ) → drafting continues to the look.
   - Any other answer → stop `fit-stopped`, plain words via `draftStopText`: "Stopped before drafting: the page does not show everything the job asks for (<not-found list>). Change the job or the page and draft again. Spent so far: $X."
   - No answer (session abandoned) → existing `confirm-abandoned`.
   - The answer is NOT a `~` rule and changes nothing in the signed job.
6. Spend: booked through the existing `onCall` with label `fit-check`, cap-checked with `capStop` before the call, counted in the drafting part like the look.
7. Record: one draft-log row `{kind:'fit-check', state, asks:[{line, ask, found, quote, madeUp}], notFound}`.
8. Only when the caller supplies the answer seam (panel). With no seam (CLI door, tests that don't inject it) the fit check does not run.

### Call sites
- New `src/fitcheck.js`: pure `decideFit(reply, jobLines, texts)` and `runFitCheck({jobLines, texts, provider, rates, ceilingUsd, onCall, callOptions, createLoop})`, following `runPageMap`'s call/book/retry pattern (src/pagemap.js).
- `src/authorjob.js`: call it after `readFrozenInputs` (:608) and the content gate (:611), before `lookFn` (:618), under `lang===RUBRIC_LANG` and the new seam present.
- `src/panel/authorsession.js`: pass a `fitAsk` seam built on the existing `ask` seam (:536-566); fire `onPhase('fit-check')`.
- `src/authorreadout.js` `draftStopText`: the `fit-stopped` head.

### Tests (real data where it exists)
- `decideFit` on real pages and real replies: use the fit POC v6 pages (copy jfk-mia, mia-jfk, barcelona into tests/fixtures/fit/ with their sha256) and quotes taken from `.claude/scratch/fit-poc6/calls.jsonl`; a made-up quote; an ask not copied from its line (malformed); a line with no ask (malformed); fits; ask.
- `runFitCheck` with an injected loop: retry once on malformed, absent on the second, absent on cut, cap stop before the call, spend booked with label `fit-check`.
- Wiring (panel-author style): fits → no question, look runs; ask + "go on" → look runs; ask + other words → `fit-stopped` with plain words and spend; absent → note and look runs; no seam → no call.
- Each test must fail without the change.

## Addendum 2026-10-21 — search POC: can barebrowse search a named site and page through results? (rulings by hamr 2026-10-21; FROZEN before any number is read)

hamr's rulings: an input `search: <url>` always names a site the person trusts (google.com, duckduckgo.com, ua.com ...); bareloop uses that site's own search box. The AI writes the search words its own way (no extra rule for the person). Match = the fit check (F243): all asks found = this page. Up to 5 results pages (page 1, then next, ...); none fits = ask the person. The results page itself is the evidence (saved like a fetched page). At run time it searches again with the same rule. The browse gate stays: read, type, click on search-box forms only; never pay/book/buy/send/submit/sign-up or card fields.

### What the POC tests (the riskiest part only)
Can barebrowse, as a library (connect, goto, snapshot, type, press, click), on a real site: find the search box, type the AI's words, submit, read the results page, and reach the next results page? And does the fit check (src/fitcheck.js on fix/bound-in-words, used as is) say fits on a results page that holds the answer?

### How
- One AI call (deepseek-flash, thinking off) gets the site's first snapshot and the job line and returns {"box": <ref>, "words": "<search words>"}. Code checks the ref is a searchbox / combobox / textbox in the snapshot, types the words, presses Enter, waits for network idle, snapshots.
- Then the fit check on that snapshot. fits = stop. Else one AI call returns {"next": <ref>|null} for the next-results-page control; code checks the ref is a link or button in the snapshot; click, wait, snapshot, fit check. At most 5 results pages.
- Code refuses any click whose name contains pay, book, buy, send, submit, sign up, sign in, checkout, card (case-insensitive); a refused click ends that case as "gate".
- Per case recorded: each step, snapshot sizes, the words typed, refs used, fit result per page, cost.

### Cases and frozen expectations
1. google.com × "List 3 flights from Boston to Denver with price and departure time" → fits within 5 pages
2. duckduckgo.com × the same job → reported only (no expectation)
3. duckduckgo.com × "List the last 3 releases of Node.js with version and date" → fits within 5 pages
4. duckduckgo.com × "List 3 stays in Porto with total price" → no fit after 5 pages (ask)
5. ua.com × the flights job → expected to fail to search (From/To/Date form, not one box); logged as a site-reach finding, never patched

### Pass rule
- Mechanics PASS if cases 1 and 3 reach a results page and say fits, and case 4 ends in ask after paging (at least 2 results pages reached). Anything else is a FAIL and a finding.
- Case 2 and case 5 are reported, not graded.
- One run, no rerun, no change after the first number.

### Cost cap
$0.30 hard, deepseek-flash, key and price as fit POC v5 section 6.

### Scope
POC only, in .claude/scratch/search-poc/. Never product code.

## Addendum 2026-10-21 — money POC: read the price form from the results only, and prove it at $0 before signing (ordered by hamr 2026-10-21: "can you poc first?"; FROZEN before any number is read)

Why: a page writes one currency several ways in several places (Google Flights: `$289` in filters, `From 289 US dollars` in each result). The look reads the whole page, so a signed price rule can mix places (F241: "$" after "From", while every result says "From 137 US dollars") and no run can pass. Only the results matter.

### What it tests ($0, no model call, real saved pages, the real checker)
- **Dry read.** For a signed price rule and a saved page: take every page line that is a RESULT (a line where the rule's anchor is followed by a number, as the page writes it); for each, build the claim an honest worker would write (quote = that line, value = the digits of the amount) and grade it with our own `gradeStep` (src/rubricstep.js, bareguard `checkStep`). Count reads = results graded green.
- **Results-only rule.** Code (no AI) reads, from those result lines only, the currency word or symbol that sits next to the number, maps it through a per-currency list (USD: `$`, `US dollars`, `USD`; EUR: `€`, `EUR`, `euros`; GBP: `£`, `GBP`, `pounds`), and builds the rule {anchor, currency list}. Then the dry read on the same page.
- **Cheat guard.** On each page, one claim whose value is NOT the amount in its quote must grade red under every rule.

### Rules and pages (frozen)
- R-F241: the signed price fact of run mvh7g2hc (spec in ~/.config/bareloop/panel-sessions/smvh7bxou4win/, read only) on its own saved page.
- R-ok: the signed price fact of run mvif12u2 (session smvif0by4xpfx) on its own saved page.
- R-code: the results-only rule, on every saved page: tests/fixtures/idea-a/*.page.txt, tests/fixtures/fit/*.txt, .claude/scratch/idea-a-pages/*.txt, .claude/scratch/reversed-live/ord-bos-now.txt, .claude/scratch/airbnb-live/porto-now.txt, the two session pages above. sha256 of each recorded before any number is read. For Google Flights pages the anchor is "From"; for Airbnb pages the anchor is "total" (the number comes BEFORE it: "€533 total") — this case is expected to expose the known number-before-label gap.

### Pass rule
- R-F241 reads fewer results than its page has (the dry read catches F241 before signing).
- R-ok reads every result on its page.
- R-code reads every result on every Google Flights page.
- The cheat claim is red on every page under every rule.
- Airbnb pages are reported, not graded (the number-before-label case belongs to bareguard's reader; a miss there is logged as an ask to bareguard, never patched).
- Any miss = FAIL and a finding. No change after the first number.

### Not tested here
The worker brief line "a price is only the digits" (fwd's fix) needs a live model call; fwd's live re-walk result is awaited first.

### Scope
POC only, in .claude/scratch/money-poc/. Never product code. $0.

### Result — search POC v1 (2026-10-21)
Source: `.claude/scratch/search-poc/RESULTS.md`. **FAIL by the frozen rule.** Spend $0.1542.
- Mechanics worked: barebrowse found the box, typed, submitted and read results on google.com and duckduckgo.com; "More Results" paged 4 times on duckduckgo. No consent wall, bot check or block.
- Case 1 (google, flights): ask. A search engine's results page holds links and snippets, not the flights; the list is one click deeper ("Find Cheap Flights from Boston to Denver" → google.com/travel).
- Case 3 (duckduckgo, Node releases): the AI named the `search` landmark (ref 1335) instead of the combobox (ref 1446); code refused it, nothing was typed.
- Case 4 (Porto): ask after 5 pages, as expected. Case 5 (ua.com): no single box, as expected (site-reach finding).
- Google answered in Dutch (no language set). The harness started while a fwdloop test suite ran (no tracked change).
- hamr's ruling after it (2026-10-21, "2a"): open the results, up to 5 links, fit check on each opened page.

## Addendum 2026-10-21 — search POC v2: open the result links (ruling by hamr 2026-10-21; FROZEN before any number is read)

### Changes from v1 (only these)
- CODE picks the search box: the first searchbox, else the first combobox, else the first textbox in the site snapshot. The AI only writes the words (one call: {"words": "..."}).
- Language: the browser asks for English (barebrowse/locale option or an `hl=en` style query only if barebrowse has no locale option; report which).
- After the results page: one AI call gets the results-page snapshot and the job line and returns up to 5 refs of result LINKS, best first ({"links":[ref,...]}). Code keeps only refs that are links in the snapshot and whose names pass the gate words of v1. For each kept link in order: go back to the results page if needed, click (or goto the link's address if the snapshot carries one), wait, snapshot, fit check. First `fits` = stop, that opened page is the evidence. A page that is blocked, a bot check, or under 100 characters counts as not fitting. None fits after 5 = ask.
- The results page itself is also fit-checked first (a site search like Airbnb can fit there); fits = stop.

### Cases and frozen expectations
1. google.com × "List 3 flights from Boston to Denver with price and departure time" → fits on an opened page within 5 links
2. duckduckgo.com × "List the last 3 releases of Node.js with version and date" → fits on an opened page within 5 links
3. duckduckgo.com × "List 3 stays in Porto with total price" → reported only
4. google.com × "List the last 3 releases of Node.js with version and date" → reported only

### Pass rule
Cases 1 and 2 reach `fits`. Anything else is a FAIL and a finding. One run, no rerun, no change after the first number. Report per case: words typed, links chosen (names), each opened page's address, size, fit state and not-found list, cost.

### Cost cap
$0.40 hard, deepseek-flash, thinking off, key and price as v1.

### Scope
POC only, in .claude/scratch/search-poc2/. Never product code.

### Result — money POC (2026-10-21)
Source: `.claude/scratch/money-poc/RESULTS.md`. $0, real checker (`gradeStep`), sha256 of every page recorded first.
- R-F241: read 0 of 16 results ("the quote holds no money after \"From\"") — the dry read catches F241 before signing. PASS.
- R-ok (run mvif12u2): 14 of 14. PASS.
- R-code: every Google Flights page read every result (14 to 45 each). The script reported FAIL on `tests/fixtures/fit/barcelona.txt`, which is an Airbnb page its file-name sorter missed; by the frozen text (Google Flights pages only) this line PASSES. Recorded as a harness classification error, not a read miss; nothing changed after the numbers.
- Cheat claim: red on all 28 rule × page pairs. PASS.
- Airbnb (reported): the POC built `anchor: "total"` and read 0 of 24 "€533 total". That is the POC's own shape: the product's U1 rule (src/pagerules.js) already moves a label written after the number into a unit, and the Airbnb live proof (2026-10-21) was green. No bareguard ask from this.
- Proven on one site family (Google Flights) only.

## Addendum 2026-10-21 — money build spec: forms that read the RESULTS, proven at $0 before signing (ordered by hamr 2026-10-21: "go"; built on fix/bound-in-words)

Today (src/pagerules.js money branch) the AI lists a fact's labels, units and currency signs; code keeps the forms found on the page and R1L keeps forms that read the same set of numbers as the first one, across the WHOLE page. Nothing checks that a form reads a price in the results right after the label, so F241's "$ after From" was signed on a page whose every result says "From 137 US dollars". Lists of units and currencies already exist (src/facts.js).

### What it does (drafting, code only, $0)
1. **Same-currency family.** A small table owned by src/facts.js next to the sign list: USD = signs `$`, `US$`; words `US dollars`, `USD`. EUR = `€`; `EUR`, `euros`. GBP = `£`; `GBP`, `pounds`. When the AI lists any form of a currency, code adds that currency's other forms before the existing found-on-page filter (so only forms really on the page survive, and found-once stays honest). Forms of a currency not in the table are left as the AI listed them.
2. **Result lines.** For a money fact with labels, a result line is a page line (the existing `lines` unit in pagerules) where a kept label is followed by a number as the page writes it, with at most one currency sign between (the existing BEFORE/AFTER readers).
3. **Per-form result read (new rule, R-RES).** Each surviving form is kept only if it reads at least one result line: the amount right after the label is written in that form (a sign before the number, or a unit word after it). A form that reads no result line is dropped with reason `reads-no-result` (plain words: `"$" never appears next to the price after "From" in the page's results, so it was not used.`). Runs before R1L, so R1L compares only forms that read results.
4. **Fact dry read.** After the rules, for every kept money fact: count the result lines it reads (any kept form). Needed = the job line's result count when the look has one (`exactly N` / `at least N`), else 1. Fewer than needed = the fact is dropped with reason `dry-read-short` and plain words `the price rule read N of the M prices the job needs in the page's results, so it is not checked.` A dropped fact shows under "Not checked" through the existing `look.dropped` path (never silent).
5. Time and number facts are untouched in this change.

### Call sites
- src/facts.js: the currency family table (exported), one owner.
- src/pagerules.js `applyPageRules` money branch: family expansion before the found-on-page filter; R-RES before R1L; the fact dry read after R1.
- src/pagedropwords.js: the two new reasons' words.

### Tests (real data)
- The F241 page and spec (run mvh7g2hc, ~/.config/bareloop/panel-sessions/smvh7bxou4win/, copy the page into tests/fixtures/money/ with sha256; read only): "$" after "From" is dropped `reads-no-result`; with the family table "US dollars" is added and kept, and the fact reads every result. Must fail before the change.
- The mvif12u2 page (tests/fixtures/fit/bos-den.txt): the price fact keeps "US dollars", reads all results.
- An Airbnb page (tests/fixtures/idea-a/airbnb-porto.page.txt): the existing U1 behaviour is unchanged (golden tests keep passing).
- A fact that reads fewer results than the job's count: dropped `dry-read-short`, shown Not checked.
- Every existing pagerules golden test keeps passing; if one changes, STOP and report it (it may be a real behaviour change for hamr).

### Result — search POC v2 (2026-10-21)
Source: `.claude/scratch/search-poc2/RESULTS.md`. **FAIL by the frozen rule** (case 1 ask, case 2 fits). Spend $0.0754.
- Code picked the box every time; English via `hl=en` / `kl=us-en` (barebrowse has no locale option).
- Case 1 (google, BOS→DEN flights): 4 links opened (JetBlue "Book Flights" refused by the gate word "book"); Google Flights route page (no date, no times), Expedia 164 chars (silent block), Skyscanner 1404 chars (blocked), United deals page: none fit. Search-engine links for a dated listing are landing pages, not live results.
- Case 2 (duckduckgo, last 3 Node.js releases): fits on link 2, nodejs.org/en/blog/release.
- Case 3 (Porto, reported): ask; Booking refused by the gate; the other links were DuckDuckGo's own `site:` searches.
- Case 4 (google, Node, reported): ask; three single-release pages.
- Learning: search + open links works for information jobs; dated listing jobs (flights, stays) need the person's pasted results link, as today.

### Rulings by hamr after it (2026-10-21)
- Search: build it for information jobs (the v2 design that passed); listing jobs keep the pasted results link.
- Money: the bigger build (family table, R-RES, dry read inside pagerules) is withdrawn (saved at `.claude/scratch/money-big-version/`, never committed): it added a second reader beside bareguard's checker and moved 11 tests. Instead: bring back only "can it read" — before signing, the real checker reads the saved page's results for each price rule; no limits, no count, no pass bar.
- hamr's idea to test first: read ALL currency forms on the page and use all of them in the price checks.

## Addendum 2026-10-21 — money POC 2: all the page's currency forms in the price rule, read by the real checker (ordered by hamr 2026-10-21; FROZEN before any number is read)

### How ($0, no model call, the real checker)
- Forms on a page = every sign `$`, `€`, `£` the page holds, plus every word from this list the page holds as whole words: `US dollars`, `USD`, `euros`, `EUR`, `pounds`, `GBP`. Nothing else, no mapping between them.
- For each rule and page of money POC 1 (same pages, same sha256 check), replace the rule's money forms with ALL forms on that page (labels unchanged) and run the money POC 1 dry read (result lines, honest claims, `gradeStep`) and the cheat claim.
- Also report, per page, which of those forms the existing R1L rule (src/pagerules.js) would drop if they were listed together — the product today drops a form whose whole-page number set differs from the first.

### Pass rule
- R-F241 with all forms reads every result on its page (the rule is rescued, not only caught).
- Every Google Flights page: all forms read every result.
- The cheat claim is red on every page.
- Airbnb pages reported only.
- Any miss = FAIL and a finding. No change after the first number.

### Scope
`.claude/scratch/money-poc2/`, reusing `.claude/scratch/money-poc/poc.mjs`. Never product code. $0.

### Result — money POC 2 (2026-10-21)
Source: `.claude/scratch/money-poc2/RESULTS.md`. $0. R-F241 with all the page's forms read 16 of 16 (POC 1: 0 of 16) — rescued. Every Google Flights page read every result with `$`, `US dollars`, `USD`. Cheat red on all 26 pages. The script's FAIL is again `tests/fixtures/fit/barcelona.txt` (an Airbnb page its name sorter missed; 0 result lines). R1L, if the forms were listed together, keeps `US dollars` and drops `USD` everywhere and `$` on pages where `$` reads one more number than `US dollars` (F241's page among them); `US dollars` alone reads all of F241's results (money POC 1, R-code).

## Addendum 2026-10-21 — money POC 3: the two designs through the real drafting rules, side by side (ordered by hamr 2026-10-21: "test your drafting idea too ... we need to decide/compare between both"; FROZEN before any number is read)

### Arms ($0, real AI maps, real product code, real checker)
- **A — today:** the real `applyPageRules` (src/pagerules.js) on the real AI map and page; the kept money facts are what would be signed.
- **B — can it read:** A, then for each kept money fact the dry read (money POC 1: result lines, honest claims, `gradeStep`). Reads 0 = the fact goes to Not checked.
- **C — all forms + can it read:** before `applyPageRules`, each money fact's unit and currency lists are replaced by ALL forms on the page (money POC 2's list; signs into `currency`, words into `unit`); then the real `applyPageRules` (U1, R1, R1L as they are); then B's dry read. Drops of forms that code added are counted separately (they would be silent in the product).

### Inputs (real AI output only)
- Every `tests/fixtures/idea-a/<name>.map.json` with its `<name>.page.txt` and job lines as the existing golden tests feed them (read tests/page-rules-golden.test.js for how).
- F241: the real page-map reply in ~/.config/bareloop/panel-sessions/smvh7bxou4win/draft-log.jsonl (the `page-map` call's raw) with that session's saved page and job lines (read only).
- sha256 of every input recorded before any number.

### Report per input and arm
The signed price fact (labels, unit, currency) or Not checked; result lines read of total; the cheat claim's colour; for C, which code-added forms were dropped and by which rule.

### Decision rule (frozen)
- C is preferred over B only if: C signs a reading price fact on every input where B signs one; C signs one on at least one input where B goes Not checked (a rescue); no cheat claim is green in any arm; and on every input where A already reads every result, C's signed fact reads every result too.
- Otherwise B (the smaller change) is preferred.
- Either way the result is a FINDING first; no build until hamr picks.

### Scope
`.claude/scratch/money-poc3/`. Never product code. $0.

### Result — money POC 3 (2026-10-21)
Source: `.claude/scratch/money-poc3/RESULTS.md`. $0, real `applyPageRules`, `parseMapAnswer`, `gradeStep`. By the frozen rule C (all forms + can it read) is preferred: on the 8 golden fixtures A, B and C sign the same reading fact (all results read; C's added USD/EUR always dropped by R1L); on F241, A reads 0 of 16, B goes Not checked, C reads 16 of 16. Cheat red everywhere. F241's cause: the AI put "US dollars" in `currency`, and `currency-not-symbol` dropped it. Limit: C's forms came from a fixed list written for the POC; a currency off the list (CHF, ¥) would be wiped, worse than today. hamr's ruling: no list — the AI names every way the page writes a currency.

## Addendum 2026-10-21 — money POC 4: the AI lists every currency form on the page; code keeps those on the page and ADDS them (ordered by hamr 2026-10-21: "go, test it then build"; FROZEN before any number is read)

### Arm D (deepseek-flash, thinking off, real product code, real checker)
- One AI call per page: system `You read ONE saved web page. You never invent words: every form must be copied from the page.`; user: `THE PAGE:\n<page text>\n\nList every way this page writes a currency next to an amount: currency signs (like $) and currency words or codes (like US dollars or EUR). Copy each form exactly as the page writes it. Reply with JSON only: {"forms":["..."]}`.
- Code keeps a form only if it is on the page (the existing found-on-page test). Signs ($, €, £) go to `currency`, every other form to `unit`. They are ADDED to each money fact's own lists (never replace).
- Then the real `applyPageRules` and POC 1's dry read, exactly as money POC 3 arm C (reuse `.claude/scratch/money-poc3/poc3.mjs`, change only the form source).
- 3 tries per input (the AI call is not deterministic); malformed = one retry, then that try counts as a miss.

### Inputs
Money POC 3's 9 inputs (8 golden fixtures + F241), same sha256 check.

### Pass rule
- On every try of every input, D signs a price fact that reads every result line (the F241 rescue included, 3 of 3).
- The cheat claim is red on every try.
- On the 8 fixtures, D's signed fact reads as many results as A.
- Reported: the forms the AI listed per try, forms dropped as not-on-page (made up), forms R1L dropped.
- Any miss = FAIL and a finding. No change after the first number.
- Limit stated now: no saved page uses a currency other than USD or EUR, so "every currency works" is not tested here.

### Cost cap
$0.30 hard. Key and price as fit POC v5 section 6.

### Scope
`.claude/scratch/money-poc4/`. Never product code.

### Result — money POC 4 (2026-10-21)
Source: `.claude/scratch/money-poc4/RESULTS.md`. **FAIL by the frozen rule.** $0.2235. 7 of 8 fixtures read every result on every completed try; cheat red on all 26 completed tries. F241 rescued 2 of 3: on try 3 the AI listed whole price strings ("$130", "137 US dollars") as forms, they reached the signed unit list and it read 0 of 16. Price strings instead of forms in 8 of 26 tries; 2 made-up forms (dropped as not on the page). sfo2 try 3 died on "socket hang up" (no retry in the script). fwd's live MAD→FCO failure (2026-10-21) has the same cause as F241: the AI put the word form in `currency`.

## Addendum 2026-10-21 — money POC 5: the worker copies the whole price as the page writes it; code takes the number out (ordered by hamr 2026-10-21: "test it first ... a simple parsing to check when number starts/ends, take it out by code and calculate, pass it back in full"; FROZEN before any number is read)

### The idea
No currency/unit boxes for the AI. The worker writes the price exactly as the page shows it ("From 137 US dollars", "$134", "€533 total"). Code: (1) the price text must be inside the result's own quote; (2) code takes the number out (the first run of digits, with thousands commas and one decimal point, read whole: "134" never "34"); (3) code compares it with the person's limit; (4) the full text is shown in the results.

### Part 1 — $0, code only, real pages
- Every result line of money POC 1's Google Flights pages, the Airbnb "€N total" lines, and F241's page (same sha256 list).
- Honest claim per line: price text = the shortest piece of the line that starts at the label (or the currency sign, or the number) and ends after the currency word or sign, as the page writes it; quote = the line. Code extracts the number and compares with a limit of 150 (and, for Airbnb, 600).
- Checks per line: the text is in the quote; the number read equals the digits the page writes; pass/fail against the limit is right.
- Cheats per page (each must be RED): (a) a price text that is not in the quote; (b) a number changed inside a copied text ("From 37 US dollars" when the line says 137); (c) a non-price text from the same line that holds a number ("4 hr 52 min", "0 checked bags") — reported: does any rule stop it? (d) a price copied from ANOTHER result line than its quote.
### Part 2 — the worker, live (deepseek-flash, thinking off)
- One call per page for the 4 Google Flights pages bos-den, jfk-mia, ord-bos-now (F241), lax-jfk and both Airbnb pages: the whole page and "List 3 results; for each copy one result's text as quote and its price exactly as the page writes it. JSON {results:[{quote, price}]}". 3 tries each.
- Code applies Part 1's checks. Reported: how often the price text is in its quote, the number read, any made-up price.

### Pass rule
- Part 1: every honest line reads the right number and the right pass/fail; cheats (a), (b), (d) are red on every page. Cheat (c) is REPORTED (it is the open risk: a number that is not a price).
- Part 2: at least 17 of 18 tries give 3 results whose price text is in its quote and reads the right number.
- Any miss = FAIL and a finding. No change after the first number.

### Cost cap
$0.25 hard (Part 2 only). Key and price as fit POC v5.

### Scope
`.claude/scratch/money-poc5/`. Never product code.

### Result — money POC 5 (2026-10-21)
Source: `.claude/scratch/money-poc5/RESULTS.md`. **FAIL.** $0.1122. Part 1 ($0): code read the right number and the right pass/fail on every honest price line of 14 pages; cheats (a) not in quote, (b) changed number, (d) another result's price were red everywhere — but cheat (c), a non-price number from the same line ("4 hr 52 min" → 4, "0 checked bags" → 0), was GREEN 924 of 924: without the label and the currency form nothing tells code which number is the price. Part 2 (live, a thinner prompt than the product brief): 0 of 18 — quotes stopped before the price, prices written as "$137" from elsewhere on the page; no number made up. Learning: the label + currency pieces are what bind the value to its role; they stay. hamr's ruling: option 1.

## Addendum 2026-10-21 — money build spec v2: code sorts the AI's currency forms into the right box, plus "can it read" (ordered by hamr 2026-10-21: "1, go build"; built on fix/bound-in-words; replaces the withdrawn v1 spec above)

Cause, from money POC 3 and fwd's live MAD→FCO run: the AI puts a currency WORD ("US dollars") in `currency`, and `currency-not-symbol` drops it (or R1L drops it behind "$"). The box is position only: a sign before the number, a word after it. The AI should not have to pick.

### What it does (drafting, code only, $0)
1. **Sort, never drop for the box.** In src/pagerules.js money branch, every form the AI listed in `unit` or `currency` is pooled, then sorted by code: a sign (`$`, `€`, `£`, the existing CURRENCY_SYMBOLS) goes to `currency`; anything else goes to `unit`. The `currency-not-symbol` drop goes away (a word is moved, not dropped). The existing `sign-twice`, found-on-page, R1L and limit rules then run unchanged on the sorted lists (units first, as today).
2. **Can it read.** After the page rules, for each kept money fact: result lines = page lines where a kept label is followed by a number (one sign between allowed); for a fact with no label (U1, e.g. Airbnb "€533 total"), lines where a number is followed by a kept unit. For each result line, an honest claim (quote = that line, value = the amount's digits) is graded by the REAL run-time checker (the same `checkStep` path `gradeStep` in src/rubricstep.js uses; one reader, never a copy of its logic). If no result line reads, the fact is dropped with reason `reads-no-result` (plain words, src/pagedropwords.js: `the price rule could not read a price in the page's results, so it is not checked.`) and shows under Not checked. No limits, no counts, no pass bar: only "can it read".
3. Nothing else changes: no currency table, no new rule beside these two, no change to time or number facts.

### Tests (real data)
- F241: the real page-map reply and page of session smvh7bxou4win (copy page into tests/fixtures/money/, pin sha256; ~/.config read only) → the fact keeps `US dollars` as a unit and reads all 16 result lines. Must fail before the change.
- fwd's shape: `$` and `US dollars` both listed as `currency`, label "From", on a real Google Flights page (bos-den) → `US dollars` sorted to unit, the fact reads every result.
- A fact whose forms read no result line → `reads-no-result`, Not checked.
- Airbnb (airbnb-porto): unchanged, reads its results through the no-label path.
- Every existing pagerules / golden test: KEPT facts must stay the same. A drop reason that changes only because `currency-not-symbol` became a move is allowed and listed in the commit body. Any KEPT fact that changes = STOP and report.
- Each new test must fail without the change.

## Addendum 2026-10-21 — search build spec: `search: <site>` for information jobs (rulings by hamr 2026-10-21: "2a, build both on same branch", Q1 "1a", Q2 "2a"; built on fix/bound-in-words)

From search POC v2 (PASS on the information case: Node.js releases fit on nodejs.org/en/blog/release; dated listings are landing pages). Listing jobs (flights, stays on a date) keep the pasted results link.

### The input
- A rubric Inputs line `search: <site>`; `<site>` is an http(s) address or a bare host (`duckduckgo.com` = `https://duckduckgo.com`). It replaces today's refusal in src/source.js (~1200 and ~1269) for rubric jobs only; repo jobs keep the refusal.
- The same front-door refusals as a page address (credentials in the address, a secret shape).

### Drafting flow (code decides; the AI only writes words and picks links)
1. barebrowse (library, as src/pagefetch.js; same connect/snapshot options and timeouts): goto the site, snapshot.
2. CODE picks the box: the first `searchbox`, else `combobox`, else `textbox` in the snapshot. None = stop: `<site> has no search box bareloop can use. Paste a results page link instead.`
3. One AI call (drafting provider, drafter thinking rule = off) gets the job lines and returns `{"words": "..."}`; code types them into the box, presses Enter, waits for network idle, snapshots: the results page.
4. Fit check (src/fitcheck.js `runFitCheck`, as is) on the results page. `fits` = this page is the evidence.
5. Else one AI call gets the results-page snapshot and the job lines and returns up to 5 link refs, best first (`{"links":[...]}`). Code keeps only refs that are links in that snapshot and whose names hold none of the gate words (pay, book, buy, send, submit, sign up, sign in, checkout, card; case-insensitive; same list as the browse gate ruling v1.95). For each kept link in order: back to the results page if needed, click it, wait, snapshot, fit check. First `fits` = that page is the evidence. A page under the existing minimum size or with a bot challenge counts as not fitting.
6. None fits (hamr Q1 "a"): the CLOSEST page = the opened page (results page included) with the most asks found (ties: the first). One question through the existing fit `ask` seam, words owned by code:
   `No page fit every ask. Closest: <address>, found X of Y. Not found: <ask> (line N), ... Type go on to use it, or anything else to stop.`
   "go on" = that page is the evidence; anything else = stop `search-stopped`: `Stopped before drafting: no page from <site> fit the job. Change the job or paste a results page link. Spent so far: $X.`
7. The evidence page is saved exactly like a fetched page (input/<label>.txt, sha256). source.json records for that input: `search: {site, words, url, host}` where `url` is the evidence page's address and `host` its host.
8. The later fit check before the look is NOT run again for an input whose page came from the search (its fit was just checked or answered); a second call would be paid twice for the same page.
9. Every AI call is booked through `onCall` (labels `search-words`, `search-links`, `fit-check`) and cap-checked before it (`capStop`).

### Run start (hamr Q2 "a")
- `refreezeUrlInputs` (src/source.js) for a search input: run the same search (steps 1-5, no question). A fitting page whose host equals the recorded `host` = the run's page. Otherwise (no fit, or a fit on another host) fetch the recorded `url` again, as a pasted address is today. If that fails, the existing unreadable-input stop applies. The run's spend books these calls.

### Language
barebrowse has no locale option (POC v2 checked its source). No per-site language parameters in code (no hardcoding of sites). A page that comes back in another language is read as it is; logged when seen live, never patched per site.

### Tests (real data where it exists)
- Real snapshots from .claude/scratch/search-poc2/ copied into tests/fixtures/search/ with sha256: the DuckDuckGo site page (box pick: the combobox, not the `search` landmark), a results page (link filter: a "Book Flights" link refused), the nodejs.org release page (fit).
- The flow with an injected barebrowse handle (as tests/url-inputs.test.js injects one): fits on the results page; fits on link 2; none fits → the closest question; "go on" → evidence saved with its url/host; other words → `search-stopped` with spend; no box → stop words.
- Run start with an injected handle: same host fit → that page; other host → refetch of the recorded url.
- The repo-job refusal of `search:` is unchanged.
- Each test must fail without the change.

## Addendum 2026-10-21 — S1 read note and phrase dry read (ordered by hamr 2026-10-21)

Two rules, both from the live fwdloop run m10-walk-flights-3 (deepseek-flash). Neither changes the arbiter, a budget or a verdict.

1. S1 copy is a read note (hamr ruled 2a). When the AI proposes a second fact that would read the same value as a fact already kept (S1), and the OTHER fact is still signed, the guardrail IS checked by that other fact, so the note belongs under "How the page was read", not "Not checked". If the other fact is not signed, the note stays under Not checked. A row is a read note only if every sentence in it qualifies. The signed fact names are passed to the split; they are read from the signed spec (older specs too) or from the look at the confirm turn.
2. Phrase facts get the dry read (hamr ruled 3a). A kept phrase fact (for example "destination city" = "Rome") is read against the page's RESULT LINES, which are the lines the same job's kept money facts read. Each line is graded as an honest claim by the real run-time checker. A phrase that reads no result line is dropped as a whole fact with the plain words `"Rome" is on the page but in none of its results, so it is not checked.` and stays under Not checked (not a read note). A job with no kept money fact has no known result lines, so its phrase facts pass through untouched.

## Addendum 2026-10-22 (rev) — cross-run learnings: friction-shaped pipeline (DRAFT, POC pending; replaces the L1–L5 spec of the same day)

The L1–L5 spec of the same day is replaced. That build went straight from spec to code without a POC. Six $0 POCs (v1–v6) on the real archive then failed or were underpowered: the facts held check names and words but no ask, no trigger and no grouping. The build was withdrawn per hamr (2026-10-22).

### How friction does it (all code until the last judgment)

1. extractSignals: code scans each session and tags timestamped signals.
2. Anchor only on OBSERVED reactions (user_correction, curse, interrupt cascade). Machine signals
   (errors, abandon, /stash) never seed; they only colour severity. No anchor = no candidate.
3. analyzeBadSession, per anchor: a context window of 5 turns BEFORE the reaction gives:
   - files touched, tool sequence (call:ok / call:error), errors (5)
   - user messages (3, ≤500 chars, terminal pastes dropped), keywords
   - `preceding` = the trigger: last 2 actions, their result, last error
   - `self_suspect` (the user correcting themselves)
4. Dedup: one conversation counts once (forks/resumes merged by shared message uuid).
5. clusterCandidates: CODE groups candidates across sessions by content (word + phrase shingles,
   overlap ≥ 0.5; files as the discriminating channel; path/filler words stopped). Per cluster it
   computes recurrence (distinct sessions), severity, a 2×2 artifact (antigen/fact/episode/drop),
   theme, contexts (quotes), preceding, top keywords. One-off + mild clusters are dropped.
6. ONLY THEN the LLM: one call per batch of CLUSTERS, given contexts + preceding + errors + self_suspect
   + the existing ledger rows (id, hints, rule, quotes). Output per cluster: drop | existing id | new + one-line rule.
7. countLedger (code): identity, counting, promotion, decay, failed wordings, render.

So the LLM never sees a raw log line. It sees a pre-grouped, recurring, evidence-rich item with its
trigger and context, and judges once.

### The same pipeline for bareloop runs

What a run log (spine) actually holds today, checked on u-msn0uccv:
- job-start.goal (the job text)
- plan-accepted.plan.steps[].action (what the step was told to do)
- check-run / exit-eval / close-verdict per iteration (the arbiter's words and numbers)
- ladder (strikes), escalation (cause category), replan (reason)
- worker-round = cost only. There is NO worker reasoning text.
- The gate audit holds the files written and the calls denied.

Stage 1 — signals (code, per run, $0):
- ANCHOR: a close stage whose LAST verdict in the leg is red, with words.
- Corroboration only, never an anchor: strikes, cap-halt, wall-halt, replans, denied calls.
- NOISE (dropped, but counted in a health line): provider-red, PR-review stop (hitl-close),
  close-crashed, and runs where no close spoke.

Stage 2 — candidate per anchor (code): the triad plus context.
- CONTEXT (what was asked): job goal (cut to 400 chars), the failing step's id and action (300),
  the job's signed rules if a spec exists.
- TRIGGER (what the worker did, the `preceding` analogue): files written in that step (repo-relative),
  denied calls, iteration count, strikes.
- REACTION (what the arbiter said): stage name, latest gap words (≤250 per stage, line-cut, file:line and
  error-code lines first), keys {stage, files, codes}.
- TRAJECTORY: that stage's number across iterations (e.g. 67 → 6 → 6 = stuck), from check-run.
- RESOLUTION: later in the same run (did this stage ever pass? replan reason), and the next run of the
  same workflow (green? which stage failed next?). The red→green difference is where the PRD says the lesson lives.

Stage 3 — dedup: one run = one source (all legs of a runid).

Stage 4 — cluster (code), within one workflow and across workflows on one place:
- key = stage name + error codes + files (stable parts only; never counts).
- Recurrence = distinct runs.
- Keep a cluster when it has ≥ 2 runs, OR 1 run with a resolution (a later green that changed something).
- Drop other one-offs, counted in the health line.

Stage 5 — LLM, one call per fold, CLUSTERS only:
- Input per cluster: context, trigger, reaction quotes (≤3 runs), trajectory, resolution,
  plus the job goal and the existing ledger rows for this workflow/place/user.
- Output: drop | existing row id | new + one-line fact.
- Told: a fact about the job/place/check, never model advice; drop it if the job text already says it.

Stage 6 — count (code): exactly L2 as built.

### What this means for the built branch
L2 (count) and L4 (inject) match stages 6/7. L1 (facts) is stage 1 + half of stage 2: it has no context,
trajectory, or resolution. Stages 2–4 (candidate building and code clustering) do not exist; L3 hands the
LLM raw facts files. So L1 and L3 are the wrong shape. Nothing changes on the branch until the POC below passes.

### POC (free first, then cents)
POC-A ($0): build stages 1–4 as a throwaway script over the snapshot (July excluded per hamr). Output ONE
readable file: each cluster with its context, trigger, quotes, trajectory, resolution, as the LLM would see it.
hamr reads it and judges: is there enough context to learn from?
POC-B (paid, cents, DeepSeek deepseek-flash, hamr's word first): run the stage-5 prompt on those clusters and
put each LLM fact beside its cluster. Score with frozen rules: readable, true, specific, not already in the job text.

Status: nothing is built from this until POC-A (hamr reads the clusters) and POC-B (paid, his word) pass.


## Addendum 2026-10-22 — per-try diff in the spine (attempt-diff)

Signed by hamr. Learnings cards can say which files a passing try touched but never WHAT changed; POC-B2 showed a model then invents the fix. Neither the spine nor the gate audit keeps edit text (gate audit edit rows carry only `{path, args:{bytes}}`).

- **What.** After every worker try the shell emits one spine event `attempt-diff`: `{phase, step, iteration, files:[{path, diff, truncated, cutLines}], binary:[path], truncated, gitError?}`. `path` is repo-relative; `diff` is unified, `-U1`. A try that changed nothing in scope emits NOTHING. If git itself fails the event IS emitted with `files:[]` and `gitError` (scrubbed message) — a record, never silent, never a verdict, never a run failure.
- **How.** One owner: `src/attemptdiff.js` (`startAttemptDiff`). At try start it snapshots the working tree to a git TREE through a temporary `GIT_INDEX_FILE` (`git add -A` + `git write-tree`); at try end it does the same and diffs tree against tree (`git diff <t0> <t1>`). The work branch, HEAD, the real index and the stash list are never touched; the temp index is deleted. The only trace is loose objects in the object store (unreferenced, gc-able). Gitignored paths (node_modules, hidden installs) never appear.
- **Call sites (both).** `src/planrun.js`: the step loop's `middle()` (around its `w.ask`, phase `step:<id>`, scope = the step's fence: `step.scope` else the signed writeScope) and the close-fix loop's `middle()` (phase `fix`, scope = the signed writeScope). Both are worker tries that edit files. Scout/plan/replan workers are read-only and are not covered. The capture runs in a `finally`, so a try cut by a bound or a throw still records what it wrote.
- **Scope.** Only paths inside that fence (same prefixes the gate enforces). Nothing else, ever. Binary files are listed by path in `binary`, with no text.
- **Caps.** 4 KB per file, 16 KB per event; cut at a line boundary (never mid-line), `truncated:true` and `cutLines` = lines dropped. Files past the event cap appear with an empty diff, `truncated:true`.
- **Secrets.** Every diff and path runs through `redactSecrets` (the one inventory) BEFORE the cut and before the spine.
- **Never shown to the worker:** spine only, which the worker's readScope denies; no prompt carries it. Not shown in the panel. The gate audit is not touched. $0, no model call.
