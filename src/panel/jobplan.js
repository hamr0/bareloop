// The job plan MODEL (P7, docs/product/PANEL-BUILD.md "The job" block): ONE owner of the structure the page's single
// `renderJobPlan()` draws in two places — the drafting confirm card (the plan bubble) and the read-only Job tab. The
// server builds it; the page only draws it (so the two places can never read the same plan two ways).
//
//   { lines: [{n, text, rule, checks: [{name, cls}], refused: [reason...]}],
//     loose: [{name, cls}],        checks that name no job line (an older caller, or a model slip)
//     notChecked: [text...],       "the AI's own reading" — what the drafter says nothing checks
//     alwaysOn: [text...],         the mandatory guards / protections, which serve no job line
//     older: boolean }             an older job: the numbered lines were not saved
//
// `cls` is 'machine check' | 'judge' | null (null = not known yet: the confirm card's checks are the model's plan, the
// stage kinds exist only after drafting). Pure; no file IO.
import { KIND_CATALOGUE } from '../authoring.js';

/** @typedef {{name: string, cls: 'machine check'|'judge'|null}} PlanCheck */
/** @typedef {{n: number, text: string, rule: string, checks: PlanCheck[], refused: string[]}} PlanLine */
/** @typedef {{lines: PlanLine[], loose: PlanCheck[], notChecked: string[], alwaysOn: string[], older: boolean}} JobPlan */

/**
 * `machine check` for a kind a command decides, `judge` for one that needs judgement; `null` for a stage whose kind is
 * unknown (a hand-written command close has no kind: it is a command, so a machine check).
 * @param {unknown} kind
 * @returns {'machine check'|'judge'|null}
 */
export function checkClassOfKind(kind) {
  if (typeof kind !== 'string') return null;
  const spec = Object.hasOwn(KIND_CATALOGUE, kind) ? KIND_CATALOGUE[kind] : null;
  if (!spec) return null;
  return spec.verdictClass === 'green' ? 'machine check' : 'judge';
}

/**
 * The plan of a SIGNED spec. With `jobLines`, each stage lands under the line its `fromLine` names (a stage with none is
 * a mandatory guard: "Always on"), `closeDecl.refused` reasons land under their line, and `closeDecl.notes` are the
 * drafter's own "not checked" words. Without `jobLines` (a spec that predates the job block) the signed goal sentence is
 * line 1 and every stage name is a check under it — `older: true`.
 * @param {any} spec
 * @returns {JobPlan}
 */
export function planFromSpec(spec) {
  /** @type {{name: string, cls: 'machine check'|'judge'|null, fromLine: number|null}[]} */
  let stages = [];
  if (spec && Array.isArray(spec.closeDecl?.stages)) {
    stages = spec.closeDecl.stages.filter((/** @type {any} */ s) => s && typeof s.name === 'string' && s.name)
      .map((/** @type {any} */ s) => ({ name: s.name, cls: checkClassOfKind(s.kind), fromLine: Number.isInteger(s.fromLine) ? s.fromLine : null }));
  } else if (spec && Array.isArray(spec.close)) {
    stages = spec.close.filter((/** @type {any} */ s) => s && typeof s.name === 'string' && s.name)
      .map((/** @type {any} */ s) => ({ name: s.name, cls: /** @type {'machine check'} */ ('machine check'), fromLine: null }));
  }
  const notes = Array.isArray(spec?.closeDecl?.notes) ? spec.closeDecl.notes.filter((/** @type {any} */ n) => typeof n === 'string' && n) : [];
  const jl = Array.isArray(spec?.jobLines) ? spec.jobLines.filter((/** @type {any} */ l) => l && Number.isInteger(l.n) && typeof l.text === 'string') : [];
  if (jl.length === 0) {
    return {
      lines: [{
        n: 1, text: typeof spec?.goal === 'string' && spec.goal ? spec.goal : '(no goal recorded)', rule: '',
        checks: stages.map((s) => ({ name: s.name, cls: s.cls })), refused: [],
      }],
      loose: [], notChecked: notes, alwaysOn: [], older: true,
    };
  }
  /** @type {PlanLine[]} */
  const lines = jl.map((/** @type {any} */ l) => ({ n: l.n, text: l.text, rule: typeof l.rule === 'string' ? l.rule : '', checks: [], refused: [] }));
  /** @type {PlanCheck[]} */
  const loose = [];
  /** @type {string[]} */
  const alwaysOn = [];
  for (const s of stages) {
    if (s.fromLine === null) { alwaysOn.push(s.name); continue; }
    const line = lines.find((l) => l.n === s.fromLine);
    if (line) line.checks.push({ name: s.name, cls: s.cls }); else loose.push({ name: s.name, cls: s.cls });
  }
  const refused = Array.isArray(spec?.closeDecl?.refused) ? spec.closeDecl.refused : [];
  for (const r of refused) {
    const line = lines.find((l) => l.n === r?.line);
    if (line && typeof r.reason === 'string') line.refused.push(r.reason);
  }
  return { lines, loose, notChecked: notes, alwaysOn, older: false };
}

/**
 * The plan of the confirm turn, before anything is drafted: the person's own job lines, the model's checks under the
 * line each names, its own "not checked" words, and the real protections (code-owned) as "Always on".
 * @param {{n: number, text: string, rule: string}[]|null|undefined} jobLines
 * @param {{checkItems?: {text: string, fromLine: number|null}[], checks?: string[], notChecked?: string[], protections?: string[]}} plan
 * @returns {JobPlan}
 */
export function planFromConfirm(jobLines, plan) {
  const items = Array.isArray(plan?.checkItems) && plan.checkItems.length
    ? plan.checkItems
    : (Array.isArray(plan?.checks) ? plan.checks.map((c) => ({ text: String(c), fromLine: null })) : []);
  const jl = Array.isArray(jobLines) ? jobLines : [];
  /** @type {PlanLine[]} */
  const lines = jl.map((l) => ({ n: l.n, text: l.text, rule: l.rule, checks: [], refused: [] }));
  /** @type {PlanCheck[]} */
  const loose = [];
  for (const c of items) {
    const line = lines.find((l) => l.n === c.fromLine);
    if (line) line.checks.push({ name: c.text, cls: null }); else loose.push({ name: c.text, cls: null });
  }
  return {
    lines, loose, notChecked: [...(plan?.notChecked ?? [])], alwaysOn: [...(plan?.protections ?? [])], older: false,
  };
}
