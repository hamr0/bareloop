// N2 POC #2 — the drafting probe (REAL tokens, ≤ $0.10; NEVER ships).
// The central-claim risk (design decision #3): can a model, given job #1's
// spec and a schema DESCRIPTION (menus + rules, deliberately NO copyable
// example config — the probe must be able to fail), draft a workflow config
// that validates green? Runner shape mirrored exactly: one sealed shot, reds
// fed back for ONE redraft, then stop. Green or red, the result is a finding.
//
// Run:  ANTHROPIC_API_KEY=... node poc/n2-drafting-probe.mjs
// Env:  PROBE_MODEL to override (default claude-sonnet-5)

import { createRequire } from 'node:module';
import { validateConfig, LOOP_SHAPES, SLOTS, VERBS } from '../src/validate.js';

const require = createRequire(import.meta.url);
const { AnthropicProvider } = require('bare-agent/providers');
const { COMPRESS_LEVELS, KINDS, WRITE_KINDS } = require('litectx');

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY not set — run:  ANTHROPIC_API_KEY=... node poc/n2-drafting-probe.mjs');
  process.exit(2);
}
const MODEL = process.env.PROBE_MODEL || 'claude-sonnet-5';
const CAP_USD = 0.10; // probe hard cap — two calls must stay under this

// Job #1 exactly as the PRD §6 / N1 define it — the real input, not a softball
const JOB1 = {
  schema: 'job-v1',
  job: 'litectx-maintainer',
  description: 'review -> fix -> branch -> PR on litectx; suite+lint are the hard closes; merge stays human forever',
  provider: 'anthropic-api',
  conditions: { closeVerbosity: 'counts-only' },
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**', 'test/**'],
  steps: [
    { id: 'review', close: { type: 'predicate', cmd: 'npm test', expect: 0 }, class: 'hard' },
    { id: 'fix', close: { type: 'predicate', cmd: 'npm run lint', expect: 0 }, class: 'hard' },
    { id: 'pr', close: { type: 'hitl', prompt: 'PR opened - review and merge?' }, class: 'hitl' },
  ],
  escalation: { mode: 'decision-ready' },
};

// Schema DESCRIPTION (menus + rules, no example) — the real runner's drafting
// prompt starts life here; what the probe learns about its gaps is the finding.
const REMEMBER_KINDS = WRITE_KINDS.filter((k) => k !== 'doc');
const SCHEMA_DOC = `
You are drafting a workflow config (schema "v1") for the job spec below. The config is
pure declarative JSON — it is validated by a strict schema; ANY unknown field, wrong
enum value, or out-of-bounds number is rejected. Output ONLY the JSON object, no fences,
no commentary.

Required top-level fields (no others exist):
- "schema": must be exactly "v1"
- "loop": { "shape": one of ${JSON.stringify([...LOOP_SHAPES])}, "maxIterations": optional integer 1..8 }
- "memory": { "store": must be "litectx",
    "recall": optional { "k": integer 1..20, "kinds": optional non-empty subset of ${JSON.stringify([...KINDS])} },
    "compressLevel": optional, one of ${JSON.stringify([...COMPRESS_LEVELS])} }
- "gate": { "budgetUsd": number, 0 < n <= the ceiling you are given, "writeScope": array of path-prefix globs like "src/**" }
- "escalation": { "mode": must be "decision-ready" }
- "hooks": optional; keys from ${JSON.stringify([...SLOTS])}, each an array of ops.
  Each op is { "op": one of ${JSON.stringify([...VERBS])}, ...params }. STRICT slot legality:
  "recall" (params: optional "k", "kinds") and "compress" (param: optional "level") are legal
  ONLY in "before-attempt"; "stash" (no params) ONLY in "after-red"; "remember"
  (param: optional "kind", one of ${JSON.stringify(REMEMBER_KINDS)}) ONLY in "on-green".

Hard constraints from the job spec (violations are rejected):
- Every writeScope entry must fit INSIDE the job's writeScope (${JSON.stringify(JOB1.writeScope)}).
  No "..", no absolute paths, no mid-path wildcards ("src/*/x/**" is illegal; "src/**" is legal).
- gate.budgetUsd must be <= 1.5 (the job budget is the ceiling).
- The config CANNOT contain: close commands, provider choice, retry caps, or any
  minting/inheritance claims — those belong to other layers and are rejected as unknown fields.

Job spec:
${JSON.stringify(JOB1, null, 2)}
`.trim();

const provider = new AnthropicProvider({ apiKey, model: MODEL });
let spentUsd = 0;

async function draft(reds) {
  const content = reds
    ? `${SCHEMA_DOC}\n\nYour previous draft was REJECTED with these reds (code:path):\n${JSON.stringify(reds)}\nFix every red. Output ONLY the corrected JSON object.`
    : SCHEMA_DOC;
  const r = await provider.generate([{ role: 'user', content }]);
  spentUsd += r.costUsd ?? 0;
  if (spentUsd > CAP_USD) { console.error(`probe cap blown: $${spentUsd.toFixed(4)} > $${CAP_USD}`); process.exit(1); }
  return r.text.trim().replace(/^```(json)?\n?/, '').replace(/\n?```$/, ''); // tolerate fences in the PROBE only; the runner will decide policy from this finding
}

const opts = { shellCapUsd: Math.min(2, JOB1.budgetUsd), jobWriteScope: JOB1.writeScope };

const shot1 = await draft(null);
let v = validateConfig(shot1, opts);
console.log(`shot 1: ${v.ok ? 'GREEN' : `red — ${v.reds.map((r) => `${r.code}:${r.path}`).join(', ')}`}`);
let shots = 1;

if (!v.ok) {
  const shot2 = await draft(v.reds);
  v = validateConfig(shot2, opts);
  shots = 2;
  console.log(`shot 2: ${v.ok ? 'GREEN' : `red — ${v.reds.map((r) => `${r.code}:${r.path}`).join(', ')}`}`);
}

console.log(`\nFINDING: model=${MODEL} · shots=${shots} · verdict=${v.ok ? 'GREEN' : 'RED (rung gate: drafting needs work or the stop is the result)'} · spent=$${spentUsd.toFixed(4)}`);
if (v.ok) console.log(`drafted config:\n${JSON.stringify(v.config, null, 2)}`);
process.exit(v.ok ? 0 : 1);
