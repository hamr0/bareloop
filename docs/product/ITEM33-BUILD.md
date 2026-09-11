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

## M2 — the source front door ($0) — NEXT

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
2. `src/job.js`: optional signed job field `destination: {path, output}` — `path` absolute,
   `output` relative and under `output/`; nested unknown keys red; covered by `jobSpecHash`
   (the signer sees where the result goes). Carried from the draft by `assembleSpec`.
3. `scripts/run-u.mjs`: (a) before any token, if the spec has `destination`, `proveDestination`
   — a refusal is a named $0 stop; (b) on a minted `green` / `soft-green` verdict, `copyOut`,
   and a spine record `destination-written {path, bytes, sha256}` or `destination-refused
   {code, detail}`. A refused copy-out never changes the verdict (the verdict is the close's).
4. NOT wired this milestone, named: `bareloop run` (bundle, `src/cli.js`) still requires
   `--repo`; export of a front-door job is parked to after M5.

**Proof:** behavioural tests on real git in temp dirs (neutralized identity, hermetic), a real
local `node:http` server for the URL paths (200 text, 404, binary content-type, oversize,
silent server → timeout refusal); every refusal code reached by a test; fail-first shown per
changed test file. Suite, typecheck, build:types exit 0.

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
