// R3 (Addendum 2026-11-17 (b), hamr 2026-11-17): PINNING tests of the flow as it works today, no code change. `~` gets a code check; a `!` row built from a line's own words still
// appears; `$` defaults stay; a step with no `~` still gives its Not checked line. Each assertion was shown to FAIL against a mutated scratch copy of the src.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CheckBlock } from '../src/checkblock.js';
import { cardOfClose, PROSE_WORDS } from '../src/rubricstep.js';

const TEXT = 'Release notes\n## [0.54.1] - 2026-11-04\nFixed the panel. Amount due is 40 dollars.\n';
// line 1 has a `~` rule; line 2 is plain prose that names the heading it wants found
const JOB = [
  { n: 1, text: 'Summarise the release', rules: ['at most 80 words'] },
  { n: 2, text: 'Find the line "## [0.54.1] - 2026-11-04"', rules: [] },
];
/** the block as the draft flow builds it: job, guards, then a look that names a fact on line 2 only */
function made() {
  const b = new CheckBlock({ texts: { a: TEXT }, labels: ['a'], asks: false });
  b.fromJob(JOB); b.setGuards(['changed-from-seed']);
  b.addLook([{ line: 2, name: 'heading', shape: 'phrase', words: ['## [0.54.1] - 2026-11-04'], source: 'a' }], []);
  const v = b.closeView();
  const closeDecl = { genre: 'text', lang: 'text', stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: {} }, ...v.stages], list: v.list, picks: v.picks };
  return { b, v, closeDecl };
}

test('a `~` rule gets a code check: its row is `~ [you]`, built, and the line\'s stage carries a counting part', () => {
  const { b, v } = made();
  const rule = b.rows.find((r) => r.kind === 'rule' && r.line === 1);
  assert.equal(rule.by, 'you');
  assert.equal(rule.state, 'built', JSON.stringify(rule));
  const st = v.stages.find((s) => s.fromLine?.includes(1));
  assert.ok(st, 'line 1 has a stage');
  assert.ok(st.params.parts.some((p) => p.class === 'countable'), JSON.stringify(st.params.parts));
});

test('a `!` row built from a line\'s own words still appears, tagged agent, built', () => {
  const { b, closeDecl } = made();
  const f = b.rows.find((r) => r.kind === 'fact' && r.line === 2);
  assert.ok(f, 'the look fact on line 2 is a row');
  assert.equal(f.by, 'agent');
  assert.equal(f.state, 'built', JSON.stringify(f));
  assert.ok(closeDecl.list.some((r) => r.kind === 'fact' && r.line === 2 && r.by === 'agent' && r.state === 'built'));
});

test('`$` defaults stay: the per-line floor is built on every line', () => {
  const { b } = made();
  for (const n of [1, 2]) {
    const fl = b.rows.find((r) => r.kind === 'floor' && r.line === n);
    assert.ok(fl, `line ${n} floor`);
    assert.equal(fl.by, 'default');
    assert.equal(fl.state, 'built');
  }
});

test('a text step with no `~` rule still gives its Not checked line, and a facts line (line 2) never gets one', () => {
  const { b, closeDecl } = made();
  const noRule = [{ n: 1, text: 'Summarise the release', rules: [] }];
  const b2 = new CheckBlock({ texts: { a: TEXT }, labels: ['a'], asks: false });
  b2.fromJob(noRule); b2.setGuards(['changed-from-seed']); b2.addLook([], []);
  const v2 = b2.closeView();
  const decl2 = { genre: 'text', lang: 'text', stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: {} }, ...v2.stages], list: v2.list, picks: v2.picks };
  assert.ok(cardOfClose({ closeDecl: decl2, jobLines: noRule }).notChecked.includes(`line 1: ${PROSE_WORDS}`), JSON.stringify(cardOfClose({ closeDecl: decl2, jobLines: noRule }).notChecked));
  assert.equal(cardOfClose({ closeDecl, jobLines: JOB }).notChecked.includes(`line 2: ${PROSE_WORDS}`), false);
  assert.ok(b.rows.length > 0);
});
