// R10 tick 4 (PRD v1.131, hamr's ruling 2026-11-09): after the LAST try of a RUBRIC draft failed the gate, the AI's own broken parts are dropped to Not checked and the plan is checked ONCE
// more; a part the person's picks built is never dropped (the plan is refused as today). The declarations are the REAL last tries of paid rounds 4 and 4b (tests/fixtures/r10-sourcefill-drafts.json)
// and the 21 real declarations that already passed (tests/fixtures/r10-dropextras-passing.json). Real bareguard; the model is a script. No network.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDeclaration, classGuards, catalogueForLang, RUBRIC_LANG } from '../src/authoring.js';
import { withFactBindings, withDropNotes, settlePersonsWords } from '../src/rubricstep.js';
import { checkDeclarationWords } from '../src/factwords.js';
import * as cp from '../src/checkpick.js';
import * as af from '../src/authorflow.js';
import { proveRubricInputs } from '../src/source.js';
import { buildSeedListing } from '../src/authorscout.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(join(HERE, 'fixtures', 'r10-sourcefill-drafts.json'), 'utf8'));
const PASSING = JSON.parse(readFileSync(join(HERE, 'fixtures', 'r10-dropextras-passing.json'), 'utf8'));
const CHANGELOG = join(HERE, 'fixtures', 'r10-countable-changelog.md');
const TEXT = readFileSync(CHANGELOG, 'utf8');
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'r10-dropextras-')); made.push(d); return d; };

const RULES = ['exactly 3 bullets', 'under 80 words'];
/** the job's lines, rules and settled picks the way the draft gate has them, from a saved picks record */
function ctxOf(/** @type {any[]|null} */ rec) {
  const added = (rec ?? []).map((p) => p.added).filter((/** @type {any} */ a) => typeof a === 'string');
  const jobLines = [{ n: 1, text: 'Summarise the latest release in the changelog', rules: [...RULES, ...added] }];
  const rules = RULES.map((text, i) => ({ line: 1, rule: i + 1, text }));
  const picks = (rec ?? []).map((p) => ({ line: 1, rule: RULES.indexOf(p.ruleText) + 1, check: p.check, ...(p.added ? { added: p.added } : {}), ...(p.own ? { own: true } : {}) })).filter((p) => p.rule > 0);
  const left = (rec ?? []).filter((p) => p.left).map((p) => ({ line: 1, rule: RULES.indexOf(p.ruleText) + 1 }));
  return { jobLines, rules, picks, left, settled: rec ? cp.settleRules(rules, picks, left, jobLines) : null };
}
const opts = (jobLines) => ({ catalogue: catalogueForLang(RUBRIC_LANG), listing: ['input/CHANGELOG.md', 'output/.gitkeep'], guards: classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG }), envOwned: [], verdictType: 'soft-green', writeScope: ['output/'], jobLines, inputLabels: ['Changelog'] });
/** the draft gate as authorflow runs it: settle, then validate and the words check; `pre` is what is validated */
function gateOf(d, rec) {
  const c = ctxOf(rec);
  const pre = withFactBindings(withDropNotes(settlePersonsWords(cp.fillAndMergeFacts(cp.applyPicks(cp.moveUncheckable(d, c.jobLines, true), c.settled), ['Changelog'], true), c.jobLines), undefined, c.jobLines));
  const redo = (/** @type {any} */ x) => {
    let v = validateDeclaration(x, opts(c.jobLines));
    if (v.ok) { const w = checkDeclarationWords(v.declaration, { Changelog: TEXT }, null); if (w.length) v = { ...v, ok: false, reds: [...v.reds, ...w], declaration: null }; }
    return v;
  };
  return { c, pre, v: redo(pre), redo };
}
const partsOf = (d) => d.stages.filter((s) => s.kind === 'rubric-step').flatMap((s) => s.params.parts);
const sortKeys = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

for (const key of ['d8-r4-revise-2', 'd1-4b-revise-2', 'd4-4b-revise-2']) {
  test(`${key}: red on the last try, the AI's broken part is dropped to Not checked, the plan passes once more, both picks kept and the picks record identical`, () => {
    const { c, pre, v, redo } = gateOf(FX[key].declaration, FX[key].picksRecord);
    assert.equal(v.ok, false, 'the last try is red at the parent of this change');
    const out = af.dropAfterLastTry({ pre, v, jobLines: c.jobLines, redo });
    assert.ok(out, 'rescued');
    assert.equal(out.v.ok, true, JSON.stringify(out.v.reds));
    assert.equal(sortKeys(out.pre.picks), sortKeys(pre.picks), 'the picks record is identical');
    assert.equal(out.pre.picks.length, 2);
    for (const k of out.pre.picks) assert.ok(partsOf(out.v.declaration).some((p) => sortKeys(p) === sortKeys(k.part)), 'each pick is still the same stage part');
    assert.ok(out.v.declaration.notes.some((n) => n.includes(cp.DROPPED_WORDS)), 'the dropped words are listed under Not checked');
    assert.ok(partsOf(out.v.declaration).length < partsOf(pre).length, 'a part was dropped');
  });
}

test('a red on a part the person\'s picks built is never dropped: the plan is refused as today, nothing dropped', () => {
  const { c, pre, v, redo } = gateOf(FX['d8-r4-revise-2'].declaration, FX['d8-r4-revise-2'].picksRecord);
  const si = pre.stages.findIndex((s) => s.kind === 'rubric-step');
  const pi = pre.stages[si].params.parts.findIndex((p) => sortKeys(p) === sortKeys(pre.picks[0].part));
  assert.ok(pi >= 0);
  assert.deepEqual(Object.keys(/** @type {any} */ (cp.dropExtras(pre, [{ code: 'x', path: `stages[${si}].params.parts[${pi}]` }], c.jobLines))), ['refused']);
  // one red on a pick beside a red on a droppable part: still refused whole
  const fact = pre.stages[si].params.parts.findIndex((p) => p.class === 'fact');
  assert.ok('refused' in /** @type {any} */ (cp.dropExtras(pre, [{ code: 'x', path: `stages[${si}].params.parts[${fact}]` }, { code: 'y', path: `stages[${si}].params.parts[${pi}]` }], c.jobLines)));
  assert.equal(af.dropAfterLastTry({ pre, v: { ok: false, reds: [{ code: 'x', path: `stages[${si}].params.parts[${pi}]` }] }, jobLines: c.jobLines, redo }), null);
  assert.ok(v.reds.length > 0);
});

test('a red that is not tied to one part, a red on a guard, or no red at all: refused, nothing dropped', () => {
  const { c, pre } = gateOf(FX['d8-r4-revise-2'].declaration, FX['d8-r4-revise-2'].picksRecord);
  assert.ok('refused' in /** @type {any} */ (cp.dropExtras(pre, [{ code: 'x', path: 'stages[0].params' }], c.jobLines)));
  assert.ok('refused' in /** @type {any} */ (cp.dropExtras(pre, [{ code: 'x' }], c.jobLines)));
  assert.ok('refused' in /** @type {any} */ (cp.dropExtras(pre, [], c.jobLines)));
  assert.ok('refused' in /** @type {any} */ (cp.dropExtras(pre, [{ code: 'x', path: 'stages[1].params.parts[99]' }], c.jobLines)));
  const guarded = { ...pre, stages: pre.stages.map((s, i) => (i === 1 ? { ...s, params: { ...s.params, parts: [{ class: 'guard', text: 'web' }, ...s.params.parts] } } : s)) };
  assert.ok('refused' in /** @type {any} */ (cp.dropExtras(guarded, [{ code: 'x', path: 'stages[1].params.parts[0]' }], c.jobLines)));
  assert.equal(sortKeys(pre), sortKeys(gateOf(FX['d8-r4-revise-2'].declaration, FX['d8-r4-revise-2'].picksRecord).pre), 'the input is never touched');
});

test('a dropped part that carried a ~ rule no other part carries lists that rule under Not checked (refused entry with the reason)', () => {
  const d = { stages: [{ name: 's', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [{ class: 'fact', source: 'Changelog', text: 'the version', rules: [2], facts: [{ name: 'v', shape: 'phrase', phrase: 'zzz' }] }] } }] };
  const out = /** @type {any} */ (cp.dropExtras(d, [{ code: 'rubric-fact-text', path: 'stages[0].params.parts[0]' }], [{ n: 1, text: 'x', rules: ['a', 'b'] }]));
  assert.deepEqual(out.declaration.refused, [{ line: 1, rule: 2, reason: cp.DROPPED_WORDS }]);
  assert.equal(out.declaration.stages[0].params.parts.length, 0);
});

test('the 21 real declarations that already passed come out byte-identical: the hook never touches a passing draft', () => {
  assert.equal(PASSING.length, 21);
  for (const e of PASSING) {
    const { c, pre, v, redo } = gateOf(e.declaration, e.picksRecord);
    assert.equal(v.ok, true, e.id);
    assert.equal(af.dropAfterLastTry({ pre, v, jobLines: c.jobLines, redo }), null, `${e.id}: nothing to drop`);
  }
});

// ---- the whole drafting loop on the real declaration ----------------------------------------------------------------------------------------
async function loop({ calls, maxRevisions, lang = RUBRIC_LANG }) {
  const file = join(tmp(), 'CHANGELOG.md'); copyFileSync(CHANGELOG, file);
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(proved.ok, true);
  if (!proved.ok) throw new Error('unreachable');
  const prep = proved.prep;
  const c = ctxOf(FX['d8-r4-revise-2'].picksRecord);
  let n = 0;
  const generate = async (/** @type {any} */ _m, /** @type {any} */ tools) => {
    await tools.find((/** @type {any} */ t) => t.name === af.DECLARATION_TOOL_NAME).execute(calls[Math.min(n, calls.length - 1)]);
    n += 1;
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  /** @type {any[]} */ const phases = [];
  const r = await af.authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang, verdictType: 'soft-green',
    answers: { 1: '1. Summarise the latest release in the changelog' }, questions: { 1: af.GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }] }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines: c.jobLines, inputs: [{ n: 1, label: 'Changelog', value: file }],
    checkPicks: { rules: c.rules, picks: c.picks, left: c.left }, maxRevisions,
    onPhase: (/** @type {string} */ name, /** @type {any} */ data) => phases.push({ name, data }),
  });
  return { r, phases, c };
}

test('authorClose, one try only: the last try is red, the drop rescues it, the retention record counts the drop', async () => {
  const { r, phases } = await loop({ calls: [FX['d8-r4-revise-2'].declaration], maxRevisions: 0 });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(r.declaration.picks.length, 2);
  assert.ok(r.declaration.notes.some((/** @type {string} */ n) => n.includes(cp.DROPPED_WORDS)));
  const rec = phases.filter((p) => p.name === 'draft-retention');
  assert.equal(rec.length, 1);
  assert.deepEqual(rec[0].data.lines.map((/** @type {any} */ l) => [l.line, l.picks, l.dropped > 0, l.kept + l.dropped === l.aiParts]), [[1, true, true, true]]);
});

test('authorClose: a try that is NOT the last is never dropped for; the drop happens on the last one only', async () => {
  const bad = FX['d8-r4-revise-2'].declaration;
  const alsoBad = { ...bad, notes: [...bad.notes, 'a second look'] };
  const { r } = await loop({ calls: [bad, alsoBad], maxRevisions: 1 });
  assert.equal(r.iterations[0].validation.ok, false, 'try 1 stays red');
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(r.finalFrom, 'revise-1');
});

test('authorClose: a red on a pick-free plan the drop cannot explain still ends refused (no part to drop for: a stage-level red)', async () => {
  const d = { stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }] };
  const { r } = await loop({ calls: [d], maxRevisions: 0 });
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'max-revisions');
});

test('wiring: the hook runs only on the last try of a rubric job, after the words check, and the re-check is the same one helper', () => {
  const src = readFileSync(join(HERE, '..', 'src', 'authorflow.js'), 'utf8');
  assert.match(src, /if \(!v\.ok && lang === RUBRIC_LANG && i === revisionCap\) \{\s*const dropped = dropAfterLastTry\(\{ pre, v, jobLines, redo: checkDraft \}\);/);
});
