// P7 page: the two numbered boxes (The job, Inputs), the ONE plan renderer shared by the chat bubble and the Job tab,
// the Job tab's rows (Inputs, Destination, Cap, Signed), the folded prefill. Same posture as the other *-page tests:
// page functions extracted by name and run against a fake DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
}
const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// eslint-disable-next-line no-new-func
const renderJobPlan = new Function('escapeXml', `${fnSrc('renderJobPlan')}\nreturn renderJobPlan;`)(escapeXml);

const PLAN = {
  lines: [
    { n: 1, text: 'Find <3> flights', rule: 'PASS: quoted; FAIL: invented', checks: [{ name: 'flights-found', cls: 'judge' }], refused: [] },
    { n: 2, text: 'Sort them', rule: '', checks: [{ name: 'sorted', cls: 'machine check' }], refused: ['no command can check the layout'] },
  ],
  loose: [{ name: 'stray', cls: null }], notChecked: ['looks nice'], alwaysOn: ['no-suppressions', 'changed-from-seed'], older: false,
};

test('renderJobPlan: legend, numbered lines with their rule, checks as "check · name · class", the two folds with their counts; every text escaped', () => {
  const h = renderJobPlan(PLAN);
  assert.match(h, /<b>›<\/b> = the approved plan/);
  assert.match(h, /class="num">1<\/span>Find &lt;3&gt; flights/, 'a job line is escaped');
  assert.match(h, /class="sub">~ PASS: quoted; FAIL: invented</);
  assert.match(h, /check · flights-found · judge/);
  assert.match(h, /check · sorted · machine check/);
  assert.match(h, /check · stray</, 'a check with no class shows no class');
  assert.match(h, /not checked · no command can check the layout/);
  assert.match(h, /<details[^>]*data-testid="plan-notchecked"><summary>Not checked \(the AI's own reading\) · 1</);
  assert.match(h, /<details[^>]*data-testid="plan-alwayson"><summary>Always on · 2</);
  assert.doesNotMatch(h, /plan-older/);
  assert.doesNotMatch(h, /<script|<input|<button/i);
});

test('renderJobPlan: an older job says its numbered lines were not saved; empty folds are left out', () => {
  const h = renderJobPlan({ lines: [{ n: 1, text: 'old goal', rule: '', checks: [{ name: 'suite-green', cls: null }], refused: [] }], loose: [], notChecked: [], alwaysOn: [], older: true });
  assert.match(h, /older job — numbered lines were not saved/);
  assert.ok(h.indexOf('plan-older') < h.indexOf('jp-legend') && h.indexOf('plan-older') < h.indexOf('plan-line'), 'the note is at the TOP, before the legend and line 1');
  assert.doesNotMatch(h, /<details/);
});

test('ONE renderer: the chat plan bubble and the Job tab both call renderJobPlan (no second drawing of the plan)', () => {
  assert.equal((PAGE.match(/function renderJobPlan\(/g) || []).length, 1);
  assert.match(fnSrc('renderMessages'), /renderJobPlan\(m\.plan\)/);
  assert.match(fnSrc('renderJob'), /renderJobPlan\(plan\)/);
  assert.match(fnSrc('renderMessages'), /m\.kind === "plan"/);
});

test('renderMessages: a plan message is drawn as the plan bubble with the footer; an unchanged poll tick does not redraw (folds stay open)', () => {
  const thread = { innerHTML: '', scrollTop: 0, scrollHeight: 10 };
  // eslint-disable-next-line no-new-func
  const f = new Function('thread', 'escapeXml', 'renderJobPlan', 'chatWhoLabel', `var lastMsgSig = null;\n${fnSrc('renderMessages')}\nreturn renderMessages;`)(thread, escapeXml, () => '<PLAN/>', (r) => (r === 'bot' ? 'bareloop' : ''));
  const state = { messages: [{ role: 'bot', kind: 'plan', text: 'Sign & run to confirm', plan: { lines: [], goal: 'fix it', questions: ['which folder?'] } }] };
  f(state);
  assert.match(thread.innerHTML, /data-testid="plan-bubble"/);
  assert.match(thread.innerHTML, /<PLAN\/>/);
  assert.match(thread.innerHTML, /goal sentence: fix it/);
  assert.match(thread.innerHTML, /questions: which folder\?/);
  assert.match(thread.innerHTML, /Sign &amp; run to confirm/);
  thread.innerHTML = 'user opened a fold';
  f(JSON.parse(JSON.stringify(state)));
  assert.equal(thread.innerHTML, 'user opened a fold', 'same messages: not redrawn');
  f({ messages: [...state.messages, { role: 'you', text: 'hi' }] });
  assert.match(thread.innerHTML, /hi/);
});

/** a fake numbered box: the mirror reports 21px per logical line (2 rows when a line is longer than 10 chars) */
function gutterHarness(id, value) {
  const ta = { value, clientWidth: 300, scrollTop: 0 };
  const gut = { innerHTML: '', scrollTop: 0 };
  const mir = { style: {}, children: [], set innerHTML(h) { this._h = h; this.children = [...h.matchAll(/<div>(.*?)<\/div>/g)].map((m) => ({ offsetHeight: m[1].length > 10 ? 42 : 21 })); } };
  const els = { [id]: ta, [`${id}-gut`]: gut, [`${id}-mir`]: mir };
  // eslint-disable-next-line no-new-func
  const gutterSync = new Function('document', 'escapeXml', `${fnSrc('gutterSync')}\nreturn gutterSync;`)({ getElementById: (k) => els[k] }, escapeXml);
  gutterSync(id);
  return [...gut.innerHTML.matchAll(/<div(?: style="height:(\d+)px")?>(.*?)<\/div>/g)].map((m) => [m[2], m[1] ? Number(m[1]) : null]);
}

test('gutter: a plain job line is numbered, a ~ line and an empty line are not; each row is as tall as its wrapped line', () => {
  const rows = gutterHarness('jf-job', 'Fix the failing date tests\n~ no tests\n\nKeep API\nMake npm test pass\n~ no deps');
  assert.deepEqual(rows.map((r) => r[0]), ['1', '', '', '2', '3', '']);
  assert.deepEqual(rows.map((r) => r[1]), [42, 21, 21, 21, 42, 21], 'heights come from the mirror (a long line wraps to two rows)');
});

test('gutter: Inputs numbers every non-empty line (a ~ is just text there)', () => {
  const rows = gutterHarness('jf-inputs', 'repo: /x\n\nspec: a.md');
  assert.deepEqual(rows.map((r) => r[0]), ['1', '', '2']);
});

test('fillCard is the ONE prefill (re-attach, Reuse, Edit in chat, Resume): the six boxes P7 left, then a re-fit', () => {
  const vals = {};
  const calls = [];
  // eslint-disable-next-line no-new-func
  const fillCard = new Function('setVal', 'fitCardBoxes', `${fnSrc('fillCard')}\nreturn fillCard;`)((id, v) => { vals[id] = v; }, () => calls.push('fit'));
  fillCard({ jobName: 'j', jobText: 'a\n~ b', inputs: 'repo: /r', destination: 'src/', capUsd: 2, maxWallMs: 600000 });
  assert.deepEqual(vals, { 'jf-name': 'j', 'jf-job': 'a\n~ b', 'jf-inputs': 'repo: /r', 'jf-dest': 'src/', 'jf-cap-money': 2, 'jf-cap-time': 10 });
  assert.deepEqual(calls, ['fit']);
  for (const old of ['jf-goal', 'jf-source', 'jf-success', 'jf-guardrails', 'jf-judge', 'details-goal', 'details-success', 'details-guardrails', 'details-source']) {
    assert.ok(!PAGE.includes(old), `${old} is gone from the page`);
  }
  assert.equal((PAGE.match(/setVal\("jf-name"/g) || []).length, 1, 'the four repeated prefill blocks are folded into one');
});

test('Job tab: renderJob paints the plan, numbered Inputs, Destination, caps and the Signed row; an imported/none job falls back to the goal as line 1', () => {
  const els = {};
  const el = (id) => (els[id] ??= { id, textContent: '', innerHTML: '', hidden: false, title: '', removeAttribute() {}, setAttribute() {} });
  const doc = { getElementById: el };
  // eslint-disable-next-line no-new-func
  const renderJob = new Function('document', 'renderJobPlan', 'escapeXml', 'panelMoney', 'duration', 'paintOfferedRow', `var lastJobToolsList = null;\n${fnSrc('renderJob')}\nreturn renderJob;`)(
    doc, (p) => `<plan older=${p.older} lines=${p.lines.length}/>`, escapeXml, (n) => `$${n}`, (n) => `${n}ms`, () => {},
  );
  renderJob({
    job: 'j', resolved: true, checkType: 'rubric', model: 'm', description: null, plan: PLAN,
    inputs: [{ n: 1, label: 'repo', value: '/r' }, { n: 2, label: 'spec', value: 'docs/s.md' }], destination: 'out/', tools: 't', budgetUsd: 1, maxWallMs: 1200000, signed: '2026-10-10 14:02 · a3f9c1', note: '',
  });
  assert.equal(els['details-plan'].innerHTML, '<plan older=false lines=2/>');
  assert.match(els['details-inputs'].innerHTML, /<span class="num-in">1<\/span> repo: \/r/);
  assert.match(els['details-inputs'].innerHTML, /<span class="num-in">2<\/span> spec: docs\/s\.md/);
  assert.equal(els['details-dest'].textContent, 'out/');
  assert.equal(els['details-signed'].textContent, '2026-10-10 14:02 · a3f9c1');
  renderJob({ job: 'old', resolved: false, checkType: 'green', model: 'm', goal: 'the old goal', plan: null, inputs: null, signed: null, destination: 'not recorded', tools: 'not recorded', budgetUsd: null, maxWallMs: null, note: 'n' });
  assert.equal(els['details-plan'].innerHTML, '<plan older=true lines=1/>');
  assert.equal(els['details-inputs'].innerHTML, 'not recorded');
  assert.equal(els['details-signed'].textContent, 'not recorded');
});

test('the Check type radio switches the empty-box examples (placeholders); a typed value is never touched by it', () => {
  const attrs = {};
  const els = { 'jf-job': { setAttribute: (k, v) => { attrs.job = v; } }, 'jf-inputs': { setAttribute: (k, v) => { attrs.inputs = v; } } };
  // eslint-disable-next-line no-new-func
  const setJobPlaceholders = new Function('document', 'JOB_PLACEHOLDERS', 'INPUTS_PLACEHOLDER', `${fnSrc('setJobPlaceholders')}\nreturn setJobPlaceholders;`)(
    { getElementById: (id) => els[id] }, { deterministic: 'DET', rubric: 'RUB' }, 'INP',
  );
  setJobPlaceholders('rubric');
  assert.deepEqual(attrs, { job: 'RUB', inputs: 'INP' });
  setJobPlaceholders('deterministic');
  assert.equal(attrs.job, 'DET');
  setJobPlaceholders('reuse');
  assert.equal(attrs.job, 'DET');
  assert.match(fnSrc('onVerdictChange'), /setJobPlaceholders\(v\)/);
});

test('the plan marker colour: --plan is defined for dark and both light theme blocks, and only the marker uses it', () => {
  assert.equal((PAGE.match(/--plan:#7aa2f7/g) || []).length, 1, 'dark');
  assert.equal((PAGE.match(/--plan:#2668c2/g) || []).length, 2, 'light (media query + data-theme)');
  const uses = [...PAGE.matchAll(/^\s*([^{\n]*)\{[^}]*var\(--plan\)[^}]*\}/gm)].map((m) => m[1].trim());
  assert.deepEqual(uses, ['.jp-legend b,.jp .mk', '.jp details>summary::before']);
});

test('Job tab layout: The job flows at full height (no inner scroll), a wrapped line hangs under its text, and the rows run The job, Inputs, Destination, Tools, Cap, Signed', () => {
  assert.doesNotMatch(PAGE, /class="ro-value scroll" id="details-plan"/, 'no inner scroll box on the plan');
  const tab = PAGE.slice(PAGE.indexOf('id="job-card-readonly"'), PAGE.indexOf('</section>', PAGE.indexOf('id="job-card-readonly"')));
  const order = ['id="details-plan"', 'id="details-inputs"', 'id="details-dest"', 'id="details-tools"', 'id="details-cap-money"', 'id="details-signed"'].map((k) => tab.indexOf(k));
  assert.ok(order.every((i) => i !== -1) && order.every((v, i) => i === 0 || v > order[i - 1]), `row order: ${order}`);
  const jl = PAGE.match(/\.jp \.jl\{([^}]*)\}/)[1];
  assert.match(jl, /padding-left:30px/);
  assert.match(jl, /text-indent:-30px/);
  assert.match(PAGE, /\.jp \.jl \.sub,\.jp \.jl \.fold\{padding-left:0;text-indent:0;\}/, 'the rule and check lines under a job line do not inherit the hang');
});
