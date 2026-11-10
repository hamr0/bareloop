// R9 Part B 4 (hamr's $0 check): does draft-log.jsonl keep an unusable draft try's raw answer? It did NOT (the `call` lines of the main draft call and the scout carried cost only; only the
// page-map call carried `raw`). Now every answered call's scrubbed answer (src/text.js scrubRaw: secret-masked, bounded) rides the call report into the log. A REAL panel session, the model
// boundary stubbed to answer with prose and no declaration. $0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSession } from '../src/panel/authorsession.js';
import { makeCostBook } from '../src/authorflow.js';
import { RAW_PERSIST_MAX } from '../src/text.js';
import { ANTH_CFG } from './helpers.js';

const git = (/** @type {string} */ dir, /** @type {string[]} */ args) => execFileSync('git', args, {
  cwd: dir, encoding: 'utf8',
  env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
});
const SECRET = `sk-ant-api03-${'a'.repeat(40)}`;

test('a draft whose answer cannot be used: the log keeps each try\'s raw answer, secret-masked; the cost lines are otherwise as before', async (t) => {
  const mk = () => { const d = mkdtempSync(join(tmpdir(), 'dlraw-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
  const home = mk();
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  writeFileSync(join(home, 'config.json'), JSON.stringify(ANTH_CFG));
  const repo = mk();
  git(repo, ['init', '-q', '-b', 'main']);
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src', 'mod.js'), '// nothing yet\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'seed']);
  const plan = { goal: 'fix things v1', checks: [{ text: 'tsc clean', fromLine: [1] }], questions: [], notChecked: [] };
  let n = 0;
  const session = createSession({ checkType: 'deterministic', model: 'claude-sonnet-5', jobName: 'raw-job', jobText: 'fix things\n~ no new deps\ntsc clean', inputs: `repo: ${repo}`, destination: 'src/', capUsd: 2 }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionsRoot: join(home, 'panel-sessions'),
    scout: { state: 'PRESENT', facts: { sourcePaths: ['src/mod.js'], testPaths: [] }, calls: [], raws: [] },
    generate: async () => { n += 1; return { text: `try ${n}: I could not produce a declaration. key ${SECRET} UNUSABLE-ANSWER-MARKER`, error: null, msgs: [], metrics: { costUsd: 0.03, unpricedRounds: 0 } }; },
    confirmGenerate: async (_c, tools) => { if (tools?.[0]?.execute) await tools[0].execute(plan); return { text: JSON.stringify(plan), error: null, cost: 0.0005 }; },
  });
  for (let i = 0; i < 500 && session.state.pendingAsk?.kind !== 'menu'; i += 1) await new Promise((r) => { setTimeout(r, 10); });
  session.signPrepare();
  for (let i = 0; i < 500 && !['refused', 'abandoned', 'prepared'].includes(session.state.phase); i += 1) await new Promise((r) => { setTimeout(r, 10); });
  assert.equal(session.state.phase, 'refused', String(session.state.error));
  const text = readFileSync(join(session.state.outDir, 'draft-log.jsonl'), 'utf8');
  const calls = text.trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.kind === 'call' && /^author/.test(e.label));
  assert.ok(calls.length >= 2, 'more than one draft try was made');
  for (const c of calls) assert.match(c.raw, /UNUSABLE-ANSWER-MARKER/, `${c.label} keeps its raw answer`);
  assert.equal(new Set(calls.map((c) => c.raw)).size, calls.length, 'each try keeps ITS OWN answer, not the last one repeated');
  assert.equal(text.includes(SECRET), false, 'the secret is masked in the log');
  assert.ok(calls.every((c) => c.costUsd === 0.03), 'cost lines are as before');
  // the confirm turn's answer is kept the same way
  assert.equal(JSON.parse(JSON.parse(text.trim().split('\n').find((l) => JSON.parse(l).label === 'confirm')).raw).goal, 'fix things v1');
});

test('makeCostBook: the report carries the scrubbed answer, bounded by the one raw cap; the persisted raw is the same text', () => {
  /** @type {any[]} */ const told = [];
  const book = makeCostBook({ onCall: (c) => told.push(c) });
  book.add('author', { text: `${'x'.repeat(RAW_PERSIST_MAX + 500)} ${SECRET}`, metrics: { costUsd: 0.01, unpricedRounds: 0 } });
  assert.equal(told[0].raw, book.raws()[0].text);
  assert.ok(Buffer.byteLength(told[0].raw) < RAW_PERSIST_MAX + 200, 'bounded');
  assert.equal(told[0].raw.includes(SECRET), false);
});
