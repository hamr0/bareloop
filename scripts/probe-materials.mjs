// Probe driver for the materials/metering probe set — T2 · P1 · U0(b).
// Frozen design: docs/02-experiments/MATERIALS-PREREG.md (commit 2eb9365). Draft-only:
// every arm is ONE plan-drafting call, no execution, no close, no check.
//
// FIDELITY (stated, not assumed):
// - The PROMPT is the shipped `planPrompt` imported from src/planrun.js — never a copy.
//   (The N3 pre-probe used a verbatim copy; it was diffed against source this session and
//   found identical, so F51–F55 stand — but a copy is a fixture and this driver does not
//   take that risk.)
// - The VALIDATOR is the shipped `validatePlan`.
// - The SCOUT is a mirror of planrun's scout config (read-only menu, 8 rounds, same
//   instruction text), not the shipped function. It is run ONCE and the SAME blob is fed to
//   every arm, so any drift is a constant held equal across the contrast and cannot bias it.
//
// BA-18: the stale-socket guard is carried over from run-screen-types.mjs. It lives in the
// harness, never the library, so every new driver must re-wire it (F57 operational note).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { Gate } from 'bareguard';
import { LiteCtx } from 'litectx';
import { planPrompt } from '../src/planrun.js';
import { validatePlan } from '../src/plan.js';
import { TOOL_BY_VERB, PERSONA_TOOLS, RETRIEVAL_STRATEGY, createCtxTools } from '../src/interpret.js';
import { extractArtifact } from '../src/text.js';

const require = createRequire(import.meta.url);
const { Loop, wireGate } = require('bare-agent');
const { createShellTools } = require('bare-agent/tools');
const { AnthropicProvider } = require('bare-agent/providers');

const dry = process.argv.includes('--dry');
const N = Number((process.argv.find((a) => a.startsWith('--n=')) ?? '--n=3').slice(4));
const HARD_STOP_USD = 2.5;          // the frozen ceiling — the driver refuses to exceed it
const MODEL = 'claude-sonnet-5';    // frozen model rule: existing scaffolding runs on sonnet
const MAX_STEP_ROUNDS = 40;
const SCOUT_ROUNDS = 8;
const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/litectx-types';
const OUT_DIR = '/home/hamr/PycharmProjects/bareloop/docs/02-experiments';
const SCOUT_CACHE = '/tmp/claude-1000/-home-hamr-PycharmProjects-bareloop/768e1b72-ef13-4b1f-ba18-b332792c7608/scratchpad/probe-scout.txt';
const CALL_TIMEOUT_MS = 240_000;

const job = JSON.parse(readFileSync(new URL('../jobs/litectx-types-screen-c.json', import.meta.url), 'utf8'));

// ── the meter: every provider call's cost accumulates here; the ceiling is checked BEFORE
// each call, so the driver stops rather than discovering an overrun afterwards.
let spent = 0;
let calls = 0;
let unpricedRounds = 0;
let timeoutRetries = 0;
const assertBudget = (what) => {
  if (spent >= HARD_STOP_USD) throw new Error(`probe HARD STOP: $${spent.toFixed(4)} of $${HARD_STOP_USD} before ${what}`);
};

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!dry && !apiKey) { console.error('ANTHROPIC_API_KEY not set'); process.exit(2); }

const baseProvider = dry
  ? /** @type {any} */ ({ async generate() { throw new Error('DRY: provider called — a dry run must spend nothing'); } })
  : new AnthropicProvider({ apiKey, model: MODEL });

// ── BA-18 stale-socket guard (harness-side, touches no arbiter surface). AnthropicProvider
// sets no request timeout and withRetry has no call sites, so a dead socket hangs until the
// OS TCP timeout (38min–2h24m measured). One bounded retry on a fresh call.
async function generateWithTimeout(/** @type {any[]} */ ...args) {
  for (let attempt = 0; ; attempt++) {
    let timer;
    try {
      return await Promise.race([
        baseProvider.generate(...args),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`harness: generate() exceeded ${CALL_TIMEOUT_MS}ms — presumed stale socket`)), CALL_TIMEOUT_MS); }),
      ]);
    } catch (e) {
      if (attempt >= 1 || !String(e?.message ?? '').includes('presumed stale socket')) throw e;
      timeoutRetries++;
    } finally { clearTimeout(timer); }
  }
}
const provider = dry ? baseProvider : new Proxy(baseProvider, {
  get(t, prop, r) { return prop === 'generate' ? generateWithTimeout : Reflect.get(t, prop, r); },
});

// ── one worker, mirroring planrun's mkWorker for the axes that matter here
async function mkWorker({ granted, rounds, label }) {
  const auditPath = join(WORKDIR, `.probe-audit-${label}.jsonl`);
  const gate = new Gate({
    fs: { writeScope: [], readScope: [WORKDIR], deny: [join(WORKDIR, '.litectx')] },
    budget: { maxCostUsd: Math.max(HARD_STOP_USD - spent, 0.0001) },
    limits: { maxTurns: rounds * 2 },
    audit: { path: auditPath },
    humanChannel: async () => ({ decision: 'terminate' }),
  });
  await gate.init();
  const grantedNames = new Set(granted.map((v) => TOOL_BY_VERB[v]));
  const shell = createShellTools().tools.filter((t) => grantedNames.has(t.name));
  const lc = new LiteCtx({ root: WORKDIR });
  const ctx = ['ctx_recall', 'ctx_get'].some((t) => grantedNames.has(t))
    ? createCtxTools(lc, WORKDIR, () => ({})).filter((t) => grantedNames.has(t.name)) : [];
  if (ctx.length) await lc.index();
  const toolDefs = [...shell, ...ctx];
  // per-attempt round bound via loop.stop() — the F20 pattern, mirrored from planrun
  let roundsSoFar = 0;
  const meter = async (arg) => {
    if ((arg?.kind ?? 'turn') === 'turn') {
      calls++;
      roundsSoFar += 1;
      if (typeof arg?.costUsd === 'number') spent += arg.costUsd;
      else unpricedRounds += 1;               // F6: unknown is never laundered to $0
      if (roundsSoFar >= rounds) loop.stop();
    }
    return onLlmResult(arg);
  };
  const { policy, onLlmResult } = wireGate(gate);
  const loop = new Loop({ provider, system: PERSONA_TOOLS + (ctx.length ? RETRIEVAL_STRATEGY : ''), policy, onLlmResult: meter });
  return async (prompt, defs = toolDefs) => loop.run(
    [{ role: 'user', content: prompt }], defs, { cacheMessages: true, maxTokens: 32000 },
  );
}

// ── phase 0: ONE scout, cached — the constant every arm shares
async function getScout() {
  if (existsSync(SCOUT_CACHE)) return readFileSync(SCOUT_CACHE, 'utf8');
  assertBudget('scout');
  const ask = await mkWorker({ granted: ['read', 'grep', 'recall', 'get'], rounds: SCOUT_ROUNDS, label: 'scout' });
  const r = await ask([
    'Survey this repository READ-ONLY for the goal below. Report: the relevant layout, the key files and symbols, and your best hypothesis about what the work requires. Be concise — your notes brief a planner that cannot see the repository.',
    `Repository root (absolute): ${WORKDIR}\nEvery path you pass to a tool MUST be absolute and inside this root.`,
    `Goal:\n${job.goal}`,
  ].join('\n\n'));
  const blob = (r.text ?? '').slice(0, 8000);
  mkdirSync(SCOUT_CACHE.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(SCOUT_CACHE, blob);
  return blob;
}

// ── the arm prompts ─────────────────────────────────────────────────────────
// T2-B: the bill of materials + T1's measured exchange rate (F57).
const MATERIALS = `

Materials for this run — allocate them across your steps:
- money: $${job.budgetUsd.toFixed(2)} total. A worker round costs about $0.019, so the run affords roughly ${Math.round(job.budgetUsd / 0.019)} rounds of work in total.
- time: 45 minutes total. A worker round takes about 5.4 seconds of model time, and the verification between attempts adds 4-30 seconds each time, so the run affords roughly 300 rounds within the time budget.
Your per-step "rounds" numbers spend BOTH budgets. The run stops when either runs out, wherever it has got to. Allocate so the LAST step still has materials left to work with.`;

// P1-B: the four-component catalog, one line each, no strategy advice.
const CATALOG = `

The verbs available to a step come from four families:
- read — open a file. grep — search the tree. write — replace a file. edit — exact-once anchored replace.
- Select: recall — ask the index where a symbol lives (returns pointers). impact — what depends on this symbol.
- Compress: assemble — build a context bundle from pointers. compress — reduce held context to a level (verbatim/signature/drop). summaryWindow — keep a rolling summary instead of full history.
- Isolate: stash — put findings aside under a key. peek — look at a stashed key without loading it. evict — drop something from context. scope — restrict what a step can see.`;

const ONE_SENTENCE = `Repository root: ${WORKDIR}. Make this JavaScript library pass "tsc --noEmit --strict" with no type errors, without breaking its test suite and without suppressing anything.`;

async function draft(spec, extra, label) {
  assertBudget(label);
  const ask = await mkWorker({ granted: [], rounds: 2, label });
  const prompt = planPrompt(spec, SCOUT, null, MAX_STEP_ROUNDS, null) + (extra ?? '');
  const r = await ask(prompt, []);
  const code = extractArtifact(r.text).code ?? '';
  const pv = validatePlan(code, { job: spec, maxStepRounds: MAX_STEP_ROUNDS });
  let plan = null;
  try { plan = JSON.parse(code); } catch { /* unparseable — recorded as such */ }
  return { label, ok: pv.ok, reds: pv.reds, plan, raw: code.slice(0, 4000) };
}

const SCOUT = await getScout();
console.log(`scout blob ${Buffer.byteLength(SCOUT)} bytes | spent $${spent.toFixed(4)}`);

const TWELVE = ['read', 'grep', 'write', 'edit', 'recall', 'get', 'impact', 'assemble', 'compress', 'summaryWindow', 'stash', 'peek', 'evict', 'scope'];
const rows = [];
for (let i = 0; i < N; i++) {
  // CONTROL is shared by T2-A and P1-A — an identical condition, run once (stated in the report)
  rows.push(await draft(job, null, `control-${i + 1}`));
  rows.push(await draft(job, MATERIALS, `T2B-materials-${i + 1}`));
  rows.push(await draft({ ...job, tools: TWELVE }, CATALOG, `P1B-catalog-${i + 1}`));
  rows.push(await draft({ ...job, goal: ONE_SENTENCE }, null, `U0B-onesentence-${i + 1}`));
  console.log(`round ${i + 1}/${N} done | calls ${calls} | spent $${spent.toFixed(4)}`);
}

const runid = process.env.PROBE_RUNID ?? String(Date.now().toString(36));
const out = join(OUT_DIR, `materials-probe-${runid}.json`);
writeFileSync(out, JSON.stringify({ runid, model: dry ? null : MODEL, n: N, spentUsd: spent, calls, timeoutRetries, unpricedRounds, scoutBytes: Buffer.byteLength(SCOUT), rows }, null, 2));
console.log(`\nwrote ${out}\nspent $${spent.toFixed(4)} of $${HARD_STOP_USD} | ${calls} calls | ${timeoutRetries} timeout retries`);
