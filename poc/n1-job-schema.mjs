// N1 POC — job/close schema + validator (~15min spike, NEVER ships).
//
// Riskiest assumption under test: the close chain (the ARBITER side) can be
// expressed as pure declarative data — no freeform code anywhere — in a
// second, operator-owned schema, such that every fit-to-pass surface reds at
// validation, named, before any token burns. If any negative below passes
// validation, the assumption is falsified and that is the result.
//
// Structural bet being evidenced (v1-extension vs v2): the job spec is a
// SECOND document, not a v1 extension — validate.js (workflow, agent-authored)
// stays untouched; validateJob (job, operator-owned) is new. The two schemas
// guard the arbiter split from both sides by INEXPRESSIBILITY:
//   workflow config cannot say `close`/`provider`  (v1 unknown-field, exists)
//   job spec cannot say `hooks`/`loop`/`memory`    (unknown-field, here)
//   job spec cannot say `mints`/`minting`          (minting policy is product
//     doctrine — soft mints only via HITL-confirm or N-consistent, picked
//     after job #1 data; a job that claims minting authority is laundering)
//
// Close-authoring hierarchy (PRD §7) enforced as a class menu per close type:
//   predicate (cmd + expected exit)  → hard        (exit-code truth)
//   gold      (expected + comparator from a fixed menu) → hard
//   rubric    (criteria text)        → soft ONLY   (advisory; can never mint
//                                                   automatically = never hard)
//   hitl      (prompt)               → hitl        (a human is the close)
//
// Token-free by construction: no provider import anywhere in this file.

import { validateConfig } from '../src/index.js';

const CLOSE_TYPES = ['predicate', 'gold', 'rubric', 'hitl'];
const CLASS_BY_CLOSE = { predicate: ['hard'], gold: ['hard'], rubric: ['soft'], hitl: ['hitl'] };
const GOLD_COMPARE = ['exact', 'json-equal'];
const CADENCE_UNITS = ['hour', 'day', 'week'];
const PROVIDERS = ['anthropic-api']; // SP-2: API-first; local deferred
const JOB_FIELDS = ['schema', 'job', 'description', 'provider', 'cadence', 'budgetUsd', 'steps', 'escalation'];
// Secrets never enter the tree/spine/configs (hard line). Common token shapes;
// the POC measures whether a literal-pattern deny is even viable (false-positive
// risk is a finding either way, not something to paper over).
const SECRET_RE = /(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[bap]-[A-Za-z0-9-]{10,})/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Validate an operator-owned job spec. Never throws; every failure is a named
 * red { code, path, detail? }. Returns the normalized spec on ok (the
 * {ok, reds, config}-shape API change, absorbed here as {ok, reds, job}).
 */
export function validateJob(input, { shellCapUsd = 2 } = {}) {
  const reds = [];
  const red = (code, path, detail) => { reds.push(detail ? { code, path, detail } : { code, path }); };

  let j = input;
  if (typeof j === 'string') {
    try { j = JSON.parse(j); } catch (e) {
      return { ok: false, reds: [{ code: 'parse-error', path: '$', detail: String(e.message) }], job: null };
    }
  }
  if (!isObj(j)) return { ok: false, reds: [{ code: 'parse-error', path: '$', detail: 'job spec must be a JSON object' }], job: null };

  // 1. shape — unknown fields red (hooks/loop/memory/mints smuggling lands here)
  for (const key of Object.keys(j)) {
    if (!JOB_FIELDS.includes(key)) red('unknown-field', key);
  }
  if (j.schema !== 'job-v1') red(j.schema === undefined ? 'missing-required' : 'invalid-value', 'schema', 'expected "job-v1"');
  if (typeof j.job !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(j.job)) red('invalid-value', 'job', 'kebab-case slug');
  if (typeof j.description !== 'string' || j.description.length === 0) red('missing-required', 'description');

  if (j.provider === undefined) red('missing-required', 'provider');
  else if (!PROVIDERS.includes(j.provider)) red('invalid-value', 'provider', `menu: ${PROVIDERS.join('|')}`);

  const cad = isObj(j.cadence) ? j.cadence : {};
  if (j.cadence === undefined) red('missing-required', 'cadence');
  else {
    if (!CADENCE_UNITS.includes(cad.unit)) red('invalid-value', 'cadence.unit', CADENCE_UNITS.join('|'));
    if (!(Number.isInteger(cad.every) && cad.every >= 1 && cad.every <= 30)) red('bounds', 'cadence.every', '1..30');
  }

  if (j.budgetUsd === undefined) red('missing-required', 'budgetUsd');
  else if (!(typeof j.budgetUsd === 'number' && j.budgetUsd > 0 && j.budgetUsd <= shellCapUsd)) {
    red('bounds', 'budgetUsd', `0 < budget <= shell cap ${shellCapUsd} (cap-not-estimate; no self-adjusted budgets ever)`);
  }

  const esc = isObj(j.escalation) ? j.escalation : {};
  if (esc.mode !== 'decision-ready') red(j.escalation === undefined ? 'missing-required' : 'invalid-value', 'escalation.mode', 'must be "decision-ready"');

  // 2. steps + the close chain
  if (!Array.isArray(j.steps) || j.steps.length === 0) {
    red('missing-required', 'steps', 'non-empty array');
  } else {
    const seen = new Set();
    let sawHitl = false;
    j.steps.forEach((s, i) => {
      const at = `steps.${i}`;
      if (!isObj(s)) { red('invalid-value', at, 'step must be an object'); return; }
      for (const key of Object.keys(s)) {
        if (!['id', 'close', 'class'].includes(key)) red('unknown-field', `${at}.${key}`);
      }
      if (typeof s.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(s.id)) red('invalid-value', `${at}.id`, 'kebab-case slug');
      else if (seen.has(s.id)) red('duplicate-id', `${at}.id`, s.id);
      else seen.add(s.id);

      const close = isObj(s.close) ? s.close : null;
      if (!close) { red('missing-required', `${at}.close`, 'every step names its close — a step without one is ungated spend'); return; }
      if (!CLOSE_TYPES.includes(close.type)) {
        red('close-type', `${at}.close.type`, `menu: ${CLOSE_TYPES.join('|')} — never freeform code`);
        return;
      }
      // per-type contracts, fixed menus only
      if (close.type === 'predicate') {
        if (typeof close.cmd !== 'string' || close.cmd.length === 0) red('missing-required', `${at}.close.cmd`);
        if (!Number.isInteger(close.expect)) red('invalid-value', `${at}.close.expect`, 'integer exit code');
      } else if (close.type === 'gold') {
        if (close.expected === undefined) red('missing-required', `${at}.close.expected`);
        if (!GOLD_COMPARE.includes(close.compare)) red('invalid-value', `${at}.close.compare`, GOLD_COMPARE.join('|'));
      } else if (close.type === 'rubric') {
        if (typeof close.criteria !== 'string' || close.criteria.length === 0) red('missing-required', `${at}.close.criteria`);
      } else if (close.type === 'hitl') {
        if (typeof close.prompt !== 'string' || close.prompt.length === 0) red('missing-required', `${at}.close.prompt`);
        sawHitl = true;
      }
      const known = { predicate: ['type', 'cmd', 'expect'], gold: ['type', 'expected', 'compare'], rubric: ['type', 'criteria'], hitl: ['type', 'prompt'] }[close.type];
      for (const key of Object.keys(close)) {
        if (!known.includes(key)) red('unknown-field', `${at}.close.${key}`, `not a ${close.type} field (freeform/code/mints smuggle lands here)`);
      }
      // 3. the hierarchy: class menu is keyed by close type — laundering reds
      const legal = CLASS_BY_CLOSE[close.type];
      if (legal && s.class !== undefined && !legal.includes(s.class)) {
        red('close-hierarchy', `${at}.class`, `${close.type} close admits class ${legal.join('|')} only (a rubric can never be hard — fit-to-pass laundering)`);
      }
      if (s.class === undefined) red('missing-required', `${at}.class`);
      else if (!['hard', 'soft', 'hitl'].includes(s.class)) red('invalid-value', `${at}.class`, 'hard|soft|hitl');
      if (s.class === 'hitl' && close.type !== 'hitl') red('close-hierarchy', `${at}.class`, 'hitl class requires a hitl close (a human IS the close)');
    });
    // a job whose steps include any hitl class must have one — cross-check is
    // structural: hitl close type ⇔ hitl class, both directions covered above.
    void sawHitl;
  }

  // 4. secrets sweep — every string in the tree
  (function sweep(node, at) {
    if (typeof node === 'string') { if (SECRET_RE.test(node)) red('secret-literal', at, 'secrets load from the environment; they never enter a spec'); return; }
    if (Array.isArray(node)) node.forEach((v, i) => sweep(v, `${at}.${i}`));
    else if (isObj(node)) for (const [k, v] of Object.entries(node)) sweep(v, at ? `${at}.${k}` : k);
  })(j, '');

  return { ok: reds.length === 0, reds, job: reds.length === 0 ? j : null };
}

// ---------------------------------------------------------------- selftest --

// The positive case is job #1 AS THE PRD DEFINES IT (§6) — real target, not a
// fixture authored to pass: litectx maintainer, hard greens = suite + lint,
// human-gated merge forever.
const JOB1 = {
  schema: 'job-v1',
  job: 'litectx-maintainer',
  description: 'review -> fix -> branch -> PR on litectx; suite+lint are the hard closes; merge stays human forever',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  steps: [
    { id: 'review', close: { type: 'predicate', cmd: 'npm test', expect: 0 }, class: 'hard' },
    { id: 'fix', close: { type: 'predicate', cmd: 'npm run lint', expect: 0 }, class: 'hard' },
    { id: 'pr', close: { type: 'hitl', prompt: 'PR opened — review and merge?' }, class: 'hitl' },
  ],
  escalation: { mode: 'decision-ready' },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const mut = (fn) => { const j = clone(JOB1); fn(j); return j; };

// Each negative is an ATTACK: the config an agent (or sloppy operator) would
// write to slip past the arbiter. wantRed pins code AND path — "some red
// somewhere" would let a wrong-reason red fake a pass.
const CASES = [
  ['job #1 validates green', JOB1, null],

  // -- the arbiter split, both directions --
  ['workflow config smuggling a close reds in v1 (REAL validate.js path)', 'V1CONFIG', 'unknown-field:close'],
  ['job spec smuggling hooks (agent-domain) reds', mut((j) => { j.hooks = { 'on-green': [{ op: 'remember' }] }; }), 'unknown-field:hooks'],
  ['job spec smuggling a minting claim reds', mut((j) => { j.steps[1].close.mints = true; }), 'unknown-field:steps.1.close.mints'],

  // -- fit-to-pass laundering --
  ['rubric close claiming class hard reds (hierarchy)', mut((j) => { j.steps[1].close = { type: 'rubric', criteria: 'code looks good' }; j.steps[1].class = 'hard'; }), 'close-hierarchy:steps.1.class'],
  ['hitl class on a predicate close reds (a human IS the close)', mut((j) => { j.steps[0].class = 'hitl'; }), 'close-hierarchy:steps.0.class'],
  ['freeform-code close reds (never code)', mut((j) => { j.steps[0].close = { type: 'js', code: 'return true' }; }), 'close-type:steps.0.close.type'],
  ['predicate close with a smuggled script field reds', mut((j) => { j.steps[0].close.script = 'exit 0'; }), 'unknown-field:steps.0.close.script'],

  // -- the budget hard line --
  ['budget above shell cap reds (no self-adjusted budgets, ever)', mut((j) => { j.budgetUsd = 50; }), 'bounds:budgetUsd'],
  ['zero budget reds', mut((j) => { j.budgetUsd = 0; }), 'bounds:budgetUsd'],

  // -- ungated spend --
  ['step without a close reds', mut((j) => { delete j.steps[1].close; }), 'missing-required:steps.1.close'],
  ['empty steps reds', mut((j) => { j.steps = []; }), 'missing-required:steps'],
  ['missing escalation reds (pain channel is not optional)', mut((j) => { delete j.escalation; }), 'missing-required:escalation.mode'],

  // -- spec hygiene --
  ['duplicate step ids red', mut((j) => { j.steps[1].id = 'review'; }), 'duplicate-id:steps.1.id'],
  ['unknown provider reds', mut((j) => { j.provider = 'local-llama'; }), 'invalid-value:provider'],
  ['cadence bounds red', mut((j) => { j.cadence.every = 0; }), 'bounds:cadence.every'],
  ['gold close with freeform comparator reds', mut((j) => { j.steps[1].close = { type: 'gold', expected: '42', compare: 'my-fuzzy-match' }; j.steps[1].class = 'hard'; }), 'invalid-value:steps.1.close.compare'],

  // -- secrets --
  ['inline API key reds (secrets never enter a spec)', mut((j) => { j.description = 'use key sk-ant-api03-abcdefghijklmnop to auth'; }), 'secret-literal:description'],
  ['secret smuggled deep in a close cmd reds', mut((j) => { j.steps[0].close.cmd = 'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuv npm test'; }), 'secret-literal:steps.0.close.cmd'],

  // -- must-not-red guard (false-positive probe for the secrets sweep) --
  ['ordinary env REFERENCE does not red (only literals do)', mut((j) => { j.steps[0].close.cmd = 'GITHUB_TOKEN="$GITHUB_TOKEN" npm test'; }), null],
];

let pass = 0, fail = 0;
for (const [name, spec, want] of CASES) {
  let got;
  if (spec === 'V1CONFIG') {
    // REAL code path, not a replica: the shipped N0 validator must red the smuggle.
    got = validateConfig({ schema: 'v1', loop: { shape: 'refine' }, memory: { store: 'litectx' }, gate: { budgetUsd: 1, writeScope: ['src/**'] }, escalation: { mode: 'decision-ready' }, close: { type: 'predicate', cmd: 'true', expect: 0 } });
  } else {
    got = validateJob(spec);
  }
  const hit = want === null
    ? got.ok
    : got.reds.some((r) => `${r.code}:${r.path}` === want);
  if (hit) { pass++; console.log(`  ok   ${name}`); }
  else {
    fail++;
    console.log(`  FAIL ${name}\n       want ${want === null ? 'ok' : want}\n       got  ${got.ok ? 'ok' : got.reds.map((r) => `${r.code}:${r.path}`).join(', ')}`);
  }
}
console.log(`\nselftest ${pass}/${CASES.length}${fail ? ' — FALSIFIED: the assumption did not survive' : ''}`);
process.exit(fail ? 1 : 0);
