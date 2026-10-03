// P5 item 3 — the PAGE side of Start from this. Same posture as p5r-page.test.js (the page's own functions
// extracted from src/panel/index.html, a tiny fake DOM, no jsdom). The RULE is never on the page: it asks the server.
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

test('page: Reuse workflow asks the server for the prefill, opens the Chat tab (left) and hands the card over as an event — it decides nothing itself', async () => {
  const events = [];
  const clicks = [];
  const urls = [];
  const prefill = { ok: true, card: { goal: 'g' }, line: 'Same job — 1 green · 0 not green · about $1.00 a run' };
  // eslint-disable-next-line no-new-func
  const startFromThis = new Function('document', 'authorGet', 'CustomEvent', 'window', `${fnSrc('reuseWorkflow')}\nreturn reuseWorkflow;`)(
    { getElementById: (id) => ({ click: () => clicks.push(id) }), dispatchEvent: (e) => events.push(e) },
    (u) => { urls.push(u); return Promise.resolve(prefill); },
    class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    { alert: () => { throw new Error('no alert expected'); } },
  );
  startFromThis('run 1');
  await new Promise((r) => { setTimeout(r, 10); });
  assert.deepEqual(urls, ['/api/author/start-from?runid=run%201']);
  assert.deepEqual(clicks, ['tab-chat']);
  assert.equal(events[0].type, 'bareloop-start-from');
  assert.deepEqual(events[0].detail, { runid: 'run 1', prefill });
});

test('page: Reuse workflow is in the action row and the Ended block only where the server offers it (green rows) — "Start from this" is gone from the page', () => {
  assert.match(fnSrc('renderRunActions'), /data-testid="btn-reuse">Reuse workflow</);
  assert.match(fnSrc('renderRunActions'), /a\.id === "reuse"/);
  assert.match(fnSrc('renderRunActions'), /reuseWorkflow\(detail\.runid\)/);
  assert.match(fnSrc('renderEnded'), /btn-reuse-ended">Reuse workflow</);
  assert.match(fnSrc('renderEnded'), /a\.id === "reuse"/);
  assert.doesNotMatch(fnSrc('renderRunActions') + fnSrc('renderEnded'), /start-from|Start from this/);
});

test('page: the card opens prefilled, shows the SERVER\'s line, re-asks the server on every edit, and labels the button by its answer', () => {
  assert.match(PAGE, /document\.addEventListener\("bareloop-start-from"/);
  assert.match(PAGE, /"\/api\/author\/start-from-check", \{runid: startFrom\.runid, card: currentCard\(\)\}/);
  assert.match(PAGE, /startBtn\.textContent = r\.body\.same \? "Sign & run" : "Start drafting"/);
  assert.match(PAGE, /if\(startFrom\) body\.startFrom = startFrom\.runid;/, 'the start request names the run; the server judges same-vs-changed');
  assert.match(PAGE, /data-testid="startfrom-line"/);
  // + New clears the start-from state, so a plain New job card never carries a stale origin
  assert.match(PAGE, /newBtn\.addEventListener\("click", function\(\)\{ clearStartFrom\(\); openNewCard\(\); \}\);/);
});

test('page: a same-job session signs the hash the server prepared as soon as it is ready — one click (Sign & run), the server re-checks the hash', () => {
  assert.match(PAGE, /if\(sameJobSession && !autoSigned && j\.state\.phase === "prepared" && j\.state\.specHash\)/);
  assert.match(PAGE, /"\/sign", \{specHash: j\.state\.specHash\}/);
  assert.match(PAGE, /signClickedOnce = sameJobSession;/, 'a same-job session has no confirm turn, so the sign-prepare click is skipped');
});
