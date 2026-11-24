// hamr 2026-11-24 (signed, ITEM33-BUILD "Part B", B): the plan card carries ONE line "Drafted in M:SS · $X", read from the drafting log
// (src/draftspend.js: the step times and the call lines' money).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import * as ds from '../src/draftspend.js';
import { createSession } from '../src/panel/authorsession.js';
import { makeRangeWorld } from './range-world.mjs';
import { world, keysHome, draftSeams, until, baseCard } from './flowtype-world.mjs';
import { gitInPatient } from './helpers.js';

const PAGE = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
/** @type {string[]} */ const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const T0 = Date.parse('2026-11-24T10:00:00.000Z');
const iso = (/** @type {number} */ secs) => new Date(T0 + secs * 1000).toISOString();
function logDir(/** @type {any[]} */ extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'draft-card-')); made.push(dir);
  const lines = [
    { kind: 'step-start', no: 0, id: 'setup', label: 'checking setup', at: iso(0) },
    { kind: 'step-end', no: 0, status: 'done', label: 'checking setup', at: iso(42) },
    { kind: 'step-start', no: 1, id: 'draft', label: 'drafting', at: iso(42) },
    { kind: 'call', no: 1, step: 'draft', label: 'draft', model: 'm', costUsd: 0.05, unpricedRounds: 0, at: iso(60) },
    { kind: 'call', no: 1, step: 'draft', label: 'draft#2', model: 'm', costUsd: 0.03, unpricedRounds: 0, at: iso(100) },
    { kind: 'step-end', no: 1, status: 'done', label: 'drafting', at: iso(134) },
    ...extra,
  ];
  writeFileSync(join(dir, 'draft-log.jsonl'), `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
  return dir;
}

test('B: draftedLine reads "Drafted in M:SS · $X" from the log (first start to last end, the calls\' money)', () => {
  assert.equal(ds.draftedLine(logDir()), 'Drafted in 2:14 · $0.08');
});

test('B: an unpriced call reads "at least", a log with no call and no time reads nothing (a Reuse has no drafting)', () => {
  const unpriced = logDir([{ kind: 'call', no: 1, step: 'draft', label: 'x', model: 'm', costUsd: null, unpricedRounds: 1, at: iso(120) }]);
  assert.equal(ds.draftedLine(unpriced), 'Drafted in 2:14 · at least $0.08');
  const empty = mkdtempSync(join(tmpdir(), 'draft-card-')); made.push(empty);
  assert.equal(ds.draftedLine(empty), null);
});

test('B, page: the plan bubble draws the server\'s line, once, and nothing when there is none', () => {
  const start = PAGE.indexOf('function renderMessages(');
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  const src = PAGE.slice(start, i + 1);
  const thread = { innerHTML: '', scrollTop: 0, scrollHeight: 0 };
  // eslint-disable-next-line no-new-func
  const render = new Function('thread', 'renderJobPlan', 'planControlHTML', 'chatWhoLabel', 'readoutHtml', 'escapeXml', `var lastMsgSig = null;\n${src}\nreturn renderMessages;`)(
    thread, () => '<PLAN/>', null, () => '', (r) => r.text, (s) => String(s));
  render({ messages: [{ role: 'bot', kind: 'plan', text: 'Sign & run to accept', plan: { questions: [] }, drafted: 'Drafted in 2:14 · $0.08' }] });
  assert.match(thread.innerHTML, /data-testid="plan-drafted">Drafted in 2:14 · \$0\.08</);
  assert.equal(thread.innerHTML.match(/plan-drafted/g).length, 1);
  render({ messages: [{ role: 'bot', kind: 'plan', text: 'Sign & run to accept', plan: { questions: [] } }] });
  assert.doesNotMatch(thread.innerHTML, /plan-drafted/);
});

test('B, session: the signed-ready plan message carries the line, from this session\'s own drafting log', async (t) => {
  const w = await world(t, { serve: false });
  const wr = makeRangeWorld(t);
  writeFileSync(path.join(wr.repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  gitInPatient(wr.repo, ['add', '-A']);
  gitInPatient(wr.repo, ['commit', '-q', '-m', 'pkg']);
  const seams = draftSeams({});
  const s = createSession(baseCard({ source: wr.repo }), { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot: path.join(w.base, 's'), ...seams });
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu'), `${s.state.phase} ${s.state.error}`);
  s.signPrepare();
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(s.state.phase)));
  assert.equal(s.state.phase, 'prepared', String(s.state.error));
  const plan = s.state.messages.findLast((m) => m.kind === 'plan');
  assert.match(String(plan?.drafted), /^Drafted in \d+:\d\d · /, JSON.stringify(plan?.drafted));
});
