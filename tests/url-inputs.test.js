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
import { fetchPageText, pageContentChars, MIN_CONTENT_CHARS, CONNECT_OPTIONS, SNAPSHOT_OPTIONS, NETWORK_IDLE_MS, NETWORK_IDLE_TIMEOUT_MS, MIN_PAGE_CHARS, isWebUrl } from '../src/pagefetch.js';
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

/**
 * A stub of barebrowse's connect(): a page whose results FILL IN LATE, like a real results page. `snapshot` shows the partial page until
 * `waitForNetworkIdle` has been awaited, then the full one. Every call is recorded in `log`; `closed` counts close().
 * @param {{partial: string, full: string, idleThrows?: boolean, gotoThrows?: Error, snapshotAfterIdle?: boolean}} o
 */
function lateFillBrowser({ partial, full, idleThrows = false, gotoThrows }) {
  /** @type {{op: string, args: any[]}[]} */
  const log = [];
  const state = { closed: 0, idled: false, opened: /** @type {any} */ (null) };
  const connect = async (/** @type {any} */ opts) => {
    log.push({ op: 'connect', args: [opts] });
    state.opened = opts;
    return {
      async goto(/** @type {string} */ url, /** @type {number} */ timeout) { log.push({ op: 'goto', args: [url, timeout] }); if (gotoThrows) throw gotoThrows; },
      async waitForNetworkIdle(/** @type {any} */ o) { log.push({ op: 'waitForNetworkIdle', args: [o] }); state.idled = true; if (idleThrows) throw new Error('waitForNetworkIdle timed out'); },
      async snapshot(/** @type {any} */ o) { log.push({ op: 'snapshot', args: [o] }); return state.idled ? full : partial; },
      async close() { state.closed += 1; log.push({ op: 'close', args: [] }); },
    };
  };
  return { connect, log, state };
}

test('fetchPageText (L1): connects incognito and private-network-blocked, goes to the page, WAITS for the network to go quiet, then snapshots in act mode - and returns the filled page, not the load-time one', async () => {
  const b = lateFillBrowser({ partial: 'HEADER ONLY. '.repeat(30), full: PAGE1 });
  const r = await fetchPageText(URL1, { connect: b.connect });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.text, PAGE1, 'the page after the wait, never the load-time snapshot');
  assert.deepEqual(b.log.map((c) => c.op), ['connect', 'goto', 'waitForNetworkIdle', 'snapshot', 'close'], 'wait comes BEFORE the snapshot; the browser is always closed');
  assert.deepEqual(b.log[0].args[0], { incognito: true, blockPrivateNetwork: true });
  assert.deepEqual({ ...CONNECT_OPTIONS }, { incognito: true, blockPrivateNetwork: true });
  assert.deepEqual(b.log[1].args[0], URL1);
  assert.deepEqual(b.log[2].args[0], { idle: NETWORK_IDLE_MS, timeout: NETWORK_IDLE_TIMEOUT_MS }, 'bounded wait');
  assert.deepEqual(b.log[3].args[0], { mode: 'act' });
  assert.deepEqual({ ...SNAPSHOT_OPTIONS }, { mode: 'act' });
  assert.ok(NETWORK_IDLE_TIMEOUT_MS <= 30_000 && NETWORK_IDLE_MS >= 500);
});

test('fetchPageText (L1): a page that never goes quiet is read as it stands (the idle wait is bounded, its timeout is not a failure)', async () => {
  const b = lateFillBrowser({ partial: PAGE1, full: PAGE2, idleThrows: true });
  const r = await fetchPageText(URL1, { connect: b.connect });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.text, PAGE2);
  assert.equal(b.state.closed, 1);
});

test('fetchPageText: an empty or near-empty page, a bot challenge, a thrown error and a hang are each a plain-words stop, never an empty input - and the browser is closed each time', async () => {
  /** @param {string|((b: any) => any)} snap @param {{timeoutMs?: number, gotoThrows?: Error}} [o] */
  const stop = async (snap, { timeoutMs = 1000, gotoThrows } = {}) => {
    const b = lateFillBrowser({ partial: String(snap), full: String(snap), gotoThrows });
    const r = await fetchPageText(URL1, { connect: b.connect, timeoutMs });
    assert.equal(b.state.closed, 1, 'closed');
    return r;
  };
  const empty = await stop('   ');
  assert.equal(empty.ok, false);
  assert.match(String(!empty.ok && empty.error), /came back with no text/);
  const tiny = await stop('x'.repeat(MIN_PAGE_CHARS - 1));
  assert.match(String(!tiny.ok && tiny.error), new RegExp(`only ${MIN_PAGE_CHARS - 1} characters`));
  const bot = await stop(`[BOT CHALLENGE DETECTED]\n${'x'.repeat(500)}`);
  assert.match(String(!bot.ok && bot.error), /bot challenge/);
  const boom = await stop(PAGE1, { gotoThrows: new Error('net::ERR_NAME_NOT_RESOLVED') });
  assert.match(String(!boom.ok && boom.error), /could not be read: net::ERR_NAME_NOT_RESOLVED/);
  const exactly = await stop('y'.repeat(MIN_PAGE_CHARS));
  assert.equal(exactly.ok, true, 'a page at the minimum is read');
  // a hang inside the page: the deadline fires and the browser is still closed
  /** @type {number} */
  let closed = 0;
  const hang = await fetchPageText(URL1, { timeoutMs: 30, closeWaitMs: 200, connect: async () => ({ goto: () => new Promise(() => {}), waitForNetworkIdle: async () => {}, snapshot: async () => '', close: async () => { closed += 1; } }) });
  assert.match(String(!hang.ok && hang.error), /no answer inside/);
  assert.equal(closed, 1);
});

// the two REAL pages the first live drafts fetched (panel sessions smv713up97m3k: 719 chars, header only; smv710w8c3wdh: 8,801 chars, 3 flights)
const HEADER_ONLY = readFileSync(new URL('./fixtures/page-header-only.txt', import.meta.url), 'utf8');
const PARTIAL = readFileSync(new URL('./fixtures/page-partial.txt', import.meta.url), 'utf8');

test('fetchPageText (L2): a page that is only the site header and menus (the real 719-character fetch) is a plain-words stop even though it is over the 200-character floor; the real 8,801-character partial page is read', async () => {
  assert.ok(HEADER_ONLY.trim().length >= MIN_PAGE_CHARS, 'it passes the old size floor - that is the bug');
  assert.equal(pageContentChars(HEADER_ONLY), 0, 'nothing outside the banner');
  const header = await fetchPageText(URL1, { connect: lateFillBrowser({ partial: HEADER_ONLY, full: HEADER_ONLY }).connect });
  assert.equal(header.ok, false);
  assert.match(String(!header.ok && header.error), /only the site's own header and menus/);
  // the partial page has a search form and 3 flights outside the banner: it is content (a PARTIAL page is L1's job, not L2's)
  assert.ok(pageContentChars(PARTIAL) >= MIN_CONTENT_CHARS, String(pageContentChars(PARTIAL)));
  const partial = await fetchPageText(URL1, { connect: lateFillBrowser({ partial: PARTIAL, full: PARTIAL }).connect });
  assert.equal(partial.ok, true);
  // a full results page (many flights under main) is read
  const full = PARTIAL + PARTIAL.split('\n').slice(40).join('\n').repeat(8);
  assert.equal((await fetchPageText(URL1, { connect: lateFillBrowser({ partial: full, full }).connect })).ok, true);
  // plain text (a page with no landmarks) counts whole; chrome roles are matched by ARIA landmark only
  assert.equal(pageContentChars('Hello world, this is a plain page.'), 'Hello world, this is a plain page.'.length);
  assert.equal(pageContentChars('url: https://x/\n1,000 chars → 50 chars (95% pruned)\n- navigation [ref=1]\n  - link "Home" [ref=2]\n- main [ref=3]\n  - StaticText "Body text here" [ref=4]'), 'main'.length + 'StaticText "Body text here"'.length, 'the navigation subtree is out, the main subtree is in');
});

test('fetchPageText: a credentialed, secret-shaped, non-http or malformed address never reaches the browser', async () => {
  let reached = 0;
  const connect = async () => { reached += 1; return lateFillBrowser({ partial: PAGE1, full: PAGE1 }).connect({}); };
  for (const u of ['https://user:pw@example.com/x', `https://example.com/?k=sk-${'A1b2C3d4'.repeat(4)}`, 'ftp://example.com/x', 'not a url']) {
    const r = await fetchPageText(u, { connect });
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

test('the panel page: a refused Start (a $0 refusal such as an Inputs line) is drawn red and sized like a failure line, and brought into view - it used to be a faint 11px hint under the cap fields that read as "nothing happened"', () => {
  const html = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
  assert.match(html, /<div class="hint bad card-refusal" id="chat-card-error" data-testid="chat-card-error" role="alert"><\/div>/);
  assert.match(html, /\.card-refusal:not\(:empty\)\{font-size:13px/);
  assert.match(html, /\.hint\.bad\{color:var\(--red\);\}/);
  assert.match(html, /errEl\.textContent = \(r\.body && r\.body\.error\) \|\| "refused";\s*\/\/[^\n]*\n\s*try \{ errEl\.scrollIntoView/);
});

test('proveRubricInputs: the refusal for an unreadable page ends in one full stop, not two', async (t) => {
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'Flights', value: URL1 }], into: join(tmp(t, 'url-dots-'), 'seed'), fetchUrl: async () => ({ ok: false, error: 'blocked by the SSRF guard.' }) });
  assert.equal(!r.ok && r.error, 'line 1: blocked by the SSRF guard. Nothing spent.');
});
