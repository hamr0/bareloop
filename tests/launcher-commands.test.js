// L (PANEL-BUILD.md addendum 2026-10-24) — start / stop / status / install / the menu. Scratch home, a free HIGH port range (never 4700-4709),
// injected spawn / kill / opener / stdin: no real signal is ever sent and no real panel is launched. The "started" panel is a REAL
// createPanelServer run in-process by the injected spawn, so the probe talks to the real /api/whoami.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  mkdtempSync, rmSync, existsSync, statSync, mkdirSync, writeFileSync, readFileSync, chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as netServer } from 'node:net';
import { createServer as httpServer } from 'node:http';
import { PassThrough } from 'node:stream';
import {
  startCmd, stopCmd, restartCmd, statusCmd, installCmd, menuCmd,
} from '../src/launcher.js';
import { createPanelServer } from '../src/panel/server.js';
import { main } from '../src/cli.js';
import { makePaint } from '../src/tty-colour.js';
import { packageVersion } from '../src/panel/server.js';
const V = packageVersion();
const VRE = V.replace(/\./g, '\\.');

/** @type {string[]} */
const dirs = [];
/** @type {(() => Promise<void>)[]} */
const closers = [];
after(async () => {
  for (const c of closers) { try { await c(); } catch { /* already closed */ } }
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'launcher-cmd-')); dirs.push(d); return d; };

/** @param {number} port @returns {Promise<boolean>} */
const bindable = (port) => new Promise((res) => { const s = netServer(); s.once('error', () => res(false)); s.listen(port, '127.0.0.1', () => s.close(() => res(true))); });
/** a base such that base..base+3 are free, in a high range */
async function freeBase() {
  for (let i = 0; i < 200; i += 1) {
    const base = 41000 + Math.floor(Math.random() * 20000);
    const all = await Promise.all([0, 1, 2, 3].map((k) => bindable(base + k)));
    if (all.every(Boolean)) return base;
  }
  throw new Error('no free port range');
}
/** hold a port with something that is NOT bareloop */
function squat(port) {
  return new Promise((resolve) => {
    const s = httpServer((_q, r) => { r.writeHead(200); r.end('hello'); });
    s.listen(port, '127.0.0.1', () => { const close = () => new Promise((r) => { s.close(() => r(undefined)); }); closers.push(close); resolve(close); });
  });
}
/** a fake bareloop panel (just /api/whoami) with settable pid/drafts/schedules; returns {port, close} */
function fakePanel(port, body = {}) {
  return new Promise((resolve) => {
    const s = httpServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ app: 'bareloop', version: V, pid: 4242, port, drafts: 0, schedules: 0, ...body }));
    });
    s.listen(port, '127.0.0.1', () => { const close = () => new Promise((r) => { s.close(() => r(undefined)); }); closers.push(close); resolve({ port, close }); });
  });
}
/** an injected kill that behaves like a process table: a real signal runs `onSignal` and the pid is then gone (signal 0 throws ESRCH) */
const mortal = (onSignal) => {
  const dead = new Set();
  return (pid, sig) => {
    if (sig === 0) { if (dead.has(pid)) { const e = new Error('no such process'); e.code = 'ESRCH'; throw e; } return; }
    onSignal(pid, sig); dead.add(pid);
  };
};
const sink = () => { const lines = []; return { out: (s) => lines.push(s), err: (s) => lines.push(`ERR ${s}`), lines, text: () => lines.join('\n') }; };

/** deps for a scratch run; spawn starts a REAL panel server in-process on the --port it is given */
function deps(home, base, extra = {}) {
  const spawned = [];
  return {
    home, ports: [base, base + 1, base + 2, base + 3], timeoutMs: 2000, deadlineMs: 3000, nodeVersion: '22.1.0', version: V,
    platform: 'linux', bareloopBin: '/x/bin/bareloop.mjs', spawned,
    spawnFn: (cmd, args) => {
      spawned.push({ cmd, args });
      const port = Number(args[args.indexOf('--port') + 1]);
      createPanelServer({ port, home, sessionsRoot: join(home, 'sessions'), schedulerIntervalMs: 0 }).then((p) => { closers.push(p.close); });
      const child = new EventEmitter();
      child.unref = () => {};
      return child;
    },
    open: async () => true,
    ...extra,
  };
}
const installedHome = () => {
  const home = join(scratch(), 'bl');
  mkdirSync(home, { mode: 0o700 });
  writeFileSync(join(home, 'config.json'), '{}');
  writeFileSync(join(home, '.env'), '', { mode: 0o600 });
  chmodSync(join(home, '.env'), 0o600);
  return home;
};

test('start: nothing running -> a detached panel on the first free port, waits for it, opens the page; the log file is appended under the home', async () => {
  const home = installedHome();
  const base = await freeBase();
  const d = deps(home, base);
  const opened = [];
  d.open = async (u) => { opened.push(u); return true; };
  const io = sink();
  const rc = await startCmd(io, d);
  assert.equal(rc, 0, io.text());
  assert.equal(io.lines[0], `bareloop ${V} · installed ✓ · panel not running`);
  assert.equal(io.lines[1], 'runs: 0 running · 0 need you · 0 in all');
  assert.equal(io.lines.at(-1), `Panel started at http://127.0.0.1:${base} — opening the page.`);
  assert.deepEqual(opened, [`http://127.0.0.1:${base}`]);
  assert.equal(d.spawned.length, 1);
  assert.equal(d.spawned[0].cmd, 'setsid');
  assert.deepEqual(d.spawned[0].args.slice(1), ['/x/bin/bareloop.mjs', 'panel', '--port', String(base)]);
  assert.ok(existsSync(join(home, 'panel.log')));
  // a second start finds it by asking the ports and starts nothing
  const io2 = sink();
  assert.equal(await startCmd(io2, d), 0);
  assert.equal(d.spawned.length, 1, 'already running: nothing started');
  assert.equal(io2.lines.at(-1), `Panel already running at http://127.0.0.1:${base} — opening the page.`);
  assert.match(io2.lines[0], new RegExp(`panel running at http://127.0.0.1:${base} · started \\d\\d/\\d\\d \\d\\d:\\d\\d$`));
});

test('start: a port held by something that is not bareloop is skipped and said so', async () => {
  const home = installedHome();
  const base = await freeBase();
  await squat(base);
  const d = deps(home, base);
  const io = sink();
  assert.equal(await startCmd(io, d), 0, io.text());
  assert.ok(io.lines.includes(`${base} is taken, using ${base + 1}.`), io.text());
  assert.equal(io.lines.at(-1), `Panel started at http://127.0.0.1:${base + 1} — opening the page.`);
});

test('start: every port taken -> plain words, nothing started, exit 1', async () => {
  const home = installedHome();
  const base = await freeBase();
  await squat(base); await squat(base + 1);
  const d = deps(home, base, { ports: [base, base + 1] });
  const io = sink();
  assert.equal(await startCmd(io, d), 1);
  assert.equal(d.spawned.length, 0);
  assert.match(io.text(), /taken by something else, so the panel was not started/);
});

test('start: no opener available -> the URL is printed instead', async () => {
  const home = installedHome();
  const base = await freeBase();
  const d = deps(home, base, { open: async () => false });
  const io = sink();
  assert.equal(await startCmd(io, d), 0);
  assert.equal(io.lines.at(-1), `Panel started at http://127.0.0.1:${base} — open it in your browser.`);
});

test('start: a panel that never answers -> deadline, says so and points at panel.log, exit 1', async () => {
  const home = installedHome();
  const base = await freeBase();
  const d = deps(home, base, { deadlineMs: 400, spawnFn: () => { const c = new EventEmitter(); c.unref = () => {}; return c; } });
  const io = sink();
  assert.equal(await startCmd(io, d), 1);
  assert.match(io.text(), /did not answer within 0\.4 seconds\. See .*panel\.log/);
});

test('stop: not running -> "Panel not running." and exit 0, no kill', async () => {
  const home = installedHome();
  const base = await freeBase();
  const kills = [];
  const io = sink();
  assert.equal(await stopCmd([], io, deps(home, base, { kill: (p, s) => kills.push([p, s]) })), 0);
  assert.equal(io.lines.at(-1), 'Panel not running.');
  assert.deepEqual(kills, []);
});

test('stop: a running panel with no drafts -> SIGTERM to the pid it reported (injected kill), waits until the port is quiet, "Panel stopped."', async () => {
  const home = installedHome();
  const base = await freeBase();
  const panel = await fakePanel(base, { pid: 4242 });
  const kills = [];
  const io = sink();
  const rc = await stopCmd([], io, deps(home, base, {
    kill: mortal((pid, sig) => { kills.push([pid, sig]); panel.close(); }),
    ask: async () => { throw new Error('must not ask when no draft is open'); },
  }));
  assert.equal(rc, 0, io.text());
  assert.deepEqual(kills, [[4242, 'SIGTERM']]);
  assert.equal(io.lines.at(-1), 'Panel stopped.');
});

test('stop: open drafts -> the warning, the ask; n leaves it running, y stops it; --yes skips the ask', async () => {
  const home = installedHome();
  const base = await freeBase();
  const panel = await fakePanel(base, { pid: 4243, drafts: 1 });
  const kills = [];
  const kill = mortal((pid, sig) => { kills.push([pid, sig]); panel.close(); });
  const asked = [];
  const no = sink();
  assert.equal(await stopCmd([], no, deps(home, base, { kill, ask: async (q) => { asked.push(q); return 'n'; } })), 0);
  assert.deepEqual(kills, [], 'declined: nothing signalled');
  assert.ok(no.lines.includes('1 draft is open in the panel and will be lost.'));
  assert.ok(no.lines.includes('Runs keep going. Scheduled runs wait until the panel is started again.'));
  assert.equal(asked[0], 'Stop the panel? [y/N] ');
  assert.equal(no.lines.at(-1), 'Not stopped.');
  const yes = sink();
  assert.equal(await stopCmd([], yes, deps(home, base, { kill, ask: async () => 'y' })), 0);
  assert.deepEqual(kills, [[4243, 'SIGTERM']]);
  assert.equal(yes.lines.at(-1), 'Panel stopped.');
});

test('stop --yes: no question even with drafts open; plural wording for several drafts', async () => {
  const home = installedHome();
  const base = await freeBase();
  const panel = await fakePanel(base, { pid: 4244, drafts: 2 });
  const io = sink();
  const rc = await stopCmd(['--yes'], io, deps(home, base, { kill: mortal(() => { panel.close(); }), ask: async () => { throw new Error('--yes must not ask'); } }));
  assert.equal(rc, 0, io.text());
  assert.equal(io.lines.at(-1), 'Panel stopped.');
});

test('stop: two panels found -> both pids signalled, ONE ask with the summed draft count, "2 panels stopped."; no which-one question', async () => {
  const home = installedHome();
  const base = await freeBase();
  const a = await fakePanel(base, { pid: 5001, drafts: 1 });
  const b = await fakePanel(base + 1, { pid: 5002, drafts: 2 });
  const kills = [];
  const kill = mortal((pid) => { kills.push(pid); (pid === 5001 ? a : b).close(); });
  const asked = [];
  const io = sink();
  assert.equal(await stopCmd([], io, deps(home, base, { kill, ask: async (q) => { asked.push(q); return 'y'; } })), 0, io.text());
  assert.deepEqual(kills, [5001, 5002]);
  assert.deepEqual(asked, ['Stop the panel? [y/N] '], 'exactly one ask');
  assert.ok(io.lines.includes('3 drafts are open in the panel and will be lost.'));
  assert.equal(io.lines.at(-1), '2 panels stopped.');
});

test('stop: two panels, answer n -> nothing signalled; --yes -> no ask, both stopped', async () => {
  const home = installedHome();
  const base = await freeBase();
  const a = await fakePanel(base, { pid: 5011, drafts: 1 });
  const b = await fakePanel(base + 1, { pid: 5012 });
  const kills = [];
  const kill = mortal((pid) => { kills.push(pid); (pid === 5011 ? a : b).close(); });
  const no = sink();
  assert.equal(await stopCmd([], no, deps(home, base, { kill, ask: async () => 'n' })), 0);
  assert.deepEqual(kills, []);
  assert.equal(no.lines.at(-1), 'Not stopped.');
  const yes = sink();
  assert.equal(await stopCmd(['--yes'], yes, deps(home, base, { kill, ask: async () => { throw new Error('--yes must not ask'); } })), 0, yes.text());
  assert.deepEqual(kills, [5011, 5012]);
  assert.equal(yes.lines.at(-1), '2 panels stopped.');
});

test('stop --port N (and any unknown option) is refused in plain words; nothing signalled', async () => {
  const home = installedHome();
  const base = await freeBase();
  await fakePanel(base, { pid: 5021 });
  const kills = [];
  const io = sink();
  assert.equal(await stopCmd(['--port', String(base)], io, deps(home, base, { kill: (p) => kills.push(p) })), 1);
  assert.deepEqual(kills, []);
  assert.match(io.text(), /Unknown option "--port" — bareloop stop takes only --yes\. It stops every panel it finds\./);
});

test('start with two panels found -> starts nothing (no spawn), says already running, opens the first', async () => {
  const home = installedHome();
  const base = await freeBase();
  await fakePanel(base, { pid: 5031 });
  await fakePanel(base + 1, { pid: 5032 });
  const d = deps(home, base);
  const io = sink();
  assert.equal(await startCmd(io, d), 0, io.text());
  assert.equal(d.spawned.length, 0);
  assert.ok(io.lines.some((l) => l.startsWith(`Panel already running at http://127.0.0.1:${base} `)), io.text());
});

test('status with two panels found -> one line per panel, each led by its url', async () => {
  const home = installedHome();
  const base = await freeBase();
  await fakePanel(base, { pid: 5041 });
  await fakePanel(base + 1, { pid: 5042 });
  const io = sink();
  assert.equal(await statusCmd(io, deps(home, base)), 0);
  assert.ok(io.lines.includes(`http://127.0.0.1:${base} · pid 5041 · version ${V} · 0 drafts open · 0 schedules on`), io.text());
  assert.ok(io.lines.includes(`http://127.0.0.1:${base + 1} · pid 5042 · version ${V} · 0 drafts open · 0 schedules on`), io.text());
});

test('status: not running -> header then "Panel not running.", exit 3 (the sub-command) but 0 from the menu; running -> pid, drafts, schedules, exit 0', async () => {
  const home = installedHome();
  const base = await freeBase();
  const none = sink();
  assert.equal(await statusCmd(none, deps(home, base)), 3);
  assert.equal(none.lines.length, 3);
  assert.match(none.lines[0], /panel not running$/);
  assert.equal(none.lines[2], 'Panel not running.');
  const viaMenu = sink();
  assert.equal(await menuCmd(viaMenu, deps(home, base, { ask: async () => '4' })), 0, 'the menu worked: exit 0');
  assert.equal(viaMenu.lines.at(-1), 'Panel not running.');
  await fakePanel(base + 2, { pid: 48213, drafts: 1, schedules: 3 });
  const io = sink();
  assert.equal(await statusCmd(io, deps(home, base)), 0);
  assert.match(io.lines[0], new RegExp(`panel running at http://127.0.0.1:${base + 2}$`));
  assert.equal(io.lines[2], `pid 48213 · version ${V} · 1 draft open · 3 schedules on`);
});

test('install: creates what is missing (dir 700, .env 600, config.json), then says there is nothing to do; keys already in .env are untouched', async () => {
  const home = join(scratch(), 'bl');
  const io = sink();
  const d = deps(home, 1);
  assert.equal(await installCmd(io, d), 0, io.text());
  assert.match(io.lines[0], /not installed — no bareloop folder yet, pick 5 install · panel not running/);
  assert.ok(io.lines.some((l) => /^Installed\. Created:/.test(l)));
  assert.equal(statSync(home).mode & 0o777, 0o700);
  assert.equal(statSync(join(home, '.env')).mode & 0o777, 0o600);
  assert.ok(existsSync(join(home, 'config.json')));
  writeFileSync(join(home, '.env'), 'MY_KEY=abc\n', { mode: 0o600 });
  const again = sink();
  assert.equal(await installCmd(again, d), 0);
  assert.equal(again.lines.at(-1), 'Already installed, nothing to do.');
  assert.match(again.lines[0], /installed ✓/);
  assert.equal(readFileSync(join(home, '.env'), 'utf8'), 'MY_KEY=abc\n');
});

test('install: a loose .env gets mode 600 and the config is never overwritten; node below 22 stops with nothing changed', async () => {
  const home = installedHome();
  writeFileSync(join(home, 'config.json'), '{"monthlyLimitUsd":5}\n');
  chmodSync(join(home, '.env'), 0o644);
  const io = sink();
  assert.equal(await installCmd(io, deps(home, 1)), 0);
  assert.equal(statSync(join(home, '.env')).mode & 0o777, 0o600);
  assert.equal(readFileSync(join(home, 'config.json'), 'utf8'), '{"monthlyLimitUsd":5}\n');
  const fresh = join(scratch(), 'bl');
  const old = sink();
  assert.equal(await installCmd(old, deps(fresh, 1, { nodeVersion: '20.11.0' })), 1);
  assert.equal(existsSync(fresh), false, 'nothing created');
  assert.match(old.text(), /needs node 22 or newer; this is node 20\.11\.0\. Nothing was changed\./);
});

test('menu (the approved layout): two header lines, a blank line, the panel line, the jobs line, q quit, then the prompt; q quits 0', async () => {
  const home = installedHome();
  const base = await freeBase();
  await fakePanel(base + 1, { pid: 48213 });
  const io = sink();
  const asked = [];
  const rc = await menuCmd(io, deps(home, base, { ask: async (q) => { asked.push(q); return 'q'; } }));
  assert.equal(rc, 0);
  assert.deepEqual(io.lines, [
    `bareloop ${V} · installed ✓ · panel running at http://127.0.0.1:${base + 1}`,
    'runs: 0 running · 0 need you · 0 in all',
    '',
    'panel: 1 start   2 stop   3 restart   4 status   5 install',
    'jobs:  6 export   7 run   8 resume   9 history',
    'q quit',
  ]);
  assert.deepEqual(asked, ['> ']);
});

test('menu: choice 4 runs status through the same code WITHOUT printing the header twice; an unknown choice is refused', async () => {
  const home = installedHome();
  const base = await freeBase();
  await fakePanel(base, { pid: 48213, drafts: 1, schedules: 3 });
  const io = sink();
  assert.equal(await menuCmd(io, deps(home, base, { ask: async () => '4' })), 0);
  assert.equal(io.lines.filter((l) => l.startsWith(`bareloop ${V}`)).length, 1);
  assert.equal(io.lines.at(-1), `pid 48213 · version ${V} · 1 draft open · 3 schedules on`);
  const bad = sink();
  assert.equal(await menuCmd(bad, deps(home, base, { ask: async () => '9' })), 1);
  assert.match(bad.text(), /unknown choice "9"/);
  assert.match(bad.text(), /one of: 1, 2, 3, 4, 5, 6, 7, 8, 9, q/);
});

test('main: bare `bareloop` shows the new menu (the old export/run/history menu is gone); the sub-commands status|install go through main with the header first', async () => {
  const home = installedHome();
  const base = await freeBase();
  const stdin = new PassThrough();
  const out = []; const err = [];
  const stdout = { write: (s) => { out.push(s); return true; } };
  const stderr = { write: (s) => { err.push(s); return true; } };
  const launcher = { ports: [base, base + 1], timeoutMs: 2000, nodeVersion: '22.1.0', version: V };
  const run = main([], { stdin, stdout, stderr, cwd: process.cwd(), env: {}, keysHome: home, runlistHome: home, launcher });
  await new Promise((r) => setTimeout(r, 300));
  stdin.write('q\n');
  assert.equal(await run, 0);
  const text = out.join('');
  assert.match(text, new RegExp(`^bareloop ${VRE} · installed ✓ · panel not running\nruns: 0 running · 0 need you · 0 in all\n\npanel: 1 start   2 stop   3 restart   4 status   5 install\njobs:  6 export   7 run   8 resume   9 history\nq quit\n`));
  assert.doesNotMatch(text, /1 export/);
  const out2 = [];
  assert.equal(await main(['status'], { stdout: { write: (s) => { out2.push(s); return true; } }, stderr, cwd: process.cwd(), env: {}, keysHome: home, runlistHome: home, launcher }), 3);
  assert.match(out2.join(''), new RegExp(`^bareloop ${VRE} · installed ✓ · panel not running\nruns: `));
});

test('version: status shows the panel\'s own version; a differing panel gets the header note and the start line; a matching one gets neither; colour words equal plain', async () => {
  const home = installedHome();
  const base = await freeBase();
  await fakePanel(base, { version: '0.0.0-old', pid: 777, drafts: 2, schedules: 1 });
  const st = sink();
  assert.equal(await statusCmd(st, deps(home, base)), 0);
  assert.equal(st.lines.at(-1), 'pid 777 · version 0.0.0-old · 2 drafts open · 1 schedule on');
  assert.match(st.lines[0], new RegExp(`panel running at http://127.0.0.1:${base} \\(version 0\\.0\\.0-old — stop and start to use ${VRE}\\)$`));
  const open = [];
  const s = sink();
  assert.equal(await startCmd(s, deps(home, base, { open: async (u) => { open.push(u); return true; } })), 0);
  assert.equal(s.lines.at(-2), `Panel already running at http://127.0.0.1:${base} — opening the page.`);
  assert.equal(s.lines.at(-1), `It is version 0.0.0-old; this bareloop is ${V}. Run bareloop stop, then bareloop start, to use ${V}.`);
  assert.equal(open.length, 1);
  const col = sink();
  await startCmd(col, deps(home, base, { paint: makePaint({ isTTY: true }, {}) }));
  assert.match(col.lines.at(-1), /^\x1b\[33mIt is version 0\.0\.0-old/);
  assert.ok(col.lines.some((l) => l.includes(`\x1b[33m (version 0.0.0-old — stop and start to use ${V})\x1b[0m`)));
  const strip = (t) => t.replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(strip(col.lines.at(-1)), s.lines.at(-1));
});

test('version: a panel on the CLI\'s own version gets no note and no extra start line', async () => {
  const home = installedHome();
  const base = await freeBase();
  await fakePanel(base, { version: V });
  const s = sink();
  assert.equal(await startCmd(s, deps(home, base)), 0);
  assert.doesNotMatch(s.text(), /stop and start to use|It is version/);
  assert.match(s.lines[0], new RegExp(`panel running at http://127.0.0.1:${base}$`));
  assert.equal(s.lines.at(-1), `Panel already running at http://127.0.0.1:${base} — opening the page.`);
});

/** a server on `port` that takes the connection and never answers (a panel too loaded to reply, or a stuck one) */
function silentServer(port) {
  return new Promise((resolve) => {
    const socks = new Set();
    const s = httpServer(() => { /* never answers */ });
    s.on('connection', (c) => { socks.add(c); c.on('close', () => socks.delete(c)); });
    s.listen(port, '127.0.0.1', () => {
      const close = () => new Promise((r) => { for (const c of socks) c.destroy(); s.close(() => r(undefined)); });
      closers.push(close);
      resolve(close);
    });
  });
}

test('start: a taken port that stays silent -> start waits, then says so, starts NOTHING, exit 1', async () => {
  const home = installedHome();
  const base = await freeBase();
  await silentServer(base);
  const d = deps(home, base, { timeoutMs: 200, silentWaitMs: 900 });
  const io = sink();
  const t0 = performance.now();
  const rc = await startCmd(io, d);
  const took = performance.now() - t0;
  assert.equal(rc, 1, io.text());
  assert.equal(d.spawned.length, 0, 'no second panel');
  assert.equal(io.lines.at(-1), `ERR Port ${base} is taken and not answering. To see what holds it: lsof -i :${base}. If it is a stuck bareloop, end it: kill <pid>`);
  assert.ok(took >= 900, `waited only ${Math.round(took)} ms`);
  assert.ok(took < 4000, `waited ${Math.round(took)} ms`);
});

test('start: a taken port that answers late as bareloop -> already running, nothing started', async () => {
  const home = installedHome();
  const base = await freeBase();
  const readyAt = performance.now() + 800;
  const s = httpServer((_q, res) => {
    if (performance.now() < readyAt) return; // loaded: no answer yet
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ app: 'bareloop', version: V, pid: 4242, port: base, drafts: 0, schedules: 0 }));
  });
  const socks = new Set();
  s.on('connection', (c) => { socks.add(c); c.on('close', () => socks.delete(c)); });
  await new Promise((r) => { s.listen(base, '127.0.0.1', r); });
  closers.push(() => new Promise((r) => { for (const c of socks) c.destroy(); s.close(() => r(undefined)); }));
  const d = deps(home, base, { timeoutMs: 200, silentWaitMs: 5000 });
  const io = sink();
  assert.equal(await startCmd(io, d), 0, io.text());
  assert.equal(d.spawned.length, 0);
  assert.equal(io.lines.at(-1), `Panel already running at http://127.0.0.1:${base} — opening the page.`);
});

test('start: a taken port whose connection is refused after the free check is moved past, not waited on', async () => {
  const home = installedHome();
  const base = await freeBase();
  // portFree says busy for the first port, but nothing listens there: connection refused = a reply that is not bareloop
  const d = deps(home, base, { portFree: async (p) => p !== base, silentWaitMs: 60000 });
  const io = sink();
  const t0 = performance.now();
  assert.equal(await startCmd(io, d), 0, io.text());
  assert.ok(performance.now() - t0 < 5000);
  assert.equal(io.lines.at(-1), `Panel started at http://127.0.0.1:${base + 1} — opening the page.`);
});

test('stop: a pid that is still alive at the deadline is named, exit 1, never "Panel stopped."; one that did stop is still named', async () => {
  const home = installedHome();
  const base = await freeBase();
  const a = await fakePanel(base, { pid: 5101 });
  const b = await fakePanel(base + 1, { pid: 5102 });
  const gone = new Set();
  const kill = (pid, sig) => {
    if (sig === 0) { if (gone.has(pid)) { const e = new Error('x'); e.code = 'ESRCH'; throw e; } return; }
    if (pid === 5101) { gone.add(pid); a.close(); } else b.close(); // 5102: its port goes quiet but the process lingers
  };
  const io = sink();
  const rc = await stopCmd(['--yes'], io, deps(home, base, { kill, deadlineMs: 500 }));
  assert.equal(rc, 1, io.text());
  assert.ok(io.lines.includes(`ERR The panel at http://127.0.0.1:${base + 1} (pid 5102) did not stop.`), io.text());
  assert.ok(io.lines.includes(`The panel at http://127.0.0.1:${base} (pid 5101) stopped.`), io.text());
  assert.ok(!io.text().includes('Panel stopped.') && !io.text().includes('panels stopped.'), io.text());
});

// fwd's v0.47.1 bug: `echo q | bareloop` printed the header and choices but never the `> ` prompt. The line reader was made at start, the header
// waited on the (slow) port probe, stdin delivered `q\n` and EOF with no question pending, the line was dropped, and the later ask('> ')
// returned '' without printing. Reproduced exactly: stdin holds the answer and has ENDED before the probe resolves.
async function pipedMenu(input) {
  const home = installedHome();
  const base = await freeBase();
  const stdin = new PassThrough();
  stdin.end(input); // the answer AND the end of input, before anything is asked
  const out = []; const err = [];
  const slowProbe = () => new Promise((_res, rej) => { setTimeout(() => rej(new Error('connection refused')), 400); });
  const launcher = { ports: [base], timeoutMs: 2000, nodeVersion: '22.1.0', version: V, fetchImpl: slowProbe };
  const rc = await main([], {
    stdin, stdout: { write: (s) => { out.push(s); return true; } }, stderr: { write: (s) => { err.push(s); return true; } },
    cwd: process.cwd(), env: {}, keysHome: home, runlistHome: home, launcher,
  });
  return { rc, text: out.join(''), err: err.join('') };
}

test('regression (v0.47.1): `echo q | bareloop` with a slow header probe still prints the `> ` prompt and honours q', async () => {
  const r = await pipedMenu('q\n');
  assert.equal(r.rc, 0);
  assert.match(r.text, /q quit\n> $/, 'the prompt is printed after the choices');
});

test('regression (v0.47.1): `echo 4 | bareloop` with a slow header probe prompts, then runs status', async () => {
  const r = await pipedMenu('4\n');
  assert.match(r.text, /q quit\n> /);
  assert.equal(r.rc, 0, r.text + r.err);
  assert.match(r.text, /> Panel not running\./);
});

// --- panel start time and restart (hamr 2026-10-25) ---

test('whoami: the real panel reports startedAt (ISO, set once at start)', async () => {
  const home = installedHome();
  const base = await freeBase();
  const before = Date.now();
  const p = await createPanelServer({ port: base, home, sessionsRoot: join(home, 'sessions'), schedulerIntervalMs: 0 });
  closers.push(p.close);
  const j = await (await fetch(`http://127.0.0.1:${base}/api/whoami`)).json();
  assert.match(j.startedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.ok(Date.parse(j.startedAt) >= before - 1000 && Date.parse(j.startedAt) <= Date.now());
  await new Promise((r) => { setTimeout(r, 30); });
  const j2 = await (await fetch(`http://127.0.0.1:${base}/api/whoami`)).json();
  assert.equal(j2.startedAt, j.startedAt, 'set once, not per request');
});

test('header and status show the start time after the address (local, MM/DD HH:MM); an older panel without it shows nothing extra', async () => {
  const home = installedHome();
  const base = await freeBase();
  await fakePanel(base, { pid: 6001, startedAt: '2026-10-24T21:40:00' }); // no zone = local time
  await fakePanel(base + 1, { pid: 6002 }); // older panel: no startedAt
  const io = sink();
  assert.equal(await statusCmd(io, deps(home, base)), 0);
  assert.match(io.lines[0], new RegExp(`panels running at http://127\\.0\\.0\\.1:${base} · started 10/24 21:40, http://127\\.0\\.0\\.1:${base + 1}$`));
  assert.ok(io.lines.includes(`http://127.0.0.1:${base} · pid 6001 · version ${V} · 0 drafts open · 0 schedules on · started 10/24 21:40`), io.text());
  assert.ok(io.lines.includes(`http://127.0.0.1:${base + 1} · pid 6002 · version ${V} · 0 drafts open · 0 schedules on`), 'no "started" for the older panel');
});

test('restart: no panel running -> says so and just starts', async () => {
  const home = installedHome();
  const base = await freeBase();
  const d = deps(home, base);
  const io = sink();
  assert.equal(await restartCmd([], io, d), 0, io.text());
  assert.ok(io.lines.includes('Panel not running — starting it.'));
  assert.equal(d.spawned.length, 1);
  assert.equal(io.lines.at(-1), `Panel started at http://127.0.0.1:${base} — opening the page.`);
});

test('restart --yes: the running panel is stopped, then started again on the SAME port (not the first free one)', async () => {
  const home = installedHome();
  const base = await freeBase();
  const panel = await fakePanel(base + 1, { pid: 7001, drafts: 1 });
  const kills = [];
  const d = deps(home, base, { kill: mortal((pid) => { kills.push(pid); panel.close(); }), ask: async () => { throw new Error('--yes must not ask'); } });
  const io = sink();
  assert.equal(await restartCmd(['--yes'], io, d), 0, io.text());
  assert.deepEqual(kills, [7001]);
  assert.ok(io.lines.includes('Panel stopped.'));
  assert.equal(d.spawned.length, 1);
  assert.deepEqual(d.spawned[0].args.slice(-2), ['--port', String(base + 1)], 'the port the panel had, although the first port was free');
  assert.equal(io.lines.at(-1), `Panel started at http://127.0.0.1:${base + 1} — opening the page.`);
});

test('restart: open drafts are warned about and asked like stop; a "no" signals nothing and starts nothing', async () => {
  const home = installedHome();
  const base = await freeBase();
  await fakePanel(base, { pid: 7011, drafts: 2 });
  const kills = [];
  const asked = [];
  const d = deps(home, base, { kill: (pid) => kills.push(pid), ask: async (q) => { asked.push(q); return 'n'; } });
  const io = sink();
  assert.equal(await restartCmd([], io, d), 0, io.text());
  assert.ok(io.lines.includes('2 drafts are open in the panel and will be lost.'));
  assert.deepEqual(asked, ['Stop the panel? [y/N] ']);
  assert.deepEqual(kills, []);
  assert.equal(d.spawned.length, 0, 'declined: nothing started');
  assert.equal(io.lines.at(-1), 'Not stopped.');
});

test('restart through the menu (3) and the sub-command; an unknown option is refused like stop', async () => {
  const home = installedHome();
  const base = await freeBase();
  const d = deps(home, base, { ask: async () => '3' });
  const io = sink();
  assert.equal(await menuCmd(io, d), 0, io.text());
  assert.ok(io.lines.some((l) => /panel: 1 start {3}2 stop {3}3 restart {3}4 status {3}5 install/.test(l)));
  assert.ok(io.lines.includes('Panel not running — starting it.'));
  assert.equal(d.spawned.length, 1);
  const bad = sink();
  assert.equal(await restartCmd(['--port', '1'], bad, deps(home, base)), 1);
  assert.match(bad.text(), /Unknown option "--port"/);
});
