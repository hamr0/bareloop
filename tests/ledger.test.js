// Module 4 exit criteria: the upstream ledger (design record:
// docs/product/2026-07-11-upstream-ledger-design.md + 2026-07-13 addendum — the
// bareloop event mapping). The ledger is DERIVED and reconstructible: spines
// stay ground truth, classification is a pure fold, and re-running the
// collector over the same corpus appends nothing (idempotence is the contract).
// Event fixtures mirror the REAL emissions in src/ (run.js/interpret.js/
// ralph.js shapes), not invented ones — the classifier must read what the
// runner actually writes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyIncidents, foldLedger, ledgerDeltas, updateLedger, LEDGER_CLASSES, VOUCHED_RATE_SOURCES, rateProvenance, spendProvenance } from '../src/ledger.js';

// real-shaped spine events (see primitiveSmoke/runJob in run.js, ask/runOps in
// interpret.js, ralph's escalations) — seq/ts as makeSpine stamps them
let seq = 0;
const ev = (type, data = {}) => ({ type, ...data, seq: ++seq, ts: '2026-07-13T00:00:00.000Z' });
const reset = () => { seq = 0; };

test('LEDGER_CLASSES ships frozen, worst-first, silent-degradation at the top', () => {
  assert.ok(Object.isFrozen(LEDGER_CLASSES));
  assert.equal(LEDGER_CLASSES[0], 'silent-degradation');
  assert.ok(LEDGER_CLASSES.includes('pricing-red'), 'F6: pricing-red is a ledger class');
});

test('primitive-smoke ok:false → silent-degradation attributed to the asserted primitive', () => {
  reset();
  const occs = classifyIncidents([
    ev('primitive-smoke', { ok: false, primitive: 'litectx', detail: 'remember→recall round-trip lost the known answer' }),
  ], { spine: 'run-1' });
  assert.equal(occs.length, 1);
  assert.equal(occs[0].class, 'silent-degradation');
  assert.equal(occs[0].lib, 'litectx');
  assert.deepEqual(occs[0].sample, { spine: 'run-1', seq: 1 });
  assert.match(occs[0].key, /^litectx:/);
});

test('primitive-smoke ok:true is NOT an incident', () => {
  reset();
  assert.deepEqual(classifyIncidents([ev('primitive-smoke', { ok: true, primitive: 'litectx', detail: 'round-trip returned the known answer (1 hit(s))' })]), []);
});

test('retention-red → litectx remember (a green that mints no inheritance)', () => {
  reset();
  const occs = classifyIncidents([ev('retention-red', { category: 'retention-red', detail: 'ENOSPC: no space left on device' })]);
  assert.equal(occs.length, 1);
  assert.equal(occs[0].class, 'retention-red');
  assert.equal(occs[0].lib, 'litectx');
  assert.equal(occs[0].verb, 'remember');
});

test('broken-close escalation → consumer-attributed (the §5b line: not a lib bug)', () => {
  reset();
  const occs = classifyIncidents([ev('escalation', { category: 'broken-close', decisionReady: true, detail: 'Error: spawn nope ENOENT' })]);
  assert.equal(occs.length, 1);
  assert.equal(occs[0].class, 'broken-close');
  assert.equal(occs[0].lib, 'consumer');
});

test('interpreter-red splits by detail: a store verb → runtime-red litectx', () => {
  reset();
  const occs = classifyIncidents([ev('escalation', { category: 'interpreter-red', decisionReady: true, detail: 'recall failed: index corrupt at /run/x/.litectx/index.json' })]);
  assert.equal(occs.length, 1);
  assert.equal(occs[0].class, 'runtime-red');
  assert.equal(occs[0].lib, 'litectx');
  assert.equal(occs[0].verb, 'recall');
});

test('interpreter-red splits by detail: a worker-loop/provider failure → provider-red bare-agent', () => {
  reset();
  const occs = classifyIncidents([ev('escalation', { category: 'interpreter-red', decisionReady: true, detail: 'worker loop: provider returned 529 overloaded' })]);
  assert.equal(occs.length, 1);
  assert.equal(occs[0].class, 'provider-red');
  assert.equal(occs[0].lib, 'bare-agent');
});

test('interpreter-red matching NEITHER is still counted (runtime-red, lib unknown) — never silently dropped', () => {
  reset();
  const occs = classifyIncidents([ev('escalation', { category: 'interpreter-red', decisionReady: true, detail: 'Cannot read properties of undefined (reading "x")' })]);
  assert.equal(occs.length, 1);
  assert.equal(occs[0].class, 'runtime-red');
  assert.equal(occs[0].lib, 'unknown');
});

test('pricing-red escalation → pricing-red, bare-agent (unpriced is never free, F6)', () => {
  reset();
  const occs = classifyIncidents([ev('escalation', { category: 'pricing-red', decisionReady: true, decision: 'A provider result carried no priced cost — the hard cap cannot govern spend it cannot see (unpriced is never free, F6).', options: ['bind a priced provider/model', 'abandon the run'], spentUsd: 0.12 })]);
  assert.equal(occs.length, 1);
  assert.equal(occs[0].class, 'pricing-red');
  assert.equal(occs[0].lib, 'bare-agent');
});

test('job-red code request-red → request-red keyed on the locked verb', () => {
  reset();
  const occs = classifyIncidents([ev('job-red', { code: 'request-red', path: 'steps.1.tools', detail: '"run" is locked-but-listed — this red IS the admission evidence, never a grant; granted menu: read|grep|write' })]);
  assert.equal(occs.length, 1);
  assert.equal(occs[0].class, 'request-red');
  assert.equal(occs[0].verb, 'run');
});

test('capability-gap: cap-halt in a spine that ALSO carries a request-red', () => {
  reset();
  const both = classifyIncidents([
    ev('job-red', { code: 'request-red', path: 'steps.1.tools', detail: '"run" is locked-but-listed' }),
    ev('cap-halt', { category: 'cap-halt', meaning: 'not under cap — not "can\'t"', capRuns: 3 }),
  ]);
  const gap = both.filter((o) => o.class === 'capability-gap');
  assert.equal(gap.length, 1);
  assert.equal(gap[0].verb, 'run');
  reset();
  const alone = classifyIncidents([ev('job-red', { code: 'request-red', path: 'steps.1.tools', detail: '"run" is locked-but-listed' })]);
  assert.deepEqual(alone.filter((o) => o.class === 'capability-gap'), []);
});

test('config-red → drafting friction, attributed to bareloop itself, verb from the red path', () => {
  reset();
  const occs = classifyIncidents([ev('config-red', { code: 'scope-escape', path: 'gate.writeScope', detail: 'resolved scope /etc escapes the run directory' })]);
  assert.equal(occs.length, 1);
  assert.equal(occs[0].class, 'config-red');
  assert.equal(occs[0].lib, 'bareloop');
  assert.equal(occs[0].verb, 'gate');
});

test('interpreter-red: the TYPED lib beats the prose sniff — a worker-loop error naming a store verb is bare-agent', () => {
  reset();
  // the misfile this fixes (review 2026-07-18): interpret.js prefixes EVERY
  // worker-loop error with "worker loop:", and the verb sniff ran FIRST, so a
  // bare-agent transport failure whose text merely contained "recall" was
  // billed to litectx — the wrong upstream gets the ask, the real regression
  // never surfaces. Same contract as request-red: the field wins, prose falls back.
  const occs = classifyIncidents([ev('escalation', {
    category: 'interpreter-red', lib: 'bare-agent', decisionReady: true,
    detail: 'worker loop: recall tool failed: read ENETUNREACH',
  })]);
  assert.equal(occs.length, 1);
  assert.equal(occs[0].lib, 'bare-agent', 'typed field wins over the "recall" in the prose');
  assert.equal(occs[0].class, 'provider-red');
});

test('interpreter-red: with NO typed field the prose sniff still attributes litectx hook throws', () => {
  reset();
  const occs = classifyIncidents([ev('escalation', { category: 'interpreter-red', decisionReady: true, detail: 'recall failed: index corrupt' })]);
  assert.equal(occs.length, 1);
  assert.equal(occs[0].lib, 'litectx', 'pre-field spines keep classifying');
  assert.equal(occs[0].verb, 'recall');
});

test('step-stalled is a DELIBERATE exclusion — it files no upstream ask (operator ruling 2026-07-31)', () => {
  reset();
  // Routing it through the typed-lib branch rendered a live ask reading
  // "bare-agent: the provider path failed — worker stalled…". A stall is the
  // absence of beats: nothing observed the provider path fail, and the wrong
  // package gets the bug. The ruling is the wall-halt shape — a governance
  // story, excluded — so it produces no occurrence at all.
  const occs = classifyIncidents([ev('escalation', {
    category: 'step-stalled', lib: 'bare-agent', decisionReady: true,
    detail: 'no completed round for 300000ms; reissued 3 times',
  })]);
  assert.deepEqual(occs, [], 'an excluded category classifies to nothing — no ask, no row');
});

test('step-stalled is excluded with or WITHOUT a typed lib — and never counts as unmapped', () => {
  reset();
  // The exclusion is on the CATEGORY, exactly like wall-halt: the prose sniff
  // must not resurrect it as a litectx runtime-red, and the unmapped-category
  // counter (the anti-silent-drop guard) must not fire either — a deliberate
  // exclusion is not a stale mapping.
  const occs = classifyIncidents([ev('escalation', { category: 'step-stalled', decisionReady: true, detail: 'recall stalled: no beat for 300000ms' })]);
  assert.deepEqual(occs, [], 'no verb sniff, no unclassified-escalation row');
});

test('an UNRECOGNISED escalation category is counted, not silently dropped', () => {
  reset();
  // the dispatch keyed on four bare literals with no default: a renamed or new
  // category classified to zero occurrences, byte-indistinguishable from a
  // DELIBERATE exclusion. A whole failure class could vanish from the ledger
  // with no red — the anti-silent-drop line the interpreter-red branch holds.
  const occs = classifyIncidents([ev('escalation', { category: 'quota-red', decisionReady: true, detail: 'org spend limit reached' })]);
  assert.equal(occs.length, 1, 'a new category must surface, not vanish');
  assert.equal(occs[0].lib, 'bareloop', 'the stale emit→classify mapping is bareloop’s own bug');
  assert.match(occs[0].detail, /quota-red/, 'the unclassified category name rides in the detail');
});

test('deliberate exclusions classify to NOTHING: governance working, worker stories, environment', () => {
  reset();
  const occs = classifyIncidents([
    ev('cap-halt', { category: 'cap-halt', meaning: 'not under cap — not "can\'t"', capRuns: 3 }), // budget story
    ev('escalation', { category: 'cap-halt', decisionReady: true, detail: '3/3 runs spent' }),
    ev('escalation', { category: 'gate-red', decisionReady: true, detail: 'gate deny write to /etc/passwd' }), // fence working
    ev('escalation', { category: 'smoke-red', decisionReady: true, detail: 'dup of primitive-smoke' }), // counted via primitive-smoke
    ev('escalation', { category: 'hitl-close', decisionReady: true, step: 'pr' }), // by design
    ev('escalation', { category: 'close-unsupported', decisionReady: true, step: 'x' }), // honest refusal
    ev('escalation', { category: 'recipe-stale', decisionReady: true, detail: 'recipe-stale:closeStageNames' }), // Layer 3: the load gate refusing a wrong-KIND recipe IS the mechanism working
    ev('escalation', { category: 'close-timeout', decisionReady: true, step: 'x' }), // close-verdict red (worker/operator story)
    ev('escalation', { category: 'close-killed', decisionReady: true, step: 'x' }), // F17 named terminal, not a lib bug
    ev('escalation', { category: 'close-crashed', decisionReady: true, step: 'x' }), // ditto
    ev('close-verdict', { iteration: 1, verdict: 'needs_revision', gap: 'test failed', exitCode: 1 }), // worker story
    ev('artifact-red', { iteration: 1, category: 'artifact-red', reason: 'prose-only' }), // worker story
    ev('pr-red', { step: 'pr', argv: 'git push -u origin b', detail: 'git push failed: no remote' }), // environment
    ev('job-red', { code: 'invalid-value', path: 'steps.1.tools', detail: 'unknown tool(s) bash' }), // operator typo
    ev('worker-result', { iteration: 1, costUsd: 0.01, unpricedRounds: 0 }),
  ]);
  assert.deepEqual(occs, []);
});

test('sig normalizes paths and numbers: the same bug across runs dedupes, distinct bugs do not', () => {
  reset();
  const a = classifyIncidents([ev('retention-red', { detail: 'ENOENT: open /run/aaa/.litectx/store-17.json' })])[0];
  reset();
  const b = classifyIncidents([ev('retention-red', { detail: 'ENOENT: open /run/bbb/.litectx/store-42.json' })])[0];
  reset();
  const c = classifyIncidents([ev('retention-red', { detail: 'EACCES: permission denied' })])[0];
  assert.equal(a.key, b.key, 'same shape, different paths/numbers → same key');
  assert.notEqual(a.key, c.key, 'different failure → different key');
});

test('foldLedger: cumulative occurrence rows fold to the latest count; status lifecycle rides on top', () => {
  const rows = [
    { type: 'lib-incident', key: 'litectx:remember:retention-red:aaaa1111', lib: 'litectx', verb: 'remember', class: 'retention-red', sig: 'aaaa1111', detail: 'ENOENT: open <path>', occurrences: 1, samples: [{ spine: 'r1', seq: 9 }], suggestedAsk: 'litectx: …', seq: 1, ts: 't' },
    { type: 'lib-incident-status', key: 'litectx:remember:retention-red:aaaa1111', status: 'filed', ref: 'UPSTREAM-ASKS A4', seq: 2, ts: 't' },
    { type: 'lib-incident', key: 'litectx:remember:retention-red:aaaa1111', lib: 'litectx', verb: 'remember', class: 'retention-red', sig: 'aaaa1111', detail: 'ENOENT: open <path>', occurrences: 3, samples: [{ spine: 'r1', seq: 9 }, { spine: 'r2', seq: 4 }], suggestedAsk: 'litectx: …', seq: 3, ts: 't' },
  ];
  const fold = foldLedger(rows);
  const e = fold['litectx:remember:retention-red:aaaa1111'];
  assert.equal(e.occurrences, 3, 'latest cumulative count wins');
  assert.equal(e.status, 'filed', 'a later incident row must not reset a filed status');
  assert.equal(e.ref, 'UPSTREAM-ASKS A4');
  assert.equal(e.samples.length, 2);
});

test('foldLedger: status defaults to open; a status row for an unseen key still folds (occurrences 0)', () => {
  const fold = foldLedger([
    { type: 'lib-incident', key: 'k1', lib: 'l', verb: 'v', class: 'runtime-red', sig: 's', detail: 'd', occurrences: 2, samples: [], suggestedAsk: 'a', seq: 1, ts: 't' },
    { type: 'lib-incident-status', key: 'k2', status: 'fixed', ref: 'A9', seq: 2, ts: 't' },
  ]);
  assert.equal(fold.k1.status, 'open');
  assert.equal(fold.k2.status, 'fixed');
  assert.equal(fold.k2.occurrences, 0);
});

test('ledgerDeltas: append only when a key is new or its count grew; first-seen detail is preserved', () => {
  reset();
  const occs = classifyIncidents([
    ev('retention-red', { detail: 'ENOENT: open /run/a/f-1.json' }),
    ev('retention-red', { detail: 'ENOENT: open /run/b/f-2.json' }),
  ], { spine: 'r9' });
  const key = occs[0].key;
  // fresh ledger: one row, occurrences 2
  const fresh = ledgerDeltas({}, occs);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].occurrences, 2);
  assert.equal(fresh[0].type, 'lib-incident');
  // same corpus against a fold already at 2: idempotent, no rows
  const fold = foldLedger(fresh.map((r, i) => ({ ...r, seq: i + 1, ts: 't' })));
  assert.deepEqual(ledgerDeltas(fold, occs), []);
  // grown corpus: one row with the new total, keeping the fold's first-seen detail
  fold[key] = { ...fold[key], detail: 'FIRST-SEEN' };
  reset();
  const grown = classifyIncidents([
    ev('retention-red', { detail: 'ENOENT: open /run/a/f-1.json' }),
    ev('retention-red', { detail: 'ENOENT: open /run/b/f-2.json' }),
    ev('retention-red', { detail: 'ENOENT: open /run/c/f-3.json' }),
  ], { spine: 'r9' });
  const delta = ledgerDeltas(fold, grown);
  assert.equal(delta.length, 1);
  assert.equal(delta[0].occurrences, 3);
  assert.equal(delta[0].detail, 'FIRST-SEEN');
});

test('updateLedger end-to-end: derive → append → idempotent re-run → grow; spine files stay untouched', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-ledger-'));
  const ledgerFile = join(dir, 'upstream.jsonl');
  const spineA = join(dir, 'run-a.jsonl');
  reset();
  const eventsA = [
    ev('job-start', { job: 'litectx-maintainer' }),
    ev('primitive-smoke', { ok: false, primitive: 'litectx', detail: 'remember→recall round-trip lost the known answer' }),
    ev('escalation', { category: 'smoke-red', decisionReady: true, detail: 'remember→recall round-trip lost the known answer' }),
    ev('job-end', { outcome: 'smoke-red' }),
  ];
  writeFileSync(spineA, eventsA.map((e) => JSON.stringify(e)).join('\n') + '\n');
  const before = readFileSync(spineA, 'utf8');

  const r1 = updateLedger({ ledgerFile, spineFiles: [spineA] });
  assert.equal(r1.appended.length, 1, 'one incident class in spine A');
  assert.equal(r1.appended[0].class, 'silent-degradation');
  assert.equal(readFileSync(spineA, 'utf8'), before, 'spines are ground truth — never mutated');

  // row conventions on disk: type first, ts stamped last, seq monotonic
  const lines = readFileSync(ledgerFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(Object.keys(lines[0])[0], 'type');
  assert.equal(Object.keys(lines[0]).at(-1), 'ts');
  assert.equal(lines[0].seq, 1);
  assert.deepEqual(lines[0].samples, [{ spine: 'run-a', seq: 2 }]);

  // idempotent: same corpus, nothing appends
  const r2 = updateLedger({ ledgerFile, spineFiles: [spineA] });
  assert.deepEqual(r2.appended, []);

  // a second run with the SAME failure shape: count grows, seq continues
  const spineB = join(dir, 'run-b.jsonl');
  reset();
  writeFileSync(spineB, [ev('job-start', {}), ev('primitive-smoke', { ok: false, primitive: 'litectx', detail: 'remember→recall round-trip lost the known answer' })].map((e) => JSON.stringify(e)).join('\n') + '\n');
  const r3 = updateLedger({ ledgerFile, spineFiles: [spineA, spineB] });
  assert.equal(r3.appended.length, 1);
  assert.equal(r3.appended[0].occurrences, 2);
  assert.equal(r3.appended[0].seq, 2, 'ledger seq continues across appends');
  const key = r3.appended[0].key;
  assert.equal(r3.fold[key].occurrences, 2);
  assert.equal(r3.fold[key].status, 'open');
});

test('updateLedger with no incidents creates no ledger file (nothing to say, nothing written)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-ledger-'));
  const spine = join(dir, 'green.jsonl');
  reset();
  writeFileSync(spine, [ev('job-start', {}), ev('primitive-smoke', { ok: true, primitive: 'litectx', detail: 'ok' }), ev('job-end', { outcome: 'green' })].map((e) => JSON.stringify(e)).join('\n') + '\n');
  const ledgerFile = join(dir, 'upstream.jsonl');
  const r = updateLedger({ ledgerFile, spineFiles: [spine] });
  assert.deepEqual(r.appended, []);
  assert.equal(existsSync(ledgerFile), false);
});

test('a malformed ledger line throws with position — corruption is never papered over', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-ledger-'));
  const ledgerFile = join(dir, 'upstream.jsonl');
  writeFileSync(ledgerFile, '{"type":"lib-incident"}\n{nope\n');
  assert.throws(() => updateLedger({ ledgerFile, spineFiles: [] }), /line 2/);
});

test('escalation{provider-red} (the transport-throw seam) → provider-red, bare-agent', () => {
  reset();
  const occs = classifyIncidents([ev('escalation', { category: 'provider-red', decisionReady: true, detail: 'worker loop: 401 invalid x-api-key' })]);
  assert.equal(occs.length, 1);
  assert.equal(occs[0].class, 'provider-red');
  assert.equal(occs[0].lib, 'bare-agent');
});

test('request-red verb: the structured field wins over prose; quoted-detail stays the legacy fallback', () => {
  reset();
  const structured = classifyIncidents([ev('job-red', { code: 'request-red', path: 'steps.1.tools', verb: 'run', detail: 'the menu "read|grep|write" does not include it' })]);
  assert.equal(structured[0].verb, 'run', 'ev.verb wins even when the first quoted token is not the verb');
  reset();
  const legacy = classifyIncidents([ev('job-red', { code: 'request-red', path: 'steps.1.tools', detail: '"run" is locked-but-listed' })]);
  assert.equal(legacy[0].verb, 'run');
});

// ---- request-red LIB: one code, two territories (the BA-2 misattribution class) ----
// `request-red` is admission demand, and demand lands against whoever owns the
// catalogue that refused it: a locked TOOL verb is bare-agent's, a locked VERDICT
// type is bareloop's OWN. Filing the second upstream is exactly the misfile the
// typed-lib rule exists to prevent, so the lib is stamped at the emit site
// (src/job.js) and read here — never inferred from the code.

test('request-red lib: a locked VERDICT type is bareloop\'s own catalogue, never an upstream bare-agent ask', () => {
  reset();
  const occs = classifyIncidents([ev('job-red', {
    code: 'request-red', path: 'verdictType', verb: 'hitl', lib: 'bareloop',
    detail: '"hitl" is declared-but-locked — not at this rung (v1 admits green only); this red IS the admission evidence, never a grant',
  })]);
  assert.equal(occs.length, 1);
  assert.equal(occs[0].class, 'request-red');
  assert.equal(occs[0].lib, 'bareloop', 'a bareloop-catalogue refusal must never be billed to bare-agent');
  assert.equal(occs[0].verb, 'hitl');
  assert.ok(occs[0].key.startsWith('bareloop:hitl:request-red:'), occs[0].key);
});

test('request-red lib: a locked TOOL verb still files against bare-agent (both directions)', () => {
  reset();
  const occs = classifyIncidents([ev('job-red', {
    code: 'request-red', path: 'tools', verb: 'run', lib: 'bare-agent',
    detail: '"run" is locked-but-listed — this red IS the admission evidence, never a grant',
  })]);
  assert.equal(occs.length, 1);
  assert.equal(occs[0].lib, 'bare-agent');
  assert.equal(occs[0].verb, 'run');
});

test('request-red lib: a spine written before the field falls back to bare-agent (the original case)', () => {
  reset();
  const occs = classifyIncidents([ev('job-red', { code: 'request-red', path: 'steps.1.tools', detail: '"run" is locked-but-listed' })]);
  assert.equal(occs[0].lib, 'bare-agent', 'the hardcoded lib survives ONLY as the legacy-spine fallback');
});

test('request-red suggestedAsk seeds the ask against the STAMPED target, not a hardcoded package', () => {
  reset();
  const occs = classifyIncidents([
    ev('job-red', { code: 'request-red', path: 'verdictType', verb: 'hitl', lib: 'bareloop', detail: '"hitl" is declared-but-locked' }),
    ev('job-red', { code: 'request-red', path: 'tools', verb: 'run', lib: 'bare-agent', detail: '"run" is locked-but-listed' }),
  ]);
  const rows = ledgerDeltas({}, occs);
  const verdictRow = rows.find((r) => r.verb === 'hitl');
  const toolRow = rows.find((r) => r.verb === 'run');
  assert.ok(verdictRow.suggestedAsk.startsWith('bareloop:'), verdictRow.suggestedAsk);
  assert.ok(!/bare-agent/.test(verdictRow.suggestedAsk), 'a bareloop refusal must not seed an ask at bare-agent');
  assert.ok(toolRow.suggestedAsk.startsWith('bare-agent:'), toolRow.suggestedAsk);
});

// ---- capability-gap inherits the SAME two territories ----
// The three fixtures below are FUNCTION-CONTRACT tests, not reachable scenarios:
// a `request-red` and a `cap-halt` cannot share one real spine today, because
// `validateJob` returns not-ok on any red and `run.js` returns immediately on a
// validation red, so the job never reaches a provider call (the dormancy the
// src/ledger.js header states). `classifyIncidents` is PURE, so its contract is
// still testable by feeding it the event stream directly — but a later reader
// must not mistake these streams for something a run can produce. The seam is
// fixed because the sibling `request-red` site was fixed on this same branch and
// this one was missed; a fix that lands at one of two identical sites is the
// class this repo has already been burned by (ci.yml/publish.yml).

test('capability-gap carries the request-red\'s STAMPED territory, not a hardcoded bare-agent', () => {
  reset();
  // synthetic stream — see the block comment: unreachable in a real run today
  const occs = classifyIncidents([
    ev('job-red', { code: 'request-red', path: 'verdictType', verb: 'hitl', lib: 'bareloop', detail: '"hitl" is declared-but-locked' }),
    ev('cap-halt', { category: 'cap-halt', meaning: 'not under cap — not "can\'t"', capRuns: 3 }),
  ]);
  const gap = occs.filter((o) => o.class === 'capability-gap');
  assert.equal(gap.length, 1);
  assert.equal(gap[0].verb, 'hitl');
  assert.equal(gap[0].lib, 'bareloop', 'a bareloop-catalogue refusal must never be billed to bare-agent');
  assert.ok(gap[0].key.startsWith('bareloop:hitl:capability-gap:'), gap[0].key);
});

test('capability-gap dedupes on (verb, lib): one verb string from two territories stays two rows', () => {
  reset();
  // synthetic stream — see the block comment: unreachable in a real run today.
  // The verbs deliberately COLLIDE: dedup on the verb alone would collapse these
  // to one row and attribute it to whichever lib the Set happened to hold first.
  const occs = classifyIncidents([
    ev('job-red', { code: 'request-red', path: 'verdictType', verb: 'audit', lib: 'bareloop', detail: '"audit" is declared-but-locked' }),
    ev('job-red', { code: 'request-red', path: 'tools', verb: 'audit', lib: 'bare-agent', detail: '"audit" is locked-but-listed' }),
    ev('cap-halt', { category: 'cap-halt', capRuns: 3 }),
  ]);
  const gap = occs.filter((o) => o.class === 'capability-gap');
  assert.equal(gap.length, 2, 'two territories, two admission-evidence rows');
  assert.deepEqual(gap.map((o) => o.lib).sort(), ['bare-agent', 'bareloop']);
  // and a repeat of the SAME (verb, lib) still folds to one row
  reset();
  const dup = classifyIncidents([
    ev('job-red', { code: 'request-red', path: 'verdictType', verb: 'hitl', lib: 'bareloop', detail: '"hitl" is declared-but-locked' }),
    ev('job-red', { code: 'request-red', path: 'verdictType', verb: 'hitl', lib: 'bareloop', detail: '"hitl" is declared-but-locked, again' }),
    ev('cap-halt', { category: 'cap-halt', capRuns: 3 }),
  ]);
  assert.equal(dup.filter((o) => o.class === 'capability-gap').length, 1, 'same territory + same verb is one gap');
});

test('capability-gap suggestedAsk seeds the ask against the STAMPED target', () => {
  reset();
  // synthetic stream — see the block comment: unreachable in a real run today
  const occs = classifyIncidents([
    ev('job-red', { code: 'request-red', path: 'verdictType', verb: 'hitl', lib: 'bareloop', detail: '"hitl" is declared-but-locked' }),
    ev('cap-halt', { category: 'cap-halt', capRuns: 3 }),
  ]);
  const row = ledgerDeltas({}, occs).find((r) => r.class === 'capability-gap');
  assert.ok(row.suggestedAsk.startsWith('bareloop:'), row.suggestedAsk);
  assert.ok(!/bare-agent/.test(row.suggestedAsk), 'a bareloop refusal must not seed an ask at bare-agent');
});

// ── BA-21 pricing provenance (reporting only) ────────────────────────────────
// bare-agent >=0.37 rides `rateSource` beside `pricing` on every metering payload.
// These read the SPINE's own spend records (`worker-round`/`worker-turn` as
// planrun.js writes them), never an invented shape.

test('a TIER-priced round is a GUESSTIMATE — the predicate is an allow-list of vouched sources, never `=== "default"`', () => {
  // THE load-bearing case. BOTH production models resolve to 'tier' (claude-sonnet-5
  // and claude-haiku-4-5 each match a recognized Claude tier by model-id substring),
  // so a guess-test spelled `rateSource === 'default'` would read every normal round
  // as confidently priced and see NONE of the population. Blind-instrument class.
  assert.equal(rateProvenance({ type: 'worker-round', costUsd: 0.02, pricing: 'priced', rateSource: 'tier' }), 'guessed');
});

test('a DEFAULT-priced round (the blind ceiling) is a guesstimate too', () => {
  assert.equal(rateProvenance({ rateSource: 'default' }), 'guessed');
});

test('provider- and caller-sourced rounds are VOUCHED, and they are the only two', () => {
  assert.equal(rateProvenance({ rateSource: 'provider' }), 'vouched');
  assert.equal(rateProvenance({ rateSource: 'caller' }), 'vouched');
  assert.deepEqual([...VOUCHED_RATE_SOURCES], ['provider', 'caller']);
  assert.ok(Object.isFrozen(VOUCHED_RATE_SOURCES));
});

test('an UNKNOWN/future rateSource reads as a guesstimate, never as vouched (fail-safe direction)', () => {
  assert.equal(rateProvenance({ rateSource: 'marketplace' }), 'guessed');
  assert.equal(rateProvenance({ rateSource: 'provider-ish' }), 'guessed');
});

test('rateSource null is UNPRICED — nothing was priced, so there was no rate to have guessed', () => {
  assert.equal(rateProvenance({ rateSource: null, costUsd: null, pricing: 'unpriced' }), 'unpriced');
});

test('an ABSENT rateSource (every archived round) is UNKNOWN provenance — never vouched, never backfilled', () => {
  const archived = { type: 'worker-round', kind: 'turn', phase: 'plan', costUsd: 0.0413, pricing: 'priced' };
  assert.equal(rateProvenance(archived), 'unknown');
  assert.notEqual(rateProvenance(archived), 'vouched');
  // and the same for the shapes a reader can hand it
  assert.equal(rateProvenance({ rateSource: undefined }), 'unknown');
  assert.equal(rateProvenance(null), 'unknown');
});

test('spendProvenance answers "how much of this run was priced by a guess?" over the real spend records', () => {
  reset();
  const p = spendProvenance([
    ev('worker-round', { kind: 'turn', costUsd: 0.10, pricing: 'priced', rateSource: 'tier' }),
    ev('worker-round', { kind: 'turn', costUsd: 0.20, pricing: 'priced', rateSource: 'default' }),
    ev('worker-round', { kind: 'turn', costUsd: 0.05, pricing: 'priced', rateSource: 'provider' }),
    ev('worker-round', { kind: 'turn', costUsd: 0.01, pricing: 'priced', rateSource: 'caller' }),
    ev('worker-turn', { kind: 'turn', costUsd: null, pricing: 'unpriced', rateSource: null }),
    ev('worker-result', { costUsd: 99 }), // an attempt-level ECHO of the rounds above (F12) — never counted
  ]);
  assert.equal(p.guessed.rounds, 2);
  assert.ok(Math.abs(p.guessed.usd - 0.30) < 1e-9, `guessed spend, got ${p.guessed.usd}`);
  assert.equal(p.vouched.rounds, 2);
  assert.ok(Math.abs(p.vouched.usd - 0.06) < 1e-9, `vouched spend, got ${p.vouched.usd}`);
  assert.equal(p.unpriced.rounds, 1);
  assert.equal(p.unpriced.usd, 0);
  assert.equal(p.unpriced.unpricedRounds, 1, 'F6: an unknown cost is COUNTED, never summed as $0');
  assert.equal(p.unknown.rounds, 0);
});

test('an ARCHIVED spine (no rateSource anywhere) reports its whole spend as UNKNOWN provenance, not vouched', () => {
  reset();
  const p = spendProvenance([
    ev('worker-round', { kind: 'turn', phase: 'scout', costUsd: 0.0413, pricing: 'priced' }),
    ev('worker-round', { kind: 'turn', phase: 'plan', costUsd: 0.1102, pricing: 'priced' }),
  ]);
  assert.equal(p.unknown.rounds, 2);
  assert.ok(Math.abs(p.unknown.usd - 0.1515) < 1e-9, `unknown-provenance spend, got ${p.unknown.usd}`);
  assert.equal(p.vouched.rounds, 0, 'history is never rounded up to vouched');
  assert.equal(p.guessed.rounds, 0, 'and it is never dressed up as a labelled guess either');
});

test('an unpriced-cost round is counted, not summed as $0, whatever its provenance (F6)', () => {
  reset();
  const p = spendProvenance([
    ev('worker-round', { kind: 'turn', costUsd: 0.10, pricing: 'priced', rateSource: 'tier' }),
    ev('worker-round', { kind: 'turn', costUsd: null, pricing: 'unpriced', rateSource: 'tier' }),
  ]);
  assert.equal(p.guessed.rounds, 2);
  assert.equal(p.guessed.unpricedRounds, 1, 'the bucket declares its usd is a FLOOR');
  assert.ok(Math.abs(p.guessed.usd - 0.10) < 1e-9);
});

test('provenance is REPORTING ONLY: a guessed round mints no incident and no new ledger class', () => {
  reset();
  // the regression guard — if someone later couples this to run control, this goes red
  const occs = classifyIncidents([
    ev('worker-round', { kind: 'turn', costUsd: 0.10, pricing: 'priced', rateSource: 'default' }),
    ev('worker-round', { kind: 'turn', costUsd: 0.10, pricing: 'priced', rateSource: 'tier' }),
  ]);
  assert.deepEqual(occs, [], 'a guesstimate rate is not an incident — `pricing` alone still owns the halt');
  assert.ok(!LEDGER_CLASSES.some((c) => /rate|guess|provenance/i.test(c)), 'no new escalation category was invented');
  // `pricing` stays strictly two-valued and untouched: the pricing-red classifier still
  // fires on the escalation category alone, exactly as before
  reset();
  const red = classifyIncidents([ev('escalation', { category: 'pricing-red', decision: 'no priced cost' })]);
  assert.equal(red.length, 1);
  assert.equal(red[0].class, 'pricing-red');
  assert.equal(red[0].lib, 'bare-agent');
});

// The spend-slicing set and the BUDGET's own accounted set must not drift: a provenance
// readout that misses a money writer is the F45 class, and `judge-round` (the softgreen
// judged floor — the first spend a close ever had) is exactly the writer that would have
// gone missing. This is the seam, since the two are re-spelled rather than shared.
test('spendProvenance covers every record the budget ledger accounts', async () => {
  const { ACCOUNTED_ROUND_TYPES } = await import('../src/run.js');
  const judged = { type: 'judge-round', costUsd: 0.004, pricing: 'priced', rateSource: 'tier' };
  const p = spendProvenance([judged]);
  assert.equal(p.guessed.rounds, 1, 'a judge-round is a spend record the readout must see');
  assert.equal(Math.round(p.guessed.usd * 1000), 4);
  for (const t of ACCOUNTED_ROUND_TYPES) {
    const seen = spendProvenance([{ type: t, costUsd: 1, pricing: 'priced', rateSource: 'caller' }]);
    assert.equal(seen.vouched.rounds, 1, `${t} is accounted by the budget but invisible to the readout`);
  }
});
