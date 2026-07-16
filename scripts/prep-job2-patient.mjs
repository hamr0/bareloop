// Job #2 patient preparation — idempotent, token-free, spends nothing.
// Stands up the `mailproof` patient for the N2 loop test EXACTLY as the frozen
// pre-registration (docs/02-experiments/JOB2-PREREG.md) specifies, and refuses to proceed if
// reality drifts from the prereg by one test.
//
// The real ~/PycharmProjects/mailproof is NEVER mutated: this clones it to a
// directory OUTSIDE the bareloop tree, pins the frozen commit, and does all its
// work (deps, the plant, the two verifications) on the clone.
//
//   node scripts/prep-job2-patient.mjs           # clone/pin, verify green, plant, verify red
//   node scripts/prep-job2-patient.mjs --restore # undo the plant only (leave the checkout pristine)
//
// Re-running is safe: the plant is a working-tree edit, restored to pristine
// before each green check, so the "green at HEAD" gate is honest every time.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ---- the frozen facts (docs/02-experiments/JOB2-PREREG.md) ------------------------------
const SOURCE = '/home/hamr/PycharmProjects/mailproof';
const DEST = '/home/hamr/PycharmProjects/bareloop-patients/mailproof-job2';
const COMMIT = '091027d4d88922a451752f08d019c81736b09873';
const NOTIFY = 'src/notify.js';
const PLANT_FROM = '        if (custom) body = custom;';
const PLANT_TO = '        body = custom;';
// the 5 failing tests the plant must produce, verbatim from the prereg
const EXPECTED_FAILS = Object.freeze([
  'remind+: workflow — initiator triggers reminder to every eligible step (ctx.reminder=true)',
  'triggers: composeNotification overrides the body; neutral default otherwise',
  'triggers: completion ctx exposes countedCommits + per-reply receipts from the ledger',
  'triggers: completion ctx for crypto carries the one signer receipt',
  'm7d e2e: every kernel occasion fires through one deliver(), keyed by kind',
]);

const has = (name) => process.argv.includes(`--${name}`);
const git = (args, cwd = DEST) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** run the patient's `npm test` the way the close will — argv, no shell, output captured.
 *  node --test exits non-zero on a red suite, so a non-green run is a normal RETURN, not a throw. */
function npmTest() {
  try {
    const stdout = execFileSync('npm', ['test'], { cwd: DEST, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { status: 0, out: stdout };
  } catch (e) {
    // execFileSync throws on non-zero exit; the child's captured streams ride the error
    return { status: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** the TAP summary the close's `judged` floor reads — node --test prints `# tests N`, `# fail N` */
function tap(out) {
  const num = (label) => Number((new RegExp(`^# ${label} (\\d+)$`, 'm').exec(out) ?? [])[1] ?? NaN);
  const fails = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
  return { tests: num('tests'), pass: num('pass'), fail: num('fail'), fails };
}

function notifyPath() { return join(DEST, NOTIFY); }
function restoreNotify() { git(['checkout', '--', NOTIFY]); }

function die(msg, extra) {
  console.error(`\nSTOP: ${msg}`);
  if (extra) console.error(extra);
  process.exit(1);
}

// ---- 1. clone (idempotent) + pin the frozen commit -----------------------
mkdirSync(dirname(DEST), { recursive: true });
if (!existsSync(join(DEST, '.git'))) {
  console.log(`clone   ${SOURCE} → ${DEST}`);
  execFileSync('git', ['clone', '--no-hardlinks', SOURCE, DEST], { encoding: 'utf8' });
} else {
  console.log(`reuse   ${DEST} (already cloned)`);
}
// pin: fetch is unnecessary for a local clone that already has the commit; checkout detaches at it
git(['checkout', '--quiet', COMMIT]);
const head = git(['rev-parse', 'HEAD']);
if (head !== COMMIT) die(`HEAD ${head} is not the frozen commit ${COMMIT}`);
console.log(`commit  ${head} (frozen, matches prereg)`);

// --restore: undo the plant and stop (leave the checkout pristine for a re-plant)
if (has('restore')) {
  restoreNotify();
  console.log('restored src/notify.js to pristine — no plant applied.');
  process.exit(0);
}

// ---- 2. deps -------------------------------------------------------------
if (!existsSync(join(DEST, 'node_modules'))) {
  console.log('install npm install (deps: mailauth, mailparser)…');
  execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: DEST, encoding: 'utf8', stdio: 'inherit' });
} else {
  console.log('deps    node_modules present');
}

// ---- 3. VERIFY BEFORE PLANT: pristine suite is green ---------------------
restoreNotify(); // a prior run may have left the plant in the working tree
console.log('\nverify  green-before-plant (npm test, ~26s)…');
const before = npmTest();
const bt = tap(before.out);
console.log(`        exit ${before.status} — tests ${bt.tests}, pass ${bt.pass}, fail ${bt.fail}`);
if (before.status !== 0 || bt.fail !== 0) die('patient is not green at the frozen commit', before.out.slice(-2000));
if (bt.tests < 317) die(`expected >=317 tests at HEAD, saw ${bt.tests}`);

// ---- 4. PLANT: delete the one falsy-guard --------------------------------
const src = readFileSync(notifyPath(), 'utf8');
if (!src.includes(PLANT_FROM)) die(`plant site not found in ${NOTIFY}: ${JSON.stringify(PLANT_FROM)}`);
if ((src.split(PLANT_FROM).length - 1) !== 1) die(`plant site is not unique in ${NOTIFY}`);
writeFileSync(notifyPath(), src.replace(PLANT_FROM, PLANT_TO));
console.log(`\nplant   ${NOTIFY}: "if (custom) body = custom;" → "body = custom;"`);

// ---- 5. VERIFY AFTER PLANT: reds with EXACTLY the prereg's 5 failures -----
console.log('verify  red-after-plant (npm test)…');
const after = npmTest();
const at = tap(after.out);
console.log(`        exit ${after.status} — tests ${at.tests}, pass ${at.pass}, fail ${at.fail}`);
console.log('        failing tests:');
for (const f of at.fails) console.log(`          not ok — ${f}`);

const got = new Set(at.fails);
const missing = EXPECTED_FAILS.filter((t) => !got.has(t));
const extra = at.fails.filter((t) => !EXPECTED_FAILS.includes(t));
if (after.status === 0) die('plant did not red the suite — the bug is inert');
if (at.fail !== 5 || missing.length || extra.length) {
  die('red suite does not match the prereg (5 named failures)',
    `missing:\n  ${missing.join('\n  ') || '(none)'}\nunexpected:\n  ${extra.join('\n  ') || '(none)'}`);
}

console.log('\nOK — patient planted and verified against the prereg (5/5 failures match).');
console.log(`workdir for the run:  ${DEST}`);
