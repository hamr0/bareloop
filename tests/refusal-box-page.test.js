// fwd v0.38.0 swap (M19 am14b, F400), S2 + S3: the page's ONE refusal writer. The page's own functions run over a fake document (the house pattern, see dest-box-reverts.test.js).
//  - a refusal with a box paints its words in a red line under that box and one pointer under the Draft button; a refusal with no box paints under the button;
//  - a poll tick (renderActions) never wipes a standing refusal; a session refusal is painted once; the next Draft click clears it;
//  - the Job box carries the one-step-per-line hint for both job types.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(join(HERE, '../src/panel/index.html'), 'utf8');
function fnSrc(/** @type {string} */ name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
}
/** the page's `var X = <literal>;` line, so the test reads the page's own constant */
function varSrc(/** @type {string} */ name) {
  const m = new RegExp(`^ *var ${name} = [^\\n]*;`, 'm').exec(PAGE);
  assert.ok(m, `expected var ${name} in the page`);
  return m[0];
}

function world() {
  const ids = ['jf-err-job', 'jf-err-inputs', 'jf-err-capUsd', 'jf-err-model', 'jf-err-dest', 'jf-err-name', 'chat-card-error', 'chat-action-error'];
  const els = Object.fromEntries(ids.map((k) => [k, { textContent: '', scrollIntoView() {} }]));
  const doc = { getElementById: (/** @type {string} */ id) => els[id] };
  /** @type {{url: string, body: any}[]} */
  const posts = [];
  /** @type {any} */
  const ctl = { reply: null };
  const src = `var errEl = document.getElementById("chat-card-error"), actionErrEl = document.getElementById("chat-action-error");
var sessionId = null, sessionLive = false, startFrom = null, carryFromId = null, reuseSession = false, autoSigned = false, signClickedOnce = false, pollTimer = null;
var CLIENT_TERMINAL_PHASES = ["refused", "abandoned", "error", "signed", "signing-failed"], lastState = null;
function renderProgress(){ return false; } function renderQuestionBox(){} function refreshStartEnabled(){} function syncDestinationFromSession(){} function syncJobBoxFromSession(){}
function renderMessages(){} function poll(){} function currentCard(){ return {}; }
var progressRow = {};
function authorPost(url, body){ posts.push({url: url, body: body}); return Promise.resolve(ctl.reply); }
${varSrc('REFUSAL_POINTER')}\n${varSrc('REFUSAL_ERR_IDS')}\nvar refusalKey = "", refusalBoxEl = null, dismissedRefusalId = null, startAttempt = 0;
${fnSrc('clearRefusal')}\n${fnSrc('paintRefusal')}\n${fnSrc('renderActions')}\n${fnSrc('doStart')}
return { paintRefusal: paintRefusal, clearRefusal: clearRefusal, renderActions: renderActions, doStart: doStart, setSession: function(id){ sessionId = id; } };`;
  // eslint-disable-next-line no-new-func
  const api = new Function('document', 'posts', 'ctl', src)(doc, posts, ctl);
  return { els, api, posts, ctl };
}
const flush = () => new Promise((r) => { setImmediate(r); });
const POINTER = 'Not drafted: fix the red line above.';

test('a start refusal with a box paints under that box plus the pointer; the next Draft click clears both', async () => {
  const w = world();
  w.ctl.reply = { status: 400, body: { ok: false, error: 'Destination is required', box: 'dest' } };
  w.api.doStart(); await flush();
  assert.equal(w.els['jf-err-dest'].textContent, 'Destination is required');
  assert.equal(w.els['chat-card-error'].textContent, POINTER);
  for (const k of ['job', 'inputs', 'capUsd', 'model', 'name']) assert.equal(w.els[`jf-err-${k}`].textContent, '', k);
  // a tick of the poll (renderActions) does not wipe the standing refusal
  w.api.renderActions({ phase: 'refused', id: 'zz' });
  assert.equal(w.els['jf-err-dest'].textContent, 'Destination is required');
  assert.equal(w.els['chat-card-error'].textContent, POINTER);
  // the next Draft click clears them first (the answer is another refusal here: it paints its own)
  w.ctl.reply = { status: 400, body: { ok: false, error: 'Cap is bad', box: 'capUsd' } };
  w.api.doStart();
  assert.equal(w.els['jf-err-dest'].textContent, '', 'cleared at the click, before the answer');
  assert.equal(w.els['chat-card-error'].textContent, '');
  await flush();
  assert.equal(w.els['jf-err-capUsd'].textContent, 'Cap is bad');
});

test('a refusal with no box paints its words under the Draft button only', async () => {
  const w = world();
  w.ctl.reply = { status: 409, body: { ok: false, error: 'an authoring session is already live — one at a time', box: null } };
  w.api.doStart(); await flush();
  assert.equal(w.els['chat-card-error'].textContent, 'an authoring session is already live — one at a time');
  for (const k of ['job', 'inputs', 'capUsd', 'model', 'dest', 'name']) assert.equal(w.els[`jf-err-${k}`].textContent, '', k);
  w.api.renderActions({ phase: 'refused', id: 'zz' });
  assert.equal(w.els['chat-card-error'].textContent, 'an authoring session is already live — one at a time', 'a tick does not wipe it');
});

test('a refusal from an old answer without a box key (undefined) is a no-box refusal', async () => {
  const w = world();
  w.ctl.reply = { status: 404, body: { ok: false, error: 'no such run to reuse' } };
  w.api.doStart(); await flush();
  assert.equal(w.els['chat-card-error'].textContent, 'no such run to reuse');
});

test('a session refusal that names a box paints once; a tick never wipes it; pressing Draft clears it and the same ended session never paints it again', async () => {
  const w = world();
  const st = { phase: 'refused', id: 's1', error: 'Add at least one rule (~).', refusal: { box: 'job', words: 'Add at least one rule (~).' } };
  w.api.renderActions(st);
  assert.equal(w.els['jf-err-job'].textContent, 'Add at least one rule (~).');
  assert.equal(w.els['chat-card-error'].textContent, POINTER);
  w.api.renderActions(st);
  assert.equal(w.els['chat-card-error'].textContent, POINTER, 'a tick keeps the pointer');
  // painted once: a line the person blanked is not brought back by the next tick of the same refusal
  w.els['jf-err-job'].textContent = '';
  w.api.renderActions(st);
  assert.equal(w.els['jf-err-job'].textContent, '');
  // Draft click: cleared, and the ended session's poll tick does not paint it again
  w.api.setSession('s1');
  w.ctl.reply = { status: 400, body: { ok: false, error: 'Cap is bad', box: 'capUsd' } };
  w.api.doStart(); await flush();
  w.api.renderActions(st);
  assert.equal(w.els['jf-err-job'].textContent, '');
  assert.equal(w.els['jf-err-capUsd'].textContent, 'Cap is bad');
});

test('a session refusal with no box leaves the card line to the progress list (no second copy under the button)', () => {
  const w = world();
  w.api.renderActions({ phase: 'refused', id: 's2', error: 'look failed', refusal: { box: null, words: 'look failed' } });
  assert.equal(w.els['chat-card-error'].textContent, '');
});

test('the page has a red line under each of the six boxes', () => {
  for (const k of ['job', 'inputs', 'capUsd', 'model', 'dest', 'name']) assert.match(PAGE, new RegExp(`<div class="jf-err" id="jf-err-${k}" data-testid="jf-err-${k}"></div>`), k);
});
