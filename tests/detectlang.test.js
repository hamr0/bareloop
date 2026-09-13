// LANGUAGE DETECTION (PRD item 33/M3, ruling 3 — `docs/product/ITEM33-BUILD.md`,
// "Five detection points") — `src/detectlang.js`'s `detectLanguage`, and its
// wiring into `scripts/run-interview.mjs`/`scripts/run-author.mjs`, which no
// longer accept `--lang` at all.
//
// Real temp directories under `os.tmpdir()`, never a mocked `fs` — the walk
// itself (nearest-wins, the repo-root stop) is the thing under test, and a
// mocked filesystem would prove nothing about it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { detectLanguage } from '../src/detectlang.js';
import { assembleSpec, prepareSigning, GENRE } from '../src/authorjob.js';
import { classGuards } from '../src/authoring.js';
import { classifyIncidents } from '../src/ledger.js';

const RUN_INTERVIEW = new URL('../scripts/run-interview.mjs', import.meta.url).pathname;
const RUN_AUTHOR = new URL('../scripts/run-author.mjs', import.meta.url).pathname;

// ── fixtures ─────────────────────────────────────────────────────────────────

const base = mkdtempSync(join(tmpdir(), 'bareloop-detectlang-'));
process.on('exit', () => rmSync(base, { recursive: true, force: true }));
let n = 0;
const freshDir = () => { const d = join(base, `d-${n += 1}`); mkdirSync(d, { recursive: true }); return d; };

/** @param {string} dir @param {Record<string,string>} files */
function write(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
}

const git = (dir, args) => execFileSync('git', args, {
  cwd: dir,
  encoding: 'utf8',
  env: {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 'dl-test', GIT_AUTHOR_EMAIL: 'dl@test',
    GIT_COMMITTER_NAME: 'dl-test', GIT_COMMITTER_EMAIL: 'dl@test',
  },
});

/** a real git repo, one commit, `files` on disk at the seed */
function makeLangRepo(t, files) {
  const dir = freshDir();
  write(dir, files);
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, seed: git(dir, ['rev-parse', 'HEAD']).trim() };
}

// ── 1. nearest wins ────────────────────────────────────────────────────────

test('nearest wins: a subfolder\'s own manifest beats a differing manifest in its parent', () => {
  // a repo boundary above BOTH levels, so the walk actually visits more than
  // one directory — without a `.git` anywhere the walk never leaves `inner`
  // (spec rule: no repo root found stops the walk at the Source folder
  // itself), which would make this assertion pass for the wrong reason.
  const root = freshDir();
  mkdirSync(join(root, '.git'), { recursive: true });
  write(root, { 'pyproject.toml': '[project]\nname = "outer"\n' });
  const inner = join(root, 'inner');
  write(inner, { 'package.json': '{}' });
  const r = detectLanguage(inner);
  assert.equal(r.kind, 'resolved');
  assert.equal(r.lang, 'js');
  assert.equal(r.dir, inner);
});

// ── 2. the walk stops at the repo root ────────────────────────────────────────

test('the walk stops at the repo root (.git) — a manifest further up outside the repo is never read', () => {
  const outer = freshDir();
  // a manifest that would be found if the walk did NOT stop at .git — this is
  // the false positive a broken walk would produce
  write(outer, { 'package.json': '{}' });
  const repo = join(outer, 'repo');
  mkdirSync(join(repo, '.git'), { recursive: true }); // a repo root, deliberately with NO manifest of its own
  const sub = join(repo, 'sub');
  mkdirSync(sub, { recursive: true });
  const r = detectLanguage(sub);
  assert.equal(r.kind, 'no-code-job', `the walk read past the repo root and found the outer package.json: ${JSON.stringify(r)}`);
});

// ── 3. each supported manifest resolves ───────────────────────────────────────

for (const [file, body, lang] of [
  ['package.json', '{}', 'js'],
  ['pyproject.toml', '[project]\nname = "x"\n', 'python'],
  ['setup.py', 'from setuptools import setup\nsetup(name="x")\n', 'python'],
]) {
  test(`${file} resolves to "${lang}"`, () => {
    const dir = freshDir();
    write(dir, { [file]: body });
    const r = detectLanguage(dir);
    assert.equal(r.kind, 'resolved');
    assert.equal(r.lang, lang);
    assert.equal(r.manifest, file);
  });
}

// ── 4. each unsupported manifest names a distinct stop, recorded as admission
//      evidence the same way `src/authorjob.js`'s own refusals are ────────────

for (const [file, body, language] of [
  ['go.mod', 'module x\n', 'go'],
  ['Cargo.toml', '[package]\nname = "x"\n', 'rust'],
  ['pom.xml', '<project></project>\n', 'java'],
  ['build.gradle', '', 'java'],
  ['build.gradle.kts', '', 'java'],
  ['x.csproj', '<Project></Project>\n', 'csharp'],
  ['x.sln', '', 'csharp'],
  ['composer.json', '{}', 'php'],
]) {
  test(`${file} is a KNOWN, UNSUPPORTED manifest — a named stop naming "${language}", never a silent js fallback`, () => {
    const dir = freshDir();
    write(dir, { [file]: body });
    const r = detectLanguage(dir);
    assert.equal(r.kind, 'language-unsupported');
    assert.equal(r.language, language);
    assert.notEqual(language, 'js', 'the whole point of this test is that it is NOT js');

    // recorded as ADMISSION EVIDENCE, the same shape `src/authorjob.js`'s own
    // refusals use — not merely a return value a caller might ignore.
    assert.ok(r.refusal, 'a named stop with no refusal object is nothing a caller can record');
    assert.equal(r.refusal.kind, 'request-red');
    assert.equal(r.refusal.verb, 'language-unsupported');
    assert.ok(r.refusal.detail.includes(language), r.refusal.detail);
    assert.ok(r.refusal.red, 'the red half — what a spine actually records — must be present');
    assert.equal(r.refusal.red.code, 'request-red');
    assert.equal(r.refusal.red.lib, 'bareloop', 'the SAME REFUSAL_LIB every other bareloop refusal stamps');
    assert.equal(r.refusal.red.verb, 'language-unsupported');
    assert.ok(Array.isArray(r.refusal.options) && r.refusal.options.length > 0);
  });
}

// ── 5. no manifest anywhere → "no-code-job", NOT an error (M3 ruling 7) ───────

test('no manifest anywhere in the walk is "no-code-job" — a normal outcome, not a refusal', () => {
  const dir = freshDir();
  const r = detectLanguage(dir);
  assert.equal(r.kind, 'no-code-job');
  // distinguishable from BOTH the resolved and refused shapes — a caller
  // switching on `kind` cannot mistake this for either
  assert.ok(!('refusal' in r));
  assert.ok(!('lang' in r));
});

test('an unreadable/empty leaf folder under a real repo is also "no-code-job"', (t) => {
  const { dir } = makeLangRepo(t, { 'README.md': 'nothing here\n' });
  const r = detectLanguage(dir);
  assert.equal(r.kind, 'no-code-job');
});

// ── 6. ambiguous: two different supported languages at the same level ────────

test('ambiguous: two different manifests at the SAME nearest level name both candidates, never guesses one', () => {
  const dir = freshDir();
  write(dir, { 'package.json': '{}', 'pyproject.toml': '[project]\nname="x"\n' });
  const r = detectLanguage(dir);
  assert.equal(r.kind, 'ambiguous');
  assert.deepEqual(r.candidates.sort(), ['js', 'python']);
});

// ── 7. a file Source resolves from its PARENT folder ──────────────────────────

test('a Source that is a FILE detects from its parent folder', () => {
  const dir = freshDir();
  write(dir, { 'package.json': '{}', 'index.js': '' });
  const r = detectLanguage(join(dir, 'index.js'));
  assert.equal(r.kind, 'resolved');
  assert.equal(r.lang, 'js');
});

// ── 8. --lang is REFUSED, loud, by both scripts ───────────────────────────────

for (const [name, script, extraArgs] of [
  ['run-interview.mjs', RUN_INTERVIEW, ['--verdict', 'green', '--provider', 'anthropic-api', '--out', join(base, 'out-ri-lang')]],
  ['run-author.mjs', RUN_AUTHOR, ['--answers', join(base, 'answers-missing.json'), '--draft', join(base, 'draft-missing.json'), '--verdict', 'green', '--out', join(base, 'out-ra-lang')]],
]) {
  test(`${name} refuses --lang — the flag is gone, never silently ignored`, () => {
    const patient = freshDir();
    write(patient, { 'package.json': '{}' });
    const r = spawnSync(process.execPath, [script, '--patient', patient, ...extraArgs, '--lang', 'js'], {
      encoding: 'utf8', timeout: 30_000, input: '',
    });
    assert.notEqual(r.status, 0, `${name} --lang exit: ${JSON.stringify({ code: r.status, out: r.stdout, err: r.stderr })}`);
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    assert.match(out, /--lang/, `${name} must name the flag in its refusal, not a generic error`);
    assert.match(out, /auto-detect|no longer a flag/i, `${name} must say WHY, not just refuse silently`);
  });
}

// ── 9. E2E: both scripts resolve language from --patient with NO --lang ──────

test('run-interview.mjs reaches the interview from --patient alone — no --lang needed (E2E)', () => {
  const patient = freshDir();
  write(patient, { 'package.json': '{}' });
  const out = join(base, 'out-ri-e2e');
  const r = spawnSync(process.execPath, [
    RUN_INTERVIEW, '--patient', patient, '--verdict', 'green', '--provider', 'anthropic-api', '--out', out,
  ], {
    encoding: 'utf8', timeout: 30_000, input: '\n', // end input immediately — proves it got PAST arg parsing into the interview
    env: { ...process.env, ANTHROPIC_API_KEY: '' },
  });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  // it must have printed the detected language before stdin ran out — proof
  // language resolution happened without --lang ever being supplied
  const m = /lang\s+js/.exec(text);
  assert.ok(m, text);
  assert.ok(!/--lang/.test(text.slice(0, m.index)), 'no --lang usage text should have been needed to get this far');
});

// ── 11. the language-unsupported stop is COUNTED DEMAND, not a silent exit ───

test('run-author.mjs on a language-unsupported patient records job-red/request-red in its own spine (counted admission demand, item 34 M3 loose end fix)', () => {
  const patient = freshDir();
  write(patient, { 'go.mod': 'module x\n' });
  const out = join(base, 'out-ra-lang-red');
  const r = spawnSync(process.execPath, [
    RUN_AUTHOR, '--patient', patient,
    '--answers', join(base, 'answers-never-read.json'),
    '--draft', join(base, 'draft-never-read.json'),
    '--verdict', 'green', '--out', out,
  ], { encoding: 'utf8', timeout: 30_000 });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  assert.notEqual(r.status, 0, text);
  assert.match(text, /language-unsupported/, text);

  const spineFiles = readdirSync(out).filter((f) => f.startsWith('author-') && f.endsWith('.jsonl'));
  assert.equal(spineFiles.length, 1, `expected exactly one spine file written to ${out}: ${JSON.stringify(spineFiles)}`);
  const events = readFileSync(join(out, spineFiles[0]), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

  const jobRed = events.find((e) => e.type === 'job-red' && e.code === 'request-red');
  assert.ok(jobRed, `no job-red/request-red event found in the spine: ${JSON.stringify(events)}`);
  assert.equal(jobRed.verb, 'language-unsupported');
  assert.equal(jobRed.lib, 'bareloop', 'the SAME REFUSAL_LIB every other bareloop-catalogue refusal stamps');

  // nothing paid ran before the stop — no provider was ever built or called
  assert.ok(!events.some((e) => e.type === 'author-start'), 'author-start must not appear — the run stopped before the provider was constructed');
  assert.ok(!events.some((e) => e.type === 'author-cost'), 'no metered call may have happened before this refusal');

  // and the ledger counts it as admission demand, the same channel every other
  // refusal in this pipeline is counted through (src/ledger.js classifyIncidents)
  const occs = classifyIncidents(events, { spine: spineFiles[0] });
  const admitted = occs.find((o) => o.class === 'request-red' && o.lib === 'bareloop' && o.verb === 'language-unsupported');
  assert.ok(admitted, `classifyIncidents did not count the language-unsupported stop as demand: ${JSON.stringify(occs)}`);
});

test('run-author.mjs reaches the API-key check from --patient alone — no --lang needed (E2E)', () => {
  const patient = freshDir();
  write(patient, { 'package.json': '{}' });
  const answers = join(base, 'answers-e2e.json');
  const draft = join(base, 'draft-e2e.json');
  writeFileSync(answers, JSON.stringify({ 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e' }));
  writeFileSync(draft, JSON.stringify({
    schema: 'job-v1', job: 'e2e-job', description: 'e2e', provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 }, budgetUsd: 1, writeScope: ['src/**'], goal: 'g',
    tools: ['read'], escalation: { mode: 'decision-ready' },
  }));
  const out = join(base, 'out-ra-e2e');
  const r = spawnSync(process.execPath, [
    RUN_AUTHOR, '--patient', patient, '--answers', answers, '--draft', draft,
    '--verdict', 'green', '--out', out,
  ], {
    encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, ANTHROPIC_API_KEY: '' },
  });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  // dies at the (pre-existing) missing-key check — proof it got THAT far,
  // meaning language resolution from --patient succeeded without --lang
  assert.notEqual(r.status, 0);
  assert.match(text, /ANTHROPIC_API_KEY not set/, text);
  assert.ok(!/--lang was given|is no longer a flag/.test(text), 'must not have died on the --lang path');
});

// ── 10. the wrong-language checker breaks at the SEED READ (existing mechanism,
//       `src/authorjob.js`'s `prepareSigning`, the precheck gate around its
//       `instrument-stop` → `broken-close` handling) ─────────────────────────

const SPEC_DRAFT = {
  schema: 'job-v1',
  job: 'wrong-lang-patient',
  description: 'a js-genre close signed against a python-only repository',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  goal: 'the type checker stops complaining.',
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
};

const fillGuard = (g, allowPrefixes) => ({
  name: g.name, kind: g.kind, params: { ...g.params, ...(g.fill.includes('allowPrefixes') ? { allowPrefixes } : {}) },
});

test('a JS-genre checker validated against a Python-only repo REDS at the seed read (broken-close, not a false green)', async (t) => {
  const { dir, seed } = makeLangRepo(t, {
    'pyproject.toml': '[project]\nname = "x"\n',
    'src/mod.py': 'def f():\n    return 1\n',
  });
  const jsGuards = classGuards({ verdictType: 'green', lang: 'js' }).map((g) => fillGuard(g, ['src/']));
  // the js genre's own checker, resolved "through the project's own package
  // runner" (TYPES_GENRE_TEMPLATE rule 2, `src/authoring.js`) — a real js repo
  // would have this at `node_modules/.bin/tsc`; this python-only one does not,
  // so the checker binary itself cannot be found. That is exactly what "the
  // seed read breaks a wrong-language checker" (ITEM33-BUILD.md, M3 ruling 3,
  // detection point 5) means in practice: no special code runs the mismatch
  // down — the real tool the wrong genre declared simply is not there.
  const tsc = 'node_modules/.bin/tsc'; // relative — an absolute path is refused earlier, at the declaration gate
  const spec = assembleSpec(SPEC_DRAFT, {
    closeDecl: {
      genre: GENRE,
      lang: 'js',
      stages: [jsGuards[0], { name: 'verdict', kind: 'command-exit', params: { cmd: tsc, args: ['--noEmit'], expectExit: 0 } }, jsGuards[1]],
    },
    verdictType: 'green',
  });
  const r = await prepareSigning({ spec, workdir: dir, seedRef: seed, timeoutMs: 30_000 });

  assert.equal(r.ok, false);
  assert.equal(r.gates.precheck.ok, false, JSON.stringify(r.gates.precheck));
  assert.deepEqual(r.gates.precheck.stops.map((s) => s.stage), ['verdict']);
  assert.ok(r.reds.some((x) => x.code === 'broken-close'), JSON.stringify(r.reds));
  assert.equal(r.refusal.kind, 'decision-ready');
  assert.match(r.refusal.detail, /cannot run/);
  // never a false green: the mismatch is a CASUALTY, not a passing checker
  // that simply found nothing to complain about in a repo with no .ts files
  assert.notEqual(r.gates.seedVerdict?.ok, true);
});
