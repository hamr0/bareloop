// PRD v1.107 Part 6: the Result tab's server side. REAL archived runs as fixtures (tests/fixtures/part5): mve5y8fa (green, waiting at the Accept door; its
// delivered step file is the real one, sha-checked against the spine's destination-written seq 48) and mvdg1xo3 (red, delivered nothing). The routes read
// ONLY the paths the run's own destination-written records name, re-check their sha256, and never take a path from the request.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  copyFileSync, mkdirSync, readFileSync, utimesSync, writeFileSync, rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePart5World } from './part5-world.mjs';
import { createPanelServer } from '../src/panel/server.js';
import { planFromSpec } from '../src/panel/jobplan.js';
import { factPartOf, factSentence } from '../src/facts.js';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'part5');
const STEP = join(FX, 'mve5y8fa.step-1-2026-10-18.json');
const STEP_SHA = 'b4edf688a9109205ec33d6a97c2e917da5b617821fe0ff96e7414e64a5f0b0b6';
const sha = (b) => createHash('sha256').update(b).digest('hex');

/** the part5 world with mve5y8fa's delivered file placed in the scratch dir and its destination-written record pointed there */
async function world() {
  const w = makePart5World();
  const delivered = join(dirname(w.out('mve5y8fa')), 'delivered', 'steps', '1-2026-10-18.json');
  mkdirSync(dirname(delivered), { recursive: true });
  copyFileSync(STEP, delivered);
  const spine = w.spine('mve5y8fa');
  const text = readFileSync(spine, 'utf8');
  const rec = text.split('\n').find((l) => l.includes('"type":"destination-written"'));
  assert.ok(rec, 'the real spine has a destination-written record');
  assert.equal(JSON.parse(rec).sha256, STEP_SHA, 'the fixture step file is the one the real run delivered (seq 48)');
  writeFileSync(spine, text.replace(JSON.parse(rec).path, delivered));
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  for (const id of ['mve5y8fa', 'mvdg1xo3']) utimesSync(w.spine(id), old, old);
  const { port, close } = await createPanelServer({ port: 0, home: w.home, schedulerIntervalMs: 0 });
  test.after(() => close());
  const base = `http://127.0.0.1:${port}`;
  const get = async (p) => { const r = await fetch(`${base}${p}`); const t = await r.text(); let body = t; try { body = JSON.parse(t); } catch { /* text */ } return { status: r.status, body, headers: r.headers, raw: t }; };
  return { ...w, delivered, port, base, get };
}

test('detail: the Result tab shows for a rubric run with a rubric-step stage (red and green alike), and carries the delivered list from the run\'s own record', async () => {
  const w = await world();
  const g = (await w.get('/api/runs/mve5y8fa')).body;
  assert.equal(g.checkType, 'rubric');
  assert.equal(g.hasResult, true);
  assert.equal(g.accept, true, 'waiting at the door');
  assert.deepEqual(g.delivered, [{ path: w.delivered, bytes: 1473, sha256: STEP_SHA }]);
  const r = (await w.get('/api/runs/mvdg1xo3')).body;
  assert.equal(r.hasResult, true, 'a red rubric run has the tab too');
  assert.deepEqual(r.delivered, [], 'a red run delivered nothing');
});

test('detail: no Result tab for a deterministic run, nor for a rubric run whose close has no rubric-step stage', async () => {
  const { keysHome, makeRun, specOf } = await import('./trigger-world.mjs');
  const home = keysHome();
  // makeRun's job-start carries no verdictType (the label would read 'unknown'); real run-u spines carry it
  for (const [runid, files, verdictType] of [['det1', false, 'green'], ['rub1', true, 'soft-green']]) {
    const { spine } = makeRun(home, { runid, spec: specOf({ job: `${runid}-job`, files }), outcome: 'green' });
    writeFileSync(spine, readFileSync(spine, 'utf8').replace('"type":"job-start"', `"type":"job-start","verdictType":"${verdictType}"`));
  }
  const { port, close } = await createPanelServer({ port: 0, home, schedulerIntervalMs: 0 });
  test.after(() => close());
  const p = { get: async (path) => { const r = await fetch(`http://127.0.0.1:${port}${path}`); const t = await r.text(); let body = t; try { body = JSON.parse(t); } catch { /* text */ } return { status: r.status, body }; } };
  const det = (await p.get('/api/runs/det1')).body;
  assert.equal(det.checkType, 'deterministic');
  assert.equal(det.hasResult, false);
  const rub = (await p.get('/api/runs/rub1')).body;
  assert.equal(rub.checkType, 'rubric');
  assert.equal(rub.hasResult, false, 'rubric, but no rubric-step stage');
  assert.equal((await p.get('/api/runs/det1/result')).status, 404);
  assert.equal((await p.get('/api/runs/rub1/result')).status, 404);
});

test('/result (green, mve5y8fa): one row per delivered result, columns are the signed fact names, cells are the file\'s values, ✓ basis is the run\'s own check', async () => {
  const w = await world();
  const res = await w.get('/api/runs/mve5y8fa/result');
  assert.equal(res.status, 200, res.raw);
  const spec = JSON.parse(readFileSync(join(FX, 'mve5y8fa.resolved-spec.json'), 'utf8'));
  const fp = factPartOf(spec.closeDecl.stages[1].params);
  const file = JSON.parse(readFileSync(STEP, 'utf8'));
  const [line] = res.body.lines;
  assert.equal(res.body.lines.length, 1);
  assert.equal(line.n, 1);
  assert.equal(line.text, 'List 3 flights from Boston to Chicago');
  assert.deepEqual(line.rules, ['under $450', 'not a red-eye', 'nonstop']);
  assert.equal(line.kind, 'facts');
  assert.equal(line.passed, true);
  assert.deepEqual(line.facts.map((f) => f.name), fp.facts.map((f) => f.name), 'every column name is a signed fact name');
  assert.deepEqual(line.facts.map((f) => f.kind), ['value', 'value', 'phrase', 'phrase', 'phrase']);
  assert.deepEqual(line.facts.map((f) => f.sentence), fp.facts.map((f) => factSentence(f, fp.source)), 'factSentence is the one owner of fact wording');
  assert.equal(line.rows.length, file.results.length, 'the rows are the delivered file\'s results[]');
  file.results.forEach((r, i) => {
    assert.equal(line.rows[i].quote, r.quote);
    assert.deepEqual(line.rows[i].cells, [r.values.price, r.values['departure time'], 'Nonstop', 'Boston Logan International Airport', "Chicago O'Hare International Airport"]);
  });
  assert.deepEqual(line.file, { i: 0, state: 'ok', words: null });
  assert.equal(res.body.gap, null);
  assert.deepEqual(res.body.delivered, [{ i: 0, path: w.delivered, name: '1-2026-10-18.json', bytes: 1473, state: 'ok', words: null }]);
});

test('/result: the Not checked list is the Job tab\'s own list (planFromSpec(spec).notChecked)', async () => {
  const w = await world();
  const spec = JSON.parse(readFileSync(join(FX, 'mve5y8fa.resolved-spec.json'), 'utf8'));
  const res = (await w.get('/api/runs/mve5y8fa/result')).body;
  assert.deepEqual(res.notChecked, planFromSpec(spec).notChecked);
  assert.ok(res.notChecked.length > 0);
  const job = (await w.get('/api/runs/mve5y8fa/job')).body;
  assert.deepEqual(res.notChecked, job.plan.notChecked, 'the same list the Job tab shows');
});

test('/result (red, mvdg1xo3): no rows and passed false on every line (no ✓ basis), and the check\'s own first gap words', async () => {
  const w = await world();
  const res = (await w.get('/api/runs/mvdg1xo3/result')).body;
  assert.equal(res.lines[0].passed, false);
  assert.equal(res.lines[0].rows, null);
  assert.equal(res.lines[0].file, null);
  assert.deepEqual(res.delivered, []);
  assert.equal(typeof res.gap.line, 'string');
  assert.ok(res.gap.line.length > 0);
  assert.equal(typeof res.gap.more, 'number');
});

test('/result and /download refuse a file that changed or vanished after the run: in words, never stale content', async () => {
  const w = await world();
  writeFileSync(w.delivered, readFileSync(STEP, 'utf8').replace('144', '145'));
  const changed = (await w.get('/api/runs/mve5y8fa/result')).body;
  assert.equal(changed.lines[0].file.state, 'changed');
  assert.equal(changed.lines[0].file.words, 'the saved file changed after the run');
  assert.equal(changed.lines[0].rows, null, 'no content from a file that no longer matches its record');
  assert.equal(JSON.stringify(changed).includes('145'), false);
  const dl = await w.get('/api/runs/mve5y8fa/download?i=0');
  assert.equal(dl.status, 409);
  assert.equal(dl.raw, 'the saved file changed after the run');
  rmSync(w.delivered);
  const gone = (await w.get('/api/runs/mve5y8fa/result')).body;
  assert.equal(gone.lines[0].file.state, 'gone');
  assert.equal(gone.lines[0].file.words, 'the saved file is gone');
  assert.equal((await w.get('/api/runs/mve5y8fa/download?i=0')).raw, 'the saved file is gone');
});

test('/download streams delivered file i as an attachment, byte for byte; the request cannot name a path', async () => {
  const w = await world();
  // a sibling the run never delivered, beside the real one
  writeFileSync(join(dirname(w.delivered), 'secret.txt'), 'not delivered');
  const ok = await fetch(`${w.base}/api/runs/mve5y8fa/download?i=0`);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-disposition'), /^attachment; filename="1-2026-10-18\.json"/);
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
  const buf = Buffer.from(await ok.arrayBuffer());
  assert.equal(sha(buf), STEP_SHA);
  for (const q of ['i=1', 'i=-1', 'i=abc', 'i=0.5', 'i=../delivered/steps/secret.txt', 'i=', '', 'path=/etc/passwd', 'path=secret.txt&i=9', 'file=/etc/passwd']) {
    const r = await w.get(`/api/runs/mve5y8fa/download?${q}`);
    assert.equal(r.status, 404, `?${q}`);
    assert.equal(r.raw.includes('not delivered'), false);
  }
  assert.equal((await w.get('/api/runs/mvdg1xo3/download?i=0')).status, 404, 'a red run delivered nothing');
  assert.equal((await w.get('/api/runs/nosuchrun/download?i=0')).status, 404);
});

test('a destination-written record naming a relative path is not a delivered file', async () => {
  const w = await world();
  const spine = w.spine('mve5y8fa');
  writeFileSync(spine, `${readFileSync(spine, 'utf8')}${JSON.stringify({ type: 'destination-written', path: 'steps/x.json', bytes: 1, sha256: STEP_SHA, seq: 99 })}\n`);
  const d = (await w.get('/api/runs/mve5y8fa')).body.delivered;
  assert.equal(d.length, 1);
  assert.equal((await w.get('/api/runs/mve5y8fa/download?i=1')).status, 404);
});

test('the existing Host guard applies to /result and /download (a foreign Host is refused)', async () => {
  const w = await world();
  for (const path of ['/api/runs/mve5y8fa/result', '/api/runs/mve5y8fa/download?i=0']) {
    const status = await new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: w.port, path, headers: { host: 'evil.example' } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject);
      req.end();
    });
    assert.equal(status, 403, path);
  }
});

test('a line is passed only when the run ended green AND its own check-run said satisfied (read from the spine, never re-decided here)', async () => {
  const w = await world();
  const spine = w.spine('mve5y8fa');
  const orig = readFileSync(spine, 'utf8');
  const passedOf = async () => (await w.get('/api/runs/mve5y8fa/result')).body.lines[0].passed;
  assert.equal(await passedOf(), true);
  writeFileSync(spine, orig.replace('"verdict":"satisfied","seq":38', '"verdict":"needs_revision","seq":38'));
  assert.equal(await passedOf(), false, 'the check-run for this line is not satisfied');
  writeFileSync(spine, orig.replace('"type":"job-end","outcome":"green"', '"type":"job-end","outcome":"step-red"'));
  assert.equal(await passedOf(), false, 'the run did not end green');
});
