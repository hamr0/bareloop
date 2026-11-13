// borrowed-from: fwdloop test/m12-p3-drafter.test.js@v0.29.0 (the prompt MUST-line and the optional schema property; bareloop's drafter is the authoring pipeline, src/authorflow.js)
// MCP + tickets piece 2 (R5): the drafter of a Tickets job is TOLD about the ticket filter (a MUST for a job line that names a priority or a label, a legal example, never invent a
// label), the schema OFFERS the optional `ticketFilter` property, and a proposal is read by the one reader (src/ticketfilter.js) whose red detail carries the same legal example.
// Every other job's prompt and schema are byte-identical. A scripted model can only DELIVER a declaration; whether a real model emits it is the paid POC (r5-poc), not this file.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorClose, declarationSchema, GREEN_QUESTIONS } from '../src/authorflow.js';
import { ROW_EDIT_TOOL, rowEditChannel } from '../src/rowedit.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { proveRubricInputs } from '../src/source.js';
import { buildSeedListing } from '../src/authorscout.js';
import { ticketFilterBlock, ticketFilterReds, ticketFilterWords, TICKET_FILTER_EXAMPLE, TICKET_FILTER_SCHEMA_WORDS } from '../src/ticketfilter.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'ticket-filter-drafter-')); made.push(d); return d; };

test('the schema offers ticketFilter ONLY to a Tickets job; every other schema is unchanged', () => {
  const plain = declarationSchema();
  const tickets = declarationSchema(undefined, { ticket: true });
  assert.equal(Object.hasOwn(plain.properties, 'ticketFilter'), false);
  assert.equal(JSON.stringify(plain), JSON.stringify(declarationSchema(undefined, { ticket: false })));
  const f = tickets.properties.ticketFilter;
  assert.deepEqual(f.properties.priority.items.enum, ['P0', 'P1', 'P2', 'P3'], 'a priority outside P0-P3 is inexpressible');
  assert.equal(f.additionalProperties, false);
  assert.match(f.description, /^REQUIRED when a job line names a priority or a label/);
  assert.doesNotMatch(f.description, /optional/i, 'the schema no longer says optional while the prompt says MUST');
  assert.equal(f.description, TICKET_FILTER_SCHEMA_WORDS, 'one owner');
  assert.deepEqual(tickets.required, ['stages'], 'optional: a Tickets job without a priority line has none');
});

test('the row-edit tool offers ticketFilter ONLY to a Tickets job (ruling 2: the reply keeps the field unchanged); every other job\'s tool is the edits list alone', () => {
  const plain = rowEditChannel(false).tool({ calls: [] }).parameters;
  const tickets = rowEditChannel(true).tool({ calls: [] }).parameters;
  assert.equal(Object.hasOwn(plain.properties, 'ticketFilter'), false);
  assert.deepEqual(tickets.properties.ticketFilter.properties.priority.items.enum, ['P0', 'P1', 'P2', 'P3']);
  assert.equal(tickets.properties.ticketFilter.description, TICKET_FILTER_SCHEMA_WORDS, 'one owner');
  assert.deepEqual(tickets.required, ['edits']);
});

test('the drafter is told: the MUST, the legal example, never invent a label, the filter is not a check', () => {
  const b = ticketFilterBlock();
  assert.match(b, /MUST add a top-level "ticketFilter"/);
  assert.ok(b.includes(TICKET_FILTER_EXAMPLE), 'the legal example is in the prompt');
  assert.match(b, /Never invent a label/);
  assert.match(b, /only priority P1 tickets/);
  assert.match(b, /list it under "refused"/);
  assert.match(b, /AND add the ticketFilter: the refused entry alone does not filter anything/, 'the refused duty is tied to the key (F285, e1 shape)');
  assert.match(b, /a closed ticket always skips/);
});

test('the red detail carries the same legal example the prompt shows', () => {
  for (const bad of [{}, [], 'P1', { priority: ['P9'] }, { priority: [] }, { labels: [''] }, { state: ['open'] }]) {
    const reds = ticketFilterReds(bad);
    assert.ok(reds.length > 0, JSON.stringify(bad));
    assert.ok(reds.some((r) => r.detail.includes(TICKET_FILTER_EXAMPLE)), `${JSON.stringify(bad)} -> ${JSON.stringify(reds)}`);
  }
  assert.deepEqual(ticketFilterReds({ priority: ['P1', 'P2'], labels: ['bug', 'docs'] }), []);
  assert.deepEqual(ticketFilterReds(JSON.parse(TICKET_FILTER_EXAMPLE)), [], 'the example in the red is itself legal');
});

test('the plan card words come from code', () => {
  assert.equal(ticketFilterWords({ priority: ['P1'] }), 'only tickets with priority P1 run; a closed ticket is skipped');
  assert.equal(ticketFilterWords({ priority: ['P1', 'P2'], labels: ['bug'] }), 'only tickets with priority P1 or P2 and label bug run; a closed ticket is skipped');
  assert.equal(ticketFilterWords(undefined), null);
});

// ── through the real drafting loop (rubric job on a saved page; a scripted model delivers the declarations) ──
const LINE = { n: 1, text: 'List the flights', rule: 'only priority P1 tickets', rules: ['only priority P1 tickets'] };
const URL1 = 'https://www.google.com/travel/flights?q=sfo-lax';

async function loop(/** @type {{ticket: boolean, filters: any[]}} */ { ticket, filters }) {
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Flights', value: URL1 }], into: join(tmp(), 'seed'), fetchUrl: async (url) => ({ ok: true, text: readFileSync(join(HERE, 'fixtures', 'page-partial.txt'), 'utf8'), url }) });
  assert.equal(proved.ok, true);
  if (!proved.ok) throw new Error('unreachable');
  const prep = proved.prep;
  /** @type {any[]} */ const sent = [];
  let n = 0;
  // the drafter's reply is ROW EDITS plus, for a Tickets job, the optional ticketFilter (ruling 2, 2026-11-12): the filter is read by the ticket reader, the edits by the block
  const generate = async (/** @type {any[]} */ m, /** @type {any[]} */ tools) => {
    sent.push(JSON.parse(JSON.stringify(m)));
    const tool = tools.find((t) => t.name === ROW_EDIT_TOOL);
    const f = filters[Math.min(n, filters.length - 1)];
    n += 1;
    await tool.execute({ edits: [], ...(f === undefined ? {} : { ticketFilter: f }) });
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: '1. Only priority P1 tickets' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Flights' }] }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines: [LINE], inputs: [{ n: 1, label: 'Flights', value: URL1 }], ticket,
  });
  return { r, sent, calls: n };
}

test('a Tickets job: the prompt carries the ticket block, a legal proposal is kept BESIDE the declaration (never in the close)', async () => {
  const { r, sent } = await loop({ ticket: true, filters: [{ priority: ['P1'] }] });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.deepEqual(r.ticketFilter, { priority: ['P1'] });
  assert.equal(Object.hasOwn(r.declaration, 'ticketFilter'), false, 'the filter is not part of the close');
  assert.match(sent[0].map((x) => x.content).join('\n'), /^THE JOB/, 'the first message is the row-edit message');
  assert.match(JSON.stringify(sent[0]), /THE TICKET FILTER/);
});

test('an illegal proposal is a red WITH the legal example, and the revise round can fix it', async () => {
  const { r, sent, calls } = await loop({ ticket: true, filters: [{ priority: ['P9'] }, { priority: ['P1'] }] });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.ok(calls >= 2, 'a second try was made');
  assert.deepEqual(r.ticketFilter, { priority: ['P1'] });
  assert.ok(JSON.stringify(sent[1]).includes('priority from P0 to P3'), 'the revise message names the rule');
  assert.ok(JSON.stringify(sent[1]).replace(/\\"/g, '"').includes(TICKET_FILTER_EXAMPLE), 'and shows the legal example');
});

test('a filter changed between tries is not "an identical declaration": the second try is validated, not cut', async () => {
  const { r } = await loop({ ticket: true, filters: [{ priority: ['P9'] }, { priority: ['P1'] }] });
  assert.equal(r.ok, true);
  assert.equal(r.iterations[0].validation.ok, false, 'the illegal filter was refused');
  assert.equal(r.iterations[1].validation.ok, true, 'the same close with a legal filter was judged, not skipped as identical');
});

test('a job without tickets: no ticket block in the prompt, no ticketFilter in the result', async () => {
  const { r, sent } = await loop({ ticket: false, filters: [undefined] });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(Object.hasOwn(r, 'ticketFilter'), false);
  assert.doesNotMatch(JSON.stringify(sent[0]), /THE TICKET FILTER/);
});

test('a Tickets job whose model proposes no filter has none (nothing invented by code)', async () => {
  const { r } = await loop({ ticket: true, filters: [undefined] });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.equal(Object.hasOwn(r, 'ticketFilter'), false);
});
