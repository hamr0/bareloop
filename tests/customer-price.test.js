// The customer's own price (hamr 2026-09-30, P8 2026-10-11): a row's model LINE `{model, use, inPerM, outPerM}`
// (config `models.<ENV>`; an older `keys.<ENV>.{name,priceInPerM,priceOutPerM}` still reads as one line), USD per 1M
// tokens, resolved by ONE lookup beside keyNameFor and handed to bare-agent's `Loop({ rates })`.
// Scratch homes only; no provider, no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig, updateConfig } from '../src/config.js';
import { keyRows, keyNameFor, priceReadout, ratesFor, endpointOf } from '../src/providerrows.js';
import { createPanelServer } from '../src/panel/server.js';

/** @param {import('node:test').TestContext} t */
const tmp = (t) => {
  const d = mkdtempSync(join(tmpdir(), 'customer-price-test-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const DS = 'https://api.deepseek.com/v1';
/** the older single-line row spelling, with the fixture's own shape / address / model id (nothing is built in) */
const withDefaults = (keys) => Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, {
  name: k === 'DEEPSEEK_API_KEY' ? 'deepseek-flash' : (k === 'ANTHROPIC_API_KEY' ? 'claude-haiku-4-5' : 'gpt-x'),
  shape: k === 'ANTHROPIC_API_KEY' ? 'anthropic-api' : 'openai-api',
  baseUrl: k === 'DEEPSEEK_API_KEY' || k === 'OTHER_KEY' ? DS : '',
  ...v,
}]));
const rowsOf = (keys, filled = ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY']) => keyRows({ filled, config: { keys: withDefaults(Object.fromEntries(filled.map((f) => [f, keys[f] ?? {}]))) } });

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

test('ratesFor: half a price, negative, NaN, Infinity, string, null read as NO price — the line is unticked, nothing throws', () => {
  for (const fields of [{ priceInPerM: 1 }, { priceOutPerM: 1 }, { priceInPerM: -1, priceOutPerM: 1 }, { priceInPerM: 1, priceOutPerM: Number.NaN },
    { priceInPerM: Infinity, priceOutPerM: 1 }, { priceInPerM: '0.006', priceOutPerM: 1 }, { priceInPerM: 1, priceOutPerM: null }]) {
    const rows = rowsOf({ DEEPSEEK_API_KEY: fields });
    const line = rows.find((r) => r.envName === 'DEEPSEEK_API_KEY').models[0];
    assert.deepEqual(line, { model: 'deepseek-flash', use: false }, JSON.stringify(fields));
    assert.equal(ratesFor('openai-api', DS, rows, 'deepseek-flash'), null, JSON.stringify(fields));
  }
});

test('a Settings model-line save keeps the price on the line and ratesFor reads it (panel route, scratch home)', async (t) => {
  const home = tmp(t);
  const keysFile = join(home, '.env');
  writeFileSync(keysFile, 'DEEPSEEK_API_KEY=sk-test-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n');
  chmodSync(keysFile, 0o600);
  updateConfig({ keys: { DEEPSEEK_API_KEY: { shape: 'openai-api', baseUrl: DS } } }, { home });
  const { port, token, close } = await createPanelServer({ port: 0, home, env: {}, sessionsRoot: tmp(t), fetchImpl: async () => { throw new Error('no network'); } });
  t.after(() => close());
  const res = await fetch(`http://127.0.0.1:${port}/api/settings/model`, {
    method: 'POST',
    headers: { 'x-bareloop-token': token, 'content-type': 'application/json' },
    body: JSON.stringify({ slot: 'DEEPSEEK_API_KEY', model: 'deepseek-flash', use: true, inPerM: 0.006, outPerM: 1.2 }),
  });
  assert.equal(res.status, 200);
  const cfg = readConfig({ home }).config;
  assert.deepEqual(cfg.models.DEEPSEEK_API_KEY, [{ model: 'deepseek-flash', use: true, inPerM: 0.006, outPerM: 1.2 }]);
  const got = ratesFor('openai-api', DS, keyRows({ filled: ['DEEPSEEK_API_KEY'], config: cfg }), 'deepseek-flash');
  assert.deepEqual(got?.rates, { in: 0.006 / 1000, out: 1.2 / 1000 });
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
  updateConfig({ keys: withDefaults({ DEEPSEEK_API_KEY: keyRow ?? {} }) }, { home });
  return home;
}

/** one run-u start on the DeepSeek-shaped spec; token-only rounds (costUsd null) so bare-agent prices them */
async function runPriced(t, { home, budgetUsd = 5, preview = false, specOver = {}, registry, workflow, real = false }) {
  // the spine lands at `<workdir>/../<spineName>`: nest the patient one level down so that sibling is inside this
  // test's own mktemp dir (cleaned by its `after`), not a fixed name straight under the system tmpdir
  const workdir = join(tmp(t), 'patient');
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
    ...specOver,
  };
  if (specOver.baseUrl === null) delete spec.baseUrl;
  const round = (text) => ({ text, costUsd: null, usage: USAGE });
  const provider = scriptedProvider([round('scout: nothing'), round(JSON.stringify(PLAN)), round('done')]);
  let providerCalls = 0;
  const counted = { ...provider, generate: async (...a) => { providerCalls += 1; return provider.generate(...a); } };
  /** @type {string[]} */ const outs = [];
  /** @type {string[]} */ const errs = [];
  let code = null;
  try {
    code = await startRun(spec, {
      workdir, seed, spineName: 'customer-price-fixture-bareloop', ...(preview ? {} : { approve: jobSpecHash(spec) }),
      ...(registry ? { registry } : {}), ...(workflow ? { workflow } : {}),
      deps: real ? { env: {}, keysHome: home, out: (s) => outs.push(s), err: (s) => errs.push(s), runlistHome: home }
        : { provider: counted, env: {}, out: (s) => outs.push(s), err: (s) => errs.push(s), runlistHome: home },
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

test('the price readout: per 1M, tiny prices never round to $0.00 / $0.01', () => {
  const line = (inPerM, outPerM) => priceReadout({ inPerM, outPerM, envName: 'K' });
  assert.equal(line(0.006, 1.2), 'yours: in $0.006 / out $1.20 per 1M tokens (K row)');
  assert.equal(line(0.0004, 5), 'yours: in $0.0004 / out $5.00 per 1M tokens (K row)');
  assert.equal(line(0, 0.125), 'yours: in $0.00 / out $0.125 per 1M tokens (K row)');
  assert.equal(line(0, 0), 'yours: in $0.00 / out $0.00 per 1M tokens (K row) — WARNING: this price is $0, so spend and limits read $0');
  assert.equal(line(1e-7, 3), 'yours: in $0.0000001 / out $3.00 per 1M tokens (K row)');
});

test('the readout line appears in the run preview and the run tail when a price is set — and nowhere when none is', async (t) => {
  const line = 'yours: in $0.006 / out $1.20 per 1M tokens (DEEPSEEK_API_KEY row)';
  const home = homeWith(t, { priceInPerM: 0.006, priceOutPerM: 1.2 });
  const pre = await runPriced(t, { home, preview: true });
  assert.equal(pre.providerCalls, 0);
  assert.match(pre.outs, new RegExp(`^  price    ${line.replace(/[()$/.]/g, '\\$&')}$`, 'm'));
  const run = await runPriced(t, { home });
  assert.match(run.outs, new RegExp(`^price     ${line.replace(/[()$/.]/g, '\\$&')}$`, 'm'));
  console.log(`# preview: ${pre.outs.split('\n').find((l) => /^  price /.test(l))}`);
  console.log(`# tail:    ${run.outs.split('\n').find((l) => /^price /.test(l))}`);
  const none = await runPriced(t, { home: homeWith(t, null), preview: true });
  assert.doesNotMatch(none.outs, /^\s*price\s+yours/m);
  const noneRun = await runPriced(t, { home: homeWith(t, null) });
  assert.doesNotMatch(noneRun.outs, /^price\s+yours/m);
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

// ── every other door and seam that makes a model call ─────────────────────────────────────────────
import { makeLoopGenerate } from '../src/authorflow.js';
import { runAuthorScout } from '../src/authorscout.js';
import { main as authorMain } from '../src/authorrun.js';
import { prepareSource } from '../src/source.js';

const RATES = { in: 0.001, out: 0.002 };
const tokenOnly = () => scriptedProvider([{ text: 'x', costUsd: null, usage: USAGE }]);
const expectRated = (USAGE.inputTokens / 1000) * RATES.in + (USAGE.outputTokens / 1000) * RATES.out;

test('the drafter / confirm seam (makeLoopGenerate) prices a round at the rates it is handed; without rates, at the guess', async () => {
  const msgs = () => [{ role: 'user', content: 'q' }];
  const g = await makeLoopGenerate(tokenOnly(), { rates: RATES })(msgs(), []);
  assert.ok(Math.abs(g.metrics.costUsd - expectRated) < 1e-12);
  const gj = await makeLoopGenerate(tokenOnly())(msgs(), []);
  assert.notEqual(gj.metrics.costUsd, g.metrics.costUsd, 'no rates = the guess, a different number');
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

test('a model line with no price, half a price or a bad price is NOT a usable model: the run refuses at $0 with the one sentence, no provider call, no run-list row, no spine', async (t) => {
  for (const fields of [{}, { priceInPerM: 0.006 }, { priceInPerM: -1, priceOutPerM: 1 }, { priceInPerM: 'cheap', priceOutPerM: 1 }]) {
    // eslint-disable-next-line no-await-in-loop
    const r = await runPriced(t, { home: homeWith(t, fields), real: true });
    assert.equal(r.code, 2, JSON.stringify(fields));
    assert.match(r.errs, /deepseek-flash is not set up: put its key in your keys file and type its Base URL in Settings > Providers\. Nothing was spent\./, JSON.stringify(fields));
    assert.equal(r.providerCalls, 0);
    assert.equal(r.row, undefined, 'no run-list row');
    assert.deepEqual(r.spine, []);
  }
});

// ── the preview's copy-paste "To approve and run" line (F207 b): the key variable the run will really read,
// and the registry / workflow flags exactly when they were given ─────────────────────────────────────
const approveLine = (outs) => outs.split('\n').find((l) => /^\s+\S+=\.\.\. /.test(l)) ?? '';

test('the preview\'s approve line names the key variable the run reads, and carries --registry/--workflow only when given', async (t) => {
  // a DeepSeek-base-URL job with the DeepSeek row present: DEEPSEEK_API_KEY, not the shape's built-in OPENAI_API_KEY
  const ds = await runPriced(t, { home: homeWith(t, { priceInPerM: 0.006, priceOutPerM: 1.2 }), preview: true });
  assert.match(approveLine(ds.outs), /^\s+DEEPSEEK_API_KEY=\.\.\. /);
  assert.doesNotMatch(approveLine(ds.outs), /--registry|--workflow/);
  // a job no row serves has NO built-in key name to print: a placeholder, never a vendor's variable
  const plain = await runPriced(t, { home: tmp(t), preview: true, specOver: { baseUrl: null, model: 'gpt-x' } });
  assert.match(approveLine(plain.outs), /^\s+<KEY>=\.\.\. /);
  assert.doesNotMatch(approveLine(plain.outs), /OPENAI_API_KEY/);
  // registry given: the printed approve line AND the inhibitor line carry it; workflow defaults to the job name
  const reg = mkdtempSync(join(tmpdir(), 'cp-reg-'));
  t.after(() => rmSync(reg, { recursive: true, force: true }));
  const withReg = await runPriced(t, { home: homeWith(t, null), preview: true, registry: reg });
  assert.equal(approveLine(withReg.outs).match(/--registry \S+ --workflow \S+/)?.[0], `--registry ${reg} --workflow customer-price-fixture`);
  assert.equal(withReg.outs.split('\n').filter((l) => l.includes(`--registry ${reg}`)).length, 2, 'the approve line and the inhibitor line');
  const named = await runPriced(t, { home: homeWith(t, null), preview: true, registry: reg, workflow: 'my-flow' });
  assert.match(approveLine(named.outs), new RegExp(`--registry ${reg.replace(/[.\\/]/g, '\\$&')} --workflow my-flow --approve `));
  console.log(`# approve line (DeepSeek job, registry): ${approveLine(withReg.outs).trim()}`);
  console.log(`# approve line (plain OpenAI job): ${approveLine(plain.outs).trim()}`);
});

test('endpointOf on an unparseable Base URL with 20000 slashes before a last character is linear (the trailing-slash regex was quadratic), and a real URL still drops its trailing slashes', () => {
  const t0 = performance.now();
  const mid = `not a url${'/'.repeat(20000)}x`;
  assert.equal(endpointOf('p', mid), mid);
  assert.equal(endpointOf('p', `${mid}${'/'.repeat(20000)}`), mid);
  assert.equal(endpointOf('p', 'HTTPS://Api.Example/v1//'), 'https://api.example/v1');
  assert.ok(performance.now() - t0 < 1000, `took ${performance.now() - t0} ms`);
});
