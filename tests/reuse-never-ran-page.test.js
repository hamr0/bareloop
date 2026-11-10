// R9 9b.2 caller (hamr's live click-through 2026-11-09): a run refused before it started, or skipped, showed ONLY its ending words - no [Reuse workflow], so 9b.2's
// Sign & run had no caller from the run page. Here: the REAL panel server (a refused-before-start run with a signed session spec), the page's OWN renderRun / renderRunActions /
// reuseWorkflow cut from src/panel/index.html over a tiny fake DOM, the click, and then the REAL POST /api/author/start with what the click handed the Chat card. $0.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendRunEvent } from '../src/runlist.js';
import { world, makeRepo, keysHome, draftSeams, draftSpec, makeRun, baseCard } from './flowtype-world.mjs';

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

async function setup(t) {
  const seen = {};
  const w = await world(t, { serve: false });
  const keys = keysHome(w.cfg);
  const repo = makeRepo(path.join(w.base, 'repo'));
  const card = baseCard({ source: repo, jobName: 'plain-job' });
  const spec = (await draftSpec(w, keys, card, null)).spec;
  const mk = (runid, outcome = 'green') => { const out = path.join(w.base, `o-${runid}`); mkdirSync(out); return makeRun(w.cfg, { runid, spec, card, outcome, out }); };
  const never = (runid, over = {}) => {
    const { spine } = mk(runid);
    rmSync(spine);
    appendRunEvent({ runid, type: 'settled', by: runid, reason: 'refused before start', words: 'The token is locked, so the look did not start.', spentUsd: 0, spendComplete: true, at: '2026-10-01T10:01:00.000Z', ...over }, { home: w.cfg });
  };
  never('refused1');
  never('skipped1', { reason: 'skipped', words: 'the ticket is closed' });
  never('paid1', { spentUsd: 0.5 });
  mk('green01');
  const srv = await world(t, { panel: { home: w.cfg, sessionDeps: draftSeams(seen) }, serve: true });
  return { w, srv, card, seen };
}

/** the page's own functions over a fake DOM; authorGet is the page's fetch shape pointed at the real server */
function page(srv) {
  const els = {};
  const el = (id) => (els[id] ??= { id, hidden: true, innerHTML: '', textContent: '', querySelector: () => null, click() { els.clicked = id; }, classes: new Set(), classList: { add(c) { els[id].classes.add(c); }, remove(c) { els[id].classes.delete(c); } } });
  const buttons = {};
  el('run-actions').querySelector = (sel) => (/btn-reuse/.test(sel) && /btn-reuse/.test(els['run-actions'].innerHTML) ? (buttons.reuse ??= { addEventListener: (_e, fn) => { buttons.reuseFn = fn; } }) : null);
  const events = [];
  const document = { getElementById: el, dispatchEvent: (e) => events.push(e) };
  const authorGet = (p) => fetch(`${srv.origin}${p}`, { headers: srv.H }).then((r) => r.json());
  // eslint-disable-next-line no-new-func
  const f = new Function('document', 'authorGet', 'authorPost', 'resumeInChat', 'scheduleInChat', 'syncResultTab', 'setRunHeader', 'statusWordHtml', 'runName', 'fmtLocalDateTime', 'CustomEvent', 'renderEnded', 'refreshRunsList', 'selectRun', 'runHeaderBody', `var stopAsked = {};\n${['escapeXml', 'renderRunActions', 'reuseWorkflow', 'renderRun'].map(fnSrc).join('\n')}\nreturn {renderRun, reuseWorkflow};`)(
    document, authorGet, () => Promise.resolve({ status: 200, body: {} }), () => {}, () => {}, () => {}, () => {}, () => '', () => 'plain-job (run-1)', () => '', class { constructor(type, init) { this.type = type; this.detail = init.detail; } }, () => {}, () => {}, () => {}, () => '',
  );
  return { ...f, els, buttons, events };
}

test('Must fail: a refused-before-start or skipped run page keeps its words AND draws [Reuse workflow] through renderRunActions; everything else of the run page stays hidden', async (t) => {
  const s = await setup(t);
  for (const id of ['refused1', 'skipped1']) {
    const detail = (await s.srv.get(`/api/runs/${id}`)).body;
    assert.equal(detail.reuseOffered, true, `${id}: the server says Reuse shows`);
    const p = page(s.srv);
    p.renderRun(detail);
    assert.equal(p.els['run-empty'].textContent, detail.endedLine, 'the ending words stay');
    assert.equal(p.els['run-content'].hidden, false, 'the container shows (the action row lives in it)');
    assert.ok(p.els['run-content'].classes.has('actions-only'), 'and only the action row of it: the page CSS hides every other child');
    assert.equal(p.els['run-actions'].hidden, false, 'the action row is drawn');
    const buttons = [...p.els['run-actions'].innerHTML.matchAll(/data-testid="([\w-]+)"/g)].map((m) => m[1]);
    assert.equal(buttons[0], 'btn-reuse', 'Reuse workflow leads the row');
    assert.deepEqual(buttons.filter((b) => /resume|accept|stop|needs/.test(b)), [], 'no Resume, Accept, Stop or Remove: nothing the server did not say');
    assert.deepEqual(buttons.slice(1), detail.schedule?.canSchedule ? ['run-schedule'] : [], 'the schedule button follows the server\'s own detail.schedule');
  }
  // a refusal that spent money has no log and no signed plan to sign: no button (start-from would only say "no log")
  const paid = (await s.srv.get('/api/runs/paid1')).body;
  assert.equal(paid.reuseOffered, false);
  const p = page(s.srv);
  p.renderRun(paid);
  assert.doesNotMatch(p.els['run-actions'].innerHTML, /btn-reuse/);
  // a normal run after a refused one: the row is rebuilt by renderRunActions, not left over (hidden first, drawn per run)
  const q = page(s.srv);
  q.renderRun((await s.srv.get('/api/runs/refused1')).body);
  q.renderRun({ fileMissing: true, job: 'j', runNo: 1, runid: 'x' });
  assert.ok(!q.els['run-content'].classes.has('actions-only'), 'the next run page shows its whole content again');
});

test('Must fail: clicking [Reuse workflow] on a refused run opens the Chat card prefilled, and the start with the job unchanged takes the reuse path (Sign & run, no drafting)', async (t) => {
  const s = await setup(t);
  const detail = (await s.srv.get('/api/runs/refused1')).body;
  const p = page(s.srv);
  p.renderRun(detail);
  p.buttons.reuseFn();                                   // the click
  assert.ok(await (async () => { for (let i = 0; i < 200 && p.events.length === 0; i += 1) await new Promise((r) => { setTimeout(r, 10); }); return p.events.length > 0; })(), 'the Chat card was told');
  assert.equal(p.els['tab-chat'].clicked ?? p.els.clicked, 'tab-chat', 'the Chat tab opens');
  const ev = p.events[0];
  assert.equal(ev.type, 'bareloop-reuse');
  assert.equal(ev.detail.runid, 'refused1');
  assert.equal(ev.detail.prefill.ok, true);
  assert.equal(ev.detail.prefill.green, true, 'the server calls a never-ran job reusable as it stands');
  assert.equal(ev.detail.prefill.card.jobName, 'plain-job');
  assert.ok(ev.detail.prefill.card.jobText, 'the card is prefilled with the signed job');
  // the card's Start with nothing changed: the page posts the card it was handed, plus startFrom
  const started = await s.srv.post('/api/author/start', { ...ev.detail.prefill.card, startFrom: ev.detail.runid });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.reuse, true, 'Sign & run: the signed job, no redraft');
  assert.equal(s.seen.spec, undefined, 'no drafting ran (the signing seam of the drafter was never reached)');
});
