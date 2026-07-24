// N3 lineage PRE-PROBE — grader (no spend; re-runnable over scratch-n3-raw.jsonl).
// Applies the FROZEN read (docs/02-experiments/N3-PREPROBE-PREREG.md §7–§8):
//   Gate 1 — does lineage MOVE the plan vs its OFF baseline?
//   Gate 2 — does it move toward the winning shape? (0..5 rubric)
//   Memorization audit — does a TARGET-arm plan echo SOURCE-only function names? (=> copying)
//   Decision: positive-control readability gate first, then verdict.
//
//   node scripts/n3-preprobe-grade.mjs [rawfile]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raw = process.argv[2] ?? fileURLToPath(new URL('../scratch-n3-raw.jsonl', import.meta.url));
const rows = readFileSync(raw, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

// Known function inventories (for aim + memorization, deterministic string-match).
const TARGET_FNS = ['assess', 'to_dict', '_detect_critical', '_score_lexical', '_score_keywords', '_score_scope',
  '_score_constraints', '_score_structure', '_score_domain', '_score_question_type', '_calculate_multiplier',
  '_calculate_confidence', '_assess_tier1_keyword', '_assess_tier2_llm', 'assess_complexity'];
const SOURCE_ONLY_FNS = ['_check_soar_cache_hit', '_check_goals_json_cache', '_configure_health_monitoring', 'execute',
  '_phase1_assess', '_phase2_retrieve', '_phase3_decompose', '_phase5_collect', '_phase6_synthesize', '_phase7_record',
  '_phase8_respond', '_execute_simple_path', '_handle_verification_failure', '_handle_decomposition_failure',
  '_handle_critical_failure', '_handle_execution_error', '_build_simple_verify_result', '_build_verify_only_result',
  '_build_cached_verify_result', '_split_large_chunk_by_sections', '_parse_soar_log', '_classify_api_error',
  '_index_conversation_log', '_inject_context_files', '_get_progress_callback', 'orchestrator.py'];
// arms whose spec is the TARGET (assess.py) — memorization audit applies to these
const TARGET_ARMS = new Set(['A0', 'Tfull', 'Tplan', 'Tlesson', 'Tcheck', 'S0', 'Sfull']);

const planText = (p) => JSON.stringify(p ?? {});
const namesHit = (p, list) => { const t = planText(p); return list.filter((fn) => t.includes(fn)); };

function features(p) {
  const steps = p?.steps ?? [];
  const writeSteps = steps.filter((s) => (s.tools ?? []).some((t) => t === 'write' || t === 'edit'));
  const exitTypes = (s) => (s.exit ?? []).map((e) => e.type + (e.name ? ':' + e.name : ''));
  const hasCleanRun = steps.some((s) => exitTypes(s).includes('check-passes:clean-run'));
  const winningPairSteps = writeSteps.filter((s) => { const e = exitTypes(s); return e.includes('check-passes:clean-run') && e.includes('tree-changed'); });
  const roundsSane = steps.length > 0 && steps.every((s) => (s.rounds ?? 0) < 40);
  const usesEdit = steps.some((s) => (s.tools ?? []).includes('edit'));
  return {
    nSteps: steps.length,
    nWriteSteps: writeSteps.length,
    hasCleanRun,                                            // rubric 1
    pairFrac: writeSteps.length ? winningPairSteps.length / writeSteps.length : 0, // rubric 2 (fraction of write steps with the winning pair)
    allPaired: writeSteps.length > 0 && winningPairSteps.length === writeSteps.length,
    roundsSane,                                             // rubric 4
    usesEdit,
  };
}

function score(row) {
  if (!row.plan || row.valid === false || row.truncated) return null;
  const f = features(row.plan);
  const aimHits = namesHit(row.plan, TARGET_FNS);           // target functions named
  const memoHits = TARGET_ARMS.has(row.arm) ? namesHit(row.plan, SOURCE_ONLY_FNS) : []; // source funcs on a target plan = copying
  // winning-shape rubric (0..5)
  const r1 = f.hasCleanRun ? 1 : 0;
  const r2 = f.allPaired ? 1 : 0;
  const r3 = f.roundsSane ? 1 : 0;               // bounded rounds (proxy for "not maxed / scoped")
  const r4 = aimHits.length >= 3 ? 1 : 0;        // aim: names >=3 target survivors
  const r5 = f.usesEdit ? 1 : 0;                 // used the sharpen-with-edit move
  const winShape = r1 + r2 + r3 + r4 + r5;
  return { ...f, aimHits: aimHits.length, memoHits: memoHits.length, memoNames: memoHits, winShape };
}

const arms = {};
for (const row of rows) {
  const a = row.arm; arms[a] ??= { n: 0, err: 0, trunc: 0, invalid: 0, scored: [] };
  arms[a].n++;
  if (row.error) { arms[a].err++; continue; }
  if (row.truncated) { arms[a].trunc++; continue; }
  if (row.valid === false) { arms[a].invalid++; continue; }
  const s = score(row); if (s) arms[a].scored.push(s);
}

const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const rate = (xs, pred) => xs.length ? xs.filter(pred).length / xs.length : NaN;
const fmt = (x) => Number.isNaN(x) ? ' -- ' : x.toFixed(2);

console.log(`\n=== N3 pre-probe grade — ${raw} ===`);
console.log(`arm       n  ok  winShape  hasClean allPaired  aim>=3  edit   memoHits  nSteps`);
for (const [a, d] of Object.entries(arms)) {
  const s = d.scored;
  console.log(
    `${a.padEnd(8)} ${String(d.n).padStart(2)} ${String(s.length).padStart(3)}   ` +
    `${fmt(mean(s.map((x) => x.winShape)))}     ${fmt(rate(s, (x) => x.hasCleanRun))}    ${fmt(rate(s, (x) => x.allPaired))}    ` +
    `${fmt(rate(s, (x) => x.aimHits >= 3))}  ${fmt(rate(s, (x) => x.usesEdit))}   ${fmt(mean(s.map((x) => x.memoHits)))}    ${fmt(mean(s.map((x) => x.nSteps)))}` +
    (d.err || d.trunc || d.invalid ? `   [err ${d.err} trunc ${d.trunc} invalid ${d.invalid}]` : ''),
  );
}

// ── Movement (Gate 1): feature-rate distance between an ON arm and its OFF baseline.
const featVec = (s) => [mean(s.map((x) => x.winShape)) / 5, rate(s, (x) => x.hasCleanRun), rate(s, (x) => x.allPaired), rate(s, (x) => x.aimHits >= 3), rate(s, (x) => x.usesEdit), mean(s.map((x) => x.nSteps)) / 8];
const dist = (aArm, bArm) => {
  const A = arms[aArm]?.scored ?? [], B = arms[bArm]?.scored ?? [];
  if (!A.length || !B.length) return NaN;
  const va = featVec(A), vb = featVec(B);
  return mean(va.map((_, i) => Math.abs(va[i] - vb[i])));
};
console.log(`\n=== Gate 1 — movement (mean |feature-rate ON - OFF|; higher = lineage moved the plan) ===`);
console.log(`  P vs A1    (identical, POSITIVE CONTROL): ${fmt(dist('P', 'A1'))}`);
console.log(`  Tfull vs A0 (non-identical, full)       : ${fmt(dist('Tfull', 'A0'))}`);
for (const t of ['Tplan', 'Tlesson', 'Tcheck']) if (arms[t]) console.log(`  ${t} vs A0                              : ${fmt(dist(t, 'A0'))}`);

console.log(`\n=== Memorization audit (source-only function names on a TARGET plan; >0 = copying) ===`);
for (const t of ['Tfull', 'Tplan', 'Tlesson', 'Tcheck']) {
  const s = arms[t]?.scored ?? []; if (!s.length) continue;
  const copiers = s.filter((x) => x.memoHits > 0);
  console.log(`  ${t}: ${copiers.length}/${s.length} plans reference source-only fns` + (copiers.length ? ` e.g. ${[...new Set(copiers.flatMap((x) => x.memoNames))].slice(0, 6).join(', ')}` : ''));
}
console.log(`\n(Decision per §8: positive-control gate first — if P≈A1 the NO-lift read is UNREADABLE.\n Then Gate-2 lift on any T arm, general (memoHits≈0) not copied. Analyst applies the frozen rules.)`);

// ── RE-AIM SCREEN read (frozen 2026-07-24): is the CONTROL arm below ceiling?
const MARKERS = ['exact', 'specific', 'precise', 'return value', 'returns', 'boundary', 'threshold', 'tuple', 'expected value'];
const WEAK = ['not none', 'no exception', 'smoke'];
const actionText = (p) => (p?.steps ?? []).map((s) => String(s.action ?? '')).join(' ').toLowerCase();
const screen = {};
for (const row of rows) {
  if (!row.plan || row.valid === false || row.truncated) continue;
  const t = actionText(row.plan);
  const hits = MARKERS.filter((m) => t.includes(m)).length;
  const weak = WEAK.some((w) => t.includes(w)) || hits === 0;
  (screen[row.arm] ??= []).push({ hits, explicit: hits >= 2, weak });
}
if (screen.S0) {
  console.log(`\n=== RE-AIM SCREEN — strategy withheld (S0) vs strategy given (A0) ===`);
  console.log(`arm    n   strategyExplicit(>=2 markers)  meanMarkers  weakStrategy`);
  for (const a of ['A0', 'S0', 'Sfull']) {
    const v = screen[a]; if (!v) continue;
    console.log(`${a.padEnd(6)} ${String(v.length).padStart(2)}   ${fmt(rate(v, (x) => x.explicit))}                    ${fmt(mean(v.map((x) => x.hits)))}       ${fmt(rate(v, (x) => x.weak))}`);
  }
  console.log(`\n(Frozen rule: S0 ~ A0 => stripping created NO room; the ceiling is the model's own\n competence => candidate A DEAD as a patient, escalate to candidate B.\n S0 materially below A0 => room exists => run Sfull vs S0.)`);
}
