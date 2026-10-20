// PRD v1.107 Part 6 (fix 4): a money cell is written in the fact's OWN signed form: "$144" when the fact's currency list has a sign, else "144 US dollars"
// (its unit after). One function (src/facts.js moneyAs) also spells a rule's bound; the real mve5y8fa spec carries both a unit and a currency, so the
// unit-only case re-shapes that real spec (the currency removed).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, utimesSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePart5World } from './part5-world.mjs';
import { createPanelServer } from '../src/panel/server.js';
import { moneyAs, factSentence } from '../src/facts.js';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'part5');
const spec0 = JSON.parse(readFileSync(join(FX, 'mve5y8fa.resolved-spec.json'), 'utf8'));
const price = spec0.closeDecl.stages[1].params.parts[0].facts[0];

test('moneyAs: symbol first when the fact has a currency sign, else the unit after; a rule bound keeps preferring the unit', () => {
  assert.equal(moneyAs(price, '144', true), '$144');
  assert.equal(moneyAs({ ...price, currency: ['€', '$'] }, '9', true), '€9');
  const { currency, ...unitOnly } = price;
  assert.equal(moneyAs(unitOnly, '144', true), '144 US dollars');
  const { unit, ...signOnly } = price;
  assert.equal(moneyAs(signOnly, '144', true), '$144');
  assert.equal(factSentence(price, 'flights').includes('under 450 US dollars'), true, 'the rule words did not change');
});

async function cells(mutate) {
  const w = makePart5World();
  const spec = JSON.parse(JSON.stringify(spec0));
  mutate(spec.closeDecl.stages[1].params.parts[0].facts[0]);
  writeFileSync(join(w.out('mve5y8fa'), 'resolved-spec.json'), JSON.stringify(spec));
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  utimesSync(w.spine('mve5y8fa'), old, old);
  // a red re-shape is not needed: the delivered file is the real one, placed where the destination-written record points
  const delivered = join(w.out('mve5y8fa'), 'delivered', '1-2026-10-18.json');
  const { mkdirSync, copyFileSync } = await import('node:fs');
  mkdirSync(dirname(delivered), { recursive: true });
  copyFileSync(join(FX, 'mve5y8fa.step-1-2026-10-18.json'), delivered);
  const text = readFileSync(w.spine('mve5y8fa'), 'utf8');
  const rec = JSON.parse(text.split('\n').find((l) => l.includes('"type":"destination-written"')));
  writeFileSync(w.spine('mve5y8fa'), text.replace(rec.path, delivered));
  const { port, close } = await createPanelServer({ port: 0, home: w.home, schedulerIntervalMs: 0 });
  test.after(() => close());
  const body = await (await fetch(`http://127.0.0.1:${port}/api/runs/mve5y8fa/result`)).json();
  return body.lines[0].rows.map((r) => r.cells[0]);
}

test('the price cells follow the signed fact: "$144" with a currency, "144 US dollars" without', async () => {
  const withSign = await cells(() => {});
  assert.ok(withSign.length === 3 && withSign.every((c) => /^\$\d+$/.test(c)), withSign.join('|'));
  const unitOnly = await cells((f) => { delete f.currency; });
  assert.ok(unitOnly.every((c) => /^\d+ US dollars$/.test(c)), unitOnly.join('|'));
});
