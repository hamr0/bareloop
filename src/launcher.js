// L (PANEL-BUILD.md addendum 2026-10-24) — the `bareloop` launcher: the bare-`bareloop` menu and `bareloop start | stop | status | install`.
//
// No pid file: the panel is FOUND by asking 127.0.0.1:4700..4709 for `GET /api/whoami` (src/panel/server.js), several at once, 300 ms
// each; a reply with `app === "bareloop"` is a panel. Every call prints the same two header lines first, from {@link buildHeader}.
// The run counts are the panel's own (`runsListForCount`: the `listRuns` rows' `status.key` and `needs`, plus the schedules that gave up) — never a second spelling of "running" or "needs you".
// This file owns no arbiter state: it starts/stops the panel process and reads the run list at $0. Every OS touch (spawn, kill, open,
// port bind, clock, stdin) comes through `deps` so tests inject all of them and never see a real panel.

import {
  existsSync, statSync, mkdirSync, chmodSync, openSync, closeSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { spawn as realSpawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig, updateConfig, ConfigError } from './config.js';
import { keysHome, keysFilePath, ensureKeysFile } from './keysfile.js';
import { openInOs } from './opener.js';
import { PLAIN } from './tty-colour.js';
import { runsListForCount, packageVersion, panelUrl } from './panel/server.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** the first port tried, and how many in a row (4700..4709) */
export const PORT_START = 4700;
export const PORT_COUNT = 10;
const PROBE_TIMEOUT_MS = 300;
const WAIT_DEADLINE_MS = 10_000;
const POLL_MS = 100;
const MIN_NODE_MAJOR = 22;
const RULE_WIDTH = 56;

/**
 * @typedef {object} Panel one answered probe
 * @property {number} port @property {number} pid @property {string} version @property {number} drafts @property {number} schedules
 * @property {string} url
 */

/**
 * @typedef {object} LauncherDeps every OS touch, injectable (a test passes all of them)
 * @property {string} [home] the bareloop home (`~/.config/bareloop`); undefined = the real one
 * @property {number} [portStart] @property {number} [portCount]
 * @property {number[]} [ports] an explicit port list (tests); wins over portStart/portCount
 * @property {number} [timeoutMs] probe timeout per port
 * @property {number} [deadlineMs] start/stop wait deadline
 * @property {string} [nodeVersion] default process.versions.node
 * @property {typeof fetch} [fetchImpl]
 * @property {(cmd: string, args: string[], o: object) => any} [spawnFn] default node:child_process spawn
 * @property {(pid: number, sig: string) => void} [kill] default process.kill
 * @property {((target: string) => Promise<boolean>)} [open] default the shared OS opener
 * @property {(port: number) => Promise<boolean>} [portFree] default: try to bind 127.0.0.1:port
 * @property {(ms: number) => Promise<void>} [sleep]
 * @property {(question: string) => Promise<string>} [ask] the y/N and menu reader
 * @property {string} [bareloopBin] default bin/bareloop.mjs of this package
 * @property {import('./tty-colour.js').Paint} [paint] colour for stdout lines (default none); {@link makePaint} decides TTY / NO_COLOR / TERM
 * @property {import('./tty-colour.js').Paint} [paintErr] colour for stderr lines (default: `paint`)
 * @property {number} [now] ms clock for the run list's age rules (default: real time); tests pass their own
 * @property {string} [platform]
 * @property {Record<string, string|undefined>} [env] raw env handed to the panel child (default process.env)
 */

/**
 * The run counts, from the panel's own `listRuns` rows. `status.key === 'running'` is the panel's word; `needs` is the one tag
 * {@link import('./panel/server.js').needsStateFor} decides. A part that is 0 still shows.
 * @param {any[]} rows
 * @param {number} [gaveUp] schedules that gave up: the panel's Needs-you holds them too
 * @returns {{running: number, needYou: number, total: number}}
 */
export function countRuns(rows, gaveUp = 0) {
  let running = 0;
  let needYou = gaveUp;
  for (const r of rows) {
    if (r && r.status && r.status.key === 'running') running += 1;
    if (r && typeof r.needs === 'string' && r.needs !== '') needYou += 1;
  }
  return { running, needYou, total: rows.length };
}

/**
 * "installed ✓" = the folder exists, config.json is there and reads with no problem, `.env` exists with mode 600, node >= 22.
 * Otherwise the FIRST missing thing in plain words.
 * @param {{home?: string, nodeVersion?: string}} o
 * @returns {{ok: boolean, problem: string|null}}
 */
export function installState(o) {
  const dir = keysHome(o.home);
  if (!existsSync(dir)) return { ok: false, problem: 'no bareloop folder yet' };
  const cfg = readConfig({ home: o.home });
  if (cfg.problem) return { ok: false, problem: 'config.json cannot be read' };
  if (!cfg.exists) return { ok: false, problem: 'no settings file yet' };
  const env = keysFilePath(o.home);
  if (!existsSync(env)) return { ok: false, problem: 'no keys file yet' };
  try {
    if ((statSync(env).mode & 0o077) !== 0) return { ok: false, problem: 'the keys file is readable by other users' };
  } catch { return { ok: false, problem: 'the keys file cannot be read' }; }
  const major = Number((o.nodeVersion ?? process.versions.node).split('.')[0]);
  if (!(major >= MIN_NODE_MAJOR)) return { ok: false, problem: `node ${MIN_NODE_MAJOR} or newer is needed` };
  return { ok: true, problem: null };
}

/**
 * Ask 127.0.0.1 across the ports in parallel; a reply with `app === "bareloop"` is a panel. Never throws.
 * @param {{ports: number[], timeoutMs?: number, fetchImpl?: typeof fetch}} o
 * @returns {Promise<Panel[]>} in port order
 */
export async function probePanels(o) {
  const f = o.fetchImpl ?? fetch;
  const ms = o.timeoutMs ?? PROBE_TIMEOUT_MS;
  const answers = await Promise.all(o.ports.map(async (port) => {
    try {
      const res = await f(`${panelUrl(port)}/api/whoami`, { signal: AbortSignal.timeout(ms) });
      if (!res.ok) return null;
      const j = /** @type {any} */ (await res.json());
      if (!j || j.app !== 'bareloop') return null;
      return /** @type {Panel} */ ({
        port,
        pid: Number(j.pid),
        version: String(j.version ?? ''),
        drafts: Number(j.drafts) || 0,
        schedules: Number(j.schedules) || 0,
        url: panelUrl(port),
      });
    } catch { return null; }
  }));
  return /** @type {Panel[]} */ (answers.filter((a) => a !== null));
}

/** @param {LauncherDeps} d @returns {number[]} */
function portsOf(d) {
  if (d.ports) return d.ports;
  const start = d.portStart ?? PORT_START;
  return Array.from({ length: d.portCount ?? PORT_COUNT }, (_, i) => start + i);
}

/** @param {LauncherDeps} d @returns {Promise<Panel[]>} */
function probeAll(d) {
  return probePanels({ ports: portsOf(d), timeoutMs: d.timeoutMs, fetchImpl: d.fetchImpl });
}

/**
 * The header, ONCE per call: the two lines every `bareloop` command prints first, plus the panels the probe found (the commands
 * reuse them, so nothing is probed twice).
 * @param {LauncherDeps & {version?: string}} d
 * @returns {Promise<{lines: string[], panels: Panel[]}>}
 */
export async function buildHeader(d) {
  const version = d.version ?? packageVersion();
  const panels = await probeAll(d);
  const inst = installState({ home: d.home, nodeVersion: d.nodeVersion });
  const P = d.paint ?? PLAIN;
  const sep = P.grey(' · ');
  const where = panels.length === 0
    ? `panel ${P.grey('not running')}`
    : `panel${panels.length > 1 ? 's' : ''} ${P.green('running')} at ${panels.map((p) => P.cyan(p.url) + (p.version !== version ? P.yellow(` (version ${p.version} — stop and start to use ${version})`) : '')).join(', ')}`;
  const state = inst.ok ? P.green('installed ✓') : `${P.red('not installed')} — ${inst.problem}, pick ${P.boldCyan('4')} install`;
  const first = `${P.boldCyan('bareloop')} ${P.grey(version)}${sep}${state}${sep}${where}`;
  let second;
  try {
    const l = runsListForCount({ home: d.home, ...(typeof d.now === 'number' ? { now: d.now } : {}) });
    const c = countRuns(l.runs, l.gaveUp.length);
    second = `${P.grey('runs:')} ${c.running > 0 ? P.green(`${c.running} running`) : P.grey(`${c.running} running`)}${sep}`
      + `${c.needYou > 0 ? P.yellow(`${c.needYou} need you`) : P.grey(`${c.needYou} need you`)}${sep}${c.total} in all`;
  } catch {
    second = `${P.grey('runs:')} the run list could not be read`;
  }
  // the thin rule frames the header only on a colour terminal (plain output keeps exactly the two lines)
  const rule = P.on ? [P.grey('─'.repeat(RULE_WIDTH))] : [];
  return { lines: [...rule, first, second, ...rule], panels };
}

/**
 * @param {LauncherDeps & {version?: string}} d
 * @returns {Promise<string[]>} the two header lines
 */
export async function headerLines(d) {
  return (await buildHeader(d)).lines;
}

/**
 * Print the header unless the caller (the menu) already did; hand back the panels either way.
 * @param {{out: (s: string) => void}} io @param {LauncherDeps & {version?: string}} d @param {{lines: string[], panels: Panel[]}} [shown]
 */
async function headerOnce(io, d, shown) {
  if (shown) return shown;
  const h = await buildHeader(d);
  for (const l of h.lines) io.out(l);
  return h;
}

/** stderr line, red on a colour terminal @param {{err: (s: string) => void}} io @param {LauncherDeps} d @param {string} text */
const fail = (io, d, text) => io.err((d.paintErr ?? d.paint ?? PLAIN).red(text));

/** @param {number} n @param {string} one @param {string} many */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** @param {LauncherDeps} d */
const sleepOf = (d) => d.sleep ?? ((/** @type {number} */ ms) => new Promise((r) => { setTimeout(r, ms); }));

/** @param {number} port @returns {Promise<boolean>} true when nothing holds 127.0.0.1:port */
function bindFree(port) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => { s.close(() => resolve(true)); });
  });
}

/**
 * `bareloop install` — creates only what is missing, never reads a key value.
 * @param {{out: (s: string) => void, err: (s: string) => void}} io @param {LauncherDeps & {version?: string}} d @param {{lines: string[], panels: Panel[]}} [shown]
 * @returns {Promise<number>}
 */
export async function installCmd(io, d, shown) {
  await headerOnce(io, d, shown);
  const major = Number((d.nodeVersion ?? process.versions.node).split('.')[0]);
  if (!(major >= MIN_NODE_MAJOR)) {
    fail(io, d, `bareloop needs node ${MIN_NODE_MAJOR} or newer; this is node ${d.nodeVersion ?? process.versions.node}. Nothing was changed.`);
    return 1;
  }
  const dir = keysHome(d.home);
  /** @type {string[]} */
  const made = [];
  if (!existsSync(dir)) { mkdirSync(dir, { recursive: true, mode: 0o700 }); made.push(`${dir} (only you can open it)`); }
  const envFile = keysFilePath(d.home);
  if (ensureKeysFile(d.home)) made.push(`${envFile} (the keys file, only you can read it)`);
  else {
    try {
      if ((statSync(envFile).mode & 0o077) !== 0) { chmodSync(envFile, 0o600); made.push(`${envFile} set so only you can read it`); }
    } catch { /* unreadable: the header says so */ }
  }
  const cfg = readConfig({ home: d.home });
  if (cfg.problem) {
    fail(io, d, `${cfg.problem}. Install did not touch it.`);
    return 1;
  }
  if (!cfg.exists) {
    try { updateConfig({}, { home: d.home }); made.push(`${join(dir, 'config.json')} (your settings)`); } catch (e) {
      if (!(e instanceof ConfigError)) throw e;
      fail(io, d, `${e.message}. Install did not touch it.`);
      return 1;
    }
  }
  if (made.length === 0) { io.out('Already installed, nothing to do.'); return 0; }
  io.out('Installed. Created:');
  for (const m of made) io.out(`  ${m}`);
  return 0;
}

/**
 * `bareloop status` — the header, then one line per panel (or `Panel not running.`). Exit 0 running, 3 not running; 0 when the menu ran it.
 * @param {{out: (s: string) => void}} io @param {LauncherDeps & {version?: string}} d @param {{lines: string[], panels: Panel[]}} [shown] header the menu already printed
 * @returns {Promise<number>}
 */
export async function statusCmd(io, d, shown) {
  const h = await headerOnce(io, d, shown);
  if (h.panels.length === 0) {
    io.out('Panel not running.');
    // the sub-command's exit says "not running" (3); from the menu the menu itself worked (0)
    return shown ? 0 : 3;
  }
  for (const p of h.panels) {
    const body = `pid ${p.pid} · version ${p.version} · ${plural(p.drafts, 'draft', 'drafts')} open · ${plural(p.schedules, 'schedule', 'schedules')} on`;
    io.out(h.panels.length > 1 ? `${p.url} · ${body}` : body);
  }
  return 0;
}

/**
 * Wait until `port` stops (gone=true) or starts (gone=false) answering whoami as bareloop.
 * @param {LauncherDeps} d @param {number} port @param {boolean} gone
 * @returns {Promise<boolean>} false when the deadline passed first
 */
async function waitFor(d, port, gone) {
  const sleep = sleepOf(d);
  const deadline = d.deadlineMs ?? WAIT_DEADLINE_MS;
  for (let waited = 0; waited <= deadline; waited += POLL_MS) {
    const found = await probePanels({ ports: [port], timeoutMs: d.timeoutMs, fetchImpl: d.fetchImpl });
    if (gone ? found.length === 0 : found.length > 0) return true;
    await sleep(POLL_MS);
  }
  return false;
}

/**
 * `bareloop start` — find a running panel first; else start one detached on the first free port 4700..4709, wait until it answers,
 * open the page.
 * @param {{out: (s: string) => void, err: (s: string) => void}} io @param {LauncherDeps & {version?: string}} d @param {{lines: string[], panels: Panel[]}} [shown]
 * @returns {Promise<number>}
 */
export async function startCmd(io, d, shown) {
  const h = await headerOnce(io, d, shown);
  const P = d.paint ?? PLAIN;
  const open = d.open ?? ((/** @type {string} */ t) => openInOs(t, { platform: d.platform, underTest: false }));
  /** @param {string} url @param {string} said */
  const finish = async (url, said) => {
    const opened = await open(url);
    io.out(opened ? `${said} — opening the page.` : `${said} — open it in your browser.`);
    return 0;
  };
  if (h.panels.length > 0) {
    const rc = await finish(h.panels[0].url, `Panel already running at ${P.cyan(h.panels[0].url)}`);
    const mine = d.version ?? packageVersion();
    if (h.panels[0].version !== mine) io.out(P.yellow(`It is version ${h.panels[0].version}; this bareloop is ${mine}. Run bareloop stop, then bareloop start, to use ${mine}.`));
    return rc;
  }
  const free = d.portFree ?? bindFree;
  const ports = portsOf(d);
  /** @type {number|null} */
  let chosen = null;
  for (const p of ports) { if (await free(p)) { chosen = p; break; } }
  if (chosen === null) {
    fail(io, d, `Every port from ${ports[0]} to ${ports[ports.length - 1]} is taken by something else, so the panel was not started.`);
    return 1;
  }
  if (chosen !== ports[0]) io.out(`${ports[0]} is taken, using ${chosen}.`);
  const dir = keysHome(d.home);
  try { mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch { /* the log open below reports it */ }
  const logFile = join(dir, 'panel.log');
  /** @type {number|null} */
  let logFd = null;
  try { logFd = openSync(logFile, 'a'); } catch { logFd = null; }
  const bin = d.bareloopBin ?? join(HERE, '..', 'bin', 'bareloop.mjs');
  const platform = d.platform ?? process.platform;
  const argv = [process.execPath, bin, 'panel', '--port', String(chosen)];
  const spawnFn = d.spawnFn ?? realSpawn;
  const [cmd, args] = platform === 'linux' ? ['setsid', argv] : [argv[0], argv.slice(1)];
  try {
    const child = spawnFn(cmd, args, { detached: true, stdio: ['ignore', logFd ?? 'ignore', logFd ?? 'ignore'], env: d.env ?? process.env });
    if (child && typeof child.once === 'function') child.once('error', () => { /* seen as "never answered" below */ });
    if (child && typeof child.unref === 'function') child.unref();
  } catch (e) {
    fail(io, d, `Could not start the panel: ${/** @type {Error} */ (e).message}`);
    return 1;
  } finally {
    if (logFd !== null) { try { closeSync(logFd); } catch { /* the child holds its own copy */ } }
  }
  if (!(await waitFor(d, chosen, false))) {
    fail(io, d, `The panel did not answer within ${(d.deadlineMs ?? WAIT_DEADLINE_MS) / 1000} seconds. See ${logFile}.`);
    return 1;
  }
  return finish(panelUrl(chosen), `${P.green('Panel started')} at ${P.cyan(panelUrl(chosen))}`);
}

/**
 * `bareloop stop [--yes] [--port N]` — SIGTERM the pid the probe reported, wait until the port stops answering.
 * Drafts are in memory: warn and ask y/N unless `--yes`.
 * @param {string[]} args
 * @param {{out: (s: string) => void, err: (s: string) => void}} io @param {LauncherDeps & {version?: string}} d @param {{lines: string[], panels: Panel[]}} [shown]
 * @returns {Promise<number>}
 */
export async function stopCmd(args, io, d, shown) {
  const h = await headerOnce(io, d, shown);
  const yes = args.includes('--yes');
  const pi = args.indexOf('--port');
  const wantPort = pi >= 0 ? Number(args[pi + 1]) : null;
  let panels = h.panels;
  if (wantPort !== null) panels = panels.filter((p) => p.port === wantPort);
  if (panels.length === 0) { io.out('Panel not running.'); return 0; }
  const ask = d.ask;
  if (panels.length > 1) {
    if (!ask || yes) {
      fail(io, d, 'Several panels are running. Pick one with --port N:');
      for (const p of panels) fail(io, d, `  ${p.url} (pid ${p.pid})`);
      return 1;
    }
    panels.forEach((p, i) => io.out(`${i + 1} ${p.url} (pid ${p.pid})`));
    const a = (await ask('Stop which one? number, a for all, anything else to leave them > ')).trim().toLowerCase();
    if (a !== 'a') {
      const n = Number(a);
      if (!Number.isInteger(n) || n < 1 || n > panels.length) { io.out('Not stopped.'); return 0; }
      panels = [panels[n - 1]];
    }
  }
  const drafts = panels.reduce((n, p) => n + p.drafts, 0);
  if (drafts > 0 && !yes) {
    io.out(`${drafts === 1 ? '1 draft is' : `${drafts} drafts are`} open in the panel and will be lost.`);
    io.out('Runs keep going. Scheduled runs wait until the panel is started again.');
    const a = ask ? (await ask('Stop the panel? [y/N] ')).trim().toLowerCase() : '';
    if (a !== 'y' && a !== 'yes') { io.out('Not stopped.'); return 0; }
  }
  const kill = d.kill ?? ((/** @type {number} */ pid, /** @type {string} */ sig) => process.kill(pid, /** @type {NodeJS.Signals} */ (sig)));
  for (const p of panels) {
    if (!Number.isInteger(p.pid) || p.pid <= 1) { fail(io, d, `The panel at ${p.url} reported no usable pid, so it was not stopped.`); return 1; }
    try { kill(p.pid, 'SIGTERM'); } catch (e) {
      fail(io, d, `Could not stop the panel at ${p.url} (pid ${p.pid}): ${/** @type {Error} */ (e).message}`);
      return 1;
    }
  }
  for (const p of panels) {
    if (!(await waitFor(d, p.port, true))) {
      fail(io, d, `The panel at ${p.url} still answers after ${(d.deadlineMs ?? WAIT_DEADLINE_MS) / 1000} seconds (pid ${p.pid}).`);
      return 1;
    }
  }
  io.out((d.paint ?? PLAIN).green(panels.length > 1 ? 'Panels stopped.' : 'Panel stopped.'));
  return 0;
}

/**
 * The bare `bareloop` menu: header, the four choices, one question. Runs the chosen command and returns its exit code.
 * @param {{out: (s: string) => void, err: (s: string) => void}} io @param {LauncherDeps & {version?: string}} d
 * @returns {Promise<number>}
 */
export async function menuCmd(io, d) {
  const ask = d.ask;
  const h = await buildHeader(d);
  for (const l of h.lines) io.out(l);
  const P = d.paint ?? PLAIN;
  if (!P.on) io.out('');
  const n = (/** @type {string} */ k) => P.boldCyan(k);
  const items = `${n('1')} start   ${n('2')} stop   ${n('3')} status   ${n('4')} install   ${n('q')} quit`;
  io.out(P.on ? `  ${items}` : items);
  const choice = ask ? (await ask(`${P.cyan('>')} `)).trim().toLowerCase() : 'q';
  // the header is already on screen: the chosen command reuses it instead of printing it a second time
  if (choice === '1' || choice === 'start') return startCmd(io, d, h);
  if (choice === '2' || choice === 'stop') return stopCmd([], io, d, h);
  if (choice === '3' || choice === 'status') return statusCmd(io, d, h);
  if (choice === '4' || choice === 'install') return installCmd(io, d, h);
  if (choice === '' || choice === 'q' || choice === 'quit') return 0;
  fail(io, d, `unknown choice ${JSON.stringify(choice)} — one of: 1, 2, 3, 4, q`);
  return 1;
}
