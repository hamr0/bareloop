// PRD v1.107 Part 6 (fix 2): "(you confirmed)" on a fact whose limit the person agreed to in a Part 5b look ask. Read from the drafting session's
// draft-log `human` rows (source 'look', this line, answer `agree`), matched on line + the `~` rule text the agree wrote; no new signed field.
//
// FIXTURE HONESTY: the real mve5y8fa predates Part 5b (its draft-log holds no `human` row; its spec carries aiProposal on `departure time` and no
// reading rule). So this is a RE-SHAPE of the real run: the real spec with the agree's `~` rule added to line 1, and a `human` row whose QUESTION is
// produced by the real askableFromLook (src/pagemap.js) from the real job lines and a look fact carrying the reading, answered `agree`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, appendFileSync, rmSync, utimesSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePart5World } from './part5-world.mjs';
import { createPanelServer } from '../src/panel/server.js';
import { askableFromLook } from '../src/pagemap.js';
import { ruleWords } from '../src/facts.js';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'part5');
const spec0 = JSON.parse(readFileSync(join(FX, 'mve5y8fa.resolved-spec.json'), 'utf8'));
const fp0 = spec0.closeDecl.stages[1].params.parts[0];
const dep = fp0.facts.find((f) => f.name === 'departure time');
const READING = `departure time ${ruleWords(dep)}`;

function ask() {
  const look = { facts: [{ line: 1, forRule: 2, name: 'departure time', shape: 'time', reading: dep.rule }] };
  const [a] = askableFromLook(look, spec0.jobLines.map((l) => ({ ...l, rules: l.rules })));
  assert.ok(a && a.ask === 'reading', 'the real ask');
  assert.equal(a.reading, READING);
  return a;
}

async function world({ answer = 'agree', writeRule = true, log = true } = {}) {
  const w = makePart5World();
  const sess = w.out('mve5y8fa');
  const spec = JSON.parse(JSON.stringify(spec0));
  if (writeRule) { spec.jobLines[0].rules = [...spec.jobLines[0].rules, READING]; spec.jobLines[0].rule = `${spec.jobLines[0].rule}; ${READING}`; }
  writeFileSync(join(sess, 'resolved-spec.json'), JSON.stringify(spec));
  const logPath = join(sess, 'draft-log.jsonl');
  if (!log) rmSync(logPath);
  else appendFileSync(logPath, `${JSON.stringify({ kind: 'human', no: 0, source: 'look', question: ask().question, answer, line: 1, at: '2026-10-18T06:00:01Z' })}\n`);
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  utimesSync(w.spine('mve5y8fa'), old, old);
  const { port, close } = await createPanelServer({ port: 0, home: w.home, schedulerIntervalMs: 0, sessionsRoot: dirname(sess) });
  test.after(() => close());
  const r = await fetch(`http://127.0.0.1:${port}/api/runs/mve5y8fa/result`);
  const l0 = (await r.json()).lines[0]; return l0;
}
const noted = (l) => l.facts.filter((f) => f.note).map((f) => [f.name, f.note]);

test('an agree answer whose reading is a signed ~ rule marks exactly that fact "(you confirmed)"', async () => {
  assert.deepEqual(noted(await world()), [['departure time', '(you confirmed)']]);
});
test('a typed answer (not agree), a reading not written as a ~ rule, or no draft log: nothing is marked', async () => {
  assert.deepEqual(noted(await world({ answer: 'only mornings' })), []);
  assert.deepEqual(noted(await world({ writeRule: false })), []);
  assert.deepEqual(noted(await world({ log: false })), []);
});
test('the sentence keeps factSentence\'s own words; the confirmation is a separate field', async () => {
  const l = await world();
  assert.equal(l.facts.find((f) => f.name === 'departure time').sentence.includes('you confirmed'), false);
});
