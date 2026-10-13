// PART 1c item (b) - URL inputs (src/pagefetch.js, src/source.js proveRubricInputs / refreezeUrlInputs, src/userrun.js run start).
// barebrowse is INJECTED everywhere: this file never touches the network. Real git, real source door, real engine (`run-u --spec`,
// in-process) with a scripted provider for the run-start proof.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchPageText, BROWSE_OPTIONS, MIN_PAGE_CHARS, isWebUrl } from '../src/pagefetch.js';
import { proveRubricInputs, refreezeUrlInputs, looksLikeRubricInput, readSourceManifest } from '../src/source.js';
import { readFrozenInputs } from '../src/rubricstep.js';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { main } from '../src/userrun.js';
import { scriptedProvider } from './helpers.js';

/** @param {import('node:test').TestContext} t @param {string} prefix */
const tmp = (t, prefix) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const sha = (/** @type {string} */ s) => createHash('sha256').update(s).digest('hex');
const URL1 = 'https://www.google.com/travel/flights?q=sfo-lax&curr=USD&hl=en&gl=us';
const filler = (/** @type {string} */ tag) => `${tag} ${'Flight from SFO to LAX. Departure time: 9:27 AM. From 59 US dollars. Nonstop. '.repeat(6)}`;
const PAGE1 = filler('DRAFT-COPY');
const PAGE2 = filler('RUN-COPY');
/** a fetchUrl stub that serves a list of pages in order, recording what it was asked */
function pages(/** @type {string[]} */ list) {
  /** @type {string[]} */
  const asked = [];
  const fn = async (/** @type {string} */ url) => { asked.push(url); const text = list[Math.min(asked.length - 1, list.length - 1)]; return { ok: /** @type {const} */ (true), text, url }; };
  return Object.assign(fn, { asked });
}

test('isWebUrl / looksLikeRubricInput: an http(s) address is an input a rubric job can take; a search or ftp is not', () => {
  assert.equal(isWebUrl(URL1), true);
  assert.equal(isWebUrl('ftp://x/y'), false);
  assert.equal(looksLikeRubricInput(URL1), true);
  assert.equal(looksLikeRubricInput('search: flights'), false);
  assert.equal(looksLikeRubricInput('/no/such/file.txt'), false);
});

test('fetchPageText: calls barebrowse read-only with exactly the options step 0 proved, and returns the text', async () => {
  /** @type {any[]} */
  const calls = [];
  const browse = async (/** @type {string} */ url, /** @type {any} */ opts) => { calls.push({ url, opts }); return PAGE1; };
  const r = await fetchPageText(URL1, { browse });
  assert.equal(r.ok, true);
  assert.deepEqual(calls.map((c) => c.opts), [{ incognito: true, blockPrivateNetwork: true, pruneMode: 'act' }]);
  assert.deepEqual({ ...BROWSE_OPTIONS }, { incognito: true, blockPrivateNetwork: true, pruneMode: 'act' });
  assert.equal(r.ok && r.text, PAGE1);
});

test('fetchPageText: an empty or near-empty page, a bot challenge, a thrown error and a hang are each a plain-words stop, never an empty input', async () => {
  const stop = async (/** @type {() => Promise<any>} */ f, /** @type {number} */ timeoutMs = 1000) => fetchPageText(URL1, { browse: f, timeoutMs });
  const empty = await stop(async () => '   ');
  assert.equal(empty.ok, false);
  assert.match(String(!empty.ok && empty.error), /came back with no text/);
  const tiny = await stop(async () => 'x'.repeat(MIN_PAGE_CHARS - 1));
  assert.match(String(!tiny.ok && tiny.error), new RegExp(`only ${MIN_PAGE_CHARS - 1} characters`));
  const bot = await stop(async () => `[BOT CHALLENGE DETECTED]\n${'x'.repeat(500)}`);
  assert.match(String(!bot.ok && bot.error), /bot challenge/);
  const boom = await stop(async () => { throw new Error('net::ERR_NAME_NOT_RESOLVED'); });
  assert.match(String(!boom.ok && boom.error), /could not be read: net::ERR_NAME_NOT_RESOLVED/);
  const hang = await stop(() => new Promise(() => {}), 30);
  assert.match(String(!hang.ok && hang.error), /no answer inside/);
  const exactly = await stop(async () => 'y'.repeat(MIN_PAGE_CHARS));
  assert.equal(exactly.ok, true, 'a page at the minimum is read');
});

test('fetchPageText: a credentialed, secret-shaped, non-http or malformed address never reaches the browser', async () => {
  let reached = 0;
  const browse = async () => { reached += 1; return PAGE1; };
  for (const u of ['https://user:pw@example.com/x', `https://example.com/?k=sk-${'A1b2C3d4'.repeat(4)}`, 'ftp://example.com/x', 'not a url']) {
    const r = await fetchPageText(u, { browse });
    assert.equal(r.ok, false, u);
  }
  assert.equal(reached, 0);
});

test('proveRubricInputs: a web input is fetched once, frozen under input/ like a file, and its address is recorded for run start; a file input beside it is unchanged', async (t) => {
  const dir = tmp(t, 'url-prove-');
  const notes = join(dir, 'notes.md');
  writeFileSync(notes, '# notes\nsome text\n');
  const fetchUrl = pages([PAGE1]);
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'Flights', value: URL1 }, { n: 2, label: 'Notes', value: notes }], into: join(dir, 'seed'), fetchUrl });
  assert.equal(r.ok, true, JSON.stringify(r));
  if (!r.ok) return;
  assert.deepEqual(fetchUrl.asked, [URL1], 'fetched exactly once');
  const [flights, file] = r.prep.manifest.inputs;
  assert.equal(flights.label, 'Flights');
  assert.equal(flights.rel, 'input/flights.txt');
  assert.equal(flights.url, URL1);
  assert.equal(flights.sha256, sha(PAGE1));
  assert.equal(file.url, undefined, 'a file input records no address');
  assert.equal(readFileSync(join(r.prep.tree, flights.rel), 'utf8'), PAGE1);
  assert.equal(r.prep.manifest.source, URL1);
});

test('proveRubricInputs: an unreadable page is a named $0 refusal on its line; a page with a secret shape is refused; a search line is still refused', async (t) => {
  const dir = tmp(t, 'url-refuse-');
  const bad = await proveRubricInputs({ inputs: [{ n: 1, label: 'Flights', value: URL1 }], into: join(dir, 'a'), fetchUrl: async () => ({ ok: false, error: 'https://x came back with no text' }) });
  assert.equal(bad.ok, false);
  assert.equal(!bad.ok && bad.code, 'input-url-unreadable');
  assert.match(String(!bad.ok && bad.error), /^line 1: https:\/\/x came back with no text\. Nothing spent\.$/);
  const leak = await proveRubricInputs({ inputs: [{ n: 1, label: 'Flights', value: URL1 }], into: join(dir, 'b'), fetchUrl: async (u) => ({ ok: true, text: `${PAGE1} sk-${'A1b2C3d4'.repeat(4)}`, url: u }) });
  assert.equal(!leak.ok && leak.code, 'input-url-secret');
  const search = await proveRubricInputs({ inputs: [{ n: 1, label: 'search', value: 'flights to LAX' }], into: join(dir, 'c') });
  assert.equal(!search.ok && search.code, 'web-input');
});

test('refreezeUrlInputs: run start makes a FRESH copy the run\'s frozen input - tree, record and seed agree, the page is not a worker write, and the draft copy is kept only as a hash', async (t) => {
  const dir = tmp(t, 'url-refreeze-');
  const into = join(dir, 'seed');
  const first = await proveRubricInputs({ inputs: [{ n: 1, label: 'Flights', value: URL1 }], into, fetchUrl: pages([PAGE1]) });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const seed0 = first.prep.manifest.seed;
  const again = pages([PAGE2]);
  const r = await refreezeUrlInputs({ into, fetchUrl: again });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(again.asked, [URL1], 'fetched again, from the recorded address');
  const m = (await readSourceManifest(into)).manifest;
  assert.equal(m.inputs[0].sha256, sha(PAGE2), 'the record names the run copy');
  assert.equal(m.inputs[0].draftSha256, sha(PAGE1), 'what the look saw is kept as a hash only');
  assert.notEqual(m.seed, seed0, 'a new seed holds the run copy');
  assert.equal(readFileSync(join(first.prep.tree, 'input', 'flights.txt'), 'utf8'), PAGE2, 'the worker reads the run copy');
  assert.equal(execFileSync('git', ['-C', first.prep.tree, 'status', '--porcelain'], { encoding: 'utf8' }), '', 'the fresh page is not read as a worker write');
  assert.equal(execFileSync('git', ['-C', first.prep.tree, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), m.seed);
  const frozen = await readFrozenInputs(first.prep.tree, ['Flights']);
  assert.equal(frozen.ok && frozen.texts.Flights, PAGE2, 'quotes are checked against the run copy');
});

test('refreezeUrlInputs: a job with only file inputs changes nothing; a failed fetch stops in plain words and leaves the draft copy and record untouched', async (t) => {
  const dir = tmp(t, 'url-refreeze2-');
  const notes = join(dir, 'notes.md');
  writeFileSync(notes, '# notes\n');
  const filesOnly = await proveRubricInputs({ inputs: [{ n: 1, label: 'Notes', value: notes }], into: join(dir, 'f') });
  assert.equal(filesOnly.ok, true);
  const noop = await refreezeUrlInputs({ into: join(dir, 'f'), fetchUrl: async () => { throw new Error('must not be called'); } });
  assert.deepEqual(noop, { ok: true, refreshed: [], seed: null });

  const into = join(dir, 'u');
  const first = await proveRubricInputs({ inputs: [{ n: 1, label: 'Flights', value: URL1 }], into, fetchUrl: pages([PAGE1]) });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const before = readFileSync(join(into, 'source.json'), 'utf8');
  const r = await refreezeUrlInputs({ into, fetchUrl: async () => ({ ok: false, error: 'https://x came back with only 12 characters of text' }) });
  assert.equal(r.ok, false);
  assert.match(String(!r.ok && r.error), /^Input "Flights": https:\/\/x came back with only 12 characters of text\. The run did not start\. Nothing spent\.$/);
  assert.equal(readFileSync(join(into, 'source.json'), 'utf8'), before);
  assert.equal(readFileSync(join(first.prep.tree, 'input', 'flights.txt'), 'utf8'), PAGE1);
  const leak = await refreezeUrlInputs({ into, fetchUrl: async (u) => ({ ok: true, text: `${PAGE2} sk-${'A1b2C3d4'.repeat(4)}`, url: u }) });
  assert.match(String(!leak.ok && leak.error), /known secret shape/);
});

// ── the real engine: run start in `run-u --spec` ────────────────────────────────────────────────────────────────────────────
/** a tiny job over a rubric-input tree: the close passes only when the RUN copy (not the drafting copy) is in the tree */
async function runJob(/** @type {import('node:test').TestContext} */ t, /** @type {any} */ extra) {
  const dir = tmp(t, 'url-run-');
  const closeSource = `import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const page = readFileSync(join(process.cwd(), 'input', 'flights.txt'), 'utf8');
const wrote = existsSync(join(process.cwd(), 'output', 'out.txt'));
console.log('FIXTURE judged=1');
process.exit(page.includes('RUN-COPY') && wrote ? 0 : 1);
`;
  const closeScript = join(dir, 'close.mjs');
  writeFileSync(closeScript, closeSource);
  const spec = {
    schema: 'job-v1', job: 'url-run-job', description: 'Part 1c run-start fixture.', provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 }, budgetUsd: 2, maxWallMs: 1_800_000, writeScope: ['output/**'],
    goal: 'Write output/out.txt.', verdictType: 'green',
    close: [{ name: 'run-copy', cmd: `node ${closeScript} run-copy`, expect: 0, sha256: hashCloseScriptBytes(closeSource) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
  };
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const into = join(dir, 'source-seed');
  const prep = await proveRubricInputs({ inputs: [{ n: 1, label: 'Flights', value: URL1 }], into, fetchUrl: pages([PAGE1]) });
  assert.equal(prep.ok, true, JSON.stringify(prep));
  if (!prep.ok) throw new Error('unreachable');
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{
    id: 'write-out', action: 'Write output/out.txt', tools: ['read', 'recall', 'get', 'write'], rounds: 6, target: 'output/out.txt',
    exit: [{ type: 'tree-changed', scope: 'output/**' }, { type: 'check-passes', name: 'run-copy' }],
  }] });
  const provider = scriptedProvider([
    { text: 'scout: output/ is empty' }, { text: plan },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(prep.prep.tree, 'output', 'out.txt'), content: 'done\n' } }] },
    { text: 'wrote it' },
  ]);
  const home = tmp(t, 'url-run-home-');
  /** @type {string[]} */ const out = []; /** @type {string[]} */ const err = [];
  const rc = await main(['--spec', specPath, '--approve', jobSpecHash(spec)], {
    provider, env: {}, out: (s) => out.push(s), err: (s) => err.push(s), runlistHome: home, ...extra,
  });
  return { rc, out: out.join('\n'), err: err.join('\n'), prep: prep.prep, into, provider };
}

test('run-u --spec: a fresh run fetches the web input AGAIN before the worker starts - the close grades the run copy, not the drafting copy', async (t) => {
  const fetchUrl = pages([PAGE2]);
  const r = await runJob(t, { fetchUrl });
  assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
  assert.match(r.out, /outcome\s+green/, 'the close passed on the run copy');
  assert.deepEqual(fetchUrl.asked, [URL1], 'one fetch at run start');
  const m = (await readSourceManifest(r.into)).manifest;
  assert.equal(m.inputs[0].sha256, sha(PAGE2));
  assert.equal(m.inputs[0].draftSha256, sha(PAGE1));
});

test('run-u --spec: a web input that cannot be read at run start stops the run in plain words before any spend', async (t) => {
  const r = await runJob(t, { fetchUrl: async () => ({ ok: false, error: `${URL1} came back with no text` }) });
  assert.notEqual(r.rc, 0);
  assert.match(r.err, /came back with no text\. The run did not start\. Nothing spent\./);
  assert.equal(r.provider.messagesLog.length, 0, 'no model call was made');
  assert.equal(existsSync(join(r.prep.tree, 'output', 'out.txt')), false);
});
