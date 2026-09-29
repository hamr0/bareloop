// PANEL-BUILD.md P4a item 3 — Settings -> Money & limits: spendSummary (src/monthly.js),
// the per-provider grouping and `/api/settings/money`. Scratch homes only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spendSummary } from '../src/monthly.js';
import { appendRun } from '../src/runlist.js';
import { readConfig, configPath, updateConfig } from '../src/config.js';
import { DEEPSEEK_BASE_URL } from '../src/providerrows.js';
import { createPanelServer } from '../src/panel/server.js';

/** @param {import('node:test').TestContext} t */
const tmp = (t) => {
  const d = mkdtempSync(join(tmpdir(), 'settings-money-test-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const NOW = () => new Date(2026, 8, 15, 12, 0, 0).getTime();
const at = (y, m, d) => new Date(y, m, d, 12).toISOString();

function addRun(home, dir, { runid, atIso, provider, baseUrl, model, usd, complete = true, tokens = 0, noJobEnd = false }) {
  const spine = join(dir, `u-${runid}.jsonl`);
  const recs = [{ type: 'job-start', job: 'j', ...(model ? { model } : {}), ...(provider ? { provider } : {}), ...(baseUrl ? { baseUrl } : {}) }];
  recs.push({ type: 'worker-round', costUsd: usd, usage: { inputTokens: tokens, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 } });
  if (!noJobEnd) recs.push({ type: 'job-end', engagementSpentUsd: usd, spentUsd: usd, spendComplete: complete });
  writeFileSync(spine, `${recs.map((r) => JSON.stringify(r)).join('\n')}\n`);
  appendRun({ at: atIso, runid, job: 'j', spine, patient: null, via: 'run-u' }, { home });
}

test('spendSummary: total vs this month, per provider (DeepSeek apart from OpenAI), tokens, "at least" on an unknown leg', (t) => {
  const home = tmp(t);
  const d = tmp(t);
  addRun(home, d, { runid: 'a', atIso: at(2026, 8, 2), provider: 'anthropic-api', usd: 2, tokens: 1000 });
  addRun(home, d, { runid: 'b', atIso: at(2026, 7, 2), provider: 'anthropic-api', usd: 5, tokens: 500 }); // last month
  addRun(home, d, { runid: 'c', atIso: at(2026, 8, 3), provider: 'openai-api', baseUrl: DEEPSEEK_BASE_URL, usd: 1, tokens: 200 });
  addRun(home, d, { runid: 'd', atIso: at(2026, 8, 4), provider: 'openai-api', usd: 0.5, tokens: 100 });
  const s = spendSummary({ home, now: NOW });
  assert.deepEqual(s.total, { usd: 8.5, atLeast: false });
  assert.deepEqual(s.month, { usd: 3.5, atLeast: false });
  assert.deepEqual(Object.keys(s.byProvider).sort(), ['anthropic', 'deepseek', 'openai']);
  assert.equal(s.byProvider.anthropic.monthUsd, 2);
  assert.equal(s.byProvider.anthropic.totalUsd, 7);
  assert.equal(s.byProvider.anthropic.tokens, 1500);
  assert.equal(s.byProvider.deepseek.totalUsd, 1);
  assert.equal(s.byProvider.openai.totalUsd, 0.5);
  addRun(home, d, { runid: 'e', atIso: at(2026, 8, 5), provider: 'anthropic-api', usd: 0.25, noJobEnd: true }); // died: a floor
  const s2 = spendSummary({ home, now: NOW });
  assert.equal(s2.total.atLeast, true);
  assert.equal(s2.month.atLeast, true);
  assert.equal(s2.byProvider.deepseek.totalAtLeast, false, 'an unknown leg only marks the figures it belongs to');
  assert.equal(s2.byProvider.anthropic.totalAtLeast, true);
});

test('spendSummary: a custom-endpoint run lands under its own label, not another row', (t) => {
  const home = tmp(t);
  const d = tmp(t);
  addRun(home, d, { runid: 'g', atIso: at(2026, 8, 2), provider: 'openai-api', baseUrl: 'https://my-gateway.example/v1', usd: 3 });
  const s = spendSummary({ home, now: NOW });
  assert.deepEqual(Object.keys(s.byProvider), ['other:openai-api @ https://my-gateway.example/v1']);
  assert.equal(s.byProvider['other:openai-api @ https://my-gateway.example/v1'].label, 'openai-api @ https://my-gateway.example/v1');
});

async function panel(t, home) {
  const { port, token, close } = await createPanelServer({ port: 0, home, env: {}, sessionsRoot: tmp(t) });
  t.after(() => close());
  const base = `http://127.0.0.1:${port}`;
  const H = { 'x-bareloop-token': token, 'content-type': 'application/json' };
  return { base, token, H, port };
}

test('/api/settings/money: GET needs the token; returns the figures; POST saves the limit to config.json (human click = token)', async (t) => {
  const home = tmp(t);
  const d = tmp(t);
  addRun(home, d, { runid: 'a', atIso: new Date().toISOString(), provider: 'anthropic-api', usd: 2 });
  const { base, H } = await panel(t, home);
  assert.equal((await fetch(`${base}/api/settings/money`)).status, 403, 'no token = refused');
  const got = await (await fetch(`${base}/api/settings/money`, { headers: H })).json();
  assert.equal(got.ok, true);
  assert.equal(got.totalUsd, 2);
  assert.equal(got.monthlyLimitUsd, null);
  assert.equal(got.byProvider[0].label, 'Anthropic');
  const saved = await fetch(`${base}/api/settings/money`, { method: 'POST', headers: H, body: JSON.stringify({ monthlyLimitUsd: 50 }) });
  assert.equal(saved.status, 200);
  assert.equal(readConfig({ home }).config.monthlyLimitUsd, 50);
  assert.equal((await (await fetch(`${base}/api/settings/money`, { headers: H })).json()).monthlyLimitUsd, 50);
  // blank removes it
  await fetch(`${base}/api/settings/money`, { method: 'POST', headers: H, body: JSON.stringify({ monthlyLimitUsd: '' }) });
  assert.equal('monthlyLimitUsd' in readConfig({ home }).config, false);
});

test('/api/settings/money: Save is refused without the token, with a wrong Origin, and for a bad number — config.json untouched', async (t) => {
  const home = tmp(t);
  updateConfig({ monthlyLimitUsd: 20 }, { home });
  const before = readFileSync(configPath(home), 'utf8');
  const { base, token } = await panel(t, home);
  const post = (headers, body) => fetch(`${base}/api/settings/money`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await post({}, { monthlyLimitUsd: 1 })).status, 403, 'no token');
  assert.equal((await post({ 'x-bareloop-token': token, origin: 'http://evil.example' }, { monthlyLimitUsd: 1 })).status, 403, 'wrong Origin');
  for (const bad of [0, -5, 'abc']) {
    assert.equal((await post({ 'x-bareloop-token': token }, { monthlyLimitUsd: bad })).status, 400, String(bad));
  }
  assert.equal(readFileSync(configPath(home), 'utf8'), before);
});

test('chat can never reach Settings: authoring routes have no /api/settings handler, and settings routes no authoring state', async (t) => {
  const { readFileSync: rf } = await import('node:fs');
  const author = rf(new URL('../src/panel/authorroutes.js', import.meta.url), 'utf8');
  assert.equal(/updateConfig|api\/settings/.test(author.replace(/\/\/.*$/gm, '')), false, 'authorroutes.js never writes config or serves /api/settings');
  const session = rf(new URL('../src/panel/authorsession.js', import.meta.url), 'utf8');
  assert.equal(/updateConfig/.test(session), false, 'the chat session engine never imports the config writer');
});

test('panel page: Settings button, Money tab, limit input + Save, breakdown table are in the page; money renders "at least" for a floor', () => {
  const html = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
  for (const id of ['btn-settings', 'settings-view', 'ml-total', 'ml-month', 'ml-money', 'btn-save-limits', 'ml-breakdown']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.match(html, /\(atLeast \? "at least " : ""\) \+ panelMoney\(n\)/);
  assert.doesNotMatch(html, /Monthly time limit/, 'R1: the monthly TIME limit is dropped');
});

function addSpine(home, dir, runid, atIso, recs) {
  const spine = join(dir, `u-${runid}.jsonl`);
  writeFileSync(spine, `${recs.map((r) => JSON.stringify(r)).join('\n')}\n`);
  appendRun({ at: atIso, runid, job: 'j', spine, patient: null, via: 'run-u' }, { home });
}

test('spendSummary: an older spine with a model but no provider is labelled "not recorded (model X)", one row per model, money unchanged, no provider guessed', (t) => {
  const home = tmp(t);
  const d = tmp(t);
  const rec = (model, usd) => [{ type: 'job-start', job: 'j', ...(model ? { model } : {}) }, { type: 'worker-round', costUsd: usd }, { type: 'job-end', engagementSpentUsd: usd, spentUsd: usd, spendComplete: true }];
  addSpine(home, d, 'o1', at(2026, 8, 2), rec('claude-sonnet-5-20260101', 1));
  addSpine(home, d, 'o2', at(2026, 8, 3), rec('claude-sonnet-5-20260101', 2));
  addSpine(home, d, 'o3', at(2026, 8, 4), rec('claude-haiku-4-5', 0.5));
  addSpine(home, d, 'o4', at(2026, 8, 5), rec(null, 0.25));
  const s = spendSummary({ home, now: NOW });
  const labels = Object.values(s.byProvider).map((p) => p.label).sort();
  assert.deepEqual(labels, ['not recorded', 'not recorded (model claude-haiku-4-5)', 'not recorded (model claude-sonnet-5-20260101)']);
  const sonnet = Object.values(s.byProvider).find((p) => p.label.includes('sonnet'));
  assert.equal(sonnet.totalUsd, 3);
  assert.equal(s.total.usd, 3.75);
  assert.ok(!Object.keys(s.byProvider).includes('anthropic'), 'never guessed into a provider row from the model name');
});

test('spendSummary minutes: job-end wall is exact; a run with no job-end is an "at least" floor; an unknown wall is null, never 0', (t) => {
  const home = tmp(t);
  const d = tmp(t);
  const T = (min) => new Date(Date.UTC(2026, 8, 2, 10, min, 0)).toISOString();
  const done = [{ type: 'job-start', provider: 'anthropic-api', ts: T(0) }, { type: 'worker-round', costUsd: 1, ts: T(3) }, { type: 'job-end', engagementSpentUsd: 1, spentUsd: 1, spendComplete: true, ts: T(10) }];
  const died = [{ type: 'job-start', provider: 'openai-api', ts: T(0) }, { type: 'worker-round', costUsd: 1, ts: T(4) }];
  const blind = [{ type: 'job-start', provider: 'openai-api', baseUrl: DEEPSEEK_BASE_URL }, { type: 'job-end', engagementSpentUsd: 0, spentUsd: 0, spendComplete: true }];
  addSpine(home, d, 'm1', at(2026, 8, 2), done);
  addSpine(home, d, 'm2', at(2026, 8, 3), died);
  addSpine(home, d, 'm3', at(2026, 8, 4), blind);
  const s = spendSummary({ home, now: NOW });
  assert.equal(s.byProvider.anthropic.monthWallMs, 10 * 60000);
  assert.equal(s.byProvider.anthropic.monthWallAtLeast, false);
  assert.equal(s.byProvider.openai.totalWallMs, 4 * 60000);
  assert.equal(s.byProvider.openai.totalWallAtLeast, true);
  assert.equal(s.byProvider.deepseek.totalWallMs, null, 'no timestamps at all = unknown, not 0');
  assert.equal(s.byProvider.deepseek.monthWallMs, null);
});

test('/api/settings/money carries the wall minutes per provider, and the page renders them as "at least" / "unknown" / minutes', async (t) => {
  const home = tmp(t);
  const d = tmp(t);
  const T = (min) => new Date(Date.UTC(2026, 8, 2, 10, min, 0)).toISOString();
  addSpine(home, d, 'w1', new Date().toISOString(), [{ type: 'job-start', provider: 'anthropic-api', ts: T(0) }, { type: 'job-end', engagementSpentUsd: 1, spentUsd: 1, spendComplete: true, ts: T(6) }]);
  const { port, token, close } = await createPanelServer({ port: 0, home, env: {}, sessionsRoot: tmp(t) });
  t.after(() => close());
  const body = await (await fetch(`http://127.0.0.1:${port}/api/settings/money`, { headers: { 'x-bareloop-token': token } })).json();
  const row = body.byProvider.find((p) => p.label === 'Anthropic');
  assert.equal(row.totalWallMs, 6 * 60000);
  assert.equal(row.monthWallAtLeast, false);
  const html = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
  assert.match(html, /<th>This month min<\/th><th>To date min<\/th>/);
  assert.match(html, /minutesText\(p\.monthWallMs, p\.monthWallAtLeast\)/);
});

test('spendSummary: tokensByRow — an old spine (model, no provider) counts toward the row whose Name EXACTLY equals it', (t) => {
  const home = tmp(t);
  const d = tmp(t);
  addRun(home, d, { runid: 'o1', atIso: at(2026, 8, 2), model: 'claude-sonnet-5', usd: 1, tokens: 700 });
  addRun(home, d, { runid: 'o2', atIso: at(2026, 8, 3), provider: 'anthropic-api', model: 'claude-sonnet-5', usd: 1, tokens: 50 });
  const row = (envName, name) => ({ envName, name, provider: 'anthropic-api', baseUrl: '' });
  // exact Name wins; a Name that is a PREFIX of the model does not
  const s = spendSummary({ home, now: NOW, rows: [row('A_KEY', 'claude-sonnet'), row('B_KEY', 'claude-sonnet-5')] });
  assert.equal(s.tokensByRow.B_KEY, 750, 'old spine (700) + the provider-recorded spine (50, today\'s matching)');
  assert.equal(s.tokensByRow.A_KEY ?? 0, 0, 'a prefix Name gets nothing from the old spine');
  // two rows sharing the Name: the unmatched old spine counts toward neither
  const s2 = spendSummary({ home, now: NOW, rows: [row('A_KEY', 'claude-sonnet-5'), row('B_KEY', 'claude-sonnet-5')] });
  assert.equal(s2.tokensByRow.A_KEY, 50);
  assert.equal(s2.tokensByRow.B_KEY ?? 0, 0);
  assert.equal(s2.total.usd, 2, 'money untouched');
});
