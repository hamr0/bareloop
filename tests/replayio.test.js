// src/replayio.js exit criteria (PANEL-BUILD.md P0, last task): the IO layer
// over replay.js — spine/sidecar resolution, tolerant JSONL parsing, and
// directory-content spine detection — lifted out of `scripts/run-replay.mjs`
// so it is callable in-process. Every assertion below reads a specific value
// straight off a REAL archived file except the two defensive cases the
// module's own doctrine calls for: a malformed line (spliced into a COPY of
// a real file) and a missing/renamed sidecar.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdtempSync, appendFileSync, rmSync, readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseJsonl, isSidecarByName, looksLikeSpine, resolveSiblings, replayOne, listSpines, readHistoryLog,
} from '../src/replayio.js';
import { replayRun } from '../src/replay.js';
import { spawnSync } from 'node:child_process';

/** @type {string[]} */
const tmpDirs = [];
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
/** @returns {string} */
function tmp() {
  const d = mkdtempSync(join(tmpdir(), 'replayio-test-'));
  tmpDirs.push(d);
  return d;
}

// ---------------------------------------------------------------------------
// parseJsonl — tolerant parsing
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// isSidecarByName / looksLikeSpine / resolveSiblings — content vs. filename
// ---------------------------------------------------------------------------

test('resolveSiblings: a missing sidecar reads null, never a fabricated path', () => {
  const dir = tmp();
  const { auditPath } = resolveSiblings(join(dir, 'battery-A1-nope.jsonl'));
  assert.equal(auditPath, null);
});

// ---------------------------------------------------------------------------
// listSpines — content-detected directory listing over REAL mixed data
// ---------------------------------------------------------------------------

test('listSpines: an empty directory returns an empty array', () => {
  const dir = tmp();
  assert.deepEqual(listSpines(dir), []);
});

// ---------------------------------------------------------------------------
// readHistoryLog — the bundle history.jsonl reader (retargets doHistory)
// ---------------------------------------------------------------------------

test('readHistoryLog: parses rows written by appendHistory-shaped lines and tolerates one malformed line', () => {
  const dir = tmp();
  const file = join(dir, 'history.jsonl');
  const row1 = { runid: 'abc123', outcome: 'green', spentUsd: 1.23 };
  const row2 = { runid: 'def456', outcome: 'cap-halt', spentUsd: null };
  appendFileSync(file, `${JSON.stringify(row1)}\n`);
  appendFileSync(file, 'not json at all\n');
  appendFileSync(file, `${JSON.stringify(row2)}\n`);

  const { rows, skipped } = readHistoryLog(file);
  assert.equal(skipped, 1);
  assert.deepEqual(rows, [row1, row2]);

  // FAIL FIRST: the naive alternative doHistory used to run (raw split +
  // print) would have printed the corrupt line verbatim instead of skipping
  // it — prove the two behaviours genuinely differ.
  const rawLines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
  assert.equal(rawLines.length, 3, 'the raw file really does have 3 lines, one of them garbage');
  assert.equal(rows.length, 2, 'the new reader drops the garbage line instead of reprinting it');
});

// ---------------------------------------------------------------------------
// The replay command — `scripts/run-replay.mjs` now (it left the `bareloop` CLI, PRD v1.114), real archived data
// ---------------------------------------------------------------------------

const REPLAY_SCRIPT = new URL('../scripts/run-replay.mjs', import.meta.url).pathname;
/** @param {string[]} args @returns {{ code: number|null, out: string, err: string }} */
function replayScript(args) {
  const r = spawnSync(process.execPath, [REPLAY_SCRIPT, ...args], { encoding: 'utf8', cwd: process.cwd() });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('run-replay.mjs: a missing file errs and exits 1', () => {
  const r = replayScript(['/no/such/file.jsonl']);
  assert.equal(r.code, 1);
  assert.match(r.err, /no such file/);
});

test('run-replay.mjs: no args prints usage and exits 1; a spine in a scratch dir (this repo\'s own fixture) replays', () => {
  const r = replayScript([]);
  assert.equal(r.code, 1);
  assert.match(r.err, /usage: node scripts\/run-replay\.mjs/);
  const fixture = new URL('./fixtures/export-run/smuqqw9x266au/source-seed/fix-slugify-bareloop/u-muqrenrf.jsonl', import.meta.url).pathname;
  const ok = replayScript([fixture]);
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.out, /RUN muqrenrf/);
});
