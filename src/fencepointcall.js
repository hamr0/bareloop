// THE REPO JOB'S POINTING CALL (hamr 2026-11-15: "same as rubric"). A rubric job's `~` rules take the AI's pointing through row edits that code then judges; a repo job does the same. BEFORE the asks, ONE small call
// shows the AI each `~` rule's own words and the repo paths outside the write scope; it answers in the row-edit shape `{"edits": [...]}` with the one op `fence` {line, rule, path}. The edits go through
// `CheckBlock.applyDelta` like every rubric edit; code proves each (the path is on the listing, the rule's own words name it, it lies outside the write scope). The AI points; code decides.
// A rule nobody pointed at, or whose point fails the proof, is asked about like any rule code cannot settle. A failed call never stops the draft: its rules go to the questions.
import { askStructured, makeCostBook } from './authorflow.js';
import { lineRules } from './rubricstep.js';

/** the label of the call, as the drafting book and the draft log see it */
export const FENCE_POINT_LABEL = 'fence-point';
export const FENCE_POINT_TOOL = 'submit_edits';
/** at most this many outside paths are shown to the call */
export const FENCE_POINT_MAX_PATHS = 300;

/** the call's own system text (model-facing; a prompt register: src/promptregisters.js) */
export const FENCE_POINT_SYSTEM = `You read the "~" rules of a job and point at the files a rule asks to leave as they are, by sending EDITS to a list of checks that code keeps. Code checks every edit you send against the rule's own words and the file list; an edit it cannot prove is dropped.
Call ${FENCE_POINT_TOOL} once with an "edits" list, or with an empty list.
The one edit: {"op":"fence","line":N,"rule":n,"path":"<a path copied from the list of paths>"} - the rule asks that this file or folder stay as it is. The path is one of the listed paths, or a folder that holds some of them, and the rule's own words name it.
Send an edit only for a rule whose own words say a listed file or folder stays as it is. A rule that says anything else gets no edit. An empty list is a good answer.`;

export const FENCE_POINT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    edits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { enum: ['fence'] },
          line: { type: 'integer', minimum: 1, description: 'the job line number' },
          rule: { type: 'integer', minimum: 1, description: 'the number of the ~ rule on that line' },
          path: { type: 'string', minLength: 1, description: 'a path from the list that the rule asks to leave as it is' },
        },
        required: ['op', 'line', 'rule', 'path'],
        additionalProperties: false,
      },
    },
  },
  required: ['edits'],
  additionalProperties: false,
});

const channel = () => ({
  name: FENCE_POINT_TOOL,
  instruction: `Your reply did not deliver exactly one ${FENCE_POINT_TOOL} call. Call ${FENCE_POINT_TOOL} exactly once. Do not write the answer as text.`,
  textPath: 'edits',
  tool: (/** @type {{calls: any[]}} */ box) => ({
    name: FENCE_POINT_TOOL,
    description: 'Deliver the fence edits (or an empty list). Call this exactly once.',
    parameters: FENCE_POINT_SCHEMA,
    execute: async (/** @type {any} */ args) => { box.calls.push(args); return 'received'; },
  }),
});

/** @param {{n: number, rules?: string[], rule?: string}[]} jobLines @param {string[]} outside the repo paths outside the write scope @param {string[]|null} writeScope @returns {string} */
export function fencePointUserText(jobLines, outside, writeScope) {
  const out = ["THE RULES (the person's own words)"];
  for (const l of jobLines) lineRules(l).forEach((r, i) => out.push(`line ${l.n} rule ${i + 1}: ${r}`));
  out.push('', `PATHS OUTSIDE THE WRITE SCOPE${Array.isArray(writeScope) && writeScope.length ? ` (${writeScope.join(', ')})` : ''}:`, ...outside.slice(0, FENCE_POINT_MAX_PATHS).map((p) => `- ${p}`));
  return out.join('\n');
}

/**
 * The one paid call; its spend is booked like the look's. An unusable answer is NOT a guessed list: it yields no edits and says why (the rules then go to the questions).
 * @param {{jobLines: any[], outside: string[], writeScope?: string[]|null, generate: Function, ceilingUsd?: number|null, onCall?: (c: any) => void, priorCalls?: any[], priorRaws?: any[]}} o
 * @returns {Promise<{edits: any[], reason: string|null, calls: any[], raws: any[]}>}
 */
export async function runFencePoint({ jobLines, outside, writeScope = null, generate, ceilingUsd = null, onCall = () => {}, priorCalls = [], priorRaws = [] }) {
  const book = makeCostBook({ ceilingUsd, onCall });
  book.absorb(priorCalls, priorRaws);
  const before = book.report().calls.length;
  const beforeRaws = book.raws().length;
  const r = await askStructured({ messages: [{ role: 'user', content: fencePointUserText(jobLines, outside, writeScope) }], generate, mode: 'tool', retries: 1, label: FENCE_POINT_LABEL, book, channel: channel() });
  const edits = r.artifact && Array.isArray(r.artifact.edits) ? r.artifact.edits : [];
  const reason = r.artifact ? null : (r.budget ? 'the spend ceiling was reached' : (r.providerError ?? r.red?.detail ?? 'the answer could not be read'));
  return { edits, reason, calls: book.report().calls.slice(before), raws: book.raws().slice(beforeRaws) };
}
