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
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateJob, jobSpecHash } from '../src/job.js';
import { mintBridge } from '../src/bridges.js';
import { writeRunGreenRow } from '../src/reuse.js';
import {
  exportBundle, bundleHash, readBundle, resolveBundleSpec, checkEnvelope, bless, verifyBlessing, appendHistory, checkBundleDeps,
} from '../src/bundle.js';
import { hashCloseScriptBytes, checkCloseByteSignature } from '../src/close-integrity.js';

/** this repo's own root — the real `bareloop` package a symlinked
 * node_modules/bareloop points at in these fixtures. */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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
// PRD item 27/M2: both close stages below share this one script file, so
// they share this one signature — the sha256 field never covers `cmd`'s
// args, only the bytes the path resolves to.
const CLOSE_SCRIPT_SHA256 = hashCloseScriptBytes(CLOSE_SCRIPT_SOURCE);

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
    { name: 'changed-from-seed', cmd: `node ${CLOSE_SCRIPT_PATH} changed-from-seed`, expect: 0, offer: false, sha256: CLOSE_SCRIPT_SHA256 },
    { name: 'suite-green', cmd: `node ${CLOSE_SCRIPT_PATH} suite-green`, expect: 0, sha256: CLOSE_SCRIPT_SHA256 },
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
// the shape-forked bridge fixture (`no-bridge-at-hash` live defect, F-export-M1
// fix 2): a VARIANT of JOB whose close carries an EXTRA stage, so its stage
// set differs from the base bridge's stored `closeStageNames`. Minted through
// the REAL `writeRunGreenRow`/`writeGreenRow` seam — never a hand-written
// bridge file — so the fork name this fixture produces is exactly the name
// production would mint, not a name this test asserted into being.
// ---------------------------------------------------------------------------

const VARIANT_JOB = (() => {
  const j = clone(JOB);
  j.close = [...j.close, { name: 'extra-stage', cmd: `node ${CLOSE_SCRIPT_PATH} extra-stage`, expect: 0, sha256: CLOSE_SCRIPT_SHA256 }];
  return j;
})();

/**
 * Mint a base bridge for JOB, then write a green for VARIANT_JOB under the
 * SAME job slug — production's real fork trigger (`writeGreenRow`: an entry
 * already exists under this name with a DIFFERENT close-stage shape). Returns
 * the registryDir holding BOTH the base file and the forked file, plus the
 * fork's own name (read off the write record `writeRunGreenRow` returns, not
 * recomputed).
 * @param {import('node:test').TestContext} t
 */
function mintForkFixture(t) {
  const baseBridge = bridgeFor(JOB);
  const registryDir = makeRegistry(t, baseBridge);
  const variantHash = jobSpecHash(VARIANT_JOB);
  const result = writeRunGreenRow({
    registryDir,
    job: VARIANT_JOB,
    name: null, // defaults to VARIANT_JOB.job, same slug as JOB.job
    outcome: 'green',
    plan: { schema: 'plan-v1', steps: [{ id: 's1', tools: ['read', 'edit'] }] },
    record: {
      runid: 'r2', patient: 'p1', at: '2026-09-06T00:00:00.000Z',
      costUsd: 2, spendComplete: true, wallMs: 60_000, rounds: 10, specHash: variantHash,
    },
  });
  assert.equal(result.minted, true, `fork fixture must mint clean: ${JSON.stringify(result)}`);
  assert.equal(result.write.action, 'mint-shape-forked', 'the real seam must have taken the fork path, not appended');
  const forkName = result.write.name;
  assert.notEqual(forkName, JOB.job, 'a forked write must land under a DERIVED name, not the base slug');
  return { registryDir, forkName, variantHash, baseBridge };
}

/** copy exactly ONE named bridge file out of a registry into a fresh, isolated registry dir
 * @param {import('node:test').TestContext} t @param {string} srcDir @param {string} name */
function isolateBridge(t, srcDir, name) {
  const dir = tmp(t, 'bareloop-registry-iso-');
  writeFileSync(join(dir, `${name}.json`), readFileSync(join(srcDir, `${name}.json`), 'utf8'));
  return dir;
}

// ---------------------------------------------------------------------------
// fixture connectivity
// ---------------------------------------------------------------------------

test('the JOB fixture is validateJob-green', () => {
  const r = validateJob(JOB);
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
});

// ---------------------------------------------------------------------------
// PRD item 27/M3 Part B — a close reading BARELOOP_CLOSE_DIR exports cleanly.
// `env.BARELOOP_CLOSE_DIR` is not an absolute-path STRING LITERAL in the
// script's own source (it is an env-var read), so it must never trip
// `close-absolute-path`/`close-cmd-unrelocatable` — this is a $0 regression
// pin for that, not a behaviour this rung had to newly implement.
// ---------------------------------------------------------------------------

test('exportBundle: a close reading process.env.BARELOOP_CLOSE_DIR exports cleanly (no close-absolute-path, no close-cmd-unrelocatable)', (t) => {
  const scriptPath = '/home/hamr/PycharmProjects/bareloop-close/scripts/fixture-closedir-close.mjs';
  const source = `import { JUDGED_MARKER } from '../src/kinds.js';

const dir = process.env.BARELOOP_CLOSE_DIR;
console.log(\`FIXTURE closedir=\${dir ? 'set' : 'unset'} \${JUDGED_MARKER}\`);
process.exit(dir ? 0 : 97);
`;
  const sha256 = hashCloseScriptBytes(source);
  const job = {
    ...clone(JOB),
    job: 'fixture-closedir-job',
    close: [{ name: 'suite-green', cmd: `node ${scriptPath} suite-green`, expect: 0, sha256 }],
  };
  const bridge = bridgeFor(job);
  const registryDir = makeRegistry(t, bridge);
  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture-closedir.bareloop');
  const r = exportBundle({ spec: job, closeScripts: { [scriptPath]: source }, registryDir, outDir, bareloopVersion: '0.99.0' });
  assert.equal(r.ok, true, `export must succeed: ${JSON.stringify(r.reds)}`);
  assert.deepEqual(r.reds, []);
  assert.ok(existsSync(join(outDir, 'close', 'fixture-closedir-close.mjs')));
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

/** PRD item 27/M2: re-sign every close stage's sha256 against `script` — these
 * fixtures deliberately swap the SCRIPT content while keeping the same spec,
 * to isolate ONE red (an import shape) at a time; without this, the swapped
 * content would ALSO trip close-sha-mismatch and break the exact-red-count
 * assertions these tests make on purpose.
 * @param {any} job @param {string} script */
function reSignFor(job, script) {
  const sha256 = hashCloseScriptBytes(script);
  return { ...job, close: job.close.map((/** @type {any} */ s) => ({ ...s, sha256 })) };
}

test('exportBundle refuses: a close script importing something src/index.js does not export', (t) => {
  const badScript = CLOSE_SCRIPT_SOURCE.replace('JUDGED_MARKER', 'NOT_A_REAL_EXPORT');
  const job = reSignFor(clone(JOB), badScript);
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
  const job = reSignFor(clone(JOB), script);
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

// ---------------------------------------------------------------------------
// exportBundle — shape-forked bridges (the live $0 defect: `writeGreenRow`
// mints a bridge under `shapeForkName(job, closeStageNames)` whenever a run's
// close-stage set differs from the entry already sitting under the job's own
// name; `exportBundle` used to look ONLY for `bridge.name === spec.job` and
// so red `no-bridge-at-hash` even though a real green existed under the fork)
// ---------------------------------------------------------------------------

test('exportBundle: registry holds ONLY a shape-forked bridge at the current hash — succeeds, bridges/ holds the fork', (t) => {
  const { registryDir, forkName, variantHash } = mintForkFixture(t);
  const onlyForkDir = isolateBridge(t, registryDir, forkName);
  assert.equal(existsSync(join(onlyForkDir, `${JOB.job}.json`)), false, 'the base bridge must be genuinely absent here');

  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture.bareloop');
  const r = exportBundle({ spec: VARIANT_JOB, closeScripts: CLOSE_SCRIPTS, registryDir: onlyForkDir, outDir, bareloopVersion: '0.99.0' });
  assert.equal(r.ok, true, `export must find the shape-forked bridge: ${JSON.stringify(r.reds)}`);
  assert.deepEqual(r.reds, []);

  assert.ok(existsSync(join(outDir, 'bridges', `${forkName}.json`)), 'the fork must be bundled');
  const shipped = JSON.parse(readFileSync(join(outDir, 'bridges', `${forkName}.json`), 'utf8'));
  assert.equal(shipped.name, forkName);
  const hasHash = shipped.specHash === variantHash
    || (Array.isArray(shipped.versions) && shipped.versions.some((/** @type {any} */ v) => v.specHash === variantHash));
  assert.equal(hasHash, true, 'the shipped fork must actually carry the current spec hash');
  // exactly one bridge shipped — the base was never in this registry
  assert.deepEqual(readdirSync(join(outDir, 'bridges')), [`${forkName}.json`]);
});

test('exportBundle: base AND fork both present, only the fork at the current hash — succeeds, bridges/ holds BOTH', (t) => {
  const { registryDir, forkName, variantHash } = mintForkFixture(t);

  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture.bareloop');
  const r = exportBundle({ spec: VARIANT_JOB, closeScripts: CLOSE_SCRIPTS, registryDir, outDir, bareloopVersion: '0.99.0' });
  assert.equal(r.ok, true, `export must succeed: ${JSON.stringify(r.reds)}`);
  assert.deepEqual(r.reds, []);

  const shipped = readdirSync(join(outDir, 'bridges')).sort();
  assert.deepEqual(shipped, [`${JOB.job}.json`, `${forkName}.json`].sort());

  const base = JSON.parse(readFileSync(join(outDir, 'bridges', `${JOB.job}.json`), 'utf8'));
  assert.equal(base.specHash === variantHash, false, 'the base entry itself does NOT carry the current hash — only the fork does');
});

test('exportBundle refuses: fork present but at a DIFFERENT hash, base also at a different hash — no-bridge-at-hash', (t) => {
  const { registryDir } = mintForkFixture(t);

  // a spec that shares VARIANT_JOB's close shape (so it forks to the SAME derived
  // name) but has drifted since — its own hash matches neither the base bridge's
  // hash (JOB's) nor the fork's stored hash (VARIANT_JOB's)
  const drifted = clone(VARIANT_JOB);
  drifted.budgetUsd = 999;
  assert.notEqual(jobSpecHash(drifted), jobSpecHash(JOB));
  assert.notEqual(jobSpecHash(drifted), jobSpecHash(VARIANT_JOB));

  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture.bareloop');
  const r = exportBundle({ spec: drifted, closeScripts: CLOSE_SCRIPTS, registryDir, outDir, bareloopVersion: '0.99.0' });
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].code, 'no-bridge-at-hash');
  assert.equal(existsSync(outDir), false, 'a refused export writes nothing');
});

// ---------------------------------------------------------------------------
// exportBundle — package.json (frozen spec: required for `npm install
// <bundle dir>`, validation step 2). Outside bundleHash by design.
// ---------------------------------------------------------------------------

test('exportBundle writes package.json with the bareloop dependency, outside bundleHash', (t) => {
  const bridge = bridgeFor(JOB);
  const registryDir = makeRegistry(t, bridge);
  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture.bareloop');
  const r = exportBundle({ spec: JOB, closeScripts: CLOSE_SCRIPTS, registryDir, outDir, bareloopVersion: '0.99.0' });
  assert.equal(r.ok, true, `export must succeed: ${JSON.stringify(r.reds)}`);

  const pkgPath = join(outDir, 'package.json');
  assert.ok(existsSync(pkgPath));
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  assert.equal(pkg.name, 'fixture-export-job.bareloop');
  assert.equal(pkg.version, '1.0.0');
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, 'module');
  assert.deepEqual(pkg.dependencies, { bareloop: '^0.99.0' });
  assert.deepEqual(pkg.bareloop, { manifest: 'manifest.json' });

  // package.json is NEVER part of manifest.files or the bundle hash
  assert.ok(!Object.keys(r.manifest.files).includes('package.json'));

  // editing package.json after export must NOT move bundleHash
  writeFileSync(pkgPath, JSON.stringify({ ...pkg, version: '2.0.0' }, null, 2));
  assert.equal(bundleHash(outDir), r.bundleHash, 'package.json is outside the hashed set');
  const read = readBundle(outDir);
  assert.equal(read.ok, true, 'editing package.json must not trip bundle-tampered');
});

// ---------------------------------------------------------------------------
// checkBundleDeps — F128 live defect: a bundle's OWN node_modules must carry
// `bareloop` before its close scripts can `import ... from 'bareloop'`.
// ---------------------------------------------------------------------------

test('checkBundleDeps: no node_modules at all -> bundle-deps-missing with the exact cure line', (t) => {
  const dir = tmp(t, 'bareloop-deps-');
  mkdirSync(join(dir, 'close'), { recursive: true });
  const r = checkBundleDeps(dir);
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].code, 'bundle-deps-missing');
  assert.match(r.reds[0].detail, new RegExp(`cd ${dir} && npm install`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

// ---------------------------------------------------------------------------
// close-absolute-path — F129 live defect: a close script's WORKDIR baked in
// as an absolute string literal judges the ORIGINAL patient checkout no
// matter what cwd the runner passes it. Each case is proven able to fail:
// (a) is the positive, (b)-(e) each remove exactly the one thing that makes
// (a) fire, and the tail case pins the real live-defect script as a
// regression.
// ---------------------------------------------------------------------------

test('exportBundle refuses: a close script bakes in an existing absolute path literal', (t) => {
  const dir = tmp(t, 'bareloop-abspath-');
  const r = exportWithScript(t, `const WORKDIR = '${dir}';\n${CLOSE_SCRIPT_SOURCE}`);
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1);
  assert.equal(r.reds[0].code, 'close-absolute-path');
  assert.match(r.reds[0].detail, /fixture-close\.mjs/);
  assert.match(r.reds[0].detail, new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('exportBundle: same literal but the directory does not exist -> no close-absolute-path red', (t) => {
  const dir = tmp(t, 'bareloop-abspath-');
  rmSync(dir, { recursive: true, force: true }); // path never existed at all now
  const r = exportWithScript(t, `const WORKDIR = '${dir}';\n${CLOSE_SCRIPT_SOURCE}`);
  assert.equal(r.ok, true, `must succeed once the literal names nothing real: ${JSON.stringify(r.reds)}`);
});

test('exportBundle: a system-prefix literal ("/usr/bin/env") never reds', (t) => {
  const r = exportWithScript(t, `const ENV_BIN = '/usr/bin/env';\n${CLOSE_SCRIPT_SOURCE}`);
  assert.equal(r.ok, true, `must succeed: ${JSON.stringify(r.reds)}`);
  assert.deepEqual(r.reds, []);
});

test('exportBundle: a script using process.cwd() instead of a baked path never reds', (t) => {
  const r = exportWithScript(t, `const WORKDIR = process.cwd();\n${CLOSE_SCRIPT_SOURCE}`);
  assert.equal(r.ok, true, `must succeed: ${JSON.stringify(r.reds)}`);
  assert.deepEqual(r.reds, []);
});

test('exportBundle: an existing absolute path named only inside a comment never reds', (t) => {
  const dir = tmp(t, 'bareloop-abspath-');
  const r = exportWithScript(t, `// see ${dir} for context\n${CLOSE_SCRIPT_SOURCE}`);
  assert.equal(r.ok, true, `a comment carries no quote characters, so it must not trip the scan: ${JSON.stringify(r.reds)}`);
  assert.deepEqual(r.reds, []);
});

test('exportBundle: the REAL scripts/u-spawner-close.mjs exports clean (F129 fixed: WORKDIR = process.cwd())', (t) => {
  // F129's live defect was this script hardcoding an absolute WORKDIR and
  // ignoring the cwd the runner passes it (F8's return one layer up). hamr's
  // "change it" (2026-09-06) set it to `process.cwd()`. This pin now guards
  // the FIX: if anyone bakes an absolute path back into the script, export
  // must red it again. The other close scripts are outside this pin until
  // they are fixed the same way.
  const script = readFileSync(join(REPO_ROOT, 'scripts', 'u-spawner-close.mjs'), 'utf8');
  const r = exportWithScript(t, script);
  assert.equal(r.reds.some((x) => x.code === 'close-absolute-path'), false, `the fixed script must not red close-absolute-path: ${JSON.stringify(r.reds)}`);
  assert.equal(r.ok, true, JSON.stringify(r.reds));
});

test('checkBundleDeps: a node_modules/bareloop symlink to this repo root -> ok', (t) => {
  const dir = tmp(t, 'bareloop-deps-');
  mkdirSync(join(dir, 'close'), { recursive: true });
  mkdirSync(join(dir, 'node_modules'), { recursive: true });
  symlinkSync(REPO_ROOT, join(dir, 'node_modules', 'bareloop'), 'dir');
  const r = checkBundleDeps(dir);
  assert.equal(r.ok, true, `expected ok, got: ${JSON.stringify(r.reds)}`);
  assert.deepEqual(r.reds, []);
});

// ---------------------------------------------------------------------------
// F132 — a real paid fire (mtqwmb9l -> export -> mtqwydl4) refused an
// exported bundle as `close-tampered` at $0: the import rewrite
// (`../src/kinds.js` -> `'bareloop'`) changes the close script's bytes, the
// manifest hash covers those RELOCATED bytes, but `spec.json`'s own
// `close[].sha256` was left carrying the SOURCE spec's signature — two
// signatures over two different byte strings. `exportBundle` now re-signs
// `close[].sha256` over the bytes it actually packs, so the two agree by
// construction. JOB's own fixture script already imports `../src/kinds.js`
// (the exact real-world shape), so its export always exercises the rewrite —
// no separate fixture needed for the positive case.
// ---------------------------------------------------------------------------

test('exportBundle re-signs close[].sha256 over the RELOCATED bytes (F132): the bundle signs itself clean', (t) => {
  const bridge = bridgeFor(JOB);
  const registryDir = makeRegistry(t, bridge);
  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture.bareloop');
  const r = exportBundle({ spec: JOB, closeScripts: CLOSE_SCRIPTS, registryDir, outDir, bareloopVersion: '0.99.0' });
  assert.equal(r.ok, true, `export must succeed: ${JSON.stringify(r.reds)}`);

  // the written spec's signature must NOT be the source spec's (the import
  // rewrite changed the bytes) — this is the live defect's own root cause,
  // pinned directly: a spec that still carries CLOSE_SCRIPT_SHA256 here is
  // exactly the pre-fix bug.
  const specOut = JSON.parse(readFileSync(join(outDir, 'spec.json'), 'utf8'));
  assert.notEqual(specOut.close[0].sha256, CLOSE_SCRIPT_SHA256, 're-signed hash must differ from the SOURCE (pre-rewrite) signature');
  assert.equal(specOut.close[0].sha256, specOut.close[1].sha256, 'both stages still share the one relocated script, so one signature');

  // the run-start integrity check `checkCloseByteSignature` — the same one
  // `checkCloseAbsolutePaths`/precheck runs — must read the resolved bundle
  // as clean, exactly like a real `bareloop run` would at $0 before any
  // provider call.
  const resolved = resolveBundleSpec(readBundle(outDir), outDir);
  const sig = checkCloseByteSignature(resolved.spec, outDir);
  assert.equal(sig.ok, true, `bundle must sign clean: ${JSON.stringify(sig)}`);
});

test('exportBundle F132 mutation proof: the SOURCE (pre-rewrite) signature reds close-tampered against the relocated bundle', (t) => {
  const bridge = bridgeFor(JOB);
  const registryDir = makeRegistry(t, bridge);
  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture.bareloop');
  exportBundle({ spec: JOB, closeScripts: CLOSE_SCRIPTS, registryDir, outDir, bareloopVersion: '0.99.0' });

  // Simulate the pre-fix bundle: force spec.json's close[].sha256 back to the
  // SOURCE spec's own (pre-rewrite) signature, byte-identical to what
  // `exportBundle` wrote before this fix. This is the exact live-defect
  // shape (run mtqwydl4) reconstructed from the real fixture, never a
  // synthetic mismatch invented for the test.
  const specPath = join(outDir, 'spec.json');
  const preFixSpec = JSON.parse(readFileSync(specPath, 'utf8'));
  preFixSpec.close = preFixSpec.close.map((/** @type {any} */ s) => ({ ...s, sha256: CLOSE_SCRIPT_SHA256 }));

  const sig = checkCloseByteSignature(preFixSpec, outDir);
  assert.equal(sig.ok, false, 'the pre-fix (source-signed) spec must read the relocated bytes as tampered — proves the checker is sensitive to exactly this defect');
  assert.ok(sig.reds.every((/** @type {any} */ r) => r.expected === CLOSE_SCRIPT_SHA256));
});

test('exportBundle F132: re-signed sha256 EQUALS the source signature when the rewrite changes nothing', (t) => {
  // a close script with no `../src/…` (or `bareloop`) import at all — the
  // import rewrite has nothing to change, so the relocated bytes are
  // byte-identical to the source and the re-signed hash must equal the
  // original.
  const scriptPath = '/home/hamr/PycharmProjects/bareloop-close/scripts/fixture-norewrite-close.mjs';
  const source = `const stage = process.argv[2];\nconsole.log(\`FIXTURE \${stage}\`);\nprocess.exit(0);\n`;
  const sha256 = hashCloseScriptBytes(source);
  const job = { ...clone(JOB), job: 'fixture-norewrite-job', close: [{ name: 'suite-green', cmd: `node ${scriptPath} suite-green`, expect: 0, sha256 }] };
  const bridge = bridgeFor(job);
  const registryDir = makeRegistry(t, bridge);
  const outDir = join(tmp(t, 'bareloop-out-'), 'fixture-norewrite.bareloop');
  const r = exportBundle({ spec: job, closeScripts: { [scriptPath]: source }, registryDir, outDir, bareloopVersion: '0.99.0' });
  assert.equal(r.ok, true, `export must succeed: ${JSON.stringify(r.reds)}`);
  const specOut = JSON.parse(readFileSync(join(outDir, 'spec.json'), 'utf8'));
  assert.equal(specOut.close[0].sha256, sha256, 'no rewrite happened, so the re-signed hash must equal the source signature');
});
