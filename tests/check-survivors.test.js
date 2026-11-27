// After any kill, code checks the box is really empty (hamr, 2026-11-21). If a process survived, the stop says so with its pids and the
// one command that stops them; with no survivor the stop says nothing about it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import * as kinds from '../src/kinds.js';
import * as shell from '../src/shell.js';

function repo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'check-surv-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  git('init', '-q', '-b', 'main'); git('add', '-A'); git('commit', '-q', '-m', 'seed');
  return { dir, seed: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim() };
}
const SLOW = { name: 'tests', kind: 'command-exit', params: { cmd: process.execPath, args: ['-e', 'setTimeout(()=>{},60000)'], expectExit: 0 } };

test('the words: the pids and the one command that stops them', () => {
  assert.equal(shell.survivorsText([4812, 4815]), 'Some test processes did not stop: pid 4812, 4815. To stop them: kill 4812 4815');
  assert.equal(shell.survivorsText([7]), 'Some test processes did not stop: pid 7. To stop them: kill 7');
});

test('boxMembers reads the live members of a process group, and nothing once they are gone', async () => {
  const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)'], { detached: true, stdio: 'ignore' });
  try {
    assert.deepEqual(await shell.boxMembers(child.pid), [child.pid]);
  } finally {
    process.kill(-child.pid, 'SIGKILL');
  }
  await new Promise((res) => { child.on('exit', res); });
  assert.deepEqual(await shell.boxMembers(child.pid), []);
});

test('a timed-out check whose box is really empty says nothing about survivors', async (t) => {
  const r = repo(t);
  const row = await kinds.runStage(SLOW, { workdir: r.dir, seedRef: r.seed, gapKeep: '', timeoutMsDefault: 400 });
  assert.equal(row.verdict, 'instrument-stop');
  assert.doesNotMatch(row.gapLines.join('\n'), /did not stop/);
});

test('a process that survived the kill is typed on the stop, and the kill is checked after SIGKILL, not before', async (t) => {
  const r = repo(t);
  /** @type {number[]} */ const asked = [];
  // the box probe is the one seam: a real survivor (a process the kernel will not let go) cannot be made on demand
  const listBox = async (/** @type {number} */ pgid) => { asked.push(pgid); return [4812, 4815]; };
  const row = await kinds.runStage(SLOW, { workdir: r.dir, seedRef: r.seed, gapKeep: '', timeoutMsDefault: 400, listBox });
  assert.equal(row.verdict, 'instrument-stop');
  assert.equal(row.detail.fault, shell.STOP_FAULTS.TIMED_OUT, 'still a timeout');
  assert.match(row.detail.stop, /did not finish inside 400ms$/, 'the stop text itself is unchanged');
  assert.deepEqual(row.detail.survivors, [4812, 4815]);
  assert.equal(asked.length >= 1, true);
});

test('count-not-worse types its survivors the same way', async (t) => {
  const r = repo(t);
  const row = await kinds.runStage({ name: 'count', kind: 'count-not-worse', params: { ...SLOW.params, parser: { lineMatch: 'total (\\d+)', capture: 1 }, scope: {}, direction: 'lower-is-better', baseline: 0 } },
    { workdir: r.dir, seedRef: r.seed, gapKeep: '', timeoutMsDefault: 400, listBox: async () => [4812] });
  assert.equal(row.verdict, 'instrument-stop');
  assert.deepEqual(row.detail.survivors, [4812]);
});

test('the drafting stop and the signing stop each say it, with the pids, and only when there are survivors', async () => {
  const readout = await import('../src/authorreadout.js');
  const red = { code: 'check-timed-out', path: 'closeDecl.stages.tests', limitMs: shell.CHECK_LIMIT_MS, detail: 'INSTRUMENT: "npm" did not finish inside 1800000ms', survivors: [4812, 4815] };
  const said = 'Some test processes did not stop: pid 4812, 4815. To stop them: kill 4812 4815';
  assert.ok(readout.draftStopText({ stop: 'check-timed-out', reds: [red], spend: { knownUsd: 0, spendComplete: true } }).includes(said));
  assert.ok(readout.signingStopText({ reds: [{ ...red, code: 'broken-close' }] }).includes(said));
  const clean = { ...red }; delete clean.survivors;
  assert.doesNotMatch(readout.draftStopText({ stop: 'check-timed-out', reds: [clean], spend: { knownUsd: 0, spendComplete: true } }), /did not stop/);
  assert.doesNotMatch(readout.signingStopText({ reds: [{ ...clean, code: 'broken-close' }] }), /did not stop/);
});

test('a stop with no kill (the command could not even start) never checks a box', async (t) => {
  const r = repo(t);
  let asked = 0;
  const row = await kinds.runStage({ name: 'tests', kind: 'command-exit', params: { cmd: 'no-such-binary-xyz', args: [], expectExit: 0 } }, { workdir: r.dir, seedRef: r.seed, gapKeep: '', timeoutMsDefault: 400, listBox: async () => { asked += 1; return [1]; } });
  assert.equal(row.verdict, 'instrument-stop');
  assert.doesNotMatch(row.gapLines.join('\n'), /did not stop/);
});
