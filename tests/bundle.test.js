// Export M1 (`docs/product/EXPORT-BUILD.md`, frozen 2026-09-05). `src/bundle.js`
// mints/reads/resolves a bundle directory: a signed job spec (close paths
// rewritten to `$BARELOOP_BUNDLE/close/<script>`), the close scripts it needs,
// and the job's whole registry history. Nothing here talks to a provider or
// runs a close — every case is a pure filesystem read/write judged against the
// frozen contract.
//
// Style follows tests/bridges.test.js: one real job-spec + close-script + bridge
// fixture, table-driven mutators, one red per case. Every red case is proven
// able to fail by construction — the happy path is asserted first, then exactly
// one field is broken per case, so a case that trips zero reds (or a different
// one) is a table bug, not a pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateJob, jobSpecHash } from '../src/job.js';
import { mintBridge } from '../src/bridges.js';
import {
  exportBundle, bundleHash, readBundle, resolveBundleSpec, checkEnvelope, bless, verifyBlessing, appendHistory,
} from '../src/bundle.js';

const clone = (/** @type {any} */ o) => JSON.parse(JSON.stringify(o));

/** @param {import('node:test').TestContext} t @param {string} prefix */
const tmp = (t, prefix) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};

// ---------------------------------------------------------------------------
// fixtures: a real close script (imports from ../src/kinds.js, the exact
// pattern every shipped close script uses), a signed job spec whose close
// stages both point at it (with different args, the same real-world shape as
// jobs/aurora-u-spawner-types.json), and a bridge minted at that spec's hash.
// ---------------------------------------------------------------------------

const CLOSE_SCRIPT_PATH = '/home/hamr/PycharmProjects/bareloop-close/scripts/fixture-close.mjs';
const CLOSE_SCRIPT_SOURCE = `import { readFileSync } from 'node:fs';
import { JUDGED_MARKER } from '../src/kinds.js';

const stage = process.argv[2];
console.log(\`FIXTURE \${stage} \${JUDGED_MARKER}\`);
process.exit(0);
`;

const JOB = {
  schema: 'job-v1',
  job: 'fixture-export-job',
  description: 'a two-stage close, both stages sharing one script (real shape)',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  maxWallMs: 1_800_000,
  writeScope: ['src/**'],
  goal: 'Make the fixture pass its own close.',
  verdictType: 'green',
  close: [
    { name: 'changed-from-seed', cmd: `node ${CLOSE_SCRIPT_PATH} changed-from-seed`, expect: 0, offer: false },
    { name: 'suite-green', cmd: `node ${CLOSE_SCRIPT_PATH} suite-green`, expect: 0 },
  ],
  escalation: { mode: 'decision-ready' },
};

const CLOSE_STAGE_NAMES = ['changed-from-seed', 'suite-green'];

/** one green bridge, minted at JOB's own hash, the way `writeRunGreenRow` builds meta */
function bridgeFor(job) {
  const m = mintBridge(
    { name: job.job, goal: job.goal, specHash: jobSpecHash(job), closeStageNames: CLOSE_STAGE_NAMES, toolsUsed: ['read', 'grep', 'edit'] },
    { runid: 'r1', patient: 'p1', at: '2026-09-05T00:00:00.000Z', plan: { schema: 'plan-v1', steps: [] }, costUsd: 2, spendComplete: true, wallMs: 60_000, rounds: 10, specHash: jobSpecHash(job) },
  );
  assert.equal(m.ok, true, `bridge fixture must mint clean: ${JSON.stringify(m.reds)}`);
  return m.bridge;
}

/** @param {import('node:test').TestContext} t */
function makeRegistry(t, bridge) {
  const dir = tmp(t, 'bareloop-registry-');
  writeFileSync(join(dir, `${bridge.name}.json`), `${JSON.stringify(bridge, null, 2)}\n`);
  return dir;
}

const CLOSE_SCRIPTS = { [CLOSE_SCRIPT_PATH]: CLOSE_SCRIPT_SOURCE };

// ---------------------------------------------------------------------------
// fixture connectivity
// ---------------------------------------------------------------------------

test('the JOB fixture is validateJob-green', () => {
  const r = validateJob(JOB);
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
});

// ---------------------------------------------------------------------------
// exportBundle — happy path
// ---------------------------------------------------------------------------

test('exportBundle writes the bundle directory and is readBundle-clean', (t) => {
  const bridge = bridgeFor(JOB);
  const registryDir = makeRegistry(t, bridge);
  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture.bareloop');

  const r = exportBundle({ spec: JOB, closeScripts: CLOSE_SCRIPTS, registryDir, outDir, bareloopVersion: '0.99.0' });
  assert.equal(r.ok, true, `export must succeed: ${JSON.stringify(r.reds)}`);
  assert.deepEqual(r.reds, []);
  assert.equal(r.dir, outDir);
  assert.equal(typeof r.bundleHash, 'string');

  // the layout the spec names
  assert.ok(existsSync(join(outDir, 'manifest.json')));
  assert.ok(existsSync(join(outDir, 'spec.json')));
  assert.ok(existsSync(join(outDir, 'close', 'fixture-close.mjs')));
  assert.ok(existsSync(join(outDir, 'bridges', 'fixture-export-job.json')));
  assert.ok(existsSync(join(outDir, 'README.md')));
  // NEVER written at export
  assert.equal(existsSync(join(outDir, 'blessing.json')), false);
  assert.equal(existsSync(join(outDir, 'history.jsonl')), false);

  // one script, deduped across both stages that pointed at it
  const closeText = readFileSync(join(outDir, 'close', 'fixture-close.mjs'), 'utf8');
  assert.match(closeText, /from 'bareloop'/);
  assert.doesNotMatch(closeText, /\.\.\/src\/kinds\.js/);

  const specOut = JSON.parse(readFileSync(join(outDir, 'spec.json'), 'utf8'));
  assert.equal(specOut.close[0].cmd, 'node $BARELOOP_BUNDLE/close/fixture-close.mjs changed-from-seed');
  assert.equal(specOut.close[1].cmd, 'node $BARELOOP_BUNDLE/close/fixture-close.mjs suite-green');

  const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.schema, 'bundle-v1');
  assert.equal(manifest.job, 'fixture-export-job');
  assert.equal(manifest.bareloopVersion, '0.99.0');
  assert.equal(manifest.bundleHash, r.bundleHash);
  assert.deepEqual(Object.keys(manifest.files).sort(), ['close/fixture-close.mjs', 'spec.json']);

  const read = readBundle(outDir);
  assert.equal(read.ok, true, `readBundle must be clean: ${JSON.stringify(read.reds)}`);
  assert.deepEqual(read.reds, []);
  assert.equal(read.spec.close[0].cmd, specOut.close[0].cmd);
  assert.equal(read.manifest.bundleHash, r.bundleHash);
  assert.equal(read.bridges.length, 1);
  assert.equal(read.bridges[0].name, 'fixture-export-job');
  assert.equal(read.blessing, null);
  assert.deepEqual(read.history, []);
});

test('bundleHash recomputes the exact value exportBundle minted', (t) => {
  const bridge = bridgeFor(JOB);
  const registryDir = makeRegistry(t, bridge);
  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture.bareloop');
  const r = exportBundle({ spec: JOB, closeScripts: CLOSE_SCRIPTS, registryDir, outDir, bareloopVersion: '0.99.0' });
  assert.equal(bundleHash(outDir), r.bundleHash);
});

// ---------------------------------------------------------------------------
// resolveBundleSpec + checkEnvelope
// ---------------------------------------------------------------------------

test('resolveBundleSpec substitutes $BARELOOP_BUNDLE in memory and hashes the substituted spec', (t) => {
  const bridge = bridgeFor(JOB);
  const registryDir = makeRegistry(t, bridge);
  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture.bareloop');
  exportBundle({ spec: JOB, closeScripts: CLOSE_SCRIPTS, registryDir, outDir, bareloopVersion: '0.99.0' });
  const read = readBundle(outDir);

  const { spec, approveHash } = resolveBundleSpec(read, outDir);
  assert.equal(spec.close[0].cmd, `node ${outDir}/close/fixture-close.mjs changed-from-seed`);
  assert.equal(approveHash, jobSpecHash(spec));
  // the on-disk spec.json is UNCHANGED — substitution is in-memory only
  const onDisk = JSON.parse(readFileSync(join(outDir, 'spec.json'), 'utf8'));
  assert.match(onDisk.close[0].cmd, /\$BARELOOP_BUNDLE/);
  // the substituted hash differs from the unsubstituted (token-bearing) spec's hash
  assert.notEqual(approveHash, jobSpecHash(onDisk));
});

test('checkEnvelope: tighten-only, absent fields pass, a wider number reds envelope-widen', () => {
  const spec = { budgetUsd: 5, maxWallMs: 1_800_000 };
  assert.deepEqual(checkEnvelope(spec, {}), { ok: true, reds: [] });
  assert.deepEqual(checkEnvelope(spec, { budgetUsd: 5 }), { ok: true, reds: [] });
  assert.deepEqual(checkEnvelope(spec, { budgetUsd: 3, maxWallMs: 900_000 }), { ok: true, reds: [] });

  const widerBudget = checkEnvelope(spec, { budgetUsd: 10 });
  assert.equal(widerBudget.ok, false);
  assert.equal(widerBudget.reds.length, 1);
  assert.equal(widerBudget.reds[0].code, 'envelope-widen');
  assert.equal(widerBudget.reds[0].path, 'budgetUsd');

  const widerWall = checkEnvelope(spec, { maxWallMs: 3_600_000 });
  assert.equal(widerWall.ok, false);
  assert.equal(widerWall.reds[0].code, 'envelope-widen');
  assert.equal(widerWall.reds[0].path, 'maxWallMs');

  // a spec with no maxWallMs of its own has nothing to widen
  assert.deepEqual(checkEnvelope({ budgetUsd: 5 }, { maxWallMs: 3_600_000 }), { ok: true, reds: [] });
});

// ---------------------------------------------------------------------------
// bless / verifyBlessing
// ---------------------------------------------------------------------------

test('bless writes blessing.json; verifyBlessing matches, then goes stale on re-export, then unblessed when absent', (t) => {
  const bridge = bridgeFor(JOB);
  const registryDir = makeRegistry(t, bridge);
  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture.bareloop');
  const first = exportBundle({ spec: JOB, closeScripts: CLOSE_SCRIPTS, registryDir, outDir, bareloopVersion: '0.99.0' });

  const unblessed = verifyBlessing(readBundle(outDir));
  assert.deepEqual(unblessed, { ok: false, unblessed: true, reds: [] });

  bless(outDir, { bundleHash: first.bundleHash, runid: 'run-1', outcome: 'green', host: 'test-host' });
  assert.ok(existsSync(join(outDir, 'blessing.json')));
  const matched = verifyBlessing(readBundle(outDir));
  assert.deepEqual(matched, { ok: true, unblessed: false, reds: [] });

  // tamper the close script byte-for-byte, as if re-exported/edited in place —
  // the manifest hash on disk is now stale against the (still-present) blessing
  writeFileSync(join(outDir, 'close', 'fixture-close.mjs'), `${readFileSync(join(outDir, 'close', 'fixture-close.mjs'), 'utf8')}\n// tampered\n`);
  const staleManifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'));
  // recompute the manifest to reflect a legitimate re-export (bundleHash changes)
  // without re-blessing — this is what "re-export, no re-bless yet" looks like
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ ...staleManifest, bundleHash: bundleHash(outDir) }, null, 2));
  const stale = verifyBlessing(readBundle(outDir));
  assert.equal(stale.unblessed, false);
  assert.equal(stale.ok, false);
  assert.equal(stale.reds[0].code, 'blessing-stale');
});

// ---------------------------------------------------------------------------
// readBundle — bundle-tampered (N4, load-bearing)
// ---------------------------------------------------------------------------

test('readBundle: a byte-flipped close script red bundle-tampered, never a warning', (t) => {
  const bridge = bridgeFor(JOB);
  const registryDir = makeRegistry(t, bridge);
  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture.bareloop');
  exportBundle({ spec: JOB, closeScripts: CLOSE_SCRIPTS, registryDir, outDir, bareloopVersion: '0.99.0' });

  // tamper one byte of the close script AFTER export, manifest untouched —
  // exactly N4's attack: the spec's own hash never moves (cmd is a path), so
  // only readBundle's tamper check stands between this and a fake green
  const scriptFile = join(outDir, 'close', 'fixture-close.mjs');
  writeFileSync(scriptFile, readFileSync(scriptFile, 'utf8').replace('FIXTURE', 'HACKED'));

  const r = readBundle(outDir);
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].code, 'bundle-tampered');
});

test('readBundle: a missing close script also reds bundle-tampered', (t) => {
  const bridge = bridgeFor(JOB);
  const registryDir = makeRegistry(t, bridge);
  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture.bareloop');
  exportBundle({ spec: JOB, closeScripts: CLOSE_SCRIPTS, registryDir, outDir, bareloopVersion: '0.99.0' });
  rmSync(join(outDir, 'close', 'fixture-close.mjs'));

  const r = readBundle(outDir);
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'bundle-tampered');
});

test('readBundle: missing/unparseable manifest and spec are typed reds', (t) => {
  const outDir = tmp(t, 'bareloop-empty-');
  const r = readBundle(outDir);
  assert.equal(r.ok, false);
  const codes = r.reds.map((x) => x.code).sort();
  assert.deepEqual(codes, ['manifest-invalid', 'spec-invalid']);

  const outDir2 = tmp(t, 'bareloop-bad-json-');
  writeFileSync(join(outDir2, 'manifest.json'), '{not json');
  writeFileSync(join(outDir2, 'spec.json'), '{not json either');
  const r2 = readBundle(outDir2);
  assert.equal(r2.ok, false);
  assert.deepEqual(r2.reds.map((x) => x.code).sort(), ['manifest-invalid', 'spec-invalid']);
});

test('readBundle: a directory that does not exist is bundle-missing', () => {
  const r = readBundle('/nonexistent/path/does-not-exist-xyz');
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'bundle-missing');
});

// ---------------------------------------------------------------------------
// exportBundle — refusals, typed reds, nothing written
// ---------------------------------------------------------------------------

test('exportBundle refuses: no bridge in the registry at all', (t) => {
  const registryDir = tmp(t, 'bareloop-empty-registry-');
  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture.bareloop');
  const r = exportBundle({ spec: JOB, closeScripts: CLOSE_SCRIPTS, registryDir, outDir, bareloopVersion: '0.99.0' });
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].code, 'no-bridge-at-hash');
  assert.equal(existsSync(outDir), false, 'a refused export writes nothing');
});

test('exportBundle refuses: a bridge exists but at a DIFFERENT spec hash (spec drifted since the green)', (t) => {
  const bridge = bridgeFor(JOB); // minted for JOB
  const registryDir = makeRegistry(t, bridge);
  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture.bareloop');
  const drifted = clone(JOB);
  drifted.budgetUsd = 999; // any semantic edit moves jobSpecHash
  const r = exportBundle({ spec: drifted, closeScripts: CLOSE_SCRIPTS, registryDir, outDir, bareloopVersion: '0.99.0' });
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'no-bridge-at-hash');
  assert.equal(existsSync(outDir), false);
});

test('exportBundle refuses: a close[].cmd not shaped "node <abs .mjs> …"', (t) => {
  const bridge = bridgeFor(JOB);
  const registryDir = makeRegistry(t, bridge);
  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture.bareloop');
  const bad = clone(JOB);
  bad.close[1].cmd = 'npm test'; // not node, no path
  // the registry was minted for JOB's hash, and this edit moves the hash too —
  // isolate the case: mint a bridge for THIS bad spec so only the cmd-shape
  // check can fire
  const bridge2 = bridgeFor(bad);
  const registryDir2 = makeRegistry(t, bridge2);
  const r = exportBundle({ spec: bad, closeScripts: CLOSE_SCRIPTS, registryDir: registryDir2, outDir, bareloopVersion: '0.99.0' });
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].code, 'close-cmd-unrelocatable');
  assert.equal(existsSync(outDir), false);
});

test('exportBundle refuses: a close script importing something src/index.js does not export', (t) => {
  const badScript = CLOSE_SCRIPT_SOURCE.replace('JUDGED_MARKER', 'NOT_A_REAL_EXPORT');
  const job = clone(JOB);
  const bridge = bridgeFor(job);
  const registryDir = makeRegistry(t, bridge);
  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture.bareloop');
  const r = exportBundle({ spec: job, closeScripts: { [CLOSE_SCRIPT_PATH]: badScript }, registryDir, outDir, bareloopVersion: '0.99.0' });
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].code, 'close-import-unexported');
  assert.match(r.reds[0].detail, /NOT_A_REAL_EXPORT/);
  assert.equal(existsSync(outDir), false);
});

// ---------------------------------------------------------------------------
// exportBundle — close-import-unparsed: shapes this module cannot verify at
// all, and a relative import that does not point into src/ (a sibling file
// close/ never ships). Each case swaps ONLY the kinds.js import line for one
// unparsed form — everything else about CLOSE_SCRIPT_SOURCE stays real.
// ---------------------------------------------------------------------------

const KINDS_IMPORT_LINE = "import { JUDGED_MARKER } from '../src/kinds.js';";

/** @param {string} replacementLine */
function scriptWith(replacementLine) {
  return CLOSE_SCRIPT_SOURCE.replace(KINDS_IMPORT_LINE, replacementLine);
}

/** @param {import('node:test').TestContext} t @param {string} script @returns {any} */
function exportWithScript(t, script) {
  const job = clone(JOB);
  const bridge = bridgeFor(job);
  const registryDir = makeRegistry(t, bridge);
  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture.bareloop');
  return exportBundle({ spec: job, closeScripts: { [CLOSE_SCRIPT_PATH]: script }, registryDir, outDir, bareloopVersion: '0.99.0' });
}

test('exportBundle refuses: a default import from src is close-import-unparsed', (t) => {
  const r = exportWithScript(t, scriptWith("import JUDGED_MARKER from '../src/kinds.js';"));
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].code, 'close-import-unparsed');
  assert.match(r.reds[0].detail, /fixture-close\.mjs/);
  assert.match(r.reds[0].detail, /kinds\.js/);
});

test('exportBundle refuses: a namespace import from src is close-import-unparsed', (t) => {
  const r = exportWithScript(t, scriptWith("import * as k from '../src/kinds.js';"));
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].code, 'close-import-unparsed');
});

test('exportBundle refuses: a bare side-effect import of src is close-import-unparsed', (t) => {
  const r = exportWithScript(t, scriptWith("import '../src/kinds.js';"));
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].code, 'close-import-unparsed');
});

test('exportBundle refuses: a dynamic import() of src is close-import-unparsed', (t) => {
  const r = exportWithScript(t, scriptWith("await import('../src/kinds.js');"));
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].code, 'close-import-unparsed');
});

test('exportBundle refuses: a plain named import of a SIBLING relative file (not src/) is close-import-unparsed', (t) => {
  const r = exportWithScript(t, scriptWith("import { x } from './helpers.mjs';"));
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].code, 'close-import-unparsed');
  assert.match(r.reds[0].detail, /helpers\.mjs/);
});

test('exportBundle: a plain named import of a REAL export from src still passes', (t) => {
  const r = exportWithScript(t, KINDS_IMPORT_LINE); // unchanged — the real fixture shape
  assert.equal(r.ok, true, `must succeed: ${JSON.stringify(r.reds)}`);
  assert.deepEqual(r.reds, []);
});

test('exportBundle refuses: outDir exists and is non-empty', (t) => {
  const bridge = bridgeFor(JOB);
  const registryDir = makeRegistry(t, bridge);
  const outDir = tmp(t, 'bareloop-nonempty-');
  writeFileSync(join(outDir, 'leftover.txt'), 'x');
  const r = exportBundle({ spec: JOB, closeScripts: CLOSE_SCRIPTS, registryDir, outDir, bareloopVersion: '0.99.0' });
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'outdir-not-empty');
  // the pre-existing file must survive untouched
  assert.equal(readFileSync(join(outDir, 'leftover.txt'), 'utf8'), 'x');
});

test('exportBundle refuses: a close script named in cmd has no source in closeScripts', (t) => {
  const bridge = bridgeFor(JOB);
  const registryDir = makeRegistry(t, bridge);
  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture.bareloop');
  const r = exportBundle({ spec: JOB, closeScripts: {}, registryDir, outDir, bareloopVersion: '0.99.0' });
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'close-script-missing');
  assert.equal(existsSync(outDir), false);
});
