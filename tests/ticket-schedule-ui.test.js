// MCP + tickets piece 3 (R6), the PAGE side of the schedule card: the When dropdown offers "When a new ticket arrives in <input>" only when the server says the job can (a Tickets MCP job with
// list_issues signed and an issues-list Inputs line), picks among those inputs, shows no path box for it, and sends {kind, input}. The page's own functions are extracted VERBATIM from
// src/panel/index.html and run against a tiny fake DOM (the style of trigger-schedule-buttons-page.test.js); nothing here re-implements the page. Ported in spirit from fwd m12-p2-ui.test.js
// (that one drives a real chromium; the real-browser look is the orchestrator's own screenshot).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCHEDULE_WORDS } from '../src/schedulewords.js';
import { ticketInputLabels } from '../src/ticketschedule.js';
import { LIST } from './ticket-world.mjs';

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
const W = JSON.parse(JSON.stringify(SCHEDULE_WORDS));

function fakeDom() {
  const els = {};
  const mk = (id) => {
    const el = {
      id, hidden: false, value: '', disabled: false, textContent: '', placeholder: '', children: [],
      appendChild(c) { el.children.push(c); },
    };
    Object.defineProperty(el, 'innerHTML', { get() { return el._h ?? ''; }, set(v) { el._h = v; if (v === '') el.children = []; } });
    return el;
  };
  return {
    els,
    document: {
      getElementById(id) { if (!els[id]) els[id] = mk(id); return els[id]; },
      createElement: () => ({ value: '', textContent: '' }),
    },
  };
}

/** the page's When functions over a fake DOM, with `sched` as the card holds it */
function whenOf(sched) {
  const dom = fakeDom();
  const whenKinds = PAGE.match(/var WHEN_KINDS = \[[^\]]*\];/)[0];
  const f = new Function('document', 'sched', `${whenKinds}\nfunction byId(id){ return document.getElementById(id); }\n${fnSrc('whenTriggerFromBoxes')}\n${fnSrc('whenCanon')}\n${fnSrc('whenShowSubs')}\n${fnSrc('paintWhen')}\nreturn {whenTriggerFromBoxes: whenTriggerFromBoxes, whenCanon: whenCanon, whenShowSubs: whenShowSubs, paintWhen: paintWhen};`)(dom.document, sched);
  return { dom, ...f };
}
const optionValues = (dom) => dom.els['jf-when'].children.map((o) => o.value);
const ticketCard = (over = {}) => ({ words: W, ticketInputs: ['issues'], cur: null, scheduled: false, refusal: null, now: null, ...over });

test('markup: the ticket input picker sits inside the When field, hidden until the choice is picked; no path box for it', () => {
  const field = PAGE.slice(PAGE.indexOf('id="jf-when-field"'), PAGE.indexOf('id="jf-err-when"'));
  assert.match(field, /<div class="when-sub" id="jf-when-ticketbox" hidden>\s*<select id="jf-when-input" data-testid="jf-when-input"/);
  assert.doesNotMatch(field, /new-ticket|When a new ticket/, 'no schedule word typed into the markup: the option text comes from the server table');
});

test('the dropdown offers the ticket choice only when the server names a ticket input, and its text is the server\'s table', () => {
  const on = whenOf(ticketCard());
  on.paintWhen();
  assert.deepEqual(optionValues(on.dom), ['hand', 'daily', 'weekdays', 'weekly', 'file-updated', 'new-file', 'new-ticket']);
  assert.equal(on.dom.els['jf-when'].children.at(-1).textContent, 'When a new ticket arrives in <input>');
  const off = whenOf(ticketCard({ ticketInputs: [] }));
  off.paintWhen();
  assert.deepEqual(optionValues(off.dom), ['hand', 'daily', 'weekdays', 'weekly', 'file-updated', 'new-file'], 'a job without a ticket list does not offer it');
});

test('picking it shows the input picker (not the path box) and sends {kind, input}; By hand stays null', () => {
  const w = whenOf(ticketCard({ ticketInputs: ['issues', 'more'] }));
  w.paintWhen();
  assert.deepEqual(w.dom.els['jf-when-input'].children.map((o) => o.value), ['issues', 'more']);
  w.dom.els['jf-when'].value = 'new-ticket';
  w.dom.els['jf-when-input'].value = 'more';
  w.whenShowSubs();
  assert.equal(w.dom.els['jf-when-ticketbox'].hidden, false);
  assert.equal(w.dom.els['jf-when-filebox'].hidden, true);
  assert.deepEqual(w.whenTriggerFromBoxes(), { kind: 'new-ticket', input: 'more' });
  w.dom.els['jf-when'].value = 'hand';
  w.whenShowSubs();
  assert.equal(w.dom.els['jf-when-ticketbox'].hidden, true);
  assert.equal(w.whenTriggerFromBoxes(), null);
});

test('a scheduled ticket job opens with its input selected, and the card reads "unchanged" (no phantom Sign schedule): the canon spelling includes the input', () => {
  const cur = { kind: 'new-ticket', input: 'issues' };
  const w = whenOf(ticketCard({ cur, scheduled: true, now: 'When a new ticket arrives in issues' }));
  w.paintWhen();
  assert.equal(w.dom.els['jf-when'].value, 'new-ticket');
  assert.equal(w.dom.els['jf-when-input'].value, 'issues');
  assert.equal(w.dom.els['jf-when-ticketbox'].hidden, false);
  assert.equal(w.whenCanon(w.whenTriggerFromBoxes()), w.whenCanon(cur));
  w.dom.els['jf-when-input'].value = 'other';
  assert.notEqual(w.whenCanon({ kind: 'new-ticket', input: 'other' }), w.whenCanon(cur), 'another input is a change');
});

test('a scheduled ticket job still shows its choice when the server lists no inputs now (the signed one stays selectable)', () => {
  const w = whenOf(ticketCard({ ticketInputs: [], cur: { kind: 'new-ticket', input: 'issues' }, scheduled: true }));
  w.paintWhen();
  assert.ok(optionValues(w.dom).includes('new-ticket'));
  assert.deepEqual(w.dom.els['jf-when-input'].children.map((o) => o.value), ['issues']);
});

test('the server names the inputs: only a Tickets MCP job with list_issues signed and an issues-list line', () => {
  const spec = { flowType: 'tickets', mcp: { server: 'github', tools: ['issue_read', 'list_issues'] }, inputs: [{ n: 1, label: 'issues', value: LIST }, { n: 2, label: 'prs', value: 'https://github.com/a/b/pulls' }, { n: 3, label: 'notes', value: '/x/n.txt' }] };
  assert.deepEqual(ticketInputLabels(spec), ['issues']);
  assert.deepEqual(ticketInputLabels({ ...spec, mcp: { server: 'github', tools: ['issue_read'] } }), []);
  assert.deepEqual(ticketInputLabels({ ...spec, flowType: 'mcp' }), []);
  assert.deepEqual(ticketInputLabels({ inputs: spec.inputs }), []);
  assert.deepEqual(ticketInputLabels(null), []);
});
