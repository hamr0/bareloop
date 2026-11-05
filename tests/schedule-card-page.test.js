// borrowed-from: fwdloop test/m13-p5-ui.test.js@v0.29.0 (the Schedule row's ids, words and hints), re-shaped for bareloop's ONE card. ITEM33-BUILD piece 9 (R7). The page the panel SERVES is checked
// for the control's ids, its words (src/schedulewords.js SCHEDULE_WORDS.card is the one table) and its position, and the page's own functions are extracted VERBATIM and driven against tiny fakes
// (no browser here; the look is checked by screenshot, phone width by hamr's own DevTools).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCHEDULE_WORDS } from '../src/schedulewords.js';
import { world } from './flowtype-world.mjs';

async function served(t) { const w = await world(t, { serve: true }); return w.page(); }
function fnSrcOf(PAGE, name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
}
const build = (PAGE, names, scope = {}, vars = '') => {
  const keys = Object.keys(scope);
  // eslint-disable-next-line no-new-func
  return new Function(...keys, `${vars}\n${names.map((n) => fnSrcOf(PAGE, n)).join('\n')}\nreturn {${names.join(',')}};`)(...keys.map((k) => scope[k]));
};
/** a tiny DOM: elements by id, each remembering value / hidden / disabled; `option[value=new-ticket]` is the one query the row makes */
function dom({ flow = 'plain', verdict = 'deterministic', resume = null, sched = null, sel = 'hand', time = '09:00' } = {}) {
  const els = {};
  const el = (id, o = {}) => (els[id] ??= { id, value: '', hidden: false, disabled: false, ...o });
  const tk = { hidden: false, disabled: false };
  const schedEl = el('jf-sched', { value: sel, querySelector: (q) => { assert.equal(q, 'option[value="new-ticket"]'); return tk; } });
  const timeEl = el('jf-sched-time', { value: time });
  const field = el('jf-sched-field');
  const scope = {
    document: { getElementById: (id) => el(id) }, cardSchedEl: schedEl, cardSchedTimeEl: timeEl, cardSchedFieldEl: field, flowTypeEl: { value: flow },
    verdictValue: () => verdict, resumeRun: resume, sched,
  };
  return { els, tk, scope };
}
const vars = 'var reuseCheckType = "deterministic";';

test('the SERVED card has the Schedule row with fwd\'s ids and the table\'s words, once each, between the Ticket box and Destination, in the card\'s own classes', async (t) => {
  const PAGE = await served(t);
  const once = (id) => assert.equal(PAGE.split(` id="${id}"`).length - 1, 1, `${id} appears exactly once`);
  for (const id of ['jf-sched-field', 'jf-sched', 'jf-sched-clock', 'jf-sched-time', 'jf-sched-hint', 'jf-sched-hint-rubric', 'jf-sched-ticket-hint']) once(id);
  const card = PAGE.slice(PAGE.indexOf('id="job-card"'));
  assert.ok(card.indexOf('id="jf-ticket"') < card.indexOf('id="jf-sched"') && card.indexOf('id="jf-sched-field"') < card.indexOf('id="jf-dest"'));
  const W = SCHEDULE_WORDS.card;
  assert.match(PAGE, new RegExp(`<label for="jf-sched">${W.label}</label>`));
  const opts = [...PAGE.match(/<select id="jf-sched"[\s\S]*?<\/select>/)[0].matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(opts, [['hand', 'By hand'], ['new-ticket', 'When a new ticket arrives'], ['daily', 'Every day at HH:MM']], 'fwd\'s three words, in fwd\'s order');
  assert.deepEqual(Object.fromEntries(opts), W.options, 'the menu words are the one table (src/schedulewords.js)');
  const hint = (id) => PAGE.match(new RegExp(`<div class="hint" id="${id}"[^>]*hidden>([^<]*)</div>`))[1];
  assert.equal(hint('jf-sched-hint'), W.hint);
  assert.equal(hint('jf-sched-hint-rubric'), W.rubricHint);
  assert.equal(hint('jf-sched-ticket-hint'), W.ticketHint);
  assert.doesNotMatch(PAGE, /__BARELOOP_SCHED_/, 'every token was filled');
  assert.match(PAGE, /<div class="when-sub" id="jf-sched-clock" hidden>\s*<input id="jf-sched-time" type="time" value="09:00"/);
  const row = PAGE.slice(PAGE.indexOf('id="jf-sched-field"'), PAGE.indexOf('<label for="jf-dest">'));
  assert.doesNotMatch(row, /style=/, 'the card\'s own classes only: .field, select, .when-sub, .hint');
  assert.doesNotMatch(row, /\bclass="(?!field|when-sub|hint)/);
});

test('scheduleOfCard: by hand is nothing; a new ticket sends only its kind (the card fills the rest); Every day sends the time', async (t) => {
  const PAGE = await served(t);
  const of = (o) => { const d = dom(o); return build(PAGE, ['scheduleOfCard'], d.scope, vars).scheduleOfCard(); };
  assert.equal(of({ sel: 'hand' }), null);
  assert.deepEqual(of({ sel: 'new-ticket' }), { kind: 'new-ticket' });
  assert.deepEqual(of({ sel: 'daily', time: '06:30' }), { kind: 'daily', hour: 6, minute: 30 });
  const bad = of({ sel: 'daily', time: '' });
  assert.deepEqual([bad.kind, Number.isNaN(bad.hour), Number.isNaN(bad.minute)], ['daily', true, true], 'an empty time goes to the server, which says so');
});

test('currentCard sends no `schedule` key for by hand (so the signed job carries no trigger) and the pick when there is one', async (t) => {
  const PAGE = await served(t);
  const val = (id) => ({ value: id === 'jf-cap-money' ? '2' : '' });
  const mk = (schedule) => build(PAGE, ['pickParts', 'currentCard'], { document: { getElementById: val }, verdictValue: () => 'deterministic', thinkingBox: { checked: false }, flowTypeEl: { value: 'plain' }, mcpEl: { value: '' }, ticketEl: { value: '' }, scheduleOfCard: () => schedule }, vars).currentCard();
  assert.equal('schedule' in mk(null), false);
  assert.deepEqual(mk({ kind: 'daily', hour: 9, minute: 0 }).schedule, { kind: 'daily', hour: 9, minute: 0 });
});

test('paintCardSchedule: "When a new ticket arrives" only for a Tickets job (a pick left over falls back to by hand); the time box and the hints follow the pick; a rubric job\'s hint says accepted', async (t) => {
  const PAGE = await served(t);
  const paint = (o) => { const d = dom(o); build(PAGE, ['paintCardSchedule'], d.scope, vars).paintCardSchedule(); return d; };
  const plain = paint({ flow: 'plain', sel: 'new-ticket' });
  assert.equal(plain.tk.disabled, true);
  assert.equal(plain.tk.hidden, true);
  assert.equal(plain.els['jf-sched'].value, 'hand', 'Tickets MCP -> plain drops the ticket pick');
  assert.equal(plain.els['jf-sched-hint'].hidden, true, 'by hand: no hint');
  const tickets = paint({ flow: 'tickets', sel: 'new-ticket' });
  assert.equal(tickets.tk.disabled, false);
  assert.equal(tickets.els['jf-sched'].value, 'new-ticket');
  assert.equal(tickets.els['jf-sched-ticket-hint'].hidden, false);
  assert.equal(tickets.els['jf-sched-hint'].hidden, false);
  assert.equal(tickets.els['jf-sched-clock'].hidden, true, 'no time box for a ticket');
  const daily = paint({ flow: 'plain', sel: 'daily' });
  assert.equal(daily.els['jf-sched-clock'].hidden, false);
  assert.equal(daily.els['jf-sched-ticket-hint'].hidden, true);
  const rubric = paint({ flow: 'plain', sel: 'daily', verdict: 'rubric' });
  assert.equal(rubric.els['jf-sched-hint'].hidden, true);
  assert.equal(rubric.els['jf-sched-hint-rubric'].hidden, false, 'a rubric job waits for the Accept, and says so');
  assert.equal(paint({ flow: 'plain', sel: 'daily' }).els['jf-sched-hint-rubric'].hidden, true);
});

test('the row is hidden on a resume card and on the two-click schedule card (which has its own When field)', async (t) => {
  const PAGE = await served(t);
  const hidden = (o) => { const d = dom(o); build(PAGE, ['paintCardSchedule'], d.scope, vars).paintCardSchedule(); return d.els['jf-sched-field'].hidden; };
  assert.equal(hidden({}), false);
  assert.equal(hidden({ resume: { runid: 'r' } }), true);
  assert.equal(hidden({ sched: { job: 'j' } }), true);
});

test('setCardSchedule fills the row from a card (a re-attached session) and a missing schedule is by hand', async (t) => {
  const PAGE = await served(t);
  const set = (sc) => { const d = dom({ sel: 'daily', time: '01:01' }); const fns = build(PAGE, ['paintCardSchedule', 'setCardSchedule'], d.scope, vars); fns.setCardSchedule(sc); return d; };
  assert.equal(set(undefined).els['jf-sched'].value, 'hand');
  assert.equal(set({ kind: 'weekly' }).els['jf-sched'].value, 'hand', 'a kind the card does not offer reads as by hand');
  const d = set({ kind: 'daily', hour: 7, minute: 5 });
  assert.equal(d.els['jf-sched'].value, 'daily');
  assert.equal(d.els['jf-sched-time'].value, '07:05');
});

test('syncCardLock freezes the Schedule row while a drafting session is live (it was started from these values) and leaves it open otherwise, a Reuse included', async (t) => {
  const PAGE = await served(t);
  const els = {};
  for (const id of ['jf-name', 'jf-job', 'jf-inputs', 'jf-dest', 'jf-cap-money', 'jf-cap-time', 'jf-model', 'job-card']) els[id] = { id, classList: { toggle() {} } };
  const mkSel = () => ({ classList: { toggle(c, on) { this.on = on; } } });
  const flowTypeEl = mkSel(); const mcpEl = mkSel(); const ticketEl = mkSel(); const cardSchedEl = mkSel(); const cardSchedTimeEl = mkSel();
  const doc = { getElementById: (id) => els[id], querySelectorAll: () => ({ forEach() {} }) };
  const run = (vars) => build(PAGE, ['syncCardLock'], { document: doc, flowTypeEl, mcpEl, ticketEl, cardSchedEl, cardSchedTimeEl, paintFlowType() {}, syncThinking() {} },
    `var LOCKED_IDS = ["jf-name", "jf-job"]; var OPEN_IDS = ["jf-inputs"]; var CAP_IDS = []; var sched = null; ${vars}`).syncCardLock;
  run('var sessionLive = false, reuseOn = false, resumeRun = null;')();
  assert.deepEqual([cardSchedEl.disabled, cardSchedTimeEl.disabled], [false, false]);
  run('var sessionLive = true, reuseOn = false, resumeRun = null;')();
  assert.deepEqual([cardSchedEl.disabled, cardSchedTimeEl.disabled], [true, true], 'a live session: frozen');
  run('var sessionLive = false, reuseOn = true, resumeRun = null;')();
  assert.deepEqual([cardSchedEl.disabled, cardSchedTimeEl.disabled], [false, false], 'a Reuse is a fresh start: the person may schedule it');
});

test('the page file on disk holds NO schedule word for the card\'s row: tokens only, filled by the server from the schedule words table (a reword is one edit in src/schedulewords.js)', async () => {
  const { readFileSync } = await import('node:fs');
  const raw = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
  const row = raw.slice(raw.indexOf('id="jf-sched-field"'), raw.indexOf('<label for="jf-dest">'));
  assert.doesNotMatch(row, /Schedule<|By hand|When a new ticket|Every day at|off until the first green|older tickets never run/);
  assert.equal([...row.matchAll(/__BARELOOP_SCHED_[A-Z_]+__/g)].length, 7);
  const { scheduleCardFill } = await import('../src/schedulewords.js');
  assert.deepEqual(Object.keys(scheduleCardFill()).sort(), [...new Set(row.match(/__BARELOOP_SCHED_[A-Z_]+__/g))].sort(), 'every token the page holds is one the server fills, and no more');
});
