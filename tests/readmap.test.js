// The first-read map (src/readshim.js `readMap`; EXPERIMENTAL, default off; docs/logs/MAP-PREREG.md).
// With the signed spec field `readMap: true`, the FIRST shell_read in an ask of a file of 200+ lines that is not a test file
// returns a map (symbol and line range per named part) instead of file bytes. Real shell_read, real git repo, real LiteCtx
// index and the real ctx_get tool; nothing here is a stand-in for the seam under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { LiteCtx } from 'litectx';
import { createReadShim, readShimArm, buildReadMap, READ_MAP_MIN_LINES, READ_MAP_CAP } from '../src/readshim.js';
import { createCtxTools } from '../src/tools.js';
import { validateJob, jobSpecHash } from '../src/job.js';
import { initPatientRepo } from './helpers.js';

const require = createRequire(import.meta.url);
const { createShellTools } = require('bare-agent/tools');
const rawRead = () => createShellTools().tools.find((/** @type {{name: string}} */ t) => t.name === 'shell_read');

/** `n` lines of small functions, so a file is long and every function is a named chunk */
const manyFns = (n, prefix = 'fn') => Array.from({ length: n }, (_, i) => `/** doc ${i} */\nexport function ${prefix}${i}(a) {\n  return a + ${i};\n}\n`).join('');
const CLASSY = `${Array.from({ length: 60 }, (_, i) => `// filler ${i}`).join('\n')}
/** the class */
export class Box {
  constructor() { this.v = 1; }
  /** first */
  alpha(x) {
    return x + 1;
  }
  /** second */
  beta(x) {
    return x + 2;
  }
}
${manyFns(40, 'tail')}`;

/** a real git repo holding `files`, indexed by a real LiteCtx */
async function repo(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'readmap-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  initPatientRepo(dir);
  const lc = new LiteCtx({ root: dir });
  await lc.index({ yield: true });
  return { dir, lc };
}

function shimFor({ dir, lc }, over = {}) {
  /** @type {{type: string, data: any}[]} */
  const events = [];
  const readMap = {
    root: dir, hasGet: true, getNode: (/** @type {string} */ rel) => lc.getNode(rel), refresh: () => lc.index({ yield: true }),
    emit: (/** @type {string} */ type, /** @type {any} */ data) => events.push({ type, data }), ...over,
  };
  const shim = createReadShim({ arm: readShimArm('cap'), readMap });
  return { shim, read: shim.wrapRead(rawRead()), events };
}
const plainRead = () => createReadShim({ arm: readShimArm('cap') }).wrapRead(rawRead());

test('OFF (no readMap option): the read is byte-identical to a shim built without the feature', async (t) => {
  const r = await repo(t, { 'src/a.js': manyFns(80) });
  const off = await plainRead().execute({ path: join(r.dir, 'src/a.js') });
  const none = createReadShim({ arm: readShimArm('cap'), readMap: null }).wrapRead(rawRead());
  assert.equal(await none.execute({ path: join(r.dir, 'src/a.js') }), off);
  assert.equal(off, readFileSync(join(r.dir, 'src/a.js'), 'utf8'));
});

test('ON: the first read is the map, the second read of the same path is the whole file, the file is never marked delivered by the map', async (t) => {
  const r = await repo(t, { 'src/a.js': manyFns(80) });
  const { read, events } = shimFor(r);
  const p = join(r.dir, 'src/a.js');
  const first = await read.execute({ path: p });
  assert.match(first, /^src\/a\.js \(\d+ lines\) — map, not the file:\n/);
  assert.match(first, /\nfn0 \d+-\d+\n/);
  assert.match(first, /ctx_get/);
  assert.ok(!first.includes('return a + 3'), 'no file bytes in the map');
  const second = await read.execute({ path: p });
  assert.equal(second, readFileSync(p, 'utf8'), 'the second read is today\'s read, in full (not a pointer: the map delivered nothing)');
  const third = await read.execute({ path: p });
  assert.match(third, /unchanged|already/i, 'from the second read on the ledger works as today');
  assert.deepEqual(events.map((e) => e.type), ['read-map']);
  const ev = events[0].data;
  assert.deepEqual(Object.keys(ev).sort(), ['chars', 'lines', 'path', 'symbols']);
  assert.equal(ev.path, 'src/a.js');
  assert.equal(ev.lines, 320);
  assert.equal(ev.symbols, 80);
  assert.equal(ev.chars, first.length);
});

test('a new ask (shim.reset) gets a map again', async (t) => {
  const r = await repo(t, { 'src/a.js': manyFns(80) });
  const { shim, read } = shimFor(r);
  const p = join(r.dir, 'src/a.js');
  await read.execute({ path: p });
  await read.execute({ path: p });
  shim.reset();
  assert.match(await read.execute({ path: p }), /map, not the file/);
});

test('test files get no map: test/ tests/ __tests__/ segments and *.test.* / *.spec.* names', async (t) => {
  const body = manyFns(80);
  const names = ['test/a.js', 'tests/b.js', 'src/__tests__/c.js', 'src/d.test.js', 'src/e.spec.ts', 'src/f.test.mjs'];
  const r = await repo(t, Object.fromEntries([...names, 'src/ok.js'].map((n) => [n, body])));
  const { read, events } = shimFor(r);
  for (const n of names) assert.equal(await read.execute({ path: join(r.dir, n) }), body, `${n} is read whole`);
  assert.match(await read.execute({ path: join(r.dir, 'src/ok.js') }), /map, not the file/);
  assert.deepEqual(events.map((e) => e.type), ['read-map'], 'a test file is not a fallback, so no skip record either');
});

test('a file under 200 lines gets no map', async (t) => {
  const small = `${manyFns(49)}// a\n// b\n// c\n`; // 199 lines
  assert.equal(small.split('\n').length - 1, READ_MAP_MIN_LINES - 1);
  const r = await repo(t, { 'src/s.js': small, 'src/t.js': manyFns(READ_MAP_MIN_LINES / 4) });
  const { read } = shimFor(r);
  assert.equal(await read.execute({ path: join(r.dir, 'src/s.js') }), small);
  assert.match(await read.execute({ path: join(r.dir, 'src/t.js') }), /map, not the file/, 'exactly 200 lines is mapped');
});

test('a chunk that contains another named chunk is left out; its members stay', async (t) => {
  const r = await repo(t, { 'src/c.js': CLASSY });
  const { read } = shimFor(r);
  const map = await read.execute({ path: join(r.dir, 'src/c.js') });
  const named = r.lc.getNode('src/c.js').chunks.filter((/** @type {any} */ c) => c.symbol);
  assert.ok(named.some((/** @type {any} */ c) => c.symbol === 'Box'), 'the index names the class (else this test proves nothing)');
  assert.ok(!/^Box /m.test(map), 'the class chunk is dropped');
  assert.match(map, /^alpha \d+-\d+$/m);
  assert.match(map, /^beta \d+-\d+$/m);
  assert.match(map, /^tail39 \d+-\d+$/m);
});

test('over 4,000 characters the map is cut and says how many parts it left out', async (t) => {
  const r = await repo(t, { 'src/big.js': manyFns(600, 'fnWithALongishName') });
  const { read, events } = shimFor(r);
  const map = await read.execute({ path: join(r.dir, 'src/big.js') });
  assert.ok(map.length <= READ_MAP_CAP, `${map.length} <= ${READ_MAP_CAP}`);
  const m = /\n\+(\d+) more\n/.exec(map);
  assert.ok(m, 'a +N more line');
  const shown = map.split('\n').filter((l) => /^fnWithALongishName\d+ \d+-\d+$/.test(l)).length;
  assert.equal(shown + Number(m[1]), 600);
  assert.match(map, /ctx_get/, 'the footer survives the cut');
  assert.equal(events[0].data.symbols, shown);
});

test('no ctx_get in the grant: today\'s read, and a skip record says why', async (t) => {
  const r = await repo(t, { 'src/a.js': manyFns(80) });
  const { read, events } = shimFor(r, { hasGet: false });
  const p = join(r.dir, 'src/a.js');
  assert.equal(await read.execute({ path: p }), readFileSync(p, 'utf8'));
  assert.deepEqual(events, [{ type: 'read-map-skip', data: { path: 'src/a.js', reason: 'no-ctx_get' } }]);
});

test('no index / getNode throws / no named chunks: today\'s read plus a skip record with the reason', async (t) => {
  const r = await repo(t, { 'src/a.js': manyFns(80), 'src/data.txt': 'x = 1\n'.repeat(300) });
  const cases = [
    [{ getNode: () => null }, 'src/a.js', 'no-index'],
    [{ getNode: () => { throw new Error('boom'); } }, 'src/a.js', 'no-index'],
    [{}, 'src/data.txt', 'no-index'], // a file the index does not hold (litectx indexes code, not .txt)
    [{ getNode: () => ({ chunks: [{ symbol: null, startLine: 0, endLine: 5 }] }) }, 'src/a.js', 'no-named-chunks'],
    // the index is older than the file: a named chunk ends past the file's end
    [{ getNode: () => ({ chunks: [{ symbol: 'gone', startLine: 10, endLine: 9999 }] }) }, 'src/a.js', 'stale-index'],
  ];
  for (const [over, rel, reason] of cases) {
    const { read, events } = shimFor(r, over);
    const p = join(r.dir, rel);
    assert.equal(await read.execute({ path: p }), readFileSync(p, 'utf8'), `${reason}: whole file`);
    assert.deepEqual(events, [{ type: 'read-map-skip', data: { path: rel, reason } }]);
  }
});

test('an off shim arm serves no map even with readMap given', async (t) => {
  const r = await repo(t, { 'src/a.js': manyFns(80) });
  const events = [];
  const shim = createReadShim({ arm: readShimArm(false), readMap: { root: r.dir, hasGet: true, getNode: (rel) => r.lc.getNode(rel), emit: (ty, d) => events.push(ty) } });
  const p = join(r.dir, 'src/a.js');
  assert.equal(await shim.wrapRead(rawRead()).execute({ path: p }), readFileSync(p, 'utf8'));
});

test('$0 check: every range in the map opens with the real ctx_get (no no-chunk), on a real class file', async (t) => {
  const r = await repo(t, { 'src/evaluator.js': readFileSync(new URL('./fixtures/readmap/evaluator.js.txt', import.meta.url), 'utf8') });
  const { read } = shimFor(r);
  const map = await read.execute({ path: join(r.dir, 'src/evaluator.js') });
  assert.match(map, /map, not the file/);
  const ranges = [...map.matchAll(/^(\S+) (\d+)-(\d+)$/gm)].map((m) => ({ sym: m[1], s: Number(m[2]), e: Number(m[3]) }));
  assert.ok(ranges.length >= 3, `${ranges.length} parts`);
  /** @type {any[]} */
  const ev = [];
  const get = createCtxTools(r.lc, r.dir, (ty, d) => ev.push(d)).find((x) => x.name === 'ctx_get');
  for (const { sym, s, e } of ranges) {
    const out = await get.execute({ path: 'src/evaluator.js', startLine: s, endLine: e });
    assert.ok(!/^no chunk/.test(out) && out.length > 0, `${sym} ${s}-${e} opens`);
  }
  assert.equal(ev.filter((x) => x.outcome === 'no-chunk').length, 0);
  assert.equal(ev.filter((x) => x.outcome === 'ok').length, ranges.length);
});

test('buildReadMap: pure, deterministic, sorted by start line', () => {
  const chunks = [
    { symbol: 'b', startLine: 20, endLine: 25 }, { symbol: 'a', startLine: 1, endLine: 5 }, { symbol: null, startLine: 6, endLine: 9 },
    { symbol: 'outer', startLine: 0, endLine: 30 },
  ];
  const m = buildReadMap({ rel: 'x.js', lines: 300, chunks });
  assert.ok(m);
  assert.deepEqual(m.text.split('\n').filter((l) => /^\w+ \d+-\d+$/.test(l)), ['a 1-5', 'b 20-25']);
  assert.equal(m.symbols, 2);
  assert.equal(buildReadMap({ rel: 'x.js', lines: 300, chunks: [] }), null);
});

// ── the spec field ────────────────────────────────────────────────────────

const baseJob = () => ({
  schema: 'job-v1', job: 'rm', description: 'd', provider: 'anthropic-api', cadence: { unit: 'day', every: 1 }, budgetUsd: 1.5,
  writeScope: ['src/**'], goal: 'g', verdictType: 'green', close: 'node -e "process.exit(0)"', tools: ['read', 'get'], escalation: { mode: 'decision-ready' },
});

test('readMap is a boolean or nothing; true changes the signed hash, absent does not; a non-boolean reds', () => {
  const absent = validateJob(baseJob(), { shellCapUsd: 1.5 });
  assert.ok(!absent.reds.some((x) => /readMap/.test(JSON.stringify(x))));
  for (const bad of ['yes', 1, null, {}]) {
    const v = validateJob({ ...baseJob(), readMap: bad }, { shellCapUsd: 1.5 });
    assert.ok(v.reds.some((x) => /readMap/.test(JSON.stringify(x)) && /invalid-value/.test(JSON.stringify(x))), `${JSON.stringify(bad)} reds`);
  }
  const on = validateJob({ ...baseJob(), readMap: true }, { shellCapUsd: 1.5 });
  assert.ok(!on.reds.some((x) => /readMap/.test(JSON.stringify(x))));
  assert.notEqual(jobSpecHash({ ...baseJob(), readMap: true }), jobSpecHash(baseJob()));
  assert.equal(jobSpecHash({ ...baseJob() }), jobSpecHash(baseJob()));
});

// ── the call site: a real runPlan with the shim at its product arm ──────────────────────────────────────────────────

import { execFileSync } from 'node:child_process';
import { runPlan } from '../src/planrun.js';
import { scriptedProvider, patientGitEnv } from './helpers.js';
import { tcall, makePatient, JOB, PLAN, collector } from './planrun-fixtures.js';

const toolResults = (provider) => [...new Set(provider.messagesLog)].flatMap((m) => m).filter((x) => x.role === 'tool' || (Array.isArray(x.content) && x.content.some?.((c) => c.type === 'tool_result')));

async function planRead(t, { readMap, stepTools, readShim = 'cap' }) {
  const wd = makePatient(t);
  writeFileSync(join(wd, 'src', 'big.mjs'), manyFns(80));
  execFileSync('git', ['add', 'src/big.mjs'], { cwd: wd, env: patientGitEnv() });
  execFileSync('git', ['commit', '-q', '-m', 'big'], { cwd: wd, env: patientGitEnv() });
  const step = { id: 'write-test', action: 'Read src/big.mjs, write tests/test_x.mjs.', tools: stepTools, rounds: 6, target: 'tests/test_x.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }] };
  const provider = scriptedProvider([
    { text: 'scout notes' }, { text: PLAN(wd, [step]) },
    { toolCalls: [tcall('r1', 'shell_read', { path: join(wd, 'src', 'big.mjs') })] },
    { toolCalls: [tcall('r2', 'shell_read', { path: join(wd, 'src', 'big.mjs') })] },
    { toolCalls: [tcall('w1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — x\n' })] },
    { text: 'done' },
  ]);
  const jv = validateJob(JOB(wd, { tools: ['read', 'write', 'recall', 'get'], ...(readMap !== undefined ? { readMap } : {}) }));
  assert.deepEqual(jv.reds, []);
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 2, remainingUsd: () => 1.5, readShim });
  return { wd, provider, events, outcome };
}
const msgText = (provider) => JSON.stringify([...new Set(provider.messagesLog)]);

test('runPlan, readMap on and ctx_get granted: the first read is the map, the second the file; a read-map record, no skip', async (t) => {
  const { provider, events, outcome } = await planRead(t, { readMap: true, stepTools: ['read', 'recall', 'get', 'write'] });
  assert.equal(outcome, 'green', JSON.stringify(events.filter((e) => /red|valid|plan/.test(e.type)).slice(0, 3)).slice(0, 1500));
  const txt = msgText(provider);
  assert.match(txt, /src\/big\.mjs \(320 lines\) — map, not the file:/);
  assert.match(txt, /export function fn79\(a\)/, 'the second read delivered the file');
  const recs = events.filter((e) => e.type === 'read-map');
  assert.equal(recs.length, 1);
  assert.deepEqual({ path: recs[0].path, lines: recs[0].lines, symbols: recs[0].symbols }, { path: 'src/big.mjs', lines: 320, symbols: 80 });
  assert.equal(events.filter((e) => e.type === 'read-map-skip').length, 0);
});

test('runPlan, readMap absent: byte-identical reads (no map text, no read-map records)', async (t) => {
  const { provider, events } = await planRead(t, { stepTools: ['read', 'recall', 'get', 'write'] });
  assert.ok(!msgText(provider).includes('map, not the file'));
  assert.equal(events.filter((e) => e.type === 'read-map' || e.type === 'read-map-skip').length, 0);
});

// the capping arms force recall+get onto any step granting read (G1), so a step without ctx_get is reachable on the diff-only arm
test('runPlan, readMap on but the step lacks ctx_get: no map, a read-map-skip no-ctx_get record', async (t) => {
  const { provider, events } = await planRead(t, { readMap: true, stepTools: ['read', 'write'], readShim: 'diff' });
  assert.ok(!msgText(provider).includes('map, not the file'));
  const skips = events.filter((e) => e.type === 'read-map-skip');
  assert.ok(skips.some((e) => e.reason === 'no-ctx_get' && e.path === 'src/big.mjs'), JSON.stringify(skips));
  assert.equal(events.filter((e) => e.type === 'read-map').length, 0);
});

test('runPlan, readMap on but the read shim off: no map, one read-map-skip shim-off record', async (t) => {
  const { provider, events } = await planRead(t, { readMap: true, stepTools: ['read', 'write'], readShim: false });
  assert.ok(!msgText(provider).includes('map, not the file'));
  assert.ok(events.some((e) => e.type === 'read-map-skip' && e.reason === 'shim-off'));
});
