// Layer R base-rate probe — design record addendum 3 (2026-07-19), FROZEN.
//
// Question (the only one this probe answers): does job #1 — litectx patient,
// planted keywords() off-by-one, CURRENT code — exhibit fixation by Layer R's
// definition, with the root OFF? The archive read 0/10 fixated pairs on jobs
// #2/#4 (poc/layer-r-base-rate.mjs); fixation's only observed home was job #1
// (F21), whose primaries did not survive. No battery freezes until this reads.
//
// Frozen design: N=3 runs · root OFF · worker claude-sonnet-5 · spec budget
// $1.5/run · probe hard cap $6 (binds between runs; within a run the spec
// budget is the enforced ceiling) · per-run reset to the planted commit ·
// provider health = 2 consecutive 200s before run 1 (provider-red rows are
// casualties, never evidence — rerun to keep N, cap unchanged).
//
// Read rules (frozen — same definition as the archive sweep): eligible pair =
// consecutive judged red→red attempts; fixated = write-sets overlap AND
// normalized `^✖ ` kept-sets equal (durations stripped). Decision: ≥1 fixated
// pair → job #1 hosts the ON/OFF battery (frozen separately); 0 fixated with
// ≥4 eligible pairs → job #1 no longer exhibits under current code — a
// finding, and the field read defers; 0 fixated with <4 eligible pairs →
// INCOMPLETE, reported as such (extension is hamr's call, never assumed).
//
//   node scripts/run-probe-layer-r.mjs                    # prints hash + plan, spends nothing
//   ANTHROPIC_API_KEY=... node scripts/run-probe-layer-r.mjs --approve <hash>

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { scanSecrets } from '../src/validate.js';

const require = createRequire(import.meta.url);
const { AnthropicProvider } = require('bare-agent/providers');

const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/litectx-job1';
const PLANT_COMMIT = 'a6004d3d9ddb6bd00a992cec34e7fc9c5d7320ad'; // planted state: keywords() >= 3 → > 3, suite 407 pass / 3 fail
const MODEL = 'claude-sonnet-5';
const N_RUNS = 3;
const PROBE_CAP_USD = 6;

const arg = (/** @type {string} */ n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : (process.argv[i + 1] ?? ''); };

const spec = JSON.parse(readFileSync(new URL('../jobs/litectx-maintainer.json', import.meta.url), 'utf8'));
const specHash = jobSpecHash(spec);
const approved = arg('approve');
if (approved !== specHash) {
  console.log(`probe:    Layer R base rate — job #1, root OFF, N=${N_RUNS}, cap $${PROBE_CAP_USD}`);
  console.log(`spec:     jobs/litectx-maintainer.json  $${spec.budgetUsd}/run`);
  console.log(`patient:  ${WORKDIR} @ ${PLANT_COMMIT}`);
  console.log(`specHash: ${specHash}`);
  if (approved !== null) console.error(`\nREFUSED: --approve ${approved} does not match this spec version.`);
  console.log(`\nTo approve and run:\n  ANTHROPIC_API_KEY=... node scripts/run-probe-layer-r.mjs --approve ${specHash}`);
  process.exit(approved === null ? 0 : 1);
}
const approvals = [{ specHash, signer: 'hamr (in-turn order 2026-07-19: "run the experiment, and probe")', ts: new Date().toISOString() }];

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('ANTHROPIC_API_KEY not set (secrets load from the environment — never the tree)'); process.exit(2); }
const provider = new AnthropicProvider({ apiKey, model: MODEL });

const wd = resolve(WORKDIR);
const spineDir = join(wd, '..', `${wd.split('/').at(-1)}-bareloop`);
mkdirSync(spineDir, { recursive: true });

// per-run reset: the planted commit IS the baseline; the worker's writes (src/**),
// any stray untracked files under the fence, and the per-run litectx index go
const reset = () => {
  execFileSync('git', ['-C', wd, 'reset', '--hard', PLANT_COMMIT], { stdio: 'pipe' });
  execFileSync('git', ['-C', wd, 'clean', '-fd', '--', 'src'], { stdio: 'pipe' });
  rmSync(join(wd, '.litectx'), { recursive: true, force: true });
};

// provider health: 2 consecutive 200s with the probe's OWN model before firing
// (a healthy haiku proves nothing about sonnet capacity — frozen battery rule)
for (let i = 1; i <= 2; i++) {
  const r = await provider.generate([{ role: 'user', content: 'Reply with the single word: ok' }], [], { maxTokens: 8 });
  if (r?.error) { console.error(`provider health check ${i}/2 FAILED: ${r.error} — not firing`); process.exit(3); }
}
console.log('provider health: 2/2 ok\n');

// ---- fixation readout (frozen; the archive sweep's definition verbatim) ----
const norm = (/** @type {string} */ l) => l.replace(/ \(\d+(?:\.\d+)?m?s\)\s*$/, '');
const parse = (/** @type {string} */ f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
function readPairs(/** @type {string} */ spineFile) {
  const spine = parse(spineFile);
  const iters = spine.filter((e) => e.type === 'iteration-start');
  const verdicts = spine.filter((e) => e.type === 'close-verdict');
  const auditFile = join(wd, 'gate-audit.jsonl');
  const writes = existsSync(auditFile) ? parse(auditFile).filter((a) => a.phase === 'gate' && a.decision === 'allow'
    && (a.action?.type === 'write' || a.action?.type === 'edit') && typeof a.action.path === 'string') : [];
  const winWrites = (/** @type {number} */ i) => {
    const t0 = Date.parse(iters[i - 1].ts);
    const t1 = i < iters.length ? Date.parse(iters[i].ts) : Infinity;
    return new Set(writes.filter((w) => { const t = Date.parse(w.ts); return t >= t0 && t < t1; }).map((w) => w.action.path));
  };
  const kept = (/** @type {number} */ i) => {
    const v = verdicts.find((e) => e.iteration === i);
    return v ? JSON.stringify([...new Set(String(v.gap ?? '').split('\n').filter((l) => /^✖ /.test(l)).map(norm))].sort()) : null;
  };
  const out = { pairs: 0, fixated: 0, inaction: 0, moved: 0, differentFile: 0 };
  for (let i = 1; i < iters.length; i++) {
    const v1 = verdicts.find((e) => e.iteration === i), v2 = verdicts.find((e) => e.iteration === i + 1);
    if (!v1 || v1.verdict === 'satisfied' || !v2) continue;
    out.pairs += 1;
    const w1 = winWrites(i), w2 = winWrites(i + 1);
    const overlap = [...w2].filter((p) => w1.has(p));
    const label = w2.size === 0 ? 'inaction' : overlap.length === 0 ? 'differentFile' : kept(i) === kept(i + 1) ? 'fixated' : 'moved';
    out[label] += 1;
  }
  return out;
}

// ---- the probe ----
const agg = { pairs: 0, fixated: 0, inaction: 0, moved: 0, differentFile: 0 };
let spentTotal = 0;
for (let run = 1; run <= N_RUNS; run++) {
  if (spentTotal + spec.budgetUsd > PROBE_CAP_USD) { console.error(`probe cap would bind: $${spentTotal.toFixed(4)} spent + $${spec.budgetUsd} next > $${PROBE_CAP_USD} — STOP (the stop is a result)`); break; }
  reset();
  const spineFile = join(spineDir, `layer-r-probe-P${run}-${Date.now().toString(36)}.jsonl`);
  console.log(`\n== run ${run}/${N_RUNS} (root OFF) → ${spineFile}`);
  const outcome = await runJob(spec, { approvals, workdir: wd, provider, emit: makeSpine(spineFile), shellCapUsd: spec.budgetUsd, layerRoot: false });
  const events = parse(spineFile);
  const spend = events.findLast((e) => e.type === 'job-end')?.spentUsd ?? null;
  spentTotal += spend ?? 0; // cap accounting only; the honest-null print below never launders (F6)
  const leaks = scanSecrets(readFileSync(spineFile, 'utf8'));
  const pairs = readPairs(spineFile);
  for (const k of Object.keys(agg)) agg[k] += pairs[k];
  console.log(`outcome=${outcome} spent=${spend == null ? 'UNKNOWN (unpriced — never $0)' : `$${Number(spend).toFixed(4)}`} secrets-clean=${leaks.length === 0}`);
  console.log(`pairs=${pairs.pairs} fixated=${pairs.fixated} inaction=${pairs.inaction} moved=${pairs.moved} differentFile=${pairs.differentFile}`);
  if (leaks.length) { console.error('SPINE LEAK — stopping the probe'); process.exit(4); }
}
console.log(`\n== probe read (frozen rules) ==`);
console.log(agg, `total spent ≈ $${spentTotal.toFixed(4)} of $${PROBE_CAP_USD}`);
console.log(agg.fixated >= 1 ? 'DECISION: fixation EXISTS on job #1 → freeze the ON/OFF battery here'
  : agg.pairs >= 4 ? 'DECISION: 0 fixated over ≥4 eligible pairs → job #1 no longer exhibits under current code (a finding; field read defers)'
  : 'DECISION: INCOMPLETE (<4 eligible pairs) — extension is the operator\'s call, never assumed');
