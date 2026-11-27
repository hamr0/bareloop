// F399 parity pins, Destination delivery (docs/product/ITEM33-BUILD.md Addendum 2026-11-25d, PARITY CHECKLIST "Destination delivery").
// The writers (src/source.js copyOut / landStagedReport, then the door's `destination-written` record in src/userrun.js) are driven for real in a scratch folder; the records those writers emit are
// ASSEMBLED here exactly as userrun.js emits them (path, declared, bytes, sha256, staged), because the full door needs a repo + worktree (tests/review-accept-report.test.js drives that whole path).
// Expected values are the files on disk (size and sha256 recomputed), never the reader's own answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { copyOut, landStagedReport } from '../src/source.js';
import { outputOf } from '../src/runread.js';
import { getRunDownload, RESULT_FILE_GONE, RESULT_FILE_CHANGED } from '../src/panel/server.js';
import { realWorld, plantDelivered } from './f399-raw.mjs';

const sha = (/** @type {Buffer} */ b) => createHash('sha256').update(b).digest('hex');
const tmp = () => mkdtempSync(join(tmpdir(), 'f399dest-'));

test('destination-delivered-parity: files land as name-DATE.ext, a same-day second delivery as -2, never over the first; each record\'s path, bytes and sha256 are the file on disk and the reader returns them as delivered (real copyOut twice)', async () => {
  const root = tmp();
  const outside = tmp();
  try {
    const dest = join(outside, 'out');
    const deliver = async (/** @type {string} */ body) => {
      const tree = join(root, `tree-${body}`);
      mkdirSync(join(tree, 'output', 'steps'), { recursive: true });
      writeFileSync(join(tree, 'output', 'steps', '1.json'), body);
      const r = await copyOut({ tree, into: root, destination: dest });
      assert.equal(r.stop, null, JSON.stringify(r));
      return /** @type {any} */ (r).files;
    };
    const [a] = await deliver('{"text":"one"}');
    const [b] = await deliver('{"text":"second run"}');
    assert.match(basename(a.path), /^1-\d{4}-\d{2}-\d{2}\.json$/);
    assert.equal(basename(b.path), basename(a.path).replace('.json', '-2.json'));
    assert.equal(readFileSync(a.path, 'utf8'), '{"text":"one"}', 'the first file is never overwritten');
    for (const f of [a, b]) {
      assert.equal(f.bytes, statSync(f.path).size);
      assert.equal(f.sha256, sha(readFileSync(f.path)));
    }
    const recs = [{ type: 'job-start' }, ...[a, b].map((f) => ({ type: 'destination-written', path: f.path, declared: dest, bytes: f.bytes, sha256: f.sha256 })), { type: 'job-end', outcome: 'green' }];
    const o = outputOf(recs, null, { read: true });
    assert.deepEqual(o?.files.map((f) => [f.role, f.path, f.bytes, f.sha256, f.state]), [a, b].map((f) => ['delivered', f.path, f.bytes, f.sha256, 'ok']));
    assert.equal(o?.kind, 'files');
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test('download-route-state-parity: the download serves file i only while its sha256 still matches the record; changed, gone or an unknown index it refuses with the code-owned reason (real mv5e1ktb records, files planted)', () => {
  const d = tmp();
  try {
    const bodies = ['{"text":"one","cites":{}}', '{"text":"two","cites":{}}'];
    const w = realWorld({ fixture: 'f399/mv5e1ktb', id: 'mv5e1ktb', job: 'j', mutate: (r) => plantDelivered(r, d, bodies) });
    const ok = /** @type {any} */ (getRunDownload('mv5e1ktb', '0', w.opts));
    assert.equal(ok.ok, true);
    assert.equal(ok.buf.toString('utf8'), bodies[0]);
    assert.match(ok.name, /^1-2026-10-12\.json$/);
    writeFileSync(join(d, '1', '1-2026-10-12.json'), 'edited after the run');
    const changed = /** @type {any} */ (getRunDownload('mv5e1ktb', '0', w.opts));
    assert.deepEqual([changed.ok, changed.code, changed.error], [false, 409, RESULT_FILE_CHANGED]);
    rmSync(join(d, '2', '2-2026-10-12.json'));
    const gone = /** @type {any} */ (getRunDownload('mv5e1ktb', '1', w.opts));
    assert.deepEqual([gone.ok, gone.code, gone.error], [false, 409, RESULT_FILE_GONE]);
    const unknown = /** @type {any} */ (getRunDownload('mv5e1ktb', '7', w.opts));
    assert.deepEqual([unknown.ok, unknown.code], [false, 404]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('door-accept-landing-parity: an Accept lands the staged report at Destination (landStagedReport) and its destination-written record carries `staged`; the reader then holds ONE delivered file, the staged name replaced (real landStagedReport; records assembled as userrun.js emits them)', async () => {
  const tree = tmp();
  try {
    mkdirSync(join(tree, 'output'), { recursive: true });
    mkdirSync(join(tree, 'docs'));
    const stagedPath = join(tree, 'output', 'review.md');
    const body = '# review\n\nPassed\n';
    writeFileSync(stagedPath, body);
    const staged = { type: 'report-staged', path: stagedPath, bytes: Buffer.byteLength(body), sha256: sha(Buffer.from(body)) };
    const before = outputOf([{ type: 'job-start' }, staged, { type: 'job-end', outcome: 'green' }], null);
    assert.deepEqual(before?.files.map((f) => [f.role, f.path]), [['staged', stagedPath]]);
    const land = /** @type {any} */ (await landStagedReport({ tree, destination: 'docs/', staged: stagedPath }));
    assert.equal(land.stop, null, JSON.stringify(land));
    assert.equal(land.file.bytes, Buffer.byteLength(body));
    assert.equal(land.file.sha256, sha(readFileSync(land.file.path)));
    const after = outputOf([{ type: 'job-start' }, staged, { type: 'job-end', outcome: 'green' }, { type: 'destination-written', path: land.file.path, declared: 'docs/', bytes: land.file.bytes, sha256: land.file.sha256, staged: stagedPath }], null, { read: true });
    assert.deepEqual(after?.files.map((f) => [f.role, f.path, f.state]), [['delivered', land.file.path, 'ok']]);
    assert.equal(after?.files[0].content?.toString('utf8'), body);
  } finally { rmSync(tree, { recursive: true, force: true }); }
});
