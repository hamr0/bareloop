// Design B (hamr 2026-11-15): a repo `~` rule the drafter left Not checked is pointed at a path outside the write fence by ONE typed call; code proves the path. REAL data: the signed spec of live draft session
// smwhwzspwg7ez (tests/fixtures/repo-list/smwhwzspwg7ez-spec.json) - the drafter wrote "the fence proves it" into free-text notes and emitted no `fenceKept`, so all three rules read Not checked. Only the model's REPLY is stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authorCloseForJob } from '../src/authorjob.js';
import { runFencePoint, fencePrompt, decideFencePoint } from '../src/fencepoint.js';
import { validateCloseDecl } from '../src/declaredclose.js';
import { listMatchesClose } from '../src/rubricstep.js';

const spec = JSON.parse(readFileSync(new URL('./fixtures/repo-list/smwhwzspwg7ez-spec.json', import.meta.url), 'utf8'));
const SURVEY = { state: 'PRESENT', reason: null, calls: [], facts: { language: 'javascript', runner: 'node --test', sourcePaths: ['src'], testPaths: [], extensions: ['.js'] }, meta: { bytes: 1, rounds: 1, bounded: false, recovered: false, error: null } };
const LISTING = { stop: null, files: ['package.json', 'src/sum.js', 'test/sum.test.js'] };

/** a stand-in for the model: each `run` returns the next scripted reply */
function stubLoop(/** @type {any[]} */ replies, /** @type {any[]} */ seen) {
  return () => ({ run: async (/** @type {any} */ msgs) => { seen.push(msgs[0].content); const r = replies.shift(); if (r instanceof Error) throw r; return { text: r, usage: { inputTokens: 100, outputTokens: 20 }, costUsd: 0.0004 }; } });
}

async function draft(/** @type {any[]} */ replies, /** @type {any[]} */ seen = [], /** @type {any[]} */ calls = [], /** @type {any[]} */ phases = [], extra = {}) {
  const stages = spec.closeDecl.stages;
  return authorCloseForJob({
    verdictType: 'green', answers: { 1: '1. Fix the bug.' }, repoPath: '/tmp', lang: 'js', seedRef: 'x', isRepo: true, provider: {},
    jobLines: spec.jobLines, writeScope: spec.writeScope, onCall: (c) => calls.push(c), onPhase: (n, d) => phases.push([n, d]),
    fenceFn: (/** @type {any} */ o) => runFencePoint({ ...o, createLoop: stubLoop(replies, seen) }),
    scoutFn: async () => SURVEY, listingFn: async () => LISTING,
    authorFn: async () => ({ ok: true, declaration: { stages, refused: spec.closeDecl.refused }, seedRead: null, iterations: [], reds: [], cost: null, stop: null, genreEnv: { applied: {} }, listing: LISTING, ledger: null }),
    ...extra,
  });
}
const rule = (/** @type {any} */ r, /** @type {number} */ k) => r.closeDecl.list.find((/** @type {any} */ x) => x.kind === 'rule' && x.rule === k);

test('the real smwhwzspwg7ez draft: one call points rules 1 and 2 at test/ and package.json, code proves them, rule 3 stays Not checked', async () => {
  const seen = []; const calls = []; const phases = [];
  const reply = '{"picks":[{"line":1,"rule":1,"path":"test/"},{"line":1,"rule":2,"path":"package.json"},{"line":1,"rule":3,"path":null}]}';
  const r = await draft([reply], seen, calls, phases);
  assert.equal(r.ok, true);
  assert.equal(seen.length, 1, 'ONE call for all rules');
  assert.deepEqual([rule(r, 1).state, rule(r, 1).fence], ['built', 'test']);
  assert.deepEqual([rule(r, 2).state, rule(r, 2).fence], ['built', 'package.json']);
  assert.equal(rule(r, 3).state, 'not-checked');
  assert.deepEqual(r.closeDecl.fenceKept, [{ line: 1, rule: 1, path: 'test' }, { line: 1, rule: 2, path: 'package.json' }]);
  assert.deepEqual(calls.map((c) => c.label), ['fence-point'], 'booked through onCall like every drafting call');
  assert.deepEqual(phases.filter((p) => p[0] === 'fence-point').map((p) => [p[1].state, p[1].asked, p[1].picked]), [['ok', 3, 2]]);
  assert.equal(listMatchesClose(r.closeDecl).ok, true);
  assert.deepEqual(validateCloseDecl(r.closeDecl, { at: 'closeDecl', verdictType: 'green', listing: LISTING.files }).reds.filter((/** @type {any} */ x) => /closeDecl\.list\[|fenceKept/.test(String(x.path))), []);
});

test('the prompt names each rule and the outside-scope paths only (never a path inside src/)', async () => {
  const seen = [];
  await draft(['{"picks":[]}'], seen);
  assert.match(seen[0], /RULE line 1, rule 1: don't edit test\//);
  assert.match(seen[0], /RULE line 1, rule 3: keep the comment at the top of src\/sum\.js/);
  assert.match(seen[0], /- package\.json\n- test\/\n- test\/sum\.test\.js\n/);
  assert.doesNotMatch(seen[0], /- src\//);
});

test('code decides: a path not on the list, a path inside the fence, a malformed reply (retried once) leave the rule Not checked', async () => {
  const r1 = await draft(['{"picks":[{"line":1,"rule":1,"path":"README.md"},{"line":1,"rule":2,"path":"src/sum.js"}]}']);
  assert.deepEqual([rule(r1, 1).state, rule(r1, 2).state], ['not-checked', 'not-checked']);
  const seen = []; const phases = [];
  const r2 = await draft(['not json', 'still not json'], seen, [], phases);
  assert.equal(seen.length, 2, 'one retry, no repair');
  assert.equal(r2.ok, true, 'the draft is not stopped');
  assert.equal(rule(r2, 1).state, 'not-checked');
  assert.match(phases.find((p) => p[0] === 'fence-point')[1].reason, /not readable twice/);
  assert.equal(decideFencePoint('{"picks":[{"line":1,"rule":1}]}', { rules: [{ line: 1, rule: 1, text: 'x' }], paths: ['a'] }).status, 'malformed');
});

test('a failed call is recorded in the phase (never silent) and leaves the rules Not checked', async () => {
  const phases = [];
  const r = await draft([Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }), Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })], [], [], phases);
  assert.equal(r.ok, true);
  assert.equal(rule(r, 1).state, 'not-checked');
  const ph = phases.find((p) => p[0] === 'fence-point')[1];
  assert.equal(ph.state, 'absent');
  assert.match(ph.reason, /failed/);
});

test('NO call when no rule is Not checked, or when nothing lies outside the fence', async () => {
  const seen = [];
  const all = [{ line: 1, rule: 1, path: 'test/sum.test.js' }, { line: 1, rule: 2, path: 'package.json' }, { line: 1, rule: 3, path: 'test/sum.test.js' }];
  const done = await draft([], seen, [], [], { authorFn: async () => ({ ok: true, declaration: { stages: spec.closeDecl.stages, fenceKept: all }, seedRead: null, iterations: [], reds: [], cost: null, stop: null, genreEnv: { applied: {} }, listing: LISTING, ledger: null }) });
  assert.equal(done.ok, true);
  assert.equal(seen.length, 0, 'every rule already kept: no call');
  const inside = await draft([], seen, [], [], { writeScope: ['./'], listingFn: async () => LISTING });
  assert.equal(seen.length, 0, 'the fence holds the whole repo: nothing to point at, no call');
  assert.equal(inside.ok, true);
  assert.ok(fencePrompt({ rules: [{ line: 1, rule: 1, text: 'x' }], paths: ['a'] }).includes('THE PATHS'));
});
