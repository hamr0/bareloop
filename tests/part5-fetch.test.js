// PRD v1.106 Part 5 Q2: "fetching the page…" - the progress list says so right after the sign when the signed copy has a web input, and says it
// is done once the run's own refetch has written `refrozenAt`. Uses the REAL source.json of run mve5y8fa. (The Run tab clause of the spec is NOT
// built: see the commit message - the refetch happens BEFORE the run is listed, so the Run tab never overlaps it.)
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signRun, settleFetchingStep } from '../src/panel/authorroutes.js';
import { STEP_LABELS } from '../src/panel/authorsession.js';
import { webFetchState } from '../src/source.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL = JSON.parse(readFileSync(join(HERE, 'fixtures', 'part5', 'mve5y8fa.source.json'), 'utf8'));
/** @type {string[]} */ const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

/** a prepared session folder whose source.json is the real one, edited as `edit` says */
function world(edit) {
  const outDir = mkdtempSync(join(tmpdir(), 'part5-fetch-'));
  made.push(outDir);
  mkdirSync(join(outDir, 'source-seed'), { recursive: true });
  const manifest = edit(structuredClone(REAL));
  writeFileSync(join(outDir, 'source-seed', 'source.json'), JSON.stringify(manifest));
  const specPath = join(outDir, 'resolved-spec.json');
  writeFileSync(specPath, '{}');
  return { outDir, specPath, srcFile: join(outDir, 'source-seed', 'source.json'), manifest };
}
const signed = (w) => {
  const session = { state: { phase: 'prepared', specHash: 'abc123', resolvedSpecPath: w.specPath, outDir: w.outDir, messages: [], steps: [] } };
  const r = signRun(session, 'abc123', { env: {}, spawnFn: () => ({ unref: () => {} }), bareloopBin: '/x/bin/bareloop.mjs' });
  assert.equal(r.ok, true);
  return session;
};

test('webFetchState on the real source.json: a web input, fetching until a refetch finished at or after the sign', () => {
  const w = world((m) => m);
  assert.deepEqual(webFetchState(w.srcFile, '2026-10-18T18:30:00.000Z'), { hasWeb: true, fetching: false }, 'refrozenAt 18:33:04 is after a sign at 18:30');
  assert.deepEqual(webFetchState(w.srcFile, '2026-10-18T18:40:00.000Z'), { hasWeb: true, fetching: true }, 'a refetch from BEFORE the sign does not count');
  const none = world((m) => { delete m.refrozenAt; return m; });
  assert.deepEqual(webFetchState(none.srcFile, '2026-10-18T18:30:00.000Z'), { hasWeb: true, fetching: true });
  const files = world((m) => { m.inputs = m.inputs.map(({ url: _u, ...r }) => r); return m; });
  assert.deepEqual(webFetchState(files.srcFile, '2026-10-18T18:30:00.000Z'), { hasWeb: false, fetching: false }, 'a file-only job never says fetching');
  assert.deepEqual(webFetchState(join(w.outDir, 'nope.json'), null), { hasWeb: false, fetching: false });
});

test('the sign pushes "fetching the page…" after "signed hash" only when the signed copy has a web input', () => {
  const web = signed(world((m) => { delete m.refrozenAt; return m; }));
  assert.deepEqual(web.state.steps.map((s) => [s.id, s.status]), [['signed', 'done'], ['fetching', 'running']]);
  assert.equal(web.state.steps[1].label, 'fetching the page…');
  assert.equal(web.state.steps[1].label, STEP_LABELS.fetching, 'the words are the one table\'s');
  const fileOnly = signed(world((m) => { m.inputs = m.inputs.map(({ url: _u, ...r }) => r); return m; }));
  assert.deepEqual(fileOnly.state.steps.map((s) => s.id), ['signed'], 'a file-only job says nothing about fetching');
});

test('the step stays running until the run\'s own refetch writes refrozenAt, then is done (never stuck "fetching" after the page arrived)', () => {
  const w = world((m) => { m.refrozenAt = '2026-10-18T10:00:00.000Z'; return m; }); // an OLD refetch (the drafting copy): the sign is later
  const s = signed(w);
  settleFetchingStep(s.state);
  assert.equal(s.state.steps.find((x) => x.id === 'fetching').status, 'running', 'an old refrozenAt is not this run\'s fetch');
  const m = JSON.parse(readFileSync(w.srcFile, 'utf8'));
  m.refrozenAt = new Date(Date.now() + 1000).toISOString();
  writeFileSync(w.srcFile, JSON.stringify(m));
  settleFetchingStep(s.state);
  assert.equal(s.state.steps.find((x) => x.id === 'fetching').status, 'done');
  settleFetchingStep({ steps: [{ id: 'signed', status: 'done' }] }); // nothing to settle: no throw
});

test('the page types no fetching words (the label comes from the session state)', () => {
  const page = readFileSync(join(HERE, '..', 'src', 'panel', 'index.html'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(page, /fetching the page/);
});
