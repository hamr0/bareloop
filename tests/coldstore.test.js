// COLD MEANS COLD (P design record) — the runner's one-line `.litectx` reset is the
// only thing standing between run N's isolate-verb memory (ctx_remember / ctx_stash)
// and run N+1's "cold" baseline. The reuse rung's inheritance-OFF arm is exactly that
// baseline, so a leak here is unreadable evidence, not a bug you notice.
//
// The write path under test is the REAL one: these tests drive `createCtxTools`'s own
// `ctx_remember` / `ctx_stash` / `ctx_peek` handlers against a real LiteCtx rooted at a
// tmpdir patient — never a hand-rolled call the runtime doesn't make. The read side of
// the round-trip goes through `lc.recall({ kind: 'fact' })` because our `ctx_recall`
// handler is hardcoded to `kind: 'code'` (pinned below — it cannot see a fact).
//
// Four axes: (1) the fixture is connected, (2) THE GUARANTEE — a post-rmSync fresh
// store returns zero, (3) nothing store-shaped persists outside `<root>/.litectx`,
// (4) a tripwire so deleting the reset from scripts/run-u.mjs breaks a test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LiteCtx } from 'litectx';
import { createCtxTools } from '../src/tools.js';

const RUNNER = new URL('../scripts/run-u.mjs', import.meta.url).pathname;

/** A tmpdir patient shaped like a real workdir (planrun.test.js's idiom). */
function makePatient(t) {
  const wd = mkdtempSync(join(tmpdir(), 'coldstore-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  mkdirSync(join(wd, 'src'));
  writeFileSync(join(wd, 'src', 'mod.mjs'), 'export const stopwords = new Set();\n');
  return wd;
}

/** The run's ctx verbs, wired exactly as planrun.js wires them (real LiteCtx at root). */
function ctxVerbs(workdir) {
  const lc = new LiteCtx({ root: workdir });
  /** @type {object[]} */
  const events = [];
  const tools = createCtxTools(lc, workdir, (type, data) => events.push({ type, ...data }));
  /** @param {string} name */
  const verb = (name) => {
    const t = tools.find((x) => x.name === name);
    assert.ok(t, `${name} is in the ctx tool set`);
    return t.execute;
  };
  return { lc, events, verb };
}

/** Sorted relative listing of everything under `root` (dirs marked with a trailing /). */
function tree(root, base = '') {
  /** @type {string[]} */
  const out = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) { out.push(`${rel}/`); out.push(...tree(join(root, e.name), rel)); } else out.push(rel);
  }
  return out.sort();
}

const NOTE_ID = 'root-cause';
const NOTE = 'splitIdent drops the digit boundary in the stopword filter';
const STASH_ID = 'step2-tsc-output';
const BLOB = 'error TS2345: argument of type string\n'.repeat(200);

test('round-trip: the isolate verbs actually persist — a remembered fact recalls, a stashed blob peeks', async (t) => {
  const wd = makePatient(t);
  const { lc, events, verb } = ctxVerbs(wd);

  assert.equal(await verb('ctx_remember')({ id: NOTE_ID, text: NOTE }), `remembered "${NOTE_ID}"`);
  assert.match(await verb('ctx_stash')({ id: STASH_ID, text: BLOB }), /^parked \d+ bytes under "step2-tsc-output"$/);

  const hits = await lc.recall('stopword filter', { kind: 'fact', n: 5 });
  assert.equal(hits.length, 1, 'the fact is in the store and findable — the fixture is connected');
  assert.equal(hits[0].path, NOTE_ID);
  assert.equal(hits[0].kind, 'fact');

  const peeked = await verb('ctx_peek')({ id: STASH_ID });
  assert.match(peeked, new RegExp(`^stash "${STASH_ID}": ${Buffer.byteLength(BLOB)} bytes`));
  assert.match(peeked, /error TS2345/);

  // The read half of the memory this file guards, through the TOOL surface: the
  // recall handler used to hardcode kind:'code' (notes were write-only — a pinned
  // hardening find); fixed 2026-07-30, so the persona's "a later step can
  // ctx_recall it" now holds, note body inline under the `memory` label.
  const recalled = await verb('ctx_recall')({ query: 'stopword filter' });
  assert.match(recalled, new RegExp(`^memory\\t${NOTE_ID}\\t`), 'the note surfaces, labeled as memory');
  assert.ok(recalled.includes(NOTE), 'the conclusion body rides inline');

  assert.deepEqual(
    events.map((e) => e.tool),
    ['ctx_remember', 'ctx_stash', 'ctx_peek', 'ctx_recall'],
    'every verb reported to the spine',
  );
});

test('THE GUARANTEE: rmSync(<root>/.litectx) makes a fresh LiteCtx cold — zero recall hits, no stash', async (t) => {
  const wd = makePatient(t);
  const warm = ctxVerbs(wd);
  await warm.verb('ctx_remember')({ id: NOTE_ID, text: NOTE });
  await warm.verb('ctx_stash')({ id: STASH_ID, text: BLOB });
  assert.equal((await warm.lc.recall('stopword filter', { kind: 'fact', n: 5 })).length, 1, 'warm store has the note');

  // The runner's reset, verbatim (scripts/run-u.mjs).
  rmSync(join(wd, '.litectx'), { recursive: true, force: true });

  const cold = ctxVerbs(wd);
  assert.equal((await cold.lc.recall('stopword filter', { kind: 'fact', n: 5 })).length, 0, 'the fact did not survive the reset');
  assert.equal((await cold.lc.recall(NOTE_ID, { kind: 'fact', n: 5 })).length, 0, 'not by its id either');
  assert.equal((await cold.lc.recall(NOTE, { kind: 'episode', n: 5 })).length, 0, 'and not on the episode axis');

  // The miss shape: lc.peek returns null for an unknown id (no throw), which the
  // handler renders as this sentence — that sentence IS absence.
  assert.equal(cold.lc.peek(STASH_ID), null);
  assert.equal(await cold.verb('ctx_peek')({ id: STASH_ID }), `nothing stashed under "${STASH_ID}"`);
  assert.equal(cold.events.at(-1)?.outcome, 'no-key');
});

test('leak hunt: everything the isolate verbs persist lives under <root>/.litectx and nowhere else', async (t) => {
  const wd = makePatient(t);
  const seeded = tree(wd);

  // A future litectx (or a transitive dep) reaching for a home/XDG cache is the exact
  // leak class rmSync(<root>/.litectx) would miss — so give this test its own HOME and
  // cache roots and assert they stay untouched. Empty here = nothing to miss.
  const fakeHome = mkdtempSync(join(tmpdir(), 'coldstore-home-'));
  const envKeys = ['HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'HF_HOME', 'TRANSFORMERS_CACHE'];
  const saved = envKeys.map((k) => /** @type {[string, string|undefined]} */ ([k, process.env[k]]));
  for (const k of envKeys) process.env[k] = fakeHome;
  t.after(() => {
    for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    rmSync(fakeHome, { recursive: true, force: true });
  });

  const { verb } = ctxVerbs(wd);
  await verb('ctx_remember')({ id: NOTE_ID, text: NOTE });
  await verb('ctx_stash')({ id: STASH_ID, text: BLOB });
  await verb('ctx_peek')({ id: STASH_ID });

  const added = tree(wd).filter((p) => !seeded.includes(p));
  assert.ok(added.length > 0, 'the verbs wrote SOMETHING to disk (else this test proves nothing)');
  const outside = added.filter((p) => p !== '.litectx/' && !p.startsWith('.litectx/'));
  // ⚠ LEAK if this ever fails: a store artifact outside .litectx survives the runner's
  // reset and carries run N's memory into run N+1's cold baseline.
  assert.deepEqual(outside, [], `store state outside .litectx would survive the reset: ${outside.join(', ')}`);
  // Current shape (litectx 0.31.0, better-sqlite3 WAL): the db plus its -wal/-shm siblings.
  assert.deepEqual(added, ['.litectx/', '.litectx/index.db', '.litectx/index.db-shm', '.litectx/index.db-wal']);
  assert.deepEqual(tree(fakeHome), [], 'litectx wrote nothing to HOME / XDG / model-cache roots');

  // And after the reset the patient is byte-for-byte back to its seeded shape.
  rmSync(join(wd, '.litectx'), { recursive: true, force: true });
  assert.deepEqual(tree(wd), seeded);
});

test('tripwire: scripts/run-u.mjs still resets the .litectx store before every run', () => {
  const src = readFileSync(RUNNER, 'utf8');
  // Loose on purpose — the semantic pieces only (rmSync ... .litectx ... recursive),
  // so reformatting or renaming the workdir variable does not red this.
  assert.match(
    src,
    /rmSync\(\s*join\([^)]*['"]\.litectx['"]\s*\)\s*,\s*\{[^}]*recursive:\s*true/,
    'COLD MEANS COLD: the runner must delete <workdir>/.litectx before a run — removing it silently leaks isolate-verb memory into the next cold baseline',
  );
});
