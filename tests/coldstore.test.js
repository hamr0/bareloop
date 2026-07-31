// COLD MEANS COLD (P design record) — the runner's one-line `.litectx` reset is the
// only thing standing between run N's isolate-verb memory (ctx_remember / ctx_stash)
// and run N+1's "cold" baseline. The reuse rung's inheritance-OFF arm is exactly that
// baseline, so a leak here is unreadable evidence, not a bug you notice.
//
// The write path under test is the REAL one: these tests drive `createCtxTools`'s own
// `ctx_remember` / `ctx_stash` / `ctx_peek` handlers against a real LiteCtx rooted at a
// tmpdir patient — never a hand-rolled call the runtime doesn't make. The read side of
// the round-trip is checked BOTH ways: `lc.recall({ kind: 'fact' })` direct, to prove the
// fixture is connected at all, and then through `ctx_recall` itself, which since
// 2026-07-30 runs a second `kind: 'fact'` recall beside its `kind: 'code'` one and prints
// each note body-inline under a `memory` label (it used to be pinned to `kind: 'code'`,
// which made remembered notes write-only through the tool surface — pinned below).
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
import { scanSecrets } from '../src/validate.js';

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

// ---- the hard line: secrets never enter the tree, and the store IS the tree ----
// `<root>/.litectx/index.db` is a file inside the patient, it survives the step that
// wrote it, and ctx_recall reads notes back inline. So a model-authored payload is
// exactly the append-only capture the hard line names: "a record that captures a key
// captures it forever". The scrub is ONE inventory (SECRET_PATTERNS, via the same
// redactor the close output and the ctx-verb spine channel already ride) — detection
// and redaction must never disagree, so the read-back is judged by `scanSecrets`
// itself rather than by a second hand-spelled expression.

/** ghp_ + 30, and xoxb- + a slack-shaped tail: two SECRET_PATTERNS shapes, neither
 * of them one of bareguard's built-in defaults — so a green here proves THIS
 * inventory is wired, not that bareguard happened to catch an `sk-` by itself. */
const GH_TOKEN = `ghp_${'a1b2c3d4e5'.repeat(3)}`;
const SLACK_TOKEN = 'xoxb-1234567890-abcdefghijkl';

test('HARD LINE: a model-authored stash/note is scrubbed BEFORE it reaches the store — the secret is masked in what persists', async (t) => {
  const wd = makePatient(t);
  const { lc, verb } = ctxVerbs(wd);

  await verb('ctx_stash')({ id: 'tsc-dump', text: `tsc output\nGITHUB_TOKEN=${GH_TOKEN}\ndone\n` });
  await verb('ctx_remember')({ id: NOTE_ID, text: `the stopword filter reads ${SLACK_TOKEN} from source` });

  // Read the STORE back, not the return strings: a handler can say "parked" and
  // still have written the raw bytes.
  const peeked = lc.peek('tsc-dump');
  assert.ok(peeked, 'the payload really landed — a test over an empty store proves nothing');
  const parked = `${peeked.head}\n${peeked.tail}`;
  assert.deepEqual(scanSecrets(parked), [], `the stashed payload carries a live token: ${parked}`);
  assert.match(parked, /\[REDACTED:/, 'and it is MASKED, not silently dropped — the worker must still see that something was there');

  const notes = await lc.recall('stopword filter', { kind: 'fact', n: 5, body: true });
  assert.equal(notes.length, 1, 'the note is in the store (the fixture is connected)');
  assert.deepEqual(scanSecrets(notes[0].body), [], `the recorded note carries a live token: ${notes[0].body}`);
  assert.match(notes[0].body, /\[REDACTED:/);

  // ...and through the worker-facing read, which prints note bodies inline.
  assert.deepEqual(scanSecrets(await verb('ctx_recall')({ query: 'stopword filter' })), []);
});

test('HARD LINE: a secret in the KEY is scrubbed too, and the store stays keyed consistently — peek/forget still resolve the id the worker spelled', async (t) => {
  const wd = makePatient(t);
  const { lc, verb } = ctxVerbs(wd);
  // the token LEADS: SECRET_PATTERNS is left-bounded on purpose (so "flask-sqlalchemy"
  // never reds), which means `dump-ghp_…` is not a match at all and a test built on it
  // would pass while proving nothing.
  const dirtyId = `${GH_TOKEN}/dump`;
  const dirtyNoteId = `${GH_TOKEN}/note`;
  assert.equal(scanSecrets(dirtyId).length, 1, 'the fixture id really carries a token, or this test cannot fail');

  await verb('ctx_stash')({ id: dirtyId, text: 'harmless payload' });
  await verb('ctx_remember')({ id: dirtyNoteId, text: 'harmless conclusion' });

  // A key is a stored string like any other: litectx keys the row by it and
  // `ctx_recall` prints it back as the note's path.
  assert.equal(lc.peek(dirtyId), null, 'the RAW id is not what the store holds');
  const notes = await lc.recall('harmless conclusion', { kind: 'fact', n: 5 });
  assert.equal(notes.length, 1);
  assert.deepEqual(scanSecrets(notes[0].path), [], `the note key carries a live token: ${notes[0].path}`);

  // Consistency is the other half: scrubbing on write and NOT on lookup would make
  // every stash unreachable by the id the worker knows.
  const peeked = await verb('ctx_peek')({ id: dirtyId });
  assert.match(peeked, /harmless payload/, 'peek with the id the worker spelled still finds the payload it parked');
  assert.deepEqual(scanSecrets(peeked), []);
  assert.match(await verb('ctx_forget')({ id: dirtyNoteId }), /^forgot 1 note\(s\)/, 'and forget retracts the note it recorded');
});

test('the L1 bound is unaffected by the scrub: an over-cap payload is still refused as a RESULT and nothing reaches the store', async (t) => {
  const wd = makePatient(t);
  const { lc, verb } = ctxVerbs(wd);
  // the newline matters: `ghp_[A-Za-z0-9]{20,}` is greedy, so a token butted straight
  // against 65536 `A`s is ONE match and redacts to 26 bytes — under the cap, and the
  // test would then be measuring the wrong thing entirely.
  const text = `${GH_TOKEN}\n${'A'.repeat(65536)}`;
  const out = await verb('ctx_stash')({ id: 'over', text });
  assert.match(out, /the limit is 65536 bytes per payload\. Nothing was parked\./);
  assert.equal(lc.peek('over'), null, 'a refused stash writes nothing — redacted or not');
  assert.match(await verb('ctx_remember')({ id: 'over-note', text }), /Nothing was recorded\./);
  assert.equal((await lc.recall('over-note', { kind: 'fact', n: 5 })).length, 0);
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
