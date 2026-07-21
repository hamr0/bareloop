// Plant battery runner — the frozen 7-plant battery of docs/02-experiments/BATTERY-PREREG.md
// against the frozen mailproof patient. One human signature (the spec hash)
// covers all 7 runs: the spec, the $3 cap, the 3 attempts, and the model are
// identical per plant BY THE FROZEN RULES — nothing here is a knob.
//
// Per plant, in the frozen order: reset the patient to the frozen commit →
// apply the ONE line → sanity-run the close and compare the failing set to the
// prereg's recorded set (drift = STOP, never a shrug) → runJob under the signed
// spec → archive the gate audit out of the tree → record the row. Battery-level
// guards: cumulative spend hard-stops at $10 (frozen; the stop is a result),
// and a sanity/plant drift stops the battery before any further spend.
//
//   node scripts/run-battery.mjs                                  # prints hash + plan, spends nothing
//   node scripts/run-battery.mjs --approve <hash> --dry           # full cycle, provider throws if called
//   ANTHROPIC_API_KEY=... node scripts/run-battery.mjs --approve <hash>
//   ... --only P3            # rerun a subset (after a STOP); frozen order still applies
//
// BATTERY-PREREG reading rules bind this file: pass-1 labels are provisional,
// plants get discarded, rules never get loosened.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { SECRET_PATTERNS } from '../src/validate.js';

const require = createRequire(import.meta.url);
const { AnthropicProvider } = require('bare-agent/providers');

// ---- the frozen facts (docs/02-experiments/BATTERY-PREREG.md — transcribed, never edited) ----
const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/mailproof-job2';
const COMMIT = '091027d4d88922a451752f08d019c81736b09873';
const MODEL = 'claude-sonnet-5';
const BATTERY_CAP_USD = 10; // pass-1 total spend hard-stop (frozen)

/**
 * The frozen plant table, transcribed EXACTLY from docs/02-experiments/BATTERY-PREREG.md
 * ("Accepted plants"). `before` must occur EXACTLY ONCE in `file` at the frozen
 * commit (verified 2026-07-15 against `git show` at the commit — each at the
 * recorded line). `fails` are the verbatim `not ok` subtest names the prereg
 * recorded; the live sanity close must reproduce this exact set or the battery
 * STOPS (drift rule). A mismatch here is a STOP-and-report, never a local fix.
 * @type {ReadonlyArray<{id: string, file: string, line: number, before: string, after: string, fails: readonly string[], culprit: string}>}
 */
const PLANTS = Object.freeze([
  {
    id: 'P1', file: 'src/notify.js', line: 74,
    before: 'if (custom) body = custom;',
    after: 'body = custom;',
    fails: Object.freeze([
      'remind+: workflow — initiator triggers reminder to every eligible step (ctx.reminder=true)',
      'triggers: composeNotification overrides the body; neutral default otherwise',
      'triggers: completion ctx exposes countedCommits + per-reply receipts from the ledger',
      'triggers: completion ctx for crypto carries the one signer receipt',
      'm7d e2e: every kernel occasion fires through one deliver(), keyed by kind',
    ]),
    culprit: 'src/notify.js',
  },
  {
    id: 'P2', file: 'src/create.js', line: 234,
    before: "if (ev && ev.activated_at && ev.type === 'workflow') {",
    after: "if (ev && ev.type === 'workflow') {",
    fails: Object.freeze(['edit-renotify: a non-participant edit, and edits on a pending event, ping no one']),
    culprit: 'src/create.js',
  },
  {
    id: 'P3', file: 'src/create.js', line: 237,
    before: "if (c.field !== 'participant' || !c.to || !eligibleIds.has(c.step_id)) continue;",
    after: "if (c.field !== 'participant' || !c.to) continue;",
    fails: Object.freeze(['edit-renotify: reassigning a BLOCKED step does not ping (advance will, later)']),
    culprit: 'src/create.js',
  },
  {
    id: 'P4', file: 'src/create.js', line: 217,
    before: 'const notified = res.alreadyActive ? [] : await notifyActivation(res.event);',
    after: 'const notified = await notifyActivation(res.event);',
    fails: Object.freeze(['activation: sequential workflow pings only the first eligible step, once']),
    culprit: 'src/create.js',
  },
  {
    id: 'P5', file: 'src/ingest.js', line: 278,
    before: 'if (signed.has(h)) continue;',
    after: 'if (false) continue;',
    fails: Object.freeze(['remind+: crypto — pings every signer that has not yet signed (kind:activation, reminder:true)']),
    culprit: 'src/ingest.js',
  },
  {
    id: 'P6', file: 'src/completion.js', line: 223,
    before: "const allDone = !event.manualCompletion && steps.every((s) => s.status === 'complete');",
    after: "const allDone = steps.every((s) => s.status === 'complete');",
    fails: Object.freeze(['G3a: manualCompletion suppresses workflow auto-complete too']),
    culprit: 'src/completion.js',
  },
  {
    id: 'P7', file: 'src/ingest.js', line: 533,
    before: 'const signerMatch = !!event.open || signers.includes(sender);',
    after: 'const signerMatch = signers.includes(sender);',
    fails: Object.freeze([
      'e2e crypto: open threshold-2 sign-off counts distinct verified signers, rejects self/dupe, locks',
      'reopenEvent: retracts a signature, flips complete→open, appends an event_reopen commit',
    ]),
    culprit: 'src/ingest.js',
  },
]);

// ---- argv (mirrors run-job2.mjs) ------------------------------------------
const arg = (/** @type {string} */ name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? '');
};
const has = (/** @type {string} */ name) => process.argv.includes(`--${name}`);

const spec = JSON.parse(readFileSync(new URL('../jobs/mailproof-fix.json', import.meta.url), 'utf8'));
const specHash = jobSpecHash(spec);
const shellCapUsd = spec.budgetUsd; // ONE number the human signs (see run-job2.mjs)
const dry = has('dry');

// --only P3 / --only P2,P3: rerun a subset after a STOP; the frozen order holds
const only = arg('only');
const wanted = only ? new Set(only.split(',').map((s) => s.trim()).filter(Boolean)) : null;
if (wanted) {
  const known = new Set(PLANTS.map((p) => p.id));
  const bad = [...wanted].filter((id) => !known.has(id));
  if (bad.length) {
    console.error(`unknown plant id(s): ${bad.join(', ')} — known: ${PLANTS.map((p) => p.id).join(', ')}`);
    process.exit(2);
  }
}
const roster = PLANTS.filter((p) => !wanted || wanted.has(p.id));

// human-signs-always: no hash, no run — zero tokens. Unapproved prints the
// battery plan so the human signs knowing exactly what the hash buys: 7 runs.
const approved = arg('approve');
if (approved !== specHash) {
  console.log(`job:       ${spec.job} — ${spec.description.slice(0, 80)}…`);
  console.log(`spec:      jobs/mailproof-fix.json   budget $${spec.budgetUsd}/plant, ${PLANTS.length} plants, battery hard-stop $${BATTERY_CAP_USD}`);
  console.log(`patient:   ${WORKDIR} @ ${COMMIT}`);
  console.log(`specHash:  ${specHash}   (ONE signature covers the whole battery)`);
  console.log('\nplan (frozen order):');
  for (const p of roster) console.log(`  ${p.id}  ${p.file}:${p.line}  ${JSON.stringify(p.before)} → ${JSON.stringify(p.after)}  [${p.fails.length} expected fail(s)]`);
  if (approved !== null) console.error(`\nREFUSED: --approve ${approved} does not match this spec version.`);
  console.log(`\nTo approve and run:\n  ANTHROPIC_API_KEY=... node scripts/run-battery.mjs --approve ${specHash}`);
  process.exit(approved === null ? 0 : 1);
}
const approvals = [{ specHash, signer: process.env.USER ?? 'human', ts: new Date().toISOString() }];

// provider: SHELL-owned binding; --dry throws on ANY call — a loud failure,
// never a silent spend (same doctrine as run-job2.mjs)
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!dry && !apiKey) {
  console.error('ANTHROPIC_API_KEY not set (secrets load from the environment — never the tree)');
  process.exit(2);
}
const provider = dry
  ? { async generate() { throw new Error('DRY RUN: the provider was called — this run was supposed to spend nothing'); } }
  : new AnthropicProvider({ apiKey, model: MODEL });

const wd = resolve(WORKDIR);
// spine + audit archive live OUTSIDE the tree under work (F14)
const spineDir = join(wd, '..', `${wd.split('/').at(-1)}-bareloop`);
mkdirSync(spineDir, { recursive: true });
const runid = Date.now().toString(36);

const git = (/** @type {string[]} */ args) => execFileSync('git', ['-C', wd, ...args], { encoding: 'utf8' }).trim();

/** archive the patient's gate audit out of the tree (the arbiter's books are
 *  never destroyed — a leftover from a prior run is moved aside, not cleaned) */
function archiveAudit(/** @type {string} */ dest) {
  const src = join(wd, 'gate-audit.jsonl');
  if (!existsSync(src)) return null;
  renameSync(src, dest);
  return dest;
}

/** reset the patient to the frozen commit: tracked files forced back, untracked
 *  non-ignored removed. node_modules/.litectx/.smoke survive (ignored AND
 *  explicitly excluded — never re-clone, never reinstall). */
function resetPatient() {
  // any stray gate audit is evidence, not litter — archive before clean eats it
  const stray = archiveAudit(join(spineDir, `battery-${runid}-orphan-gate-audit-${Date.now().toString(36)}.jsonl`));
  if (stray) console.log(`  reset   archived stray gate audit → ${stray}`);
  git(['checkout', '--force', '--quiet', COMMIT]);
  const head = git(['rev-parse', 'HEAD']);
  if (head !== COMMIT) throw new Error(`reset failed: HEAD ${head} != frozen ${COMMIT}`);
  git(['clean', '-fdq', '-e', 'node_modules', '-e', '.litectx', '-e', '.smoke']);
  const status = git(['status', '--porcelain']);
  if (status !== '') throw new Error(`reset left the tree dirty:\n${status}`);
}

/** apply ONE plant. Exactly-once match against the frozen before-line or the
 *  battery ABORTS — a site that moved is drift, never something to fix here. */
function applyPlant(/** @type {(typeof PLANTS)[number]} */ p) {
  const path = join(wd, p.file);
  const src = readFileSync(path, 'utf8');
  const n = src.split(p.before).length - 1;
  if (n !== 1) throw new Error(`DRIFT: ${p.id} before-line found ${n} time(s) in ${p.file} (expected exactly 1) — STOP, investigate against the prereg`);
  writeFileSync(path, src.replace(p.before, p.after));
}

/** run the patient's close ONCE, directly — the sanity instrument (token-free).
 *  node --test exits non-zero on red: a red suite is a normal RETURN, not a throw. */
function sanityClose() {
  let out, status;
  try {
    out = execFileSync('npm', ['test'], { cwd: wd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    status = 0;
  } catch (e) {
    status = /** @type {any} */ (e).status ?? 1;
    out = `${/** @type {any} */ (e).stdout ?? ''}${/** @type {any} */ (e).stderr ?? ''}`;
  }
  const fails = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
  return { status, fails };
}

/** compare the live failing set to the prereg's recorded set — order-free, exact */
function failsMatch(/** @type {string[]} */ live, /** @type {readonly string[]} */ expected) {
  const got = new Set(live);
  const missing = expected.filter((t) => !got.has(t));
  const extra = live.filter((t) => !expected.includes(t));
  return { ok: live.length === expected.length && !missing.length && !extra.length, missing, extra };
}

/** read one plant's row fields off its spine + archived audit — data, never prose */
function readRow(/** @type {string} */ spineFile, /** @type {string|null} */ auditFile, /** @type {(typeof PLANTS)[number]} */ p, /** @type {string} */ outcome) {
  const raw = readFileSync(spineFile, 'utf8');
  const events = raw.trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  // money is metered per ROUND (F12); job-end carries the summed truth. Since F43
  // every job-end STATES spend: spentUsd is the priced floor and spendComplete says
  // whether it is exact. A casualty (pricing-red, or a provider-red transport throw)
  // reports spendComplete:false — the figure is "at least $X", the true total unknown
  // (F6). Older spines (pre-F43) omitted spentUsd entirely (null); both are honest
  // "spend not governable" signals and the STOP below keys on either.
  const je = events.findLast((e) => e.type === 'job-end');
  const spentUsd = je?.spentUsd ?? null;
  const spendComplete = je?.spendComplete; // undefined on pre-F43 spines
  const rounds = events.filter((e) => e.type === 'worker-round').length;
  const runEnd = events.findLast((e) => e.type === 'run-end');
  const attemptsToGreen = runEnd?.outcome === 'green' ? runEnd.iterations : null;
  const leaks = SECRET_PATTERNS.map((re) => new RegExp(re.source, re.flags.replace('g', '') + 'g')).flatMap((re) => raw.match(re) ?? []);
  // gate audit: allowed write-CLASS actions — write AND edit both count (F33: a 7-edit
  // pass read writes=0 because this counter predated the edit verb; an instrument must
  // see every write-class verb, the F32 lesson re-learned at the reporting layer).
  // culpritRead is "culprit content reached the worker by ANY read-class channel":
  // a gated exact-path read, a ctx_get of the culprit, or a before-attempt recall
  // whose hits included it (body:true — the hook hands the worker chunk bodies).
  let writes = null, culpritRead = null;
  if (auditFile) {
    const audit = readFileSync(auditFile, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    writes = audit.filter((a) => (a.action?.type === 'write' || a.action?.type === 'edit') && a.phase === 'gate' && a.decision === 'allow').length;
    culpritRead = audit.some((a) => a.action?.type === 'read' && a.action?.path === join(wd, p.culprit))
      || events.some((e) => e.type === 'ctx-tool' && e.tool === 'ctx_get' && e.path === p.culprit)
      || events.some((e) => e.type === 'ctx-tool' && e.tool === 'ctx_recall' && (e.paths ?? []).includes(p.culprit))
      || events.some((e) => e.type === 'hook-op' && e.op === 'recall' && (e.paths ?? []).includes(p.culprit));
  }
  return { plant: p.id, outcome, attemptsToGreen, writes, culpritRead, rounds, spentUsd, spendComplete, secretsClean: leaks.length === 0, spine: spineFile, audit: auditFile };
}

// ---- the battery ----------------------------------------------------------
console.log(`spec ${specHash} approved by ${approvals[0].signer}`);
console.log(`patient ${wd} @ ${COMMIT}${dry ? '   [DRY: provider throws if called]' : `   model ${MODEL}`}`);
console.log(`caps    $${shellCapUsd}/plant (== approved budget), $${BATTERY_CAP_USD} battery hard-stop`);
console.log(`plants  ${roster.map((p) => p.id).join(' → ')}   runid ${runid}\n`);

/** @type {any[]} */
const rows = [];
let cumulativeUsd = 0;
let stop = null; // a STOP is a result — recorded, reported, never papered over

for (const p of roster) {
  if (cumulativeUsd >= BATTERY_CAP_USD) {
    stop = `battery cap: cumulative spend $${cumulativeUsd.toFixed(4)} >= $${BATTERY_CAP_USD} before ${p.id}`;
    break;
  }
  console.log(`\n== ${p.id}  ${p.file}:${p.line} ==`);

  // 1. reset to the frozen commit
  resetPatient();
  console.log(`  reset   clean at ${COMMIT.slice(0, 12)}`);

  // 2. plant the one line (exactly-once or ABORT)
  try {
    applyPlant(p);
  } catch (e) {
    stop = String(/** @type {Error} */ (e).message);
    rows.push({ plant: p.id, outcome: 'plant-drift', detail: stop });
    break;
  }
  console.log(`  plant   ${JSON.stringify(p.before)} → ${JSON.stringify(p.after)}`);

  // 3. sanity: the close, once, directly — drift in the failing set is a STOP
  console.log('  sanity  npm test (~25s)…');
  const s = sanityClose();
  const m = failsMatch(s.fails, p.fails);
  console.log(`  sanity  exit ${s.status}, ${s.fails.length} not-ok (prereg: ${p.fails.length}) — ${m.ok ? 'MATCH' : 'DRIFT'}`);
  if (s.status === 0 || !m.ok) {
    stop = `${p.id} sanity drift: live failing set differs from the prereg`;
    rows.push({ plant: p.id, outcome: 'sanity-drift', liveFails: s.fails, missing: m.missing, extra: m.extra });
    break; // frozen reading rule: investigate drift before spending more
  }

  // 4. the run — the signed spec, the shell cap, a per-plant spine
  const spineFile = join(spineDir, `battery-${p.id}-${runid}.jsonl`);
  const outcome = await runJob(spec, { approvals, workdir: wd, provider, emit: makeSpine(spineFile), shellCapUsd });

  // 5. archive the gate audit next to the spine BEFORE the next reset
  const audit = archiveAudit(join(spineDir, `battery-${p.id}-${runid}-gate-audit.jsonl`));
  if (!audit) console.log('  audit   none produced (no worker rounds ran)');

  // 6. the row, read off the instruments
  const row = readRow(spineFile, audit, p, outcome);
  rows.push(row);
  cumulativeUsd += row.spentUsd ?? 0;
  console.log(`  row     outcome=${row.outcome} attempts=${row.attemptsToGreen ?? '-'} writes=${row.writes ?? '-'} culpritRead=${row.culpritRead ?? '-'} rounds=${row.rounds} spent=${row.spentUsd == null ? 'UNKNOWN' : `${row.spendComplete === false ? '≥' : ''}$${row.spentUsd.toFixed(4)}${row.spendComplete === false ? ' (floor)' : ''}`}`);
  if (!row.secretsClean) {
    stop = `${p.id}: SPINE LEAK — the hard line is broken`;
    break;
  }
  // unpriced is never free (F6): a real run whose spend is not fully known cannot be
  // summed against the battery cap — the cap cannot govern spend it cannot see. Since
  // F43 the signal is spendComplete === false (an incomplete floor); pre-F43 spines
  // carried a bare null. Either halts (a numeric floor is NOT proof of governable spend).
  if (!dry && (row.spendComplete === false || row.spentUsd == null)) {
    stop = `${p.id}: spend not governable (${row.outcome}) — the $${BATTERY_CAP_USD} cap cannot govern an unpriced/floor spend`;
    break;
  }
}

// leave the patient clean at the frozen commit, whatever happened above
resetPatient();
console.log(`\npatient reset — clean at ${COMMIT.slice(0, 12)}`);

// ---- the result: a table and a JSON file, no claims in prose ---------------
const results = {
  runid, specHash, commit: COMMIT, dry, model: dry ? null : MODEL,
  batteryCapUsd: BATTERY_CAP_USD, cumulativeUsd, stop, rows,
};
const resultsFile = join(spineDir, `battery-results-${runid}.json`);
writeFileSync(resultsFile, JSON.stringify(results, null, 2) + '\n');

console.log('\nplant  outcome        attempts  writes  culpritRead  rounds  spent');
for (const r of rows) {
  console.log(`${r.plant.padEnd(6)} ${String(r.outcome).padEnd(14)} ${String(r.attemptsToGreen ?? '-').padEnd(9)} ${String(r.writes ?? '-').padEnd(7)} ${String(r.culpritRead ?? '-').padEnd(12)} ${String(r.rounds ?? '-').padEnd(7)} ${r.spentUsd == null ? '-' : `$${r.spentUsd.toFixed(4)}`}`);
}
console.log(`\ncumulative: $${cumulativeUsd.toFixed(4)} of $${BATTERY_CAP_USD} battery cap`);
if (stop) console.log(`STOP: ${stop}   (a stop is a result — rows above stand)`);
console.log(`results:    ${resultsFile}`);
process.exit(rows.some((r) => r.secretsClean === false) ? 1 : 0);
