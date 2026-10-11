// PANEL-BUILD.md P8 batch 4 — which Settings line a RUN works on, through the real run engine's preview ($0, no provider): the spec's own model wins; a
// spec signed before a job carried its model takes `--model <id>` (+ `--provider <KEY>` when two keys tick it); the signed hash is untouched;
// every refusal is one plain sentence at $0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { startRun } from '../src/userrun.js';

/** @param {import('node:test').TestContext} t */
const tmp = (t) => { const d = mkdtempSync(join(tmpdir(), 'run-worker-p8-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const CFG = {
  keys: { A_KEY: { shape: 'openai-api', baseUrl: 'https://a.example/v1' }, B_KEY: { shape: 'openai-api', baseUrl: 'https://b.example/v1' } },
  models: { A_KEY: [{ model: 'm-one', use: true, inPerM: 1, outPerM: 2 }, { model: 'dup', use: true, inPerM: 1, outPerM: 2 }], B_KEY: [{ model: 'dup', use: true, inPerM: 1, outPerM: 2 }] },
};
function homeWith(t, text = 'A_KEY=fake-not-a-real-key\nB_KEY=fake-not-a-real-key\n') {
  const home = tmp(t);
  writeFileSync(join(home, '.env'), text, { mode: 0o600 });
  writeFileSync(join(home, 'config.json'), JSON.stringify(CFG));
  return home;
}
/** a preview run (no --approve): returns what the door printed and its exit code */
async function preview(t, { home, specOver = {}, flags = {} }) {
  const workdir = tmp(t);
  mkdirSync(join(workdir, 'src'), { recursive: true });
  writeFileSync(join(workdir, 'src', 'mod.mjs'), 'export const x = 1;\n');
  git(workdir, ['init', '-q']);
  git(workdir, ['-c', 'user.email=a@example.com', '-c', 'user.name=a', 'add', '.']);
  git(workdir, ['-c', 'user.email=a@example.com', '-c', 'user.name=a', 'commit', '-q', '-m', 'seed']);
  const seed = git(workdir, ['rev-parse', 'HEAD']);
  const closeSrc = 'process.exit(1);\n';
  const closePath = join(tmp(t), 'close.mjs');
  writeFileSync(closePath, closeSrc);
  const spec = {
    schema: 'job-v1', job: 'worker-p8-fixture', description: 'worker line fixture.', provider: 'openai-api', cadence: { unit: 'day', every: 1 }, budgetUsd: 1, maxWallMs: 1_800_000,
    writeScope: ['src/**'], goal: 'Append MARKER_OK to src/mod.mjs.', verdictType: 'green',
    close: [{ name: 'has-marker', cmd: `node ${closePath} has-marker`, expect: 0, sha256: hashCloseScriptBytes(closeSrc) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' }, ...specOver,
  };
  /** @type {string[]} */ const outs = []; /** @type {string[]} */ const errs = [];
  const code = await startRun(spec, {
    workdir, seed, spineName: 'worker-p8-fixture-bareloop', ...flags,
    deps: { env: {}, keysHome: home, out: (s) => outs.push(s), err: (s) => errs.push(s), runlistHome: home },
  });
  return { code, out: outs.join('\n'), errs: errs.join('\n'), spec, hash: jobSpecHash(spec) };
}

test('an older spec (no model, no baseUrl) runs on the line `--model` names: the preview names that row\'s key, and the signed hash is the spec\'s own', async (t) => {
  const r = await preview(t, { home: homeWith(t), flags: { model: 'm-one' } });
  assert.equal(r.code, 0, r.errs);
  assert.match(r.out, /A_KEY=\.\.\. /, 'the key is the chosen row\'s own variable');
  assert.ok(r.out.includes(r.hash), 'the approve hash printed is the SIGNED spec\'s, untouched by the chosen line');
});

test('no model in the spec and none given: the one sentence, exit 2, nothing spent', async (t) => {
  const r = await preview(t, { home: homeWith(t) });
  assert.equal(r.code, 2);
  assert.match(r.errs, /^Name the model with --model <id>: one ticked in Settings > Providers with both prices\.$/m);
});

test('the spec\'s own model wins; a different --model is refused, never silently swapped', async (t) => {
  const own = await preview(t, { home: homeWith(t), specOver: { model: 'm-one' } });
  assert.equal(own.code, 0, own.errs);
  const clash = await preview(t, { home: homeWith(t), specOver: { model: 'm-one' }, flags: { model: 'dup' } });
  assert.equal(clash.code, 2);
  assert.match(clash.errs, /spec names model "m-one" but --model resolved to "dup"/);
});

test('a model no ticked line carries: "<model> is not set up", exit 2; a key with no value has no row', async (t) => {
  const none = await preview(t, { home: homeWith(t), flags: { model: 'nope' } });
  assert.equal(none.code, 2);
  assert.match(none.errs, /^nope is not set up: put its key in your keys file and type its Base URL in Settings > Providers\. Nothing was spent\.$/m);
  const nokey = await preview(t, { home: homeWith(t, 'A_KEY=\nB_KEY=fake-not-a-real-key\n'), flags: { model: 'm-one' } });
  assert.equal(nokey.code, 2, 'A_KEY has no value, so it is not a row, so its line cannot be run');
  assert.match(nokey.errs, /m-one is not set up/);
});

test('two keys ticking one model id: refused naming both until --provider <KEY> picks; the spec\'s own baseUrl narrows too', async (t) => {
  const amb = await preview(t, { home: homeWith(t), flags: { model: 'dup' } });
  assert.equal(amb.code, 2);
  assert.match(amb.errs, /dup is ticked on more than one key \(A_KEY, B_KEY\): name one with --provider <KEY>\. Nothing was spent\./);
  const pick = await preview(t, { home: homeWith(t), flags: { model: 'dup', providerKey: 'B_KEY' } });
  assert.equal(pick.code, 0, pick.errs);
  assert.match(pick.out, /B_KEY=\.\.\. /);
  const bySpec = await preview(t, { home: homeWith(t), specOver: { model: 'dup', baseUrl: 'https://b.example/v1' } });
  assert.equal(bySpec.code, 0, bySpec.errs);
  assert.match(bySpec.out, /B_KEY=\.\.\. /);
});
