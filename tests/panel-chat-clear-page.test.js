// The Chat card's Clear / Abandon button (hamr's live click-through ruling, 2026-10-05). Same posture as
// p5-startfrom-page.test.js: the page's own functions extracted from src/panel/index.html, a tiny fake DOM.
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

test('page: there is no + New; the empty job card is always on the Chat tab (not hidden), with Clear on the "Job card — draft" title line', () => {
  assert.doesNotMatch(PAGE, /chat-new|newBtn/);
  assert.doesNotMatch(PAGE, /<div class="job-card compact" id="job-card"[^>]*\bhidden\b/, 'the card is never hidden at load');
  const title = PAGE.indexOf('<h4 id="job-card-title">Job card — draft</h4>');
  const btn = PAGE.indexOf('id="chat-clear-btn"');
  assert.ok(title !== -1 && btn > title && btn - title < 200, 'Clear sits right on the title line');
  assert.match(PAGE, /\.job-card \.card-clear\{position:absolute;top:-13px;right:10px;/, 'top right of the card, on the border line, never in the flow');
});

test('page: the button reads Abandon while a session is live and unsigned, and Clear otherwise (signed, terminal, nothing started)', () => {
  const f = new Function(`${fnSrc('clearButtonFor')}\nreturn clearButtonFor;`)();
  assert.deepEqual(f(true, true), { text: 'Abandon', disabled: false }, 'drafting / waiting on install / waiting for confirm');
  assert.deepEqual(f(true, false), { text: 'Abandon', disabled: true }, 'Start in flight: no id to abandon yet');
  assert.deepEqual(f(false, false), { text: 'Clear', disabled: false }, 'nothing started');
  assert.deepEqual(f(false, true), { text: 'Clear', disabled: false }, 'signed (a terminal phase), the run keeps running');
  // 'signed' must be terminal on the page, so it flips the label to Clear
  assert.match(PAGE, /CLIENT_TERMINAL_PHASES = \["refused", "abandoned", "error", "signed", "signing-failed"\]/);
  assert.match(PAGE, /sessionLive = CLIENT_TERMINAL_PHASES\.indexOf\(state\.phase\) === -1;\s*refreshStartEnabled\(\);/);
  assert.match(fnSrc('refreshStartEnabled'), /refreshClearBtn\(\);/);
});

test('page: Abandon posts to the abandon route and clears only once the server says ok; Clear never posts (a run is never stopped from here)', () => {
  const click = PAGE.slice(PAGE.indexOf('clearBtn.addEventListener("click", function(){\n      if(clearBtn.textContent === "Abandon"'));
  const h = click.slice(0, click.indexOf('\n    });') + 8);
  assert.match(h, /authorPost\("\/api\/author\/" \+ sessionId \+ "\/abandon", \{\}\)/);
  assert.match(h, /if\(!o\.ok\)\{ chatActionFailed\(o\.error\); return; \}\s*resetCard\(\);/);
  assert.doesNotMatch(h, /\/stop|\/sign/);
  assert.ok(h.lastIndexOf('resetCard();') > h.indexOf('return;\n      }'), 'the plain Clear path resets without a request');
  assert.doesNotMatch(fnSrc('resetCard'), /authorPost|fetch/);
});

test('page: resetCard empties every box, check type back to deterministic, Model to the default, hides origin/estimate/notes, clears progress and thread', () => {
  const els = {};
  const mk = (id, extra = {}) => { els[id] = { id, value: 'x', textContent: 'x', hidden: false, disabled: false, ...extra }; return els[id]; };
  for (const id of ['jf-name', 'jf-goal', 'jf-source', 'jf-dest', 'jf-success', 'jf-guardrails', 'jf-judge', 'jf-cap-money', 'jf-cap-time', 'jf-cap-note']) mk(id);
  const radios = [{ value: 'deterministic', checked: false }, { value: 'rubric', checked: true }];
  const calls = [];
  const modelSelect = { selectedIndex: 3 };
  const msgInput = { value: 'typed' };
  const doc = { getElementById: (id) => els[id], querySelectorAll: () => ({ forEach: (fn) => radios.forEach(fn) }) };
  let lastPhase = 'prepared';
  // eslint-disable-next-line no-new-func
  const run = new Function('document', 'modelSelect', 'msgInput', 'clearStartFrom', 'openNewCard', 'refreshModelStatus', 'rwQ',
    `var lastPhase = "prepared"; var CARD_BOX_IDS = ["jf-name", "jf-goal", "jf-source", "jf-dest", "jf-success", "jf-guardrails", "jf-judge", "jf-cap-money", "jf-cap-time"];\n${fnSrc('clearCardBoxes')}\n${fnSrc('setVerdict')}\n${fnSrc('resetCard')}\nresetCard();\nreturn lastPhase;`);
  lastPhase = run(doc, modelSelect, msgInput, () => calls.push('clearStartFrom'), () => calls.push('openNewCard'), () => calls.push('refreshModelStatus'), { value: 'q' });
  for (const id of ['jf-name', 'jf-goal', 'jf-source', 'jf-dest', 'jf-success', 'jf-guardrails', 'jf-judge', 'jf-cap-money', 'jf-cap-time']) assert.equal(els[id].value, '', id);
  assert.equal(els['jf-judge'].disabled, true, 'rubric-only box off, as for deterministic');
  assert.deepEqual(radios.map((r) => r.checked), [true, false], 'deterministic');
  assert.equal(modelSelect.selectedIndex, 0);
  assert.equal(msgInput.value, '');
  assert.equal(els['jf-cap-note'].textContent, '');
  assert.equal(lastPhase, null);
  // origin/estimate/notes hidden and the reuse lock lifted by clearStartFrom; thread + progress cleared by openNewCard
  assert.deepEqual(calls, ['clearStartFrom', 'openNewCard', 'refreshModelStatus']);
  assert.match(fnSrc('clearStartFrom'), /sfLine\.hidden = true; sfNote\.hidden = true;/);
  assert.match(fnSrc('clearStartFrom'), /setReuseLocked\(false\)/);
  assert.match(fnSrc('openNewCard'), /thread\.innerHTML = "";/);
  assert.match(fnSrc('openNewCard'), /progressRow\.innerHTML = "";/);
  assert.match(fnSrc('openNewCard'), /clearInterval\(pollTimer\)/, 'polling stops, so a late tick cannot refill the card');
});

test('page: a poll answer for a session the card has already left is dropped', () => {
  assert.match(fnSrc('poll'), /var polledId = sessionId;/);
  assert.match(fnSrc('poll'), /polledId !== sessionId\) return;/);
});

test('page: no separate "spec hash:" line under Sign & run — the hash shows once, as the "generating hash" step detail (hamr 2026-10-05)', () => {
  assert.doesNotMatch(PAGE, /chat-hash-line|hashLine/);
});

test('page: one main button replaces the sign pair — no Check again / Sign & run group (hamr 2026-10-05)', () => {
  assert.doesNotMatch(PAGE, /sign-pair|chat-check-deps-btn|chat-sign-btn/);
});


test('page: when a polled session reaches signed (the run starts) the page goes to the run AND the Chat card resets to the empty card (hamr 2026-10-05)', async () => {
  const calls = [];
  const els = { 'tab-runs': { click: () => calls.push('tab-runs') } };
  const state = { phase: 'signed' };
  const run = new Function('document', 'authorGet', 'renderMessages', 'renderActions', 'clearInterval', 'resetCard',
    `var sessionId = "s1", pollTimer = 1, lastPhase = null, reuseSession = false, autoSigned = false;\n${fnSrc('poll')}\nreturn poll();`);
  await run({ getElementById: (id) => els[id] }, () => Promise.resolve({ state }), () => {}, () => {}, () => calls.push('clearInterval'), () => calls.push('resetCard'));
  await new Promise((r) => setImmediate(r));
  assert.ok(calls.includes('resetCard'), 'signed resets the card');
  assert.ok(calls.includes('tab-runs'), 'the switch to the run is kept');
  assert.ok(calls.indexOf('resetCard') > calls.indexOf('tab-runs'), 'reset after the switch');
  // the reset leaves an empty card, so the main button offers a fresh draft, not the signed job
  const mainButtonFor = new Function(`${fnSrc('mainButtonFor')}\nreturn mainButtonFor;`)();
  assert.equal(mainButtonFor({ startOk: true }, true, false).text, 'Start drafting');
  // a non-signed phase must not reset
  state.phase = 'drafting';
  calls.length = 0;
  await run({ getElementById: (id) => els[id] }, () => Promise.resolve({ state }), () => {}, () => {}, () => calls.push('clearInterval'), () => calls.push('resetCard'));
  await new Promise((r) => setImmediate(r));
  assert.ok(!calls.includes('resetCard'));
});
