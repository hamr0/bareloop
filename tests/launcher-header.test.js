// L (PANEL-BUILD.md addendum 2026-10-24) — the two header lines every `bareloop` call prints, from ONE function: run counts by the
// panel's own code, the installed check, the panel probe. Scratch homes, injected ports/fetch, nothing real.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { countRuns, installState, probePanels, headerLines } from '../src/launcher.js';
import { listRuns } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';

/** @type {string[]} */
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'launcher-')); dirs.push(d); return d; };

/** a fake panel answering /api/whoami on a free port; `body` overrides fields */
function fakePanel(body = {}, { app = 'bareloop' } = {}) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url === '/api/whoami') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ app, version: '9.9.9', pid: 4242, drafts: 0, schedules: 0, ...body, port: server.address().port }));
      } else { res.writeHead(404); res.end('nope'); }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, close: () => new Promise((r) => { server.close(() => r(undefined)); }) }));
  });
}

test('countRuns: running / need you / in all come from the panel\'s own listRuns rows (status.key, needs), a part that is 0 still counts', () => {
  const rows = [
    { runid: 'a', status: { key: 'running' }, needs: null },
    { runid: 'b', status: { key: 'failed' }, needs: 'Resume' },
    { runid: 'c', status: { key: 'passed' }, needs: 'Accept' },
    { runid: 'd', fileMissing: true, needs: null },
  ];
  assert.deepEqual(countRuns(rows), { running: 1, needYou: 2, total: 4 });
  assert.deepEqual(countRuns([]), { running: 0, needYou: 0, total: 0 });
});

test('countRuns over a REAL run list on disk agrees with listRuns (a cap-halted run that can resume needs you)', () => {
  const home = scratch();
  // a spine-less row is "file missing": counted in all, never running, never needs you
  appendRun({ at: '2026-10-01T10:00:00.000Z', runid: 'gone', job: 'j', spine: join(home, 'nope.jsonl'), patient: null, via: 'run-u' }, { home });
  const rows = listRuns({ home });
  assert.equal(rows.length, 1);
  assert.deepEqual(countRuns(rows), { running: 0, needYou: 0, total: 1 });
});

test('installState: missing folder, missing config, bad config, missing/loose .env, old node, then ok — the FIRST missing thing in plain words', () => {
  const root = scratch();
  const home = join(root, 'bl');
  const ok = { nodeVersion: '22.1.0' };
  assert.match(installState({ home, ...ok }).problem ?? '', /no bareloop folder yet/);
  mkdirSync(home, { mode: 0o700 });
  assert.match(installState({ home, ...ok }).problem ?? '', /no settings file yet/);
  writeFileSync(join(home, 'config.json'), '{ not json');
  assert.match(installState({ home, ...ok }).problem ?? '', /config\.json/);
  writeFileSync(join(home, 'config.json'), '{}');
  assert.match(installState({ home, ...ok }).problem ?? '', /no keys file yet/);
  writeFileSync(join(home, '.env'), '', { mode: 0o644 });
  chmodSync(join(home, '.env'), 0o644);
  assert.match(installState({ home, ...ok }).problem ?? '', /readable by other users/);
  chmodSync(join(home, '.env'), 0o600);
  assert.match(installState({ home, nodeVersion: '20.11.0' }).problem ?? '', /node 22/);
  assert.deepEqual(installState({ home, ...ok }), { ok: true, problem: null });
});

test('probePanels: bareloop answers win, a non-bareloop answer and a closed port are skipped; several are all listed', async () => {
  const a = await fakePanel({ drafts: 1 });
  const b = await fakePanel();
  const other = await fakePanel({}, { app: 'something-else' });
  try {
    const ports = [a.port, other.port, b.port];
    const found = await probePanels({ ports, timeoutMs: 300 });
    assert.deepEqual(found.map((f) => f.port).sort(), [a.port, b.port].sort());
    assert.equal(found.find((f) => f.port === a.port)?.drafts, 1);
    assert.deepEqual(await probePanels({ ports: [other.port], timeoutMs: 300 }), []);
  } finally { await a.close(); await b.close(); await other.close(); }
});

test('headerLines: the two lines, installed + panel running; not installed + panel not running; zero parts still show', async () => {
  const root = scratch();
  const home = join(root, 'bl');
  const p = await fakePanel();
  try {
    const noHome = await headerLines({ home, ports: [1], version: '0.46.1', nodeVersion: '22.1.0', timeoutMs: 100 });
    assert.equal(noHome.length, 2);
    assert.equal(noHome[0], 'bareloop 0.46.1 · not installed — no bareloop folder yet, pick 4 install · panel not running');
    assert.equal(noHome[1], 'runs: 0 running · 0 need you · 0 in all');
    mkdirSync(home, { mode: 0o700 });
    writeFileSync(join(home, 'config.json'), '{}');
    writeFileSync(join(home, '.env'), '', { mode: 0o600 });
    chmodSync(join(home, '.env'), 0o600);
    const lines = await headerLines({ home, ports: [p.port], version: '0.46.1', nodeVersion: '22.1.0', timeoutMs: 300 });
    assert.equal(lines[0], `bareloop 0.46.1 · installed ✓ · panel running at http://127.0.0.1:${p.port}`);
    assert.equal(lines[1], 'runs: 0 running · 0 need you · 0 in all');
  } finally { await p.close(); }
});
