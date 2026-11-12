// Shared scaffolding for the R10 tests that used to run a saved AI-written declaration through the deleted reconcile chain (applyPicks, settlePersonsWords, withDropNotes, withFactBindings):
// the check block builds the plan now, so a saved draft's fact parts are the look's facts, the person's picks are carried, and the declaration is the block's own (src/authorflow.js assemble).
import { CheckBlock } from '../src/checkblock.js';
import { classGuards, RUBRIC_LANG } from '../src/authoring.js';

/** the person's two picks of the saved R10 drafts, as the record carries them */
export const PICKS = [{ line: 1, rule: 1, check: { rule: 'listItems', value: 3 }, added: 'exactly 3 list items' }, { line: 1, rule: 2, check: { rule: 'maxWords', value: 80 }, added: 'at most 80 words' }];

/**
 * @param {any} d a saved declaration (its fact parts become the look's facts, its count a `count` add) @param {string} text the input text @param {{picked?: any[]|null, rules?: string[], label?: string}} [o]
 * @returns {{declaration: any, block: CheckBlock, close: any}}
 */
export function builtFrom(d, text, { picked = PICKS, rules = ['exactly 3 bullets', 'under 80 words'], label = 'Changelog' } = {}) {
  const steps = d.stages.filter((/** @type {any} */ s) => s.kind === 'rubric-step');
  const facts = steps.flatMap((/** @type {any} */ s) => s.params.parts.filter((/** @type {any} */ p) => p.class === 'fact').flatMap((/** @type {any} */ p) => p.facts.map((/** @type {any} */ f) => ({ line: s.params.step, name: f.name, shape: f.shape, source: p.source ?? label, words: [f.phrase ?? f.anchor].filter(Boolean) }))));
  const count = steps.flatMap((/** @type {any} */ s) => s.params.parts.filter((/** @type {any} */ p) => p.count).map((/** @type {any} */ p) => p.count))[0];
  const block = new CheckBlock({ texts: { [label]: text }, labels: [label], asks: false });
  block.fromJob([{ n: 1, text: 'Summarise the latest release in the changelog', rules: [...rules, ...(picked ? picked.map((/** @type {any} */ p) => p.added) : [])] }]);
  block.addLook(facts);
  if (picked) block.carry({ picks: picked });
  if (count) block.applyDelta({ edits: [{ op: 'add', kind: 'count', line: 1, ...count }] });
  const close = block.reconcile();
  const picks = close.map.flatMap((/** @type {any} */ m) => { const part = close.parts[m.part]; return part.class === 'countable' && Array.isArray(part.rules) ? [{ line: m.line, part }] : []; });
  const guards = classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG }).map((g) => ({ name: g.name, kind: g.kind, params: { ...g.params, allowPrefixes: ['output/'] } }));
  const refused = block.rows.filter((r) => r.kind === 'rule' && r.state !== 'built').map((r) => ({ line: r.line, rule: r.rule, reason: String(r.reason) }));
  return { declaration: { stages: [...guards, ...close.stages], ...(picks.length ? { picks } : {}), ...(refused.length ? { refused } : {}) }, block, close };
}
