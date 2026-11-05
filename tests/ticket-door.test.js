// MCP + tickets piece 3 (R6), the door: a schedule on a Tickets MCP job is signed with the SAME two clicks as any other (the look reads with the SIGNED `list_issues`; refused at sign time in
// plain words when it is not signed), and a ticket fire goes through the real door and the real starter in the same order as a file's: busy, monthly, wouldAccept, started. A ticket fire leaves
// the signed spec UNCHANGED (hash equal, like a clock fire) and the number rides on argv. Ported from fwd test/m12-p2-door.test.js@v0.29.0.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createStarter, perFireSpec } from '../src/panel/schedulestart.js';
import { signRun } from '../src/panel/authorroutes.js';
import { cardFields } from '../src/panel/authorsession.js';
import { getStartFrom } from '../src/panel/server.js';
import { keysForDoor, keysHome as kHome } from '../src/keysfile.js';
import { rowsForHome } from '../src/providerrows.js';
import { jobSpecHash, workflowKey } from '../src/job.js';
import { readLedger } from '../src/triggerledger.js';
import { readSeen, queueOf } from '../src/triggerfiles.js';
import { recordLook } from '../src/triggertickets.js';
import { startedWords, scheduledWords, sectionThisRunWords, startedAuditWords } from '../src/schedulewords.js';
import {
  clock, keysHome, makeRun, panel, recordingSpawn, specOf, tmp, SLOT,
} from './trigger-world.mjs';
import { LIST } from './ticket-world.mjs';

const WHEN = { kind: 'new-ticket', input: 'issues' };
const TOOLS = ['issue_read', 'list_issues'];
const ticketCause = (n = 7, extra = {}) => ({ kind: 'ticket', number: n, sha: `ticket:${n}`, ...extra });

/** a Tickets MCP rubric job with one good run, its schedule signed through the two clicks (or not), the real starter with a recorded session factory and spawn */
async function world({ tools = TOOLS, flow = 'tickets', label = 'issues', value = LIST, sign = true, when = WHEN, ticketWatch } = {}) {
  const home = keysHome();
  const base = specOf({ files: true });
  const spec = { ...base, inputs: [{ n: 1, label, value }], ...(flow === 'plain' ? {} : { flowType: flow, mcp: { server: 'github', tools } }), ...(ticketWatch ? { ticketWatch } : {}) };
  makeRun(home, { runid: 'r1', spec, accepted: true });
  const now = clock(SLOT - 3600_000);
  const p = await panel({ home, now });
  const body = { runid: 'r1', when, inputs: `${label}: ${value}`, destination: '/tw/out', capUsd: 1.5, maxWallMs: 600000 };
  const pre = await p.post('/api/author/schedule-prepare', body);
  let set = null;
  if (sign && pre.status === 200) {
    set = await p.post('/api/author/schedule', { ...body, hash: pre.body.hash });
    assert.equal(set.status, 200, JSON.stringify(set.body));
  }
  const spawnFn = recordingSpawn();
  /** @type {any[]} */ const made = [];
  const startSession = async (card, reuse, inputs, o) => {
    const outDir = tmp('tk-sess-');
    const resolvedSpecPath = join(outDir, 'resolved-spec.json');
    writeFileSync(resolvedSpecPath, JSON.stringify(reuse.spec));
    // the real session keeps the card's fields (src/panel/authorsession.js createSession): `signRun` reads `ticket` from there
    const session = { state: { id: `s${made.length + 1}`, phase: 'prepared', specHash: jobSpecHash(reuse.spec), resolvedSpecPath, outDir, card: cardFields(card), steps: [] }, abandon() {} };
    made.push({ card, reuse, inputs, o, session });
    return { ok: true, session };
  };
  const envNow = () => keysForDoor({ env: {}, keysHome: home }).env;
  const starter = createStarter({
    door: p.schedules, startSession, envNow, spawnFn, bareloopBin: '/x/bareloop.mjs', sessionsRoot: tmp('tk-root-'), home, childGraceMs: 40,
    rowsFor: () => rowsForHome(kHome(home), envNow()), startFrom: (runid) => getStartFrom(runid, { home }),
  });
  p.schedules.attachStarter(starter);
  now.set(SLOT + 60_000);
  const dir = join(home, 'triggers', 'sched-job');
  return {
    home, p, now, door: p.schedules, spawnFn, made, spec, body, pre, set, starter, dir, ledger: join(dir, 'ledger.jsonl'),
    rows: () => readLedger(join(dir, 'ledger.jsonl')).rows,
    schedule: () => JSON.parse(readFileSync(join(dir, 'schedule.json'), 'utf8')),
  };
}

test('signing: a new-ticket schedule on a Tickets MCP job whose signed tools hold list_issues is signed in two clicks; the trigger holds ONLY the input; armed', async () => {
  const w = await world();
  assert.equal(w.pre.status, 200, JSON.stringify(w.pre.body));
  assert.equal(w.pre.body.words, 'When a new ticket arrives in issues');
  const sch = w.schedule();
  assert.deepEqual(sch.trigger, WHEN, 'no list address, server or tool is stored in the trigger');
  assert.deepEqual(sch.spec.trigger, WHEN);
  assert.equal(sch.spec.mcp.server, 'github');
  assert.deepEqual(w.rows().map((r) => r.kind), ['signed', 'armed']);
});

test('Must fail: list_issues not in the signed tools -> refused at sign time in plain words, nothing written', async () => {
  const w = await world({ tools: ['issue_read'], sign: false });
  assert.equal(w.pre.status, 400);
  assert.equal(w.pre.body.refused, 'bad-trigger');
  assert.match(w.pre.body.say, /do not include list_issues, the tool that looks for new tickets/);
  assert.match(w.pre.body.say, /Nothing was changed\.$/);
  assert.deepEqual(w.rows(), []);
});

test('Must fail: a plain job, an MCP (not Tickets) job, an unknown input name and a non-issues input are each refused with their own words', async () => {
  const plain = await world({ flow: 'plain', sign: false });
  assert.equal(plain.pre.status, 400);
  assert.match(plain.pre.body.say, /Only a Tickets MCP job can start on a new ticket/);
  const mcp = await world({ flow: 'mcp', sign: false });
  assert.match(mcp.pre.body.say, /Only a Tickets MCP job can start on a new ticket/);
  const nolabel = await world({ when: { kind: 'new-ticket', input: 'nope' }, sign: false });
  assert.match(nolabel.pre.body.say, /The input "nope" is not one of this job's Inputs/);
  const pulls = await world({ value: 'https://github.com/flutter/flutter/pulls', sign: false });
  assert.match(pulls.pre.body.say, /not a ticket list \(a GitHub issues page\)/);
});

test('Must fail: a trigger carrying a list, server or tool is refused (the spec already signs them)', async () => {
  const w = await world({ when: { kind: 'new-ticket', input: 'issues', list: LIST }, sign: false });
  assert.equal(w.pre.status, 400);
  assert.match(w.pre.body.say, /trigger field "list" is not allowed/);
});

test('a ticket fire runs the full order: one `ran` row then one `started`; --ticket N on argv; the spec is the signed one (same hash); trigger.json says which ticket', async () => {
  const w = await world();
  const r = await w.door.fire('sched-job', ticketCause(7));
  assert.equal(r.outcome, 'started', JSON.stringify(r));
  assert.deepEqual(w.rows().map((x) => x.kind), ['signed', 'armed', 'ran', 'started']);
  const ran = w.rows().find((x) => x.kind === 'ran');
  assert.deepEqual([ran.id, ran.sha, ran.name, ran.sig], ['ran:ticket:7', 'ticket:7', '#7', w.schedule().specHash]);
  const { args } = w.spawnFn.spawns[0];
  assert.equal(args[args.indexOf('--ticket') + 1], '7');
  assert.ok(args.includes('--review-door'));
  assert.equal(args[args.indexOf('--approve') + 1], w.schedule().specHash, 'a ticket fire signs the schedule\'s own spec: the number is per run, never in the hash');
  assert.equal(w.made[0].card.ticket, '7');
  assert.equal(w.made[0].o.headless, true);
  const trig = JSON.parse(readFileSync(join(w.made[0].session.state.outDir, 'trigger.json'), 'utf8'));
  assert.deepEqual([trig.kind, trig.ticket, trig.sha, trig.triggerKind], ['ticket', 7, 'ticket:7', 'new-ticket']);
  assert.match(trig.reason, /^Started by the schedule: When a new ticket arrives in issues$/);
});

test('perFireSpec: a ticket cause changes nothing in the spec', async () => {
  const w = await world();
  const s = w.schedule();
  const f = perFireSpec(s, { kind: 'ticket' });
  assert.equal(f.ok, true);
  assert.equal(f.hash, s.specHash);
  assert.deepEqual(f.spec, s.spec);
  assert.equal(workflowKey(f.spec), s.workflowKey);
});

test('signRun reads the ticket from the session card, so the scheduled run takes the arrived ticket, not the newest one', () => {
  const spawnFn = recordingSpawn();
  const outDir = tmp('tk-sign-');
  const resolvedSpecPath = join(outDir, 'resolved-spec.json');
  writeFileSync(resolvedSpecPath, '{}');
  const session = { state: { phase: 'prepared', specHash: 'abc', resolvedSpecPath, outDir, steps: [], card: { ticket: '12' } } };
  assert.equal(signRun(session, 'abc', { env: {}, spawnFn, bareloopBin: '/x', home: outDir }).ok, true);
  const { args } = spawnFn.spawns[0];
  assert.equal(args[args.indexOf('--ticket') + 1], '12');
});

test('busy: a ticket fire while a run is going -> one `busy` row, no `ran`, no session; told once', async () => {
  const w = await world();
  for (let i = 0; i < 4; i += 1) assert.equal((await w.door.fire('sched-job', ticketCause(7), { busy: true })).outcome, 'busy');
  assert.deepEqual(w.rows().map((x) => x.kind), ['signed', 'armed', 'busy']);
  assert.equal(w.made.length, 0);
  assert.equal(w.spawnFn.spawns.length, 0);
});

test('Must fail: a refused ticket fire consumes nothing and makes NO session on any later tick (the key is gone: wouldAccept says no before a session exists)', async () => {
  const w = await world();
  writeFileSync(join(w.home, '.env'), '', { mode: 0o600 });
  for (let i = 0; i < 5; i += 1) assert.equal((await w.door.fire('sched-job', ticketCause(7))).outcome, 'refused');
  assert.equal(w.made.length, 0, 'no session is made every tick');
  assert.equal(w.spawnFn.spawns.length, 0);
  assert.equal(w.rows().filter((x) => x.kind === 'refused').length, 1, 'told once');
  assert.equal(w.rows().some((x) => x.kind === 'ran'), false, 'nothing consumed: the ticket stays queued');
});

test('a ticket that already has a `ran` row in this signing is never started a second time', async () => {
  const w = await world();
  assert.equal((await w.door.fire('sched-job', ticketCause(7))).outcome, 'started');
  const again = await w.door.fire('sched-job', ticketCause(7), { busy: false });
  assert.equal(again.outcome, 'refused');
  assert.match(again.why, /already started/);
  assert.equal(w.spawnFn.spawns.length, 1);
});

test('the queue is the signing\'s: cancelling drops every waiting ticket with its reason, one `dropped` row each', async () => {
  const w = await world();
  const sig = w.schedule().specHash;
  const look = { ok: true, first: false, found: [{ number: 8, state: 'open', labels: [] }, { number: 9, state: 'open', labels: [] }], changed: [], pages: 1 };
  recordLook(w.ledger, sig, look, 5_000);
  assert.deepEqual(queueOf(readSeen(w.ledger, sig)).map((q) => q.number), [8, 9]);
  assert.equal(w.door.cancel('sched-job'), true);
  const dropped = w.rows().filter((x) => x.kind === 'dropped');
  assert.deepEqual(dropped.map((d) => [d.of, d.why]), [['arrived:ticket:8', 'schedule-cancelled'], ['arrived:ticket:9', 'schedule-cancelled']]);
  assert.equal(w.rows().filter((x) => x.kind === 'changed').length, 2);
  assert.match(w.rows().find((x) => x.kind === 'changed').say, /#8 was waiting to run and did not: the schedule was cancelled/);
});

test('the schedule card and the Run tab say it in words: When a new ticket arrives in issues / next: waiting for a new ticket', async () => {
  const w = await world();
  const v = w.door.view('sched-job');
  assert.equal(v.scheduled, true);
  assert.equal(v.text, 'When a new ticket arrives in issues');
  assert.equal(v.nextWords, 'next: waiting for a new ticket');
  assert.match(v.next, /Watching for it\. A run starts for each new ticket\./);
  assert.equal(w.door.cardFor('sched-job').now, 'When a new ticket arrives in issues');
  assert.equal(scheduledWords(WHEN), 'When a new ticket arrives in issues');
});

test('the Job tab and Audit say how a ticket run began', () => {
  const rec = { kind: 'ticket', ticket: 7, trigger: 'When a new ticket arrives in issues', triggerKind: 'new-ticket' };
  assert.match(startedWords(rec, null), /^By a new ticket: #7$/);
  assert.equal(sectionThisRunWords(rec), 'started by the schedule · new ticket #7');
  assert.equal(startedAuditWords(rec, 3), 'started by the schedule · new ticket #7 · from run-3');
});

test('a schedule on a Tickets job still needs the job\'s good run: no green, no schedule (the same gate as every kind)', async () => {
  const home = keysHome();
  const p = await panel({ home, now: clock(SLOT) });
  const r = await p.post('/api/author/schedule-prepare', { runid: 'nope', when: WHEN, inputs: `issues: ${LIST}`, destination: '/tw/out', capUsd: 1, maxWallMs: 1 });
  assert.notEqual(r.status, 200);
});
