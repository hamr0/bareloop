// N3 lineage PRE-PROBE — collection harness (Layer 3 opening gate).
// Prereg: docs/03-logs/experiments/N3-PREPROBE-PREREG.md (FROZEN 2026-07-24).
//
// Measures the REAL plan drafter: same AnthropicProvider(model=claude-sonnet-5),
// same system prompt (PERSONA_TOOLS), same loop.run([user],[],{cacheMessages,maxTokens:32000}),
// same planPrompt() — with a prior-run LINEAGE block appended (the way failure/reds append).
// The drafter is a NO-TOOLS worker; it drafts a plan-v1 JSON and nothing runs.
//
// Cost is read from onLlmResult.costUsd — the F6 honest-priced value the shipped
// runner meters (null => unpriced => flagged, never laundered to $0).
//
//   ANTHROPIC_API_KEY=... node scripts/n3-preprobe.mjs --arms A0,A1,P,Tfull --n 8 --out <file>
//   ANTHROPIC_API_KEY=... node scripts/n3-preprobe.mjs --calibrate      # 1x A0, measure cost only
//
// Collection only — grading is scripts/n3-preprobe-grade.mjs (re-run without spend).

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TOOL_MENU } from '../src/job.js';
import { MAX_PLAN_STEPS, MAX_EXITS_PER_STEP, validatePlan } from '../src/plan.js';
import { extractArtifact } from '../src/text.js';
import { PERSONA_TOOLS } from '../src/tools.js';

const require = createRequire(import.meta.url);
const { AnthropicProvider } = require('bare-agent/providers');
const { Loop } = require('bare-agent');

const MODEL = 'claude-sonnet-5';
const MAX_STEP_ROUNDS = 40; // runPlan default

// ── planPrompt: VERBATIM copy pinned to src/planrun.js:71-105 (not exported).
// The drafter's real prompt. If planrun.js changes this, re-sync (throwaway probe).
function planPrompt(job, scoutBlob, reds, maxStepRounds, failure) {
  const ceiling = Array.isArray(job.tools) ? job.tools : [...TOOL_MENU];
  const checkNames = (job.checks ?? []).map((/** @type {any} */ c) => c.name);
  const doc = `DRAFT-PLAN
You are planning how to accomplish a goal in a repository, as an ordered list of bounded
steps (schema "plan-v1"). The plan is pure declarative JSON validated by a strict schema;
ANY unknown field, wrong enum value, or out-of-bounds number is rejected. Output ONLY the
JSON object, no fences, no commentary.

Shape: { "schema": "plan-v1", "steps": [ ... 1..${MAX_PLAN_STEPS} steps ... ] } — steps run
strictly in array order. Each step (no other fields exist):
- "id": kebab-case slug, unique
- "action": the step's task, precise enough for a worker that sees ONLY this step
- "tools": non-empty unique subset of ${JSON.stringify(ceiling)} (write/edit are the write-class verbs)
- "rounds": integer 1..${maxStepRounds} — the step's per-attempt tool-round bound
- "target": the step's deliverable path (REQUIRED when tools include write/edit), inside ${JSON.stringify(job.writeScope)}
- "exit": 1..${MAX_EXITS_PER_STEP} form checks that ALL must pass (AND), each one of:
    {"type":"artifact-written","path":"...","pattern":"optional regex"}
    {"type":"tree-changed","scope":"a scope inside ${JSON.stringify(job.writeScope)}"}
    {"type":"json-valid","path":"..."}
    {"type":"check-passes","name":"one of ${JSON.stringify(checkNames)}"}
  A check-passes on a write-granted step MUST be paired with a tree-changed exit
  (the repository starts green — a lone check would pass on the untouched tree).
  Reference checks by NAME only; you cannot author or modify one.

Goal:
${job.goal}

Repository survey (from a read-only scout):
${scoutBlob || '(no scout notes)'}`;
  let p = doc;
  if (failure) p += `\n\nWhat happened when the previous plan ran:\n${failure}\nPlan differently — a repeat of the same steps will fail the same way.`;
  if (reds) p += `\n\nYour previous plan was REJECTED with these reds (code:path):\n${JSON.stringify(reds)}\nFix every red. Output ONLY the corrected JSON object.`;
  return p;
}

// ── The two specs + scouts (source = orchestrator, greened; target = assess.py, non-identical).
const here = fileURLToPath(new URL('.', import.meta.url));
const sourceSpec = JSON.parse(readFileSync(new URL('../jobs/aurora-testgen-l2accept.json', import.meta.url), 'utf8'));
const sourcePlan = JSON.parse(readFileSync(new URL('../scratch-src-plan.json', import.meta.url), 'utf8'));

const sourceScout = `Repository root: /home/hamr/PycharmProjects/bareloop-patients/aurora-soar
Target module: packages/soar/src/aurora_soar/orchestrator.py (2,455 lines) — class SoarOrchestrator.
Takes injected deps (store, config, reasoning_llm, solving_llm, agent_registry); existing suite at tests/testgen/ (conftest.py fakes, unit/, integration/).
Methods (async unless noted): _configure_health_monitoring, execute, _get_progress_callback, _phase1_assess, _inject_context_files, _phase2_retrieve, _phase3_decompose, _phase5_collect, _phase6_synthesize, _phase7_record, _phase8_respond, _execute_simple_path, _handle_verification_failure, _handle_decomposition_failure, _handle_critical_failure, _handle_execution_error, _build_simple_verify_result, _build_verify_only_result, _build_cached_verify_result, _split_large_chunk_by_sections, _check_soar_cache_hit, _check_goals_json_cache, _parse_soar_log, _classify_api_error, _index_conversation_log.`;

const targetScout = `Repository root: /home/hamr/PycharmProjects/bareloop-patients/aurora-soar
Target module: packages/soar/src/aurora_soar/phases/assess.py (1,148 lines) — Phase 1 complexity assessment.
Existing suite at tests/testgen_assess/ (conftest.py fixtures, passing unit tests).
@dataclass AssessmentResult: to_dict, __str__.
class ComplexityAssessor(debug=False): assess(prompt)->AssessmentResult; and pure scoring methods:
  _detect_critical(prompt_lower)->bool; _score_lexical(prompt)->tuple[int,list]; _score_keywords(prompt_lower)->tuple[int,list];
  _score_scope(prompt_lower)->tuple[int,list]; _score_constraints(prompt_lower)->tuple[int,list]; _score_structure(prompt)->tuple[int,list];
  _score_domain(prompt_lower)->tuple[int,list]; _score_question_type(prompt_lower)->tuple[int,list];
  _calculate_multiplier(signals)->float; _calculate_confidence(...).
Module functions: _assess_tier1_keyword(query)->tuple[str,float,float]; _assess_tier2_llm(...); assess_complexity(query, _llm_client=None)->dict.
Scoring is pure/deterministic (SIMPLE/MEDIUM/COMPLEX/CRITICAL tiers, keyword + lexical scores, thresholds). No network; debug flag only.`;

const targetSpec = {
  schema: 'job-v1', job: 'aurora-testgen-assess', provider: 'anthropic-api',
  writeScope: ['tests/testgen_assess/**'],
  tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'],
  checks: [{ name: 'clean-run' }],
  goal: `An existing pytest test suite for the complexity-assessment phase at packages/soar/src/aurora_soar/phases/assess.py (1,148 lines) already lives at tests/testgen_assess/ — conftest.py with fixtures and passing unit tests. Repository root: /home/hamr/PycharmProjects/bareloop-patients/aurora-soar. An external close you cannot run has ALREADY graded this suite: every test passes against the current source and the shape floor is met, but the suite detects only 15% of hidden planted faults — the passing bar is 45%. Your job is to STRENGTHEN the existing suite so it detects more faults. Read the current tests first, then sharpen weak assertions and add behavior-asserting tests that target the functions where planted faults currently survive. The grader's survivor scoreboard (function name: undetected planted faults): _score_lexical: 4, _detect_critical: 4, _score_keywords: 3, _calculate_confidence: 3, _score_scope: 2, _score_constraints: 2, _score_structure: 2, _score_domain: 2, _score_question_type: 2, _calculate_multiplier: 2, assess: 1, _assess_tier1_keyword: 1, _assess_tier2_llm: 1, assess_complexity: 1, to_dict: 1. Planted faults are small behavioral changes inside those functions (flipped comparisons, off-by-one constants, swapped booleans, dropped return values) — a test detects one by asserting the SPECIFIC current behavior: exact scores, tuple return values, threshold boundaries, tier routing. The ComplexityAssessor takes only a debug flag; the scoring methods are pure and deterministic — no network, no real models. Testing standards: test behavior, not implementation; smoke asserts (not-None, no-exception) are worthless here; every test is self-contained and deterministic. Only tests/testgen_assess/** is writable — never modify source files; tests must never read source files off the filesystem, hash them, touch os.environ, or spawn subprocesses. All existing tests must KEEP passing against the current source. After each attempt, an automatic check runs your suite against the untouched source — a suite identical to the existing one, or one with failing tests, comes back to you as the failure output, and you get another bounded attempt to fix it. Stop when the suite is strengthened.`,
  verdictType: 'green',
};

// ── STRIPPED target spec (F51 re-aim, candidate A): the operator knows WHAT counts as
// success but NOT HOW. Classification line — what the GRADER measures is KEPT (target,
// arbiter territory: scoreboard, bar, fault types, fence rules, close mechanism, patient
// facts); HOW TO SUCCEED at it is STRIPPED (strategy: "a test detects one by asserting the
// SPECIFIC current behavior…", the testing-standards paragraph, and the
// read-then-sharpen-then-add sequence). Nothing else differs from targetSpec.
const strippedGoal = `An existing pytest test suite for the complexity-assessment phase at packages/soar/src/aurora_soar/phases/assess.py (1,148 lines) already lives at tests/testgen_assess/ — conftest.py with fixtures and passing unit tests. Repository root: /home/hamr/PycharmProjects/bareloop-patients/aurora-soar. An external close you cannot run has ALREADY graded this suite: every test passes against the current source and the shape floor is met, but the suite detects only 15% of hidden planted faults — the passing bar is 45%. Your job is to STRENGTHEN the existing suite so it detects more faults. The grader's survivor scoreboard (function name: undetected planted faults): _score_lexical: 4, _detect_critical: 4, _score_keywords: 3, _calculate_confidence: 3, _score_scope: 2, _score_constraints: 2, _score_structure: 2, _score_domain: 2, _score_question_type: 2, _calculate_multiplier: 2, assess: 1, _assess_tier1_keyword: 1, _assess_tier2_llm: 1, assess_complexity: 1, to_dict: 1. Planted faults are small behavioral changes inside those functions (flipped comparisons, off-by-one constants, swapped booleans, dropped return values). The ComplexityAssessor takes only a debug flag; the scoring methods are pure and deterministic — no network, no real models; pytest is installed. Only tests/testgen_assess/** is writable — never modify source files; tests must never read source files off the filesystem, hash them, touch os.environ, or spawn subprocesses. All existing tests must KEEP passing against the current source. After each attempt, an automatic check runs your suite against the untouched source — a suite identical to the existing one, or one with failing tests, comes back to you as the failure output, and you get another bounded attempt to fix it. Stop when the suite is strengthened.`;
const strippedSpec = { ...targetSpec, job: 'aurora-testgen-assess-stripped', goal: strippedGoal };

// ── VAGUE-ASK spec (F52 successor): the operator knows the BAR but not WHICH parts are weak.
// One variable vs targetSpec: the survivor scoreboard and the "target the functions where
// planted faults currently survive" pointer are REMOVED. The method stays (so this isolates
// target-vagueness, not method-vagueness — F52 already settled the method axis). The bar,
// close, fence and fault-type facts stay: operator territory, never removable.
const vagueGoal = `An existing pytest test suite for the complexity-assessment phase at packages/soar/src/aurora_soar/phases/assess.py (1,148 lines) already lives at tests/testgen_assess/ — conftest.py with fixtures and passing unit tests. Repository root: /home/hamr/PycharmProjects/bareloop-patients/aurora-soar. An external close you cannot run has ALREADY graded this suite: every test passes against the current source and the shape floor is met, but the suite detects only 15% of hidden planted faults — the passing bar is 45%. Your job is to STRENGTHEN the existing suite so it detects more faults. Read the current tests first, then sharpen weak assertions and add behavior-asserting tests. Planted faults are small behavioral changes somewhere in this module (flipped comparisons, off-by-one constants, swapped booleans, dropped return values) — a test detects one by asserting the SPECIFIC current behavior: exact scores, tuple return values, threshold boundaries, tier routing. The ComplexityAssessor takes only a debug flag; the scoring methods are pure and deterministic — no network, no real models. Testing standards: test behavior, not implementation; smoke asserts (not-None, no-exception) are worthless here; every test is self-contained and deterministic. Only tests/testgen_assess/** is writable — never modify source files; tests must never read source files off the filesystem, hash them, touch os.environ, or spawn subprocesses. All existing tests must KEEP passing against the current source. After each attempt, an automatic check runs your suite against the untouched source — a suite identical to the existing one, or one with failing tests, comes back to you as the failure output, and you get another bounded attempt to fix it. Stop when the suite is strengthened.`;
const vagueSpec = { ...targetSpec, job: 'aurora-testgen-assess-vague', goal: vagueGoal };

// ── Lineage payloads (from the greened source run mrvwjrop: outcome green, $4.73, 6 steps, no replan).
const stepLine = (s) => `  * ${s.id} [tools ${JSON.stringify(s.tools)}, rounds ${s.rounds}] -> ${s.target}\n    action: ${String(s.action).replace(/\s+/g, ' ').slice(0, 240)}...\n    exit: ${JSON.stringify(s.exit)}`;
const planBlock = sourcePlan.steps.map(stepLine).join('\n');

const LINEAGE = {
  full: `PRIOR RUN LINEAGE — a previous run of a RELATED TESTGEN job that GREENED (for reference):
- Job: strengthen the pytest suite for the SOAR orchestrator (packages/soar/src/aurora_soar/orchestrator.py, 2,455 lines) past a 45% mutation-kill bar.
- Outcome: GREEN, grade 55/100 (bar 45), spent $4.73 over 6 steps, no replan.
- The plan that greened (as EXECUTED), step by step:
${planBlock}
- What worked: each step created ONE focused test file for a small group of functions and asserted EXACT current behavior (return values, thresholds, delegation) with the injected fakes; every write step's exit paired a tree-changed check with an operator check-passes(clean-run) that ran the new tests against untouched source; the final step used \`edit\` to SHARPEN existing assertions instead of rewriting.`,

  plan: `PRIOR RUN LINEAGE — the plan that a related TESTGEN run used (for reference):
${planBlock}`,

  lesson: `PRIOR RUN LINEAGE — one lesson from a related TESTGEN run that greened: split the work into one focused test file per small function-group, assert EXACT current behavior with injected fakes, gate every write step with a clean-run check paired with tree-changed, and use a final \`edit\` step to sharpen existing assertions.`,

  check: `PRIOR RUN LINEAGE — the per-step EXIT composition a related TESTGEN run greened with: every write step used exit [{"type":"tree-changed","scope":"<inside writeScope>"},{"type":"check-passes","name":"clean-run"}].`,
};


// ── T4: PATIENT-QUIRK / FAILURE-LINEAGE arms (F53 successor, frozen 2026-07-25).
// The only knowledge class a scout structurally CANNOT reach: what FAILED in a prior run
// (an event, not a file). Target framing uses the REAL repo state (assess tests really live
// in packages/soar/tests/unit/; there is NO local conftest — the ROOT conftest does sys.path
// setup; pytest.ini sets testpaths/addopts). Lineage payload is EXTRACTED VERBATIM from the
// green run's spine (mrvwjrop close-verdict gaps), never authored to contain the answer.
const quirkGoal = `The complexity-assessment phase at packages/soar/src/aurora_soar/phases/assess.py (1,148 lines) is under-tested. Repository root: /home/hamr/PycharmProjects/bareloop-patients/aurora-soar. Existing tests for it live at packages/soar/tests/unit/ (test_phase_assess.py, test_assess_types.py, test_corpus_assess.py) and currently pass. An external close you cannot run has ALREADY graded them: the suite detects only 15% of hidden planted faults — the passing bar is 45%. Your job is to STRENGTHEN the tests so they detect more faults. Planted faults are small behavioral changes in that module (flipped comparisons, off-by-one constants, swapped booleans, dropped return values). Only packages/soar/tests/unit/** is writable — never modify source files. All existing tests must KEEP passing against the current source. After each attempt, an automatic check runs the suite against the untouched source; a suite identical to the existing one, or one with failing tests, comes back to you as the failure output, and you get another bounded attempt. Stop when the suite is strengthened.`;
const quirkScout = `Repository root: /home/hamr/PycharmProjects/bareloop-patients/aurora-soar
Target module: packages/soar/src/aurora_soar/phases/assess.py (1,148 lines) — Phase 1 complexity assessment.
@dataclass AssessmentResult: to_dict, __str__.
class ComplexityAssessor(debug=False): assess(prompt)->AssessmentResult; pure scoring methods:
  _detect_critical, _score_lexical, _score_keywords, _score_scope, _score_constraints,
  _score_structure, _score_domain, _score_question_type, _calculate_multiplier, _calculate_confidence.
Module functions: _assess_tier1_keyword, _assess_tier2_llm, assess_complexity.
Existing tests: packages/soar/tests/unit/test_phase_assess.py (318 lines), test_assess_types.py (71), test_corpus_assess.py (335). No conftest.py under packages/soar; the ROOT conftest.py inserts package src paths into sys.path. pytest.ini sets testpaths=packages src, python_files=test_*.py, and addopts with -ra --strict-config --cov.`;
const quirkSpec = {
  schema: 'job-v1', job: 'aurora-testgen-assess-real', provider: 'anthropic-api',
  writeScope: ['packages/soar/tests/unit/**'],
  tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'],
  checks: [{ name: 'clean-run' }], verdictType: 'green', goal: quirkGoal,
};
// VERBATIM prior-run failures (spine mrvwjrop close-verdict gaps) — extracted, not authored.
const FAILURE_LINEAGE = `PRIOR RUN LINEAGE — a previous run of this same TESTGEN job family (different module) GREENED, but only after these attempts were REJECTED. The rejections, verbatim from that run's own close:

1. check "clean-run" red: TESTGEN gate-red: forbidden pattern "environ-enumeration" in tests/testgen/unit/test_health_monitoring.py — tests assert behavior through the module's API, never through the filesystem, environment, or subprocesses

2. check "clean-run" red: TESTGEN clean-red: your tests must all pass against the CURRENT untouched source before they count — fix or remove the failing assertions
   TESTGEN | E       AssertionError: assert {'phase8_resp...tion_failure'} == {'verification_failure'}

3. exit not satisfied: 0 files changed under tests/testgen/unit/** — the tree is byte-identical to the step start (an identical re-write is not a change)`;

// ── Arms.
const ARMS = {
  A0: { spec: targetSpec, scout: targetScout, lineage: null, kind: 'off-target' },
  A1: { spec: sourceSpec, scout: sourceScout, lineage: null, kind: 'off-source' },
  P: { spec: sourceSpec, scout: sourceScout, lineage: LINEAGE.full, kind: 'on-identical(positive-control)' },
  Tfull: { spec: targetSpec, scout: targetScout, lineage: LINEAGE.full, kind: 'on-nonidentical-full' },
  Tplan: { spec: targetSpec, scout: targetScout, lineage: LINEAGE.plan, kind: 'on-nonidentical-plan' },
  Tlesson: { spec: targetSpec, scout: targetScout, lineage: LINEAGE.lesson, kind: 'on-nonidentical-lesson' },
  Tcheck: { spec: targetSpec, scout: targetScout, lineage: LINEAGE.check, kind: 'on-nonidentical-check' },
  // F51 re-aim (candidate A) — strategy withheld from the spec:
  S0: { spec: strippedSpec, scout: targetScout, lineage: null, kind: 'off-stripped(screen)' },
  Sfull: { spec: strippedSpec, scout: targetScout, lineage: LINEAGE.full, kind: 'on-stripped-full' },
  // F52 successor — target withheld (vague ask), method intact:
  V0: { spec: vagueSpec, scout: targetScout, lineage: null, kind: 'off-vague(screen)' },
  Vfull: { spec: vagueSpec, scout: targetScout, lineage: LINEAGE.full, kind: 'on-vague-full' },
  // T4 — failure-lineage (the scout-unreachable knowledge class):
  Q0: { spec: quirkSpec, scout: quirkScout, lineage: null, kind: 'off-real-patient' },
  Qfail: { spec: quirkSpec, scout: quirkScout, lineage: FAILURE_LINEAGE, kind: 'on-failure-lineage' },
};

// ── CLI.
const argv = process.argv.slice(2);
const getArg = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const calibrate = argv.includes('--calibrate');
const armList = calibrate ? ['A0'] : getArg('--arms', 'A0,A1,P,Tfull').split(',');
const N = calibrate ? 1 : parseInt(getArg('--n', '8'), 10);
const outFile = getArg('--out', fileURLToPath(new URL('../scratch-n3-raw.jsonl', import.meta.url)));

const dry = argv.includes('--dry');
if (dry) {
  console.log(`N3 pre-probe [DRY] — prompt assembly only, no API. arms=${armList.join(',')}`);
  for (const arm of armList) {
    const cfg = ARMS[arm];
    if (!cfg) { console.error(`unknown arm ${arm}`); process.exit(2); }
    const p = planPrompt(cfg.spec, cfg.scout, null, MAX_STEP_ROUNDS, null) + (cfg.lineage ? `\n\n${cfg.lineage}` : '');
    const menced = cfg.lineage ? cfg.lineage.length : 0;
    console.log(`\n### ${arm} (${cfg.kind}) — prompt ${p.length} chars, lineage ${menced} chars`);
    console.log(p.slice(-600).replace(/^/gm, '    | '));
  }
  process.exit(0);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('ANTHROPIC_API_KEY not set (secrets load from the environment)'); process.exit(2); }
const provider = new AnthropicProvider({ apiKey, model: MODEL });

async function draftOnce(prompt) {
  let costUsd = 0; let priced = true;
  const loop = new Loop({
    provider, system: PERSONA_TOOLS,
    onLlmResult: async (arg) => { if (arg?.costUsd == null) priced = false; else costUsd += arg.costUsd; },
  });
  const r = await loop.run([{ role: 'user', content: prompt }], [], { cacheMessages: true, maxTokens: 32000 });
  return { text: r.text ?? '', costUsd, priced, stop: r.stopReason ?? r.stop_reason ?? null };
}

let total = 0;
const summary = {};
console.log(`N3 pre-probe: arms=${armList.join(',')} n=${N} model=${MODEL}${calibrate ? ' [CALIBRATE]' : ''}`);
for (const arm of armList) {
  const cfg = ARMS[arm];
  if (!cfg) { console.error(`unknown arm ${arm}`); process.exit(2); }
  summary[arm] = { valid: 0, truncated: 0, cost: 0, priced: 0 };
  for (let i = 0; i < N; i++) {
    const prompt = planPrompt(cfg.spec, cfg.scout, null, MAX_STEP_ROUNDS, null) + (cfg.lineage ? `\n\n${cfg.lineage}` : '');
    let rec;
    try {
      const r = await draftOnce(prompt);
      const truncated = r.stop === 'max_tokens' || !r.text.trim();
      const code = extractArtifact(r.text).code ?? '';
      const pv = validatePlan(code, { job: cfg.spec, maxStepRounds: MAX_STEP_ROUNDS });
      let plan = null; try { plan = JSON.parse(code); } catch { /* invalid */ }
      rec = { arm, kind: cfg.kind, i, costUsd: r.costUsd, priced: r.priced, stop: r.stop, truncated, valid: pv.ok, reds: pv.ok ? [] : pv.reds, plan, rawLen: r.text.length };
      total += r.costUsd; summary[arm].cost += r.costUsd;
      if (r.priced) summary[arm].priced++;
      if (truncated) summary[arm].truncated++; else if (pv.ok) summary[arm].valid++;
    } catch (e) {
      rec = { arm, kind: cfg.kind, i, error: String(e?.message ?? e), category: e?.category ?? null };
    }
    appendFileSync(outFile, JSON.stringify(rec) + '\n');
    process.stdout.write(`  ${arm} #${i}: ${rec.error ? 'ERR ' + rec.error : `$${rec.costUsd?.toFixed(4)} valid=${rec.valid} trunc=${rec.truncated} steps=${rec.plan?.steps?.length ?? '-'}`}\n`);
  }
}
console.log(`\n--- summary --- total $${total.toFixed(4)} -> ${outFile}`);
for (const [a, s] of Object.entries(summary)) console.log(`  ${a}: valid ${s.valid}/${N}, trunc ${s.truncated}, priced ${s.priced}/${N}, $${s.cost.toFixed(4)} (avg $${(s.cost / N).toFixed(4)})`);
