// THE TWO SIGNED ARTIFACTS — softgreen module 4 (design record
// docs/02-features/2026-08-17-softgreen-review-door-design.md §4.3 and §4.4,
// plus the 2026-08-18 threshold addendum).
//
// Module 1 built the judged floor's core, module 2 wired the stage into a close,
// module 3 opened the class and asked the two extra questions. Nothing compiled
// their answers. This module does exactly that and nothing more:
//
//   Q6  → THE RUBRIC CARD      (§4.3) — the person's own pass/fail lines, as
//                                ENUMERATED items over the arbiter's own rulebook.
//   Q7  → THE CALIBRATION SET  (§4.4) — TEN cases, frozen, that the whole pipe
//                                must grade before the close is signable.
//
// ── THE D5 PATH, AND WHY IT IS THIS ONE ─────────────────────────────────────
//
// Both artifacts are SHOWN AND FIXED: an LLM proposes the extractable rewrite of
// what the person said, the SIGNER fixes it, and THE FIXED VERSION IS WHAT IS
// STORED — enumerated inside the spec hash, so a card line or a case is a re-sign
// exactly like every other spec edit. Asking the person to write the rubric
// themselves is the SWE tax this product refuses; letting the model's draft ride
// unsigned is the arbiter authored by a model. The signer in the middle is the
// whole design.
//
// ── WHAT THIS MODULE DOES NOT DO ────────────────────────────────────────────
//
//   * IT DOES NOT GRADE. The calibration GATE — running LOCATE and `decide()`
//     over the ten and refusing a signature on anything short of 10/10 with
//     itemized reds, alongside the upstream INJECTION_BATTERY — is module 5. What
//     is built here is what that gate reads.
//   * IT STORES NO INJECTION CASES. The battery is upstream's and it is module
//     5's to run; a copy of it stored here would be a second inventory of
//     somebody else's evidence.
//   * IT PICKS NO NUMBER. `CALIBRATION_SIZE` is hamr's own ruling, verbatim
//     (*"go build 10, we could double later"*). It is operator territory and a
//     size change is a spec-level threshold change — the standing
//     no-agent-threshold-picking rule binds here exactly as everywhere else.
//   * IT ADMITS NO DOC-GENRE ARTIFACT. A case is code-genre text, because the
//     catalogue is code-genre only.
//
// ── THE CASE SHAPE, AND WHY EACH FIELD EXISTS ───────────────────────────────
//
//   { id, artifact, expect: { verdict: "pass"|"red", reds: [{ rule, fn }] } }
//
//   `artifact`  REAL TEXT — a file excerpt from the patient or a realistic
//               snippet the signer edits. It is what LOCATE will be pointed at,
//               so it is the artifact and never a description of one.
//   `verdict`   what `decide()` must render. Two values, both reachable.
//   `reds`      the ITEMIZED expectation, and the floor is itemized reds rather
//               than verdict-match: a pipe that reds the right case for the wrong
//               reason has not been calibrated, it has been lucky. `rule` selects
//               from the CARD's own lines (a case cannot expect a red from a line
//               the card never named — §4.3's ceiling, made mechanical), and `fn`
//               names the function the red lands on, which is the address
//               `decide()` itself reports.
//
// WHAT IS DELIBERATELY NOT STORED: the red's `why` and its `quote`. Both are the
// judge's own prose about a specific emission, and a signer cannot predict either
// — pinning them would fail an honest pipe on wording. `expectedOf` is the one
// spelling of that reduction, so the shape the signer stores and the shape the
// pipe produces are one shape read twice (module 5 compares them mechanically).

import {
  JUDGE_RULE_IDS, JUDGE_RULES, CALIBRATION_SIZE, CASE_VERDICTS, validateJudgedArtifacts,
} from './judged.js';
import { askStructured, makeCostBook } from './authorflow.js';
import { isObj, redactSecrets } from './validate.js';

/** @typedef {{code: string, path: string, detail: string, [k: string]: any}} Red */

// ── THE NUMBERS, ALL OPERATOR-SET ───────────────────────────────────────────
//
// `CALIBRATION_SIZE` and `CASE_VERDICTS` are imported from `src/judged.js`, never
// re-spelled: what a legal set IS belongs to the arbiter beside the rulebook, and
// a second copy of the size here is a second threshold to keep in step.

/** the output channel for the compile. It takes no action; it carries the answer. */
export const PROPOSAL_TOOL_NAME = 'propose_rubric';
/** what the tool returns. The loop stops on delivery, so the model never reads it. */
export const PROPOSAL_ACK = 'proposal received';
/** the label the compile call is metered and persisted under — one spelling */
export const PROPOSAL_LABEL = 'judged-compile';
/** a malformed EMISSION is a transport fault, bounded on its own axis — the same
 * ceiling `authorClose` declares for the declaration channel */
export const MAX_PROPOSAL_RETRIES = 2;

// ── 1. THE SCHEMA — the closed sets, handed over ────────────────────────────

/**
 * The proposal's shape, and therefore the whole shape the compiler can express.
 *
 * `rule` is an ENUM off the judge's own rulebook in BOTH places it appears — the
 * card's lines and a case's expected reds — because wherever only a closed set
 * can satisfy a field, the illegal value is made INEXPRESSIBLE rather than
 * rejected after the fact (the `check-passes(name)` model). The SIZE is pinned by
 * `minItems`/`maxItems` from the one constant, so nine and eleven are both
 * unsayable rather than argued about afterwards.
 *
 * `artifact` and `text` are the only free strings, and neither decides anything:
 * one is the code the judge will read, the other is the signer's own words.
 */
export function proposalSchema() {
  const ruleEnum = { enum: [...JUDGE_RULE_IDS], description: 'which owned rule this line asserts' };
  return {
    type: 'object',
    properties: {
      card: {
        type: 'object',
        description: 'the rubric, as enumerated items: one line per thing the person actually looks for, in the '
          + 'order they look for them.',
        properties: {
          items: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                rule: ruleEnum,
                text: { type: 'string', minLength: 1, description: 'what this line means, in the person\'s own words' },
              },
              required: ['rule', 'text'],
              additionalProperties: false,
            },
          },
        },
        required: ['items'],
        additionalProperties: false,
      },
      cases: {
        type: 'array',
        minItems: CALIBRATION_SIZE,
        maxItems: CALIBRATION_SIZE,
        description: `exactly ${CALIBRATION_SIZE} calibration cases, and at least one of each verdict — a set that `
          + 'cannot fail one way proves nothing',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', minLength: 1, description: 'a unique lowercase-hyphenated slug' },
            artifact: {
              type: 'string',
              minLength: 1,
              description: 'the REAL source text this case is about — what the judge will actually read, never a '
                + 'description of it',
            },
            expect: {
              type: 'object',
              properties: {
                verdict: { enum: [...CASE_VERDICTS] },
                reds: {
                  type: 'array',
                  description: 'the itemized expectation: empty for a pass, and one entry per card line the artifact '
                    + 'violates for a red',
                  items: {
                    type: 'object',
                    properties: {
                      rule: ruleEnum,
                      fn: { type: 'string', minLength: 1, description: 'the function the red lands on' },
                    },
                    required: ['rule', 'fn'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['verdict', 'reds'],
              additionalProperties: false,
            },
          },
          required: ['id', 'artifact', 'expect'],
          additionalProperties: false,
        },
      },
    },
    required: ['card', 'cases'],
    additionalProperties: false,
  };
}

/**
 * The output channel. It records and acknowledges; it takes no action, which is
 * why handing it to a toolless compile call does not reopen D3.
 * @param {{calls: any[]}} box
 */
export function proposalTool(box) {
  return {
    name: PROPOSAL_TOOL_NAME,
    description: `Deliver the rubric card and the ${CALIBRATION_SIZE} calibration cases. Call this exactly once.`,
    parameters: proposalSchema(),
    execute: async (/** @type {any} */ args) => { box.calls.push(args); return PROPOSAL_ACK; },
  };
}

// ── 2. THE PROMPT ───────────────────────────────────────────────────────────

/**
 * The system prompt a caller BINDS ITS SEAM WITH — this module owns no provider
 * and picks none, exactly as `authorClose` does not: the compile call arrives as
 * `generate`, and a caller wires it with `makeLoopGenerate(provider, {system:
 * COMPILE_SYSTEM})`, whose own `maxTokens` default (F30) is what holds ten
 * artifacts. Exported rather than inlined so the one register this call is made
 * in is not re-spelled at every integration.
 */
export const COMPILE_SYSTEM = 'You compile a person\'s own words into a rubric a deterministic arbiter can run. You '
  + 'never decide whether anything passes, you never write code that runs, and you never invent a rule: the rulebook '
  + 'is fixed and you select from it.';

/**
 * The compile prompt. Q6's and Q7's answers travel VERBATIM — they are the whole
 * input, and paraphrasing a lay answer is how a rubric stops being the person's.
 *
 * The rulebook is rendered from `JUDGE_RULES` itself rather than restated, for
 * the reason the catalogue block is rendered from the catalogue: the prompt and
 * the gate must describe one set of facts.
 * @param {{answers: Record<string|number, any>, questions?: Record<string|number, string>}} o
 */
export function cardCasesPrompt({ answers, questions = {} }) {
  const q6 = questions[6] ?? 'When you judge the result yourself, what separates a pass from a fail?';
  const q7 = questions[7] ?? 'Give one example you\'d pass and one you\'d fail, and say why.';
  const rules = JUDGE_RULE_IDS.map((id) => `- ${id}\n    the facts it reads: ${JUDGE_RULES[id].ask.trim().split('\n')[0].trim()}`);

  return `You are compiling ONE person's answers into the two artifacts a judged close is signed with.

They are not a software engineer. They described what they look for in their own words, and your whole job is to
express that over the rulebook below — never to add a standard they did not state, and never to drop one they did.

THEIR ANSWERS — verbatim, and the only input you have

Q6. ${q6}
A6. ${answers?.[6] ?? '(no answer given)'}

Q7. ${q7}
A7. ${answers?.[7] ?? '(no answer given)'}

---

THE RULEBOOK — the only rules that exist. You SELECT from it; a rule that is not here cannot be asked for.

${rules.join('\n')}

---

THE CARD

One item per thing they actually look for, in the order they look for them. \`rule\` is selected from the rulebook;
\`text\` is what that line means IN THEIR WORDS. The judge only ever checks lines this card names, so a standard you
leave out is a standard nobody checks — and a standard they never stated is one you must not add.

THE CALIBRATION SET

Exactly ${CALIBRATION_SIZE} cases. Each one is REAL SOURCE TEXT — a small, realistic file the judge could be pointed
at — plus what the arbiter must decide about it.

  - \`artifact\` is the code itself, never a description of it.
  - \`expect.verdict\` is "pass" when the artifact satisfies every card line, "red" when it violates any.
  - \`expect.reds\` is EMPTY for a pass, and for a red it names one entry per violation: the card \`rule\` it breaks
    and the \`fn\` (function name) it breaks it on.

AT LEAST ONE PASS AND AT LEAST ONE RED. A set that can only fail one way measures nothing.
Every rule you name in a case must be a rule your card carries.

HOW TO ANSWER

Call the ${PROPOSAL_TOOL_NAME} tool exactly once, with the card and the ${CALIBRATION_SIZE} cases as its arguments.
Do not write them as text.`;
}

// ── 3. THE COMPILE CHANNEL ──────────────────────────────────────────────────

/** the compile's own channel, over the SHARED bounded ladder (`askStructured`) */
const proposalChannel = () => ({
  name: PROPOSAL_TOOL_NAME,
  instruction: `Your reply did not deliver exactly one proposal through the ${PROPOSAL_TOOL_NAME} tool. `
    + `Call ${PROPOSAL_TOOL_NAME} exactly once, with the card and the ${CALIBRATION_SIZE} cases as its arguments. `
    + 'Do not write them as text.',
  textPath: 'proposal',
  tool: (/** @type {{calls: any[]}} */ box) => proposalTool(box),
});

// ── 4. SHOWN AND FIXED ──────────────────────────────────────────────────────

/** every free string in the two artifacts, scrubbed at INGEST — an answer, a
 * proposed snippet and a signer's edit all become a SIGNED artefact that outlives
 * the run, and a file that captures a key captures it forever. The ONE shared
 * inventory, never a second one.
 *
 * AND IT ANNOUNCES. A scrub that silently rewrites bytes leaves a signer reading
 * one artifact on screen and signing another on disk — the same failure
 * `applyGenreEnv` refuses by returning its `dropped` list rather than quietly
 * deleting a model-authored env var. Every altered value is reported by PATH (the
 * path only: echoing the matched secret into the announcement would be the same
 * leak, one hop on), so the caller can say *this was masked* out loud.
 * @param {any} v @param {string} at @param {{path: string}[]} altered */
function scrubDeep(v, at, altered) {
  if (typeof v === 'string') {
    const masked = redactSecrets(v);
    // `redactSecrets` returns a non-matching string byte-identical, so this
    // compares equal on every honest value and costs the clean path nothing
    if (masked !== v) altered.push({ path: at });
    return masked;
  }
  if (Array.isArray(v)) return v.map((x, i) => scrubDeep(x, `${at}[${i}]`, altered));
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubDeep(x, at ? `${at}.${k}` : k, altered)]));
  return v;
}

/**
 * THE D5 MOMENT. The proposal is SHOWN; the signer's `fix` is what is STORED.
 *
 * The fix replaces the proposal WHOLE rather than merging into it. A merge would
 * mean a signer who deleted a card line got it back, and "the signer signs the
 * whole hash" is not a rule that survives a field-wise reconciliation. Handing
 * back no fix is a legal answer — signing the proposal as proposed — and it says
 * so (`source`), because *a person read this and changed nothing* and *nobody has
 * looked* are two different facts.
 *
 * THE GATE RUNS OVER WHAT WILL BE STORED, never over the proposal: a signer can
 * fix a legal proposal into an illegal one, and the artifact that reaches the
 * hash is the one that must be legal.
 *
 * `scrubbed` is the INGEST SCRUB'S OWN ANNOUNCEMENT — the paths whose bytes the
 * secret inventory masked on the way in. Empty on every honest artifact, and
 * never silent when it is not: a signer signs a hash over the STORED bytes, so
 * "what you typed is not what was stored" is a fact they are owed rather than one
 * the redactor keeps.
 * @param {{proposal: any, fix?: any}} o
 * @returns {{ok: boolean, reds: Red[], card: any, cases: any[]|null, source: 'signer'|'proposal',
 *   scrubbed: {path: string}[]}}
 */
export function signJudgedArtifacts({ proposal, fix = null }) {
  const source = /** @type {'signer'|'proposal'} */ (fix === null || fix === undefined ? 'proposal' : 'signer');
  const chosen = source === 'signer' ? fix : proposal;
  if (!isObj(chosen)) {
    return {
      ok: false,
      reds: [{ code: 'invalid-value', path: 'proposal', detail: 'the signed artifacts are an object {card, cases}' }],
      card: null,
      cases: null,
      source,
      scrubbed: [],
    };
  }
  // A COPY, scrubbed. The caller keeps its proposal (the run's own audit of what
  // the model said); what is stored can never be reached back through it.
  /** @type {{path: string}[]} */
  const scrubbed = [];
  const card = scrubDeep(structuredClone(/** @type {any} */ (chosen).card ?? null), 'card', scrubbed);
  const cases = scrubDeep(structuredClone(/** @type {any} */ (chosen).cases ?? null), 'cases', scrubbed);
  const v = validateJudgedArtifacts({ card, cases });
  return { ok: v.ok, reds: v.reds, card, cases: Array.isArray(cases) ? cases : null, source, scrubbed };
}

// ── 5. THE FOLD — enumerated into the signed spec ───────────────────────────

/**
 * Fold the two signed artifacts into the close declaration, ENUMERATED.
 *
 * WHERE EACH LANDS, and both are inside the spec so `jobSpecHash` covers them by
 * construction (the hash is over the whole resolved spec):
 *   - THE CARD replaces the judged stage's own `params.card`. ONE card, and it is
 *     the SIGNED one: the composer's draft is a draft, and two cards in one close
 *     is the drift a single storage site exists to prevent. The stage is where it
 *     already lives, which is what `validateCard`, the M2 runner and the locate
 *     prompt all read.
 *   - THE CASES land beside the stages as `calibration.cases` — a close-level
 *     artifact, because the set calibrates the RULER and not one stage's params,
 *     and because module 5's gate reads it before any stage runs.
 *
 * A card with NOWHERE TO LAND THROWS. It is a caller's own broken input — a
 * signed rubric folded into a close with no judged ruler — and there is no safe
 * direction to degrade toward: storing it would sign a rubric nothing reads.
 *
 * The input is never mutated: a closeDecl is a signed artefact and rewriting a
 * caller's copy in place is how two readers come to disagree about what was
 * signed.
 * @param {any} closeDecl @param {{card: any, cases: any[]}} o
 * @returns {any} a new closeDecl
 */
export function foldJudgedArtifacts(closeDecl, { card, cases }) {
  const out = structuredClone(closeDecl);
  const stages = Array.isArray(out?.stages) ? out.stages : [];
  const judged = stages.filter((/** @type {any} */ s) => isObj(s) && s.kind === 'judged-floor');
  if (judged.length !== 1) {
    throw new Error(`[cardauthor] the signed card folds into the close's ONE judged-floor stage, and this close has `
      + `${judged.length} — a rubric with nowhere to land is signed evidence nothing reads, and a second judged stage `
      + 'is a second bar for one verdict');
  }
  judged[0].params = { ...(isObj(judged[0].params) ? judged[0].params : {}), card: structuredClone(card) };
  out.calibration = { cases: structuredClone(cases) };
  return out;
}

// ── 6. THE PAID SEAM ────────────────────────────────────────────────────────

/**
 * ONE compile call: the person's Q6 and Q7 in, a proposal out.
 *
 * It buys ONE artifact through ONE channel, and the malformed-emission ladder is
 * the SHARED one (`askStructured`) rather than a second copy — a second ladder is
 * a second place for the cap, the reject block and the re-ask to drift.
 *
 * WHAT IS AND IS NOT RETRIED, and the split is the standing one: a reply that
 * carries no proposal is a TRANSPORT fault and is retried under the bound; a
 * proposal that PARSED and then broke the ruling is not — the model answered
 * perfectly clearly and re-asking buys another call to be told the same thing.
 * The proposal is returned as it was said, never repaired: no JSON repair, ever.
 *
 * The book is the CALLER's, so one ceiling governs the survey, the declaration
 * ladder and this compile — the advertised ceiling and the enforced ceiling are
 * the same ceiling.
 * @param {{answers: Record<string|number, any>, questions?: Record<string|number, string>,
 *   generate: Function, book?: ReturnType<typeof makeCostBook>,
 *   structuredMode?: 'tool'|'text', structureRetries?: number}} o
 * @returns {Promise<{ok: boolean, proposal: any, reds: Red[], stop: string|null,
 *   attempts: number, raw: string, cost: any, raws: any[]}>}
 */
export async function proposeJudgedArtifacts({
  answers, questions = {}, generate,
  book = makeCostBook({}),
  structuredMode = 'tool',
  structureRetries = MAX_PROPOSAL_RETRIES,
}) {
  // TIGHTEN-ONLY, floor 0, exactly as `authorClose` clamps its own two axes: a
  // caller may buy fewer malformed-emission retries, never more than the ceiling
  // this module declares and the suite pins.
  const retries = Math.max(0, Math.min(Math.trunc(Number(structureRetries)) || 0, MAX_PROPOSAL_RETRIES));
  const prompt = cardCasesPrompt({ answers, questions });
  const ask = await askStructured({
    messages: [{ role: 'user', content: prompt }],
    generate,
    mode: structuredMode,
    retries,
    label: PROPOSAL_LABEL,
    book,
    channel: proposalChannel(),
  });

  const base = {
    proposal: ask.artifact ?? null, attempts: ask.attempts, raw: ask.raw,
    cost: book.report(), raws: book.raws(),
  };
  if (ask.budget) {
    return {
      ...base,
      ok: false,
      stop: ask.budget,
      reds: [{
        code: ask.budget,
        path: 'budgetUsd',
        detail: `the authoring ceiling bound before the rubric compile: $${book.ceilingUsd} is spent, and the call was `
          + 'never made. The stop IS the checkpoint — raise the ceiling and re-run, or read what is here and stop',
      }],
    };
  }
  if (ask.providerError) {
    // a casualty, never evidence about the model — and the transport's own prose
    // is scrubbed on the way into a red the caller keeps
    return {
      ...base,
      ok: false,
      stop: 'provider-red',
      reds: [{ code: 'provider-red', path: PROPOSAL_LABEL, detail: redactSecrets(String(ask.providerError)) }],
    };
  }
  if (!ask.artifact) {
    return { ...base, ok: false, stop: 'artifact-red', reds: [/** @type {Red} */ (ask.red)] };
  }

  const v = validateJudgedArtifacts({ card: ask.artifact.card, cases: ask.artifact.cases });
  if (!v.ok) return { ...base, ok: false, stop: 'proposal-invalid', reds: v.reds };
  return { ...base, ok: true, stop: null, reds: [] };
}
