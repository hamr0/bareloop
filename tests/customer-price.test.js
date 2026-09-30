// The customer's own price (hamr 2026-09-30): `config.keys.<ENV>.{priceInPerM,priceOutPerM}`, USD per 1M
// tokens, resolved by ONE lookup beside keyNameFor and handed to bare-agent's `Loop({ rates })`.
// Scratch homes only; no provider, no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, readConfig, updateConfig } from '../src/config.js';
import { keyRows, keyNameFor, ratesFor } from '../src/providerrows.js';
import { createPanelServer } from '../src/panel/server.js';

/** @param {import('node:test').TestContext} t */
const tmp = (t) => {
  const d = mkdtempSync(join(tmpdir(), 'customer-price-test-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const DS = 'https://api.deepseek.com/v1';
const rowsOf = (keys) => keyRows({ filled: ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY'], config: { keys } });

test('ratesFor: no price = null; both set = exactly perM/1000; the row is the one keyNameFor picks', () => {
  assert.equal(ratesFor('openai-api', DS, rowsOf({}), 'deepseek-flash'), null);
  const rows = rowsOf({ DEEPSEEK_API_KEY: { priceInPerM: 0.006, priceOutPerM: 1.2 } });
  const got = ratesFor('openai-api', DS, rows, 'deepseek-flash');
  assert.deepEqual(got, { rates: { in: 0.006 / 1000, out: 1.2 / 1000 }, inPerM: 0.006, outPerM: 1.2, envName: 'DEEPSEEK_API_KEY' });
  assert.equal(got?.envName, keyNameFor('openai-api', DS, rows, 'deepseek-flash').name, 'same row as the key');
  // a blank-URL OpenAI row is a different endpoint: it neither borrows the DeepSeek price nor is priced by it
  assert.equal(ratesFor('openai-api', undefined, rows, 'gpt-x'), null);
  const both = rowsOf({ DEEPSEEK_API_KEY: { priceInPerM: 1, priceOutPerM: 2 }, OPENAI_API_KEY: { priceInPerM: 5, priceOutPerM: 15 } });
  assert.equal(ratesFor('openai-api', DS, both)?.envName, 'DEEPSEEK_API_KEY');
  assert.equal(ratesFor('openai-api', undefined, both)?.envName, 'OPENAI_API_KEY');
  // zero is a legal price (a free local model)
  assert.deepEqual(ratesFor('openai-api', DS, rowsOf({ DEEPSEEK_API_KEY: { priceInPerM: 0, priceOutPerM: 0 } }))?.rates, { in: 0, out: 0 });
});

test('ratesFor: one field, negative, NaN, Infinity, string, null all throw ConfigError naming the row and field', () => {
  const bad = (fields, re) => assert.throws(
    () => ratesFor('openai-api', DS, rowsOf({ DEEPSEEK_API_KEY: fields })),
    (e) => e instanceof ConfigError && re.test(e.message),
  );
  bad({ priceInPerM: 1 }, /keys\.DEEPSEEK_API_KEY sets priceInPerM but not priceOutPerM/);
  bad({ priceOutPerM: 1 }, /sets priceOutPerM but not priceInPerM/);
  bad({ priceInPerM: -1, priceOutPerM: 1 }, /keys\.DEEPSEEK_API_KEY\.priceInPerM must be a number/);
  bad({ priceInPerM: 1, priceOutPerM: Number.NaN }, /priceOutPerM must be a number/);
  bad({ priceInPerM: Infinity, priceOutPerM: 1 }, /priceInPerM must be a number/);
  bad({ priceInPerM: '0.006', priceOutPerM: 1 }, /priceInPerM must be a number/);
  bad({ priceInPerM: 1, priceOutPerM: null }, /priceOutPerM must be a number/);
});

test('a Settings row save keeps the two price fields on the row (panel route, scratch home)', async (t) => {
  const home = tmp(t);
  const keysFile = join(home, '.env');
  writeFileSync(keysFile, 'DEEPSEEK_API_KEY=sk-test-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n');
  chmodSync(keysFile, 0o600);
  updateConfig({ keys: { DEEPSEEK_API_KEY: { priceInPerM: 0.006, priceOutPerM: 1.2 } } }, { home });
  const { port, token, close } = await createPanelServer({ port: 0, home, env: {}, sessionsRoot: tmp(t), fetchImpl: async () => { throw new Error('no network'); } });
  t.after(() => close());
  const res = await fetch(`http://127.0.0.1:${port}/api/settings/providers/row`, {
    method: 'POST',
    headers: { 'x-bareloop-token': token, 'content-type': 'application/json' },
    body: JSON.stringify({ envName: 'DEEPSEEK_API_KEY', name: 'deepseek-flash', shape: 'openai-api', baseUrl: DS }),
  });
  assert.equal(res.status, 200);
  const row = readConfig({ home }).config.keys.DEEPSEEK_API_KEY;
  assert.equal(row.priceInPerM, 0.006);
  assert.equal(row.priceOutPerM, 1.2);
  assert.equal(row.name, 'deepseek-flash', 'the save itself still landed');
});
