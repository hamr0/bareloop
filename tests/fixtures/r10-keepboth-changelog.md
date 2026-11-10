# Changelog

## [0.54.1] - 2026-11-04

### Fixed

- **The review door's held line no longer says a rubric green earns no learning credit.** A rubric run's lessons count at run end (PRD v1.112); only reuse/bridge credit waits for Accept, so `src/u-readout.js` now says "NO reuse credit until
- **The step a money or time cap escalated reads capped, not failed.** A run that ended capped left its last step's card at `failed` because that step's own `step-end` says `escalated` and carries no stop reason (real spines msi0w2i5 and ms
- **`climb` and `foldCards` no longer compare card pairs already in one family.** Same families, levels and groups (checked identical against the old code on 4,000 random ledgers for `climb`, and on 4,300 random and real-shaped card sets fo

## [0.54.0] - 2026-11-03

### Added

- **A worker that ends a try in text without writing is nudged once (F282).** When a writeable step's (or the fix loop's) ask finishes with text and the gate audit holds no allowed write or edit for it, the same conversation is continued on
- **An always-on guard can cover a job line (F281).** A drafted close may list `guardLines: [{guard, lines}]` beside its stages, so a job line the mandatory guards fully do (for example "fix the cause in src/, no suppression comments") need
- **The Audit shows the memo and the learnings where they were passed (F274).** The `carry-note` spine record now carries the memo text itself (secret-masked, up to 12,000 characters per ask), and the Audit tab shows it as a closed fold "Me
- **bare-agent `^0.59.0` bad-call handling (BA-29; F265, F266, F267).** The worker Loop turns on `checkArgs` (an object where a string was declared is refused before the tool runs, with the corrected hint). A new spine record `worker-bad-ca
- **`pairEditGrant` (F271, B2 safety net).** A plan step granting `write` without `edit` is paired with `edit` by code at the draft, replan and resume sites, only when the signed ceiling offers `edit` and never for a rubric step-file step. 

- **BA-30 `shrinkGuard` on every worker (F272, F276).** A whole-file `write` that would cut a file tracked at the seed to under half its size (and at least 2 KB) is refused with the file unchanged, and the worker is told to use `edit`, `app

### Changed

- **`seedListing` reads `git ls-tree -z`** so file names with non-ASCII bytes list as themselves, not C-quoted (F276).
- **Planner and persona wording (F271, B).** `EXIT_EXAMPLE` now teaches the read-only look-around step shape (tools read, grep with an `artifact-written` exit on an existing file); the two persona lines say "the file-changing tool you were 
- **Gate audit write/edit rows record `valueType` and UTF-8 `bytes`** (F267): an object content no longer reads as 15 bytes and non-ASCII text is no longer under-counted.
- **Plain panel words for a stuck refused-argument loop**: the Ended block names what the model did instead of "(code: interpreter-red)"; the terminal outcome is unchanged (the escalation record gains `badCall`).
- **Panel caption looks, carried from fwdloop (hamr's request).** Chat job card field captions are accent pills (no left bar); the `[n]` numbers are gone from both tab rows; field captions elsewhere (global label, Settings money labels) are
- **Run summary row labels are blue bold (hamr, 2026-11-03).** The `model:`, `steps:`, `why:`, `close:`, `tools:`, `calls:`, `checks:` and `cache:` labels in the Run tab SUMMARY box wear the accent colour and bold, like ENDED / NEXT / SCHED
- **Chat New job card pills say what is required (hamr, 2026-11-03; fwdloop 0ae68fb pattern).** A small grey `required` sits inside the caption pill of Job name, The job, Inputs, Destination and Cap $ — the five fields `validateJobCard` ref
- **Audit tab caption words are blue (hamr, 2026-11-03; fwdloop e637bb8).** In the Audit / logs tab the table header cells (check grid, Flat table, drafting, door and rounds tables), the `errors` and `rounds per try` captions, the `try N` l
- **Runs tab search block is a light card (hamr, 2026-11-03; fwdloop V1).** The dashed line above search is gone; the "search also finds Scheduled" note (accent bold, SEARCH caption) and the search box sit together on one tinted card with r
- **Audit grid shows what a worker was told as a `told in this run` row, like fwdloop (hamr, 2026-11-03; fwdloop 1574dcb).** In a step's or the fix loop's check grid, a row under the header has one `[ N lines ]` button per try that was hand
