// N2 module 2b POC — tool-mode containment, token-free (NEVER ships; the finding does).
// Machinery negatives drive the REAL code path (PRD v1.7 §2a): real bare-agent Loop,
// real bareguard Gate, real createShellTools — only the provider is a script.
// Riskiest assumptions under test (design addendum 2026-07-12b):
//   A. the actionTranslator is load-bearing: an in-scope shell_write lands on disk;
//      an out-of-scope shell_write is DENIED through the Loop's policy path, the file
//      never exists, and the deny reason reaches the model verbatim
//   B. WITHOUT the translator (default identity translation) the same out-of-scope
//      write sails through — proving the wiring is the fence, not the tools
//   C. denial streak: a worker hammering a denied path stops cleanly
//      (error 'denied:shell_write'), never burning rounds to the cap
//   D. readScope: shell_read outside the workdir is denied (secrets never enter the
//      worker's context via a stray read), inside is served
//   E. pricing carries over: tool rounds price like text rounds; an unpriced round
//      surfaces as metrics.costUsd null / unpricedRounds > 0, never $0 (F6)
//   F. relative-path confound: a relative path resolves against process.cwd() (the
//      tool's own semantics) — the translator must resolve the SAME way or containment
//      and execution disagree about which file is meant
// Run: node poc/n2-tool-middle.mjs   (exit 0 = all scenarios hold)

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { Gate } from 'bareguard';

const require = createRequire(import.meta.url);
const { Loop, wireGate } = require('bare-agent');
const { createShellTools } = require('bare-agent/tools');

const base = mkdtempSync(join(tmpdir(), 'n2-2b-poc-'));

// ---- the translator under test (the module's load-bearing line) ----
// Mirrors the shell tools' own path semantics (path.resolve(expandHome(p))) so the
// gate judges the SAME file the tool would touch.
const expandHome = (p) => (p === '~' || p.startsWith('~/')) ? join(homedir(), p.slice(1)) : p;
const actionTranslator = (name, args) => {
  if (name === 'shell_write') return { type: 'write', path: resolve(expandHome(args.path)), args: { bytes: (args.content ?? '').length } };
  if (name === 'shell_read' || name === 'shell_grep') return { type: 'read', path: resolve(expandHome(args.path)) };
  return { type: name, args };
};

// scripted provider: each generate() shifts the next response; tool rounds then a
// final text round. costUsd rides per-round from the script (undefined = unpriced).
function scriptedProvider(rounds) {
  let i = 0;
  return {
    async generate() {
      const r = rounds[Math.min(i++, rounds.length - 1)];
      return { text: r.text ?? '', toolCalls: r.toolCalls ?? [], usage: { inputTokens: 10, outputTokens: 10 }, costUsd: r.costUsd, model: r.model ?? null };
    },
  };
}

const tc = (id, name, args) => ({ id, name, arguments: args });

async function makeRun(name, { rounds, translator = actionTranslator, maxConsecutiveDenials = 3 }) {
  const workdir = join(base, name);
  mkdirSync(join(workdir, 'src'), { recursive: true });
  writeFileSync(join(workdir, 'src', 'existing.txt'), 'known-answer\n');
  const gate = new Gate({
    fs: { writeScope: [join(workdir, 'src')], readScope: [workdir] },
    budget: { maxCostUsd: 1 },
    limits: { maxTurns: 20 },
    audit: { path: join(workdir, 'gate-audit.jsonl') },
    humanChannel: async () => ({ decision: 'terminate' }),
  });
  await gate.init();
  const { policy, onLlmResult } = wireGate(gate, translator ? { actionTranslator: translator } : {});
  const loop = new Loop({ provider: scriptedProvider(rounds), policy, onLlmResult, maxConsecutiveDenials });
  const result = await loop.run([{ role: 'user', content: 'work' }], createShellTools().tools);
  return { workdir, result };
}

// ---- A. in-scope write lands; out-of-scope write denied through the policy path ----
{
  const inScope = (wd) => join(wd, 'src', 'made.txt');
  const outScope = (wd) => join(wd, 'escape.txt'); // inside workdir but OUTSIDE writeScope
  const wd = join(base, 'a');
  const { workdir, result } = await makeRun('a', {
    rounds: [
      { toolCalls: [tc('t1', 'shell_write', { path: inScope(wd), content: 'ok\n' })], costUsd: 0.001 },
      { toolCalls: [tc('t2', 'shell_write', { path: outScope(wd), content: 'nope\n' })], costUsd: 0.001 },
      { text: 'done', costUsd: 0.001 },
    ],
  });
  assert.equal(result.error, null);
  assert.equal(readFileSync(join(workdir, 'src', 'made.txt'), 'utf8'), 'ok\n', 'A: in-scope write must land');
  assert.ok(!existsSync(join(workdir, 'escape.txt')), 'A: denied write must never touch disk');
  const denyMsg = result.msgs.find((m) => m.role === 'tool' && m.tool_call_id === 't2');
  assert.ok(denyMsg && /writeScope/.test(denyMsg.content), `A: deny reason must reach the model (got: ${denyMsg?.content})`);
  console.log('A holds: in-scope lands, out-of-scope denied via policy, reason fed back');
}

// ---- B. WITHOUT the translator the same escape sails through (the wiring IS the fence) ----
{
  const wd = join(base, 'b');
  const { workdir, result } = await makeRun('b', {
    translator: null, // wireGate default: {type: toolName, ...} — never trips fs.writeScope
    rounds: [
      { toolCalls: [tc('t1', 'shell_write', { path: join(wd, 'escape.txt'), content: 'leaked\n' })], costUsd: 0.001 },
      { text: 'done', costUsd: 0.001 },
    ],
  });
  assert.equal(result.error, null);
  assert.ok(existsSync(join(workdir, 'escape.txt')), 'B: without the translator the escape MUST land (else the translator is not load-bearing and the design note is wrong)');
  console.log('B holds: default translation bypasses the fence — the actionTranslator is load-bearing');
}

// ---- C. denial streak stops the loop cleanly ----
{
  const wd = join(base, 'c');
  const esc = (n) => tc(`t${n}`, 'shell_write', { path: join(wd, `escape-${n}.txt`), content: 'x' });
  const { workdir, result } = await makeRun('c', {
    rounds: [
      { toolCalls: [esc(1), esc(2), esc(3)], costUsd: 0.001 },
      { text: 'should never be reached', costUsd: 0.001 },
    ],
  });
  assert.equal(result.error, 'denied:shell_write', `C: streak must short-circuit (got error=${result.error})`);
  assert.ok(!existsSync(join(workdir, 'escape-1.txt')), 'C: nothing written');
  console.log('C holds: 3 consecutive denials return denied:shell_write, no cap burn');
}

// ---- D. readScope: outside denied, inside served ----
{
  const wd = join(base, 'd');
  const { result } = await makeRun('d', {
    rounds: [
      { toolCalls: [tc('t1', 'shell_read', { path: '/etc/hostname' })], costUsd: 0.001 },
      { toolCalls: [tc('t2', 'shell_read', { path: join(wd, 'src', 'existing.txt') })], costUsd: 0.001 },
      { text: 'done', costUsd: 0.001 },
    ],
  });
  const outside = result.msgs.find((m) => m.role === 'tool' && m.tool_call_id === 't1');
  const inside = result.msgs.find((m) => m.role === 'tool' && m.tool_call_id === 't2');
  assert.ok(/readScope/.test(outside.content), `D: outside read must red on fs.readScope (got: ${outside.content})`);
  assert.ok(/known-answer/.test(inside.content), 'D: inside read must return real content');
  console.log('D holds: readScope denies /etc/hostname, serves the workdir file');
}

// ---- E. pricing: tool rounds price like text rounds; unpriced is never $0 (F6) ----
{
  const wd = join(base, 'e1');
  // all-unpriced: costUsd undefined + model null (no pricing-table fallback)
  const { result: r1 } = await makeRun('e1', {
    rounds: [
      { toolCalls: [tc('t1', 'shell_read', { path: join(wd, 'src', 'existing.txt') })] },
      { text: 'done' },
    ],
  });
  assert.equal(r1.metrics.costUsd, null, `E: all-unpriced run must report costUsd null, never 0 (got ${r1.metrics.costUsd})`);
  assert.ok(r1.metrics.unpricedRounds >= 2, `E: unpricedRounds must count (got ${r1.metrics.unpricedRounds})`);
  // partially-unpriced: one priced tool round + one unpriced final round
  const wd2 = join(base, 'e2');
  const { result: r2 } = await makeRun('e2', {
    rounds: [
      { toolCalls: [tc('t1', 'shell_read', { path: join(wd2, 'src', 'existing.txt') })], costUsd: 0.002 },
      { text: 'done' },
    ],
  });
  assert.equal(r2.metrics.costUsd, 0.002, 'E: priced rounds sum');
  assert.equal(r2.metrics.unpricedRounds, 1, `E: the unpriced round must stay visible (got ${r2.metrics.unpricedRounds})`);
  assert.equal(r2.metrics.toolCalls, 1);
  console.log('E holds: costUsd null when nothing priced; partial under-count visible via unpricedRounds');
}

// ---- F. relative-path confound: tool resolves against process.cwd(); translator must agree ----
{
  // A relative path from the model resolves NOWHERE near the workdir (cwd is the repo).
  // The translator resolves the same way the tool does, so the gate denies it — the
  // fence and the executor agree about which file is meant.
  const { result } = await makeRun('f', {
    rounds: [
      { toolCalls: [tc('t1', 'shell_write', { path: 'src/relative-escape.txt', content: 'x' })], costUsd: 0.001 },
      { text: 'done', costUsd: 0.001 },
    ],
  });
  const deny = result.msgs.find((m) => m.role === 'tool' && m.tool_call_id === 't1');
  assert.ok(/writeScope/.test(deny.content), `F: relative path resolved against cwd must red (got: ${deny.content})`);
  assert.ok(!existsSync(resolve('src/relative-escape.txt')), 'F: nothing written into the repo');
  console.log('F holds: relative paths resolve against cwd and red — worker must be told to use absolute paths');
}

console.log('\nAll 6 scenarios hold. base:', base);
