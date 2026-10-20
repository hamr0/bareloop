// Run mvez8s54 (job flight-revised, panel, 2026-10-19): after Sign & run ~18 s passed before the run appeared in the Runs list, and it then
// appeared already ~10 s old. REAL timestamps of that run: source.json refrozenAt 08:13:05.243Z (the barebrowse refetch FINISHED), its
// runs.jsonl row at 08:13:05.272Z - the refetch ran in main() BEFORE execute() listed the row. The run now lists its row FIRST (with pid and
// capUsd, the monthly claim), THEN fetches. While the fetch runs the Run tab says "fetching the page… the run has not started yet" (PRD
// v1.106 Part 5 Q2, server-owned words); a refused fetch SETTLES the row at $0 (never released, never died) and the panel shows the plain words.
// barebrowse is injected (deps.fetchUrl); real git, real source door, real engine (`run-u --spec`, in-process), real run list in a scratch home.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { proveRubricInputs } from '../src/source.js';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { main } from '../src/userrun.js';
import { readRunList, appendRun } from '../src/runlist.js';
import { updateConfig } from '../src/config.js';
import { checkMonthlyRoom } from '../src/monthly.js';
import { getRunDetail, listRuns } from '../src/panel/server.js';
import { scriptedProvider } from './helpers.js';

const tmp = (/** @type {import('node:test').TestContext} */ t, /** @type {string} */ p) => {
  const d = mkdtempSync(join(tmpdir(), p));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const URL1 = 'https://www.google.com/travel/flights?q=sfo-lax&curr=USD&hl=en&gl=us';
const filler = (/** @type {string} */ tag) => `${tag} ${'Flight from SFO to LAX. Departure time: 9:27 AM. From 59 US dollars. Nonstop. '.repeat(6)}`;
const ok = (/** @type {string} */ text) => async (/** @type {string} */ url) => ({ ok: /** @type {const} */ (true), text, url });
/** a real live process whose argv names run-u.mjs (a bareloop runner): the panel's "alive" runner for a copied row */
function spawnRunner(/** @type {import('node:test').TestContext} */ t) {
  const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', 'run-u.mjs'], { stdio: 'ignore' });
  t.after(() => { try { process.kill(/** @type {number} */ (c.pid), 'SIGKILL'); } catch { /* gone */ } });
  // spawn() returns when the pid has forked, not when exec has finished: for a moment /proc/<pid>/cmdline reads EMPTY, and isLiveRunner
  // (src/runlist.js) rightly says "not a runner" to an empty argv. Under load that window is long enough to hit (~1% of spawns measured with
  // 12 busy loops running), so wait here until the child's argv is readable and names the runner.
  const until = Date.now() + 5000;
  while (!readFileSync(`/proc/${c.pid}/cmdline`, 'utf8').includes('run-u.mjs')) {
    if (Date.now() > until) throw new Error('the spawned runner never showed its argv in /proc');
  }
  return /** @type {number} */ (c.pid);
}

/** set up a signed rubric-input job; `start(fetchUrl)` runs it in-process and returns the promise of {rc, err} */
async function world(/** @type {import('node:test').TestContext} */ t, /** @type {{ limit?: number }} */ o = {}) {
  const dir = tmp(t, 'fal-run-');
  const closeSource = `import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const page = readFileSync(join(process.cwd(), 'input', 'flights.txt'), 'utf8');
console.log('FIXTURE judged=1');
process.exit(page.includes('RUN-COPY') && existsSync(join(process.cwd(), 'output', 'out.txt')) ? 0 : 1);
`;
  const closeScript = join(dir, 'close.mjs');
  writeFileSync(closeScript, closeSource);
  const spec = {
    schema: 'job-v1', job: 'flight-revised', description: 'fetch-after-listing fixture.', provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 }, budgetUsd: 2, maxWallMs: 1_800_000, writeScope: ['output/**'],
    goal: 'Write output/out.txt.', verdictType: 'green',
    close: [{ name: 'run-copy', cmd: `node ${closeScript} run-copy`, expect: 0, sha256: hashCloseScriptBytes(closeSource) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
  };
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const into = join(dir, 'source-seed');
  const prep = await proveRubricInputs({ inputs: [{ n: 1, label: 'Flights', value: URL1 }], into, fetchUrl: ok(filler('DRAFT-COPY')) });
  if (!prep.ok) throw new Error(JSON.stringify(prep));
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{
    id: 'write-out', action: 'Write output/out.txt', tools: ['read', 'recall', 'get', 'write'], rounds: 6, target: 'output/out.txt',
    exit: [{ type: 'tree-changed', scope: 'output/**' }, { type: 'check-passes', name: 'run-copy' }],
  }] });
  const provider = scriptedProvider([
    { text: 'scout: output/ is empty' }, { text: plan },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(prep.prep.tree, 'output', 'out.txt'), content: 'done\n' } }] },
    { text: 'wrote it' },
  ]);
  const home = tmp(t, 'fal-home-');
  if (o.limit !== undefined) updateConfig({ monthlyLimitUsd: o.limit }, { home });
  const start = (/** @type {any} */ fetchUrl, /** @type {string[]} */ extra = []) => {
    /** @type {string[]} */ const err = [];
    const p = main(['--spec', specPath, '--approve', jobSpecHash(spec), ...extra], { provider, env: {}, out: () => {}, err: (s) => err.push(s), runlistHome: home, fetchUrl })
      .then((rc) => ({ rc, err: err.join('\n') }));
    return p;
  };
  return { home, into, start, provider, spec };
}

/** a fetchUrl that blocks until `release(result)` and says when it was entered */
function slowFetch() {
  /** @type {(r: any) => void} */ let release = () => {};
  /** @type {() => void} */ let enter = () => {};
  const entered = new Promise((res) => { enter = () => res(undefined); });
  const fn = (/** @type {string} */ url) => { enter(); return new Promise((res) => { release = (r) => res(r ?? { ok: true, text: filler('RUN-COPY'), url }); }); };
  return { fn, entered, release: (/** @type {any} */ r) => release(r) };
}

test('a fresh web-input run lists its row (pid + cap = the monthly claim) BEFORE the fetch resolves; the Run tab says "fetching the page…" meanwhile', async (t) => {
  const w = await world(t);
  const f = slowFetch();
  const done = w.start(f.fn);
  await f.entered;
  const { rows } = readRunList({ home: w.home });
  assert.equal(rows.length, 1, 'the row is listed while the fetch is still pending');
  assert.equal(rows[0].job, 'flight-revised');
  assert.equal(rows[0].pid, process.pid, 'the claim carries the runner pid');
  assert.equal(rows[0].capUsd, 2, 'and the leg cap');
  assert.equal(existsSync(rows[0].spine), false, 'listed, no spine yet');
  assert.equal(JSON.parse(readFileSync(join(w.into, 'source.json'), 'utf8')).refrozenAt, undefined, 'the refetch has not finished');
  // the panel, as if the pid were a live runner: the server decides the words
  const home2 = tmp(t, 'fal-home2-');
  appendRun({ ...rows[0], pid: spawnRunner(t) }, { home: home2 });
  const d = getRunDetail(rows[0].runid, { home: home2 });
  assert.equal(d.starting, true);
  assert.equal(d.startingWord, 'fetching the page…');
  assert.equal(d.startingNote, 'the run has not started yet');
  assert.equal(listRuns({ home: home2 })[0].startingWord, 'fetching the page…', 'the list card reads the same words');
  // a refetch that finished at or after the row: back to the plain starting words
  const sj = JSON.parse(readFileSync(join(w.into, 'source.json'), 'utf8'));
  writeFileSync(join(w.into, 'source.json'), JSON.stringify({ ...sj, refrozenAt: new Date(Date.parse(rows[0].at) + 1000).toISOString() }));
  assert.equal(getRunDetail(rows[0].runid, { home: home2 }).startingWord, 'starting…');
  // a file-only job never says fetching
  writeFileSync(join(w.into, 'source.json'), JSON.stringify({ ...sj, inputs: sj.inputs.map(({ url: _u, ...r }) => r) }));
  assert.equal(getRunDetail(rows[0].runid, { home: home2 }).startingWord, 'starting…');
  f.release();
  const r = await done;
  assert.equal(r.rc, 0, r.err);
});

test('the page prints the server\'s words (startingWord/startingNote) and has a refused branch - nothing typed in the page', () => {
  const html = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
  assert.match(html, /detail\.startingWord \|\| "starting…"/);
  assert.match(html, /detail\.startingNote \|\| "the run has not written its log yet"/);
  assert.match(html, /p\.why = r\.startingWord \|\| "starting…"/);
  assert.match(html, /if\(detail\.refused\)\{/);
  assert.doesNotMatch(html, /the run has not started yet/, 'that sentence is the server\'s');
});

test('a refused fetch SETTLES the row at $0 (not released, not died), frees the monthly room, and the panel shows the plain words as `failed`', async (t) => {
  const w = await world(t, { limit: 2 });
  const f = slowFetch();
  const done = w.start(f.fn);
  await f.entered;
  // while the fetch is pending the cap is held: with a live runner behind the row, a second $2 run does not fit
  const rowsMid = readRunList({ home: w.home }).rows;
  const heldHome = tmp(t, 'fal-held-');
  updateConfig({ monthlyLimitUsd: 2 }, { home: heldHome });
  appendRun({ ...rowsMid[0], pid: spawnRunner(t) }, { home: heldHome });
  assert.equal(checkMonthlyRoom({ capUsd: 2, home: heldHome }).ok, false, 'an unsettled live claim holds the room (the instrument can see a hold)');
  f.release({ ok: false, error: `${URL1} came back with no text` });
  const r = await done;
  assert.equal(r.rc, 2);
  assert.match(r.err, /came back with no text\. The run did not start\. Nothing spent\./);
  assert.equal(w.provider.messagesLog.length, 0, 'no model call');
  const list = readRunList({ home: w.home });
  assert.equal(list.rows.length, 1, 'the row stays listed (a released leg-1 row would vanish with its reason)');
  const ev = list.events.find((e) => e.runid === rowsMid[0].runid);
  assert.equal(ev?.type, 'settled');
  assert.equal(ev?.reason, 'refused before start');
  assert.equal(ev?.spentUsd, 0);
  assert.equal(ev?.spendComplete, true);
  assert.equal(list.events.some((e) => e.type === 'released'), false, 'never also released');
  assert.equal(checkMonthlyRoom({ capUsd: 2, home: w.home }).ok, true, 'the monthly room is free again');
  const row = list.rows[0];
  const d = getRunDetail(row.runid, { home: w.home });
  assert.equal(d.refused, true);
  assert.equal(d.status.word, 'failed', 'statusFor: refusals before start are `failed`');
  assert.equal(d.glyph, '✗');
  assert.equal(d.died, false);
  assert.equal(d.live, false);
  assert.match(d.endedLine, /came back with no text\. The run did not start\. Nothing spent\./);
  const l = listRuns({ home: w.home })[0];
  assert.equal(l.status.word, 'failed');
  assert.equal(l.endedLine, d.endedLine);
  assert.equal(l.fileMissing, false);
});

test('resume / door / decide keep today\'s path: no refetch, no ctx.refreeze (a resume of a run that does not exist never reaches the fetch)', async (t) => {
  const w = await world(t);
  let asked = 0;
  for (const flag of [['--resume', 'nosuchrun'], ['--door', 'nosuchrun'], ['--decide', 'accept']]) {
    const r = await w.start(async () => { asked += 1; return { ok: false, error: 'must not be asked' }; }, flag);
    assert.notEqual(r.rc, 0, flag.join(' '));
  }
  assert.equal(asked, 0, 'no fetch on any of the three non-fresh doors');
  assert.equal(readRunList({ home: w.home }).events.some((e) => e.reason === 'refused before start'), false);
});

test('the refetch flag is derived from the three non-fresh doors only (a resume / door / decide never refetches) and execute() fetches only on it', () => {
  const src = readFileSync(new URL('../src/userrun.js', import.meta.url), 'utf8');
  assert.match(src, /refreeze = argFlag\('resume'\) === null && argFlag\('door'\) === null && argFlag\('decide'\) === null;/);
  assert.match(src, /if \(ctx\.refreeze === true && ctx\.into !== undefined\) \{/);
  assert.equal((src.match(/refreezeUrlInputs\(/g) ?? []).length, 1, 'one call site, after the run is listed');
  assert.ok(src.indexOf('refreezeUrlInputs({ into: ctx.into') > src.indexOf("appendRun(runRow, { home: deps.runlistHome })"), 'the fetch sits after the row append');
});
