// Export M2 (`docs/product/EXPORT-BUILD.md`) — the `bareloop` CLI. All logic
// lives HERE, testable at $0 with an in-process `main(argv, deps)`; `bin/
// bareloop.mjs` is a ~10-line adapter that supplies the real `deps` and turns
// the returned exit code into `process.exitCode`.
//
// `deps.provider` (and `providerFor`/`judgeProvider`) is the ONE test seam: a
// caller that supplies it skips the real-key check entirely (a scripted
// provider IS the run, same as `tests/planrun.test.js`'s pattern). A caller
// that does NOT supply one goes through the real path M1's frozen spec names:
// a key from `ANTHROPIC_API_KEY` only, absent means print the operator
// questions and spend nothing (`bareloop run`, step 3).
//
// Money/arbiter rules this module must not bend: `--budget`/`--wall` only
// TIGHTEN a bundle's signed ceilings (`checkEnvelope`, M1); a bundle's
// `bundleHash` (the human-facing signature) never changes when the runner
// tightens — the SPEC that actually executes does, and this module mints a
// FRESH `approvals` record over that tightened, `$BARELOOP_BUNDLE`-resolved
// spec so `checkApproval` inside `runJob` always sees the spec it is about to
// run, never the unresolved bundleHash. `history.jsonl` records both hashes
// side by side (POC fact 2) so the pairing can never drift silently.

import { createRequire } from 'node:module';
import { createInterface } from 'node:readline/promises';
import { hostname } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, renameSync,
} from 'node:fs';
import {
  dirname, isAbsolute, join, resolve,
} from 'node:path';

import {
  exportBundle, readBundle, resolveBundleSpec, checkEnvelope, bless, verifyBlessing, appendHistory, checkBundleDeps,
  runJob, makeSpine, loadRegistry, listingRow, jobSpecHash, resolveWorkerModel, JUDGE_MODEL,
} from './index.js';

const require = createRequire(import.meta.url);

// The runner's own tier menu, the same spelling `scripts/run-u.mjs` uses (not
// exported from `src/` — the tier->model mapping is runner territory, not the
// library's). A `bareloop run` has no `--model` flag (not in the frozen
// spec), so `flagModel` is always undefined and only the spec's own `model`
// (if signed) or this default is ever in play.
const DEFAULT_TIER_MODELS = { sonnet: 'claude-sonnet-5', haiku: 'claude-haiku-4-5-20251001' };

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => typeof v === 'object' && v !== null;

/**
 * Build the real providers from an API key, exactly the way `scripts/run-
 * u.mjs` does (provider/providerFor/judgeProvider from `bare-agent/
 * providers`'s `AnthropicProvider`). `AnthropicProvider` itself lives in
 * `bare-agent` (the one production dependency already budgeted for provider
 * calls); this function only wires it up the same way the u-runner does —
 * it is not arbiter logic (no budget/verdict/merge decision lives here).
 * @param {string} apiKey
 * @param {any} spec the (already `$BARELOOP_BUNDLE`-resolved) bundle spec
 */
function buildProviders(apiKey, spec) {
  const { AnthropicProvider } = require('bare-agent/providers');
  const modelResolution = resolveWorkerModel({
    specModel: isObj(spec) && typeof spec.model === 'string' ? spec.model : undefined,
    flagModel: undefined,
    defaultModel: DEFAULT_TIER_MODELS.sonnet,
  });
  const MODEL = modelResolution.model;
  const provider = new AnthropicProvider({ apiKey, model: MODEL });
  const TIER_MODELS = modelResolution.source === 'spec' ? { ...DEFAULT_TIER_MODELS, sonnet: MODEL } : DEFAULT_TIER_MODELS;
  /** @type {Record<string, any>} */
  const tierCache = {};
  const providerFor = (/** @type {string} */ tier) => (tierCache[tier] ??= (TIER_MODELS[/** @type {keyof typeof TIER_MODELS} */ (tier)] === MODEL ? provider : new AnthropicProvider({ apiKey, model: TIER_MODELS[/** @type {keyof typeof TIER_MODELS} */ (tier)] })));
  const judgeProvider = new AnthropicProvider({ apiKey, model: JUDGE_MODEL });
  return { provider, providerFor, judgeProvider };
}

/** @param {string[]} args @returns {{ positional: string[], flags: Record<string, string|true> }} */
function parseFlags(args) {
  /** @type {string[]} */
  const positional = [];
  /** @type {Record<string, string|true>} */
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; } else flags[key] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

/** @returns {string} this package's own version, for the manifest's `bareloopVersion` */
function readPackageVersion() {
  const pkgUrl = new URL('../package.json', import.meta.url);
  return JSON.parse(readFileSync(pkgUrl, 'utf8')).version;
}

/**
 * Build the `closeScripts` map `exportBundle` expects (path -> source) and a
 * copy of the spec whose `close[].cmd` paths are ABSOLUTE — M1's
 * `exportBundle` only relocates `node <absolute path>.mjs …`. A relative path
 * in a hand-authored spec is resolved against the spec FILE's own directory
 * (the same "the spec's own location is the reference point" the u-runner
 * uses when it resolves `jobs/<name>.json` off `import.meta.url`), not the
 * process cwd.
 * @param {any} spec @param {string} specFile absolute path to the spec file
 */
function loadCloseScripts(spec, specFile) {
  const specDir = dirname(specFile);
  const stages = Array.isArray(spec.close) ? spec.close : [];
  const resolvedClose = stages.map((/** @type {any} */ stage) => {
    if (!isObj(stage) || typeof stage.cmd !== 'string') return stage;
    const parts = stage.cmd.trim().split(/\s+/);
    if (parts[0] !== 'node' || parts.length < 2) return stage;
    const scriptPath = parts[1];
    const abs = isAbsolute(scriptPath) ? scriptPath : resolve(specDir, scriptPath);
    return { ...stage, cmd: ['node', abs, ...parts.slice(2)].join(' ') };
  });
  /** @type {Record<string, string>} */
  const closeScripts = {};
  for (const stage of resolvedClose) {
    if (!isObj(stage) || typeof stage.cmd !== 'string') continue;
    const parts = stage.cmd.trim().split(/\s+/);
    if (parts[0] === 'node' && parts[1] && isAbsolute(parts[1]) && existsSync(parts[1])) {
      closeScripts[parts[1]] = readFileSync(parts[1], 'utf8');
    }
  }
  return { resolvedSpec: { ...spec, close: resolvedClose }, closeScripts };
}

/** @param {import('./bundle.js').Red[]} reds @param {(s: string) => void} err */
function printReds(reds, err) {
  for (const r of reds) err(`${r.code} at ${r.path}: ${r.detail ?? ''}`.trim());
}

/**
 * `bareloop export <jobs/x.json> --registry <dir> --out <dir>`
 * @param {string[]} args @param {{ out: (s: string) => void, err: (s: string) => void, cwd: string }} ctx
 */
function doExport(args, { out, err, cwd }) {
  const { positional, flags } = parseFlags(args);
  const specPathArg = positional[0];
  const registryDir = typeof flags.registry === 'string' ? flags.registry : undefined;
  const outDirArg = typeof flags.out === 'string' ? flags.out : undefined;
  if (!specPathArg || !registryDir || !outDirArg) {
    err('usage: bareloop export <jobs/x.json> --registry <dir> --out <dir>');
    return 1;
  }
  const specFile = resolve(cwd, specPathArg);
  let specText;
  try { specText = readFileSync(specFile, 'utf8'); } catch (e) {
    err(`cannot read job spec at ${specFile}: ${/** @type {Error} */ (e).message}`);
    return 1;
  }
  let spec;
  try { spec = JSON.parse(specText); } catch (e) {
    err(`job spec at ${specFile} is not valid JSON: ${/** @type {Error} */ (e).message}`);
    return 1;
  }
  const { resolvedSpec, closeScripts } = loadCloseScripts(spec, specFile);
  const bareloopVersion = readPackageVersion();
  const r = exportBundle({
    spec: resolvedSpec, closeScripts, registryDir: resolve(cwd, registryDir), outDir: resolve(cwd, outDirArg), bareloopVersion,
  });
  if (!r.ok) { printReds(r.reds, err); return 1; }
  out(`bundleHash: ${r.bundleHash}`);
  out('files:');
  for (const f of Object.keys(r.manifest.files).sort()) out(`  ${f}`);
  out("this bundle is unblessed until its first run greens on the importer's machine.");
  return 0;
}

/**
 * `bareloop run <bundleDir> --repo <path> [--budget N] [--wall MIN] [--approve <bundleHash>]`
 * — the exact five-step order the frozen spec names; no step may be reordered.
 * @param {string[]} args
 * @param {{ out: (s: string) => void, err: (s: string) => void, cwd: string, env: Record<string,string|undefined>, now: () => number, deps: any }} ctx
 */
async function doRun(args, { out, err, cwd, env, now, deps }) {
  const { positional, flags } = parseFlags(args);
  const bundleDirArg = positional[0];
  const repoArg = typeof flags.repo === 'string' ? flags.repo : undefined;
  if (!bundleDirArg || !repoArg) {
    err('usage: bareloop run <bundleDir> --repo <path> [--budget N] [--wall MIN] [--approve <bundleHash>]');
    return 1;
  }
  const bundleDir = resolve(cwd, bundleDirArg);
  const repo = resolve(cwd, repoArg);

  // 1. readBundle — N4: this must complete, clean, before anything else
  // touches the bundle or the repo. Any red (incl. bundle-tampered) stops here.
  const bundle = readBundle(bundleDir);
  if (!bundle.ok) { printReds(bundle.reds, err); return 1; }

  // 1b. F128 — the bundle's OWN node_modules must carry `bareloop` before
  // anything else runs. Left unchecked, the close crashes deep inside
  // runJob's close-first precheck with a bare ERR_MODULE_NOT_FOUND, reported
  // as an unhelpful generic close-red with no cure line.
  const depsCheck = checkBundleDeps(bundleDir);
  if (!depsCheck.ok) { printReds(depsCheck.reds, err); return 1; }

  // 2. checkEnvelope — tighten-only, wall given in minutes -> ms.
  /** @type {{ budgetUsd?: number, maxWallMs?: number }} */
  const envelope = {};
  if (flags.budget !== undefined) {
    const n = Number(flags.budget);
    if (!Number.isFinite(n)) { err(`--budget must be a number, got ${JSON.stringify(flags.budget)}`); return 1; }
    envelope.budgetUsd = n;
  }
  if (flags.wall !== undefined) {
    const n = Number(flags.wall);
    if (!Number.isFinite(n)) { err(`--wall must be a number of minutes, got ${JSON.stringify(flags.wall)}`); return 1; }
    envelope.maxWallMs = n * 60_000;
  }
  const envCheck = checkEnvelope(bundle.spec, envelope);
  if (!envCheck.ok) { printReds(envCheck.reds, err); return 1; }

  // 3. the key — ANTHROPIC_API_KEY only, UNLESS a caller already handed in a
  // provider (the test seam). Absent and no injected provider: print the
  // operator questions (the bundle's own README) and the hash, spend nothing.
  let { provider, providerFor, judgeProvider } = deps;
  if (!provider) {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      let readme = null;
      try { readme = readFileSync(join(bundleDir, 'README.md'), 'utf8'); } catch { /* fall through to the hash alone */ }
      if (readme) out(readme);
      out(`bundleHash: ${bundle.manifest.bundleHash}`);
      return 0;
    }
    ({ provider, providerFor, judgeProvider } = buildProviders(apiKey, bundle.spec));
  }

  // 4. blessing.
  const { manifest } = bundle;
  if (!bundle.blessing) {
    // The runid that ACTUALLY minted this bundle's own signed spec — the
    // bridge VERSION (base or shape fork; both ship into bridges/) whose
    // recorded specHash equals the resolved bundle spec's jobSpecHash. NOT
    // the bridge's first history row: a job can be re-exported/rebased many
    // times, and only the version at THIS exact hash proves anything for
    // THIS bundle.
    const { approveHash: mintMatchHash } = resolveBundleSpec(bundle, bundleDir);
    let mintRunid = null;
    for (const b of bundle.bridges) {
      const versions = Array.isArray(b.versions) ? b.versions : [];
      const v = versions.find((/** @type {any} */ ver) => ver.specHash === mintMatchHash);
      if (v) { mintRunid = v.runid; break; }
    }
    out('first run — this bundle has never been blessed on this machine.');
    out(mintRunid ? `minting run: ${mintRunid} (spine not bundled in v1)` : 'no version at this hash');
    out(`bundleHash: ${manifest.bundleHash}`);
    if (flags.approve !== manifest.bundleHash) {
      err(`--approve ${manifest.bundleHash} is required for the first run of an unblessed bundle`);
      return 1;
    }
  } else {
    const vb = verifyBlessing(bundle);
    if (!vb.ok) { printReds(vb.reds, err); return 1; }
    if (flags.approve) out('already blessed, --approve ignored');
  }

  // 5. the worktree — refuse a non-repo, a repo with no commit, or a collision;
  // ALWAYS fresh, never reused (a reused worktree reads last run's edits as
  // "already-green" — the negative POC's exact finding).
  try {
    execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  } catch (e) {
    err(`--repo ${repoArg} must be a git repository with at least one commit: ${/** @type {Error} */ (e).message}`);
    return 1;
  }
  const runid = now().toString(36);
  const worktree = join(repo, '.bareloop', 'wt', runid);
  if (existsSync(worktree)) { err(`worktree already exists: ${worktree}`); return 1; }
  mkdirSync(dirname(worktree), { recursive: true });
  try {
    execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', worktree, 'HEAD'], { encoding: 'utf8' });
  } catch (e) {
    err(`git worktree add failed: ${/** @type {Error} */ (e).message}`);
    return 1;
  }

  // 6. resolve (in-memory $BARELOOP_BUNDLE substitution) + tighten + run. The
  // envelope tightens the ACTUAL spec that runs (budgetUsd/maxWallMs have no
  // separate runJob override — the library reads them off the spec itself),
  // so `approveHash` is recomputed AFTER tightening: the runner mints its own
  // fresh approval over the exact spec it is about to hand to runJob, never
  // over the untightened one `resolveBundleSpec` first returned. The
  // bundleHash a human approved never changes; only the executed spec's own
  // hash does, and that hash is minted here, not signed by a person.
  const resolved = resolveBundleSpec(bundle, bundleDir);
  const runSpec = resolved.spec;
  if (envelope.budgetUsd !== undefined) runSpec.budgetUsd = envelope.budgetUsd;
  if (envelope.maxWallMs !== undefined) runSpec.maxWallMs = envelope.maxWallMs;
  const approveHash = jobSpecHash(runSpec);

  const runsDir = join(bundleDir, 'runs', runid);
  mkdirSync(runsDir, { recursive: true });
  const spineFile = join(runsDir, 'spine.jsonl');
  const emit = makeSpine(spineFile);

  let outcome;
  try {
    outcome = await runJob(runSpec, {
      approvals: [{ specHash: approveHash, signer: 'bundle', ts: new Date(now()).toISOString() }],
      workdir: worktree,
      provider,
      providerFor,
      judgeProvider,
      emit,
      shellCapUsd: runSpec.budgetUsd,
      readShim: 'cap',
      scout: true,
      // F130/PRD item 27(c) — the bundle CLI has no `--resume` (v1); the
      // honest tail says so instead of naming a flag that does not exist.
      resumable: false,
    });
  } catch (e) {
    err(`runJob crashed: ${/** @type {Error} */ (e).message}`);
    return 1;
  }

  // the gate-audit relocation (POC fact 3, run-u.mjs:1293's move)
  const auditSrc = join(worktree, 'gate-audit.jsonl');
  if (existsSync(auditSrc)) renameSync(auditSrc, join(runsDir, 'gate-audit.jsonl'));

  // the job-end record off THIS run's own spine — never fabricate a 0 for an
  // unknown spend (F6/F12's class).
  const events = readFileSync(spineFile, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const je = events.findLast((/** @type {any} */ e) => e.type === 'job-end');
  const spentUsd = je?.spentUsd ?? null;
  const spendComplete = je?.spendComplete ?? null;

  let branch = null;
  try { branch = execFileSync('git', ['-C', worktree, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* leave null — reported honestly below */ }

  // 7. history + (on a first green) the blessing.
  appendHistory(bundleDir, {
    runid,
    at: new Date(now()).toISOString(),
    outcome,
    spentUsd,
    spendComplete,
    budgetUsd: runSpec.budgetUsd,
    maxWallMs: runSpec.maxWallMs ?? null,
    worktree,
    branch,
    bundleHash: manifest.bundleHash,
    approveHash,
  });
  if (outcome === 'green' && !bundle.blessing) {
    bless(bundleDir, {
      bundleHash: manifest.bundleHash, blessedAt: new Date(now()).toISOString(), runid, outcome, host: hostname(),
    });
  }

  // 8. the tail.
  out(`outcome   ${outcome}`);
  out(`spent     ${spentUsd == null ? 'UNKNOWN' : `${spendComplete === false ? '≥' : ''}$${spentUsd.toFixed(4)}`} of $${runSpec.budgetUsd}`);
  out(`branch    ${branch ?? 'UNKNOWN (could not read the worktree branch)'}`);
  out(`worktree  ${worktree}`);
  if (branch) out(`merge     git merge ${branch}   (merge stays human — this CLI never merges)`);
  out(`the worktree is kept until you remove it: git worktree remove ${worktree}`);
  // exit 0 ONLY for a real green — every other outcome (close-red, plan-red,
  // escalated, cap/wall halts, worker-crash, provider-red, …) exits 1 so a
  // caller scripting `bareloop run` off its exit code cannot mistake a red
  // for a success. The tail print above is unchanged either way.
  return outcome === 'green' || outcome === 'already-green' ? 0 : 1;
}

/**
 * `bareloop history <bundleDir>`
 * @param {string[]} args @param {{ out: (s: string) => void, err: (s: string) => void, cwd: string }} ctx
 */
function doHistory(args, { out, err, cwd }) {
  const bundleDirArg = args[0];
  if (!bundleDirArg) { err('usage: bareloop history <bundleDir>'); return 1; }
  const dir = resolve(cwd, bundleDirArg);
  const historyFile = join(dir, 'history.jsonl');
  if (existsSync(historyFile)) {
    out('history:');
    for (const line of readFileSync(historyFile, 'utf8').split('\n')) {
      if (line.trim()) out(`  ${line.trim()}`);
    }
  } else out('history: (no runs yet)');
  const reg = loadRegistry(join(dir, 'bridges'));
  if (reg.bridges.length > 0) {
    out('bridges:');
    for (const b of reg.bridges) out(`  ${JSON.stringify(listingRow(b))}`);
  }
  return 0;
}

/**
 * The bare `bareloop` menu: `1 export  2 run  3 history  q quit`, then the
 * SAME code path as the sub-command, asking its args line by line.
 * @param {any} deps @param {{ out: (s: string) => void, err: (s: string) => void, cwd: string, env: any, now: () => number }} ctx
 */
async function runMenu(deps, ctx) {
  const stdin = deps.stdin;
  const stdout = deps.stdout;
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    ctx.out('1 export  2 run  3 history  q quit');
    const choice = (await rl.question('> ')).trim().toLowerCase();
    if (choice === '' || choice === 'q' || choice === 'quit') return 0;
    if (choice === '1') {
      const specPath = (await rl.question('job spec path: ')).trim();
      const registry = (await rl.question('registry dir: ')).trim();
      const outDir = (await rl.question('out dir: ')).trim();
      return doExport([specPath, '--registry', registry, '--out', outDir], ctx);
    }
    if (choice === '2') {
      const bundleDir = (await rl.question('bundle dir: ')).trim();
      const repo = (await rl.question('repo path: ')).trim();
      const budget = (await rl.question('budget (blank to skip): ')).trim();
      const wall = (await rl.question('wall minutes (blank to skip): ')).trim();
      const approve = (await rl.question('approve hash (blank to skip): ')).trim();
      const args = [bundleDir, '--repo', repo];
      if (budget) args.push('--budget', budget);
      if (wall) args.push('--wall', wall);
      if (approve) args.push('--approve', approve);
      return await doRun(args, { ...ctx, deps });
    }
    if (choice === '3') {
      const bundleDir = (await rl.question('bundle dir: ')).trim();
      return doHistory([bundleDir], ctx);
    }
    ctx.err(`unknown choice ${JSON.stringify(choice)} — one of: 1, 2, 3, q`);
    return 1;
  } finally {
    rl.close();
  }
}

/**
 * The one entry point. Never calls `process.exit` — always returns an exit
 * code, so `bin/bareloop.mjs` can set `process.exitCode` and let node flush
 * queued stdout on its own (F-something: `process.exit()` can discard it).
 * @param {string[]} argv
 * @param {{ env?: Record<string,string|undefined>, stdout?: any, stderr?: any, cwd?: string, provider?: any, providerFor?: any, judgeProvider?: any, now?: () => number, stdin?: any }} deps
 * @returns {Promise<number>}
 */
export async function main(argv, deps = {}) {
  const env = deps.env ?? process.env;
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const cwd = deps.cwd ?? process.cwd();
  const now = deps.now ?? (() => Date.now());
  const out = (/** @type {string} */ s) => stdout.write(`${s}\n`);
  const err = (/** @type {string} */ s) => stderr.write(`${s}\n`);
  const ctx = { out, err, cwd, env, now, deps };

  const [cmd, ...rest] = argv;
  if (!cmd) return runMenu({ ...deps, stdin: deps.stdin ?? process.stdin, stdout }, ctx);
  if (cmd === 'export') return doExport(rest, ctx);
  if (cmd === 'run') return doRun(rest, ctx);
  if (cmd === 'history') return doHistory(rest, ctx);
  err(`unknown command ${JSON.stringify(cmd)} — one of: export, run, history`);
  return 1;
}
