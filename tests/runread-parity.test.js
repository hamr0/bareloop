// F399 parity tests for the facts the readers now own: the three new records with their old-run fallbacks, and the homes the 8 gaps were given (hamr 2026-11-25).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync, rmSync, mkdtempSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checksOf, outputOf } from '../src/runread.js';
import { getRunDetail, getRunResult } from '../src/panel/server.js';
import { readRunList } from '../src/runlist.js';
import { makeAuditGridWorld, RUNID } from './audit-grid-world.mjs';
import { f399World } from './f399-world.mjs';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const load = (/** @type {string} */ p) => readFileSync(join(FX, p), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const fenceRow = (/** @type {any} */ d) => [...d.auditChecks.always, ...d.auditChecks.lines.flatMap((/** @type {any} */ l) => l.checks)].find((r) => /^write fence/.test(r.text));

test('audit-fence-row-fallback-sidecar: an old run (no fence record) reads the gate-audit sidecar scoped by its windows', () => {
  const w = makeAuditGridWorld();
  const r = fenceRow(getRunDetail(RUNID, w.opts));
  assert.equal(r.result, 'held');
  assert.equal(r.word, 'held · 0 writes blocked');
});

test('audit-fence-row-from-record: a `fence` record is read, summed over every leg, and wins over a missing sidecar; no record and no sidecar says the record is missing', () => {
  const w = makeAuditGridWorld();
  const row = readRunList(w.opts).rows.find((r) => r.runid === RUNID);
  rmSync(row.spine.replace('.jsonl', '-gate-audit.jsonl'));
  assert.equal(fenceRow(getRunDetail(RUNID, w.opts)).result, 'record-missing');
  appendFileSync(row.spine, `${JSON.stringify({ type: 'fence', held: true, blocked: 3, seq: 99999 })}\n`);
  const r = fenceRow(getRunDetail(RUNID, w.opts));
  assert.equal(r.result, 'held');
  assert.equal(r.word, 'held · 3 writes blocked');
});

test('shape-items-red-run-fallback-prose: with no `shape-items` record a red run reads our own gap sentences; a record wins over the prose', () => {
  const spec = { closeDecl: { stages: [{ name: 'line-1', kind: 'rubric-step', params: { step: 1, parts: [{ class: 'shape', fields: [] }] } }], list: [] } };
  const gap = 'close: line-1: line 1: item 3: "status" is not one of the allowed values';
  const base = [{ type: 'job-start' }, { type: 'close-verdict', verdict: 'needs_revision', gap }, { type: 'job-end', outcome: 'step-red' }];
  const prose = checksOf(base, null, { spec }).shapeItems.get('line-1');
  assert.ok(Array.isArray(prose) && prose.length === 1, JSON.stringify(prose));
  const withRec = [base[0], { type: 'shape-items', step: 'line-1', line: 1, items: ['#2:status:not-in-list'] }, base[1], base[2]];
  assert.deepEqual(checksOf(withRec, null, { spec }).shapeItems.get('line-1'), ['#2:status:not-in-list']);
});

test('work-committed-fallback-git: no `work-committed` record -> branch from work-branch, final commit asked of git live; the branch gone reads tip null', () => {
  const d = mkdtempSync(join(tmpdir(), 'rr-git-'));
  try {
    const g = (/** @type {string[]} */ ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-C', d, ...a], { encoding: 'utf8' }).trim();
    g('init', '-q', '-b', 'main'); writeFileSync(join(d, 'a'), '1'); g('add', '.'); g('commit', '-q', '-m', 'x'); g('branch', 'bl/work');
    const spine = [{ type: 'job-start' }, { type: 'work-branch', branch: 'bl/work', base: 'abc1234' }, { type: 'job-end', outcome: 'green' }];
    const o = outputOf(spine, null, { repo: d });
    assert.equal(o.landing?.branch, 'bl/work');
    assert.equal(o.landing?.commit, null);
    assert.equal(o.landing?.tip, g('rev-parse', 'refs/heads/bl/work'));
    g('branch', '-D', 'bl/work');
    assert.equal(outputOf(spine, null, { repo: d }).landing?.tip, null);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('result-judged-file-parity (GAP-3): the file a check judged is read honestly: ok / changed / gone / none', () => {
  const root = mkdtempSync(join(tmpdir(), 'rr-judged-'));
  try {
    mkdirSync(join(root, 'output', 'steps'), { recursive: true });
    writeFileSync(join(root, 'output', 'steps', '1.json'), '{"a":1}');
    const sha = createHash('sha256').update('{"a":1}').digest('hex');
    const spine = [{ type: 'job-start' }, { type: 'output-judged', step: 's', iteration: 1, path: 'output/steps/1.json', bytes: 7, sha256: sha }, { type: 'job-end', outcome: 'step-red' }];
    const c = checksOf(spine, null);
    assert.equal(c?.judged(1, root).state, 'ok');
    assert.equal(c?.judged(2, root).state, 'none');
    writeFileSync(join(root, 'output', 'steps', '1.json'), '{"a":2}');
    assert.equal(c?.judged(1, root).state, 'changed');
    rmSync(join(root, 'output', 'steps', '1.json'));
    assert.equal(c?.judged(1, root).state, 'gone');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('result-facts-grid-parity (GAP-4): what the check read is the run\'s LAST rubric-evidence record for the line', () => {
  const spine = [{ type: 'job-start' }, { type: 'rubric-evidence', step: 1, evidence: [{ check: 'p1-facts', claim: 0 }] }, { type: 'rubric-evidence', step: 1, evidence: [{ check: 'p1-facts', claim: 1 }] }, { type: 'rubric-evidence', step: 2, evidence: [] }, { type: 'job-end', outcome: 'green' }];
  assert.equal(checksOf(spine, null)?.evidence(1)?.evidence[0].claim, 1);
  assert.equal(checksOf(spine, null)?.evidence(3), null);
});

test('result-red-gap-line-parity (GAP-1): a red run\'s failing check words are checksOf.redCheck.detail and the Result tab\'s gap line is made from them', () => {
  const w = f399World('mv73swnx', 'flights1');
  const rec = checksOf(load('f399/mv73swnx/u-mv73swnx.jsonl'), null);
  assert.match(rec?.redCheck?.detail ?? '', /^check "line-1-flight-list-facts" red/);
  const r = getRunResult('mv73swnx', w.opts);
  assert.equal(typeof r.gap.line, 'string');
  assert.ok(r.gap.line.length > 0);
});

test('result-changed-diffs-parity (GAP-7): outputOf.diffs holds every edit with its files, diff text and cut note data; changed paths are every leg\'s', () => {
  const o = outputOf(load('audit-grid/u-mvtatlxw.jsonl'), null);
  assert.equal(o?.diffs.length, 7);
  assert.equal(o?.changed.length, 9);
  for (const e of o?.diffs ?? []) { assert.ok(Number.isInteger(e.n)); assert.ok(Array.isArray(e.files)); assert.ok(Array.isArray(e.binary)); }
  assert.ok((o?.diffs ?? []).some((e) => e.files.some((f) => f.diff.length > 0)));
});

test('review-findings-parity (GAP-6): outputOf.findings holds the review-findings per line and the file count', () => {
  const o = outputOf(load('result-a/u-mwqnkvx5-findings.jsonl'), null);
  assert.ok(o?.findings && o.findings.lines.length >= 1);
  assert.ok(o.findings.byLine.get(o.findings.lines[0]).items.length >= 1);
  assert.equal(outputOf(load('result-a/u-mwqnkvx5.jsonl'), null)?.findings, null);
});
