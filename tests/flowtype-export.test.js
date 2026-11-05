// ITEM33-BUILD piece 8 (hamr's ruling 2026-11-02): no export for a job with `mcp`. The REAL archived green repo job (tests/fixtures/export-run/smuqqw9x266au, run muqrenrf) is copied
// into a scratch home; the control run exports; the same run re-signed WITH an MCP block (the spec, the spine and the saved plan all carry the new hash, so every other export check
// still passes) is refused in plain words by the list, by `exportRun` and by the CLI. $0.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendRun } from '../src/runlist.js';
import { listGreenRuns, exportRun } from '../src/runexport.js';
import { jobSpecHash } from '../src/job.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'export-run');

function scratch(t, withMcp) {
  const root = mkdtempSync(join(tmpdir(), 'flow-export-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sess = join(root, 'panel-sessions', 'smuqqw9x266au');
  cpSync(join(FIX, 'smuqqw9x266au'), sess, { recursive: true });
  if (withMcp) {
    const specFile = join(sess, 'resolved-spec.json');
    const spec = JSON.parse(readFileSync(specFile, 'utf8'));
    const next = { ...spec, flowType: 'mcp', mcp: { server: 'github', tools: ['issue_read', 'list_issues'] } };
    const [from, to] = [jobSpecHash(spec), jobSpecHash(next)];
    writeFileSync(specFile, `${JSON.stringify(next)}\n`);
    const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
    for (const f of walk(sess)) {
      const text = readFileSync(f, 'utf8');
      if (text.includes(from)) writeFileSync(f, text.split(from).join(to));
    }
  }
  const home = join(root, 'home');
  appendRun({ at: '2026-10-02T09:27:14.379Z', runid: 'muqrenrf', job: 'fix-slugify', spine: join(sess, 'source-seed', 'fix-slugify-bareloop', 'u-muqrenrf.jsonl'), patient: join(sess, 'source-seed', 'tree'), via: 'run-u' }, { home });
  return { root, home };
}

test('CONTROL: the same green repo job with no MCP is listed and exports', (t) => {
  const s = scratch(t, false);
  assert.deepEqual(listGreenRuns({ home: s.home }).map((r) => r.name), ['fix-slugify (run-1)']);
  const r = exportRun({ name: 'fix-slugify (run-1)', outDir: join(s.root, 'out'), home: s.home, bareloopVersion: '0.0.0-test' });
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('a green repo job that signed an MCP is not listed and export refuses it in plain words, naming the server', (t) => {
  const s = scratch(t, true);
  assert.deepEqual(listGreenRuns({ home: s.home }), [], 'export lists only exportable runs');
  const r = exportRun({ name: 'fix-slugify (run-1)', outDir: join(s.root, 'out'), home: s.home, bareloopVersion: '0.0.0-test' });
  assert.equal(r.ok, false);
  assert.equal(r.why, '"fix-slugify (run-1)" uses an MCP (github), and a job that uses an MCP cannot be exported');
  assert.equal(readdirSync(s.root).includes('out'), false, 'nothing was written');
});
