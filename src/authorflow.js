// THE WRITING HALF — close-authoring v1, module M3b (design record 2026-08-07
// D3/D11/D12; gate-2 POC prereg addenda 5 and 6).
//
// M1 owns what a stage DOES. M2 owns what a declaration may SAY and whether one
// said it legally. This module is the part that gets a declaration out of a model
// and refuses to accept a bad one — the authoring call, the schema that bounds
// it, and the grounded revise loop that measures it against the real repository
// before anyone signs anything.
//
// ── THE ONE STRUCTURAL DECISION (hamr, 2026-08-08) ──────────────────────────
//
// The declaration is emitted through a SCHEMA-FORCED TOOL CALL, never parsed out
// of prose. Standing doctrine: *"text mode will NOT force JSON output; the
// structure-enforced alternative is tool mode."* The model answers by calling
// `declare_close`, whose input schema IS the declaration shape, and that schema
// is DERIVED from M2's catalogue — one source, never a second hand-written copy.
//
// This does NOT reopen D3 (*"the authoring call gets no tools at all"*). D3's
// subject is hamr's law — *"the danger is in the ACTIONS, not the SYNTAX"* — and
// `declare_close` takes no action: it has no fence to cross because it touches
// nothing, spawns nothing and reads nothing. It is the OUTPUT CHANNEL, in the
// place a fenced JSON block used to sit. The authoring call still has no repo
// tool, no shell, and no way to reach the tree; the scout (M3a) is where looking
// happens, and it is a different call with a different grant.
//
// TWO CONSEQUENCES, NAMED RATHER THAN SMOOTHED:
//
//   1. A LOCKED KIND IS INEXPRESSIBLE IN TOOL MODE. The schema carries one branch
//      per LIVE kind, so there is no way to spell `judged-floor` or
//      `human-confirms` — which is the `check-passes(name)` move applied one
//      level up (illegal becomes unsayable, not rejected late). The price is
//      real: M2's `locked-kind` red is bareloop's DEMAND COUNTER for its own
//      catalogue (D13 forward-compat point 2), and a demand that cannot be
//      spoken cannot be counted. On the tool path, locked-kind demand must come
//      from the INTERVIEW layer (D13's genre/verdict refusal, which is where a
//      user's "I want a person to sign this off" actually lands) or from the text
//      fallback below. This module counts what it can see and says so; it does
//      not pretend the channel is intact.
//
//   2. THE TEXT PATH SURVIVES ONLY AS A FALLBACK for a provider with no tool
//      mode. It is `structuredMode: 'text'`, it is marked everywhere it appears,
//      and it uses the ONE shipped parser (`extractArtifact`). It is not a
//      recovery path for a model that ignored the tool: that is an ARTIFACT-RED —
//      name the axis, retry under a bound, write nothing.
//
// ── THE GROUNDED LOOP (addendum 5, lever L2) ────────────────────────────────
//
// author → validate → run EVERY stage at the seed → feed the MEASURED results
// back → revise. Bounded at two revisions, early-stop when the model returns its
// declaration unchanged. The feedback is EXECUTION OUTPUT and nothing else: no
// model ever reviews another model's close (D9), because a model grading its own
// homework is the self-consistency trap the design already bans. The revise turn
// is exactly `measured block + one frozen instruction`, and `assertReviseTurn`
// is what makes that a fact instead of a promise.
//
// A validation red is fed back the same way and COUNTS as a revision — it is a
// measurement of the declaration, made by the validator. A malformed EMISSION is
// not: it is a transport fault, retried under its own bound, and it never eats
// the model's revision budget.
//
// ── WHAT THIS MODULE INJECTS, AND WHY IT IS NOT THE MODEL'S JOB ─────────────
//
// The genre's environment (addendum 6's second residue). `MYPYPATH` on a Python
// patient is the Result-5 fact no user can supply and no model found: round 2's
// arm B authored it itself and authored it WRONG. It is applied MECHANICALLY to
// every stage that spawns something, a model-authored copy is DROPPED and
// ANNOUNCED, and a genre variable this patient cannot supply is a RED — because
// it moves no seed number, so no seed-verdict read can ever catch its absence.
// The model is never handed its own injected copy back, or M2 would red it as
// `genre-owned-env` on the next turn for a variable the model did not write.
//
// F6 throughout: an unpriced call makes the TOTAL unknown, and unknown is null.
// No spine emission here — M4 wires events.

import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { seedRead as runSeedReadStages, makeSeedTrees, AGGREGATES, SIGNS, MAX_TERMS } from './kinds.js';
import {
  KIND_CATALOGUE, MAX_STAGES, DIRECTIONS, BASELINES,
  GENRE_LANGUAGES, TYPES_GENRE_TEMPLATE, genreGuards, genreEnv, genreOwnedEnvNames,
  validateDeclaration, envCapableKind,
} from './authoring.js';
import { buildSeedListing, cleanEntry } from './authorscout.js';
import { extractArtifact, priceOf } from './text.js';
import { redactSecrets } from './validate.js';

const require = createRequire(import.meta.url);
const { Loop } = require('bare-agent');

/** @typedef {{code: string, path: string, detail: string, [k: string]: any}} Red */

// ── constants ────────────────────────────────────────────────────────────────

/** the output channel's name. It takes no action; it carries the answer. */
export const DECLARATION_TOOL_NAME = 'declare_close';
/** what the tool returns. The loop stops on delivery, so the model never reads it. */
export const DECLARATION_ACK = 'declaration received';
/** addendum 5: unlimited revising launders thrash as adaptation (v1.12's rule). */
export const MAX_REVISIONS = 2;
/** a malformed EMISSION is a transport fault, bounded on its own axis */
export const MAX_STRUCTURE_RETRIES = 2;
/** per-stage gap lines carried into a revise turn, trim announced (F28) */
export const REVISE_GAP_CAP = 15;
/** validator reds carried into a revise turn, trim announced (F28) */
export const REVISE_RED_CAP = 20;
/** F18 / F30 — caching on, and the 4096 provider default cannot hold a declaration */
export const AUTHOR_MAX_TOKENS = 32000;
/** the one slot the model fills on an injected guard */
export const FILL_MARKER = '<FILL IN>';

/**
 * THE FROZEN REVISE INSTRUCTION — gate-2 round 3's own text, byte for byte
 * (`scratch-gate2/author.mjs:63`, the turn that PASSED both arms). It is the only
 * prose a revise turn may carry, this constant is its only source, and the suite
 * asserts its bytes: an edit reds the suite and forces a decision rather than
 * quietly changing what every future close is corrected against.
 */
export const REVISE_INSTRUCTION = 'These are the measured results of running your close against the UNCHANGED repository (the seed). '
  + 'The work has not been done yet. Judge your own declaration against them: a work stage that is GREEN at '
  + 'seed is grading nothing; an instrument stop means the stage cannot run at all; a count far from what the '
  + 'interview describes means the instrument is measuring the wrong thing. Return the full corrected '
  + 'declaration, or return it unchanged if you believe it is correct.';

/**
 * The structure re-ask, per mode. DELIBERATELY NOT `REVISE_INSTRUCTION`: nothing
 * has been measured, there is no declaration to judge, and reusing the revise
 * text would tell a model to "judge its own declaration against them" when there
 * is no them.
 */
export const STRUCTURE_INSTRUCTION_TOOL = `Your reply did not deliver exactly one declaration through the ${DECLARATION_TOOL_NAME} tool. `
  + `Call ${DECLARATION_TOOL_NAME} exactly once, with the whole declaration as its arguments. Do not write the declaration as text.`;
export const STRUCTURE_INSTRUCTION_TEXT = 'Your reply could not be read as one JSON declaration. '
  + 'Reply with ONLY the JSON object, in a single fenced block, and nothing else.';

/** The frozen TYPES interview set (prereg §5). The interview layer owns asking
 * them; the authoring prompt only renders the answers beside their questions. */
export const TYPES_QUESTIONS = Object.freeze({
  1: 'What do you want done?',
  2: 'Which files or folders should change?',
  3: 'Is there anything that must not change?',
  4: 'How do you check today whether it\'s working?',
  5: 'What would make you say this came back worse than before?',
  6: 'Is there a code repo I can look at? Where?',
  7: 'This looks like a type-fixing job — you want a type checker to stop complaining, without breaking the tests. Correct?',
});

export const AUTHOR_SYSTEM = 'You compose the DEFINITION OF DONE for an automated job: a declaration over a fixed '
  + 'catalogue of stage kinds whose implementations already exist. You never write code, a script, a shell fragment, '
  + 'a new kind, or a new parameter name. You cannot read anything and you cannot run anything: everything you know '
  + 'about this repository is in the message you are given.';

// ── 1. THE SCHEMA, DERIVED FROM THE CATALOGUE ───────────────────────────────

/** `{includePrefixes?, excludePrefixes?}` — one definition, both kinds that take it */
const SCOPE_SCHEMA = Object.freeze({
  type: 'object',
  description: 'which population this stage counts. A path prefix, read off the seed listing.',
  properties: {
    includePrefixes: { type: 'array', minItems: 1, items: { type: 'string' } },
    excludePrefixes: { type: 'array', minItems: 1, items: { type: 'string' } },
  },
  additionalProperties: false,
});

/** the parser, in both legal forms. Enums come from M1's own exported constants. */
const PARSER_SCHEMA = Object.freeze({
  description: 'how to read ONE number out of the command output: the signed sum over terms of '
    + '(first | sum of that term\'s captures, inside that term\'s region).',
  oneOf: [
    {
      title: 'terms',
      type: 'object',
      properties: {
        terms: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_TERMS,
          items: {
            type: 'object',
            properties: {
              lineMatch: { type: 'string', description: 'a regular expression, applied line by line' },
              capture: { type: 'integer', minimum: 0, description: 'which capture group holds the number (default 1). A pattern with NO group tallies 1 per match.' },
              sign: { enum: [...SIGNS], description: '+1 adds this term, -1 subtracts it' },
              aggregate: { enum: [...AGGREGATES], description: '"sum" over nothing is a counted zero; "first" over nothing is UNKNOWN, and unknown is an instrument stop' },
              region: {
                oneOf: [
                  { const: 'whole-output' },
                  {
                    type: 'object',
                    properties: {
                      anchor: { type: 'string' },
                      capture: { type: 'integer', minimum: 0, description: '0 = the whole anchor match' },
                    },
                    required: ['anchor', 'capture'],
                    additionalProperties: false,
                  },
                ],
              },
            },
            required: ['lineMatch', 'sign', 'aggregate', 'region'],
            additionalProperties: false,
          },
        },
      },
      required: ['terms'],
      additionalProperties: false,
    },
    {
      title: 'short form',
      type: 'object',
      description: 'exactly one term with sign +1, aggregate "first", region "whole-output"',
      properties: {
        lineMatch: { type: 'string' },
        capture: { type: 'integer', minimum: 0 },
      },
      required: ['lineMatch'],
      additionalProperties: false,
    },
  ],
});

/**
 * ONE schema per PARAMETER NAME, composed into kinds by the catalogue's own
 * `required`/`optional` lists. Keyed by name rather than by kind on purpose: the
 * catalogue already decides which kind takes which parameter, and a per-kind
 * table would be a second place for that fact to live.
 *
 * What is genuinely NEW here is only the JSON TYPE of each leaf — the catalogue
 * states it as prose (`shape`) for the prompt, and nothing in the tree states it
 * as a schema. Everything a schema could DRIFT on — which kinds exist, which are
 * locked, which parameters each takes, which values an enum admits — is read
 * from M2 and M1, and {@link schemaCoverage} makes the remaining seam mechanical:
 * a catalogue that grows a parameter this table does not know about fails LOUDLY
 * at schema-build time rather than silently omitting it from what the model can
 * say.
 */
export const PARAM_SCHEMAS = Object.freeze({
  cmd: { type: 'string', description: 'the executable, invoked so its binary actually resolves' },
  args: { type: 'array', items: { type: 'string' } },
  expectExit: { type: 'integer' },
  timeoutMs: { type: 'integer', minimum: 1 },
  env: { type: 'object', additionalProperties: { type: 'string' } },
  parser: PARSER_SCHEMA,
  scope: SCOPE_SCHEMA,
  direction: { enum: [...DIRECTIONS] },
  baseline: {
    enum: [...BASELINES],
    description: '"seed" is the same number taken from this run\'s own starting point, measured every run; '
      + '0 is literally zero. You never write a number you measured yourself.',
  },
  patterns: {
    type: 'array',
    minItems: 1,
    items: {
      type: 'object',
      properties: { id: { type: 'string' }, regex: { type: 'string' } },
      required: ['id', 'regex'],
      additionalProperties: false,
    },
  },
  extensions: { type: 'array', minItems: 1, items: { type: 'string' } },
  allowPrefixes: { type: 'array', minItems: 1, items: { type: 'string' } },
  requireNonEmpty: { const: true },
});

/**
 * The mechanical seam between the catalogue and the schema, read BOTH ways: a
 * catalogue parameter with no schema would be silently undeclarable, and a schema
 * entry the catalogue does not have is a second catalogue.
 * @param {Record<string, any>} [catalogue]
 * @returns {{ok: boolean, missing: string[], orphan: string[]}}
 */
export function schemaCoverage(catalogue = KIND_CATALOGUE) {
  /** @type {string[]} */ const missing = [];
  /** @type {Set<string>} */ const used = new Set();
  for (const [kind, spec] of Object.entries(catalogue)) {
    if (spec.locked) continue;
    for (const p of [...spec.required, ...spec.optional]) {
      used.add(p);
      if (!Object.hasOwn(PARAM_SCHEMAS, p)) missing.push(`${kind}.${p}`);
    }
  }
  const orphan = Object.keys(PARAM_SCHEMAS).filter((p) => !used.has(p));
  return { ok: missing.length === 0 && orphan.length === 0, missing, orphan };
}

/**
 * THE DECLARATION SCHEMA — the tool's input schema, and therefore the whole
 * shape a model can express.
 *
 * One `oneOf` branch per LIVE kind, each pinning its own `kind` as a const so a
 * parameter set cannot drift onto the wrong kind. A LOCKED kind gets no branch at
 * all: declaring one is inexpressible here rather than rejected afterwards (see
 * the header for what that costs).
 *
 * It enforces STRUCTURE, not LAW. The stage-name slug rule, the one-population
 * law, the listing rule, F49's regex reject and the D5 guard equality are M2's,
 * and they arrive as validation reds through the revise loop — a schema that
 * tried to restate them would be a second validator.
 *
 * THROWS on a catalogue it cannot cover: a malformed catalogue is a bareloop bug,
 * and failing loudly beats emitting a schema that quietly cannot say something
 * the validator will then demand.
 * @param {Record<string, any>} [catalogue]
 */
export function declarationSchema(catalogue = KIND_CATALOGUE) {
  const cov = schemaCoverage(catalogue);
  if (!cov.ok) {
    throw new Error('[authorflow] the declaration schema does not cover the catalogue — '
      + `missing: ${cov.missing.join(', ') || 'none'}; orphaned: ${cov.orphan.join(', ') || 'none'}`);
  }
  const branches = Object.entries(catalogue)
    .filter(([, spec]) => !spec.locked)
    .map(([kind, spec]) => {
      /** @type {Record<string, any>} */
      const properties = {};
      for (const p of [...spec.required, ...spec.optional]) properties[p] = PARAM_SCHEMAS[/** @type {keyof typeof PARAM_SCHEMAS} */ (p)];
      return {
        title: kind,
        description: spec.asserts,
        type: 'object',
        properties: {
          name: { type: 'string', description: 'a unique lowercase-hyphenated slug saying what this stage asserts' },
          kind: { const: kind },
          params: { type: 'object', properties, required: [...spec.required], additionalProperties: false },
        },
        required: ['name', 'kind', 'params'],
        additionalProperties: false,
      };
    });

  return {
    type: 'object',
    properties: {
      stages: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_STAGES,
        description: 'the close, in FIRST-RED-WINS order — the first red ends the judgement',
        items: { oneOf: branches },
      },
      notes: {
        type: 'array',
        // minLength 1 for the standing reason: where only a closed set (here,
        // "a string that says something") can satisfy a field, the illegal value
        // is made INEXPRESSIBLE rather than rejected after the fact. The
        // validator reds an empty note either way — this stops it being written.
        items: { type: 'string', minLength: 1 },
        description: 'anything you could not express, or any fact you needed and did not have',
      },
    },
    required: ['stages'],
    additionalProperties: false,
  };
}

/**
 * The output channel. It records and acknowledges; it takes no action, which is
 * why handing it to a toolless authoring call does not reopen D3.
 * @param {{calls: any[]}} box
 * @param {{catalogue?: Record<string, any>}} [o]
 */
export function declarationTool(box, { catalogue = KIND_CATALOGUE } = {}) {
  return {
    name: DECLARATION_TOOL_NAME,
    description: 'Deliver the finished close. Call this exactly once, with the whole declaration as its arguments.',
    parameters: declarationSchema(catalogue),
    execute: async (/** @type {any} */ args) => { box.calls.push(args); return DECLARATION_ACK; },
  };
}

// ── 2. THE PROMPT ────────────────────────────────────────────────────────────

/**
 * The catalogue, as the authoring call sees it — rendered FROM the catalogue, so
 * the prompt and the validator judge one set of facts. `shape` and `asserts` are
 * M2's own strings.
 * @param {Record<string, any>} [catalogue]
 */
export function catalogueBlock(catalogue = KIND_CATALOGUE) {
  const rows = Object.entries(catalogue).map(([name, spec]) => (spec.locked
    ? `- ${name}  — LOCKED. Not available in v1; it will not run.`
    : `- ${name}\n    ${spec.shape}\n    required: ${spec.required.join(', ')}`
      + `${spec.optional.length ? `   optional: ${spec.optional.join(', ')}` : ''}\n    asserts: ${spec.asserts}`));
  return `THE KIND CATALOGUE — these are the only kinds that exist.
You parameterise kinds. You never write a script, a shell fragment, or a new kind.

${rows.join('\n')}

THE PARSER reads ONE number out of a command's output, as signed arithmetic over terms:

    value  =  the sum over terms of   sign x (first | sum of that term's matches, inside its region)

  lineMatch   a regular expression, applied to the output line by line.
  capture     which capture group holds the number (default 1). A pattern with NO capture group
              contributes 1 per match — that is how you TALLY occurrences instead of reading a
              figure the tool printed.
  aggregate   ${AGGREGATES.join(' | ')}. "sum" over nothing is a counted zero. "first" over nothing
              means the number was never reported, which is a broken instrument, not a zero.
  region      "whole-output", or {anchor, capture} to search only inside the part of the output the
              anchor locates. A region that cannot be located is a broken instrument.
  sign        ${SIGNS.join(' | ')}. Subtraction is how you exclude things that were reported but did
              not actually happen.`;
}

/** The three laws. Stated to the author; enforced, where checkable, by M2. */
export function lawsBlock() {
  return `THE LAWS YOUR DECLARATION MUST OBEY

1. ONE POPULATION PER STAGE.
   A stage name owns exactly one population of things being counted or checked. Two structurally
   different counts never share a stage name, because their results land in one trend series and a
   run that merely swapped one wall for another then reads as progress. Every counting stage over a
   job that touches only part of the tree must say WHICH population it counts: its scope carries
   includePrefixes or excludePrefixes. A scope object with neither names nothing.

2. FIRST RED WINS — order cheap before expensive.
   Stages run in the order you declare them and the first red ends the judgement. Put the cheap,
   fast, structural stages first so they shield the slow ones.

3. MECHANICAL FIRST.
   Every assertion that CAN be a command IS a command. Nothing is left to judgement, to prose, or to
   a person. If you cannot express something with the kinds above, leave it out and say so in your
   notes — do not approximate it with a stage that means something else.

4. EVERY PATH IS SELECTED, NEVER INVENTED.
   Any path you write down must appear in the seed file listing above. A file is not called what it
   sounds like it should be called.`;
}

/**
 * The whole authoring prompt, as one string.
 *
 * Two people fed this brief and neither of them is the model: a person who is not
 * a software engineer answered an interview, and a read-only survey produced the
 * facts. The prompt says so, because round 1 measured what happens when a model
 * treats a lay answer as a specification.
 *
 * @param {{answers: Record<string|number, string>, questions?: Record<string|number, string>,
 *   facts: any, listingBlock: string, lang: string,
 *   guards: {name: string, kind: string, params: Record<string, any>, fill: string[]}[],
 *   ownedEnvNames?: string[], mode?: 'tool'|'text', catalogue?: Record<string, any>}} o
 */
export function authorPrompt({ answers, questions = TYPES_QUESTIONS, facts, listingBlock, lang, guards, ownedEnvNames = [], mode = 'tool', catalogue = KIND_CATALOGUE }) {
  const interview = Object.entries(questions)
    .map(([n, q]) => `Q${n}. ${q}\nA${n}. ${answers?.[n] ?? '(no answer given)'}`)
    .join('\n\n');

  const role = `You are composing the close for one job.

The close is what decides whether a run of this job came back DONE. It runs after the work is
finished, it is the only truth, and nothing else can overrule it. It is a list of STAGES. Each
stage names a kind from the catalogue below and fills that kind's parameters. Stages run in the
order you declare them.

Two people fed you this brief and neither of them is you:
 - the person who wants the job done answered an interview, below, in their own words. They are
   not a software engineer. They did not name commands, thresholds or patterns, and you must not
   assume they know what any of those would be;
 - a read-only survey of their repository produced the facts object, below. It is the only thing
   you know about the repository. If a fact you need is not in it, say so in your notes rather
   than inventing it.`;

  // The guards arrive FULLY PARAMETERISED — the battery and its scope are genre
  // property (addendum 6). Only a declared `fill` slot is the model's, and it is
  // marked. Round 3's arm A narrowed a guard's scan and called it stricter.
  const guardJson = guards.map((g) => ({
    name: g.name,
    kind: g.kind,
    params: { ...g.params, ...Object.fromEntries(g.fill.map((f) => [f, FILL_MARKER])) },
  }));

  const envLine = ownedEnvNames.length
    ? `\n\nThis job's genre sets ${ownedEnvNames.join(', ')} for you, from facts you were not given. `
      + 'Do not declare any of those variables yourself — a declaration that sets one is rejected.'
    : '';

  const output = mode === 'tool'
    ? `HOW TO ANSWER

Call the ${DECLARATION_TOOL_NAME} tool exactly once. Its arguments ARE the declaration: an ordered
"stages" array, plus "notes" for anything you could not express or any fact you needed and did not
have. Do not write the declaration as text.

Stage names are unique. Every parameter name comes from the catalogue and no other. No parameter is
left as a placeholder. You never write a threshold number you measured yourself, because you cannot
measure anything.`
    : `HOW TO ANSWER

A single JSON object and nothing else: an ordered "stages" array, plus "notes" for anything you
could not express or any fact you needed and did not have.

Stage names are unique. Every parameter name comes from the catalogue and no other. No parameter is
left as a placeholder. You never write a threshold number you measured yourself, because you cannot
measure anything.`;

  return [
    role,
    `THE INTERVIEW — the person's own words\n\n${interview}`,
    `THE FACTS OBJECT — from a read-only survey of the repository\n\n${JSON.stringify(facts, null, 2)}`
      + (listingBlock ? `\n\n${listingBlock}` : ''),
    catalogueBlock(catalogue),
    lawsBlock(),
    `THE GENRE TEMPLATE — fixed by the job's genre (${lang}), not yours to decide\n\n`
      + 'This job\'s genre carries a fixed close SHAPE. The following policy is law for your declaration. It names\n'
      + 'no command, no path, no environment value and no pattern for this repository — finding those is your work,\n'
      + `from the facts object and the interview:\n\n${TYPES_GENRE_TEMPLATE}`,
    'MANDATORY GUARDS — already placed and already parameterised\n\n'
      + 'This kind of job carries stages the person did not ask for. They are fixed by the job\'s genre and they are\n'
      + 'already in your declaration, with their pattern battery and extensions already filled in — those are genre\n'
      + `property and you may not change, drop, rename, or re-kind them. The ONLY thing you fill in is each\n`
      + `"${FILL_MARKER}" slot, from the facts object and the interview:\n\n${JSON.stringify(guardJson, null, 2)}\n\n`
      + 'Place them where the ordering law says they belong, and author the remaining stages around them.'
      + envLine,
    output,
  ].join('\n\n---\n\n');
}

// ── 3. THE MEASURED BLOCKS ───────────────────────────────────────────────────

/** F6, at the rendering boundary: an absent number is unknown, never 0. */
const show = (/** @type {any} */ v) => (v === null || v === undefined ? 'unknown' : String(v));

/**
 * The seed read, as the model sees it: mechanical labels, no editorial. Per-stage
 * gap capped with the trim ANNOUNCED (F28 — a bound that eats the failure names
 * deletes exactly the mechanical detail that converts).
 *
 * SCRUBBED at the emission boundary. What this block renders is raw subprocess
 * output (gap lines, an instrument stop carrying a command's stderr) and it
 * becomes the next USER TURN sent to the provider — the surface most likely to
 * carry a real credential, crossing the network. It goes through the ONE shared
 * redactor, the same one `askDeclaration` puts the model's own text through and
 * the same one `declaredclose`/`authorjob` put these very fields through; never
 * a second inventory. Applied to the whole rendered block rather than one field,
 * so a line added here is scrubbed by construction.
 * @param {any[]} rows M1 `StageResult[]`
 * @param {{gapCap?: number}} [o]
 */
export function renderSeedReadBlock(rows, { gapCap = REVISE_GAP_CAP } = {}) {
  const lines = ['MEASURED SEED-READ — every stage of your declaration was executed against the repository at the seed:'];
  for (const r of rows ?? []) {
    lines.push('', `stage "${r.stage}" [${r.kind}]`);
    lines.push(`  verdict: ${r.verdict} · exit code: ${show(r.exitCode)}`);
    if (r.value !== null && r.value !== undefined) {
      lines.push(`  value: ${show(r.value)} · baseline: ${show(r.baseline)}`
        + `${r.baselineSource ? ` (baseline ${r.baselineSource})` : ''}`);
    }
    if (r.detail?.stop) lines.push(`  instrument-stop: ${r.detail.stop}`);
    const gap = r.gapLines ?? [];
    if (gap.length) {
      lines.push('  gap:');
      for (const g of gap.slice(0, gapCap)) lines.push(`    ${g}`);
      if (gap.length > gapCap) {
        lines.push(`    [gap trimmed: ${gap.length - gapCap} of ${gap.length} lines withheld — the cap is ${gapCap} per stage]`);
      }
    }
  }
  return redactSecrets(lines.join('\n'));
}

/**
 * The measured block when the declaration never reached execution. Both cases are
 * machine outputs of the pipeline, never editorial prose about the model's work.
 *
 * SCRUBBED at the emission boundary, for the SAME reason `renderSeedReadBlock`
 * is and through the SAME one redactor. The channel here is different and just
 * as real: a validation red QUOTES WHAT THE MODEL DECLARED, verbatim — the
 * genre-env branch echoes the expected and the declared value, the deny floor
 * echoes the whole `cmd`, the listing rule echoes the path — and this block
 * becomes the next USER TURN sent to the provider. A declared value shaped like
 * a credential crossed unmasked before this line existed. Applied to the whole
 * rendered block rather than one field, so a red added to the validator is
 * scrubbed by construction rather than by remembering.
 * @param {{kind: 'validation'|'artifact', reds: (Red|string)[], cap?: number}} o
 */
export function renderRejectBlock({ kind, reds, cap = REVISE_RED_CAP }) {
  const head = kind === 'validation'
    ? 'MEASURED VALIDATION — your declaration was rejected by the validator before any stage could run:'
    : 'MEASURED PARSE — your reply could not be read as one declaration:';
  const rendered = (reds ?? []).map((r) => (typeof r === 'string' ? r : `${r.code} at ${r.path || '(root)'}: ${r.detail}`));
  const shown = rendered.slice(0, cap);
  const tail = rendered.length > shown.length
    ? [`  [${rendered.length - shown.length} of ${rendered.length} reds withheld — the cap is ${cap}]`]
    : [];
  return redactSecrets([head, ...shown.map((r) => `  ${r}`), ...tail].join('\n'));
}

/** A revise turn is EXACTLY the measured block, a blank line, and the instruction. */
export function buildReviseTurn(/** @type {string} */ measuredBlock) {
  return `${measuredBlock}\n\n${REVISE_INSTRUCTION}`;
}

/**
 * The structural guarantee that no other prose can enter a revise turn. Without
 * it "the feedback is measurement only" is a promise; with it, it is a fact that
 * fails the build the day someone appends a helpful sentence.
 * @param {string} turn @param {string} measuredBlock
 */
export function assertReviseTurn(turn, measuredBlock) {
  if (!/^MEASURED (SEED-READ|VALIDATION|PARSE) —/.test(measuredBlock)) {
    throw new Error('REVISE DRIFT: the measured block does not open with a mechanical header');
  }
  if (turn !== `${measuredBlock}\n\n${REVISE_INSTRUCTION}`) {
    throw new Error('REVISE DRIFT: the turn is not measured-block + the frozen instruction, exactly');
  }
  return { ok: true, bytes: Buffer.byteLength(turn) };
}

// ── 4. THE GENRE'S ENVIRONMENT ───────────────────────────────────────────────

/** Which kinds can carry an environment at all — read off the catalogue, never a
 * list, and read through M2's OWN predicate rather than a second copy of it.
 * The validator's completeness rule demands the variable on exactly the stages
 * this injector puts it on, so the two must be one function: a drift either way
 * leaves stages injected-but-unchecked or checked-but-never-injected. */
const envCapable = envCapableKind;

/**
 * Apply the genre's environment to a declaration, mechanically.
 *
 * Three rules, and each one is a finding:
 *   - it lands on every stage that SPAWNS something (env-capable by the
 *     catalogue) and nowhere else — a stage that runs no process has no
 *     environment to set;
 *   - a model-authored copy of a genre-owned name is DROPPED and ANNOUNCED. M2's
 *     validator already reds that, so this is defence in depth — but the failure
 *     direction matters: silently keeping the model's guess is how round 2's arm
 *     B graded an unedited checkout;
 *   - a genre variable this patient cannot supply is a RED, not an omission. It
 *     moves no seed number, so no seed-verdict read can ever see it missing, and
 *     the artefact it would be missing from is SIGNED.
 *
 * The input declaration is never mutated: the model's own copy has to stay what
 * the model wrote, or the next turn's validator reds it for our injection.
 * @param {any} declaration
 * @param {string} lang
 * @param {{sourcePrefixes?: string[], catalogue?: Record<string, any>}} [o]
 * @returns {{declaration: any, applied: Record<string, string>, dropped: {stage: string, name: string}[],
 *   missing: string[], reds: Red[]}}
 */
export function applyGenreEnv(declaration, lang, { sourcePrefixes = [], catalogue = KIND_CATALOGUE } = {}) {
  const applied = genreEnv(lang, { sourcePrefixes });
  const owned = genreOwnedEnvNames(lang);
  const missing = owned.filter((n) => !Object.hasOwn(applied, n));
  /** @type {{stage: string, name: string}[]} */
  const dropped = [];
  /** @type {Red[]} */
  const reds = missing.map((name) => ({
    code: 'genre-env-unavailable',
    path: `genre.env.${name}`,
    detail: `the ${lang} genre owns ${name} and this patient supplies nothing to build it from — it is a fact `
      + 'the interview cannot give and the repository does not state, it moves no seed number, and a close signed '
      + 'without it grades a different checkout',
    name,
  }));

  const out = structuredClone(declaration);
  for (const s of out?.stages ?? []) {
    if (!s || typeof s !== 'object' || !envCapable(s.kind, catalogue)) continue;
    if (!s.params || typeof s.params !== 'object') continue;
    /** @type {Record<string, string>} */
    const env = { ...(s.params.env ?? {}) };
    const conflicts = owned.filter((n) => Object.hasOwn(env, n));
    // touch nothing when there is nothing to do: a declaration is a SIGNED
    // artefact, and rewriting a stage we had no reason to change makes the
    // signed form differ from what the model wrote for no stated reason
    if (conflicts.length === 0 && Object.keys(applied).length === 0) continue;
    for (const name of conflicts) { dropped.push({ stage: s.name, name }); delete env[name]; }
    Object.assign(env, applied);
    if (Object.keys(env).length) s.params.env = env;
    else delete s.params.env;
  }
  return { declaration: out, applied, dropped, missing, reds };
}

/**
 * The prefixes `genreEnv` JOINS into the genre's variable, resolved against the
 * real tree. Two filters, and the second one was paid for on a live patient.
 *
 * EXISTENCE (unchanged): a prefix that names nothing at the seed would build a
 * variable pointing at nothing, and the grounded validator refuses it anyway
 * (`ungroundedGenreEnv` checks every ELEMENT against the seed listing).
 *
 * IDENTITY (new): existence alone reads a SYMLINK and the directory behind it as
 * two prefixes. On aurora, 11 entries under `src` resolve into the per-package
 * `packages/<pkg>/src` trees, so the joined `MYPYPATH` named one tree twice
 * under two spellings and mypy died FATALLY — exit 2, "shadows library module",
 * zero output — which the close reads as a broken instrument on a perfectly
 * healthy patient. The realpath-deduped control produced the identical clean
 * reading as the known-good invocation.
 *
 * WHICH SPELLING SURVIVES is not cosmetic. The REAL path wins, because that is
 * the one the checker itself resolves to; the symlink spelling is kept only when
 * the real one cannot be used. And a spelling is only ever emitted when it
 * SELECTS from the seed listing, because the arbiter records this value in a
 * SIGNED envelope and re-validates it GROUNDED — a value the grounded validator
 * cannot select is one the arbiter must never build. So a link out of the
 * repository, or into a path git does not track, keeps its declared spelling
 * rather than becoming an absolute path nothing can ground.
 *
 * An unreadable candidate (a dangling link, a race) is NOT dropped: it passed the
 * existence filter against the listing, and silently losing a real prefix is the
 * Result-5 hazard in the other direction.
 * @param {{workdir: string, sourcePaths: any, seedFiles: string[]}} o
 * @returns {string[]}
 */
export function resolveSourcePrefixes({ workdir, sourcePaths, seedFiles }) {
  const files = Array.isArray(seedFiles) ? seedFiles : [];
  const listed = (/** @type {string} */ p) => p !== '' && files.some((f) => f === p || f.startsWith(`${p}/`));
  const candidates = (Array.isArray(sourcePaths) ? sourcePaths : []).map(cleanEntry).filter(listed);

  // the root's OWN realpath: a workdir reached through a link would otherwise
  // make every candidate look like it points outside the repository
  let root;
  try { root = realpathSync(String(workdir ?? '')); } catch { root = String(workdir ?? ''); }

  /** @type {Map<string, string>} realpath → the spelling that owns it */
  const byReal = new Map();
  for (const declared of candidates) {
    let real = null;
    try { real = realpathSync(join(root, declared)); } catch { real = null; }
    let spelling = declared;
    if (real !== null) {
      const rel = relative(root, real);
      // inside the repository, and something git tracks under it
      if (rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && listed(rel)) spelling = rel;
    }
    const key = real ?? join(root, declared);
    if (!byReal.has(key)) byReal.set(key, spelling);
  }
  return [...byReal.values()];
}

// ── 5. COST ──────────────────────────────────────────────────────────────────

/**
 * F6's shape: an unpriced call or round makes the TOTAL unknown, and unknown is
 * reported as null — never as the sum of the priced half wearing a complete coat.
 * `knownUsd` carries the priced half explicitly so nothing is hidden either way.
 */
export function makeCostBook() {
  /** @type {{label: string, costUsd: number|null, unpricedRounds: number}[]} */
  const entries = [];
  return {
    /** @param {string} label @param {any} r a bare-agent run result */
    add(label, r) { entries.push({ label, ...priceOf(r) }); return entries.at(-1); },
    /** @param {{label: string, costUsd: number|null, unpricedRounds: number}[]} calls */
    absorb(calls) { for (const c of calls ?? []) entries.push({ ...c }); },
    report() {
      const known = entries.reduce((a, e) => a + (typeof e.costUsd === 'number' ? e.costUsd : 0), 0);
      const nullCostCalls = entries.filter((e) => e.costUsd === null).length;
      const unpricedRounds = entries.reduce((a, e) => a + (e.unpricedRounds || 0), 0);
      const spendComplete = nullCostCalls === 0 && unpricedRounds === 0;
      return {
        costUsd: spendComplete ? Number(known.toFixed(6)) : null,
        knownUsd: Number(known.toFixed(6)),
        spendComplete,
        nullCostCalls,
        unpricedRounds,
        calls: entries.map((e) => ({ ...e })),
      };
    },
  };
}

/**
 * The default model boundary: one bare-agent Loop per call, with the declaration
 * tool wired to END the call the moment it is used. The tool is an OUTPUT
 * CHANNEL, not a step in a conversation, so the round that would acknowledge its
 * result has nothing left to say.
 *
 * MEASURED against the real Loop with a counting provider, both arms: stop-wired
 * = 1 provider round, $0.001; unwired = 2 rounds, $0.002. So the wiring halves
 * the round count of every authoring and revise call — that is the number, not
 * an estimate, and it is why tool mode does not cost double what text mode did.
 *
 * `cacheMessages` (F18) and `maxTokens` (F30) are not optional on this stack.
 * @param {any} provider @param {{system?: string, maxTokens?: number}} [o]
 * @returns {(messages: any[], tools: any[], opts?: any) => Promise<any>}
 */
export function makeLoopGenerate(provider, { system = AUTHOR_SYSTEM, maxTokens = AUTHOR_MAX_TOKENS } = {}) {
  return async (/** @type {any[]} */ messages, /** @type {any[]} */ tools, /** @type {any} */ opts = {}) => {
    const loop = new Loop({ provider, system });
    const wired = tools.map((t) => ({
      ...t,
      execute: async (/** @type {any} */ a) => { const r = await t.execute(a); loop.stop(); return r; },
    }));
    return loop.run(messages, wired, { cacheMessages: true, maxTokens, ...opts });
  };
}

// ── 6. THE FLOW ──────────────────────────────────────────────────────────────

/** key-order-insensitive structural identity, for the early stop @param {any} x */
function canonical(x) {
  if (x === null || typeof x !== 'object') return JSON.stringify(x) ?? 'null';
  if (Array.isArray(x)) return `[${x.map(canonical).join(',')}]`;
  return `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`;
}

/**
 * ONE structured ask, with the malformed-emission retry bounded on its OWN axis.
 * A reply that carries no declaration is an ARTIFACT-RED — name the axis, retry
 * under a cap, write nothing — and it never consumes a revision, because a
 * transport fault is not a defect in a close.
 * @param {{messages: any[], generate: Function, mode: 'tool'|'text', retries: number,
 *   label: string, book: ReturnType<typeof makeCostBook>, catalogue: Record<string, any>}} o
 */
async function askDeclaration({ messages, generate, mode, retries, label, book, catalogue }) {
  /** @type {any[]} */
  const convo = [...messages];
  let attempts = 0;
  /** @type {Red|null} */
  let red = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    /** @type {{calls: any[]}} */
    const box = { calls: [] };
    const tools = mode === 'tool' ? [declarationTool(box, { catalogue })] : [];
    const r = await generate(convo, tools, {});
    attempts += 1;
    book.add(attempt === 0 ? label : `${label}#${attempt + 1}`, r);
    const raw = redactSecrets(String(r?.text ?? ''));

    if (r?.error) {
      return { declaration: null, attempts, convo, raw, providerError: String(r.error), red: null };
    }

    if (mode === 'tool') {
      if (box.calls.length === 1) return { declaration: box.calls[0], attempts, convo, raw, providerError: null, red: null };
      red = {
        code: 'artifact-red',
        path: DECLARATION_TOOL_NAME,
        detail: box.calls.length === 0
          ? `the reply delivered no ${DECLARATION_TOOL_NAME} call — structure is enforced, prose is never parsed`
          : `the reply delivered ${box.calls.length} ${DECLARATION_TOOL_NAME} calls; exactly one declaration is expected`,
        axis: box.calls.length === 0 ? 'no-declaration-tool-call' : 'multiple-declaration-tool-calls',
      };
    } else {
      // THE FALLBACK PATH — providers without tool mode only. The ONE shipped
      // parser, never a second one.
      const { code, red: extractRed } = extractArtifact(raw);
      if (code) {
        try { return { declaration: JSON.parse(code), attempts, convo, raw, providerError: null, red: null }; }
        catch (e) { red = { code: 'artifact-red', path: 'declaration', detail: `the declaration did not parse as JSON: ${String(/** @type {any} */ (e)?.message ?? e)}`, axis: 'unparseable-json' }; }
      } else {
        red = { code: 'artifact-red', path: 'declaration', detail: `no artifact in the reply: ${extractRed}`, axis: 'no-artifact' };
      }
    }

    if (attempt < retries) {
      const block = renderRejectBlock({ kind: 'artifact', reds: [/** @type {Red} */ (red).detail] });
      convo.push({ role: 'assistant', content: raw.trim() || '(the reply carried no text)' });
      convo.push({ role: 'user', content: `${block}\n\n${mode === 'tool' ? STRUCTURE_INSTRUCTION_TOOL : STRUCTURE_INSTRUCTION_TEXT}` });
    }
  }
  return { declaration: null, attempts, convo, raw: '', providerError: null, red };
}

/**
 * THE AUTHORING FLOW.
 *
 * Everything cheap happens BEFORE any token is spent: an ABSENT survey, an
 * unreadable listing, an unsupported genre and a genre variable that cannot be
 * built are all $0 refusals, because a paid call that was always going to be
 * thrown away is a paid call nobody needed.
 *
 * The return is deliberately complete rather than tidy:
 *   - `ok` is true iff a declaration passed validation and was measured;
 *   - `declaration` is the LAST ACCEPTED one, genre-env injected — the exact form
 *     that will run and that the signature will cover;
 *   - `reds` is what the LAST validated iteration said. `ok:true` with a non-empty
 *     `reds` means the final revision was rejected and the previous close stands:
 *     the rejection is reported, never hidden, and never silently shipped either;
 *   - `iterations` carries every intermediate declaration, validation, seed read
 *     and attempt count, because M4 emits them and a human signs against them.
 *
 * No spine emission here (M4 wires events).
 *
 * @param {{workdir: string, seedRef: string, lang: string,
 *   answers: Record<string|number, string>, questions?: Record<string|number, string>,
 *   scout: {state: string, facts: any, reason?: string|null, calls?: any[]},
 *   listing?: {stop: string|null, files: string[]|null, block: string|null, meta: any}|null,
 *   generate: Function, seedReadFn?: Function, closeCtx?: any,
 *   maxRevisions?: number, structureRetries?: number,
 *   structuredMode?: 'tool'|'text', catalogue?: Record<string, any>}} o
 */
export async function authorClose({
  workdir, seedRef, lang,
  answers, questions = TYPES_QUESTIONS,
  scout, listing = null,
  generate, seedReadFn = runSeedReadStages, closeCtx = {},
  maxRevisions = MAX_REVISIONS,
  structureRetries = MAX_STRUCTURE_RETRIES,
  structuredMode = 'tool',
  catalogue = KIND_CATALOGUE,
}) {
  const book = makeCostBook();
  book.absorb(scout?.calls ?? []);
  /** @type {any} */
  const base = {
    ok: false, declaration: null, seedRead: null, iterations: [], reds: [], cost: book.report(),
    facts: null, listing: null, genreEnv: null, finalFrom: null, stop: null, revisions: 0,
  };
  const refuse = (/** @type {Red[]} */ reds, /** @type {string} */ stop) => ({ ...base, reds, stop, cost: book.report() });

  // ── $0 preflight ──────────────────────────────────────────────────────────
  // F59, in the shape that bites: `{}` is the scout not completing, never "no
  // special facts are needed". This one lands in a SIGNED artefact.
  if (scout?.state !== 'PRESENT' || !scout.facts || typeof scout.facts !== 'object'
      || Object.keys(scout.facts).length === 0) {
    return refuse([{
      code: 'scout-absent',
      path: 'scout',
      detail: `the survey is ${scout?.state ?? 'missing'}${scout?.reason ? ` (${scout.reason})` : ''} — an absent facts `
        + 'object is never "no special facts are needed", and there is nothing to author from',
    }], 'precheck');
  }
  const facts = scout.facts;
  base.facts = facts;

  if (!GENRE_LANGUAGES.includes(lang)) {
    return refuse([{
      code: 'genre-unsupported',
      path: 'lang',
      detail: `no TYPES genre data for language "${lang}" — one of ${GENRE_LANGUAGES.join(', ')}. A genre with no `
        + 'guard battery must refuse, never author a close without the guards it cannot supply',
    }], 'precheck');
  }

  const seeds = listing ?? await buildSeedListing({
    workdir, seedRef, sourcePaths: facts.sourcePaths, testPaths: facts.testPaths,
  });
  const seedFiles = Array.isArray(seeds.files) ? seeds.files : null;
  if (seeds.stop !== null || seedFiles === null || seedFiles.length === 0) {
    return refuse([{
      code: seeds.stop ? 'listing-unreadable' : 'listing-absent',
      path: 'listing',
      detail: seeds.stop
        ?? 'the seed listing is empty — without it nothing can tell a real path from an invented one',
    }], 'precheck');
  }
  base.facts = facts;
  base.listing = seeds;

  const guards = genreGuards(lang);
  const ownedEnvNames = genreOwnedEnvNames(lang);
  // the source prefixes the genre's environment is built from, filtered against
  // the REAL tree — a prefix that names nothing would build a variable pointing
  // at nothing, and a symlink plus the directory behind it would name ONE tree
  // twice (see resolveSourcePrefixes: that is a FATAL mypy exit, not a warning)
  const sourcePrefixes = resolveSourcePrefixes({ workdir, sourcePaths: facts.sourcePaths, seedFiles });
  const envProbe = applyGenreEnv({ stages: [] }, lang, { sourcePrefixes, catalogue });
  base.genreEnv = { applied: envProbe.applied, owned: ownedEnvNames, missing: envProbe.missing, dropped: [] };
  if (envProbe.reds.length) return refuse(envProbe.reds, 'precheck');

  // ── the grounded loop ─────────────────────────────────────────────────────
  const prompt = authorPrompt({
    answers, questions, facts, listingBlock: /** @type {string} */ (seeds.block),
    lang, guards, ownedEnvNames, mode: structuredMode, catalogue,
  });
  /** @type {any[]} */
  let messages = [{ role: 'user', content: prompt }];
  /** @type {any[]} */
  const iterations = [];
  /** @type {any} */
  let previous = null;
  /** @type {any} */
  let accepted = null;
  /** @type {any[]|null} */
  let acceptedSeedRead = null;
  /** @type {string|null} */
  let finalFrom = null;
  /** @type {{ok: boolean, reds: Red[]}|null} */
  let lastValidation = null;
  /** @type {Red[]} */
  let fatal = [];
  let stop = 'max-revisions';
  /** @type {{stage: string, name: string}[]} */
  let droppedEnv = [];

  const seedTrees = makeSeedTrees();
  try {
    for (let i = 0; i <= maxRevisions; i += 1) {
      const label = i === 0 ? 'author' : `revise-${i}`;
      const ask = await askDeclaration({ messages, generate, mode: structuredMode, retries: structureRetries, label, book, catalogue });
      messages = ask.convo;
      /** @type {any} */
      const iter = {
        call: label, attempts: ask.attempts, declaration: ask.declaration ?? null,
        artifactRed: ask.red ?? null, providerError: ask.providerError ?? null,
        validation: null, seedRead: null, reviseTurn: null,
      };
      iterations.push(iter);

      if (ask.providerError) {
        // a transport failure is a casualty, never evidence about the model
        fatal = [{ code: 'provider-red', path: label, detail: ask.providerError }];
        stop = 'provider-red';
        break;
      }
      if (!ask.declaration) {
        fatal = [/** @type {Red} */ (ask.red)];
        stop = 'artifact-red';
        break;
      }

      // early stop: an unchanged declaration has the previous iteration's
      // measurements by definition — re-executing it buys nothing and costs a
      // full close
      if (previous && canonical(ask.declaration) === canonical(previous)) {
        iter.validation = '(identical declaration — see the previous iteration)';
        iter.seedRead = '(identical declaration — see the previous iteration)';
        stop = 'unchanged';
        break;
      }
      previous = ask.declaration;

      const v = validateDeclaration(ask.declaration, { catalogue, listing: seedFiles, guards, envOwned: ownedEnvNames });
      iter.validation = { ok: v.ok, reds: v.reds, scoped: v.scoped };
      lastValidation = { ok: v.ok, reds: v.reds };

      /** @type {string} */
      let measured;
      if (!v.ok) {
        // a validation red IS a measurement of the declaration, so it rides the
        // same channel and counts as a revision (addendum 5)
        measured = renderRejectBlock({ kind: 'validation', reds: v.reds });
      } else {
        // what gets MEASURED is what will RUN: the resolved declaration with the
        // genre's environment already injected
        const injected = applyGenreEnv(v.declaration, lang, { sourcePrefixes, catalogue });
        droppedEnv = injected.dropped;
        // `gapKeep` defaults to EMPTY rather than being left undefined: M1
        // prefixes every gap line with it verbatim, so an unset one prints the
        // word "undefined" on every failure line the model is asked to read
        const rows = await seedReadFn(injected.declaration, { gapKeep: '', ...closeCtx, workdir, seedRef, seedTrees });
        iter.seedRead = rows;
        accepted = injected.declaration;
        acceptedSeedRead = rows;
        finalFrom = label;
        measured = renderSeedReadBlock(rows);
      }

      if (i === maxRevisions) { stop = 'max-revisions'; break; }

      const turn = buildReviseTurn(measured);
      // A TRIPWIRE, not behaviour: it can only fire once something else is
      // already broken, so it is the one guard in this module the mutation
      // battery cannot kill — removing it changes no output today. It is kept
      // deliberately, and what the suite pins instead is the invariant it
      // protects: the bytes leaving this loop are exactly
      // `buildReviseTurn(renderSeedReadBlock(rows))`, so a future edit that
      // appends one helpful sentence here reds the suite either way.
      assertReviseTurn(turn, measured);
      iter.reviseTurn = { bytes: Buffer.byteLength(turn) };
      messages = [...messages, { role: 'assistant', content: ask.raw.trim() || '(the reply carried no text)' }, { role: 'user', content: turn }];
    }
  } finally {
    await seedTrees.cleanup();
  }

  const reds = fatal.length ? fatal : (lastValidation && !lastValidation.ok ? lastValidation.reds : []);
  return {
    // `ok` means A SIGNABLE CLOSE EXISTS, and nothing more. A dead socket on a
    // LATER revise call does not invalidate a close that was already validated
    // and already measured — a casualty is never evidence (F45), and throwing a
    // paid, measured close away over a transport fault is the wrong direction.
    // Why the loop ended is never hidden: `stop` names it and `reds` carries it.
    ok: accepted !== null,
    declaration: accepted,
    seedRead: acceptedSeedRead,
    iterations,
    reds,
    cost: book.report(),
    facts,
    listing: seeds,
    genreEnv: { ...base.genreEnv, dropped: droppedEnv },
    finalFrom,
    stop,
    revisions: Math.max(0, iterations.length - 1),
  };
}
