// L (PANEL-BUILD.md addendum 2026-10-24) — `GET /api/whoami`, the launcher's probe route. Real socket, scratch home, port 0.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { join } from 'node:path';
import { createPanelServer } from '../src/panel/server.js';

/** @type {string[]} */
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'whoami-')); dirs.push(d); return d; };

/** @param {number} port @param {string} path @param {string} [host] @returns {Promise<{status: number, body: string}>} */
function get(port, path, host) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET', headers: host ? { host } : {} }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('GET /api/whoami names the panel: app, version, pid, port, drafts 0, schedules 0 — no token needed', async () => {
  const home = scratch();
  const p = await createPanelServer({ port: 0, home, sessionsRoot: join(home, 'sessions'), schedulerIntervalMs: 0 });
  try {
    const r = await get(p.port, '/api/whoami');
    assert.equal(r.status, 200);
    const j = JSON.parse(r.body);
    assert.equal(j.app, 'bareloop');
    assert.equal(j.pid, process.pid);
    assert.equal(j.port, p.port);
    assert.equal(j.drafts, 0);
    assert.equal(j.schedules, 0);
    assert.match(j.version, /^\d+\.\d+\.\d+/);
  } finally { await p.close(); }
});

test('GET /api/whoami is behind the same Host guard: a foreign Host is 403', async () => {
  const home = scratch();
  const p = await createPanelServer({ port: 0, home, sessionsRoot: join(home, 'sessions'), schedulerIntervalMs: 0 });
  try {
    const r = await get(p.port, '/api/whoami', 'evil.example:80');
    assert.equal(r.status, 403);
  } finally { await p.close(); }
});

test('whoami and the page report the version the panel STARTED with, not what package.json says now', async () => {
  const home = scratch();
  const pkg = join(home, 'package.json');
  writeFileSync(pkg, JSON.stringify({ version: '1.2.3' }));
  const p = await createPanelServer({ port: 0, home, sessionsRoot: join(home, 'sessions'), schedulerIntervalMs: 0, packageJsonPath: pkg });
  try {
    assert.equal(JSON.parse((await get(p.port, '/api/whoami')).body).version, '1.2.3');
    writeFileSync(pkg, JSON.stringify({ version: '9.9.9' })); // a bump on disk while the panel keeps running
    assert.equal(JSON.parse((await get(p.port, '/api/whoami')).body).version, '1.2.3');
    const page = (await get(p.port, '/')).body;
    assert.ok(!page.includes('9.9.9'), 'the page must not show the on-disk version');
  } finally { await p.close(); }
});
