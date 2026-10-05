// hamr, live 2026-10-05: while a drafting session is live NOTHING on the job card is editable; and after a panel
// restart (dead token) the page says so in one line and stops polling. Page logic run from the page's own source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
}

const ALL = ['jf-name', 'jf-goal', 'jf-source', 'jf-dest', 'jf-success', 'jf-guardrails', 'jf-judge', 'jf-cap-money', 'jf-cap-time', 'jf-model'];
function harness() {
  const els = {};
  for (const id of [...ALL, 'job-card']) {
    els[id] = { id, readOnly: false, disabled: false, classes: new Set(), classList: { toggle(c, on) { if (on) els[id].classes.add(c); else els[id].classes.delete(c); } } };
  }
  const radios = [{ value: 'deterministic', disabled: false, checked: true }, { value: 'rubric', disabled: false, checked: false }];
  const doc = {
    getElementById: (id) => els[id],
    querySelectorAll: () => ({ forEach: (fn) => radios.forEach(fn) }),
    querySelector: () => radios.find((r) => r.checked) ?? null,
  };
  const st = { live: false };
  const src = `var LOCKED_IDS = ["jf-name", "jf-goal", "jf-success", "jf-guardrails", "jf-judge"]; var OPEN_IDS = ["jf-source", "jf-dest", "jf-cap-money", "jf-cap-time", "jf-model"]; var reuseOn = false; var sessionLive = false;
${fnSrc('syncCardLock')}\n${fnSrc('setReuseLocked')}
return { setReuseLocked, setLive: function(v){ sessionLive = v; syncCardLock(); } };`;
  // eslint-disable-next-line no-new-func
  const api = new Function('document', src)(doc);
  return { els, radios, api, st };
}
const lockedAll = (els) => ALL.every((id) => els[id].classes.has('locked') && (els[id].readOnly || id === 'jf-model'));

test('live session: every card field, the check-type radios and the Model menu are locked; unlocked again once no session is live', () => {
  const { els, radios, api } = harness();
  api.setLive(true);
  assert.ok(lockedAll(els), 'every field greyed + read only');
  assert.equal(els['jf-model'].disabled, true, 'Model menu disabled');
  assert.ok(radios.every((r) => r.disabled), 'check type locked');
  api.setLive(false); // abandon / refusal / error / reset all end here
  assert.ok(ALL.every((id) => !els[id].readOnly && !els[id].classes.has('locked')), 'editable again');
  assert.ok(radios.every((r) => !r.disabled) && !els['jf-model'].disabled);
});

test('reuse card: pre-start rule unchanged, fully locked while live, back to the reuse rule after a refusal', () => {
  const { els, radios, api } = harness();
  api.setReuseLocked(true);
  assert.ok(!els['jf-source'].readOnly && !els['jf-cap-money'].readOnly && els['jf-goal'].readOnly);
  api.setLive(true);
  assert.ok(lockedAll(els));
  api.setLive(false);
  assert.ok(!els['jf-source'].readOnly && !els['jf-dest'].readOnly && !els['jf-model'].disabled, 'refused start: reuse boxes open again');
  assert.ok(els['jf-goal'].readOnly && radios.every((r) => r.disabled), 'the reuse locks stay');
});

test('page wiring: the lock is synced wherever sessionLive changes (refreshStartEnabled), and attachSession goes live before it renders', () => {
  assert.match(fnSrc('refreshStartEnabled'), /syncCardLock\(\)/);
  const a = fnSrc('attachSession');
  assert.ok(a.indexOf('sessionLive = true') < a.indexOf('renderActions(st)'), 'renderActions -> refreshStartEnabled locks the card');
  assert.match(fnSrc('renderActions'), /sessionLive = CLIENT_TERMINAL_PHASES[^;]*;\s*refreshStartEnabled\(\)/);
  const d = fnSrc('doStart');
  assert.match(d, /sessionLive = true;\s*refreshStartEnabled\(\)/);
  assert.match(d, /sessionLive = false;\s*refreshStartEnabled\(\)/, 'a refused start unlocks');
  assert.match(fnSrc('openNewCard'), /sessionLive = false;[\s\S]*refreshStartEnabled\(\)/, 'reset/abandon unlocks');
});

