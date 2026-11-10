// R10 end check: a rubric close with no real check is refused with the d4596a7 words before signing, whatever the seed gate says.
// Live: paid round 6 draft 17 (panel session smwag7ncubmip; run-class mv76m82c): rubric-step parts [] + files-changed, signed-ready. Fixture = its real specClose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { noCheckStopText, isNoCheckRubricClose, signingStopText } from '../src/authorreadout.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const V = JSON.parse(readFileSync(join(HERE, 'fixtures', 'r10-vanish-closes.json'), 'utf8'));
const spend = { knownUsd: 0.0099, spendComplete: true };

test('draft 17 real close (empty rubric-step parts + files-changed) is refused with the d4596a7 words', () => {
  const t = noCheckStopText({ closeDecl: V.d17.specClose, spend });
  assert.equal(t, signingStopText({ reds: [], closeDecl: V.d17.specClose, spend }));
  assert.match(t, /This job has no check that can fail: no `~` rule, and no check the AI built was kept\. A run needs at least one check, a quoted fact or a count\./);
  assert.match(t, /For an answer nobody checks, a plain chat AI is the right tool\./);
});

test('draft 8 (a date fact) and draft 22 (a cited part) have a real check: not refused', () => {
  assert.equal(noCheckStopText({ closeDecl: V.d8.specClose, spend }), null);
  assert.equal(noCheckStopText({ closeDecl: V.d22.specClose, spend }), null);
});

test('parts of class none or guard are not a check', () => {
  const c = structuredClone(V.d17.specClose);
  c.stages[1].params.parts = [{ text: 'x', class: 'none' }, { text: 'y', class: 'guard' }];
  assert.equal(isNoCheckRubricClose(c), true);
  c.stages[1].params.parts.push({ text: 'z', class: 'countable', check: 'cited', source: 'Note' });
  assert.equal(isNoCheckRubricClose(c), false);
});

test('a code-genre close is never refused here', () => {
  assert.equal(noCheckStopText({ closeDecl: { genre: 'CODE', lang: 'js', stages: [{ name: 't', kind: 'command-exit', params: {} }] }, spend }), null);
});

test('both doors call the end check before the signing gates', () => {
  const panel = readFileSync(join(HERE, '../src/panel/authorsession.js'), 'utf8');
  assert.ok(panel.indexOf('noCheckStopText({ closeDecl: spec.closeDecl') > 0 && panel.indexOf('noCheckStopText({ closeDecl: spec.closeDecl') < panel.indexOf("state.phase = 'signing-gates'"));
  const cli = readFileSync(join(HERE, '../src/authorrun.js'), 'utf8');
  assert.ok(cli.indexOf('isNoCheckRubricClose(spec.closeDecl)') > 0 && cli.indexOf('isNoCheckRubricClose(spec.closeDecl)') < cli.indexOf('prepareSigning({'));
});
