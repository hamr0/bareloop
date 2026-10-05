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
  assert.equal(events[0].type, 'bareloop-reuse');
  assert.deepEqual(events[0].detail, { runid: 'run 1', prefill });
});

test('page: Reuse workflow is in the action row only, where the server offers it (green rows) — never in the Ended block — "Start from this" is gone from the page', () => {
  assert.match(fnSrc('renderRunActions'), /data-testid="btn-reuse">Reuse workflow</);
  assert.match(fnSrc('renderRunActions'), /a\.id === "reuse"/);
  assert.match(fnSrc('renderRunActions'), /reuseWorkflow\(detail\.runid\)/);
  assert.doesNotMatch(fnSrc('renderEnded'), /<button|data-testid="btn-/, 'B5: the Ended block carries no buttons');
  assert.doesNotMatch(fnSrc('renderRunActions') + fnSrc('renderEnded'), /start-from|Start from this/);
});

test('page: the reuse card opens filled from the server\'s prefill, shows the server\'s estimate line, locks every box but the four open ones, and Start is "Sign & run"', () => {
  assert.match(PAGE, /document\.addEventListener\("bareloop-reuse"/);
  assert.doesNotMatch(PAGE, /start-from-check|sfRefreshLine|startfrom-line" \+ \(/, 'no "changed — new job" re-check: the locked boxes make it unreachable');
  assert.match(fnSrc('mainButtonFor'), /reuse \? "Sign & run" : "Start drafting"/);
  assert.match(PAGE, /sfLine\.textContent = pre\.line \|\| "";/, 'the line is the server\'s text, never built on the page');
  assert.match(PAGE, /if\(startFrom\) body\.startFrom = startFrom\.importId \? \{importId: startFrom\.importId\} : startFrom\.runid;/, 'the start request names the origin; the server refuses a changed locked box');
  assert.match(PAGE, /data-testid="startfrom-line"/);
  // Clear clears the reuse state (and unlocks), so an empty card never carries a stale origin or greyed boxes
  assert.match(fnSrc('resetCard'), /clearStartFrom\(\);\s*openNewCard\(\);/);
  assert.match(fnSrc('clearStartFrom'), /setReuseLocked\(false\)/);
});

test('page: setReuseLocked greys Name, Goal, Success, Guardrails, Judge examples and Check type — and never Source, Destination, Model or the caps', () => {
  const els = {};
  const mk = (id) => { els[id] = { id, readOnly: false, disabled: false, classes: new Set(), classList: { toggle(c, on) { if (on) els[id].classes.add(c); else els[id].classes.delete(c); } } }; return els[id]; };
  for (const id of ['jf-name', 'jf-goal', 'jf-source', 'jf-dest', 'jf-success', 'jf-guardrails', 'jf-judge', 'jf-cap-money', 'jf-cap-time', 'job-card', 'jf-model']) mk(id);
  const radios = [{ value: 'deterministic', disabled: false, checked: true }, { value: 'rubric', disabled: false, checked: false }];
  const doc = {
    getElementById: (id) => els[id],
    querySelectorAll: () => ({ forEach: (fn) => radios.forEach(fn) }),
    querySelector: () => radios.find((r) => r.checked) ?? null,
  };
  const modelSelect = els['jf-model'];
  // eslint-disable-next-line no-new-func
  const f = new Function('document', 'modelSelect', `var LOCKED_IDS = ["jf-name", "jf-goal", "jf-success", "jf-guardrails", "jf-judge"]; var OPEN_IDS = ["jf-source", "jf-dest", "jf-cap-money", "jf-cap-time", "jf-model"]; var reuseOn = false; var sessionLive = false;\n${fnSrc('syncCardLock')}\n${fnSrc('setReuseLocked')}\nreturn setReuseLocked;`)(doc, modelSelect);
  f(true);
  for (const id of ['jf-name', 'jf-goal', 'jf-success', 'jf-guardrails', 'jf-judge']) {
    assert.equal(els[id].readOnly, true, `${id} is read only`);
    assert.ok(els[id].classes.has('locked'), `${id} is greyed`);
  }
  for (const id of ['jf-source', 'jf-dest', 'jf-cap-money', 'jf-cap-time']) {
    assert.equal(els[id].readOnly, false, `${id} stays editable`);
    assert.equal(els[id].classes.has('locked'), false);
  }
  assert.ok(radios.every((r) => r.disabled), 'Check type is locked');
  assert.equal(modelSelect.disabled, false, 'Model is open on a reuse (hamr 2026-10-04)');
  assert.equal(modelSelect.classes.has('locked'), false);
  f(false);
  assert.ok(['jf-name', 'jf-goal', 'jf-success', 'jf-guardrails'].every((id) => !els[id].readOnly), 'unlocked again for Clear');
  assert.ok(radios.every((r) => !r.disabled) && !modelSelect.disabled);
  assert.equal(els['jf-judge'].disabled, true, 'deterministic: the rubric-only box is disabled as before');
});

test('page: a reuse session signs the hash the server prepared as soon as it is ready — one click (Sign & run), the server re-checks the hash', () => {
  assert.match(PAGE, /if\(reuseSession && !autoSigned && j\.state\.phase === "prepared" && j\.state\.specHash\)/);
  assert.match(PAGE, /"\/sign", \{specHash: j\.state\.specHash\}/);
  assert.match(PAGE, /signClickedOnce = reuseSession;/, 'a reuse session has no confirm turn, so the sign-prepare click is skipped');
  assert.match(PAGE, /reuseSession = r\.body\.reuse === true;/);
});
