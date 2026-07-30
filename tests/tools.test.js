// The P catalog (design record 2026-07-28): the widened worker tool surface.
// Every verb maps to an EXISTING litectx/bare-agent implementation (menu-is-
// inventory, hamr's #3) — these tests run against a REAL LiteCtx over a real
// tmp fixture, never a mock: the POC that preceded this file caught the recall
// hit's id living in `path`, `purge()` not covering stash, and compress needing
// a caller-sliced body — none of which a mocked litectx would have surfaced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import { TOOL_BY_VERB, CTX_TOOLS, createCtxTools, toolAction, COMPONENT_STRATEGIES } from '../src/tools.js';

const require = createRequire(import.meta.url);
const { LiteCtx } = require('litectx');

// ---- the catalog mapping is complete and closed ----

test('every catalog verb maps to a tool, and the ctx tool list matches', () => {
  const expected = {
    read: 'shell_read', grep: 'shell_grep', write: 'shell_write', edit: 'shell_edit',
    recall: 'ctx_recall', get: 'ctx_get',
    impact: 'ctx_impact', related: 'ctx_related', recent: 'ctx_recent',
    compress: 'ctx_compress', peek: 'ctx_peek',
    stash: 'ctx_stash', remember: 'ctx_remember', forget: 'ctx_forget',
  };
  assert.deepEqual({ ...TOOL_BY_VERB }, expected);
  // CTX_TOOLS is what planrun uses to decide "does this worker need litectx" —
  // a ctx verb missing here is granted-but-never-constructed (the F50 class).
  const ctxNames = Object.values(expected).filter((t) => t.startsWith('ctx_'));
  assert.deepEqual([...CTX_TOOLS].sort(), ctxNames.sort());
});

// ---- gate translation: select/compress are reads; isolate is its own class ----

test('select and compress verbs translate to read actions the fence judges', () => {
  for (const name of ['ctx_impact', 'ctx_related', 'ctx_recent', 'ctx_compress', 'ctx_peek']) {
    const a = toolAction(name, {}, '/w');
    assert.equal(a.type, 'read', `${name} must be judged as a read`);
    assert.equal(a.args.tool, name, `${name} must stay distinguishable in the audit (F18 blindness rule)`);
  }
});

test('isolate verbs carry their OWN action types — store writes are never tree writes', () => {
  // The F32 workerWrites instrument counts write|edit actions; a stash judged as
  // 'write' would count as a tree write and corrupt worker-crash routing. Distinct
  // types keep the audit honest and default-allow through the gate (admission is
  // the signed spec's tools array).
  assert.equal(toolAction('ctx_stash', { id: 'k', text: 'xy' }).type, 'ctx_stash');
  assert.equal(toolAction('ctx_stash', { id: 'k', text: 'xy' }).args.bytes, 2);
  assert.equal(toolAction('ctx_remember', { id: 'k', text: 'note' }).type, 'ctx_remember');
  assert.equal(toolAction('ctx_forget', { id: 'k' }).type, 'ctx_forget');
});

// ---- the tools against a REAL index ----

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'ptools-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'adder.js'),
    '/** Add two numbers — the fixture leaf. */\nexport function addNums(a, b) {\n  return a + b;\n}\n');
  writeFileSync(join(dir, 'src', 'caller.js'),
    "import { addNums } from './adder.js';\n/** Sum a list via addNums. */\nexport function sumAll(xs) {\n  return xs.reduce((s, x) => addNums(s, x), 0);\n}\n");
  return dir;
}

/** @returns {{lc: any, dir: string, events: any[], tools: Map<string, any>}} */
async function harness() {
  const dir = fixture();
  const lc = new LiteCtx({ root: dir });
  await lc.index();
  /** @type {any[]} */
  const events = [];
  const tools = new Map(createCtxTools(lc, dir, (/** @type {string} */ t, /** @type {object} */ d) => events.push({ t, ...d })).map((x) => [x.name, x]));
  return { lc, dir, events, tools };
}

test('ctx_impact names the dependents of a symbol', async () => {
  const { tools, events } = await harness();
  const out = await tools.get('ctx_impact').execute({ symbol: 'addNums' });
  assert.match(out, /caller\.js/, 'the importer must appear in the impact readout');
  assert.ok(events.some((e) => e.t === 'ctx-tool' && e.tool === 'ctx_impact'), 'a retrieval verb whose result is invisible cannot be judged');
});

test('ctx_related walks the import graph from a file', async () => {
  const { tools } = await harness();
  const out = await tools.get('ctx_related').execute({ path: 'src/adder.js' });
  assert.match(out, /caller\.js/, 'the importing neighbour must be listed');
});

test('ctx_recent reports activity, and an empty read says so instead of vanishing', async () => {
  const { tools } = await harness();
  const out = await tools.get('ctx_recent').execute({});
  assert.equal(typeof out, 'string');
  assert.ok(out.length > 0, 'an empty result must still be a worker-readable sentence');
});

test('ctx_compress returns the signature tier — head kept, body elided, cheaper than the source', async () => {
  const { tools } = await harness();
  const out = await tools.get('ctx_compress').execute({ path: 'src/caller.js', symbol: 'sumAll' });
  assert.match(out, /sumAll/, 'the declaration head survives');
  assert.doesNotMatch(out, /reduce/, 'the implementation body is elided');
});

test('ctx_compress on an unknown symbol refuses with the symbol named, never throws', async () => {
  const { tools } = await harness();
  const out = await tools.get('ctx_compress').execute({ path: 'src/caller.js', symbol: 'noSuchFn' });
  assert.match(out, /noSuchFn/, 'refusal-as-result names what was asked (BA-13 refusal pattern)');
});

test('stash → peek round trip: park a payload, read head/tail without paying its bytes', async () => {
  const { tools } = await harness();
  const big = `HEAD-MARK${'x'.repeat(4000)}TAIL-MARK`;
  const parked = await tools.get('ctx_stash').execute({ id: 'notes', text: big });
  assert.match(parked, /notes/, 'stash confirms the key it parked under');
  const peeked = await tools.get('ctx_peek').execute({ id: 'notes' });
  assert.match(peeked, /HEAD-MARK/);
  assert.match(peeked, /TAIL-MARK/);
  assert.ok(peeked.length < big.length / 2, 'peek must cost far less than the payload');
});

test('ctx_peek on an unknown key refuses with the key named', async () => {
  const { tools } = await harness();
  const out = await tools.get('ctx_peek').execute({ id: 'never-stashed' });
  assert.match(out, /never-stashed/);
});

test('remember → recall → forget: a durable note round-trips and dies on request', async () => {
  const { lc, tools } = await harness();
  await tools.get('ctx_remember').execute({ id: 'finding-1', text: 'the close is staged and the grader is not lendable' });
  const hits = await lc.recall('grader lendable', { kind: 'fact' });
  const flat = Array.isArray(hits) ? hits : Object.values(hits).flat();
  assert.ok(flat.length >= 1, 'a remembered fact must be recallable');
  const out = await tools.get('ctx_forget').execute({ id: 'finding-1' });
  assert.match(out, /1/, 'forget reports the rows removed');
});

test('the isolate promise holds at the TOOL surface: a remembered note comes back through ctx_recall, body attached', async () => {
  // The hardening pass caught the gap: the persona says "record a durable
  // conclusion with ctx_remember so a later step can ctx_recall it", but the
  // recall handler hardcoded kind:'code', so notes were write-only through the
  // tool surface (the library-level round-trip test above never saw it — it
  // called lc.recall directly). A note is a CONCLUSION: the body rides inline,
  // because a pointer to a memory the worker cannot dereference is inert.
  const { tools } = await harness();
  await tools.get('ctx_remember').execute({ id: 'culprit-note', text: 'the tokenizer drops digits at chunk boundaries' });
  const out = await tools.get('ctx_recall').execute({ query: 'tokenizer digits' });
  assert.match(out, /culprit-note/, 'the note id surfaces through the worker-facing verb');
  assert.match(out, /drops digits at chunk boundaries/, 'the conclusion itself rides back, not just a pointer');
  assert.match(out, /memory/, 'a note line is labeled as memory — never disguised as a code pointer ctx_get could dereference');
});

test('component strategies exist for every component — capability without strategy is inert (F19)', () => {
  for (const c of ['select', 'compress', 'isolate']) {
    assert.equal(typeof COMPONENT_STRATEGIES[c], 'string');
    assert.ok(COMPONENT_STRATEGIES[c].length > 40, `${c} strategy must actually say when to reach for it`);
  }
});
