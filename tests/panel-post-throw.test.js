// C4 (fix-ledger, hamr 2026-10-06): a synchronous throw inside a POST route handler must answer 500 JSON
// `{ok:false,error}` and leave the panel process serving — it used to be an uncaught exception (the POST dispatch runs
// in the request's `end` callback, outside createServer's try/catch). Real http server + real socket, injected route.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { handleRequest } from '../src/panel/server.js';

test('C4: a throwing POST route handler answers 500 {ok:false,error}; the server keeps answering the next request', async (t) => {
  let calls = 0;
  const runRoutes = {
    handle(/** @type {any} */ _req, /** @type {any} */ res) {
      calls += 1;
      if (calls === 1) throw new Error('ENOSPC: no space left on device');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    },
  };
  /** @type {any} */ let uncaught = null;
  const onUncaught = (/** @type {Error} */ e) => { uncaught = e; };
  process.once('uncaughtException', onUncaught);
  t.after(() => process.off('uncaughtException', onUncaught));
  const server = createServer((req, res) => {
    handleRequest(req, res, /** @type {any} */ ({ port: 0, token: 't', runRoutes }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
  const post = () => fetch(`${base}/api/runs/abc/stop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(3000) });
  const r1 = await post();
  assert.equal(r1.status, 500);
  assert.match(r1.headers.get('content-type') ?? '', /application\/json/);
  const b1 = await r1.json();
  assert.equal(b1.ok, false);
  assert.match(b1.error, /ENOSPC/);
  const r2 = await post();
  assert.equal(r2.status, 200, 'the process stayed up and serves the next request');
  assert.equal(uncaught, null, 'no uncaught exception');
});
