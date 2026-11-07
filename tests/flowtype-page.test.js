// borrowed-from: fwdloop test/m13-p4-ui.test.js@ac85780 (the words and ids) and test/m13-am4.test.js@df6cc3e (the Job tab rows), re-shaped for bareloop's ONE card: the page the panel SERVES is checked for the
// controls' ids and sentences, and the page's own functions are extracted and driven against tiny fakes (no browser here; the look is checked by screenshot, phone width by hamr's DevTools).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FLOW_TYPE_LABELS } from '../src/job.js';
import { world } from './flowtype-world.mjs';

/** the page as the panel serves it */
async function served(t) { const w = await world(t, { serve: true }); return w.page(); }

function fnSrcOf(PAGE, name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
}
const build = (PAGE, names, scope = {}, vars = '', ret = '') => {
  const keys = Object.keys(scope);
  // eslint-disable-next-line no-new-func
  return new Function(...keys, `${vars}\n${names.map((n) => fnSrcOf(PAGE, n)).join('\n')}\nreturn {${[...names, ret].filter(Boolean).join(',')}};`)(...keys.map((k) => scope[k]));
};
const el = (o = {}) => {
  const e = { value: '', hidden: false, disabled: false, readOnly: false, textContent: '', children: [], classes: new Set(), appendChild(c) { e.children.push(c); return c; }, classList: { toggle() {} }, ...o };
  Object.defineProperty(e, 'innerHTML', { get: () => '', set: () => { e.children = []; } });   // assigning innerHTML empties the element, as a real one does
  return e;
};

test('the SERVED card has Flow type and MCP with the fwd words and ids, once each, in the card (after Inputs, before Destination), and NO Ticket box (R7b, fwd v0.28.0)', async (t) => {
  const PAGE = await served(t);
  const once = (id) => assert.equal(PAGE.split(` id="${id}"`).length - 1, 1, `${id} appears exactly once`);
  for (const id of ['jf-flowtype-field', 'jf-flowtype', 'jf-mcp-field', 'jf-mcp', 'jf-mcp-manage', 'details-mcp-field', 'details-mcp']) once(id);
  const card = PAGE.slice(PAGE.indexOf('id="job-card"'));
  assert.ok(card.indexOf('id="jf-inputs"') < card.indexOf('id="jf-flowtype"') && card.indexOf('id="jf-mcp"') < card.indexOf('id="jf-dest"'));
  for (const gone of ['jf-ticket', 'jf-ticket-field', 'jf-ticket-hint']) assert.equal(PAGE.includes(gone), false, `${gone} is gone (F287: the box invited a number in Destination)`);
  assert.doesNotMatch(PAGE, /the newest ticket this job has not run, or type its number|issue number/);
  assert.match(PAGE, /<label for="jf-flowtype">Flow type<\/label>/);
  assert.match(PAGE, /<label for="jf-mcp">MCP<\/label>/);
  const opts = [...PAGE.match(/<select id="jf-flowtype"[\s\S]*?<\/select>/)[0].matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(opts, [['plain', 'plain'], ['mcp', 'MCP'], ['tickets', 'Tickets MCP']], 'the three fwd words');
  assert.deepEqual(Object.fromEntries(opts), FLOW_TYPE_LABELS, 'the menu words are the one table (src/job.js)');
  assert.match(PAGE, /<a class="link" id="jf-mcp-manage"[^>]*>manage in Settings &gt; MCP<\/a>/);
  assert.match(PAGE.match(/<div class="field" id="jf-mcp-field"[^>]*>/)[0], /hidden/, 'plain has no MCP pick');
  // the controls use the card's own classes (nothing new): .field, select, .hint, .link
  assert.doesNotMatch(PAGE.match(/<div class="field" id="jf-flowtype-field"[\s\S]*?<\/select>/)[0], /style=/);
});

test('currentCard: a plain card sends neither flowType nor mcp (so the signed job carries neither); MCP and Tickets send the pick; no card ever sends a ticket (the box is gone, R7b)', async (t) => {
  const PAGE = await served(t);
  const val = (id) => ({ value: id === 'jf-cap-money' ? '2' : '' });
  const mk = (flowType, mcp, ticket) => build(PAGE, ['pickParts', 'currentCard'], { document: { getElementById: val }, verdictValue: () => 'deterministic', thinkingBox: { checked: false }, flowTypeEl: { value: flowType }, mcpEl: { value: mcp }, scheduleOfCard: () => null }, 'var reuseCheckType = "deterministic";').currentCard();
  const plain = mk('plain', 'github', '5');
  assert.equal('flowType' in plain, false);
  assert.equal('mcp' in plain, false);
  assert.equal('ticket' in plain, false);
  const m = mk('mcp', 'github', '5');
  assert.deepEqual([m.flowType, m.mcp, 'ticket' in m], ['mcp', 'github', false], 'an MCP job has no ticket');
  const tk = mk('tickets', 'github', ' 42 ');
  assert.deepEqual([tk.flowType, tk.mcp, 'ticket' in tk], ['tickets', 'github', false], 'a Tickets card sends no ticket: a by-hand run takes the newest not run yet');
});

test('jobBoxesChangedNow: a changed Flow type or MCP is a changed job box (a new workflow); plain with no keys equals the origin\'s plain', async (t) => {
  const PAGE = await served(t);
  const mk = (cur, origin) => build(PAGE, ['jobBoxesChangedNow'], { currentCard: () => cur }, `var reuseOrigin = ${JSON.stringify({ card: origin })};`).jobBoxesChangedNow();
  const base = { jobText: 'a', checkType: 'deterministic', thinking: false };
  assert.equal(mk(base, base), false);
  assert.equal(mk({ ...base, flowType: 'mcp', mcp: 'github' }, base), true, 'plain -> MCP');
  assert.equal(mk(base, { ...base, flowType: 'mcp', mcp: 'github' }), true, 'MCP -> plain');
  assert.equal(mk({ ...base, flowType: 'tickets', mcp: 'github' }, { ...base, flowType: 'mcp', mcp: 'github' }), true);
  assert.equal(mk({ ...base, flowType: 'mcp', mcp: 'other' }, { ...base, flowType: 'mcp', mcp: 'github' }), true);
  assert.equal(mk({ ...base, flowType: 'mcp', mcp: 'github' }, { ...base, flowType: 'mcp', mcp: 'github' }), false);
});

test('setFlow / paintFlowType: the MCP pick shows for MCP and Tickets, a reused server no longer listed stays pickable', async (t) => {
  const PAGE = await served(t);
  const flowTypeEl = el({ value: 'plain' }); const mcpEl = el(); const mcpFieldEl = el({ hidden: true });
  const doc = { createElement: () => el() };
  const make = (vars) => build(PAGE, ['paintMcpOptions', 'paintFlowType', 'setFlow'], { flowTypeEl, mcpEl, mcpFieldEl, document: doc, paintCardSchedule() {} }, `var mcpServers = ["github", "other"]; ${vars}`);
  const api = make('var resumeRun = null, sched = null;');
  api.setFlow('plain', '');
  assert.deepEqual([flowTypeEl.value, mcpFieldEl.hidden], ['plain', true]);
  api.setFlow('mcp', 'github');
  assert.deepEqual([flowTypeEl.value, mcpFieldEl.hidden, mcpEl.value], ['mcp', false, 'github']);
  api.setFlow('tickets', 'other');
  assert.deepEqual([flowTypeEl.value, mcpFieldEl.hidden, mcpEl.value], ['tickets', false, 'other']);
  api.setFlow('tickets', 'gone-server');
  assert.deepEqual(mcpEl.children.map((o) => o.value), ['github', 'other', 'gone-server'], 'a reused job\'s server that Settings no longer lists is still shown by name');
  api.setFlow('chat', 'github');
  assert.equal(flowTypeEl.value, 'plain', 'an unknown value reads as plain');
  api.setFlow('tickets', 'github');
  const resumed = make('var resumeRun = {runid: "r"}, sched = null;');
  resumed.paintFlowType();
  const scheduled = make('var resumeRun = null, sched = {job: "j"};');
  scheduled.paintFlowType();
});

test('syncCardLock locks Flow type and MCP like the job text (live, resume, schedule card)', async (t) => {
  const PAGE = await served(t);
  const els = {};
  for (const id of ['jf-name', 'jf-job', 'jf-inputs', 'jf-dest', 'jf-cap-money', 'jf-cap-time', 'jf-model', 'job-card']) els[id] = el({ id, classList: { toggle() {} } });
  const mkSel = () => el({ classList: { toggle(c, on) { this.on = on; } } });
  const flowTypeEl = mkSel(); const mcpEl = mkSel();
  const doc = { getElementById: (id) => els[id], querySelectorAll: () => ({ forEach() {} }) };
  const run = (vars) => build(PAGE, ['syncCardLock'], { document: doc, flowTypeEl, mcpEl, cardSchedEl: mkSel(), cardSchedTimeEl: mkSel(), paintFlowType() {}, syncThinking() {} },
    `var LOCKED_IDS = ["jf-name", "jf-job"]; var OPEN_IDS = ["jf-inputs"]; var CAP_IDS = []; var sched = null; ${vars}`).syncCardLock;
  run('var sessionLive = false, reuseOn = false, resumeRun = null;')();
  assert.deepEqual([flowTypeEl.disabled, mcpEl.disabled], [false, false], 'a fresh card is open');
  run('var sessionLive = true, reuseOn = false, resumeRun = null;')();
  assert.deepEqual([flowTypeEl.disabled, mcpEl.disabled], [true, true], 'a live drafting session: nothing is editable');
  run('var sessionLive = false, reuseOn = true, resumeRun = null;')();
  assert.deepEqual([flowTypeEl.disabled, mcpEl.disabled], [true, true], 'a schedule card: the job boxes are locked');
  run('var sessionLive = false, reuseOn = false, resumeRun = {runid: "r"};')();
  assert.deepEqual([flowTypeEl.disabled, mcpEl.disabled], [true, true], 'a resume: everything locked');
});

test('the Job tab: an MCP job shows its signed flow type, server and every tool; a ticket filter and watched fields when it has them; a plain job shows no MCP row', async (t) => {
  const PAGE = await served(t);
  const els = {};
  const get = (id) => (els[id] ??= el({ id, removeAttribute() {}, setAttribute() {} }));
  const doc = { getElementById: get, createElement: () => el() };
  const renderJob = build(PAGE, ['renderJob'], { document: doc, renderJobPlan: () => '', escapeXml: (x) => x, panelMoney: (n) => `$${n}`, duration: (n) => `${n}ms`, paintOfferedRow() {} }, 'var lastJobToolsList = null;').renderJob;
  const BASE = { job: 'j', checkType: 'deterministic', model: 'm', thinking: '', inputs: [], destination: 'd', tools: 't', budgetUsd: 1, maxWallMs: 1, plan: { lines: [], loose: [], notChecked: [], alwaysOn: [] } };
  renderJob(BASE);
  assert.equal(get('details-mcp-field').hidden, true);
  assert.equal(get('details-mcp').children.length, 0);
  renderJob({ ...BASE, mcp: { flowType: 'MCP', server: 'github', tools: ['issue_read', 'issue_write'] } });
  assert.equal(get('details-mcp-field').hidden, false);
  assert.deepEqual(get('details-mcp').children.map((c) => c.textContent), ['flow type · MCP', 'MCP · github', 'tools · issue_read', 'tools · issue_write']);
  renderJob({ ...BASE, mcp: { flowType: 'Tickets MCP', server: 'github', tools: ['list_issues'], ticketFilter: { priority: ['P1'] }, ticketWatch: ['state', 'labels'] } });
  assert.deepEqual(get('details-mcp').children.map((c) => c.textContent), ['flow type · Tickets MCP', 'MCP · github', 'tools · list_issues', 'ticket filter · {"priority":["P1"]}', 'watched field · state, labels']);
});
