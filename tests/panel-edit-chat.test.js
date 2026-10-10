// Edit in chat (hamr 2026-10-07, option A) — the server table (`endedFor`) and the PAGE side: the Run tab's button, the
// door (`editInChat` -> start-from -> bareloop-edit) and the Chat card's `applyEdit`. Same posture as
// panel-reuse-picker-page.test.js: the page's own functions extracted from src/panel/index.html against tiny fakes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { endedFor } from '../src/panel/server.js';
import { validateJobCard } from '../src/panel/authorsession.js';
import { keyRows } from '../src/providerrows.js';

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
function build(fnNames, scope = {}, vars = '', ret = '') {
  const keys = Object.keys(scope);
  // eslint-disable-next-line no-new-func
  return new Function(...keys, `${vars}\n${fnNames.map(fnSrc).join('\n')}\nreturn {${[...fnNames, ret].filter(Boolean).join(',')}};`)(...keys.map((k) => scope[k]));
}
const escapeXml = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EDIT = { id: 'edit', label: 'Edit in chat' };
const RESUME = { id: 'resume', label: 'Resume' };
const REUSE = { id: 'reuse', label: 'Reuse workflow' };

test('endedFor: Edit in chat is on EVERY non-green ending (after Resume when both show) and never on a green one', () => {
  const ok = { ok: true };
  const no = { ok: false, why: 'it is still running' };
  const alive = { died: false, lastThing: null };
  const ended = (outcome, resume, extra = {}) => endedFor({ outcome, stopReason: null, spentUsd: 1, budgetUsd: 2, ...extra }, alive, { resume });
  for (const o of ['cap-halt', 'wall-halt', 'stopped', 'provider-red', 'step-stalled']) {
    assert.deepEqual(ended(o, ok).actions, [RESUME, EDIT], `${o} resumable: Resume then Edit`);
    assert.deepEqual(ended(o, no).actions, [EDIT], `${o} not resumable: Edit only`);
  }
  for (const o of ['plan-red', 'check-red', 'step-red', 'escalated', 'close-red', 'pricing-red', 'job-red']) {
    assert.deepEqual(ended(o, ok).actions, [EDIT], `${o}: Edit only`);
  }
  for (const cat of ['cap-halt', 'wall-halt', 'provider-red']) {
    const e = endedFor({ outcome: 'escalated', stopReason: null, spentUsd: 1, budgetUsd: 2, lastEscalation: { category: cat } }, alive, { moneyHalt: cat === 'cap-halt' });
    assert.deepEqual(e.actions, [EDIT], `escalated ${cat}: Edit only`);
  }
  const dead = { died: true, lastThing: null };
  const base = { outcome: null, stopReason: null, spentUsd: null, budgetUsd: 2 };
  assert.deepEqual(endedFor(base, dead, { resume: ok }).actions, [RESUME, EDIT], 'died + resumable: Resume then Edit');
  assert.deepEqual(endedFor(base, dead, { resume: no }).actions, [EDIT], 'died, not resumable: Edit only');
  assert.deepEqual(endedFor(base, dead, {}).actions, [EDIT], 'died, no plan at all: Edit only');
  assert.deepEqual(ended('green', null).actions, [REUSE], 'green: Reuse only');
  for (const o of ['already-green', 'satisfied']) {
    // hamr 2026-10-08: the check passed before any work — not a reusable job
    assert.deepEqual(ended(o, null).actions, [EDIT], `${o}: Edit in chat, never Reuse`);
    assert.equal(ended(o, null).next, 'Change the job: press Edit in chat.');
  }
  assert.deepEqual(ended('green', null, {}).actions.filter((a) => a.id === 'edit'), []);
  assert.equal(endedFor({ outcome: null, stopReason: null, spentUsd: null, budgetUsd: 2 }, alive, {}), null, 'live: no block');
});

test('run tab: the Edit in chat button shows only when the server offers `edit` — also on a died run — and clicking it calls editInChat', () => {
  const calls = [];
  const bar = { innerHTML: '', hidden: true, q: {}, querySelector(sel) { const k = /"(.+)"/.exec(sel)[1]; return this.q[k] ?? null; } };
  const doc = { getElementById: () => bar };
  const mount = (detail) => {
    const { renderRunActions } = build(['renderRunActions'], { document: doc, escapeXml, editInChat: (d) => calls.push(d.runid), reuseWorkflow() {}, resumeInChat() {} }, 'var stopAsked = {};');
    // the fake bar cannot parse html: probe the markup, then expose a fake button for the click wiring
    bar.q = { 'btn-edit-chat': { addEventListener(_e, fn) { bar.q['btn-edit-chat'].fn = fn; } } };
    renderRunActions(detail);
    return bar.innerHTML;
  };
  const failed = { runid: 'r1', died: false, live: false, ended: { actions: [RESUME, EDIT] }, resume: { ok: true } };
  const html = mount(failed);
  assert.ok(html.indexOf('btn-resume-run') < html.indexOf('btn-edit-chat'), 'Resume then Edit in chat');
  assert.match(html, /data-testid="btn-edit-chat">Edit in chat</);
  bar.q['btn-edit-chat'].fn();
  assert.deepEqual(calls, ['r1']);
  assert.match(mount({ ...failed, died: true, ended: { actions: [EDIT] }, resume: null }), /btn-edit-chat/, 'a died run still gets Edit in chat');
  assert.doesNotMatch(mount({ ...failed, ended: { actions: [REUSE] } }), /btn-edit-chat/, 'green: Reuse only');
  assert.doesNotMatch(mount({ ...failed, live: true, ended: null }), /btn-edit-chat/, 'live: Stop only');
});

test('door: editInChat asks the EXISTING start-from reader, opens the Chat tab, hands the card the origin line (run-N + status word); a refusal hands over the error only', async () => {
  const urls = [];
  const events = [];
  const clicks = [];
  let reply = { ok: true, card: { jobName: 'pulselog-digest' } };
  const scope = {
    authorGet: (u) => { urls.push(u); return Promise.resolve(reply); },
    document: { getElementById: (id) => ({ click() { clicks.push(id); } }), dispatchEvent: (e) => events.push(e) },
    CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i.detail; } },
  };
  const { editInChat } = build(['runLabel', 'editInChat'], scope);
  await editInChat({ runid: 'r 1', job: 'pulselog-digest', runNo: 3, status: { word: 'failed' } });
  assert.deepEqual(urls, ['/api/author/start-from?runid=r%201'], 'no second reader, no model param');
  assert.deepEqual(clicks, ['tab-chat']);
  assert.equal(events[0].type, 'bareloop-edit');
  assert.equal(events[0].detail.origin, 'Copied from pulselog-digest (run-3) — failed. Every box is open. Change anything and it drafts as a new job; change nothing and it is another run of the same job.');
  assert.equal(events[0].detail.prefill, reply);
  reply = { ok: false, error: "this run's signed job is not on disk" };
  await editInChat({ runid: 'r2', job: 'j', runNo: 1, status: { word: 'failed' } });
  assert.deepEqual(events[1].detail, { error: "this run's signed job is not on disk" });
  assert.match(PAGE, /document\.addEventListener\("bareloop-edit", function\(e\)\{ applyEdit\(e\.detail \|\| \{\}\); \}\);/);
});

test('card: applyEdit fills EVERY box from the signed job, radio on the job\'s own type, origin line shown, and sets NO reuse state — the button stays the normal Start drafting', () => {
  const log = [];
  const originLine = { hidden: true, textContent: '' };
  const errEl = { textContent: '' };
  const api = build(['applyEdit'], {
    clearStartFrom: () => log.push('clear'), openNewCard: () => log.push('open'), modelSelect: { value: '' },
    setVerdict: (v) => log.push(`verdict:${v}`), fillCard: (c) => { for (const [id, v] of [['jf-name', c.jobName], ['jf-job', c.jobText], ['jf-inputs', c.inputs], ['jf-dest', c.destination], ['jf-cap-money', c.capUsd], ['jf-cap-time', Math.round(c.maxWallMs / 60000)]]) log.push(`val:${id}=${v}`); }, setReuseLocked: (on) => log.push(`lock:${on}`),
    renderPicker() {}, originLine, errEl, refreshModelStatus() {}, refreshCapNote() {}, refreshStartEnabled() {},
  }, 'var startFrom = null, reuseCheckType = "deterministic", reuseSession = false;', '__s: () => ({startFrom, reuseCheckType, reuseSession})');
  const card = { checkType: 'rubric', jobName: 'doc-weekly', model: '', jobText: 'g\n~ PASS: x\n~ FAIL: y', inputs: 'repo: /s', destination: 'out/', capUsd: 1, maxWallMs: 1200000 };
  api.applyEdit({ runid: 'r1', prefill: { card, line: 'Same job - 3 green', trackRecord: {} }, origin: 'Copied from doc-weekly (run-2) — failed.' });
  assert.deepEqual(api.__s(), { startFrom: null, reuseCheckType: 'deterministic', reuseSession: false }, 'no reuse state');
  assert.ok(!log.includes('lock:true') && !log.some((l) => l === 'verdict:reuse'), 'never locked, never on the Reuse radio');
  assert.ok(log.includes('verdict:rubric'));
  for (const f of ['jf-name=doc-weekly', 'jf-job=g\n~ PASS: x\n~ FAIL: y', 'jf-inputs=repo: /s', 'jf-dest=out/', 'jf-cap-money=1', 'jf-cap-time=20']) assert.ok(log.includes(`val:${f}`), f);
  assert.equal(originLine.hidden, false);
  assert.equal(originLine.textContent, 'Copied from doc-weekly (run-2) — failed.');
  assert.ok(log.indexOf('clear') < log.indexOf('open'), 'a live session is handled exactly as applyReuse: clearStartFrom then openNewCard');
  api.applyEdit({ runid: 'r1', prefill: { card: { ...card, checkType: 'deterministic' } }, origin: 'o' });
  assert.ok(log.includes('verdict:deterministic'));
  // a refused prefill opens nothing
  log.length = 0;
  api.applyEdit({ error: 'nothing to copy' });
  assert.deepEqual(log, []);
  assert.equal(errEl.textContent, 'nothing to copy');
  // the origin line goes with the card: openNewCard / clearStartFrom hide it (Clear -> resetCard -> both)
  assert.match(fnSrc('openNewCard'), /originLine\.hidden = true/);
  assert.match(fnSrc('clearStartFrom'), /originLine\.hidden = true/);
  assert.doesNotMatch(fnSrc('applyEdit'), /startFrom = |reuseCheckType = |setReuseLocked\(true\)|reuseSession = /);
});

test('job name: a panel job lives in its session folder, never repo jobs/ — so a second draft under the SAME name is not refused by validateJobCard (checked against the real repo jobs/ dir)', () => {
  const rows = keyRows({ filled: ['ANTHROPIC_API_KEY'], config: {} });
  const card = { jobName: 'pulselog-digest', checkType: 'deterministic', model: 'claude-sonnet-5', jobText: 'g', inputs: 'repo: /s', destination: 'o', capUsd: 1 };
  assert.deepEqual(validateJobCard(card, { rows }), { ok: true }, 'drafting the same name again is accepted');
  assert.equal(validateJobCard({ ...card, jobName: 'pulselog-u-types' }, { rows }).ok, false, 'only a name that IS a repo jobs/*.json is refused');
});
