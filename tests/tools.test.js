// The P catalog (design record 2026-07-28): the widened worker tool surface.
// Every verb maps to an EXISTING litectx/bare-agent implementation (menu-is-
// inventory, hamr's #3) — these tests run against a REAL LiteCtx over a real
// tmp fixture, never a mock: the POC that preceded this file caught the recall
// hit's id living in `path`, `purge()` not covering stash, and compress needing
// a caller-sliced body — none of which a mocked litectx would have surfaced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import { TOOL_BY_VERB, CTX_TOOLS, createCtxTools, toolAction, COMPONENT_STRATEGIES, ISOLATE_MAX_BYTES, RETRIEVAL_STRATEGY, EDIT_STRATEGY, strategyFor, PERSONA_TOOLS } from '../src/tools.js';
import { TOOL_MENU } from '../src/job.js';

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

/** @param {{ after: (fn: () => void) => void }} t */
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ptools-'));
  // Every harness builds a REAL litectx index in this tree, so the tree is not
  // small — the test's own context owns its teardown (the `makePatient` idiom in
  // tests/planrun.test.js). Measured before this line existed: 8 tests per run
  // stranded 8 `ptools-*` trees in $TMPDIR, forever.
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'adder.js'),
    '/** Add two numbers — the fixture leaf. */\nexport function addNums(a, b) {\n  return a + b;\n}\n');
  writeFileSync(join(dir, 'src', 'caller.js'),
    "import { addNums } from './adder.js';\n/** Sum a list via addNums. */\nexport function sumAll(xs) {\n  return xs.reduce((s, x) => addNums(s, x), 0);\n}\n");
  // A symbol that does NOT start at the top of its file, and that CALLS another
  // indexed symbol: the line-space test needs a number where 0-based and 1-based
  // visibly disagree, and the callee readout needs a real intra-repo callee.
  writeFileSync(join(dir, 'src', 'padded.js'), PADDED);
  return dir;
}

/** the padded fixture's source, shared with the line-space test so the expected
 * line is DERIVED from the text rather than hardcoded (a hardcoded number would
 * pass for the wrong reason the day the chunker's boundaries move) */
const PADDED = "import { addNums } from './adder.js';\n// header\n// header\n\n/** Pad a number — declared well below line one. */\nexport function padNums(n) {\n  return addNums(n, 1);\n}\n";

/** @param {{ after: (fn: () => void) => void }} t
 * @returns {Promise<{lc: any, dir: string, events: any[], tools: Map<string, any>}>} */
async function harness(t) {
  const dir = fixture(t);
  const lc = new LiteCtx({ root: dir });
  await lc.index();
  /** @type {any[]} */
  const events = [];
  // the emit param is named `type` (not `t`) so it cannot shadow the test context
  const tools = new Map(createCtxTools(lc, dir, (/** @type {string} */ type, /** @type {object} */ d) => events.push({ t: type, ...d })).map((x) => [x.name, x]));
  return { lc, dir, events, tools };
}

test('ctx_impact names the dependents of a symbol', async (t) => {
  const { tools, events } = await harness(t);
  const out = await tools.get('ctx_impact').execute({ symbol: 'addNums' });
  assert.match(out, /caller\.js/, 'the importer must appear in the impact readout');
  assert.ok(events.some((e) => e.t === 'ctx-tool' && e.tool === 'ctx_impact'), 'a retrieval verb whose result is invisible cannot be judged');
});

test('ctx_impact names the CALLEES by name — a callee is a string, never an object with a path (L8 validation find)', async (t) => {
  const { tools } = await harness(t);
  const out = await tools.get('ctx_impact').execute({ symbol: 'padNums' });
  assert.doesNotMatch(out, /undefined/, 'a readout that prints "undefined:undefined" is worse than no readout — the worker cannot tell it from a real pointer');
  assert.match(out, /calls\taddNums/, 'the callee is named — litectx returns callees as unique NAMES (Impact.callees: string[])');
});

test('ctx_impact ships litectx\'s HEDGES — a "risk low, 0 callers" readout never travels without its §7.2 caveat, and a hedge-free symbol prints no empty section', async (t) => {
  const { tools } = await harness(t);
  // litectx's impact contract is asymmetric on purpose: over-counting the blast
  // radius is safe, under-counting is dangerous, so "isolated / low risk" only
  // ever ships HEDGED (impact.js: "§7.2 safety caveats; never a silent
  // isolated"; `callers` may also be capped). Nothing in the fixture calls
  // padNums, so it produces exactly that readout — and printing the number
  // while dropping the caveat IS the over-confident read the asymmetry exists
  // to prevent.
  const hedged = await tools.get('ctx_impact').execute({ symbol: 'padNums' });
  assert.match(hedged, /^risk low — 0 confirmed caller\(s\), 0 mention\(s\)$/m,
    'the fixture must really produce the reads-as-isolated line, or the test proves nothing');
  assert.match(hedged, /caveat\t.*NOT a confirmed isolation/,
    'the §7.2 caveat rides WITH the count it qualifies — a worker that reads "0 callers" as licence to change freely is the failure impact exists to prevent');
  // addNums has two confirmed callers, so litectx hedges nothing — a header with
  // nothing under it is noise the worker re-reads (and re-pays for) every call.
  const plain = await tools.get('ctx_impact').execute({ symbol: 'addNums' });
  assert.match(plain, /^risk \w+ — 2 confirmed caller\(s\)/m, 'the unhedged case is a REAL unhedged impact, not an absent one');
  assert.doesNotMatch(plain, /caveat/i, 'no hedges means no hedge section at all');
  // ...and the caveat lines QUALIFY the count, they are never more of it: the
  // spine's `hits` means impact content (defs/callers/callees/risk), and a field
  // that silently re-means itself the day a new line type ships is the
  // blind-instrument seed. The real index cannot pose this question — litectx
  // hedges only the 0-caller readout, so a hedged and an unhedged REAL impact
  // never share a body — so the SAME body goes through twice with the hedge as
  // the only difference: the one axis under test.
  const body = {
    defs: [{ path: 'src/adder.js', startLine: 1, endLine: 3 }],
    callers: [{ path: 'src/caller.js', line: 4, symbol: 'sumAll' }],
    callees: ['addNums'], risk: 'low', confirmed: 1, mentions: 1,
  };
  /** @param {string[]} hedges @returns {Promise<number>} the emitted hits for that identical body */
  const hitsFor = async (hedges) => {
    /** @type {any[]} */
    const seen = [];
    const tool = createCtxTools({ impact: async () => ({ ...body, hedges }) }, '/nowhere',
      (/** @type {string} */ type, /** @type {any} */ d) => seen.push({ t: type, ...d })).find((x) => x.name === 'ctx_impact');
    await tool.execute({ symbol: 'addNums' });
    return seen[0].hits;
  };
  const [withHedge, withoutHedge] = [await hitsFor(['callers may be capped']), await hitsFor([])];
  assert.equal(withoutHedge, 4, 'the unhedged body is 1 def + 1 caller + 1 callee + 1 risk line — pinned so the equality below cannot pass by both sides drifting together');
  assert.equal(withHedge, withoutHedge, 'identical impact content reports identical hits whether or not litectx hedged — the caveat is not a hit');
});

test('ONE line space across recall/get/impact: the numbers are interchangeable 0-based handles, and every tool that prints or takes one says so (L8)', async (t) => {
  const { lc, tools } = await harness(t);
  // (1) the fact the "off-by-one" report rests on: the printed number is the
  // 0-based chunk index, so it is one BELOW the editor line of the same text.
  const chunkFirstLine = PADDED.split('\n').indexOf('/** Pad a number — declared well below line one. */');
  assert.ok(chunkFirstLine > 0, 'the fixture symbol must not start at the top of its file, or the two spellings agree by accident');
  const impactOut = await tools.get('ctx_impact').execute({ symbol: 'padNums' });
  const printed = Number(impactOut.match(/^defined\tsrc\/padded\.js:(\d+)$/m)?.[1]);
  assert.equal(printed, chunkFirstLine, 'impact prints the 0-based chunk index');
  assert.equal(printed + 1, chunkFirstLine + 1, 'and the EDITOR line of that same text is one higher — the two spellings really do differ');

  // (2) why renumbering impact alone would be the wrong fix: recall prints the
  // SAME number for the same chunk, and ctx_get takes it as a content-hash-gated
  // HANDLE. The three tools share one space; a 1-based impact would make two
  // tools print different numbers for one chunk.
  const recallOut = await tools.get('ctx_recall').execute({ query: 'padNums' });
  const range = recallOut.match(/src\/padded\.js\tpadNums\t\S+\tlines (\d+)-(\d+)/);
  assert.ok(range, `recall must point at padNums, got:\n${recallOut}`);
  assert.equal(Number(range[1]), printed, 'recall and impact print the SAME number for the same chunk — one space, not two');
  const body = await tools.get('ctx_get').execute({ path: 'src/padded.js', startLine: Number(range[1]), endLine: Number(range[2]) });
  assert.match(body, /padNums/, 'and that number dereferences through ctx_get — it is a handle, not decoration');
  const node = lc.getNode('src/padded.js');
  assert.equal(node.chunks.find((/** @type {any} */ c) => c.symbol === 'padNums').startLine, printed,
    'and it is litectx\'s own chunk number, unrenumbered');

  // (3) the resolution: since the space is shared, consistency is the fix and the
  // DESCRIPTION carries the warning — the worker must never cross-reference these
  // against an editor, and the only place it can learn that is the tool contract.
  const tool = (/** @type {string} */ n) => tools.get(n).description;
  for (const n of ['ctx_recall', 'ctx_get', 'ctx_impact']) {
    assert.match(tool(n), /0-based index/i,
      `${n} prints or consumes a line number — its description must name the line space, or the worker reads it as an editor line`);
  }
});

test('ctx_related walks the import graph from a file', async (t) => {
  const { tools } = await harness(t);
  const out = await tools.get('ctx_related').execute({ path: 'src/adder.js' });
  assert.match(out, /caller\.js/, 'the importing neighbour must be listed');
});

test('ctx_recent reports activity, and an empty read says so instead of vanishing', async (t) => {
  const { tools } = await harness(t);
  const out = await tools.get('ctx_recent').execute({});
  assert.equal(typeof out, 'string');
  assert.ok(out.length > 0, 'an empty result must still be a worker-readable sentence');
});

test('ctx_compress returns the signature tier — head kept, body elided, cheaper than the source', async (t) => {
  const { tools } = await harness(t);
  const out = await tools.get('ctx_compress').execute({ path: 'src/caller.js', symbol: 'sumAll' });
  assert.match(out, /sumAll/, 'the declaration head survives');
  assert.doesNotMatch(out, /reduce/, 'the implementation body is elided');
});

test('ctx_compress on an unknown symbol refuses with the symbol named, never throws', async (t) => {
  const { tools } = await harness(t);
  const out = await tools.get('ctx_compress').execute({ path: 'src/caller.js', symbol: 'noSuchFn' });
  assert.match(out, /noSuchFn/, 'refusal-as-result names what was asked (BA-13 refusal pattern)');
});

test('stash → peek round trip: park a payload, read head/tail without paying its bytes', async (t) => {
  const { tools } = await harness(t);
  const big = `HEAD-MARK${'x'.repeat(4000)}TAIL-MARK`;
  const parked = await tools.get('ctx_stash').execute({ id: 'notes', text: big });
  assert.match(parked, /notes/, 'stash confirms the key it parked under');
  const peeked = await tools.get('ctx_peek').execute({ id: 'notes' });
  assert.match(peeked, /HEAD-MARK/);
  assert.match(peeked, /TAIL-MARK/);
  assert.ok(peeked.length < big.length / 2, 'peek must cost far less than the payload');
});

test('ctx_peek on an unknown key refuses with the key named', async (t) => {
  const { tools } = await harness(t);
  const out = await tools.get('ctx_peek').execute({ id: 'never-stashed' });
  assert.match(out, /never-stashed/);
});

test('remember → recall → forget: a durable note round-trips and dies on request', async (t) => {
  const { lc, tools } = await harness(t);
  await tools.get('ctx_remember').execute({ id: 'finding-1', text: 'the close is staged and the grader is not lendable' });
  const hits = await lc.recall('grader lendable', { kind: 'fact' });
  const flat = Array.isArray(hits) ? hits : Object.values(hits).flat();
  assert.ok(flat.length >= 1, 'a remembered fact must be recallable');
  const out = await tools.get('ctx_forget').execute({ id: 'finding-1' });
  assert.match(out, /1/, 'forget reports the rows removed');
});

test('the isolate promise holds at the TOOL surface: a remembered note comes back through ctx_recall, body attached', async (t) => {
  // The hardening pass caught the gap: the persona says "record a durable
  // conclusion with ctx_remember so a later step can ctx_recall it", but the
  // recall handler hardcoded kind:'code', so notes were write-only through the
  // tool surface (the library-level round-trip test above never saw it — it
  // called lc.recall directly). A note is a CONCLUSION: the body rides inline,
  // because a pointer to a memory the worker cannot dereference is inert.
  const { tools } = await harness(t);
  await tools.get('ctx_remember').execute({ id: 'culprit-note', text: 'the tokenizer drops digits at chunk boundaries' });
  const out = await tools.get('ctx_recall').execute({ query: 'tokenizer digits' });
  assert.match(out, /culprit-note/, 'the note id surfaces through the worker-facing verb');
  assert.match(out, /drops digits at chunk boundaries/, 'the conclusion itself rides back, not just a pointer');
  assert.match(out, /memory/, 'a note line is labeled as memory — never disguised as a code pointer ctx_get could dereference');
});

// ---- L1: the isolate verbs are bounded, so the store cannot be dumped into ----

test('a payload one byte under the cap parks and reads back — the bound stops dumping, not notes', async (t) => {
  const { tools } = await harness(t);
  const text = 'A'.repeat(ISOLATE_MAX_BYTES - 1);
  const out = await tools.get('ctx_stash').execute({ id: 'just-under', text });
  assert.match(out, new RegExp(`parked ${ISOLATE_MAX_BYTES - 1} bytes`), 'the legitimate payload is parked, not refused');
  const peeked = await tools.get('ctx_peek').execute({ id: 'just-under' });
  assert.match(peeked, new RegExp(`${ISOLATE_MAX_BYTES - 1} bytes`), 'and the REAL store holds it — read back, not taken on the return string\'s word');
});

test('an over-cap stash is refused as a RESULT naming size and limit, and nothing reaches the store', async (t) => {
  const { tools, events } = await harness(t);
  const text = 'A'.repeat(ISOLATE_MAX_BYTES + 1);
  const out = await tools.get('ctx_stash').execute({ id: 'dump', text });
  assert.match(out, new RegExp(String(ISOLATE_MAX_BYTES + 1)), 'the refusal names the ACTUAL size (the shell_edit anchor-miss idiom: a refusal is worker feedback)');
  assert.match(out, new RegExp(String(ISOLATE_MAX_BYTES)), 'and the limit, so the retry is a DISTINCT call and not a re-run of the same one');
  // The read-back is the assertion that matters: a handler could return the
  // refusal string AND still have written. Ask the real store.
  const peeked = await tools.get('ctx_peek').execute({ id: 'dump' });
  assert.match(peeked, /nothing stashed under "dump"/, 'a refused stash writes NOTHING — the whole point of the bound');
  // F6 class: the spine must not report bytes that never entered the store.
  const ev = events.find((e) => e.t === 'ctx-tool' && e.tool === 'ctx_stash');
  assert.equal(ev.bytes, 0, 'a refused stash parked zero bytes — reporting the attempted size as parked bytes is a blind instrument');
  assert.equal(ev.outcome, 'over-cap', 'and the refusal is nameable in the audit');
});

test('a note one byte under the cap is recorded and recalls back', async (t) => {
  const { tools } = await harness(t);
  const text = `zephyrmarker ${'note. '.repeat(200)}`.padEnd(ISOLATE_MAX_BYTES - 1, '.');
  assert.equal(Buffer.byteLength(text), ISOLATE_MAX_BYTES - 1, 'the fixture must really sit one byte under, or the test proves nothing');
  const out = await tools.get('ctx_remember').execute({ id: 'big-but-legal', text });
  assert.match(out, /remembered "big-but-legal"/);
  const recalled = await tools.get('ctx_recall').execute({ query: 'zephyrmarker' });
  assert.match(recalled, /big-but-legal/, 'the REAL store holds it — read back through the worker-facing verb');
});

test('an over-cap note is refused as a RESULT, and the store never sees it', async (t) => {
  const { tools, events } = await harness(t);
  const text = `quixmarker ${'x'.repeat(ISOLATE_MAX_BYTES)}`;
  const out = await tools.get('ctx_remember').execute({ id: 'dumped-note', text });
  assert.match(out, new RegExp(String(Buffer.byteLength(text))), 'the refusal names the actual size');
  assert.match(out, new RegExp(String(ISOLATE_MAX_BYTES)), 'and the limit');
  const recalled = await tools.get('ctx_recall').execute({ query: 'quixmarker' });
  assert.doesNotMatch(recalled, /dumped-note/, 'a refused note is not in the store — asked of the store, not of the return string');
  const ev = events.find((e) => e.t === 'ctx-tool' && e.tool === 'ctx_remember');
  assert.equal(ev.bytes, 0, 'nothing was recorded, so nothing is reported as recorded');
  assert.equal(ev.outcome, 'over-cap');
});

test('a palette verb whose litectx call THROWS still reports to the spine — ctx_get\'s failure contract, generalised', async () => {
  // The F18 blindness rule is why `emit` exists in this file at all: a verb whose
  // RESULT is invisible cannot be judged, and a thrown call is the most invisible
  // result there is — it looks exactly like a verb that was never reached, so the
  // worker's fall-back to a whole-file read reads as a free choice. ctx_get already
  // wraps and emits on its failure path; the palette verbs must not be the eight
  // holes in that instrument. The throw is a REFUSAL RESULT to the worker, never a
  // rethrow (L1: throws stay reserved for the BA-4 param-guard class).
  const boom = () => { throw new Error('sqlite: database is locked'); };
  /** every seam the eight verbs reach through, all of them throwing */
  const brokenLc = {
    impact: boom, related: boom, recentActivity: boom, getNode: boom, get: boom,
    stash: boom, peek: boom, remember: boom, forget: boom,
  };
  /** @type {any[]} */
  const events = [];
  const tools = new Map(createCtxTools(brokenLc, '/nowhere',
    (/** @type {string} */ type, /** @type {any} */ d) => events.push({ t: type, ...d })).map((x) => [x.name, x]));

  /** @type {[string, object][]} */
  const calls = [
    ['ctx_impact', { symbol: 'addNums' }],
    ['ctx_related', { path: 'src/adder.js' }],
    ['ctx_recent', {}],
    ['ctx_compress', { path: 'src/adder.js', symbol: 'addNums' }],
    ['ctx_stash', { id: 'k', text: 'payload' }],
    ['ctx_peek', { id: 'k' }],
    ['ctx_remember', { id: 'k', text: 'note' }],
    ['ctx_forget', { id: 'k' }],
  ];
  for (const [name, args] of calls) {
    const out = await tools.get(name).execute(args);
    assert.equal(typeof out, 'string', `${name} hands the worker a result, it does not throw out of the loop`);
    assert.match(out, /database is locked/, `${name}'s refusal names the real cause, so the worker can react to it`);
    const ev = events.filter((e) => e.t === 'ctx-tool' && e.tool === name).at(-1);
    assert.ok(ev, `${name}: a thrown call reached the spine`);
    assert.equal(ev.outcome, 'error', `${name}: and it is nameable in the audit as a failure, not silence`);
    assert.equal(ev.bytes, 0, `${name}: a failed call moved zero bytes (F6 class)`);
  }
});

test('component strategies exist for every component — capability without strategy is inert (F19)', () => {
  for (const c of ['select', 'compress', 'isolate']) {
    assert.equal(typeof COMPONENT_STRATEGIES[c], 'string');
    assert.ok(COMPONENT_STRATEGIES[c].length > 40, `${c} strategy must actually say when to reach for it`);
  }
});

// F19 INVERTED: a strategy line that names a tool the grant LACKS steers the
// worker at a tool it cannot call — worse than no strategy, because the model
// spends rounds reaching for a menu entry that is not there. The components fire
// per COMPONENT (any one verb lights the whole paragraph) while their prose names
// EVERY verb in it, and two of them cross component lines outright: isolate names
// `ctx_peek` (a compress verb), the retrieval pair prescribes `ctx_recall` →
// `ctx_get` on either verb alone. planrun already states the law for the select
// component — "a worker granted only `impact` must not be steered to tools it
// lacks" — so the assembly has to hold it for every sentence.
const TOOL_NAMES = Object.values(TOOL_BY_VERB);
/** every tool NAME the assembled strategy mentions but the grant does not carry */
const ungrantedNamed = (/** @type {string[]} */ granted) => {
  const s = strategyFor(granted);
  const allowed = new Set(granted.map((v) => TOOL_BY_VERB[v]));
  return TOOL_NAMES.filter((n) => !allowed.has(n) && s.includes(n));
};

for (const granted of [
  ['stash', 'write'],                 // isolate without peek — today names ctx_peek
  ['recall', 'write'],                // retrieval without get — today prescribes ctx_get
  ['get', 'write'],                   // retrieval without recall — today prescribes ctx_recall
  ['impact', 'write'],                // planrun's own worked example
  ['peek', 'write'],                  // compress without compress
  ['compress', 'write'],              // compress without peek
  ['remember', 'write'],              // isolate without recall/stash/forget
  ['forget', 'write'],
  ['recall', 'get', 'write'],         // retrieval pair, but no `read` to reserve
]) {
  test(`a partial grant is steered only at tools it HAS: ${granted.join('+')}`, () => {
    assert.deepEqual(ungrantedNamed(granted), [], `the strategy names tools this worker cannot call`);
    assert.ok(strategyFor(granted).length > 40, 'and it still says WHEN to reach for what it does have (F19)');
  });
}

test('a FULL grant reads exactly as the component strategies do today — the fix narrows partials, never the full menu', () => {
  // The paragraphs are the paid-for prose; the per-verb assembly must reproduce
  // them byte-for-byte when every verb is present, or this became a rewrite of
  // the strategy text wearing a bug fix's clothes.
  const full = strategyFor([...TOOL_MENU]);
  assert.equal(full, EDIT_STRATEGY + RETRIEVAL_STRATEGY + COMPONENT_STRATEGIES.select
    + COMPONENT_STRATEGIES.compress + COMPONENT_STRATEGIES.isolate);
  assert.deepEqual(ungrantedNamed([...TOOL_MENU]), []);
});

test('no granted verb, no strategy — an empty grant is steered nowhere', () => {
  assert.equal(strategyFor([]), '');
  assert.equal(strategyFor(['write']), '', 'write alone carries no component strategy (its own line is the persona\'s)');
});

// ── the arbiter's own books are REGISTERED, not discovered by dying (F98) ────
//
// The fence already denies them (planrun's Gate: `deny: [gate-audit.jsonl,
// .smoke, .litectx]`, and the spine is written outside the patient entirely).
// What was missing is the REGISTER: nothing told the worker, so the way a worker
// learned the rule was by spending rounds of a bounded attempt probing files that
// hold the arbiter's bookkeeping and nothing about its task. A denial is a wall;
// a stated law is a map. This is the same register as the persona's absolute-path
// law two sentences above it — both are fence facts the worker cannot infer.
test('the worker\'s rendered system prompt names the arbiter\'s books and forbids reading them', () => {
  // the RENDERED prompt, composed the way the runner composes it — not the
  // constant on its own
  for (const granted of [['write'], ['read', 'write'], [...TOOL_MENU]]) {
    const system = PERSONA_TOOLS + strategyFor(granted);
    for (const book of ['gate-audit.jsonl', '.smoke', '.litectx', 'spine']) {
      assert.ok(system.includes(book), `${granted.join('+')}: the rendered worker prompt never names ${book}`);
    }
    assert.match(system, /never read them/i, `${granted.join('+')}: the books are named without the instruction`);
  }
  // it rides on the PERSONA and not on a strategy paragraph: a worker granted only
  // `write` gets no strategy at all (asserted above), and must still be told.
  assert.equal(strategyFor(['write']), '');
  assert.ok(PERSONA_TOOLS.includes('gate-audit.jsonl'));

  // and the seam it rides on is still the one every plan-step worker renders. A
  // register that lands in a constant nothing composes is prose, not protection.
  const src = readFileSync(new URL('../src/planrun.js', import.meta.url), 'utf8');
  assert.match(src, /const system = PERSONA_TOOLS \+ strategyFor\(granted\)/,
    'the worker system prompt is no longer built from PERSONA_TOOLS — the register is orphaned');
  // the fence half of the same fact. The prose and the deny list now both SPELL
  // FROM one home (`ARBITER_BOOK_STORES`, src/kinds.js) so they cannot drift by
  // construction — this asserts the fence still consumes that home, because a
  // deny list rewritten back to literals would quietly re-open the drift channel.
  assert.match(src, /deny: \[auditPath, \.\.\.ARBITER_BOOK_STORES\.map\(\(s\) => join\(workdir, s\)\)\]/,
    'the deny list no longer spells from ARBITER_BOOK_STORES — the persona and the fence can drift again');
});
