// The rubric road's worker fence is ONE named constant (RUBRIC_FENCE, src/authoring.js); no other src file spells the literal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });

test('the literal fence appears only in the constant\'s definition', async () => {
  const hits = [];
  for (const f of walk(new URL('../src', import.meta.url).pathname)) {
    readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (/\['output\/'\]/.test(l) && !/^\s*(\/\/|\*)/.test(l)) hits.push(`${f.split('/src/')[1]}:${i + 1}`); });
  }
  assert.deepEqual(hits.length, 1, `fence literal found at: ${hits.join(', ')}`);
  assert.match(hits[0], /^authoring\.js:/);
  const { RUBRIC_FENCE } = await import('../src/authoring.js');
  assert.deepEqual([...RUBRIC_FENCE], ['output/']);
  assert.ok(Object.isFrozen(RUBRIC_FENCE));
});
