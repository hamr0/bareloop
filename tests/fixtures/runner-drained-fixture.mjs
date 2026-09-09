// F140/PRD item 28(c) — the CHILD half of the `runner-drained` backstop test.
// Spawned as a real, separate `node` process (tests/runner-drained.test.js is
// the parent) so node's own `beforeExit` fires the REAL way: nothing else is
// forced, nothing is manually emitted. A manually-fired `process.emit`
// inside the SAME process as the test runner is an impersonation of the
// event (and, separately, is incompatible with this repo's node:test +
// signal-exit combination — see the parent test file's header comment) —
// only a genuinely separate process proves the mechanism against the real
// instrument it exists to catch.
//
// WHY A SOFTGREEN/JUDGED CLOSE, not the mechanical `close:[{cmd:…}]` shape
// used elsewhere in this suite: every WORKER-provider round `runJob` issues
// in its normal flow (scout, plan/draft, step execution, close-fix) funnels
// through ONE function, `mkWorker` (src/planrun.js:2142), which wraps every
// call in `createStallWatch` (F66, src/stall.js, 300s, 3 reissues) — the
// pre-existing, primary defence against exactly "a provider call that never
// produces a round". A hung `provider.generate()` fed through the ordinary
// worker `provider` gets caught by that watch and resolved into a REAL
// job-end (`step-stalled`) through the NORMAL path, never through this
// backstop (confirmed empirically). The one call this repo makes with NO
// such wrapper is the SOFTGREEN JUDGE call — `src/judged.js`'s
// `defaultJudgeLoop` builds a bare-agent `Loop` directly over `judgeProvider`
// with no stall watch, no `Promise.race`, nothing — so a judge call that
// never settles is the one honest way to drive a REAL, organic,
// nothing-else-scheduled `beforeExit` in bounded time.
//
// Argv contract (all required, positional):
//   argv[2]  workdir    — an already-prepared patient dir (git repo; a
//                          `tests/` directory must already exist IN THE SEED
//                          commit — the mandatory `changed-from-seed` guard
//                          below allow-lists `tests/`, and an allow-prefix
//                          absent from the seed tree is itself a validation
//                          red). Built by the PARENT so this fixture stays
//                          free of git/fs scaffolding.
//   argv[3]  spineFile  — where runJob's spine JSONL lands. Must live OUTSIDE
//                          workdir: the mandatory `changed-from-seed` guard
//                          diffs the WHOLE repo against its seed commit, and
//                          a spine file written inside the patient would
//                          itself show up as a rogue changed file.
//   argv[4]  mode       — 'hang' (judgeProvider.generate() never settles —
//                          the runner-drained case) or 'green' (a judge that
//                          answers promptly with facts the card is satisfied
//                          by — the control case, a real soft-green).
//
// Exit code: for 'green', explicitly mirrors the CLI's own green/not-green
// mapping (0 only for a real green — src/cli.js:379). For 'hang', nothing
// here sets an exit code at all — the whole point under test is that the
// BACKSTOP itself is what sets `process.exitCode` non-zero when the process
// drains with no `job-end` ever emitted.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSpine } from '../../src/spine.js';
import { runJob } from '../../src/run.js';
import { jobSpecHash } from '../../src/job.js';
import { classGuards } from '../../src/authoring.js';
import { scriptedProvider } from '../helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');

const [, , workdir, spineFile, mode] = process.argv;
if (!workdir || !spineFile || !mode) {
  console.error('usage: runner-drained-fixture.mjs <workdir> <spineFile> <hang|green>');
  process.exitCode = 2;
  process.exit(2); // argv-contract failure, not the class under test — fine to exit() here
}

// The judged artifact: src/spine.js's REAL text — one top-level function,
// fully documented — the exact patient tests/judged-stage.test.js already
// proved a `judged-floor` card/facts pair against, so this fixture is not a
// second, unverified card/facts spelling.
const ARTIFACT_PATH = 'src/mod.mjs';
const artifactText = readFileSync(join(REPO_ROOT, 'src', 'spine.js'), 'utf8');

const CARD = {
  items: [
    { rule: 'has-doc', text: 'Every top-level function has a JSDoc block directly above it.' },
    { rule: 'params', text: 'Every parameter of every top-level function is named in an @param tag.' },
    { rule: 'returns', text: 'Every top-level function that returns a value documents it with @returns.' },
  ],
};
const PASS_FACTS = {
  functions: [{
    name: 'makeSpine',
    declarationQuote: 'export function makeSpine(file, { startSeq = 0 } = {}) {',
    docQuote: '/**',
    paramNames: ['file', '{ startSeq = 0 } = {}'],
    paramIsPattern: [false, true],
    paramTagNames: ['file', 'opts'],
    returnsTagQuote: ' * @returns {(type: string, data?: object) => object} emit — returns the event as written',
    returnsValueQuote: '    return ev;',
  }],
};

// The mandatory D5 guard battery for a soft-green declared close (shown-and-
// fixed, never hand-omitted) — `classGuards` is the SAME resolver
// `validateJob` demands the declaration match, never a second hand-copy of
// its shape. `allowPrefixes` is the one field it leaves for the caller to
// fill (`fill:['allowPrefixes']` in its own output).
const guards = classGuards({ verdictType: 'soft-green', lang: 'js' });
guards[0].params.allowPrefixes = ['tests/'];

const job = {
  schema: 'job-v1',
  job: 'runner-drained-fixture',
  description: 'F140/PRD 28(c) child-process fixture',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['tests/**'],
  goal: 'Write tests/test_x.mjs with an ok assertion.',
  verdictType: 'soft-green',
  closeDecl: {
    genre: 'TYPES', lang: 'js',
    stages: [...guards, { name: 'reads-well', kind: 'judged-floor', params: { card: CARD, paths: [ARTIFACT_PATH] } }],
  },
  tools: ['read', 'write'],
  escalation: { mode: 'decision-ready' },
};

// Only `changed-from-seed` (a mechanical, offered stage) can be a step's own
// exit condition — a judged stage "cannot stand alone as a ruler" and is
// deliberately HIDDEN from the check menu (src/kinds.js); it renders only
// once, at the close's own final verdict, after every step's mechanical
// exits are already satisfied.
const tcall = (id, name, args) => ({ id, name, arguments: args });
const plan = JSON.stringify({
  schema: 'plan-v1',
  steps: [{
    id: 'write-test', action: 'Write the missing test.', tools: ['write'], rounds: 6,
    target: 'tests/test_x.mjs',
    exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'changed-from-seed' }],
  }],
});
const provider = scriptedProvider([
  { text: 'no tests exist yet' },
  { text: plan },
  { toolCalls: [tcall('t1', 'shell_write', { path: join(workdir, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
  { text: 'wrote it' },
]);

const judgeProvider = mode === 'hang'
  // never resolves — the exact class the backstop exists to catch. Nothing
  // else in this process holds the event loop open on its account (this
  // call is the one path with NO stall watch — see the header comment), so
  // node drains and fires a REAL `beforeExit` with no help from this script.
  ? { async generate() { return new Promise(() => {}); } }
  // a real, prompt judge answer: the locate call's own reply envelope
  // (src/judged.js: text/toolCalls/usage/costUsd/stopReason), text carrying
  // the JSON facts the judged-stage kind parses.
  : { async generate() { return { text: JSON.stringify(PASS_FACTS), toolCalls: [], usage: { inputTokens: 20, outputTokens: 20 }, costUsd: 0.0004, stopReason: 'end_turn', model: null }; } };

const run = runJob(job, {
  approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }],
  workdir, provider, judgeProvider, emit: makeSpine(spineFile),
});

if (mode === 'hang') {
  // Deliberately NOT awaited. This script now returns to node's own event
  // loop with nothing else pending (the hung generate() promise holds no
  // handle), so node drains on its own — the real event the backstop exists
  // to catch — and this process exits by itself with whatever exit code the
  // backstop (or its absence) left behind.
  void run;
} else {
  const outcome = await run;
  // Mirror src/cli.js's own green/not-green mapping (line ~379) rather than
  // inventing a second exit-code rule for this fixture. `soft-green`'s live
  // green outcome rides the SAME outcome string ('green') the mechanical
  // class does — softgreen is a CLOSE FLOOR, not a different outcome
  // vocabulary (verdict classes reduced to green + softgreen; the judged
  // path still renders through the ONE 'green' terminal).
  process.exitCode = outcome === 'green' || outcome === 'already-green' ? 0 : 1;
}
