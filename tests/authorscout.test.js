// THE LOOKING HALF (M3a, close-authoring gate 4) — the authoring scout and the
// mechanical seed listing.
//
// What is under test is not "does a survey come back". It is the four things
// D11 and gate-2's addendum 5 paid for:
//
//   - the grant is read-only BY MENU CONSTRUCTION, not by promise. The test
//     derives the expectation from the SHIPPED constants, so a verb added to
//     TOOL_MENU tomorrow is covered without anyone remembering to widen a list;
//   - F59's ABSENT-vs-empty split. `{}` must never read as "no special facts
//     are needed" — under D11 that lands in a SIGNED artefact and grades the
//     wrong checkout. Five routes in, and every one of them names itself;
//   - the reserved TOOLLESS final round. A scout that spends every round on
//     tools otherwise returns nothing at all (measured: 15 of 18 surveys);
//   - the listing is MECHANICAL and every trim is ANNOUNCED (F28), and the
//     validator's copy is the WHOLE tree while the prompt's copy is scoped —
//     handing the validator the scoped subset would silently switch off M2's
//     one-population law (a job scoped to src/ would read as whole-tree).
//
// The listing runs against REAL temp git repos with real commits: `git ls-tree`
// at a seed is exactly the instrument whose behaviour is being relied on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TOOL_MENU, WRITE_VERBS, STORE_VERBS } from '../src/job.js';
import {
  AUTHOR_SCOUT_VERBS, AUTHOR_SCOUT_ROUNDS, AUTHOR_SCOUT_MIN_BYTES, AUTHOR_SCOUT_BLOB_MAX,
  SCOUT_RECOVERY_PROMPT, scoutPrompt, classifySurvey, runAuthorScout, defaultSurveyor,
  seedFileList, buildSeedListing, LIST_CAP, LISTING_BYTE_CAP, cleanEntry,
} from '../src/authorscout.js';
import { TOOL_BY_VERB } from '../src/tools.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// ── fixtures ─────────────────────────────────────────────────────────────────

/** @param {string} dir @param {string[]} args */
const git = (dir, args) => execFileSync('git', args, {
  cwd: dir,
  encoding: 'utf8',
  env: {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 'scout-test', GIT_AUTHOR_EMAIL: 'scout@test',
    GIT_COMMITTER_NAME: 'scout-test', GIT_COMMITTER_EMAIL: 'scout@test',
  },
});

/** @param {any} t @param {Record<string,string>} files */
function makeRepo(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-scout-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, ['init', '-q', '-b', 'main']);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return { dir, seed: git(dir, ['rev-parse', 'HEAD']).trim() };
}

/**
 * A scripted loop factory. One entry per Loop the scout creates, in order —
 * the SURVEY loop first, the F59 recovery loop (if any) second.
 * @param {{text?: string, turns?: number, error?: string|null, costUsd?: number|null, unpricedRounds?: number}[]} scripts
 */
function scriptLoops(scripts) {
  /** @type {any[]} */
  const created = [];
  const factory = (/** @type {any} */ { system, onLlmResult }) => {
    const spec = scripts[created.length] ?? { text: '' };
    /** @type {any} */
    const loop = {
      system, stopped: false, runs: /** @type {any[]} */ ([]),
      async run(/** @type {any} */ messages, /** @type {any} */ tools, /** @type {any} */ opts) {
        loop.runs.push({ messages, tools, opts });
        for (let i = 0; i < (spec.turns ?? 1); i += 1) {
          if (loop.stopped) break;
          if (onLlmResult) await onLlmResult({ kind: 'turn' });
        }
        return {
          text: spec.text ?? '',
          error: spec.error ?? null,
          msgs: [{ role: 'assistant', content: spec.text ?? '' }],
          metrics: {
            costUsd: 'costUsd' in spec ? spec.costUsd : 0.01,
            unpricedRounds: spec.unpricedRounds ?? 0,
          },
        };
      },
      stop() { loop.stopped = true; },
    };
    created.push(loop);
    return loop;
  };
  return { factory, created };
}

/** a surveyor stub: records the grant it was handed, and whether it was cleaned up */
function stubSurveyor() {
  /** @type {any} */
  const seen = { granted: null, cleaned: 0, workdir: null };
  const createSurveyor = async (/** @type {any} */ o) => {
    seen.granted = o.granted;
    seen.workdir = o.workdir;
    return {
      tools: [{ name: 'shell_read', execute: async () => '' }],
      policy: null, onLlmResult: null,
      cleanup: async () => { seen.cleaned += 1; },
    };
  };
  return { createSurveyor, seen };
}

const FACTS = { language: 'javascript', runner: 'node --test', sourcePaths: ['src'], testPaths: ['test'] };
const factsBlob = (/** @type {any} */ f = FACTS) => `\`\`\`json\n${JSON.stringify(f, null, 2)}\n\`\`\`\n${'x'.repeat(400)}`;

// ── 1. the grant is read-only BY CONSTRUCTION ────────────────────────────────

test('the scout grant is TOOL_MENU minus every write-class and store-class verb', () => {
  // derived from the SHIPPED constants — a verb added to TOOL_MENU is covered
  // without anyone remembering to widen a literal list here
  const expected = TOOL_MENU.filter((v) => !WRITE_VERBS.includes(v) && !STORE_VERBS.includes(v));
  assert.deepEqual([...AUTHOR_SCOUT_VERBS], expected);
  for (const v of [...WRITE_VERBS, ...STORE_VERBS]) assert.ok(!AUTHOR_SCOUT_VERBS.includes(v), `${v} must not be granted`);
  assert.ok(AUTHOR_SCOUT_VERBS.includes('read') && AUTHOR_SCOUT_VERBS.includes('grep'), 'a read-only survey still needs to read');
});

test('the scout prompt names the absolute repository root and asks for no work', () => {
  const p = scoutPrompt('/abs/patient');
  assert.match(p, /\/abs\/patient/);
  assert.match(p, /sourcePaths/);
  assert.match(p, /envNeeds/);
});

// ── 2. F59: ABSENT is a distinct state from empty ────────────────────────────

test('classifySurvey: a real survey is PRESENT and carries the parsed facts', () => {
  const blob = factsBlob();
  const r = classifySurvey(blob, { bytes: Buffer.byteLength(blob), rounds: 3, bounded: false, recovered: false, error: null });
  assert.equal(r.state, 'PRESENT');
  assert.equal(r.reason, null);
  assert.equal(r.facts.runner, 'node --test');
});

test('classifySurvey: five routes to ABSENT, each naming itself', () => {
  const at = (/** @type {string} */ blob) => classifySurvey(blob, { bytes: Buffer.byteLength(blob), rounds: 8, bounded: true, recovered: false, error: null });

  const tiny = at('{}');
  assert.equal(tiny.state, 'ABSENT');
  assert.match(tiny.reason, new RegExp(String(AUTHOR_SCOUT_MIN_BYTES)));

  const pad = 'x'.repeat(AUTHOR_SCOUT_MIN_BYTES + 50);
  const noJson = at(pad);
  assert.equal(noJson.state, 'ABSENT');

  const bad = at(`\`\`\`json\n{not json\n\`\`\`\n${pad}`);
  assert.equal(bad.state, 'ABSENT');
  assert.match(bad.reason, /did not parse as JSON/);

  const arr = at(`\`\`\`json\n[1,2,3]\n\`\`\`\n${pad}`);
  assert.equal(arr.state, 'ABSENT');
  assert.match(arr.reason, /non-object/);

  // THE point of the finding: an empty object is the scout FAILING, never
  // "no special facts are needed"
  const empty = at(`\`\`\`json\n{}\n\`\`\`\n${pad}`);
  assert.equal(empty.state, 'ABSENT');
  assert.match(empty.reason, /EMPTY object/);
  assert.equal(empty.facts, null);
});

// ── 3. the scout run: bound, reserved round, caps, cost, cleanup ─────────────

test('runAuthorScout: the round bound stops the loop at SCOUT_ROUNDS', async () => {
  const { factory, created } = scriptLoops([{ text: factsBlob(), turns: AUTHOR_SCOUT_ROUNDS + 5 }]);
  const { createSurveyor, seen } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  assert.equal(created[0].stopped, true, 'the loop must be stopped at the bound');
  assert.equal(r.meta.rounds, AUTHOR_SCOUT_ROUNDS, 'no round beyond the bound is metered');
  assert.equal(r.meta.bounded, true);
  assert.deepEqual(seen.granted, [...AUTHOR_SCOUT_VERBS]);
  assert.equal(seen.cleaned, 1, 'the surveyor is always cleaned up');
});

test('runAuthorScout: a survey that finishes on its own is not bounded and gets no recovery round', async () => {
  const { factory, created } = scriptLoops([{ text: factsBlob(), turns: 2 }]);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  assert.equal(r.state, 'PRESENT');
  assert.equal(r.meta.bounded, false);
  assert.equal(r.meta.recovered, false);
  assert.equal(created.length, 1, 'no second loop when the survey came back whole');
});

test('runAuthorScout: F59 — a bounded, empty survey gets ONE reserved TOOLLESS round', async () => {
  const { factory, created } = scriptLoops([
    { text: '', turns: AUTHOR_SCOUT_ROUNDS + 2 },
    { text: factsBlob(), turns: 1 },
  ]);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  assert.equal(created.length, 2, 'the recovery loop must exist');
  assert.deepEqual(created[1].runs[0].tools, [], 'the recovery round is TOOLLESS by construction, never by request');
  assert.equal(r.meta.recovered, true);
  assert.equal(r.state, 'PRESENT');
  assert.equal(r.facts.runner, 'node --test');
});

test('runAuthorScout: a survey that ended SHORT but was never cut off gets no recovery round', async () => {
  // F59's reserved round is sized for ONE population — a scout that spent every
  // round on tools and never got to write. A scout that finished on its own with
  // little to say is a different fact, and paying for a second call on it would
  // be treating "nothing to report" as "was interrupted"
  const { factory, created } = scriptLoops([{ text: 'tiny', turns: 1 }, { text: factsBlob(), turns: 1 }]);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  assert.equal(created.length, 1, 'an unbounded survey is never recovered');
  assert.equal(r.state, 'ABSENT');
  assert.equal(r.meta.recovered, false);
});

test('runAuthorScout: a recovery that comes back SMALLER is discarded, not adopted', async () => {
  const { factory, created } = scriptLoops([
    { text: 'a'.repeat(120), turns: AUTHOR_SCOUT_ROUNDS + 2 },
    { text: 'b', turns: 1 },
  ]);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  assert.equal(created.length, 2, 'the recovery round fires — bounded and short');
  assert.equal(r.meta.recovered, false);
  assert.equal(r.raw, 'a'.repeat(120), 'the larger survey survives; a worse second answer never overwrites it');
});

test('runAuthorScout: the recovery round only replaces a SMALLER survey', async () => {
  const good = factsBlob();
  const { factory, created } = scriptLoops([
    { text: good, turns: AUTHOR_SCOUT_ROUNDS + 2 },
    { text: 'tiny', turns: 1 },
  ]);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  // bounded but NOT short → no recovery loop is created at all
  assert.equal(created.length, 1);
  assert.equal(r.meta.recovered, false);
  assert.equal(r.state, 'PRESENT');
});

test('runAuthorScout: when the RECOVERY round itself dies, ABSENT names the recovery\'s own error', async () => {
  // The F59 recovery is the call that produced the survey being classified, so
  // its failure is the one that describes what came back. Reading the FIRST
  // call's error instead gives the operator a reason belonging to a call the
  // recovery was there to replace — and when the first call had no error at all,
  // a dead recovery reported no error at all.
  const { factory, created } = scriptLoops([
    { text: '', turns: AUTHOR_SCOUT_ROUNDS + 2 },
    { text: '', turns: 1, error: 'truncated:max_tokens' },
  ]);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  assert.equal(created.length, 2, 'the recovery round must have fired');
  assert.equal(r.meta.error, 'truncated:max_tokens');
  assert.equal(r.state, 'ABSENT');
  assert.match(r.reason, /truncated:max_tokens/, 'the ABSENT reason must not point at the wrong call');
});

test('runAuthorScout: a SURVIVING recovery does not erase the first call\'s error', async () => {
  const { factory, created } = scriptLoops([
    { text: '', turns: AUTHOR_SCOUT_ROUNDS + 2, error: 'ENETUNREACH' },
    { text: factsBlob(), turns: 1 },
  ]);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  assert.equal(created.length, 2);
  assert.equal(r.meta.error, 'ENETUNREACH', 'classification semantics are otherwise unchanged');
  assert.equal(r.state, 'ABSENT');
});

test('runAuthorScout: with NO recovery round the first call\'s error is still the one reported', async () => {
  const { factory, created } = scriptLoops([{ text: factsBlob(), turns: 1, error: 'boom' }]);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  assert.equal(created.length, 1);
  assert.equal(r.meta.error, 'boom');
});

test('runAuthorScout: the survey blob is capped and secrets are scrubbed', async () => {
  const secret = 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const huge = `${secret} ${'y'.repeat(AUTHOR_SCOUT_BLOB_MAX * 2)}`;
  const { factory } = scriptLoops([{ text: huge, turns: 1 }]);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  assert.ok(r.meta.bytes <= AUTHOR_SCOUT_BLOB_MAX, `blob ${r.meta.bytes} must not exceed ${AUTHOR_SCOUT_BLOB_MAX}`);
  assert.ok(!r.raw.includes(secret), 'a captured key is captured forever — the survey is scrubbed at capture');
});

test('runAuthorScout: cost is metered per call and an unpriced call is honest-null (F6)', async () => {
  const { factory } = scriptLoops([{ text: factsBlob(), turns: 1, costUsd: null }]);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].label, 'author-scout');
  assert.equal(r.calls[0].costUsd, null, 'null is the honest unknown — never 0');
});

test('classifySurvey: a survey call that FAILED is ABSENT even when it left readable text behind', () => {
  // the half a short-blob fixture cannot reach: a call can die AND still have
  // produced a parseable-looking body, and a facts object read out of a failed
  // call is exactly the silent-wrong-answer this state exists to refuse
  const blob = factsBlob();
  const r = classifySurvey(blob, { bytes: Buffer.byteLength(blob), rounds: 4, bounded: false, recovered: false, error: 'ENETUNREACH' });
  assert.equal(r.state, 'ABSENT');
  assert.match(r.reason, /ENETUNREACH/);
  assert.equal(r.facts, null);
});

test('runAuthorScout: a provider error still cleans up and reports ABSENT', async () => {
  const { factory } = scriptLoops([{ text: '', turns: 1, error: 'provider exploded' }]);
  const { createSurveyor, seen } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  assert.equal(r.state, 'ABSENT');
  assert.equal(r.meta.error, 'provider exploded');
  assert.equal(seen.cleaned, 1);
});

test('runAuthorScout: a throw from the loop is relayed AFTER cleanup', async () => {
  const { createSurveyor, seen } = stubSurveyor();
  const createLoop = () => ({ run: async () => { throw new Error('boom'); }, stop: () => {} });
  await assert.rejects(
    () => runAuthorScout({ workdir: '/w', createLoop, createSurveyor }),
    /boom/,
  );
  assert.equal(seen.cleaned, 1, 'a leaked surveyor leaks a litectx handle and a gate');
});

// ── 4. the mechanical seed listing (L1) ─────────────────────────────────────

test('seedFileList reads the SEED commit, never the working tree', async (t) => {
  const { dir, seed } = makeRepo(t, { 'src/a.js': 'a', 'src/b.js': 'b', 'README.md': '#' });
  // dirty the tree AFTER the seed — a listing that reads the worktree would see it
  writeFileSync(join(dir, 'src/invented.js'), 'later');
  const r = await seedFileList(dir, seed);
  assert.equal(r.stop, null);
  assert.deepEqual([...r.files].sort(), ['README.md', 'src/a.js', 'src/b.js']);
});

test('seedFileList: a seed that does not exist is a named stop, never an empty listing', async (t) => {
  const { dir } = makeRepo(t, { 'a.js': 'a' });
  const r = await seedFileList(dir, '0000000000000000000000000000000000000000');
  assert.notEqual(r.stop, null);
  assert.equal(r.files, null, 'an unreadable listing must never render as "no files"');
});

test('seedFileList: a command that cannot even be RUN is a stop, not an empty tree', async () => {
  // the other failure branch: git exiting non-zero is one thing, git never
  // starting is another, and both must refuse rather than report a clean tree
  const r = await seedFileList('/definitely/not/a/directory/anywhere', 'HEAD');
  assert.notEqual(r.stop, null);
  assert.equal(r.files, null);
});

test('buildSeedListing: the VALIDATOR gets the whole tree, the PROMPT gets the scoped block', async (t) => {
  const { dir, seed } = makeRepo(t, {
    'src/email.js': 'e', 'src/backup.js': 'b', 'test/email.test.js': 't', 'docs/guide.md': 'd',
  });
  const r = await buildSeedListing({ workdir: dir, seedRef: seed, sourcePaths: ['src'], testPaths: ['test'] });
  assert.equal(r.stop, null);
  // the flat list is UNSCOPED: handing M2 the scoped subset would make a job
  // scoped to src/ read as whole-tree and switch off the one-population law
  assert.ok(r.files.includes('docs/guide.md'), 'the validator listing is the whole tree');
  // the rendered block is scoped
  assert.match(r.block, /src\/email\.js/);
  assert.ok(!r.block.includes('docs/guide.md'), 'the prompt block is scoped to the survey\'s own paths');
  assert.equal(r.meta.totalSeedFiles, 4);
});

test('buildSeedListing: a scoped path that matches nothing SAYS so', async (t) => {
  const { dir, seed } = makeRepo(t, { 'src/a.js': 'a' });
  const r = await buildSeedListing({ workdir: dir, seedRef: seed, sourcePaths: ['lib'], testPaths: [] });
  assert.match(r.block, /NO FILES EXIST/);
  assert.equal(r.meta.entries.find((/** @type {any} */ e) => e.entry === 'lib').matched, 0);
});

test('buildSeedListing: an over-cap path is trimmed with the trim ANNOUNCED and counts complete (F28)', async (t) => {
  /** @type {Record<string,string>} */
  const files = {};
  for (let i = 0; i < LIST_CAP + 10; i += 1) files[`src/deep/f${i}.js`] = 'x';
  files['src/top.js'] = 'x';
  const { dir, seed } = makeRepo(t, files);
  const r = await buildSeedListing({ workdir: dir, seedRef: seed, sourcePaths: ['src'], testPaths: [] });
  assert.match(r.block, /listing trimmed/);
  assert.match(r.block, new RegExp(`${LIST_CAP + 11} files`), 'the TOTAL is stated even when names are not');
  assert.match(r.block, /src\/deep\/ — \d+ files/, 'withheld names are replaced by a counted directory, never dropped');
  assert.match(r.block, /src\/top\.js/, 'direct children are still listed in full');
});

test('buildSeedListing: the whole-block byte cap degrades in announced tiers', async (t) => {
  /** @type {Record<string,string>} */
  const files = {};
  for (let i = 0; i < 60; i += 1) files[`src/pkg${i}/mod.js`] = 'x';
  const { dir, seed } = makeRepo(t, files);
  const full = await buildSeedListing({ workdir: dir, seedRef: seed, sourcePaths: ['src'], testPaths: [] });
  assert.equal(full.meta.tier, 'full');
  // the cap is a real knob, so the mechanism is tested by BINDING it rather than
  // by manufacturing a repository big enough to reach the shipped default
  const tight = await buildSeedListing({ workdir: dir, seedRef: seed, sourcePaths: ['src'], testPaths: [], byteCap: 900 });
  assert.notEqual(tight.meta.tier, 'full');
  assert.match(tight.block, /whole-listing cap/);
  assert.match(tight.block, /60 files/, 'the total survives every tier');
});

test('buildSeedListing: a FLAT directory still ends up bounded — names give way, counts do not', async (t) => {
  /** @type {Record<string,string>} */
  const files = {};
  for (let i = 0; i < 200; i += 1) files[`src/module_with_a_long_name_${i}.js`] = 'x';
  const { dir, seed } = makeRepo(t, files);
  // a flat directory has no subdirectories to collapse into: grouping alone
  // shrinks nothing, so the deepest tier must cap the NAMES or the block is
  // unbounded — and this block is a prompt ingredient
  const r = await buildSeedListing({ workdir: dir, seedRef: seed, sourcePaths: ['src'], testPaths: [], byteCap: 900 });
  assert.equal(r.meta.tier, 'counts-only');
  assert.match(r.block, /200 files/, 'the count is complete even when the names are gone');
  // the NAME cap is what does the work here — asserted specifically, so it
  // cannot quietly be doing nothing while the backstop below cleans up after it
  assert.match(r.block, /of 200 file names not printed/);
  assert.ok(!/line\(s\) were cut/.test(r.block), 'the tier alone is enough; the backstop should not have been needed');
  assert.ok(Buffer.byteLength(r.block) <= 900 + 400, `block is ${Buffer.byteLength(r.block)}B against a 900B cap`);
});

test('buildSeedListing: the BACKSTOP bounds a block that beats every tier', async (t) => {
  // enough scoped paths, each with enough subdirectories, and even counts-only
  // is large — and this block is a prompt ingredient, so "usually small" is not
  // a bound
  /** @type {Record<string,string>} */
  const files = {};
  const roots = [];
  for (let p = 0; p < 12; p += 1) {
    roots.push(`pkg${p}`);
    for (let i = 0; i < 20; i += 1) files[`pkg${p}/sub${i}/mod.js`] = 'x';
  }
  const { dir, seed } = makeRepo(t, files);
  const r = await buildSeedListing({ workdir: dir, seedRef: seed, sourcePaths: roots, testPaths: [], byteCap: 700 });
  assert.equal(r.meta.tier, 'counts-only');
  assert.match(r.block, /line\(s\) were cut/, 'the cut is announced, never silent');
  assert.ok(Buffer.byteLength(r.block) <= 700 + 400, `block is ${Buffer.byteLength(r.block)}B against a 700B cap`);
});

test('cleanEntry strips the surveyor\'s prose annotations off a path', () => {
  assert.equal(cleanEntry('src/aurora_cli (symlink)'), 'src/aurora_cli');
  assert.equal(cleanEntry('src/'), 'src');
  assert.equal(cleanEntry('  src  '), 'src');
});

// ── the REAL surveyor: the fence, not the promise ────────────────────────────
//
// `defaultSurveyor` is the seam that builds the actual gate, and it needs NO
// model to prove what it is for: the grant is read-only by menu construction,
// and the arbiter's own books are denied outright. `wireGate`'s policy answers
// `true` for allow and a deny STRING otherwise, so a fence can be interrogated
// directly. `ctx: false` keeps it deterministic and free — no index is built.

test('defaultSurveyor: the arbiter\'s own books are DENIED, and nothing anywhere is writable', async (t) => {
  const { dir } = makeRepo(t, { 'src/a.js': 'a\n', '.smoke': 'x\n' });
  const s = await defaultSurveyor({ workdir: dir, granted: AUTHOR_SCOUT_VERBS, ctx: false });
  t.after(() => s.cleanup());
  const ask = (/** @type {string} */ tool, /** @type {any} */ args) => s.policy(tool, args, {});

  // a normal source read inside the repository is the CONTROL — without it a
  // deny-everything fence would pass every assertion below and prove nothing
  assert.equal(await ask('shell_read', { path: join(dir, 'src/a.js') }), true);

  for (const book of ['gate-audit.jsonl', '.smoke', '.litectx']) {
    const d = await ask('shell_read', { path: join(dir, book) });
    assert.notEqual(d, true, `${book} is the arbiter's own book — the worker must never read it`);
  }
  // and the deny reaches the litectx STORE through the same door, not just its root
  assert.notEqual(await ask('shell_read', { path: join(dir, '.litectx', 'store.json') }), true);
  // outside the repository entirely
  assert.notEqual(await ask('shell_read', { path: join(dir, '..', 'elsewhere.txt') }), true);

  // writeScope is EMPTY: every write-class action is refused, including inside
  // the very directory the survey may read
  assert.notEqual(await ask('shell_write', { path: join(dir, 'src/a.js'), content: 'x' }), true);
  assert.notEqual(await ask('shell_write', { path: join(dir, 'brand-new.js'), content: 'x' }), true);
  assert.notEqual(await ask('shell_edit', { path: join(dir, 'src/a.js'), newText: 'x' }), true);
});

test('defaultSurveyor: the tool objects handed over carry no write-class or store-class verb at all', async (t) => {
  const { dir } = makeRepo(t, { 'src/a.js': 'a\n' });
  const s = await defaultSurveyor({ workdir: dir, granted: AUTHOR_SCOUT_VERBS, ctx: false });
  t.after(() => s.cleanup());
  const names = s.tools.map((/** @type {{name: string}} */ x) => x.name);
  assert.ok(names.length > 0, 'a surveyor with no tools would pass every negative below while surveying nothing');
  for (const verb of [...WRITE_VERBS, ...STORE_VERBS]) {
    assert.ok(!names.includes(TOOL_BY_VERB[verb]), `${verb} must have no tool object to refuse in the first place`);
  }
});

test('the scout bounds are PINNED to the plan scout\'s own numbers', () => {
  // planrun does not export them, so the pin is read off its source. Two scouts
  // with two different SCOUT_MIN_BYTES are two instruments, and the one that
  // decides ABSENT is the one nobody calibrated (F59 was sized on 18 archived
  // surveys; that sizing belongs to both callers or to neither).
  const src = readFileSync(join(HERE, '..', 'src', 'planrun.js'), 'utf8');
  /** @param {string} name */
  const pinned = (name) => Number(new RegExp(`const ${name} = ([\\d_ *]+);`).exec(src)?.[1].replace(/[_ ]/g, ''));
  assert.equal(AUTHOR_SCOUT_ROUNDS, pinned('SCOUT_ROUNDS'));
  assert.equal(AUTHOR_SCOUT_BLOB_MAX, pinned('SCOUT_BLOB_MAX'));
  assert.equal(AUTHOR_SCOUT_MIN_BYTES, pinned('SCOUT_MIN_BYTES'));
});

test('the recovery prompt is a fixed constant, not composed per call', () => {
  assert.equal(typeof SCOUT_RECOVERY_PROMPT, 'string');
  assert.match(SCOUT_RECOVERY_PROMPT, /out of exploration turns/);
});
