// $0 replay: mint the registry row a real archived GREEN spine would have minted had
// run-u been launched with --registry. Same seam (writeRunGreenRow), same inputs
// derived the same way run-u derives them (scripts/run-u.mjs:1280-1305, 1416-1447).
// Usage: node replay-row.mjs <spine.jsonl> <jobs/x.json> <registryDir>
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { writeRunGreenRow, scanSecrets, jobSpecHash } from '../src/index.js';
const [spineFile, specFile, registryDir] = process.argv.slice(2);
const raw = readFileSync(spineFile, 'utf8');
const events = raw.trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const spec = JSON.parse(readFileSync(specFile, 'utf8'));
const js = events.find((e) => e.type === 'job-start');
const je = events.findLast((e) => e.type === 'job-end');
const plan = events.findLast((e) => e.type === 'plan-accepted')?.plan ?? null;
const leaks = scanSecrets(raw);
const specHashNow = jobSpecHash(spec);
console.log('spine job-start specHash', js.specHash.slice(0, 12), 'spec now', specHashNow.slice(0, 12), 'match', js.specHash === specHashNow);
console.log('outcome', je?.outcome, 'spent', je?.spentUsd, 'complete', je?.spendComplete, 'leaks', leaks.length, 'plan', !!plan);
if (leaks.length) { console.error('spine-leak — refusing, same as run-u'); process.exitCode = 2; } else {
  const wallMs = new Date(je.ts).getTime() - new Date(js.ts).getTime();
  const rounds = events.filter((e) => e.type === 'worker-round' && e.kind === 'turn').length;
  const res = writeRunGreenRow({
    registryDir, job: spec, name: undefined, outcome: je.outcome, plan,
    record: {
      runid: js.runid ?? spineFile.match(/u-([a-z0-9-]+)\.jsonl$/)?.[1],
      patient: `replayed-from:${spineFile}`,
      at: new Date().toISOString(),
      costUsd: je?.spentUsd ?? null,
      spendComplete: je?.spentUsd != null && je.spendComplete !== false,
      wallMs, rounds, roundsComplete: true, specHash: js.specHash,
      replayedFrom: spineFile, replayedOn: hostname(),
    },
  });
  console.log(JSON.stringify(res, null, 1).slice(0, 800));
}
