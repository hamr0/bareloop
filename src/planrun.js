// Layer 2 executor — the plan-v1 run, end to end (PRD v1.12; design record
// 2026-07-21). SCOUT (read-only, hard-bounded) → PLAN (the decompose call,
// gated by validatePlan before tokens burn) → EXECUTE (per-step micro-loops:
// the same ralph(), judge = the exit evaluator — the F46 mechanism) → ONE
// replan → the operator's close, the only truth. The checks referenced by
// `check-passes` run under the FULL runClose machinery (forbidden zone,
// judged floor, redaction, gapKeep); they decide nothing and mint nothing —
// a check result is a progress gate and a gap source, nothing more.
//
// Prompt contract (v1.12 §5), held here: a step worker sees its action, the
// absolute repo root, its target, prior steps' artifacts labeled by id, its
// gap, and a cut-off notice. It NEVER sees the budget, the close command, a
// check's command, the validator, other steps' grants, or the arbiter's books
// (fs.deny on the gate audit / .smoke / .litectx, unchanged).

import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, relative } from 'node:path';
import { Gate } from 'bareguard';
import { LiteCtx } from 'litectx';
import { runClose, runStages, ralph, CLOSE_FAULTS, boundGap } from './ralph.js';
import { validatePlan, legalScopes, closeStagesOf } from './plan.js';
import { WRITE_VERBS, EXIT_TYPES, MAX_EXITS_PER_STEP, MAX_PLAN_STEPS, MAX_SCOPE_MENU, RETRIEVAL_PAIR } from './plan.js';
import { snapshotScope, evalExits, CHECK_GAP_MAX } from './exits.js';
import { createRoot } from './root.js';
import { createStallWatch, STALL_MS, MAX_STALLS } from './stall.js';
import { createLadder, STRIKE_LIMIT } from './ladder.js';
import { createTrend, FIX_STRIKE_LIMIT } from './trend.js';
import { TOOL_MENU, STORE_VERBS, checkMenu } from './job.js';
import { TOOL_BY_VERB, CTX_TOOLS, createCtxTools, toolAction, PERSONA_TOOLS, strategyFor } from './tools.js';
import { createReadShim, readShimArm, readShimStrategy } from './readshim.js';
import { globToPrefix, redactSecrets, SECRET_PATTERNS } from './validate.js';
import { validateBridge, loadGate, newestEligibleVersion, reuseEligibility, quarantinesCredit, QUARANTINED_CODE } from './bridges.js';
import { extractArtifact } from './text.js';
import { defaultJudgeLoop } from './judged.js';
import { createClock, isWallTimeout } from './clock.js';
import { isDeclaredClose, runDeclaredStages, validateCloseDecl, closeGrade, HUMAN_PAUSE, HITL_PAUSE, HITL_DECISION_RED } from './declaredclose.js';
import {
  seedAtHead, seedListing, changedSet, GAP_TRIM_MARKER, GATE_AUDIT_FILE, ARBITER_BOOK_STORES,
  HUMAN_KIND, HUMAN_DECISIONS, normalizeHumanRuling, resolveHumanRuling,
  REVIEW_DOOR, doorOpens, mechanicalStages,
} from './kinds.js';
import { workBranchName, prepareWorkBranch } from './workbranch.js';

const require = createRequire(import.meta.url);
const { Loop, wireGate, HaltError } = require('bare-agent');
const { createShellTools } = require('bare-agent/tools');

/** the scout's hard round bound — read-only survey, never a worker (v1.12 §1) */
const SCOUT_ROUNDS = 8;
/** blob bound: the scout's output is a PROMPT ingredient for every later call */
const SCOUT_BLOB_MAX = 8000;
/**
 * NATIVE-ONLY read cap (F48/BA-16). On the clipipe-subscription surface the claude CLI
 * TRUNCATES a large tool result before the model ever sees it (~40-50KB / ~line 550,
 * measured), spilling the remainder to a `~/.claude/.../tool-results/` file the fence denies
 * AND wrapping it in a "read this in chunks" notice the model correctly distrusts as prompt
 * injection — so a whole-file `shell_read` of a large file blinds the worker (0-write stall,
 * F48). We bound OUR read result below the CLI cap and hand back a TRUSTED notice steering to
 * `ctx_get` (ranged retrieval survives the cap: one function per fetch). API path is untouched
 * — there the full result rides straight into context, so no cap and RETRIEVAL_STRATEGY alone.
 */
const NATIVE_READ_CAP = 24 * 1024;
/** native-only strategy: tell the worker WHY whole-file reads fail here and to navigate by symbol */
const NATIVE_READ_STRATEGY = '\nINTERFACE LIMIT: on this surface a whole-file read of a large file is TRUNCATED before you see it — a shell_read of a file over ~24KB returns only its start followed by a truncation notice. This is NOT the whole file. To read a function IN FULL, always use ctx_recall(<symbol>) then ctx_get(<pointer>) — that returns the entire function no matter how large the file is. To locate a line, use shell_grep(<pattern>). Never try to understand a file over ~400 lines by reading it whole; recall its symbols instead.';
/** F59 — below this a scout survey is treated as absent. Sized off the archive, not
 * taste: the 15 truncated scouts produced 0/74/86 bytes; every real survey was
 * 5991-8056. 200 sits between the two populations with an order of magnitude of
 * daylight on each side, so it cannot be a tuned-to-one-case threshold. */
const SCOUT_MIN_BYTES = 200;
/** feed-forward artifact bound per step (prompt ingredient, spine-bound) */
const ARTIFACT_MAX = 2000;
/** how many changed paths ride the hitl pause's evidence package. Bounded like
 * every other list this repo puts on a spine, and the trim ANNOUNCED (F28): the
 * person needs to see WHAT moved, and a run that touched a thousand files is
 * telling them something a thousand lines would not. */
const PAUSE_CHANGED_CAP = 50;
/** the wallet floor below which a replan is a stop, not an adaptation (review
 * #5): a money-gate halt drains the wallet to ~0, so replanning against dust
 * just burns another draft and mislabels the money-cut as "exits still red"
 * (F45 class) — the honest terminal there is cap-halt. */
const MONEY_MIN = 0.001;
/**
 * A (PRD v1.27; design record §3.4, answered §6.2) — the replan trigger. A step
 * that has consumed this share of the run's REMAINING money or time with its exits
 * still red gets no further attempt; the planner re-allocates what is left instead.
 *
 * 50% is hamr's number (*"50% is fine"*), and it was **re-confirmed with its own
 * inertness on the table**: F63 replayed 18 archived spines / 54 steps / 101 judged
 * attempts and found it would have fired 0 times (near misses 0.35 · 0.35 · 0.40 ·
 * 0.45). Shown that, hamr's call was *"keep 0.5"* (2026-07-26).
 *
 * So this is a GUARD against a step that eats the run, deliberately set above the
 * observed population rather than tuned to it — lowering it to 0.35 because that is
 * where those four points sit would be fitting the number to the data (the standing
 * no-fit-to-pass rule), and threshold-setting is arbiter territory either way. It
 * has not hardened by surviving unexamined; it survived being examined.
 *
 * This changes the replan TRIGGER only. The hard ceiling of ONE replan is
 * unchanged — unlimited replanning launders thrash as adaptation (v1.12).
 */
const VARIANCE_THRESHOLD = 0.5;

/** @typedef {Error & {category?: string, lib?: string}} CategorizedError */

/**
 * The materials block: what the run has to spend, as a BALANCE and nothing else.
 *
 * hamr's correction (design record addendum 2, verbatim): *"why would you tell it
 * every round that you have x time per round? what if there is a heavier round?
 * why don't you tell it same like cost, you have x left from cost/time instead of
 * making it race against time?"*
 *
 * So: NO rate, NO per-round allowance, NO derived round count. F57 measured a 150x
 * spread on the verification gaps (3.8s to 561s), so a per-round constant
 * describes almost no real round — a heavy round would break the planner's
 * arithmetic with nothing to tell it. A balance is self-correcting: after a heavy
 * round the number is simply lower. A rate is also a stopwatch, and racing a clock
 * is the rush-or-fake incentive the v1.12 §5 prompt contract exists to remove.
 *
 * At DRAFT the balance is the total, so this is scale only — the planner is NOT
 * asked to allocate time, because sizing time at draft requires the rate that was
 * just removed. A plan that does not fit is what the meter is for (addendum 2).
 * @param {{ balanceUsd?: number|null, remainingMs?: number|null, progress?: string }} [m]
 */
function materialsBlock(m) {
  if (!m) return '';
  const lines = [];
  if (typeof m.balanceUsd === 'number') lines.push(`- money left for the whole run: $${m.balanceUsd.toFixed(2)}`);
  if (typeof m.remainingMs === 'number') lines.push(`- time left for the whole run: ${Math.round(m.remainingMs / 60_000)} minutes`);
  if (!lines.length) return '';
  // The progress line only exists at REPLAN: it is the variance the meter read,
  // and it is the adaptation channel (addendum 2). At draft there is no progress.
  if (m.progress) lines.push(`- where the run got to: ${m.progress}`);
  return `\nWhat this run has left to spend — plan within it:\n${lines.join('\n')}\nThese are totals for the run, not per-step allowances. Nothing here is a rate: a step's cost depends on what it does.\n`;
}

/**
 * MODULE 8 — the signer's words, when this leg is a RERUN taken at a previous run's
 * review door (PRD v1.71 §3.4: *"redo/rerun comes with new authoring"*).
 *
 * It is stated as a REQUIREMENT beside the goal, not as a replacement for it: the
 * signed goal and the signed close are unchanged, and what the person added is the
 * half a machine could not see. The block also says what the previous run's verdict
 * WAS, because the planner would otherwise draft against a tree that already passes
 * the close with no idea why it is being asked to do more.
 *
 * Empty/absent renders '' — every existing prompt is byte-identical.
 * @param {string|null|undefined} note
 */
function doorNoteBlock(note) {
  if (typeof note !== 'string' || !note.trim()) return '';
  return `\nA previous run of this job satisfied the close, and the person who owns it REVIEWED the\nresult and asked for another pass. Their words, which are a requirement this plan must\nmeet on top of the goal above (the goal and the close are unchanged):\n${note.trim()}\nThe close will judge the result exactly as it judged the last one — passing it again is\nnecessary and is not sufficient.\n`;
}

/**
 * Layer 3 (D4) — the MECHANICAL START. A loaded bridge is handed to the drafter as a
 * STARTING DRAFT, not as a contract: it is appended to the ordinary drafting prompt and
 * the result passes the ORDINARY validator. No second, looser path exists for an
 * inherited plan.
 *
 * The framing is the pre-probe's arm C (`scripts/reuse-preprobe.mjs` ARM_FRAME.C),
 * carried through the execution probe (`scripts/reuse-exec-probe.mjs` C_BLOCK) that
 * greened this job shape end to end. It is reproduced VERBATIM because that exact text
 * is what the draft-tier read and the execution kill-gate were measured against —
 * reworded, this would be a different arm than the one that passed.
 *
 * ONE token is not verbatim, and deliberately: the probe's job had FOUR close stages and
 * said so. A prompt that tells a two-stage job it shares "the same four close stages" is
 * a falsehood handed to the planner, so the count is read off the job's own staged close
 * (which the load gate has already proven equal to the bridge's). The small numbers are
 * spelled, so on the four-stage shape the probe validated this renders byte-identical to
 * the text it validated.
 * @param {number} n how many stages both closes have
 * @param {object} plan the bridge version's plan, as executed
 */
function startingDraftBlock(n, plan) {
  const count = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
  return `

YOUR STARTING DRAFT — begin from the plan below and tweak it.
This plan greened a same-shape job (the same ${count} close stages) on a DIFFERENT repository. Take it
as your starting draft rather than starting from a blank page: keep what carries over, change what
this repository needs. Everything you submit must be legal for THIS job as described above — its
paths, scopes, verbs, bounds and check names. Output the finished plan as the single JSON object
required above, and nothing else.

${JSON.stringify(plan, null, 2)}`;
}

/** The red-set for the replan brief's copy of a step's exit gap: every non-blank
 * line. It is `\S` and not the close stage's own `gapKeep` for the reason Layer R
 * already pays at the step seam (see `createRoot` below) — a shipped `gapKeep` is
 * `^`-anchored (`^BAREAGENT `, `^red`, `^FAILED`) and the exit evaluator wraps the
 * stage's output in `check "x" red: …`, so the anchor no longer sits where the
 * pattern expects it. A gap that reaches here is ALREADY a red-set: `judge` builds
 * it out of the failing exits only, so every line in it is a red line and keeping
 * all of them is the correct instrument, not a widened one. */
const REPLAN_GAP_KEEP = '\\S';

/**
 * This step's own last EXIT results, rendered for the REPLAN brief.
 *
 * The label says exits and not "the close", and the distinction is the whole of one
 * fix: `res.gap` is `lastGap`, the join of EVERY failing exit's detail in exit order.
 * With `MAX_EXITS_PER_STEP` at 2 and the mandatory `tree-changed` pairing on a write
 * step, a step that wrote nothing leads the block with the EVALUATOR's own prose
 * (`0 files changed under src/** …`) — captured verbatim from a real replan prompt,
 * under a label reading "the verification's own output". The close stage's output is
 * one of the details here, never reliably all of them. The payload is left alone: "the
 * step wrote nothing" is exactly what a replanner should be told, and stripping it to
 * make an old label true would trade a real fact for a tidy sentence.
 *
 * u-mshcpdg4: a run one strict error from done, killed with $1.10 and 82 seconds
 * unspent. The close named the remaining work exactly — `src/recurse.js(978,115)`
 * — and the worker read that every attempt. The REPLANNER, which is the component
 * that chooses which files the next plan targets, was handed only the trend line
 * (`still progressing — typecheck 30 → 15 → 15 → 1`): converging, and silent about
 * WHERE. It re-targeted `src/loop.js`, already at zero errors; that step wrote
 * nothing and struck out. F85 gave the brief the trajectory; this gives it the
 * artifact the trajectory is a summary OF.
 *
 * Handed over as TEXT, never as a parsed file list, and the trap is worth naming
 * because the parse is the obvious-looking fix: line 1 of that very gap reads
 * `reports 1 error(s) in src/recurse.js, src/loop.js` — every file in SCOPE — and
 * only line 2 names the culprit. The `never wrote` advisory that used to sit here
 * did exactly that parse, and on this gap it resolved to `src/loop.js` — the file
 * already CLEAN — then said so as a directive beside the artifact that said the
 * opposite. It was deleted with this change (hamr, 2026-08-05): two readers of one
 * question, the parsed one wrong, is the same failure the variance meter just had.
 * Nothing generic can tell a summary line from a detail line, and the
 * shapes differ per close anyway (tsc file:line, pytest test ids, a count close
 * that names no file at all). A model reading the artifact can make that
 * distinction; a regex reproduces the bug. So: no extraction, no digest, no
 * inference — the artifact, bounded and scrubbed.
 *
 * Two boundaries, both reused rather than respelled:
 *   - SCRUB. A prompt is an egress point and this repo has ONE secret inventory
 *     (`SECRET_PATTERNS` via `redactSecrets`). The gap arrives already scrubbed
 *     from `judge`, which makes this defense in depth rather than the only guard —
 *     and defense in depth at the egress is exactly where it belongs, because the
 *     next caller of this helper will not remember the upstream one.
 *   - BOUND, and it is a BACKSTOP rather than an envelope. What arrives here has
 *     ALREADY been bounded: `runClose` ran `boundGap` with the stage's own `gapKeep`,
 *     which deliberately rescues the `not ok`/`FAILED` names out of the elided middle
 *     — the mechanical gap F46's conversion mechanism feeds the worker. Re-bounding
 *     that with a fresh 400/1500 envelope deletes exactly those names a second time,
 *     which is F28 reintroduced; measured on a 120-red-line close output, the first
 *     bound rescued 78 names and this one dropped 12 of them. src/exits.js states the
 *     same rule for the same artifact one seam earlier, and this now uses ITS number:
 *     `CHECK_GAP_MAX`, imported rather than respelled, so the two seams cannot drift
 *     on how big a check gap may be. Under it the gap passes through VERBATIM.
 *
 *     A backstop is still needed, and the headroom is why the ceiling is not smaller.
 *     `res.gap` is `lastGap`, the JOIN of up to `MAX_EXITS_PER_STEP` failing exit
 *     details, and the check-passes branch slices EACH at `CHECK_GAP_MAX` — so what
 *     arrives is bounded per detail, never in total. Measured, the real maximum is
 *     comfortably under: `runClose`'s own envelope tops out at ~10.1KB (400 head +
 *     8192 keep + 1500 tail + labels), and joined with a `tree-changed` line that is
 *     ~10.2KB, so the shipped path passes through untouched with ~1.8KB to spare. The
 *     backstop therefore fires only where src/exits.js says it should: a seam that
 *     returned something never bounded at all.
 *
 *     Over the line `boundGap` runs with `REPLAN_GAP_KEEP`, the same envelope the
 *     close path uses, and every trim announces itself (F28). Note what that keep-set
 *     cannot do: `\S` matches every non-blank line, so the keep block degenerates into
 *     "the first 50 lines" and re-surfaces nothing from the middle. That is the honest
 *     limit of a red-set that cannot know the stage's own pattern (see
 *     `REPLAN_GAP_KEEP`), and it is affordable precisely because it now applies only
 *     to a gap nothing upstream ever bounded — on that gap ANY envelope loses names,
 *     and the choice is a bounded prompt over an unbounded one.
 *
 * No gap → the empty string, so the brief renders byte-identically to the pre-F86
 * one. A labelled empty section would be an invitation to explain an absence the
 * run never observed (a stall never judged its exits at all).
 *
 * @param {string | null | undefined} gap the step's last exit gap text
 * @returns {string} the labelled block, or '' when there is nothing to show
 */
export function closeGapBlock(gap) {
  if (typeof gap !== 'string' || gap.trim() === '') return '';
  const scrubbed = redactSecrets(gap);
  // BACKSTOP, not an envelope: over the line only. Scrubbing can only grow a string
  // (a mask is wider than most literals it replaces), so the length is measured
  // AFTER it — bounding on the raw length would let a gap cross the ceiling on its
  // way through the one transformation that runs unconditionally.
  return '\nWhat this step\'s exits reported on its last attempt (their own output, verbatim):\n'
    + (scrubbed.length > CHECK_GAP_MAX ? boundGap(scrubbed, REPLAN_GAP_KEEP) : scrubbed);
}

/**
 * The recorded bound-reason's ceiling in the WORKER-facing note. The reason is a
 * provider string (`denied:<tool>` today, ~20 bytes), not a gap, so this is a
 * backstop against a future terminal that arrives long — never an envelope the
 * shipped path routinely rides through.
 */
export const BOUND_REASON_MAX = 200;

/**
 * BA-21 — the WRITE side of the pricing-provenance signal (read side: `rateProvenance` /
 * `spendProvenance` in src/ledger.js). bare-agent >=0.37 rides `rateSource` beside
 * `pricing` on every metering payload; both metering callbacks below forward it onto the
 * spine through THIS one helper, because two sites spelling one rule are two instruments
 * (the ripgrep fix that landed in ci.yml but not publish.yml).
 *
 * Forwarded VERBATIM — the write side reports what upstream said, and src/ledger.js is
 * the one place that decides what counts as a guess. And an ABSENT provenance stays
 * absent: a payload carrying no `rateSource` (bare-agent <0.37, and every round already
 * in the archive) emits no field at all, so a reader sees UNKNOWN rather than a label we
 * invented. Never defaulted to `null` here — `null` is upstream saying "nothing was
 * priced", which is a different fact from "nobody told us".
 * @param {any} arg an `onLlmResult` / `onTurn` payload
 * @returns {{rateSource?: string|null}} the field to spread into the spine record
 */
export function rateSourceFields(arg) {
  return arg && typeof arg === 'object' && 'rateSource' in arg ? { rateSource: arg.rateSource } : {};
}

/**
 * What the NEXT attempt is told about the bound that cut the previous one.
 *
 * Two different bounds used to set the same bare `attemptBounded = roundIteration`
 * and therefore render the same sentence. For a round-bound cutoff that sentence is
 * true. For BA-11's deny streak it is false twice over — the rounds did NOT run out
 * (the fence short-circuited the attempt with budget left), and the count it quotes
 * is the cap, not what was spent — and it aims the worker at the READ BUDGET when the
 * thing that stopped it was the FENCE. The reason was already recorded on the spine;
 * nothing carried it to the one reader who could act on it.
 *
 * The denial note is MECHANICAL in the strict sense: it quotes the terminal the
 * provider actually returned and names which bound fired. It invents nothing —
 * no streak count and no denied path, because bare-agent's return (`error:
 * 'denied:<tool>'`, loop.js) carries neither, and a number nobody measured is a
 * bug with a confident voice. Every other cause keeps the frozen wording byte for
 * byte: a wall-bounded attempt reads as a round bound exactly as it did before
 * (and is unreachable anyway — the step head refuses to fund an attempt past the
 * deadline, W-2), so this change can only ever speak where it has something true
 * to add.
 *
 * The reason arrives ALREADY SCRUBBED (the capture seam in `mkWorker` runs it
 * through the one `SECRET_PATTERNS` inventory), so this renderer only bounds it —
 * and announces the trim with the repo's ONE marker rather than a second spelling
 * of "this text was cut" (F90.2).
 *
 * @param {{iteration?: number|string|undefined, cause: string, reason: string|null}|null|undefined} bounded
 *   the previous attempt's bound state, or nullish when it was not bounded
 * @param {number} rounds the step's round bound, as quoted by the frozen sentence
 * @returns {string|null} the note, or null when there is nothing to say
 */
export function boundedNote(bounded, rounds) {
  if (!bounded) return null;
  if (bounded.cause !== 'denied') {
    return `Your previous attempt was CUT OFF after ${rounds} tool rounds. `
      + 'Reading is bounded; writing is not. Form a hypothesis EARLY and make the change.';
  }
  const raw = String(bounded.reason ?? '');
  const shown = raw.length > BOUND_REASON_MAX
    ? `${raw.slice(0, BOUND_REASON_MAX)} [${GAP_TRIM_MARKER} ${raw.length - BOUND_REASON_MAX} of ${raw.length} characters withheld — the cap is ${BOUND_REASON_MAX}]`
    : raw;
  return 'Your previous attempt was CUT OFF by the gate: it denied consecutive tool calls '
    + `until the streak guard ended the attempt. The gate recorded: ${shown}. `
    + 'The round budget was not what stopped you — repeating a denied call ends this attempt the same way.';
}

/**
 * The plan-drafting prompt: a schema DESCRIPTION built from the live validator
 * menus — never a copyable example (the drafter must author, not echo; the
 * run.js draftPrompt precedent). Check NAMES only: a check's command is
 * arbiter territory the planner never sees.
 * @param {any} job @param {string} scoutBlob @param {any[]|null} reds
 * @param {number} maxStepRounds @param {string|null} failure replan context
 * @param {string[]|undefined} scopes the offered `tree-changed` menu (`legalScopes`).
 *   Choose-don't-describe (§4): the agent picks a value, never authors a glob and
 *   guesses its shape. Omitted, it derives from the signed fence — the SAME
 *   fail-closed derivation `validatePlan` uses, so prompt and validator can never
 *   disagree about what was offered.
 * @param {{ balanceUsd?: number|null, remainingMs?: number|null, progress?: string }} [materials]
 *   what the run has LEFT (T/A). Omitted → no materials block at all, which is the
 *   pre-T behaviour and keeps every existing caller byte-identical.
 * @param {object|null} [startingDraft] Layer 3 (D4) — a loaded bridge's plan, handed over
 *   as the draft to TWEAK. Omitted/null is the COLD path and renders byte-identically to
 *   the pre-Layer-3 prompt: the block is additive, never surgery on the prompt's interior,
 *   so the two paths cannot drift (the F47 works-both-ways rule). Only the runner passes
 *   it, and only for the FIRST draft phase — a replan drafts from the run's own state.
 * @param {{ seedRed?: string[], priorChecks?: string[] }} [checkFacts] the shape-lottery
 *   gate rules, STATED as well as enforced (the mailbox precedent: a rule only the
 *   validator knows costs a redraft per draft). `seedRed`: preflight-red check names —
 *   Rule A-v2's law (final write step only, framed wide). `priorChecks`: the predecessor
 *   plan's carried checks, replan phase only — Rule B's law (keep every one). Empty/omitted
 *   renders byte-identically to the pre-rules prompt.
 * @param {string|null} [doorNote] MODULE 8 — the signer's own words, when a previous run
 *   of this spec ended at the review door and they took the RERUN door. Additive and
 *   omitted-by-default, so every existing caller renders byte-identically. It is a
 *   REQUIREMENT the plan must meet, never a replacement for the goal: the signed goal and
 *   the signed close are unchanged, and what the person added is what the machine could
 *   not see.
 * @param {boolean|'cap'|'diff'} [readShim] the read shim's ARM. Does it carry G1? Then G1
 *   is STATED as well as enforced (the mailbox precedent again: a law only the validator
 *   knows costs a redraft per draft). The arms without it — `false` and `'diff'` — render
 *   byte-identically to the pre-shim prompt.
 */
export function planPrompt(job, scoutBlob, reds, maxStepRounds, failure, scopes, materials, startingDraft = null, checkFacts = {}, doorNote = null, readShim = false) {
  const scopeMenu = Array.isArray(scopes) && scopes.length ? scopes : legalScopes(job.writeScope ?? []);
  const ceiling = Array.isArray(job.tools) ? job.tools : [...TOOL_MENU];
  // The shape-lottery laws, stated where the check menu is offered (the mailbox
  // precedent: a law only the validator knows costs a redraft per draft). Both
  // render only when their FACT arrived — empty facts keep the prompt
  // byte-identical to the pre-rules render.
  const seedRedLaw = Array.isArray(checkFacts.seedRed) && checkFacts.seedRed.length
    ? `\n  Check(s) RED at seed right now: ${JSON.stringify(checkFacts.seedRed)}. A failing check
  is the goal itself, not a milestone: it may ONLY appear on your plan's FINAL write step.
  Make that step wide — its action covers the whole goal, free to edit any file it reports,
  iterating until the check passes. A failing check on any earlier step is rejected.`
    : '';
  const priorChecksLaw = Array.isArray(checkFacts.priorChecks) && checkFacts.priorChecks.length
    ? `\n  Your previous plan carried these check-passes exits: ${JSON.stringify(checkFacts.priorChecks)}.
  Keep every one of them in this new plan — a redraft that drops one of them is rejected:
  the other exit forms verify form only, and a form-only green is unearned.`
    : '';
  // W4: the menu comes off the STAGED close — the same one derivation `runPlan`
  // executes and `validatePlan` accepts against. Reading `job.close` raw here left
  // the legacy object form offering nothing while the runner preflighted a stage.
  // (`?? []`: a close naming no command stages nothing, so it offers nothing)
  const closeStages = closeStagesOf(job) ?? [];
  const checkNames = checkMenu(closeStages).map((m) => m.name);
  // G1, stated where the grant is offered. Only under an arm that CARRIES G1 —
  // with the shim off, or under the diff-only arm that caps nothing, the rule
  // does not exist and neither does this sentence (the A0 and A2 renders). The
  // sentence also states the 24KB bound as its reason, which is the second
  // reason it cannot render for A2: that bound is not in force there.
  const readShimLaw = readShimArm(readShim).g1
    ? `\n  A step granting "read" must also grant "recall" and "get": a read of a large file
  returns only its next 24KB, and those two verbs are the only way to read a symbol in
  full. A step that grants "read" without both is rejected.`
    : '';
  const doc = `DRAFT-PLAN
You are planning how to accomplish a goal in a repository, as an ordered list of bounded
steps (schema "plan-v1"). The plan is pure declarative JSON validated by a strict schema;
ANY unknown field, wrong enum value, or out-of-bounds number is rejected. Output ONLY the
JSON object, no fences, no commentary.

Shape: { "schema": "plan-v1", "steps": [ ... 1..${MAX_PLAN_STEPS} steps ... ] } — steps run
strictly in array order. Each step (no other fields exist):
- "id": kebab-case slug, unique
- "action": the step's task, precise enough for a worker that sees ONLY this step
- "tools": non-empty unique subset of ${JSON.stringify(ceiling)} (read/grep are the worker's ONLY way to see the tree — there is no shell; write/edit change the tree; recall/get/impact/related/recent search and navigate the repository index; compress/peek read cheaply; stash/remember/forget park and record notes across steps)${readShimLaw}
- "rounds": integer 1..${maxStepRounds} — the step's per-attempt tool-round bound
- "target": the step's deliverable path (REQUIRED when tools include write/edit), inside ${JSON.stringify(job.writeScope)}
- "scope" (optional): narrow this step's WRITE fence — copy one value from the offered scopes below.
  A narrowed "scope" is the ONLY ground this step can write: its "target" must sit
  inside it, and a "tree-changed" exit's scope must not be disjoint from it (one that
  CONTAINS it is fine) — otherwise every write the step could make is denied, or the
  exit can never pass, on every attempt.
- "exit": 1..${MAX_EXITS_PER_STEP} form checks that ALL must pass (AND), each one of:
    {"type":"artifact-written","path":"...","pattern":"optional regex"}
    {"type":"tree-changed","scope":"<copy one value from the offered scopes below>"}
    {"type":"json-valid","path":"..."}
    {"type":"check-passes","name":"<copy one name from the check menu below>"}
  Check menu — a check-passes "name" is exactly one of ${JSON.stringify(checkNames)}; copy
  it character for character. No other name exists, and you cannot add one.
  A check-passes on a write-granted step MUST be paired with a tree-changed exit
  (the repository starts green — a lone check would pass on the untouched tree).
  A check-passes may ONLY appear on a step whose tools include write or edit: a
  failing check is reported back to THAT step's worker for another attempt, so
  the step must be able to act on the report. Do not plan a separate read-only
  "verify" step — attach the check to the step that does the fixing; the final
  verification after your plan is not yours to author.
  A check judges the WHOLE goal, never just this step's deliverable: its report
  can name files beyond the step's target. A step carrying a check-passes exit
  must therefore be free to edit every file the check can report on — never
  write an action that forbids editing other in-scope files (e.g. "do not
  modify any file outside X"): a step ordered to leave a file alone while its
  exit reds on that file can never finish, on any attempt.${seedRedLaw}${priorChecksLaw}
  Reference checks by NAME only; you cannot author or modify one.

The worker has NO SHELL. It cannot run a command, a compiler, a linter, or a test suite,
and it cannot execute a script it writes: its only verbs are the tools you grant that step
in "tools". The check named in a "check-passes" exit is the ONLY execution in this run —
the shell runs it after each attempt and hands the worker its raw output. So write every
"action" for a worker that locates its work by READING and GREPPING files and by reading
the check output it is given. Never tell it to run, execute, re-run, or verify by running
anything (an action that opens with "Run \`<command>\`…" costs the whole step: the worker
has no way to obey it and spends its rounds hunting by hand).

Offered "scope" values for tree-changed — copy ONE of these exactly, character for
character. No other value is accepted, and patterns of your own (like "src/*.js")
are not accepted:
${scopeMenu.map((s) => `  ${JSON.stringify(s)}`).join('\n')}

Goal:
${job.goal}
${doorNoteBlock(doorNote)}${materialsBlock(materials)}
Repository survey (from a read-only scout):
${scoutBlob || '(no scout notes)'}`;
  let p = doc;
  // BEFORE the failure/reds appendices, so the last word to a redrafting planner stays
  // the validator's "fix every red". The execution probe injected at the provider seam
  // and could only append at the very end; it recorded that ordering as its own known
  // wart. Owning the prompt is what lets it be fixed — and on the first draft (no
  // failure, no reds) the render is byte-identical to the probe's.
  if (startingDraft) p += startingDraftBlock(closeStages.length, startingDraft);
  if (failure) p += `\n\nWhat happened when the previous plan ran:\n${failure}\nPlan differently — a repeat of the same steps will fail the same way.`;
  if (reds) p += `\n\nYour previous plan was REJECTED with these reds (code:path):\n${JSON.stringify(reds)}\nFix every red. Output ONLY the corrected JSON object.`;
  return p;
}

/**
 * Execute a validateJob-GREEN plan-shape job (goal/verdictType/close).
 * Called by runJob after the approval gate, validation, and the smoke — this
 * function owns the plan flow only; the caller owns the job-end record and the
 * one ledger (every provider round is emitted here as `worker-round`, which
 * the caller's metered emit accounts — F12).
 *
 * @param {any} job the validated plan-shape spec
 * @param {object} opts
 * @param {string} opts.workdir the run directory (the fence's root)
 * @param {any} opts.provider shell-owned LLM binding (the Loop path — `anthropic-api`)
 * @param {(o: {policy: Function, onTurn?: Function, maxTurns: number, hasTools: boolean}) => any} [opts.nativeProvider]
 *   NATIVE clipipe factory (BA-16): required when `job.provider === 'clipipe-subscription'`.
 *   The runner builds a FRESH provider per worker and picks the mode by `hasTools`:
 *   `true` → native tool mode (`toolProtocol:'claude-mcp'`, wire `policy`+`onTurn`+`maxTurns`);
 *   `false` → the drafter has no tools, so a native session would report NO cost — return a
 *   metered claude-json TEXT provider (`--output-format json`, `parse:'claude-json'`) instead,
 *   so its spend is never invisible. The Loop path (`anthropic-api`) never touches this.
 * @param {any} [opts.judgeProvider] softgreen — the provider a JUDGED close stage runs its
 *   locate call through, pinned by the operator to `JUDGE_MODEL` (src/judged.js). Separate
 *   from `provider`/`providerFor` on purpose: the judge tier is not a step knob and never
 *   agent-selectable, and the worker's binding is not a legal stand-in for it. Absent is not
 *   a fall-back — a judged stage with no seam instrument-STOPS as a wiring gap, the same
 *   answer a native job with no `nativeProvider` gets. A close with no judged stage never
 *   reads it.
 * @param {(type: string, data?: object) => object} opts.emit spine emitter (the caller's METERED emit)
 * @param {() => number} opts.remainingUsd the one wallet: what is left of the signed budget right now
 * @param {() => boolean} [opts.isUnpriced] has any round come back with a null cost? (F6) — the
 *   plan flow bails IN-FLIGHT on the first unpriced round instead of burning the whole plan
 * @param {(tier: string) => any} [opts.providerFor] P: per-step model-tier factory
 *   (tier ∈ STEP_MODELS → a provider). A plan naming a tier with no factory supplied is an
 *   interpreter-red STOP — never silently run the default tier as if the choice was honoured.
 * @param {number} [opts.capRuns] shell-owned iteration cap, RETIRED as a governor
 *   (v1.46 §4). It stopped bounding a plan step when the strike ladder landed, and it
 *   stopped bounding the close-fix loop when the close trend rule did. It survives as
 *   that loop's fallback for the ONE case the trend cannot read — a close whose output
 *   carries no number at all — because a governor that cannot see the variable must
 *   not be the governor, and the honest fallback is the cruder bound it replaced
 *   rather than "unbounded". It lifts the moment a stage reports a comparable number.
 * @param {number} [opts.strikeLimit] shell-owned STRIKE ceiling for a plan step's
 *   ladder (src/ladder.js). Arbiter territory exactly as the count it replaced was —
 *   the runner sets it, the plan cannot express it, and no step may tighten or raise
 *   it.
 * @param {number} [opts.closeTimeoutMs] close/check wall-clock cap (shell territory)
 * @param {number} [opts.maxStepRounds] the shell's per-step rounds ceiling (validatePlan's bound)
 * @param {number} [opts.scoutRounds] the read-only survey's round bound (F59: the LAST round is
 *   reserved — a scout that spends every round on tools gets one toolless round to write its
 *   survey, because the bound halts it mid-tool-use and text is its only deliverable)
 * @param {boolean|'cap'|'diff'} [opts.readShim=false] THE READ SHIM (src/readshim.js) — the
 *   ARM to run, one of the Phase 2 pre-registration's four: `false` (A0, off — the default),
 *   `'cap'` (A1: cap + pointer + next-unseen-slice + G1), `'diff'` (A2: the diff lever alone,
 *   no cap, no pointer, no G1), `true` (A3: every lever). Anything else THROWS at the entry
 *   below rather than coercing into a truthy shim — a mis-spelled arm that silently ran A3
 *   is a corrupted battery row, invisible afterwards.
 *   OFF is byte-identical to the pre-shim run in every observable, G1 included: the frozen
 *   A0 baseline arm must be exactly today's behaviour, and a guard firing under a disabled
 *   shim would quietly make the baseline a treatment arm. The default-flip waits on a paid
 *   contrast that has not been approved (the `layerRoot` precedent, F41 — an unproven lever
 *   ships OFF and earns its default).
 * @param {boolean} [opts.layerRoot=false] Layer R — the within-run ratchet (src/root.js),
 *   scoped PER STEP's ralph loop (each micro-wheel is the Layer-1 atom). Shell-assembled from
 *   the step's own books: per-attempt write-sets from the F32 workerWrites audit (teed for
 *   same-path rewrites, which the cumulative audit alone cannot see) and the red-set from the
 *   exit evaluator's own gap. Defaults OFF (decided 2026-07-21, F41): fixation is extinct on
 *   every current job, so ON has never won its A/B; `true` is the ON/experimental arm, and the
 *   first plan-flow job to emit `root-injected` runs the pre-registered ON-vs-OFF acceptance
 *   read (the Layer R default-flip, LAYERS.md ⚠). Excluded on native (clipipe): the native
 *   worker has no onToolResult seam, so the tee cannot settle and same-path rewrites are blind.
 * @param {unknown} [opts.bridge] Layer 3 (D3/D4) — a bridge-v1 registry entry to REUSE as the
 *   drafter's starting point. Absent is the COLD path and is byte-identical to the pre-Layer-3
 *   flow. Present, the D2-split LOAD GATE runs at the door, before the close precheck and
 *   before any token: on a pass the newest version's plan (the run-as-executed artifact)
 *   rides into the FIRST draft prompt only; on a fail the run returns the distinct terminal
 *   `recipe-stale` having spent nothing. Selecting the entry — the listing, the pin, the
 *   LLM's pick — is the CALLER's, and so is falling back to cold: a silent automatic
 *   fall-back would spend a run's budget on a decision nobody made.
 * @param {number} [opts.priorWallMs=0] RESUME (module C) — wall time a PREVIOUS, killed
 *   attempt of this same try already consumed, folded into the run clock (see
 *   `createClock`'s `priorElapsedMs`). The SIGNED `maxWallMs` is never rewritten: it is in
 *   the spec hash, and a resume that edited it would need a signature nobody typed. The
 *   restarted attempt simply starts already partly spent, so a kill can never buy a fresh
 *   allotment of the operator's wall.
 * @param {any} [opts.resumeSeed] RESUME (module C v2) — the FINEST honest checkpoint of a
 *   KILLED run of this same try, read off its own spine by `readResume` (src/reuse.js) and
 *   by nothing else: `{ phase, plan, completedSteps: [{id, seq, by}] }`. hamr's ruling is
 *   the whole contract — *"it should allow resume and start last step instead from the
 *   beginning, why would i want to waste more money on something i already started"* — so
 *   with a seed this flow re-pays for NO paid unit the dead run already bought:
 *
 *   - the SCOUT does not run (`scout-skipped`, never silence). Its survey is not on the
 *     spine (only its byte count is), so the ONE consequence is stated rather than
 *     discovered: a replan after a resume drafts from an empty survey plus the failure
 *     brief. Re-scouting to refill it would re-pay the exact call this exists to save.
 *   - the PLAN is not re-drafted. It is reloaded from the seed and RE-VALIDATED against
 *     the current signed spec; a plan that no longer validates is `plan-red` by name
 *     (`resume-plan-red`), never run. It is then emitted as this leg's own
 *     `plan-accepted` (`phase: 'resume'`) — R1 mints a bridge version from the plan AS
 *     EXECUTED, read back off the spine, so a leg that greens without one would mint
 *     nothing.
 *   - a step whose exit was already SATISFIED is skipped, in prefix order, each with its
 *     own `step-skipped` record naming the event that proves it. Never a fake
 *     step-start/step-end pair, and never silence: a reader must be able to tell skipped
 *     from run (the resume-to-cap invariant).
 *
 *   The worker's conversation is deliberately NOT replayed — a transcript is not a
 *   checkpoint, and every attempt is fresh by the loop's own design. Absent is the
 *   ordinary path and is byte-identical to a run that was never killed.
 * @param {{stage?: string|null, value?: number|null}[]} [opts.resumeGrades] RESUME — the
 *   close GRADES the dead leg recorded, oldest first (`readResume`'s `restart.grades`).
 *   A resumed leg is the same run continuing, so its halt readouts must judge the whole
 *   chain: without this the trend restarts at this leg's first close and can report
 *   `flat` — "revise the goal" — on a run that was converging when its allowance ran
 *   out. Baselines only (src/trend.js's THE SEED): it spends none of this leg's own
 *   bounds and mints none of its strikes. Empty/omitted is the cold path.
 * @param {{count?: number, grantUsed?: boolean}|null} [opts.resumeReplans] RESUME — the
 *   replan LEDGER the chain has already spent (`readResume`'s `restart.replans` /
 *   `restart.replanGrantUsed`), seeding the ceiling below. `resumeGrades`' sibling and
 *   deliberately NOT its twin: a grade seed feeds a READOUT, this one feeds a BOUND.
 *
 *   Without it the ceiling is reborn on every call, and a resume is another call:
 *   measured, a leg that spent both replans and step-redded handed its checkpoint to a
 *   second leg that replanned twice more. Two became four by being killed once, which is
 *   the creep the latch exists to make impossible ("unlimited replanning launders thrash
 *   as adaptation", PRD v1.12).
 *
 *   WHY THIS SEED SPENDS THE LEG'S BOUND WHERE `resumeGrades` DOES NOT. src/trend.js's
 *   THE SEED refuses to seed the fix loop's ITERATIONS from history "because the leg's
 *   own bounds must not be spent by history" — and that is right, because an attempt
 *   allowance is a LEG bound: a restarted leg buys its own attempts with its own money.
 *   The replan ceiling is a RUN bound by doctrine. It bounds how many times the WORKFLOW
 *   may be redrawn before redrawing it is thrash, and that question spans exactly the
 *   chain the halt readout already spans. The two seeds therefore disagree on purpose;
 *   they are not the same rule applied inconsistently.
 *
 *   CHAIN SEMANTICS, and the one place this differs from the grade seed's mechanism.
 *   `readGradeSeed`'s documented KNOWN LIMIT is that it reads ONE spine, so a resume of a
 *   resume inherits leg 2's grades and not leg 1's — the chain shortens by one leg per
 *   resume, which is fail-safe for a READOUT (a shorter chain can only under-claim a
 *   direction). It is the DANGEROUS direction for a ceiling: an under-claimed ledger is a
 *   refilled allowance, and every kill would buy one. So this seed does NOT reuse that
 *   mechanism. It follows the MONEY fold instead (`priorSpentUsd`, `try-start`/
 *   `job-start`): each leg DECLARES the ledger it inherited on its own spine, and the
 *   next reader adds only that leg's own `replan` records to the declared number. Leg 3
 *   therefore inherits the whole chain, not leg 2's slice.
 *
 *   `count` seeds `replans` (and, above zero, latches `replanned`); `grantUsed` seeds the
 *   F85-C variance latch, so a killed leg cannot re-earn an extra the arbiter has already
 *   granted. Null/omitted is the cold path and is byte-identical to a run nobody resumed.
 * @param {() => boolean} [opts.spendComplete] is the run's spend EXACT, or a floor? The
 *   ledger one level up owns the answer (unpriced rounds, a self-healed stall, a mid-call
 *   cut, an inherited resume floor); the money-halt readout states it beside the remaining
 *   it quotes, because `budget − floor` is a CEILING and printing it bare reads as exact
 *   (F6). Defaults to exact, which is what every pre-record caller was implicitly saying.
 * @param {() => number} [opts.now] the wall clock's time source, injected. The real clock is the
 *   default; a caller supplies this to drive time deterministically (the same seam `createClock`
 *   already exposes — a run's terminal cannot otherwise be exercised without waiting out a cap
 *   whose floor is one close timeout).
 * @param {string|null} [opts.resumeBranch] RESUME — the WORK BRANCH the killed leg
 *   recorded on its own spine (`readResume`'s `restart.branch`, off the `work-branch`
 *   event). With it the resume returns to the branch its own work is sitting on; without
 *   it the deterministic name would collide with that very branch and the collision walk
 *   would mint a `-2` beside the progress the resume exists to keep. Absent is the cold
 *   path. A recorded branch that no longer exists is a STOP, never a fresh start.
 * @param {{decision: string, text?: string}|null} [opts.humanRuling] N4 — the SIGNER's
 *   answer at a hitl pause (2026-08-12 §1, re-cut 2026-08-17: accept | rerun <text> | pause), carried in
 *   by the runner on the leg that RESUMES a paused run. Absent on every ordinary run and
 *   on the leg that pauses; it is never authored, never defaulted, and never inferred.
 *
 *   It is spent ONCE, on this leg's close readings up to the moment the fix loop opens:
 *   `accept` greens the human stage on fresh evidence (OPEN-3 — the mechanical stages
 *   re-run first, because the tree can change while a run is paused), `rerun` reds it
 *   with the human's own words as the gap, and `pause` keeps the checkpoint exactly as it
 *   is, before anything is read at all. After the fix loop opens the ruling is gone, so once the mechanical
 *   stages pass again the run PAUSES for a second review rather than converting the same
 *   sentence forever.
 * @param {{decision: string, text?: string|null, receivedAt?: string|null}|null} [opts.heldRuling]
 *   F102 — the decision the CHECKPOINT carries (`readResume`'s `restart.pendingDecision`):
 *   an answer a person already gave, on a leg that stopped before a single round was
 *   bought for it. It is applied exactly as a fresh one is, through the same seam, so
 *   the person is never asked the same question twice; the spine records that it came
 *   from a record rather than from a person, and `receivedAt` says when they said it.
 *
 *   A leg handed BOTH is refused (`hitl-decision-red`, naming the held decision): two
 *   answers to one question is ambiguity, and a merge would pick a winner nobody chose.
 *   Absent is every ordinary run and every leg the operator answers directly.
 * @param {number} [opts.priorSpentUsd=0] F103 — money the CHAIN spent before this leg,
 *   for the `engagement` record's money half ONLY. It bounds nothing here: the wallet
 *   is the ledger's one level up, and `remainingUsd` already nets this fold against the
 *   signed budget on every path (the signed budget is the chain's ceiling, and a rerun
 *   spends what remains of it — never a refill). Reporting, never governance.
 * @param {boolean|null} [opts.reviewDoor] MODULE 8 — does this run END at the review
 *   door (PRD v1.71 §3)? `true`/`false` is the operator's explicit choice in either
 *   direction; absent is the CLASS default (`doorOpens`): always for soft-green,
 *   whose credit is held until a person accepts, and never for green-class unless
 *   asked. It changes what the run RECORDS and never what it returns — the door is
 *   a disposition, and the loop's verdict is not the door's to touch.
 * @param {{text: string, fromRunid?: string|null, receivedAt?: string|null}|null} [opts.doorRerun]
 *   MODULE 8 — the signer took the RERUN door on a previous run: a FRESH ENGAGEMENT
 *   (§3.4) against the same signed spec, carrying their words. Two things follow, and
 *   only two: the already-green shortcut is refused (the tree passing the close is
 *   precisely the state the person rejected), and the words reach the PLANNER as new
 *   authoring. It is never a `humanRuling` — that answers a close's human STAGE, and
 *   a green-class job has none. Empty words are refused at the same seam every door is.
 * @returns {Promise<string>} 'green' | 'already-green' | 'escalated' | 'plan-red' |
 *   'check-red' | 'close-red' | 'close-unsupported' | 'recipe-stale' | 'pricing-red' |
 *   'branch-red' | 'cap-halt' | 'wall-halt' | 'provider-red' | 'interpreter-red' |
 *   'step-stalled' | 'hitl-pause' | 'hitl-decision-red' | `step-red:<id>`
 */
export async function runPlan(job, { workdir, provider, nativeProvider, providerFor, judgeProvider = null, emit, remainingUsd, isUnpriced = () => false, spendComplete = () => true, capRuns = 3, strikeLimit = STRIKE_LIMIT, closeTimeoutMs, maxStepRounds = 40, layerRoot = false, readShim = false, scoutRounds = SCOUT_ROUNDS, bridge = null, now, priorWallMs = 0, resumeSeed = null, resumeGrades = [], resumeReplans = null, resumeBranch = null, humanRuling = null, heldRuling = null, priorSpentUsd = 0, reviewDoor = null, doorRerun = null }) {
  // MEMORY-CACHE: what the read shim (src/readshim.js) saved THIS run, summed across
  // every mkWorker's own shim instance (scout, drafter, each step's worker, the fix
  // worker) — one accumulator closed over by all of them, because the shim's ledger
  // is deliberately per-worker (F-class reset boundary) while this readout is
  // per-run. `wrapRead`'s call sites feed it via `onCount`; nothing here re-derives
  // a count, it only sums what the shim already measured. Read, never written, by
  // anything outside the `finally` below.
  const memoryCacheCounts = { pointered: 0, capped: 0, bytesWithheld: 0 };
  workdir = resolve(workdir);
  // The read shim's ARM, resolved at the door — before the workdir is read, before
  // the scout, before a single token. An unrecognised spelling throws HERE, where
  // it costs nothing, rather than coercing into a truthy shim and running A3 under
  // an A2 label for the rest of a paid row (the blind-instrument class: the result
  // would be wrong and would look fine). Only the guard runs here; the flag itself
  // is still threaded onward as written.
  readShimArm(readShim);
  // G1's OTHER half, refused at the same $0 door. `validatePlan` reds `read-blind`
  // when a step grants `read` without the retrieval pair — but a step cannot grant
  // what the SIGNED CEILING does not offer, so against a spec whose `tools` lack
  // `recall`/`get` EVERY draft reds identically, and the drafter is paid for each
  // doomed cycle before the run fails. The condition is knowable here, before a
  // token: the arm is the operator's argument and the ceiling is already signed.
  //
  // Same class as the unknown-arm throw above and deliberately NOT a red: a red is
  // a verdict on the AGENT's work, and nothing the agent authored is wrong here —
  // the operator asked for a shim the signature cannot satisfy. Tighten-only, and
  // it narrows nothing that works: the only configuration it rejects is one that
  // already fails 100% of the time, just later and for money.
  //
  // Keyed on `arm.g1`, not on "is the shim on", for the same reason `plan.js` is:
  // the diff-only arm caps nothing, so there is nothing to be blind about.
  if (readShimArm(readShim).g1) {
    const signedCeiling = Array.isArray(job?.tools) ? job.tools : [...TOOL_MENU];
    const short = RETRIEVAL_PAIR.filter((v) => !signedCeiling.includes(v));
    if (short.length) {
      throw new TypeError(`readShim: this arm caps reads, so a step granting "read" must also grant ${RETRIEVAL_PAIR.join(' and ')} — but the signed ceiling [${signedCeiling.join(', ')}] offers no ${short.join('/')}, so no legal plan exists and every draft would red as "read-blind". Re-sign the spec with ${short.join(' and ')}, or run with the shim off.`);
    }
  }
  // MEMORY-CACHE's own `try`: everything from here on is a run that actually
  // BEGAN (both $0 refusals above — the unknown-arm throw and the G1 throw —
  // already happened and never touch this block), so `finally` below is the
  // one place the accumulated counts are read out, no matter which of the
  // paths below this point returns or throws.
  try {
  // ONE spelling of the redaction, housed next to the inventory it reads
  // (src/validate.js) — the same helper the isolate verbs scrub the litectx store
  // with. Two hand-spelled copies of "what a secret looks like" is exactly how
  // detection and redaction drift apart.
  const scrub = redactSecrets;
  // The ctx verbs' spine channel, scrubbed at the WIRING. Every field a ctx-tool
  // event carries is MODEL-CHOSEN text — a recall query, a stash id, a symbol, a
  // path the worker spelled — and the spine is append-only: a log that captures a
  // key captures it forever. Scrubbing the emitter (once, at construction) rather
  // than the seventeen call sites is what makes the leak inexpressible: a new ctx
  // verb cannot forget it. Same ONE inventory (SECRET_PATTERNS) the close output
  // is scrubbed with — never a second spelling of what a secret looks like.
  // Shallow by shape: the events are flat records of strings, string arrays
  // (`paths`) and numbers, and numbers pass through untouched.
  const emitCtx = (/** @type {string} */ type, /** @type {any} */ data) => emit(type, Object.fromEntries(
    Object.entries(data ?? {}).map(([k, v]) => [k, typeof v === 'string' ? scrub(v)
      : (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? scrub(x) : x)) : v)]),
  ));

  // Which worker surface? `clipipe-subscription` drives tools NATIVELY (the CLI
  // owns the turn cycle, BA-16); every other provider runs the Loop. The close,
  // the checks, and the exit evaluator are provider-independent (commands and
  // form checks) — ONLY the worker differs, so the whole plan flow is shared.
  const native = job.provider === 'clipipe-subscription';

  // ── close-unsupported (F17 guard, mirrored from the legacy path at run.js):
  // the plan flow executes a PREDICATE close only — a command whose exit code is
  // truth. validateJob admits a GOLD close under verdictType green (gold is
  // hard-class), and a gold close carries no `cmd`; running `close.cmd.trim()`
  // on it would TypeError out of runJob with NO job-end (the spine would dangle,
  // no spend recorded). Refuse a non-predicate close cleanly, before any tokens.
  // A STAGED close (PRD v1.28) is an ordered list of command stages and is the
  // go-forward shape; the object form survives only for the declared-but-locked
  // verdict classes (gold/rubric/hitl), which name no command to run.
  // W4: the staging itself lives in ONE place (`closeStagesOf`), shared with
  // `planPrompt` and `validatePlan` — a second copy here is exactly how the
  // runner came to execute a stage neither of the other two could see. M4 widened
  // that one derivation to the AUTHORED close (`closeDecl`) rather than adding a
  // second: a consumer reading only `close` sees a declared job as closeless.
  const stagedClose = closeStagesOf(job);
  const declared = isDeclaredClose(job);
  if (!stagedClose) {
    emit('escalation', {
      category: 'close-unsupported', decisionReady: true,
      decision: `The job's close is a ${job.close?.type ?? 'non-command'} close — the plan flow executes commands whose exit codes are truth (a staged close, a single predicate, or an authored declaration).`,
      options: ['restate the close as a predicate', 'wait for the verdict-classes rung'],
    });
    return 'close-unsupported';
  }

  // ── THE SIGNER'S ANSWER (N4 §1.4), read before anything costs anything.
  //
  // Three gates, and each refuses rather than guesses. A decision that is not one
  // of the three doors — or a `rerun` whose text is empty — is refused at the
  // seam that ACCEPTS it, because the whole of what a rerun gives the fix worker
  // is the human's words, and an empty gap re-runs the worker as though nothing
  // had been said (the POC's negative control measured exactly that). A decision
  // handed to a close with no human stage is refused too: there is nothing for it
  // to rule on, and silently ignoring it would leave a person believing they had
  // answered. It is a terminal of its own rather than an `interpreter-red` — no
  // library failed, the operator's own input is what could not be read.
  const hasHumanStage = stagedClose.some((/** @type {any} */ s) => s?.kind === HUMAN_KIND);
  // …and the DOOR's rerun rides into the same resolver (module 8): it is not a
  // ruling and is never read as one, but "is this leg a fresh engagement" has ONE
  // spelling, and the clock split below reads it. Resolved HERE, before anything is
  // spent, so a door-rerun leg can never be recorded as `cold` or opened onto the
  // wall of the leg the person just rejected (F103).
  const ruling = resolveHumanRuling(humanRuling, heldRuling, doorRerun);
  const decisionRed = (/** @type {string} */ detail) => {
    emit('escalation', {
      category: HITL_DECISION_RED, decisionReady: true,
      decision: 'The decision handed to this run could not be applied, so nothing was run and nothing was spent.',
      options: [
        `re-run the resume with one of: ${HUMAN_DECISIONS.join(' | ')} (a rerun carries the text the worker converts)`,
        'abandon the task',
      ],
      detail: scrub(detail),
    });
    return HITL_DECISION_RED;
  };
  if (!ruling.ok) return decisionRed(/** @type {string} */ (ruling.why));
  if (ruling.ruling !== null && !hasHumanStage) {
    return decisionRed(`this job's close has no ${HUMAN_KIND} stage, so a signer's "${ruling.ruling.decision}" has `
      + 'nothing to rule on — the verdict class is a promise about the CLOSE, and only a close that asks a person '
      + 'can be answered by one');
  }
  // ── THE RERUN DOOR, one level out (module 8). A previous run ended at the
  // review door, the person said "I don't like it, go again", and this leg IS the
  // fresh engagement (§3.4). It is validated HERE, at the same seam and against the
  // same rulebook the close's own doors use — empty words are refused before a
  // branch is cut, before a scout is bought, before anything costs anything, because
  // the whole of what a rerun gives the run is the words.
  //
  // Deliberately NOT a `humanRuling`: that answers a close's human STAGE and is
  // refused for a close that has none, which is every green-class job. The two
  // decisions look alike on a screen and are different facts.
  /** @type {{text: string, fromRunid: string|null, receivedAt: string|null}|null} */
  let doorWords = null;
  if (doorRerun != null) {
    const dn = normalizeHumanRuling({ decision: 'rerun', text: /** @type {any} */ (doorRerun)?.text ?? null });
    if (!dn.ok) return decisionRed(`the rerun door was taken on a previous run, and ${dn.why}`);
    doorWords = {
      text: /** @type {string} */ (/** @type {any} */ (dn.ruling).text),
      fromRunid: typeof (/** @type {any} */ (doorRerun).fromRunid) === 'string' ? /** @type {any} */ (doorRerun).fromRunid : null,
      receivedAt: typeof (/** @type {any} */ (doorRerun).receivedAt) === 'string' ? /** @type {any} */ (doorRerun).receivedAt : null,
    };
    emit('door-rerun', {
      // the person's words are the gap, so they ride the same scrub every other
      // operator-authored string on this append-only log does
      text: scrub(doorWords.text),
      fromRunid: doorWords.fromRunid,
      ...(doorWords.receivedAt === null ? {} : { receivedAt: doorWords.receivedAt }),
      meaning: 'a FRESH ENGAGEMENT against the same signed spec — the previous run\'s verdict is untouched, and this leg buys its own clock',
    });
  }

  /** the ruling still to be spent. Cleared the moment the fix loop opens: the
   * human's words are what OPENS that loop, and once the worker holds them the
   * next machine-clean tree is a new question for the person, not the old one. */
  let liveRuling = ruling.ruling;

  // ── F102: THE DECISION IS WRITTEN DOWN, because a wall is a serialization
  // boundary and a decision that lives only in this process dies with it.
  //
  // Two records, and they answer two DIFFERENT questions:
  //   `human-decision`        — what this leg was handed, and by whom
  //   `human-decision-spent`  — what actually BOUGHT it
  //
  // The split is the whole finding. `liveRuling` is cleared when the fix loop
  // OPENS (N4 §1.5, unchanged below) — that is a rule about this leg's close
  // readings. Whether the person must be asked AGAIN is a different question, and
  // F102's incident is exactly where the two answers differ: the rerun opened the
  // fix loop and then wall-halted with `iterationsUsed: 0`, so the loop had
  // "spent" a decision no worker ever saw and the resume re-asked the byte-
  // identical question. So the spend marker fires on the WORK: a round bought for
  // the fix, an accept that greened, a pause honoured. Anything short of that and
  // the words are still owed to the person, and the checkpoint says so.
  //
  // The source travels with it (`operator` | `checkpoint`): "a person answered
  // this leg" and "a record answered this leg" are different facts, and one
  // spelling for both is F101's class in a decision's coat.
  /** the decision this leg still OWES the person — the door, held until work buys
   * it. @type {string|null} */
  let owedRuling = null;
  if (liveRuling !== null) {
    owedRuling = liveRuling.decision;
    emit('human-decision', {
      decision: liveRuling.decision,
      // the human's words are the gap, so they ride the same scrub every other
      // model- or operator-authored string on this spine does (append-only: a log
      // that captures a key captures it forever)
      text: liveRuling.text === null ? null : scrub(liveRuling.text),
      source: ruling.source,
      // WHEN THE PERSON SAID IT, carried across the boundary rather than re-stamped.
      // Omitted on a fresh answer, where this record's own `ts` IS the receipt —
      // a decorative copy of `ts` would be indistinguishable from a carried one.
      ...(ruling.receivedAt === null ? {} : { receivedAt: ruling.receivedAt }),
      meaning: ruling.source === 'checkpoint'
        ? 'held by the checkpoint and applied directly — the person is not asked again (F102)'
        : 'answered on this invocation',
    });
  }
  /** the decision is PAID FOR — by the work it commissioned, never by the loop
   * merely opening. Idempotent: the first payment is the one that settles it.
   * @param {string} reason */
  const spendRuling = (reason) => {
    if (owedRuling === null) return;
    const decision = owedRuling;
    owedRuling = null;
    emit('human-decision-spent', { decision, reason });
  };

  // ── PAUSE: the third door, and it costs nothing at all (2026-08-12 §1, doors
  // re-cut 2026-08-17). Before the branch, the seed, the precheck and the clock,
  // because a person who answered "not now" has asked for nothing to be done: no
  // gap, no continuation, no worker round. It is deliberately NOT routed through
  // the close — running four stages to arrive back at the question the person has
  // just declined to answer is wall time spent on an answer already in hand.
  //
  // hamr's ruling, verbatim: *"what's the point of cancel anyways? pause can
  // resume — that would be more honest"*. So this mints the SAME checkpoint
  // terminal the machine-side pause mints, which is what keeps it resumable under
  // the existing TTL: the run re-enters at the start of its last step whenever
  // somebody comes back, and if nobody does, the checkpoint expires on its own.
  // That expiry IS the case cancel used to serve, without forcing a person into a
  // forever-decision at the moment they least want to make one.
  //
  // The record is EXPLICIT (`humanDecision`) rather than a silent re-pause: "a
  // person looked and kept it" and "nobody has looked yet" are two different
  // facts, and one record spelling both is how a reader comes to confuse them.
  // The evidence package is not re-assembled here — it is already on the spine of
  // the leg that asked, and this leg measured nothing, so it states nothing (F6:
  // absent, never an empty list dressed as a reading).
  if (liveRuling?.decision === 'pause') {
    // ANSWERED IN FULL, here. A pause commissions nothing, so there is nothing left
    // owing and nothing for a later leg to hold over the person — the same three
    // doors are open the next time somebody looks (doors addendum, v1.73 ruling 5:
    // the pause door is allowance-free in EVERY state, including a wall-exhausted
    // one, which is why this sits above the clock as well as above the wallet).
    spendRuling('paused');
    emit(HITL_PAUSE, {
      stage: stagedClose.find((/** @type {any} */ s) => s?.kind === HUMAN_KIND)?.name ?? null,
      humanDecision: 'pause',
      decisionReady: true,
      // EXPLICITLY null, never absent: every gap consumer guards with `if (gap)`,
      // and the field states the ruling rather than leaving it to be inferred.
      gap: null,
      decision: 'The signer looked and paused: nothing was asked for, so nothing was run and nothing was spent. The '
        + 'checkpoint stands exactly as it was — the work, the plan and the money are where the paused leg left them.',
      options: [...HUMAN_DECISIONS],
      meaning: 'not a verdict — the run is still paused, the clock is still stopped, and the same three doors are open',
    });
    return HITL_PAUSE;
  }

  // ── native wiring: a clipipe-subscription job needs the native provider
  // FACTORY (native governance is constructor-time + per-worker, so the runner
  // cannot reuse one injected instance). A missing factory is an adopter wiring
  // gap, never a silent fall-back to the Loop path (that would run a
  // subscription job on the metered API — the wrong bill on the wrong surface).
  if (native && typeof nativeProvider !== 'function') {
    emit('escalation', {
      category: 'interpreter-red', decisionReady: true,
      decision: 'This job declares provider clipipe-subscription (native tool mode), but no native provider factory was wired into the runner.',
      options: ['wire a native CLIPipeProvider factory (opts.nativeProvider)', 'change the job provider to a Loop-driven one'],
    });
    return 'interpreter-red';
  }

  // ── THE BRIDGE LOAD GATE (Layer 3, D2 as SPLIT by the 2026-08-01 addendum).
  // Asked AT THE DOOR: *"is this the right KIND of recipe?"* — verdict type, close-stage
  // kinds, verbs within the signed menu, and NOTHING instance-bound (paths, scopes and
  // targets are expected to be yesterday's bricks; the full validatePlan judges the
  // TWEAKED draft at draft time, D4).
  //
  // It sits FIRST among the things that cost anything, and above the clock and the close
  // precheck deliberately: the gate is $0 and deterministic while a precheck is real wall
  // time (four stages at the shipped timeout is an hour). It sits BELOW the two guards
  // above it because those say the JOB cannot run at all, which outranks "this recipe does
  // not fit". Consequence, named rather than discovered later: a refused run never learns
  // whether the tree was already green — the caller's cold rerun does.
  //
  // The entry is re-validated here even though the caller is contracted to pass a valid
  // one. Not defensive decoration: the very next thing this code does is reach into
  // the newest eligible version's `plan`, and a half-written file that reached a reader anyway must come
  // back as named reds, never as a TypeError out of the runner (`loadRegistry` already
  // skips-and-reports for the same reason).
  let startingDraft = null;
  if (bridge != null) {
    const bv = validateBridge(bridge);
    const gate = bv.ok ? loadGate(bv.bridge, job) : { ok: false, reds: bv.reds };
    const name = typeof (/** @type {any} */ (bridge)?.name) === 'string' ? /** @type {any} */ (bridge).name : null;
    if (!gate.ok) {
      emit('bridge-gate', { outcome: 'recipe-stale', name, reds: gate.reds });
      emit('escalation', {
        category: 'recipe-stale', decisionReady: true,
        decision: `The selected workflow${name ? ` "${name}"` : ''} is not the right KIND of recipe for this job, so it was refused before anything was spent. Reusing it is not a decision this run can make for you.`,
        options: ['rerun COLD (draft a new plan from scratch)', 'select a different workflow from the registry', 'change the job spec so the shapes match (a spec edit — the new hash needs re-approval)'],
        detail: gate.reds.map((/** @type {any} */ r) => `${r.code}:${r.path}${r.detail ? ` — ${r.detail}` : ''}`).join('\n'),
      });
      return 'recipe-stale';
    }
    // `versions` is oldest-first and non-empty by the validator's entry bar, so the newest
    // RELEASED green's plan-as-executed is the one that inherits (R1) — never the founding
    // one, and never a HELD one (softgreen module 6: a judged green earns no reuse until a
    // person accepts it). Selection already skips a wholly-held entry with a stated reason;
    // this is the same rule at the point of CONSUMPTION, so a second caller handing a
    // bridge in directly cannot spend credit no signer granted.
    const newest = newestEligibleVersion(bv.bridge);
    if (newest === null) {
      const reds = [{ code: QUARANTINED_CODE, path: 'versions', detail: reuseEligibility(bv.bridge).reason }];
      emit('bridge-gate', { outcome: QUARANTINED_CODE, name, reds });
      emit('escalation', {
        category: 'recipe-stale', decisionReady: true,
        decision: `The selected workflow${name ? ` "${name}"` : ''} is HELD: its green was rendered by the judged floor and nobody has accepted it yet, so it has earned no reuse. Nothing was spent.`,
        options: ['accept that run at the review door, then rerun', 'rerun COLD (draft a new plan from scratch)', 'select a different workflow from the registry'],
        detail: reds.map((r) => `${r.code}:${r.path} — ${r.detail}`).join('\n'),
      });
      return 'recipe-stale';
    }
    startingDraft = newest.plan;
    emit('bridge-loaded', { name: bv.bridge.name, versions: bv.bridge.versions.length, runid: newest.runid });
  }

  // T (PRD v1.27/v1.29) — the run's wall clock, STARTED HERE, before the close
  // precheck. The precheck is real wall time and F62 measured close/check gaps as
  // high as 328s on an archived run: a clock created after it would under-report
  // elapsed by that much and hand the planner a balance the run does not have. Time
  // the operator's own instruments too, or the budget is measured against a
  // different run than the one that happened.
  //
  // `job.maxWallMs` is operator input with budgetUsd's status and has NO DEFAULT
  // (hamr's ruling): absent means honestly time-unbounded, and the record says so
  // rather than leaving a reader to infer it. Both numbers are reported — addendum 1
  // measured that a deadline is only readable BETWEEN rounds, so enforcement is
  // requested + the close's own worst case and quoting one number would be F6 in a
  // time coat.
  //
  // W5 — that worst case is per STAGE. `runStages` hands each stage the full
  // `closeTimeoutMs`, so a run whose deadline trips just before a 4-stage close can
  // overshoot by four of them, and the clock is told the count rather than assuming
  // one. `stagedClose` is the SAME staging the runner executes (never a second
  // count), and it is non-null here by the close-unsupported guard above — a close
  // that names no command escalated before this line, so there is no null to thread.
  //
  // RESUME (module C): `priorWallMs` is time a killed attempt of this same try already
  // consumed. It folds into the clock's start, never into `maxWallMs` — the cap stays the
  // signed one in the record and in the hash, and only the REMAINDER is left to run.
  //
  // F103 — TWO COUNTERS, AND NEITHER DOES THE OTHER'S JOB. hamr, verbatim:
  // *"redo/rerun comes with new authoring for money+time and keeps accounting of
  // this far and this session separate counters"*.
  //
  //   CHAIN      — every leg of this job added up. It is what the halt readout
  //                reports and what a person reads, and it is never lost.
  //   ENGAGEMENT — what BOUNDS this leg. A resume of the same engagement folds
  //                (W-2 exactly as it was: a kill may never buy a second wall). A
  //                RERUN does not, because the person did not decide on the run's
  //                clock: `msx7a3rj` took the door and inherited 87 seconds from a
  //                leg that had already ended, on a worker measured to read nine
  //                rounds before its first write. That engagement was not short, it
  //                was structurally impossible, and it paid real money to find out.
  //
  // The cap itself is untouched on both paths — `maxWallMs` is the signed number,
  // in the record and in the hash, and only a re-sign changes what a rerun can buy.
  // MONEY IS DELIBERATELY NOT SYMMETRIC and is folded on every path (`remainingUsd`,
  // one level up): the signed budget is the CHAIN's ceiling, a signature for $5
  // never silently authorizes $10, and the fresh engagement spends what remains of
  // it. The asymmetry is the point — time was the axis F103 measured, and a refilled
  // wallet is the failure F45 measured.
  const chainWallMs = typeof priorWallMs === 'number' && Number.isFinite(priorWallMs) && priorWallMs > 0 ? priorWallMs : 0;
  const engagementPriorWallMs = ruling.fresh ? 0 : chainWallMs;
  const clock = createClock({ maxWallMs: job.maxWallMs ?? null, closeStages: stagedClose.length, priorElapsedMs: engagementPriorWallMs, ...(now ? { now } : {}) });
  const closeTimeoutForReport = closeTimeoutMs ?? 120_000;
  emit('engagement', {
    kind: ruling.fresh ? 'rerun' : (chainWallMs > 0 || resumeSeed !== null ? 'resume' : 'cold'),
    chainWallMs,
    engagementPriorWallMs,
    wallCapMs: job.maxWallMs ?? null,
    // the money half of the same pair, stated where the time half is so a reader
    // never has to assemble one leg's accounting from two records. The BOUND lives
    // one level up (the ledger owns the wallet); these are its two readings.
    // belted like every other number entering a record: a garbage fold reads 0
    // rather than putting a NaN where a reader expects money (F6's arithmetic half)
    chainSpentUsd: typeof priorSpentUsd === 'number' && Number.isFinite(priorSpentUsd) && priorSpentUsd > 0 ? priorSpentUsd : 0,
    budgetUsd: job.budgetUsd,
    meaning: ruling.fresh
      ? 'a rerun is a FRESH ENGAGEMENT: its own clock, the same signed wallet (F103)'
      : 'the same engagement continuing: the wall folds, as it always has (W-2)',
  });
  emit('wall-clock', {
    ...clock.report(closeTimeoutForReport),
    // the CHAIN view, beside the engagement's own elapsed rather than folded into
    // it: on a rerun leg `elapsedMs` is this engagement's and this is the job's,
    // and one number meaning both is exactly how a decision came to inherit 87
    // seconds.
    chainWallMs,
    meaning: clock.bounded
      ? 'a between-round deadline; a close already in flight when it trips runs to completion'
      : 'NO time cap was set — time-unbounded by explicit operator choice, never by a default',
  });

  /**
   * The per-call TIME bounds, in ONE place so the two `loop.run` sites cannot drift
   * (the two-transforms class, F9). bare-agent forwards a run's options straight into
   * `provider.generate` (loop.js:732), so both knobs land on the request:
   *
   *   timeoutMs   BA-18, IDLE: `req.setTimeout`, reset by every byte. Bounds a silent
   *               socket and nothing else.
   *   deadlineMs  BA-19, TOTAL: a plain timer no byte resets. This is the bound for
   *               the F66 shape — a call that trickles forever while the run's own
   *               wall passes (274 minutes, with the idle bound correctly armed).
   *
   * `deadlineMs` is OMITTED, never zeroed, when the run is unbounded: the operator set
   * no wall, so there is no ceiling to derive, and inventing one is the silent second
   * ceiling F45 exists to forbid. Omission is also the honest spelling upstream — an
   * absent knob inherits the provider's own default (disabled), while an explicitly
   * garbage value THROWS there (`resolveTimeoutMs`, provider-http.js:53).
   *
   * The NATIVE (clipipe) worker does not call this and never did: the CLI owns the
   * transport, there is no `ClientRequest` for either timer to arm, and that path
   * passes neither bound today. Stated rather than assumed — an unbounded native call
   * is bounded by the F66 stall fuse and the outside watchdog, not by this.
   */
  const callBounds = () => {
    const deadlineMs = clock.callDeadlineMs();
    return { timeoutMs: clock.callTimeoutMs(), ...(deadlineMs === null ? {} : { deadlineMs }) };
  };

  /**
   * F64 — ONE categoriser for a throw out of a provider call, so the seams cannot
   * drift. A `HaltError` is the budget gate. The run's OWN deadline coming back as
   * bare-agent's `TimeoutError` (`callTimeoutMs()` is derived from the wall) is a
   * GOVERNANCE stop and rides out as `wall-halt` — filing it `provider-red` would
   * discard the row as a casualty (never evidence, F45/F48) and hand the human a
   * transport-debugging option list for a run that simply ran out of time. A
   * thrower that named its own category keeps it (the standing typed-attribution
   * rule); only an UNNAMED throw is classified here.
   * @param {any} e
   * @returns {{ err: CategorizedError, category: string }} the same throw, stamped,
   *   plus the category as a plain string (so a caller reading it never has to
   *   re-widen an optional field back to a value)
   */
  const categorize = (e) => {
    const err = /** @type {CategorizedError} */ (e);
    const category = e instanceof HaltError ? 'cap-halt'
      : (err.category ?? (isWallTimeout(err, clock) ? 'wall-halt' : 'provider-red'));
    err.category = category;
    return { err, category };
  };

  /** the run-level TIME record, one shape wherever the wall stops the run.
   * `cutMidCall` splits the two readings: `true` = the deadline landed INSIDE a
   * provider call (F64, seen as its timeout), `false` = read between steps, the
   * ordinary path. Both are the same stop; conflating them would hide which
   * instrument saw it. */
  const emitWallHalt = (/** @type {object} */ extra) => emit('wall-halt', {
    ...clock.report(closeTimeoutForReport),
    meaning: 'not under cap — not "can\'t"',
    cutMidCall: false,
    ...extra,
  });
  /** the wall's decision-ready levers, BYTE-IDENTICAL to ralph's own `wall-halt`
   * entry (ralph.js DECISIONS). One category must hand a human ONE option list: which
   * site read the clock is an implementation detail, and a shorter list here quietly
   * withheld the second lever (revise the goal) from every stop this file escalates.
   * Both levers are spec edits — a changed spec hash the runner refuses until it is
   * re-approved — which is why each carries its own re-approval note, and why the
   * caller's detail carries the progress trend that says which lever fits. */
  const WALL_OPTIONS = [
    'raise maxWallMs and rerun (resume-to-cap; a spec edit, so the new hash needs re-approval)',
    'revise the goal/spec so the work fits the time (same re-approval)',
    'abandon the task',
  ];
  /** MONEY's levers (PRD v1.46 §2), the same three shapes the wall's are, because a
   * money cut is the same KIND of stop: the run is out of an operator-owned
   * allowance, not out of capability, and the last verdict rendered stands. hamr's
   * ask was "halt and feedback… and needs to be accurate", so the readout that
   * carries these also carries the trend that says WHICH of the first two fits.
   *
   * The first lever is a top-up the OPERATOR performs. `budgetUsd` is in the spec
   * hash, so raising it is a new spec version somebody signs — the library only ever
   * names the lever, and never adjusts a budget itself (the permanent hard line). */
  const MONEY_OPTIONS = [
    'top up budgetUsd and rerun with --resume (resume-to-cap; a spec edit, so the new hash needs re-approval)',
    'revise the goal/spec so the work fits the budget (same re-approval)',
    'abandon the task',
  ];

  const closeOpts = { timeoutMs: closeTimeoutMs, cwd: workdir };
  /** D8 — the DECLARED close's seed, filled in below before anything runs.
   * `null` for a command close, which has no baseline to measure against. */
  /** @type {{seedRef: string}|null} */
  let declaredCtx = null;
  /**
   * ONE close-execution seam, chosen once by which field the SIGNED spec carries.
   * Both executors return `runClose`'s verdict shape, so everything downstream —
   * the precheck, the preflight, the check seam, ralph's judge, `CLOSE_FAULTS`,
   * the trend reader and Layer R — is the same code for both.
   *
   * The command path is byte-identical to what it was: same call, same options.
   * @param {any[]} stages
   */
  const runCloseStages = (stages) => (declared
    ? runDeclaredStages(stages, scrub, {
      ...closeOpts,
      seedRef: /** @type {any} */ (declaredCtx).seedRef,
      // the signer's answer reaches the human stage the same way every other
      // arbiter-owned fact reaches a stage: through the ctx, never through the
      // declaration. A command close has no human stage to hand it to.
      humanRuling: liveRuling,
      // SOFTGREEN — the judged stage's paid seam and its meter, the same way: through
      // the ctx, never the declaration. The seam is null unless the operator wired a
      // pinned judge provider (a judged stage then STOPS as a wiring gap rather than
      // grading on the worker's model). The meter emits a distinct `judge-round`
      // record carrying the call's own honest cost — the SAME emit the worker rounds
      // ride, so `runJob`'s ONE ledger accounts a close's spend exactly as it accounts
      // an attempt's (a budget funds the attempt PLUS its close), and a null cost trips
      // the same F6 pricing halt rather than being laundered into $0.
      judgeLoop: judgeProvider ? (/** @type {{system: string}} */ o) => defaultJudgeLoop({ provider: judgeProvider, system: o.system }) : null,
      onJudgeCost: (/** @type {any} */ c) => emit('judge-round', {
        stage: c.stage, path: c.path, attempt: c.attempt, label: c.label, model: c.model,
        costUsd: c.costUsd, unpricedRounds: c.unpricedRounds,
        // BA-21 provenance, through the SAME helper the worker rounds use — this record
        // is on `spendProvenance`'s read list (src/ledger.js), so a judge-round that
        // never carried the field would read UNKNOWN forever inside the readout built to
        // expose exactly this seam. NAMED, not papered over: the judge cost payload
        // (src/kinds.js `onJudgeCost({...})`) does not carry `rateSource` today, so it
        // still reads UNKNOWN — correctly — until that payload forwards it too.
        ...rateSourceFields(c),
      }),
    })
    : runStages(stages, scrub, closeOpts));
  /** @type {string|undefined} the stage that rendered the LAST close verdict (Layer R's red-set source) */
  let closeStage;
  /** @type {any} the LAST close verdict itself (W-2). A wall stop KEEPS the grade
   * the arbiter has already rendered rather than re-deriving one: past the deadline
   * the run's answer is whatever the close last said, and nothing after the deadline
   * is allowed to change it (hamr: *"keep the grade we already have and stop"*). */
  let lastCloseVerdict;
  /** PRD v1.46 §2 — the RUN's own close trend, fed by every grade the arbiter
   * renders (the precheck is the seed the work is measured against, so it is the
   * first reading, not a discarded one). Read only by the halt readouts; it decides
   * nothing and bounds nothing — the fix loop builds its OWN reader over its own
   * grades, because "did this run make progress" and "is this loop out of ideas"
   * are two questions and one instrument answering both is how they come to
   * disagree. Per stage by construction (src/trend.js's accuracy law).
   *
   * On a RESUME it is SEEDED with the grades the dead leg recorded, so both halt
   * readouts judge the whole chain rather than this leg alone: a leg that re-grades
   * an unchanged tree is flat on its own evidence while the RUN — the thing the human
   * is deciding about — may have been converging when its allowance ran out. Cold, the
   * seed is empty and this is byte-identical to the pre-resume reader. */
  const runTrend = createTrend({ stageOrder: stagedClose.map((/** @type {any} */ s) => s.name), seed: resumeGrades });
  /** the run-level MONEY record, one shape wherever the wallet stops the run —
   * W-2's `emitWallHalt` in a money coat, and deliberately its mirror image. hamr's
   * ruling for TIME was "keep the grade we already have and stop"; a money cut is
   * the same stop with a different allowance behind it, so it keeps the same grade,
   * states the same kind of trend, and hands over the same shape of lever list.
   * `spentUsd` is NOT re-derived here: runJob's ledger owns that number and states
   * it on `job-end` (F6 — a second, weaker arithmetic for the same figure is how
   * two instruments come to disagree about one run's money). What this record can
   * say exactly is the SIGNED ceiling and what is left against it. */
  const emitMoneyHalt = (/** @type {object} */ extra) => {
    const t = runTrend.verdict();
    return emit('money-halt', {
      meaning: 'not under cap — not "can\'t"',
      budgetUsd: job.budgetUsd,
      remainingUsd: remainingUsd(),
      // …and whether that figure is EXACT. `remainingUsd` is `budget − spent`, so a run
      // whose spend is a FLOOR has a remaining that is a CEILING, and quoting it bare to
      // four decimals reads as the number. The four causes live in the ledger one level
      // up (unpriced, self-healed stall, mid-call cut, an inherited floor), which is why
      // this is READ from there and not re-derived here — a second, weaker arithmetic for
      // the same question is how two instruments come to disagree. `emitWallHalt` has
      // carried its honest bound since W-2; this is the same duty on the money side.
      spendComplete: spendComplete(),
      verdict: lastCloseVerdict?.verdict ?? null,
      ...(lastCloseVerdict?.stage ? { stage: lastCloseVerdict.stage } : {}),
      trend: t.trend,
      motion: t.motion,
      reading: t.reading,
      lever: t.lever,
      series: t.series,
      options: MONEY_OPTIONS,
      ...extra,
    });
  };
  /** WHAT THIS RUN MOVED, read once and read the same way for both screens a
   * person can arrive at (the pause and the review door). An unreadable set comes
   * back as its own `stop` rather than an empty list, so the caller can say
   * UNKNOWN instead of "nothing changed" (F6), and the cap is applied here so the
   * two screens cannot drift apart on how much they show.
   * @returns {Promise<{cs: any, paths: string[], shown: string[]}>} */
  const changedEvidence = async () => {
    const cs = declaredCtx ? await changedSet(workdir, declaredCtx.seedRef) : { stop: 'no seed', paths: [] };
    const paths = cs.stop === null ? cs.paths : [];
    return { cs, paths, shown: paths.slice(0, PAUSE_CHANGED_CAP) };
  };

  /**
   * THE PAUSE (N4 §1.3/§1.4, rulings 1 and 2) — a decision-ready checkpoint, and
   * never a bare "approve?". What the person is shown is assembled here rather
   * than by whatever surface renders it: every mechanical stage's own result, the
   * question the close itself declared, and the set of files this run changed.
   *
   * The changed set is the "before/after" half, at the granularity a library can
   * state honestly — WHICH files moved. Rendering the lines belongs to the
   * surface that has a screen; carrying the list is what makes the surface's job
   * possible without it re-deriving the run's own facts.
   * @param {any} v the close verdict that paused @returns {Promise<void>}
   */
  const emitHitlPause = async (v) => {
    const { cs, paths, shown } = await changedEvidence();
    emit(HITL_PAUSE, {
      stage: v.stage ?? null,
      ask: v.ask ?? null,
      decisionReady: true,
      // ruling 2: the whole evidence package, never a bare "approve?"
      stages: v.stages ?? [],
      changed: {
        paths: shown,
        // the trim is ANNOUNCED (F28), and an unreadable set is UNKNOWN, never
        // an empty list dressed as "nothing changed" (F6)
        ...(paths.length > shown.length ? { more: paths.length - shown.length } : {}),
        ...(cs.stop === null ? {} : { unreadable: scrub(String(cs.stop)) }),
      },
      decision: `The close reached its human stage and is waiting on you: ${v.ask ?? 'review the result'}`,
      options: [...HUMAN_DECISIONS],
      meaning: 'not a verdict — the run is paused, the clock is stopped, and the last thing it did stands until you answer',
    });
  };

  /**
   * THE REVIEW DOOR (softgreen module 8, PRD v1.71 §3) — the pause machinery one
   * level out: a run that reaches a VERDICT-BEARING terminal offers the person the
   * same three doors, off the same evidence package, at the end of every run the
   * door is open for.
   *
   * THE LAW, hamr verbatim: *"it's important not to change the loop self verdict."*
   * This writes a RECORD and returns nothing. The caller's very next statement is
   * `return 'green'` / `return 'already-green'` — unchanged, unconditional, and
   * pinned by test. The close mints the verdict; the door records a disposition,
   * and `src/reviewdoor.js` is where a person's answer is applied, later, off this
   * record. Nothing here waits, blocks, or spends: a green run that is never
   * answered is still a green run.
   *
   * WHICH RUNS: always the classes whose credit is HELD (soft-green — module 6's
   * quarantine has no other release), and otherwise only when the operator asks
   * (`reviewDoor`). `doorOpens` owns that question, in one place.
   * @param {string} outcome the verdict the close minted @param {any} v that close verdict
   */
  const emitReviewDoor = async (outcome, v) => {
    if (!doorOpens(job, reviewDoor)) return;
    const cls = job?.verdictType ?? 'green';
    const held = quarantinesCredit(cls);
    // the same evidence a pause carries, assembled by the same helper — one
    // assembly of one run's facts, however the person arrives at it
    const { cs, paths, shown } = await changedEvidence();
    emit(REVIEW_DOOR, {
      outcome,
      verdictType: cls,
      // …and whether this run's credit is being HELD pending the answer. Read from
      // the ONE place that decides it (module 6), never re-spelled here.
      quarantined: held,
      stages: v?.stages ?? [],
      // the stages an `accept` will RE-RUN, named up front: the person is told what
      // their answer is about to be checked against before they give it
      mechanical: mechanicalStages(stagedClose).map((/** @type {any} */ s) => s?.name ?? null),
      changed: {
        paths: shown,
        ...(paths.length > shown.length ? { more: paths.length - shown.length } : {}),
        ...(cs.stop === null ? {} : { unreadable: scrub(String(cs.stop)) }),
      },
      decisionReady: true,
      decision: `The close minted ${outcome} and it STANDS. What happens to the work is yours: accept it, rerun it with your own words as the gap, or pause and come back.`
        + (held ? ' This green was rendered by the judged floor, so it has earned no reuse until you accept it.' : ''),
      options: [...HUMAN_DECISIONS],
      meaning: 'not a verdict — the verdict is already minted and nothing an answer does can change it; this records a disposition',
    });
  };

  /** the close, as ONE verdict: every stage in order, first red wins */
  const judgeClose = async () => {
    const v = await runCloseStages(stagedClose);
    closeStage = v.stage;
    lastCloseVerdict = v;
    // Only a RED grade is a reading. A `satisfied` ends the run and a close FAULT
    // rendered no judgment at all (CLOSE_FAULTS) — folding either into the series
    // would put a non-number where the instrument expects a graded one.
    // `closeGrade` is the reader's input for EITHER executor: a command close
    // hands over its gap and `readGrade` scrapes the stage and the count out of
    // it; a declared close already KNOWS both and says them, rather than
    // round-tripping a number through prose it would then have to parse back.
    if (v.verdict === 'needs_revision') runTrend.record(closeGrade(v));
    return v;
  };

  // ── 0c. THE WORK BRANCH — the HARD RULE (PRD Addendum v1.57 §3, hamr):
  // *"The agent creates a NEW BRANCH before it touches any code — a HARD RULE, no
  // exceptions. Not a default, not a preference: no job edits the branch it was
  // handed, and none edits `main`."*
  //
  // ONE SEAM, TWO PLACEMENTS. The split is COLD vs RESUME, and every half of it is
  // ruled rather than convenient:
  //
  //  * BEFORE the scout on BOTH paths, the scout being the run's first PAID call. A
  //    patient that is not a git checkout, a namespace with no free name, a resume
  //    whose branch a human deleted — each is an instrument stop that must cost zero
  //    tokens, and a branch prepared after the scout would already have bought one.
  //  * COLD: AFTER the precheck and the preflight, which are $0 and deterministic.
  //    An ALREADY-GREEN tree returns below without ever reaching the seam and leaves
  //    no branch behind: a run with no work to do has no blast radius to bound, and
  //    minting a branch for it would litter every patient with the record of a run
  //    that did nothing.
  //  * RESUME: BEFORE them — here, above 0*. There is nothing to mint on a resume
  //    (the recorded branch exists, `created:false`, and the arm below refuses
  //    rather than creating), so the leave-no-branch-behind clause has nothing to
  //    say; what IS at stake is WHICH TREE the $0 instruments measure. The recorded
  //    branch holds the work the operator already paid for and IS the run being
  //    continued, while the ref the operator handed back can be anything at all. Run
  //    from where the run happens to stand, the precheck could read `already-green`
  //    off a tree that is not this run's and every `baseline: "seed"` stage would
  //    baseline against it — an instrument measuring the wrong subject, reading
  //    honestly and saying nothing true. Moving the seam up is also strictly cheaper
  //    for the failure case: a resume whose branch is gone or foreign now stops
  //    before the arbiter grades anything at all.
  //
  // The scout itself needs no branch and is not what this gates: its menu simply
  // has no write-class verb in it (the menu IS the grant), so it cannot touch code
  // wherever it stands. What the branch gates is the WRITE-CAPABLE phase, and that
  // gate is enforced structurally rather than by this ordering — `mkWorker` refuses
  // to build a `writable` worker while `workBranch` is null (below). Ordering says
  // where the honest stop happens; the guard says the rule cannot be bypassed.
  //
  // Creating a branch at HEAD moves no commit and changes nothing the close can
  // measure: the declared seed is HEAD either way, and the tree — dirty or clean —
  // is carried across untouched.
  /** @type {string|null} the branch this run's work lands on, once it exists */
  let workBranch = null;
  /** is this leg continuing work that already exists? Spelled EXACTLY as
   * `prepareWorkBranch`'s own resume test, so the two cannot disagree about which
   * arm a given input takes. */
  const resuming = resumeBranch !== null && resumeBranch !== undefined;
  /**
   * 0c itself — ONE definition for both placements. The refusal below is written
   * once on purpose: two call sites emitting their own branch-red would be two
   * messages free to drift apart, and this one is what a human reads when a run
   * stops having spent nothing.
   * @returns {Promise<'branch-red'|null>} the terminal to return, or `null` once the
   *   run is standing on a branch nobody handed it
   */
  const prepareBranch = async () => {
    const wb = await prepareWorkBranch(workdir, { name: workBranchName(job), resume: resumeBranch ?? null });
    if (wb.stop !== null) {
      // Never a fallback to the handed branch. That fallback IS the thing the rule
      // forbids, and a run that silently took it would report a green whose blast
      // radius nobody bounded — so this is a named terminal of its own rather than
      // a wiring fault (`interpreter-red` aims an upstream ask at a library; a
      // patient that is not a git checkout is the operator's own state speaking).
      emit('escalation', {
        category: 'branch-red', decisionReady: true,
        decision: 'The run could not create its own work branch, and no job runs on the branch it was handed (PRD v1.57 §3). Nothing was spent.',
        options: [
          'make the patient a git checkout with at least one commit',
          'free the work-branch name (delete or rename the stale branches this run collided with)',
          'abandon the run',
        ],
        detail: scrub(wb.stop),
      });
      return 'branch-red';
    }
    workBranch = wb.branch;
    // The run's own books say where its work went. A human reading a spine — or a
    // resume reading it back (`readResume`'s `restart.branch`) — must not have to
    // re-derive the name from the spec and guess how many collisions there were.
    emit('work-branch', {
      branch: wb.branch,
      created: wb.created,
      resumed: wb.resumed,
      from: wb.from,
      base: wb.base,
      repo: wb.repo,
      ...(wb.collided > 0 ? { collided: wb.collided } : {}),
      meaning: wb.resumed
        ? 'returned to the branch this run was killed on — its work is on this branch, and a fresh one would strand it'
        : 'the HARD RULE (PRD v1.57 §3): the run works here, never on the branch it was handed and never on main',
    });
    return null;
  };
  if (resuming) {
    const stop = await prepareBranch();
    if (stop !== null) return stop;
  }

  // ── 0*. the DECLARED close's two run-start facts. Both are $0 and both sit
  // INSIDE the clock (they are the arbiter's own instruments, and time the
  // operator's instruments too or the budget measures a different run).
  //
  //  (1) THE SEED (D8/D12). HEAD at run start, READ and recorded, never typed.
  //      The close stores the counting RULE and never the number, so every
  //      `baseline: "seed"` stage is measured against THIS run's own starting
  //      point — a constant frozen at signing would judge run 5 against run 1's
  //      tree, which is the one-experiment shape D12 retires.
  //
  //  (2) THE GROUNDED RE-VALIDATION (D9 gate 1). The job validator judged the
  //      declaration with no repository in hand, so hamr's listing rule and the
  //      scoped-job derivation that arms the F84 one-population law were
  //      DEFERRED, not skipped. They run here, against the real seed tree,
  //      before any stage and before any token. A declaration that names a path
  //      the tree does not have is a broken close, not a red about the worker —
  //      round 2's arm A invented `src/alertEmail.js` and silently reclassified
  //      15 real errors into the wrong population.
  if (declared) {
    const s = await seedAtHead(workdir);
    if (s.stop !== null) {
      emit('escalation', {
        category: CLOSE_FAULTS.failed.category, decisionReady: true,
        decision: `The authored close measures against this run's own seed, and the seed could not be read. ${CLOSE_FAULTS.failed.decision}`,
        options: ['check the repository is a git checkout with at least one commit', ...CLOSE_FAULTS.failed.options],
        detail: scrub(s.stop),
      });
      return 'close-red';
    }
    const listed = await seedListing(workdir, s.seedRef);
    const v = listed.stop === null
      ? validateCloseDecl(job.closeDecl, { at: 'closeDecl', listing: listed.files, verdictType: job.verdictType })
      : { ok: false, grounded: false, reds: [{ code: 'listing-unreadable', path: 'closeDecl', detail: listed.stop }] };
    emit('close-decl', {
      genre: job.closeDecl.genre,
      lang: job.closeDecl.lang,
      seedRef: s.seedRef,
      stages: stagedClose.map((/** @type {any} */ st) => st.name),
      grounded: v.grounded,
      ok: v.ok,
      ...(v.ok ? {} : { reds: v.reds.map((/** @type {any} */ r) => ({ ...r, detail: scrub(String(r.detail ?? '')) })) }),
    });
    if (!v.ok) {
      emit('escalation', {
        category: CLOSE_FAULTS.failed.category, decisionReady: true,
        decision: 'The authored close does not validate against the repository it is about to judge — a path it names, '
          + 'or a population it counts, does not match the seed tree. Nothing it rendered would be trustworthy.',
        options: ['re-author the close against this repository (a new declaration is a new spec hash, and needs re-signing)', ...CLOSE_FAULTS.failed.options],
        detail: v.reds.map((/** @type {any} */ r) => `${r.code}:${r.path}${r.detail ? ` — ${scrub(String(r.detail))}` : ''}`).join('\n'),
      });
      return 'close-red';
    }
    declaredCtx = { seedRef: s.seedRef };
  }

  // ── 0a. close precheck (close-first, F17): already-green is a DISTINCT
  // record, zero tokens; a forbidden-zone verdict escalates before any spend
  const pre = await judgeClose();
  emit('close-precheck', { ...pre });
  // …and if a signer's `accept` is what greened the human stage, it is PAID FOR:
  // the answer was applied to the tree they were shown, and no later leg may hold
  // it over a tree they have not seen (F102's persistence must never become a
  // decision that outlives its evidence).
  if (pre.verdict === 'satisfied') {
    // ── THE RERUN DOOR REFUSES THIS SHORTCUT (module 8). A tree that already
    // passes the close is EXACTLY the state the person rejected when they took the
    // rerun door: returning `already-green` here would answer "go again" with "there
    // is nothing to do", spend nothing, and hand back the verdict they just declined
    // to take. So the run proceeds — a plan is drafted with their words in it, the
    // work happens, and the close judges it again at the end, as it judges everything.
    if (doorWords === null) { spendRuling('accepted'); await emitReviewDoor('already-green', pre); return 'already-green'; }
    emit('door-rerun-open', {
      fromRunid: doorWords.fromRunid,
      meaning: 'the close is already satisfied and the run continues anyway — the signer asked for different work, not for a re-grade of the same work',
    });
  }
  // …and the pause's own arm of the same gate. Reaching a human stage HERE means
  // every mechanical stage already passes on the untouched tree: the machine half
  // of this job is done and the only thing left is a person. Pausing costs $0 and
  // is the honest answer; running a plan first would spend a budget to arrive at
  // exactly this question. No `planExecuted` — there is no plan yet, and an empty
  // one on the spine would be a record of work nobody did.
  if (pre.verdict === HUMAN_PAUSE) { await emitHitlPause(pre); return HITL_PAUSE; }
  const preFault = Object.hasOwn(CLOSE_FAULTS, pre.verdict) ? CLOSE_FAULTS[pre.verdict] : undefined;
  if (preFault) {
    emit('escalation', { category: preFault.category, decisionReady: true, decision: preFault.decision, options: preFault.options, detail: pre.detail });
    return 'close-red';
  }

  // ── 0b. check preflight ($0, deterministic): every OFFERABLE stage runs once
  // before tokens — an unrunnable ruler would fault mid-plan after real spend (a
  // frozen rule without a wired detector is prose; here the detector runs
  // first). Red and green are both fine: checks decide nothing and mint nothing.
  // The menu is DERIVED from the close (PRD v1.28) — nobody authored it, so the
  // ruler and the real inspection cannot drift apart.
  const menu = checkMenu(stagedClose);
  /** Rule A-v2's fact: check names RED at preflight (seed-red). A seed-red
   * check is the GOAL, not a guard — validatePlan confines it to the final
   * write step, and the drafting prompt states the same law. Recorded HERE,
   * from the same preflight the spine records, never re-derived mid-run: the
   * rule is defined on the SEED verdicts (a check a step turned green mid-run
   * is still the goal the plan exists to flip).
   * @type {string[]} */
  const seedRed = [];
  emit('check-menu', {
    offered: menu.map((m) => m.name),
    ...(menu.length < stagedClose.length
      ? { hidden: stagedClose.filter((s2) => s2.offer === false).map((s2) => s2.name), meaning: 'a stage that cannot stand alone as a ruler (a precondition) is not offered — a partial menu is acceptable, never a failure' }
      : {}),
  });
  for (const m of menu) {
    const v = await runCloseStages(m.run);
    if (v.verdict === 'needs_revision') {
      seedRed.push(m.name);
      // …and the preflight grade is a READING, for the same reason the precheck one
      // above is: it is the seed the run's work is measured against. The precheck
      // only ever reds at the close's FIRST failing stage (first-red-wins), so on
      // every shipped close — each of which opens with `changed-from-seed` — the
      // numeric stages have no baseline at all without it. A step's first grade
      // would then have nothing to compare against and the whole run would read
      // `unknown` on exactly the stop the readout exists for.
      //
      // ONCE PER STAGE, though. The precheck and this loop grade the SAME unchanged
      // tree back to back with no work in between, so a stage both reach reports the
      // same number twice — and a repeated baseline in a series reads as an attempt
      // that achieved nothing (`verdict 2 → 2 → 1`). That is a phantom flat step
      // handed to a human and to the replanner, which is the exact class of false
      // story this change exists to remove. Asked of the reader's own books, so
      // there is no second record of what has been graded.
      if (!runTrend.report().stages.some((s) => s.stage === v.stage)) runTrend.record(closeGrade(v));
    }
    emit('check-preflight', { name: m.name, verdict: v.verdict, ...(m.run.length > 1 ? { chain: m.run.map((s2) => s2.name) } : {}) });
    const f = Object.hasOwn(CLOSE_FAULTS, v.verdict) ? CLOSE_FAULTS[v.verdict] : undefined;
    if (f) {
      emit('escalation', { category: f.category, decisionReady: true, decision: `Close stage "${m.name}" rendered no judgment at preflight — every plan referencing it would fault mid-run. ${f.decision}`, options: f.options, detail: `${m.name}: ${v.detail ?? ''}` });
      return 'check-red';
    }
  }

  // ── 0c, COLD. The seam and both halves of its placement ruling are stated
  // above, where a RESUME reaches it; this is where a run that is NOT resuming
  // does — after the $0 precheck and preflight, so an already-green tree has
  // already returned and left no branch behind.
  if (!resuming) {
    const stop = await prepareBranch();
    if (stop !== null) return stop;
  }

  const lc = new LiteCtx({ root: workdir });
  const ceiling = Array.isArray(job.tools) ? job.tools : [...TOOL_MENU];
  const fencePrefixes = job.writeScope.map((/** @type {string} */ g) => resolve(workdir, globToPrefix(g)));
  const auditPath = join(workdir, GATE_AUDIT_FILE);
  const chainByName = new Map(menu.map((m) => [m.name, m.run]));
  // Choose-don't-describe (§4): the offered `tree-changed` scopes, enumerated from
  // the signed fence plus the directories that actually exist beneath it. ONE menu
  // object feeds both the drafting prompt and the validator, so what was offered
  // and what is accepted can never drift apart. Discovery is best-effort — a
  // missing or unreadable fence directory degrades to the signed entries alone
  // (which `snapshotScope` already handles as an empty snapshot), never a throw.
  const discoveredDirs = job.writeScope.flatMap((/** @type {string} */ g) => {
    const prefix = globToPrefix(g);
    try {
      return readdirSync(join(workdir, prefix), { recursive: true, withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => `${prefix}/${relative(join(workdir, prefix), join(d.parentPath ?? d.path, d.name))}`);
    } catch { return []; }
  });
  const scopeMenu = legalScopes(job.writeScope, discoveredDirs);
  // No silent caps: MAX_SCOPE_MENU can drop deep directories, and a menu that
  // reads as complete when it is not is the blind-instrument class. Report BOTH
  // counts so a truncation is visible in the record rather than inferred.
  const offerable = legalScopes(job.writeScope, discoveredDirs, Infinity).length;
  emit('scope-menu', {
    offered: scopeMenu,
    ...(offerable > scopeMenu.length
      ? { truncated: true, offerableCount: offerable, cap: MAX_SCOPE_MENU, meaning: 'deep directories were dropped from the menu; they remain reachable via a parent scope' }
      : { truncated: false }),
  });

  /** the check-passes seam evalExits delegates to: the FULL runClose machinery
   * per signed check; a forbidden-zone verdict rides out as `fault` by name so
   * the micro-loop escalates (or F32-routes a crash) instead of faking a gap */
  const runCheck = async (/** @type {string} */ name) => {
    const chain = chainByName.get(name);
    // UNREACHABLE through runPlan and deliberately kept: validatePlan reds
    // `check-unknown` against `checkMenu(spec.close)` — the SAME derivation that
    // built this map from the SAME close — so a name that got here was already
    // proven to be on the menu. Defence in depth against a future second
    // derivation, not a live path; the reachable guard is the validator's, and
    // that one is mutation-covered.
    if (!chain) return { pass: false, fault: 'failed', gap: `no offered close stage named "${name}"` };
    const v = await runCloseStages(chain);
    emit('check-run', { name, verdict: v.verdict, ...(v.stage && v.stage !== name ? { stage: v.stage } : {}), ...(v.exitCode !== undefined ? { exitCode: v.exitCode } : {}) });
    if (v.verdict === 'satisfied') return { pass: true };
    if (v.verdict === 'needs_revision') {
      // The run trend is fed by EVERY grade the arbiter renders, and a check IS an
      // arbiter-rendered close grade: the same `runStages`, the same chain, the same
      // stage names, so it lands in the same per-stage buckets and the accuracy law
      // holds unchanged. Without this the reader is blind to everything a STEP ever
      // achieves — it sees only the precheck and the outer fix loop — which is why
      // u-msh70zla's meter, firing mid-step, had nothing to report about a step that
      // had just gone 24 → 15 → 14.
      //
      // Folded HERE, on `v.gap`, and the seam is load-bearing: `evalExits` wraps this
      // gap as `check "<name>" red: …`, and THAT line carries the word "red" with no
      // number on it, so `readGrade` reads the wrapper instead of the wall and every
      // step grade donates a null. Measured on u-msh70zla's own archived gaps: raw
      // reads `typecheck 24 → 15 → 14`, wrapped reads nothing at all. Same seam the
      // Layer R note below already calls out for a check's `^`-anchored gapKeep.
      runTrend.record(closeGrade(v));
      return { pass: false, gap: v.gap };
    }
    return { pass: false, fault: v.verdict, gap: v.detail };
  };

  /** the last escalation ralph emitted — the replan trigger reads its category
   * (only exhaustion replans; an instrument stop stays a stop) */
  let lastEscalation = /** @type {any} */ (null);
  /** @type {(type: string, data?: object) => object} */
  const emitL = (type, data) => { if (type === 'escalation') lastEscalation = data; return emit(type, data); };

  /**
   * Assemble one bounded worker: fresh Gate (the fence, the arbiter's books
   * denied, the wallet as its budget), granted tools only (the menu IS the
   * grant), per-attempt round bound via loop.stop() (F20), every round metered
   * with a phase label (F12).
   * @param {{granted: string[], phase: string, attemptRounds: number, attempts: number|null, writable: boolean, root?: ReturnType<typeof createRoot>|null, fence?: string[]|null, workerProvider?: any}} o
   *   `root` (Layer R): when present, the worker's write-class actions are teed
   *   for the within-run ratchet — staged before the gate decides, discarded on
   *   deny/halt, settled to landed-or-not after execution (the two axes, F43/F7).
   *   Wired ONLY on the Loop path: the native session exposes no onToolResult seam.
   *
   *   `attempts` is how many iterations this worker will be asked for. `null` is the
   *   STRIKE LADDER (src/ladder.js), where that count does not exist by design — see
   *   the turn-allowance note below.
   */
  async function mkWorker({ granted, phase, attemptRounds, attempts, writable, root = null, fence = null, workerProvider = null }) {
    // THE HARD RULE, ENFORCED STRUCTURALLY (PRD v1.57 §3). This is the ONE seam
    // that grants write-class verbs — `writeScope` is empty for every other
    // worker, so a read-only phase cannot reach a file whatever it intends — and
    // a branch is therefore a PRECONDITION of it, not a courtesy the ordering
    // above happens to provide. "No exceptions" has to mean the rule survives a
    // future caller who adds a third writable worker and forgets the ordering.
    //
    // Unreachable through `runPlan` as it stands (0c runs before the scout and
    // returns `branch-red` on any fault), which is exactly what a backstop should
    // be. Categorised so it lands as the wiring fault it is: the step site and
    // `relay` both return `interpreter-red` verbatim, so the escalation a human
    // reads and the outcome the spine records name the same thing.
    if (writable && workBranch === null) {
      const err = /** @type {any} */ (new Error(
        `HARD RULE (PRD v1.57 §3): a write-capable worker was requested for phase "${phase}" with no work branch prepared — `
        + 'no job edits the branch it was handed. The run is refused rather than allowed to write where it stands.',
      ));
      err.category = 'interpreter-red';
      err.lib = 'bareloop';
      throw err;
    }
    /**
     * The gate's LLM-turn allowance THROUGH iteration `i` — the old expression
     * `attemptRounds * (attempts + 1)` with the iteration count made explicit
     * (`i = attempts` reproduces it exactly, so a bounded worker is unchanged to
     * the number).
     * @param {number} i
     */
    const turnsThrough = (i) => attemptRounds * (i + 1);
    // A pre-multiplied ceiling could only ever pre-pay a KNOWN iteration count, and
    // the strike ladder has none: iterations float under money and the wall. So on
    // that path the allowance is GRANTED PER ITERATION at `setIteration` — the seam
    // that already resets the per-iteration round counter — leaving the belt exactly
    // as tight per iteration as the pre-multiply made it, without inventing a
    // ceiling nobody signed. It is monotonic (`Math.max`), so nothing can lower it.
    //
    // Rebuilding the Gate per iteration was the alternative and was REJECTED: the
    // audit is run_id-scoped, so a fresh gate would reset F32's crash-attribution
    // write set ("files you have written this run") and Layer R's cross-attempt
    // write history to a single iteration — two instruments broken to avoid one
    // addition. The REAL per-iteration bound is unchanged either way: `loop.stop()`
    // at `roundsThisAttempt >= attemptRounds` (the `wasBounded` mechanism).
    const maxTurns = turnsThrough(attempts ?? 1);
    const gate = new Gate({
      fs: {
        // P: a step's `scope` narrows the fence — the per-step prefixes are always a
        // SUBSET of the signed fence (validator: scope ∈ the same menu tree-changed
        // uses), so this can only tighten, never widen
        writeScope: writable ? (fence ?? fencePrefixes) : [],
        readScope: [workdir],
        deny: [auditPath, ...ARBITER_BOOK_STORES.map((s) => join(workdir, s))],
      },
      budget: { maxCostUsd: Math.max(remainingUsd(), 0.0001) },
      limits: { maxTurns },
      audit: { path: auditPath },
      // The gate audit is the THIRD persistent, append-only channel (beside the
      // spine and the ctx-verb events) and it lives IN THE TREE, so it gets the
      // SAME ONE inventory. bareguard's default-on backstop covers only
      // apiKey/authorization/`Bearer …`/`sk-…` — measured: a `ghp_` token landed
      // in cleartext through every model-authored identifier the action carries
      // (an isolate verb's `id`, a path the worker spelled), and masked under
      // these patterns. Content is already unreachable here (`toolAction` reduces
      // a write to `{bytes}`), but the identifiers are raw model text, and a log
      // that captures a key captures it forever.
      secrets: { patterns: SECRET_PATTERNS },
      humanChannel: async () => ({ decision: 'terminate' }),
    });
    await gate.init();
    // F32's instrument, run_id-scoped, write AND edit, allow-decision only —
    // the same audit read as interpret's (never git status, F45). ONE scan and ONE
    // filter behind both readings: a future write-class verb that slipped into one
    // and not the other would make the two instruments disagree about what a write
    // is, which is the exact class the tee's `type`-not-name test exists to close.
    const auditWrites = () => {
      const paths = new Set();
      let records = 0;
      try {
        for (const line of readFileSync(auditPath, 'utf8').split('\n')) {
          if (!line) continue;
          let rec;
          try { rec = JSON.parse(line); } catch { continue; }
          if (rec.run_id === gate.runId && rec.phase === 'gate' && rec.decision === 'allow'
              && (rec.action?.type === 'write' || rec.action?.type === 'edit')
              && typeof rec.action.path === 'string') { paths.add(rec.action.path); records += 1; }
        }
      } catch { /* no audit yet → nothing written yet */ }
      return { paths: [...paths], records };
    };
    const workerWrites = () => auditWrites().paths;
    /**
     * The ladder's write signal: the cumulative RECORD count, never the path set.
     * A plan step rewrites its one target every attempt, so the path set is constant
     * after iteration 1 and a set-delta would read every later iteration as idle —
     * the same Finding-3 trap Layer R documents, and it would strike a working
     * worker out on its second attempt. The record count advances on every allowed
     * write-class action, same path or not.
     */
    const writeCount = () => auditWrites().records;
    // Layer R tee (design record 2026-07-19; created per-step by executeStep).
    // The translator STAGES write/edit content and snapshots the pre-write hash
    // BEFORE the gate decides (Finding 6); the policy wrapper DISCARDS on a deny
    // or a halt (the tool never runs); onToolOutcome SETTLES landed-vs-not after
    // execution (Finding 7 — the gate's allow is intent, the file is outcome).
    // All no-ops when root is null: every scout/drafter and every native worker.
    const fileHash = (/** @type {string} */ p) => {
      try { return createHash('sha256').update(readFileSync(p)).digest('hex'); } catch { return null; }
    };
    /** @type {{path: string, content: string, type: string, before: string|null}|null} the write-class action awaiting its OUTCOME */
    let pendingProbe = null;
    const teeingTranslator = (/** @type {string} */ n, /** @type {any} */ a) => {
      // classify by action TYPE, never a name list (the workerWrites filter uses
      // the same write|edit test — a third enumeration would let a future
      // write-class verb bypass the tee, the blind-instrument class)
      const act = toolAction(n, a, workdir);
      if (root && (act.type === 'write' || act.type === 'edit')) {
        const path = /** @type {string} */ (act.path);
        const content = String((act.type === 'edit' ? a?.newText : a?.content) ?? '');
        root.stageWrite(path, content); // content read off RAW args, never onto the action (the audit stays bytes-only)
        pendingProbe = { path, content, type: act.type, before: fileHash(path) };
      }
      return act;
    };
    const { policy: gatePolicy, onLlmResult } = wireGate(gate, { actionTranslator: teeingTranslator });
    // Settle the stage on the verdict. A DENY/HALT means the tool never runs, so
    // the outcome seam below never fires for it — discard here (an allow is NOT
    // settled here: the bytes are not written yet; settling on the verdict is the
    // exact Finding 7 defect). The catch RE-THROWS so cap-halt routing still reads
    // the throw. Non-write actions stage nothing, so both settlements are no-ops.
    const policy = root
      ? async (/** @type {string} */ n, /** @type {any} */ a, /** @type {any} */ c) => {
        try {
          const verdict = await gatePolicy(n, a, c);
          if (verdict !== true) { root.discardWrite(); pendingProbe = null; }
          return verdict;
        } catch (e) { root.discardWrite(); pendingProbe = null; throw e; }
      }
      : gatePolicy;
    /**
     * Finding 7 — settle the staged write on what the tool ACTUALLY did. Fires
     * after every tool.execute (bare-agent loop.js), success or error, and tool
     * calls run strictly sequentially, so exactly one probe is ever in flight. A
     * probe that never reaches here (a halt out of a tool body) leaves the stage
     * unsettled — correct: nothing landed, and the attempt boundary drops it.
     * @param {{result?: any}} [info] the tool's return value
     */
    const onToolOutcome = async (info) => {
      if (!root || !pendingProbe) return;
      const { path: p, content, type, before } = pendingProbe;
      pendingProbe = null;
      let after = null;
      try { after = readFileSync(p, 'utf8'); } catch { /* absent → after stays null */ }
      let landed = after !== null && createHash('sha256').update(after, 'utf8').digest('hex') !== before;
      if (!landed && after !== null) {
        // no-byte-change: a write always writes (identical bytes ⇒ content IS the
        // file, exact-equal never substring); a no-op edit is an idempotent apply
        // OR a missed anchor — the tool RESULT is the only honest signal (F2)
        if (type === 'write') landed = after === content;
        else landed = typeof info?.result === 'string' && info.result.startsWith('edited ');
      }
      root.settleWrite(landed);
    };
    /** @type {number|string|undefined} */
    let roundIteration;
    let roundsThisAttempt = 0;
    /**
     * WHICH bound cut the last attempt, and — when the provider recorded one — its
     * reason. A bare iteration number was the whole state here, so three different
     * bounds (round cap, wall, BA-11 deny streak) were indistinguishable to the one
     * consumer that speaks to the worker, which then told every one of them the
     * round cap had run out. The cause travels WITH the iteration because they are
     * read together and can never be allowed to drift apart.
     *
     * `reason` is scrubbed at THIS seam — the boundary, once, before any reader —
     * so no consumer has to remember to do it (the same placement the exit results
     * get in `judge`). It rides the spine event in the same scrubbed spelling: one
     * value, one inventory, and an append-only log is forever.
     * `iteration` mirrors `roundIteration` exactly, undefined included: the bound
     * cannot know a label the run never set, and inventing one here would be the
     * only place in this file that claims to.
     * @type {{iteration: number|string|undefined, cause: 'rounds'|'wall'|'denied', reason: string|null}|undefined}
     */
    let attemptBounded;
    /**
     * Open an iteration: label the rounds, reset the per-iteration round counter,
     * and — on the unbounded ladder only — GRANT this iteration's turn allowance to
     * the gate. Raising `limits.maxTurns` is documented bareguard config read live
     * by `Limits.preCheck()` on every record; the alternative (a fresh Gate per
     * iteration) is the one that breaks instruments, so this is the smaller change.
     * Monotonic by construction: a re-entry can only ever hold the allowance, never
     * lower it. A bounded worker's ceiling is untouched — it was pre-paid in full.
     * @param {number|string} i
     */
    const setIteration = (i) => {
      roundIteration = i;
      roundsThisAttempt = 0;
      if (attempts === null && typeof i === 'number') {
        gate.limits.maxTurns = Math.max(gate.limits.maxTurns, turnsThrough(i));
      }
    };
    const grantedNames = new Set(granted.map((v) => /** @type {Record<string, string>} */ (TOOL_BY_VERB)[v]));
    const shell = createShellTools().tools.filter((/** @type {{name: string}} */ t) => grantedNames.has(t.name));
    // THE READ SHIM (arm-gated, default OFF): a per-worker delivery ledger over the
    // read tool — cap at READ_SHIM_CAP, pointer only once the CURRENT content has been
    // delivered whole, next-unseen-slice otherwise, diff on a changed re-read. WHICH of
    // those are live is the arm (`readShimArm`, Phase 2's A0/A1/A2/A3); off is no wrapper at
    // all. Same seam and the same per-worker lifetime argument as the native cap below:
    // `createShellTools()` above builds fresh tool objects for THIS worker, so the ledger
    // dies with the worker, which is the reset the archive replay segmented on.
    //
    // COMPOSITION ON NATIVE, decided: a CAPPING arm REPLACES the native wrapper, never layers
    // over it. Both bound the same seam at the same 24 KB (READ_SHIM_CAP === NATIVE_READ_CAP,
    // deliberately one number) and both hand back a trusted steer at the same two verbs, so
    // stacking them would truncate twice and append two notices — and worse, the shim on the
    // OUTSIDE would ledger the native wrapper's already-truncated text as the whole file and
    // then answer a re-read with a pointer, which is precisely the lie this module exists to
    // prevent. The shim is the strictly stronger wrapper (it keeps the CLI display bound AND
    // continues where the worker left off), so with a CAPPING arm ON it takes the seam alone.
    // An arm that brings NO cap (A2) is the other case and is handled at the block below —
    // it must not take the native bound away, because losing a bound is not one of its levers.
    const shimArm = readShimArm(readShim);
    // ONE shim per worker, holding ONE ledger, wrapping BOTH seams the cap touches:
    // the read tool below, and `ctx_get`'s stale-pointer answer further down. They
    // are one shim because the cap creates the second problem — its strategy line
    // sends a capped worker to ctx_recall/ctx_get for a whole function, and a stale
    // pointer there is the cap's own dead end, not litectx's.
    const shim = createReadShim({
      arm: shimArm,
      // MEMORY-CACHE: this worker's shim reports into the RUN-level accumulator
      // declared at the top of `runPlan` — one shim per worker, one sum per run.
      onCount: (kind, bytes) => {
        if (kind === 'pointered') memoryCacheCounts.pointered++;
        else memoryCacheCounts.capped++;
        memoryCacheCounts.bytesWithheld += bytes;
      },
    });
    const rdTool = shell.find((/** @type {{name: string}} */ t) => t.name === TOOL_BY_VERB.read);
    // F48: on native, bound shell_read below the CLI's tool-result display cap and hand back a
    // TRUSTED truncation notice steering to ctx_get — the CLI's own truncation blinds the worker
    // (spilled + injection-flagged). Fresh tool objects per mkWorker call, so mutating is per-worker.
    //
    // The condition is the shim's CAP, not the shim: an arm that caps nothing (A2, the diff)
    // takes the native wrapper's cap away from a native run and hands the seam back to the CLI's
    // silent truncation — a REGRESSION against A0 on that surface, produced by a lever that is
    // not about capping at all. So the native bound stays whenever the shim brings none, and it
    // is applied FIRST, INSIDE the shim: the shim's own doctrine is that it ledgers the text the
    // worker actually received (the tool's own maxBytes bound is already handled this way), so a
    // diff against a natively-truncated delivery is a diff against bytes the worker really holds.
    // Outside, it would truncate the shim's diff mid-hunk. Under A1/A3 this block does not run at
    // all, so the order is unobservable there and the composition decision below is unchanged.
    if (native && !shimArm.cap) {
      const rd = rdTool;
      if (rd) {
        const inner = rd.execute;
        rd.execute = async (/** @type {any} */ args) => {
          const r = await inner(args);
          if (typeof r === 'string' && Buffer.byteLength(r, 'utf8') > NATIVE_READ_CAP) {
            const head = Buffer.from(r, 'utf8').subarray(0, NATIVE_READ_CAP).toString('utf8');
            return head + `\n\n[bareloop: file truncated at ${NATIVE_READ_CAP} bytes — this interface will not display more of a single read. To read a specific function IN FULL use ctx_recall(<symbol>) then ctx_get(<pointer>); to find a line use shell_grep(<pattern>).]`;
          }
          return r;
        };
      }
    }
    // …and the shim goes on last, so it is the OUTER wrapper wherever both apply.
    if (shimArm.on && rdTool) shim.wrapRead(rdTool);
    // The stale-pointer serve rides ONLY with a capping arm — `serveStale` refuses
    // on any other arm anyway, and passing the hook regardless would still change
    // A0's `ctx_get` object, which has to stay the untouched baseline.
    const ctx = [...CTX_TOOLS].some((t) => grantedNames.has(t))
      ? createCtxTools(lc, workdir, emitCtx, shimArm.cap ? { onStalePointer: shim.serveStale } : {}).filter((t) => grantedNames.has(t.name))
      : [];
    // LC-3 (litectx 0.31.0): cooperative yield — index() is async but its work is sync CPU,
    // and the default pass holds THIS event loop (the fuse's timers, the wall clock, the lag
    // sampler all live here) for its full duration: measured 4.4s at 4.5% liveness on a
    // 155-file force pass. With yield:true the worst single block measured 189–252ms (n=4),
    // below anything a second/minute-scale timer can perceive. Store output is byte-identical.
    if (ctx.length) await lc.index({ yield: true });
    const toolDefs = [...shell, ...ctx];
    // F19 per VERB (P, corrected 2026-07-31): a strategy SENTENCE rides only with
    // the verb it names. Gating per COMPONENT was close but over-reached — a
    // worker granted only `impact` must not be steered to tools it lacks, and the
    // isolate/retrieval paragraphs named other components' verbs outright. The
    // assembly lives in tools.js beside the prose it composes, and is asserted
    // byte-identical to the full-component paragraphs on a full grant.
    // One bound, one strategy line: with a CAPPING arm on, the shim OWNS the read seam on
    // both surfaces (it replaced the native wrapper above), so it speaks for the cap and
    // the native line stands down — two notices describing one bound is how a worker learns
    // to distrust both. Off, this renders exactly as before.
    //
    // The lines are assembled from the SAME two facts the wrappers were: whichever bound is
    // actually installed speaks for itself, and the arm's own line rides along. A2 on the API
    // surface therefore gets the diff sentence and NOTHING about a 24KB limit — a persona
    // describing machinery that is off is a lie to the worker, and a worker rationing reads
    // against an imaginary cap is a different treatment than the arm names. A2 on native gets
    // both, because on native both bounds really are installed.
    const readLines = grantedNames.has(TOOL_BY_VERB.read)
      ? (native && !shimArm.cap ? NATIVE_READ_STRATEGY : '') + readShimStrategy(shimArm)
      : '';
    const system = PERSONA_TOOLS + strategyFor(granted) + readLines;
    /** @param {any} u @returns {{inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheCreationTokens: number}} */
    const usageOf = (u) => ({ inputTokens: u?.inputTokens ?? 0, outputTokens: u?.outputTokens ?? 0, cacheReadTokens: u?.cacheReadTokens ?? 0, cacheCreationTokens: u?.cacheCreationTokens ?? 0 });

    if (native && toolDefs.length > 0) {
      // ── NATIVE clipipe TOOL session (BA-16): the CLI owns the turn cycle, so
      // the arbiter clips onto the PROVIDER — policy (the SAME wireGate fence,
      // proven to deny out-of-scope), onTurn (metering), maxTurns (the
      // per-session round bound). Money is null per turn and AUTHORITATIVE at
      // session close (the round-level F12 figure the CLI does not expose; the
      // session total is honest — the per-session reconciliation). Only workers
      // WITH tools take this path: a native session with NO tools fires no
      // onTurn and reports no cost (live-verified), so the toolless drafter runs
      // the metered claude-json TEXT path below instead (never unmetered spend).
      /** @param {{costUsd?: number|null, pricing?: string|null, rateSource?: string|null, usage?: any, kind?: string}} arg */
      const nativeMetered = async (arg) => {
        const session = (arg?.kind ?? 'turn') === 'session';
        // per-turn events are ATTRIBUTION ONLY (`worker-turn`, never accounted —
        // a native turn's cost is null BY DESIGN and F6 must not read it as
        // unpriced); the session-close event carries the authoritative cost and
        // IS the one accounted `worker-round` the ledger sums (F12 at the surface
        // the CLI actually meters).
        emit(session ? 'worker-round' : 'worker-turn', {
          phase, iteration: roundIteration, kind: arg?.kind ?? 'turn',
          costUsd: session ? (arg?.costUsd ?? null) : null, pricing: arg?.pricing ?? null,
          // BA-21 provenance. The session event forwards whatever upstream reported; a
          // per-turn event says `null` — the same deliberate statement `costUsd` makes
          // one line up. A native turn is unpriced BY DESIGN (the CLI prices the SESSION),
          // so no rate was consulted and there is no guess to have made. Stated here
          // rather than forwarded because it is OUR fact about this surface, not one the
          // provider payload carries.
          ...(session ? rateSourceFields(arg) : { rateSource: null }),
          tokens: (arg?.usage?.inputTokens ?? 0) + (arg?.usage?.outputTokens ?? 0),
          usage: usageOf(arg?.usage),
        });
        return onLlmResult(arg);
      };
      const provider2 = /** @type {any} */ (nativeProvider)({ policy, onTurn: nativeMetered, maxTurns: attemptRounds, hasTools: true });
      const loop = new Loop({ provider: provider2, system }); // no Loop policy / no cacheMessages: the CLI owns the transcript
      /** @param {string} prompt @param {typeof toolDefs} [defs] */
      /** F59: unavailable on native — a toolless native session fires no onTurn and
       * reports NO cost (F48/BA-16 live-verified), so a recovery round there would be
       * unmetered spend. The caller treats a null return as "no recovery possible". */
      const askFrom = async () => null;
      const ask = async (prompt, defs = toolDefs) => {
        let r;
        try {
          r = await loop.run([{ role: 'user', content: prompt }], defs, { maxTokens: 32000 });
        } catch (e) {
          throw categorize(e).err;
        }
        // a maxTurns session is a BOUNDED attempt, not an escalation — the same
        // role loop.stop() plays on the Loop path: judge the partial work and
        // feed the gap forward (the CLI preserves lastText, BA-5). A DENIAL
        // STREAK is the same shape and takes the same lane (see the Loop path's
        // note below — one doctrine, both surfaces).
        if (r.error) {
          if (r.error === 'max_turns' || r.error.startsWith('denied:')) {
            // the CAUSE is kept, not just the fact: `max_turns` really is the round
            // cap, a `denied:` terminal is the fence, and the next attempt is told
            // which one it was (`boundedNote`)
            const denied = r.error.startsWith('denied:');
            const reason = scrub(r.error);
            attemptBounded = { iteration: roundIteration, cause: denied ? 'denied' : 'rounds', reason };
            emit('attempt-bounded', { phase, iteration: roundIteration, cap: attemptRounds, native: true, reason });
            return r;
          }
          const err = /** @type {CategorizedError} */ (new Error(`native session: ${r.error}`));
          // halt → cap-halt; a bridge/session terminal (bridge-failed,
          // session_timeout, session:*) is provider-owned transport
          err.category = r.error.startsWith('halt:') ? 'cap-halt' : 'provider-red';
          err.lib = 'bare-agent';
          throw err;
        }
        return r;
      };
      return { ask, askFrom, workerWrites, writeCount, setIteration, wasBounded: () => attemptBounded };
    }

    // ── LOOP path: the injected provider (anthropic-api and every other
    // Loop-driven binding), OR — for a native worker with NO tools (the plan
    // drafter) — a claude-json structured-output CLIPipe from the factory. Native
    // tool mode cannot meter a toolless session (no onTurn, no cost); the
    // claude-json TEXT path reports a real per-call cost that the Loop's
    // onLlmResult meters exactly like an API round, so the drafter's spend is
    // never invisible (F6/F44). The gate policy is wired but idle (no tools).
    const loopProvider = native
      ? /** @type {any} */ (nativeProvider)({ policy, maxTurns, hasTools: false })
      : (workerProvider ?? provider);
    // F66 — the stall watchdog. bare-agent's `timeoutMs` bounds socket INACTIVITY,
    // not call duration (provider-http.js `req.setTimeout` resets on every byte),
    // so a connection that stays alive while producing nothing is invisible to it:
    // U run ms3197n8 hung 274 minutes inside ONE call and died ECONNRESET with the
    // bound correctly passed. The heartbeat here is a completed ROUND, which is the
    // one signal that cannot be faked by a live socket. One watch PER WORKER, so
    // the ceiling counts stalls across the step rather than resetting each call.
    // L4 — the watch is handed the run's WALL. Self-heal is what a run does with
    // time left: past the deadline a reissue is spend the run already declined to
    // authorize, and this is the one path no other clock read covers (a stall
    // completes no round and returns from no step, which are the only two places
    // `clock.expired()` is otherwise consulted). Same clock object as every other
    // reader — never a second time source.
    const stallWatch = createStallWatch({
      onStall: (n) => emit('stall', { phase, iteration: roundIteration, stall: n, stallMs: STALL_MS, maxStalls: MAX_STALLS }),
      expired: () => clock.expired(),
    });
    /**
     * ONE Loop PER ISSUED CALL, and every callback on it scoped to that call's
     * generation. After a stall there are TWO calls alive: the abandoned one, whose
     * socket keeps streaming rounds (ms3197n8's lived 274min past the point we moved
     * on), and the reissue. Sharing one Loop between them shares `_stopped`, so a
     * corpse's round bound would cut the LIVE call mid-flight; sharing one callback
     * left the corpse beating the watch that was timing its replacement, which meant
     * the replacement could hang forever without tripping — the fuse feeding itself
     * from the thing it abandoned. A Loop is a plain object over the shared provider,
     * holds no cross-run state (`run()` takes the transcript per call), so one per
     * issue costs nothing.
     *
     * RESIDUAL, documented not fixed: both generations still execute tools through
     * the SAME Gate (`policy`) and the same audit — deliberately, because the audit
     * is what `workerWrites` reads and a per-generation gate would split the run's
     * own books. Concurrent tool calls across a stall therefore interleave on one
     * fence. The fence itself is decision-per-call and order-independent, so the
     * denial semantics hold; what is not modelled is two calls writing the same path
     * in the same window. Latent today (Layer R off, and a stall is rare).
     * @param {number} gen the generation `stallWatch` handed this call
     */
    const newLoop = (gen) => {
      /** @type {any} */
      let self = null;
      /** @param {{costUsd?: number|null, pricing?: string|null, rateSource?: string|null, usage?: any, kind?: string}} arg */
      const metered = async (arg) => {
        // The meter fires for EVERY generation, live or abandoned. An orphaned round
        // was really billed, and spend that no instrument sees is the one thing this
        // repo never ships (F6/F44 — unknown is reported as unknown, never as zero;
        // stall.js says it plainly: a reissue can pay twice, and the wallet is what
        // caps that).
        // F102 — the decision is spent BY THE WORK IT COMMISSIONED. This is the
        // moment a round is really bought for the fix, which is the only moment the
        // human's words have actually reached a worker. A wall or a cap that lands
        // before it leaves the words owed, and the checkpoint carries them on.
        if (phase === 'fix') spendRuling('fix-round');
        emit('worker-round', {
          phase, iteration: roundIteration, kind: arg?.kind ?? 'turn',
          costUsd: arg?.costUsd ?? null, pricing: arg?.pricing ?? null,
          // BA-21 provenance, forwarded verbatim: `pricing` says WHETHER the round was
          // priced, `rateSource` says who stood behind the rate. Reporting only — the
          // pricing-red halt still keys on cost alone (src/run.js).
          ...rateSourceFields(arg),
          tokens: (arg?.usage?.inputTokens ?? 0) + (arg?.usage?.outputTokens ?? 0),
          usage: usageOf(arg?.usage),
        });
        // Everything BELOW here belongs to the live call only. A superseded call must
        // not beat the watch (that is the whole watchdog), must not spend the step's
        // round bound (stall.js: "the step's round bound is untouched" by a reissue —
        // the wallet is what bounds a reissue's spend), and must not announce a bound
        // it cannot own.
        if (!stallWatch.isCurrent(gen)) return onLlmResult(arg);
        // F66 — the heartbeat is ANY result coming back from the model layer, not
        // only a `turn`. The question the watchdog asks is "is the model still
        // answering", and a non-turn result answers it just as well; gating the beat
        // on `kind` would arm a false stall on any round shape we don't enumerate
        // here, which is the blind-instrument class in miniature.
        stallWatch.beat(gen);
        if ((arg?.kind ?? 'turn') === 'turn') {
          roundsThisAttempt += 1;

          // The wall deadline rides the SAME seam as the round bound, because it is
          // the only seam that exists: loop.stop() is read at the round boundary and
          // cannot cut an in-flight call (F61/C1, measured — fired at 500ms, returned
          // at 4,018ms). Stopping here judges the partial work and feeds the gap
          // forward exactly as a round-bounded attempt does — this seam never decides a
          // terminal. Three sites do, each reading the clock with nothing in flight: the
          // step loop after a step returns (between steps), the head of a step's attempt
          // (a step that would BEGIN past the deadline is never funded), and the head of
          // a close-fix iteration (W-2 — the run stops on the verdict already minted).
          if (clock.expired()) {
            attemptBounded = { iteration: roundIteration, cause: 'wall', reason: null };
            emit('wall-bounded', { phase, iteration: roundIteration, ...clock.report(closeTimeoutForReport) });
            self.stop();
          } else if (roundsThisAttempt >= attemptRounds) {
            attemptBounded = { iteration: roundIteration, cause: 'rounds', reason: null };
            emit('attempt-bounded', { phase, iteration: roundIteration, rounds: roundsThisAttempt, cap: attemptRounds });
            self.stop();
          }
        }
        return onLlmResult(arg);
      };
      self = new Loop({ provider: loopProvider, system, policy, onLlmResult: metered, onToolResult: onToolOutcome });
      return self;
    };
    /** @param {string} prompt @param {typeof toolDefs} [defs] */
    /**
     * F59 — continue an EXISTING conversation for exactly one TOOLLESS round.
     * `defs` is `[]`, so text is the only output the model can produce: the summary
     * round is guaranteed by CONSTRUCTION, never requested in prose (F19/F37 — a
     * pacing mandate in the persona was violated 6/6). Meters like any other round
     * (F12); the bound has already fired, so this is a deliberate +1 paid once.
     * @param {any[]} msgs the prior conversation (loop.run's `msgs`)
     * @param {string} prompt
     */
    const askFrom = async (msgs, prompt) => {
      try {
        return await stallWatch.watch((gen) => newLoop(gen).run([...msgs, { role: 'user', content: prompt }], [], { cacheMessages: true, maxTokens: 32000, ...callBounds() }));
      } catch (e) {
        throw categorize(e).err;
      }
    };
    const ask = async (prompt, defs = toolDefs) => {
      let r;
      try {
        r = await stallWatch.watch((gen) => newLoop(gen).run([{ role: 'user', content: prompt }], defs, { cacheMessages: true, maxTokens: 32000, ...callBounds() }));
      } catch (e) {
        throw categorize(e).err;
      }
      // BA-11's deny streak is a BOUNDED ATTEMPT, not a terminal. It is the same
      // shape `loop.stop()` has at the round bound thirty lines up: the attempt
      // ran, produced real work, and was cut short by a governance bound doing
      // exactly its job — the fence HELD, which is the opposite of a fault. So it
      // takes the same lane: judge the partial work, feed the gap forward, the
      // loop continues under unchanged caps. Routing it as a terminal killed a
      // converging run with money and wall left (u-msn227nq). The native surface
      // takes the identical lane above — one doctrine, both surfaces.
      if (r.error && r.error.startsWith('denied:')) {
        const reason = scrub(r.error);
        attemptBounded = { iteration: roundIteration, cause: 'denied', reason };
        emit('attempt-bounded', { phase, iteration: roundIteration, rounds: roundsThisAttempt, cap: attemptRounds, reason });
        return r;
      }
      // the remaining error-return taxonomy (one map, same doctrine as native's):
      // halt → cap-halt, API truncation → provider-red, anything else is wiring
      if (r.error) {
        const err = /** @type {CategorizedError} */ (new Error(`worker loop: ${r.error}`));
        err.category = r.error.startsWith('halt:') ? 'cap-halt'
          : r.error.startsWith('truncated:') ? 'provider-red'
          : 'interpreter-red';
        err.lib = 'bare-agent';
        throw err;
      }
      return r;
    };
    return { ask, askFrom, workerWrites, writeCount, setIteration, wasBounded: () => attemptBounded };
  }

  /** relay a throw from OUTSIDE ralph (scout/plan drafting/fix) as its honest
   * category. Three terminals, never collapsed: the budget gate, the wall clock
   * (F64 — the scout and the drafter run under the same derived call timeout the
   * worker does, so this path needs the same split or it is the blinder route),
   * and transport. */
  const relay = (/** @type {any} */ e, /** @type {string} */ phase) => {
    const { category } = categorize(e);
    const detail = String(e?.message ?? e);
    if (category === 'cap-halt') {
      emit('cap-halt', { category, meaning: 'not under cap — not "can\'t"', detail });
      // v1.46 §2 — the money record rides beside the taxonomy record exactly as the
      // wall's does one line down. Outside the loops there is usually no series yet,
      // and the readout says `unknown` rather than inventing a direction (F6).
      emitMoneyHalt({ phase, cutMidCall: true });
    }
    if (category === 'wall-halt') emitWallHalt({ cutMidCall: true, phase });
    const DECIDE = {
      'cap-halt': [`The budget gate tripped during ${phase} — the wallet cannot fund the plan flow.`, MONEY_OPTIONS],
      'wall-halt': [`The run reached its wall-clock cap during ${phase}. Time ran out, not capability.`, WALL_OPTIONS],
      // A stall OUTSIDE a step (scout, drafting, fix) has no step to replan, so it
      // surfaces — but it is named, never laundered into provider-red. The socket
      // did not fail here; the model stopped answering and reissuing did not help,
      // and those are different diagnoses with different remedies (F45/F48: a
      // casualty is never evidence, and a governance stop is never a casualty).
      'step-stalled': [`The model stopped producing rounds during ${phase} and reissuing the call did not recover it.`, ['retry the run', 'check provider status', 'abandon the run']],
      // A WIRING/INVARIANT fault is not a transport casualty, and the default
      // below would file it as one. The step loop already restores this category
      // verbatim at its own setup site ("the RECORDED outcome must match the
      // escalation the human reads", review #6/F11); the fix loop reached `relay`
      // instead and every such fault came back `provider-red` — a broken runner
      // reported as the provider's fault, and an upstream ask aimed at a library
      // for our own missing wiring (the step-stalled lesson).
      'interpreter-red': [`The ${phase} phase could not be set up — the runner or a primitive it was handed is not correctly bound.`, ['fix the wiring the detail names', 'retry the run', 'abandon the run']],
    };
    const [decision, options] = (Object.hasOwn(DECIDE, category) ? DECIDE[category] : undefined)
      ?? [`The ${phase} call failed (${category}) — no result exists.`, ['retry the run', 'fix the provider binding', 'abandon the run']];
    emit('escalation', {
      category, decisionReady: true, phase, decision, options, detail,
      ...(typeof e?.lib === 'string' ? { lib: e.lib } : {}),
    });
    // `step-stalled` rides out as ITSELF, not as provider-red. Naming the
    // escalation while returning a casualty label would launder a governance stop
    // into transport noise at exactly the layer the readout reads.
    return category === 'cap-halt' || category === 'wall-halt' || category === 'step-stalled' || category === 'interpreter-red'
      ? category : 'provider-red';
  };

  // ── 1. SCOUT — read-only by construction: the write-class verbs are simply
  // not in its menu (the menu is the grant), and its gate fences zero paths
  let scoutBlob = '';
  // RESUME (module C v2): the survey is a PAID unit the killed run already bought, and
  // the plan it briefed is being reloaded rather than re-drafted — so there is nothing
  // left for it to brief. Skipping it is the whole point of the ruling ("why would i
  // want to waste more money on something i already started"), and the skip is a RECORD
  // rather than silence, with the one consequence named on it: the survey text is not on
  // the spine (only its byte count ever was), so a replan after a resume drafts from an
  // empty survey plus its failure brief. Re-scouting to refill it would re-pay exactly
  // the call this exists to save.
  if (resumeSeed) {
    emit('scout-skipped', {
      reason: 'resumed', phase: resumeSeed.phase ?? null,
      meaning: 'the killed run already paid for this survey; its plan is reloaded, not re-drafted. A replan after this point drafts from an empty survey plus the failure brief.',
    });
  } else {
    emit('scout-start', { rounds: scoutRounds });
    try {
      const scout = await mkWorker({ granted: ceiling.filter((v) => !WRITE_VERBS.includes(v) && !STORE_VERBS.includes(v)), phase: 'scout', attemptRounds: scoutRounds, attempts: 1, writable: false });
      scout.setIteration(1);
      const r = await scout.ask([
        'Survey this repository READ-ONLY for the goal below. Report: the relevant layout, the key files and symbols, and your best hypothesis about what the work requires. Be concise — your notes brief a planner that cannot see the repository.',
        `Repository root (absolute): ${workdir}\nEvery path you pass to a tool MUST be absolute and inside this root.`,
        `Goal:\n${job.goal}`,
        pre.gap && `The job's verification is currently failing. Its output on the tree as it stands:\n${pre.gap}`,
      ].filter(Boolean).join('\n\n'));
      scoutBlob = scrub(r.text ?? '').slice(0, SCOUT_BLOB_MAX);
      // F59 — RESERVE the summary round. The round bound is enforced from the
      // metering callback (loop.stop), so a scout still calling tools on its last
      // round is halted mid-tool-use and `text` is empty: it spends the whole
      // allowance exploring and never writes the survey that is its ONLY
      // deliverable. Measured on 15 of 18 archived runs, which then drafted from
      // `(no scout notes)` while still paying ~12% of the run (F55) for the walk.
      // The recovery is one TOOLLESS round on the SAME conversation (`r.msgs`
      // carries the exploration): with no tools offered, text is the only possible
      // output — a mechanical guarantee, never a prose plea to summarise (F19/F37:
      // a pacing mandate in the persona was violated 6/6).
      // The trigger is BOUNDED-and-short, never short alone: a terse survey that
      // finished on its own was not cut off and has nothing to recover. The archive
      // separates cleanly on exactly this pair — every truncated scout was bounded
      // with 0-86 bytes, and the two that finished naturally wrote 5991/8056.
      if (scout.wasBounded() && Buffer.byteLength(scoutBlob) < SCOUT_MIN_BYTES && Array.isArray(r.msgs) && r.msgs.length) {
        emit('scout-truncated', { bytes: Buffer.byteLength(scoutBlob) });
        const s2 = await scout.askFrom(r.msgs, 'You are out of exploration turns. Write your survey NOW, from what you have already read: the relevant layout, the key files and symbols, and your best hypothesis about what the work requires. Text only.');
        const recovered = scrub(s2?.text ?? '').slice(0, SCOUT_BLOB_MAX);
        if (Buffer.byteLength(recovered) > Buffer.byteLength(scoutBlob)) scoutBlob = recovered;
      }
    } catch (e) {
      return relay(e, 'scout');
    }
    emit('scout-result', { bytes: Buffer.byteLength(scoutBlob) });
    // F59 — the LOUD half. `scout-result {bytes: 0}` was emitted faithfully 18 times
    // out of 18 and read by nobody: an instrument that works but has no consumer is a
    // log line, not evidence. A survey that is still empty after its reserved round is
    // now a NAMED condition. It is never a halt — F59's own evidence is that 3 of 5
    // archived greens had an empty scout, so failing the run here would be a worse
    // error than the one being fixed.
    if (Buffer.byteLength(scoutBlob) < SCOUT_MIN_BYTES) emit('scout-empty', { bytes: Buffer.byteLength(scoutBlob), rounds: scoutRounds });
  }
  // F6 in-flight: an unpriced round means the cap cannot govern spend it cannot
  // see — halt at the boundary rather than run the whole plan blind (the caller
  // emits pricing-red; runPlan just stops burning tokens). Legacy halts per-step.
  if (isUnpriced()) return 'pricing-red';

  // ── 2. PLAN — the decompose call; the planner NEVER sees the repo (no tools,
  // scout blob only — what keeps the plan a plan and not a second worker).
  // One shot + one redraft with the reds fed back (the drafting precedent).
  /** draft + validate with one redraft; emits plan-validate per phase. The
   * drafter is built FRESH per call (review #4): its Gate budget snapshots the
   * CURRENT wallet, never a stale pre-execute allocation. A replan draft after
   * the steps have spent is therefore bounded by what is ACTUALLY left, so the
   * total run spend can never exceed the signed budget (advertised == enforced,
   * the hard line) — a drafter built once at full budget would let the replan
   * draft spend against money the steps had already consumed.
   * @param {string} phase @param {string|null} failure
   * @param {string} [progress] the meter's read, replan only (A's adaptation channel) */
  const obtainPlan = async (phase, failure, progress) => {
    const drafter = await mkWorker({ granted: [], phase: 'plan', attemptRounds: 2, attempts: 3, writable: false });
    // The BALANCE, read live at each draft — never a snapshot and never a rate
    // (addendum 2). At draft it is the whole budget (scale); at replan it is what
    // is actually left, which is the adaptation channel.
    const materials = { balanceUsd: remainingUsd(), remainingMs: clock.bounded ? clock.remainingMs() : null, ...(progress ? { progress } : {}) };
    emit('materials', { phase, ...materials });
    // D5 — the bridge rides into the FIRST draft phase ONLY. A replan drafts from the
    // RUN'S OWN STATE (what failed, what is left): re-handing the recipe there would
    // answer the replan's question with the material the run just demonstrated does not
    // work, and would spend the one revision the ceiling allows on a second unmeasured
    // arm. Exactly the rule the execution probe held at the provider seam, moved to where
    // the phase is known rather than inferred from the prompt's own text.
    // The REDRAFT (a validator rejection inside this same phase) keeps it: one red must
    // not silently convert a warm run to a cold one.
    const starting = phase === 'draft' ? startingDraft : null;
    // The shape-lottery facts, gate AND prompt from the ONE object (the scope-menu
    // precedent: what is stated and what is enforced can never drift apart).
    // `seedRed` rides every phase — the rule is defined on the SEED verdicts.
    // `priorChecks` is the REPLAN gate only: the accepted plan's carried checks,
    // which the redraft may move (A-v2 decides where) but never shed (Rule B —
    // u-msdsmkid's replan dropped both checks and "greened" on form alone).
    const checkFacts = {
      seedRed,
      ...(phase === 'replan' && plan
        ? { priorChecks: [...new Set(/** @type {any[]} */ (plan.steps).flatMap((/** @type {any} */ s) => (Array.isArray(s.exit) ? s.exit : []).filter((/** @type {any} */ e) => e?.type === 'check-passes' && typeof e.name === 'string').map((/** @type {any} */ e) => e.name)))] }
        : {}),
    };
    const draftPlan = async (/** @type {any[]|null} */ reds) => {
      drafter.setIteration(reds ? 'redraft' : 'draft');
      const r = await drafter.ask(planPrompt(job, scoutBlob, reds, maxStepRounds, failure, scopeMenu, materials, starting, checkFacts, doorWords?.text ?? null, readShim), []);
      return extractArtifact(r.text).code ?? '';
    };
    // Scrubbed HERE, once, before any consumer reads them — the judge() precedent
    // and the same V8-quoting class it was written for: `parse-error`'s detail is
    // JSON.parse's own message, and V8 quotes a window of the SOURCE inside it (a
    // body of 20 chars or fewer is quoted whole). That source is the DRAFT, which
    // the model wrote, so a red can carry model bytes onto `plan-validate`, onto
    // `plan-red`, and back into the redraft prompt — and the spine is append-only
    // forever (the hard line). The boundary is the right place and not the three
    // emit sites: scrubbing here makes the leak inexpressible, scrubbing each
    // consumer makes it something the next consumer has to remember.
    const validate = (/** @type {string} */ t) => {
      const v = validatePlan(t, { job, maxStepRounds, scopes: scopeMenu, readShim, ...checkFacts });
      return { ...v, reds: v.reds.map((r) => (typeof r.detail === 'string' ? { ...r, detail: scrub(r.detail) } : r)) };
    };
    let text = await draftPlan(null);
    let pv = validate(text);
    emit('plan-validate', { ok: pv.ok, reds: pv.reds, phase: `${phase}-1` });
    if (!pv.ok) {
      text = await draftPlan(pv.reds);
      pv = validate(text);
      emit('plan-validate', { ok: pv.ok, reds: pv.reds, phase: `${phase}-2` });
    }
    return pv;
  };
  let plan;
  /** RESUME: how many leading steps of the reloaded plan are already SATISFIED and are
   * therefore skipped. Zero on every other path, and reset to zero by a replan — the new
   * plan's steps are not the dead plan's steps, even where an id repeats. */
  let skipCount = 0;
  if (resumeSeed) {
    // The plan is RELOADED, not re-drafted — but it is re-validated against the spec that
    // is signed NOW. The dead run validated it against the spec it was signed under, and
    // between the kill and the resume the menu, the fence or the close can have moved
    // (registry/schema drift). A stale plan is refused BY NAME with zero spent; running
    // it would execute a plan the current signature does not admit, which is the one
    // thing no reconstruction is allowed to do.
    // The shape-lottery opts (seedRed/priorChecks) are deliberately NOT passed:
    // they are DRAFTING laws — this gate guards signature drift, and refusing a
    // paid, previously-legal plan over a shape rule minted after its draft would
    // burn the very work resume exists to keep (hamr: "why would i want to waste
    // more money on something i already started"). Omission = rules inactive, by
    // the validator's contract.
    // `readShim` IS passed, unlike the shape-lottery opts above: G1 is not a drafting
    // law about plan quality but a precondition of the machinery that is about to run —
    // a capped worker with no retrieval verb is blind, whether its plan is fresh or
    // reloaded. A plan drafted under the shim already passed it, so the only way this
    // refuses paid work is an operator flipping the flag between legs, which is a spec
    // change deserving the refusal. Off, it is inert, and this line renders as before.
    const pv = validatePlan(resumeSeed.plan, { job, maxStepRounds, scopes: scopeMenu, readShim });
    // scrubbed at the boundary for `validate()`'s own reason: a `parse-error` detail
    // quotes a window of the SOURCE, and the spine is append-only forever
    const reds = pv.reds.map((r) => (typeof r.detail === 'string' ? { ...r, detail: scrub(r.detail) } : r));
    if (!pv.ok) {
      emit('resume-plan-red', { reds, phase: resumeSeed.phase ?? null });
      for (const r of reds) emit('plan-red', r);
      emit('escalation', {
        category: 'plan-red', decisionReady: true, phase: 'resume',
        decision: 'The plan the killed run was executing no longer validates against this job spec, so the resume ran nothing. A reconstruction may re-use a plan; it may never run one the current signature does not admit.',
        options: [
          'rerun WITHOUT --resume (the run drafts a cold plan against the current spec — the killed run\'s steps are then not inherited)',
          'restore the spec version the dead run was signed under and resume again',
        ],
        detail: reds.map((r) => `${r.code}:${r.path}${r.detail ? ` — ${r.detail}` : ''}`).join('\n'),
      });
      return 'plan-red';
    }
    plan = /** @type {any} */ (pv.plan);
    // The skip set is a PREFIX match on the plan's own step ids, never a count: a count
    // would skip whatever happens to sit at that index. Steps run strictly sequentially
    // and idx only advances on a satisfied exit, so the dead run's completions ARE a
    // prefix — and a seed that does not line up stops the skipping there and says so on
    // the record, which re-runs work rather than skipping work nobody did (the safe
    // direction of the two).
    const completed = Array.isArray(resumeSeed.completedSteps) ? resumeSeed.completedSteps : [];
    while (skipCount < completed.length && skipCount < plan.steps.length
      && completed[skipCount]?.id === plan.steps[skipCount].id) skipCount += 1;
    emit('resume-seed', {
      phase: resumeSeed.phase ?? null,
      planSteps: plan.steps.map((/** @type {any} */ s) => s.id),
      completed: completed.map((/** @type {any} */ c) => c?.id ?? null),
      skipping: skipCount,
      ...(skipCount < completed.length
        ? { divergence: `${completed.length} step(s) were completed but only ${skipCount} line up with the reloaded plan in order — the rest are RUN, never skipped on an id that does not match` }
        : {}),
    });
    // this leg's own plan-accepted: R1 mints a bridge version from the plan AS EXECUTED,
    // read back off the spine, so a resumed leg that greens without one would mint
    // nothing. `phase` says where it came from — it was accepted, not drafted.
    emit('plan-accepted', { plan, phase: 'resume' });
  } else {
    try {
      const pv = await obtainPlan('draft', null);
      if (!pv.ok) {
        for (const r of pv.reds) emit('plan-red', r);
        return 'plan-red';
      }
      plan = /** @type {any} */ (pv.plan);
      emit('plan-accepted', { plan });
    } catch (e) {
      return relay(e, 'plan');
    }
  }
  if (isUnpriced()) return 'pricing-red'; // F6: the plan drafting round came back unpriced — halt before steps

  // ── 3. EXECUTE — strictly sequential micro-loops; judge = the exit
  // evaluator through ralph's shell-owned seam; artifacts feed forward (F21)
  /** @type {{id: string, text: string}[]} */
  const artifacts = [];
  /** @type {{id: string, outcome: string}[]} */
  const stepOutcomes = [];
  /** RESUME — the replan ledger the CHAIN has already spent, belted the way every
   * other declared fold entering the arbiter's arithmetic is (`priorSpentUsd`,
   * `priorWallMs`, `declaredRounds`): a garbage or negative seed reads as 0 rather
   * than as a NaN that would poison every later comparison, and a negative one must
   * never cancel a real replan and widen the ceiling (reuse's `> 0` belt, F-4). */
  const seededReplans = typeof resumeReplans?.count === 'number' && Number.isFinite(resumeReplans.count) && resumeReplans.count > 0
    ? Math.floor(resumeReplans.count) : 0;
  // Seeded, not reset. These three were locals reborn on every `runPlan` call — and a
  // resume IS another call, so the ceiling was refilled by every kill (see the
  // `resumeReplans` param doc for the measurement and for why this bound spans the
  // chain while the trend's iteration bound deliberately does not).
  let replanned = seededReplans > 0;
  /** F85 (C): how many replans this run has actually drafted, and whether the
   * arbiter has already spent its ONE extra grant. Two variables and not one
   * counter compared against a limit, deliberately — a latch cannot be widened by
   * arithmetic, and the ceiling is the thing this rung must not move (v1.12). */
  let replans = seededReplans;
  // the F85-C latch travels BESIDE the count and is not derived from it: a leg can
  // inherit a spent ordinary ceiling with the grant still unearned (count 1, false),
  // and deriving one from the other would collapse those two states into one.
  let varianceGrantUsed = resumeReplans?.grantUsed === true;
  // `replanned` stays the shipped boolean this record has always carried; `replans`
  // rides BESIDE it (append-only — a field's meaning is never repurposed).
  //
  // Both now count the CHAIN rather than the leg, and that IS a meaning change — made
  // rather than shadowed by a second field because `replans` shipped only on this
  // unreleased branch, so no archived spine carries the leg reading for a reader to
  // be confused by. The leg's own number is not lost by it: a leg emits one `replan`
  // record per replan it drafts, so `chain − records-in-this-window` is the fold it
  // inherited, and that is exactly the arithmetic `readResume` runs to rebuild the
  // ledger for the next leg. A second field stating a number already derivable from
  // the window would be a second reader of one question (F6's structural cousin).
  const planExecuted = () => emit('plan-executed', { steps: stepOutcomes, replanned, replans });
  /** @type {object|null} W-2 at the STEP site — set when the WALL refused to open a
   * step's attempt. It carries that stop's own record fields, and its presence is what
   * lets the step loop's terminal tell this reading apart from F64's mid-call one
   * without consulting the clock a second time (two clock reads for one event is how
   * the two instruments come to disagree). Exactly the fix loop's `wallStop`, one
   * layer up. */
  let stepWallStop = null;

  /** @param {any} step */
  const executeStep = async (step) => {
    emit('step-start', { step: step.id, rounds: step.rounds, tools: step.tools });
    // the before-side of every tree-changed exit, taken at STEP start: the
    // step's cumulative work is what the exit judges (outcome, never intent)
    const snapshot = new Map();
    for (const e of step.exit) {
      if (e.type === 'tree-changed') for (const [k, v] of await snapshotScope(workdir, e.scope)) snapshot.set(k, v);
    }
    // Layer R — one root per step's ralph loop (each micro-wheel is the Layer-1
    // atom, LAYERS.md). The red-set is the exit evaluator's OWN gap: fixation
    // here means "the worker rewrote the same file(s) AND the exit evaluator's
    // complaint is byte-identical" — so the whole normalized gap is the
    // comparable set (gapKeep `\S` = every non-blank line). That is more robust
    // than reusing a check's `^`-anchored gapKeep, which the exit wrapper
    // (`check "x" red: …`) would break. writesInformative is true (tool mode,
    // always) but never fires on write-overlap ALONE — a plan step rewrites its
    // one target every attempt, so only a KNOWN-unmoved red-set can distinguish
    // repetition from progress (Finding 3). Native is excluded (no onToolResult
    // seam → the tee cannot settle → same-path rewrites are blind).
    const root = layerRoot && !native
      ? createRoot({ gapKeep: '\\S', redact: scrub, writesInformative: true })
      : null;
    // P: the widened step fields, each wired or refused — a silently-ignored
    // optional field is the F50 blind-instrument class. `scope` narrows the fence to
    // a menu value (a subset by construction); `model` swaps the worker's provider
    // via the runner's factory — absent factory it must STOP, not silently run the
    // default tier as if the choice had been honoured. `attempts` is the third and
    // is now TOLERATED-INERT (see validatePlan): the ladder governs iterations by
    // progress, and a field that could only ever TIGHTEN a count is the wrong shape
    // for that — drafters measurably tightened it to 3, then to 2 on replan, which
    // is the opposite of the heal a converging step needs.
    if (step.model !== undefined && !providerFor) {
      const err = /** @type {any} */ (new Error(`step "${step.id}" selects model tier "${step.model}" but the runner supplied no providerFor factory — wiring gap, not a plan defect`));
      err.category = 'interpreter-red';
      throw err;
    }
    const w = await mkWorker({
      granted: step.tools, phase: `step:${step.id}`, attemptRounds: step.rounds, attempts: null, writable: true, root,
      fence: step.scope !== undefined ? [resolve(workdir, globToPrefix(step.scope))] : null,
      workerProvider: step.model !== undefined && providerFor ? providerFor(step.model) : null,
    });
    // ONE ladder per step: the seen-set and the strike count are this step's own
    // history, and a shared one would strike a fresh step for a gap an earlier step
    // had already seen. The write signal is the gate audit's own record count (F32's
    // filter), never git status and never a tree diff.
    const ladder = createLadder({ limit: strikeLimit, writeCount: w.writeCount });
    let lastText = '';
    let iterationNow = 0;
    // The meter's baseline: what the RUN had left when this step began. Shares are
    // computed against this, never against the original budget — a late step is
    // measured against what actually remains for it, which is what "eating the run"
    // means. Read once, here, so the denominator cannot drift mid-step.
    const stepStartUsd = remainingUsd();
    const stepStartMs = clock.bounded ? clock.remainingMs() : Infinity;
    /** @param {number} iteration @param {string} [gap] */
    const middle = async (iteration, gap) => {
      // A — the variance check, at the HEAD of an attempt so no work is discarded
      // (attempts 1..n-1 accrued the spend; their writes are already on disk). Never
      // fires on attempt 1: the share is 0 there by construction. Throwing with a
      // category is the seam ralph already owns; it routes the category and the step
      // loop reads it as a REPLAN, not a stop.
      if (iteration > 1) {
        const moneyShare = stepStartUsd > 0 ? (stepStartUsd - remainingUsd()) / stepStartUsd : 0;
        const timeShare = clock.bounded && stepStartMs > 0 ? (stepStartMs - clock.remainingMs()) / stepStartMs : 0;
        if (moneyShare >= VARIANCE_THRESHOLD || timeShare >= VARIANCE_THRESHOLD) {
          // F85 — the meter REPORTS progress; it does not decide on it. The
          // condition above is the whole trigger and stays the whole trigger: a
          // converging step that is eating the run is still stopped, because this is
          // a governance instrument over an operator-owned allowance and a governor
          // that suppressed itself whenever the work looked promising would be
          // judging capability with the budget. What was missing was never a term in
          // the condition — it was the READING. u-msh70zla stopped a step whose close
          // had gone 24 → 15 → 14 and then told the replanner its exits were
          // "unmoved", so the replanner threw the progress away and re-targeted a
          // file that was already clean.
          //
          // The reading comes off `runTrend` — the SAME instance the money halt reads
          // (src/trend.js's ONE PER SERIES). A second reader for one question is how
          // two readers come to disagree, which is precisely the defect being fixed.
          // It is per-stage, numbers-and-stage-names only, and `unknown` stays
          // `unknown` — a close that reports no number donates nothing (F6).
          const t = runTrend.verdict();
          emit('variance', {
            step: step.id, iteration, threshold: VARIANCE_THRESHOLD,
            moneyShare: Number(moneyShare.toFixed(3)),
            timeShare: clock.bounded ? Number(timeShare.toFixed(3)) : null,
            axis: moneyShare >= VARIANCE_THRESHOLD ? 'money' : 'time',
            // ADDED fields, never repurposed ones (the spine is append-only forever).
            // Same four names and same shapes the money halt already emits, so one
            // reader parses a progress reading wherever it appears.
            trend: t.trend, motion: t.motion, reading: t.reading, series: t.series,
          });
          const err = /** @type {CategorizedError} */ (new Error(
            `step "${step.id}" consumed ${Math.round(Math.max(moneyShare, timeShare) * 100)}% of the run's remaining `
            + `${moneyShare >= VARIANCE_THRESHOLD ? 'money' : 'time'} across ${iteration - 1} attempt(s) with its exits still red. `
            // The escalation `detail` is this message (ralph passes it through), and
            // the replan brief quotes the detail — so this sentence is what a human
            // AND the redrafting planner read. It states what the run achieved; it
            // never states what to do about it, which is the operator's lever list.
            + `Run progress: ${t.reading}.`));
          err.category = 'step-variance';
          throw err;
        }
      }
      // T/W-2 at the STEP site, and it sits BELOW the meter deliberately. The meter is
      // the instrument for a step that was ALREADY RUNNING when the deadline passed:
      // that step reads a time share of 1 and routes to the ONE replan exactly as it
      // always has. The case it is structurally blind to is a step that STARTS past the
      // deadline — its share is measured against what the run had left when it began,
      // which is zero, so the share is zero forever and the step burns every attempt it
      // is allowed. (Measured on the real flow: three attempts, three judged exits, all
      // past the deadline.) The two are exhaustive and do not overlap: past the deadline
      // a step that began with time left reads a share of exactly 1, so the meter always
      // fires first for it — which is why this check only ever reaches attempt 1, and why
      // the routing of a step that was already running is untouched.
      //
      // Every one of those attempts is worthless by construction: the metered clock
      // check stops the worker on its FIRST round, so it writes nothing, and the judge
      // still runs the step's exits — themselves close stages, at the full close timeout
      // each — to re-mint the red already on the record. hamr's ruling, the same one the
      // close-fix loop applies: when time is up, keep the grade we already have and
      // stop. Resume-to-cap extended from money to time — the stop IS the checkpoint.
      //
      // The placement IS the mechanism, and the in-flight case falls out of it with
      // nothing added: a deadline landing DURING an attempt still lets that attempt and
      // its judge run to completion, because the clock is not consulted again until the
      // next attempt is about to start. Grading real work always completes — a wall that
      // kills grading leaves the run unreadable after the money is spent (F45).
      if (clock.expired()) {
        stepWallStop = {
          cutMidCall: false,
          phase: `step:${step.id}`,
          stepsDone: idx,
          stepsPlanned: plan.steps.length,
          attemptsUsed: iteration - 1,
          // The ladder's own state, because the ladder is what was governing this
          // step when the wall stopped it. This record used to carry `capRuns` and
          // `stepAttemptCap` — two counts that no longer bound anything here — and a
          // field name that means something it no longer measures is worse than an
          // absent one: a reader cannot tell it went stale. The FIX site's copy of this
          // record dropped `capRuns` for the same reason at v1.46 §4, when the count
          // stopped governing that loop too — neither wall record quotes a denominator
          // now, because neither loop has one.
          strikes: ladder.report().strikes,
          strikeLimit: ladder.report().limit,
          distinctGaps: ladder.report().distinctGaps,
        };
        // No trend here, and none invented: the trend instrument reads CLOSE grades,
        // and a step that never ran has no grade of its own to compare. The lever the
        // human needs is on the run-level record either way.
        const err = /** @type {CategorizedError} */ (new Error(
          `the wall-clock cap passed before step "${step.id}" attempt ${iteration} could start — `
          + `the step was never funded to run. ${idx} of ${plan.steps.length} step(s) completed before it. `
          + 'Nothing after the deadline is allowed to change the verdict the run already has.'));
        err.category = 'wall-halt';
        throw err;
      }
      w.setIteration(iteration);
      iterationNow = iteration;
      // Layer R observe: finalize the prior attempt from the books (workerWrites
      // audit + teed same-path rewrites), run the fixation detector, and inject
      // its escalating note into THIS attempt's prompt (null = inert). The event
      // carries counts and paths only — never content (the spine is forever).
      const rootInj = root ? root.observe({ iteration, gap, writes: w.workerWrites() }) : null;
      if (rootInj) emit('root-injected', { step: step.id, ...rootInj.event });
      // read ONCE: the note and the "was it the attempt just before this one" test
      // are two questions about the same record, and two reads is how they drift
      const bound = w.wasBounded();
      const r = await w.ask([
        step.action,
        `Repository root (absolute): ${workdir}\nEvery path you pass to a tool MUST be absolute and inside this root — a relative path resolves against a different directory and will be denied by the gate.`,
        step.target && `Write your deliverable to: ${resolve(workdir, step.target)}`,
        artifacts.length > 0 && `Working context (read-only) — prior steps' results:\n${artifacts.map((a) => `[${a.id}] ${a.text}`).join('\n\n')}`,
        gap && `Previous attempt failed this step's checks:\n${gap}`,
        // the note names the bound that ACTUALLY fired — a deny streak and a spent
        // round cap are different diagnoses with different remedies, and telling a
        // fenced worker to "form a hypothesis early" aims it at the wrong wall
        bound?.iteration === iteration - 1 && boundedNote(bound, step.rounds),
        rootInj && rootInj.note,
      ].filter(Boolean).join('\n\n'));
      lastText = scrub(r.text ?? '').slice(0, ARTIFACT_MAX);
    };
    let lastGap = '';
    const judge = async () => {
      const { pass, results: raw } = await evalExits(step.exit, { dir: workdir, snapshot, runCheck });
      // Scrubbed HERE, once, before the results are read by anyone. An exit detail is
      // supposed to be names and counts, but `json-valid` embeds `JSON.parse`'s own
      // message and V8 quotes a window of the SOURCE inside it (a body of 20 chars or
      // fewer is quoted whole) — so the detail can carry FILE BYTES the worker chose,
      // and the spine is append-only forever (the hard line). ONE inventory
      // (SECRET_PATTERNS), the same `scrub` the close output and the ctx-verb channel
      // already ride through — never a second spelling of what a secret looks like.
      // The boundary is the right place and not the three call sites below it: these
      // same details become the `exit-eval` record, a fault's escalation `detail`
      // (via ralph's close-verdict + CLOSE_FAULTS emissions), and the worker gap
      // (which ralph also puts on the spine as close-verdict.gap). Scrubbing the
      // results makes the leak inexpressible; scrubbing each consumer makes it
      // something the next consumer has to remember.
      const results = raw.map((r) => (typeof r.detail === 'string' ? { ...r, detail: scrub(r.detail) } : r));
      emit('exit-eval', { step: step.id, iteration: iterationNow, results });
      // an instrument fault rides out by its runClose verdict NAME: ralph
      // escalates it through CLOSE_FAULTS (or F32-routes a crash after writes)
      const faulty = results.find((r) => r.fault);
      if (faulty) return { verdict: /** @type {string} */ (faulty.fault), detail: faulty.detail };
      if (pass) return { verdict: 'satisfied' };
      // AND-only: the gap names EVERY failing wall (mechanical genre, F38)
      lastGap = results.filter((r) => !r.pass).map((r) => r.detail).join('\n');
      return { verdict: 'needs_revision', gap: lastGap };
    };
    const outcome = await ralph({ middle, judge, ladder, emit: emitL, workerWrites: w.workerWrites });
    // gap + writes ride out for the replan brief's mismatch line (the books this
    // step already kept; the escalation's detail carries the meter/strike sentence,
    // never the gap, so the brief cannot recover this fact from anywhere else)
    return { outcome, artifact: lastText, ladder, writes: w.workerWrites(), gap: lastGap };
  };

  let idx = 0;
  while (idx < plan.steps.length) {
    const step = plan.steps[idx];
    // RESUME: this step's exit was already satisfied before the kill. It is not re-run —
    // that is the money and the time the ruling is about — and it is not silent either:
    // the record is its OWN type carrying the event that proves it, so a reader can tell
    // a skipped step from a run one (the resume-to-cap invariant, which a fake
    // step-start/step-end pair would destroy). The step's ARTIFACT is not reconstructed:
    // its text was a prompt ingredient, never a checkpoint, and its real product is on
    // disk where the next step will find it.
    if (idx < skipCount) {
      const proof = resumeSeed.completedSteps[idx];
      emit('step-skipped', {
        step: step.id,
        provenBy: proof?.by ?? null,
        provenSeq: typeof proof?.seq === 'number' ? proof.seq : null,
        meaning: 'the killed run satisfied this step\'s exits — it is not re-run and not re-paid',
      });
      stepOutcomes.push({ id: step.id, outcome: 'skipped' });
      idx += 1;
      continue;
    }
    let res;
    try {
      res = await executeStep(step);
    } catch (e) {
      // Reachable ONLY by mkWorker/gate/index SETUP faults: ralph catches middle
      // throws and returns 'escalated', so a provider throw never reaches here.
      // An uncategorized setup fault is interpreter-red (broken infra), never
      // relay's provider-red default — and the RECORDED outcome must match the
      // escalation the human reads (review #6, F11 misfiling: a spine that says
      // interpreter-red while the escalation says provider-red is two
      // instruments disagreeing about the same event).
      const err = /** @type {CategorizedError} */ (e);
      const category = err instanceof HaltError ? 'cap-halt' : (typeof err.category === 'string' ? err.category : 'interpreter-red');
      stepOutcomes.push({ id: step.id, outcome: category });
      if (category === 'cap-halt') {
        emit('cap-halt', { category, meaning: 'not under cap — not "can\'t"', detail: String(err?.message ?? err) });
        // …and the MONEY record beside it, as every other cap-halt site emits one. A
        // readout a human gets at three seams and not at the fourth is the readout being
        // a coincidence of where the stop happened. UNREACHABLE today — nothing in
        // mkWorker/gate.init/snapshotScope buys a round, so no wallet can drain here —
        // which is why this is symmetry rather than a fix, and why it stays a `HaltError`
        // branch instead of a widened one.
        emitMoneyHalt({ phase: `step:${step.id}`, cutMidCall: false, stepsDone: idx, stepsPlanned: plan.steps.length });
      }
      emit('escalation', {
        category, decisionReady: true, phase: `step:${step.id}`,
        decision: category === 'cap-halt'
          ? `The budget gate tripped while building step "${step.id}" — the wallet cannot fund the plan flow.`
          : `Step "${step.id}" could not be set up (${category}) — the worker, gate, or index failed before the step ran.`,
        options: category === 'cap-halt' ? ['raise the job budget and rerun', 'abandon the run'] : ['fix the interpreter/environment', 'retry the run', 'abandon the run'],
        detail: String(err?.message ?? err),
        ...(typeof err?.lib === 'string' ? { lib: err.lib } : {}),
      });
      planExecuted();
      return category;
    }
    stepOutcomes.push({ id: step.id, outcome: res.outcome });
    emit('step-end', { step: step.id, outcome: res.outcome });
    if (isUnpriced()) { planExecuted(); return 'pricing-red'; } // F6: a step round came back unpriced — halt before the next
    if (res.outcome === 'green') {
      artifacts.push({ id: step.id, text: res.artifact });
      idx += 1;
      // T's terminal: a run that cannot fit its time budget STOPS, and the stop is
      // the result (build-ladder discipline, v1.27 — unchanged). Checked after a
      // GREEN step too, not just a red one: the alternative silently starts a step
      // it cannot fund, which is the same class as the money cap binding mid-attempt
      // (F45). Resume-to-cap applies exactly as it does to money — the stop IS the
      // checkpoint, so the completed steps are not wasted.
      if (clock.expired() && idx < plan.steps.length) {
        emitWallHalt({ stepsDone: idx, stepsPlanned: plan.steps.length });
        emit('escalation', {
          category: 'wall-halt', decisionReady: true, phase: `step:${step.id}`,
          decision: `The run reached its wall-clock cap after ${idx} of ${plan.steps.length} steps. Time ran out, not capability.`,
          options: WALL_OPTIONS,
          detail: `requested ${clock.requestedMs}ms, elapsed ${clock.elapsedMs()}ms`,
        });
        planExecuted();
        return 'wall-halt';
      }
      continue;
    }
    // ONE replan, and only for EXHAUSTION with FUNDS LEFT (review #5): ralph
    // emits cap-halt for BOTH attempt-exhaustion AND a money-gate halt
    // mid-attempt — but a drained wallet is a stop, not an adaptation. A
    // money-gate halt necessarily drained the wallet (the worker's cap WAS the
    // whole remaining wallet), so replanning against it burns another draft and
    // mislabels the money-cut as "exits still red" (F45 class); attempt-
    // exhaustion leaves money on the table. An instrument/governance stop that
    // is not cap-halt never replans either. (An unpriced step already returned
    // pricing-red at the step-end guard above, so isUnpriced() is false here.)
    //
    // A (PRD v1.27) adds the SECOND trigger: `step-variance` — the meter stopped a
    // step that had eaten a declared share of the run. That is the case
    // exhaustion-only could never reach (F56: a replan has fired zero times in the
    // programme), and it is a genuine re-allocation rather than a stop. Both
    // triggers still need FUNDS LEFT, and both are bounded by the replan ceiling.
    const cat = lastEscalation?.category;
    /** F85 — the run's measured trajectory at the moment of this stop, read ONCE
     * here off the same instance the meter and the money halt read. Both consumers
     * below are the replanner's: the trigger sentence and the brief. */
    const stopTrend = runTrend.verdict();
    // F66 adds the THIRD trigger: `step-stalled` — the stall watchdog reissued the
    // model call MAX_STALLS times and never got a round back. hamr's ruling is that
    // a stall must self-heal rather than end the run ("killing and coming back is
    // not an option"), so the watchdog reissues silently; only once reissuing has
    // demonstrably stopped working does the run adapt instead — by replanning, not
    // by stopping. Same ONE-replan ceiling and same FUNDS-LEFT condition as the
    // other two: this changes the trigger, never the ceiling (v1.12).
    //
    // F85 rewrote the variance branch. It used to be the FIXED string "…with its
    // exits unmoved", printed for every step-variance stop whatever had happened —
    // and on u-msh70zla it was simply false: the exits had moved 24 → 15 → 14. The
    // sentence now states the meter's fact (a share of the run) and then the trend
    // instrument's MEASURED reading, which is the same reading the `variance` record
    // and the money halt carry. Nothing here asserts a direction the reader did not
    // report: `unknown` says unknown.
    const replanTrigger = cat === 'cap-halt' ? 'step exhausted its attempts with exits still red'
      : cat === 'step-variance' ? `the meter stopped a step that was consuming the run — ${stopTrend.reading}`
      : cat === 'step-stalled' ? 'the model stopped producing rounds and reissuing the call did not recover it'
      : null;
    // F85 (C) — the ARBITER's one additional replan. A second `step-variance` after
    // the ceiling is spent used to be a hard stop, and on a run that was still
    // converging that stop threw away work the run had already paid for. So the
    // arbiter may grant ONE more, and every clause of that sentence is a constraint:
    //
    //   * ONE. Bounded, and bounded by a latch rather than a comparison, so the
    //     ceiling cannot creep: unlimited replanning launders thrash as adaptation
    //     (v1.12). A third variance stop is the stop, however well it is going.
    //   * the ARBITER. Read mechanically off `runTrend` — the same instance the
    //     meter and the money halt read. The agent never asks for it, never sees it
    //     offered, and cannot influence it: no self-adjusted budgets, ever.
    //   * `converging`, the trend instrument's OWN category. No new number is
    //     invented here — threshold-setting is the operator's, and a fresh
    //     comparison would be a second reader of the one question (src/trend.js).
    //     `flat` and `unknown` are refusals; an unknown is never rounded up into a
    //     reason to spend (F6).
    //   * step-variance only. An exhaustion or a stall after the ceiling is
    //     unchanged — this widens nothing but the case it was measured on.
    const grantExtraReplan = replanned
      && cat === 'step-variance'
      && !varianceGrantUsed
      && stopTrend.trend === 'converging';
    // W-2 at the replan GATE, hamr's ruling: *"past the wall no new fix cycle or step
    // starts"* — and a replan is the first move of starting a new step. Past the
    // deadline the whole cycle is doomed by construction and it is not free: the
    // drafting call is bought (money the operator's time allowance no longer covers),
    // the redrafted plan's first step is then refused at its own head by the W-2 check
    // one level down, and the run wall-halts anyway. u-msmt91t3 paid for exactly that
    // and called the result `step-red`. So the gate declines to FUND it.
    //
    // Nothing is routed here and no readout is duplicated: declining simply lets the
    // stop fall through to the `step-variance` terminal below, which is the one site
    // that mints the wall-halt package (record + F11-consistent escalation + levers).
    // One site, one spelling — a second copy here is how two instruments come to
    // disagree about one event.
    //
    // TRIGGER-AGNOSTIC (hamr: "extend"). It first covered the variance trigger only,
    // the one measured on u-msmt91t3; the ladder's exhaustion and the stall fuse reach
    // this gate past the deadline too, and a doomed cycle costs the same money whichever
    // instrument named the stop. Each trigger then lands on its own honest terminal
    // below — the wall for the two that would otherwise mint `step-red`, its own name
    // for the stall (which already rides out as `step-stalled` and must, because run.js
    // keys the F44 spend FLOOR on that outcome).
    //
    // The latch is NOT consumed — no grant was spent, because no replan was bought.
    // With time on the clock this is byte-identical to today, for every trigger.
    const wallStopsReplan = clock.expired();
    if (!wallStopsReplan && (!replanned || grantExtraReplan) && replanTrigger && remainingUsd() > MONEY_MIN) {
      if (grantExtraReplan) varianceGrantUsed = true;
      replanned = true;
      replans += 1;
      emit('replan', {
        step: step.id, reason: replanTrigger, trigger: cat,
        // ADDED fields (append-only): which replan this is, and — only when the
        // arbiter granted one past the ordinary ceiling — the reading it granted it
        // on. Absent on the ordinary replan, so a reader can never mistake the
        // ceiling for a grant.
        //
        // The index is the RUN's, so on a resumed leg it opens above 1 — the ceiling
        // it is counted against spans the chain, and an index that restarted at 1 on
        // every leg would read as a fresh allowance on the one record that could have
        // shown it was not.
        replan: replans,
        ...(grantExtraReplan ? { granted: stopTrend.trend } : {}),
      });
      // The brief names the trigger HONESTLY, one branch per trigger: it is the
      // only channel the redrafting planner adapts to, so a wrong diagnosis here
      // is handed to the one component whose whole job is to respond to it. A
      // stall in particular never judged its exits at all — the exhaustion
      // sentence would invent a red the run never saw (F28's rule, replan side).
      // The exhaustion branch is the one the ladder rewrote. "It ran N attempts and
      // its exits were still red" described a bound that no longer exists AND said
      // nothing about the mechanism — the planner could not tell a step that was
      // converging from one repeating itself, which are opposite problems with
      // opposite fixes. The ladder's own books answer that, and the balance says what
      // the stop left on the table (the u-msd916dh reading: $1.30 and ~6min unspent
      // behind a step that was still shrinking its error count). Time is reported as
      // UNBOUNDED when the operator set no wall — never rendered as a number (F6
      // extends to time).
      const leftOver = `$${remainingUsd().toFixed(2)} and `
        + `${clock.bounded ? `${Math.round(clock.remainingMs() / 60_000)} minute(s)` : 'time UNBOUNDED'} `
        + 'of the run were still unspent when it stopped.';
      // F85: the meter's branch states the METER's fact and then the run's measured
      // one, in that order and as two separate claims — "it was stopped for eating
      // the run" and "here is what the run achieved" are different things, and the
      // old sentence quietly fused them into a verdict on the work.
      const why = cat === 'step-variance'
        ? 'It was stopped by the run\'s meter for consuming too large a share of what was left. '
          + `Its work so far, from the close's own numbers: ${stopTrend.reading}. ${leftOver}`
        : cat === 'step-stalled'
          ? 'It stalled: the model stopped producing rounds and reissuing the call did not recover it, so its exits were never judged.'
          : `${res.ladder.brief()} ${leftOver}`;
      // F86 — this step's OWN last exit results, verbatim (u-mshcpdg4). Everything
      // above this line is the run's narration of the stop: the meter's share
      // sentence, the trend's direction, the never-wrote fact, the escalation detail.
      // None of them says WHERE the remaining work is, because none of them is the
      // close. The close's output is in HERE — as one of the failing exits' details,
      // beside the evaluator's own (a step that wrote nothing leads with
      // `tree-changed`), which is why the block is labelled by its exits rather than
      // by the close. It goes over as text — see `closeGapBlock` for why a parsed
      // file list would reproduce the exact bug it is fixing. Empty gap → empty
      // string → the brief is byte-identical to the pre-F86 one.
      const gapBlock = closeGapBlock(res?.gap);
      const failure = `Step "${step.id}" (${step.action}) did not reach its exits. `
        + `${why}\n`
        + `Last exit state:\n${lastEscalation?.detail ?? '(none)'}\n`
        + `Steps completed so far: ${artifacts.map((a) => a.id).join(', ') || 'none'}.`
        + gapBlock;
      // The progress line IS the adaptation channel (addendum 2): the balance rides
      // in via obtainPlan's live read, and this says where the run got to. Both are
      // the planner re-allocating what remains across what is left — never a rate.
      //
      // F85 adds the second half. This line used to count STEPS only ("step 1 of 1
      // did not finish; 0 step(s) completed before it") — structurally true and
      // silent about outcome, so a replanner reading it could only conclude that
      // nothing had been achieved. On u-msh70zla it concluded exactly that and threw
      // three attempts of real convergence away. The structural sentence stays (a
      // plan's shape is what the planner re-allocates); the measured one joins it.
      const progress = `step ${idx + 1} of ${plan.steps.length} ("${step.id}") did not finish; `
        + `${artifacts.length} step(s) completed before it; `
        + `close trend so far: ${stopTrend.reading}`;
      let pv;
      try {
        pv = await obtainPlan('replan', failure, progress);
      } catch (e) {
        planExecuted();
        return relay(e, 'replan');
      }
      if (!pv.ok) {
        for (const r of pv.reds) emit('plan-red', r);
        planExecuted();
        return 'plan-red';
      }
      plan = /** @type {any} */ (pv.plan);
      emit('plan-accepted', { plan, phase: 'replan' });
      // the new plan's steps are NOT the old plan's steps — its abandoned greens
      // must not ride forward as this plan's "prior steps' results" (stale, and
      // it names steps the current plan does not contain)
      artifacts.length = 0;
      idx = 0;
      // and for exactly the same reason a RESUME's skip set dies here: an id the new
      // plan happens to re-use names a step this run never did, so inheriting the
      // dead run's green for it would skip work nobody has done
      skipCount = 0;
      continue;
    }
    /**
     * W-2's STEP-LOOP terminal, and the ONE place it is spelled. Reached whenever a
     * trigger that would otherwise mint `step-red:<id>` lands with the deadline already
     * passed: the meter's stop (F85's variance) and the ladder's (attempt exhaustion
     * with money still on the table). Both are the same event wearing two instruments'
     * names — the clock is what ended the run — and `step-red` is a CAPABILITY label,
     * so minting it there files a governance stop as "the work failed". u-msmt91t3 is
     * the measured instance: `step-red` 9.9 seconds after the run's own `wall-bounded`.
     *
     * One site, one spelling, because the record, the F11-consistent escalation and the
     * lever list must be identical wherever the clock stops a step — a second copy per
     * trigger is how two instruments come to disagree about one event. The instrument
     * that named the stop FIRST is not discarded: it rides in the detail, so the human
     * reads why the step was stopped as well as which lever fits.
     *
     * `stepWallStop` is never consulted here by construction: that record is written
     * only by the head-of-attempt check, and both triggers above are read BEFORE it, so
     * a step either of them stopped never reached it.
     * @param {string} stoppedBy the instrument that named the stop first
     */
    const wallHaltTerminal = (stoppedBy) => {
      emitWallHalt({ cutMidCall: false, phase: `step:${step.id}`, stepsDone: idx, stepsPlanned: plan.steps.length });
      emit('escalation', {
        category: 'wall-halt', decisionReady: true, phase: `step:${step.id}`,
        decision: `The run reached its wall-clock cap while step "${step.id}" was running. Time ran out, not capability — the verdict the run already has stands.`,
        options: WALL_OPTIONS,
        detail: `requested ${clock.requestedMs}ms, elapsed ${clock.elapsedMs()}ms. `
          + `${stoppedBy}: ${lastEscalation?.detail ?? '(none)'} `
          + `Progress trend: ${stopTrend.trend} — ${stopTrend.reading}; ${stopTrend.lever}.`,
      });
      return 'wall-halt';
    };
    // F64 — the wall stopped this attempt from INSIDE a provider call (the derived
    // call timeout is the deadline in the provider's own coin). ralph already
    // emitted the escalation under this category, so the outcome and the record
    // agree (F11); what is still missing is the run-level TIME record, which the
    // between-steps site emits and this path must too. Never a replan trigger and
    // never a casualty: time ran out, and the stop IS the checkpoint.
    // W-2 adds the step loop's SECOND wall reading: the deadline seen at the head of
    // an attempt, with no call in flight. `stepWallStop` is that reading's own record
    // (attempts used, steps done); its absence means the deadline landed inside a call
    // instead, which is F64's cutMidCall stop — and run.js keys the job-end money floor
    // on exactly that field, so conflating the two would report an unknown as exact.
    if (cat === 'wall-halt') {
      emitWallHalt(stepWallStop ?? { cutMidCall: true, phase: `step:${step.id}`, stepsDone: idx, stepsPlanned: plan.steps.length });
      planExecuted();
      return 'wall-halt';
    }
    // A money-gate halt (wallet drained) is an honest cap-halt terminal, never a
    // step-red: the exits never ran because the money ran out, not because the
    // work failed. Attempt-exhaustion WITH funds after the one replan is spent
    // stays a step-red (the stop is a result).
    if (cat === 'cap-halt') {
      planExecuted();
      if (remainingUsd() > MONEY_MIN) {
        // W-2 EXTENDED to the ladder's stop (hamr: "extend"). This arm is the sibling of
        // the variance terminal below and carries the identical defect: with money still
        // on the table it minted `step-red` whatever the clock said, so a step the
        // deadline ended was filed as a capability failure. The wallet is re-read (it
        // always was); the clock is re-read too, and it is read FIRST inside this arm
        // only — a DRAINED wallet keeps its own `cap-halt` terminal below, because money
        // is the allowance actually blocking that run and its levers are the ones the
        // human needs (a wall-halt readout there would offer "raise maxWallMs and rerun"
        // into an immediate money cut).
        if (clock.expired()) return wallHaltTerminal('The ladder ended the step first');
        return `step-red:${step.id}`;
      }
      // v1.46 §2: the money cut is decision-ready HERE too, and for the same reason
      // W-2 gave the wall a record at every site it stops a run — a category that
      // hands the human a readout at one seam and silence at another is the readout
      // being a coincidence of where the stop happened.
      emitMoneyHalt({ phase: `step:${step.id}`, cutMidCall: false, stepsDone: idx, stepsPlanned: plan.steps.length });
      return 'cap-halt';
    }
    // A `step-variance` that earned no replan above is a STOP, and the stop is the
    // result. Reached in three ways now: the ordinary ceiling with the run reading
    // `flat` or `unknown`; the arbiter's one grant already spent (F85's bound); or
    // the wallet at dust. Each rides out as `step-red:<id>`, NOT as its own top-level
    // outcome. The category is a replan TRIGGER, never a run verdict: leaking it
    // upward would mint an outcome run.js and the ledger's class table do not know,
    // and an unmapped category is counted as a library bug (ledger.js) when this is a
    // planning story. The escalation ralph already emitted carries the real detail.
    //
    // W-2 at the meter's own terminal. A `step-variance` stop that lands PAST the
    // deadline is a TIME stop wearing the meter's name — the clock is what ended the
    // run, and hamr's ruling names that stop: *"when time is up, keep the grade we
    // already have and stop"*. Its cap-halt sibling directly above already re-reads its
    // own governor (the wallet) before minting a terminal; this branch did not, and on
    // u-msmt91t3 it minted `step-red` 9.9 seconds AFTER the run's own `wall-bounded`
    // record — a governance stop filed as a capability read, and (the resume gate's
    // half of the same defect) a checkpoint filed as an answer.
    //
    // The clock is read HERE, with nothing in flight, exactly as the three other
    // terminal sites read it. With time still on the clock this is byte-identical to
    // what it was: the step-red is the designed stop, and the stop is the result.
    if (cat === 'step-variance') {
      planExecuted();
      if (clock.expired()) return wallHaltTerminal('The meter stopped the step first');
      return `step-red:${step.id}`;
    }
    // Any OTHER terminal escalation category is NOT a capability failure: a
    // provider-red is a transport CASUALTY, a gate-red/interpreter-red/close
    // fault is an instrument stop. Each rides out under its OWN name (F11: the
    // returned outcome and the emitted escalation must agree) so run.js labels
    // it honestly — a provider-red carries the F44 spendComplete:false floor,
    // never laundered into step-red tier data. Mirrors the setup-fault catch.
    planExecuted();
    return typeof cat === 'string' ? cat : `step-red:${step.id}`;
  }

  // ── 4. THE CLOSE — the operator's signed command, the only truth. Red →
  // the gap feeds ONE bounded fix loop judged by the REAL close (v1.12 §4);
  // still red → the escalation ralph already emitted stands.
  const post = await judgeClose();
  emit('outer-close', { ...post });
  if (post.verdict === 'satisfied') {
    spendRuling('accepted');
    planExecuted();
    await emitReviewDoor('green', post);
    return 'green';
  }
  // ── THE THIRD BRANCH (N4 §1.3): between `satisfied` and the fix loop, because
  // a pause is neither. It is not green (nobody said so), not a red (nobody has
  // written a gap), and not a CLOSE_FAULT (nothing broke) — so it must be caught
  // before the fix loop, which would otherwise buy a worker round to convert a
  // wall that does not exist yet.
  if (post.verdict === HUMAN_PAUSE) {
    await emitHitlPause(post);
    planExecuted();
    return HITL_PAUSE;
  }
  const postFault = Object.hasOwn(CLOSE_FAULTS, post.verdict) ? CLOSE_FAULTS[post.verdict] : undefined;
  if (postFault) {
    emit('escalation', { category: postFault.category, decisionReady: true, decision: postFault.decision, options: postFault.options, detail: post.detail });
    planExecuted();
    return 'close-red';
  }
  emit('fix-loop', { gapBytes: Buffer.byteLength(post.gap ?? '') });
  // ── THE RULING IS SPENT HERE (N4 §1.5). The human's words are what OPENS this
  // loop; the worker now holds them. Leaving the ruling live would make the human
  // stage red on every judgment for the rest of the leg, so the loop would keep
  // converting one sentence until the governor or the money stopped it. Cleared,
  // the next machine-clean tree pauses for a SECOND review — which is the honest
  // cycle: a person asked for a change, the change happened, the person looks
  // again. A mechanical red in between is still converted normally, because
  // first-red-wins reaches it before the person's stage.
  liveRuling = null;
  let fixOutcome;
  /** @type {object|null} W-2 — set when the WALL stopped the fix loop BETWEEN
   * iterations. It carries that stop's own record fields, and its presence is what
   * lets the post-loop branch tell this reading apart from F64's mid-call one
   * without consulting the clock a second time (two clock reads for one event is
   * how the two instruments come to disagree). */
  let wallStop = null;
  /** how many fix ITERATIONS the loop actually bought — counted here rather than
   * read back off the trend reader, which lives inside the try and is out of scope
   * by the time a terminal needs the number. */
  let fixIterationsUsed = 0;
  try {
    // Layer R for the close-fix loop — the plan flow's single ralph loop judged
    // by the REAL close (the plan flow's single ralph loop, and the
    // likeliest place fixation manifests: the fix worker has the full menu and
    // is judged by a command, not a form-only exit). The red-set comes from the
    // stage that ACTUALLY rendered the verdict this attempt, not from one pattern
    // fixed for the run: a staged close has N gapKeeps and the wall the worker hit
    // varies attempt to attempt (the gap here is the raw close output, so the
    // `^`-anchored pattern matches, unlike the exec steps' exit-eval gap). Same
    // native exclusion (no onToolResult seam ⇒ the tee cannot settle).
    const fixRoot = layerRoot && !native
      ? createRoot({ redact: scrub, writesInformative: true })
      : null;
    // `attempts: null` is the STRIKE-LADDER shape (mkWorker's own contract): the fix
    // loop's iteration count no longer exists at construction time, so the gate's
    // turn allowance is granted per iteration at `setIteration` instead of being
    // pre-multiplied by a number nobody signed. The per-iteration bound is
    // unchanged — `loop.stop()` at `attemptRounds` — which is the belt that actually
    // holds. (v1.46 §4: `capRuns` retires as the governor.)
    const w = await mkWorker({ granted: ceiling, phase: 'fix', attemptRounds: maxStepRounds, attempts: null, writable: true, root: fixRoot });
    // ── v1.46 §4: the fix loop's GOVERNOR — progress, not a count ──
    //
    // MEASURED reason, the same shape as the step ladder's. The fixed `capRuns`
    // could not tell converging work from thrash, so it stopped both at the same
    // place: u-msew1uy5 was cut mid-convergence at fix iteration 3 while
    // reuse-msc6w93z sat dead flat at 2 errors for SEVEN fix verdicts until the wall
    // killed it. The $0 replay over all 8 archived fix loops came back clean both
    // directions — 0 greens harmed (every historical green converted in <= 2
    // verdicts), 1 waste case caught.
    //
    // The reader is SEEDED with the grade the loop opened on, because that is what
    // the first fix attempt is measured against; without it the first attempt would
    // have nothing to be compared to and the loop would spend a free iteration
    // establishing what it already knew.
    //
    // `blindCap: capRuns` is not the count surviving in disguise. It binds ONLY
    // while the instrument has never been able to compare anything (a close whose
    // output carries no number at all), which is precisely the case where a strike
    // would be minted out of ignorance. The moment a stage reports a comparable
    // number the count is gone, and money and the wall are what remain.
    //
    // DELIBERATELY NOT SEEDED with `resumeGrades`, and this is the one place the
    // resume chain stops. The two readers answer two different questions (see
    // `runTrend` above, and src/trend.js's "ONE PER SERIES"): the halt readout asks
    // *was the RUN converging when its allowance cut it*, which spans both legs; this
    // governor asks *is THIS loop out of ideas*, which is leg-local by definition.
    // Seeding it was built and measured: a resumed loop that struck out dead flat
    // rendered its own terminal as "still progressing — verdict 2 → 1 → 1 → 1 → 1",
    // because the chain HAD fallen before the handover — a record contradicting
    // itself, offering a conditional top-up ("if the trend above says it was still
    // converging") on the exact run that had just proven it was not. It would also
    // have moved the STRIKE rule on a resume (an attempt judged against the best the
    // run ever reached rather than against the grade this loop opened on) — an
    // unmeasured governance change, which is arbiter-adjacent territory. Both are the
    // same error: one instance answering two questions.
    const fixTrend = createTrend({
      stageOrder: stagedClose.map((/** @type {any} */ s) => s.name),
      limit: FIX_STRIKE_LIMIT,
      blindCap: capRuns,
    });
    fixTrend.record({ gap: post.gap ?? '' });
    /** ralph's `ladder` seam, filled by the trend reader instead of the step
     * ladder's repeat/write pair. ONE exhaustion terminal, two triggers (ralph's own
     * rule): the category stays `cap-halt` and the outcome stays `escalated`, so the
     * ledger's class table, bridge grading and every downstream reader are untouched
     * — only the TRIGGER changed. What it overrides is the terminal's PROSE: the
     * step ladder's copy offers a replan, and there is no planner at the close. */
    const fixGovernor = {
      record: (/** @type {{iteration: number, gap?: string}} */ o) => {
        fixIterationsUsed = o.iteration;
        // A PAUSE IS NEVER GRADED. ralph records every non-satisfied iteration,
        // and a pause is one — but it carries no gap and no number, so feeding it
        // to the trend would mint a strike out of a non-verdict and could strike
        // the loop out into a `cap-halt` that never happened. The reading says
        // what it is and the meter is left untouched; `middle` stops the loop on
        // the next iteration, before anything is bought.
        if (lastCloseVerdict?.verdict === HUMAN_PAUSE) {
          return { governor: 'close-trend', trend: 'unknown', reading: 'the close is waiting on a person — not a grade', iteration: o.iteration, paused: true };
        }
        return { governor: 'close-trend', ...fixTrend.record({ gap: o.gap }), iteration: o.iteration };
      },
      struckOut: fixTrend.struckOut,
      report: fixTrend.report,
      brief: () => fixTrend.verdict().reading,
      terminal: () => {
        const rep = fixTrend.report();
        const t = fixTrend.verdict();
        return {
          decision: rep.blind
            ? `${rep.iterations - 1} fix iteration(s) spent and the close still red. Its output carries no number this run can compare, so no progress reading exists — the retired iteration count is what bounded the loop. Continue, change approach, or stop?`
            : `${rep.strikes}/${rep.limit} strikes — the fix loop stopped making progress against the close's own numbers (${t.reading}). Continue, change approach, or stop?`,
          options: [
            'revise the goal/spec so the work is reachable (a spec edit, so the new hash needs re-approval)',
            'top up budgetUsd and rerun with --resume, if the trend above says it was still converging',
            'abandon the task',
          ],
        };
      },
    };
    /** @param {number} iteration @param {string} [gap] */
    const middle = async (iteration, gap) => {
      // T/W-2 — the wall, read before a NEW fix attempt is started, and never
      // around the close itself. hamr's ruling: *"when time is up, keep the grade
      // we already have and stop … run tests (free) and when done if original time
      // is past due, pause and ask user to increase time or adjust prompt"*.
      //
      // Past the deadline this iteration is guaranteed to be worthless: the metered
      // round check stops the fix worker on its FIRST round, so it writes nothing,
      // and the iteration then re-runs the FULL staged close over an unchanged tree
      // (four stages × closeTimeoutMs = 60 minutes on the shipped spec) only to mint
      // the verdict already on the record — capRuns times over. So the run stops
      // here, ON that verdict. Resume-to-cap extended from money to time: the stop
      // IS the checkpoint, and the human tops up (v1.12).
      //
      // The placement IS the mechanism, and the in-flight case falls out of it with
      // nothing added: a deadline that lands DURING an attempt still lets that
      // attempt's close run to completion, because the clock is not consulted again
      // until the next iteration is about to start. The close is never bounded — a
      // wall that kills grading leaves the run unreadable after the money is spent
      // (the F45 class), so the one thing this must never do is stop a close.
      // ── THE CLOSE IS WAITING ON A PERSON. Read here, in the same place and for
      // the same reason the wall is: past this point the iteration is guaranteed
      // to be worthless, because the machine half of the close already passes and
      // nothing a worker writes can answer a question only a person can. So the
      // loop stops ON that reading — the run pauses again, with everything it has
      // done kept, exactly as the first pause did.
      if (lastCloseVerdict?.verdict === HUMAN_PAUSE) {
        const err = /** @type {CategorizedError} */ (new Error(
          `the close is waiting on the signer at stage "${lastCloseVerdict.stage ?? 'unknown'}" — every mechanical `
          + `stage passes, so fix attempt ${iteration} could not change the answer`));
        err.category = HITL_PAUSE;
        throw err;
      }
      if (clock.expired()) {
        // ONE progress instrument, shared with the money halt (PRD v1.46 §2/§4).
        // This site used to run its own `gapTrend`: byte equality of the last two
        // close gaps, reading `stalled`/`moving` beside the money halt's per-stage
        // `flat`/`converging` on the very same run. Two readers for one question is
        // how the two come to disagree, and the byte reader could only ever report
        // MOTION — that something changed, never which way. Folded into src/trend.js,
        // where a per-stage NUMBER decides whenever one exists and the byte
        // comparison survives as the reading inside `unknown` (never as a direction:
        // "the output changed" is not "it got better", which is F6 in a trend's coat).
        // `runTrend` is the run's own reader — the same instance the money halt reads
        // — so a resume's inherited baselines reach this readout too.
        const t = runTrend.verdict();
        wallStop = {
          cutMidCall: false,
          phase: 'fix',
          iterationsUsed: iteration - 1,
          // `capRuns` used to ride here as the DENOMINATOR ("0 of 3"). It retired as
          // this loop's governor (v1.46 §4), so quoting it as the total would state a
          // bound that no longer decides anything — the iterations spent are the fact,
          // and there is no longer a number they are "of".
          verdict: lastCloseVerdict?.verdict,
          ...(lastCloseVerdict?.stage ? { stage: lastCloseVerdict.stage } : {}),
          trend: t.trend,
          // MOTION rides as its OWN field rather than being mapped onto `trend`.
          // Mapping `unchanged` → `flat` would dress a byte comparison as a measured
          // direction on the spine, which is precisely what the unification refuses;
          // a separate field keeps the old signal's substance without the false
          // promotion. (Grepped first: no src/ or scripts/ reader consumed the old
          // `stalled`/`moving` values — only this file's own tests, updated with it.)
          motion: t.motion,
        };
        // The detail carries what the human needs to pick a lever and nothing else:
        // the verdict that stands, how much of the loop was actually spent, and the
        // trend that says which of the two spec edits fits. It never names a culprit
        // file (F28) — that is the worker's job, not the escalation's.
        const err = /** @type {CategorizedError} */ (new Error(
          `the wall-clock cap passed before fix attempt ${iteration} could start. `
          + `The verdict stands as the last close rendered it: ${lastCloseVerdict?.verdict ?? 'unknown'}`
          + `${lastCloseVerdict?.stage ? ` at stage "${lastCloseVerdict.stage}"` : ''}, `
          + `after ${iteration - 1} fix iteration(s). `
          + `Progress trend: ${t.trend} — ${t.reading}; ${t.lever}.`));
        err.category = 'wall-halt';
        throw err;
      }
      w.setIteration(iteration);
      // the red-set's source travels WITH the gap: `closeStage` is the stage the
      // judge stopped at for the attempt this gap came from, and its own gapKeep
      // designates that stage's failures
      const rootInj = fixRoot
        ? fixRoot.observe({
          iteration, gap, writes: w.workerWrites(),
          redStage: closeStage,
          redKeep: stagedClose.find((s2) => s2.name === closeStage)?.gapKeep,
        })
        : null;
      if (rootInj) emit('root-injected', { phase: 'fix', ...rootInj.event });
      await w.ask([
        'The job\'s final verification is failing. Fix the repository so it passes.',
        `Repository root (absolute): ${workdir}\nEvery path you pass to a tool MUST be absolute and inside this root.`,
        artifacts.length > 0 && `Working context (read-only) — the plan's steps produced:\n${artifacts.map((a) => `[${a.id}] ${a.text}`).join('\n\n')}`,
        !gap && post.gap && `The verification's output on the tree as it stands (not an attempt of yours):\n${post.gap}`,
        gap && `Previous attempt failed the verification:\n${gap}`,
        rootInj && rootInj.note,
      ].filter(Boolean).join('\n\n'));
    };
    fixOutcome = await ralph({
      // the staged close rides in as the JUDGE seam (one verdict, every stage in
      // order) — ralph's single-command path stays exactly what it was
      // v1.46 §4: the PROGRESS governor rides in where `capRuns` used to. ralph's
      // two exhaustion rules are alternatives and never both at once, so the count
      // is not passed — it survives only inside the governor, as the bound for the
      // case the trend instrument is blind.
      middle, judge: async () => judgeClose(), ladder: fixGovernor, emit: emitL, redact: scrub,
      closeTimeoutMs, cwd: workdir, workerWrites: w.workerWrites,
    });
  } catch (e) {
    planExecuted();
    return relay(e, 'fix');
  }
  planExecuted();
  // The fix loop ran into the person again (the `middle` stop above). Same
  // terminal as the first pause, and never `escalated`: nothing failed, and the
  // work this loop did is exactly what the signer is now being asked about.
  if (fixOutcome !== 'green' && lastEscalation?.category === HITL_PAUSE) {
    await emitHitlPause(lastCloseVerdict);
    return HITL_PAUSE;
  }
  if (fixOutcome !== 'green' && lastEscalation?.category === 'wall-halt') {
    // F64 in the close-fix loop: the same governance stop, and it must not ride out
    // as a bare `escalated` either — that reads as "the fix failed" when the fix was
    // never given the time to run.
    // W-2 adds the loop's SECOND wall reading: the deadline seen between iterations,
    // where a real grade already exists and is kept. `wallStop` is that reading's own
    // record (verdict, iterations used, trend); its absence means the deadline landed
    // inside a call instead, which is F64's cutMidCall stop.
    emitWallHalt(wallStop ?? { cutMidCall: true, phase: 'fix' });
    return 'wall-halt';
  }
  if (fixOutcome !== 'green' && lastEscalation?.category === 'cap-halt') {
    // ralph spells BOTH of its terminals cap-halt — attempt-exhaustion AND a
    // money-gate halt thrown mid-attempt — so the category alone cannot tell them
    // apart, and the wallet is the only instrument that can. The step loop already
    // splits this exact pair on the same reading; the fix loop must too, because
    // the fix worker's gate is built with the wallet at its MOST drained (every
    // step's spend is behind it), which is precisely where a money cut masquerades
    // as "the fix failed". F45: a money cut is never a capability read — it rides
    // out as cap-halt, the resume-to-cap checkpoint (the stop IS the checkpoint).
    // Attempts spent with money still on the table stays the designed terminal
    // ("close still red") and keeps riding out as `escalated` below.
    // (MED-4, fixed with hamr's explicit go, 2026-07-30.)
    if (remainingUsd() <= MONEY_MIN) {
      // v1.46 §2 — and THIS is the site hamr's ask was about: the money runs out
      // deepest in the run, on the loop that holds a real grade. So the readout keeps
      // that grade, names the stage that rendered it, and carries the run's own
      // per-stage trend so the choice between "top up" and "revise the goal" is made
      // on evidence rather than on how the operator felt about the last gap.
      emitMoneyHalt({
        phase: 'fix',
        cutMidCall: false,
        iterationsUsed: fixIterationsUsed,
      });
      return 'cap-halt';
    }
  } else if (fixOutcome !== 'green' && typeof lastEscalation?.category === 'string') {
    // The step loop's category restoration (F11), mirrored: ralph returns the flat
    // 'escalated' on a middle throw while its escalation carries the real name — a
    // provider-red here is a transport CASUALTY, and run.js keys the F44
    // spendComplete:false floor on the OUTCOME, so a laundered label would report
    // an exact-looking total for a call that never billed back.
    return lastEscalation.category;
  }
  // …and the fix loop's own green reaches the SAME door. A green the loop had to
  // work for is exactly as much a green as one the close minted first time, and a
  // door that opened on only one of them would be a door that quietly graded how
  // the verdict was arrived at.
  if (fixOutcome === 'green') await emitReviewDoor('green', lastCloseVerdict);
  return fixOutcome === 'green' ? 'green' : 'escalated';
  } finally {
    // Emitted on EVERY exit (return or throw) — `finally` fires exactly once,
    // right before this call returns to `runJob`, which is where every other
    // caller's `job-end` lands next. Armed-only: an unarmed run leaves no trace
    // (absence reported as absence, never a fabricated zero line, PRD antigen).
    // No cost fields — this is not a spend record and spend-slicing instruments
    // are unaffected by it (F6/F12's ACCOUNTED_ROUND_TYPES list is untouched).
    if (readShimArm(readShim).on) {
      emit('memory-cache', {
        pointered: memoryCacheCounts.pointered,
        capped: memoryCacheCounts.capped,
        bytesWithheld: memoryCacheCounts.bytesWithheld,
        // bytes→tokens is an ESTIMATE (÷4, the same rough conversion used
        // elsewhere) — the field is named `approx…` so no consumer reads it
        // as measured the way `bytesWithheld` itself is.
        approxTokens: Math.round(memoryCacheCounts.bytesWithheld / 4),
      });
    }
  }
}
