// PLACE RULES, P5 (docs/product/ITEM33-BUILD.md, "Place rules build spec"): one spine record per run, event `place-rules`, rows {key, kind, found, value, was, reason},
// emitted after job-start. "was" is the newest earlier run of the same workflow's `place-rules` record, else the drafting words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { proveRubricInputs } from '../src/source.js';
import { jobSpecHash, workflowKey } from '../src/job.js';
import { main } from '../src/userrun.js';
import { readRunList } from '../src/runlist.js';
import { placeValuesOfEvents } from '../src/placerule.js';
import { getRunDetail } from '../src/panel/server.js';
import { scriptedProvider, readSpine } from './helpers.js';

const PLACE = { kind: 'headingBetween', prefix: '## [', end: ']', shape: 'semver', skip: ['Unreleased'] };
const DATE = { ...PLACE, kind: 'headingDateAfter' };
const tmp = (/** @type {import('node:test').TestContext} */ t, /** @type {string} */ p) => { const d = mkdtempSync(join(tmpdir(), p)); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const log = (/** @type {string} */ v, /** @type {string} */ d) => `# Changelog\n\n## [${v}] - ${d}\n\n- change\n`;

const mkSpec = (/** @type {string} */ file) => ({
  schema: 'job-v1', job: 'newest-release', description: 'place-rule fixture.', provider: 'anthropic-api', cadence: { unit: 'day', every: 1 },
  budgetUsd: 2, maxWallMs: 1_800_000, writeScope: ['output/'], goal: 'Quote the newest release heading.', verdictType: 'soft-green', escalation: { mode: 'decision-ready' },
  jobLines: [{ n: 1, text: 'Quote the newest release heading', rule: '' }], inputs: [{ n: 1, label: 'changelog', value: file }],
  closeDecl: { genre: 'TEXT', lang: 'text', stages: [
    { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } },
    { name: 'line-1-newest-release', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [{ text: 'f', class: 'fact', source: 'changelog', facts: [
      { name: 'version', shape: 'phrase', phrase: '0.55.0', place: PLACE }, { name: 'date', shape: 'phrase', phrase: '2026-11-04', place: DATE }] }] } },
  ] },
});

/** one run of the signed job over a changelog text, in the shared `home`; returns the run's spine records */
async function runOnce(/** @type {import('node:test').TestContext} */ t, /** @type {string} */ home, /** @type {string} */ text, /** @type {string} */ quote) {
  const dir = tmp(t, 'place-audit-');
  const file = join(dir, 'CHANGELOG.md');
  const spec = mkSpec(file);
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  writeFileSync(file, text);
  const prep = await proveRubricInputs({ inputs: [{ n: 1, label: 'changelog', value: file }], into: join(dir, 'source-seed') });
  if (!prep.ok) throw new Error(JSON.stringify(prep));
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'line-1', action: 'Write output/steps/1.json', tools: ['write'], rounds: 6, target: 'output/steps/1.json',
    exit: [{ type: 'tree-changed', scope: 'output/**' }, { type: 'check-passes', name: 'line-1-newest-release' }] }] });
  const provider = scriptedProvider([{ text: 'scout' }, { text: plan },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(prep.prep.tree, 'output', 'steps', '1.json'), content: `${JSON.stringify({ results: [{ quote, values: {} }] })}\n` } }] }, { text: 'wrote' }]);
  const rc = await main(['--spec', specPath, '--approve', jobSpecHash(spec)], { provider, env: {}, out: () => {}, err: () => {}, runlistHome: home });
  const row = readRunList({ home }).rows.at(-1);
  return { rc, spec, events: readSpine(row.spine) };
}

test('P5 a fresh run records `place-rules` right after job-start: found values, "was" = the drafting words when there is no earlier run, no reason', async (t) => {
  const home = tmp(t, 'place-audit-home-');
  const r = await runOnce(t, home, log('0.56.0', '2026-11-10'), '## [0.56.0] - 2026-11-10');
  const i = r.events.findIndex((e) => e.type === 'job-start');
  assert.equal(r.events[i + 1].type, 'place-rules', 'emitted after job-start');
  assert.equal(r.events.filter((e) => e.type === 'place-rules').length, 1, 'one record per run');
  const rec = r.events[i + 1];
  assert.equal(rec.workflowKey, workflowKey(r.spec));
  const detail = getRunDetail(readRunList({ home }).rows.at(-1).runid, { home });
  assert.deepEqual(detail.placeRules, ['version: 0.56.0 (was 0.55.0)', 'date: 2026-11-10 (was 2026-11-04)'], 'the Audit data: plain lines from code');
  assert.deepEqual(rec.rows, [
    { key: 'line-1-newest-release/version', kind: 'headingBetween', found: true, value: '0.56.0', was: '0.55.0', reason: null },
    { key: 'line-1-newest-release/date', kind: 'headingDateAfter', found: true, value: '2026-11-10', was: '2026-11-04', reason: null },
  ]);
});

test('P5 a later run of the same workflow takes "was" from the earlier run\'s place-rules record, not from the drafting words', async (t) => {
  const home = tmp(t, 'place-audit-home-');
  await runOnce(t, home, log('0.56.0', '2026-11-10'), '## [0.56.0] - 2026-11-10');
  const r2 = await runOnce(t, home, log('0.57.0', '2026-11-12'), '## [0.57.0] - 2026-11-12');
  const rec = r2.events.find((e) => e.type === 'place-rules');
  assert.deepEqual(rec.rows.map((/** @type {any} */ x) => [x.key.split('/')[1], x.value, x.was]), [['version', '0.57.0', '0.56.0'], ['date', '2026-11-12', '2026-11-10']]);
});

test('P5 placeValuesOfEvents: the values of the LAST place-rules record (what a resume of that run rebinds), none when there is no record or a row was not found', () => {
  const ev = [{ type: 'job-start' }, { type: 'place-rules', rows: [{ key: 'a/v', found: true, value: '1.0.0' }] }, { type: 'place-rules', rows: [{ key: 'a/v', found: true, value: '1.1.0' }, { key: 'a/d', found: true, value: '2026-01-02' }] }];
  assert.deepEqual(placeValuesOfEvents(ev), { 'a/v': '1.1.0', 'a/d': '2026-01-02' });
  assert.equal(placeValuesOfEvents([{ type: 'job-start' }]), null);
  assert.equal(placeValuesOfEvents([{ type: 'place-rules', rows: [{ key: 'a/v', found: false, value: null }] }]), null);
});
