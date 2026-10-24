// L colours — on only for a terminal (TTY, no NO_COLOR, TERM not dumb); colours wrap words and never change them (stripped == plain).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { makePaint } from '../src/tty-colour.js';
import { buildHeader, menuCmd } from '../src/launcher.js';
import { main } from '../src/cli.js';
import { packageVersion } from '../src/panel/server.js';
const V = packageVersion();
const VRE = V.replace(/\./g, '\\.');

/** @type {string[]} */
const dirs = [];
/** @type {(() => Promise<void>)[]} */
const closers = [];
after(async () => { for (const c of closers) await c(); for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'launcher-colour-')); dirs.push(d); return d; };
// eslint-disable-next-line no-control-regex
const strip = (/** @type {string} */ s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const sink = () => { const lines = []; return { out: (s) => lines.push(s), err: (s) => lines.push(`ERR ${s}`), lines }; };
function fakePanel() {
  return new Promise((resolve) => {
    const server = createServer((_q, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ app: 'bareloop', version: V, pid: 4242, drafts: 0, schedules: 0 }));
    });
    server.listen(0, '127.0.0.1', () => {
      closers.push(() => new Promise((r) => { server.close(() => r(undefined)); }));
      resolve(/** @type {any} */ (server.address()).port);
    });
  });
}

test('makePaint: on for a TTY with no NO_COLOR; off with NO_COLOR, off when not a TTY, off for TERM=dumb; an empty NO_COLOR does not turn it off', () => {
  assert.equal(makePaint({ isTTY: true }, {}).on, true);
  assert.equal(makePaint({ isTTY: true }, { TERM: 'xterm-256color' }).on, true);
  assert.equal(makePaint({ isTTY: true }, { NO_COLOR: '1' }).on, false);
  assert.equal(makePaint({ isTTY: false }, {}).on, false);
  assert.equal(makePaint({}, {}).on, false);
  assert.equal(makePaint({ isTTY: true }, { TERM: 'dumb' }).on, false);
  assert.equal(makePaint({ isTTY: true }, { NO_COLOR: '' }).on, true);
  assert.equal(makePaint({ isTTY: true }, {}).red('x'), '\x1b[31mx\x1b[0m');
  assert.equal(makePaint({ isTTY: false }, {}).red('x'), 'x');
});

test('header + menu: with colour the words are the same (stripped), the rule frames the header, the numbers are bold cyan', async () => {
  const home = join(scratch(), 'bl');
  const port = await fakePanel();
  const base = { home, ports: [port], timeoutMs: 2000, nodeVersion: '22.1.0', version: V };
  const plain = await buildHeader({ ...base, paint: makePaint({ isTTY: false }, {}) });
  const col = await buildHeader({ ...base, paint: makePaint({ isTTY: true }, {}) });
  assert.equal(plain.lines.length, 2);
  assert.equal(col.lines.length, 4);
  assert.equal(strip(col.lines[0]), '─'.repeat(56));
  assert.equal(strip(col.lines[3]), '─'.repeat(56));
  assert.deepEqual(col.lines.slice(1, 3).map(strip), plain.lines);
  assert.match(col.lines[1], new RegExp(`\\x1b\\[1;36mbareloop\\x1b\\[0m \\x1b\\[90m${VRE}`));
  assert.match(col.lines[1], /\x1b\[31mnot installed\x1b\[0m — no bareloop folder yet, pick \x1b\[1;36m4\x1b\[0m install/);
  assert.match(col.lines[1], new RegExp(`panel \\x1b\\[32mrunning\\x1b\\[0m at \\x1b\\[36mhttp://127\\.0\\.0\\.1:${port}\\x1b\\[0m`));
  assert.match(col.lines[2], /\x1b\[90mruns:\x1b\[0m \x1b\[90m0 running\x1b\[0m/);
  const io = sink();
  await menuCmd(io, { ...base, ask: async () => 'q', paint: makePaint({ isTTY: true }, {}) });
  const c = (/** @type {string} */ k) => `\x1b[1;36m${k}\x1b[0m`;
  assert.deepEqual(io.lines.slice(-3), [
    `  panel: ${c('1')} start   ${c('2')} stop   ${c('3')} status   ${c('4')} install`,
    `  jobs:  ${c('5')} export   ${c('6')} run   ${c('7')} resume   ${c('8')} history`,
    `  ${c('q')} quit`,
  ]);
  const ioPlain = sink();
  await menuCmd(ioPlain, { ...base, ask: async () => 'q', paint: makePaint({ isTTY: false }, {}) });
  assert.deepEqual(ioPlain.lines.slice(-3), ['panel: 1 start   2 stop   3 status   4 install', 'jobs:  5 export   6 run   7 resume   8 history', 'q quit']);
});

test('refusals are red on a colour terminal, plain words when stripped', async () => {
  const io = sink();
  const { installCmd } = await import('../src/launcher.js');
  const rc = await installCmd(io, { home: join(scratch(), 'bl'), ports: [], nodeVersion: '20.1.0', version: '1.0.0', paint: makePaint({ isTTY: true }, {}), paintErr: makePaint({ isTTY: true }, {}) });
  assert.equal(rc, 1);
  const err = io.lines.find((l) => l.startsWith('ERR '));
  assert.match(err, /^ERR \x1b\[31mbareloop needs node 22/);
  assert.match(strip(err), /needs node 22 or newer; this is node 20\.1\.0\. Nothing was changed\.$/);
});

test('main: stdout a TTY and no NO_COLOR -> coloured header; NO_COLOR set or not a TTY -> not a single escape code in it', async () => {
  const home = join(scratch(), 'bl');
  const launcher = { ports: [], timeoutMs: 50, nodeVersion: '22.1.0', version: V };
  // the header is what bareloop wrote with out(); readline's own terminal codes (prompt echo) come after it and are not ours
  const run = async (isTTY, processEnv) => {
    const stdout = new PassThrough();
    stdout.isTTY = isTTY;
    stdout.columns = 80;
    const chunks = [];
    stdout.on('data', (c) => chunks.push(String(c)));
    const stdin = new PassThrough(); stdin.end('q\n');
    await main([], { stdin, stdout, stderr: { write: () => true }, cwd: process.cwd(), env: {}, keysHome: home, runlistHome: home, launcher, processEnv });
    return chunks.join('').split('1 start')[0];
  };
  const on = await run(true, {});
  assert.match(on, /\x1b\[90m─{56}/);
  assert.doesNotMatch(await run(true, { NO_COLOR: '1' }), /\x1b/);
  assert.doesNotMatch(await run(true, { TERM: 'dumb' }), /\x1b/);
  assert.doesNotMatch(await run(false, {}), /\x1b/);
  assert.match(strip(on), new RegExp(`bareloop ${VRE} · not installed — no bareloop folder yet, pick 4 install · panel not running`));
});
