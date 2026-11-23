// hamr 2026-11-23, live panel defect.
// B: Sign & run clicked right as drafting finished showed the raw "no plan is waiting for a decision right now".
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession } from '../src/panel/authorsession.js';
import { ANTH_CFG } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'early-sign-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const until = async (/** @type {() => any} */ fn, ms = 8000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 10); }); return fn(); };

const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look: { facts: [], prose: [], notFound: [] } } };
test('B: a Sign & run click before the plan is waiting says it in plain words; on the final card the first click is accepted (nothing left to confirm)', async () => {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const home = tmp('early-home-');
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 }); writeFileSync(join(home, 'config.json'), JSON.stringify(ANTH_CFG));
  /** @type {() => void} */ let release = () => {};
  const gate = new Promise((r) => { release = () => r(undefined); });
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'early-sign', jobText: '1. Summarise the latest release\n~ exactly 3 bullets', inputs: `Changelog: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionsRoot: tmp('early-sess-'),
    lookFn: async () => survey,
    pickGenerate: async (_m, tools) => { await tools[0].execute({ checks: [{ line: 1, guardrail: 1, rule: 'listItems', value: 3 }] }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.0009, unpricedRounds: 0 } }; },
    confirmGenerate: async (_c, tools) => { await tools[0].execute({ goal: 'g', checks: [], notChecked: [], questions: [] }); return { text: '', error: null, cost: 0.0005 }; },
    generate: async (_m, tools) => { await gate; await tools[0].execute({ edits: [] }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } }; },
  });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'), `${session.state.phase} / ${session.state.error}`);
  session.send('', 'agree');
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), `${session.state.phase} / ${session.state.error}`);
  assert.equal(session.signPrepare().ok, true);
  const early = /** @type {any} */ (session.signPrepare());
  assert.equal(early.ok, false);
  assert.match(early.error, /almost ready/);
  assert.doesNotMatch(early.error, /no plan is waiting/);
  release();
  assert.ok(await until(() => session.state.phase === 'prepared'), `${session.state.phase} ${session.state.error}`);
  assert.equal(session.signPrepare().ok, true);
  session.abandon();
});

// the page: click 1 kills the button until the server answers, so a raced second click never reaches a plan that is no longer waiting (the server's friendly words stay as the backstop)
import { readFileSync as readPage } from 'node:fs';
function fnSrc(/** @type {string} */ name, /** @type {string} */ PAGE) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
}
test('B page: doSign click 1 makes the button unclickable until the answer; a second click posts nothing', async () => {
  const PAGE = readPage(join(HERE, '../src/panel/index.html'), 'utf8');
  /** @type {any[]} */ const posts = [];
  /** @type {(v: any) => void} */ let answerIt = () => {};
  const src = `var sessionId = "s1", signClickedOnce = false, signBusy = false, sessionLive = true, lastState = {phase: "confirm", pendingAsk: {kind: "menu"}};
var startOk = true, whenLocked = false, sched = null; var seen = [];
function renderMain(){ seen.push(mainButtonFor({session: sessionLive, signClicked: signClickedOnce, signBusy: signBusy, phase: lastState.phase, pendingAsk: lastState.pendingAsk}, true, false).disabled); }
function chatPostOutcome(r){ return r; } function chatActionOk(){} function chatActionFailed(){} function poll(){}
${fnSrc('mainButtonFor', PAGE)}\n${fnSrc('doSign', PAGE)}
return { click: doSign, seen: seen, busy: function(){ return signBusy; }, once: function(){ return signClickedOnce; } };`;
  // eslint-disable-next-line no-new-func
  const api = new Function('authorPost', src)((/** @type {string} */ url) => { posts.push(url); return new Promise((r) => { answerIt = r; }); });
  api.click(); api.click();
  assert.equal(posts.length, 1, 'the second click posted nothing');
  assert.equal(api.seen.at(-1), true, 'the button is disabled while click 1 is on its way');
  answerIt({ ok: true });
  await new Promise((r) => { setTimeout(r, 5); });
  assert.equal(api.busy(), false);
  assert.equal(api.once(), true);
});
