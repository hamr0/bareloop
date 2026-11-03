// BA-30 shrinkGuard wiring (F272, F276). Real Gate, real `createShellTools`, real git: no stub of
// the library seam. Every test below is the fail-first proof of ONE gotcha from the build spec
// (docs/product/ITEM33-BUILD.md, addendum 2026-11-01, section D): the control inside each test
// shows the un-wired / lexical / unquoted spelling letting the gutting write through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import { gatedShellOptions, trackedAtSeedGuard, realPathOrAncestor } from '../src/tools.js';
import { seedAtHead, seedListing, GATE_AUDIT_FILE } from '../src/kinds.js';
import { gitInPatient, initPatientRepo, scriptedProvider } from './helpers.js';
import { tcall, makePatient, JOB, PLAN, go } from './planrun-fixtures.js';

const require = createRequire(import.meta.url);
const { Gate } = require('bareguard');
const { createShellTools } = require('bare-agent/tools');

const BIG = Array.from({ length: 200 }, (_, i) => `export const line${i} = ${i}; // padding so the file is well over 2 KB`).join('\n') + '\n';
const GUT = 'export {};\n';

/** a patient repo: one committed big file (plus any extras), a real Gate over it */
async function patient(t, { extra = {} } = {}) {
  const wd = realpathSync(mkdtempSync(join(tmpdir(), 'bareloop-shrink-')));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  initPatientRepo(wd);
  for (const [rel, text] of Object.entries({ 'src/big.js': BIG, ...extra })) {
    mkdirSync(join(wd, rel, '..'), { recursive: true });
    writeFileSync(join(wd, rel), text);
  }
  gitInPatient(wd, ['add', '-A']);
  gitInPatient(wd, ['commit', '-q', '-m', 'files']);
  const gate = new Gate({
    fs: { writeScope: [wd], readScope: [wd], deny: [] },
    limits: { maxTurns: 50 },
    audit: { path: join(wd, GATE_AUDIT_FILE) },
    humanChannel: async () => ({ decision: 'terminate' }),
  });
  await gate.init();
  return { wd, gate };
}

/** the worker's shell tools for `wd` the way mkWorker builds them: tracked-at-seed guard from the WORKER tree */
async function workerTools(wd, gate, { workdirSeen = wd } = {}) {
  const s = await seedAtHead(wd);
  assert.equal(s.stop, null);
  const l = await seedListing(wd, s.seedRef);
  assert.equal(l.stop, null);
  const guard = await trackedAtSeedGuard(wd, l.files);
  const tools = createShellTools(gatedShellOptions(gate, workdirSeen, guard)).tools;
  return { write: tools.find((x) => x.name === 'shell_write'), guard, files: l.files };
}

test('D.5: a gutting write to a file tracked at the seed is refused with the file unchanged; the un-wired control gutts it', async (t) => {
  const { wd, gate } = await patient(t);
  const target = join(wd, 'src', 'big.js');
  const { write } = await workerTools(wd, gate);
  await assert.rejects(() => write.execute({ path: target, content: GUT }), /refusing: this would replace .*src\/big\.js/);
  assert.equal(readFileSync(target, 'utf8'), BIG, 'the file is byte-identical after the refusal');
  // control: without the wiring the same call destroys the file (the instrument can see the harm)
  const bare = createShellTools(gatedShellOptions(gate, wd)).tools.find((x) => x.name === 'shell_write');
  await bare.execute({ path: target, content: GUT });
  assert.equal(readFileSync(target, 'utf8'), GUT);
});

test('D.5: an untracked own-output rewrite, append:true, content:\'\' and a small file all pass', async (t) => {
  const { wd, gate } = await patient(t, { extra: { 'src/small.js': 'x\n'.repeat(10) } });
  const { write } = await workerTools(wd, gate);
  // created AFTER the seed: untracked, so the guard is off for it (a rubric step file's own rewrite)
  const own = join(wd, 'output', 'steps', '1.json');
  await write.execute({ path: own, content: 'x'.repeat(5000) });
  await write.execute({ path: own, content: '{}' });
  assert.equal(readFileSync(own, 'utf8'), '{}');
  const target = join(wd, 'src', 'big.js');
  await write.execute({ path: target, content: 'tail\n', append: true });
  assert.equal(readFileSync(target, 'utf8'), `${BIG}tail\n`);
  await write.execute({ path: target, content: '' });
  assert.equal(readFileSync(target, 'utf8'), '', 'a deliberate empty is legal');
  await write.execute({ path: join(wd, 'src', 'small.js'), content: 'y\n' }); // tracked but under 2 KB
});

test('F276 (a): a symlinked PARENT directory cannot launder a tracked path (realpath on both sides); a lexical set fails open', async (t) => {
  const { wd, gate } = await patient(t);
  symlinkSync(join(wd, 'src'), join(wd, 'alias'));
  const viaLink = join(wd, 'alias', 'big.js');
  const { write, files } = await workerTools(wd, gate);
  await assert.rejects(() => write.execute({ path: viaLink, content: GUT }), /refusing/);
  assert.equal(readFileSync(join(wd, 'src', 'big.js'), 'utf8'), BIG);
  // control: the lexical predicate the spec first described lets the same call through
  const lexical = new Set(files.map((f) => join(wd, f)));
  const lexTools = createShellTools(gatedShellOptions(gate, wd, (p) => lexical.has(p))).tools;
  await lexTools.find((x) => x.name === 'shell_write').execute({ path: viaLink, content: GUT });
  assert.equal(readFileSync(join(wd, 'src', 'big.js'), 'utf8'), GUT, 'lexical = fail-open: the instrument can see the hole');
});

test('F276 (a): the worker tree reached through a symlinked ROOT compares in the same real form', async (t) => {
  const { wd, gate } = await patient(t);
  const rootLink = `${wd}-link`;
  symlinkSync(wd, rootLink);
  t.after(() => rmSync(rootLink, { force: true }));
  const { write } = await workerTools(wd, gate, { workdirSeen: rootLink });
  await assert.rejects(() => write.execute({ path: join(rootLink, 'src', 'big.js'), content: GUT }), /refusing/);
  assert.equal(readFileSync(join(wd, 'src', 'big.js'), 'utf8'), BIG);
});

test('realPathOrAncestor: a path that does not exist yet resolves via its deepest existing parent', async (t) => {
  const { wd } = await patient(t);
  symlinkSync(join(wd, 'src'), join(wd, 'alias'));
  assert.equal(await realPathOrAncestor(join(wd, 'alias', 'new', 'deep.js')), join(wd, 'src', 'new', 'deep.js'));
  assert.equal(await realPathOrAncestor(join(wd, 'alias', 'big.js')), join(wd, 'src', 'big.js'));
});

test('F276 (c): a tracked name with non-ASCII bytes (and a space) is listed raw and its gutting write is refused', async (t) => {
  const { wd, gate } = await patient(t, { extra: { 'src/café 日本.js': BIG } });
  const s = await seedAtHead(wd);
  const l = await seedListing(wd, s.seedRef);
  assert.ok(l.files.includes('src/café 日本.js'), `seedListing must hand back the real name, got ${JSON.stringify(l.files)}`);
  assert.ok(!l.files.some((f) => f.startsWith('"')), 'no C-quoted entry');
  const { write } = await workerTools(wd, gate);
  const target = join(wd, 'src', 'café 日本.js');
  await assert.rejects(() => write.execute({ path: target, content: GUT }), /refusing/);
  assert.equal(readFileSync(target, 'utf8'), BIG);
});

test('F276 (d): a resumed leg counts what an EARLIER leg committed to the work branch as tracked at ITS seed; this leg\'s own new file is not', async (t) => {
  const { wd, gate } = await patient(t);
  // leg 1 ran on the work branch and committed a new file
  gitInPatient(wd, ['checkout', '-q', '-b', 'bareloop-resumed']);
  writeFileSync(join(wd, 'src', 'leg1.js'), BIG);
  gitInPatient(wd, ['add', '-A']);
  gitInPatient(wd, ['commit', '-q', '-m', 'leg 1 work']);
  // leg 2 starts here: seed = HEAD of the work branch at leg start
  const { write } = await workerTools(wd, gate);
  await assert.rejects(() => write.execute({ path: join(wd, 'src', 'leg1.js'), content: GUT }), /refusing/);
  const mine = join(wd, 'src', 'leg2.js');
  await write.execute({ path: mine, content: BIG });
  await write.execute({ path: mine, content: GUT }); // created in this leg, untracked at its seed
  assert.equal(readFileSync(mine, 'utf8'), GUT);
});

// ── wiring in runPlan: the real mkWorker, a scripted provider, the real gate audit ──
test('WIRING (cold command-close job): the worker\'s gutting write is refused, the worker is told why, the file is unchanged', async (t) => {
  const wd = makePatient(t);
  writeFileSync(join(wd, 'tests', 'big.mjs'), BIG);
  gitInPatient(wd, ['add', '-A']);
  gitInPatient(wd, ['commit', '-q', '-m', 'big file']);
  const provider = scriptedProvider([
    { text: 'scout' }, { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'big.mjs'), content: GUT })] },
    { text: 'done' },
  ]);
  await go(wd, provider, { job: JOB(wd) });
  assert.equal(readFileSync(join(wd, 'tests', 'big.mjs'), 'utf8'), BIG, 'the gutting write never landed');
  assert.match(JSON.stringify(provider.messagesLog), /refusing: this would replace .*big\.mjs/, 'the worker is told, in the tool result, why the write was refused');
  // NOT asserted, and why: the spec expected a gate audit row carrying errorContext.shrink, but
  // bareloop wires only wireGate's `policy` + `onLlmResult` (src/planrun.js), never its
  // `onToolResult`, so no tool failure of any kind reaches the audit. Escalated, not wired here.
});

test('WIRING (resumed leg): a file the earlier leg committed on the work branch is guarded in the resumed run', async (t) => {
  const wd = makePatient(t);
  gitInPatient(wd, ['checkout', '-q', '-b', 'bareloop-plan-patient']);
  writeFileSync(join(wd, 'tests', 'leg1.mjs'), BIG);
  gitInPatient(wd, ['add', 'tests/leg1.mjs']);
  gitInPatient(wd, ['commit', '-q', '-m', 'leg 1 work']);
  gitInPatient(wd, ['checkout', '-q', 'main']);
  const provider = scriptedProvider([
    { text: 'scout' }, { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'leg1.mjs'), content: GUT })] },
    { text: 'done' },
  ]);
  await go(wd, provider, { job: JOB(wd), resumeBranch: 'bareloop-plan-patient' });
  assert.equal(readFileSync(join(wd, 'tests', 'leg1.mjs'), 'utf8'), BIG);
  assert.match(JSON.stringify(provider.messagesLog), /refusing: this would replace .*leg1\.mjs/);
});

test('WIRING: planrun builds the worker shell tools with the tracked-at-seed guard', () => {
  const src = readFileSync(new URL('../src/planrun.js', import.meta.url), 'utf8');
  assert.match(src, /createShellTools\(gatedShellOptions\(gate, workdir, shrinkGuardPath\)\)/);
  const scout = readFileSync(new URL('../src/authorscout.js', import.meta.url), 'utf8');
  assert.match(scout, /createShellTools\(gatedShellOptions\(gate, workdir\)\)/, 'the scout has no write tool and takes no guard');
});
