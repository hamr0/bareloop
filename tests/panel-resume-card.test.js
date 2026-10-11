// Resume on the LEFT Chat card (hamr 2026-10-07, option B). The page's own functions extracted from src/panel/index.html
// and driven against tiny fakes: the Run tab's door (`resumeInChat`), the card's RESUME mode (`applyResume`, the lock
// rule in `syncCardLock`), and `signResume` (POST /api/runs/<id>/resume, body exactly as the Job tab's resume sent it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
/** a fake DOM: elements made on demand, `click()` recorded, `.parentNode` and `.classList` present */
function fakeDom() {
  const els = {};
  const clicks = [];
  const mk = (id) => {
    const cls = new Set();
    const el = {
      id, hidden: false, value: '', disabled: false, readOnly: false, textContent: '', innerHTML: '', handlers: {},
      classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); }, contains: (c) => cls.has(c) },
      addEventListener(ev, fn) { el.handlers[ev] = fn; },
      click() { clicks.push(id); },
    };
    el.parentNode = { hidden: false };
    return el;
  };
  const document = {
    getElementById(id) { if (!els[id]) els[id] = mk(id); return els[id]; },
    querySelector(sel) { return document.getElementById(`q:${sel}`); },
    querySelectorAll: () => [],
  };
  return { document, els, clicks };
}
const DETAIL = { runid: 'run1', job: 'pulselog-digest', runNo: 4, resume: { budgetUsd: 1, maxWallMin: 20, spentUsd: 1, spendComplete: true, wallUsedMs: 9 * 60_000 - 1000 } };
const CARD = { checkType: 'deterministic', jobName: 'pulselog-digest', model: 'deepseek-flash', jobText: 'g', inputs: 'repo: /s', destination: 'out/', capUsd: 1, maxWallMs: 1200000 };

test('door: Resume asks the SAME start-from reader, opens the Chat tab, and hands the card the engine\'s resume plan + the "name (run-N)" title', async () => {
  const urls = []; const events = []; const dom = fakeDom();
  const { resumeInChat } = build(['runLabel', 'resumeInChat'], {
    authorGet: (u) => { urls.push(u); return Promise.resolve({ ok: true, card: CARD }); },
    document: { getElementById: dom.document.getElementById, dispatchEvent: (e) => events.push(e) },
    CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i.detail; } },
  });
  await resumeInChat(DETAIL);
  assert.deepEqual(urls, ['/api/author/start-from?runid=run1']);
  assert.deepEqual(dom.clicks, ['tab-chat']);
  assert.equal(events[0].type, 'bareloop-resume');
  assert.equal(events[0].detail.title, 'pulselog-digest (run-4)');
  assert.deepEqual(events[0].detail.resume, DETAIL.resume);
  assert.match(PAGE, /document\.addEventListener\("bareloop-resume", function\(e\)\{ applyResume\(e\.detail \|\| \{\}\); \}\);/);
  assert.match(fnSrc('renderRunActions'), /resumeInChat\(detail\)/);
});

function mountCard() {
  const dom = fakeDom();
  const log = [];
  const originLine = dom.document.getElementById('chat-origin-line');
  const errEl = { textContent: '' };
  const api = build(['applyResume'], {
    document: dom.document, clearStartFrom: () => log.push('clear'), openNewCard: () => log.push('open'), modelSelect: { value: '' },
    fillCard: (c) => { const set = (id, v) => { dom.document.getElementById(id).value = v === undefined || v === null ? '' : String(v); }; set('jf-name', c.jobName); set('jf-job', c.jobText); set('jf-inputs', c.inputs); set('jf-dest', c.destination); set('jf-cap-money', c.capUsd); set('jf-cap-time', Math.round(c.maxWallMs / 60000)); },
    setVerdict: (v) => log.push(`verdict:${v}`), setVal: (id, v) => { dom.document.getElementById(id).value = v === undefined || v === null ? '' : String(v); },
    panelMoney: (n) => `$${Number(n).toFixed(2)}`, originLine, errEl, renderPicker() {}, refreshModelStatus() {}, refreshStartEnabled: () => log.push('refresh'),
  }, 'var resumeRun = null;', '__run: () => resumeRun');
  return { api, dom, log, originLine, errEl };
}

test('card: applyResume titles the card RESUME <job> (run-N), fills every box from the signed job, caps from the resume plan, shows the fixed intro and the spent hint', () => {
  const { api, dom, originLine } = mountCard();
  api.applyResume({ runid: 'run1', prefill: { card: CARD }, resume: DETAIL.resume, title: 'pulselog-digest (run-4)' });
  assert.equal(dom.els['job-card-title'].textContent, 'RESUME pulselog-digest (run-4)');
  for (const [id, v] of [['jf-name', 'pulselog-digest'], ['jf-job', 'g'], ['jf-inputs', 'repo: /s'], ['jf-dest', 'out/'], ['jf-cap-money', '1'], ['jf-cap-time', '20']]) {
    assert.equal(dom.els[id].value, v, id);
  }
  assert.equal(originLine.textContent, 'The same run goes on, not a new one. Only the money cap and the time cap can change; everything else is the signed job.');
  assert.equal(dom.els['chat-resume-spent'].textContent, 'spent so far $1.00 · time used so far 9 min');
  assert.equal(dom.els['chat-resume-box'].hidden, false);
  assert.equal(dom.els['chat-clear-btn'].hidden, true, 'Cancel replaces Clear');
  assert.equal(dom.els['chat-main-btn'].hidden, true, 'no Start drafting — a resume never drafts');
  assert.deepEqual(api.__run(), { runid: 'run1', noTime: false });
  assert.equal(dom.els['jf-cap-time'].parentNode.hidden, false);
});

test('card: no time box when the plan has no numeric maxWallMin; "at least" / "unknown" spend wording is kept; a refused prefill opens nothing', () => {
  const m = mountCard();
  m.api.applyResume({ runid: 'run1', prefill: { card: CARD }, resume: { budgetUsd: 2, maxWallMin: null, spentUsd: 0.5, spendComplete: false, wallUsedMs: null }, title: 't' });
  assert.equal(m.dom.els['jf-cap-time'].parentNode.hidden, true);
  assert.deepEqual(m.api.__run(), { runid: 'run1', noTime: true });
  assert.equal(m.dom.els['chat-resume-spent'].textContent, 'spent so far at least $0.50');
  m.api.applyResume({ runid: 'run1', prefill: { card: CARD }, resume: { budgetUsd: 2, maxWallMin: 5, spentUsd: null }, title: 't' });
  assert.equal(m.dom.els['chat-resume-spent'].textContent, 'spent so far unknown');
  const e = mountCard();
  e.api.applyResume({ error: 'this run has no log on disk' });
  assert.equal(e.errEl.textContent, 'this run has no log on disk');
  assert.deepEqual(e.log, [], 'nothing opened');
  assert.equal(e.api.__run(), null);
});

test('lock: in resume mode EVERYTHING is locked — boxes, Model, Check type radios — except Cap $ and Time cap', () => {
  const dom = fakeDom();
  const radios = [{ disabled: false }, { disabled: false }, { disabled: false }];
  dom.document.querySelectorAll = () => radios;
  const sandbox = (resumeRun, sessionLive) => build(['syncCardLock'], { document: dom.document },
    `var sessionLive = ${sessionLive}; var reuseOn = false; var resumeRun = ${JSON.stringify(resumeRun)};
     var LOCKED_IDS = ["jf-name", "jf-job"];
     var OPEN_IDS = ["jf-inputs", "jf-dest", "jf-cap-money", "jf-cap-time", "jf-model"]; var CAP_IDS = ["jf-cap-money", "jf-cap-time"];`).syncCardLock;
  sandbox({ runid: 'r', noTime: false }, false)();
  for (const id of ['jf-name', 'jf-job', 'jf-inputs', 'jf-dest', 'jf-model']) {
    assert.equal(dom.els[id].classList.contains('locked'), true, `${id} locked`);
    assert.equal(dom.els[id].readOnly, true, `${id} readOnly`);
  }
  for (const id of ['jf-cap-money', 'jf-cap-time']) {
    assert.equal(dom.els[id].classList.contains('locked'), false, `${id} open`);
    assert.equal(dom.els[id].readOnly, false);
  }
  assert.equal(dom.els['jf-model'].disabled, true);
  assert.deepEqual(radios.map((r) => r.disabled), [true, true, true], 'Check type radios locked too');
  // leaving resume mode opens the boxes again (and the radios)
  sandbox(null, false)();
  assert.equal(dom.els['jf-inputs'].classList.contains('locked'), false);
  assert.deepEqual(radios.map((r) => r.disabled), [false, false, false]);
});

function signHarness(resumeRun, postResult) {
  const dom = fakeDom();
  const posts = []; const log = [];
  dom.document.getElementById('jf-cap-money').value = '12';
  dom.document.getElementById('jf-cap-time').value = '90';
  const resumeSignBtn = dom.document.getElementById('chat-resume-sign');
  const api = build(['signResume'], {
    document: dom.document, resumeSignBtn,
    authorPost: (path, body) => { posts.push({ path, body }); return Promise.resolve(postResult); },
    resetCard: () => log.push('reset'), afterResumeRefresh: (...a) => log.push(['follow', ...a]),
  }, `var resumeRun = ${JSON.stringify(resumeRun)};`);
  return { api, dom, posts, log, resumeSignBtn };
}

test('sign: [Sign & resume] posts the same body the Job tab sent; on ok the card empties, the Run tab opens and follows the SAME run (no draft, no new run id)', async () => {
  const h = signHarness({ runid: 'run 1', noTime: false }, { status: 200, body: { ok: true, runid: 'run 1' } });
  await h.api.signResume();
  assert.deepEqual(h.posts, [{ path: '/api/runs/run%201/resume', body: { budgetUsd: '12', maxWallMin: '90' } }]);
  assert.deepEqual(h.log, ['reset', ['follow', 'run 1', 8]]);
  assert.equal(h.dom.clicks.at(-1), 'tab-run');
  assert.equal(h.resumeSignBtn.disabled, false);
  assert.doesNotMatch(fnSrc('signResume'), /author\/start|startFrom|doStart/, 'a resume never drafts');
  const noTime = signHarness({ runid: 'r', noTime: true }, { status: 200, body: { ok: true } });
  await noTime.api.signResume();
  assert.deepEqual(noTime.posts[0].body, { budgetUsd: '12' }, 'no time box, no maxWallMin');
});

test('sign: a refusal shows its error in the card and re-enables the button; the card stays in resume mode', async () => {
  const h = signHarness({ runid: 'r', noTime: false }, { status: 409, body: { ok: false, error: '--resume: that run reached its own terminal' } });
  await h.api.signResume();
  const err = h.dom.els['chat-resume-err'];
  assert.equal(err.textContent, '--resume: that run reached its own terminal');
  assert.equal(err.hidden, false);
  assert.equal(h.resumeSignBtn.disabled, false);
  assert.deepEqual(h.log, [], 'no reset, no follow');
});

test('wiring: Cancel empties the card (resetCard), openNewCard leaves resume mode, a live-session re-attach never overwrites a resume card', () => {
  assert.match(PAGE, /getElementById\("chat-resume-cancel"\)\.addEventListener\("click", function\(\)\{ resetCard\(\); \}\);/);
  assert.match(PAGE, /resumeSignBtn\.addEventListener\("click", signResume\);/);
  assert.match(fnSrc('openNewCard'), /exitResumeMode\(\)/);
  assert.match(fnSrc('reattachLive'), /resumeRun !== null/);
});

test('Job tab: read-only on every run — no input, button, select or textarea in its markup or in anything renderJob paints; the old resume mode is gone', () => {
  const tab = PAGE.slice(PAGE.indexOf('<section id="panel-details"'), PAGE.indexOf('</section>', PAGE.indexOf('<section id="panel-details"')));
  assert.ok(tab.includes('id="job-card-readonly"'));
  assert.doesNotMatch(tab, /<(input|button|select|textarea)\b/i, 'the Job tab markup has no control');
  // P7: the plan and the numbered inputs are drawn as escaped HTML by the ONE renderJobPlan; every other value is textContent
  assert.doesNotMatch(fnSrc('renderJob') + fnSrc('renderJobPlan'), /<(input|button|select|textarea)\b/i, 'no control is painted');
  assert.match(fnSrc('renderJobPlan'), /escapeXml\(l\.text\)/, 'a job line is escaped');
  assert.match(tab, /<label>\$ cap<\/label>/);
  assert.match(tab, /<label>Time cap<\/label>/, 'the caption never swaps to "Money cap ($)" / "Time cap (min)"');
  for (const gone of ['openResumeOnJobTab', 'paintResumeMode', 'resumeMode', 'resume-job', 'resume-cap', 'details-cap-money-label', 'details-cap-time-label']) {
    assert.ok(!PAGE.includes(gone), `${gone} is deleted`);
  }
});
