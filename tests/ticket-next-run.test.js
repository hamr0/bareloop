// MCP + tickets piece 8 (R6), through the REAL run start: `run-u` on a Tickets job with NO --ticket takes the newest unrun ticket (the look is the real one over a fake MCP server), lists the run
// WITH the ticket number it read, a typed --ticket still wins and never looks, and "nothing new" ends at $0 with a plain line. Fake MCP server, scratch HOME, no model call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { proveRubricInputs } from '../src/source.js';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { readRunList } from '../src/runlist.js';
import { main } from '../src/userrun.js';
import { scriptedProvider } from './helpers.js';
import { FAKE, LIST, newestFirst } from './ticket-world.mjs';

const MCP = { server: 'github', tools: ['issue_read', 'list_issues'] };
const DRAFT_PAGE = `DRAFT-LIST ${'Issues list page text. Open issues of the repository. '.repeat(8)}`;
const tmp = (t, prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };

/** a Tickets job whose filter (P1) skips the fake ticket (P3): the run ends at run start, so no worker is needed; `list` = what the "server" lists, `prior` = rows already in the run list */
async function engine(t, { list = newestFirst(25), argv = [], tools = MCP.tools, prior = [], jobName = 'next-job', serverEnv = {} } = {}) {
  const home = tmp(t, 'next-home-');
  const old = process.env.HOME;
  process.env.HOME = home;
  t.after(() => { process.env.HOME = old; });
  const listFile = join(home, 'list.json');
  writeFileSync(listFile, JSON.stringify(list));
  const calls = join(home, 'calls.jsonl');
  writeFileSync(join(home, '.mcp.json'), JSON.stringify({ mcpServers: { github: { command: process.execPath, args: [FAKE], env: { FAKE_MCP_SERVER: '1', ...serverEnv, FAKE_LIST: listFile, FAKE_CALLS: calls, FAKE_ISSUE: JSON.stringify({ labels: [{ name: 'P3' }] }) } } } }));
  const dir = tmp(t, 'next-run-');
  const into = join(dir, 'source-seed');
  const prep = await proveRubricInputs({ inputs: [{ n: 1, label: 'Issues', value: LIST }], into, fetchUrl: async (u) => ({ ok: true, text: DRAFT_PAGE, url: u }) });
  assert.equal(prep.ok, true, JSON.stringify(prep));
  const closeSource = "console.log('FIXTURE judged=1');\nprocess.exit(1);\n";
  const closeScript = join(dir, 'close.mjs');
  writeFileSync(closeScript, closeSource);
  const spec = {
    schema: 'job-v1', job: jobName, description: 'Newest unrun ticket fixture.', provider: 'anthropic-api', cadence: { unit: 'day', every: 1 }, budgetUsd: 2, maxWallMs: 1_800_000,
    writeScope: ['output/**'], goal: 'Write output/out.txt.', verdictType: 'green', mcp: { server: MCP.server, tools }, flowType: 'tickets', ticketFilter: { priority: ['P1'] }, inputs: [{ n: 1, label: 'Issues', value: LIST }],
    close: [{ name: 'out-exists', cmd: `node ${closeScript} out-exists`, expect: 0, sha256: hashCloseScriptBytes(closeSource) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
  };
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const runs = tmp(t, 'next-runs-');
  if (prior.length) writeFileSync(join(runs, 'runs.jsonl'), `${prior.map((p, i) => JSON.stringify({ at: '2026-10-01T10:00:00.000Z', runid: `old${i}`, job: jobName, spine: join(runs, `old${i}.jsonl`), patient: null, via: 'run-u', ...p })).join('\n')}\n`);
  const provider = scriptedProvider([{ text: 'unused' }]);
  /** @type {string[]} */ const out = []; /** @type {string[]} */ const err = [];
  const rc = await main(['--spec', specPath, '--approve', jobSpecHash(spec), ...argv], { provider, env: {}, out: (s) => out.push(s), err: (s) => err.push(s), runlistHome: runs });
  const listed = readRunList({ home: runs });
  const looked = () => { try { return readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  return { rc, out: out.join('\n'), err: err.join('\n'), listed, row: listed.rows.findLast((r) => r.runid !== undefined && !String(r.runid).startsWith('old')), looked, provider };
}

test('no --ticket: the run takes the newest unrun ticket, says which, and its row lists that ticket', async (t) => {
  const r = await engine(t);
  assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
  assert.match(r.out, /no --ticket given, so this run takes the newest ticket it has not run: #25\./);
  assert.equal(r.row.ticket, 25, 'the run list carries the ticket number');
  assert.equal(r.provider.messagesLog.length, 0, 'no model call (the P1 filter skips the P3 ticket at run start)');
  assert.deepEqual(r.looked().map((c) => c.name), ['list_issues', 'issue_read'], 'one look, then the one ticket read');
  assert.equal(r.looked()[1].arguments.issue_number, 25);
});

test('a job that already ran #25 takes the next newer one; the earlier numbers never run again', async (t) => {
  const r = await engine(t, { list: newestFirst(27), prior: [{ ticket: 25 }] });
  assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
  assert.equal(r.row.ticket, 27);
});

test('Must fail: nothing new -> one plain line, exit non-zero, no run read, $0', async (t) => {
  const r = await engine(t, { list: newestFirst(25), prior: [{ ticket: 25 }] });
  assert.notEqual(r.rc, 0);
  assert.match(r.err, /Nothing new: no ticket newer than #25 has come in\. The run did not start\. Nothing spent\./);
  assert.deepEqual(r.looked().map((c) => c.name), ['list_issues'], 'the ticket itself was never read');
  assert.equal(r.provider.messagesLog.length, 0);
});

test('a typed --ticket still wins and never looks', async (t) => {
  const r = await engine(t, { argv: ['--ticket', '7'] });
  assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
  assert.equal(r.row.ticket, 7);
  assert.deepEqual(r.looked().map((c) => c.name), ['issue_read']);
});

test('Must fail: signed tools without list_issues -> the pick cannot look; it says so and says to start the job again (no Ticket box to type in)', async (t) => {
  const r = await engine(t, { tools: ['issue_read'] });
  assert.notEqual(r.rc, 0);
  assert.match(r.err, /do not include list_issues.*start the job again\. The run did not start\. Nothing spent\./);
});

test('the other jobs\' tickets are not this job\'s: a prior run of ANOTHER job holding #25 does not hide #25', async (t) => {
  const r = await engine(t, { prior: [{ ticket: 25, job: 'other-job' }] });
  assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
  assert.equal(r.row.ticket, 25);
});

// R7b (5): hamr pressed Reuse twice on r7-sched with a locked pass; run-u refused at start and NOTHING showed in the panel (no run-list row). A refusal of the newest-ticket look is now
// a run LISTED first and SETTLED at $0 with the plain words (the same `settled` / `refused before start` row a refused page fetch makes: Runs list + Ended block).
test('Must fail (F287b): a newest-ticket look that is refused (locked pass) lists the run and settles it at $0 with the words; no spine, no model', async (t) => {
  const r = await engine(t, { list: newestFirst(25) });
  const dead = await engine(t, { list: newestFirst(25), serverEnv: { FAKE_REPLY: 'device' } });
  assert.equal(r.rc, 0);
  assert.equal(dead.rc, 2, `${dead.out}\n${dead.err}`);
  assert.match(dead.err, /GitHub token unavailable/);
  assert.equal(dead.provider.messagesLog.length, 0);
  assert.ok(dead.row, 'the refused run IS in the run list (it was invisible before)');
  assert.equal(dead.row.ticket, undefined, 'no ticket was read');
  const ev = dead.listed.events.find((e) => e.runid === dead.row.runid);
  assert.ok(ev, 'a settled event closes the row');
  assert.deepEqual([ev.type, ev.reason, ev.spentUsd, ev.spendComplete], ['settled', 'refused before start', 0, true]);
  assert.match(ev.words, /^The newest ticket could not be looked up\. The reason: GitHub token unavailable.*start the job again\. The run did not start\. Nothing spent\.$/);
  assert.doesNotMatch(ev.words, /Type the ticket number/);
});

test('Must fail (F287b): "nothing new" is listed and settled too, so a by-hand press is never silent', async (t) => {
  const r = await engine(t, { list: newestFirst(25), prior: [{ ticket: 25 }] });
  assert.equal(r.rc, 2);
  const ev = r.listed.events.find((e) => e.runid === r.row?.runid);
  assert.ok(r.row && ev, 'listed and settled');
  assert.match(ev.words, /^Nothing new: no ticket newer than #25 has come in\. The run did not start\. Nothing spent\.$/);
});
