// PRD item 31.4 — the judge key is demanded only when a judge will be CALLED,
// and the predicate that decides it has exactly one spelling.
//
// The defect: `scripts/run-u.mjs` hard-exited on a missing `ANTHROPIC_API_KEY`
// unconditionally. A `verdictType: 'green'` job whose worker is DeepSeek or
// Gemini and whose close is mechanical commands would never spend one token
// against an Anthropic endpoint, and still could not start without an
// Anthropic account. "Provider-agnostic except you also need Claude" is not
// provider-agnostic.
//
// Why `closeJudges` lives in src/kinds.js rather than in the runner: the
// question "does this close ask a model to render anything?" was already
// open-coded SIX times across the tree, and `scripts/run-u.mjs`'s own
// judge-provider comment warns in so many words against "a second reading of
// the declaration that can drift from the one the runner actually executes".
// A seventh spelling deciding a REFUSAL is that warning coming true, so there
// is one reading now and every caller shares it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closeJudges, judgedStages, JUDGED_FLOOR_KIND } from '../src/kinds.js';

const judgedStage = (name = 'verdict') => ({ name, kind: JUDGED_FLOOR_KIND, params: { paths: ['src/mod.js'] } });
const cmdStage = (name = 'tests') => ({ name, kind: 'cmd-exit-zero', params: { cmd: 'npm test' } });

// Pins the WIRING (the judge key is read from JUDGE_API_KEY / judgeEntry.envKey
// and gates the judge demand and provider construction), never a specific local
// variable spelling — a behaviour-preserving rename must not break this suite.
//
// PANEL-BUILD.md P0 — this orchestration moved into src/userrun.js's
// execute(), where `process.env` reads became `env` (an injectable deps
// field) and the identifier is declared `let … = null;` above a TEST-SEAM
// guard, then reassigned here (never `const`), so this no longer requires
// the `const` keyword.
function judgeKeyIdentifier(src) {
  const m = src.match(/(?:const|let)?\s*(\w+) = env\.JUDGE_API_KEY \?\? env\[judgeEntry\.envKey\];/);
  assert.ok(m, 'the judge key follows the RESOLVED judge provider\'s own env var, with the role-named override in front');
  return m[1];
}

// ── the predicate ───────────────────────────────────────────────────────────

test('a close with no judged stage does not judge — the mechanical green case, which must run on the worker key alone', () => {
  assert.equal(closeJudges({ stages: [cmdStage(), cmdStage('lint')] }), false);
  assert.deepEqual(judgedStages({ stages: [cmdStage()] }), []);
});

test('a close with a judged-floor stage DOES judge, and the stages come back in declaration order', () => {
  const decl = { stages: [cmdStage(), judgedStage('a'), cmdStage('lint'), judgedStage('b')] };
  assert.equal(closeJudges(decl), true);
  assert.deepEqual(judgedStages(decl).map((s) => s.name), ['a', 'b'], 'declaration order, not filter-and-sort');
});

test('the returned stages are the SAME objects, not copies — foldJudgedArtifacts mutates them in place', () => {
  const stage = judgedStage();
  const decl = { stages: [stage] };
  assert.equal(judgedStages(decl)[0], stage, 'identity, not a structural clone');
});

test('a malformed or absent declaration is "does not judge", never a throw — the close VALIDATOR rejects those, not this predicate', () => {
  // Callers pass raw specs read off disk and half-built drafts. A throw here
  // would turn a validation red into a crash in the KEY-demand path, which
  // runs before validation has had its say.
  for (const bad of [undefined, null, 42, 'stages', [], {}, { stages: null }, { stages: 'nope' }, { stages: {} }]) {
    assert.equal(closeJudges(bad), false, `${JSON.stringify(bad)} must read as "no judged stages"`);
    assert.deepEqual(judgedStages(bad), []);
  }
});

test('junk INSIDE the stages array is skipped rather than crashing the key decision', () => {
  const decl = { stages: [null, undefined, 7, 'judged-floor', { kind: null }, judgedStage()] };
  assert.equal(closeJudges(decl), true, 'the one real judged stage still counts');
  assert.equal(judgedStages(decl).length, 1, 'and the junk contributes nothing');
});

test('a stage whose kind merely CONTAINS the judged kind is not a judged stage — exact match only', () => {
  assert.equal(closeJudges({ stages: [{ kind: `${JUDGED_FLOOR_KIND}-ish` }, { kind: `x-${JUDGED_FLOOR_KIND}` }] }), false);
});

// ── the runner's demand, pinned at the source ───────────────────────────────

test('scripts/run-u.mjs demands the WORKER key unconditionally and the JUDGE key only when the close judges', () => {
  // A source-level pin, and labelled as one: run-u reaches its key block only
  // with a real job row (a machine-local patient path) and a real signed spec,
  // so the suite cannot execute the branch. What it can prove is that the
  // unconditional Anthropic demand is GONE and the judge demand is gated on
  // the shared predicate rather than on a seventh open-coded reading.
  //
  // PANEL-BUILD.md P0 — this orchestration moved off scripts/run-u.mjs (now
  // a thin adapter) into src/userrun.js's execute(), where `process.env` ->
  // `env` and `process.exit(2)` -> `throw new ExitSignal(2)` (a library
  // function never calls process.exit itself).
  const src = readFileSync(new URL('../src/userrun.js', import.meta.url), 'utf8');

  assert.ok(!/const apiKey = (?:process\.)?env\.ANTHROPIC_API_KEY;\nif \(!apiKey\)/.test(src),
    'the unconditional ANTHROPIC_API_KEY exit is gone — that WAS the defect');
  assert.match(src, /workerApiKey = env\[providerEntry\.envKey\];/,
    'the worker key comes from the provider table\'s own envKey, never a hardcoded variable name');
  assert.match(src, /if \(!workerApiKey\)[\s\S]{0,160}throw new ExitSignal\(2\)/,
    'and it is still ALWAYS required — the worker always runs');
  assert.match(src, /const JUDGES = closeJudges\(spec\.closeDecl\);/,
    'the judge demand asks the shared predicate');
  // Item 32.1 resolves WHICH model judges before deciding whether a key is
  // demanded for it, so the demand now reads a resolved-provider key
  // (following `judgeEntry.envKey`) rather than the pre-item-32 `apiKey`
  // local that assumed the judge was always Anthropic.
  const judgeKeyIdent = judgeKeyIdentifier(src);
  assert.match(src, new RegExp(`if \\(JUDGES && !${judgeKeyIdent}\\)`),
    'and fires only when the close actually judges');
  assert.ok(!/kind === JUDGED_FLOOR_KIND/.test(src),
    'the runner holds NO open-coded copy of the judged-stage predicate');
});

test('the judge key reads JUDGE_API_KEY first and falls back to the RESOLVED judge provider\'s own envKey (PRD item 32.3)', () => {
  // Item 32 moved the fallback off a hardcoded `ANTHROPIC_API_KEY` spelling: the
  // judge is no longer pinned to Anthropic, so the fallback has to follow
  // WHATEVER provider `resolveJudge` names, read out of the same provider table
  // the worker key already goes through — never a second hardcoded variable.
  // PANEL-BUILD.md P0 — this call site is in src/userrun.js now.
  const src = readFileSync(new URL('../src/userrun.js', import.meta.url), 'utf8');
  assert.match(src, /env\.JUDGE_API_KEY \?\? env\[judgeEntry\.envKey\]/,
    'role-named first, fallback second: the fallback follows the RESOLVED provider, never a hardcoded name');
  assert.ok(!/env\.JUDGE_API_KEY \?\? env\.ANTHROPIC_API_KEY/.test(src),
    'the pre-item-32 hardcoded Anthropic fallback is gone — that spelling assumed the judge could only ever be Claude');
});

test('the judge provider is built through the factory only when its key exists — a keyless green run wires null, never a provider holding undefined', () => {
  // Item 32.2 retired the direct `new AnthropicProvider(...)` construction: the
  // judge is now built through `makeProvider`, exactly like the worker, off the
  // judge identity `resolveJudge` handed back — never a literal `AnthropicProvider`
  // import standing in for "the judge".
  //
  // PANEL-BUILD.md P0 — this construction moved into src/userrun.js's
  // execute(), wrapped in a TEST-SEAM guard (`if (!provider) { … }`, the same
  // shape src/cli.js's `doRun` uses): `judgeProvider` is `let`-reassigned,
  // never `const`, and the `apiKey` argument carries a `/** @type {string} */`
  // cast — the patterns below are loosened to match that shape, never the
  // substance (still the SAME factory, still null with no key).
  const src = readFileSync(new URL('../src/userrun.js', import.meta.url), 'utf8');
  const judgeKeyIdent = judgeKeyIdentifier(src);
  assert.match(src, new RegExp(`judgeProvider = ${judgeKeyIdent}\\s*\\n\\s*\\? makeProvider\\(judge\\.provider, \\{ apiKey: [^,]*${judgeKeyIdent}[^,]*, model: judge\\.model`),
    'a provider constructed with apiKey:undefined would fail at CALL time, deep in a close, after the run has been paid for — and it is built through the SAME factory the worker uses, never a hardcoded class');
  assert.match(src, /: null;/, 'the null branch survives: no key, no provider, never one holding undefined');
  assert.ok(!/new AnthropicProvider/.test(src),
    'no direct AnthropicProvider construction survives for the judge — the factory is item 32.2\'s whole point');
});

// ── the sweep: one spelling, everywhere ─────────────────────────────────────

test('no module open-codes the judged-stage filter any more — the six duplicates are one shared reading', () => {
  // src/kinds.js itself and src/declaredclose.js:235 are the exceptions and
  // stay: kinds.js DEFINES the predicate, and declaredclose's remaining use is
  // a per-stage branch inside a loop over one stage, not a declaration-level
  // question about whether a close judges at all.
  const files = [
    'src/cardauthor.js', 'src/authorjob.js', 'src/authoring.js',
    // PANEL-BUILD.md P0 — scripts/run-u.mjs and scripts/run-author.mjs are
    // now thin adapters (no logic of their own left to open-code anything
    // in); scripts/author-readout.mjs moved to src/authorreadout.js
    // outright (rootDir). The real orchestration this sweep is checking
    // lives in src/userrun.js, src/authorrun.js and src/authorreadout.js now.
    'scripts/run-author.mjs', 'scripts/run-u.mjs', 'src/userrun.js',
    'src/authorrun.js', 'src/authorreadout.js',
  ];
  for (const f of files) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(!/\.(?:filter|some)\([\s\S]{0,100}?kind === JUDGED_FLOOR_KIND/.test(src),
      `${f} still open-codes the judged-stage predicate — use judgedStages/closeJudges`);
  }
});
