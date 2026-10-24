// Self-review 2026-10-05 (hamr's ruling A): a panel session's drafting spend reaches DISK after every metered call
// (one `call` line in `<session dir>/draft-log.jsonl`; records ruling 2026-10-24 retired draft-spend.json) and the money
// readers count it when the session never became a run. A session folder left by the old shape (draft-spend.json, no call lines) still counts.
// Real files in a scratch home; no fs mocks; no provider is ever reachable (a scripted authorFn calls `onCall`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSession } from '../src/panel/authorsession.js';
import { readOrphanDraftSpends, DRAFT_LOG_FILE as LOG } from '../src/draftspend.js';
import { tallyCalls } from '../src/text.js';
import { monthSpend, spendSummary, checkMonthlyRoom } from '../src/monthly.js';
import { updateConfig } from '../src/config.js';
import { appendRun } from '../src/runlist.js';
import { keyRows } from '../src/providerrows.js';
import { ANTH_CFG } from './helpers.js';

/** @param {import('node:test').TestContext} t */
const tmp = (t) => {
  const d = mkdtempSync(join(tmpdir(), 'draft-spend-test-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const NOW = () => new Date(2026, 8, 15, 12, 0, 0).getTime(); // 15 Sep 2026 local
const localIso = (y, m, d, h = 12) => new Date(y, m, d, h, 0, 0).toISOString();
const git = (dir, args) => execFileSync('git', args, {
  cwd: dir, encoding: 'utf8',
  env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
});

/** a session dir under `<home>/panel-sessions/<id>` carrying ONE `call` line in its drafting log (the shape the session writes) */
function plantDraft(home, id, over = {}) {
  const dir = join(home, 'panel-sessions', id);
  mkdirSync(dir, { recursive: true });
  const o = { spentUsd: 1, spendComplete: true, provider: 'anthropic-api', baseUrl: null, model: 'claude-sonnet-5', startedAt: localIso(2026, 8, 10), ...over };
  writeFileSync(join(dir, LOG), `${JSON.stringify({
    kind: 'call', no: 0, step: 'draft', label: 'survey', model: o.model, provider: o.provider, baseUrl: o.baseUrl,
    costUsd: o.spentUsd, unpricedRounds: o.spendComplete ? 0 : 1, at: o.startedAt,
  })}\n`);
  return dir;
}

/** a session dir left by the OLD shape: a draft-spend.json and no call lines */
function plantLegacy(home, id, over = {}) {
  const dir = join(home, 'panel-sessions', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'draft-spend.json'), JSON.stringify({
    sessionId: id, spentUsd: 1, spendComplete: true, provider: 'anthropic-api', baseUrl: null, model: 'claude-sonnet-5',
    startedAt: localIso(2026, 8, 10), updatedAt: localIso(2026, 8, 10), ...over,
  }, null, 2));
  return dir;
}

/** drive a REAL session whose authorFn books `calls` through the session's own onCall, then refuses */
async function draftSession(t, calls, gapMs = 0) {
  const home = tmp(t);
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  writeFileSync(join(home, 'config.json'), JSON.stringify(ANTH_CFG));
  const repo = tmp(t);
  git(repo, ['init', '-q', '-b', 'main']);
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src', 'mod.js'), '// nothing yet\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'seed']);
  /** @type {any[]} */
  const seen = [];
  let sessionDir = '';
  const session = createSession({
    checkType: 'deterministic', model: 'claude-sonnet-5', jobName: 'draft-spend-job', jobText: 'fix things\n~ no new deps\ntsc clean', inputs: `repo: ${repo}`,
    destination: 'src/', capUsd: 2,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionsRoot: join(home, 'panel-sessions'),
    scout: { state: 'PRESENT', facts: { sourcePaths: ['src/mod.js'], testPaths: [] }, calls: [], raws: [] },
    generate: async () => { throw new Error('unused'); },
    confirmGenerate: async (_c, tools) => {
      const plan = { goal: 'fix things', checks: ['tsc clean'], questions: [], notChecked: [] };
      if (tools && tools[0] && typeof tools[0].execute === 'function') await tools[0].execute(plan);
      return { text: JSON.stringify(plan), error: null, cost: 0.0005 };
    },
    authorFn: async (o) => {
      for (const c of calls) {
        if (gapMs > 0) await new Promise((r) => { setTimeout(r, gapMs); });
        o.onCall(c);
        seen.push(readOrphanDraftSpends({ home, sessionsRoot: join(home, 'panel-sessions') }).find((d) => d.sessionId === basename(sessionDir)));
      }
      return { ok: false, stop: 'authoring-failed', refusal: { detail: 'scripted' } };
    },
  });
  sessionDir = session.state.outDir;
  // the confirm turn raises its menu; the person's Sign & run click releases the authoring call (the authorFn stub)
  for (let i = 0; i < 500 && session.state.pendingAsk?.kind !== 'menu'; i += 1) await new Promise((r) => { setTimeout(r, 10); });
  assert.equal(session.signPrepare().ok, true);
  for (let i = 0; i < 500 && !['refused', 'abandoned'].includes(session.state.phase); i += 1) await new Promise((r) => { setTimeout(r, 10); });
  return { home, session, seen, sessionDir };
}

test('onCall books the running total in the log after EVERY call; an unpriced call makes it "at least"; no draft-spend.json is written', async (t) => {
  const { session, seen, sessionDir } = await draftSession(t, [
    { label: 'survey', costUsd: 0.25, unpricedRounds: 0 },
    { label: 'declare', costUsd: 0.5, unpricedRounds: 0 },
    { label: 'confirm', costUsd: null, unpricedRounds: 0 },
  ]);
  assert.equal(session.state.phase, 'refused', String(session.state.error));
  assert.equal(seen.length, 3);
  assert.deepEqual(seen.map((s) => [s.spentUsd, s.spendComplete]), [[0.2505, true], [0.7505, true], [0.7505, false]]);
  assert.equal(seen[0].sessionId, basename(sessionDir));
  assert.equal(seen[0].provider, 'anthropic-api');
  assert.equal(seen[0].model, 'claude-sonnet-5');
  assert.equal(seen[2].startedAt, seen[0].startedAt, 'startedAt is fixed at the first call');
  // (0.0005 = the real confirm-turn call the session booked before the authoring calls)
  assert.equal(session.state.draftSpentUsd, 0.7505, 'one owner: the log folds to the same figure state carries');
  assert.equal(existsSync(join(sessionDir, 'draft-spend.json')), false, 'the second record is retired');
  assert.equal(existsSync(join(sessionDir, 'draft-spend.json.tmp')), false);
  // the sum equals what the old file carried: the same tally over the same calls
  const logged = readFileSync(join(sessionDir, LOG), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.kind === 'call');
  assert.equal(seen[2].spentUsd, tallyCalls(logged).knownUsd);
  assert.ok(logged.every((e) => e.provider === 'anthropic-api' && e.baseUrl === null), 'each call line carries the drafting identity');
});

test('startedAt keeps the FIRST metered call\'s timestamp across later calls (not re-dated to the last)', async (t) => {
  // calls are spaced apart so each reads a distinct real-clock ISO; same-millisecond calls cannot tell `??=` from `=`
  const { seen } = await draftSession(t, [
    { label: 'survey', costUsd: 0.1, unpricedRounds: 0 },
    { label: 'declare', costUsd: 0.1, unpricedRounds: 0 },
    { label: 'confirm', costUsd: 0.1, unpricedRounds: 0 },
  ], 15);
  assert.equal(seen.length, 3);
  assert.notEqual(seen[2].updatedAt, seen[0].updatedAt, 'the calls really read different clocks');
  assert.equal(seen[1].startedAt, seen[0].startedAt, 'startedAt is the first call\'s, kept by the second');
  assert.equal(seen[2].startedAt, seen[0].startedAt, 'startedAt is the first call\'s, kept by the third');
});

test('monthSpend counts an abandoned/refused session\'s draft spend; a restart (file, no live session) counts too', async (t) => {
  const { home } = await draftSession(t, [{ label: 'survey', costUsd: 0.4, unpricedRounds: 0 }]);
  // the real session started "now" (real clock) — read the month through the real clock
  const live = monthSpend({ home });
  assert.equal(live.usd, 0.4005); // 0.4 + the confirm turn's 0.0005
  assert.equal(live.atLeast, false);
  assert.equal(live.runs, 0, 'a draft is not a run');
  // a folder left by a panel that has since restarted: no live session object exists anywhere
  plantDraft(home, 'srestarted', { spentUsd: 1.5 });
  const m = monthSpend({ home, now: NOW });
  assert.equal(m.usd, 1.5, 'only the Sep file is in Sep (the real session is in the real month)');
  assert.equal(m.reservedUsd, 1.5);
});

test('monthSpend does NOT count a session that became a run (spine or patient inside its folder); a signed-but-never-listed one counts', (t) => {
  const home = tmp(t);
  const ran = plantDraft(home, 'sran', { spentUsd: 3 });
  const ranByPatient = plantDraft(home, 'spatient', { spentUsd: 5 });
  plantDraft(home, 'sspawnfail', { spentUsd: 0.7 });
  const spine = join(ran, 'source-seed', 'u-r1.jsonl');
  mkdirSync(join(ran, 'source-seed'), { recursive: true });
  writeFileSync(spine, `${JSON.stringify({ type: 'job-start', draftSpentUsd: 3 })}\n${JSON.stringify({ type: 'job-end', engagementSpentUsd: 1, spendComplete: true })}\n`);
  appendRun({ at: localIso(2026, 8, 10), runid: 'r1', job: 'j', spine, patient: null, via: 'run-u' }, { home });
  appendRun({ at: localIso(2026, 8, 10), runid: 'r2', job: 'j', spine: join(home, 'elsewhere.jsonl'), patient: join(ranByPatient, 'source-seed', 'tree'), via: 'run-u' }, { home });
  const m = monthSpend({ home, now: NOW });
  // r1 = 4 (spine; its draft 3 is inside), r2 = unreadable spine (atLeast), the never-listed session = 0.7
  assert.equal(m.usd, 4.7);
  assert.equal(m.atLeast, true, 'r2\'s spine is missing');
});

test('month attribution is startedAt; an other-month draft is not in this month but is in the all-time total', (t) => {
  const home = tmp(t);
  plantDraft(home, 'saug', { spentUsd: 9, startedAt: localIso(2026, 7, 31, 23), updatedAt: localIso(2026, 8, 1, 1) });
  plantDraft(home, 'ssep', { spentUsd: 2 });
  assert.equal(monthSpend({ home, now: NOW }).usd, 2);
  const s = spendSummary({ home, now: NOW });
  assert.equal(s.month.usd, 2);
  assert.equal(s.total.usd, 11);
});

test('spendSummary / Money attribute a draft to its provider row; spendComplete=false propagates "at least"; a draft never nulls a wall', (t) => {
  const home = tmp(t);
  plantDraft(home, 'sa', { spentUsd: 1.25 });
  plantDraft(home, 'sd', { spentUsd: 0.5, provider: 'openai-api', baseUrl: 'https://gw.example/v1', model: 'deepseek-flash', spendComplete: false });
  // a draft lands under the Providers ROW that served it (its key variable name); the second row is an OpenAI-shaped one at a typed address
  const rows = keyRows({ filled: ['ANTHROPIC_API_KEY', 'GW_KEY'], config: { keys: {
    ANTHROPIC_API_KEY: { shape: 'anthropic-api' }, GW_KEY: { shape: 'openai-api', baseUrl: 'https://gw.example/v1' } },
  models: { ANTHROPIC_API_KEY: [{ model: 'claude-sonnet-5', use: true, inPerM: 3, outPerM: 15 }], GW_KEY: [{ model: 'deepseek-flash', use: true, inPerM: 1, outPerM: 2 }] } } });
  const s = spendSummary({ home, now: NOW, rows });
  assert.equal(s.byProvider.ANTHROPIC_API_KEY.monthUsd, 1.25);
  assert.equal(s.byProvider.ANTHROPIC_API_KEY.monthAtLeast, false);
  assert.equal(s.byProvider.GW_KEY.monthUsd, 0.5);
  assert.equal(s.byProvider.GW_KEY.monthAtLeast, true);
  assert.equal(s.byProvider.ANTHROPIC_API_KEY.monthWallAtLeast, false);
  // and with no rows at all a run lands under its own shape, never a vendor name
  const bare = spendSummary({ home, now: NOW });
  assert.deepEqual(Object.keys(bare.byProvider).sort(), ['other:anthropic-api', 'other:openai-api @ https://gw.example/v1']);
  assert.equal(s.month.usd, 1.75);
  assert.equal(s.month.atLeast, true);
  assert.equal(monthSpend({ home, now: NOW }).atLeast, true);
});

test('checkMonthlyRoom refuses when abandoned-draft spend pushes the month over', (t) => {
  const home = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  assert.equal(checkMonthlyRoom({ capUsd: 10, home, now: NOW }).ok, true);
  plantDraft(home, 'sbig', { spentUsd: 6.5 });
  const room = checkMonthlyRoom({ capUsd: 4, home, now: NOW });
  assert.equal(room.ok, false);
  assert.equal(room.leftUsd, 3.5);
  assert.equal(checkMonthlyRoom({ capUsd: 3.5, home, now: NOW }).ok, true);
});

test('a legacy-only session (draft-spend.json, no call lines) is still counted exactly as the file says; the log wins once it has call lines', (t) => {
  const home = tmp(t);
  plantLegacy(home, 'sold', { spentUsd: 2.5 });
  plantLegacy(home, 'soldinc', { spentUsd: 0.5, spendComplete: false, provider: 'openai-api', baseUrl: 'https://gw.example/v1', model: 'deepseek-flash' });
  const dir = plantLegacy(home, 'sboth', { spentUsd: 9 });
  writeFileSync(join(dir, LOG), `${JSON.stringify({ kind: 'call', no: 0, label: 'a', costUsd: 0.25, unpricedRounds: 0, at: localIso(2026, 8, 10) })}\n`);
  mkdirSync(join(home, 'panel-sessions', 'sneither'), { recursive: true });
  const by = Object.fromEntries(readOrphanDraftSpends({ home }).map((d) => [d.sessionId, d]));
  assert.deepEqual(Object.keys(by).sort(), ['sboth', 'sold', 'soldinc']);
  assert.equal(by.sold.spentUsd, 2.5);
  assert.equal(by.soldinc.spendComplete, false);
  assert.equal(by.soldinc.model, 'deepseek-flash');
  assert.equal(by.sboth.spentUsd, 0.25, 'call lines beat a stale file');
  assert.equal(monthSpend({ home, now: NOW }).usd, 2.5 + 0.5 + 0.25);
});

test('a corrupt log never reads low as exact: a torn line makes it "at least"; torn lines with no readable call are unknown spend', (t) => {
  const home = tmp(t);
  const dir = plantDraft(home, 'storn', { spentUsd: 0.4 });
  writeFileSync(join(dir, LOG), `${readFileSync(join(dir, LOG), 'utf8')}{"kind":"call","no":0,"cost`);
  const onlyTorn = join(home, 'panel-sessions', 'sonlytorn');
  mkdirSync(onlyTorn, { recursive: true });
  writeFileSync(join(onlyTorn, LOG), '{"kind":"call","no"');
  const by = Object.fromEntries(readOrphanDraftSpends({ home }).map((d) => [d.sessionId, d]));
  assert.equal(by.storn.spentUsd, 0.4);
  assert.equal(by.storn.spendComplete, false);
  assert.equal(by.sonlytorn.spentUsd, 0);
  assert.equal(by.sonlytorn.spendComplete, false);
  assert.equal(monthSpend({ home }).atLeast, true);
});

test('a log of step events only (no call line, nothing torn) is no spend and is skipped', (t) => {
  const home = tmp(t);
  const dir = join(home, 'panel-sessions', 'ssteps');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, LOG), `${JSON.stringify({ kind: 'step-start', no: 0, id: 'x', label: 'x', at: localIso(2026, 8, 10) })}\n`);
  assert.deepEqual(readOrphanDraftSpends({ home }), []);
});

test('an unreadable draft-spend.json is unknown spend ("at least"), never silently $0 or dropped', (t) => {
  const home = tmp(t);
  const dir = join(home, 'panel-sessions', 'sbad');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'draft-spend.json'), '{not json');
  assert.equal(monthSpend({ home, now: NOW }).atLeast, true);
});

// ---- hamr 2026-10-06 (option A): the drafting LOG a run's first part is built from --------------------------------------
import { DRAFT_LOG_FILE, readDraftSteps } from '../src/draftspend.js';

/** @param {string} dir @returns {any[]} */
const readLog = (dir) => readFileSync(join(dir, DRAFT_LOG_FILE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

test('onCall appends ONE draft-log.jsonl line per metered call: the step running now, label, model, cost (null stays null), unpricedRounds', async (t) => {
  const { sessionDir } = await draftSession(t, [
    { label: 'author', costUsd: 0.25, unpricedRounds: 0 },
    { label: 'revise-1', costUsd: null, unpricedRounds: 0 },
    { label: 'judge:c1', costUsd: 0.1, unpricedRounds: 2 },
  ]);
  const calls = readLog(sessionDir).filter((e) => e.kind === 'call');
  // the session's own confirm-turn call (booked by the real confirm seam) comes first, then the three scripted ones
  assert.deepEqual(calls.map((c) => c.label).slice(-3), ['author', 'revise-1', 'judge:c1']);
  const mine = calls.slice(-3);
  assert.deepEqual(mine.map((c) => c.costUsd), [0.25, null, 0.1], 'unpriced stays null, never $0');
  assert.deepEqual(mine.map((c) => c.unpricedRounds), [0, 0, 2]);
  assert.ok(mine.every((c) => c.model === 'claude-sonnet-5' && c.step === 'draft'), 'the drafting model and the step running at call time');
  assert.ok(mine.every((c) => Number.isFinite(Date.parse(c.at))));
  assert.ok(calls.every((c) => Number.isInteger(c.no)));
  assert.equal(calls.length, 4, 'exactly one line per metered call (no second writer)');
});

test('the log carries each step\'s start and end time; readDraftSteps folds them with their calls', async (t) => {
  const { sessionDir, session } = await draftSession(t, [{ label: 'author', costUsd: 0.2, unpricedRounds: 0 }], 15);
  const steps = readDraftSteps(sessionDir);
  assert.deepEqual(steps.map((x) => x.id), session.state.steps.map((x) => x.id), 'one record per progress-list line, same order');
  const draft = steps.find((x) => x.id === 'draft');
  assert.ok(draft && draft.calls.length === 1 && draft.calls[0].label === 'author');
  const confirm = steps.find((x) => x.id === 'confirm');
  assert.equal(confirm?.calls.length, 1, 'the confirm turn\'s call sits under the confirm step');
  for (const x of steps.filter((y) => y.status === 'done')) {
    assert.ok(Number.isFinite(Date.parse(x.startedAt)) && x.endedAt !== null && x.wallMs !== null && x.wallMs >= 0, `${x.id} has start+end`);
  }
  assert.equal(steps.at(-1)?.status, 'failed', 'the refused session\'s last line failed, with its end time');
  assert.ok(draft.wallMs >= 15, 'the draft step spans the 15 ms gap the scripted call waited');
});

test('a disk fault on the drafting log never stops the draft (best-effort)', async (t) => {
  const home = tmp(t);
  const dir = join(home, 'no-such-session');
  const { appendDraftLog } = await import('../src/draftspend.js');
  assert.doesNotThrow(() => appendDraftLog(dir, { kind: 'call', no: 0, at: 'x' }));
  assert.equal(existsSync(dir), false);
});

/** a REAL session parked at the plan menu in `home`, its confirm call booked at $0.0005 (no provider reachable) */
async function sessionAtMenu(t, home, jobName) {
  const repo = tmp(t);
  git(repo, ['init', '-q', '-b', 'main']);
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src', 'mod.js'), '// nothing yet\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'seed']);
  const s = createSession({
    checkType: 'deterministic', model: 'claude-sonnet-5', jobName, jobText: 'fix things\n~ no new deps\ntsc clean', inputs: `repo: ${repo}`,
    destination: 'src/', capUsd: 2,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionsRoot: join(home, 'panel-sessions'),
    scout: { state: 'PRESENT', facts: { sourcePaths: ['src/mod.js'], testPaths: [] }, calls: [], raws: [] },
    generate: async () => { throw new Error('unused'); },
    confirmGenerate: async (_c, tools) => {
      const plan = { goal: 'fix things', checks: ['tsc clean'], questions: [], notChecked: [] };
      if (tools && tools[0] && typeof tools[0].execute === 'function') await tools[0].execute(plan);
      return { text: JSON.stringify(plan), error: null, cost: 0.0005 };
    },
    authorFn: async () => { throw new Error('never reached: the person revised at the menu'); },
  });
  for (let i = 0; i < 500 && s.state.pendingAsk?.kind !== 'menu'; i += 1) await new Promise((r) => { setTimeout(r, 10); });
  assert.equal(s.state.pendingAsk?.kind, 'menu');
  return s;
}

test('Revise at the plan menu (an abandon, then a fresh Start): the abandoned draft keeps its booked spend on disk and in the month, AFTER it has unwound and a second draft has run in the same home', async (t) => {
  const home = tmp(t);
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  writeFileSync(join(home, 'config.json'), JSON.stringify(ANTH_CFG));
  const first = await sessionAtMenu(t, home, 'revise-spend-job');
  const firstFile = () => readOrphanDraftSpends({ home }).find((d) => d.sessionId === basename(first.state.outDir));
  assert.equal(firstFile().spentUsd, 0.0005, 'booked before the abandon');
  assert.equal(first.abandon().ok, true);
  assert.equal(first.state.phase, 'abandoned');
  // the unwinding (a parked ask released, the confirm turn ending as confirm-abandoned) and any late writer get their turn BEFORE we read
  await new Promise((r) => { setTimeout(r, 150); });
  assert.equal(first.state.phase, 'abandoned', 'the unwind never moves an abandoned session to another phase');
  assert.equal(firstFile().spentUsd, 0.0005, 'the confirm call booked before the revise is still booked after it');
  // the fresh Start the Revise button leads to: a second session in the same home books its own call, the first one's stays
  const second = await sessionAtMenu(t, home, 'revise-spend-job-2');
  assert.notEqual(second.state.outDir, first.state.outDir, 'a fresh session, its own folder');
  assert.equal(firstFile().spentUsd, 0.0005, 'the second draft does not touch the abandoned one\'s figure');
  assert.equal(monthSpend({ home }).usd, 0.001, 'and the month counts both drafts');
  second.abandon();
});

test('readDraftSteps: a step-label record relabels the step without touching its status or times (the thinking row\'s "thought anyway")', (t) => {
  const dir = tmp(t);
  const lines = [
    { kind: 'step-start', no: 0, id: 'thinking', label: 'thinking off', at: '2026-10-11T10:00:00.000Z' },
    { kind: 'step-end', no: 0, status: 'done', label: 'thinking off', at: '2026-10-11T10:00:00.000Z' },
    { kind: 'step-label', no: 0, label: 'thinking on (the model thought anyway)', at: '2026-10-11T10:00:09.000Z' },
  ];
  writeFileSync(join(dir, DRAFT_LOG_FILE), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const [x] = readDraftSteps(dir);
  assert.equal(x.label, 'thinking on (the model thought anyway)');
  assert.equal(x.status, 'done');
  assert.equal(x.wallMs, 0, 'the relabel does not stretch the row\'s time');
});
