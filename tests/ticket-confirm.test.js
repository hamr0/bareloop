// MCP + tickets R5, finding F285: the confirm turn of a Tickets job asked "which ticket, and is it P1?" in 5 of 10 live drafts (smw3orpqh43uv, smw3ots3fh9j0, smw3ou4iv0kka ...)
// because nothing told it the ticket is picked per run and a priority/label line is decided by code. The words (ONE owner: src/ticketfilter.js) must reach the confirm turn of a
// Tickets job and NOT a plain or generic-MCP job's; the drafting prompt carries them too.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { createSession } from '../src/panel/authorsession.js';
import { confirmPrompt, runConfirmTurn, GREEN_QUESTIONS } from '../src/authorflow.js';
import { ticketPerRunFacts, ticketFilterBlock } from '../src/ticketfilter.js';
import { world, makeRepo, keysHome, draftSeams, until, baseCard, FAKE_TOOLS } from './flowtype-world.mjs';

const LIST = 'https://github.com/o/r/issues';
const A = { answers: { 1: '1. fix\n2. ok' }, questions: GREEN_QUESTIONS, isRepo: true, lang: 'js' };

test('the words say: picked per run, never asked, a priority/label line is code\'s through ticketFilter; the drafting block carries them too', () => {
  const w = ticketPerRunFacts();
  assert.match(w, /picked per run/);
  assert.match(w, /NEVER ask the person which ticket/);
  assert.match(w, /decided by code at run start from the ticket's own labels, through the job's ticketFilter/);
  assert.ok(ticketFilterBlock().includes(w), 'one owner: the drafting block embeds the same words');
});

test('confirmPrompt: carried for a ticket job, absent otherwise (byte-identical)', () => {
  assert.ok(confirmPrompt({ ...A, ticket: true }).includes(ticketPerRunFacts()));
  assert.equal(confirmPrompt({ ...A, ticket: false }), confirmPrompt(A));
  assert.doesNotMatch(confirmPrompt(A), /picked per run/);
});

test('runConfirmTurn sends it in round 1 when ticket is set', async () => {
  const sent = [];
  const generate = async (m, tools) => { sent.push(JSON.stringify(m)); await tools[0].execute({ goal: 'g', checks: [{ text: 'c', fromLine: [1] }], questions: [], notChecked: [] }); return { text: '', error: null, cost: 0 }; };
  const { makeCostBook } = await import('../src/authorflow.js');
  const ask = async () => 'confirm';
  await runConfirmTurn({ verdictType: 'green', ...A, facts: {}, writeScope: ['src/**'], generate, book: makeCostBook({ ceilingUsd: null }), ask, ticket: true });
  assert.ok(sent[0].includes('NEVER ask the person which ticket'));
});

test('round 2 (a fix) keeps the words too', async () => {
  const sent = [];
  const generate = async (m, tools) => { sent.push(JSON.stringify(m.at(-1))); await tools[0].execute({ goal: 'g', checks: [{ text: 'c', fromLine: [1] }], questions: [], notChecked: [] }); return { text: '', error: null, cost: 0 }; };
  const { makeCostBook } = await import('../src/authorflow.js');
  const answers = ['fix', 'make it stricter', 'confirm'];
  const ask = async () => answers.shift();
  await runConfirmTurn({ verdictType: 'green', ...A, facts: {}, writeScope: ['src/**'], generate, book: makeCostBook({ ceilingUsd: null }), ask, ticket: true });
  assert.equal(sent.length, 2);
  assert.ok(sent[1].includes('NEVER ask the person which ticket') && sent[1].includes('make it stricter'));
});

/** draft a card and return what the confirm turn was sent */
async function confirmSeen(t, flowType) {
  const w = await world(t, { serve: false });
  const repo = makeRepo(path.join(w.base, 'repo'));
  const keys = keysHome(path.join(w.base, 'keys'));
  const seams = draftSeams({});
  const sent = [];
  const inner = seams.confirmGenerate;
  seams.confirmGenerate = async (c, tools) => { sent.push(JSON.stringify(c)); return inner(c, tools); };
  const card = baseCard({ source: repo, jobName: `cf-${flowType}`, ...(flowType === 'plain' ? {} : { flowType, mcp: 'github', inputs: `repo: ${repo}\nissues: ${LIST}` }) });
  const flow = flowType === 'plain' ? null : { flowType, pick: { server: 'github', tools: FAKE_TOOLS } };
  const session = createSession(card, { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keys, sessionsRoot: path.join(w.base, 's'), ...seams, ...(flow ? { flow } : {}) });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), `no menu (${session.state.phase} ${session.state.error})`);
  return sent;
}

test('through the card door: a Tickets card\'s confirm turn is told; a generic MCP card and a plain card are not', async (t) => {
  assert.ok((await confirmSeen(t, 'tickets'))[0].includes('NEVER ask the person which ticket'));
  assert.doesNotMatch((await confirmSeen(t, 'mcp'))[0], /picked per run/);
  assert.doesNotMatch((await confirmSeen(t, 'plain'))[0], /picked per run/);
});
