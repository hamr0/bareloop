// R10 keep-both: a fact on a line AND the person's agreed picks (listItems, maxWords) on the same line. Real refused declarations
// from the paid R10 draft logs (panel sessions smw9che4f38xv, smw9chq27j9rl; trimmed copies under tests/fixtures), real bareguard grades.
// The drafter's own countable, a `cited` part or a forged second stage beside a fact stays red; only the person's recorded picks are kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDeclaration, classGuards, catalogueForLang, RUBRIC_LANG, genreForLang } from '../src/authoring.js';
import { validateCloseDecl } from '../src/declaredclose.js';
import { gradeStep, sha256Of, lineBriefs, stepFileContract, buildStepSpec } from '../src/rubricstep.js';
import { CheckBlock } from '../src/checkblock.js';

const fx = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const { D2, D3 } = JSON.parse(fx('r10-keepboth-refused.json'));
const CHANGELOG = fx('r10-keepboth-changelog.md');
const jobLines = [{ n: 1, text: 'Summarise the latest release in the changelog', rules: ['exactly 3 list items', 'at most 80 words'] }]; // one rule in, one rule out: the final words of the two picked rules
// the person's two picks, as the record carries them (a `maxWords` and a `listItems` on the line's two rules)
const PICKS = [{ line: 1, rule: 1, check: { rule: 'listItems', value: 3 }, added: 'exactly 3 list items' }, { line: 1, rule: 2, check: { rule: 'maxWords', value: 80 }, added: 'at most 80 words' }];
const opts = () => ({
  catalogue: catalogueForLang(RUBRIC_LANG), listing: ['input/CHANGELOG.md', 'output/.gitkeep'], guards: classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG }),
  envOwned: [], verdictType: 'soft-green', writeScope: ['output/'], jobLines, inputLabels: ['Changelog'],
});
/**
 * The plan the check block builds from a saved draft's fact parts (they are the look's facts now) and the person's picks, through the draft gate: `picked` = which picks are settled (null = none).
 * The AI writes no parts any more, so the declaration is the block's own; a `picks` record rides it as the signed gate reads it.
 */
const built = (/** @type {any} */ d, /** @type {any[]|null} */ picked = PICKS) => {
  const facts = d.stages.filter((/** @type {any} */ s) => s.kind === 'rubric-step').flatMap((/** @type {any} */ s) => s.params.parts.filter((/** @type {any} */ p) => p.class === 'fact').flatMap((/** @type {any} */ p) => p.facts.map((/** @type {any} */ f) => ({ line: s.params.step, name: f.name, shape: f.shape, source: p.source, words: [f.phrase] }))));
  const count = d.stages.filter((/** @type {any} */ s) => s.kind === 'rubric-step').flatMap((/** @type {any} */ s) => s.params.parts.filter((/** @type {any} */ p) => p.count).map((/** @type {any} */ p) => p.count))[0];
  const b = new CheckBlock({ texts: { Changelog: CHANGELOG }, labels: ['Changelog'], asks: false });
  b.fromJob([{ n: 1, text: 'Summarise the latest release in the changelog', rules: picked ? ['exactly 3 list items', 'at most 80 words'] : ['exactly 3 bullets', 'under 80 words'] }]);
  b.addLook(facts);
  if (picked) b.carry({ picks: picked });
  if (count) b.applyDelta({ edits: [{ op: 'add', kind: 'count', line: 1, ...count }] });
  const c = b.reconcile();
  const picks = c.map.flatMap((/** @type {any} */ m) => { const part = c.parts[m.part]; return part.class === 'countable' && Array.isArray(part.rules) ? [{ line: m.line, part }] : []; });
  return { stages: [...classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG }).map((g) => ({ name: g.name, kind: g.kind, params: { ...g.params, allowPrefixes: ['output/'] } })), ...c.stages], ...(picks.length ? { picks } : {}), refused: b.rows.filter((r) => r.kind === 'rule' && r.state !== 'built').map((r) => ({ line: r.line, rule: r.rule, reason: String(r.reason) })) };
};
const chain = (/** @type {any} */ d, /** @type {any[]|null} */ picked = PICKS) => validateDeclaration(built(d, picked), opts());
const codes = (v) => v.reds.map((r) => `${r.code} ${r.path}`);
const withPart = (d, part) => ({ ...d, stages: d.stages.map((s) => (s.kind === 'rubric-step' ? { ...s, params: { ...s.params, parts: [...s.params.parts, part] } } : s)) });
const stageOf = (v) => v.declaration.stages.filter((s) => s.kind === 'rubric-step');

for (const [name, d] of [['D2', D2], ['D3', D3]]) {
  test(`${name}: the real refused fact declaration plus the person's two picks validates, one stage, fact + both picks`, () => {
    const v = chain(d);
    assert.deepEqual(codes(v), []);
    assert.equal(v.ok, true);
    const [st] = stageOf(v);
    assert.equal(stageOf(v).length, 1);
    assert.deepEqual(st.params.parts.map((p) => p.class + ':' + (p.check ?? '')), ['fact:', 'countable:listItems', 'countable:maxWords']);
    assert.deepEqual(st.params.parts.slice(1).map((p) => p.rules), [[1], [2]]);
  });
}

test('a drafter-written countable beside a fact stays red (no pick settled for the line)', () => {
  const v = validateDeclaration(withPart(built(D3, null), { text: 'under 80', class: 'countable', check: 'maxWords', value: 80, rules: [2] }), opts()); // no pick settled: a countable beside the fact is a forged one
  assert.equal(v.ok, false);
  assert.ok(codes(v).some((c) => c.startsWith('rubric-fact-text')), codes(v).join(' | '));
});

// (deleted: "a drafter-written `picks` record is thrown away when no pick is settled" - the AI sends row edits, never a `picks` record, so a forged record is inexpressible; the signed gate tests below still refuse a forged count)

test('a drafter-written `cited` countable beside a fact stays red even when picks are settled', () => {
  const v = validateDeclaration(withPart(built(D3), { text: 'c', class: 'countable', check: 'cited', source: 'Changelog', rules: [1] }), opts());
  assert.equal(v.ok, false);
  assert.ok(codes(v).some((c) => c.startsWith('rubric-fact-text')));
});

test('a forged second stage on the fact line stays red, picks or not', () => {
  const second = { name: 'line-1-text', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [{ text: 'x', class: 'countable', check: 'maxWords', value: 5, rules: [2] }] } };
  const b3 = built(D3);
  const v = validateDeclaration({ ...b3, stages: [...b3.stages, second] }, opts());
  assert.equal(v.ok, false);
  assert.ok(codes(v).some((c) => c.startsWith('rubric-step-twice')));
});

// the SIGNED gate: the record travels in the closeDecl (`picks`), so the runner and prepareSigning hold the same line as the draft gate
const signed = (v, extra = {}) => ({ genre: genreForLang(RUBRIC_LANG), lang: RUBRIC_LANG, stages: v.declaration.stages, picks: v.declaration.picks, ...extra });
const signedOpts = () => ({ deferListing: true, verdictType: 'soft-green', writeScope: ['output/'], jobLines, inputLabels: ['Changelog'] });
test('the signed gate: the recorded picks pass', () => {
  const r = validateCloseDecl(signed(chain(D3)), signedOpts());
  assert.deepEqual(r.reds.map((x) => `${x.code} ${x.path}`).filter((c) => c.startsWith('rubric') || c.startsWith('invalid')), []);
});
test('the signed gate: a countable that is not in the recorded picks is refused (a forged count)', () => {
  const v = chain(D3);
  const forged = signed(v);
  forged.stages = forged.stages.map((s) => (s.kind === 'rubric-step' ? { ...s, params: { ...s.params, parts: s.params.parts.map((p) => (p.check === 'maxWords' ? { ...p, value: 500 } : p)) } } : s));
  const r = validateCloseDecl(forged, signedOpts());
  assert.ok(r.reds.some((x) => x.code === 'rubric-fact-text'), r.reds.map((x) => x.code).join(','));
});
test('the signed gate: a fact line with a countable and NO record is refused', () => {
  const v = chain(D3);
  const { picks: _p, ...bare } = signed(v);
  const r = validateCloseDecl(bare, signedOpts());
  assert.ok(r.reds.some((x) => x.code === 'rubric-fact-text'));
});
test('the signed gate: a record entry that is not an {line, part} is a plain red', () => {
  const r = validateCloseDecl({ ...signed(chain(D3)), picks: [{ line: 'one' }] }, signedOpts());
  assert.ok(r.reds.some((x) => x.path.endsWith('picks[0]')), r.reds.map((x) => x.path).join(','));
});

// ---- the grade: real bareguard, both files' halves in ONE output/steps/1.json -------------------------------------------------------------------
const sha = sha256Of(CHANGELOG);
const words = (t) => t.trim().split(/\s+/).length;
const b1 = '- The review door no longer says a rubric green earns no learning credit.';
const b2 = '- A step ended by a money or time cap now reads capped, not failed.';
const b3 = '- Climb and fold no longer compare card pairs already in one family.';
const b4 = '- Readout wording was aligned with the current rule.';
const pad = (s) => `${s} This extra sentence only pads the answer so that the whole text runs well past the limit.`;
const QUOTE = { D2: '### Changed', D3: '## [0.54.1] - 2026-11-04' };
const samples = (q) => {
  const ok = [{ quote: q, values: {} }];
  return {
    s1: [{ results: ok, text: [b1, b2, b3].join('\n') }, 'green', null],
    s2: [{ results: ok, text: [b1, b2, b3, b4].join('\n') }, 'red', /4 list items/],
    s3: [{ results: ok, text: [pad(b1), pad(b2), pad(b3)].join('\n') }, 'red', /words, at most 80/],
    s4: [{ results: [], text: [b1, b2, b3].join('\n') }, 'red', /no results/i],
    s6: [{ results: ok }, 'red', null],
  };
};
for (const [name, d] of [['D2', D2], ['D3', D3]]) {
  test(`${name}: s1 (fact quote + 3 bullets + 42 words) green; s2 s3 s4 s6 red; through the real bareguard grade`, async () => {
    const [st] = stageOf(chain(d));
    assert.equal(words([b1, b2, b3].join('\n')), 42);
    for (const [sn, [obj, want, gap]] of Object.entries(samples(QUOTE[name]))) {
      const bytes = JSON.stringify(obj);
      const g = await gradeStep({ params: st.params, bytes, outputBytes: bytes, inputs: { Changelog: CHANGELOG }, factQuotes: {}, factMissing: [] }, { Changelog: sha });
      assert.equal(g.verdict, want, `${sn}: ${g.verdict} ${g.gapLines.join(' / ')}`);
      if (gap) assert.match(g.gapLines.join('\n'), gap, sn);
    }
  });
}

test('the floor: a fact line whose only pick is a maxWords and whose file has NO text is red, not green', async () => {
  const [st] = stageOf(chain(D3, [{ ...PICKS[1], rule: 1 }]));
  assert.ok(st.params.parts.some((p) => p.check === 'maxWords') && !st.params.parts.some((p) => p.check === 'listItems'));
  const bytes = JSON.stringify({ results: [{ quote: QUOTE.D3, values: {} }] });
  const g = await gradeStep({ params: st.params, bytes, outputBytes: bytes, inputs: { Changelog: CHANGELOG }, factQuotes: {}, factMissing: [] }, { Changelog: sha });
  assert.equal(g.verdict, 'red');
  assert.match(g.gapLines.join('\n'), /"text" is missing or empty/);
  // a pure fact line (no pick) still has no text floor
  const pure = D3.stages.find((s) => s.kind === 'rubric-step').params;
  assert.equal(buildStepSpec(pure, { Changelog: sha }).checkpoints['1'].checks.some((c) => c.id === 'text-present'), false);
});

test('the worker is told both halves: the line brief and the general contract', () => {
  const [st] = stageOf(chain(D3));
  const brief = lineBriefs({ stages: [st] })[0].text;
  assert.match(brief, /FACTS line AND a TEXT line/);
  assert.match(brief, /"results": \[.*\], "text": "..."/);
  const pureBrief = lineBriefs({ stages: D3.stages })[0].text;
  assert.match(pureBrief, /FACTS line\. Write .* and nothing else/);
  const contract = stepFileContract();
  assert.match(contract, /holds a "text" too only when the brief says it is also a TEXT line/);
  assert.doesNotMatch(contract, /ONLY \{"results"|no "text" and no "cites"/);
});
