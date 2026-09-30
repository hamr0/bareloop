// The customer's own price (hamr 2026-09-30): `config.keys.<ENV>.{priceInPerM,priceOutPerM}`, USD per 1M
// tokens, resolved by ONE lookup beside keyNameFor and handed to bare-agent's `Loop({ rates })`.
// Scratch homes only; no provider, no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, readConfig, updateConfig } from '../src/config.js';
import { keyRows, keyNameFor, ratesFor } from '../src/providerrows.js';
import { createPanelServer } from '../src/panel/server.js';

/** @param {import('node:test').TestContext} t */
const tmp = (t) => {
  const d = mkdtempSync(join(tmpdir(), 'customer-price-test-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const DS = 'https://api.deepseek.com/v1';
const rowsOf = (keys) => keyRows({ filled: ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY'], config: { keys } });

test('ratesFor: no price = null; both set = exactly perM/1000; the row is the one keyNameFor picks', () => {
  assert.equal(ratesFor('openai-api', DS, rowsOf({}), 'deepseek-flash'), null);
  const rows = rowsOf({ DEEPSEEK_API_KEY: { priceInPerM: 0.006, priceOutPerM: 1.2 } });
  const got = ratesFor('openai-api', DS, rows, 'deepseek-flash');
  assert.deepEqual(got, { rates: { in: 0.006 / 1000, out: 1.2 / 1000 }, inPerM: 0.006, outPerM: 1.2, envName: 'DEEPSEEK_API_KEY' });
  assert.equal(got?.envName, keyNameFor('openai-api', DS, rows, 'deepseek-flash').name, 'same row as the key');
  // a blank-URL OpenAI row is a different endpoint: it neither borrows the DeepSeek price nor is priced by it
  assert.equal(ratesFor('openai-api', undefined, rows, 'gpt-x'), null);
  const both = rowsOf({ DEEPSEEK_API_KEY: { priceInPerM: 1, priceOutPerM: 2 }, OPENAI_API_KEY: { priceInPerM: 5, priceOutPerM: 15 } });
  assert.equal(ratesFor('openai-api', DS, both)?.envName, 'DEEPSEEK_API_KEY');
  assert.equal(ratesFor('openai-api', undefined, both)?.envName, 'OPENAI_API_KEY');
  // zero is a legal price (a free local model)
  assert.deepEqual(ratesFor('openai-api', DS, rowsOf({ DEEPSEEK_API_KEY: { priceInPerM: 0, priceOutPerM: 0 } }))?.rates, { in: 0, out: 0 });
});

test('ratesFor: one field, negative, NaN, Infinity, string, null all throw ConfigError naming the row and field', () => {
  const bad = (fields, re) => assert.throws(
    () => ratesFor('openai-api', DS, rowsOf({ DEEPSEEK_API_KEY: fields })),
    (e) => e instanceof ConfigError && re.test(e.message),
  );
  bad({ priceInPerM: 1 }, /keys\.DEEPSEEK_API_KEY sets priceInPerM but not priceOutPerM/);
  bad({ priceOutPerM: 1 }, /sets priceOutPerM but not priceInPerM/);
  bad({ priceInPerM: -1, priceOutPerM: 1 }, /keys\.DEEPSEEK_API_KEY\.priceInPerM must be a number/);
  bad({ priceInPerM: 1, priceOutPerM: Number.NaN }, /priceOutPerM must be a number/);
  bad({ priceInPerM: Infinity, priceOutPerM: 1 }, /priceInPerM must be a number/);
  bad({ priceInPerM: '0.006', priceOutPerM: 1 }, /priceInPerM must be a number/);
  bad({ priceInPerM: 1, priceOutPerM: null }, /priceOutPerM must be a number/);
});

test('a Settings row save keeps the two price fields on the row (panel route, scratch home)', async (t) => {
  const home = tmp(t);
  const keysFile = join(home, '.env');
  writeFileSync(keysFile, 'DEEPSEEK_API_KEY=sk-test-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n');
  chmodSync(keysFile, 0o600);
  updateConfig({ keys: { DEEPSEEK_API_KEY: { priceInPerM: 0.006, priceOutPerM: 1.2 } } }, { home });
  const { port, token, close } = await createPanelServer({ port: 0, home, env: {}, sessionsRoot: tmp(t), fetchImpl: async () => { throw new Error('no network'); } });
  t.after(() => close());
  const res = await fetch(`http://127.0.0.1:${port}/api/settings/providers/row`, {
    method: 'POST',
    headers: { 'x-bareloop-token': token, 'content-type': 'application/json' },
    body: JSON.stringify({ envName: 'DEEPSEEK_API_KEY', name: 'deepseek-flash', shape: 'openai-api', baseUrl: DS }),
  });
  assert.equal(res.status, 200);
  const row = readConfig({ home }).config.keys.DEEPSEEK_API_KEY;
  assert.equal(row.priceInPerM, 0.006);
  assert.equal(row.priceOutPerM, 1.2);
  assert.equal(row.name, 'deepseek-flash', 'the save itself still landed');
});

// ── end to end through the run engine (`startRun`), scripted provider, scratch home ──────────────────
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { startRun } from '../src/userrun.js';
import { readRunList } from '../src/runlist.js';
import { scriptedProvider } from './helpers.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const CLOSE_SOURCE = "console.log('FIXTURE');\nprocess.exit(1);\n";
const USAGE = { inputTokens: 1000, outputTokens: 400 };
// one write step the scripted worker never completes: its rounds are what the cap has to bind on
const PLAN = {
  schema: 'plan-v1',
  steps: [{
    id: 'edit-mod', action: 'Append MARKER_OK to src/mod.mjs.', tools: ['write', 'edit'], rounds: 4,
    target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }],
  }],
};

/** a scratch home whose keys file holds the DeepSeek row, plus that row's config (price or none) */
function homeWith(t, keyRow) {
  const home = tmp(t);
  const f = join(home, '.env');
  writeFileSync(f, 'DEEPSEEK_API_KEY=sk-test-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n');
  chmodSync(f, 0o600);
  if (keyRow) updateConfig({ keys: { DEEPSEEK_API_KEY: keyRow } }, { home });
  return home;
}

/** one run-u start on the DeepSeek-shaped spec; token-only rounds (costUsd null) so bare-agent prices them */
async function runPriced(t, { home, budgetUsd = 5 }) {
  const workdir = tmp(t);
  mkdirSync(join(workdir, 'src'), { recursive: true });
  writeFileSync(join(workdir, 'src', 'mod.mjs'), 'export const x = 1;\n');
  git(workdir, ['init', '-q']);
  git(workdir, ['config', 'user.email', 'price-test@example.com']);
  git(workdir, ['config', 'user.name', 'price-test']);
  git(workdir, ['add', '.']);
  git(workdir, ['commit', '-q', '-m', 'seed']);
  const seed = git(workdir, ['rev-parse', 'HEAD']);
  const closePath = join(tmp(t), 'close.mjs');
  writeFileSync(closePath, CLOSE_SOURCE);
  const spec = {
    schema: 'job-v1', job: 'customer-price-fixture', description: 'customer price fixture.',
    provider: 'openai-api', baseUrl: DS, model: 'deepseek-flash', cadence: { unit: 'day', every: 1 }, budgetUsd, maxWallMs: 1_800_000,
    writeScope: ['src/**'], goal: 'Append MARKER_OK to src/mod.mjs.', verdictType: 'green',
    close: [{ name: 'has-marker', cmd: `node ${closePath} has-marker`, expect: 0, sha256: hashCloseScriptBytes(CLOSE_SOURCE) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
  };
  const round = (text) => ({ text, costUsd: null, usage: USAGE });
  const provider = scriptedProvider([round('scout: nothing'), round(JSON.stringify(PLAN)), round('done')]);
  let providerCalls = 0;
  const counted = { ...provider, generate: async (...a) => { providerCalls += 1; return provider.generate(...a); } };
  /** @type {string[]} */ const outs = [];
  /** @type {string[]} */ const errs = [];
  let code = null;
  try {
    code = await startRun(spec, {
      workdir, seed, spineName: 'customer-price-fixture-bareloop', approve: jobSpecHash(spec),
      deps: { provider: counted, env: {}, out: (s) => outs.push(s), err: (s) => errs.push(s), runlistHome: home },
    });
  } catch { code = 'threw'; }
  const row = readRunList({ home }).rows[0];
  const spine = row ? readFileSync(row.spine, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  return { code, outs: outs.join('\n'), errs: errs.join('\n'), providerCalls, spine, workdir, row };
}
const workerRounds = (spine) => spine.filter((r) => r.type === 'worker-round');

test('end to end: with a customer price the worker rounds read rateSource "caller" at tokens x price; without, the built-in guess — the two differ', async (t) => {
  const price = { priceInPerM: 0.006, priceOutPerM: 1.2 };
  const priced = await runPriced(t, { home: homeWith(t, price) });
  const guessed = await runPriced(t, { home: homeWith(t, null) });
  const pr = workerRounds(priced.spine);
  const gr = workerRounds(guessed.spine);
  assert.ok(pr.length > 0 && gr.length > 0, `rounds ran (${priced.code}/${guessed.code}) ${priced.errs}`);
  const expectPriced = (USAGE.inputTokens * price.priceInPerM + USAGE.outputTokens * price.priceOutPerM) / 1e6;
  for (const r of pr) {
    assert.equal(r.rateSource, 'caller');
    assert.ok(Math.abs(r.costUsd - expectPriced) < 1e-12, `${r.costUsd} vs ${expectPriced}`);
  }
  // the guess: bare-agent's own default (0.003 in / 0.015 out per 1K) — compared as data, not as a hardcoded dollar
  for (const r of gr) assert.notEqual(r.rateSource, 'caller');
  assert.notEqual(gr[0].costUsd, pr[0].costUsd, 'a customer price must change what a round books');
  assert.ok(gr[0].costUsd > pr[0].costUsd * 10, 'the guess is far above this customer price');
  // and the run summary the person reads is the customer-priced one
  assert.ok(priced.row);
  console.log(`# two arms, same tokens (${USAGE.inputTokens} in / ${USAGE.outputTokens} out per round): customer price $${pr[0].costUsd.toFixed(9)} (${pr[0].rateSource}) vs guess $${gr[0].costUsd.toFixed(9)} (${gr[0].rateSource})`);
});

test('end to end: the cap binds on the customer-priced dollars — a low price does not cap-halt where the guess does, a high price halts sooner', async (t) => {
  // one round books ~ $0.0069 under the guess (1000 in x 0.003 + 400 out x 0.015 per 1K, x rounds); a $0.005 cap halts under the guess
  const cap = 0.005;
  const low = await runPriced(t, { home: homeWith(t, { priceInPerM: 0.006, priceOutPerM: 1.2 }), budgetUsd: cap });
  const guess = await runPriced(t, { home: homeWith(t, null), budgetUsd: cap });
  const high = await runPriced(t, { home: homeWith(t, { priceInPerM: 3000, priceOutPerM: 15000 }), budgetUsd: cap });
  const ends = (r) => r.spine.filter((x) => x.type === 'job-end').map((x) => x.outcome);
  assert.ok(workerRounds(low.spine).length >= workerRounds(guess.spine).length, 'the low-price arm ran at least as many rounds (not a vacuous no-run)');
  assert.ok(!ends(low).some((o) => /cap-halt/.test(o)), `low price stays under the cap: ${ends(low)}`);
  assert.ok(ends(guess).some((o) => /cap-halt/.test(o)), `the guess trips the same cap: ${ends(guess)}`);
  assert.ok(ends(high).some((o) => /cap-halt/.test(o)), `a high price trips it too: ${ends(high)}`);
  assert.ok(workerRounds(high.spine).length <= workerRounds(guess.spine).length);
});

test('a bad price refuses the run at $0: exit 2, "Nothing spent", no provider call, no run-list row, no spine', async (t) => {
  const home = homeWith(t, { priceInPerM: 0.006 });
  const r = await runPriced(t, { home });
  assert.equal(r.code, 2);
  assert.match(r.errs, /keys\.DEEPSEEK_API_KEY sets priceInPerM but not priceOutPerM.*Nothing spent\./);
  assert.equal(r.providerCalls, 0);
  assert.equal(r.row, undefined, 'no run-list row');
  assert.deepEqual(r.spine, []);
  const neg = await runPriced(t, { home: homeWith(t, { priceInPerM: -1, priceOutPerM: 1 }) });
  assert.equal(neg.code, 2);
  assert.match(neg.errs, /priceInPerM must be a number/);
});

// ── every other door and seam that makes a model call ─────────────────────────────────────────────
import { makeLoopGenerate } from '../src/authorflow.js';
import { defaultJudgeLoop } from '../src/judged.js';
import { runAuthorScout } from '../src/authorscout.js';
import { main as authorMain } from '../src/authorrun.js';
import { prepareSource } from '../src/source.js';

const RATES = { in: 0.001, out: 0.002 };
const tokenOnly = () => scriptedProvider([{ text: 'x', costUsd: null, usage: USAGE }]);
const expectRated = (USAGE.inputTokens / 1000) * RATES.in + (USAGE.outputTokens / 1000) * RATES.out;

test('the drafter / confirm seam (makeLoopGenerate) and the judge seam (defaultJudgeLoop) price a round at the rates they are handed; without rates, at the guess', async () => {
  const msgs = () => [{ role: 'user', content: 'q' }];
  const g = await makeLoopGenerate(tokenOnly(), { rates: RATES })(msgs(), []);
  assert.ok(Math.abs(g.metrics.costUsd - expectRated) < 1e-12);
  const j = await defaultJudgeLoop({ provider: tokenOnly(), system: 's', rates: RATES }).run(msgs(), []);
  assert.ok(Math.abs(j.metrics.costUsd - expectRated) < 1e-12);
  const gj = await defaultJudgeLoop({ provider: tokenOnly(), system: 's' }).run(msgs(), []);
  assert.notEqual(gj.metrics.costUsd, j.metrics.costUsd, 'no rates = the guess, a different number');
  const gg = await makeLoopGenerate(tokenOnly())(msgs(), []);
  assert.equal(gg.metrics.costUsd, gj.metrics.costUsd, 'both seams take the same guess when unpriced');
});

test('the authoring scout hands its rates to every Loop it builds, and no rates key at all when none is set', async () => {
  const seen = [];
  const createLoop = (o) => { seen.push(o); return { run: async () => ({ text: '', msgs: [], metrics: {} }), stop() {} }; };
  const createSurveyor = async () => ({ policy: {}, tools: [], onLlmResult: undefined, cleanup: async () => {} });
  await runAuthorScout({ workdir: '/w', createLoop, createSurveyor, rates: RATES });
  assert.ok(seen.length >= 1);
  for (const o of seen) assert.deepEqual(o.rates, RATES);
  seen.length = 0;
  await runAuthorScout({ workdir: '/w', createLoop, createSurveyor });
  assert.ok(seen.length >= 1);
  for (const o of seen) assert.equal(Object.hasOwn(o, 'rates'), false);
});

test('the authoring door (run-author) refuses a bad price at $0, before any provider, naming the row', async (t) => {
  const home = homeWith(t, { priceInPerM: 'cheap', priceOutPerM: 1 });
  const folder = tmp(t);
  writeFileSync(join(folder, 'a.txt'), 'hello');
  const prep = await prepareSource({ source: folder, into: join(tmp(t), 'into') });
  assert.equal(prep.stop, null);
  const dir = tmp(t);
  writeFileSync(join(dir, 'answers.json'), '{}');
  writeFileSync(join(dir, 'draft.json'), JSON.stringify({ provider: 'openai-api', baseUrl: DS, model: 'deepseek-flash' }));
  let errText = '';
  let outText = '';
  const code = await authorMain(
    ['--source', prep.tree, '--answers', join(dir, 'answers.json'), '--draft', join(dir, 'draft.json'), '--verdict', 'green', '--out', join(dir, 'out')],
    { env: {}, keysHome: home, stdout: { write: (s) => { outText += s; } }, stderr: { write: (s) => { errText += s; } } },
  );
  assert.equal(code, 2, errText + outText);
  assert.match(errText, /keys\.DEEPSEEK_API_KEY\.priceInPerM must be a number.*Nothing spent\./);
});
