// PLACE RULES, P4 (docs/product/ITEM33-BUILD.md, "Place rules build spec"): when any rule is not found the run stops BEFORE any spend, through the existing
// settleRefused path (a $0 settled row, exit 2), and the words list every rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { proveRubricInputs } from '../src/source.js';
import { jobSpecHash } from '../src/job.js';
import { main } from '../src/userrun.js';
import { readRunList } from '../src/runlist.js';
import { PLAIN_REASONS, PLACE_REASONS, STOP_TAIL, stopWords } from '../src/placerule.js';
import { scriptedProvider } from './helpers.js';

const PLACE = { kind: 'headingBetween', prefix: '## [', end: ']', shape: 'semver', skip: ['Unreleased'] };
const DATE = { ...PLACE, kind: 'headingDateAfter' };
const tmp = (/** @type {import('node:test').TestContext} */ t, /** @type {string} */ p) => { const d = mkdtempSync(join(tmpdir(), p)); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };

test('P4 stopWords: every rule listed, "(was ...)" only on a new value, plain reasons from the closed list, the fixed closing line', () => {
  const w = stopWords([
    { name: 'version', found: true, value: '0.56.0', was: '0.55.0', reason: null },
    { name: 'date', found: false, value: null, was: '2026-11-04', reason: 'no-date-on-line' },
    { name: 'same', found: true, value: '1.0.0', was: '1.0.0', reason: null },
  ]);
  assert.equal(w, `version: found 0.56.0 (was 0.55.0)\ndate: not found (${PLAIN_REASONS['no-date-on-line']})\nsame: found 1.0.0\n${STOP_TAIL}`);
  assert.equal(STOP_TAIL, 'Reuse workflow and adjust the rules, or check the input. The run did not start. Nothing spent.');
  assert.deepEqual(Object.keys(PLAIN_REASONS).sort(), [...PLACE_REASONS].sort(), 'a plain sentence for every reason on the closed list, and no other');
  for (const v of Object.values(PLAIN_REASONS)) { assert.match(v, /^[a-z]/); assert.doesNotMatch(v, /[a-z]+-[a-z]+-[a-z]+/); }
});

test('P4 a changelog that turned mixed-level stops the run at $0: no provider call, a settled "refused before start" row, the words list BOTH rules', async (t) => {
  const dir = tmp(t, 'place-stop-');
  const file = join(dir, 'CHANGELOG.md');
  const spec = {
    schema: 'job-v1', job: 'newest-release', description: 'place-rule fixture.', provider: 'anthropic-api', cadence: { unit: 'day', every: 1 },
    budgetUsd: 2, maxWallMs: 1_800_000, writeScope: ['output/'], goal: 'Quote the newest release heading.', verdictType: 'soft-green', escalation: { mode: 'decision-ready' },
    jobLines: [{ n: 1, text: 'Quote the newest release heading', rule: '' }], inputs: [{ n: 1, label: 'changelog', value: file }],
    closeDecl: { genre: 'TEXT', lang: 'text', stages: [
      { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } },
      { name: 'line-1-newest-release', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [{ text: 'f', class: 'fact', source: 'changelog', facts: [
        { name: 'version', shape: 'phrase', phrase: '0.55.0', place: PLACE }, { name: 'date', shape: 'phrase', phrase: '2026-11-04', place: DATE }] }] } },
    ] },
  };
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  writeFileSync(file, '# [1.0.0] - 2026-12-01\n\n## [0.55.0] - 2026-11-04\n');
  const prep = await proveRubricInputs({ inputs: [{ n: 1, label: 'changelog', value: file }], into: join(dir, 'source-seed') });
  if (!prep.ok) throw new Error(JSON.stringify(prep));
  const provider = scriptedProvider([]);
  const home = tmp(t, 'place-stop-home-');
  /** @type {string[]} */ const err = [];
  const rc = await main(['--spec', specPath, '--approve', jobSpecHash(spec)], { provider, env: {}, out: () => {}, err: (s) => err.push(String(s)), runlistHome: home });
  assert.equal(rc, 2);
  assert.equal(provider.messagesLog.length, 0, 'no provider call');
  const list = readRunList({ home });
  assert.equal(list.rows.length, 1);
  const ev = list.events.find((e) => e.runid === list.rows[0].runid);
  assert.equal(ev?.type, 'settled');
  assert.equal(ev?.reason, 'refused before start');
  assert.equal(ev?.spentUsd, 0);
  assert.equal(ev?.spendComplete, true);
  const m = PLAIN_REASONS['mixed-levels'];
  assert.equal(ev?.words, `version: not found (${m})\ndate: not found (${m})\n${STOP_TAIL}`);
});
