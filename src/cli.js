// Export M2 (`docs/product/EXPORT-BUILD.md`) — the `bareloop` CLI. All logic
// lives HERE, testable at $0 with an in-process `main(argv, deps)`; `bin/
// bareloop.mjs` is a ~10-line adapter that supplies the real `deps` and turns
// the returned exit code into `process.exitCode`.
//
// `bareloop run <bundle>` is a thin door (`src/bundlerun.js`) to the same engine `bareloop
// run-u` drives (`src/userrun.js`): providers, keys (the keys file / env, any provider the
// bundle's spec names), judge, monthly limit and readout are that engine's. The test seam is
// the engine's too: `deps.provider` (and `providerFor`/`judgeProvider`) supplies a scripted
// provider and skips the real-key check (same as `tests/planrun-*.test.js`'s pattern).
//
// Money/arbiter rules the bundle door keeps: `--budget`/`--wall` only TIGHTEN a bundle's
// signed ceilings (`checkEnvelope`, M1); a bundle's `bundleHash` (the human-facing
// signature) never changes when the runner tightens — the SPEC that actually executes does,
// and the door hands the engine the hash of that tightened, `$BARELOOP_BUNDLE`-resolved
// spec. `history.jsonl` records both hashes side by side (POC fact 2) so the pairing can
// never drift silently.

import { openAsker, askRequired } from './prompts.js';
import { listGreenRuns, exportRun } from './runexport.js';
import {
  existsSync, readFileSync,
} from 'node:fs';
import {
  dirname, isAbsolute, join, resolve,
} from 'node:path';

import {
  exportBundle, loadRegistry, listingRow,
} from './index.js';
// One runner: `bareloop run <bundle>` is a thin door to the `run-u` engine (`src/userrun.js`).
import { bundleMain } from './bundlerun.js';
// PANEL-BUILD.md P0 task 2/4 — `bareloop run-u` wraps the person-path run
// flow's own argv-parsing entry (`src/userrun.js`'s `main(argv, deps)`,
// itself the lift target of P0 task 1). This is the SAME function
// `scripts/run-u.mjs` calls directly — routing this command through it
// rather than re-parsing argv a second time here keeps exactly one code
// path for the flag grammar; `src/cli.js` only supplies the deps shape
// (`out`/`err`/`env`) this command's own callers already use.
import { startCmd, stopCmd, restartCmd, statusCmd, installCmd, menuCmd } from './launcher.js';
import { exportedBundles, resolveBundleRef, listResumableBundleRuns } from './bundleref.js';
import { makePaint } from './tty-colour.js';
import { main as runUMain } from './userrun.js';
// PANEL-BUILD.md P1 — the read-only panel HTTP server (`bareloop panel`).
// One more caller of the same `src/` library functions this file already
// calls (the layering law, PANEL-BUILD.md §2) — `src/panel/server.js` never
// re-implements the spine/run-list read side, it calls `src/replayio.js`/
// `src/runlist.js` directly, in-process.
import { panelMain } from './panel/server.js';
import { readHistoryLog } from './replayio.js';
// PANEL-BUILD.md P1 (2026-09-24 rulings) — the one run list
// (`~/.config/bareloop/runs.jsonl`); `bareloop runs` prints it. (`runs backfill` left the CLI, PRD v1.114; the library's `backfillRuns` stays.)
import { keysForDoor } from './keysfile.js';
import { readRunList, formatRunRow } from './runlist.js';

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => typeof v === 'object' && v !== null;

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
 * `bareloop export ["<job> (run-N)"] [--out <dir>]` — a bundle from a green panel / run-u run (PRD v1.114). No name = pick from the numbered
 * list of green runs; no `--out` = ask for the folder. A required prompt answered empty twice ends the command cleanly (exit 0).
 * @param {string[]} args @param {{ out: (s: string) => void, err: (s: string) => void, cwd: string, ask: (q: string) => Promise<string>, canAsk: boolean, deps: any }} ctx
 * @returns {Promise<number>}
 */
async function doExportRun(args, { out, err, cwd, ask, canAsk, deps }) {
  const { positional, flags } = parseFlags(args);
  const home = deps.runlistHome;
  /** @type {string|undefined} */
  let name = positional[0];
  if (name === undefined && !canAsk) { err('usage: bareloop export "<job> (run-N)" --out <dir>'); return 1; }
  if (name === undefined) {
    const runs = listGreenRuns(home === undefined ? {} : { home });
    if (runs.length === 0) { out('No green runs to export yet.'); return 0; }
    out('Green runs you can export:');
    runs.forEach((r, i) => out(`  ${i + 1}  ${r.name}`));
    const pick = await askRequired(ask, 'Number to export: ');
    if (pick === null) { out('Nothing chosen, nothing exported.'); return 0; }
    const hit = /^\d+$/.test(pick) ? runs[Number(pick) - 1] : runs.find((r) => r.name === pick);
    if (!hit) { err(`"${pick}" is not one of the numbers above.`); return 1; }
    name = hit.name;
  }
  /** @type {string|null} */
  let outDirArg = typeof flags.out === 'string' ? flags.out : null;
  if (outDirArg === null && !canAsk) { err('usage: bareloop export "<job> (run-N)" --out <dir>'); return 1; }
  if (outDirArg === null) {
    outDirArg = await askRequired(ask, 'Output folder (new or empty): ');
    if (outDirArg === null) { out('No folder given, nothing exported.'); return 0; }
  }
  const r = exportRun({ name, outDir: resolve(cwd, outDirArg), home, bareloopVersion: readPackageVersion() });
  if (!r.ok) { err(r.why); return 1; }
  out(`exported "${r.name}" to ${r.dir}`);
  out(`bundleHash: ${r.bundleHash}`);
  out(`next: cd ${r.dir} && npm install`);
  out(`then: bareloop run "${r.name}" --repo <your repo>`);
  return 0;
}

/**
 * The menu's Resume: the stopped / capped `bareloop run` runs the engine would resume, numbered; pick one, then the optional more money /
 * more time (a higher cap asks for the typed yes), then it resumes exactly as `bareloop run <bundle> --resume <runid>` does.
 * @param {any} ctx the CLI context with `ask`
 * @returns {Promise<number>}
 */
async function doResumeMenu(ctx) {
  const { out, ask, deps } = ctx;
  const home = deps.runlistHome;
  const list = listResumableBundleRuns(home === undefined ? {} : { home });
  if (list.length === 0) { out('No stopped runs to resume.'); return 0; }
  out('Stopped runs you can resume:');
  list.forEach((r, i) => out(`  ${i + 1}  ${r.label}`));
  const pick = await askRequired(ask, 'Number to resume: ');
  if (pick === null) { out('Nothing chosen, nothing resumed.'); return 0; }
  const hit = /^\d+$/.test(pick) ? list[Number(pick) - 1] : undefined;
  if (!hit) { ctx.err(`"${pick}" is not one of the numbers above.`); return 1; }
  return bundleMain([hit.bundleDir, '--resume', hit.runid], { ...ctx, guided: true, parseFlags, printReds });
}

/**
 * `bareloop history [<bundle>]` — a bundle's run history. The bundle is a folder or the run name it was exported under; with none given
 * it is asked (a number from the exported bundles, a name or a folder).
 * @param {string[]} args @param {{ out: (s: string) => void, err: (s: string) => void, cwd: string, ask: (q: string) => Promise<string>, canAsk: boolean, deps: any }} ctx
 * @returns {Promise<number>}
 */
async function doHistory(args, { out, err, cwd, ask, canAsk, deps }) {
  const home = deps.runlistHome;
  let bundleDirArg = args[0];
  if (!bundleDirArg) {
    if (!canAsk) { err('usage: bareloop history <bundle>'); return 1; }
    const known = exportedBundles(home === undefined ? {} : { home });
    if (known.length > 0) {
      out('Exported bundles:');
      known.forEach((b, i) => out(`  ${i + 1}  ${b.name}`));
    }
    const pick = await askRequired(ask, 'Bundle (a number, its run name, or a folder): ');
    if (pick === null) { out('No bundle chosen, nothing shown.'); return 0; }
    bundleDirArg = /^\d+$/.test(pick) && known[Number(pick) - 1] ? known[Number(pick) - 1].dir : pick;
  }
  const found = resolveBundleRef(bundleDirArg, { ...(home === undefined ? {} : { home }), cwd });
  if (!found.ok) { err(found.why); return 1; }
  const dir = found.dir;
  const historyFile = join(dir, 'history.jsonl');
  if (existsSync(historyFile)) {
    // PANEL-BUILD.md P0 — the one reader for `history.jsonl` (`src/replayio.js`'s
    // `readHistoryLog`), replacing this command's own hand-rolled
    // `readFileSync`/split. Each row is re-printed with `JSON.stringify`
    // (byte-identical to the original trimmed line for every well-formed
    // row, since `appendHistory` itself writes `JSON.stringify(row)` —
    // src/bundle.js:712); a malformed line is counted, never silently
    // dropped or reprinted corrupt.
    const { rows, skipped } = readHistoryLog(historyFile);
    out('history:');
    for (const row of rows) out(`  ${JSON.stringify(row)}`);
    if (skipped > 0) out(`  (${skipped} malformed line${skipped === 1 ? '' : 's'} skipped)`);
  } else out('history: (no runs yet)');
  const reg = loadRegistry(join(dir, 'bridges'));
  if (reg.bridges.length > 0) {
    out('bridges:');
    for (const b of reg.bridges) out(`  ${JSON.stringify(listingRow(b))}`);
  }
  return 0;
}

/**
 * `bareloop runs` — print the one run list, one line per row ({@link formatRunRow}). Read-only, $0: no run trigger, no key ever read.
 * (`runs backfill` left the CLI, PRD v1.114.)
 * @param {string[]} _args @param {{ out: (s: string) => void, deps: any }} ctx
 */
function doRuns(_args, { out, deps }) {
  const { rows, skipped } = readRunList(deps.runlistHome === undefined ? {} : { home: deps.runlistHome });
  if (rows.length === 0) { out('runs: (none listed yet)'); }
  else for (const row of rows) out(formatRunRow(row));
  if (skipped > 0) out(`(${skipped} malformed line${skipped === 1 ? '' : 's'} skipped)`);
  return 0;
}

/**
 * The launcher doors (L, PANEL-BUILD.md addendum 2026-10-24): the bare `bareloop` menu and `start | stop | status | install`. All logic is
 * `src/launcher.js`; this only supplies the home (the SAME one `main` resolved for the keys file and config.json) and the line reader.
 * `deps.launcher` is the test seam for every OS touch (ports, spawn, kill, opener, clock).
 * @param {string} cmd 'menu' | 'start' | 'stop' | 'status' | 'install' @param {string[]} rest
 * @param {any} deps @param {{ out: (s: string) => void, err: (s: string) => void, ask: (q: string) => Promise<string> }} io @param {string|undefined} home
 * @returns {Promise<number>}
 */
async function runLauncher(cmd, rest, deps, io, home) {
  // a closed stdin answers '' (= the safe default: quit / "no"), never hangs
  const ask = io.ask;
  const rawEnv = deps.processEnv ?? process.env;
  // the menu's job commands (PRD v1.114): each prompts for what it needs on the SAME asker as the menu
  const jobCtx = /** @type {any} */ ({ ...io, canAsk: true }); // the full CLI context `main` passed as `io`
  const jobs = {
    export: () => doExportRun([], jobCtx),
    run: () => bundleMain([], { ...jobCtx, guided: true, parseFlags, printReds }),
    resume: () => doResumeMenu(jobCtx),
    history: () => doHistory([], jobCtx),
  };
  const d = { home, jobs, ask, paint: makePaint(deps.stdout ?? process.stdout, rawEnv), paintErr: makePaint(deps.stderr ?? process.stderr, rawEnv), ...(deps.launcher ?? {}) };
  if (cmd === 'start') return startCmd(io, d);
  if (cmd === 'stop') return stopCmd(rest, io, d);
  if (cmd === 'restart') return restartCmd(rest, io, d);
  if (cmd === 'status') return statusCmd(io, d);
  if (cmd === 'install') return installCmd(io, d);
  return menuCmd(io, d);
}

/**
 * The one entry point. Never calls `process.exit` — always returns an exit
 * code, so `bin/bareloop.mjs` can set `process.exitCode` and let node flush
 * queued stdout on its own (F-something: `process.exit()` can discard it).
 * @param {string[]} argv
 * @param {{ env?: Record<string,string|undefined>, stdout?: any, stderr?: any, cwd?: string, provider?: any, providerFor?: any, judgeProvider?: any, judgeModel?: string|null, now?: () => number, stdin?: any, runlistHome?: string, keysHome?: string, processEnv?: Record<string,string|undefined> }} deps
 * @returns {Promise<number>}
 */
export async function main(argv, deps = {}) {
  /** @type {{ a: { ask: (q: string) => Promise<string>, close: () => void }|null }} */
  const holder = { a: null };
  try { return await mainInner(argv, deps, holder); } finally { holder.a?.close(); }
}

/**
 * @param {string[]} argv @param {any} deps @param {{ a: { ask: (q: string) => Promise<string>, close: () => void }|null }} holder one readline for the whole command, opened on first use
 * @returns {Promise<number>}
 */
async function mainInner(argv, deps, holder) {
  // P4a item 1 — the keys file (`~/.config/bareloop/.env`) fills what the shell leaves
  // unset; the shell wins. An injected `deps.env` skips the file (tests never read the
  // real one) unless `deps.keysHome` names a home.
  const keys = keysForDoor(deps);
  const env = keys.env;
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const cwd = deps.cwd ?? process.cwd();
  const now = deps.now ?? (() => Date.now());
  const out = (/** @type {string} */ s) => stdout.write(`${s}\n`);
  const err = (/** @type {string} */ s) => stderr.write(`${s}\n`);
  const ask = (/** @type {string} */ q) => { holder.a ??= openAsker({ stdin: deps.stdin, stdout }); return holder.a.ask(q); };
  // something to ask: a terminal, or a stdin the caller handed in (tests, a pipe the caller owns); a bare uninjected pipe is never waited on
  const canAsk = deps.stdin !== undefined || Boolean(process.stdin.isTTY);
  const ctx = { out, err, cwd, env, now, deps, ask, canAsk, keysHome: keys.home };

  const [cmd, ...rest] = argv;
  if (keys.warning && cmd && ['run', 'run-u', 'panel'].includes(cmd)) err(`WARNING: ${keys.warning}`);
  const launcherHome = keys.home ?? deps.runlistHome;
  if (!cmd) return runLauncher('menu', [], { ...deps, stdout }, ctx, launcherHome);
  if (cmd === 'start' || cmd === 'stop' || cmd === 'restart' || cmd === 'status' || cmd === 'install') return runLauncher(cmd, rest, { ...deps, stdout }, ctx, launcherHome);
  // the old form (`export <jobs/x.json> --registry <dir> --out <dir>`) is the bench's; the new one is by run name
  if (cmd === 'export') return rest.includes('--registry') ? doExport(rest, ctx) : doExportRun(rest, ctx);
  if (cmd === 'run') return bundleMain(rest, { ...ctx, keysHome: keys.home, parseFlags, printReds });

  if (cmd === 'history') return doHistory(rest, ctx);
  // `bareloop run-u` — the person-path run flow (PANEL-BUILD.md P0 task
  // 2/4). `rest` is handed straight to `src/userrun.js`'s own `main(argv,
  // deps)`, unparsed: that function is this flag grammar's one owner
  // (`--job`/`--spec`/`--resume`/`--door`/`--decide`/`--text`/
  // `--review-door`/`--approve`/`--registry`/`--workflow`/`--model`/
  // `--read-shim`/`--scout`). `deps` is spread first so an injected test
  // seam (`deps.provider`/`providerFor`/`judgeProvider`) still reaches it,
  // then `env`/`out`/`err` are overridden to the SAME resolved values every
  // other command here prints through, so `run-u`'s output lands on the
  // `stdout`/`stderr` a caller of `main` actually passed.
  // (dispatchable, not listed in the menu or the help: the panel spawns it, PRD v1.114)
  if (cmd === 'run-u') return runUMain(rest, { ...deps, env, out, err, keysHome: keys.home, invokedAs: 'bareloop run-u' });
  // `bareloop runs` — PANEL-BUILD.md P1's one run list. Read-only ($0): no run trigger, no key ever read.
  if (cmd === 'runs') return doRuns(rest, ctx);
  // `bareloop panel [--port N]` — PANEL-BUILD.md P1's read-only HTTP panel.
  // Never runs a job, spends money, or reads a key: it serves the run list
  // and spine/gate-audit reads over `127.0.0.1` only. `deps.runlistHome`
  // rides through the same injectable seam `run`/`run-u` already use.
  if (cmd === 'panel') return panelMain(rest, { out, err, runlistHome: deps.runlistHome, env: deps.env });
  err(`unknown command ${JSON.stringify(cmd)} — one of: export, run, history, runs, panel, start, stop, restart, status, install`);
  return 1;
}
