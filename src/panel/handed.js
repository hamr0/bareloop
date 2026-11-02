// Where the memory and the learnings were passed on (ITEM33-BUILD addendum 2026-11-02): the Audit shows the carry memo under the
// worker try that received it, and the learnings text under the planner part that received it. READ-ONLY and pure: the spine's own
// `carry-note` / `learnings` records, matched by their RECORDED phase and iteration (never by a timestamp window).
import { parseHintBlock, hintsErrorLine } from '../learn.js';

/**
 * One carry-note record as the Audit shows it: `{text, chars, capped}`, or `{missing:true, chars, capped}` for a record from before the
 * text was saved (older run).
 * @param {any} rec @returns {{text: string, chars: number, capped: boolean}|{missing: true, chars: number, capped: boolean}}
 */
function memoOf(rec) {
  const chars = typeof rec.chars === 'number' ? rec.chars : 0;
  const capped = rec.capped === true;
  return typeof rec.text === 'string' ? { text: rec.text, chars, capped } : { missing: true, chars, capped };
}

/**
 * The carry-note record that belongs to one try. Match = the recorded phase (`step:<id>` is the part's own label, `fix` the fix part),
 * the recorded iteration equal to the try's, and the record's spine order (`seq`) inside the try's own window. The window is needed
 * because a step re-entered after a replan restarts at iteration 1; a try with no iteration (a whole-part fallback) takes the first
 * record of its phase in its window.
 * @param {any[]} recs the run's carry-note records @param {string} phase @param {any} a a try: {iteration?, startSeq, endSeq}
 */
function recFor(recs, phase, a) {
  const lo = typeof a.startSeq === 'number' ? a.startSeq : -Infinity;
  const hi = typeof a.endSeq === 'number' ? a.endSeq : Infinity;
  const hit = recs.filter((r) => r.phase === phase && typeof r.seq === 'number' && r.seq > lo && r.seq <= hi
    && (typeof a.iteration !== 'number' || r.iteration === a.iteration));
  return hit[0] ?? null;
}

/**
 * Every step part's and fix part's tries (and a cut-off try) gain `memo`: the carry-note record handed to that try, or null.
 * Parts and tries are copied, never mutated. An outer-close try (no model call) never has one.
 * @param {any[]|undefined} parts @param {any[]} records the run's spine records
 */
export function attachMemos(parts, records) {
  if (!Array.isArray(parts)) return parts;
  const recs = records.filter((r) => r?.type === 'carry-note');
  if (recs.length === 0) return parts.map((p) => (p.kind === 'step' || p.kind === 'fix' ? { ...p, attempts: (p.attempts ?? []).map((a) => ({ ...a, memo: null })) } : p));
  return parts.map((p) => {
    if (p.kind !== 'step' && p.kind !== 'fix') return p;
    const phase = p.kind === 'fix' ? 'fix' : `step:${p.label}`;
    const one = (/** @type {any} */ a) => {
      if (a.source === 'outer-close') return { ...a, memo: null };
      const r = recFor(recs, phase, a);
      return { ...a, memo: r ? memoOf(r) : null };
    };
    return {
      ...p,
      attempts: (p.attempts ?? []).map(one),
      ...(p.cutOffTry ? { cutOffTry: one(p.cutOffTry) } : {}),
    };
  });
}

/**
 * The learnings the planner was handed, by injection: `draft` and `replan` (the first replan), each `{phase, text, chars, ids, hints}` or
 * null, plus `error` (the plain line when the learnings file could not be read, else null).
 * @param {any[]} records
 */
export function learningsHanded(records) {
  const pick = (/** @type {string} */ phase) => {
    const e = records.find((r) => r?.type === 'learnings' && r.phase === phase && typeof r.text === 'string');
    return e ? { phase, text: e.text, chars: e.text.length, ids: Array.isArray(e.ids) ? e.ids : [], hints: parseHintBlock(e.text) } : null;
  };
  const er = records.find((r) => r?.type === 'learnings' && typeof r.hintsError === 'string');
  return { draft: pick('draft'), replan: pick('replan'), error: er ? hintsErrorLine(String(er.hintsError)) : null };
}

/**
 * Put the learnings on the parts that received them: the draft block (and the error line) on the drafting part, else the `plan` part;
 * the first-replan block on the first `replan` part. `drafting` is the drafting part or null. Copies, never mutates.
 * @param {any[]|undefined} parts the spine's own parts @param {any|null} drafting @param {ReturnType<typeof learningsHanded>} l
 * @returns {{parts: any[]|undefined, drafting: any|null}}
 */
export function attachLearnings(parts, drafting, l) {
  const draftExtra = { ...(l.draft ? { learnings: l.draft } : {}), ...(l.error ? { learningsError: l.error } : {}) };
  const hasDraft = Object.keys(draftExtra).length > 0;
  const toDrafting = hasDraft && drafting ? { ...drafting, ...draftExtra } : drafting;
  if (!Array.isArray(parts)) return { parts, drafting: toDrafting };
  let draftDone = !hasDraft || !!drafting;
  let replanDone = !l.replan;
  const out = parts.map((p) => {
    if (!draftDone && p.kind === 'plan') { draftDone = true; return { ...p, ...draftExtra }; }
    if (!replanDone && p.kind === 'replan') { replanDone = true; return { ...p, learnings: l.replan }; }
    return p;
  });
  if (!draftDone && out.length > 0) out[0] = { ...out[0], ...draftExtra }; // no drafting or plan part: the first part, never lost
  return { parts: out, drafting: toDrafting };
}
