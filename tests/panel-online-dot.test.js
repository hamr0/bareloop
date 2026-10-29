// The panel header's online/offline dot: the Runs list poll (/api/runs, every RUNS_LIST_POLL_MS) paints it. ANY HTTP reply (even a 500, even a 200 whose body
// will not parse) = node answered = online; only a read that failed with no HTTP status (fetch TypeError) = offline. The page's own functions are pulled out
// BY NAME with a brace-scan helper and driven against tiny fakes (no browser in this suite). The real dead-panel behaviour was proven by a $0 POC on the real panel.
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

/** the dot's painter + getJSON + refreshRunsList in one scope; `mode` picks what fetch does: ok | net | http500 | badjson */
function mount() {
  const dot = { className: 'on', textContent: '● online' };
  const document = { getElementById: (id) => (id === 'online-dot' ? dot : { textContent: '' }) };
  const state = { mode: 'ok', renderThrows: false };
  const fetch = () => {
    if (state.mode === 'net') return Promise.reject(new TypeError('Failed to fetch'));
    if (state.mode === 'http500') return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
    if (state.mode === 'badjson') return Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('Unexpected token <')) });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ runs: [] }) });
  };
  // eslint-disable-next-line no-new-func
  const f = new Function('document', 'fetch', 'Date', 'state', `
    var RUNS_LIST_POLL_MS = 10000; var lastRunsListRefreshAt = 0; var pollFailStreak = 0; var lastRunsPayloadSig = null; var lastRunsSig = null;
    function sig(o){ return JSON.stringify(o); }
    function withScrollPreserved(ids, fn){ fn(); }
    function setRunsData(){ if (state.renderThrows) throw new Error('render boom'); } var console = { error: function(){} }; var runsFilterBar = { refresh: function(){} };
    ${['paintOnline', 'getJSON', 'refreshRunsList'].map(fnSrc).join('\n')}
    return { refreshRunsList: refreshRunsList, streak: function(){ return pollFailStreak; } };
  `)(document, fetch, Date, state);
  return { f, dot, state };
}
const read = (d) => `${d.textContent}|${d.className}`;

test('online on load; a network-failed read paints offline; the next good read paints online; an HTTP 500 stays online', async () => {
  const { f, dot, state } = mount();
  assert.equal(read(dot), '● online|on');
  state.mode = 'net'; await f.refreshRunsList(true);
  assert.equal(read(dot), '● offline|off');
  state.mode = 'ok'; await f.refreshRunsList(true);
  assert.equal(read(dot), '● online|on');
  state.mode = 'net'; await f.refreshRunsList(true);
  assert.equal(read(dot), '● offline|off');
  state.mode = 'http500'; await f.refreshRunsList(true);
  assert.equal(read(dot), '● online|on', 'node answered with an error: still online');
});

test('a render error after a good fetch keeps the dot online (node answered) and does not count as a failed read', async () => {
  const { f, dot, state } = mount();
  state.mode = 'net'; await f.refreshRunsList(true);
  assert.equal(read(dot), '● offline|off');
  state.mode = 'ok'; state.renderThrows = true;
  await f.refreshRunsList(true);
  assert.equal(read(dot), '● online|on', 'the fetch succeeded; a page render throw is not the panel being down');
  assert.equal(f.streak(), 0);
});

test('a 200 whose body will not parse is node answering: online', async () => {
  const { f, dot, state } = mount();
  state.mode = 'net'; await f.refreshRunsList(true);
  state.mode = 'badjson'; await f.refreshRunsList(true);
  assert.equal(read(dot), '● online|on');
});

test('the failure streak (the "fetch failing" note) still counts every failed read and resets on a good one', async () => {
  const { f, state } = mount();
  state.mode = 'net'; await f.refreshRunsList(true); await f.refreshRunsList(true);
  assert.equal(f.streak(), 2);
  state.mode = 'ok'; await f.refreshRunsList(true);
  assert.equal(f.streak(), 0);
});

test('the dot id is unique and sits directly before Settings, after the host line; theme toggle follows', () => {
  assert.equal(PAGE.split(' id="online-dot"').length - 1, 1);
  assert.match(PAGE, /id="host-line"><\/span>\s*<span id="online-dot"[^>]*>[^<]*<\/span>\s*<button[^>]*id="btn-settings"[^>]*>[^<]*<\/button>\s*<button[^>]*id="theme-toggle"/);
});

test('the dot is nowrap and never shrinks, coloured by the existing green/red tokens', () => {
  assert.match(PAGE, /#online-dot\{[^}]*white-space:nowrap;[^}]*flex:none;/);
  assert.match(PAGE, /#online-dot\.on\{color:var\(--green\);\}/);
  assert.match(PAGE, /#online-dot\.off\{color:var\(--red\);\}/);
});
