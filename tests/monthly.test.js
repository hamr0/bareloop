// PANEL-BUILD.md P4a item 2 — config.json (src/config.js), the monthly spend/limit
// (src/monthly.js), the ONE run-start seam (src/userrun.js `execute`) and the panel's
// two surfaces (cap note route, Sign refusal). Every test injects a scratch `home`;
// no provider is ever reachable (a scripted provider counts its calls — the refusal
// tests assert zero).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, utimesSync, readFileSync, rmSync, existsSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configPath, readConfig, updateConfig, ConfigError } from '../src/config.js';
import { readLegs, monthSpend, checkMonthlyRoom, monthlyRefusalText, legSpend, claimRun, settleDeadClaims } from '../src/monthly.js';
import { appendRun, appendRunEvent, readRunList, runlistPath, isLiveRunner } from '../src/runlist.js';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { startRun, resumeRun } from '../src/userrun.js';
import { createPanelServer } from '../src/panel/server.js';
import { signRun } from '../src/panel/authorroutes.js';
import { scriptedProvider } from './helpers.js';

/** @param {import('node:test').TestContext} t */
const tmp = (t) => {
  const d = mkdtempSync(join(tmpdir(), 'monthly-test-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};

// ---- config.js ---------------------------------------------------------------------------

test('config: missing file = defaults; write is atomic, mode 600, keeps unknown fields', (t) => {
  const home = tmp(t);
  assert.deepEqual(readConfig({ home }), { config: {}, exists: false, problem: null });
  writeFileSync(configPath(home), JSON.stringify({ futureField: { a: 1 } }));
  updateConfig({ monthlyLimitUsd: 20 }, { home });
  const got = JSON.parse(readFileSync(configPath(home), 'utf8'));
  assert.deepEqual(got, { futureField: { a: 1 }, monthlyLimitUsd: 20 });
  assert.equal(statSync(configPath(home)).mode & 0o777, 0o600);
});

test('config: keys merge per env name; null deletes; bad values are refused and nothing is written', (t) => {
  const home = tmp(t);
  updateConfig({ keys: { DEEPSEEK_API_KEY: { name: 'deepseek-flash', shape: 'openai-api', baseUrl: 'https://api.deepseek.com/v1' } } }, { home });
  updateConfig({ keys: { OPENAI_API_KEY: { name: 'gpt-x' }, DEEPSEEK_API_KEY: { name: 'deepseek-v4' } }, anthropicBalanceNote: 12.5 }, { home });
  assert.deepEqual(readConfig({ home }).config.keys, {
    DEEPSEEK_API_KEY: { name: 'deepseek-v4', shape: 'openai-api', baseUrl: 'https://api.deepseek.com/v1' },
    OPENAI_API_KEY: { name: 'gpt-x' },
  });
  updateConfig({ keys: { OPENAI_API_KEY: null }, monthlyLimitUsd: null }, { home });
  assert.deepEqual(Object.keys(readConfig({ home }).config.keys), ['DEEPSEEK_API_KEY']);
  const before = readFileSync(configPath(home), 'utf8');
  for (const bad of [
    { monthlyLimitUsd: 0 }, { monthlyLimitUsd: -3 }, { monthlyLimitUsd: 'x' }, { anthropicBalanceNote: -1 },
    { keys: { 'Bad Name': {} } }, { keys: { K: { shape: 'ollama' } } }, { keys: { K: { baseUrl: 'ftp://x' } } },
    { keys: { K: { name: 'two words' } } }, { keys: 'x' },
  ]) {
    assert.throws(() => updateConfig(bad, { home }), ConfigError, JSON.stringify(bad));
  }
  assert.equal(readFileSync(configPath(home), 'utf8'), before);
});

test('config: a key VALUE is refused in a name slot and anywhere else in the document (secret-shape sweep)', (t) => {
  const home = tmp(t);
  const secret = `sk-${'a'.repeat(30)}`;
  assert.throws(() => updateConfig({ keys: { OPENAI_API_KEY: { baseUrl: `https://x.example/${secret}` } } }, { home }), /never holds a key value/);
  assert.throws(() => updateConfig({ note: `oops ${secret}` }, { home }), /never holds a key value/);
  assert.equal(existsSync(configPath(home)), false, 'nothing written on a refusal');
});

test('config: an unreadable file is a reported problem; updateConfig refuses to overwrite it', (t) => {
  const home = tmp(t);
  writeFileSync(configPath(home), '{ not json');
  assert.match(readConfig({ home }).problem ?? '', /not readable JSON/);
  assert.throws(() => updateConfig({ monthlyLimitUsd: 5 }, { home }), ConfigError);
  assert.equal(readFileSync(configPath(home), 'utf8'), '{ not json', 'never clobbers what it cannot read');
});

// ---- monthly.js --------------------------------------------------------------------------

/** a spine on disk + its run-list row */
function addRun(home, dir, { runid, at, rounds = [], jobEnd, jobStart = {}, extra = {}, noSpine = false }) {
  const spine = join(dir, `u-${runid}.jsonl`);
  const recs = [{ type: 'job-start', job: 'j', ...jobStart }];
  for (const c of rounds) recs.push({ type: 'worker-round', costUsd: c });
  if (jobEnd) recs.push({ type: 'job-end', ...jobEnd });
  if (!noSpine) writeFileSync(spine, `${recs.map((r) => JSON.stringify(r)).join('\n')}\n`);
  appendRun({ at, runid, job: 'j', spine, patient: null, via: 'run-u', ...extra }, { home });
}
const localIso = (y, m, d, h = 12) => new Date(y, m, d, h, 0, 0).toISOString();
const NOW = () => new Date(2026, 8, 15, 12, 0, 0).getTime(); // 15 Sep 2026 local

test('legSpend: a leg is its engagement figure (never the chain fold); drafting counted on the first leg only; unpriced rounds = not complete', () => {
  assert.deepEqual(legSpend([{ type: 'job-start' }, { type: 'job-end', spentUsd: 9, engagementSpentUsd: 2, spendComplete: true }]), { usd: 2, complete: true });
  assert.deepEqual(legSpend([{ type: 'job-start', draftSpentUsd: 0.5 }, { type: 'job-end', spentUsd: 2, engagementSpentUsd: 2, spendComplete: true }]), { usd: 2.5, complete: true });
  assert.deepEqual(legSpend([{ type: 'job-start', draftSpentUsd: 0.5, priorSpentUsd: 1 }, { type: 'job-end', spentUsd: 3, engagementSpentUsd: 2, spendComplete: true }]), { usd: 2, complete: true }, 'a resumed leg does not recount drafting');
  assert.equal(legSpend([{ type: 'job-start', draftSpentUsd: 0.5, draftSpendComplete: false }, { type: 'job-end', engagementSpentUsd: 1, spendComplete: true }]).complete, false);
  assert.equal(legSpend([{ type: 'job-start' }, { type: 'worker-round', costUsd: null }, { type: 'job-end', engagementSpentUsd: 1, spendComplete: true }]).complete, false);
});

test('monthSpend: only this LOCAL calendar month counts (both boundaries); a died row counts its floor and makes the total "at least"', (t) => {
  const home = tmp(t);
  const d = tmp(t);
  addRun(home, d, { runid: 'a', at: localIso(2026, 8, 1, 0), jobEnd: { engagementSpentUsd: 1, spendComplete: true } }); // first instant of Sep
  addRun(home, d, { runid: 'b', at: localIso(2026, 7, 31, 23), jobEnd: { engagementSpentUsd: 100, spendComplete: true } }); // Aug — out
  addRun(home, d, { runid: 'c', at: localIso(2026, 9, 1, 0), jobEnd: { engagementSpentUsd: 100, spendComplete: true } }); // Oct — out
  const clean = monthSpend({ home, now: NOW });
  assert.deepEqual(clean, { usd: 1, atLeast: false, runs: 1, reservedUsd: 1 });
  addRun(home, d, { runid: 'died', at: localIso(2026, 8, 10), rounds: [0.4, 0.3] }); // no job-end
  assert.deepEqual(monthSpend({ home, now: NOW }), { usd: 1.7, atLeast: true, runs: 2, reservedUsd: 1.7 });
});

test('monthSpend: a listed run whose spine file is gone reads as unknown ("at least"), never silently $0-and-exact', (t) => {
  const home = tmp(t);
  appendRun({ at: localIso(2026, 8, 3), runid: 'gone', job: 'j', spine: join(home, 'nope.jsonl'), patient: null, via: 'run-u' }, { home });
  assert.deepEqual(monthSpend({ home, now: NOW }), { usd: 0, atLeast: true, runs: 1, reservedUsd: 0 });
});

test('checkMonthlyRoom: no limit = ok, no check; cap == left = ok; cap > left = refused with the exact text; whole-cent compare', (t) => {
  const home = tmp(t);
  const d = tmp(t);
  assert.deepEqual(checkMonthlyRoom({ capUsd: 999, home, now: NOW }), { ok: true, leftUsd: null, limitUsd: null, atLeast: false });
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  addRun(home, d, { runid: 'a', at: localIso(2026, 8, 2), jobEnd: { engagementSpentUsd: 6.5, spendComplete: true } });
  const eq = checkMonthlyRoom({ capUsd: 3.5, home, now: NOW });
  assert.equal(eq.ok, true);
  assert.equal(monthlyRefusalText(eq), null);
  const over = checkMonthlyRoom({ capUsd: 3.51, home, now: NOW });
  assert.equal(over.ok, false);
  assert.equal(over.leftUsd, 3.5);
  assert.equal(monthlyRefusalText(over), 'Max $3.50 (monthly limit)');
  // limit fully used: left is 0, never negative
  updateConfig({ monthlyLimitUsd: 5 }, { home });
  assert.equal(monthlyRefusalText(checkMonthlyRoom({ capUsd: 1, home, now: NOW })), 'Max $0.00 (monthly limit)');
});

test('checkMonthlyRoom: a non-finite cap never fits (NaN / Infinity are refused, not read as $0)', (t) => {
  const home = tmp(t);
  updateConfig({ monthlyLimitUsd: 5 }, { home });
  for (const capUsd of [Infinity, NaN]) assert.equal(checkMonthlyRoom({ capUsd, home, now: NOW }).ok, false);
  assert.equal(checkMonthlyRoom({ capUsd: 5, home, now: NOW }).ok, true);
});

test('checkMonthlyRoom: an incomplete month total travels as atLeast; an unreadable config.json throws (never reads as "no limit")', (t) => {
  const home = tmp(t);
  const d = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  addRun(home, d, { runid: 'died', at: localIso(2026, 8, 2), rounds: [2] });
  assert.equal(checkMonthlyRoom({ capUsd: 1, home, now: NOW }).atLeast, true);
  writeFileSync(configPath(home), '{ broken');
  assert.throws(() => checkMonthlyRoom({ capUsd: 1, home, now: NOW }), ConfigError);
});

test('checkMonthlyRoom: an IN-FLIGHT run (no job-end, fresh spine) counts at its full leg cap; stale (died) counts its floor; finished counts its spend', (t) => {
  const home = tmp(t);
  const d = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  const nowMs = NOW();
  const age = (runid, ms) => { const f = join(d, `u-${runid}.jsonl`); utimesSync(f, new Date(nowMs - ms), new Date(nowMs - ms)); };
  addRun(home, d, { runid: 'live', at: localIso(2026, 8, 15, 11), rounds: [0.05], jobStart: { budgetUsd: 6 } });
  age('live', 60 * 1000);
  const room = checkMonthlyRoom({ capUsd: 6, home, now: NOW });
  assert.equal(room.ok, false, 'left is $4 once the running $6 cap is reserved');
  assert.equal(monthlyRefusalText(room), 'Max $4.00 (monthly limit)');
  assert.equal(checkMonthlyRoom({ capUsd: 4, home, now: NOW }).ok, true);
  const sp = monthSpend({ home, now: NOW });
  assert.equal(sp.usd, 0.05, 'real spend stays the floor');
  assert.equal(sp.reservedUsd, 6);
  // a resumed leg reserves only the remainder of the signed cap
  addRun(home, d, { runid: 'leg2', at: localIso(2026, 8, 15, 11), rounds: [0.5], jobStart: { budgetUsd: 3, priorSpentUsd: 1 } });
  age('leg2', 60 * 1000);
  assert.equal(monthSpend({ home, now: NOW }).reservedUsd, 8);
  // same first spine, stale by the panel's died rule: counts its floor, the $6 run fits
  age('live', 10 * 60 * 1000 + 1000);
  age('leg2', 10 * 60 * 1000 + 1000);
  assert.equal(monthSpend({ home, now: NOW }).reservedUsd, 0.55);
  assert.equal(checkMonthlyRoom({ capUsd: 6, home, now: NOW }).ok, true);
});

/** a pid that belonged to a bareloop-looking runner and is now gone */
async function deadRunnerPid(t) {
  const pid = spawnRunner(t);
  await new Promise((r) => setTimeout(r, 200));
  await killAndWait(pid);
  return pid;
}

test('a resume fits: its killed leg (pid gone) counts its real spend, never its unspent cap — $12 limit, $3 of $10 spent, resume 7 -> ok, $9 left', async (t) => {
  const home = tmp(t);
  const d = tmp(t);
  updateConfig({ monthlyLimitUsd: 12 }, { home });
  const pid = await deadRunnerPid(t);
  addRun(home, d, { runid: 'killed', at: localIso(2026, 8, 15, 11), rounds: [3], jobStart: { budgetUsd: 10 }, extra: { pid, capUsd: 10 } });
  utimesSync(join(d, 'u-killed.jsonl'), new Date(NOW() - 3 * 60 * 1000), new Date(NOW() - 3 * 60 * 1000));
  const ok = checkMonthlyRoom({ capUsd: 7, home, now: NOW });
  assert.equal(ok.ok, true);
  assert.equal(ok.leftUsd, 9);
  assert.equal(monthSpend({ home, now: NOW }).usd, 3, 'real spend still counts in full');
  // another LIVE run stays held at its full cap
  const live = spawnRunner(t);
  await new Promise((r) => setTimeout(r, 200));
  addRun(home, d, { runid: 'other', at: localIso(2026, 8, 15, 11), rounds: [], jobStart: { budgetUsd: 6 }, extra: { pid: live, capUsd: 6 } });
  const two = checkMonthlyRoom({ capUsd: 7, home, now: NOW });
  assert.equal(two.ok, false);
  assert.equal(two.leftUsd, 3);
});

test('chained resume: leg1 and leg2 both killed (pids gone) -> leg3 fits ($12 limit, floors 3+1, leg3 cap 6 -> ok, $8 left)', async (t) => {
  const home = tmp(t);
  const d = tmp(t);
  updateConfig({ monthlyLimitUsd: 12 }, { home });
  const p1 = await deadRunnerPid(t);
  const p2 = await deadRunnerPid(t);
  addRun(home, d, { runid: 'leg1', at: localIso(2026, 8, 15, 10), rounds: [3], jobStart: { budgetUsd: 10 }, extra: { pid: p1, capUsd: 10 } });
  addRun(home, d, { runid: 'leg2', at: localIso(2026, 8, 15, 11), rounds: [1], jobStart: { budgetUsd: 10, priorSpentUsd: 3 }, extra: { pid: p2, capUsd: 7 } });
  const room = checkMonthlyRoom({ capUsd: 6, home, now: NOW });
  assert.equal(room.ok, true);
  assert.equal(room.leftUsd, 8);
});

test('a resume that truly does not fit is still refused', async (t) => {
  const home = tmp(t);
  const d = tmp(t);
  updateConfig({ monthlyLimitUsd: 8 }, { home });
  const pid = await deadRunnerPid(t);
  addRun(home, d, { runid: 'killed', at: localIso(2026, 8, 15, 11), rounds: [3], jobStart: { budgetUsd: 10 }, extra: { pid, capUsd: 10 } });
  const room = checkMonthlyRoom({ capUsd: 7, home, now: NOW });
  assert.equal(room.ok, false);
  assert.equal(monthlyRefusalText(room), 'Max $5.00 (monthly limit)');
});

test('checkMonthlyRoom: a finished run counts its spend only, never its cap', (t) => {
  const home = tmp(t);
  const d = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  addRun(home, d, { runid: 'done', at: localIso(2026, 8, 15, 11), rounds: [0.05], jobStart: { budgetUsd: 6 }, jobEnd: { engagementSpentUsd: 0.05, spendComplete: true } });
  utimesSync(join(d, 'u-done.jsonl'), new Date(NOW()), new Date(NOW()));
  assert.equal(monthSpend({ home, now: NOW }).reservedUsd, 0.05);
  assert.equal(checkMonthlyRoom({ capUsd: 9.95, home, now: NOW }).ok, true);
});

test('checkMonthlyRoom: monthlyLimitUsd absent or null = no limit; present but not a number above 0 throws ConfigError naming the value and the file', (t) => {
  const home = tmp(t);
  writeFileSync(configPath(home), '{}');
  assert.equal(checkMonthlyRoom({ capUsd: 5, home, now: NOW }).limitUsd, null, 'absent');
  writeFileSync(configPath(home), '{"monthlyLimitUsd":null}');
  assert.equal(checkMonthlyRoom({ capUsd: 5, home, now: NOW }).limitUsd, null, 'null');
  for (const [raw, shown] of [['"50"', '"50"'], ['-5', '-5'], ['0', '0'], ['1e400', 'Infinity'], ['true', 'true'], ['{}', '{}'], ['""', '""']]) {
    writeFileSync(configPath(home), `{"monthlyLimitUsd":${raw}}`);
    assert.throws(() => checkMonthlyRoom({ capUsd: 5, home, now: NOW }), (e) => e instanceof ConfigError && e.message.includes(configPath(home)) && e.message.includes(`monthlyLimitUsd = ${shown}`), raw);
  }
});

// ---- the run-start seam (execute) ---------------------------------------------------------

const git = (/** @type {string} */ cwd, /** @type {string[]} */ args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const CLOSE_SOURCE = "console.log('FIXTURE judged=1');\nprocess.exit(1);\n";

/** run-u start against a scratch home; returns what happened + how many provider calls */
async function runU(t, { home, budgetUsd, manifest }) {
  // `manifest` (raw text) = a source.json beside the tree, the way the source door leaves one
  const parent = tmp(t);
  const workdir = manifest === undefined ? tmp(t) : join(parent, 'tree');
  if (manifest !== undefined) { mkdirSync(workdir); writeFileSync(join(parent, 'source.json'), manifest); }
  mkdirSync(join(workdir, 'src'), { recursive: true });
  writeFileSync(join(workdir, 'src', 'mod.mjs'), 'export const x = 1;\n');
  git(workdir, ['init', '-q']);
  git(workdir, ['config', 'user.email', 'monthly-test@example.com']);
  git(workdir, ['config', 'user.name', 'monthly-test']);
  git(workdir, ['add', '.']);
  git(workdir, ['commit', '-q', '-m', 'seed']);
  const seed = git(workdir, ['rev-parse', 'HEAD']);
  const scripts = tmp(t);
  const closePath = join(scripts, 'close.mjs');
  writeFileSync(closePath, CLOSE_SOURCE);
  const spec = {
    schema: 'job-v1', job: 'monthly-seam-fixture', description: 'P4a item 2 seam fixture.',
    provider: 'anthropic-api', cadence: { unit: 'day', every: 1 }, budgetUsd, maxWallMs: 1_800_000,
    writeScope: ['src/**'], goal: 'Append MARKER_OK to src/mod.mjs.', verdictType: 'green',
    close: [{ name: 'has-marker', cmd: `node ${closePath} has-marker`, expect: 0, sha256: hashCloseScriptBytes(CLOSE_SOURCE) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
  };
  const provider = scriptedProvider([{ text: 'scout: nothing' }, { text: JSON.stringify({ schema: 'plan-v1', steps: [] }) }, { text: 'x' }]);
  let providerCalls = 0;
  const counted = { ...provider, generate: async (...a) => { providerCalls += 1; return provider.generate(...a); } };
  /** @type {string[]} */ const errs = [];
  let code = null;
  try {
    code = await startRun(spec, {
      workdir, seed, spineName: 'monthly-seam-fixture-bareloop', approve: jobSpecHash(spec),
      deps: { provider: counted, env: {}, out: () => {}, err: (s) => errs.push(s), runlistHome: home },
    });
  } catch { code = 'threw'; }
  return { code, errs: errs.join('\n'), providerCalls, workdir, spec, seed };
}

test('run-start seam: a cap over what is left this month REFUSES with the exact text, spends nothing (zero provider calls), writes no run-list row', async (t) => {
  const home = tmp(t);
  const d = tmp(t);
  const now = new Date();
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  addRun(home, d, { runid: 'prev', at: now.toISOString(), jobEnd: { engagementSpentUsd: 6.5, spendComplete: true } });
  const r = await runU(t, { home, budgetUsd: 3.51 });
  assert.equal(r.code, 2);
  assert.match(r.errs, /^Max \$3\.50 \(monthly limit\)$/m);
  assert.equal(r.providerCalls, 0, 'a refusal spends nothing — the provider is never called');
  assert.equal(readRunList({ home }).rows.length, 1, 'no row for the refused run');
});

test('run-start seam: cap == what is left starts (reaches the provider); no limit set starts', async (t) => {
  const home = tmp(t);
  const d = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  addRun(home, d, { runid: 'prev', at: new Date().toISOString(), jobEnd: { engagementSpentUsd: 6.5, spendComplete: true } });
  const ok = await runU(t, { home, budgetUsd: 3.5 });
  assert.doesNotMatch(ok.errs, /monthly limit/);
  assert.ok(ok.providerCalls > 0, 'a fitting cap reaches the provider');
  const home2 = tmp(t);
  const none = await runU(t, { home: home2, budgetUsd: 3.5 });
  assert.doesNotMatch(none.errs, /monthly limit/);
});

test('run-start seam: a claimed run that exits at $0 before its spine exists (throwing prepareTree) is RELEASED — no ghost row, the month is exact', async (t) => {
  const home = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  const workdir = tmp(t);
  writeFileSync(join(workdir, 'a.txt'), 'x\n');
  git(workdir, ['init', '-q']);
  git(workdir, ['config', 'user.email', 'monthly-test@example.com']);
  git(workdir, ['config', 'user.name', 'monthly-test']);
  git(workdir, ['add', '.']);
  git(workdir, ['commit', '-q', '-m', 'seed']);
  const seed = git(workdir, ['rev-parse', 'HEAD']);
  const scripts = tmp(t);
  const closePath = join(scripts, 'close.mjs');
  writeFileSync(closePath, CLOSE_SOURCE);
  const spec = {
    schema: 'job-v1', job: 'monthly-ghost-fixture', description: 'ghost row fixture.',
    provider: 'anthropic-api', cadence: { unit: 'day', every: 1 }, budgetUsd: 2, maxWallMs: 1_800_000,
    writeScope: ['src/**'], goal: 'Append MARKER_OK to src/mod.mjs.', verdictType: 'green',
    close: [{ name: 'has-marker', cmd: `node ${closePath} has-marker`, expect: 0, sha256: hashCloseScriptBytes(CLOSE_SOURCE) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
  };
  const bundleDir = tmp(t);
  const runDir = join(bundleDir, 'runs', 'r-ghost');
  const bundle = { runid: 'r-ghost', runDir, invoke: 'bareloop run /b', tightened: {}, signedBudgetUsd: 1, printApprove: 'H', prepareTree: () => { throw new Error('worktree add failed'); } };
  await assert.rejects(startRun(spec, {
    workdir, seed, spineName: 'unused', approve: jobSpecHash(spec), bundle,
    deps: { provider: scriptedProvider([{ text: 'never' }]), env: {}, out: () => {}, err: () => {}, runlistHome: home },
  }), /worktree add failed/, 'the original failure is what surfaces');
  const list = readRunList({ home });
  assert.equal(list.rows.length, 0, 'the never-started run is folded out of the list');
  assert.ok(list.events.some((e) => e.type === 'released' && e.runid === 'r-ghost' && e.reason === 'not started'));
  assert.ok(!existsSync(join(runDir, 'spine.jsonl')));
  const m = monthSpend({ home });
  assert.equal(m.atLeast, false);
  assert.equal(m.runs, 0);
});

test('run-start seam: a $0 refusal AFTER the spine exists (SOURCE-MANIFEST-RED, DESTINATION-RED) RELEASES the claim — no ghost row, the month is exact', async (t) => {
  for (const [manifest, red] of [['not json{{{', /SOURCE-MANIFEST-RED/], [JSON.stringify({ destination: 'relative/out' }), /DESTINATION-RED/]]) {
    const home = tmp(t);
    updateConfig({ monthlyLimitUsd: 10 }, { home });
    const r = await runU(t, { home, budgetUsd: 2, manifest });
    assert.equal(r.code, 1);
    assert.match(r.errs, red);
    assert.equal(r.providerCalls, 0);
    const list = readRunList({ home });
    assert.equal(list.rows.length, 0, `${red}: the refused run is folded out of the list`);
    assert.equal(list.events.filter((e) => e.type === 'released').length, 1);
    const m = monthSpend({ home });
    assert.equal(m.atLeast, false);
    assert.equal(m.runs, 0);
  }
});

test('run-start seam: a claimed --resume refused at the patient (moved HEAD) is RELEASED too', async (t) => {
  const home = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  // a fixture patient with a hand-written cap-halted leg-1 spine (the shape hitl-u.test.js also uses), then a
  // human commit: HEAD moves, so the reconstruction's premise (this tree is where the run left it) is gone
  const first = await runU(t, { home: tmp(t), budgetUsd: 2 }); // its own scratch home: only the fixture patient is wanted
  const spineDir = tmp(t);
  const dead = join(spineDir, 'u-dead1.jsonl');
  const at = new Date().toISOString();
  writeFileSync(dead, [
    { type: 'job-start', job: first.spec.job, specHash: jobSpecHash(first.spec), budgetUsd: 2, shape: 'plan', goal: first.spec.goal, ts: at, seq: 1 },
    { type: 'plan-accepted', plan: { schema: 'plan-v1', steps: [{ id: 's1' }] }, ts: at, seq: 2 },
    { type: 'worker-round', kind: 'turn', costUsd: 0.5, ts: at, seq: 3 },
    { type: 'job-end', outcome: 'cap-halt', spentUsd: 0.5, spendComplete: true, ts: at, seq: 4 },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
  writeFileSync(join(first.workdir, 'human.txt'), 'x\n');
  git(first.workdir, ['add', '.']);
  git(first.workdir, ['commit', '-q', '-m', 'human']);
  /** @type {string[]} */ const errs = [];
  const code = await resumeRun(dead, {
    spec: first.spec, workdir: first.workdir, seed: first.seed, spineName: 'monthly-seam-fixture-bareloop', approve: jobSpecHash(first.spec),
    deps: { provider: scriptedProvider([{ text: 'never' }]), env: {}, out: () => {}, err: (s) => errs.push(s), runlistHome: home },
  });
  assert.equal(code, 2, errs.join('\n'));
  assert.match(errs.join('\n'), /PATIENT REFUSED/);
  const list = readRunList({ home });
  assert.equal(list.rows.length, 0, 'the refused resume is folded out of the list');
  assert.equal(list.events.filter((e) => e.type === 'released' && e.reason === 'not started').length, 1);
});

test('run-start seam, NO monthly limit: a throwing prepareTree leaves no row (the row is appended after it)', async (t) => {
  const home = tmp(t); // no limit set: the row goes through appendRun, not a claim
  const workdir = tmp(t);
  writeFileSync(join(workdir, 'a.txt'), 'x\n');
  git(workdir, ['init', '-q']);
  git(workdir, ['config', 'user.email', 'monthly-test@example.com']);
  git(workdir, ['config', 'user.name', 'monthly-test']);
  git(workdir, ['add', '.']);
  git(workdir, ['commit', '-q', '-m', 'seed']);
  const seed = git(workdir, ['rev-parse', 'HEAD']);
  const scripts = tmp(t);
  const closePath = join(scripts, 'close.mjs');
  writeFileSync(closePath, CLOSE_SOURCE);
  const spec = {
    schema: 'job-v1', job: 'monthly-ghost-nolimit', description: 'ghost row fixture.',
    provider: 'anthropic-api', cadence: { unit: 'day', every: 1 }, budgetUsd: 2, maxWallMs: 1_800_000,
    writeScope: ['src/**'], goal: 'Append MARKER_OK to src/mod.mjs.', verdictType: 'green',
    close: [{ name: 'has-marker', cmd: `node ${closePath} has-marker`, expect: 0, sha256: hashCloseScriptBytes(CLOSE_SOURCE) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
  };
  const runDir = join(tmp(t), 'runs', 'r-ghost2');
  const bundle = { runid: 'r-ghost2', runDir, invoke: 'bareloop run /b', tightened: {}, signedBudgetUsd: 1, printApprove: 'H', prepareTree: () => { throw new Error('worktree add failed'); } };
  await assert.rejects(startRun(spec, {
    workdir, seed, spineName: 'unused', approve: jobSpecHash(spec), bundle,
    deps: { provider: scriptedProvider([{ text: 'never' }]), env: {}, out: () => {}, err: () => {}, runlistHome: home },
  }), /worktree add failed/);
  const list = readRunList({ home });
  assert.equal(list.rows.length, 0, 'no listed row for a run that never started');
  assert.ok(!existsSync(join(runDir, 'spine.jsonl')));
});

test('run-start seam, NO monthly limit: a --resume refused at the patient (moved HEAD) RELEASES its listed row', async (t) => {
  const home = tmp(t); // no limit set
  const first = await runU(t, { home: tmp(t), budgetUsd: 2 });
  const spineDir = tmp(t);
  const dead = join(spineDir, 'u-dead2.jsonl');
  const at = new Date().toISOString();
  writeFileSync(dead, [
    { type: 'job-start', job: first.spec.job, specHash: jobSpecHash(first.spec), budgetUsd: 2, shape: 'plan', goal: first.spec.goal, ts: at, seq: 1 },
    { type: 'plan-accepted', plan: { schema: 'plan-v1', steps: [{ id: 's1' }] }, ts: at, seq: 2 },
    { type: 'worker-round', kind: 'turn', costUsd: 0.5, ts: at, seq: 3 },
    { type: 'job-end', outcome: 'cap-halt', spentUsd: 0.5, spendComplete: true, ts: at, seq: 4 },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
  writeFileSync(join(first.workdir, 'human.txt'), 'x\n');
  git(first.workdir, ['add', '.']);
  git(first.workdir, ['commit', '-q', '-m', 'human']);
  /** @type {string[]} */ const errs = [];
  const code = await resumeRun(dead, {
    spec: first.spec, workdir: first.workdir, seed: first.seed, spineName: 'monthly-seam-fixture-bareloop', approve: jobSpecHash(first.spec),
    deps: { provider: scriptedProvider([{ text: 'never' }]), env: {}, out: () => {}, err: (s) => errs.push(s), runlistHome: home },
  });
  assert.equal(code, 2, errs.join('\n'));
  assert.match(errs.join('\n'), /PATIENT REFUSED/);
  const list = readRunList({ home });
  assert.equal(list.rows.length, 0, 'the refused resume is folded out of the list');
  assert.equal(list.events.filter((e) => e.type === 'released' && e.reason === 'not started').length, 1);
});

test('run-start seam: an unreadable config.json refuses the start ($0) rather than reading as "no limit"', async (t) => {
  const home = tmp(t);
  writeFileSync(configPath(home), '{ broken');
  const r = await runU(t, { home, budgetUsd: 1 });
  assert.equal(r.code, 2);
  assert.match(r.errs, /not readable JSON.*Nothing spent/);
  assert.equal(r.providerCalls, 0);
});

// ---- the panel -----------------------------------------------------------------------------

test('panel: GET /api/author/monthly-check returns the SAME refusal text (needs the token); under the limit returns null', async (t) => {
  const home = tmp(t);
  const d = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  addRun(home, d, { runid: 'prev', at: new Date().toISOString(), jobEnd: { engagementSpentUsd: 6.5, spendComplete: true } });
  const { port, token, close } = await createPanelServer({ port: 0, home, env: {}, sessionsRoot: tmp(t) });
  t.after(() => close());
  const base = `http://127.0.0.1:${port}`;
  const over = await (await fetch(`${base}/api/author/monthly-check?cap=4`, { headers: { 'x-bareloop-token': token } })).json();
  assert.equal(over.refusal, 'Max $3.50 (monthly limit)');
  const fits = await (await fetch(`${base}/api/author/monthly-check?cap=3.5`, { headers: { 'x-bareloop-token': token } })).json();
  assert.equal(fits.refusal, null);
  const blank = await (await fetch(`${base}/api/author/monthly-check?cap=`, { headers: { 'x-bareloop-token': token } })).json();
  assert.equal(blank.refusal, null);
  assert.equal((await fetch(`${base}/api/author/monthly-check?cap=4`)).status, 403);
});

test('panel: Sign & run is refused server-side over the limit — spawnFn never called, session stays prepared; a fitting cap signs', (t) => {
  const home = tmp(t);
  const d = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  addRun(home, d, { runid: 'prev', at: new Date().toISOString(), jobEnd: { engagementSpentUsd: 6.5, spendComplete: true } });
  const outDir = tmp(t);
  const specPath = join(outDir, 'resolved-spec.json');
  let spawns = 0;
  const spawnFn = () => { spawns += 1; return { unref: () => {} }; };
  const mk = () => ({ state: { phase: 'prepared', specHash: 'h1', resolvedSpecPath: specPath, outDir, messages: [] } });
  writeFileSync(specPath, JSON.stringify({ budgetUsd: 3.51 }));
  const s1 = mk();
  const r1 = signRun(s1, 'h1', { env: {}, spawnFn, bareloopBin: '/x/bareloop.mjs', home });
  assert.deepEqual(r1, { ok: false, error: 'Max $3.50 (monthly limit)' });
  assert.equal(spawns, 0);
  assert.equal(s1.state.phase, 'prepared');
  writeFileSync(specPath, JSON.stringify({ budgetUsd: 3.5 }));
  const s2 = mk();
  assert.equal(signRun(s2, 'h1', { env: {}, spawnFn, bareloopBin: '/x/bareloop.mjs', home }).ok, true);
  assert.equal(spawns, 1);
});

test('panel page: the monthly note sits directly under #jf-cap-money (same field), and the page asks the one server route for its text', () => {
  const html = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
  assert.match(html, /<input id="jf-cap-money" type="text">\s*<div class="hint" id="jf-cap-note"/);
  assert.match(html, /\/api\/author\/monthly-check\?cap=/);
});

// ---- rule 2: hold-until-done — a run is held while its PID is a live bareloop runner ----------

/** a real child that looks like a bareloop runner (its argv names bareloop.mjs); the test kills it by PID */
function spawnRunner(t, argv0 = 'bareloop.mjs') {
  const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', argv0], { stdio: 'ignore' });
  t.after(() => { try { process.kill(/** @type {number} */ (c.pid), 'SIGKILL'); } catch { /* already gone */ } });
  return /** @type {number} */ (c.pid);
}
/** a real live process that is NOT a bareloop runner (a recycled pid) */
function spawnOther(t) {
  const c = spawn('sleep', ['300'], { stdio: 'ignore' });
  t.after(() => { try { process.kill(/** @type {number} */ (c.pid), 'SIGKILL'); } catch { /* already gone */ } });
  return /** @type {number} */ (c.pid);
}
async function killAndWait(pid) {
  process.kill(pid, 'SIGKILL');
  for (let i = 0; i < 100; i++) {
    try { process.kill(pid, 0); } catch { return; }
    await new Promise((r) => setTimeout(r, 20));
  }
}

test('readLegs({thisMonthOnly}): the spine of a run listed in another month is never parsed — unless its claim is still held (live pid)', async (t) => {
  const home = tmp(t);
  const d = tmp(t);
  const live = spawnRunner(t);
  await new Promise((r) => setTimeout(r, 200));
  addRun(home, d, { runid: 'old', at: localIso(2026, 6, 3), jobEnd: { engagementSpentUsd: 1, spendComplete: true } });
  addRun(home, d, { runid: 'held-old', at: localIso(2026, 6, 4), jobStart: { budgetUsd: 4 }, extra: { pid: live, capUsd: 4 } });
  addRun(home, d, { runid: 'now', at: localIso(2026, 8, 2), jobEnd: { engagementSpentUsd: 2, spendComplete: true } });
  assert.equal(readLegs({ home, now: NOW }).length, 3, 'the all-time reader still reads every run');
  const legs = readLegs({ home, now: NOW, thisMonthOnly: true });
  assert.deepEqual(legs.map((l) => l.at.getMonth()).sort(), [6, 8], 'the July run is skipped; the held July claim and the September run are read');
});

test('isLiveRunner: a bareloop-looking child is live; a plain sleep (recycled pid) and a killed child are not', async (t) => {
  const runner = spawnRunner(t);
  const other = spawnOther(t);
  await new Promise((r) => setTimeout(r, 200)); // let exec settle so /proc/<pid>/cmdline is the child's own
  assert.equal(isLiveRunner(runner), true);
  assert.equal(isLiveRunner(other), false);
  await killAndWait(runner);
  assert.equal(isLiveRunner(runner), false);
  assert.equal(isLiveRunner(0), false);
  assert.equal(isLiveRunner(/** @type {any} */ ('x')), false);
});

test('isLiveRunner: a runner is a node process naming a runner file; a non-node program with such an argument is not (recycled pid)', async (t) => {
  const d = tmp(t);
  const spawned = [];
  const live = (/** @type {string} */ cmd, /** @type {string[]} */ args) => {
    const c = spawn(cmd, args, { stdio: 'ignore' });
    spawned.push(/** @type {number} */ (c.pid));
    return /** @type {number} */ (c.pid);
  };
  t.after(() => { for (const p of spawned) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } } });
  // real node processes running a file with each real runner basename
  const nodes = ['bareloop.mjs', 'run-u.mjs', 'u-watchdog.mjs'].map((n) => {
    const f = join(d, n);
    writeFileSync(f, 'setInterval(() => {}, 1000);\n');
    return live(process.execPath, [f]);
  });
  // the npm bin shape: a node process whose script path is the extensionless `bareloop` name
  const bin = join(d, 'bareloop');
  writeFileSync(bin, 'setInterval(() => {}, 1000);\n');
  nodes.push(live(process.execPath, [bin]));
  // real non-node programs carrying a runner name in their arguments
  const strays = [
    live('sh', ['-c', 'sleep 300', 'bareloop']),
    live('tail', ['-f', '/dev/null', join(d, 'bareloop')]),
    live('tail', ['-f', '/dev/null', join(d, 'run-u.mjs')]),
  ];
  await new Promise((r) => setTimeout(r, 300)); // let exec settle so /proc/<pid>/cmdline is the child's own
  for (const p of nodes) assert.equal(isLiveRunner(p), true, `node runner ${p}`);
  for (const p of strays) assert.equal(isLiveRunner(p), false, `stray ${p}`);
});

test('rule 2: a live-pid run silent for 30 minutes is still held at its FULL cap; once the pid is gone it counts its floor', async (t) => {
  const home = tmp(t);
  const d = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  const pid = spawnRunner(t);
  await new Promise((r) => setTimeout(r, 200));
  addRun(home, d, { runid: 'quiet', at: localIso(2026, 8, 15, 11), rounds: [0.05], jobStart: { budgetUsd: 6 }, extra: { pid, capUsd: 6 } });
  const f = join(d, 'u-quiet.jsonl');
  const nowMs = NOW();
  utimesSync(f, new Date(nowMs - 30 * 60 * 1000), new Date(nowMs - 30 * 60 * 1000));
  assert.equal(monthSpend({ home, now: NOW }).reservedUsd, 6, 'the old mtime rule would have called it died');
  assert.equal(monthSpend({ home, now: NOW }).usd, 0.05, 'the Money tab figure stays REAL spend, never the hold');
  assert.equal(monthlyRefusalText(checkMonthlyRoom({ capUsd: 5, home, now: NOW })), 'Max $4.00 (monthly limit)');
  await killAndWait(pid);
  assert.equal(monthSpend({ home, now: NOW }).reservedUsd, 0.05, 'killed = process gone: floor only');
  assert.equal(checkMonthlyRoom({ capUsd: 9, home, now: NOW }).ok, true);
});

test('rule 2: a row written but no spine yet is held at its capUsd; a recycled pid (alive, not bareloop) counts its floor', async (t) => {
  const home = tmp(t);
  const d = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  const pid = spawnRunner(t);
  const other = spawnOther(t);
  await new Promise((r) => setTimeout(r, 200));
  addRun(home, d, { runid: 'nospine', at: localIso(2026, 8, 15, 11), noSpine: true, extra: { pid, capUsd: 7 } });
  assert.equal(monthSpend({ home, now: NOW }).reservedUsd, 7);
  assert.equal(monthSpend({ home, now: NOW }).usd, 0);
  addRun(home, d, { runid: 'recycled', at: localIso(2026, 8, 15, 11), rounds: [0.2], jobStart: { budgetUsd: 3 }, extra: { pid: other, capUsd: 3 } });
  assert.equal(monthSpend({ home, now: NOW }).reservedUsd, 7.2, 'the recycled-pid run counts its 0.2 floor, not its $3 cap');
});

test('rule 2: a finished run counts its spend even with a live pid; an old row with NO pid keeps the mtime rule', async (t) => {
  const home = tmp(t);
  const d = tmp(t);
  const pid = spawnRunner(t);
  await new Promise((r) => setTimeout(r, 200));
  addRun(home, d, { runid: 'done', at: localIso(2026, 8, 15, 11), jobEnd: { engagementSpentUsd: 1, spendComplete: true }, jobStart: { budgetUsd: 6 }, extra: { pid, capUsd: 6 } });
  assert.equal(monthSpend({ home, now: NOW }).reservedUsd, 1);
  addRun(home, d, { runid: 'old', at: localIso(2026, 8, 15, 11), rounds: [0.5], jobStart: { budgetUsd: 4 } });
  const nowMs = NOW();
  const f = join(d, 'u-old.jsonl');
  utimesSync(f, new Date(nowMs - 60 * 1000), new Date(nowMs - 60 * 1000));
  assert.equal(monthSpend({ home, now: NOW }).reservedUsd, 5, 'fresh pid-less spine: held at cap 4 (+1 done)');
  utimesSync(f, new Date(nowMs - 11 * 60 * 1000), new Date(nowMs - 11 * 60 * 1000));
  assert.equal(monthSpend({ home, now: NOW }).reservedUsd, 1.5, 'stale pid-less spine: floor 0.5 (+1 done)');
});

// ---- the claim: append your row first, then read; only claims ABOVE yours count; settle writes back ---------------------

const claimRow = (runid, pid, capUsd) => ({ at: localIso(2026, 8, 15, 11), runid, job: 'j', spine: join(tmpdir(), `nospine-${runid}.jsonl`), patient: null, via: 'run-u', pid, capUsd });

test('claim: back-to-back claims — the first (nothing above it) runs; the second no longer fits, is refused with the exact text and gets a released entry', async (t) => {
  const home = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  const pid = spawnRunner(t);
  await new Promise((r) => setTimeout(r, 200));
  const a = claimRun({ row: claimRow('a', pid, 6), capUsd: 6, home, now: NOW });
  assert.equal(a.claimed, true);
  assert.deepEqual(readRunList({ home }).rows.map((r) => [r.runid, r.pid, r.capUsd]), [['a', pid, 6]]);
  const b = claimRun({ row: claimRow('b', pid, 5), capUsd: 5, home, now: NOW });
  assert.equal(b.claimed, false);
  assert.equal(monthlyRefusalText(b.room), 'Max $4.00 (monthly limit)');
  const got = readRunList({ home });
  assert.deepEqual(got.rows.map((r) => r.runid), ['a'], 'the refused run is not listed as a run');
  assert.equal(got.events.length, 1);
  assert.deepEqual({ ...got.events[0], at: 'x' }, { runid: 'b', type: 'released', by: 'b', reason: 'refused', at: 'x' });
  assert.equal(claimRun({ row: claimRow('c', pid, 4), capUsd: 4, home, now: NOW }).claimed, true, 'a refused claim holds nothing: exactly what is left still fits');
});

test('claim: a row BELOW yours is ignored (later runs yield to earlier ones)', async (t) => {
  const home = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  const pid = spawnRunner(t);
  await new Promise((r) => setTimeout(r, 200));
  appendRun(claimRow('first', pid, 6), { home });
  appendRun(claimRow('second', pid, 9), { home }); // appended before `first` reads
  const got = claimRun({ row: claimRow('first', pid, 6), capUsd: 6, home, now: NOW });
  assert.equal(got.claimed, true, 'the $9 claim below does not count against the one above it');
  assert.equal(got.room.leftUsd, 10);
});

test('claim: no limit set takes no claim (the caller lists the run as ever)', (t) => {
  const home = tmp(t);
  const got = claimRun({ row: claimRow('a', process.pid, 6), capUsd: 6, home, now: NOW });
  assert.equal(got.claimed, false);
  assert.equal(got.room.limitUsd, null);
  assert.equal(readRunList({ home }).rows.length, 0);
});

test('claim: three real processes racing for a limit only one fits -> exactly the file-first claimant runs, never both over', async (t) => {
  const home = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  const monthlyUrl = new URL('../src/monthly.js', import.meta.url).href;
  const code = `
    import { claimRun } from ${JSON.stringify(monthlyUrl)};
    const [, home, runid] = process.argv.slice(1);
    const got = claimRun({ row: { at: new Date().toISOString(), runid, job: 'j', spine: '/nowhere/' + runid, patient: null, via: 'run-u', pid: process.pid, capUsd: 6 }, capUsd: 6, home });
    console.log(JSON.stringify({ runid, claimed: got.claimed }));
    setInterval(() => {}, 1000);`;
  const results = await Promise.all(['r1', 'r2', 'r3'].map((runid) => new Promise((res, rej) => {
    // argv: [node, -e code, 'bareloop.mjs', home, runid] — the child looks like a bareloop runner
    const c = spawn(process.execPath, ['--input-type=module', '-e', code, 'bareloop.mjs', home, runid], { stdio: ['ignore', 'pipe', 'inherit'] });
    t.after(() => { try { process.kill(/** @type {number} */ (c.pid), 'SIGKILL'); } catch { /* gone */ } });
    let buf = '';
    c.stdout.on('data', (d) => { buf += d; if (buf.includes('\n')) res(JSON.parse(buf.split('\n')[0])); });
    c.on('error', rej);
    c.on('exit', () => rej(new Error(`child ${runid} exited early: ${buf}`)));
  })));
  assert.equal(results.filter((r) => r.claimed).length, 1, JSON.stringify(results));
  assert.equal(readRunList({ home }).rows.length, 1);
  assert.equal(existsSync(`${runlistPath(home)}.lock`), false, 'no lock file exists or is ever made');
  const first = readRunList({ home }).rows[0].runid;
  assert.equal(results.find((r) => r.claimed).runid, first, 'the claimant is the one whose row came first in the file');
  assert.equal(readRunList({ home }).events.filter((e) => e.type === 'released').length, 2, 'the two that yielded are released');
});

test('settle: a claim ABOVE you whose process is gone is closed BY THE NEW RUN (attributed, floor, process gone) exactly once, and stops holding', async (t) => {
  const home = tmp(t);
  const d = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  const pid = await deadRunnerPid(t);
  addRun(home, d, { runid: 'killed', at: localIso(2026, 8, 15, 10), rounds: [2], jobStart: { budgetUsd: 9 }, extra: { pid, capUsd: 9 } });
  const nextPid = spawnRunner(t);
  await new Promise((r) => setTimeout(r, 200));
  const got = claimRun({ row: claimRow('next', nextPid, 7), capUsd: 7, home, now: NOW });
  assert.equal(got.claimed, true);
  const ev = readRunList({ home }).events;
  assert.equal(ev.length, 1);
  assert.deepEqual({ ...ev[0], at: 'x' }, { runid: 'killed', type: 'settled', by: 'next', reason: 'process gone', spentUsd: 2, spendComplete: false, at: 'x' });
  assert.equal(settleDeadClaims({ home, by: 'again', aboveRunid: 'next' }), 0, 'already settled: never twice');
  assert.equal(readRunList({ home }).rows.map((r) => r.runid).join(), 'killed,next', 'events are never listed as runs');
});

test('settle: a settled claim releases its hold even while its pid is alive; the Money figure stays the spine\'s real spend', async (t) => {
  const home = tmp(t);
  const d = tmp(t);
  const pid = spawnRunner(t);
  await new Promise((r) => setTimeout(r, 200));
  addRun(home, d, { runid: 'r', at: localIso(2026, 8, 15, 10), rounds: [1], jobStart: { budgetUsd: 6 }, extra: { pid, capUsd: 6 } });
  assert.equal(monthSpend({ home, now: NOW }).reservedUsd, 6);
  appendRunEvent({ runid: 'r', type: 'settled', by: 'r', spentUsd: 99, spendComplete: true, at: 'x' }, { home });
  const sp = monthSpend({ home, now: NOW });
  assert.equal(sp.reservedUsd, 1, 'hold released');
  assert.equal(sp.usd, 1, 'month totals read the spine, not the settle entry (single source of truth)');
});

test('run list fold: settled/released lines are never runs; a released claim\'s row is not listed; appendRun dedup ignores events', (t) => {
  const home = tmp(t);
  appendRun(claimRow('a', 1, 1), { home });
  appendRun(claimRow('b', 1, 1), { home });
  appendRunEvent({ runid: 'a', type: 'settled', by: 'a', spentUsd: 0, spendComplete: true, at: 'x' }, { home });
  appendRunEvent({ runid: 'b', type: 'released', by: 'b', reason: 'test', at: 'x' }, { home });
  const got = readRunList({ home });
  assert.deepEqual(got.rows.map((r) => r.runid), ['a']);
  assert.equal(got.events.length, 2);
  appendRunEvent({ runid: 'z', type: 'settled', by: 'q', at: 'x' }, { home });
  assert.equal(appendRun(claimRow('z', 1, 1), { home }).appended, true, 'a settled event is not "already listed"');
  assert.equal(appendRun(claimRow('a', 1, 1), { home }).appended, false, 'a real duplicate still is');
});

test('run-start seam: the run claims (row carries pid + capUsd) and, at its job-end, settles its own claim attributed to itself', async (t) => {
  const home = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  const r = await runU(t, { home, budgetUsd: 3 });
  assert.ok(r.providerCalls > 0, r.errs);
  const { rows, events } = readRunList({ home });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pid, process.pid);
  assert.equal(rows[0].capUsd, 3);
  assert.equal(events.length, 1, r.errs);
  assert.equal(events[0].type, 'settled');
  assert.equal(events[0].runid, rows[0].runid);
  assert.equal(events[0].by, rows[0].runid);
  assert.equal(typeof events[0].spentUsd, 'number');
});

test('settle: two runs closing the same dead claim both append a note; readers take the FIRST and ignore the duplicate', async (t) => {
  const home = tmp(t);
  const d = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  const pid = await deadRunnerPid(t);
  addRun(home, d, { runid: 'killed', at: localIso(2026, 8, 15, 10), rounds: [2], jobStart: { budgetUsd: 9 }, extra: { pid, capUsd: 9 } });
  appendRunEvent({ runid: 'killed', type: 'settled', by: 'first', reason: 'process gone', spentUsd: 2, spendComplete: false, at: 'x' }, { home });
  appendRunEvent({ runid: 'killed', type: 'settled', by: 'second', reason: 'process gone', spentUsd: 2, spendComplete: false, at: 'y' }, { home });
  const ev = readRunList({ home }).events;
  assert.equal(ev.length, 1);
  assert.equal(ev[0].by, 'first');
  assert.equal(monthSpend({ home, now: NOW }).reservedUsd, 2, 'and the claim is closed either way');
});

test('claim: a row that cannot be written refuses (ConfigError), it never falls back to "no limit"', (t) => {
  const home = tmp(t);
  updateConfig({ monthlyLimitUsd: 10 }, { home });
  mkdirSync(runlistPath(home)); // runs.jsonl is a directory: the append must fail
  assert.throws(() => claimRun({ row: claimRow('a', process.pid, 1), capUsd: 1, home, now: NOW }), ConfigError);
});
