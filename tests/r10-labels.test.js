// R10 keep-both, labels: every list of a line's checks says who added each one - the drafter's `[agent]`, the person's own pick `[you picked]` (fwdloop's `[added]`
// marker, matched in kind). Surfaces: the signed close's own reader (checksOfClose), the Job tab and the plan card (one model, jobplan.js, one drawing, renderJobPlan),
// and the Audit's Draft group (the draft log's `draft-checks` line). The real refused declaration of the paid R10 drafts, put through the real draft gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDeclaration, classGuards, catalogueForLang, RUBRIC_LANG, genreForLang } from '../src/authoring.js';
import { withFactBindings, withDropNotes, settlePersonsWords, checksOfClose, reconcileRubricPlan } from '../src/rubricstep.js';
import { applyPicks, settleRules } from '../src/checkpick.js';
import { planFromSpec, planFromConfirm } from '../src/panel/jobplan.js';
import { draftingPartFor, readDraftChecks, DRAFT_LOG_FILE } from '../src/draftspend.js';

const { D3 } = JSON.parse(readFileSync(new URL('./fixtures/r10-keepboth-refused.json', import.meta.url), 'utf8'));
const jobLines = [{ n: 1, text: 'Summarise the latest release in the changelog', rule: 'exactly 3 bullets; under 80 words', rules: ['exactly 3 bullets', 'under 80 words'] }];
const rules = [{ line: 1, rule: 1, text: 'exactly 3 bullets' }, { line: 1, rule: 2, text: 'under 80 words' }];
const picks = [{ line: 1, rule: 1, check: { rule: 'listItems', value: 3 }, added: 'exactly 3 list items' }, { line: 1, rule: 2, check: { rule: 'maxWords', value: 80 }, added: 'at most 80 words' }];
const settled = settleRules(rules, picks, [], jobLines);
const v = validateDeclaration(withFactBindings(withDropNotes(settlePersonsWords(applyPicks(D3, settled), jobLines), undefined, jobLines)), {
  catalogue: catalogueForLang(RUBRIC_LANG), listing: ['input/CHANGELOG.md', 'output/.gitkeep'], guards: classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG }),
  envOwned: [], verdictType: 'soft-green', writeScope: ['output/'], jobLines, inputLabels: ['Changelog'],
});
const closeDecl = { genre: genreForLang(RUBRIC_LANG), lang: RUBRIC_LANG, stages: v.declaration.stages, picks: v.declaration.picks, ...(v.declaration.notes ? { notes: v.declaration.notes } : {}) };
const spec = { schema: 'job-v1', job: 'kb', goal: 'g', verdictType: 'soft-green', jobLines, closeDecl };

test('checksOfClose: the fact rows are the agent\'s, the picks (the close\'s own record) are the person\'s', () => {
  assert.equal(v.ok, true);
  const rows = checksOfClose(closeDecl);
  assert.deepEqual(rows.map((r) => r.by), rows.map((_r, i) => (i < rows.length - 2 ? 'agent' : 'you')));
  assert.deepEqual(rows.slice(-2).map((r) => r.text), ['the text has exactly 3 list items', 'the text is at most 80 words']);
  // no record, no "you": the same parts read as the agent's
  const { picks: _p, ...bare } = closeDecl;
  assert.ok(checksOfClose(bare).every((r) => r.by === 'agent'));
  // the reconciled card carries the mark too
  assert.deepEqual(reconcileRubricPlan({ confirmed: [], notChecked: [], closeDecl, jobLines }).checkItems.slice(-2).map((c) => c.by), ['you', 'you']);
});

test('Job tab (planFromSpec): each check under its line says who added it', () => {
  const p = planFromSpec(spec);
  const checks = p.lines[0].checks;
  assert.deepEqual(checks.filter((c) => c.by === 'you').map((c) => c.name), ['the text has exactly 3 list items', 'the text is at most 80 words']);
  assert.ok(checks.filter((c) => c.by === 'agent').length >= 1);
  assert.ok(checks.every((c) => c.by === 'agent' || c.by === 'you'));
  // a code job's stage is the drafter's too
  const code = planFromSpec({ goal: 'g', jobLines: [{ n: 1, text: 'x', rule: '' }], closeDecl: { genre: 'types', lang: 'js', stages: [{ name: 'tests-pass', fromLine: [1], kind: 'command-exit', params: {} }] } });
  assert.deepEqual(code.lines[0].checks, [{ name: 'tests-pass', cls: 'machine check', by: 'agent' }]);
});

test('plan card (planFromConfirm): the drafter\'s checks are [agent]; the picks keep their own "You picked" rows; a prepared card marks the close\'s pick rows', () => {
  const p = planFromConfirm(jobLines, { checkItems: [{ text: 'the heading is quoted', fromLine: [1] }], picked: [{ line: 1, text: 'at most 80 words' }] });
  assert.deepEqual(p.lines[0].checks, [{ name: 'the heading is quoted', cls: null, by: 'agent' }]);
  assert.deepEqual(p.lines[0].picked, ['at most 80 words']);
  const rec = reconcileRubricPlan({ confirmed: [], notChecked: [], closeDecl, jobLines });
  const prepared = planFromConfirm(jobLines, { checkItems: rec.checkItems, picked: [{ line: 1, text: 'at most 80 words' }] });
  assert.deepEqual(prepared.lines[0].checks.filter((c) => c.by === 'you').length, 2);
});

// ---- the page: functions extracted verbatim from index.html (no jsdom) ----------------------------------------------------------------------
const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0;
  let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) {
    if (PAGE[i] === '{') depth += 1;
    else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return PAGE.slice(start, i + 1);
}
const page = () => new Function(`${fnSrc('escapeXml')}\n${fnSrc('renderJobPlan')}\n${fnSrc('draftingTableHtml')}\n${fnSrc('draftingMoneyText')}\n${fnSrc('draftingCallCost')}\n${fnSrc('panelMoney')}\n${fnSrc('duration')}\nreturn { renderJobPlan, draftingTableHtml };`)();

test('renderJobPlan draws the mark on a check row, one markup for the plan card and the Job tab', () => {
  const { renderJobPlan } = page();
  const html = renderJobPlan(planFromSpec(spec));
  assert.match(html, /<div class="fold" data-testid="plan-check"><span class="mk">›<\/span> check · the text is at most 80 words · machine check <span class="by" data-testid="plan-by" data-by="you">\[you picked\]<\/span><\/div>/);
  assert.match(html, /data-by="agent">\[agent\]<\/span>/);
  assert.equal((html.match(/\[you picked\]/g) ?? []).length, 2);
  // the confirm turn: [agent] on the drafter's check, the pick's own row unchanged
  const conf = renderJobPlan(planFromConfirm(jobLines, { checkItems: [{ text: 'the heading is quoted', fromLine: [1] }], picked: [{ line: 1, text: 'at most 80 words' }] }));
  assert.match(conf, /the heading is quoted <span class="by" data-testid="plan-by" data-by="agent">\[agent\]<\/span>/);
  assert.match(conf, /data-testid="plan-picked"><span class="mk">›<\/span> You picked · at most 80 words<\/div>/);
  // an always-on guard and a not-known check carry no mark
  assert.doesNotMatch(renderJobPlan({ lines: [{ n: 1, text: 'x', rule: '', rules: [], checks: [{ name: 'c', cls: null }], refused: [], always: ['g'] }], loose: [], notChecked: [], readNotes: [], alwaysOn: [], older: false }), /class="by"/);
  assert.match(PAGE, /\.jp \.by,\.draft-checks-row \.by\{color:var\(--text-dim\)/);
});

test('Audit Draft group: the draft log\'s draft-checks line gives one row per check, [agent] or [you picked], after the revise label', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'r10-labels-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sess = join(root, 'panel-sessions', 's1');
  mkdirSync(join(sess, 'source-x'), { recursive: true });
  const at = (m) => `2026-11-09T09:00:${String(m).padStart(2, '0')}.000Z`;
  const rows = checksOfClose(closeDecl).map((c) => ({ line: c.line, text: c.text, by: c.by }));
  const ev = [
    { kind: 'draft-label', no: 0, label: 'revise 1', at: at(0) },
    { kind: 'step-start', no: 1, id: 'draft', label: 'drafting', at: at(1) },
    { kind: 'call', no: 1, step: 'draft', label: 'author', model: 'deepseek-flash', costUsd: 0.01, unpricedRounds: 0, at: at(2) },
    { kind: 'step-end', no: 1, status: 'done', label: 'drafting', at: at(3) },
    { kind: 'draft-checks', no: 1, checks: rows, at: at(4) },
  ];
  writeFileSync(join(sess, DRAFT_LOG_FILE), `${ev.map((e) => JSON.stringify(e)).join('\n')}\n{"kind":"draft-checks","che\n`);
  assert.deepEqual(readDraftChecks(sess), rows, 'a torn last line is skipped');
  const part = draftingPartFor({ spine: join(sess, 'source-x', 'u.jsonl'), patient: null }, { draftSpentUsd: 0.01, draftSpendComplete: true }, { home: root });
  assert.deepEqual(part.draftChecks, rows);
  const html = page().draftingTableHtml(part);
  const trs = html.slice(html.indexOf('<tbody>')).match(/<tr[^>]*>.*?<\/tr>/g);
  assert.match(trs[0], /drafting-kind/);
  const checkRows = trs.filter((x) => x.includes('drafting-check'));
  assert.equal(checkRows.length, rows.length);
  assert.match(checkRows.at(-1), /line 1 · the text is at most 80 words <span class="by" data-by="you">\[you picked\]<\/span>/);
  assert.match(checkRows[0], /data-by="agent">\[agent\]<\/span>/);
  assert.equal(trs.indexOf(checkRows[0]), 1, 'right after the label');
  assert.deepEqual(readDraftChecks(join(root, 'nothing-here')), []);
});
