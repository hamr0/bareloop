// The draft readout (hamr 2026-11-15, copied from fwdloop v0.34.0): ONE pure owner (src/authorreadout.js buildReadout) that reads the signed spec through the card's own readers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReadout, readoutHeadIndexes, READOUT_HEADS } from '../src/authorreadout.js';
import { cardOfClose, fenceOfClose, fenceRowText, FENCE_KEY } from '../src/rubricstep.js';
import { jobSpecHash } from '../src/job.js';
import { ticketFilterWords } from '../src/ticketfilter.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (/** @type {string} */ f) => JSON.parse(readFileSync(join(HERE, 'fixtures', f), 'utf8'));
const REPO = () => load('repo-list/smwhvmfsxd5t8-spec.json');
const RUBRIC = () => load('mv5bk400-resolved-spec.json');
const base = (/** @type {any} */ spec, /** @type {any} */ o = {}) => buildReadout({ spec, rounds: 3, costUsd: 0.0123, spendComplete: true, specHash: 'hash123', modelId: 'deepseek-flash', ...o });
const linesOf = (/** @type {string} */ t, /** @type {string} */ prefix) => t.split('\n').filter((l) => l.trimStart().startsWith(prefix)).map((l) => l.trimStart().slice(prefix.length));

for (const [kind, get] of /** @type {[string, () => any][]} */ ([['repo', REPO], ['rubric', RUBRIC]])) {
  test(`readout (${kind}): every kept section is present and the fwd-only ones are absent`, () => {
    const t = base(get(), { source: '/some/repo', destination: 'src/', humans: [{ question: 'Which file?', answer: 'src/sum.js', line: 1 }] });
    assert.match(t, /^DRAFT READOUT — NOT SIGNED — job /);
    assert.match(t, /Drafted by: deepseek-flash in 3 round\(s\), cost \$0\.01/);
    assert.match(t, /Cap: \$0\.50 \(money\) · .+ \(time\)/);
    for (const h of Object.values(READOUT_HEADS)) assert.ok(t.split('\n').includes(h), `head ${h}`);
    assert.match(t, /Plan hash: hash123/);
    assert.match(t, /line 1: Which file\? — src\/sum\.js/);
    assert.match(t, /destination = src\//);
    for (const gone of ['ASKS', 'SEND TARGET', 'Flows root', 'grants:', 'emits:']) assert.ok(!t.includes(gone), gone);
    assert.deepEqual(readoutHeadIndexes(t).map((i) => t.split('\n')[i]), t.split('\n').filter((l, i) => i === 0 || Object.values(READOUT_HEADS).includes(/** @type {any} */ (l))));
    assert.equal(readoutHeadIndexes(t)[0], 0, 'the header line is drawn bold');
  });

  test(`readout (${kind}): check lines and tags are exactly the card's rows for the same signed close`, () => {
    const spec = get();
    const card = cardOfClose({ closeDecl: spec.closeDecl, jobLines: spec.jobLines });
    assert.ok(card.checkItems.length > 0);
    const t = base(spec);
    const got = [...linesOf(t, 'check: '), ...linesOf(t, 'always: ')].sort();
    const want = card.checkItems.filter((c) => c.key !== FENCE_KEY).map((c) => `${c.text} [${c.by}]`).sort();
    assert.deepEqual(got, want);
    for (const n of card.notChecked) assert.ok(t.includes(n), `Not checked: ${n}`);
  });

  test(`readout (${kind}): the fence line is the one owner's words`, () => {
    const spec = get();
    const fence = fenceOfClose(spec.closeDecl);
    assert.ok(fence);
    const lines = base(spec).split('\n');
    assert.equal(lines[lines.indexOf(READOUT_HEADS.fence) + 1], `  ${fenceRowText(fence)}`);
  });

  test(`readout (${kind}): it is display only, the spec and its hash do not move`, () => {
    const spec = get();
    const before = jobSpecHash(spec);
    const copy = structuredClone(spec);
    base(spec, { humans: [{ question: 'q', answer: 'a' }] });
    assert.deepEqual(spec, copy);
    assert.equal(jobSpecHash(spec), before);
  });
}

test('readout: a planted secret in a job line, an answer or a model id is masked', () => {
  const key = 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const spec = REPO();
  spec.jobLines[0].text = `Fix it with ${key}`;
  const t = base(spec, { humans: [{ question: `Use ${key}?`, answer: key, line: 1 }], source: key });
  assert.ok(!t.includes(key));
  assert.match(t, /REDACTED/);
});

test('readout: an unpriced call reads "at least", a priced one does not; rounds are what the caller counts', () => {
  assert.match(base(REPO(), { spendComplete: false }), /cost at least \$0\.01 \(a provider call is unpriced\)/);
  assert.doesNotMatch(base(REPO(), { spendComplete: true }), /at least/);
  assert.match(base(REPO(), { rounds: 7 }), /in 7 round\(s\)/);
});

test('readout: no time cap in the spec reads unbounded, never 0', () => {
  const spec = RUBRIC();
  assert.equal(spec.maxWallMs, undefined);
  assert.match(base(spec), /no time cap set \(time\)/);
});

test('readout: a Tickets job gets its ticket filter row; a plain job has none', () => {
  const spec = REPO();
  assert.doesNotMatch(base(spec), /ticket filter/);
  spec.ticketFilter = { priority: ['P1'] };
  assert.ok(base(spec).includes(`ticket filter: ${ticketFilterWords(spec.ticketFilter)}`));
});

test('the CLI "SIGNING PREPARED" block prints the same buildReadout text (read from source, the repo idiom for the runner: it is reachable only after paid calls)', () => {
  const src = readFileSync(join(HERE, '..', 'src', 'authorrun.js'), 'utf8');
  const block = src.slice(src.indexOf("out('\\nSIGNING PREPARED"), src.indexOf("out('\\nTo run it"));
  assert.ok(block.length > 100, 'the SIGNING PREPARED block moved');
  assert.match(block, /buildReadout\(\{ spec, rounds: totalCost\.calls\.length, costUsd: totalCost\.knownUsd, spendComplete: totalCost\.spendComplete, specHash: hash \}\)/);
});

test('readout: a replaced rule is shown by what was decided, never by the question that quotes its old words', () => {
  const q = 'Your line 1 says "not a red-eye". I read it as: departure between 05:00 and 23:59. Agree?';
  const t = base(REPO(), { humans: [
    { question: q, answer: 'agree', line: 1, choice: 'agree', words: 'departure between 05:00 and 23:59' },
    { question: q, answer: 'depart after 6am', line: 2, choice: 'rule', words: 'depart after 6am' },
    { question: q, answer: 'drop', line: 3, choice: 'drop' },
    { question: 'Which file?', answer: 'src/sum.js', line: 4 },
  ] });
  assert.match(t, /^ {2}line 1: agreed — departure between 05:00 and 23:59$/m);
  assert.match(t, /^ {2}line 2: you wrote — depart after 6am$/m);
  assert.match(t, /^ {2}line 3: dropped — Not checked$/m);
  assert.match(t, /^ {2}line 4: Which file\? — src\/sum\.js$/m);
  assert.doesNotMatch(t, /red-eye|Agree\?/);
});
