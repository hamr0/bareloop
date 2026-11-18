// lastPlaceRead: the "(was X)" value comes from the newest earlier run of the SAME job with the same workflowKey, never from the run itself or another job.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { lastPlaceRead, PLACE_EVENT } from '../src/placerule.js';

const dir = mkdtempSync(join(tmpdir(), 'place-lastread-'));
const spine = (/** @type {string} */ name, /** @type {string} */ value, workflowKey = 'wk') => {
  const p = join(dir, `${name}.jsonl`);
  writeFileSync(p, `${JSON.stringify({ type: PLACE_EVENT, workflowKey, rows: [{ key: 'v', found: true, value }, { key: 'gone', found: false }] })}\n`);
  return p;
};

test('last read: skips the run itself and other jobs, reads the newest earlier run of this job', () => {
  const rows = [
    { runid: 'a', job: 'j', spine: spine('a', '1.0.0') },
    { runid: 'b', job: 'other', spine: spine('b', '9.9.9') },
    { runid: 'self', job: 'j', spine: spine('self', '7.7.7') },
  ];
  assert.deepEqual(lastPlaceRead({ rows, job: 'j', workflowKey: 'wk', runid: 'self' }), { v: '1.0.0' });
  assert.deepEqual(lastPlaceRead({ rows, job: 'j', workflowKey: 'other-key', runid: 'self' }), {});
  rmSync(dir, { recursive: true, force: true });
});
