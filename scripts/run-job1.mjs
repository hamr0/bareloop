// Job #1 — the N2 rung-exit run: `litectx-maintainer` end to end on a REAL
// litectx checkout. At N2 a human starts a run by calling runJob() from a
// script (decision #1: no CLI until N5) — this is that script, and nothing
// more: it binds the shell-owned pieces (provider, workdir, spine, approvals)
// and gets out of the way.
//
// human-signs-always, mechanized: the spec's hash is printed, and the run
// refuses to start unless the SAME hash is handed back with --approve. Edit one
// byte of the spec (raise budgetUsd for a resume top-up) and the old signature
// is void by construction — no approval record can outlive the version it signed.
//
// Run:
//   node scripts/run-job1.mjs --workdir <litectx-checkout>              # prints the hash, spends nothing
//   ANTHROPIC_API_KEY=... node scripts/run-job1.mjs --workdir <path> --approve <hash>
//   node scripts/run-job1.mjs --workdir <path> --approve <hash> --dry   # provider throws if called: proves zero tokens

import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { SECRET_PATTERNS } from '../src/validate.js';

const require = createRequire(import.meta.url);
const { AnthropicProvider } = require('bare-agent/providers');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? '');
};
const has = (name) => process.argv.includes(`--${name}`);

const workdir = arg('workdir');
if (!workdir) {
  console.error('--workdir <litectx checkout> is required');
  process.exit(2);
}
const spec = JSON.parse(readFileSync(new URL('../jobs/litectx-maintainer.json', import.meta.url), 'utf8'));
const specHash = jobSpecHash(spec);

// human-signs-always: the approval record is minted OUTSIDE the spec, by a
// human handing back the hash they were shown. No hash, no run — zero tokens.
const approved = arg('approve');
if (approved !== specHash) {
  console.log(`job:       ${spec.job} — ${spec.description}`);
  console.log(`budget:    $${spec.budgetUsd}   fence: ${JSON.stringify(spec.writeScope)}`);
  console.log(`steps:     ${spec.steps.map((s) => `${s.id}(${s.close.type}${s.mode ? `,${s.mode}` : ''})`).join(' → ')}`);
  console.log(`specHash:  ${specHash}`);
  if (approved !== null) console.error(`\nREFUSED: --approve ${approved} does not match this spec version.`);
  console.log(`\nTo approve and run:\n  ANTHROPIC_API_KEY=... node scripts/run-job1.mjs --workdir ${workdir} --approve ${specHash}`);
  process.exit(approved === null ? 0 : 1);
}
const approvals = [{ specHash, signer: process.env.USER ?? 'human', ts: new Date().toISOString() }];

// The provider is a SHELL-owned binding, never the config's (adaptlearn F8).
// --dry binds a provider that THROWS if it is ever called: any outcome other
// than a token-free one becomes a loud failure, never a silent spend.
const dry = has('dry');
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!dry && !apiKey) {
  console.error('ANTHROPIC_API_KEY not set (secrets load from the environment — never the tree)');
  process.exit(2);
}
const provider = dry
  ? { async generate() { throw new Error('DRY RUN: the provider was called — this run was supposed to spend nothing'); } }
  : new AnthropicProvider({ apiKey, model: process.env.BARELOOP_MODEL || 'claude-sonnet-5' });

const wd = resolve(workdir);
// The spine lives OUTSIDE the tree under work (F14): inside it, the worker's own
// readScope covers it — the real run's worker read its own spine — and it would
// show up in the repository's status forever after.
const spineDir = join(wd, '..', `${wd.split('/').at(-1)}-bareloop`);
mkdirSync(spineDir, { recursive: true });
const spineFile = join(spineDir, `job1-${Date.now().toString(36)}.jsonl`);

console.log(`spec ${specHash} approved by ${approvals[0].signer}`);
console.log(`workdir ${wd}${dry ? '   [DRY: provider throws if called]' : `   model ${provider.model ?? ''}`}`);
console.log(`spine   ${spineFile}\n`);

const outcome = await runJob(spec, { approvals, workdir: wd, provider, emit: makeSpine(spineFile) });

// ---- the rung-exit criteria, checked as data (never a claim in prose) ----
const events = readFileSync(spineFile, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const raw = readFileSync(spineFile, 'utf8');
const leaks = SECRET_PATTERNS.map((p) => new RegExp(p.source, p.flags.replace('g', '') + 'g')).flatMap((re) => raw.match(re) ?? []);
const spend = events.findLast((e) => e.type === 'job-end')?.spentUsd ?? 0;

console.log(`\noutcome:   ${outcome}`);
console.log(`spent:     $${Number(spend).toFixed(4)} of $${spec.budgetUsd}`);
console.log(`steps:     ${events.filter((e) => e.type === 'step-end').map((e) => `${e.step}=${e.outcome}`).join('  ') || '(none)'}`);
console.log(`spine:     ${events.length} events, terminal=${events.at(-1)?.type === 'job-end'}, secrets-clean=${leaks.length === 0}`);
if (leaks.length) console.error(`SPINE LEAK — ${leaks.length} secret-shaped match(es): the hard line is broken`);

const esc = events.findLast((e) => e.type === 'escalation');
if (esc) {
  console.log(`\nescalation (${esc.category}, decision-ready):\n  ${esc.decision}`);
  for (const o of esc.options ?? []) console.log(`   - ${o}`);
  if (esc.pr?.url) console.log(`  PR: ${esc.pr.url}`);
  if (esc.pr?.error) console.log(`  PR failed: ${esc.pr.error}`);
}
process.exit(leaks.length ? 1 : 0);
