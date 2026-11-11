// A11: the card tags a check code added itself `[default]` (the `$` rows of the one list), beside `[you picked]` and `[agent]`; the plan bubble and the Job tab share the one drawing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checksOfClose, defaultCitedText } from '../src/rubricstep.js';
import { planFromSpec, planFromConfirm } from '../src/panel/jobplan.js';
import * as CL from '../src/checklist.js';

const stage = (parts) => ({ name: 'line-2', kind: 'rubric-step', fromLine: [2], params: { step: 2, parts } });
const closeDecl = { lang: 'text', stages: [stage([
  { text: defaultCitedText('Changelog'), class: 'countable', check: 'cited', source: 'Changelog' },
  { text: 'every number in the text is in a quote checked on line 1', class: 'countable', check: 'numbersFromFacts', from: [1] },
  { text: 'the text is at most 80 words', class: 'countable', check: 'maxWords', value: 80 },
  { text: 'my own cited wording', class: 'countable', check: 'cited', source: 'Other' },
])] };
const spec = { schema: 'job-v1', job: 'kb', goal: 'g', verdictType: 'soft-green', jobLines: [{ n: 1, text: 'find', rule: '' }, { n: 2, text: 'write', rule: '' }], closeDecl };

test('A11 checksOfClose: the default cited part and the numbers tie are [default]; a drafter-worded cited part and a limit stay [agent]', () => {
  assert.deepEqual(checksOfClose(closeDecl).map((r) => r.by), ['default', 'default', 'agent', 'agent']);
  assert.equal(CL.applyLedger({ stages: [stage([])] }, [], { labels: ['Changelog'] }).declaration.stages[0].params.parts[0].text, defaultCitedText('Changelog'), 'the list module writes the very text the card reads');
});

test('A11 Job tab (planFromSpec) and the plan card carry the default mark through', () => {
  assert.deepEqual(planFromSpec(spec).lines[1].checks.map((c) => c.by), ['default', 'default', 'agent', 'agent']);
  const conf = planFromConfirm(spec.jobLines, { checkItems: [{ text: 'every claim is backed', fromLine: [2], by: 'default' }] });
  assert.equal(conf.lines[1].checks[0].by, 'default');
});

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

test('A11 renderJobPlan draws [default] with the same markup as the other two marks', () => {
  const { renderJobPlan } = new Function(`${fnSrc('escapeXml')}\n${fnSrc('renderJobPlan')}\nreturn { renderJobPlan };`)();
  const html = renderJobPlan(planFromSpec(spec));
  assert.match(html, /<span class="by" data-testid="plan-by" data-by="default">\[default\]<\/span>/);
  assert.equal((html.match(/\[default\]/g) ?? []).length, 2);
  assert.match(html, /data-by="agent">\[agent\]<\/span>/);
});
