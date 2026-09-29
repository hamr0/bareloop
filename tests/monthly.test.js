// PANEL-BUILD.md P4a item 2 — config.json (src/config.js), the monthly spend/limit
// (src/monthly.js), the ONE run-start seam (src/userrun.js `execute`) and the panel's
// two surfaces (cap note route, Sign refusal). Every test injects a scratch `home`;
// no provider is ever reachable (a scripted provider counts its calls — the refusal
// tests assert zero).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, utimesSync, readFileSync, rmSync, existsSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { configPath, readConfig, updateConfig, ConfigError } from '../src/config.js';
import { monthSpend, checkMonthlyRoom, monthlyRefusalText, legSpend } from '../src/monthly.js';
import { appendRun, readRunList } from '../src/runlist.js';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { startRun } from '../src/userrun.js';
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
function addRun(home, dir, { runid, at, rounds = [], jobEnd, jobStart = {} }) {
  const spine = join(dir, `u-${runid}.jsonl`);
  const recs = [{ type: 'job-start', job: 'j', ...jobStart }];
  for (const c of rounds) recs.push({ type: 'worker-round', costUsd: c });
  if (jobEnd) recs.push({ type: 'job-end', ...jobEnd });
  writeFileSync(spine, `${recs.map((r) => JSON.stringify(r)).join('\n')}\n`);
  appendRun({ at, runid, job: 'j', spine, patient: null, via: 'run-u' }, { home });
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

test('checkMonthlyRoom: the spine a resume continues counts its real spend, never its unspent cap; every other in-flight run keeps its full reservation', (t) => {
  const home = tmp(t);
  const d = tmp(t);
  const nowMs = NOW();
  const fresh = (runid) => utimesSync(join(d, `u-${runid}.jsonl`), new Date(nowMs - 3 * 60 * 1000), new Date(nowMs - 3 * 60 * 1000));
  updateConfig({ monthlyLimitUsd: 12 }, { home });
  addRun(home, d, { runid: 'killed', at: localIso(2026, 8, 15, 11), rounds: [3], jobStart: { budgetUsd: 10 } });
  fresh('killed');
  const spine = join(d, 'u-killed.jsonl');
  // 1. the resume asks for the remainder ($7); $9 truly left
  const ok = checkMonthlyRoom({ capUsd: 7, home, now: NOW, resumingSpine: spine });
  assert.equal(ok.ok, true);
  assert.equal(ok.leftUsd, 9);
  assert.equal(monthSpend({ home, now: NOW, resumingSpine: spine }).usd, 3, 'real spend still counts in full');
  // 2. without it, the old leg is reserved at its full cap: refused
  const refused = checkMonthlyRoom({ capUsd: 7, home, now: NOW });
  assert.equal(refused.ok, false);
  assert.equal(monthlyRefusalText(refused), 'Max $2.00 (monthly limit)');
  // 5. path form: a `./` / relative segment still matches
  assert.equal(checkMonthlyRoom({ capUsd: 7, home, now: NOW, resumingSpine: join(d, '.', 'sub', '..', 'u-killed.jsonl') }).ok, true);
  const rel = relative(process.cwd(), spine);
  assert.equal(checkMonthlyRoom({ capUsd: 7, home, now: NOW, resumingSpine: `./${rel}` }).ok, true);
  // 3. another fresh in-flight run stays reserved at its full cap
  addRun(home, d, { runid: 'other', at: localIso(2026, 8, 15, 11), rounds: [], jobStart: { budgetUsd: 6 } });
  fresh('other');
  const two = checkMonthlyRoom({ capUsd: 7, home, now: NOW, resumingSpine: spine });
  assert.equal(two.ok, false);
  assert.equal(two.leftUsd, 3);
});

test('checkMonthlyRoom: a resume that truly does not fit is still refused', (t) => {
  const home = tmp(t);
  const d = tmp(t);
  updateConfig({ monthlyLimitUsd: 8 }, { home });
  addRun(home, d, { runid: 'killed', at: localIso(2026, 8, 15, 11), rounds: [3], jobStart: { budgetUsd: 10 } });
  const f = join(d, 'u-killed.jsonl');
  utimesSync(f, new Date(NOW() - 3 * 60 * 1000), new Date(NOW() - 3 * 60 * 1000));
  const room = checkMonthlyRoom({ capUsd: 7, home, now: NOW, resumingSpine: f });
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
async function runU(t, { home, budgetUsd }) {
  const workdir = tmp(t);
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
  return { code, errs: errs.join('\n'), providerCalls, workdir };
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
