// MCP + tickets piece 3 (R6), the look: one $0 look at a ticket list through the job's server with `allow` = only the signed `list_issues`. The REAL bare-agent bridge against the fake stdio
// server (FAKE_LIST), no network, no model. Ported from fwd test/m12-p2-look.test.js@v0.29.0, plus the ledger rows (`recordLook`) with an injected clock.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  lookTickets, reasonFor, recordLook, recordTicketRan, seenNumbers, lastSeen, hasBaseline, lookProblemOf, TICKET_LOOK_MS, LOOK_TOOL,
} from '../src/triggertickets.js';
import { readSeen, queueOf } from '../src/triggerfiles.js';
import {
  ticketWorld, newestFirst, issue, LIST, MCP, MIN,
} from './ticket-world.mjs';

/** a look over a world's server */
const lookOf = (w) => (over = {}) => lookTickets({ listUrl: LIST, mcp: MCP, configPath: w.configPath, seen: null, last: new Map(), watch: [], perPage: 10, ...over });

describe('the first look is the starting point', () => {
  test('first page only, newest first, called through list_issues alone; nothing else exists for the look', async (t) => {
    const w = ticketWorld(t);
    const r = await lookOf(w)();
    assert.equal(r.ok, true, r.ok ? '' : r.error);
    assert.equal(r.first, true);
    assert.deepEqual(r.found.map((i) => i.number), [25, 24, 23, 22, 21, 20, 19, 18, 17, 16]);
    assert.equal(r.pages, 1);
    assert.deepEqual(w.callsMade().map((c) => c.name), ['list_issues']);
    assert.deepEqual(w.callsMade()[0].arguments, {
      owner: 'flutter', repo: 'flutter', orderBy: 'CREATED_AT', direction: 'DESC', perPage: 10, state: 'OPEN', fields: ['number', 'created_at', 'state', 'labels'],
    });
  });
  test('the look tool is list_issues and the cadence is 15 minutes, fixed', () => {
    assert.equal(LOOK_TOOL, 'list_issues');
    assert.equal(TICKET_LOOK_MS, 15 * MIN);
  });
});

describe('later looks: newest first, cursor, stop at a seen number', () => {
  test('3 new tickets: one page, stops at the first seen number', async (t) => {
    const w = ticketWorld(t, { issues: newestFirst(28) });
    const r = await lookOf(w)({ seen: new Set(Array.from({ length: 25 }, (_, i) => i + 1)) });
    assert.equal(r.ok, true, r.ok ? '' : r.error);
    assert.equal(r.first, false);
    assert.deepEqual(r.found.map((i) => i.number), [28, 27, 26]);
    assert.equal(r.pages, 1);
  });
  test('FLOOD: 23 new tickets between two looks (more than one page) are followed across pages with the cursor and end at the seen number, none lost, none twice', async (t) => {
    const w = ticketWorld(t, { issues: newestFirst(48) });
    const r = await lookOf(w)({ seen: new Set(Array.from({ length: 25 }, (_, i) => i + 1)) });
    assert.equal(r.ok, true, r.ok ? '' : r.error);
    assert.deepEqual(r.found.map((i) => i.number), Array.from({ length: 23 }, (_, i) => 48 - i));
    assert.equal(new Set(r.found.map((i) => i.number)).size, 23, 'none twice');
    assert.equal(r.pages, 3);
    assert.deepEqual(w.callsMade().map((c) => c.arguments.after), [undefined, '10', '20']);
  });
  test('Must fail: a flood past the page cap is unreadable, never silently cut', async (t) => {
    const w = ticketWorld(t, { issues: newestFirst(260) });
    const r = await lookOf(w)({ seen: new Set([1]), perPage: 10 });
    assert.equal(r.ok, false);
    assert.match(r.error, /more than 20 pages/);
  });
  test('nothing new is a real "0 new": ok, found empty', async (t) => {
    const w = ticketWorld(t, { issues: newestFirst(25) });
    const r = await lookOf(w)({ seen: new Set(Array.from({ length: 25 }, (_, i) => i + 1)) });
    assert.equal(r.ok, true);
    assert.deepEqual(r.found, []);
  });
  test('9.2: new only above the highest seen - an older open ticket the list shows again is not new (a seen ticket that closed leaves the OPEN list)', async (t) => {
    const w = ticketWorld(t, { issues: [issue(30), issue(29), issue(27), issue(20)] });
    const r = await lookOf(w)({ seen: new Set([28, 25]), last: new Map() });
    assert.deepEqual(r.found.map((i) => i.number), [30, 29]);
  });
  test('9.6: numbers compare as numbers, not text (#10 is after #9)', async (t) => {
    const w = ticketWorld(t, { issues: [issue(10), issue(9), issue(8)] });
    const r = await lookOf(w)({ seen: new Set([9]) });
    assert.deepEqual(r.found.map((i) => i.number), [10]);
  });
  test('9.7: a number over the cap is ignored and named, never a crash', async (t) => {
    const w = ticketWorld(t, { issues: [issue(12345678901), issue(5), issue(4)] });
    const r = await lookOf(w)({ seen: new Set([4]) });
    assert.equal(r.ok, true);
    assert.deepEqual(r.found.map((i) => i.number), [5]);
    assert.deepEqual(r.ignored, [12345678901]);
  });
});

describe('Must fail: an unreadable list is never "0 new"', () => {
  const seen = new Set([1, 2, 3]);
  test("GitHub's device-login text -> unreadable, naming the token", async (t) => {
    const w = ticketWorld(t, { env: { FAKE_REPLY: 'device' } });
    assert.deepEqual(await lookOf(w)({ seen }), { ok: false, error: 'GitHub token unavailable — is pass locked?' });
  });
  test('a server error -> unreadable with its first line only', async (t) => {
    const w = ticketWorld(t, { env: { FAKE_REPLY: 'error' } });
    const r = await lookOf(w)({ seen });
    assert.equal(r.ok, false);
    assert.match(r.error, /Could not resolve to a Repository/);
    assert.doesNotMatch(r.error, /second line/);
  });
  test('no list in the answer (empty content) -> unreadable', async (t) => {
    const w = ticketWorld(t, { env: { FAKE_REPLY: 'empty' } });
    const r = await lookOf(w)({ seen });
    assert.equal(r.ok, false);
    assert.match(r.error, /no ticket list/);
  });
  test('a list with no tickets on its first page -> unreadable, never a starting point of nothing', async (t) => {
    const w = ticketWorld(t, { issues: [] });
    for (const over of [{}, { seen }]) {
      const r = await lookOf(w)(over);
      assert.equal(r.ok, false);
      assert.match(r.error, /came back empty/);
    }
  });
  test('the server lacks the signed tool -> unreadable, by name; a tool with no read-only mark still looks (hints are info only)', async (t) => {
    const a = ticketWorld(t, { env: { FAKE_TOOLS: JSON.stringify([{ name: 'issue_read', annotations: { readOnlyHint: true } }]) } });
    assert.match((await lookOf(a)({ seen })).error, /github does not offer list_issues/);
    const b = ticketWorld(t, { env: { FAKE_TOOLS: JSON.stringify([{ name: 'list_issues' }]) } });
    const r = await lookOf(b)({ seen });
    assert.equal(r.ok, true, r.ok ? '' : r.error);
  });
  test('a server that is not in the config, an address that is not a GitHub issues list, and a pulls list -> unreadable', async (t) => {
    const w = ticketWorld(t);
    assert.match((await lookOf(w)({ seen, mcp: { server: 'nope', tool: 'list_issues' } })).error, /nope is not in ~\/\.mcp\.json/);
    assert.match((await lookOf(w)({ seen, listUrl: 'https://example.com/a/b/issues' })).error, /not a GitHub issues or pull requests address/);
    assert.match((await lookOf(w)({ seen, listUrl: 'https://github.com/a/b/pulls' })).error, /pull request list/);
  });
});

describe('watched fields: code compares typed values; an unwatched edit is nothing', () => {
  test('reasonFor: state, labels added/removed, only for the watched fields', () => {
    const prev = { state: 'open', labels: ['bug'] };
    assert.equal(reasonFor(prev, { state: 'closed', labels: ['bug'] }, ['state']), 'state open→closed');
    assert.equal(reasonFor(prev, { state: 'open', labels: ['bug', 'P2'] }, ['labels']), 'label added: P2');
    assert.equal(reasonFor(prev, { state: 'open', labels: [] }, ['labels']), 'label removed: bug');
    assert.equal(reasonFor(prev, { state: 'closed', labels: ['P2'] }, []), '');
    assert.equal(reasonFor(prev, { state: 'closed', labels: ['bug'] }, ['labels']), '');
  });
  const tracked = (state, labels = []) => ({ state, labels });
  test('a seen ticket whose watched state changed is reported once with its reason; one whose unwatched title changed is not', async (t) => {
    const l = newestFirst(5).map((i) => ({ ...i, title: 't' }));
    const w = ticketWorld(t, { issues: l });
    const last = new Map([[5, tracked('open')], [4, tracked('open')], [3, tracked('open')], [2, tracked('open')], [1, tracked('open')]]);
    w.setList(l.map((i) => (i.number === 3 ? { ...i, state: 'CLOSED' } : i.number === 4 ? { ...i, title: 'edited' } : i)));
    const r = await lookOf(w)({ seen: new Set(last.keys()), last, watch: ['state'] });
    assert.equal(r.ok, true, r.ok ? '' : r.error);
    assert.deepEqual(r.found, []);
    assert.deepEqual(r.changed.map((c) => [c.number, c.reason, c.state]), [[3, 'state open→closed', 'closed']]);
    assert.equal(w.callsMade()[0].arguments.state, undefined, 'a watched state needs closed tickets too');
  });
  test('watched labels (objects) changing arrives once; the walk goes past the first seen number to reach tracked tickets', async (t) => {
    const l = newestFirst(25);
    const w = ticketWorld(t, { issues: l });
    const last = new Map([[24, tracked('open')], [3, tracked('open', ['bug'])]]);
    w.setList(l.map((i) => (i.number === 3 ? { ...i, labels: [{ name: 'bug' }, { name: 'P2' }] } : i)));
    const r = await lookOf(w)({ seen: new Set([25, ...last.keys()]), last, watch: ['labels'] });
    assert.equal(r.ok, true, r.ok ? '' : r.error);
    assert.deepEqual(r.changed.map((c) => [c.number, c.reason]), [[3, 'label added: P2']]);
    assert.equal(r.pages, 3, 'ten per page: 25-16, 15-6, 5-1');
  });
  test('Must fail: no watched field named -> a change to state or labels is nothing, and the walk stops at the first seen number', async (t) => {
    const l = newestFirst(5).map((i) => (i.number === 2 ? { ...i, state: 'CLOSED' } : i));
    const w = ticketWorld(t, { issues: l });
    const r = await lookOf(w)({ seen: new Set([1, 2, 3, 4, 5]), last: new Map([[2, tracked('open')]]), watch: [] });
    assert.deepEqual([r.found, r.changed], [[], []]);
    assert.equal(r.pages, 1);
  });
});

describe('the ledger rows (recordLook), clock injected', () => {
  const sigA = 'sig-a';
  const ledgerIn = (w) => join(w.dir, 'ledger.jsonl');
  /** one tick of the look the way the scheduler does it: read what the signing has, look, record at `at` */
  async function step(w, sig, at, over = {}) {
    const ledger = ledgerIn(w);
    const first = !hasBaseline(ledger, sig);
    const r = await lookOf(w)({ seen: first ? null : seenNumbers(ledger, sig), last: first ? new Map() : lastSeen(ledger, sig), ...over });
    return { r, w: recordLook(ledger, sig, r, at) };
  }
  test('the first look writes a baseline row per ticket on the page and nothing arrives; the second reports only issues newer than the highest seen', async (t) => {
    const w = ticketWorld(t, { issues: newestFirst(5) });
    const a = await step(w, sigA, 1_000_000);
    assert.deepEqual(a.w, { arrived: [], unreadable: null });
    const rows = readSeen(ledgerIn(w), sigA);
    assert.deepEqual(rows.filter((r) => r.kind === 'baseline').map((r) => r.number).sort((x, y) => x - y), [1, 2, 3, 4, 5]);
    assert.ok(rows.every((r) => r.sig === sigA && r.size === 0 && r.name === `#${r.number}` && r.sha === `ticket:${r.number}`));
    w.setList(newestFirst(7));
    const b = await step(w, sigA, 1_000_000 + 15 * MIN);
    assert.deepEqual(b.w.arrived, [6, 7], 'oldest first');
    const arrived = readSeen(ledgerIn(w), sigA).filter((r) => r.kind === 'arrived');
    assert.deepEqual(arrived.map((r) => [r.number, r.at, r.id]), [[6, 1_000_000 + 15 * MIN, 'arrived:ticket:6'], [7, 1_000_000 + 15 * MIN, 'arrived:ticket:7']], 'the arrival time is the injected clock');
    assert.deepEqual(queueOf(readSeen(ledgerIn(w), sigA)).map((q) => q.number), [6, 7]);
    const c = await step(w, sigA, 1_000_000 + 30 * MIN);
    assert.deepEqual(c.w.arrived, [], 'a seen ticket never arrives again');
  });
  test('Must fail: an unreadable first look writes ONE `unreadable` row with its cause and NO baseline; the next look is a first look again', async (t) => {
    const w = ticketWorld(t, { env: { FAKE_REPLY: 'device' } });
    const a = await step(w, sigA, 5_000);
    assert.equal(a.w.unreadable, 'GitHub token unavailable — is pass locked?');
    const rows = readSeen(ledgerIn(w), sigA);
    assert.deepEqual(rows.map((r) => r.kind), ['unreadable']);
    assert.equal(rows[0].why, 'GitHub token unavailable — is pass locked?');
    assert.equal(hasBaseline(ledgerIn(w), sigA), false);
    assert.deepEqual(lookProblemOf(rows), { at: 5_000, why: 'GitHub token unavailable — is pass locked?' });
    await step(w, sigA, 5_000 + 15 * MIN);
    assert.equal(readSeen(ledgerIn(w), sigA).filter((r) => r.kind === 'unreadable').length, 2, 'one row per failed look');
  });
  test('Must fail: a later unreadable look neither arrives nor loses the seen list; a read after it writes ONE `looked` row that ends the problem', async (t) => {
    const w = ticketWorld(t, { issues: newestFirst(5) });
    await step(w, sigA, 1_000);
    w.setList([]);
    const bad = await step(w, sigA, 2_000);
    assert.match(bad.w.unreadable, /came back empty/);
    assert.notEqual(lookProblemOf(readSeen(ledgerIn(w), sigA)), null);
    w.setList(newestFirst(6));
    const good = await step(w, sigA, 3_000);
    assert.deepEqual(good.w.arrived, [6], 'the starting point survived the bad look');
    const rows = readSeen(ledgerIn(w), sigA);
    assert.equal(rows.filter((r) => r.kind === 'looked').length, 1);
    assert.equal(lookProblemOf(rows), null);
  });
  test('watched state: a change arrives once with its reason and a distinct id; the same value later arrives nothing; an arrival and a change of one ticket never share an id', async (t) => {
    const w = ticketWorld(t, { issues: newestFirst(5) });
    await step(w, sigA, 1_000, { watch: ['state'] });
    w.setList(newestFirst(5).map((i) => (i.number === 3 ? { ...i, state: 'CLOSED' } : i)));
    const b = await step(w, sigA, 2_000, { watch: ['state'] });
    assert.deepEqual(b.w.arrived, [3]);
    const arrived = readSeen(ledgerIn(w), sigA).filter((r) => r.kind === 'arrived');
    assert.deepEqual(arrived.map((r) => [r.number, r.reason, r.id, r.sha]), [[3, 'state open→closed', 'arrived:ticket:3:0', 'ticket:3:0']]);
    const c = await step(w, sigA, 3_000, { watch: ['state'] });
    assert.deepEqual(c.w.arrived, [], 'the same value again is no change');
    // a NEW ticket 6 arrives, then it changes: first arrival id vs change id differ
    w.setList([issue(6), ...newestFirst(5).map((i) => (i.number === 3 ? { ...i, state: 'CLOSED' } : i))]);
    await step(w, sigA, 4_000, { watch: ['state'] });
    recordTicketRan(ledgerIn(w), sigA, { sha: 'ticket:6', name: '#6' }, 4_500); // its run started: a later change is a new arrival
    w.setList([issue(6, { state: 'CLOSED' }), ...newestFirst(5).map((i) => (i.number === 3 ? { ...i, state: 'CLOSED' } : i))]);
    await step(w, sigA, 5_000, { watch: ['state'] });
    const ids = readSeen(ledgerIn(w), sigA).filter((r) => r.kind === 'arrived' && r.number === 6).map((r) => r.id);
    assert.deepEqual(ids, ['arrived:ticket:6', 'arrived:ticket:6:1']);
    assert.equal(new Set(readSeen(ledgerIn(w), sigA).map((r) => r.id)).size, readSeen(ledgerIn(w), sigA).length, 'no two rows share an id');
  });
  test('a watched change on a ticket still queued is ONE queued run: the last-seen value advances (a baseline row) and nothing new arrives', async (t) => {
    const w = ticketWorld(t, { issues: newestFirst(5) });
    await step(w, sigA, 1_000, { watch: ['state'] });
    w.setList(newestFirst(5).map((i) => (i.number === 3 ? { ...i, state: 'CLOSED' } : i)));
    await step(w, sigA, 2_000, { watch: ['state'] });
    w.setList(newestFirst(5));
    const b = await step(w, sigA, 3_000, { watch: ['state'] });
    assert.deepEqual(b.w.arrived, [], 'ticket 3 is queued: a second change queues no second run');
    assert.equal(queueOf(readSeen(ledgerIn(w), sigA)).length, 1);
    assert.equal(lastSeen(ledgerIn(w), sigA).get(3).state, 'open');
  });
  test('rows are per signing: a new signing has its own starting point (the same ticket may baseline again)', async (t) => {
    const w = ticketWorld(t, { issues: newestFirst(3) });
    await step(w, 'sig-1', 1_000);
    await step(w, 'sig-2', 2_000);
    assert.equal(readSeen(ledgerIn(w), 'sig-1').length, 3);
    assert.equal(readSeen(ledgerIn(w), 'sig-2').length, 3);
    assert.ok(readSeen(ledgerIn(w), 'sig-2').every((r) => r.sig === 'sig-2'), 'a signing reads only its own rows');
    assert.equal(readSeen(ledgerIn(w)).length, 6, 'both signings are in the one ledger');
  });
  test('the first look with a cut (the highest ticket the first green run read): up to it baselines, above it arrives and runs once the schedule is on', async (t) => {
    const w = ticketWorld(t, { issues: newestFirst(15) });
    const r = await lookOf(w)({ cut: 12 });
    const out = recordLook(ledgerIn(w), sigA, r, 9_000);
    assert.deepEqual(out.arrived, [13, 14, 15]);
    const rows = readSeen(ledgerIn(w), sigA);
    assert.deepEqual(rows.filter((x) => x.kind === 'baseline').map((x) => x.number).sort((a, b) => a - b), [6, 7, 8, 9, 10, 11, 12], 'the page that held the cut: 15-6');
    assert.deepEqual(rows.filter((x) => x.kind === 'arrived').map((x) => x.number), [13, 14, 15]);
  });
  test('ignored over-cap numbers leave ONE `looked` note naming them', async (t) => {
    const w = ticketWorld(t, { issues: [issue(12345678901), issue(5), issue(4)] });
    await step(w, sigA, 1_000);
    const looked = readSeen(ledgerIn(w), sigA).filter((r) => r.kind === 'looked');
    assert.equal(looked.length, 1);
    assert.match(looked[0].why, /ignored 1 ticket number over 9,999,999,999: 12345678901/);
  });
  test('no ticket text is ever written to the ledger: a row carries numbers and watched values only', async (t) => {
    const w = ticketWorld(t, { issues: newestFirst(3).map((i) => ({ ...i, title: 'SECRET-TITLE', body: 'ghp_' + 'a'.repeat(36) })) });
    await step(w, sigA, 1_000);
    const raw = readFileSync(ledgerIn(w), 'utf8');
    assert.doesNotMatch(raw, /SECRET-TITLE|ghp_/);
  });
});
