// hamr 2026-11-14 (rubric vs deterministic split, piece 6): a job made with PASS/FAIL examples or the old judge cannot come back in through Reuse (the panel, and a
// scheduled fire) or an exported bundle: it refuses in plain words ("draft it fresh"). Old runs are not repaired.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { oldJobWords, OLD_JOB_WORDS } from '../src/job.js';
import { createSession } from '../src/panel/authorsession.js';
import { bundleMain } from '../src/bundlerun.js';
import { main as userUMain } from '../src/userrun.js';
import { exportFixtureBundle } from './bundle-fixture.js';
import { ANTH_CFG } from './helpers.js';

const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const WORDS = 'This job was made with PASS/FAIL examples or the old judge, which are gone. Draft it fresh.';
const OLD_EXAMPLES = { jobLines: [{ n: 1, text: 'Document it', rule: 'PASS: a doc block; FAIL: none', rules: ['PASS: a doc block', 'FAIL: none'] }] };
const OLD_JUDGE = { verdictType: 'soft-green', closeDecl: { genre: 'TYPES', lang: 'js', stages: [{ name: 'judged', kind: 'judged-floor', params: { card: { items: [{ rule: 'has-doc', text: 'documented' }] }, paths: ['src/a.js'] } }] } };

test('oldJobWords: a spec with PASS/FAIL job lines or a judged-floor stage is an old job; a clean one is not', () => {
  assert.equal(OLD_JOB_WORDS, WORDS);
  assert.equal(oldJobWords({ job: 'x', ...OLD_EXAMPLES }), WORDS);
  assert.equal(oldJobWords({ job: 'x', jobLines: [{ n: 1, text: 'a', rule: 'fail: b' }] }), WORDS, 'a rule only (an older spec has no rules array), any case');
  assert.equal(oldJobWords({ job: 'x', ...OLD_JUDGE }), WORDS);
  assert.equal(oldJobWords({ job: 'x', jobLines: [{ n: 1, text: 'Fix it', rule: 'do not edit tests; no pass through', rules: ['do not edit tests', 'no pass through'] }] }), null);
  assert.equal(oldJobWords({ job: 'x' }), null);
});

test('Reuse of an old job: the session refuses in the exact words, at $0, with no model call', async () => {
  const home = tmp('old-job-home-');
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  writeFileSync(join(home, 'config.json'), JSON.stringify(ANTH_CFG));
  const spec = { schema: 'job-v1', job: 'old-job', goal: 'g', budgetUsd: 1, writeScope: ['src/**'], ...OLD_EXAMPLES };
  const s = createSession({ checkType: 'deterministic', model: 'claude-sonnet-5', jobName: 'old-job', jobText: 'Document it', inputs: 'repo: /nonexistent', destination: 'src/', capUsd: 1 }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionsRoot: join(home, 'sessions'), reuse: { spec, workflowKey: 'k' },
    generate: async () => { throw new Error('no model call'); },
  });
  const t0 = Date.now();
  while (!['refused', 'error', 'prepared'].includes(s.state.phase) && Date.now() - t0 < 8000) await new Promise((r) => { setTimeout(r, 15); });
  assert.equal(s.state.phase, 'refused');
  assert.equal(s.state.error, `${WORDS} Nothing spent.`);
});

test('an exported bundle of an old job refuses at the bundle door, before any key or repo is touched', async () => {
  const dir = join(tmp('old-job-bundle-'), 'b');
  exportFixtureBundle(dir, { job: 'old-bundle-job', extra: OLD_EXAMPLES });
  const outs = []; const errs = [];
  const parseFlags = (a) => ({ positional: a.filter((x) => !x.startsWith('--')), flags: Object.fromEntries(a.filter((x) => x.startsWith('--')).map((x) => [x.slice(2), true])) });
  const code = await bundleMain([dir, '--repo', tmp('old-job-repo-')], {
    out: (s) => outs.push(s), err: (s) => errs.push(s), cwd: dir, env: {}, now: () => Date.now(), deps: {}, parseFlags: (a) => {
      const flags = {}; const positional = [];
      for (let i = 0; i < a.length; i += 1) { if (a[i].startsWith('--')) { flags[a[i].slice(2)] = a[i + 1]; i += 1; } else positional.push(a[i]); }
      return { positional, flags };
    }, printReds: (reds, err) => err(JSON.stringify(reds)),
  });
  assert.equal(code, 1);
  assert.ok(errs.join('\n').includes(WORDS), errs.join('\n'));
  assert.equal(outs.some((l) => /first run|bundleHash/.test(l)), false, 'nothing was shown or signed');
});

test('run-u --spec of an old job refuses in the exact words, at $0, before any prepared copy, key or model call', async () => {
  const dir = tmp('old-job-spec-');
  const specPath = join(dir, 'resolved-spec.json');
  // judged-floor has left the kind list, so validateJob alone would say something else; the door must say the plain words first
  writeFileSync(specPath, JSON.stringify({ schema: 'job-v1', job: 'old-job', goal: 'g', budgetUsd: 1, writeScope: ['src/**'], ...OLD_EXAMPLES }));
  const errs = [];
  const rc = await userUMain(['--spec', specPath], { env: {}, keysHome: dir, out: () => {}, err: (s) => errs.push(s) });
  assert.equal(rc, 2);
  assert.ok(errs.join('\n').includes(WORDS), errs.join('\n'));
  assert.doesNotMatch(errs.join('\n'), /fails validateJob|prepared copy/);
});
