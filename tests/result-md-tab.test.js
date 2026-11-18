// MD3 (docs/product/ITEM33-BUILD.md "Addendum 2026-11-18 (c)"): the Result tab's top-card `Saved` row for the plain .md beside a delivered step file, and `download?view=1`.
// REAL archived run mve5y8fa (tests/fixtures/part5) with its delivered step file, plus the .md the delivery now writes beside it and a second `destination-written` record for it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFileSync, mkdirSync, readFileSync, utimesSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePart5World } from './part5-world.mjs';
import { createPanelServer, RESULT_FILE_GONE, RESULT_FILE_CHANGED, RESULT_MD_RENAMED } from '../src/panel/server.js';
import { renderStepMd } from '../src/resultmd.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const STEP = join(HERE, 'fixtures', 'part5', 'mve5y8fa.step-1-2026-10-18.json');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const PAGE = readFileSync(join(HERE, '..', 'src', 'panel', 'index.html'), 'utf8');

/** the part5 world, the delivered json and (unless `md` is false) its .md written and recorded */
async function world({ md = true, pairedTaken = null } = {}) {
  const w = makePart5World();
  const dir = join(dirname(w.out('mve5y8fa')), 'delivered', 'steps');
  mkdirSync(dir, { recursive: true });
  const json = join(dir, '1-2026-10-18.json');
  copyFileSync(STEP, json);
  const spine = w.spine('mve5y8fa');
  const text = readFileSync(spine, 'utf8');
  const rec = JSON.parse(text.split('\n').find((l) => l.includes('"type":"destination-written"')));
  let out = text.replace(rec.path, json);
  const mdPath = join(dir, '1-2026-10-18.md');
  const body = renderStepMd(JSON.parse(readFileSync(STEP, 'utf8')));
  if (md) {
    writeFileSync(mdPath, body);
    out += `${JSON.stringify({ type: 'destination-written', path: mdPath, declared: dir, bytes: Buffer.byteLength(body), sha256: sha(Buffer.from(body)), seq: 98, ...(pairedTaken ? { pairedTaken } : {}) })}\n`;
  }
  writeFileSync(spine, out);
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  for (const id of ['mve5y8fa', 'mvdg1xo3']) utimesSync(w.spine(id), old, old);
  const { port, close } = await createPanelServer({ port: 0, home: w.home, schedulerIntervalMs: 0 });
  test.after(() => close());
  const base = `http://127.0.0.1:${port}`;
  const get = async (p) => { const r = await fetch(`${base}${p}`); const t = await r.text(); let b = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b, headers: r.headers, raw: t }; };
  return { ...w, json, mdPath, body, base, get };
}

test('payload: the delivered .md is listed with its index into the delivered list, its name and state ok; the bottom list still holds both files', async () => {
  const w = await world();
  const r = (await w.get('/api/runs/mve5y8fa/result')).body;
  assert.deepEqual(r.md, [{ i: 1, name: '1-2026-10-18.md', state: 'ok', words: null }]);
  assert.equal(r.delivered.length, 2);
  assert.deepEqual(r.delivered.map((d) => d.name), ['1-2026-10-18.json', '1-2026-10-18.md']);
});

test('payload: a .md saved under a new name carries code\'s note naming the paired name it could not take; one that got its own name carries none; the page types no words', async () => {
  const w = await world({ pairedTaken: '1-2026-10-18.md' });
  const r = (await w.get('/api/runs/mve5y8fa/result')).body;
  assert.equal(r.md[0].note, RESULT_MD_RENAMED('1-2026-10-18.md'));
  assert.equal(r.md[0].note, 'saved under a new name because 1-2026-10-18.md was already taken');
  const plain = (await (await world()).get('/api/runs/mve5y8fa/result')).body;
  assert.equal('note' in plain.md[0], false);
  assert.match(PAGE, /m\.note/);
  assert.doesNotMatch(PAGE, /already taken/);
});

test('payload: a deleted .md reads gone and an edited one reads changed, with code\'s own words', async () => {
  const w = await world();
  writeFileSync(w.mdPath, `${w.body} edited`);
  let r = (await w.get('/api/runs/mve5y8fa/result')).body;
  assert.deepEqual([r.md[0].state, r.md[0].words], ['changed', RESULT_FILE_CHANGED]);
  rmSync(w.mdPath);
  r = (await w.get('/api/runs/mve5y8fa/result')).body;
  assert.deepEqual([r.md[0].state, r.md[0].words], ['gone', RESULT_FILE_GONE]);
});

test('payload: a red run (nothing delivered) and an old run (no .md delivered) carry no md key and the tab still answers', async () => {
  const w = await world();
  const red = await w.get('/api/runs/mvdg1xo3/result');
  assert.equal(red.status, 200);
  assert.equal('md' in red.body, false);
  const old = await world({ md: false });
  const r = await old.get('/api/runs/mve5y8fa/result');
  assert.equal(r.status, 200);
  assert.equal('md' in r.body, false);
  assert.equal(r.body.delivered.length, 1);
});

test('download?view=1: a .md opens inline as text/plain with nosniff; without view=1 it is an attachment as before; a .json is an attachment even with view=1; the request never names a path', async () => {
  const w = await world();
  const v = await fetch(`${w.base}/api/runs/mve5y8fa/download?i=1&view=1`);
  assert.equal(v.status, 200);
  assert.match(v.headers.get('content-disposition'), /^inline/);
  assert.match(v.headers.get('content-type'), /^text\/plain/);
  assert.equal(v.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(Buffer.from(await v.arrayBuffer()).toString('utf8'), w.body);
  const a = await fetch(`${w.base}/api/runs/mve5y8fa/download?i=1`);
  assert.match(a.headers.get('content-disposition'), /^attachment; filename="1-2026-10-18\.md"/);
  const j = await fetch(`${w.base}/api/runs/mve5y8fa/download?i=0&view=1`);
  assert.match(j.headers.get('content-disposition'), /^attachment/);
  const ign = await w.get('/api/runs/mve5y8fa/download?i=1&view=1&path=/etc/passwd');
  assert.equal(ign.raw, w.body, 'a path in the request is ignored: the record\'s file is served');
  for (const q of ['i=../x&view=1', 'i=9&view=1', 'path=/etc/passwd&view=1']) assert.equal((await w.get(`/api/runs/mve5y8fa/download?${q}`)).status, 404, q);
  rmSync(w.mdPath);
  assert.equal((await w.get('/api/runs/mve5y8fa/download?i=1&view=1')).status, 409, 'a gone file is a state in words, never content');
});

test('page: the top card draws a Saved row from data.md linking download?view=1; the page types none of the gone/changed words and builds no path', () => {
  const f = PAGE.slice(PAGE.indexOf('function renderResult()'), PAGE.indexOf('function paintResultBody'));
  assert.ok(f.indexOf('data.md') > f.indexOf('result-head') && f.indexOf('data.md') < f.indexOf('resultLineCard(line'), 'the row is in the top card, before the line cards');
  assert.match(f, /view=1/);
  assert.match(f, /data-testid="result-md/);
  assert.equal(/saved file (is gone|changed)/.test(PAGE), false, 'the page types none of code\'s words');
  assert.equal([...PAGE.matchAll(/result-file-gone/g)].length, 1, 'the bottom Saved card keeps its one gone marker');
});
