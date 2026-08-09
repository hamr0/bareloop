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
  SCOUT_ATTEMPTS, SCOUT_RETRY_CAUSES, SURVEY_CAUSES,
} from '../src/authorscout.js';
import { scrubRaw, RAW_PERSIST_MAX, RAW_TRIM_MARKER } from '../src/text.js';
import { scanSecrets } from '../src/validate.js';
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
  // ONE attempt: this test is about the capture boundary, not the retry ladder.
  // The cap is tighten-only, so asking for one is the operator's to do.
  const r = await runAuthorScout({ workdir: '/w', attempts: 1, createLoop: factory, createSurveyor });
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

// ── 5. THE MALFORMED-CLASS RETRY, AND THE RAW AS THE AUDIT ARTIFACT ─────────
//
// Run mslhn707, live: a survey that broke JSON at position 1339 was a
// FIRST-STRIKE KILL — `scout-absent`, the run over, $0.053 spent, and the raw
// text that would have said WHY thrown away with the process. Two changes, and
// the second is what makes the first decidable later:
//
//   - three attempts, HARDCODED, fired only on the TYPED malformed class. A
//     provider error, a truncation and a VALID-JSON survey with vacuous content
//     never retry: reacting to content is a designed loop, not a retry (F38/F39
//     — retrying a semantic failure pays for the same distribution twice);
//   - every attempt's raw text PERSISTS on the run's own audit trail, scrubbed
//     through the one helper, so the malformation can be read rather than
//     remembered. That record is the evidence the tool-mode escalation waits on.

/** a survey body that is UNPARSEABLE and long enough to clear the ABSENT floor */
const badBlob = (/** @type {string} */ tag = 'a') => `\`\`\`json\n{"language": "javascript", "runner": "${tag}",\n\`\`\`\n${'x'.repeat(AUTHOR_SCOUT_MIN_BYTES + 50)}`;
/** VALID JSON whose content is vacuous — the semantic class, which never retries */
const vacuousBlob = () => `\`\`\`json\n{}\n\`\`\`\n${'x'.repeat(AUTHOR_SCOUT_MIN_BYTES + 50)}`;

test('SCOUT_ATTEMPTS is a hardcoded 3, and the retryable causes are the MALFORMED class only', () => {
  assert.equal(SCOUT_ATTEMPTS, 3);
  // typed at the detection site: the gate cannot silently widen to "any ABSENT"
  assert.deepEqual([...SCOUT_RETRY_CAUSES].sort(), ['empty', 'unparseable']);
  for (const semantic of [SURVEY_CAUSES.EMPTY_OBJECT, SURVEY_CAUSES.NON_OBJECT, SURVEY_CAUSES.CALL_FAILED, SURVEY_CAUSES.SHORT]) {
    assert.ok(!SCOUT_RETRY_CAUSES.includes(semantic), `${semantic} must never retry`);
  }
});

test('classifySurvey types its cause — every ABSENT route names one, PRESENT names none', () => {
  const meta = (/** @type {string} */ blob, /** @type {any} */ over = {}) => ({
    bytes: Buffer.byteLength(blob), rounds: 3, bounded: false, recovered: false, error: null, ...over,
  });
  const at = (/** @type {string} */ b, /** @type {any} */ o = {}) => classifySurvey(b, meta(b, o));
  assert.equal(at(factsBlob()).cause, null);
  assert.equal(at(factsBlob(), { error: 'ENETUNREACH' }).cause, SURVEY_CAUSES.CALL_FAILED);
  assert.equal(at(factsBlob(), { error: 'truncated:max_tokens' }).cause, SURVEY_CAUSES.CALL_FAILED);
  assert.equal(at('   \n  ').cause, SURVEY_CAUSES.EMPTY);
  assert.equal(at('tiny').cause, SURVEY_CAUSES.SHORT);
  assert.equal(at(badBlob()).cause, SURVEY_CAUSES.UNPARSEABLE);
  assert.equal(at(`\`\`\`json\n[1,2]\n\`\`\`\n${'x'.repeat(300)}`).cause, SURVEY_CAUSES.NON_OBJECT);
  assert.equal(at(vacuousBlob()).cause, SURVEY_CAUSES.EMPTY_OBJECT);
});

test('runAuthorScout: a MALFORMED survey is re-asked, and the second attempt converts', async () => {
  const { factory, created } = scriptLoops([{ text: badBlob(), turns: 2 }, { text: factsBlob(), turns: 1 }]);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  assert.equal(r.state, 'PRESENT', 'the run that used to die at strike one now converts');
  assert.equal(r.facts.runner, 'node --test');
  assert.equal(r.meta.attempts, 2);
  assert.equal(created.length, 2, 'exactly one re-ask');
  assert.deepEqual(created[1].runs[0].tools, [], 'the re-ask is TOOLLESS — the facts were already read, only the form failed');
  // the re-prompt names what failed MECHANICALLY (the converting gap genre)
  const turn = created[1].runs[0].messages.at(-1).content;
  assert.match(turn, /did not parse as JSON/);
  assert.match(turn, /position/, 'the parse position is the mechanical detail');
  // every retry is a paid call, metered into the same book under its own label
  assert.deepEqual(r.calls.map((c) => c.label), ['author-scout', 'author-scout#2']);
});

test('runAuthorScout: the attempts EXHAUST at SCOUT_ATTEMPTS and the red says after how many', async () => {
  const { factory, created } = scriptLoops([{ text: badBlob('a'), turns: 1 }, { text: badBlob('b'), turns: 1 }, { text: badBlob('c'), turns: 1 }, { text: factsBlob(), turns: 1 }]);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  assert.equal(r.state, 'ABSENT');
  assert.equal(created.length, SCOUT_ATTEMPTS, 'a fourth attempt is never made, however malformed the third was');
  assert.equal(r.meta.attempts, SCOUT_ATTEMPTS);
  assert.match(r.reason, /did not parse as JSON/, 'the honest reason survives the retry');
  assert.match(r.reason, new RegExp(`after ${SCOUT_ATTEMPTS} attempts`));
  assert.equal(r.calls.length, SCOUT_ATTEMPTS, 'each attempt is metered — a retry is never a free call');
});

test('runAuthorScout: a SEMANTIC failure never retries — valid JSON with vacuous content is not malformed', async () => {
  for (const [what, text] of [['an empty object', vacuousBlob()], ['a non-object', `\`\`\`json\n[1,2]\n\`\`\`\n${'x'.repeat(300)}`]]) {
    const { factory, created } = scriptLoops([{ text, turns: 1 }, { text: factsBlob(), turns: 1 }]);
    const { createSurveyor } = stubSurveyor();
    const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
    assert.equal(r.state, 'ABSENT', what);
    assert.equal(created.length, 1, `${what} must NOT be retried — reacting to content is a designed loop, not a retry`);
    assert.equal(r.calls.length, 1);
  }
});

test('runAuthorScout: a TRUNCATED or dead call never retries — that stays provider-red routed', async () => {
  for (const err of ['truncated:max_tokens', 'ENETUNREACH']) {
    const { factory, created } = scriptLoops([{ text: badBlob(), turns: 1, error: err }, { text: factsBlob(), turns: 1 }]);
    const { createSurveyor } = stubSurveyor();
    const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
    assert.equal(r.state, 'ABSENT');
    assert.equal(r.cause, SURVEY_CAUSES.CALL_FAILED);
    assert.equal(created.length, 1, `${err} is a casualty, and a redraft on it pays for the same failure again`);
  }
});

test('runAuthorScout: the attempt cap is TIGHTEN-ONLY — an operator may lower it, never widen it', async () => {
  const script = [{ text: badBlob('a'), turns: 1 }, { text: badBlob('b'), turns: 1 }, { text: badBlob('c'), turns: 1 },
    { text: badBlob('d'), turns: 1 }, { text: badBlob('e'), turns: 1 }, { text: factsBlob(), turns: 1 }];
  for (const widened of [4, 99, Infinity]) {
    const { factory, created } = scriptLoops(script);
    const { createSurveyor } = stubSurveyor();
    const r = await runAuthorScout({ workdir: '/w', attempts: widened, createLoop: factory, createSurveyor });
    assert.equal(created.length, SCOUT_ATTEMPTS, `attempts:${widened} must clamp to the hardcoded ${SCOUT_ATTEMPTS}`);
    assert.equal(r.meta.attemptsAllowed, SCOUT_ATTEMPTS);
  }
  // and LOWER is honoured, because tightening is the operator's to do
  const { factory, created } = scriptLoops(script);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', attempts: 1, createLoop: factory, createSurveyor });
  assert.equal(created.length, 1);
  assert.equal(r.meta.attemptsAllowed, 1);
  assert.match(r.reason, /did not parse as JSON/);
  assert.ok(!/after \d+ attempts/.test(r.reason), 'one attempt is the un-retried case and says nothing about retries');
});

test('runAuthorScout: EVERY attempt persists its raw, labelled and indexed, with the parse error beside it', async () => {
  const { factory } = scriptLoops([{ text: badBlob('one'), turns: 1 }, { text: badBlob('two'), turns: 1 }, { text: factsBlob(), turns: 1 }]);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  assert.equal(r.state, 'PRESENT');
  assert.equal(r.raws.length, 3, 'the raw is the autopsy artifact — a discarded attempt is exactly the one worth reading');
  assert.deepEqual(r.raws.map((x) => x.label), ['author-scout', 'author-scout#2', 'author-scout#3']);
  assert.deepEqual(r.raws.map((x) => x.attempt), [1, 2, 3]);
  assert.match(r.raws[0].text, /"runner": "one"/, 'the raw is what the model actually said, verbatim');
  assert.match(r.raws[1].text, /"runner": "two"/);
  assert.equal(r.raws[0].cause, SURVEY_CAUSES.UNPARSEABLE, 'the typed cause rides with the raw it describes');
  assert.match(r.raws[0].reason, /did not parse as JSON/);
  assert.equal(r.raws[2].cause, null, 'the attempt that succeeded carries no failure');
  // the pairing invariant: every metered call has a raw, and vice versa
  assert.deepEqual(r.raws.map((x) => x.label), r.calls.map((c) => c.label));
});

test('runAuthorScout: the F59 recovery round persists its OWN raw beside the survey it replaced', async () => {
  const { factory } = scriptLoops([{ text: '', turns: AUTHOR_SCOUT_ROUNDS + 2 }, { text: factsBlob(), turns: 1 }]);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  assert.deepEqual(r.raws.map((x) => x.label), ['author-scout', 'author-scout-recovery']);
  assert.deepEqual(r.raws.map((x) => x.label), r.calls.map((c) => c.label), 'one raw per metered call, always');
});

test('runAuthorScout: a persisted raw is SCRUBBED — masked, never deleted, and never a second inventory', async () => {
  const secret = ['sk', 'live', 'A1b2C3d4E5f6G7h8I9j0KLMN'].join('-');
  assert.equal(scanSecrets(secret).length, 1, 'the fixture must be a shape the ONE inventory actually detects');
  const body = `${badBlob()} export ANTHROPIC_API_KEY=${secret} and the survey ends here`;
  const { factory } = scriptLoops([{ text: body, turns: 1 }, { text: factsBlob(), turns: 1 }]);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  assert.deepEqual(scanSecrets(JSON.stringify(r.raws)), [], 'a persisted raw that captures a key captures it forever');
  assert.ok(r.raws[0].text.includes('[REDACTED:'), 'the mask is the shared redactor, not a silent deletion');
  assert.match(r.raws[0].text, /and the survey ends here/, 'everything around the token survives — the raw is the autopsy');
});

// The raw's TEXT is scrubbed at creation; the verdict is STAMPED on afterwards,
// and a stamp that skips the boundary the text rode is the same hole one field
// over. `classifySurvey` quotes the transport's own error prose verbatim into
// `reason` (`the survey call failed: <meta.error>`), and provider prose is the
// one string in this module nobody wrote and nobody bounds.
test('runAuthorScout: the STAMPED verdict rides the same scrub boundary as the raw it describes', async () => {
  const secret = ['sk', 'live', 'C1b2C3d4E5f6G7h8I9j0KLMN'].join('-');
  assert.equal(scanSecrets(secret).length, 1, 'the fixture must be a shape the ONE inventory actually detects');
  const { factory } = scriptLoops([
    { text: badBlob(), turns: 1, error: `ENETUNREACH POSTing with ANTHROPIC_API_KEY=${secret} to the provider` },
    { text: factsBlob(), turns: 1 },
  ]);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  assert.equal(r.cause, SURVEY_CAUSES.CALL_FAILED);
  assert.deepEqual(scanSecrets(JSON.stringify(r.raws)), [],
    'the stamped reason is PERSISTED — a record that captures a key captures it forever');
  assert.ok(r.raws[0].reason.includes('[REDACTED:'), 'the mask is the shared redactor, not a silent deletion');
  assert.match(r.raws[0].reason, /the survey call failed/, 'everything around the token survives — the raw is the autopsy');
  assert.equal(r.raws[0].cause, SURVEY_CAUSES.CALL_FAILED, 'the typed cause is enumerated and passes through untouched');
});

test('runAuthorScout: an oversized raw is TRIMMED and the trim ANNOUNCES itself (F28)', async () => {
  const huge = `${badBlob()}${'z'.repeat(RAW_PERSIST_MAX * 3)}`;
  const { factory } = scriptLoops([{ text: huge, turns: 1 }, { text: factsBlob(), turns: 1 }]);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', blobMax: RAW_PERSIST_MAX * 4, createLoop: factory, createSurveyor });
  const raw = r.raws[0];
  assert.equal(raw.trimmed, true);
  assert.ok(Buffer.byteLength(raw.text) <= RAW_PERSIST_MAX + 200, `the persisted raw is bounded: ${Buffer.byteLength(raw.text)}`);
  assert.ok(raw.text.includes(RAW_TRIM_MARKER), 'a trim is never silent');
  assert.match(raw.text, new RegExp(`${RAW_PERSIST_MAX}`), 'the cap itself is named');
  assert.ok(raw.bytes > RAW_PERSIST_MAX, 'the FULL size is still reported — a bound eats detail, never evidence');
});

test('scrubRaw is the ONE persist boundary: it scrubs, bounds, and announces, for any writer', () => {
  const secret = ['sk', 'live', 'B1b2C3d4E5f6G7h8I9j0KLMN'].join('-');
  const plain = scrubRaw({ label: 'x', attempt: 1, text: `head ${secret} tail` });
  assert.deepEqual(scanSecrets(JSON.stringify(plain)), []);
  assert.match(plain.text, /head .* tail/);
  assert.equal(plain.trimmed, false);
  assert.equal(plain.cause, null);
  // absent input is absent, never an empty string pretending to be an answer
  const none = scrubRaw({ label: 'x', attempt: 2, text: null });
  assert.equal(none.text, '');
  assert.equal(none.bytes, 0);
  // multi-byte content must not be cut into a broken sequence
  // a THREE-byte character, deliberately: at the 8000-byte cap a two-byte one
  // divides evenly and the walk-back never fires, so the fixture could not show
  // the negative. `€` puts a continuation byte exactly on the cut.
  const wide = scrubRaw({ label: 'x', attempt: 3, text: '€'.repeat(RAW_PERSIST_MAX) });
  assert.equal(wide.trimmed, true);
  assert.ok(!wide.text.split(RAW_TRIM_MARKER)[0].includes('�'), 'a byte-wise cut would split a multi-byte character');
  // …and the ANNOUNCEMENT counts what was actually withheld. The multi-byte
  // walk-back can cut short of the cap, so a number derived from the cap
  // under-reports the withheld bytes — an announced bound that misstates its own
  // arithmetic is the announcement failing at its one job.
  const keptBytes = Buffer.byteLength(wide.text.split(`\n[${RAW_TRIM_MARKER}`)[0], 'utf8');
  const announced = Number(new RegExp(`${RAW_TRIM_MARKER} (\\d+) of`).exec(wide.text)?.[1]);
  assert.equal(announced, wide.bytes - keptBytes, 'withheld = full size − what was actually kept');
});

test('runAuthorScout: the verdict is stamped on the raw it DESCRIBES, not on whichever call came last', async () => {
  // a recovery that comes back SMALLER is discarded, so the blob being
  // classified is the FIRST call's — stamping the cause on the recovery's raw
  // would attribute a reading to an emission nobody judged
  const { factory, created } = scriptLoops([
    { text: 'a'.repeat(120), turns: AUTHOR_SCOUT_ROUNDS + 2 },
    { text: 'b', turns: 1 },
  ]);
  const { createSurveyor } = stubSurveyor();
  const r = await runAuthorScout({ workdir: '/w', createLoop: factory, createSurveyor });
  assert.equal(created.length, 2, 'the recovery must have fired for this test to mean anything');
  assert.equal(r.meta.recovered, false, 'and it must have been discarded');
  assert.deepEqual(r.raws.map((x) => x.label), ['author-scout', 'author-scout-recovery']);
  assert.equal(r.raws[0].cause, SURVEY_CAUSES.SHORT, 'the surviving blob is the one that was judged');
  assert.equal(r.raws[1].cause, null, 'the discarded emission is kept, and no verdict is invented for it');
  assert.equal(r.raws[1].text, 'b', 'kept verbatim — a discarded attempt is exactly the one worth reading');
});
