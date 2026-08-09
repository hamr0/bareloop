// THE LOOKING HALF — close-authoring v1, module M3a (design record 2026-08-07
// D11; gate-2 POC prereg addendum 5, lever L1).
//
// D11's line, verbatim: *the scout looks, the author writes, neither acts.* This
// module is the LOOKING. It produces the two inputs the authoring call cannot
// derive from an interview answer, and it produces them WITHOUT the authoring
// call ever gaining a tool:
//
//   1. THE FACTS OBJECT — a bounded, read-only LLM survey of the patient. Result
//      5's knowledge (`MYPYPATH`, pytest `-ra`, per-stage timeouts) came from
//      paying for live runs; none of it is in an interview answer and none of it
//      is derivable from prose.
//   2. THE SEED FILE LISTING — mechanical, $0, deterministic. No model. Round 2's
//      arm A derived `src/alertEmail.js` from the user's words ("the alert email
//      one") and silently reclassified 15 real errors into the wrong population.
//      A path is read off the repository or it does not exist.
//
// WHAT TRANSFERS FROM THE PLAN SCOUT, BY NAME (`src/planrun.js:41-62`): a hard
// round bound (`SCOUT_ROUNDS` 8); write-class and store-class verbs filtered OUT
// of the menu, so the survey is read-only BY CONSTRUCTION and not by promise; an
// output cap (`SCOUT_BLOB_MAX`); F59's reserved TOOLLESS final round; and
// `SCOUT_MIN_BYTES`, below which a survey is ABSENT rather than empty.
//
// WHAT DOES NOT TRANSFER, stated rather than assumed (D11): the plan scout
// derives its menu from a SIGNED `tools` ceiling and runs inside a fenced
// workdir. This scout runs at JOB CREATION, before any spec exists — there is no
// signed ceiling and no fence to derive from, so its grant is FIXED HERE and is
// not spec-authorable. Same arbiter line, one step earlier than usual.
//
// F59 IS THE FINDING THIS MODULE EXISTS TO HONOUR, and it bites harder here than
// it did upstream. An empty `{}` must read as *"the scout did not complete"*,
// never as *"no special facts are needed"*: the plan scout's version of that
// mistake cost a survey; this one lands in a SIGNED artefact, and a missing
// `MYPYPATH` becomes a close that grades the wrong checkout, signed by a user who
// could not have known. Five routes to ABSENT, and every one of them says which.
//
// The listing has TWO consumers and they get DIFFERENT things, deliberately:
//   - the VALIDATOR (`validateDeclaration`'s `listing`) gets the WHOLE tree.
//     Handing it the scoped subset would make `scopeOfJob` read a job scoped to
//     `src/` as whole-tree and silently switch off the F84 one-population law.
//   - the PROMPT gets the block, scoped to the survey's own sourcePaths/testPaths
//     and capped in announced tiers (F28 — nothing is hidden without being
//     counted).
//
// Secrets: the survey blob is scrubbed AT CAPTURE through the one
// `SECRET_PATTERNS` inventory, before it becomes a prompt ingredient or a record
// — a log that captures a key captures it forever.

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { Gate } from 'bareguard';
import { LiteCtx } from 'litectx';
import { seedListing } from './kinds.js';
import { TOOL_MENU, WRITE_VERBS, STORE_VERBS } from './job.js';
import { TOOL_BY_VERB, CTX_TOOLS, createCtxTools, toolAction, strategyFor } from './tools.js';
import { redactSecrets, SECRET_PATTERNS } from './validate.js';
import { extractArtifact, priceOf, scrubRaw, stampRaw } from './text.js';

const require = createRequire(import.meta.url);
const { Loop, wireGate } = require('bare-agent');
const { createShellTools } = require('bare-agent/tools');

/** src/planrun.js:42 — the survey's hard round bound. */
export const AUTHOR_SCOUT_ROUNDS = 8;
/** src/planrun.js:44 — the survey is a PROMPT INGREDIENT for the authoring call. */
export const AUTHOR_SCOUT_BLOB_MAX = 8000;
/**
 * src/planrun.js:62 — below this a survey is ABSENT, not empty. Sized off the
 * archive rather than taste: 15 truncated scouts produced 0/74/86 bytes; every
 * real survey was 5991-8056. It is imported as a NUMBER, not as an import, on
 * purpose — planrun does not export it, and a `SCOUT_MIN_BYTES` that drifts
 * between the two scouts is two instruments, so the suite pins them equal.
 */
export const AUTHOR_SCOUT_MIN_BYTES = 200;
/** F30 — the 4096 provider default cannot hold a whole survey. */
export const AUTHOR_SCOUT_MAX_TOKENS = 32000;

/**
 * TOTAL survey attempts, HARDCODED (hamr, 2026-08-09: *"depending on causes, we
 * can hardcode 3 attempts, but if reasons are beyond malformed then we may verge
 * into self-healing but i don't think we should"*).
 *
 * It is a ceiling, not a target: an operator may pass a LOWER cap and never a
 * higher one, exactly the direction the standing budget rule runs in (*the agent
 * may only TIGHTEN*). A widened value CLAMPS here rather than throwing, because
 * the number is not a signed artefact — nothing downstream depends on a caller
 * having asked for the right one, and refusing a run over a too-generous cap
 * costs a paid scout for no safety.
 *
 * Sited beside `MAX_REVISIONS`/`MAX_STRUCTURE_RETRIES` in spirit: the same
 * bounded-retry family, one axis each. This one is the SURVEY's axis.
 */
export const SCOUT_ATTEMPTS = 3;

/**
 * THE TYPED CAUSE, at the detection site.
 *
 * The retry gate reads this enum and nothing else. Typing it here is what stops
 * the gate quietly widening to "any ABSENT" the next time someone edits the
 * classifier: a new route to ABSENT has to be named, and naming it is the moment
 * somebody decides whether it retries.
 */
export const SURVEY_CAUSES = Object.freeze({
  /** the call itself died — provider error, transport, `truncated:max_tokens` */
  CALL_FAILED: 'call-failed',
  /** the model returned nothing at all, and nothing went wrong to explain it */
  EMPTY: 'empty',
  /** short of the ABSENT floor but not empty — F59's cut-off population */
  SHORT: 'short',
  /** nothing extractable in the reply */
  NO_ARTIFACT: 'no-artifact',
  /** there IS a body and it is not JSON — run mslhn707's own death */
  UNPARSEABLE: 'unparseable',
  /** valid JSON, wrong shape */
  NON_OBJECT: 'non-object',
  /** valid JSON, no content — F59's whole point, and a SEMANTIC failure */
  EMPTY_OBJECT: 'empty-object',
});

/**
 * THE MALFORMED CLASS — the only causes a retry fires on.
 *
 * What is deliberately NOT here, and why:
 *   - `call-failed` covers `truncated:max_tokens` and every transport death.
 *     Standing doctrine routes both as provider-red with NO redraft; a retry
 *     here would pay for the same failure again under a different name.
 *   - `short` is F59's cut-off population, and it already has an instrument: the
 *     reserved TOOLLESS recovery round, which fires inside the attempt.
 *   - `non-object` and `empty-object` are VALID JSON with wrong or vacuous
 *     content. That is a SEMANTIC failure, and F38/F39 measured what re-asking
 *     one buys: the same distribution, sampled twice. Reacting to content is a
 *     designed loop; this is a retry. The line between them is the self-healing
 *     line, and it is not crossed here.
 */
/** @type {readonly string[]} */
export const SCOUT_RETRY_CAUSES = Object.freeze([SURVEY_CAUSES.EMPTY, SURVEY_CAUSES.UNPARSEABLE]);

/**
 * The re-ask, when the survey came back MALFORMED. It names what failed
 * MECHANICALLY — the parse error and its position — which is the gap genre that
 * converts (F38/F39), and it says explicitly that the FINDINGS are not in
 * question, only their form.
 *
 * There is NO JSON repair anywhere behind this and there never will be: a
 * repairer decides what the model meant to say and writes it down as though the
 * model had said it. That is a dishonest instrument in the one artefact whose
 * entire job is to be honest about what the repository contains.
 * @param {string} reason the classifier's own mechanical reason
 */
export function scoutReaskTurn(reason) {
  return `MEASURED PARSE — your survey could not be read:\n  ${redactSecrets(String(reason ?? ''))}\n\n`
    + 'The facts you found are not in question — only the form was unreadable. Do not go looking again and do not '
    + 'change what you reported. Reply with ONLY the JSON object, in a single fenced block, and nothing else.';
}

/**
 * THE GRANT: the full menu MINUS every write-class and store-class verb.
 * Read-only by MENU CONSTRUCTION — no write-class tool object is ever built, so
 * there is nothing for a fence to have to refuse. Derived from the shipped
 * constants so a verb added to `TOOL_MENU` is covered the day it lands.
 */
export const AUTHOR_SCOUT_VERBS = Object.freeze(
  TOOL_MENU.filter((v) => !WRITE_VERBS.includes(v) && !STORE_VERBS.includes(v)),
);

export const SCOUT_SYSTEM = 'You are a senior engineer performing a READ-ONLY survey of a repository. '
  + 'ALWAYS use absolute paths — relative paths resolve against the process, not the repository, and will be denied. '
  + 'You cannot write, and you cannot run commands: you have no shell and no test runner, so every statement you make '
  + 'is read off configuration, source, lockfiles and documentation. '
  + 'You have a hard, small number of exploration turns. Read only what you need. '
  + 'Your single deliverable is a facts object about how this repository is BUILT, TYPE-CHECKED and TESTED. '
  + 'You are not deciding what should be done to it and you are not proposing any work.';

/**
 * F59's reserved round, as a FIXED constant. The round is toolless BY
 * CONSTRUCTION (`defs` is `[]`, so text is the only output the model can
 * produce) — never by asking politely in prose (F19/F37).
 */
export const SCOUT_RECOVERY_PROMPT = 'You are out of exploration turns. Write the facts object NOW, from what you '
  + 'have already read. Reply with ONLY the JSON object in a single fenced block.';

/**
 * The survey brief. Deliberately NEUTRAL about what anyone will do with the
 * facts: this scout is not allowed to have an opinion about the work, because
 * the authoring call is the only thing that composes a close (D11).
 * @param {string} workdir the ABSOLUTE repository root
 */
export function scoutPrompt(workdir) {
  return `Repository root (absolute): ${workdir}

Survey this repository and report how it is type-checked and tested. You cannot execute
anything, so mark anything you infer rather than read as "inferred".

Report, as a single JSON object, with these keys — use null for anything you genuinely
could not establish, and never guess a command you did not find written down somewhere:

{
  "language":        e.g. "javascript" | "typescript" | "python" | ...,
  "runner":          the test runner this repository actually uses,
  "typecheck":       { "cmd": "<executable>", "args": ["..."], "cwd": "<relative dir or null>",
                       "env": {"NAME": "value"} | {}, "source": "<where you read this>",
                       "inferred": true|false },
  "test":            { "cmd": "<executable>", "args": ["..."], "cwd": "<relative dir or null>",
                       "env": {"NAME": "value"} | {}, "source": "<where you read this>",
                       "inferred": true|false },
  "envNeeds":        [ { "name": "...", "value": "...", "why": "..." } ],
  "sourcePaths":     ["..."],
  "testPaths":       ["..."],
  "extensions":      [".js", ...],
  "outputShapes":    { "typecheckErrorLine": "<the literal shape of one diagnostic line>",
                       "testSummaryLine": "<the literal shape of the runner's count summary line>",
                       "inferred": true|false },
  "layout":          "<one or two sentences: packages, nesting, anything unusual>",
  "notes":           ["anything else load-bearing for grading work done in this repository"]
}

On "envNeeds": include any environment variable WITHOUT WHICH the type checker or the test
runner would resolve to the wrong files, cache stale results, or emit output that cannot be
parsed. Say why, in the "why" field. If there are none, use [].

Reply with ONLY the JSON object, in a single fenced block. No commentary before or after.`;
}

/**
 * @typedef {{bytes: number, rounds: number, bounded: boolean, recovered: boolean, error: string|null,
 *   attempts?: number, attemptsAllowed?: number}} SurveyMeta
 * @typedef {{state: 'PRESENT'|'ABSENT', facts: any, reason: string|null, cause: string|null, meta: SurveyMeta}} Survey
 */

/**
 * THE F59 CONTRACT, IN CODE. Six routes to ABSENT, one route to PRESENT — and
 * the LAST of them is the whole point of the finding: a parsed `{}` is the
 * scout FAILING, never "no special facts are needed".
 *
 * Every ABSENT route also carries a TYPED `cause` beside its prose reason. The
 * prose is for the operator; the type is what the retry gate reads, so widening
 * that gate requires editing the enum rather than a regular expression over a
 * sentence (the standing rule: hand over the enumerated set, never a rule about
 * prose). `empty` is split OUT of the byte floor for exactly that reason — "the
 * model said nothing" and "the model was cut off mid-sentence" are two findings
 * that used to render as one number.
 * @param {string} blob the scrubbed, capped survey text
 * @param {SurveyMeta} meta
 * @returns {Survey}
 */
export function classifySurvey(blob, meta) {
  const absent = (/** @type {string} */ reason, /** @type {string} */ cause) => ({
    state: /** @type {'ABSENT'} */ ('ABSENT'), facts: null, reason, cause, meta,
  });
  if (meta.error) return absent(`the survey call failed: ${meta.error}`, SURVEY_CAUSES.CALL_FAILED);
  if (String(blob ?? '').trim() === '') {
    return absent('the survey came back EMPTY and nothing failed to explain it — the scout did not complete', SURVEY_CAUSES.EMPTY);
  }
  if (meta.bytes < AUTHOR_SCOUT_MIN_BYTES) {
    return absent(`survey ${meta.bytes} bytes < ${AUTHOR_SCOUT_MIN_BYTES} — the scout did not complete`, SURVEY_CAUSES.SHORT);
  }
  const { code, red } = extractArtifact(blob);
  if (!code) return absent(`no artifact in the survey: ${red}`, SURVEY_CAUSES.NO_ARTIFACT);
  let parsed;
  try { parsed = JSON.parse(code); } catch (e) {
    return absent(`the survey did not parse as JSON: ${String(/** @type {any} */ (e)?.message ?? e)}`, SURVEY_CAUSES.UNPARSEABLE);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return absent('the survey parsed to a non-object', SURVEY_CAUSES.NON_OBJECT);
  }
  if (Object.keys(parsed).length === 0) {
    return absent('the survey parsed to an EMPTY object — that is the scout not completing, never "no special facts are needed"', SURVEY_CAUSES.EMPTY_OBJECT);
  }
  return { state: 'PRESENT', facts: parsed, reason: null, cause: null, meta };
}

/**
 * The DEFAULT surveyor: a real bareguard fence plus the granted read-only tools.
 * Read-only TWICE OVER — the menu carries no write verb, and the fence grants no
 * write path — and the arbiter's own books are denied outright, exactly as every
 * worker's are.
 *
 * It is a seam because it is the only part of this module that needs a live
 * process, an index and a gate; the ROUND BOUND and the F59 recovery stay in
 * `runAuthorScout` where they can be proven.
 * @param {{workdir: string, granted: readonly string[], auditPath?: string, ctx?: boolean}} o
 */
export async function defaultSurveyor({ workdir, granted, auditPath = join(workdir, 'gate-audit.jsonl'), ctx = true }) {
  const gate = new Gate({
    fs: { writeScope: [], readScope: [workdir], deny: [auditPath, join(workdir, '.smoke'), join(workdir, '.litectx')] },
    limits: { maxTurns: AUTHOR_SCOUT_ROUNDS + 2 },
    audit: { path: auditPath },
    secrets: { patterns: SECRET_PATTERNS },
    humanChannel: async () => ({ decision: 'terminate' }),
  });
  await gate.init();
  const { policy, onLlmResult } = wireGate(gate, {
    actionTranslator: (/** @type {string} */ n, /** @type {any} */ a) => toolAction(n, a, workdir),
  });

  const names = new Set(granted.map((v) => /** @type {Record<string,string>} */ (TOOL_BY_VERB)[v]));
  const shell = createShellTools().tools.filter((/** @type {{name: string}} */ t) => names.has(t.name));
  /** @type {any[]} */
  let ctxTools = [];
  if (ctx && [...CTX_TOOLS].some((t) => names.has(t))) {
    const lc = new LiteCtx({ root: workdir });
    await lc.index({ yield: true });
    ctxTools = createCtxTools(lc, workdir, () => {}).filter((/** @type {{name: string}} */ t) => names.has(t.name));
  }
  return { tools: [...shell, ...ctxTools], policy, onLlmResult, cleanup: async () => {} };
}

/** the default loop seam — one spelling of how this repo drives a model */
const defaultLoop = (/** @type {any} */ { system, policy, onLlmResult, provider }) =>
  new Loop({ provider, system, policy, onLlmResult });

/**
 * Run the authoring scout.
 *
 * `createLoop` and `createSurveyor` are the two seams, both REAL by default. The
 * round bound, F59's reserved round, the blob cap, the scrub and the
 * classification all live HERE rather than behind a seam, because those are the
 * behaviours the finding is about.
 *
 * THE ATTEMPT LADDER (hamr, 2026-08-09) sits OUTSIDE all of that, and it fires
 * on the typed malformed class only — see `SCOUT_RETRY_CAUSES` for what is
 * deliberately excluded and why. Attempt 1 is the full survey; a re-ask is
 * TOOLLESS over the conversation the survey already produced, because the model
 * has already READ the repository and only its final emission was unreadable —
 * re-paying the exploration would buy the same facts twice. Every attempt is a
 * paid call, metered under its own label, and every attempt's raw text is
 * persisted so the malformation can be READ later rather than remembered.
 *
 * ONE FALLBACK, stated because the code has it: a retry with NO conversation to
 * re-ask over re-runs the FULL toolable survey instead. The toolless form rests
 * entirely on "the model already read the tree", and an empty transcript is that
 * premise gone — re-asking over nothing would be a bare "say it again" to a model
 * that was never shown the repository. Re-surveying costs the exploration twice;
 * the alternative buys a second sample of noise. It is not reachable through the
 * shipped Loop (whose `msgs` starts from the caller's own messages and is never
 * empty) and it is reachable through the `createLoop` seam, so it is a fail-safe
 * with a test rather than a promise with a comment.
 *
 * @param {{workdir: string, provider?: any,
 *   rounds?: number, minBytes?: number, blobMax?: number, maxTokens?: number, ctx?: boolean,
 *   attempts?: number,
 *   createLoop?: (o: {system: string, policy: any, onLlmResult: any, provider: any}) => any,
 *   createSurveyor?: (o: {workdir: string, granted: readonly string[], ctx: boolean}) => Promise<any>}} o
 * @returns {Promise<Survey & {raw: string, raws: ReturnType<typeof scrubRaw>[],
 *   calls: {label: string, costUsd: number|null, unpricedRounds: number}[]}>}
 */
export async function runAuthorScout({
  workdir, provider = null,
  rounds = AUTHOR_SCOUT_ROUNDS,
  minBytes = AUTHOR_SCOUT_MIN_BYTES,
  blobMax = AUTHOR_SCOUT_BLOB_MAX,
  maxTokens = AUTHOR_SCOUT_MAX_TOKENS,
  ctx = true,
  attempts = SCOUT_ATTEMPTS,
  createLoop = defaultLoop,
  createSurveyor = defaultSurveyor,
}) {
  const granted = AUTHOR_SCOUT_VERBS;
  const system = SCOUT_SYSTEM + strategyFor([...granted]);
  const surveyor = await createSurveyor({ workdir, granted, ctx });
  /** @type {{label: string, costUsd: number|null, unpricedRounds: number}[]} */
  const calls = [];
  /** @type {ReturnType<typeof scrubRaw>[]} */
  const raws = [];
  /**
   * ONE recorder for a model call: the cost entry and the persisted raw are
   * written together, so a call can never be metered without leaving its output
   * on the trail (or leave output nobody paid for). The pairing is the audit's
   * own invariant, and the suite pins it.
   * Returns the raw's INDEX, so the caller can attach the verdict to the
   * emission it actually describes — see `verdictAt` below.
   * @param {string} label @param {number} attempt @param {any} r @returns {number}
   */
  const record = (label, attempt, r) => {
    calls.push({ label, ...priceOf(r) });
    return raws.push(scrubRaw({ label, attempt, text: r?.text })) - 1;
  };
  // TIGHTEN-ONLY: an operator may lower the ceiling, never raise it. A garbage
  // value floors at one attempt rather than at zero — a scout that never ran is
  // an ABSENT nobody can act on.
  const allowed = Math.max(1, Math.min(Math.trunc(Number(attempts)) || 1, SCOUT_ATTEMPTS));

  try {
    /** @type {Survey|null} */
    let survey = null;
    let blob = '';
    /** the conversation the last call left behind — what a re-ask re-asks OVER */
    /** @type {any[]|null} */
    let lastMsgs = null;
    let attempt = 0;
    /** which persisted raw the current verdict actually describes. NOT simply
     * "the last one": a recovery round that came back SMALLER is DISCARDED, and
     * the blob being classified is then the first call's — stamping the verdict
     * on the recovery's raw would attribute a failure to an emission nobody
     * judged. An instrument that misaddresses its own reading is the blind
     * -instrument class, one field wide. */
    let verdictAt = -1;

    while (attempt < allowed) {
      attempt += 1;
      const label = attempt === 1 ? 'author-scout' : `author-scout#${attempt}`;

      if (attempt === 1 || !lastMsgs?.length) {
        // The round bound is the plan scout's own mechanism: `loop.stop()` read
        // at the round boundary. It cannot cut an in-flight call (F61) — it
        // bounds the NEXT round, which is exactly why F59's reserved round
        // exists at all.
        let seen = 0;
        let bounded = false;
        /** @type {any} */
        let loop = null;
        const metered = async (/** @type {any} */ arg) => {
          if ((arg?.kind ?? 'turn') === 'turn') {
            seen += 1;
            if (seen >= rounds) { bounded = true; loop.stop(); }
          }
          return surveyor.onLlmResult ? surveyor.onLlmResult(arg) : undefined;
        };
        loop = createLoop({ system, policy: surveyor.policy, onLlmResult: metered, provider });

        const r = await loop.run([{ role: 'user', content: scoutPrompt(workdir) }], surveyor.tools,
          { cacheMessages: true, maxTokens });
        verdictAt = record(label, attempt, r);
        blob = redactSecrets(String(r?.text ?? '')).slice(0, blobMax);
        lastMsgs = Array.isArray(r?.msgs) && r.msgs.length ? r.msgs : null;
        let recovered = false;
        /** the recovery call's own result, held in scope so its FAILURE is visible
         * to the classifier — `null` whenever the recovery never fired */
        /** @type {any} */
        let s2 = null;

        // F59's reserved TOOLLESS final round. It fires on the ONE population it
        // was sized for — a survey that was CUT OFF and came back short — never
        // on a survey that simply finished with little to say.
        if (bounded && Buffer.byteLength(blob) < minBytes && Array.isArray(r?.msgs) && r.msgs.length) {
          const recovery = createLoop({ system, policy: surveyor.policy, onLlmResult: surveyor.onLlmResult, provider });
          s2 = await recovery.run([...r.msgs, { role: 'user', content: SCOUT_RECOVERY_PROMPT }], [],
            { cacheMessages: true, maxTokens });
          const recoveryAt = record('author-scout-recovery', attempt, s2);
          const t = redactSecrets(String(s2?.text ?? '')).slice(0, blobMax);
          // the verdict follows the blob that WON, never the call that came last
          if (Buffer.byteLength(t) > Buffer.byteLength(blob)) { blob = t; recovered = true; verdictAt = recoveryAt; }
          if (Array.isArray(s2?.msgs) && s2.msgs.length) lastMsgs = s2.msgs;
        }

        // The RECOVERY's error first, when it fired. It is the call that produced
        // (or failed to produce) the blob being classified, so its death is what
        // describes the survey; the first call's error belongs to the very call
        // the recovery exists to replace, and a recovery dying of
        // `truncated:max_tokens` after a clean-but-bounded first round reported
        // no error at all. Falling back to `r.error` keeps every other
        // classification unchanged.
        survey = classifySurvey(blob, {
          bytes: Buffer.byteLength(blob), rounds: seen, bounded, recovered,
          error: s2?.error ?? r?.error ?? null,
          attempts: attempt, attemptsAllowed: allowed,
        });
      } else {
        // THE RE-ASK. Toolless by construction, over the survey's own
        // conversation, naming only what failed mechanically.
        const reask = createLoop({ system, policy: surveyor.policy, onLlmResult: surveyor.onLlmResult, provider });
        const rr = await reask.run(
          [...lastMsgs, { role: 'user', content: scoutReaskTurn(/** @type {Survey} */ (survey).reason ?? '') }], [],
          { cacheMessages: true, maxTokens },
        );
        verdictAt = record(label, attempt, rr);
        blob = redactSecrets(String(rr?.text ?? '')).slice(0, blobMax);
        if (Array.isArray(rr?.msgs) && rr.msgs.length) lastMsgs = rr.msgs;
        survey = classifySurvey(blob, {
          bytes: Buffer.byteLength(blob), rounds: 1, bounded: false, recovered: false,
          error: rr?.error ?? null, attempts: attempt, attemptsAllowed: allowed,
        });
      }

      // the raw that describes THIS attempt carries the attempt's own verdict —
      // the raw is the autopsy artifact, and an autopsy without a cause of death
      // is a body. STAMPED rather than assigned: `reason` quotes the transport's
      // own error prose (`classifySurvey`'s CALL_FAILED route) and this record is
      // persisted, so it rides the same one boundary the raw's text already did.
      const mine = raws[verdictAt];
      if (mine) stampRaw(mine, { cause: survey.cause, reason: survey.reason });

      if (survey.state === 'PRESENT') break;
      if (!SCOUT_RETRY_CAUSES.includes(/** @type {string} */ (survey.cause))) break;
    }

    const final = /** @type {Survey} */ (survey);
    // Exhaustion is still the same honest ABSENT — it now says how many times we
    // paid to find out. One attempt says nothing about retries, because there
    // were none.
    const reason = final.reason !== null && attempt > 1 ? `${final.reason} — after ${attempt} attempts` : final.reason;
    return { ...final, reason, raw: blob, raws, calls };
  } finally {
    // a leaked surveyor leaks a gate handle and a litectx index — always, even
    // when the loop threw
    await surveyor.cleanup();
  }
}

// ── L1: THE MECHANICAL SEED LISTING ──────────────────────────────────────────

/** per-path full-listing cap; over it, names give way to counted directories */
export const LIST_CAP = 40;
/** whole-block ceiling — the block is a prompt ingredient, like the survey */
export const LISTING_BYTE_CAP = 12000;
/** how many bare file NAMES survive the deepest tier of a flat directory */
export const COUNTS_ONLY_NAMES = 12;

/**
 * A surveyor writes prose into path entries (`"src/aurora_cli (symlink)"`,
 * `"src (also …)"`). Strip the annotation, keep the path.
 * @param {any} e
 */
export const cleanEntry = (e) => String(e ?? '').split(' (')[0].trim().replace(/\/+$/, '');

/**
 * `git ls-tree -r --name-only <seed>` — the files as of the SEED COMMIT.
 * Deliberately NOT `ls-files`, which reads the index and the working tree: this
 * listing is what a path is judged against, and it must describe the tree the
 * close will be measured from, not whatever is lying around today.
 *
 * A fault comes back as a named `stop`, never as an empty list — an unreadable
 * listing that rendered as "no files" would fail every path in the declaration
 * for the wrong reason.
 * `files` is spelled `null` on the stop branch rather than left off: a caller
 * that destructures the failure and finds `undefined` reads it as falsy, which
 * is the "absent renders as empty" shape this whole module exists to refuse.
 *
 * The command itself lives in `src/kinds.js` beside the executor's other git
 * reads (`seedListing`) — the declared close's runtime gate judges paths against
 * the SAME listing this scout hands the author, and two spellings of "what
 * exists at the seed" would be two instruments.
 * @param {string} workdir @param {string} seedRef
 * @returns {Promise<{stop: string, files: null}|{stop: null, files: string[]}>}
 */
export async function seedFileList(workdir, seedRef) {
  return seedListing(workdir, seedRef);
}

/** `src/*` style entries match by segment; everything else is a path prefix.
 * @param {string} entry @returns {(f: string) => boolean} */
function matcherFor(entry) {
  if (entry.includes('*')) {
    const rx = new RegExp(`^${entry.split('*').map((seg) => seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}(/|$)`);
    return (f) => rx.test(f);
  }
  return (f) => f === entry || f.startsWith(`${entry}/`);
}

/**
 * Render ONE scoped entry. Three outcomes, and each one is stated in full:
 * nothing matched (say so — an invented source path is the failure this block
 * exists to prevent), under the cap (every name), or over it (direct children in
 * full, deeper files as COUNTED directories, with the trim announced). No file is
 * ever silently dropped: F28's rule is that a bound eats detail, never evidence.
 * @param {string} entry @param {string[]} all @param {number} cap @param {boolean} countsOnly
 */
function renderEntry(entry, all, cap, countsOnly) {
  const files = all.filter(matcherFor(entry));
  if (files.length === 0) return { lines: [`under ${entry} — NO FILES EXIST at the seed (this path matches nothing)`], count: 0 };
  const depth = entry.split('/').length;
  /** @type {(f: string) => string} */
  const groupKey = (f) => {
    const segs = f.split('/');
    return segs.length > depth + 1 ? `${segs.slice(0, depth + 1).join('/')}/` : f;
  };
  if (countsOnly) {
    /** @type {Map<string, number>} */
    const groups = new Map();
    for (const f of files) groups.set(groupKey(f), (groups.get(groupKey(f)) ?? 0) + 1);
    // A FLAT directory has no subdirectories to collapse into, so grouping alone
    // shrinks nothing — 800 files under `src/` render as 800 names at every tier,
    // and the "deepest tier" would be no smaller than the first. The names are
    // what gets capped here; the TOTAL on the first line is complete either way.
    const dirs = [...groups].filter(([k]) => k.endsWith('/'));
    const named = [...groups].filter(([k]) => !k.endsWith('/')).map(([k]) => k);
    const shown = named.slice(0, COUNTS_ONLY_NAMES);
    return {
      lines: [
        `under ${entry} — ${files.length} files:`,
        ...dirs.map(([k, n]) => `  ${k} — ${n} files`),
        ...shown.map((k) => `  ${k}`),
        ...(named.length > shown.length
          ? [`  [${named.length - shown.length} of ${named.length} file names not printed — the counts above are complete]`]
          : []),
      ],
      count: files.length,
    };
  }
  if (files.length <= cap) {
    return { lines: [`under ${entry} — ${files.length} files:`, ...files.map((f) => `  ${f}`)], count: files.length };
  }
  /** @type {string[]} */ const direct = [];
  /** @type {Map<string, number>} */ const subdirs = new Map();
  for (const f of files) {
    if (f.split('/').length === depth + 1) direct.push(f);
    else subdirs.set(groupKey(f), (subdirs.get(groupKey(f)) ?? 0) + 1);
  }
  const withheld = files.length - direct.length;
  return {
    lines: [
      `under ${entry} — ${files.length} files; direct children listed in full, deeper files counted per directory:`,
      ...direct.map((f) => `  ${f}`),
      ...[...subdirs].map(([k, n]) => `  ${k} — ${n} files`),
      `  [listing trimmed: ${withheld} of ${files.length} files are behind the directory counts above — the full-list `
      + `cap is ${cap} per path; every file is counted, none is hidden]`,
    ],
    count: files.length,
  };
}

/**
 * THE SEED LISTING, both halves.
 *
 * `files` is the WHOLE tree and is what the validator judges paths against.
 * `block` is SCOPED to the survey's own sourcePaths/testPaths and is what the
 * prompt carries. Giving the validator the scoped half instead would make a job
 * scoped to `src/` read as whole-tree, and M2's one-population law — which fires
 * only on a SCOPED job — would silently stop firing.
 *
 * @param {{workdir: string, seedRef: string, sourcePaths?: any, testPaths?: any,
 *   listCap?: number, byteCap?: number}} o
 * @returns {Promise<{stop: string, files: null, block: null, meta: null}
 *   |{stop: null, files: string[], block: string, meta: {seedRef: string, totalSeedFiles: number,
 *     entries: {entry: string, raw: string, section: string, matched: number}[], tier: string}}>}
 */
export async function buildSeedListing({ workdir, seedRef, sourcePaths, testPaths, listCap = LIST_CAP, byteCap = LISTING_BYTE_CAP }) {
  const listed = await seedFileList(workdir, seedRef);
  if (listed.stop !== null) return { stop: listed.stop, files: null, block: null, meta: null };
  const all = listed.files;

  /** @type {{raw: string, entry: string, section: string}[]} */
  const entries = [];
  const seen = new Set();
  for (const [section, list] of /** @type {[string, any][]} */ ([['sourcePaths', sourcePaths], ['testPaths', testPaths]])) {
    for (const raw of Array.isArray(list) ? list : []) {
      const entry = cleanEntry(raw);
      if (!entry || seen.has(entry)) continue;
      seen.add(entry);
      entries.push({ raw: String(raw), entry, section });
    }
  }

  const render = (/** @type {number} */ cap, /** @type {boolean} */ countsOnly) => {
    const lines = [
      'FILES THAT ACTUALLY EXIST AT THE SEED — listed mechanically from the repository tree',
      'itself (git ls-tree at the seed commit), not by the surveyor. A source or test path not',
      'in this list DOES NOT EXIST, whatever it sounds like it should be called.',
      '',
    ];
    /** @type {{entry: string, raw: string, section: string, matched: number}[]} */
    const meta = [];
    for (const e of entries) {
      const r = renderEntry(e.entry, all, cap, countsOnly);
      meta.push({ entry: e.entry, raw: e.raw, section: e.section, matched: r.count });
      lines.push(`[${e.section}] ${r.lines[0]}`, ...r.lines.slice(1), '');
    }
    return { text: lines.join('\n').trimEnd(), meta };
  };

  // Deterministic degradation, each tier ANNOUNCED: full → tight → counts-only.
  // Counts stay complete at every tier; only names give way.
  //
  // "full" is rendered ONCE, here, and TIERS holds only the degradations — the
  // loop's job is to fall back, never to re-render the tier it was handed.
  // (`render` walks the whole seed listing per scoped entry, so rendering full
  // twice was the listing's own cost paid twice on every run that never needed
  // to degrade at all — which is every ordinary run.)
  /** @type {[string, number, boolean][]} */
  const TIERS = [['tight', 12, false], ['counts-only', 0, true]];
  let tier = 'full';
  let out = render(listCap, false);
  for (const [name, cap, countsOnly] of TIERS) {
    if (Buffer.byteLength(out.text) <= byteCap) break;
    tier = name;
    out = render(cap, countsOnly);
  }
  let block = out.text;
  let note = tier === 'full' ? ''
    : `[whole-listing cap: a full listing exceeds ${byteCap} bytes, so this block was reduced to tier "${tier}" — `
      + 'counts are complete even where names are not]';

  // THE BACKSTOP. Enough scoped paths, each with enough subdirectories, can beat
  // every tier — and this block is a PROMPT INGREDIENT, so "usually small" is not
  // a bound. Truncation is line-wise (a byte cut would split a multi-byte
  // character) and is ANNOUNCED with its count; the totals it printed above the
  // cut stay true.
  if (Buffer.byteLength(block) > byteCap) {
    /** @type {string[]} */
    const kept = [];
    let bytes = 0;
    let cut = 0;
    for (const line of block.split('\n')) {
      const b = Buffer.byteLength(line) + 1;
      if (bytes + b > byteCap) { cut += 1; continue; }
      bytes += b;
      kept.push(line);
    }
    block = kept.join('\n');
    note = `[whole-listing cap: even at tier "${tier}" this block exceeds ${byteCap} bytes, so ${cut} line(s) were cut. `
      + 'Every count printed above is complete — but a path you cannot see here is a path you must not assume exists.]';
  }
  if (note) block = `${block}\n\n${note}`;

  return { stop: null, files: all, block, meta: { seedRef, totalSeedFiles: all.length, entries: out.meta, tier } };
}
