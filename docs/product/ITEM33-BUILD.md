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
