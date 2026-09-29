// Export M2 (`docs/product/EXPORT-BUILD.md`) — the `bareloop` CLI. All logic
// lives HERE, testable at $0 with an in-process `main(argv, deps)`; `bin/
// bareloop.mjs` is a ~10-line adapter that supplies the real `deps` and turns
// the returned exit code into `process.exitCode`.
//
// `bareloop run <bundle>` is a thin door (`src/bundlerun.js`) to the same engine `bareloop
// run-u` drives (`src/userrun.js`): providers, keys (the keys file / env, any provider the
// bundle's spec names), judge, monthly limit and readout are that engine's. The test seam is
// the engine's too: `deps.provider` (and `providerFor`/`judgeProvider`) supplies a scripted
// provider and skips the real-key check (same as `tests/planrun.test.js`'s pattern).
//
// Money/arbiter rules the bundle door keeps: `--budget`/`--wall` only TIGHTEN a bundle's
// signed ceilings (`checkEnvelope`, M1); a bundle's `bundleHash` (the human-facing
// signature) never changes when the runner tightens — the SPEC that actually executes does,
// and the door hands the engine the hash of that tightened, `$BARELOOP_BUNDLE`-resolved
// spec. `history.jsonl` records both hashes side by side (POC fact 2) so the pairing can
// never drift silently.

import { createInterface } from 'node:readline/promises';
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
import { main as runUMain } from './userrun.js';
// PANEL-BUILD.md P0 task 3/4 — `bareloop interview` and `bareloop author`
// wrap the close-authoring interview and authoring-pipeline flows' own
// argv-parsing entries (`src/interviewrun.js`/`src/authorrun.js`, lifted out
// of `scripts/run-interview.mjs`/`scripts/run-author.mjs` the same way task
// 1/2 lifted `scripts/run-u.mjs`). `scripts/run-interview.mjs`/`scripts/
// run-author.mjs` call these SAME functions directly, so there is exactly
// one place each flag grammar is parsed.
import { main as interviewMain } from './interviewrun.js';
import { main as authorMain } from './authorrun.js';
// PANEL-BUILD.md P0 — the spine/gate-audit read side (`bareloop replay`,
// and `doHistory`'s reader below), lifted out of `scripts/run-replay.mjs`
// into `src/replayio.js` the same way tasks 1-3 lifted their own scripts.
import {
  parseJsonl, looksLikeSpine, replayOne, listSpines, readHistoryLog,
} from './replayio.js';
import { formatReplay, formatAllLines } from './replay.js';
// PANEL-BUILD.md P1 — the read-only panel HTTP server (`bareloop panel`).
// One more caller of the same `src/` library functions this file already
// calls (the layering law, PANEL-BUILD.md §2) — `src/panel/server.js` never
// re-implements the spine/run-list read side, it calls `src/replayio.js`/
// `src/runlist.js` directly, in-process.
import { panelMain } from './panel/server.js';
// PANEL-BUILD.md P1 (2026-09-24 rulings) — the one run list
// (`~/.config/bareloop/runs.jsonl`) and its backfill scan. `bareloop runs`
// (list) and `bareloop runs backfill <dir>` (reconstruct rows from archived
// spines already on disk) are this rung's only new commands.
import { keysForDoor } from './keysfile.js';
import { readRunList, backfillRuns, formatRunRow } from './runlist.js';

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
 * `bareloop history <bundleDir>`
 * @param {string[]} args @param {{ out: (s: string) => void, err: (s: string) => void, cwd: string }} ctx
 */
function doHistory(args, { out, err, cwd }) {
  const bundleDirArg = args[0];
  if (!bundleDirArg) { err('usage: bareloop history <bundleDir>'); return 1; }
  const dir = resolve(cwd, bundleDirArg);
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
 * `bareloop replay <spine.jsonl>` — one run's whole story, reconstructed
 * from its spine + gate-audit sidecar, printed as one page
 * ({@link formatReplay}). `bareloop replay --all <dir>` — every spine found
 * directly in `dir`, one aligned table row each ({@link formatAllLines}).
 * Read-only, $0, mints no verdict, writes nothing (PANEL-BUILD.md P0: this
 * is the CLI the gap table marked "No" for "Replay an archived run at $0").
 * Logic lifted verbatim from `scripts/run-replay.mjs` into
 * `src/replayio.js`; this command is that script's one caller now, the same
 * shape `bareloop history`/`bareloop run` already are over their own
 * library functions.
 * @param {string[]} args @param {{ out: (s: string) => void, err: (s: string) => void, cwd: string }} ctx
 */
function doReplay(args, { out, err, cwd }) {
  if (args[0] === '--all') {
    const dirArg = args[1];
    if (!dirArg) { err('usage: bareloop replay --all <dir>'); return 1; }
    const dir = resolve(cwd, dirArg);
    if (!existsSync(dir)) { err(`no such directory: ${dir}`); return 1; }
    const entries = listSpines(dir);
    if (entries.length === 0) { out(`no .jsonl files found in ${dir}`); return 0; }
    out(formatAllLines(entries));
    return 0;
  }
  const spinePathArg = args[0];
  if (!spinePathArg) {
    err('usage: bareloop replay <spine.jsonl>');
    err('       bareloop replay --all <dir>');
    return 1;
  }
  const spinePath = resolve(cwd, spinePathArg);
  if (!existsSync(spinePath)) { err(`no such file: ${spinePath}`); return 1; }
  const spine = parseJsonl(spinePath);
  if (!looksLikeSpine(spine.records)) {
    err(`${spinePath} does not look like a spine (no job-start or run-start record found)`);
    return 1;
  }
  const summary = replayOne(spinePath, { preParsedSpine: spine });
  out(formatReplay(summary));
  return 0;
}

/**
 * `bareloop runs` — print the one run list, one line per row
 * ({@link formatRunRow}). `bareloop runs backfill <dir>` — scan `dir` for
 * archived spines and add a row per one not already listed
 * ({@link backfillRuns}), printing the count added/already-listed/skipped
 * (never silent). Read-only, $0: no interview, no author, no run trigger, no
 * key ever read.
 * @param {string[]} args @param {{ out: (s: string) => void, err: (s: string) => void, cwd: string }} ctx
 */
function doRuns(args, { out, err, cwd }) {
  if (args[0] === 'backfill') {
    const dirArg = args[1];
    if (!dirArg) { err('usage: bareloop runs backfill <dir>'); return 1; }
    const dir = resolve(cwd, dirArg);
    if (!existsSync(dir)) { err(`no such directory: ${dir}`); return 1; }
    let result;
    try {
      result = backfillRuns(dir);
    } catch (e) {
      err(`backfill failed: ${/** @type {Error} */ (e).message}`);
      return 1;
    }
    out(`backfill ${dir}: added ${result.added}, already listed ${result.alreadyListed}, skipped ${result.skipped} (not a spine or unreadable)`);
    return 0;
  }
  const { rows, skipped } = readRunList();
  if (rows.length === 0) { out('runs: (none listed yet — see `bareloop runs backfill <dir>`)'); }
  else for (const row of rows) out(formatRunRow(row));
  if (skipped > 0) out(`(${skipped} malformed line${skipped === 1 ? '' : 's'} skipped)`);
  return 0;
}

/**
 * The bare `bareloop` menu: `1 export  2 run  3 history  q quit`, then the
 * SAME code path as the sub-command, asking its args line by line. `run-u`,
 * `interview`, `author` and `replay` are NOT wizarded here — a line-at-a-time
 * prompt for `run-u`'s 13 flags (or the others' own argv shapes) would be
 * inventing new interactive UX, not wiring, and that judgement stands. This
 * menu is fixed instead: it now says those four commands exist and how to
 * reach them, rather than implying only three commands do at all.
 * @param {any} deps @param {{ out: (s: string) => void, err: (s: string) => void, cwd: string, env: any, now: () => number }} ctx
 */
async function runMenu(deps, ctx) {
  const stdin = deps.stdin;
  const stdout = deps.stdout;
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    ctx.out('1 export  2 run  3 history  q quit');
    ctx.out('(also on the command line, not wizarded here: run-u, interview, author, replay, runs, panel — run `bareloop <name>` with its own flags)');
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
      return await bundleMain(args, { ...ctx, deps, keysHome: undefined, parseFlags, printReds });
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
 * @param {{ env?: Record<string,string|undefined>, stdout?: any, stderr?: any, cwd?: string, provider?: any, providerFor?: any, judgeProvider?: any, judgeModel?: string|null, now?: () => number, stdin?: any, runlistHome?: string, keysHome?: string }} deps
 * @returns {Promise<number>}
 */
export async function main(argv, deps = {}) {
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
  const ctx = { out, err, cwd, env, now, deps };

  const [cmd, ...rest] = argv;
  if (keys.warning && cmd && ['run', 'run-u', 'interview', 'author', 'panel'].includes(cmd)) err(`WARNING: ${keys.warning}`);
  if (!cmd) return runMenu({ ...deps, stdin: deps.stdin ?? process.stdin, stdout }, ctx);
  if (cmd === 'export') return doExport(rest, ctx);
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
  if (cmd === 'run-u') return runUMain(rest, { ...deps, env, out, err, keysHome: keys.home });
  // `bareloop interview` — the close-authoring interview (PANEL-BUILD.md P0
  // task 3/4). This flow reads a TTY (or a piped stdin) directly rather than
  // through the `out`/`err` line-functions every other command here uses, so
  // it needs the raw streams, not the wrapped ones — `stdout`/`stderr` (both
  // already resolved above) are handed through instead.
  // `invokedAs: 'bareloop interview'` — the usage message names the command a
  // person actually typed, never a script path they never invoked and may
  // not have on disk (a branch-review nit; `scripts/run-interview.mjs` still
  // supplies none, so it keeps naming itself when run directly).
  if (cmd === 'interview') return interviewMain(rest, { ...deps, env, keysHome: keys.home, stdin: deps.stdin ?? process.stdin, stdout, stderr, invokedAs: 'bareloop interview' });
  // `bareloop author` — the authoring pipeline (scout, declaration, D9's
  // gates), same task. Same raw-stream reasoning: its one interactive seam
  // (the confirm turn) reads stdin directly. Same `invokedAs` reasoning too.
  if (cmd === 'author') return authorMain(rest, { ...deps, env, keysHome: keys.home, stdin: deps.stdin ?? process.stdin, stdout, stderr, invokedAs: 'bareloop author' });
  // `bareloop replay` — the spine/gate-audit read side (PANEL-BUILD.md P0,
  // last of the rung's four tasks). Synchronous, file-based, no interactive
  // seam — same shape as `doHistory`/`doExport`, not the argv-owning
  // `main(argv, deps)` modules the flows above delegate to.
  if (cmd === 'replay') return doReplay(rest, ctx);
  // `bareloop runs` / `bareloop runs backfill <dir>` — PANEL-BUILD.md P1's
  // one run list. Read-only ($0): no interview, no author, no run trigger,
  // no key ever read.
  if (cmd === 'runs') return doRuns(rest, ctx);
  // `bareloop panel [--port N]` — PANEL-BUILD.md P1's read-only HTTP panel.
  // Never runs a job, spends money, or reads a key: it serves the run list
  // and spine/gate-audit reads over `127.0.0.1` only. `deps.runlistHome`
  // rides through the same injectable seam `run`/`run-u` already use.
  if (cmd === 'panel') return panelMain(rest, { out, err, runlistHome: deps.runlistHome, env: deps.env });
  err(`unknown command ${JSON.stringify(cmd)} — one of: export, run, history, run-u, interview, author, replay, runs, panel`);
  return 1;
}
