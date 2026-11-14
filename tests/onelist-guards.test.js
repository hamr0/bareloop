// Addendum 2026-11-14 (c) piece 2: the mandatory guards are `$ [default]` rows of the one list, ONCE for the whole job (not per line); the separate "Always checked" box keeps only the write fence for a job
// that carries them. Real saved signed spec: tests/fixtures/check-list-live-mwc2u3yh/resolved-spec.json (its close has the `changed-from-seed` guard stage and no guard row: an OLD record).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CheckBlock } from '../src/checkblock.js';
import { ROW_EDIT_TOOL } from '../src/rowedit.js';
import { validateCloseDecl } from '../src/declaredclose.js';
import { authorClose, GREEN_QUESTIONS, confirmProtections } from '../src/authorflow.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { proveRubricInputs } from '../src/source.js';
import { buildSeedListing } from '../src/authorscout.js';
import { cardOfClose, checksOfClose, listMatchesClose } from '../src/rubricstep.js';
import { planFromSpec, planFromConfirm } from '../src/panel/jobplan.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC = JSON.parse(readFileSync(join(HERE, 'fixtures/check-list-live-mwc2u3yh/resolved-spec.json'), 'utf8'));
const GUARD = { line: 0, key: 'J.$guard.changed-from-seed', from: 'default', by: 'default', kind: 'guard', state: 'built' };
const NEW = { ...SPEC.closeDecl, list: [...SPEC.closeDecl.list, GUARD] };
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'onelist-guards-')); made.push(d); return d; };

test('authorClose signs ONE guard row for the whole job (line 0, `$` default), beside the line rows', async () => {
  const texts = { Changelog: '## [0.54.1] - 2026-11-04\n### Fixed\n- one\n' };
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  if (!proved.ok) throw new Error('unreachable');
  const prep = proved.prep;
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const block = new CheckBlock({ texts, labels: ['Changelog'] });
  block.fromJob([{ n: 1, text: 'Summarise' }, { n: 2, text: 'Say more' }]); block.addLook([], []); block.reconcile();
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green', answers: { 1: '1. x' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }] }, calls: [], raws: [] }, listing, writeScope: ['output/'],
    jobLines: [{ n: 1, text: 'Summarise' }, { n: 2, text: 'Say more' }], inputs: [{ n: 1, label: 'Changelog', value: file }], block,
    generate: async (_m, tools) => {
      await tools.find((t) => t.name === ROW_EDIT_TOOL).execute({ edits: [] });
      return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
    },
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  const guards = r.ledger.filter((/** @type {any} */ x) => x.kind === 'guard');
  assert.deepEqual(guards, [GUARD]);
  assert.equal(r.ledger.filter((/** @type {any} */ x) => x.kind === 'floor').length, 2, 'the floor stays per line');
});

test('the close validator admits a guard row on line 0 and still refuses line 0 on any other kind', () => {
  const reds = (/** @type {any[]} */ list) => validateCloseDecl({ genre: 'text', lang: 'text', stages: [], list }, { at: 'closeDecl', verdictType: 'soft-green' }).reds.filter((r) => String(r.path).startsWith('closeDecl.list['));
  assert.deepEqual(reds([GUARD]), []);
  assert.ok(reds([{ ...GUARD, kind: 'rule', key: 'x' }]).some((r) => r.path === 'closeDecl.list[0].line'));
});

test('a guard row must name a guard stage the close really runs; an old close with no guard row is still fine', () => {
  assert.deepEqual(listMatchesClose(NEW), { ok: true });
  assert.deepEqual(listMatchesClose(SPEC.closeDecl), { ok: true });
  const bad = { ...NEW, list: [...SPEC.closeDecl.list, { ...GUARD, key: 'J.$guard.no-such-guard' }] };
  const res = listMatchesClose(bad);
  assert.equal(res.ok, false);
  assert.match(String(/** @type {any} */ (res).error), /J\.\$guard\.no-such-guard/);
});

test('the protections keep only the write fence once the list holds the guard row; an old close keeps its guard line', () => {
  const o = { verdictType: 'soft-green', lang: RUBRIC_LANG, writeScope: ['output/'], jobLines: SPEC.jobLines };
  assert.deepEqual(confirmProtections({ ...o, closeDecl: NEW }), ['write fence — the run may only change files matching: output/']);
  assert.ok(confirmProtections({ ...o, closeDecl: SPEC.closeDecl }).some((l) => l.startsWith('changed-from-seed')));
});

test('the card and the Job tab draw the guard once, as a `$ [default]` check that serves no one line; the Always-checked list no longer holds it', () => {
  const card = cardOfClose({ closeDecl: NEW, jobLines: SPEC.jobLines });
  const g = card.checkItems.filter((c) => c.key === GUARD.key);
  assert.equal(g.length, 1);
  assert.equal(g[0].by, 'default');
  assert.match(g[0].text, /^changed-from-seed — /);
  assert.equal(checksOfClose(NEW).filter((c) => c.key === GUARD.key).length, 1);
  const plan = planFromSpec({ ...SPEC, closeDecl: NEW });
  assert.equal(plan.loose.filter((c) => /^changed-from-seed — /.test(c.name)).length, 1);
  assert.equal(plan.loose[0].by, 'default');
  assert.deepEqual(plan.alwaysOn, []);
  assert.deepEqual(plan.lines[0].checks.filter((c) => /changed-from-seed/.test(c.name)), [], 'not repeated under a line');
  // the confirm card reads the same items: loose, once
  const conf = planFromConfirm(SPEC.jobLines, { checkItems: card.checkItems, protections: ['write fence — the run may only change files matching: output/'] });
  assert.equal(conf.loose.filter((c) => /^changed-from-seed — /.test(c.name)).length, 1);
  // an OLD record (no guard row) keeps today's display
  assert.deepEqual(planFromSpec(SPEC).alwaysOn, ['changed-from-seed']);
});
