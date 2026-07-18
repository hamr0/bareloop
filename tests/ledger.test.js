// Module 4 exit criteria: the upstream ledger (design record:
// docs/plans/2026-07-11-upstream-ledger-design.md + 2026-07-13 addendum — the
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
import { classifyIncidents, foldLedger, ledgerDeltas, updateLedger, LEDGER_CLASSES } from '../src/ledger.js';

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
