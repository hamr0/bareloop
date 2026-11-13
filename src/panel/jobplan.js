// The job plan MODEL (P7, docs/product/PANEL-BUILD.md "The job" block): ONE owner of the structure the page's single
// `renderJobPlan()` draws in two places — the drafting confirm card (the plan bubble) and the read-only Job tab. The
// server builds it; the page only draws it (so the two places can never read the same plan two ways).
//
//   { lines: [{n, text, rule, rules: [string...], checks: [{name, cls}], refused: [reason...]}],
//     loose: [{name, cls}],        checks that name no job line (an older caller, or a model slip)
//     notChecked: [text...],       "Not checked" — what nothing checks
//     notCheckedBy: {text: 'you'|'agent'|'default'},  the tag of a Not checked row, by its row's kind (a refused line under a job line is keyed by its text too)
//     alwaysOn: [text...],         the mandatory guards / protections, which serve no job line
//     older: boolean }             an older job: the numbered lines were not saved
//
// `cls` is 'machine check' | 'judge' | null (null = not known yet: the confirm card's checks are the model's plan, the
// stage kinds exist only after drafting). Pure; no file IO.
import { ticketFilterWords } from '../ticketfilter.js';
import { KIND_CATALOGUE } from '../authoring.js';
import { WEEK_ONLY_WORDS } from '../checklist.js';
import { splitReadNotes } from '../pagedropwords.js';
import { checksOfClose, signedFactNames, proseNotChecked, lineRules, confirmedGoalOf, refusedOf, listRowName, ruleNotCheckedItems } from '../rubricstep.js';

/** `by` = who added the check: the drafter (`agent`) or the person's own pick (`you`); absent = code's own (an always-on guard, a number tie) or not known */
/** `stage` = the signed close stage the row belongs to (its recorded verdict is the row's result in the Audit) */
/** @typedef {{text: string, by: 'agent'|'you'|'default'|null, result: 'passed'|'failed'|'none'|'not-checked'}} AuditRow */
/** @typedef {{name: string, cls: 'machine check'|'judge'|null, by?: 'agent'|'you'|'default'|null, key?: string, stage?: string}} PlanCheck */
/** @typedef {{n: number, text: string, rule: string, rules: string[], checks: PlanCheck[], refused: string[], always?: string[], picked?: string[]}} PlanLine */
/** @typedef {{lines: PlanLine[], loose: PlanCheck[], notChecked: string[], readNotes: string[], alwaysOn: string[], older: boolean, goal?: string, ticketFilter?: string, notCheckedBy?: Record<string, 'you'|'agent'|'default'>, suggested?: {key: string, line: number, text: string}[], editable?: boolean}} JobPlan */

/** the ticket filter's code-owned words as a plan part, or nothing (R5) @param {any} f @returns {{ticketFilter?: string}} */
function filterPart(f) {
  const w = ticketFilterWords(f);
  return w === null ? {} : { ticketFilter: w };
}

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
 * The plan of a SIGNED spec. With `jobLines`, each stage lands under EACH line its `fromLine` array names (a stage with none is
 * a mandatory guard: "Always checked"), `closeDecl.refused` reasons land under their line, and `closeDecl.notes` are the
 * drafter's own "not checked" words. Without `jobLines` (a spec that predates the job block) the signed goal sentence is
 * line 1 and every stage name is a check under it — `older: true`.
 * `ledger` = the draft log's final check-list rows (`readDraftLedger`), the words a Not checked row is named by; absent (no draft log) a row is named from its key.
 * @param {any} spec
 * @param {{key: string, words: string[]}[]|null} [ledger]
 * @returns {JobPlan}
 */
export function planFromSpec(spec, ledger = null) {
  /** @type {{name: string, cls: 'machine check'|'judge'|null, fromLine: number[]|null, by?: 'agent'|'you'|'default'|null, stage?: string}[]} */
  let stages = [];
  if (spec && Array.isArray(spec.closeDecl?.stages)) {
    stages = spec.closeDecl.stages.filter((/** @type {any} */ s) => s && typeof s.name === 'string' && s.name)
      .flatMap((/** @type {any} */ s) => {
        const fromLine = Array.isArray(s.fromLine) && s.fromLine.length ? s.fromLine.filter(Number.isInteger) : null;
        // PART 1b: a rubric-step stage is shown as the checks it RUNS — one code-worded row per fact, per count, per limit — read by
        // the same reader (`checksOfClose`) the confirm card and the sign-time invariant use, so the Job tab cannot differ from them
        const rows = s.kind === 'rubric-step' ? checksOfClose({ stages: [s], picks: spec.closeDecl.picks, list: spec.closeDecl.list }) : [];
        return rows.length > 0 ? rows.map((r) => ({ name: r.text, cls: /** @type {'machine check'} */ ('machine check'), fromLine, by: r.by, stage: s.name })) : [{ name: s.name, cls: checkClassOfKind(s.kind), fromLine, by: /** @type {'agent'} */ ('agent'), stage: s.name }];
      });
  } else if (spec && Array.isArray(spec.close)) {
    stages = spec.close.filter((/** @type {any} */ s) => s && typeof s.name === 'string' && s.name)
      .map((/** @type {any} */ s) => ({ name: s.name, cls: /** @type {'machine check'} */ ('machine check'), fromLine: null }));
  }
  // a prose step says what it does not check (PART 1b, RF5): the person judges the text at Accept
  const allNotes = [
    ...(Array.isArray(spec?.closeDecl?.notes) ? spec.closeDecl.notes.filter((/** @type {any} */ n) => typeof n === 'string' && n) : []),
    ...proseNotChecked(spec?.closeDecl),
  ];
  // code's notes on which written forms of a still-checked fact were not used are "How the page was read", not Not checked
  const { notChecked: notes, readNotes } = splitReadNotes(allNotes, signedFactNames(spec?.closeDecl));
  const jl = Array.isArray(spec?.jobLines) ? spec.jobLines.filter((/** @type {any} */ l) => l && Number.isInteger(l.n) && typeof l.text === 'string') : [];
  if (jl.length === 0) {
    return {
      lines: [{
        n: 1, text: typeof spec?.goal === 'string' && spec.goal ? spec.goal : '(no goal recorded)', rule: '', rules: [],
        checks: stages.map((s) => ({ name: s.name, cls: s.cls })), refused: [],
      }],
      loose: [], notChecked: notes, readNotes, alwaysOn: [], older: true, ...filterPart(spec?.ticketFilter),
    };
  }
  /** @type {PlanLine[]} */
  const lines = jl.map((/** @type {any} */ l) => ({ n: l.n, text: l.text, rule: typeof l.rule === 'string' ? l.rule : '', rules: lineRules(l), checks: [], refused: [] }));
  /** @type {PlanCheck[]} */
  const loose = [];
  /** @type {string[]} */
  const alwaysOn = [];
  /** Not checked rows tagged by their row's kind (F-c): `[you]` a rule the person wrote, `[agent]` the agent's, `[default]` code's @type {Record<string, 'you'|'agent'|'default'>} */
  const refusedBy = {};
  for (const s of stages) {
    if (s.fromLine === null) { alwaysOn.push(s.name); continue; }
    // a check that serves several job lines is shown under EACH line it serves (no new element: the same check line, repeated)
    const served = lines.filter((l) => /** @type {number[]} */ (s.fromLine).includes(l.n));
    for (const line of served) line.checks.push({ name: s.name, cls: s.cls, ...(s.by ? { by: s.by } : {}), ...(s.stage ? { stage: s.stage } : {}) });
    if (served.length === 0) loose.push({ name: s.name, cls: s.cls, ...(s.by ? { by: s.by } : {}), ...(s.stage ? { stage: s.stage } : {}) });
  }
  // an always-on guard that the drafter said covers a job line is shown under that line too ("› check · always-on: <guard>")
  for (const g of Array.isArray(spec?.closeDecl?.guardLines) ? spec.closeDecl.guardLines : []) {
    if (!g || typeof g.guard !== 'string' || !Array.isArray(g.lines)) continue;
    for (const line of lines.filter((l) => g.lines.includes(l.n))) (line.always ??= []).push(g.guard);
  }
  for (const r of refusedOf(spec?.closeDecl)) {
    const line = lines.find((l) => l.n === r?.line);
    // a refusal of ONE ~ rule (PART 1b, RF16) names the rule in the person's words, so the row reads as that rule's Not checked; a list row of another kind names its fact when it has one
    const ruleText = line && Number.isInteger(r.rule) ? lineRules(spec.jobLines.find((/** @type {any} */ l) => l?.n === r.line))[Number(r.rule) - 1] : (r.label ?? null);
    // a list row that is not a fact or a rule (a phrase, a count) is named by its words: the draft log's, else the text after the key's kind prefix
    const named = line && !ruleText && r.fromList && r.key ? listRowName(r.kind, r.key, ledger?.find((x) => x.key === r.key)?.words) : null;
    const text = ruleText ? `"${ruleText}" — ${r.reason}` : (named ? `${named} — ${r.reason}` : r.reason);
    if (line) { line.refused.push(text); if (r.by) refusedBy[text] = r.by; }
  }
  // a row the list dropped because it names a version or a date from the input is told, with its reason (the signed card preview, A11); other dropped rows are not drawn
  for (const r of Array.isArray(spec?.closeDecl?.list) ? spec.closeDecl.list : []) {
    if (!r || r.state !== 'dropped' || r.reason !== WEEK_ONLY_WORDS || typeof r.key !== 'string' || r.kind === 'rule') continue;
    const line = lines.find((l) => l.n === r.line);
    if (line) line.refused.push(`${listRowName(r.kind, r.key, ledger?.find((x) => x.key === r.key)?.words)} — ${r.reason}`);
  }
  const notCheckedBy = { ...refusedBy };
  for (const i of ruleNotCheckedItems(spec?.closeDecl, spec?.jobLines, ledger)) if (i.by) notCheckedBy[i.text] = i.by;
  // the model's signed goal sentence rides along: the page draws it as the "AI's summary" row (an older job shows it as line 1 instead)
  // (a rubric job's signed goal is the whole worker brief: only the sentence the person confirmed is the summary)
  const summary = typeof spec?.goal === 'string' && spec.goal ? confirmedGoalOf(spec.goal) : null;
  return { lines, loose, notChecked: notes, readNotes, alwaysOn, older: false, ...(Object.keys(notCheckedBy).length ? { notCheckedBy } : {}), ...(summary ? { goal: summary } : {}), ...filterPart(spec?.ticketFilter) };
}

/**
 * The plan of the confirm turn, before anything is drafted: the person's own job lines, the model's checks under the
 * line each names, its own "not checked" words, and the real protections (code-owned) as "Always checked".
 * @param {{n: number, text: string, rule: string, rules?: string[]}[]|null|undefined} jobLines
 * @param {{checkItems?: {text: string, fromLine: number[]|null, by?: 'agent'|'you'|'default'|null, key?: string}[], checks?: string[], notChecked?: string[], protections?: string[], signedFacts?: string[], ticketFilter?: any, picked?: {line: number, text: string}[], notCheckedBy?: Record<string, 'you'|'agent'|'default'>, suggested?: {key: string, line: number, text: string}[], editable?: boolean}} plan
 * `signedFacts` = the names of the facts the look signs (so an S1 copy of a signed fact reads as a note, not Not checked)
 * @returns {JobPlan}
 */
export function planFromConfirm(jobLines, plan) {
  const items = Array.isArray(plan?.checkItems) && plan.checkItems.length
    ? plan.checkItems
    : (Array.isArray(plan?.checks) ? plan.checks.map((c) => ({ text: String(c), fromLine: null })) : []);
  const jl = Array.isArray(jobLines) ? jobLines : [];
  /** @type {PlanLine[]} */
  const lines = jl.map((l) => ({ n: l.n, text: l.text, rule: l.rule, rules: lineRules(l), checks: [], refused: [] }));
  /** @type {PlanCheck[]} */
  const loose = [];
  // the person's picks are drawn once, from `plan.picked` (their words, with `kept from last draft`) as `[you picked]` check rows: a close row for the same pick is not a second row
  const hasPicked = Array.isArray(plan?.picked) && plan.picked.length > 0;
  for (const c of items.filter((x) => !(hasPicked && /** @type {any} */ (x).by === 'you' && !(/** @type {any} */ (x).key)))) {
    const by = /** @type {any} */ (c).by === null ? {} : { by: /** @type {'agent'|'you'|'default'} */ (/** @type {any} */ (c).by ?? 'agent') };
    const served = lines.filter((l) => Array.isArray(c.fromLine) && c.fromLine.includes(l.n));
    const key = typeof (/** @type {any} */ (c).key) === 'string' ? { key: /** @type {any} */ (c).key } : {};
    for (const line of served) line.checks.push({ name: c.text, cls: null, ...by, ...key });
    if (served.length === 0) loose.push({ name: c.text, cls: null, ...by, ...key });
  }
  const { notChecked, readNotes } = splitReadNotes(plan?.notChecked, plan?.signedFacts);
  // R10 (fwd am16 (6)): the checks the person picked, each under its line, in the one table's plain words (`kept from last draft` rides in `text` when a Revise kept it)
  for (const x of Array.isArray(plan?.picked) ? plan.picked : []) {
    const line = lines.find((l) => l.n === x?.line);
    if (line && typeof x.text === 'string') (line.picked ??= []).push(x.text);
  }
  return {
    lines, loose, notChecked, readNotes, alwaysOn: [...(plan?.protections ?? [])], older: false, ...filterPart(plan?.ticketFilter),
    ...(plan?.notCheckedBy && typeof plan.notCheckedBy === 'object' && Object.keys(plan.notCheckedBy).length ? { notCheckedBy: plan.notCheckedBy } : {}),
    ...(Array.isArray(plan?.suggested) && plan.suggested.length ? { suggested: plan.suggested } : {}),
    ...(plan?.editable === true ? { editable: true } : {}),
  };
}

/** the words of a row the run recorded no verdict for: never "passed" */
export const AUDIT_NO_RESULT = 'no result recorded';

/**
 * The Audit's check list (hamr ruling A, 2026-11-13): the SAME sections as the card, read from the SAME model (`plan` = {@link planFromSpec}'s, plus `guards` = the
 * code-owned protections the confirm card shows), each row with its tag and, after the run, its result. A check's result is the recorded verdict of its own signed stage
 * (`results`: stage name to passed), never re-derived; a row no verdict was recorded for says so. A Not checked row's result is "not checked" (its reason is in its words).
 * @param {JobPlan} plan @param {string[]} guards @param {Map<string, boolean>|null} results
 * @returns {{checks: AuditRow[], notChecked: AuditRow[], always: AuditRow[]}}
 */
export function auditChecksOf(plan, guards, results) {
  /** @param {string|undefined|null} stage @returns {'passed'|'failed'|'none'} */
  const verdict = (stage) => (!stage || !results || !results.has(stage) ? 'none' : (results.get(stage) ? 'passed' : 'failed'));
  /** @type {AuditRow[]} */
  const checks = [];
  for (const l of plan.lines) for (const c of l.checks) checks.push({ text: `line ${l.n} · ${c.name}`, by: c.by ?? null, result: verdict(c.stage) });
  for (const c of plan.loose) checks.push({ text: `other · ${c.name}`, by: c.by ?? null, result: verdict(c.stage) });
  /** @type {AuditRow[]} */
  const notChecked = [];
  const by = plan.notCheckedBy ?? {};
  for (const l of plan.lines) for (const r of l.refused) notChecked.push({ text: `line ${l.n} · ${r}`, by: by[r] ?? null, result: 'not-checked' });
  for (const r of plan.notChecked) notChecked.push({ text: r, by: by[r] ?? null, result: 'not-checked' });
  const names = guards.length > 0 ? guards : plan.alwaysOn;
  const always = names.map((g) => {
    const head = g.split(' — ')[0];
    const file = /^line (\d+) file$/.exec(head);
    // the write fence is held by the gate, which records no verdict of its own: it says so rather than borrowing another stage's
    const stage = file ? `line-${file[1]}` : (head === 'write fence' ? null : head);
    return { text: g, by: /** @type {'default'} */ ('default'), result: verdict(stage) };
  });
  return { checks, notChecked, always };
}
