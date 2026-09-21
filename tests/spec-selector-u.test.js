// F185 — an interview-authored repo job could not be RUN by a person: there was no
// code path from a freshly authored `resolved-spec.json` into `scripts/run-u.mjs`,
// only a developer hand-step (copy the spec into `jobs/` + hand-add a JOBS row).
//
// hamr's ruling (2026-09-16, option A): `--spec <path to resolved-spec.json>` is an
// alternative to `--job <key>` that reads the prepared copy's OWN source manifest
// (`readSourceManifest`, src/source.js — the same one `run-author.mjs` and the
// in-run destination read already use) for the workdir and the seed, so nothing has
// to be typed, copied, or hand-added.
//
// Driven through the REAL script's PREVIEW path (no `--approve`, so nothing reads a
// key and nothing spends) — the same instrument tests/hitl-u.test.js,
// tests/run-u-key-hint.test.js and tests/reviewdoor-u.test.js already use for
// run-u.mjs — plus one case that DOES pass `--approve` with a wrong hash, to prove
// the signature gate is not bypassed on this new path.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { jobSpecHash } from '../src/job.js';

const RUNNER = new URL('../scripts/run-u.mjs', import.meta.url).pathname;
const REAL_SPEC = JSON.parse(readFileSync(new URL('../jobs/pulselog-u-types.json', import.meta.url), 'utf8'));

const base = mkdtempSync(join(tmpdir(), 'spec-selector-u-'));
process.on('exit', () => rmSync(base, { recursive: true, force: true }));
let n = 0;

/** a full, real, validateJob-clean spec (a copy of a shipped one, renamed) —
 * never a hand-trimmed fixture that might pass only because it is too small
 * to exercise the real validator. */
const validSpec = (job) => ({ ...REAL_SPEC, job });

/**
 * Builds one job's worth of fixture directory:
 *   <dir>/resolved-spec.json         — the spec (job.job renamed to `job`)
 *   <dir>/source-<x>/source.json     — the manifest, `{seed}` at minimum
 *   <dir>/source-<x>/tree/.git       — stands in for the prepared copy's git tree
 * (the preview path never runs git — it only checks the tree/.git PATH exists)
 * @param {{job?: string, spec?: object, seed?: string|null, noSourceDir?: boolean,
 *   noTree?: boolean, extraSourceDirs?: number, manifest?: object}} [opts]
 */
function buildFixture(opts = {}) {
  n += 1;
  const dir = join(base, `job-${n}`);
  mkdirSync(dir, { recursive: true });
  const job = opts.job ?? `spec-select-${n}`;
  const spec = opts.spec ?? validSpec(job);
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const seed = opts.seed === undefined ? '1111111111111111111111111111111111111111' : opts.seed;
  const sourceDirs = [];
  const makeOne = (suffix) => {
    const into = join(dir, `source-${suffix}`);
    mkdirSync(into, { recursive: true });
    const manifest = opts.manifest ?? (seed === null ? {} : { kind: 'folder', source: '/dev/null', seed });
    writeFileSync(join(into, 'source.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    if (!opts.noTree) mkdirSync(join(into, 'tree', '.git'), { recursive: true });
    sourceDirs.push(into);
    return into;
  };
  if (!opts.noSourceDir) {
    const into = makeOne('main');
    for (let i = 0; i < (opts.extraSourceDirs ?? 0); i += 1) makeOne(`extra${i}`);
    return { dir, specPath, spec, into, tree: join(into, 'tree') };
  }
  return { dir, specPath, spec, into: null, tree: null };
}

const preview = (args) => {
  const r = spawnSync(process.execPath, [RUNNER, ...args], {
    encoding: 'utf8', timeout: 60_000, env: { ...process.env, ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '' },
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status === null) throw new Error(`run-u.mjs never exited (${r.error?.code ?? r.signal ?? 'no error'}):\n${out.slice(0, 400)}`);
  return { code: r.status, out };
};

test('--spec resolves the workdir and seed from the prepared copy\'s OWN source manifest', () => {
  const f = buildFixture({ seed: 'abc123def4567890abc123def4567890abc123d' });
  const { code, out } = preview(['--spec', f.specPath]);
  assert.equal(code, 0, out);
  assert.match(out, new RegExp(`patient\\s+${f.tree.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} @ abc123def456`), 'the printed patient line must carry the manifest tree and seed, never a guessed one');
  assert.match(out, new RegExp(`spec\\s+${f.specPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), 'the printed spec line must name the --spec path itself, not a jobs/ file');
});

test('--spec and --job together is a loud refusal', () => {
  const f = buildFixture();
  const { code, out } = preview(['--spec', f.specPath, '--job', 'aurora-spawner']);
  assert.equal(code, 2, out);
  assert.match(out, /--job aurora-spawner and --spec .* name a job two different ways — give one/);
});

test('neither --spec nor --job is a loud refusal', () => {
  const { code, out } = preview([]);
  assert.equal(code, 2, out);
  assert.match(out, /give one of --job .* or --spec/);
});

test('--spec pointing at a file that does not exist refuses at $0, naming why', () => {
  const missing = join(base, 'nope', 'resolved-spec.json');
  const { code, out } = preview(['--spec', missing]);
  assert.equal(code, 2, out);
  assert.match(out, /does not exist/);
});

test('--spec pointing at unparseable JSON refuses, naming why', () => {
  n += 1;
  const dir = join(base, `bad-json-${n}`);
  mkdirSync(dir, { recursive: true });
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, '{ not json');
  const { code, out } = preview(['--spec', specPath]);
  assert.equal(code, 2, out);
  assert.match(out, /is not readable JSON/);
});

test('--spec whose spec fails validateJob refuses, naming the reds', () => {
  // missing `schema`, `description`, `provider`, `cadence` etc. — a real
  // validateJob red, not a hand-invented error string
  const f = buildFixture({ spec: { job: 'broken-job', budgetUsd: 1 } });
  const { code, out } = preview(['--spec', f.specPath]);
  assert.equal(code, 2, out);
  assert.match(out, /fails validateJob/);
  assert.match(out, /missing-required at schema/);
});

test('--spec with no source-*/ sibling refuses at $0 — never invents a workdir', () => {
  const f = buildFixture({ noSourceDir: true });
  const { code, out } = preview(['--spec', f.specPath]);
  assert.equal(code, 2, out);
  assert.match(out, /no prepared copy beside it/);
});

test('--spec with more than one source-*/ sibling refuses rather than guessing', () => {
  const f = buildFixture({ extraSourceDirs: 1 });
  const { code, out } = preview(['--spec', f.specPath]);
  assert.equal(code, 2, out);
  assert.match(out, /prepared copies sit beside it/);
});

test('--spec whose manifest carries no seed refuses, naming why', () => {
  const f = buildFixture({ manifest: { kind: 'folder', source: '/dev/null' } });
  const { code, out } = preview(['--spec', f.specPath]);
  assert.equal(code, 2, out);
  assert.match(out, /carries no seed commit/);
});

test('--spec whose prepared tree is gone refuses, naming why', () => {
  const f = buildFixture({ noTree: true });
  const { code, out } = preview(['--spec', f.specPath]);
  assert.equal(code, 2, out);
  assert.match(out, /tree is gone/);
});

// ══ THE ONE THAT MATTERS MOST: the --approve signature gate is NOT bypassed ══
test('--spec run still refuses a WRONG --approve hash — the signature gate governs this path exactly as it always has', () => {
  const f = buildFixture();
  const { code, out } = preview(['--spec', f.specPath, '--approve', 'not-the-real-hash']);
  assert.equal(code, 1, out);
  assert.match(out, /REFUSED: --approve not-the-real-hash does not match this spec version/);
});

test('--spec run still refuses an ABSENT --approve (prints preview, exits 0, never runs)', () => {
  const f = buildFixture();
  const { code, out } = preview(['--spec', f.specPath]);
  assert.equal(code, 0, out);
  assert.doesNotMatch(out, /REFUSED: --approve/);
});

test('the REAL hash for a --spec run is jobSpecHash of the spec on disk — the signature is over the same bytes as --job', () => {
  const f = buildFixture();
  const hash = jobSpecHash(f.spec);
  const { out } = preview(['--spec', f.specPath]);
  assert.match(out, new RegExp(`hash\\s+${hash}`));
});
